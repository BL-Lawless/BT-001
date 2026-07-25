"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {createOrchestration,wsBase}=require("./orchestration.js");

assert.equal(wsBase("wss://fstream.binance.com/private/ws"),"wss://fstream.binance.com/market/stream");
const source=fs.readFileSync(path.join(__dirname,"orchestration.js"),"utf8");
assert(!source.includes("marketDataHub"),"orchestration must not reference the shared market-data hub");

let connectedUrl=null;
const pipeline=createOrchestration({
  tfs:[["15M","15m"],["1M","1m"]],
  getSlots:()=>[1,2,3,4,5].map((period,index)=>({slotId:`MA${index+1}`,period})),
  getCalculation:()=>null,
  getSymbol:()=>"BTCUSDT",
  fetchKlines:async()=>[],
  connectWebSocket:url=>{connectedUrl=url;return {disconnect(){}};},
  getWsUrl:()=>"wss://fstream.binance.com/private/ws"
});
assert.doesNotThrow(()=>pipeline.connectPrivateSocket(1000));
assert.equal(connectedUrl,"wss://fstream.binance.com/market/stream?streams=btcusdt@kline_15m/btcusdt@kline_1m");

console.log("sssc private socket module-scope regression test: PASS");
