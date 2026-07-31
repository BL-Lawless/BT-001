"use strict";
const assert=require("assert");
const config=require("../config.js");
const {createSignalDetectorV2Core}=require("./signal-detector-v2-core.js");

const {Detector,detectorTools:tools}=createSignalDetectorV2Core(config.signalV2);
const rows=Array.from({length:32},(_,index)=>({time:(index+1)*60000,open:100,high:102,low:98,close:100,volume:100,takerBuyBase:55,final:true}));
const slow=rows.map(()=>100),fast=rows.map((_,index)=>index===30?99.99:index===31?100.01:99.5);
let snapshot={reliable:true,rows,alignedByPeriod:{9:fast,55:slow}};
const hub={getAuthoritativeMaSnapshot:tf=>tf==="15m"?{reliable:true,rows,alignedByPeriod:{55:slow.map((_,index)=>100+Math.min(index,29))}}:snapshot};
const detector=new Detector({getHub:()=>hub});

const candidate=detector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},1000);
assert.equal(candidate.event.eventState,"FOLLOW_THROUGH");
assert.equal(candidate.event.qualified,false);
assert.equal(candidate.event.raw.crossQualifiedWithoutSeparationGate,true);
assert(Math.abs(candidate.analysis.gap)<config.signalV2.touchTolerancePrice,"fixture must cross by far less than every raw gate");

const nextRows=rows.concat({...rows.at(-1),time:33*60000,close:101});
const nextFast=fast.concat(100.02),nextSlow=slow.concat(100);
snapshot={reliable:true,rows:nextRows,alignedByPeriod:{9:nextFast,55:nextSlow}};
const qualified=detector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},2000).emittedEvent;
assert(qualified&&qualified.qualified);
assert.equal(qualified.eventType,"CROSS");
assert.equal(qualified.rankDiagnostics.profile,"V2");

const components=qualified.rankDiagnostics.emaComponents;
for(const key of ["snap","followThrough","engagement","atrTrajectory","exhaustion15m","cleanliness"])assert(Object.prototype.hasOwnProperty.call(components,key),`${key} must be scored`);
for(const removed of ["directionalAcceleration","atrNormalizedAcceleration","directionalSlope","velocityRelativeToAtr","ema55Context"])assert(!Object.prototype.hasOwnProperty.call(components,removed),`${removed} must not be duplicated in V2`);

const disagreeingSlow=nextSlow.map((_,index)=>200-index);
const reversal=tools.slowContext(nextFast,disagreeingSlow,nextSlow.length-1,"LONG");
assert.equal(reversal.mode,"REVERSAL_UNSCORED");
assert.equal(reversal.score,null);

const agreeingSlow=nextSlow.map((_,index)=>index<25?100:100+(index-24)*.2);
const sameDirection=tools.slowContext(nextFast,agreeingSlow,agreeingSlow.length-1,"LONG");
assert.equal(sameDirection.mode,"SAME_DIRECTION");
assert(sameDirection.wakeUp!=null&&sameDirection.maturity!=null&&sameDirection.age>0);

assert.equal(config.signalV2.touchTolerancePrice,5);
assert.equal(config.signalV2.approachBandPrice,15);
assert.equal(config.signalV2.minFastSlopePrice,1.5);
assert(!Object.keys(config.signalV2).some(key=>["crossMeaningfulGapAtr","toleranceAtr","approachAtr","minFastSlopeAtr"].includes(key)));
console.log("SCALP V2 detector core tests: PASS");
