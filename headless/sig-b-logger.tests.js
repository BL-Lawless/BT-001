"use strict";

const assert=require("assert");
const fs=require("fs");
const portable=require("../features/pressure-signal/engines/signal-b-snapshot-assembler.js");
const {loadSignalBEngine}=require("./signal-b-engine-loader.js");
const {createPressureSignalDataFeed}=require("../features/pressure-signal/data-feed.js");
const {signalSnapshot,marketRevision,scoreRevision,digest,traceEvaluationInputs,SYMBOL,HORIZON_ID,DIRECTION_MODE}=require("./run-sig-b.js");

const diagnostics={directionalPermissionScore:64,setupScore:61,setupBreakdown:{a:1},triggerScore:52,triggerBreakdown:{b:2},currentEntryScore:70,currentEntryBreakdown:{c:3},readinessScore:67,readinessBreakdown:{d:4},hardGates:{passed:["freshData"],failed:[],pending:[]},flowEffectiveness:{effective:true},chaseDistanceAtr:.1,chaseWarning:false,remainingRewardRisk:"INVALID",rewardRiskStatus:"INVALID",finalStateReason:"fixture",publicationGeneration:3,engineVersion:"1.1.0",decision:{state:"WATCHING"},comparisonDiagnostics:{detail:true}};
const output={engineId:"B",engineVersion:"1.1.0",direction:"LONG",entryState:"WATCHING",setupIdentity:"fixture",setupTimeframe:"5m",comparisonDiagnostics:diagnostics,decision:{diagnostic:true},secondaryReasons:["keep"],dataStatus:"sufficient",automaticDirection:"LONG",__engineToken:"keep-token"};
const evaluation={output,symbol:"BTCUSDT",horizonId:"quick",publicationGeneration:3},now=1712345678901;
const row=portable.buildSignalBSnapshotRow({evaluation,machineId:"vm",now:()=>now});
assert.equal(row.machine_id,"vm");assert.equal(row.symbol,"BTCUSDT");assert.equal(row.setup_score,61);assert.equal(row.trigger_score,52);assert.equal(row.readiness_score,67);
assert.deepStrictEqual(row.signal_output,output,"signal_output must remain the complete untrimmed engine output");

const state={closed:{"1m":[{time:1,close:100,closeTime:1000,final:true}],"5m":[{time:1,close:99,closeTime:1000,final:true}]},forming:{"1m":{time:2,close:101,closeTime:2000,final:false}}};
function fakeFeed(source=state){return {getClosedBuffer:tf=>(source.closed[tf]||[]).map(row=>({...row})),getFormingCandle:tf=>source.forming[tf]?{...source.forming[tf]}:null,
  getLiveBuffer(tf){const closed=this.getClosedBuffer(tf),forming=this.getFormingCandle(tf);return forming?[...closed,forming]:closed;},
  getCurrentPrice:()=>({value:source.forming["1m"]&&source.forming["1m"].close,source:"aggTrade",at:2000}),isPriceFresh:()=>true,
  getTimeframeRevisions:tf=>({symbol:"BTCUSDT",tf,closedRevision:(source.closed[tf]||[]).length,formingRevision:source.forming[tf]?JSON.stringify(source.forming[tf]):"none"}),
  getAuthoritativeMaSnapshot:()=>({valuesBySlot:{}})};}
const snapshotRequirements={timeframes:["1m","5m"],items:[{tf:"1m",historyTarget:2900},{tf:"5m",historyTarget:596}],slots:[]};
const snapshot=signalSnapshot(fakeFeed(),snapshotRequirements,{now:()=>2001},7);
assert.equal(snapshot.symbol,SYMBOL);assert.equal(snapshot.horizonId,HORIZON_ID);assert.equal(DIRECTION_MODE,"AUTO");
assert.equal(snapshot.closedByTf["1m"].length,1);assert.equal(snapshot.rowsByTf["1m"].length,2);assert.equal(snapshot.currentPrice,101);
const changedState={...state,forming:{"1m":{...state.forming["1m"],volume:50,quoteVolume:5000,tradeCount:12,takerBuyBase:40,takerBuyQuote:4000}}};
const flowChanged=signalSnapshot(fakeFeed(changedState),snapshotRequirements,{now:()=>2002},8);
assert.notEqual(flowChanged.signature,snapshot.signature,"volume/flow changes at an unchanged close must invalidate the Engine B cache");
assert.notEqual(marketRevision(fakeFeed(),snapshotRequirements.timeframes),marketRevision(fakeFeed(changedState),snapshotRequirements.timeframes),"onUpdate telemetry must detect changed forming data");
assert.notEqual(digest(scoreRevision({...row,readiness_score:1})),digest(scoreRevision({...row,readiness_score:2})),"score telemetry must detect output changes");
const engine=loadSignalBEngine();assert.equal(engine.id,"B");assert.equal(typeof engine.evaluate,"function");
const traceRows=Array.from({length:320},(_,index)=>({time:1700000000+index*60,open:100+index*.1,high:101+index*.1,low:99+index*.1,close:100.5+index*.1,volume:100+index,quoteVolume:(100+index)*(100.5+index*.1),tradeCount:50+index,takerBuyBase:(100+index)*.55,takerBuyQuote:(100+index)*(100.5+index*.1)*.55,final:true}));
const traceSnapshot={symbol:"BTCUSDT",horizonId:"quick",createdAt:Date.now(),version:1,signature:"trace-fixture",currentPrice:traceRows.at(-1).close,closedByTf:Object.fromEntries(["1m","3m","5m","15m","1h","4h","1d"].map(tf=>[tf,traceRows])),rowsByTf:Object.fromEntries(["1m","3m","5m","15m","1h","4h","1d"].map(tf=>[tf,traceRows])),maByTf:{},structureByTf:{},freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};
const productionBefore=engine.diagnostics(),traced=traceEvaluationInputs(loadSignalBEngine(),traceSnapshot),productionAfter=engine.diagnostics();
assert.deepStrictEqual(productionAfter,productionBefore,"diagnostic extraction must not mutate the production engine");assert.equal(traced.closedTails["3m"].length,2);assert(traced.direction.breakdown);assert(traced.setupComponents);assert(traced.trigger.flow);
const runnerSource=fs.readFileSync(require.resolve("./run-sig-b.js"),"utf8"),dataSource=fs.readFileSync(require.resolve("./binance-data-source.js"),"utf8");
assert(runnerSource.includes("createPressureSignalDataFeed"),"VM Sig B must use the shared browser Signal feed");
assert(!/sssc|createOrchestration|getCalculation/.test(runnerSource),"VM Sig B must not import or invoke SSSC");
assert(dataSource.includes("||90000")&&dataSource.includes('failConnection("message-stall")')&&dataSource.includes("socket.ping()")&&dataSource.includes('candidate.on("pong"'),"shared feed must retain the 90-second watchdog and ping/pong health check");

console.log("Headless Signal B logger tests: PASS");
