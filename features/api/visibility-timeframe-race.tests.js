"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","..","main.js"),"utf8");
  const slice=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start))).trim();
  const evaluateFunction=(start,end,context)=>{
    vm.createContext(context);
    return vm.runInContext(`(${slice(start,end)})`,context);
  };

  let selectedInterval="1m";
  let resolveRows;
  const restContext={
    Date,Number,String,Math,
    document:{hidden:false},
    window:{BINANCE_REST_GATE:{state:()=>({paused:false})}},
    state:{restInFlight:false},
    diag:{lastKlineTickByTf:{}},
    cfg:()=>({symbol:"BTCUSDT"}),
    iv:()=>selectedInterval,
    now:()=>1000,
    refocusDiagNow:()=>1000,
    refocusDiag:()=>{},
    waitingForFirstTick:()=>false,
    paintStatus:()=>{},
    klines:()=>new Promise(resolve=>{resolveRows=resolve;}),
    REST_LATEST_LIMIT:5,
    getChartBuffer:()=>[],
    ingestRestRows:()=>{},
    intervalKeep:()=>5,
    rehydrateActiveChartFromHub:()=>{},
    refreshConnectionStatus:()=>{},
    socketOpen:()=>true,
    MODULE:"TEST",
    console:{warn:()=>{}}
  };
  const restSyncLatest=evaluateFunction("async function restSyncLatest","async function repairKnownClosedGaps",restContext);
  const pending=restSyncLatest("BT001-FIX-01 visibility race");
  selectedInterval="5m";
  resolveRows([]);
  const staleOutcome=await pending;
  assert.deepEqual(JSON.parse(JSON.stringify(staleOutcome)),{ok:false,reason:"stale-request"},"a timeframe change during REST must be reported as a benign stale request");
  assert.equal(restContext.state.restInFlight,false,"the stale request must release the REST single-flight guard before recovery retries");

  const syncCalls=[];
  const outcomes=[staleOutcome,{ok:true,reason:"success"}];
  const recoveryContext={
    Error,
    repairKnownClosedGaps:async()=>({resolved:true,stale:false}),
    restSyncLatest:async reason=>{syncCalls.push(reason);return outcomes.shift();},
    state:{maStackVisible:false},
    ensureMaStackBuffers:async()=>{},
    diag:{lastWsTickTime:1000},
    now:()=>1000,
    WS_RECONNECT_MS:25000,
    socketOpen:()=>true,
    connect:()=>{},
    scheduleReconnect:()=>{},
    refreshConnectionStatus:()=>{}
  };
  const runPublicMarketVisibilityRecovery=evaluateFunction("async function runPublicMarketVisibilityRecovery","function invokePublicMarketVisibilityRecovery",recoveryContext);
  await runPublicMarketVisibilityRecovery("BT001-FIX-01 lifecycle return");
  assert.deepEqual(syncCalls,[
    "BT001-FIX-01 lifecycle return",
    "BT001-FIX-01 lifecycle return:active-market-retry"
  ],"a stale request must not throw and must immediately sync the newly active timeframe");

  console.log("visibility timeframe race tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
