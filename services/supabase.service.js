(() => {
  "use strict";

  /* Opaque slot names by design, matching features/heatmap/provider-auth.module.js: must not
     reveal the stored value's purpose in diagnostics, copied settings, or DOM. Local storage only. */
  const URL_SLOT="bt001_scalp_sb_u_v1",KEY_SLOT="bt001_scalp_sb_k_v1";

  function readSlot(slot){
    try{const parsed=JSON.parse(localStorage.getItem(slot)||"null");return parsed&&typeof parsed.s==="string"&&parsed.s.trim()?parsed.s.trim():"";}
    catch(_e){return "";}
  }
  function writeSlot(slot,value){
    const trimmed=String(value||"").trim();if(!trimmed)return false;
    try{localStorage.setItem(slot,JSON.stringify({s:trimmed}));return true;}catch(_e){return false;}
  }
  function clearSlot(slot){try{localStorage.removeItem(slot);}catch(_e){}}

  function getUrl(){return readSlot(URL_SLOT).replace(/\/+$/,"");}
  function getAnonKey(){return readSlot(KEY_SLOT);}
  function configured(){return !!getUrl()&&!!getAnonKey();}
  function saveUrlFromInput(input){const ok=writeSlot(URL_SLOT,input&&input.value);if(ok&&input)input.value="";if(ok)syncWorkerConfig();return ok;}
  function saveKeyFromInput(input){const ok=writeSlot(KEY_SLOT,input&&input.value);if(ok&&input)input.value="";if(ok)syncWorkerConfig();return ok;}
  function clearUrl(){clearSlot(URL_SLOT);syncWorkerConfig();}
  function clearKey(){clearSlot(KEY_SLOT);syncWorkerConfig();}

  function getRest(){return window.restService||null;}
  function exchangeNow(){
    const clock=window.BT001ExchangeClock;
    try{return clock&&typeof clock.now==="function"?clock.now():Date.now();}catch(_error){return Date.now();}
  }

  // Stable per-browser identifier attached to every log row so activity from the same machine
  // can be grouped later. Deliberately a clear/readable key -- unlike the credential slots above,
  // there's nothing sensitive to obscure here.
  const DEVICE_ID_KEY="bt001_device_id";
  function generateDeviceId(){
    if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function getDeviceId(){
    try{
      const existing=localStorage.getItem(DEVICE_ID_KEY);
      if(existing)return existing;
      const generated=generateDeviceId();
      try{localStorage.setItem(DEVICE_ID_KEY,generated);}catch(_e){}
      return generated;
    }catch(_e){return generateDeviceId();}
  }

  // Modern browsers route every production log through a Worker whose queue lives in IndexedDB.
  // This small fallback is retained for non-Worker test/legacy environments only.
  const pending=[];
  let flushing=false,retryTimer=null;
  let worker=null,workerAttempted=false,workerStatus={pending:0,succeeded:0,failed:0,latestSnapshotEventAt:null,latestSnapshotAgeMs:null};
  let fallbackSnapshot=null,fallbackSnapshotTimer=null;
  const SNAPSHOT_INTERVAL_MS=30000;

  function syncWorkerConfig(){
    if(worker)worker.postMessage({type:"config",url:getUrl(),key:getAnonKey()});
  }
  function stopFallbackSnapshotTimer(){
    if(fallbackSnapshotTimer!=null)clearInterval(fallbackSnapshotTimer);
    fallbackSnapshotTimer=null;
  }
  function discardWorker(){
    const active=worker;
    worker=null;
    if(active&&typeof active.terminate==="function")try{active.terminate();}catch(_e){}
  }
  function ensureWorker({retry=false}={}){
    if(worker)return worker;
    if(workerAttempted&&!retry)return null;
    workerAttempted=true;
    if(typeof Worker!=="function")return null;
    let objectUrl=null,candidate=null;
    try{
      const source=window.BT001_LOGGING_WORKER_SOURCE;
      if(!source)throw new Error("Logging Worker source was not loaded");
      objectUrl=URL.createObjectURL(new Blob([source],{type:"application/javascript"}));
      candidate=new Worker(objectUrl);
      candidate.addEventListener("message",event=>{
        const message=event&&event.data;
        if(message&&message.type==="status"){
          if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
          workerStatus={
            pending:Number(message.pending)||0,succeeded:Number(message.succeeded)||0,failed:Number(message.failed)||0,
            latestSnapshotEventAt:message.latestSnapshotEventAt||null,
            latestSnapshotAgeMs:Number.isFinite(Number(message.latestSnapshotAgeMs))?Number(message.latestSnapshotAgeMs):null
          };
        }
      });
      candidate.postMessage({type:"config",url:getUrl(),key:getAnonKey()});
      worker=candidate;
      stopFallbackSnapshotTimer();
      return worker;
    }catch(error){
      if(objectUrl)try{URL.revokeObjectURL(objectUrl);}catch(_e){}
      if(candidate&&typeof candidate.terminate==="function")try{candidate.terminate();}catch(_e){}
      console.warn("[BT001 Supabase] Logging Worker could not start; using the in-page fallback.",error);
      worker=null;return null;
    }
  }

  async function insertRow(table,row){
    const rest=getRest();
    if(!rest)throw new Error("services/rest.service.js (window.restService) is unavailable");
    if(!configured())throw new Error("Supabase URL/anon key are not configured");
    const url=`${getUrl()}/rest/v1/${table}`,key=getAnonKey();
    // Prefer: return=minimal avoids PostgREST trying to SELECT the inserted row back, which would
    // fail under the intended insert-only RLS policy (the anon key has no SELECT grant on this table).
    return rest.post(url,row,{headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:"return=minimal"}});
  }

  function scheduleFlush(delayMs=4000){
    if(retryTimer)return;
    retryTimer=setTimeout(()=>{retryTimer=null;flushPending();},delayMs);
  }

  async function flushPending(){
    if(worker){worker.postMessage({type:"flush"});return;}
    if(flushing||!pending.length)return;
    if(!configured()){scheduleFlush(15000);return;}
    flushing=true;
    try{
      while(pending.length){
        const item=pending[0];
        try{await insertRow(item.table,item.row);pending.shift();}
        catch(_error){scheduleFlush();break;}
      }
    }finally{flushing=false;}
  }

  async function log(table,row){
    const activeWorker=ensureWorker();
    if(activeWorker){
      activeWorker.postMessage({type:"enqueue",table,row});
      return true;
    }
    try{await insertRow(table,row);return true;}
    catch(error){
      // Logging remains fire-and-forget for trading callers, but a rejected write must be visible
      // locally instead of hiding until somebody happens to press Test Connection.
      console.warn(`[BT001 Supabase] Write to ${table} failed; queued for retry.`,error);
      pending.push({table,row});scheduleFlush();return false;
    }
  }

  function pendingCount(){return worker?workerStatus.pending:pending.length;}
  function loggingStatus(){
    return Object.freeze({...workerStatus,workerActive:!!worker,fallbackActive:fallbackSnapshotTimer!=null});
  }
  function writeFallbackSnapshot(){
    // A cleared interval callback may already be queued when a later Worker attempt succeeds.
    // Never let that stale callback become a second producer through log()'s Worker routing.
    if(worker){stopFallbackSnapshotTimer();return;}
    if(!fallbackSnapshot)return;
    insertRow("sssc_snapshots",fallbackSnapshot).catch(error=>{
      console.warn("[BT001 Supabase] Fallback snapshot write failed; queued for retry.",error);
      pending.push({table:"sssc_snapshots",row:fallbackSnapshot});scheduleFlush();
    });
  }
  function setLatestSnapshot(row){
    fallbackSnapshot=row||null;
    try{const activeWorker=ensureWorker();if(activeWorker){activeWorker.postMessage({type:"latestSnapshot",row});return true;}}
    catch(_error){}
    return false;
  }
  function startSnapshotLogging(){
    try{
      const activeWorker=ensureWorker({retry:true});
      if(activeWorker){
        stopFallbackSnapshotTimer();
        activeWorker.postMessage({type:"startSnapshots"});
        return true;
      }
    }
    catch(_error){discardWorker();}
    if(fallbackSnapshotTimer==null)fallbackSnapshotTimer=setInterval(writeFallbackSnapshot,SNAPSHOT_INTERVAL_MS);
    return false;
  }
  function stopSnapshotLogging(){
    try{if(worker)worker.postMessage({type:"stopSnapshots"});}catch(_error){}
    stopFallbackSnapshotTimer();
  }

  // Real end-to-end verification for the Settings panel: logActivity() is fire-and-forget and never
  // surfaces a failure anywhere (by design, so a bad credential can't affect trading), which means a
  // typo'd URL or a wrong/mismatched anon key silently drops every row with zero feedback. This writes
  // one real, clearly-tagged row through the exact same insert path logActivity() uses -- a plain
  // reachability/SELECT check would pass even when the anon key correctly has INSERT-only grants (see
  // insertRow's return=minimal note above), so only an actual insert proves rows really land.
  async function testConnection(){
    if(!configured())return {ok:false,reason:"NOT_CONFIGURED",message:"Enter a project URL and anon key, then Save, before testing"};
    if(!getRest())return {ok:false,reason:"REST_UNAVAILABLE",message:"services/rest.service.js (window.restService) is unavailable"};
    const row={event_at:new Date(exchangeNow()).toISOString(),action:"CONNECTION_TEST",detail:{source:"settings-test"},machine_id:getDeviceId()};
    try{
      await insertRow("scalp_operational",row);
      return {ok:true,reason:"OK",message:"Success: a test row was written to scalp_operational"};
    }catch(error){
      const status=error&&error.status,data=error&&error.data,detail=data&&typeof data==="object"?(data.message||data.msg||data.hint):null;
      if(status===401)return {ok:false,reason:"UNAUTHORIZED",message:"Rejected (HTTP 401): the anon key is invalid, or was pasted for a different project"};
      if(status===403)return {ok:false,reason:"FORBIDDEN",message:`Rejected (HTTP 403): reached the project, but its row-level security policy blocked the insert${detail?` — ${detail}`:" -- check the anon INSERT grant on scalp_operational"}`};
      if(status===404)return {ok:false,reason:"NOT_FOUND",message:"Reached the project, but table \"scalp_operational\" was not found (HTTP 404) -- check the URL points at the right project"};
      if(Number.isFinite(status))return {ok:false,reason:"HTTP_ERROR",message:`Rejected (HTTP ${status})${detail?`: ${detail}`:""}`};
      return {ok:false,reason:"NETWORK_ERROR",message:`Could not reach ${getUrl()||"the configured URL"} -- check the Project URL for typos (${error&&error.message||String(error)})`};
    }
  }

  const DB_ACCESS_TABLES=Object.freeze([
    "scalp_v1_signals","scalp_v2_signals","scalp_positions","scalp_operational","scalp_trades"
  ]);

  function buildDbAccessRows(tag){
    const now=new Date(exchangeNow()).toISOString(),symbol="BTCUSDT",machineId=getDeviceId();
    const detectorState={test_tag:tag,kind:"DB_ACCESS_TEST",qualified:false};
    const cascadeAgreement={test_tag:tag,kind:"DB_ACCESS_TEST",confirmed:false};
    return {
      scalp_v1_signals:{
        event_at:now,symbol,action:"DB_ACCESS_TEST",source_timeframe:"1m",detector_state:detectorState,
        cascade_agreement:cascadeAgreement,machine_id:machineId
      },
      scalp_v2_signals:{
        symbol,action:"DB_ACCESS_TEST",source_timeframe:"1m",
        detector_state:detectorState,cascade_agreement:cascadeAgreement,machine_id:machineId
      },
      scalp_positions:{
        event_at:now,symbol,action:"DB_ACCESS_TEST",direction:"LONG",tranche_id:tag,
        position_state:{test_tag:tag,kind:"DB_ACCESS_TEST",state:"TEST_ONLY"},machine_id:machineId
      },
      scalp_operational:{
        event_at:now,action:"DB_ACCESS_TEST",detail:{test_tag:tag,kind:"DB_ACCESS_TEST"},machine_id:machineId
      },
      scalp_trades:{
        created_at:now,closed_at:now,symbol,direction:"LONG",mode:"SINGLE",
        source_timeframe:"1m",event_type:"DB_ACCESS_TEST",auto_entered:false,
        cascade_agreement_at_entry:cascadeAgreement,requested_qty:0.001,filled_qty:0.001,
        avg_entry_price:1,entry_commission:0,exit_reason:"DB_ACCESS_TEST",exit_price:1,
        estimated_realized_pnl_usd:0,raw_session:{test_tag:tag,kind:"DB_ACCESS_TEST"},
        device_id:getDeviceId()
      }
    };
  }

  function rejectedInsertResult(table,error){
    const status=Number.isFinite(error&&error.status)?error.status:null;
    const data=error&&error.data&&typeof error.data==="object"?error.data:{};
    const code=data.code||null,message=data.message||data.msg||error&&error.message||String(error);
    const details=data.details||null,hint=data.hint||null;
    const parts=[];
    if(status!=null)parts.push(`HTTP ${status}`);
    if(code)parts.push(code);
    if(message)parts.push(message);
    if(details)parts.push(`Details: ${details}`);
    if(hint)parts.push(`Hint: ${hint}`);
    return {table,ok:false,status,code,message,details,hint,reason:parts.join(" — ")};
  }

  async function testDbAccess(){
    if(!configured())return {ok:false,reason:"NOT_CONFIGURED",message:"Enter a project URL and anon key, then Save, before testing",results:[]};
    if(!getRest())return {ok:false,reason:"REST_UNAVAILABLE",message:"services/rest.service.js (window.restService) is unavailable",results:[]};
    const tag=`DB_ACCESS_TEST_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,rows=buildDbAccessRows(tag),results=[];
    // Intentionally insert-and-leave-tagged. Test inserts bypass log() so failures are reported here
    // and are never mixed into the trading retry queue.
    for(const table of DB_ACCESS_TABLES){
      try{
        await insertRow(table,rows[table]);
        results.push({table,ok:true,status:null,code:null,message:`Inserted tagged row ${tag}`,details:null,hint:null,reason:"OK"});
      }catch(error){
        results.push(rejectedInsertResult(table,error));
      }
    }
    const succeeded=results.filter(result=>result.ok).length;
    return {
      ok:succeeded===results.length,tag,results,
      message:`DB access test ${succeeded}/${results.length} tables succeeded. Tagged rows were left in place as ${tag}.`
    };
  }

  window.BT001Supabase=Object.freeze({
    getUrl,getAnonKey,configured,saveUrlFromInput,saveKeyFromInput,clearUrl,clearKey,
    log,flushPending,pendingCount,loggingStatus,setLatestSnapshot,startSnapshotLogging,stopSnapshotLogging,
    getDeviceId,testConnection,testDbAccess
  });
  ensureWorker();
})();
