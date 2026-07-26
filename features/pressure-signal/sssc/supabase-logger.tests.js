"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const calculation=require("./calculation.js");
const {SNAPSHOT_INTERVAL_MS,LOGGED_INTERVALS,buildSnapshotPayload,createSnapshotLogger}=require("./supabase-logger.js");

const diagnostic=(interval,index)=>({
  tf:interval.toUpperCase(),interval,available:true,direction:50-index,directionalStrength:30-index,
  acceleration:10-index,stackDir:20,slopeDir:21,sprDir:22,crossoverContribution:3,
  atr:100+index,atrInBps:12+index,RV:{recent:.01+index/1000,prior:.02+index/1000},
  resolvedElapsedHorizons:{slopeMs:480000,crossoverStaleMs:1440000},
  reliability:"full-warmup",phase:"Transition",state:"Mixed Bullish",
  vwap:99999,events:{ma1:"Near",ma2:"Above",cluster:"Tight"},cluster:"Tight"
});
const intervals=["1d","4h","1h","15m","5m","3m","1m"];
const data=Object.fromEntries(intervals.map((interval,index)=>[interval.toUpperCase(),diagnostic(interval,index)]));
const snapshot={started:true,data};
const payload=buildSnapshotPayload({snapshot,calculation,symbol:"BTCUSDT",machineId:"machine-sssc-test"});

assert.deepEqual(Object.keys(payload.timeframes),LOGGED_INTERVALS);
assert(!Object.prototype.hasOwnProperty.call(payload.timeframes,"4h"));
assert(!Object.prototype.hasOwnProperty.call(payload.timeframes,"1d"));
assert.equal(payload.machine_id,"machine-sssc-test");
assert.equal(payload.symbol,"BTCUSDT");
assert.equal(payload.timeframes["1m"].role,"trigger");
assert.equal(payload.timeframes["1h"].role,"structure");
assert.equal(payload.timeframes["1m"].available,true);
assert.equal(payload.timeframes["15m"].atrBps,data["15M"].atrInBps);
assert.equal(payload.timeframes["5m"].recentRV,data["5M"].RV.recent);
assert.deepEqual(payload.aggregate.missingTimeframes,[]);

const partialData={...data};
partialData["3M"]={...partialData["3M"],available:false,reason:"persistent-gap"};
delete partialData["15M"];
const partialPayload=buildSnapshotPayload({
  snapshot:{started:true,data:partialData},calculation,symbol:"BTCUSDT",machineId:"machine-sssc-test"
});
assert(partialPayload,"one unavailable timeframe must not suppress the entire snapshot");
assert.equal(partialPayload.timeframes["1m"].available,true);
assert.equal(partialPayload.timeframes["3m"].available,false);
assert.equal(partialPayload.timeframes["3m"].reason,"persistent-gap");
assert.equal(partialPayload.timeframes["15m"].available,false);
assert.equal(partialPayload.timeframes["15m"].reason,"diagnostic-unavailable");
assert.deepEqual(partialPayload.aggregate.missingTimeframes,["3m","15m"]);

for(const invalidMachineId of [null,"","   "]){
  assert.equal(buildSnapshotPayload({snapshot,calculation,symbol:"BTCUSDT",machineId:invalidMachineId}),null);
}

const serialized=JSON.stringify(payload);
for(const forbidden of ["positionAction","vwap","events","Near","Above","Below","cluster","Tight","Moderate Separation","Wide Separation"]){
  assert(!serialized.includes(forbidden),`${forbidden} must never appear in an SSSC snapshot payload`);
}
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"alignment"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"coverage"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"unanimousStrongOpposition"));
assert(!Object.prototype.hasOwnProperty.call(payload.aggregate,"positionAction"));

let timerCallback=null,timerDelay=null,writes=0,pipelineLive=false,continued=true,outboundRow=null;
const failingLogger=createSnapshotLogger({
  getSnapshot:()=>({...snapshot,started:pipelineLive}),
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"machine-sssc-test",
    log(_table,row){writes++;outboundRow=row;return Promise.reject(new Error("network down"));}
  }),
  setIntervalFn:(callback,delay)=>{timerCallback=callback;timerDelay=delay;return 7;},
  clearIntervalFn:()=>{}
});
failingLogger.start();
assert.equal(timerDelay,SNAPSHOT_INTERVAL_MS);
assert.equal(timerCallback(),false,"logging must not run before the pipeline is live");
pipelineLive=true;
assert.doesNotThrow(()=>timerCallback());
assert.equal(writes,1);
assert.equal(outboundRow.machine_id,"machine-sssc-test","machine_id must reach the outbound write row");
continued=true;
assert.equal(continued,true,"a rejected fire-and-forget write must not block subsequent application work");

let missingMachineWrites=0;
const missingMachineWarnings=[];
const missingMachineLogger=createSnapshotLogger({
  getSnapshot:()=>snapshot,
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"   ",
    log(){missingMachineWrites++;return Promise.resolve(true);}
  }),
  warn:message=>missingMachineWarnings.push(message)
});
assert.equal(missingMachineLogger.capture(),false);
assert.equal(missingMachineWrites,0,"blank machine_id must prevent the Supabase write");
assert.equal(missingMachineWarnings.length,1,"blank machine_id must produce an explicit warning");
assert.match(missingMachineWarnings[0],/machine_id is unavailable/);

const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"..","..","..","index.html"),"utf8");
assert(html.indexOf("features/pressure-signal/sssc/supabase-logger.js")<html.indexOf('src="main.js"'));
assert(main.includes("ensureSnapshotLogger()?.start()"),"always-on install must start SSSC logging without opening the dashboard");

console.log("sssc Supabase logger tests: PASS");
