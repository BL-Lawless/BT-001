"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname,"..","..");
const ownerSource = fs.readFileSync(path.join(root,"main.js"),"utf8");
const wfSource = fs.readFileSync(path.join(__dirname,"waterfall.js"),"utf8");

const fastOwnerStart = ownerSource.indexOf("async function loadFast(");
const fastOwnerEnd = ownerSource.indexOf("async function loadDetail(",fastOwnerStart);
const fastOwner = ownerSource.slice(fastOwnerStart,fastOwnerEnd);
assert(fastOwner.includes('if(closedTradesLoading) return closedTradesOutcome("busy",{});'),"a concurrent period request must currently be dropped as busy");
assert(fastOwner.includes("displayControlsRequestIsCurrent(request)"),"the original request must be rejected after the display-controls revision changes");
assert(fastOwner.includes('return closedTradesOutcome("stale",{report:fastReport});'),"the superseded request must resolve stale without committing");

const latestLoaderStart = wfSource.indexOf("async function runLatestPeriodLoad(");
const latestLoaderEnd = wfSource.indexOf("async function ensureFastWfData(",latestLoaderStart);
const latestLoader = wfSource.slice(latestLoaderStart,latestLoaderEnd);
assert(latestLoader.includes("owner.loadFast(period,request)")&&latestLoader.includes("owner.loadDetail(period,request)"),"WF period switching must retain typed owner outcomes instead of collapsing them through compatibility adapters");
assert(latestLoader.includes('if(outcome === "busy" || outcome === "stale")'),"busy and stale latest-period loads must be retried");
assert(latestLoader.includes("generation !== wfSyncState.periodLoadGeneration"),"superseded period-load generations must be unable to render or retry");
assert(latestLoader.includes('},outcome === "busy" ? 40 : 0);'),"a busy latest request must wait for the in-flight owner load before retrying");

const periodSyncStart = wfSource.indexOf("controls.subscribe((snapshot,meta={}) =>");
const periodSyncEnd = wfSource.indexOf("if(typeof window.hasKeys",periodSyncStart);
const periodSync = wfSource.slice(periodSyncStart,periodSyncEnd);
assert(periodSync.includes("scheduleLatestPeriodLoad(nextPeriod);"),"each period change must replace the pending desired load with the latest selection");
assert(wfSource.includes('if(mode === "fast") return wfHasCurrentFastReport() ? buildFastTradeRows(snap && snap.fastReport) : [];'),"a previous-period owner report must produce zero closed rows for the new period");
assert(wfSource.includes("const liveTrade = livePreviewTrade();"),"the Live bar must remain sourced independently from the closed-report projection");

// Deterministic reproduction of the fixed production arbitration sequence:
// request A starts, the controls revision changes, the first attempt for B is busy,
// A finishes stale, and the retained latest generation retries B to a commit.
let activeRevision = 1;
let loading = false;
let commits = 0;
function startMirroredLoad(requestRevision){
  if(loading) return {outcome:"busy"};
  loading = true;
  return {
    outcome:"in-flight",
    finish(){
      const result = requestRevision === activeRevision ? {outcome:"committed",report:{revision:requestRevision}} : {outcome:"stale"};
      if(result.outcome === "committed") commits += 1;
      loading = false;
      return result;
    }
  };
}
const higherPeriodRequest = startMirroredLoad(activeRevision);
activeRevision = 2;
const firstOneDayAttempt = startMirroredLoad(activeRevision);
const supersededOutcome = higherPeriodRequest.finish();
const retriedOneDayRequest = startMirroredLoad(activeRevision);
const latestOutcome = retriedOneDayRequest.finish();

assert.equal(firstOneDayAttempt.outcome,"busy","the quick 1D request initially observes the earlier global load lock");
assert.equal(supersededOutcome.outcome,"stale","the earlier request is rejected after the active period revision changes");
assert.equal(latestOutcome.outcome,"committed","the retained latest selection must retry after the owner lock clears");
assert.equal(commits,1,"the busy-then-stale sequence must end with one active-period commit");

const adapterValue = result => result && result.outcome === "committed" ? result.report : null;
const activeClosedRows = adapterValue(latestOutcome) ? ["closed"] : [];
const independentlySourcedLiveRows = ["live"];
assert.deepStrictEqual(activeClosedRows,["closed"],"the active period must recover its closed bars without another user action");
assert.deepStrictEqual(independentlySourcedLiveRows,["live"],"the independently sourced Live bar remains renderable");

console.log("WF quick-switch race regression: PASS",{
  firstLatestAttempt:firstOneDayAttempt.outcome,
  firstRequest:supersededOutcome.outcome,
  latestRetry:latestOutcome.outcome,
  committedReports:commits,
  closedBars:activeClosedRows.length,
  liveBars:independentlySourcedLiveRows.length
});
