"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const moduleStart=source.indexOf("const MODULE='R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3'");
const moduleEnd=source.indexOf("window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3={",moduleStart);
assert(moduleStart>=0&&moduleEnd>moduleStart,"SSSC module must exist");
const ssscSource=source.slice(moduleStart,moduleEnd);

function extractFunction(name){
  const start=ssscSource.indexOf(`function ${name}(`);
  assert(start>=0,`${name} must exist in the SSSC module`);
  const bodyStart=ssscSource.indexOf("{",start);
  let depth=0;
  for(let index=bodyStart;index<ssscSource.length;index++){
    if(ssscSource[index]==="{")depth++;
    else if(ssscSource[index]==="}"&&--depth===0)return ssscSource.slice(start,index+1);
  }
  throw new Error(`Could not extract ${name}`);
}

const wsBaseSource=extractFunction("wsBase");
const connectSource=extractFunction("connectPrivateSocket");
assert(!connectSource.includes("marketDataHub"),"connectPrivateSocket must not reference marketDataHub");

let connectedUrl=null;
const API={connectWebSocket(url){connectedUrl=url;return {disconnect(){}};}};
const cfg=()=>({ws:"wss://fstream.binance.com/private/ws"});
const TFS=[["15M","15m"],["1M","1m"]];
const sym=()=>"BTCUSDT";

const connectPrivateSocket=Function(
  "API","cfg","TFS","sym",
  `"use strict";
   let privateSocket=null,privateGeneration=0;
   function closePrivateSocket(){privateSocket=null;}
   ${wsBaseSource}
   ${connectSource}
   return connectPrivateSocket;`
)(API,cfg,TFS,sym);

assert.doesNotThrow(()=>connectPrivateSocket(1000));
assert.equal(
  connectedUrl,
  "wss://fstream.binance.com/market/stream?streams=btcusdt@kline_15m/btcusdt@kline_1m"
);

console.log("sssc private socket module-scope regression test: PASS");
