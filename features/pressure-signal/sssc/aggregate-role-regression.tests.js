"use strict";
const assert=require("assert");
const calc=require("./calculation.js");

const unavailable=interval=>({available:false,interval});
const diagnostic=(interval,direction,directionalStrength=direction,extra={})=>({available:true,interval,direction,directionalStrength,acceleration:5,reliability:"full-warmup",...extra});
const configured=Object.keys(calc.TIMEFRAME_ROLES);

// A lone 1M diagnostic must identify trigger-only coverage, not full aggregate coverage.
const triggerOnly=calc.aggregate(configured.map(interval=>interval==="1m"?diagnostic(interval,80):unavailable(interval)));
assert.equal(triggerOnly.coverage,1/7);
assert.equal(triggerOnly.roleCoverage.trigger,.5);
assert.equal(triggerOnly.roleCoverage.regime,0);
assert.equal(triggerOnly.roleCoverage.structure,0);
assert.equal(triggerOnly.roleCoverage.bridge,0);
assert.equal(triggerOnly.roleCoverage.execution,0);
assert.equal(triggerOnly.confidenceConstraint,"coverage");
assert.equal(triggerOnly.reliability.fullWarmup,1);
assert.equal(triggerOnly.reliability.unavailable,6);
assert.equal(calc.evaluateMarketSetup(triggerOnly).setupAction,"WAIT","trigger-only coverage must never qualify as fresh");
assert.match(calc.evaluateMarketSetup(triggerOnly).reason,/regime or structure coverage/i);

// Placeholder aggregation is equal by role, not flat by diagnostic count.
const equalRoles=calc.aggregate([
  diagnostic("1d",100),diagnostic("4h",100),diagnostic("1m",-100),
  ...configured.filter(interval=>!["1d","4h","1m"].includes(interval)).map(unavailable)
]);
assert.equal(equalRoles.roleSummaries.regime.direction,100);
assert.equal(equalRoles.roleSummaries.trigger.direction,-100);
assert.equal(equalRoles.direction,0,"regime and trigger role averages must receive equal placeholder weighting");

// Risk must identify trigger intervals by role, regardless of array order.
const base=[
  diagnostic("1d",60),diagnostic("4h",60),diagnostic("1h",60),diagnostic("15m",60),
  diagnostic("5m",60),diagnostic("3m",-20),diagnostic("1m",-100)
];
const ordered=calc.aggregate(base);
const reordered=calc.aggregate([base[6],base[2],base[4],base[0],base[5],base[1],base[3]]);
assert.equal(ordered.triggerRisk.disagreeingCount,2);
assert.equal(ordered.triggerRisk.penalty,reordered.triggerRisk.penalty);
assert.equal(ordered.timingRisk,reordered.timingRisk);
assert(ordered.triggerRisk.penalty>0&&ordered.triggerRisk.penalty<14,"one weak plus one strong disagreement must scale below the maximum");

const unanimousStrongOpposition=calc.aggregate([
  diagnostic("1d",100),diagnostic("4h",100),diagnostic("1h",100),diagnostic("15m",100),
  diagnostic("5m",100),diagnostic("3m",-60),diagnostic("1m",-60)
]);
assert.equal(unanimousStrongOpposition.triggerRisk.unanimousStrongOpposition,true);
assert(unanimousStrongOpposition.aggregateConfidence>=52&&unanimousStrongOpposition.timingRisk<=72,"veto fixture must otherwise qualify");
assert.equal(calc.evaluateMarketSetup(unanimousStrongOpposition).setupAction,"WAIT");
assert.match(calc.evaluateMarketSetup(unanimousStrongOpposition).reason,/unanimous strong trigger opposition/i);

// Missing trigger data must not substitute a slower timeframe.
const missingOneTrigger=calc.aggregate(base.map(item=>item.interval==="1m"?unavailable("1m"):item));
assert.equal(missingOneTrigger.triggerRisk.availableCount,1);
assert.equal(missingOneTrigger.triggerRisk.totalCount,2);
assert.equal(missingOneTrigger.triggerRisk.coverage,.5);
assert.equal(missingOneTrigger.triggerRisk.disagreeingCount,1);
assert.equal(missingOneTrigger.triggerRisk.penalty,14*(.2/2));

// Coverage and alignment must remain distinct and explain the clarity constraint.
const fullDisagreement=calc.aggregate([
  diagnostic("1d",60),diagnostic("4h",60),diagnostic("1h",-60),diagnostic("15m",60),
  diagnostic("5m",-60),diagnostic("3m",60),diagnostic("1m",-60)
]);
assert.equal(fullDisagreement.coverage,1);
assert.equal(fullDisagreement.alignment,0);
assert.equal(fullDisagreement.confidenceConstraint,"alignment");

// Missing metric fields must reduce metric-specific coverage rather than count as zero.
const missingStrength=calc.aggregate([
  {...diagnostic("1d",80),directionalStrength:undefined},diagnostic("4h",80,40),
  ...configured.filter(interval=>!["1d","4h"].includes(interval)).map(unavailable)
]);
assert.equal(missingStrength.roleSummaries.regime.directionalStrength,40);
assert.equal(missingStrength.metricCoverage.direction.availableCount,2);
assert.equal(missingStrength.metricCoverage.directionalStrength.availableCount,1);
assert.equal(missingStrength.roleSummaries.regime.metricCoverage.directionalStrength.ratio,.5);

// Reliability is preserved globally and per role without changing placeholder weights.
const reliability=calc.aggregate([
  diagnostic("1d",50,30,{reliability:"minimum-warmup"}),
  diagnostic("4h",50,30,{reliability:"full-warmup"}),
  ...configured.filter(interval=>!["1d","4h"].includes(interval)).map(unavailable)
]);
assert.equal(reliability.reliability.minimumWarmup,1);
assert.equal(reliability.reliability.fullWarmup,1);
assert.equal(reliability.reliability.byRole.regime.minimumWarmup,1);
assert.equal(reliability.reliability.byRole.regime.fullWarmup,1);

console.log("sssc role-based aggregate regression tests: PASS");
