"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..","..");
function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,AbortController};context.window=context;context.document={querySelector:()=>null};
  vm.createContext(context);
  for(const file of ["features/pressure-signal/engines/registry.js","features/pressure-signal/engines/engine-a.js","features/pressure-signal/engines/engine-b.js"])vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  return context;
}
function rows(tf,count=260,side=1){
  const seconds={"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400}[tf],start=1700000000,out=[];let price=40000;
  for(let index=0;index<count;index+=1){const wave=Math.sin(index/7)*8,move=side*(3+(index%5===0?2:0))+wave*.08,open=price,close=open+move,high=Math.max(open,close)+5,low=Math.min(open,close)-5,volume=100+(index%11)*4;out.push({time:start+index*seconds,openTime:(start+index*seconds)*1000,closeTime:(start+(index+1)*seconds)*1000-1,open,high,low,close,volume,quoteVolume:volume*close,tradeCount:80+index%17,takerBuyBase:volume*(side>0?.57:.43),final:true});price=close;}
  return out;
}

const run=(async()=>{
  const context=runtime();
  const timeframes=["1m","3m","5m","15m","1h","4h","1d"],closedByTf=Object.fromEntries(timeframes.map(tf=>[tf,rows(tf)]));
  const baseline={symbol:"BTCUSDT",horizonId:"quick",version:1,signature:"readiness-fixture-baseline",currentPrice:closedByTf["1m"].at(-1).close,closedByTf,rowsByTf:closedByTf,maByTf:{},structureByTf:{},freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};

  // A fresh engine instance per snapshot avoids the evaluation cache masking the comparison.
  const baseResult=context.createSignalEngineB().evaluate({snapshot:baseline,horizonId:"quick",publicationGeneration:1});
  assert.notEqual(baseResult.entryState,"TRIGGER ACTIVE","fixture must not already be maxed out, or the forming-candle bonus has nothing to add");

  // Append a still-open (final:false) trigger-timeframe candle showing strong price progress
  // and taker-buy imbalance in the already-selected LONG direction. It is added only to
  // rowsByTf (the live view), never to closedByTf, exactly like the production snapshot builder.
  const triggerTf="3m",lastClosed=closedByTf[triggerTf].at(-1),seconds=180;
  const forming={
    time:lastClosed.time+seconds,openTime:lastClosed.closeTime+1,closeTime:lastClosed.closeTime+seconds*1000,
    open:lastClosed.close,high:lastClosed.close+40,low:lastClosed.close-2,close:lastClosed.close+35,
    volume:500,quoteVolume:500*(lastClosed.close+35),tradeCount:200,takerBuyBase:450,final:false
  };
  const withForming={...baseline,signature:"readiness-fixture-forming",rowsByTf:{...closedByTf,[triggerTf]:[...closedByTf[triggerTf],forming]}};
  const formingResult=context.createSignalEngineB().evaluate({snapshot:withForming,horizonId:"quick",publicationGeneration:1});

  // entryState and every one of the 16 hard gates must be byte-for-byte identical...
  assert.equal(formingResult.entryState,baseResult.entryState);
  assert.deepStrictEqual(formingResult.decision.gateStatuses,baseResult.decision.gateStatuses);
  assert.deepStrictEqual(formingResult.comparisonDiagnostics.hardGates,baseResult.comparisonDiagnostics.hardGates);
  // ...as well as every other published field: only readinessScore (top-level and inside
  // comparisonDiagnostics) may move.
  for(const key of Object.keys(baseResult)){
    if(key==="readinessScore"||key==="comparisonDiagnostics")continue;
    assert.deepStrictEqual(formingResult[key],baseResult[key],`field "${key}" changed when only a forming candle was added`);
  }
  for(const key of Object.keys(baseResult.comparisonDiagnostics)){
    if(key==="readinessScore")continue;
    assert.deepStrictEqual(formingResult.comparisonDiagnostics[key],baseResult.comparisonDiagnostics[key],`comparisonDiagnostics.${key} changed when only a forming candle was added`);
  }

  // ...while readinessScore strictly increases on the strength of the forming-candle evidence alone.
  assert(formingResult.readinessScore>baseResult.readinessScore,`expected readinessScore to rise above ${baseResult.readinessScore}, got ${formingResult.readinessScore}`);
  assert(formingResult.readinessScore<=100);

  // TRIGGER ACTIVE always forces readinessScore to exactly 100, regardless of the bonus inputs.
  const activeFacts={
    fresh:true,profile:{early:"1m",trigger:"3m",primary:"5m",setups:["3m","5m"],structures:["15m","1h"],boundaries:["4h","1d"],eventWindow:7,chaseAtr:1.35,minNetRr:1.35},
    directionalPermission:{permission:true,direction:"LONG",score:84,longScore:84,shortScore:31,reason:"LONG primary/structural permission",breakdown:{}},
    setup:{valid:true,identity:"BTCUSDT|quick|LONG|structural-retest",family:"Structural retest",tf:"5m",interacted:true,interactionTime:120,reactionConfirmed:true,invalidated:false,repeatedTests:1,nonEma:true},
    setupComponents:{structuralLocation:90,regimeAlignment:86,eventLevelQuality:84,invalidationTargetGeometry:82,volatilitySuitability:85},
    trigger:{microstructureShift:true,shiftTime:180,displacementQuality:88,wickHeavy:false,flow:{effective:true,absorption:false,ineffectiveHighVolume:false,directionalImbalance:.18,priceProgressAtr:.72,efficiency:1.1,evidence:["Effective directional flow"]},participation:{state:"STRONG",score:88,credibleAbsorption:false,persistence:.75},retestHeld:true,qualifiedFollowThrough:false,freshnessScore:92,evidence:[]},
    opposition:{effective:false,evidence:[],neutral:true},volatility:{regime:"Expanding/controlled",controlledAcceptance:true,realizedRangePercentile:78},geometry:{netRr:2.1,viable:true},current:{originDistanceAtr:.22,chased:false,adverseEvidenceSafety:90}
  };
  const activeEngine=context.createSignalEngineB();
  const activeResult=activeEngine.evaluateFacts(activeFacts,{horizonId:"quick",symbol:"BTCUSDT",version:1,directionMode:"LONG"});
  assert.equal(activeResult.entryState,"TRIGGER ACTIVE");
  assert.equal(activeResult.readinessScore,100);

  // Shared fixture for the chase-distance tests below: identical gates, scores and
  // forming/early/momentum bonus signals throughout; only current.originDistanceAtr varies.
  const chaseFixtureBase={
    fresh:true,profile:{early:"1m",trigger:"3m",primary:"5m",setups:["3m","5m"],structures:["15m","1h"],boundaries:["4h","1d"],eventWindow:7,chaseAtr:1.35,minNetRr:1.35},
    directionalPermission:{permission:true,direction:"LONG",score:84,longScore:84,shortScore:31,reason:"LONG primary/structural permission",breakdown:{}},
    setup:{valid:true,identity:"BTCUSDT|quick|LONG|chase-fixture",family:"Structural retest",tf:"5m",interacted:true,interactionTime:120,reactionConfirmed:true,invalidated:false,repeatedTests:1,nonEma:true},
    setupComponents:{structuralLocation:90,regimeAlignment:86,eventLevelQuality:84,invalidationTargetGeometry:82,volatilitySuitability:85},
    trigger:{microstructureShift:true,shiftTime:180,displacementQuality:88,wickHeavy:false,flow:{effective:true,absorption:false,ineffectiveHighVolume:false,directionalImbalance:.18,priceProgressAtr:.72,efficiency:1.1,evidence:["Effective directional flow"]},participation:{state:"STRONG",score:88,credibleAbsorption:false,persistence:.75},retestHeld:true,qualifiedFollowThrough:false,freshnessScore:92,evidence:[]},
    // opposition stays effective throughout so the noEffectivePrimaryOpposition gate fails and
    // the fixture never reaches TRIGGER ACTIVE (which would force readinessScore to a flat 100
    // and hide the chase-distance effect entirely).
    opposition:{effective:true,evidence:["5m opposing flow produced 0.40 ATR progress"],neutral:false},
    volatility:{regime:"Expanding/controlled",controlledAcceptance:true,realizedRangePercentile:78},
    geometry:{netRr:2.1,viable:true},
    readinessSignals:{
      formingTrigger:{available:true,progress:.6,imbalance:.5},
      early:{available:true,progress:.5,closeShare:.7},
      momentum:{available:true,recentImbalance:.3,priorImbalance:.05}
    }
  };
  const buildChaseFacts=originDistanceAtr=>({...chaseFixtureBase,current:{price:101,originDistanceAtr,chased:originDistanceAtr>chaseFixtureBase.profile.chaseAtr,adverseEvidenceSafety:90}});
  const evaluateChase=originDistanceAtr=>context.createSignalEngineB().evaluateFacts(buildChaseFacts(originDistanceAtr),{horizonId:"quick",symbol:"BTCUSDT",version:1,directionMode:"LONG"});

  // (a) Same gate statuses, same setupScore/triggerScore, same forming/early/momentum bonus
  // inputs -- only originDistanceAtr differs. The nearer setup must score higher or equal.
  const nearResult=evaluateChase(.1),farResult=evaluateChase(1.2);
  assert.notEqual(nearResult.entryState,"TRIGGER ACTIVE","fixture must not be maxed out, or the chase dampener has nothing to dampen");
  assert.equal(nearResult.entryState,farResult.entryState);
  assert.deepStrictEqual(nearResult.decision.gateStatuses,farResult.decision.gateStatuses);
  assert.deepStrictEqual(nearResult.comparisonDiagnostics.hardGates,farResult.comparisonDiagnostics.hardGates);
  assert.equal(nearResult.comparisonDiagnostics.setupScore,farResult.comparisonDiagnostics.setupScore);
  assert.equal(nearResult.comparisonDiagnostics.triggerScore,farResult.comparisonDiagnostics.triggerScore);
  assert(nearResult.readinessScore>=farResult.readinessScore,`expected nearer setup (originDistanceAtr=0.1) readinessScore ${nearResult.readinessScore} to be >= farther setup (originDistanceAtr=1.2) readinessScore ${farResult.readinessScore}`);
  assert(nearResult.readinessScore>farResult.readinessScore,"expected the chase dampener to strictly separate the two readinessScores given the large distance gap");

  // (b) Crossing the chaseWarning threshold (60% of chaseAtr = 0.81) flips the flag true, while
  // entryState and every one of the 16 hard gates stay exactly as they were.
  const belowWarningResult=evaluateChase(.5),aboveWarningResult=evaluateChase(1.0);
  assert.equal(belowWarningResult.comparisonDiagnostics.chaseWarning,false,"0.5 ATR is below the 0.81 ATR chaseWarning threshold");
  assert.equal(aboveWarningResult.comparisonDiagnostics.chaseWarning,true,"1.0 ATR is above the 0.81 ATR chaseWarning threshold");
  assert.equal(belowWarningResult.entryState,aboveWarningResult.entryState);
  assert.deepStrictEqual(belowWarningResult.decision.gateStatuses,aboveWarningResult.decision.gateStatuses);
  assert.deepStrictEqual(belowWarningResult.comparisonDiagnostics.hardGates,aboveWarningResult.comparisonDiagnostics.hardGates);
  assert.equal(belowWarningResult.decision.gateStatuses.notChased,"passed","both fixtures stay under chaseAtr, so the separate hard notChased gate must not fire");

  console.log("readiness score tests: PASS",{baseEntryState:baseResult.entryState,baseReadinessScore:baseResult.readinessScore,formingReadinessScore:formingResult.readinessScore,nearChaseReadinessScore:nearResult.readinessScore,farChaseReadinessScore:farResult.readinessScore,belowWarning:belowWarningResult.comparisonDiagnostics.chaseWarning,aboveWarning:aboveWarningResult.comparisonDiagnostics.chaseWarning});
  return {passed:true};
})();
module.exports=run;if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
