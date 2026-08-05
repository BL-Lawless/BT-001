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
assert(wfSource.includes("_selfTest:runWfCrosshairSelfTests,"),"external export must still expose _selfTest");
assert(wfSource.includes("_diagnostics:() => {"),"external export must still expose _diagnostics");
assert(source.includes("window.BT001_WATERFALL_WINDOW && typeof window.BT001_WATERFALL_WINDOW.render === \"function\""),"Patch 36's call into WF must remain unmodified in main.js");

// WF-EXT3-02: the 16 bare cross-scope dependencies found by the Phase 4 Step 1
// investigation are now read through window.* instead of closure. Spot-check every one
// is referenced via window in WF's file, and that main.js actually exports it.
const exposedFunctions = [
  "cfg","hasKeys","syncOverlayHitOwnership","openBoxFloating","parseCustomDate","fq","fm",
  "stateChainId","closedTradeStatus","closedTradeNumber","closedTradeParentTrades",
  "closedTradePeriodWindowMs","closedTradeRealizedValue","closedTradeSignedFeeValue",
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
assert(!wfSource.includes("CLOSED_TRADES_STATE."),"WF cannot reference the raw CLOSED_TRADES_STATE global at all after extraction - it isn't exported and is out of scope");
assert(wfSource.includes("const acceptResult = () =>")&&wfSource.includes("{silent:true,acceptResult}"),"WF's own stale-period veto must still be constructed and passed as an additional guard");

// Final "zero monkey-patches" check (same style as WF-EXT-DR06): no capture-then-
// reassign monkey-patch pattern anywhere in WF's own file.
assert(!/const prev[A-Z][A-Za-z0-9]* *=/.test(wfSource),"WF must contain no capture-then-reassign monkey-patch pattern");

console.log("waterfall module tests: PASS");
