"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const repo=path.resolve(__dirname,"..","..");
const source=fs.readFileSync(path.join(repo,"features","pressure-signal","sssc","orchestration.js"),"utf8");
const mainSource=fs.readFileSync(path.join(repo,"main.js"),"utf8");

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
assert(!source.includes("setTimeframeRequirements("),"SSSC must not register shared-hub retention");
assert(!source.includes("getAuthoritativeMaSnapshot("),"SSSC must not calculate from shared-hub snapshots");
assert(!source.includes("getClosedBuffer(")&&!source.includes("getChartBuffer("),"SSSC orchestration must remain independent of shared buffers");
assert(!mainSource.includes("function buildDiagnosticSet("),"SSSC diagnostic construction must be extracted from main.js");

console.log("sssc input sizing tests: PASS");
