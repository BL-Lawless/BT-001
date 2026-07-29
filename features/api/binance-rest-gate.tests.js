"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {
  BinanceRestGate,
  parseBannedUntil,
  parseRetryAfter
}=require("../../services/binance-rest-gate.service.js");

async function run(){
  let now=1_800_000_000_000,calls=0,warns=0,infos=0;
  const gate=new BinanceRestGate({
    now:()=>now,
    logger:{warn(){warns+=1;},info(){infos+=1;}}
  });
  const fetchFn=gate.wrapFetch(async()=>{
    calls+=1;
    if(calls>1)return new Response("ok",{status:200});
    return new Response(JSON.stringify({code:-1003,msg:`Way too many requests; IP banned until ${now+45_000}.`}),{
      status:418,
      headers:{"content-type":"application/json"}
    });
  });
  const response=await fetchFn("https://fapi.binance.com/fapi/v1/time");
  assert.equal(response.status,418);
  assert.equal(gate.state().pausedUntil,now+45_000);
  assert.equal(parseBannedUntil("IP banned until 1800000045000"),now+45_000);
  assert.equal(parseRetryAfter("12",now),now+12_000);
  let queuedSettled=false;
  const queued=fetchFn("https://api.binance.com/api/v3/time").then(response=>{queuedSettled=true;return response;});
  await Promise.resolve();
  assert.equal(queuedSettled,false,"paused Binance requests must wait");
  assert.equal(calls,1,"paused requests must not reach fetch");
  assert.equal(warns,1,"pause entry must log once");

  const nonBinance=await fetchFn("https://example.com/data");
  assert.equal(nonBinance.status,200,"non-Binance requests remain outside the gate");
  assert.equal(calls,2);

  now+=45_001;
  gate.state();
  assert.equal((await queued).status,200,"queued requests fire when the pause ends");
  assert.equal(calls,3);
  assert.equal(infos,1,"pause exit must log once");
  gate.exitPause();

  const messageGate=new BinanceRestGate({now:()=>now,logger:{warn(){},info(){}}});
  await messageGate.wrapFetch(async()=>new Response(
    JSON.stringify({msg:`IP banned until ${now+20_000}`}),
    {status:400,headers:{"content-type":"application/json"}}
  ))("https://fapi.binance.com/fapi/v1/account");
  assert.equal(messageGate.state().pausedUntil,now+20_000,"ban messages pause even on a non-429 error status");
  messageGate.exitPause();

  const root=path.resolve(__dirname,"../..");
  const calculator=fs.readFileSync(path.join(root,"features/calculator/presentation/calculatorModule.js"),"utf8");
  const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
  const scalp=fs.readFileSync(path.join(root,"features/scalp/state-machine.js"),"utf8");
  assert(calculator.includes("const AUTO_SYNC_POLL_MS = 2000;"));
  assert(calculator.includes("const OPEN_POSITION_CLOSE_CHS_POLL_MS = 1200;"));
  assert(main.includes("state.statusTimer = setInterval(runStatusLoop,1000);"));
  assert(!main.includes("restFailureCount")&&!main.includes("nextRestAttemptAt"));
  assert(scalp.includes("attempt<=C.order.protectionRetry")&&scalp.includes("attempt<=C.order.tpRetry"));
  console.log("binance REST gate tests: PASS");
}

run().catch(error=>{console.error(error);process.exitCode=1;});
