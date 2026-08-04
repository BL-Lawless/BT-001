(() => {
  "use strict";

  const SNAPSHOT_INTERVAL_MS=30000;
  const LOGGED_INTERVALS=Object.freeze(["1m","3m","5m","15m","1h"]);
  const finiteOrNull=value=>{
    if(value==null||typeof value==="string"&&!value.trim())return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  };
  const copyObject=value=>value&&typeof value==="object"?{...value}:null;

  function diagnosticsByInterval(snapshot){
    const diagnostics=Object.values(snapshot&&snapshot.data||{}),indexed={};
    for(const diagnostic of diagnostics){
      const interval=String(diagnostic&&diagnostic.interval||"").toLowerCase();
      if(interval)indexed[interval]=diagnostic;
    }
    return indexed;
  }

  function timeframePayload(diagnostic,interval,calculation){
    const role=calculation&&calculation.TIMEFRAME_ROLES&&calculation.TIMEFRAME_ROLES[interval]?.role||null;
    return {
      available:true,direction:finiteOrNull(diagnostic.direction),
      directionalStrength:finiteOrNull(diagnostic.directionalStrength),
      acceleration:finiteOrNull(diagnostic.acceleration),
      expansionContraction:finiteOrNull(diagnostic.expansionContraction),
      signedAcceleration:finiteOrNull(diagnostic.signedAcceleration),
      directionalAcceleration:finiteOrNull(diagnostic.directionalAcceleration),
      stackDir:finiteOrNull(diagnostic.stackDir),slopeDir:finiteOrNull(diagnostic.slopeDir),
      sprDir:finiteOrNull(diagnostic.sprDir),crossoverContribution:finiteOrNull(diagnostic.crossoverContribution),
      atr:finiteOrNull(diagnostic.atr),atrBps:finiteOrNull(diagnostic.atrInBps),
      recentRV:finiteOrNull(diagnostic.RV&&diagnostic.RV.recent),
      priorRV:finiteOrNull(diagnostic.RV&&diagnostic.RV.prior),
      resolvedElapsedHorizons:copyObject(diagnostic.resolvedElapsedHorizons),role,
      reliability:diagnostic.reliability||null,phase:diagnostic.phase||null,state:diagnostic.state||null
    };
  }

  function unavailableTimeframePayload(diagnostic,interval,calculation){
    const role=calculation&&calculation.TIMEFRAME_ROLES&&calculation.TIMEFRAME_ROLES[interval]?.role||null;
    return {available:false,reason:String(diagnostic&&diagnostic.reason||"diagnostic-unavailable"),role,reliability:diagnostic&&diagnostic.reliability||null};
  }

  function buildSnapshotPayload({snapshot,calculation,symbol,machineId,now=Date.now}={}){
    if(!snapshot||snapshot.started!==true||!calculation)return null;
    const resolvedMachineId=String(machineId||"").trim();
    if(!resolvedMachineId)return null;
    const indexed=diagnosticsByInterval(snapshot),timeframes={},missingTimeframes=[];
    for(const interval of LOGGED_INTERVALS){
      const diagnostic=indexed[interval];
      if(diagnostic&&diagnostic.available===true)timeframes[interval]=timeframePayload(diagnostic,interval,calculation);
      else{missingTimeframes.push(interval);timeframes[interval]=unavailableTimeframePayload(diagnostic,interval,calculation);}
    }
    const allDiagnostics=Object.values(snapshot.data||{}),summary=calculation.aggregate(allDiagnostics),marketRead=calculation.evaluateMarketSetup(summary);
    const aggregate={
      marketBias:finiteOrNull(marketRead.marketBias),marketStrength:finiteOrNull(marketRead.marketStrength),
      marketAcceleration:finiteOrNull(marketRead.marketAcceleration),aggregateConfidence:finiteOrNull(marketRead.aggregateConfidence),
      timingRisk:finiteOrNull(marketRead.timingRisk),setupAction:marketRead.setupAction||null,
      roleCoverage:copyObject(summary.roleCoverage)||{},alignment:finiteOrNull(summary.alignment),
      coverage:finiteOrNull(summary.coverage),reason:marketRead.reason||null,
      unanimousStrongOpposition:summary.triggerRisk&&summary.triggerRisk.unanimousStrongOpposition===true,missingTimeframes
    };
    return {event_at:new Date(now()).toISOString(),machine_id:resolvedMachineId,symbol:String(symbol||""),timeframes,aggregate};
  }

  function createSnapshotLogger(options={}){
    const {getSnapshot,getCalculation,getSymbol,getSupabase}=options;
    const now=typeof options.now==="function"?options.now:Date.now;
    const warn=typeof options.warn==="function"?options.warn:()=>{};
    let started=false;
    function capture(){
      try{
        const supabase=typeof getSupabase==="function"?getSupabase():null;
        if(!supabase||(typeof supabase.setLatestSnapshot!=="function"&&typeof supabase.log!=="function"))return false;
        if(typeof supabase.configured==="function"&&!supabase.configured())return false;
        const machineId=typeof supabase.getDeviceId==="function"?supabase.getDeviceId():null;
        if(!String(machineId||"").trim()){warn("[SSSC Supabase] Snapshot skipped: machine_id is unavailable.");return false;}
        const payload=buildSnapshotPayload({
          snapshot:typeof getSnapshot==="function"?getSnapshot():null,
          calculation:typeof getCalculation==="function"?getCalculation():null,
          symbol:typeof getSymbol==="function"?getSymbol():"",machineId,now
        });
        if(!payload)return false;
        try{if(typeof supabase.setLatestSnapshot==="function")supabase.setLatestSnapshot(payload);else supabase.log("sssc_snapshots",payload);}catch(_error){}
        return true;
      }catch(_error){return false;}
    }
    function start(){
      if(started)return;
      started=true;capture();
      try{const supabase=typeof getSupabase==="function"?getSupabase():null;if(supabase&&typeof supabase.startSnapshotLogging==="function")supabase.startSnapshotLogging();}catch(_error){}
    }
    function stop(){
      try{const supabase=typeof getSupabase==="function"?getSupabase():null;if(supabase&&typeof supabase.stopSnapshotLogging==="function")supabase.stopSnapshotLogging();}catch(_error){}
      started=false;
    }
    return Object.freeze({start,stop,capture,status:()=>Object.freeze({started,intervalMs:SNAPSHOT_INTERVAL_MS})});
  }

  const api=Object.freeze({SNAPSHOT_INTERVAL_MS,LOGGED_INTERVALS,buildSnapshotPayload,createSnapshotLogger});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_SNAPSHOT_LOGGER_CORE=api;
})();
