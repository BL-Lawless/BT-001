"use strict";

const TABLE="sig_b_snapshots";
const SNAPSHOT_INTERVAL_MS=30000;

function finiteOrNull(value){
  if(value==null||typeof value==="string"&&!value.trim())return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function clone(value){
  if(value==null)return value;
  try{return JSON.parse(JSON.stringify(value));}catch(_error){return null;}
}

function buildSignalBSnapshotRow({evaluation,machineId,now=Date.now}={}){
  const resolvedMachineId=String(machineId||"").trim(),output=evaluation&&evaluation.output,comparison=output&&output.comparisonDiagnostics;
  if(!resolvedMachineId||!output||output.engineId!=="B"||!comparison)return null;
  return {
    event_at:new Date(now()).toISOString(),symbol:String(evaluation.symbol||""),machine_id:resolvedMachineId,
    direction:output.direction||null,entry_state:output.entryState||null,
    confidence:finiteOrNull(comparison.directionalPermissionScore??output.confidence),
    setup_score:finiteOrNull(comparison.setupScore),setup_breakdown:clone(comparison.setupBreakdown)||{},
    trigger_score:finiteOrNull(comparison.triggerScore),trigger_breakdown:clone(comparison.triggerBreakdown)||{},
    current_entry_score:finiteOrNull(comparison.currentEntryScore),current_entry_breakdown:clone(comparison.currentEntryBreakdown)||{},
    readiness_score:finiteOrNull(comparison.readinessScore??output.readinessScore),readiness_breakdown:clone(comparison.readinessBreakdown)||{},
    hard_gates:clone(comparison.hardGates)||{passed:[],failed:[],pending:[]},flow_effectiveness:clone(comparison.flowEffectiveness)||{},
    chase_distance_atr:finiteOrNull(comparison.chaseDistanceAtr),chase_warning:comparison.chaseWarning===true,
    remaining_reward_risk:comparison.remainingRewardRisk==="INVALID"?"INVALID":finiteOrNull(comparison.remainingRewardRisk),
    reward_risk_status:comparison.rewardRiskStatus||null,final_state_reason:comparison.finalStateReason||null,
    setup_identity:output.setupIdentity||null,setup_timeframe:output.setupTimeframe||null,horizon_id:evaluation.horizonId||null,
    publication_generation:finiteOrNull(evaluation.publicationGeneration??comparison.publicationGeneration),
    engine_version:output.engineVersion||comparison.engineVersion||null,
    signal_output:clone(output)||{}
  };
}

module.exports={TABLE,SNAPSHOT_INTERVAL_MS,finiteOrNull,clone,buildSignalBSnapshotRow};
