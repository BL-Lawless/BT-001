"use strict";

const {loadDotEnv,readConfig}=require("./config.js");
const {createNodeExchangeClock}=require("./clock.js");
const {createSupabaseLogger}=require("./supabase-client.js");
const {createBinanceDataSource}=require("./binance-data-source.js");
const {createLoggerRunner,installProcessShutdown}=require("./logger-runner.js");
const calculation=require("../features/pressure-signal/sssc/calculation.js");
const {createOrchestration}=require("../features/pressure-signal/sssc/orchestration.js");
const {createSnapshotLogger}=require("../features/pressure-signal/sssc/core/snapshot-logger.js");
const {createSignalTransitionTracker}=require("../features/pressure-signal/sssc/core/signal-transition.js");
const {createFuturesMarketContextLogger}=require("./futures-market-context-logger.js");
const {snapshotPath,writeAtomicSnapshot}=require("./sssc-snapshot-file.js");

function marketFingerprint(state){
  const closed=state&&state.privateCandlesByTf||{},forming=state&&state.privateFormingByTf||{};
  const fields=row=>row&&["time","open","high","low","close","volume","quoteVolume","openTime","closeTime","final"].map(key=>row[key]??null);
  return Object.keys({...closed,...forming}).sort()
    .map(tf=>[tf,fields((closed[tf]||[]).at(-1)),fields(forming[tf])])
    .filter(([,last,live])=>last||live);
}

function createMarketFreshnessTracker(options={}){
  const now=options.now||Date.now,staleAfterMs=Math.max(1,Number(options.staleAfterMs)||90000);
  let fingerprint="",lastUpdateAt=0;
  return Object.freeze({
    observe(state){
      const next=JSON.stringify(marketFingerprint(state));
      if(next!=="[]"&&next!==fingerprint){fingerprint=next;lastUpdateAt=now();}
      return lastUpdateAt;
    },
    status(){
      const ageMs=lastUpdateAt?Math.max(0,now()-lastUpdateAt):Infinity;
      return {fresh:!!lastUpdateAt&&ageMs<=staleAfterMs,lastUpdateAt:lastUpdateAt||null,ageMs,staleAfterMs};
    }
  });
}

function buildSsscRunner(options={}){
  const config=options.config,clock=options.clock,supabase=options.supabase,dataSource=options.dataSource;
  const slots=config.maPeriods.map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
  const freshness=createMarketFreshnessTracker({now:clock.now,staleAfterMs:options.staleAfterMs});
  if(typeof supabase.setSnapshotFreshnessProvider==="function")supabase.setSnapshotFreshnessProvider(()=>freshness.status());
  let logger=null;
  const pipeline=createOrchestration({
    getSlots:()=>slots,getCalculation:()=>calculation,getSymbol:()=>config.symbol,
    fetchKlines:dataSource.fetchKlines,connectWebSocket:dataSource.connectWebSocket,
    getWsUrl:()=>config.binanceWsUrl,now:clock.now,
    onUpdate:state=>{freshness.observe(state);if(logger)logger.capture();},
    warn:(message,error)=>(options.warn||console.warn)(`[Headless SSSC] ${message}`,error)
  });
  logger=createSnapshotLogger({
    getSnapshot:pipeline.getSnapshot,getCalculation:()=>calculation,getSymbol:()=>config.symbol,
    getSupabase:()=>supabase,now:clock.now,warn:options.warn||console.warn,
    writeLocalSnapshot:options.writeLocalSnapshot||((payload)=>writeAtomicSnapshot(options.ssscSnapshotPath||snapshotPath(),payload))
  });
  const contextLogger=createFuturesMarketContextLogger({
    dataSource,supabase,symbol:config.symbol,now:clock.now,warn:options.warn||console.warn
  });
  const component={
    async start(){pipeline.startLive();logger.start();await contextLogger.start();},
    stop(){contextLogger.stop();logger.stop();pipeline.stop();},
    capture:logger.capture
  };
  return createLoggerRunner({component,dataSource});
}

async function main(){
  loadDotEnv();
  const config=readConfig(),clock=createNodeExchangeClock({baseUrl:config.binanceRestUrl});
  await clock.ensureSynchronized({attempts:4,baseDelayMs:300});
  const signalTracker=createSignalTransitionTracker({calculation});
  const supabase=createSupabaseLogger({url:config.supabaseUrl,key:config.supabaseAnonKey,machineId:config.machineId,signalTracker});
  const dataSource=createBinanceDataSource({restUrl:config.binanceRestUrl});
  const runner=buildSsscRunner({config,clock,supabase,dataSource});
  installProcessShutdown(runner);
  await runner.start();
  console.log(`[Headless SSSC] Running ${config.symbol} as ${config.machineId}. Press Ctrl+C to stop.`);
}

module.exports={buildSsscRunner,createMarketFreshnessTracker,marketFingerprint,main};
if(require.main===module)main().catch(error=>{console.error("[Headless SSSC] Startup failed:",error);process.exitCode=1;});
