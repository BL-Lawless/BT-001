"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const series=require("./shared/canonical-candle-series.js");

const root=path.resolve(__dirname,"..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const mergeStart=main.indexOf("function mergeBufferRow(existing,incoming)");
const mergeEnd=main.indexOf("function cloneRow",mergeStart);
assert(mergeStart>=0&&mergeEnd>mergeStart,"mergeBufferRow must remain available for candle reconciliation");
const mergeBufferRow=vm.runInNewContext(`(${main.slice(mergeStart,mergeEnd).trim()})`);

const staleClosed={
  time:3600,open:100,high:180,low:40,close:120,
  volume:900,baseVolume:900,quoteVolume:90000,tradeCount:90,
  takerBuyBase:450,takerBuyQuote:45000,final:true,source:"ws"
};
const authoritativeRest={
  time:3600,open:125,high:140,low:110,close:135,
  volume:250,baseVolume:250,quoteVolume:32000,tradeCount:25,
  takerBuyBase:120,takerBuyQuote:15300,final:true,source:"rest"
};
const closed=[{...staleClosed}];
series.upsertFinalized(closed,authoritativeRest,{source:"rest",merge:mergeBufferRow});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(closed[0])),
  authoritativeRest,
  "Binance REST must fully replace stale OHLCV for an existing closed candle"
);

const formingExisting={time:7200,open:130,high:150,low:120,close:140,volume:10,final:false,source:"ws"};
const outOfOrderForming={time:7200,open:131,high:145,low:125,close:138,volume:8,final:false,source:"ws"};
const forming=series.upsertForming(formingExisting,outOfOrderForming,mergeBufferRow);
assert.equal(forming.open,130,"forming merge must preserve the established open");
assert.equal(forming.high,150,"forming merge must preserve the observed intrabar high");
assert.equal(forming.low,120,"forming merge must preserve the observed intrabar low");
assert.equal(forming.close,138,"forming merge must accept the latest close");

console.log("REST authoritative candle tests: PASS");
