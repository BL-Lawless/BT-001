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
assert.equal(candidate.event,null,"a sub-threshold cross must not surface as a candidate");
assert(candidate.analysis.separationAtr<config.signalV2.crossMeaningfulGapAtr);

const nextRows=rows.concat({...rows.at(-1),time:33*60000,close:101});
const nextFast=fast.concat(100.5),nextSlow=slow.concat(100);
snapshot={reliable:true,rows:nextRows,alignedByPeriod:{9:nextFast,55:nextSlow}};
const qualified=detector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},2000).emittedEvent;
assert(qualified&&qualified.qualified);
assert.equal(qualified.eventType,"CROSS");
assert.equal(qualified.rankDiagnostics.profile,"V2");

const components=qualified.rankDiagnostics.emaComponents;
for(const key of ["snap","followThrough","engagement","atrTrajectory","cleanliness"])assert(Object.prototype.hasOwnProperty.call(components,key),`${key} must be scored`);
assert.equal(qualified.rankDiagnostics.sssc.multiplier,config.signalV2.ssscUnavailableMultiplier);
for(const removed of ["directionalAcceleration","atrNormalizedAcceleration","directionalSlope","velocityRelativeToAtr","ema55Context","dataReliabilityFreshness","sameSideIntegrity"])assert(!Object.prototype.hasOwnProperty.call(components,removed),`${removed} must not be an additive V2 component`);

snapshot={reliable:false,reason:"stale canonical data",rows:nextRows,alignedByPeriod:{9:nextFast,55:nextSlow}};
const unreliable=detector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},2001);
assert.equal(unreliable.ready,false,"unreliable V2 data must remain a hard gate");
assert.equal(unreliable.emittedEvent,null,"unreliable V2 data must never reach scoring or emission");
snapshot={reliable:true,rows:nextRows,alignedByPeriod:{9:nextFast,55:nextSlow}};

const weakAnalysis={...candidate.analysis,fastAcceleration:.01,fastSlope:.01,separation:.01,atr:2,atrChange:0,s:100,i:31};
const strongAnalysis={...weakAnalysis,fastAcceleration:4,fastSlope:4,separation:12,atrChange:.3};
const scoreRows=rows.map(row=>({...row,volume:0}));
const weakQuality=tools.scoreEvent("1m",{...qualified,eventType:"CROSS",direction:"LONG"},weakAnalysis,scoreRows,fast,slow,{hub:null,followAnalyses:[weakAnalysis]});
const strongQuality=tools.scoreEvent("1m",{...qualified,eventType:"CROSS",direction:"LONG"},strongAnalysis,scoreRows,fast,slow,{hub:null,followAnalyses:[strongAnalysis]});
assert(strongQuality.rankValue>weakQuality.rankValue,"separation, snap, velocity, and engagement must genuinely differentiate the total V2 score");

const integrityFast=fast.slice();integrityFast[integrityFast.length-2]=99;integrityFast[integrityFast.length-1]=101;
assert.equal(tools.bounceCandidate(rows,integrityFast,slow),null,"an interrupted same-side history must not produce a V2 BOUNCE candidate");

const disagreeingSlow=nextSlow.map((_,index)=>200-index);
const reversal=tools.slowContext(nextFast,disagreeingSlow,nextSlow.length-1,"LONG",2);
assert.equal(reversal.mode,"REVERSAL_UNSCORED");
assert.equal(reversal.score,null);

const agreeingSlow=nextSlow.map((_,index)=>index<25?100:100+(index-24)*.2);
const sameDirection=tools.slowContext(nextFast,agreeingSlow,agreeingSlow.length-1,"LONG",2);
assert.equal(sameDirection.mode,"SAME_DIRECTION");
assert(sameDirection.wakeUp!=null&&sameDirection.maturity!=null&&sameDirection.age>0);

function candle(index){return {time:(index+1)*60,open:100,high:103,low:97,close:101,volume:100,takerBuyBase:55,final:true};}
let bounceRows=Array.from({length:90},(_,index)=>candle(index)),bounceSlow=bounceRows.map(()=>100),bounceFast=bounceRows.map(()=>110);
const firstShape=[110,108,106,104,102,100.2,104,107,110];firstShape.forEach((value,index)=>{bounceFast[bounceFast.length-firstShape.length+index]=value;});
let bounceSnapshot=()=>({reliable:true,rows:bounceRows,alignedByPeriod:{9:bounceFast,55:bounceSlow}});
const bounceHub={getAuthoritativeMaSnapshot:()=>bounceSnapshot()},bounceDetector=new Detector({getHub:()=>bounceHub});
const firstBounce=bounceDetector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},3000).emittedEvent;
assert(firstBounce&&firstBounce.eventType==="BOUNCE","fixture must produce the original V2 bounce");
assert(!Object.prototype.hasOwnProperty.call(firstBounce.rankDiagnostics.emaComponents,"sameSideIntegrity"),"same-side integrity is a gate, not an additive V2 score");
const firstSetup=bounceDetector.diagnostics().byTimeframe["1m"].lastEmittedSetup,firstIdentity=firstSetup.identity;
for(let minute=0;minute<4;minute++){
  bounceRows=bounceRows.concat(candle(bounceRows.length));bounceSlow=bounceSlow.concat(100);bounceFast=bounceFast.concat(112+minute*2);
  assert.equal(tools.bounceCandidate(bounceRows,bounceFast,bounceSlow).touchCandleTime,firstSetup.anchorCandleTime,"fixture must keep qualifying from the same touch");
  assert.equal(bounceDetector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},4000+minute).emittedEvent,null,"the same rolling-window touch must not re-emit on a later candle");
  assert.equal(bounceDetector.diagnostics().byTimeframe["1m"].lastEmittedSetup.identity,firstIdentity);
}

for(let minute=0;minute<13;minute++){
  bounceRows=bounceRows.concat(candle(bounceRows.length));bounceSlow=bounceSlow.concat(100);bounceFast=bounceFast.concat(112);
  bounceDetector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},5000+minute);
}
const secondShape=[110,108,106,104,102,100.2,104];
for(let index=0;index<secondShape.length;index++){
  bounceRows=bounceRows.concat(candle(bounceRows.length));bounceSlow=bounceSlow.concat(100);bounceFast=bounceFast.concat(secondShape[index]);
}
const secondBounce=bounceDetector.evaluateTf("1m",{type:"kline",tf:"1m",closed:true},6000).emittedEvent;
assert(secondBounce&&secondBounce.eventType==="BOUNCE","a distinct touch after expiry must emit");
assert.notEqual(bounceDetector.diagnostics().byTimeframe["1m"].lastEmittedSetup.identity,firstIdentity);

const crossGuard=new Detector(),crossEvent={eventType:"CROSS",direction:"LONG",candleTime:100,qualified:true};
assert.equal(crossGuard.novelEmission("1m",crossEvent,90),crossEvent);
assert.equal(crossGuard.novelEmission("1m",{...crossEvent,candleTime:101},90),null,"the same crossover anchor must be suppressed");
assert(crossGuard.novelEmission("1m",{...crossEvent,candleTime:102},91),"a new crossover anchor must emit");

assert.equal(config.signalV2.touchToleranceAtr,.05);
assert.equal(config.signalV2.approachBandAtr,.15);
assert.equal(config.signalV2.minFastSlopeAtr,.015);
assert(!Object.keys(config.signalV2).some(key=>key.endsWith("Price")));
console.log("SCALP V2 detector core tests: PASS");
