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

  local=5000;
  let forcedFetches=0;
  const forceable=createExchangeClock({
    localNow:()=>local,
    fetchServerTime:async()=>{forcedFetches++;return forcedFetches===1?4900:4700;}
  });
  assert.equal(await forceable.sync(),-100);
  assert.equal(await forceable.sync(),-100,"an ordinary sync must use the reliable cached offset");
  assert.equal(forcedFetches,1);
  assert.equal(await forceable.sync(true),-300,"a forced sync must bypass the five-minute cache");
  assert.equal(forcedFetches,2);

  local=10000;
  let slowFetches=0;
  const slow=createExchangeClock({
    localNow:()=>local,
    maxRoundTripMs:100,
    fetchServerTime:async()=>{
      slowFetches++;
      if(slowFetches===1){local+=20;return 9920;}
      if(slowFetches===2){local+=500;return 10000;}
      local+=10;return local-100;
    }
  });
  assert.equal(await slow.sync(),-100);
  assert.equal(slow.isReliable(),true);
  assert.equal(await slow.sync(true),-100,"a suspicious measurement must not replace the last usable offset");
  assert.equal(slow.isReliable(),false,"a background-delayed sync must invalidate reliability");
  assert.equal(slow.status().lastSyncOk,false);
  assert.equal(slow.status().lastRoundTripMs,500);
  assert.match(slow.status().lastError,/round-trip was untrustworthy/);
  local+=1000;
  assert.equal(await slow.sync(),-100,"an unreliable slow result must retry instead of entering the five-minute success cache");
  assert.equal(slowFetches,3);
  assert.equal(slow.isReliable(),true);

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
  const privateOrderReads=main.slice(main.indexOf("async function fetchOpenOrders21"),main.indexOf("function orderStateSig21"));
  assert(
    privateOrderReads.includes("Promise.allSettled([")&&
    privateOrderReads.includes("signedGet(OPEN_ORDERS_URL21")&&
    privateOrderReads.includes("signedGet(OPEN_ALGO_ORDERS_URL21"),
    "normal and algo open-order reconciliation reads must start in parallel"
  );
  const privateCoordinator=main.slice(main.indexOf("async function reconcilePrivateState21"),main.indexOf("function applyPrivateStreamStatus21"));
  assert(
    privateCoordinator.includes("[positionResult,ordersResult]=await Promise.all([")&&
    privateCoordinator.includes("window.refreshOpenPosition(")&&
    privateCoordinator.includes("requestAuthoritativeOrders21("),
    "position and order reconciliation reads must start in parallel"
  );
  const visibilityReturn=main.slice(main.indexOf("function handleVisibilityReturn()"),main.indexOf("function scheduleVisibilityRecovery()"));
  assert(
    visibilityReturn.includes("window.BT001ExchangeClock.sync(true)"),
    "visibility recovery must force the shared exchange clock to bypass its five-minute cache"
  );
  console.log("exchange clock tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
