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
  const ORDERS_VISIBLE_KEY = STORE + "orders_visible";
  const AUTO_SYNC_POLL_MS = 2000;
  const AUTO_SYNC_DEBOUNCE_MS = 800;
  const OPEN_POSITION_CLOSE_CHS_POLL_MS = 1200;
  const OPEN_POSITION_CLOSE_CHS_DIST_OPTIONS = [0,1,2,5];
  const OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS = [
    {key:"10s",label:"10s",ms:10000},
    {key:"30s",label:"30s",ms:30000},
    {key:"60s",label:"60s",ms:60000},
    {key:"manual",label:"Manual",ms:null}
  ];
  const CALC_OWNED_REFRESH_SOURCES = new Set(["preflightRead","sendConfirm","postSendRefresh","resultWindowClose"]);
  const conditionalClassifier = window.BinanceConditionalOrderClassifier || null;
  const CONDITIONAL_KIND = conditionalClassifier && conditionalClassifier.KINDS
    ? conditionalClassifier.KINDS
    : {MASTER_SL:"MASTER_SL",PSL:"PSL",MASTER_TP:"MASTER_TP",PARTIAL_TP:"PARTIAL_TP",UNKNOWN:"UNKNOWN"};
  let zTop = 82;
  let direction = "LONG";
  let syncingStop = false;
  let lastStopEdit = "level";
  let levelsVisible = true;
  let slSendEnabled = false;
  let cbsEnabled = false;
  let expressModeEnabled = false;
  let ordersVisible = true;
  let otfEnabled = false;
  let otfSelection = null;
  let otfSelectionAnimation = 0;
  const otfPendingOrderKeys = new Set();
  let binanceLimitRowSeq = 0;
  const binanceLimitRowMetaByRowId = new Map();
  let binancePartialStopRowSeq = 0;
  const binancePartialStopMetaByRowId = new Map();
  const suppressedPartialStopKeys = new Set();
  let currentStopAlgoMeta = null;
  let masterStopMarkedForDeletion = false;
  let masterStopDraftDirty = false;
  let lastReadDiagnostic = null;
  let lastOverlayDiagnostic = null;
  let lastSendDiagnostic = null;
  let overlayLevelBoxes = [];
  let overlayDrag = {active:false,row:null,target:"row",moved:false,otf:false};
  let suppressNextOverlayClick = false;
  let suppressCalculatorOverlayDraw = false;
  const confirmedOrderBlinkByKey = new Map();
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
  let lastEditedPartialStopLotInput = null;
  let lastEditedExitLotInput = null;
  let lastKnownLiveOpenPositionQty = null;
  let positionSizeNoticeTimer = null;
  let openPositionReconcileTimer = null;
  let pendingOpenPositionChange = null;
  let lastOpenPositionReconcileSignature = "";
  let openPositionCloseUi = {open:false,percent:0,dragging:false,sending:false,sliderLeft:null,sliderRight:null,mode:"CHS",chsDistTicks:2,chsValidKey:"manual"};
  let openPositionCloseChs = {
    active:false,
    canceling:false,
    checking:false,
    timer:null,
    symbol:"",
    side:"",
    positionSide:"",
    requestedQty:0,
    filledQty:0,
    remainingQty:0,
    price:"",
    orderId:null,
    clientOrderId:"",
    startedPositionQty:0,
    distTicks:2,
    validKey:"manual",
    validMs:null,
    startedAt:0,
    expiresAt:0
  };
  let binanceStateReconcileTimer = null;
  let pendingBinanceStateChange = null;
  let lastBinanceStateEventSignature = "";
  let binanceSyncPreserveKeys = new Set();
  let binanceSyncPreservedRows = [];
  let flatCleanupInFlight = false;
  let lastFlatCleanupSignature = "";
  const notifiedExecutionKeys = new Set();
  let lastSettingsRequestedSymbol = "";

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
  function fmtChartMoney(v){
    const n = num(v);
    if(n == null) return "$-";
    return (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
  }
  function floorToLotStep(value){
    const n = num(value);
    if(n == null || n <= 0) return 0;
    return Math.floor((n + 1e-12) * 1000) / 1000;
  }
  function freshOpenPositionCloseClientId(){
    const prefix = "OTF_CLOSE_";
    const suffix = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
    const symbolPart = String(currentSymbol() || "SYM").replace(/[^a-zA-Z0-9]/g,"").slice(-8);
    return (prefix + symbolPart + "_" + suffix).slice(0,36);
  }
  function clearOpenPositionCloseChsTimer(){
    if(openPositionCloseChs.timer){
      clearTimeout(openPositionCloseChs.timer);
      openPositionCloseChs.timer = null;
    }
  }
  function resetOpenPositionCloseChs(){
    clearOpenPositionCloseChsTimer();
    openPositionCloseChs.active = false;
    openPositionCloseChs.canceling = false;
    openPositionCloseChs.checking = false;
    openPositionCloseChs.symbol = "";
    openPositionCloseChs.side = "";
    openPositionCloseChs.positionSide = "";
    openPositionCloseChs.requestedQty = 0;
    openPositionCloseChs.filledQty = 0;
    openPositionCloseChs.remainingQty = 0;
    openPositionCloseChs.price = "";
    openPositionCloseChs.orderId = null;
    openPositionCloseChs.clientOrderId = "";
    openPositionCloseChs.startedPositionQty = 0;
    openPositionCloseChs.distTicks = Math.max(0,num(openPositionCloseUi.chsDistTicks) || 2);
    openPositionCloseChs.validKey = String(openPositionCloseUi.chsValidKey || "manual");
    const validOption = openPositionCloseChsValidOption(openPositionCloseChs.validKey);
    openPositionCloseChs.validMs = validOption ? validOption.ms : null;
    openPositionCloseChs.startedAt = 0;
    openPositionCloseChs.expiresAt = 0;
  }
  function resetOpenPositionCloseUi(){
    openPositionCloseUi.open = false;
    openPositionCloseUi.percent = 0;
    openPositionCloseUi.dragging = false;
    openPositionCloseUi.sending = false;
    openPositionCloseUi.sliderLeft = null;
    openPositionCloseUi.sliderRight = null;
    openPositionCloseUi.mode = "CHS";
    openPositionCloseUi.chsDistTicks = 2;
    openPositionCloseUi.chsValidKey = "manual";
  }
  function isOpenPositionCloseControl(hit){
    return !!(hit && [
      "open-position-close-toggle",
      "open-position-close-confirm",
      "open-position-close-slider",
      "open-position-close-mode-mkt",
      "open-position-close-mode-chs",
      "open-position-close-chs-cancel",
      "open-position-close-chs-dist",
      "open-position-close-chs-valid"
    ].includes(hit.controlType));
  }
  function openPositionCloseMode(){
    return openPositionCloseChs.active ? "CHS" : (String(openPositionCloseUi.mode || "CHS").toUpperCase() === "MKT" ? "MKT" : "CHS");
  }
  function openPositionCloseChsValidOption(key){
    const target = String(key || "30s").toLowerCase();
    return OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS.find(item => String(item.key).toLowerCase() === target) || OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS[3];
  }
  function openPositionCloseChsRemainingValidMs(nowValue){
    if(!openPositionCloseChs.active || !openPositionCloseChs.validMs || !(openPositionCloseChs.expiresAt > 0)) return null;
    return Math.max(0,openPositionCloseChs.expiresAt - (nowValue == null ? Date.now() : nowValue));
  }
  function openPositionCloseChsTimerText(ms){
    if(ms == null) return "Manual";
    return Math.max(0,Math.ceil(ms / 1000)) + "s";
  }
  function currentOpenPositionCloseChsDistTicks(){
    return Math.max(0,Math.round(num(openPositionCloseChs.active ? openPositionCloseChs.distTicks : openPositionCloseUi.chsDistTicks) || 0));
  }
  function currentOpenPositionCloseChsValidKey(){
    return String(openPositionCloseChs.active ? openPositionCloseChs.validKey : openPositionCloseUi.chsValidKey || "manual");
  }
  function primeOpenPositionClosePanelDefaults(){
    openPositionCloseUi.open = true;
    openPositionCloseUi.dragging = false;
    openPositionCloseUi.sliderLeft = null;
    openPositionCloseUi.sliderRight = null;
    if(openPositionCloseChs.active) return;
    openPositionCloseUi.percent = 0;
    openPositionCloseUi.mode = "CHS";
    openPositionCloseUi.chsDistTicks = 2;
    openPositionCloseUi.chsValidKey = "manual";
  }
  function cycleOpenPositionCloseChsDist(){
    const current = currentOpenPositionCloseChsDistTicks();
    const index = OPEN_POSITION_CLOSE_CHS_DIST_OPTIONS.indexOf(current);
    const next = OPEN_POSITION_CLOSE_CHS_DIST_OPTIONS[(index + 1 + OPEN_POSITION_CLOSE_CHS_DIST_OPTIONS.length) % OPEN_POSITION_CLOSE_CHS_DIST_OPTIONS.length];
    openPositionCloseUi.chsDistTicks = next;
  }
  function cycleOpenPositionCloseChsValid(){
    const current = currentOpenPositionCloseChsValidKey();
    const index = Math.max(0,OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS.findIndex(item => item.key === current));
    const next = OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS[(index + 1 + OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS.length) % OPEN_POSITION_CLOSE_CHS_VALID_OPTIONS.length];
    openPositionCloseUi.chsValidKey = next.key;
  }
  function symbolTickSizeValue(){
    const helper = window.BT001SymbolTradingSettings;
    const settings = helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
    const tick = num(settings && settings.tickSize);
    return tick && tick > 0 ? tick : null;
  }
  function openPositionClosePreview(positionLike){
    const liveQty = Math.max(0,num(positionLike && (positionLike.qty != null ? positionLike.qty : positionLike.lot)) || 0);
    const entry = num(positionLike && (positionLike.entry != null ? positionLike.entry : positionLike.level));
    const percent = clamp(num(openPositionCloseUi.percent) == null ? 0 : num(openPositionCloseUi.percent),0,100);
    const rawQty = liveQty * percent / 100;
    const roundedQty = Math.min(liveQty,floorToLotStep(rawQty));
    const belowMinimum = rawQty > 0 && roundedQty < 0.001;
    const executable = roundedQty >= 0.001 && roundedQty <= liveQty + 1e-9;
    const current = currentPriceReference();
    const side = String(positionLike && positionLike.side || direction).toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const estPl = current == null || entry == null ? null : ((side === "SHORT" ? entry - current : current - entry) * roundedQty);
    return {liveQty,entry,percent,rawQty,roundedQty,belowMinimum,executable,estPl,side,current};
  }
  function normalizedCloseChasePrice(positionSide,distTicksOverride){
    const side = String(positionSide || direction).toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const current = currentPriceReference();
    if(!(num(current) > 0)) return "";
    const tickSize = symbolTickSizeValue();
    const distTicks = Math.max(0,num(distTicksOverride) == null ? currentOpenPositionCloseChsDistTicks() : num(distTicksOverride));
    const adjusted = tickSize && tickSize > 0
      ? (side === "LONG" ? current - distTicks * tickSize : current + distTicks * tickSize)
      : current;
    const helper = window.BT001SymbolTradingSettings;
    const settings = helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
    const normalized = helper && typeof helper.normalizePrice === "function"
      ? helper.normalizePrice(adjusted,settings)
      : Number(adjusted.toFixed(8)).toFixed(8);
    const parsed = num(normalized);
    if(!(parsed > 0)) return "";
    return normalized;
  }
  function findOpenPositionCloseChsOrder(snapshot,identity){
    if(!snapshot || !Array.isArray(snapshot.normalOrders)) return null;
    const source = identity || openPositionCloseChs;
    const symbol = String(source.symbol || currentSymbol()).toUpperCase();
    const orderId = source.orderId != null ? String(source.orderId) : "";
    const clientOrderId = String(source.clientOrderId || "").trim();
    return snapshot.normalOrders.find(order => {
      if(!order || toUpper(order.symbol) !== symbol) return false;
      if(toUpper(order.type) !== "LIMIT") return false;
      if(orderId && order.orderId != null && String(order.orderId) === orderId) return true;
      if(clientOrderId && String(order.clientOrderId || "").trim() === clientOrderId) return true;
      return false;
    }) || null;
  }
  function openPositionCloseChsProgress(livePos,openOrder){
    const requestedQty = Math.max(0,num(openPositionCloseChs.requestedQty) || 0);
    const startedQty = Math.max(0,num(openPositionCloseChs.startedPositionQty) || 0);
    const liveQty = Math.max(0,num(livePos && livePos.qty) || 0);
    const inferredFilled = clamp(startedQty - liveQty,0,requestedQty);
    const orderOrigQty = Math.max(0,num(openOrder && (openOrder.origQty != null ? openOrder.origQty : openOrder.quantity)) || 0);
    const orderExecutedQty = Math.max(0,num(openOrder && openOrder.executedQty) || 0);
    const openRemaining = openOrder ? Math.max(0,orderOrigQty - orderExecutedQty) : 0;
    const filledQty = clamp(Math.max(inferredFilled,orderExecutedQty),0,requestedQty);
    let remainingQty = openOrder ? Math.max(openRemaining,requestedQty - filledQty) : Math.max(0,requestedQty - filledQty);
    remainingQty = clamp(Math.min(remainingQty,liveQty),0,requestedQty);
    return {
      requestedQty,
      filledQty,
      remainingQty,
      liveQty,
      activePrice:openOrder && num(openOrder.price) > 0 ? String(openOrder.price) : String(openPositionCloseChs.price || "")
    };
  }
  function openPositionCloseChsStatusText(progress,options){
    const opts = options || {};
    const prefix = opts.prefix || "Open Position CHS";
    const validText = opts.validText ? " | valid " + opts.validText : "";
    return prefix
      + " | chasing " + fmtLot(progress.requestedQty)
      + " | filled " + fmtLot(progress.filledQty)
      + " | remaining " + fmtLot(progress.remainingQty)
      + " | price " + (progress.activePrice ? fmtPrice(progress.activePrice) : "-")
      + validText;
  }
  async function submitOpenPositionCloseChsLimit(livePos,quantity,price){
    const clientId = freshOpenPositionCloseClientId();
    const send = {
      symbol:String(currentSymbol()),
      side:String(openPositionCloseChs.side || (livePos && livePos.side === "SHORT" ? "BUY" : "SELL")),
      type:"LIMIT",
      timeInForce:"GTC",
      quantity:fmtLot(quantity),
      price:String(price),
      newClientOrderId:clientId
    };
    const ps = toUpper((livePos && livePos.positionSide) || openPositionCloseChs.positionSide || "");
    if(ps === "LONG" || ps === "SHORT") send.positionSide = ps;
    else send.reduceOnly = "true";
    const resp = await signedOrderWrite("POST",send);
    if(!binanceWriteConfirmed(resp)) throw new Error("Unexpected Binance response.");
    openPositionCloseChs.orderId = resp && resp.orderId != null ? resp.orderId : null;
    openPositionCloseChs.clientOrderId = resp && resp.clientOrderId ? String(resp.clientOrderId) : clientId;
    openPositionCloseChs.price = String(send.price);
    return resp;
  }
  async function cancelOpenPositionCloseChsOrderOnly(){
    if(openPositionCloseChs.orderId == null && !String(openPositionCloseChs.clientOrderId || "").trim()) return null;
    const send = {symbol:String(openPositionCloseChs.symbol || currentSymbol())};
    if(openPositionCloseChs.orderId != null) send.orderId = String(openPositionCloseChs.orderId);
    else send.origClientOrderId = String(openPositionCloseChs.clientOrderId || "");
    return signedOrderWrite("DELETE",send);
  }
  function scheduleOpenPositionCloseChsTick(){
    clearOpenPositionCloseChsTimer();
    if(!openPositionCloseChs.active) return;
    openPositionCloseChs.timer = setTimeout(() => { runOpenPositionCloseChsTick(); },OPEN_POSITION_CLOSE_CHS_POLL_MS);
  }
  async function finishOpenPositionCloseChs(reason,options){
    const opts = options || {};
    const progress = opts.progress || {
      requestedQty:Math.max(0,num(openPositionCloseChs.requestedQty) || 0),
      filledQty:Math.max(0,num(openPositionCloseChs.filledQty) || 0),
      remainingQty:Math.max(0,num(openPositionCloseChs.remainingQty) || 0),
      activePrice:String(openPositionCloseChs.price || "")
    };
    resetOpenPositionCloseChs();
    if(opts.closeUi) resetOpenPositionCloseUi();
    calculate();
    setStatus(openPositionCloseChsStatusText(progress,{prefix:reason || "Open Position CHS stopped",validText:opts.validText || ""}));
    if(opts.refresh !== false){
      try{ await readBinance({preserveSendPlan:true,source:"postSendRefresh"}); }catch(_e){}
    }
  }
  async function verifyOpenPositionCloseChsCancel(identity){
    const snapshot = await readOpenOrdersSnapshot();
    return {
      snapshot,
      remainingOrder:findOpenPositionCloseChsOrder(snapshot,identity)
    };
  }
  async function cancelOpenPositionCloseChs(reason,options){
    const opts = options || {};
    if(!openPositionCloseChs.active && !openPositionCloseChs.canceling){
      if(opts.closeUi) resetOpenPositionCloseUi();
      calculate();
      return;
    }
    if(openPositionCloseChs.canceling) return;
    openPositionCloseChs.canceling = true;
    clearOpenPositionCloseChsTimer();
    const identity = {
      symbol:String(openPositionCloseChs.symbol || currentSymbol()),
      orderId:openPositionCloseChs.orderId,
      clientOrderId:String(openPositionCloseChs.clientOrderId || "")
    };
    const progress = {
      requestedQty:Math.max(0,num(openPositionCloseChs.requestedQty) || 0),
      filledQty:Math.max(0,num(openPositionCloseChs.filledQty) || 0),
      remainingQty:Math.max(0,num(openPositionCloseChs.remainingQty) || 0),
      activePrice:String(openPositionCloseChs.price || "")
    };
    const remainingValidText = openPositionCloseChsTimerText(openPositionCloseChsRemainingValidMs());
    if(opts.closeUi) resetOpenPositionCloseUi();
    calculate();
    setStatus(reason || "Open Position CHS canceling...");
    let cancelFailed = false;
    try{
      await cancelOpenPositionCloseChsOrderOnly();
    }catch(_e){
      cancelFailed = true;
    }
    let verify = null;
    try{
      verify = await verifyOpenPositionCloseChsCancel(identity);
    }catch(_e){}
    if(cancelFailed || (verify && verify.remainingOrder)){
      resetOpenPositionCloseChs();
      if(opts.closeUi) resetOpenPositionCloseUi();
      calculate();
      setStatus("CHS cancel failed — order may still be active");
      try{ await readBinance({preserveSendPlan:true,source:"postSendRefresh"}); }catch(_e){}
      return;
    }
    await finishOpenPositionCloseChs(reason || "Open Position CHS cancelled",{progress,closeUi:!!opts.closeUi,refresh:true,validText:remainingValidText});
  }
  async function runOpenPositionCloseChsTick(){
    if(!openPositionCloseChs.active || openPositionCloseChs.canceling || openPositionCloseChs.checking) return;
    openPositionCloseChs.checking = true;
    try{
      const livePos = await signedPosition();
      const snapshot = await readOpenOrdersSnapshot();
      const openOrder = findOpenPositionCloseChsOrder(snapshot);
      const progress = openPositionCloseChsProgress(livePos,openOrder);
      openPositionCloseChs.filledQty = progress.filledQty;
      openPositionCloseChs.remainingQty = progress.remainingQty;
      if(progress.activePrice) openPositionCloseChs.price = String(progress.activePrice);
      const remainingValidMs = openPositionCloseChsRemainingValidMs();
      const validText = openPositionCloseChsTimerText(remainingValidMs);
      if(!livePos || !(num(livePos.qty) > 0) || progress.remainingQty < 0.001){
        if(openOrder){
          try{ await cancelOpenPositionCloseChsOrderOnly(); }catch(_e){}
        }
        await finishOpenPositionCloseChs("Open Position CHS filled",{progress,refresh:true,validText});
        return;
      }
      if(remainingValidMs != null && remainingValidMs <= 0){
        await cancelOpenPositionCloseChs("CHS expired — remaining qty not closed",{closeUi:false});
        return;
      }
      if(!openOrder){
        await finishOpenPositionCloseChs(progress.filledQty > 0 ? "Open Position CHS filled" : "Open Position CHS inactive",{progress,refresh:true,validText});
        return;
      }
      const desiredPrice = normalizedCloseChasePrice(openPositionCloseChs.side === "BUY" ? "SHORT" : "LONG",openPositionCloseChs.distTicks);
      const desiredQty = floorToLotStep(progress.remainingQty);
      if(!(desiredQty >= 0.001)){
        await finishOpenPositionCloseChs("Open Position CHS completed",{progress,refresh:true,validText});
        return;
      }
      if(!(num(desiredPrice) > 0)){
        setStatus(openPositionCloseChsStatusText(progress,{prefix:"Open Position CHS waiting for price",validText}));
        scheduleOpenPositionCloseChsTick();
        return;
      }
      const liveOrderPrice = normalizeLevelComparable(openOrder.price);
      const nextPrice = normalizeLevelComparable(desiredPrice);
      const liveOrderQty = floorToLotStep(num(openOrder.origQty) - num(openOrder.executedQty));
      if((nextPrice && liveOrderPrice !== nextPrice) || !sameQtyValue(liveOrderQty,desiredQty)){
        await cancelOpenPositionCloseChsOrderOnly();
        openPositionCloseChs.orderId = null;
        openPositionCloseChs.clientOrderId = "";
        await submitOpenPositionCloseChsLimit(livePos,desiredQty,desiredPrice);
        openPositionCloseChs.remainingQty = desiredQty;
        openPositionCloseChs.price = String(desiredPrice);
      }
      setStatus(openPositionCloseChsStatusText({
        requestedQty:Math.max(0,num(openPositionCloseChs.requestedQty) || 0),
        filledQty:Math.max(0,num(openPositionCloseChs.filledQty) || 0),
        remainingQty:Math.max(0,num(openPositionCloseChs.remainingQty) || 0),
        activePrice:String(openPositionCloseChs.price || "")
      },{validText}));
      scheduleOpenPositionCloseChsTick();
    }catch(e){
      await finishOpenPositionCloseChs("Open Position CHS failed: " + (e && e.message ? e.message : String(e)),{refresh:true});
    }finally{
      openPositionCloseChs.checking = false;
    }
  }
  function setOpenPositionClosePercentFromHit(hit,clientX){
    if(!hit || hit.controlType !== "open-position-close-slider") return false;
    const left = num(hit.sliderLeft);
    const right = num(hit.sliderRight);
    if(left == null || right == null || !(right > left)) return false;
    openPositionCloseUi.sliderLeft = left;
    openPositionCloseUi.sliderRight = right;
    return setOpenPositionClosePercentFromClientX(clientX);
  }
  function setOpenPositionClosePercentFromClientX(clientX){
    const left = num(openPositionCloseUi.sliderLeft);
    const right = num(openPositionCloseUi.sliderRight);
    if(left == null || right == null || !(right > left) || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const x = clamp(clientX - rect.left,left,right);
    const ratio = clamp((x - left) / (right - left),0,1);
    const nextPercent = Math.round(ratio * 100);
    if(openPositionCloseUi.percent === nextPercent) return false;
    openPositionCloseUi.percent = nextPercent;
    return true;
  }
  function hideOpenPositionClosePanel(){
    if(!openPositionCloseUi.open && !openPositionCloseUi.dragging) return false;
    openPositionCloseUi.open = false;
    openPositionCloseUi.dragging = false;
    openPositionCloseUi.sliderLeft = null;
    openPositionCloseUi.sliderRight = null;
    calculate();
    return true;
  }
  function handleOpenPositionCloseControlHit(hit,clientX){
    if(!hit || !isOpenPositionCloseControl(hit)) return false;
    if(hit.controlType === "open-position-close-mode-mkt" || hit.controlType === "open-position-close-mode-chs"){
      if(openPositionCloseChs.active){
        setStatus("Open Position CHS is active. Cancel CHS first.");
        return true;
      }
      openPositionCloseUi.mode = hit.controlType.endsWith("-chs") ? "CHS" : "MKT";
      calculate();
      return true;
    }
    if(hit.controlType === "open-position-close-chs-dist"){
      if(openPositionCloseChs.active){
        setStatus("Open Position CHS is active. Cancel CHS first.");
        return true;
      }
      cycleOpenPositionCloseChsDist();
      calculate();
      return true;
    }
    if(hit.controlType === "open-position-close-chs-valid"){
      if(openPositionCloseChs.active){
        setStatus("Open Position CHS is active. Cancel CHS first.");
        return true;
      }
      return true;
    }
    if(hit.controlType === "open-position-close-chs-cancel"){
      if(openPositionCloseChs.active) void cancelOpenPositionCloseChs("Open Position CHS cancelled.",{closeUi:false});
      return true;
    }
    if(hit.controlType === "open-position-close-slider"){
      if(openPositionCloseChs.active){
        setStatus("Open Position CHS is active. Cancel CHS first.");
        return true;
      }
      if(setOpenPositionClosePercentFromHit(hit,clientX)) calculate();
      openPositionCloseUi.dragging = true;
      return true;
    }
    if(hit.controlType === "open-position-close-confirm"){
      if(!openPositionCloseUi.open){
        primeOpenPositionClosePanelDefaults();
        calculate();
        return true;
      }
      void confirmOpenPositionCloseOrder();
      return true;
    }
    if(hit.controlType === "open-position-close-toggle"){
      if(openPositionCloseUi.open) hideOpenPositionClosePanel();
      else{
        primeOpenPositionClosePanelDefaults();
        calculate();
      }
      return true;
    }
    return true;
  }
  async function confirmOpenPositionCloseOrder(){
    if(openPositionCloseUi.sending){
      setStatus("Open Position close is already in progress.");
      return;
    }
    if(openPositionCloseChs.active){
      setStatus("Open Position CHS is already active. Use Cancel CHS.");
      return;
    }
    if(typeof hasKeys !== "function" || !hasKeys()){
      setStatus("Open Position close blocked. API keys required.");
      return;
    }
    openPositionCloseUi.sending = true;
    setStatus("Open Position close: reading live position...");
    try{
      const livePos = await signedPosition();
      if(!livePos || !(num(livePos.qty) > 0)){
        resetOpenPositionCloseUi();
        calculate();
        setStatus("Open Position close skipped: position is already flat.");
        return;
      }
      const preview = openPositionClosePreview(livePos);
      if(!preview.executable){
        setStatus(preview.belowMinimum
          ? "Open Position close blocked: selected lot rounds below 0.001."
          : "Open Position close blocked: selected lot is not executable.");
        return;
      }
      if(openPositionCloseMode() === "CHS"){
        const validOption = openPositionCloseChsValidOption(openPositionCloseUi.chsValidKey);
        const chasePrice = normalizedCloseChasePrice(preview.side,openPositionCloseUi.chsDistTicks);
        if(!(num(chasePrice) > 0)) throw new Error("CHS price is unavailable.");
        openPositionCloseChs.active = true;
        openPositionCloseChs.canceling = false;
        openPositionCloseChs.checking = false;
        openPositionCloseChs.symbol = String(currentSymbol());
        openPositionCloseChs.side = preview.side === "SHORT" ? "BUY" : "SELL";
        openPositionCloseChs.positionSide = toUpper(livePos.positionSide || "");
        openPositionCloseChs.requestedQty = preview.roundedQty;
        openPositionCloseChs.filledQty = 0;
        openPositionCloseChs.remainingQty = preview.roundedQty;
        openPositionCloseChs.startedPositionQty = Math.max(0,num(livePos.qty) || 0);
        openPositionCloseChs.distTicks = Math.max(0,Math.round(num(openPositionCloseUi.chsDistTicks) || 1));
        openPositionCloseChs.validKey = validOption.key;
        openPositionCloseChs.validMs = validOption.ms;
        openPositionCloseChs.startedAt = Date.now();
        openPositionCloseChs.expiresAt = validOption.ms == null ? 0 : (openPositionCloseChs.startedAt + validOption.ms);
        openPositionCloseUi.open = true;
        openPositionCloseUi.mode = "CHS";
        setStatus("Open Position CHS: sending " + openPositionCloseChs.side + " LIMIT " + fmtLot(preview.roundedQty) + "...");
        await submitOpenPositionCloseChsLimit(livePos,preview.roundedQty,chasePrice);
        calculate();
        setStatus(openPositionCloseChsStatusText({
          requestedQty:openPositionCloseChs.requestedQty,
          filledQty:0,
          remainingQty:openPositionCloseChs.remainingQty,
          activePrice:openPositionCloseChs.price
        }));
        scheduleOpenPositionCloseChsTick();
        return;
      }
      const send = {
        symbol:String(currentSymbol()),
        side:preview.side === "SHORT" ? "BUY" : "SELL",
        type:"MARKET",
        quantity:fmtLot(preview.roundedQty)
      };
      const ps = toUpper(livePos.positionSide || "");
      if(ps === "LONG" || ps === "SHORT") send.positionSide = ps;
      else send.reduceOnly = "true";
      setStatus("Open Position close: sending " + send.side + " MARKET " + send.quantity + "...");
      const resp = await signedOrderWrite("POST",send);
      if(!binanceWriteConfirmed(resp)) throw new Error("Unexpected Binance response.");
      resetOpenPositionCloseUi();
      calculate();
      setStatus("Open Position close sent: " + send.side + " MARKET " + send.quantity + ".");
      try{ await readBinance({preserveSendPlan:true,source:"postSendRefresh"}); }catch(_e){}
    }catch(e){
      setStatus("Open Position close failed: " + (e && e.message ? e.message : String(e)));
    }finally{
      openPositionCloseUi.sending = false;
    }
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
  function setMargin(node,value){
    if(!node) return;
    if(value && typeof value === "object" && value.unavailable){
      node.textContent = "Leverage unavailable";
      return;
    }
    const rawValue = value && typeof value === "object" ? value.value : value;
    const n = num(rawValue);
    node.textContent = n == null ? "-" : "$" + Math.abs(n).toFixed(2);
  }
  function setStatus(text){
    const el = q("calcModuleStatus");
    if(el){
      el.textContent = text || "";
      el.classList.remove("is-warning");
    }
  }
  function calculatorIsOpen(){
    const win = q("calcModuleWindow");
    return !!(win && !win.classList.contains("hidden"));
  }
  function setCalculatorExecutionNotice(message){
    if(calculatorIsOpen()){
      setStatus(message || "Calculator-related order execution detected.");
    }
  }
  function setCalculatorPositionSizeNotice(){
    const button = q("calcOpenBtn");
    if(!button) return;
    clearTimeout(positionSizeNoticeTimer);
    button.classList.add("calc-module-icon-notify");
    positionSizeNoticeTimer = setTimeout(() => {
      button.classList.remove("calc-module-icon-notify");
      positionSizeNoticeTimer = null;
    },2400);
  }
  function clearCalculatorExecutionNotice(){
    clearTimeout(positionSizeNoticeTimer);
    positionSizeNoticeTimer = null;
    q("calcOpenBtn")?.classList.remove("calc-module-icon-notify");
  }
  function openPositionChangeSignature(detail){
    const current = detail && detail.current;
    if(!current) return "flat";
    return [
      String(current.symbol || currentSymbol()),
      current.side === "SHORT" ? "SHORT" : "LONG",
      Number(current.qty || 0).toFixed(10),
      Number(current.avg || 0).toFixed(8)
    ].join(":");
  }
  function eventOpenPosition(detail){
    const current = detail && detail.current;
    if(!current || !(num(current.qty) > 0) || !(num(current.avg) > 0)) return null;
    return {
      side:current.side === "SHORT" ? "SHORT" : "LONG",
      qty:Math.abs(num(current.qty)),
      entry:num(current.avg),
      source:"openPositionChangeEvent"
    };
  }
  function reconcileOpenPositionRow(detail){
    const signature = openPositionChangeSignature(detail);
    if(signature === lastOpenPositionReconcileSignature) return;
    lastOpenPositionReconcileSignature = signature;
    const position = eventOpenPosition(detail);
    const container = q("calcModuleEntryRows");
    if(!container) return;
    const openRows = rows("calcModuleEntryRows").filter(isOpenPositionRow);
    if(position){
      setDirection(position.side);
      let row = openRows.shift() || null;
      openRows.forEach(extra => extra.remove());
      if(!row){
        row = addRow("calcModuleEntryRows",Math.round(position.entry),Number(position.qty).toFixed(3),{
          locked:true,
          openPosition:true,
          keepRemoveEnabled:true,
          preserveEmptyDefaults:true
        });
      }else{
        const level = levelInput(row);
        const lot = lotInput(row);
        if(level) level.value = String(Math.round(position.entry));
        if(lot) lot.value = Number(position.qty).toFixed(3);
        setOpenPositionRow(row,true);
        setRowLocked(row,true,{keepRemoveEnabled:true});
      }
      if(row && container.firstElementChild !== row) container.insertBefore(row,container.firstElementChild);
    }else{
      openRows.forEach(row => row.remove());
    }
    lastKnownLiveOpenPositionQty = position ? position.qty : 0;
    refreshLiveStopsValidity(position,true);
    refreshLiveExitsValidity(position,true);
    if(lastReadStateSnapshot){
      lastReadStateSnapshot.openPosition = position ? {
        side:position.side,
        qty:position.qty,
        entry:position.entry,
        positionSide:""
      } : null;
      lastReadStateSnapshot.direction = position ? position.side : null;
    }
    updateAutoSyncBaseline(position,{
      symbol:currentSymbol(),
      normalOrders:Array.isArray(window.v13OpenOrders21) ? window.v13OpenOrders21 : [],
      algoOrders:Array.isArray(window.v13OpenAlgoOrders21) ? window.v13OpenAlgoOrders21 : []
    });
    markSendPlanStale("Live open position changed after preflight.");
    calculate();
    if(detail && detail.sizeChanged) setCalculatorPositionSizeNotice();
  }
  function scheduleOpenPositionReconcile(detail){
    pendingOpenPositionChange = detail || null;
    clearTimeout(openPositionReconcileTimer);
    openPositionReconcileTimer = setTimeout(() => {
      openPositionReconcileTimer = null;
      const next = pendingOpenPositionChange;
      pendingOpenPositionChange = null;
      reconcileOpenPositionRow(next);
    },250);
  }
  function markBinanceRowNeedsReview(row,reason){
    if(!row) return;
    row.classList.add("calc-module-row-needs-review");
    row.dataset.needsReview = "1";
    row.title = reason || "Binance state changed while this row had local edits. Review before Send.";
  }
  function clearBinanceRowNeedsReview(row){
    if(!row) return;
    row.classList.remove("calc-module-row-needs-review");
    delete row.dataset.needsReview;
  }
  function rowBinanceKey(row){
    if(!row) return "";
    if(String(row.dataset && row.dataset.source || "") === "binance-limit"){
      const meta = row.__binanceLimitOrderMeta || (row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      return orderKeyFromMeta(meta);
    }
    if(String(row.dataset && row.dataset.source || "") === "binance-partial-stop"){
      const meta = row.__binancePartialStopMeta || (row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
      return partialStopKeyFromMeta(meta,meta && meta.side);
    }
    return "";
  }
  function snapshotEditedBinanceRows(){
    const active = document.activeElement;
    const preserved = [];
    ["calcModuleEntryRows","calcModuleExitRows","calcModulePartialStopRows"].forEach(containerId => {
      rows(containerId).forEach(row => {
        const key = rowBinanceKey(row);
        if(!key) return;
        const activelyEditing = !!(active && row.contains(active));
        if(!activelyEditing && !rowPendingSend(row)) return;
        preserved.push({
          containerId,
          key,
          level:String(levelInput(row)?.value || ""),
          lot:String(lotInput(row)?.value || ""),
          source:String(row.dataset && row.dataset.source || ""),
          limitMeta:row.__binanceLimitOrderMeta || (row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null),
          partialMeta:row.__binancePartialStopMeta || (row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null)
        });
        markBinanceRowNeedsReview(row,"Binance state changed while this row has local edits. Local values were preserved; review before Send.");
      });
    });
    return preserved;
  }
  function restoreEditedBinanceRows(preserved){
    (Array.isArray(preserved) ? preserved : []).forEach(item => {
      let row = rows(item.containerId).find(candidate => rowBinanceKey(candidate) === item.key);
      if(!row){
        row = addRow(item.containerId,item.level,item.lot,item.source === "binance-partial-stop"
          ? {source:"binance-partial-stop",meta:item.partialMeta}
          : {source:"binance-limit",meta:item.limitMeta});
      }
      const level = levelInput(row);
      const lot = lotInput(row);
      if(level) level.value = item.level;
      if(lot) lot.value = item.lot;
      markBinanceRowNeedsReview(row,"Binance state changed while this row has local edits. Local values were preserved; review before Send.");
    });
  }
  function scheduleBinanceStateReconcile(detail){
    const signature = String(detail && detail.signature || "");
    if(!signature || signature === lastBinanceStateEventSignature) return;
    lastBinanceStateEventSignature = signature;
    pendingBinanceStateChange = detail;
    markSendPlanStale("Binance state changed after preflight.");
    clearTimeout(binanceStateReconcileTimer);
    binanceStateReconcileTimer = setTimeout(async() => {
      binanceStateReconcileTimer = null;
      if(autoSyncRefreshing){
        pendingBinanceStateChange = null;
        return;
      }
      const change = pendingBinanceStateChange;
      pendingBinanceStateChange = null;
      autoSyncRefreshing = true;
      try{
        await readBinance({preserveSendPlan:true,autoSync:true,source:"binanceStateWatcher",binanceStateChange:change});
      }finally{
        autoSyncRefreshing = false;
      }
    },500);
  }
  function showStructuralWarning(){
    structuralWarningActive = true;
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
      return adapter.readFlag(SL_SEND_ENABLED_KEY,true);
    }
    try{
      const raw = localStorage.getItem(SL_SEND_ENABLED_KEY);
      return raw == null ? true : raw !== "0";
    }catch(_e){
      return true;
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
  function loadOrdersVisible(){
    try{
      const raw = localStorage.getItem(ORDERS_VISIBLE_KEY);
      if(raw == null) return true;
      return raw !== "0";
    }catch(_e){
      return true;
    }
  }
  function saveOrdersVisible(next){
    ordersVisible = !!next;
    try{ localStorage.setItem(ORDERS_VISIBLE_KEY,ordersVisible ? "1" : "0"); }catch(_e){}
    const btn = q("calcModuleOrdersToggle");
    if(btn){
      btn.classList.toggle("is-on",ordersVisible);
      btn.classList.toggle("is-off",!ordersVisible);
      btn.setAttribute("aria-pressed",ordersVisible ? "true" : "false");
    }
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }
  function hasLoadedCalculatorOrderState(){
    if(lastReadStateSnapshot) return true;
    if(currentStopAlgoMeta) return true;
    return ["calcModuleEntryRows","calcModuleExitRows","calcModulePartialStopRows"].some(containerId =>
      rows(containerId).some(row => String(row.dataset && row.dataset.source || "").startsWith("binance-"))
    );
  }
  async function toggleOrdersVisible(){
    const next = !ordersVisible;
    if(!next) saveOtfEnabled(false);
    saveOrdersVisible(next);
    if(!next || hasLoadedCalculatorOrderState()) return;
    try{
      await readBinance({preserveSendPlan:true,source:"ordersToggleLoad"});
    }catch(_e){}
  }
  function otfSelectionMatches(item){
    return !!(otfSelection && item && otfSelection.row === item.row && otfSelection.type === item.type);
  }
  function animateOtfSelection(){
    if(otfSelectionAnimation || !otfSelection) return;
    const animate = () => {
      if(!otfSelection){
        otfSelectionAnimation = 0;
        return;
      }
      try{ if(typeof draw === "function") draw(); }catch(_e){}
      otfSelectionAnimation = requestAnimationFrame(animate);
    };
    otfSelectionAnimation = requestAnimationFrame(animate);
  }
  function clearOtfSelection(){
    otfSelection = null;
    if(otfSelectionAnimation){
      cancelAnimationFrame(otfSelectionAnimation);
      otfSelectionAnimation = 0;
    }
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }
  function selectOtfBox(box){
    if(!box || !["exit","partial-sl","master-sl"].includes(box.type) || (box.type !== "master-sl" && !box.row)) return false;
    const pendingKey = otfBoxPendingKey(box);
    if(pendingKey && otfPendingOrderKeys.has(pendingKey)){
      setStatus("OTF update already pending for this order.");
      return false;
    }
    otfSelection = {
      row:box.row || null,
      type:box.type,
      orderKey:String(box.orderKey || ""),
      originalLevel:box.type === "master-sl" ? num(q("calcModuleStopLevel")?.value) : num(levelInput(box.row)?.value),
      selectedAt:Date.now(),
      sending:false
    };
    setStatus(box.type === "partial-sl"
      ? "OTF PSL selected. Drag to send on release."
      : box.type === "master-sl"
        ? "OTF Master SL selected. Drag to send on release."
        : "OTF Exit selected. Drag to send on release.");
    animateOtfSelection();
    return true;
  }
  function saveOtfEnabled(next){
    otfEnabled = !!next;
    const btn = q("calcModuleOtfToggle");
    if(btn){
      btn.classList.toggle("is-on",otfEnabled);
      btn.classList.toggle("is-off",!otfEnabled);
      btn.setAttribute("aria-pressed",otfEnabled ? "true" : "false");
    }
    if(!otfEnabled){
      clearOtfSelection();
      if(openPositionCloseChs.active) void cancelOpenPositionCloseChs("Open Position CHS cancelled: OTF turned OFF.",{closeUi:true});
      resetOpenPositionCloseUi();
    }
  }
  function toggleOtfEnabled(){
    if(!otfEnabled && !ordersVisible){
      saveOtfEnabled(false);
      setStatus("Turn Orders ON before enabling OTF.");
      return;
    }
    saveOtfEnabled(!otfEnabled);
  }
  function otfBoxPendingKey(box){
    if(!box) return "";
    const orderKey = String(box.orderKey || "").trim();
    if(orderKey) return orderKey;
    if(box.type === "master-sl") return "master-sl";
    const row = box.row;
    if(!row) return "";
    return String(row.dataset && (row.dataset.calcRowId || row.dataset.calcPartialStopRowId) || "");
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
    if(!suppressCalculatorOverlayDraw){
      try{ if(typeof draw === "function") draw(); }catch(_e){}
    }
  }
  function saveSlSendEnabled(next){
    slSendEnabled = !!next;
    const adapter = infra();
    if(adapter && typeof adapter.writeFlag === "function"){
      adapter.writeFlag(SL_SEND_ENABLED_KEY,slSendEnabled);
    }else{
      try{ localStorage.setItem(SL_SEND_ENABLED_KEY,slSendEnabled ? "1" : "0"); }catch(_e){}
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
  function calculatorWindowVisible(){
    try{
      const win = q("calcModuleWindow");
      return !!(win && !win.classList.contains("hidden"));
    }catch(_e){
      return false;
    }
  }
  function calcSlInteractive(){
    return calcLevelsInteractive();
  }
  function levelInput(row){ return row ? row.querySelector(".calc-module-level") : null; }
  function lotInput(row){ return row ? row.querySelector(".calc-module-lot") : null; }
  function isRowEmpty(row){
    const levelVal = String(levelInput(row)?.value || "").trim();
    const lotVal = String(lotInput(row)?.value || "").trim();
    return !levelVal && !lotVal;
  }
  function defaultLotForRow(){ return "0.000"; }
  function normalizeNonNegativeDecimalInput(input,maxDecimals){
    if(!input) return;
    const raw = String(input.value || "").trim();
    if(raw === "") return;
    if(!/^\d+(?:\.\d*)?$/.test(raw)){
      input.value = "";
      return;
    }
    const parts = raw.split(".");
    if(parts.length > 1 && parts[1].length > maxDecimals){
      input.value = parts[0] + "." + parts[1].slice(0,maxDecimals);
    }
    const n = num(input.value);
    if(n == null || n < 0) input.value = "";
  }
  function normalizeLotInput(input){
    if(!input) return;
    normalizeNonNegativeDecimalInput(input,3);
    if(String(input.value || "").trim() === "") return;
    const n = num(input.value);
    if(n == null || n < 0) input.value = "0.000";
  }
  function normalizeLevelInput(input){
    normalizeNonNegativeDecimalInput(input,8);
  }
  function validClipboardPriceLevel(text){
    const cleaned = String(text == null ? "" : text).trim().replace(/[$,\s]/g,"");
    if(!cleaned || !/^\d+(?:\.\d+)?$/.test(cleaned)) return "";
    const value = num(cleaned);
    return value != null && value > 0 ? String(Number(value.toFixed(8))) : "";
  }
  async function clipboardPriceLevel(){
    try{
      if(!navigator.clipboard || typeof navigator.clipboard.readText !== "function") return "";
      if(!navigator.permissions || typeof navigator.permissions.query !== "function") return "";
      const permission = await navigator.permissions.query({name:"clipboard-read"});
      if(!permission || permission.state !== "granted") return "";
      return validClipboardPriceLevel(await navigator.clipboard.readText());
    }catch(_e){
      return "";
    }
  }

  function ensureButton(){
    const account = q("mBalance") && q("mBalance").closest(".metric");
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
    if(account && account.parentNode){
      account.insertAdjacentElement("beforebegin",wrap);
    }else{
      document.querySelector(".metrics")?.appendChild(wrap);
    }
    return btn;
  }
  function alignOrdersOtfButtons(){
    const btn = q("calcModuleOrdersToggle");
    const otfBtn = q("calcModuleOtfToggle");
    const wrap = canvas && canvas.parentElement;
    if(!btn || !otfBtn || !wrap) return;
    try{
      const wrapRect = wrap.getBoundingClientRect();
      const stackButtons = [...document.querySelectorAll(".v33-ma-stack-box")].filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const rightmostStack = stackButtons.reduce((best,node) =>
        !best || node.getBoundingClientRect().right > best.getBoundingClientRect().right ? node : best
      ,null);
      const stackRight = rightmostStack ? rightmostStack.getBoundingClientRect().right - wrapRect.left : null;
      const ordersRight = stackRight == null
        ? (typeof RIGHT_AXIS === "number" ? RIGHT_AXIS : 84) + 8
        : Math.max(8,wrapRect.width - stackRight);
      btn.style.right = ordersRight + "px";
      otfBtn.style.width = btn.offsetWidth + "px";
      otfBtn.style.right = (ordersRight + btn.offsetWidth + 6) + "px";
    }catch(_e){}
  }
  function ensureOrdersToggle(){
    if(!canvas || !canvas.parentNode) return null;
    let wrap = canvas.parentElement;
    if(!wrap) return null;
    if(!wrap.classList.contains("chart-wrap")){
      const nextWrap = document.createElement("div");
      nextWrap.className = "chart-wrap";
      canvas.parentNode.insertBefore(nextWrap,canvas);
      nextWrap.appendChild(canvas);
      wrap = nextWrap;
    }
    let btn = q("calcModuleOrdersToggle");
    if(!btn){
      btn = document.createElement("button");
      btn.id = "calcModuleOrdersToggle";
      btn.type = "button";
      btn.className = "calc-module-orders-toggle";
      btn.textContent = "Orders";
      btn.title = "Orders";
      btn.setAttribute("aria-label","Orders");
      wrap.appendChild(btn);
    }
    btn.onclick = toggleOrdersVisible;
    saveOrdersVisible(ordersVisible);
    let otfBtn = q("calcModuleOtfToggle");
    if(!otfBtn){
      otfBtn = document.createElement("button");
      otfBtn.id = "calcModuleOtfToggle";
      otfBtn.type = "button";
      otfBtn.className = "calc-module-orders-toggle calc-module-otf-toggle";
      otfBtn.textContent = "OTF";
      otfBtn.title = "On-the-fly chart order adjustment";
      otfBtn.setAttribute("aria-label","OTF");
      wrap.appendChild(otfBtn);
    }
    alignOrdersOtfButtons();
    otfBtn.onclick = toggleOtfEnabled;
    saveOtfEnabled(otfEnabled);
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
          <button id="calcModuleCollapse" type="button" title="Collapse">-</button>
          <button id="calcModuleClose" type="button" title="Close">x</button>
        </div>
      </div>
      <div class="calc-module-body" id="calcModuleBody">
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle calc-module-table-title" id="calcModuleEntriesTitle">
            <span class="calc-module-section-main">Entries <button class="calc-module-dir is-long" id="calcModuleDir" type="button" title="Click to switch Long/Short">LONG</button><span class="calc-module-title-sum" id="calcModuleEntrySum">0.000</span></span>
            <span class="calc-module-section-actions"><button class="calc-module-add calc-module-header-add" id="calcModuleAddEntry" type="button">Add Entry</button><span class="calc-module-collapsed-summary"><span id="calcModuleCollapsedEntryAvg">-</span><span id="calcModuleCollapsedEntryFloating">-</span></span><span class="calc-module-caret" id="calcModuleEntriesCaret">▾</span></span>
          </div>
          <div id="calcModuleEntriesBody">
            <div class="calc-module-row-head"><div>#</div><div>Level</div><div>Lot</div><div>Margin</div><div>x</div></div>
            <div id="calcModuleEntryRows"></div>
          </div>
        </div>
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle calc-module-table-title" id="calcModuleStopsTitle">
            <span class="calc-module-section-main">Stops <span class="calc-module-title-sum" id="calcModuleStopSum">0.000/0.000</span></span>
            <span class="calc-module-section-actions"><button class="calc-module-add calc-module-header-add" id="calcModuleAddPartialStop" type="button">Add Partial Stop</button><span class="calc-module-collapsed-summary"><span id="calcModuleCollapsedStopRisk">-</span></span><span class="calc-module-caret" id="calcModuleStopsCaret">▾</span></span>
          </div>
          <div id="calcModuleStopsBody">
            <div class="calc-module-stop">
              <label for="calcModuleStopLevel">Master SL</label><input id="calcModuleStopLevel" type="number" inputmode="decimal" step="10" min="0" placeholder="Level">
              <label for="calcModuleStopDistance">SL Δ</label><input id="calcModuleStopDistance" type="number" inputmode="decimal" step="10" min="0" placeholder="Distance">
              <button class="calc-module-remove calc-module-stop-delete" id="calcModuleDeleteStop" type="button" title="Mark Binance Master SL for cancellation">x</button>
              <span class="calc-module-stop-pl" id="calcModuleStopPl">-</span>
            </div>
            <div class="calc-module-psl-head calc-module-partial-stop-head"><div>#</div><div>Level</div><div>Lot</div><div>PL</div><div>x</div></div>
            <div id="calcModulePartialStopRows"></div>
          </div>
        </div>
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle calc-module-table-title" id="calcModuleExitsTitle">
            <span class="calc-module-section-main">Exits <span class="calc-module-title-sum" id="calcModuleExitSum">0.000/0.000</span></span>
            <span class="calc-module-section-actions"><button class="calc-module-add calc-module-header-add" id="calcModuleAddExit" type="button">Add Exit</button><span class="calc-module-collapsed-summary"><span id="calcModuleCollapsedExitPl">-</span></span><span class="calc-module-caret" id="calcModuleExitsCaret">▾</span></span>
          </div>
          <div id="calcModuleExitsBody">
            <div class="calc-module-exit-head"><div>#</div><div>Level</div><div>Lot</div><div>PL</div><div>x</div></div>
            <div id="calcModuleExitRows"></div>
          </div>
        </div>
        <div class="calc-module-panel">
          <div class="calc-module-section-title is-toggle calc-module-table-title" id="calcModuleSummaryTitle">
            <span class="calc-module-section-main">Summary</span>
            <span class="calc-module-section-actions"><span class="calc-module-caret" id="calcModuleSummaryCaret">▾</span></span>
          </div>
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
          </div>
          <div class="calc-module-express-row"><label class="calc-module-express-toggle" id="calcModuleExpressToggleWrap" title="Express Mode skips preflight/review and executes immediately"><input id="calcModuleExpressToggle" type="checkbox" aria-label="Execute now confirm later"><span>Execute now confirm later</span></label></div>
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
    })).filter(r => r.level != null && r.lot != null && r.lot >= 0.001);
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
  function readPartialStops(){
    return readRows("calcModulePartialStopRows");
  }
  function totalPartialStopLots(){
    return rows("calcModulePartialStopRows").reduce((total,row) => {
      const lot = num(lotInput(row)?.value);
      return total + (lot != null && lot > 0 ? lot : 0);
    },0);
  }
  function totalExitLots(){
    return rows("calcModuleExitRows").reduce((total,row) => {
      const lot = num(lotInput(row)?.value);
      return total + (lot != null && lot > 0 ? lot : 0);
    },0);
  }
  function currentPositionBoxesForCalculator(){
    if(typeof openPositionBoxes === "undefined" || !Array.isArray(openPositionBoxes)) return [];
    return openPositionBoxes.filter(box => box && (!box.symbol || box.symbol === currentSymbol()));
  }
  function liveCachedOpenPositionQty(){
    return currentPositionBoxesForCalculator().reduce((total,box) => {
      const qty = Math.abs(num(box && box.qty) || 0);
      return total + qty;
    },0);
  }
  function clearPartialStopLotInvalidState(){
    rows("calcModulePartialStopRows").forEach(row => {
      const input = lotInput(row);
      if(!input) return;
      input.classList.remove("calc-module-psl-lot-invalid");
      delete input.dataset.pslLotInvalid;
      delete row.dataset.pslLotInvalid;
    });
  }
  function clearExitLotInvalidState(){
    rows("calcModuleExitRows").forEach(row => {
      const input = lotInput(row);
      if(!input) return;
      input.classList.remove("calc-module-exit-lot-invalid");
      delete input.dataset.exitLotInvalid;
      delete row.dataset.exitLotInvalid;
    });
  }
  function refreshLiveStopsValidity(livePos,liveStateKnown=false){
    const liveQty = num(livePos && livePos.qty);
    if(liveStateKnown) lastKnownLiveOpenPositionQty = liveQty == null ? 0 : Math.max(0,liveQty);
    const cachedQty = liveCachedOpenPositionQty();
    const qty = lastKnownLiveOpenPositionQty == null ? cachedQty : lastKnownLiveOpenPositionQty;
    const invalid = totalPartialStopLots() > qty + 1e-9;
    clearPartialStopLotInvalidState();
    if(invalid && lastEditedPartialStopLotInput && lastEditedPartialStopLotInput.isConnected){
      lastEditedPartialStopLotInput.classList.add("calc-module-psl-lot-invalid");
      lastEditedPartialStopLotInput.dataset.pslLotInvalid = "1";
      const row = lastEditedPartialStopLotInput.closest(".calc-module-row");
      if(row) row.dataset.pslLotInvalid = "1";
    }
    return !invalid;
  }
  function refreshLiveExitsValidity(livePos,liveStateKnown=false){
    const liveQty = num(livePos && livePos.qty);
    if(liveStateKnown) lastKnownLiveOpenPositionQty = liveQty == null ? 0 : Math.max(0,liveQty);
    const cachedQty = liveCachedOpenPositionQty();
    const qty = lastKnownLiveOpenPositionQty == null ? cachedQty : lastKnownLiveOpenPositionQty;
    const invalid = totalExitLots() > qty + 1e-9;
    clearExitLotInvalidState();
    if(invalid && lastEditedExitLotInput && lastEditedExitLotInput.isConnected){
      lastEditedExitLotInput.classList.add("calc-module-exit-lot-invalid");
      lastEditedExitLotInput.dataset.exitLotInvalid = "1";
      const row = lastEditedExitLotInput.closest(".calc-module-row");
      if(row) row.dataset.exitLotInvalid = "1";
    }
    return !invalid;
  }
  function currentFloatingPl(){
    const price = currentPriceReference();
    if(price == null || typeof openBoxFloating !== "function") return null;
    let total = 0;
    let found = false;
    currentPositionBoxesForCalculator().forEach(box => {
      const value = num(openBoxFloating(box,price));
      if(value == null) return;
      total += value;
      found = true;
    });
    return found ? total : null;
  }
  function currentCalculatorLeverage(){
    const box = currentPositionBoxesForCalculator().find(item => num(item && item.leverage) > 0);
    if(box) return num(box.leverage);
    const settings = window.BT001SymbolTradingSettings && typeof window.BT001SymbolTradingSettings.getCached === "function"
      ? window.BT001SymbolTradingSettings.getCached(currentSymbol())
      : null;
    return num(settings && settings.leverage);
  }
  function ensureSymbolSettingsLoaded(){
    const helper = window.BT001SymbolTradingSettings;
    if(!helper || typeof helper.get !== "function") return;
    const symbol = currentSymbol();
    if(!symbol || lastSettingsRequestedSymbol === symbol) return;
    lastSettingsRequestedSymbol = symbol;
    Promise.resolve(helper.get(symbol))
      .catch(() => null)
      .finally(() => {
        lastSettingsRequestedSymbol = "";
        try{ calculate(); }catch(_e){}
      });
  }
  function entryRowMargin(row,level,lot){
    if(isOpenPositionRow(row)){
      const margins = currentPositionBoxesForCalculator()
        .map(box => typeof openBoxMargin === "function" ? num(openBoxMargin(box)) : null)
        .filter(value => value != null && value > 0);
      if(margins.length) return {value:margins.reduce((sum,value) => sum + value,0),unavailable:false};
    }
    const leverage = currentCalculatorLeverage();
    if(leverage != null && leverage > 0 && level != null && lot != null){
      return {value:level * lot / leverage,unavailable:false};
    }
    if(level != null && lot != null && !isOpenPositionRow(row)){
      ensureSymbolSettingsLoaded();
      return {value:null,unavailable:true};
    }
    return {value:null,unavailable:false};
  }
  function isPartialStopBeforeMaster(side,partialLevel,masterLevel){
    const p = num(partialLevel);
    const m = num(masterLevel);
    if(p == null || m == null) return false;
    return side === "SHORT" ? p < m : p > m;
  }
  function calculateStopMath(entry,masterLevel,partialStops){
    const entryState = entry || readEntry();
    const entryAvg = entryState.avg;
    const entryQty = entryState.qty || 0;
    const master = num(masterLevel);
    const {domain} = getArchitectureServices();
    const estimate = domain && typeof domain.estimatePl === "function"
      ? domain.estimatePl
      : (side,en,ex,qty) => en == null || ex == null || qty == null
        ? null
        : side === "SHORT"
          ? (en - ex) * qty
          : (ex - en) * qty;
    const rowsList = Array.isArray(partialStops) ? partialStops : readPartialStops();
    let validPartialQty = 0;
    let totalPartialQty = 0;
    let partialPl = 0;
    let partialPlCount = 0;
    const rowsWithPl = rowsList.map((row,index) => {
      const beforeMaster = master != null && isPartialStopBeforeMaster(direction,row.level,master);
      const pl = entryAvg == null ? null : estimate(direction,entryAvg,row.level,row.lot);
      totalPartialQty += row.lot || 0;
      if(beforeMaster && pl != null){
        validPartialQty += row.lot || 0;
        partialPl += pl;
        partialPlCount++;
      }
      return {
        ...row,
        index,
        beforeMaster,
        pl
      };
    });
    const qtyExceeds = totalPartialQty > entryQty + 1e-9;
    const remainingQty = qtyExceeds ? null : Math.max(0,entryQty - validPartialQty);
    const masterPl = entryAvg != null && master != null && entryQty > 0 && remainingQty != null
      ? estimate(direction,entryAvg,master,remainingQty)
      : null;
    const total = masterPl == null && !partialPlCount ? null : partialPl + (masterPl == null ? 0 : masterPl);
    return {
      entryQty,
      entryAvg,
      masterLevel:master,
      partialStops:rowsWithPl,
      totalPartialQty,
      validPartialQty,
      remainingQty,
      masterPl,
      total,
      qtyExceeds
    };
  }
  function visualLevelDistanceSort(list,referenceLevel){
    const ref = num(referenceLevel);
    const dir = direction === "SHORT" ? "SHORT" : "LONG";
    return (Array.isArray(list) ? list.slice() : []).sort((a,b) => {
      const al = num(a && a.level);
      const bl = num(b && b.level);
      if(al == null && bl == null) return 0;
      if(al == null) return 1;
      if(bl == null) return -1;
      if(ref != null){
        const ad = Math.abs(al - ref);
        const bd = Math.abs(bl - ref);
        if(!approxEqual(ad,bd,1e-9)) return ad - bd;
      }
      return dir === "SHORT" ? al - bl : bl - al;
    });
  }
  function currentPriceReference(){
    const candidates = [
      lastMarkPrice,
      candles && candles.length ? candles[candles.length - 1].close : null,
      mClose && mClose.textContent ? String(mClose.textContent).replace(/[$,]/g,"") : null
    ];
    for(const value of candidates){
      const n = num(value);
      if(n != null && n > 0) return n;
    }
    return null;
  }
  function sortContainerRowsByLevel(containerId,referenceLevel){
    const container = q(containerId);
    if(!container) return;
    const sorted = visualLevelDistanceSort(rows(containerId).map((row,index) => ({
      row,
      level:num(levelInput(row)?.value),
      index
    })),referenceLevel);
    sorted.forEach(item => {
      if(item && item.row) container.appendChild(item.row);
    });
    refreshEntryRowNumbers();
    refreshPartialStopRowNumbers();
  }
  function sortCalculatorRowsForRead(){
    const ref = readEntry().avg;
    sortContainerRowsByLevel("calcModuleEntryRows",ref);
    sortContainerRowsByLevel("calcModuleExitRows",ref);
    sortContainerRowsByLevel("calcModulePartialStopRows",currentPriceReference());
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
    const exits = readRows("calcModuleExitRows");
    let exitQty = 0;
    let reward = 0;

    exits.forEach((row) => {
      exitQty += row.lot;
      const pl = domain && typeof domain.estimatePl === "function"
        ? domain.estimatePl(direction,entry.avg,row.level,row.lot)
        : entry.avg == null
          ? null
          : direction === "LONG"
            ? (row.level - entry.avg) * row.lot
            : (entry.avg - row.level) * row.lot;
      if(pl != null) reward += pl;
      setMoney(row.row && row.row.querySelector(".calc-module-exit-row-pl"),pl);
    });
    rows("calcModuleExitRows").forEach(row => {
      if(!exits.some(item => item.row === row)) setMoney(row.querySelector(".calc-module-exit-row-pl"),null);
    });
    refreshExitRowNumbers(entry.avg);

    syncStopForAvg(entry.avg);
    const stop = num(q("calcModuleStopLevel")?.value);
    const partialStops = readPartialStops();
    const stopMath = calculateStopMath(entry,stop,partialStops);
    stopMath.partialStops.forEach(item => {
      const plNode = item.row && item.row.querySelector(".calc-module-psl-pl");
      if(plNode) setMoney(plNode,item.pl);
    });
    const stopPlNode = q("calcModuleStopPl");
    if(stopPlNode){
      stopPlNode.textContent = fmtMoney(stopMath.total);
      stopPlNode.style.color = moneyColor(stopMath.total);
    }
    const summary = app && typeof app.buildSummary === "function"
      ? app.buildSummary(domain || {},direction,entry.rows,exits,stop)
      : null;
    const risk = stopMath.total;
    const rewardValue = summary ? summary.reward : (exits.length ? reward : null);

    q("calcModuleEntrySum").textContent = fmtLot(entry.qty || 0);
    const coverageQty = lastKnownLiveOpenPositionQty == null ? liveCachedOpenPositionQty() : lastKnownLiveOpenPositionQty;
    q("calcModuleStopSum").textContent = fmtLot(totalPartialStopLots()) + "/" + fmtLot(coverageQty || 0);
    q("calcModuleExitSum").textContent = fmtLot(exitQty || 0) + "/" + fmtLot(coverageQty || 0);
    q("calcModuleExitSum").classList.toggle("calc-module-underfilled",coverageQty > 0 && exitQty < coverageQty);
    q("calcModuleEntrySize").textContent = entry.qty > 0 ? fmtLot(entry.qty) : "-";
    q("calcModuleAvgEntry").textContent = entry.avg != null ? fmtPrice(entry.avg) : "-";
    q("calcModuleCollapsedEntryAvg").textContent = entry.avg != null ? fmtPrice(entry.avg) : "-";
    setMoney(q("calcModuleCollapsedEntryFloating"),currentFloatingPl());
    setMoney(q("calcModuleCollapsedStopRisk"),risk);
    setMoney(q("calcModuleCollapsedExitPl"),rewardValue);
    refreshLiveStopsValidity(null);
    refreshLiveExitsValidity(null);
    rows("calcModuleEntryRows").forEach(row => {
      setMargin(
        row.querySelector(".calc-module-entry-margin"),
        entryRowMargin(row,num(levelInput(row)?.value),num(lotInput(row)?.value))
      );
    });
    refreshEntryRowNumbers();
    setMoney(q("calcModuleRisk"),risk);
    setMoney(q("calcModuleReward"),rewardValue);
    refreshPendingSendVisualState();
    if(!suppressCalculatorOverlayDraw){
      try{ if(typeof draw === "function") draw(); }catch(_e){}
    }
  }
  function clearBinanceMetaOnRow(row){
    if(!row) return;
    const rowId = row.dataset.calcRowId;
    if(rowId) binanceLimitRowMetaByRowId.delete(rowId);
    delete row.dataset.calcRowId;
    delete row.dataset.source;
    row.classList.remove("calc-module-row-binance-limit");
    row.classList.remove("calc-module-row-binance-entry");
    row.classList.remove("calc-module-row-manual-entry");
    row.classList.remove("calc-module-row-open-position");
    row.removeAttribute("title");
    row.dataset.openPosition = "0";
    row.__binanceLimitOrderMeta = null;
    lotInput(row)?.classList.remove("calc-module-lot-binance-limit");
    levelInput(row)?.classList.remove("calc-module-level-binance-limit");
    lotInput(row)?.classList.remove("calc-module-lot-manual-entry");
    levelInput(row)?.classList.remove("calc-module-level-manual-entry");
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl) lvl.title = "";
    if(lot) lot.title = "";
  }
  function clearPartialStopMetaOnRow(row){
    if(!row) return;
    const rowId = row.dataset.calcPartialStopRowId;
    if(rowId) binancePartialStopMetaByRowId.delete(rowId);
    delete row.dataset.calcPartialStopRowId;
    if(row.dataset.source === "binance-partial-stop") delete row.dataset.source;
    row.classList.remove("calc-module-row-binance-partial-stop");
    row.__binancePartialStopMeta = null;
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl) lvl.title = "";
    if(lot) lot.title = "";
  }
  function isRowMarkedForDeletion(row){
    return !!(row && row.dataset && row.dataset.markedForDeletion === "1");
  }
  function setRowMarkedForDeletion(row,marked){
    if(!row) return;
    const on = !!marked;
    row.dataset.markedForDeletion = on ? "1" : "0";
    row.classList.toggle("calc-module-row-marked-delete",on);
    const remove = row.querySelector(".calc-module-remove");
    if(remove) remove.title = on ? "Unmark Binance cancellation" : "Mark Binance order for cancellation";
    markSendPlanStale(on ? "Binance-backed row marked for deletion after preflight." : "Binance-backed deletion unmarked after preflight.");
    calculate();
  }
  function isStagedDeletionEligible(row){
    if(!row || isOpenPositionRow(row)) return false;
    const source = String(row.dataset && row.dataset.source || "");
    const containerId = row.parentElement && row.parentElement.id;
    return (containerId === "calcModuleEntryRows" && source === "binance-limit")
      || (containerId === "calcModulePartialStopRows" && source === "binance-partial-stop");
  }
  function isOpenPositionRow(row){
    return !!(row && row.dataset && row.dataset.openPosition === "1");
  }
  function snapshotManualRows(containerId){
    return rows(containerId)
      .filter(row => row && !String(row.dataset.source || "").startsWith("binance-") && !isOpenPositionRow(row) && !isRowEmpty(row))
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
    refreshEntryRowVisualState(row);
  }
  function refreshEntryRowVisualState(row){
    if(!row) return;
    const inEntryRows = !!(row.parentElement && row.parentElement.id === "calcModuleEntryRows");
    const open = isOpenPositionRow(row);
    const binanceExisting = !open && inEntryRows && String(row.dataset.source || "") === "binance-limit";
    const manualEntry = !open && inEntryRows && !binanceExisting && !isRowEmpty(row);
    const lvl = levelInput(row);
    const lot = lotInput(row);
    row.classList.toggle("calc-module-row-binance-entry",binanceExisting);
    row.classList.toggle("calc-module-row-manual-entry",manualEntry);
    if(lvl){
      lvl.classList.toggle("calc-module-level-binance-limit",binanceExisting);
      lvl.classList.toggle("calc-module-level-manual-entry",manualEntry);
      if(!open && !binanceExisting && !manualEntry) lvl.title = "";
      else if(binanceExisting) lvl.title = "Binance existing entry";
      else if(manualEntry) lvl.title = "Manual unsent entry";
    }
    if(lot){
      lot.classList.toggle("calc-module-lot-binance-limit",binanceExisting);
      lot.classList.toggle("calc-module-lot-manual-entry",manualEntry);
      if(!open && !binanceExisting && !manualEntry) lot.title = "";
      else if(binanceExisting) lot.title = "Binance existing entry";
      else if(manualEntry) lot.title = "Manual unsent entry";
    }
  }
  function rowPendingSend(row){
    if(!row || isOpenPositionRow(row) || isRowEmpty(row)) return false;
    const source = String(row.dataset && row.dataset.source || "");
    const level = num(levelInput(row)?.value);
    const lot = num(lotInput(row)?.value);
    if(source === "binance-limit"){
      const meta = row.__binanceLimitOrderMeta || (row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      return !meta || !sameLevelValue(level,meta.price) || !sameQtyValue(lot,meta.origQty);
    }
    if(source === "binance-partial-stop"){
      const meta = row.__binancePartialStopMeta || (row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
      return !meta || !sameLevelValue(level,meta.triggerPrice) || !sameQtyValue(lot,meta.origQty);
    }
    return true;
  }
  function masterStopPendingSend(){
    const level = num(q("calcModuleStopLevel")?.value);
    if(masterStopMarkedForDeletion) return true;
    if(level == null || level <= 0) return false;
    if(currentStopAlgoMeta) return !sameLevelValue(level,currentStopAlgoMeta.triggerPrice);
    return !!masterStopDraftDirty;
  }
  function normalizeLevelComparable(value){
    const helper = window.BT001SymbolTradingSettings;
    const settings = helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
    return helper && typeof helper.normalizePrice === "function"
      ? helper.normalizePrice(value,settings)
      : (num(value) == null ? null : Number(num(value).toFixed(8)).toFixed(8));
  }
  function normalizeQtyComparable(value){
    const helper = window.BT001SymbolTradingSettings;
    const settings = helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
    return helper && typeof helper.normalizeQty === "function"
      ? helper.normalizeQty(value,settings)
      : (num(value) == null ? null : Number(num(value).toFixed(3)).toFixed(3));
  }
  function sameLevelValue(a,b){
    const left = normalizeLevelComparable(a);
    const right = normalizeLevelComparable(b);
    return left != null && right != null && left === right;
  }
  function sameQtyValue(a,b){
    const left = normalizeQtyComparable(a);
    const right = normalizeQtyComparable(b);
    return left != null && right != null && left === right;
  }
  function hasLocalMasterStopDraft(){
    const level = num(q("calcModuleStopLevel")?.value);
    return !currentStopAlgoMeta && !!masterStopDraftDirty && level != null && level > 0;
  }
  function shouldIncludeMasterStopInPlan(){
    if(masterStopMarkedForDeletion && !!currentStopAlgoMeta) return true;
    if(!slSendEnabled) return false;
    if(hasLocalMasterStopDraft()) return true;
    if(currentStopAlgoMeta){
      const level = num(q("calcModuleStopLevel")?.value);
      if(level == null || level <= 0) return false;
      return !sameLevelValue(level,currentStopAlgoMeta.triggerPrice);
    }
    return false;
  }
  function isMasterStopMarkedForDeletion(){
    return masterStopMarkedForDeletion;
  }
  function refreshMasterStopDeleteVisualState(){
    const stopLevel = q("calcModuleStopLevel");
    const stopDistance = q("calcModuleStopDistance");
    const deleteBtn = q("calcModuleDeleteStop");
    const binanceBacked = !!currentStopAlgoMeta;
    if(stopLevel){
      stopLevel.classList.toggle("calc-module-input-marked-delete",masterStopMarkedForDeletion);
      stopLevel.title = masterStopMarkedForDeletion
        ? "Binance Master SL marked for cancellation on Confirm Send"
        : binanceBacked
          ? "Binance Master SL"
          : "";
    }
    if(stopDistance) stopDistance.classList.toggle("calc-module-input-marked-delete",masterStopMarkedForDeletion);
    if(deleteBtn){
      deleteBtn.classList.toggle("is-marked",masterStopMarkedForDeletion);
      deleteBtn.textContent = "x";
      deleteBtn.title = masterStopMarkedForDeletion
        ? "Unmark Binance Master SL cancellation"
        : "Mark Binance Master SL for cancellation";
      deleteBtn.disabled = !binanceBacked;
    }
  }
  function setMasterStopMarkedForDeletion(marked,options){
    const opts = options || {};
    masterStopMarkedForDeletion = !!marked && !!currentStopAlgoMeta;
    refreshMasterStopDeleteVisualState();
    if(opts.skipStale) return;
    markSendPlanStale(masterStopMarkedForDeletion ? "Binance-backed Master SL marked for deletion after preflight." : "Binance-backed Master SL deletion unmarked after preflight.");
    calculate();
  }
  function clearMasterStopBinanceState(options){
    const opts = options || {};
    currentStopAlgoMeta = null;
    setMasterStopMarkedForDeletion(false,{skipStale:true});
    if(!opts.preserveDraftFlag) masterStopDraftDirty = false;
    if(!opts.preserveLocalDraft){
      const stopLevel = q("calcModuleStopLevel");
      const stopDistance = q("calcModuleStopDistance");
      if(stopLevel) stopLevel.value = "";
      if(stopDistance) stopDistance.value = "";
    }
    refreshMasterStopDeleteVisualState();
  }
  function refreshPendingSendVisualState(){
    ["calcModuleEntryRows","calcModuleExitRows","calcModulePartialStopRows"].forEach(containerId => {
      rows(containerId).forEach(row => {
        row.classList.toggle("calc-module-row-pending-send",rowPendingSend(row));
        refreshModifiedBinanceFieldState(row);
      });
    });
    q("calcModuleStopLevel")?.classList.toggle("calc-module-input-pending-send",masterStopPendingSend());
    refreshMasterStopDeleteVisualState();
  }
  function refreshModifiedBinanceFieldState(row){
    if(!row) return;
    const containerId = row.parentElement && row.parentElement.id;
    const isExit = containerId === "calcModuleExitRows";
    const isPartialStop = containerId === "calcModulePartialStopRows";
    const source = String(row.dataset && row.dataset.source || "");
    const meta = isExit
      ? (row.__binanceLimitOrderMeta || (row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null))
      : isPartialStop
        ? (row.__binancePartialStopMeta || (row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null))
        : null;
    const binanceBacked = (isExit && source === "binance-limit") || (isPartialStop && source === "binance-partial-stop");
    const originalLevel = isExit ? num(meta && meta.price) : num(meta && meta.triggerPrice);
    const originalLot = num(meta && meta.origQty);
    levelInput(row)?.classList.toggle("calc-module-input-pending-send",!!(binanceBacked && meta && !sameLevelValue(num(levelInput(row)?.value),originalLevel)));
    lotInput(row)?.classList.toggle("calc-module-input-pending-send",!!(binanceBacked && meta && !sameQtyValue(num(lotInput(row)?.value),originalLot)));
  }
  function applyRowSourceAndMeta(row,opts){
    if(!row) return row;
    const source = opts && opts.source ? String(opts.source) : "";
    if(source === "binance-limit"){
      row.dataset.source = source;
      row.classList.add("calc-module-row-binance-limit");
      row.title = "Binance LIMIT order";
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
    refreshEntryRowVisualState(row);
    refreshPendingSendVisualState();
    return row;
  }
  function applyPartialStopSourceAndMeta(row,opts){
    if(!row || !opts || opts.source !== "binance-partial-stop") return row;
    row.dataset.source = "binance-partial-stop";
    row.classList.add("calc-module-row-binance-partial-stop");
    row.title = "Binance Partial Stop";
    const rowId = String(opts.rowId || ("binance_psl_" + (++binancePartialStopRowSeq)));
    row.dataset.calcPartialStopRowId = rowId;
    if(opts.meta){
      row.__binancePartialStopMeta = opts.meta;
      binancePartialStopMetaByRowId.set(rowId,opts.meta);
    }
    const lvl = levelInput(row);
    const lot = lotInput(row);
    if(lvl) lvl.title = "Binance Partial Stop";
    if(lot) lot.title = "Binance Partial Stop";
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
    if(item.source === "binance-limit"){
      const itemKey = orderKeyFromMeta(item.meta);
      const matched = itemKey ? allRows.find(row => {
        const meta = row.__binanceLimitOrderMeta || (row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
        return orderKeyFromMeta(meta) === itemKey;
      }) : null;
      if(matched){
        if(itemKey && binanceSyncPreserveKeys.has(itemKey)){
          markBinanceRowNeedsReview(matched,"Binance state changed while this row has local edits. Local values were preserved; review before Send.");
          return matched;
        }
        clearBinanceRowNeedsReview(matched);
        const lvl = levelInput(matched);
        const lot = lotInput(matched);
        if(lvl) lvl.value = item.level == null ? "" : Math.round(item.level);
        if(lot) lot.value = item.lot == null ? "" : Number(item.lot).toFixed(3);
        setOpenPositionRow(matched,false);
        applyRowSourceAndMeta(matched,item);
        return matched;
      }
    }
    if(containerId === "calcModulePartialStopRows"){
      const itemKey = partialStopKeyFromItem(item,item.side);
      const matched = itemKey ? allRows.find(row => {
        const meta = row.__binancePartialStopMeta || (row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
        return partialStopKeyFromMeta(meta,item.side) === itemKey;
      }) : null;
      if(matched){
        if(itemKey && binanceSyncPreserveKeys.has(itemKey)){
          markBinanceRowNeedsReview(matched,"Binance state changed while this row has local edits. Local values were preserved; review before Send.");
          return matched;
        }
        clearBinanceRowNeedsReview(matched);
        const lvl = levelInput(matched);
        const lot = lotInput(matched);
        if(lvl) lvl.value = item.level == null ? "" : Math.round(item.level);
        if(lot) lot.value = item.lot == null ? "" : Number(item.lot).toFixed(3);
        applyPartialStopSourceAndMeta(matched,item);
        return matched;
      }
    }
    const reusable = allRows.find(row => isRowEmpty(row) && row.dataset.manualDraft !== "1");
    if(reusable){
      clearBinanceMetaOnRow(reusable);
      const lvl = levelInput(reusable);
      const lot = lotInput(reusable);
      if(lvl) lvl.value = item.level == null ? "" : Math.round(item.level);
      if(lot) lot.value = item.lot == null ? "" : Number(item.lot).toFixed(3);
      setOpenPositionRow(reusable,false);
      applyRowSourceAndMeta(reusable,item);
      applyPartialStopSourceAndMeta(reusable,item);
      return reusable;
    }
    return addRow(
      containerId,
      item.level == null ? "" : Math.round(item.level),
      item.lot == null ? "" : Number(item.lot).toFixed(3),
      item
    );
  }
  function refreshPartialStopRowNumbers(){
    rows("calcModulePartialStopRows").forEach((row,index) => {
      const idx = row.querySelector(".calc-module-psl-index");
      if(idx) idx.textContent = String(index + 1);
    });
  }
  function refreshEntryRowNumbers(){
    let index = 0;
    rows("calcModuleEntryRows").forEach(row => {
      const idx = row.querySelector(".calc-module-entry-index");
      if(!idx) return;
      if(isOpenPositionRow(row)) idx.textContent = "M";
      else idx.textContent = String(++index);
    });
  }
  function refreshExitRowNumbers(referenceLevel){
    const sorted = visualLevelDistanceSort(rows("calcModuleExitRows").map((row,index) => ({
      row,
      level:num(levelInput(row)?.value),
      index
    })),referenceLevel);
    sorted.forEach((item,index) => {
      const idx = item.row && item.row.querySelector(".calc-module-exit-index");
      if(idx) idx.textContent = String(index + 1);
    });
  }
  function addRow(containerId,level="",lot="",options){
    const container = q(containerId);
    if(!container) return null;
    const opts = options || {};
    const isPartialStop = containerId === "calcModulePartialStopRows";
    const isExit = containerId === "calcModuleExitRows";
    const isEntry = containerId === "calcModuleEntryRows";
    if(lot === "" && !opts.preserveEmptyDefaults) lot = defaultLotForRow();
    const row = document.createElement("div");
    row.className = isPartialStop ? "calc-module-row calc-module-psl-row" : isExit ? "calc-module-row calc-module-exit-row" : isEntry ? "calc-module-row calc-module-entry-row" : "calc-module-row";
    if(opts.manual) row.dataset.manualDraft = "1";
    row.innerHTML = isPartialStop
      ? `
      <span class="calc-module-psl-index">1</span>
      <input class="calc-module-level" type="number" inputmode="decimal" step="10" min="0" placeholder="Level" value="${level}">
      <input class="calc-module-lot" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Lot" value="${lot}">
      <span class="calc-module-psl-pl">-</span>
      <button class="calc-module-remove" type="button" title="Remove">x</button>`
      : isExit
      ? `
      <span class="calc-module-exit-index">1</span>
      <input class="calc-module-level" type="number" inputmode="decimal" step="10" min="0" placeholder="Level" value="${level}">
      <input class="calc-module-lot" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Lot" value="${lot}">
      <span class="calc-module-exit-row-pl">-</span>
      <button class="calc-module-remove" type="button" title="Remove">x</button>`
      : `
      <span class="calc-module-entry-index">1</span>
      <input class="calc-module-level" type="number" inputmode="decimal" step="10" min="0" placeholder="Level" value="${level}">
      <input class="calc-module-lot" type="number" inputmode="decimal" step="0.001" min="0" placeholder="Lot" value="${lot}">
      <span class="calc-module-entry-margin">-</span>
      <button class="calc-module-remove" type="button" title="Remove">x</button>`;
    applyRowSourceAndMeta(row,opts);
    applyPartialStopSourceAndMeta(row,opts);
    setOpenPositionRow(row,!!opts.openPosition);
    setRowLocked(row,!!opts.locked,{keepRemoveEnabled:!!opts.keepRemoveEnabled});
    row.querySelectorAll("input").forEach(input => input.addEventListener("input",() => {
      if(input.classList.contains("calc-module-lot")) normalizeLotInput(input);
      if(input.classList.contains("calc-module-level")) normalizeLevelInput(input);
      if(isPartialStop && input.classList.contains("calc-module-lot")) lastEditedPartialStopLotInput = input;
      if(isExit && input.classList.contains("calc-module-lot")) lastEditedExitLotInput = input;
      markSendPlanStale("Row edited after preflight.");
      calculate();
    },false));
    if(isPartialStop){
      lotInput(row)?.addEventListener("focus",e => {
        lastEditedPartialStopLotInput = e.currentTarget;
        refreshLiveStopsValidity(null);
      },false);
      lotInput(row)?.addEventListener("change",e => {
        lastEditedPartialStopLotInput = e.currentTarget;
        refreshLiveStopsValidity(null);
      },false);
      lotInput(row)?.addEventListener("blur",() => {
        refreshLiveStopsValidity(null);
      },false);
    }
    if(isExit){
      lotInput(row)?.addEventListener("focus",e => {
        lastEditedExitLotInput = e.currentTarget;
        refreshLiveExitsValidity(null);
      },false);
      lotInput(row)?.addEventListener("change",e => {
        lastEditedExitLotInput = e.currentTarget;
        refreshLiveExitsValidity(null);
      },false);
      lotInput(row)?.addEventListener("blur",() => {
        refreshLiveExitsValidity(null);
      },false);
    }
    row.querySelector(".calc-module-remove").addEventListener("click",() => {
      if(isStagedDeletionEligible(row)){
        setRowMarkedForDeletion(row,!isRowMarkedForDeletion(row));
        return;
      }
      markSendPlanStale("Row removed after preflight.");
      clearBinanceMetaOnRow(row);
      clearPartialStopMetaOnRow(row);
      if(lastEditedPartialStopLotInput && row.contains(lastEditedPartialStopLotInput)) lastEditedPartialStopLotInput = null;
      if(lastEditedExitLotInput && row.contains(lastEditedExitLotInput)) lastEditedExitLotInput = null;
      row.remove();
      clearPartialStopLotInvalidState();
      clearExitLotInvalidState();
      refreshEntryRowNumbers();
      refreshPartialStopRowNumbers();
      refreshExitRowNumbers(readEntry().avg);
      calculate();
    },false);
    container.appendChild(row);
    refreshEntryRowVisualState(row);
    refreshEntryRowNumbers();
    refreshPartialStopRowNumbers();
    refreshExitRowNumbers(readEntry().avg);
    refreshPendingSendVisualState();
    calculate();
    return row;
  }
  async function addManualRow(containerId){
    const level = await clipboardPriceLevel();
    return addRow(containerId,level,defaultLotForRow(),{manual:true});
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
          keepRemoveEnabled:!!(opts.keepRemoveEnabledFirstRow && index === 0),
          preserveEmptyDefaults:true
        }
      );
    });
  }
  function clearCalculatorLocal(){
    markSendPlanStale("Calculator cleared after preflight.");
    clearMappedLimitRows("calcModuleEntryRows");
    clearMappedLimitRows("calcModuleExitRows");
    binanceLimitRowMetaByRowId.clear();
    binancePartialStopMetaByRowId.clear();
    const entryRows = q("calcModuleEntryRows");
    const exitRows = q("calcModuleExitRows");
    if(entryRows) entryRows.innerHTML = "";
    if(exitRows) exitRows.innerHTML = "";
    const partialStopRows = q("calcModulePartialStopRows");
    if(partialStopRows) partialStopRows.innerHTML = "";
    lastEditedPartialStopLotInput = null;
    lastEditedExitLotInput = null;
    lastKnownLiveOpenPositionQty = null;
    const stopLevel = q("calcModuleStopLevel");
    const stopDistance = q("calcModuleStopDistance");
    if(stopLevel) stopLevel.value = "";
    if(stopDistance) stopDistance.value = "";
    clearMasterStopBinanceState();
    lastReadStateSnapshot = null;
    resetOpenPositionCloseUi();
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
  function isClosePositionOrder(order){
    const cp = order && order.closePosition;
    return cp === true || String(cp).toLowerCase() === "true";
  }
  function classifyConditionalOrder(order){
    return conditionalClassifier && typeof conditionalClassifier.classify === "function"
      ? conditionalClassifier.classify(order)
      : {
          kind:CONDITIONAL_KIND.UNKNOWN,
          sourceOrder:order || null,
          symbol:order && order.symbol != null ? order.symbol : null,
          side:order && order.side != null ? order.side : null,
          positionSide:order && order.positionSide != null ? order.positionSide : null,
          triggerPrice:orderStopPrice(order),
          quantity:orderQuantity(order),
          closePosition:isClosePositionOrder(order),
          clientOrderId:order && order.clientOrderId != null ? order.clientOrderId : null,
          clientAlgoId:order && order.clientAlgoId != null ? order.clientAlgoId : null,
          orderId:order && order.orderId != null ? order.orderId : null,
          algoId:order && order.algoId != null ? order.algoId : null,
          ownership:null,
          typeText:"",
          isLive:isLiveOrder(order)
        };
  }
  function orderQuantity(order){
    for(const key of ["origQty","quantity","qty"]){
      const n = num(order && order[key]);
      if(n != null && n > 0) return n;
    }
    return null;
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
    const classified = classifyConditionalOrder(order);
    return {
      algoId:order && order.algoId != null ? order.algoId : null,
      clientAlgoId:order && order.clientAlgoId != null ? order.clientAlgoId : null,
      symbol:order && order.symbol != null ? order.symbol : null,
      side:order && order.side != null ? order.side : null,
      positionSide:order && order.positionSide != null ? order.positionSide : null,
      type:order && (order.type != null ? order.type : order.algoType != null ? order.algoType : null),
      status:order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : null),
      triggerPrice:classified.triggerPrice,
      origQty:classified.quantity,
      closePosition:classified.closePosition,
      conditionalKind:classified.kind,
      reduceOnly:order && order.reduceOnly != null ? order.reduceOnly : null,
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
  function clearMappedPartialStopRows(){
    rows("calcModulePartialStopRows").forEach(row => {
      if(row.dataset.source !== "binance-partial-stop") return;
      clearPartialStopMetaOnRow(row);
      row.remove();
    });
    refreshPartialStopRowNumbers();
  }
  function pruneMappedLimitRows(containerId,activeKeys){
    if(!(activeKeys instanceof Set)) return;
    rows(containerId).forEach(row => {
      if(row.dataset.source !== "binance-limit") return;
      const meta = row.__binanceLimitOrderMeta || (row.dataset && row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(row.dataset.calcRowId) : null);
      const key = orderKeyFromMeta(meta);
      if(key && activeKeys.has(key)) return;
      if(key && binanceSyncPreserveKeys.has(key)){
        markBinanceRowNeedsReview(row,"This locally edited Binance-backed row is no longer confirmed open. Review before Send.");
        return;
      }
      clearBinanceMetaOnRow(row);
      row.remove();
    });
  }
  function pruneMappedPartialStopRows(activeKeys){
    if(!(activeKeys instanceof Set)) return;
    rows("calcModulePartialStopRows").forEach(row => {
      if(row.dataset.source !== "binance-partial-stop") return;
      const meta = row.__binancePartialStopMeta || (row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
      const key = partialStopKeyFromMeta(meta,null);
      if(key && activeKeys.has(key)) return;
      if(key && binanceSyncPreserveKeys.has(key)){
        markBinanceRowNeedsReview(row,"This locally edited Binance-backed PSL is no longer confirmed open. Review before Send.");
        return;
      }
      clearPartialStopMetaOnRow(row);
      row.remove();
    });
    refreshPartialStopRowNumbers();
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
    if(meta.algoId != null && String(meta.algoId).trim() !== "") return "algo:" + String(meta.algoId);
    const caid = String(meta.clientAlgoId || "").trim();
    if(caid) return "calgo:" + caid;
    return "";
  }
  function triggerConfirmedOrderBlink(key){
    const id = String(key || "").trim();
    if(!id) return;
    const start = Date.now();
    confirmedOrderBlinkByKey.set(id,{start,until:start + 1200});
    const animate = () => {
      const state = confirmedOrderBlinkByKey.get(id);
      if(!state) return;
      try{ if(typeof draw === "function") draw(); }catch(_e){}
      if(Date.now() < state.until) requestAnimationFrame(animate);
      else confirmedOrderBlinkByKey.delete(id);
    };
    requestAnimationFrame(animate);
  }
  function blinkActiveForKey(key){
    const id = String(key || "").trim();
    if(!id) return 0;
    const state = confirmedOrderBlinkByKey.get(id);
    if(!state) return 0;
    if(Date.now() > state.until){
      confirmedOrderBlinkByKey.delete(id);
      return 0;
    }
    const progress = clamp((Date.now() - state.start) / Math.max(1,state.until - state.start),0,1);
    return Math.pow(Math.sin(progress * Math.PI * 2),2);
  }
  function partialStopFallbackKey(side,level,lot){
    const levelNum = num(level);
    const lotNum = num(lot);
    if(levelNum == null || lotNum == null) return "";
    return "psl:" + toUpper(side || "") + ":" + levelNum.toFixed(8) + ":" + lotNum.toFixed(10);
  }
  function partialStopKeyFromMeta(meta,side){
    const identity = orderKeyFromMeta(meta);
    if(identity) return identity;
    return partialStopFallbackKey(side || (meta && meta.side),meta && meta.triggerPrice,meta && meta.origQty);
  }
  function partialStopKeyFromItem(item,side){
    if(!item) return "";
    const metaKey = partialStopKeyFromMeta(item.meta,side);
    if(metaKey) return metaKey;
    return partialStopFallbackKey(side || item.side,item.level,item.lot);
  }
  function stablePartialStopRowId(item,index){
    const key = partialStopKeyFromItem(item,item && item.side).replace(/[^a-zA-Z0-9_-]+/g,"_");
    return "binance_psl_" + (key || String(index));
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
    const dir = position && position.side ? position.side : null;
    const limitOrderMap = new Map();
    const partialStopOrderMap = new Map();
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
    (mapped && Array.isArray(mapped.partialStops) ? mapped.partialStops : []).forEach(item => {
      const meta = item && item.meta ? item.meta : null;
      const raw = meta && meta.rawOrder ? meta.rawOrder : null;
      const key = orderKeyFromMeta(meta);
      if(!key || !raw) return;
      partialStopOrderMap.set(key,{
        algoId:meta.algoId,
        clientAlgoId:meta.clientAlgoId,
        symbol:meta.symbol,
        side:toUpper(meta.side),
        positionSide:toUpper(meta.positionSide || "BOTH"),
        triggerPrice:num(meta.triggerPrice),
        origQty:num(meta.origQty),
        workingType:meta.workingType || null,
        raw:safeCloneOrder(raw)
      });
    });
    return {
      at:new Date().toISOString(),
      symbol:sym,
      direction:dir === "SHORT" ? "SHORT" : dir === "LONG" ? "LONG" : null,
      openPosition:position
        ? {
            side:position.side === "SHORT" ? "SHORT" : "LONG",
            qty:num(position.qty),
            entry:num(position.entry),
            positionSide:toUpper(position.positionSide || "")
          }
        : null,
      mappedLimitOrderMap:limitOrderMap,
      mappedPartialStopOrderMap:partialStopOrderMap,
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
  function liveOrderKeySet(snapshot){
    const keys = new Set();
    const sym = toUpper(snapshot && snapshot.symbol);
    [].concat(snapshot && snapshot.normalOrders || [], snapshot && snapshot.algoOrders || [])
      .filter(o => o && toUpper(o.symbol) === sym)
      .filter(isLiveOrder)
      .forEach(order => {
        const key = isStopOrder(order)
          ? orderKeyFromMeta(buildAlgoOrderMeta(order))
          : orderKeyFromOrder(order);
        if(key) keys.add(key);
      });
    return keys;
  }
  function detectCalculatorOrderExecutions(snapshot){
    if(!lastReadStateSnapshot || !snapshot) return;
    const liveKeys = liveOrderKeySet(snapshot);
    const missing = [];
    const scan = (map,label) => {
      if(!(map instanceof Map)) return;
      map.forEach((_order,key) => {
        if(!key || liveKeys.has(key) || notifiedExecutionKeys.has(key)) return;
        notifiedExecutionKeys.add(key);
        missing.push(label);
      });
    };
    scan(lastReadStateSnapshot.mappedLimitOrderMap,"LIMIT");
    scan(lastReadStateSnapshot.mappedPartialStopOrderMap,"PSL");
    if(missing.length){
      const message = "Calculator order execution detected: " + missing.join(", ") + ".";
      setCalculatorExecutionNotice(message);
    }
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
    const liveStopOrders = [].concat(snapshot && snapshot.normalOrders || [], snapshot && snapshot.algoOrders || [])
      .filter(order => order && toUpper(order.symbol) === sym)
      .filter(isLiveOrder)
      .filter(isStopOrder)
      .map(order => ({
        key:String(order.algoId != null ? "algo:" + order.algoId : order.orderId != null ? "id:" + order.orderId : order.clientAlgoId || order.clientOrderId || ""),
        side:toUpper(order && order.side),
        positionSide:toUpper(order && order.positionSide || "BOTH"),
        type:toUpper(order && (order.type || order.origType || order.orderType || order.algoType || "")),
        triggerPrice:roundedSignatureNumber(orderStopPrice(order),8),
        quantity:roundedSignatureNumber(orderQuantity(order),10),
        closePosition:isClosePositionOrder(order),
        reduceOnly:isReduceOnly(order),
        status:toUpper(order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : ""))
      }))
      .sort((a,b) => String(a.key).localeCompare(String(b.key)));
    const pos = position
      ? {
          side:position.side === "SHORT" ? "SHORT" : "LONG",
          positionSide:toUpper(position.positionSide || ""),
          qty:roundedSignatureNumber(position.qty,10),
          entry:roundedSignatureNumber(position.entry,8)
        }
      : null;
    return JSON.stringify({symbol:sym,openPosition:pos,limitOrders:liveLimitOrders,stopOrders:liveStopOrders});
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
        if(openPositionSizeChanged(lastReadStateSnapshot && lastReadStateSnapshot.openPosition,live.position)){
          setCalculatorPositionSizeNotice();
        }
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
    if(
      lastReadStateSnapshot &&
      lastReadStateSnapshot.openPosition &&
      (lastReadStateSnapshot.direction === "LONG" || lastReadStateSnapshot.direction === "SHORT")
    ){
      return lastReadStateSnapshot.direction;
    }
    return direction === "SHORT" ? "SHORT" : "LONG";
  }
  function inferPositionSideForNewOrder(contextDirection,livePosition,rowPlan){
    const rowType = String(rowPlan && rowPlan.payload && rowPlan.payload.rowType || "");
    const rowRef = rowPlan && rowPlan.rowRef;
    const meta = rowRef && (rowRef.__binanceLimitOrderMeta || (rowRef.dataset && rowRef.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(rowRef.dataset.calcRowId) : null));
    const livePs = toUpper(livePosition && livePosition.positionSide || "");
    if(livePosition){
      if(livePs === "LONG" || livePs === "SHORT") return livePs;
      if(livePs === "BOTH") return "BOTH";
    }
    if(rowType === "entry"){
      return "BOTH";
    }
    const metaPs = toUpper(meta && meta.positionSide || "");
    if(metaPs === "LONG" || metaPs === "SHORT" || metaPs === "BOTH") return metaPs;
    return "BOTH";
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
      partialStops:rows("calcModulePartialStopRows")
        .map(row => ({row,meta:row && row.__binancePartialStopMeta ? row.__binancePartialStopMeta : (row && row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null)}))
        .filter(item => item && item.meta && item.meta.rawOrder),
      diagnostic:{}
    };
  }
  function updateSendButtonState(state){
    const btn = q("calcModuleSend");
    if(!btn) return;
    btn.disabled = !!state;
    if(state) btn.textContent = "Sending...";
    else btn.textContent = "Send";
  }
  function blinkSendSuccess(){
    const btn = q("calcModuleSend");
    if(!btn) return;
    btn.classList.remove("bt001-send-success-blink");
    void btn.offsetWidth;
    btn.classList.add("bt001-send-success-blink");
    clearTimeout(btn.__bt001SendBlinkTimer);
    btn.__bt001SendBlinkTimer = setTimeout(() => {
      btn.classList.remove("bt001-send-success-blink");
      btn.__bt001SendBlinkTimer = null;
    },900);
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
    const tableRows = sendPlanState.rows.filter(r => !(r && r.type === "Open Position"));
    const blockedCount = sendPlanState.rows.filter(r => r && r.action === "Blocked").length;
    const writableCount = sendPlanState.rows.filter(r => r && !!r.writable).length;
    const stale = !!sendPlanState.stale;
    const canConfirm = !!(sendPlanState.canConfirm && !sendPlanState.executing && writableCount > 0 && blockedCount === 0 && !stale);
    const hasResult = sendPlanState.rows.some(r => r && (r.status === "Confirmed" || r.status === "Failed"));
    const title = hasResult ? "Send Results" : "Send Plan";
    const summary = [
      "CBS: " + (sendPlanState.cbsEnabled ? "ON" : "OFF"),
      "Stops: ON",
      "Writable: " + writableCount,
      "Blocked: " + blockedCount,
      "Ignored: " + tableRows.filter(r => r && r.action === "Ignored").length,
      "Skipped: " + tableRows.filter(r => r && r.action === "Skip").length
    ].join(" | ");
    let lastSection = "";
    const rowsHtml = tableRows.map((row) => {
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
        ? `<tr class="calc-module-send-section"><td colspan="9">${hEsc(section)}</td></tr>`
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
      summaryEl.textContent = summary + staleText;
      summaryEl.classList.toggle("is-stale",stale);
    }
    const bodyEl = q("calcModuleSendBody");
    if(bodyEl){
      bodyEl.innerHTML = rowsHtml || `<tr><td colspan="9">No rows.</td></tr>`;
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
    const rawEntries = usableOverlayRows("calcModuleEntryRows");
    const rawExits = usableOverlayRows("calcModuleExitRows");
    const slLevel = num(q("calcModuleStopLevel")?.value);
    const entryState = readEntry();
    const stopMath = calculateStopMath(entryState,slLevel,readPartialStops());
    const entryQty = entryState.qty || 0;
    const entryAvg = entryState.avg;
    const entries = visualLevelDistanceSort(rawEntries,entryAvg);
    const exits = visualLevelDistanceSort(rawExits,entryAvg);
    const manualEntryNumbers = new Map();
    entries.filter(item => !isOpenPositionRow(item.row)).forEach((item,index) => {
      if(item && item.row) manualEntryNumbers.set(item.row,index + 1);
    });
    const entryRows = entries.map(item => {
      const openPosition = isOpenPositionRow(item.row);
      const needsReview = !!(item.row && item.row.dataset && item.row.dataset.needsReview === "1");
      const meta = item.row && item.row.__binanceLimitOrderMeta ? item.row.__binanceLimitOrderMeta : (item.row && item.row.dataset && item.row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(item.row.dataset.calcRowId) : null);
      const sourceStyle = openPosition
        ? "open-position"
        : needsReview
          ? "needs-review"
        : String(item.row && item.row.dataset ? item.row.dataset.source || "" : "") === "binance-limit"
          ? "binance-existing"
          : "manual-entry";
      return {
        type:"entry",
        level:item.level,
        lot:item.lot,
        side:direction,
        entry:item.level,
        row:item.row,
        openPosition,
        binanceBacked:sourceStyle === "binance-existing",
        pendingSend:rowPendingSend(item.row),
        orderKey:orderKeyFromMeta(meta),
        sourceStyle,
        text:openPosition
          ? "Open Position | " + Number(item.lot).toFixed(3)
          : "Entry " + (manualEntryNumbers.get(item.row) || 1) + " | " + Number(item.lot).toFixed(3)
      };
    });
    const exitRows = exits.map((item,index) => {
      const needsReview = !!(item.row && item.row.dataset && item.row.dataset.needsReview === "1");
      const meta = item.row && item.row.__binanceLimitOrderMeta ? item.row.__binanceLimitOrderMeta : (item.row && item.row.dataset && item.row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(item.row.dataset.calcRowId) : null);
      const sourceStyle = needsReview
        ? "needs-review"
        : String(item.row && item.row.dataset ? item.row.dataset.source || "" : "") === "binance-limit"
        ? "binance-existing"
        : "exit";
      const pl = entryAvg == null
        ? null
        : direction === "LONG"
          ? (item.level - entryAvg) * item.lot
          : (entryAvg - item.level) * item.lot;
      return {
        type:"exit",
        level:item.level,
        lot:item.lot,
        row:item.row,
        openPosition:false,
        binanceBacked:sourceStyle === "binance-existing",
        pendingSend:rowPendingSend(item.row),
        orderKey:orderKeyFromMeta(meta),
        sourceStyle,
        pl,
        text:"Ext " + (index + 1) + " | " + Number(item.lot).toFixed(3) + " | " + fmtChartMoney(pl)
      };
    });
    const stopRow = slLevel != null && slLevel > 0 ? {
      type:"master-sl",
      level:slLevel,
      row:null,
      openPosition:false,
      binanceBacked:!!currentStopAlgoMeta,
      pendingSend:masterStopPendingSend(),
      orderKey:orderKeyFromMeta(currentStopAlgoMeta),
      sourceStyle:masterStopMarkedForDeletion ? "marked-delete" : "sl",
      text:(masterStopMarkedForDeletion ? "Master SL Delete | " : "Master SL | ") + fmtLot(stopMath.remainingQty || 0) + " | " + fmtChartMoney(stopMath.total)
    } : null;
    const partialStopRows = visualLevelDistanceSort(stopMath.partialStops,currentPriceReference()).map((item,index) => ({
      orderKey:partialStopKeyFromMeta(item.row && item.row.__binancePartialStopMeta ? item.row.__binancePartialStopMeta : (item.row && item.row.dataset && item.row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(item.row.dataset.calcPartialStopRowId) : null),null),
      binanceBacked:!!(item.row && item.row.dataset && item.row.dataset.source === "binance-partial-stop" && item.row.dataset.needsReview !== "1"),
      type:"partial-sl",
      level:item.level,
      lot:item.lot,
      row:item.row,
      openPosition:false,
      pendingSend:rowPendingSend(item.row),
      sourceStyle:"partial-sl",
      pl:item.pl,
      text:"PSL " + (index + 1) + " | " + Number(item.lot).toFixed(3) + " | " + fmtChartMoney(item.pl)
    }));
    const openEntryRow = entryRows.find(item => item && item.openPosition);
    const extraEntryCount = entryRows.filter(item => item && !item.openPosition).length;
    const newAverageRow = openEntryRow && extraEntryCount > 0 && entryAvg != null && !approxEqual(entryAvg,openEntryRow.level,1e-9) ? {
      type:"new-average",
      level:entryAvg,
      row:null,
      openPosition:false,
      sourceStyle:"new-average",
      connectorFromRow:openEntryRow.row,
      text:"New average : " + fmtPrice(entryAvg)
    } : null;
    return {entries:entryRows, exits:exitRows, stop:stopRow, partialStops:partialStopRows, newAverage:newAverageRow, entryAvg, entryQty, stopMath};
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
  function otfBoxEligible(box){
    return !!(otfEnabled && box && ["exit","partial-sl","master-sl"].includes(box.type) && (box.type === "master-sl" || box.row));
  }
  function binanceWriteConfirmed(resp){
    return !!(resp && (
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
  }
  async function confirmOtfSelection(){
    const selected = otfSelection;
    if(!selected || selected.sending || (selected.row && !selected.row.isConnected)) return;
    const pendingKey = otfBoxPendingKey(selected);
    if(pendingKey && otfPendingOrderKeys.has(pendingKey)){
      setStatus("OTF update already pending for this order.");
      clearOtfSelection();
      return;
    }
    const level = selected.type === "master-sl" ? num(q("calcModuleStopLevel")?.value) : num(levelInput(selected.row)?.value);
    if(level == null || level <= 0){
      setStatus("OTF blocked: price level is invalid.");
      return;
    }
    if(selected.originalLevel != null && approxEqual(level,selected.originalLevel,1e-8)){
      setStatus("OTF unchanged: drag the selected level before sending.");
      return;
    }
    selected.sending = true;
    if(pendingKey) otfPendingOrderKeys.add(pendingKey);
    clearOtfSelection();
    const selectedLabel = selected.type === "partial-sl" ? "PSL" : selected.type === "master-sl" ? "Master SL" : "Exit";
    setStatus("OTF confirming " + selectedLabel + " Binance update...");
    try{
      const liveSnapshot = await readOpenOrdersSnapshot();
      let out = null;
      let restoreOnUnconfirmed = null;
      if(selected.type === "exit"){
        const meta = selected.row.__binanceLimitOrderMeta || (selected.row.dataset && selected.row.dataset.calcRowId ? binanceLimitRowMetaByRowId.get(selected.row.dataset.calcRowId) : null);
        const key = orderKeyFromMeta(meta);
        if(!meta || !key || !(meta.orderId != null || String(meta.clientOrderId || "").trim())){
          throw new Error("OTF Exit is missing required Binance order metadata.");
        }
        const baseMap = lastReadStateSnapshot && lastReadStateSnapshot.mappedLimitOrderMap instanceof Map ? lastReadStateSnapshot.mappedLimitOrderMap : null;
        const baseOrder = baseMap ? baseMap.get(key) : null;
        const liveOrder = collectLiveLimitOrdersByKey(liveSnapshot).get(key);
        const plan = {rows:[],blocked:false};
        prepareExistingRowPlan(plan,selected.row,"exit",meta,baseOrder,liveOrder);
        const rowPlan = plan.rows.find(row => row && row.mode === "modify" && row.writable);
        if(!rowPlan) throw new Error(plan.rows.map(row => row && row.response).filter(Boolean).join(" ") || "OTF Exit update is not safely writable.");
        restoreOnUnconfirmed = () => applyRowSourceAndMeta(selected.row,{
          source:"binance-limit",
          meta,
          rowId:selected.row.dataset && selected.row.dataset.calcRowId ? selected.row.dataset.calcRowId : null
        });
        out = await runPlanWriteRow(rowPlan,inferDirectionForSend(null));
      }else if(selected.type === "partial-sl"){
        const meta = selected.row.__binancePartialStopMeta || (selected.row.dataset && selected.row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(selected.row.dataset.calcPartialStopRowId) : null);
        const key = orderKeyFromMeta(meta);
        if(!meta || !key || !(meta.algoId != null || String(meta.clientAlgoId || "").trim())){
          throw new Error("OTF PSL is missing required Binance order metadata.");
        }
        if(!liveOrderKeySet(liveSnapshot).has(key)) throw new Error("OTF PSL is no longer present in live Binance orders. Click Read.");
        const livePos = await signedPosition();
        if(!livePos) throw new Error("OTF PSL blocked: no open position.");
        const stopMath = calculateStopMath(readEntry(),num(q("calcModuleStopLevel")?.value),readPartialStops());
        if(stopMath.totalPartialQty > (num(livePos.qty) || 0) + 1e-9) throw new Error("OTF PSL blocked: PSL lots exceed live position size.");
        const lot = num(lotInput(selected.row)?.value);
        if(lot == null || lot < 0.001) throw new Error("OTF PSL quantity is invalid.");
        const side = toUpper(meta.side) || (livePos.side === "SHORT" ? "BUY" : "SELL");
        const cancelPlan = {
          writable:true,
          mode:"psl-cancel",
          payload:{
            symbol:meta.symbol || currentSymbol(),
            algoId:meta.algoId != null ? meta.algoId : null,
            clientAlgoId:meta.clientAlgoId ? String(meta.clientAlgoId) : "",
            meta
          }
        };
        const createPlan = {
          writable:true,
          mode:"psl-create",
          rowRef:selected.row,
          payload:{
            symbol:meta.symbol || currentSymbol(),
            side,
            triggerPrice:level,
            quantity:lot,
            positionSide:toUpper(meta.positionSide || livePos.positionSide || ""),
            workingType:meta.workingType || null
          }
        };
        const cancelled = await runPlanWriteRow(cancelPlan,inferDirectionForSend(livePos));
        if(!binanceWriteConfirmed(cancelled && cancelled.response)) throw new Error("OTF PSL cancel returned an unexpected Binance response.");
        try{
          out = await runPlanWriteRow(createPlan,inferDirectionForSend(livePos));
        }catch(e){
          clearPartialStopMetaOnRow(selected.row);
          throw e;
        }
      }else{
        const meta = currentStopAlgoMeta;
        const key = orderKeyFromMeta(meta);
        if(!meta || !key || !(meta.algoId != null || String(meta.clientAlgoId || "").trim())){
          throw new Error("OTF Master SL is missing required Binance order metadata.");
        }
        if(!liveOrderKeySet(liveSnapshot).has(key)) throw new Error("OTF Master SL is no longer present in live Binance orders. Click Read.");
        const livePos = await signedPosition();
        if(!livePos) throw new Error("OTF Master SL blocked: no open position.");
        const cancelPlan = {
          writable:true,
          mode:"sl-cancel",
          payload:{
            symbol:meta.symbol || currentSymbol(),
            algoId:meta.algoId != null ? meta.algoId : null,
            clientAlgoId:meta.clientAlgoId ? String(meta.clientAlgoId) : "",
            meta
          }
        };
        const createPlan = {
          writable:true,
          mode:"sl-create",
          payload:{
            symbol:meta.symbol || currentSymbol(),
            side:toUpper(meta.side) || (livePos.side === "SHORT" ? "BUY" : "SELL"),
            triggerPrice:level,
            positionSide:toUpper(meta.positionSide || livePos.positionSide || ""),
            workingType:meta.workingType || null
          }
        };
        const cancelled = await runPlanWriteRow(cancelPlan,inferDirectionForSend(livePos));
        if(!binanceWriteConfirmed(cancelled && cancelled.response)) throw new Error("OTF Master SL cancel returned an unexpected Binance response.");
        currentStopAlgoMeta = null;
        out = await runPlanWriteRow(createPlan,inferDirectionForSend(livePos));
      }
      if(!binanceWriteConfirmed(out && out.response)){
        if(restoreOnUnconfirmed) restoreOnUnconfirmed();
        if(selected.type === "partial-sl") clearPartialStopMetaOnRow(selected.row);
        if(selected.type === "master-sl") currentStopAlgoMeta = null;
        throw new Error("OTF update returned an unexpected Binance response.");
      }
      const blinkKey = out && out.blinkKey ? out.blinkKey : "";
      setStatus("OTF " + selectedLabel + " update confirmed.");
      calculate();
      if(blinkKey) triggerConfirmedOrderBlink(blinkKey);
      if(!otfSelection && otfPendingOrderKeys.size <= 1){
        try{ await readBinance({preserveSendPlan:true,source:"postSendRefresh"}); }catch(_e){}
      }
    }catch(e){
      selected.sending = false;
      setStatus("OTF " + selectedLabel + " failed: " + (e && e.message ? e.message : String(e)));
    }finally{
      if(pendingKey) otfPendingOrderKeys.delete(pendingKey);
    }
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
    alignOrdersOtfButtons();
    overlayLevelBoxes = [];
    const calculatorOpen = calculatorWindowVisible();
    if(calculatorOpen && !levelsVisible) return;
    if(!calculatorOpen && !ordersVisible) return;
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
    const items = overlayRows.entries.concat(
      overlayRows.exits,
      overlayRows.stop ? [overlayRows.stop] : [],
      overlayRows.partialStops || [],
      overlayRows.newAverage ? [overlayRows.newAverage] : []
    )
      .filter(item => item && (calculatorOpen ? levelsVisible : ((item.binanceBacked || item.openPosition) && ordersVisible)))
      .map(item => {
        const y = top + ((maxP - item.level) / (maxP - minP)) * priceH;
        const text = item.openPosition
          ? direction.toUpperCase() + " | " + Number(item.lot).toFixed(3)
          : item.text;
        return { ...item, text, y };
      })
      .filter(item => item.y >= top - 2 && item.y <= top + priceH + 2);
    publishOverlayDiagnostic({
      at:new Date().toISOString(),
      visible:levelsVisible,
      entries:overlayRows.entries.length,
      exits:overlayRows.exits.length,
      stop:overlayRows.stop ? 1 : 0,
      partialStops:(overlayRows.partialStops || []).length,
      newAverage:overlayRows.newAverage ? 1 : 0,
      drawn:items.length,
      boxes:overlayLevelBoxes.length,
      dragActive:!!overlayDrag.active
    });
    if(!items.length) return;

    const padX = 6;
    const labelH = 16;
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
      const blinkOn = blinkActiveForKey(item.orderKey);
      ctx.strokeStyle = blinkOn
        ? "rgba(255,106,0," + (0.30 + blinkOn * 0.68).toFixed(3) + ")"
        : item.type === "master-sl"
        ? "rgba(180,126,38,0.70)"
        : item.type === "partial-sl"
          ? (num(item.pl) == null || num(item.pl) >= 0 ? "rgba(4,120,87,0.82)" : "rgba(127,29,29,0.86)")
        : item.type === "exit"
          ? (num(item.pl) == null || num(item.pl) >= 0 ? "rgba(4,120,87,0.82)" : "rgba(127,29,29,0.86)")
        : item.type === "new-average"
          ? "rgba(37,99,235,0.70)"
          : item.sourceStyle === "binance-existing"
            ? "rgba(208,145,29,0.72)"
            : item.sourceStyle === "manual-entry"
              ? "rgba(8,145,178,0.72)"
              : "rgba(112,122,138,0.70)";
      ctx.beginPath();
      ctx.moveTo(px(left),y);
      ctx.lineTo(px(chartRight),y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const placed = [];
    const sorted = items.slice().sort((a,b) => a.y - b.y);
    sorted.forEach(item => {
      if(item.type === "new-average") return;
      const textW = Math.ceil(ctx.measureText(item.text).width) + padX * 2;
      const w = Math.min(textW,Math.max(56,chartRight - left - 8));
      const cy = item.y;
      const normalX = clamp(chartRight - w - 8,left + 2,chartRight - w - 2);
      const y = cy - labelH / 2;
      const collides = placed.some(prev => normalX < prev.x + prev.w && normalX + w > prev.x && y < prev.y + prev.h && y + labelH > prev.y);
      const hiddenByStandardRule = y < top || y + labelH > chartBottom || collides;
      const ordersOpenPositionException = !calculatorOpen && ordersVisible && !!item.openPosition && hiddenByStandardRule;
      if(hiddenByStandardRule && !ordersOpenPositionException) return;
      const x = ordersOpenPositionException
        ? clamp(normalX - w * 1.2,left + 2,chartRight - w - 2)
        : normalX;
      placed.push({
        item,
        w,
        h:labelH,
        cy,
        x,
        y
      });
    });
    const drawnBoxes = [];
    const otfClosePanels = [];
    placed.forEach(p => {
      const x = p.x;
      const y = p.y;
      const blinkOn = blinkActiveForKey(p.item.orderKey);
      const isOpenPos = !!p.item.openPosition;
      const isSl = p.item.type === "master-sl";
      const isPartialSl = p.item.type === "partial-sl";
      const isExit = p.item.type === "exit";
      const isNewAverage = p.item.type === "new-average";
      const isBinanceExisting = p.item.sourceStyle === "binance-existing";
      const isManualEntry = p.item.sourceStyle === "manual-entry";
      const isPendingManual = !!p.item.pendingSend && !p.item.binanceBacked;
      const isOtfSelected = otfSelectionMatches(p.item);
      const otfPulse = isOtfSelected ? 0.35 + Math.pow(Math.sin(Date.now() / 900),2) * 0.65 : 0;
      const derivedStrokeStyle = isSl
        ? "rgba(180,126,38,0.70)"
        : isPartialSl
          ? (num(p.item.pl) == null || num(p.item.pl) >= 0 ? "rgba(4,120,87,0.86)" : "rgba(127,29,29,0.90)")
        : isExit
          ? (num(p.item.pl) == null || num(p.item.pl) >= 0 ? "rgba(4,120,87,0.86)" : "rgba(127,29,29,0.90)")
        : isNewAverage
          ? "rgba(37,99,235,0.72)"
          : isBinanceExisting
            ? "rgba(208,145,29,0.72)"
            : isManualEntry
              ? "rgba(8,145,178,0.72)"
              : "rgba(112,122,138,0.70)";
      const showOtfCloseControl = !!(otfEnabled && isOpenPos);
      const closePreview = showOtfCloseControl ? openPositionClosePreview(p.item) : null;
      const closeSliderOpen = !!(showOtfCloseControl && openPositionCloseUi.open);
      const closeButtonWidth = showOtfCloseControl ? p.h : 0;
      const closeButtonSize = showOtfCloseControl ? Math.max(9,p.h - 8) : 0;
      const closeButtonX = showOtfCloseControl ? x - 2 - closeButtonWidth : 0;
      const closeButtonY = showOtfCloseControl ? y : 0;
      const closeGlyphX = showOtfCloseControl ? closeButtonX + Math.max(2,(closeButtonWidth - closeButtonSize) / 2) : 0;
      const closeGlyphY = showOtfCloseControl ? closeButtonY + Math.max(2,(p.h - closeButtonSize) / 2) : 0;
      ctx.fillStyle = blinkOn
        ? "rgba(255,214,10," + (0.18 + blinkOn * 0.78).toFixed(3) + ")"
        : isOpenPos
        ? "rgba(255,247,204,0.95)"
        : isSl
          ? "rgba(255,243,214,0.96)"
        : isPartialSl
            ? "rgba(255,255,255,0.96)"
          : isExit
            ? (num(p.item.pl) == null || num(p.item.pl) >= 0 ? "rgba(236,253,245,0.96)" : "rgba(254,242,242,0.96)")
          : isNewAverage
            ? "rgba(232,240,255,0.96)"
            : isBinanceExisting
              ? "rgba(255,247,214,0.96)"
              : isPendingManual
                ? "rgba(238,251,241,0.97)"
              : isManualEntry
                ? "rgba(236,253,255,0.96)"
                : "rgba(255,255,255,0.94)";
      ctx.strokeStyle = blinkOn
        ? "rgba(255,106,0," + (0.30 + blinkOn * 0.68).toFixed(3) + ")"
        : derivedStrokeStyle;
      ctx.lineWidth = isOtfSelected && !blinkOn ? 2 : 1;
      ctx.fillRect(ix(x),ix(y),p.w,p.h);
      if(isOtfSelected && !blinkOn){
        ctx.save();
        ctx.fillStyle = derivedStrokeStyle;
        ctx.globalAlpha = 0.025 + otfPulse * 0.045;
        ctx.fillRect(ix(x),ix(y),p.w,p.h);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = derivedStrokeStyle;
        ctx.globalAlpha = 0.30 + otfPulse * 0.42;
        ctx.shadowColor = derivedStrokeStyle;
        ctx.shadowBlur = 4 + otfPulse * 6;
        ctx.strokeRect(px(x),px(y),p.w,p.h);
        ctx.restore();
      }else{
        ctx.strokeRect(px(x),px(y),p.w,p.h);
      }
      if(showOtfCloseControl){
        ctx.save();
        ctx.fillStyle = blinkOn ? "rgba(255,214,10," + (0.18 + blinkOn * 0.78).toFixed(3) + ")" : "rgba(255,247,204,0.95)";
        ctx.strokeStyle = blinkOn ? "rgba(255,106,0," + (0.30 + blinkOn * 0.68).toFixed(3) + ")" : derivedStrokeStyle;
        ctx.lineWidth = 1;
        ctx.fillRect(ix(closeButtonX),ix(closeButtonY),closeButtonWidth,p.h);
        ctx.strokeRect(px(closeButtonX),px(closeButtonY),closeButtonWidth,p.h);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = closeSliderOpen ? "#b91c1c" : "#7f1d1d";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(px(closeGlyphX),px(closeGlyphY));
        ctx.lineTo(px(closeGlyphX + closeButtonSize),px(closeGlyphY + closeButtonSize));
        ctx.moveTo(px(closeGlyphX + closeButtonSize),px(closeGlyphY));
        ctx.lineTo(px(closeGlyphX),px(closeGlyphY + closeButtonSize));
        ctx.stroke();
        ctx.restore();
      }
      if(p.item.pendingSend){
        const triHeight = 12;
        const triHalf = triHeight / 2;
        const triWidth = Math.round(0.875 * triHeight);
        ctx.fillStyle = "#16a34a";
        ctx.beginPath();
        ctx.moveTo(ix(x - (1 + triWidth)), ix(y + p.h / 2 - triHalf));
        ctx.lineTo(ix(x - 1), ix(y + p.h / 2));
        ctx.lineTo(ix(x - (1 + triWidth)), ix(y + p.h / 2 + triHalf));
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = blinkOn
        ? "#111"
        : isSl
        ? "#8b5e14"
        : isPartialSl
          ? (num(p.item.pl) == null || num(p.item.pl) >= 0 ? "#047857" : "#7f1d1d")
        : isExit
          ? (num(p.item.pl) == null || num(p.item.pl) >= 0 ? "#047857" : "#7f1d1d")
        : isNewAverage
          ? "#1d4ed8"
          : isBinanceExisting
            ? "#8b5e14"
            : isManualEntry
              ? "#0f766e"
              : "#39414a";
      ctx.textAlign = "left";
      ctx.fillText(p.item.text,x + padX,y + p.h / 2 + 0.5);
      drawnBoxes.push({
        item:p.item,
        x,
        y,
        w:p.w,
        h:p.h,
        cx:x + p.w / 2,
        cy:y + p.h / 2
      });
      overlayLevelBoxes.push({
        x1:x,
        y1:y,
        x2:x + p.w,
        y2:y + p.h,
        row:p.item.row,
        type:p.item.type,
        orderKey:p.item.orderKey,
        binanceBacked:!!p.item.binanceBacked,
        openPosition:isOpenPos,
        draggable:(!isOpenPos && p.item.type !== "master-sl" && calcLevelsInteractive()) || (p.item.type === "master-sl" && calcSlInteractive())
      });
      if(showOtfCloseControl){
        overlayLevelBoxes.push({
          x1:closeButtonX,
          y1:closeButtonY,
          x2:closeButtonX + closeButtonWidth,
          y2:closeButtonY + p.h,
          controlType:"open-position-close-toggle",
          openPosition:true,
          draggable:false
        });
        if(closeSliderOpen && closePreview){
          const chsActive = !!openPositionCloseChs.active;
          const selectedMode = openPositionCloseMode();
          const chsValidOption = openPositionCloseChsValidOption(currentOpenPositionCloseChsValidKey());
          const remainingValidMs = chsActive ? openPositionCloseChsRemainingValidMs() : chsValidOption.ms;
          const selectorWidth = Math.min(196,Math.max(168,p.w + 18));
          const feedbackWidth = chsActive ? 176 : 0;
          const sliderWidth = selectorWidth;
          const anchorRight = x + p.w;
          const sliderX = clamp(anchorRight - sliderWidth,left + 2,chartRight - sliderWidth - 2);
          const sliderY = y + p.h + 4;
          const sliderH = chsActive ? 82 : 62;
          const feedbackH = chsActive ? 82 : 0;
          const feedbackX = chsActive
            ? clamp((sliderX + sliderWidth) - feedbackWidth,left + 2,chartRight - feedbackWidth - 2)
            : sliderX;
          const feedbackY = sliderY + sliderH + 4;
          const chipH = 14;
          const distW = 40;
          const modeW = 28;
          const modeGap = 4;
          const modeH = 14;
          const confirmW = p.h;
          const confirmSize = Math.max(8,p.h - 8);
          const confirmX = sliderX - 2 - confirmW;
          const confirmY = sliderY + Math.max(3,(sliderH - p.h) / 2);
          const confirmGlyphX = confirmX + Math.max(2,(confirmW - confirmSize) / 2);
          const confirmGlyphY = confirmY + Math.max(2,(p.h - confirmSize) / 2);
          const controlTotalW = modeW + modeGap + modeW + modeGap + distW;
          const controlStartX = sliderX + Math.max(8,(sliderWidth - controlTotalW) / 2);
          const modeMktX = controlStartX;
          const modeChsX = modeMktX + modeW + modeGap;
          const distX = modeChsX + modeW + modeGap;
          const cancelW = 54;
          const cancelX = sliderX + Math.max(8,(sliderWidth - cancelW) / 2);
          const cancelH = 12;
          const sliderTrackLeft = sliderX + 14;
          const sliderTrackRight = sliderX + sliderWidth - 12;
          const controlY = sliderY + sliderH - 20;
          const sliderTrackY = Math.round((sliderY + 20 + controlY - 10) / 2);
          const sliderThumbX = sliderTrackLeft + ((sliderTrackRight - sliderTrackLeft) * closePreview.percent / 100);
          const infoY = sliderY + 18;
          const cancelY = sliderY + sliderH - 38;
          const infoPl = closePreview.estPl == null ? 0 : closePreview.estPl;
          const infoColor = infoPl > 0 ? "#166534" : infoPl < 0 ? "#991b1b" : "#53351f";
          const summaryText = closePreview.percent + "% | " + fmtLot(closePreview.roundedQty) + " | " + fmtChartMoney(infoPl);
          const chsText = chsActive
            ? "CHS " + fmtLot(openPositionCloseChs.requestedQty) + " | fill " + fmtLot(openPositionCloseChs.filledQty) + " | rem " + fmtLot(openPositionCloseChs.remainingQty) + " | " + fmtPrice(openPositionCloseChs.price) + " | " + openPositionCloseChsTimerText(remainingValidMs)
            : "";
          otfClosePanels.push({
            blinkOn,
            derivedStrokeStyle,
            sliderX,
            sliderY,
            sliderWidth,
            sliderH,
            feedbackX,
            feedbackY,
            feedbackWidth,
            feedbackH,
            confirmX,
            confirmY,
            confirmW,
            confirmSize,
            confirmGlyphX,
            confirmGlyphY,
            modeMktX,
            modeChsX,
            distX,
            distW,
            controlY,
            modeW,
            modeH,
            chipH,
            sliderTrackLeft,
            sliderTrackRight,
            sliderTrackY,
            sliderThumbX,
            infoY,
            cancelX,
            cancelY,
            cancelW,
            cancelH,
            selectedMode,
            summaryText,
            infoColor,
            hasFeedback:chsActive,
            chsActive,
            chsText
          });
          overlayLevelBoxes.push({
            x1:confirmX,
            y1:confirmY,
            x2:confirmX + confirmW,
            y2:confirmY + p.h,
            controlType:"open-position-close-confirm",
            openPosition:true,
            draggable:false
          });
          overlayLevelBoxes.push({
            x1:modeMktX,
            y1:controlY,
            x2:modeMktX + modeW,
            y2:controlY + modeH,
            controlType:"open-position-close-mode-mkt",
            openPosition:true,
            draggable:false
          });
          overlayLevelBoxes.push({
            x1:modeChsX,
            y1:controlY,
            x2:modeChsX + modeW,
            y2:controlY + modeH,
            controlType:"open-position-close-mode-chs",
            openPosition:true,
            draggable:false
          });
          overlayLevelBoxes.push({
            x1:distX,
            y1:controlY,
            x2:distX + distW,
            y2:controlY + chipH,
            controlType:"open-position-close-chs-dist",
            openPosition:true,
            draggable:false
          });
          if(chsActive){
            overlayLevelBoxes.push({
              x1:cancelX,
              y1:cancelY,
              x2:cancelX + cancelW,
              y2:cancelY + cancelH,
              controlType:"open-position-close-chs-cancel",
              openPosition:true,
              draggable:false
            });
          }
          overlayLevelBoxes.push({
            x1:sliderTrackLeft - 6,
            y1:sliderTrackY - 8,
            x2:sliderTrackRight + 6,
            y2:sliderTrackY + 8,
            controlType:"open-position-close-slider",
            openPosition:true,
            draggable:false,
            sliderLeft:sliderTrackLeft,
            sliderRight:sliderTrackRight
          });
        }
      }
    });
    otfClosePanels.forEach(panel => {
      const fitPanelText = (text,maxWidth) => {
        const raw = String(text || "");
        if(!raw) return "";
        if(ctx.measureText(raw).width <= maxWidth) return raw;
        let out = raw;
        while(out.length > 1 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0,-1);
        return out.length < raw.length ? out + "..." : out;
      };
      const drawModeBox = (boxX,label,selected) => {
        ctx.fillStyle = selected ? "rgba(251,191,36,0.26)" : "rgba(255,255,255,0.85)";
        ctx.strokeStyle = selected ? "#92400e" : "rgba(146,64,14,0.42)";
        ctx.fillRect(ix(boxX),ix(panel.controlY),panel.modeW,panel.modeH);
        ctx.strokeRect(px(boxX),px(panel.controlY),panel.modeW,panel.modeH);
        ctx.fillStyle = selected ? "#92400e" : "#6b4423";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(label,boxX + panel.modeW / 2,panel.controlY + panel.modeH / 2 + 0.5);
      };
      const drawChip = (boxX,width,label,value,selected=false) => {
        ctx.fillStyle = selected ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.82)";
        ctx.strokeStyle = selected ? "#92400e" : "rgba(146,64,14,0.38)";
        ctx.fillRect(ix(boxX),ix(panel.controlY),width,panel.chipH);
        ctx.strokeRect(px(boxX),px(panel.controlY),width,panel.chipH);
        ctx.fillStyle = selected ? "#92400e" : "#6b4423";
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        const chipText = String(value || "").trim() ? (label + " " + value) : label;
        ctx.fillText(chipText,boxX + width / 2,panel.controlY + panel.chipH / 2 + 0.5);
      };
      ctx.save();
      ctx.fillStyle = "rgba(255,247,214,0.78)";
      ctx.strokeStyle = panel.derivedStrokeStyle;
      ctx.lineWidth = 1;
      ctx.fillRect(ix(panel.sliderX),ix(panel.sliderY),panel.sliderWidth,panel.sliderH);
      ctx.strokeRect(px(panel.sliderX),px(panel.sliderY),panel.sliderWidth,panel.sliderH);
      if(panel.hasFeedback){
        ctx.fillRect(ix(panel.feedbackX),ix(panel.feedbackY),panel.feedbackWidth,panel.feedbackH);
        ctx.strokeRect(px(panel.feedbackX),px(panel.feedbackY),panel.feedbackWidth,panel.feedbackH);
      }
      ctx.fillStyle = panel.blinkOn ? "rgba(255,214,10,0.32)" : "rgba(255,247,204,0.95)";
      ctx.strokeStyle = panel.blinkOn ? "rgba(255,106,0,0.70)" : panel.derivedStrokeStyle;
      ctx.fillRect(ix(panel.confirmX),ix(panel.confirmY),panel.confirmW,16);
      ctx.strokeRect(px(panel.confirmX),px(panel.confirmY),panel.confirmW,16);
      ctx.strokeStyle = "#166534";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(px(panel.confirmGlyphX),px(panel.confirmGlyphY + panel.confirmSize * 0.55));
      ctx.lineTo(px(panel.confirmGlyphX + panel.confirmSize * 0.38),px(panel.confirmGlyphY + panel.confirmSize));
      ctx.lineTo(px(panel.confirmGlyphX + panel.confirmSize),px(panel.confirmGlyphY));
      ctx.stroke();
      ctx.fillStyle = panel.infoColor;
      ctx.font = "11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        fitPanelText(panel.summaryText,(panel.hasFeedback ? panel.feedbackWidth : panel.sliderWidth) - 14),
        (panel.hasFeedback ? panel.feedbackX + panel.feedbackWidth / 2 : panel.sliderX + panel.sliderWidth / 2),
        (panel.hasFeedback ? panel.feedbackY + 18 : panel.infoY)
      );
      if(panel.chsActive){
        ctx.fillStyle = "#7f1d1d";
        ctx.font = "11px Arial";
        ctx.fillText(
          fitPanelText(panel.chsText,panel.feedbackWidth - 14),
          panel.feedbackX + panel.feedbackWidth / 2,
          panel.feedbackY + panel.feedbackH - 22
        );
        ctx.fillStyle = "rgba(254,242,242,0.86)";
        ctx.strokeStyle = "rgba(185,28,28,0.46)";
        ctx.fillRect(ix(panel.cancelX),ix(panel.cancelY),panel.cancelW,panel.cancelH);
        ctx.strokeRect(px(panel.cancelX),px(panel.cancelY),panel.cancelW,panel.cancelH);
        ctx.fillStyle = "#991b1b";
        ctx.font = "11px Arial";
        ctx.fillText("Cancel CHS",panel.cancelX + panel.cancelW / 2,panel.cancelY + panel.cancelH / 2 + 0.5);
      }
      drawModeBox(panel.modeMktX,"MKT",panel.selectedMode === "MKT");
      drawModeBox(panel.modeChsX,"CHS",panel.selectedMode === "CHS");
      drawChip(panel.distX,panel.distW,"Dist",String(currentOpenPositionCloseChsDistTicks()),panel.selectedMode === "CHS");
      ctx.strokeStyle = "rgba(107,114,128,0.80)";
      ctx.beginPath();
      ctx.moveTo(px(panel.sliderTrackLeft),px(panel.sliderTrackY));
      ctx.lineTo(px(panel.sliderTrackRight),px(panel.sliderTrackY));
      ctx.stroke();
      ctx.strokeStyle = "rgba(107,114,128,0.96)";
      ctx.beginPath();
      ctx.moveTo(px(panel.sliderTrackLeft),px(panel.sliderTrackY));
      ctx.lineTo(px(panel.sliderThumbX),px(panel.sliderTrackY));
      ctx.stroke();
      ctx.fillStyle = "rgba(82,82,91,0.98)";
      ctx.beginPath();
      ctx.arc(px(panel.sliderThumbX),px(panel.sliderTrackY),4,0,Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    const axisItems = [];
    const ordersOpenPosition = items.find(item => item && item.openPosition);
    const newAverage = items.find(item => item && item.type === "new-average");
    if(ordersOpenPosition) axisItems.push({item:ordersOpenPosition,color:"rgba(112,122,138,0.82)",fill:"rgba(255,247,204,0.98)"});
    if(newAverage) axisItems.push({item:newAverage,color:"rgba(37,99,235,0.78)",fill:"rgba(232,240,255,0.98)"});
    if(axisItems.length){
      const axisLeft = chartRight + 2;
      const axisRight = canvas.clientWidth - 2;
      const axisWidth = Math.max(22,axisRight - axisLeft);
      ctx.save();
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      axisItems.forEach(({item,color,fill}) => {
        const text = fmtPrice(item.level);
        const boxWidth = Math.max(34,Math.min(axisWidth - 2,Math.ceil(ctx.measureText(text).width) + 10));
        const boxX = axisLeft + Math.max(0,(axisWidth - boxWidth) / 2);
        const boxY = clamp(item.y - labelH / 2,top,chartBottom - labelH);
        ctx.strokeStyle = color;
        ctx.setLineDash([5,2]);
        ctx.beginPath();
        ctx.moveTo(px(chartRight),px(item.y));
        ctx.lineTo(px(boxX),px(item.y));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = color;
        ctx.fillStyle = fill;
        ctx.lineWidth = 1;
        ctx.fillRect(boxX,boxY,boxWidth,labelH);
        ctx.strokeRect(boxX,boxY,boxWidth,labelH);
        ctx.fillStyle = color;
        ctx.fillText(text,boxX + boxWidth / 2,boxY + labelH / 2 + 0.5);
      });
      ctx.restore();
    }
    publishOverlayDiagnostic({
      at:new Date().toISOString(),
      visible:levelsVisible,
      entries:overlayRows.entries.length,
      exits:overlayRows.exits.length,
      stop:overlayRows.stop ? 1 : 0,
      partialStops:(overlayRows.partialStops || []).length,
      newAverage:overlayRows.newAverage ? 1 : 0,
      drawn:items.length,
      boxes:overlayLevelBoxes.length,
      dragActive:!!overlayDrag.active
    });
  }
  function installDrawOverlayHook(){
    if(window.__calcLevelsDrawWrapped) return;
    if(typeof draw !== "function") return;
    window.__calcLevelsDrawWrapped = true;
    const prevDraw = draw;
    window.draw = draw = function(){
      const result = prevDraw.apply(this,arguments);
      try{ drawCalculatorLevelsOverlay(); }catch(e){ console.warn(MODULE + " levels overlay draw failed",e); }
      try{ window.CANDLE_CLOSE_COUNTDOWN?.draw?.(); }catch(_e){}
      return result;
    };
  }
  function installOverlayDragHooks(){
    if(!canvas || canvas.__calculatorOverlayDragHooks) return;
    canvas.__calculatorOverlayDragHooks = true;
    canvas.addEventListener("mousedown",e => {
      const hit = overlayBoxAtClient(e.clientX,e.clientY);
      if(otfEnabled && isOpenPositionCloseControl(hit)){
        handleOpenPositionCloseControlHit(hit,e.clientX);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(otfEnabled){
        if(!otfBoxEligible(hit)){
          if(otfSelection) clearOtfSelection();
          return;
        }
        if(!otfSelectionMatches({row:hit.row,type:hit.type})){
          selectOtfBox(hit);
          suppressNextOverlayClick = true;
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        overlayDrag.active = true;
        overlayDrag.row = hit.row || null;
        overlayDrag.target = hit.type === "master-sl" ? "sl" : "row";
        overlayDrag.moved = false;
        overlayDrag.otf = true;
        canvas.style.cursor = "pointer";
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(!calcLevelsInteractive()) return;
      if(!hit || !hit.draggable) return;
      if(hit.type !== "master-sl" && !hit.row) return;
      overlayDrag.active = true;
      overlayDrag.row = hit.row || null;
      overlayDrag.target = hit.type === "master-sl" ? "sl" : "row";
      overlayDrag.moved = false;
      overlayDrag.otf = false;
      if(overlayDrag.target === "sl") setStopLevelFromClientY(e.clientY);
      else setRowLevelFromClientY(hit.row,e.clientY);
      canvas.style.cursor = "pointer";
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);
    canvas.addEventListener("mousemove",e => {
      if(otfEnabled && openPositionCloseUi.dragging){
        if(setOpenPositionClosePercentFromClientX(e.clientX)) calculate();
        canvas.style.cursor = "pointer";
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(overlayDrag.active){
        overlayDrag.moved = true;
        if(overlayDrag.target === "sl") setStopLevelFromClientY(e.clientY);
        else setRowLevelFromClientY(overlayDrag.row,e.clientY);
        canvas.style.cursor = "pointer";
        if(overlayDrag.otf){
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if(dragChart || dragAxis) return;
      const hit = overlayBoxAtClient(e.clientX,e.clientY);
      if((otfEnabled && isOpenPositionCloseControl(hit)) || (otfEnabled && otfBoxEligible(hit)) || (calcLevelsInteractive() && hit && hit.draggable)) canvas.style.cursor = "pointer";
    },false);
    window.addEventListener("mouseup",e => {
      if(openPositionCloseUi.dragging){
        openPositionCloseUi.dragging = false;
        openPositionCloseUi.sliderLeft = null;
        openPositionCloseUi.sliderRight = null;
        e.preventDefault();
        e.stopImmediatePropagation();
        if(canvas) canvas.style.cursor = "crosshair";
        return;
      }
      if(!overlayDrag.active) return;
      const moved = !!overlayDrag.moved;
      const wasOtf = !!overlayDrag.otf;
      overlayDrag.active = false;
      overlayDrag.row = null;
      overlayDrag.target = "row";
      overlayDrag.moved = false;
      overlayDrag.otf = false;
      suppressNextOverlayClick = wasOtf ? moved : true;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(canvas) canvas.style.cursor = "crosshair";
      if(wasOtf && moved) confirmOtfSelection();
    },true);
    canvas.addEventListener("click",e => {
      if(suppressNextOverlayClick){
        suppressNextOverlayClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const hit = overlayBoxAtClient(e.clientX,e.clientY);
      if(otfEnabled && isOpenPositionCloseControl(hit)){
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(!otfEnabled) return;
      if(!otfBoxEligible(hit)){
        if(otfSelection) clearOtfSelection();
        return;
      }
      if(!otfSelectionMatches({row:hit.row,type:hit.type})){
        selectOtfBox(hit);
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);
    canvas.addEventListener("touchstart",e => {
      if(!e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const hit = overlayBoxAtClient(touch.clientX,touch.clientY);
      if(otfEnabled && isOpenPositionCloseControl(hit)){
        handleOpenPositionCloseControlHit(hit,touch.clientX);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(!otfEnabled) return;
      if(!otfBoxEligible(hit)){
        if(otfSelection) clearOtfSelection();
        return;
      }
      if(!otfSelectionMatches({row:hit.row,type:hit.type})){
        selectOtfBox(hit);
      }else{
        overlayDrag.active = true;
        overlayDrag.row = hit.row || null;
        overlayDrag.target = hit.type === "master-sl" ? "sl" : "row";
        overlayDrag.moved = false;
        overlayDrag.otf = true;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    },{capture:true,passive:false});
    canvas.addEventListener("touchmove",e => {
      if(otfEnabled && openPositionCloseUi.dragging){
        const touch = e.touches && e.touches[0];
        if(touch){
          if(setOpenPositionClosePercentFromClientX(touch.clientX)) calculate();
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(!overlayDrag.active || !overlayDrag.otf || !e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      overlayDrag.moved = true;
      if(overlayDrag.target === "sl") setStopLevelFromClientY(touch.clientY);
      else setRowLevelFromClientY(overlayDrag.row,touch.clientY);
      e.preventDefault();
      e.stopImmediatePropagation();
    },{capture:true,passive:false});
    canvas.addEventListener("touchend",e => {
      if(openPositionCloseUi.dragging){
        openPositionCloseUi.dragging = false;
        openPositionCloseUi.sliderLeft = null;
        openPositionCloseUi.sliderRight = null;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(!overlayDrag.active || !overlayDrag.otf) return;
      const moved = !!overlayDrag.moved;
      overlayDrag.active = false;
      overlayDrag.row = null;
      overlayDrag.target = "row";
      overlayDrag.moved = false;
      overlayDrag.otf = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(moved) confirmOtfSelection();
    },{capture:true,passive:false});
    if(!document.__calculatorOpenPositionCloseEscape){
      document.__calculatorOpenPositionCloseEscape = true;
      document.addEventListener("keydown",e => {
        if(e.key !== "Escape") return;
        if(!openPositionCloseUi.open) return;
        hideOpenPositionClosePanel();
        e.preventDefault();
        e.stopImmediatePropagation();
      },true);
    }
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
  function mapStopOrdersForCalculator(snapshot,pos){
    const sym = toUpper(snapshot && snapshot.symbol);
    const directionCtx = pos && pos.side === "SHORT" ? "SHORT" : "LONG";
    const opposite = directionCtx === "SHORT" ? "BUY" : "SELL";
    const stopOrders = [].concat(snapshot && snapshot.normalOrders || [], snapshot && snapshot.algoOrders || [])
      .filter(o => o && toUpper(o.symbol) === sym)
      .filter(isLiveOrder)
      .filter(o => toUpper(o.side) === opposite)
      .filter(o => {
        const ps = toUpper(o.positionSide || "");
        return !ps || ps === "BOTH" || ps === directionCtx;
      })
      .map(order => ({order,classification:classifyConditionalOrder(order)}))
      .filter(item => item.classification.kind === CONDITIONAL_KIND.MASTER_SL || item.classification.kind === CONDITIONAL_KIND.PSL);
    const master = stopOrders
      .filter(item => item.classification.kind === CONDITIONAL_KIND.MASTER_SL)
      .map(item => ({price:item.classification.triggerPrice,order:item.order,classification:item.classification}))
      .filter(item => item.price != null)
      .sort((a,b) => directionCtx === "LONG" ? b.price - a.price : a.price - b.price)[0] || null;
    const partialStops = stopOrders
      .filter(item => item.classification.kind === CONDITIONAL_KIND.PSL)
      .map((classifiedItem,index) => {
        const order = classifiedItem.order;
        const level = classifiedItem.classification.triggerPrice;
        const lot = classifiedItem.classification.quantity;
        if(level == null || lot == null || lot <= 0) return null;
        const partialStop = {
          level,
          lot,
          side:toUpper(order.side),
          source:"binance-partial-stop",
          meta:buildAlgoOrderMeta(order)
        };
        partialStop.rowId = stablePartialStopRowId(partialStop,index);
        return partialStop;
      })
      .filter(Boolean)
      .sort((a,b) => directionCtx === "LONG" ? b.level - a.level : a.level - b.level);
    return {
      master,
      partialStops,
      diagnostic:{
        stopOrdersFound:stopOrders.length,
        masterStopsFound:master ? 1 : 0,
        partialStopsFound:partialStops.length
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
  function openPositionSizeChanged(referencePos,livePos){
    const refQty = Math.abs(num(referencePos && referencePos.qty) || 0);
    const liveQty = Math.abs(num(livePos && livePos.qty) || 0);
    return !approxEqual(refQty,liveQty,1e-9);
  }
  function lastKnownOpenPositionContext(){
    const ref = lastReadStateSnapshot && lastReadStateSnapshot.openPosition ? lastReadStateSnapshot.openPosition : currentOpenPositionRowSnapshot();
    if(!ref || !(num(ref.qty) > 0) || !(num(ref.entry) > 0)) return null;
    return {
      symbol:currentSymbol(),
      side:ref.side === "SHORT" ? "SHORT" : "LONG",
      qty:num(ref.qty),
      entry:num(ref.entry),
      positionSide:toUpper(ref.positionSide || "")
    };
  }
  function clearFlatCleanupSignature(){
    lastFlatCleanupSignature = "";
  }
  function flatCleanupSignatureFor(position){
    if(!position || !position.side) return "";
    return [
      currentSymbol(),
      position.side === "SHORT" ? "SHORT" : "LONG",
      toUpper(position.positionSide || "")
    ].join("|");
  }
  function cleanupPositionSideMatches(order,target){
    const targetPs = toUpper(target && target.positionSide || "");
    const orderPs = toUpper(order && order.positionSide || "");
    if(targetPs === "LONG" || targetPs === "SHORT"){
      return !orderPs || orderPs === "BOTH" || orderPs === targetPs;
    }
    return !orderPs || orderPs === "BOTH";
  }
  function cleanupSideForPosition(target){
    return target && target.side === "SHORT" ? "BUY" : "SELL";
  }
  function isProtectiveStopForCleanup(order,target){
    if(!order || !target) return false;
    if(toUpper(order.symbol) !== toUpper(target.symbol || currentSymbol())) return false;
    if(!isLiveOrder(order)) return false;
    if(toUpper(order.side) !== cleanupSideForPosition(target)) return false;
    if(!cleanupPositionSideMatches(order,target)) return false;
    const classified = classifyConditionalOrder(order);
    if(classified.kind === CONDITIONAL_KIND.MASTER_SL || classified.kind === CONDITIONAL_KIND.PSL) return true;
    const typeText = toUpper(order && (order.type || order.origType || order.orderType || order.algoType || ""));
    return typeText.includes("STOP");
  }
  function isExitLimitForCleanup(order,target){
    if(!order || !target) return false;
    if(toUpper(order.symbol) !== toUpper(target.symbol || currentSymbol())) return false;
    if(!isLiveOrder(order) || !isLimitOrder(order)) return false;
    if(!cleanupPositionSideMatches(order,target)) return false;
    if(isReduceOnly(order)) return true;
    const side = toUpper(order.side);
    return target.side === "SHORT" ? side === "BUY" : side === "SELL";
  }
  function isSameDirectionClosePositionConditional(order,target){
    if(!order || !target) return false;
    if(toUpper(order.symbol) !== toUpper(target.symbol || currentSymbol())) return false;
    if(!isLiveOrder(order)) return false;
    if(toUpper(order.side) !== toUpper(target.side || "")) return false;
    if(!cleanupPositionSideMatches(order,target)) return false;
    const classified = classifyConditionalOrder(order);
    if(!classified.closePosition) return false;
    return classified.kind === CONDITIONAL_KIND.MASTER_SL
      || classified.kind === CONDITIONAL_KIND.MASTER_TP
      || /STOP|TAKE_PROFIT/.test(toUpper(order && (order.type || order.origType || order.orderType || order.algoType || "")));
  }
  function findSameDirectionClosePositionConditional(snapshot,target){
    const pool = [].concat(snapshot && snapshot.normalOrders || [], snapshot && snapshot.algoOrders || []);
    return pool.find(order => isSameDirectionClosePositionConditional(order,target)) || null;
  }
  function executionKeyForMasterStopTarget(target){
    if(!target) return "";
    return [
      String(target.symbol || currentSymbol()),
      toUpper(target.side || ""),
      toUpper(target.positionSide || "")
    ].join("|");
  }
  async function autoCleanupFlatPositionOrphans(referencePosition,snapshot,options={}){
    const target = referencePosition && referencePosition.side ? {
      symbol:currentSymbol(),
      side:referencePosition.side === "SHORT" ? "SHORT" : "LONG",
      positionSide:toUpper(referencePosition.positionSide || "")
    } : null;
    if(!target) return {snapshot:snapshot || null,position:null,attempted:false};
    const signature = flatCleanupSignatureFor(target);
    if(!signature || flatCleanupInFlight || lastFlatCleanupSignature === signature){
      return {snapshot:snapshot || null,position:null,attempted:false};
    }
    flatCleanupInFlight = true;
    try{
      const confirmedPosition = await signedPosition();
      if(confirmedPosition){
        clearFlatCleanupSignature();
        return {snapshot:snapshot || null,position:confirmedPosition,attempted:false,reappeared:true};
      }
      let liveSnapshot = snapshot;
      if(!liveSnapshot || liveSnapshot.normalFetchError || liveSnapshot.algoFetchError){
        liveSnapshot = await readOpenOrdersSnapshot();
      }
      const algoCancels = [];
      const normalCancels = [];
      (liveSnapshot && liveSnapshot.algoOrders || []).forEach(order => {
        if(isProtectiveStopForCleanup(order,target)){
          algoCancels.push({
            kind:"Protective stop",
            send:{
              symbol:String(target.symbol || currentSymbol()),
              algoId:order && order.algoId != null ? String(order.algoId) : null,
              clientAlgoId:order && order.clientAlgoId != null ? String(order.clientAlgoId) : ""
            }
          });
        }
      });
      (liveSnapshot && liveSnapshot.normalOrders || []).forEach(order => {
        if(isProtectiveStopForCleanup(order,target)){
          normalCancels.push({
            kind:"Protective stop",
            send:{
              symbol:String(target.symbol || currentSymbol()),
              orderId:order && order.orderId != null ? String(order.orderId) : null,
              origClientOrderId:order && order.clientOrderId != null ? String(order.clientOrderId) : ""
            }
          });
          return;
        }
        if(isExitLimitForCleanup(order,target)){
          normalCancels.push({
            kind:"Exit LIMIT",
            send:{
              symbol:String(target.symbol || currentSymbol()),
              orderId:order && order.orderId != null ? String(order.orderId) : null,
              origClientOrderId:order && order.clientOrderId != null ? String(order.clientOrderId) : ""
            }
          });
        }
      });
      let cancelled = 0;
      let failed = 0;
      for(const item of algoCancels){
        try{
          const send = {symbol:item.send.symbol};
          if(item.send.algoId) send.algoId = item.send.algoId;
          else if(item.send.clientAlgoId) send.clientAlgoId = item.send.clientAlgoId;
          else continue;
          await signedAlgoOrderWrite("DELETE",send);
          cancelled++;
        }catch(_e){
          failed++;
        }
      }
      for(const item of normalCancels){
        try{
          const send = {symbol:item.send.symbol};
          if(item.send.orderId) send.orderId = item.send.orderId;
          else if(item.send.origClientOrderId) send.origClientOrderId = item.send.origClientOrderId;
          else continue;
          await signedOrderWrite("DELETE",send);
          cancelled++;
        }catch(_e){
          failed++;
        }
      }
      lastFlatCleanupSignature = signature;
      const refreshedSnapshot = (algoCancels.length || normalCancels.length || !liveSnapshot)
        ? await readOpenOrdersSnapshot()
        : liveSnapshot;
      if(cancelled || failed){
        const summary = "Flat position confirmed. Auto-cleanup " + (failed ? "completed with failures" : "completed") + ". Cancelled " + cancelled + " orphan order(s)" + (failed ? "; " + failed + " failed." : ".");
        setStatus(summary);
      }
      return {snapshot:refreshedSnapshot,position:null,attempted:!!(algoCancels.length || normalCancels.length),cancelled,failed};
    }finally{
      flatCleanupInFlight = false;
    }
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
        side:sideForNewRow(rowType,contextDirection),
        reduceOnlyOverride:rowType === "exit"
      }
    };
    if(level == null || level <= 0 || lot == null || lot < 0.001){
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
    if(level == null || level <= 0 || lot == null || lot < 0.001){
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
        action:"Cancel",
        type:"LIMIT",
        side:toUpper(baseOrder && baseOrder.side) || "-",
        oldPrice:formatPlanValue(baseOrder && baseOrder.price,"price"),
        newPrice:"-",
        oldQty:formatPlanValue(baseOrder && baseOrder.origQty,"qty"),
        newQty:"-",
        orderId:baseOrder && baseOrder.orderId ? String(baseOrder.orderId) : (baseOrder && baseOrder.clientOrderId ? String(baseOrder.clientOrderId) : "-"),
        status:"Planned",
        response:"Deleted locally; will cancel existing Binance LIMIT order.",
        writable:true,
        mode:"limit-cancel-cbs",
        payload:{
          symbol:baseOrder && baseOrder.symbol ? baseOrder.symbol : currentSymbol(),
          orderId:baseOrder && baseOrder.orderId ? baseOrder.orderId : null,
          origClientOrderId:baseOrder && baseOrder.clientOrderId ? String(baseOrder.clientOrderId) : "",
          meta:baseOrder
        }
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
    const liveKeys = liveOrderKeySet(liveSnapshot);
    const baseMap = lastReadStateSnapshot && lastReadStateSnapshot.mappedLimitOrderMap instanceof Map
      ? lastReadStateSnapshot.mappedLimitOrderMap
      : new Map();
    const basePartialStopMap = lastReadStateSnapshot && lastReadStateSnapshot.mappedPartialStopOrderMap instanceof Map
      ? lastReadStateSnapshot.mappedPartialStopOrderMap
      : new Map();
    const entryRows = rows("calcModuleEntryRows");
    const exitRows = rows("calcModuleExitRows");
    const partialStopRows = rows("calcModulePartialStopRows");
    const presentBinanceKeys = new Set();
    const presentPartialStopKeys = new Set();
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
    limitRowRecords.filter(record => isRowMarkedForDeletion(record.row)).forEach(record => {
      const row = record.row;
      const meta = record.meta;
      const key = orderKeyFromMeta(meta);
      const baseOrder = key ? baseMap.get(key) : null;
      const liveOrder = key ? liveLimitMap.get(key) : null;
      if(key) presentBinanceKeys.add(key);
      if(!key || !baseOrder || !liveOrder){
        plan.blocked = true;
        addPlanRow(plan,{
          section:"LIMIT Orders",
          action:"Blocked",
          type:"Entry",
          side:"-",
          oldPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
          newPrice:"-",
          oldQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"Marked Binance Entry is missing required live order metadata.",
          writable:false,
          mode:"blocked",
          rowRef:row
        });
        return;
      }
      addPlanRow(plan,{
        section:"LIMIT Orders",
        action:"Cancel/Delete",
        type:"Entry",
        side:toUpper(baseOrder.side) || "-",
        oldPrice:formatPlanValue(baseOrder.price,"price"),
        newPrice:"-",
        oldQty:formatPlanValue(baseOrder.origQty,"qty"),
        newQty:"-",
        orderId:meta.orderId != null ? String(meta.orderId) : String(meta.clientOrderId || "-"),
        status:"Planned",
        response:"Marked for deletion; Binance cancellation occurs on Confirm.",
        writable:true,
        mode:"limit-cancel-cbs",
        rowRef:row,
        payload:{
          symbol:meta.symbol || baseOrder.symbol || currentSymbol(),
          orderId:meta.orderId != null ? meta.orderId : null,
          origClientOrderId:meta.clientOrderId ? String(meta.clientOrderId) : "",
          meta
        }
      });
    });
    const activeLimitRowRecords = limitRowRecords.filter(record => !isRowMarkedForDeletion(record.row));
    const livePositionQty = num(livePos && livePos.qty) || 0;
    const combinedExitQty = totalExitLots();
    if(combinedExitQty > livePositionQty + 1e-9){
      plan.blocked = true;
      addPlanRow(plan,{
        section:"LIMIT Orders",
        action:"Blocked",
        type:"Exit",
        side:"-",
        oldPrice:"-",
        newPrice:"-",
        oldQty:formatPlanValue(livePositionQty,"qty"),
        newQty:formatPlanValue(combinedExitQty,"qty"),
        orderId:"-",
        status:"Blocked",
        response:"Exits blocked — total Exit lots exceed live position size.",
        writable:false,
        mode:"blocked"
      });
    }

    if(true){
      const stopLevel = num(q("calcModuleStopLevel")?.value);
      const stopMath = calculateStopMath(readEntry(),stopLevel,readPartialStops());
      const includeMasterStop = shouldIncludeMasterStopInPlan();
      if(!livePos){
        if(includeMasterStop) addPlanRow(plan,{
          section:"SL Operation",
          action:"Skip",
          type:"Master SL",
          side:"-",
          oldPrice:"-",
          newPrice:formatPlanValue(stopLevel,"price"),
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Skipped",
          response:"Skipped stops — no open position",
          writable:false,
          mode:"skip"
        });
        partialStopRows.forEach((row,index) => {
          if(isRowEmpty(row)) return;
          addPlanRow(plan,{
            section:"SL Operation",
            action:"Skip",
            type:"PSL " + (index + 1),
            side:"-",
            oldPrice:"-",
            newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
            oldQty:"-",
            newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
            orderId:"-",
            status:"Skipped",
            response:"Skipped stops — no open position",
            writable:false,
            mode:"skip"
          });
        });
      }else if(stopMath.totalPartialQty > (num(livePos && livePos.qty) || 0) + 1e-9){
        plan.blocked = true;
        addPlanRow(plan,{
          section:"SL Operation",
          action:"Blocked",
          type:"PSL",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:formatPlanValue(stopMath.totalPartialQty,"qty"),
          orderId:"-",
          status:"Blocked",
          response:"Stops blocked — PSL lots exceed live position size.",
          writable:false,
          mode:"blocked"
        });
      }else{
        const liveAlgoStop = findStopOrderForPosition(livePos,liveSnapshot,true);
        const stopMeta = liveAlgoStop && liveAlgoStop.order
          ? buildAlgoOrderMeta(liveAlgoStop.order)
          : currentStopAlgoMeta;
        const stopKey = orderKeyFromMeta(stopMeta);
        if(!includeMasterStop){
          // Skip inactive or unchanged Master SL entirely so it cannot block unrelated sends.
        }else if(isMasterStopMarkedForDeletion()){
          if(stopMeta && stopKey && !liveKeys.has(stopKey)){
            plan.blocked = true;
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"Master SL",
              side:livePos.side === "SHORT" ? "BUY" : "SELL",
              oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
              newPrice:"-",
              oldQty:"-",
              newQty:"-",
              orderId:stopMeta.algoId != null ? String(stopMeta.algoId) : String(stopMeta.clientAlgoId || "-"),
              status:"Blocked",
              response:"Existing Master SL changed or executed since Read. Refresh required.",
              writable:false,
              mode:"blocked"
            });
            return plan;
          }else if(stopMeta && (stopMeta.algoId != null || String(stopMeta.clientAlgoId || "").trim() !== "")){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Cancel/Delete",
              type:"Master SL",
              side:toUpper(stopMeta.side) || (livePos.side === "SHORT" ? "BUY" : "SELL"),
              oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
              newPrice:"-",
              oldQty:"-",
              newQty:"-",
              orderId:stopMeta.algoId != null ? String(stopMeta.algoId) : String(stopMeta.clientAlgoId || "-"),
              status:"Planned",
              response:"Marked for deletion; Binance cancellation occurs on Confirm.",
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
            plan.blocked = true;
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"Master SL",
              side:livePos.side === "SHORT" ? "BUY" : "SELL",
              oldPrice:formatPlanValue(stopMeta && stopMeta.triggerPrice,"price"),
              newPrice:"-",
              oldQty:"-",
              newQty:"-",
              orderId:"-",
              status:"Blocked",
              response:"Existing Master SL is missing cancel metadata. Click Read and retry.",
              writable:false,
              mode:"blocked"
            });
          }
        }else if(stopMeta && stopKey && !liveKeys.has(stopKey)){
          plan.blocked = true;
          addPlanRow(plan,{
            section:"SL Operation",
            action:"Blocked",
            type:"Master SL",
            side:livePos.side === "SHORT" ? "BUY" : "SELL",
            oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
            newPrice:formatPlanValue(stopLevel,"price"),
            oldQty:"-",
            newQty:"-",
            orderId:stopMeta.algoId != null ? String(stopMeta.algoId) : String(stopMeta.clientAlgoId || "-"),
            status:"Blocked",
            response:"Existing Master SL changed or executed since Read. Refresh required.",
            writable:false,
            mode:"blocked"
          });
          return plan;
        }else{
          if(stopLevel == null || stopLevel <= 0){
            plan.blocked = true;
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"Master SL",
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
          const masterChanged = !stopMeta || !sameLevelValue(stopLevel,stopMeta.triggerPrice);
          if(stopMeta && !masterChanged){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Skip",
              type:"Master SL",
              side:livePos.side === "SHORT" ? "BUY" : "SELL",
              oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
              newPrice:formatPlanValue(stopLevel,"price"),
              oldQty:"-",
              newQty:"-",
              orderId:stopMeta.algoId != null ? String(stopMeta.algoId) : String(stopMeta.clientAlgoId || "-"),
              status:"Skipped",
              response:"Existing Master SL unchanged.",
              writable:false,
              mode:"skip"
            });
          }else if(stopMeta && (stopMeta.algoId != null || String(stopMeta.clientAlgoId || "").trim() !== "")){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Cancel",
              type:"Master SL",
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
          }else if(stopMeta){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"Master SL",
              side:livePos.side === "SHORT" ? "BUY" : "SELL",
              oldPrice:formatPlanValue(stopMeta.triggerPrice,"price"),
              newPrice:formatPlanValue(stopLevel,"price"),
              oldQty:"-",
              newQty:"-",
              orderId:"-",
              status:"Blocked",
              response:"Existing Master SL is missing cancel metadata. Click Read and retry.",
              writable:false,
              mode:"blocked"
            });
            plan.blocked = true;
          }
          const slSide = livePos.side === "SHORT" ? "BUY" : "SELL";
          const slPositionSide = toUpper(livePos.positionSide || "");
          if(masterChanged){
            addPlanRow(plan,{
              section:"SL Operation",
              action:stopMeta ? "Replace" : "New",
              type:"Master SL",
              side:slSide,
              oldPrice:"-",
              newPrice:formatPlanValue(stopLevel,"price"),
              oldQty:"-",
              newQty:"-",
              orderId:"-",
              status:"Planned",
              response:stopMeta ? "Cancel/replace because safe algo modify is unavailable." : "",
              writable:true,
              mode:"sl-create",
              payload:{
                symbol:plan.symbol,
                side:slSide,
                triggerPrice:stopLevel,
                positionSide:slPositionSide,
                workingType:stopMeta && stopMeta.workingType ? stopMeta.workingType : null,
                replaceAfterCancel:!!stopMeta,
                replaceKey:executionKeyForMasterStopTarget({symbol:plan.symbol,side:slSide,positionSide:slPositionSide})
              }
            });
          }
          }
        }
        partialStopRows.forEach((row,index) => {
          if(isRowEmpty(row)) return;
          const level = num(levelInput(row)?.value);
          const lot = num(lotInput(row)?.value);
          const meta = row.__binancePartialStopMeta || (row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
          const pslKey = orderKeyFromMeta(meta);
          if(pslKey) presentPartialStopKeys.add(pslKey);
          if(isRowMarkedForDeletion(row)){
            if(!meta || !pslKey || !liveKeys.has(pslKey)){
              plan.blocked = true;
              addPlanRow(plan,{
                section:"SL Operation",
                action:"Blocked",
                type:"PSL " + (index + 1),
                side:livePos.side === "SHORT" ? "BUY" : "SELL",
                oldPrice:formatPlanValue(num(meta && meta.triggerPrice),"price"),
                newPrice:"-",
                oldQty:formatPlanValue(num(meta && meta.origQty),"qty"),
                newQty:"-",
                orderId:meta && meta.algoId != null ? String(meta.algoId) : String(meta && meta.clientAlgoId || "-"),
                status:"Blocked",
                response:"Marked Binance PSL is missing required live order metadata.",
                writable:false,
                mode:"blocked",
                rowRef:row
              });
              return;
            }
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Cancel/Delete",
              type:"PSL " + (index + 1),
              side:toUpper(meta.side) || (livePos.side === "SHORT" ? "BUY" : "SELL"),
              oldPrice:formatPlanValue(meta.triggerPrice,"price"),
              newPrice:"-",
              oldQty:formatPlanValue(meta.origQty,"qty"),
              newQty:"-",
              orderId:meta.algoId != null ? String(meta.algoId) : String(meta.clientAlgoId || "-"),
              status:"Planned",
              response:"Marked for deletion; Binance cancellation occurs on Confirm.",
              writable:true,
              mode:"psl-cancel",
              rowRef:row,
              payload:{
                symbol:plan.symbol,
                algoId:meta.algoId != null ? meta.algoId : null,
                clientAlgoId:meta.clientAlgoId ? String(meta.clientAlgoId) : "",
                meta
              }
            });
            return;
          }
          if(meta && pslKey && !liveKeys.has(pslKey)){
            plan.blocked = true;
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"PSL " + (index + 1),
              side:livePos.side === "SHORT" ? "BUY" : "SELL",
              oldPrice:formatPlanValue(num(meta && meta.triggerPrice),"price"),
              newPrice:formatPlanValue(num(levelInput(row)?.value),"price"),
              oldQty:formatPlanValue(num(meta && meta.origQty),"qty"),
              newQty:formatPlanValue(num(lotInput(row)?.value),"qty"),
              orderId:meta.algoId != null ? String(meta.algoId) : String(meta.clientAlgoId || "-"),
              status:"Blocked",
              response:"Existing PSL changed or executed since Read. Refresh required.",
              writable:false,
              mode:"blocked"
            });
            return;
          }
          const oldPrice = num(meta && meta.triggerPrice);
          const oldQty = num(meta && meta.origQty);
          const side = livePos.side === "SHORT" ? "BUY" : "SELL";
          const ps = toUpper(livePos.positionSide || "");
          const invalid = level == null || level <= 0 || lot == null || lot < 0.001;
          if(invalid){
            plan.blocked = true;
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Blocked",
              type:"PSL " + (index + 1),
              side,
              oldPrice:formatPlanValue(oldPrice,"price"),
              newPrice:formatPlanValue(level,"price"),
              oldQty:formatPlanValue(oldQty,"qty"),
              newQty:formatPlanValue(lot,"qty"),
              orderId:meta && meta.algoId != null ? String(meta.algoId) : (meta && meta.clientAlgoId ? String(meta.clientAlgoId) : "-"),
              status:"Blocked",
              response:"Partial Stop level or quantity is invalid.",
              writable:false,
              mode:"blocked"
            });
            return;
          }
          const changed = !meta || !approxEqual(level,oldPrice,1e-8) || !approxEqual(lot,oldQty,1e-10);
          if(meta && changed && (meta.algoId != null || String(meta.clientAlgoId || "").trim() !== "")){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Cancel",
              type:"PSL " + (index + 1),
              side:toUpper(meta.side) || side,
              oldPrice:formatPlanValue(oldPrice,"price"),
              newPrice:"-",
              oldQty:formatPlanValue(oldQty,"qty"),
              newQty:"-",
              orderId:meta.algoId != null ? String(meta.algoId) : String(meta.clientAlgoId || "-"),
              status:"Planned",
              response:"",
              writable:true,
              mode:"psl-cancel",
              payload:{
                symbol:plan.symbol,
                algoId:meta.algoId != null ? meta.algoId : null,
                clientAlgoId:meta.clientAlgoId ? String(meta.clientAlgoId) : "",
                meta
              }
            });
          }
          if(!changed){
            addPlanRow(plan,{
              section:"SL Operation",
              action:"Skip",
              type:"PSL " + (index + 1),
              side,
              oldPrice:formatPlanValue(oldPrice,"price"),
              newPrice:formatPlanValue(level,"price"),
              oldQty:formatPlanValue(oldQty,"qty"),
              newQty:formatPlanValue(lot,"qty"),
              orderId:meta && meta.algoId != null ? String(meta.algoId) : (meta && meta.clientAlgoId ? String(meta.clientAlgoId) : "-"),
              status:"Skipped",
              response:"Existing PSL unchanged.",
              writable:false,
              mode:"skip"
            });
            return;
          }
          addPlanRow(plan,{
            section:"SL Operation",
            action:meta ? "Replace" : "New",
            type:"PSL " + (index + 1),
            side,
            oldPrice:"-",
            newPrice:formatPlanValue(level,"price"),
            oldQty:"-",
            newQty:formatPlanValue(lot,"qty"),
            orderId:"-",
            status:"Planned",
            response:meta ? "Cancel/replace because safe algo modify is unavailable." : "",
            writable:true,
            mode:"psl-create",
            rowRef:row,
            payload:{
              symbol:plan.symbol,
              side,
              triggerPrice:level,
              quantity:lot,
              positionSide:ps,
              workingType:meta && meta.workingType ? meta.workingType : null
            }
          });
        });
        basePartialStopMap.forEach((baseStop,key) => {
          if(presentPartialStopKeys.has(key)) return;
          if(!(baseStop && (baseStop.algoId != null || String(baseStop.clientAlgoId || "").trim() !== ""))) return;
          addPlanRow(plan,{
            section:"SL Operation",
            action:"Cancel",
            type:"PSL",
            side:toUpper(baseStop.side) || (livePos.side === "SHORT" ? "BUY" : "SELL"),
            oldPrice:formatPlanValue(baseStop.triggerPrice,"price"),
            newPrice:"-",
            oldQty:formatPlanValue(baseStop.origQty,"qty"),
            newQty:"-",
            orderId:baseStop.algoId != null ? String(baseStop.algoId) : String(baseStop.clientAlgoId || "-"),
            status:"Planned",
            response:"Deleted locally; will cancel existing Binance PSL.",
            writable:true,
            mode:"psl-cancel",
            payload:{
              symbol:plan.symbol,
              algoId:baseStop.algoId != null ? baseStop.algoId : null,
              clientAlgoId:baseStop.clientAlgoId ? String(baseStop.clientAlgoId) : "",
              meta:baseStop
            }
          });
        });
      }
    }

    if(cbsEnabled){
      const cancelAdded = new Set();
      const cbsBlockedRows = new Set();
      activeLimitRowRecords.forEach(record => {
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
      activeLimitRowRecords.forEach(record => {
        if(cbsBlockedRows.has(record.row)) return;
        prepareManualRowPlan(plan,record.row,record.rowType,contextDirection);
      });
    }else{
      activeLimitRowRecords.forEach(record => {
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
      .filter(isLiveOrder)
      .filter(o => !isStopOrder(o));
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

    const hasManualWritableRows = activeLimitRowRecords.some(record => {
      const row = record && record.row;
      return row && !isRowEmpty(row) && !isOpenPositionRow(row) && !(record.meta && row.dataset && row.dataset.source === "binance-limit");
    });
    const hasExistingBinanceRows = activeLimitRowRecords.some(record => {
      const row = record && record.row;
      return !!(record && record.meta && row && row.dataset && row.dataset.source === "binance-limit");
    });
    if(!lastReadStateSnapshot && !hasManualWritableRows && (hasExistingBinanceRows || !!livePos || !!slSendEnabled || !!cbsEnabled)){
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
  function applyWriteSuccessToPartialStopRow(row,response,fallback){
    if(!row) return;
    const base = fallback && typeof fallback === "object" ? fallback : {};
    const merged = Object.assign({},base,response || {});
    if(response && response.algoId != null) merged.algoId = response.algoId;
    if(response && response.clientAlgoId != null) merged.clientAlgoId = response.clientAlgoId;
    if(response && response.orderId != null) merged.orderId = response.orderId;
    if(response && response.clientOrderId != null) merged.clientOrderId = response.clientOrderId;
    if(!merged.symbol) merged.symbol = currentSymbol();
    if(!merged.type) merged.type = "STOP_MARKET";
    if(!merged.algoType) merged.algoType = "CONDITIONAL";
    if(merged.triggerPrice == null && base.triggerPrice != null) merged.triggerPrice = base.triggerPrice;
    if(merged.origQty == null && base.quantity != null) merged.origQty = base.quantity;
    const meta = buildAlgoOrderMeta(merged);
    applyPartialStopSourceAndMeta(row,{
      source:"binance-partial-stop",
      meta,
      rowId:stablePartialStopRowId({meta,level:meta.triggerPrice,lot:meta.origQty,side:meta.side},0)
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
  async function runPlanWriteRow(rowPlan,contextDirection,executionContext){
    if(!rowPlan || !rowPlan.writable) return {ok:true,skip:true};
    if(rowPlan.mode === "sl-cancel" || rowPlan.mode === "psl-cancel"){
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
    if(rowPlan.mode === "psl-create"){
      const p = rowPlan.payload || {};
      const send = {
        symbol:String(p.symbol || currentSymbol()),
        side:String(p.side || ""),
        algoType:"CONDITIONAL",
        type:"STOP_MARKET",
        quantity:String(Number(p.quantity)),
        triggerPrice:String(Number(p.triggerPrice)),
        workingType:String(p.workingType || "CONTRACT_PRICE")
      };
      const ps = toUpper(p.positionSide || "");
      if(ps === "LONG" || ps === "SHORT") send.positionSide = ps;
      if(!send.positionSide || send.positionSide === "BOTH") send.reduceOnly = "true";
      const resp = await signedAlgoOrderWrite("POST",send);
      applyWriteSuccessToPartialStopRow(rowPlan.rowRef,resp,{
        symbol:send.symbol,
        side:send.side,
        positionSide:send.positionSide || "BOTH",
        type:send.type,
        algoType:send.algoType,
        triggerPrice:send.triggerPrice,
        origQty:send.quantity,
        quantity:send.quantity,
        workingType:send.workingType
      });
      const meta = rowPlan.rowRef && rowPlan.rowRef.__binancePartialStopMeta ? rowPlan.rowRef.__binancePartialStopMeta : null;
      return {ok:true,response:resp,blinkKey:partialStopKeyFromMeta(meta,send.side)};
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
      if(p.replaceAfterCancel){
        const replaceKey = String(p.replaceKey || executionKeyForMasterStopTarget({symbol:send.symbol,side:send.side,positionSide:send.positionSide || ""}));
        const replaceState = executionContext && executionContext.slReplaceState instanceof Map ? executionContext.slReplaceState.get(replaceKey) : null;
        if(!replaceState || !replaceState.cancelConfirmed){
          throw new Error("Existing Master SL cancel not confirmed. Replacement was not sent.");
        }
        const refreshedSnapshot = await readOpenOrdersSnapshot();
        const lingering = findSameDirectionClosePositionConditional(refreshedSnapshot,{
          symbol:send.symbol,
          side:send.side,
          positionSide:send.positionSide || ""
        });
        if(lingering) throw new Error("Existing Master SL still active.");
      }
      const resp = await signedAlgoOrderWrite("POST",send);
      currentStopAlgoMeta = buildAlgoOrderMeta(Object.assign({
        symbol:send.symbol,
        side:send.side,
        positionSide:send.positionSide || "",
        type:send.type,
        algoType:send.algoType,
        triggerPrice:send.triggerPrice,
        closePosition:"true",
        workingType:send.workingType
      },resp || {}));
      masterStopDraftDirty = false;
      const blinkKey = orderKeyFromMeta(currentStopAlgoMeta);
      return {ok:true,response:resp,blinkKey};
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
      const meta = rowPlan.rowRef && rowPlan.rowRef.__binanceLimitOrderMeta ? rowPlan.rowRef.__binanceLimitOrderMeta : null;
      return {ok:true,response:resp,blinkKey:orderKeyFromMeta(meta)};
    }
    if(rowPlan.mode === "new"){
      const p = rowPlan.payload || {};
      const ps = inferPositionSideForNewOrder(contextDirection,rowPlan.livePosition || null,rowPlan);
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
      const meta = rowPlan.rowRef && rowPlan.rowRef.__binanceLimitOrderMeta ? rowPlan.rowRef.__binanceLimitOrderMeta : null;
      return {ok:true,response:resp,blinkKey:orderKeyFromMeta(meta)};
    }
    return {ok:true,skip:true};
  }
  function expressExecutionPriority(rowPlan){
    if(!rowPlan) return 99;
    const mode = String(rowPlan.mode || "");
    if(mode === "sl-cancel" || mode === "sl-create" || mode === "psl-cancel" || mode === "psl-create") return 30;
    if(mode === "new"){
      const source = rowPlan.rowRef && rowPlan.rowRef.dataset ? String(rowPlan.rowRef.dataset.source || "") : "";
      return source === "binance-limit" ? 20 : 10;
    }
    if(mode === "modify" || mode === "limit-cancel-cbs") return 20;
    return 40;
  }
  function orderedExecutionRows(plan,mode){
    const rowsList = Array.isArray(plan && plan.rows) ? plan.rows.map((row,index) => ({row,index})) : [];
    const current = currentPriceReference();
    const targetGroup = row => {
      if(!row) return "";
      if(row.section === "SL Operation" && ["sl-cancel","sl-create","psl-cancel","psl-create"].includes(String(row.mode || ""))) return "stop";
      if(row.type === "Exit" && ["new","modify"].includes(String(row.mode || ""))) return "exit";
      return "";
    };
    const targetLevel = row => {
      const payload = row && row.payload || {};
      const meta = payload.meta || {};
      for(const value of [payload.triggerPrice,payload.price,payload.level,meta.triggerPrice,meta.price,row && row.newPrice,row && row.oldPrice]){
        const cleaned = typeof value === "string" ? value.replace(/,/g,"") : value;
        const n = num(cleaned);
        if(n != null && n >= 0) return n;
      }
      return null;
    };
    const modeRank = row => String(row && row.mode || "").includes("cancel") ? 0 : 1;
    rowsList.sort((a,b) => {
      if(mode === "express"){
        const priorityDiff = expressExecutionPriority(a.row) - expressExecutionPriority(b.row);
        if(priorityDiff) return priorityDiff;
      }
      const ag = targetGroup(a.row);
      const bg = targetGroup(b.row);
      if(ag && ag === bg && current != null){
        if(ag === "stop"){
          const rankDiff = modeRank(a.row) - modeRank(b.row);
          if(rankDiff) return rankDiff;
        }
        const al = targetLevel(a.row);
        const bl = targetLevel(b.row);
        if(al != null && bl != null){
          const distanceDiff = Math.abs(al - current) - Math.abs(bl - current);
          if(Math.abs(distanceDiff) > 1e-9) return distanceDiff;
          const rankDiff = modeRank(a.row) - modeRank(b.row);
          if(rankDiff) return rankDiff;
        }
      }
      return a.index - b.index;
    });
    return rowsList.map(item => item.row);
  }
  function rememberConfirmedPartialStopCancels(plan){
    const rowsList = Array.isArray(plan && plan.rows) ? plan.rows : [];
    rowsList.forEach(rowPlan => {
      if(!rowPlan || rowPlan.mode !== "psl-cancel" || rowPlan.status !== "Confirmed") return;
      const meta = rowPlan.payload && rowPlan.payload.meta ? rowPlan.payload.meta : null;
      const key = partialStopKeyFromMeta(meta,rowPlan.side);
      if(key) suppressedPartialStopKeys.add(key);
    });
  }
  function purgeConfirmedMarkedDeletionRows(plan){
    (Array.isArray(plan && plan.rows) ? plan.rows : []).forEach(rowPlan => {
      if(rowPlan && rowPlan.mode === "sl-cancel" && rowPlan.status === "Confirmed" && isMasterStopMarkedForDeletion()){
        clearMasterStopBinanceState();
        return;
      }
      const row = rowPlan && rowPlan.rowRef;
      if(!row || rowPlan.status !== "Confirmed" || !isRowMarkedForDeletion(row)) return;
      if(rowPlan.mode === "psl-cancel") clearPartialStopMetaOnRow(row);
      else if(rowPlan.mode === "limit-cancel-cbs") clearBinanceMetaOnRow(row);
      else return;
      row.remove();
    });
    refreshEntryRowNumbers();
    refreshPartialStopRowNumbers();
    calculate();
  }
  function purgeSuppressedPartialStopRows(){
    if(!suppressedPartialStopKeys.size) return;
    rows("calcModulePartialStopRows").forEach(row => {
      const meta = row.__binancePartialStopMeta || (row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
      const key = partialStopKeyFromMeta(meta,null);
      if(!key || !suppressedPartialStopKeys.has(key)) return;
      clearPartialStopMetaOnRow(row);
      row.remove();
    });
    refreshPartialStopRowNumbers();
  }
  function dedupePartialStopRows(){
    const seen = new Set();
    rows("calcModulePartialStopRows").forEach(row => {
      const meta = row.__binancePartialStopMeta || (row.dataset && row.dataset.calcPartialStopRowId ? binancePartialStopMetaByRowId.get(row.dataset.calcPartialStopRowId) : null);
      const side = meta && meta.side ? meta.side : "";
      const key = partialStopKeyFromMeta(meta,side) || partialStopFallbackKey(side,levelInput(row)?.value,lotInput(row)?.value);
      if(!key) return;
      if(seen.has(key)){
        clearPartialStopMetaOnRow(row);
        row.remove();
        return;
      }
      seen.add(key);
    });
    refreshPartialStopRowNumbers();
  }
  function rowNeedsSendResultReview(row){
    if(!row) return false;
    const responseText = String(row.response || "").toLowerCase();
    return row.action === "Blocked"
      || row.status === "Blocked"
      || row.status === "Failed"
      || row.status === "Rejected"
      || !!row.unexpectedResponse
      || responseText.includes("reject")
      || responseText.includes("blocked")
      || responseText.includes("unexpected binance response");
  }
  function planNeedsSendResultReview(plan){
    return !!(plan && Array.isArray(plan.rows) && plan.rows.some(rowNeedsSendResultReview));
  }
  async function validateLivePartialStopQuantity(plan){
    const total = totalPartialStopLots();
    if(total <= 0){
      clearPartialStopLotInvalidState();
      return true;
    }
    const livePos = await signedPosition();
    const liveQty = num(livePos && livePos.qty) || 0;
    if(total <= liveQty + 1e-9){
      refreshLiveStopsValidity(livePos,true);
      return true;
    }
    plan.blocked = true;
    plan.canConfirm = false;
    addPlanRow(plan,{
      section:"SL Operation",
      action:"Blocked",
      type:"PSL",
      side:"-",
      oldPrice:"-",
      newPrice:"-",
      oldQty:formatPlanValue(liveQty,"qty"),
      newQty:formatPlanValue(total,"qty"),
      orderId:"-",
      status:"Blocked",
      response:"Stops blocked — PSL lots exceed live position size.",
      writable:false,
      mode:"blocked"
    });
    refreshLiveStopsValidity(livePos,true);
    return false;
  }
  async function validateLiveExitQuantity(plan){
    const total = totalExitLots();
    if(total <= 0){
      clearExitLotInvalidState();
      return true;
    }
    const livePos = await signedPosition();
    const liveQty = num(livePos && livePos.qty) || 0;
    if(total <= liveQty + 1e-9){
      refreshLiveExitsValidity(livePos,true);
      return true;
    }
    plan.blocked = true;
    plan.canConfirm = false;
    addPlanRow(plan,{
      section:"LIMIT Orders",
      action:"Blocked",
      type:"Exit",
      side:"-",
      oldPrice:"-",
      newPrice:"-",
      oldQty:formatPlanValue(liveQty,"qty"),
      newQty:formatPlanValue(total,"qty"),
      orderId:"-",
      status:"Blocked",
      response:"Exits blocked — total Exit lots exceed live position size.",
      writable:false,
      mode:"blocked"
    });
    refreshLiveExitsValidity(livePos,true);
    return false;
  }
  async function executeSendPlan(plan,options={}){
    if(!plan || !Array.isArray(plan.rows)) return;
    if(!plan.canConfirm){
      if(options.showPopupOnError !== false) plan.showPopup = true;
      setStatus(options.blockedStatus || "Confirm Send blocked. Run Send preflight again.");
      renderSendPlanTable();
      return {ok:false,failed:0,blocked:true,writable:0,confirmed:0,skipped:0};
    }
    try{
      if(!await validateLiveExitQuantity(plan)){
        if(options.showPopupOnError !== false) plan.showPopup = true;
        setStatus(options.blockedStatus || "Confirm Send blocked. Review Exits.");
        renderSendPlanTable();
        return {ok:false,failed:0,blocked:true,writable:0,confirmed:0,skipped:0};
      }
      if(!await validateLivePartialStopQuantity(plan)){
        if(options.showPopupOnError !== false) plan.showPopup = true;
        setStatus(options.blockedStatus || "Confirm Send blocked. Review Stops.");
        renderSendPlanTable();
        return {ok:false,failed:0,blocked:true,writable:0,confirmed:0,skipped:0};
      }
    }catch(e){
      plan.blocked = true;
      plan.canConfirm = false;
      if(options.showPopupOnError !== false) plan.showPopup = true;
      setStatus("Confirm Send blocked. Live position validation failed.");
      renderSendPlanTable();
      return {ok:false,failed:0,blocked:true,writable:0,confirmed:0,skipped:0};
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
      const executionContext = {slReplaceState:new Map()};
      for(const rowPlan of orderedExecutionRows(plan,executionMode)){
        if(!rowPlan) continue;
        if(!rowPlan.writable){
          if(rowPlan.action === "Skip") rowPlan.status = "Skipped";
          else if(rowPlan.action === "Ignored") rowPlan.status = "Ignored";
          else if(rowPlan.action === "Blocked") rowPlan.status = "Blocked";
          if(!options.hidePopupUntilComplete) renderSendPlanTable();
          continue;
        }
        rowPlan.status = "Pending";
        rowPlan.response = "";
        if(!options.hidePopupUntilComplete) renderSendPlanTable();
        try{
          const out = await runPlanWriteRow(rowPlan,contextDirection,executionContext);
          if(out && out.skip){
            rowPlan.status = "Skipped";
          }else{
            const resp = out && out.response ? out.response : null;
            rowPlan.binanceResponse = resp;
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
              if(out && out.blinkKey && (rowPlan.mode === "new" || rowPlan.mode === "modify" || ((rowPlan.mode === "sl-create" || rowPlan.mode === "psl-create") && rowPlan.action === "Replace"))){
                triggerConfirmedOrderBlink(out.blinkKey);
              }
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
        if(rowPlan.mode === "sl-cancel"){
          const replaceKey = rowPlan.payload && rowPlan.payload.meta
            ? executionKeyForMasterStopTarget({
                symbol:rowPlan.payload.meta.symbol || currentSymbol(),
                side:rowPlan.payload.meta.side || rowPlan.side,
                positionSide:rowPlan.payload.meta.positionSide || ""
              })
            : "";
          if(replaceKey) executionContext.slReplaceState.set(replaceKey,{cancelConfirmed:rowPlan.status === "Confirmed"});
        }
        if(rowPlan.type === "Master SL" && rowPlan.status === "Failed"){
          rowPlan.response = (rowPlan.response ? rowPlan.response + " | " : "") + "Position may be unprotected.";
        }
        if(!options.hidePopupUntilComplete) renderSendPlanTable();
      }
    });
    plan.executing = false;
    plan.canConfirm = false;
    plan.showPopup = executionMode === "express" ? planNeedsSendResultReview(plan) : true;
    rememberConfirmedPartialStopCancels(plan);
    purgeConfirmedMarkedDeletionRows(plan);
    purgeSuppressedPartialStopRows();
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
    return {
      ok:failed === 0,
      failed,
      blocked:false,
      writable:writable.length,
      confirmed:writable.filter(r => r && r.status === "Confirmed").length,
      skipped:writable.filter(r => r && r.status === "Skipped").length
    };
  }
  async function executeDirectSend(){
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
          type:"Send",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"API keys are required before Send.",
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:false,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      renderSendPlanTable();
      setStatus("Send blocked. API keys required.");
      return;
    }
    updateSendButtonState(true);
    setStatus("Send: reading live Binance state...");
    try{
      const preflightState = await withCalculatorOwnedRefresh("preflightRead",async() => {
        const livePos = await signedPosition();
        const liveSnapshot = await readOpenOrdersSnapshot();
        return {livePos,liveSnapshot};
      });
      const livePos = preflightState.livePos;
      const liveSnapshot = preflightState.liveSnapshot;
      refreshLiveStopsValidity(livePos,true);
      refreshLiveExitsValidity(livePos,true);
      updateAutoSyncBaseline(livePos,liveSnapshot);
      if(!lastReadStateSnapshot) lastReadStateSnapshot = buildReadStateSnapshot(livePos,liveSnapshot,currentMappedRowsForBaseline());
      sendPlanState = applyExpressPayloadSafeguards(buildPlanFromCurrentRows(livePos,liveSnapshot));
      sendPlanState.stale = false;
      sendPlanState.staleReason = "";
      sendPlanState.showPopup = false;
      if(!sendPlanState.canConfirm){
        sendPlanState.showPopup = true;
        renderSendPlanTable();
        setStatus("Send blocked. Review results.");
        return;
      }
      const result = await executeSendPlan(sendPlanState,{
        executionMode:"express",
        hidePopupUntilComplete:true,
        contextDirection:inferDirectionForSend(livePos),
        blockedStatus:"Send blocked. Review results.",
        inProgressStatus:"Send executing...",
        donePrefix:"Send"
      });
      if(result && result.ok){
        clearSendPlan({source:"resultWindowClose"});
        setStatus("Send confirmed.");
        blinkSendSuccess();
      }else{
        if(sendPlanState) sendPlanState.showPopup = true;
        renderSendPlanTable();
      }
    }catch(e){
      sendPlanState = {
        planId:++sendPlanSeq,
        at:new Date().toISOString(),
        symbol:currentSymbol(),
        rows:[{
          action:"Blocked",
          type:"Send",
          side:"-",
          oldPrice:"-",
          newPrice:"-",
          oldQty:"-",
          newQty:"-",
          orderId:"-",
          status:"Blocked",
          response:"Send failed: " + (e && e.message ? e.message : String(e)),
          writable:false,
          mode:"blocked"
        }],
        blocked:true,
        canConfirm:false,
        executing:false,
        stale:false,
        cbsEnabled:false,
        slSendEnabled:!!slSendEnabled,
        showPopup:true
      };
      renderSendPlanTable();
      setStatus("Send failed.");
    }finally{
      updateSendButtonState(false);
    }
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
      refreshLiveStopsValidity(livePos,true);
      refreshLiveExitsValidity(livePos,true);
      updateAutoSyncBaseline(livePos,liveSnapshot);
      if(!lastReadStateSnapshot) lastReadStateSnapshot = buildReadStateSnapshot(livePos,liveSnapshot,currentMappedRowsForBaseline());
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
      refreshLiveStopsValidity(livePos,true);
      refreshLiveExitsValidity(livePos,true);
      updateAutoSyncBaseline(livePos,liveSnapshot);
      if(!lastReadStateSnapshot) lastReadStateSnapshot = buildReadStateSnapshot(livePos,liveSnapshot,currentMappedRowsForBaseline());
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
    const classified = classifyConditionalOrder(order);
    return (classified.kind === CONDITIONAL_KIND.MASTER_SL || classified.kind === CONDITIONAL_KIND.PSL) && classified.triggerPrice != null;
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
      .filter(o => String(o.side || "").toUpperCase() === opposite)
      .filter(o => {
        const ps = String(o.positionSide || "").toUpperCase();
        return !ps || ps === "BOTH" || ps === pos.side;
      })
      .map(order => ({order,classification:classifyConditionalOrder(order)}))
      .filter(item => item.classification.kind === CONDITIONAL_KIND.MASTER_SL)
      .map(item => ({price:item.classification.triggerPrice, order:item.order, classification:item.classification}))
      .filter(x => x.price != null);
    if(!candidates.length) return null;
    const poolSource = candidates;
    const directional = poolSource.filter(x => pos.side === "LONG" ? x.price < pos.entry : x.price > pos.entry);
    const pool = directional.length ? directional : poolSource;
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
    if(!opts.preserveSendPlan) lastReadStateSnapshot = null;
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
      masterStopsFound:0,
      partialStopsFound:0,
      openOrdersReadStatus:"not-requested"
    };
    suppressCalculatorOverlayDraw = true;
    try{
      const preserveLocalBinanceEdits = !!opts.autoSync || source === "binanceStateWatcher" || source === "autoWatch";
      binanceSyncPreservedRows = preserveLocalBinanceEdits ? snapshotEditedBinanceRows() : [];
      binanceSyncPreserveKeys = new Set(binanceSyncPreservedRows.map(item => item.key).filter(Boolean));
      const preservedEntryRows = snapshotManualRows("calcModuleEntryRows");
      const previousLivePosition = lastKnownOpenPositionContext();
      let pos = (isOwnedRefresh
        ? await withCalculatorOwnedRefresh(source,async() => ({pos:await signedPosition() || openBoxPosition()}))
        : {pos:await signedPosition() || openBoxPosition()}).pos;
      unlockEntryRows();
      if(pos){
        clearFlatCleanupSignature();
        diag.positionSource = pos.source || null;
        diag.positionSide = pos.side || null;
        setDirection(pos.side);
        setRows(
          "calcModuleEntryRows",
          [{level:pos.entry,lot:pos.qty}],
          {lockFirstRow:true,openPositionFirstRow:true,keepRemoveEnabledFirstRow:true}
        );
        restoreManualRows("calcModuleEntryRows",preservedEntryRows);
      }else{
        unlockEntryRows();
        clearOpenPositionRows();
        resetOpenPositionCloseUi();
      }

      purgeSuppressedPartialStopRows();

      let snapshot = null;
      let mapped = null;
      let activeLimitKeys = new Set();
      let activePartialStopKeys = new Set();
      try{
        snapshot = isOwnedRefresh
          ? await withCalculatorOwnedRefresh(source,() => readOpenOrdersSnapshot())
          : await readOpenOrdersSnapshot();
        const normalErr = !!snapshot.normalFetchError;
        const algoErr = !!snapshot.algoFetchError;
        diag.openOrdersReadStatus = normalErr && algoErr ? "error" : (normalErr || algoErr ? "partial" : "ok");
        if(!pos && previousLivePosition){
          const cleanup = await autoCleanupFlatPositionOrphans(previousLivePosition,snapshot,{source});
          if(cleanup && cleanup.position){
            pos = cleanup.position;
            clearFlatCleanupSignature();
            diag.positionSource = pos.source || null;
            diag.positionSide = pos.side || null;
            setDirection(pos.side);
            setRows(
              "calcModuleEntryRows",
              [{level:pos.entry,lot:pos.qty}],
              {lockFirstRow:true,openPositionFirstRow:true,keepRemoveEnabledFirstRow:true}
            );
            restoreManualRows("calcModuleEntryRows",preservedEntryRows);
          }
          if(cleanup && cleanup.snapshot) snapshot = cleanup.snapshot;
        }
      }catch(_e){
        diag.openOrdersReadStatus = "error";
      }

      if(snapshot){
        if(opts.preserveSendPlan) detectCalculatorOrderExecutions(snapshot);
        mapped = mapLimitOrdersForCalculator(snapshot,pos ? pos.side : direction);
        diag.normalLimitOrdersFound = mapped.diagnostic.normalLimitOrdersFound;
        diag.mappedEntries = mapped.diagnostic.mappedEntries;
        diag.mappedExits = mapped.diagnostic.mappedExits;
        diag.ignoredAlgoOrders = mapped.diagnostic.ignoredAlgoOrders;
        diag.ignoredNonLimitOrders = mapped.diagnostic.ignoredNonLimitOrders;
        diag.ignoredByPositionSide = mapped.diagnostic.ignoredByPositionSide;
        activeLimitKeys = new Set([].concat(mapped.entryRows || [], mapped.exitRows || []).map(item => orderKeyFromMeta(item && item.meta)).filter(Boolean));
        mapped.entryRows.forEach(item => applyMappedRow("calcModuleEntryRows",item));
        mapped.exitRows.forEach(item => applyMappedRow("calcModuleExitRows",item));
        pruneMappedLimitRows("calcModuleEntryRows",activeLimitKeys);
        pruneMappedLimitRows("calcModuleExitRows",activeLimitKeys);
      }

      let stop = null;
      let stopMapped = null;
      const preservedLocalMasterStop = (!currentStopAlgoMeta && masterStopDraftDirty) ? {
        level:String(q("calcModuleStopLevel")?.value || ""),
        distance:String(q("calcModuleStopDistance")?.value || "")
      } : null;
      const preservedDeleteMark = isMasterStopMarkedForDeletion();
      currentStopAlgoMeta = null;
      setMasterStopMarkedForDeletion(false,{skipStale:true});
      if(pos){
        stopMapped = snapshot ? mapStopOrdersForCalculator(snapshot,pos) : null;
        if(stopMapped){
          diag.masterStopsFound = stopMapped.diagnostic.masterStopsFound;
          const visiblePartialStops = stopMapped.partialStops.filter(item => {
            const key = partialStopKeyFromItem(item,item.side);
            return !key || !suppressedPartialStopKeys.has(key);
          });
          activePartialStopKeys = new Set(visiblePartialStops.map(item => partialStopKeyFromItem(item,item.side)).filter(Boolean));
          diag.partialStopsFound = visiblePartialStops.length;
          visiblePartialStops.forEach(item => applyMappedRow("calcModulePartialStopRows",item));
          pruneMappedPartialStopRows(activePartialStopKeys);
          dedupePartialStopRows();
        }
        const bestStop = stopMapped && stopMapped.master ? stopMapped.master : (snapshot ? findStopOrderForPosition(pos,snapshot,false) : null);
        const algoStop = stopMapped && stopMapped.master ? stopMapped.master : (snapshot ? findStopOrderForPosition(pos,snapshot,true) : null);
        stop = bestStop ? bestStop.price : null;
        currentStopAlgoMeta = algoStop && algoStop.order ? buildAlgoOrderMeta(algoStop.order) : null;
      }
      if(pos && stop != null){
        q("calcModuleStopLevel").value = Math.round(stop);
        lastStopEdit = "level";
        masterStopDraftDirty = false;
        syncStopFromLevel(pos.entry);
        if(preservedDeleteMark && currentStopAlgoMeta) setMasterStopMarkedForDeletion(true,{skipStale:true});
      }else if(preservedLocalMasterStop && preservedLocalMasterStop.level){
        q("calcModuleStopLevel").value = preservedLocalMasterStop.level;
        q("calcModuleStopDistance").value = preservedLocalMasterStop.distance;
        masterStopDraftDirty = true;
      }
      else clearMasterStopBinanceState();
      restoreEditedBinanceRows(binanceSyncPreservedRows);
      sortCalculatorRowsForRead();
      if(snapshot){
        lastReadStateSnapshot = buildReadStateSnapshot(pos,snapshot,{
          ...(mapped || {entryRows:[],exitRows:[],diagnostic:{}}),
          partialStops:stopMapped && Array.isArray(stopMapped.partialStops) ? stopMapped.partialStops.filter(item => {
            const key = partialStopKeyFromItem(item,item.side);
            return !key || !suppressedPartialStopKeys.has(key);
          }) : []
        });
        updateAutoSyncBaseline(pos,snapshot);
      }else{
        lastReadStateSnapshot = buildReadStateSnapshot(pos,{symbol:currentSymbol(),normalOrders:[],algoOrders:[]},{entryRows:[],exitRows:[],diagnostic:{}});
        updateAutoSyncBaseline(pos,{symbol:currentSymbol(),normalOrders:[]});
      }
      if(source === "userRead") enableAutoSyncDetection();
      suppressCalculatorOverlayDraw = false;
      calculate();
      refreshLiveStopsValidity(pos,true);
      refreshLiveExitsValidity(pos,true);
      if(!pos){
        setStatus(diag.mappedEntries || diag.mappedExits ? "No current open position found. LIMIT orders loaded." : "No current open position found.");
      }else if(diag.openOrdersReadStatus === "error"){
        setStatus("Position loaded. Open orders read failed.");
      }else{
        setStatus(stop != null ? "" : "No stop found.");
      }
      if(isOwnedRefresh){
        clearStructuralWarning();
      }
      publishReadDiagnostic(diag);
      binanceSyncPreserveKeys = new Set();
      binanceSyncPreservedRows = [];
    }catch(e){
      suppressCalculatorOverlayDraw = false;
      binanceSyncPreserveKeys = new Set();
      binanceSyncPreservedRows = [];
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
    cbsEnabled = false;
    expressModeEnabled = loadExpressModeEnabled();
    ordersVisible = loadOrdersVisible();
    saveLevelsVisible(levelsVisible);
    saveSlSendEnabled(slSendEnabled);
    saveCbsEnabled(false);
    saveExpressModeEnabled(expressModeEnabled);
    clearCalculatorLocal();
    ensureOrdersToggle();
    installDrawOverlayHook();
    installOverlayDragHooks();
    document.addEventListener("click",e => {
      if(!otfSelection || e.target === canvas || (e.target.closest && e.target.closest("#calcModuleOtfToggle"))) return;
      clearOtfSelection();
    },false);

    function showCalculator(){
      win.classList.remove("hidden");
      win.style.zIndex = String(++zTop);
      openBtn.classList.add("is-on");
      clearCalculatorExecutionNotice();
      openBtn.setAttribute("aria-pressed","true");
      window.__bt001LastOverlayModule = "calculator";
      try{ draw(); }catch(_e){}
    }
    function hideCalculator(){
      win.classList.add("hidden");
      openBtn.classList.remove("is-on");
      openBtn.setAttribute("aria-pressed","false");
    }
    function setCalculatorCollapsed(collapsed){
      const body = q("calcModuleBody");
      const button = q("calcModuleCollapse");
      const head = q("calcModuleHead");
      if(!body || !button) return;
      if(collapsed){
        if(win.classList.contains("is-collapsed")) return;
        const rect = win.getBoundingClientRect();
        win.dataset.expandedWidth = Math.round(rect.width) + "px";
        win.dataset.expandedHeight = Math.round(rect.height) + "px";
        win.dataset.bodyScrollTop = String(body.scrollTop || 0);
        win.style.width = win.dataset.expandedWidth;
        win.style.height = ((head && head.offsetHeight) || 34) + "px";
        win.classList.add("is-collapsed");
        button.setAttribute("aria-pressed","true");
        button.title = "Restore";
        return;
      }
      if(!win.classList.contains("is-collapsed")) return;
      win.classList.remove("is-collapsed");
      if(win.dataset.expandedWidth) win.style.width = win.dataset.expandedWidth;
      if(win.dataset.expandedHeight) win.style.height = win.dataset.expandedHeight;
      button.setAttribute("aria-pressed","false");
      button.title = "Collapse";
      requestAnimationFrame(() => {
        body.scrollTop = Number(win.dataset.bodyScrollTop || 0) || 0;
      });
    }

    openBtn.addEventListener("click",() => {
      if(win.classList.contains("hidden")) showCalculator();
      else hideCalculator();
    },false);
    q("calcModuleHead").addEventListener("pointerdown",() => {
      window.__bt001LastOverlayModule = "calculator";
      try{ draw(); }catch(_e){}
    },false);
    q("calcModuleCollapse").addEventListener("click",() => {
      setCalculatorCollapsed(!win.classList.contains("is-collapsed"));
    },false);
    q("calcModuleClose").addEventListener("click",hideCalculator,false);
    q("calcModuleDir").addEventListener("click",() => {
      markSendPlanStale("Direction changed after preflight.");
      setDirection(direction === "LONG" ? "SHORT" : "LONG");
      lastStopEdit = "distance";
      syncStopFromDistance(readEntry().avg);
      calculate();
    },false);
    q("calcModuleAddEntry").addEventListener("click",async() => {
      markSendPlanStale("Entry row list changed after preflight.");
      await addManualRow("calcModuleEntryRows");
    },false);
    q("calcModuleAddExit").addEventListener("click",async() => {
      markSendPlanStale("Exit row list changed after preflight.");
      await addManualRow("calcModuleExitRows");
    },false);
    q("calcModuleAddPartialStop").addEventListener("click",async() => {
      markSendPlanStale("Partial Stop row list changed after preflight.");
      await addManualRow("calcModulePartialStopRows");
    },false);
    q("calcModuleStopLevel").addEventListener("input",() => {
      if(isMasterStopMarkedForDeletion()) setMasterStopMarkedForDeletion(false,{skipStale:true});
      masterStopDraftDirty = true;
      normalizeLevelInput(q("calcModuleStopLevel"));
      markSendPlanStale("SL level changed after preflight.");
      lastStopEdit = "level";
      syncStopFromLevel(readEntry().avg);
      calculate();
    },false);
    q("calcModuleStopDistance").addEventListener("input",() => {
      if(isMasterStopMarkedForDeletion()) setMasterStopMarkedForDeletion(false,{skipStale:true});
      masterStopDraftDirty = true;
      normalizeLevelInput(q("calcModuleStopDistance"));
      markSendPlanStale("SL Δ changed after preflight.");
      lastStopEdit = "distance";
      syncStopFromDistance(readEntry().avg);
      calculate();
    },false);
    q("calcModuleDeleteStop").addEventListener("click",() => {
      if(!currentStopAlgoMeta) return;
      setMasterStopMarkedForDeletion(!isMasterStopMarkedForDeletion());
    },false);
    q("calcModuleEntriesTitle").addEventListener("click",e => {
      if(e.target.closest("#calcModuleAddEntry") || e.target.closest("#calcModuleDir")) return;
      const body = q("calcModuleEntriesBody");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModuleEntriesTitle").classList.toggle("is-collapsed",closed);
      q("calcModuleEntriesCaret").textContent = closed ? "▸" : "▾";
    },false);
    q("calcModuleExitsTitle").addEventListener("click",e => {
      if(e.target.closest("#calcModuleAddExit")) return;
      const body = q("calcModuleExitsBody");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModuleExitsTitle").classList.toggle("is-collapsed",closed);
      q("calcModuleExitsCaret").textContent = closed ? "▸" : "▾";
    },false);
    q("calcModuleStopsTitle").addEventListener("click",e => {
      if(e.target.closest("#calcModuleAddPartialStop")) return;
      const body = q("calcModuleStopsBody");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModuleStopsTitle").classList.toggle("is-collapsed",closed);
      q("calcModuleStopsCaret").textContent = closed ? "▸" : "▾";
    },false);
    q("calcModuleSummaryTitle").addEventListener("click",() => {
      const body = q("calcModuleSummaryBody");
      const closed = body.classList.toggle("calc-module-collapsed");
      q("calcModuleSummaryCaret").textContent = closed ? "▸" : "▾";
    },false);
    q("calcModuleClear").addEventListener("click",clearCalculatorLocal,false);
    q("calcModuleRead").addEventListener("click",() => readBinance({userRead:true}),false);
    q("calcModuleSend").addEventListener("click",() => {
      window.__bt001LastOverlayModule = "calculator";
      try{ draw(); }catch(_e){}
      void executeDirectSend();
    },false);
    q("calcModuleLevelsToggle").addEventListener("change",e => {
      saveLevelsVisible(!!(e.target && e.target.checked));
    },false);
    q("calcModuleExpressToggle").addEventListener("change",e => {
      markSendPlanStale("Express Mode toggle changed after preflight.");
      saveExpressModeEnabled(!!(e.target && e.target.checked));
    },false);
    installDragResize(win);
    if(marketEl && !marketEl.__calcSendStaleBound){
      marketEl.__calcSendStaleBound = true;
      marketEl.addEventListener("change",() => {
        markSendPlanStale("Symbol changed after preflight.");
      },false);
    }
    setDirection("LONG");
    refreshMasterStopDeleteVisualState();
    installContextMenu();
    window.CALCULATOR_MODULE = {
      version:MODULE,
      open:showCalculator,
      hide:hideCalculator,
      calculate,
      drawOverlayNow:drawCalculatorLevelsOverlay,
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
      getCbsEnabled(){ return !!cbsEnabled; },
      getStopMath(){
        return calculateStopMath(readEntry(),num(q("calcModuleStopLevel")?.value),readPartialStops());
      },
      reconcileOpenPositionChange:reconcileOpenPositionRow
    };
    if(!window.__calculatorOpenPositionReconcileBound){
      window.__calculatorOpenPositionReconcileBound = true;
      window.addEventListener("v13:open-position-change",event => {
        scheduleOpenPositionReconcile(event && event.detail);
      },false);
    }
    if(!window.__calculatorBinanceStateReconcileBound){
      window.__calculatorBinanceStateReconcileBound = true;
      window.addEventListener("v14:binance-state-change",event => {
        scheduleBinanceStateReconcile(event && event.detail);
      },false);
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bindCalculator,{once:true});
  else bindCalculator();
})();
