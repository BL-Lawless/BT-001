"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const main=fs.readFileSync(path.resolve(__dirname,"..","main.js"),"utf8");
  const sourceBetween=(start,end)=>{
    let from=main.indexOf(`function ${start}`);
    let to=main.indexOf(`function ${end}`,from);
    assert(from>=0&&to>from,`${start} must remain independently testable`);
    if(main.slice(from-6,from)==="async ")from-=6;
    if(main.slice(to-6,to)==="async ")to-=6;
    return main.slice(from,to).trim();
  };

  let closed=[];
  let clock=1000;
  const pendingRest=[];
  const warnings=[];
  const context=vm.createContext({
    Array,Math,Number,Object,Promise,Set,String,
    KLINE_LIMIT:1500,
    window:{},
    state:{},
    now:()=>clock++,
    ivSec:()=>60,
    getClosedBuffer:()=>closed,
    getFormingCandle:()=>null,
    ensureBufferSymbol:()=>"BTCUSDT",
    sharedTfConfig:()=>({cap:10}),
    intervalKeep:()=>10,
    cfg:()=>({symbol:"BTCUSDT"}),
    klinesForInterval:()=>new Promise(resolve=>pendingRest.push(resolve)),
    rebuildClosedStateFromRows:(_tf,rows)=>{
      closed=rows.map(row=>({...row,time:Number(row.time),final:true,source:"rest"})).sort((a,b)=>a.time-b.time);
      return {closed,forming:null};
    },
    normalizeCandleRow:(_tf,row)=>({...row,time:Number(row.time),final:true,source:"rest"}),
    isFormingRow:()=>false,
    setFormingCandle:()=>null,
    upsertClosedBuffer:()=>({closedChanged:false}),
    prependClosedBuffer:()=>closed,
    warnIntegrity:(key,message,detail)=>warnings.push({key,message,detail}),
    repairMissingClosedCandles:async()=>({resolved:true})
  });

  vm.runInContext(sourceBetween("detectClosedBoundaryIssues","recordClosedBoundaryDiagnostic"),context);
  vm.runInContext(sourceBetween("recordClosedBoundaryDiagnostic","validateClosedBuffer"),context);
  vm.runInContext(sourceBetween("validateClosedBuffer","inspectTimeframeBuffer"),context);
  vm.runInContext(sourceBetween("ingestRestRows","seedBuffer"),context);
  vm.runInContext(sourceBetween("seedBuffer","prepareTimeframeBuffer"),context);

  const candle=(index,base=100)=>({
    time:1000+index*60,open:base,high:base+2,low:base-2,close:base,volume:10
  });
  const older=[candle(0,100),candle(1,101),candle(2,102)];
  const newer=[candle(0,200),candle(1,201),candle(2,202)];

  const first=context.seedBuffer("1m",2,false);
  const second=context.seedBuffer("1m",2,false);
  assert.equal(pendingRest.length,2,"back-to-back seedBuffer calls must expose the current duplicate in-flight REST race");

  pendingRest[1](newer);
  await second;
  pendingRest[0](older);
  await first;

  const raceLog=context.window.__candleBoundaryDiagLog;
  assert.equal(raceLog,undefined,"two individually continuous REST seeds must not create a boundary warning, even when they finish out of order");
  assert.deepEqual(JSON.parse(JSON.stringify(closed)),older.map(row=>({...row,final:true,source:"rest"})),"the slower seed currently replaces the newer seed result");

  console.log("seed race diagnostic log:",raceLog||[]);
  console.log("chart seed race tests: PASS");
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
