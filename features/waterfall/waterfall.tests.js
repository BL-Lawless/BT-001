"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname,"..","..");
const source = fs.readFileSync(path.join(root,"main.js"),"utf8");
const wfSource = fs.readFileSync(path.join(root,"features","waterfall","waterfall.js"),"utf8");

// WF-EXT3-01: the extracted module keeps its IIFE structure, install guard, and exact
// external export shape - Patch 36 (main.js) calls window.BT001_WATERFALL_WINDOW.render()
// from outside WF and must keep working unmodified.
assert(wfSource.includes('const MODULE = "BT001_WATERFALL_WINDOW_V1";'),"module id must be unchanged");
assert(wfSource.includes("window.__bt001WaterfallWindowInstalled"),"install guard must be unchanged");
assert(wfSource.includes("window.BT001_WATERFALL_WINDOW = {"),"external export must be unchanged");
assert(wfSource.includes("version:MODULE,show,hide,render,"),"external export shape (version/show/hide/render) must be unchanged");
assert(wfSource.includes("positionClosed:notifyPositionClosed"),"WF must expose the canonical full-position-close refresh hook");
assert(source.includes("window.BT001_WATERFALL_WINDOW.positionClosed(detail)"),"the authoritative closed transition must directly notify WF");
assert(wfSource.includes("closeSyncPending:true")||wfSource.includes("closeSyncPending = true"),"WF close refreshes must queue signals received while another refresh is pending");
assert(wfSource.includes("while(wfSyncState.closeRetry < 4)"),"WF must retain a bounded multi-attempt close refresh window");
assert(wfSource.includes("WF_FAST_REPORT_MAX_AGE_MS = 45000"),"WF cached fast reports must have a bounded freshness lifetime");
assert(wfSource.includes("wfHasFreshCurrentFastReport()"),"WF reopen must validate fast-report age before reusing it");
assert(wfSource.includes("function livePlaceholderIdentity(symbol,side)"),"WF must create a rendering-only identity for risk-only live positions");
assert(wfSource.includes("placeholderIdentity:!realParentId"),"WF live rows must identify whether their identity is temporary");
assert(wfSource.includes("if(trade && trade.placeholderIdentity) return;"),"WF must not leak placeholder identities into shared trade isolation");
assert(wfSource.includes("WF_CLOSED_TRADES_SAFETY_POLL_MS = 45000"),"WF must retain the bounded visible safety-poll interval");
assert(wfSource.includes("startClosedTradesSafetyLoop();")&&wfSource.includes("stopClosedTradesSafetyLoop();"),"WF show/hide must own the safety-poll lifecycle");
assert(wfSource.includes("runClosedTradesSafetyPoll().catch"),"WF safety poll must execute independently of position events");
assert(wfSource.includes("_selfTest:runWfCrosshairSelfTests,"),"external export must still expose _selfTest");
assert(wfSource.includes("_diagnostics:() => {"),"external export must still expose _diagnostics");
assert(source.includes("window.BT001_WATERFALL_WINDOW && typeof window.BT001_WATERFALL_WINDOW.render === \"function\""),"Patch 36's call into WF must remain unmodified in main.js");

// WF-EXT3-02: bare cross-scope dependencies found by the Phase 4 Step 1
// investigation are now read through window.* instead of closure. Spot-check every one
// is referenced via window in WF's file, and that main.js actually exports it.
const exposedFunctions = [
  "cfg","hasKeys","syncOverlayHitOwnership","openBoxFloating","fq","fm",
  "stateChainId","closedTradeStatus","closedTradeNumber","closedTradeParentTrades",
  "closedTradeRealizedValue","closedTradeSignedFeeValue",
  "closedTradeFastSummaryDirection"
];
for(const name of exposedFunctions){
  assert(wfSource.includes("window." + name + "("),"WF must call " + name + " via window, not as a bare closure reference");
  assert(source.includes("window." + name + " = " + name + ";"),"main.js must export " + name + " onto window for WF to consume");
}
const exposedGetters = ["__bt001CurrentCandles","__bt001LastMarkPrice","__bt001OverlayHitItems","__bt001ClosedTradesOperationalText"];
for(const name of exposedGetters){
  assert(wfSource.includes("window." + name + "()"),"WF must read " + name + " via a window getter, not a bare mutable global");
  assert(source.includes("window." + name + " = () =>"),"main.js must export a " + name + " getter for WF to consume");
}
// accountBalanceState: not exposed - WF's one remaining read of it was fixed to go
// through the Account Balance owner snapshot instead, consistent with the rest of WF.
assert(!wfSource.includes("num(accountBalanceState)"),"WF must not read the legacy accountBalanceState scalar at all after extraction");
assert(wfSource.includes("window.BT001_ACCOUNT_BALANCE.snapshot()"),"wfLiveRefreshSignature must read the Account Balance owner snapshot");

// WF-EXT3-06: the dead appCurrentPrice branch in currentLivePrice() is gone.
assert(!wfSource.includes('if(typeof appCurrentPrice === "function"){'),"the dead appCurrentPrice branch must be removed from currentLivePrice()");
assert(wfSource.includes("window.__bt001CurrentCandles()")&&wfSource.includes("window.__bt001LastMarkPrice()"),"currentLivePrice must fall through to the candles/lastMarkPrice getters");

// WF-EXT-CT06 (WF side, moved here in WF-EXT3-05): WF migration off monkey-patches and
// onto the publication + snapshot. The owner side of this contract is asserted in
// features/api/closed-trades-owner.tests.js.
assert(!wfSource.includes("const prevLoadClosedTradesFastForPeriod"),"WF must no longer monkey-patch loadClosedTradesFastForPeriod");
assert(!wfSource.includes("const prevLoadClosedTradesForPeriod"),"WF must no longer monkey-patch loadClosedTradesForPeriod");
assert(!wfSource.includes("const prevClearTrades"),"WF must no longer monkey-patch clearTrades");
assert(!wfSource.includes("const prevRefreshAccountBalance"),"WF must no longer monkey-patch refreshAccountBalance");
assert(!wfSource.includes("const prevDrawForWfLive"),"WF must no longer monkey-patch draw");
assert(wfSource.includes('window.addEventListener("bt001:closed-trades-state"'),"WF must subscribe to the Closed Trades owner publication");
assert(wfSource.includes('window.addEventListener("bt001:account-balance-state"'),"WF must subscribe to the Account Balance owner publication");
assert(wfSource.includes('window.addEventListener("bt001:open-position-visual-state"'),"WF must subscribe to the Open Position owner publication");
assert(wfSource.includes("function closedTradesOwnerSnapshot(){"),"WF must read closed-trade data through the owner snapshot");
assert(wfSource.includes("function displayControlsLoadRequest(period,opt={})"),"WF load requests must capture a display-controls snapshot");
assert(wfSource.includes("window.BT001_DISPLAY_CONTROLS"),"WF fast/detail loads must use the display-controls owner range");
assert(wfSource.includes("displayControlsRevision:snapshot.revision"),"WF load requests must carry the controls revision");
assert(!wfSource.includes("customFromEl")&&!wfSource.includes("customToEl"),"dead custom-range reads must be removed from WF");
assert(!wfSource.includes("reportWeeksEl"),"WF must have zero direct period-selector reads after display-controls migration");
assert(wfSource.includes("controls.subscribe(snapshot =>"),"WF period reloads must subscribe to the display-controls owner");
assert(!wfSource.includes('__bt001WfFastReloadBound'),"WF's old DOM period-change binding must be removed");
assert(!wfSource.includes("CLOSED_TRADES_STATE."),"WF cannot reference the raw CLOSED_TRADES_STATE global at all after extraction - it isn't exported and is out of scope");
assert(wfSource.includes("const acceptResult = () =>")&&wfSource.includes("{silent:true,acceptResult}"),"WF's own stale-period veto must still be constructed and passed as an additional guard");

// Final "zero monkey-patches" check (same style as WF-EXT-DR06): no capture-then-
// reassign monkey-patch pattern anywhere in WF's own file.
assert(!/const prev[A-Z][A-Za-z0-9]* *=/.test(wfSource),"WF must contain no capture-then-reassign monkey-patch pattern");

console.log("waterfall module tests: PASS");
