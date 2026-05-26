const API = window.API;
if (!API) {
  throw new Error("apis.js must load before main.js");
}

/* =========================================================
   SECTION 1 — DOM SHORTCUTS
========================================================= */

const $ = id => document.getElementById(id);

const canvas = $("chart");
const ctx = canvas.getContext("2d");

const marketEl = $("market");
const intervalEl = $("interval");
const reportWeeksEl = $("reportWeeks");
const customRangeEl = $("customRange");
const customFromEl = $("customFrom");
const customToEl = $("customTo");
const reloadEl = $("reload");
const resetViewEl = $("resetView");

const apiKeysBtn = $("apiKeysBtn");
const settingsModal = $("settingsModal");
const closeSettingsEl = $("closeSettings");
const openBinanceSettingsEl = $("openBinanceSettings");
const openGptFromSettingsEl = $("openGptFromSettings");
const apiModal = $("apiModal");
const closeApiKeys = $("closeApiKeys");
const saveApiKeys = $("saveApiKeys");
const apiKeyEl = $("apiKey");
const apiSecretEl = $("apiSecret");
const rememberKeysEl = $("rememberKeys");

const loadTradesEl = $("loadTrades");
const tradeCountEl = $("tradeCount");

const tglEMA20 = $("tglEMA20");
const tglEMA50 = $("tglEMA50");
const tglEMA3 = $("tglEMA3");
const tglVWAP = $("tglVWAP");
const tglPositions = $("tglPositions");
const tglResults = $("tglResults");
const tglDollarValues = $("tglDollarValues");
const tglLots = $("tglLots");
const lblEMA20 = $("lblEMA20");
const lblEMA50 = $("lblEMA50");
const lblEMA3 = $("lblEMA3");
const emaPeriod1El = $("emaPeriod1");
const emaPeriod2El = $("emaPeriod2");
const emaPeriod3El = $("emaPeriod3");

const connLed = $("connLed");
const connWrap = $("connWrap");

const mSymbol = $("mSymbol");
const mTime = $("mTime");
const mOpen = $("mOpen");
const mHigh = $("mHigh");
const mLow = $("mLow");
const mClose = $("mClose");
const mVolume = $("mVolume");
const mChange = $("mChange");
const mVWAP = $("mVWAP");
const mBalance = $("mBalance");
const mFloatPL = $("mFloatPL");


/* =========================================================
   SECTION 2 — CONFIG
========================================================= */

const MARKETS = {
  btcusdt:{
    symbol:"BTCUSDT",
    rest:"https://fapi.binance.com/fapi/v1/klines",
    time:"https://fapi.binance.com/fapi/v1/time",
    userTrades:"https://fapi.binance.com/fapi/v1/userTrades",
    income:"https://fapi.binance.com/fapi/v1/income",
    positionRisk:"https://fapi.binance.com/fapi/v2/positionRisk",
    balance:"https://fapi.binance.com/fapi/v2/balance",
    ws:"wss://fstream.binance.com/market/stream"
  },
  btcusdc:{
    symbol:"BTCUSDC",
    rest:"https://fapi.binance.com/fapi/v1/klines",
    time:"https://fapi.binance.com/fapi/v1/time",
    userTrades:"https://fapi.binance.com/fapi/v1/userTrades",
    income:"https://fapi.binance.com/fapi/v1/income",
    positionRisk:"https://fapi.binance.com/fapi/v2/positionRisk",
    balance:"https://fapi.binance.com/fapi/v2/balance",
    ws:"wss://fstream.binance.com/market/stream"
  }
};

const DEF_VISIBLE = 283;
const MIN_VISIBLE = 30;
const INIT_LIMIT = 1500;
const OLDER_LIMIT = 1500;
const OLDER_THRESHOLD = 120;
const KLINE_LIMIT = 1500;
const CHART_INDICATOR_WARMUP_MIN = 600;
const CHART_BUFFER_RETENTION_CAP = 1500;
const CHART_HISTORY_RETENTION_CAP = 10000;

const MAX_FUTURE_RATIO = 0.5;

const REST_MS = 500;
const STALE_MS = 5000;
const WS_RECONNECT_MS = 30000;
const TRADE_REFRESH_MS = 5 * 60 * 1000;
const DAILY_REFRESH_MS = 15000;

const RIGHT_AXIS = 84;
const LEFT_PAD = 14;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TRADE_CHUNK_MS = WEEK_MS;
const TRADE_LIMIT = 1000;
const RECON_LOOKBACK_WEEKS = 26;

const STORE = "btc_futures_chart_v12_";
const SK = STORE + "api_key";
const SS = STORE + "api_secret";
const SR = STORE + "remember_keys";
const SE1 = STORE + "ema_period_1";
const SE2 = STORE + "ema_period_2";
const SE3 = STORE + "ema_period_3";


/* =========================================================
   SECTION 3 — STATE
========================================================= */

let candles = [];
let ema20 = [];
let ema50 = [];
let ema3 = [];
let vwap = [];

let fillMarkers = [];
let resultLinks = [];
let openLotLinks = [];
let openPositionBoxes = [];
let openEntryMarkerIds = new Set();
let activeOpenParentChainIds = new Set();
let fundingIncomeRows = [];
let fundingIncomeFetchStats = {rows:0,start:0,end:0,symbol:""};
let unresolvedCount = 0;

let dailyState = null;
let accountBalanceState = null;

let ws = null;
let tradeAutoTimer = null;
let liveTimeTimer = null;
let dailyTimer = null;
let titleTimer = null;

let lastWs = 0;
let lastRest = 0;
let lastMarkPrice = null;
let lastLiveUpdateMs = 0;

let loading = false;
let loadingOlder = false;
let noMoreOlder = false;
let olderFetchArmed = false;
let olderFetchTargetVisible = 0;
let tradeLoading = false;

let visibleCount = DEF_VISIBLE;
let rightOffset = 0;

let mouse = null;
let dragChart = false;
let dragAxis = false;
let dragManualY = false;

let dragX = 0;
let dragY = 0;
let dragRight = 0;
let dragRange = 1;
let dragH = 1;
let dragMin = 0;
let dragMax = 1;

let manualY = false;
let yMin = null;
let yMax = null;

let lastYMin = 0;
let lastYMax = 1;
let lastRange = 1;
let lastAreaH = 1;

let overlayHitItems = [];


/* =========================================================
   SECTION 4 — HELPERS
========================================================= */

function cfg(){ return MARKETS[marketEl.value]; }
function iv(){ return intervalEl.value; }

function parseCustomDate(value,endOfDay=false){
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if(year < 100) year += 2000;

  const d = new Date(year,month,day,endOfDay ? 23 : 0,endOfDay ? 59 : 0,endOfDay ? 59 : 0,endOfDay ? 999 : 0);
  if(d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d.getTime();
}

function selectedReportPresetMs(){
  switch(reportWeeksEl.value){
    case "2w": return 2 * WEEK_MS;
    case "3w": return 3 * WEEK_MS;
    case "1mth": return 30 * 24 * 60 * 60 * 1000;
    case "1w":
    default: return WEEK_MS;
  }
}

function customReportRangeMs(){
  const start = parseCustomDate(customFromEl ? customFromEl.value : "",false);
  const end = parseCustomDate(customToEl ? customToEl.value : "",true);
  if(start == null || end == null || end <= start) return null;
  return {start,end};
}

function reportRangeMs(){
  if(reportWeeksEl.value === "custom"){
    const custom = customReportRangeMs();
    if(custom) return custom;
  }

  const end = Date.now();
  return {start:end - selectedReportPresetMs(), end};
}

function weeks(){
  switch(reportWeeksEl.value){
    case "2w": return 2;
    case "3w": return 3;
    case "1mth": return 4;
    default: return 1;
  }
}

function reportLabel(){
  switch(reportWeeksEl.value){
    case "2w": return "2W";
    case "3w": return "3W";
    case "1mth": return "1M";
    case "custom": return customReportRangeMs() ? "Custom" : "Custom*";
    case "1w":
    default: return "1W";
  }
}

function reportMs(){
  const r = reportRangeMs();
  return r.end - r.start;
}
function reportStartMs(){ return reportRangeMs().start; }

function reportWindowSec(){
  const r = reportRangeMs();
  return {
    start:Math.floor(r.start / 1000),
    end:Math.floor(r.end / 1000)
  };
}

function clamp(v,a,b){
  return b < a ? a : Math.max(a, Math.min(b, v));
}

function css(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function validRange(a,b){
  return isFinite(a) && isFinite(b) && b > a && Math.abs(b-a) > 1e-12;
}

function formatDateTime(value){
  const d = value instanceof Date ? value : new Date(value);
  if(isNaN(d.getTime())) return "-";
  const pad = n => String(n).padStart(2,"0");
  return pad(d.getDate()) + "/" +
    pad(d.getMonth()+1) + "/" +
    d.getFullYear() + " | " +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes()) + ":" +
    pad(d.getSeconds());
}

function formatTimeOnly(value){
  const d = value instanceof Date ? value : new Date(value);
  if(isNaN(d.getTime())) return "-";
  const pad = n => String(n).padStart(2,"0");
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}


function emaPeriod(input,fallback){
  const n = Number(input && input.value);
  if(isFinite(n) && n >= 1) return Math.round(n);
  return fallback;
}

function updateEmaLabels(){
  if(lblEMA20) lblEMA20.textContent = "EMA" + emaPeriod(emaPeriod1El,20);
  if(lblEMA50) lblEMA50.textContent = "EMA" + emaPeriod(emaPeriod2El,50);
  if(lblEMA3) lblEMA3.textContent = "EMA" + emaPeriod(emaPeriod3El,100);
}

function restoreEmaSettings(){
  if(emaPeriod1El) emaPeriod1El.value = localStorage.getItem(SE1) || "20";
  if(emaPeriod2El) emaPeriod2El.value = localStorage.getItem(SE2) || "50";
  if(emaPeriod3El) emaPeriod3El.value = localStorage.getItem(SE3) || "100";
  updateEmaLabels();
}

function saveEmaSettings(){
  if(emaPeriod1El) localStorage.setItem(SE1,String(emaPeriod(emaPeriod1El,20)));
  if(emaPeriod2El) localStorage.setItem(SE2,String(emaPeriod(emaPeriod2El,50)));
  if(emaPeriod3El) localStorage.setItem(SE3,String(emaPeriod(emaPeriod3El,100)));
  updateEmaLabels();
  indicators();
  draw();
}

function fp(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  if(Math.abs(x) >= 1000) return x.toFixed(2);
  if(Math.abs(x) >= 1) return x.toFixed(4);
  return x.toFixed(8);
}

function ip(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  return Math.round(x).toLocaleString("en-US");
}

function p2(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  return x.toLocaleString("en-US", {
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function fd(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  return (x > 0 ? "+" : x < 0 ? "-" : "") +
    Math.abs(Math.round(x)).toLocaleString("en-US");
}

function pct(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  return (x > 0 ? "+" : "") + x.toFixed(2) + "%";
}

function fq(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  if(x > 0 && Math.abs(x) < 0.001) return "<0.001";
  const rounded = Number(x.toFixed(3));
  return rounded.toLocaleString("en-US", {maximumFractionDigits:3});
}

function fm(x){
  x = Number(x);
  if(!isFinite(x)) return "$-";
  return (x > 0 ? "+" : x < 0 ? "-" : "") + "$" + Math.abs(x).toFixed(2);
}

function fmPnlBox(x){
  x = Number(x);
  if(!isFinite(x)) return "$-";
  return "$" + Math.abs(x).toFixed(2);
}

function titlePrice(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  return Math.round(x).toLocaleString("en-US");
}

function titlePL(x,hasOpen){
  if(!hasOpen) return "--";
  x = Number(x);
  if(!isFinite(x)) return "--";
  return (x > 0 ? "+" : x < 0 ? "-" : "") + Math.abs(x).toFixed(2);
}

function openBoxFloating(b,price){
  price = Number(price);
  if(!b || !isFinite(price) || !isFinite(Number(b.price)) || !isFinite(Number(b.qty))) return null;
  return b.letter === "B"
    ? (price - Number(b.price)) * Number(b.qty)
    : (Number(b.price) - price) * Number(b.qty);
}

function openBoxesFloating(price){
  if(!openPositionBoxes || !openPositionBoxes.length) return null;
  let total = 0;
  let has = false;
  for(const b of openPositionBoxes){
    const v = openBoxFloating(b,price);
    if(isFinite(v)){
      total += v;
      has = true;
    }
  }
  return has ? total : null;
}

function openBoxMargin(b){
  const direct = [b && b.positionInitialMargin,b && b.initialMargin,b && b.isolatedMargin,b && b.margin]
    .map(Number)
    .find(v => isFinite(v) && v > 0);
  if(isFinite(direct) && direct > 0) return direct;

  const lev = Number(b && b.leverage);
  const px = Number(b && b.price);
  const qty = Math.abs(Number(b && b.qty));
  if(isFinite(lev) && lev > 0 && isFinite(px) && px > 0 && isFinite(qty) && qty > 0){
    return px * qty / lev;
  }

  return null;
}

function pnlPctOfMargin(floating,b){
  const margin = openBoxMargin(b);
  floating = Number(floating);
  if(!isFinite(floating) || !isFinite(margin) || margin <= 0) return null;
  return floating / margin * 100;
}

function valuePer100Move(b){
  const qty = Math.abs(Number(b && b.qty));
  return isFinite(qty) ? qty * 100 : null;
}

function updateAccountBalanceFromRisk(risk){
  const keys = ["accountBalance","walletBalance","availableBalance","balance","crossWalletBalance","totalWalletBalance"];
  for(const row of risk || []){
    for(const k of keys){
      const v = Number(row && row[k]);
      if(isFinite(v) && v > 0){
        accountBalanceState = v;
        return;
      }
    }
  }
}

function updateAccountBalanceFromBalance(rows){
  const asset = quote(cfg().symbol);
  const list = Array.isArray(rows) ? rows : [];
  const ordered = list.slice().sort((a,b) => {
    const aa = String(a && a.asset || "").toUpperCase();
    const ba = String(b && b.asset || "").toUpperCase();
    return (ba === asset) - (aa === asset);
  });

  const keys = ["balance","walletBalance","crossWalletBalance","availableBalance"];
  for(const row of ordered){
    const rowAsset = String(row && row.asset || "").toUpperCase();
    if(asset && rowAsset && rowAsset !== asset) continue;

    for(const k of keys){
      const v = Number(row && row[k]);
      if(isFinite(v) && v >= 0){
        accountBalanceState = v;
        updatePositionStrip(candles.length ? candles[candles.length-1] : null);
        return;
      }
    }
  }
}

async function getAccountBalance(key,sec,off){
  const endpoint = cfg().balance || "https://fapi.binance.com/fapi/v2/balance";
  return await signedGet(endpoint,{},key,sec,off);
}

function updatePositionStrip(c){
  const price = c && isFinite(Number(c.close))
    ? Number(c.close)
    : candles.length
      ? Number(candles[candles.length-1].close)
      : null;

  const bal = Number(accountBalanceState);
  if(mBalance){
    mBalance.textContent = isFinite(bal) ? p2(bal) : "-";
  }

  const flt = openBoxesFloating(price);
  if(mFloatPL){
    mFloatPL.textContent = flt == null ? "--" : fm(flt);
    mFloatPL.style.color = flt == null
      ? css("--text")
      : flt > 0 ? "#047857" : flt < 0 ? "#7f1d1d" : "#111";
  }
}

function updateTabTitle(){
  const price = candles.length ? candles[candles.length-1].close : lastMarkPrice;
  const flt = openBoxesFloating(price);
  document.title = titlePrice(price) + " | " + titlePL(flt, !!(openPositionBoxes && openPositionBoxes.length));
}

function startTitleUpdater(){
  if(titleTimer) clearInterval(titleTimer);
  titleTimer = setInterval(updateTabTitle,3000);
  updateTabTitle();
}

function fv(x){
  x = Number(x);
  if(!isFinite(x)) return "-";
  if(x >= 1e9) return (x/1e9).toFixed(2) + "B";
  if(x >= 1e6) return (x/1e6).toFixed(2) + "M";
  if(x >= 1e3) return (x/1e3).toFixed(2) + "K";
  return x.toFixed(4);
}

function ft(sec){
  return formatDateTime(sec * 1000);
}

function ivSec(v = iv()){
  return ({
    "1m":60,
    "3m":180,
    "5m":300,
    "15m":900,
    "30m":1800,
    "1h":3600,
    "4h":14400,
    "1d":86400,
    "1w":604800,
    "1M":2592000
  }[v] || 900);
}

function quote(sym){
  if(sym.endsWith("USDT")) return "USDT";
  if(sym.endsWith("USDC")) return "USDC";
  return "";
}

function feeQuote(row,sym){
  const c = Number(row.commission);
  const a = String(row.commissionAsset || "").toUpperCase();
  return isFinite(c) && c > 0 && a === quote(sym) ? c : 0;
}

function gross(sign,en,ex,q){
  return sign > 0 ? (ex-en)*q : (en-ex)*q;
}


/* =========================================================
   SECTION 5 — API KEY MODAL / LOCAL STORAGE
========================================================= */

function hasKeys(){
  return !!(apiKeyEl.value.trim() && apiSecretEl.value.trim());
}

function gptKeyReady(){
  const el = document.getElementById("v13GptKey");
  return !!(el && el.value && el.value.trim());
}

function updateSettingsStatus(){
  const needsAttention = !hasKeys() || !gptKeyReady();
  apiKeysBtn.classList.toggle("needs-attention", needsAttention);
  apiKeysBtn.title = needsAttention ? "Settings need attention" : "Settings";
}

window.v13UpdateSettingsStatus = updateSettingsStatus;

function updateApiStatus(){
  updateSettingsStatus();
}

function restoreKeys(){
  const r = localStorage.getItem(SR);
  if(r === "0"){
    rememberKeysEl.checked = false;
    updateApiStatus();
    return;
  }

  rememberKeysEl.checked = true;
  apiKeyEl.value = localStorage.getItem(SK) || "";
  apiSecretEl.value = localStorage.getItem(SS) || "";
  updateApiStatus();
}

function saveKeysLocal(){
  if(!rememberKeysEl.checked){
    localStorage.removeItem(SK);
    localStorage.removeItem(SS);
    localStorage.setItem(SR,"0");
    updateApiStatus();
    return;
  }

  localStorage.setItem(SR,"1");
  localStorage.setItem(SK, apiKeyEl.value.trim());
  localStorage.setItem(SS, apiSecretEl.value.trim());
  updateApiStatus();
}

function openApi(){
  apiModal.classList.remove("hidden");
  apiKeyEl.focus();
  updateApiStatus();
}

function closeApi(){
  apiModal.classList.add("hidden");
  updateApiStatus();
}


function openSettings(){
  settingsModal.classList.remove("hidden");
  updateSettingsStatus();
}

function closeSettings(){
  settingsModal.classList.add("hidden");
  updateSettingsStatus();
}

function openBinanceSettings(){
  closeSettings();
  openApi();
}


/* =========================================================
   SECTION 6 — CONNECTION LED / LIVE TIME
========================================================= */

function updateLiveTime(){
  mTime.textContent = formatDateTime(lastLiveUpdateMs || Date.now());
}

function markLiveUpdate(){
  lastLiveUpdateMs = Date.now();
  updateLiveTime();
}

function startLiveClock(){
  if(liveTimeTimer) clearInterval(liveTimeTimer);
  liveTimeTimer = setInterval(updateLiveTime,500);
  updateLiveTime();
}

function connVisual(status){
  switch(String(status || "")){
    case "WS LIVE":
      return {text:"W", bg:"#0ecb81", glow:"rgba(14,203,129,.45)"};
    case "WS WAITING":
    case "RECONNECTING":
    case "WS STALE":
    case "REST FALLBACK":
      return {
        text:String(status) === "REST FALLBACK" ? "R" : "W",
        bg:"#0ecb81",
        glow:"rgba(14,203,129,.45)"
      };
    default:
      return {text:"X", bg:"#f6465d", glow:"rgba(246,70,93,.42)"};
  }
}

// Legacy status names are kept as thin aliases; the hub is the only LED writer.
function setConn(ok,src=""){
  if(window.PUBLIC_MARKET_DATA_HUB && typeof window.PUBLIC_MARKET_DATA_HUB.setLegacyConnectionState === "function"){
    window.PUBLIC_MARKET_DATA_HUB.setLegacyConnectionState(ok,src);
  }
}

function refreshConn(){
  if(window.PUBLIC_MARKET_DATA_HUB && typeof window.PUBLIC_MARKET_DATA_HUB.refreshConnectionStatus === "function"){
    window.PUBLIC_MARKET_DATA_HUB.refreshConnectionStatus();
  }
}


/* =========================================================
   SECTION 7 — CANDLE / INDICATOR DATA
========================================================= */

function parseRest(k){
  return {
    time:Math.floor(k[0]/1000),
    openTime:+k[0],
    closeTime:+k[6],
    open:+k[1],
    high:+k[2],
    low:+k[3],
    close:+k[4],
    volume:+k[5],
    baseVolume:+k[5],
    quoteVolume:+k[7],
    final:false
  };
}

function parseWsKline(k){
  return {
    time:Math.floor(k.t/1000),
    openTime:+k.t,
    closeTime:+k.T,
    open:+k.o,
    high:+k.h,
    low:+k.l,
    close:+k.c,
    volume:+k.v,
    baseVolume:+k.v,
    quoteVolume:+k.q,
    final:!!k.x
  };
}

function EMA(src,p){
  const out = [];
  let cur = null;
  const a = 2 / (p + 1);

  for(let i=0;i<src.length;i++){
    if(i < p-1) continue;

    if(cur === null){
      let s = 0;
      for(let j=i-p+1;j<=i;j++) s += src[j].close;
      cur = s / p;
    }else{
      cur = src[i].close * a + cur * (1-a);
    }

    out.push({time:src[i].time,value:cur});
  }

  return out;
}

function chartIndicatorPeriodValue(n,fallback){
  const ids = n <= 3
    ? [`emaPeriod${n}`]
    : [`maisoMA${n}Period`,`v33MA${n}Period`];
  for(const id of ids){
    const el = document.getElementById(id);
    const value = Number(el && el.value);
    if(Number.isFinite(value) && value > 0) return value;
  }
  try{
    const key = n <= 3
      ? STORE + `ema_period_${n}`
      : `btc_futures_chart_v13_32r1_ma${n}Period`;
    const stored = Number(localStorage.getItem(key));
    if(Number.isFinite(stored) && stored > 0) return stored;
  }catch(_e){}
  return fallback;
}

function longestEnabledChartIndicatorPeriod(){
  const defs = [
    [tglEMA20,1,20],
    [tglEMA50,2,50],
    [tglEMA3,3,100],
    [document.getElementById("tglEMA4"),4,100],
    [document.getElementById("tglEMA5"),5,200]
  ];
  let longest = 0;
  for(const [toggle,n,fallback] of defs){
    if(toggle && toggle.checked) longest = Math.max(longest, chartIndicatorPeriodValue(n,fallback));
  }
  return longest;
}

function chartIndicatorWarmupTarget(){
  return Math.min(
    CHART_BUFFER_RETENTION_CAP - MIN_VISIBLE,
    Math.max(CHART_INDICATOR_WARMUP_MIN, Math.ceil(longestEnabledChartIndicatorPeriod() * 3))
  );
}

function chartDesiredClosedDepth(visible=visibleCount){
  const desired = Math.ceil((Number(visible) || DEF_VISIBLE) + chartIndicatorWarmupTarget());
  return clamp(desired, CHART_INDICATOR_WARMUP_MIN, CHART_HISTORY_RETENTION_CAP);
}

function candleOnlyYRange(vis){
  const prices = [];
  for(const c of vis || []) prices.push(Number(c.high),Number(c.low));
  let max = Math.max(...prices);
  let min = Math.min(...prices);
  if(!isFinite(max) || !isFinite(min) || max === min){
    max = 1;
    min = 0;
  }
  const center = (max + min) / 2;
  const range = (max - min) * 1.16 || 1;
  return {min:center - range/2,max:center + range/2};
}

function sameDay(a,b){
  a = new Date(a*1000);
  b = new Date(b*1000);
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth() === b.getUTCMonth() &&
         a.getUTCDate() === b.getUTCDate();
}

function VWAP(src){
  const out = [];
  let pv = 0;
  let v = 0;
  let pt = null;

  for(const c of src){
    if(pt !== null && !sameDay(pt,c.time)){
      pv = 0;
      v = 0;
    }

    const typ = (c.high + c.low + c.close) / 3;
    pv += typ * c.volume;
    v += c.volume;

    if(v > 0) out.push({time:c.time,value:pv/v});
    pt = c.time;
  }

  return out;
}

function indicators(){
  ema20 = EMA(candles,emaPeriod(emaPeriod1El,20));
  ema50 = EMA(candles,emaPeriod(emaPeriod2El,50));
  ema3 = EMA(candles,emaPeriod(emaPeriod3El,100));
  vwap = VWAP(candles);
}


/* =========================================================
   SECTION 8 — DAILY TOP METRICS
========================================================= */

function updateDailyFromLive(c){
  if(!dailyState || !c) return;

  dailyState.close = c.close;
  dailyState.high = Math.max(dailyState.high, c.high, c.close);
  dailyState.low = Math.min(dailyState.low, c.low, c.close);

  if(dailyState.prevClose > 0){
    dailyState.changePct =
      (dailyState.close - dailyState.prevClose) / dailyState.prevClose * 100;
  }
}

function metrics(c){
  if(c) updateDailyFromLive(c);

  const vw = vwap.length ? vwap[vwap.length-1].value : null;

  mSymbol.textContent = cfg().symbol;

  if(dailyState){
    mOpen.textContent = ip(dailyState.open);
    mHigh.textContent = ip(dailyState.high);
    mLow.textContent = ip(dailyState.low);
    mClose.textContent = ip(dailyState.close);
    mVolume.textContent = fv(dailyState.volume);
    mChange.textContent = pct(dailyState.changePct);
    mChange.style.color = dailyState.changePct >= 0 ? css("--green") : css("--red");
  }else if(c){
    mOpen.textContent = ip(c.open);
    mHigh.textContent = ip(c.high);
    mLow.textContent = ip(c.low);
    mClose.textContent = ip(c.close);
    mVolume.textContent = fv(c.volume);
    mChange.textContent = "-";
    mChange.style.color = css("--text");
  }

  mVWAP.textContent = vw == null ? "-" : ip(vw);
  updatePositionStrip(c);
  updateTabTitle();
}

async function fetchDaily(){
  const c = cfg();
  const url =
    c.rest +
    "?symbol=" + encodeURIComponent(c.symbol) +
    "&interval=1d&limit=2&endTime=" + Date.now();

  const r = await API.fetch(url,{
    cache:"no-store",
    headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}
  });

  if(!r.ok) throw new Error("Daily HTTP " + r.status);

  const rows = await r.json();
  if(!Array.isArray(rows) || !rows.length) return;

  const parsed = rows.map(parseRest);
  const cur = parsed[parsed.length-1];
  const prev = parsed.length > 1 ? parsed[parsed.length-2] : null;

  dailyState = {
    dayStart:cur.time,
    open:cur.open,
    high:cur.high,
    low:cur.low,
    close:cur.close,
    volume:cur.volume,
    prevClose:prev ? prev.close : null,
    changePct:prev && prev.close > 0
      ? (cur.close - prev.close) / prev.close * 100
      : null
  };

  if(candles.length) metrics(candles[candles.length-1]);
  draw();
}

function startDailyTimer(){
  stopDailyTimer();
  dailyTimer = setInterval(
    () => fetchDaily().catch(e => console.error("Daily fetch failed",e)),
    DAILY_REFRESH_MS
  );
}

function stopDailyTimer(){
  if(dailyTimer){
    clearInterval(dailyTimer);
    dailyTimer = null;
  }
}


/* =========================================================
   SECTION 9 — VIEW / SCALE
========================================================= */

function clampView(){
  if(!candles.length){
    visibleCount = DEF_VISIBLE;
    rightOffset = 0;
    return;
  }

  visibleCount = candles.length < MIN_VISIBLE
    ? candles.length
    : clamp(visibleCount, MIN_VISIBLE, candles.length);

  const maxHist = Math.max(0, candles.length - visibleCount);
  const maxFut = Math.max(0, Math.floor(visibleCount * MAX_FUTURE_RATIO));

  rightOffset = clamp(rightOffset, -maxFut, maxHist);
}

function range(){
  clampView();

  const fut = Math.max(0, -rightOffset);
  const real = Math.max(1, visibleCount - fut);
  const end = rightOffset >= 0
    ? Math.max(0, candles.length - rightOffset)
    : candles.length;
  const start = Math.max(0, end - real);

  return {
    start,
    end,
    futureBars:fut,
    totalSlots:end - start + fut
  };
}

function resetView(){
  visibleCount = Math.min(DEF_VISIBLE, Math.max(1, candles.length || DEF_VISIBLE));
  rightOffset = 0;
  manualY = false;
  yMin = null;
  yMax = null;
  clampView();
  draw();
}

function resetYAuto(){
  manualY = false;
  yMin = null;
  yMax = null;
  draw();
}

function currentStoredYRange(){
  if(manualY && validRange(yMin,yMax)) return {min:yMin,max:yMax};
  if(validRange(lastYMin,lastYMax)) return {min:lastYMin,max:lastYMax};
  return {min:0,max:1};
}

function captureFocus(){
  if(!candles.length) return null;

  const r = range();
  const vis = candles.slice(r.start,r.end);
  if(!vis.length) return null;

  return {
    time:vis[Math.floor(vis.length/2)].time,
    visible:visibleCount,
    manualY:manualY && validRange(yMin,yMax),
    yMin,
    yMax
  };
}

function applyFocus(f){
  if(!f){
    resetView();
    return;
  }

  visibleCount = clamp(
    f.visible || DEF_VISIBLE,
    Math.min(MIN_VISIBLE,candles.length),
    Math.max(1,candles.length)
  );

  let idx = 0;
  let best = Infinity;

  for(let i=0;i<candles.length;i++){
    const d = Math.abs(candles[i].time - f.time);
    if(d < best){
      best = d;
      idx = i;
    }
  }

  const desiredEnd = idx + Math.floor(visibleCount / 2);
  rightOffset = candles.length - desiredEnd;

  if(f.manualY && validRange(f.yMin,f.yMax)){
    manualY = true;
    yMin = f.yMin;
    yMax = f.yMax;
  }else{
    manualY = false;
    yMin = null;
    yMax = null;
  }

  clampView();
  draw();
}

function rightAxis(x){
  return x >= canvas.clientWidth - RIGHT_AXIS;
}

function ensureManualY(){
  if(manualY && validRange(yMin,yMax)) return;

  const r = currentStoredYRange();
  manualY = true;
  yMin = r.min;
  yMax = r.max;
}

function scaleY(delta){
  ensureManualY();

  const c = (yMin + yMax) / 2;
  const r = Math.max(1e-9, (yMax - yMin) * Math.exp(delta * .004));

  yMin = c - r/2;
  yMax = c + r/2;

  draw();
}


/* =========================================================
   SECTION 10 — DATA DOWNLOAD / REALTIME
========================================================= */

async function klinesForInterval(interval,endMs,limit,symbolOverride){
  const c = cfg();
  const url =
    c.rest +
    "?symbol=" + encodeURIComponent(symbolOverride || c.symbol) +
    "&interval=" + encodeURIComponent(interval) +
    "&limit=" + Math.min(KLINE_LIMIT,limit) +
    "&endTime=" + Math.floor(endMs);

  const r = await API.fetch(url,{
    cache:"no-store",
    headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}
  });

  if(!r.ok) throw new Error("REST klines HTTP " + r.status);

  const d = await r.json();
  if(!Array.isArray(d)) throw new Error("Invalid Binance klines response");

  return d.map(parseRest);
}

async function klines(endMs,limit){
  return klinesForInterval(iv(),endMs,limit);
}

async function fetchInitial(targetCount){
  const warmup = Math.max(
    Number(targetCount) || 0,
    chartDesiredClosedDepth(visibleCount || DEF_VISIBLE)
  );
  const desired = Math.max(1, Math.round(warmup));
  if(window.PUBLIC_MARKET_DATA_HUB && typeof window.PUBLIC_MARKET_DATA_HUB.seedBuffer === "function"){
    await window.PUBLIC_MARKET_DATA_HUB.seedBuffer(iv(), desired, true);
    if(typeof window.PUBLIC_MARKET_DATA_HUB.getChartBuffer === "function"){
      return window.PUBLIC_MARKET_DATA_HUB.getChartBuffer(iv());
    }
    if(typeof window.PUBLIC_MARKET_DATA_HUB.getClosedBuffer === "function"){
      return window.PUBLIC_MARKET_DATA_HUB.getClosedBuffer(iv());
    }
  }
  let rows = [];
  let endMs = Date.now();

  while(rows.length < desired){
    const remaining = desired - rows.length;
    const batch = await klines(endMs, Math.min(KLINE_LIMIT, remaining || KLINE_LIMIT));
    if(!batch.length) break;

    const oldestTime = batch[0] && batch[0].time ? batch[0].time * 1000 : null;
    rows = rows.length ? batch.concat(rows) : batch;

    if(batch.length < Math.min(KLINE_LIMIT, remaining || KLINE_LIMIT) || !oldestTime) break;
    endMs = oldestTime - 1;
  }

  if(!rows.length) throw new Error("No Binance candles returned");
  return rows.slice(-desired);
}

async function olderIfNeeded(r){
  const zoomRequestedVisible = Number.isFinite(olderFetchTargetVisible) ? olderFetchTargetVisible : 0;
  const needsZoomBackfill = zoomRequestedVisible > candles.length;
  const nearLeftEdge = !!(r && r.start <= 2);
  const warmupDeficit = r && Number.isFinite(r.start)
    ? Math.max(0, chartIndicatorWarmupTarget() - r.start)
    : 0;
  const needsWarmupBackfill = warmupDeficit > 0;
  if(
    loading ||
    loadingOlder ||
    noMoreOlder ||
    !candles.length ||
    !r ||
    (!olderFetchArmed && !needsWarmupBackfill) ||
    (!nearLeftEdge && !needsZoomBackfill && !needsWarmupBackfill)
  ) return;

  loadingOlder = true;
  olderFetchArmed = false;

  try{
    const oldLength = candles.length;
    const requestedVisible = Math.max(
      visibleCount,
      zoomRequestedVisible
    );
    const neededVisible = Math.max(0, requestedVisible - oldLength);
    const loadLimit = clamp(
      Math.max(OLDER_THRESHOLD, neededVisible + 24, warmupDeficit + 24, Math.ceil(visibleCount * 0.6)),
      1,
      OLDER_LIMIT
    );
    const expandAfterFetch = zoomRequestedVisible > oldLength;
    const before = candles[0].time * 1000 - 1;
    const retention = Math.max(
      Math.min(CHART_HISTORY_RETENTION_CAP, oldLength + loadLimit),
      chartDesiredClosedDepth(visibleCount || DEF_VISIBLE)
    );
    const backfill = window.PUBLIC_MARKET_DATA_HUB && typeof window.PUBLIC_MARKET_DATA_HUB.ensureOlderClosedCandles === "function"
      ? await window.PUBLIC_MARKET_DATA_HUB.ensureOlderClosedCandles(iv(),before,loadLimit,retention)
      : {added:0,fetched:0,noMore:true};

    if(!backfill.fetched){
      noMoreOlder = true;
      olderFetchTargetVisible = 0;
      return;
    }

    if(window.PUBLIC_MARKET_DATA_HUB && typeof window.PUBLIC_MARKET_DATA_HUB.getChartBuffer === "function"){
      candles = window.PUBLIC_MARKET_DATA_HUB.getChartBuffer(iv());
    }
    if(expandAfterFetch){
      visibleCount = Math.min(
        candles.length,
        Math.max(visibleCount, requestedVisible || visibleCount)
      );
    }
    if(backfill.noMore) noMoreOlder = true;
    olderFetchTargetVisible = Math.max(0, requestedVisible - candles.length);
    indicators();
    clampView();
    draw();
  }catch(e){
    console.error("Older candle fetch failed",e);
  }finally{
    loadingOlder = false;
  }
}

async function pollOnce(){
  return marketDataHub.pollOnce();
}

const SSSC_MIN_CLOSED_CANDLES = 600;
const SSSC_TARGET_CLOSED_CANDLES = 1000;
const SSSC_CLOSED_RETENTION_CAP = 1200;
const SHARED_SSSC_TFS = [
  {label:"1D", interval:"1d", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"4H", interval:"4h", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"1H", interval:"1h", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"15M", interval:"15m", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"5M", interval:"5m", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"3M", interval:"3m", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP},
  {label:"1M", interval:"1m", keep:SSSC_TARGET_CLOSED_CANDLES, min:SSSC_MIN_CLOSED_CANDLES, cap:SSSC_CLOSED_RETENTION_CAP}
];
const SHARED_MA_STACK_TFS = [
  {label:"1m", interval:"1m", keep:1000, cap:1200},
  {label:"3m", interval:"3m", keep:1000, cap:1200},
  {label:"5m", interval:"5m", keep:1000, cap:1200},
  {label:"15m", interval:"15m", keep:1000, cap:1200},
  {label:"30m", interval:"30m", keep:1000, cap:1200},
  {label:"1H", interval:"1h", keep:1000, cap:1200},
  {label:"4H", interval:"4h", keep:1000, cap:1200},
  {label:"1D", interval:"1d", keep:1000, cap:1200}
];

const marketDataHub = (() => {
  const MODULE = "BINANCE_PUBLIC_MARKET_DATA_HUB";
  const ACTIVE_FEED_STALE_MS = 8000;
  const WS_STALE_MS = 12000;
  const WS_RECONNECT_MS = 25000;
  const REST_FALLBACK_MS = 10000;
  const REST_STATUS_HOLD_MS = 12000;
  const REST_LATEST_LIMIT = 5;
  const FIRST_TICK_GRACE_MS = 12000;
  const diag = {
    module:MODULE,
    status:"OFFLINE / ERROR",
    symbol:null,
    interval:null,
    streams:[],
    socketStatus:"closed",
    activeUrl:"",
    lastWsTickTime:0,
    lastRestSyncTime:0,
    lastMarkPriceTickTime:0,
    reconnectCount:0,
    staleDurationMs:null,
    lastError:null,
    latestPrice:null,
    latestMarkPrice:null,
    latestAggTradeTickTime:0,
    restFallbackTimestamp:0,
    lastKlineTickByTf:{},
    lastChartActivityByTf:{},
    lastChartActivitySourceByTf:{},
    lastActiveChartTf:null,
    lastActiveChartCandles:[],
    lastChartValidationWarnMs:0
  };
  const state = {
    generation:0,
    reconnectTimer:null,
    statusTimer:null,
    restInFlight:false,
    connectStartedAt:0,
    desiredLive:true,
    ssscVisible:false,
    maStackVisible:false,
    lastMessageSource:"",
    visibilityRecoveryTimer:null,
    closedKlinesByTf:{},
    formingKlineByTf:{},
    bufferSymbol:null,
    ssscSeedPromise:null,
    maStackSeedPromise:null
  };

  function now(){ return Date.now(); }
  function ensureBufferSymbol(){
    const symbol = String((cfg() && cfg().symbol) || "").toUpperCase();
    if(state.bufferSymbol && state.bufferSymbol !== symbol){
      state.closedKlinesByTf = {};
      state.formingKlineByTf = {};
      diag.lastKlineTickByTf = {};
      diag.lastChartActivityByTf = {};
      diag.lastChartActivitySourceByTf = {};
      diag.lastActiveChartCandles = [];
    }
    state.bufferSymbol = symbol;
    return symbol;
  }
  function wsBase(){
    const raw = String((cfg() && cfg().ws) || "wss://fstream.binance.com/market/stream").replace(/\/+$/,"");
    if(/\/market\/stream$/i.test(raw)) return raw;
    if(/\/market\/ws$/i.test(raw)) return raw.replace(/\/market\/ws$/i,"/market/stream");
    if(/\/(?:public|private)\/stream$/i.test(raw)) return raw.replace(/\/(?:public|private)\/stream$/i,"/market/stream");
    if(/\/(?:public|private)\/ws$/i.test(raw)) return raw.replace(/\/(?:public|private)\/ws$/i,"/market/stream");
    if(/\/stream$/i.test(raw)) return raw.replace(/\/stream$/i,"/market/stream");
    if(/\/ws$/i.test(raw)) return raw.replace(/\/ws$/i,"/market/stream");
    if(/\/(?:public|market|private)$/i.test(raw)) return raw.replace(/\/(?:public|market|private)$/i,"/market/stream");
    return raw + "/market/stream";
  }
  function socketState(){
    if(!ws) return "closed";
    return ["connecting","open","closing","closed"][ws.readyState] || String(ws.readyState);
  }
  function socketOpen(){
    return !!(ws && ws.readyState === WebSocket.OPEN);
  }
  function waitingForFirstTick(){
    if(diag.lastWsTickTime) return false;
    if(!state.connectStartedAt) return false;
    if(!(ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN))) return false;
    return now() - state.connectStartedAt <= FIRST_TICK_GRACE_MS;
  }
  function syncDiag(extra={}){
    diag.symbol = cfg().symbol;
    diag.interval = iv();
    diag.socketStatus = socketState();
    diag.staleDurationMs = diag.lastWsTickTime ? now() - diag.lastWsTickTime : null;
    diag.lastActiveChartTf = iv();
    Object.assign(diag,extra);
  }
  function restFallbackRecent(){
    const ts = Math.max(Number(diag.lastRestSyncTime) || 0, Number(diag.restFallbackTimestamp) || 0);
    return !!(ts && now() - ts <= REST_STATUS_HOLD_MS);
  }
  function activeChartFreshTimestamp(tf=iv()){
    return Math.max(
      Number(diag.lastChartActivityByTf[tf]) || 0,
      Number(diag.lastKlineTickByTf[tf]) || 0
    );
  }
  function activeChartAge(tf=iv()){
    const ts = activeChartFreshTimestamp(tf);
    return ts ? now() - ts : Infinity;
  }
  function activeChartSource(tf=iv()){
    return diag.lastChartActivitySourceByTf[tf] || "";
  }
  function markChartActivity(tf,stamp=now(),source="ws"){
    if(!tf || !Number.isFinite(Number(stamp))) return;
    diag.lastChartActivityByTf[tf] = Number(stamp);
    diag.lastChartActivitySourceByTf[tf] = source;
    diag.lastActiveChartTf = iv();
  }
  function rehydrateActiveChartFromHub(tf=iv(),stamp=now(),source="ws"){
    if(tf !== iv()) return;
    candles = getChartBuffer(tf);
    diag.lastActiveChartCandles = candles.slice(-5).map(row => ({
      time:row.time,
      openTime:row.openTime ?? row.time * 1000,
      open:row.open,
      high:row.high,
      low:row.low,
      close:row.close,
      final:!!row.final
    }));
    indicators();
    if(candles.length) metrics(candles[candles.length-1]);
    clampView();
    draw();
    markChartActivity(tf,stamp,source);
    validateActiveChartSync(tf,source);
  }
  function paintStatus(status,detail=""){
    syncDiag({status});
    const visual = connVisual(status);
    if(connWrap){
      const chartAge = activeChartAge();
      const priceAge = diag.latestAggTradeTickTime ? now() - diag.latestAggTradeTickTime : Infinity;
      const markAge = diag.lastMarkPriceTickTime ? now() - diag.lastMarkPriceTickTime : Infinity;
      connWrap.style.width = "22px";
      connWrap.style.height = "22px";
      connWrap.style.borderRadius = "999px";
      connWrap.title =
        status +
        (detail ? " - " + detail : "") +
        (diag.activeUrl ? " | url: " + diag.activeUrl : "") +
        " | streams: " + (diag.streams || []).join(", ") +
        " | last WS: " + (diag.lastWsTickTime ? Math.round((now()-diag.lastWsTickTime)/1000) + "s ago" : "never") +
        " | active TF: " + iv() + " " + (Number.isFinite(chartAge) ? Math.round(chartAge/1000) + "s ago" : "never") +
        " | aggTrade: " + (Number.isFinite(priceAge) ? Math.round(priceAge/1000) + "s ago" : "never") +
        " | markPrice: " + (Number.isFinite(markAge) ? Math.round(markAge/1000) + "s ago" : "never") +
        " | reconnects: " + diag.reconnectCount +
        (diag.lastError ? " | last error: " + diag.lastError : "");
    }
    if(connLed){
      connLed.textContent = visual.text;
      connLed.style.width = "11px";
      connLed.style.height = "11px";
      connLed.style.borderRadius = "999px";
      connLed.style.fontSize = "8px";
      connLed.style.color = "#111";
      connLed.style.background = visual.bg;
      connLed.style.boxShadow =
        "inset 0 1px 0 rgba(255,255,255,.35), 0 0 0 1px rgba(75,85,99,.18), 0 0 8px " + visual.glow;
      connLed.style.whiteSpace = "normal";
    }
  }
  function refreshConnectionStatus(){
    const globalAge = diag.lastWsTickTime ? now() - diag.lastWsTickTime : Infinity;
    const chartAge = activeChartAge();
    syncDiag();
    if(waitingForFirstTick()){
      paintStatus("RECONNECTING","waiting for first Binance tick");
      return;
    }
    if(socketOpen() && chartAge <= ACTIVE_FEED_STALE_MS && activeChartSource() !== "rest"){
      paintStatus("WS LIVE","active chart feed fresh");
      return;
    }
    if(socketOpen() && !Number.isFinite(chartAge) && globalAge <= ACTIVE_FEED_STALE_MS){
      paintStatus("WS WAITING","waiting for active chart kline");
      return;
    }
    if((state.restInFlight || restFallbackRecent()) && (chartAge > ACTIVE_FEED_STALE_MS || activeChartSource() === "rest")){
      paintStatus("REST FALLBACK","active chart feed stale");
      return;
    }
    if(socketOpen() && globalAge <= WS_RECONNECT_MS){
      paintStatus("WS STALE","active chart feed stale");
      return;
    }
    if(state.reconnectTimer || socketState() === "connecting"){
      paintStatus("RECONNECTING",diag.lastError || "reconnecting");
      return;
    }
    paintStatus("OFFLINE / ERROR",diag.lastError || "Disconnected");
  }
  function setLegacyConnectionState(ok,src=""){
    if(ok && String(src).toLowerCase().includes("rest")) paintStatus("REST FALLBACK",src || "REST");
    else if(ok) paintStatus("WS LIVE",src || "WebSocket");
    else paintStatus("OFFLINE / ERROR",src || "Disconnected");
  }
  function resetConnectionState(reason="reset"){
    lastWs = 0;
    lastRest = 0;
    diag.lastWsTickTime = 0;
    diag.lastRestSyncTime = 0;
    diag.lastMarkPriceTickTime = 0;
    diag.latestAggTradeTickTime = 0;
    diag.restFallbackTimestamp = 0;
    diag.lastKlineTickByTf = {};
    diag.lastChartActivityByTf = {};
    diag.lastChartActivitySourceByTf = {};
    diag.lastError = reason || null;
    refreshConnectionStatus();
  }
  function closeSocket(connection){
    if(!connection) return;
    try{
      if(typeof connection.disconnect === "function") connection.disconnect();
      else if(typeof connection.close === "function") connection.close();
    }catch(_e){}
  }
  function closeRealtimeSocket(){
    closeSocket(ws);
    ws = null;
  }
  function sharedTfConfig(tf){
    return SHARED_SSSC_TFS.find(x => x.interval === tf) || SHARED_MA_STACK_TFS.find(x => x.interval === tf) || null;
  }
  function intervalKeep(tf){
    const hit = sharedTfConfig(tf);
    const ssscCap = state.ssscVisible && SHARED_SSSC_TFS.some(x => x.interval === tf) && hit ? hit.cap : 0;
    const maStackCap = state.maStackVisible && SHARED_MA_STACK_TFS.some(x => x.interval === tf) && hit ? hit.cap : 0;
    if(tf === iv()) return Math.max(
      ssscCap,
      maStackCap,
      chartDesiredClosedDepth(visibleCount || DEF_VISIBLE),
      Math.min(CHART_HISTORY_RETENTION_CAP, Array.isArray(candles) ? candles.length : 0)
    );
    return hit ? ((state.ssscVisible || state.maStackVisible) ? hit.cap : hit.keep) : 420;
  }
  function requiredKlineTimeframes(){
    const required = new Set([iv()]);
    if(state.ssscVisible){
      SHARED_SSSC_TFS.forEach(tf => required.add(tf.interval));
    }
    if(state.maStackVisible){
      SHARED_MA_STACK_TFS.forEach(tf => required.add(tf.interval));
    }
    return required;
  }
  function currentStreams(){
    const base = cfg().symbol.toLowerCase();
    const streams = [];
    requiredKlineTimeframes().forEach(tf => streams.push(base + "@kline_" + tf));
    streams.push(base + "@aggTrade");
    streams.push(base + "@markPrice@1s");
    return streams;
  }
  function mergeBufferRow(existing,incoming){
    if(!existing) return {...incoming};
    const exHigh = Number(existing.high), exLow = Number(existing.low);
    const inHigh = Number(incoming.high), inLow = Number(incoming.low), inClose = Number(incoming.close);
    const merged = {...existing,...incoming};
    merged.open = Number.isFinite(Number(existing.open)) ? existing.open : incoming.open;
    merged.high = Math.max(
      Number.isFinite(exHigh) ? exHigh : -Infinity,
      Number.isFinite(inHigh) ? inHigh : -Infinity,
      Number.isFinite(inClose) ? inClose : -Infinity
    );
    merged.low = Math.min(
      Number.isFinite(exLow) ? exLow : Infinity,
      Number.isFinite(inLow) ? inLow : Infinity,
      Number.isFinite(inClose) ? inClose : Infinity
    );
    if(!Number.isFinite(merged.high)) merged.high = incoming.high;
    if(!Number.isFinite(merged.low)) merged.low = incoming.low;
    merged.close = incoming.close;
    const exVol = Number(existing.volume), inVol = Number(incoming.volume);
    if(Number.isFinite(exVol) && Number.isFinite(inVol)) merged.volume = Math.max(exVol,inVol);
    return merged;
  }
  function cloneRow(row){
    return row ? {...row} : row;
  }
  function isFormingRow(tf,row,refMs=Date.now()){
    if(!row || !Number.isFinite(Number(row.time))) return false;
    return (Number(row.time) + ivSec(tf)) * 1000 > refMs;
  }
  function trimClosedBuffer(tf,limitOverride){
    const limit = Math.max(10, limitOverride || intervalKeep(tf));
    const arr = state.closedKlinesByTf[tf] || (state.closedKlinesByTf[tf] = []);
    arr.sort((a,b) => Number(a.time) - Number(b.time));
    for(let i=arr.length-1;i>0;i--){
      if(Number(arr[i].time) === Number(arr[i-1].time)){
        arr[i-1] = mergeBufferRow(arr[i-1],arr[i]);
        arr.splice(i,1);
      }
    }
    while(arr.length > limit) arr.shift();
    return arr;
  }
  function getClosedBuffer(tf){
    return state.closedKlinesByTf[tf] || [];
  }
  function getFormingCandle(tf){
    const row = state.formingKlineByTf[tf];
    return row ? cloneRow(row) : null;
  }
  function getChartBuffer(tf){
    const closed = getClosedBuffer(tf).map(cloneRow);
    const forming = getFormingCandle(tf);
    if(!forming) return closed;
    const lastClosed = closed.length ? closed[closed.length-1] : null;
    if(lastClosed && Number(forming.time) <= Number(lastClosed.time)){
      return closed;
    }
    closed.push(forming);
    return closed;
  }
  function validateActiveChartSync(tf,source){
    if(tf !== iv() || !Array.isArray(candles)) return;
    const t = now();
    if(t - (diag.lastChartValidationWarnMs || 0) < 5000) return;
    const last50 = candles.slice(-50);
    const seen = new Set();
    const duplicates = [];
    let sorted = true;
    for(let i=0;i<last50.length;i++){
      const key = Number(last50[i] && last50[i].time);
      if(seen.has(key)) duplicates.push(key);
      seen.add(key);
      if(i>0 && key < Number(last50[i-1] && last50[i-1].time)) sorted = false;
    }
    const hubLast50 = getChartBuffer(tf).slice(-50);
    const sameLength = hubLast50.length === last50.length;
    const sameRows = sameLength && last50.every((row,i) => {
      const hubRow = hubLast50[i];
      return hubRow &&
        Number(row.time) === Number(hubRow.time) &&
        Number(row.open) === Number(hubRow.open) &&
        Number(row.high) === Number(hubRow.high) &&
        Number(row.low) === Number(hubRow.low) &&
        Number(row.close) === Number(hubRow.close);
    });
    if(duplicates.length || !sorted || !sameRows){
      diag.lastChartValidationWarnMs = t;
      console.warn("Active chart candle sync warning",{
        source,
        tf,
        duplicates,
        sorted,
        matchesHub:sameRows,
        chart:last50,
        hub:hubLast50
      });
    }
  }
  function setFormingCandle(tf,row,{replace=false}={}){
    if(!row){
      delete state.formingKlineByTf[tf];
      return null;
    }
    const existing = state.formingKlineByTf[tf];
    state.formingKlineByTf[tf] = replace ? {...row,final:false} : mergeBufferRow(existing,{...row,final:false});
    return state.formingKlineByTf[tf];
  }
  function upsertClosedBuffer(tf,row,limitOverride){
    if(!tf || !row || !Number.isFinite(Number(row.time))) return;
    const arr = state.closedKlinesByTf[tf] || (state.closedKlinesByTf[tf] = []);
    const closedRow = {...row,final:true};
    const idx = arr.findIndex(x => x.time === row.time);
    if(idx >= 0) arr[idx] = mergeBufferRow(arr[idx],closedRow);
    else if(!arr.length || closedRow.time > arr[arr.length-1].time) arr.push(closedRow);
    else{
      arr.push(closedRow);
      arr.sort((a,b) => a.time - b.time);
    }
    trimClosedBuffer(tf,limitOverride);
  }
  function prependClosedBuffer(tf,rows,limitOverride,{trimFromRight=false}={}){
    if(!tf || !Array.isArray(rows) || !rows.length) return getClosedBuffer(tf);
    const existing = getClosedBuffer(tf);
    const merged = rows
      .filter(row => row && Number.isFinite(Number(row.time)))
      .map(cloneRow)
      .concat(existing.map(cloneRow));
    merged.sort((a,b) => a.time - b.time);
    const deduped = [];
    for(const row of merged){
      const last = deduped[deduped.length-1];
      if(last && Number(last.time) === Number(row.time)) deduped[deduped.length-1] = mergeBufferRow(last,row);
      else deduped.push(row);
    }
    state.closedKlinesByTf[tf] = deduped;
    if(trimFromRight){
      const limit = Math.max(10, limitOverride || deduped.length);
      while(state.closedKlinesByTf[tf].length > limit) state.closedKlinesByTf[tf].pop();
    }else{
      trimClosedBuffer(tf,limitOverride || deduped.length);
    }
    return getClosedBuffer(tf);
  }
  async function ensureOlderClosedCandles(tf,beforeTime,neededCount,retentionLimit){
    ensureBufferSymbol();
    const existing = getClosedBuffer(tf);
    const oldest = existing.length ? Number(existing[0].time) : Infinity;
    const beforeMsRaw = Number(beforeTime);
    const beforeMs = beforeMsRaw > 1e12 ? beforeMsRaw : beforeMsRaw * 1000;
    const target = clamp(Math.ceil(Number(neededCount) || 0),1,OLDER_LIMIT);
    const retention = Math.max(
      10,
      Number(retentionLimit) || intervalKeep(tf),
      Math.min(CHART_HISTORY_RETENTION_CAP, existing.length + target)
    );
    if(!Number.isFinite(beforeMs) || beforeMs <= 0) return {added:0,fetched:0,rows:getClosedBuffer(tf),noMore:true};

    const rows = [];
    let cursor = beforeMs;
    let terminalBatch = false;
    while(rows.length < target){
      const remaining = target - rows.length;
      const batch = await klinesForInterval(tf,cursor,Math.min(KLINE_LIMIT,remaining),cfg().symbol);
      if(!batch.length){
        terminalBatch = true;
        break;
      }
      const validOlder = batch.filter(row => {
        const t = Number(row && row.time);
        return Number.isFinite(t) && t < oldest && (t * 1000) < beforeMs;
      });
      rows.push(...validOlder);
      const first = batch[0];
      const firstMs = Number(first && (first.openTime || (first.time * 1000)));
      if(batch.length < Math.min(KLINE_LIMIT,remaining) || !Number.isFinite(firstMs)){
        terminalBatch = true;
        break;
      }
      cursor = firstMs - 1;
    }

    const beforeLen = getClosedBuffer(tf).length;
    if(rows.length) prependClosedBuffer(tf,rows,retention,{trimFromRight:true});
    const after = getClosedBuffer(tf);
    return {
      added:Math.max(0,after.length - beforeLen),
      fetched:rows.length,
      rows:after,
      noMore:terminalBatch && rows.length < target
    };
  }
  function ingestRestRows(tf,rows,{replace=false,limitOverride}={}){
    if(!Array.isArray(rows) || !rows.length) return getClosedBuffer(tf);
    const limit = Math.max(10, limitOverride || intervalKeep(tf));
    if(replace){
      let closed = rows.map(row => ({...cloneRow(row),final:true}));
      let forming = null;
      const tail = closed[closed.length-1];
      if(isFormingRow(tf,tail)){
        forming = {...cloneRow(tail),final:false};
        closed = closed.slice(0,-1);
      }
      state.closedKlinesByTf[tf] = closed.slice(-limit);
      if(forming) setFormingCandle(tf,forming,{replace:true});
      else delete state.formingKlineByTf[tf];
      return getClosedBuffer(tf);
    }
    for(const row of rows){
      if(isFormingRow(tf,row)) setFormingCandle(tf,{...row,final:false},{replace:true});
      else upsertClosedBuffer(tf,{...row,final:true},limit);
    }
    return getClosedBuffer(tf);
  }
  async function seedBuffer(tf,count,force=false){
    ensureBufferSymbol();
    const existing = getClosedBuffer(tf);
    const keepCfg = sharedTfConfig(tf);
    const targetClosed = Math.max(1, Number(count) || 0);
    const retentionCap = Math.max(targetClosed, keepCfg ? keepCfg.cap : intervalKeep(tf));
    if(!force && existing.length >= targetClosed) return existing;

    const fetchWindow = async (endMs,startRows,target) => {
      let rows = Array.isArray(startRows) ? startRows.slice() : [];
      let cursor = Number(endMs) || Date.now();
      while(rows.length < target){
        const remaining = target - rows.length;
        const batch = await klinesForInterval(tf,cursor,Math.min(KLINE_LIMIT,remaining),cfg().symbol);
        if(!batch.length) break;
        rows = rows.length ? batch.concat(rows) : batch;
        const oldest = batch[0];
        if(batch.length < Math.min(KLINE_LIMIT,remaining) || !oldest || !Number.isFinite(Number(oldest.openTime || (oldest.time * 1000)))) break;
        cursor = Number(oldest.openTime || (oldest.time * 1000)) - 1;
      }
      return rows;
    };

    if(force || !existing.length){
      const rows = await fetchWindow(Date.now(),[],Math.max(targetClosed + 1,targetClosed));
      ingestRestRows(tf,rows,{
        replace:true,
        limitOverride:retentionCap
      });
      return getClosedBuffer(tf);
    }

    const oldestExisting = existing[0];
    const beforeMs = Number(oldestExisting && (oldestExisting.openTime || (oldestExisting.time * 1000))) - 1;
    if(!Number.isFinite(beforeMs) || beforeMs <= 0) return existing;
    const missing = Math.max(0, targetClosed - existing.length);
    if(!missing) return existing;
    const olderRows = await fetchWindow(beforeMs,[],missing);
    prependClosedBuffer(tf,olderRows,retentionCap);
    return getClosedBuffer(tf);
  }
  async function seedSsscBuffers(force=false){
    ensureBufferSymbol();
    for(const tf of SHARED_SSSC_TFS){
      await seedBuffer(tf.interval,tf.keep,force);
    }
  }
  async function seedMaStackBuffers(force=false){
    ensureBufferSymbol();
    for(const tf of SHARED_MA_STACK_TFS){
      await seedBuffer(tf.interval,tf.keep,force);
    }
  }
  function ensureSsscBuffers(force=false){
    if(state.ssscSeedPromise) return state.ssscSeedPromise;
    state.ssscSeedPromise = seedSsscBuffers(force)
      .catch(e => {
        console.warn(MODULE + " SSSC seed failed",e);
        throw e;
      })
      .finally(() => {
        state.ssscSeedPromise = null;
      });
    return state.ssscSeedPromise;
  }
  function ensureMaStackBuffers(force=false){
    if(state.maStackSeedPromise) return state.maStackSeedPromise;
    state.maStackSeedPromise = seedMaStackBuffers(force)
      .catch(e => {
        console.warn(MODULE + " MA Stack seed failed",e);
        throw e;
      })
      .finally(() => {
        state.maStackSeedPromise = null;
      });
    return state.maStackSeedPromise;
  }
  function markWsTick(source){
    if(state.reconnectTimer){
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    lastWs = now();
    diag.lastWsTickTime = lastWs;
    diag.lastError = null;
    state.lastMessageSource = source;
    syncDiag({lastMessageSource:source});
    markLiveUpdate();
    refreshConnectionStatus();
  }
  function queueTradeTick(d){
    const price = Number(d && d.p);
    const ms = Number((d && (d.T || d.E)) || now());
    if(!Number.isFinite(price) || price <= 0) return;
    diag.latestPrice = price;
    diag.latestAggTradeTickTime = ms;
    lastMarkPrice = price;
    if(mClose) mClose.textContent = ip(price);
    updatePositionStrip({close:price});
  }
  function queueMarkPriceTick(d){
    const price = Number(d && d.p);
    const ms = Number((d && d.E) || now());
    if(!Number.isFinite(price) || price <= 0) return;
    diag.latestMarkPrice = price;
    diag.lastMarkPriceTickTime = ms;
    lastMarkPrice = price;
    if(mClose) mClose.textContent = ip(price);
    updatePositionStrip({close:price});
    updateTabTitle();
  }
  function handleKline(d){
    ensureBufferSymbol();
    const row = parseWsKline(d.k);
    diag.lastKlineTickByTf[d.k.i] = Number((d && d.E) || d.k.t || now());
    if(d.k.x){
      row.final = true;
      upsertClosedBuffer(d.k.i,row,intervalKeep(d.k.i));
      delete state.formingKlineByTf[d.k.i];
    }else{
      setFormingCandle(d.k.i,row,{replace:true});
    }
    if(d.k.i === iv()){
      rehydrateActiveChartFromHub(d.k.i,Number((d && d.E) || d.k.t || now()),"ws");
    }
    refreshConnectionStatus();
  }
  function scheduleReconnect(reason,delay=1500){
    if(!state.desiredLive || loading) return;
    if(state.reconnectTimer) return;
    diag.lastError = reason || null;
    diag.reconnectCount += 1;
    paintStatus("RECONNECTING",reason || "socket reconnect");
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    },delay);
  }
  async function restSyncLatest(reason="fallback"){
    if(state.restInFlight) return;
    const requestStarted = now();
    const requestSymbol = cfg().symbol;
    const requestInterval = iv();
    state.restInFlight = true;
    diag.restFallbackTimestamp = requestStarted;
    if(!waitingForFirstTick()) paintStatus("REST FALLBACK",reason);
    try{
      const rows = await klines(Date.now(),REST_LATEST_LIMIT);
      if(cfg().symbol !== requestSymbol || iv() !== requestInterval) return;
      const currentChart = getChartBuffer(requestInterval);
      const currentLastTime = currentChart.length ? currentChart[currentChart.length-1].time : 0;
      const activeKlineTick = Number(diag.lastKlineTickByTf[requestInterval]) || 0;
      const applicable = [];
      for(const row of rows){
        if(activeKlineTick > requestStarted && row.time >= currentLastTime) continue;
        applicable.push(row);
      }
      ingestRestRows(iv(),applicable,{replace:false,limitOverride:intervalKeep(iv())});
      rehydrateActiveChartFromHub(iv(),now(),"rest");
      lastRest = now();
      diag.lastRestSyncTime = lastRest;
      refreshConnectionStatus();
    }catch(e){
      diag.lastError = e && e.message ? e.message : String(e);
      if(!socketOpen()) paintStatus("OFFLINE / ERROR",diag.lastError);
      console.warn(MODULE + " REST fallback failed",e);
    }finally{
      state.restInFlight = false;
    }
  }
  function connect(){
    state.desiredLive = true;
    ensureBufferSymbol();
    state.generation += 1;
    const token = state.generation;
    if(state.reconnectTimer){
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    closeRealtimeSocket();
    const streams = currentStreams();
    const url = wsBase() + "?streams=" + streams.join("/");
    state.connectStartedAt = now();
    diag.streams = streams.slice();
    diag.activeUrl = url;
    diag.lastWsTickTime = 0;
    syncDiag({status:"RECONNECTING"});
    paintStatus("RECONNECTING","opening Binance stream");
    try{
      ws = API.connectWebSocket(url,{
        reconnect:false,
        onOpen:() => {
          if(token !== state.generation || ws == null) return;
          syncDiag({socketStatus:"open"});
          paintStatus("RECONNECTING","waiting for Binance tick");
        },
        onMessage:event => {
          if(token !== state.generation || !ws) return;
          let d;
          try{
            const msg = JSON.parse(event.data);
            d = msg && msg.data ? msg.data : msg;
          }catch(err){
            diag.lastError = "WS parse error";
            console.error(MODULE + " WS parse error",err);
            return;
          }
          if(d && Object.prototype.hasOwnProperty.call(d,"result")) return;
          if(d && d.s && d.s !== cfg().symbol) return;
          if(d && d.E){
            window.__countdownExchangeMs = Number(d.E);
            window.__countdownLocalMs = now();
          }
          if(d && d.e === "kline" && d.k){
            markWsTick("kline");
            handleKline(d);
          }else if(d && d.e === "aggTrade"){
            markWsTick("aggTrade");
            queueTradeTick(d);
          }else if(d && d.e === "markPriceUpdate"){
            markWsTick("markPrice");
            queueMarkPriceTick(d);
          }
        },
        onError:() => {
          if(token !== state.generation || !ws) return;
          diag.lastError = "WebSocket error";
          scheduleReconnect("WebSocket error",2500);
        },
        onClose:event => {
          if(token !== state.generation) return;
          const reason = "closed " + (event && event.code ? event.code : "");
          diag.lastError = reason;
          scheduleReconnect(reason,2000);
        }
      });
    }catch(e){
      diag.lastError = e && e.message ? e.message : String(e);
      scheduleReconnect(diag.lastError,2500);
    }
  }
  function stop(){
    state.desiredLive = false;
    if(state.reconnectTimer){
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    closeRealtimeSocket();
    refreshConnectionStatus();
  }
  function rebuildRequirements(forceReconnect=false){
    ensureBufferSymbol();
    const nextStreams = currentStreams();
    const changed = diag.streams.join("|") !== nextStreams.join("|");
    if(forceReconnect || changed){
      connect();
    }
    if(state.ssscVisible){
      ensureSsscBuffers(false).catch(() => {});
    }
    if(state.maStackVisible){
      ensureMaStackBuffers(false).catch(() => {});
    }
  }
  function runStatusLoop(){
    refreshConnectionStatus();
    if(loading || waitingForFirstTick()) return;
    const globalAge = diag.lastWsTickTime ? now() - diag.lastWsTickTime : Infinity;
    const chartAge = activeChartAge();
    if((!socketOpen() || chartAge > ACTIVE_FEED_STALE_MS) && !state.restInFlight){
      restSyncLatest("status loop stale");
    }
    if((!socketOpen() && globalAge > ACTIVE_FEED_STALE_MS) || globalAge > WS_RECONNECT_MS){
      scheduleReconnect("stale WebSocket",1000);
    }
  }
  function startStatusLoop(){
    stopStatusLoop();
    state.statusTimer = setInterval(runStatusLoop,1000);
    runStatusLoop();
  }
  function stopStatusLoop(){
    if(state.statusTimer){
      clearInterval(state.statusTimer);
      state.statusTimer = null;
    }
  }
  function startPollLoop(){ startStatusLoop(); }
  function stopPollLoop(){ stopStatusLoop(); }
  function startWatchLoop(){ startStatusLoop(); }
  function stopWatchLoop(){ stopStatusLoop(); }
  function setSsscVisible(visible){
    ensureBufferSymbol();
    state.ssscVisible = !!visible;
    rebuildRequirements(true);
    if(state.ssscVisible){
      ensureSsscBuffers(false).catch(() => {});
    }
  }
  function setMaStackVisible(visible){
    ensureBufferSymbol();
    const next = !!visible;
    const changed = state.maStackVisible !== next;
    state.maStackVisible = next;
    if(!changed){
      if(state.maStackVisible) ensureMaStackBuffers(false).catch(() => {});
      return;
    }
    rebuildRequirements(true);
    if(state.maStackVisible){
      ensureMaStackBuffers(false).catch(() => {});
    }
  }
  function handleVisibilityReturn(){
    if(document.hidden) return;
    restSyncLatest("visibility/focus return");
    if(state.ssscVisible) ensureSsscBuffers(false).catch(() => {});
    if(state.maStackVisible) ensureMaStackBuffers(false).catch(() => {});
    if(!socketOpen()) connect();
    else refreshConnectionStatus();
  }

  function scheduleVisibilityRecovery(){
    if(state.visibilityRecoveryTimer){
      clearTimeout(state.visibilityRecoveryTimer);
    }
    state.visibilityRecoveryTimer = setTimeout(() => {
      state.visibilityRecoveryTimer = null;
      handleVisibilityReturn();
    },80);
  }

  ["visibilitychange","focus","pageshow"].forEach(ev => {
    window.addEventListener(ev,scheduleVisibilityRecovery,true);
  });

  window.BINANCE_REALTIME_DIAG = diag;
  window.binanceRealtimeDiagnostics = () => ({...diag});

  return {
    diag,
    state,
    connect,
    stop,
    pollOnce: async () => {
      if(waitingForFirstTick()) return;
      const chartAge = activeChartAge();
      if(socketOpen() && chartAge <= ACTIVE_FEED_STALE_MS) return;
      await restSyncLatest("manual/fallback sync");
    },
    startPollLoop,
    stopPollLoop,
    startWatchLoop,
    stopWatchLoop,
    startStatusLoop,
    stopStatusLoop,
    refreshConnectionStatus,
    setLegacyConnectionState,
    resetConnectionState,
    restSyncLatest,
    rebuildRequirements,
    setSsscVisible,
    setMaStackVisible,
    seedBuffer,
    ensureOlderClosedCandles,
    seedSsscBuffers,
    ensureSsscBuffers,
    seedMaStackBuffers,
    ensureMaStackBuffers,
    getClosedBuffer,
    getFormingCandle,
    getChartBuffer,
    prependClosedBuffer,
    ingestRestRows,
    isSsscVisible: () => state.ssscVisible
  };
})();

window.PUBLIC_MARKET_DATA_HUB = marketDataHub;
window.refreshConn = refreshConn;

// Legacy lifecycle names are kept as thin aliases for older local call sites.
function startPoll(){
  marketDataHub.startStatusLoop();
}

function stopPoll(){
  marketDataHub.stopStatusLoop();
}

function connectWs(){
  marketDataHub.rebuildRequirements(true);
}

function startWatch(){
  marketDataHub.startStatusLoop();
}

function stopWatch(){
  marketDataHub.stopStatusLoop();
}

async function loadChart(opt={}){
  if(loading) return;
  const preserveView = !!opt.preserveView;
  const keepVisible = preserveView ? visibleCount : DEF_VISIBLE;
  const keepRight = preserveView ? rightOffset : 0;
  const keepLoaded = preserveView
    ? Math.max(Array.isArray(candles) ? candles.length : 0, keepVisible || 0)
    : 0;
  const keepManual = preserveView && manualY;
  const keepMin = keepManual ? yMin : null;
  const keepMax = keepManual ? yMax : null;
  const tradesOff = !(tglResults && tglResults.checked);
  const targetRight = preserveView && tradesOff ? Math.min(0, Number(keepRight) || 0) : keepRight;

  loading = true;

  stopWatch();
  stopDailyTimer();

  marketDataHub.stop();
  marketDataHub.resetConnectionState("loading chart");

  try{
    const nextCandles = await fetchInitial(keepLoaded || undefined);
    lastMarkPrice = null;
    dailyState = null;
    candles = Array.isArray(nextCandles) ? nextCandles : marketDataHub.getChartBuffer(iv());
    ema20 = [];
    ema50 = [];
    ema3 = [];
    vwap = [];
    noMoreOlder = false;
    loadingOlder = false;
    olderFetchArmed = false;
    olderFetchTargetVisible = 0;
    rightOffset = 0;
    visibleCount = DEF_VISIBLE;
    if(!opt.focus){
      manualY = false;
      yMin = null;
      yMax = null;
    }
    if(preserveView){
      visibleCount = keepVisible || visibleCount;
      rightOffset = targetRight;
      if(keepManual && validRange(keepMin,keepMax)){
        manualY = true;
        yMin = keepMin;
        yMax = keepMax;
      }else{
        manualY = false;
        yMin = null;
        yMax = null;
      }
    }
    indicators();

    await fetchDaily().catch(e => console.error("Daily fetch failed",e));

    markLiveUpdate();

    if(opt.focus) applyFocus(opt.focus);
    else if(!preserveView) resetView();
    else clampView();

    if(candles.length) metrics(candles[candles.length-1]);

    draw();
    marketDataHub.rebuildRequirements(true);
    await pollOnce();
    startDailyTimer();
    startWatch();
  }catch(e){
    console.error(e);
    marketDataHub.refreshConnectionStatus();
  }finally{
    loading = false;
  }
}


/* =========================================================
   SECTION 11 — SIGNED BINANCE TRADE DATA
========================================================= */

async function hmac(secret,msg){
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC",key,enc.encode(msg));

  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2,"0"))
    .join("");
}

async function serverTime(){
  try{
    const r = await API.fetch(cfg().time,{cache:"no-store"});
    if(!r.ok) throw new Error("time HTTP " + r.status);

    const d = await r.json();
    if(d && d.serverTime) return +d.serverTime;
  }catch(e){
    console.error("Server time failed, using local",e);
  }

  return Date.now();
}

async function signedGet(url,p,key,sec,off){
  const params = new URLSearchParams({
    ...p,
    recvWindow:"5000",
    timestamp:String(Date.now() + off)
  });

  const q = params.toString();
  const sig = await hmac(sec,q);

  const r = await API.fetch(url + "?" + q + "&signature=" + sig,{
    method:"GET",
    cache:"no-store",
    headers:{"X-MBX-APIKEY":key}
  });

  const d = await r.json();

  if(!r.ok){
    throw new Error(d && d.msg ? d.msg : "HTTP " + r.status);
  }

  return d;
}

async function timeOffset(){
  return await serverTime() - Date.now();
}

async function getTrades(key,sec,off){
  const c = cfg();
  const rw = reportRangeMs();
  const end = rw.end;
  const rStart = rw.start;

  const start = Math.max(
    0,
    rStart - RECON_LOOKBACK_WEEKS * WEEK_MS
  );

  const all = [];
  const seen = new Set();

  let chunk = start;

  while(chunk < end){
    const chunkEnd = Math.min(chunk + TRADE_CHUNK_MS - 1,end);
    let page = chunk;
    let n = 0;

    while(page <= chunkEnd && n < 30){
      const rows = await signedGet(
        c.userTrades,
        {
          symbol:c.symbol,
          startTime:String(Math.floor(page)),
          endTime:String(Math.floor(chunkEnd)),
          limit:String(TRADE_LIMIT)
        },
        key,
        sec,
        off
      );

      if(!Array.isArray(rows) || !rows.length) break;

      for(const row of rows){
        const k =
          String(row.id ?? "") + "_" +
          String(row.orderId ?? "") + "_" +
          String(row.time ?? "");

        if(!seen.has(k)){
          seen.add(k);
          all.push(row);
        }
      }

      if(rows.length < TRADE_LIMIT) break;

      const lt = Math.max(...rows.map(r => Number(r.time || 0)));
      if(!isFinite(lt) || lt <= page) break;

      page = lt + 1;
      n++;
    }

    chunk = chunkEnd + 1;
  }

  return all;
}

/* PATCH_37_REDO_NET_PL_FUNDING_UI_FIX: focused signed read-only funding income lookup. */
async function getFundingIncome(key,sec,off){
  const c = cfg();
  const endpoint = c.income || "https://fapi.binance.com/fapi/v1/income";
  const rw = reportRangeMs();
  const end = rw.end;
  const start = Math.max(0,rw.start - RECON_LOOKBACK_WEEKS * WEEK_MS);
  const all = [];
  const seen = new Set();

  let chunk = start;
  while(chunk < end){
    const chunkEnd = Math.min(chunk + TRADE_CHUNK_MS - 1,end);
    let page = chunk;
    let n = 0;

    while(page <= chunkEnd && n < 30){
      const rows = await signedGet(
        endpoint,
        {
          symbol:c.symbol,
          incomeType:"FUNDING_FEE",
          startTime:String(Math.floor(page)),
          endTime:String(Math.floor(chunkEnd)),
          limit:"1000"
        },
        key,
        sec,
        off
      );

      if(!Array.isArray(rows) || !rows.length) break;

      for(const row of rows){
        const k =
          String(row.tranId ?? row.time ?? "") + "_" +
          String(row.symbol ?? "") + "_" +
          String(row.income ?? "");
        if(!seen.has(k)){
          seen.add(k);
          all.push(row);
        }
      }

      if(rows.length < 1000) break;

      const lt = Math.max(...rows.map(r => Number(r.time || 0)));
      if(!isFinite(lt) || lt <= page) break;
      page = lt + 1;
      n++;
    }

    chunk = chunkEnd + 1;
  }

  fundingIncomeFetchStats = {rows:all.length,start,end,symbol:c.symbol};
  if(typeof window !== "undefined"){
    window.__v13Patch37CFundingStats = {
      fetchedRows:all.length,
      fetchStart:start,
      fetchEnd:end,
      symbol:c.symbol,
      matches:{}
    };
  }
  return all;
}

async function getPositions(key,sec,off){
  const rows = await signedGet(
    cfg().positionRisk,
    {symbol:cfg().symbol},
    key,
    sec,
    off
  );

  return Array.isArray(rows) ? rows : [];
}


/* =========================================================
   SECTION 12 — TRADE RECONSTRUCTION
========================================================= */

function reconstruct(rows,symbol){
  const sorted = rows.slice().sort(
    (a,b) =>
      Number(a.time) - Number(b.time) ||
      Number(a.id || 0) - Number(b.id || 0)
  );

  const EPS = 1e-12;
  const markers = [];
  const links = [];
  const lots = [];

  let mi = 1;
  let li = 1;
  let unres = 0;
  let chainSeq = 1;
  const newChainId = () => "tc" + (chainSeq++);

  const sgn = r => r.side === "BUY" ? 1 : -1;
  const letter = s => s > 0 ? "B" : "S";
  const side = s => s > 0 ? "LONG" : "SHORT";

  function addM(d){
    const m = {
      id:"m" + mi++,
      symbol,
      role:d.role,
      letter:d.letter,
      time:d.time,
      price:d.price,
      qty:d.qty,
      pnl:d.pnl || 0,
      fee:d.fee || 0,
      side:d.side || "",
      unresolved:!!d.unresolved,
      tradeId:d.tradeId,
      orderId:d.orderId,
      rawSide:d.rawSide || "",
      note:d.note || "",
      chainId:d.chainId || null,
      tradeChainId:d.chainId || null,
      isFinalExit:!!d.isFinalExit
    };

    markers.push(m);
    return m;
  }

  function addLot(m,s,q,p,t,f,chainId){
    lots.push({
      markerId:m.id,
      sign:s,
      remainingQty:q,
      originalQty:q,
      price:p,
      time:t,
      feeRemaining:f,
      feeOriginal:f,
      chainId:chainId || (m && m.chainId) || null
    });
  }

  const total = () => lots.reduce((a,l) => a + Math.abs(l.remainingQty),0);
  const pos = () => lots.length ? lots[0].sign : 0;

  for(const row of sorted){
    const q = +row.qty;
    const p = +row.price;
    const t = Math.floor(+row.time / 1000);
    const s = sgn(row);
    const f = feeQuote(row,symbol);
    const rp = Number(row.realizedPnl);
    const pnl = isFinite(rp) ? rp : 0;

    if(!isFinite(q) || q <= EPS || !isFinite(p) || p <= 0 || !isFinite(t) || t <= 0){
      continue;
    }

    const tid = row.id;
    const oid = row.orderId;
    const raw = row.side;
    const ps = pos();

    if(ps === 0){
      if(Math.abs(pnl) > EPS){
        unres++;

        addM({
          role:"close",
          letter:"C",
          time:t,
          price:p,
          qty:q,
          pnl,
          fee:f,
          side:"UNRESOLVED",
          unresolved:true,
          tradeId:tid,
          orderId:oid,
          rawSide:raw,
          note:"Carry-in close/reduction. Matching entry is before reconstruction lookback or unavailable."
        });

        continue;
      }

      const chainId = newChainId();
      const m = addM({
        role:"entry",
        letter:"E",
        time:t,
        price:p,
        qty:q,
        fee:f,
        side:side(s),
        tradeId:tid,
        orderId:oid,
        rawSide:raw,
        note:"Entry/open fill",
        chainId
      });

      addLot(m,s,q,p,t,f,chainId);
      continue;
    }

    if(s === ps){
      const chainId = (lots[0] && lots[0].chainId) || newChainId();
      const m = addM({
        role:"entry",
        letter:letter(s),
        time:t,
        price:p,
        qty:q,
        fee:f,
        side:side(s),
        tradeId:tid,
        orderId:oid,
        rawSide:raw,
        note:"Added to position",
        chainId
      });

      addLot(m,s,q,p,t,f,chainId);
      continue;
    }

    let rem = q;
    const openBefore = total();
    const closeTotal = Math.min(rem,openBefore);
    let cm = null;

    if(closeTotal > EPS){
      const closeChainId = (lots[0] && lots[0].chainId) || null;
      const isFinalExit = closeTotal >= openBefore - EPS;
      cm = addM({
        role:"close",
        letter:isFinalExit ? "C" : "P",
        time:t,
        price:p,
        qty:closeTotal,
        pnl:pnl * (closeTotal / q),
        fee:f * (closeTotal / q),
        side:side(ps),
        tradeId:tid,
        orderId:oid,
        rawSide:raw,
        note:"Reduction/close fill",
        chainId:closeChainId,
        isFinalExit
      });
    }

    while(rem > EPS && lots.length){
      const lot = lots[0];
      const before = lot.remainingQty;
      const cq = Math.min(rem,lot.remainingQty);

      const ef = lot.feeRemaining * (cq / before);
      const xf = f * (cq / q);
      const rpPart = pnl * (cq / q);
      const gr = gross(lot.sign,lot.price,p,cq);
      const priceNet = gr - ef - xf;
      const realizedNet = rpPart - ef - xf;
      const net = (isFinite(priceNet) && isFinite(realizedNet) && Math.abs(priceNet) > EPS && Math.abs(realizedNet) > EPS && Math.sign(priceNet) !== Math.sign(realizedNet))
        ? priceNet
        : (isFinite(realizedNet) ? realizedNet : priceNet);

      if(cm){
        links.push({
          id:"l" + li++,
          symbol,
          entryMarkerId:lot.markerId,
          exitMarkerId:cm.id,
          entryTime:lot.time,
          entryPrice:lot.price,
          exitTime:t,
          exitPrice:p,
          qty:cq,
          side:side(lot.sign),
          grossPnl:gr,
          realizedPnl:rpPart,
          fees:ef + xf,
          netPnl:net,
          binanceRealizedPnl:rpPart,
          tradeId:tid,
          orderId:oid,
          unresolved:false,
          chainId:lot.chainId || (cm && cm.chainId) || null,
          tradeChainId:lot.chainId || (cm && cm.chainId) || null,
          exitIsFinal:cm ? !!cm.isFinalExit : false
        });
      }

      lot.remainingQty -= cq;
      lot.feeRemaining -= ef;
      rem -= cq;

      if(lot.remainingQty <= EPS) lots.shift();
    }

    if(rem > EPS){
      const chainId = newChainId();
      const m = addM({
        role:"entry",
        letter:"E",
        time:t,
        price:p,
        qty:rem,
        fee:f * (rem / q),
        side:side(s),
        tradeId:tid,
        orderId:oid,
        rawSide:raw,
        note:"Reverse entry remainder from same fill",
        chainId
      });

      addLot(m,s,rem,p,t,f * (rem / q),chainId);
    }
  }

  const latest = candles.length ? candles[candles.length-1] : null;

  const openConnectors = lots.map(l => ({
    id:"open_" + l.markerId,
    symbol,
    entryMarkerId:l.markerId,
    entryTime:l.time,
    entryPrice:l.price,
    exitTime:latest ? latest.time : Math.floor(Date.now()/1000),
    exitPrice:latest ? latest.close : l.price,
    qty:l.remainingQty,
    side:side(l.sign),
    open:true,
    chainId:l.chainId || null,
    tradeChainId:l.chainId || null
  }));

  for(const m of markers){
    if(m.letter === "E") m.letter = m.side === "SHORT" ? "ES" : "EL";
    else if(m.letter === "C") m.letter = "EX";
    m.candleTime = Math.floor(Number(m.time || 0) / ivSec()) * ivSec();
  }

  return {
    markers,
    links,
    openConnectors,
    unresolved:unres,
    openLots:lots
  };
}

function filterReconstructionForReport(rec){
  const win = reportWindowSec();
  const keepMarkers = new Set();
  const keepLinks = new Map();

  const seedLinks = rec.links.filter(l =>
    (l.exitTime >= win.start && l.exitTime <= win.end) ||
    (l.entryTime >= win.start && l.entryTime <= win.end)
  );

  for(const l of seedLinks){
    keepLinks.set(l.id,l);
    keepMarkers.add(l.entryMarkerId);
    keepMarkers.add(l.exitMarkerId);
  }

  const inPeriodMarkers = rec.markers.filter(
    m => m.time >= win.start && m.time <= win.end
  );

  for(const m of inPeriodMarkers){
    keepMarkers.add(m.id);
  }

  // Keep complete parent trade chains for any visible trade element.
  // This preserves EL/ES -> adds/partials -> EX continuity during history/report filtering.
  const seedChainIds = new Set();
  for(const l of rec.links){
    if((keepLinks.has(l.id) || keepMarkers.has(l.entryMarkerId) || keepMarkers.has(l.exitMarkerId)) && l.chainId){
      seedChainIds.add(l.chainId);
    }
  }
  for(const m of rec.markers){
    if(keepMarkers.has(m.id) && m.chainId){
      seedChainIds.add(m.chainId);
    }
  }
  if(seedChainIds.size){
    for(const l of rec.links){
      if(l.chainId && seedChainIds.has(l.chainId)){
        keepLinks.set(l.id,l);
        keepMarkers.add(l.entryMarkerId);
        keepMarkers.add(l.exitMarkerId);
      }
    }
    for(const m of rec.markers){
      if(m.chainId && seedChainIds.has(m.chainId)){
        keepMarkers.add(m.id);
      }
    }
  }

  let changed = true;
  while(changed){
    changed = false;

    for(const l of rec.links){
      if(keepMarkers.has(l.entryMarkerId) || keepMarkers.has(l.exitMarkerId)){
        if(!keepLinks.has(l.id)){
          keepLinks.set(l.id,l);
          changed = true;
        }
        if(!keepMarkers.has(l.entryMarkerId)){
          keepMarkers.add(l.entryMarkerId);
          changed = true;
        }
        if(!keepMarkers.has(l.exitMarkerId)){
          keepMarkers.add(l.exitMarkerId);
          changed = true;
        }
      }
    }
  }

  const openConnectors = rec.openConnectors.slice();

  for(const l of openConnectors){
    keepMarkers.add(l.entryMarkerId);
  }

  const markers = rec.markers.filter(m => keepMarkers.has(m.id));
  const links = rec.links.filter(l => keepLinks.has(l.id));

  return {
    ...rec,
    markers,
    links,
    openConnectors,
    unresolved:markers.filter(m => m.unresolved).length
  };
}

function buildOpenBoxes(lots,risk,symbol){
  updateAccountBalanceFromRisk(risk);
  const boxes = [];
  const EPS = 1e-12;
  const lt = candles.length
    ? candles[candles.length-1].time
    : Math.floor(Date.now()/1000);
  const activeChainId = lots && lots.length ? (lots[0].chainId || null) : null;

  for(const row of risk || []){
    if(row.symbol !== symbol) continue;

    const amt = +row.positionAmt;
    const en = +row.entryPrice;

    if(!isFinite(amt) || Math.abs(amt) <= EPS || !isFinite(en) || en <= 0){
      continue;
    }

    const sh = amt < 0 || row.positionSide === "SHORT";

    boxes.push({
      symbol,
      letter:sh ? "S" : "B",
      side:sh ? "SHORT" : "LONG",
      time:lt,
      price:en,
      qty:Math.abs(amt),
      source:"positionRisk",
      markPrice:Number(row.markPrice),
      unrealizedPnl:Number(row.unRealizedProfit),
      notional:Number(row.notional),
      leverage:Number(row.leverage),
      positionInitialMargin:Number(row.positionInitialMargin),
      isolatedMargin:Number(row.isolatedMargin),
      marginAsset:row.marginAsset || quote(symbol),
      chainId:activeChainId
    });
  }

  if(!boxes.length && lots && lots.length){
    const g = new Map();

    for(const l of lots){
      const k = String(l.sign);

      if(!g.has(k)){
        g.set(k,{sign:l.sign,qty:0,value:0,timeValue:0,chainId:l.chainId || null});
      }

      const x = g.get(k);
      if(!x.chainId && l.chainId) x.chainId = l.chainId;
      x.qty += l.remainingQty;
      x.value += l.price * l.remainingQty;
      x.timeValue += l.time * l.remainingQty;
    }

    for(const x of g.values()){
      if(x.qty > EPS){
        boxes.push({
          symbol,
          letter:x.sign > 0 ? "B" : "S",
          side:x.sign > 0 ? "LONG" : "SHORT",
          time:Math.round(x.timeValue / x.qty),
          price:x.value / x.qty,
          qty:x.qty,
          source:"reconstructed",
          chainId:x.chainId || activeChainId
        });
      }
    }
  }

  return boxes;
}

async function loadTrades(opt={}){
  const silent = !!opt.silent;
  const key = apiKeyEl.value.trim();
  const sec = apiSecretEl.value.trim();

  saveKeysLocal();

  if(!key || !sec){
    updateApiStatus();
    return;
  }

  if(tradeLoading) return;
  tradeLoading = true;

  try{
    if(!silent) tradeCountEl.textContent = "Trades: ...";

    const off = await timeOffset();
    const rows = await getTrades(key,sec,off);
    fundingIncomeRows = await getFundingIncome(key,sec,off).catch(e => {
      console.warn("Funding income fetch failed",e);
      fundingIncomeFetchStats = {rows:0,start:0,end:0,symbol:cfg().symbol};
      return [];
    });
    const risk = await getPositions(key,sec,off);
    const balanceRows = await getAccountBalance(key,sec,off).catch(e => {
      console.warn("Balance fetch failed",e);
      return null;
    });
    updateAccountBalanceFromBalance(balanceRows);

    const full = reconstruct(rows,cfg().symbol);
    const rec = filterReconstructionForReport(full);

    openEntryMarkerIds = new Set((full.openLots || []).map(l => l.markerId));
    activeOpenParentChainIds = new Set((full.openLots || []).map(l => l && (l.parentTradeId || l.chainId || l.tradeChainId)).filter(Boolean));

    fillMarkers = rec.markers;
    resultLinks = rec.links;
    openLotLinks = rec.openConnectors;
    unresolvedCount = rec.unresolved || 0;
    openPositionBoxes = buildOpenBoxes(full.openLots,risk,cfg().symbol);
    updatePositionStrip(candles.length ? candles[candles.length-1] : null);
    updateTabTitle();

    tradeCountEl.textContent =
      "Fills:" + fillMarkers.length +
      " Links:" + resultLinks.length +
      " Open:" + openPositionBoxes.length +
      (unresolvedCount ? " Unres:" + unresolvedCount : "") +
      " LB:" + RECON_LOOKBACK_WEEKS + "W";

    draw();
  }catch(e){
    console.error("Load trades failed",e);
    if(!silent) tradeCountEl.textContent = "Trades: error";
  }finally{
    tradeLoading = false;
    updateApiStatus();
  }
}

function clearTrades(){
  fillMarkers = [];
  resultLinks = [];
  openLotLinks = [];
  openPositionBoxes = [];
  activeOpenParentChainIds = new Set();
  fundingIncomeRows = [];
  fundingIncomeFetchStats = {rows:0,start:0,end:0,symbol:""};
  openEntryMarkerIds = new Set();
  unresolvedCount = 0;
  tradeCountEl.textContent = "Trades: 0";
  updatePositionStrip(candles.length ? candles[candles.length-1] : null);
  updateTabTitle();
  draw();
}

function startTradeAuto(){
  stopTradeAuto();

  setTimeout(() => {
    if(hasKeys()) loadTrades({silent:true});
    else updateApiStatus();
  },2500);

  tradeAutoTimer = setInterval(() => {
    if(hasKeys()) loadTrades({silent:true});
    else updateApiStatus();
  },TRADE_REFRESH_MS);
}

function stopTradeAuto(){
  if(tradeAutoTimer){
    clearInterval(tradeAutoTimer);
    tradeAutoTimer = null;
  }
}


/* =========================================================
   SECTION 13 — DRAWING HELPERS
========================================================= */

function indVisible(arr,vis){
  if(!vis.length) return [];
  const s = vis[0].time;
  const e = vis[vis.length-1].time;
  return arr.filter(p => p.time >= s && p.time <= e);
}

function idxMap(vis){
  const m = new Map();
  vis.forEach((c,i) => m.set(c.time,i));
  return m;
}

function visTime(vis){
  if(!vis.length) return {start:0,end:0};
  return {
    start:vis[0].time,
    end:vis[vis.length-1].time + ivSec()
  };
}

function inTime(t,vis){
  const r = visTime(vis);
  return t >= r.start && t <= r.end;
}

function linkOverlap(l,vis){
  const r = visTime(vis);
  return l.exitTime >= r.start && l.entryTime <= r.end;
}

function priceAt(l,t){
  const s = Math.max(1, l.exitTime - l.entryTime);
  const k = clamp((t - l.entryTime) / s, 0, 1);
  return l.entryPrice + (l.exitPrice - l.entryPrice) * k;
}

function autoYRange(vis){
  return candleOnlyYRange(vis);
}

function yRange(vis){
  if(manualY){
    if(validRange(yMin,yMax)) return {min:yMin,max:yMax};

    manualY = false;
    yMin = null;
    yMax = null;
  }

  return autoYRange(vis);
}

function drawInd(points,vis,map,mapX,mapY,color,w){
  const pts = indVisible(points,vis);
  if(pts.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();

  let started = false;

  for(const p of pts){
    const i = map.get(p.time);
    if(i === undefined) continue;

    const x = mapX(i);
    const y = mapY(p.value);

    if(!started){
      ctx.moveTo(x,y);
      started = true;
    }else{
      ctx.lineTo(x,y);
    }
  }

  ctx.stroke();
}

function timeX(t,vis,mapX,slot){
  if(!vis.length) return null;

  const first = vis[0].time;
  const lastI = vis.length - 1;
  const last = vis[lastI].time;
  const sec = ivSec();

  if(t < first || t > last + sec) return null;

  if(t >= last){
    return mapX(lastI) + clamp((t-last)/sec,0,.5) * slot;
  }

  let lo = 0;
  let hi = lastI;
  let idx = 0;

  while(lo <= hi){
    const mid = Math.floor((lo+hi)/2);

    if(vis[mid].time <= t){
      idx = mid;
      lo = mid + 1;
    }else{
      hi = mid - 1;
    }
  }

  const ni = Math.min(idx+1,lastI);
  const span = Math.max(1, vis[ni].time - vis[idx].time);
  const f = clamp((t - vis[idx].time) / span, 0, 1);

  return mapX(idx) + f * slot;
}

function clipped(l,vis,mapX,mapY,slot){
  if(!linkOverlap(l,vis)) return null;

  const vr = visTime(vis);
  const t1 = Math.max(l.entryTime,vr.start);
  const t2 = Math.min(l.exitTime,vr.end);

  if(t2 < t1) return null;

  const x1 = timeX(t1,vis,mapX,slot);
  const x2 = timeX(t2,vis,mapX,slot);

  if(x1 === null || x2 === null) return null;

  return {
    x1,
    y1:mapY(priceAt(l,t1)),
    x2,
    y2:mapY(priceAt(l,t2))
  };
}

function circle(x,y,txt,col,un=false){
  ctx.save();

  ctx.font = "bold 9px Arial";
  const padX = txt.length > 1 ? 5 : 0;
  const w = Math.max(14, Math.ceil(ctx.measureText(txt).width + 8 + padX));
  const h = 14;
  const bx = ix(x - w/2);
  const by = ix(y - h/2);

  ctx.fillStyle = col;
  ctx.strokeStyle = un ? "#111" : "#fff";
  ctx.lineWidth = un ? 1.6 : 1.1;

  if(w <= 16){
    ctx.beginPath();
    ctx.arc(x,y,7,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
    if(un){
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x,y,9.5,0,Math.PI*2);
      ctx.stroke();
    }
  }else{
    const r = 7;
    ctx.beginPath();
    ctx.moveTo(bx+r, by);
    ctx.lineTo(bx+w-r, by);
    ctx.quadraticCurveTo(bx+w, by, bx+w, by+r);
    ctx.lineTo(bx+w, by+h-r);
    ctx.quadraticCurveTo(bx+w, by+h, bx+w-r, by+h);
    ctx.lineTo(bx+r, by+h);
    ctx.quadraticCurveTo(bx, by+h, bx, by+h-r);
    ctx.lineTo(bx, by+r);
    ctx.quadraticCurveTo(bx, by, bx+r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt,x,y+.5);

  ctx.restore();
}

function boxMarker(x,y,txt,col){
  ctx.save();

  ctx.fillStyle = col;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;

  ctx.fillRect(x-8,y-8,16,16);
  ctx.strokeRect(x-8,y-8,16,16);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt,x,y+.5);

  ctx.restore();
}

function positionBoxMarker(x,y,txt,col,bg){
  ctx.save();

  ctx.font = "bold 10px Arial";
  const pad = 5;
  const w = Math.max(38, Math.ceil(ctx.measureText(txt).width + pad*2));
  const h = 18;
  const bx = ix(x - w/2);
  const by = ix(y - h/2);

  ctx.fillStyle = bg || "rgba(255,255,255,.96)";
  ctx.strokeStyle = col;
  ctx.lineWidth = hairline();
  ctx.fillRect(bx,by,w,h);
  ctx.strokeRect(px(bx),px(by),w,h);

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt,x,y+.5);

  ctx.restore();
}

function lineMiniLabel(txt,x,y,col,clip){
  ctx.save();

  ctx.font = "11px Arial";

  const pad = 4;
  const w = ctx.measureText(txt).width + pad*2;
  const h = 16;
  const cx = clamp(x, clip.left+w/2+2, clip.left+clip.width-w/2-2);
  const cy = clamp(y, clip.top+h/2+2, clip.top+clip.height-h/2-2);

  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.strokeStyle = col;
  ctx.lineWidth = hairline();
  ctx.fillRect(ix(cx-w/2),ix(cy-h/2),w,h);
  ctx.strokeRect(px(cx-w/2),px(cy-h/2),w,h);

  ctx.fillStyle = col;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt,cx,cy+.5);

  ctx.restore();
}

function pnlLabel(txt,x,y,col,clip){
  ctx.save();

  ctx.font = "bold 11px Arial";

  const px = 5;
  const w = ctx.measureText(txt).width + px*2;
  const h = 18;

  const cx = clamp(x, clip.left+w/2+2, clip.left+clip.width-w/2-2);
  const cy = clamp(y, clip.top+h/2+2, clip.top+clip.height-h/2-2);

  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.strokeStyle = col;

  ctx.fillRect(cx-w/2,cy-h/2,w,h);
  ctx.strokeRect(cx-w/2,cy-h/2,w,h);

  ctx.fillStyle = col;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt,cx,cy+.5);

  ctx.restore();
}


/* =========================================================
   SECTION 14 — TOOLTIP / HOVER
========================================================= */

function distSeg(px,py,x1,y1,x2,y2){
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = dx*dx + dy*dy;

  if(!l) return Math.hypot(px-x1,py-y1);

  let t = ((px-x1)*dx + (py-y1)*dy) / l;
  t = clamp(t,0,1);

  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy));
}

function hoverItem(){
  if(!mouse) return null;

  for(const it of overlayHitItems){
    if(it.kind === "marker" && Math.hypot(mouse.x-it.x,mouse.y-it.y) <= it.radius + 4){
      return it;
    }

    if(
      it.kind === "box" &&
      mouse.x >= it.x - it.size/2 - 4 &&
      mouse.x <= it.x + it.size/2 + 4 &&
      mouse.y >= it.y - it.size/2 - 4 &&
      mouse.y <= it.y + it.size/2 + 4
    ){
      return it;
    }
  }

  for(const it of overlayHitItems){
    if(
      it.kind === "line" &&
      distSeg(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 6
    ){
      return it;
    }
  }

  return null;
}

function tooltip(lines,x,y){
  ctx.save();

  ctx.font = "12px Arial";

  const pad = 12;
  const lh = 17;
  const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + pad*2;
  const h = lines.length * lh + pad*2;

  let tx = x + 14;
  let ty = y + 14;

  if(tx + w > canvas.clientWidth - RIGHT_AXIS) tx = x - w - 14;
  if(ty + h > canvas.clientHeight - 10) ty = y - h - 14;

  ctx.fillStyle = "rgba(255,255,255,.98)";
  ctx.strokeStyle = "#d9dce1";
  ctx.fillRect(tx,ty,w,h);
  ctx.strokeRect(tx,ty,w,h);

  ctx.fillStyle = "#1e2329";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  lines.forEach((s,i) => ctx.fillText(s,tx+pad,ty+pad+i*lh));

  ctx.restore();
}

function drawHoverTooltip(){
  const it = hoverItem();

  if(!it || !mouse) return;

  if(it.kind === "line"){
    tooltip(
      it.open
        ? [
            "Open connector",
            "Size: " + fq(it.qty) + " BTC",
            "Side: " + it.side,
            "Entry: " + p2(it.entryPrice),
            "Current: " + p2(it.exitPrice)
          ]
        : [
            "Matched close link",
            "Net P/L: " + fm(it.netPnl),
            "Gross P/L: " + fm(it.grossPnl),
            "Realized P/L: " + fm(it.realizedPnl),
            "Size: " + fq(it.qty) + " BTC",
            "Side: " + it.side
          ],
      mouse.x,
      mouse.y
    );

    return;
  }

  if(it.kind === "marker"){
    const lines = [
      it.role === "entry"
        ? (it.side === "SHORT" ? "Short entry/fill" : "Long entry/fill")
        : (it.unresolved ? "Unresolved/carry-in close" : "Close/reduce fill"),
      "Size: " + fq(it.qty) + " BTC",
      "Price: " + p2(it.price)
    ];

    if(it.role === "close"){
      const closeLinks = resultLinks.filter(l => l.exitMarkerId === it.markerId);
      const closePnl = closeLinks.length ? closeLinks.reduce((a,l) => a + Number(l.netPnl || 0),0) : it.pnl;
      lines.push("P/L part: " + fm(closePnl));
    }

    lines.push("Time: " + ft(it.time));

    if(it.letter === "EX"){
      const entryLines = getExitEntryContributionLines(it.markerId);
      if(entryLines.length){
        lines.push("Entries:");
        lines.push(...entryLines);
      }
    }

    if(it.note) lines.push(it.note);

    tooltip(lines,mouse.x,mouse.y);
    return;
  }

  if(it.kind === "box"){
    const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
    const margin = openBoxMargin(it.boxData);
    const lines = [
      it.letter === "B" ? "Current open long" : "Current open short",
      "Size: " + fq(it.qty) + " BTC",
      "Entry price: " + p2(it.price),
      "Margin: " + (margin == null ? "-" : fm(margin))
    ];
    const openLines = getOpenEntryContributionLines();
    if(openLines.length){
      lines.push("Open entries:");
      lines.push(...openLines);
    }
    if(floating != null) lines.push("Floating P/L: " + fm(floating));
    tooltip(lines,mouse.x,mouse.y);
  }
}

function candleTip(c){
  const d = new Date(c.time*1000);

  const lines = [
    formatDateTime(d),
    "O : " + ip(c.open),
    "H : " + ip(c.high),
    "L : " + ip(c.low),
    "C : " + ip(c.close),
    "V : " + fv(c.volume)
  ];

  ctx.save();

  ctx.font = "11px Arial";

  const pad = 7;
  const lh = 14;
  const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + pad*2;
  const h = lines.length * lh + pad*2;

  const x = 20;
  const y = 26;

  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.strokeStyle = "#d9dce1";
  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x,y,w,h);

  ctx.fillStyle = "#1e2329";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  lines.forEach((s,i) => ctx.fillText(s,x+pad,y+pad+i*lh));

  ctx.restore();
}


/* =========================================================
   SECTION 15 — TRADE OVERLAYS
========================================================= */

function tradeOverlays(vis,mapX,mapY,slot,clip){
  const showP = tglPositions.checked;
  const showR = tglResults.checked;
  const showD = tglDollarValues.checked;
  const showLots = tglLots && tglLots.checked;
  const sym = cfg().symbol;
  const latest = candles.length ? candles[candles.length-1] : null;
  const closedW = getClosedLinkWidth();

  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.left,clip.top,clip.width,clip.height);
  ctx.clip();

  if(showR){
    for(const l of resultLinks){
      if(l.symbol !== sym) continue;
      if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;

      const s = clipped(l,vis,mapX,mapY,slot);
      if(!s) continue;

      const col = Number(l.netPnl) >= 0 ? "#1e88e5" : "#f6465d";

      ctx.strokeStyle = col;
      ctx.lineWidth = closedW;
      ctx.globalAlpha = .9;

      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();

      ctx.globalAlpha = 1;

      overlayHitItems.push({
        kind:"line",
        ...s,
        id:l.id,
        netPnl:l.netPnl,
        grossPnl:l.grossPnl,
        realizedPnl:l.realizedPnl,
        fees:l.fees,
        qty:l.qty,
        side:l.side,
        orderId:l.orderId,
        open:false,
        chainId:l.chainId || l.tradeChainId || null
      });

      if(showD){
        pnlLabel(
          fm(l.netPnl),
          (s.x1+s.x2)/2,
          (s.y1+s.y2)/2 - 10,
          col,
          clip
        );
      }

      if(showLots){
        lineMiniLabel(
          fq(l.qty),
          (s.x1+s.x2)/2,
          (s.y1+s.y2)/2 + (showD ? 12 : -10),
          col,
          clip
        );
      }
    }

    for(const m of fillMarkers){
      if(m.symbol !== sym || !m.unresolved || !inTime(m.time,vis)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;

      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;

      const y = mapY(m.price);

      ctx.save();
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);

      ctx.beginPath();
      ctx.moveTo(px(Math.max(clip.left,x-70)),px(y));
      ctx.lineTo(px(x),px(y));
      ctx.stroke();

      ctx.restore();
    }
  }

  for(const l of openLotLinks){
    if(l.symbol !== sym || !latest) continue;
    if(isIsolateActive() && !isOpenLinkVisibleInIsolate(l)) continue;

    const liveLink = {
      ...l,
      exitTime:latest.time,
      exitPrice:latest.close
    };

    const s = clipped(liveLink,vis,mapX,mapY,slot);
    if(!s) continue;

    const floating = liveLink.side === "LONG"
      ? (latest.close - liveLink.entryPrice) * liveLink.qty
      : (liveLink.entryPrice - latest.close) * liveLink.qty;

    const col = floating >= 0
      ? "rgba(30,136,229,.42)"
      : "rgba(246,70,93,.42)";

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = closedW;
    ctx.setLineDash([4,4]);

    ctx.beginPath();
    ctx.moveTo(px(s.x1),px(s.y1));
    ctx.lineTo(px(s.x2),px(s.y2));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();

    if(showLots){
      lineMiniLabel(
        fq(liveLink.qty),
        (s.x1+s.x2)/2,
        (s.y1+s.y2)/2 - 10,
        col,
        clip
      );
    }

    overlayHitItems.push({
      kind:"line",
      ...s,
      qty:liveLink.qty,
      side:liveLink.side,
      entryPrice:liveLink.entryPrice,
      exitPrice:latest.close,
      open:true,
      entryMarkerId:liveLink.entryMarkerId,
      chainId:liveLink.chainId || liveLink.tradeChainId || null
    });
  }

  for(const m of fillMarkers){
    if(m.symbol !== sym || !inTime(m.time,vis)) continue;
    if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;

    const isOpenEntry = openEntryMarkerIds.has(m.id);
    if(!showP && !isOpenEntry) continue;

    const x = markerTimeX(m,vis,mapX,slot);
    if(x === null) continue;

    const y = mapY(m.price);

    let col = m.side === "SHORT" || m.letter === "S" || m.letter === "ES" ? "#f6465d" : "#0ecb81";

    if(m.role === "close"){
      col = m.unresolved
        ? "#f59e0b"
        : (m.side === "SHORT" ? "#f6465d" : "#0ecb81");
    }

    circle(ix(x),ix(y),m.letter,col,m.unresolved);

    overlayHitItems.push({
      kind:"marker",
      markerId:m.id,
      role:m.role,
      side:m.side,
      letter:m.letter,
      x,
      y,
      radius:m.unresolved ? 11 : Math.max(9, m.letter.length > 1 ? 14 : 7),
      qty:m.qty,
      price:m.price,
      time:m.time,
      pnl:m.pnl,
      fee:m.fee || 0,
      unresolved:m.unresolved,
      chainId:m.chainId || m.tradeChainId || null,
      note:m.note || ""
    });
  }

  for(const b of openPositionBoxes){
    if(b.symbol !== sym || !latest) continue;
    if(isIsolateActive() && !isOpenBoxVisibleInIsolate(b)) continue;

    const y = mapY(b.price);
    if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;

    const liveX = timeX(latest.time,vis,mapX,slot);
    const liveY = mapY(latest.close);
    if(liveX === null) continue;

    const boxCol = b.letter === "B" ? "#0ecb81" : "#f6465d";
    const boxBg = b.letter === "B" ? "rgba(14,203,129,.12)" : "rgba(246,70,93,.10)";
    const lineCol = "rgba(156,163,175,.72)";

    const floating = openBoxFloating(b,latest.close);
    const distance = b.letter === "B"
      ? latest.close - Number(b.price)
      : Number(b.price) - latest.close;
    const pctMargin = pnlPctOfMargin(floating,b);
    const per100 = valuePer100Move(b);

    const boxText = b.side === "SHORT" ? "SHORT" : "LONG";
    const topText = fq(b.qty) + " | " + fm(floating) + " | " + (pctMargin == null ? "--" : pct(pctMargin));
    const bottomText = "Δ " + fd(distance) + " | " + (per100 == null ? "--" : fm(per100));

    ctx.save();
    ctx.font = "12px Arial";
    const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
    const candleClearX = liveX + Math.max(slot*.75,18);
    let boxX = clamp(liveX + slot*5, clip.left+26, clip.left+clip.width-92);
    boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);

    const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
    const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
    const boxGap = Math.max(26,ctx.measureText(boxText).width/2 + 12);
    const leftStop = clamp(boxX - boxGap, clip.left, clip.left+clip.width);
    const rightStart = clamp(boxX + boxGap, clip.left, clip.left+clip.width);

    ctx.strokeStyle = lineCol;
    ctx.lineWidth = hairline();
    ctx.setLineDash([]);

    ctx.beginPath();
    if(lineLeft < leftStop - 2){
      ctx.moveTo(px(lineLeft),px(y));
      ctx.lineTo(px(leftStop),px(y));
    }
    if(rightStart < lineRight - 2){
      ctx.moveTo(px(rightStart),px(y));
      ctx.lineTo(px(lineRight),px(y));
    }
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    ctx.font = "14px Arial";
    ctx.fillStyle = floating > 0 ? "#047857" : floating < 0 ? "#7f1d1d" : "#111";
    ctx.fillText(topText,boxX,y-22);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#111";
    ctx.fillText(bottomText,boxX,y+22);

    ctx.textAlign = "left";
    ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);

    ctx.restore();

    if(liveY >= clip.top && liveY <= clip.top + clip.height){
      ctx.save();
      ctx.strokeStyle = floating >= 0 ? "rgba(30,136,229,.36)" : "rgba(246,70,93,.36)";
      ctx.lineWidth = closedW;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(boxX),px(y));
      ctx.lineTo(px(liveX),px(liveY));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);

    overlayHitItems.push({
      kind:"box",
      letter:b.letter,
      x:boxX,
      y,
      size:16,
      qty:b.qty,
      price:b.price,
      boxData:b,
      chainId:b.chainId || null
    });
  }

  ctx.restore();
}


/* =========================================================
   SECTION 16 — MAIN DRAW
========================================================= */

function dprValue(){ return window.devicePixelRatio || 1; }
function hairline(){ return Math.max(1 / dprValue(), .5); }
function px(v){
  const d = dprValue();
  return (Math.round(Number(v) * d) + 0.5) / d;
}
function ix(v){
  const d = dprValue();
  return Math.round(Number(v) * d) / d;
}

function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1,Math.floor(canvas.clientWidth * dpr));
  const bh = Math.max(1,Math.floor(canvas.clientHeight * dpr));

  if(canvas.width !== bw) canvas.width = bw;
  if(canvas.height !== bh) canvas.height = bh;

  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = false;
  draw();
}

function draw(){
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  overlayHitItems = [];
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0,0,w,h);

  const r = range();
  const vis = candles.slice(r.start,r.end);
  const future = r.futureBars;
  const total = Math.max(2,vis.length + future);

  olderIfNeeded(r);

  if(vis.length < 2){
    ctx.fillStyle = "#1e2329";
    ctx.font = "14px Arial";
    ctx.fillText("Loading...",20,30);
    return;
  }

  const left = LEFT_PAD;
  const right = RIGHT_AXIS;
  const top = 18;
  const bottom = 30;

  const priceH = Math.floor((h-top-bottom) * .78);
  const volTop = top + priceH + 20;
  const volH = h - volTop - bottom;
  const chartW = w - left - right;

  const yr = yRange(vis);
  const minP = yr.min;
  const maxP = yr.max;

  lastYMin = minP;
  lastYMax = maxP;
  lastRange = maxP - minP;
  lastAreaH = priceH;

  const maxVol = Math.max(...vis.map(c => c.volume),1);
  const slot = chartW / total;
  const candleW = Math.max(2,Math.min(13,slot*.68));

  const mapX = i => left + i*slot + slot/2;
  const mapY = p => top + ((maxP-p)/(maxP-minP))*priceH;
  const mapV = v => volTop + volH - (v/maxVol)*volH;

  const clip = {left,top,width:chartW,height:priceH};

  const latest = vis[vis.length-1];
  const latestY = mapY(latest.close);

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(w-right,top,right,priceH);

  ctx.strokeStyle = "#d9dce1";
  ctx.beginPath();
  ctx.moveTo(w-right,top);
  ctx.lineTo(w-right,h-bottom);
  ctx.stroke();

  ctx.font = "12px Arial";
  ctx.lineWidth = hairline();

  for(let i=0;i<=6;i++){
    const y = px(top + priceH*i/6);
    const p = maxP - (maxP-minP)*i/6;

    ctx.strokeStyle = "#edf0f2";
    ctx.beginPath();
    ctx.moveTo(px(left),y);
    ctx.lineTo(px(w-right),y);
    ctx.stroke();

    ctx.fillStyle = "#707a8a";
    ctx.fillText(ip(p),w-right+8,y+4);
  }

  for(let i=0;i<=5;i++){
    const x = px(left + chartW*i/5);

    ctx.strokeStyle = "#f4f5f7";
    ctx.beginPath();
    ctx.moveTo(x,px(top));
    ctx.lineTo(x,px(h-bottom));
    ctx.stroke();
  }

  ctx.strokeStyle = "#edf0f2";
  ctx.beginPath();
  ctx.moveTo(px(left),px(volTop));
  ctx.lineTo(px(w-right),px(volTop));
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(left,top,chartW,priceH);
  ctx.clip();

  for(let i=0;i<vis.length;i++){
    const c = vis[i];
    const x = mapX(i);
    const bull = c.close >= c.open;

    const body = bull ? css("--candle-up-body") : css("--candle-down-body");
    const border = bull ? css("--candle-up-border") : css("--candle-down-border");
    const wick = bull ? css("--candle-up-wick") : css("--candle-down-wick");

    const oy = mapY(c.open);
    const cy = mapY(c.close);
    const hy = mapY(c.high);
    const ly = mapY(c.low);

    const wickX = px(x);
    ctx.strokeStyle = wick;
    ctx.lineWidth = hairline();
    ctx.beginPath();
    ctx.moveTo(wickX,px(hy));
    ctx.lineTo(wickX,px(ly));
    ctx.stroke();

    const bt = ix(Math.min(oy,cy));
    const bh = Math.max(1,ix(Math.abs(oy-cy)));
    const bw = Math.max(2,ix(candleW));
    const bx = ix(x - bw/2);

    ctx.fillStyle = body;
    ctx.strokeStyle = border;
    ctx.lineWidth = hairline();
    ctx.fillRect(ix(bx),ix(bt),bw,bh);
    ctx.strokeRect(px(bx),px(bt),bw,bh);
  }

  const im = idxMap(vis);

  if(tglEMA20.checked) drawInd(ema20,vis,im,mapX,mapY,getIndicatorStroke("ema1","#3b82f6"),2);
  if(tglEMA50.checked) drawInd(ema50,vis,im,mapX,mapY,getIndicatorStroke("ema2","#a855f7"),2);
  if(tglEMA3 && tglEMA3.checked) drawInd(ema3,vis,im,mapX,mapY,getIndicatorStroke("ema3","#14b8a6"),2);
  if(tglVWAP.checked) drawInd(vwap,vis,im,mapX,mapY,getIndicatorStroke("vwap","#f59e0b"),2);

  tradeOverlays(vis,mapX,mapY,slot,clip);

  /* PATCH_37F: single current-price dashed line is owned by drawCountdown(). */

  ctx.restore();

  /* PATCH_37C: current price is drawn only in the shared right-axis price/countdown box. */

  for(let i=0;i<vis.length;i++){
    const c = vis[i];
    const x = mapX(i);
    const y = mapV(c.volume);
    const bull = c.close >= c.open;

    ctx.fillStyle = bull
      ? "rgba(95,95,95,.42)"
      : "rgba(122,122,122,.58)";

    ctx.fillRect(ix(x-candleW/2),ix(y),Math.max(2,ix(candleW)),Math.max(1,ix(volTop+volH-y)));
  }

  /* PATCH_35: remove on-chart header text line. */

  ctx.fillStyle = "#707a8a";
  ctx.font = "11px Arial";

  for(let i=0;i<=4;i++){
    const idx = Math.floor((vis.length-1)*i/4);
    const c = vis[idx];
    const x = mapX(idx);
    ctx.fillText(formatTimeOnly(c.time*1000),x-24,h-8);
  }

  if(loadingOlder){
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.fillRect(left+10,top+10,150,28);

    ctx.strokeStyle = "#d9dce1";
    ctx.strokeRect(left+10,top+10,150,28);

    ctx.fillStyle = "#707a8a";
    ctx.font = "12px Arial";
    ctx.fillText("Loading older candles...",left+20,top+29);
  }

  if(mouse){
    ctx.strokeStyle = "rgba(112,122,138,.38)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(mouse.x,top);
    ctx.lineTo(mouse.x,h-bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(left,mouse.y);
    ctx.lineTo(w-right,mouse.y);
    ctx.stroke();

    if(mouse.x >= left && mouse.x <= w-right && mouse.y >= top && mouse.y <= top+priceH){
      const cursorPrice = maxP - ((mouse.y-top)/priceH) * (maxP-minP);
      const txt = ip(cursorPrice);
      const tw = ctx.measureText(txt).width + 10;
      const tx = w-right-tw-4;
      const ty = mouse.y-10;

      ctx.save();

      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.strokeStyle = "#d9dce1";
      ctx.fillRect(tx,ty,tw,18);
      ctx.strokeRect(tx,ty,tw,18);

      ctx.fillStyle = "#111";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt,tx+tw/2,ty+9);

      ctx.restore();
    }

    const idx = Math.floor((mouse.x-left)/slot);
    if(idx >= 0 && idx < vis.length) candleTip(vis[idx]);

    drawHoverTooltip();
  }
}


/* =========================================================
   SECTION 17 — MOUSE INTERACTION
========================================================= */

function pan(delta){
  olderFetchArmed = true;
  olderFetchTargetVisible = 0;
  rightOffset += delta;
  clampView();
  draw();
}

function zoomAt(mx,dy){
  if(candles.length < 2) return;
  olderFetchArmed = true;

  const left = LEFT_PAD;
  const chartW = canvas.clientWidth - left - RIGHT_AXIS;
  const r = range();

  const oldStart = r.start;
  const oldReal = r.end - r.start;
  const oldTotal = Math.max(1, oldReal + r.futureBars);
  const slot = chartW / oldTotal;

  let idxView = Math.floor((mx-left)/slot);
  idxView = clamp(idxView,0,oldTotal-1);

  const anchor = Math.min(idxView,Math.max(0,oldReal-1));
  const global = oldStart + anchor;
  const ratio = idxView / oldTotal;
  const factor = dy < 0 ? .82 : 1.22;
  const rawVisible = Math.round(visibleCount * factor);
  let nc = rawVisible;

  nc = candles.length < MIN_VISIBLE
    ? candles.length
    : clamp(nc,MIN_VISIBLE,Math.max(MIN_VISIBLE,candles.length));

  const newEnd = Math.round(global + (1-ratio)*nc);

  if(dy > 0 && rawVisible > candles.length){
    olderFetchTargetVisible = Math.max(olderFetchTargetVisible || 0, rawVisible);
  }else if(rawVisible <= candles.length){
    olderFetchTargetVisible = 0;
  }

  visibleCount = nc;
  rightOffset = candles.length - newEnd;

  clampView();
  draw();
}

canvas.addEventListener("wheel",e => {
  e.preventDefault();

  if(rightAxis(e.offsetX)){
    scaleY(e.deltaY);
    return;
  }

  if(Math.abs(e.deltaX) > Math.abs(e.deltaY)){
    pan(Math.round(e.deltaX/20));
  }else{
    zoomAt(e.offsetX,e.deltaY);
  }
},{passive:false});

canvas.addEventListener("mousedown",e => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const stored = currentStoredYRange();

  dragX = e.clientX;
  dragY = e.clientY;
  dragRight = rightOffset;
  dragRange = lastRange || 1;
  dragH = lastAreaH || 1;
  dragMin = stored.min;
  dragMax = stored.max;
  dragManualY = manualY && validRange(yMin,yMax);

  if(rightAxis(x)){
    ensureManualY();

    dragAxis = true;
    dragChart = false;
    dragManualY = true;
    dragMin = yMin;
    dragMax = yMax;

    canvas.style.cursor = "ns-resize";
  }else{
    dragChart = true;
    dragAxis = false;
    canvas.style.cursor = "grabbing";
  }
});

window.addEventListener("mouseup",() => {
  dragChart = false;
  dragAxis = false;
  dragManualY = false;
  canvas.style.cursor = "crosshair";
});

canvas.addEventListener("mousemove",e => {
  const r = canvas.getBoundingClientRect();

  mouse = {
    x:e.clientX - r.left,
    y:e.clientY - r.top
  };

  if(!dragChart && !dragAxis){
    canvas.style.cursor = rightAxis(mouse.x) ? "ns-resize" : "crosshair";
  }

  if(dragAxis){
    const dy = e.clientY - dragY;
    const c = (dragMin + dragMax) / 2;
    const rg = Math.max(1e-9, (dragMax-dragMin) * Math.exp(dy * .008));

    yMin = c - rg/2;
    yMax = c + rg/2;
    manualY = true;

    draw();
    return;
  }

  if(dragChart){
    const rr = range();
    const vis = candles.slice(rr.start,rr.end);
    const total = Math.max(1,vis.length + rr.futureBars);

    if(vis.length){
      const chartW = canvas.clientWidth - LEFT_PAD - RIGHT_AXIS;
      const slot = chartW / total;

      const dx = e.clientX - dragX;
      const dy = e.clientY - dragY;

      rightOffset = dragRight + Math.round(dx/slot);
      olderFetchArmed = true;
      olderFetchTargetVisible = 0;

      if(dragManualY && validRange(dragMin,dragMax)){
        const pp = (dragMax-dragMin) / Math.max(1,dragH);

        yMin = dragMin + dy*pp;
        yMax = dragMax + dy*pp;
        manualY = true;
      }

      clampView();
    }
  }

  draw();
});

canvas.addEventListener("mouseleave",() => {
  mouse = null;

  if(!dragChart && !dragAxis){
    canvas.style.cursor = "crosshair";
  }

  draw();
});

canvas.addEventListener("dblclick",e => {
  if(rightAxis(e.offsetX)) resetYAuto();
  else resetView();
});


/* =========================================================
   SECTION 18 — UI EVENTS
========================================================= */

function handleReloadClick(){
  loadChart();
}

function handleMarketChange(){
  clearTrades();
  loadChart();

  setTimeout(() => {
    if(hasKeys()) loadTrades({silent:true});
    else updateApiStatus();
  },2000);
}

function handleIntervalChange(){
  loadChart({preserveView:true});
}

reloadEl.addEventListener("click",handleReloadClick);

resetViewEl.addEventListener("click",resetView);

apiKeysBtn.addEventListener("click",openSettings);

closeSettingsEl.addEventListener("click",closeSettings);

openBinanceSettingsEl.addEventListener("click",openBinanceSettings);

openGptFromSettingsEl.addEventListener("click",() => {
  closeSettings();
  window.dispatchEvent(new CustomEvent("v13:openGptSettings"));
});

closeApiKeys.addEventListener("click",closeApi);

saveApiKeys.addEventListener("click",() => {
  saveKeysLocal();
  closeApi();

  if(hasKeys()){
    loadTrades({silent:false});
  }
});

apiModal.addEventListener("click",e => {
  if(e.target === apiModal) closeApi();
});

settingsModal.addEventListener("click",e => {
  if(e.target === settingsModal) closeSettings();
});

window.addEventListener("keydown",e => {
  if(e.key === "Escape"){
    closeApi();
    closeSettings();
  }
});

marketEl.addEventListener("change",handleMarketChange);

intervalEl.addEventListener("change",handleIntervalChange);

function updateReportControls(){
  if(customRangeEl){
    customRangeEl.classList.toggle("hidden", reportWeeksEl.value !== "custom");
  }
}

function reloadTradesForReport(){
  updateReportControls();
  clearTrades();
  updateApiStatus();

  if(hasKeys()){
    loadTrades({silent:false});
  }

  draw();
}

reportWeeksEl.addEventListener("change", reloadTradesForReport);
[customFromEl,customToEl].forEach(el => {
  if(el) el.addEventListener("change", reloadTradesForReport);
});

loadTradesEl.addEventListener("click",() => loadTrades({silent:false}));

[apiKeyEl,apiSecretEl].forEach(el => {
  el.addEventListener("change",() => {
    saveKeysLocal();
    updateApiStatus();
  });

  el.addEventListener("input",() => {
    saveKeysLocal();
    updateApiStatus();
  });
});

rememberKeysEl.addEventListener("change",() => {
  saveKeysLocal();
  updateApiStatus();
});

[
  tglEMA20,
  tglEMA50,
  tglEMA3,
  tglVWAP,
  tglPositions,
  tglResults,
  tglDollarValues,
  tglLots
].forEach(el => el && el.addEventListener("change",draw));

[emaPeriod1El,emaPeriod2El,emaPeriod3El].forEach(el => {
  if(!el) return;
  el.addEventListener("change",saveEmaSettings);
  el.addEventListener("input",saveEmaSettings);
});

window.addEventListener("resize",resizeCanvas);


/* =========================================================
   SECTION 19 — STARTUP
========================================================= */

restoreEmaSettings();
updateReportControls();
restoreKeys();
updateApiStatus();
startLiveClock();
startTitleUpdater();
resizeCanvas();
loadChart();
startTradeAuto();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_15 — UI stability + overlay placement
     Scope: UI / UI-behavior only.
  ========================================================= */

  const n15 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cid15 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const marker15 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sideDir15 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const sortMarker15 = (a,b) => (n15(a.time)-n15(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const isoOn15 = () => typeof isIsolateActive === 'function' && isIsolateActive();

  function normalizeTimeSec15(t){
    const v = n15(t);
    return v > 1e12 ? Math.floor(v/1000) : v;
  }

  function candleIndexForEvent15(t){
    if(!Array.isArray(candles) || !candles.length) return -1;
    const tv = normalizeTimeSec15(t);
    let lo = 0, hi = candles.length - 1, ans = -1;
    while(lo <= hi){
      const mid = (lo + hi) >> 1;
      if(n15(candles[mid].time) <= tv){ ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if(ans < 0) return -1;
    const next = ans + 1 < candles.length ? n15(candles[ans+1].time) : n15(candles[ans].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    if(next && tv >= next && ans + 1 < candles.length) return ans + 1;
    return ans;
  }

  window.xForCandleIndex = function(index,vis,mapX){
    if(!Array.isArray(vis) || !vis.length || index < 0) return null;
    const firstIndex = candleIndexForEvent15(vis[0].time);
    if(firstIndex < 0) return null;
    return mapX(index - firstIndex);
  };

  window.markerTimeX = function(m,vis,mapX,slot){
    const idx = candleIndexForEvent15(m && m.time);
    const x = window.xForCandleIndex(idx,vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(normalizeTimeSec15(m && m.time),vis,mapX,slot) : null;
  };

  function eventX15(time,vis,mapX){
    const idx = candleIndexForEvent15(time);
    return window.xForCandleIndex(idx,vis,mapX);
  }

  function linkTimeOverlap15(l,vis){
    if(!vis || !vis.length || !l) return false;
    const start = n15(vis[0].time);
    const end = n15(vis[vis.length-1].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    const a = Math.min(n15(l.entryTime), n15(l.exitTime));
    const b = Math.max(n15(l.entryTime), n15(l.exitTime));
    return b >= start && a <= end;
  }

  function parentIdFromMarker15(markerId){
    const m = marker15(markerId);
    if(cid15(m)) return cid15(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid15(l);
  }

  function tradeRecord15(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid15(m) === parentId).slice().sort(sortMarker15);
    const links = (resultLinks || []).filter(l => cid15(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(sortMarker15);
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sortMarker15).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? realizedSum15(eventLinks) : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl);
      const fees = eventLinks.length ? signedFeeSum15(eventLinks) : signedFeeValue15(m.fee);
      const netPnl = pnl + fees;
      return {marker:m,type:m.isFinalExit ? 'EX' : 'P',qty:Math.abs(n15(m.qty)),pnl,fees,netPnl,time:n15(m.time),price:n15(m.price),links:eventLinks};
    });
    const firstEntry = entries[0] || null;
    const finalExit = exits.filter(e => e.type === 'EX').slice(-1)[0] || null;
    const total = links.length ? realizedSum15(links) : exits.reduce((a,e) => a + n15(e.pnl),0);
    const fees = links.length ? signedFeeSum15(links) : exits.reduce((a,e) => a + n15(e.fees),0);
    const totalLots = exits.reduce((a,e) => a + n15(e.qty),0);
    const dir = firstEntry ? sideDir15(firstEntry.side) : (links[0] ? sideDir15(links[0].side) : '');
    const firstTime = markers.length ? Math.min(...markers.map(m => n15(m.time)).filter(Boolean)) : 0;
    const lastExitTime = exits.length ? Math.max(...exits.map(e => n15(e.time)).filter(Boolean)) : 0;
    const fundingInfo = fundingMatchInfo15(firstTime,finalExit ? n15(finalExit.time) : lastExitTime,(markers[0] && markers[0].symbol) || (links[0] && links[0].symbol) || cfg().symbol,parentId);
    const funding = fundingInfo.sum;
    const netTotal = total + fees + funding;
    return {parentId,markers,links,entries,exits,firstEntry,finalExit,total,fees,funding,fundingRows:fundingInfo.count,netTotal,totalLots,dir,firstTime};
  }

  function realizedValue15(l){
    return n15(l && (l.binanceRealizedPnl ?? l.realizedPnl));
  }
  function realizedSum15(rows){
    return (rows || []).reduce((a,l) => a + realizedValue15(l),0);
  }
  function signedFeeValue15(v){
    const n = n15(v);
    return n > 0 ? -n : n;
  }
  function signedFeeSum15(rows){
    return (rows || []).reduce((a,l) => a + signedFeeValue15(l && (l.fees ?? l.fee)),0);
  }
  function netValue15(l){
    return realizedValue15(l) + signedFeeValue15(l && (l.fees ?? l.fee));
  }
  function fundingValue15(row){
    return n15(row && (row.income ?? row.fundingFee ?? row.funding));
  }
  function fundingMatchInfo15(start,end,sym,parentId){
    const s = normalizeTimeSec15(start);
    const e = normalizeTimeSec15(end);
    const out = {sum:0,count:0,start:s,end:e};
    if(!s || !e || e < s) return out;
    const symbol = String(sym || cfg().symbol || '').toUpperCase();
    (fundingIncomeRows || []).forEach(row => {
      const t = normalizeTimeSec15(row && row.time);
      const rowSym = String(row && row.symbol || symbol).toUpperCase();
      if(t >= s && t <= e && (!symbol || rowSym === symbol)){
        out.count++;
        out.sum += fundingValue15(row);
      }
    });
    if(parentId && typeof window !== 'undefined'){
      const root = window.__v13Patch37CFundingStats || {
        fetchedRows:fundingIncomeFetchStats.rows || (fundingIncomeRows || []).length,
        fetchStart:fundingIncomeFetchStats.start || 0,
        fetchEnd:fundingIncomeFetchStats.end || 0,
        symbol:fundingIncomeFetchStats.symbol || symbol,
        matches:{}
      };
      root.matches[String(parentId)] = {count:out.count,sum:out.sum,start:s,end:e,symbol};
      window.__v13Patch37CFundingStats = root;
    }
    return out;
  }
  function fundingSumForWindow15(start,end,sym,parentId){
    return fundingMatchInfo15(start,end,sym,parentId).sum;
  }
  function currentOpenRenderChainIds15(sym){
    const ids = new Set();
    (openLotLinks || []).forEach(l => {
      if(l && (!sym || l.symbol === sym)){
        const id = cid15(l);
        if(id) ids.add(id);
      }
    });
    (openPositionBoxes || []).forEach(b => {
      if(b && (!sym || b.symbol === sym)){
        const id = cid15(b);
        if(id) ids.add(id);
      }
    });
    return ids;
  }
  function activeOpenChainIds15(sym){
    const ids = currentOpenRenderChainIds15(sym);
    if(!sym || sym === cfg().symbol){
      (activeOpenParentChainIds || new Set()).forEach(id => { if(id) ids.add(id); });
    }
    return ids;
  }

  function allParentTrades15(){
    const ids = new Set();
    (fillMarkers || []).forEach(m => { const id = cid15(m); if(id) ids.add(id); });
    (resultLinks || []).forEach(l => { const id = cid15(l); if(id) ids.add(id); });
    return [...ids].map(tradeRecord15).filter(r => r && r.firstEntry && r.finalExit).sort((a,b) => n15(a.firstTime)-n15(b.firstTime));
  }

  function entryContribution15(parentId,entryId){
    return (resultLinks || [])
      .filter(l => cid15(l) === parentId && l.entryMarkerId === entryId)
      .reduce((a,l) => a + netValue15(l),0);
  }

  function exitEvent15(markerId){
    const rec = tradeRecord15(parentIdFromMarker15(markerId));
    if(!rec) return null;
    return rec.exits.find(e => e.marker.id === markerId) || null;
  }

  function fullTradeTooltip15(parentId){
    const rec = tradeRecord15(parentId);
    if(!rec) return [];
    const lines = ['Direction: ' + (rec.dir || '-')];
    if(rec.entries.length){
      lines.push(`Entries (${rec.entries.length}):`);
      rec.entries.forEach(m => lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(entryContribution15(rec.parentId,m.id))}`));
    }
    if(rec.exits.length){
      lines.push(`Exits (${rec.exits.length}):`);
      rec.exits.forEach(e => lines.push(`${e.type} ${fq(e.qty)} | ${fm(e.pnl)}`));
    }
    lines.push('');
    lines.push('Closing PnL | ' + fm(rec.total));
    lines.push('Trading Fee | ' + fm(rec.fees));
    lines.push('Funding Fee | ' + fm(rec.funding));
    lines.push('');
    lines.push('Net P/L | ' + fm(rec.netTotal));
    return lines;
  }

  function markerOwnTooltip15(markerId){
    const m = marker15(markerId);
    if(!m) return [];
    const label = String(m.letter || '');
    if(m.role === 'entry'){
      const title = label === 'EL' ? 'Long entry' : label === 'ES' ? 'Short entry' : label === 'B' ? 'Long add' : label === 'S' ? 'Short add' : 'Entry/add';
      const pid = parentIdFromMarker15(markerId);
      return [title,'Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'P/L contribution: ' + fm(pid ? entryContribution15(pid,markerId) : 0),'Time: ' + ft(m.time)];
    }
    const ev = exitEvent15(markerId);
    if(ev) return [ev.type === 'EX' ? 'Final exit' : 'Partial exit',`${ev.type} ${fq(ev.qty)} | ${fm(ev.pnl)}`,'Trading Fee | ' + fm(ev.fees),'','Net P/L | ' + fm(ev.netPnl),'Time: ' + ft(ev.time)];
    return ['Trade event','Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'Time: ' + ft(m.time)];
  }

  function pnlColor15(v){
    const n = Number(v);
    if(!Number.isFinite(n) || Math.abs(n) < 1e-12) return '#111827';
    return n > 0 ? '#047857' : '#f6465d';
  }

  function colorTooltipValue15(line){
    const s = String(line || '');
    const money = s.match(/([+-]?\$[0-9][0-9,]*(?:\.[0-9]+)?|-?\$[0-9][0-9,]*(?:\.[0-9]+)?)\s*$/);
    if(!money) return null;
    const raw = money[1];
    const n = Number(raw.replace(/[$,]/g,''));
    if(!Number.isFinite(n)) return null;
    const idx = s.lastIndexOf(raw);
    return {prefix:s.slice(0,idx),value:raw,color:pnlColor15(n)};
  }

  function coloredClosedTooltip15(lines,x,y){
    const safe = (lines || []).map(line => String(line == null ? '' : line));
    ctx.save();
    ctx.font = '12px Arial';
    const pad = 12;
    const lh = 17;
    const w = Math.max(...safe.map(s => ctx.measureText(s).width),0) + pad*2;
    const h = safe.length * lh + pad*2;
    let tx = x + 14;
    let ty = y + 14;
    if(tx + w > canvas.clientWidth - RIGHT_AXIS) tx = x - w - 14;
    if(ty + h > canvas.clientHeight - 10) ty = y - h - 14;
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.strokeStyle = '#d9dce1';
    ctx.fillRect(tx,ty,w,h);
    ctx.strokeRect(tx,ty,w,h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    safe.forEach((line,i) => {
      const yLine = ty + pad + i*lh;
      const parsed = colorTooltipValue15(line);
      ctx.font = '12px Arial';
      if(!parsed){
        ctx.fillStyle = '#111827';
        ctx.fillText(line,tx+pad,yLine);
        return;
      }
      ctx.fillStyle = '#111827';
      ctx.fillText(parsed.prefix,tx+pad,yLine);
      ctx.fillStyle = parsed.color;
      ctx.fillText(parsed.value,tx+pad+ctx.measureText(parsed.prefix).width,yLine);
    });
    ctx.restore();
  }

  function pairLinks15(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = marker15(l.entryMarkerId);
      const xm = marker15(l.exitMarkerId);
      if(!em || !xm) continue;
      const key = [cid15(l)||cid15(em)||cid15(xm), l.entryMarkerId, l.exitMarkerId].join('|');
      if(!groups.has(key)) groups.set(key,{...l,qty:0,netPnl:0,grossPnl:0,realizedPnl:0,binanceRealizedPnl:0,fees:0});
      const g = groups.get(key);
      g.qty += n15(l.qty);
      g.grossPnl += n15(l.grossPnl);
      g.realizedPnl += realizedValue15(l);
      g.binanceRealizedPnl += realizedValue15(l);
      g.netPnl += netValue15(l);
      g.fees += signedFeeValue15(l.fees);
    }
    return [...groups.values()];
  }

  function segmentFromMarkers15(entryMarker,exitMarker,vis,mapX,mapY,slot){
    if(!entryMarker || !exitMarker) return null;
    const x1 = markerTimeX(entryMarker,vis,mapX,slot);
    const x2 = markerTimeX(exitMarker,vis,mapX,slot);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(n15(entryMarker.price)),x2,y2:mapY(n15(exitMarker.price))};
  }

  function segmentFromLink15(l,vis,mapX,mapY,slot){
    if(!linkTimeOverlap15(l,vis)) return null;
    return segmentFromMarkers15(marker15(l.entryMarkerId),marker15(l.exitMarkerId),vis,mapX,mapY,slot);
  }

  function visibleByIsoMarker15(id){ return !isoOn15() || isMarkerVisibleInIsolate(id); }
  function visibleByIsoLink15(l){ return !isoOn15() || isClosedLinkVisibleInIsolate(l); }
  function visibleByIsoRecord15(rec){
    if(!isoOn15()) return true;
    return rec.markers.some(m => visibleByIsoMarker15(m.id)) || rec.links.some(l => visibleByIsoLink15(l));
  }

  function reserveLabel15(txt,x,y,col,clip,placed,opt={}){
    ctx.save();
    ctx.font = opt.font || '11px Arial';
    const pad = opt.pad == null ? 4 : opt.pad;
    const w = ctx.measureText(txt).width + pad*2;
    const h = opt.h || 16;
    const fixedX = !!opt.fixedX;
    const fillBg = opt.fillBg !== false;
    const edge = opt.edge || null;
    const baseX = x + (Number(opt.xShift) || 0);
    const baseY = edge === 'top' ? (clip.top + (Number(opt.edgeMargin) || 26)) : edge === 'bottom' ? (clip.top + clip.height - (Number(opt.edgeMargin) || 26)) : y;
    const offsets = opt.offsets || (edge === 'top' ? [0,24,48,72,96,120] : edge === 'bottom' ? [0,-24,-48,-72,-96,-120] : [-12,12,-28,28,-44,44,-60,60,-76,76]);
    let chosen = null;
    for(const off of offsets){
      const cx = fixedX ? baseX : clamp(baseX, clip.left+w/2+2, clip.left+clip.width-w/2-2);
      const cy = clamp(baseY + off, clip.top+h/2+2, clip.top+clip.height-h/2-2);
      const r = {x1:cx-w/2-2,y1:cy-h/2-2,x2:cx+w/2+2,y2:cy+h/2+2,cx,cy};
      const hit = placed.some(p => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
      if(!hit){ chosen = r; break; }
      if(!chosen) chosen = r;
    }
    placed.push(chosen);
    if(fillBg){
      ctx.fillStyle = opt.bg || 'rgba(255,255,255,.94)';
      ctx.strokeStyle = col;
      ctx.lineWidth = hairline();
      ctx.fillRect(ix(chosen.cx-w/2),ix(chosen.cy-h/2),w,h);
      ctx.strokeRect(px(chosen.cx-w/2),px(chosen.cy-h/2),w,h);
    }
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt,chosen.cx,chosen.cy+.5);
    if(opt.hit && Array.isArray(overlayHitItems)){
      overlayHitItems.push({kind:'plbox',x1:chosen.cx-w/2,y1:chosen.cy-h/2,x2:chosen.cx+w/2,y2:chosen.cy+h/2,x:chosen.cx,y:chosen.cy,markerId:opt.hit.markerId,chainId:opt.hit.chainId,parentTradeId:opt.hit.parentTradeId});
    }
    ctx.restore();
  }

  function drawMarker15(m,vis,mapX,mapY,slot,force=false){
    if(!m || (!force && !inTime(m.time,vis))) return;
    const x = markerTimeX(m,vis,mapX,slot);
    if(x === null || x < -50 || x > canvas.clientWidth + 50) return;
    const markerRadius15 = m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7);
    const viewLeft15 = typeof LEFT_PAD !== 'undefined' ? LEFT_PAD : 0;
    const viewRight15 = canvas.clientWidth - (typeof RIGHT_AXIS !== 'undefined' ? RIGHT_AXIS : 0);
    const visibleW15 = Math.max(0, Math.min(x + markerRadius15, viewRight15) - Math.max(x - markerRadius15, viewLeft15));
    if(visibleW15 < markerRadius15 * 2 * 0.70) return;
    const y = mapY(n15(m.price));
    if(m.role === 'close') m.letter = m.isFinalExit ? 'EX' : 'P';
    let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
    if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
    circle(ix(x),ix(y),m.letter,col,m.unresolved);
    overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cid15(m),parentTradeId:cid15(m),note:m.note || ''});
  }

  function drawSimplifiedTrades15(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    const activeOpenChains = activeOpenChainIds15(cfg().symbol);
    for(const rec of allParentTrades15()){
      if(!visibleByIsoRecord15(rec)) continue;
      if(activeOpenChains.has(rec.parentId)) continue;
      const first = rec.firstEntry;
      const ex = rec.finalExit && rec.finalExit.marker;
      if(!first || !ex) continue;
      const synthetic = {entryTime:first.time, exitTime:ex.time};
      if(!linkTimeOverlap15(synthetic,vis)) continue;
      const s = segmentFromMarkers15(first,ex,vis,mapX,mapY,slot);
      if(!s) continue;
      const col = rec.netTotal >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .9 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:'simple_'+rec.parentId,qty:rec.totalLots,side:rec.dir,open:false,chainId:rec.parentId,parentTradeId:rec.parentId});
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      reserveLabel15((typeof fmPnlBox==='function'?fmPnlBox(rec.netTotal):fm(rec.netTotal).replace(/[+-]/,'')),mx,my - 18,col,clip,placedLabels,{fixedX:true,font:'bold 12px Arial',pad:6,h:20,offsets:[0,-18,-36,18,36,-54,54],hit:{markerId:ex.id,chainId:rec.parentId,parentTradeId:rec.parentId}});
      if(showLots) reserveLabel15(fq(rec.totalLots),mx,my + 18,col,clip,placedLabels,{fixedX:true,offsets:[0,16,32,-16,-32,48,-48]});
      if(inTime(first.time,vis)) drawMarker15(first,vis,mapX,mapY,slot);
      if(inTime(ex.time,vis)) drawMarker15(ex,vis,mapX,mapY,slot);
    }
  }

  function drawFullTrades15(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    const activeOpenChains = activeOpenChainIds15(cfg().symbol);
    for(const l of pairLinks15()){
      if(l.symbol !== cfg().symbol) continue;
      if(activeOpenChains.has(cid15(l))) continue;
      if(!visibleByIsoLink15(l)) continue;
      const s = segmentFromLink15(l,vis,mapX,mapY,slot);
      if(!s) continue;
      const col = netValue15(l) >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .86 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cid15(l),parentTradeId:cid15(l)});
      if(showLots) reserveLabel15(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLabels);
    }
    for(const m of fillMarkers || []){
      if(m.symbol !== cfg().symbol || !visibleByIsoMarker15(m.id)) continue;
      if(activeOpenChains.has(cid15(m))) continue;
      drawMarker15(m,vis,mapX,mapY,slot);
      if(m.role === 'close' && !m.unresolved && inTime(m.time,vis)){
        const ev = exitEvent15(m.id);
        const x = markerTimeX(m,vis,mapX,slot);
        if(x !== null){
          const y = mapY(n15(m.price));
          const recForExVal15 = (ev && ev.type === 'EX') ? tradeRecord15(parentIdFromMarker15(m.id)) : null;
          const val = recForExVal15 ? recForExVal15.netTotal : (ev ? ev.pnl : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl));
          const isExLabel15 = !!(m.isFinalExit || m.letter === 'EX');
          const labelColor15 = val >= 0 ? '#1e88e5' : '#f6465d';
          const labelOpt15 = isExLabel15
            ? {fixedX:false,edge:(val >= 0 ? 'top' : 'bottom'),edgeMargin:(val >= 0 ? 46 : 28),xShift:8,font:'bold 13px Arial',pad:7,h:22,bg:(val >= 0 ? '#eaf3ff' : '#ffe8ec'),offsets:(val >= 0 ? [0,10,20,30,40,50,60,70,80] : [0,-10,-20,-30,-40,-50,-60,-70,-80]),hit:{markerId:m.id,chainId:cid15(m),parentTradeId:cid15(m)}}
            : {fixedX:true,offsets:[-24,24,-40,40,-56,56,-72,72]};
          reserveLabel15((typeof fmPnlBox==='function'?fmPnlBox(val):fm(val).replace(/[+-]/,'')),x,y,labelColor15,clip,placedLabels,labelOpt15);
        }
      }
    }
  }

  function drawOpenOverlay15(vis,mapX,mapY,slot,clip,placedLabels){
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    if(!latest) return;
    const openChains = currentOpenRenderChainIds15(sym);

    // Open round position icons: always visible regardless of closed-trade toggles.
    for(const m of fillMarkers || []){
      if(m.symbol !== sym || !openEntryMarkerIds || !openEntryMarkerIds.has(m.id)) continue;
      if(!inTime(m.time,vis)) continue;
      drawMarker15(m,vis,mapX,mapY,slot,true);
    }

    // Active-parent partial exits are live open-position visuals, independent of Trades / Positions.
    for(const m of fillMarkers || []){
      if(m.symbol !== sym || m.role !== 'close' || m.unresolved || !openChains.has(cid15(m))) continue;
      if(!inTime(m.time,vis)) continue;
      m.letter = 'P';
      m.isFinalExit = false;
      drawMarker15(m,vis,mapX,mapY,slot,true);
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(n15(m.price));
      const links = (resultLinks || []).filter(l => l.exitMarkerId === m.id);
      const val = links.length ? realizedSum15(links) : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl);
      const col = val >= 0 ? '#1e88e5' : '#f6465d';
      reserveLabel15((typeof fmPnlBox === 'function' ? fmPnlBox(val) : fm(val).replace(/[+-]/,'')),x,y - 18,col,clip,placedLabels,{fixedX:true,offsets:[-24,24,-40,40,-56,56,-72,72]});
    }

    // Open lot connectors and lot labels: independent of Trades / Positions / Lots.
    for(const l of openLotLinks || []){
      if(l.symbol !== sym) continue;
      const em = marker15(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : eventX15(l.entryTime,vis,mapX);
      const x2 = eventX15(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const y1 = mapY(n15(l.entryPrice));
      const y2 = mapY(n15(latest.close));
      const floating = sideDir15(l.side) === 'LONG' ? (n15(latest.close) - n15(l.entryPrice)) * n15(l.qty) : (n15(l.entryPrice) - n15(latest.close)) * n15(l.qty);
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(x1),px(y1));
      ctx.lineTo(px(x2),px(y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // PATCH_16: open-position connector keeps the line only; no floating lot-size tag on the chart.
      overlayHitItems.push({kind:'line',x1,y1,x2,y2,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:cid15(l),parentTradeId:cid15(l)});
    }

    for(const b of openPositionBoxes || []){
      if(b.symbol !== sym) continue;
      const y = mapY(n15(b.price));
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = eventX15(latest.time,vis,mapX);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.stale ? 'rgba(245,158,11,.14)' : (b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)');
      const lineCol = b.stale ? 'rgba(245,158,11,.72)' : 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,n15(latest.close));
      const distance = b.letter === 'B' ? n15(latest.close) - n15(b.price) : n15(b.price) - n15(latest.close);
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.stale ? 'STALE' : (b.side === 'SHORT' ? 'SHORT' : 'LONG');
      const topText = (b.stale ? 'STALE | ' : '') + fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      // PATCH_15: another 2 candle widths right from PATCH_14 placement.
      let boxX = clamp(liveX + slot*10, clip.left+26, clip.left+clip.width-92);
      const candleClearX = liveX + Math.max(slot*5.75,18);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      ctx.font = 'bold 10px Arial';
      const markerW = Math.max(38, Math.ceil(ctx.measureText(boxText).width + 10));
      const leftEdge = boxX - markerW/2;
      const rightEdge = boxX + markerW/2;
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftEdge){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftEdge),px(y)); }
      if(rightEdge < lineRight){ ctx.moveTo(px(rightEdge),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = b.stale ? '#b45309' : (floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111');
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:18,qty:b.qty,price:b.price,boxData:b,chainId:cid15(b),parentTradeId:cid15(b)});
    }
  }

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const tradesOn = !!(tglResults && tglResults.checked);
    const positionsOn = tradesOn && !!(tglPositions && tglPositions.checked);
    const lotsOn = tradesOn && !!(tglLots && tglLots.checked);
    const placedLabels = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();
    if(tradesOn){
      if(positionsOn) drawFullTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
      else drawSimplifiedTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
    }
    drawOpenOverlay15(vis,mapX,mapY,slot,clip,placedLabels);
    ctx.restore();
  };

  function lineDist15(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let best = null, bd = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x,mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bd){ bd = d; best = it; }
    }
    if(best) return best;
    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }
    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      if(lineDist15(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'marker'){
      const m = marker15(it.markerId);
      if(m && m.role === 'close' && m.isFinalExit){
        const lines = fullTradeTooltip15(parentIdFromMarker15(it.markerId));
        if(lines.length){ coloredClosedTooltip15(lines,mouse.x,mouse.y); return; }
      }
      if(m && m.role === 'close') coloredClosedTooltip15(markerOwnTooltip15(it.markerId),mouse.x,mouse.y);
      else tooltip(markerOwnTooltip15(it.markerId),mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'line'){
      tooltip(it.open ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side] : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.boxData && it.boxData.stale ? 'Open position status stale' : (it.letter === 'B' ? 'Current open long' : 'Current open short'),'Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const sym = cfg().symbol;
      const current = candles.length ? candles[candles.length-1].close : null;
      const openBreakdown = (openLotLinks || []).filter(l => l.symbol === sym).slice().sort((a,b)=>n15(a.entryTime)-n15(b.entryTime));
      if(openBreakdown.length){
        lines.push('Open lots:');
        openBreakdown.forEach(l => {
          const m = marker15(l.entryMarkerId);
          let lotFloating = null;
          if(current != null){
            lotFloating = sideDir15(l.side) === 'SHORT' ? (n15(l.entryPrice) - n15(current)) * n15(l.qty) : (n15(current) - n15(l.entryPrice)) * n15(l.qty);
          }
          lines.push(`${m ? m.letter : 'E'} ${fq(l.qty)} | ${p2(l.entryPrice)} | ${lotFloating == null ? '-' : fm(lotFloating)}`);
        });
      }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  // Stable Y range: overlay toggles must not resize/pan the chart. Closed overlays no longer affect auto scale.
  autoYRange = function(vis){
    return candleOnlyYRange(vis);
  };

  function centerLastAndResetY15(){
    manualY = false;
    yMin = null;
    yMax = null;
    if(candles && candles.length){
      const maxFut = Math.max(0, Math.floor(visibleCount * MAX_FUTURE_RATIO));
      rightOffset = -Math.min(maxFut, Math.floor(visibleCount/2));
      clampView();
    }
    draw();
  }

  // PATCH_15: End key = double-click chart reset behavior.
  window.addEventListener('keydown',e => {
    if(e.key !== 'End') return;
    const tag = (document.activeElement && document.activeElement.tagName || '').toUpperCase();
    if(tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    centerLastAndResetY15();
  },true);

  // Also enforce the same behavior on chart double-click, after older handlers.
  try{
    canvas.addEventListener('dblclick',e => {
      if(typeof rightAxis === 'function' && rightAxis(e.offsetX)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      centerLastAndResetY15();
    },true);
  }catch(e){}

  // Preserve viewport around toggle redraws; the toggle only changes overlays.
  function restoreViewAfterToggle15(){
    const keep = {rightOffset,visibleCount,manualY,yMin,yMax};
    requestAnimationFrame(() => {
      rightOffset = keep.rightOffset;
      visibleCount = keep.visibleCount;
      manualY = keep.manualY;
      yMin = keep.yMin;
      yMax = keep.yMax;
      draw();
    });
  }
  [tglResults,tglPositions,tglLots].forEach(el => {
    if(!el || el.__p15NoShift) return;
    el.__p15NoShift = true;
    el.addEventListener('change',restoreViewAfterToggle15,false);
  });

  try{ draw(); }catch(e){ console.error('PATCH_15 draw failed',e); }
})();

(() => {
  "use strict";
  const POS_KEY = "btc_futures_chart_v13_23_settings_window_pos";

  function clamp23(v,min,max){ return Math.max(min,Math.min(max,v)); }

  function settingsParts23(){
    const backdrop = document.getElementById("settingsModal");
    const modal = backdrop && backdrop.querySelector(".modal");
    const header = modal && modal.querySelector("h3");
    return {backdrop,modal,header};
  }

  function applyStoredPosition23(){
    const {modal} = settingsParts23();
    if(!modal) return;
    modal.classList.add("v23-settings-floating");
    let pos = null;
    try{ pos = JSON.parse(localStorage.getItem(POS_KEY) || "null"); }catch(e){}
    if(pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)){
      const rect = modal.getBoundingClientRect();
      const w = rect.width || 560;
      const h = rect.height || Math.min(window.innerHeight - 28, 520);
      const left = clamp23(pos.left, 8, Math.max(8, window.innerWidth - w - 8));
      const top = clamp23(pos.top, 8, Math.max(8, window.innerHeight - Math.min(h, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      modal.style.transform = "none";
    }
  }

  function installSettingsDrag23(){
    const {modal,header} = settingsParts23();
    if(!modal || !header || modal.dataset.v23Drag === "1") return;
    modal.dataset.v23Drag = "1";
    modal.classList.add("v23-settings-floating");

    let dragging = false;
    let grabX = 0;
    let grabY = 0;

    header.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      const rect = modal.getBoundingClientRect();
      modal.style.left = rect.left + "px";
      modal.style.top = rect.top + "px";
      modal.style.transform = "none";
      grabX = e.clientX - rect.left;
      grabY = e.clientY - rect.top;
      dragging = true;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    header.addEventListener("pointermove", e => {
      if(!dragging) return;
      const rect = modal.getBoundingClientRect();
      const left = clamp23(e.clientX - grabX, 8, Math.max(8, window.innerWidth - rect.width - 8));
      const top = clamp23(e.clientY - grabY, 8, Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      localStorage.setItem(POS_KEY, JSON.stringify({left,top}));
      e.preventDefault();
      e.stopPropagation();
    });

    const stop = e => {
      if(!dragging) return;
      dragging = false;
      try{ header.releasePointerCapture(e.pointerId); }catch(_e){}
      e.preventDefault();
      e.stopPropagation();
    };
    header.addEventListener("pointerup", stop);
    header.addEventListener("pointercancel", stop);
  }

  if(typeof openSettings === "function" && !window.__v13Patch23OpenSettingsWrapped){
    window.__v13Patch23OpenSettingsWrapped = true;
    const prevOpenSettings23 = openSettings;
    openSettings = function(){
      const r = prevOpenSettings23.apply(this,arguments);
      applyStoredPosition23();
      installSettingsDrag23();
      return r;
    };
  }

  installSettingsDrag23();
  window.addEventListener("resize", applyStoredPosition23);
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_27_FINAL_UI
     Scope: final UI toggle only.
     - Adds independent Settings > Sessions toggle for vertical day separators.
     - Day separator visibility is independent from sessions overlay visibility.
     - No strategy/data/fetch/scoring/GPT/accounting changes.
  ========================================================= */

  const DAY_SEP_KEY27 = "btc_futures_chart_v13_27_day_separator_enabled";

  function daySeparatorEnabled27(){
    return localStorage.getItem(DAY_SEP_KEY27) !== "0";
  }

  function installDaySeparatorSetting27(){
    const card = document.getElementById("v22SessionsCard");
    if(!card || document.getElementById("v27DaySeparatorRow")) return;

    const row = document.createElement("div");
    row.className = "v22-session-row";
    row.id = "v27DaySeparatorRow";
    row.innerHTML = `
      <span>Day separator</span>
      <label><input id="v27DaySeparatorEnabled" type="checkbox" ${daySeparatorEnabled27() ? "checked" : ""}> Show vertical separator</label>
      <span></span>`;

    const labelsRow = document.getElementById("v22SessionsLabels");
    const labelsContainer = labelsRow && labelsRow.closest(".v22-session-row");
    if(labelsContainer && labelsContainer.parentNode === card) labelsContainer.insertAdjacentElement("afterend", row);
    else card.appendChild(row);

    const input = document.getElementById("v27DaySeparatorEnabled");
    if(input){
      input.addEventListener("change", () => {
        localStorage.setItem(DAY_SEP_KEY27, input.checked ? "1" : "0");
        try{ if(typeof draw === "function") draw(); }catch(e){}
      });
    }
  }

  if(typeof openSettings === "function" && !window.__v13Patch27OpenSettingsWrapped){
    window.__v13Patch27OpenSettingsWrapped = true;
    const prevOpen27 = openSettings;
    openSettings = function(){
      const r = prevOpen27.apply(this,arguments);
      setTimeout(installDaySeparatorSetting27,0);
      return r;
    };
  }

  installDaySeparatorSetting27();
  setTimeout(installDaySeparatorSetting27,250);
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_34_CLEAN_CONSOLIDATED_BASE_R2_ISOLATE_AND_CLOSED_LINKS_FIX";

  /*
    R2 rules:
    - Position markers/icons must not trigger isolate mode.
    - Isolate mode is triggered only by P/L boxes (kind: plbox).
    - Closed trade link sliders must remain interactive; old v33 row passed normalizers
      that read localStorage instead of the current slider value, causing the thumb to snap back.
  */

  function setIsoClickMode(){
    window.__v34r1IsolateClickMode = true;
    window.__v34r2IsolateClickMode = true;
    setTimeout(() => {
      window.__v34r1IsolateClickMode = false;
      window.__v34r2IsolateClickMode = false;
    }, 0);
  }

  // Run before canvas target listeners, including older capture listeners bound directly on canvas.
  if(!window.__v34r2DocumentIsoGateBound){
    window.__v34r2DocumentIsoGateBound = true;
    document.addEventListener("click", setIsoClickMode, true);
    window.addEventListener("click", setIsoClickMode, true);
  }

  function patch36Cid(o){
    return o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  }

  function patch36ClosedTradePlBox(it){
    try{
      if(!it || it.kind !== "plbox" || !it.markerId) return false;
      if(typeof tglResults !== "undefined" && tglResults && !tglResults.checked) return false;
      const m = Array.isArray(fillMarkers) ? fillMarkers.find(x => x && x.id === it.markerId) : null;
      if(!m || m.role !== "close" || m.unresolved) return false;
      const id = patch36Cid(m) || patch36Cid(it);
      if(!id) return true;
      const openChain = Array.isArray(openLotLinks) && openLotLinks.some(l => patch36Cid(l) === id);
      return !openChain;
    }catch(_e){
      return false;
    }
  }

  window.__v13Patch36IsClosedTradePlBox = patch36ClosedTradePlBox;

  function plHitFromMouse(){
    try{
      if(typeof mouse === "undefined" || !mouse || !Array.isArray(overlayHitItems)) return null;
      for(let i = overlayHitItems.length - 1; i >= 0; i--){
        const it = overlayHitItems[i];
        if(!it || it.kind !== "plbox") continue;
        if(!patch36ClosedTradePlBox(it)) continue;
        if(mouse.x >= it.x1 - 4 && mouse.x <= it.x2 + 4 && mouse.y >= it.y1 - 4 && mouse.y <= it.y2 + 4) return it;
      }
    }catch(_e){}
    return null;
  }

  // Final hover gate for isolate-click context. Older isolate click handlers call hoverItem().
  // During click mode, P/L boxes are mapped to their chain marker; actual marker hits are suppressed.
  if(typeof hoverItem === "function" && !window.__v34r2PlOnlyHoverWrapped){
    window.__v34r2PlOnlyHoverWrapped = true;
    const prevHover = hoverItem;
    hoverItem = window.hoverItem = function(){
      if(window.__v34r1IsolateClickMode || window.__v34r2IsolateClickMode){
        const p = plHitFromMouse();
        if(p && (p.markerId || p.chainId || p.parentTradeId)){
          return {
            kind: "marker",
            markerId: p.markerId,
            x: p.x,
            y: p.y,
            letter: "EX",
            chainId: p.chainId,
            parentTradeId: p.parentTradeId
          };
        }
        const h = prevHover.apply(this, arguments);
        // PATCH_36: isolate click-mode suppresses broad overlay hits; only closed-trade P/L boxes map through.
        if(h && (h.kind === "marker" || h.kind === "box" || (h.kind === "line" && h.open) || h.kind === "maStackLabMarker")) return null;
        return h;
      }
      return prevHover.apply(this, arguments);
    };
  }

  // Extra target-level safety: if a click is on a position marker/icon, block older marker-isolate handlers.
  // Do not block P/L box clicks.
  if(typeof canvas !== "undefined" && canvas && !canvas.__v34r2MarkerIsoBlocker){
    canvas.__v34r2MarkerIsoBlocker = true;
    canvas.addEventListener("click", function(e){
      try{
        const p = plHitFromMouse();
        if(p) return;
        const h = typeof hoverItem === "function" ? hoverItem() : null;
        if(h && (h.kind === "marker" || h.kind === "box" || (h.kind === "line" && h.open) || h.kind === "maStackLabMarker")){
          e.stopImmediatePropagation();
        }
      }catch(_e){}
    }, true);
  }

  const WIDTH_KEY = "btc_futures_chart_v13_05_closed_width";
  const ALPHA_KEY = "btc_futures_chart_v13_19_closed_alpha";

  function clampNum(v, min, max, fallback){
    const n = Number(v);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function syncClosedSlider(el){
    if(!el || !el.id) return;
    if(el.id === "v33ClosedWidth" || el.id === "patch19ClosedWidth" || el.id === "patch5ClosedWidth"){
      const v = clampNum(el.value, 1, 10, 1);
      localStorage.setItem(WIDTH_KEY, String(v));
      ["v33ClosedWidth","patch19ClosedWidth","patch5ClosedWidth"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedWidthVal","patch19ClosedWidthVal","patch5ClosedWidthVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
      return;
    }
    if(el.id === "v33ClosedAlpha" || el.id === "patch19ClosedAlpha"){
      const v = clampNum(el.value, 0, 100, 100);
      localStorage.setItem(ALPHA_KEY, String(v));
      ["v33ClosedAlpha","patch19ClosedAlpha"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedAlphaVal","patch19ClosedAlphaVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
    }
  }

  // Capture phase runs before older buggy bubble listeners so they consume the fresh slider value.
  if(!window.__v34r2ClosedSliderCaptureBound){
    window.__v34r2ClosedSliderCaptureBound = true;
    document.addEventListener("input", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
    document.addEventListener("change", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
  }

  window.V13_PATCH_34_R2 = {version: MODULE};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_34_CLEAN_CONSOLIDATED_BASE_R3_REBUILD";

  function canvasXY(e){
    if(typeof canvas === "undefined" || !canvas) return null;
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  }
  function isPlBoxAtXY(x,y){
    try{
      for(let i=(overlayHitItems||[]).length-1;i>=0;i--){
        const it=overlayHitItems[i];
        if(!it || it.kind!=="plbox") continue;
        if(typeof window.__v13Patch36IsClosedTradePlBox === "function" && !window.__v13Patch36IsClosedTradePlBox(it)) continue;
        if(x>=it.x1-4 && x<=it.x2+4 && y>=it.y1-4 && y<=it.y2+4) return true;
      }
    }catch(_e){}
    return false;
  }
  function isMarkerAtXY(x,y){
    try{
      for(const it of overlayHitItems||[]){
        if(!it || it.kind!=="marker") continue;
        const rad=Math.max(6,Number(it.radius)||8);
        if(Math.hypot(x-it.x,y-it.y)<=rad+3) return true;
      }
    }catch(_e){}
    return false;
  }

  // Final safety: position/trade marker icons have zero isolate-trigger relationship.
  // PATCH_36: closed-trade P/L boxes are the only allowed isolate click target.
  if(typeof canvas !== "undefined" && canvas && !canvas.__v34r3MarkerBlocker){
    canvas.__v34r3MarkerBlocker = true;
    canvas.addEventListener("click", e => {
      const p=canvasXY(e); if(!p) return;
      if(isPlBoxAtXY(p.x,p.y)) return;
      if(isMarkerAtXY(p.x,p.y)){
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  }

  // Trades OFF clears any active/selected isolate state, not only visual isolate.
  if(typeof tglResults !== "undefined" && tglResults && !tglResults.__v34r3ClearIsoBound){
    tglResults.__v34r3ClearIsoBound = true;
    tglResults.addEventListener("change", () => {
      if(tglResults.checked) return;
      try{ if(typeof window.__v34ClearIsolateState === "function") window.__v34ClearIsolateState(); }catch(_e){}
      try{ window.__v34r1IsolateClickMode=false; window.__v34r2IsolateClickMode=false; }catch(_e){}
      try{ if(typeof draw === "function") draw(); }catch(_e){}
    }, true);
  }

  window.V13_PATCH_34_R3_REBUILD = {version:MODULE};
})();

/* =========================================================
   V13_01 — STRATEGY LAB FOUNDATION SCRIPT
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     V13_01 — STORAGE KEYS
  ======================================================= */

  const V13_STORE = "btc_futures_chart_v13_04_";

  const V13_KEYS = {
    gptKey: V13_STORE + "gpt_key",
    gptModel: V13_STORE + "gpt_model",
    rememberGpt: V13_STORE + "remember_gpt",
    strategyName: V13_STORE + "strategy_name",
    strategyText: V13_STORE + "strategy_text"
  };


  /* =======================================================
     V13_01 — DOM HELPERS
  ======================================================= */

  const q = id => document.getElementById(id);

  let v13GptBtn;
  let v13LabBtn;

  const v13GptModal = q("v13GptModal");
  const v13GptKey = q("v13GptKey");
  const v13GptModel = q("v13GptModel");
  const v13RememberGpt = q("v13RememberGpt");
  const v13CloseGpt = q("v13CloseGpt");
  const v13SaveGpt = q("v13SaveGpt");

  const v13LabPanel = q("v13LabPanel");
  const v13CloseLab = q("v13CloseLab");
  const v13StrategyName = q("v13StrategyName");
  const v13StrategyText = q("v13StrategyText");
  const v13SaveStrategy = q("v13SaveStrategy");
  const v13CheckReq = q("v13CheckReq");
  const v13AnalyzeCurrent = q("v13AnalyzeCurrent");
  const v13ClearResult = q("v13ClearResult");
  const v13ReqPreview = q("v13ReqPreview");
  const v13GptResult = q("v13GptResult");
  const v13ContextBox = q("v13ContextBox");


  /* =======================================================
     V13_01 — TOPBAR BUTTON INJECTION
  ======================================================= */

  function v13InstallTopButtons(){
    const topbar = document.querySelector(".topbar");
    const apiBtn = document.getElementById("apiKeysBtn");

    if(!topbar || !apiBtn) return;

    v13LabBtn = document.createElement("button");
    v13LabBtn.id = "v13LabBtn";
    v13LabBtn.className = "v13-btn";
    v13LabBtn.textContent = "Strategy Lab";
    v13LabBtn.title = "Open Strategy Lab";

    apiBtn.insertAdjacentElement("afterend", v13LabBtn);

    v13LabBtn.addEventListener("click", v13OpenLab);
  }


  /* =======================================================
     V13_01 — GPT KEY STORAGE
  ======================================================= */

  function v13HasGptKey(){
    return !!v13GptKey.value.trim();
  }

  function v13UpdateGptStatus(){
    if(v13GptBtn) v13GptBtn.style.color = v13HasGptKey() ? "#111" : "#f6465d";
    if(typeof window.v13UpdateSettingsStatus === "function") window.v13UpdateSettingsStatus();
  }

  function v13RestoreGpt(){
    const remember = localStorage.getItem(V13_KEYS.rememberGpt);

    if(remember === "0"){
      v13RememberGpt.checked = false;
      v13UpdateGptStatus();
      return;
    }

    v13RememberGpt.checked = true;
    v13GptKey.value = localStorage.getItem(V13_KEYS.gptKey) || "";
    v13GptModel.value = localStorage.getItem(V13_KEYS.gptModel) || "gpt-4o-mini";

    v13UpdateGptStatus();
  }

  function v13SaveGptLocal(){
    if(!v13RememberGpt.checked){
      localStorage.removeItem(V13_KEYS.gptKey);
      localStorage.setItem(V13_KEYS.rememberGpt,"0");
      localStorage.setItem(V13_KEYS.gptModel, v13GptModel.value.trim() || "gpt-4o-mini");
      v13UpdateGptStatus();
      return;
    }

    localStorage.setItem(V13_KEYS.rememberGpt,"1");
    localStorage.setItem(V13_KEYS.gptKey, v13GptKey.value.trim());
    localStorage.setItem(V13_KEYS.gptModel, v13GptModel.value.trim() || "gpt-4o-mini");

    v13UpdateGptStatus();
  }

  function v13OpenGptModal(){
    v13GptModal.classList.remove("hidden");
    v13GptKey.focus();
    v13UpdateGptStatus();
  }

  function v13CloseGptModal(){
    v13GptModal.classList.add("hidden");
    v13UpdateGptStatus();
  }


  /* =======================================================
     V13_01 — STRATEGY STORAGE
  ======================================================= */

  function v13RestoreStrategy(){
    v13StrategyName.value = localStorage.getItem(V13_KEYS.strategyName) || "Strategy V1";
    v13StrategyText.value = localStorage.getItem(V13_KEYS.strategyText) || "";
  }

  function v13SaveStrategyLocal(){
    localStorage.setItem(V13_KEYS.strategyName, v13StrategyName.value.trim() || "Strategy V1");
    localStorage.setItem(V13_KEYS.strategyText, v13StrategyText.value.trim());

    v13ReqPreview.textContent =
      "Strategy saved locally.\n\n" +
      "Name: " + (v13StrategyName.value.trim() || "Strategy V1");
  }


  /* =======================================================
     V13_01 — LAB PANEL
  ======================================================= */

  function v13OpenLab(){
    v13LabPanel.classList.remove("hidden");
    v13UpdateContextBox();
  }

  function v13CloseLabPanel(){
    v13LabPanel.classList.add("hidden");
  }

  function v13UpdateContextBox(){
    const sym = typeof cfg === "function" ? cfg().symbol : "-";
    const tf = typeof iv === "function" ? iv() : "-";
    const price =
      typeof candles !== "undefined" && candles.length
        ? candles[candles.length-1].close
        : null;

    v13ContextBox.textContent =
      "Symbol: " + sym + "\n" +
      "Chart TF: " + tf + "\n" +
      "Current price: " + (price == null ? "-" : Math.round(price).toLocaleString("en-US")) + "\n" +
      "Candles loaded: " + (typeof candles !== "undefined" ? candles.length : 0);
  }


  /* =======================================================
     V13_04 — HANDOV1 REQUIREMENTS / DATA PREVIEW
  ======================================================= */

  const V13_HANDOV_REQUIRED_TFS = [
    {tf:"1w", count:100, role:"macro_s_r"},
    {tf:"1d", count:150, role:"macro_trend_zones"},
    {tf:"4h", count:150, role:"primary_bias"},
    {tf:"1h", count:200, role:"location"},
    {tf:"15m", count:250, role:"confirmation"},
    {tf:"5m", count:300, role:"execution"},
    {tf:"1m", count:200, role:"optional_timing_only"}
  ];

  const V13_HANDOV_REQUIRED_INDS = [
    {name:"EMA20", status:"locally calculable", detail:"Calculated from OHLC candles."},
    {name:"EMA50", status:"locally calculable", detail:"Calculated from OHLC candles."},
    {name:"RSI14", status:"locally calculable", detail:"Calculated from close prices."},
    {name:"ATR14", status:"locally calculable", detail:"Calculated from OHLC candles."},
    {name:"VWAP", status:"locally calculable", detail:"Calculated from OHLCV candles."},
    {name:"Volume", status:"available from Binance", detail:"Included in OHLCV candles."},
    {name:"Open Interest", status:"available from Binance", detail:"Available from Binance Futures open interest endpoint. Not fetched in V13_04."},
    {name:"Funding Rate", status:"available from Binance", detail:"Available from Binance Futures funding endpoint. Not fetched in V13_04."},
    {name:"Liquidation zones", status:"not directly available", detail:"Binance does not provide ready-made liquidation heatmap zones through the simple kline feed."}
  ];

  function v13ParseTimeframes(_text){
    return V13_HANDOV_REQUIRED_TFS.map(t => ({tf:t.tf,count:t.count,role:t.role}));
  }

  function v13ParseIndicators(_text){
    return V13_HANDOV_REQUIRED_INDS.slice();
  }

  function v13CheckRequirements(){
    const tfs = v13ParseTimeframes("");
    const inds = v13ParseIndicators("");

    const lines = [];

    lines.push("DATA READINESS PREVIEW — V13_04");
    lines.push("");
    lines.push("Symbol:");
    lines.push("- " + (typeof cfg === "function" ? cfg().symbol : "{{SYMBOL}}"));
    lines.push("");
    lines.push("Required timeframes:");
    for(const t of tfs){
      lines.push("- " + t.tf + " — required " + t.count + " candles — role: " + t.role);
    }

    lines.push("");
    lines.push("Required indicators:");
    lines.push("- EMA20 — locally calculable from OHLC");
    lines.push("- EMA50 — locally calculable from OHLC");
    lines.push("- RSI14 — locally calculable from close prices");
    lines.push("- ATR14 — locally calculable from OHLC");
    lines.push("- VWAP — locally calculable from OHLCV");
    lines.push("- Volume — included in Binance OHLCV");

    lines.push("");
    lines.push("Optional external data:");
    lines.push("- Open Interest — available from Binance Futures endpoint, not mandatory");
    lines.push("- Funding Rate — available from Binance Futures endpoint, not mandatory");
    lines.push("- Liquidation zones — not available from simple kline feed");

    lines.push("");
    lines.push("Local candle cache:");
    lines.push("- IndexedDB enabled when available.");
    lines.push("- Strategy uses latest required candles only.");
    lines.push("- Stored history is pruned by retention policy.");
    lines.push("");
    lines.push("Retention policy:");
    lines.push("- 1m: 2000 candles");
    lines.push("- 5m: 3000 candles");
    lines.push("- 15m: 3000 candles");
    lines.push("- 1h: 3000 candles");
    lines.push("- 4h: 2000 candles");
    lines.push("- 1d: 1000 candles");
    lines.push("- 1w: 500 candles");
    lines.push("");
    lines.push("Full V13 Ready will be checked after fetching actual data.");
    lines.push("If any data is missing, analysis is still allowed but must show a LOUD DATA WARNING and downgrade scores.");

    v13ReqPreview.textContent = lines.join("\n");

    return {tfs,inds};
  }


  /* =======================================================
     V13_01 — GENERIC INDICATOR CALCULATIONS
  ======================================================= */

  function v13EMA(values,period){
    period = Number(period);
    if(!values.length || !isFinite(period) || period <= 0 || values.length < period) return null;

    const a = 2 / (period + 1);
    let cur = 0;

    for(let i=0;i<period;i++) cur += values[i];
    cur /= period;

    for(let i=period;i<values.length;i++){
      cur = values[i] * a + cur * (1-a);
    }

    return cur;
  }

  function v13SMA(values,period){
    period = Number(period);
    if(!values.length || !isFinite(period) || period <= 0 || values.length < period) return null;

    const slice = values.slice(values.length-period);
    return slice.reduce((a,b) => a+b,0) / period;
  }

  function v13RSI(values,period=14){
    period = Number(period);
    if(values.length <= period) return null;

    let gain = 0;
    let loss = 0;

    for(let i=1;i<=period;i++){
      const d = values[i] - values[i-1];
      if(d >= 0) gain += d;
      else loss -= d;
    }

    gain /= period;
    loss /= period;

    for(let i=period+1;i<values.length;i++){
      const d = values[i] - values[i-1];
      gain = (gain*(period-1) + Math.max(d,0)) / period;
      loss = (loss*(period-1) + Math.max(-d,0)) / period;
    }

    if(loss === 0) return 100;

    const rs = gain / loss;
    return 100 - (100 / (1 + rs));
  }

  function v13ATR(rows,period=14){
    period = Number(period);
    if(rows.length <= period) return null;

    const tr = [];

    for(let i=1;i<rows.length;i++){
      const h = rows[i].high;
      const l = rows[i].low;
      const pc = rows[i-1].close;

      tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
    }

    if(tr.length < period) return null;

    let atr = tr.slice(0,period).reduce((a,b)=>a+b,0) / period;

    for(let i=period;i<tr.length;i++){
      atr = (atr*(period-1) + tr[i]) / period;
    }

    return atr;
  }

  function v13Std(values){
    if(!values.length) return null;

    const mean = values.reduce((a,b)=>a+b,0) / values.length;
    const variance = values.reduce((a,b)=>a + Math.pow(b-mean,2),0) / values.length;

    return Math.sqrt(variance);
  }

  function v13Bollinger(values,period=20,mult=2){
    period = Number(period);
    mult = Number(mult);

    if(values.length < period) return null;

    const slice = values.slice(values.length-period);
    const mid = slice.reduce((a,b)=>a+b,0) / period;
    const sd = v13Std(slice);

    return {
      upper:mid + sd*mult,
      middle:mid,
      lower:mid - sd*mult
    };
  }

  function v13VWAP(rows){
    let pv = 0;
    let v = 0;

    for(const c of rows){
      const typ = (c.high + c.low + c.close) / 3;
      pv += typ * c.volume;
      v += c.volume;
    }

    return v > 0 ? pv/v : null;
  }

  function v13MACD(values){
    const ema12 = v13EMA(values,12);
    const ema26 = v13EMA(values,26);

    if(ema12 == null || ema26 == null) return null;

    return {
      macd:ema12 - ema26,
      note:"Signal line is simplified in V13_01 preview."
    };
  }


  /* =======================================================
     V13_04 — MARKET DATA COLLECTION + INDEXEDDB CACHE
  ======================================================= */

  const V13_DB_NAME = "V13_CANDLE_DB";
  const V13_DB_VERSION = 1;
  const V13_DB_STORE = "candles";

  const V13_RETENTION = {
    "1m":2000,
    "5m":3000,
    "15m":3000,
    "1h":3000,
    "4h":2000,
    "1d":1000,
    "1w":500
  };

  function v13TfMs(tf){
    return ({
      "1m":60,
      "3m":180,
      "5m":300,
      "15m":900,
      "30m":1800,
      "1h":3600,
      "2h":7200,
      "4h":14400,
      "6h":21600,
      "8h":28800,
      "12h":43200,
      "1d":86400,
      "3d":259200,
      "1w":604800,
      "1M":2592000
    }[tf] || 900) * 1000;
  }

  function v13DbSupported(){
    return typeof indexedDB !== "undefined";
  }

  function v13DbOpen(){
    return new Promise((resolve,reject) => {
      if(!v13DbSupported()){
        reject(new Error("IndexedDB not supported"));
        return;
      }

      const req = indexedDB.open(V13_DB_NAME,V13_DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        let store;

        if(!db.objectStoreNames.contains(V13_DB_STORE)){
          store = db.createObjectStore(V13_DB_STORE,{keyPath:"id"});
        }else{
          store = e.target.transaction.objectStore(V13_DB_STORE);
        }

        if(!store.indexNames.contains("symbolTf")){
          store.createIndex("symbolTf","symbolTf",{unique:false});
        }

        if(!store.indexNames.contains("symbolTfTime")){
          store.createIndex("symbolTfTime",["symbol","tf","time"],{unique:true});
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }

  async function v13DbGetTf(symbol,tf){
    if(!v13DbSupported()) return [];

    const db = await v13DbOpen();

    return new Promise((resolve,reject) => {
      const tx = db.transaction(V13_DB_STORE,"readonly");
      const store = tx.objectStore(V13_DB_STORE);
      const index = store.index("symbolTf");
      const req = index.getAll(symbol + "|" + tf);

      req.onsuccess = () => {
        const rows = (req.result || [])
          .map(r => ({
            time:r.time,
            open:r.open,
            high:r.high,
            low:r.low,
            close:r.close,
            volume:r.volume
          }))
          .sort((a,b) => a.time - b.time);

        resolve(rows);
      };

      req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
    });
  }

  async function v13DbReplaceTf(symbol,tf,rows){
    if(!v13DbSupported()) return;

    const db = await v13DbOpen();

    return new Promise((resolve,reject) => {
      const key = symbol + "|" + tf;
      const tx = db.transaction(V13_DB_STORE,"readwrite");
      const store = tx.objectStore(V13_DB_STORE);
      const index = store.index("symbolTf");

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));

      const cursorReq = index.openCursor(IDBKeyRange.only(key));

      cursorReq.onsuccess = e => {
        const cursor = e.target.result;

        if(cursor){
          cursor.delete();
          cursor.continue();
          return;
        }

        for(const c of rows){
          store.put({
            id:symbol + "_" + tf + "_" + c.time,
            symbol,
            tf,
            symbolTf:key,
            time:c.time,
            open:c.open,
            high:c.high,
            low:c.low,
            close:c.close,
            volume:c.volume
          });
        }
      };

      cursorReq.onerror = () => reject(cursorReq.error || new Error("IndexedDB cursor failed"));
    });
  }

  function v13MergeDedupeSort(a,b){
    const map = new Map();

    for(const c of (a || []).concat(b || [])){
      if(!c || !isFinite(c.time)) continue;
      map.set(Number(c.time),{
        time:Number(c.time),
        open:Number(c.open),
        high:Number(c.high),
        low:Number(c.low),
        close:Number(c.close),
        volume:Number(c.volume)
      });
    }

    return Array.from(map.values())
      .filter(c =>
        isFinite(c.time) &&
        isFinite(c.open) &&
        isFinite(c.high) &&
        isFinite(c.low) &&
        isFinite(c.close) &&
        isFinite(c.volume)
      )
      .sort((x,y) => x.time - y.time);
  }

  function v13TrimByRetention(tf,rows){
    const limit = V13_RETENTION[tf] || 1000;
    return rows.slice(Math.max(0,rows.length - limit));
  }

  async function v13FetchKlinesDirect(tf,count,opt={}){
    const c = cfg();
    const limit = Math.max(1, Math.min(1500, Number(count) || 500));

    let url =
      c.rest +
      "?symbol=" + encodeURIComponent(c.symbol) +
      "&interval=" + encodeURIComponent(tf) +
      "&limit=" + limit;

    if(opt.startTime != null){
      url += "&startTime=" + Math.floor(opt.startTime);
    }else{
      url += "&endTime=" + Math.floor(opt.endTime || Date.now());
    }

    const r = await API.fetch(url,{
      cache:"no-store",
      headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}
    });

    if(!r.ok){
      throw new Error("Binance klines failed for " + tf + " / HTTP " + r.status);
    }

    const d = await r.json();

    if(!Array.isArray(d)){
      throw new Error("Invalid Binance response for " + tf);
    }

    return d.map(parseRest);
  }

  async function v13FetchLatestDeep(tf,targetCount){
    let remaining = Math.max(1,Number(targetCount) || 500);
    let endTime = Date.now();
    let all = [];

    while(remaining > 0){
      const batchLimit = Math.min(1500,remaining);
      const batch = await v13FetchKlinesDirect(tf,batchLimit,{endTime});

      if(!batch.length) break;

      all = batch.concat(all);
      remaining -= batch.length;
      endTime = batch[0].time * 1000 - 1;

      if(batch.length < batchLimit) break;
      if(all.length >= targetCount) break;
    }

    return v13MergeDedupeSort([],all).slice(-targetCount);
  }

  async function v13GetCandlesWithCache(tf,requiredCount){
    const symbol = cfg().symbol;
    const retention = Math.max(requiredCount,V13_RETENTION[tf] || requiredCount);
    const info = {
      tf,
      required:requiredCount,
      retention,
      cache:"IndexedDB",
      cachedBefore:0,
      fetched:0,
      storedAfter:0,
      pruned:0,
      mode:""
    };

    try{
      let cached = await v13DbGetTf(symbol,tf);
      info.cachedBefore = cached.length;

      let fetched = [];

      if(cached.length < requiredCount){
        fetched = await v13FetchLatestDeep(tf,retention);
        info.mode = "cache warm-up / deep fetch";
      }else{
        const last = cached[cached.length-1];
        const startTime = Math.max(0,(last.time * 1000) - (2 * v13TfMs(tf)));
        fetched = await v13FetchKlinesDirect(tf,1500,{startTime});
        info.mode = "incremental update";
      }

      info.fetched = fetched.length;

      let merged = v13MergeDedupeSort(cached,fetched);
      const beforeTrim = merged.length;
      const trimmed = v13TrimByRetention(tf,merged);

      info.pruned = Math.max(0,beforeTrim - trimmed.length);
      info.storedAfter = trimmed.length;

      await v13DbReplaceTf(symbol,tf,trimmed);

      return {
        rows:trimmed.slice(Math.max(0,trimmed.length - requiredCount)),
        cacheInfo:info
      };
    }catch(e){
      console.warn("V13 cache failed; using direct fetch for " + tf,e);

      const rows = await v13FetchLatestDeep(tf,requiredCount);

      info.cache = "Fallback direct fetch";
      info.cachedBefore = 0;
      info.fetched = rows.length;
      info.storedAfter = 0;
      info.pruned = 0;
      info.mode = "no-cache fallback";

      return {rows,cacheInfo:info};
    }
  }

  async function v13FetchKlines(tf,count){
    const got = await v13GetCandlesWithCache(tf,count);
    return got.rows;
  }

  function v13Round(x,dec=2){
    x = Number(x);
    if(!isFinite(x)) return "-";
    return Number(x.toFixed(dec));
  }

  function v13SummarizeIndicators(rows,requested){
    const closes = rows.map(c => c.close);
    const summary = {};

    for(const req of requested){
      const name = req && req.name ? req.name : String(req || "");

      let m;

      m = name.match(/^EMA([0-9]+)/i);
      if(m){
        summary[name] = v13Round(v13EMA(closes,Number(m[1])),2);
        continue;
      }

      m = name.match(/^SMA([0-9]+)/i);
      if(m){
        summary[name] = v13Round(v13SMA(closes,Number(m[1])),2);
        continue;
      }

      m = name.match(/^RSI([0-9]+)/i);
      if(m){
        summary[name] = v13Round(v13RSI(closes,Number(m[1])),2);
        continue;
      }

      m = name.match(/^ATR([0-9]+)/i);
      if(m){
        summary[name] = v13Round(v13ATR(rows,Number(m[1])),2);
        continue;
      }

      m = name.match(/^Bollinger Bands ([0-9]+),([0-9.]+)/i);
      if(m){
        const bb = v13Bollinger(closes,Number(m[1]),Number(m[2]));
        summary[name] = bb
          ? {
              upper:v13Round(bb.upper,2),
              middle:v13Round(bb.middle,2),
              lower:v13Round(bb.lower,2)
            }
          : "-";
        continue;
      }

      if(/^VWAP$/i.test(name)){
        summary[name] = v13Round(v13VWAP(rows),2);
        continue;
      }

      if(/^MACD/i.test(name)){
        const macd = v13MACD(closes);
        summary[name] = macd ? {macd:v13Round(macd.macd,2)} : "-";
        continue;
      }

      if(/^Volume$/i.test(name)){
        const last = rows[rows.length-1];
        const avg20Rows = rows.slice(Math.max(0,rows.length-20));
        const avg20 = avg20Rows.reduce((a,b)=>a+b.volume,0) / Math.max(1,avg20Rows.length);

        summary[name] = {
          last:last ? v13Round(last.volume,4) : "-",
          avg20:v13Round(avg20,4)
        };
      }
    }

    return summary;
  }

  function v13CompactCandles(rows,maxRows=220){
    const use = rows.slice(Math.max(0, rows.length - maxRows));

    return use.map(c => {
      return [
        new Date(c.time*1000).toISOString(),
        v13Round(c.open,2),
        v13Round(c.high,2),
        v13Round(c.low,2),
        v13Round(c.close,2),
        v13Round(c.volume,4)
      ].join(",");
    }).join("\n");
  }

  function v13BuildDataReadiness(timeframes){
    const required = {
      "1w":100,
      "1d":150,
      "4h":150,
      "1h":200,
      "15m":250,
      "5m":300
    };

    const missing = [];
    const insufficient = [];

    for(const tf of Object.keys(required)){
      const item = timeframes.find(x => x.timeframe === tf);
      const got = item ? Number(item.receivedCandles || 0) : 0;

      if(!item || got <= 0){
        missing.push(tf + ": 0 / " + required[tf]);
      }else if(got < required[tf]){
        insufficient.push(tf + ": " + got + " / " + required[tf]);
      }
    }

    const fullReady = missing.length === 0 && insufficient.length === 0;

    return {
      fullReady,
      status:fullReady ? "OK" : "PARTIAL",
      missing,
      insufficient,
      warning:fullReady
        ? "No data warning."
        : "LOUD DATA WARNING: required data incomplete. Use fetched data, downgrade scores, and do not overstate confidence.",
      expectedOutputMode:fullReady ? "Full V13 Signal" : "Partial Signal with LOUD DATA WARNING"
    };
  }

  async function v13CollectCurrentMarketData(req){
    const symbol = cfg().symbol;
    const chartTf = iv();
    const currentPrice = candles.length ? candles[candles.length-1].close : null;

    const result = {
      symbol,
      chartTf,
      currentPrice,
      daily: dailyState ? {
        open:v13Round(dailyState.open,2),
        high:v13Round(dailyState.high,2),
        low:v13Round(dailyState.low,2),
        current:v13Round(dailyState.close,2),
        changePct:v13Round(dailyState.changePct,2)
      } : null,
      dataReadiness:null,
      timeframes:[]
    };

    for(const t of req.tfs){
      const got = await v13GetCandlesWithCache(t.tf,t.count);
      const rows = got.rows;
      const indicators = v13SummarizeIndicators(rows,req.inds);

      result.timeframes.push({
        timeframe:t.tf,
        role:t.role || "",
        requestedCandles:t.count,
        receivedCandles:rows.length,
        status:rows.length >= t.count ? "FETCHED" : "FETCHED BUT INSUFFICIENT",
        cacheInfo:got.cacheInfo,
        firstTime:rows.length ? new Date(rows[0].time*1000).toLocaleString() : "-",
        lastTime:rows.length ? new Date(rows[rows.length-1].time*1000).toLocaleString() : "-",
        latest:rows.length ? {
          open:v13Round(rows[rows.length-1].open,2),
          high:v13Round(rows[rows.length-1].high,2),
          low:v13Round(rows[rows.length-1].low,2),
          close:v13Round(rows[rows.length-1].close,2),
          volume:v13Round(rows[rows.length-1].volume,4)
        } : null,
        indicators,
        candlesCsvHeader:"time,open,high,low,close,volume",
        candlesCsv:v13CompactCandles(rows,Math.min(t.count,320))
      });
    }

    result.dataReadiness = v13BuildDataReadiness(result.timeframes);

    return result;
  }


  /* =======================================================
     V13_01 — GPT PROMPT BUILDING
  ======================================================= */

  function v13BuildAnalysisText(strategyName,strategyText,market){
    let lines = [];

    lines.push("Task:");
    lines.push("Evaluate the current market under the user's V13 / handov1 strategy rules.");
    lines.push("Use only the market data below and the user's strategy instructions.");
    lines.push("Do not hardcode BTCUSDT or BTCUSDC. Use the runtime symbol only: " + market.symbol + ".");
    lines.push("If data is partial or insufficient, place a LOUD DATA WARNING, downgrade confidence/risk scores, but still analyze using available data.");
    lines.push("Do not force no-trade solely because data is missing unless the user's scoring/WAIT gates require it.");
    lines.push("Return the user's requested V13 structured output format when specified.");
    lines.push("");
    lines.push("Strategy name:");
    lines.push(strategyName || "Strategy V1");
    lines.push("");
    lines.push("User strategy instructions:");
    lines.push(strategyText || "-");
    lines.push("");
    lines.push("Current market:");
    lines.push("Symbol: " + market.symbol);
    lines.push("Chart timeframe: " + market.chartTf);
    lines.push("Current price: " + market.currentPrice);

    if(market.dataReadiness){
      lines.push("");
      lines.push("Data readiness:");
      lines.push(JSON.stringify(market.dataReadiness,null,2));
    }

    if(market.daily){
      lines.push(
        "Daily summary from chart metrics: open " + market.daily.open +
        ", high " + market.daily.high +
        ", low " + market.daily.low +
        ", current " + market.daily.current +
        ", change " + market.daily.changePct + "%"
      );
    }

    for(const tf of market.timeframes){
      lines.push("");
      lines.push("Timeframe: " + tf.timeframe);
      lines.push("Role: " + (tf.role || "-"));
      lines.push("Requested candles: " + tf.requestedCandles);
      lines.push("Received candles: " + tf.receivedCandles);
      lines.push("Status: " + tf.status);
      lines.push("First candle: " + tf.firstTime);
      lines.push("Last candle: " + tf.lastTime);

      if(tf.cacheInfo){
        lines.push("Cache info:");
        lines.push(JSON.stringify(tf.cacheInfo,null,2));
      }

      if(tf.latest){
        lines.push(
          "Latest OHLCV: O " + tf.latest.open +
          ", H " + tf.latest.high +
          ", L " + tf.latest.low +
          ", C " + tf.latest.close +
          ", V " + tf.latest.volume
        );
      }

      lines.push("Indicator summary:");
      lines.push(JSON.stringify(tf.indicators,null,2));

      lines.push("Recent candle data:");
      lines.push(tf.candlesCsvHeader);
      lines.push(tf.candlesCsv);
    }

    return lines.join("\n");
  }

  async function v13CallGpt(promptText){
    const key = v13GptKey.value.trim();
    const model = v13GptModel.value.trim() || "gpt-4o-mini";

    if(!key){
      throw new Error("GPT API key is missing. Press GPT and add the key first.");
    }

    const body = {
      model,
      messages:[
        {
          role:"system",
          content:
            "You are a technical market-analysis evaluator. " +
            "You do not give financial advice. " +
            "You evaluate the user's own strategy rules against provided Binance market data. " +
            "Be strict, concise, and do not invent missing data."
        },
        {
          role:"user",
          content:promptText
        }
      ],
     
    };

    const r = await API.fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer " + key
      },
      body:JSON.stringify(body)
    });

    const d = await r.json();

    if(!r.ok){
      const msg =
        d && d.error && d.error.message
          ? d.error.message
          : "GPT request failed / HTTP " + r.status;

      throw new Error(msg);
    }

    const txt =
      d &&
      d.choices &&
      d.choices[0] &&
      d.choices[0].message &&
      d.choices[0].message.content
        ? d.choices[0].message.content
        : "";

    return txt || "No GPT text returned.";
  }


  /* =======================================================
     V13_01 — MAIN ACTIONS
  ======================================================= */

  async function v13AnalyzeCurrentMarket(){
    const strategyText = v13StrategyText.value.trim();
    const strategyName = v13StrategyName.value.trim() || "Strategy V1";

    if(!strategyText){
      v13GptResult.textContent = "Write strategy instructions first.";
      return;
    }

    v13SaveStrategyLocal();

    const req = v13CheckRequirements();

    v13GptResult.textContent =
      "Collecting current Binance market data...\n" +
      "This may take a few seconds if several timeframes are requested.";

    try{
      const market = await v13CollectCurrentMarketData(req);

      let preview = [];

      preview.push("Data collected:");
      preview.push("Symbol: " + market.symbol);
      preview.push("Chart TF: " + market.chartTf);
      preview.push("Current price: " + market.currentPrice);
      preview.push("");

      if(market.dataReadiness){
        preview.push("Data status: " + market.dataReadiness.status);
        preview.push("Full V13 Ready: " + (market.dataReadiness.fullReady ? "YES" : "NO"));
        preview.push("Expected output mode: " + market.dataReadiness.expectedOutputMode);
        if(market.dataReadiness.warning) preview.push(market.dataReadiness.warning);
        if(market.dataReadiness.missing && market.dataReadiness.missing.length){
          preview.push("Missing TFs: " + market.dataReadiness.missing.join(", "));
        }
        if(market.dataReadiness.insufficient && market.dataReadiness.insufficient.length){
          preview.push("Insufficient TFs: " + market.dataReadiness.insufficient.join(", "));
        }
        preview.push("");
      }

      for(const tf of market.timeframes){
        const ci = tf.cacheInfo || {};
        preview.push(
          tf.timeframe +
          " — " +
          tf.receivedCandles +
          " candles — " +
          tf.status +
          " — last: " +
          tf.lastTime
        );
        preview.push(
          "  cache: " +
          (ci.cache || "-") +
          " | mode: " +
          (ci.mode || "-") +
          " | cached before: " +
          (ci.cachedBefore ?? "-") +
          " | fetched: " +
          (ci.fetched ?? "-") +
          " | stored: " +
          (ci.storedAfter ?? "-") +
          " | pruned: " +
          (ci.pruned ?? "-")
        );
      }

      preview.push("");
      preview.push("Sending strategy + current market data to GPT...");

      v13ReqPreview.textContent += "\n\n" + preview.join("\n");

      const promptText = v13BuildAnalysisText(strategyName,strategyText,market);
      const answer = await v13CallGpt(promptText);

      v13GptResult.textContent = answer;
    }catch(e){
      console.error(e);
      v13GptResult.textContent = "Error:\n" + e.message;
    }
  }


  /* =======================================================
     V13_01 — EVENTS
  ======================================================= */

  function v13BindEvents(){
    window.addEventListener("v13:openGptSettings", v13OpenGptModal);

    v13CloseGpt.addEventListener("click", v13CloseGptModal);

    v13SaveGpt.addEventListener("click", () => {
      v13SaveGptLocal();
      v13CloseGptModal();
    });

    v13GptModal.addEventListener("click", e => {
      if(e.target === v13GptModal) v13CloseGptModal();
    });

    v13GptKey.addEventListener("input", () => {
      v13SaveGptLocal();
      v13UpdateGptStatus();
    });

    v13GptModel.addEventListener("change", v13SaveGptLocal);
    v13RememberGpt.addEventListener("change", v13SaveGptLocal);

    v13CloseLab.addEventListener("click", v13CloseLabPanel);

    v13SaveStrategy.addEventListener("click", v13SaveStrategyLocal);

    v13CheckReq.addEventListener("click", () => {
      v13SaveStrategyLocal();
      v13CheckRequirements();
    });

    v13AnalyzeCurrent.addEventListener("click", v13AnalyzeCurrentMarket);

    v13ClearResult.addEventListener("click", () => {
      v13ReqPreview.textContent = "No check run yet.";
      v13GptResult.textContent = "No analysis run yet.";
    });

    document.addEventListener("keydown", e => {
      if(e.key === "Escape"){
        v13CloseGptModal();
      }
    });
  }


  /* =======================================================
     V13_01 — STARTUP
  ======================================================= */

  v13InstallTopButtons();
  v13RestoreGpt();
  v13RestoreStrategy();
  v13BindEvents();
  v13UpdateGptStatus();
  v13UpdateContextBox();

})();

(() => {
  "use strict";
  const POS_KEY = "btc_futures_chart_v13_23_settings_window_pos";

  function clamp23(v,min,max){ return Math.max(min,Math.min(max,v)); }

  function settingsParts23(){
    const backdrop = document.getElementById("settingsModal");
    const modal = backdrop && backdrop.querySelector(".modal");
    const header = modal && modal.querySelector("h3");
    return {backdrop,modal,header};
  }

  function applyStoredPosition23(){
    const {modal} = settingsParts23();
    if(!modal) return;
    modal.classList.add("v23-settings-floating");
    let pos = null;
    try{ pos = JSON.parse(localStorage.getItem(POS_KEY) || "null"); }catch(e){}
    if(pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)){
      const rect = modal.getBoundingClientRect();
      const w = rect.width || 560;
      const h = rect.height || Math.min(window.innerHeight - 28, 520);
      const left = clamp23(pos.left, 8, Math.max(8, window.innerWidth - w - 8));
      const top = clamp23(pos.top, 8, Math.max(8, window.innerHeight - Math.min(h, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      modal.style.transform = "none";
    }
  }

  function installSettingsDrag23(){
    const {modal,header} = settingsParts23();
    if(!modal || !header || modal.dataset.v23Drag === "1") return;
    modal.dataset.v23Drag = "1";
    modal.classList.add("v23-settings-floating");

    let dragging = false;
    let grabX = 0;
    let grabY = 0;

    header.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      const rect = modal.getBoundingClientRect();
      modal.style.left = rect.left + "px";
      modal.style.top = rect.top + "px";
      modal.style.transform = "none";
      grabX = e.clientX - rect.left;
      grabY = e.clientY - rect.top;
      dragging = true;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    header.addEventListener("pointermove", e => {
      if(!dragging) return;
      const rect = modal.getBoundingClientRect();
      const left = clamp23(e.clientX - grabX, 8, Math.max(8, window.innerWidth - rect.width - 8));
      const top = clamp23(e.clientY - grabY, 8, Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      localStorage.setItem(POS_KEY, JSON.stringify({left,top}));
      e.preventDefault();
      e.stopPropagation();
    });

    const stop = e => {
      if(!dragging) return;
      dragging = false;
      try{ header.releasePointerCapture(e.pointerId); }catch(_e){}
      e.preventDefault();
      e.stopPropagation();
    };
    header.addEventListener("pointerup", stop);
    header.addEventListener("pointercancel", stop);
  }

  if(typeof openSettings === "function" && !window.__v13Patch23OpenSettingsWrapped){
    window.__v13Patch23OpenSettingsWrapped = true;
    const prevOpenSettings23 = openSettings;
    openSettings = function(){
      const r = prevOpenSettings23.apply(this,arguments);
      applyStoredPosition23();
      installSettingsDrag23();
      return r;
    };
  }

  installSettingsDrag23();
  window.addEventListener("resize", applyStoredPosition23);
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_34_CLEAN_CONSOLIDATED_BASE_R2_ISOLATE_AND_CLOSED_LINKS_FIX";

  /*
    R2 rules:
    - Position markers/icons must not trigger isolate mode.
    - Isolate mode is triggered only by P/L boxes (kind: plbox).
    - Closed trade link sliders must remain interactive; old v33 row passed normalizers
      that read localStorage instead of the current slider value, causing the thumb to snap back.
  */

  function setIsoClickMode(){
    window.__v34r1IsolateClickMode = true;
    window.__v34r2IsolateClickMode = true;
    setTimeout(() => {
      window.__v34r1IsolateClickMode = false;
      window.__v34r2IsolateClickMode = false;
    }, 0);
  }

  // Run before canvas target listeners, including older capture listeners bound directly on canvas.
  if(!window.__v34r2DocumentIsoGateBound){
    window.__v34r2DocumentIsoGateBound = true;
    document.addEventListener("click", setIsoClickMode, true);
    window.addEventListener("click", setIsoClickMode, true);
  }

  function plHitFromMouse(){
    try{
      if(typeof mouse === "undefined" || !mouse || !Array.isArray(overlayHitItems)) return null;
      for(let i = overlayHitItems.length - 1; i >= 0; i--){
        const it = overlayHitItems[i];
        if(!it || it.kind !== "plbox") continue;
        if(mouse.x >= it.x1 - 4 && mouse.x <= it.x2 + 4 && mouse.y >= it.y1 - 4 && mouse.y <= it.y2 + 4) return it;
      }
    }catch(_e){}
    return null;
  }

  // Final hover gate for isolate-click context. Older isolate click handlers call hoverItem().
  // During click mode, P/L boxes are mapped to their chain marker; actual marker hits are suppressed.
  if(typeof hoverItem === "function" && !window.__v34r2PlOnlyHoverWrapped){
    window.__v34r2PlOnlyHoverWrapped = true;
    const prevHover = hoverItem;
    hoverItem = window.hoverItem = function(){
      if(window.__v34r1IsolateClickMode || window.__v34r2IsolateClickMode){
        const p = plHitFromMouse();
        if(p && (p.markerId || p.chainId || p.parentTradeId)){
          return {
            kind: "marker",
            markerId: p.markerId,
            x: p.x,
            y: p.y,
            letter: "EX",
            chainId: p.chainId,
            parentTradeId: p.parentTradeId
          };
        }
        const h = prevHover.apply(this, arguments);
        if(h && h.kind === "marker") return null;
        return h;
      }
      return prevHover.apply(this, arguments);
    };
  }

  // Extra target-level safety: if a click is on a position marker/icon, block older marker-isolate handlers.
  // Do not block P/L box clicks.
  if(typeof canvas !== "undefined" && canvas && !canvas.__v34r2MarkerIsoBlocker){
    canvas.__v34r2MarkerIsoBlocker = true;
    canvas.addEventListener("click", function(e){
      try{
        const p = plHitFromMouse();
        if(p) return;
        const h = typeof hoverItem === "function" ? hoverItem() : null;
        if(h && h.kind === "marker"){
          e.stopImmediatePropagation();
        }
      }catch(_e){}
    }, true);
  }

  const WIDTH_KEY = "btc_futures_chart_v13_05_closed_width";
  const ALPHA_KEY = "btc_futures_chart_v13_19_closed_alpha";

  function clampNum(v, min, max, fallback){
    const n = Number(v);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function syncClosedSlider(el){
    if(!el || !el.id) return;
    if(el.id === "v33ClosedWidth" || el.id === "patch19ClosedWidth" || el.id === "patch5ClosedWidth"){
      const v = clampNum(el.value, 1, 10, 1);
      localStorage.setItem(WIDTH_KEY, String(v));
      ["v33ClosedWidth","patch19ClosedWidth","patch5ClosedWidth"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedWidthVal","patch19ClosedWidthVal","patch5ClosedWidthVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
      return;
    }
    if(el.id === "v33ClosedAlpha" || el.id === "patch19ClosedAlpha"){
      const v = clampNum(el.value, 0, 100, 100);
      localStorage.setItem(ALPHA_KEY, String(v));
      ["v33ClosedAlpha","patch19ClosedAlpha"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedAlphaVal","patch19ClosedAlphaVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
    }
  }

  // Capture phase runs before older buggy bubble listeners so they consume the fresh slider value.
  if(!window.__v34r2ClosedSliderCaptureBound){
    window.__v34r2ClosedSliderCaptureBound = true;
    document.addEventListener("input", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
    document.addEventListener("change", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
  }

  window.V13_PATCH_34_R2 = {version: MODULE};
})();

/* =========================================================
   V13_02 — STRATEGY LAB DRAG LOGIC
========================================================= */

(() => {
  "use strict";

  const POS_KEY = "btc_futures_chart_v13_02_lab_position";

  const panel = document.getElementById("v13LabPanel");
  const head = panel ? panel.querySelector(".v13-head") : null;
  const title = panel ? panel.querySelector(".v13-head-title") : null;

  if(!panel || !head) return;

  if(title){
    title.innerHTML = "Strategy Lab — V13_UI_V2 <span class='v13-drag-note'>drag header to move</span>";
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  function clamp(v,min,max){
    return Math.max(min,Math.min(max,v));
  }

  function panelRect(){
    return panel.getBoundingClientRect();
  }

  function savePosition(){
    const r = panelRect();

    localStorage.setItem(POS_KEY, JSON.stringify({
      left:Math.round(r.left),
      top:Math.round(r.top)
    }));
  }

  function applyPosition(left,top){
    const w = panel.offsetWidth || 760;
    const h = panel.offsetHeight || 500;

    const maxLeft = Math.max(0, window.innerWidth - w - 8);
    const maxTop = Math.max(0, window.innerHeight - h - 8);

    left = clamp(left,8,maxLeft);
    top = clamp(top,8,maxTop);

    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function restorePosition(){
    try{
      const raw = localStorage.getItem(POS_KEY);
      if(!raw) return;

      const p = JSON.parse(raw);
      if(!p || !isFinite(p.left) || !isFinite(p.top)) return;

      applyPosition(p.left,p.top);
    }catch(e){
      console.warn("V13_02 position restore failed",e);
    }
  }

  function resetPosition(){
    localStorage.removeItem(POS_KEY);

    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "18px";
    panel.style.bottom = "18px";
  }

  function shouldIgnoreDrag(target){
    return !!target.closest("button,input,textarea,select,label");
  }

  head.addEventListener("pointerdown",e => {
    if(shouldIgnoreDrag(e.target)) return;

    const r = panelRect();

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = r.left;
    startTop = r.top;

    panel.classList.add("v13-dragging");
    head.setPointerCapture(e.pointerId);

    e.preventDefault();
  });

  head.addEventListener("pointermove",e => {
    if(!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    applyPosition(startLeft + dx,startTop + dy);
  });

  head.addEventListener("pointerup",e => {
    if(!dragging) return;

    dragging = false;
    panel.classList.remove("v13-dragging");
    savePosition();

    try{
      head.releasePointerCapture(e.pointerId);
    }catch(_){}
  });

  head.addEventListener("pointercancel",() => {
    dragging = false;
    panel.classList.remove("v13-dragging");
  });

  head.addEventListener("dblclick",e => {
    if(shouldIgnoreDrag(e.target)) return;
    resetPosition();
  });

  window.addEventListener("resize",() => {
    const r = panelRect();

    if(panel.style.left && panel.style.top){
      applyPosition(r.left,r.top);
      savePosition();
    }
  });

  restorePosition();

})();

(() => {
  const LS = key => "btc_futures_chart_v13_05_" + key;
  const KEYS = {
    ema1Color:LS("ema1_color"), ema1Alpha:LS("ema1_alpha"),
    ema2Color:LS("ema2_color"), ema2Alpha:LS("ema2_alpha"),
    ema3Color:LS("ema3_color"), ema3Alpha:LS("ema3_alpha"),
    vwapColor:LS("vwap_color"), vwapAlpha:LS("vwap_alpha"),
    closedWidth:LS("closed_width")
  };
  const defaults = {
    ema1Color:"#3b82f6", ema1Alpha:"100",
    ema2Color:"#a855f7", ema2Alpha:"100",
    ema3Color:"#14b8a6", ema3Alpha:"100",
    vwapColor:"#f59e0b", vwapAlpha:"100",
    closedWidth:"1"
  };

  window.getIndicatorStroke = function(key,fallback){
    const c = localStorage.getItem(KEYS[key + "Color"]) || fallback || defaults[key + "Color"] || "#3b82f6";
    const a = Number(localStorage.getItem(KEYS[key + "Alpha"]) || defaults[key + "Alpha"] || "100");
    const alpha = Math.max(0,Math.min(100,isFinite(a) ? a : 100)) / 100;
    const hex = String(c || "").replace("#","");
    const full = hex.length === 3 ? hex.split("").map(x => x+x).join("") : hex.padEnd(6,"0").slice(0,6);
    const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
    return "rgba("+r+","+g+","+b+","+alpha+")";
  };
  window.getClosedLinkWidth = function(){
    const v = Number(localStorage.getItem(KEYS.closedWidth) || defaults.closedWidth);
    return isFinite(v) && v > 0 ? v : 1;
  };

  function settingInput(id, type, value, extra=''){
    return `<input id="${id}" type="${type}" value="${value}" ${extra}>`;
  }

  function injectSettings(){
    const grid = document.querySelector('.settings-grid');
    if(!grid || document.getElementById('patch5EmaCard')) return;
    const emaCard = document.createElement('div');
    emaCard.className = 'settings-card';
    emaCard.id = 'patch5EmaCard';
    emaCard.innerHTML = `
      <div class="settings-card-title">Indicator styles</div>
      <div class="settings-card-desc">EMA and VWAP color and transparency.</div>
      <div class="patch5-row"><span>EMA 1</span>${settingInput('patch5Ema1Color','color', localStorage.getItem(KEYS.ema1Color)||defaults.ema1Color)} ${settingInput('patch5Ema1Alpha','range', localStorage.getItem(KEYS.ema1Alpha)||defaults.ema1Alpha,'min="0" max="100" step="1"')}</div>
      <div class="patch5-row"><span>EMA 2</span>${settingInput('patch5Ema2Color','color', localStorage.getItem(KEYS.ema2Color)||defaults.ema2Color)} ${settingInput('patch5Ema2Alpha','range', localStorage.getItem(KEYS.ema2Alpha)||defaults.ema2Alpha,'min="0" max="100" step="1"')}</div>
      <div class="patch5-row"><span>EMA 3</span>${settingInput('patch5Ema3Color','color', localStorage.getItem(KEYS.ema3Color)||defaults.ema3Color)} ${settingInput('patch5Ema3Alpha','range', localStorage.getItem(KEYS.ema3Alpha)||defaults.ema3Alpha,'min="0" max="100" step="1"')}</div>
      <div class="patch5-row"><span>VWAP</span>${settingInput('patch5VWAPColor','color', localStorage.getItem(KEYS.vwapColor)||defaults.vwapColor)} ${settingInput('patch5VWAPAlpha','range', localStorage.getItem(KEYS.vwapAlpha)||defaults.vwapAlpha,'min="0" max="100" step="1"')}</div>`;
    grid.appendChild(emaCard);

    const closedCard = document.createElement('div');
    closedCard.className = 'settings-card';
    closedCard.id = 'patch5ClosedCard';
    closedCard.innerHTML = `
      <div class="settings-card-title">Closed trade links</div>
      <div class="settings-card-desc">Thickness for closed-trade connector lines.</div>
      <div class="patch5-row" style="grid-template-columns:90px 1fr 44px"><span>Thickness</span>${settingInput('patch5ClosedWidth','range', localStorage.getItem(KEYS.closedWidth)||defaults.closedWidth,'min="1" max="4" step="0.25"')}<span id="patch5ClosedWidthVal">${localStorage.getItem(KEYS.closedWidth)||defaults.closedWidth}</span></div>`;
    grid.appendChild(closedCard);

    const binds = [
      ['patch5Ema1Color',KEYS.ema1Color],['patch5Ema1Alpha',KEYS.ema1Alpha],
      ['patch5Ema2Color',KEYS.ema2Color],['patch5Ema2Alpha',KEYS.ema2Alpha],
      ['patch5Ema3Color',KEYS.ema3Color],['patch5Ema3Alpha',KEYS.ema3Alpha],
      ['patch5VWAPColor',KEYS.vwapColor],['patch5VWAPAlpha',KEYS.vwapAlpha],
      ['patch5ClosedWidth',KEYS.closedWidth]
    ];
    binds.forEach(([id,key]) => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.value);
        const v = document.getElementById('patch5ClosedWidthVal');
        if(v && id === 'patch5ClosedWidth') v.textContent = el.value;
        draw();
      });
      el.addEventListener('change', () => {
        localStorage.setItem(key, el.value);
        draw();
      });
    });

    [['patch5Ema1Period',emaPeriod1El],['patch5Ema2Period',emaPeriod2El],['patch5Ema3Period',emaPeriod3El]].forEach(([id,target]) => {
      const el = document.getElementById(id);
      if(!el || !target) return;
      el.addEventListener('input', () => { target.value = el.value; saveEmaSettings(); });
      el.addEventListener('change', () => { target.value = el.value; saveEmaSettings(); });
    });
  }

  // Custom date modal
  const customDateModal = document.getElementById('customDateModal');
  const customFromModal = document.getElementById('customFromModal');
  const customToModal = document.getElementById('customToModal');
  const customDateApply = document.getElementById('customDateApply');
  const customDateCancel = document.getElementById('customDateCancel');
  let lastNonCustomReport = reportWeeksEl.value === 'custom' ? '1w' : reportWeeksEl.value;
  function openCustomDateModal(){
    if(customFromModal) customFromModal.value = customFromEl ? customFromEl.value : '';
    if(customToModal) customToModal.value = customToEl ? customToEl.value : '';
    customDateModal.classList.remove('hidden');
  }
  function closeCustomDateModal(){ customDateModal.classList.add('hidden'); }
  reportWeeksEl.addEventListener('change', () => {
    if(reportWeeksEl.value === 'custom'){
      openCustomDateModal();
    }else{
      lastNonCustomReport = reportWeeksEl.value;
    }
  });
  customDateApply.addEventListener('click', async () => {
    if(customFromEl) customFromEl.value = customFromModal.value.trim();
    if(customToEl) customToEl.value = customToModal.value.trim();
    closeCustomDateModal();
    if(typeof updateReportControls === 'function') updateReportControls();
    if(typeof clearTrades === 'function') clearTrades();
    if(typeof updateApiStatus === 'function') updateApiStatus();
    if(typeof hasKeys === 'function' && hasKeys() && typeof loadTrades === 'function'){
      await loadTrades({silent:false});
    }
    if(typeof focusChartAtCustomStart === 'function') focusChartAtCustomStart();
    else if(typeof draw === 'function') draw();
  });
  customDateCancel.addEventListener('click', () => {
    closeCustomDateModal();
    reportWeeksEl.value = lastNonCustomReport || '1w';
    if(typeof reloadTradesForReport === 'function') reloadTradesForReport();
  });
  customDateModal.addEventListener('click', e => { if(e.target === customDateModal) customDateCancel.click(); });

  // isolate mode helpers
  const inspectModal = document.getElementById('inspectModal');
  const isolateState = {active:false, chainIds:new Set(), markerIds:new Set(), closedLinkIds:new Set(), openEntryIds:new Set()};
  window.isIsolateActive = () => isolateState.active;
  window.isMarkerVisibleInIsolate = id => !isolateState.active || isolateState.markerIds.has(id);
  window.isClosedLinkVisibleInIsolate = l => !isolateState.active || isolateState.closedLinkIds.has(l.id);
  window.isOpenLinkVisibleInIsolate = l => !isolateState.active || isolateState.openEntryIds.has(l.entryMarkerId) || (l.chainId && isolateState.chainIds.has(l.chainId));
  window.isOpenBoxVisibleInIsolate = b => !isolateState.active || (b && b.chainId && isolateState.chainIds.has(b.chainId)) || openLotLinks.some(l => isolateState.openEntryIds.has(l.entryMarkerId));

  function markerById(id){ return fillMarkers.find(m => m.id === id) || null; }

  function chainIdOfMarker(markerId){
    const m = markerById(markerId);
    if(m && m.chainId) return m.chainId;
    const l = resultLinks.find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || openLotLinks.find(x => x.entryMarkerId === markerId);
    return l && l.chainId ? l.chainId : null;
  }

  function buildTradeChain(markerId){
    const markerIds = new Set();
    const closedIds = new Set();
    const openIds = new Set();
    const chainIds = new Set();
    const cid = chainIdOfMarker(markerId);
    if(cid) chainIds.add(cid);

    if(chainIds.size){
      for(const m of fillMarkers){
        if(m.chainId && chainIds.has(m.chainId)) markerIds.add(m.id);
      }
      for(const l of resultLinks){
        if(l.chainId && chainIds.has(l.chainId)){
          closedIds.add(l.id);
          markerIds.add(l.entryMarkerId);
          markerIds.add(l.exitMarkerId);
        }
      }
      for(const l of openLotLinks){
        if(l.chainId && chainIds.has(l.chainId)){
          openIds.add(l.entryMarkerId);
          markerIds.add(l.entryMarkerId);
        }
      }
      return {markerIds, closedIds, openIds, chainIds};
    }

    markerIds.add(markerId);
    let changed = true;
    while(changed){
      changed = false;
      for(const l of resultLinks){
        if(markerIds.has(l.entryMarkerId) || markerIds.has(l.exitMarkerId)){
          if(!closedIds.has(l.id)){ closedIds.add(l.id); changed = true; }
          if(!markerIds.has(l.entryMarkerId)){ markerIds.add(l.entryMarkerId); changed = true; }
          if(!markerIds.has(l.exitMarkerId)){ markerIds.add(l.exitMarkerId); changed = true; }
        }
      }
      for(const l of openLotLinks){
        if(markerIds.has(l.entryMarkerId)){
          if(!openIds.has(l.entryMarkerId)){ openIds.add(l.entryMarkerId); changed = true; }
        }
      }
    }
    return {markerIds, closedIds, openIds, chainIds};
  }

  function clearIsolate(){
    isolateState.active = false;
    isolateState.chainIds = new Set();
    isolateState.markerIds = new Set();
    isolateState.closedLinkIds = new Set();
    isolateState.openEntryIds = new Set();
    draw();
  }
  window.__v34ClearIsolateState = clearIsolate;

  function activateIsolate(markerId){
    const chain = buildTradeChain(markerId);
    isolateState.active = true;
    isolateState.chainIds = chain.chainIds || new Set();
    isolateState.markerIds = chain.markerIds;
    isolateState.closedLinkIds = chain.closedIds;
    isolateState.openEntryIds = chain.openIds;
    if(inspectModal) inspectModal.classList.add('hidden');
    draw();
  }

  function focusIsolatedTrade(){
    if(!isolateState.active) return;
    const times = [];
    for(const m of fillMarkers){ if(isolateState.markerIds.has(m.id) && isFinite(Number(m.time))) times.push(Number(m.time)); }
    for(const l of resultLinks){ if(isolateState.closedLinkIds.has(l.id)){ times.push(Number(l.entryTime)); times.push(Number(l.exitTime)); } }
    for(const l of openLotLinks){ if(isolateState.openEntryIds.has(l.entryMarkerId)){ times.push(Number(l.entryTime)); } }
    const clean = times.filter(t => isFinite(t) && t > 0);
    if(!clean.length || !candles.length) return;
    const mid = (Math.min(...clean) + Math.max(...clean)) / 2;
    let idx = 0, best = Infinity;
    for(let i=0;i<candles.length;i++){
      const d = Math.abs(Number(candles[i].time) - mid);
      if(d < best){ best = d; idx = i; }
    }
    rightOffset = Math.max(0, Math.min(candles.length, candles.length - 1 - idx - Math.floor(visibleCount/2)));
    clampView();
    draw();
  }

  canvas.addEventListener('click', e => {
    if(window.__v13Patch36StrictPlOnly) return;
    if(dragChart || dragAxis) return;
    const r = canvas.getBoundingClientRect();
    mouse = {x:e.clientX-r.left, y:e.clientY-r.top};

    // PATCH_34_R3_REBUILD: isolate is triggered only by P/L boxes.
    // Position/trade markers/icons have no relationship to isolate activation.
    let hit = null;
    for(let i = (overlayHitItems || []).length - 1; i >= 0; i--){
      const it = overlayHitItems[i];
      if(!it || it.kind !== 'plbox') continue;
      if(typeof window.__v13Patch36IsClosedTradePlBox === 'function' && !window.__v13Patch36IsClosedTradePlBox(it)) continue;
      if(mouse.x >= it.x1 - 4 && mouse.x <= it.x2 + 4 && mouse.y >= it.y1 - 4 && mouse.y <= it.y2 + 4){
        hit = it;
        break;
      }
    }
    if(!hit || !hit.markerId) return;

    if(isolateState.active && isolateState.markerIds.has(hit.markerId)){
      clearIsolate();
      return;
    }
    activateIsolate(hit.markerId);
  });

  document.addEventListener('keydown', e => {
    if(e.code !== 'Space' || !isolateState.active) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    focusIsolatedTrade();
  });

  // tooltip helpers
  window.getExitEntryContributionLines = function(exitMarkerId){
    const ex = markerById(exitMarkerId);
    const sameChain = ex && ex.letter === 'EX' && ex.chainId
      ? resultLinks.filter(l => l.chainId === ex.chainId)
      : resultLinks.filter(l => l.exitMarkerId === exitMarkerId);
    return sameChain
      .slice()
      .sort((a,b) => (a.entryTime - b.entryTime) || (a.exitTime - b.exitTime))
      .map(l => {
        const m = markerById(l.entryMarkerId);
        const x = markerById(l.exitMarkerId);
        const tag = m ? m.letter : 'E';
        const exitTag = x ? x.letter : '';
        return `${tag}${exitTag ? '→' + exitTag : ''} ${fq(l.qty)} | ${fm(l.netPnl)}`;
      });
  };
  window.getOpenEntryContributionLines = function(){
    const latest = candles.length ? candles[candles.length-1] : null;
    return openLotLinks
      .filter(l => !isolateState.active || isolateState.openEntryIds.has(l.entryMarkerId))
      .slice()
      .sort((a,b) => a.entryTime - b.entryTime)
      .map(l => {
        const m = markerById(l.entryMarkerId);
        const tag = m ? m.letter : (l.side === 'SHORT' ? 'ES' : 'EL');
        const pnl = latest ? (l.side === 'LONG' ? (latest.close - l.entryPrice) * l.qty : (l.entryPrice - latest.close) * l.qty) : 0;
        return `${tag} ${fq(l.qty)} | ${fm(pnl)}`;
      });
  };
  window.markerTimeX = function(m,vis,mapX,slot){
    const t = Number(m && (m.candleTime || m.time));
    if(!vis.length || !isFinite(t)) return null;
    const sec = ivSec();
    for(let i=0;i<vis.length;i++){
      const c = vis[i];
      if(t >= c.time && t < c.time + sec) return mapX(i);
    }
    return timeX(t,vis,mapX,slot);
  };

  injectSettings();
})();

(() => {
  "use strict";

  function installChartIndicatorToggles(){
    const canvasEl = document.getElementById("chart");
    const toggles = document.querySelector(".indicator-toggles");
    if(!canvasEl || !toggles || toggles.classList.contains("chart-indicator-toggles")) return;

    let wrap = canvasEl.parentElement && canvasEl.parentElement.classList.contains("chart-wrap")
      ? canvasEl.parentElement
      : null;

    if(!wrap){
      wrap = document.createElement("div");
      wrap.className = "chart-wrap";
      canvasEl.parentNode.insertBefore(wrap, canvasEl);
      wrap.appendChild(canvasEl);
    }

    toggles.classList.add("chart-indicator-toggles");
    wrap.appendChild(toggles);
  }

  window.focusChartAtCustomStart = function(){
    try{
      if(!Array.isArray(candles) || !candles.length) return;
      if(typeof customReportRangeMs !== "function") return;

      const r = customReportRangeMs();
      if(!r || !isFinite(r.start)) return;

      const startSec = Math.floor(r.start / 1000);
      let idx = 0;
      let best = Infinity;

      for(let i=0;i<candles.length;i++){
        const d = Math.abs(Number(candles[i].time) - startSec);
        if(d < best){
          best = d;
          idx = i;
        }
      }

      visibleCount = clamp(
        visibleCount || DEF_VISIBLE,
        Math.min(MIN_VISIBLE,candles.length),
        Math.max(1,candles.length)
      );

      const desiredEnd = Math.min(candles.length, idx + visibleCount);
      rightOffset = candles.length - desiredEnd;
      manualY = false;
      yMin = null;
      yMax = null;

      clampView();
      draw();
    }catch(e){
      console.warn("Custom start focus failed", e);
    }
  };

  installChartIndicatorToggles();
})();

(() => {
  "use strict";

  const P8_STYLE_KEYS = {
    ema1Color:"btc_futures_chart_v13_05_ema1_color", ema1Alpha:"btc_futures_chart_v13_05_ema1_alpha",
    ema2Color:"btc_futures_chart_v13_05_ema2_color", ema2Alpha:"btc_futures_chart_v13_05_ema2_alpha",
    ema3Color:"btc_futures_chart_v13_05_ema3_color", ema3Alpha:"btc_futures_chart_v13_05_ema3_alpha",
    vwapColor:"btc_futures_chart_v13_05_vwap_color", vwapAlpha:"btc_futures_chart_v13_05_vwap_alpha"
  };
  const P8_STYLE_DEFAULTS = {
    ema1Color:"#3b82f6", ema1Alpha:"100",
    ema2Color:"#a855f7", ema2Alpha:"100",
    ema3Color:"#14b8a6", ema3Alpha:"100",
    vwapColor:"#2f8a4b", vwapAlpha:"100"
  };

  function p8CardTitle(card){
    const t = card && card.querySelector && card.querySelector('.settings-card-title');
    return t ? t.textContent.trim() : '';
  }

  function p8Val(id,fallback){
    const el = document.getElementById(id);
    return el && el.value ? el.value : fallback;
  }

  function p8StyleVal(key){
    return localStorage.getItem(P8_STYLE_KEYS[key]) || P8_STYLE_DEFAULTS[key];
  }

  function p8Row(name,periodId,colorId,alphaId,colorKey,alphaKey,periodValue){
    const period = periodId
      ? `<input id="${periodId}" type="number" min="1" max="999" step="1" value="${periodValue}">`
      : `<span style="color:var(--muted)">—</span>`;
    return `
      <div>${name}</div>
      <div>${period}</div>
      <input id="${colorId}" type="color" value="${p8StyleVal(colorKey)}">
      <input id="${alphaId}" type="range" min="0" max="100" step="1" value="${p8StyleVal(alphaKey)}">`;
  }

  function installPatch8IndicatorSettings(){
    const grid = document.querySelector('.settings-grid');
    if(!grid || document.getElementById('patch8IndicatorCard')) return;

    const cards = Array.from(grid.querySelectorAll('.settings-card'));
    cards.forEach(card => {
      const title = p8CardTitle(card);
      if(title === 'EMAs' || title === 'Indicator styles') card.classList.add('patch8-hidden-card');
    });

    const card = document.createElement('div');
    card.className = 'settings-card patch8-indicator-card';
    card.id = 'patch8IndicatorCard';
    card.innerHTML = `
      <div class="settings-card-title">Indicators</div>
      <div class="settings-card-desc">Set period, color, and transparency in one row per indicator.</div>
      <div class="patch8-indicator-grid">
        <div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div>
        ${p8Row('EMA 1','patch8Ema1Period','patch8Ema1Color','patch8Ema1Alpha','ema1Color','ema1Alpha',p8Val('emaPeriod1','20'))}
        ${p8Row('EMA 2','patch8Ema2Period','patch8Ema2Color','patch8Ema2Alpha','ema2Color','ema2Alpha',p8Val('emaPeriod2','50'))}
        ${p8Row('EMA 3','patch8Ema3Period','patch8Ema3Color','patch8Ema3Alpha','ema3Color','ema3Alpha',p8Val('emaPeriod3','100'))}
        ${p8Row('VWAP',null,'patch8VWAPColor','patch8VWAPAlpha','vwapColor','vwapAlpha','')}
      </div>`;

    const closed = document.getElementById('patch5ClosedCard');
    if(closed && closed.parentNode === grid) grid.insertBefore(card, closed);
    else grid.appendChild(card);

    const periodMap = [
      ['patch8Ema1Period','emaPeriod1'],
      ['patch8Ema2Period','emaPeriod2'],
      ['patch8Ema3Period','emaPeriod3']
    ];
    periodMap.forEach(([from,to]) => {
      const src = document.getElementById(from);
      const dst = document.getElementById(to);
      if(!src || !dst) return;
      const sync = () => {
        dst.value = src.value;
        if(typeof saveEmaSettings === 'function') saveEmaSettings();
        else if(typeof draw === 'function') draw();
      };
      src.addEventListener('input', sync);
      src.addEventListener('change', sync);
    });

    const styleMap = [
      ['patch8Ema1Color','ema1Color'],['patch8Ema1Alpha','ema1Alpha'],
      ['patch8Ema2Color','ema2Color'],['patch8Ema2Alpha','ema2Alpha'],
      ['patch8Ema3Color','ema3Color'],['patch8Ema3Alpha','ema3Alpha'],
      ['patch8VWAPColor','vwapColor'],['patch8VWAPAlpha','vwapAlpha']
    ];
    styleMap.forEach(([id,key]) => {
      const el = document.getElementById(id);
      if(!el) return;
      const sync = () => {
        localStorage.setItem(P8_STYLE_KEYS[key], el.value);
        if(typeof draw === 'function') draw();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });
  }

  function p8Gross(side,en,ex,q){
    return String(side).toUpperCase() === 'SHORT' ? (Number(en)-Number(ex))*Number(q) : (Number(ex)-Number(en))*Number(q);
  }

  function p8NormalizeReconstruction(rec){
    if(!rec || !Array.isArray(rec.markers) || !Array.isArray(rec.links)) return rec;
    const markersById = new Map(rec.markers.map(m => [m.id,m]));
    let synth = 1;
    const ensureChain = l => {
      const em = markersById.get(l.entryMarkerId);
      const xm = markersById.get(l.exitMarkerId);
      let cid = l.chainId || l.tradeChainId || (em && em.chainId) || (xm && xm.chainId);
      if(!cid) cid = 'p8tc_' + (em && em.id ? em.id : synth++);
      l.chainId = cid;
      l.tradeChainId = cid;
      if(em && !em.chainId) em.chainId = cid;
      if(xm && !xm.chainId) xm.chainId = cid;
      return cid;
    };

    rec.links.forEach(l => {
      const cid = ensureChain(l);
      const side = l.side || ((markersById.get(l.entryMarkerId)||{}).side) || '';
      const q = Number(l.qty || 0);
      const fees = Number(l.fees || 0);
      const priceNet = p8Gross(side,l.entryPrice,l.exitPrice,q) - (isFinite(fees) ? fees : 0);
      const realizedNet = Number(l.realizedPnl) - (isFinite(fees) ? fees : 0);
      const useRealized = isFinite(realizedNet) && Math.abs(realizedNet) > 1e-9 && (Math.abs(priceNet) < 1e-9 || Math.sign(realizedNet) === Math.sign(priceNet));
      l.grossPnl = p8Gross(side,l.entryPrice,l.exitPrice,q);
      l.netPnl = useRealized ? realizedNet : priceNet;
      l.chainId = cid;
      l.tradeChainId = cid;
    });

    (rec.openConnectors || []).forEach(l => {
      const em = markersById.get(l.entryMarkerId);
      let cid = l.chainId || l.tradeChainId || (em && em.chainId);
      if(!cid) cid = 'p8tc_open_' + (em && em.id ? em.id : synth++);
      l.chainId = cid;
      l.tradeChainId = cid;
      if(em && !em.chainId) em.chainId = cid;
    });

    const groups = new Map();
    rec.markers.forEach(m => {
      let cid = m.chainId || m.tradeChainId;
      if(!cid){
        const l = rec.links.find(x => x.entryMarkerId === m.id || x.exitMarkerId === m.id) || (rec.openConnectors || []).find(x => x.entryMarkerId === m.id);
        cid = l && (l.chainId || l.tradeChainId);
        if(cid) m.chainId = cid;
      }
      if(!cid) return;
      m.tradeChainId = cid;
      if(!groups.has(cid)) groups.set(cid,{markers:[],links:[],open:[]});
      groups.get(cid).markers.push(m);
    });
    rec.links.forEach(l => {
      const cid = l.chainId || l.tradeChainId;
      if(!groups.has(cid)) groups.set(cid,{markers:[],links:[],open:[]});
      groups.get(cid).links.push(l);
    });
    (rec.openConnectors || []).forEach(l => {
      const cid = l.chainId || l.tradeChainId;
      if(!groups.has(cid)) groups.set(cid,{markers:[],links:[],open:[]});
      groups.get(cid).open.push(l);
    });

    groups.forEach(g => {
      const entries = g.markers.filter(m => m.role === 'entry').sort((a,b) => (a.time-b.time) || String(a.id).localeCompare(String(b.id)));
      const closes = g.markers.filter(m => m.role === 'close' && !m.unresolved).sort((a,b) => (a.time-b.time) || String(a.id).localeCompare(String(b.id)));
      entries.forEach((m,i) => {
        const sh = m.side === 'SHORT' || m.rawSide === 'SELL';
        m.letter = i === 0 ? (sh ? 'ES' : 'EL') : (sh ? 'S' : 'B');
      });
      const finalId = g.open.length ? null : (closes.length ? closes[closes.length-1].id : null);
      closes.forEach(m => {
        m.isFinalExit = m.id === finalId;
        m.letter = m.isFinalExit ? 'EX' : 'P';
        const linked = g.links.filter(l => l.exitMarkerId === m.id);
        if(linked.length) m.pnl = linked.reduce((a,l) => a + Number(l.netPnl || 0),0);
      });
      g.links.forEach(l => {
        const x = markersById.get(l.exitMarkerId);
        l.exitIsFinal = !!(x && x.letter === 'EX');
      });
    });

    return rec;
  }

  if(typeof reconstruct === 'function' && !window.__patch8ReconstructInstalled){
    window.__patch8ReconstructInstalled = true;
    const baseReconstruct = reconstruct;
    reconstruct = function(rows,symbol){
      return p8NormalizeReconstruction(baseReconstruct(rows,symbol));
    };
  }

  function p8MarkerById(id){ return (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null; }

  function p8ChainOfMarker(markerId){
    const m = p8MarkerById(markerId);
    if(m && (m.chainId || m.tradeChainId)) return m.chainId || m.tradeChainId;
    const l = (Array.isArray(resultLinks) ? resultLinks.find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId) : null)
      || (Array.isArray(openLotLinks) ? openLotLinks.find(x => x.entryMarkerId === markerId) : null);
    return l ? (l.chainId || l.tradeChainId || null) : null;
  }

  const p8Iso = {active:false, chainIds:new Set(), markerIds:new Set(), closedLinkIds:new Set(), openEntryIds:new Set()};

  function p8BuildChain(markerId){
    const cid = p8ChainOfMarker(markerId);
    const chainIds = new Set(cid ? [cid] : []);
    const markerIds = new Set();
    const closedIds = new Set();
    const openIds = new Set();
    if(chainIds.size){
      (fillMarkers || []).forEach(m => { if(chainIds.has(m.chainId || m.tradeChainId)) markerIds.add(m.id); });
      (resultLinks || []).forEach(l => { if(chainIds.has(l.chainId || l.tradeChainId)){ closedIds.add(l.id); markerIds.add(l.entryMarkerId); markerIds.add(l.exitMarkerId); } });
      (openLotLinks || []).forEach(l => { if(chainIds.has(l.chainId || l.tradeChainId)){ openIds.add(l.entryMarkerId); markerIds.add(l.entryMarkerId); } });
    }else if(markerId){
      markerIds.add(markerId);
    }
    return {chainIds,markerIds,closedIds,openIds};
  }

  function p8ClearIso(){
    p8Iso.active = false;
    p8Iso.chainIds = new Set();
    p8Iso.markerIds = new Set();
    p8Iso.closedLinkIds = new Set();
    p8Iso.openEntryIds = new Set();
    if(typeof draw === 'function') draw();
  }

  function p8ActivateIso(markerId){
    const chain = p8BuildChain(markerId);
    p8Iso.active = true;
    p8Iso.chainIds = chain.chainIds;
    p8Iso.markerIds = chain.markerIds;
    p8Iso.closedLinkIds = chain.closedIds;
    p8Iso.openEntryIds = chain.openIds;
    if(typeof draw === 'function') draw();
  }

  window.isIsolateActive = () => p8Iso.active;
  window.isMarkerVisibleInIsolate = id => !p8Iso.active || p8Iso.markerIds.has(id);
  window.isClosedLinkVisibleInIsolate = l => !p8Iso.active || p8Iso.closedLinkIds.has(l.id) || (l.chainId && p8Iso.chainIds.has(l.chainId));
  window.isOpenLinkVisibleInIsolate = l => !p8Iso.active || p8Iso.openEntryIds.has(l.entryMarkerId) || (l.chainId && p8Iso.chainIds.has(l.chainId));
  window.isOpenBoxVisibleInIsolate = b => !p8Iso.active || (b && b.chainId && p8Iso.chainIds.has(b.chainId));

  function p8FocusIsolatedTrade(){
    if(!p8Iso.active || !Array.isArray(candles) || !candles.length) return;
    const times = [];
    (fillMarkers || []).forEach(m => { if(p8Iso.markerIds.has(m.id) && isFinite(Number(m.time))) times.push(Number(m.time)); });
    (resultLinks || []).forEach(l => { if(p8Iso.closedLinkIds.has(l.id)){ times.push(Number(l.entryTime)); times.push(Number(l.exitTime)); } });
    (openLotLinks || []).forEach(l => { if(p8Iso.openEntryIds.has(l.entryMarkerId) && isFinite(Number(l.entryTime))) times.push(Number(l.entryTime)); });
    if(!times.length) return;
    const mid = (Math.min(...times) + Math.max(...times)) / 2;
    let idx = 0, best = Infinity;
    for(let i=0;i<candles.length;i++){
      const d = Math.abs(Number(candles[i].time) - mid);
      if(d < best){ best = d; idx = i; }
    }
    visibleCount = clamp(visibleCount || DEF_VISIBLE, Math.min(MIN_VISIBLE,candles.length), Math.max(1,candles.length));
    const desiredEnd = Math.min(candles.length, Math.max(visibleCount, idx + Math.floor(visibleCount/2)));
    rightOffset = candles.length - desiredEnd;
    if(typeof clampView === 'function') clampView();
    if(typeof draw === 'function') draw();
  }

  function p8DistSeg(px0,py0,x1,y1,x2,y2){
    const dx = x2 - x1, dy = y2 - y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx + (py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let bestMarker = null, bestD = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x, mouse.y-it.y);
      if(d <= (it.radius || 8) + 9 && d < bestD){ bestD = d; bestMarker = it; }
    }
    if(bestMarker) return bestMarker;

    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }

    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      let nearMarker = false;
      for(const m of overlayHitItems || []){
        if(m.kind === 'marker' && Math.hypot(mouse.x-m.x, mouse.y-m.y) <= (m.radius || 8) + 12){ nearMarker = true; break; }
      }
      if(nearMarker) continue;
      if(p8DistSeg(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  window.getExitEntryContributionLines = function(exitMarkerId){
    return (resultLinks || [])
      .filter(l => l.exitMarkerId === exitMarkerId)
      .slice()
      .sort((a,b) => (a.entryTime - b.entryTime) || String(a.entryMarkerId).localeCompare(String(b.entryMarkerId)))
      .map(l => {
        const m = p8MarkerById(l.entryMarkerId);
        const tag = m ? m.letter : 'E';
        return `${tag} ${fq(l.qty)} | ${fm(l.netPnl)}`;
      });
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;

    if(it.kind === 'line'){
      tooltip(
        it.open
          ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side,'Entry: ' + p2(it.entryPrice),'Current: ' + p2(it.exitPrice)]
          : ['Matched close link','Net P/L: ' + fm(it.netPnl),'Gross P/L: ' + fm(it.grossPnl),'Realized P/L: ' + fm(it.realizedPnl),'Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],
        mouse.x,mouse.y
      );
      return;
    }

    if(it.kind === 'marker'){
      const lines = [
        it.role === 'entry' ? (it.side === 'SHORT' ? 'Short entry/fill' : 'Long entry/fill') : (it.unresolved ? 'Unresolved/carry-in close' : 'Close/reduce fill'),
        'Size: ' + fq(it.qty) + ' BTC',
        'Price: ' + p2(it.price)
      ];
      if(it.role === 'close'){
        const closeLinks = (resultLinks || []).filter(l => l.exitMarkerId === it.markerId);
        const closePnl = closeLinks.length ? closeLinks.reduce((a,l) => a + Number(l.netPnl || 0),0) : it.pnl;
        lines.push('P/L part: ' + fm(closePnl));
      }
      lines.push('Time: ' + ft(it.time));
      if(it.role === 'close'){
        const entryLines = window.getExitEntryContributionLines(it.markerId);
        if(entryLines.length){ lines.push('Entries:'); lines.push(...entryLines); }
      }
      if(it.note) lines.push(it.note);
      tooltip(lines,mouse.x,mouse.y);
      return;
    }

    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [
        it.letter === 'B' ? 'Current open long' : 'Current open short',
        'Size: ' + fq(it.qty) + ' BTC',
        'Entry price: ' + p2(it.price),
        'Margin: ' + (margin == null ? '-' : fm(margin))
      ];
      const openLines = getOpenEntryContributionLines();
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  candleTip = function(c){
    const d = new Date(c.time*1000);
    const lines = [
      formatDateTime(d),
      'O : ' + ip(c.open),
      'H : ' + ip(c.high),
      'L : ' + ip(c.low),
      'C : ' + ip(c.close),
      'V : ' + fv(c.volume)
    ];
    ctx.save();
    ctx.font = '11px Arial';
    const pad = 7, lh = 14;
    const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + pad*2;
    const h = lines.length * lh + pad*2;
    const axis = (typeof RIGHT_AXIS === 'number' ? RIGHT_AXIS : 88);
    const x = Math.max(8, canvas.clientWidth - axis - w - 12);
    const y = 8;
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.strokeStyle = '#d9dce1';
    ctx.fillRect(x,y,w,h);
    ctx.strokeRect(x,y,w,h);
    ctx.fillStyle = '#1e2329';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((s,i) => ctx.fillText(s,x+pad,y+pad+i*lh));
    ctx.restore();
  };

  if(canvas && !window.__patch8CanvasClickInstalled){
    window.__patch8CanvasClickInstalled = true;
    canvas.addEventListener('click', e => {
      if(window.__v13Patch36StrictPlOnly) return;
      const r = canvas.getBoundingClientRect();
      mouse = {x:e.clientX-r.left, y:e.clientY-r.top};
      const hit = hoverItem();
      if(!hit || hit.kind !== 'marker' || !hit.markerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(p8Iso.active && p8Iso.markerIds.has(hit.markerId)) p8ClearIso();
      else p8ActivateIso(hit.markerId);
    }, true);
  }

  document.addEventListener('keydown', e => {
    if(e.code !== 'Space' || !p8Iso.active) return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    p8FocusIsolatedTrade();
  }, true);

  installPatch8IndicatorSettings();
})();

(() => {
  "use strict";

  const EPS = 1e-12;
  const cidOf = obj => obj && (obj.parentTradeId || obj.chainId || obj.tradeChainId || null);

  function p9Num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
  function p9MarkerById(id){ return (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null; }
  function p9MarkerChainId(markerId){
    const m = p9MarkerById(markerId);
    if(cidOf(m)) return cidOf(m);
    const l = (Array.isArray(resultLinks) ? resultLinks.find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId) : null)
      || (Array.isArray(openLotLinks) ? openLotLinks.find(x => x.entryMarkerId === markerId) : null);
    return cidOf(l);
  }
  function p9MarkerSort(a,b){ return (p9Num(a.time)-p9Num(b.time)) || String(a.id||'').localeCompare(String(b.id||'')); }
  function p9LinkSort(a,b){ return (p9Num(a.exitTime)-p9Num(b.exitTime)) || (p9Num(a.entryTime)-p9Num(b.entryTime)) || String(a.id||'').localeCompare(String(b.id||'')); }

  function p9ApplyParentTradeIds(rec){
    if(!rec || !Array.isArray(rec.markers)) return rec;
    const markers = rec.markers;
    const links = Array.isArray(rec.links) ? rec.links : [];
    const open = Array.isArray(rec.openConnectors) ? rec.openConnectors : [];
    const byId = new Map(markers.map(m => [m.id,m]));

    // Normalize the already reconstructed state-transition chain into one explicit parentTradeId.
    // No screen position/proximity is used here.
    let seq = 1;
    const ensure = (seed) => seed || ('pt_' + (seq++));

    for(const l of links){
      const em = byId.get(l.entryMarkerId), xm = byId.get(l.exitMarkerId);
      const pid = ensure(cidOf(l) || cidOf(em) || cidOf(xm));
      l.parentTradeId = l.chainId = l.tradeChainId = pid;
      if(em) em.parentTradeId = em.chainId = em.tradeChainId = pid;
      if(xm) xm.parentTradeId = xm.chainId = xm.tradeChainId = pid;
    }
    for(const l of open){
      const em = byId.get(l.entryMarkerId);
      const pid = ensure(cidOf(l) || cidOf(em));
      l.parentTradeId = l.chainId = l.tradeChainId = pid;
      if(em) em.parentTradeId = em.chainId = em.tradeChainId = pid;
    }
    for(const m of markers){
      if(cidOf(m)){
        const pid = cidOf(m);
        m.parentTradeId = m.chainId = m.tradeChainId = pid;
      }
    }

    const groups = new Map();
    const group = pid => {
      if(!groups.has(pid)) groups.set(pid,{markers:[],links:[],open:[]});
      return groups.get(pid);
    };
    for(const m of markers){ const pid=cidOf(m); if(pid) group(pid).markers.push(m); }
    for(const l of links){ const pid=cidOf(l); if(pid) group(pid).links.push(l); }
    for(const l of open){ const pid=cidOf(l); if(pid) group(pid).open.push(l); }

    for(const [pid,g] of groups){
      const entries = g.markers.filter(m => m.role === 'entry').sort(p9MarkerSort);
      const closes = g.markers.filter(m => m.role === 'close' && !m.unresolved).sort(p9MarkerSort);
      const openStill = g.open && g.open.length;

      entries.forEach((m,i) => {
        const sh = String(m.side || '').toUpperCase() === 'SHORT' || String(m.rawSide || '').toUpperCase() === 'SELL';
        m.parentTradeId = m.chainId = m.tradeChainId = pid;
        m.letter = i === 0 ? (sh ? 'ES' : 'EL') : (sh ? 'S' : 'B');
      });

      const finalCloseId = openStill ? null : (closes.length ? closes[closes.length-1].id : null);
      closes.forEach(m => {
        m.parentTradeId = m.chainId = m.tradeChainId = pid;
        m.isFinalExit = !!finalCloseId && m.id === finalCloseId;
        m.letter = m.isFinalExit ? 'EX' : 'P';
        const exitLinks = g.links.filter(l => l.exitMarkerId === m.id);
        m.pnl = exitLinks.reduce((a,l) => a + p9Num(l.netPnl),0);
      });
      g.links.forEach(l => {
        const x = byId.get(l.exitMarkerId);
        l.parentTradeId = l.chainId = l.tradeChainId = pid;
        l.exitIsFinal = !!(x && x.isFinalExit);
      });
      g.open.forEach(l => { l.parentTradeId = l.chainId = l.tradeChainId = pid; });
    }

    return rec;
  }

  if(typeof reconstruct === 'function' && !window.__patch9ReconstructInstalled){
    window.__patch9ReconstructInstalled = true;
    const prevReconstruct = reconstruct;
    reconstruct = function(rows,symbol){
      return p9ApplyParentTradeIds(prevReconstruct(rows,symbol));
    };
  }

  function p9TradeRecord(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cidOf(m) === parentId).slice().sort(p9MarkerSort);
    const links = (resultLinks || []).filter(l => cidOf(l) === parentId).slice().sort(p9LinkSort);
    const openLinks = (openLotLinks || []).filter(l => cidOf(l) === parentId).slice().sort((a,b)=>(p9Num(a.entryTime)-p9Num(b.entryTime)));
    const entries = markers.filter(m => m.role === 'entry').sort(p9MarkerSort);
    const closes = markers.filter(m => m.role === 'close' && !m.unresolved).sort(p9MarkerSort);
    const partials = closes.filter(m => m.letter === 'P' || !m.isFinalExit);
    const finalExit = closes.find(m => m.letter === 'EX' || m.isFinalExit) || null;
    const total = links.reduce((a,l) => a + p9Num(l.netPnl),0);
    const partial = links.filter(l => {
      const x = p9MarkerById(l.exitMarkerId);
      return x && (x.letter === 'P' || (!x.isFinalExit && x.letter !== 'EX'));
    }).reduce((a,l) => a + p9Num(l.netPnl),0);
    const final = finalExit ? links.filter(l => l.exitMarkerId === finalExit.id).reduce((a,l) => a + p9Num(l.netPnl),0) : 0;
    const dir = entries[0] ? entries[0].side : (links[0] ? links[0].side : '');
    return {parentId,markers,links,openLinks,entries,closes,partials,finalExit,total,partial,final,dir};
  }

  function p9ContributionForEntry(rec,markerId){
    return rec.links.filter(l => l.entryMarkerId === markerId).reduce((a,l) => a + p9Num(l.netPnl),0);
  }
  function p9ExitPnl(markerId){
    return (resultLinks || []).filter(l => l.exitMarkerId === markerId).reduce((a,l) => a + p9Num(l.netPnl),0);
  }
  function p9CloseDisplayPnl(m){
    const pid = cidOf(m);
    const rec = p9TradeRecord(pid);
    if(!rec) return p9ExitPnl(m.id);
    if(m.letter === 'EX' || m.isFinalExit) return rec.total;
    return p9ExitPnl(m.id);
  }

  function p9TradeTooltipLines(parentId){
    const rec = p9TradeRecord(parentId);
    if(!rec) return null;
    const lines = [];
    lines.push('Parent trade');
    lines.push('Direction: ' + (rec.dir || '-'));

    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => {
        lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(p9ContributionForEntry(rec,m.id))}`);
      });
    }

    if(rec.partials.length){
      lines.push('Partials:');
      rec.partials.forEach(m => {
        lines.push(`${m.letter || 'P'} ${fq(m.qty)} | ${fm(p9ExitPnl(m.id))}`);
      });
    }

    if(rec.finalExit){
      lines.push('Final exit:');
      lines.push(`${rec.finalExit.letter || 'EX'} ${fq(rec.finalExit.qty)} | ${fm(rec.final)}`);
    }

    if(rec.openLinks.length){
      const current = candles && candles.length ? candles[candles.length-1].close : null;
      lines.push('Open lots:');
      rec.openLinks.forEach(l => {
        let floating = null;
        if(current != null){
          floating = String(l.side).toUpperCase() === 'SHORT'
            ? (p9Num(l.entryPrice) - p9Num(current)) * p9Num(l.qty)
            : (p9Num(current) - p9Num(l.entryPrice)) * p9Num(l.qty);
        }
        const m = p9MarkerById(l.entryMarkerId);
        lines.push(`${m ? m.letter : 'E'} ${fq(l.qty)} | ${floating == null ? '-' : fm(floating)}`);
      });
    }

    lines.push('Prior partial P/L: ' + fm(rec.partial));
    if(rec.finalExit) lines.push('Final exit P/L: ' + fm(rec.final));
    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  window.getExitEntryContributionLines = function(exitMarkerId){
    const parentId = p9MarkerChainId(exitMarkerId);
    const rec = p9TradeRecord(parentId);
    if(!rec) return [];
    return rec.entries.map(m => `${m.letter || 'E'} ${fq(m.qty)} | ${fm(p9ContributionForEntry(rec,m.id))}`);
  };

  // Isolate affects closed/history trade overlays only. Open position overlay and open links remain visible.
  const prevMarkerVisible = window.isMarkerVisibleInIsolate;
  window.isMarkerVisibleInIsolate = id => {
    if(openEntryMarkerIds && openEntryMarkerIds.has(id)) return true;
    return typeof prevMarkerVisible === 'function' ? prevMarkerVisible(id) : true;
  };
  window.isOpenLinkVisibleInIsolate = () => true;
  window.isOpenBoxVisibleInIsolate = () => true;

  // Deterministic hover: marker > box > line, and line hover never steals the marker tooltip.
  function p9DistSeg(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }
  hoverItem = function(){
    if(!mouse) return null;
    let bestMarker = null, bestD = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x, mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bestD){ bestD = d; bestMarker = it; }
    }
    if(bestMarker) return bestMarker;

    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }

    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      let nearMarker = false;
      for(const m of overlayHitItems || []){
        if(m.kind === 'marker' && Math.hypot(mouse.x-m.x,mouse.y-m.y) <= (m.radius || 8) + 13){ nearMarker = true; break; }
      }
      if(nearMarker) continue;
      if(p9DistSeg(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;

    if(it.kind === 'line'){
      tooltip(
        it.open
          ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side]
          : ['Matched lot link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],
        mouse.x, mouse.y
      );
      return;
    }

    if(it.kind === 'marker'){
      const pid = p9MarkerChainId(it.markerId);
      const tradeLines = p9TradeTooltipLines(pid);
      if(tradeLines && tradeLines.length){ tooltip(tradeLines,mouse.x,mouse.y); return; }
      const lines = [it.role === 'entry' ? (it.side === 'SHORT' ? 'Short entry/fill' : 'Long entry/fill') : 'Close/reduce fill','Size: ' + fq(it.qty) + ' BTC','Price: ' + p2(it.price),'Time: ' + ft(it.time)];
      tooltip(lines,mouse.x,mouse.y);
      return;
    }

    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.letter === 'B' ? 'Current open long' : 'Current open short','Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const openLines = typeof getOpenEntryContributionLines === 'function' ? getOpenEntryContributionLines() : [];
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  // Draw closed links with lots only; realized P/L labels are placed only on P/EX nodes.
  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const showP = tglPositions.checked;
    const showR = tglResults.checked;
    const showD = tglDollarValues.checked;
    const showLots = tglLots && tglLots.checked;
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    const closedW = getClosedLinkWidth();

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(showR){
      for(const l of resultLinks){
        if(l.symbol !== sym) continue;
        if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;
        const s = clipped(l,vis,mapX,mapY,slot);
        if(!s) continue;
        const col = Number(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
        ctx.strokeStyle = col;
        ctx.lineWidth = closedW;
        ctx.globalAlpha = .9;
        ctx.beginPath();
        ctx.moveTo(px(s.x1),px(s.y1));
        ctx.lineTo(px(s.x2),px(s.y2));
        ctx.stroke();
        ctx.globalAlpha = 1;
        overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cidOf(l),parentTradeId:cidOf(l)});
        if(showLots){
          lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
        }
      }

      for(const m of fillMarkers){
        if(m.symbol !== sym || !m.unresolved || !inTime(m.time,vis)) continue;
        if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
        const x = markerTimeX(m,vis,mapX,slot);
        if(x === null) continue;
        const y = mapY(m.price);
        ctx.save();
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(Math.max(clip.left,x-70)),px(y));
        ctx.lineTo(px(x),px(y));
        ctx.stroke();
        ctx.restore();
      }
    }

    for(const l of openLotLinks){
      if(l.symbol !== sym || !latest) continue;
      const liveLink = {...l, exitTime:latest.time, exitPrice:latest.close};
      const s = clipped(liveLink,vis,mapX,mapY,slot);
      if(!s) continue;
      const floating = liveLink.side === 'LONG'
        ? (latest.close - liveLink.entryPrice) * liveLink.qty
        : (liveLink.entryPrice - latest.close) * liveLink.qty;
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = closedW;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if(showLots){
        lineMiniLabel(fq(liveLink.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
      }
      overlayHitItems.push({kind:'line',...s,qty:liveLink.qty,side:liveLink.side,entryPrice:liveLink.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:liveLink.entryMarkerId,chainId:cidOf(liveLink),parentTradeId:cidOf(liveLink)});
    }

    for(const m of fillMarkers){
      if(m.symbol !== sym || !inTime(m.time,vis)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
      const isOpenEntry = openEntryMarkerIds.has(m.id);
      if(!showP && !isOpenEntry) continue;
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(m.price);
      let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
      if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
      circle(ix(x),ix(y),m.letter,col,m.unresolved);
      overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, m.letter.length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cidOf(m),parentTradeId:cidOf(m),note:m.note || ''});
      if(showR && showD && m.role === 'close' && !m.unresolved){
        const val = p9CloseDisplayPnl(m);
        const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
        pnlLabel(fm(val),x,y - 18,lblCol,clip);
      }
    }

    for(const b of openPositionBoxes){
      if(b.symbol !== sym || !latest) continue;
      const y = mapY(b.price);
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = timeX(latest.time,vis,mapX,slot);
      const liveY = mapY(latest.close);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)';
      const lineCol = 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,latest.close);
      const distance = b.letter === 'B' ? latest.close - Number(b.price) : Number(b.price) - latest.close;
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.side === 'SHORT' ? 'SHORT' : 'LONG';
      const topText = fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      const candleClearX = liveX + Math.max(slot*.75,18);
      let boxX = clamp(liveX + slot*5, clip.left+26, clip.left+clip.width-92);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      const boxGap = Math.max(26,ctx.measureText(boxText).width/2 + 12);
      const leftStop = clamp(boxX - boxGap, clip.left, clip.left+clip.width);
      const rightStart = clamp(boxX + boxGap, clip.left, clip.left+clip.width);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftStop - 2){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftStop),px(y)); }
      if(rightStart < lineRight - 2){ ctx.moveTo(px(rightStart),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111';
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      if(liveY >= clip.top && liveY <= clip.top + clip.height){
        ctx.save();
        ctx.strokeStyle = floating >= 0 ? 'rgba(30,136,229,.36)' : 'rgba(246,70,93,.36)';
        ctx.lineWidth = closedW;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(boxX),px(y));
        ctx.lineTo(px(liveX),px(liveY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:16,qty:b.qty,price:b.price,boxData:b,chainId:cidOf(b),parentTradeId:cidOf(b)});
    }

    ctx.restore();
  };
})();

(() => {
  "use strict";

  const EPS10 = 1e-12;
  const p10Cid = obj => obj && (obj.parentTradeId || obj.chainId || obj.tradeChainId || null);
  const p10Num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const p10SortMarker = (a,b) => (p10Num(a.time)-p10Num(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const p10SortLink = (a,b) => (p10Num(a.exitTime)-p10Num(b.exitTime)) || (p10Num(a.entryTime)-p10Num(b.entryTime)) || String(a.id||'').localeCompare(String(b.id||''));
  const p10Marker = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;

  function p10CandleCenterX(t,vis,mapX){
    if(!Array.isArray(vis) || !vis.length) return null;
    const tv = p10Num(t);
    if(!isFinite(tv)) return null;
    const sec = ivSec();
    for(let i=0;i<vis.length;i++){
      const ct = p10Num(vis[i].time);
      if(tv >= ct && tv < ct + sec) return mapX(i);
    }
    const last = vis[vis.length-1];
    if(tv === p10Num(last.time) + sec) return mapX(vis.length-1);
    return null;
  }

  // Transaction marker placement: always use the candle centerline that hosts the transaction time.
  window.markerTimeX = function(m,vis,mapX,slot){
    const t = p10Num(m && (m.candleTime || m.time));
    const x = p10CandleCenterX(t,vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(t,vis,mapX,slot) : null;
  };

  function p10GroupKeyForClose(m){
    if(!m) return '';
    const cid = p10Cid(m) || '';
    const type = (m.letter === 'EX' || m.isFinalExit) ? 'EX' : 'P';
    const oid = m.orderId != null ? String(m.orderId) : '';
    const tid = m.tradeId != null ? String(m.tradeId) : '';
    const t = String(m.time || '');
    const p = String(m.price || '');
    // Prefer order/time grouping; this merges fragments/fills belonging to the same visual exit event.
    return [cid,type,oid || tid || t,t,p].join('|');
  }

  function p10TradeRecord(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => p10Cid(m) === parentId).slice().sort(p10SortMarker);
    const links = (resultLinks || []).filter(l => p10Cid(l) === parentId).slice().sort(p10SortLink);
    const entries = markers.filter(m => m.role === 'entry').sort(p10SortMarker);
    const closes = markers.filter(m => m.role === 'close' && !m.unresolved).sort(p10SortMarker);
    const exitGroups = [];
    const gmap = new Map();

    for(const m of closes){
      const type = (m.letter === 'EX' || m.isFinalExit) ? 'EX' : 'P';
      const key = p10GroupKeyForClose(m);
      if(!gmap.has(key)){
        gmap.set(key,{key,type,markers:[],qty:0,pnl:0,time:p10Num(m.time),price:p10Num(m.price),marker:m});
        exitGroups.push(gmap.get(key));
      }
      const g = gmap.get(key);
      g.markers.push(m);
      g.qty += Math.abs(p10Num(m.qty));
      if(p10Num(m.time) < g.time){ g.time = p10Num(m.time); g.marker = m; }
    }

    for(const g of exitGroups){
      const ids = new Set(g.markers.map(m => m.id));
      g.pnl = links.filter(l => ids.has(l.exitMarkerId)).reduce((a,l) => a + p10Num(l.netPnl),0);
    }

    exitGroups.sort((a,b) => (a.time-b.time) || (a.type === b.type ? 0 : (a.type === 'P' ? -1 : 1)));
    const total = exitGroups.reduce((a,g) => a + p10Num(g.pnl),0);
    const dir = entries[0] ? entries[0].side : (links[0] ? links[0].side : '');
    return {parentId,markers,links,entries,closes,exitGroups,total,dir};
  }

  function p10ContributionForEntry(rec,entryId){
    return rec.links.filter(l => l.entryMarkerId === entryId).reduce((a,l) => a + p10Num(l.netPnl),0);
  }

  function p10ExitGroupForMarker(m){
    const rec = p10TradeRecord(p10Cid(m));
    if(!rec) return null;
    const key = p10GroupKeyForClose(m);
    return rec.exitGroups.find(g => g.key === key) || null;
  }

  function p10MarkerChainId(markerId){
    const m = p10Marker(markerId);
    if(p10Cid(m)) return p10Cid(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return p10Cid(l);
  }

  function p10TradeTooltipLines(parentId){
    const rec = p10TradeRecord(parentId);
    if(!rec) return [];
    const lines = [];
    lines.push('Parent trade');
    lines.push('Direction: ' + (rec.dir || '-'));

    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => {
        lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(p10ContributionForEntry(rec,m.id))}`);
      });
    }

    if(rec.exitGroups.length){
      lines.push('Exits:');
      rec.exitGroups.forEach(g => {
        lines.push(`${g.type} ${fq(g.qty)} | ${fm(g.pnl)}`);
      });
    }

    const openLinks = (openLotLinks || []).filter(l => p10Cid(l) === parentId).slice().sort((a,b)=>(p10Num(a.entryTime)-p10Num(b.entryTime)));
    if(openLinks.length){
      const current = candles && candles.length ? candles[candles.length-1].close : null;
      lines.push('Open lots:');
      openLinks.forEach(l => {
        let floating = null;
        if(current != null){
          floating = String(l.side).toUpperCase() === 'SHORT'
            ? (p10Num(l.entryPrice) - p10Num(current)) * p10Num(l.qty)
            : (p10Num(current) - p10Num(l.entryPrice)) * p10Num(l.qty);
        }
        const m = p10Marker(l.entryMarkerId);
        lines.push(`${m ? m.letter : 'E'} ${fq(l.qty)} | ${floating == null ? '-' : fm(floating)}`);
      });
    }

    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  window.getExitEntryContributionLines = function(exitMarkerId){
    const parentId = p10MarkerChainId(exitMarkerId);
    const rec = p10TradeRecord(parentId);
    if(!rec) return [];
    return rec.entries.map(m => `${m.letter || 'E'} ${fq(m.qty)} | ${fm(p10ContributionForEntry(rec,m.id))}`);
  };

  function p10PairLinks(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = p10Marker(l.entryMarkerId);
      const xm = p10Marker(l.exitMarkerId);
      if(!em || !xm) continue;
      const xKey = p10GroupKeyForClose(xm);
      const key = [p10Cid(l)||p10Cid(em)||p10Cid(xm), l.entryMarkerId, xKey].join('|');
      if(!groups.has(key)){
        groups.set(key,{...l, qty:0, netPnl:0, grossPnl:0, realizedPnl:0, fees:0, entryMarkerId:l.entryMarkerId, exitMarkerId:xm.id, exitEventKey:xKey});
      }
      const g = groups.get(key);
      g.qty += p10Num(l.qty);
      g.netPnl += p10Num(l.netPnl);
      g.grossPnl += p10Num(l.grossPnl);
      g.realizedPnl += p10Num(l.realizedPnl);
      g.fees += p10Num(l.fees);
    }
    return [...groups.values()];
  }

  function p10SegmentFromMarkers(l,vis,mapX,mapY){
    const em = p10Marker(l.entryMarkerId);
    const xm = p10Marker(l.exitMarkerId);
    if(!em || !xm) return null;
    const x1 = markerTimeX(em,vis,mapX,0);
    const x2 = markerTimeX(xm,vis,mapX,0);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(em.price),x2,y2:mapY(xm.price)};
  }

  function p10DistSeg(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let bestMarker = null, bestD = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x, mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bestD){ bestD = d; bestMarker = it; }
    }
    if(bestMarker) return bestMarker;
    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }
    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      let nearMarker = false;
      for(const m of overlayHitItems || []){
        if(m.kind === 'marker' && Math.hypot(mouse.x-m.x,mouse.y-m.y) <= (m.radius || 8) + 13){ nearMarker = true; break; }
      }
      if(nearMarker) continue;
      if(p10DistSeg(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'line'){
      tooltip(
        it.open
          ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side]
          : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],
        mouse.x,mouse.y
      );
      return;
    }
    if(it.kind === 'marker'){
      const lines = p10TradeTooltipLines(p10MarkerChainId(it.markerId));
      if(lines.length){ tooltip(lines,mouse.x,mouse.y); return; }
      tooltip([it.role === 'entry' ? 'Entry/fill' : 'Exit/reduce','Size: ' + fq(it.qty) + ' BTC','Price: ' + p2(it.price),'Time: ' + ft(it.time)],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.letter === 'B' ? 'Current open long' : 'Current open short','Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const openLines = typeof getOpenEntryContributionLines === 'function' ? getOpenEntryContributionLines() : [];
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  function p10InstallVolumeHandle(){
    const canvasEl = document.getElementById('chart');
    if(!canvasEl) return null;
    let wrap = canvasEl.parentElement && canvasEl.parentElement.classList.contains('chart-wrap') ? canvasEl.parentElement : null;
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'chart-wrap';
      canvasEl.parentNode.insertBefore(wrap,canvasEl);
      wrap.appendChild(canvasEl);
    }
    let h = document.getElementById('volumeResizeHandle');
    if(!h){
      h = document.createElement('div');
      h.id = 'volumeResizeHandle';
      wrap.appendChild(h);
      let dragging = false;
      h.addEventListener('mousedown',e => { dragging = true; e.preventDefault(); e.stopPropagation(); }, true);
      document.addEventListener('mousemove',e => {
        if(!dragging) return;
        const r = canvasEl.getBoundingClientRect();
        const y = e.clientY - r.top;
        const top = 18, bottom = 42, gap = 20;
        const usable = Math.max(120,r.height - top - bottom - gap);
        const priceH = Math.max(120,Math.min(usable-45,y-top));
        const volFrac = Math.max(.10,Math.min(.45,1 - (priceH / usable)));
        window.__p10VolumeFrac = volFrac;
        localStorage.setItem('v13_ui_v2_volume_frac',String(volFrac));
        if(typeof draw === 'function') draw();
      }, true);
      document.addEventListener('mouseup',() => { dragging = false; }, true);
    }
    return h;
  }

  function p10FormatAxisDate(ms){
    const d = new Date(ms);
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  }

  const storedFrac = Number(localStorage.getItem('v13_ui_v2_volume_frac'));
  window.__p10VolumeFrac = isFinite(storedFrac) && storedFrac > 0 ? storedFrac : (window.__p10VolumeFrac || .22);
  p10InstallVolumeHandle();

  const prevMetrics = typeof metrics === 'function' ? metrics : null;
  if(prevMetrics && !window.__patch10MetricsInstalled){
    window.__patch10MetricsInstalled = true;
    metrics = function(c){
      prevMetrics(c);
      try{
        const vw = vwap && vwap.length ? Number(vwap[vwap.length-1].value) : NaN;
        const cur = c && isFinite(Number(c.close)) ? Number(c.close) : (dailyState && isFinite(Number(dailyState.close)) ? Number(dailyState.close) : (candles.length ? Number(candles[candles.length-1].close) : NaN));
        if(mVWAP){
          if(isFinite(vw) && isFinite(cur)) mVWAP.style.color = vw > cur ? '#991b1b' : '#047857';
          else mVWAP.style.color = css('--text');
        }
      }catch(e){}
    };
  }

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const showP = tglPositions.checked;
    const showR = tglResults.checked;
    const showD = tglDollarValues.checked;
    const showLots = tglLots && tglLots.checked;
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    const closedW = getClosedLinkWidth();

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(showR){
      for(const l of p10PairLinks()){
        if(l.symbol !== sym) continue;
        if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;
        const s = p10SegmentFromMarkers(l,vis,mapX,mapY);
        if(!s) continue;
        const col = Number(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
        ctx.strokeStyle = col;
        ctx.lineWidth = closedW;
        ctx.globalAlpha = .86;
        ctx.beginPath();
        ctx.moveTo(px(s.x1),px(s.y1));
        ctx.lineTo(px(s.x2),px(s.y2));
        ctx.stroke();
        ctx.globalAlpha = 1;
        overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:p10Cid(l),parentTradeId:p10Cid(l)});
        if(showLots){
          lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
        }
      }
    }

    for(const l of openLotLinks){
      if(l.symbol !== sym || !latest) continue;
      const em = p10Marker(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : p10CandleCenterX(l.entryTime,vis,mapX);
      const x2 = p10CandleCenterX(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const s = {x1,y1:mapY(l.entryPrice),x2,y2:mapY(latest.close)};
      const floating = String(l.side).toUpperCase() === 'LONG'
        ? (latest.close - l.entryPrice) * l.qty
        : (l.entryPrice - latest.close) * l.qty;
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = closedW;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if(showLots){ lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip); }
      overlayHitItems.push({kind:'line',...s,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:p10Cid(l),parentTradeId:p10Cid(l)});
    }

    const drawnExitLabels = new Set();
    for(const m of fillMarkers){
      if(m.symbol !== sym || !inTime(m.time,vis)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
      const isOpenEntry = openEntryMarkerIds.has(m.id);
      if(!showP && !isOpenEntry) continue;
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(m.price);
      let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
      if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
      circle(ix(x),ix(y),m.letter,col,m.unresolved);
      overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, m.letter.length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:p10Cid(m),parentTradeId:p10Cid(m),note:m.note || ''});
      if(showR && showD && m.role === 'close' && !m.unresolved){
        const g = p10ExitGroupForMarker(m);
        const key = g ? g.key : m.id;
        if(!drawnExitLabels.has(key)){
          drawnExitLabels.add(key);
          const val = g ? g.pnl : p10Num(m.pnl);
          const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
          pnlLabel(fm(val),x,y - 18,lblCol,clip);
        }
      }
    }

    for(const b of openPositionBoxes){
      if(b.symbol !== sym || !latest) continue;
      const y = mapY(b.price);
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = p10CandleCenterX(latest.time,vis,mapX);
      const liveY = mapY(latest.close);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)';
      const lineCol = 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,latest.close);
      const distance = b.letter === 'B' ? latest.close - Number(b.price) : Number(b.price) - latest.close;
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.side === 'SHORT' ? 'SHORT' : 'LONG';
      const topText = fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      const candleClearX = liveX + Math.max(slot*.75,18);
      let boxX = clamp(liveX + slot*5, clip.left+26, clip.left+clip.width-92);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      const boxGap = Math.max(26,ctx.measureText(boxText).width/2 + 12);
      const leftStop = clamp(boxX - boxGap, clip.left, clip.left+clip.width);
      const rightStart = clamp(boxX + boxGap, clip.left, clip.left+clip.width);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftStop - 2){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftStop),px(y)); }
      if(rightStart < lineRight - 2){ ctx.moveTo(px(rightStart),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111';
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      if(liveY >= clip.top && liveY <= clip.top + clip.height){
        ctx.save();
        ctx.strokeStyle = floating >= 0 ? 'rgba(30,136,229,.36)' : 'rgba(246,70,93,.36)';
        ctx.lineWidth = closedW;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(boxX),px(y));
        ctx.lineTo(px(liveX),px(liveY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:16,qty:b.qty,price:b.price,boxData:b,chainId:p10Cid(b),parentTradeId:p10Cid(b)});
    }

    ctx.restore();
  };

  draw = function(){
    const handle = p10InstallVolumeHandle();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    overlayHitItems = [];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,w,h);
    const r = range();
    const vis = candles.slice(r.start,r.end);
    const future = r.futureBars;
    const total = Math.max(2,vis.length + future);
    olderIfNeeded(r);
    if(vis.length < 2){ ctx.fillStyle = '#1e2329'; ctx.font = '14px Arial'; ctx.fillText('Loading...',20,30); return; }

    const left = LEFT_PAD;
    const right = RIGHT_AXIS;
    /* PATCH_35: reclaim header-text vertical space for chart area. */
    const top = 8;
    const bottom = 42;
    const gap = 20;
    const usable = Math.max(120,h-top-bottom-gap);
    const volFrac = Math.max(.10,Math.min(.45,window.__p10VolumeFrac || .22));
    const volH = Math.max(38,Math.floor(usable * volFrac));
    const priceH = Math.max(120,usable - volH);
    const volTop = top + priceH + gap;
    const chartW = w - left - right;
    if(handle){ handle.style.top = (volTop - 5) + 'px'; handle.style.right = right + 'px'; }

    const yr = yRange(vis);
    const minP = yr.min;
    const maxP = yr.max;
    lastYMin = minP; lastYMax = maxP; lastRange = maxP - minP; lastAreaH = priceH;
    const maxVol = Math.max(...vis.map(c => c.volume),1);
    const slot = chartW / total;
    const candleW = Math.max(2,Math.min(13,slot*.68));
    const mapX = i => left + i*slot + slot/2;
    const mapY = p => top + ((maxP-p)/(maxP-minP))*priceH;
    const mapV = v => volTop + volH - (v/maxVol)*volH;
    const clip = {left,top,width:chartW,height:priceH};
    const latest = vis[vis.length-1];
    const latestY = mapY(latest.close);

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(w-right,top,right,priceH);
    ctx.strokeStyle = '#d9dce1';
    ctx.beginPath(); ctx.moveTo(w-right,top); ctx.lineTo(w-right,h-bottom); ctx.stroke();
    ctx.font = '12px Arial'; ctx.lineWidth = hairline();

    for(let i=0;i<=6;i++){
      const y = px(top + priceH*i/6);
      const p = maxP - (maxP-minP)*i/6;
      ctx.strokeStyle = '#edf0f2'; ctx.beginPath(); ctx.moveTo(px(left),y); ctx.lineTo(px(w-right),y); ctx.stroke();
      ctx.fillStyle = '#707a8a'; ctx.fillText(ip(p),w-right+8,y+4);
    }
    for(let i=0;i<=5;i++){
      const x = px(left + chartW*i/5);
      ctx.strokeStyle = '#f4f5f7'; ctx.beginPath(); ctx.moveTo(x,px(top)); ctx.lineTo(x,px(h-bottom)); ctx.stroke();
    }
    ctx.strokeStyle = '#edf0f2'; ctx.beginPath(); ctx.moveTo(px(left),px(volTop)); ctx.lineTo(px(w-right),px(volTop)); ctx.stroke();

    ctx.save(); ctx.beginPath(); ctx.rect(left,top,chartW,priceH); ctx.clip();
    for(let i=0;i<vis.length;i++){
      const c = vis[i], x = mapX(i), bull = c.close >= c.open;
      const body = bull ? css('--candle-up-body') : css('--candle-down-body');
      const border = bull ? css('--candle-up-border') : css('--candle-down-border');
      const wick = bull ? css('--candle-up-wick') : css('--candle-down-wick');
      const oy = mapY(c.open), cy = mapY(c.close), hy = mapY(c.high), ly = mapY(c.low);
      const wickX = px(x);
      ctx.strokeStyle = wick; ctx.lineWidth = hairline(); ctx.beginPath(); ctx.moveTo(wickX,px(hy)); ctx.lineTo(wickX,px(ly)); ctx.stroke();
      const bt = ix(Math.min(oy,cy)); const bh = Math.max(1,ix(Math.abs(oy-cy))); const bw = Math.max(2,ix(candleW)); const bx = ix(x - bw/2);
      ctx.fillStyle = body; ctx.strokeStyle = border; ctx.lineWidth = hairline(); ctx.fillRect(ix(bx),ix(bt),bw,bh); ctx.strokeRect(px(bx),px(bt),bw,bh);
    }

    const im = idxMap(vis);
    if(tglEMA20.checked) drawInd(ema20,vis,im,mapX,mapY,getIndicatorStroke('ema1','#3b82f6'),2);
    if(tglEMA50.checked) drawInd(ema50,vis,im,mapX,mapY,getIndicatorStroke('ema2','#a855f7'),2);
    if(tglEMA3 && tglEMA3.checked) drawInd(ema3,vis,im,mapX,mapY,getIndicatorStroke('ema3','#14b8a6'),2);
    if(tglVWAP.checked) drawInd(vwap,vis,im,mapX,mapY,getIndicatorStroke('vwap','#f59e0b'),2);

    tradeOverlays(vis,mapX,mapY,slot,clip);
    /* PATCH_37F: single current-price dashed line is owned by drawCountdown(). */
    ctx.restore();

    /* PATCH_37C: current price is drawn only in the shared right-axis price/countdown box. */

    for(let i=0;i<vis.length;i++){
      const c = vis[i], x = mapX(i), y = mapV(c.volume), bull = c.close >= c.open;
      ctx.fillStyle = bull ? 'rgba(95,95,95,.42)' : 'rgba(122,122,122,.58)';
      ctx.fillRect(ix(x-candleW/2),ix(y),Math.max(2,ix(candleW)),Math.max(1,ix(volTop+volH-y)));
    }

    /* PATCH_35: remove on-chart header text line. */
    ctx.fillStyle = '#707a8a'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
    for(let i=0;i<=4;i++){
      const idx = Math.floor((vis.length-1)*i/4);
      const c = vis[idx]; const x = mapX(idx);
      ctx.fillText(formatTimeOnly(c.time*1000),x,h-24);
      ctx.fillText(p10FormatAxisDate(c.time*1000),x,h-10);
    }
    ctx.textAlign = 'left';

    if(loadingOlder){
      ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fillRect(left+10,top+10,150,28);
      ctx.strokeStyle = '#d9dce1'; ctx.strokeRect(left+10,top+10,150,28);
      ctx.fillStyle = '#707a8a'; ctx.font = '12px Arial'; ctx.fillText('Loading older candles...',left+20,top+29);
    }

    if(mouse){
      ctx.strokeStyle = 'rgba(112,122,138,.38)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mouse.x,top); ctx.lineTo(mouse.x,h-bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left,mouse.y); ctx.lineTo(w-right,mouse.y); ctx.stroke();
      if(mouse.x >= left && mouse.x <= w-right && mouse.y >= top && mouse.y <= top+priceH){
        const cursorPrice = maxP - ((mouse.y-top)/priceH) * (maxP-minP);
        const txt = ip(cursorPrice); const tw = ctx.measureText(txt).width + 10; const tx = w-right-tw-4; const ty = mouse.y-10;
        ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = '#d9dce1'; ctx.fillRect(tx,ty,tw,18); ctx.strokeRect(tx,ty,tw,18);
        ctx.fillStyle = '#111'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt,tx+tw/2,ty+9); ctx.restore();
        /* PATCH_35: passive expected P/L label under right-axis cursor price marker. */
        const tglFloat = document.getElementById("tglFloatingPL");
        const floatOn = !tglFloat || !!tglFloat.checked;
        const hasOpen = Array.isArray(openPositionBoxes) && openPositionBoxes.length > 0;
        const exp = floatOn && hasOpen && Number.isFinite(cursorPrice) && typeof openBoxesFloating === "function"
          ? openBoxesFloating(cursorPrice)
          : null;
        if(floatOn && hasOpen && Number.isFinite(exp)){
          const line = "Expected P/L: " + fm(exp);
          const pw = Math.max(tw,ctx.measureText(line).width + 10);
          const pxBox = w-right-pw-4;
          const pyBox = ty + 20;
          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,.96)';
          ctx.strokeStyle = '#d9dce1';
          ctx.fillRect(pxBox,pyBox,pw,18);
          ctx.strokeRect(pxBox,pyBox,pw,18);
          ctx.fillStyle = exp > 0 ? '#047857' : exp < 0 ? '#b91c1c' : '#111';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(line,pxBox+pw/2,pyBox+9);
          ctx.restore();
        }
      }
      const idx = Math.floor((mouse.x-left)/slot);
      if(idx >= 0 && idx < vis.length) candleTip(vis[idx]);
      drawHoverTooltip();
    }
  };

  try{ if(typeof draw === 'function') draw(); }catch(e){}
})();

(() => {
  "use strict";

  const p11Num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const p11Cid = obj => obj && (obj.parentTradeId || obj.chainId || obj.tradeChainId || null);
  const p11SortMarker = (a,b) => (p11Num(a.time)-p11Num(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const p11Marker = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const p11SideDir = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';

  function p11CloseEventKey(m){
    if(!m) return '';
    const cid = p11Cid(m) || '';
    const oid = m.orderId != null ? String(m.orderId) : '';
    const tid = m.tradeId != null ? String(m.tradeId) : '';
    const t = String(m.time || '');
    const p = String(m.price || '');
    // Event identity. Do not include P/EX type here; type is assigned after chronological grouping.
    return [cid, oid || tid || t, t, p].join('|');
  }

  function p11ChainIdFromMarker(markerId){
    const m = p11Marker(markerId);
    if(p11Cid(m)) return p11Cid(m);
    const l = (Array.isArray(resultLinks) ? resultLinks.find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId) : null)
      || (Array.isArray(openLotLinks) ? openLotLinks.find(x => x.entryMarkerId === markerId) : null);
    return p11Cid(l);
  }

  function p11TradeRecord(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => p11Cid(m) === parentId).slice().sort(p11SortMarker);
    const links = (resultLinks || []).filter(l => p11Cid(l) === parentId).slice();
    const openLinks = (openLotLinks || []).filter(l => p11Cid(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(p11SortMarker);
    const closes = markers.filter(m => m.role === 'close' && !m.unresolved).sort(p11SortMarker);

    // Build actual close events first, then classify the last closed event as EX only if no live remainder exists.
    const gmap = new Map();
    const exitGroups = [];
    for(const m of closes){
      const key = p11CloseEventKey(m);
      if(!gmap.has(key)){
        const g = {key, type:'P', markers:[], qty:0, pnl:0, time:p11Num(m.time), price:p11Num(m.price), marker:m};
        gmap.set(key,g);
        exitGroups.push(g);
      }
      const g = gmap.get(key);
      g.markers.push(m);
      g.qty += Math.abs(p11Num(m.qty));
      if(p11Num(m.time) < g.time){ g.time = p11Num(m.time); g.marker = m; g.price = p11Num(m.price); }
    }
    exitGroups.sort((a,b) => (a.time-b.time) || String(a.key).localeCompare(String(b.key)));

    const tradeClosed = exitGroups.length > 0 && openLinks.length === 0;
    if(tradeClosed){
      exitGroups.forEach((g,i) => { g.type = i === exitGroups.length - 1 ? 'EX' : 'P'; });
    }else{
      exitGroups.forEach(g => { g.type = 'P'; });
    }

    for(const g of exitGroups){
      const exitIds = new Set(g.markers.map(m => m.id));
      g.pnl = links.filter(l => exitIds.has(l.exitMarkerId)).reduce((a,l) => a + p11Num(l.netPnl),0);
      // Stabilize marker role/letter from event classification. EX is final remaining exit, never a partial.
      for(const m of g.markers){
        m.isFinalExit = g.type === 'EX';
        m.letter = g.type;
        m.pnl = g.pnl;
      }
    }

    const dir = entries[0] ? p11SideDir(entries[0].side) : (links[0] ? p11SideDir(links[0].side) : '');
    const total = exitGroups.reduce((a,g) => a + p11Num(g.pnl),0);
    return {parentId,markers,links,openLinks,entries,closes,exitGroups,total,dir,tradeClosed};
  }

  function p11ContributionForEntry(rec,entryId){
    return rec.links.filter(l => l.entryMarkerId === entryId).reduce((a,l) => a + p11Num(l.netPnl),0);
  }

  function p11ExitGroupForMarker(m){
    const rec = p11TradeRecord(p11Cid(m));
    if(!rec) return null;
    const key = p11CloseEventKey(m);
    return rec.exitGroups.find(g => g.key === key) || null;
  }

  function p11TradeTooltipLines(parentId){
    const rec = p11TradeRecord(parentId);
    if(!rec) return [];
    const lines = [];
    lines.push('Parent trade');
    lines.push('Direction: ' + (rec.dir || '-'));

    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => {
        lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(p11ContributionForEntry(rec,m.id))}`);
      });
    }

    if(rec.exitGroups.length){
      lines.push('Exits:');
      rec.exitGroups.forEach(g => {
        // P rows only for real partial close events. EX is the final remaining exit only.
        lines.push(`${g.type} ${fq(g.qty)} | ${fm(g.pnl)}`);
      });
    }

    if(rec.openLinks.length){
      const current = candles && candles.length ? candles[candles.length-1].close : null;
      lines.push('Open lots:');
      rec.openLinks.sort((a,b)=>(p11Num(a.entryTime)-p11Num(b.entryTime))).forEach(l => {
        let floating = null;
        if(current != null){
          floating = p11SideDir(l.side) === 'SHORT'
            ? (p11Num(l.entryPrice) - p11Num(current)) * p11Num(l.qty)
            : (p11Num(current) - p11Num(l.entryPrice)) * p11Num(l.qty);
        }
        const m = p11Marker(l.entryMarkerId);
        lines.push(`${m ? m.letter : 'E'} ${fq(l.qty)} | ${floating == null ? '-' : fm(floating)}`);
      });
    }

    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  window.getExitEntryContributionLines = function(exitMarkerId){
    const parentId = p11ChainIdFromMarker(exitMarkerId);
    const rec = p11TradeRecord(parentId);
    if(!rec) return [];
    return rec.entries.map(m => `${m.letter || 'E'} ${fq(m.qty)} | ${fm(p11ContributionForEntry(rec,m.id))}`);
  };

  function p11CandleCenterX(t,vis,mapX){
    if(!Array.isArray(vis) || !vis.length) return null;
    const tv = p11Num(t);
    const sec = typeof ivSec === 'function' ? ivSec() : 0;
    for(let i=0;i<vis.length;i++){
      const ct = p11Num(vis[i].time);
      if(tv >= ct && tv < ct + sec) return mapX(i);
    }
    const last = vis[vis.length-1];
    if(sec && tv === p11Num(last.time) + sec) return mapX(vis.length-1);
    return null;
  }

  window.markerTimeX = function(m,vis,mapX,slot){
    const t = p11Num(m && (m.candleTime || m.time));
    const x = p11CandleCenterX(t,vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(t,vis,mapX,slot) : null;
  };

  function p11PairLinks(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = p11Marker(l.entryMarkerId);
      const xm = p11Marker(l.exitMarkerId);
      if(!em || !xm) continue;
      const xKey = p11CloseEventKey(xm);
      const key = [p11Cid(l)||p11Cid(em)||p11Cid(xm), l.entryMarkerId, xKey].join('|');
      if(!groups.has(key)){
        groups.set(key,{...l, qty:0, netPnl:0, grossPnl:0, realizedPnl:0, fees:0, entryMarkerId:l.entryMarkerId, exitMarkerId:xm.id, exitEventKey:xKey});
      }
      const g = groups.get(key);
      g.qty += p11Num(l.qty);
      g.netPnl += p11Num(l.netPnl);
      g.grossPnl += p11Num(l.grossPnl);
      g.realizedPnl += p11Num(l.realizedPnl);
      g.fees += p11Num(l.fees);
    }
    return [...groups.values()];
  }

  function p11SegmentFromMarkers(l,vis,mapX,mapY){
    const em = p11Marker(l.entryMarkerId);
    const xm = p11Marker(l.exitMarkerId);
    if(!em || !xm) return null;
    const x1 = markerTimeX(em,vis,mapX,0);
    const x2 = markerTimeX(xm,vis,mapX,0);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(em.price),x2,y2:mapY(xm.price)};
  }

  const prevHoverItem11 = typeof hoverItem === 'function' ? hoverItem : null;
  drawHoverTooltip = function(){
    const it = prevHoverItem11 ? prevHoverItem11() : null;
    if(!it || !mouse) return;
    if(it.kind === 'line'){
      tooltip(
        it.open
          ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side]
          : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],
        mouse.x,mouse.y
      );
      return;
    }
    if(it.kind === 'marker'){
      const lines = p11TradeTooltipLines(p11ChainIdFromMarker(it.markerId));
      if(lines.length){ tooltip(lines,mouse.x,mouse.y); return; }
      tooltip([it.role === 'entry' ? 'Entry/fill' : 'Exit','Size: ' + fq(it.qty) + ' BTC','Price: ' + p2(it.price),'Time: ' + ft(it.time)],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.letter === 'B' ? 'Current open long' : 'Current open short','Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const openLines = typeof getOpenEntryContributionLines === 'function' ? getOpenEntryContributionLines() : [];
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  function p11FormatAxisDate(ms){
    const d = new Date(ms);
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  }

  /* PATCH_35: expected open-position P/L at cursor price (UI-only). */
  function p11ExpectedPlAtPrice(cursorPrice){
    if(!Number.isFinite(Number(cursorPrice))) return null;
    if(!Array.isArray(openPositionBoxes) || !openPositionBoxes.length) return null;
    if(typeof openBoxesFloating === "function") return openBoxesFloating(Number(cursorPrice));
    let total = 0;
    let has = false;
    for(const b of openPositionBoxes){
      const v = typeof openBoxFloating === "function" ? openBoxFloating(b,Number(cursorPrice)) : null;
      if(Number.isFinite(v)){ total += v; has = true; }
    }
    return has ? total : null;
  }

  // Trade overlay override: P/EX dollar values only; EX is final remaining exit only.
  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const showP = tglPositions.checked;
    const showR = tglResults.checked;
    const showD = tglDollarValues.checked;
    const showLots = tglLots && tglLots.checked;
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    const closedW = getClosedLinkWidth();
    const openChainIds35 = new Set((openLotLinks || []).filter(l => l && l.symbol === sym).map(l => p11Cid(l)).filter(Boolean));

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(showR){
      for(const l of p11PairLinks()){
        if(l.symbol !== sym) continue;
        if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;
        const s = p11SegmentFromMarkers(l,vis,mapX,mapY);
        if(!s) continue;
        const col = Number(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
        ctx.strokeStyle = col;
        ctx.lineWidth = closedW;
        ctx.globalAlpha = .86;
        ctx.beginPath();
        ctx.moveTo(px(s.x1),px(s.y1));
        ctx.lineTo(px(s.x2),px(s.y2));
        ctx.stroke();
        ctx.globalAlpha = 1;
        overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:p11Cid(l),parentTradeId:p11Cid(l)});
        if(showLots) lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
      }
    }

    for(const l of openLotLinks){
      if(l.symbol !== sym || !latest) continue;
      const em = p11Marker(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : p11CandleCenterX(l.entryTime,vis,mapX);
      const x2 = p11CandleCenterX(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const s = {x1,y1:mapY(l.entryPrice),x2,y2:mapY(latest.close)};
      const floating = p11SideDir(l.side) === 'LONG'
        ? (latest.close - l.entryPrice) * l.qty
        : (l.entryPrice - latest.close) * l.qty;
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = closedW;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if(showLots) lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
      overlayHitItems.push({kind:'line',...s,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:p11Cid(l),parentTradeId:p11Cid(l)});
    }

    const drawnExitLabels = new Set();
    for(const m of fillMarkers){
      if(m.symbol !== sym || !inTime(m.time,vis)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
      const isOpenEntry = openEntryMarkerIds.has(m.id);
      if(!showP && !isOpenEntry) continue;
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(m.price);
      if(m.role === 'close' && openChainIds35.has(p11Cid(m))){
        /* PATCH_35: open parent-trade closes are partials only, never EX. */
        m.letter = 'P';
        m.isFinalExit = false;
      }
      let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
      if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
      circle(ix(x),ix(y),m.letter,col,m.unresolved);
      overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:p11Cid(m),parentTradeId:p11Cid(m),note:m.note || ''});
      if(showR && showD && m.role === 'close' && !m.unresolved){
        const g = p11ExitGroupForMarker(m);
        const key = g ? g.key : m.id;
        if(!drawnExitLabels.has(key)){
          drawnExitLabels.add(key);
          const val = g ? g.pnl : p11Num(m.pnl);
          const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
          pnlLabel(fm(val),x,y - 18,lblCol,clip);
        }
      }else if(showD && m.role === 'close' && !m.unresolved && openChainIds35.has(p11Cid(m))){
        /* PATCH_35: show realized partial P/L for active open parent trade. */
        const g = p11ExitGroupForMarker(m);
        const key = g ? g.key : m.id;
        if(!drawnExitLabels.has(key)){
          drawnExitLabels.add(key);
          const val = g ? g.pnl : p11Num(m.pnl);
          const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
          pnlLabel(fm(val),x,y - 18,lblCol,clip);
        }
      }
    }

    for(const b of openPositionBoxes){
      if(b.symbol !== sym || !latest) continue;
      const y = mapY(b.price);
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = p11CandleCenterX(latest.time,vis,mapX);
      const liveY = mapY(latest.close);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)';
      const lineCol = 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,latest.close);
      const distance = b.letter === 'B' ? latest.close - Number(b.price) : Number(b.price) - latest.close;
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.side === 'SHORT' ? 'SHORT' : 'LONG';
      const topText = fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      const candleClearX = liveX + Math.max(slot*.75,18);
      let boxX = clamp(liveX + slot*5, clip.left+26, clip.left+clip.width-92);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      const boxGap = Math.max(26,ctx.measureText(boxText).width/2 + 12);
      const leftStop = clamp(boxX - boxGap, clip.left, clip.left+clip.width);
      const rightStart = clamp(boxX + boxGap, clip.left, clip.left+clip.width);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftStop - 2){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftStop),px(y)); }
      if(rightStart < lineRight - 2){ ctx.moveTo(px(rightStart),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111';
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      if(liveY >= clip.top && liveY <= clip.top + clip.height){
        ctx.save();
        ctx.strokeStyle = floating >= 0 ? 'rgba(30,136,229,.36)' : 'rgba(246,70,93,.36)';
        ctx.lineWidth = closedW;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(boxX),px(y));
        ctx.lineTo(px(liveX),px(liveY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:16,qty:b.qty,price:b.price,boxData:b,chainId:p11Cid(b),parentTradeId:p11Cid(b)});
    }

    ctx.restore();
  };

  // Stabilize bottom axis labels after any toggle-triggered redraw.
  const p11ToggleIds = ['tglPositions','tglResults','tglDollarValues','tglLots','tglEMA20','tglEMA50','tglEMA3','tglVWAP'];
  p11ToggleIds.forEach(id => {
    const el = document.getElementById(id);
    if(!el || el.__p11AxisRefresh) return;
    el.__p11AxisRefresh = true;
    el.addEventListener('change',() => requestAnimationFrame(() => { if(typeof draw === 'function') draw(); }), true);
    el.addEventListener('click',() => requestAnimationFrame(() => { if(typeof draw === 'function') draw(); }), true);
  });

  try{ if(typeof draw === 'function') draw(); }catch(e){}
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_12 — EXECUTION-LEDGER TRADE CLASSIFICATION
     Chart is a plotting surface only. Trade/order execution data decides
     parent trade identity, marker role, P/EX classification, quantities and P/L.
  ========================================================= */

  const n12 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const EPS12 = 1e-12;
  const cid12 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const sortMarker12 = (a,b) => (n12(a.time)-n12(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const marker12 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sideDir12 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const sideSign12 = side => String(side || '').toUpperCase() === 'BUY' ? 1 : -1;
  const sideText12 = s => s > 0 ? 'LONG' : 'SHORT';
  const addText12 = s => s > 0 ? 'B' : 'S';
  const fee12 = row => typeof feeQuote === 'function' ? feeQuote(row,cfg().symbol) : 0;

  function groupExecutionRows12(rows){
    const sorted = rows.slice().sort((a,b) =>
      n12(a.time)-n12(b.time) ||
      n12(a.orderId)-n12(b.orderId) ||
      n12(a.id)-n12(b.id)
    );

    const groups = [];
    let cur = null;

    for(const row of sorted){
      const q = n12(row.qty);
      const p = n12(row.price);
      const tMs = n12(row.time);
      if(!Number.isFinite(q) || q <= EPS12 || !Number.isFinite(p) || p <= 0 || !Number.isFinite(tMs) || tMs <= 0) continue;

      // Order id is used only to preserve exchange execution identity; chart geometry is never used.
      const key = [row.orderId != null ? String(row.orderId) : String(row.id || ''), String(row.side || '')].join('|');
      if(!cur || cur.key !== key){
        cur = {
          key,
          orderId:row.orderId,
          side:row.side,
          rows:[],
          qty:0,
          notional:0,
          fee:0,
          realizedPnl:0,
          firstTime:tMs,
          lastTime:tMs,
          firstTradeId:row.id,
          lastTradeId:row.id
        };
        groups.push(cur);
      }

      cur.rows.push(row);
      cur.qty += q;
      cur.notional += q*p;
      cur.fee += fee12(row);
      cur.realizedPnl += Number.isFinite(Number(row.realizedPnl)) ? Number(row.realizedPnl) : 0;
      cur.firstTime = Math.min(cur.firstTime,tMs);
      cur.lastTime = Math.max(cur.lastTime,tMs);
      cur.lastTradeId = row.id;
    }

    return groups.map(g => ({
      ...g,
      price:g.qty > EPS12 ? g.notional / g.qty : 0,
      timeSec:Math.floor(g.lastTime / 1000),
      sign:sideSign12(g.side),
      tradeId:g.firstTradeId === g.lastTradeId ? g.firstTradeId : String(g.firstTradeId) + '-' + String(g.lastTradeId)
    }));
  }

  reconstruct = function(rows,symbol){
    const groups = groupExecutionRows12(rows || []);
    const markers = [];
    const links = [];
    const lots = [];
    let mi = 1;
    let li = 1;
    let unres = 0;
    let chainSeq = 1;
    const newChainId = () => 'tc' + (chainSeq++);

    function addM(d){
      const m = {
        id:'m' + mi++,
        symbol,
        role:d.role,
        letter:d.letter,
        time:d.time,
        price:d.price,
        qty:d.qty,
        pnl:d.pnl || 0,
        fee:d.fee || 0,
        side:d.side || '',
        unresolved:!!d.unresolved,
        tradeId:d.tradeId,
        orderId:d.orderId,
        rawSide:d.rawSide || '',
        note:d.note || '',
        chainId:d.chainId || null,
        tradeChainId:d.chainId || null,
        parentTradeId:d.chainId || null,
        isFinalExit:!!d.isFinalExit,
        sourceRows:d.sourceRows || []
      };
      markers.push(m);
      return m;
    }

    function addLot(m,s,q,p,t,f,chainId){
      lots.push({
        markerId:m.id,
        sign:s,
        remainingQty:q,
        originalQty:q,
        price:p,
        time:t,
        feeRemaining:f,
        feeOriginal:f,
        chainId:chainId || m.chainId || null,
        parentTradeId:chainId || m.chainId || null
      });
    }

    const posSign = () => lots.length ? lots[0].sign : 0;
    const totalQty = () => lots.reduce((a,l) => a + Math.abs(n12(l.remainingQty)),0);

    for(const g of groups){
      const q = n12(g.qty);
      const p = n12(g.price);
      const t = n12(g.timeSec);
      const s = n12(g.sign);
      const f = n12(g.fee);
      const pnl = n12(g.realizedPnl);
      const ps = posSign();

      if(!q || !p || !t || !s) continue;

      if(ps === 0){
        // A non-zero realized P/L with no known open lots is carry-in. Do not invent an entry.
        if(Math.abs(pnl) > EPS12){
          unres++;
          addM({
            role:'close',
            letter:'EX',
            time:t,
            price:p,
            qty:q,
            pnl,
            fee:f,
            side:'UNRESOLVED',
            unresolved:true,
            tradeId:g.tradeId,
            orderId:g.orderId,
            rawSide:g.side,
            note:'Carry-in close/reduction. Matching entry is before reconstruction lookback or unavailable.',
            sourceRows:g.rows
          });
          continue;
        }

        const chainId = newChainId();
        const m = addM({
          role:'entry',
          letter:s > 0 ? 'EL' : 'ES',
          time:t,
          price:p,
          qty:q,
          fee:f,
          side:sideText12(s),
          tradeId:g.tradeId,
          orderId:g.orderId,
          rawSide:g.side,
          note:'Entry/open fill',
          chainId,
          sourceRows:g.rows
        });
        addLot(m,s,q,p,t,f,chainId);
        continue;
      }

      if(s === ps){
        const chainId = lots[0] && lots[0].chainId ? lots[0].chainId : newChainId();
        const m = addM({
          role:'entry',
          letter:addText12(s),
          time:t,
          price:p,
          qty:q,
          fee:f,
          side:sideText12(s),
          tradeId:g.tradeId,
          orderId:g.orderId,
          rawSide:g.side,
          note:'Added to position',
          chainId,
          sourceRows:g.rows
        });
        addLot(m,s,q,p,t,f,chainId);
        continue;
      }

      let rem = q;
      const openBefore = totalQty();
      const closeTotal = Math.min(rem,openBefore);
      let cm = null;

      const closePnlTotal = pnl;
      if(closeTotal > EPS12){
        const closeChainId = lots[0] && lots[0].chainId ? lots[0].chainId : null;
        const openAfter = Math.max(0,openBefore - closeTotal);
        const isFinalExit = openAfter <= EPS12;
        cm = addM({
          role:'close',
          letter:isFinalExit ? 'EX' : 'P',
          time:t,
          price:p,
          qty:closeTotal,
          pnl:closePnlTotal,
          fee:f * (closeTotal / q),
          side:sideText12(ps),
          tradeId:g.tradeId,
          orderId:g.orderId,
          rawSide:g.side,
          note:isFinalExit ? 'Final exit fill' : 'Partial reduction fill',
          chainId:closeChainId,
          isFinalExit,
          sourceRows:g.rows
        });
      }

      while(rem > EPS12 && lots.length){
        const lot = lots[0];
        const before = n12(lot.remainingQty);
        const cq = Math.min(rem,before);
        const ef = n12(lot.feeRemaining) * (cq / before);
        const xf = f * (cq / q);
        const rpPart = closeTotal > EPS12 ? closePnlTotal * (cq / closeTotal) : 0;
        const gr = typeof gross === 'function' ? gross(lot.sign,lot.price,p,cq) : (sideText12(lot.sign) === 'LONG' ? (p - lot.price) * cq : (lot.price - p) * cq);
        const priceNet = gr - ef - xf;
        const realizedNet = rpPart - ef - xf;
        const net = (Number.isFinite(priceNet) && Number.isFinite(realizedNet) && Math.abs(priceNet) > EPS12 && Math.abs(realizedNet) > EPS12 && Math.sign(priceNet) !== Math.sign(realizedNet))
          ? priceNet
          : (Number.isFinite(realizedNet) ? realizedNet : priceNet);

        if(cm){
          links.push({
            id:'l' + li++,
            symbol,
            entryMarkerId:lot.markerId,
            exitMarkerId:cm.id,
            entryTime:lot.time,
            entryPrice:lot.price,
            exitTime:t,
            exitPrice:p,
            qty:cq,
            side:sideText12(lot.sign),
            grossPnl:gr,
            realizedPnl:rpPart,
            fees:ef + xf,
            netPnl:net,
            binanceRealizedPnl:rpPart,
            tradeId:g.tradeId,
            orderId:g.orderId,
            unresolved:false,
            chainId:lot.chainId || (cm && cm.chainId) || null,
            tradeChainId:lot.chainId || (cm && cm.chainId) || null,
            parentTradeId:lot.chainId || (cm && cm.chainId) || null,
            exitIsFinal:!!(cm && cm.isFinalExit)
          });
        }

        lot.remainingQty -= cq;
        lot.feeRemaining -= ef;
        rem -= cq;
        if(lot.remainingQty <= EPS12) lots.shift();
      }

      // Reverse remainder from the same exchange order starts a new parent trade.
      if(rem > EPS12){
        const chainId = newChainId();
        const m = addM({
          role:'entry',
          letter:s > 0 ? 'EL' : 'ES',
          time:t,
          price:p,
          qty:rem,
          fee:f * (rem / q),
          side:sideText12(s),
          tradeId:g.tradeId,
          orderId:g.orderId,
          rawSide:g.side,
          note:'Reverse entry remainder from same fill',
          chainId,
          sourceRows:g.rows
        });
        addLot(m,s,rem,p,t,f * (rem / q),chainId);
      }
    }

    const latest = candles.length ? candles[candles.length-1] : null;
    const openConnectors = lots.map(l => ({
      id:'open_' + l.markerId,
      symbol,
      entryMarkerId:l.markerId,
      entryTime:l.time,
      entryPrice:l.price,
      exitTime:latest ? latest.time : Math.floor(Date.now()/1000),
      exitPrice:latest ? latest.close : l.price,
      qty:l.remainingQty,
      side:sideText12(l.sign),
      open:true,
      chainId:l.chainId || null,
      tradeChainId:l.chainId || null,
      parentTradeId:l.chainId || null
    }));

    for(const m of markers){
      if(typeof ivSec === 'function') m.candleTime = Math.floor(n12(m.time) / ivSec()) * ivSec();
    }

    return {markers,links,openConnectors,unresolved:unres,openLots:lots};
  };

  function candleCenterX12(t,vis,mapX){
    if(!Array.isArray(vis) || !vis.length) return null;
    const tv = n12(t);
    const sec = typeof ivSec === 'function' ? ivSec() : 0;
    for(let i=0;i<vis.length;i++){
      const ct = n12(vis[i].time);
      if(tv >= ct && tv < ct + sec) return mapX(i);
    }
    const last = vis[vis.length-1];
    if(sec && tv === n12(last.time) + sec) return mapX(vis.length-1);
    return null;
  }

  window.markerTimeX = function(m,vis,mapX,slot){
    const x = candleCenterX12(m && (m.candleTime || m.time),vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(n12(m && m.time),vis,mapX,slot) : null;
  };

  function chainIdFromMarker12(markerId){
    const m = marker12(markerId);
    if(cid12(m)) return cid12(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid12(l);
  }

  function tradeRecord12(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid12(m) === parentId).slice().sort(sortMarker12);
    const links = (resultLinks || []).filter(l => cid12(l) === parentId).slice();
    const openLinks = (openLotLinks || []).filter(l => cid12(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(sortMarker12);
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sortMarker12).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? eventLinks.reduce((a,l) => a + n12(l.netPnl),0) : n12(m.pnl);
      m.letter = m.isFinalExit ? 'EX' : 'P';
      return {marker:m,type:m.isFinalExit ? 'EX' : 'P',qty:Math.abs(n12(m.qty)),pnl,time:n12(m.time),price:n12(m.price),links:eventLinks};
    });
    const dir = entries[0] ? sideDir12(entries[0].side) : (links[0] ? sideDir12(links[0].side) : '');
    const total = exits.reduce((a,e) => a + n12(e.pnl),0);
    return {parentId,markers,links,openLinks,entries,exits,total,dir,tradeClosed:exits.some(e => e.type === 'EX') && !openLinks.length};
  }

  function contributionForEntry12(rec,entryId){
    return rec.links.filter(l => l.entryMarkerId === entryId).reduce((a,l) => a + n12(l.netPnl),0);
  }

  function exitEventForMarker12(m){
    const rec = tradeRecord12(cid12(m));
    if(!rec) return null;
    return rec.exits.find(e => e.marker.id === m.id) || null;
  }

  function tradeTooltipLines12(parentId){
    const rec = tradeRecord12(parentId);
    if(!rec) return [];
    const lines = ['Parent trade','Direction: ' + (rec.dir || '-')];
    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(contributionForEntry12(rec,m.id))}`));
    }
    if(rec.exits.length){
      lines.push('Exits:');
      rec.exits.forEach(e => lines.push(`${e.type} ${fq(e.qty)} | Exit ${p2(e.price)} | ${fm(e.pnl)}`));
    }
    if(rec.openLinks.length){
      const current = candles && candles.length ? candles[candles.length-1].close : null;
      lines.push('Open lots:');
      rec.openLinks.sort((a,b)=>n12(a.entryTime)-n12(b.entryTime)).forEach(l => {
        let floating = null;
        if(current != null){
          floating = sideDir12(l.side) === 'SHORT' ? (n12(l.entryPrice) - n12(current)) * n12(l.qty) : (n12(current) - n12(l.entryPrice)) * n12(l.qty);
        }
        const m = marker12(l.entryMarkerId);
        lines.push(`${m ? m.letter : 'E'} ${fq(l.qty)} | ${floating == null ? '-' : fm(floating)}`);
      });
    }
    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  window.getExitEntryContributionLines = function(exitMarkerId){
    const rec = tradeRecord12(chainIdFromMarker12(exitMarkerId));
    if(!rec) return [];
    return rec.entries.map(m => `${m.letter || 'E'} ${fq(m.qty)} | ${fm(contributionForEntry12(rec,m.id))}`);
  };

  function pairLinks12(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = marker12(l.entryMarkerId);
      const xm = marker12(l.exitMarkerId);
      if(!em || !xm) continue;
      const key = [cid12(l)||cid12(em)||cid12(xm), l.entryMarkerId, l.exitMarkerId].join('|');
      if(!groups.has(key)) groups.set(key,{...l,qty:0,netPnl:0,grossPnl:0,realizedPnl:0,fees:0,parentTradeId:cid12(l)||cid12(em)||cid12(xm)});
      const g = groups.get(key);
      g.qty += n12(l.qty);
      g.netPnl += n12(l.netPnl);
      g.grossPnl += n12(l.grossPnl);
      g.realizedPnl += n12(l.realizedPnl);
      g.fees += n12(l.fees);
    }
    return [...groups.values()];
  }

  function segmentFromMarkers12(l,vis,mapX,mapY){
    const em = marker12(l.entryMarkerId);
    const xm = marker12(l.exitMarkerId);
    if(!em || !xm) return null;
    const x1 = markerTimeX(em,vis,mapX,0);
    const x2 = markerTimeX(xm,vis,mapX,0);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(em.price),x2,y2:mapY(xm.price)};
  }

  const previousHover12 = typeof hoverItem === 'function' ? hoverItem : null;
  hoverItem = function(){
    if(!mouse) return null;
    const markerHits = [];
    for(const it of overlayHitItems){
      if(it.kind === 'marker' && Math.hypot(mouse.x-it.x,mouse.y-it.y) <= it.radius + 4) markerHits.push(it);
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 4 && mouse.x <= it.x + it.size/2 + 4 && mouse.y >= it.y - it.size/2 - 4 && mouse.y <= it.y + it.size/2 + 4) markerHits.push(it);
    }
    if(markerHits.length) return markerHits[markerHits.length-1];
    if(previousHover12){
      // Let the original line hit-test run, but only after marker/box priority.
      return previousHover12();
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'marker'){
      const lines = tradeTooltipLines12(chainIdFromMarker12(it.markerId));
      if(lines.length){ tooltip(lines,mouse.x,mouse.y); return; }
      tooltip([it.role === 'entry' ? 'Entry/fill' : 'Exit','Size: ' + fq(it.qty) + ' BTC','Price: ' + p2(it.price),'Time: ' + ft(it.time)],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'line'){
      tooltip(it.open ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side] : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.letter === 'B' ? 'Current open long' : 'Current open short','Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const openLines = typeof getOpenEntryContributionLines === 'function' ? getOpenEntryContributionLines() : [];
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const showP = tglPositions.checked;
    const showR = tglResults.checked;
    const showD = tglDollarValues.checked;
    const showLots = tglLots && tglLots.checked;
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    const closedW = getClosedLinkWidth();

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(showR){
      for(const l of pairLinks12()){
        if(l.symbol !== sym) continue;
        if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;
        const s = segmentFromMarkers12(l,vis,mapX,mapY);
        if(!s) continue;
        const col = n12(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
        ctx.strokeStyle = col;
        ctx.lineWidth = closedW;
        ctx.globalAlpha = .86;
        ctx.beginPath();
        ctx.moveTo(px(s.x1),px(s.y1));
        ctx.lineTo(px(s.x2),px(s.y2));
        ctx.stroke();
        ctx.globalAlpha = 1;
        overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cid12(l),parentTradeId:cid12(l)});
        if(showLots) lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
      }
    }

    for(const l of openLotLinks){
      if(l.symbol !== sym || !latest) continue;
      const em = marker12(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : candleCenterX12(l.entryTime,vis,mapX);
      const x2 = candleCenterX12(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const s = {x1,y1:mapY(l.entryPrice),x2,y2:mapY(latest.close)};
      const floating = sideDir12(l.side) === 'LONG' ? (latest.close - l.entryPrice) * l.qty : (l.entryPrice - latest.close) * l.qty;
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = closedW;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      if(showLots) lineMiniLabel(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2 - 10,col,clip);
      overlayHitItems.push({kind:'line',...s,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:cid12(l),parentTradeId:cid12(l)});
    }

    const drawnCloseLabels = new Set();
    for(const m of fillMarkers){
      if(m.symbol !== sym || !inTime(m.time,vis)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
      const isOpenEntry = openEntryMarkerIds.has(m.id);
      if(!showP && !isOpenEntry) continue;
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(m.price);
      if(m.role === 'close') m.letter = m.isFinalExit ? 'EX' : 'P';
      let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
      if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
      circle(ix(x),ix(y),m.letter,col,m.unresolved);
      overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cid12(m),parentTradeId:cid12(m),note:m.note || ''});
      if(showR && showD && m.role === 'close' && !m.unresolved){
        const ev = exitEventForMarker12(m);
        const key = m.id;
        if(!drawnCloseLabels.has(key)){
          drawnCloseLabels.add(key);
          const val = ev ? ev.pnl : n12(m.pnl);
          const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
          pnlLabel(fm(val),x,y - 18,lblCol,clip);
        }
      }
    }

    for(const b of openPositionBoxes){
      if(b.symbol !== sym || !latest) continue;
      const y = mapY(b.price);
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = candleCenterX12(latest.time,vis,mapX);
      const liveY = mapY(latest.close);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)';
      const lineCol = 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,latest.close);
      const distance = b.letter === 'B' ? latest.close - Number(b.price) : Number(b.price) - latest.close;
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.side === 'SHORT' ? 'SHORT' : 'LONG';
      const topText = fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      const candleClearX = liveX + Math.max(slot*.75,18);
      let boxX = clamp(liveX + slot*5, clip.left+26, clip.left+clip.width-92);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      const boxGap = Math.max(26,ctx.measureText(boxText).width/2 + 12);
      const leftStop = clamp(boxX - boxGap, clip.left, clip.left+clip.width);
      const rightStart = clamp(boxX + boxGap, clip.left, clip.left+clip.width);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftStop - 2){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftStop),px(y)); }
      if(rightStart < lineRight - 2){ ctx.moveTo(px(rightStart),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111';
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      if(liveY >= clip.top && liveY <= clip.top + clip.height){
        ctx.save();
        ctx.strokeStyle = floating >= 0 ? 'rgba(30,136,229,.36)' : 'rgba(246,70,93,.36)';
        ctx.lineWidth = closedW;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(boxX),px(y));
        ctx.lineTo(px(liveX),px(liveY));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:16,qty:b.qty,price:b.price,boxData:b,chainId:cid12(b),parentTradeId:cid12(b)});
    }

    ctx.restore();
  };

  try{ if(typeof draw === 'function') draw(); }catch(e){}
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_13 — UI interaction / overlay refinement
     - reset view reserves right space for open-position overlay
     - off-screen node links stay visible
     - node tooltips scoped by marker role
     - standalone $ Values view shows EX totals only
     - lot label collision handling
     - report periods 3M / 6M
     - dropdown focus returns to chart
  ========================================================= */

  const n13 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cid13 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const sideDir13 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const marker13 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sortTime13 = (a,b) => (n13(a.time)-n13(b.time)) || String(a.id||'').localeCompare(String(b.id||''));

  function ensureReportOptions13(){
    const sel = document.getElementById('reportWeeks');
    if(!sel) return;
    const specs = [
      ['1w','1W'],['2w','2W'],['3w','3W'],['1mth','1M'],['3mth','3M'],['6mth','6M'],['custom','Custom']
    ];
    const cur = sel.value || '1w';
    sel.innerHTML = '';
    for(const [v,t] of specs){
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    sel.value = specs.some(x => x[0] === cur) ? cur : '1w';
  }
  ensureReportOptions13();

  selectedReportPresetMs = function(){
    switch(reportWeeksEl.value){
      case '2w': return 2 * WEEK_MS;
      case '3w': return 3 * WEEK_MS;
      case '1mth': return 30 * 24 * 60 * 60 * 1000;
      case '3mth': return 90 * 24 * 60 * 60 * 1000;
      case '6mth': return 180 * 24 * 60 * 60 * 1000;
      case '1w':
      default: return WEEK_MS;
    }
  };

  weeks = function(){
    switch(reportWeeksEl.value){
      case '2w': return 2;
      case '3w': return 3;
      case '1mth': return 4;
      case '3mth': return 13;
      case '6mth': return 26;
      default: return 1;
    }
  };

  reportLabel = function(){
    switch(reportWeeksEl.value){
      case '2w': return '2W';
      case '3w': return '3W';
      case '1mth': return '1M';
      case '3mth': return '3M';
      case '6mth': return '6M';
      case 'custom': return customReportRangeMs() ? 'Custom' : 'Custom*';
      case '1w':
      default: return '1W';
    }
  };

  // After dropdown changes, return focus to the chart so Space acts on chart/isolate, not the dropdown.
  function focusChart13(){
    const c = document.getElementById('chart');
    if(!c) return;
    if(!c.hasAttribute('tabindex')) c.setAttribute('tabindex','0');
    c.style.outline = 'none';
    setTimeout(() => { try{ c.focus({preventScroll:true}); }catch(e){ try{ c.focus(); }catch(_){} } },0);
  }
  document.querySelectorAll('select').forEach(sel => {
    if(sel.__p13FocusInstalled) return;
    sel.__p13FocusInstalled = true;
    sel.addEventListener('change',() => { try{ sel.blur(); }catch(e){} focusChart13(); },true);
  });

  // Reset should leave future slots on the right so open-position block/tags are not over the last candle.
  resetView = function(){
    visibleCount = Math.min(DEF_VISIBLE, Math.max(1, candles.length || DEF_VISIBLE));
    manualY = false;
    yMin = null;
    yMax = null;
    const maxFut = Math.max(0, Math.floor(visibleCount * MAX_FUTURE_RATIO));
    rightOffset = -Math.min(maxFut, Math.max(8, Math.min(14, Math.floor(visibleCount * 0.10))));
    clampView();
    draw();
  };
  if(resetViewEl && !resetViewEl.__p13ResetBound){
    resetViewEl.__p13ResetBound = true;
    resetViewEl.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); resetView(); }, true);
  }

  function candleCenterAnyX13(t,vis,mapX,slot){
    if(!Array.isArray(vis) || !vis.length) return null;
    const sec = typeof ivSec === 'function' ? ivSec() : 0;
    if(!sec) return null;
    const tv = n13(t);
    const first = n13(vis[0].time);
    const idx = Math.floor((tv - first) / sec);
    // exact candle centerline for the candle that hosts the transaction timestamp, including off-screen positions.
    return mapX(idx);
  }

  window.markerTimeX = function(m,vis,mapX,slot){
    const t = n13(m && (m.candleTime || m.time));
    const x = candleCenterAnyX13(t,vis,mapX,slot);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(t,vis,mapX,slot) : null;
  };

  function linkTimeOverlap13(l,vis){
    if(!vis || !vis.length || !l) return false;
    const start = n13(vis[0].time);
    const end = n13(vis[vis.length-1].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    const a = Math.min(n13(l.entryTime), n13(l.exitTime));
    const b = Math.max(n13(l.entryTime), n13(l.exitTime));
    return b >= start && a <= end;
  }

  function segmentFromMarkers13(l,vis,mapX,mapY,slot){
    const em = marker13(l.entryMarkerId);
    const xm = marker13(l.exitMarkerId);
    if(!em || !xm) return null;
    if(!linkTimeOverlap13(l,vis)) return null;
    const x1 = markerTimeX(em,vis,mapX,slot);
    const x2 = markerTimeX(xm,vis,mapX,slot);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(n13(em.price)),x2,y2:mapY(n13(xm.price))};
  }

  function parentIdFromMarker13(markerId){
    const m = marker13(markerId);
    if(cid13(m)) return cid13(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid13(l);
  }

  function tradeRecord13(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid13(m) === parentId).slice().sort(sortTime13);
    const links = (resultLinks || []).filter(l => cid13(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(sortTime13);
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sortTime13).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? eventLinks.reduce((a,l) => a + n13(l.netPnl),0) : n13(m.pnl);
      const type = m.isFinalExit ? 'EX' : 'P';
      return {marker:m,type,qty:Math.abs(n13(m.qty)),pnl,time:n13(m.time),price:n13(m.price),links:eventLinks};
    });
    const dir = entries[0] ? sideDir13(entries[0].side) : (links[0] ? sideDir13(links[0].side) : '');
    const total = exits.reduce((a,e) => a + n13(e.pnl),0);
    return {parentId,markers,links,entries,exits,total,dir};
  }

  function entryContribution13(parentId,entryId){
    return (resultLinks || [])
      .filter(l => cid13(l) === parentId && l.entryMarkerId === entryId)
      .reduce((a,l) => a + n13(l.netPnl),0);
  }

  function exitEvent13(markerId){
    const rec = tradeRecord13(parentIdFromMarker13(markerId));
    if(!rec) return null;
    return rec.exits.find(e => e.marker.id === markerId) || null;
  }

  function fullTradeTooltip13(parentId){
    const rec = tradeRecord13(parentId);
    if(!rec) return [];
    const lines = ['Parent trade','Direction: ' + (rec.dir || '-')];
    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(entryContribution13(rec.parentId,m.id))}`));
    }
    if(rec.exits.length){
      lines.push('Exits:');
      rec.exits.forEach(e => lines.push(`${e.type} ${fq(e.qty)} | Exit ${p2(e.price)} | ${fm(e.pnl)}`));
    }
    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  function markerOwnTooltip13(markerId){
    const m = marker13(markerId);
    if(!m) return [];
    const label = String(m.letter || '');
    const lines = [];
    if(m.role === 'entry'){
      lines.push(label === 'EL' ? 'Long entry' : label === 'ES' ? 'Short entry' : label === 'B' ? 'Long add' : label === 'S' ? 'Short add' : 'Entry/add');
      lines.push('Size: ' + fq(m.qty) + ' BTC');
      lines.push('Price: ' + p2(m.price));
      const pid = parentIdFromMarker13(markerId);
      const contrib = pid ? entryContribution13(pid,markerId) : null;
      if(contrib !== null && isFinite(contrib)) lines.push('P/L contribution: ' + fm(contrib));
      lines.push('Time: ' + ft(m.time));
      return lines;
    }
    const ev = exitEvent13(markerId);
    if(ev){
      lines.push(ev.type === 'EX' ? 'Final exit' : 'Partial exit');
      lines.push('Size: ' + fq(ev.qty) + ' BTC');
      lines.push('Price: ' + p2(ev.price));
      lines.push('P/L: ' + fm(ev.pnl));
      lines.push('Time: ' + ft(ev.time));
      return lines;
    }
    lines.push('Trade event');
    lines.push('Size: ' + fq(m.qty) + ' BTC');
    lines.push('Price: ' + p2(m.price));
    lines.push('Time: ' + ft(m.time));
    return lines;
  }

  function lineDist13(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let best = null, bd = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x,mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bd){ bd = d; best = it; }
    }
    if(best) return best;
    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }
    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      let nearMarker = false;
      for(const m of overlayHitItems || []){
        if(m.kind === 'marker' && Math.hypot(mouse.x-m.x,mouse.y-m.y) <= (m.radius || 8) + 14){ nearMarker = true; break; }
      }
      if(nearMarker) continue;
      if(lineDist13(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'marker'){
      const m = marker13(it.markerId);
      if(m && m.role === 'close' && m.isFinalExit){
        const lines = fullTradeTooltip13(parentIdFromMarker13(it.markerId));
        if(lines.length){ tooltip(lines,mouse.x,mouse.y); return; }
      }
      const lines = markerOwnTooltip13(it.markerId);
      tooltip(lines,mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'line'){
      tooltip(it.open ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side] : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.letter === 'B' ? 'Current open long' : 'Current open short','Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      const openLines = typeof getOpenEntryContributionLines === 'function' ? getOpenEntryContributionLines() : [];
      if(openLines.length){ lines.push('Open entries:'); lines.push(...openLines); }
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  function pairLinks13(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = marker13(l.entryMarkerId);
      const xm = marker13(l.exitMarkerId);
      if(!em || !xm) continue;
      const key = [cid13(l)||cid13(em)||cid13(xm), l.entryMarkerId, l.exitMarkerId].join('|');
      if(!groups.has(key)) groups.set(key,{...l,qty:0,netPnl:0,grossPnl:0,realizedPnl:0,fees:0});
      const g = groups.get(key);
      g.qty += n13(l.qty);
      g.netPnl += n13(l.netPnl);
      g.grossPnl += n13(l.grossPnl);
      g.realizedPnl += n13(l.realizedPnl);
      g.fees += n13(l.fees);
    }
    return [...groups.values()];
  }

  function drawMiniLabelAvoid13(txt,x,y,col,clip,placed){
    ctx.save();
    ctx.font = '11px Arial';
    const pad = 4;
    const w = ctx.measureText(txt).width + pad*2;
    const h = 16;
    const offsets = [-10,10,-26,26,-42,42,-58,58];
    let chosen = null;
    for(const off of offsets){
      const cx = clamp(x, clip.left+w/2+2, clip.left+clip.width-w/2-2);
      const cy = clamp(y + off, clip.top+h/2+2, clip.top+clip.height-h/2-2);
      const r = {x1:cx-w/2-2,y1:cy-h/2-2,x2:cx+w/2+2,y2:cy+h/2+2,cx,cy};
      const hit = placed.some(p => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
      if(!hit){ chosen = r; break; }
      if(!chosen) chosen = r;
    }
    placed.push(chosen);
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.strokeStyle = col;
    ctx.lineWidth = hairline();
    ctx.fillRect(ix(chosen.cx-w/2),ix(chosen.cy-h/2),w,h);
    ctx.strokeRect(px(chosen.cx-w/2),px(chosen.cy-h/2),w,h);
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt,chosen.cx,chosen.cy+.5);
    ctx.restore();
  }

  function drawStandaloneDollarView13(vis,mapX,mapY,slot,clip,sym){
    const drawn = new Set();
    for(const m of fillMarkers || []){
      if(m.symbol !== sym || m.role !== 'close' || !m.isFinalExit || m.unresolved) continue;
      if(!inTime(m.time,vis)) continue;
      const parentId = cid13(m);
      if(!parentId || drawn.has(parentId)) continue;
      if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
      drawn.add(parentId);
      const rec = tradeRecord13(parentId);
      const total = rec ? rec.total : n13(m.pnl);
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(n13(m.price));
      const col = m.side === 'SHORT' ? '#f6465d' : '#0ecb81';
      circle(ix(x),ix(y),'EX',col,false);
      pnlLabel(fm(total),x,y - 20,total >= 0 ? '#1e88e5' : '#f6465d',clip);
      overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:'EX',x,y,radius:14,qty:m.qty,price:m.price,time:m.time,pnl:total,chainId:parentId,parentTradeId:parentId});
    }
  }

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const showP = tglPositions.checked;
    const showR = tglResults.checked;
    const showD = tglDollarValues.checked;
    const showLots = tglLots && tglLots.checked;
    const standaloneDollar = showD && !showP && !showR;
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    const closedW = getClosedLinkWidth();
    const placedLotLabels = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(standaloneDollar){
      drawStandaloneDollarView13(vis,mapX,mapY,slot,clip,sym);
    }else{
      if(showR){
        for(const l of pairLinks13()){
          if(l.symbol !== sym) continue;
          if(isIsolateActive() && !isClosedLinkVisibleInIsolate(l)) continue;
          const s = segmentFromMarkers13(l,vis,mapX,mapY,slot);
          if(!s) continue;
          const col = n13(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
          ctx.strokeStyle = col;
          ctx.lineWidth = closedW;
          ctx.globalAlpha = .86;
          ctx.beginPath();
          ctx.moveTo(px(s.x1),px(s.y1));
          ctx.lineTo(px(s.x2),px(s.y2));
          ctx.stroke();
          ctx.globalAlpha = 1;
          overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cid13(l),parentTradeId:cid13(l)});
          if(showLots) drawMiniLabelAvoid13(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLotLabels);
        }
      }

      // Open lot connectors remain visible and are not affected by isolate mode.
      for(const l of openLotLinks || []){
        if(l.symbol !== sym || !latest) continue;
        const em = marker13(l.entryMarkerId);
        const x1 = em ? markerTimeX(em,vis,mapX,slot) : candleCenterAnyX13(l.entryTime,vis,mapX,slot);
        const x2 = candleCenterAnyX13(latest.time,vis,mapX,slot);
        if(x1 === null || x2 === null) continue;
        const s = {x1,y1:mapY(n13(l.entryPrice)),x2,y2:mapY(n13(latest.close))};
        const floating = sideDir13(l.side) === 'LONG' ? (n13(latest.close) - n13(l.entryPrice)) * n13(l.qty) : (n13(l.entryPrice) - n13(latest.close)) * n13(l.qty);
        const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = closedW;
        ctx.setLineDash([4,4]);
        ctx.beginPath();
        ctx.moveTo(px(s.x1),px(s.y1));
        ctx.lineTo(px(s.x2),px(s.y2));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        if(showLots && !standaloneDollar) drawMiniLabelAvoid13(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLotLabels);
        overlayHitItems.push({kind:'line',...s,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:cid13(l),parentTradeId:cid13(l)});
      }

      const drawnCloseLabels = new Set();
      for(const m of fillMarkers || []){
        if(m.symbol !== sym || !inTime(m.time,vis)) continue;
        if(isIsolateActive() && !isMarkerVisibleInIsolate(m.id)) continue;
        const isOpenEntry = openEntryMarkerIds.has(m.id);
        if(!showP && !isOpenEntry) continue;
        if(m.role === 'close') m.letter = m.isFinalExit ? 'EX' : 'P';
        const x = markerTimeX(m,vis,mapX,slot);
        if(x === null) continue;
        const y = mapY(n13(m.price));
        let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
        if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
        circle(ix(x),ix(y),m.letter,col,m.unresolved);
        overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cid13(m),parentTradeId:cid13(m),note:m.note || ''});
        if(showR && showD && m.role === 'close' && !m.unresolved){
          const ev = exitEvent13(m.id);
          const key = m.id;
          if(!drawnCloseLabels.has(key)){
            drawnCloseLabels.add(key);
            const val = ev ? ev.pnl : n13(m.pnl);
            const lblCol = val >= 0 ? '#1e88e5' : '#f6465d';
            pnlLabel(fm(val),x,y - 18,lblCol,clip);
          }
        }
      }
    }

    // Open-position overlay remains independent from isolate mode. Remove only box-to-last-price dashed line.
    for(const b of openPositionBoxes || []){
      if(b.symbol !== sym || !latest) continue;
      const y = mapY(n13(b.price));
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = candleCenterAnyX13(latest.time,vis,mapX,slot);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)';
      const lineCol = 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,n13(latest.close));
      const distance = b.letter === 'B' ? n13(latest.close) - n13(b.price) : n13(b.price) - n13(latest.close);
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.side === 'SHORT' ? 'SHORT' : 'LONG';
      const topText = fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      let boxX = clamp(liveX + slot*8, clip.left+26, clip.left+clip.width-92);
      const candleClearX = liveX + Math.max(slot*3.75,18);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      ctx.font = 'bold 10px Arial';
      const markerW = Math.max(38, Math.ceil(ctx.measureText(boxText).width + 10));
      const leftEdge = boxX - markerW/2;
      const rightEdge = boxX + markerW/2;
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftEdge){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftEdge),px(y)); }
      if(rightEdge < lineRight){ ctx.moveTo(px(rightEdge),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111';
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:18,qty:b.qty,price:b.price,boxData:b,chainId:cid13(b),parentTradeId:cid13(b)});
    }

    ctx.restore();
  };

  // Ensure dropdown focus behavior also covers dynamically shown/custom controls.
  ['reportWeeks','interval','market'].forEach(id => {
    const el = document.getElementById(id);
    if(el && !el.__p13FocusSecond){
      el.__p13FocusSecond = true;
      el.addEventListener('change',focusChart13,true);
    }
  });

  try{ if(typeof draw === 'function') draw(); }catch(e){ console.error('PATCH_13 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_14 — UI toggle model + open-position freshness
     Scope: UI / UI-behavior layer. Uses existing loaded executions and
     existing positionRisk fetch helper. No strategy/db/scoring changes.
  ========================================================= */

  const n14 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cid14 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const marker14 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sideDir14 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const sortMarker14 = (a,b) => (n14(a.time)-n14(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const showIso14 = () => typeof isIsolateActive === 'function' && isIsolateActive();

  // 1W default for the loaded report period.
  try{
    if(reportWeeksEl){
      reportWeeksEl.value = '1w';
      if(typeof syncCustomRangeVisibility === 'function') syncCustomRangeVisibility();
    }
  }catch(e){}

  function closestLabel14(input){ return input && input.closest ? input.closest('label') : null; }
  function replaceLabelText14(input,text){
    const label = closestLabel14(input);
    if(!label) return;
    for(const node of [...label.childNodes]){
      if(node.nodeType === Node.TEXT_NODE) node.textContent = '';
    }
    let span = label.querySelector('.p14-toggle-text');
    if(!span){
      span = document.createElement('span');
      span.className = 'p14-toggle-text';
      label.appendChild(span);
    }
    span.textContent = text;
  }

  // Reuse existing IDs to avoid touching data structures:
  // tglResults => Trades, tglPositions => Positions, tglLots => Lots. Hide $ Values.
  replaceLabelText14(tglResults,'Trades');
  replaceLabelText14(tglPositions,'Positions');
  replaceLabelText14(tglLots,'Lots');
  const dollarLabel14 = closestLabel14(tglDollarValues);
  if(dollarLabel14) dollarLabel14.style.display = 'none';
  if(tglDollarValues) tglDollarValues.checked = false;

  // Reorder visual toggle sequence: Trades, Positions, Lots.
  try{
    const wrap = document.querySelector('.toggles');
    const tradesLabel = closestLabel14(tglResults);
    const positionsLabel = closestLabel14(tglPositions);
    const lotsLabel = closestLabel14(tglLots);
    const conn = document.getElementById('connWrap');
    if(wrap && tradesLabel && positionsLabel && lotsLabel){
      wrap.insertBefore(tradesLabel, conn || null);
      wrap.insertBefore(positionsLabel, conn || null);
      wrap.insertBefore(lotsLabel, conn || null);
    }
  }catch(e){}

  let p14IsoKilled = false;
  const origIso14 = typeof window.isIsolateActive === 'function' ? window.isIsolateActive : () => false;
  const origMarkerVisible14 = typeof window.isMarkerVisibleInIsolate === 'function' ? window.isMarkerVisibleInIsolate : () => true;
  const origClosedVisible14 = typeof window.isClosedLinkVisibleInIsolate === 'function' ? window.isClosedLinkVisibleInIsolate : () => true;
  window.isIsolateActive = () => !p14IsoKilled && origIso14();
  window.isMarkerVisibleInIsolate = id => p14IsoKilled ? true : origMarkerVisible14(id);
  window.isClosedLinkVisibleInIsolate = l => p14IsoKilled ? true : origClosedVisible14(l);

  function syncTradeToggleState14(){
    const tradesOn = !!(tglResults && tglResults.checked);
    if(!tradesOn){
      if(tglPositions) tglPositions.checked = false;
      if(tglLots) tglLots.checked = false;
      p14IsoKilled = true; // turning Trades OFF ends effective isolate mode for closed overlays
      try{ if(typeof window.clearIsolateState === 'function') window.clearIsolateState({redraw:false,clearTargets:true}); }catch(_e){}
    }
    if(tglPositions) tglPositions.disabled = !tradesOn;
    if(tglLots) tglLots.disabled = !tradesOn;
    if(tglDollarValues) tglDollarValues.checked = false;
    try{ draw(); }catch(e){}
  }

  [tglResults,tglPositions,tglLots].forEach(el => {
    if(!el || el.__p14ToggleBound) return;
    el.__p14ToggleBound = true;
    el.addEventListener('change',syncTradeToggleState14,true);
  });
  syncTradeToggleState14();

  // Allow new isolate clicks after Trades are back on.
  try{
    canvas.addEventListener('click',() => { if(window.__v13Patch36StrictPlOnly) return; if(tglResults && tglResults.checked) p14IsoKilled = false; },true);
  }catch(e){}

  function normalizeTimeSec14(t){
    const v = n14(t);
    return v > 1e12 ? Math.floor(v/1000) : v;
  }

  function candleIndexForEvent14(t){
    if(!Array.isArray(candles) || !candles.length) return -1;
    const tv = normalizeTimeSec14(t);
    let lo = 0, hi = candles.length - 1, ans = -1;
    while(lo <= hi){
      const mid = (lo + hi) >> 1;
      if(n14(candles[mid].time) <= tv){ ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if(ans < 0) return -1;
    const next = ans + 1 < candles.length ? n14(candles[ans+1].time) : n14(candles[ans].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    if(next && tv >= next && ans + 1 < candles.length) return ans + 1;
    return ans;
  }

  window.xForCandleIndex = function(index,vis,mapX){
    if(!Array.isArray(vis) || !vis.length || index < 0) return null;
    const firstTime = n14(vis[0].time);
    const firstIndex = candleIndexForEvent14(firstTime);
    if(firstIndex < 0) return null;
    return mapX(index - firstIndex);
  };

  window.markerTimeX = function(m,vis,mapX,slot){
    const idx = candleIndexForEvent14(m && m.time);
    const x = window.xForCandleIndex(idx,vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(normalizeTimeSec14(m && m.time),vis,mapX,slot) : null;
  };

  function eventX14(time,vis,mapX){
    const idx = candleIndexForEvent14(time);
    return window.xForCandleIndex(idx,vis,mapX);
  }

  function linkTimeOverlap14(l,vis){
    if(!vis || !vis.length || !l) return false;
    const start = n14(vis[0].time);
    const end = n14(vis[vis.length-1].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    const a = Math.min(n14(l.entryTime), n14(l.exitTime));
    const b = Math.max(n14(l.entryTime), n14(l.exitTime));
    return b >= start && a <= end;
  }

  function parentIdFromMarker14(markerId){
    const m = marker14(markerId);
    if(cid14(m)) return cid14(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid14(l);
  }

  function tradeRecord14(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid14(m) === parentId).slice().sort(sortMarker14);
    const links = (resultLinks || []).filter(l => cid14(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(sortMarker14);
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sortMarker14).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? eventLinks.reduce((a,l) => a + n14(l.netPnl),0) : n14(m.pnl);
      return {marker:m,type:m.isFinalExit ? 'EX' : 'P',qty:Math.abs(n14(m.qty)),pnl,time:n14(m.time),price:n14(m.price),links:eventLinks};
    });
    const firstEntry = entries[0] || null;
    const finalExit = exits.filter(e => e.type === 'EX').slice(-1)[0] || null;
    const total = exits.reduce((a,e) => a + n14(e.pnl),0);
    const totalLots = exits.reduce((a,e) => a + n14(e.qty),0);
    const dir = firstEntry ? sideDir14(firstEntry.side) : (links[0] ? sideDir14(links[0].side) : '');
    const firstTime = markers.length ? Math.min(...markers.map(m => n14(m.time)).filter(Boolean)) : 0;
    return {parentId,markers,links,entries,exits,firstEntry,finalExit,total,totalLots,dir,firstTime};
  }

  function allParentTrades14(){
    const ids = new Set();
    (fillMarkers || []).forEach(m => { const id = cid14(m); if(id) ids.add(id); });
    (resultLinks || []).forEach(l => { const id = cid14(l); if(id) ids.add(id); });
    return [...ids].map(tradeRecord14).filter(r => r && r.firstEntry && r.finalExit).sort((a,b) => n14(a.firstTime)-n14(b.firstTime));
  }

  function entryContribution14(parentId,entryId){
    return (resultLinks || [])
      .filter(l => cid14(l) === parentId && l.entryMarkerId === entryId)
      .reduce((a,l) => a + n14(l.netPnl),0);
  }

  function exitEvent14(markerId){
    const rec = tradeRecord14(parentIdFromMarker14(markerId));
    if(!rec) return null;
    return rec.exits.find(e => e.marker.id === markerId) || null;
  }

  function fullTradeTooltip14(parentId){
    const rec = tradeRecord14(parentId);
    if(!rec) return [];
    const lines = ['Parent trade','Direction: ' + (rec.dir || '-')];
    if(rec.entries.length){
      lines.push('Entries:');
      rec.entries.forEach(m => lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(entryContribution14(rec.parentId,m.id))}`));
    }
    if(rec.exits.length){
      lines.push('Exits:');
      rec.exits.forEach(e => lines.push(`${e.type} ${fq(e.qty)} | Exit ${p2(e.price)} | ${fm(e.pnl)}`));
    }
    lines.push('Total trade P/L: ' + fm(rec.total));
    return lines;
  }

  function markerOwnTooltip14(markerId){
    const m = marker14(markerId);
    if(!m) return [];
    const label = String(m.letter || '');
    if(m.role === 'entry'){
      const title = label === 'EL' ? 'Long entry' : label === 'ES' ? 'Short entry' : label === 'B' ? 'Long add' : label === 'S' ? 'Short add' : 'Entry/add';
      const pid = parentIdFromMarker14(markerId);
      return [title,'Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'P/L contribution: ' + fm(pid ? entryContribution14(pid,markerId) : 0),'Time: ' + ft(m.time)];
    }
    const ev = exitEvent14(markerId);
    if(ev) return [ev.type === 'EX' ? 'Final exit' : 'Partial exit','Size: ' + fq(ev.qty) + ' BTC','Price: ' + p2(ev.price),'P/L: ' + fm(ev.pnl),'Time: ' + ft(ev.time)];
    return ['Trade event','Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'Time: ' + ft(m.time)];
  }

  function pairLinks14(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = marker14(l.entryMarkerId), xm = marker14(l.exitMarkerId);
      if(!em || !xm) continue;
      const key = [cid14(l)||cid14(em)||cid14(xm), l.entryMarkerId, l.exitMarkerId].join('|');
      if(!groups.has(key)) groups.set(key,{...l,qty:0,netPnl:0,grossPnl:0,realizedPnl:0,fees:0});
      const g = groups.get(key);
      g.qty += n14(l.qty); g.netPnl += n14(l.netPnl); g.grossPnl += n14(l.grossPnl); g.realizedPnl += n14(l.realizedPnl); g.fees += n14(l.fees);
    }
    return [...groups.values()];
  }

  function segmentFromMarkers14(entryMarker,exitMarker,vis,mapX,mapY){
    if(!entryMarker || !exitMarker) return null;
    const x1 = markerTimeX(entryMarker,vis,mapX,0);
    const x2 = markerTimeX(exitMarker,vis,mapX,0);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(n14(entryMarker.price)),x2,y2:mapY(n14(exitMarker.price))};
  }

  function segmentFromLink14(l,vis,mapX,mapY){
    if(!linkTimeOverlap14(l,vis)) return null;
    return segmentFromMarkers14(marker14(l.entryMarkerId),marker14(l.exitMarkerId),vis,mapX,mapY);
  }

  function visibleByIsoMarker14(id){ return !showIso14() || isMarkerVisibleInIsolate(id); }
  function visibleByIsoLink14(l){ return !showIso14() || isClosedLinkVisibleInIsolate(l); }
  function visibleByIsoRecord14(rec){
    if(!showIso14()) return true;
    return rec.markers.some(m => visibleByIsoMarker14(m.id)) || rec.links.some(l => visibleByIsoLink14(l));
  }

  function drawBoxLabel14(txt,x,y,col,clip,placed,fillBg=true){
    ctx.save();
    ctx.font = '11px Arial';
    const pad = 4;
    const w = ctx.measureText(txt).width + pad*2;
    const h = 16;
    const offsets = [-12,12,-28,28,-44,44,-60,60];
    let chosen = null;
    for(const off of offsets){
      const cx = clamp(x, clip.left+w/2+2, clip.left+clip.width-w/2-2);
      const cy = clamp(y + off, clip.top+h/2+2, clip.top+clip.height-h/2-2);
      const r = {x1:cx-w/2-2,y1:cy-h/2-2,x2:cx+w/2+2,y2:cy+h/2+2,cx,cy};
      const hit = placed.some(p => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
      if(!hit){ chosen = r; break; }
      if(!chosen) chosen = r;
    }
    placed.push(chosen);
    if(fillBg){
      ctx.fillStyle = opt.bg || 'rgba(255,255,255,.94)';
      ctx.strokeStyle = col;
      ctx.lineWidth = hairline();
      ctx.fillRect(ix(chosen.cx-w/2),ix(chosen.cy-h/2),w,h);
      ctx.strokeRect(px(chosen.cx-w/2),px(chosen.cy-h/2),w,h);
    }
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt,chosen.cx,chosen.cy+.5);
    ctx.restore();
  }

  function drawMarker14(m,vis,mapX,mapY,slot){
    if(!m || !inTime(m.time,vis)) return;
    const x = markerTimeX(m,vis,mapX,slot);
    if(x === null) return;
    const y = mapY(n14(m.price));
    if(m.role === 'close') m.letter = m.isFinalExit ? 'EX' : 'P';
    let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
    if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
    circle(ix(x),ix(y),m.letter,col,m.unresolved);
    overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cid14(m),parentTradeId:cid14(m),note:m.note || ''});
  }

  function drawSimplifiedTrades14(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    for(const rec of allParentTrades14()){
      if(!visibleByIsoRecord14(rec)) continue;
      const first = rec.firstEntry;
      const ex = rec.finalExit && rec.finalExit.marker;
      if(!first || !ex) continue;
      const synthetic = {entryTime:first.time, exitTime:ex.time};
      if(!linkTimeOverlap14(synthetic,vis)) continue;
      const s = segmentFromMarkers14(first,ex,vis,mapX,mapY);
      if(!s) continue;
      const col = rec.netTotal >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .9 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:'simple_'+rec.parentId,qty:rec.totalLots,side:rec.dir,open:false,chainId:rec.parentId,parentTradeId:rec.parentId});
      if(showLots) drawBoxLabel14(fq(rec.totalLots),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLabels);
      drawBoxLabel14(fm(rec.total),s.x2, s.y2 - 22, col, clip, placedLabels);
      if(inTime(first.time,vis)) drawMarker14(first,vis,mapX,mapY,slot);
      if(inTime(ex.time,vis)) drawMarker14(ex,vis,mapX,mapY,slot);
    }
  }

  function drawFullTrades14(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    for(const l of pairLinks14()){
      if(l.symbol !== cfg().symbol) continue;
      if(!visibleByIsoLink14(l)) continue;
      const s = segmentFromLink14(l,vis,mapX,mapY);
      if(!s) continue;
      const col = n14(l.netPnl) >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .86 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cid14(l),parentTradeId:cid14(l)});
      if(showLots) drawBoxLabel14(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLabels);
    }
    for(const m of fillMarkers || []){
      if(m.symbol !== cfg().symbol || !visibleByIsoMarker14(m.id)) continue;
      drawMarker14(m,vis,mapX,mapY,slot);
      if(m.role === 'close' && !m.unresolved && inTime(m.time,vis)){
        const ev = exitEvent14(m.id);
        const x = markerTimeX(m,vis,mapX,slot);
        if(x !== null){
          const y = mapY(n14(m.price));
          const val = ev ? ev.pnl : n14(m.pnl);
          drawBoxLabel14(fm(val),x,y - 20,val >= 0 ? '#1e88e5' : '#f6465d',clip,placedLabels);
        }
      }
    }
  }

  function drawOpenOverlay14(vis,mapX,mapY,slot,clip,placedLabels){
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    if(!latest) return;

    // Open lot connectors and lot labels are independent of closed-trade toggles.
    for(const l of openLotLinks || []){
      if(l.symbol !== sym) continue;
      const em = marker14(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : eventX14(l.entryTime,vis,mapX);
      const x2 = eventX14(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const y1 = mapY(n14(l.entryPrice));
      const y2 = mapY(n14(latest.close));
      const floating = sideDir14(l.side) === 'LONG' ? (n14(latest.close) - n14(l.entryPrice)) * n14(l.qty) : (n14(l.entryPrice) - n14(latest.close)) * n14(l.qty);
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(x1),px(y1));
      ctx.lineTo(px(x2),px(y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawBoxLabel14(fq(l.qty),(x1+x2)/2,(y1+y2)/2,col,clip,placedLabels);
      overlayHitItems.push({kind:'line',x1,y1,x2,y2,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:cid14(l),parentTradeId:cid14(l)});
    }

    for(const b of openPositionBoxes || []){
      if(b.symbol !== sym) continue;
      const y = mapY(n14(b.price));
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = eventX14(latest.time,vis,mapX);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.stale ? 'rgba(245,158,11,.14)' : (b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)');
      const lineCol = b.stale ? 'rgba(245,158,11,.72)' : 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,n14(latest.close));
      const distance = b.letter === 'B' ? n14(latest.close) - n14(b.price) : n14(b.price) - n14(latest.close);
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.stale ? 'STALE' : (b.side === 'SHORT' ? 'SHORT' : 'LONG');
      const topText = (b.stale ? 'STALE | ' : '') + fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      let boxX = clamp(liveX + slot*8, clip.left+26, clip.left+clip.width-92);
      const candleClearX = liveX + Math.max(slot*3.75,18);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      ctx.font = 'bold 10px Arial';
      const markerW = Math.max(38, Math.ceil(ctx.measureText(boxText).width + 10));
      const leftEdge = boxX - markerW/2;
      const rightEdge = boxX + markerW/2;
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftEdge){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftEdge),px(y)); }
      if(rightEdge < lineRight){ ctx.moveTo(px(rightEdge),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = b.stale ? '#b45309' : (floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111');
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:18,qty:b.qty,price:b.price,boxData:b,chainId:cid14(b),parentTradeId:cid14(b)});
    }
  }

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const tradesOn = !!(tglResults && tglResults.checked);
    const positionsOn = tradesOn && !!(tglPositions && tglPositions.checked);
    const lotsOn = tradesOn && !!(tglLots && tglLots.checked);
    const placedLabels = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();

    if(tradesOn){
      if(positionsOn) drawFullTrades14(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
      else drawSimplifiedTrades14(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
    }
    drawOpenOverlay14(vis,mapX,mapY,slot,clip,placedLabels);

    ctx.restore();
  };

  function lineDist14(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let best = null, bd = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x,mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bd){ bd = d; best = it; }
    }
    if(best) return best;
    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }
    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      if(lineDist14(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'marker'){
      const m = marker14(it.markerId);
      if(m && m.role === 'close' && m.isFinalExit){
        const lines = fullTradeTooltip14(parentIdFromMarker14(it.markerId));
        if(lines.length){ tooltip(lines,mouse.x,mouse.y); return; }
      }
      tooltip(markerOwnTooltip14(it.markerId),mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'line'){
      tooltip(it.open ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side] : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.boxData && it.boxData.stale ? 'Open position status stale' : (it.letter === 'B' ? 'Current open long' : 'Current open short'),'Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  // Double-click chart area: center last candle and reset vertical scale. Right axis still only resets Y.
  try{
    canvas.addEventListener('dblclick',e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if(typeof rightAxis === 'function' && rightAxis(e.offsetX)){
        resetYAuto();
        return;
      }
      manualY = false;
      yMin = null;
      yMax = null;
      if(candles && candles.length){
        const maxFut = Math.max(0, Math.floor(visibleCount * MAX_FUTURE_RATIO));
        rightOffset = -Math.min(maxFut, Math.floor(visibleCount/2));
        clampView();
      }
      draw();
    },true);
  }catch(e){}

  // Manual Load Trades button turns red while the load is in progress.
  const prevLoadTrades14 = loadTrades;
  loadTrades = async function(opt={}){
    const silent = !!(opt && opt.silent);
    if(!silent && loadTradesEl){
      loadTradesEl.style.color = '#b91c1c';
      loadTradesEl.style.fontWeight = '700';
    }
    try{
      return await prevLoadTrades14(opt);
    }finally{
      if(!silent && loadTradesEl){
        loadTradesEl.style.color = '#111';
        loadTradesEl.style.fontWeight = '';
      }
    }
  };

  // Position-only status refresh: clears stale open overlay when exchange confirms flat.
  let lastPositionSuccess14 = 0;
  let positionRefreshBusy14 = false;
  async function refreshOpenPositionOnly14(){
    if(positionRefreshBusy14 || !hasKeys()) return;
    positionRefreshBusy14 = true;
    try{
      const key = apiKeyEl.value.trim();
      const sec = apiSecretEl.value.trim();
      const off = await timeOffset();
      const risk = await getPositions(key,sec,off);
      lastPositionSuccess14 = Date.now();
      const boxes = buildOpenBoxes([],risk,cfg().symbol);
      if(boxes.length){
        openPositionBoxes = boxes;
      }else{
        openPositionBoxes = [];
        openLotLinks = [];
        openEntryMarkerIds = new Set();
        activeOpenParentChainIds = new Set();
      }
      updatePositionStrip(candles.length ? candles[candles.length-1] : null);
      updateTabTitle();
      draw();
    }catch(e){
      if(Date.now() - lastPositionSuccess14 > 10000){
        (openPositionBoxes || []).forEach(b => b.stale = true);
        draw();
      }
    }finally{
      positionRefreshBusy14 = false;
    }
  }
  setInterval(refreshOpenPositionOnly14,3000);

  // Keep dependency state stable after any redraw-triggering toggle change.
  syncTradeToggleState14();
  try{ draw(); }catch(e){ console.error('PATCH_14 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_15 — UI stability + overlay placement
     Scope: UI / UI-behavior only.
  ========================================================= */

  const n15 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cid15 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const marker15 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sideDir15 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const sortMarker15 = (a,b) => (n15(a.time)-n15(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const isoOn15 = () => typeof isIsolateActive === 'function' && isIsolateActive();

  function normalizeTimeSec15(t){
    const v = n15(t);
    return v > 1e12 ? Math.floor(v/1000) : v;
  }

  function candleIndexForEvent15(t){
    if(!Array.isArray(candles) || !candles.length) return -1;
    const tv = normalizeTimeSec15(t);
    let lo = 0, hi = candles.length - 1, ans = -1;
    while(lo <= hi){
      const mid = (lo + hi) >> 1;
      if(n15(candles[mid].time) <= tv){ ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if(ans < 0) return -1;
    const next = ans + 1 < candles.length ? n15(candles[ans+1].time) : n15(candles[ans].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    if(next && tv >= next && ans + 1 < candles.length) return ans + 1;
    return ans;
  }

  window.xForCandleIndex = function(index,vis,mapX){
    if(!Array.isArray(vis) || !vis.length || index < 0) return null;
    const firstIndex = candleIndexForEvent15(vis[0].time);
    if(firstIndex < 0) return null;
    return mapX(index - firstIndex);
  };

  window.markerTimeX = function(m,vis,mapX,slot){
    const idx = candleIndexForEvent15(m && m.time);
    const x = window.xForCandleIndex(idx,vis,mapX);
    if(x !== null) return x;
    return typeof timeX === 'function' ? timeX(normalizeTimeSec15(m && m.time),vis,mapX,slot) : null;
  };

  function eventX15(time,vis,mapX){
    const idx = candleIndexForEvent15(time);
    return window.xForCandleIndex(idx,vis,mapX);
  }

  function linkTimeOverlap15(l,vis){
    if(!vis || !vis.length || !l) return false;
    const start = n15(vis[0].time);
    const end = n15(vis[vis.length-1].time) + (typeof ivSec === 'function' ? ivSec() : 0);
    const a = Math.min(n15(l.entryTime), n15(l.exitTime));
    const b = Math.max(n15(l.entryTime), n15(l.exitTime));
    return b >= start && a <= end;
  }

  function parentIdFromMarker15(markerId){
    const m = marker15(markerId);
    if(cid15(m)) return cid15(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid15(l);
  }

  function tradeRecord15(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid15(m) === parentId).slice().sort(sortMarker15);
    const links = (resultLinks || []).filter(l => cid15(l) === parentId).slice();
    const entries = markers.filter(m => m.role === 'entry').sort(sortMarker15);
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sortMarker15).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? realizedSum15(eventLinks) : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl);
      const fees = eventLinks.length ? signedFeeSum15(eventLinks) : signedFeeValue15(m.fee);
      const netPnl = pnl + fees;
      return {marker:m,type:m.isFinalExit ? 'EX' : 'P',qty:Math.abs(n15(m.qty)),pnl,fees,netPnl,time:n15(m.time),price:n15(m.price),links:eventLinks};
    });
    const firstEntry = entries[0] || null;
    const finalExit = exits.filter(e => e.type === 'EX').slice(-1)[0] || null;
    const total = links.length ? realizedSum15(links) : exits.reduce((a,e) => a + n15(e.pnl),0);
    const fees = links.length ? signedFeeSum15(links) : exits.reduce((a,e) => a + n15(e.fees),0);
    const totalLots = exits.reduce((a,e) => a + n15(e.qty),0);
    const dir = firstEntry ? sideDir15(firstEntry.side) : (links[0] ? sideDir15(links[0].side) : '');
    const firstTime = markers.length ? Math.min(...markers.map(m => n15(m.time)).filter(Boolean)) : 0;
    const lastExitTime = exits.length ? Math.max(...exits.map(e => n15(e.time)).filter(Boolean)) : 0;
    const fundingInfo = fundingMatchInfo15(firstTime,finalExit ? n15(finalExit.time) : lastExitTime,(markers[0] && markers[0].symbol) || (links[0] && links[0].symbol) || cfg().symbol,parentId);
    const funding = fundingInfo.sum;
    const netTotal = total + fees + funding;
    return {parentId,markers,links,entries,exits,firstEntry,finalExit,total,fees,funding,fundingRows:fundingInfo.count,netTotal,totalLots,dir,firstTime};
  }

  function realizedValue15(l){
    return n15(l && (l.binanceRealizedPnl ?? l.realizedPnl));
  }
  function realizedSum15(rows){
    return (rows || []).reduce((a,l) => a + realizedValue15(l),0);
  }
  function signedFeeValue15(v){
    const n = n15(v);
    return n > 0 ? -n : n;
  }
  function signedFeeSum15(rows){
    return (rows || []).reduce((a,l) => a + signedFeeValue15(l && (l.fees ?? l.fee)),0);
  }
  function netValue15(l){
    return realizedValue15(l) + signedFeeValue15(l && (l.fees ?? l.fee));
  }
  function fundingValue15(row){
    return n15(row && (row.income ?? row.fundingFee ?? row.funding));
  }
  function fundingMatchInfo15(start,end,sym,parentId){
    const s = normalizeTimeSec15(start);
    const e = normalizeTimeSec15(end);
    const out = {sum:0,count:0,start:s,end:e};
    if(!s || !e || e < s) return out;
    const symbol = String(sym || cfg().symbol || '').toUpperCase();
    (fundingIncomeRows || []).forEach(row => {
      const t = normalizeTimeSec15(row && row.time);
      const rowSym = String(row && row.symbol || symbol).toUpperCase();
      if(t >= s && t <= e && (!symbol || rowSym === symbol)){
        out.count++;
        out.sum += fundingValue15(row);
      }
    });
    if(parentId && typeof window !== 'undefined'){
      const root = window.__v13Patch37CFundingStats || {
        fetchedRows:fundingIncomeFetchStats.rows || (fundingIncomeRows || []).length,
        fetchStart:fundingIncomeFetchStats.start || 0,
        fetchEnd:fundingIncomeFetchStats.end || 0,
        symbol:fundingIncomeFetchStats.symbol || symbol,
        matches:{}
      };
      root.matches[String(parentId)] = {count:out.count,sum:out.sum,start:s,end:e,symbol};
      window.__v13Patch37CFundingStats = root;
    }
    return out;
  }
  function fundingSumForWindow15(start,end,sym,parentId){
    return fundingMatchInfo15(start,end,sym,parentId).sum;
  }
  function currentOpenRenderChainIds15(sym){
    const ids = new Set();
    (openLotLinks || []).forEach(l => {
      if(l && (!sym || l.symbol === sym)){
        const id = cid15(l);
        if(id) ids.add(id);
      }
    });
    (openPositionBoxes || []).forEach(b => {
      if(b && (!sym || b.symbol === sym)){
        const id = cid15(b);
        if(id) ids.add(id);
      }
    });
    return ids;
  }
  function activeOpenChainIds15(sym){
    const ids = currentOpenRenderChainIds15(sym);
    if(!sym || sym === cfg().symbol){
      (activeOpenParentChainIds || new Set()).forEach(id => { if(id) ids.add(id); });
    }
    return ids;
  }

  function allParentTrades15(){
    const ids = new Set();
    (fillMarkers || []).forEach(m => { const id = cid15(m); if(id) ids.add(id); });
    (resultLinks || []).forEach(l => { const id = cid15(l); if(id) ids.add(id); });
    return [...ids].map(tradeRecord15).filter(r => r && r.firstEntry && r.finalExit).sort((a,b) => n15(a.firstTime)-n15(b.firstTime));
  }

  function entryContribution15(parentId,entryId){
    return (resultLinks || [])
      .filter(l => cid15(l) === parentId && l.entryMarkerId === entryId)
      .reduce((a,l) => a + netValue15(l),0);
  }

  function exitEvent15(markerId){
    const rec = tradeRecord15(parentIdFromMarker15(markerId));
    if(!rec) return null;
    return rec.exits.find(e => e.marker.id === markerId) || null;
  }

  function fullTradeTooltip15(parentId){
    const rec = tradeRecord15(parentId);
    if(!rec) return [];
    const lines = ['Direction: ' + (rec.dir || '-')];
    if(rec.entries.length){
      lines.push(`Entries (${rec.entries.length}):`);
      rec.entries.forEach(m => lines.push(`${m.letter || 'E'} ${fq(m.qty)} | ${fm(entryContribution15(rec.parentId,m.id))}`));
    }
    if(rec.exits.length){
      lines.push(`Exits (${rec.exits.length}):`);
      rec.exits.forEach(e => lines.push(`${e.type} ${fq(e.qty)} | ${fm(e.pnl)}`));
    }
    lines.push('');
    lines.push('Closing PnL | ' + fm(rec.total));
    lines.push('Trading Fee | ' + fm(rec.fees));
    lines.push('Funding Fee | ' + fm(rec.funding));
    lines.push('');
    lines.push('Net P/L | ' + fm(rec.netTotal));
    return lines;
  }

  function markerOwnTooltip15(markerId){
    const m = marker15(markerId);
    if(!m) return [];
    const label = String(m.letter || '');
    if(m.role === 'entry'){
      const title = label === 'EL' ? 'Long entry' : label === 'ES' ? 'Short entry' : label === 'B' ? 'Long add' : label === 'S' ? 'Short add' : 'Entry/add';
      const pid = parentIdFromMarker15(markerId);
      return [title,'Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'P/L contribution: ' + fm(pid ? entryContribution15(pid,markerId) : 0),'Time: ' + ft(m.time)];
    }
    const ev = exitEvent15(markerId);
    if(ev) return [ev.type === 'EX' ? 'Final exit' : 'Partial exit',`${ev.type} ${fq(ev.qty)} | ${fm(ev.pnl)}`,'Trading Fee | ' + fm(ev.fees),'','Net P/L | ' + fm(ev.netPnl),'Time: ' + ft(ev.time)];
    return ['Trade event','Size: ' + fq(m.qty) + ' BTC','Price: ' + p2(m.price),'Time: ' + ft(m.time)];
  }

  function pnlColor15(v){
    const n = Number(v);
    if(!Number.isFinite(n) || Math.abs(n) < 1e-12) return '#111827';
    return n > 0 ? '#047857' : '#f6465d';
  }

  function colorTooltipValue15(line){
    const s = String(line || '');
    const money = s.match(/([+-]?\$[0-9][0-9,]*(?:\.[0-9]+)?|-?\$[0-9][0-9,]*(?:\.[0-9]+)?)\s*$/);
    if(!money) return null;
    const raw = money[1];
    const n = Number(raw.replace(/[$,]/g,''));
    if(!Number.isFinite(n)) return null;
    const idx = s.lastIndexOf(raw);
    return {prefix:s.slice(0,idx),value:raw,color:pnlColor15(n)};
  }

  function coloredClosedTooltip15(lines,x,y){
    const safe = (lines || []).map(line => String(line == null ? '' : line));
    ctx.save();
    ctx.font = '12px Arial';
    const pad = 12;
    const lh = 17;
    const w = Math.max(...safe.map(s => ctx.measureText(s).width),0) + pad*2;
    const h = safe.length * lh + pad*2;
    let tx = x + 14;
    let ty = y + 14;
    if(tx + w > canvas.clientWidth - RIGHT_AXIS) tx = x - w - 14;
    if(ty + h > canvas.clientHeight - 10) ty = y - h - 14;
    ctx.fillStyle = 'rgba(255,255,255,.98)';
    ctx.strokeStyle = '#d9dce1';
    ctx.fillRect(tx,ty,w,h);
    ctx.strokeRect(tx,ty,w,h);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    safe.forEach((line,i) => {
      const yLine = ty + pad + i*lh;
      const parsed = colorTooltipValue15(line);
      ctx.font = '12px Arial';
      if(!parsed){
        ctx.fillStyle = '#111827';
        ctx.fillText(line,tx+pad,yLine);
        return;
      }
      ctx.fillStyle = '#111827';
      ctx.fillText(parsed.prefix,tx+pad,yLine);
      ctx.fillStyle = parsed.color;
      ctx.fillText(parsed.value,tx+pad+ctx.measureText(parsed.prefix).width,yLine);
    });
    ctx.restore();
  }

  function pairLinks15(){
    const groups = new Map();
    for(const l of resultLinks || []){
      const em = marker15(l.entryMarkerId);
      const xm = marker15(l.exitMarkerId);
      if(!em || !xm) continue;
      const key = [cid15(l)||cid15(em)||cid15(xm), l.entryMarkerId, l.exitMarkerId].join('|');
      if(!groups.has(key)) groups.set(key,{...l,qty:0,netPnl:0,grossPnl:0,realizedPnl:0,binanceRealizedPnl:0,fees:0});
      const g = groups.get(key);
      g.qty += n15(l.qty);
      g.grossPnl += n15(l.grossPnl);
      g.realizedPnl += realizedValue15(l);
      g.binanceRealizedPnl += realizedValue15(l);
      g.netPnl += netValue15(l);
      g.fees += signedFeeValue15(l.fees);
    }
    return [...groups.values()];
  }

  function segmentFromMarkers15(entryMarker,exitMarker,vis,mapX,mapY,slot){
    if(!entryMarker || !exitMarker) return null;
    const x1 = markerTimeX(entryMarker,vis,mapX,slot);
    const x2 = markerTimeX(exitMarker,vis,mapX,slot);
    if(x1 === null || x2 === null) return null;
    return {x1,y1:mapY(n15(entryMarker.price)),x2,y2:mapY(n15(exitMarker.price))};
  }

  function segmentFromLink15(l,vis,mapX,mapY,slot){
    if(!linkTimeOverlap15(l,vis)) return null;
    return segmentFromMarkers15(marker15(l.entryMarkerId),marker15(l.exitMarkerId),vis,mapX,mapY,slot);
  }

  function visibleByIsoMarker15(id){ return !isoOn15() || isMarkerVisibleInIsolate(id); }
  function visibleByIsoLink15(l){ return !isoOn15() || isClosedLinkVisibleInIsolate(l); }
  function visibleByIsoRecord15(rec){
    if(!isoOn15()) return true;
    return rec.markers.some(m => visibleByIsoMarker15(m.id)) || rec.links.some(l => visibleByIsoLink15(l));
  }

  function reserveLabel15(txt,x,y,col,clip,placed,opt={}){
    ctx.save();
    ctx.font = opt.font || '11px Arial';
    const pad = opt.pad == null ? 4 : opt.pad;
    const w = ctx.measureText(txt).width + pad*2;
    const h = opt.h || 16;
    const fixedX = !!opt.fixedX;
    const fillBg = opt.fillBg !== false;
    const edge = opt.edge || null;
    const baseX = x + (Number(opt.xShift) || 0);
    const baseY = edge === 'top' ? (clip.top + (Number(opt.edgeMargin) || 26)) : edge === 'bottom' ? (clip.top + clip.height - (Number(opt.edgeMargin) || 26)) : y;
    const offsets = opt.offsets || (edge === 'top' ? [0,24,48,72,96,120] : edge === 'bottom' ? [0,-24,-48,-72,-96,-120] : [-12,12,-28,28,-44,44,-60,60,-76,76]);
    let chosen = null;
    for(const off of offsets){
      const cx = fixedX ? baseX : clamp(baseX, clip.left+w/2+2, clip.left+clip.width-w/2-2);
      const cy = clamp(baseY + off, clip.top+h/2+2, clip.top+clip.height-h/2-2);
      const r = {x1:cx-w/2-2,y1:cy-h/2-2,x2:cx+w/2+2,y2:cy+h/2+2,cx,cy};
      const hit = placed.some(p => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
      if(!hit){ chosen = r; break; }
      if(!chosen) chosen = r;
    }
    placed.push(chosen);
    if(fillBg){
      ctx.fillStyle = opt.bg || 'rgba(255,255,255,.94)';
      ctx.strokeStyle = col;
      ctx.lineWidth = hairline();
      ctx.fillRect(ix(chosen.cx-w/2),ix(chosen.cy-h/2),w,h);
      ctx.strokeRect(px(chosen.cx-w/2),px(chosen.cy-h/2),w,h);
    }
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt,chosen.cx,chosen.cy+.5);
    if(opt.hit && Array.isArray(overlayHitItems)){
      overlayHitItems.push({kind:'plbox',x1:chosen.cx-w/2,y1:chosen.cy-h/2,x2:chosen.cx+w/2,y2:chosen.cy+h/2,x:chosen.cx,y:chosen.cy,markerId:opt.hit.markerId,chainId:opt.hit.chainId,parentTradeId:opt.hit.parentTradeId});
    }
    ctx.restore();
  }

  function drawMarker15(m,vis,mapX,mapY,slot,force=false){
    if(!m || (!force && !inTime(m.time,vis))) return;
    const x = markerTimeX(m,vis,mapX,slot);
    if(x === null || x < -50 || x > canvas.clientWidth + 50) return;
    const y = mapY(n15(m.price));
    if(m.role === 'close') m.letter = m.isFinalExit ? 'EX' : 'P';
    let col = m.side === 'SHORT' || m.letter === 'S' || m.letter === 'ES' ? '#f6465d' : '#0ecb81';
    if(m.role === 'close') col = m.unresolved ? '#f59e0b' : (m.side === 'SHORT' ? '#f6465d' : '#0ecb81');
    circle(ix(x),ix(y),m.letter,col,m.unresolved);
    overlayHitItems.push({kind:'marker',markerId:m.id,role:m.role,side:m.side,letter:m.letter,x,y,radius:m.unresolved ? 11 : Math.max(9, String(m.letter||'').length > 1 ? 14 : 7),qty:m.qty,price:m.price,time:m.time,pnl:m.pnl,fee:m.fee || 0,unresolved:m.unresolved,chainId:cid15(m),parentTradeId:cid15(m),note:m.note || ''});
  }

  function drawSimplifiedTrades15(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    const activeOpenChains = activeOpenChainIds15(cfg().symbol);
    for(const rec of allParentTrades15()){
      if(!visibleByIsoRecord15(rec)) continue;
      if(activeOpenChains.has(rec.parentId)) continue;
      const first = rec.firstEntry;
      const ex = rec.finalExit && rec.finalExit.marker;
      if(!first || !ex) continue;
      const synthetic = {entryTime:first.time, exitTime:ex.time};
      if(!linkTimeOverlap15(synthetic,vis)) continue;
      const s = segmentFromMarkers15(first,ex,vis,mapX,mapY,slot);
      if(!s) continue;
      const col = rec.netTotal >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .9 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:'simple_'+rec.parentId,qty:rec.totalLots,side:rec.dir,open:false,chainId:rec.parentId,parentTradeId:rec.parentId});
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      reserveLabel15((typeof fmPnlBox==='function'?fmPnlBox(rec.netTotal):fm(rec.netTotal).replace(/[+-]/,'')),mx,my - 18,col,clip,placedLabels,{fixedX:true,font:'bold 12px Arial',pad:6,h:20,offsets:[0,-18,-36,18,36,-54,54],hit:{markerId:ex.id,chainId:rec.parentId,parentTradeId:rec.parentId}});
      if(showLots) reserveLabel15(fq(rec.totalLots),mx,my + 18,col,clip,placedLabels,{fixedX:true,offsets:[0,16,32,-16,-32,48,-48]});
      if(inTime(first.time,vis)) drawMarker15(first,vis,mapX,mapY,slot);
      if(inTime(ex.time,vis)) drawMarker15(ex,vis,mapX,mapY,slot);
    }
  }

  function drawFullTrades15(vis,mapX,mapY,slot,clip,showLots,placedLabels){
    const activeOpenChains = activeOpenChainIds15(cfg().symbol);
    for(const l of pairLinks15()){
      if(l.symbol !== cfg().symbol) continue;
      if(activeOpenChains.has(cid15(l))) continue;
      if(!visibleByIsoLink15(l)) continue;
      const s = segmentFromLink15(l,vis,mapX,mapY,slot);
      if(!s) continue;
      const col = netValue15(l) >= 0 ? '#1e88e5' : '#f6465d';
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.globalAlpha = .86 * (typeof getClosedLinkAlpha === 'function' ? getClosedLinkAlpha() : 1);
      ctx.beginPath();
      ctx.moveTo(px(s.x1),px(s.y1));
      ctx.lineTo(px(s.x2),px(s.y2));
      ctx.stroke();
      ctx.globalAlpha = 1;
      overlayHitItems.push({kind:'line',...s,id:l.id,qty:l.qty,side:l.side,orderId:l.orderId,open:false,chainId:cid15(l),parentTradeId:cid15(l)});
      if(showLots) reserveLabel15(fq(l.qty),(s.x1+s.x2)/2,(s.y1+s.y2)/2,col,clip,placedLabels);
    }
    for(const m of fillMarkers || []){
      if(m.symbol !== cfg().symbol || !visibleByIsoMarker15(m.id)) continue;
      if(activeOpenChains.has(cid15(m))) continue;
      drawMarker15(m,vis,mapX,mapY,slot);
      if(m.role === 'close' && !m.unresolved && inTime(m.time,vis)){
        const ev = exitEvent15(m.id);
        const x = markerTimeX(m,vis,mapX,slot);
        if(x !== null){
          const y = mapY(n15(m.price));
          const recForExVal15 = (ev && ev.type === 'EX') ? tradeRecord15(parentIdFromMarker15(m.id)) : null;
          const val = recForExVal15 ? recForExVal15.netTotal : (ev ? ev.pnl : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl));
          const isExLabel15 = !!(m.isFinalExit || m.letter === 'EX');
          const labelColor15 = val >= 0 ? '#1e88e5' : '#f6465d';
          const labelOpt15 = isExLabel15
            ? {fixedX:false,edge:(val >= 0 ? 'top' : 'bottom'),edgeMargin:(val >= 0 ? 46 : 28),xShift:8,font:'bold 13px Arial',pad:7,h:22,bg:(val >= 0 ? '#eaf3ff' : '#ffe8ec'),offsets:(val >= 0 ? [0,10,20,30,40,50,60,70,80] : [0,-10,-20,-30,-40,-50,-60,-70,-80]),hit:{markerId:m.id,chainId:cid15(m),parentTradeId:cid15(m)}}
            : {fixedX:true,offsets:[-24,24,-40,40,-56,56,-72,72]};
          reserveLabel15((typeof fmPnlBox==='function'?fmPnlBox(val):fm(val).replace(/[+-]/,'')),x,y,labelColor15,clip,placedLabels,labelOpt15);
        }
      }
    }
  }

  function drawOpenOverlay15(vis,mapX,mapY,slot,clip,placedLabels){
    const sym = cfg().symbol;
    const latest = candles.length ? candles[candles.length-1] : null;
    if(!latest) return;
    const openChains = currentOpenRenderChainIds15(sym);

    // Open round position icons: always visible regardless of closed-trade toggles.
    for(const m of fillMarkers || []){
      if(m.symbol !== sym || !openEntryMarkerIds || !openEntryMarkerIds.has(m.id)) continue;
      if(!inTime(m.time,vis)) continue;
      drawMarker15(m,vis,mapX,mapY,slot,true);
    }

    // Active-parent partial exits are live open-position visuals, independent of Trades / Positions.
    for(const m of fillMarkers || []){
      if(m.symbol !== sym || m.role !== 'close' || m.unresolved || !openChains.has(cid15(m))) continue;
      if(!inTime(m.time,vis)) continue;
      m.letter = 'P';
      m.isFinalExit = false;
      drawMarker15(m,vis,mapX,mapY,slot,true);
      const x = markerTimeX(m,vis,mapX,slot);
      if(x === null) continue;
      const y = mapY(n15(m.price));
      const links = (resultLinks || []).filter(l => l.exitMarkerId === m.id);
      const val = links.length ? realizedSum15(links) : n15(m.binanceRealizedPnl ?? m.realizedPnl ?? m.pnl);
      const col = val >= 0 ? '#1e88e5' : '#f6465d';
      reserveLabel15((typeof fmPnlBox === 'function' ? fmPnlBox(val) : fm(val).replace(/[+-]/,'')),x,y - 18,col,clip,placedLabels,{fixedX:true,offsets:[-24,24,-40,40,-56,56,-72,72]});
    }

    // Open lot connectors and lot labels: independent of Trades / Positions / Lots.
    for(const l of openLotLinks || []){
      if(l.symbol !== sym) continue;
      const em = marker15(l.entryMarkerId);
      const x1 = em ? markerTimeX(em,vis,mapX,slot) : eventX15(l.entryTime,vis,mapX);
      const x2 = eventX15(latest.time,vis,mapX);
      if(x1 === null || x2 === null) continue;
      const y1 = mapY(n15(l.entryPrice));
      const y2 = mapY(n15(latest.close));
      const floating = sideDir15(l.side) === 'LONG' ? (n15(latest.close) - n15(l.entryPrice)) * n15(l.qty) : (n15(l.entryPrice) - n15(latest.close)) * n15(l.qty);
      const col = floating >= 0 ? 'rgba(30,136,229,.42)' : 'rgba(246,70,93,.42)';
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = getClosedLinkWidth();
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(px(x1),px(y1));
      ctx.lineTo(px(x2),px(y2));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // PATCH_17: open-position lot tags removed from chart; breakdown is tooltip-only.
      overlayHitItems.push({kind:'line',x1,y1,x2,y2,qty:l.qty,side:l.side,entryPrice:l.entryPrice,exitPrice:latest.close,open:true,entryMarkerId:l.entryMarkerId,chainId:cid15(l),parentTradeId:cid15(l)});
    }

    for(const b of openPositionBoxes || []){
      if(b.symbol !== sym) continue;
      const y = mapY(n15(b.price));
      if(y < clip.top - 30 || y > clip.top + clip.height + 30) continue;
      const liveX = eventX15(latest.time,vis,mapX);
      if(liveX === null) continue;
      const boxCol = b.letter === 'B' ? '#0ecb81' : '#f6465d';
      const boxBg = b.stale ? 'rgba(245,158,11,.14)' : (b.letter === 'B' ? 'rgba(14,203,129,.12)' : 'rgba(246,70,93,.10)');
      const lineCol = b.stale ? 'rgba(245,158,11,.72)' : 'rgba(156,163,175,.72)';
      const floating = openBoxFloating(b,n15(latest.close));
      const distance = b.letter === 'B' ? n15(latest.close) - n15(b.price) : n15(b.price) - n15(latest.close);
      const pctMargin = pnlPctOfMargin(floating,b);
      const per100 = valuePer100Move(b);
      const boxText = b.stale ? 'STALE' : (b.side === 'SHORT' ? 'SHORT' : 'LONG');
      const topText = (b.stale ? 'STALE | ' : '') + fq(b.qty) + ' | ' + fm(floating) + ' | ' + (pctMargin == null ? '--' : pct(pctMargin));
      const bottomText = 'Δ ' + fd(distance) + ' | ' + (per100 == null ? '--' : fm(per100));
      ctx.save();
      ctx.font = '12px Arial';
      const widestText = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
      // PATCH_15: another 2 candle widths right from PATCH_14 placement.
      let boxX = clamp(liveX + slot*10, clip.left+26, clip.left+clip.width-92);
      const candleClearX = liveX + Math.max(slot*5.75,18);
      boxX = clamp(Math.max(boxX,candleClearX + widestText/2 + 4), clip.left+26, clip.left+clip.width-92);
      ctx.font = 'bold 10px Arial';
      const markerW = Math.max(38, Math.ceil(ctx.measureText(boxText).width + 10));
      const leftEdge = boxX - markerW/2;
      const rightEdge = boxX + markerW/2;
      const lineLeft = clamp(liveX - slot*3, clip.left, clip.left+clip.width);
      const lineRight = clamp(boxX + 72, clip.left, clip.left+clip.width-86);
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = hairline();
      ctx.setLineDash([]);
      ctx.beginPath();
      if(lineLeft < leftEdge){ ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftEdge),px(y)); }
      if(rightEdge < lineRight){ ctx.moveTo(px(rightEdge),px(y)); ctx.lineTo(px(lineRight),px(y)); }
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = '14px Arial';
      ctx.fillStyle = b.stale ? '#b45309' : (floating > 0 ? '#047857' : floating < 0 ? '#7f1d1d' : '#111');
      ctx.fillText(topText,boxX,y-22);
      ctx.font = '12px Arial';
      ctx.fillStyle = '#111';
      ctx.fillText(bottomText,boxX,y+22);
      ctx.textAlign = 'left';
      ctx.fillText(p2(b.price),clamp(lineRight+6,clip.left+2,clip.left+clip.width-74),y);
      ctx.restore();
      positionBoxMarker(ix(boxX),ix(y),boxText,boxCol,boxBg);
      overlayHitItems.push({kind:'box',letter:b.letter,x:boxX,y,size:18,qty:b.qty,price:b.price,boxData:b,chainId:cid15(b),parentTradeId:cid15(b)});
    }
  }

  tradeOverlays = function(vis,mapX,mapY,slot,clip){
    const tradesOn = !!(tglResults && tglResults.checked);
    const positionsOn = tradesOn && !!(tglPositions && tglPositions.checked);
    const lotsOn = tradesOn && !!(tglLots && tglLots.checked);
    const placedLabels = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();
    if(tradesOn){
      if(positionsOn) drawFullTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
      else drawSimplifiedTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);
    }
    drawOpenOverlay15(vis,mapX,mapY,slot,clip,placedLabels);
    ctx.restore();
  };

  function lineDist15(px0,py0,x1,y1,x2,y2){
    const dx = x2-x1, dy = y2-y1, len = dx*dx + dy*dy;
    if(!len) return Math.hypot(px0-x1,py0-y1);
    const t = Math.max(0,Math.min(1,((px0-x1)*dx+(py0-y1)*dy)/len));
    return Math.hypot(px0-(x1+t*dx),py0-(y1+t*dy));
  }

  hoverItem = function(){
    if(!mouse) return null;
    let best = null, bd = Infinity;
    for(const it of overlayHitItems || []){
      if(it.kind !== 'marker') continue;
      const d = Math.hypot(mouse.x-it.x,mouse.y-it.y);
      if(d <= (it.radius || 8) + 10 && d < bd){ bd = d; best = it; }
    }
    if(best) return best;
    for(const it of overlayHitItems || []){
      if(it.kind === 'box' && mouse.x >= it.x - it.size/2 - 6 && mouse.x <= it.x + it.size/2 + 6 && mouse.y >= it.y - it.size/2 - 6 && mouse.y <= it.y + it.size/2 + 6) return it;
    }
    for(const it of overlayHitItems || []){
      if(it.kind !== 'line') continue;
      if(lineDist15(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
    }
    return null;
  };

  drawHoverTooltip = function(){
    const it = hoverItem();
    if(!it || !mouse) return;
    if(it.kind === 'marker'){
      const m = marker15(it.markerId);
      if(m && m.role === 'close' && m.isFinalExit){
        const lines = fullTradeTooltip15(parentIdFromMarker15(it.markerId));
        if(lines.length){ coloredClosedTooltip15(lines,mouse.x,mouse.y); return; }
      }
      if(m && m.role === 'close') coloredClosedTooltip15(markerOwnTooltip15(it.markerId),mouse.x,mouse.y);
      else tooltip(markerOwnTooltip15(it.markerId),mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'line'){
      tooltip(it.open ? ['Open connector','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side] : ['Trade link','Size: ' + fq(it.qty) + ' BTC','Side: ' + it.side],mouse.x,mouse.y);
      return;
    }
    if(it.kind === 'box'){
      const floating = candles.length ? openBoxFloating(it.boxData,candles[candles.length-1].close) : null;
      const margin = openBoxMargin(it.boxData);
      const lines = [it.boxData && it.boxData.stale ? 'Open position status stale' : (it.letter === 'B' ? 'Current open long' : 'Current open short'),'Size: ' + fq(it.qty) + ' BTC','Entry price: ' + p2(it.price),'Margin: ' + (margin == null ? '-' : fm(margin))];
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      tooltip(lines,mouse.x,mouse.y);
    }
  };

  // Stable Y range: overlay toggles must not resize/pan the chart. Closed overlays no longer affect auto scale.
  autoYRange = function(vis){
    return candleOnlyYRange(vis);
  };

  function centerLastAndResetY15(){
    manualY = false;
    yMin = null;
    yMax = null;
    if(candles && candles.length){
      const maxFut = Math.max(0, Math.floor(visibleCount * MAX_FUTURE_RATIO));
      rightOffset = -Math.min(maxFut, Math.floor(visibleCount/2));
      clampView();
    }
    draw();
  }

  // PATCH_15: End key = double-click chart reset behavior.
  window.addEventListener('keydown',e => {
    if(e.key !== 'End') return;
    const tag = (document.activeElement && document.activeElement.tagName || '').toUpperCase();
    if(tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    centerLastAndResetY15();
  },true);

  // Also enforce the same behavior on chart double-click, after older handlers.
  try{
    canvas.addEventListener('dblclick',e => {
      if(typeof rightAxis === 'function' && rightAxis(e.offsetX)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      centerLastAndResetY15();
    },true);
  }catch(e){}

  // Preserve viewport around toggle redraws; the toggle only changes overlays.
  function restoreViewAfterToggle15(){
    const keep = {rightOffset,visibleCount,manualY,yMin,yMax};
    requestAnimationFrame(() => {
      rightOffset = keep.rightOffset;
      visibleCount = keep.visibleCount;
      manualY = keep.manualY;
      yMin = keep.yMin;
      yMax = keep.yMax;
      draw();
    });
  }
  [tglResults,tglPositions,tglLots].forEach(el => {
    if(!el || el.__p15NoShift) return;
    el.__p15NoShift = true;
    el.addEventListener('change',restoreViewAfterToggle15,false);
  });

  try{ draw(); }catch(e){ console.error('PATCH_15 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_17 — Open-position tooltip cleanup
     - Removes open-position floating lot tags from chart lines.
     - Shows open-lot breakdown in the open-position tooltip.
     - Formats BTC entry prices without trailing decimal places.
  ========================================================= */

  const num17 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const marker17 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const side17 = side => String(side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const cleanPrice17 = v => {
    const n = Number(v);
    if(!Number.isFinite(n)) return '-';
    return Math.round(n).toLocaleString('en-US');
  };

  const prevDrawHover17 = typeof drawHoverTooltip === 'function' ? drawHoverTooltip : null;

  function openLotBreakdown17(symbol,current){
    return (openLotLinks || [])
      .filter(l => !symbol || l.symbol === symbol)
      .slice()
      .sort((a,b) => num17(a.entryTime) - num17(b.entryTime))
      .map(l => {
        const m = marker17(l.entryMarkerId);
        const tag = m && m.letter ? m.letter : 'E';
        const qty = typeof fq === 'function' ? fq(l.qty) : String(l.qty);
        const entry = cleanPrice17(l.entryPrice);
        let floating = null;
        if(current != null){
          floating = side17(l.side) === 'SHORT'
            ? (num17(l.entryPrice) - num17(current)) * num17(l.qty)
            : (num17(current) - num17(l.entryPrice)) * num17(l.qty);
        }
        return `${tag} ${qty} | ${entry} | ${floating == null ? '-' : fm(floating)}`;
      });
  }

  drawHoverTooltip = function(){
    const it = typeof hoverItem === 'function' ? hoverItem() : null;
    if(!it || !mouse){ return; }

    if(it.kind === 'box'){
      const latest = candles && candles.length ? candles[candles.length-1] : null;
      const current = latest ? latest.close : null;
      const floating = current != null ? openBoxFloating(it.boxData,current) : null;
      const margin = openBoxMargin(it.boxData);
      const symbol = it.boxData && it.boxData.symbol ? it.boxData.symbol : (typeof cfg === 'function' ? cfg().symbol : null);
      const title = it.boxData && it.boxData.stale
        ? 'Open position status stale'
        : (it.letter === 'B' ? 'Current open long' : 'Current open short');
      const lines = [
        title,
        'Size: ' + fq(it.qty) + ' BTC',
        'Entry price: ' + cleanPrice17(it.price),
        'Margin: ' + (margin == null ? '-' : fm(margin))
      ];
      if(floating != null) lines.push('Floating P/L: ' + fm(floating));
      const breakdown = openLotBreakdown17(symbol,current);
      if(breakdown.length){
        lines.push('Open lots:');
        lines.push(...breakdown);
      }
      tooltip(lines,mouse.x,mouse.y);
      return;
    }

    if(prevDrawHover17){ prevDrawHover17(); }
  };

  try{ if(typeof draw === 'function') draw(); }catch(e){ console.error('PATCH_17 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_18
     - Floating P/L toggle controls current open-position chart visuals.
     - Indicator thickness sliders 1–10 / step 0.5.
     - Draws larger EX P/L tags with pale P/L background.
  ========================================================= */

  const n18 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cid18 = o => o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  const marker18 = id => (Array.isArray(fillMarkers) ? fillMarkers.find(m => m.id === id) : null) || null;
  const sort18 = (a,b) => (n18(a.time)-n18(b.time)) || String(a.id||'').localeCompare(String(b.id||''));
  const THICK_KEYS18 = {
    ema1:'btc_futures_chart_v13_18_ema1_width',
    ema2:'btc_futures_chart_v13_18_ema2_width',
    ema3:'btc_futures_chart_v13_18_ema3_width',
    vwap:'btc_futures_chart_v13_18_vwap_width'
  };
  const STYLE_KEYS18 = {
    ema1Color:'btc_futures_chart_v13_05_ema1_color', ema1Alpha:'btc_futures_chart_v13_05_ema1_alpha',
    ema2Color:'btc_futures_chart_v13_05_ema2_color', ema2Alpha:'btc_futures_chart_v13_05_ema2_alpha',
    ema3Color:'btc_futures_chart_v13_05_ema3_color', ema3Alpha:'btc_futures_chart_v13_05_ema3_alpha',
    vwapColor:'btc_futures_chart_v13_05_vwap_color', vwapAlpha:'btc_futures_chart_v13_05_vwap_alpha'
  };
  const STYLE_DEF18 = {
    ema1Color:'#3b82f6', ema1Alpha:'100',
    ema2Color:'#a855f7', ema2Alpha:'100',
    ema3Color:'#14b8a6', ema3Alpha:'100',
    vwapColor:'#f59e0b', vwapAlpha:'100'
  };

  function currentIndicatorWidth18(key,fallback=2){
    const v = Number(localStorage.getItem(THICK_KEYS18[key] || '') || fallback);
    return Number.isFinite(v) ? Math.max(1,Math.min(10,v)) : fallback;
  }

  function ensureFloatingToggle18(){
    if(document.getElementById('tglFloatingPL')) return document.getElementById('tglFloatingPL');
    const wrap = document.querySelector('.toggles');
    if(!wrap) return null;
    const label = document.createElement('label');
    label.className = 'p18-floating-toggle-label';
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '4px';
    label.style.whiteSpace = 'nowrap';
    const checked = localStorage.getItem('btc_futures_chart_v13_18_floating_pl_on') !== '0';
    label.innerHTML = `<input id="tglFloatingPL" type="checkbox" ${checked ? 'checked' : ''}> <span>Floating P/L</span>`;
    const conn = document.getElementById('connWrap');
    wrap.insertBefore(label, conn || null);
    const el = label.querySelector('input');
    el.addEventListener('change',() => {
      localStorage.setItem('btc_futures_chart_v13_18_floating_pl_on', el.checked ? '1' : '0');
      try{ if(typeof draw === 'function') draw(); }catch(e){}
    });
    window.tglFloatingPL = el;
    return el;
  }
  const tglFloatingPL18 = ensureFloatingToggle18();

  function v18(id,fallback=''){
    const el = document.getElementById(id);
    return el && el.value !== '' ? el.value : fallback;
  }
  function styleVal18(key){ return localStorage.getItem(STYLE_KEYS18[key]) || STYLE_DEF18[key] || ''; }
  function widthVal18(key){ return localStorage.getItem(THICK_KEYS18[key]) || '2'; }
  function row18(name,periodId,colorId,alphaId,widthId,key,periodFallback){
    const period = periodId
      ? `<input id="${periodId}" type="number" min="1" max="999" step="1" value="${v18(periodId, v18(periodId.replace('patch8Ema','emaPeriod').replace('Period',''), periodFallback))}">`
      : `<span style="color:var(--muted)">—</span>`;
    return `
      <div>${name}</div>
      <div>${period}</div>
      <input id="${colorId}" type="color" value="${styleVal18(key+'Color')}">
      <input id="${alphaId}" type="range" min="0" max="100" step="1" value="${styleVal18(key+'Alpha')}">
      <input id="${widthId}" type="range" min="1" max="10" step="0.5" value="${widthVal18(key)}" title="Thickness">`;
  }

  function rebuildIndicatorSettings18(){
    const card = document.getElementById('patch8IndicatorCard');
    if(!card) return;
    const desc = card.querySelector('.settings-card-desc');
    if(desc) desc.textContent = 'Set period, color, transparency, and thickness in one row per indicator.';
    const grid = card.querySelector('.patch8-indicator-grid');
    if(!grid) return;
    grid.innerHTML = `
      <div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div><div class="patch8-head">Thickness</div>
      ${row18('EMA 1','patch8Ema1Period','patch8Ema1Color','patch8Ema1Alpha','patch18Ema1Width','ema1',v18('emaPeriod1','20'))}
      ${row18('EMA 2','patch8Ema2Period','patch8Ema2Color','patch8Ema2Alpha','patch18Ema2Width','ema2',v18('emaPeriod2','50'))}
      ${row18('EMA 3','patch8Ema3Period','patch8Ema3Color','patch8Ema3Alpha','patch18Ema3Width','ema3',v18('emaPeriod3','100'))}
      ${row18('VWAP',null,'patch8VWAPColor','patch8VWAPAlpha','patch18VWAPWidth','vwap','')}`;

    const periodMap = [
      ['patch8Ema1Period','emaPeriod1'],
      ['patch8Ema2Period','emaPeriod2'],
      ['patch8Ema3Period','emaPeriod3']
    ];
    periodMap.forEach(([from,to]) => {
      const src = document.getElementById(from);
      const dst = document.getElementById(to);
      if(!src || !dst) return;
      const sync = () => {
        dst.value = src.value;
        if(typeof saveEmaSettings === 'function') saveEmaSettings();
        else if(typeof draw === 'function') draw();
      };
      src.addEventListener('input', sync);
      src.addEventListener('change', sync);
    });

    const styleMap = [
      ['patch8Ema1Color','ema1Color'],['patch8Ema1Alpha','ema1Alpha'],
      ['patch8Ema2Color','ema2Color'],['patch8Ema2Alpha','ema2Alpha'],
      ['patch8Ema3Color','ema3Color'],['patch8Ema3Alpha','ema3Alpha'],
      ['patch8VWAPColor','vwapColor'],['patch8VWAPAlpha','vwapAlpha']
    ];
    styleMap.forEach(([id,key]) => {
      const el = document.getElementById(id);
      if(!el) return;
      const sync = () => {
        localStorage.setItem(STYLE_KEYS18[key], el.value);
        if(typeof draw === 'function') draw();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });

    const widthMap = [
      ['patch18Ema1Width','ema1'],['patch18Ema2Width','ema2'],['patch18Ema3Width','ema3'],['patch18VWAPWidth','vwap']
    ];
    widthMap.forEach(([id,key]) => {
      const el = document.getElementById(id);
      if(!el) return;
      const sync = () => {
        localStorage.setItem(THICK_KEYS18[key], String(Math.max(1,Math.min(10,Number(el.value)||2))));
        if(typeof draw === 'function') draw();
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });
  }
  rebuildIndicatorSettings18();

  // Make drawInd use the latest indicator key's thickness without rewriting the chart renderer.
  const prevGetStroke18 = typeof getIndicatorStroke === 'function' ? getIndicatorStroke : null;
  if(prevGetStroke18){
    window.getIndicatorStroke = function(key,fallback){
      window.__patch18LastIndicatorKey = key;
      return prevGetStroke18(key,fallback);
    };
  }
  const prevDrawInd18 = typeof drawInd === 'function' ? drawInd : null;
  if(prevDrawInd18){
    window.drawInd = drawInd = function(points,vis,map,mapX,mapY,color,w){
      const key = window.__patch18LastIndicatorKey;
      const width = key && THICK_KEYS18[key] ? currentIndicatorWidth18(key,w || 2) : (w || 2);
      /* R4 isolation: consume the indicator width key once. Prevent VWAP thickness from leaking into later MA4/MA5 draw calls. */
      window.__patch18LastIndicatorKey = null;
      return prevDrawInd18(points,vis,map,mapX,mapY,color,width);
    };
  }

  function parentIdFromMarker18(markerId){
    const m = marker18(markerId);
    if(cid18(m)) return cid18(m);
    const l = (resultLinks || []).find(x => x.entryMarkerId === markerId || x.exitMarkerId === markerId)
      || (openLotLinks || []).find(x => x.entryMarkerId === markerId);
    return cid18(l);
  }
  function tradeRecord18(parentId){
    if(!parentId) return null;
    const markers = (fillMarkers || []).filter(m => cid18(m) === parentId).slice().sort(sort18);
    const links = (resultLinks || []).filter(l => cid18(l) === parentId).slice();
    const exits = markers.filter(m => m.role === 'close' && !m.unresolved).sort(sort18).map(m => {
      const eventLinks = links.filter(l => l.exitMarkerId === m.id);
      const pnl = eventLinks.length ? eventLinks.reduce((a,l) => a + n18(l.netPnl),0) : n18(m.pnl);
      return {marker:m,type:m.isFinalExit ? 'EX' : 'P',qty:Math.abs(n18(m.qty)),pnl,time:n18(m.time),price:n18(m.price)};
    });
    const total = exits.reduce((a,e) => a + n18(e.pnl),0);
    return {parentId,markers,links,exits,total};
  }
  function bigExTag18(txt,x,y,val,clip,placed){
    const col = val >= 0 ? '#1e88e5' : '#f6465d';
    const bg = val >= 0 ? 'rgba(30,136,229,.14)' : 'rgba(246,70,93,.14)';
    ctx.save();
    ctx.font = 'bold 13px Arial';
    const padX = 7, h = 22, w = ctx.measureText(txt).width + padX*2;
    const offsets = [-28,28,-52,52,-76,76,-100,100];
    let chosen = null;
    for(const off of offsets){
      const cx = x;
      const cy = Math.max(clip.top + h/2 + 2, Math.min(clip.top + clip.height - h/2 - 2, y + off));
      const r = {x1:cx-w/2-3,y1:cy-h/2-3,x2:cx+w/2+3,y2:cy+h/2+3,cx,cy};
      const hit = (placed || []).some(p => !(r.x2 < p.x1 || r.x1 > p.x2 || r.y2 < p.y1 || r.y1 > p.y2));
      if(!hit){ chosen = r; break; }
      if(!chosen) chosen = r;
    }
    if(placed) placed.push(chosen);
    ctx.fillStyle = bg;
    ctx.strokeStyle = col;
    ctx.lineWidth = hairline();
    ctx.fillRect(ix(chosen.cx-w/2),ix(chosen.cy-h/2),w,h);
    ctx.strokeRect(px(chosen.cx-w/2),px(chosen.cy-h/2),w,h);
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt,chosen.cx,chosen.cy+.5);
    ctx.restore();
  }
  function drawBigExTags18(vis,mapX,mapY,slot,clip){
    if(!(tglResults && tglResults.checked)) return;
    if(!(tglPositions && tglPositions.checked)) return;
    const placed = [];
    for(const m of fillMarkers || []){
      if(m.symbol !== (typeof cfg === 'function' ? cfg().symbol : m.symbol)) continue;
      if(m.role !== 'close' || !m.isFinalExit || m.unresolved) continue;
      if(typeof inTime === 'function' && !inTime(m.time,vis)) continue;
      if(typeof isIsolateActive === 'function' && isIsolateActive() && typeof isMarkerVisibleInIsolate === 'function' && !isMarkerVisibleInIsolate(m.id)) continue;
      const x = typeof markerTimeX === 'function' ? markerTimeX(m,vis,mapX,slot) : null;
      if(x === null || x === undefined) continue;
      const y = mapY(n18(m.price));
      const rec = tradeRecord18(parentIdFromMarker18(m.id));
      const ev = rec && rec.exits ? rec.exits.find(e => e.marker.id === m.id) : null;
      const val = (ev && ev.type === 'EX' && rec) ? rec.total : (ev ? ev.pnl : n18(m.pnl));
      bigExTag18(fm(val),x,y,val,clip,placed);
    }
  }

  const prevTradeOverlays18 = typeof tradeOverlays === 'function' ? tradeOverlays : null;
  if(prevTradeOverlays18){
    tradeOverlays = function(vis,mapX,mapY,slot,clip){
      const floatingOn = !tglFloatingPL18 || tglFloatingPL18.checked;
      let savedBoxes, savedLinks, savedOpenIds;
      if(!floatingOn){
        savedBoxes = openPositionBoxes;
        savedLinks = openLotLinks;
        savedOpenIds = openEntryMarkerIds;
        openPositionBoxes = [];
        openLotLinks = [];
        openEntryMarkerIds = new Set();
      }
      try{
        prevTradeOverlays18(vis,mapX,mapY,slot,clip);
      }finally{
        if(!floatingOn){
          openPositionBoxes = savedBoxes;
          openLotLinks = savedLinks;
          openEntryMarkerIds = savedOpenIds;
        }
      }
      // PATCH_19: no separate EX P/L tag; style the existing tag only.
    };
  }

  try{ if(typeof draw === 'function') draw(); }catch(e){ console.error('PATCH_18 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_19
     - Existing EX P/L tag is styled in-place; no duplicate EX tag.
     - Indicator settings rows tightened to fit sliders.
     - Closed trade links get transparency + width 1–10 / step 0.25.
  ========================================================= */

  const CLOSED_WIDTH_KEY19 = 'btc_futures_chart_v13_05_closed_width';
  const CLOSED_ALPHA_KEY19 = 'btc_futures_chart_v13_19_closed_alpha';

  window.getClosedLinkWidth = function(){
    const v = Number(localStorage.getItem(CLOSED_WIDTH_KEY19) || '1');
    return Number.isFinite(v) ? Math.max(1,Math.min(10,v)) : 1;
  };

  window.getClosedLinkAlpha = function(){
    const v = Number(localStorage.getItem(CLOSED_ALPHA_KEY19) || '100');
    return Number.isFinite(v) ? Math.max(0,Math.min(100,v)) / 100 : 1;
  };

  function bindRange19(id,key,outId,normalize){
    const el = document.getElementById(id);
    if(!el) return;
    const out = document.getElementById(outId);
    const sync = () => {
      const val = normalize ? normalize(el.value) : el.value;
      el.value = val;
      localStorage.setItem(key,String(val));
      if(out) out.textContent = String(val);
      if(typeof draw === 'function') draw();
    };
    el.addEventListener('input',sync);
    el.addEventListener('change',sync);
  }

  function rebuildClosedLinksCard19(){
    const card = document.getElementById('patch5ClosedCard');
    if(!card) return;
    const width = window.getClosedLinkWidth();
    const alpha = Math.round(window.getClosedLinkAlpha() * 100);
    card.innerHTML = `
      <div class="settings-card-title">Closed trade links</div>
      <div class="settings-card-desc">Thickness and transparency for closed-trade connector lines.</div>
      <div class="p19-closed-grid">
        <span>Thickness</span>
        <input id="patch19ClosedWidth" type="range" min="1" max="10" step="0.25" value="${width}">
        <span id="patch19ClosedWidthVal">${width}</span>
        <span>Transparency</span>
        <input id="patch19ClosedAlpha" type="range" min="0" max="100" step="1" value="${alpha}">
        <span id="patch19ClosedAlphaVal">${alpha}</span>
      </div>`;
    bindRange19('patch19ClosedWidth',CLOSED_WIDTH_KEY19,'patch19ClosedWidthVal',v => Math.max(1,Math.min(10,Number(v)||1)));
    bindRange19('patch19ClosedAlpha',CLOSED_ALPHA_KEY19,'patch19ClosedAlphaVal',v => Math.max(0,Math.min(100,Number(v)||100)));
  }

  function tightenIndicatorRows19(){
    const card = document.getElementById('patch8IndicatorCard');
    if(!card) return;
    const nums = card.querySelectorAll('.patch8-indicator-grid input[type="number"]');
    nums.forEach(el => {
      el.style.width = '52px';
      el.style.minWidth = '52px';
      el.style.textAlign = 'center';
    });
    const ranges = card.querySelectorAll('.patch8-indicator-grid input[type="range"]');
    ranges.forEach(el => {
      el.style.width = '100%';
      el.style.maxWidth = '128px';
    });
  }

  rebuildClosedLinksCard19();
  tightenIndicatorRows19();

  try{ if(typeof draw === 'function') draw(); }catch(e){ console.error('PATCH_19 draw failed',e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_20
     - One unified P/L tag format; no smaller old-style P/L tag.
     - Floating P/L visibility control moved from titled toolbar toggle
       to a small checkbox beside the Floating P/L metric value.
  ========================================================= */

  const FLOAT_KEY20 = 'btc_futures_chart_v13_18_floating_pl_on';
  const n20 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function placeFloatingCheckbox20(){
    const valueEl = document.getElementById('mFloatPL');
    if(!valueEl) return null;
    const metric = valueEl.closest('.metric') || valueEl.parentElement;
    if(!metric) return null;

    // Preserve existing state from PATCH_18 checkbox/localStorage.
    let input = document.getElementById('tglFloatingPL');
    const checked = input ? input.checked : (localStorage.getItem(FLOAT_KEY20) !== '0');

    // Remove old titled toolbar label, but reuse the same checkbox id/state.
    const oldLabel = input && input.closest ? input.closest('.p18-floating-toggle-label') : null;
    if(oldLabel) oldLabel.remove();
    document.querySelectorAll('.p18-floating-toggle-label').forEach(el => el.remove());

    // Ensure the metric value sits inside a flex row with the checkbox.
    let wrap = metric.querySelector('.p20-floating-inline-wrap');
    if(!wrap){
      wrap = document.createElement('div');
      wrap.className = 'p20-floating-inline-wrap';
      valueEl.parentNode.insertBefore(wrap,valueEl);
      wrap.appendChild(valueEl);
    }

    let toggleWrap = metric.querySelector('.p20-floating-inline-toggle');
    if(!toggleWrap){
      toggleWrap = document.createElement('span');
      toggleWrap.className = 'p20-floating-inline-toggle';
      wrap.appendChild(toggleWrap);
    }

    if(!input){
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'tglFloatingPL';
    }
    input.checked = checked;
    input.title = 'Show/hide open position visualization';
    input.setAttribute('aria-label','Show/hide open position visualization');
    toggleWrap.innerHTML = '';
    toggleWrap.appendChild(input);
    window.tglFloatingPL = input;

    if(!input.__p20Bound){
      input.__p20Bound = true;
      input.addEventListener('change',() => {
        localStorage.setItem(FLOAT_KEY20,input.checked ? '1' : '0');
        try{ if(typeof draw === 'function') draw(); }catch(e){}
      });
    }
    return input;
  }

  const floatingToggle20 = placeFloatingCheckbox20();

  // Unified P/L tag: replace the old small white/red-blue tag globally.
  // Existing calls keep their position/logic; only the drawing style changes.
  window.pnlLabel = pnlLabel = function(txt,x,y,col,clip){
    const raw = String(txt || '');
    const numeric = n20(raw.replace(/[^0-9+\-.]/g,''));
    const isProfit = raw.trim().startsWith('+') || numeric >= 0;
    const stroke = isProfit ? '#1e88e5' : '#f6465d';
    const bg = isProfit ? 'rgba(30,136,229,.14)' : 'rgba(246,70,93,.14)';
    const safeClip = clip || {left:0,top:0,width:canvas ? canvas.width : 9999,height:canvas ? canvas.height : 9999};

    ctx.save();
    ctx.font = 'bold 13px Arial';
    const padX = 7;
    const h = 22;
    const w = ctx.measureText(raw).width + padX*2;
    const cx = Math.max(safeClip.left + w/2 + 2, Math.min(safeClip.left + safeClip.width - w/2 - 2, x));
    const cy = Math.max(safeClip.top + h/2 + 2, Math.min(safeClip.top + safeClip.height - h/2 - 2, y));
    ctx.fillStyle = bg;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = typeof hairline === 'function' ? hairline() : 1;
    ctx.fillRect(Math.round(cx-w/2),Math.round(cy-h/2),w,h);
    ctx.strokeRect(Math.round(cx-w/2)+0.5,Math.round(cy-h/2)+0.5,w,h);
    ctx.fillStyle = stroke;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(raw,cx,cy+0.5);
    ctx.restore();
  };

  // Keep PATCH_18 open-position visibility behavior, but source it from the inline checkbox.
  const prevTradeOverlays20 = typeof tradeOverlays === 'function' ? tradeOverlays : null;
  if(prevTradeOverlays20){
    tradeOverlays = function(vis,mapX,mapY,slot,clip){
      const cb = document.getElementById('tglFloatingPL') || floatingToggle20;
      const floatingOn = !cb || cb.checked;
      let savedBoxes, savedLinks, savedOpenIds;
      if(!floatingOn){
        savedBoxes = openPositionBoxes;
        savedLinks = openLotLinks;
        savedOpenIds = openEntryMarkerIds;
        openPositionBoxes = [];
        openLotLinks = [];
        openEntryMarkerIds = new Set();
      }
      try{
        return prevTradeOverlays20(vis,mapX,mapY,slot,clip);
      }finally{
        if(!floatingOn){
          openPositionBoxes = savedBoxes;
          openLotLinks = savedLinks;
          openEntryMarkerIds = savedOpenIds;
        }
      }
    };
  }

  // Re-place checkbox after metric text refreshes if layout was rebuilt.
  const prevUpdateMetrics20 = typeof updateMetrics === 'function' ? updateMetrics : null;
  if(prevUpdateMetrics20){
    updateMetrics = function(){
      const r = prevUpdateMetrics20.apply(this,arguments);
      placeFloatingCheckbox20();
      return r;
    };
  }

  try{ if(typeof draw === 'function') draw(); }catch(e){ console.error('PATCH_20 draw failed',e); }
})();

(() => {
  "use strict";

  const IND_VIS_KEY21 = "btc_futures_chart_v13_21_indicators_visible";
  const TRACKPAD_KEY21 = "btc_futures_chart_v13_21_trackpad_sensitivity";
  const OPEN_ORDERS_URL21 = "https://fapi.binance.com/fapi/v1/openOrders";
  const OPEN_ALGO_ORDERS_URL21 = "https://fapi.binance.com/fapi/v1/openAlgoOrders";
  const n21 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const darkGreen21 = "#047857";
  const darkRed21 = "#7f1d1d";
  const neutral21 = "#111";

  window.v13OpenOrders21 = Array.isArray(window.v13OpenOrders21) ? window.v13OpenOrders21 : [];
  window.v13OpenAlgoOrders21 = Array.isArray(window.v13OpenAlgoOrders21) ? window.v13OpenAlgoOrders21 : [];
  window.v13OpenOrdersStatus21 = window.v13OpenOrdersStatus21 || "unknown";
  window.v13OpenOrdersTs21 = window.v13OpenOrdersTs21 || 0;
  window.v13StopSourcesChecked21 = !!window.v13StopSourcesChecked21;

  function currentSymbol21(){
    return typeof cfg === "function" && cfg() ? cfg().symbol : "";
  }
  function latest21(){
    return Array.isArray(candles) && candles.length ? candles[candles.length-1] : null;
  }
  function isFloatingOverlayOn21(){
    const cb = document.getElementById("tglFloatingPL");
    return !cb || cb.checked;
  }
  function fdAbs21(x){
    x = Math.abs(Number(x));
    if(!Number.isFinite(x)) return "-";
    return Math.round(x).toLocaleString("en-US");
  }
  function sideDir21(side){
    return String(side || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
  }
  function cid21(o){
    return o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  }
  function normalizeTime21(t){
    const v = n21(t);
    return v > 1e12 ? Math.floor(v/1000) : v;
  }
  function eventX21(time,vis,mapX){
    if(!Array.isArray(vis) || !vis.length || typeof mapX !== "function") return null;
    const t = normalizeTime21(time);
    const sec = typeof ivSec === "function" ? ivSec() : 0;
    for(let i=0;i<vis.length;i++){
      const c = vis[i];
      const ct = n21(c && c.time);
      if(t >= ct && (!sec || t < ct + sec)) return mapX(i);
    }
    if(typeof timeX === "function") return timeX(t,vis,mapX,sec || 1);
    return null;
  }
  function openEntryMarkers21(){
    const sym = currentSymbol21();
    return (fillMarkers || [])
      .filter(m => m && m.symbol === sym && openEntryMarkerIds && openEntryMarkerIds.has(m.id))
      .slice()
      .sort((a,b) => (n21(a.time)-n21(b.time)) || String(a.id||"").localeCompare(String(b.id||"")));
  }
  function entrySequenceMap21(){
    const map = new Map();
    openEntryMarkers21().forEach((m,i) => map.set(m.id,i+1));
    return map;
  }
  function openEntryCount21(symbol){
    const sym = symbol || currentSymbol21();
    if(Array.isArray(openLotLinks) && openLotLinks.length){
      return openLotLinks.filter(l => !sym || l.symbol === sym).length;
    }
    return openEntryMarkers21().filter(m => !sym || m.symbol === sym).length;
  }

  function installIndicatorEye21(){
    const toggles = document.querySelector(".indicator-toggles");
    if(!toggles || document.getElementById("v21IndicatorEye")) return;
    const btn = document.createElement("button");
    btn.id = "v21IndicatorEye";
    btn.type = "button";
    btn.className = "v21-indicator-eye";
    btn.title = "Show/hide enabled MA and VWAP lines";
    const sync = () => {
      const on = localStorage.getItem(IND_VIS_KEY21) !== "0";
      btn.textContent = "👁";
      btn.classList.toggle("off", !on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    };
    btn.addEventListener("click",() => {
      const on = localStorage.getItem(IND_VIS_KEY21) !== "0";
      localStorage.setItem(IND_VIS_KEY21,on ? "0" : "1");
      sync();
      try{ if(typeof draw === "function") draw(); }catch(e){}
    });
    toggles.appendChild(btn);
    sync();
  }

  if(typeof drawInd === "function" && !window.__v13Patch21DrawIndWrapped){
    window.__v13Patch21DrawIndWrapped = true;
    const prevDrawInd21 = drawInd;
    window.drawInd = drawInd = function(){
      if(localStorage.getItem(IND_VIS_KEY21) === "0") return;
      return prevDrawInd21.apply(this,arguments);
    };
  }

  function installTrackpadSettings21(){
    const grid = document.querySelector(".settings-grid");
    if(!grid || document.getElementById("v21TrackpadCard")) return;
    const val = Math.max(0.25,Math.min(2,Number(localStorage.getItem(TRACKPAD_KEY21) || "1") || 1));
    const card = document.createElement("div");
    card.className = "settings-card";
    card.id = "v21TrackpadCard";
    card.innerHTML = `
      <div class="settings-card-title">Trackpad sensitivity</div>
      <div class="settings-card-desc">Controls chart pan/zoom response for laptop touchpads. Lower is slower; higher is faster.</div>
      <div class="v21-settings-row">
        <span>Level</span>
        <input id="v21TrackpadSensitivity" type="range" min="0.25" max="2" step="0.25" value="${val}">
        <span id="v21TrackpadSensitivityVal">${val.toFixed(2)}</span>
      </div>`;
    grid.appendChild(card);
    const input = document.getElementById("v21TrackpadSensitivity");
    const out = document.getElementById("v21TrackpadSensitivityVal");
    const sync = () => {
      const v = Math.max(0.25,Math.min(2,Number(input.value) || 1));
      input.value = String(v);
      localStorage.setItem(TRACKPAD_KEY21,String(v));
      if(out) out.textContent = v.toFixed(2);
    };
    input.addEventListener("input",sync);
    input.addEventListener("change",sync);
    sync();
  }

  function trackpadSensitivity21(){
    const v = Number(localStorage.getItem(TRACKPAD_KEY21) || "1");
    return Number.isFinite(v) ? Math.max(0.25,Math.min(2,v)) : 1;
  }

  if(canvas && !window.__v13Patch21WheelWrapped){
    window.__v13Patch21WheelWrapped = true;
    canvas.addEventListener("wheel",e => {
      if(typeof rightAxis !== "function" || typeof pan !== "function" || typeof zoomAt !== "function") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = trackpadSensitivity21();
      const dx = n21(e.deltaX) * s;
      const dy = n21(e.deltaY) * s;
      if(rightAxis(e.offsetX)){
        if(typeof scaleY === "function") scaleY(dy);
        return;
      }
      if(Math.abs(dx) > Math.abs(dy)) pan(Math.round(dx/20));
      else zoomAt(e.offsetX,dy);
    },{passive:false,capture:true});
  }

  function positionSig21(risk){
    const sym = currentSymbol21();
    return (Array.isArray(risk) ? risk : [])
      .filter(r => r && r.symbol === sym && Math.abs(n21(r.positionAmt)) > 1e-12)
      .map(r => [r.symbol,r.positionSide || "BOTH",String(r.positionAmt),String(r.entryPrice)].join(":"))
      .sort()
      .join("|");
  }
  function updateBoxesFromRisk21(risk){
    if(typeof buildOpenBoxes !== "function") return;
    const boxes = buildOpenBoxes([],risk,currentSymbol21());
    if(boxes.length){
      const chain = (openPositionBoxes && openPositionBoxes[0] && cid21(openPositionBoxes[0])) || (openLotLinks && openLotLinks[0] && cid21(openLotLinks[0])) || null;
      boxes.forEach(b => { if(!cid21(b) && chain) b.chainId = chain; });
      openPositionBoxes = boxes;
    }else{
      openPositionBoxes = [];
      openLotLinks = [];
      openEntryMarkerIds = new Set();
      activeOpenParentChainIds = new Set();
    }
    try{ if(typeof updatePositionStrip === "function") updatePositionStrip(latest21()); }catch(e){}
    try{ if(typeof updateTabTitle === "function") updateTabTitle(); }catch(e){}
  }
  function unwrapOrders21(rows){
    if(Array.isArray(rows)) return rows;
    if(rows && Array.isArray(rows.orders)) return rows.orders;
    if(rows && Array.isArray(rows.data)) return rows.data;
    return [];
  }
  async function fetchOpenOrders21(key,sec,off){
    if(typeof signedGet !== "function") return;
    const sym = currentSymbol21();
    let normalOk = false;
    let algoOk = false;
    window.v13OpenOrdersStatus21 = "pending";
    window.v13StopSourcesChecked21 = false;
    try{
      const rows = await signedGet(OPEN_ORDERS_URL21,{symbol:sym},key,sec,off);
      window.v13OpenOrders21 = unwrapOrders21(rows);
      normalOk = true;
    }catch(e){
      console.warn("PATCH_31 normal openOrders refresh failed",e);
      window.v13OpenOrders21 = [];
    }
    try{
      const algoRows = await signedGet(OPEN_ALGO_ORDERS_URL21,{symbol:sym},key,sec,off);
      window.v13OpenAlgoOrders21 = unwrapOrders21(algoRows);
      algoOk = true;
    }catch(e){
      console.warn("PATCH_31 conditional openAlgoOrders refresh failed",e);
      window.v13OpenAlgoOrders21 = [];
    }
    window.v13OpenOrdersTs21 = Date.now();
    window.v13StopSourcesChecked21 = normalOk && algoOk;
    window.v13OpenOrdersStatus21 = normalOk && algoOk ? "ok" : (normalOk || algoOk ? "partial" : "error");
  }

  let busy21 = false;
  let lastSig21 = null;
  let lastTradeSync21 = 0;
  async function refreshPositionVisualsAndStops21(){
    if(busy21 || typeof hasKeys !== "function" || !hasKeys()) return;
    busy21 = true;
    try{
      const key = apiKeyEl.value.trim();
      const sec = apiSecretEl.value.trim();
      const off = typeof timeOffset === "function" ? await timeOffset() : 0;
      const risk = typeof getPositions === "function" ? await getPositions(key,sec,off) : [];
      const sig = positionSig21(risk);
      updateBoxesFromRisk21(risk);

      const needsTradeSync = sig && sig !== lastSig21 && (lastSig21 !== null || !(openLotLinks && openLotLinks.length));
      lastSig21 = sig;
      if(needsTradeSync && typeof loadTrades === "function" && Date.now() - lastTradeSync21 > 8000){
        lastTradeSync21 = Date.now();
        try{ await loadTrades({silent:true}); }catch(e){ console.warn("PATCH_21 silent trade sync failed",e); }
      }

      if(sig) await fetchOpenOrders21(key,sec,off);
      else{
        window.v13OpenOrders21 = [];
        window.v13OpenAlgoOrders21 = [];
        window.v13StopSourcesChecked21 = true;
        window.v13OpenOrdersStatus21 = "flat";
      }

      try{ if(typeof draw === "function") draw(); }catch(e){}
    }catch(e){
      console.warn("PATCH_21 position visual refresh failed",e);
    }finally{
      busy21 = false;
    }
  }

  function stopPrice21(o){
    const candidates = [o && o.stopPrice,o && o.triggerPrice,o && o.activatePrice,o && o.price];
    for(const v of candidates){
      const n = Number(v);
      if(Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }
  function liveOrder21(o){
    const status = String(o && (o.status || o.orderStatus || "NEW") || "NEW").toUpperCase();
    if(!status) return true;
    return status === "NEW" || status === "PENDING" || status === "ACCEPTED" || status === "PARTIALLY_FILLED" || status.includes("NEW");
  }
  function positionSideMatches21(o,side){
    const ps = String(o && o.positionSide || "").toUpperCase();
    return !ps || ps === "BOTH" || ps === side;
  }
  function isStopLossOrder21(o){
    const type = String(o && (o.type || o.origType || o.orderType || "") || "").toUpperCase();
    const allTypes = [type,String(o && o.origType || "").toUpperCase(),String(o && o.algoType || "").toUpperCase()].join(" ");
    if(!allTypes.includes("STOP")) return false;
    if(allTypes.includes("TAKE_PROFIT")) return false;
    if(allTypes.includes("TRAILING")) return false;
    return stopPrice21(o) != null;
  }
  function stopOrderPool21(){
    return [].concat(window.v13OpenOrders21 || [], window.v13OpenAlgoOrders21 || []);
  }
  function pickStopForBox21(b,current){
    const sym = currentSymbol21();
    const side = sideDir21(b && b.side);
    const opp = side === "LONG" ? "SELL" : "BUY";
    let list = stopOrderPool21()
      .filter(o => o && String(o.symbol || "") === sym)
      .filter(liveOrder21)
      .filter(o => positionSideMatches21(o,side))
      .filter(o => String(o.side || "").toUpperCase() === opp)
      .filter(isStopLossOrder21)
      .map(o => ({order:o,price:stopPrice21(o),reduce:(String(o.reduceOnly).toLowerCase()==="true" || String(o.closePosition).toLowerCase()==="true"),algo:!!(o.algoId || o.strategyId || o.algoType)}))
      .filter(x => x.price != null);
    if(!list.length) return null;
    list.sort((a,b) => Number(b.reduce) - Number(a.reduce) || Number(b.algo) - Number(a.algo));
    const directional = list.filter(x => current == null ? true : (side === "LONG" ? x.price < current : x.price > current));
    const pool = directional.length ? directional : list;
    pool.sort((a,b) => side === "LONG" ? b.price - a.price : a.price - b.price);
    return pool[0] || null;
  }

  function openBoxAnchor21(b,latest,vis,mapX,clip,slot){
    const liveX = eventX21(latest.time,vis,mapX);
    if(liveX === null) return null;
    const floating = typeof openBoxFloating === "function" ? openBoxFloating(b,n21(latest.close)) : null;
    const distance = b.letter === "B" ? n21(latest.close) - n21(b.price) : n21(b.price) - n21(latest.close);
    const pctMargin = typeof pnlPctOfMargin === "function" ? pnlPctOfMargin(floating,b) : null;
    const per100 = typeof valuePer100Move === "function" ? valuePer100Move(b) : null;
    const topText = (b.stale ? "STALE | " : "") + fq(b.qty) + " | " + fm(floating) + " | " + (pctMargin == null ? "--" : pct(pctMargin));
    const bottomText = "Δ " + fd(distance) + " | " + (per100 == null ? "--" : fm(per100));
    ctx.save();
    ctx.font = "12px Arial";
    const widest = Math.max(ctx.measureText(topText).width,ctx.measureText(bottomText).width);
    ctx.restore();
    let boxX = clamp(liveX + slot*10, clip.left+26, clip.left+clip.width-92);
    const candleClearX = liveX + Math.max(slot*5.75,18);
    boxX = clamp(Math.max(boxX,candleClearX + widest/2 + 4), clip.left+26, clip.left+clip.width-92);
    return {liveX,boxX,widest};
  }
  function rectsOverlap21(a,b){ return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
  function slBoxXNoOverlap21(baseX,entryY,slY,details,clip,openWidest){
    let x = baseX;
    let detailsW = 0;
    try{ ctx.save(); ctx.font = "12px Arial"; detailsW = ctx.measureText(details || "").width; ctx.restore(); }catch(e){}
    const openHalf = Math.max(86, (Number(openWidest) || 0) / 2);
    const openRect = {left:baseX-openHalf-10,right:baseX+openHalf+82,top:entryY-34,bottom:entryY+34};
    const slHalf = Math.max(26, detailsW/2 + 8);
    for(let i=0;i<12;i++){
      const slRect = {left:x-slHalf,right:x+slHalf+82,top:slY-12,bottom:slY+30};
      if(!rectsOverlap21(openRect,slRect)) break;
      x += 24;
    }
    return clamp(x,clip.left+26,clip.left+clip.width-92);
  }
  function pnlAtLevel21(b,level){
    const side = sideDir21(b && b.side);
    const entry = n21(b && b.price);
    const qty = n21(b && b.qty);
    return side === "SHORT" ? (entry - level) * qty : (level - entry) * qty;
  }
  function drawSlForBox21(b,vis,mapX,mapY,slot,clip){
    const latest = latest21();
    if(!latest || !b || b.symbol !== currentSymbol21()) return;
    const anchor = openBoxAnchor21(b,latest,vis,mapX,clip,slot);
    if(!anchor) return;
    const order = pickStopForBox21(b,n21(latest.close));
    const entryY = mapY(n21(b.price));

    if(!order){
      if(window.v13OpenOrdersStatus21 === "unknown" || window.v13OpenOrdersStatus21 === "pending" || window.v13OpenOrdersStatus21 === "error" || !window.v13StopSourcesChecked21) return;
      const noY = clamp(entryY + 48, clip.top + 16, clip.top + clip.height - 12);
      ctx.save();
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#b91c1c";
      ctx.fillText("NO SL",anchor.boxX,noY);
      ctx.restore();
      return;
    }

    const sl = n21(order.price);
    const y = mapY(sl);
    if(y < clip.top - 30 || y > clip.top + clip.height + 30) return;
    const markerW = 24;
    const markerH = 15;
    const pnl = pnlAtLevel21(b,sl);
    const margin = typeof openBoxMargin === "function" ? openBoxMargin(b) : null;
    const marginPct = margin && Number.isFinite(Number(margin)) && Number(margin) !== 0 ? pnl / Number(margin) * 100 : null;
    const details = "Δ" + fdAbs21(n21(latest.close) - sl) + " | " + fm(pnl) + " | " + (marginPct == null ? "--" : pct(marginPct));
    const slBoxX = slBoxXNoOverlap21(anchor.boxX,entryY,y,details,clip,anchor.widest);
    const leftEdge = slBoxX - markerW/2;
    const rightEdge = slBoxX + markerW/2;
    const lineLeft = clamp(anchor.liveX - slot*3, clip.left, clip.left+clip.width);
    const lineRight = clamp(slBoxX + 72, clip.left, clip.left+clip.width-86);
    const priceX = clamp(lineRight+6,clip.left+2,clip.left+clip.width-74);

    ctx.save();
    ctx.strokeStyle = "rgba(156,163,175,.72)";
    ctx.lineWidth = typeof hairline === "function" ? hairline() : 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    if(lineLeft < leftEdge) { ctx.moveTo(px(lineLeft),px(y)); ctx.lineTo(px(leftEdge),px(y)); }
    if(rightEdge < lineRight){ ctx.moveTo(px(rightEdge),px(y)); ctx.lineTo(px(lineRight),px(y)); }
    ctx.stroke();

    ctx.strokeStyle = "#111";
    ctx.lineWidth = typeof hairline === "function" ? hairline() : 1;
    ctx.strokeRect(px(slBoxX-markerW/2),px(y-markerH/2),markerW,markerH);
    ctx.font = "bold 9px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111";
    ctx.fillText("SL",slBoxX,y+.5);

    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(p2(sl),priceX,y);
    ctx.textAlign = "center";
    ctx.fillText(details,slBoxX,y+21);
    ctx.restore();
  }
  function drawSlOverlay21(vis,mapX,mapY,slot,clip){
    if(!isFloatingOverlayOn21()) return;
    if(!Array.isArray(openPositionBoxes) || !openPositionBoxes.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.left,clip.top,clip.width,clip.height);
    ctx.clip();
    for(const b of openPositionBoxes) drawSlForBox21(b,vis,mapX,mapY,slot,clip);
    ctx.restore();
  }

  function drawOpenEntryNumbersOnTop21(vis,mapX,mapY,slot){
    // Redraw open entry icons above connector lines only.
    // Entry numbering is intentionally NOT drawn on chart icons; it belongs only in the open-position tooltip.
    if(!isFloatingOverlayOn21()) return;
    const rows = openEntryMarkers21();
    if(!rows.length) return;
    for(const m of rows){
      if(typeof inTime === "function" && !inTime(m.time,vis)) continue;
      const x = typeof markerTimeX === "function" ? markerTimeX(m,vis,mapX,slot) : eventX21(m.time,vis,mapX);
      if(x === null || x === undefined) continue;
      const y = mapY(n21(m.price));
      const col = m.side === "SHORT" || m.letter === "S" || m.letter === "ES" ? "#f6465d" : "#0ecb81";
      if(typeof circle === "function") circle(ix(x),ix(y),m.letter,col,m.unresolved);
    }
  }

  const prevTradeOverlays21 = typeof tradeOverlays === "function" ? tradeOverlays : null;
  if(prevTradeOverlays21 && !window.__v13Patch21TradeOverlayWrapped){
    window.__v13Patch21TradeOverlayWrapped = true;
    tradeOverlays = function(vis,mapX,mapY,slot,clip){
      const r = prevTradeOverlays21.apply(this,arguments);
      drawOpenEntryNumbersOnTop21(vis,mapX,mapY,slot);
      drawSlOverlay21(vis,mapX,mapY,slot,clip);
      return r;
    };
  }

  const prevHover21 = typeof drawHoverTooltip === "function" ? drawHoverTooltip : null;
  if(prevHover21 && !window.__v13Patch21HoverWrapped){
    window.__v13Patch21HoverWrapped = true;
    drawHoverTooltip = function(){
      const it = typeof hoverItem === "function" ? hoverItem() : null;
      if(it && mouse && it.kind === "box"){
        const latest = latest21();
        const current = latest ? latest.close : null;
        const floating = current != null && typeof openBoxFloating === "function" ? openBoxFloating(it.boxData,current) : null;
        const margin = typeof openBoxMargin === "function" ? openBoxMargin(it.boxData) : null;
        const symbol = it.boxData && it.boxData.symbol ? it.boxData.symbol : currentSymbol21();
        const lines = [
          it.boxData && it.boxData.stale ? "Open position status stale" : (it.letter === "B" ? "Current open long" : "Current open short"),
          "Size: " + fq(it.qty) + " BTC",
          "Entries: " + openEntryCount21(symbol),
          "Entry price: " + p2(it.price),
          "Margin: " + (margin == null ? "-" : fm(margin))
        ];
        if(floating != null) lines.push("Floating P/L: " + fm(floating));
        tooltip(lines,mouse.x,mouse.y);
        return;
      }
      return prevHover21.apply(this,arguments);
    };
  }

  const prevUpdatePositionStrip21 = typeof updatePositionStrip === "function" ? updatePositionStrip : null;
  if(prevUpdatePositionStrip21 && !window.__v13Patch21PositionStripWrapped){
    window.__v13Patch21PositionStripWrapped = true;
    updatePositionStrip = function(){
      const r = prevUpdatePositionStrip21.apply(this,arguments);
      try{
        const price = latest21() ? n21(latest21().close) : null;
        const flt = price == null || typeof openBoxesFloating !== "function" ? null : openBoxesFloating(price);
        if(mFloatPL){
          mFloatPL.style.color = flt == null ? neutral21 : flt > 0 ? darkGreen21 : flt < 0 ? darkRed21 : neutral21;
        }
      }catch(e){}
      return r;
    };
  }

  const prevAutoY21 = typeof autoYRange === "function" ? autoYRange : null;
  if(prevAutoY21 && !window.__v13Patch21AutoYWrapped){
    window.__v13Patch21AutoYWrapped = true;
    autoYRange = function(vis){
      return candleOnlyYRange(vis);
    };
  }

  installIndicatorEye21();
  installTrackpadSettings21();
  setInterval(refreshPositionVisualsAndStops21,5000);
  setTimeout(refreshPositionVisualsAndStops21,700);
  try{ if(typeof draw === "function") draw(); }catch(e){ console.error("PATCH_21 draw failed",e); }
})();

(() => {
  "use strict";

  const V22_PREFIX = "btc_futures_chart_v13_22_sessions_";
  const V22_KEYS = {
    enabled: V22_PREFIX + "enabled",
    labels: V22_PREFIX + "labels",
    opacity: V22_PREFIX + "opacity",
    timezone: V22_PREFIX + "timezone"
  };

  const V22_SESSIONS = [
    {key:"overlap", label:"Overlap", full:"London + US overlap", ranges:[[1050,1170]], defaultOn:true, rank:1, color:[245,158,11]},
    {key:"us", label:"US", full:"US cash / Wall Street", ranges:[[1050,1440]], defaultOn:true, rank:2, color:[239,68,68]},
    {key:"london", label:"London", full:"London / Europe cash", ranges:[[660,1170]], defaultOn:true, rank:3, color:[59,130,246]},
    {key:"hongkong", label:"Hong Kong", full:"Hong Kong cash", ranges:[[330,720]], defaultOn:false, rank:4, color:[16,185,129]},
    {key:"singapore", label:"Singapore", full:"Singapore cash", ranges:[[300,480],[540,780]], defaultOn:false, rank:5, color:[20,184,166]},
    {key:"tokyo", label:"Tokyo", full:"Tokyo cash", ranges:[[240,390],[450,630]], defaultOn:false, rank:6, color:[139,92,246]}
  ];

  window.v13Sessions22 = window.v13Sessions22 || {version:"V13_UI_V2_PATCH_22_SESSIONS_MODULE"};

  function getStored22(key, fallback){
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  }
  function bool22(key, fallback){
    const v = getStored22(key, fallback ? "1" : "0");
    return v !== "0";
  }
  function sessionKey22(k){ return V22_PREFIX + "session_" + k; }
  function sessionEnabled22(s){ return bool22(sessionKey22(s.key), !!s.defaultOn); }
  function overlayEnabled22(){ return bool22(V22_KEYS.enabled, true); }
  function labelsEnabled22(){ return bool22(V22_KEYS.labels, true); }
  function opacity22(){
    const n = Number(getStored22(V22_KEYS.opacity, "0.10"));
    return Number.isFinite(n) ? Math.max(0.02, Math.min(0.28, n)) : 0.10;
  }
  function timezone22(){
    const z = getStored22(V22_KEYS.timezone, "UAE");
    return ["UAE","UTC","LOCAL"].includes(z) ? z : "UAE";
  }
  function offsetMinutes22(){
    const z = timezone22();
    if(z === "UTC") return 0;
    if(z === "LOCAL") return -new Date().getTimezoneOffset();
    return 240; // UAE / Gulf Standard Time, UTC+4.
  }
  function rgba22(rgb, alpha){ return "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")"; }
  function colorKey22(k){ return V22_PREFIX + "color_" + k; }
  function opacityKey22(k){ return V22_PREFIX + "opacity_" + k; }
  function hex22(n){ n = Math.max(0,Math.min(255,Number(n)||0)); return n.toString(16).padStart(2,"0"); }
  function rgbToHex22(rgb){ return "#" + hex22(rgb[0]) + hex22(rgb[1]) + hex22(rgb[2]); }
  function hexToRgb22(hex, fallback){
    const h = String(hex || "").trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if(!m) return fallback;
    const v = m[1];
    return [parseInt(v.slice(0,2),16), parseInt(v.slice(2,4),16), parseInt(v.slice(4,6),16)];
  }
  function sessionColorHex22(s){ return getStored22(colorKey22(s.key), rgbToHex22(s.color)); }
  function sessionColor22(s){ return hexToRgb22(sessionColorHex22(s), s.color); }
  function defaultSessionOpacity22(s){ return s.key === "overlap" ? 0.16 : opacity22(); }
  function sessionOpacity22(s){
    const n = Number(getStored22(opacityKey22(s.key), String(defaultSessionOpacity22(s))));
    return Number.isFinite(n) ? Math.max(0.02, Math.min(0.30, n)) : defaultSessionOpacity22(s);
  }
  function ivSec22(){ return typeof ivSec === "function" ? Number(ivSec()) || 60 : 60; }
  function clamp22(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function dayIndex22(sec, offsetMin){ return Math.floor((sec + offsetMin * 60) / 86400); }
  function dayStartUtc22(dayIdx, offsetMin){ return dayIdx * 86400 - offsetMin * 60; }
  function xForTime22(t, first, slot, sec, left){ return left + slot / 2 + ((t - first) / sec) * slot; }
  function rangeState22(){
    if(!Array.isArray(candles) || candles.length < 2 || typeof range !== "function") return null;
    const r = range();
    const vis = candles.slice(r.start, r.end);
    if(vis.length < 2) return null;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const left = typeof LEFT_PAD !== "undefined" ? LEFT_PAD : 58;
    const right = typeof RIGHT_AXIS !== "undefined" ? RIGHT_AXIS : 86;
    const top = 18;
    const bottom = 30;
    const priceH = Math.floor((h - top - bottom) * .78);
    const chartW = w - left - right;
    const future = Number(r.futureBars) || 0;
    const total = Math.max(2, vis.length + future);
    const slot = chartW / total;
    return {vis,w,h,left,right,top,bottom,priceH,chartW,slot,sec:ivSec22()};
  }

  function sessionBands22(st){
    const first = Number(st.vis[0].time);
    const last = Number(st.vis[st.vis.length - 1].time) + st.sec;
    const off = offsetMinutes22();
    const startDay = dayIndex22(first, off) - 1;
    const endDay = dayIndex22(last, off) + 1;
    const out = [];
    for(const s of V22_SESSIONS){
      if(!sessionEnabled22(s)) continue;
      for(let d=startDay; d<=endDay; d++){
        const base = dayStartUtc22(d, off);
        for(const rg of s.ranges){
          const a = base + Number(rg[0]) * 60;
          const b = base + Number(rg[1]) * 60;
          if(b <= first || a >= last) continue;
          out.push({session:s,start:a,end:b});
        }
      }
    }
    return out.sort((a,b) => a.session.rank - b.session.rank || a.start - b.start);
  }

  function drawSessions22(){
    if(!overlayEnabled22()) return;
    const st = rangeState22();
    if(!st || st.chartW <= 0 || st.priceH <= 0) return;
    const first = Number(st.vis[0].time);
    const showLabels = labelsEnabled22();
    const bands = sessionBands22(st);
    if(!bands.length) return;

    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.beginPath();
    ctx.rect(st.left, st.top, st.chartW, st.priceH);
    ctx.clip();

    for(const band of bands){
      let x1 = xForTime22(band.start, first, st.slot, st.sec, st.left);
      let x2 = xForTime22(band.end, first, st.slot, st.sec, st.left);
      x1 = clamp22(x1, st.left, st.left + st.chartW);
      x2 = clamp22(x2, st.left, st.left + st.chartW);
      if(x2 - x1 < 1) continue;
      const s = band.session;
      const bandAlpha = sessionOpacity22(s);
      ctx.fillStyle = rgba22(sessionColor22(s), bandAlpha);
      ctx.fillRect(Math.round(x1), st.top, Math.max(1, Math.round(x2 - x1)), st.priceH);

      if(showLabels && x2 - x1 > 38){
        ctx.font = "bold 10px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(17,24,39,.82)";
        ctx.fillText(s.label, (x1 + x2) / 2, st.top + 5);
      }
    }
    ctx.restore();
  }
  window.v13DrawSessions22 = drawSessions22;

  function syncSessionToggle22(){
    const btn = document.getElementById("v22SessionsToggle");
    if(!btn) return;
    const on = overlayEnabled22();
    btn.textContent = "◷";
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Sessions overlay on" : "Sessions overlay off";
  }

  /* PATCH_35: compact selected-TF badge next to session toggle (UI-only). */
  function sessionTfText35(tf){
    const v = String(tf || "").trim();
    if(!v) return "--";
    return v === "1M" ? "1M" : v.toLowerCase();
  }
  function syncSessionTfBadge22(){
    const badge = document.getElementById("v22SessionTfBadge");
    const sel = document.getElementById("interval");
    if(!badge) return;
    badge.textContent = sessionTfText35(sel ? sel.value : "");
    badge.title = "Selected timeframe";
  }
  function ensureSessionTfBadge22(){
    const btn = document.getElementById("v22SessionsToggle");
    if(!btn) return;
    let badge = document.getElementById("v22SessionTfBadge");
    if(!badge){
      badge = document.createElement("span");
      badge.id = "v22SessionTfBadge";
      badge.className = "v22-session-tf-badge";
      btn.insertAdjacentElement("afterend", badge);
    }
    syncSessionTfBadge22();
  }

  function installChartToggle22(){
    const toggles = document.querySelector(".indicator-toggles");
    if(!toggles || document.getElementById("v22SessionsToggle")) return;
    const btn = document.createElement("button");
    btn.id = "v22SessionsToggle";
    btn.type = "button";
    btn.className = "v22-session-toggle";
    btn.addEventListener("click", () => {
      localStorage.setItem(V22_KEYS.enabled, overlayEnabled22() ? "0" : "1");
      syncSessionToggle22();
      try{ if(typeof draw === "function") draw(); }catch(e){}
    });
    toggles.appendChild(btn);
    syncSessionToggle22();
    ensureSessionTfBadge22();
    const tfSel = document.getElementById("interval");
    if(tfSel && !tfSel.__v22TfBadgeBound){
      tfSel.__v22TfBadgeBound = true;
      tfSel.addEventListener("change",syncSessionTfBadge22,false);
    }
  }

  function installSettings22(){
    const grid = document.querySelector(".settings-grid");
    if(!grid || document.getElementById("v22SessionsCard")) return;
    const card = document.createElement("div");
    card.className = "settings-card";
    card.id = "v22SessionsCard";
    const sessionRows = V22_SESSIONS.map(s => {
      const op = sessionOpacity22(s).toFixed(2);
      return `
        <div class="v22-session-control-row" title="${s.full}">
          <label><input type="checkbox" data-v22-session="${s.key}" ${sessionEnabled22(s) ? "checked" : ""}>${s.label}</label>
          <input class="v22-session-color" type="color" data-v22-color="${s.key}" value="${sessionColorHex22(s)}">
          <input type="range" data-v22-opacity="${s.key}" min="0.02" max="0.30" step="0.01" value="${op}">
          <span class="v22-session-opacity-val" data-v22-opacity-val="${s.key}">${op}</span>
        </div>`;
    }).join("");
    card.innerHTML = `
      <div class="settings-card-title">Sessions overlay</div>
      <div class="settings-card-desc">Low-opacity background bands. Times are repeated daily; UAE is default.</div>
      <div class="v22-session-row">
        <span>Enabled</span>
        <label><input id="v22SessionsEnabled" type="checkbox" ${overlayEnabled22() ? "checked" : ""}> Show sessions</label>
        <span></span>
      </div>
      <div class="v22-session-row">
        <span>Timezone</span>
        <select id="v22SessionsTimezone">
          <option value="UAE" ${timezone22()==="UAE" ? "selected" : ""}>UAE</option>
          <option value="UTC" ${timezone22()==="UTC" ? "selected" : ""}>UTC</option>
          <option value="LOCAL" ${timezone22()==="LOCAL" ? "selected" : ""}>Local</option>
        </select>
        <span></span>
      </div>
      <div class="v22-session-row">
        <span>Labels</span>
        <label><input id="v22SessionsLabels" type="checkbox" ${labelsEnabled22() ? "checked" : ""}> Show labels</label>
        <span></span>
      </div>
      <div class="v22-session-control-head"><span>Session</span><span>Color</span><span>Opacity</span><span></span></div>
      <div class="v22-session-controls">${sessionRows}</div>`;
    grid.appendChild(card);

    const redraw = () => { syncSessionToggle22(); try{ if(typeof draw === "function") draw(); }catch(e){} };
    const enabled = document.getElementById("v22SessionsEnabled");
    const labels = document.getElementById("v22SessionsLabels");
    const tz = document.getElementById("v22SessionsTimezone");

    if(enabled) enabled.addEventListener("change", () => { localStorage.setItem(V22_KEYS.enabled, enabled.checked ? "1" : "0"); redraw(); });
    if(labels) labels.addEventListener("change", () => { localStorage.setItem(V22_KEYS.labels, labels.checked ? "1" : "0"); redraw(); });
    if(tz) tz.addEventListener("change", () => { localStorage.setItem(V22_KEYS.timezone, tz.value); redraw(); });
    card.querySelectorAll("input[data-v22-session]").forEach(input => {
      input.addEventListener("change", () => {
        localStorage.setItem(sessionKey22(input.getAttribute("data-v22-session")), input.checked ? "1" : "0");
        redraw();
      });
    });
    card.querySelectorAll("input[data-v22-color]").forEach(input => {
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-v22-color");
        localStorage.setItem(colorKey22(key), input.value);
        redraw();
      });
    });
    card.querySelectorAll("input[data-v22-opacity]").forEach(input => {
      input.addEventListener("input", () => {
        const key = input.getAttribute("data-v22-opacity");
        const v = opacity22FromInput22(input.value);
        localStorage.setItem(opacityKey22(key), String(v));
        const out = card.querySelector(`[data-v22-opacity-val="${key}"]`);
        if(out) out.textContent = v.toFixed(2);
        redraw();
      });
    });
  }

  function opacity22FromInput22(v){
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0.02, Math.min(0.30, n)) : 0.10;
  }

  function installDrawWrapper22(){
    if(typeof draw !== "function" || window.__v13Patch22SessionsDrawWrapped) return;
    window.__v13Patch22SessionsDrawWrapped = true;
    const prevDraw22 = draw;
    draw = function(){
      const result = prevDraw22.apply(this, arguments);
      try{ drawSessions22(); }catch(e){ console.warn("PATCH_22 sessions draw failed", e); }
      return result;
    };
  }

  installChartToggle22();
  installSettings22();
  installDrawWrapper22();
  try{ if(typeof draw === "function") draw(); }catch(e){ console.error("PATCH_22 sessions init draw failed", e); }
})();

(() => {
  "use strict";
  const POS_KEY = "btc_futures_chart_v13_23_settings_window_pos";

  function clamp23(v,min,max){ return Math.max(min,Math.min(max,v)); }

  function settingsParts23(){
    const backdrop = document.getElementById("settingsModal");
    const modal = backdrop && backdrop.querySelector(".modal");
    const header = modal && modal.querySelector("h3");
    return {backdrop,modal,header};
  }

  function applyStoredPosition23(){
    const {modal} = settingsParts23();
    if(!modal) return;
    modal.classList.add("v23-settings-floating");
    let pos = null;
    try{ pos = JSON.parse(localStorage.getItem(POS_KEY) || "null"); }catch(e){}
    if(pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)){
      const rect = modal.getBoundingClientRect();
      const w = rect.width || 560;
      const h = rect.height || Math.min(window.innerHeight - 28, 520);
      const left = clamp23(pos.left, 8, Math.max(8, window.innerWidth - w - 8));
      const top = clamp23(pos.top, 8, Math.max(8, window.innerHeight - Math.min(h, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      modal.style.transform = "none";
    }
  }

  function installSettingsDrag23(){
    const {modal,header} = settingsParts23();
    if(!modal || !header || modal.dataset.v23Drag === "1") return;
    modal.dataset.v23Drag = "1";
    modal.classList.add("v23-settings-floating");

    let dragging = false;
    let grabX = 0;
    let grabY = 0;

    header.addEventListener("pointerdown", e => {
      if(e.button !== 0) return;
      const rect = modal.getBoundingClientRect();
      modal.style.left = rect.left + "px";
      modal.style.top = rect.top + "px";
      modal.style.transform = "none";
      grabX = e.clientX - rect.left;
      grabY = e.clientY - rect.top;
      dragging = true;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    header.addEventListener("pointermove", e => {
      if(!dragging) return;
      const rect = modal.getBoundingClientRect();
      const left = clamp23(e.clientX - grabX, 8, Math.max(8, window.innerWidth - rect.width - 8));
      const top = clamp23(e.clientY - grabY, 8, Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 28) - 8));
      modal.style.left = left + "px";
      modal.style.top = top + "px";
      localStorage.setItem(POS_KEY, JSON.stringify({left,top}));
      e.preventDefault();
      e.stopPropagation();
    });

    const stop = e => {
      if(!dragging) return;
      dragging = false;
      try{ header.releasePointerCapture(e.pointerId); }catch(_e){}
      e.preventDefault();
      e.stopPropagation();
    };
    header.addEventListener("pointerup", stop);
    header.addEventListener("pointercancel", stop);
  }

  if(typeof openSettings === "function" && !window.__v13Patch23OpenSettingsWrapped){
    window.__v13Patch23OpenSettingsWrapped = true;
    const prevOpenSettings23 = openSettings;
    openSettings = function(){
      const r = prevOpenSettings23.apply(this,arguments);
      applyStoredPosition23();
      installSettingsDrag23();
      return r;
    };
  }

  installSettingsDrag23();
  window.addEventListener("resize", applyStoredPosition23);
})();

(() => {
  "use strict";
  const TAB_KEY24 = "btc_futures_chart_v13_24_settings_tab";
  const SIZE_KEY24 = "btc_futures_chart_v13_24_settings_size";
  const GREEN24 = "#047857";
  const RED24 = "#7f1d1d";
  const BLACK24 = "#1e2329";

  function n24(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function cid24(o){ return o && (o.parentTradeId || o.chainId || o.tradeChainId || null); }
  function currentSymbol24(){ try{ return typeof cfg === "function" && cfg() ? cfg().symbol : ""; }catch(e){ return ""; } }
  function latestClose24(){ return Array.isArray(candles) && candles.length ? n24(candles[candles.length-1].close) : null; }
  function openEntryCount24(sym){
    sym = sym || currentSymbol24();
    if(Array.isArray(openLotLinks) && openLotLinks.length) return openLotLinks.filter(l => !sym || l.symbol === sym).length;
    if(openEntryMarkerIds && typeof openEntryMarkerIds.has === "function" && Array.isArray(fillMarkers)){
      return fillMarkers.filter(m => m && (!sym || m.symbol === sym) && openEntryMarkerIds.has(m.id)).length;
    }
    return 0;
  }
  function pnlColor24(v){ v = Number(v); return v > 0 ? GREEN24 : v < 0 ? RED24 : BLACK24; }
  function markerById24(id){ return (Array.isArray(fillMarkers) ? fillMarkers : []).find(m => m && m.id === id) || null; }
  function side24(v){ return String(v || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG"; }
  function lineText24(line){ return Array.isArray(line) ? line.map(p => String(p.text || "")).join("") : String(line || ""); }
  function hasText24(el,txt){ return !!(el && el.textContent && el.textContent.trim().toLowerCase().includes(txt)); }

  function installResizable24(){
    const modal = document.querySelector("#settingsModal .modal");
    if(!modal) return;
    modal.classList.add("v24-resizable");
    if(modal.dataset.v24Resize === "1") return;
    modal.dataset.v24Resize = "1";
    try{
      const saved = JSON.parse(localStorage.getItem(SIZE_KEY24) || "null");
      if(saved && Number.isFinite(saved.w) && Number.isFinite(saved.h)){
        modal.style.width = Math.max(420, Math.min(saved.w, window.innerWidth - 16)) + "px";
        modal.style.height = Math.max(340, Math.min(saved.h, window.innerHeight - 16)) + "px";
      }
    }catch(e){}
    if(typeof ResizeObserver === "function"){
      let t = null;
      const ro = new ResizeObserver(entries => {
        const r = entries && entries[0] && entries[0].contentRect;
        if(!r) return;
        clearTimeout(t);
        t = setTimeout(() => {
          try{ localStorage.setItem(SIZE_KEY24, JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)})); }catch(e){}
        },150);
      });
      ro.observe(modal);
    }
  }

  function cardTitle24(card){
    const t = card && card.querySelector && card.querySelector(".settings-card-title");
    return t ? t.textContent.trim() : "";
  }
  function tabForCard24(card){
    const id = String(card.id || "").toLowerCase();
    const text = String((card.textContent || "") + " " + id).toLowerCase();
    const title = cardTitle24(card).toLowerCase();
    if(title.includes("session") || id.includes("session") || text.includes("sessions overlay")) return "sessions";
    if(title.includes("trackpad") || id.includes("trackpad")) return "control";
    if(title.includes("api") || text.includes("binance api") || text.includes("gpt api")) return "apis";
    return "overlays";
  }
  function makePanel24(root,key,label){
    const panel = document.createElement("div");
    panel.className = "v24-settings-panel";
    panel.dataset.tab = key;
    const inner = document.createElement("div");
    inner.className = "v24-settings-panel-grid";
    panel.appendChild(inner);
    root.appendChild(panel);
    return {panel,inner};
  }
  function dedupeMovedCards24(cards){
    // Only removes exact duplicate cards by normalized title + full text after older patch layers have produced repeats.
    // Cards with different controls/text are retained.
    const seen = new Set();
    for(const card of cards){
      const sig = (cardTitle24(card) + "|" + (card.textContent || "")).replace(/\s+/g," ").trim().toLowerCase();
      if(!sig) continue;
      if(seen.has(sig)) card.remove();
      else seen.add(sig);
    }
  }

  function installSettingsTabs24(){
    const modal = document.querySelector("#settingsModal .modal");
    const grid = modal && modal.querySelector(".settings-grid");
    if(!modal || !grid) return;
    installResizable24();
    grid.classList.add("v24-settings-root");

    let tabs = grid.querySelector(":scope > .v24-settings-tabs");
    let panelsRoot = grid.querySelector(":scope > .v24-settings-panels");
    const defs = [
      ["apis","APIs"],
      ["overlays","Chart Overlays"],
      ["control","Control"],
      ["sessions","Sessions"]
    ];

    if(!tabs){
      tabs = document.createElement("div");
      tabs.className = "v24-settings-tabs";
      panelsRoot = document.createElement("div");
      panelsRoot.className = "v24-settings-panels";
      grid.prepend(tabs);
      grid.appendChild(panelsRoot);
      for(const [key,label] of defs){
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "v24-settings-tab";
        btn.dataset.tab = key;
        btn.textContent = label;
        tabs.appendChild(btn);
        makePanel24(panelsRoot,key,label);
        btn.addEventListener("click",() => setActiveTab24(key));
      }
    }

    const panels = new Map(Array.from(panelsRoot.querySelectorAll(".v24-settings-panel")).map(p => [p.dataset.tab,p]));
    const strayCards = Array.from(grid.children).filter(el => el.classList && el.classList.contains("settings-card"));
    for(const card of strayCards){
      const tab = tabForCard24(card);
      const target = panels.get(tab) || panels.get("overlays");
      const inner = target && target.querySelector(".v24-settings-panel-grid");
      if(inner) inner.appendChild(card);
    }
    dedupeMovedCards24(Array.from(panelsRoot.querySelectorAll(".settings-card")));

    let active = localStorage.getItem(TAB_KEY24) || "apis";
    if(!panels.has(active)) active = "apis";
    setActiveTab24(active);
  }

  function setActiveTab24(key){
    const root = document.querySelector("#settingsModal .settings-grid.v24-settings-root");
    if(!root) return;
    root.querySelectorAll(".v24-settings-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === key));
    root.querySelectorAll(".v24-settings-panel").forEach(p => p.classList.toggle("active", p.dataset.tab === key));
    try{ localStorage.setItem(TAB_KEY24,key); }catch(e){}
  }

  function coloredTooltip24(lines,x,y){
    if(!ctx || !canvas) return;
    ctx.save();
    ctx.font = "12px Arial";
    const pad = 12;
    const lh = 17;
    let w = 0;
    for(const line of lines){ w = Math.max(w, ctx.measureText(lineText24(line)).width); }
    w += pad * 2;
    const h = lines.length * lh + pad * 2;
    let tx = x + 14;
    let ty = y + 14;
    const rightAxisW = typeof RIGHT_AXIS !== "undefined" ? RIGHT_AXIS : 76;
    if(tx + w > canvas.clientWidth - rightAxisW) tx = x - w - 14;
    if(ty + h > canvas.clientHeight - 10) ty = y - h - 14;
    ctx.fillStyle = "rgba(255,255,255,.98)";
    ctx.strokeStyle = "#d9dce1";
    ctx.fillRect(tx,ty,w,h);
    ctx.strokeRect(tx,ty,w,h);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line,i) => {
      const yLine = ty + pad + i*lh;
      let xLine = tx + pad;
      const parts = Array.isArray(line) ? line : [{text:String(line || ""),color:BLACK24}];
      for(const part of parts){
        const text = String(part.text || "");
        ctx.fillStyle = part.color || BLACK24;
        ctx.fillText(text,xLine,yLine);
        xLine += ctx.measureText(text).width;
      }
    });
    ctx.restore();
  }

  function openBreakdown24(box){
    const sym = box && box.symbol ? box.symbol : currentSymbol24();
    const chain = cid24(box);
    let rows = (Array.isArray(openLotLinks) ? openLotLinks : []).filter(l => {
      if(!l || l.symbol !== sym) return false;
      const lc = cid24(l);
      return chain && lc ? lc === chain : true;
    }).slice();
    rows.sort((a,b) => (n24(a.entryTime) - n24(b.entryTime)) || String(a.entryMarkerId || "").localeCompare(String(b.entryMarkerId || "")));
    return rows;
  }

  function boxTooltipLines24(it){
    const box = it && it.boxData ? it.boxData : {};
    const current = latestClose24();
    const floating = current != null && typeof openBoxFloating === "function" ? openBoxFloating(box,current) : null;
    const margin = typeof openBoxMargin === "function" ? openBoxMargin(box) : null;
    const rows = openBreakdown24(box);
    const lines = [
      box.stale ? "Open position status stale" : (it.letter === "B" ? "Current open long" : "Current open short"),
      "Size: " + (typeof fq === "function" ? fq(it.qty) : String(it.qty)) + " BTC",
      "Entries: " + (rows.length || openEntryCount24(box.symbol) || "-"),
      "Entry price: " + (typeof p2 === "function" ? p2(it.price) : String(it.price)),
      "Margin: " + (margin == null || typeof fm !== "function" ? "-" : fm(margin))
    ];
    if(rows.length){
      lines.push("Open lots:");
      rows.forEach((l,i) => {
        const m = markerById24(l.entryMarkerId);
        const role = m && m.letter ? m.letter : (i === 0 ? (side24(l.side) === "SHORT" ? "ES" : "EL") : (side24(l.side) === "SHORT" ? "S" : "B"));
        let lotFloating = null;
        if(current != null){
          lotFloating = side24(l.side) === "SHORT"
            ? (n24(l.entryPrice) - current) * n24(l.qty)
            : (current - n24(l.entryPrice)) * n24(l.qty);
        }
        const pnlText = lotFloating == null || typeof fm !== "function" ? "-" : fm(lotFloating);
        lines.push([
          {text:"#" + (i+1) + " " + role + " | " + (typeof fq === "function" ? fq(l.qty) : String(l.qty)) + " | " + (typeof p2 === "function" ? p2(l.entryPrice) : String(l.entryPrice)) + " | ",color:BLACK24},
          {text:pnlText,color:pnlColor24(lotFloating)}
        ]);
      });
    }
    if(floating != null){
      lines.push([
        {text:"Floating P/L: ",color:BLACK24},
        {text:typeof fm === "function" ? fm(floating) : String(floating),color:pnlColor24(floating)}
      ]);
    }
    return lines;
  }

  function installOpenTooltip24(){
    if(typeof drawHoverTooltip !== "function" || window.__v13Patch24HoverWrapped) return;
    window.__v13Patch24HoverWrapped = true;
    const prev = drawHoverTooltip;
    drawHoverTooltip = function(){
      const it = typeof hoverItem === "function" ? hoverItem() : null;
      if(it && mouse && it.kind === "box"){
        coloredTooltip24(boxTooltipLines24(it),mouse.x,mouse.y);
        return;
      }
      return prev.apply(this,arguments);
    };
  }

  function init24(){
    installSettingsTabs24();
    installOpenTooltip24();
  }

  if(typeof openSettings === "function" && !window.__v13Patch24OpenSettingsWrapped){
    window.__v13Patch24OpenSettingsWrapped = true;
    const prevOpen = openSettings;
    openSettings = function(){
      const r = prevOpen.apply(this,arguments);
      setTimeout(init24,0);
      return r;
    };
  }

  init24();
  setTimeout(init24,250);
  window.addEventListener("resize",installResizable24);
  try{ if(typeof draw === "function") draw(); }catch(e){ console.error("PATCH_24 draw failed",e); }
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_25 — price-level formatting + tooltip polish
     - Price level displays use x,xxx format with no decimals.
     - Top-right Floating P/L loss color uses standard red, not dark red.
     - Open-position tooltip colored P/L values are bold.
     - UI display only; no strategy/data/fetch/accounting changes.
  ========================================================= */

  const RED25 = "#f6465d";
  const GREEN25 = "#047857";
  const BLACK25 = "#111827";
  const BORDER25 = "#d9dce1";
  const oldP2_25 = (typeof p2 === "function") ? p2 : null;

  function n25(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function priceLevel25(x){
    const n = Number(x);
    if(!Number.isFinite(n)) return "-";
    return Math.round(n).toLocaleString("en-US");
  }
  function currentSymbol25(){
    return typeof cfg === "function" && cfg() ? cfg().symbol : "";
  }
  function latestClose25(){
    return Array.isArray(candles) && candles.length && Number.isFinite(Number(candles[candles.length-1].close))
      ? Number(candles[candles.length-1].close)
      : null;
  }
  function side25(side){
    return String(side || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
  }
  function cid25(o){
    return o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  }
  function pnlColor25(v){
    const n = Number(v);
    if(!Number.isFinite(n) || Math.abs(n) < 1e-12) return BLACK25;
    return n > 0 ? GREEN25 : RED25;
  }

  // Price level formatter: intentionally no decimals for level-style prices.
  if(!window.__v13Patch25PriceFormat){
    window.__v13Patch25PriceFormat = true;
    try{ window.p2 = priceLevel25; }catch(e){}
    try{ p2 = priceLevel25; }catch(e){}
  }

  function openEntryCount25(symbol){
    const sym = symbol || currentSymbol25();
    if(Array.isArray(openLotLinks) && openLotLinks.length){
      return openLotLinks.filter(l => !sym || l.symbol === sym).length;
    }
    if(typeof openEntryMarkerIds !== "undefined" && openEntryMarkerIds && typeof openEntryMarkerIds.size === "number") return openEntryMarkerIds.size;
    return "-";
  }
  function markerById25(id){
    return Array.isArray(fillMarkers) ? fillMarkers.find(m => m && m.id === id) : null;
  }
  function openBreakdown25(box){
    const sym = box && box.symbol ? box.symbol : currentSymbol25();
    const chain = cid25(box);
    const rows = (Array.isArray(openLotLinks) ? openLotLinks : []).filter(l => {
      if(!l || l.symbol !== sym) return false;
      const lc = cid25(l);
      return chain && lc ? lc === chain : true;
    }).slice();
    rows.sort((a,b) => (n25(a.entryTime) - n25(b.entryTime)) || String(a.entryMarkerId || "").localeCompare(String(b.entryMarkerId || "")));
    return rows;
  }

  function openBoxTooltipLines25(it){
    const box = it && it.boxData ? it.boxData : {};
    const current = latestClose25();
    const floating = current != null && typeof openBoxFloating === "function" ? openBoxFloating(box,current) : null;
    const margin = typeof openBoxMargin === "function" ? openBoxMargin(box) : null;
    const rows = openBreakdown25(box);
    const lines = [
      box.stale ? "Open position status stale" : (it.letter === "B" ? "Current open long" : "Current open short"),
      "Size: " + (typeof fq === "function" ? fq(it.qty) : String(it.qty)) + " BTC",
      "Entries: " + (rows.length || openEntryCount25(box.symbol) || "-"),
      "Entry price: " + priceLevel25(it.price),
      "Margin: " + (margin == null || typeof fm !== "function" ? "-" : fm(margin))
    ];
    if(rows.length){
      lines.push("Open lots:");
      rows.forEach((l,i) => {
        const m = markerById25(l.entryMarkerId);
        const role = m && m.letter ? m.letter : (i === 0 ? (side25(l.side) === "SHORT" ? "ES" : "EL") : (side25(l.side) === "SHORT" ? "S" : "B"));
        let lotFloating = null;
        if(current != null){
          lotFloating = side25(l.side) === "SHORT"
            ? (n25(l.entryPrice) - current) * n25(l.qty)
            : (current - n25(l.entryPrice)) * n25(l.qty);
        }
        const pnlText = lotFloating == null || typeof fm !== "function" ? "-" : fm(lotFloating);
        lines.push([
          {text:"#" + (i+1) + " " + role + " | " + (typeof fq === "function" ? fq(l.qty) : String(l.qty)) + " | " + priceLevel25(l.entryPrice) + " | ",color:BLACK25,bold:false},
          {text:pnlText,color:pnlColor25(lotFloating),bold:true}
        ]);
      });
    }
    if(floating != null){
      lines.push([
        {text:"Floating P/L: ",color:BLACK25,bold:false},
        {text:typeof fm === "function" ? fm(floating) : String(floating),color:pnlColor25(floating),bold:true}
      ]);
    }
    return lines;
  }

  function partFont25(part){
    return (part && part.bold ? "bold " : "") + "12px Arial";
  }
  function measureLine25(ctx,line){
    if(!Array.isArray(line)){
      ctx.font = "12px Arial";
      return ctx.measureText(String(line || "")).width;
    }
    let w = 0;
    for(const part of line){
      ctx.font = partFont25(part);
      w += ctx.measureText(String(part && part.text || "")).width;
    }
    return w;
  }
  function drawOpenTooltip25(lines,x,y){
    if(!ctx || !canvas) return;
    ctx.save();
    const pad = 12;
    const lh = 17;
    let w = 0;
    for(const line of lines) w = Math.max(w, measureLine25(ctx,line));
    w += pad * 2;
    const h = lines.length * lh + pad * 2;
    let tx = x + 14;
    let ty = y + 14;
    const rightAxisW = typeof RIGHT_AXIS !== "undefined" ? RIGHT_AXIS : 76;
    if(tx + w > canvas.clientWidth - rightAxisW) tx = x - w - 14;
    if(ty + h > canvas.clientHeight - 10) ty = y - h - 14;
    ctx.fillStyle = "rgba(255,255,255,.98)";
    ctx.strokeStyle = BORDER25;
    ctx.fillRect(tx,ty,w,h);
    ctx.strokeRect(tx,ty,w,h);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line,i) => {
      const yLine = ty + pad + i*lh;
      let xLine = tx + pad;
      const parts = Array.isArray(line) ? line : [{text:String(line || ""),color:BLACK25,bold:false}];
      for(const part of parts){
        const text = String(part && part.text || "");
        ctx.font = partFont25(part);
        ctx.fillStyle = part.color || BLACK25;
        ctx.fillText(text,xLine,yLine);
        xLine += ctx.measureText(text).width;
      }
    });
    ctx.restore();
  }

  if(typeof drawHoverTooltip === "function" && !window.__v13Patch25HoverWrapped){
    window.__v13Patch25HoverWrapped = true;
    const prevHover25 = drawHoverTooltip;
    drawHoverTooltip = function(){
      const it = typeof hoverItem === "function" ? hoverItem() : null;
      if(it && mouse && it.kind === "box"){
        drawOpenTooltip25(openBoxTooltipLines25(it),mouse.x,mouse.y);
        return;
      }
      return prevHover25.apply(this,arguments);
    };
  }

  if(typeof updatePositionStrip === "function" && !window.__v13Patch25PositionStripWrapped){
    window.__v13Patch25PositionStripWrapped = true;
    const prevUpdate25 = updatePositionStrip;
    updatePositionStrip = function(){
      const r = prevUpdate25.apply(this,arguments);
      try{
        const price = latestClose25();
        const flt = price == null || typeof openBoxesFloating !== "function" ? null : openBoxesFloating(price);
        if(mFloatPL){
          mFloatPL.style.color = flt == null ? BLACK25 : flt > 0 ? GREEN25 : flt < 0 ? RED25 : BLACK25;
        }
        // Preserve two-decimal account balance formatting while price levels use no decimals.
        if(mBalance && oldP2_25){
          const bal = Number(accountBalanceState);
          mBalance.textContent = Number.isFinite(bal) ? oldP2_25(bal) : "-";
        }
      }catch(e){}
      return r;
    };
  }

  try{ if(typeof updatePositionStrip === "function") updatePositionStrip(); }catch(e){}
  try{ if(typeof draw === "function") draw(); }catch(e){ console.error("PATCH_25 draw failed",e); }
})();

(() => {
  "use strict";

  const PATCH = "V13_UI_V2_PATCH_26_LIVE_AXIS_1D";
  const TRACKPAD_KEY21 = "btc_futures_chart_v13_21_trackpad_sensitivity";
  const DAY_MS26 = 24 * 60 * 60 * 1000;

  function n26(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function clamp26(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function sec26(){ try{ return typeof ivSec === "function" ? Number(ivSec()) || 60 : 60; }catch(e){ return 60; } }
  function date26(ms){ return new Date(ms); }
  function timeOnly26(ms){
    const d = date26(ms);
    return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") + ":" + String(d.getSeconds()).padStart(2,"0");
  }
  function dateOnly26(ms){
    const d = date26(ms);
    return String(d.getMonth()+1).padStart(2,"0") + "/" + String(d.getDate()).padStart(2,"0");
  }
  function localMidnight26(ts){
    const d = new Date(ts || Date.now());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  }
  function nextLocalMidnight26(ts){
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()+1, 0, 0, 0, 0).getTime();
  }
  function trackpadSensitivity26(){
    const v = Number(localStorage.getItem(TRACKPAD_KEY21) || "1");
    return Number.isFinite(v) ? clamp26(v,0.25,2) : 1;
  }
  function layout26(){
    if(!canvas || !Array.isArray(candles) || candles.length < 2 || typeof range !== "function") return null;
    const r = range();
    const vis = candles.slice(r.start,r.end);
    if(vis.length < 2) return null;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const left = typeof LEFT_PAD !== "undefined" ? LEFT_PAD : 58;
    const right = typeof RIGHT_AXIS !== "undefined" ? RIGHT_AXIS : 86;
    const top = 18;
    const bottom = 42;
    const gap = 20;
    const usable = Math.max(120,h-top-bottom-gap);
    const volFrac = Math.max(.10,Math.min(.45,window.__p10VolumeFrac || .22));
    const volH = Math.max(38,Math.floor(usable * volFrac));
    const priceH = Math.max(120,usable - volH);
    const volTop = top + priceH + gap;
    const chartW = w - left - right;
    const future = Number(r.futureBars) || 0;
    const total = Math.max(2,vis.length + future);
    const slot = chartW / total;
    return {r,vis,w,h,left,right,top,bottom,gap,usable,volH,priceH,volTop,chartW,future,total,slot,sec:sec26()};
  }
  function timeAtX26(x,st){
    if(!st || !st.vis.length) return null;
    const first = Number(st.vis[0].time);
    return first + ((x - st.left - st.slot/2) / st.slot) * st.sec;
  }
  function xForTime26(t,st){
    if(!st || !st.vis.length) return null;
    const first = Number(st.vis[0].time);
    return st.left + st.slot/2 + ((t - first) / st.sec) * st.slot;
  }

  /* 1D Load Trades / report period from local midnight. */
  function ensureOneDayReport26(){
    const sel = document.getElementById("reportWeeks");
    if(!sel) return;
    if(!Array.from(sel.options).some(o => o.value === "1d")){
      const opt = document.createElement("option");
      opt.value = "1d";
      opt.textContent = "1D";
      sel.insertBefore(opt, sel.firstChild || null);
    }
    sel.value = "1d";
    try{ if(typeof syncCustomRangeVisibility === "function") syncCustomRangeVisibility(); }catch(e){}
  }
  ensureOneDayReport26();

  if(typeof selectedReportPresetMs === "function" && !window.__v13Patch26ReportWrapped){
    window.__v13Patch26ReportWrapped = true;
    const prevSelected26 = selectedReportPresetMs;
    selectedReportPresetMs = function(){
      if(reportWeeksEl && reportWeeksEl.value === "1d") return Math.max(1,Date.now() - localMidnight26(Date.now()));
      return prevSelected26.apply(this,arguments);
    };
    const prevRange26 = typeof reportRangeMs === "function" ? reportRangeMs : null;
    if(prevRange26){
      reportRangeMs = function(){
        if(reportWeeksEl && reportWeeksEl.value === "1d"){
          const end = Date.now();
          return {start:localMidnight26(end),end};
        }
        return prevRange26.apply(this,arguments);
      };
    }
    const prevWeeks26 = typeof weeks === "function" ? weeks : null;
    if(prevWeeks26){ weeks = function(){ return reportWeeksEl && reportWeeksEl.value === "1d" ? 1 : prevWeeks26.apply(this,arguments); }; }
    const prevLabel26 = typeof reportLabel === "function" ? reportLabel : null;
    if(prevLabel26){ reportLabel = function(){ return reportWeeksEl && reportWeeksEl.value === "1d" ? "1D" : prevLabel26.apply(this,arguments); }; }
  }

  /* Browser title: event-driven refresh hooks, timer remains fallback. */
  function updateTitleNow26(){
    try{ if(typeof updateTabTitle === "function") updateTabTitle(); }catch(e){}
  }
  function scheduleTitle26(){
    updateTitleNow26();
    if(typeof requestAnimationFrame === "function") requestAnimationFrame(updateTitleNow26);
    setTimeout(updateTitleNow26,0);
  }
  ["visibilitychange","focus","pageshow"].forEach(ev => window.addEventListener(ev,scheduleTitle26,true));
  if(typeof updatePositionStrip === "function" && !window.__v13Patch26PositionStripTitleWrapped){
    window.__v13Patch26PositionStripTitleWrapped = true;
    const prev = updatePositionStrip;
    updatePositionStrip = function(){ const r = prev.apply(this,arguments); scheduleTitle26(); return r; };
  }
  if(typeof loadTrades === "function" && !window.__v13Patch26LoadTradesTitleWrapped){
    window.__v13Patch26LoadTradesTitleWrapped = true;
    const prev = loadTrades;
    loadTrades = async function(){ const r = await prev.apply(this,arguments); scheduleTitle26(); return r; };
  }

  /* Trackpad sensitivity: make zoom speed proportional to wheel delta magnitude. */
  if(typeof zoomAt === "function" && !window.__v13Patch26ZoomWrapped){
    window.__v13Patch26ZoomWrapped = true;
    zoomAt = function(mx,dy){
      if(!Array.isArray(candles) || !candles.length || typeof range !== "function") return;
      const r = range();
      const vis = candles.slice(r.start,r.end);
      const oldReal = vis.length;
      const oldTotal = Math.max(2,oldReal + (Number(r.futureBars) || 0));
      const left = typeof LEFT_PAD !== "undefined" ? LEFT_PAD : 58;
      const right = typeof RIGHT_AXIS !== "undefined" ? RIGHT_AXIS : 86;
      const chartW = canvas.clientWidth - left - right;
      const slot = chartW / oldTotal;
      let idxView = Math.floor((mx-left)/slot);
      idxView = clamp26(idxView,0,oldTotal-1);
      const anchor = Math.min(idxView,Math.max(0,oldReal-1));
      const global = r.start + anchor;
      const ratio = idxView / oldTotal;
      const mag = clamp26(Math.abs(Number(dy) || 0) / 100, 0.12, 3.0);
      const factor = Math.exp((dy < 0 ? -1 : 1) * 0.20 * mag);
      const rawVisible = Math.round(visibleCount * factor);
      let nc = rawVisible;
      const minVis = typeof MIN_VISIBLE !== "undefined" ? MIN_VISIBLE : 40;
      nc = candles.length < minVis ? candles.length : clamp26(nc,minVis,Math.max(minVis,candles.length));
      const newEnd = Math.round(global + (1-ratio)*nc);
      olderFetchArmed = true;
      if(dy > 0 && rawVisible > candles.length){
        olderFetchTargetVisible = Math.max(olderFetchTargetVisible || 0, rawVisible);
      }else if(rawVisible <= candles.length){
        olderFetchTargetVisible = 0;
      }
      visibleCount = nc;
      rightOffset = candles.length - newEnd;
      if(typeof clampView === "function") clampView();
      if(typeof draw === "function") draw();
    };
  }

  /* Direct-marker hit testing: avoids isolate activation from empty chart/lines/bands. */
  if(typeof hoverItem === "function" && !window.__v13Patch26HoverItemStrict){
    window.__v13Patch26HoverItemStrict = true;
    hoverItem = function(){
      if(!mouse) return null;
      let best = null;
      let bd = Infinity;
      for(const it of overlayHitItems || []){
        if(!it || it.kind !== "marker") continue;
        const d = Math.hypot(mouse.x - it.x, mouse.y - it.y);
        const radius = Math.max(6,Number(it.radius) || 8);
        if(d <= radius + 2 && d < bd){ bd = d; best = it; }
      }
      if(best) return best;
      for(const it of overlayHitItems || []){
        if(!it || it.kind !== "box") continue;
        const size = Number(it.size) || 16;
        if(mouse.x >= it.x-size/2-5 && mouse.x <= it.x+size/2+5 && mouse.y >= it.y-size/2-5 && mouse.y <= it.y+size/2+5) return it;
      }
      for(const it of overlayHitItems || []){
        if(!it || it.kind !== "line" || typeof distSeg !== "function") continue;
        if(distSeg(mouse.x,mouse.y,it.x1,it.y1,it.x2,it.y2) <= 5) return it;
      }
      return null;
    };
  }

  /* Sessions extension through volume area. Reuses V22 localStorage keys/config. */
  const V26_PREFIX = "btc_futures_chart_v13_22_sessions_";
  const V26_SESSIONS = [
    {key:"tokyo",label:"Tokyo",color:[245,158,11],ranges:[[240,390],[450,630]],defaultOn:false},
    {key:"singapore",label:"Singapore",color:[16,185,129],ranges:[[300,480],[540,780]],defaultOn:false},
    {key:"hongkong",label:"Hong Kong",color:[20,184,166],ranges:[[330,720]],defaultOn:false},
    {key:"london",label:"London",color:[59,130,246],ranges:[[660,1170]],defaultOn:true},
    {key:"us",label:"US",color:[99,102,241],ranges:[[1050,1440]],defaultOn:true},
    {key:"overlap",label:"Overlap",color:[14,165,233],ranges:[[1050,1170]],defaultOn:true}
  ];
  function getStored26(k,d){ const v = localStorage.getItem(k); return v == null ? d : v; }
  function overlayEnabled26(){ return getStored26(V26_PREFIX+"enabled","1") !== "0"; }
  function timezone26(){ const z = getStored26(V26_PREFIX+"timezone","UAE"); return ["UAE","UTC","LOCAL"].includes(z) ? z : "UAE"; }
  function offsetMinutes26(){ const z = timezone26(); if(z === "UTC") return 0; if(z === "LOCAL") return -new Date().getTimezoneOffset(); return 240; }
  function dayIndex26(sec,off){ return Math.floor((sec + off*60) / 86400); }
  function dayStartUtc26(dayIdx,off){ return dayIdx * 86400 - off*60; }
  function rgba26(rgb,a){ return "rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+a+")"; }
  function hexToRgb26(hex,fallback){ const m = /^#?([0-9a-f]{6})$/i.exec(String(hex||"")); if(!m) return fallback; const v=m[1]; return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16)]; }
  function sessionOn26(s){ return getStored26(V26_PREFIX+"session_"+s.key, s.defaultOn ? "1" : "0") !== "0"; }
  function sessionOpacity26(s){ const n = Number(getStored26(V26_PREFIX+"opacity_"+s.key, s.key === "overlap" ? "0.16" : "0.10")); return Number.isFinite(n) ? clamp26(n,0.02,0.30) : (s.key === "overlap" ? 0.16 : 0.10); }
  function sessionColor26(s){ return hexToRgb26(getStored26(V26_PREFIX+"color_"+s.key,""),s.color); }
  function drawSessionsVolume26(st){
    if(!overlayEnabled26() || !st || !st.vis.length) return;
    const first = Number(st.vis[0].time);
    const last = Number(st.vis[st.vis.length-1].time) + st.sec + (st.future * st.sec);
    const off = offsetMinutes26();
    const startDay = dayIndex26(first,off) - 1;
    const endDay = dayIndex26(last,off) + 1;
    const yTop = st.top;
    const yH = (st.volTop + st.volH) - st.top;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.beginPath(); ctx.rect(st.left,st.top,st.chartW,yH); ctx.clip();
    for(const s of V26_SESSIONS){
      if(!sessionOn26(s)) continue;
      for(let d=startDay; d<=endDay; d++){
        const base = dayStartUtc26(d,off);
        for(const rg of s.ranges){
          const a = base + rg[0]*60;
          const b = base + rg[1]*60;
          if(b <= first || a >= last) continue;
          let x1 = xForTime26(a,st), x2 = xForTime26(b,st);
          x1 = clamp26(x1,st.left,st.left+st.chartW);
          x2 = clamp26(x2,st.left,st.left+st.chartW);
          if(x2-x1 < 1) continue;
          ctx.fillStyle = rgba26(sessionColor26(s),sessionOpacity26(s));
          ctx.fillRect(Math.round(x1),yTop,Math.max(1,Math.round(x2-x1)),yH);
        }
      }
    }
    ctx.restore();
  }

  function drawDaySeparators26(st){
    if(localStorage.getItem("btc_futures_chart_v13_27_day_separator_enabled") === "0") return;
    if(!st || !st.vis.length) return;
    const firstMs = Number(st.vis[0].time) * 1000;
    const lastMs = (Number(st.vis[st.vis.length-1].time) + st.sec + st.future * st.sec) * 1000;
    let t = nextLocalMidnight26(firstMs - DAY_MS26);
    const end = lastMs + DAY_MS26;
    ctx.save();
    ctx.strokeStyle = "rgba(31,41,55,.18)";
    ctx.lineWidth = typeof hairline === "function" ? hairline() : 1;
    ctx.setLineDash([]);
    while(t <= end){
      const x = xForTime26(t/1000,st);
      if(x >= st.left && x <= st.left + st.chartW){
        ctx.beginPath();
        ctx.moveTo(px ? px(x) : x, px ? px(st.top) : st.top);
        ctx.lineTo(px ? px(x) : x, px ? px(st.volTop + st.volH) : (st.volTop+st.volH));
        ctx.stroke();
      }
      t += DAY_MS26;
    }
    ctx.restore();
  }

  function drawExtendedAxis26(st){
    if(!st || !st.vis.length) return;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.fillRect(st.left, st.h - st.bottom + 1, st.chartW, st.bottom - 1);
    ctx.fillStyle = "#707a8a";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for(let i=0;i<=4;i++){
      const x = st.left + st.chartW * i / 4;
      const t = timeAtX26(x,st);
      if(t == null) continue;
      const ms = t * 1000;
      ctx.fillText(timeOnly26(ms),x,st.h-30);
      ctx.fillText(dateOnly26(ms),x,st.h-14);
    }
    if(mouse && mouse.x >= st.left && mouse.x <= st.left + st.chartW){
      const t = timeAtX26(mouse.x,st);
      if(t != null){
        const ms = t * 1000;
        const topText = timeOnly26(ms);
        const botText = dateOnly26(ms);
        ctx.font = "bold 11px Arial";
        const bw = Math.max(ctx.measureText(topText).width, ctx.measureText(botText).width) + 12;
        const bx = clamp26(mouse.x - bw/2, st.left, st.left + st.chartW - bw);
        const by = st.h - 39;
        ctx.fillStyle = "rgba(255,255,255,.98)";
        ctx.strokeStyle = "#c7cdd6";
        ctx.fillRect(bx,by,bw,32);
        ctx.strokeRect(bx,by,bw,32);
        ctx.fillStyle = "#1f2937";
        ctx.textAlign = "center";
        ctx.fillText(topText,bx+bw/2,by+4);
        ctx.font = "11px Arial";
        ctx.fillText(botText,bx+bw/2,by+18);
      }
    }
    ctx.restore();
  }

  function drawPatch26Overlays(){
    const st = layout26();
    if(!st) return;
    drawSessionsVolume26(st);
    drawDaySeparators26(st);
    drawExtendedAxis26(st);
  }

  if(typeof draw === "function" && !window.__v13Patch26DrawWrapped){
    window.__v13Patch26DrawWrapped = true;
    const prevDraw26 = draw;
    draw = function(){
      const r = prevDraw26.apply(this,arguments);
      try{ drawPatch26Overlays(); }catch(e){ console.warn(PATCH + " overlay failed",e); }
      scheduleTitle26();
      return r;
    };
  }

  function applySettingsDefault26(){
    const modal = document.querySelector("#settingsModal .modal");
    if(!modal) return;
    modal.classList.add("v24-resizable","v23-settings-floating");
    modal.style.maxWidth = "calc(100vw - 16px)";
    modal.style.maxHeight = "calc(100vh - 16px)";
    if(!modal.style.width || modal.style.width === "") modal.style.width = "min(925px, calc(100vw - 32px))";
    if(!modal.style.height || modal.style.height === "") modal.style.height = "min(710px, calc(100vh - 28px))";
  }
  if(typeof openSettings === "function" && !window.__v13Patch26OpenSettingsWrapped){
    window.__v13Patch26OpenSettingsWrapped = true;
    const prevOpen26 = openSettings;
    openSettings = function(){ const r = prevOpen26.apply(this,arguments); setTimeout(applySettingsDefault26,0); return r; };
  }

  if(reportWeeksEl){
    reportWeeksEl.addEventListener("change",() => { if(reportWeeksEl.value !== "custom") localStorage.setItem("btc_futures_chart_v13_26_last_report",reportWeeksEl.value); },true);
  }

  scheduleTitle26();
  setTimeout(() => { ensureOneDayReport26(); applySettingsDefault26(); try{ if(typeof draw === "function") draw(); }catch(e){} },0);
})();

(() => {
  "use strict";

  /* =========================================================
     V13_UI_V2_PATCH_27_FINAL_UI_R1
     Fix: ensure Settings > Sessions day-separator toggle is inserted
     after the final Settings/tabs wrappers are loaded.
     UI only. No data/strategy/fetch/GPT/scoring/accounting changes.
  ========================================================= */

  const DAY_SEP_KEY = "btc_futures_chart_v13_27_day_separator_enabled";

  function daySeparatorEnabled(){
    return localStorage.getItem(DAY_SEP_KEY) !== "0";
  }

  function redraw(){
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }

  function installDaySeparatorToggle(){
    const card = document.getElementById("v22SessionsCard");
    if(!card) return false;
    if(document.getElementById("v27DaySeparatorRow")) return true;

    const row = document.createElement("div");
    row.className = "v22-session-row";
    row.id = "v27DaySeparatorRow";
    row.innerHTML = `
      <span>Day separator</span>
      <label><input id="v27DaySeparatorEnabled" type="checkbox" ${daySeparatorEnabled() ? "checked" : ""}> Show vertical separator</label>
      <span></span>`;

    const labelsInput = document.getElementById("v22SessionsLabels");
    const labelsRow = labelsInput && labelsInput.closest(".v22-session-row");
    if(labelsRow && labelsRow.parentNode === card){
      labelsRow.insertAdjacentElement("afterend",row);
    }else{
      const table = card.querySelector(".v22-sessions-list");
      if(table && table.parentNode === card) table.insertAdjacentElement("beforebegin",row);
      else card.appendChild(row);
    }

    const input = document.getElementById("v27DaySeparatorEnabled");
    if(input){
      input.addEventListener("change",() => {
        localStorage.setItem(DAY_SEP_KEY,input.checked ? "1" : "0");
        redraw();
      });
    }
    return true;
  }

  function installSoon(){
    installDaySeparatorToggle();
    setTimeout(installDaySeparatorToggle,0);
    setTimeout(installDaySeparatorToggle,80);
    setTimeout(installDaySeparatorToggle,250);
  }

  if(typeof openSettings === "function" && !window.__v13Patch27R1OpenSettingsWrapped){
    window.__v13Patch27R1OpenSettingsWrapped = true;
    const prevOpen = openSettings;
    openSettings = function(){
      const r = prevOpen.apply(this,arguments);
      installSoon();
      return r;
    };
  }

  document.addEventListener("click",(e) => {
    const t = e.target;
    if(t && t.closest && t.closest("#settingsModal")) setTimeout(installDaySeparatorToggle,0);
  },true);

  const modalRoot = document.getElementById("settingsModal") || document.body;
  try{
    const mo = new MutationObserver(() => installDaySeparatorToggle());
    mo.observe(modalRoot,{childList:true,subtree:true});
  }catch(_e){}

  installSoon();
})();

(() => {
  "use strict";

  const MODULE = "V13_UI_V2_PATCH_31_SL_ALGO_ORDER_FIX";
  const STORE_KEY = "btc_futures_chart_v13_assess_prompt_templates_v29";
  const TIMEOUT_MS = 10000;
  const PACKET_FULL_LIMIT = 150000;
  const TF_PLAN = [
    {key:"1D", interval:"1d", fetch:180, raw:40, fallbackRaw:30, role:"HIGHER TIMEFRAME / MACRO CONTEXT"},
    {key:"4H", interval:"4h", fetch:180, raw:60, fallbackRaw:50, role:"HIGHER TIMEFRAME / ACTIVE CYCLE"},
    {key:"1H", interval:"1h", fetch:240, raw:80, fallbackRaw:70, role:"MAIN STRUCTURE"},
    {key:"15M", interval:"15m", fetch:240, raw:100, fallbackRaw:90, role:"EXECUTION STRUCTURE"},
    {key:"5M", interval:"5m", fetch:300, raw:120, fallbackRaw:100, role:"LOCAL EXECUTION / CONFIRMATION"},
    {key:"3M", interval:"3m", fetch:300, raw:80, fallbackRaw:60, role:"MICROSTRUCTURE / EARLY WARNING ONLY"},
    {key:"1M", interval:"1m", fetch:240, raw:60, fallbackRaw:40, role:"MICROSTRUCTURE / EARLY WARNING ONLY"}
  ];
  const OI_TFS = new Set(["1d","4h","1h","15m","5m"]);

  const DEFAULT_PROMPT = `Assess the current open position using the provided data only.
Do not invent missing data. If a dataset is marked missing, treat it as unavailable.
Use detected levels as context, not as guaranteed signals.
Prioritize open-position risk first, exit/reduction warnings first, and adding conditions second.

If there is NO open position, bypass current-position assessment and use the same data packet to locate a fresh entry opportunity.
For no-position mode, focus on preferred side, entry zone, SL, invalidation, TP1/TP2/TP3, wait/no-chase conditions, and setup quality.
In no-position mode, Section 1 should still show immediate warnings if any, Section 2 should become Fresh Entry Assessment, and Section 3 remains Market Assessment.

Return exactly this report format when there IS an open position:

[SYMBOL] — POSITION / MARKET ASSESSMENT
Dubai Time: [YYYY-MM-DD HH:mm]

## 1. Immediate Warnings

- **Exit / reduce warning:** [if any, otherwise write "None"]
- **Position risk:** [risk to current open position]
- **Add warning:** [add/no-add condition, secondary to exit/reduce]

## 2. Position Assessment

- **Date and Time:** [YYYY-MM-DD HH:mm Dubai]
- **Position side:** [LONG / SHORT / NONE]

- **Position quality:** [A / B / C / WAIT]
- **Conf Score:** [%]
- **Risk Score:** [%]

- **Action:** [HOLD / REDUCE / EXIT / MOVE SL / ADD / NO ADD / WAIT]

- **TP1:** [level only]
- **TP2:** [level only]
- **TP3:** [level only]

- **Current risk:** [Low / Medium / High]
- **Position validity:** [one clean level condition]
- **SL handling:** [clean recommended SL action/level]
- **Justification:** [one line]
- **Invalidation:** [clean invalidation level/condition]

**Management**
- [bullet]
- [bullet]
- [bullet]

## 3. Market Assessment

- **Market state:** [one line]
- **Bias:** [one line]
- **Structure:** [one line]
- **15M:** [one line]
- **5M:** [one line]
- **Microstructure:** [one line using 3M/1M only as early warning]
- **Volume/participation:** [one line]
- **OI / mark-price context:** [one line or unavailable]

**Reason**
- [bullet]
- [bullet]
- [bullet]
- [bullet]

If there is NO open position, use this Section 2 instead:

## 2. Fresh Entry Assessment

- **Date and Time:** [YYYY-MM-DD HH:mm Dubai]
- **Preferred side:** [LONG / SHORT / WAIT]

- **Setup quality:** [A / B / C / WAIT]
- **Conf Score:** [%]
- **Risk Score:** [%]

- **Action:** [WAIT / LONG / SHORT / NO TRADE]

- **Entry zone:** [level / range]
- **SL:** [level]
- **Invalidation:** [level / condition]

- **TP1:** [level only]
- **TP2:** [level only]
- **TP3:** [level only]

**Fresh-entry management**
- [wait/no-chase condition]
- [trigger needed before entry]
- [reason to avoid entry if invalidated]`;

  const n = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
  const q = id => document.getElementById(id);
  const fmtPrice = v => { const x = n(v); return x == null ? "-" : Math.round(x).toLocaleString("en-US"); };
  const fmtRawPrice = v => { const x = n(v); return x == null ? "-" : String(Number(x.toFixed(2))); };
  const fmtQty = v => { const x = n(v); if(x == null) return "-"; if(x > 0 && Math.abs(x) < 0.001) return "<0.001"; return Number(x.toFixed(6)).toLocaleString("en-US",{maximumFractionDigits:6}); };
  const fmtPct = v => { const x = n(v); return x == null ? "-" : (x > 0 ? "+" : "") + x.toFixed(2) + "%"; };
  const fmtNum = v => { const x = n(v); return x == null ? "-" : Number(x.toFixed(3)).toLocaleString("en-US",{maximumFractionDigits:3}); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function localTime(ms){ const d = new Date(ms || Date.now()); const pad = x => String(x).padStart(2,"0"); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes()); }
  function fmtTime(msOrSec){ const x=n(msOrSec); if(x==null||x<=0) return "-"; return localTime(x>1e12?x:x*1000); }
  function currentSymbol(){ try{return typeof cfg==="function"&&cfg()&&cfg().symbol?cfg().symbol:(q("market")?q("market").value.toUpperCase():"-");}catch(_e){return "-";} }
  function quoteAsset(){ const s=currentSymbol(); if(s.endsWith("USDT")) return "BTC"; if(s.endsWith("USDC")) return "BTC"; return "SIZE"; }
  function cfgRest(){ try{return typeof cfg==="function"&&cfg()&&cfg().rest?cfg().rest:"https://fapi.binance.com/fapi/v1/klines";}catch(_e){return "https://fapi.binance.com/fapi/v1/klines";} }
  function latestAppCandle(){ try{return Array.isArray(candles)&&candles.length?candles[candles.length-1]:null;}catch(_e){return null;} }
  function appCurrentPrice(){ const c=latestAppCandle(); if(c&&n(c.close)!=null) return n(c.close); try{ if(n(lastMarkPrice)!=null) return n(lastMarkPrice); }catch(_e){} return null; }
  function sideOfBox(b){ const s=String(b&&b.side||"").toUpperCase(); if(s==="SHORT"||(b&&b.letter==="S")) return "SHORT"; if(s==="LONG"||(b&&b.letter==="B")) return "LONG"; return "-"; }
  function markerById(id){ try{return (Array.isArray(fillMarkers)?fillMarkers.find(m=>m&&m.id===id):null)||null;}catch(_e){return null;} }
  function chainId(o){ return o&&(o.parentTradeId||o.chainId||o.tradeChainId||null); }

  function loadPromptStore(){ try{ const raw=JSON.parse(localStorage.getItem(STORE_KEY)||"null"); if(raw&&Array.isArray(raw.items)) return raw; }catch(_e){} return {selectedId:"default",nextId:1,items:[]}; }
  function savePromptStore(store){ try{ localStorage.setItem(STORE_KEY,JSON.stringify(store)); }catch(_e){} }
  function activePrompt(){ const store=loadPromptStore(); const item=store.items.find(x=>x.id===store.selectedId); return item&&item.text?item.text:DEFAULT_PROMPT; }

  function installButton(){
    if(q("v29AssessBtn")) return true;
    const account=q("mBalance")&&q("mBalance").closest(".metric");
    if(!account||!account.parentNode) return false;
    const wrap=document.createElement("div");
    wrap.className="v29-assess-metric";
    wrap.id="v29AssessMetric";
    wrap.innerHTML=`<button id="v29AssessBtn" class="v29-assess-btn" type="button" title="Assess" aria-label="Assess">🧭</button>`;
    account.insertAdjacentElement("beforebegin",wrap);
    const btn=q("v29AssessBtn");
    if(btn) btn.addEventListener("click",()=>onAssessClick());
    return true;
  }
  function setBusy(on){ const btn=q("v29AssessBtn"); if(!btn) return; btn.classList.toggle("busy",!!on); btn.disabled=!!on; }
  function showToast(text){ let toast=q("v29AssessToast"); if(!toast){toast=document.createElement("div");toast.id="v29AssessToast";toast.className="v29-assess-toast";document.body.appendChild(toast);} toast.textContent=text||"Assessment package copied"; toast.classList.add("show"); clearTimeout(toast.__timer); toast.__timer=setTimeout(()=>toast.classList.remove("show"),1800); }
  function copyText(text){ if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text); return Promise.reject(new Error("Clipboard API unavailable")); }

  function ensurePackageModal(){ let modal=q("v29AssessModal"); if(modal) return modal; modal=document.createElement("div"); modal.className="modal-backdrop hidden"; modal.id="v29AssessModal"; modal.innerHTML=`<div class="modal"><h3>Assessment package</h3><div class="v29-modal-subtitle">Clipboard write was blocked. Edit/copy manually if needed.</div><textarea id="v29AssessText"></textarea><div class="modal-actions"><button class="secondary" id="v29AssessClose" type="button">Close</button><button id="v29AssessCopy" type="button">Copy</button></div></div>`; document.body.appendChild(modal); modal.addEventListener("click",e=>{if(e.target===modal)hidePackageModal();}); q("v29AssessClose").addEventListener("click",hidePackageModal); q("v29AssessCopy").addEventListener("click",async()=>{const ta=q("v29AssessText"); const text=ta?ta.value:""; try{await copyText(text);showToast("Assessment package copied");}catch(_e){try{ta.focus();ta.select();document.execCommand("copy");showToast("Assessment package copied");}catch(_e2){}}}); return modal; }
  function showPackageModal(text){ const modal=ensurePackageModal(); const ta=q("v29AssessText"); if(ta) ta.value=text; modal.classList.remove("hidden"); setTimeout(()=>{if(ta){ta.focus();ta.select();}},0); }
  function hidePackageModal(){ const m=q("v29AssessModal"); if(m) m.classList.add("hidden"); }
  function ensureWarningModal(){ let modal=q("v29AssessWarningModal"); if(modal) return modal; modal=document.createElement("div"); modal.className="modal-backdrop hidden"; modal.id="v29AssessWarningModal"; modal.innerHTML=`<div class="modal"><h3>Assessment data warning</h3><div class="v29-modal-subtitle">Some datasets failed or timed out. Choose how to proceed.</div><textarea id="v29AssessWarningText" readonly></textarea><div class="modal-actions"><button class="secondary" id="v29WarnCancel" type="button">Cancel</button><button class="secondary" id="v29WarnRetry" type="button">Retry</button><button class="secondary" id="v29WarnWait" type="button">Wait More</button><button id="v29WarnProceed" type="button">Proceed</button></div></div>`; document.body.appendChild(modal); return modal; }
  function showWarningModal(report){ const modal=ensureWarningModal(); const ta=q("v29AssessWarningText"); if(ta) ta.value=report; modal.classList.remove("hidden"); return new Promise(resolve=>{ const done=v=>{modal.classList.add("hidden"); resolve(v);}; q("v29WarnCancel").onclick=()=>done("cancel"); q("v29WarnRetry").onclick=()=>done("retry"); q("v29WarnWait").onclick=()=>done("wait"); q("v29WarnProceed").onclick=()=>done("proceed"); }); }

  function installAssessSettingsTab(){
    const modal=document.querySelector("#settingsModal .modal");
    const grid=modal&&modal.querySelector(".settings-grid.v24-settings-root, .settings-grid");
    if(!modal||!grid) return false;
    const tabs=grid.querySelector(":scope > .v24-settings-tabs");
    const panelsRoot=grid.querySelector(":scope > .v24-settings-panels");
    if(!tabs||!panelsRoot) return false;
    if(!q("v29AssessSettingsTab")){ const btn=document.createElement("button"); btn.type="button"; btn.id="v29AssessSettingsTab"; btn.className="v24-settings-tab"; btn.dataset.tab="assess"; btn.textContent="Assess"; tabs.appendChild(btn); btn.addEventListener("click",()=>setAssessTabActive()); }
    if(!q("v29AssessSettingsPanel")){ const panel=document.createElement("div"); panel.id="v29AssessSettingsPanel"; panel.className="v24-settings-panel"; panel.dataset.tab="assess"; const inner=document.createElement("div"); inner.className="v24-settings-panel-grid"; inner.innerHTML=`<div class="settings-card v29-assess-settings-card"><div class="settings-card-title">Assess Prompt Templates</div><div class="settings-card-desc">Manual local prompt templates used before the generated data packet. No GPT API call is made.</div><div class="v29-assess-settings-row"><label>Saved prompt <select id="v29AssessPromptSelect"></select></label><label>Name <input id="v29AssessPromptName" type="text" placeholder="Prompt name"></label></div><textarea id="v29AssessPromptText" spellcheck="false"></textarea><div class="v29-assess-settings-actions"><button id="v29AssessPromptSave" type="button">Save</button><button class="secondary" id="v29AssessPromptDelete" type="button">Delete</button><button class="secondary" id="v29AssessPromptDefault" type="button">Reset Default Text</button></div><div class="v29-assess-small-note">Saved locally in this browser. The generated data packet is appended under --- DATA PACKET ---.</div></div>`; panel.appendChild(inner); panelsRoot.appendChild(panel); bindPromptControls(); }
    refreshPromptControls(); return true;
  }
  function setAssessTabActive(){ const root=document.querySelector("#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid"); if(!root) return; root.querySelectorAll(".v24-settings-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab==="assess")); root.querySelectorAll(".v24-settings-panel").forEach(p=>p.classList.toggle("active",p.dataset.tab==="assess")); try{localStorage.setItem("btc_futures_chart_v13_24_settings_tab","assess");}catch(_e){} }
  function bindPromptControls(){ const sel=q("v29AssessPromptSelect"), name=q("v29AssessPromptName"), text=q("v29AssessPromptText"), save=q("v29AssessPromptSave"), del=q("v29AssessPromptDelete"), reset=q("v29AssessPromptDefault"); if(sel) sel.addEventListener("change",()=>{const store=loadPromptStore(); store.selectedId=sel.value; savePromptStore(store); refreshPromptControls();}); if(save) save.addEventListener("click",()=>{const store=loadPromptStore(); let id=sel&&sel.value&&sel.value!=="default"?sel.value:null; if(!id){id="p"+(store.nextId||1); store.nextId=(store.nextId||1)+1;} let item=store.items.find(x=>x.id===id); if(!item){item={id,created:Date.now()}; store.items.push(item);} item.name=(name&&name.value.trim())||("Prompt "+id.replace(/^p/,"")); item.text=text?text.value:DEFAULT_PROMPT; item.updated=Date.now(); store.selectedId=id; savePromptStore(store); refreshPromptControls(); showToast("Assess prompt saved");}); if(del) del.addEventListener("click",()=>{const store=loadPromptStore(); const id=sel&&sel.value; if(!id||id==="default") return; store.items=store.items.filter(x=>x.id!==id); store.selectedId="default"; savePromptStore(store); refreshPromptControls(); showToast("Assess prompt deleted");}); if(reset) reset.addEventListener("click",()=>{if(text)text.value=DEFAULT_PROMPT; showToast("Default prompt loaded");}); }
  function refreshPromptControls(){ const sel=q("v29AssessPromptSelect"), name=q("v29AssessPromptName"), text=q("v29AssessPromptText"); if(!sel||!name||!text) return; const store=loadPromptStore(); sel.innerHTML=`<option value="default">Default prompt</option>`+store.items.map((it,idx)=>`<option value="${esc(it.id)}">${idx+1}. ${esc(it.name||it.id)}</option>`).join(""); if(!store.items.find(x=>x.id===store.selectedId)) store.selectedId="default"; sel.value=store.selectedId||"default"; const item=store.items.find(x=>x.id===sel.value); name.value=item?(item.name||""):"Default prompt"; text.value=item?(item.text||DEFAULT_PROMPT):DEFAULT_PROMPT; }

  function parseKline(row){ return {openTime:n(row[0]),open:n(row[1]),high:n(row[2]),low:n(row[3]),close:n(row[4]),volume:n(row[5]),closeTime:n(row[6]),quoteVolume:n(row[7]),tradeCount:n(row[8]),takerBuyBase:n(row[9]),takerBuyQuote:n(row[10])}; }
  async function fetchJson(url,timeoutMs){ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs||TIMEOUT_MS); try{ const r=await API.fetch(url,{cache:"no-store",headers:{"Cache-Control":"no-cache","Pragma":"no-cache"},signal:controller.signal}); const data=await r.json().catch(()=>null); if(!r.ok) throw new Error((data&&data.msg)?data.msg:"HTTP "+r.status); return data; }finally{ clearTimeout(timer); } }
  function publicBase(){ return "https://fapi.binance.com"; }
  async function fetchKlines(symbol,tf,timeoutMs){ const url=cfgRest()+"?symbol="+encodeURIComponent(symbol)+"&interval="+encodeURIComponent(tf.interval)+"&limit="+encodeURIComponent(tf.fetch)+"&endTime="+Date.now(); const rows=await fetchJson(url,timeoutMs); if(!Array.isArray(rows)) throw new Error("Invalid kline response"); return rows.map(parseKline).filter(c=>c.openTime!=null); }
  async function fetchMarkKlines(symbol,tf,timeoutMs){ const url=publicBase()+"/fapi/v1/markPriceKlines?symbol="+encodeURIComponent(symbol)+"&interval="+encodeURIComponent(tf.interval)+"&limit="+encodeURIComponent(Math.min(120,tf.fetch))+"&endTime="+Date.now(); const rows=await fetchJson(url,timeoutMs); if(!Array.isArray(rows)) throw new Error("Invalid mark-price response"); return rows.map(parseKline).filter(c=>c.openTime!=null); }
  async function fetchOI(symbol,tf,timeoutMs){ if(!OI_TFS.has(tf.interval)) return null; const url=publicBase()+"/futures/data/openInterestHist?symbol="+encodeURIComponent(symbol)+"&period="+encodeURIComponent(tf.interval)+"&limit="+encodeURIComponent(Math.min(120,tf.fetch))+"&endTime="+Date.now(); const rows=await fetchJson(url,timeoutMs); if(!Array.isArray(rows)) throw new Error("Invalid OI response"); return rows; }
  async function loadMarketData(timeoutMs){ const symbol=currentSymbol(); const results={symbol,time:Date.now(),tfs:{},missing:[],warnings:[]}; await Promise.all(TF_PLAN.map(async tf=>{ const bucket={plan:tf,klines:null,mark:null,oi:null,errors:[]}; try{bucket.klines=await fetchKlines(symbol,tf,timeoutMs);}catch(e){bucket.errors.push("klines: "+(e&&e.message?e.message:String(e)));results.missing.push(tf.key+" klines");} try{bucket.mark=await fetchMarkKlines(symbol,tf,timeoutMs);}catch(e){bucket.errors.push("mark price: "+(e&&e.message?e.message:String(e)));results.missing.push(tf.key+" mark price");} if(OI_TFS.has(tf.interval)){try{bucket.oi=await fetchOI(symbol,tf,timeoutMs);}catch(e){bucket.errors.push("OI: "+(e&&e.message?e.message:String(e)));results.missing.push(tf.key+" OI");}} results.tfs[tf.key]=bucket; })); return results; }

  function pivotLevels(arr,span){ const highs=[],lows=[],s=span||2; for(let i=s;i<arr.length-s;i++){ const c=arr[i]; let hi=true,lo=true; for(let j=i-s;j<=i+s;j++){ if(j===i) continue; if(n(arr[j].high)>=n(c.high)) hi=false; if(n(arr[j].low)<=n(c.low)) lo=false; } if(hi) highs.push({time:c.openTime,price:c.high}); if(lo) lows.push({time:c.openTime,price:c.low}); } return {highs,lows}; }
  function summarizeTF(bucket,current){ const arr=bucket&&Array.isArray(bucket.klines)?bucket.klines:[]; if(!arr.length) return null; const latest=arr[arr.length-1]; const high=Math.max(...arr.map(c=>n(c.high)??-Infinity)); const low=Math.min(...arr.map(c=>n(c.low)??Infinity)); const close=n(latest.close); const pos=close!=null&&high>low?((close-low)/(high-low)*100):null; const vols=arr.map(c=>n(c.volume)).filter(x=>x!=null); const avgVol=vols.length?vols.reduce((a,b)=>a+b,0)/vols.length:null; const latestVol=n(latest.volume); const takerQuote=arr.reduce((a,c)=>a+(n(c.takerBuyQuote)||0),0); const quoteVol=arr.reduce((a,c)=>a+(n(c.quoteVolume)||0),0); const takerRatio=quoteVol>0?takerQuote/quoteVol*100:null; const piv=pivotLevels(arr,bucket.plan.interval==="1m"||bucket.plan.interval==="3m"?3:2); const recentHigh=piv.highs[piv.highs.length-1]||null; const recentLow=piv.lows[piv.lows.length-1]||null; const rangeWindow=arr.slice(-Math.min(50,arr.length)); const rangeHigh=Math.max(...rangeWindow.map(c=>n(c.high)??-Infinity)); const rangeLow=Math.min(...rangeWindow.map(c=>n(c.low)??Infinity)); const allLevels=[...piv.highs.map(x=>({type:"R",price:x.price,time:x.time})),...piv.lows.map(x=>({type:"S",price:x.price,time:x.time})),{type:"R",price:rangeHigh,time:latest.openTime},{type:"S",price:rangeLow,time:latest.openTime}].filter(x=>n(x.price)!=null); const above=allLevels.filter(x=>n(x.price)>current).sort((a,b)=>a.price-b.price)[0]||null; const below=allLevels.filter(x=>n(x.price)<current).sort((a,b)=>b.price-a.price)[0]||null; const prevHigh=piv.highs.length>1?piv.highs[piv.highs.length-2]:null; const prevLow=piv.lows.length>1?piv.lows[piv.lows.length-2]:null; const hhll=[]; if(recentHigh&&prevHigh) hhll.push(recentHigh.price>prevHigh.price?"HH":"LH"); if(recentLow&&prevLow) hhll.push(recentLow.price>prevLow.price?"HL":"LL"); let sweep="none"; if(prevHigh&&n(latest.high)>prevHigh.price&&n(latest.close)<prevHigh.price) sweep="sweep high / failed breakout near "+fmtPrice(prevHigh.price); if(prevLow&&n(latest.low)<prevLow.price&&n(latest.close)>prevLow.price) sweep="sweep low / failed breakdown near "+fmtPrice(prevLow.price); const firstHalf=rangeWindow.slice(0,Math.floor(rangeWindow.length/2)); const secondHalf=rangeWindow.slice(Math.floor(rangeWindow.length/2)); const width1=firstHalf.length?Math.max(...firstHalf.map(c=>c.high))-Math.min(...firstHalf.map(c=>c.low)):null; const width2=secondHalf.length?Math.max(...secondHalf.map(c=>c.high))-Math.min(...secondHalf.map(c=>c.low)):null; const compression=width1&&width2&&width2<width1*.65?"possible compression":"not detected"; const markLatest=bucket.mark&&bucket.mark.length?bucket.mark[bucket.mark.length-1]:null; let oiContext="unavailable"; if(bucket.oi&&bucket.oi.length){ const first=n(bucket.oi[0].sumOpenInterest||bucket.oi[0].sumOpenInterestValue||bucket.oi[0].openInterest); const lastOi=n(bucket.oi[bucket.oi.length-1].sumOpenInterest||bucket.oi[bucket.oi.length-1].sumOpenInterestValue||bucket.oi[bucket.oi.length-1].openInterest); oiContext=first&&lastOi?fmtPct((lastOi-first)/first*100):"available"; } return {latest,high,low,pos,avgVol,latestVol,takerRatio,recentHigh,recentLow,rangeHigh,rangeLow,above,below,hhll:hhll.join(" / ")||"unconfirmed",sweep,compression,markLatest,oiContext}; }

  function boxRows(){ try{return Array.isArray(openPositionBoxes)?openPositionBoxes.slice():[];}catch(_e){return [];} }
  function openEntries(){ let rows=[]; const sym=currentSymbol(); try{ if(Array.isArray(openLotLinks)&&openLotLinks.length){ rows=openLotLinks.filter(l=>!l.symbol||l.symbol===sym).map(l=>{ const m=markerById(l.entryMarkerId); return {price:n(l.entryPrice)??n(m&&m.price),qty:Math.abs(n(l.qty)??n(m&&m.qty)??0),time:n(l.entryTime)??n(m&&m.time),side:String(l.side||(m&&m.side)||"").toUpperCase(),chainId:chainId(l)||chainId(m)}; }).filter(x=>x.price!=null&&x.qty>0).sort((a,b)=>(a.time||0)-(b.time||0)); } }catch(_e){rows=[];} if(!rows.length){ rows=boxRows().map(b=>({price:n(b.price),qty:Math.abs(n(b.qty)||0),time:n(b.time),side:sideOfBox(b),chainId:chainId(b)})).filter(x=>x.price!=null&&x.qty>0); } rows.forEach((r,i)=>r.sequence=i+1); return rows; }
  function weightedAvg(rows){ let q=0,v=0; rows.forEach(r=>{const qty=Math.abs(n(r.qty)||0),px=n(r.price); if(qty>0&&px!=null){q+=qty;v+=qty*px;}}); return q>0?v/q:null; }
  function positionContext(entries){ const boxes=boxRows(); let totalSize=0,avgEntry=null,side="NONE"; if(boxes.length){ totalSize=boxes.reduce((a,b)=>a+Math.abs(n(b.qty)||0),0); avgEntry=weightedAvg(boxes.map(b=>({qty:Math.abs(n(b.qty)||0),price:n(b.price)}))); const sides=Array.from(new Set(boxes.map(sideOfBox).filter(x=>x&&x!=="-"))); side=sides.length===1?sides[0]:sides.length?"MIXED":"NONE"; }else if(entries.length){ totalSize=entries.reduce((a,e)=>a+Math.abs(n(e.qty)||0),0); avgEntry=weightedAvg(entries); const sides=Array.from(new Set(entries.map(e=>e.side||"").filter(Boolean))); side=sides.length===1?sides[0]:sides.length?"MIXED":"NONE"; } if(!(totalSize>0)) side="NONE"; return {boxes,totalSize,avgEntry,side}; }
  function stopPrice(o){ for(const v of [o&&o.stopPrice,o&&o.triggerPrice,o&&o.activatePrice,o&&o.price]){ const x=n(v); if(x!=null&&x>0) return x; } return null; }
  function activeSL(pos,current){ const sym=currentSymbol(); const opp=pos.side==="SHORT"?"BUY":"SELL"; let list=[]; try{ const pool=[].concat(window.v13OpenOrders21||[],window.v13OpenAlgoOrders21||[]); list=pool.filter(o=>o&&String(o.symbol||"")===sym).filter(o=>{ const st=String(o.status||o.orderStatus||"NEW").toUpperCase(); return !st||st==="NEW"||st==="PENDING"||st==="ACCEPTED"||st.includes("NEW"); }).filter(o=>{ const ps=String(o.positionSide||"").toUpperCase(); return !ps||ps==="BOTH"||ps===pos.side; }).filter(o=>String(o.side||"").toUpperCase()===opp).filter(o=>{ const types=[o&&o.type,o&&o.origType,o&&o.orderType,o&&o.algoType].map(x=>String(x||"").toUpperCase()).join(" "); return types.includes("STOP")&&!types.includes("TAKE_PROFIT")&&!types.includes("TRAILING"); }).map(o=>({price:stopPrice(o)})).filter(x=>x.price!=null); }catch(_e){list=[];} if(!list.length) return null; const directional=current==null?[]:list.filter(x=>pos.side==="LONG"?x.price<current:x.price>current); const pool=directional.length?directional:list; pool.sort((a,b)=>pos.side==="LONG"?b.price-a.price:a.price-b.price); return pool[0].price; }
  function indicatorLines(){ const out=[]; try{ if(Array.isArray(ema20)&&ema20.length) out.push("EMA1: "+fmtPrice(ema20[ema20.length-1].value)); }catch(_e){} try{ if(Array.isArray(ema50)&&ema50.length) out.push("EMA2: "+fmtPrice(ema50[ema50.length-1].value)); }catch(_e){} try{ if(Array.isArray(ema3)&&ema3.length) out.push("EMA3: "+fmtPrice(ema3[ema3.length-1].value)); }catch(_e){} try{ if(Array.isArray(vwap)&&vwap.length) out.push("VWAP: "+fmtPrice(vwap[vwap.length-1].value)); }catch(_e){} return out; }
  function failureReport(market){ const lines=["Some Assess datasets are missing or failed.","","Missing datasets:"]; if(market.missing&&market.missing.length) market.missing.forEach(x=>lines.push("- "+x)); else lines.push("- none"); lines.push("","Details:"); Object.keys(market.tfs||{}).forEach(key=>{const b=market.tfs[key]; if(b&&b.errors&&b.errors.length) lines.push("- "+key+": "+b.errors.join(" | "));}); return lines.join("\n"); }

  function buildDataPacket(market,useFallback){ const symbol=currentSymbol(); const appPrice=appCurrentPrice(); const latestFetched=market.tfs["1M"]&&market.tfs["1M"].klines&&market.tfs["1M"].klines.length?market.tfs["1M"].klines[market.tfs["1M"].klines.length-1].close:null; const entries=openEntries(); const pos=positionContext(entries); const sl=activeSL(pos,appPrice); const asset=quoteAsset(); const lines=[]; const add=s=>lines.push(s); add("PRIVATE POSITION CONTEXT INCLUDED. REVIEW BEFORE SHARING."); add("Patch: "+MODULE); add("Generated Dubai/local time: "+localTime(Date.now())); add(""); add("FIXED ASSESSMENT RULES"); add("- Use the currently selected app instrument in the report header: "+symbol+" — POSITION / MARKET ASSESSMENT"); add("- 3M and 1M are MICROSTRUCTURE / EARLY WARNING ONLY."); add("- 3M and 1M may flag immediate exit/reduce warnings, momentum exhaustion, micro sweep, failed continuation, acceptance/failure/rejection/continuation weakness."); add("- 3M and 1M must not override 15M / 1H structure unless they confirm failure or acceptance."); add("- Prioritize the existing open position first. Exit/reduce risk comes before add/no-add calls."); add("- Treat missing datasets as unavailable. Do not infer missing data."); add(""); if(market.missing&&market.missing.length){ add("WARNING: PARTIAL DATA PACKAGE"); market.missing.forEach(x=>add("- Missing: "+x)); add(""); } add("POSITION CONTEXT"); add("- Symbol: "+symbol); add("- Current price / app live: "+fmtPrice(appPrice)); add("- Latest fetched close: "+fmtPrice(latestFetched)); add("- Position side: "+pos.side); add("- Total size: "+fmtQty(pos.totalSize)+" "+asset); add("- Average entry: "+fmtPrice(pos.avgEntry)); add("- Active SL: "+(sl==null?"NO SL":fmtPrice(sl))); add("- SL source: existing app order state including normal open orders and conditional/algo orders if loaded"); add(""); add("OPEN ENTRIES"); add("- Source: existing reconstructed app state only; no new userTrades/accounting rebuild."); if(entries.length) entries.forEach(e=>add("- #"+e.sequence+" | level "+fmtPrice(e.price)+" | lot "+fmtQty(e.qty)+" "+asset+" | time "+fmtTime(e.time))); else add("- unavailable / none detected"); add(""); add("ACTIVE LEVELS — A. EXISTING / LIVE"); add("- Current price: "+fmtPrice(appPrice)); add("- Average entry: "+fmtPrice(pos.avgEntry)); add("- Active SL: "+(sl==null?"NO SL":fmtPrice(sl))); entries.forEach(e=>add("- Entry #"+e.sequence+": "+fmtPrice(e.price))); try{ if(dailyState){ add("- Day open: "+fmtPrice(dailyState.open)); add("- Day high: "+fmtPrice(dailyState.high)); add("- Day low: "+fmtPrice(dailyState.low)); } }catch(_e){} indicatorLines().forEach(x=>add("- "+x)); add(""); add("ACTIVE LEVELS — B/C. DERIVED STRUCTURE + VOLUME/PARTICIPATION"); Object.keys(market.tfs).forEach(key=>{ const b=market.tfs[key]; const sum=summarizeTF(b,appPrice||latestFetched||0); if(!sum){add("- "+key+": unavailable");return;} add("- "+key+" | role "+b.plan.role+" | range "+fmtPrice(sum.low)+"-"+fmtPrice(sum.high)+" | close position "+fmtPct(sum.pos)+" | swings "+sum.hhll+" | nearest support "+(sum.below?fmtPrice(sum.below.price):"-")+" | nearest resistance "+(sum.above?fmtPrice(sum.above.price):"-")+" | sweep/failure "+sum.sweep+" | compression "+sum.compression+" | taker buy ratio "+fmtPct(sum.takerRatio)+" | latest vol/avg "+(sum.avgVol?fmtNum((sum.latestVol||0)/sum.avgVol)+"x":"-")+" | OI change "+sum.oiContext); }); add(""); add("MULTI-TF MARKET DATA"); TF_PLAN.forEach(tf=>{ const b=market.tfs[tf.key]; const arr=b&&b.klines?b.klines:[]; const sum=summarizeTF(b,appPrice||latestFetched||0); add(""); add(tf.key+" — "+tf.role); if(!arr.length){add("- DATA MISSING");return;} add("- Fetched candles: "+arr.length); add("- Full-window high/low: "+fmtPrice(sum.low)+" / "+fmtPrice(sum.high)); add("- Latest close: "+fmtPrice(sum.latest.close)); add("- Current position in range: "+fmtPct(sum.pos)); add("- Recent swing high: "+(sum.recentHigh?fmtPrice(sum.recentHigh.price)+" @ "+fmtTime(sum.recentHigh.time):"-")); add("- Recent swing low: "+(sum.recentLow?fmtPrice(sum.recentLow.price)+" @ "+fmtTime(sum.recentLow.time):"-")); add("- Range high/low: "+fmtPrice(sum.rangeHigh)+" / "+fmtPrice(sum.rangeLow)); add("- Mark latest close: "+(sum.markLatest?fmtPrice(sum.markLatest.close):"unavailable")); add("- OI context: "+sum.oiContext); add("Raw candles: time,open,high,low,close,volume,quoteVolume,trades,takerBuyBase,takerBuyQuote"); const rawCount=useFallback?tf.fallbackRaw:tf.raw; arr.slice(-rawCount).forEach(c=>add([fmtTime(c.openTime),fmtRawPrice(c.open),fmtRawPrice(c.high),fmtRawPrice(c.low),fmtRawPrice(c.close),fmtNum(c.volume),fmtNum(c.quoteVolume),c.tradeCount==null?"-":String(c.tradeCount),fmtNum(c.takerBuyBase),fmtNum(c.takerBuyQuote)].join(","))); }); return lines.join("\n"); }
  function buildFullPackage(market,useFallback){ const symbol=currentSymbol(); const prompt=activePrompt().replaceAll("[SYMBOL]",symbol); const packet=buildDataPacket(market,useFallback); return prompt.trim()+"\n\n--- DATA PACKET ---\n"+packet; }
  async function onAssessClick(){ setBusy(true); try{ let market=await loadMarketData(TIMEOUT_MS); while(market.missing&&market.missing.length){ const choice=await showWarningModal(failureReport(market)); if(choice==="cancel") return; if(choice==="proceed") break; if(choice==="retry"||choice==="wait") market=await loadMarketData(TIMEOUT_MS); } let text=buildFullPackage(market,false); if(text.length>PACKET_FULL_LIMIT) text=buildFullPackage(market,true); try{ await copyText(text); showToast("Assessment package copied"); }catch(_e){ showPackageModal(text); } }catch(e){ showPackageModal("ASSESS FAILED\n\n"+(e&&e.stack?e.stack:String(e))); }finally{ setBusy(false); } }

  function installSoon(){ try{installButton(); installAssessSettingsTab();}catch(e){try{console.error("Assess install failed",e);}catch(_e){}} }
  const prevOpenSettings=(typeof openSettings==="function")?openSettings:null;
  if(prevOpenSettings&&!window.__AssessModuleOpenSettingsWrapped29R1){ window.__AssessModuleOpenSettingsWrapped29R1=true; openSettings=function(){ const r=prevOpenSettings.apply(this,arguments); setTimeout(installAssessSettingsTab,0); setTimeout(installAssessSettingsTab,120); return r; }; }
  window.AssessClipboardModule={version:MODULE,install:installSoon,buildDefaultPrompt:()=>DEFAULT_PROMPT,buildPackagePreview:async()=>buildFullPackage(await loadMarketData(TIMEOUT_MS),false)};
  installSoon();
  setTimeout(installSoon,0);
  setTimeout(installSoon,300);
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",installSoon,{once:true});
  window.addEventListener("load",()=>setTimeout(installSoon,0),{once:true});
})();

(() => {
  'use strict';
  const MODULE='V13_UI_V2_PATCH_32_REPORT_MA_UI_REBUILD_R1';
  const $id=id=>document.getElementById(id);
  const STORE='btc_futures_chart_v13_32r1_';
  const K=name=>STORE+name;
  const defaults={
    ma4Period:'200', ma5Period:'9',
    ma4Color:'#ef4444', ma5Color:'#111827',
    ma4Alpha:'100', ma5Alpha:'100',
    ma4Width:'2', ma5Width:'2'
  };
  let ema4=[], ema5=[];
  window.ema4=ema4; window.ema5=ema5;

  function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
  function ls(key){ const v=localStorage.getItem(K(key)); return v==null?defaults[key]:v; }
  function setLS(key,val){ localStorage.setItem(K(key),String(val)); }
  function period(num){ const x=n(ls('ma'+num+'Period')); return x&&x>0?Math.round(x):Number(defaults['ma'+num+'Period']); }
  function fmtPrice(v){ const x=n(v); return x==null?'-':Math.round(x).toLocaleString('en-US'); }
  function rgba(hex,alphaPct){
    const a=Math.max(0,Math.min(100,n(alphaPct)??100))/100;
    const clean=String(hex||'#000000').replace('#','');
    const full=(clean.length===3?clean.split('').map(c=>c+c).join(''):clean).padEnd(6,'0').slice(0,6);
    const r=parseInt(full.slice(0,2),16)||0, g=parseInt(full.slice(2,4),16)||0, b=parseInt(full.slice(4,6),16)||0;
    return `rgba(${r},${g},${b},${a})`;
  }
  function widthFor(num){ const x=n(ls('ma'+num+'Width')); return x&&x>0?Math.max(1,Math.min(10,x)):2; }
  function maLabel(num){ return 'EMA'+period(num); }
  function maToggle(num){ return $id('tglEMA'+num); }
  function maEnabled(num){ const el=maToggle(num); return !!(el&&el.checked); }
  function valAt(arr,t){ if(!Array.isArray(arr)) return null; for(let i=arr.length-1;i>=0;i--){ if(Number(arr[i].time)<=Number(t)) return arr[i].value; } return null; }

  function installReportOptions(){
    const sel=$id('reportWeeks'); if(!sel) return;
    const specs=[['yesterday','Yesterday'],['today','Today'],['1w','1W'],['2w','2W'],['3w','3W'],['1mth','1M'],['custom','Custom']];
    const saved=localStorage.getItem(K('reportPeriod'));
    const current=(sel.value&&specs.some(x=>x[0]===sel.value)&&sel.value!=='1d')?sel.value:(saved||'yesterday');
    sel.innerHTML='';
    specs.forEach(([v,t])=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; sel.appendChild(o); });
    sel.value=specs.some(x=>x[0]===current)?current:'yesterday';
    localStorage.setItem(K('reportPeriod'),sel.value);
  }
  function startOfLocalDay(d=new Date()){ return new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0).getTime(); }
  function parseDateValue(v,end=false){
    const s=String(v||'').trim(); let d=null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ const [y,m,day]=s.split('-').map(Number); d=new Date(y,m-1,day,end?23:0,end?59:0,end?59:0,end?999:0); }
    else { const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); if(m){ let y=Number(m[3]); if(y<100)y+=2000; d=new Date(y,Number(m[2])-1,Number(m[1]),end?23:0,end?59:0,end?59:0,end?999:0); } }
    return d&&!Number.isNaN(d.getTime())?d.getTime():null;
  }
  function msToInput(ms){ const d=new Date(ms); const pad=x=>String(x).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function installDatePickers(){
    const from=$id('customFrom'), to=$id('customTo');
    [from,to].forEach(el=>{ if(!el) return; el.type='date'; el.placeholder='yyyy-mm-dd'; });
    const sf=localStorage.getItem(K('customFrom')), st=localStorage.getItem(K('customTo'));
    if(from&&sf&&!from.value) from.value=sf;
    if(to&&st&&!to.value) to.value=st;
    if(from&&!from.__v32r1Saved){ from.__v32r1Saved=true; from.addEventListener('change',()=>{localStorage.setItem(K('customFrom'),from.value);},true); }
    if(to&&!to.__v32r1Saved){ to.__v32r1Saved=true; to.addEventListener('change',()=>{localStorage.setItem(K('customTo'),to.value);},true); }
  }
  function installReportHandlers(){
    if(reportWeeksEl&&!reportWeeksEl.__v32r1Bound){
      reportWeeksEl.__v32r1Bound=true;
      reportWeeksEl.addEventListener('change',()=>{
        localStorage.setItem(K('reportPeriod'),reportWeeksEl.value);
        installDatePickers();
        try{ if(typeof updateReportControls==='function') updateReportControls(); }catch(_e){}
      },true);
    }
  }

  selectedReportPresetMs=function(){
    switch(reportWeeksEl.value){
      case '2w': return 2*WEEK_MS;
      case '3w': return 3*WEEK_MS;
      case '1mth': return 30*24*60*60*1000;
      case 'today': return Math.max(1,Date.now()-startOfLocalDay(new Date()));
      case 'yesterday': return 24*60*60*1000;
      case '1w': default: return WEEK_MS;
    }
  };
  customReportRangeMs=function(){
    const from=$id('customFrom'), to=$id('customTo');
    const start=parseDateValue(from?from.value:'',false), end=parseDateValue(to?to.value:'',true);
    if(start==null||end==null||end<=start) return null;
    localStorage.setItem(K('customFrom'),msToInput(start));
    localStorage.setItem(K('customTo'),msToInput(end));
    return {start,end};
  };
  reportRangeMs=function(){
    const now=Date.now(), today0=startOfLocalDay(new Date());
    if(reportWeeksEl.value==='today') return {start:today0,end:now};
    if(reportWeeksEl.value==='yesterday') return {start:today0-24*60*60*1000,end:today0-1};
    if(reportWeeksEl.value==='custom'){ const c=customReportRangeMs(); if(c) return c; }
    return {start:now-selectedReportPresetMs(),end:now};
  };
  reportLabel=function(){
    switch(reportWeeksEl.value){
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case '2w': return '2W';
      case '3w': return '3W';
      case '1mth': return '1M';
      case 'custom': return customReportRangeMs()?'Custom':'Custom*';
      case '1w': default: return '1W';
    }
  };
  weeks=function(){ switch(reportWeeksEl.value){ case '2w': return 2; case '3w': return 3; case '1mth': return 4; case 'today': case 'yesterday': default: return 1; } };
  const prevFilter=typeof filterReconstructionForReport==='function'?filterReconstructionForReport:null;
  if(prevFilter&&!window.__v32r1FilterWrapped){
    window.__v32r1FilterWrapped=true;
    filterReconstructionForReport=function(rec){
      if(!reportWeeksEl||!['today','yesterday'].includes(reportWeeksEl.value)) return prevFilter.apply(this,arguments);
      const win=reportWindowSec(); const firstByChain=new Map();
      (rec.markers||[]).filter(m=>m.role==='entry').forEach(m=>{ const id=m.chainId||m.tradeChainId||m.parentTradeId||m.id; const t=Number(m.time)||0; if(!firstByChain.has(id)||t<firstByChain.get(id)) firstByChain.set(id,t); });
      const allowed=new Set([...firstByChain.entries()].filter(([,t])=>t>=win.start&&t<=win.end).map(([id])=>id));
      const keepM=new Set(), keepL=new Set();
      (rec.markers||[]).forEach(m=>{ const id=m.chainId||m.tradeChainId||m.parentTradeId||m.id; if(allowed.has(id)) keepM.add(m.id); });
      (rec.links||[]).forEach(l=>{ const id=l.chainId||l.tradeChainId||l.parentTradeId; if(allowed.has(id)){ keepL.add(l.id); keepM.add(l.entryMarkerId); keepM.add(l.exitMarkerId); } });
      return {...rec, markers:(rec.markers||[]).filter(m=>keepM.has(m.id)), links:(rec.links||[]).filter(l=>keepL.has(l.id)), openConnectors:(rec.openConnectors||[]).filter(l=>keepM.has(l.entryMarkerId)), unresolved:(rec.markers||[]).filter(m=>keepM.has(m.id)&&m.unresolved).length};
    };
  }

  function installToggle(num,beforeEl){
    if($id('tglEMA'+num)) return;
    const label=document.createElement('label'); label.className='toggle';
    label.innerHTML=`<input id="tglEMA${num}" type="checkbox"/><span id="lblEMA${num}">${maLabel(num)}</span>`;
    const box=document.querySelector('.indicator-toggles'); if(!box) return;
    box.insertBefore(label,beforeEl||null);
    const el=$id('tglEMA'+num); if(el) el.addEventListener('change',()=>{try{draw();}catch(_e){}},false);
  }
  function installMAToggles(){
    const vw=$id('tglVWAP')&&$id('tglVWAP').closest('label');
    installToggle(4,vw); installToggle(5,vw); updateMALabels();
  }
  function maRow(num){
    return `<div>MA ${num}</div><input id="v32r1MA${num}Period" type="number" min="1" max="999" step="1" value="${ls('ma'+num+'Period')}"><input id="v32r1MA${num}Color" type="color" value="${ls('ma'+num+'Color')}"><input id="v32r1MA${num}Alpha" type="range" min="0" max="100" step="1" value="${ls('ma'+num+'Alpha')}"><input id="v32r1MA${num}Width" type="number" min="1" max="10" step="0.5" value="${ls('ma'+num+'Width')}">`;
  }
  function bindMA(num){
    ['Period','Color','Alpha','Width'].forEach(k=>{ const el=$id('v32r1MA'+num+k); if(!el||el.__v32r1Bound) return; el.__v32r1Bound=true; const f=()=>{setLS('ma'+num+k,el.value); updateMALabels(); calcExtraMAs(); try{draw();}catch(_e){}}; el.addEventListener('input',f,false); el.addEventListener('change',f,false); });
  }
  function updateMALabels(){ [4,5].forEach(num=>{ const l=$id('lblEMA'+num); if(l) l.textContent=maLabel(num); }); }
  function installMASettings(){
    installMAToggles();
    const card=$id('patch8IndicatorCard') || [...document.querySelectorAll('#settingsModal .settings-card')].find(c=>/EMA|Indicator/i.test(c.textContent||''));
    if(!card) return;
    let wrap=$id('v32r1MASettings');
    if(!wrap){ wrap=document.createElement('div'); wrap.id='v32r1MASettings'; card.appendChild(wrap); }
    wrap.innerHTML=`<div class="v32r1-ma-grid"><div class="head">MA</div><div class="head">Period</div><div class="head">Color</div><div class="head">Transp.</div><div class="head">Thick.</div>${maRow(4)}${maRow(5)}</div><div class="v32r1-note">MA4 and MA5 are fully independent. Values appear in the candle info block only when toggled ON.</div>`;
    bindMA(4); bindMA(5);
  }
  function calcExtraMAs(){
    try{ ema4=typeof EMA==='function'?EMA(candles,period(4)):[]; ema5=typeof EMA==='function'?EMA(candles,period(5)):[]; window.ema4=ema4; window.ema5=ema5; }catch(_e){ ema4=[]; ema5=[]; }
  }
  const prevIndicators=typeof indicators==='function'?indicators:null;
  if(prevIndicators&&!window.__v32r1IndicatorsWrapped){ window.__v32r1IndicatorsWrapped=true; indicators=function(){ const r=prevIndicators.apply(this,arguments); calcExtraMAs(); return r; }; }
  function drawExtraMAs(){
    if(!canvas||!ctx||!Array.isArray(candles)||candles.length<2) return;
    const r=range(); const vis=candles.slice(r.start,r.end); if(vis.length<2) return;
    const w=canvas.clientWidth,h=canvas.clientHeight,left=LEFT_PAD,right=RIGHT_AXIS,top=18,bottom=42,gap=20;
    const usable=Math.max(120,h-top-bottom-gap), volFrac=Math.max(.10,Math.min(.45,window.__p10VolumeFrac||.22));
    const volH=Math.max(38,Math.floor(usable*volFrac)), priceH=Math.max(120,usable-volH), chartW=w-left-right;
    const minP=lastYMin,maxP=lastYMax; if(!(maxP>minP)) return;
    const total=Math.max(2,vis.length+(r.futureBars||0)), slot=chartW/total;
    const im=idxMap(vis), mapX=i=>left+i*slot+slot/2, mapY=p=>top+((maxP-p)/(maxP-minP))*priceH;
    ctx.save(); ctx.beginPath(); ctx.rect(left,top,chartW,priceH); ctx.clip();
    if(maEnabled(4)){ window.__patch18LastIndicatorKey=null; drawInd(ema4,vis,im,mapX,mapY,rgba(ls('ma4Color'),ls('ma4Alpha')),widthFor(4)); }
    if(maEnabled(5)){ window.__patch18LastIndicatorKey=null; drawInd(ema5,vis,im,mapX,mapY,rgba(ls('ma5Color'),ls('ma5Alpha')),widthFor(5)); }
    ctx.restore();
  }
  const prevDraw=typeof draw==='function'?draw:null;
  if(prevDraw&&!window.__v32r1DrawWrapped){ window.__v32r1DrawWrapped=true; draw=function(){ const r=prevDraw.apply(this,arguments); try{drawExtraMAs();}catch(_e){} return r; }; }

  const prevAutoY=typeof autoYRange==='function'?autoYRange:null;
  if(prevAutoY&&!window.__v32r1AutoYWrapped){ window.__v32r1AutoYWrapped=true; autoYRange=function(vis){
    return candleOnlyYRange(vis);
  }; }

  const prevCandleTip=typeof candleTip==='function'?candleTip:null;
  if(prevCandleTip&&!window.__v32r1CandleTipWrapped){ window.__v32r1CandleTipWrapped=true; candleTip=function(c){
    const lines=[formatDateTime(c.time*1000),'O : '+ip(c.open),'H : '+ip(c.high),'L : '+ip(c.low),'C : '+ip(c.close),'V : '+fv(c.volume)];
    const maTipState = window.__maisoTooltipToggleState || null;
    const showMA4 = maTipState && typeof maTipState[4] === 'boolean' ? maTipState[4] : maEnabled(4);
    const showMA5 = maTipState && typeof maTipState[5] === 'boolean' ? maTipState[5] : maEnabled(5);
    try{ if(tglEMA20&&tglEMA20.checked) lines.push((lblEMA20?lblEMA20.textContent:'EMA1')+' : '+fmtPrice(valAt(ema20,c.time))); }catch(_e){}
    try{ if(tglEMA50&&tglEMA50.checked) lines.push((lblEMA50?lblEMA50.textContent:'EMA2')+' : '+fmtPrice(valAt(ema50,c.time))); }catch(_e){}
    try{ if(tglEMA3&&tglEMA3.checked) lines.push((lblEMA3?lblEMA3.textContent:'EMA3')+' : '+fmtPrice(valAt(ema3,c.time))); }catch(_e){}
    try{ if(showMA4) lines.push(maLabel(4)+' : '+fmtPrice(valAt(ema4,c.time))); }catch(_e){}
    try{ if(showMA5) lines.push(maLabel(5)+' : '+fmtPrice(valAt(ema5,c.time))); }catch(_e){}
    ctx.save(); ctx.font='11px Arial'; const pad=7,lh=14; const tw=Math.max(...lines.map(s=>ctx.measureText(s).width))+pad*2, th=lines.length*lh+pad*2; const x=Math.max(8,canvas.clientWidth-RIGHT_AXIS-tw-12), y=8;
    ctx.fillStyle='rgba(255,255,255,.96)'; ctx.strokeStyle='#d9dce1'; ctx.fillRect(x,y,tw,th); ctx.strokeRect(x,y,tw,th); ctx.fillStyle='#1e2329'; ctx.textAlign='left'; ctx.textBaseline='top'; lines.forEach((s,i)=>ctx.fillText(s,x+pad,y+pad+i*lh)); ctx.restore();
  }; }

  function installStrictIsolateClickGuard(){
    if(!canvas||canvas.__v32r1IsoGuard) return;
    canvas.__v32r1IsoGuard=true;
    canvas.addEventListener('click',e=>{
      const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
      let direct=false;
      for(const it of overlayHitItems||[]){
        if(!it) continue;
        if(it.kind==='plbox' && x >= it.x1-4 && x <= it.x2+4 && y >= it.y1-4 && y <= it.y2+4){ direct=true; break; }
        if(it.kind==='marker' && it.markerId){
          const rad=Math.max(6,Number(it.radius)||8);
          if(Math.hypot(x-it.x,y-it.y)<=rad+2){ direct=true; break; }
        }
      }
      if(!direct){ e.stopImmediatePropagation(); }
    },true);
  }


  function installSsscSettingsPlaceholder(){
    const grid=document.querySelector('#settingsModal .settings-grid'); if(!grid) return;
    const oldCard=document.getElementById('ssscSettingsPlaceholderCard'); if(oldCard) oldCard.remove();
    const tabs=grid.querySelector(':scope > .v24-settings-tabs'); const panelsRoot=grid.querySelector(':scope > .v24-settings-panels');
    if(!tabs||!panelsRoot) return;
    if(!document.getElementById('ssscSettingsTab')){ const btn=document.createElement('button'); btn.type='button'; btn.id='ssscSettingsTab'; btn.className='v24-settings-tab'; btn.dataset.tab='sssc'; btn.textContent='SSSC'; tabs.appendChild(btn); btn.addEventListener('click',()=>setSsscTabActive()); }
    if(!document.getElementById('ssscSettingsPanel')){ const panel=document.createElement('div'); panel.id='ssscSettingsPanel'; panel.className='v24-settings-panel'; panel.dataset.tab='sssc'; const inner=document.createElement('div'); inner.className='v24-settings-panel-grid'; inner.innerHTML='<div class="settings-card"><div class="settings-card-title">SSSC</div><div class="settings-card-desc">SSSC dashboard settings placeholder. Controls will be added in a later pass.</div></div>'; panel.appendChild(inner); panelsRoot.appendChild(panel); }
  }
  function setSsscTabActive(){ const root=document.querySelector('#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid'); if(!root) return; root.querySelectorAll('.v24-settings-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='sssc')); root.querySelectorAll('.v24-settings-panel').forEach(p=>p.classList.toggle('active',p.dataset.tab==='sssc')); try{localStorage.setItem('btc_futures_chart_v13_24_settings_tab','sssc');}catch(_e){} }
  function install(){
    installReportOptions(); installDatePickers(); installReportHandlers(); installMAToggles(); installMASettings(); calcExtraMAs(); installStrictIsolateClickGuard();
    try{ if(typeof updateReportControls==='function') updateReportControls(); }catch(_e){}
    try{ draw(); }catch(_e){}
  }
  const prevOpenSettings=typeof openSettings==='function'?openSettings:null;
  if(prevOpenSettings&&!window.__v32r1OpenSettingsWrapped){ window.__v32r1OpenSettingsWrapped=true; openSettings=function(){ const r=prevOpenSettings.apply(this,arguments); setTimeout(installMASettings,0); setTimeout(installMASettings,150); setTimeout(installMASettings,450); return r; }; }
  install(); setTimeout(install,0); setTimeout(install,300); setTimeout(install,900); window.addEventListener('load',()=>setTimeout(install,0),{once:true});
  window.Patch32ReportMaUiRebuildR1={version:MODULE,install};
})();

(() => {
  'use strict';
  const MODULE='V13_UI_V2_PATCH_32_REPORT_MA_UI_REBUILD_R2';
  const $id=id=>document.getElementById(id);
  const STORE='btc_futures_chart_v13_32r1_';
  const K=name=>STORE+name;
  const DEF={ma4Period:'100',ma5Period:'200',ma4Color:'#0b7a00',ma5Color:'#008c7a',ma4Alpha:'100',ma5Alpha:'100',ma4Width:'2',ma5Width:'2'};
  const OLDKEY='btc_futures_chart_v13_18_';
  function n(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
  function get(key,def){ const v=localStorage.getItem(K(key)); return v==null?(def??DEF[key]??''):v; }
  function set(key,val){ localStorage.setItem(K(key),String(val)); }
  function oldWidth(k){ return localStorage.getItem(OLDKEY+k+'_width') || '2'; }
  function oldStyle(k,suf,def){ return localStorage.getItem('btc_futures_chart_v13_05_'+k+'_'+suf) || def; }
  function fmt(v){ const x=n(v); return x==null?'-':Math.round(x).toLocaleString('en-US'); }
  function period(num){ const x=n(get('ma'+num+'Period')); return x&&x>0?Math.round(x):Number(DEF['ma'+num+'Period']); }
  function label(num){ return 'EMA'+period(num); }
  function maEnabled(num){ const el=$id('tglEMA'+num); return !!(el&&el.checked); }
  function hexToRgba(hex,alphaPct){
    const a=Math.max(0,Math.min(100,n(alphaPct)??100))/100;
    const clean=String(hex||'#000000').replace('#','');
    const full=(clean.length===3?clean.split('').map(c=>c+c).join(''):clean).padEnd(6,'0').slice(0,6);
    return `rgba(${parseInt(full.slice(0,2),16)||0},${parseInt(full.slice(2,4),16)||0},${parseInt(full.slice(4,6),16)||0},${a})`;
  }
  function width(num){ const x=n(get('ma'+num+'Width')); return x&&x>0?Math.max(1,Math.min(10,x)):2; }
  function valAt(arr,t){ if(!Array.isArray(arr)) return null; for(let i=arr.length-1;i>=0;i--){ if(Number(arr[i].time)<=Number(t)) return arr[i].value; } return null; }
  function ensureToggles(){
    const box=document.querySelector('.indicator-toggles'); if(!box) return;
    const before=$id('tglVWAP')&&$id('tglVWAP').closest('label');
    [4,5].forEach(num=>{
      if(!$id('tglEMA'+num)){
        const lab=document.createElement('label'); lab.className='toggle';
        lab.innerHTML=`<input id="tglEMA${num}" type="checkbox"/><span id="lblEMA${num}">${label(num)}</span>`;
        box.insertBefore(lab,before||null);
      }
      const el=$id('tglEMA'+num); if(el&&!el.__v32r2Bound){ el.__v32r2Bound=true; el.addEventListener('change',()=>{try{draw();}catch(_e){}},false); }
    });
    updateLabels();
  }
  function updateLabels(){ [4,5].forEach(num=>{ const l=$id('lblEMA'+num); if(l) l.textContent=label(num); }); }
  function row(name,periodId,colorId,alphaId,widthId,values){
    const periodHtml = periodId ? `<input id="${periodId}" type="number" min="1" max="999" step="1" value="${values.period}">` : `<span style="color:var(--muted)">—</span>`;
    return `<div>${name}</div><div>${periodHtml}</div><input id="${colorId}" type="color" value="${values.color}"><input id="${alphaId}" type="range" min="0" max="100" step="1" value="${values.alpha}"><input id="${widthId}" type="range" min="1" max="10" step="0.5" value="${values.width}" title="Thickness">`;
  }
  function rebuildIndicatorSettings(){
    const card=$id('patch8IndicatorCard'); if(!card) return;
    const orphan=$id('v32r1MASettings'); if(orphan) orphan.remove();
    const desc=card.querySelector('.settings-card-desc'); if(desc) desc.textContent='Set period, color, transparency, and thickness in one row per indicator.';
    let grid=card.querySelector('.patch8-indicator-grid');
    if(!grid){ grid=document.createElement('div'); grid.className='patch8-indicator-grid'; card.appendChild(grid); }
    grid.classList.add('v32r2-full-ma-grid');
    grid.innerHTML=`
      <div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div><div class="patch8-head">Thickness</div>
      ${row('EMA 1','patch8Ema1Period','patch8Ema1Color','patch8Ema1Alpha','patch18Ema1Width',{period:($id('emaPeriod1')&&$id('emaPeriod1').value)||'9',color:oldStyle('ema1','color','#ff7900'),alpha:oldStyle('ema1','alpha','100'),width:oldWidth('ema1')})}
      ${row('EMA 2','patch8Ema2Period','patch8Ema2Color','patch8Ema2Alpha','patch18Ema2Width',{period:($id('emaPeriod2')&&$id('emaPeriod2').value)||'21',color:oldStyle('ema2','color','#0000ff'),alpha:oldStyle('ema2','alpha','100'),width:oldWidth('ema2')})}
      ${row('EMA 3','patch8Ema3Period','patch8Ema3Color','patch8Ema3Alpha','patch18Ema3Width',{period:($id('emaPeriod3')&&$id('emaPeriod3').value)||'55',color:oldStyle('ema3','color','#d600a9'),alpha:oldStyle('ema3','alpha','100'),width:oldWidth('ema3')})}
      ${row('EMA 4','v32r2MA4Period','v32r2MA4Color','v32r2MA4Alpha','v32r2MA4Width',{period:get('ma4Period','100'),color:get('ma4Color','#0b7a00'),alpha:get('ma4Alpha','100'),width:get('ma4Width','2')})}
      ${row('EMA 5','v32r2MA5Period','v32r2MA5Color','v32r2MA5Alpha','v32r2MA5Width',{period:get('ma5Period','200'),color:get('ma5Color','#008c7a'),alpha:get('ma5Alpha','100'),width:get('ma5Width','2')})}
      ${row('VWAP',null,'patch8VWAPColor','patch8VWAPAlpha','patch18VWAPWidth',{period:'',color:oldStyle('vwap','color','#6f6658'),alpha:oldStyle('vwap','alpha','100'),width:oldWidth('vwap')})}`;
    bindBaseRows(); bindExtraRows();
  }
  function bindBaseRows(){
    [['patch8Ema1Period','emaPeriod1'],['patch8Ema2Period','emaPeriod2'],['patch8Ema3Period','emaPeriod3']].forEach(([srcId,dstId])=>{
      const src=$id(srcId), dst=$id(dstId); if(!src||!dst||src.__v32r2Bound) return; src.__v32r2Bound=true;
      const f=()=>{ dst.value=src.value; try{saveEmaSettings();}catch(_e){try{indicators();draw();}catch(_e2){}} };
      src.addEventListener('input',f,false); src.addEventListener('change',f,false);
    });
    const styleMap=[['patch8Ema1Color','btc_futures_chart_v13_05_ema1_color'],['patch8Ema1Alpha','btc_futures_chart_v13_05_ema1_alpha'],['patch8Ema2Color','btc_futures_chart_v13_05_ema2_color'],['patch8Ema2Alpha','btc_futures_chart_v13_05_ema2_alpha'],['patch8Ema3Color','btc_futures_chart_v13_05_ema3_color'],['patch8Ema3Alpha','btc_futures_chart_v13_05_ema3_alpha'],['patch8VWAPColor','btc_futures_chart_v13_05_vwap_color'],['patch8VWAPAlpha','btc_futures_chart_v13_05_vwap_alpha']];
    styleMap.forEach(([id,key])=>{ const el=$id(id); if(!el||el.__v32r2Style) return; el.__v32r2Style=true; const f=()=>{localStorage.setItem(key,el.value);try{draw();}catch(_e){}}; el.addEventListener('input',f,false); el.addEventListener('change',f,false); });
    const widthMap=[['patch18Ema1Width','ema1'],['patch18Ema2Width','ema2'],['patch18Ema3Width','ema3'],['patch18VWAPWidth','vwap']];
    widthMap.forEach(([id,k])=>{ const el=$id(id); if(!el||el.__v32r2Width) return; el.__v32r2Width=true; const f=()=>{localStorage.setItem(OLDKEY+k+'_width',String(Math.max(1,Math.min(10,n(el.value)||2))));try{draw();}catch(_e){}}; el.addEventListener('input',f,false); el.addEventListener('change',f,false); });
  }
  function bindExtraRows(){
    [4,5].forEach(num=>{
      [['Period','Period'],['Color','Color'],['Alpha','Alpha'],['Width','Width']].forEach(([field,keySuffix])=>{
        const el=$id(`v32r2MA${num}${field}`); if(!el||el.__v32r2Bound) return; el.__v32r2Bound=true;
        const f=()=>{ set('ma'+num+keySuffix,el.value); updateLabels(); calcExtraMAs(); try{draw();}catch(_e){} };
        el.addEventListener('input',f,false); el.addEventListener('change',f,false);
      });
    });
  }
  let ema4=[], ema5=[]; window.ema4=ema4; window.ema5=ema5;
  function calcExtraMAs(){
    try{ ema4=(typeof EMA==='function')?EMA(candles,period(4)):[]; ema5=(typeof EMA==='function')?EMA(candles,period(5)):[]; window.ema4=ema4; window.ema5=ema5; }catch(_e){ema4=[];ema5=[];}
  }
  if(typeof indicators==='function'&&!window.__v32r2IndicatorsWrapped){ const prev=indicators; window.__v32r2IndicatorsWrapped=true; indicators=function(){ const r=prev.apply(this,arguments); calcExtraMAs(); return r; }; }
  function drawExtraMAs(){
    if(!canvas||!ctx||!Array.isArray(candles)||candles.length<2) return;
    const r=range(); const vis=candles.slice(r.start,r.end); if(vis.length<2) return;
    const w=canvas.clientWidth,h=canvas.clientHeight,left=LEFT_PAD,right=RIGHT_AXIS,top=18,bottom=42,gap=20;
    const usable=Math.max(120,h-top-bottom-gap), volFrac=Math.max(.10,Math.min(.45,window.__p10VolumeFrac||.22));
    const volH=Math.max(38,Math.floor(usable*volFrac)), priceH=Math.max(120,usable-volH), chartW=w-left-right;
    if(!(lastYMax>lastYMin)) return;
    const total=Math.max(2,vis.length+(r.futureBars||0)), slot=chartW/total;
    const im=idxMap(vis), mapX=i=>left+i*slot+slot/2, mapY=p=>top+((lastYMax-p)/(lastYMax-lastYMin))*priceH;
    ctx.save(); ctx.beginPath(); ctx.rect(left,top,chartW,priceH); ctx.clip();
    if(maEnabled(4)){ window.__patch18LastIndicatorKey=null; drawInd(ema4,vis,im,mapX,mapY,hexToRgba(get('ma4Color'),get('ma4Alpha')),width(4)); }
    if(maEnabled(5)){ window.__patch18LastIndicatorKey=null; drawInd(ema5,vis,im,mapX,mapY,hexToRgba(get('ma5Color'),get('ma5Alpha')),width(5)); }
    ctx.restore();
  }
  if(typeof draw==='function'&&!window.__v32r2DrawWrapped){ const prev=draw; window.__v32r2DrawWrapped=true; draw=function(){ const r=prev.apply(this,arguments); try{drawExtraMAs();}catch(_e){} return r; }; }
  if(typeof autoYRange==='function'&&!window.__v32r2AutoYWrapped){ window.__v32r2AutoYWrapped=true; autoYRange=function(vis){
    return candleOnlyYRange(vis);
  }; }
  if(typeof candleTip==='function'&&!window.__v32r2CandleTipWrapped){ window.__v32r2CandleTipWrapped=true; candleTip=function(c){
    const lines=[formatDateTime(c.time*1000),'O : '+ip(c.open),'H : '+ip(c.high),'L : '+ip(c.low),'C : '+ip(c.close),'V : '+fv(c.volume)];
    const maTipState = window.__maisoTooltipToggleState || null;
    const showMA4 = maTipState && typeof maTipState[4] === 'boolean' ? maTipState[4] : maEnabled(4);
    const showMA5 = maTipState && typeof maTipState[5] === 'boolean' ? maTipState[5] : maEnabled(5);
    try{ if(tglEMA20&&tglEMA20.checked) lines.push((lblEMA20?lblEMA20.textContent:'EMA1')+' : '+fmt(valAt(ema20,c.time))); }catch(_e){}
    try{ if(tglEMA50&&tglEMA50.checked) lines.push((lblEMA50?lblEMA50.textContent:'EMA2')+' : '+fmt(valAt(ema50,c.time))); }catch(_e){}
    try{ if(tglEMA3&&tglEMA3.checked) lines.push((lblEMA3?lblEMA3.textContent:'EMA3')+' : '+fmt(valAt(ema3,c.time))); }catch(_e){}
    try{ if(showMA4) lines.push(label(4)+' : '+fmt(valAt(ema4,c.time))); }catch(_e){}
    try{ if(showMA5) lines.push(label(5)+' : '+fmt(valAt(ema5,c.time))); }catch(_e){}
    ctx.save(); ctx.font='11px Arial'; const pad=7,lh=14; const tw=Math.max(...lines.map(s=>ctx.measureText(s).width))+pad*2, th=lines.length*lh+pad*2; const x=Math.max(8,canvas.clientWidth-RIGHT_AXIS-tw-12), y=8;
    ctx.fillStyle='rgba(255,255,255,.96)'; ctx.strokeStyle='#d9dce1'; ctx.fillRect(x,y,tw,th); ctx.strokeRect(x,y,tw,th); ctx.fillStyle='#1e2329'; ctx.textAlign='left'; ctx.textBaseline='top'; lines.forEach((s,i)=>ctx.fillText(s,x+pad,y+pad+i*lh)); ctx.restore();
  }; }
  function openChainIds(rec){ const ids=new Set(); (rec.openConnectors||[]).forEach(l=>{ if(l.chainId) ids.add(l.chainId); if(l.tradeChainId) ids.add(l.tradeChainId); }); (rec.openLots||[]).forEach(l=>{ if(l.chainId) ids.add(l.chainId); if(l.tradeChainId) ids.add(l.tradeChainId); }); return ids; }
  function firstEntryByChain(rec){ const m=new Map(); (rec.markers||[]).forEach(x=>{ if(x.role!=='entry') return; const cid=x.chainId||x.tradeChainId||x.parentTradeId||x.id; const t=Number(x.time)||0; if(!m.has(cid)||t<m.get(cid)) m.set(cid,t); }); return m; }
  if(typeof filterReconstructionForReport==='function'&&!window.__v32r2FilterWrapped){ window.__v32r2FilterWrapped=true; filterReconstructionForReport=function(rec){
    const win=reportWindowSec(); const keepMarkers=new Set(), keepLinks=new Set(); const openIds=openChainIds(rec); const first=firstEntryByChain(rec);
    const allowedChains=new Set(openIds);
    if(reportWeeksEl&&['today','yesterday'].includes(reportWeeksEl.value)){
      first.forEach((t,cid)=>{ if(t>=win.start&&t<=win.end) allowedChains.add(cid); });
    }else{
      (rec.links||[]).forEach(l=>{ if((l.exitTime>=win.start&&l.exitTime<=win.end)||(l.entryTime>=win.start&&l.entryTime<=win.end)){ if(l.chainId) allowedChains.add(l.chainId); if(l.tradeChainId) allowedChains.add(l.tradeChainId); keepLinks.add(l.id); keepMarkers.add(l.entryMarkerId); keepMarkers.add(l.exitMarkerId); } });
      (rec.markers||[]).forEach(m=>{ if(m.time>=win.start&&m.time<=win.end){ keepMarkers.add(m.id); if(m.chainId) allowedChains.add(m.chainId); if(m.tradeChainId) allowedChains.add(m.tradeChainId); } });
    }
    (rec.links||[]).forEach(l=>{ const cid=l.chainId||l.tradeChainId||l.parentTradeId; if(cid&&allowedChains.has(cid)){ keepLinks.add(l.id); keepMarkers.add(l.entryMarkerId); keepMarkers.add(l.exitMarkerId); } });
    (rec.markers||[]).forEach(m=>{ const cid=m.chainId||m.tradeChainId||m.parentTradeId; if((cid&&allowedChains.has(cid))||keepMarkers.has(m.id)) keepMarkers.add(m.id); });
    const openConnectors=(rec.openConnectors||[]).slice(); openConnectors.forEach(l=>keepMarkers.add(l.entryMarkerId));
    return {...rec, markers:(rec.markers||[]).filter(m=>keepMarkers.has(m.id)), links:(rec.links||[]).filter(l=>keepLinks.has(l.id)), openConnectors, unresolved:(rec.markers||[]).filter(m=>keepMarkers.has(m.id)&&m.unresolved).length};
  }; }
  function installIsolateGuard(){
    if(!canvas||canvas.__v32r2IsoGuard) return; canvas.__v32r2IsoGuard=true;
    let down=null;
    function isoTargetAt(e){
      const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top;
      for(const it of overlayHitItems||[]){
        if(!it) continue;
        if(it.kind==='plbox' && x>=it.x1-4 && x<=it.x2+4 && y>=it.y1-4 && y<=it.y2+4) return 'plbox';
        if(it.kind==='marker' && it.markerId){ const rad=Math.max(6,Number(it.radius)||8); if(Math.hypot(x-it.x,y-it.y)<=rad+2) return 'marker:'+it.markerId; }
      }
      return null;
    }
    canvas.addEventListener('mousedown',e=>{down={x:e.clientX,y:e.clientY,target:isoTargetAt(e)};},true);
    canvas.addEventListener('click',e=>{ const moved=down?Math.hypot(e.clientX-down.x,e.clientY-down.y):999; const upTarget=isoTargetAt(e); if(!down||moved>4||!down.target||!upTarget||down.target!==upTarget){ e.stopImmediatePropagation(); e.preventDefault(); } down=null; },true);
  }
  function install(){ ensureToggles(); calcExtraMAs(); rebuildIndicatorSettings(); installIsolateGuard(); try{draw();}catch(_e){} }
  const prevOpenSettings=typeof openSettings==='function'?openSettings:null;
  if(prevOpenSettings&&!window.__v32r2OpenSettingsWrapped){ window.__v32r2OpenSettingsWrapped=true; openSettings=function(){ const r=prevOpenSettings.apply(this,arguments); setTimeout(install,0); setTimeout(rebuildIndicatorSettings,150); return r; }; }
  install(); setTimeout(install,0); setTimeout(install,300); setTimeout(install,900); window.addEventListener('load',()=>setTimeout(install,0),{once:true});
  window.Patch32ReportMaUiRebuildR2={version:MODULE,install};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_33_CLEAN_BASE_MASTACK_FIX_R3";
  const $id = id => document.getElementById(id);
  const num = v => { const x = Number(v); return Number.isFinite(x) ? x : null; };
  const n0 = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const fmtInt = v => { const x = num(v); return x == null ? "-" : Math.round(x).toLocaleString("en-US"); };

  function chainIdOf(o){ return o && (o.parentTradeId || o.chainId || o.tradeChainId || null); }
  function tradeWindow(){ try{ return typeof reportWindowSec === "function" ? reportWindowSec() : {start:0,end:Number.MAX_SAFE_INTEGER}; }catch(_e){ return {start:0,end:Number.MAX_SAFE_INTEGER}; } }

  /* Report/history filtering: closed trades are classified by final EX/close time, not entry time. */
  window.filterReconstructionForReport = filterReconstructionForReport = function(rec){
    rec = rec || {};
    const win = tradeWindow();
    const links = Array.isArray(rec.links) ? rec.links : [];
    const markers = Array.isArray(rec.markers) ? rec.markers : [];
    const openConnectors = Array.isArray(rec.openConnectors) ? rec.openConnectors.slice() : [];
    const openLots = Array.isArray(rec.openLots) ? rec.openLots : [];
    const allowed = new Set();
    const keepMarkers = new Set();
    const keepLinks = new Set();

    function addChain(cid){ if(cid !== null && cid !== undefined && cid !== "") allowed.add(cid); }

    openConnectors.forEach(l => { addChain(chainIdOf(l)); if(l.entryMarkerId) keepMarkers.add(l.entryMarkerId); });
    openLots.forEach(l => { addChain(chainIdOf(l)); if(l.markerId) keepMarkers.add(l.markerId); });

    const markerById = new Map(markers.map(m => [m.id,m]));
    const groupedMarkers = new Map();
    const groupedLinks = new Map();

    markers.forEach(m => {
      const cid = chainIdOf(m);
      if(!cid) return;
      if(!groupedMarkers.has(cid)) groupedMarkers.set(cid,[]);
      groupedMarkers.get(cid).push(m);
    });
    links.forEach(l => {
      const cid = chainIdOf(l) || chainIdOf(markerById.get(l.entryMarkerId)) || chainIdOf(markerById.get(l.exitMarkerId));
      if(!cid) return;
      if(!groupedLinks.has(cid)) groupedLinks.set(cid,[]);
      groupedLinks.get(cid).push(l);
    });

    const allCids = new Set([...groupedMarkers.keys(),...groupedLinks.keys()]);
    allCids.forEach(cid => {
      const ms = (groupedMarkers.get(cid) || []).filter(m => m && m.role === "close" && !m.unresolved);
      const finalCandidates = ms.filter(m => m.isFinalExit || String(m.letter || "").toUpperCase() === "EX");
      const final = (finalCandidates.length ? finalCandidates : ms).slice().sort((a,b) => n0(a.time)-n0(b.time)).slice(-1)[0] || null;
      if(final && n0(final.time) >= win.start && n0(final.time) <= win.end) addChain(cid);
    });

    links.forEach(l => {
      const cid = chainIdOf(l) || chainIdOf(markerById.get(l.entryMarkerId)) || chainIdOf(markerById.get(l.exitMarkerId));
      if(cid && allowed.has(cid)){
        keepLinks.add(l.id);
        if(l.entryMarkerId) keepMarkers.add(l.entryMarkerId);
        if(l.exitMarkerId) keepMarkers.add(l.exitMarkerId);
      }
    });
    markers.forEach(m => { const cid = chainIdOf(m); if((cid && allowed.has(cid)) || keepMarkers.has(m.id)) keepMarkers.add(m.id); });

    const outMarkers = markers.filter(m => keepMarkers.has(m.id));
    const outLinks = links.filter(l => keepLinks.has(l.id));
    return {...rec, markers:outMarkers, links:outLinks, openConnectors, unresolved:outMarkers.filter(m => m.unresolved).length};
  };

  /* Keep marker fallback data on Binance realized P/L; labels compute Net P/L separately. */
  function updateFinalExTotals(){
    try{
      if(!Array.isArray(fillMarkers) || !Array.isArray(resultLinks)) return;
      const totals = new Map();
      const exitTotals = new Map();
      const netTotals = new Map();
      const exitNetTotals = new Map();
      const windows = new Map();
      fillMarkers.forEach(m => {
        const cid = chainIdOf(m);
        const t = n0(m && m.time);
        if(!cid || !t) return;
        const w = windows.get(cid) || {start:t,end:t,symbol:m.symbol};
        w.start = Math.min(w.start,t);
        w.end = Math.max(w.end,t);
        w.symbol = w.symbol || m.symbol;
        windows.set(cid,w);
      });
      const fundingForCid = cid => {
        const w = windows.get(cid);
        if(!w || !w.start || !w.end) return 0;
        const sym = String(w.symbol || (typeof cfg === "function" ? cfg().symbol : "") || "").toUpperCase();
        let count = 0;
        const sum = (fundingIncomeRows || []).reduce((total,row) => {
          const rawTime = n0(row && row.time);
          const t = rawTime > 1e12 ? Math.floor(rawTime / 1000) : rawTime;
          const rowSym = String(row && row.symbol || sym).toUpperCase();
          if(t >= w.start && t <= w.end && (!sym || rowSym === sym)){
            count++;
            return total + n0(row && row.income);
          }
          return total;
        },0);
        if(typeof window !== "undefined"){
          const root = window.__v13Patch37CFundingStats || {fetchedRows:(fundingIncomeRows || []).length,matches:{}};
          root.matches = root.matches || {};
          root.matches[String(cid)] = {count,sum,start:w.start,end:w.end,symbol:sym};
          window.__v13Patch37CFundingStats = root;
        }
        return sum;
      };
      resultLinks.forEach(l => {
        const cid = chainIdOf(l);
        const realized = n0(l.binanceRealizedPnl ?? l.realizedPnl);
        const fee = n0(l.fees ?? l.fee);
        const signedFee = fee > 0 ? -fee : fee;
        const net = realized + signedFee;
        if(!cid) return;
        totals.set(cid,(totals.get(cid)||0) + realized);
        netTotals.set(cid,(netTotals.get(cid)||0) + net);
        if(l.exitMarkerId){
          exitTotals.set(l.exitMarkerId,(exitTotals.get(l.exitMarkerId)||0) + realized);
          exitNetTotals.set(l.exitMarkerId,(exitNetTotals.get(l.exitMarkerId)||0) + net);
        }
      });
      fillMarkers.forEach(m => {
        const cid = chainIdOf(m);
        if(m && m.role === "close" && exitTotals.has(m.id)){
          m.pnl = exitTotals.get(m.id);
          m.binanceRealizedPnl = exitTotals.get(m.id);
          m.netPnl = exitNetTotals.get(m.id);
        }
        if(m && m.role === "close" && (m.isFinalExit || String(m.letter||"").toUpperCase() === "EX") && totals.has(cid)){
          const funding = fundingForCid(cid);
          m.pnl = totals.get(cid);
          m.totalTradePnl = totals.get(cid);
          m.binanceRealizedPnl = totals.get(cid);
          m.fundingFee = funding;
          m.netPnl = netTotals.get(cid) + funding;
          m.totalTradeNetPnl = netTotals.get(cid) + funding;
          m.letter = "EX";
        }
      });
      if(Array.isArray(overlayHitItems)){
        overlayHitItems.forEach(it => {
          if(!it || it.kind !== "marker" || String(it.letter||"").toUpperCase() !== "EX") return;
          const cid = it.parentTradeId || it.chainId;
          if(totals.has(cid)){
            const funding = fundingForCid(cid);
            it.pnl = totals.get(cid);
            it.binanceRealizedPnl = totals.get(cid);
            it.fundingFee = funding;
            it.netPnl = netTotals.get(cid) + funding;
          }
        });
      }
    }catch(_e){}
  }

  /* Reload / Reset UI. */
  function installReloadReset(){
    const reload = $id("reload");
    if(reload){ reload.textContent = "↻"; reload.title = "Reload data"; reload.setAttribute("aria-label","Reload data"); reload.classList.add("v33-reload-icon"); }
    const reset = $id("resetView");
    if(reset) reset.remove();
  }

  /* Dynamic dark red/green current price. */
  let lastPrice33 = null;
  function colorCurrentPrice(v){
    const el = $id("mClose");
    const x = num(v);
    if(!el || x == null) return;
    if(lastPrice33 == null){ el.style.color = ""; }
    else if(x > lastPrice33){ el.style.color = "#0b6b3a"; }
    else if(x < lastPrice33){ el.style.color = "#8b0000"; }
    lastPrice33 = x;
  }
  if(typeof metrics === "function" && !window.__v33MetricsWrapped){
    const prevMetrics = metrics;
    window.__v33MetricsWrapped = true;
    metrics = window.metrics = function(c){
      const r = prevMetrics.apply(this,arguments);
      try{
        const price = dailyState && num(dailyState.close) != null ? dailyState.close : (c && c.close);
        colorCurrentPrice(price);
      }catch(_e){}
      return r;
    };
  }

  /* Closed trade link settings: one compact row. */
  const CLOSED_WIDTH_KEY = "btc_futures_chart_v13_05_closed_width";
  const CLOSED_ALPHA_KEY = "btc_futures_chart_v13_19_closed_alpha";
  function closedWidth(){ const v = num(localStorage.getItem(CLOSED_WIDTH_KEY) || "1"); return v == null ? 1 : Math.max(1,Math.min(10,v)); }
  function closedAlpha(){ const v = num(localStorage.getItem(CLOSED_ALPHA_KEY) || "100"); return v == null ? 100 : Math.max(0,Math.min(100,v)); }
  function installClosedLinksRow(){
    const card = $id("patch5ClosedCard");
    if(!card) return;
    const w = closedWidth(), a = closedAlpha();
    card.innerHTML = `
      <div class="settings-card-title">Closed trade links</div>
      <div class="settings-card-desc">Thickness and transparency for closed-trade connector lines.</div>
      <div class="v33-closed-row">
        <span>Thickness</span><input id="v33ClosedWidth" type="range" min="1" max="10" step="0.25" value="${w}"><span id="v33ClosedWidthVal">${w}</span>
        <span>Transparency</span><input id="v33ClosedAlpha" type="range" min="0" max="100" step="1" value="${a}"><span id="v33ClosedAlphaVal">${a}</span>
      </div>`;
    [["v33ClosedWidth",CLOSED_WIDTH_KEY,"v33ClosedWidthVal",closedWidth],["v33ClosedAlpha",CLOSED_ALPHA_KEY,"v33ClosedAlphaVal",closedAlpha]].forEach(([id,key,out,normal])=>{
      const el=$id(id), ov=$id(out); if(!el) return;
      const sync=()=>{ const v=normal(el.value); el.value=v; localStorage.setItem(key,String(v)); if(ov) ov.textContent=String(v); try{draw();}catch(_e){} };
      el.addEventListener("input",sync,false); el.addEventListener("change",sync,false);
    });
  }

  /* MA1–MA5 settings rows: unique IDs, separate storage, same row layout. */
  const STYLE_PREFIX = "btc_futures_chart_v13_05_";
  const WIDTH_PREFIX = "btc_futures_chart_v13_18_";
  const EXTRA_PREFIX = "btc_futures_chart_v13_32r1_";
  function ls(key,def){ const v = localStorage.getItem(key); return v == null ? def : v; }
  function maPeriod(n){
    if(n <= 3){ const el=$id("emaPeriod"+n); return (el && el.value) ? el.value : String([9,21,55][n-1]); }
    return ls(EXTRA_PREFIX+"ma"+n+"Period", n===4?"100":"200");
  }
  function maColor(n){ return n<=3 ? ls(STYLE_PREFIX+"ema"+n+"_color", ["#ff7900","#0000ff","#d600a9"][n-1]) : ls(EXTRA_PREFIX+"ma"+n+"Color", n===4?"#0b7a00":"#008c7a"); }
  function maAlpha(n){ return n<=3 ? ls(STYLE_PREFIX+"ema"+n+"_alpha", "100") : ls(EXTRA_PREFIX+"ma"+n+"Alpha", "100"); }
  function maWidth(n){ return n<=3 ? ls(WIDTH_PREFIX+"ema"+n+"_width", "2") : ls(EXTRA_PREFIX+"ma"+n+"Width", "2"); }
  function maLabel(n){ return "EMA " + n; }
  function row(n){ return `<div>${maLabel(n)}</div><div><input id="v33MA${n}Period" type="number" min="1" max="999" step="1" value="${maPeriod(n)}"></div><input id="v33MA${n}Color" type="color" value="${maColor(n)}"><input id="v33MA${n}Alpha" type="range" min="0" max="100" step="1" value="${maAlpha(n)}"><input id="v33MA${n}Width" type="range" min="1" max="10" step="0.5" value="${maWidth(n)}" title="Thickness">`; }
  function updateMaToggleLabels(){
    [["lblEMA20",1],["lblEMA50",2],["lblEMA3",3],["lblEMA4",4],["lblEMA5",5]].forEach(([id,n])=>{ const l=$id(id); if(l) l.textContent="EMA"+maPeriod(n); });
  }
  function ensureMaToggles(){
    const box = document.querySelector(".indicator-toggles"); if(!box) return;
    const before = $id("tglVWAP") && $id("tglVWAP").closest("label");
    [4,5].forEach(n=>{
      if(!$id("tglEMA"+n)){
        const lab=document.createElement("label"); lab.className="toggle";
        lab.innerHTML = `<input id="tglEMA${n}" type="checkbox"><span id="lblEMA${n}">EMA${maPeriod(n)}</span>`;
        box.insertBefore(lab,before||null);
      }
      const el=$id("tglEMA"+n); if(el && !el.__v33Bound){ el.__v33Bound=true; el.addEventListener("change",()=>{try{draw();}catch(_e){}},false); }
    });
    updateMaToggleLabels();
  }
  function bindMaRows(){
    [1,2,3,4,5].forEach(n=>{
      const p=$id(`v33MA${n}Period`), c=$id(`v33MA${n}Color`), a=$id(`v33MA${n}Alpha`), w=$id(`v33MA${n}Width`);
      if(p && !p.__v33Bound){ p.__v33Bound=true; const sync=()=>{ if(n<=3){ const dst=$id("emaPeriod"+n); if(dst) dst.value=p.value; try{saveEmaSettings();}catch(_e){try{indicators();draw();}catch(_e2){}} } else { localStorage.setItem(EXTRA_PREFIX+"ma"+n+"Period",p.value); try{indicators();draw();}catch(_e){} } updateMaToggleLabels(); try{ if(window.MA_STACK_STRIP) window.MA_STACK_STRIP.refreshSoon(); }catch(_e){} }; p.addEventListener("input",sync,false); p.addEventListener("change",sync,false); }
      if(c && !c.__v33Bound){ c.__v33Bound=true; const sync=()=>{ if(n<=3) localStorage.setItem(STYLE_PREFIX+"ema"+n+"_color",c.value); else localStorage.setItem(EXTRA_PREFIX+"ma"+n+"Color",c.value); try{draw();}catch(_e){} }; c.addEventListener("input",sync,false); c.addEventListener("change",sync,false); }
      if(a && !a.__v33Bound){ a.__v33Bound=true; const sync=()=>{ if(n<=3) localStorage.setItem(STYLE_PREFIX+"ema"+n+"_alpha",a.value); else localStorage.setItem(EXTRA_PREFIX+"ma"+n+"Alpha",a.value); try{draw();}catch(_e){} }; a.addEventListener("input",sync,false); a.addEventListener("change",sync,false); }
      if(w && !w.__v33Bound){ w.__v33Bound=true; const sync=()=>{ if(n<=3) localStorage.setItem(WIDTH_PREFIX+"ema"+n+"_width",String(Math.max(1,Math.min(10,num(w.value)||2)))); else localStorage.setItem(EXTRA_PREFIX+"ma"+n+"Width",String(Math.max(1,Math.min(10,num(w.value)||2)))); try{draw();}catch(_e){} }; w.addEventListener("input",sync,false); w.addEventListener("change",sync,false); }
    });
  }
  function rebuildMaSettings(){
    const card=$id("patch8IndicatorCard"); if(!card) return;
    const old=$id("v32r1MASettings"); if(old) old.remove();
    const desc=card.querySelector(".settings-card-desc"); if(desc) desc.textContent="Set period, color, transparency, and thickness in one row per indicator.";
    let grid=card.querySelector(".patch8-indicator-grid");
    if(!grid){ grid=document.createElement("div"); grid.className="patch8-indicator-grid"; card.appendChild(grid); }
    grid.className="patch8-indicator-grid v33-ma-grid";
    grid.innerHTML=`<div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div><div class="patch8-head">Thickness</div>${row(1)}${row(2)}${row(3)}${row(4)}${row(5)}<div>VWAP</div><div><span style="color:var(--muted)">—</span></div><input id="v33VWAPColor" type="color" value="${ls(STYLE_PREFIX+"vwap_color","#6f6658")}"><input id="v33VWAPAlpha" type="range" min="0" max="100" step="1" value="${ls(STYLE_PREFIX+"vwap_alpha","100")}"><input id="v33VWAPWidth" type="range" min="1" max="10" step="0.5" value="${ls(WIDTH_PREFIX+"vwap_width","2")}" title="Thickness">`;
    bindMaRows();
    [["v33VWAPColor",STYLE_PREFIX+"vwap_color"],["v33VWAPAlpha",STYLE_PREFIX+"vwap_alpha"],["v33VWAPWidth",WIDTH_PREFIX+"vwap_width"]].forEach(([id,key])=>{ const el=$id(id); if(!el) return; const sync=()=>{ localStorage.setItem(key,el.value); try{draw();}catch(_e){} }; el.addEventListener("input",sync,false); el.addEventListener("change",sync,false); });
  }

  /* MA_STACK_STRIP — isolated removable values-line module. */
  const MA_STACK_STRIP = (() => {
    const TFs = [
      {key:"1m", interval:"1m"}, {key:"3m", interval:"3m"}, {key:"5m", interval:"5m"}, {key:"15m", interval:"15m"},
      {key:"30m", interval:"30m"},
      {key:"1H", interval:"1h"}, {key:"4H", interval:"4h"}, {key:"1D", interval:"1d"}
    ];
    let refreshTimer = null, pending = false, lastRefresh = 0;
    let blinkSymbol = "";
    const lastEventKeyByTf = new Map();
    const lastBlinkEventByTf = new Map();
    const LIVE_TFS = new Set(["1m","3m","5m","15m","30m"]);
    function hub(){ return window.PUBLIC_MARKET_DATA_HUB || null; }
    function hubRowToKline(row){
      if(!row) return null;
      return [
        Number(row.openTime || row.time * 1000),
        Number(row.open),
        Number(row.high),
        Number(row.low),
        Number(row.close),
        Number(row.volume || row.baseVolume || 0),
        Number(row.closeTime || ((Number(row.time) + (typeof ivSec === "function" ? ivSec(row.interval) : 0)) * 1000)),
        Number(row.quoteVolume || 0)
      ];
    }
    function stackPeriods(){
      const defaults = [9,21,55,100,200];
      return [1,2,3,4,5].map((n,i)=>{
        const v = Math.round(num(maPeriod(n)) || defaults[i]);
        return Math.max(1,Math.min(999,v));
      });
    }
    function ensureDom(){
      const existing = $id("v33MAStackMetric");
      if(existing){
        const oldTitle = existing.querySelector(".k");
        if(oldTitle) oldTitle.remove();
        return;
      }
      const metricsEl=document.querySelector(".metrics"); if(!metricsEl) return;
      const metric=document.createElement("div"); metric.className="metric metric-wide"; metric.id="v33MAStackMetric";
      metric.innerHTML='<div class="v"><div id="v33MAStackStrip" class="v33-ma-stack-strip"><span style="color:var(--muted)">loading</span></div></div>';
      const assess=$id("v29AssessMetric");
      const acct=document.querySelector(".metric-account-start");
      metricsEl.insertBefore(metric, assess || acct || null);
    }
    function emaSeries(values,p){
      if(!Array.isArray(values) || values.length < p) return [];
      const a=2/(p+1), out=[]; let cur=0;
      for(let i=0;i<p;i++) cur += values[i];
      cur /= p; out[p-1]=cur;
      for(let i=p;i<values.length;i++){ cur = values[i]*a + cur*(1-a); out[i]=cur; }
      return out;
    }
    function pairLabel(periods,i,j){ return `EMA${periods[i]}/${periods[j]}`; }
    function maLabelP(periods,i){ return "EMA" + periods[i]; }
    function spreadScoreLabel(score){
      if(score <= 20) return "Tight Compression";
      if(score <= 40) return "Mild Compression";
      if(score <= 60) return "Balanced Spread";
      if(score <= 80) return "Moderate Expansion";
      return "Stretched Expansion";
    }
    function spreadDisplay(spreadPct){
      if(!Number.isFinite(spreadPct)) return "Unavailable";
      const score = Math.round(Math.max(0,Math.min(100,spreadPct/0.65*100)));
      return `${spreadScoreLabel(score)} | ${score}`;
    }
    function clamp100(v){ return Math.max(0,Math.min(100,Math.round(v))); }
    function eventText(ev,freshOnly=false){ if(!ev) return freshOnly ? "No fresh event" : "None"; if(freshOnly && ev.age > 5) return "No fresh event"; return ev.label; }
    function setupDir(upPairs,downPairs,upSlope,downSlope){ if(upPairs || upSlope >= 4) return 1; if(downPairs || downSlope >= 4) return -1; return 0; }
    function eventIdentity(tf,r){
      if(!r || (r.blinkIntent !== "green" && r.blinkIntent !== "red") || !r.blinkEvent) return "";
      const ev = r.blinkEvent;
      return [
        tf.key,
        ev.eventClass || "",
        ev.type || "",
        ev.ref || ev.label || "",
        ev.time || "",
        ev.dir || 0,
        r.blinkIntent
      ].join("|");
    }
    function pairEventRank(ev){
      if(!ev) return 0;
      const t = String(ev.type || "").toLowerCase();
      const adjacent = ev.pairClass === "adjacent";
      if(adjacent && (t === "crossover" || t === "failed crossover" || t === "bounce/no-cross")) return 500;
      if(adjacent && (t === "compression release" || t === "stack transition")) return 400;
      if(!adjacent && (t === "bounce/no-cross" || t === "deep defense")) return 300;
      if(!adjacent && (t === "compression" || t === "cross risk")) return 200;
      return adjacent ? 100 : 50;
    }
    function actionableMaPair(ev){
      if(!ev) return false;
      const type = String(ev.type || "").toLowerCase();
      return type === "crossover" || type === "failed crossover" || type === "bounce/no-cross" || type === "compression release" || type === "deep defense";
    }
    function maPairIntent(ev,ctx){
      if(!ev || ev.age !== 0) return {intent:"none",reason:"No current-candle MA-pair event",display:"Event — none"};
      const type = String(ev.type || "").toLowerCase();
      const weakSetup = !ctx.setup || ctx.alignment < 60 || ctx.strength < 35 || ctx.quality < 40 || ctx.state === "mixed" || ctx.state === "transition" || ctx.state === "compression";
      if(type.includes("cross risk") || type.includes("compression") || type.includes("transition")){
        return {intent:"none",reason:"MA-pair compression/cross risk",display:ev.pairClass === "adjacent" ? "Event — transition risk" : "Event — compression risk"};
      }
      if(weakSetup){
        if(actionableMaPair(ev)){
          return {intent:"none",reason:"Weak or mixed stack context",display:ev.pairClass === "adjacent" ? "Event — transition risk" : "Event — deep MA defense"};
        }
        return {intent:"none",reason:"Weak or mixed stack context",display:"Event — none"};
      }
      if(!ev.dir) return {intent:"none",reason:"Ambiguous MA-pair event",display:"Event — none"};
      const supports = ev.dir === ctx.setup;
      return {
        intent:supports ? "green" : "red",
        reason:`MA-pair event ${supports ? "supports setup" : "conflicts with setup"}`,
        display:`Event — MA-pair event ${supports ? "supports setup" : "conflicts with setup"}`
      };
    }
    function normalizeMaPairEvent(ev,ctx){
      if(!ev) return null;
      const type = String(ev.type || "").toLowerCase();
      if(ev.age > 5) return null;
      const weakDeep = ev.pairClass !== "adjacent" && (ctx.alignment < 40 || ctx.strength < 25 || ctx.quality < 45 || ctx.state === "mixed" || ctx.state === "transition" || ctx.state === "compression");
      if(weakDeep && type === "bounce/no-cross"){
        return {
          ...ev,
          type:"cross risk",
          dir:0,
          label:`${ev.ref} ${ev.pairClass === "wide" ? "wide-pair" : "deep"} cross risk`,
          rank:Math.min(ev.rank || 0,52)
        };
      }
      return ev;
    }
    function signOf(v){ return v > 0 ? 1 : v < 0 ? -1 : 0; }
    function isConfirmedBounce(diff, fast, slow, idx){
      const start = idx - 5;
      if(start < 0) return false;
      const signs = [], pct = [];
      for(let k=start;k<=idx;k++){
        const d = diff[k];
        const s = slow[k];
        if(!Number.isFinite(d)||!Number.isFinite(s)||!Number.isFinite(fast[k])) return false;
        const sg = signOf(d);
        if(!sg) return false;
        signs.push(sg);
        pct.push(Math.abs(d)/Math.max(1,Math.abs(s)));
      }
      if(!signs.every(s => s === signs[0])) return false;
      let minLocal = 0;
      for(let k=1;k<pct.length;k++) if(pct[k] < pct[minLocal]) minLocal = k;
      if(minLocal < 2 || minLocal > 3) return false;
      let shrinkCount = 0;
      for(let k=1;k<=minLocal;k++) if(pct[k] < pct[k-1]) shrinkCount++;
      if(shrinkCount < 2 || pct[minLocal] > 0.0012) return false;
      const expandsTwice = pct[minLocal+1] > pct[minLocal] && pct[minLocal+2] > pct[minLocal+1];
      const expandsMeaningfully = pct[pct.length-1] > Math.max(pct[minLocal]*1.35,pct[minLocal]+0.00025);
      if(!expandsTwice && !expandsMeaningfully) return false;
      const minIdx = start + minLocal;
      const fastAway = signs[0] > 0 ? fast[idx] > fast[minIdx] : fast[idx] < fast[minIdx];
      return fastAway;
    }
    function isFailedCross(diff, idx){
      const start = Math.max(1,idx-5);
      const curSign = signOf(diff[idx]);
      if(!curSign) return false;
      let crossIdx = -1;
      for(let k=start;k<=idx;k++){
        const prevSign = signOf(diff[k-1]), thisSign = signOf(diff[k]);
        if(prevSign && thisSign && prevSign !== thisSign) crossIdx = k;
      }
      if(crossIdx < 0 || crossIdx === idx) return false;
      const beforeSign = signOf(diff[crossIdx-1]);
      const crossedSign = signOf(diff[crossIdx]);
      if(!beforeSign || !crossedSign || beforeSign === crossedSign) return false;
      const crossedBack = curSign === beforeSign;
      const postCrossFailed = curSign === crossedSign && Math.abs(diff[idx]) < Math.abs(diff[crossIdx])*.65;
      return crossedBack || postCrossFailed;
    }
    function detectMaPair(series, periods, ctx, lookback){
      const len = series[0] ? series[0].length : 0;
      const start = Math.max(2, len - (lookback || 18));
      let best = null;
      const add = ev => {
        if(!ev) return;
        if(ev.age > 5 && best && best.age <= 5) return;
        const score = pairEventRank(ev) + (100 - Math.min(99,ev.age || 0)) + (ev.rank || 0) / 1000;
        const bestScore = best ? pairEventRank(best) + (100 - Math.min(99,best.age || 0)) + (best.rank || 0) / 1000 : -1;
        if(!best || score > bestScore) best = ev;
      };
      for(let a=0; a<periods.length-1; a++){
        for(let b=a+1; b<periods.length; b++){
          const fast = series[a], slow = series[b];
          if(!fast || !slow || !fast.length || !slow.length) continue;
          const label = pairLabel(periods,a,b);
          const pairClass = b === a + 1 ? "adjacent" : (b - a >= 3 ? "wide" : "deep");
          const pairPrefix = pairClass === "adjacent" ? "" : (pairClass === "wide" ? "wide-pair " : "deep ");
          const diff = fast.map((v,k)=>Number.isFinite(v)&&Number.isFinite(slow[k]) ? v - slow[k] : NaN);
          for(let i=start;i<len;i++){
            const f2=fast[i-2], s2=slow[i-2], f0=fast[i-1], s0=slow[i-1], f1=fast[i], s1=slow[i];
            if(![f2,s2,f0,s0,f1,s1].every(Number.isFinite)) continue;
            const prev=f0-s0, cur=f1-s1, older=f2-s2, age=len-1-i;
            const ref=Math.max(1,Math.abs(s1));
            const prevPct=Math.abs(prev)/ref, curPct=Math.abs(cur)/ref, olderPct=Math.abs(older)/ref;
            const eventTime = ctx.times && ctx.times[i] ? ctx.times[i] : i;
            const curSign = signOf(cur);
            if(prev <= 0 && cur > 0) add({eventClass:"MA-pair",type:"crossover",pairClass,ref:label,label:`${label} ${pairPrefix}bull crossover`,age,dir:1,time:eventTime,rank:95});
            if(prev >= 0 && cur < 0) add({eventClass:"MA-pair",type:"crossover",pairClass,ref:label,label:`${label} ${pairPrefix}bear crossover`,age,dir:-1,time:eventTime,rank:95});
            if(isFailedCross(diff,i)) add({eventClass:"MA-pair",type:"failed crossover",pairClass,ref:label,label:`${label} ${pairPrefix}failed crossover`,age,dir:curSign || -signOf(diff[Math.max(0,i-1)]),time:eventTime,rank:82});
            const sameSide = Math.sign(cur) === Math.sign(prev) && Math.sign(cur) !== 0;
            const movingTogether = sameSide && curPct < prevPct && prevPct <= olderPct;
            const deepBounceOk = pairClass === "adjacent" || (ctx.alignment >= 40 && ctx.setup && curSign === ctx.setup && ctx.spreadDelta >= -0.005);
            if(sameSide && deepBounceOk && isConfirmedBounce(diff,fast,slow,i)) add({eventClass:"MA-pair",type:"bounce/no-cross",pairClass,ref:label,label:`${label} ${pairPrefix}bounce / no-cross`,age,dir:curSign,time:eventTime,rank:78});
            if(sameSide && olderPct <= 0.0009 && curPct > Math.max(olderPct*1.55,0.0012)) add({eventClass:"MA-pair",type:"compression release",pairClass,ref:label,label:`${label} ${pairPrefix}compression release`,age,dir:curSign,time:eventTime,rank:70});
            if(movingTogether && curPct <= 0.0018) add({eventClass:"MA-pair",type:"cross risk",pairClass,ref:label,label:`${label} ${pairPrefix}cross risk`,age,dir:0,time:eventTime,rank:52});
            else if(curPct <= 0.0007) add({eventClass:"MA-pair",type:"compression",pairClass,ref:label,label:`${label} ${pairPrefix}compression`,age,dir:0,time:eventTime,rank:45});
            if(sameSide && curPct > prevPct*1.35 && ctx.spreadDelta > 0.01) add({eventClass:"MA-pair",type:"expansion",pairClass,ref:label,label:`${label} ${pairPrefix}expansion`,age,dir:curSign,time:eventTime,rank:58});
          }
        }
      }
      if(ctx.nearCross && !best) add({eventClass:"MA-pair",type:"stack transition",ref:"stack",label:"Stack transition",age:0,dir:0,time:ctx.times && ctx.times[len-1] ? ctx.times[len-1] : len-1,rank:45});
      return best;
    }
    function detectPriceMA(rows, series, periods, ctx, lookback){
      const len = rows.length;
      const start = Math.max(1, len - (lookback || 10));
      let best = null;
      const add = ev => {
        if(!ev) return;
        if(!best || ev.age < best.age || (ev.age === best.age && ev.rank > best.rank)) best = ev;
      };
      for(let i=len-1;i>=start;i--){
        const row = rows[i] || [], prevRow = rows[i-1] || [];
        const o=Number(row[1]), h=Number(row[2]), l=Number(row[3]), c=Number(row[4]), pc=Number(prevRow[4]);
        if(!Number.isFinite(o)||!Number.isFinite(h)||!Number.isFinite(l)||!Number.isFinite(c)||!Number.isFinite(pc)) continue;
        const age=len-1-i, tol=Math.max(c*0.0008,1);
        for(let idx=0; idx<series.length; idx++){
          const ema=series[idx]&&series[idx][i], pema=series[idx]&&series[idx][i-1];
          if(!Number.isFinite(ema)||!Number.isFinite(pema)) continue;
          const tag=maLabelP(periods,idx);
          const eventTime = Number(row[0]) || i;
          if(pc <= pema && c > ema) add({eventClass:"Price-MA",type:"price reclaim",ref:tag,label:`Price reclaim of ${tag}`,age,dir:1,time:eventTime,rank:70});
          if(pc >= pema && c < ema) add({eventClass:"Price-MA",type:"price loss",ref:tag,label:`Price loss of ${tag}`,age,dir:-1,time:eventTime,rank:70});
          if(l <= ema + tol && c > ema && c >= o) add({eventClass:"Price-MA",type:"price bounce",ref:tag,label:`Price bounce from ${tag}`,age,dir:1,time:eventTime,rank:62});
          if(h >= ema - tol && c < ema && c <= o) add({eventClass:"Price-MA",type:"price rejection",ref:tag,label:`Price rejection from ${tag}`,age,dir:-1,time:eventTime,rank:62});
          if(l <= ema + tol && c < ema && pc > pema) add({eventClass:"Price-MA",type:"failed breakdown",ref:tag,label:`Failed breakdown at ${tag}`,age,dir:1,time:eventTime,rank:54});
          if(h >= ema - tol && c > ema && pc < pema) add({eventClass:"Price-MA",type:"failed reclaim",ref:tag,label:`Failed reclaim at ${tag}`,age,dir:-1,time:eventTime,rank:54});
          if(Math.abs(c-ema) <= tol && Math.abs(pc-pema) <= tol) add({eventClass:"Price-MA",type:"MA hold / ride",ref:tag,label:`MA hold / ride at ${tag}`,age,dir:ctx.setup,time:eventTime,rank:38});
          if((c>ema&&pc>pema&&l>ema) || (c<ema&&pc<pema&&h<ema)) add({eventClass:"Price-MA",type:"MA break with acceptance",ref:tag,label:`MA break with acceptance ${tag}`,age,dir:c>ema?1:-1,time:eventTime,rank:36});
        }
      }
      return best;
    }
    function unavailable(reason){
      return {state:"mixed",icon:"~",strength:0,alignment:0,quality:0,setup:0,maPair:"No fresh event",priceEvent:"None",maPairAge:null,priceEventAge:null,blinkIntent:"none",blinkReason:"Unavailable",title:`State: Unavailable\nStack direction: mixed\nStack Alignment: 0%\nStrength: 0%\nQuality: 0%\nHigher TF agreement: mixed / unavailable\nSpread: Unavailable\nSlope agreement: unavailable\nPhase: ${reason || "Unavailable"}\nMA Pair: No fresh event\nPrice-MA: None\nMA-pair age: -\nPrice-MA age: -\nBlink intent: none\nBlink reason: Unavailable`};
    }
    function classify(rows){
      const periods = stackPeriods();
      const maxPeriod = Math.max(...periods);
      const candles = (Array.isArray(rows)?rows:[]).filter(r=>r && Number.isFinite(Number(r[4])));
      const closes = candles.map(r=>Number(r[4]));
      const times = candles.map(r=>Number(r[0]) || 0);
      if(closes.length < maxPeriod + 10) return unavailable("Insufficient data");
      const latest = closes[closes.length-1];
      const series = periods.map(p=>emaSeries(closes,p));
      const vals = series.map(s=>s[s.length-1]);
      const prevIdx = Math.max(0, closes.length-6);
      const prev2Idx = Math.max(0, closes.length-12);
      const prev = series.map(s=>s[prevIdx]);
      const prev2 = series.map(s=>s[prev2Idx]);
      if(vals.some(v=>!Number.isFinite(v)) || prev.some(v=>!Number.isFinite(v)) || prev2.some(v=>!Number.isFinite(v))) return unavailable("Insufficient MA data");
      const pairDirs = vals.slice(0,-1).map((v,i)=>Math.sign(v-vals[i+1]));
      const upPairs = pairDirs.every(x=>x>0), downPairs = pairDirs.every(x=>x<0);
      let allBull=0, allBear=0, allTotal=0, slowBull=0, slowBear=0, slowTotal=0;
      for(let i=0;i<vals.length-1;i++){
        for(let j=i+1;j<vals.length;j++){
          const d = Math.sign(vals[i]-vals[j]);
          if(!d) continue;
          allTotal++;
          if(d>0) allBull++; else allBear++;
          if(i > 0){
            slowTotal++;
            if(d>0) slowBull++; else slowBear++;
          }
        }
      }
      const adjacentScore = clamp100(Math.max(pairDirs.filter(x=>x>0).length,pairDirs.filter(x=>x<0).length)/(periods.length-1)*100);
      const allScore = allTotal ? clamp100(Math.max(allBull,allBear)/allTotal*100) : 0;
      const slowScore = slowTotal ? clamp100(Math.max(slowBull,slowBear)/slowTotal*100) : adjacentScore;
      const alignment = upPairs || downPairs ? 100 : clamp100(Math.max(adjacentScore*.50 + slowScore*.35 + allScore*.15, Math.min(80,allScore*.85)));
      const spread = Math.max(...vals)-Math.min(...vals);
      const spreadPct = latest ? spread/latest*100 : 0;
      const prevSpread = Math.max(...prev)-Math.min(...prev);
      const prevSpreadPct = latest ? prevSpread/latest*100 : spreadPct;
      const prev2Spread = Math.max(...prev2)-Math.min(...prev2);
      const prev2SpreadPct = latest ? prev2Spread/latest*100 : prevSpreadPct;
      const spreadDelta = spreadPct - prevSpreadPct;
      const spreadAccel = spreadDelta - (prevSpreadPct - prev2SpreadPct);
      const slopeSigns = vals.map((v,i)=>v-prev[i]);
      const prevSlopeSigns = prev.map((v,i)=>v-prev2[i]);
      const slopeMagPct = vals.reduce((s,v,i)=>s+Math.abs(v-prev[i])/Math.max(1,latest),0)/vals.length*100;
      const accelPct = slopeSigns.reduce((s,v,i)=>s+Math.abs(v-prevSlopeSigns[i])/Math.max(1,latest),0)/vals.length*100;
      const upSlope = slopeSigns.filter(x=>x>0).length, downSlope = slopeSigns.filter(x=>x<0).length;
      const slopeAgree = Math.max(upSlope,downSlope);
      const tight = spreadPct < 0.15;
      const nearCross = vals.slice(0,-1).some((v,i)=> latest && Math.abs(v-vals[i+1])/latest < 0.0005);
      const setup = setupDir(upPairs,downPairs,upSlope,downSlope);
      let state="mixed", icon="~", stateLabel="Mixed";
      if(upPairs){ state="up"; icon="▲"; stateLabel="Up stack"; }
      else if(downPairs){ state="down"; icon="▼"; stateLabel="Down stack"; }
      else if(tight){ state="compression"; icon="≋"; stateLabel="Compression"; }
      else if(nearCross){ state="transition"; icon="×"; stateLabel="Transition"; }
      let phase="Chop / Mixed";
      if(tight && spreadDelta > 0.01) phase="Compression Release";
      else if(tight && spreadDelta < -0.01) phase="Flattening Compression";
      else if(tight) phase="Neutral Compression";
      else if(nearCross) phase="Stack Transition";
      else if((upPairs||downPairs) && spreadDelta > 0 && slopeAgree >= 4) phase="Clean Expanding Trend";
      else if(upPairs || downPairs) phase="Ordered but Late/Flattening";
      const spreadScore = clamp100(spreadPct/0.55*100);
      const expansionScore = clamp100((spreadDelta+0.04)/0.12*100);
      const slopeScore = clamp100(slopeMagPct/0.08*100);
      const slopeAgreeScore = clamp100(slopeAgree/5*100);
      const accelScore = clamp100(accelPct/0.04*100);
      const compressionRelease = tight ? 45 : (prevSpreadPct < 0.18 && spreadDelta > 0.015 ? 85 : 55);
      const flattenPenalty = spreadDelta < -0.01 || slopeMagPct < 0.012 ? 14 : 0;
      const chopPenalty = (!upPairs && !downPairs && !tight) || nearCross ? 18 : 0;
      const overextensionPenalty = spreadPct > 1.2 ? Math.min(18,(spreadPct-1.2)*12) : 0;
      const rawStrength = alignment*.24 + spreadScore*.18 + expansionScore*.14 + slopeScore*.16 + slopeAgreeScore*.12 + accelScore*.08 + compressionRelease*.08 - flattenPenalty - chopPenalty - overextensionPenalty;
      const structureFloor = alignment >= 40 ? Math.min(35,14 + alignment*.20 + slopeAgreeScore*.05) : alignment >= 20 ? Math.min(25,10 + alignment*.22) : 0;
      const strength = clamp100(Math.max(rawStrength,structureFloor));
      const ctx = {spreadDelta,nearCross,setup,times,alignment};
      const rawMaEvent = detectMaPair(series,periods,ctx,18);
      const priceEvent = detectPriceMA(candles,series,periods,{setup},10);
      const validStructure = rawMaEvent ? 70 : 35;
      const eventFreshScore = rawMaEvent ? Math.max(0,100-rawMaEvent.age*18) : 0;
      const priceConfirm = priceEvent && priceEvent.dir && setup && priceEvent.dir === setup ? 80 : priceEvent ? 45 : 35;
      const preCompression = prev2SpreadPct < 0.22 ? 82 : 45;
      const quality = clamp100(preCompression*.16 + validStructure*.16 + expansionScore*.14 + slopeAgreeScore*.14 + alignment*.14 + priceConfirm*.12 + eventFreshScore*.10 + (chopPenalty?25:75)*.04 - chopPenalty*.55);
      const maEvent = normalizeMaPairEvent(rawMaEvent,{alignment,strength,quality,state});
      const maIntent = maPairIntent(maEvent,{setup,state,strength,quality,alignment});
      const blink = maIntent;
      const blinkEvent = blink.intent === "none" ? null : maEvent;
      const maPair = eventText(maEvent,true);
      const priceMa = eventText(priceEvent,false);
      const spreadCondition = tight ? "compression" : spreadDelta > 0.01 ? "expanding" : spreadDelta < -0.01 ? "contracting" : "balanced";
      const title = `State: ${stateLabel}\nStack direction: ${setup>0?"bullish":setup<0?"bearish":"mixed"}\nStack Alignment: ${alignment}%\nStrength: ${strength}%\nQuality: ${quality}%\nHigher TF agreement: pending\nSpread: ${spreadDisplay(spreadPct)}\nSpread condition: ${spreadCondition}\nSlope agreement: ${slopeAgree}/5\nPhase: ${phase}\nMA Pair: ${maPair}\nPrice-MA: ${priceMa}\nMA-pair age: ${maEvent?maEvent.age:"-"}\nPrice-MA age: ${priceEvent?priceEvent.age:"-"}\nBlink intent: ${blink.intent}\nBlink reason: ${blink.reason}`;
      return {state,icon,strength,alignment,quality,title,phase,setup,maPair,maEvent,priceEvent:priceMa,maPairAge:maEvent?maEvent.age:null,priceEventAge:priceEvent?priceEvent.age:null,blinkIntent:blink.intent,blinkReason:blink.reason,blinkEvent,eventDisplay:blink.display};
    }
    function bg(state,strength){
      const a = 0.25 + Math.max(0,Math.min(100,strength))/100*0.32;
      if(state === "up") return `rgba(34,197,94,${a})`;
      if(state === "down") return `rgba(248,113,113,${a})`;
      return "";
    }
    function switchTf(interval){
      const sel=$id("interval");
      if(!sel || !interval) return;
      if(sel.value !== interval){
        sel.value = interval;
        sel.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
    function iconClass(icon){ return (icon === "▲" || icon === "▼") ? "v33-stack-icon" : "v33-stack-icon v33-stack-icon-alt"; }
    function titleLine(title,label,fallback="-"){
      const m = String(title || "").match(new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + ":\\s*(.*)$","m"));
      return m ? m[1] : fallback;
    }
    function compactEventText(text){
      return String(text || "None").replace(/\s+(current candle|\d+ bars ago)$/,"");
    }
    function stateText(r){
      const label = r.state === "up" ? "Up stack" : r.state === "down" ? "Down stack" : r.state === "compression" ? "Compression" : r.state === "transition" ? "Transition" : "Mixed";
      return `${label} / ${r.phase || "-"}`;
    }
    function eventLine(r){
      return r && r.eventDisplay ? r.eventDisplay : "Event — none";
    }
    function escHtml(v){ return String(v == null ? "" : v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
    function compactTooltipHtml(tf,r){
      const alignment = Math.max(0,Math.min(5,Math.round((Number(r.alignment)||0)/20)));
      const rows = [
        `State: ${stateText(r)}`,
        `Alignment: ${alignment}/5`,
        `Strength: ${Number.isFinite(r.strength) ? r.strength : 0}%`,
        `Quality: ${Number.isFinite(r.quality) ? r.quality : 0}%`,
        `Spread: ${titleLine(r.title,"Spread")}`
      ];
      return `<div style="font-weight:800;font-size:13px;line-height:1.1;margin-bottom:8px">${escHtml(tf.key)}</div>`+
        rows.map(line=>`<div>${escHtml(line)}</div>`).join("")+
        `<div style="height:8px"></div>`+
        `<div>${escHtml("MA Pair: " + compactEventText(r.maPair || "No fresh event"))}</div>`+
        `<div style="height:8px"></div>`+
        `<div>${escHtml(eventLine(r))}</div>`;
    }
    function ensureMaStackTooltip(){
      let tip = document.getElementById("v33MAStackTooltip");
      if(tip) return tip;
      tip = document.createElement("div");
      tip.id = "v33MAStackTooltip";
      tip.style.cssText = "position:fixed;z-index:99999;display:none;pointer-events:none;background:rgba(17,24,39,.96);color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:6px;padding:8px 10px;font:11.5px Arial,sans-serif;line-height:1.35;box-shadow:0 8px 24px rgba(0,0,0,.24);white-space:nowrap";
      document.body.appendChild(tip);
      return tip;
    }
    function positionMaStackTooltip(btn){
      const tip = ensureMaStackTooltip();
      const r = btn.getBoundingClientRect();
      const pad = 8;
      let x = r.left;
      let y = r.bottom + 8;
      const tw = tip.offsetWidth || 180;
      const th = tip.offsetHeight || 140;
      if(x + tw + pad > window.innerWidth) x = Math.max(pad,window.innerWidth - tw - pad);
      if(y + th + pad > window.innerHeight) y = Math.max(pad,r.top - th - 8);
      tip.style.left = Math.round(x) + "px";
      tip.style.top = Math.round(y) + "px";
    }
    function showMaStackTooltip(btn){
      const tip = ensureMaStackTooltip();
      tip.innerHTML = btn.__v33TipHtml || "";
      tip.style.display = "block";
      positionMaStackTooltip(btn);
    }
    function hideMaStackTooltip(){
      const tip = document.getElementById("v33MAStackTooltip");
      if(tip) tip.style.display = "none";
    }
    function applyHigherTfAgreement(results){
      const order = TFs.map(x=>x.key);
      order.forEach((key,idx)=>{
        const r = results[key];
        if(!r || !Number.isFinite(r.quality)) return;
        const higher = order.slice(idx+1).map(k=>results[k]).find(x=>x && Number.isFinite(x.setup) && x.setup);
        const agreement = higher && r.setup ? (higher.setup === r.setup ? "aligned" : "conflicting") : "mixed / unavailable";
        const delta = agreement === "aligned" ? 8 : agreement === "conflicting" ? -12 : -3;
        r.quality = clamp100(r.quality + delta);
        r.title = String(r.title || "").replace(/Quality: \d+%/,`Quality: ${r.quality}%`).replace(/Higher TF agreement: .*/m,`Higher TF agreement: ${agreement}`);
      });
    }
    function render(results){
      ensureDom(); const strip=$id("v33MAStackStrip"); if(!strip) return;
      const tooltipHtmlByTf = new Map();
      const html = TFs.map(tf=>{
        const r=results[tf.key] || unavailable("Unavailable");
        const style = bg(r.state,r.strength) ? ` style="background:${bg(r.state,r.strength)}"` : "";
        const ev = r.blinkIntent === "green" ? "green" : r.blinkIntent === "red" ? "red" : "";
        const eventKey = eventIdentity(tf,r);
        tooltipHtmlByTf.set(tf.key,compactTooltipHtml(tf,r));
        return `<button type="button" class="v33-ma-stack-box" data-interval="${tf.interval}" data-tf="${tf.key}" data-event="${ev||''}" data-event-key="${eventKey.replace(/"/g,'&quot;')}" data-state="${r.state}" aria-label="${tf.key} MA Stack"${style}><span class="v33-tf-label">${tf.key}</span><span class="${iconClass(r.icon)}">${r.icon}</span></button>`;
      }).join("");
      if(strip.__v33LastHtml !== html){
        strip.innerHTML = html;
        strip.__v33LastHtml = html;
      }
      strip.querySelectorAll(".v33-ma-stack-box").forEach(btn=>{
        const tf = btn.dataset.tf || "";
        const ev = btn.dataset.event || "";
        const evKey = btn.dataset.eventKey || "";
        btn.__v33TipHtml = tooltipHtmlByTf.get(tf) || "";
        if(ev && evKey && lastEventKeyByTf.get(tf) !== evKey){
          lastEventKeyByTf.set(tf,evKey);
          lastBlinkEventByTf.set(tf, ev);
          btn.classList.remove("v33-flash-cross","v33-flash-bounce");
          void btn.offsetWidth;
          btn.classList.add(ev === "red" ? "v33-flash-cross" : "v33-flash-bounce");
          setTimeout(()=>btn.classList.remove("v33-flash-cross","v33-flash-bounce"),1100);
        }
        if(btn.__v33ClickBound) return;
        btn.__v33ClickBound = true;
        btn.addEventListener("click",()=>switchTf(btn.dataset.interval),false);
        btn.addEventListener("mouseenter",()=>showMaStackTooltip(btn),false);
        btn.addEventListener("mousemove",()=>positionMaStackTooltip(btn),false);
        btn.addEventListener("mouseleave",hideMaStackTooltip,false);
        btn.addEventListener("focus",()=>showMaStackTooltip(btn),false);
        btn.addEventListener("blur",hideMaStackTooltip,false);
      });
    }
    async function fetchTf(tf){
      const h = hub();
      if(!h) return null;
      const maxPeriod = Math.max(...stackPeriods());
      const limit = Math.max(260,Math.min(1000,maxPeriod+60));
      const sourceRows = LIVE_TFS.has(tf.interval) && typeof h.getChartBuffer === "function"
        ? h.getChartBuffer(tf.interval)
        : (typeof h.getClosedBuffer === "function" ? h.getClosedBuffer(tf.interval) : []);
      const rows = (Array.isArray(sourceRows) ? sourceRows : [])
        .slice(-limit)
        .map(hubRowToKline)
        .filter(row => row && row.every((v,idx) => idx > 5 || Number.isFinite(v)));
      return rows.length ? rows : null;
    }
    async function refresh(){
      if(pending) return; pending=true; ensureDom();
      try{
        const liveSymbol = (typeof cfg === "function" && cfg() && cfg().symbol ? cfg().symbol : "").toUpperCase();
        if(liveSymbol && blinkSymbol !== liveSymbol){
          blinkSymbol = liveSymbol;
          lastEventKeyByTf.clear();
          lastBlinkEventByTf.clear();
        }
        const out={};
        const h = hub();
        if(h && typeof h.ensureMaStackBuffers === "function"){
          await h.ensureMaStackBuffers(false).catch(() => {});
        }
        await Promise.all(TFs.map(async tf=>{ try{ const rows=await fetchTf(tf); out[tf.key]=rows?classify(rows):unavailable("Unavailable"); }catch(e){ out[tf.key]=unavailable("Fetch failed: "+(e&&e.message?e.message:String(e))); } }));
        applyHigherTfAgreement(out);
        render(out); lastRefresh=Date.now();
      }finally{
        pending=false;
      }
    }
    function refreshSoon(){ if(refreshTimer || pending) return; const wait=Math.max(50,1000-(Date.now()-lastRefresh)); refreshTimer=setTimeout(()=>{ refreshTimer=null; refresh(); },wait); }
    function start(){ ensureDom(); const h=hub(); if(h && typeof h.setMaStackVisible === "function") h.setMaStackVisible(true); refreshSoon(); }
    function stop(){ if(refreshTimer) clearTimeout(refreshTimer); refreshTimer=null; const h=hub(); if(h && typeof h.setMaStackVisible === "function") h.setMaStackVisible(false); }
    function labEventBucket(ev){
      const type = String(ev && ev.type || "").toLowerCase();
      const deep = ev && ev.pairClass !== "adjacent";
      if(type === "crossover") return "crossover";
      if(type === "failed crossover") return "failed";
      if(type === "bounce/no-cross") return deep ? "deepBounce" : "bounce";
      if(type === "compression") return deep ? "deepRisk" : "compression";
      if(type === "compression release") return "release";
      if(type === "stack transition") return "transition";
      if(deep && type === "cross risk") return "deepRisk";
      return "";
    }
    function labEventSettingKey(bucket){
      return bucket === "deepBounce" || bucket === "deepRisk" ? "deep" : bucket;
    }
    function labPairIndexes(periods,ref){
      const m = String(ref || "").match(/EMA(\d+)\/(\d+)/);
      if(!m) return null;
      const a = periods.indexOf(Number(m[1])), b = periods.indexOf(Number(m[2]));
      return a >= 0 && b >= 0 ? {a,b} : null;
    }
    function labPairStillValid(ev,series,periods,candidateIdx,confirmedIdx){
      const pair = labPairIndexes(periods,ev.ref);
      if(!pair) return true;
      if(confirmedIdx <= candidateIdx) return true;
      const fast = series[pair.a], slow = series[pair.b];
      if(!fast || !slow) return false;
      const cd = Number(fast[candidateIdx]) - Number(slow[candidateIdx]);
      const pd = Number(fast[Math.max(0,candidateIdx-1)]) - Number(slow[Math.max(0,candidateIdx-1)]);
      const fd = Number(fast[confirmedIdx]) - Number(slow[confirmedIdx]);
      if(![cd,pd,fd].every(Number.isFinite)) return false;
      const type = String(ev.type || "").toLowerCase();
      const dir = Number(ev.dir) || signOf(cd) || signOf(fd);
      const confirmedSign = signOf(fd);
      const sameSideThroughConfirmation = () => {
        if(!dir) return false;
        for(let k=candidateIdx;k<=confirmedIdx;k++){
          const d = Number(fast[k]) - Number(slow[k]);
          if(!Number.isFinite(d) || signOf(d) !== dir) return false;
        }
        return true;
      };
      if(type === "crossover") return dir && confirmedSign === dir;
      if(type === "failed crossover") return dir && confirmedSign === dir;
      if(type === "bounce/no-cross") return sameSideThroughConfirmation() && Math.abs(fd) >= Math.abs(cd) * 0.98;
      if(type === "compression release") return dir && confirmedSign === dir && Math.abs(fd) >= Math.abs(cd) * 1.02;
      if(type === "compression" || type === "cross risk") return Math.abs(fd) <= Math.max(Math.abs(cd) * 1.35,Math.abs(Number(slow[confirmedIdx])) * 0.0025);
      return true;
    }
    function labStackStillValid(ev,confirmed){
      if(!confirmed) return false;
      const type = String(ev.type || "").toLowerCase();
      if(type !== "stack transition") return true;
      return confirmed.state === "transition" || !!(confirmed.maEvent && String(confirmed.maEvent.type || "").toLowerCase() === "stack transition");
    }
    function markerEvents(tf,rows,opts={}){
      const source = (Array.isArray(rows) ? rows : []).filter(row => row && row.every((v,idx) => idx > 5 || Number.isFinite(v)));
      const maxPeriod = Math.max(...stackPeriods());
      const start = Math.max(maxPeriod + 10, Number(opts.startIndex) || maxPeriod + 10);
      const end = Math.min(source.length - 1, Number.isFinite(opts.endIndex) ? opts.endIndex : source.length - 1);
      const windowSize = Math.max(maxPeriod + 25, Math.min(320,maxPeriod + 100));
      const periods = stackPeriods();
      const closes = source.map(r=>Number(r[4]));
      const series = periods.map(p=>emaSeries(closes,p));
      const out = [];
      for(let i=start;i<=end;i++){
        const slice = source.slice(Math.max(0,i-windowSize+1),i+1);
        if(slice.length < maxPeriod + 10) continue;
        const r = classify(slice);
        const ev = r && r.maEvent;
        if(!ev || ev.age !== 0) continue;
        const bucket = labEventBucket(ev);
        const settingKey = labEventSettingKey(bucket);
        const confirmationCandles = typeof opts.confirmationCandlesFor === "function"
          ? Math.max(0,Math.min(20,Math.round(Number(opts.confirmationCandlesFor(settingKey,bucket,ev)) || 0)))
          : 0;
        const confirmedIndex = i + confirmationCandles;
        if(confirmedIndex > end || confirmedIndex >= source.length) continue;
        const confirmedSlice = source.slice(Math.max(0,confirmedIndex-windowSize+1),confirmedIndex+1);
        if(confirmedSlice.length < maxPeriod + 10) continue;
        const confirmed = confirmationCandles ? classify(confirmedSlice) : r;
        if(!labPairStillValid(ev,series,periods,i,confirmedIndex)) continue;
        if(!labStackStillValid(ev,confirmed)) continue;
        const candidateRow = source[i] || [];
        const confirmedRow = source[confirmedIndex] || [];
        const candidateTime = Math.floor((Number(candidateRow[0]) || Number(ev.time) || 0)/1000);
        const confirmedTime = Math.floor((Number(confirmedRow[0]) || Number(ev.time) || 0)/1000);
        const strength = Number(confirmed && confirmed.strength) || Number(r.strength) || 0;
        const quality = Number(confirmed && confirmed.quality) || Number(r.quality) || 0;
        const alignment = Number(confirmed && confirmed.alignment) || Number(r.alignment) || 0;
        const outcomeWindow = typeof opts.outcomeWindowFor === "function"
          ? opts.outcomeWindowFor(settingKey,bucket,ev)
          : undefined;
        out.push({
          tf:tf.key,
          interval:tf.interval,
          time:confirmedTime,
          candidateTime,
          confirmedTime,
          confirmationCandles,
          price:Number(confirmedRow[4]),
          type:ev.type,
          eventType:ev.type,
          pairClass:ev.pairClass || "adjacent",
          ref:ev.ref || "",
          pair:ev.ref || "",
          label:ev.label || "",
          timeframe:tf.key,
          strength,
          quality,
          alignment,
          Strength:strength,
          Quality:quality,
          Alignment:alignment,
          outcomeWindow,
          sourceIndex:confirmedIndex,
          candidateIndex:i,
          confirmedIndex,
          state:(confirmed && confirmed.state) || r.state || "mixed"
        });
      }
      return out;
    }
    return {start,stop,refresh,refreshSoon,markerEvents,hubRowToKline,stackPeriods};
  })();
  window.MA_STACK_STRIP = MA_STACK_STRIP;

  const MA_STACK_MARKERS = (() => {
    const KEY = "btc_futures_chart_v13_ma_stack_markers_";
    const TFs = [
      {key:"1m", interval:"1m"}, {key:"3m", interval:"3m"}, {key:"5m", interval:"5m"}, {key:"15m", interval:"15m"},
      {key:"1H", interval:"1h"}, {key:"4H", interval:"4h"}, {key:"1D", interval:"1d"}
    ];
    const EVENT_TYPES = [
      {key:"crossover",label:"Crossover"},
      {key:"failed",label:"Failed crossover"},
      {key:"bounce",label:"Bounce / no-cross"},
      {key:"compression",label:"Compression"},
      {key:"release",label:"Compression release"},
      {key:"transition",label:"Stack transition"},
      {key:"deep",label:"Deep/wide MA event"}
    ];
    const OUTCOME_WINDOWS = [1,2,3,5,10,20];
    const cache = new Map();
    function get(k,d){ const v=localStorage.getItem(KEY+k); return v == null ? d : v; }
    function set(k,v){ localStorage.setItem(KEY+k,String(v)); cache.clear(); }
    function on(k,d=true){ return get(k,d?"1":"0") === "1"; }
    function settings(){
      return {
        show:on("show",false),
        range:get("range","visible"),
        types:{
          crossover:on("type_crossover",true),
          failed:on("type_failed",true),
          bounce:on("type_bounce",true),
          compression:on("type_compression",true),
          release:on("type_release",true),
          transition:on("type_transition",true),
          deepBounce:on("type_deep_bounce",true),
          deepRisk:on("type_deep_risk",true)
        },
        tfs:new Set(TFs.filter(tf => on("tf_"+tf.interval,["1m","3m","5m","15m"].includes(tf.interval))).map(tf=>tf.interval)),
        max:get("max","20"),
        group:on("group",true),
        labelMode:get("label","label")
      };
    }
    function eventSetting(type,name,def){ return get("event_"+type+"_"+name,def); }
    function eventOn(type,name,def=true){ return eventSetting(type,name,def?"1":"0") === "1"; }
    function eventConfig(type){
      return {
        pair:eventSetting(type,"pair","all"),
        minAlignment:Math.max(0,Math.min(5,Math.round(num(eventSetting(type,"min_alignment","2"),2)))),
        minStrength:Math.max(0,Math.min(100,Math.round(num(eventSetting(type,"min_strength",type==="deep"?"45":"50"),50)))),
        minQuality:Math.max(0,Math.min(100,Math.round(num(eventSetting(type,"min_quality",type==="deep"?"70":"60"),60)))),
        confirm:Math.max(0,Math.min(20,Math.round(num(eventSetting(type,"confirm","1"),1)))),
        outcome:OUTCOME_WINDOWS.includes(Number(eventSetting(type,"outcome","5"))) ? Number(eventSetting(type,"outcome","5")) : 5,
        failureType:eventSetting(type,"failure_type","cross-back"),
        proximity:eventSetting(type,"proximity","normal"),
        direction:eventSetting(type,"direction","either"),
        context:eventSetting(type,"context","pullback defense"),
        requireSlope:eventOn(type,"require_slope",true),
        requireDefense:eventOn(type,"require_defense",true),
        requireAdjacent:eventOn(type,"require_adjacent",false),
        conflict:eventOn(type,"conflict",true)
      };
    }
    function eventBucket(ev){
      const type = String(ev.type || "").toLowerCase();
      const deep = ev.pairClass !== "adjacent";
      if(type === "crossover") return "crossover";
      if(type === "failed crossover") return "failed";
      if(type === "bounce/no-cross") return deep ? "deepBounce" : "bounce";
      if(type === "compression release") return "release";
      if(type === "stack transition") return "transition";
      if(deep && (type === "compression" || type === "cross risk")) return "deepRisk";
      return "";
    }
    function shortPair(ref){
      const m = String(ref || "").match(/EMA(\d+)\/(\d+)/);
      return m ? `${m[1]}/${m[2]}` : String(ref || "Stack");
    }
    function markerLabel(ev){
      const bucket = eventBucket(ev);
      const pair = shortPair(ev.ref);
      if(bucket === "crossover") return {icon:"×",text:`${pair} Cross`};
      if(bucket === "failed") return {icon:"!",text:`${pair} Fail`};
      if(bucket === "bounce") return {icon:"↩",text:`${pair} Bounce`};
      if(bucket === "release") return {icon:"↗",text:`${pair} Release`};
      if(bucket === "transition") return {icon:"⇄",text:"Stack Tx"};
      if(bucket === "deepBounce") return {icon:"◆",text:`${pair} Deep`};
      if(bucket === "deepRisk") return {icon:"◇",text:`${pair} Risk`};
      return {icon:"•",text:pair};
    }
    function eventBucketLab(ev){
      const type = String(ev.type || "").toLowerCase();
      const deep = ev.pairClass !== "adjacent";
      if(type === "crossover") return "crossover";
      if(type === "failed crossover") return "failed";
      if(type === "bounce/no-cross") return deep ? "deepBounce" : "bounce";
      if(type === "compression") return deep ? "deepRisk" : "compression";
      if(type === "compression release") return "release";
      if(type === "stack transition") return "transition";
      if(deep && type === "cross risk") return "deepRisk";
      return "";
    }
    function eventTypeForBucket(bucket){
      if(bucket === "deepBounce" || bucket === "deepRisk") return "deep";
      return bucket;
    }
    function allowedLab(ev,s){
      const bucket = eventBucketLab(ev);
      if(!bucket || !s.types[bucket]) return false;
      const cfg = eventConfig(eventTypeForBucket(bucket));
      const deep = ev.pairClass !== "adjacent";
      if(cfg.pair !== "all" && ev.ref !== cfg.pair) return false;
      if((ev.strength || 0) < cfg.minStrength) return false;
      if((ev.quality || 0) < (deep ? Math.max(70,cfg.minQuality) : cfg.minQuality)) return false;
      if(Math.round((ev.alignment || 0)/20) < cfg.minAlignment) return false;
      return true;
    }
    function markerLabelLab(ev){
      const bucket = eventBucketLab(ev);
      const pair = shortPair(ev.ref);
      if(bucket === "crossover") return {icon:"X",text:`${pair} Cross`};
      if(bucket === "failed") return {icon:"F",text:`${pair} Fail`};
      if(bucket === "bounce") return {icon:"B",text:`${pair} Bounce`};
      if(bucket === "compression") return {icon:"C",text:`${pair} Comp`};
      if(bucket === "release") return {icon:"R",text:`${pair} Release`};
      if(bucket === "transition") return {icon:"T",text:"Stack Tx"};
      if(bucket === "deepBounce") return {icon:"D",text:`${pair} Deep`};
      if(bucket === "deepRisk") return {icon:"!",text:`${pair} Risk`};
      return {icon:"*",text:pair};
    }
    function eventNameLab(ev){
      const bucket = eventBucketLab(ev);
      if(bucket === "crossover") return "MA crossover";
      if(bucket === "failed") return "Failed crossover";
      if(bucket === "bounce") return "Bounce / no-cross";
      if(bucket === "compression") return "Compression";
      if(bucket === "release") return "Compression release";
      if(bucket === "transition") return "Stack transition";
      if(bucket === "deepBounce") return "Deep/wide MA bounce";
      if(bucket === "deepRisk") return "Deep/wide compression / cross risk";
      return String(ev.type || "MA event");
    }
    function markerTooltipLab(ev){
      const cfg = eventConfig(eventTypeForBucket(eventBucketLab(ev)));
      const outcome = Number.isFinite(Number(ev.outcomePct))
        ? `${Number(ev.outcomePct) >= 0 ? "+" : ""}${Number(ev.outcomePct).toFixed(2)}%`
        : "Pending / not scored";
      return [
        eventNameLab(ev),
        "Pair: " + (shortPair(ev.ref) || "-"),
        "Timeframe: " + (ev.tf || (typeof iv === "function" ? iv() : "-")),
        "Strength: " + Math.round(Number(ev.strength) || 0) + "%",
        "Quality: " + Math.round(Number(ev.quality) || 0) + "%",
        "Alignment: " + Math.round((Number(ev.alignment) || 0) / 20) + "/5",
        "Confirmation candles: " + (Number.isFinite(Number(ev.confirmationCandles)) ? Number(ev.confirmationCandles) : cfg.confirm),
        "Outcome window: " + (Number(ev.outcomeWindow) || cfg.outcome) + " candle" + ((Number(ev.outcomeWindow) || cfg.outcome) === 1 ? "" : "s"),
        "Outcome: " + outcome
      ];
    }
    function withOutcomeLab(ev,rows){
      const cfg = eventConfig(eventTypeForBucket(eventBucketLab(ev)));
      const idx = Number(ev.sourceIndex);
      const outcomeWindow = Number(ev.outcomeWindow) || cfg.outcome;
      const future = Number.isFinite(idx) ? rows[Math.min(rows.length-1,idx + outcomeWindow)] : null;
      const base = Number(ev.price);
      const futureClose = future ? Number(future[4]) : NaN;
      const changePct = Number.isFinite(base) && base && Number.isFinite(futureClose) ? (futureClose - base) / base * 100 : null;
      return {...ev,outcomeWindow,outcomePct:changePct};
    }
    function activeVisibleTimeRange(){
      if(!Array.isArray(candles) || !candles.length) return null;
      const r = range();
      const first = candles[Math.max(0,r.start)];
      const last = candles[Math.max(0,Math.min(candles.length-1,r.end-1))];
      return first && last ? {start:first.time,end:last.time,startIndex:r.start,endIndex:r.end-1} : null;
    }
    function cacheKey(tf,rows,s,rangeInfo){
      const last = rows.length ? rows[rows.length-1][0] : 0;
      const eventSig = EVENT_TYPES.map(type => {
        const cfg = eventConfig(type.key);
        return [type.key,cfg.pair,cfg.minStrength,cfg.minQuality,cfg.minAlignment,cfg.confirm,cfg.outcome].join(":");
      }).join(",");
      const typeSig = Object.keys(s.types).sort().map(key => `${key}:${s.types[key] ? 1 : 0}`).join(",");
      const tfSig = Array.from(s.tfs).sort().join(",");
      const sig = [tf.interval,rows.length,last,s.range,tfSig,typeSig,eventSig,s.max,s.group,s.labelMode,rangeInfo?rangeInfo.start:"",rangeInfo?rangeInfo.end:""].join("|");
      return sig;
    }
    function sourceRows(tf,s,rangeInfo){
      const h = window.PUBLIC_MARKET_DATA_HUB;
      if(!h || typeof h.getClosedBuffer !== "function") return [];
      let rows = h.getClosedBuffer(tf.interval) || [];
      const warmup = Math.max(...MA_STACK_STRIP.stackPeriods()) + 80;
      if(s.range === "last100"){
        rows = rows.slice(-(100 + warmup));
      }else if(s.range === "last300"){
        rows = rows.slice(-(300 + warmup));
      }else if(s.range === "live"){
        rows = (typeof h.getChartBuffer === "function" ? h.getChartBuffer(tf.interval) : rows).slice(-80);
      }else if(s.range === "visible" && rangeInfo){
        const start = Math.max(0,rows.findIndex(r => Number(r.time) >= rangeInfo.start) - warmup);
        const end = rows.findIndex(r => Number(r.time) > rangeInfo.end);
        rows = rows.slice(start,end > 0 ? end : rows.length);
      }else if(s.range === "loaded"){
        rows = rows.slice();
      }else{
        rows = rows.slice(-1800);
      }
      return rows.map(MA_STACK_STRIP.hubRowToKline).filter(Boolean);
    }
    function events(){
      const s = settings();
      if(!s.show) return [];
      const rangeInfo = activeVisibleTimeRange();
      if(!rangeInfo) return [];
      let out = [];
      TFs.forEach(tf => {
        if(!s.tfs.has(tf.interval) || tf.interval !== iv()) return;
        const rows = sourceRows(tf,s,rangeInfo);
        if(rows.length < 50) return;
        const key = cacheKey(tf,rows,s,rangeInfo);
        let evs = cache.get(key);
        if(!evs){
          evs = MA_STACK_STRIP.markerEvents(tf,rows,{
            confirmationCandlesFor:(type)=>eventConfig(type).confirm,
            outcomeWindowFor:(type)=>eventConfig(type).outcome
          });
          cache.set(key,evs);
        }
        out = out.concat(evs.filter(ev => {
          const markerTime = Number(ev.confirmedTime) || Number(ev.time);
          if(s.range === "visible" && (markerTime < rangeInfo.start || markerTime > rangeInfo.end)) return false;
          if(s.range === "last100" && ev.sourceIndex < rows.length - 100) return false;
          if(s.range === "last300" && ev.sourceIndex < rows.length - 300) return false;
          return allowedLab(ev,s);
        }).map(ev => withOutcomeLab(ev,rows)));
      });
      return limitEvents(out,s);
    }
    function limitEvents(evs,s){
      const max = s.max === "unlimited" ? Infinity : Number(s.max) || 20;
      let arr = evs.slice().sort((a,b)=>(Number(a.confirmedTime)||Number(a.time)||0)-(Number(b.confirmedTime)||Number(b.time)||0));
      if(s.group){
        const grouped = [];
        arr.forEach(ev => {
          const last = grouped[grouped.length-1];
          const evTime = Number(ev.confirmedTime) || Number(ev.time) || 0;
          const lastTime = Number(last && last.confirmedTime) || Number(last && last.time) || 0;
          if(last && Math.abs(evTime-lastTime) <= (typeof ivSec === "function" ? ivSec() * 2 : 300)){
            if((ev.quality > last.quality) || (ev.quality === last.quality && ev.strength > last.strength)) grouped[grouped.length-1] = ev;
          }else grouped.push(ev);
        });
        arr = grouped;
      }
      if(arr.length > max) arr = arr.slice(-max);
      return arr;
    }
    function xForTime(t,vis,mapX){
      if(!vis.length || t < Number(vis[0].time) || t > Number(vis[vis.length-1].time)) return null;
      let best = -1;
      for(let i=0;i<vis.length;i++){ if(Number(vis[i].time) <= t) best = i; else break; }
      return best >= 0 ? mapX(best) : null;
    }
    function draw(){
      const s = settings();
      if(!s.show || !ctx || !canvas || !Array.isArray(candles) || candles.length < 2 || !(lastYMax > lastYMin)) return;
      const r = range(), vis = candles.slice(r.start,r.end);
      if(vis.length < 2) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const left = LEFT_PAD, right = RIGHT_AXIS, top = 18, bottom = 30;
      const priceH = lastAreaH || Math.floor((h-top-bottom) * .78);
      const chartW = w - left - right;
      const total = Math.max(2,vis.length + (r.futureBars || 0));
      const slot = chartW / total;
      const mapX = i => left + i*slot + slot/2;
      const mapY = p => top + ((lastYMax-p)/(lastYMax-lastYMin))*priceH;
      const evs = events();
      ctx.save();
      ctx.beginPath(); ctx.rect(left,top,chartW,priceH); ctx.clip();
      ctx.font = "10px Arial";
      ctx.textBaseline = "middle";
      evs.forEach(ev => {
        const x = xForTime(Number(ev.confirmedTime) || Number(ev.time),vis,mapX);
        const y = mapY(ev.price);
        if(x == null || !Number.isFinite(y) || x < left || x > left + chartW || y < top || y > top + priceH) return;
        const meta = markerLabelLab(ev);
        const text = s.labelMode === "icon" ? meta.icon : `${meta.icon} ${meta.text}`;
        const tw = ctx.measureText(text).width + 8;
        const bx = Math.max(left+2,Math.min(left+chartW-tw-2,x-tw/2));
        const by = Math.max(top+10,Math.min(top+priceH-10,y-18));
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.strokeStyle = ev.pairClass === "adjacent" ? "rgba(23,37,84,.65)" : "rgba(88,72,26,.72)";
        ctx.lineWidth = 1;
        ctx.fillRect(bx,by-8,tw,16);
        ctx.strokeRect(bx,by-8,tw,16);
        ctx.fillStyle = "#111";
        ctx.fillText(text,bx+4,by+1);
        if(Array.isArray(overlayHitItems)){
          overlayHitItems.push({
            kind:"maStackLabMarker",
            x1:bx,
            y1:by-8,
            x2:bx+tw,
            y2:by+8,
            x,
            y:by,
            lines:markerTooltipLab(ev)
          });
        }
      });
      ctx.restore();
      const hit = hoverLabMarker();
      if(hit && mouse && typeof tooltip === "function") tooltip(hit.lines,mouse.x,mouse.y);
    }
    function hoverLabMarker(){
      if(!mouse || !Array.isArray(overlayHitItems)) return null;
      for(let i=overlayHitItems.length-1;i>=0;i--){
        const it = overlayHitItems[i];
        if(it && it.kind === "maStackLabMarker" && mouse.x >= it.x1 && mouse.x <= it.x2 && mouse.y >= it.y1 && mouse.y <= it.y2) return it;
      }
      return null;
    }
    function installHover(){
      if(window.__maStackLabMarkerHoverInstalled) return;
      window.__maStackLabMarkerHoverInstalled = true;
      if(typeof hoverItem === "function"){
        const prevHover = hoverItem;
        hoverItem = window.hoverItem = function(){
          const hit = hoverLabMarker();
          if(hit) return hit;
          return prevHover.apply(this,arguments);
        };
      }
      if(typeof drawHoverTooltip === "function"){
        const prevTip = drawHoverTooltip;
        drawHoverTooltip = window.drawHoverTooltip = function(){
          const it = typeof hoverItem === "function" ? hoverItem() : null;
          if(it && it.kind === "maStackLabMarker" && mouse && Array.isArray(it.lines)){
            tooltip(it.lines,mouse.x,mouse.y);
            return;
          }
          return prevTip.apply(this,arguments);
        };
      }
    }
    function installSettings(){
      const grid = document.querySelector("#settingsModal .settings-grid");
      if(!grid) return;
      const tabs = grid.querySelector(":scope > .v24-settings-tabs");
      const panelsRoot = grid.querySelector(":scope > .v24-settings-panels");
      if(!tabs || !panelsRoot) return;
      if(!$id("maStackMarkersSettingsTab")){
        const btn=document.createElement("button");
        btn.type="button"; btn.id="maStackMarkersSettingsTab"; btn.className="v24-settings-tab"; btn.dataset.tab="ma-stack-markers"; btn.textContent="MAs Event Lab";
        tabs.appendChild(btn);
        btn.addEventListener("click",()=>activateSettings(),false);
      }else{
        $id("maStackMarkersSettingsTab").textContent = "MAs Event Lab";
      }
      if(!$id("maStackMarkersSettingsPanel")){
        const panel=document.createElement("div");
        panel.id="maStackMarkersSettingsPanel"; panel.className="v24-settings-panel"; panel.dataset.tab="ma-stack-markers";
        const inner=document.createElement("div"); inner.className="v24-settings-panel-grid";
        inner.innerHTML = settingsHtml();
        panel.appendChild(inner); panelsRoot.appendChild(panel);
      }else{
        const inner = $id("maStackMarkersSettingsPanel").querySelector(".v24-settings-panel-grid");
        if(inner && !inner.__maStackLabFocused) inner.innerHTML = settingsHtml();
      }
      bindSettings();
      installHover();
      if(get("last_tab","") === "1") activateSettings();
    }
    function activateSettings(){
      const root=document.querySelector("#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid");
      if(!root) return;
      root.querySelectorAll(".v24-settings-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab==="ma-stack-markers"));
      root.querySelectorAll(".v24-settings-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.tab==="ma-stack-markers"));
      set("last_tab","1");
    }
    function cb(id,label,checked){ return `<label class="ma-stack-marker-check"><input id="${id}" type="checkbox"${checked?" checked":""}>${label}</label>`; }
    function section(title,body){ return `<section class="ma-stack-marker-section"><h4>${title}</h4>${body}</section>`; }
    function selectOptions(values,current){
      return values.map(v => {
        const value = typeof v === "object" ? v.value : v;
        const label = typeof v === "object" ? v.label : v;
        return `<option value="${value}"${String(current)===String(value)?" selected":""}>${label}</option>`;
      }).join("");
    }
    function pairOptions(type,current){
      const periods = MA_STACK_STRIP.stackPeriods();
      const opts = [{value:"all",label:"All configured pairs"}];
      for(let i=0;i<periods.length-1;i++){
        for(let j=i+1;j<periods.length;j++){
          const ref = `EMA${periods[i]}/${periods[j]}`;
          const adjacent = j === i + 1;
          if(type === "deep" && adjacent) continue;
          opts.push({value:ref,label:adjacent ? `${periods[i]}/${periods[j]} adjacent` : `${periods[i]}/${periods[j]} deep/wide`});
        }
      }
      return selectOptions(opts,current);
    }
    function eventPanelHtml(type){
      const cfg = eventConfig(type.key);
      const outcomeOptions = selectOptions(OUTCOME_WINDOWS.map(v=>({value:String(v),label:`${v} candle${v===1?"":"s"}`})),String(cfg.outcome));
      const common = `
        <div class="ma-stack-lab-common">
          <label>MA pair<select id="maLab_${type.key}_pair">${pairOptions(type.key,cfg.pair)}</select></label>
          <label>Min Alignment x/5<input id="maLab_${type.key}_minAlignment" type="number" min="0" max="5" step="1" value="${cfg.minAlignment}"></label>
          <label>Min Strength %<input id="maLab_${type.key}_minStrength" type="number" min="0" max="100" step="1" value="${cfg.minStrength}"></label>
          <label>Min Quality %<input id="maLab_${type.key}_minQuality" type="number" min="0" max="100" step="1" value="${cfg.minQuality}"></label>
          <label>Confirmation candles<input id="maLab_${type.key}_confirm" type="number" min="0" max="20" step="1" value="${cfg.confirm}"></label>
          <label>Outcome window<select id="maLab_${type.key}_outcome">${outcomeOptions}</select></label>
        </div>`;
      let specific = "";
      if(type.key === "crossover") specific = `
        <label>Minimum post-cross separation<input id="maLab_crossover_separation" type="number" min="0" max="100" step="1" value="${eventSetting("crossover","separation","0")}"></label>
        <label>Minimum fast-MA slope after cross<input id="maLab_crossover_slope" type="number" min="0" max="100" step="1" value="${eventSetting("crossover","slope","0")}"></label>
        <label>Minimum spread expansion after cross<input id="maLab_crossover_expansion" type="number" min="0" max="100" step="1" value="${eventSetting("crossover","expansion","0")}"></label>
        <label>Max chop density<input id="maLab_crossover_chop" type="number" min="0" max="100" step="1" value="${eventSetting("crossover","chop","100")}"></label>`;
      else if(type.key === "failed") specific = `
        <label>Failure window candles<input id="maLab_failed_failureWindow" type="number" min="1" max="20" step="1" value="${eventSetting("failed","failureWindow","5")}"></label>
        <label>Failure type<select id="maLab_failed_failureType">${selectOptions([{value:"cross-back",label:"cross-back required"},{value:"no-expansion",label:"no expansion after cross"},{value:"rejection",label:"rejection back into prior side"}],cfg.failureType)}</select></label>
        <label>Minimum post-failure separation/expansion<input id="maLab_failed_expansion" type="number" min="0" max="100" step="1" value="${eventSetting("failed","expansion","0")}"></label>`;
      else if(type.key === "bounce") specific = `
        <label>Convergence lookback candles<input id="maLab_bounce_lookback" type="number" min="3" max="20" step="1" value="${eventSetting("bounce","lookback","5")}"></label>
        <label>Minimum contraction candles<input id="maLab_bounce_contract" type="number" min="1" max="10" step="1" value="${eventSetting("bounce","contract","2")}"></label>
        <label>Proximity strictness<select id="maLab_bounce_proximity">${selectOptions(["loose","normal","strict"],cfg.proximity)}</select></label>
        <label>Turn-away confirmation candles<input id="maLab_bounce_turnaway" type="number" min="1" max="10" step="1" value="${eventSetting("bounce","turnaway","2")}"></label>
        <label>Minimum spread re-expansion<input id="maLab_bounce_reexpand" type="number" min="0" max="100" step="1" value="${eventSetting("bounce","reexpand","0")}"></label>
        ${cb("maLab_bounce_requireSlope","Fast-MA slope turn-away required",cfg.requireSlope)}
        ${cb("maLab_bounce_requireDefense","Setup-defense required",cfg.requireDefense)}`;
      else if(type.key === "compression") specific = `
        <label>Pair/group selection<select id="maLab_compression_pairGroup">${pairOptions("compression",cfg.pair)}</select></label>
        <label>Compression lookback<input id="maLab_compression_lookback" type="number" min="3" max="50" step="1" value="${eventSetting("compression","lookback","12")}"></label>
        <label>Max normalized spread<input id="maLab_compression_maxSpread" type="number" min="0" max="100" step="1" value="${eventSetting("compression","maxSpread","15")}"></label>
        <label>Minimum contraction candles<input id="maLab_compression_contract" type="number" min="1" max="20" step="1" value="${eventSetting("compression","contract","3")}"></label>
        <label>Slope flatness threshold<input id="maLab_compression_flatness" type="number" min="0" max="100" step="1" value="${eventSetting("compression","flatness","20")}"></label>
        <label>Minimum compression duration<input id="maLab_compression_duration" type="number" min="1" max="50" step="1" value="${eventSetting("compression","duration","3")}"></label>`;
      else if(type.key === "release") specific = `
        ${cb("maLab_release_priorCompression","Prior compression required",eventOn("release","priorCompression",true))}
        <label>Minimum compression duration<input id="maLab_release_duration" type="number" min="1" max="50" step="1" value="${eventSetting("release","duration","3")}"></label>
        <label>Release confirmation candles<input id="maLab_release_releaseConfirm" type="number" min="1" max="20" step="1" value="${eventSetting("release","releaseConfirm","1")}"></label>
        <label>Minimum spread expansion<input id="maLab_release_expansion" type="number" min="0" max="100" step="1" value="${eventSetting("release","expansion","0")}"></label>
        <label>Fast-stack expansion weight<input id="maLab_release_fastWeight" type="number" min="0" max="100" step="1" value="${eventSetting("release","fastWeight","70")}"></label>
        <label>Full-stack expansion weight<input id="maLab_release_fullWeight" type="number" min="0" max="100" step="1" value="${eventSetting("release","fullWeight","30")}"></label>
        <label>Minimum slope acceleration<input id="maLab_release_accel" type="number" min="0" max="100" step="1" value="${eventSetting("release","accel","0")}"></label>
        <label>Alignment improvement required<select id="maLab_release_alignmentImprove">${selectOptions(["none","soft","strict"],eventSetting("release","alignmentImprove","soft"))}</select></label>`;
      else if(type.key === "transition") specific = `
        <label>Minimum Alignment change<input id="maLab_transition_alignmentChange" type="number" min="0" max="5" step="1" value="${eventSetting("transition","alignmentChange","1")}"></label>
        <label>Minimum Strength change<input id="maLab_transition_strengthChange" type="number" min="0" max="100" step="1" value="${eventSetting("transition","strengthChange","10")}"></label>
        <label>Minimum Quality change<input id="maLab_transition_qualityChange" type="number" min="0" max="100" step="1" value="${eventSetting("transition","qualityChange","10")}"></label>
        <label>Max flip-flop allowed<input id="maLab_transition_flipflop" type="number" min="0" max="20" step="1" value="${eventSetting("transition","flipflop","3")}"></label>
        <label>Transition direction<select id="maLab_transition_direction">${selectOptions(["bullish","bearish","either"],cfg.direction)}</select></label>
        ${cb("maLab_transition_requireAdjacent","Require adjacent-pair confirmation",cfg.requireAdjacent)}`;
      else if(type.key === "deep") specific = `
        <label>Non-adjacent pair<select id="maLab_deep_pairDeep">${pairOptions("deep",cfg.pair)}</select></label>
        <label>Stricter minimum Quality<input id="maLab_deep_strictQuality" type="number" min="0" max="100" step="1" value="${eventSetting("deep","strictQuality","70")}"></label>
        <label>Proximity strictness<select id="maLab_deep_proximity">${selectOptions(["loose","normal","strict"],cfg.proximity)}</select></label>
        <label>Turn-away confirmation candles<input id="maLab_deep_turnaway" type="number" min="1" max="10" step="1" value="${eventSetting("deep","turnaway","2")}"></label>
        <label>Minimum spread re-expansion<input id="maLab_deep_reexpand" type="number" min="0" max="100" step="1" value="${eventSetting("deep","reexpand","0")}"></label>
        <label>Context required<select id="maLab_deep_context">${selectOptions(["pullback defense","deep compression","cross risk","slow-base defense"],cfg.context)}</select></label>
        ${cb("maLab_deep_conflict","Must not conflict with state",cfg.conflict)}`;
      return `<details class="ma-stack-lab-event" open><summary>${type.label}</summary>${common}<div class="ma-stack-lab-specific">${specific}</div></details>`;
    }
    function settingsHtml(){
      const s=settings();
      return `<div class="settings-card ma-stack-marker-card ma-stack-lab-card">
        <div class="ma-stack-marker-sections">
          ${section("Marker Display",`
            <div class="ma-stack-marker-control">${cb("maStackMarkersShow","Marker display ON",s.show)}</div>
            <div class="ma-stack-marker-control"><label>Label mode<select id="maStackLabelMode"><option value="icon"${s.labelMode==="icon"?" selected":""}>Icon only</option><option value="label"${s.labelMode==="label"?" selected":""}>Icon + short label</option></select></label></div>
            <div class="ma-stack-marker-control"><label>Max markers on screen<select id="maStackMaxMarkers"><option value="10"${s.max==="10"?" selected":""}>10</option><option value="20"${s.max==="20"?" selected":""}>20</option><option value="40"${s.max==="40"?" selected":""}>40</option><option value="unlimited"${s.max==="unlimited"?" selected":""}>unlimited</option></select></label></div>
            <div class="ma-stack-marker-control">${cb("maStackGroupNearby","Group nearby events",s.group)}</div>
          `)}
          ${section("Lab Scope",`
            <div class="ma-stack-marker-control"><label>History range<select id="maStackLabRange"><option value="visible"${s.range==="visible"?" selected":""}>Visible chart</option><option value="last100"${s.range==="last100"?" selected":""}>Last 100 candles</option><option value="last300"${s.range==="last300"?" selected":""}>Last 300 candles</option><option value="loaded"${s.range==="loaded"?" selected":""}>Loaded history</option></select></label></div>
            <div class="ma-stack-marker-checkgrid ma-stack-marker-tfs">${TFs.map(tf=>cb("maStackTf_"+tf.interval,tf.key,s.tfs.has(tf.interval))).join("")}</div>
          `)}
          ${section("Event Types",`<div class="ma-stack-marker-checkgrid">${cb("maStackTypeCrossover","MA crossover",s.types.crossover)}${cb("maStackTypeFailed","Failed crossover",s.types.failed)}${cb("maStackTypeBounce","Bounce / no-cross",s.types.bounce)}${cb("maStackTypeCompression","Compression",s.types.compression)}${cb("maStackTypeRelease","Compression release",s.types.release)}${cb("maStackTypeTransition","Stack transition",s.types.transition)}${cb("maStackTypeDeepBounce","Deep/wide MA bounce",s.types.deepBounce)}${cb("maStackTypeDeepRisk","Deep/wide compression / cross risk",s.types.deepRisk)}</div>`)}
          ${section("Event Definition Panels",`<div class="ma-stack-lab-events">${EVENT_TYPES.map(eventPanelHtml).join("")}</div>`)}
        </div>
      </div>`;
    }
    function bind(id,key,normal){
      const el=$id(id); if(!el || el.__maStackMarkerBound) return;
      el.__maStackMarkerBound=true;
      const sync=()=>{
        const value = normal ? normal(el) : (el.type==="checkbox" ? (el.checked?"1":"0") : el.value);
        set(key,value);
        try{ draw(); }catch(_e){}
        try{ window.draw(); }catch(_e){}
      };
      el.addEventListener("input",sync,false); el.addEventListener("change",sync,false);
    }
    function bindEventControl(id,key,normal){
      const el=$id(id); if(!el || el.__maStackLabBound) return;
      el.__maStackLabBound=true;
      const sync=()=>{ set(key,normal ? normal(el) : (el.type==="checkbox" ? (el.checked?"1":"0") : el.value)); try{ window.draw(); }catch(_e){} };
      el.addEventListener("input",sync,false); el.addEventListener("change",sync,false);
    }
    function bindEventPanels(){
      EVENT_TYPES.forEach(type=>{
        const p = "event_"+type.key+"_";
        bindEventControl(`maLab_${type.key}_pair`,p+"pair",el=>el.value);
        bindEventControl(`maLab_${type.key}_minAlignment`,p+"min_alignment",el=>Math.max(0,Math.min(5,Math.round(num(el.value,2)))));
        bindEventControl(`maLab_${type.key}_minStrength`,p+"min_strength",el=>Math.max(0,Math.min(100,Math.round(num(el.value,50)))));
        bindEventControl(`maLab_${type.key}_minQuality`,p+"min_quality",el=>Math.max(0,Math.min(100,Math.round(num(el.value,60)))));
        bindEventControl(`maLab_${type.key}_confirm`,p+"confirm",el=>Math.max(0,Math.min(20,Math.round(num(el.value,1)))));
        bindEventControl(`maLab_${type.key}_outcome`,p+"outcome",el=>el.value);
      });
      [
        ["maLab_crossover_separation","event_crossover_separation"],["maLab_crossover_slope","event_crossover_slope"],["maLab_crossover_expansion","event_crossover_expansion"],["maLab_crossover_chop","event_crossover_chop"],
        ["maLab_failed_failureWindow","event_failed_failureWindow"],["maLab_failed_failureType","event_failed_failure_type"],["maLab_failed_expansion","event_failed_expansion"],
        ["maLab_bounce_lookback","event_bounce_lookback"],["maLab_bounce_contract","event_bounce_contract"],["maLab_bounce_proximity","event_bounce_proximity"],["maLab_bounce_turnaway","event_bounce_turnaway"],["maLab_bounce_reexpand","event_bounce_reexpand"],["maLab_bounce_requireSlope","event_bounce_require_slope"],["maLab_bounce_requireDefense","event_bounce_require_defense"],
        ["maLab_compression_pairGroup","event_compression_pair"],["maLab_compression_lookback","event_compression_lookback"],["maLab_compression_maxSpread","event_compression_maxSpread"],["maLab_compression_contract","event_compression_contract"],["maLab_compression_flatness","event_compression_flatness"],["maLab_compression_duration","event_compression_duration"],
        ["maLab_release_priorCompression","event_release_priorCompression"],["maLab_release_duration","event_release_duration"],["maLab_release_releaseConfirm","event_release_releaseConfirm"],["maLab_release_expansion","event_release_expansion"],["maLab_release_fastWeight","event_release_fastWeight"],["maLab_release_fullWeight","event_release_fullWeight"],["maLab_release_accel","event_release_accel"],["maLab_release_alignmentImprove","event_release_alignmentImprove"],
        ["maLab_transition_alignmentChange","event_transition_alignmentChange"],["maLab_transition_strengthChange","event_transition_strengthChange"],["maLab_transition_qualityChange","event_transition_qualityChange"],["maLab_transition_flipflop","event_transition_flipflop"],["maLab_transition_direction","event_transition_direction"],["maLab_transition_requireAdjacent","event_transition_require_adjacent"],
        ["maLab_deep_pairDeep","event_deep_pair"],["maLab_deep_strictQuality","event_deep_strictQuality"],["maLab_deep_proximity","event_deep_proximity"],["maLab_deep_turnaway","event_deep_turnaway"],["maLab_deep_reexpand","event_deep_reexpand"],["maLab_deep_context","event_deep_context"],["maLab_deep_conflict","event_deep_conflict"]
      ].forEach(([id,key])=>bindEventControl(id,key,el=>el.type==="checkbox"?(el.checked?"1":"0"):el.value));
    }
    function bindSettings(){
      bind("maStackMarkersShow","show");
      bind("maStackLabRange","range",el=>el.value);
      [["maStackTypeCrossover","type_crossover"],["maStackTypeFailed","type_failed"],["maStackTypeBounce","type_bounce"],["maStackTypeCompression","type_compression"],["maStackTypeRelease","type_release"],["maStackTypeTransition","type_transition"],["maStackTypeDeepBounce","type_deep_bounce"],["maStackTypeDeepRisk","type_deep_risk"],["maStackGroupNearby","group"]].forEach(x=>bind(x[0],x[1]));
      TFs.forEach(tf=>bind("maStackTf_"+tf.interval,"tf_"+tf.interval));
      bind("maStackMaxMarkers","max",el=>el.value);
      bind("maStackLabelMode","label",el=>el.value);
      bindEventPanels();
    }
    return {installSettings,draw,settings};
  })();
  window.MA_STACK_MARKERS = MA_STACK_MARKERS;

  function installAll(){
    installReloadReset();
    ensureMaToggles();
    rebuildMaSettings();
    MA_STACK_MARKERS.installSettings();
    installClosedLinksRow();
    updateFinalExTotals();
    MA_STACK_STRIP.start();
  }

  if(typeof draw === "function" && !window.__v33DrawWrapped){
    const prevDraw = draw;
    window.__v33DrawWrapped = true;
    draw = window.draw = function(){ const r = prevDraw.apply(this,arguments); updateFinalExTotals(); try{ MA_STACK_STRIP.refreshSoon(); }catch(_e){} try{ MA_STACK_MARKERS.draw(); }catch(_e){} return r; };
  }
  if(typeof openSettings === "function" && !window.__v33OpenSettingsWrapped){
    const prevOpenSettings = openSettings;
    window.__v33OpenSettingsWrapped = true;
    openSettings = window.openSettings = function(){ const r = prevOpenSettings.apply(this,arguments); setTimeout(installAll,0); setTimeout(()=>{rebuildMaSettings();MA_STACK_MARKERS.installSettings();installClosedLinksRow();},150); return r; };
  }
  ["market","interval"].forEach(id=>{ const el=$id(id); if(el && !el.__v33MaStackBound){ el.__v33MaStackBound=true; el.addEventListener("change",()=>MA_STACK_STRIP.refreshSoon(),false); } });

  installAll();
  setTimeout(installAll,100);
  setTimeout(installAll,700);
  window.addEventListener("load",()=>setTimeout(installAll,0),{once:true});
  window.Patch33CleanBase = {version:MODULE, install:installAll};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_33_CLEAN_BASE_MASTACK_FIX_R5_MA_VWAP_ISOLATION";
  const $id = id => document.getElementById(id);
  const STYLE = "btc_futures_chart_v13_05_";
  const WIDTH = "btc_futures_chart_v13_18_";
  const EXTRA = "btc_futures_chart_v13_32r1_";
  const CORE_PERIOD_KEYS = [null,"ema_period_1","ema_period_2","ema_period_3"];
  const STORE = (typeof window.STORE === "string" ? window.STORE : "btc_futures_chart_v12_");
  const defaults = {
    1:{period:9,color:"#ff7900",alpha:100,width:2,seriesName:"ema20",toggle:"tglEMA20",label:"lblEMA20",periodEl:"emaPeriod1"},
    2:{period:21,color:"#0000ff",alpha:100,width:2,seriesName:"ema50",toggle:"tglEMA50",label:"lblEMA50",periodEl:"emaPeriod2"},
    3:{period:55,color:"#d600a9",alpha:100,width:2,seriesName:"ema3",toggle:"tglEMA3",label:"lblEMA3",periodEl:"emaPeriod3"},
    4:{period:100,color:"#0b7a00",alpha:100,width:2,seriesName:"ema4",toggle:"tglEMA4",label:"lblEMA4"},
    5:{period:200,color:"#008c7a",alpha:100,width:2,seriesName:"ema5",toggle:"tglEMA5",label:"lblEMA5"},
    vwap:{color:"#6f6658",alpha:100,width:2,toggle:"tglVWAP"}
  };
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const num = (v,d=null) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const ls = (k,d) => { const v = localStorage.getItem(k); return v == null ? String(d) : v; };
  const set = (k,v) => localStorage.setItem(k,String(v));
  const corePeriodKey = n => STORE + CORE_PERIOD_KEYS[n];
  const periodKey = n => n <= 3 ? corePeriodKey(n) : EXTRA + "ma" + n + "Period";
  const colorKey = n => n <= 3 ? STYLE + "ema" + n + "_color" : EXTRA + "ma" + n + "Color";
  const alphaKey = n => n <= 3 ? STYLE + "ema" + n + "_alpha" : EXTRA + "ma" + n + "Alpha";
  const widthKey = n => n <= 3 ? WIDTH + "ema" + n + "_width" : EXTRA + "ma" + n + "Width";
  const vwapColorKey = () => STYLE + "vwap_color";
  const vwapAlphaKey = () => STYLE + "vwap_alpha";
  const vwapWidthKey = () => WIDTH + "vwap_width";
  function period(n){ return Math.max(1,Math.min(999,Math.round(num(ls(periodKey(n),defaults[n].period),defaults[n].period)))); }
  function color(n){ return ls(colorKey(n),defaults[n].color); }
  function alpha(n){ return clamp(num(ls(alphaKey(n),defaults[n].alpha),defaults[n].alpha),0,100); }
  function width(n){ return clamp(num(ls(widthKey(n),defaults[n].width),defaults[n].width),1,10); }
  function vwapColor(){ return ls(vwapColorKey(),defaults.vwap.color); }
  function vwapAlpha(){ return clamp(num(ls(vwapAlphaKey(),defaults.vwap.alpha),defaults.vwap.alpha),0,100); }
  function vwapWidth(){ return clamp(num(ls(vwapWidthKey(),defaults.vwap.width),defaults.vwap.width),1,10); }
  function rgba(hex,aPct){
    const a = clamp(num(aPct,100),0,100)/100;
    let h = String(hex||"#000000").replace("#","");
    if(h.length===3) h=h.split("").map(c=>c+c).join("");
    h=(h+"000000").slice(0,6);
    return `rgba(${parseInt(h.slice(0,2),16)||0},${parseInt(h.slice(2,4),16)||0},${parseInt(h.slice(4,6),16)||0},${a})`;
  }
  function strokeFor(n){ return rgba(color(n),alpha(n)); }
  function vwapStroke(){ return rgba(vwapColor(),vwapAlpha()); }
  function enabled(n){ const el=$id(defaults[n].toggle); return !!(el && el.checked); }
  function tooltipEnabled(n){
    const state = window.__maisoTooltipToggleState;
    if(state && typeof state[n] === "boolean") return state[n];
    return enabled(n);
  }
  function syncHiddenPeriodInputs(){
    [1,2,3].forEach(n=>{ const el=$id(defaults[n].periodEl); if(el) el.value = period(n); });
  }
  function updateLabels(){
    [1,2,3,4,5].forEach(n=>{ const l=$id(defaults[n].label); if(l) l.textContent = "EMA" + period(n); });
  }
  function ensureToggle(n){
    const box = document.querySelector(".indicator-toggles"); if(!box) return;
    const before = $id("tglVWAP") && $id("tglVWAP").closest("label");
    let el = $id(defaults[n].toggle);
    if(!el){
      const lab=document.createElement("label"); lab.className="toggle";
      lab.innerHTML = `<input id="${defaults[n].toggle}" type="checkbox"><span id="${defaults[n].label}">EMA${period(n)}</span>`;
      box.insertBefore(lab,before||null);
      el = $id(defaults[n].toggle);
    }
    // Remove duplicated same-ID toggles and stale listeners on MA4/MA5 by cloning only those dynamic controls.
    const all = Array.from(document.querySelectorAll("#" + defaults[n].toggle));
    all.slice(1).forEach(x=>{ const lab=x.closest("label"); if(lab) lab.remove(); else x.remove(); });
    if(n >= 4 && el && !el.__maisoClean){
      const checked = !!el.checked;
      const lab = el.closest("label");
      const cloneLab = lab ? lab.cloneNode(true) : null;
      if(cloneLab && lab.parentNode){
        lab.parentNode.replaceChild(cloneLab,lab);
        el = $id(defaults[n].toggle);
        if(el) el.checked = checked;
      }
    }
    el = $id(defaults[n].toggle);
    if(el && !el.__maisoClean){
      el.__maisoClean = true;
      el.addEventListener("change",()=>{ try{ if(typeof indicators==='function') indicators(); }catch(_e){} try{ draw(); }catch(_e){} },false);
    }
  }
  function ensureToggles(){ [4,5].forEach(ensureToggle); updateLabels(); }
  function computeEMA(src,p){ return typeof EMA === "function" ? EMA(src,p) : []; }
  function rebuildSeries(){
    try{
      syncHiddenPeriodInputs();
      window.ema20 = ema20 = computeEMA(candles,period(1));
      window.ema50 = ema50 = computeEMA(candles,period(2));
      window.ema3 = ema3 = computeEMA(candles,period(3));
      window.ema4 = computeEMA(candles,period(4));
      window.ema5 = computeEMA(candles,period(5));
      if(typeof VWAP === "function") window.vwap = vwap = VWAP(candles);
    }catch(e){ console.error(MODULE + " rebuildSeries failed", e); }
    updateLabels();
  }
  const prevIndicators = typeof indicators === "function" ? indicators : null;
  indicators = window.indicators = function(){
    if(prevIndicators) prevIndicators.apply(this,arguments);
    rebuildSeries();
  };
  function row(n){
    return `<div>EMA ${n}</div><div><input id="maisoMA${n}Period" type="number" min="1" max="999" step="1" value="${period(n)}"></div><input id="maisoMA${n}Color" type="color" value="${color(n)}"><input id="maisoMA${n}Alpha" type="range" min="0" max="100" step="1" value="${alpha(n)}"><input id="maisoMA${n}Width" type="range" min="1" max="10" step="0.5" value="${width(n)}">`;
  }
  function rebuildSettings(){
    const card=$id("patch8IndicatorCard"); if(!card) return;
    const desc=card.querySelector(".settings-card-desc"); if(desc) desc.textContent = "Each MA and VWAP is an independent chart element. They share this panel only.";
    let grid=card.querySelector(".patch8-indicator-grid");
    if(!grid){ grid=document.createElement("div"); card.appendChild(grid); }
    grid.className = "patch8-indicator-grid maiso-grid";
    grid.innerHTML = `<div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div><div class="patch8-head">Thickness</div>${[1,2,3,4,5].map(row).join("")}<div>VWAP</div><div><span style="color:var(--muted)">—</span></div><input id="maisoVWAPColor" type="color" value="${vwapColor()}"><input id="maisoVWAPAlpha" type="range" min="0" max="100" step="1" value="${vwapAlpha()}"><input id="maisoVWAPWidth" type="range" min="1" max="10" step="0.5" value="${vwapWidth()}">`;
    [1,2,3,4,5].forEach(n=>{
      const p=$id(`maisoMA${n}Period`), c=$id(`maisoMA${n}Color`), a=$id(`maisoMA${n}Alpha`), w=$id(`maisoMA${n}Width`);
      const syncPeriod=()=>{ set(periodKey(n), clamp(Math.round(num(p.value,defaults[n].period)),1,999)); syncHiddenPeriodInputs(); rebuildSeries(); try{ if(window.MA_STACK_STRIP) window.MA_STACK_STRIP.refreshSoon(); }catch(_e){} try{ draw(); }catch(_e){} };
      const syncColor=()=>{ set(colorKey(n), c.value); try{ draw(); }catch(_e){} };
      const syncAlpha=()=>{ set(alphaKey(n), clamp(num(a.value,defaults[n].alpha),0,100)); try{ draw(); }catch(_e){} };
      const syncWidth=()=>{ set(widthKey(n), clamp(num(w.value,defaults[n].width),1,10)); try{ draw(); }catch(_e){} };
      if(p){p.addEventListener("input",syncPeriod,false);p.addEventListener("change",syncPeriod,false);} if(c){c.addEventListener("input",syncColor,false);c.addEventListener("change",syncColor,false);} if(a){a.addEventListener("input",syncAlpha,false);a.addEventListener("change",syncAlpha,false);} if(w){w.addEventListener("input",syncWidth,false);w.addEventListener("change",syncWidth,false);} });
    [["maisoVWAPColor",vwapColorKey(),vwapColor],["maisoVWAPAlpha",vwapAlphaKey(),vwapAlpha],["maisoVWAPWidth",vwapWidthKey(),vwapWidth]].forEach(([id,key,normal])=>{ const el=$id(id); if(!el) return; const sync=()=>{ set(key, id.endsWith("Width")?clamp(num(el.value,2),1,10):id.endsWith("Alpha")?clamp(num(el.value,100),0,100):el.value); try{ draw(); }catch(_e){} }; el.addEventListener("input",sync,false); el.addEventListener("change",sync,false); });
  }
  function cleanDrawInd(points,vis,map,mapX,mapY,col,w){
    if(typeof indVisible !== "function" || !ctx) return;
    const pts = indVisible(points,vis); if(!pts || pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); let started=false;
    for(const p of pts){ const i=map.get(p.time); if(i===undefined) continue; const x=mapX(i), y=mapY(p.value); if(!started){ctx.moveTo(x,y); started=true;} else ctx.lineTo(x,y); }
    if(started) ctx.stroke(); ctx.restore();
  }
  function drawCleanExtra(vis,mapX,mapY,slot,clip){
    if(localStorage.getItem("btc_futures_chart_v13_21_indicators_visible") === "0") return;
    const im = typeof idxMap === "function" ? idxMap(vis) : new Map(vis.map((c,i)=>[c.time,i]));
    ctx.save(); ctx.beginPath(); ctx.rect(clip.left,clip.top,clip.width,clip.height); ctx.clip();
    if(enabled(4)) cleanDrawInd(window.ema4 || [],vis,im,mapX,mapY,strokeFor(4),width(4));
    if(enabled(5)) cleanDrawInd(window.ema5 || [],vis,im,mapX,mapY,strokeFor(5),width(5));
    ctx.restore();
  }
  const prevAutoY = typeof autoYRange === "function" ? autoYRange : null;
  autoYRange = window.autoYRange = function(vis){
    return candleOnlyYRange(vis);
  };
  const prevDraw = typeof draw === "function" ? draw : null;
  draw = window.draw = function(){
    const e4=$id("tglEMA4"), e5=$id("tglEMA5");
    const want4=!!(e4&&e4.checked), want5=!!(e5&&e5.checked);
    // Prevent older stacked MA wrappers from drawing MA4/MA5 with leaked styles.
    if(e4) e4.checked=false; if(e5) e5.checked=false;
    window.__maisoTooltipToggleState = {4:want4,5:want5};
    try{ if(prevDraw) prevDraw.apply(this,arguments); } finally {
      delete window.__maisoTooltipToggleState;
      if(e4) e4.checked=want4;
      if(e5) e5.checked=want5;
    }
    try{
      const r=range(); const vis=candles.slice(r.start,r.end); if(!vis || vis.length<2 || !(lastYMax>lastYMin)) return;
      const w=canvas.clientWidth,h=canvas.clientHeight,left=LEFT_PAD,right=RIGHT_AXIS,top=18,priceH=lastAreaH||Math.floor((h-48)*.78),chartW=w-left-right,total=Math.max(2,vis.length+(r.futureBars||0)),slot=chartW/total;
      const mapX=i=>left+i*slot+slot/2, mapY=p=>top+((lastYMax-p)/(lastYMax-lastYMin))*priceH;
      drawCleanExtra(vis,mapX,mapY,slot,{left,top,width:chartW,height:priceH});
    }catch(e){ console.error(MODULE + " draw clean extra failed", e); }
  };
  if(typeof openSettings === "function" && !window.__maisoOpenWrapped){
    const prevOpen = openSettings; window.__maisoOpenWrapped = true;
    openSettings = window.openSettings = function(){ const r=prevOpen.apply(this,arguments); setTimeout(rebuildSettings,0); setTimeout(rebuildSettings,150); setTimeout(rebuildSettings,500); return r; };
  }
  function install(){ ensureToggles(); syncHiddenPeriodInputs(); rebuildSeries(); rebuildSettings(); updateLabels(); try{ draw(); }catch(_e){} }
  window.MA_VWAP_ISOLATION_R5 = {version:MODULE,install,period,color,alpha,width,vwapColor,vwapAlpha,vwapWidth};
  install(); setTimeout(install,100); setTimeout(install,700); window.addEventListener("load",()=>setTimeout(install,0),{once:true});
})();

(() => {
  "use strict";
  const MODULE = "V13_CURSOR_TOOLTIP_MA_VALUE_COLOR_PLAIN";
  const STYLE = "btc_futures_chart_v13_05_";
  const EXTRA = "btc_futures_chart_v13_32r1_";
  const DEFAULT_COLORS = {
    1:"#ff7900",
    2:"#0000ff",
    3:"#d600a9",
    4:"#0b7a00",
    5:"#008c7a"
  };
  const toggles = {
    1:"tglEMA20",
    2:"tglEMA50",
    3:"tglEMA3",
    4:"tglEMA4",
    5:"tglEMA5"
  };
  const labels = {
    1:"lblEMA20",
    2:"lblEMA50",
    3:"lblEMA3",
    4:"lblEMA4",
    5:"lblEMA5"
  };
  const seriesNames = {
    1:"ema20",
    2:"ema50",
    3:"ema3",
    4:"ema4",
    5:"ema5"
  };
  const colorKey = n => n <= 3 ? STYLE + "ema" + n + "_color" : EXTRA + "ma" + n + "Color";
  const $id = id => document.getElementById(id);
  const stored = (key,def) => {
    try{
      const v = localStorage.getItem(key);
      return v == null ? def : v;
    }catch(_e){
      return def;
    }
  };
  const maColor = n => stored(colorKey(n),DEFAULT_COLORS[n]);
  const isOn = n => {
    if(window.__maisoTooltipToggleState && typeof window.__maisoTooltipToggleState[n] === "boolean"){
      return window.__maisoTooltipToggleState[n];
    }
    const el = $id(toggles[n]);
    return !!(el && el.checked);
  };
  const label = n => {
    const el = $id(labels[n]);
    return el && el.textContent ? el.textContent : "EMA" + n;
  };
  const series = n => {
    try{
      return window[seriesNames[n]];
    }catch(_e){
      return null;
    }
  };
  const valueAt = (arr,t) => {
    if(typeof valAt === "function") return valAt(arr,t);
    if(!Array.isArray(arr)) return null;
    for(let i=arr.length-1;i>=0;i--){
      if(Number(arr[i].time) <= Number(t)) return arr[i].value;
    }
    return null;
  };
  const fmtPrice = v => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "-";
  };
  const textOf = line => String(line && line.text != null ? line.text : line || "");
  const fontOf = () => "11px Arial";

  if(typeof candleTip !== "function") return;

  candleTip = window.candleTip = function(c){
    const lines = [
      {text:formatDateTime(c.time * 1000)},
      {text:"O : " + ip(c.open)},
      {text:"H : " + ip(c.high)},
      {text:"L : " + ip(c.low)},
      {text:"C : " + ip(c.close)},
      {text:"V : " + fv(c.volume)}
    ];

    [1,2,3,4,5].forEach(n => {
      try{
        if(isOn(n)){
          lines.push({
            text:label(n) + " : " + fmtPrice(valueAt(series(n),c.time)),
            color:maColor(n),
            bold:false
          });
        }
      }catch(_e){}
    });

    ctx.save();
    const pad = 7;
    const lh = 14;
    let tw = 0;
    for(const line of lines){
      ctx.font = fontOf(line);
      tw = Math.max(tw,ctx.measureText(textOf(line)).width);
    }
    tw += pad * 2;
    const th = lines.length * lh + pad * 2;
    const x = Math.max(8,canvas.clientWidth - RIGHT_AXIS - tw - 12);
    const y = 8;

    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.strokeStyle = "#d9dce1";
    ctx.fillRect(x,y,tw,th);
    ctx.strokeRect(x,y,tw,th);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    lines.forEach((line,i) => {
      ctx.font = fontOf(line);
      ctx.fillStyle = line.color || "#1e2329";
      ctx.fillText(textOf(line),x+pad,y+pad+i*lh);
    });
    ctx.restore();
  };

  window.V13_CURSOR_TOOLTIP_MA_VALUE_COLOR_PLAIN = {version:MODULE};
})();

(() => {
  "use strict";
  const MODULE = "V13_MANUAL_PRICE_LEVELS";
  const STORE = "btc_futures_chart_v13_price_levels_";
  const KEY_TEXT = STORE + "text";
  const KEY_COLOR = STORE + "color";
  const KEY_ALPHA = STORE + "alpha";
  const KEY_WIDTH = STORE + "width";
  const DEFAULT_COLOR = "#111827";
  const $id = id => document.getElementById(id);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const num = (v,d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const get = (key,def) => {
    try{
      const v = localStorage.getItem(key);
      return v == null ? def : v;
    }catch(_e){
      return def;
    }
  };
  const set = (key,value) => {
    try{ localStorage.setItem(key,String(value)); }catch(_e){}
  };
  function levelsText(){ return get(KEY_TEXT,""); }
  function color(){ return get(KEY_COLOR,DEFAULT_COLOR); }
  function alpha(){ return clamp(num(get(KEY_ALPHA,"85"),85),0,100); }
  function width(){ return clamp(num(get(KEY_WIDTH,"1.5"),1.5),0.5,10); }
  function rgba(hex,alphaPct){
    let h = String(hex || DEFAULT_COLOR).replace("#","");
    if(h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    h = (h + "000000").slice(0,6);
    const a = clamp(num(alphaPct,85),0,100) / 100;
    return `rgba(${parseInt(h.slice(0,2),16)||0},${parseInt(h.slice(2,4),16)||0},${parseInt(h.slice(4,6),16)||0},${a})`;
  }
  function escapeHtml(value){
    return String(value || "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    }[ch]));
  }
  function parseLevels(text=levelsText()){
    const seen = new Set();
    const out = [];
    const matches = String(text || "").match(/[-+]?\d[\d,]*(?:\.\d+)?/g) || [];
    for(const raw of matches){
      const value = Number(raw.replace(/,/g,""));
      if(!Number.isFinite(value) || value <= 0) continue;
      const key = String(value);
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out.sort((a,b) => b - a);
  }
  function setPriceLevelsTabActive(){
    const root = document.querySelector("#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid");
    if(!root) return;
    root.querySelectorAll(".v24-settings-tab").forEach(btn => btn.classList.toggle("active",btn.dataset.tab === "price-levels"));
    root.querySelectorAll(".v24-settings-panel").forEach(panel => panel.classList.toggle("active",panel.dataset.tab === "price-levels"));
    try{ localStorage.setItem("btc_futures_chart_v13_24_settings_tab","price-levels"); }catch(_e){}
  }
  function bindControl(id,key,normalizer){
    const el = $id(id);
    if(!el || el.__priceLevelsBound) return;
    el.__priceLevelsBound = true;
    const sync = () => {
      const value = normalizer ? normalizer(el.value) : el.value;
      if(normalizer) el.value = value;
      set(key,value);
      if(id === "priceLevelsAlpha"){
        const out = $id("priceLevelsAlphaVal");
        if(out) out.textContent = String(value);
      }
      if(id === "priceLevelsText"){
        return;
      }
      try{ draw(); }catch(_e){}
    };
    el.addEventListener("input",sync,false);
    el.addEventListener("change",sync,false);
  }
  function installSettings(){
    const grid = document.querySelector("#settingsModal .settings-grid");
    if(!grid) return;
    const tabs = grid.querySelector(":scope > .v24-settings-tabs");
    const panelsRoot = grid.querySelector(":scope > .v24-settings-panels");
    if(!tabs || !panelsRoot) return;

    if(!$id("priceLevelsSettingsTab")){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "priceLevelsSettingsTab";
      btn.className = "v24-settings-tab";
      btn.dataset.tab = "price-levels";
      btn.textContent = "Key levels";
      tabs.appendChild(btn);
      btn.addEventListener("click",setPriceLevelsTabActive,false);
    }else{
      $id("priceLevelsSettingsTab").textContent = "Key levels";
    }

    if(!$id("priceLevelsSettingsPanel")){
      const panel = document.createElement("div");
      panel.id = "priceLevelsSettingsPanel";
      panel.className = "v24-settings-panel";
      panel.dataset.tab = "price-levels";
      const inner = document.createElement("div");
      inner.className = "v24-settings-panel-grid";
      inner.innerHTML = `
        <div class="settings-card price-levels-card">
          <div class="settings-card-title">Key levels</div>
          <div class="settings-card-desc">One price per line, or paste any plain text containing prices.</div>
          <textarea id="priceLevelsText" spellcheck="false" placeholder="77000&#10;78500&#10;80125.5">${escapeHtml(levelsText())}</textarea>
          <div class="price-levels-style-row">
            <span>Levels</span>
            <input id="priceLevelsColor" type="color" value="${escapeHtml(color())}">
            <input id="priceLevelsAlpha" type="range" min="0" max="100" step="1" value="${alpha()}">
            <span id="priceLevelsAlphaVal">${alpha()}</span>
            <input id="priceLevelsWidth" type="range" min="0.5" max="10" step="0.5" value="${width()}">
          </div>
        </div>`;
      panel.appendChild(inner);
      panelsRoot.appendChild(panel);
    }
    const title = document.querySelector("#priceLevelsSettingsPanel .settings-card-title");
    if(title) title.textContent = "Key levels";

    bindControl("priceLevelsText",KEY_TEXT);
    bindControl("priceLevelsColor",KEY_COLOR);
    bindControl("priceLevelsAlpha",KEY_ALPHA,v => clamp(Math.round(num(v,85)),0,100));
    bindControl("priceLevelsWidth",KEY_WIDTH,v => clamp(num(v,1.5),0.5,10));
    try{
      if(localStorage.getItem("btc_futures_chart_v13_24_settings_tab") === "price-levels") setPriceLevelsTabActive();
    }catch(_e){}
  }
  function drawPriceLevels(){
    if(!ctx || !canvas || !Array.isArray(candles) || candles.length < 2) return;
    const levels = parseLevels();
    if(!levels.length || !(lastYMax > lastYMin)) return;
    const w = canvas.clientWidth;
    const left = typeof LEFT_PAD === "number" ? LEFT_PAD : 14;
    const right = typeof RIGHT_AXIS === "number" ? RIGHT_AXIS : 84;
    const top = 18;
    const priceH = lastAreaH || Math.floor((canvas.clientHeight - top - 30) * .78);
    const chartW = w - left - right;
    const mapY = price => top + ((lastYMax - price) / (lastYMax - lastYMin)) * priceH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left,top,chartW,priceH);
    ctx.clip();
    ctx.strokeStyle = rgba(color(),alpha());
    ctx.lineWidth = width();
    ctx.setLineDash([]);
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for(const level of levels){
      const y = mapY(level);
      if(y < top || y > top + priceH) continue;
      const yy = typeof px === "function" ? px(y) : y;
      ctx.beginPath();
      ctx.moveTo(typeof px === "function" ? px(left) : left,yy);
      ctx.lineTo(typeof px === "function" ? px(left + chartW) : left + chartW,yy);
      ctx.stroke();
      ctx.fillStyle = rgba(color(),Math.min(100,alpha() + 10));
      ctx.fillText(Math.round(level).toLocaleString("en-US"),left + chartW - 6,y - 7);
    }
    ctx.restore();
  }
  if(typeof autoYRange === "function" && !window.__priceLevelsAutoYWrapped){
    const prevAutoYRange = autoYRange;
    window.__priceLevelsAutoYWrapped = true;
    autoYRange = window.autoYRange = function(vis){
      return prevAutoYRange.apply(this,arguments);
    };
  }
  if(typeof draw === "function" && !window.__priceLevelsDrawWrapped){
    const prevDraw = draw;
    window.__priceLevelsDrawWrapped = true;
    draw = window.draw = function(){
      const result = prevDraw.apply(this,arguments);
      try{ drawPriceLevels(); }catch(e){ console.error(MODULE + " draw failed",e); }
      return result;
    };
  }
  if(typeof openSettings === "function" && !window.__priceLevelsOpenSettingsWrapped){
    const prevOpen = openSettings;
    window.__priceLevelsOpenSettingsWrapped = true;
    openSettings = window.openSettings = function(){
      const result = prevOpen.apply(this,arguments);
      setTimeout(installSettings,0);
      setTimeout(installSettings,150);
      return result;
    };
  }
  installSettings();
  setTimeout(installSettings,300);
  window.PRICE_LEVELS_OVERLAY = {version:MODULE,parseLevels,installSettings};
})();

(() => {
  "use strict";
  const MODULE = "V13_CANDLE_CLOSE_COUNTDOWN";
  let timer = null;

  function exchangeNow(){
    const ex = Number(window.__countdownExchangeMs);
    const local = Number(window.__countdownLocalMs);
    if(Number.isFinite(ex) && Number.isFinite(local)){
      return ex + (Date.now() - local);
    }
    return Date.now();
  }

  function isFeedLive(){
    const age = lastWs ? Date.now() - lastWs : Infinity;
    const limit = typeof STALE_MS === "number" ? Math.max(STALE_MS,5000) : 5000;
    return !!(lastWs && age <= limit);
  }

  function formatLeft(ms,tfSec){
    if(!Number.isFinite(ms) || ms < 0) ms = 0;
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = value => String(value).padStart(2,"0");
    if(tfSec >= 3600) return pad(h) + ":" + pad(m) + ":" + pad(s);
    return pad(m) + ":" + pad(s);
  }

  function countdownText(){
    if(!Array.isArray(candles) || !candles.length || typeof ivSec !== "function") return "--:--";
    const latest = candles[candles.length - 1];
    const tfSec = Number(ivSec());
    const openMs = Number(latest && latest.time) * 1000;
    if(!Number.isFinite(tfSec) || tfSec <= 0 || !Number.isFinite(openMs)) return "--:--";
    const closeMs = openMs + tfSec * 1000;
    return formatLeft(closeMs - exchangeNow(),tfSec);
  }

  function drawCountdown(){
    if(!ctx || !canvas || !Array.isArray(candles) || !candles.length || !(lastYMax > lastYMin)) return;
    const latest = candles[candles.length - 1];
    const price = Number(latest && latest.close);
    if(!Number.isFinite(price)) return;
    const right = typeof RIGHT_AXIS === "number" ? RIGHT_AXIS : 84;
    const top = 18;
    const priceH = lastAreaH || Math.floor((canvas.clientHeight - top - 30) * .78);
    const chartRight = canvas.clientWidth - right;
    const left = typeof LEFT_PAD === "number" ? LEFT_PAD : 14;
    const priceY = top + ((lastYMax - price) / (lastYMax - lastYMin)) * priceH;
    const priceText = typeof ip === "function" ? ip(price) : String(price);
    const timeText = countdownText();
    ctx.save();
    const padX = 6;
    const gap = 3;
    const priceFont = "11px Arial";
    const timerFont = "10px Arial";
    ctx.font = priceFont;
    const priceW = ctx.measureText(priceText).width;
    ctx.font = timerFont;
    const timerW = ctx.measureText(timeText).width;
    const boxW = Math.min(right - 8,Math.max(priceW,timerW) + padX * 2);
    const boxH = 29;
    const x = chartRight + Math.max(3,Math.floor((right - boxW) / 2));
    const centerY = priceY;
    const y = centerY - boxH / 2;
    const boxLeft = x;
    ctx.strokeStyle = "#8a8f98";
    ctx.lineWidth = typeof hairline === "function" ? hairline() : 1;
    ctx.setLineDash([5,5]);
    ctx.beginPath();
    ctx.moveTo(px(left),px(priceY));
    ctx.lineTo(px(boxLeft),px(priceY));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.fillRect(x,y,boxW,boxH);
    ctx.strokeRect(x,y,boxW,boxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = priceFont;
    ctx.fillStyle = "#111827";
    ctx.fillText(priceText,x + boxW / 2,y + 4);
    ctx.font = timerFont;
    ctx.fillStyle = "#374151";
    ctx.fillText(timeText,x + boxW / 2,y + 4 + 11 + gap);
    ctx.restore();
  }

  if(typeof draw === "function" && !window.__candleCountdownDrawWrapped){
    const prevDraw = draw;
    window.__candleCountdownDrawWrapped = true;
    draw = window.draw = function(){
      const result = prevDraw.apply(this,arguments);
      try{ drawCountdown(); }catch(e){ console.error(MODULE + " draw failed",e); }
      return result;
    };
  }

  function start(){
    if(timer) return;
    timer = setInterval(() => {
      try{ if(typeof draw === "function") draw(); }catch(_e){}
    },1000);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
  window.CANDLE_CLOSE_COUNTDOWN = {version:MODULE,countdownText};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_34_CLEAN_CONSOLIDATED_BASE_R1_PL_ISOLATE_AND_OVERLAY_FIX";
  function plHit(){
    try{
      if(!mouse || !Array.isArray(overlayHitItems)) return null;
      for(let i=overlayHitItems.length-1;i>=0;i--){
        const it = overlayHitItems[i];
        if(!it || it.kind !== "plbox") continue;
        if(typeof window.__v13Patch36IsClosedTradePlBox === "function" && !window.__v13Patch36IsClosedTradePlBox(it)) continue;
        if(mouse.x >= it.x1-3 && mouse.x <= it.x2+3 && mouse.y >= it.y1-3 && mouse.y <= it.y2+3) return it;
      }
    }catch(_e){}
    return null;
  }
  if(typeof hoverItem === "function" && !window.__v34r1PlIsolateHoverWrapped){
    window.__v34r1PlIsolateHoverWrapped = true;
    const prevHover = hoverItem;
    hoverItem = window.hoverItem = function(){
      if(window.__v34r1IsolateClickMode){
        const p = plHit();
        if(p && p.markerId) return {kind:"marker",markerId:p.markerId,x:p.x,y:p.y,letter:"EX",chainId:p.chainId,parentTradeId:p.parentTradeId};
        const h = prevHover.apply(this,arguments);
        // PATCH_36: open-position and broad overlay hits must not fall through to isolate paths.
        if(h && (h.kind === "marker" || h.kind === "box" || (h.kind === "line" && h.open) || h.kind === "maStackLabMarker")) return null;
        return h;
      }
      return prevHover.apply(this,arguments);
    };
  }
  if(typeof canvas !== "undefined" && canvas && !canvas.__v34r1PlIsolateClickBound){
    canvas.__v34r1PlIsolateClickBound = true;
    canvas.addEventListener("click",() => {
      window.__v34r1IsolateClickMode = true;
      setTimeout(() => { window.__v34r1IsolateClickMode = false; },0);
    },true);
  }
  window.V13_PATCH_34_R1 = {version:MODULE};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_34_CLEAN_CONSOLIDATED_BASE_R2_ISOLATE_AND_CLOSED_LINKS_FIX";

  /*
    R2 rules:
    - Position markers/icons must not trigger isolate mode.
    - Isolate mode is triggered only by P/L boxes (kind: plbox).
    - Closed trade link sliders must remain interactive; old v33 row passed normalizers
      that read localStorage instead of the current slider value, causing the thumb to snap back.
  */

  function setIsoClickMode(){
    window.__v34r1IsolateClickMode = true;
    window.__v34r2IsolateClickMode = true;
    setTimeout(() => {
      window.__v34r1IsolateClickMode = false;
      window.__v34r2IsolateClickMode = false;
    }, 0);
  }

  // Run before canvas target listeners, including older capture listeners bound directly on canvas.
  if(!window.__v34r2DocumentIsoGateBound){
    window.__v34r2DocumentIsoGateBound = true;
    document.addEventListener("click", setIsoClickMode, true);
    window.addEventListener("click", setIsoClickMode, true);
  }

  function plHitFromMouse(){
    try{
      if(typeof mouse === "undefined" || !mouse || !Array.isArray(overlayHitItems)) return null;
      for(let i = overlayHitItems.length - 1; i >= 0; i--){
        const it = overlayHitItems[i];
        if(!it || it.kind !== "plbox") continue;
        if(mouse.x >= it.x1 - 4 && mouse.x <= it.x2 + 4 && mouse.y >= it.y1 - 4 && mouse.y <= it.y2 + 4) return it;
      }
    }catch(_e){}
    return null;
  }

  // Final hover gate for isolate-click context. Older isolate click handlers call hoverItem().
  // During click mode, P/L boxes are mapped to their chain marker; actual marker hits are suppressed.
  if(typeof hoverItem === "function" && !window.__v34r2PlOnlyHoverWrapped){
    window.__v34r2PlOnlyHoverWrapped = true;
    const prevHover = hoverItem;
    hoverItem = window.hoverItem = function(){
      if(window.__v34r1IsolateClickMode || window.__v34r2IsolateClickMode){
        const p = plHitFromMouse();
        if(p && (p.markerId || p.chainId || p.parentTradeId)){
          return {
            kind: "marker",
            markerId: p.markerId,
            x: p.x,
            y: p.y,
            letter: "EX",
            chainId: p.chainId,
            parentTradeId: p.parentTradeId
          };
        }
        const h = prevHover.apply(this, arguments);
        if(h && h.kind === "marker") return null;
        return h;
      }
      return prevHover.apply(this, arguments);
    };
  }

  // Extra target-level safety: if a click is on a position marker/icon, block older marker-isolate handlers.
  // Do not block P/L box clicks.
  if(typeof canvas !== "undefined" && canvas && !canvas.__v34r2MarkerIsoBlocker){
    canvas.__v34r2MarkerIsoBlocker = true;
    canvas.addEventListener("click", function(e){
      try{
        const p = plHitFromMouse();
        if(p) return;
        const h = typeof hoverItem === "function" ? hoverItem() : null;
        if(h && h.kind === "marker"){
          e.stopImmediatePropagation();
        }
      }catch(_e){}
    }, true);
  }

  const WIDTH_KEY = "btc_futures_chart_v13_05_closed_width";
  const ALPHA_KEY = "btc_futures_chart_v13_19_closed_alpha";

  function clampNum(v, min, max, fallback){
    const n = Number(v);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function syncClosedSlider(el){
    if(!el || !el.id) return;
    if(el.id === "v33ClosedWidth" || el.id === "patch19ClosedWidth" || el.id === "patch5ClosedWidth"){
      const v = clampNum(el.value, 1, 10, 1);
      localStorage.setItem(WIDTH_KEY, String(v));
      ["v33ClosedWidth","patch19ClosedWidth","patch5ClosedWidth"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedWidthVal","patch19ClosedWidthVal","patch5ClosedWidthVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
      return;
    }
    if(el.id === "v33ClosedAlpha" || el.id === "patch19ClosedAlpha"){
      const v = clampNum(el.value, 0, 100, 100);
      localStorage.setItem(ALPHA_KEY, String(v));
      ["v33ClosedAlpha","patch19ClosedAlpha"].forEach(id => {
        const x = document.getElementById(id);
        if(x && x !== el) x.value = String(v);
      });
      ["v33ClosedAlphaVal","patch19ClosedAlphaVal"].forEach(id => {
        const out = document.getElementById(id);
        if(out) out.textContent = String(v);
      });
    }
  }

  // Capture phase runs before older buggy bubble listeners so they consume the fresh slider value.
  if(!window.__v34r2ClosedSliderCaptureBound){
    window.__v34r2ClosedSliderCaptureBound = true;
    document.addEventListener("input", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
    document.addEventListener("change", e => {
      const el = e.target;
      if(el && ["v33ClosedWidth","v33ClosedAlpha","patch19ClosedWidth","patch19ClosedAlpha","patch5ClosedWidth"].includes(el.id)){
        syncClosedSlider(el);
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
  }

  window.V13_PATCH_34_R2 = {version: MODULE};
})();

(() => {
  "use strict";
  const MODULE = "V13_UI_V2_PATCH_36_ISOLATE_AUDIT_STRICT_PL_ONLY";

  /*
    PATCH_36 final owner:
    - one active isolate state lives here;
    - activation is accepted only from current closed-trade P/L label hit boxes;
    - older marker/hover/canvas isolate paths are bypassed by the document capture gate.
  */

  window.__v13Patch36StrictPlOnly = true;

  const isolate36 = {
    active:false,
    markerIds:new Set(),
    closedLinkIds:new Set(),
    chainIds:new Set(),
    markerId:null,
    parentTradeId:null,
    chainId:null,
    lastHit:null
  };

  function cid36(o){
    return o && (o.parentTradeId || o.chainId || o.tradeChainId || null);
  }

  function marker36(id){
    return (Array.isArray(fillMarkers) ? fillMarkers.find(m => m && m.id === id) : null) || null;
  }

  function resetTransientFlags36(){
    window.__v34r1IsolateClickMode = false;
    window.__v34r2IsolateClickMode = false;
    window.__v13Patch36LastPlHit = null;
    window.__v13Patch36HoverIsoTarget = null;
    window.__v13Patch36ArmedIsoTarget = null;
    window.__v13Patch36StrictClickMode = false;
  }

  function openChainHas36(id){
    return !!(id && Array.isArray(openLotLinks) && openLotLinks.some(l => cid36(l) === id));
  }

  function isClosedTradePlLabel36(it){
    try{
      if(!it || it.kind !== "plbox" || !it.markerId) return false;
      if(Array.isArray(overlayHitItems) && !overlayHitItems.includes(it)) return false;
      if(typeof tglResults !== "undefined" && tglResults && !tglResults.checked) return false;
      const m = marker36(it.markerId);
      if(!m || m.role !== "close" || m.unresolved) return false;
      const id = cid36(it) || cid36(m);
      if(openChainHas36(id)) return false;
      return true;
    }catch(_e){
      return false;
    }
  }

  function plLabelHitAt36(x,y){
    if(!Array.isArray(overlayHitItems)) return null;
    for(let i = overlayHitItems.length - 1; i >= 0; i--){
      const it = overlayHitItems[i];
      if(!isClosedTradePlLabel36(it)) continue;
      if(x >= it.x1 - 4 && x <= it.x2 + 4 && y >= it.y1 - 4 && y <= it.y2 + 4) return it;
    }
    return null;
  }

  function buildChain36(markerId,chainHint){
    const markerIds = new Set();
    const closedLinkIds = new Set();
    const chainIds = new Set();
    const m = marker36(markerId);
    const hinted = chainHint || cid36(m);
    if(hinted) chainIds.add(hinted);

    if(chainIds.size){
      (fillMarkers || []).forEach(x => { if(chainIds.has(cid36(x))) markerIds.add(x.id); });
      (resultLinks || []).forEach(l => {
        if(chainIds.has(cid36(l))){
          closedLinkIds.add(l.id);
          if(l.entryMarkerId) markerIds.add(l.entryMarkerId);
          if(l.exitMarkerId) markerIds.add(l.exitMarkerId);
        }
      });
    }else if(markerId){
      markerIds.add(markerId);
      let changed = true;
      while(changed){
        changed = false;
        (resultLinks || []).forEach(l => {
          if(markerIds.has(l.entryMarkerId) || markerIds.has(l.exitMarkerId)){
            if(!closedLinkIds.has(l.id)){ closedLinkIds.add(l.id); changed = true; }
            if(l.entryMarkerId && !markerIds.has(l.entryMarkerId)){ markerIds.add(l.entryMarkerId); changed = true; }
            if(l.exitMarkerId && !markerIds.has(l.exitMarkerId)){ markerIds.add(l.exitMarkerId); changed = true; }
            const lid = cid36(l);
            if(lid) chainIds.add(lid);
          }
        });
      }
    }
    return {markerIds,closedLinkIds,chainIds};
  }

  function setVisibilityApi36(){
    window.isIsolateActive = () => isolate36.active;
    window.isMarkerVisibleInIsolate = id => !isolate36.active || isolate36.markerIds.has(id);
    window.isClosedLinkVisibleInIsolate = l => !isolate36.active || isolate36.closedLinkIds.has(l && l.id) || isolate36.chainIds.has(cid36(l));
    window.isOpenLinkVisibleInIsolate = () => true;
    window.isOpenBoxVisibleInIsolate = () => true;
  }

  function clearIsolateState36(options={}){
    isolate36.active = false;
    isolate36.markerIds = new Set();
    isolate36.closedLinkIds = new Set();
    isolate36.chainIds = new Set();
    isolate36.markerId = null;
    isolate36.parentTradeId = null;
    isolate36.chainId = null;
    isolate36.lastHit = null;
    resetTransientFlags36();
    if(options.clearTargets && Array.isArray(overlayHitItems)){
      overlayHitItems = overlayHitItems.filter(it => !it || it.kind !== "plbox");
    }
    setVisibilityApi36();
    if(options.redraw !== false){
      try{ if(typeof draw === "function") draw(); }catch(_e){}
    }
  }

  function activateIsolateFromPlLabel36(hit){
    if(!isClosedTradePlLabel36(hit)) return false;
    const m = marker36(hit.markerId);
    if(!m) return false;
    const chainId = cid36(hit) || cid36(m);
    // PATCH_36B: closed-trade P/L labels toggle by stable parent/chain id.
    if(isolate36.active && chainId && (isolate36.parentTradeId === chainId || isolate36.chainId === chainId || isolate36.chainIds.has(chainId))){
      clearIsolateState36({redraw:true,clearTargets:false});
      return true;
    }
    const chain = buildChain36(hit.markerId,chainId);
    isolate36.active = true;
    isolate36.markerIds = chain.markerIds;
    isolate36.closedLinkIds = chain.closedLinkIds;
    isolate36.chainIds = chain.chainIds;
    isolate36.markerId = hit.markerId;
    isolate36.parentTradeId = chainId || null;
    isolate36.chainId = chainId || null;
    isolate36.lastHit = null;
    resetTransientFlags36();
    setVisibilityApi36();
    try{ if(typeof draw === "function") draw(); }catch(_e){}
    return true;
  }

  function canvasPoint36(e){
    if(typeof canvas === "undefined" || !canvas) return null;
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    if(e.target !== canvas && !path.includes(canvas)) return null;
    const r = canvas.getBoundingClientRect();
    return {x:e.clientX - r.left,y:e.clientY - r.top};
  }

  function focusIsolate36(){
    if(!isolate36.active || !Array.isArray(candles) || !candles.length) return;
    const times = [];
    (fillMarkers || []).forEach(m => { if(isolate36.markerIds.has(m.id) && Number.isFinite(Number(m.time))) times.push(Number(m.time)); });
    (resultLinks || []).forEach(l => {
      if(isolate36.closedLinkIds.has(l.id)){
        if(Number.isFinite(Number(l.entryTime))) times.push(Number(l.entryTime));
        if(Number.isFinite(Number(l.exitTime))) times.push(Number(l.exitTime));
      }
    });
    if(!times.length) return;
    const mid = (Math.min(...times) + Math.max(...times)) / 2;
    let idx = 0, best = Infinity;
    for(let i=0;i<candles.length;i++){
      const d = Math.abs(Number(candles[i].time) - mid);
      if(d < best){ best = d; idx = i; }
    }
    if(typeof clamp === "function"){
      visibleCount = clamp(visibleCount || DEF_VISIBLE, Math.min(MIN_VISIBLE,candles.length), Math.max(1,candles.length));
    }
    const desiredEnd = Math.min(candles.length, Math.max(visibleCount, idx + Math.floor(visibleCount/2)));
    rightOffset = candles.length - desiredEnd;
    try{ if(typeof clampView === "function") clampView(); }catch(_e){}
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  }

  window.clearIsolateState = clearIsolateState36;
  window.__v34ClearIsolateState = clearIsolateState36;
  window.activateIsolateFromPlLabel = activateIsolateFromPlLabel36;
  window.__v13Patch36IsClosedTradePlBox = isClosedTradePlLabel36;
  setVisibilityApi36();
  clearIsolateState36({redraw:false,clearTargets:false});

  if(typeof document !== "undefined" && !window.__v13Patch36StrictDocClickBound){
    window.__v13Patch36StrictDocClickBound = true;
    document.addEventListener("click", e => {
      const pt = canvasPoint36(e);
      if(!pt) return;
      mouse = {x:pt.x,y:pt.y};
      window.__v13Patch36StrictClickMode = true;
      setTimeout(() => { window.__v13Patch36StrictClickMode = false; },0);
      const hit = plLabelHitAt36(pt.x,pt.y);
      if(hit){
        e.preventDefault();
        e.stopImmediatePropagation();
        activateIsolateFromPlLabel36(hit);
        return;
      }
      e.stopImmediatePropagation();
    }, true);
  }

  if(typeof document !== "undefined" && !window.__v13Patch36StrictKeyBound){
    window.__v13Patch36StrictKeyBound = true;
    document.addEventListener("keydown", e => {
      if(e.code !== "Space" || !isolate36.active) return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if(tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      focusIsolate36();
    }, true);
  }

  if(typeof tglResults !== "undefined" && tglResults && !tglResults.__patch36StrictResetBound){
    tglResults.__patch36StrictResetBound = true;
    tglResults.addEventListener("change", () => {
      clearIsolateState36({redraw:!tglResults.checked,clearTargets:true});
      if(tglResults.checked){
        try{ if(typeof draw === "function") draw(); }catch(_e){}
      }
    }, true);
  }

  window.V13_PATCH_36_STRICT_PL_ONLY = {version:MODULE,clearIsolateState:clearIsolateState36,activateIsolateFromPlLabel:activateIsolateFromPlLabel36};
})();

(() => {
  'use strict';
  const MODULE='R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3';
  const STORE='btc_futures_chart_r13_sssc_proto_v1_';
  const TFS=[['1D','1d',SSSC_TARGET_CLOSED_CANDLES],['4H','4h',SSSC_TARGET_CLOSED_CANDLES],['1H','1h',SSSC_TARGET_CLOSED_CANDLES],['15M','15m',SSSC_TARGET_CLOSED_CANDLES],['5M','5m',SSSC_TARGET_CLOSED_CANDLES],['3M','3m',SSSC_TARGET_CLOSED_CANDLES],['1M','1m',SSSC_TARGET_CLOSED_CANDLES]];
  const LIVE_DIAG_TFS=new Set(['15m','5m','3m','1m']);
  const PERIODS=[9,21,55,100,200];
  const PAIRS=[[9,21],[21,55],[55,100],[100,200]];
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  let visible=false, calcTimer=null, drag=null;
  let data={}, lastFullFetch=0, lastRender=0, currentSymbol='';
  let previousMomentumByTf={}, lastRenderedMomentumByTf={}, previousScoreValueByTf={}, lastRenderedScoreByTf={}, pendingScoreRollByTf={}, previousTopValues={};
  function hub(){ return window.PUBLIC_MARKET_DATA_HUB || null; }

  function sym(){ try{return cfg().symbol}catch(_e){return (document.getElementById('market')?.value||'BTCUSDC').toUpperCase()} }
  function fmt(v,d=0){ const n=num(v); return n==null?'-':n.toFixed(d); }
  function avg(list,key){ const xs=list.map(x=>x&&x[key]).filter(x=>Number.isFinite(x)); return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
  function clsSigned(v,blue=false){ if(v>20)return blue?'sssc-ui-blue':'sssc-ui-green'; if(v<-20)return 'sssc-ui-red'; return 'sssc-ui-gray'; }
  function signed(v){ const n=Math.round(num(v)||0); return (n>0?'+':'')+n; }
  function dirLabel(v){ if(v>55)return 'BULLISH'; if(v>18)return 'MIXED BULLISH'; if(v<-55)return 'BEARISH'; if(v<-18)return 'MIXED BEARISH'; return 'MIXED'; }
  function dirColorClass(v){ if(v>18)return 'sssc-ui-blue'; if(v<-18)return 'sssc-ui-red'; return 'sssc-ui-gray'; }
  function strengthClass(v){ const a=Math.abs(Number(v)||0); if(a>=75)return 'sssc-ui-green'; if(a>=50)return 'sssc-ui-blue'; if(a>=25)return 'sssc-ui-amber'; return 'sssc-ui-gray'; }
  function scoreClass(v){ const a=Math.abs(Number(v)||0); if(a>=70)return 'sssc-ui-green'; if(a>=45)return 'sssc-ui-blue'; if(a>=25)return 'sssc-ui-amber'; return 'sssc-ui-gray'; }
  function phaseClass(text){ const s=String(text||'').toLowerCase(); if(s.includes('compression')||s.includes('chop'))return 'sssc-phase-compression'; if(s.includes('trend')||s.includes('markup')||s.includes('markdown'))return 'sssc-phase-trend'; if(s.includes('transition')||s.includes('retest')||s.includes('pullback'))return 'sssc-phase-transition'; if(s.includes('fading')||s.includes('exhaust'))return 'sssc-phase-fading'; return 'sssc-phase-neutral'; }
  function actionComment(act){ const a=String(act||'').toUpperCase(); if(a.includes('EXIT'))return 'Exit condition triggered by SSSC state'; if(a.includes('TRIM'))return 'Reduce exposure; SSSC risk is rising'; if(a.includes('ADD')||a.includes('SNOWBALL'))return 'Add only if execution confirms'; if(a.includes('FRESH'))return 'Fresh entry is technically valid'; if(a.includes('HOLD'))return 'Hold; no invalidation from SSSC'; return 'Wait; no clean trigger yet'; }
  function parseKline(k){return {time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],baseVolume:+k[5],quoteVolume:+k[7]}}
  function ema(rows,p){ const out=[]; if(!rows||rows.length<p)return out; const a=2/(p+1); let cur=rows.slice(0,p).reduce((s,c)=>s+c.close,0)/p; out.push({time:rows[p-1].time,value:cur}); for(let i=p;i<rows.length;i++){cur=rows[i].close*a+cur*(1-a);out.push({time:rows[i].time,value:cur})} return out; }
  function vwapCalc(rows){ let q=0,b=0; for(const c of rows){ const bv=num(c.baseVolume??c.volume); const qv=num(c.quoteVolume); if(qv!=null&&bv!=null&&bv>0){q+=qv;b+=bv;} } return b>0?q/b:null; }
  function last(arr){return arr&&arr.length?arr[arr.length-1].value:null}
  function prev(arr,n=8){return arr&&arr.length>n?arr[arr.length-1-n].value:null}
  function stackDirection(vals){ let bull=0,bear=0; for(let i=0;i<vals.length-1;i++){ if(vals[i]>vals[i+1])bull++; else if(vals[i]<vals[i+1])bear++; } return (bull-bear)/4*100; }
  function stackClean(vals,price){ const spreads=[]; for(let i=0;i<vals.length-1;i++)spreads.push(Math.abs(vals[i]-vals[i+1])/(price||vals[i])*10000); return clamp(spreads.reduce((a,b)=>a+b,0)/Math.max(1,spreads.length)*7,0,100); }
  function slopeScore(series,price){ const a=last(series), b=prev(series,8); if(a==null||b==null||!price)return 0; return clamp(((a-b)/price)*10000*7,-100,100); }
  function slopePower(series,price){ const a=last(series), b=prev(series,8), c=prev(series,16); if(a==null||b==null||c==null||!price)return 0; const recent=Math.abs((a-b)/price); const prior=Math.abs((b-c)/price); return clamp((recent-prior)*100000,-100,100); }
  function spreadDir(vals,price){ let s=0; PAIRS.forEach(([f,sl])=>{const a=vals[PERIODS.indexOf(f)],b=vals[PERIODS.indexOf(sl)]; if(a&&b&&price){const d=(a-b)/price*10000; s+=clamp(d*8,-100,100)}}); return clamp(s/PAIRS.length,-100,100); }
  function spreadPower(emas,price){ let sum=0,cnt=0; PAIRS.forEach(([f,sl])=>{const A=emas[f],B=emas[sl]; const a=last(A),b=last(B),ap=prev(A,8),bp=prev(B,8); if([a,b,ap,bp,price].every(x=>x!=null)){const now=Math.abs(a-b)/price;const old=Math.abs(ap-bp)/price;sum+=clamp((now-old)*100000,-100,100);cnt++;}}); return cnt?sum/cnt:0; }
  function crossState(fast,slow){ const len=Math.min(fast.length,slow.length); if(len<3)return {label:'None',age:null,dir:0,quality:0,forming:false}; const fa=fast[fast.length-1].value, sa=slow[slow.length-1].value, fp=fast[fast.length-2].value, sp=slow[slow.length-2].value; const dist=(fa-sa); let lastCross=null; for(let i=1;i<len;i++){const a0=fast[fast.length-len+i-1].value-slow[slow.length-len+i-1].value; const a1=fast[fast.length-len+i].value-slow[slow.length-len+i].value; if(a0<=0&&a1>0)lastCross={age:len-i-1,dir:1}; if(a0>=0&&a1<0)lastCross={age:len-i-1,dir:-1};} if(fp<=sp&&fa>sa)return {label:'Bull X Fresh',age:0,dir:1,quality:85}; if(fp>=sp&&fa<sa)return {label:'Bear X Fresh',age:0,dir:-1,quality:85}; if(Math.abs(dist/((sa||1)))<0.00035)return {label:(dist>=0?'Bull':'Bear')+' forming',age:null,dir:dist>=0?1:-1,quality:35,forming:true}; if(lastCross){const stale=lastCross.age>24;return {label:(lastCross.dir>0?'Bull X ':'Bear X ')+(stale?'Old':'Confirmed'),age:lastCross.age,dir:lastCross.dir,quality:stale?25:60};} return {label:'None',age:null,dir:0,quality:0}; }
  function eventForLevel(price,emaVal,dir){ if(price==null||emaVal==null)return 'n/a'; const d=(price-emaVal)/price*10000; if(Math.abs(d)<8)return 'Retest'; if(dir>=0&&price>emaVal)return 'Hold'; if(dir<0&&price<emaVal)return 'Reject'; return dir>=0?'Loss':'Reclaim'; }
  function clusterState(vals,price){ const spread=(Math.max(...vals)-Math.min(...vals))/(price||vals[0])*10000; if(spread<18)return 'Chop'; if(spread<42)return 'Compressing'; return 'Expanded'; }
  function diagnose(label,tf,rows){ if(!rows||!rows.length)return {tf:label,interval:tf,available:false,reason:'Unavailable'}; if(rows.length<SSSC_MIN_CLOSED_CANDLES)return {tf:label,interval:tf,available:false,reason:'warmup-limited',rows:rows.length,reliability:'insufficient-warmup',warmupLimited:true}; const price=rows[rows.length-1].close; const emas={}; PERIODS.forEach(p=>emas[p]=ema(rows,p)); const vals=PERIODS.map(p=>last(emas[p])); if(vals.some(v=>v==null))return {tf:label,interval:tf,available:false,reason:'warmup-limited',rows:rows.length,reliability:'insufficient-warmup',warmupLimited:true}; const stackDir=stackDirection(vals); const clean=stackClean(vals,price); const slopeDir=0.45*slopeScore(emas[21],price)+0.35*slopeScore(emas[55],price)+0.20*slopeScore(emas[100],price); const sprDir=spreadDir(vals,price); const c921=crossState(emas[9],emas[21]); const c2155=crossState(emas[21],emas[55]); const c55100=crossState(emas[55],emas[100]); const c100200=crossState(emas[100],emas[200]); const direction=clamp(stackDir*0.44+slopeDir*0.30+sprDir*0.20+c921.dir*6,-100,100); const slopePow=0.55*slopePower(emas[21],price)+0.30*slopePower(emas[55],price)+0.15*slopePower(emas[100],price); const sprPow=spreadPower(emas,price); const magnitude=clamp(slopePow*0.52+sprPow*0.42+(clean<20?-18:0),-100,100); const state=direction>55?'Bullish':direction>18?'Mixed Bullish':direction<-55?'Bearish':direction<-18?'Mixed Bearish':'Mixed'; const phase=clean<18?'Compression / Chop': magnitude>35?(direction>=0?'Bullish Markup / Trend':'Bearish Transition'):magnitude<-25?(direction>=0?'Bullish Fading':'Bearish Fading'):Math.abs(direction)<25?'Compression / Chop':'Pullback / Retest'; const magState=magnitude>35?'Expanding':magnitude>10?'Strengthening':magnitude<-35?'Fading':magnitude<-10?'Weakening':'Neutral'; const vw=vwapCalc(rows); const vwapEvent=vw==null?'Unavailable':price>vw?(direction>=0?'Hold':'Reclaim'):(direction>=0?'Loss':'Below'); const events={x921:c921.label,x2155:c2155.label,x55100:c55100.label,x100200:c100200.label,ema9:eventForLevel(price,vals[0],direction),ema21:eventForLevel(price,vals[1],direction),ema55:eventForLevel(price,vals[2],direction),vwap:vwapEvent,cluster:clusterState(vals,price),earlyWarning:'None'}; return {tf:label,interval:tf,available:true,rows:rows.length,price,vwap:vw,emas,emaVals:vals,direction,magnitude,state,phase,magState,stackDir,clean,slopeDir,sprDir,slopePow,sprPow,crosses:{c921,c2155,c55100,c100200},events,earlyWarning:null,reliability:rows.length>=SSSC_TARGET_CLOSED_CANDLES?'full-warmup':'minimum-warmup',warmupLimited:false}; }
  function deriveEarlyWarning(label,tf,closedRows,formingRow,confirmed){ if(!formingRow||!confirmed||!confirmed.available||!closedRows||!closedRows.length) return null; const trialRows=closedRows.concat([{...formingRow}]); const trial=diagnose(label,tf,trialRows); if(!trial||!trial.available) return null; const hints=[]; if(trial.crosses.c921.forming||trial.crosses.c2155.forming||trial.crosses.c55100.forming||trial.crosses.c100200.forming) hints.push('Unconfirmed cross forming'); if(trial.events.vwap!==confirmed.events.vwap) hints.push('Unconfirmed VWAP '+trial.events.vwap); if(trial.clean>=18&&confirmed.clean<18) hints.push('Unconfirmed compression break'); if(trial.phase!==confirmed.phase) hints.push('Unconfirmed '+trial.phase); if(trial.magnitude<confirmed.magnitude-10) hints.push('Unconfirmed momentum weakening'); if(!hints.length&&Math.sign(trial.direction)!==Math.sign(confirmed.direction)) hints.push('Unconfirmed transition'); if(!hints.length) return null; return {label:hints[0],trial}; }
  function liveRows(closedRows,formingRow){ if(!Array.isArray(closedRows)||!closedRows.length) return []; if(!formingRow||!Number.isFinite(Number(formingRow.time))) return closedRows.slice(); const out=closedRows.slice(); const last=out[out.length-1]; if(last&&Number(formingRow.time)<=Number(last.time)) return out; out.push({...formingRow}); return out; }
  function buildDiagnosticSet(label,tf,count,h){ const closedRows=(h?h.getClosedBuffer(tf):[]).slice(-Math.max(count,SSSC_MIN_CLOSED_CANDLES)); if(!closedRows.length) return null; const forming=h?h.getFormingCandle(tf):null; const confirmedDiagnostic=diagnose(label,tf,closedRows); const liveRowsForTf=LIVE_DIAG_TFS.has(tf) ? liveRows(closedRows,forming) : closedRows.slice(); const liveDiagnostic=diagnose(label,tf,liveRowsForTf); const warning=deriveEarlyWarning(label,tf,closedRows,forming,confirmedDiagnostic); const mode=LIVE_DIAG_TFS.has(tf)&&liveRowsForTf.length>closedRows.length?'live':'confirmed'; const active=(LIVE_DIAG_TFS.has(tf)&&liveDiagnostic&&liveDiagnostic.available)?liveDiagnostic:confirmedDiagnostic; if(active&&active.available){ active.mode=LIVE_DIAG_TFS.has(tf)?mode:'confirmed'; active.confirmedDiagnostic=confirmedDiagnostic; active.liveDiagnostic=liveDiagnostic; active.earlyWarning=warning; active.events.earlyWarning=warning?warning.label:'None'; } return active; }
  function action(dir,pow,clarity,risk){ let hasOpen=false, side=''; try{hasOpen=Array.isArray(openPositionBoxes)&&openPositionBoxes.length>0; side=openPositionBoxes[0]?.side||'';}catch(_e){} if(hasOpen){ if(side==='SHORT'){ if(dir>30)return 'EXIT SHORT'; if(dir>8)return 'TRIM SHORT'; if(dir< -35 && pow>20)return 'ADD SHORT'; return 'HOLD SHORT'; } else { if(dir<-30)return 'EXIT LONG'; if(dir<-8)return 'TRIM LONG'; if(dir>35&&pow>20)return 'ADD LONG'; return 'HOLD LONG'; }} if(clarity<52||risk>72)return 'WAIT'; if(dir>45&&pow>5)return 'FRESH LONG'; if(dir<-45&&pow>5)return 'FRESH SHORT'; return 'WAIT'; }
  function scorePos(score,c){ score=clamp(score,0,100); if(c==='red')return 50-score/2; if(c==='blue')return 50+score/2; return 50; }
  function segStrength(d){ const ratio=Math.min(1,d/32); if(ratio<.25)return 's1'; if(ratio<.50)return 's2'; if(ratio<.80)return 's3'; return 's4'; }
  function ribbonSegments(score,c){ const total=80, centerLeft=39, centerRight=40, segs=[]; const raw=Number(score)||0; const mag=clamp(Math.abs(raw),0,100); const side=raw>0?'blue':raw<0?'red':'gray'; const active=mag>0?Math.max(1,Math.ceil(mag/100*40)):0; for(let i=0;i<total;i++){let cls='sssc-rseg'; if(side==='blue'&&i>=centerRight&&i<centerRight+active)cls+=' fill blue '+segStrength(i-centerRight+1); if(side==='red'&&i<=centerLeft&&i>centerLeft-active)cls+=' fill red '+segStrength(centerLeft-i+1); segs.push('<i class="'+cls+'"></i>');} return segs.join(''); }
  function polar(cx,cy,r,deg){ const a=deg*Math.PI/180; return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}; }
  function gaugeAngle(value){ return -90+(clamp(value,-100,100)/100)*90; }
  function signedText(value){ value=Math.round(value); return value>0?'+'+value:String(value); }
  function displayChars(value,width=3){ const text=Math.abs(Math.round(Number(value)||0)).toString(); const size=Math.max(Number(width)||2,text.length); return text.padStart(size,' ').split(''); }
  function odoCell(ch){ return `<span class="sssc-odo-cell${ch===' ' ? ' sssc-odo-blank' : ''}">${ch===' ' ? '&nbsp;' : ch}</span>`; }
  function rollingDigits(value,prevValue,variant='score',extraClass='',opts={}){ const rounded=Math.round(Number(value)||0); const prevRounded=Number.isFinite(Number(prevValue))?Math.round(Number(prevValue)):rounded; const width=Math.max(Number(opts.width)||2,Math.abs(rounded).toString().length,Math.abs(prevRounded).toString().length); const showSign=!!opts.showSign; const sign=showSign?(rounded>0?'+':rounded<0?'-':''):''; const nextChars=displayChars(rounded,width); const prevChars=displayChars(prevRounded,width); const direction=rounded>prevRounded?'up':rounded<prevRounded?'down':'none'; const slotHtml=nextChars.map((nextCh,idx)=>{ const prevCh=prevChars[idx] || ' '; const changed=prevCh!==nextCh; const bothDigits=/\d/.test(prevCh)&&/\d/.test(nextCh); if(!changed || !bothDigits || direction==='none') return `<span class="sssc-odo-slot">${odoCell(nextCh)}</span>`; const up=direction==='up'; const cells=up ? odoCell(prevCh)+odoCell(nextCh) : odoCell(nextCh)+odoCell(prevCh); const start=up ? 'translateY(0)' : 'translateY(-1em)'; const end=up ? 'translateY(-1em)' : 'translateY(0)'; return `<span class="sssc-odo-slot"><span class="sssc-odo-roll ${up?'is-up':'is-down'}" style="transform:${start}" data-odo-to="${end}">${cells}</span></span>`; }).join(''); return `<span class="sssc-odo sssc-odo-${variant}${extraClass||''}" aria-label="${rounded}">${showSign?`<span class="sssc-odo-sign${sign?'':' is-empty'}">${sign||'&nbsp;'}</span>`:''}<span class="sssc-odo-digits">${slotHtml}</span></span>`; }
  function animateRollingDigits(scope){ if(!scope) return; requestAnimationFrame(()=>requestAnimationFrame(()=>{ scope.querySelectorAll('.sssc-odo-roll[data-odo-to]').forEach(el=>{ const to=String(el.dataset.odoTo||'translateY(0)'); if(el.style.transform===to) return; el.style.transform=to; }); })); }
  function powerGauge(value,tf){ value=clamp(value,-100,100); const prev=Number.isFinite(previousMomentumByTf[tf])?clamp(previousMomentumByTf[tf],-100,100):null; const cx=74,cy=60,radius=56,a=gaugeAngle(value); const tip=polar(cx,cy,52,a); const baseLen=13,halfBase=3.7,rad=a*Math.PI/180; const bx=cx+baseLen*Math.cos(rad+Math.PI), by=cy+baseLen*Math.sin(rad+Math.PI); const pxv=Math.cos(rad+Math.PI/2)*halfBase, pyv=Math.sin(rad+Math.PI/2)*halfBase; const points=`${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${(bx+pxv).toFixed(1)},${(by+pyv).toFixed(1)} ${(bx-pxv).toFixed(1)},${(by-pyv).toFixed(1)}`; let ghost=''; if(prev!==null){ const ga=gaugeAngle(prev), grad=ga*Math.PI/180, gtip=polar(cx,cy,50,ga), gbx=cx+12*Math.cos(grad+Math.PI), gby=cy+12*Math.sin(grad+Math.PI), gpx=Math.cos(grad+Math.PI/2)*3.3, gpy=Math.sin(grad+Math.PI/2)*3.3; ghost=`<polygon class="ghostNeedle" points="${gtip.x.toFixed(1)},${gtip.y.toFixed(1)} ${(gbx+gpx).toFixed(1)},${(gby+gpy).toFixed(1)} ${(gbx-gpx).toFixed(1)},${(gby-gpy).toFixed(1)}"/>`; } let ticks=''; for(let i=-100;i<=100;i+=20){ const aa=gaugeAngle(i), p1=polar(cx,cy,45,aa), p2=polar(cx,cy,53,aa); ticks += `<line class="tick" x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"/>`; } return `<div class="sssc-gauge"><svg viewBox="0 0 148 68" aria-label="Momentum ${signedText(value)}"><path class="gaugeInner" d="M 18 60 A 56 56 0 0 1 130 60 L 74 60 Z"/><path class="arc" d="M 18 60 A 56 56 0 0 1 130 60"/><path class="arcHi" d="M 18 60 A 56 56 0 0 1 130 60"/><g>${ticks}</g>${ghost}<polygon class="needle" points="${points}"/><rect class="hub" x="51" y="48" width="46" height="20" rx="0" ry="0"/><text class="svgval" x="74" y="58">${signedText(value)}</text></svg></div>`; }
  function chip(txt){ const s=String(txt||'-'); let cls=''; if(/Bull|Hold|Reclaim/i.test(s))cls='bull'; if(/Bear|Loss|Below|Reject/i.test(s))cls='bear'; if(/Fresh|Expanding|Strengthening/i.test(s))cls='blue'; if(/Failed|Chop|Compress|Weak|Old/i.test(s))cls='warn'; return `<span class="sssc-ui-chip ${cls}">${s}</span>`; }
  function eventRows(items){ const head=`<div class="sssc-ui-event-row"><b>TF</b><b>X9/21</b><b>X21/55</b><b>X55/100</b><b>X100/200</b><b>EMA9</b><b>EMA21</b><b>EMA55</b><b>VWAP</b><b>Cluster</b></div>`; return head+items.map(d=>{ if(!d.available)return `<div class="sssc-ui-event-row"><b>${d.tf}</b>${'<span>-</span>'.repeat(9)}</div>`; const e=d.events; return `<div class="sssc-ui-event-row" data-tf="${d.tf}"><b>${d.tf}</b>${chip(e.x921)}${chip(e.x2155)}${chip(e.x55100)}${chip(e.x100200)}${chip(e.ema9)}${chip(e.ema21)}${chip(e.ema55)}${chip(e.vwap)}${chip(e.cluster)}</div>`}).join(''); }
  function kpi(label,val,sub,cls='',extra=''){ return `<div class="sssc-ui-kpi ${extra}"><label>${label}</label><div class="val ${cls}">${val}</div><div class="sub">${sub}</div></div>`; }
  function changedValue(key,val){ val=String(val); const old=previousTopValues[key]; const changed=old!==undefined && old!==val; previousTopValues[key]=val; return changed; }
  function blinkClass(key,val){ return changedValue(key,val)?' sssc-value-blink':''; }
  function updatePreviousMomentum(items){ for(const it of items){ if(!it||!it.available||!Number.isFinite(it.magnitude)) continue; const cur=Number(it.magnitude); if(Number.isFinite(lastRenderedMomentumByTf[it.tf]) && Math.round(lastRenderedMomentumByTf[it.tf])!==Math.round(cur)){ previousMomentumByTf[it.tf]=lastRenderedMomentumByTf[it.tf]; } else if(!Number.isFinite(previousMomentumByTf[it.tf])){ previousMomentumByTf[it.tf]=null; } lastRenderedMomentumByTf[it.tf]=cur; } }
  function updatePreviousScores(items){ for(const it of items){ if(!it||!it.available||!Number.isFinite(it.direction)) continue; const cur=Math.abs(Math.round(Number(it.direction)||0)); if(Number.isFinite(lastRenderedScoreByTf[it.tf]) && lastRenderedScoreByTf[it.tf]!==cur){ previousScoreValueByTf[it.tf]=lastRenderedScoreByTf[it.tf]; pendingScoreRollByTf[it.tf]=true; } else { previousScoreValueByTf[it.tf]=cur; pendingScoreRollByTf[it.tf]=false; } lastRenderedScoreByTf[it.tf]=cur; } }
  function settleScoreRoll(items){ for(const it of items){ if(!it||!it.available) continue; const tf=it.tf; previousScoreValueByTf[tf]=lastRenderedScoreByTf[tf]; pendingScoreRollByTf[tf]=false; } }
  function magClass(v){ return v>20?'sssc-ui-blue':v<-20?'sssc-ui-red':'sssc-ui-gray'; }
  function rowHtml(d){ if(!d||!d.available)return `<div class="sssc-ui-row"><div class="sssc-ui-tf">${d?d.tf:'-'}</div><div class="sssc-ui-dir">Unavailable</div><div>-</div><div>-</div><div class="sssc-ui-score">-</div><div class="sssc-ui-power-state">${d?.reason||'-'}</div></div>`; const strCls=strengthClass(d.direction); const scCls=scoreClass(d.direction); const phCls=phaseClass(d.phase); const scoreVal=Math.abs(Math.round(d.direction)); const fromScore=pendingScoreRollByTf[d.tf]?previousScoreValueByTf[d.tf]:scoreVal; return `<div class="sssc-ui-row" data-tf="${d.tf}"><div class="sssc-ui-tf">${d.tf}</div><div><div class="sssc-ui-dir"><span class="sssc-dir-state">${dirLabel(d.direction)}</span> | <span class="sssc-dir-value ${strCls}">${scoreVal}</span></div><div class="sssc-ui-phase ${phCls}">${d.phase}</div></div><div class="sssc-ribbon">${ribbonSegments(d.direction)}</div><div class="sssc-gauge-wrap">${powerGauge(d.magnitude,d.tf)}</div><div class="sssc-ui-score ${scCls}">${rollingDigits(scoreVal,fromScore,'score','',{width:2})}</div><div><div class="sssc-ui-power-state ${magClass(d.magnitude)}">${d.magState}</div></div></div>`; }
  function render(force=false){ if(!force && Date.now()-lastRender<500)return; lastRender=Date.now(); const items=TFS.map(([label])=>data[label]||{tf:label,available:false,reason:'Unavailable'}); updatePreviousMomentum(items); updatePreviousScores(items); const avail=items.filter(x=>x.available); const dir=avg(avail,'direction'); const pow=avg(avail,'magnitude'); const align=avail.length/items.length; const clarity=clamp(Math.abs(dir)*0.42+(100-Math.abs(pow))*0.12+align*42,0,100); const risk=clamp(100-clarity+(avail.slice(-2).some(x=>x.available&&Math.sign(x.direction)!==Math.sign(dir))?14:0),0,100); const act=action(dir,pow,clarity,risk); const dirSide=dir>18?'BULLISH':dir<-18?'BEARISH':'MIXED'; const dirCls=strengthClass(dir); const powCls=pow>20?'blue':pow<-20?'red':'gray'; const dirVal=`${dirSide} | ${Math.abs(Math.round(dir))}`, momVal=signed(pow), clarityVal=Math.round(clarity)+'%', riskVal=Math.round(risk)+'%'; const topNode=$('ssscDashTop'); const rowsNode=$('ssscDashRows'); topNode.innerHTML=kpi('DIR',`<span class="${blinkClass('kpi_dir',dirVal)}">${dirVal}</span>`,dir>18?'Structure favors bullish side':dir<-18?'Structure favors bearish side':'Mixed',dirCls)+kpi('MOMENTUM',`<span class="${blinkClass('kpi_mom',momVal)}">${momVal}</span>`,pow>20?'Expansion improving':pow<-20?'Momentum fading':'Neutral',powCls)+kpi('CLARITY',`<span class="${blinkClass('kpi_clarity',clarityVal)}">${clarityVal}</span>`,clarity>62?'Clean enough to read':'Signal needs caution',clarity>62?'green':'gray')+kpi('EXECUTION RISK',`<span class="${blinkClass('kpi_risk',riskVal)}">${riskVal}</span>`,risk>65?'High timing risk':'Moderate timing risk',risk>65?'red':'amber')+kpi('ACTION',act,actionComment(act),'', 'action'); rowsNode.innerHTML=items.map(rowHtml).join(''); $('ssscDashEvents').innerHTML=eventRows(items); animateRollingDigits(rowsNode); settleScoreRoll(items); bindRows(); const missing=items.filter(x=>!x.available).map(x=>x.tf+': '+(x.reason||'Unavailable')); const h=hub(); const wsTick=h&&h.diag?h.diag.lastWsTickTime:0; const wsAge=wsTick?Math.round((Date.now()-wsTick)/1000)+'s':'never'; $('ssscDashFooter').innerHTML=`Module: ${MODULE} | WS age: ${wsAge} | REST seed/resync: ${lastFullFetch?Math.round((Date.now()-lastFullFetch)/1000)+'s ago':'never'} | Calc throttle: 500ms | Render throttle: 500–1000ms ${missing.length?'<span class="sssc-warn"> Missing: '+missing.join(' | ')+'</span>':''}`; }
  function detail(tf){ const d=data[tf]; const box=$('ssscDashDetail'), title=$('ssscDashDetailTitle'), grid=$('ssscDashDetailGrid'); if(!d)return; box.classList.remove('hidden'); title.textContent='TF Detail — '+tf; const dt=$('ssscDetailToggle'); if(dt)dt.textContent='Collapse'; if(!d.available){grid.innerHTML=`<div class="sssc-ui-detail-box">Unavailable\n${d.reason||''}</div>`;return} const emaLines=PERIODS.map((p,i)=>`EMA${p}: ${fmt(d.emaVals[i],2)}`).join('\n'); const spreadLines=PAIRS.map(([a,b])=>`EMA${a}/${b}: ${fmt((d.emaVals[PERIODS.indexOf(a)]-d.emaVals[PERIODS.indexOf(b)])/d.price*10000,1)} bps`).join('\n'); const crossLines=`9/21: ${d.crosses.c921.label}\n21/55: ${d.crosses.c2155.label}\n55/100: ${d.crosses.c55100.label}\n100/200: ${d.crosses.c100200.label}`; const eventLines=Object.entries(d.events).map(([k,v])=>`${k}: ${v}`).join('\n'); grid.innerHTML=`<div class="sssc-ui-detail-box"><b>Values</b>\nPrice: ${fmt(d.price,2)}\nVWAP: ${d.vwap==null?'Unavailable':fmt(d.vwap,2)}\n${emaLines}</div><div class="sssc-ui-detail-box"><b>SSSC</b>\nDirection: ${signed(d.direction)}\nMomentum: ${signed(d.magnitude)}\nStack: ${fmt(d.stackDir,0)}\nSlope dir: ${fmt(d.slopeDir,0)}\nSpread dir: ${fmt(d.sprDir,0)}\nSlope momentum: ${fmt(d.slopePow,0)}\nSpread momentum: ${fmt(d.sprPow,0)}</div><div class="sssc-ui-detail-box"><b>Spreads / Crosses</b>\n${spreadLines}\n\n${crossLines}</div><div class="sssc-ui-detail-box"><b>Events</b>\n${eventLines}</div><div class="sssc-ui-detail-box"><b>Phase</b>\nState: ${d.state}\nPhase: ${d.phase}\nMomentum: ${d.magState}\nRows: ${d.rows}</div><div class="sssc-ui-detail-box"><b>Implication</b>\n${d.direction>35?'Bullish side favored.':d.direction<-35?'Bearish side favored.':'Mixed / wait for acceptance.'}\n${d.magnitude>25?'Current directional force strengthening.':d.magnitude<-25?'Current direction fading.':'Momentum stable / low signal.'}\n3M/1M warnings do not override 15M/1H/4H unless confirming failure/rejection/acceptance.</div>`; }
  function bindRows(){ document.querySelectorAll('#ssscDash [data-tf]').forEach(el=>{ if(el.__ssscBound)return; el.__ssscBound=true; el.addEventListener('click',()=>detail(el.dataset.tf)); }); }
  function calculate(){ const h=hub(); const liveSymbol=sym(); if(currentSymbol&&currentSymbol!==liveSymbol){ data={}; } currentSymbol=liveSymbol; for(const [label,tf,count] of TFS){ const diagnostic=buildDiagnosticSet(label,tf,count,h); data[label]=diagnostic||{tf:label,interval:tf,available:false,reason:'No buffer',mode:LIVE_DIAG_TFS.has(tf)?'live':'confirmed'}; } render(); }
  async function seedFromHub(full=false){
    const h=hub();
    if(!h) return;
    currentSymbol=sym();
    try{
      if(typeof h.ensureSsscBuffers==='function') await h.ensureSsscBuffers(full);
      else for(const [,tf,count] of TFS) await h.seedBuffer(tf,count,full);
    }catch(e){
      console.warn(MODULE+' hub seed failed',e);
    }
    for(const [label,tf] of TFS){
      const diagnostic=buildDiagnosticSet(label,tf,SSSC_TARGET_CLOSED_CANDLES,h);
      data[label]=diagnostic||{tf:label,interval:tf,available:false,reason:'No buffer',mode:LIVE_DIAG_TFS.has(tf)?'live':'confirmed'};
    }
    lastFullFetch=Date.now();
    calculate();
  }
  function startLive(){
    stopLive(false);
    visible=true;
    const liveSymbol=sym();
    if(currentSymbol&&currentSymbol!==liveSymbol){ data={}; }
    currentSymbol=liveSymbol;
    const h=hub();
    if(h){
      h.setSsscVisible(true);
      seedFromHub(false).catch(e=>console.warn(MODULE+' seed failed',e));
    }
    if(Object.keys(data).length) render(true);
    calculate();
    calcTimer=setInterval(()=>visible&&calculate(),500);
  }
  function stopLive(closeWs=true){
    if(calcTimer) clearInterval(calcTimer);
    calcTimer=null;
    if(closeWs){
      const h=hub();
      if(h) h.setSsscVisible(false);
    }
  }
  function show(){ visible=true; $('ssscDash').classList.remove('hidden'); restorePanel(); startLive(); render(true); }
  function hide(){ visible=false; $('ssscDash').classList.add('hidden'); stopLive(true); }
  function savePanel(){ const p=$('ssscDash'); if(!p)return; const r=p.getBoundingClientRect(); localStorage.setItem(STORE+'panel',JSON.stringify({left:r.left,top:r.top,width:r.width,height:r.height})); }
  function restorePanel(){ const p=$('ssscDash'); if(!p)return; try{ const v=JSON.parse(localStorage.getItem(STORE+'panel')||'null'); if(v){p.style.left=Math.max(6,Math.min(window.innerWidth-100,v.left))+'px';p.style.top=Math.max(6,Math.min(window.innerHeight-80,v.top))+'px';p.style.bottom='auto';p.style.width=Math.max(840,v.width)+'px';p.style.height=Math.max(500,v.height)+'px';} }catch(_e){} }
  function installSsscSettingsPlaceholder(){}

  function installResizeGuard(){ installResizeHandles(); }
  function installResizeHandles(){ const p=$('ssscDash'); if(!p||p.__ssscResizeHandles)return; p.__ssscResizeHandles=true; ['n','s','e','w','ne','nw','se','sw'].forEach(dir=>{ const h=document.createElement('div'); h.className='sssc-resize-handle sssc-resize-'+dir; h.dataset.dir=dir; p.appendChild(h); h.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); const r=p.getBoundingClientRect(); const start={x:e.clientX,y:e.clientY,left:r.left,top:r.top,w:r.width,h:r.height,dir}; p.classList.add('sssc-resizing'); try{h.setPointerCapture(e.pointerId)}catch(_e){} const move=ev=>{ const dx=ev.clientX-start.x, dy=ev.clientY-start.y; let left=start.left, top=start.top, w=start.w, hgt=start.h; const minW=760,minH=440; if(start.dir.includes('e')) w=start.w+dx; if(start.dir.includes('s')) hgt=start.h+dy; if(start.dir.includes('w')){ w=start.w-dx; left=start.left+dx; } if(start.dir.includes('n')){ hgt=start.h-dy; top=start.top+dy; } if(w<minW){ if(start.dir.includes('w')) left-=minW-w; w=minW; } if(hgt<minH){ if(start.dir.includes('n')) top-=minH-hgt; hgt=minH; } left=clamp(left,6,window.innerWidth-80); top=clamp(top,6,window.innerHeight-60); w=Math.min(w,window.innerWidth-left-6); hgt=Math.min(hgt,window.innerHeight-top-6); p.style.left=left+'px'; p.style.top=top+'px'; p.style.bottom='auto'; p.style.width=w+'px'; p.style.height=hgt+'px'; }; const up=ev=>{ document.removeEventListener('pointermove',move,true); document.removeEventListener('pointerup',up,true); document.removeEventListener('pointercancel',up,true); p.classList.remove('sssc-resizing'); try{h.releasePointerCapture(ev.pointerId)}catch(_e){} savePanel(); }; document.addEventListener('pointermove',move,true); document.addEventListener('pointerup',up,true); document.addEventListener('pointercancel',up,true); },true); }); }
  function installDrag(){ const p=$('ssscDash'), h=$('ssscDashHead'); if(!p||!h||h.__ssscDrag)return; h.__ssscDrag=true; h.addEventListener('pointerdown',e=>{ if(e.target.closest('button')||e.target.closest('.sssc-resize-handle'))return; const r=p.getBoundingClientRect(); drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top}; h.setPointerCapture(e.pointerId); e.preventDefault(); }); h.addEventListener('pointermove',e=>{ if(!drag)return; p.style.left=clamp(drag.left+e.clientX-drag.x,6,window.innerWidth-80)+'px'; p.style.top=clamp(drag.top+e.clientY-drag.y,6,window.innerHeight-60)+'px'; p.style.bottom='auto'; }); const end=e=>{ if(drag){drag=null; savePanel(); try{h.releasePointerCapture(e.pointerId)}catch(_e){}}}; h.addEventListener('pointerup',end); h.addEventListener('pointercancel',end); if(typeof ResizeObserver!=='undefined'){ new ResizeObserver(()=>visible&&savePanel()).observe(p); } }
  function install(){ const top=document.querySelector('.topbar'); const anchor=document.getElementById('v13LabBtn')||document.getElementById('apiKeysBtn')||top?.firstElementChild; if(top&&!$('ssscDashBtn')){ const b=document.createElement('button'); b.id='ssscDashBtn'; b.type='button'; b.textContent='SSSC'; b.title='Show/hide SSSC dashboard'; anchor?anchor.insertAdjacentElement('afterend',b):top.insertAdjacentElement('afterbegin',b); b.addEventListener('click',()=>visible?hide():show()); } $('ssscDashClose')?.addEventListener('click',hide); $('ssscDashRefresh')?.addEventListener('click',()=>seedFromHub(true)); const evBtn=$('ssscEventToggle'); const evBody=$('ssscDashEvents'); if(evBtn&&evBody&&!evBtn.__ssscBound){ evBtn.__ssscBound=true; evBtn.addEventListener('click',()=>{ const closed=evBody.classList.toggle('hidden'); evBtn.textContent=closed?'Expand':'Collapse'; }); } const dtBtn=$('ssscDetailToggle'); const dtBox=$('ssscDashDetail'); if(dtBtn&&dtBox&&!dtBtn.__ssscBound){ dtBtn.__ssscBound=true; dtBtn.addEventListener('click',()=>{ const closed=dtBox.classList.toggle('hidden'); dtBtn.textContent=closed?'Expand':'Collapse'; }); } installDrag(); installResizeGuard(); installSsscSettingsPlaceholder(); restorePanel(); }

  if(typeof openSettings==='function' && !window.__ssscR3SettingsWrapped){ window.__ssscR3SettingsWrapped=true; const prevOpenSssc=openSettings; openSettings=function(){ const r=prevOpenSssc.apply(this,arguments); setTimeout(installSsscSettingsPlaceholder,0); return r; }; }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install(); setTimeout(install,300);
  window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3={version:MODULE,show,hide,refresh:()=>seedFromHub(true),diagnose};
})();
