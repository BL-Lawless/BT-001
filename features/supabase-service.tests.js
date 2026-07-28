"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..");

function runtime({fetchImpl,consoleImpl=console,globals={}}={}){
  const store=new Map();
  const localStorage={
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>store.set(key,String(value)),
    removeItem:key=>store.delete(key)
  };
  const context={
    console:consoleImpl,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,
    URL,URLSearchParams,Headers,crypto:typeof crypto!=="undefined"?crypto:undefined,
    // Fake, inert timers: these tests only assert the immediate pending-queue push inside log()'s
    // catch, never the retry itself firing -- real timers would leave a live setTimeout chain behind
    // (log() -> scheduleFlush -> retry -> fails again -> scheduleFlush...) that keeps the process alive.
    setTimeout:()=>({}),clearTimeout:()=>{},
    localStorage,fetch:fetchImpl,...globals
  };
  context.window=context;
  vm.createContext(context);
  for(const file of ["services/rest.service.js","services/supabase.service.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }
  return {context,store};
}

function jsonResponse(status,body){
  return async()=>new Response(body===undefined?"":JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
}
function recordingFetch(handler){
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,options});return handler(url,options);};
  fetchImpl.calls=calls;
  return fetchImpl;
}

const run=(async()=>{
  // file:// deployment: the Worker must be constructed from an in-memory Blob URL, never from an
  // external script path (which browsers reject for opaque/null origins).
  {
    const constructed=[],revoked=[],instances=[];
    class FakeBlob{constructor(parts,options){this.parts=parts;this.options=options;}}
    class FakeWorker{
      constructor(url){constructed.push(url);this.listeners={};instances.push(this);}
      addEventListener(type,fn){this.listeners[type]=fn;}
      postMessage(){}
    }
    const fakeUrl={
      createObjectURL(blob){assert(blob instanceof FakeBlob);assert.equal(blob.options.type,"application/javascript");assert(blob.parts[0].includes("worker-source-marker"));return "blob:null/bt001-worker";},
      revokeObjectURL:url=>revoked.push(url)
    };
    const {context}=runtime({fetchImpl:recordingFetch(jsonResponse(201)),globals:{
      Worker:FakeWorker,Blob:FakeBlob,URL:fakeUrl,BT001_LOGGING_WORKER_SOURCE:"/* worker-source-marker */"
    }});
    assert.deepEqual(constructed,["blob:null/bt001-worker"]);
    assert(!constructed[0].includes("logging-worker.js"));
    instances[0].listeners.message({data:{type:"status",pending:0,succeeded:0,failed:0}});
    assert.deepEqual(revoked,["blob:null/bt001-worker"],"the Blob URL must be revoked after worker initialization");
    context.BT001Supabase.setLatestSnapshot({event_at:new Date().toISOString()});
  }

  // A constructor failure must activate a real repeating main-thread write fallback.
  {
    const timerCallbacks=[],warnings=[];
    class ThrowingWorker{constructor(){throw new Error("file origin denied");}}
    const fetchImpl=recordingFetch(jsonResponse(201));
    const {context}=runtime({fetchImpl,consoleImpl:{...console,warn:(...args)=>warnings.push(args)},globals:{
      Worker:ThrowingWorker,Blob:class{},URL:{createObjectURL:()=>"blob:null/failure",revokeObjectURL:()=>{}},
      BT001_LOGGING_WORKER_SOURCE:"/* source */",
      setInterval:callback=>{timerCallbacks.push(callback);return 8;},clearInterval:()=>{}
    }});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    context.BT001Supabase.setLatestSnapshot({event_at:"2026-07-27T00:00:00.000Z",machine_id:"fallback"});
    context.BT001Supabase.startSnapshotLogging();
    assert.equal(timerCallbacks.length,1);
    timerCallbacks[0]();await Promise.resolve();await Promise.resolve();
    timerCallbacks[0]();await Promise.resolve();await Promise.resolve();
    assert.equal(fetchImpl.calls.filter(call=>call.url.endsWith("/sssc_snapshots")).length,2,"every fallback tick must attempt a real snapshot insert");
    assert.equal(warnings.length,1);
  }

  // Not configured: must fail fast, before ever touching fetch, with a clear reason.
  {
    const fetchImpl=recordingFetch(async()=>{throw new Error("fetch must not be called when unconfigured");});
    const {context}=runtime({fetchImpl});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,false);
    assert.equal(result.reason,"NOT_CONFIGURED");
    assert.equal(fetchImpl.calls.length,0);
  }

  // Success: a real insert-shaped POST reaches the right URL/table with the right auth headers,
  // and the row is tagged CONNECTION_TEST so it's distinguishable from real activity rows.
  {
    const fetchImpl=recordingFetch(jsonResponse(200));
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key-correct"});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,true);
    assert.equal(result.reason,"OK");
    assert.equal(fetchImpl.calls.length,1);
    const {url,options}=fetchImpl.calls[0];
    assert.equal(url,"https://myproject.supabase.co/rest/v1/scalp_operational");
    assert.equal(options.method,"POST");
    assert.equal(options.headers.apikey,"anon-key-correct");
    assert.equal(options.headers.Authorization,"Bearer anon-key-correct");
    const sentRow=JSON.parse(options.body);
    assert.deepEqual(Object.keys(sentRow).sort(),["action","detail","event_at","machine_id"]);
    assert.equal(new Date(sentRow.event_at).toISOString(),sentRow.event_at);
    assert.equal(sentRow.action,"CONNECTION_TEST");
    assert.deepEqual(sentRow.detail,{source:"settings-test"});
    assert.equal(sentRow.machine_id,context.BT001Supabase.getDeviceId());
    assert(!Object.prototype.hasOwnProperty.call(sentRow,"auto_entered"));
    assert.equal(context.BT001Supabase.pendingCount(),0,"a successful test must not touch the retry queue");
  }

  // Wrong anon key (or a key from a different project): Supabase/PostgREST answers 401.
  {
    const fetchImpl=recordingFetch(jsonResponse(401,{message:"Invalid API key"}));
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"wrong-key"});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,false);
    assert.equal(result.reason,"UNAUTHORIZED");
    assert(/401/.test(result.message));
    assert.equal(context.BT001Supabase.pendingCount(),0,"a failed test must not be queued for silent retry");
  }

  // Right project/key, but RLS blocks the insert (e.g. anon INSERT grant misconfigured): 403.
  {
    const fetchImpl=recordingFetch(jsonResponse(403,{message:"new row violates row-level security policy"}));
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,false);
    assert.equal(result.reason,"FORBIDDEN");
    assert(result.message.includes("row-level security policy"));
  }

  // Right project, but the table itself doesn't exist there (e.g. URL points at the wrong project): 404.
  {
    const fetchImpl=recordingFetch(jsonResponse(404,{message:"Not Found"}));
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,false);
    assert.equal(result.reason,"NOT_FOUND");
    assert(/scalp_operational/.test(result.message));
  }

  // Typo'd/unreachable URL: fetch itself throws (DNS failure, refused connection, etc).
  {
    const fetchImpl=recordingFetch(async()=>{throw new Error("getaddrinfo ENOTFOUND myproejct.supabase.co");});
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproejct.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const result=await context.BT001Supabase.testConnection();
    assert.equal(result.ok,false);
    assert.equal(result.reason,"NETWORK_ERROR");
    assert(result.message.includes("myproejct.supabase.co"));
    assert(/typos/.test(result.message));
  }

  // Regression: logActivity()'s own log() path (used for real rows) is untouched by this addition --
  // it still resolves false and queues failures instead of throwing, while warning locally.
  {
    const fetchImpl=recordingFetch(async()=>{throw new Error("network down")});
    const warnings=[];
    const consoleImpl={...console,warn:(...args)=>warnings.push(args)};
    const {context}=runtime({fetchImpl,consoleImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const ok=await context.BT001Supabase.log("scalp_operational",{action:"ARMED",detail:{}});
    assert.equal(ok,false);
    assert.equal(context.BT001Supabase.pendingCount(),1,"log() must still queue failed rows for retry, unlike testConnection()");
    assert.equal(warnings.length,1,"a failed fire-and-forget write must emit a local warning");
    assert(String(warnings[0][0]).includes("scalp_operational"));
  }

  // Full DB access probe: all five real table payloads must include their complete, table-specific
  // column sets, and every successful row must carry the same leave-in-place test tag.
  {
    const fetchImpl=recordingFetch(jsonResponse(201));
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const result=await context.BT001Supabase.testDbAccess();
    assert.equal(result.ok,true);
    assert.equal(result.results.length,5);
    assert.equal(fetchImpl.calls.length,5);
    const expectedColumns={
      scalp_v1_signals:["action","cascade_agreement","detector_state","event_at","machine_id","source_timeframe","symbol"],
      scalp_v2_signals:["action","cascade_agreement","detector_state","machine_id","source_timeframe","symbol"],
      scalp_positions:["action","direction","event_at","machine_id","position_state","symbol","tranche_id"],
      scalp_operational:["action","detail","event_at","machine_id"],
      scalp_trades:[
        "auto_entered","avg_entry_price","cascade_agreement_at_entry","closed_at","created_at",
        "device_id","direction","entry_commission","estimated_realized_pnl_usd","event_type",
        "exit_price","exit_reason","filled_qty","mode","raw_session","requested_qty","source_timeframe","symbol"
      ]
    };
    for(const call of fetchImpl.calls){
      const table=call.url.split("/").at(-1),row=JSON.parse(call.options.body);
      assert.deepEqual(Object.keys(row).sort(),expectedColumns[table],`${table} DB test payload must exercise every real column`);
      if(table!=="scalp_trades")assert.equal(row.machine_id,context.BT001Supabase.getDeviceId());
      const serialized=JSON.stringify(row);
      assert(serialized.includes(result.tag),`${table} test row must be tagged for later identification`);
    }
    assert.equal(context.BT001Supabase.pendingCount(),0,"DB access probes must never enter the trading retry queue");
  }

  // A rejection on one table must not stop the remaining probes, and the exact PostgREST column
  // message/code/details/hint must survive in that table's result.
  {
    const fetchImpl=recordingFetch(async url=>{
      if(url.endsWith("/scalp_v2_signals"))return new Response(JSON.stringify({
        code:"PGRST204",
        message:"Could not find the 'cascade_agreement' column of 'scalp_v2_signals' in the schema cache",
        details:"Rejected test fixture",
        hint:"Refresh the schema cache"
      }),{status:400,headers:{"content-type":"application/json"}});
      return new Response("",{status:201});
    });
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const result=await context.BT001Supabase.testDbAccess();
    assert.equal(result.ok,false);
    assert.equal(fetchImpl.calls.length,5,"all tables must be attempted even after a failure");
    const failure=result.results.find(item=>item.table==="scalp_v2_signals");
    assert.equal(failure.status,400);
    assert.equal(failure.code,"PGRST204");
    assert(failure.reason.includes("'cascade_agreement' column"));
    assert(failure.reason.includes("Rejected test fixture"));
    assert(failure.reason.includes("Refresh the schema cache"));
    assert.equal(result.results.filter(item=>item.ok).length,4);
  }

  {
    const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
    const settingsSource=fs.readFileSync(path.join(root,"features/scalp/supabase-settings.module.js"),"utf8");
    assert(html.includes('id="scalpSupabaseTest"')&&html.includes('id="scalpSupabaseDbTest"'));
    assert(html.indexOf('id="scalpSupabaseDbTest"')>html.indexOf('id="scalpSupabaseTest"'));
    assert(settingsSource.includes("supabase.testDbAccess()")&&settingsSource.includes('item.ok?"PASS":"FAIL"'));
  }

  console.log("supabase service tests: PASS");
  return {passed:true};
})();
module.exports=run;if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
