"use strict";
const assert=require("assert");
const calculation=require("./calculation.js");
const {createOrchestration}=require("./orchestration.js");

const confirmed=Object.freeze({
  tf:"15M",interval:"15m",available:true,direction:25,directionalStrength:30,price:100,
  phase:"Transition",clean:25,crosses:{c12:{forming:false}},
  events:Object.freeze({vwap:"Above",earlyWarning:"None"})
});
const live=Object.freeze({
  ...confirmed,direction:-10,directionalStrength:5,phase:"Directionally Mixed",
  crosses:{c12:{forming:true}},events:Object.freeze({vwap:"Below",earlyWarning:"None"})
});
let calls=0;
const pipeline=createOrchestration({
  tfs:[["15M","15m"]],
  liveTfs:["15m"],
  getSlots:()=>[1,1,1,1,1].map((period,index)=>({slotId:`MA${index+1}`,period})),
  getCalculation:()=>({calculateTimeframe(){return ++calls%2?confirmed:live;},deriveEarlyWarning:calculation.deriveEarlyWarning}),
  getSymbol:()=>"BTCUSDT",
  fetchKlines:async()=>[],
  connectWebSocket:()=>({disconnect(){}}),
  getWsUrl:()=>"wss://fstream.binance.com/market/stream"
});
for(let time=1;time<=5;time++)pipeline.upsertPrivateKline("15m",{time,close:100+time,volume:1,quoteVolume:100},true,5);
pipeline.upsertPrivateKline("15m",{time:6,close:90,volume:1,quoteVolume:90},false,5);

let result;
assert.doesNotThrow(()=>{result=pipeline.buildDiagnosticSet("15M","15m");});
assert.notStrictEqual(result,live,"the diagnostic set must be a spread copy");
assert.notStrictEqual(result.events,live.events,"events must be updated with a spread copy");
assert.equal(result.mode,"live");
assert.notStrictEqual(result.liveDiagnostic,live,"VWAP decoration must also copy the frozen diagnostic");
assert.equal(result.earlyWarning.label,"Unconfirmed cross forming");
assert.equal(result.events.earlyWarning,"Unconfirmed cross forming");
assert.equal(live.events.earlyWarning,"None","the frozen live diagnostic must not be mutated");

console.log("sssc build diagnostic set frozen-live regression test: PASS");
