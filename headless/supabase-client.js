"use strict";

function createSupabaseLogger(options={}){
  const createClient=options.createClient||require("@supabase/supabase-js").createClient;
  const url=String(options.url||"").trim(),key=String(options.key||"").trim(),machineId=String(options.machineId||"").trim();
  if(!url)throw new Error("Supabase URL is required");
  if(!key)throw new Error("Supabase anon key is required");
  if(!machineId)throw new Error("machine_id is required");
  const intervalMs=Math.max(1,Number(options.snapshotIntervalMs)||30000);
  const client=options.client||createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let latestSnapshot=null,snapshotTimer=null,getSnapshotFreshness=typeof options.getSnapshotFreshness==="function"?options.getSnapshotFreshness:null;
  const signalTracker=options.signalTracker||null;
  async function log(table,row){
    const {error}=await client.from(table).insert(row);
    if(error)throw error;
    return true;
  }
  function setLatestSnapshot(row){latestSnapshot=row||null;return true;}
  function setSnapshotFreshnessProvider(provider){getSnapshotFreshness=typeof provider==="function"?provider:null;return true;}
  function writeLatest(){
    if(!latestSnapshot)return Promise.resolve(false);
    const freshness=getSnapshotFreshness&&getSnapshotFreshness();
    if(freshness&&freshness.fresh===false){
      const last=freshness.lastUpdateAt?new Date(freshness.lastUpdateAt).toISOString():"never";
      (options.warn||console.warn)(`[Headless Supabase] stale data detected, skipping SSSC snapshot write; last market update at ${last}`,freshness);
      return Promise.resolve(false);
    }
    return writeSnapshotAndSignal(latestSnapshot);
  }
  async function writeSnapshotAndSignal(row){
    let query=client.from("sssc_snapshots").insert(row),result;
    if(query&&typeof query.select==="function"){
      query=query.select("id");
      result=query&&typeof query.single==="function"?await query.single():await query;
    }else result=await query;
    if(result&&result.error)throw result.error;
    const snapshotId=result&&result.data&&(Array.isArray(result.data)?result.data[0]&&result.data[0].id:result.data.id);
    if(!signalTracker||typeof signalTracker.observe!=="function"||snapshotId==null)return true;
    const signal=signalTracker.observe({marketRead:row.aggregate,eventAt:row.event_at,machineId:row.machine_id,symbol:row.symbol,snapshotId});
    if(signal)await log("sssc_signals",signal);
    return true;
  }
  function startSnapshotLogging(){
    if(snapshotTimer==null)snapshotTimer=setInterval(()=>{writeLatest().catch(error=>(options.warn||console.warn)("[Headless Supabase] SSSC snapshot write failed",error));},intervalMs);
    return true;
  }
  function stopSnapshotLogging(){if(snapshotTimer!=null)clearInterval(snapshotTimer);snapshotTimer=null;}
  return Object.freeze({
    configured:()=>true,getDeviceId:()=>machineId,log,setLatestSnapshot,setSnapshotFreshnessProvider,startSnapshotLogging,stopSnapshotLogging,
    flushSnapshot:writeLatest,close:stopSnapshotLogging
  });
}

module.exports={createSupabaseLogger};
