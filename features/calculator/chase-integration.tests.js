"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

assert(!main.slice(main.indexOf("function currentStreams"),main.indexOf("function intervalMs")).includes("depth5@100ms"),"the permanent market connection must not duplicate the top-of-book depth stream");
assert(main.includes('const stream=symbol.toLowerCase()+"@depth5@100ms"'),"the on-demand public connection must request bounded depth5@100ms");
assert(main.includes("getTopOfBook:topOfBookSnapshot"),"the public market hub must expose one shared getTopOfBook API");
assert(main.includes("ensureTopOfBook,"),"the public market hub must expose proactive first-tick readiness");
assert(main.includes("const TOP_OF_BOOK_STALE_MS = 400"),"top-of-book freshness must use the tightened 400ms gate");
assert(main.includes("const TOP_OF_BOOK_HEALTHY_STALE_MS = 5000"),"a confirmed healthy top-of-book connection must tolerate up to 5s of jitter");
const topOfBookQueue=main.slice(main.indexOf("function queueTopOfBookDepth"),main.indexOf("function handleKline"));
assert(!topOfBookQueue.includes("publishMarketUpdate"),"depth ticks must only update stored top-of-book state");
assert(topOfBookQueue.includes("const eventAt = Number(d && d.E)"),"depth freshness must use Binance event time E");
assert(topOfBookQueue.includes("slice(0,5)")&&topOfBookQueue.includes("const bid = bidDepth[0]")&&topOfBookQueue.includes("const ask = askDepth[0]"),"depth handling must retain all five levels while preserving index-zero best bid and ask prices");
assert(main.includes('connectionKey:"public-top-of-book"'),"top-of-book depth must use an independent WebSocket connection");
const mainConnectStart=main.indexOf("function connect({force=false");
const mainMessageStart=main.indexOf("onMessage:event =>",mainConnectStart);
const mainMessageEnd=main.indexOf("onError:",mainMessageStart);
assert(!main.slice(mainMessageStart,mainMessageEnd).includes("depth5@100ms"),"the permanent market socket handler must not process top-of-book depth traffic");
assert(calculator.includes('setTopOfBookVisibilityConsumer("calculator",true)')&&calculator.includes('setTopOfBookVisibilityConsumer("calculator",false)'),"Calculator visibility must own one top-of-book consumer");
assert(calculator.includes('setTopOfBookVisibilityConsumer("otf-close",!!openPositionCloseUi.open)'),"OTF panel visibility must own one top-of-book consumer");
assert(calculator.includes("const OPEN_POSITION_CLOSE_CHS_POLL_MS = 100"),"shared OTF/RF chase polling must match the depth5@100ms refresh interval");
assert.equal((calculator.match(/pollMs:OPEN_POSITION_CLOSE_CHS_POLL_MS/g)||[]).length,2,"OTF and Rapid Fire must both consume the same tightened chase interval");
assert(calculator.includes('window.addEventListener("bt001:binance-order-update"'),"Calculator must consume immediate private ORDER_TRADE_UPDATE publications");
assert(calculator.includes("engine.handleOrderUpdate(order)"),"private order updates must be forwarded to the active shared chase engines");
assert.equal((calculator.match(/getTopOfBook/g)||[]).length>=2,true,"both OTF and row engines must consume the shared API");
assert.equal((calculator.match(/timeInForce:"GTX"/g)||[]).length>=2,true,"OTF and row placement paths must both use GTX");
assert(calculator.includes('signedOrderWrite("PUT",send)'),"chases must amend through PUT /fapi/v1/order");
assert(calculator.includes("send.quantity = fmtLot(quantity)")&&calculator.includes("send.price = String(price)"),"amends must send price and quantity together");
assert(!/timeInForce:"GTC"/.test(calculator.slice(0,calculator.indexOf("function moneyColor"))),"the OTF chase path must not retain GTC");
assert(calculator.includes("maxDurationMs:15000"),"entry and exit row chases must share the fifteen-second cap");
assert(calculator.includes("Chase this row for up to 15 seconds"),"the row chase tooltip must describe the fifteen-second cap");
assert(calculator.includes("applyRowChaseWriteSuccess(activeRowChase,confirmed"),"a placed chase order must record its separate chase identity");
assert(calculator.includes("applyRowChaseWriteSuccess(activeRowChase,response"),"a repriced chase order must keep its separate chase identity current");
assert(calculator.includes('ROW_CHASE_ORIGINAL_POLL_MS = 500'),"an existing original order must be watched promptly while its chase runs");
assert(calculator.includes('cancelRowChaseOriginalAfterFill(context)'),"a chase-first fill must cancel the original order before terminal reconciliation");
assert(calculator.includes('result:"original-filled"'),"an original-first fill must terminate and cancel the chase order");
assert(calculator.includes("if(isProtectedRowChaseOriginal(row)) return;"),"private-stream reconciliation must retain the original row until chase cleanup resolves");
assert(css.includes(".calc-module-row-chase-original-cancelled"),"a confirmed original cancellation must have a greyed-out Calc row state");
assert(calculator.includes("beginRowChaseOrderSuppression(terminalIdentity)"),"terminal chase reconciliation must publish its identity to the shared bounded suppression lifecycle");
assert(calculator.includes("applyRowChaseOrderSuppression(snapshot,opts.suppressNormalOrderIdentity)"),"every calculator read path must consult the shared chase suppression lifecycle");
assert(calculator.includes("ROW_CHASE_TERMINAL_SUPPRESSION_MS = 5000"),"shared chase suppression must have a short bounded lifetime");
assert(calculator.includes("cacheAbsenceConfirmed")&&calculator.includes("clearRowChaseOrderSuppression()"),"shared suppression must clear after direct and cache snapshots both confirm absence");
const rowChaseEngineStart=calculator.indexOf("function ensureRowChaseEngine");
const rowSubmitStart=calculator.indexOf("submit:async ({quantity,price})",rowChaseEngineStart);
const rowAmendStart=calculator.indexOf("amend:async ({identity,quantity,price})",rowChaseEngineStart);
const rowSubmitBlock=calculator.slice(rowSubmitStart,rowAmendStart);
const rowAmendBlock=calculator.slice(rowAmendStart,calculator.indexOf("query:async identity",rowAmendStart));
assert(rowSubmitBlock.includes("triggerConfirmedOrderBlink(confirmedBlinkKey)"),"a confirmed row-chase submit must trigger the normal chart confirmation blink");
assert(rowAmendBlock.includes("triggerConfirmedOrderBlink(amendedBlinkKey)"),"a confirmed row-chase reprice must trigger the normal chart confirmation blink");
assert(calculator.includes("Another row chase is active"),"row C controls must enforce one shared row lock");
assert(calculator.includes("snapshot.normalFetchError"),"row unlock must depend on a successful open-orders cancel verification");
assert(calculator.includes('else if(activeRowChase.type === "exit") send.reduceOnly = "true"'),"only row exits may add reduceOnly in one-way mode");
assert(css.includes(".calc-module-row-chase")&&css.includes(".otf-close-live.is-error"),"row controls and the single red OTF status must be styled");
assert.equal((calculator.match(/id="otfCloseChaseLiveStatus"/g)||[]).length,1,"OTF must render exactly one chase status line");
assert(!calculator.includes('id="otfCloseChaseStatus"'),"the duplicate OTF status element must be removed");

const identityStart=calculator.indexOf("function normalOrderMatchesIdentity");
const identityEnd=calculator.indexOf("function freshRowChaseClientId",identityStart);
let suppressionClock=20000;
let cacheSnapshot={status:"ok",requestInFlight:false,verifiedAt:suppressionClock,orders:[
  {symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase",status:"NEW"}
]};
const identityContext={
  toUpper:value=>String(value||"").toUpperCase(),
  currentSymbol:()=>"BTCUSDT",
  rowChaseTerminalOrderSuppression:null,
  rowChaseTerminalSuppressionTimer:null,
  activeRowChase:null,
  ROW_CHASE_TERMINAL_SUPPRESSION_MS:5000,
  Date:{now:()=>suppressionClock},
  setTimeout:()=>1,
  clearTimeout:()=>{},
  window:{BINANCE_OPEN_ORDERS_CACHE:{getSnapshot:()=>cacheSnapshot}},
  String,Array,Number
};
vm.createContext(identityContext);
vm.runInContext(calculator.slice(identityStart,identityEnd),identityContext);
const transientSnapshot={normalOrders:[
  {symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase",status:"NEW"},
  {symbol:"BTCUSDT",orderId:42,clientOrderId:"other",status:"NEW"}
]};
identityContext.suppressNormalOrderByIdentity(transientSnapshot,{symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase"});
assert.deepEqual(transientSnapshot.normalOrders.map(order=>order.orderId),[42],"terminal reconciliation must omit only the chase's own transient order");

identityContext.activeRowChase={chaseIdentity:{symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase"}};
const liveChaseSnapshot={normalOrders:[
  {symbol:"BTCUSDT",orderId:40,clientOrderId:"original",status:"NEW"},
  {symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase",status:"NEW"}
]};
identityContext.applyRowChaseOrderSuppression(liveChaseSnapshot,null);
assert.deepEqual(liveChaseSnapshot.normalOrders.map(order=>order.orderId),[40],"auto-sync must hide the separate GTX order while leaving the original order visible");
identityContext.activeRowChase=null;

identityContext.beginRowChaseOrderSuppression({symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase"});
const delayedAutoSyncSnapshot={normalFetchError:false,normalOrders:[
  {symbol:"BTCUSDT",orderId:41,clientOrderId:"row-chase",status:"NEW"},
  {symbol:"BTCUSDT",orderId:42,clientOrderId:"other",status:"NEW"}
]};
identityContext.applyRowChaseOrderSuppression(delayedAutoSyncSnapshot,null);
assert.deepEqual(delayedAutoSyncSnapshot.normalOrders.map(order=>order.orderId),[42],"the delayed auto-sync read must consult shared suppression and omit the transient chase order");
assert(identityContext.activeRowChaseOrderSuppression(),"suppression must remain active while the authoritative cache still contains the chase order");
suppressionClock+=1;
cacheSnapshot={status:"ok",requestInFlight:false,verifiedAt:suppressionClock,orders:[]};
identityContext.applyRowChaseOrderSuppression({normalFetchError:false,normalOrders:[]},null);
assert.equal(identityContext.activeRowChaseOrderSuppression(),null,"suppression must clear once direct and authoritative cache reads both confirm absence");
identityContext.beginRowChaseOrderSuppression({symbol:"BTCUSDT",orderId:43,clientOrderId:"row-chase-timeout"});
suppressionClock+=5001;
assert.equal(identityContext.activeRowChaseOrderSuppression(),null,"suppression must expire after the bounded fallback window even without confirmed absence");

const writeStart=calculator.indexOf("function applyRowChaseWriteSuccess");
const writeEnd=calculator.indexOf("function refreshRowChaseButtons",writeStart);
let reconciledWrite=null;
const writeContext={
  applyWriteSuccessToRow:(row,response,fallback)=>{reconciledWrite={row,response,fallback};},
  registerTrackedOrderMeta:()=>{}
};
vm.createContext(writeContext);
vm.runInContext(calculator.slice(writeStart,writeEnd),writeContext);
const originRow={isConnected:true};
writeContext.applyRowChaseWriteSuccess(
  {row:originRow,type:"entry",symbol:"BTCUSDT",side:"BUY",positionSide:""},
  {orderId:77,clientOrderId:"row-chase"},
  {quantity:"0.010",price:"60000",clientOrderId:"row-chase"}
);
assert.equal(reconciledWrite.row,originRow,"the chase write must reconcile the originating row instead of creating a second row");
assert.equal(reconciledWrite.fallback.orderRoleType,"CHASE_ENTRY");
assert.equal(reconciledWrite.fallback.timeInForce,"GTX");
reconciledWrite=null;
const existingContext={
  row:originRow,type:"entry",symbol:"BTCUSDT",side:"BUY",positionSide:"",
  originalOrderIdentity:{symbol:"BTCUSDT",orderId:55,clientOrderId:"original"}
};
writeContext.applyRowChaseWriteSuccess(
  existingContext,
  {orderId:78,clientOrderId:"row-chase-2"},
  {quantity:"0.010",price:"60001",clientOrderId:"row-chase-2"}
);
assert.equal(reconciledWrite,null,"an existing Binance-backed row must retain its original identity while the chase runs");
assert.deepEqual(JSON.parse(JSON.stringify(existingContext.chaseIdentity)),{symbol:"BTCUSDT",orderId:78,clientOrderId:"row-chase-2"},"the GTX identity must be tracked separately from the original row");

let clock=10000;
const queueContext={
  topOfBookFeedState:{topOfBook:null,waiters:new Set()},
  topOfBookFeedDiag:{lastMessageTime:0,lastError:null},
  diag:{latestBid:null,latestAsk:null,latestTopOfBookTime:0},
  now:()=>clock,
  ensureBufferSymbol:()=>"BTCUSDT",
  Number,String,Object
};
const queueTopOfBookDepth=vm.runInNewContext(`(${topOfBookQueue.trim()})`,queueContext);
queueTopOfBookDepth({E:1234,u:9,s:"BTCUSDT",b:[["100","2"],["99","4"],["98","6"],["97","8"],["96","10"]],a:[["101","3"],["102","5"],["103","7"],["104","9"],["105","11"]]});
assert.equal(queueContext.topOfBookFeedState.topOfBook.bid,100,"top depth bid must become Bid1");
assert.equal(queueContext.topOfBookFeedState.topOfBook.ask,101,"top depth ask must become Ask1");
assert.equal(queueContext.topOfBookFeedState.topOfBook.bidSize,2,"top depth bid quantity must become Bid1 resting size");
assert.equal(queueContext.topOfBookFeedState.topOfBook.askSize,3,"top depth ask quantity must become Ask1 resting size");
assert.equal(queueContext.topOfBookFeedState.topOfBook.bidDepthSize,30,"all five bid quantities must contribute to total resting size");
assert.equal(queueContext.topOfBookFeedState.topOfBook.askDepthSize,35,"all five ask quantities must contribute to total resting size");
assert.equal(queueContext.topOfBookFeedState.topOfBook.bidDepth.length,5,"the shared snapshot must retain all five bid levels");
assert.equal(queueContext.topOfBookFeedState.topOfBook.askDepth.length,5,"the shared snapshot must retain all five ask levels");
assert.equal(queueContext.topOfBookFeedState.topOfBook.at,1234,"stored top-of-book timestamp must be Binance depth event time E");
assert.equal(queueContext.topOfBookFeedState.topOfBook.receivedAt,10000,"local receipt time should remain available separately for diagnostics");
assert.equal(queueContext.topOfBookFeedDiag.lastMessageTime,10000,"socket activity diagnostics should continue using local receipt time");
assert.equal(queueContext.diag.latestTopOfBookTime,1234,"market-data diagnostics should expose Binance depth event time");
const timestampedBook=queueContext.topOfBookFeedState.topOfBook;
queueTopOfBookDepth({u:10,s:"BTCUSDT",b:[["102","2"]],a:[["103","3"]]});
assert.equal(queueContext.topOfBookFeedState.topOfBook,timestampedBook,"depth messages without Binance event time E must not replace timestamped data");

const bookStart=main.indexOf("function topOfBookSnapshot");
const bookEnd=main.indexOf("function ensureTopOfBook",bookStart);
const delayedTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  topOfBookFeedState:queueContext.topOfBookFeedState,
  topOfBookSocketOpen:()=>false,
  topOfBookFeedDiag:{status:"connecting",symbol:"BTCUSDT",streams:["btcusdt@depth5@100ms"]},
  cfg:()=>({symbol:"BTCUSDT"}),
  getExchangeNowMs:()=>17234,
  Number,String,Math,Object,Array,
  TOP_OF_BOOK_STALE_MS:400,
  TOP_OF_BOOK_HEALTHY_STALE_MS:5000
});
assert.equal(delayedTopOfBook().ageMs,16000,"a delayed event must retain its true 16s exchange age after local processing");
assert.equal(delayedTopOfBook().fresh,false,"a delayed event must not pass freshness just because it was processed locally now");
assert.equal(delayedTopOfBook().bidDepthSize,30,"the public snapshot must expose the summed five-level bid depth");
assert.equal(delayedTopOfBook().askDepthSize,35,"the public snapshot must expose the summed five-level ask depth");
const getTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  topOfBookFeedState:{topOfBook:{symbol:"BTCUSDT",bid:100,ask:101,at:9601}},
  topOfBookSocketOpen:()=>false,
  topOfBookFeedDiag:{status:"connecting",symbol:"BTCUSDT",streams:["btcusdt@depth5@100ms"]},
  cfg:()=>({symbol:"BTCUSDT"}),
  getExchangeNowMs:()=>clock,
  Number,String,Math,Object,Array,
  TOP_OF_BOOK_STALE_MS:400,
  TOP_OF_BOOK_HEALTHY_STALE_MS:5000
});
assert.equal(getTopOfBook().fresh,true);
assert.equal(getTopOfBook().state,"fresh");
clock=10002;
assert.equal(getTopOfBook().fresh,false,"book data older than 400ms must be stale");
assert.equal(getTopOfBook().state,"stale");
assert.equal(getTopOfBook().connectionHealthy,false);
assert.equal(getTopOfBook().staleAfterMs,400,"an uncertain connection must retain the tight ceiling");

clock=10000;
const getHealthyTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  topOfBookFeedState:{topOfBook:{symbol:"BTCUSDT",bid:100,ask:101,at:5001}},
  topOfBookSocketOpen:()=>true,
  topOfBookFeedDiag:{status:"live",symbol:"BTCUSDT",streams:["btcusdt@depth5@100ms"]},
  cfg:()=>({symbol:"BTCUSDT"}),
  getExchangeNowMs:()=>clock,
  Number,String,Math,Object,Array,
  TOP_OF_BOOK_STALE_MS:400,
  TOP_OF_BOOK_HEALTHY_STALE_MS:5000
});
assert.equal(getHealthyTopOfBook().fresh,true,"a matching live depth socket must tolerate harmless jitter below 5s");
assert.equal(getHealthyTopOfBook().connectionHealthy,true);
assert.equal(getHealthyTopOfBook().staleAfterMs,5000);
clock=10002;
assert.equal(getHealthyTopOfBook().fresh,false,"even a healthy depth socket must reject data older than 5s");

clock=10000;
const getWrongStreamTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  topOfBookFeedState:{topOfBook:{symbol:"BTCUSDT",bid:100,ask:101,at:9000}},
  topOfBookSocketOpen:()=>true,
  topOfBookFeedDiag:{status:"live",symbol:"BTCUSDT",streams:["ethusdt@depth5@100ms"]},
  cfg:()=>({symbol:"BTCUSDT"}),
  getExchangeNowMs:()=>clock,
  Number,String,Math,Object,Array,
  TOP_OF_BOOK_STALE_MS:400,
  TOP_OF_BOOK_HEALTHY_STALE_MS:5000
});
assert.equal(getWrongStreamTopOfBook().fresh,false,"an open socket on the wrong stream must use the tight ceiling");
assert.equal(getWrongStreamTopOfBook().connectionHealthy,false);
const waitingBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  topOfBookFeedState:{topOfBook:null},topOfBookSocketOpen:()=>false,topOfBookFeedDiag:{status:"waiting",symbol:"",streams:[]},cfg:()=>({symbol:"BTCUSDT"}),getExchangeNowMs:()=>clock,Number,String,Math,Object,Array,TOP_OF_BOOK_STALE_MS:400,TOP_OF_BOOK_HEALTHY_STALE_MS:5000
});
assert.equal(waitingBook().state,"waiting","never-received book data must not be labeled stale");
assert.equal(waitingBook().hasData,false);

const wsStart=main.indexOf("function wsBase");
const wsEnd=main.indexOf("function topOfBookWsBase",wsStart);
const wsBase=vm.runInNewContext(`(${main.slice(wsStart,wsEnd).trim()})`,{String,cfg:()=>({ws:"wss://fstream.binance.com/market/stream"})});
assert.equal(wsBase(),"wss://fstream.binance.com/market/stream","the permanent hub must use Binance's market-routed combined-stream endpoint");
const topOfBookWsStart=wsEnd;
const topOfBookWsEnd=main.indexOf("function socketState",topOfBookWsStart);
const topOfBookWsBase=vm.runInNewContext(`(${main.slice(topOfBookWsStart,topOfBookWsEnd).trim()})`,{String,cfg:()=>({ws:"wss://fstream.binance.com/market/stream"})});
assert.equal(topOfBookWsBase(),"wss://fstream.binance.com/public/stream","top-of-book depth must use Binance's public-routed combined-stream endpoint");

const lifecycleStart=main.indexOf("function topOfBookSocketState");
const lifecycleEnd=main.indexOf("function subscribeTopOfBookTick",lifecycleStart);
let lifecycleConnects=0,lifecycleDisconnects=0;
const lifecycleContext={
  topOfBookFeedState:{socket:null,generation:0,reconnectTimer:null,connectStartedAt:0,consumers:new Set(),topOfBook:null},
  topOfBookFeedDiag:{status:"inactive",symbol:null,streams:[],socketStatus:"closed",activeUrl:"",connectCount:0,disconnectCount:0,reconnectCount:0,lastMessageTime:0,lastError:null},
  diag:{latestBid:null,latestAsk:null,latestTopOfBookTime:0},
  WebSocket:{CONNECTING:0,OPEN:1},String,JSON,Math,Number,Array,
  now:()=>1000,ensureBufferSymbol:()=>"BTCUSDT",topOfBookWsBase:()=>"wss://fstream.binance.com/public/stream",
  clearTimeout:()=>{},setTimeout:()=>1,queueTopOfBookDepth:()=>{},
  closeSocket:connection=>{if(connection){connection.readyState=3;lifecycleDisconnects++;}},
  API:{connectWebSocket:url=>{lifecycleConnects++;return {url,readyState:0};}},
  topOfBookDiagnostics:()=>({})
};
vm.createContext(lifecycleContext);
vm.runInContext(main.slice(lifecycleStart,lifecycleEnd),lifecycleContext);
lifecycleContext.setTopOfBookConsumerActive("calculator",true);
assert.equal(lifecycleConnects,1,"opening Calculator must activate the public top-of-book depth connection");
lifecycleContext.setTopOfBookConsumerActive("otf-close",true);
assert.equal(lifecycleConnects,1,"opening OTF while Calculator is open must reuse the independent top-of-book connection");
lifecycleContext.setTopOfBookConsumerActive("calculator",false);
assert.equal(lifecycleDisconnects,0,"closing Calculator must retain top-of-book depth while OTF remains open");
lifecycleContext.setTopOfBookConsumerActive("otf-close",false);
assert.equal(lifecycleDisconnects,1,"closing the final visible consumer must disconnect top-of-book depth");
assert.equal(lifecycleContext.topOfBookFeedState.socket,null);

const priceStart=calculator.indexOf("function normalizedChasePrice");
const priceEnd=calculator.indexOf("function findOpenPositionCloseChsOrder",priceStart);
const priceContext={
  toUpper:value=>String(value).toUpperCase(),
  num:value=>Number.isFinite(Number(value))?Number(value):null,
  symbolTickSizeValue:()=>0.5,
  currentOpenPositionCloseChsDistTicks:()=>0,
  currentSymbol:()=>"BTCUSDT",
  Number,Math,String,
  window:{BT001SymbolTradingSettings:{getCached:()=>({tickSize:0.5}),normalizePrice:value=>Number(value).toFixed(1)}}
};
vm.createContext(priceContext);
const normalizedChasePrice=vm.runInContext(`(${calculator.slice(priceStart,priceEnd).trim()})`,priceContext);
assert.equal(normalizedChasePrice("BUY",{bid:100,ask:101},0),"100.0","BUY chases must anchor at Bid1");
assert.equal(normalizedChasePrice("SELL",{bid:100,ask:101},0),"101.0","SELL chases must anchor at Ask1");
assert.equal(normalizedChasePrice("BUY",{bid:100,ask:101},2),"99.0","BUY distance must move away from crossing");
assert.equal(normalizedChasePrice("SELL",{bid:100,ask:101},2),"102.0","SELL distance must move away from crossing");

const start=calculator.indexOf("function sideForNewRow");
const end=calculator.indexOf("function currentOpenPositionRowSnapshot",start);
const context={};
vm.createContext(context);
const sideForNewRow=vm.runInContext(`(${calculator.slice(start,end).trim()})`,context);
assert.equal(sideForNewRow("entry","LONG"),"BUY");
assert.equal(sideForNewRow("entry","SHORT"),"SELL");
assert.equal(sideForNewRow("exit","LONG"),"SELL");
assert.equal(sideForNewRow("exit","SHORT"),"BUY");

console.log("Chase integration tests: PASS");
