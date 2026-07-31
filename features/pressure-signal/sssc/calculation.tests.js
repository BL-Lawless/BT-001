"use strict";
const assert=require("assert");
const calc=require("./calculation.js");

const closeTo=(actual,expected,epsilon=1e-9)=>assert(Math.abs(actual-expected)<epsilon,`${actual} must be within ${epsilon} of ${expected}`);
const slots=[9,21,55,100,200].map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
const hourSeconds=60*60,baseTime=1700000000;
assert.equal(calc.SSSC_ATR_PERIOD,12);
const rows=Array.from({length:1000},(_,index)=>({
  time:baseTime+index*hourSeconds,open:100+index*.02+Math.sin((index-1)/11),close:100+index*.02+Math.sin(index/11),
  high:101+index*.02+Math.sin(index/11),low:99+index*.02+Math.sin(index/11),final:true,
  volume:10,baseVolume:10,quoteVolume:(100+index*.02)*10
}));
const diagnostic=calc.calculateTimeframe({label:"1H",interval:"1h",rows,slots,minimumRows:600,fullRows:1000});

assert.equal(diagnostic.available,true);
assert.equal(diagnostic.reliability,"full-warmup");
assert(diagnostic.directionalStrength>0,"the steadily rising audit fixture must report positive current strength");
assert(diagnostic.acceleration<0,"the audit fixture must continue to identify deceleration separately from positive strength");
assert.equal(diagnostic.expansionContraction,diagnostic.acceleration,"the existing unsigned value must remain available under its explicit name");
assert(Number.isFinite(diagnostic.signedAcceleration)&&Number.isFinite(diagnostic.directionalAcceleration));
assert.equal(diagnostic.strengthState,"Bullish Strength");
assert.equal(diagnostic.accelerationState,"Strong Contraction");
assert.equal(diagnostic.normalization.status,"available");
assert.equal(diagnostic.normalization.atrPeriod,12);
assert(diagnostic.atr>0&&diagnostic.atrInBps>0);
assert(diagnostic.RV.recent>0&&diagnostic.RV.prior>0);
assert.equal(diagnostic.resolvedElapsedHorizons.slopeMs,8*60*60*1000);
assert.equal(diagnostic.resolvedElapsedHorizons.crossoverStaleMs,24*60*60*1000);
assert.equal(diagnostic.normalizedDistances.adjacentGaps.length,4);
assert(Object.isFrozen(diagnostic)&&Object.isFrozen(diagnostic.crosses)&&Object.isFrozen(diagnostic.emaVals));

// A microscopic but perfectly ordered stack must no longer receive full stack credit.
const tinyStack=[100.0004,100.0003,100.0002,100.0001,100];
assert.equal(calc.rawStackDirection(tinyStack),100);
assert(calc.stackDirection(tinyStack,1)<1,"a 0.0001-apart stack must be gated by insignificant ATR-relative separation");

assert.equal(calc.phaseLabel({compressionFactor:1,directionalStrength:60,direction:60,acceleration:0}),"Bullish Trend / Expansion");
assert.equal(calc.phaseLabel({compressionFactor:1,directionalStrength:-60,direction:60,acceleration:0}),"Transition","trend phase must require signed strength to agree with direction");
assert.equal(calc.phaseLabel({compressionFactor:.4,directionalStrength:60,direction:60,acceleration:0}),"Compressed");
assert.equal(calc.phaseLabel({compressionFactor:1,directionalStrength:5,direction:5,acceleration:0}),"Directionally Mixed");
assert.equal(calc.eventForLevel(100,100,1),"Near");
assert.equal(calc.eventForLevel(101,100,1),"Above");
assert.equal(calc.eventForLevel(99,100,1),"Below");
assert.equal(calc.clusterState([100,100.49],1),"Tight");
assert.equal(calc.clusterState([100,100.75],1),"Moderate Separation");
assert.equal(calc.clusterState([100,101.25],1),"Wide Separation");

// The old average-only blind spot: three tight pairs plus one wide pair crossed the old threshold.
const unevenStack=[100.403,100.402,100.401,100.4,100];
const evenlySeparated=[100.4,100.3,100.2,100.1,100];
const uneven=calc.separationMetrics(unevenStack,1),even=calc.separationMetrics(evenlySeparated,1);
assert(uneven.average>.10,"fixture must reproduce the old average-only escape in normalized units");
assert(uneven.compressionFactor<.01,"minimum separation and dispersion must retain strong compression");
assert(even.compressionFactor>.99,"uniform meaningful separation must not be compressed");
assert(18*(1-uneven.compressionFactor)>18*(1-even.compressionFactor),"compression penalty must scale continuously with structure quality");

// Cross contribution must distinguish a decisive fresh cross from a flat/barely-forming one and a stale one.
const minuteContext={atr:1,intervalMs:60000,staleAfterMs:24*60000};
const timedSeries=values=>values.map((value,index)=>({time:baseTime+index*60,value}));
const freshCross=calc.crossState(timedSeries([99,99,101]),timedSeries([100,100,100]),minuteContext);
const flatCross=calc.crossState(timedSeries([100.01,100.02,100.03]),timedSeries([100,100,100]),minuteContext);
assert.equal(freshCross.label,"Bull X Fresh");
assert.equal(flatCross.label,"Bull forming");
const freshWeight=calc.crossWeight(freshCross);
const formingWeight=calc.crossWeight(flatCross);
const staleWeight=calc.crossWeight({dir:1,quality:25,ageMs:25*60000,staleAfterMs:24*60000});
assert(freshWeight>formingWeight&&formingWeight>staleWeight);
closeTo(freshWeight,.85);
closeTo(formingWeight,.35);
assert.equal(staleWeight,0);

// A cross across a reconnect/data gap must never be called fresh.
const gapFast=[{time:baseTime,value:99},{time:baseTime+60,value:99},{time:baseTime+11*60,value:101}];
const gapSlow=timedSeries([100,100]).slice(0,2).concat({time:baseTime+11*60,value:100});
const gapCross=calc.crossState(gapFast,gapSlow,minuteContext);
assert.notEqual(gapCross.label,"Bull X Fresh");
assert.equal(gapCross.label,"Bull X Timing Unavailable");
assert.equal(gapCross.normalizationStatus,"unavailable");

// The same raw 3 bps gap now depends on timeframe-local volatility, unlike the old 3.5 bps cutoff.
const threeBpsFast=timedSeries([100.03,100.03,100.03]),threeBpsSlow=timedSeries([100,100,100]);
const quietCross=calc.crossState(threeBpsFast,threeBpsSlow,{...minuteContext,atr:.20});
const volatileCross=calc.crossState(threeBpsFast,threeBpsSlow,{...minuteContext,atr:.40});
assert(3<3.5,"fixture must have passed the old fixed-bps forming threshold");
assert.equal(quietCross.label,"None","3 bps must not be considered close when it exceeds 0.10 ATR");
assert.equal(volatileCross.label,"Bull forming","the same raw gap must be forming when it is within 0.10 ATR");

// Zero ATR/RV must report normalization unavailable instead of emitting a broken score.
const flatRows=Array.from({length:1000},(_,index)=>({time:baseTime+index*hourSeconds,open:100,high:100,low:100,close:100,final:true}));
const flatDiagnostic=calc.calculateTimeframe({label:"1H",interval:"1h",rows:flatRows,slots,minimumRows:600,fullRows:1000});
assert.equal(flatDiagnostic.available,false);
assert.equal(flatDiagnostic.reason,"normalization-unavailable");
assert(flatDiagnostic.normalization.unavailable.some(reason=>reason.includes("atr-near-zero")));
assert(flatDiagnostic.normalization.unavailable.some(reason=>reason.includes("realized-volatility-near-zero")));

// Live/forming volatility uses only finalized candles, even when the forming candle spikes.
const forming={...rows.at(-1),time:rows.at(-1).time+hourSeconds,open:rows.at(-1).close,close:rows.at(-1).close+5,high:rows.at(-1).close+100,low:rows.at(-1).close-100,final:false};
const liveDiagnostic=calc.calculateTimeframe({label:"1H",interval:"1h",rows:rows.concat(forming),slots,minimumRows:600,fullRows:1000});
assert.equal(liveDiagnostic.available,true);
closeTo(liveDiagnostic.atr,diagnostic.atr,1e-12);

// Confirming strength must increase clarity; zero strength must not score higher.
const allIntervals=Object.keys(calc.TIMEFRAME_ROLES);
const completeSet=(directionalStrength,direction=100)=>allIntervals.map(interval=>({available:true,interval,direction,directionalStrength,acceleration:0,reliability:"full-warmup"}));
const zeroMomentum=calc.aggregate(completeSet(0));
const maxConfirming=calc.aggregate(completeSet(100));
const maxOpposing=calc.aggregate(completeSet(-100));
assert.equal(zeroMomentum.aggregateConfidence,84);
assert.equal(maxConfirming.aggregateConfidence,96);
assert.equal(maxOpposing.aggregateConfidence,72);
assert(maxConfirming.aggregateConfidence>zeroMomentum.aggregateConfidence&&zeroMomentum.aggregateConfidence>maxOpposing.aggregateConfidence);

// Timing risk is an independent trigger-role veto, not a confidence-derived duplicate gate.
const triggerOpposition=calc.aggregate(allIntervals.map(interval=>({
  available:true,interval,direction:interval==="1m"?-100:100,directionalStrength:100,acceleration:0,reliability:"full-warmup"
})));
assert(triggerOpposition.aggregateConfidence>=52,"fixture must clear the independent confidence gate");
assert.equal(triggerOpposition.triggerRisk.unanimousStrongOpposition,false,"fixture must not use the explicit unanimous trigger veto");
assert(triggerOpposition.timingRisk>72,"one maximally opposing trigger timeframe must independently raise timing risk above its gate");
const timingBlocked=calc.evaluateMarketSetup(triggerOpposition);
assert.equal(timingBlocked.setupAction,"WAIT");
assert.equal(timingBlocked.reason,"Timing risk above setup threshold");

// Coverage is data availability; alignment is actual directional sign consensus.
const contradictory=calc.aggregate([
  {available:true,interval:"1d",direction:60,directionalStrength:20,acceleration:5},
  {available:true,interval:"4h",direction:60,directionalStrength:20,acceleration:5},
  {available:true,interval:"1h",direction:-60,directionalStrength:-20,acceleration:-5},
  {available:true,interval:"15m",direction:60,directionalStrength:20,acceleration:5},
  {available:true,interval:"5m",direction:-60,directionalStrength:-20,acceleration:-5},
  {available:true,interval:"3m",direction:60,directionalStrength:20,acceleration:5},
  {available:true,interval:"1m",direction:-60,directionalStrength:-20,acceleration:-5}
]);
assert.equal(contradictory.coverage,1);
assert.equal(contradictory.alignment,0);
assert.equal(contradictory.aggregateConfidence,2.4);
assert(!Object.prototype.hasOwnProperty.call(contradictory,"availability"));

const summary=calc.aggregate([diagnostic]);
assert.equal(summary.coverage,1/7);
assert.equal(summary.alignment,1);
assert.equal(summary.directionalStrength,diagnostic.directionalStrength);
assert.equal(summary.acceleration,diagnostic.acceleration);
assert.equal(summary.roleCoverage.structure,1);
assert.equal(summary.roleCoverage.trigger,0);
assert(Object.isFrozen(summary));

const minimum=calc.calculateTimeframe({label:"1H",interval:"1h",rows:rows.slice(-600),slots,minimumRows:600,fullRows:1000});
assert.equal(minimum.available,true);
assert.equal(minimum.reliability,"minimum-warmup");
const insufficient=calc.calculateTimeframe({label:"1H",interval:"1h",rows:rows.slice(-599),slots,minimumRows:600,fullRows:1000});
assert.equal(insufficient.available,false);
assert.equal(insufficient.reason,"warmup-limited");

console.log("sssc calculation tests: PASS");
