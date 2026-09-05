"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const WebSocket=require("ws");

const source=fs.readFileSync(path.join(__dirname,"..","features","taker-volume-delta","taker-volume-delta-core.js"),"utf8");
const context={window:{},Object,Number,String,Math};
vm.createContext(context);vm.runInContext(source,context);
const core=context.window.BT001TakerVolumeDeltaCore;
const engine=core.createEngine({durationMs:5000,lookback:2});
const socket=new WebSocket("wss://fstream.binance.com/market/ws/btcusdt@aggTrade");
let firstRevision=null;
let boundaryStart=null;
let postBoundaryTrades=0;
let finished=false;
const timeout=setTimeout(()=>finish(new Error("Timed out waiting for a live five-second TVD boundary")),25000);

function finish(error){
  if(finished)return;finished=true;
  clearTimeout(timeout);try{socket.close();}catch(_error){}
  if(error){console.error(error.stack||error);process.exitCode=1;return;}
  const snapshot=engine.snapshot();
  assert.equal(snapshot.durationMs,5000);
  assert.equal(snapshot.lookback,2);
  assert(snapshot.current&&snapshot.current.start%5000===0,"current bucket is not fixed-boundary aligned");
  assert(snapshot.completed.length>=1&&snapshot.completed.every(bucket=>bucket.locked),"completed bucket did not lock");
  assert(snapshot.totalVolume>0&&snapshot.buyVolume+snapshot.sellVolume===snapshot.totalVolume,"live buy/sell split does not equal total volume");
  assert(snapshot.current.openPrice>0&&snapshot.current.lastPrice>0,"live prices were not recorded in the forming bucket");
  assert.equal(snapshot.current.priceChange,snapshot.current.lastPrice-snapshot.current.openPrice,"forming price change is not first-to-latest");
  const relationship=core.relationshipModel(snapshot.baselineBuckets);
  assert.equal(relationship.length,snapshot.baselineSampleCount,"relationship history differs from TVD baseline input");
  assert(postBoundaryTrades>=2,"forming bucket did not continue updating live after reset");
  console.log(JSON.stringify({
    ok:true,symbol:snapshot.symbol,durationMs:snapshot.durationMs,lookback:snapshot.lookback,
    fixedBoundary:snapshot.current.start,boundaryObserved:boundaryStart,
    completedBuckets:snapshot.completed.length,baselineAverage:snapshot.baselineAverage,
    relationship:{buckets:relationship.length,divergentBuckets:relationship.filter(row=>row.divergent).length,oldestToNewest:relationship.map(row=>({start:row.bucket.start,delta:row.delta,priceChange:row.priceChange,divergent:row.divergent}))},
    forming:{trades:snapshot.current.tradeCount,buyVolume:snapshot.buyVolume,sellVolume:snapshot.sellVolume,totalVolume:snapshot.totalVolume,buyPct:snapshot.buyPct,sellPct:snapshot.sellPct,delta:snapshot.delta,openPrice:snapshot.current.openPrice,lastPrice:snapshot.current.lastPrice,priceChange:snapshot.current.priceChange,totalLengthPct:snapshot.totalLengthPct}
  },null,2));
}

socket.on("message",payload=>{
  if(finished)return;
  const trade=JSON.parse(payload.toString());
  const before=engine.snapshot();
  engine.ingest({symbol:trade.s,exchangeTime:trade.T||trade.E,price:trade.p,quantity:trade.q,buyerIsMaker:trade.m});
  const after=engine.snapshot();
  if(firstRevision==null)firstRevision=after.revision;
  if(before.current&&after.current&&before.current.start!==after.current.start){boundaryStart=after.current.start;postBoundaryTrades=1;}
  else if(boundaryStart!=null&&after.current&&after.current.start===boundaryStart)postBoundaryTrades+=1;
  if(boundaryStart!=null&&postBoundaryTrades>=2&&after.baselineSampleCount>=1)finish();
});
socket.on("error",finish);
