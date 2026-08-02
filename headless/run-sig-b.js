"use strict";

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

function signalSnapshot(state,clock,generation){
  const closed=state&&state.privateCandlesByTf||{},forming=state&&state.privateFormingByTf||{};
  const closedByTf=Object.fromEntries(Object.entries(closed).map(([tf,rows])=>[tf,(rows||[]).map(row=>({...row,final:true}))]));
  const rowsByTf=Object.fromEntries(Object.keys(closedByTf).map(tf=>[tf,forming[tf]?[...closedByTf[tf],{...forming[tf],final:false}]:closedByTf[tf].slice()]));
  const current=rowsByTf["1m"]&&rowsByTf["1m"].at(-1);
  const rowRevision=row=>row?[row.time,row.open,row.high,row.low,row.close,row.volume,row.quoteVolume,row.tradeCount,row.takerBuyBase,row.takerBuyQuote,row.final===true?1:0].join(":"):"none";
  return {symbol:SYMBOL,horizonId:HORIZON_ID,createdAt:clock.now(),version:generation,
    signature:Object.keys(rowsByTf).sort().map(tf=>`${tf}:${rowRevision(closedByTf[tf]&&closedByTf[tf].at(-1))}:${rowRevision(rowsByTf[tf]&&rowsByTf[tf].at(-1))}`).join("|"),
    currentPrice:current&&Number(current.close),closedByTf,rowsByTf,maByTf:{},structureByTf:{},
    freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};
}

function buildSigBRunner(options={}){
  const config=options.config,clock=options.clock,supabase=options.supabase,dataSource=options.dataSource;
  const engine=options.engine||loadSignalBEngine(),freshness=createMarketFreshnessTracker({now:clock.now,staleAfterMs:90000});
  const slots=config.maPeriods.map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
  let latestState=null,generation=0,timer=null,writing=false;
  const pipeline=createOrchestration({getSlots:()=>slots,getCalculation:()=>calculation,getSymbol:()=>SYMBOL,
    fetchKlines:dataSource.fetchKlines,connectWebSocket:dataSource.connectWebSocket,getWsUrl:()=>config.binanceWsUrl,now:clock.now,
    onUpdate:state=>{latestState=state;freshness.observe(state);},warn:(message,error)=>(options.warn||console.warn)(`[Headless Sig B] ${message}`,error)});
  async function capture(){
    if(writing)return false;
    const status=freshness.status();
    if(!latestState||!status.fresh){(options.warn||console.warn)("[Headless Sig B] stale data detected, skipping snapshot write",status);return false;}
    writing=true;
    try{
      const publicationGeneration=++generation,snapshot=signalSnapshot(latestState,clock,publicationGeneration);
      const output=engine.evaluate({snapshot,horizonId:HORIZON_ID,directionMode:DIRECTION_MODE,publicationGeneration});
      output.engineId="B";output.engineVersion=output.engineVersion||engine.version;
      const row=buildSignalBSnapshotRow({evaluation:{output,symbol:SYMBOL,horizonId:HORIZON_ID,publicationGeneration},machineId:config.machineId,now:clock.now});
      await supabase.log(TABLE,row);return true;
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

module.exports={SYMBOL,HORIZON_ID,DIRECTION_MODE,signalSnapshot,buildSigBRunner,main};
if(require.main===module)main().catch(error=>{console.error("[Headless Sig B] Startup failed:",error);process.exitCode=1;});
