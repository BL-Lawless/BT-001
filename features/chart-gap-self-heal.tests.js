"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const config=require("./scalp/config.js");
const {createSignalDetectorCore}=require("./scalp/core/signal-detector-core.js");
const {createSignalDetectorV2Core}=require("./scalp/core/signal-detector-v2-core.js");

(async()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8"),slice=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start))).trim();

  // Exact former failure: the later finalized candle is stored, continuity validation finds the
  // missing interval, and immediate reconciliation must run without an undefined-function throw.
  const rows=[{time:60,open:1,high:1,low:1,close:1,volume:1,final:true}],repairs=[];
  const context={Number,Math,Array,Object,Promise,state:{closedKlinesByTf:{"1m":rows},formingKlineByTf:{},closedRevisionByTf:{},formingRevisionByTf:{}},window:{BT001CanonicalCandleSeries:null},
    normalizeCandleRow:(_tf,row)=>({...row}),closedContentKey:value=>JSON.stringify(value),getClosedBuffer:()=>rows,mergeBufferRow:(a,b)=>({...a,...b}),warnIntegrity:()=>{},trimClosedBuffer:()=>{},bumpClosedRevision:()=>{},bumpFormingRevision:()=>{},
    validateClosedBuffer:()=>[{tf:"1m",fromTime:120,toTime:120,missingCount:1}],repairMissingClosedCandles:async(tf,issues,reason)=>{repairs.push({tf,issues,reason});return {resolved:true};}};
  vm.createContext(context);vm.runInContext(slice("function beginGapReconciliation","function prependClosedBuffer"),context);
  assert.doesNotThrow(()=>context.upsertClosedBuffer("1m",{time:180,open:2,high:2,low:2,close:2,volume:1},100,{source:"ws"}));
  await Promise.resolve();assert.deepEqual(rows.map(row=>row.time),[60,180]);assert.equal(repairs.length,1);assert.equal(repairs[0].issues[0].fromTime,120);

  // Healthy sockets must still audit the complete retained history and escalate an unresolved
  // targeted repair to a full-window REST reseed.
  let hasGap=true,reseedCalls=0,clock=120000;
  const auditContext={state:{historicalContinuityInFlight:null,lastHistoricalContinuityCheckMs:0},HISTORICAL_CONTINUITY_CHECK_MS:60000,now:()=>clock,
    repairKnownClosedGaps:async()=>({resolved:false,issueCount:1,results:[{resolved:false}]}),requiredKlineTimeframes:()=>new Set(["1m"]),
    validateClosedBuffer:()=>hasGap?[{tf:"1m",fromTime:120,toTime:120,missingCount:1}]:[],getClosedBuffer:()=>rows,intervalKeep:()=>100,
    seedBuffer:async()=>{reseedCalls++;hasGap=false;}};
  vm.createContext(auditContext);auditContext.auditHistoricalContinuity=vm.runInContext(`(${slice("async function auditHistoricalContinuity","function connect")})`,auditContext);
  const audited=await auditContext.auditHistoricalContinuity("test");assert.equal(audited.resolved,true);assert.equal(reseedCalls,1,"an aged retained gap must trigger a full historical reseed even with a healthy socket");

  const messagePath=slice("onMessage:event =>","onError:() =>");
  assert(messagePath.indexOf('handleKline(d)')<messagePath.indexOf('markWsTick("kline")'),"kline freshness must be marked only after successful processing");
  assert(messagePath.includes("kline processing failed"),"failed kline processing must update diagnostics");

  // Both scalp detector cores must consume the repaired, continuous authoritative snapshot.
  const repairedRows=Array.from({length:90},(_,index)=>({time:(index+1)*60,open:100,high:102,low:98,close:100+index*.01,volume:100,takerBuyBase:55,final:true}));
  const missing=repairedRows.splice(44,1)[0];repairedRows.splice(44,0,missing);
  assert(repairedRows.every((row,index)=>index===0||row.time-repairedRows[index-1].time===60));
  const fast=repairedRows.map((_,index)=>100+index*.01),slow=repairedRows.map(()=>100),snapshot={reliable:true,rows:repairedRows,alignedByPeriod:{9:fast,55:slow},valuesByPeriod:{9:fast.at(-1),55:100},closedRevision:2,formingRevision:2};
  let v1Reads=0,v2Reads=0;
  const V1=createSignalDetectorCore(config.signal).Detector,V2=createSignalDetectorV2Core(config.signalV2).Detector;
  const v1=new V1({getHub:()=>({getAuthoritativeMaSnapshot:()=>{v1Reads++;return snapshot;}})}),v2=new V2({getHub:()=>({getAuthoritativeMaSnapshot:()=>{v2Reads++;return snapshot;}})});
  assert.equal(v1.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},1000).ready,true);
  assert.equal(v2.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},1000).ready,true);
  assert(v1Reads>0&&v2Reads>0,"both scalp detector cores must read the repaired authoritative snapshot");
  console.log("chart gap self-heal tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
