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
  function saveUrlFromInput(input){const ok=writeSlot(URL_SLOT,input&&input.value);if(ok&&input)input.value="";return ok;}
  function saveKeyFromInput(input){const ok=writeSlot(KEY_SLOT,input&&input.value);if(ok&&input)input.value="";return ok;}
  function clearUrl(){clearSlot(URL_SLOT);}
  function clearKey(){clearSlot(KEY_SLOT);}

  function getRest(){return window.restService||null;}

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
    }catch(_e){return null;}
  }

  // In-memory retry queue: a transient network failure must not silently drop a decision-log row.
  // Rows never touch localStorage here -- if the tab closes before a retry succeeds, the row is
  // lost, which is an accepted tradeoff for a client-only prototype (see PART 4 write-up).
  const pending=[];
  let flushing=false,retryTimer=null;

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
    try{await insertRow(table,row);return true;}
    catch(_error){pending.push({table,row});scheduleFlush();return false;}
  }

  function pendingCount(){return pending.length;}

  // Real end-to-end verification for the Settings panel: logActivity() is fire-and-forget and never
  // surfaces a failure anywhere (by design, so a bad credential can't affect trading), which means a
  // typo'd URL or a wrong/mismatched anon key silently drops every row with zero feedback. This writes
  // one real, clearly-tagged row through the exact same insert path logActivity() uses -- a plain
  // reachability/SELECT check would pass even when the anon key correctly has INSERT-only grants (see
  // insertRow's return=minimal note above), so only an actual insert proves rows really land.
  async function testConnection(){
    if(!configured())return {ok:false,reason:"NOT_CONFIGURED",message:"Enter a project URL and anon key, then Save, before testing"};
    if(!getRest())return {ok:false,reason:"REST_UNAVAILABLE",message:"services/rest.service.js (window.restService) is unavailable"};
    const row={created_at:new Date().toISOString(),symbol:null,action:"CONNECTION_TEST",source_timeframe:null,auto_entered:null,detector_state:null,cascade_agreement:null,position_state:null,device_id:getDeviceId()};
    try{
      await insertRow("scalp_activity_log",row);
      return {ok:true,reason:"OK",message:"Success: a test row was written to scalp_activity_log"};
    }catch(error){
      const status=error&&error.status,data=error&&error.data,detail=data&&typeof data==="object"?(data.message||data.msg||data.hint):null;
      if(status===401)return {ok:false,reason:"UNAUTHORIZED",message:"Rejected (HTTP 401): the anon key is invalid, or was pasted for a different project"};
      if(status===403)return {ok:false,reason:"FORBIDDEN",message:`Rejected (HTTP 403): reached the project, but its row-level security policy blocked the insert${detail?` — ${detail}`:" -- check the anon INSERT grant on scalp_activity_log"}`};
      if(status===404)return {ok:false,reason:"NOT_FOUND",message:"Reached the project, but table \"scalp_activity_log\" was not found (HTTP 404) -- check the URL points at the right project"};
      if(Number.isFinite(status))return {ok:false,reason:"HTTP_ERROR",message:`Rejected (HTTP ${status})${detail?`: ${detail}`:""}`};
      return {ok:false,reason:"NETWORK_ERROR",message:`Could not reach ${getUrl()||"the configured URL"} -- check the Project URL for typos (${error&&error.message||String(error)})`};
    }
  }

  window.BT001Supabase=Object.freeze({
    getUrl,getAnonKey,configured,saveUrlFromInput,saveKeyFromInput,clearUrl,clearKey,
    log,flushPending,pendingCount,getDeviceId,testConnection
  });
})();
