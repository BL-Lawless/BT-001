"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const context={module:{exports:{}},exports:{},Date,Object,Array,String,Number,Boolean,JSON,Math};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,"snapshot-logger.js"),"utf8"),context,{filename:"snapshot-logger.js"});
const core=context.module.exports;
assert(core&&typeof core.buildSnapshotPayload==="function");
assert.equal(typeof context.window,"undefined");
const calculation={
  TIMEFRAME_ROLES:{"1m":{role:"trigger"},"3m":{role:"confirmation"},"5m":{role:"confirmation"},"15m":{role:"context"},"1h":{role:"structure"}},
  aggregate:()=>({roleCoverage:{},alignment:1,coverage:1,triggerRisk:{unanimousStrongOpposition:false}}),
  evaluateMarketSetup:()=>({marketBias:1,marketStrength:2,marketAcceleration:3,aggregateConfidence:4,timingRisk:5,setupAction:"WAIT",reason:"test"})
};
const data=Object.fromEntries(core.LOGGED_INTERVALS.map(interval=>[interval,{interval,available:true,direction:1}]));
const now=1712345678901;
const payload=core.buildSnapshotPayload({snapshot:{started:true,data},calculation,symbol:"BTCUSDT",machineId:"node-test",now:()=>now});
assert.equal(payload.event_at,new Date(now).toISOString());
assert.equal(payload.machine_id,"node-test");
assert.equal(payload.timeframes["1m"].role,"trigger");
console.log("SSSC snapshot logger core tests: PASS");
