"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {createExchangeClock}=require("./exchange-clock.module.js");

(async()=>{
  let local=1000;
  const failed=createExchangeClock({localNow:()=>local,fetchServerTime:async()=>{throw new Error("offline");}});
  assert.equal(await failed.sync(),0);
  assert.equal(failed.now(),1000,"failed Binance time fetch must fall back to the unmodified local clock");
  assert.equal(failed.isReliable(),false);
  let blockedCalls=0;
  await assert.rejects(
    failed.ensureSynchronized({attempts:2,baseDelayMs:1}).then(()=>{blockedCalls++;}),
    /synchronization failed/
  );
  assert.equal(blockedCalls,0,"a never-synchronized clock must not allow the signed operation");

  local=3000;
  let attempts=0,delays=0;
  const recovering=createExchangeClock({
    localNow:()=>local,
    delay:async()=>{delays++;local+=10;},
    fetchServerTime:async()=>{attempts++;if(attempts<3)throw new Error("temporary outage");return local-25;}
  });
  const recoveredOffset=await recovering.ensureSynchronized({attempts:3,baseDelayMs:1});
  assert.equal(attempts,3,"a failed initial sync must be retried");
  assert.equal(delays,2);
  assert.equal(recoveredOffset,-25);
  assert.equal(recovering.isReliable(),true);
  let positionRefreshes=0,orderRefreshes=0;
  const signedPositionRefresh=async()=>{const off=await recovering.ensureSynchronized();positionRefreshes++;return {off,risk:[]};};
  const signedOrderRefresh=async()=>{const off=await recovering.ensureSynchronized();orderRefreshes++;return {off,orders:[]};};
  assert.deepEqual(await signedPositionRefresh(),{off:-25,risk:[]});
  assert.deepEqual(await signedOrderRefresh(),{off:-25,orders:[]});
  assert.equal(positionRefreshes,1);
  assert.equal(orderRefreshes,1);

  local=1000;
  const synced=createExchangeClock({localNow:()=>local,fetchServerTime:async()=>{local=2000;return 1500;}});
  assert.equal(await synced.sync(),-500);
  assert.equal(synced.now(),1500,"response latency correction must never put the signed clock ahead of the sampled Binance time");
  assert.equal(synced.fromLocal(1800),1300);
  assert.equal(synced.isReliable(),true);

  const root=path.resolve(__dirname,"..","..");
  const secondary=fs.readFileSync(path.join(root,"features/scalp/secondary-gateway.module.js"),"utf8");
  const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
  assert(!secondary.includes('restService.get(`${REST_BASE}/fapi/v1/time`)'),"secondary gateway must not retain a duplicate offset fetcher");
  assert(main.includes("await clock.ensureSynchronized"),"main signed requests must await bounded shared-clock synchronization");
  assert(main.includes("timestamp:String(Date.now() + off)"),"main signing must apply the shared server-minus-local offset exactly once");
  const positionRefresh=main.slice(main.indexOf("async function refreshOpenPosition"),main.indexOf("async function refreshOpenPosition")+1800);
  const orderRefresh=main.slice(main.indexOf("async function requestAuthoritativeOrders21"),main.indexOf("async function requestAuthoritativeOrders21")+1800);
  assert(positionRefresh.includes("await timeOffset()")&&positionRefresh.includes("await getPositions("));
  assert(orderRefresh.includes("await timeOffset()")&&orderRefresh.includes("await fetchOpenOrders21("));
  console.log("exchange clock tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
