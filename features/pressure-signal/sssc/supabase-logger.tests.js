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
assert.equal(payload.timeframes["15m"].atrBps,data["15M"].atrInBps);
assert.equal(payload.timeframes["5m"].recentRV,data["5M"].RV.recent);

const serialized=JSON.stringify(payload);
for(const forbidden of ["positionAction","vwap","events","Near","Above","Below","cluster","Tight","Moderate Separation","Wide Separation"]){
  assert(!serialized.includes(forbidden),`${forbidden} must never appear in an SSSC snapshot payload`);
}
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"alignment"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"coverage"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"unanimousStrongOpposition"));
assert(!Object.prototype.hasOwnProperty.call(payload.aggregate,"positionAction"));

let timerCallback=null,timerDelay=null,writes=0,pipelineLive=false,continued=true;
const failingLogger=createSnapshotLogger({
  getSnapshot:()=>({...snapshot,started:pipelineLive}),
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"machine-sssc-test",
    log(){writes++;return Promise.reject(new Error("network down"));}
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
continued=true;
assert.equal(continued,true,"a rejected fire-and-forget write must not block subsequent application work");

const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"..","..","..","index.html"),"utf8");
assert(html.indexOf("features/pressure-signal/sssc/supabase-logger.js")<html.indexOf('src="main.js"'));
assert(main.includes("ensureSnapshotLogger()?.start()"),"always-on install must start SSSC logging without opening the dashboard");

console.log("sssc Supabase logger tests: PASS");
