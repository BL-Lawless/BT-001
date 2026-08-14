"use strict";

const {loadMaStackEnv,readMaStackConfig}=require("./ma-stack-logger/config.js");
const {createMaStackMarketFeed}=require("./ma-stack-logger/market-feed.js");
const {createMaStackWriter}=require("./ma-stack-logger/supabase-writer.js");
const {createMaStackLoggerService}=require("./ma-stack-logger/service.js");

async function main(){
  loadMaStackEnv();
  const config=readMaStackConfig();
  const feed=createMaStackMarketFeed({symbol:config.symbol,timeframes:config.timeframes,restUrl:config.restUrl,wsUrl:config.wsUrl,bufferRows:config.bufferRows});
  const writer=createMaStackWriter({url:config.supabaseUrl,key:config.supabaseAnonKey,table:config.table,spoolPath:config.spoolPath});
  const service=createMaStackLoggerService({config,feed,writer});
  let stopping=false;
  const stop=async signal=>{if(stopping)return;stopping=true;try{await service.stop();}finally{if(signal)process.exit(0);}};
  process.once("SIGINT",()=>stop("SIGINT"));process.once("SIGTERM",()=>stop("SIGTERM"));
  await service.start();
  console.log(`[MA Stack logger] Running ${config.symbol} across ${config.timeframes.join(",")} as ${config.machineId}.`);
}

module.exports={main};
if(require.main===module)main().catch(error=>{console.error("[MA Stack logger] startup failed",error);process.exitCode=1;});
