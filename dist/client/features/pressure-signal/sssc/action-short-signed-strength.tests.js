"use strict";
const assert=require("assert");
const calc=require("./calculation.js");

const summary={direction:-50,directionalStrength:-30,acceleration:-5,aggregateConfidence:80,timingRisk:20,roleCoverage:{regime:1,structure:1},triggerRisk:{unanimousStrongOpposition:false}};
const setup=calc.evaluateMarketSetup(summary);
assert.equal(setup.setupAction,"FRESH SHORT");

const noPosition=calc.evaluatePositionAction(setup,{hasPosition:false,side:null});
const shortPosition=calc.evaluatePositionAction(setup,{hasPosition:true,side:"SHORT"});
const longPosition=calc.evaluatePositionAction(setup,{hasPosition:true,side:"LONG"});
assert.equal(setup.setupAction,"FRESH SHORT","pure setup action must not depend on position context");
assert.equal(noPosition.positionAction,null);
assert.equal(shortPosition.positionAction,"ADD");
assert.equal(longPosition.positionAction,"EXIT");

// Exact worked example from the aggregate/decision-layer investigation.
const workedInput={direction:50,directionalStrength:30,acceleration:0,aggregateConfidence:80,timingRisk:20,roleCoverage:{regime:1,structure:1},triggerRisk:{unanimousStrongOpposition:false}};
const workedContexts=[{hasPosition:false,side:null},{hasPosition:true,side:"LONG"},{hasPosition:true,side:"SHORT"}];
const workedSetups=workedContexts.map(()=>calc.evaluateMarketSetup(workedInput).setupAction);
const workedExample=calc.evaluateMarketSetup(workedInput);
const workedNoPosition=calc.evaluatePositionAction(workedExample,{hasPosition:false,side:null});
const workedLong=calc.evaluatePositionAction(workedExample,{hasPosition:true,side:"LONG"});
const workedShort=calc.evaluatePositionAction(workedExample,{hasPosition:true,side:"SHORT"});
assert.equal(workedExample.setupAction,"FRESH LONG");
assert.equal(workedNoPosition.positionAction,null);
assert.equal(workedLong.positionAction,"ADD");
assert.equal(workedLong.positionSide,"LONG");
assert.equal(workedShort.positionAction,"EXIT");
assert.equal(workedShort.positionSide,"SHORT");
assert.deepEqual(workedSetups,["FRESH LONG","FRESH LONG","FRESH LONG"],"setupAction must remain identical for no position, open LONG, and open SHORT");

const neutralBoundary=calc.evaluateMarketSetup({...workedInput,directionalStrength:10});
const aboveNeutralBoundary=calc.evaluateMarketSetup({...workedInput,directionalStrength:10.01});
const shortNeutralBoundary=calc.evaluateMarketSetup({...summary,directionalStrength:-10});
const belowNeutralBoundary=calc.evaluateMarketSetup({...summary,directionalStrength:-10.01});
assert.equal(neutralBoundary.setupAction,"WAIT","neutral-band strength must not qualify as FRESH LONG");
assert.equal(aboveNeutralBoundary.setupAction,"FRESH LONG");
assert.equal(shortNeutralBoundary.setupAction,"WAIT","neutral-band strength must not qualify as FRESH SHORT");
assert.equal(belowNeutralBoundary.setupAction,"FRESH SHORT");

const invertedStrength=calc.evaluateMarketSetup({...summary,directionalStrength:30});
assert.equal(calc.evaluatePositionAction(invertedStrength,{hasPosition:true,side:"SHORT"}).positionAction,"HOLD","positive strength must not be inverted into ADD SHORT");

const highRisk=calc.evaluateMarketSetup({...summary,timingRisk:90});
const blockedAdd=calc.evaluatePositionAction(highRisk,{hasPosition:true,side:"SHORT"});
assert.equal(blockedAdd.positionAction,"HOLD","ADD must retain the execution-risk quality gate");
assert.match(blockedAdd.reason,/high timing risk/i);

const exitAtHighRisk=calc.evaluatePositionAction(
  calc.evaluateMarketSetup({direction:40,directionalStrength:30,acceleration:0,aggregateConfidence:10,timingRisk:95,roleCoverage:{regime:1,structure:1},triggerRisk:{unanimousStrongOpposition:false}}),
  {hasPosition:true,side:"SHORT"}
);
assert.equal(exitAtHighRisk.positionAction,"EXIT","protective EXIT must bypass entry-quality gates");

console.log("sssc split market/SHORT position action regression tests: PASS");
