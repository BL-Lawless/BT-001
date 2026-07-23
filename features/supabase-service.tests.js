"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..");

function runtime({fetchImpl}={}){
  const store=new Map();
  const localStorage={
    getItem:key=>store.has(key)?store.get(key):null,
    setItem:(key,value)=>store.set(key,String(value)),
    removeItem:key=>store.delete(key)
  };
  const context={
    console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,
    URL,URLSearchParams,Headers,crypto:typeof crypto!=="undefined"?crypto:undefined,
    // Fake, inert timers: these tests only assert the immediate pending-queue push inside log()'s
    // catch, never the retry itself firing -- real timers would leave a live setTimeout chain behind
    // (log() -> scheduleFlush -> retry -> fails again -> scheduleFlush...) that keeps the process alive.
    setTimeout:()=>({}),clearTimeout:()=>{},
    localStorage,fetch:fetchImpl
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
    assert.equal(url,"https://myproject.supabase.co/rest/v1/scalp_activity_log");
    assert.equal(options.method,"POST");
    assert.equal(options.headers.apikey,"anon-key-correct");
    assert.equal(options.headers.Authorization,"Bearer anon-key-correct");
    const sentRow=JSON.parse(options.body);
    assert.equal(sentRow.action,"CONNECTION_TEST");
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
    assert(/scalp_activity_log/.test(result.message));
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
  // it still swallows failures into the retry queue instead of throwing, exactly as before.
  {
    const fetchImpl=recordingFetch(async()=>{throw new Error("network down")});
    const {context}=runtime({fetchImpl});
    context.BT001Supabase.saveUrlFromInput({value:"https://myproject.supabase.co"});
    context.BT001Supabase.saveKeyFromInput({value:"anon-key"});
    const ok=await context.BT001Supabase.log("scalp_activity_log",{action:"ARMED"});
    assert.equal(ok,false);
    assert.equal(context.BT001Supabase.pendingCount(),1,"log() must still queue failed rows for retry, unlike testConnection()");
  }

  console.log("supabase service tests: PASS");
  return {passed:true};
})();
module.exports=run;if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
