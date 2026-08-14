"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");

(async()=>{
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
  const helperStart=main.indexOf("function nextCandleOpenTimeMs"),helperEnd=main.indexOf("function candleCloseBoundaryMs",helperStart);
  const helperContext={Math,Number,Date,ivSec:tf=>tf==="1M"?2592000:60};
  vm.createContext(helperContext);vm.runInContext(main.slice(helperStart,helperEnd),helperContext);
  const start=main.indexOf("function detectClosedBoundaryIssues"),end=main.indexOf("function validateClosedBuffer",start);
  const detect=vm.runInNewContext(`(${main.slice(start,end).trim()})`,{Math,Number,Array,ivSec:helperContext.ivSec,nextCandleOpenTimeMs:helperContext.nextCandleOpenTimeMs,missingCandleCount:helperContext.missingCandleCount});
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

  const monthly=[];
  for(let year=2019;year<=2026;year++)for(let month=0;month<12;month++){
    const openTime=Date.UTC(year,month,1),nextOpen=Date.UTC(year,month+1,1);
    monthly.push({time:openTime/1000,openTime,closeTime:nextOpen-1,open:100,high:102,low:98,close:100,volume:10,final:true});
  }
  assert.deepEqual(Array.from(detect("1M",monthly)),[],"complete multi-year monthly history must accept variable 28/29/30/31-day boundaries");
  const missingMarch=monthly.filter(row=>row.openTime!==Date.UTC(2024,2,1));
  const monthlyIssue=detect("1M",missingMarch).find(issue=>issue.previousOpenMs===Date.UTC(2024,1,1));
  assert.equal(monthlyIssue.missingCount,1,"a genuinely missing calendar month must report one missing candle");

  const repairStart=main.indexOf("async function repairMissingClosedCandles"),repairEnd=main.indexOf("function ingestRestRows",repairStart),repairSource=main.slice(repairStart,repairEnd).trim();
  let rows=gap.map(row=>({...row})),warnings=0,fetches=0,clock=999999;
  const key=row=>row?[row.time,row.open,row.high,row.low,row.close,row.volume].join(":"):"";
  const context={Math,Number,String,Array,Object,Promise,Set,
    state:{generation:7,gapRepairInFlightByTf:{},lastGapRepairMsByTf:{},gapRepairAttemptsByTf:{}},KLINE_LIMIT:1500,GAP_REPAIR_RETRY_BASE_MS:15000,GAP_REPAIR_RETRY_MAX_MS:300000,
    ensureBufferSymbol:()=>"BTCUSDT",now:()=>clock,getClosedBuffer:()=>rows,closedContentKey:value=>(value||[]).map(key).join("|"),candleContentKey:key,
    isGuardCurrent:()=>true,ivSec:()=>60,nextCandleOpenTimeMs:(_tf,ms)=>ms+60000,cfg:()=>({symbol:"BTCUSDT"}),klinesForInterval:async()=>{fetches++;return [candle(0),candle(1),candle(2)];},
    normalizeCandleRow:(_tf,row)=>({...row,final:true,source:"rest"}),isFormingRow:()=>false,intervalKeep:()=>100,
    upsertClosedBuffer:(_tf,row)=>{const i=rows.findIndex(item=>item.time===row.time);if(i>=0)rows[i]=row;else rows.push(row);rows.sort((a,b)=>a.time-b.time);},
    bumpClosedRevision:()=>{},rehydrateActiveChartFromHub:()=>{},iv:()=>"1m",validateClosedBuffer:()=>Array.from(detect("1m",rows,{stepSec:60})),warnIntegrity:()=>{warnings++;}
  };
  const repair=vm.runInNewContext(`(${repairSource})`,context);
  const repaired=await repair("1m",[gapIssue],"test",{generation:7});assert.equal(repaired.resolved,true);assert.equal(repaired.retryCount,1);
  rows=gap.map(row=>({...row}));context.klinesForInterval=async()=>{fetches++;return rows;};
  const unresolvedIssue=detect("1m",rows,{stepSec:60})[0];
  await repair("1m",[unresolvedIssue],"test",{generation:8});
  const deferred=await repair("1m",[unresolvedIssue],"test",{generation:8});
  assert.equal(deferred.deferred,true);assert.equal(deferred.retryCount,1,"an immediate duplicate must respect retry backoff");
  clock+=15000;await repair("1m",[unresolvedIssue],"test",{generation:8});
  clock+=30000;const retried=await repair("1m",[unresolvedIssue],"test",{generation:8});
  assert.equal(retried.retryCount,3);assert.equal(fetches,4,"the unchanged gap must keep retrying periodically without a socket generation change");
  assert.equal(warnings,3,"each actual unresolved retry emits a consolidated warning");
  assert(repairSource.includes('gap&&gap.kind==="timestamp-boundary"'));

  context.state={generation:9};rows=gap.map(row=>({...row}));context.validateClosedBuffer=()=>[];
  await assert.doesNotReject(()=>repair("1M",[{tf:"1M",fromTime:1000,toTime:1000,missingCount:1}],"missing-map-test"));
  assert(context.state.gapRepairAttemptsByTf&&context.state.gapRepairInFlightByTf&&context.state.lastGapRepairMsByTf);
  context.state={generation:10};
  await assert.doesNotReject(()=>repair("1m",[{tf:"1m",fromTime:1000,toTime:1000,missingCount:1}],"missing-map-test"));
  context.state={generation:11};context.klinesForInterval=async()=>{throw new Error("simulated repair transport failure");};
  const failed=await repair("1m",[{tf:"1m",fromTime:1000,toTime:1000,missingCount:1}],"graceful-failure-test");
  assert.equal(failed.resolved,false);assert.match(failed.error,/simulated repair transport failure/);
  console.log("chart boundary integrity tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
