(() => {
  "use strict";

  const MODULE = "CALCULATOR_MODULE";
  const OPEN_ORDERS_URL = "https://fapi.binance.com/fapi/v1/openOrders";
  const OPEN_ALGO_ORDERS_URL = "https://fapi.binance.com/fapi/v1/openAlgoOrders";
  const ALGO_ORDER_WRITE_URL = "https://fapi.binance.com/fapi/v1/algoOrder";
  const ORDER_WRITE_URL = "https://fapi.binance.com/fapi/v1/order";
  const STORE = "btc_futures_chart_v13_calculator_";
  const LEVELS_VISIBLE_KEY = STORE + "levels_visible";
  const SL_SEND_ENABLED_KEY = STORE + "sl_send_enabled";
  const CBS_ENABLED_KEY = STORE + "cbs_enabled";
  const EXPRESS_MODE_ENABLED_KEY = STORE + "express_mode_enabled";
  const STRUCTURAL_WARNING_TEXT = "Position/orders changed \u2014 re-check math";
  const AUTO_SYNC_POLL_MS = 2000;
  const AUTO_SYNC_DEBOUNCE_MS = 800;
  const CALC_OWNED_REFRESH_SOURCES = new Set(["preflightRead","sendConfirm","postSendRefresh","resultWindowClose"]);
  let zTop = 82;
  let direction = "LONG";
  let syncingStop = false;
  let lastStopEdit = "level";
  let levelsVisible = true;
  let slSendEnabled = false;
  let cbsEnabled = false;
  let expressModeEnabled = false;
  let binanceLimitRowSeq = 0;
  const binanceLimitRowMetaByRowId = new Map();
  let currentStopAlgoMeta = null;
  let lastReadDiagnostic = null;
  let lastOverlayDiagnostic = null;
  let lastSendDiagnostic = null;
  let overlayLevelBoxes = [];
  let overlayDrag = {active:false,row:null,target:"row"};
  let suppressNextOverlayClick = false;
  let sendPopupDrag = null;
  let lastReadStateSnapshot = null;
  let sendPlanState = null;
  let sendPlanSeq = 0;
  let autoSyncEnabled = false;
  let autoSyncPollTimer = null;
  let autoSyncDebounceTimer = null;
  let autoSyncChecking = false;
  let autoSyncRefreshing = false;
  let autoSyncBaselineSignature = "";
  let structuralWarningActive = false;
  let calculatorOwnedRefreshDepth = 0;

  function q(id){ return document.getElementById(id); }
  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function fmtPrice(v){
    const n = num(v);
    return n == null ? "-" : Math.round(n).toLocaleString("en-US");
  }
  function fmtLot(v){
    const n = num(v);
    return n == null ? "-" : Number(n.toFixed(3)).toFixed(3);
  }
  function fmtMoney(v){
    const n = num(v);
    if(n == null) return "-";
    return (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
  }
  function moneyColor(v){
    const n = num(v);
    return n == null || n === 0 ? "#111" : n > 0 ? "#047857" : "#f6465d";
  }
  function setMoney(node,value){
    if(!node) return;
    node.textContent = fmtMoney(value);
    node.style.color = moneyColor(value);
  }
  function setStatus(text){
    const el = q("calcModuleStatus");
    if(el){
      el.textContent = text || "";
      el.classList.toggle("is-warning",text === STRUCTURAL_WARNING_TEXT);
    }
  }
  function showStructuralWarning(){
    structuralWarningActive = true;
    setStatus(STRUCTURAL_WARNING_TEXT);
  }
  function clearStructuralWarning(){
    structuralWarningActive = false;
  }
  function isCalculatorOwnedRefreshActive(){
    return calculatorOwnedRefreshDepth > 0;
  }
  async function withCalculatorOwnedRefresh(_source,callback){
    calculatorOwnedRefreshDepth++;
    try{
      return await callback();
    }finally{
      calculatorOwnedRefreshDepth = Math.max(0,calculatorOwnedRefreshDepth - 1);
    }
  }
  function infra(){
    return window.CalculatorInfrastructure || null;
  }
  function loadLevelsVisible(){
    const adapter = infra();
    if(adapter && typeof adapter.readFlag === "function"){
      return adapter.readFlag(LEVELS_VISIBLE_KEY,true);
    }
    try{
      const raw = localStorage.getItem(LEVELS_VISIBLE_KEY);
      if(raw == null) return true;
      return raw !== "0";
    }catch(_e){
      return true;
    }
  }
  function loadSlSendEnabled(){
    const adapter = infra();
    if(adapter && typeof adapter.readFlag === "function"){
      return adapter.readFlag(SL_SEND_ENABLED_KEY,false);
    }
    try{
      return localStorage.getItem(SL_SEND_ENABLED_KEY) === "1";
    }catch(_e){
      return false;
    }
  }
  function loadCbsEnabled(){
    const adapter = infra();
    if(adapter && typeof adapter.readFlag === "function"){
      return adapter.readFlag(CBS_ENABLED_KEY,false);
    }
    try{
      return localStorage.getItem(CBS_ENABLED_KEY) === "1";
    }catch(_e){
      return false;
    }
  }
  function loadExpressModeEnabled(){
    const adapter = infra();
    if(adapter && typeof adapter.readFlag === "function"){
      return adapter.readFlag(EXPRESS_MODE_ENABLED_KEY,false);
    }
    try{
      return localStorage.getItem(EXPRESS_MODE_ENABLED_KEY) === "1";
    }catch(_e){
      return false;
    }
  }
  function saveLevelsVisible(next){
    levelsVisible = !!next;
    const adapter = infra();
    if(adapter && typeof adapter.writeFlag === "function"){
      adapter.writeFlag(LEVELS_VISIBLE_KEY,levelsVisible);
    }else{
      try{ localStorage.setItem(LEVELS_VISIBLE_KEY,levelsVisible ? "1" : "0"); }catch(_e){}
    }
    const tgl = q("calcModuleLevelsToggle");
    if(tgl) tgl.checked = levelsVisible;
    const box = q("calcModuleLevelsToggleWrap");
    if(box){
      box.classList.toggle("is-on",levelsVisible);
      box.classList.toggle("is-off",!levelsVisible);
    }
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }
  function saveSlSendEnabled(next){
    slSendEnabled = !!next;
    const adapter = infra();
    if(adapter && typeof adapter.writeFlag === "function"){
      adapter.writeFlag(SL_SEND_ENABLED_KEY,slSendEnabled);
    }else{
      try{ localStorage.setItem(SL_SEND_ENABLED_KEY,slSendEnabled ? "1" : "0"); }catch(_e){}
    }
    const tgl = q("calcModuleSlToggle");
    if(tgl) tgl.checked = slSendEnabled;
    const wrap = q("calcModuleSlToggleWrap");
    if(wrap){
      wrap.classList.toggle("is-on",slSendEnabled);
      wrap.classList.toggle("is-off",!slSendEnabled);
    }
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }
  function saveCbsEnabled(next){
    cbsEnabled = !!next;
    const adapter = infra();
    if(adapter && typeof adapter.writeFlag === "function"){
      adapter.writeFlag(CBS_ENABLED_KEY,cbsEnabled);
    }else{
      try{ localStorage.setItem(CBS_ENABLED_KEY,cbsEnabled ? "1" : "0"); }catch(_e){}
    }
    const tgl = q("calcModuleCbsToggle");
    if(tgl) tgl.checked = cbsEnabled;
    const wrap = q("calcModuleCbsToggleWrap");
    if(wrap){
      wrap.classList.toggle("is-on",cbsEnabled);
      wrap.classList.toggle("is-off",!cbsEnabled);
    }
  }
  function saveExpressModeEnabled(next){
    expressModeEnabled = !!next;
    const adapter = infra();
    if(adapter && typeof adapter.writeFlag === "function"){
      adapter.writeFlag(EXPRESS_MODE_ENABLED_KEY,expressModeEnabled);
    }else{
      try{ localStorage.setItem(EXPRESS_MODE_ENABLED_KEY,expressModeEnabled ? "1" : "0"); }catch(_e){}
    }
    const tgl = q("calcModuleExpressToggle");
    if(tgl) tgl.checked = expressModeEnabled;
    const wrap = q("calcModuleExpressToggleWrap");
    if(wrap){
      wrap.classList.toggle("is-on",expressModeEnabled);
      wrap.classList.toggle("is-off",!expressModeEnabled);
    }
  }

  function calcLevelsInteractive(){
    try{
      const win = q("calcModuleWindow");
      const winVisible = win ? !win.classList.contains("hidden") : false;
      return !!(levelsVisible && winVisible);
    }catch(_e){ return !!levelsVisible; }
  }
  function calcSlInteractive(){
    return calcLevelsInteractive() && slSendEnabled;
  }
  function levelInput(row){ return row ? row.querySelector(".calc-module-level") : null; }
  function lotInput(row){ return row ? row.querySelector(".calc-module-lot") : null; }
  function isRowEmpty(row){
    const levelVal = String(levelInput(row)?.value || "").trim();
    const lotVal = String(lotInput(row)?.value || "").trim();
    return !levelVal && !lotVal;
  }

  function ensureButton(){
    const account = q("mBalance") && q("mBalance").closest(".metric");
    const assess = q("v29AssessMetric");
    let wrap = q("calcModuleMetric");
    let btn = q("calcOpenBtn");
    if(btn && wrap) return btn;
    if(!wrap){
      wrap = document.createElement("div");
      wrap.id = "calcModuleMetric";
      wrap.className = "calc-module-metric";
    }
    if(!btn){
      btn = document.createElement("button");
      btn.id = "calcOpenBtn";
      btn.type = "button";
      btn.className = "calc-module-icon";
    }
    if(btn.parentNode !== wrap){
      wrap.innerHTML = "";
      wrap.appendChild(btn);
    }
    btn.title = "Position Calculator";
    btn.setAttribute("aria-label","Open position calculator");
    btn.setAttribute("aria-pressed","false");
    btn.innerHTML = `<svg viewBox="0 0 24 24" class="ui-btn-icon" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8" y="6.5" width="8" height="3.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="9.5" cy="12.5" r="1" fill="currentColor"/><circle cx="13.5" cy="12.5" r="1" fill="currentColor"/><circle cx="9.5" cy="16" r="1" fill="currentColor"/><circle cx="13.5" cy="16" r="1" fill="currentColor"/></svg>`;
    if(assess && assess.parentNode){
      assess.insertAdjacentElement("afterend",wrap);
    }else if(account && account.parentNode){
      account.insertAdjacentElement("beforebegin",wrap);
    }else{
      document.querySelector(".metrics")?.appendChild(wrap);
    }
    return btn;
  }

  function ensureWindow(){
    let win = q("calcModuleWindow");
    if(win) return win;
    win = document.createElement("div");
    win.id = "calcModuleWindow";
    win.className = "calc-module-window hidden";
    win.innerHTML = `
      <div class="calc-module-resize calc-module-resize-n" data-resize="n"></div>
      <div class="calc-module-resize calc-module-resize-s" data-resize="s"></div>
      <div class="calc-module-resize calc-module-resize-e" data-resize="e"></div>
      <div class="calc-module-resize calc-module-resize-w" data-resize="w"></div>
      <div class="calc-module-resize calc-module-resize-ne" data-resize="ne"></div>
      <div class="calc-module-resize calc-module-resize-nw" data-resize="nw"></div>
      <div class="calc-module-resize calc-module-resize-se" data-resize="se"></div>
      <div class="calc-module-resize calc-module-resize-sw" data-resize="sw"></div>
      <div class="calc-module-head" id="calcModuleHead">
        <div class="calc-module-title">Position Calculator</div>
        <div class="calc-module-actions">
          <button id="calcModuleClose" type="button" title="Close">x</button>
        </div>
      </div>
      <div class="calc-module-body" id="calcModuleBody">
        <div class="calc-module-grid">
          <div class="calc-module-col">
            <div class="calc-module-col-head">
              <div class="calc-module-col-title"><label class="calc-module-mini-toggle calc-module-express-toggle" id="calcModuleExpressToggleWrap" title="Express Mode skips preflight/review and executes immediately"><input id="calcModuleExpressToggle" type="checkbox" aria-label="Enable Express Mode"><span>Express</span></label><button class="calc-module-dir is-long" id="calcModuleDir" type="button" title="Click to switch Long/Short">LONG</button><span class="calc-module-title-sum" id="calcModuleEntrySum">0.000</span></div>
              <button class="calc-module-add" id="calcModuleAddEntry" type="button">Add</button>
            </div>
            <div class="calc-module-row-head"><div>Level</div><div>Lot</div><div></div></div>
            <div id="calcModuleEntryRows"></div>
          </div>
          <div class="calc-module-col">
            <div class="calc-module-col-head">
              <div class="calc-module-col-title">EXITS <span class="calc-module-title-sum" id="calcModuleExitSum">0.000</span></div>
              <button class="calc-module-add" id="calcModuleAddExit" type="button">Add</button>
            </div>
            <div class="calc-module-row-head"><div>Level</div><div>Lot</div><div></div></div>
            <div id="calcModuleExitRows"></div>
          </div>
        </div>
        <div class="calc-module-stop">
          <label class="calc-module-mini-toggle calc-module-sl-line-toggle" id="calcModuleSlToggleWrap" title="Include SL cancel/recreate in Confirm Send and allow SL drag">
            <input id="calcModuleSlToggle" type="checkbox" aria-label="Enable SL send and SL drag">
          </label>
          <label for="calcModuleStopLevel">Stop loss</label><input id="calcModuleStopLevel" type="number" inputmode="decimal" step="10" placeholder="Level">
          <label for="calcModuleStopDistance">SL Distance</label><input id="calcModuleStopDistance" type="number" inputmode="decimal" step="10" placeholder="Distance">
        </div>
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle" id="calcModulePlTitle">PL @ Exits <span class="calc-module-caret" id="calcModulePlCaret">v</span></div>
          <div id="calcModuleExitPlRows"></div>
        </div>
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle" id="calcModuleSummaryTitle">Summary <span class="calc-module-caret" id="calcModuleSummaryCaret">v</span></div>
          <div id="calcModuleSummaryBody">
            <div class="calc-module-summary-row"><div class="calc-module-label">Total lots</div><div class="calc-module-value" id="calcModuleEntrySize">-</div></div>
            <div class="calc-module-summary-row"><div class="calc-module-label">Average Entry</div><div class="calc-module-value" id="calcModuleAvgEntry">-</div></div>
            <div class="calc-module-summary-row"><div class="calc-module-label">Risk</div><div class="calc-module-value" id="calcModuleRisk">-</div></div>
            <div class="calc-module-summary-row"><div class="calc-module-label">Reward</div><div class="calc-module-value" id="calcModuleReward">-</div></div>
          </div>
        </div>
        <div class="calc-module-binance-flat">
          <div class="calc-module-binance-actions">
            <button id="calcModuleClear" type="button">Clear</button>
            <button id="calcModuleRead" type="button">Read</button>
            <label class="calc-module-levels-toggle" id="calcModuleLevelsToggleWrap" title="Show/hide Calculator levels on chart">
              <input id="calcModuleLevelsToggle" type="checkbox" checked>
              <span>Show</span>
            </label>
            <button id="calcModuleSend" type="button" title="Prepare Binance order send plan">Send</button>
            <label class="calc-module-mini-toggle" id="calcModuleCbsToggleWrap" title="Cancel Binance-read LIMIT orders before placing fresh LIMIT orders">
              <input id="calcModuleCbsToggle" type="checkbox">
              <span>CBS</span>
            </label>
          </div>
          <div class="calc-module-status" id="calcModuleStatus"></div>
        </div>
      </div>`;
    document.body.appendChild(win);
    return win;
  }

  function rows(containerId){
    return Array.from(q(containerId)?.querySelectorAll(".calc-module-row") || []);
  }
  function readRows(containerId){
    return rows(containerId).map(row => ({
      row,
      level:num(row.querySelector(".calc-module-level")?.value),
      lot:num(row.querySelector(".calc-module-lot")?.value)
    })).filter(r => r.level != null && r.lot != null && r.lot > 0);
  }
  function getArchitectureServices(){
    const domain = window.CalculatorDomain || null;
    const app = window.CalculatorApplication || null;
    return {domain,app};
  }
  function readEntry(){
    const list = readRows("calcModuleEntryRows");
    const {domain} = getArchitectureServices();
    if(domain && typeof domain.weightedAverage === "function"){
      const weighted = domain.weightedAverage(list);
      return {rows:list, qty:weighted.qty, avg:weighted.avg};
    }
    let qty = 0;
    let value = 0;
    list.forEach(r => {
      qty += r.lot;
      value += r.level * r.lot;
    });
    return {rows:list,qty,avg:qty > 0 ? value / qty : null};
  }
  function capExitLots(maxQty){
    let remaining = Math.max(0,Number(maxQty) || 0);
    rows("calcModuleExitRows").forEach(row => {
      const input = row.querySelector(".calc-module-lot");
      const lot = num(input?.value);
      if(!input || lot == null || lot <= 0) return;
      const capped = Math.max(0,Math.min(lot,remaining));
      if(Math.abs(capped - lot) > 1e-9) input.value = capped > 0 ? capped.toFixed(3) : "";
      remaining -= capped;
    });
  }
  function setDirection(next){
    direction = next === "SHORT" ? "SHORT" : "LONG";
    const btn = q("calcModuleDir");
    if(!btn) return;
    btn.textContent = direction;
    btn.classList.toggle("is-long",direction === "LONG");
    btn.classList.toggle("is-short",direction === "SHORT");
  }
  function syncStopFromLevel(avg){
    if(syncingStop) return;
    const stop = num(q("calcModuleStopLevel")?.value);
    if(avg == null || stop == null) return;
    syncingStop = true;
    q("calcModuleStopDistance").value = Math.abs(avg - stop).toFixed(0);
    syncingStop = false;
  }
  function syncStopFromDistance(avg){
    if(syncingStop) return;
    const dist = num(q("calcModuleStopDistance")?.value);
    if(avg == null || dist == null) return;
    syncingStop = true;
    const stop = direction === "LONG" ? avg - Math.abs(dist) : avg + Math.abs(dist);
    q("calcModuleStopLevel").value = Math.round(stop);
    syncingStop = false;
  }
  function syncStopForAvg(avg){
    if(lastStopEdit === "distance") syncStopFromDistance(avg);
    else syncStopFromLevel(avg);
  }
  function calculate(){
    const {domain,app} = getArchitectureServices();
    const entry = readEntry();
    capExitLots(entry.qty);
    const exits = readRows("calcModuleExitRows");
    let exitQty = 0;
    let reward = 0;
    const plRows = q("calcModuleExitPlRows");
    if(plRows) plRows.innerHTML = "";

    exits.forEach((row,index) => {
      exitQty += row.lot;
      const pl = domain && typeof domain.estimatePl === "function"
        ? domain.estimatePl(direction,entry.avg,row.level,row.lot)
        : entry.avg == null
          ? null
          : direction === "LONG"
            ? (row.level - entry.avg) * row.lot
            : (entry.avg - row.level) * row.lot;
      if(pl != null) reward += pl;
      const line = document.createElement("div");
      line.className = "calc-module-summary-row calc-module-exit-pl";
      line.innerHTML = `<div class="calc-module-label">PL @ Ex ${index + 1}</div><div class="calc-module-value"></div>`;
      setMoney(line.querySelector(".calc-module-value"),pl);
      plRows?.appendChild(line);
    });

    syncStopForAvg(entry.avg);
    const stop = num(q("calcModuleStopLevel")?.value);
    const summary = app && typeof app.buildSummary === "function"
      ? app.buildSummary(domain || {},direction,entry.rows,exits,stop)
      : null;
    const risk = summary ? summary.risk : entry.avg != null && stop != null && entry.qty > 0
      ? direction === "LONG"
        ? (stop - entry.avg) * entry.qty
        : (entry.avg - stop) * entry.qty
      : null;
    const rewardValue = summary ? summary.reward : (exits.length ? reward : null);

    q("calcModuleEntrySum").textContent = fmtLot(entry.qty || 0);
    q("calcModuleExitSum").textContent = fmtLot(exitQty || 0);
    q("calcModuleExitSum").classList.toggle("calc-module-underfilled",entry.qty > 0 && exitQty < entry.qty);
    q("calcModuleEntrySize").textContent = entry.qty > 0 ? fmtLot(entry.qty) : "-";
    q("calcModuleAvgEntry").textContent = entry.avg != null ? fmtPrice(entry.avg) : "-";
    setMoney(q("calcModuleRisk"),risk);
    setMoney(q("calcModuleReward"),rewardValue);
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }
  function clearBinanceMetaOnRow(row){
    if(!row) return;
    const rowId = row.dataset.calcRowId;
    if(rowId) binanceLimitRowMetaByRowId.delete(rowId);
    delete row.dataset.calcRowId;
    delete row.dataset.source;
    row.classList.remove("calc-module-row-binance-limit");
    row.classList.remove("calc-module-row-open-position");
    row.removeAttribute("title");
    row.dataset.openPosition = "0";
    row.__binanceLimitOrderMeta = null;
    lotInput(row)?.classList.remove("calc-module-lot-binance-limit");
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl) lvl.title = "";
    if(lot) lot.title = "";
  }
  function isOpenPositionRow(row){
    return !!(row && row.dataset && row.dataset.openPosition === "1");
  }
  function snapshotManualRows(containerId){
    return rows(containerId)
      .filter(row => row && row.dataset.source !== "binance-limit" && !isOpenPositionRow(row) && !isRowEmpty(row))
      .map(row => ({
        level:String(levelInput(row)?.value || ""),
        lot:String(lotInput(row)?.value || "")
      }));
  }
  function restoreManualRows(containerId,manualRows){
    if(!Array.isArray(manualRows) || !manualRows.length) return;
    manualRows.forEach(item => addRow(containerId,item.level,item.lot));
  }
  function clearOpenPositionRows(){
    rows("calcModuleEntryRows").forEach(row => {
      if(!isOpenPositionRow(row)) return;
      row.remove();
    });
    if(!rows("calcModuleEntryRows").length) addRow("calcModuleEntryRows");
  }
  function setOpenPositionRow(row,isOpenPosition){
    if(!row) return;
    const on = !!isOpenPosition;
    row.dataset.openPosition = on ? "1" : "0";
    row.classList.toggle("calc-module-row-open-position",on);
    row.title = on ? "Open Position" : (row.title || "");
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl) lvl.title = on ? "Open Position" : "";
    if(lot) lot.title = on ? "Open Position" : "";
  }
  function applyRowSourceAndMeta(row,opts){
    if(!row) return row;
    const source = opts && opts.source ? String(opts.source) : "";
    if(source === "binance-limit"){
      row.dataset.source = source;
      row.classList.add("calc-module-row-binance-limit");
      row.title = "Binance LIMIT order";
      lotInput(row)?.classList.add("calc-module-lot-binance-limit");
    }else{
      clearBinanceMetaOnRow(row);
    }
    const meta = opts && opts.meta;
    if(meta){
      const rowId = (opts && opts.rowId ? String(opts.rowId) : "") || ("calc_row_" + (++binanceLimitRowSeq));
      row.dataset.calcRowId = rowId;
      row.__binanceLimitOrderMeta = meta;
      binanceLimitRowMetaByRowId.set(rowId,meta);
    }
    return row;
  }
  function setRowLocked(row,locked,options){
    if(!row) return;
    const opts = options || {};
    const isLocked = !!locked;
    row.dataset.locked = isLocked ? "1" : "0";
    row.classList.toggle("calc-module-row-locked",isLocked);
    const removeBtn = row.querySelector(".calc-module-remove");
    if(removeBtn){
      const keepRemoveEnabled = !!opts.keepRemoveEnabled;
      const disabled = isLocked && !keepRemoveEnabled;
      removeBtn.disabled = disabled;
      removeBtn.classList.toggle("calc-module-remove-locked",disabled);
      removeBtn.title = isLocked ? "Open position row is locked (remove is local only)" : "Remove";
    }
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl){
      lvl.disabled = isLocked;
      lvl.readOnly = isLocked;
      lvl.classList.toggle("calc-module-input-locked",isLocked);
    }
    if(lot){
      lot.disabled = isLocked;
      lot.readOnly = isLocked;
      lot.classList.toggle("calc-module-input-locked",isLocked);
    }
  }
  function unlockEntryRows(){
    rows("calcModuleEntryRows").forEach(row => setRowLocked(row,false));
  }
  function applyMappedRow(containerId,item){
    const container = q(containerId);
    if(!container || !item) return null;
    const allRows = rows(containerId);
    const reusable = allRows.find(row => isRowEmpty(row));
    if(reusable){
      clearBinanceMetaOnRow(reusable);
      const lvl = levelInput(reusable);
      const lot = lotInput(reusable);
      if(lvl) lvl.value = item.level == null ? "" : Math.round(item.level);
      if(lot) lot.value = item.lot == null ? "" : Number(item.lot).toFixed(3);
      setOpenPositionRow(reusable,false);
      applyRowSourceAndMeta(reusable,item);
      return reusable;
    }
    return addRow(
      containerId,
      item.level == null ? "" : Math.round(item.level),
      item.lot == null ? "" : Number(item.lot).toFixed(3),
      item
    );
  }
  function addRow(containerId,level="",lot="",options){
    const container = q(containerId);
    if(!container) return null;
    const opts = options || {};
    const row = document.createElement("div");
    row.className = "calc-module-row";
    row.innerHTML = `
      <input class="calc-module-level" type="number" inputmode="decimal" step="10" placeholder="Level" value="${level}">
      <input class="calc-module-lot" type="number" inputmode="decimal" step="0.001" placeholder="Lot" value="${lot}">
      <button class="calc-module-remove" type="button" title="Remove">x</button>`;
    applyRowSourceAndMeta(row,opts);
    setOpenPositionRow(row,!!opts.openPosition);
    setRowLocked(row,!!opts.locked,{keepRemoveEnabled:!!opts.keepRemoveEnabled});
    row.querySelectorAll("input").forEach(input => input.addEventListener("input",() => {
      markSendPlanStale("Row edited after preflight.");
      calculate();
    },false));
    row.querySelector(".calc-module-remove").addEventListener("click",() => {
      markSendPlanStale("Row removed after preflight.");
      clearBinanceMetaOnRow(row);
      row.remove();
      calculate();
    },false);
    container.appendChild(row);
    calculate();
    return row;
  }
  function setRows(containerId,data,options){
    const container = q(containerId);
    if(!container) return;
    const opts = options || {};
    container.innerHTML = "";
    const list = data && data.length ? data : [{}];
    list.forEach((item,index) => {
      addRow(
        containerId,
        item.level == null ? "" : Math.round(item.level),
        item.lot == null ? "" : Number(item.lot).toFixed(3),
        {
          locked:!!(opts.lockFirstRow && index === 0),
          openPosition:!!(opts.openPositionFirstRow && index === 0),
          keepRemoveEnabled:!!(opts.keepRemoveEnabledFirstRow && index === 0)
        }
      );
    });
  }
  function clearCalculatorLocal(){
    markSendPlanStale("Calculator cleared after preflight.");
    clearMappedLimitRows("calcModuleEntryRows");
    clearMappedLimitRows("calcModuleExitRows");
    binanceLimitRowMetaByRowId.clear();
    setRows("calcModuleEntryRows",[{}]);
    setRows("calcModuleExitRows",[{}]);
    const stopLevel = q("calcModuleStopLevel");
    const stopDistance = q("calcModuleStopDistance");
    if(stopLevel) stopLevel.value = "";
    if(stopDistance) stopDistance.value = "";
    currentStopAlgoMeta = null;
    setStatus("Calculator cleared locally.");
    calculate();
  }

  function currentSymbol(){
    try{ return cfg().symbol; }catch(_e){ return (marketEl && marketEl.value ? marketEl.value : "").toUpperCase(); }
  }
  function sideFromPosition(row){
    const amt = Number(row && row.positionAmt);
    const ps = String(row && row.positionSide || "").toUpperCase();
    return amt < 0 || ps === "SHORT" ? "SHORT" : "LONG";
  }
  function openBoxPosition(){
    const boxes = Array.isArray(openPositionBoxes) ? openPositionBoxes.filter(b => b && (!b.symbol || b.symbol === currentSymbol())) : [];
    if(!boxes.length) return null;
    const side = String(boxes[0].side || boxes[0].letter || "").toUpperCase().includes("SHORT") || boxes[0].letter === "S" ? "SHORT" : "LONG";
    let qty = 0;
    let value = 0;
    boxes.forEach(b => {
      const qv = Math.abs(Number(b.qty));
      const px = Number(b.price);
      if(Number.isFinite(qv) && qv > 0 && Number.isFinite(px) && px > 0){
        qty += qv;
        value += px * qv;
      }
    });
    return qty > 0 ? {side,qty,entry:value / qty,source:"openPositionBoxes"} : null;
  }
  async function signedPosition(){
    if(typeof hasKeys !== "function" || !hasKeys()) return null;
    const key = apiKeyEl.value.trim();
    const sec = apiSecretEl.value.trim();
    const off = typeof timeOffset === "function" ? await timeOffset() : 0;
    const risk = typeof getPositions === "function" ? await getPositions(key,sec,off) : [];
    const row = (risk || []).find(r => r && r.symbol === currentSymbol() && Math.abs(Number(r.positionAmt)) > 1e-12);
    if(!row) return null;
    const qty = Math.abs(Number(row.positionAmt));
    const entry = Number(row.entryPrice);
    if(!(qty > 0) || !(entry > 0)) return null;
    return {
      side:sideFromPosition(row),
      qty,
      entry,
      source:"positionRisk",
      positionSide:toUpper(row.positionSide || "") || null
    };
  }
  function unwrapOrders(rows){
    if(Array.isArray(rows)) return rows;
    if(rows && Array.isArray(rows.orders)) return rows.orders;
    if(rows && Array.isArray(rows.data)) return rows.data;
    return [];
  }
  function toUpper(v){
    return String(v == null ? "" : v).toUpperCase();
  }
  function safeCloneOrder(order){
    if(order == null || typeof order !== "object") return order;
    if(typeof structuredClone === "function"){
      try{ return structuredClone(order); }catch(_e){}
    }
    try{ return JSON.parse(JSON.stringify(order)); }catch(_e){ return order; }
  }
  function isLimitOrder(order){
    return toUpper(order && order.type) === "LIMIT";
  }
  function isReduceOnly(order){
    const ro = order && order.reduceOnly;
    return ro === true || String(ro).toLowerCase() === "true";
  }
  function orderContextDirection(order,fallbackDirection){
    const ps = toUpper(order && order.positionSide);
    if(ps === "LONG") return "LONG";
    if(ps === "SHORT") return "SHORT";
    return fallbackDirection === "SHORT" ? "SHORT" : "LONG";
  }
  function buildLimitOrderMeta(order){
    return {
      orderId:order && order.orderId != null ? order.orderId : null,
      clientOrderId:order && order.clientOrderId != null ? order.clientOrderId : null,
      symbol:order && order.symbol != null ? order.symbol : null,
      side:order && order.side != null ? order.side : null,
      positionSide:order && order.positionSide != null ? order.positionSide : null,
      type:order && order.type != null ? order.type : null,
      status:order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : null),
      price:order && order.price != null ? order.price : null,
      origQty:order && order.origQty != null ? order.origQty : null,
      executedQty:order && order.executedQty != null ? order.executedQty : null,
      timeInForce:order && order.timeInForce != null ? order.timeInForce : null,
      reduceOnly:order && order.reduceOnly != null ? order.reduceOnly : null,
      workingType:order && order.workingType != null ? order.workingType : null,
      updateTime:order && order.updateTime != null ? order.updateTime : null,
      rawOrder:safeCloneOrder(order)
    };
  }
  function buildAlgoOrderMeta(order){
    return {
      algoId:order && order.algoId != null ? order.algoId : null,
      clientAlgoId:order && order.clientAlgoId != null ? order.clientAlgoId : null,
      symbol:order && order.symbol != null ? order.symbol : null,
      side:order && order.side != null ? order.side : null,
      positionSide:order && order.positionSide != null ? order.positionSide : null,
      type:order && (order.type != null ? order.type : order.algoType != null ? order.algoType : null),
      status:order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : null),
      triggerPrice:orderStopPrice(order),
      workingType:order && order.workingType != null ? order.workingType : null,
      updateTime:order && order.updateTime != null ? order.updateTime : null,
      rawOrder:safeCloneOrder(order)
    };
  }
  function clearMappedLimitRows(containerId){
    rows(containerId).forEach(row => {
      if(row.dataset.source !== "binance-limit") return;
      clearBinanceMetaOnRow(row);
      row.remove();
    });
  }
  function publishReadDiagnostic(diag){
    lastReadDiagnostic = diag || null;
    window.__calculatorReadDiagnostic = lastReadDiagnostic;
    try{ console.info(MODULE + " read diagnostic",lastReadDiagnostic); }catch(_e){}
  }
  function publishOverlayDiagnostic(diag){
    lastOverlayDiagnostic = diag || null;
    window.__calculatorOverlayDiagnostic = lastOverlayDiagnostic;
  }
  function publishSendDiagnostic(diag){
    lastSendDiagnostic = diag || null;
    window.__calculatorSendDiagnostic = lastSendDiagnostic;
  }
  function hEsc(value){
    return String(value == null ? "" : value)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }
  function approxEqual(a,b,eps){
    const av = Number(a);
    const bv = Number(b);
    if(!Number.isFinite(av) || !Number.isFinite(bv)) return false;
    return Math.abs(av - bv) <= (eps == null ? 1e-10 : eps);
  }
  function normalizeOrderId(v){
    if(v == null) return "";
    const s = String(v).trim();
    return s;
  }
  function orderKeyFromMeta(meta){
    if(!meta) return "";
    const id = normalizeOrderId(meta.orderId);
    if(id) return "id:" + id;
    const cid = String(meta.clientOrderId || "").trim();
    if(cid) return "cid:" + cid;
    return "";
  }
  function orderKeyFromOrder(order){
    if(!order) return "";
    const id = normalizeOrderId(order.orderId);
    if(id) return "id:" + id;
    const cid = String(order.clientOrderId || "").trim();
    if(cid) return "cid:" + cid;
    return "";
  }
  function snapshotOrder(order){
    if(!order || typeof order !== "object") return null;
    return {
      orderId:order.orderId != null ? String(order.orderId) : "",
      clientOrderId:order.clientOrderId != null ? String(order.clientOrderId) : "",
      symbol:String(order.symbol || ""),
      side:toUpper(order.side),
      positionSide:toUpper(order.positionSide || "BOTH"),
      type:toUpper(order.type),
      status:toUpper(order.status || order.orderStatus || ""),
      price:num(order.price),
      origQty:num(order.origQty),
      executedQty:num(order.executedQty),
      timeInForce:toUpper(order.timeInForce || ""),
      reduceOnly:isReduceOnly(order),
      updateTime:num(order.updateTime),
      raw:safeCloneOrder(order)
    };
  }
  function buildReadStateSnapshot(position,snapshot,mapped){
    const sym = currentSymbol();
    const dir = position && position.side ? position.side : direction;
    const limitOrderMap = new Map();
    const mappedRows = []
      .concat(mapped && Array.isArray(mapped.entryRows) ? mapped.entryRows : [])
      .concat(mapped && Array.isArray(mapped.exitRows) ? mapped.exitRows : []);
    mappedRows.forEach(item => {
      const meta = item && item.meta ? item.meta : null;
      const raw = meta && meta.rawOrder ? meta.rawOrder : null;
      const key = orderKeyFromMeta(meta);
      if(!key || !raw) return;
      limitOrderMap.set(key,snapshotOrder(raw));
    });
    return {
      at:new Date().toISOString(),
      symbol:sym,
      direction:dir === "SHORT" ? "SHORT" : "LONG",
      openPosition:position
        ? {
            side:position.side === "SHORT" ? "SHORT" : "LONG",
            qty:num(position.qty),
            entry:num(position.entry),
            positionSide:toUpper(position.positionSide || "")
          }
        : null,
      mappedLimitOrderMap:limitOrderMap,
      ignoredAlgoCount:num(mapped && mapped.diagnostic && mapped.diagnostic.ignoredAlgoOrders) || 0
    };
  }
  function collectLiveLimitOrdersByKey(snapshot){
    const map = new Map();
    const sym = toUpper(snapshot && snapshot.symbol);
    const rows = (snapshot && snapshot.normalOrders || [])
      .filter(o => o && toUpper(o.symbol) === sym)
      .filter(isLiveOrder)
      .filter(isLimitOrder);
    rows.forEach(order => {
      const key = orderKeyFromOrder(order);
      if(!key) return;
      map.set(key,snapshotOrder(order));
    });
    return map;
  }
  function roundedSignatureNumber(value,places){
    const n = num(value);
    if(n == null) return null;
    return Number(n.toFixed(places == null ? 10 : places));
  }
  function buildStructuralSignature(position,snapshot){
    const sym = toUpper((snapshot && snapshot.symbol) || currentSymbol());
    const liveLimitOrders = (snapshot && snapshot.normalOrders || [])
      .filter(order => order && toUpper(order.symbol) === sym)
      .filter(isLiveOrder)
      .filter(isLimitOrder)
      .map(order => ({
        key:orderKeyFromOrder(order),
        orderId:order && order.orderId != null ? String(order.orderId) : "",
        clientOrderId:order && order.clientOrderId != null ? String(order.clientOrderId) : "",
        side:toUpper(order && order.side),
        positionSide:toUpper(order && order.positionSide || "BOTH"),
        price:roundedSignatureNumber(order && order.price,8),
        quantity:roundedSignatureNumber(order && order.origQty,10),
        status:toUpper(order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : ""))
      }))
      .sort((a,b) => String(a.key || a.orderId || a.clientOrderId).localeCompare(String(b.key || b.orderId || b.clientOrderId)));
    const pos = position
      ? {
          side:position.side === "SHORT" ? "SHORT" : "LONG",
          positionSide:toUpper(position.positionSide || ""),
          qty:roundedSignatureNumber(position.qty,10),
          entry:roundedSignatureNumber(position.entry,8)
        }
      : null;
    return JSON.stringify({symbol:sym,openPosition:pos,limitOrders:liveLimitOrders});
  }
  function updateAutoSyncBaseline(position,snapshot){
    autoSyncBaselineSignature = buildStructuralSignature(position,snapshot || {symbol:currentSymbol(),normalOrders:[]});
  }
  async function readStructuralStateForAutoSync(){
    const pos = await signedPosition() || openBoxPosition();
    const snapshot = await readOpenOrdersSnapshot();
    if(snapshot && snapshot.normalFetchError) return null;
    return {
      position:pos,
      snapshot,
      signature:buildStructuralSignature(pos,snapshot)
    };
  }
  function scheduleAutoSyncRefresh(){
    if(!autoSyncEnabled || autoSyncRefreshing) return;
    showStructuralWarning();
    markSendPlanStale(STRUCTURAL_WARNING_TEXT);
    clearTimeout(autoSyncDebounceTimer);
    autoSyncDebounceTimer = setTimeout(async() => {
      if(!autoSyncEnabled || autoSyncRefreshing) return;
      if(isCalculatorOwnedRefreshActive()){
        try{
          const live = await readStructuralStateForAutoSync();
          if(live && live.snapshot) updateAutoSyncBaseline(live.position,live.snapshot);
          clearStructuralWarning();
        }catch(_e){}
        return;
      }
      autoSyncRefreshing = true;
      try{
        await readBinance({preserveSendPlan:true,autoSync:true,source:"autoWatch"});
      }finally{
        showStructuralWarning();
        autoSyncRefreshing = false;
      }
    },AUTO_SYNC_DEBOUNCE_MS);
  }
  async function checkAutoSyncStructuralState(){
    if(!autoSyncEnabled || autoSyncChecking || autoSyncRefreshing || !autoSyncBaselineSignature) return;
    autoSyncChecking = true;
    try{
      const live = await readStructuralStateForAutoSync();
      if(!live || !live.signature) return;
      if(live.signature !== autoSyncBaselineSignature){
        if(isCalculatorOwnedRefreshActive()){
          updateAutoSyncBaseline(live.position,live.snapshot);
          clearStructuralWarning();
          return;
        }
        scheduleAutoSyncRefresh();
      }
    }catch(_e){
    }finally{
      autoSyncChecking = false;
    }
  }
  function enableAutoSyncDetection(){
    autoSyncEnabled = true;
    if(autoSyncPollTimer) return;
    autoSyncPollTimer = setInterval(() => {
      checkAutoSyncStructuralState();
    },AUTO_SYNC_POLL_MS);
  }
  function inferDirectionForSend(livePosition){
    if(livePosition && (livePosition.side === "LONG" || livePosition.side === "SHORT")) return livePosition.side;
    if(lastReadStateSnapshot && (lastReadStateSnapshot.direction === "LONG" || lastReadStateSnapshot.direction === "SHORT")){
      return lastReadStateSnapshot.direction;
    }
    return direction === "SHORT" ? "SHORT" : "LONG";
  }
  function inferPositionSideForNewOrder(contextDirection){
    const dir = contextDirection === "SHORT" ? "SHORT" : "LONG";
    const fromSnapshot = lastReadStateSnapshot && lastReadStateSnapshot.openPosition
      ? toUpper(lastReadStateSnapshot.openPosition.positionSide || "")
      : "";
    if(fromSnapshot === "LONG" || fromSnapshot === "SHORT" || fromSnapshot === "BOTH") return fromSnapshot;
    for(const row of rows("calcModuleEntryRows").concat(rows("calcModuleExitRows"))){
      const meta = row.__binanceLimitOrderMeta || (row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      const ps = toUpper(meta && meta.positionSide || "");
      if(ps === "LONG" || ps === "SHORT" || ps === "BOTH") return ps;
    }
    return dir;
  }
  function sideForNewRow(rowType,contextDirection){
    const dir = contextDirection === "SHORT" ? "SHORT" : "LONG";
    if(dir === "LONG") return rowType === "entry" ? "BUY" : "SELL";
    return rowType === "entry" ? "SELL" : "BUY";
  }
  function currentOpenPositionRowSnapshot(){
    const entryRows = rows("calcModuleEntryRows");
    const row = entryRows.find(isOpenPositionRow);
    if(!row) return null;
    return {
      side:direction === "SHORT" ? "SHORT" : "LONG",
      qty:num(lotInput(row)?.value),
      entry:num(levelInput(row)?.value)
    };
  }
  function formatPlanValue(v,kind){
    const n = num(v);
    if(n == null) return "-";
    if(kind === "qty") return Number(n.toFixed(3)).toFixed(3);
    if(kind === "price") return String(Number(n.toFixed(8)));
    return String(n);
  }
  function ensureSendPopup(){
    let popup = q("calcModuleSendPopup");
    if(popup) return popup;
    popup = document.createElement("div");
    popup.id = "calcModuleSendPopup";
    popup.className = "calc-module-send-popup hidden";
    popup.innerHTML = `
      <div class="calc-module-send-popup-head" id="calcModuleSendPopupHead">
        <div class="calc-module-send-popup-title" id="calcModuleSendPopupTitle">Send Plan</div>
        <button id="calcModuleSendPopupClose" type="button" title="Close">x</button>
      </div>
      <div class="calc-module-send-summary" id="calcModuleSendSummary"></div>
      <div class="calc-module-send-wrap">
        <table class="calc-module-send-table">
          <colgroup>
            <col class="calc-col-action">
            <col class="calc-col-type">
            <col class="calc-col-side">
            <col class="calc-col-old-price">
            <col class="calc-col-new-price">
            <col class="calc-col-old-qty">
            <col class="calc-col-new-qty">
            <col class="calc-col-order-id">
            <col class="calc-col-status">
            <col class="calc-col-response">
          </colgroup>
          <thead>
            <tr>
              <th>Action</th>
              <th>Type</th>
              <th>Side</th>
              <th>Old Price</th>
              <th>New Price</th>
              <th>Old Qty</th>
              <th>New Qty</th>
              <th>Order ID</th>
              <th>Status</th>
              <th>Binance Response</th>
            </tr>
          </thead>
          <tbody id="calcModuleSendBody"></tbody>
        </table>
      </div>
      <div class="calc-module-send-popup-actions">
        <button id="calcModuleConfirmSend" type="button">Confirm Send</button>
      </div>`;
    document.body.appendChild(popup);
    const closeBtn = q("calcModuleSendPopupClose");
    if(closeBtn){
      closeBtn.addEventListener("click",() => {
        if(sendPlanState && sendPlanState.executing){
          setStatus("Confirm Send is in progress.");
          return;
        }
        clearSendPlan({source:"resultWindowClose"});
      },false);
    }
    const head = q("calcModuleSendPopupHead");
    if(head && !head.__calcSendPopupDragBound){
      head.__calcSendPopupDragBound = true;
      head.addEventListener("pointerdown",e => {
        if(e.target.closest("button")) return;
        const r = popup.getBoundingClientRect();
        sendPopupDrag = {x:e.clientX,y:e.clientY,left:r.left,top:r.top};
        popup.style.zIndex = String(++zTop);
        try{ head.setPointerCapture(e.pointerId); }catch(_e){}
        e.preventDefault();
      },false);
      head.addEventListener("pointermove",e => {
        if(!sendPopupDrag) return;
        popup.style.left = clamp(sendPopupDrag.left + e.clientX - sendPopupDrag.x,6,window.innerWidth - 80) + "px";
        popup.style.top = clamp(sendPopupDrag.top + e.clientY - sendPopupDrag.y,6,window.innerHeight - 60) + "px";
      },false);
      const endDrag = e => {
        if(!sendPopupDrag) return;
        sendPopupDrag = null;
        try{ head.releasePointerCapture(e.pointerId); }catch(_e){}
      };
      head.addEventListener("pointerup",endDrag,false);
      head.addEventListener("pointercancel",endDrag,false);
    }
    return popup;
  }
  function markSendPlanStale(reason){
    if(!sendPlanState || !Array.isArray(sendPlanState.rows)) return;
    if(sendPlanState.executing) return;
    sendPlanState.stale = true;
    sendPlanState.staleReason = reason || "Calculator state changed after preflight.";
    sendPlanState.canConfirm = false;
    renderSendPlanTable();
  }
  function clearSendPlan(options){
    const opts = options || {};
    const owned = CALC_OWNED_REFRESH_SOURCES.has(opts.source);
    if(owned) calculatorOwnedRefreshDepth++;
    try{
      sendPlanState = null;
      sendPopupDrag = null;
      const popup = q("calcModuleSendPopup");
      if(popup) popup.classList.add("hidden");
      const titleEl = q("calcModuleSendPopupTitle");
      if(titleEl) titleEl.textContent = "Send Plan";
      const summaryEl = q("calcModuleSendSummary");
      if(summaryEl){
        summaryEl.textContent = "";
        summaryEl.classList.remove("is-stale");
      }
      const bodyEl = q("calcModuleSendBody");
      if(bodyEl) bodyEl.innerHTML = "";
      const confirmBtn = q("calcModuleConfirmSend");
      if(confirmBtn){
        confirmBtn.disabled = true;
        confirmBtn.onclick = null;
      }
      const actionsWrap = confirmBtn ? confirmBtn.parentElement : null;
      if(actionsWrap) actionsWrap.style.display = "none";
    }finally{
      if(owned) calculatorOwnedRefreshDepth = Math.max(0,calculatorOwnedRefreshDepth - 1);
    }
  }
  function currentMappedRowsForBaseline(){
    const collect = containerId => rows(containerId)
      .map(row => ({row,meta:row && row.__binanceLimitOrderMeta ? row.__binanceLimitOrderMeta : (row && row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null)}))
      .filter(item => item && item.meta && item.meta.rawOrder);
    return {
      entryRows:collect("calcModuleEntryRows"),
      exitRows:collect("calcModuleExitRows"),
      diagnostic:{}
    };
  }
  function updateSendButtonState(state){
    const btn = q("calcModuleSend");
    if(!btn) return;
    btn.disabled = !!state;
    if(state) btn.textContent = expressModeEnabled ? "Running..." : "Preparing...";
    else btn.textContent = "Send";
  }
  function renderSendPlanTable(){
    const box = ensureSendPopup();
    if(!box) return;
    if(!sendPlanState || !Array.isArray(sendPlanState.rows)){
      box.classList.add("hidden");
      return;
    }
    if(sendPlanState.showPopup === false){
      box.classList.add("hidden");
      return;
    }
    const liveSym = currentSymbol();
    if(!sendPlanState.stale && sendPlanState.symbol && liveSym && toUpper(sendPlanState.symbol) !== toUpper(liveSym)){
      sendPlanState.stale = true;
      sendPlanState.staleReason = "Symbol changed after preflight.";
      sendPlanState.canConfirm = false;
    }
    box.classList.remove("hidden");
    box.style.zIndex = String(++zTop);
    const blockedCount = sendPlanState.rows.filter(r => r && r.action === "Blocked").length;
    const writableCount = sendPlanState.rows.filter(r => r && !!r.writable).length;
    const stale = !!sendPlanState.stale;
    const canConfirm = !!(sendPlanState.canConfirm && !sendPlanState.executing && writableCount > 0 && blockedCount === 0 && !stale);
    const hasResult = sendPlanState.rows.some(r => r && (r.status === "Confirmed" || r.status === "Failed"));
    const title = hasResult ? "Send Results" : "Send Plan";
    const summary = [
      "CBS: " + (sendPlanState.cbsEnabled ? "ON" : "OFF"),
      "SL Send: " + (sendPlanState.slSendEnabled ? "ON" : "OFF"),
      "Writable: " + writableCount,
      "Blocked: " + blockedCount,
      "Ignored: " + sendPlanState.rows.filter(r => r && r.action === "Ignored").length,
      "Skipped: " + sendPlanState.rows.filter(r => r && r.action === "Skip").length
    ].join(" | ");
    let lastSection = "";
    const rowsHtml = sendPlanState.rows.map((row) => {
      const isError = row && (
        row.action === "Blocked" ||
        row.status === "Blocked" ||
        row.status === "Failed" ||
        !!row.unexpectedResponse
      );
      const cls = isError
        ? "is-error"
        : row.action === "Ignored"
          ? "is-ignored"
          : row.writable
            ? "is-writable"
            : "";
      const section = row && row.section ? String(row.section) : "LIMIT Orders";
      const sectionHtml = section !== lastSection
        ? `<tr class="calc-module-send-section"><td colspan="10">${hEsc(section)}</td></tr>`
        : "";
      lastSection = section;
      return `${sectionHtml}<tr class="${cls}">
        <td>${hEsc(row.action)}</td>
        <td>${hEsc(row.type)}</td>
        <td>${hEsc(row.side || "-")}</td>
        <td>${hEsc(row.oldPrice || "-")}</td>
        <td>${hEsc(row.newPrice || "-")}</td>
        <td>${hEsc(row.oldQty || "-")}</td>
        <td>${hEsc(row.newQty || "-")}</td>
        <td>${hEsc(row.orderId || "-")}</td>
        <td>${hEsc(row.status || "-")}</td>
        <td class="calc-module-send-response">${hEsc(row.response || "-")}</td>
      </tr>`;
    }).join("");
    const titleEl = q("calcModuleSendPopupTitle");
    if(titleEl) titleEl.textContent = title;
    const summaryEl = q("calcModuleSendSummary");
    if(summaryEl){
      const staleReason = sendPlanState.staleReason || "Calculator changed after preflight.";
      const staleText = stale ? " | STALE: " + staleReason : "";
      summaryEl.textContent = stale && staleReason === STRUCTURAL_WARNING_TEXT ? STRUCTURAL_WARNING_TEXT : summary + staleText;
      summaryEl.classList.toggle("is-stale",stale);
    }
    const bodyEl = q("calcModuleSendBody");
    if(bodyEl){
      bodyEl.innerHTML = rowsHtml || `<tr><td colspan="10">No rows.</td></tr>`;
    }
    const confirmBtn = q("calcModuleConfirmSend");
    const actionsWrap = confirmBtn ? confirmBtn.parentElement : null;
    if(actionsWrap){
      actionsWrap.style.display = (canConfirm || sendPlanState.executing) ? "flex" : "none";
    }
    if(confirmBtn){
      confirmBtn.textContent = sendPlanState.executing ? "Sending..." : "Confirm Send";
      confirmBtn.disabled = !canConfirm;
      confirmBtn.onclick = () => confirmSendPlan(sendPlanState.planId);
    }
  }
  function usableOverlayRows(containerId){
    return rows(containerId).map((row,index) => ({
      index,
      row,
      level:num(levelInput(row)?.value),
      lot:num(lotInput(row)?.value)
    })).filter(item => item.level != null && item.lot != null && item.lot > 0);
  }
  function currentOverlayRows(){
    const entries = usableOverlayRows("calcModuleEntryRows");
    const exits = usableOverlayRows("calcModuleExitRows");
    const slLevel = num(q("calcModuleStopLevel")?.value);
    const entryQty = entries.reduce((sum,row) => sum + row.lot,0);
    const entryAvg = entryQty > 0
      ? entries.reduce((sum,row) => sum + row.level * row.lot,0) / entryQty
      : null;
    const entryRows = entries.map(item => ({
      type:"entry",
      level:item.level,
      lot:item.lot,
      row:item.row,
      openPosition:isOpenPositionRow(item.row),
      text:(isOpenPositionRow(item.row) ? "Open Position" : "Entry") + " | " + Number(item.lot).toFixed(3)
    }));
    const exitRows = exits.map((item,index) => {
      const pl = entryAvg == null
        ? null
        : direction === "LONG"
          ? (item.level - entryAvg) * item.lot
          : (entryAvg - item.level) * item.lot;
      const plText = pl == null
        ? "$-"
        : (pl < 0 ? "-$" + Math.abs(pl).toFixed(2) : "$" + Math.abs(pl).toFixed(2));
      return {
        type:"exit",
        level:item.level,
        lot:item.lot,
        row:item.row,
        openPosition:false,
        text:"Ex " + (index + 1) + " | " + Number(item.lot).toFixed(3) + " | " + plText
      };
    });
    const stopRow = slLevel != null && slLevel > 0 ? {
      type:"sl",
      level:slLevel,
      row:null,
      openPosition:false,
      text:"SL | " + (entryAvg == null || entryQty <= 0
        ? "$-"
        : (() => {
            const pl = direction === "LONG"
              ? (slLevel - entryAvg) * entryQty
              : (entryAvg - slLevel) * entryQty;
            return pl < 0 ? "-$" + Math.abs(pl).toFixed(2) : "$" + Math.abs(pl).toFixed(2);
          })())
    } : null;
    return {entries:entryRows, exits:exitRows, stop:stopRow, entryAvg, entryQty};
  }
  function overlayBoxAtClient(clientX,clientY){
    if(!canvas || !overlayLevelBoxes.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for(let i=overlayLevelBoxes.length-1;i>=0;i--){
      const box = overlayLevelBoxes[i];
      if(x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2) return box;
    }
    return null;
  }
  function setRowLevelFromClientY(row,clientY){
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const price = priceFromCanvasY(y);
    if(price == null) return;
    const input = levelInput(row);
    if(!input || input.disabled || input.readOnly) return;
    const next = String(Math.round(price));
    if(input.value === next) return;
    input.value = next;
    markSendPlanStale("Chart drag changed a row level after preflight.");
    calculate();
  }
  function setStopLevelFromClientY(clientY){
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const price = priceFromCanvasY(y);
    if(price == null) return;
    const input = q("calcModuleStopLevel");
    if(!input || input.disabled || input.readOnly) return;
    const next = String(Math.round(price));
    if(input.value === next) return;
    input.value = next;
    lastStopEdit = "level";
    markSendPlanStale("Chart drag changed SL level after preflight.");
    syncStopFromLevel(readEntry().avg);
    calculate();
  }
  function drawCalculatorLevelsOverlay(){
    overlayLevelBoxes = [];
    if(!levelsVisible) return;
    if(!canvas || !ctx) return;
    const state = currentPriceLineState || {};
    const top = num(state.top);
    const priceH = num(state.priceH);
    const minP = num(state.minP);
    const maxP = num(state.maxP);
    const left = num(state.left);
    const chartRight = num(state.chartRight);
    if(top == null || priceH == null || minP == null || maxP == null || left == null || chartRight == null) return;
    if(!(priceH > 0) || !(maxP > minP) || !(chartRight > left)) return;
    const overlayRows = currentOverlayRows();
    const items = overlayRows.entries.concat(overlayRows.exits,overlayRows.stop ? [overlayRows.stop] : [])
      .map(item => {
        const y = top + ((maxP - item.level) / (maxP - minP)) * priceH;
        return { ...item, y };
      })
      .filter(item => item.y >= top - 2 && item.y <= top + priceH + 2);
    publishOverlayDiagnostic({
      at:new Date().toISOString(),
      visible:levelsVisible,
      entries:overlayRows.entries.length,
      exits:overlayRows.exits.length,
      stop:overlayRows.stop ? 1 : 0,
      drawn:items.length,
      boxes:overlayLevelBoxes.length,
      dragActive:!!overlayDrag.active
    });
    if(!items.length) return;

    const padX = 6;
    const labelH = 16;
    const gap = 2;
    const chartBottom = top + priceH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left,top,chartRight - left,priceH);
    ctx.clip();
    ctx.font = "11px Arial";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    ctx.setLineDash([5,2]);
    items.forEach(item => {
      const y = px(item.y);
      ctx.strokeStyle = item.type === "sl" ? "rgba(180,126,38,0.70)" : "rgba(112,122,138,0.70)";
      ctx.beginPath();
      ctx.moveTo(px(left),y);
      ctx.lineTo(px(chartRight),y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const placed = [];
    const sorted = items.slice().sort((a,b) => a.y - b.y);
    sorted.forEach(item => {
      const textW = Math.ceil(ctx.measureText(item.text).width) + padX * 2;
      const minY = top + labelH / 2;
      const maxY = chartBottom - labelH / 2;
      let cy = clamp(item.y,minY,maxY);
      if(placed.length){
        const prev = placed[placed.length - 1];
        const minCy = prev.cy + labelH + gap;
        if(cy < minCy) cy = minCy;
      }
      placed.push({
        item,
        w:Math.min(textW,Math.max(56,chartRight - left - 8)),
        h:labelH,
        cy
      });
    });
    for(let i=placed.length - 1;i>=0;i--){
      const cur = placed[i];
      const maxCy = chartBottom - labelH / 2 - (placed.length - 1 - i) * (labelH + gap);
      cur.cy = Math.min(cur.cy,maxCy);
      if(i > 0){
        const prev = placed[i - 1];
        if(prev.cy > cur.cy - (labelH + gap)) prev.cy = cur.cy - (labelH + gap);
      }
    }
    placed.forEach(p => {
      const x = chartRight - p.w - 8;
      const y = clamp(p.cy,top + p.h / 2,chartBottom - p.h / 2) - p.h / 2;
      const isOpenPos = !!p.item.openPosition;
      const isSl = p.item.type === "sl";
      ctx.fillStyle = isOpenPos
        ? "rgba(255,247,204,0.95)"
        : isSl
          ? "rgba(255,243,214,0.96)"
          : "rgba(255,255,255,0.94)";
      ctx.strokeStyle = isSl ? "rgba(180,126,38,0.70)" : "rgba(112,122,138,0.70)";
      ctx.lineWidth = 1;
      ctx.fillRect(ix(x),ix(y),p.w,p.h);
      ctx.strokeRect(px(x),px(y),p.w,p.h);
      ctx.fillStyle = isSl ? "#8b5e14" : "#39414a";
      ctx.textAlign = "left";
      ctx.fillText(p.item.text,x + padX,y + p.h / 2 + 0.5);
      overlayLevelBoxes.push({
        x1:x,
        y1:y,
        x2:x + p.w,
        y2:y + p.h,
        row:p.item.row,
        type:p.item.type,
        openPosition:isOpenPos,
        draggable:(!isOpenPos && p.item.type !== "sl" && calcLevelsInteractive()) || (p.item.type === "sl" && calcSlInteractive())
      });
    });
    publishOverlayDiagnostic({
      at:new Date().toISOString(),
      visible:levelsVisible,
      entries:overlayRows.entries.length,
      exits:overlayRows.exits.length,
      stop:overlayRows.stop ? 1 : 0,
      drawn:items.length,
      boxes:overlayLevelBoxes.length,
      dragActive:!!overlayDrag.active
    });
    ctx.restore();
  }
  function installDrawOverlayHook(){
    if(window.__calcLevelsDrawWrapped) return;
    if(typeof draw !== "function") return;
    window.__calcLevelsDrawWrapped = true;
    const prevDraw = draw;
    window.draw = draw = function(){
      const result = prevDraw.apply(this,arguments);
      try{ drawCalculatorLevelsOverlay(); }catch(e){ console.warn(MODULE + " levels overlay draw failed",e); }
      return result;
    };
  }
  function installOverlayDragHooks(){
    if(!canvas || canvas.__calculatorOverlayDragHooks) return;
    canvas.__calculatorOverlayDragHooks = true;
    canvas.addEventListener("mousedown",e => {
      if(!calcLevelsInteractive()) return;
      const hit = overlayBoxAtClient(e.clientX,e.clientY);
      if(!hit || !hit.draggable) return;
      if(hit.type !== "sl" && !hit.row) return;
      overlayDrag.active = true;
      overlayDrag.row = hit.row || null;
      overlayDrag.target = hit.type === "sl" ? "sl" : "row";
      if(overlayDrag.target === "sl") setStopLevelFromClientY(e.clientY);
      else setRowLevelFromClientY(hit.row,e.clientY);
      canvas.style.cursor = "pointer";
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);
    canvas.addEventListener("mousemove",e => {
      if(overlayDrag.active){
        if(overlayDrag.target === "sl") setStopLevelFromClientY(e.clientY);
        else setRowLevelFromClientY(overlayDrag.row,e.clientY);
        canvas.style.cursor = "pointer";
        return;
      }
      if(dragChart || dragAxis) return;
      if(!calcLevelsInteractive()) return;
      const hit = overlayBoxAtClient(e.clientX,e.clientY);
      if(hit && hit.draggable) canvas.style.cursor = "pointer";
    },false);
    window.addEventListener("mouseup",e => {
      if(!overlayDrag.active) return;
      overlayDrag.active = false;
      overlayDrag.row = null;
      overlayDrag.target = "row";
      suppressNextOverlayClick = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(canvas) canvas.style.cursor = "crosshair";
    },true);
    canvas.addEventListener("click",e => {
      if(!suppressNextOverlayClick) return;
      suppressNextOverlayClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);
  }
  async function readOpenOrdersSnapshot(){
    const sym = currentSymbol();
    const snapshot = {
      symbol:sym,
      normalOrders:Array.isArray(window.v13OpenOrders21) ? window.v13OpenOrders21.slice() : [],
      algoOrders:Array.isArray(window.v13OpenAlgoOrders21) ? window.v13OpenAlgoOrders21.slice() : [],
      normalFetchError:null,
      algoFetchError:null
    };
    if(typeof hasKeys === "function" && hasKeys() && typeof signedGet === "function"){
      const key = apiKeyEl.value.trim();
      const sec = apiSecretEl.value.trim();
      const off = typeof timeOffset === "function" ? await timeOffset() : 0;
      try{
        snapshot.normalOrders = unwrapOrders(await signedGet(OPEN_ORDERS_URL,{symbol:sym},key,sec,off));
      }catch(e){
        snapshot.normalFetchError = e;
      }
      try{
        snapshot.algoOrders = unwrapOrders(await signedGet(OPEN_ALGO_ORDERS_URL,{symbol:sym},key,sec,off));
      }catch(e){
        snapshot.algoFetchError = e;
      }
    }
    return snapshot;
  }
  function mapLimitOrdersForCalculator(snapshot,activeDirection){
    const directionCtx = activeDirection === "SHORT" ? "SHORT" : "LONG";
    const sym = toUpper(snapshot && snapshot.symbol);
    const normalLive = (snapshot && snapshot.normalOrders || [])
      .filter(o => o && toUpper(o.symbol) === sym)
      .filter(isLiveOrder);
    const algoLive = (snapshot && snapshot.algoOrders || [])
      .filter(o => o && toUpper(o.symbol) === sym)
      .filter(isLiveOrder);
    const limitOrders = normalLive.filter(isLimitOrder);
    const nonLimitOrders = normalLive.filter(o => !isLimitOrder(o));
    const mappedEntries = [];
    const mappedExits = [];
    let ignoredByPositionSide = 0;
    limitOrders.forEach((order,index) => {
      const orderCtx = orderContextDirection(order,directionCtx);
      if(orderCtx !== directionCtx){
        ignoredByPositionSide++;
        return;
      }
      const side = toUpper(order && order.side);
      let role = null;
      if(isReduceOnly(order)){
        role = "exit";
      }else if(orderCtx === "LONG"){
        if(side === "BUY") role = "entry";
        else if(side === "SELL") role = "exit";
      }else{
        if(side === "SELL") role = "entry";
        else if(side === "BUY") role = "exit";
      }
      if(!role) return;
      const level = num(order && order.price);
      if(level == null || level <= 0) return;
      const lot = num(order && order.origQty);
      const rowId = "binance_limit_" + String(order && order.orderId != null ? order.orderId : "na") + "_" + String(++binanceLimitRowSeq) + "_" + String(index);
      const mapped = {
        rowId,
        level,
        lot:lot != null && lot > 0 ? lot : null,
        source:"binance-limit",
        meta:buildLimitOrderMeta(order)
      };
      if(role === "entry") mappedEntries.push(mapped);
      else mappedExits.push(mapped);
    });
    return {
      entryRows:mappedEntries,
      exitRows:mappedExits,
      diagnostic:{
        normalLimitOrdersFound:limitOrders.length,
        mappedEntries:mappedEntries.length,
        mappedExits:mappedExits.length,
        ignoredAlgoOrders:algoLive.length,
        ignoredNonLimitOrders:nonLimitOrders.length,
        ignoredByPositionSide
      }
    };
  }
  async function readOpenOrders(){
    const snapshot = await readOpenOrdersSnapshot();
    return [].concat(snapshot.normalOrders || [], snapshot.algoOrders || []);
  }
  function compareOpenPositionSnapshot(referencePos,livePos){
    const ref = referencePos || null;
    const live = livePos || null;
    if(!ref && !live) return null;
    if(!ref && live) return "Open position changed since last Read (was flat, now open).";
    if(ref && !live) return "Open position changed since last Read (position is now flat).";
    const refQty = num(ref && ref.qty);
    const liveQty = num(live && live.qty);
    if(refQty == null || liveQty == null || !approxEqual(refQty,liveQty,1e-9)){
      return "Open position size changed since last Read.";
    }
    const refEntry = num(ref && ref.entry);
    const liveEntry = num(live && live.entry);
    if(refEntry == null || liveEntry == null || !approxEqual(refEntry,liveEntry,1e-8)){
      return "Open position entry level changed since last Read.";
    }
    return null;
  }
  function buildExternalChangeReason(baseOrder,liveOrder){
    if(!baseOrder) return "Missing baseline metadata from last Read.";
    if(!liveOrder) return "Existing Binance LIMIT order disappeared from live open orders.";
    if(!isLiveOrder(liveOrder.raw || liveOrder)) return "Existing Binance LIMIT order is no longer open.";
    if(toUpper(liveOrder.type) !== "LIMIT") return "Existing Binance LIMIT order type changed externally.";
    if(toUpper(baseOrder.side) !== toUpper(liveOrder.side)) return "Existing Binance LIMIT order side changed externally.";
    if(toUpper(baseOrder.positionSide || "BOTH") !== toUpper(liveOrder.positionSide || "BOTH")) return "Existing Binance LIMIT order positionSide changed externally.";
    if(!approxEqual(baseOrder.price,liveOrder.price,1e-8)) return "Existing Binance LIMIT order price changed externally.";
    if(!approxEqual(baseOrder.origQty,liveOrder.origQty,1e-10)) return "Existing Binance LIMIT order quantity changed externally.";
    return null;
  }
  function addPlanRow(plan,row){
    if(row && !row.section) row.section = "LIMIT Orders";
    plan.rows.push(row);
    return row;
  }
  function prepareManualRowPlan(plan,row,rowType,contextDirection){
    const level = num(levelInput(row)?.value);
    const lot = num(lotInput(row)?.value);
    const base = {
      action:"New",
      type:rowType === "entry" ? "Entry" : "Exit",
      side:sideForNewRow(rowType,contextDirection),
      oldPrice:"-",
      newPrice:formatPlanValue(level,"price"),
      oldQty:"-",
      newQty:formatPlanValue(lot,"qty"),
      orderId:"-",
      status:"Planned",
      response:"",
      writable:true,
      mode:"new",
      rowRef:row,
      payload:{
        rowType,
        level,
        quantity:lot,
        side:sideForNewRow(rowType,contextDirection)
      }
    };
    if(level == null || level <= 0 || lot == null || lot <= 0){
      base.action = "Blocked";
      base.status = "Blocked";
      base.response = "Any writable row has invalid price or quantity.";
      base.writable = false;
      base.mode = "blocked";
      plan.blocked = true;
    }
    addPlanRow(plan,base);
  }
  function prepareExistingRowPlan(plan,row,rowType,meta,baseOrder,liveOrder){
    const level = num(levelInput(row)?.value);
    const lot = num(lotInput(row)?.value);
    const key = orderKeyFromMeta(meta);
    const oldPrice = num(baseOrder && baseOrder.price);
    const oldQty = num(baseOrder && baseOrder.origQty);
    const side = toUpper((baseOrder && baseOrder.side) || (meta && meta.side) || "");
    const rowPlan = {
      action:"Skip",
      type:rowType === "entry" ? "Entry" : "Exit",
      side:side || "-",
      oldPrice:formatPlanValue(oldPrice,"price"),
      newPrice:formatPlanValue(level,"price"),
      oldQty:formatPlanValue(oldQty,"qty"),
      newQty:formatPlanValue(lot,"qty"),
      orderId:(meta && meta.orderId != null) ? String(meta.orderId) : (meta && meta.clientOrderId ? String(meta.clientOrderId) : "-"),
      status:"Skipped",
      response:"",
      writable:false,
      mode:"skip",
      rowRef:row,
      orderKey:key
    };
    const externalChange = buildExternalChangeReason(baseOrder,liveOrder);
    if(externalChange){
      rowPlan.action = "Blocked";
      rowPlan.status = "Blocked";
      rowPlan.response = externalChange;
      rowPlan.mode = "blocked";
      rowPlan.writable = false;
      plan.blocked = true;
      addPlanRow(plan,rowPlan);
      return;
    }
    if(level == null || level <= 0 || lot == null || lot <= 0){
      rowPlan.action = "Blocked";
      rowPlan.status = "Blocked";
      rowPlan.response = "Any writable row has invalid price or quantity.";
      rowPlan.mode = "blocked";
      rowPlan.writable = false;
      plan.blocked = true;
      addPlanRow(plan,rowPlan);
      return;
    }
    const changed = !approxEqual(level,oldPrice,1e-8) || !approxEqual(lot,oldQty,1e-10);
    if(changed){
      rowPlan.action = "Modify";
      rowPlan.status = "Planned";
      rowPlan.writable = true;
      rowPlan.mode = "modify";
      rowPlan.payload = {
        symbol:(meta && meta.symbol) || (baseOrder && baseOrder.symbol) || currentSymbol(),
        orderId:meta && meta.orderId != null ? meta.orderId : null,
        origClientOrderId:meta && meta.clientOrderId ? meta.clientOrderId : null,
        side:(meta && meta.side) || (baseOrder && baseOrder.side) || side,
        positionSide:(meta && meta.positionSide) || (baseOrder && baseOrder.positionSide) || "",
        timeInForce:(meta && meta.timeInForce) || (baseOrder && baseOrder.timeInForce) || "GTC",
        reduceOnly:meta && meta.reduceOnly != null ? meta.reduceOnly : (baseOrder && baseOrder.reduceOnly),
        price:level,
        quantity:lot,
        meta
      };
    }
    addPlanRow(plan,rowPlan);
  }
  function buildIgnoredRemovedRows(plan,presentKeys){
    const baselineMap = lastReadStateSnapshot && lastReadStateSnapshot.mappedLimitOrderMap;
    if(!(baselineMap instanceof Map)) return;
    baselineMap.forEach((baseOrder,key) => {
      if(presentKeys.has(key)) return;
      addPlanRow(plan,{
        action:"Ignored",
        type:"LIMIT",
        side:toUpper(baseOrder && baseOrder.side) || "-",
        oldPrice:formatPlanValue(baseOrder && baseOrder.price,"price"),
        newPrice:"-",
        oldQty:formatPlanValue(baseOrder && baseOrder.origQty,"qty"),
        newQty:"-",
        orderId:baseOrder && baseOrder.orderId ? String(baseOrder.orderId) : (baseOrder && baseOrder.clientOrderId ? String(baseOrder.clientOrderId) : "-"),
        status:"Ignored",
        response:"Removed locally only. Cancellation is not part of this stage.",
        writable:false,
        mode:"ignored"
      });
    });
  }
  function buildPlanFromCurrentRows(livePos,liveSnapshot){
    const plan = {
      planId:++sendPlanSeq,
      at:new Date().toISOString(),
      symbol:currentSymbol(),
      rows:[],
      blocked:false,
      canConfirm:false,
      executing:false,
      stale:false,
      staleReason:"",
      liveSnapshot:null,
      cbsEnabled:!!cbsEnabled,
      slSendEnabled:!!slSendEnabled
    };
    const contextDirection = inferDirectionForSend(livePos);
    const liveLimitMap = collectLiveLimitOrdersByKey(liveSnapshot);
    const baseMap = lastReadStateSnapshot && lastReadStateSnapshot.mappedLimitOrderMap instanceof Map
      ? lastReadStateSnapshot.mappedLimitOrderMap
      : new Map();
    const entryRows = rows("calcModuleEntryRows");
    const exitRows = rows("calcModuleExitRows");
    const presentBinanceKeys = new Set();
    const limitRowRecords = [];

    entryRows.forEach(row => {
      if(isRowEmpty(row)) return;
      if(isOpenPositionRow(row)){
        addPlanRow(plan,{
          section:"LIMIT Orders",
          action:"Ignored",
          type:"Open Position",
          side:contextDirection === "SHORT" ? "SELL" : "BUY",
          oldPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
          newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
          oldQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
          newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
          orderId:"-",
          status:"Ignored",
          response:"Open Position row is calculator-local and never written.",
          writable:false,
          mode:"ignored",
          rowRef:row
        });
        return;
      }
      const meta = row.__binanceLimitOrderMeta || (row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      limitRowRecords.push({row,rowType:"entry",meta});
    });
    exitRows.forEach(row => {
      if(isRowEmpty(row)) return;
      const meta = row.__binanceLimitOrderMeta || (row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      limitRowRecords.push({row,rowType:"exit",meta});
    });

    if(slSendEnabled){
      const stopLevel = num(q("calcModuleStopLevel")?.value);
      if(!livePos){
        plan.blocked = true;
        addPlanRow(plan,{
          section:"SL Operation",
          action:"Blocked",
          type:"SL",
          side:"-",
          oldPrice:"-",
          newPrice:formatPlanValue(stopLevel,"price"),
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"No live open position. SL send requires an open position.",
          writable:false,
          mode:"blocked"
        });
      }else if(stopLevel == null || stopLevel <= 0){
        plan.blocked = true;
        addPlanRow(plan,{
          section:"SL Operation",
          action:"Blocked",
          type:"SL",
          side:livePos.side === "SHORT" ? "BUY" : "SELL",
          oldPrice:"-",
          newPrice:formatPlanValue(stopLevel,"price"),
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"SL level is invalid.",
          writable:false,
          mode:"blocked"
        });
      }else{
        const liveAlgoStop = findStopOrderForPosition(livePos,liveSnapshot,true);
        const stopMeta = liveAlgoStop && liveAlgoStop.order
          ? buildAlgoOrderMeta(liveAlgoStop.order)
          : currentStopAlgoMeta;
        if(stopMeta && (stopMeta.algoId != null || String(stopMeta.clientAlgoId || "").trim() !== "")){
          addPlanRow(plan,{
            section:"SL Operation",
            action:"Cancel",
            type:"SL",
            side:toUpper(stopMeta.side) || (livePos.side === "SHORT" ? "BUY" : "SELL"),
            oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
            newPrice:"-",
            oldQty:"-",
            newQty:"-",
            orderId:stopMeta.algoId != null ? String(stopMeta.algoId) : String(stopMeta.clientAlgoId || "-"),
            status:"Planned",
            response:"",
            writable:true,
            mode:"sl-cancel",
            payload:{
              symbol:plan.symbol,
              algoId:stopMeta.algoId != null ? stopMeta.algoId : null,
              clientAlgoId:stopMeta.clientAlgoId ? String(stopMeta.clientAlgoId) : "",
              meta:stopMeta
            }
          });
        }else{
          addPlanRow(plan,{
            section:"SL Operation",
            action:"Skip",
            type:"SL",
            side:livePos.side === "SHORT" ? "BUY" : "SELL",
            oldPrice:"-",
            newPrice:formatPlanValue(stopLevel,"price"),
            oldQty:"-",
            newQty:"-",
            orderId:"-",
            status:"Skipped",
            response:"No active SL algo order to cancel.",
            writable:false,
            mode:"skip"
          });
        }
        const slSide = livePos.side === "SHORT" ? "BUY" : "SELL";
        const slPositionSide = toUpper(livePos.positionSide || "");
        addPlanRow(plan,{
          section:"SL Operation",
          action:"New",
          type:"SL",
          side:slSide,
          oldPrice:"-",
          newPrice:formatPlanValue(stopLevel,"price"),
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Planned",
          response:"",
          writable:true,
          mode:"sl-create",
          payload:{
            symbol:plan.symbol,
            side:slSide,
            triggerPrice:stopLevel,
            positionSide:slPositionSide,
            workingType:stopMeta && stopMeta.workingType ? stopMeta.workingType : null
          }
        });
      }
    }else{
      addPlanRow(plan,{
        section:"SL Operation",
        action:"Ignored",
        type:"SL",
        side:"-",
        oldPrice:"-",
        newPrice:formatPlanValue(num(q("calcModuleStopLevel")?.value),"price"),
        oldQty:"-",
        newQty:"-",
        orderId:"-",
        status:"Ignored",
        response:"SL toggle is OFF.",
        writable:false,
        mode:"ignored"
      });
    }

    if(cbsEnabled){
      const cancelAdded = new Set();
      const cbsBlockedRows = new Set();
      limitRowRecords.forEach(record => {
        const row = record.row;
        const rowType = record.rowType;
        const meta = record.meta;
        if(meta && row.dataset && row.dataset.source === "binance-limit"){
          const key = orderKeyFromMeta(meta);
          if(!key){
            addPlanRow(plan,{
              section:"LIMIT Orders",
              action:"Blocked",
              type:rowType === "entry" ? "Entry" : "Exit",
              side:"-",
              oldPrice:"-",
              newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
              oldQty:"-",
              newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
              orderId:"-",
              status:"Blocked",
              response:"Calculator row is missing required metadata for modifying an existing Binance order.",
              writable:false,
              mode:"blocked",
              rowRef:row
            });
            plan.blocked = true;
            cbsBlockedRows.add(row);
            return;
          }
          presentBinanceKeys.add(key);
          const baseOrder = baseMap.get(key);
          const liveOrder = liveLimitMap.get(key);
          const externalChange = buildExternalChangeReason(baseOrder,liveOrder);
          if(externalChange){
            addPlanRow(plan,{
              section:"LIMIT Orders",
              action:"Blocked",
              type:rowType === "entry" ? "Entry" : "Exit",
              side:toUpper((baseOrder && baseOrder.side) || (meta && meta.side) || "-"),
              oldPrice:formatPlanValue(num(baseOrder && baseOrder.price),"price"),
              newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
              oldQty:formatPlanValue(num(baseOrder && baseOrder.origQty),"qty"),
              newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
              orderId:(meta && meta.orderId != null) ? String(meta.orderId) : (meta && meta.clientOrderId ? String(meta.clientOrderId) : "-"),
              status:"Blocked",
              response:externalChange,
              writable:false,
              mode:"blocked",
              rowRef:row
            });
            plan.blocked = true;
            cbsBlockedRows.add(row);
            return;
          }
          if(!cancelAdded.has(key)){
            cancelAdded.add(key);
            addPlanRow(plan,{
              section:"LIMIT Orders",
              action:"Cancel",
              type:"LIMIT",
              side:toUpper((baseOrder && baseOrder.side) || (meta && meta.side) || "-"),
              oldPrice:formatPlanValue(num(baseOrder && baseOrder.price),"price"),
              newPrice:"-",
              oldQty:formatPlanValue(num(baseOrder && baseOrder.origQty),"qty"),
              newQty:"-",
              orderId:(meta && meta.orderId != null) ? String(meta.orderId) : (meta && meta.clientOrderId ? String(meta.clientOrderId) : "-"),
              status:"Planned",
              response:"",
              writable:true,
              mode:"limit-cancel-cbs",
              payload:{
                symbol:(meta && meta.symbol) || (baseOrder && baseOrder.symbol) || plan.symbol,
                orderId:meta && meta.orderId != null ? meta.orderId : null,
                origClientOrderId:meta && meta.clientOrderId ? String(meta.clientOrderId) : "",
                meta
              }
            });
          }
        }
      });
      limitRowRecords.forEach(record => {
        if(cbsBlockedRows.has(record.row)) return;
        prepareManualRowPlan(plan,record.row,record.rowType,contextDirection);
      });
    }else{
      limitRowRecords.forEach(record => {
        const row = record.row;
        const rowType = record.rowType;
        const meta = record.meta;
        if(meta && row.dataset && row.dataset.source === "binance-limit"){
          const key = orderKeyFromMeta(meta);
          if(!key){
            addPlanRow(plan,{
              section:"LIMIT Orders",
              action:"Blocked",
              type:rowType === "entry" ? "Entry" : "Exit",
              side:"-",
              oldPrice:"-",
              newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
              oldQty:"-",
              newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
              orderId:"-",
              status:"Blocked",
              response:"Calculator row is missing required metadata for modifying an existing Binance order.",
              writable:false,
              mode:"blocked",
              rowRef:row
            });
            plan.blocked = true;
            return;
          }
          presentBinanceKeys.add(key);
          prepareExistingRowPlan(plan,row,rowType,meta,baseMap.get(key),liveLimitMap.get(key));
          return;
        }
        prepareManualRowPlan(plan,row,rowType,contextDirection);
      });
    }

    buildIgnoredRemovedRows(plan,presentBinanceKeys);

    const algoRows = (liveSnapshot && liveSnapshot.algoOrders || [])
      .filter(o => o && toUpper(o.symbol) === toUpper(plan.symbol))
      .filter(isLiveOrder);
    if(algoRows.length){
      addPlanRow(plan,{
        section:"SL Operation",
        action:"Ignored",
        type:"Algo/SL",
        side:"-",
        oldPrice:"-",
        newPrice:"-",
        oldQty:"-",
        newQty:"-",
        orderId:"-",
        status:"Ignored",
        response:"Ignored " + algoRows.length + " open algo/SL order(s).",
        writable:false,
        mode:"ignored"
      });
    }

    if(!lastReadStateSnapshot){
      plan.blocked = true;
      addPlanRow(plan,{
        section:"LIMIT Orders",
        action:"Blocked",
        type:"Preflight",
        side:"-",
        oldPrice:"-",
        newPrice:"-",
        oldQty:"-",
        newQty:"-",
        orderId:"-",
        status:"Blocked",
        response:"Calculator Read snapshot is missing. Click Read first.",
        writable:false,
        mode:"blocked"
      });
    }

    const positionMismatch = compareOpenPositionSnapshot(
      lastReadStateSnapshot ? lastReadStateSnapshot.openPosition : currentOpenPositionRowSnapshot(),
      livePos
    );
    if(positionMismatch){
      plan.blocked = true;
      addPlanRow(plan,{
        section:"LIMIT Orders",
        action:"Blocked",
        type:"Open Position",
        side:"-",
        oldPrice:"-",
        newPrice:"-",
        oldQty:"-",
        newQty:"-",
        orderId:"-",
        status:"Blocked",
        response:positionMismatch,
        writable:false,
        mode:"blocked"
      });
    }

    if(liveSnapshot && (liveSnapshot.normalFetchError || liveSnapshot.algoFetchError)){
      plan.blocked = true;
      addPlanRow(plan,{
        section:"LIMIT Orders",
        action:"Blocked",
        type:"Preflight",
        side:"-",
        oldPrice:"-",
        newPrice:"-",
        oldQty:"-",
        newQty:"-",
        orderId:"-",
        status:"Blocked",
        response:"Preflight live open-orders read failed.",
        writable:false,
        mode:"blocked"
      });
    }

    plan.canConfirm = !plan.blocked && plan.rows.some(r => r && !!r.writable);
    plan.liveSnapshot = liveSnapshot;
    return plan;
  }
  async function signedBinanceWrite(url,method,params){
    if(typeof hasKeys !== "function" || !hasKeys()) throw new Error("API keys are required.");
    const key = apiKeyEl.value.trim();
    const sec = apiSecretEl.value.trim();
    const off = typeof timeOffset === "function" ? await timeOffset() : 0;
    const q = new URLSearchParams({
      ...params,
      recvWindow:"5000",
      timestamp:String(Date.now() + off)
    }).toString();
    const sig = await hmac(sec,q);
    const res = await API.fetch(url + "?" + q + "&signature=" + sig,{
      method:method,
      cache:"no-store",
      headers:{"X-MBX-APIKEY":key}
    });
    const data = await res.json().catch(() => null);
    if(!res.ok){
      const err = new Error(data && data.msg ? data.msg : ("HTTP " + res.status));
      err.code = data && data.code != null ? data.code : null;
      err.data = data;
      throw err;
    }
    return data || {};
  }
  async function signedOrderWrite(method,params){
    return signedBinanceWrite(ORDER_WRITE_URL,method,params);
  }
  async function signedAlgoOrderWrite(method,params){
    return signedBinanceWrite(ALGO_ORDER_WRITE_URL,method,params);
  }
  function applyWriteSuccessToRow(row,response,fallback){
    if(!row) return;
    const base = fallback && typeof fallback === "object" ? fallback : {};
    const merged = Object.assign({},base,response || {});
    if(response && response.orderId != null) merged.orderId = response.orderId;
    if(response && response.clientOrderId != null) merged.clientOrderId = response.clientOrderId;
    if(response && response.origQty != null) merged.origQty = response.origQty;
    if(response && response.price != null) merged.price = response.price;
    if(!merged.symbol) merged.symbol = currentSymbol();
    if(!merged.type) merged.type = "LIMIT";
    const meta = buildLimitOrderMeta(merged);
    applyRowSourceAndMeta(row,{
      source:"binance-limit",
      meta,
      rowId:row.dataset && row.dataset.calcRowId ? row.dataset.calcRowId : null
    });
  }
  function binanceResponseText(resp){
    if(!resp) return "";
    if(resp.code != null && resp.msg) return String(resp.code) + " " + String(resp.msg);
    if(resp.msg) return String(resp.msg);
    if(resp.orderId != null) return "orderId=" + String(resp.orderId);
    if(resp.algoId != null) return "algoId=" + String(resp.algoId);
    if(resp.clientAlgoId != null) return "clientAlgoId=" + String(resp.clientAlgoId);
    try{ return JSON.stringify(resp); }catch(_e){ return String(resp); }
  }
  async function runPlanWriteRow(rowPlan,contextDirection){
    if(!rowPlan || !rowPlan.writable) return {ok:true,skip:true};
    if(rowPlan.mode === "sl-cancel"){
      const p = rowPlan.payload || {};
      const send = {
        symbol:String(p.symbol || currentSymbol())
      };
      if(p.algoId != null && String(p.algoId).trim() !== "") send.algoId = String(p.algoId);
      else if(p.clientAlgoId) send.clientAlgoId = String(p.clientAlgoId);
      else throw new Error("Missing algoId/clientAlgoId for SL cancel.");
      const resp = await signedAlgoOrderWrite("DELETE",send);
      return {ok:true,response:resp};
    }
    if(rowPlan.mode === "sl-create"){
      const p = rowPlan.payload || {};
      const send = {
        symbol:String(p.symbol || currentSymbol()),
        side:String(p.side || ""),
        algoType:"CONDITIONAL",
        type:"STOP_MARKET",
        closePosition:"true",
        triggerPrice:String(Number(p.triggerPrice)),
        workingType:String(p.workingType || "CONTRACT_PRICE")
      };
      const ps = toUpper(p.positionSide || "");
      if(ps === "LONG" || ps === "SHORT") send.positionSide = ps;
      const resp = await signedAlgoOrderWrite("POST",send);
      return {ok:true,response:resp};
    }
    if(rowPlan.mode === "limit-cancel-cbs"){
      const p = rowPlan.payload || {};
      const send = {
        symbol:String(p.symbol || currentSymbol())
      };
      if(p.orderId != null && String(p.orderId).trim() !== "") send.orderId = String(p.orderId);
      else if(p.origClientOrderId) send.origClientOrderId = String(p.origClientOrderId);
      else throw new Error("Missing orderId/origClientOrderId for LIMIT cancel.");
      const resp = await signedOrderWrite("DELETE",send);
      return {ok:true,response:resp};
    }
    if(rowPlan.mode === "modify"){
      const p = rowPlan.payload || {};
      const send = {
        symbol:String(p.symbol || currentSymbol()),
        side:String(p.side || rowPlan.side || ""),
        type:"LIMIT",
        quantity:String(Number(p.quantity)),
        price:String(Number(p.price)),
        timeInForce:String(p.timeInForce || "GTC")
      };
      if(p.orderId != null && String(p.orderId).trim() !== "") send.orderId = String(p.orderId);
      else if(p.origClientOrderId) send.origClientOrderId = String(p.origClientOrderId);
      else throw new Error("Missing orderId/origClientOrderId for modify.");
      const ps = toUpper(p.positionSide || "");
      if(ps) send.positionSide = ps;
      if(p.reduceOnly === true || String(p.reduceOnly).toLowerCase() === "true") send.reduceOnly = "true";
      const resp = await signedOrderWrite("PUT",send);
      applyWriteSuccessToRow(rowPlan.rowRef,resp,p.meta && p.meta.rawOrder ? p.meta.rawOrder : p.meta);
      return {ok:true,response:resp};
    }
    if(rowPlan.mode === "new"){
      const p = rowPlan.payload || {};
      const ps = inferPositionSideForNewOrder(contextDirection);
      const send = {
        symbol:String(currentSymbol()),
        side:String(p.side || rowPlan.side || sideForNewRow(p.rowType || "entry",contextDirection)),
        type:"LIMIT",
        quantity:String(Number(p.quantity)),
        price:String(Number(p.level)),
        timeInForce:"GTC"
      };
      if(ps && ps !== "BOTH") send.positionSide = ps;
      if(p.reduceOnlyOverride === true) send.reduceOnly = "true";
      else if(p.reduceOnlyOverride === false) send.reduceOnly = "false";
      const resp = await signedOrderWrite("POST",send);
      applyWriteSuccessToRow(rowPlan.rowRef,resp,{
        symbol:currentSymbol(),
        side:send.side,
        positionSide:send.positionSide || "BOTH",
        type:"LIMIT",
        price:send.price,
        origQty:send.quantity,
        timeInForce:send.timeInForce
      });
      return {ok:true,response:resp};
    }
    return {ok:true,skip:true};
  }
  function expressExecutionPriority(rowPlan){
    if(!rowPlan) return 99;
    const mode = String(rowPlan.mode || "");
    if(mode === "sl-cancel" || mode === "sl-create") return 30;
    if(mode === "new"){
      const source = rowPlan.rowRef && rowPlan.rowRef.dataset ? String(rowPlan.rowRef.dataset.source || "") : "";
      return source === "binance-limit" ? 20 : 10;
    }
    if(mode === "modify" || mode === "limit-cancel-cbs") return 20;
    return 40;
  }
  function orderedExecutionRows(plan,mode){
    const rows = Array.isArray(plan && plan.rows) ? plan.rows.slice() : [];
    if(mode !== "express") return rows;
    return rows.sort((a,b) => expressExecutionPriority(a) - expressExecutionPriority(b));
  }
  async function executeSendPlan(plan,options={}){
    if(!plan || !Array.isArray(plan.rows)) return;
    if(!plan.canConfirm){
      setStatus(options.blockedStatus || "Confirm Send blocked. Run Send preflight again.");
      renderSendPlanTable();
      return;
    }
    const contextDirection = options.contextDirection || inferDirectionForSend(lastReadStateSnapshot && lastReadStateSnapshot.openPosition);
    const executionMode = options.executionMode || "normal";
    clearTimeout(autoSyncDebounceTimer);
    plan.executing = true;
    if(options.hidePopupUntilComplete) plan.showPopup = false;
    renderSendPlanTable();
    setStatus(options.inProgressStatus || "Confirm Send in progress...");
    const writable = plan.rows.filter(r => r && r.writable);
    await withCalculatorOwnedRefresh("sendConfirm",async() => {
      let haltAfterSlFailure = false;
      let haltReason = "";
      for(const rowPlan of orderedExecutionRows(plan,executionMode)){
        if(!rowPlan) continue;
        if(!rowPlan.writable){
          if(rowPlan.action === "Skip") rowPlan.status = "Skipped";
          else if(rowPlan.action === "Ignored") rowPlan.status = "Ignored";
          else if(rowPlan.action === "Blocked") rowPlan.status = "Blocked";
          if(!options.hidePopupUntilComplete) renderSendPlanTable();
          continue;
        }
        if(haltAfterSlFailure){
          rowPlan.status = "Blocked";
          rowPlan.response = haltReason || "Blocked because SL operation failed.";
          rowPlan.unexpectedResponse = false;
          if(!options.hidePopupUntilComplete) renderSendPlanTable();
          continue;
        }
        rowPlan.status = "Pending";
        rowPlan.response = "";
        if(!options.hidePopupUntilComplete) renderSendPlanTable();
        try{
          const out = await runPlanWriteRow(rowPlan,contextDirection);
          if(out && out.skip){
            rowPlan.status = "Skipped";
          }else{
            const resp = out && out.response ? out.response : null;
            const okResp = !!(resp && (
              resp.orderId != null ||
              resp.clientOrderId != null ||
              resp.origClientOrderId != null ||
              resp.algoId != null ||
              resp.clientAlgoId != null ||
              resp.success === true ||
              resp.code === 0 ||
              toUpper(resp.status) === "NEW" ||
              toUpper(resp.status) === "PARTIALLY_FILLED" ||
              toUpper(resp.status) === "CANCELED" ||
              toUpper(resp.status) === "CANCELLED"
            ));
            if(okResp){
              rowPlan.status = "Confirmed";
              rowPlan.unexpectedResponse = false;
              rowPlan.response = binanceResponseText(resp);
            }else{
              rowPlan.status = "Failed";
              rowPlan.unexpectedResponse = true;
              rowPlan.response = "Unexpected Binance response: " + binanceResponseText(resp);
            }
          }
        }catch(e){
          rowPlan.status = "Failed";
          const code = e && e.code != null ? String(e.code) + " " : "";
          rowPlan.unexpectedResponse = false;
          rowPlan.response = code + (e && e.message ? e.message : String(e));
        }
        if(rowPlan.section === "SL Operation" && rowPlan.status === "Failed"){
          if(rowPlan.mode === "sl-create"){
            haltReason = "SL placement failed; position may be unprotected. LIMIT order actions were stopped.";
            rowPlan.response = (rowPlan.response ? rowPlan.response + " | " : "") + "SL placement failed; position may be unprotected.";
            try{
              await readOpenOrdersSnapshot();
            }catch(_e){}
          }else{
            haltReason = "SL cancel failed. LIMIT order actions were stopped.";
          }
          haltAfterSlFailure = true;
        }
        if(!options.hidePopupUntilComplete) renderSendPlanTable();
      }
    });
    plan.executing = false;
    plan.canConfirm = false;
    plan.showPopup = true;
    try{
      await readBinance({preserveSendPlan:true,source:"postSendRefresh"});
    }catch(_e){}
    renderSendPlanTable();
    const failed = writable.filter(r => r && r.status === "Failed").length;
    publishSendDiagnostic({
      at:new Date().toISOString(),
      phase:executionMode === "express" ? "express" : "confirm",
      cbsEnabled:!!(plan && plan.cbsEnabled),
      slSendEnabled:!!(plan && plan.slSendEnabled),
      failed,
      totalWritable:writable.length,
      confirmed:writable.filter(r => r && r.status === "Confirmed").length,
      skipped:writable.filter(r => r && r.status === "Skipped").length
    });
    setStatus(failed ? ((options.donePrefix || "Confirm Send") + " completed with " + failed + " failed row(s).") : ((options.donePrefix || "Confirm Send") + " completed."));
  }
  async function prepareSendPlan(){
    clearSendPlan();
    clearStructuralWarning();
    clearTimeout(autoSyncDebounceTimer);
    if(typeof hasKeys !== "function" || !hasKeys()){
      sendPlanState = {
        planId:++sendPlanSeq,
        at:new Date().toISOString(),
        symbol:currentSymbol(),
        rows:[{
          action:"Blocked",
          type:"Preflight",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"API keys are required before Send preflight.",
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"preflight",
        blocked:true,
        writable:0
      });
      renderSendPlanTable();
      setStatus("Send blocked. API keys required.");
      return;
    }
    updateSendButtonState(true);
    setStatus("Send preflight: reading live Binance state...");
    try{
      const preflightState = await withCalculatorOwnedRefresh("preflightRead",async() => {
        const livePos = await signedPosition();
        const liveSnapshot = await readOpenOrdersSnapshot();
        return {livePos,liveSnapshot};
      });
      const livePos = preflightState.livePos;
      const liveSnapshot = preflightState.liveSnapshot;
      updateAutoSyncBaseline(livePos,liveSnapshot);
      clearStructuralWarning();
      sendPlanState = buildPlanFromCurrentRows(livePos,liveSnapshot);
      sendPlanState.stale = false;
      sendPlanState.staleReason = "";
      sendPlanState.showPopup = true;
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"preflight",
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        blocked:!sendPlanState.canConfirm,
        writable:sendPlanState.rows.filter(r => r && r.writable).length,
        blockedRows:sendPlanState.rows.filter(r => r && r.action === "Blocked").length,
        ignoredRows:sendPlanState.rows.filter(r => r && r.action === "Ignored").length,
        skippedRows:sendPlanState.rows.filter(r => r && r.action === "Skip").length
      });
      renderSendPlanTable();
      if(sendPlanState.canConfirm) setStatus("Preflight ready. Review table and click Confirm Send.");
      else setStatus("Preflight completed with blocked/ignored rows.");
    }catch(e){
      sendPlanState = {
        planId:++sendPlanSeq,
        at:new Date().toISOString(),
        symbol:currentSymbol(),
        rows:[{
          action:"Blocked",
          type:"Preflight",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"Preflight failed: " + (e && e.message ? e.message : String(e)),
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"preflight",
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        blocked:true,
        error:e && e.message ? e.message : String(e),
        writable:0
      });
      renderSendPlanTable();
      setStatus("Send preflight failed.");
    }finally{
      updateSendButtonState(false);
    }
  }
  function applyExpressPayloadSafeguards(plan){
    if(!plan || !Array.isArray(plan.rows)) return plan;
    plan.rows.forEach(rowPlan => {
      if(!rowPlan || rowPlan.mode !== "new" || !rowPlan.payload) return;
      const rowType = String(rowPlan.payload.rowType || "");
      rowPlan.payload.reduceOnlyOverride = rowType === "exit";
    });
    return plan;
  }
  async function executeExpressMode(){
    clearSendPlan();
    clearStructuralWarning();
    clearTimeout(autoSyncDebounceTimer);
    if(typeof hasKeys !== "function" || !hasKeys()){
      sendPlanState = {
        planId:++sendPlanSeq,
        at:new Date().toISOString(),
        symbol:currentSymbol(),
        rows:[{
          action:"Blocked",
          type:"Express",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"API keys are required before Express Mode execution.",
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      renderSendPlanTable();
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"express",
        blocked:true,
        writable:0,
        reason:"missing-api-keys"
      });
      setStatus("Express Mode blocked. API keys required.");
      return;
    }
    updateSendButtonState(true);
    setStatus("Express Mode: reading live Binance state...");
    try{
      const preflightState = await withCalculatorOwnedRefresh("preflightRead",async() => {
        const livePos = await signedPosition();
        const liveSnapshot = await readOpenOrdersSnapshot();
        return {livePos,liveSnapshot};
      });
      const livePos = preflightState.livePos;
      const liveSnapshot = preflightState.liveSnapshot;
      updateAutoSyncBaseline(livePos,liveSnapshot);
      lastReadStateSnapshot = buildReadStateSnapshot(livePos,liveSnapshot,currentMappedRowsForBaseline());
      sendPlanState = applyExpressPayloadSafeguards(buildPlanFromCurrentRows(livePos,liveSnapshot));
      sendPlanState.stale = false;
      sendPlanState.staleReason = "";
      sendPlanState.showPopup = false;
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"express",
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        blocked:!sendPlanState.canConfirm,
        writable:sendPlanState.rows.filter(r => r && r.writable).length,
        blockedRows:sendPlanState.rows.filter(r => r && r.action === "Blocked").length,
        ignoredRows:sendPlanState.rows.filter(r => r && r.action === "Ignored").length,
        skippedRows:sendPlanState.rows.filter(r => r && r.action === "Skip").length
      });
      if(!sendPlanState.canConfirm){
        sendPlanState.showPopup = true;
        renderSendPlanTable();
        setStatus("Express Mode blocked. Review results.");
        return;
      }
      await executeSendPlan(sendPlanState,{
        executionMode:"express",
        hidePopupUntilComplete:true,
        contextDirection:inferDirectionForSend(livePos),
        blockedStatus:"Express Mode blocked. Review results.",
        inProgressStatus:"Express Mode executing...",
        donePrefix:"Express Mode"
      });
    }catch(e){
      sendPlanState = {
        planId:++sendPlanSeq,
        at:new Date().toISOString(),
        symbol:currentSymbol(),
        rows:[{
          action:"Blocked",
          type:"Express",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"Express Mode failed: " + (e && e.message ? e.message : String(e)),
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:!!cbsEnabled,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      renderSendPlanTable();
      publishSendDiagnostic({
        at:new Date().toISOString(),
        phase:"express",
        blocked:true,
        error:e && e.message ? e.message : String(e),
        writable:0
      });
      setStatus("Express Mode failed.");
    }finally{
      updateSendButtonState(false);
    }
  }
  async function confirmSendPlan(planId){
    if(!sendPlanState || sendPlanState.planId !== planId || sendPlanState.executing) return;
    await executeSendPlan(sendPlanState,{
      executionMode:"normal",
      blockedStatus:"Confirm Send blocked. Run Send preflight again.",
      inProgressStatus:"Confirm Send in progress...",
      donePrefix:"Confirm Send"
    });
  }
  function orderStopPrice(order){
    for(const key of ["stopPrice","triggerPrice","activatePrice","price"]){
      const n = num(order && order[key]);
      if(n != null && n > 0) return n;
    }
    return null;
  }
  function isLiveOrder(order){
    const status = String(order && (order.status || order.orderStatus || "NEW") || "NEW").toUpperCase();
    return !status || status === "NEW" || status === "PENDING" || status === "ACCEPTED" || status === "PARTIALLY_FILLED" || status.includes("NEW");
  }
  function isStopOrder(order){
    const text = [order && order.type,order && order.origType,order && order.orderType,order && order.algoType]
      .map(v => String(v || "").toUpperCase())
      .join(" ");
    return text.includes("STOP") && !text.includes("TAKE_PROFIT") && !text.includes("TRAILING") && orderStopPrice(order) != null;
  }
  function findStopOrderForPosition(pos,snapshot,algoOnly){
    const sym = currentSymbol();
    const opposite = pos.side === "SHORT" ? "BUY" : "SELL";
    const orders = snapshot
      ? (algoOnly ? [].concat(snapshot.algoOrders || []) : [].concat(snapshot.normalOrders || [], snapshot.algoOrders || []))
      : [];
    const candidates = orders
      .filter(o => o && String(o.symbol || "") === sym)
      .filter(isLiveOrder)
      .filter(isStopOrder)
      .filter(o => String(o.side || "").toUpperCase() === opposite)
      .filter(o => {
        const ps = String(o.positionSide || "").toUpperCase();
        return !ps || ps === "BOTH" || ps === pos.side;
      })
      .map(o => ({price:orderStopPrice(o), order:o}))
      .filter(x => x.price != null);
    if(!candidates.length) return null;
    const directional = candidates.filter(x => pos.side === "LONG" ? x.price < pos.entry : x.price > pos.entry);
    const pool = directional.length ? directional : candidates;
    pool.sort((a,b) => pos.side === "LONG" ? b.price - a.price : a.price - b.price);
    return pool[0] || null;
  }
  async function findStopForPosition(pos,snapshot){
    let localSnapshot = snapshot;
    if(!localSnapshot){
      try{
        localSnapshot = await readOpenOrdersSnapshot();
      }catch(_e){
        localSnapshot = {symbol:currentSymbol(),normalOrders:[],algoOrders:[]};
      }
    }
    const best = findStopOrderForPosition(pos,localSnapshot,false);
    return best ? best.price : null;
  }
  async function readBinance(options){
    const opts = options || {};
    const source = opts.source || (opts.userRead ? "userRead" : opts.autoSync ? "autoWatch" : "");
    const isAutoWatch = source === "autoWatch";
    const isOwnedRefresh = CALC_OWNED_REFRESH_SOURCES.has(source);
    if(isOwnedRefresh && !opts.__ownedWrapped){
      return withCalculatorOwnedRefresh(source,() => readBinance({...opts,__ownedWrapped:true}));
    }
    if(source === "userRead"){
      clearStructuralWarning();
      clearTimeout(autoSyncDebounceTimer);
    }
    if(!opts.preserveSendPlan) markSendPlanStale("Read clicked after preflight.");
    lastReadStateSnapshot = null;
    setStatus("Reading current open position...");
    const diag = {
      at:new Date().toISOString(),
      symbol:currentSymbol(),
      positionSource:null,
      positionSide:null,
      normalLimitOrdersFound:0,
      mappedEntries:0,
      mappedExits:0,
      ignoredAlgoOrders:0,
      ignoredNonLimitOrders:0,
      ignoredByPositionSide:0,
      openOrdersReadStatus:"not-requested"
    };
    try{
      const preservedAutoEntryRows = isAutoWatch ? snapshotManualRows("calcModuleEntryRows") : [];
      const readState = isOwnedRefresh
        ? await withCalculatorOwnedRefresh(source,async() => ({pos:await signedPosition() || openBoxPosition()}))
        : {pos:await signedPosition() || openBoxPosition()};
      const pos = readState.pos;
      unlockEntryRows();
      if(pos){
        diag.positionSource = pos.source || null;
        diag.positionSide = pos.side || null;
        setDirection(pos.side);
        setRows(
          "calcModuleEntryRows",
          [{level:pos.entry,lot:pos.qty}],
          {lockFirstRow:true,openPositionFirstRow:true,keepRemoveEnabledFirstRow:true}
        );
      }else{
        unlockEntryRows();
        clearOpenPositionRows();
      }

      clearMappedLimitRows("calcModuleEntryRows");
      clearMappedLimitRows("calcModuleExitRows");
      binanceLimitRowMetaByRowId.clear();

      let snapshot = null;
      let mapped = null;
      try{
        snapshot = isOwnedRefresh
          ? await withCalculatorOwnedRefresh(source,() => readOpenOrdersSnapshot())
          : await readOpenOrdersSnapshot();
        const normalErr = !!snapshot.normalFetchError;
        const algoErr = !!snapshot.algoFetchError;
        diag.openOrdersReadStatus = normalErr && algoErr ? "error" : (normalErr || algoErr ? "partial" : "ok");
      }catch(_e){
        diag.openOrdersReadStatus = "error";
      }

      if(snapshot){
        mapped = mapLimitOrdersForCalculator(snapshot,pos ? pos.side : direction);
        diag.normalLimitOrdersFound = mapped.diagnostic.normalLimitOrdersFound;
        diag.mappedEntries = mapped.diagnostic.mappedEntries;
        diag.mappedExits = mapped.diagnostic.mappedExits;
        diag.ignoredAlgoOrders = mapped.diagnostic.ignoredAlgoOrders;
        diag.ignoredNonLimitOrders = mapped.diagnostic.ignoredNonLimitOrders;
        diag.ignoredByPositionSide = mapped.diagnostic.ignoredByPositionSide;
        mapped.entryRows.forEach(item => applyMappedRow("calcModuleEntryRows",item));
        mapped.exitRows.forEach(item => applyMappedRow("calcModuleExitRows",item));
      }
      if(isAutoWatch && pos) restoreManualRows("calcModuleEntryRows",preservedAutoEntryRows);

      let stop = null;
      currentStopAlgoMeta = null;
      if(pos){
        const bestStop = snapshot ? findStopOrderForPosition(pos,snapshot,false) : null;
        const algoStop = snapshot ? findStopOrderForPosition(pos,snapshot,true) : null;
        stop = bestStop ? bestStop.price : await findStopForPosition(pos,snapshot);
        currentStopAlgoMeta = algoStop && algoStop.order ? buildAlgoOrderMeta(algoStop.order) : null;
      }
      if(pos && stop != null){
        q("calcModuleStopLevel").value = Math.round(stop);
        lastStopEdit = "level";
        syncStopFromLevel(pos.entry);
      }
      if(snapshot){
        lastReadStateSnapshot = buildReadStateSnapshot(pos,snapshot,mapped || {entryRows:[],exitRows:[],diagnostic:{}});
        updateAutoSyncBaseline(pos,snapshot);
      }else{
        lastReadStateSnapshot = buildReadStateSnapshot(pos,{symbol:currentSymbol(),normalOrders:[],algoOrders:[]},{entryRows:[],exitRows:[],diagnostic:{}});
        updateAutoSyncBaseline(pos,{symbol:currentSymbol(),normalOrders:[]});
      }
      if(source === "userRead") enableAutoSyncDetection();
      calculate();
      if(!pos){
        setStatus(diag.mappedEntries || diag.mappedExits ? "No current open position found. LIMIT orders loaded." : "No current open position found.");
      }else if(diag.openOrdersReadStatus === "error"){
        setStatus("Position loaded. Open orders read failed.");
      }else{
        setStatus(stop != null ? "" : "No stop found.");
      }
      if(isOwnedRefresh){
        clearStructuralWarning();
      }else if(isAutoWatch || structuralWarningActive){
        setStatus(STRUCTURAL_WARNING_TEXT);
      }
      publishReadDiagnostic(diag);
    }catch(e){
      console.warn(MODULE + " Binance read failed",e);
      setStatus("Read failed.");
      lastReadStateSnapshot = null;
      diag.openOrdersReadStatus = "error";
      publishReadDiagnostic(diag);
    }
  }

  function installDragResize(win){
    const head = q("calcModuleHead");
    let drag = null;
    head.addEventListener("pointerdown",e => {
      if(e.target.closest("button")) return;
      const r = win.getBoundingClientRect();
      drag = {x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      win.style.zIndex = String(++zTop);
      head.setPointerCapture(e.pointerId);
      e.preventDefault();
    },false);
    head.addEventListener("pointermove",e => {
      if(!drag) return;
      win.style.left = clamp(drag.left + e.clientX - drag.x,0,window.innerWidth - 80) + "px";
      win.style.top = clamp(drag.top + e.clientY - drag.y,0,window.innerHeight - 40) + "px";
    },false);
    const endDrag = e => {
      if(!drag) return;
      drag = null;
      try{ head.releasePointerCapture(e.pointerId); }catch(_e){}
    };
    head.addEventListener("pointerup",endDrag,false);
    head.addEventListener("pointercancel",endDrag,false);

    win.querySelectorAll(".calc-module-resize").forEach(handle => {
      handle.addEventListener("pointerdown",e => {
        e.preventDefault();
        e.stopPropagation();
        const r = win.getBoundingClientRect();
        const start = {x:e.clientX,y:e.clientY,left:r.left,top:r.top,width:r.width,height:r.height,dir:handle.dataset.resize || ""};
        win.style.zIndex = String(++zTop);
        handle.setPointerCapture(e.pointerId);
        const move = ev => {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;
          let left = start.left, top = start.top, width = start.width, height = start.height;
          const minW = 395, minH = 320;
          if(start.dir.includes("e")) width = start.width + dx;
          if(start.dir.includes("s")) height = start.height + dy;
          if(start.dir.includes("w")){ width = start.width - dx; left = start.left + dx; }
          if(start.dir.includes("n")){ height = start.height - dy; top = start.top + dy; }
          if(width < minW){ if(start.dir.includes("w")) left -= minW - width; width = minW; }
          if(height < minH){ if(start.dir.includes("n")) top -= minH - height; height = minH; }
          left = clamp(left,0,window.innerWidth - 80);
          top = clamp(top,0,window.innerHeight - 40);
          width = Math.min(width,window.innerWidth - left - 6);
          height = Math.min(height,window.innerHeight - top - 6);
          win.style.left = left + "px";
          win.style.top = top + "px";
          win.style.width = width + "px";
          win.style.height = height + "px";
        };
        const up = ev => {
          document.removeEventListener("pointermove",move,true);
          document.removeEventListener("pointerup",up,true);
          document.removeEventListener("pointercancel",up,true);
          try{ handle.releasePointerCapture(ev.pointerId); }catch(_e){}
        };
        document.addEventListener("pointermove",move,true);
        document.addEventListener("pointerup",up,true);
        document.addEventListener("pointercancel",up,true);
      },true);
    });
  }

  function priceFromCanvasY(y){
    const state = currentPriceLineState || {};
    const top = num(state.top) ?? 8;
    const priceH = num(state.priceH) ?? lastAreaH;
    const minP = num(state.minP) ?? lastYMin;
    const maxP = num(state.maxP) ?? lastYMax;
    if(priceH == null || !(priceH > 0) || minP == null || maxP == null || !(maxP > minP)) return null;
    const chartY = clamp(y,top,top + priceH);
    return maxP - ((chartY - top) / priceH) * (maxP - minP);
  }
  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{ document.execCommand("copy"); }finally{ ta.remove(); }
    return Promise.resolve();
  }
  function ensureContextMenu(){
    let menu = q("calcModuleContextMenu");
    if(menu) return menu;
    menu = document.createElement("div");
    menu.id = "calcModuleContextMenu";
    menu.className = "calc-module-context-menu hidden";
    menu.innerHTML = `<button id="calcModuleCopyPrice" type="button">Copy Price | -</button>`;
    document.body.appendChild(menu);
    return menu;
  }
  function hideContextMenu(){
    q("calcModuleContextMenu")?.classList.add("hidden");
  }
  function installContextMenu(){
    if(!canvas || canvas.__calculatorModuleContextMenu) return;
    canvas.__calculatorModuleContextMenu = true;
    canvas.addEventListener("contextmenu",e => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = priceFromCanvasY(y);
      if(price == null) return;
      e.preventDefault();
      e.stopPropagation();
      const label = fmtPrice(price);
      const menu = ensureContextMenu();
      const btn = q("calcModuleCopyPrice");
      btn.textContent = "Copy Price | " + label;
      btn.onclick = () => copyText(label).finally(hideContextMenu);
      menu.style.left = Math.min(e.clientX,window.innerWidth - 176) + "px";
      menu.style.top = Math.min(e.clientY,window.innerHeight - 42) + "px";
      menu.classList.remove("hidden");
    },false);
    document.addEventListener("click",e => {
      if(!e.target.closest || !e.target.closest("#calcModuleContextMenu")) hideContextMenu();
    },true);
    window.addEventListener("blur",hideContextMenu,false);
    document.addEventListener("keydown",e => { if(e.key === "Escape") hideContextMenu(); },false);
  }

  function bindCalculator(){
    const win = ensureWindow();
    const openBtn = ensureButton();
    if(win.__calculatorModuleBound) return;
    win.__calculatorModuleBound = true;
    levelsVisible = loadLevelsVisible();
    slSendEnabled = loadSlSendEnabled();
    cbsEnabled = loadCbsEnabled();
    expressModeEnabled = loadExpressModeEnabled();
    saveLevelsVisible(levelsVisible);
    saveSlSendEnabled(slSendEnabled);
    saveCbsEnabled(cbsEnabled);
    saveExpressModeEnabled(expressModeEnabled);
    installDrawOverlayHook();
    installOverlayDragHooks();

    function showCalculator(){
      win.classList.remove("hidden");
      win.style.zIndex = String(++zTop);
      openBtn.classList.add("is-on");
      openBtn.setAttribute("aria-pressed","true");
    }
    function hideCalculator(){
      win.classList.add("hidden");
      openBtn.classList.remove("is-on");
      openBtn.setAttribute("aria-pressed","false");
    }

    openBtn.addEventListener("click",() => {
      if(win.classList.contains("hidden")) showCalculator();
      else hideCalculator();
    },false);
    q("calcModuleClose").addEventListener("click",hideCalculator,false);
    q("calcModuleDir").addEventListener("click",() => {
      markSendPlanStale("Direction changed after preflight.");
      setDirection(direction === "LONG" ? "SHORT" : "LONG");
      lastStopEdit = "distance";
      syncStopFromDistance(readEntry().avg);
      calculate();
    },false);
    q("calcModuleAddEntry").addEventListener("click",() => {
      markSendPlanStale("Entry row list changed after preflight.");
      addRow("calcModuleEntryRows");
    },false);
    q("calcModuleAddExit").addEventListener("click",() => {
      markSendPlanStale("Exit row list changed after preflight.");
      addRow("calcModuleExitRows");
    },false);
    q("calcModuleStopLevel").addEventListener("input",() => {
      markSendPlanStale("SL level changed after preflight.");
      lastStopEdit = "level";
      syncStopFromLevel(readEntry().avg);
      calculate();
    },false);
    q("calcModuleStopDistance").addEventListener("input",() => {
      markSendPlanStale("SL distance changed after preflight.");
      lastStopEdit = "distance";
      syncStopFromDistance(readEntry().avg);
      calculate();
    },false);
    q("calcModulePlTitle").addEventListener("click",() => {
      const body = q("calcModuleExitPlRows");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModulePlCaret").textContent = closed ? ">" : "v";
    },false);
    q("calcModuleSummaryTitle").addEventListener("click",() => {
      const body = q("calcModuleSummaryBody");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModuleSummaryCaret").textContent = closed ? ">" : "v";
    },false);
    q("calcModuleClear").addEventListener("click",clearCalculatorLocal,false);
    q("calcModuleRead").addEventListener("click",() => readBinance({userRead:true}),false);
    q("calcModuleSend").addEventListener("click",() => {
      if(expressModeEnabled) executeExpressMode();
      else prepareSendPlan();
    },false);
    q("calcModuleLevelsToggle").addEventListener("change",e => {
      saveLevelsVisible(!!(e.target && e.target.checked));
    },false);
    q("calcModuleCbsToggle").addEventListener("change",e => {
      markSendPlanStale("CBS toggle changed after preflight.");
      saveCbsEnabled(!!(e.target && e.target.checked));
    },false);
    q("calcModuleExpressToggle").addEventListener("change",e => {
      markSendPlanStale("Express Mode toggle changed after preflight.");
      saveExpressModeEnabled(!!(e.target && e.target.checked));
    },false);
    q("calcModuleSlToggle").addEventListener("change",e => {
      markSendPlanStale("SL toggle changed after preflight.");
      saveSlSendEnabled(!!(e.target && e.target.checked));
    },false);

    installDragResize(win);
    if(marketEl && !marketEl.__calcSendStaleBound){
      marketEl.__calcSendStaleBound = true;
      marketEl.addEventListener("change",() => {
        markSendPlanStale("Symbol changed after preflight.");
      },false);
    }
    setDirection("LONG");
    addRow("calcModuleEntryRows");
    addRow("calcModuleExitRows");
    installContextMenu();
    window.CALCULATOR_MODULE = {
      version:MODULE,
      open:showCalculator,
      hide:hideCalculator,
      calculate,
      priceFromCanvasY,
      getBinanceLimitRowMeta(rowOrId){
        const rowId = typeof rowOrId === "string"
          ? rowOrId
          : rowOrId && rowOrId.dataset
            ? rowOrId.dataset.calcRowId
            : "";
        return rowId ? binanceLimitRowMetaByRowId.get(rowId) || null : null;
      },
      getBinanceLimitRowMetaMap(){ return new Map(binanceLimitRowMetaByRowId); },
      getLastReadDiagnostic(){ return lastReadDiagnostic; },
      getLastOverlayDiagnostic(){ return lastOverlayDiagnostic; },
      getLastSendDiagnostic(){ return lastSendDiagnostic; },
      setLevelsVisible(next){ saveLevelsVisible(!!next); },
      getLevelsVisible(){ return !!levelsVisible; },
      setSlSendEnabled(next){ saveSlSendEnabled(!!next); },
      getSlSendEnabled(){ return !!slSendEnabled; },
      setCbsEnabled(next){ saveCbsEnabled(!!next); },
      getCbsEnabled(){ return !!cbsEnabled; }
    };
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bindCalculator,{once:true});
  else bindCalculator();
})();
