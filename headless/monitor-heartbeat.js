"use strict";

const {spawnSync}=require("child_process");
const {loadDotEnv,required}=require("./config.js");

const DEFAULT_MACHINE_ID="vm-btc-sig-logger";
const DEFAULT_STALE_MS=180000;
const DEFAULT_FROZEN_ROWS=8;
const DEFAULT_INCIDENT_DEDUPE_MS=21600000;
const DEFAULT_MA_STACK_FAST_STALE_MS=90000;
const DEFAULT_MA_STACK_SLOW_GRACE_MS=180000;
const MA_STACK_TIMEFRAMES=Object.freeze(["1m","3m","5m","15m","30m","1h","4h","1d"]);
const MA_STACK_FAST_TIMEFRAMES=Object.freeze(["1m","3m","5m","15m","30m"]);
const MA_STACK_TF_MS=Object.freeze({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"4h":14400000,"1d":86400000});
const LOGGER_SERVICES=Object.freeze(["sssc-logger","scalp-signal-logger","sig-b-logger","ma-stack-logger"]);

function positiveInteger(value,fallback,name){
  const parsed=Number(value==null||value===""?fallback:value);
  if(!Number.isInteger(parsed)||parsed<=0)throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function readMonitorConfig(env=process.env){
  const machineId=String(env.BT001_MACHINE_ID||DEFAULT_MACHINE_ID).trim();
  return Object.freeze({
    supabaseUrl:required(env,"SUPABASE_URL").replace(/\/+$/,""),
    supabaseAnonKey:required(env,"SUPABASE_ANON_KEY"),
    machineId,
    staleMs:positiveInteger(env.MONITOR_SSSC_STALE_MS,DEFAULT_STALE_MS,"MONITOR_SSSC_STALE_MS"),
    frozenRows:positiveInteger(env.MONITOR_SSSC_FROZEN_ROWS,DEFAULT_FROZEN_ROWS,"MONITOR_SSSC_FROZEN_ROWS"),
    sigBStaleMs:positiveInteger(env.MONITOR_SIG_B_STALE_MS,DEFAULT_STALE_MS,"MONITOR_SIG_B_STALE_MS"),
    sigBFrozenRows:positiveInteger(env.MONITOR_SIG_B_FROZEN_ROWS,DEFAULT_FROZEN_ROWS,"MONITOR_SIG_B_FROZEN_ROWS"),
    maStackMachineId:String(env.MA_STACK_MACHINE_ID||machineId).trim(),
    maStackFastStaleMs:positiveInteger(env.MONITOR_MA_STACK_FAST_STALE_MS,DEFAULT_MA_STACK_FAST_STALE_MS,"MONITOR_MA_STACK_FAST_STALE_MS"),
    maStackSlowGraceMs:positiveInteger(env.MONITOR_MA_STACK_SLOW_GRACE_MS,DEFAULT_MA_STACK_SLOW_GRACE_MS,"MONITOR_MA_STACK_SLOW_GRACE_MS"),
    maStackFrozenRows:positiveInteger(env.MONITOR_MA_STACK_FROZEN_ROWS,DEFAULT_FROZEN_ROWS,"MONITOR_MA_STACK_FROZEN_ROWS"),
    incidentDedupeMs:positiveInteger(env.MONITOR_INCIDENT_DEDUPE_MS,DEFAULT_INCIDENT_DEDUPE_MS,"MONITOR_INCIDENT_DEDUPE_MS"),
    checkSystemd:String(env.MONITOR_CHECK_SYSTEMD||"true").toLowerCase()!=="false"
  });
}

function canonicalize(value){
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));
  }
  return value;
}

function removeVolatileSignalFields(value){
  if(Array.isArray(value))return value.map(removeVolatileSignalFields);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value)
    .filter(([key])=>key!=="publicationGeneration"&&key!=="__engineToken")
    .map(([key,item])=>[key,removeVolatileSignalFields(item)]));
  return value;
}

function snapshotFingerprint(row){
  return JSON.stringify(canonicalize({
    symbol:row&&row.symbol||null,
    timeframes:row&&row.timeframes||null,
    aggregate:row&&row.aggregate||null
  }));
}

function signalBSnapshotFingerprint(row){
  return JSON.stringify(canonicalize({
    symbol:row&&row.symbol||null,direction:row&&row.direction||null,entry_state:row&&row.entry_state||null,
    confidence:(row&&row.confidence)??null,setup_score:(row&&row.setup_score)??null,trigger_score:(row&&row.trigger_score)??null,
    current_entry_score:(row&&row.current_entry_score)??null,readiness_score:(row&&row.readiness_score)??null,
    hard_gates:row&&row.hard_gates||null,flow_effectiveness:row&&row.flow_effectiveness||null,
    signal_output:removeVolatileSignalFields(row&&row.signal_output||null)
  }));
}

function maStackSnapshotFingerprint(row){
  return JSON.stringify(canonicalize({
    available:row&&row.available,state:row&&row.state,phase:row&&row.phase,selected_regime:row&&row.selected_regime,
    setup_direction:row&&row.setup_direction,strength:row&&row.strength,quality:row&&row.quality,alignment_pct:row&&row.alignment_pct,
    adx:row&&row.adx,adx_shadow_5:row&&row.adx_shadow_5,
    led_ma1:row&&row.led_ma1,led_ma2:row&&row.led_ma2,led_ma3:row&&row.led_ma3,led_ma4:row&&row.led_ma4,led_ma5:row&&row.led_ma5,
    spread_pct:row&&row.spread_pct,spread_atr:row&&row.spread_atr,spread_score:row&&row.spread_score,spread_label:row&&row.spread_label,spread_condition:row&&row.spread_condition,
    ma_event_type:row&&row.ma_event_type,ma_event_pair:row&&row.ma_event_pair,ma_event_outcome_direction:row&&row.ma_event_outcome_direction,ma_event_age_candles:row&&row.ma_event_age_candles
  }));
}

function rowTime(row){
  const value=Date.parse(row&&[row.created_at,row.event_at].find(Boolean));
  return Number.isFinite(value)?value:null;
}

function evaluateHeartbeat(options={}){
  const now=typeof options.now==="function"?options.now():Number(options.now)||Date.now();
  const staleMs=positiveInteger(options.staleMs,DEFAULT_STALE_MS,"staleMs");
  const frozenRows=positiveInteger(options.frozenRows,DEFAULT_FROZEN_ROWS,"frozenRows");
  const rows=Array.isArray(options.rows)?options.rows:[];
  const incidents=[];
  if(!rows.length){
    incidents.push({code:"SSSC_NO_ROWS",message:`No sssc_snapshots rows found for machine_id=${options.machineId}`});
  }else{
    const latestAt=rowTime(rows[0]);
    const ageMs=latestAt==null?Infinity:Math.max(0,now-latestAt);
    if(latestAt==null||ageMs>staleMs){
      incidents.push({
        code:"SSSC_STALE",ageMs:Number.isFinite(ageMs)?ageMs:null,lastRowAt:latestAt==null?null:new Date(latestAt).toISOString(),
        message:`Latest SSSC snapshot is stale (${Number.isFinite(ageMs)?Math.round(ageMs/1000):"unknown"}s old; limit ${Math.round(staleMs/1000)}s)`
      });
    }
    if(rows.length>=frozenRows){
      const sample=rows.slice(0,frozenRows),fingerprints=new Set(sample.map(snapshotFingerprint));
      if(fingerprints.size===1){
        incidents.push({
          code:"SSSC_FROZEN_DUPLICATES",rowCount:frozenRows,
          newestAt:rowTime(sample[0])==null?null:new Date(rowTime(sample[0])).toISOString(),
          oldestAt:rowTime(sample.at(-1))==null?null:new Date(rowTime(sample.at(-1))).toISOString(),
          message:`Last ${frozenRows} SSSC rows have identical calculated payloads`
        });
      }
    }
  }
  for(const service of options.services||[]){
    if(service&&service.active!==true){
      incidents.push({
        code:"SERVICE_DOWN",service:service.name,status:service.status||"unknown",
        message:`systemd service ${service.name} is not active (${service.status||"unknown"})`
      });
    }
  }
  return {healthy:incidents.length===0,checkedAt:new Date(now).toISOString(),incidents};
}

function evaluateSignalBHeartbeat(options={}){
  const now=typeof options.now==="function"?options.now():Number(options.now)||Date.now();
  const staleMs=positiveInteger(options.staleMs,DEFAULT_STALE_MS,"staleMs"),frozenRows=positiveInteger(options.frozenRows,DEFAULT_FROZEN_ROWS,"frozenRows");
  const rows=Array.isArray(options.rows)?options.rows:[],incidents=[];
  if(!rows.length)incidents.push({code:"SIGB_NO_ROWS",message:`No sig_b_snapshots rows found for machine_id=${options.machineId}`});
  else{
    const latestAt=rowTime(rows[0]),ageMs=latestAt==null?Infinity:Math.max(0,now-latestAt);
    if(latestAt==null||ageMs>staleMs)incidents.push({code:"SIGB_STALE",ageMs:Number.isFinite(ageMs)?ageMs:null,
      lastRowAt:latestAt==null?null:new Date(latestAt).toISOString(),message:`Latest Sig B snapshot is stale (${Number.isFinite(ageMs)?Math.round(ageMs/1000):"unknown"}s old; limit ${Math.round(staleMs/1000)}s)`});
    if(rows.length>=frozenRows){
      const sample=rows.slice(0,frozenRows);
      if(new Set(sample.map(signalBSnapshotFingerprint)).size===1)incidents.push({code:"SIGB_FROZEN_DUPLICATES",rowCount:frozenRows,
        newestAt:rowTime(sample[0])==null?null:new Date(rowTime(sample[0])).toISOString(),oldestAt:rowTime(sample.at(-1))==null?null:new Date(rowTime(sample.at(-1))).toISOString(),
        message:`Last ${frozenRows} Sig B rows have identical calculated payloads`});
    }
  }
  return {healthy:incidents.length===0,checkedAt:new Date(now).toISOString(),incidents};
}

function evaluateMaStackHeartbeat(options={}){
  const now=typeof options.now==="function"?options.now():Number(options.now)||Date.now();
  const fastStaleMs=positiveInteger(options.fastStaleMs,DEFAULT_MA_STACK_FAST_STALE_MS,"fastStaleMs");
  const slowGraceMs=positiveInteger(options.slowGraceMs,DEFAULT_MA_STACK_SLOW_GRACE_MS,"slowGraceMs");
  const frozenRows=positiveInteger(options.frozenRows,DEFAULT_FROZEN_ROWS,"frozenRows");
  const grouped=Object.groupBy?Object.groupBy(options.rows||[],row=>row.timeframe):Array.from(options.rows||[]).reduce((all,row)=>{(all[row.timeframe]||(all[row.timeframe]=[])).push(row);return all;},{});
  const startedAt=Date.parse(options.startedAt||"");
  const incidents=[];
  for(const timeframe of MA_STACK_TIMEFRAMES){
    const rows=(grouped[timeframe]||[]).slice().sort((a,b)=>(rowTime(b)||0)-(rowTime(a)||0));
    if(!rows.length){
      const startupGrace=MA_STACK_FAST_TIMEFRAMES.includes(timeframe)?0:MA_STACK_TF_MS[timeframe]+slowGraceMs;
      if(startupGrace===0||Number.isFinite(startedAt)&&now-startedAt>startupGrace)incidents.push({code:"MA_STACK_NO_ROWS",machineId:options.machineId,timeframe,message:`No ma_stack_snapshots rows found for machine_id=${options.machineId}, timeframe=${timeframe}`});
      continue;
    }
    const latestAt=rowTime(rows[0]),ageMs=latestAt==null?Infinity:Math.max(0,now-latestAt);
    const limitMs=MA_STACK_FAST_TIMEFRAMES.includes(timeframe)?fastStaleMs:MA_STACK_TF_MS[timeframe]+slowGraceMs;
    if(latestAt==null||ageMs>limitMs)incidents.push({code:"MA_STACK_STALE",machineId:options.machineId,timeframe,ageMs:Number.isFinite(ageMs)?ageMs:null,lastRowAt:latestAt==null?null:new Date(latestAt).toISOString(),limitMs,
      message:`Latest MA Stack ${timeframe} snapshot is stale (${Number.isFinite(ageMs)?Math.round(ageMs/1000):"unknown"}s old; limit ${Math.round(limitMs/1000)}s)`});
    if(rows.length>=frozenRows){
      const sample=rows.slice(0,frozenRows),boundaries=new Set(sample.map(row=>row.candle_open_at).filter(Boolean));
      if(boundaries.size>=2&&new Set(sample.map(maStackSnapshotFingerprint)).size===1)incidents.push({code:"MA_STACK_FROZEN_DUPLICATES",machineId:options.machineId,timeframe,rowCount:frozenRows,
        newestAt:rowTime(sample[0])==null?null:new Date(rowTime(sample[0])).toISOString(),oldestAt:rowTime(sample.at(-1))==null?null:new Date(rowTime(sample.at(-1))).toISOString(),
        message:`Last ${frozenRows} MA Stack ${timeframe} rows across candle boundaries have identical calculated payloads`});
    }
  }
  return {healthy:incidents.length===0,checkedAt:new Date(now).toISOString(),incidents};
}

function createSupabaseMonitorStore(options={}){
  const createClient=options.createClient||require("@supabase/supabase-js").createClient;
  const client=options.client||createClient(options.url,options.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return Object.freeze({
    async latest(machineId,limit){
      const {data,error}=await client.from("sssc_snapshots")
        .select("created_at,event_at,machine_id,symbol,timeframes,aggregate")
        .eq("machine_id",machineId).order("created_at",{ascending:false}).limit(limit);
      if(error)throw error;
      if(!Array.isArray(data))throw new Error("Invalid Supabase monitoring response");
      return data;
    },
    async latestSignalB(machineId,limit){
      const {data,error}=await client.from("sig_b_snapshots")
        .select("created_at,event_at,machine_id,symbol,direction,entry_state,confidence,setup_score,trigger_score,current_entry_score,readiness_score,hard_gates,flow_effectiveness,signal_output")
        .eq("machine_id",machineId).order("created_at",{ascending:false}).limit(limit);
      if(error)throw error;
      if(!Array.isArray(data))throw new Error("Invalid Supabase Sig B monitoring response");
      return data;
    },
    async latestMaStack(machineId,perTimeframeLimit){
      const fields="created_at,event_at,machine_id,symbol,timeframe,candle_open_at,available,state,phase,selected_regime,setup_direction,strength,quality,alignment_pct,adx,adx_shadow_5,led_ma1,led_ma2,led_ma3,led_ma4,led_ma5,spread_pct,spread_atr,spread_score,spread_label,spread_condition,ma_event_type,ma_event_pair,ma_event_outcome_direction,ma_event_age_candles";
      const batches=await Promise.all(MA_STACK_TIMEFRAMES.map(async timeframe=>{
        const {data,error}=await client.from("ma_stack_snapshots").select(fields)
          .eq("machine_id",machineId).eq("timeframe",timeframe).order("created_at",{ascending:false}).limit(perTimeframeLimit);
        if(error)throw error;
        if(!Array.isArray(data))throw new Error(`Invalid Supabase MA Stack ${timeframe} monitoring response`);
        return data;
      }));
      return batches.flat();
    },
    async maStackFirstRow(machineId){
      const {data,error}=await client.from("ma_stack_snapshots").select("created_at").eq("machine_id",machineId).order("created_at",{ascending:true}).limit(1);
      if(error)throw error;
      return Array.isArray(data)&&data.length?data[0]:null;
    },
    async findRecentUnresolved(machineId,checkName,since){
      const {data,error}=await client.from("monitoring_incidents").select("id,created_at")
        .eq("machine_id",machineId).eq("check_name",checkName).is("resolved_at",null)
        .gte("created_at",since).order("created_at",{ascending:false}).limit(1);
      if(error)throw error;
      return Array.isArray(data)&&data.length?data[0]:null;
    },
    async insertIncident(row){
      const {error}=await client.from("monitoring_incidents").insert(row);
      if(error)throw error;
      return true;
    }
  });
}

function createSupabaseSnapshotReader(options={}){return createSupabaseMonitorStore(options);}

function incidentRow(incident,options={}){
  const service=String(incident&&incident.service||"");
  const names={
    SSSC_NO_ROWS:"sssc_no_rows",
    SSSC_STALE:"sssc_stale",
    SSSC_FROZEN_DUPLICATES:"sssc_frozen_duplicate",
    SIGB_NO_ROWS:"sig_b_no_rows",
    SIGB_STALE:"sig_b_stale",
    SIGB_FROZEN_DUPLICATES:"sig_b_frozen_duplicate",
    MA_STACK_NO_ROWS:"ma_stack_no_rows",
    MA_STACK_STALE:"ma_stack_stale",
    MA_STACK_FROZEN_DUPLICATES:"ma_stack_frozen_duplicate",
    SUPABASE_QUERY_FAILED:"supabase_query_failed"
  };
  const checkName=incident&&incident.code==="SERVICE_DOWN"
    ?(service==="scalp-signal-logger"?"scalp_service_down":service==="sig-b-logger"?"sig_b_service_down":service==="ma-stack-logger"?"ma_stack_service_down":"sssc_service_down")
    :names[incident&&incident.code]||String(incident&&incident.code||"monitor_unknown").toLowerCase();
  const severity=["SSSC_FROZEN_DUPLICATES","SSSC_NO_ROWS","SIGB_FROZEN_DUPLICATES","SIGB_NO_ROWS","MA_STACK_FROZEN_DUPLICATES","MA_STACK_NO_ROWS"].includes(incident&&incident.code)?"critical":"error";
  return {
    machine_id:String(incident&&incident.machineId||options.machineId||DEFAULT_MACHINE_ID),
    check_name:checkName,severity,
    detail:canonicalize({...incident,checked_at:options.checkedAt})
  };
}

async function persistIncidents(result,store,options={}){
  const now=typeof options.now==="function"?options.now():Number(options.now)||Date.now();
  const dedupeMs=positiveInteger(options.dedupeMs,DEFAULT_INCIDENT_DEDUPE_MS,"dedupeMs");
  const outcomes=[];
  for(const incident of result.incidents){
    const row=incidentRow(incident,{machineId:options.machineId,checkedAt:result.checkedAt});
    try{
      const recent=await store.findRecentUnresolved(row.machine_id,row.check_name,new Date(now-dedupeMs).toISOString());
      if(recent){outcomes.push({checkName:row.check_name,inserted:false,deduplicated:true,existingId:recent.id});continue;}
      await store.insertIncident(row);
      outcomes.push({checkName:row.check_name,inserted:true,deduplicated:false,row});
    }catch(error){
      outcomes.push({checkName:row.check_name,inserted:false,deduplicated:false,error:error&&error.message||String(error)});
    }
  }
  return outcomes;
}

function checkSystemdServices(options={}){
  const run=options.spawnSync||spawnSync;
  return (options.services||LOGGER_SERVICES).map(name=>{
    const result=run("systemctl",["is-active",name],{encoding:"utf8"});
    const status=String(result&&result.stdout||result&&result.stderr||"unknown").trim()||"unknown";
    return {name,active:result&&result.status===0&&status==="active",status};
  });
}

async function runMonitorOnce(options={}){
  const config=options.config;
  const store=options.store||(!options.reader?createSupabaseMonitorStore({url:config.supabaseUrl,key:config.supabaseAnonKey,client:options.client}):null);
  const reader=options.reader||store;
  let rows=[],sigBRows=[],maStackRows=[],maStackFirstRow=null,queryError=null,sigBQueryError=null,maStackQueryError=null;
  try{rows=await reader.latest(config.machineId,config.frozenRows);}
  catch(error){queryError=error;}
  try{sigBRows=await reader.latestSignalB(config.machineId,config.sigBFrozenRows);}
  catch(error){sigBQueryError=error;}
  if(typeof reader.latestMaStack==="function"){
    try{
      maStackRows=await reader.latestMaStack(config.maStackMachineId,config.maStackFrozenRows);
      if(typeof reader.maStackFirstRow==="function")maStackFirstRow=await reader.maStackFirstRow(config.maStackMachineId);
    }
    catch(error){maStackQueryError=error;}
  }
  let services=[];
  if(config.checkSystemd){
    try{services=(options.checkServices||checkSystemdServices)();}
    catch(error){services=LOGGER_SERVICES.map(name=>({name,active:false,status:`check failed: ${error.message||error}`}));}
  }
  const result=evaluateHeartbeat({rows,services,machineId:config.machineId,staleMs:config.staleMs,frozenRows:config.frozenRows,now:options.now});
  const sigBResult=evaluateSignalBHeartbeat({rows:sigBRows,machineId:config.machineId,staleMs:config.sigBStaleMs,frozenRows:config.sigBFrozenRows,now:options.now});
  result.incidents.push(...sigBResult.incidents);result.healthy=result.incidents.length===0;
  if(typeof reader.latestMaStack==="function"){
    const maStackResult=evaluateMaStackHeartbeat({rows:maStackRows,startedAt:maStackFirstRow&&maStackFirstRow.created_at,machineId:config.maStackMachineId,fastStaleMs:config.maStackFastStaleMs,slowGraceMs:config.maStackSlowGraceMs,frozenRows:config.maStackFrozenRows,now:options.now});
    result.incidents.push(...maStackResult.incidents);result.healthy=result.incidents.length===0;
  }
  if(queryError){
    result.incidents=result.incidents.filter(incident=>!["SSSC_NO_ROWS","SSSC_STALE","SSSC_FROZEN_DUPLICATES"].includes(incident.code));
    result.healthy=false;
    result.incidents.unshift({code:"SUPABASE_QUERY_FAILED",message:`Supabase health query failed: ${queryError.message||queryError}`});
  }
  if(sigBQueryError){
    result.incidents=result.incidents.filter(incident=>!["SIGB_NO_ROWS","SIGB_STALE","SIGB_FROZEN_DUPLICATES"].includes(incident.code));
    result.healthy=false;result.incidents.push({code:"SUPABASE_SIGB_QUERY_FAILED",message:`Supabase Sig B health query failed: ${sigBQueryError.message||sigBQueryError}`});
  }
  if(maStackQueryError){
    result.incidents=result.incidents.filter(incident=>!["MA_STACK_NO_ROWS","MA_STACK_STALE","MA_STACK_FROZEN_DUPLICATES"].includes(incident.code));
    result.healthy=false;result.incidents.push({code:"SUPABASE_MA_STACK_QUERY_FAILED",machineId:config.maStackMachineId,message:`Supabase MA Stack health query failed: ${maStackQueryError.message||maStackQueryError}`});
  }
  for(const incident of result.incidents){if(incident.code==="SERVICE_DOWN"&&incident.service==="ma-stack-logger")incident.machineId=config.maStackMachineId;}
  result.incidentWrites=store&&result.incidents.length?await persistIncidents(result,store,{
    machineId:config.machineId,dedupeMs:config.incidentDedupeMs,now:options.now
  }):[];
  return result;
}

function report(result,options={}){
  const log=options.log||console.log,error=options.error||console.error;
  if(result.healthy){
    log(`[VM logger monitor] HEALTHY at ${result.checkedAt}: all configured checks passed.`);
    return 0;
  }
  for(const incident of result.incidents)error(`[VM logger monitor] ALERT ${incident.code}: ${incident.message}`);
  for(const write of result.incidentWrites||[]){
    if(write.error)error(`[VM logger monitor] ALERT INCIDENT_WRITE_FAILED ${write.checkName}: ${write.error}`);
    else if(write.inserted)log(`[VM logger monitor] Incident recorded: ${write.checkName}`);
    else if(write.deduplicated)log(`[VM logger monitor] Incident already recorded recently: ${write.checkName}`);
  }
  return 1;
}

async function main(){
  loadDotEnv();
  const config=readMonitorConfig(),result=await runMonitorOnce({config});
  process.exitCode=report(result);
}

module.exports={
  DEFAULT_MACHINE_ID,DEFAULT_STALE_MS,DEFAULT_FROZEN_ROWS,DEFAULT_INCIDENT_DEDUPE_MS,DEFAULT_MA_STACK_FAST_STALE_MS,DEFAULT_MA_STACK_SLOW_GRACE_MS,MA_STACK_TIMEFRAMES,MA_STACK_FAST_TIMEFRAMES,MA_STACK_TF_MS,LOGGER_SERVICES,
  readMonitorConfig,canonicalize,removeVolatileSignalFields,snapshotFingerprint,signalBSnapshotFingerprint,maStackSnapshotFingerprint,evaluateHeartbeat,evaluateSignalBHeartbeat,evaluateMaStackHeartbeat,
  createSupabaseMonitorStore,createSupabaseSnapshotReader,incidentRow,persistIncidents,
  checkSystemdServices,runMonitorOnce,report,main
};
if(require.main===module)main().catch(error=>{console.error("[VM logger monitor] ALERT MONITOR_FAILED:",error);process.exitCode=1;});
