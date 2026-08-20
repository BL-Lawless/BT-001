"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

assert(!main.slice(main.indexOf("function currentStreams"),main.indexOf("function intervalMs")).includes("bookTicker"),"the permanent market connection must not request bookTicker");
assert(main.includes('const stream=symbol.toLowerCase()+"@bookTicker"'),"the on-demand public connection must request symbol bookTicker");
assert(main.includes("getTopOfBook:topOfBookSnapshot"),"the public market hub must expose one shared getTopOfBook API");
assert(main.includes("ensureTopOfBook,"),"the public market hub must expose proactive first-tick readiness");
assert(main.includes("const TOP_OF_BOOK_STALE_MS = 2500"),"top-of-book freshness must use the documented 2.5-second gate");
const bookQueue=main.slice(main.indexOf("function queueBookTicker"),main.indexOf("function handleKline"));
assert(!bookQueue.includes("publishMarketUpdate"),"bookTicker ticks must only update stored top-of-book state");
assert(main.includes('connectionKey:"public-book-ticker"'),"bookTicker must use an independent WebSocket connection");
const mainConnectStart=main.indexOf("function connect({force=false");
const mainMessageStart=main.indexOf("onMessage:event =>",mainConnectStart);
const mainMessageEnd=main.indexOf("onError:",mainMessageStart);
assert(!main.slice(mainMessageStart,mainMessageEnd).includes("bookTicker"),"the permanent market socket handler must not process bookTicker traffic");
assert(calculator.includes('setBookTickerVisibilityConsumer("calculator",true)')&&calculator.includes('setBookTickerVisibilityConsumer("calculator",false)'),"Calculator visibility must own one bookTicker consumer");
assert(calculator.includes('setBookTickerVisibilityConsumer("otf-close",!!openPositionCloseUi.open)'),"OTF panel visibility must own one bookTicker consumer");
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
const bookStart=main.indexOf("function topOfBookSnapshot");
const bookEnd=main.indexOf("function ensureTopOfBook",bookStart);
const getTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  bookTickerState:{topOfBook:{symbol:"BTCUSDT",bid:100,ask:101,at:7501}},
  cfg:()=>({symbol:"BTCUSDT"}),
  now:()=>clock,
  Number,String,Math,Object,
  TOP_OF_BOOK_STALE_MS:2500
});
assert.equal(getTopOfBook().fresh,true);
assert.equal(getTopOfBook().state,"fresh");
clock=10002;
assert.equal(getTopOfBook().fresh,false,"book data older than 2.5 seconds must be stale");
assert.equal(getTopOfBook().state,"stale");
const waitingBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  bookTickerState:{topOfBook:null},cfg:()=>({symbol:"BTCUSDT"}),now:()=>clock,Number,String,Math,Object,TOP_OF_BOOK_STALE_MS:2500
});
assert.equal(waitingBook().state,"waiting","never-received book data must not be labeled stale");
assert.equal(waitingBook().hasData,false);

const wsStart=main.indexOf("function wsBase");
const wsEnd=main.indexOf("function bookTickerWsBase",wsStart);
const wsBase=vm.runInNewContext(`(${main.slice(wsStart,wsEnd).trim()})`,{String,cfg:()=>({ws:"wss://fstream.binance.com/market/stream"})});
assert.equal(wsBase(),"wss://fstream.binance.com/market/stream","the permanent hub must use Binance's market-routed combined-stream endpoint");
const bookWsStart=wsEnd;
const bookWsEnd=main.indexOf("function socketState",bookWsStart);
const bookTickerWsBase=vm.runInNewContext(`(${main.slice(bookWsStart,bookWsEnd).trim()})`,{String,cfg:()=>({ws:"wss://fstream.binance.com/market/stream"})});
assert.equal(bookTickerWsBase(),"wss://fstream.binance.com/public/stream","bookTicker must use Binance's public-routed combined-stream endpoint");

const lifecycleStart=main.indexOf("function bookTickerSocketState");
const lifecycleEnd=main.indexOf("function subscribeBookTickerTick",lifecycleStart);
let lifecycleConnects=0,lifecycleDisconnects=0;
const lifecycleContext={
  bookTickerState:{socket:null,generation:0,reconnectTimer:null,connectStartedAt:0,consumers:new Set(),topOfBook:null},
  bookTickerDiag:{status:"inactive",symbol:null,streams:[],socketStatus:"closed",activeUrl:"",connectCount:0,disconnectCount:0,reconnectCount:0,lastMessageTime:0,lastError:null},
  diag:{latestBid:null,latestAsk:null,latestBookTickerTime:0},
  WebSocket:{CONNECTING:0,OPEN:1},String,JSON,Math,Number,
  now:()=>1000,ensureBufferSymbol:()=>"BTCUSDT",bookTickerWsBase:()=>"wss://fstream.binance.com/public/stream",
  clearTimeout:()=>{},setTimeout:()=>1,queueBookTicker:()=>{},
  closeSocket:connection=>{if(connection){connection.readyState=3;lifecycleDisconnects++;}},
  API:{connectWebSocket:url=>{lifecycleConnects++;return {url,readyState:0};}},
  bookTickerDiagnostics:()=>({})
};
vm.createContext(lifecycleContext);
vm.runInContext(main.slice(lifecycleStart,lifecycleEnd),lifecycleContext);
lifecycleContext.setBookTickerConsumerActive("calculator",true);
assert.equal(lifecycleConnects,1,"opening Calculator must activate the public bookTicker connection");
lifecycleContext.setBookTickerConsumerActive("otf-close",true);
assert.equal(lifecycleConnects,1,"opening OTF while Calculator is open must reuse the independent bookTicker connection");
lifecycleContext.setBookTickerConsumerActive("calculator",false);
assert.equal(lifecycleDisconnects,0,"closing Calculator must retain bookTicker while OTF remains open");
lifecycleContext.setBookTickerConsumerActive("otf-close",false);
assert.equal(lifecycleDisconnects,1,"closing the final visible consumer must disconnect bookTicker");
assert.equal(lifecycleContext.bookTickerState.socket,null);

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
