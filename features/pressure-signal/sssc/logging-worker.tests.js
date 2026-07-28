"use strict";
const assert=require("assert");
const {SNAPSHOT_INTERVAL_MS,createRuntime}=require("./logging-worker.js");

class MemoryStore{
  constructor(rows=[]){this.rows=rows;this.next=1;}
  async add(job){job.id=this.next++;this.rows.push(job);return job.id;}
  async remove(id){const index=this.rows.findIndex(row=>row.id===id);if(index>=0)this.rows.splice(index,1);}
  async all(){return this.rows.map(row=>({...row}));}
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  const store=new MemoryStore(),calls=[],statusMessages=[];
  let intervalCallback=null,intervalDelay=null;
  const runtime=createRuntime({
    store,
    fetchFn:async(url,options)=>{calls.push({url,options});return {ok:true,status:201};},
    setIntervalFn:(callback,delay)=>{intervalCallback=callback;intervalDelay=delay;return 1;},
    postMessageFn:message=>statusMessages.push(message),
    setTimeoutFn:()=>1
  });
  await runtime.handle({type:"config",url:"https://project.supabase.co",key:"anon"});
  await runtime.handle({type:"latestSnapshot",row:{event_at:"2026-07-27T00:00:00.000Z",machine_id:"m1"}});
  runtime.startSnapshots();
  assert.equal(intervalDelay,SNAPSHOT_INTERVAL_MS);
  assert.equal(typeof intervalCallback,"function","the Worker must own the snapshot timer independently of page visibility");
  intervalCallback();
  await tick();await tick();
  assert.equal(calls.length,1);
  assert(calls[0].url.endsWith("/rest/v1/sssc_snapshots"));
  const freshness=statusMessages.findLast(message=>message.type==="status"&&message.latestSnapshotEventAt);
  assert.equal(freshness.latestSnapshotEventAt,"2026-07-27T00:00:00.000Z");
  assert(Number.isFinite(freshness.latestSnapshotAgeMs),"worker telemetry must expose cached snapshot age");

  const durableRows=[],firstStore=new MemoryStore(durableRows);
  const first=createRuntime({
    store:firstStore,fetchFn:async()=>{throw new Error("offline");},
    setTimeoutFn:()=>1,setIntervalFn:()=>1
  });
  await first.handle({type:"config",url:"https://project.supabase.co",key:"anon"});
  await first.enqueue("scalp_operational",{event_at:"2026-07-27T00:00:01.000Z",action:"ARMED"});
  assert.equal(durableRows.length,1,"failed writes must remain persisted");

  let retried=0;
  const second=createRuntime({
    store:new MemoryStore(durableRows),
    fetchFn:async()=>{retried++;return {ok:true,status:201};},
    setTimeoutFn:()=>1,setIntervalFn:()=>1
  });
  await second.handle({type:"config",url:"https://project.supabase.co",key:"anon"});
  await second.flush();
  assert(retried>=1,"a restarted Worker must retry jobs loaded from durable storage");
  assert.equal(durableRows.length,0,"confirmed writes must be removed from durable storage");

  console.log("SSSC logging worker tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
