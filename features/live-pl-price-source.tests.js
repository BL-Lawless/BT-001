"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const waterfall=fs.readFileSync(path.join(root,"features","waterfall","waterfall.js"),"utf8");

assert(!main.includes("updatePositionStrip(candles.length"),"position-strip refresh paths must not source P/L directly from the active timeframe buffer");
assert(!main.includes("updatePositionStrip(latest21())"),"risk refreshes must not source P/L directly from the active timeframe buffer");
const loadChartStart=main.indexOf("async function loadChart");
const loadChartEnd=main.indexOf("function resetView",loadChartStart);
assert(!main.slice(loadChartStart,loadChartEnd).includes("lastMarkPrice = null"),"timeframe loads must preserve the timeframe-independent live mark price");

const resolverStart=main.indexOf("function currentLiveMarkPrice");
const resolverEnd=main.indexOf("function updatePositionStrip",resolverStart);
const resolverContext={
  lastMarkPrice:62000,
  lastMarkPriceSymbol:"BTCUSDT",
  candles:[{close:61000}],
  cfg:()=>({symbol:"BTCUSDT"}),
  Number,String
};
vm.createContext(resolverContext);
vm.runInContext(main.slice(resolverStart,resolverEnd),resolverContext);
assert.equal(resolverContext.positionStripPriceInput({close:60500}).close,62000,"header floating P/L must prefer the live mark over both supplied and buffered candles");
resolverContext.lastMarkPrice=null;
assert.equal(resolverContext.positionStripPriceInput({close:60500}).close,60500,"header floating P/L must use its supplied candle fallback before the first live tick");
assert.equal(resolverContext.positionStripPriceInput().close,61000,"header floating P/L must retain the active candle as its final startup fallback");
resolverContext.lastMarkPrice=63000;
resolverContext.lastMarkPriceSymbol="ETHUSDT";
assert.equal(resolverContext.positionStripPriceInput().close,61000,"a prior symbol's live mark must not leak into the selected symbol's P/L");

const wfResolverStart=waterfall.indexOf("function currentLivePrice");
const wfResolverEnd=waterfall.indexOf("function wfLiveFloatingForBox",wfResolverStart);
let wfMark=62000;
const wfContext={
  window:{
    __bt001LastMarkPrice:()=>wfMark,
    __bt001CurrentCandles:()=>[{close:61000}]
  },
  num:value=>Number.isFinite(Number(value))?Number(value):null,
  Number,Array
};
vm.createContext(wfContext);
vm.runInContext(waterfall.slice(wfResolverStart,wfResolverEnd),wfContext);
assert.equal(wfContext.currentLivePrice(),62000,"WF floating P/L must prefer the timeframe-independent live mark price");
wfMark=null;
assert.equal(wfContext.currentLivePrice(),61000,"WF floating P/L must retain the candle startup fallback");

console.log("live P/L price source tests: PASS");
