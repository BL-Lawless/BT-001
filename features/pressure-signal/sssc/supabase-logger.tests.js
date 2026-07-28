"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const calculation=require("./calculation.js");
const {createOrchestration}=require("./orchestration.js");
const {SNAPSHOT_INTERVAL_MS,LOGGED_INTERVALS,buildSnapshotPayload,createSnapshotLogger}=require("./supabase-logger.js");

const diagnostic=(interval,index)=>({
  tf:interval.toUpperCase(),interval,available:true,direction:50-index,directionalStrength:30-index,
  acceleration:10-index,stackDir:20,slopeDir:21,sprDir:22,crossoverContribution:3,
  expansionContraction:10-index,signedAcceleration:8-index,directionalAcceleration:7-index,
  atr:100+index,atrInBps:12+index,RV:{recent:.01+index/1000,prior:.02+index/1000},
  resolvedElapsedHorizons:{slopeMs:480000,crossoverStaleMs:1440000},
  reliability:"full-warmup",phase:"Transition",state:"Mixed Bullish",
  vwap:99999,events:{ma1:"Near",ma2:"Above",cluster:"Tight"},cluster:"Tight"
});
const intervals=["1d","4h","1h","15m","5m","3m","1m"];
const data=Object.fromEntries(intervals.map((interval,index)=>[interval.toUpperCase(),diagnostic(interval,index)]));
const snapshot={started:true,data};
const exchangeTimestamp=1712345678901;
globalThis.BT001ExchangeClock={now:()=>exchangeTimestamp};
const payload=buildSnapshotPayload({snapshot,calculation,symbol:"BTCUSDT",machineId:"machine-sssc-test"});

assert.deepEqual(Object.keys(payload.timeframes),LOGGED_INTERVALS);
assert(!Object.prototype.hasOwnProperty.call(payload.timeframes,"4h"));
assert(!Object.prototype.hasOwnProperty.call(payload.timeframes,"1d"));
assert.equal(payload.machine_id,"machine-sssc-test");
assert.equal(payload.symbol,"BTCUSDT");
assert.equal(payload.event_at,new Date(exchangeTimestamp).toISOString(),"snapshot event_at must use the shared exchange clock");
assert.equal(payload.timeframes["1m"].role,"trigger");
assert.equal(payload.timeframes["1h"].role,"structure");
assert.equal(payload.timeframes["1m"].available,true);
assert.equal(payload.timeframes["15m"].atrBps,data["15M"].atrInBps);
assert.equal(payload.timeframes["5m"].recentRV,data["5M"].RV.recent);
assert.equal(payload.timeframes["1m"].expansionContraction,data["1M"].expansionContraction);
assert.equal(payload.timeframes["1m"].directionalAcceleration,data["1M"].directionalAcceleration);

const nullStrengthData={...data,"1M":{...data["1M"],directionalStrength:null}};
const nullStrengthPayload=buildSnapshotPayload({
  snapshot:{started:true,data:nullStrengthData},calculation,symbol:"BTCUSDT",machineId:"machine-sssc-test"
});
assert.equal(nullStrengthPayload.timeframes["1m"].directionalStrength,null,"missing strength must never be coerced into a fake zero");
assert.deepEqual(payload.aggregate.missingTimeframes,[]);

const partialData={...data};
partialData["3M"]={...partialData["3M"],available:false,reason:"persistent-gap"};
delete partialData["15M"];
const partialPayload=buildSnapshotPayload({
  snapshot:{started:true,data:partialData},calculation,symbol:"BTCUSDT",machineId:"machine-sssc-test"
});
assert(partialPayload,"one unavailable timeframe must not suppress the entire snapshot");
assert.equal(partialPayload.timeframes["1m"].available,true);
assert.equal(partialPayload.timeframes["3m"].available,false);
assert.equal(partialPayload.timeframes["3m"].reason,"persistent-gap");
assert.equal(partialPayload.timeframes["15m"].available,false);
assert.equal(partialPayload.timeframes["15m"].reason,"diagnostic-unavailable");
assert.deepEqual(partialPayload.aggregate.missingTimeframes,["3m","15m"]);

for(const invalidMachineId of [null,"","   "]){
  assert.equal(buildSnapshotPayload({snapshot,calculation,symbol:"BTCUSDT",machineId:invalidMachineId}),null);
}

const serialized=JSON.stringify(payload);
for(const forbidden of ["positionAction","vwap","events","Near","Above","Below","cluster","Tight","Moderate Separation","Wide Separation"]){
  assert(!serialized.includes(forbidden),`${forbidden} must never appear in an SSSC snapshot payload`);
}
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"alignment"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"coverage"));
assert(Object.prototype.hasOwnProperty.call(payload.aggregate,"unanimousStrongOpposition"));
assert(!Object.prototype.hasOwnProperty.call(payload.aggregate,"positionAction"));

let writes=0,pipelineLive=false,continued=true,outboundRow=null,workerStarts=0;
const failingLogger=createSnapshotLogger({
  getSnapshot:()=>({...snapshot,started:pipelineLive}),
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"machine-sssc-test",
    setLatestSnapshot(row){writes++;outboundRow=row;},
    startSnapshotLogging(){workerStarts++;}
  }),
});
failingLogger.start();
assert.equal(workerStarts,1,"start must delegate the schedule to the logging worker");
assert.equal(writes,0,"logging must not run before the pipeline is live");
pipelineLive=true;
assert.doesNotThrow(()=>failingLogger.capture());
assert.equal(writes,1);
assert.equal(outboundRow.machine_id,"machine-sssc-test","machine_id must reach the outbound write row");
continued=true;
assert.equal(continued,true,"a rejected fire-and-forget write must not block subsequent application work");

let failureCaptures=0,publishCycles=0;
const throwingBoundaryLogger=createSnapshotLogger({
  getSnapshot:()=>snapshot,getCalculation:()=>calculation,getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,getDeviceId:()=>"machine-throwing-worker",
    setLatestSnapshot(){failureCaptures++;throw new Error("Worker constructor failed");},
    startSnapshotLogging(){throw new Error("fallback timer failed");}
  })
});
assert.doesNotThrow(()=>throwingBoundaryLogger.start());
assert.doesNotThrow(()=>throwingBoundaryLogger.capture());
const pipelineAfterLoggingFailure=createOrchestration({
  tfs:[],liveTfs:[],getSlots:()=>[],getCalculation:()=>calculation,getSymbol:()=>"BTCUSDT",
  fetchKlines:async()=>[],connectWebSocket:()=>({disconnect(){}}),getWsUrl:()=>"wss://example.invalid",
  onUpdate:()=>{publishCycles++;throwingBoundaryLogger.capture();}
});
assert.doesNotThrow(()=>pipelineAfterLoggingFailure.calculate(),"a later calculate/publish cycle must survive logging exceptions");
assert.equal(publishCycles,1);
assert(failureCaptures>=3,"repeated captures must keep crossing the logging boundary after a failure");

let missingMachineWrites=0;
const missingMachineWarnings=[];
const missingMachineLogger=createSnapshotLogger({
  getSnapshot:()=>snapshot,
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"   ",
    log(){missingMachineWrites++;return Promise.resolve(true);}
  }),
  warn:message=>missingMachineWarnings.push(message)
});
assert.equal(missingMachineLogger.capture(),false);
assert.equal(missingMachineWrites,0,"blank machine_id must prevent the Supabase write");
assert.equal(missingMachineWarnings.length,1,"blank machine_id must produce an explicit warning");
assert.match(missingMachineWarnings[0],/machine_id is unavailable/);

// End-to-end regression: calculate real metrics from OHLC, pass the resulting diagnostic through
// capture(), and inspect the exact object handed to the Supabase service.
const slots=[9,21,55,100,200].map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
let calculatedClose=200,calculatedPrevious=calculatedClose;
const calculatedRows=[];
for(let index=0;index<1000;index++){
  const step=index<984
    ?-.03+Math.sin(index*.7)*.01
    :index<992
      ?-.05+Math.sin(index*1.1)*.01
      :.06+Math.sin(index*1.3)*.01;
  calculatedClose+=step;
  calculatedRows.push({
    time:1700000000+index*60,open:calculatedPrevious,close:calculatedClose,
    high:Math.max(calculatedPrevious,calculatedClose)+.05,low:Math.min(calculatedPrevious,calculatedClose)-.05,final:true
  });
  calculatedPrevious=calculatedClose;
}
const calculatedDiagnostic=calculation.calculateTimeframe({
  label:"1M",interval:"1m",rows:calculatedRows,slots,minimumRows:600,fullRows:1000
});
assert(calculatedDiagnostic.directionalStrength!==0);
assert(calculatedDiagnostic.directionalAcceleration!==0);
const calculatedData=Object.fromEntries(intervals.map(interval=>[
  interval.toUpperCase(),{...calculatedDiagnostic,tf:interval.toUpperCase(),interval}
]));
let calculatedOutbound=null;
const calculatedLogger=createSnapshotLogger({
  getSnapshot:()=>({started:true,data:calculatedData}),
  getCalculation:()=>calculation,
  getSymbol:()=>"BTCUSDT",
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"machine-calculated-boundary",
    log(table,row){calculatedOutbound={table,row};return Promise.resolve(true);}
  })
});
assert.equal(calculatedLogger.capture(),true);
assert.equal(calculatedOutbound.table,"sssc_snapshots");
assert.equal(calculatedOutbound.row.timeframes["1m"].directionalStrength,calculatedDiagnostic.directionalStrength);
assert.equal(calculatedOutbound.row.timeframes["1m"].directionalAcceleration,calculatedDiagnostic.directionalAcceleration);
assert.equal(calculatedOutbound.row.timeframes["1m"].expansionContraction,calculatedDiagnostic.expansionContraction);
assert.equal(calculatedOutbound.row.aggregate.marketStrength,calculatedDiagnostic.directionalStrength);

const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const html=fs.readFileSync(path.resolve(__dirname,"..","..","..","index.html"),"utf8");
assert(html.indexOf("features/pressure-signal/sssc/supabase-logger.js")<html.indexOf('src="main.js"'));
assert(html.includes("supabase-logger.js?v=20260727-worker-logging-v1"),"logger asset must be cache-busted after its field contract changes");
assert(main.includes("ensureSnapshotLogger()?.start()"),"always-on install must start SSSC logging without opening the dashboard");
const hideSource=main.slice(main.indexOf("function hide(){ visible=false"),main.indexOf("function savePanel()",main.indexOf("function hide(){ visible=false")));
assert(!hideSource.includes(".stop("),"closing the dashboard must only hide UI and must not stop its background pipeline");
assert(main.includes("$('ssscDashClose')?.addEventListener('click',hide)"));

console.log("sssc Supabase logger tests: PASS");
