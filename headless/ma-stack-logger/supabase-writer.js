"use strict";

const fs=require("fs");
const path=require("path");

function createMaStackWriter(options={}){
  const createClient=options.createClient||require("@supabase/supabase-js").createClient;
  const client=options.client||createClient(options.url,options.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const table=String(options.table||"ma_stack_snapshots"),spoolPath=path.resolve(String(options.spoolPath));
  const attempts=Math.max(1,Number(options.attempts)||3),baseDelayMs=Math.max(1,Number(options.baseDelayMs)||250);
  const sleep=options.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))),warn=options.warn||console.warn,fsImpl=options.fs||fs;
  let chain=Promise.resolve(),started=false;

  async function insert(rows){
    const payload=Array.isArray(rows)?rows:[rows];
    let lastError=null;
    for(let attempt=1;attempt<=attempts;attempt++){
      try{
        const {error}=await client.from(table).insert(payload);
        if(error){
          if(payload.length===1&&payload[0]&&payload[0].provisional===false&&String(error.code||"")==="23505")return true;
          throw error;
        }
        return true;
      }catch(error){
        lastError=error;
        if(attempt<attempts)await sleep(baseDelayMs*Math.pow(2,attempt-1));
      }
    }
    throw lastError||new Error("MA Stack Supabase insert failed");
  }

  function ensureSpoolDirectory(){fsImpl.mkdirSync(path.dirname(spoolPath),{recursive:true});}
  function spool(rows,error){
    ensureSpoolDirectory();
    const payload=(Array.isArray(rows)?rows:[rows]).map(row=>JSON.stringify({spooled_at:new Date().toISOString(),error:error&&error.message||String(error),row})).join("\n")+"\n";
    fsImpl.appendFileSync(spoolPath,payload,{encoding:"utf8",mode:0o600});
    warn(`[MA Stack Supabase] spooled ${Array.isArray(rows)?rows.length:1} row(s) after retry exhaustion`,error);
    return false;
  }

  async function flushSpool(){
    if(!fsImpl.existsSync(spoolPath))return 0;
    const lines=fsImpl.readFileSync(spoolPath,"utf8").split(/\r?\n/).filter(Boolean),remaining=[];
    let flushed=0,blocked=false;
    for(const line of lines){
      if(blocked){remaining.push(line);continue;}
      let item;
      try{item=JSON.parse(line);}catch(error){warn("[MA Stack Supabase] preserving malformed spool line",error);remaining.push(line);continue;}
      try{await insert(item.row);flushed+=1;}catch(error){blocked=true;remaining.push(line);warn("[MA Stack Supabase] spool recovery paused after insert failure",error);}
    }
    ensureSpoolDirectory();
    fsImpl.writeFileSync(spoolPath,remaining.length?remaining.join("\n")+"\n":"",{encoding:"utf8",mode:0o600});
    return flushed;
  }

  async function performWrite(rows){
    try{
      await insert(rows);
      await flushSpool();
      return true;
    }catch(error){return spool(rows,error);}
  }
  function enqueue(operation){
    const next=chain.then(operation,operation);chain=next.catch(()=>{});return next;
  }
  function start(){if(started)return chain;started=true;return enqueue(()=>flushSpool());}
  function write(rows){return enqueue(()=>performWrite(rows));}
  function stop(){return chain;}
  return Object.freeze({start,write,flushSpool:()=>enqueue(()=>flushSpool()),stop,status:()=>({started,table,spoolPath})});
}

module.exports={createMaStackWriter};
