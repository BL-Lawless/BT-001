"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const {create}=require("./api/visibility-recovery-gate.module.js");

(async()=>{
  const root=path.resolve(__dirname,"..");
  const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
  const detectStart=main.indexOf("function detectClosedBoundaryIssues");
  const detectEnd=main.indexOf("function validateClosedBuffer",detectStart);
  assert(detectStart>=0&&detectEnd>detectStart,"boundary detector must remain independently testable");
  const detect=vm.runInNewContext(`(${main.slice(detectStart,detectEnd).trim()})`,{Math,Number});
  const candle=(index,{open=100,high=102,low=98,close=100,source="ws"}={})=>({time:1000+index*60,open,high,low,close,volume:10,final:true,source});

  const volatile=Array.from({length:18},(_,index)=>candle(index));
  volatile[14]=candle(14,{open:100,high:160,low:97,close:150});
  volatile[15]=candle(15,{open:150,high:155,low:145,close:152});
  volatile[16]=candle(16,{open:152,high:154,low:150,close:152});
  volatile[17]=candle(17,{open:152,high:154,low:150,close:152});
  assert.equal(detect("1m",volatile,{stepSec:60}).length,0,"a legitimate large intrabar move with a continuous handoff must not be flagged");

  const defective=Array.from({length:18},(_,index)=>candle(index));
  defective[6]=candle(6,{open:140,high:143,low:139,close:141});
  assert.equal(detect("1m",defective,{stepSec:60}).length,0,"a normal one-step candle boundary must never be flagged even when its prices jump");

  const gapped=defective.map((row,index)=>({...row,time:row.time+(index>=6?60:0)}));
  const issues=Array.from(detect("1m",gapped,{stepSec:60}));
  assert(issues.length>=1,"an implausible close/open and wick discontinuity across a genuine time gap must be detected");
  const enteringIssue=issues.find(issue=>issue.toTime===gapped[6].time);
  assert(enteringIssue&&enteringIssue.kind==="boundary-discontinuity");
  assert(enteringIssue.closeOpenGap>enteringIssue.threshold&&enteringIssue.wickGap>enteringIssue.threshold);
  assert(6<defective.length-5,"the fixture boundary must sit outside the normal five-candle visibility refresh");

  const repairStart=main.indexOf("async function repairMissingClosedCandles");
  const repairEnd=main.indexOf("function ingestRestRows",repairStart);
  const repairSource=main.slice(repairStart,repairEnd).trim();
  let rows=gapped.map(row=>({...row})),revisionBumps=0,redraws=0;
  const contentKey=row=>row?[row.time,row.open,row.high,row.low,row.close,row.volume,row.quoteVolume,row.tradeCount,row.takerBuyBase,row.takerBuyQuote,row.final===true?1:0].join(":"):"";
  const context={
    Math,Number,String,Array,Object,Promise,Set,
    state:{gapRepairInFlightByTf:{},lastGapRepairMsByTf:{}},KLINE_LIMIT:1500,
    ensureBufferSymbol:()=>"BTCUSDT",now:()=>999999,getClosedBuffer:()=>rows,
    closedContentKey:value=>(value||[]).map(contentKey).join("|"),candleContentKey:contentKey,
    isGuardCurrent:()=>true,ivSec:()=>60,cfg:()=>({symbol:"BTCUSDT"}),
    klinesForInterval:async()=>[
      {...rows[5],source:"rest"},
      {time:rows[6].time,open:100,high:102,low:98,close:100,volume:10,final:true,source:"rest"}
    ],
    normalizeCandleRow:(_tf,row)=>({...row,final:true,source:"rest"}),isFormingRow:()=>false,intervalKeep:()=>100,
    upsertClosedBuffer:(_tf,row)=>{const index=rows.findIndex(item=>item.time===row.time);if(index>=0)rows[index]={...row,final:true,source:"rest"};else rows.push({...row,final:true,source:"rest"});rows.sort((a,b)=>a.time-b.time);},
    bumpClosedRevision:()=>{revisionBumps+=1;},rehydrateActiveChartFromHub:()=>{redraws+=1;},iv:()=>"1m",
    validateClosedBuffer:()=>Array.from(detect("1m",rows,{stepSec:60}))
  };
  const repair=vm.runInNewContext(`(${repairSource})`,context);
  const repaired=await repair("1m",issues,"boundary-test");
  assert.equal(repaired.resolved,true,"targeted authoritative boundary correction must fully resolve the issue");
  assert(repaired.corrected>=1&&repaired.changed,"the repair must replace existing bad boundary content, not only insert missing times");
  assert.equal(revisionBumps,1,"the boundary correction must bump the closed revision once");
  assert.equal(redraws,1,"a corrected active boundary must trigger chart rehydration/redraw");
  assert.equal(detect("1m",rows,{stepSec:60}).length,0);

  const validateSource=main.slice(main.indexOf("function validateClosedBuffer"),main.indexOf("function inspectTimeframeBuffer"));
  assert(validateSource.includes("detectClosedBoundaryIssues(tf,arr)")&&validateSource.includes("implausible closed-candle boundary detected"),"detected boundaries must enter the existing warning and repair issue list");
  assert(repairSource.includes('gap&&gap.kind==="boundary-discontinuity"')&&repairSource.includes("wantedStart = Number(gap.fromTime)"),"a boundary issue anywhere in retained history must request its exact adjacent pair");

  const knownStart=main.indexOf("async function repairKnownClosedGaps");
  const knownEnd=main.indexOf("function connect(",knownStart);
  const knownSource=main.slice(knownStart,knownEnd);
  const visibilityStart=main.indexOf("async function runPublicMarketVisibilityRecovery");
  const visibilityEnd=main.indexOf("function scheduleVisibilityRecovery",visibilityStart);
  const visibilitySource=main.slice(visibilityStart,visibilityEnd);
  assert(knownSource.includes("result.resolved!==true||result.stale===true"),"repair aggregation must propagate unresolved/stale results");
  assert(visibilitySource.includes("repairOutcome.resolved!==true||repairOutcome.stale===true"),"visibility recovery must reject a normally-resolved incomplete repair");

  let mockedRepairResult={resolved:false,stale:false};
  const aggregateRepairs=vm.runInNewContext(`(${knownSource.trim()})`,{
    Promise,Array,String,
    ensureBufferSymbol:()=>"BTCUSDT",requiredKlineTimeframes:()=>new Set(["1h"]),getClosedBuffer:()=>rows,
    validateClosedBuffer:()=>[{kind:"boundary-discontinuity",tf:"1h"}],
    repairMissingClosedCandles:async()=>mockedRepairResult
  });
  const unresolvedOutcome=await aggregateRepairs("visibility",{throwOnError:true});
  assert.equal(unresolvedOutcome.resolved,false,"repairKnownClosedGaps must preserve a repair's resolved:false result");

  let clock=0;
  const gate=create({windowMs:30000,now:()=>clock});
  const runVisibilityOutcome=outcome=>gate.run("visibility",async()=>{
    if(!outcome||outcome.resolved!==true||outcome.stale===true)throw new Error("unresolved");
    return true;
  });
  await assert.rejects(runVisibilityOutcome(unresolvedOutcome),/unresolved/);
  assert.equal(gate.diagnostics().completedRuns,0,"resolved:false must not advance the visibility success anchor");
  assert.equal(gate.diagnostics().lastCompletedAt,null);
  mockedRepairResult={resolved:true,stale:false};
  const resolvedOutcome=await aggregateRepairs("visibility",{throwOnError:true});
  clock=1;
  assert.equal(await runVisibilityOutcome(resolvedOutcome),true);
  assert.equal(gate.diagnostics().completedRuns,1,"resolved:true must advance the visibility success anchor normally");
  assert.equal(gate.diagnostics().lastCompletedAt,1);

  console.log("chart boundary integrity tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
