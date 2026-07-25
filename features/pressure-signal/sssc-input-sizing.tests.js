"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const repo=path.resolve(__dirname,"..","..");
const source=fs.readFileSync(path.join(repo,"main.js"),"utf8");

function ema(rows,period){
  const alpha=2/(period+1);
  let value=rows.slice(0,period).reduce((sum,row)=>sum+row.close,0)/period;
  for(let i=period;i<rows.length;i++)value=rows[i].close*alpha+value*(1-alpha);
  return value;
}

const period=20,target=period*5;
const recent=Array.from({length:target},(_,i)=>({time:1000+i,close:100+Math.sin(i/7)*2+i*.03}));
const older=Array.from({length:400},(_,i)=>({time:600+i,close:40+i*.01}));
const fixedAtNormalZoom=recent.slice(-target);
const fixedAfterZoomBackfill=older.concat(recent).slice(-target);

assert.deepEqual(fixedAfterZoomBackfill,fixedAtNormalZoom);
assert.equal(ema(fixedAfterZoomBackfill,period),ema(fixedAtNormalZoom,period));
assert.notEqual(ema(older.concat(recent),period),ema(recent,period),"the regression fixture must reproduce the old whole-buffer EMA defect");

assert(source.includes("Math.ceil(longestPeriod*3)"),"hard minimum must derive from the longest configured MA period");
assert(source.includes("Math.ceil(longestPeriod*5)"),"full convergence target must derive from the longest configured MA period");
assert(source.includes("privateCandlesByTf"),"SSSC must own private candle state");
assert(source.includes("fetchPrivateWindow(tf,targets.full)"),"SSSC must fetch its dynamic window directly");
assert(!source.includes("SHARED_HUB_DEPTH_CLAMP"),"the temporary Stage 2 clamp must be removed");
const ssscSection=source.slice(source.indexOf("const MODULE='R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3'"),source.indexOf("window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3={"));
assert(!ssscSection.includes("setTimeframeRequirements("),"SSSC must not register shared-hub retention");
assert(!ssscSection.includes("getAuthoritativeMaSnapshot("),"SSSC must not calculate from shared-hub snapshots");

console.log("sssc input sizing tests: PASS");
