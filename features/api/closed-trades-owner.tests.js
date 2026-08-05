"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname,"..","..","main.js"),"utf8");

// WF-EXT-CT01/CT03: single commit/publication point.
assert(source.includes("function commitClosedTrades(next={},meta={})"),"closed-trade writes must use one commit function");
assert(source.includes('new CustomEvent("bt001:closed-trades-state"'),"closed-trade commits must publish snapshots");
assert(source.includes("window.BT001_CLOSED_TRADES = Object.freeze({"),"closed-trades owner API must be exported");
assert(source.includes("loadFast,"),"owner API must expose loadFast");
assert(source.includes("loadDetail,"),"owner API must expose loadDetail");
assert(source.includes("snapshot:closedTradesSnapshot,"),"owner API must expose snapshot");

// WF-EXT-CT03: fast load, detail load, reconstruction route, and clear all commit
// through the same function - no direct CLOSED_TRADES_STATE.markers/links assignment
// remains outside commitClosedTrades.
{
  const commitFnBody = source.slice(source.indexOf("function commitClosedTrades("),source.indexOf("function clearClosedTradesOwner("));
  const outsideCommitFn = source.slice(0,source.indexOf("function commitClosedTrades(")) + source.slice(source.indexOf("function clearClosedTradesOwner("));
  assert(/CLOSED_TRADES_STATE\.(markers|links|reportProjection|fastReport) = /.test(commitFnBody),"commitClosedTrades must be the place fields are actually written");
  assert(!/CLOSED_TRADES_STATE\.(markers|links|reportProjection|fastReport) = /.test(outsideCommitFn),"no call site may assign closed-trade fields outside commitClosedTrades");
}
assert(source.includes('reportDetailLevel:"fast"'),"fast load must commit through the owner with the fast detail level");
assert(source.includes('reportDetailLevel:"detail"'),"detail load must commit through the owner with the detail level");

// WF-EXT-CT02: distinguishable outcomes.
assert(source.includes('function closedTradesOutcome(outcome,extra={})'),"loadFast/loadDetail must return a typed outcome envelope");
assert(source.includes('closedTradesOutcome("unavailable"'),"missing credentials must be a distinguishable outcome");
assert(source.includes('closedTradesOutcome("busy"'),"an in-flight load must be a distinguishable outcome");
assert(source.includes('closedTradesOutcome("stale"'),"a rejected stale result must be a distinguishable outcome");
assert(source.includes('closedTradesOutcome("error"'),"a failed request must be a distinguishable outcome");
assert(source.includes('closedTradesOutcome("committed"'),"a successful commit must be a distinguishable outcome");

// WF-EXT-CT04: compatibility adapters keep presentation side effects out of the owner.
assert(source.includes("async function loadClosedTradesFastForPeriod(period,opt={}){"),"legacy fast loader must remain callable");
assert(source.includes("async function loadClosedTradesForPeriod(period,opt={}){"),"legacy detail loader must remain callable");
assert(source.includes("async function loadClosedTradesForVisibleRange(opt={}){"),"visible-range loader must remain callable");
assert(source.includes('async function loadClosedTradesToday(opt={}){'),"today loader must remain callable");
assert(source.includes("async function loadTrades(opt={}){"),"loadTrades must remain callable");
assert(source.includes("function clearTrades(){"),"clearTrades must remain callable");
const ownerBody = source.slice(source.indexOf("async function loadFast("),source.indexOf("async function loadDetail("));
assert(!ownerBody.includes("closedTradeStatus(") || ownerBody.includes("onProgress"),"loadFast must not call closedTradeStatus directly, only through an injected hook");
assert(!ownerBody.includes("updatePositionStrip("),"loadFast must not trigger UI side effects");
assert(!ownerBody.includes("draw()"),"loadFast must not trigger draw() directly");
const detailOwnerBody = source.slice(source.indexOf("async function loadDetail("),source.indexOf("function clear(){"));
assert(!detailOwnerBody.includes("updatePositionStrip("),"loadDetail must not trigger UI side effects");
assert(!detailOwnerBody.includes("updateTabTitle("),"loadDetail must not trigger UI side effects");
assert(!detailOwnerBody.includes("draw()"),"loadDetail must not trigger draw() directly");

// WF-EXT-CT05: neutral naming - wfMode must be gone, reportDetailLevel takes its place,
// and the rename must be confirmed WF-only (no other reader existed in the file).
assert(!source.includes(".wfMode"),"wfMode must be fully renamed as a live field - it had no reader outside WF's own wfDataMode()");
assert(source.includes("reportDetailLevel:"),"owner must use the neutral reportDetailLevel name");

// WF-EXT-CT06: the owner side of this contract. WF's own consumption of it (the
// absence of monkey-patches, its subscription to the publication, its snapshot reads,
// its acceptResult guard) moved to features/waterfall/waterfall.tests.js in WF-EXT3-05
// when WF itself moved out of main.js - this file only owns what main.js itself owns.
// Defense-in-depth guard kept intentionally - see report. Both the owner's intrinsic
// stale check and a caller-supplied acceptResult veto (still honored, whoever the
// caller is) remain active.
assert(source.includes("opt.acceptResult"),"owner must still honor a caller-supplied stale-period veto as an additional guard");
assert(source.includes("const stillCurrent = requestSymbol"),"owner must have its own intrinsic stale-result rejection");

console.log("closed trades owner static assertions: PASS");

// ---------------------------------------------------------------------------
// Behavioral mirror of the commit/outcome semantics (same style as the account-balance
// and open-position-visual owner tests): re-implements the pure logic to verify the
// contract, since main.js is a browser script with DOM/network dependencies it can't be
// required directly in Node.
// ---------------------------------------------------------------------------

const STATUS = new Set(["unavailable","ready","error"]);
let state = {
  markers:[],links:[],fundingIncomeRows:[],fundingIncomeFetchStats:{rows:0,start:0,end:0,symbol:""},
  unresolvedCount:0,fullReconstruction:null,reportProjection:null,reportDetailLevel:"none",fastReport:null
};
let meta = {revision:0,status:"unavailable",symbol:"",period:null,updatedAt:0,source:"unavailable",error:null};
let publishedCount = 0;

function commit(next={},m={}){
  if(Array.isArray(next.markers)) state.markers = next.markers;
  if(Array.isArray(next.links)) state.links = next.links;
  if("reportProjection" in next) state.reportProjection = next.reportProjection;
  if("fastReport" in next) state.fastReport = next.fastReport;
  if(next.reportDetailLevel != null) state.reportDetailLevel = next.reportDetailLevel;
  if(next.unresolvedCount != null) state.unresolvedCount = next.unresolvedCount;
  const status = STATUS.has(m.status) ? m.status : "unavailable";
  meta = {
    revision:meta.revision + 1,
    status,
    symbol:String(m.symbol || "").toUpperCase(),
    period:m.period || null,
    updatedAt:Date.now(),
    source:String(m.source || "commit"),
    error:status === "error" ? String(m.error || "Closed trades unavailable") : null
  };
  publishedCount++;
  return {...meta,mode:state.reportDetailLevel,markers:state.markers,links:state.links,fastReport:state.fastReport,reportProjection:state.reportProjection};
}

function outcome(kind,extra={}){
  return {outcome:kind,ok:kind === "committed",...extra};
}

// Simulated loadFast: distinguishes every outcome kind.
function simulateLoadFast({hasKeys,busy,requestSymbol,currentSymbolAtResolve,report}){
  if(!hasKeys) return outcome("unavailable",{reason:"missing-credentials"});
  if(busy) return outcome("busy",{});
  const stillCurrent = requestSymbol === currentSymbolAtResolve;
  if(!stillCurrent) return outcome("stale",{report});
  const snapshot = commit({fastReport:report,reportDetailLevel:"fast"},{status:"ready",symbol:requestSymbol,source:"load-fast"});
  return outcome("committed",{report,snapshot});
}

const missing = simulateLoadFast({hasKeys:false});
assert.equal(missing.outcome,"unavailable","missing credentials must be distinguishable from an empty report");
assert.equal(missing.ok,false);

const busy = simulateLoadFast({hasKeys:true,busy:true});
assert.equal(busy.outcome,"busy","an in-flight load must be distinguishable, not silently null");

const stale = simulateLoadFast({hasKeys:true,busy:false,requestSymbol:"BTCUSDT",currentSymbolAtResolve:"ETHUSDT",report:{summaries:[{net:5}]}});
assert.equal(stale.outcome,"stale","a symbol change mid-flight must reject the result as stale");
assert.equal(publishedCount,0,"a stale result must never publish - state stays untouched");

// WF-C02 regression: an empty-but-valid report must commit and be distinguishable from
// "no report available" (missing/busy/stale/error all carry no committed report).
const emptyValid = simulateLoadFast({hasKeys:true,busy:false,requestSymbol:"BTCUSDT",currentSymbolAtResolve:"BTCUSDT",report:{summaries:[],summary:{wins:0,losses:0,profit:0,loss:0,netTotal:0}}});
assert.equal(emptyValid.outcome,"committed","zero trades is a valid committed report, not an unavailable one");
assert(emptyValid.report,"the empty report object itself must still be present on a committed outcome");
assert.equal(emptyValid.report.summaries.length,0);
assert.notEqual(emptyValid.outcome,missing.outcome,"empty-but-valid must never collapse into the same outcome as missing/unavailable");

const committed = simulateLoadFast({hasKeys:true,busy:false,requestSymbol:"BTCUSDT",currentSymbolAtResolve:"BTCUSDT",report:{summaries:[{net:10}],summary:{wins:1,losses:0,profit:10,loss:0,netTotal:10}}});
assert.equal(committed.outcome,"committed");
assert.equal(committed.snapshot.revision,publishedCount,"each committed outcome carries the post-commit revision");
assert.equal(committed.snapshot.mode,"fast");

// Clear commits with status "unavailable" and resets mode to "none".
const cleared = commit({markers:[],links:[],reportProjection:null,fastReport:null,reportDetailLevel:"none"},{status:"unavailable",symbol:"",source:"clear"});
assert.equal(cleared.status,"unavailable");
assert.equal(cleared.mode,"none");
assert.equal(cleared.markers.length,0);

console.log("closed trades owner behavioral tests: PASS");
