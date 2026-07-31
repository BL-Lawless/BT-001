"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const config=require("../config.js");
const {createSignalPipeline}=require("./signal-pipeline.js");

const context={module:{exports:{}},exports:{},Date,Object,Array,String,Number,Boolean,JSON,Math,Map,Set,Error};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,"signal-detector-core.js"),"utf8"),context,{filename:"signal-detector-core.js"});
assert.equal(typeof context.window,"undefined");
const {Detector}=context.module.exports.createSignalDetectorCore(config.signal);
const detector=new Detector({getHub:()=>null});
const unavailable=detector.evaluateTf("1m",null,1234);
assert.equal(unavailable.ready,false);
assert.equal(unavailable.detection.publishedAt,1234);

const writes=[],event={eventId:"qualified-1",source:"1m",eventType:"CROSS",direction:"LONG",qualified:true,projected:false,publishedAt:2000,candleTime:1900,rankValue:88,rank:"A"};
const pipeline=createSignalPipeline({
  detector:{evaluateTf:()=>({emittedEvent:event}),reset(){},diagnostics:()=>({})},
  getSymbol:()=>"BTCUSDT",getMachineId:()=>"vm-signal-test",now:()=>2000,
  write:(table,row)=>{writes.push({table,row});return Promise.resolve(true);}
});
assert.equal(pipeline.handleUpdate({tf:"1m"}),true);
assert.equal(pipeline.handleUpdate({tf:"1m"}),false,"the same detector event must be written once");
assert.deepEqual(writes.map(item=>item.table),["scalp_v1_signals"]);
assert.equal(writes[0].row.event_at,new Date(2000).toISOString());
assert(writes.every(item=>item.row.machine_id==="vm-signal-test"&&item.row.action==="DETECTION_QUALIFIED"));
assert(!writes.some(item=>["scalp_positions","scalp_trades","scalp_operational"].includes(item.table)));

const v2Writes=[],v2Pipeline=createSignalPipeline({
  detector:{evaluateTf:()=>({emittedEvent:{...event,eventId:"qualified-v2"}}),reset(){},diagnostics:()=>({})},
  getSymbol:()=>"BTCUSDT",getMachineId:()=>"vm-signal-test",now:()=>2000,signalTable:"scalp_v2_signals",
  write:(table,row)=>{v2Writes.push({table,row});return Promise.resolve(true);}
});
assert.equal(v2Pipeline.handleUpdate({tf:"1m"}),true);
assert.deepEqual(v2Writes.map(item=>item.table),["scalp_v2_signals"]);
assert.equal(v2Writes[0].row.event_at,new Date(2000).toISOString());
assert.deepEqual(Object.keys(v2Writes[0].row).sort(),Object.keys(writes[0].row).sort(),"V2 logging must mirror the V1 signal row shape");
console.log("SCALP signal detector core tests: PASS");
