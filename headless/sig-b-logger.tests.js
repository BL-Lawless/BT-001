"use strict";

const assert=require("assert");
const fs=require("fs");
const browserAssembler=require("../features/pressure-signal/engines/signal-b-supabase-logger.js");
const portable=require("../features/pressure-signal/engines/signal-b-snapshot-assembler.js");
const {loadSignalBEngine}=require("./signal-b-engine-loader.js");
const {signalSnapshot,SYMBOL,HORIZON_ID,DIRECTION_MODE}=require("./run-sig-b.js");

const diagnostics={directionalPermissionScore:64,setupScore:61,setupBreakdown:{a:1},triggerScore:52,triggerBreakdown:{b:2},currentEntryScore:70,currentEntryBreakdown:{c:3},readinessScore:67,readinessBreakdown:{d:4},hardGates:{passed:["freshData"],failed:[],pending:[]},flowEffectiveness:{effective:true},chaseDistanceAtr:.1,chaseWarning:false,remainingRewardRisk:"INVALID",rewardRiskStatus:"INVALID",finalStateReason:"fixture",publicationGeneration:3,engineVersion:"1.1.0",decision:{state:"WATCHING"},comparisonDiagnostics:{detail:true}};
const output={engineId:"B",engineVersion:"1.1.0",direction:"LONG",entryState:"WATCHING",setupIdentity:"fixture",setupTimeframe:"5m",comparisonDiagnostics:diagnostics,decision:{diagnostic:true},secondaryReasons:["keep"],dataStatus:"sufficient",automaticDirection:"LONG",__engineToken:"keep-token"};
const evaluation={output,symbol:"BTCUSDT",horizonId:"quick",publicationGeneration:3},now=1712345678901;
assert.deepStrictEqual(portable.buildSignalBSnapshotRow({evaluation,machineId:"vm",now:()=>now}),browserAssembler.buildSnapshotPayload({evaluation,machineId:"vm",now:()=>now}));
const row=portable.buildSignalBSnapshotRow({evaluation,machineId:"vm",now:()=>now});
assert.deepStrictEqual(row.signal_output,output,"signal_output must remain the complete untrimmed engine output");

const state={privateCandlesByTf:{"1m":[{time:1,close:100,closeTime:1000,final:true}],"5m":[{time:1,close:99,closeTime:1000,final:true}]},privateFormingByTf:{"1m":{time:2,close:101,closeTime:2000,final:false}}};
const snapshot=signalSnapshot(state,{now:()=>2001},7);
assert.equal(snapshot.symbol,SYMBOL);assert.equal(snapshot.horizonId,HORIZON_ID);assert.equal(DIRECTION_MODE,"AUTO");
assert.equal(snapshot.closedByTf["1m"].length,1);assert.equal(snapshot.rowsByTf["1m"].length,2);assert.equal(snapshot.currentPrice,101);
const engine=loadSignalBEngine();assert.equal(engine.id,"B");assert.equal(typeof engine.evaluate,"function");
const runnerSource=fs.readFileSync(require.resolve("./run-sig-b.js"),"utf8"),orchestrationSource=fs.readFileSync(require.resolve("../features/pressure-signal/sssc/orchestration.js"),"utf8"),dataSource=fs.readFileSync(require.resolve("./binance-data-source.js"),"utf8");
assert(runnerSource.includes("createOrchestration"),"Sig B must reuse the SSSC candle/WebSocket orchestration");
assert(orchestrationSource.includes('connectionKey:"sssc-private-market-data",reconnect:true')&&orchestrationSource.includes("repairContinuity(target,reconnect?\"ws-reconnect\""),"SSSC reconnect must trigger atomic REST reseed");
assert(dataSource.includes("||90000")&&dataSource.includes('failConnection("message-stall")')&&dataSource.includes("socket.ping()")&&dataSource.includes('candidate.on("pong"'),"shared feed must retain the 90-second watchdog and ping/pong health check");

console.log("Headless Signal B logger tests: PASS");
