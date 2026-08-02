"use strict";

const crypto=require("crypto");
const {loadDotEnv,readConfig}=require("./config.js");
const {createNodeExchangeClock}=require("./clock.js");
const {createSupabaseLogger}=require("./supabase-client.js");
const {createBinanceDataSource}=require("./binance-data-source.js");
const {createLoggerRunner,installProcessShutdown}=require("./logger-runner.js");
const calculation=require("../features/pressure-signal/sssc/calculation.js");
const {createOrchestration}=require("../features/pressure-signal/sssc/orchestration.js");
const {buildSignalBSnapshotRow,SNAPSHOT_INTERVAL_MS,TABLE}=require("../features/pressure-signal/engines/signal-b-snapshot-assembler.js");
const {loadSignalBEngine}=require("./signal-b-engine-loader.js");
const {createMarketFreshnessTracker}=require("./run-sssc.js");

const SYMBOL="BTCUSDT",HORIZON_ID="quick",DIRECTION_MODE="AUTO";

function digest(value){return crypto.createHash("sha256").update(String(value||"")).digest("hex").slice(0,16);}

function candleRevision(row){
  return row?[row.time,row.open,row.high,row.low,row.close,row.volume,row.quoteVolume,row.tradeCount,row.takerBuyBase,row.takerBuyQuote,row.final===true?1:0].join(":"):"none";
}

function marketRevision(state){
  const closed=state&&state.privateCandlesByTf||{},forming=state&&state.privateFormingByTf||{};
  return Object.keys({...closed,...forming}).sort().map(tf=>`${tf}:${candleRevision(closed[tf]&&closed[tf].at(-1))}:${candleRevision(forming[tf])}`).join("|");
}

function scoreRevision(row){
  return JSON.stringify({direction:row.direction,entryState:row.entry_state,confidence:row.confidence,setupScore:row.setup_score,
    triggerScore:row.trigger_score,currentEntryScore:row.current_entry_score,readinessScore:row.readiness_score,
    finalStateReason:row.final_state_reason,hardGates:row.hard_gates,flowEffectiveness:row.flow_effectiveness});
}

function candleTrace(row){
  if(!row)return null;
  return {time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume,quoteVolume:row.quoteVolume,
    tradeCount:row.tradeCount,takerBuyBase:row.takerBuyBase,takerBuyQuote:row.takerBuyQuote,final:row.final!==false};
}

function traceEvaluationInputs(engine,snapshot){
  const facts=engine.extractFacts(snapshot,HORIZON_ID,DIRECTION_MODE),setup=facts.setup||null,trigger=facts.trigger||{},permission=facts.directionalPermission||{};
  return {
    closedTails:Object.fromEntries(["1m","3m","5m","15m","1h","4h","1d"].map(tf=>[tf,(snapshot.closedByTf[tf]||[]).slice(-2).map(candleTrace)])),
    direction:{selected:permission.direction||null,score:permission.score??null,longScore:permission.longScore??null,shortScore:permission.shortScore??null,breakdown:permission.breakdown||null},
    setup:setup?{identity:setup.identity||null,family:setup.family||null,tf:setup.tf||null,level:setup.level??null,zone:setup.zone||null,
      interactionTime:setup.interactionTime??null,interacted:setup.interacted===true,reactionConfirmed:setup.reactionConfirmed===true,
      invalidated:setup.invalidated===true,repeatedTests:setup.repeatedTests??null,quality:setup.quality??null,distanceAtr:setup.distanceAtr??null}:null,
    setupCandidateCount:(facts.setupCandidates||[]).length,setupCandidates:(facts.setupCandidates||[]).slice(0,5),setupComponents:facts.setupComponents||null,
    trigger:{microstructureShift:trigger.microstructureShift===true,shiftTime:trigger.shiftTime??null,breakLevel:trigger.breakLevel??null,
      displacementQuality:trigger.displacementQuality??null,retestHeld:trigger.retestHeld===true,qualifiedFollowThrough:trigger.qualifiedFollowThrough===true,
      freshnessCandles:Number.isFinite(trigger.freshnessCandles)?trigger.freshnessCandles:null,eventWindow:trigger.eventWindow||null,
      flow:trigger.flow||null,participation:trigger.participation||null},
    volatility:facts.volatility||null,geometry:facts.geometry||null,current:facts.current||null,readinessSignals:facts.readinessSignals||null
  };
}

function signalSnapshot(state,clock,generation){
  const closed=state&&state.privateCandlesByTf||{},forming=state&&state.privateFormingByTf||{};
  const closedByTf=Object.fromEntries(Object.entries(closed).map(([tf,rows])=>[tf,(rows||[]).map(row=>({...row,final:true}))]));
  const rowsByTf=Object.fromEntries(Object.keys(closedByTf).map(tf=>[tf,forming[tf]?[...closedByTf[tf],{...forming[tf],final:false}]:closedByTf[tf].slice()]));
  const current=rowsByTf["1m"]&&rowsByTf["1m"].at(-1);
  return {symbol:SYMBOL,horizonId:HORIZON_ID,createdAt:clock.now(),version:generation,
    signature:Object.keys(rowsByTf).sort().map(tf=>`${tf}:${candleRevision(closedByTf[tf]&&closedByTf[tf].at(-1))}:${candleRevision(rowsByTf[tf]&&rowsByTf[tf].at(-1))}`).join("|"),
    currentPrice:current&&Number(current.close),closedByTf,rowsByTf,maByTf:{},structureByTf:{},
    freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};
}

function buildSigBRunner(options={}){
  const config=options.config,clock=options.clock,supabase=options.supabase,dataSource=options.dataSource;
  const engine=options.engine||loadSignalBEngine(),traceEngine=options.traceEngine||loadSignalBEngine();
  const freshness=createMarketFreshnessTracker({now:clock.now,staleAfterMs:90000});
  const slots=config.maPeriods.map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
  let latestState=null,generation=0,timer=null,writing=false,onUpdateCount=0,marketChangeCount=0;
  let lastMarketRevision="",lastMarketChangeAt=0,lastInputDigest="",lastScoreDigest="";
  const pipeline=createOrchestration({getSlots:()=>slots,getCalculation:()=>calculation,getSymbol:()=>SYMBOL,
    fetchKlines:dataSource.fetchKlines,connectWebSocket:dataSource.connectWebSocket,getWsUrl:()=>config.binanceWsUrl,now:clock.now,
    closedCandleLagGuard:true,
    onUpdate:state=>{
      latestState=state;onUpdateCount+=1;freshness.observe(state);
      const revision=marketRevision(state);
      if(revision&&revision!==lastMarketRevision){lastMarketRevision=revision;marketChangeCount+=1;lastMarketChangeAt=clock.now();}
    },warn:(message,error)=>(options.warn||console.warn)(`[Headless Sig B] ${message}`,error)});
  async function capture(){
    if(writing)return false;
    const status=freshness.status();
    const continuity=pipeline.getSnapshot().continuity;
    if(!latestState||!status.fresh||continuity.blocked||continuity.repairing){
      (options.warn||console.warn)("[Headless Sig B] stale or repairing data detected, skipping snapshot write",{freshness:status,continuity});return false;
    }
    writing=true;
    try{
      const publicationGeneration=++generation,snapshot=signalSnapshot(latestState,clock,publicationGeneration);
      const inputDigest=digest(snapshot.signature),sameInputAsPrevious=inputDigest===lastInputDigest;
      const before=engine.diagnostics(),beforeCalculations=before.calculations,beforeCacheHits=before.cacheHits;
      const output=engine.evaluate({snapshot,horizonId:HORIZON_ID,directionMode:DIRECTION_MODE,publicationGeneration});
      output.engineId="B";output.engineVersion=output.engineVersion||engine.version;
      const row=buildSignalBSnapshotRow({evaluation:{output,symbol:SYMBOL,horizonId:HORIZON_ID,publicationGeneration},machineId:config.machineId,now:clock.now});
      const scoreDigest=digest(scoreRevision(row)),sameScoresAsPrevious=scoreDigest===lastScoreDigest,after=engine.diagnostics();
      const evaluationInputs=traceEvaluationInputs(traceEngine,snapshot),comparison=output.comparisonDiagnostics||{};
      await supabase.log(TABLE,row);
      const captureDiagnostics={
        publicationGeneration,onUpdateCount,marketChangeCount,lastMarketChangeAt:lastMarketChangeAt?new Date(lastMarketChangeAt).toISOString():null,
        marketChangeAgeMs:lastMarketChangeAt?Math.max(0,clock.now()-lastMarketChangeAt):null,
        inputDigest,sameInputAsPrevious,currentPrice:snapshot.currentPrice,
        closedDepths:Object.fromEntries(Object.entries(snapshot.closedByTf).map(([tf,rows])=>[tf,rows.length])),
        forming:Object.fromEntries(["1m","3m","5m"].map(tf=>[tf,candleRevision(latestState.privateFormingByTf&&latestState.privateFormingByTf[tf])])),
        engineRecomputed:after.calculations>beforeCalculations,engineCacheHit:after.cacheHits>beforeCacheHits,
        scoreDigest,sameScoresAsPrevious,entryState:row.entry_state,confidence:row.confidence,setupScore:row.setup_score,
        triggerScore:row.trigger_score,currentEntryScore:row.current_entry_score,readinessScore:row.readiness_score,
        scoreInputs:{setupBreakdown:comparison.setupBreakdown||null,triggerBreakdown:comparison.triggerBreakdown||null,
          currentEntryBreakdown:comparison.currentEntryBreakdown||null,readinessBreakdown:comparison.readinessBreakdown||null,evaluationInputs},
        continuity:latestState.continuity?{blocked:latestState.continuity.blocked,repairing:latestState.continuity.repairing,
          queuedMessages:latestState.continuity.queuedMessages,repairAttempts:latestState.continuity.repairAttempts,
          repairSuccesses:latestState.continuity.repairSuccesses,repairFailures:latestState.continuity.repairFailures,
          lastSocketEvent:(latestState.continuity.socketEvents||[]).at(-1)||null}:null
      };
      (options.log||console.log)(`[Headless Sig B] capture diagnostics ${JSON.stringify(captureDiagnostics)}`);
      lastInputDigest=inputDigest;lastScoreDigest=scoreDigest;return true;
    }catch(error){(options.warn||console.warn)("[Headless Sig B] snapshot write failed",error);return false;}
    finally{writing=false;}
  }
  const component={async start(){pipeline.startLive();timer=setInterval(()=>capture(),SNAPSHOT_INTERVAL_MS);},
    stop(){if(timer!=null)clearInterval(timer);timer=null;pipeline.stop();},capture};
  return createLoggerRunner({component,dataSource});
}

async function main(){
  loadDotEnv();const source=readConfig(),config=Object.freeze({...source,symbol:SYMBOL,machineId:"vm-btc-sig-logger"});
  const clock=createNodeExchangeClock({baseUrl:config.binanceRestUrl});await clock.ensureSynchronized({attempts:4,baseDelayMs:300});
  const supabase=createSupabaseLogger({url:config.supabaseUrl,key:config.supabaseAnonKey,machineId:config.machineId});
  const dataSource=createBinanceDataSource({restUrl:config.binanceRestUrl});const runner=buildSigBRunner({config,clock,supabase,dataSource});
  installProcessShutdown(runner);await runner.start();console.log(`[Headless Sig B] Running ${SYMBOL}/${HORIZON_ID}/${DIRECTION_MODE} as ${config.machineId}.`);
}

module.exports={SYMBOL,HORIZON_ID,DIRECTION_MODE,digest,candleRevision,marketRevision,scoreRevision,candleTrace,traceEvaluationInputs,signalSnapshot,buildSigBRunner,main};
if(require.main===module)main().catch(error=>{console.error("[Headless Sig B] Startup failed:",error);process.exitCode=1;});
