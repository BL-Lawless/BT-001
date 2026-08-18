"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

assert(main.includes('streams.push(base + "@bookTicker")'),"the public market hub must subscribe to symbol bookTicker");
assert(main.includes("getTopOfBook:topOfBookSnapshot"),"the public market hub must expose one shared getTopOfBook API");
assert(main.includes("ensureTopOfBook,"),"the public market hub must expose proactive first-tick readiness");
assert(main.includes("const TOP_OF_BOOK_STALE_MS = 2500"),"top-of-book freshness must use the documented 2.5-second gate");
assert(main.includes('type:"bookTicker"'),"book updates must publish through the shared hub");
assert.equal((calculator.match(/getTopOfBook/g)||[]).length>=2,true,"both OTF and row engines must consume the shared API");
assert.equal((calculator.match(/timeInForce:"GTX"/g)||[]).length,2,"OTF and row placement paths must both use GTX");
assert(calculator.includes('signedOrderWrite("PUT",send)'),"chases must amend through PUT /fapi/v1/order");
assert(calculator.includes("send.quantity = fmtLot(quantity)")&&calculator.includes("send.price = String(price)"),"amends must send price and quantity together");
assert(!/timeInForce:"GTC"/.test(calculator.slice(0,calculator.indexOf("function moneyColor"))),"the OTF chase path must not retain GTC");
assert(calculator.includes("maxDurationMs:3000"),"row chases must have a three-second cap");
assert(calculator.includes("Another row chase is active"),"row C controls must enforce one shared row lock");
assert(calculator.includes("snapshot.normalFetchError"),"row unlock must depend on a successful open-orders cancel verification");
assert(calculator.includes('else if(activeRowChase.type === "exit") send.reduceOnly = "true"'),"only row exits may add reduceOnly in one-way mode");
assert(css.includes(".calc-module-row-chase")&&css.includes(".otf-close-live.is-error"),"row controls and the single red OTF status must be styled");
assert.equal((calculator.match(/id="otfCloseChaseLiveStatus"/g)||[]).length,1,"OTF must render exactly one chase status line");
assert(!calculator.includes('id="otfCloseChaseStatus"'),"the duplicate OTF status element must be removed");

let clock=10000;
const bookStart=main.indexOf("function topOfBookSnapshot");
const bookEnd=main.indexOf("function ensureTopOfBook",bookStart);
const getTopOfBook=vm.runInNewContext(`(${main.slice(bookStart,bookEnd).trim()})`,{
  state:{topOfBook:{symbol:"BTCUSDT",bid:100,ask:101,at:7501}},
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
  state:{topOfBook:null},cfg:()=>({symbol:"BTCUSDT"}),now:()=>clock,Number,String,Math,Object,TOP_OF_BOOK_STALE_MS:2500
});
assert.equal(waitingBook().state,"waiting","never-received book data must not be labeled stale");
assert.equal(waitingBook().hasData,false);

const wsStart=main.indexOf("function wsBase");
const wsEnd=main.indexOf("function socketState",wsStart);
const wsBase=vm.runInNewContext(`(${main.slice(wsStart,wsEnd).trim()})`,{String,cfg:()=>({ws:"wss://fstream.binance.com/market/stream"})});
assert.equal(wsBase(),"wss://fstream.binance.com/stream","the public hub must use Binance's emitting combined-stream endpoint");

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
