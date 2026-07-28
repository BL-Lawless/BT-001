function BT001LoggingWorkerMain(){
  "use strict";

  const SNAPSHOT_INTERVAL_MS=30000,RETRY_DELAY_MS=4000,DB_NAME="bt001-supabase-log-v1",STORE_NAME="jobs";

  function createIndexedDbStore(indexedDBImpl){
    let dbPromise=null;
    function db(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
        const request=indexedDBImpl.open(DB_NAME,1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME,{keyPath:"id",autoIncrement:true});};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      return dbPromise;
    }
    async function transaction(mode,operation){
      const database=await db();
      return new Promise((resolve,reject)=>{
        const tx=database.transaction(STORE_NAME,mode),store=tx.objectStore(STORE_NAME);
        let result;
        try{result=operation(store);}catch(error){reject(error);return;}
        tx.oncomplete=()=>resolve(result&&result.result);
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error);
      });
    }
    return {
      add:job=>transaction("readwrite",store=>store.add(job)),
      remove:id=>transaction("readwrite",store=>store.delete(id)),
      all:()=>transaction("readonly",store=>store.getAll())
    };
  }

  function createRuntime(options={}){
    const store=options.store||createIndexedDbStore(options.indexedDB||indexedDB);
    const fetchFn=options.fetchFn||fetch;
    const setIntervalFn=options.setIntervalFn||setInterval;
    const clearIntervalFn=options.clearIntervalFn||clearInterval;
    const setTimeoutFn=options.setTimeoutFn||setTimeout;
    const post=options.postMessageFn||(()=>{});
    let url="",key="",latestSnapshot=null,snapshotTimer=null,retryTimer=null,flushing=false;
    let pending=0,succeeded=0,failed=0;
    const initialized=Promise.resolve(store.all()).then(jobs=>{pending=jobs.length;status();}).catch(()=>{});

    const status=()=>{
      const eventMs=Date.parse(latestSnapshot&&latestSnapshot.event_at||"");
      post({
        type:"status",pending,succeeded,failed,configured:!!url&&!!key,
        latestSnapshotEventAt:latestSnapshot&&latestSnapshot.event_at||null,
        latestSnapshotAgeMs:Number.isFinite(eventMs)?Math.max(0,Date.now()-eventMs):null
      });
    };
    function scheduleRetry(){
      if(retryTimer)return;
      retryTimer=setTimeoutFn(()=>{retryTimer=null;flush();},RETRY_DELAY_MS);
    }
    async function send(job){
      if(!url||!key)throw new Error("Supabase URL/anon key are not configured");
      const response=await fetchFn(`${url}/rest/v1/${job.table}`,{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json",apikey:key,Authorization:`Bearer ${key}`,Prefer:"return=minimal"},
        body:JSON.stringify(job.row)
      });
      if(!response.ok)throw new Error(`Supabase insert failed (HTTP ${response.status})`);
    }
    async function flush(){
      await initialized;
      if(flushing)return;
      flushing=true;
      try{
        const jobs=await store.all();
        pending=jobs.length;status();
        if(!url||!key){if(jobs.length)scheduleRetry();return;}
        for(const job of jobs){
          try{await send(job);await store.remove(job.id);pending--;succeeded++;status();}
          catch(_error){failed++;status();scheduleRetry();break;}
        }
      }finally{flushing=false;}
    }
    async function enqueue(table,row){
      await store.add({table,row,queued_at:new Date().toISOString()});
      pending++;status();
      await flush();
    }
    function startSnapshots(){
      if(snapshotTimer!=null)return;
      snapshotTimer=setIntervalFn(()=>{status();if(latestSnapshot)enqueue("sssc_snapshots",latestSnapshot).catch(()=>{});},SNAPSHOT_INTERVAL_MS);
    }
    function stopSnapshots(){if(snapshotTimer!=null)clearIntervalFn(snapshotTimer);snapshotTimer=null;}
    async function handle(message={}){
      if(message.type==="config"){
        url=String(message.url||"").replace(/\/+$/,"");key=String(message.key||"");status();await flush();
      }else if(message.type==="enqueue")await enqueue(message.table,message.row);
      else if(message.type==="latestSnapshot")latestSnapshot=message.row||null;
      else if(message.type==="startSnapshots")startSnapshots();
      else if(message.type==="stopSnapshots")stopSnapshots();
      else if(message.type==="flush")await flush();
    }
    return Object.freeze({handle,flush,enqueue,startSnapshots,stopSnapshots,getStatus:()=>({pending,succeeded,failed})});
  }

  const api=Object.freeze({SNAPSHOT_INTERVAL_MS,RETRY_DELAY_MS,createIndexedDbStore,createRuntime});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_LOGGING_WORKER_SOURCE=`(${BT001LoggingWorkerMain.toString()})();`;
  if(typeof self!=="undefined"&&typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope){
    const runtime=createRuntime({postMessageFn:message=>self.postMessage(message)});
    self.onmessage=event=>{runtime.handle(event.data).catch(error=>self.postMessage({type:"error",message:error&&error.message||String(error)}));};
  }
}
BT001LoggingWorkerMain();
