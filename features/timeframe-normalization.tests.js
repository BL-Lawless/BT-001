"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");

(async()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
  const slice=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start))).trim();
  const evaluateFunction=(start,end,context={})=>{
    vm.createContext(context);
    return vm.runInContext(`(${slice(start,end)})`,context);
  };

  const canonicalTfKey=evaluateFunction("function canonicalTfKey","function normalizeMaSlots",{String});
  assert.equal(canonicalTfKey("1m"),"1m");
  assert.equal(canonicalTfKey("1M"),"1M");
  assert.equal(canonicalTfKey("1w"),"1w");
  assert.equal(canonicalTfKey("1W"),"1w");

  const required=new Set(["1m","1M","1w"]);
  const currentStreams=evaluateFunction("function currentStreams","function intervalMs",{
    cfg:()=>({symbol:"BTCUSDT"}),requiredKlineTimeframes:()=>required
  });
  assert.deepEqual(Array.from(currentStreams()),[
    "btcusdt@kline_1m","btcusdt@kline_1w","btcusdt@kline_1M",
    "btcusdt@aggTrade","btcusdt@markPrice@1s"
  ],"one-minute, weekly, and monthly requirements must remain distinct streams");

  const fetched=[];
  const buffers={"1M":[],"1w":[]};
  const ensureContext={
    Number,Math,String,canonicalTfKey,state:{timeframeEnsureInFlight:{}},
    ensureBufferSymbol:()=>"BTCUSDT",validateClosedBuffer:()=>[],getClosedBuffer:tf=>buffers[tf]||[],getChartBuffer:tf=>buffers[tf]||[],cfg:()=>({symbol:"BTCUSDT"}),
    prepareTimeframeBuffer:async(tf,count)=>{fetched.push(tf);buffers[tf]=Array.from({length:count},(_,i)=>({time:i+1}));return {closed:buffers[tf],chart:buffers[tf],continuous:true};}
  };
  const ensureTimeframeBuffer=evaluateFunction("async function ensureTimeframeBuffer","async function seedSsscBuffers",ensureContext);
  await ensureTimeframeBuffer("1M",2);
  await ensureTimeframeBuffer("1w",2);
  assert.deepEqual(fetched,["1M","1w"],"consumer buffer loads must preserve Binance monthly and weekly intervals");

  const revisionContext={canonicalTfKey,ensureBufferSymbol:()=>"BTCUSDT",Number,state:{closedRevisionByTf:{"1m":11,"1M":29},formingRevisionByTf:{"1m":12,"1M":30}}};
  const getTimeframeRevisions=evaluateFunction("function getTimeframeRevisions","function isFormingRow",revisionContext);
  assert.deepEqual(JSON.parse(JSON.stringify(getTimeframeRevisions("1M"))),{symbol:"BTCUSDT",tf:"1M",closedRevision:29,formingRevision:30});

  const monthlyRows=[{time:100,open:1,high:2,low:1,close:2}],minuteRows=[{time:1,open:9,high:9,low:8,close:8}];
  const maContext={
    Number,String,Math,Array,Object,canonicalTfKey,iv:()=>"1m",ensureBufferSymbol:()=>"BTCUSDT",
    normalizeMaSlots:()=>[{slot:1,slotId:"MA1",period:1}],getTimeframeRevisions:()=>({symbol:"BTCUSDT",closedRevision:1,formingRevision:1}),
    state:{maSnapshotCache:new Map()},diag:{maCacheHits:0,maCacheMisses:0},BT001_PERFORMANCE_DIAGNOSTICS:{maCacheHits:0,maCacheMisses:0},
    getChartBuffer:tf=>tf==="1M"?monthlyRows:minuteRows,getClosedBuffer:tf=>tf==="1M"?monthlyRows:minuteRows,
    cloneRow:row=>({...row}),window:{BT001CanonicalCandleSeries:{strictlyIncreasingUnique:()=>true}},warnIntegrity:()=>{},
    buildAlignedEmaSeries:rows=>({points:rows.map(row=>({time:row.time,value:row.close})),aligned:rows.map(row=>row.close),lastValue:rows.at(-1).close})
  };
  const getAuthoritativeMaSnapshot=evaluateFunction("function getAuthoritativeMaSnapshot","function runRevisionCacheSelfTests",maContext);
  const monthlySnapshot=getAuthoritativeMaSnapshot("1M",{requiredRows:1});
  assert.equal(monthlySnapshot.interval,"1M");
  assert.equal(monthlySnapshot.rows[0].time,100,"monthly MA snapshots must read the monthly buffer");

  const loadPath=slice("async function loadChart","/* =========================================================\n   SECTION 11");
  assert(loadPath.includes("const requestedInterval = iv()")&&loadPath.includes("fetchInitial(requestedInterval"),"main-chart loads must continue passing the raw selector interval");
  const streamSource=slice("function requiredKlineTimeframes","function setTimeframeRequirements");
  assert(streamSource.includes("new Set([iv()])"),"main-chart subscriptions must continue retaining the raw selector interval");

  // A retained-buffer interval switch leaves the old socket alive while the 100 ms requirement
  // reconnect is pending. Ordinary traffic on that old socket must not cancel the resubscription.
  let selectedTf="15m",scheduled=null,cleared=0,connects=[];
  const reconnectContext={
    state:{desiredLive:true,reconnectTimer:null,reconnectCancelableByTick:true,lastMessageSource:""},loading:false,
    diag:{lastError:null,reconnectCount:0,streams:[]},now:()=>1000,lastWs:0,document:{hidden:false},
    paintStatus:()=>{},setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{cleared++;scheduled=null;},
    connect:options=>connects.push({tf:selectedTf,...options}),syncDiag:()=>{},markLiveUpdate:()=>{},refreshConnectionStatus:()=>{}
  };
  vm.createContext(reconnectContext);
  vm.runInContext(slice("function markWsTick","function queueTradeTick"),reconnectContext);
  vm.runInContext(slice("function scheduleReconnect","async function restSyncLatest"),reconnectContext);
  reconnectContext.scheduleReconnect("stream requirements changed",100,{cancelOnTick:false});
  reconnectContext.markWsTick("aggTrade");
  assert.equal(cleared,0,"old-stream traffic must not cancel a requirement-change reconnect");
  selectedTf="1M";scheduled();
  assert.equal(connects.at(-1).tf,"1M");

  // Repeated switches coalesce into the one pending reconnect, which evaluates currentStreams at
  // execution time through connect(); old chart-only timeframes therefore do not leak.
  scheduled=null;selectedTf="1w";
  reconnectContext.scheduleReconnect("stream requirements changed",100,{cancelOnTick:false});
  selectedTf="1M";
  reconnectContext.scheduleReconnect("stream requirements changed",100,{cancelOnTick:false});
  assert.equal(reconnectContext.diag.reconnectCount,2,"rapid switches must share one pending reconnect");
  scheduled();
  assert.equal(connects.at(-1).tf,"1M","the reconnect must use the final selected timeframe");

  const intervalHandler=slice("function handleIntervalChange","reloadEl.addEventListener");
  assert(intervalHandler.indexOf("marketDataHub.rebuildRequirements(false)")<intervalHandler.indexOf("loadChart({preserveView:true})"),"interval changes must request stream reevaluation and carry the live chart view into the new timeframe");

  const rehydrate=slice("function rehydrateActiveChartFromHub","function paintStatus");
  assert(rehydrate.includes("candles = getChartBuffer(tf)")&&rehydrate.indexOf("candles = getChartBuffer(tf)")<rehydrate.indexOf("draw()"),"active kline redraws must refresh the exact candles array consumed by draw");
  const resolveTimeframeViewState=evaluateFunction("function resolveTimeframeViewState","window.BT001_CHART_VIEW_STATE",{Number,validRange:()=>false,DEF_VISIBLE:80});
  assert(loadPath.includes("const keepRight = preserveView ? rightOffset : 0;")&&loadPath.includes("const targetRight = keepRight;"),"a timeframe load must capture the current raw rightOffset without recalculating it");
  const carriedView=resolveTimeframeViewState({userChanged:false,keepVisible:80,targetRight:5,latest:null,tradesOff:true});
  assert.equal(carriedView.rightOffset,5,"a rightOffset of 5 must carry unchanged across a timeframe switch");

  const clampContext={candles:Array.from({length:100}),visibleCount:80,rightOffset:5,DEF_VISIBLE:80,MIN_VISIBLE:40,MAX_FUTURE_RATIO:.5,clamp:(value,min,max)=>Math.max(min,Math.min(max,value))};
  const clampView=evaluateFunction("function clampView","function range",clampContext);
  clampView();
  assert.equal(clampContext.rightOffset,5,"a valid carried rightOffset must remain unchanged after bounds checking");
  clampContext.candles=Array.from({length:45});clampContext.visibleCount=40;clampContext.rightOffset=50;
  clampView();
  assert.equal(clampContext.rightOffset,5,"an invalid carried rightOffset must clamp to the nearest bound for the new candle range");

  const timeAtX26=evaluateFunction("function timeAtX26","function xForTime26",{Number,Math});
  const monthlyAxisRows=[];
  for(let year=2019;year<=2026;year++)for(let month=0;month<12;month++)monthlyAxisRows.push({time:Date.UTC(year,month,1)/1000});
  const axisState={vis:monthlyAxisRows,left:0,slot:10,sec:2592000};
  const augustIndex=monthlyAxisRows.findIndex(row=>row.time===Date.UTC(2026,7,1)/1000);
  const augustHoverSec=timeAtX26(augustIndex*axisState.slot+axisState.slot/2,axisState);
  assert.equal(new Date(augustHoverSec*1000).getUTCMonth(),7,"the crosshair at an August monthly candle center must label August, not the fixed-duration adjacent month");
  const formatDateDdMmmYy=evaluateFunction("function formatDateDdMmmYy","function emaPeriod",{Date,String,isNaN});
  assert.match(formatDateDdMmmYy(augustHoverSec*1000),/Aug/,"the bottom-edge crosshair label must render the hovered monthly candle's August date");

  console.log("timeframe normalization tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
