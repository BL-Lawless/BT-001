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

  window.BT001Supabase=Object.freeze({
    getUrl,getAnonKey,configured,saveUrlFromInput,saveKeyFromInput,clearUrl,clearKey,
    log,flushPending,pendingCount
  });
})();
