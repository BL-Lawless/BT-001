"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {SNAPSHOT_INTERVAL_MS,buildSnapshotPayload,createSnapshotLogger,setLatestEvaluation,getLatestEvaluation}=require("./signal-b-supabase-logger.js");

const comparisonDiagnostics={
  directionalPermissionScore:84,
  setupScore:86.2,setupBreakdown:{structuralLocation:90,regimeAlignment:86},
  triggerScore:82.4,triggerBreakdown:{postInteractionMicrostructure:92.8,directionalFlowEffectiveness:81.8},
  currentEntryScore:88.1,currentEntryBreakdown:{distanceFromOrigin:97.3,remainingRoomNetRewardRisk:100},
  readinessScore:89.7,readinessBreakdown:{gateProgressContribution:40,triggerScoreContribution:12.36,setupScoreContribution:8.62,currentEntryScoreContribution:22.025,bonusContribution:6.695,chaseDampener:.973,total:89.7},
  hardGates:{passed:["freshData","validSetup"],failed:[],pending:[]},
  flowEffectiveness:{effective:true,priceProgressAtr:.72,directionalCloseShare:.75},
  chaseDistanceAtr:.22,chaseWarning:false,remainingRewardRisk:2.1,rewardRiskStatus:"VALID",
  finalStateReason:"All activation gates passed.",publicationGeneration:17,engineVersion:"1.1.0"
};
const output={
  engineId:"B",engineVersion:"1.1.0",direction:"LONG",entryState:"TRIGGER ACTIVE",confidence:84,
  setupIdentity:"BTCUSDT|quick|LONG|structural-retest",setupTimeframe:"5m",
  comparisonDiagnostics
};
const evaluation={output,symbol:"BTCUSDT",horizonId:"quick",publicationGeneration:17};
const timestamp=1712345678901;
const payload=buildSnapshotPayload({evaluation,machineId:"machine-sig-b-test",now:()=>timestamp});

assert.equal(SNAPSHOT_INTERVAL_MS,30000);
assert.equal(payload.event_at,new Date(timestamp).toISOString());
assert.equal(payload.machine_id,"machine-sig-b-test");
assert.equal(payload.symbol,"BTCUSDT");
assert.equal(payload.direction,"LONG");
assert.equal(payload.entry_state,"TRIGGER ACTIVE");
assert.equal(payload.confidence,84);
assert.equal(payload.setup_score,86.2);
assert.deepEqual(payload.setup_breakdown,comparisonDiagnostics.setupBreakdown);
assert.equal(payload.trigger_score,82.4);
assert.deepEqual(payload.trigger_breakdown,comparisonDiagnostics.triggerBreakdown);
assert.equal(payload.current_entry_score,88.1);
assert.deepEqual(payload.current_entry_breakdown,comparisonDiagnostics.currentEntryBreakdown);
assert.equal(payload.readiness_score,89.7);
assert.deepEqual(payload.readiness_breakdown,comparisonDiagnostics.readinessBreakdown);
assert.deepEqual(payload.hard_gates,comparisonDiagnostics.hardGates);
assert.deepEqual(payload.flow_effectiveness,comparisonDiagnostics.flowEffectiveness);
assert.equal(payload.chase_distance_atr,.22);
assert.equal(payload.chase_warning,false);
assert.equal(payload.remaining_reward_risk,2.1);
assert.equal(payload.reward_risk_status,"VALID");
assert.equal(payload.final_state_reason,"All activation gates passed.");
assert.equal(payload.setup_identity,output.setupIdentity);
assert.equal(payload.setup_timeframe,"5m");
assert.equal(payload.horizon_id,"quick");
assert.equal(payload.publication_generation,17);
assert.equal(payload.engine_version,"1.1.0");
assert.deepEqual(payload.signal_output,output);
assert.equal(buildSnapshotPayload({evaluation,machineId:"   "}),null);

setLatestEvaluation(evaluation);
assert.strictEqual(getLatestEvaluation().output,output);

let intervalCallback=null,intervalDelay=null,writes=[],rejectionHandled=0;
const logger=createSnapshotLogger({
  getEvaluation:getLatestEvaluation,
  getSupabase:()=>({
    configured:()=>true,
    getDeviceId:()=>"machine-sig-b-test",
    log(table,row){
      writes.push({table,row});
      return {catch(handler){rejectionHandled++;handler(new Error("offline"));}};
    }
  }),
  now:()=>timestamp,
  setIntervalFn:(callback,delay)=>{intervalCallback=callback;intervalDelay=delay;return 7;},
  clearIntervalFn:()=>{}
});
assert.equal(logger.start(),true);
assert.equal(logger.start(),false);
assert.equal(intervalDelay,SNAPSHOT_INTERVAL_MS);
assert.equal(writes.length,1,"start performs the first observation write");
intervalCallback();
intervalCallback();
assert.equal(writes.length,3,"unchanged Signal B output must be logged on every interval without deduplication");
assert(writes.every(write=>write.table==="sig_b_snapshots"));
assert(writes.every(write=>write.row.machine_id==="machine-sig-b-test"));
assert.equal(rejectionHandled,3,"every fire-and-forget rejection must be handled");

let missingMachineWrites=0;
const warnings=[];
const missingMachineLogger=createSnapshotLogger({
  getEvaluation:()=>evaluation,
  getSupabase:()=>({configured:()=>true,getDeviceId:()=>" ",log(){missingMachineWrites++;}}),
  warn:message=>warnings.push(message),
  setIntervalFn:()=>1,clearIntervalFn:()=>{}
});
assert.equal(missingMachineLogger.capture(),false);
assert.equal(missingMachineWrites,0);
assert.equal(warnings.length,1);
assert.match(warnings[0],/machine_id is unavailable/);

const root=path.resolve(__dirname,"..","..","..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const indexSource=fs.readFileSync(path.join(root,"features/pressure-signal/index.js"),"utf8");
assert(html.indexOf("features/pressure-signal/engines/signal-b-supabase-logger.js")<html.indexOf('src="main.js"'));
assert(main.includes("ensureSignalBSnapshotLogger()?.start()"),"normal application installation must start Signal B logging without opening a panel");
assert(indexSource.includes('`Readiness score: ${comparison.readinessScore??"Unavailable"}`'));
assert(indexSource.includes('`Readiness breakdown: ${JSON.stringify(comparison.readinessBreakdown||{})}`'));
assert(indexSource.indexOf("Directional permission score:")<indexSource.indexOf("Readiness score:"));
assert(indexSource.indexOf("Readiness breakdown:")<indexSource.indexOf("Setup score:"));

console.log("Signal B Supabase logger tests: PASS");
