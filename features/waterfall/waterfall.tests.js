"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname,"..","..");
const source = fs.readFileSync(path.join(root,"main.js"),"utf8");
const wfSource = fs.readFileSync(path.join(root,"features","waterfall","waterfall.js"),"utf8");
const wfCss = fs.readFileSync(path.join(root,"features","waterfall","waterfall.css"),"utf8");
const wfAggregation = require("./waterfall-aggregation.js");

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
assert(wfSource.includes("controls.subscribe((snapshot,meta={}) =>"),"WF period reloads must subscribe to display-control changes with source metadata");
assert(wfSource.includes('id="wfPeriodSelect"')&&wfSource.includes('id="wfTfSelect"'),"WF must render Period and TF as dropdown selectors");
assert(wfSource.includes("aggregation.aggregateTrades(sourceTrades,wfSyncState.selectedTf,WF_RAW_TRADE_LIMIT,aggregationNowMs,period && period.start)"),"WF must aggregate the owner projection against one current time and the selected period boundary");
assert.deepStrictEqual(wfAggregation.PERIOD_OPTIONS.map(option=>option.value),["1d","1w","1m","2m","3m","6m"],"WF periods must run low-to-high with 1Y removed");
assert.deepStrictEqual(wfAggregation.optionsForPeriod("1d"),["6h","4h","1h","trades"],"1D TFs must run coarsest-to-finest and expose Trades last");
assert(!wfAggregation.optionsForPeriod("1w").includes("trades"),"Trades must be exclusive to the 1D period");
assert.equal(wfAggregation.defaultTfForPeriod("1m"),"1w","fresh period selections must default to their coarsest TF");
assert(wfSource.includes("if(trade && trade.aggregated) drillDownAggregate(trade);"),"aggregated bars must own the drill-down click route");
assert(wfSource.includes('source:"waterfall-bucket-drilldown"')&&wfSource.includes("resolvedRange:{startMs:bucket.bucketStartMs,endMs:bucket.bucketEndMs}"),"bucket drill-down must reuse the normal period loader with an exact custom range");
assert(wfSource.includes('liveSegment:"realized"')&&wfSource.includes('liveSegment:"floating"')&&wfSource.includes('liveSegment:"net"'),"an open position must retain distinct realized/floating Live segments plus a flat fallback");
assert(wfSource.includes('trade.liveSegment === "realized"')&&wfSource.includes('trade.liveSegment === "floating"')&&wfSource.includes('trade.liveSegment === "net"'),"the renderer must route every Live segment to its matching style");
assert(wfCss.includes(".wf-bar.is-live-realized.is-gain")&&wfCss.includes("background:rgb(22,163,74)")&&wfCss.includes(".wf-bar.is-live-floating.is-gain")&&wfCss.includes("background:rgba(22,163,74,.18)"),"realized Live P/L must be solid while floating Live P/L remains translucent");
const liveBarsStart = wfSource.indexOf("function wfLivePreviewBars");
const liveBarsEnd = wfSource.indexOf("function markClosedTradesLoaded",liveBarsStart);
const liveBarsContext = {num:value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value),Math};
vm.createContext(liveBarsContext);
vm.runInContext(wfSource.slice(liveBarsStart,liveBarsEnd),liveBarsContext);
const segmentedLive = liveBarsContext.wfLivePreviewBars({id:"live",net:5,realizedPartials:8,floatingPL:-3},[{end:100}]);
assert.deepStrictEqual(Array.from(segmentedLive,bar => bar.liveSegment),["realized","floating"],"partials and floating P/L must produce two ordered Live segments");
assert.deepStrictEqual(Array.from(segmentedLive,bar => [bar.net,bar.start,bar.end]),[[8,100,108],[-3,108,105]],"Live segments must chain from the current aggregated display endpoint");
const floatingOnlyLive = liveBarsContext.wfLivePreviewBars({id:"live",net:4,realizedPartials:0,floatingPL:4},[{end:25}]);
assert.deepStrictEqual(Array.from(floatingOnlyLive,bar => bar.liveSegment),["floating"],"an open position without partial exits must omit the empty realized segment");
const flatLive = liveBarsContext.wfLivePreviewBars({id:"live",net:0,realizedPartials:0,floatingPL:0},[{end:25}]);
assert.deepStrictEqual(Array.from(flatLive,bar => bar.liveSegment),["net"],"a zero/flat Live position must retain the single net fallback");
assert(wfSource.includes("reportPeriod != null && Number.isFinite(Number(reportPeriod.start))"),"WF must reject a null report period before reading its range endpoints");
const selectedPeriodStart = wfSource.indexOf("function selectedPeriodDates()");
const selectedPeriodEnd = wfSource.indexOf("function aggregateTradeRows",selectedPeriodStart);
const selectedPeriodContext = {
  activeWfReport:() => null,
  window:{BT001_DISPLAY_CONTROLS:{periodWindow:() => ({startMs:101,endMs:202})}},
  Number
};
vm.createContext(selectedPeriodContext);
vm.runInContext(wfSource.slice(selectedPeriodStart,selectedPeriodEnd),selectedPeriodContext);
assert.equal(selectedPeriodContext.selectedPeriodDates().start,101,"a normal pre-report WF render must fall back to the display-control window without throwing");
assert.equal(selectedPeriodContext.selectedPeriodDates().end,202,"the pre-report fallback must retain the selected period end");
assert(wfSource.includes("function renderWfLoadingState()")&&wfSource.includes("wfSyncState.loading || wfSyncState.aggregationPending")&&wfSource.includes("Loading..."),"WF must show a visible loading state for report loading and aggregation processing");
assert(wfSource.includes("const sourceTrades = trades.filter(trade => acceptedSourceTrades.has(trade));")&&wfSource.includes("const summary = wfAggregation().summarizeEntries(sourceTrades);")&&wfSource.includes("const selectedNet = num(aggregation.sourceNet) || 0;"),"WF summary statistics and closed Net must use the exact accepted unaggregated source trades");
assert(wfSource.includes("const sourceWatermarks = wfSourceWatermarks(sourceTrades);")&&wfSource.includes("const hwm = wfHwmMetrics(sourceWatermarks,headlineNet);"),"WF HWM Delta must use the unaggregated source-trade sequence");
assert(wfSource.includes("const returnPct = returnMetrics;")&&!wfSource.includes("wfReturnMetrics(headlineNet)"),"closed-period Return % must remain independent of TF grouping and Live P/L");
assert(wfSource.includes("const bucketTradeCount = bucketSourceTrades.length;")&&wfSource.includes("const bucketNet = bucketSourceTrades.reduce")&&wfSource.includes('"Closed trades: " + bucketTradeCount'),"aggregate tooltips must derive count and net from the bucket's real source trades");
const resultTemplateStart = wfSource.indexOf('result.innerHTML = `${wfControlsHtml()}');
const resultTemplateNet = wfSource.indexOf('<div class="wf-result-label">Net P/L</div>',resultTemplateStart);
assert(resultTemplateStart >= 0 && resultTemplateNet > resultTemplateStart,"WF Period/TF controls must render at the top of the right column above Net P/L");
assert(wfSource.includes("const rawBoundaryIndex = chartTrades.findIndex")&&wfSource.includes('class="wf-section-separator"'),"WF must render a separator at the aggregate/raw boundary");
assert(wfCss.includes(".wf-section-separator{")&&wfCss.includes("background:#aeb7c2")&&wfCss.includes("top:0;")&&wfCss.includes("bottom:0;"),"the aggregate/raw separator must span the full chart height in medium light grey");
assert(wfSource.includes("aggregation.isCurrentBucket(bucket,wfSyncState.selectedTf,aggregationNowMs)")&&wfSource.includes("? '<span class=\"wf-bar-bucket-flag\">A</span>'")&&wfSource.includes('cls.push("is-current-bucket")')&&wfCss.includes(".wf-bar.is-current-bucket{overflow:visible}"),"only the current in-progress aggregate bucket must receive a visible A marker");
assert(/\.wf-bar-bucket-flag\{[\s\S]*?color:#fff;/.test(wfCss),"the current-bucket A marker must use white text");
assert(wfSource.includes('style="height:${watermarkConnectorHeight}px"')&&wfCss.includes("top:0;")&&wfCss.includes("min-height:1px;"),"the HWM connector must extend from the true HWM level through the marked bar's upper edge");
for(const label of ["One Hour","Four Hours","Six Hours","One Day","One Week"]){
  assert(wfSource.includes(label),"WF must provide the natural TF label " + label);
}
assert(wfSource.includes('class="wf-section-label is-trades">Trades</span>')&&!wfSource.includes("wfTfLabel(trade.bucketTf)"),"the grouped bottom label row must replace repeated per-bucket TF labels");
assert(wfSource.includes('const WF_SELECTION_STORAGE_KEY = "btc_futures_chart_v13_wf_period_tf_v1"')&&wfSource.includes("localStorage.getItem(WF_SELECTION_STORAGE_KEY)")&&wfSource.includes("localStorage.setItem(WF_SELECTION_STORAGE_KEY"),"WF Period/TF must use versioned browser persistence");
assert(wfSource.includes('source:"waterfall-selection-restore"')&&wfSource.includes("if(!restoreWfSelection()){"),"restored WF Period must flow through the shared display-controls owner");
assert(wfSource.includes("const restoredSelection = restoreWfSelection();")&&wfSource.includes("if(restoredPeriodChanged) return;"),"WF reopen must restore its saved Period/TF before loading");
assert(wfSource.includes('if(!visible && !source.startsWith("waterfall-")) return;'),"hidden WF must not let unrelated display-period changes overwrite its saved selection");
const selectionFunctionsStart = wfSource.indexOf("function readWfSelection()");
const selectionFunctionsEnd = wfSource.indexOf("function requestWfFrame",selectionFunctionsStart);
const persisted = new Map([["btc_futures_chart_v13_wf_period_tf_v1",JSON.stringify({version:1,period:"1w",tf:"1d"})]]);
let ownerPeriod = "1d";
const selectionContext = {
  WF_SELECTION_STORAGE_KEY:"btc_futures_chart_v13_wf_period_tf_v1",
  wfAggregation:() => wfAggregation,
  wfSyncState:{selectedPeriod:"1d",selectedTf:"1h",drilldown:null},
  currentPeriodValue:() => ownerPeriod,
  localStorage:{getItem:key => persisted.get(key) || null,setItem:(key,value) => persisted.set(key,value)},
  window:{BT001_DISPLAY_CONTROLS:{setPeriod:period => { ownerPeriod=period; }}},
  JSON,String
};
vm.createContext(selectionContext);
vm.runInContext(wfSource.slice(selectionFunctionsStart,selectionFunctionsEnd),selectionContext);
assert.equal(selectionContext.restoreWfSelection(),true,"a stored WF selection must restore successfully");
assert.equal(selectionContext.wfSyncState.selectedTf,"1d","restoring WF must retain the stored valid TF");
assert.equal(ownerPeriod,"1w","restoring WF must synchronize its Period through the main display-controls owner");
selectionContext.persistWfSelection("1m","6h");
assert.deepStrictEqual(JSON.parse(persisted.get("btc_futures_chart_v13_wf_period_tf_v1")),{version:1,period:"1m",tf:"6h"},"WF must persist the last selected Period/TF pair");
assert(!wfSource.includes('__bt001WfFastReloadBound'),"WF's old DOM period-change binding must be removed");
assert(!wfSource.includes("CLOSED_TRADES_STATE."),"WF cannot reference the raw CLOSED_TRADES_STATE global at all after extraction - it isn't exported and is out of scope");
assert(wfSource.includes("const acceptResult = () =>")&&wfSource.includes("{silent:true,acceptResult}"),"WF's own stale-period veto must still be constructed and passed as an additional guard");

// Final "zero monkey-patches" check (same style as WF-EXT-DR06): no capture-then-
// reassign monkey-patch pattern anywhere in WF's own file.
assert(!/const prev[A-Z][A-Za-z0-9]* *=/.test(wfSource),"WF must contain no capture-then-reassign monkey-patch pattern");

console.log("waterfall module tests: PASS");
