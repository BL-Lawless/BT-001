"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");

(async()=>{
  let streamOptions=null;
  const streamDiagnostics={
    streamStatus:"live",starts:1,reconnects:0,connectedAt:1000,disconnectedAt:0,lastError:null,
    wsEndpoint:"wss://fstream.binance.com/private/ws?listenKey={listenKey}&events=ORDER_TRADE_UPDATE%2FACCOUNT_UPDATE",
    wsEndpointCapturedAt:999,lastCloseAt:0,lastCloseCode:null,lastCloseReason:null
  };
  const context={
    console,Math,Number,Object,Array,Set,Map,Date,Promise,JSON,Error,TypeError,URLSearchParams,TextEncoder,Uint8Array,
    crypto:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1,2,3]).buffer}},
    BT001ExchangeClock:{ensureSynchronized:async()=>0,isReliable:()=>true,now:()=>Date.now()},
    BT001ScalpAccount:{getCredentials:()=>({key:"key",secret:"secret"}),reportConnectionStatus:()=>{}},
    BT001_BINANCE_TRADING:{symbol:()=>"BTCUSDT"},
    restService:{requestJson:async url=>url.includes("/balance")?[]:[]},
    API:{},
    createBinanceUserDataStream:options=>{
      streamOptions=options;
      return {
        start:async()=>{options.onStatus({...streamDiagnostics});return true;},
        stop:()=>{},
        diagnostics:()=>({...streamDiagnostics})
      };
    }
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(root,"features/scalp/secondary-gateway.module.js"),"utf8"),
    context,
    {filename:"features/scalp/secondary-gateway.module.js"}
  );

  const engine={
    onPrivateStatus:()=>{},onPosition:()=>{},onOrder:()=>{},setRecoveryBlocked:()=>{},
    applyPositionFacts:()=>{},recover:async()=>{},completeRecovery:()=>{}
  };
  const gateway=context.BT001ScalpSecondaryGateway.create("scalper");
  gateway.attach(engine);
  await new Promise(resolve=>setTimeout(resolve,0));
  let connection=gateway.connection();
  assert.equal(connection.streamStatus,"LIVE");
  assert.equal(connection.starts,1);
  assert.equal(connection.reconnects,0);
  assert.equal(connection.wsEndpoint,streamDiagnostics.wsEndpoint);
  assert.equal(connection.wsEndpointCapturedAt,999);
  assert.equal(connection.lastCloseCode,null);
  assert(streamOptions,"secondary gateway must create the shared user-data stream");

  const mainSource=fs.readFileSync(path.join(root,"main.js"),"utf8");
  const gateStart=mainSource.indexOf("function createScalpVisibilityRecoveryGate21");
  const gateEnd=mainSource.indexOf("const scalpVisibilityRecoveryGate21",gateStart);
  assert(gateStart>=0&&gateEnd>gateStart,"SCALP visibility recovery gate must be present");
  const gateFactory=vm.runInNewContext(`${mainSource.slice(gateStart,gateEnd)};createScalpVisibilityRecoveryGate21`,{console,Math,Number,Object,String,Date,Promise});
  let gateNow=1000;
  const recoveryGate=gateFactory({windowMs:30000,now:()=>gateNow});
  await recoveryGate.run("focus-visibility-recovery:focus",reason=>gateway.recover(reason));
  gateNow=1005;
  await recoveryGate.run("focus-visibility-recovery:visibilitychange",reason=>gateway.recover(reason));
  gateNow=30999;
  await recoveryGate.run("focus-visibility-recovery:pageshow",reason=>gateway.recover(reason));
  connection=gateway.connection();
  assert.equal(connection.authenticatedRecoveryRuns,1);
  assert.equal(connection.lastAuthenticatedRecoveryReason,"focus-visibility-recovery:focus");
  assert(connection.lastAuthenticatedRecoveryCompletedAt>=connection.lastAuthenticatedRecoveryStartedAt);
  assert.equal(connection.lastAuthenticatedRecoveryError,null);
  assert.equal(recoveryGate.diagnostics().suppressedAttempts,2);

  gateNow=31000;
  await recoveryGate.run("focus-visibility-recovery:pageshow-after-window",reason=>gateway.recover(reason));
  connection=gateway.connection();
  assert.equal(connection.authenticatedRecoveryRuns,2);
  assert.equal(connection.lastAuthenticatedRecoveryReason,"focus-visibility-recovery:pageshow-after-window");
  assert.equal(recoveryGate.diagnostics().completedRuns,2);

  const indexSource=fs.readFileSync(path.join(root,"features/scalp/index.js"),"utf8");
  assert(indexSource.includes("connection:secondaryGateway?secondaryGateway.connection()"));
  assert(indexSource.includes("recoverAuthenticated:reason=>"));
  assert(mainSource.includes("scalpVisibilityRecoveryGate21.run(reason,()=>scalp.recoverAuthenticated(reason))"));
  const mainWorkStart=mainSource.indexOf("async function performVisibleAccountsRecovery21"),mainEntryStart=mainSource.indexOf("async function recoverVisibleAccounts21",mainWorkStart),mainEntryEnd=mainSource.indexOf("window.BT001VisibilityRecovery=",mainEntryStart);
  assert(!mainSource.slice(mainWorkStart,mainEntryStart).includes("scalpVisibilityRecoveryGate21.run"),"SCALP visibility gating must remain independent of the main-account cooldown");
  assert(mainSource.slice(mainEntryStart,mainEntryEnd).includes("scalpVisibilityRecoveryGate21.run"),"every visibility attempt must be observable by SCALP's original gate");
  assert(mainSource.includes("scalp:scalpVisibilityRecoveryGate21.diagnostics()"));

  console.log("SCALP secondary gateway diagnostics tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
