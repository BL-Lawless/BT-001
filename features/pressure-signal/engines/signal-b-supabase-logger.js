(() => {
  "use strict";

  const SNAPSHOT_INTERVAL_MS=30000;
  let latestEvaluation=null;
  const finiteOrNull=value=>{
    if(value==null||typeof value==="string"&&!value.trim())return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  };
  const clone=value=>{
    if(value==null)return value;
    try{return JSON.parse(JSON.stringify(value));}catch(_error){return null;}
  };

  function setLatestEvaluation(evaluation){
    latestEvaluation=evaluation&&evaluation.output?{
      output:evaluation.output,
      symbol:String(evaluation.symbol||""),
      horizonId:evaluation.horizonId||null,
      publicationGeneration:evaluation.publicationGeneration??null
    }:null;
    return latestEvaluation;
  }
  function getLatestEvaluation(){return latestEvaluation;}

  function buildSnapshotPayload({evaluation,machineId,now=Date.now}={}){
    const resolvedMachineId=String(machineId||"").trim(),output=evaluation&&evaluation.output,comparison=output&&output.comparisonDiagnostics;
    if(!resolvedMachineId||!output||output.engineId!=="B"||!comparison)return null;
    return {
      event_at:new Date(now()).toISOString(),
      symbol:String(evaluation.symbol||""),
      machine_id:resolvedMachineId,
      direction:output.direction||null,
      entry_state:output.entryState||null,
      confidence:finiteOrNull(comparison.directionalPermissionScore??output.confidence),
      setup_score:finiteOrNull(comparison.setupScore),
      setup_breakdown:clone(comparison.setupBreakdown)||{},
      trigger_score:finiteOrNull(comparison.triggerScore),
      trigger_breakdown:clone(comparison.triggerBreakdown)||{},
      current_entry_score:finiteOrNull(comparison.currentEntryScore),
      current_entry_breakdown:clone(comparison.currentEntryBreakdown)||{},
      readiness_score:finiteOrNull(comparison.readinessScore??output.readinessScore),
      readiness_breakdown:clone(comparison.readinessBreakdown)||{},
      hard_gates:clone(comparison.hardGates)||{passed:[],failed:[],pending:[]},
      flow_effectiveness:clone(comparison.flowEffectiveness)||{},
      chase_distance_atr:finiteOrNull(comparison.chaseDistanceAtr),
      chase_warning:comparison.chaseWarning===true,
      remaining_reward_risk:comparison.remainingRewardRisk==="INVALID"?"INVALID":finiteOrNull(comparison.remainingRewardRisk),
      reward_risk_status:comparison.rewardRiskStatus||null,
      final_state_reason:comparison.finalStateReason||null,
      setup_identity:output.setupIdentity||null,
      setup_timeframe:output.setupTimeframe||null,
      horizon_id:evaluation.horizonId||null,
      publication_generation:finiteOrNull(evaluation.publicationGeneration??comparison.publicationGeneration),
      engine_version:output.engineVersion||comparison.engineVersion||null,
      signal_output:clone(output)||{}
    };
  }

  function createSnapshotLogger(options={}){
    const getEvaluation=typeof options.getEvaluation==="function"?options.getEvaluation:getLatestEvaluation;
    const getSupabase=typeof options.getSupabase==="function"?options.getSupabase:()=>null;
    const now=typeof options.now==="function"?options.now:Date.now;
    const setIntervalFn=typeof options.setIntervalFn==="function"?options.setIntervalFn:setInterval;
    const clearIntervalFn=typeof options.clearIntervalFn==="function"?options.clearIntervalFn:clearInterval;
    const warn=typeof options.warn==="function"?options.warn:()=>{};
    let started=false,timer=null;
    function capture(){
      try{
        const supabase=getSupabase();
        if(!supabase||typeof supabase.log!=="function")return false;
        if(typeof supabase.configured==="function"&&!supabase.configured())return false;
        const machineId=typeof supabase.getDeviceId==="function"?supabase.getDeviceId():null;
        if(!String(machineId||"").trim()){warn("[Signal B Supabase] Snapshot skipped: machine_id is unavailable.");return false;}
        const payload=buildSnapshotPayload({evaluation:getEvaluation(),machineId,now});
        if(!payload)return false;
        try{
          const pending=supabase.log("sig_b_snapshots",payload);
          if(pending&&typeof pending.catch==="function")pending.catch(()=>{});
        }catch(_error){}
        return true;
      }catch(_error){return false;}
    }
    function start(){
      if(started)return false;
      started=true;
      capture();
      try{timer=setIntervalFn(capture,SNAPSHOT_INTERVAL_MS);}catch(_error){timer=null;}
      return true;
    }
    function stop(){
      if(timer!=null)try{clearIntervalFn(timer);}catch(_error){}
      timer=null;started=false;
    }
    return Object.freeze({start,stop,capture,status:()=>Object.freeze({started,intervalMs:SNAPSHOT_INTERVAL_MS})});
  }

  const api=Object.freeze({SNAPSHOT_INTERVAL_MS,buildSnapshotPayload,createSnapshotLogger,setLatestEvaluation,getLatestEvaluation});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SIGNAL_B_SUPABASE_LOGGER=api;
})();
