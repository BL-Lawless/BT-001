"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const context={console,Math,Number,Object,Array,Set,Map,Date,Promise,JSON};
context.window=context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root,"features/api/binance-user-stream.module.js"),"utf8"),
  context,
  {filename:"features/api/binance-user-stream.module.js"}
);

const actual=context.createBinanceUserDataStream.buildStreamUrl(
  "wss://fstream.binance.com/private/ws",
  "sample/key+with=special chars"
);

assert.equal(
  actual,
  "wss://fstream.binance.com/private/ws?listenKey=sample%2Fkey%2Bwith%3Dspecial%20chars&events=ORDER_TRADE_UPDATE%2FACCOUNT_UPDATE"
);

console.log("Binance user-stream URL regression test: PASS");
