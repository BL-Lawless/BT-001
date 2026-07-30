"use strict";

const {spawnSync}=require("child_process");
const {loadDotEnv,required}=require("./config.js");

const DEFAULT_MACHINE_ID="vm-btc-sig-logger";
const DEFAULT_STALE_MS=180000;
const DEFAULT_FROZEN_ROWS=8;
const DEFAULT_INCIDENT_DEDUPE_MS=21600000;
const LOGGER_SERVICES=Object.freeze(["sssc-logger","scalp-signal-logger"]);

function positiveInteger(value,fallback,name){
  const parsed=Number(value==null||value===""?fallback:value);
  if(!Number.isInteger(parsed)||parsed<=0)throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function readMonitorConfig(env=process.env){
  return Object.freeze({
    supabaseUrl:required(env,"SUPABASE_URL").replace(/\/+$/,""),
    supabaseAnonKey:required(env,"SUPABASE_ANON_KEY"),
    machineId:String(env.BT001_MACHINE_ID||DEFAULT_MACHINE_ID).trim(),
    staleMs:positiveInteger(env.MONITOR_SSSC_STALE_MS,DEFAULT_STALE_MS,"MONITOR_SSSC_STALE_MS"),
    frozenRows:positiveInteger(env.MONITOR_SSSC_FROZEN_ROWS,DEFAULT_FROZEN_ROWS,"MONITOR_SSSC_FROZEN_ROWS"),
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

function snapshotFingerprint(row){
  return JSON.stringify(canonicalize({
    symbol:row&&row.symbol||null,
    timeframes:row&&row.timeframes||null,
    aggregate:row&&row.aggregate||null
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
    SUPABASE_QUERY_FAILED:"supabase_query_failed"
  };
  const checkName=incident&&incident.code==="SERVICE_DOWN"
    ?(service==="scalp-signal-logger"?"scalp_service_down":"sssc_service_down")
    :names[incident&&incident.code]||String(incident&&incident.code||"monitor_unknown").toLowerCase();
  const severity=incident&&incident.code==="SSSC_FROZEN_DUPLICATES"?"critical"
    :incident&&incident.code==="SSSC_NO_ROWS"?"critical":"error";
  return {
    machine_id:String(options.machineId||DEFAULT_MACHINE_ID),
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
  let rows=[],queryError=null;
  try{rows=await reader.latest(config.machineId,config.frozenRows);}
  catch(error){queryError=error;}
  let services=[];
  if(config.checkSystemd){
    try{services=(options.checkServices||checkSystemdServices)();}
    catch(error){services=LOGGER_SERVICES.map(name=>({name,active:false,status:`check failed: ${error.message||error}`}));}
  }
  const result=evaluateHeartbeat({rows,services,machineId:config.machineId,staleMs:config.staleMs,frozenRows:config.frozenRows,now:options.now});
  if(queryError){
    result.incidents=result.incidents.filter(incident=>!["SSSC_NO_ROWS","SSSC_STALE","SSSC_FROZEN_DUPLICATES"].includes(incident.code));
    result.healthy=false;
    result.incidents.unshift({code:"SUPABASE_QUERY_FAILED",message:`Supabase health query failed: ${queryError.message||queryError}`});
  }
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
  DEFAULT_MACHINE_ID,DEFAULT_STALE_MS,DEFAULT_FROZEN_ROWS,DEFAULT_INCIDENT_DEDUPE_MS,LOGGER_SERVICES,
  readMonitorConfig,canonicalize,snapshotFingerprint,evaluateHeartbeat,
  createSupabaseMonitorStore,createSupabaseSnapshotReader,incidentRow,persistIncidents,
  checkSystemdServices,runMonitorOnce,report,main
};
if(require.main===module)main().catch(error=>{console.error("[VM logger monitor] ALERT MONITOR_FAILED:",error);process.exitCode=1;});
