"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");

(async()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
  const start=main.indexOf("function detectClosedBoundaryIssues"),end=main.indexOf("function validateClosedBuffer",start);
  const detect=vm.runInNewContext(`(${main.slice(start,end).trim()})`,{Math,Number,Array});
  const candle=(index,stepSec=60,extra={})=>({time:1000+index*stepSec,openTime:(1000+index*stepSec)*1000,closeTime:(1000+(index+1)*stepSec)*1000-1,open:100,high:102,low:98,close:100,volume:10,final:true,source:"ws",...extra});

  for(const [tf,stepSec] of [["1m",60],["3m",180],["5m",300],["15m",900],["1h",3600],["4h",14400],["1d",86400]]){
    assert.deepEqual(Array.from(detect(tf,[candle(0,stepSec),candle(1,stepSec)],{stepSec})),[],`${tf} canonical open/close boundaries must pass`);
  }
  const priceGap=[candle(0),candle(1,60,{open:140,high:143,low:139,close:141})];
  assert.equal(detect("1m",priceGap,{stepSec:60}).length,0,"price discontinuity with canonical timestamps is not a candle-integrity failure");

  const gap=[candle(0),candle(2)];
  const gapIssue=detect("1m",gap,{stepSec:60})[0];
  assert.equal(gapIssue.kind,"timestamp-boundary");
  assert.equal(gapIssue.intervalMs,60000);assert.equal(gapIssue.expectedNextOpenMs,1060000);assert.equal(gapIssue.nextOpenMs,1120000);assert.equal(gapIssue.actualDifferenceMs,60000);assert.equal(gapIssue.toleranceMs,1);
  const overlap=detect("1m",[candle(0),candle(0,60,{openTime:1059000,time:1059})],{stepSec:60})[0];
  assert(overlap.actualDifferenceMs<0,"overlaps must fail");
  const badClose=detect("1m",[candle(0,60,{closeTime:1050000}),candle(1)],{stepSec:60})[0];
  assert.notEqual(badClose.closeDifferenceMs,0,"wrong close-time convention must fail");
  assert.equal(detect("1m",[candle(0),{...candle(1),openTime:NaN,time:NaN}],{stepSec:60}).length,1,"malformed timestamps must fail");

  const repairStart=main.indexOf("async function repairMissingClosedCandles"),repairEnd=main.indexOf("function ingestRestRows",repairStart),repairSource=main.slice(repairStart,repairEnd).trim();
  let rows=gap.map(row=>({...row})),warnings=0,fetches=0;
  const key=row=>row?[row.time,row.open,row.high,row.low,row.close,row.volume].join(":"):"";
  const context={Math,Number,String,Array,Object,Promise,Set,
    state:{generation:7,gapRepairInFlightByTf:{},lastGapRepairMsByTf:{},gapRepairAttemptsByTf:{}},KLINE_LIMIT:1500,
    ensureBufferSymbol:()=>"BTCUSDT",now:()=>999999,getClosedBuffer:()=>rows,closedContentKey:value=>(value||[]).map(key).join("|"),candleContentKey:key,
    isGuardCurrent:()=>true,ivSec:()=>60,cfg:()=>({symbol:"BTCUSDT"}),klinesForInterval:async()=>{fetches++;return [candle(0),candle(1),candle(2)];},
    normalizeCandleRow:(_tf,row)=>({...row,final:true,source:"rest"}),isFormingRow:()=>false,intervalKeep:()=>100,
    upsertClosedBuffer:(_tf,row)=>{const i=rows.findIndex(item=>item.time===row.time);if(i>=0)rows[i]=row;else rows.push(row);rows.sort((a,b)=>a.time-b.time);},
    bumpClosedRevision:()=>{},rehydrateActiveChartFromHub:()=>{},iv:()=>"1m",validateClosedBuffer:()=>Array.from(detect("1m",rows,{stepSec:60})),warnIntegrity:()=>{warnings++;}
  };
  const repair=vm.runInNewContext(`(${repairSource})`,context);
  const repaired=await repair("1m",[gapIssue],"test",{generation:7});assert.equal(repaired.resolved,true);assert.equal(repaired.retryCount,1);
  rows=gap.map(row=>({...row}));context.klinesForInterval=async()=>{fetches++;return rows;};
  const unresolvedIssue=detect("1m",rows,{stepSec:60})[0];
  await repair("1m",[unresolvedIssue],"test",{generation:8});
  await repair("1m",[unresolvedIssue],"test",{generation:8});
  const capped=await repair("1m",[unresolvedIssue],"test",{generation:8});
  assert.equal(capped.deduplicated,true);assert.equal(capped.retryCount,2);assert.equal(warnings,2,"each unresolved input/generation emits one consolidated warning");
  assert(repairSource.includes('gap&&gap.kind==="timestamp-boundary"'));
  console.log("chart boundary integrity tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
