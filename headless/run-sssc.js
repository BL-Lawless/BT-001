"use strict";

const {loadDotEnv,readConfig}=require("./config.js");
const {createNodeExchangeClock}=require("./clock.js");
const {createSupabaseLogger}=require("./supabase-client.js");
const {createBinanceDataSource}=require("./binance-data-source.js");
const {createLoggerRunner,installProcessShutdown}=require("./logger-runner.js");
const calculation=require("../features/pressure-signal/sssc/calculation.js");
const {createOrchestration}=require("../features/pressure-signal/sssc/orchestration.js");
const {createSnapshotLogger}=require("../features/pressure-signal/sssc/core/snapshot-logger.js");

function buildSsscRunner(options={}){
  const config=options.config,clock=options.clock,supabase=options.supabase,dataSource=options.dataSource;
  const slots=config.maPeriods.map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
  let logger=null;
  const pipeline=createOrchestration({
    getSlots:()=>slots,getCalculation:()=>calculation,getSymbol:()=>config.symbol,
    fetchKlines:dataSource.fetchKlines,connectWebSocket:dataSource.connectWebSocket,
    getWsUrl:()=>config.binanceWsUrl,now:clock.now,
    onUpdate:()=>{if(logger)logger.capture();},
    warn:(message,error)=>(options.warn||console.warn)(`[Headless SSSC] ${message}`,error)
  });
  logger=createSnapshotLogger({
    getSnapshot:pipeline.getSnapshot,getCalculation:()=>calculation,getSymbol:()=>config.symbol,
    getSupabase:()=>supabase,now:clock.now,warn:options.warn||console.warn
  });
  const component={
    async start(){pipeline.startLive();logger.start();},
    stop(){logger.stop();pipeline.stop();},
    capture:logger.capture
  };
  return createLoggerRunner({component,dataSource});
}

async function main(){
  loadDotEnv();
  const config=readConfig(),clock=createNodeExchangeClock({baseUrl:config.binanceRestUrl});
  await clock.ensureSynchronized({attempts:4,baseDelayMs:300});
  const supabase=createSupabaseLogger({url:config.supabaseUrl,key:config.supabaseAnonKey,machineId:config.machineId});
  const dataSource=createBinanceDataSource({restUrl:config.binanceRestUrl});
  const runner=buildSsscRunner({config,clock,supabase,dataSource});
  installProcessShutdown(runner);
  await runner.start();
  console.log(`[Headless SSSC] Running ${config.symbol} as ${config.machineId}. Press Ctrl+C to stop.`);
}

module.exports={buildSsscRunner,main};
if(require.main===module)main().catch(error=>{console.error("[Headless SSSC] Startup failed:",error);process.exitCode=1;});
