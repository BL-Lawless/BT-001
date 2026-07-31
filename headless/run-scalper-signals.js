"use strict";

const {loadDotEnv,readConfig}=require("./config.js");
const {createNodeExchangeClock}=require("./clock.js");
const {createSupabaseLogger}=require("./supabase-client.js");
const {createBinanceDataSource}=require("./binance-data-source.js");
const {createScalpMarketHub}=require("./scalp-market-hub.js");
const {createLoggerRunner,installProcessShutdown}=require("./logger-runner.js");
const scalpConfig=require("../features/scalp/config.js");
const {createSignalDetectorCore}=require("../features/scalp/core/signal-detector-core.js");
const {createSignalDetectorV2Core}=require("../features/scalp/core/signal-detector-v2-core.js");
const {createSignalPipeline}=require("../features/scalp/core/signal-pipeline.js");

function buildScalperSignalRunner(options={}){
  const {config,clock,supabase,dataSource}=options;
  const hub=options.hub||createScalpMarketHub({dataSource,symbol:config.symbol,wsUrl:config.binanceWsUrl,minimumRows:scalpConfig.signal.minimumRows,now:clock.now});
  const {Detector}=createSignalDetectorCore(scalpConfig.signal),detector=new Detector({getHub:()=>hub});
  const {Detector:DetectorV2}=createSignalDetectorV2Core(scalpConfig.signalV2),detectorV2=new DetectorV2({getHub:()=>hub});
  const pipeline=createSignalPipeline({
    detector,timeframes:scalpConfig.timeframes,getSymbol:()=>config.symbol,
    getMachineId:()=>config.machineId,now:clock.now,write:(table,row)=>supabase.log(table,row)
  });
  const pipelineV2=createSignalPipeline({
    detector:detectorV2,timeframes:scalpConfig.timeframes,getSymbol:()=>config.symbol,
    getMachineId:()=>config.machineId,now:clock.now,signalTable:"scalp_v2_signals",write:(table,row)=>supabase.log(table,row)
  });
  let unsubscribe=null;
  const component={
    async start(){unsubscribe=hub.subscribe(update=>{pipeline.handleUpdate(update);pipelineV2.handleUpdate(update);});await hub.start();pipeline.evaluateAll();pipelineV2.evaluateAll();},
    stop(){if(unsubscribe)unsubscribe();unsubscribe=null;hub.stop();},
    capture(){pipeline.evaluateAll();pipelineV2.evaluateAll();}
  };
  return createLoggerRunner({component,dataSource});
}

async function main(){
  loadDotEnv();
  const config=readConfig(),clock=createNodeExchangeClock({baseUrl:config.binanceRestUrl});
  await clock.ensureSynchronized({attempts:4,baseDelayMs:300});
  const supabase=createSupabaseLogger({url:config.supabaseUrl,key:config.supabaseAnonKey,machineId:config.machineId});
  const dataSource=createBinanceDataSource({restUrl:config.binanceRestUrl});
  const runner=buildScalperSignalRunner({config,clock,supabase,dataSource});
  installProcessShutdown(runner);
  await runner.start();
  console.log(`[Headless scalp signals] Running ${config.symbol} as ${config.machineId}. Press Ctrl+C to stop.`);
}

module.exports={buildScalperSignalRunner,main};
if(require.main===module)main().catch(error=>{console.error("[Headless scalp signals] Startup failed:",error);process.exitCode=1;});
