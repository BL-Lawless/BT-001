/* =========================================================
   BT001_WATERFALL_WINDOW - Closed-position "Waterfall" report window

   WF-EXT3-01: extracted from main.js (formerly ~lines 23644-25332) into its
   own file as a structural move, not a rewrite. Loads as a separate deferred
   script AFTER main.js (see index.html) - see WF-EXT3-02 for the main.js-scope
   dependencies this file reads via window.* instead of closure, and the Phase 4
   Step 1 investigation report for the full boundary/entanglement audit that
   preceded this move.
========================================================= */
(() => {
  "use strict";
  const MODULE = "BT001_WATERFALL_WINDOW_V1";
  if(typeof document === "undefined" || window.__bt001WaterfallWindowInstalled) return;
  window.__bt001WaterfallWindowInstalled = true;

  const q = id => document.getElementById(id);
  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const money = value => {
    const n = num(value);
    if(n == null) return "-";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const moneyPlain = value => {
    const n = num(value);
    if(n == null) return "-";
    return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  };
  const pctText = value => {
    const n = num(value);
    return n == null ? "N/A" : (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  };
  const shortDate = value => {
    const n = num(value);
    if(n == null || n <= 0) return "-";
    const dt = new Date(n > 1e12 ? n : n * 1000);
    if(Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit"});
  };
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  const niceStep = range => {
    const base = Math.max(1,Math.abs(range) / 4);
    const power = Math.pow(10,Math.floor(Math.log10(base)));
    const scaled = base / power;
    const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
    return nice * power;
  };
  // WF-COS01: Net P/L and HWM Delta (the two big .wf-result-value figures - fmtBigResult
  // has no other callers) now show 1 decimal place instead of rounding to whole dollars.
  // The shared money()/moneyPlain() formatters (summary table, tooltips, axis labels,
  // watermark label) are untouched - they keep their existing 2-decimal/whole-dollar
  // behavior everywhere else.
  const fmtBigResult = value => {
    const n = num(value);
    if(n == null) return "-";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1});
  };
  const wfTitleDayText = ms => {
    const dt = new Date(ms);
    return String(dt.getDate()).padStart(2,"0") + " / " + dt.toLocaleString("en-GB",{month:"short"});
  };
  const WF_AXIS_MIN_ABS = 10;
  const WF_MAX_BAR_WIDTH_PX = 90;
  const WF_GREEN = "#047857";
  const WF_RED = "#7f1d1d";
  const WF_BLACK = "#1e2329";
  const wfEscape = value => String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
  const wfAttr = value => wfEscape(value)
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");

  let visible = false;
  let hoverTradeIndex = null;
  let lastModel = null;
  const wfSyncState = {
    loaded:false,
    symbol:"",
    period:"",
    closeTimer:null,
    closeRetry:0,
    closeSyncBusy:false,
    closeSyncBaseline:"",
    liveRefreshKey:"",
    liveRefreshTimer:null,
    liveTicker:null,
    sideWidthKey:"",
    sideWidthPx:116,
    resizeQueued:false,
    hoverClientX:null,
    hoverClientY:null,
    hoverInsideChart:false,
    suppressResizeRender:false,
    expandedRect:null,
    crosshair:{active:false,clientX:null,clientY:null,selectedLevel:null,scale:null,listenerBindings:0,updates:0,closedPartialKey:""}
  };
  function activeWfTradeKey(){
    try{
      return typeof window.getActiveClosedTradeIsolateKey === "function" ? window.getActiveClosedTradeIsolateKey() : null;
    }catch(_e){
      return null;
    }
  }
  function tradeKey(trade){
    return trade && (trade.parentTradeId || trade.chainId || trade.markerId || trade.id || null);
  }
  function currentSymbol(){
    try{
      return String((window.cfg() && window.cfg().symbol) || "").toUpperCase();
    }catch(_e){
      return "";
    }
  }
  function currentPeriodValue(){
    try{
      return String((reportWeeksEl && reportWeeksEl.value) || "1d").toLowerCase();
    }catch(_e){
      return "1d";
    }
  }
  function currentLivePrice(){
    // WF-EXT3-06: the previous typeof appCurrentPrice === "function" guard here was
    // always dead - appCurrentPrice is declared inside a different, unrelated patch's
    // own IIFE (Patch 31) and was never exported to window, so this branch could never
    // fire even before extraction. Removed rather than "fixed" - making it fire would
    // change which price source WF uses, which is out of scope for a structural move.
    const candles = window.__bt001CurrentCandles();
    const latest = Array.isArray(candles) && candles.length ? candles[candles.length - 1] : null;
    const close = num(latest && latest.close);
    if(close != null) return close;
    const lastMarkPrice = window.__bt001LastMarkPrice();
    return num(typeof lastMarkPrice !== "undefined" ? lastMarkPrice : null);
  }
  function wfLiveFloatingForBox(box,price){
    const livePrice = num(price);
    if(livePrice != null && typeof window.openBoxFloating === "function"){
      const floating = num(window.openBoxFloating(box,livePrice));
      if(floating != null) return floating;
    }
    return num(box && box.unrealizedPnl);
  }
  function wfLiveRefreshSignature(liveTrade){
    // WF-EXT3-02: reads the Account Balance owner snapshot instead of the legacy
    // accountBalanceState scalar mirror, consistent with the rest of WF post-AB05.
    const balanceSnapshot = window.BT001_ACCOUNT_BALANCE && typeof window.BT001_ACCOUNT_BALANCE.snapshot === "function"
      ? window.BT001_ACCOUNT_BALANCE.snapshot()
      : null;
    const balance = num(balanceSnapshot && balanceSnapshot.value);
    return [
      liveTrade ? liveTrade.liveKey : "",
      balance == null ? "na" : String(balance)
    ].join("|");
  }
  function closedTradeSignature(rec){
    const parents = typeof window.closedTradeParentTrades === "function" ? window.closedTradeParentTrades(rec || {}) : [];
    return parents.map(trade => [
      String(trade && trade.parentId || ""),
      String(num(trade && trade.finalExit && trade.finalExit.time) || 0),
      String(num(trade && trade.netTotal) || 0)
    ].join(":")).join("|");
  }
  function closedTradeFastSignature(report){
    const rows = report && Array.isArray(report.summaries) ? report.summaries : [];
    const summary = report && report.summary || {};
    return rows.map(row => [
      String(row && row.id || ""),
      String(num(row && row.closeTime) || 0),
      String(num(row && row.net) || 0)
    ].join(":")).join("|") + "|net:" + String(num(summary && summary.netTotal) || 0);
  }
  // WF-EXT-CT06: reads go through the owner's snapshot() instead of the raw
  // CLOSED_TRADES_STATE global - wfMode is now snapshot().mode (WF-EXT-CT05 renamed the
  // owner's internal field to reportDetailLevel; the string values "none"/"fast"/"detail"
  // are unchanged).
  function closedTradesOwnerSnapshot(){
    return window.BT001_CLOSED_TRADES && typeof window.BT001_CLOSED_TRADES.snapshot === "function"
      ? window.BT001_CLOSED_TRADES.snapshot()
      : null;
  }
  function wfDataMode(){
    const snap = closedTradesOwnerSnapshot();
    return String((snap && snap.mode) || "none");
  }
  function activeWfReport(){
    const mode = wfDataMode();
    if(mode === "fast" && wfHasCurrentFastReport()) return closedTradesOwnerSnapshot().fastReport;
    if(mode === "detail" && wfHasCurrentDetailReport()) return closedTradesOwnerSnapshot().reportProjection;
    return null;
  }
  function activeWfSignature(){
    const snap = closedTradesOwnerSnapshot();
    const mode = wfDataMode();
    if(mode === "fast") return closedTradeFastSignature(snap && snap.fastReport);
    return closedTradeSignature(snap && snap.reportProjection);
  }
  function wfHasCurrentFastReport(){
    const snap = closedTradesOwnerSnapshot();
    const report = snap && snap.fastReport;
    const period = report && report.period;
    return !!(
      report &&
      String(report.symbol || "").toUpperCase() === currentSymbol() &&
      period &&
      String(period.period || "").toLowerCase() === currentPeriodValue()
    );
  }
  function wfHasCurrentDetailReport(){
    const snap = closedTradesOwnerSnapshot();
    const report = snap && snap.reportProjection;
    const period = report && report.period;
    return !!(
      report &&
      String(report.symbol || "").toUpperCase() === currentSymbol() &&
      period &&
      String(period.period || "").toLowerCase() === currentPeriodValue()
    );
  }
  async function reloadCurrentWfData(period,opt={}){
    if(wfDataMode() === "detail") return window.loadClosedTradesForPeriod(period,opt);
    return window.loadClosedTradesFastForPeriod(period,opt);
  }
  async function ensureFastWfData(opt={}){
    if(typeof window.hasKeys !== "function" || !window.hasKeys()) return null;
    if(!opt.force && wfHasCurrentFastReport()) return closedTradesOwnerSnapshot().fastReport;
    return window.loadClosedTradesFastForPeriod(opt.period || currentPeriodValue(),opt);
  }
  function livePreviewTrade(){
    const visual = window.BT001_OPEN_POSITION_VISUAL && typeof window.BT001_OPEN_POSITION_VISUAL.snapshot === "function"
      ? window.BT001_OPEN_POSITION_VISUAL.snapshot()
      : null;
    const authoritative = window.BT001_SHARED_POSITION && typeof window.BT001_SHARED_POSITION.snapshot === "function"
      ? window.BT001_SHARED_POSITION.snapshot()
      : null;
    if(!visual || !authoritative || visual.symbol !== currentSymbol() || visual.authoritativePositionRevision !== authoritative.revision) return null;
    if(visual.status === "unavailable" || visual.status === "stale" || visual.status === "error") return null;
    const markersSource = visual.markers || [];
    const boxesSource = visual.boxes || [];
    const boxChainIds = boxesSource.map(window.stateChainId).filter(Boolean);
    const chainIds = (visual.activeParentChainIds || []).concat(boxChainIds).filter(Boolean);
    const parentId = chainIds[0] || null;
    if(!parentId) return null;
    const markers = markersSource.filter(m => window.stateChainId(m) === parentId).slice().sort((a,b) => (num(a && a.time) || 0) - (num(b && b.time) || 0));
    const boxes = boxesSource.filter(b => window.stateChainId(b) === parentId);
    if(!markers.length && !boxes.length) return null;
    const entries = markers.filter(m => m && m.role === "entry");
    const side = String((entries[0] && entries[0].side) || (boxes[0] && boxes[0].side) || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const realizedPartials = num(visual.realizedPartials && visual.realizedPartials.byChain && visual.realizedPartials.byChain[parentId]) || 0;
    const livePrice = currentLivePrice();
    const floatingPL = boxes.length
      ? boxes.reduce((sum,box) => {
          const floating = wfLiveFloatingForBox(box,livePrice);
          return sum + (floating || 0);
        },0)
      : null;
    const netLivePL = floatingPL == null ? null : realizedPartials + floatingPL;
    const startTime = num((entries[0] && entries[0].time) || (boxes[0] && boxes[0].time));
    const tooltipLines = [
      "Current open position",
      "Direction: " + (side === "SHORT" ? "Short" : "Long"),
      "Duration: " + wfDurationText(startTime,Math.floor(Date.now() / 1000)),
      "",
      [{text:"Realized partials | ",color:WF_BLACK},{text:window.fm(realizedPartials),color:wfPnlColor(realizedPartials),bold:true}],
      [{text:"Floating P/L | ",color:WF_BLACK},{text:floatingPL == null ? "N/A" : window.fm(floatingPL),color:floatingPL == null ? WF_BLACK : wfPnlColor(floatingPL),bold:true}],
      "",
      [{text:"Net live P/L | ",color:WF_BLACK,bold:true,large:true},{text:netLivePL == null ? "N/A" : window.fm(netLivePL),color:netLivePL == null ? WF_BLACK : wfPnlColor(netLivePL),bold:true,large:true}]
    ];
    return {
      id:"wf_live_" + parentId,
      parentTradeId:parentId,
      chainId:parentId,
      live:true,
      dir:side === "SHORT" ? "S" : "L",
      net:netLivePL,
      realizedPartials,
      floatingPL,
      tooltipLines,
      markerId:null,
      liveKey:[
        parentId,
        String(realizedPartials),
        floatingPL == null ? "na" : String(floatingPL),
        livePrice == null ? "na" : String(livePrice),
        String(startTime || 0)
      ].join(":"),
      start:0,
      end:0
    };
  }
  function wfLivePreviewBars(liveTrade,trades){
    if(!liveTrade) return [];
    const cumulative = trades.length ? num(trades[trades.length - 1].end) || 0 : 0;
    const realized = num(liveTrade.realizedPartials);
    const floating = num(liveTrade.floatingPL);
    const bars = [];
    let cursor = cumulative;
    if(realized != null && Math.abs(realized) > 1e-12){
      bars.push({
        ...liveTrade,
        id:liveTrade.id + "_realized",
        liveSegment:"realized",
        net:realized,
        start:cursor,
        end:cursor + realized
      });
      cursor += realized;
    }
    if(floating != null && Math.abs(floating) > 1e-12){
      bars.push({
        ...liveTrade,
        id:liveTrade.id + "_floating",
        liveSegment:"floating",
        net:floating,
        start:cursor,
        end:cursor + floating
      });
      cursor += floating;
    }
    if(!bars.length){
      bars.push({
        ...liveTrade,
        id:liveTrade.id + "_flat",
        liveSegment:"net",
        net:num(liveTrade.net) || 0,
        start:cumulative,
        end:cumulative + (num(liveTrade.net) || 0)
      });
    }
    return bars;
  }
  function markClosedTradesLoaded(loaded){
    wfSyncState.loaded = !!loaded;
    wfSyncState.symbol = loaded ? currentSymbol() : "";
    wfSyncState.period = loaded ? currentPeriodValue() : "";
    if(!loaded) wfSyncState.closeSyncBaseline = "";
  }
  function clearAutoCloseSync(){
    if(wfSyncState.closeTimer){
      clearTimeout(wfSyncState.closeTimer);
      wfSyncState.closeTimer = null;
    }
    wfSyncState.closeRetry = 0;
    wfSyncState.closeSyncBusy = false;
    wfSyncState.closeSyncBaseline = "";
  }
  function scheduleAutoCloseSync(delayMs=1250){
    if((!wfSyncState.loaded && !visible) || (wfSyncState.loaded && wfSyncState.symbol !== currentSymbol())) return;
    if(wfSyncState.closeTimer || wfSyncState.closeSyncBusy) return;
    wfSyncState.closeSyncBaseline = activeWfSignature();
    const period = wfSyncState.period || currentPeriodValue();
    const symbol = currentSymbol();
    wfSyncState.closeTimer = setTimeout(async () => {
      wfSyncState.closeTimer = null;
      wfSyncState.closeSyncBusy = true;
      try{
        while(wfSyncState.closeRetry < 2){
          let staleContext = false;
          const acceptResult = () => {
            const currentPeriod = currentPeriodValue();
            const currentSymbolValue = currentSymbol();
            const current = currentPeriod === String(period || "").toLowerCase() && currentSymbolValue === symbol;
            if(!current) staleContext = true;
            return current;
          };
          const result = await reloadCurrentWfData(period,{silent:true,acceptResult});
          // WF-C05: a period/symbol change cancels this synchronization attempt.
          if(staleContext || !acceptResult()) return;
          const nextSignature = wfDataMode() === "fast"
            ? closedTradeFastSignature(result)
            : closedTradeSignature(result && result.report);
          if(result && (!wfSyncState.closeSyncBaseline || (nextSignature && nextSignature !== wfSyncState.closeSyncBaseline))){
            wfSyncState.closeRetry = 0;
            wfSyncState.closeSyncBaseline = "";
            return;
          }
          wfSyncState.closeRetry += 1;
          if(wfSyncState.closeRetry < 2) await new Promise(resolve => setTimeout(resolve,3000));
        }
        showWfTradesStatus("Closed trade not ready yet");
      }catch(error){
        console.warn(MODULE + " live sync failed",error);
        showWfTradesStatus("Closed trade sync failed");
      }finally{
        wfSyncState.closeSyncBusy = false;
        wfSyncState.closeRetry = 0;
        wfSyncState.closeSyncBaseline = "";
      }
    },Math.max(250,delayMs));
  }
  function maybeRefreshLivePreview(){
    if(!visible) return;
    if(wfSyncState.liveRefreshTimer) return;
    wfSyncState.liveRefreshTimer = setTimeout(() => {
      wfSyncState.liveRefreshTimer = null;
      if(!visible) return;
      const live = livePreviewTrade();
      const closedPartialKey=live ? [live.parentTradeId,String(num(live.realizedPartials)||0)].join(":") : "flat:0";
      if(closedPartialKey!==wfSyncState.crosshair.closedPartialKey){
        wfSyncState.crosshair.closedPartialKey=closedPartialKey;
        if(wfSyncState.crosshair.active)renderWfCrosshair(live);
      }
      const nextKey = wfLiveRefreshSignature(live);
      if(nextKey === wfSyncState.liveRefreshKey) return;
      wfSyncState.liveRefreshKey = nextKey;
      render();
    },60);
  }
  function saveExpandedRect(win){
    if(!win || win.classList.contains("is-collapsed")) return;
    const rect = win.getBoundingClientRect();
    wfSyncState.expandedRect = {
      left:rect.left,
      top:rect.top,
      width:rect.width,
      height:rect.height
    };
  }
  function applyExpandedRect(win){
    const rect = wfSyncState.expandedRect;
    if(!win || !rect) return;
    win.style.left = Math.max(6,rect.left) + "px";
    win.style.top = Math.max(6,rect.top) + "px";
    win.style.right = "auto";
    win.style.width = Math.max(520,rect.width) + "px";
    win.style.height = Math.max(360,rect.height) + "px";
  }
  function restoreWfHoverTarget(){
    const chart = q("wfChart");
    if(!chart || !wfSyncState.hoverInsideChart){
      hoverTradeIndex = null;
      renderHover();
      return;
    }
    const chartRect = chart.getBoundingClientRect();
    const x = wfSyncState.hoverClientX;
    const y = wfSyncState.hoverClientY;
    if(!(Number.isFinite(x) && Number.isFinite(y)) || x < chartRect.left || x > chartRect.right || y < chartRect.top || y > chartRect.bottom){
      hoverTradeIndex = null;
      wfSyncState.hoverInsideChart = false;
      renderHover();
      return;
    }
    const bar = hoverTradeIndex == null ? null : chart.querySelector(`.wf-bar[data-trade-index="${hoverTradeIndex}"]`);
    if(!bar){
      hoverTradeIndex = null;
      renderHover();
      return;
    }
    renderHover({clientX:x,clientY:y});
  }
  // WF-COS01: crosshair values (Value 1 selected level and Value 2 distance, both driven
  // through this function) now show 1 decimal place instead of rounding to whole dollars.
  function wfCrosshairMoney(value,{signed=false}={}){
    const amount=Math.abs(Number(value) || 0).toLocaleString("en-US",{minimumFractionDigits:1,maximumFractionDigits:1});
    if(Math.abs(Number(value) || 0)<0.005) return "$0";
    if(Number(value)<0) return `−$${amount}`;
    return `${signed ? "+" : ""}$${amount}`;
  }
  function wfCrosshairDifferenceText(selected,current){
    return wfCrosshairMoney(Number(selected)-Number(current),{signed:true});
  }
  // CLOSED P&L ONLY -- closedSelectedNet is the cumulative net of every closed trade in view and
  // realizedPartials is the open position's already-closed portion. The live position's netLivePL,
  // shown elsewhere in the WF sidebar, includes floatingPL and must never be used here.
  function wfCurrentCampaignClosedPartialPL(selectedNet,liveTrade){
    const closedSelectedNet=arguments.length ? (num(selectedNet)||0) : (num(lastModel&&lastModel.closedSelectedNet)||0);
    const live=arguments.length>1?liveTrade:livePreviewTrade();
    const realizedPartials=live&&live.parentTradeId ? (num(live.realizedPartials)||0) : 0;
    return closedSelectedNet+realizedPartials;
  }
  function hideWfCrosshair({clear=true}={}){
    const crosshair=wfSyncState.crosshair;
    crosshair.active=false;
    if(clear){ crosshair.clientX=null;crosshair.clientY=null;crosshair.selectedLevel=null; }
    const overlay=q("wfCrosshair");
    if(overlay) overlay.classList.add("hidden");
  }
  // WF-COS06: Value 2 (distance) now lives inside the same chart overlay as Value 1
  // (selected level), boxed and positioned at the plot's right edge instead of the
  // floating wf-crosshair-values box that used to sit at the top of the result column -
  // see the wfChart template below for both elements' markup. There is no longer a
  // separate #wfCrosshairValues container to show/hide.
  function renderWfCrosshair(liveTrade){
    const chart=q("wfChart"),win=q("wfWindow"),crosshair=wfSyncState.crosshair,scale=crosshair.scale;
    const overlay=q("wfCrosshair");
    if(!visible || !chart || !win || win.classList.contains("is-collapsed") || !overlay || !crosshair.active || !scale || !Number.isFinite(crosshair.selectedLevel)){
      if(overlay) overlay.classList.add("hidden");
      return;
    }
    const chartRect=chart.getBoundingClientRect();
    const localX=clamp(Number(crosshair.clientX)-chartRect.left,scale.plotLeft,Math.max(scale.plotLeft,chart.clientWidth-scale.plotRight));
    const plotY=clamp(scale.valueToY(crosshair.selectedLevel),0,scale.plotHeight);
    const localY=scale.plotTop+plotY;
    const currentCampaignClosedPartials=wfCurrentCampaignClosedPartialPL(lastModel&&lastModel.closedSelectedNet,arguments.length?liveTrade:livePreviewTrade());
    const vertical=overlay.querySelector(".wf-crosshair-v");
    const horizontal=overlay.querySelector(".wf-crosshair-h");
    const selected=overlay.querySelector(".wf-crosshair-selected");
    const amount=overlay.querySelector(".wf-crosshair-amount");
    if(!vertical || !horizontal || !selected || !amount){ overlay.classList.add("hidden");return; }
    const hairline=`${1/(window.devicePixelRatio || 1)}px`;
    overlay.style.setProperty("--wf-crosshair-hairline",hairline);
    vertical.style.left=`${localX}px`;vertical.style.top=`${scale.plotTop}px`;vertical.style.height=`${scale.plotHeight}px`;
    horizontal.style.left=`${scale.plotLeft}px`;horizontal.style.right=`${scale.plotRight}px`;horizontal.style.top=`${localY}px`;
    selected.style.top=`${localY}px`;
    selected.textContent=wfCrosshairMoney(crosshair.selectedLevel,{signed:true});
    amount.style.top=`${localY}px`;
    amount.textContent=wfCrosshairDifferenceText(crosshair.selectedLevel,currentCampaignClosedPartials);
    overlay.classList.remove("hidden");
    overlay.dataset.selectedLevel=String(crosshair.selectedLevel);
    overlay.dataset.currentCampaignClosedPartials=String(currentCampaignClosedPartials);
    overlay.dataset.amountToLevel=String(crosshair.selectedLevel-currentCampaignClosedPartials);
    crosshair.updates+=1;
  }
  function updateWfCrosshairFromPointer(event){
    const chart=q("wfChart"),win=q("wfWindow"),crosshair=wfSyncState.crosshair,scale=crosshair.scale;
    if(!visible || !chart || !win || win.classList.contains("is-collapsed") || !scale){ hideWfCrosshair();return; }
    const rect=chart.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    const inside=x>=scale.plotLeft && x<=chart.clientWidth-scale.plotRight && y>=scale.plotTop && y<=scale.plotTop+scale.plotHeight;
    if(!inside){ hideWfCrosshair();return; }
    crosshair.active=true;crosshair.clientX=event.clientX;crosshair.clientY=event.clientY;
    crosshair.selectedLevel=scale.yToValue(y-scale.plotTop);
    renderWfCrosshair();
  }
  function runWfCrosshairSelfTests(){
    const domainMin=-2000,domainMax=3000,height=250;
    const valueToY=value=>((domainMax-value)/(domainMax-domainMin))*height;
    const yToValue=y=>domainMax-(y/height)*(domainMax-domainMin);
    const probes=[-2000,-500,0,1250,3000];
    const closedTrades=[{net:-150},{net:220},{net:35},{net:-5}];
    const selectedNet=closedTrades.reduce((sum,trade)=>sum+(num(trade.net)||0),0);
    const cases={
      // WF-COS01: expected strings updated for the 1-decimal crosshair format.
      positiveDifference:wfCrosshairDifferenceText(2000,1500)==="+$500.0",
      negativeDifference:wfCrosshairDifferenceText(1000,1500)==="−$500.0",
      negativeSelectedPositiveLive:wfCrosshairDifferenceText(-500,1500)==="−$2,000.0",
      negativeSelectedMoreNegativeLive:wfCrosshairDifferenceText(-500,-1000)==="+$500.0",
      zeroLive:wfCrosshairDifferenceText(500,0)==="+$500.0",
      zeroSelected:wfCrosshairDifferenceText(0,500)==="−$500.0",
      equality:wfCrosshairDifferenceText(1500,1500)==="$0",
      signedFormatting:wfCrosshairMoney(1234,{signed:true})==="+$1,234.0" && wfCrosshairMoney(-1234,{signed:true})==="−$1,234.0" && wfCrosshairMoney(0,{signed:true})==="$0",
      axisRoundTrip:probes.every(value=>Math.abs(yToValue(valueToY(value))-value)<1e-8),
      liveBaselineIncludesSelectedNetAndPartials:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:900})===143,
      floatingExcluded:wfCrosshairDifferenceText(155,wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:-800}))==="+$12.0",
      // CLOSED P&L ONLY, locked in explicitly: cumulative closed-trade net plus realizedPartials must
      // drive the distance baseline no matter how large floatingPL is, in either direction.
      floatingExclusionHoldsForHugePositiveFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:1e9})===143,
      floatingExclusionHoldsForHugeNegativeFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:-1e9})===143,
      // With no live position, the full cumulative sum of all closed trades is the baseline.
      flatCampaignUsesAllClosedTrades:wfCurrentCampaignClosedPartialPL(selectedNet,null)===100,
      flatCampaignWithNoClosedTrades:wfCurrentCampaignClosedPartialPL(0,null)===0,
      flatUsesCumulativeClosedNetAsBaseline:wfCrosshairDifferenceText(500,wfCurrentCampaignClosedPartialPL(selectedNet,null))==="+$400.0"
    };
    return {passed:Object.values(cases).every(Boolean),cases};
  }
  function startLiveRefreshLoop(){
    if(wfSyncState.liveTicker) return;
    wfSyncState.liveTicker = setInterval(() => {
      try{ maybeRefreshLivePreview(); }catch(_e){}
    },350);
  }
  function stopLiveRefreshLoop(){
    if(!wfSyncState.liveTicker) return;
    clearInterval(wfSyncState.liveTicker);
    wfSyncState.liveTicker = null;
    if(wfSyncState.liveRefreshTimer){
      clearTimeout(wfSyncState.liveRefreshTimer);
      wfSyncState.liveRefreshTimer = null;
    }
  }
  function queueWfResizeRender(){
    if(wfSyncState.resizeQueued || !visible) return;
    wfSyncState.resizeQueued = true;
    requestAnimationFrame(() => {
      wfSyncState.resizeQueued = false;
      if(visible) render();
    });
  }
  const WF_DIRECTION_FONT_MAX_PX = 10;
  const WF_DIRECTION_FONT_MIN_PX = 6;
  const WF_RESULT_FONT_MAX_PX = 24;
  const WF_RESULT_FONT_MIN_PX = 11;
  // WF-COS02: bounds for the flexible result column - reusing the exact minimum (116px)
  // and window-width ratio (30%) this column already used for its old label-only sizing,
  // rather than inventing new numbers. WIDTH_PADDING_PX is the same breathing-room buffer
  // the old label-width calc already added (+16).
  const WF_SIDE_WIDTH_MIN_PX = 116;
  const WF_SIDE_WIDTH_MAX_RATIO = 0.30;
  const WF_SIDE_WIDTH_PADDING_PX = 16;
  let wfMeasureCanvas = null;
  function wfRenderedTextWidth(node){
    if(!node) return 0;
    try{
      const range = document.createRange();
      range.selectNodeContents(node);
      const width = range.getBoundingClientRect().width;
      if(typeof range.detach === "function") range.detach();
      if(Number.isFinite(width) && width > 0) return width;
    }catch(_e){}
    try{
      wfMeasureCanvas = wfMeasureCanvas || document.createElement("canvas");
      const context = wfMeasureCanvas.getContext("2d");
      const style = window.getComputedStyle(node);
      context.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = String(node.textContent || "");
      const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
      return context.measureText(text).width + Math.max(0,text.length-1) * letterSpacing;
    }catch(_e){
      return node.scrollWidth || 0;
    }
  }
  function wfUsableInnerWidth(node){
    if(!node) return 0;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return Math.max(0,rect.width
      - (Number.parseFloat(style.borderLeftWidth) || 0)
      - (Number.parseFloat(style.borderRightWidth) || 0)
      - (Number.parseFloat(style.paddingLeft) || 0)
      - (Number.parseFloat(style.paddingRight) || 0));
  }
  function fitWfDirectionLabels(chart){
    if(!chart) return;
    chart.querySelectorAll(".wf-bar-col").forEach(column => {
      const bar = column.querySelector(".wf-bar");
      const label = column.querySelector(".wf-bar-dir");
      if(!bar || !label) return;
      label.hidden = false;
      label.removeAttribute("aria-hidden");
      label.style.fontSize = `${WF_DIRECTION_FONT_MAX_PX}px`;
      const usableWidth = wfUsableInnerWidth(bar);
      const targetWidth = usableWidth * 0.86;
      let renderedWidth = wfRenderedTextWidth(label);
      if(!(targetWidth > 0)){
        label.hidden = true;
        label.setAttribute("aria-hidden","true");
        return;
      }
      if(!(renderedWidth > 0)) return;
      if(renderedWidth > targetWidth){
        let fontSize = Math.min(WF_DIRECTION_FONT_MAX_PX,WF_DIRECTION_FONT_MAX_PX * targetWidth / renderedWidth);
        if(fontSize < WF_DIRECTION_FONT_MIN_PX){
          label.hidden = true;
          label.setAttribute("aria-hidden","true");
          return;
        }
        fontSize = Math.floor(fontSize * 4) / 4;
        label.style.fontSize = `${fontSize}px`;
        renderedWidth = wfRenderedTextWidth(label);
        while(fontSize > WF_DIRECTION_FONT_MIN_PX && renderedWidth > targetWidth){
          fontSize = Math.max(WF_DIRECTION_FONT_MIN_PX,fontSize-0.25);
          label.style.fontSize = `${fontSize}px`;
          renderedWidth = wfRenderedTextWidth(label);
        }
        if(renderedWidth > targetWidth + 0.25){
          label.hidden = true;
          label.setAttribute("aria-hidden","true");
        }
      }
    });
  }
  function wfCompactMoney(value){
    const n = num(value);
    if(n == null) return "-";
    const magnitude = Math.abs(n);
    if(magnitude < 1000) return money(n);
    const units = [[1e12,"T"],[1e9,"B"],[1e6,"M"],[1e3,"K"]];
    const unit = units.find(item => magnitude >= item[0]) || units[units.length-1];
    const scaled = magnitude / unit[0];
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    const text = scaled.toFixed(decimals).replace(/\.0+$/g,"").replace(/(\.\d*?)0+$/g,"$1");
    return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${text}${unit[1]}`;
  }
  // WF-COS02: the result column's width now flexes to fit each value's exact text (see
  // updateWfSideWidth below), so on a normal render the value already fits at its full
  // font size and this loop returns after the first width check. Font-shrinking and the
  // compact K/M/B/T fallback remain exactly as before, but now only trigger for values
  // extreme enough to exceed the column's max-width cap.
  function fitWfResultValues(result){
    if(!result) return;
    result.querySelectorAll(".wf-result-value").forEach(valueNode => {
      const exactText = String(valueNode.dataset.exactText || valueNode.textContent || "");
      const compactText = String(valueNode.dataset.compactText || exactText);
      const metric = valueNode.closest(".wf-result-metric") || result;
      const targetWidth = wfUsableInnerWidth(metric) - 2;
      valueNode.textContent = exactText;
      valueNode.style.fontSize = `${WF_RESULT_FONT_MAX_PX}px`;
      valueNode.classList.remove("is-compact");
      if(!(targetWidth > 0)) return;
      let renderedWidth = wfRenderedTextWidth(valueNode);
      if(renderedWidth <= targetWidth) return;
      let fontSize = Math.max(WF_RESULT_FONT_MIN_PX,Math.min(WF_RESULT_FONT_MAX_PX,WF_RESULT_FONT_MAX_PX * targetWidth / renderedWidth));
      fontSize = Math.floor(fontSize * 2) / 2;
      valueNode.style.fontSize = `${fontSize}px`;
      renderedWidth = wfRenderedTextWidth(valueNode);
      while(fontSize > WF_RESULT_FONT_MIN_PX && renderedWidth > targetWidth){
        fontSize = Math.max(WF_RESULT_FONT_MIN_PX,fontSize-0.5);
        valueNode.style.fontSize = `${fontSize}px`;
        renderedWidth = wfRenderedTextWidth(valueNode);
      }
      if(renderedWidth <= targetWidth) return;
      valueNode.textContent = compactText;
      valueNode.classList.add("is-compact");
      valueNode.style.fontSize = `${WF_RESULT_FONT_MAX_PX}px`;
      renderedWidth = wfRenderedTextWidth(valueNode);
      fontSize = renderedWidth > targetWidth
        ? Math.max(WF_RESULT_FONT_MIN_PX,Math.floor((WF_RESULT_FONT_MAX_PX * targetWidth / renderedWidth) * 2) / 2)
        : WF_RESULT_FONT_MAX_PX;
      valueNode.style.fontSize = `${fontSize}px`;
    });
  }
  // WF-COS02: measures how wide `text` would render at `fontSizePx` (the value's natural,
  // unshrunk size) on the real `node`, including its own padding - temporarily mutates the
  // node to measure, then restores it. Safe to call mid-render: updateWfSideWidth only
  // does this when content actually changed, and any resulting width change re-renders
  // via queueWfResizeRender before the next paint (same technique already used by
  // fitWfDirectionLabels/fitWfResultValues's own shrink loops above).
  function wfMeasureResultValueWidth(node,text,fontSizePx){
    if(!node) return 0;
    const originalText = node.textContent;
    const originalFontSize = node.style.fontSize;
    node.textContent = text;
    node.style.fontSize = `${fontSizePx}px`;
    const style = window.getComputedStyle(node);
    const horizontalPadding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const width = wfRenderedTextWidth(node) + horizontalPadding;
    node.textContent = originalText;
    node.style.fontSize = originalFontSize;
    return width;
  }
  function updateWfSideWidth(win,result){
    if(!win || !result) return;
    const labelNodes = Array.from(result.querySelectorAll(".wf-result-label"));
    const valueNodes = Array.from(result.querySelectorAll(".wf-result-value"));
    if(!valueNodes.length) return;
    const nextKey = valueNodes.map(node => node.dataset.exactText || node.textContent || "").join("|")
      + "|" + labelNodes.map(node => node.textContent || "").join("|")
      + "|" + Math.round(win.clientWidth || 0);
    if(nextKey === wfSyncState.sideWidthKey && wfSyncState.sideWidthPx > 0) return;
    const labelWidth = labelNodes.reduce((width,node) => Math.max(width,node.scrollWidth || 0),0);
    // WF-COS02: the column now sizes to fit whichever is wider, the label or the value's
    // own exact (unshrunk) text - previously only the label was measured here, so the
    // value was always left to shrink/compact-format to whatever width the label allowed.
    const valueWidth = valueNodes.reduce((width,node) => {
      const exactText = String(node.dataset.exactText || node.textContent || "");
      return Math.max(width,wfMeasureResultValueWidth(node,exactText,WF_RESULT_FONT_MAX_PX));
    },0);
    const contentWidth = Math.max(labelWidth,valueWidth);
    const maximum = Math.max(WF_SIDE_WIDTH_MIN_PX,Math.floor((win.clientWidth || 520) * WF_SIDE_WIDTH_MAX_RATIO));
    const nextWidth = Math.min(maximum,Math.max(WF_SIDE_WIDTH_MIN_PX,Math.ceil(contentWidth + WF_SIDE_WIDTH_PADDING_PX)));
    const changed = Math.abs(nextWidth - wfSyncState.sideWidthPx) >= 2;
    wfSyncState.sideWidthKey = nextKey;
    wfSyncState.sideWidthPx = nextWidth;
    win.style.setProperty("--wf-side-width",nextWidth + "px");
    if(changed) queueWfResizeRender();
  }

  function profitRatioCell(value){
    const n = num(value);
    if(!(n >= 0)) return {text:"N/A",cls:"is-na"};
    if(n < 1) return {text:n.toFixed(2),cls:"is-bad"};
    if(n < 1.25) return {text:n.toFixed(2),cls:"is-neutral"};
    if(n < 1.5) return {text:n.toFixed(2),cls:"is-amber"};
    if(n < 2) return {text:n.toFixed(2),cls:"is-good"};
    return {text:n.toFixed(2),cls:"is-strong"};
  }
  function wfPnlColor(value){
    const n = num(value);
    if(n == null || Math.abs(n) < 1e-12) return WF_BLACK;
    return n > 0 ? WF_GREEN : WF_RED;
  }
  function returnPctCell(value){
    const n = num(value && typeof value === "object" ? value.value : value);
    if(n == null) return {text:"N/A",cls:"is-flat"};
    if(n <= -5) return {text:pctText(n),cls:"is-deep-loss"};
    if(n <= -2) return {text:pctText(n),cls:"is-loss"};
    if(n <= -0.25) return {text:pctText(n),cls:"is-soft-loss"};
    if(n < 0.25) return {text:pctText(n),cls:"is-flat"};
    if(n < 1) return {text:pctText(n),cls:"is-soft-gain"};
    if(n < 3) return {text:pctText(n),cls:"is-gain"};
    return {text:pctText(n),cls:"is-strong-gain"};
  }
  function wfReturnMetrics(selectedNet){
    const unavailable = {value:null,startBalance:null,currentBalance:null,derivedStartBalance:null,source:"unavailable"};
    // WF-C02: absence of a valid report is not a genuinely flat period.
    if(selectedNet == null) return unavailable;
    const selected = num(selectedNet);
    if(selected == null) return unavailable;
    const rec = activeWfReport();
    const explicitStart = [
      rec && rec.startBalance,
      rec && rec.selectedPeriodStartBalance,
      rec && rec.startingBalance
    ].map(num).find(value => value != null && value > 0) || null;
    if(explicitStart){
      const value = selected / explicitStart * 100;
      return Number.isFinite(value)
        ? {value,startBalance:explicitStart,currentBalance:null,derivedStartBalance:null,source:"start-balance"}
        : {value:null,startBalance:explicitStart,currentBalance:null,derivedStartBalance:null,source:"unavailable"};
    }
    // WF-EXT-AB05: derived returns require a currently verified balance. Loading, stale,
    // unavailable, and error snapshots remain N/A rather than using a retained scalar value.
    const balanceSnapshot = window.BT001_ACCOUNT_BALANCE && typeof window.BT001_ACCOUNT_BALANCE.snapshot === "function"
      ? window.BT001_ACCOUNT_BALANCE.snapshot()
      : null;
    if(!balanceSnapshot || balanceSnapshot.status !== "fresh") return unavailable;
    const currentBalance = num(balanceSnapshot.value);
    if(currentBalance == null) return unavailable;
    const derivedStartBalance = currentBalance - selected;
    if(!(derivedStartBalance > 0)) return {value:null,startBalance:null,currentBalance,derivedStartBalance,source:"unavailable"};
    const value = selected / derivedStartBalance * 100;
    return Number.isFinite(value)
      ? {value,startBalance:null,currentBalance,derivedStartBalance,source:"derived"}
      : {value:null,startBalance:null,currentBalance,derivedStartBalance,source:"unavailable"};
  }
  function wfReturnDiagnostics(metrics){
    if(!metrics || !metrics.source) return "";
    if(metrics.source === "start-balance"){
      return "Return source: selected-period starting balance | Start: " + moneyPlain(metrics.startBalance);
    }
    if(metrics.source === "derived"){
      return "Return source: derived from current balance | Current: " + moneyPlain(metrics.currentBalance) + " | Derived start: " + moneyPlain(metrics.derivedStartBalance);
    }
    return "Return source: unavailable";
  }
  function wfWatermarks(trades){
    const rows = Array.isArray(trades) ? trades : [];
    let high = {index:null,value:0};
    rows.forEach((trade,index) => {
      const top = Math.max(num(trade && trade.start) || 0,num(trade && trade.end) || 0);
      if(top > high.value) high = {index,value:top};
    });
    return {high};
  }
  function wfHwmMetrics(watermarks,currentDisplayedNet){
    const peak = Math.max(0,num(watermarks && watermarks.high && watermarks.high.value) || 0);
    const current = num(currentDisplayedNet) || 0;
    let delta = current-peak;
    if(Math.abs(delta) < 1e-9) delta = 0;
    return {peak,current,delta};
  }
  function wfDurationText(startValue,endValue){
    const start = num(startValue);
    const end = num(endValue);
    if(start == null || end == null || end < start) return "00:00";
    const diffMs = start > 1e12 || end > 1e12 ? (end - start) : (end - start) * 1000;
    const totalMinutes = Math.max(0,Math.floor(diffMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return String(hours).padStart(2,"0") + ":" + String(minutes).padStart(2,"0");
  }
  function wfHeaderModeText(mode){
    return mode === "detail" ? "Detailed Reconstruct" : "Totals";
  }

  function ensureToggle(){
    let input = q("tglWaterfall");
    if(input) return input;
    const tradesLabel = tglResults && tglResults.closest ? tglResults.closest("label") : null;
    if(!tradesLabel || !tradesLabel.parentNode) return null;
    const label = document.createElement("label");
    label.className = "toggle";
    label.id = "wfToggleLabel";
    label.innerHTML = '<input id="tglWaterfall" type="checkbox"/><span>WF</span>';
    tradesLabel.insertAdjacentElement("afterend",label);
    input = q("tglWaterfall");
    if(input && !input.__wfBound){
      input.__wfBound = true;
      input.addEventListener("change",() => {
        if(input.checked) show();
        else hide();
      },false);
    }
    return input;
  }

  function ensureWindow(){
    let win = q("wfWindow");
    if(win) return win;
    win = document.createElement("div");
    win.id = "wfWindow";
    win.className = "wf-window hidden";
    win.innerHTML = `<div class="wf-head" id="wfHead">
        <div class="wf-title" id="wfWindowTitle"></div>
        <div class="wf-actions">
          <button id="wfCollapse" type="button" title="Collapse">-</button>
          <button id="wfClose" type="button" title="Close">x</button>
        </div>
      </div>
      <div class="wf-body" id="wfBody">
        <div class="wf-chart-card">
          <div class="wf-chart-shell">
            <div class="wf-chart" id="wfChart"></div>
            <div class="wf-result" id="wfResult"></div>
          </div>
        </div>
        <div class="wf-summary">
          <table class="wf-summary-table" id="wfSummaryTable"></table>
        </div>
      </div>
      ${["n","e","s","w","ne","se","sw","nw"].map(dir => `<div class="wf-resize-handle wf-resize-${dir}" data-resize="${dir}"></div>`).join("")}
      <div class="wf-hover-tip hidden" id="wfHoverTip"></div>`;
    document.body.appendChild(win);
    bindWindow(win);
    return win;
  }

  function bindWindow(win){
    const head = q("wfHead");
    const collapseBtn = q("wfCollapse");
    const closeBtn = q("wfClose");
    let drag = null;
    if(head && !head.__wfDragBound){
      head.__wfDragBound = true;
      head.addEventListener("pointerdown",event => {
        if(event.target.closest("button")) return;
        saveExpandedRect(win);
        const rect = win.getBoundingClientRect();
        drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
        try{head.setPointerCapture(event.pointerId);}catch(_e){}
        event.preventDefault();
      },false);
      head.addEventListener("pointermove",event => {
        if(!drag) return;
        win.style.left = Math.max(6,drag.left + event.clientX - drag.x) + "px";
        win.style.top = Math.max(6,drag.top + event.clientY - drag.y) + "px";
        win.style.right = "auto";
      },false);
      const endDrag = event => {
        saveExpandedRect(win);
        drag = null;
        try{head.releasePointerCapture(event.pointerId);}catch(_e){}
      };
      head.addEventListener("pointerup",endDrag,false);
      head.addEventListener("pointercancel",endDrag,false);
    }
    if(!win.__wfResizeBound){
      win.__wfResizeBound = true;
      win.querySelectorAll(".wf-resize-handle").forEach(handle => {
        handle.addEventListener("pointerdown",event => {
          if(win.classList.contains("is-collapsed")) return;
          saveExpandedRect(win);
          const rect = win.getBoundingClientRect();
          const start = {
            x:event.clientX,
            y:event.clientY,
            left:rect.left,
            top:rect.top,
            width:rect.width,
            height:rect.height,
            dir:handle.dataset.resize || ""
          };
          const minWidth = 520;
          const minHeight = 360;
          try{handle.setPointerCapture(event.pointerId);}catch(_e){}
          event.preventDefault();
          event.stopPropagation();
          const move = moveEvent => {
            const dx = moveEvent.clientX - start.x;
            const dy = moveEvent.clientY - start.y;
            let left = start.left;
            let top = start.top;
            let width = start.width;
            let height = start.height;
            if(start.dir.includes("e")) width = start.width + dx;
            if(start.dir.includes("s")) height = start.height + dy;
            if(start.dir.includes("w")){
              width = start.width - dx;
              left = start.left + dx;
            }
            if(start.dir.includes("n")){
              height = start.height - dy;
              top = start.top + dy;
            }
            if(width < minWidth){
              if(start.dir.includes("w")) left -= minWidth - width;
              width = minWidth;
            }
            if(height < minHeight){
              if(start.dir.includes("n")) top -= minHeight - height;
              height = minHeight;
            }
            left = clamp(left,6,window.innerWidth - 80);
            top = clamp(top,6,window.innerHeight - 60);
            width = Math.min(width,window.innerWidth - left - 6);
            height = Math.min(height,window.innerHeight - top - 6);
            win.style.left = left + "px";
            win.style.top = top + "px";
            win.style.right = "auto";
            win.style.width = width + "px";
            win.style.height = height + "px";
            saveExpandedRect(win);
            if(visible) render();
          };
          const up = endEvent => {
            document.removeEventListener("pointermove",move,true);
            document.removeEventListener("pointerup",up,true);
            document.removeEventListener("pointercancel",up,true);
            try{handle.releasePointerCapture(endEvent.pointerId);}catch(_e){}
          };
          document.addEventListener("pointermove",move,true);
          document.addEventListener("pointerup",up,true);
          document.addEventListener("pointercancel",up,true);
        },false);
      });
      if(typeof ResizeObserver === "function"){
        const observer = new ResizeObserver(() => {
          if(wfSyncState.suppressResizeRender) return;
          if(visible && !win.classList.contains("is-collapsed")) render();
        });
        observer.observe(win);
      }
    }
    const chart = q("wfChart");
    if(chart && !chart.__wfHoverBound){
      chart.__wfHoverBound = true;
      wfSyncState.crosshair.listenerBindings+=1;
      chart.addEventListener("pointermove",event => {
        wfSyncState.hoverClientX = event.clientX;
        wfSyncState.hoverClientY = event.clientY;
        wfSyncState.hoverInsideChart = true;
        updateWfCrosshairFromPointer(event);
        const bar = event.target.closest ? event.target.closest(".wf-bar[data-trade-index]") : null;
        if(!bar){
          hoverTradeIndex = null;
          renderHover();
          return;
        }
        const next = Number(bar.dataset.tradeIndex);
        hoverTradeIndex = Number.isFinite(next) ? next : null;
        renderHover(event);
      },false);
      chart.addEventListener("pointerleave",() => {
        wfSyncState.hoverInsideChart = false;
        hoverTradeIndex = null;
        hideWfCrosshair();
        renderHover();
      },false);
      chart.addEventListener("click",event => {
        const bar = event.target.closest ? event.target.closest(".wf-bar[data-trade-index]") : null;
        if(!bar) return;
        const next = Number(bar.dataset.tradeIndex);
        if(next < 0) return;
        const trade = lastModel && Array.isArray(lastModel.trades) ? lastModel.trades[next] : null;
        if(trade) bridgeTradeIsolate(trade);
      },false);
    }
    if(collapseBtn && !collapseBtn.__wfBound){
      collapseBtn.__wfBound = true;
      collapseBtn.addEventListener("click",() => {
        if(win.classList.contains("is-collapsed")){
          wfSyncState.suppressResizeRender = true;
          applyExpandedRect(win);
          win.classList.remove("is-collapsed");
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              wfSyncState.suppressResizeRender = false;
              if(visible) render();
            });
          });
          return;
        }
        saveExpandedRect(win);
        hideWfCrosshair();
        const headNode = q("wfHead");
        const headerHeight = headNode ? Math.ceil(headNode.getBoundingClientRect().height) + 2 : 28;
        win.style.height = headerHeight + "px";
        win.classList.add("is-collapsed");
      },false);
    }
    if(closeBtn && !closeBtn.__wfBound){
      closeBtn.__wfBound = true;
      closeBtn.addEventListener("click",() => {
        const toggle = ensureToggle();
        if(toggle) toggle.checked = false;
        hide();
      },false);
    }
  }

  function buildFastTradeRows(report){
    const rows = report && Array.isArray(report.summaries) ? report.summaries : [];
    let cumulative = 0;
    return rows.map((row,index) => {
      const net = num(row && row.net) || 0;
      const realized = net;
      const fees = num(row && row.fees);
      const qty = num(row && row.qty);
      const openTime = num(row && row.openTime);
      const closeTime = num(row && row.closeTime);
      const side = String(row && row.side || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
      const duration = openTime != null && closeTime != null ? wfDurationText(openTime,closeTime) : "";
      const tooltipLines = [];
      tooltipLines.push("Direction: " + (side === "SHORT" ? "Short" : "Long"));
      if(duration) tooltipLines.push("Duration: " + duration);
      if(qty != null) tooltipLines.push("Closed Volume: " + window.fq(qty));
      tooltipLines.push([{text:"Realized P/L: ",color:WF_BLACK},{text:window.fm(realized),color:wfPnlColor(realized),bold:true}]);
      if(fees != null) tooltipLines.push([{text:"Commission / Fees: ",color:WF_BLACK},{text:window.fm(fees),color:wfPnlColor(fees),bold:true}]);
      if(row && row.limited) tooltipLines.push("Limited detail: partial context");
      const trade = {
        id:row && row.id ? row.id : ("wf_fast_" + index),
        parentTradeId:row && row.parentTradeId ? row.parentTradeId : null,
        chainId:row && (row.detailChainId || row.parentTradeId) ? (row.detailChainId || row.parentTradeId) : null,
        index,
        when:closeTime == null ? "-" : shortDate(closeTime),
        net,
        realized,
        fees,
        fundingDelta:null,
        dir:String(row && row.dir || window.closedTradeFastSummaryDirection(side)),
        tooltipLines,
        finalExit:null,
        links:[],
        finalExitTime:closeTime,
        markerId:row && row.markerId ? row.markerId : null,
        start:cumulative,
        end:cumulative + net,
        limited:!!(row && row.limited)
      };
      cumulative = trade.end;
      return trade;
    });
  }

  function buildTradeRows(){
    const mode = wfDataMode();
    const snap = closedTradesOwnerSnapshot();
    if(mode === "fast") return wfHasCurrentFastReport() ? buildFastTradeRows(snap && snap.fastReport) : [];
    if(mode === "detail" && !wfHasCurrentDetailReport()) return [];
    const rec = snap && snap.reportProjection;
    const parents = typeof window.closedTradeParentTrades === "function" ? window.closedTradeParentTrades(rec || {}) : [];
    const trades = parents.map((trade,index) => {
      const realized = (trade.links && trade.links.length)
        ? trade.links.reduce((sum,link) => sum + window.closedTradeRealizedValue(link),0)
        : (trade.exits || []).reduce((sum,marker) => sum + window.closedTradeNumber(marker && (marker.binanceRealizedPnl ?? marker.realizedPnl ?? marker.pnl)),0);
      const fees = (trade.links && trade.links.length)
        ? trade.links.reduce((sum,link) => sum + window.closedTradeSignedFeeValue(link && (link.fees ?? link.fee)),0)
        : (trade.exits || []).reduce((sum,marker) => sum + window.closedTradeSignedFeeValue(marker && marker.fee),0);
      const fundingDelta = (num(trade && trade.netTotal) || 0) - ((num(realized) || 0) + (num(fees) || 0));
      const net = (num(realized) || 0) + (num(fees) || 0) + (num(fundingDelta) || 0);
      const firstEntryTime = num(trade && trade.entries && trade.entries[0] && trade.entries[0].time);
      const finalExitTime = num(trade && trade.finalExit && trade.finalExit.time);
      const dir = String(trade && trade.entries && trade.entries[0] && trade.entries[0].side || "").toUpperCase() === "SHORT" ? "S" : "L";
      const dirText = dir === "S" ? "Short" : "Long";
      const tooltipLines = [
        "Direction: " + dirText,
        "Duration: " + wfDurationText(firstEntryTime,finalExitTime)
      ];
      if(trade.entries && trade.entries.length){
        tooltipLines.push("Entries (" + trade.entries.length + "):");
        trade.entries.forEach(marker => {
          const entryPnl = (trade.links || [])
            .filter(link => link && link.entryMarkerId === marker.id)
            .reduce((sum,link) => sum + window.closedTradeNumber(link && link.netPnl),0);
          tooltipLines.push([
            {text:(marker.letter || "E") + " " + window.fq(marker.qty) + " | ",color:WF_BLACK},
            {text:window.fm(entryPnl),color:wfPnlColor(entryPnl),bold:true}
          ]);
        });
      }
      if(trade.exits && trade.exits.length){
        tooltipLines.push("Exits (" + trade.exits.length + "):");
        trade.exits.forEach(marker => {
          const exitLinks = (trade.links || []).filter(link => link && link.exitMarkerId === marker.id);
          const exitPnl = exitLinks.length
            ? exitLinks.reduce((sum,link) => sum + window.closedTradeNumber(link && link.netPnl),0)
            : window.closedTradeNumber(marker && (marker.binanceRealizedPnl ?? marker.realizedPnl ?? marker.pnl));
          tooltipLines.push([
            {text:(marker.letter || (marker.isFinalExit ? "EX" : "P")) + " " + window.fq(marker.qty) + " | ",color:WF_BLACK},
            {text:window.fm(exitPnl),color:wfPnlColor(exitPnl),bold:true}
          ]);
        });
      }
      tooltipLines.push("");
      tooltipLines.push([{text:"Closing PnL | ",color:WF_BLACK},{text:window.fm(realized),color:wfPnlColor(realized),bold:true}]);
      tooltipLines.push([{text:"Trading Fee | ",color:WF_BLACK},{text:window.fm(fees),color:wfPnlColor(fees),bold:true}]);
      tooltipLines.push([{text:"Funding Fee | ",color:WF_BLACK},{text:window.fm(fundingDelta),color:wfPnlColor(fundingDelta),bold:true}]);
      tooltipLines.push("");
      tooltipLines.push([
        {text:"Net P/L | ",color:WF_BLACK,bold:true,large:true},
        {text:window.fm(net),color:wfPnlColor(net),bold:true,large:true}
      ]);
      return {
        id: trade.parentId || ("wf_" + index),
        parentTradeId: trade.parentId || null,
        chainId: trade.parentId || null,
        index,
        when: shortDate(trade.finalExit && trade.finalExit.time),
        net,
        realized,
        fees,
        fundingDelta,
        dir,
        tooltipLines,
        finalExit:trade.finalExit || null,
        links:trade.links || [],
        finalExitTime: num(trade.finalExit && trade.finalExit.time),
        markerId: trade.finalExit && trade.finalExit.id ? trade.finalExit.id : null,
        start:0,
        end:0
      };
    }).sort((a,b) => (a.finalExitTime || 0) - (b.finalExitTime || 0));
    let cumulative = 0;
    trades.forEach(trade => {
      trade.start = cumulative;
      cumulative += num(trade.net) || 0;
      trade.end = cumulative;
    });
    return trades;
  }

  function selectedPeriodDates(){
    if(reportWeeksEl && String(reportWeeksEl.value || "").toLowerCase() === "custom" && typeof window.parseCustomDate === "function"){
      const start = window.parseCustomDate(customFromEl ? customFromEl.value : "",false);
      const end = window.parseCustomDate(customToEl ? customToEl.value : "",true);
      if(Number.isFinite(start) && Number.isFinite(end) && end >= start){
        return {start,end};
      }
    }
    const win = window.closedTradePeriodWindowMs(reportWeeksEl && reportWeeksEl.value);
    return {start:win.start,end:win.end};
  }

  function buildViewModel(){
    const mode = wfDataMode();
    const wfReport = activeWfReport();
    const hasValidReport = !!wfReport;
    const trades = buildTradeRows();
    const liveTrade = livePreviewTrade();
    const fastSummary = mode === "fast" && wfReport && wfReport.summary ? wfReport.summary : null;
    const selectedNetBase = mode === "fast"
      ? (num(fastSummary && fastSummary.netTotal) || 0)
      : trades.reduce((sum,trade) => sum + (num(trade.net) || 0),0);
    const selectedNet = selectedNetBase;
    const watermarks = wfWatermarks(trades);
    const liveNet = num(liveTrade && liveTrade.net) || 0;
    const returnMetrics = wfReturnMetrics(hasValidReport ? selectedNet : null);
    const wins = trades.filter(trade => trade.net > 0);
    const losses = trades.filter(trade => trade.net < 0);
    const totalWin = wins.reduce((sum,trade) => sum + trade.net,0);
    const totalLoss = losses.reduce((sum,trade) => sum + trade.net,0);
    const largestWin = wins.length ? Math.max(...wins.map(trade => trade.net)) : null;
    const largestLoss = losses.length ? Math.min(...losses.map(trade => trade.net)) : null;
    const grossWins = wins.reduce((sum,trade) => sum + Math.max(0,num(trade.net) || 0),0);
    const grossLosses = losses.reduce((sum,trade) => sum + Math.abs(Math.min(0,num(trade.net) || 0)),0);
    const headlineNet = selectedNet + liveNet;
    const hwm = wfHwmMetrics(watermarks,headlineNet);
    const headlineGrossWins = grossWins + Math.max(0,liveNet);
    const headlineGrossLosses = grossLosses + Math.abs(Math.min(0,liveNet));
    const headlineProfitRatio = headlineGrossLosses > 0 ? headlineGrossWins / headlineGrossLosses : null;
    const returnPct = liveTrade && hasValidReport ? wfReturnMetrics(headlineNet) : returnMetrics;
    const livePreviewBars = wfLivePreviewBars(liveTrade,trades);
    const chartTrades = livePreviewBars.length ? trades.concat(livePreviewBars) : trades.slice();
    const values = [0].concat(chartTrades.flatMap(trade => [trade.start,trade.end])).filter(v => Number.isFinite(v));
    const minCumulative = values.length ? Math.min(...values) : 0;
    const maxCumulative = values.length ? Math.max(...values) : 0;
    const span = Math.max(1,maxCumulative - minCumulative);
    const pad = span * 0.08;
    const domainMin = Math.min(-WF_AXIS_MIN_ABS,minCumulative - pad,0);
    const domainMax = Math.max(WF_AXIS_MIN_ABS,maxCumulative + pad,0);
    const period = selectedPeriodDates();
    return {
      trades,
      chartTrades,
      watermarks,
      liveTrade,
      livePreviewBars,
      wins:wins.length,
      losses:losses.length,
      averageWin:wins.length ? totalWin / wins.length : null,
      averageLoss:losses.length ? totalLoss / losses.length : null,
      largestWin,
      largestLoss,
      totalWin,
      totalLoss,
      profitRatio:headlineProfitRatio,
      selectedNet:headlineNet,
      closedSelectedNet:selectedNet,
      floatingNet:liveNet,
      hwm,
      returnPct,
      mode,
      domainMin,
      domainMax,
      period
    };
  }

  function renderSummary(model){
    const table = q("wfSummaryTable");
    if(!table) return;
    const ratio = profitRatioCell(model.profitRatio);
    const returnPct = returnPctCell(model.returnPct);
    const returnTitle = wfEscape(wfReturnDiagnostics(model.returnPct));
    table.innerHTML = `<colgroup>
        <col>
        <col>
        <col>
        <col>
        <col>
        <col class="wf-ratio-col">
        <col class="wf-return-col">
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>Count</th>
          <th>Average</th>
          <th>Largest</th>
          <th>Total</th>
          <th class="wf-ratio-head">Profit Ratio</th>
          <th class="wf-return-head">Return %</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Wins</th>
          <td>${model.wins}</td>
          <td>${money(model.averageWin)}</td>
          <td>${money(model.largestWin)}</td>
          <td>${money(model.totalWin)}</td>
          <td class="wf-ratio-cell ${ratio.cls}" rowspan="2">${ratio.text}</td>
          <td class="wf-return-cell ${returnPct.cls}" rowspan="2" title="${returnTitle}">${returnPct.text}</td>
        </tr>
        <tr>
          <th>Losses</th>
          <td>${model.losses}</td>
          <td>${money(model.averageLoss)}</td>
          <td>${money(model.largestLoss)}</td>
          <td>${money(model.totalLoss)}</td>
        </tr>
      </tbody>`;
  }

  function renderChart(model){
    const chart = q("wfChart");
    const result = q("wfResult");
    const title = q("wfWindowTitle");
    if(!chart) return;
    if(title && model.period) title.textContent = "Closed positions | From : " + wfTitleDayText(model.period.start) + " To : " + wfTitleDayText(model.period.end) + " | " + wfHeaderModeText(model.mode);
    const watermarks = model.watermarks;
    const netValue = num(model.selectedNet) || 0;
    const resultClass = netValue < 0
      ? "is-loss"
      : Math.abs(netValue) < 1e-12
        ? "is-neutral"
        : "is-gain";
    if(result){
      const hwm = model.hwm;
      const hwmClass = hwm.delta < 0 ? "is-loss" : hwm.delta > 0 ? "is-gain" : "is-neutral";
      const netExact = fmtBigResult(model.selectedNet);
      const netTitle = [
        `Closed Net P/L: ${money(model.closedSelectedNet)}`,
        `Floating P/L: ${money(model.floatingNet)}`,
        `Current Net P/L: ${money(model.selectedNet)}`
      ].join("\n");
      const hwmExact = fmtBigResult(hwm.delta);
      const hwmTitle = [
        `Closed-trade HWM: ${money(hwm.peak)}`,
        `Current Net P/L: ${money(hwm.current)}`,
        `Distance from closed HWM: ${money(hwm.delta)}`
      ].join("\n");
      result.innerHTML = `<div class="wf-result-metric">
          <div class="wf-result-label">Net P/L</div>
          <div class="wf-result-value ${resultClass}" data-result-kind="net" title="${wfAttr(netTitle)}">${wfEscape(netExact)}</div>
        </div>
        <div class="wf-result-separator" aria-hidden="true"></div>
        <div class="wf-result-metric">
          <div class="wf-result-label">HWM Δ</div>
          <div class="wf-result-value ${hwmClass}" data-result-kind="hwm" title="${wfAttr(hwmTitle)}">${wfEscape(hwmExact)}</div>
        </div>`;
      const netNode = result.querySelector('[data-result-kind="net"]');
      const hwmNode = result.querySelector('[data-result-kind="hwm"]');
      if(netNode){
        netNode.dataset.exactText = netExact;
        netNode.dataset.compactText = wfCompactMoney(model.selectedNet);
      }
      if(hwmNode){
        hwmNode.dataset.exactText = hwmExact;
        hwmNode.dataset.compactText = wfCompactMoney(hwm.delta);
      }
      fitWfResultValues(result);
    }
    if(!model.trades.length && !model.liveTrade){
      wfSyncState.crosshair.scale=null;
      hideWfCrosshair();
      chart.innerHTML = `<div class="wf-empty">${model.mode === "fast" ? "No closed positions in the selected period." : "No closed trades in the selected period."}</div>`;
      return;
    }
    const plotTop = 10;
    const plotLeft = 48;
    const plotRight = 10;
    const plotBottom = 18;
    const plotHeight = Math.max(1,chart.clientHeight - plotTop - plotBottom);
    let domainMin = num(model.domainMin) != null ? num(model.domainMin) : -WF_AXIS_MIN_ABS;
    let domainMax = num(model.domainMax) != null ? num(model.domainMax) : WF_AXIS_MIN_ABS;
    const minDomainSpan = WF_AXIS_MIN_ABS * 2;
    if(domainMax - domainMin < minDomainSpan){
      const mid = (domainMax + domainMin) / 2;
      domainMin = mid - minDomainSpan / 2;
      domainMax = mid + minDomainSpan / 2;
    }
    const majorStep = niceStep(domainMax - domainMin);
    const majorTicks = [];
    const firstTick = Math.floor(domainMin / majorStep) * majorStep;
    for(let tick = firstTick; tick <= domainMax + majorStep * 0.5; tick += majorStep){
      majorTicks.push(Number(tick.toFixed(8)));
    }
    const minorTicks = [];
    const minorStep = majorStep / 2;
    for(let tick = firstTick - minorStep; tick <= domainMax + minorStep; tick += minorStep){
      const rounded = Number(tick.toFixed(8));
      if(majorTicks.some(major => Math.abs(major - rounded) < 1e-8)) continue;
      if(rounded < domainMin - 1e-8 || rounded > domainMax + 1e-8) continue;
      minorTicks.push(rounded);
    }
    const valueToY = value => {
      const domain = domainMax - domainMin;
      if(!(domain > 0)) return plotHeight / 2;
      return ((domainMax - value) / domain) * plotHeight;
    };
    const yToValue = y => {
      const domain=domainMax-domainMin;
      if(!(domain>0)) return (domainMax+domainMin)/2;
      return domainMax-(clamp(Number(y) || 0,0,plotHeight)/plotHeight)*domain;
    };
    wfSyncState.crosshair.scale={domainMin,domainMax,plotTop,plotLeft,plotRight,plotBottom,plotHeight,valueToY,yToValue};
    const labelTicks = [];
    // WF-COS07: gridline/axis-label Y positions are rounded to whole pixels. valueToY()
    // is continuous math and previously produced fractional `top` values; a fractional
    // border-top renders anti-aliased/blurred, which showed as a small visible "kink"
    // against the crisp whole-pixel .wf-axis-margin-line (WF-COS04) and .wf-bars grid
    // at the boundary where the axis-label area meets the plot area. Rounding here
    // (rather than only at the gridline element) keeps each label's own `top` matching
    // its gridline exactly, since both are derived from the same rounded value.
    const zeroY = Math.round(valueToY(0));
    const majorLines = majorTicks.map(tick => {
      const y = Math.round(valueToY(tick));
      if(y < -0.5 || y > plotHeight + 0.5) return "";
      if(!labelTicks.length || Math.abs(y - labelTicks[labelTicks.length - 1].y) >= 14){
        labelTicks.push({tick,y});
      }
      return `<div class="wf-gridline is-major" style="top:${y}px"></div>`;
    }).join("");
    const axisLabels = labelTicks.map(({tick,y}) => {
      const cls = Math.abs(tick) < 1e-8 ? "wf-axis-label is-zero" : "";
      const labelY = Math.abs(tick) < 1e-8 ? zeroY : y;
      return `<div class="${cls || "wf-axis-label"}" style="top:${labelY}px">${moneyPlain(tick).replace("$","")}</div>`;
    }
    ).join("");
    const minorLines = minorTicks.map(tick => {
      const y = Math.round(valueToY(tick));
      if(y < -0.5 || y > plotHeight + 0.5) return "";
      return `<div class="wf-gridline is-minor" style="top:${y}px"></div>`;
    }).join("");
    const chartTrades = Array.isArray(model.chartTrades) ? model.chartTrades : model.trades;
    const tradeCount = Math.max(1,chartTrades.length);
    const gapPx = tradeCount > 90 ? 0 : 1;
    const activeKey = activeWfTradeKey();
    const barsHtml = chartTrades.map((trade,index) => {
      const topValue = Math.max(trade.start,trade.end);
      const bottomValue = Math.min(trade.start,trade.end);
      const topY = Math.max(0,Math.min(plotHeight,valueToY(topValue)));
      const bottomY = Math.max(0,Math.min(plotHeight,valueToY(bottomValue)));
      const heightPx = Math.max(2,bottomY - topY);
      const dirTop = trade.dir === "S"
        ? Math.max(0,topY - 12)
        : Math.max(0,Math.min(plotHeight + 2,bottomY + 3));
      const cls = [trade.net >= 0 ? "is-gain" : "is-loss"];
      if(trade.live) cls.push("is-live");
      if(trade.live && trade.liveSegment === "realized") cls.push("is-live-realized");
      if(trade.live && trade.liveSegment === "floating") cls.push("is-live-floating");
      if(activeKey && tradeKey(trade) === activeKey) cls.push("is-selected");
      const connector = index < chartTrades.length - 1
        ? `<div class="wf-connector" style="top:${Math.max(0,Math.min(plotHeight,valueToY(trade.end)))}px;width:${Math.max(1,gapPx + 1)}px"></div>`
        : "";
      const barInner = trade.live ? `<span class="wf-bar-live-flag">Live</span>` : "";
      // WF-COS05: no sign class - watermarks.high.value is always >= 0 by construction
      // (wfWatermarks() only ever moves it upward from its 0 starting point), so the
      // conditional gain/loss/neutral tint from WF-COS03-FIX-02 was dead weight. Uses
      // moneyPlain() (no leading "+") instead of money() for the same reason - the value
      // is never negative in practice, so a signed prefix only added visual noise.
      const mark = watermarks.high && watermarks.high.index === index && !trade.live
        ? `<div class="wf-watermark is-high" style="top:${topY}px">
            <span class="wf-watermark-label">${moneyPlain(watermarks.high.value)}</span>
            <span class="wf-watermark-line"></span>
          </div>`
        : "";
      return `<div class="wf-bar-col">
          <div class="wf-bar ${cls.join(" ")}" data-trade-index="${trade.live ? -1 : index}" style="top:${topY}px;height:${heightPx}px">${barInner}</div>
          <span class="wf-bar-dir" style="top:${dirTop}px">${trade.dir}</span>
          ${connector}
          ${mark}
        </div>`;
    }).join("");
    // WF-COS07-RETRY: the margin line's height used to stop at plotHeight (=
    // chart.clientHeight - plotTop - plotBottom), i.e. 18px (plotBottom, the band
    // reserved for the "L"/"S" bar-direction labels) short of the chart's own bottom
    // edge. It never actually reached the horizontal border below the chart
    // (.wf-chart-shell's border-bottom) - it just stopped in mid-air, which read as a
    // kink/discontinuity right where the eye expects the vertical separator to meet
    // that border. axisMarginLineHeight extends it the rest of the way down so its
    // bottom endpoint lands exactly on chart.clientHeight, flush with .wf-chart's own
    // bottom edge (and therefore with .wf-chart-shell's border-bottom immediately
    // below it). Only the bottom moved - top stays at plotTop, unchanged.
    const axisMarginLineHeight = Math.max(1,chart.clientHeight - plotTop);
    chart.innerHTML = `<div class="wf-plot">
        <div class="wf-axis-band">${minorLines}${majorLines}<div class="wf-gridline is-zero" style="top:${zeroY}px"></div>${axisLabels}</div>
        <div class="wf-axis-margin-line" style="left:${plotLeft}px;top:${plotTop}px;height:${axisMarginLineHeight}px"></div>
        <div class="wf-bars" style="left:${plotLeft}px;right:${plotRight}px;top:${plotTop}px;bottom:${plotBottom}px;grid-template-columns:repeat(${tradeCount},minmax(2px,${WF_MAX_BAR_WIDTH_PX}px));gap:${gapPx}px">${barsHtml}</div>
        <div class="wf-crosshair hidden" id="wfCrosshair" aria-hidden="true">
          <div class="wf-crosshair-v"></div><div class="wf-crosshair-h"></div>
          <div class="wf-crosshair-label wf-crosshair-selected wf-crosshair-axis-value"></div>
          <div class="wf-crosshair-label wf-crosshair-amount wf-crosshair-axis-value wf-crosshair-right-value"></div>
        </div>
      </div>`;
    fitWfDirectionLabels(chart);
    renderWfCrosshair();
  }

  function wfTooltipLines(trade){
    return trade && Array.isArray(trade.tooltipLines) ? trade.tooltipLines.slice() : [];
  }
  function showWfTradesStatus(text){
    window.closedTradeStatus(text,{mode:"operational"});
    clearTimeout(showWfTradesStatus.__timer);
    showWfTradesStatus.__timer = setTimeout(() => {
      if(String(window.__bt001ClosedTradesOperationalText() || "") === String(text || "")) window.closedTradeStatus("",{mode:"operational"});
    },1800);
  }
  function findTradePlHit(trade){
    const markerId = trade && trade.markerId ? trade.markerId : null;
    const overlayHitItems = window.__bt001OverlayHitItems();
    if(!markerId || !Array.isArray(overlayHitItems)) return null;
    if(typeof window.syncOverlayHitOwnership === "function") window.syncOverlayHitOwnership();
    for(let i = overlayHitItems.length - 1; i >= 0; i--){
      const item = overlayHitItems[i];
      if(!item || item.kind !== "plbox" || item.markerId !== markerId) continue;
      if(typeof window.__v13Patch36IsClosedTradePlBox === "function" && !window.__v13Patch36IsClosedTradePlBox(item)) continue;
      return item;
    }
    return null;
  }
  function bridgeTradeIsolate(trade){
    if(!(tglResults && tglResults.checked)){
      showWfTradesStatus("Turn Trades ON to isolate trade");
      return;
    }
    const identity = {
      markerId:trade && trade.markerId ? trade.markerId : null,
      chainId:trade && (trade.parentTradeId || trade.chainId || trade.id || null),
      parentTradeId:trade && (trade.parentTradeId || trade.chainId || trade.id || null)
    };
    if(identity.markerId && typeof window.activateClosedTradeIsolateByIdentity === "function"){
      if(window.activateClosedTradeIsolateByIdentity(identity)){
        if(typeof window.focusClosedTradeIsolate === "function") window.focusClosedTradeIsolate();
        return;
      }
    }
    let hit = findTradePlHit(trade);
    if(!hit && typeof window.draw === "function"){
      try{ window.draw(); }catch(_e){}
      hit = findTradePlHit(trade);
    }
    if(hit && typeof window.activateIsolateFromPlLabel === "function"){
      window.activateIsolateFromPlLabel(hit);
      if(typeof window.focusClosedTradeIsolate === "function") window.focusClosedTradeIsolate();
      return;
    }
  }

  function renderHover(event){
    const tip = q("wfHoverTip");
    if(!tip) return;
    if(hoverTradeIndex == null){
      tip.classList.add("hidden");
      tip.innerHTML = "";
      tip.style.left = "";
      tip.style.top = "";
      tip.style.maxHeight = "";
      tip.style.columnCount = "";
      tip.style.maxWidth = "";
      tip.style.overflowY = "";
      return;
    }
    const trade = hoverTradeIndex < 0
      ? (lastModel && lastModel.liveTrade ? lastModel.liveTrade : null)
      : (lastModel && Array.isArray(lastModel.trades) ? lastModel.trades[hoverTradeIndex] : null);
    const lines = wfTooltipLines(trade);
    if(!lines.length || !event){
      tip.classList.add("hidden");
      tip.innerHTML = "";
      tip.style.left = "";
      tip.style.top = "";
      tip.style.maxHeight = "";
      tip.style.columnCount = "";
      tip.style.maxWidth = "";
      tip.style.overflowY = "";
      return;
    }
    tip.innerHTML = `<div class="wf-tip-columns">${lines.map(line => {
      if(line === "") return `<div class="wf-tip-spacer"></div>`;
      if(Array.isArray(line)){
        const lineClass = line.some(part => part && part.large) ? " class=\"wf-tip-line-lg\"" : "";
        return `<div${lineClass}>${line.map(part => {
          const classes = [];
          if(part && part.bold) classes.push("wf-tip-bold");
          if(part && part.large) classes.push("wf-tip-large");
          return `<span class="${classes.join(" ")}" style="color:${String(part && part.color || WF_BLACK)}">${wfEscape(part && part.text || "")}</span>`;
        }).join("")}</div>`;
      }
      return `<div>${wfEscape(line)}</div>`;
    }).join("")}</div>`;
    const win = ensureWindow();
    const chart = q("wfChart");
    const rect = win.getBoundingClientRect();
    const chartRect = chart ? chart.getBoundingClientRect() : rect;
    let left = event.clientX - rect.left + 14;
    let top = event.clientY - rect.top + 14;
    tip.classList.remove("hidden");
    tip.style.maxHeight = "";
    tip.style.columnCount = "";
    tip.style.maxWidth = Math.max(180,Math.floor(chartRect.width - 16)) + "px";
    const maxHeight = Math.max(120,Math.floor(chartRect.height - 12));
    const maxWidth = Math.max(180,Math.floor(chartRect.width - 16));
    for(let columns = 1; columns <= 4; columns += 1){
      tip.style.columnCount = columns > 1 ? String(columns) : "";
      tip.style.maxHeight = maxHeight + "px";
      tip.style.overflowY = columns >= 4 ? "auto" : "hidden";
      const measured = tip.getBoundingClientRect();
      if(measured.height <= maxHeight + 1 && measured.width <= maxWidth + 1) break;
    }
    const tipRect = tip.getBoundingClientRect();
    const chartLeft = chartRect.left - rect.left;
    const chartTop = chartRect.top - rect.top;
    const chartRight = chartRect.right - rect.left;
    const chartBottom = chartRect.bottom - rect.top;
    if(left + tipRect.width > chartRight - 8) left = Math.max(chartLeft + 8,left - tipRect.width - 28);
    if(top + tipRect.height > chartBottom - 8) top = Math.max(chartTop + 8,top - tipRect.height - 28);
    left = clamp(left,chartLeft + 8,Math.max(chartLeft + 8,chartRight - tipRect.width - 8));
    top = clamp(top,chartTop + 8,Math.max(chartTop + 8,chartBottom - tipRect.height - 8));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function render(){
    const win = ensureWindow();
    if(!win || !visible) return;
    const model = buildViewModel();
    lastModel = model;
    renderSummary(model);
    renderChart(model);
    updateWfSideWidth(win,q("wfResult"));
    restoreWfHoverTarget();
  }

  function show(){
    visible = true;
    const win = ensureWindow();
    if(!win) return;
    win.classList.remove("hidden");
    startLiveRefreshLoop();
    applyExpandedRect(win);
    render();
    if(wfDataMode() === "detail" && wfHasCurrentDetailReport()) return;
    ensureFastWfData({silent:false}).catch(error => {
      console.warn(MODULE + " fast WF auto-load failed",error);
    });
  }

  function hide(){
    visible = false;
    stopLiveRefreshLoop();
    hideWfCrosshair();
    const win = q("wfWindow");
    if(win) win.classList.add("hidden");
  }

  function install(){
    ensureToggle();
    ensureWindow();
    if(reportWeeksEl && !reportWeeksEl.__bt001WfFastReloadBound){
      reportWeeksEl.__bt001WfFastReloadBound = true;
      reportWeeksEl.addEventListener("change",() => {
        hideWfCrosshair();
        ensureFastWfData({force:true,silent:true,period:currentPeriodValue()}).catch(error => {
          console.warn(MODULE + " fast WF period reload failed",error);
        });
      },false);
    }
    if(typeof window.hasKeys === "function" && window.hasKeys()){
      setTimeout(() => {
        ensureFastWfData({silent:true}).catch(error => {
          console.warn(MODULE + " fast WF initial load failed",error);
        });
      },60);
    }
  }

  // WF-EXT-CT06: WF no longer monkey-patches loadClosedTradesFastForPeriod /
  // loadClosedTradesForPeriod / clearTrades. It subscribes to the owner's publication
  // instead - the publication fires only after a *committed* fast load, detail load,
  // reconstruction route, or clear (never on busy/stale/error, which leave state and
  // therefore the publication untouched), so this listener sees exactly the same
  // "did closed-trade data actually change" moments the old wrappers detected via a
  // truthy return value - without reassigning the shared function bindings.
  if(typeof window !== "undefined" && !window.__bt001WfClosedTradesStateBound){
    window.__bt001WfClosedTradesStateBound = true;
    window.addEventListener("bt001:closed-trades-state",event => {
      const detail = event && event.detail || {};
      if(detail.status === "unavailable"){
        clearAutoCloseSync();
        markClosedTradesLoaded(false);
      }else{
        markClosedTradesLoaded(true);
      }
      if(visible) render();
    },false);
  }

  // WF-EXT-DR04: WF's refreshAccountBalance() monkey-patch was removed - same generic
  // "something might have changed, re-check" catch-all pattern as the draw() wrapper
  // removed in WF-EXT-DR01. Investigation for WF-EXT-DR05 found WF had no listener bound
  // to bt001:account-balance-state (unlike open-position/closed-trades, which already had
  // one) - the balance publication existed and fired correctly, WF just wasn't subscribed
  // to it. That gap is closed below by subscribing to it directly, matching the exact
  // pattern already used for the other two owner publications.

  // WF-EXT-DR01: WF's draw() monkey-patch (formerly guarded by __bt001WfLiveDrawBridge)
  // was removed. It existed only as a generic "something might have changed, re-check"
  // catch-all calling maybeRefreshLivePreview(). That is now fully covered by: the
  // 350ms live ticker (startLiveRefreshLoop, price/general polling), the Account
  // Balance subscription below, the bt001:open-position-visual-state subscription,
  // and the bt001:closed-trades-state subscription below - see WF-EXT-DR02 in the
  // report for the full trigger-coverage audit. draw() itself is untouched.

  if(typeof window !== "undefined" && !window.__bt001WfLiveSyncBound){
    window.__bt001WfLiveSyncBound = true;
    window.addEventListener("bt001:account-balance-state",() => {
      maybeRefreshLivePreview();
    },false);
    window.addEventListener("bt001:open-position-visual-state",() => {
      maybeRefreshLivePreview();
    },false);
    window.addEventListener("v13:open-position-change",event => {
      const detail = event && event.detail || {};
      if(detail && detail.closed && !(detail && detail.sideChanged && detail.current)) scheduleAutoCloseSync(1250);
      else if(detail && detail.opened) clearAutoCloseSync();
      maybeRefreshLivePreview();
    },false);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();

window.BT001_WATERFALL_WINDOW = {
  version:MODULE,show,hide,render,
  _selfTest:runWfCrosshairSelfTests,
  _diagnostics:() => {
    const crosshair=wfSyncState.crosshair,scale=crosshair.scale,overlay=q("wfCrosshair"),closedPartials=wfCurrentCampaignClosedPartialPL();
    // WF-COS06: Value 2 (amount) now lives inside the same chart overlay as Value 1, so
    // its own box is the meaningful rect here instead of a separate values container.
    const amountNode=overlay && overlay.querySelector(".wf-crosshair-amount");
    const amountRect=amountNode && amountNode.getBoundingClientRect();
    return {
      visible,listenerBindings:crosshair.listenerBindings,active:crosshair.active,updates:crosshair.updates,
      selectedLevel:crosshair.selectedLevel,currentCampaignClosedPartials:closedPartials,
      amountToLevel:Number.isFinite(crosshair.selectedLevel) ? crosshair.selectedLevel-closedPartials : null,
      selectedText:overlay && overlay.querySelector(".wf-crosshair-selected") && overlay.querySelector(".wf-crosshair-selected").textContent || "",
      amountText:amountNode && amountNode.textContent || "",
      labelRect:amountRect ? {left:amountRect.left,top:amountRect.top,right:amountRect.right,bottom:amountRect.bottom,width:amountRect.width,height:amountRect.height} : null,
      scale:scale ? {domainMin:scale.domainMin,domainMax:scale.domainMax,plotTop:scale.plotTop,plotLeft:scale.plotLeft,plotRight:scale.plotRight,plotBottom:scale.plotBottom,plotHeight:scale.plotHeight} : null
    };
  }
};
})();
