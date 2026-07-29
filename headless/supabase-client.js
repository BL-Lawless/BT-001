"use strict";

function createSupabaseLogger(options={}){
  const createClient=options.createClient||require("@supabase/supabase-js").createClient;
  const url=String(options.url||"").trim(),key=String(options.key||"").trim(),machineId=String(options.machineId||"").trim();
  if(!url)throw new Error("Supabase URL is required");
  if(!key)throw new Error("Supabase anon key is required");
  if(!machineId)throw new Error("machine_id is required");
  const intervalMs=Math.max(1,Number(options.snapshotIntervalMs)||30000);
  const client=options.client||createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let latestSnapshot=null,snapshotTimer=null;
  async function log(table,row){
    const {error}=await client.from(table).insert(row);
    if(error)throw error;
    return true;
  }
  function setLatestSnapshot(row){latestSnapshot=row||null;return true;}
  function writeLatest(){if(!latestSnapshot)return Promise.resolve(false);return log("sssc_snapshots",latestSnapshot);}
  function startSnapshotLogging(){
    if(snapshotTimer==null)snapshotTimer=setInterval(()=>{writeLatest().catch(error=>(options.warn||console.warn)("[Headless Supabase] SSSC snapshot write failed",error));},intervalMs);
    return true;
  }
  function stopSnapshotLogging(){if(snapshotTimer!=null)clearInterval(snapshotTimer);snapshotTimer=null;}
  return Object.freeze({
    configured:()=>true,getDeviceId:()=>machineId,log,setLatestSnapshot,startSnapshotLogging,stopSnapshotLogging,
    flushSnapshot:writeLatest,close:stopSnapshotLogging
  });
}

module.exports={createSupabaseLogger};
