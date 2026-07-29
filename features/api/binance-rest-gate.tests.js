"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {
  BinanceRestGate,
  parseBannedUntil,
  parseRetryAfter,
  constants
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
  assert.equal(warns,0,"pause entry must not emit routine console output");

  const nonBinance=await fetchFn("https://example.com/data");
  assert.equal(nonBinance.status,200,"non-Binance requests remain outside the gate");
  assert.equal(calls,2);

  now+=45_001;
  gate.state();
  assert.equal((await queued).status,200,"queued requests fire when the pause ends");
  assert.equal(calls,3);
  assert.equal(infos,0,"pause exit must not emit routine console output");
  gate.exitPause();

  const messageGate=new BinanceRestGate({now:()=>now,logger:{warn(){},info(){}}});
  await messageGate.wrapFetch(async()=>new Response(
    JSON.stringify({msg:`IP banned until ${now+20_000}`}),
    {status:400,headers:{"content-type":"application/json"}}
  ))("https://fapi.binance.com/fapi/v1/account");
  assert.equal(messageGate.state().pausedUntil,now+20_000,"ban messages pause even on a non-429 error status");
  messageGate.exitPause();

  async function observePause(status,{headers={},body=""}={}){
    const observed=new BinanceRestGate({now:()=>now,logger:{warn(){},info(){}}});
    await observed.observeResponse(new Response(body,{status,headers}));
    return observed;
  }

  const retry429=await observePause(429,{headers:{"Retry-After":"12"}});
  assert.equal(retry429.state().pausedUntil,now+12_000,"429 Retry-After seconds must set the exact pause end");
  now+=2_500;
  assert.equal(retry429.state().remainingMs,9_500,"pause state must expose the dynamic remaining duration used by the calculator UI");
  retry429.exitPause();
  now-=2_500;

  const datedRetry=new Date(now+25_000).toUTCString();
  assert.equal(parseRetryAfter(datedRetry,now),Date.parse(datedRetry),"Retry-After HTTP dates must remain supported");

  const fallback429=await observePause(429);
  assert.equal(fallback429.state().pausedUntil,now+constants.DEFAULT_429_PAUSE_MS,"429 without Binance timing must retain the 60-second fallback");
  fallback429.exitPause();

  const specifiedBanUntil=now+11*60_000;
  const dynamic418=await observePause(418,{
    body:JSON.stringify({code:-1003,msg:`Way too many requests; IP banned until ${specifiedBanUntil}.`}),
    headers:{"content-type":"application/json"}
  });
  assert.equal(dynamic418.state().pausedUntil,specifiedBanUntil,"418 must pause until Binance's body-specified ban end");
  dynamic418.exitPause();

  const fallback418=await observePause(418);
  assert.equal(fallback418.state().pausedUntil,now+constants.DEFAULT_418_PAUSE_MS,"418 without ban timing must retain the five-minute fallback");
  fallback418.exitPause();

  const longestSpecification=now+9*60_000;
  const conflicting418=await observePause(418,{
    headers:{"Retry-After":"30","content-type":"application/json"},
    body:JSON.stringify({code:-1003,msg:`IP banned until ${longestSpecification}`})
  });
  assert.equal(conflicting418.state().pausedUntil,longestSpecification,"the gate must never shorten a longer Binance-specified ban");
  conflicting418.exitPause();

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
