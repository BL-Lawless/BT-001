"use strict";
const assert=require("assert");
const {readConfig,parsePeriods}=require("./config.js");
const {createNodeExchangeClock}=require("./clock.js");
const {createSupabaseLogger}=require("./supabase-client.js");
const {createBinanceDataSource,parseRestKline}=require("./binance-data-source.js");
const {createLoggerRunner}=require("./logger-runner.js");
const {buildSsscRunner,createMarketFreshnessTracker}=require("./run-sssc.js");
const {createScalpMarketHub}=require("./scalp-market-hub.js");

async function run(){
  const cases={};
  assert.throws(()=>readConfig({}),/SUPABASE_URL is required/);
  assert.throws(()=>readConfig({SUPABASE_URL:"u",SUPABASE_ANON_KEY:"k",BT001_SYMBOL:"BTCUSDT"}),/BT001_MACHINE_ID is required/);
  const config=readConfig({SUPABASE_URL:"https://example.supabase.co/",SUPABASE_ANON_KEY:"anon",BT001_MACHINE_ID:"vm-explicit",BT001_SYMBOL:"btcusdt",SSSC_MA_PERIODS:"9,21,55,100,200"});
  assert.equal(config.machineId,"vm-explicit");assert.equal(config.symbol,"BTCUSDT");assert.equal(config.supabaseUrl,"https://example.supabase.co");
  assert.throws(()=>parsePeriods("9,21"),/exactly five/);cases.configRequiresExplicitMachineIdentity=true;

  let local=1000;
  const clock=createNodeExchangeClock({localNow:()=>local,fetchServerTime:async()=>{local=1020;return 1100;},fetch:async()=>{throw new Error("unused");}});
  await clock.sync(true);
  assert.equal(clock.offset(),80,"clock must preserve browser semantics: server time minus response-arrival time");
  assert.equal(clock.now(),1100);assert.equal(clock.fromLocal(500),580);cases.clockMatchesConservativeBrowserOffset=true;

  const inserts=[],fakeClient={from:table=>({insert:async row=>{inserts.push({table,row});return {error:null};}})};
  const supabase=createSupabaseLogger({url:"https://example.supabase.co",key:"anon",machineId:"vm-explicit",client:fakeClient,snapshotIntervalMs:100000});
  assert.equal(supabase.getDeviceId(),"vm-explicit");await supabase.log("scalp_operational",{action:"TEST"});
  supabase.setLatestSnapshot({machine_id:"vm-explicit"});await supabase.flushSnapshot();supabase.startSnapshotLogging();supabase.stopSnapshotLogging();
  assert.deepEqual(inserts.map(item=>item.table),["scalp_operational","sssc_snapshots"]);
  assert.throws(()=>createSupabaseLogger({url:"u",key:"k",client:fakeClient}),/machine_id is required/);cases.supabaseShimUsesInjectedIdentityAndTables=true;
  const staleWarnings=[];
  supabase.setSnapshotFreshnessProvider(()=>({fresh:false,lastUpdateAt:1000,ageMs:90001}));
  supabase.setLatestSnapshot({machine_id:"vm-explicit",stale:true});
  assert.equal(await supabase.flushSnapshot(),false);
  assert.equal(inserts.length,2,"a stale snapshot must not be inserted");
  const guarded=createSupabaseLogger({url:"u",key:"k",machineId:"vm",client:fakeClient,warn:(...args)=>staleWarnings.push(args)});
  guarded.setLatestSnapshot({machine_id:"vm"});
  guarded.setSnapshotFreshnessProvider(()=>({fresh:false,lastUpdateAt:1000,ageMs:90001}));
  assert.equal(await guarded.flushSnapshot(),false);assert.match(staleWarnings[0][0],/stale data detected, skipping/);
  cases.staleSnapshotIsSkippedAndWarned=true;

  const raw=[1700000000000,"1","3","0.5","2","10",1700000059999,"20"];
  assert.deepEqual(parseRestKline(raw),{time:1700000000,open:1,high:3,low:.5,close:2,volume:10,baseVolume:10,openTime:1700000000000,closeTime:1700000059999,quoteVolume:20,final:true,source:"headless-rest"});
  let requestedUrl=null;
  class FakeSocket{
    constructor(url){this.url=url;FakeSocket.last=this;}
    close(){this.closed=true;}
  }
  const market=createBinanceDataSource({
    fetch:async url=>{requestedUrl=String(url);return {ok:true,json:async()=>[raw]};},
    WebSocket:FakeSocket,restUrl:"https://fapi.binance.com"
  });
  const rows=await market.fetchKlines("1m",1700000060000,1500,"BTCUSDT");
  assert.equal(rows[0].time,1700000000);assert(requestedUrl.includes("/fapi/v1/klines?"));assert(requestedUrl.includes("symbol=BTCUSDT"));assert(requestedUrl.includes("endTime=1700000060000"));
  const socket=market.connectWebSocket("wss://example.test/stream",{reconnect:false});socket.disconnect();assert.equal(FakeSocket.last.closed,true);
  cases.binanceShimMatchesOrchestrationFetcherAndSocketShape=true;

  let healthNow=0,healthCheck=null,reconnectCallback=null;
  const healthLogs=[],healthWarnings=[];
  class HealthSocket{
    constructor(url){this.url=url;HealthSocket.instances.push(this);}
    on(name,handler){if(name==="pong")this.onpong=handler;}
    ping(){this.pings=(this.pings||0)+1;}
    terminate(){this.terminated=true;}
    close(){this.closed=true;}
  }
  HealthSocket.instances=[];
  const healthSource=createBinanceDataSource({
    fetch:async()=>({ok:true,json:async()=>[]}),WebSocket:HealthSocket,now:()=>healthNow,
    setIntervalFn:callback=>{healthCheck=callback;return 1;},clearIntervalFn:()=>{healthCheck=null;},
    setTimeoutFn:callback=>{reconnectCallback=callback;return 2;},clearTimeoutFn:()=>{reconnectCallback=null;},
    log:(...args)=>healthLogs.push(args),warn:(...args)=>healthWarnings.push(args)
  });
  let syntheticClose=null;
  const healthySocket=healthSource.connectWebSocket("wss://example.test/health",{
    connectionKey:"test-feed",reconnect:true,staleAfterMs:100,healthCheckIntervalMs:10,reconnectDelayMs:1,
    onClose:event=>{syntheticClose=event;}
  });
  HealthSocket.instances[0].onopen({});
  healthNow=101;healthCheck();
  assert(HealthSocket.instances[0].terminated);assert(syntheticClose&&syntheticClose.synthetic);assert(reconnectCallback);
  reconnectCallback();assert.equal(HealthSocket.instances.length,2);
  HealthSocket.instances[1].onopen({});
  assert(healthLogs.some(args=>String(args[0]).includes("reconnected")));
  assert(healthWarnings.some(args=>String(args[0]).includes("stalled")));
  healthySocket.disconnect();cases.stalledWebSocketForcesVisibleReconnect=true;

  const calls=[],component={start:()=>calls.push("component-start"),capture:()=>{calls.push("capture");return true;},stop:()=>calls.push("component-stop")};
  const source={start:()=>calls.push("source-start"),stop:()=>calls.push("source-stop")};
  const runner=createLoggerRunner({component,dataSource:source});await runner.start();assert.equal(runner.capture(),true);await runner.stop();
  assert.deepEqual(calls,["source-start","component-start","capture","component-stop","source-stop"]);cases.genericRunnerSupportsLifecycleComponents=true;

  const hubSocket={disconnect(){this.stopped=true;}};
  let hubHandlers=null,hubFetches=0;
  const hubSource={fetchKlines:async()=>{hubFetches++;return [raw];},connectWebSocket:(_url,handlers)=>{hubHandlers=handlers;return hubSocket;}};
  const scalpHub=createScalpMarketHub({dataSource:hubSource,symbol:"BTCUSDT",minimumRows:80,now:()=>1700000060000,log:()=>{}});
  await scalpHub.start();assert.equal(scalpHub.getTimeframeRevisions("1m").closedRevision,1);assert.equal(hubFetches,4);
  hubHandlers.onOpen();hubHandlers.onOpen();await scalpHub.seed("test-wait");
  assert.equal(hubFetches,8,"a reconnect must REST reseed every scalp timeframe");
  scalpHub.stop();assert(hubSocket.stopped);
  cases.scalpMarketHubProvidesInjectedCanonicalSnapshotsAndReconnectReseed=true;

  let freshnessNow=1000;
  const freshness=createMarketFreshnessTracker({now:()=>freshnessNow,staleAfterMs:100});
  assert.equal(freshness.status().fresh,false);
  freshness.observe({privateCandlesByTf:{"1m":[{time:1,close:100}]},privateFormingByTf:{}});
  assert.equal(freshness.status().fresh,true);
  freshnessNow=1101;assert.equal(freshness.status().fresh,false);
  freshness.observe({privateCandlesByTf:{"1m":[{time:1,close:100}]},privateFormingByTf:{}});
  assert.equal(freshness.status().fresh,false,"an unchanged candle fingerprint must remain stale");
  freshness.observe({privateCandlesByTf:{"1m":[{time:1,close:101}]},privateFormingByTf:{}});
  assert.equal(freshness.status().fresh,true);cases.marketFingerprintTracksRealUpdatesOnly=true;

  const ssscWrites=[],ssscSupabase={
    configured:()=>true,getDeviceId:()=>"vm-explicit",setLatestSnapshot:row=>{ssscWrites.push(row);},
    startSnapshotLogging(){this.started=true;},stopSnapshotLogging(){this.stopped=true;}
  };
  const silentSocket={disconnect(){}};
  const ssscData={fetchKlines:async()=>[],connectWebSocket:()=>silentSocket};
  const ssscRunner=buildSsscRunner({config,clock:{now:()=>Date.now()},supabase:ssscSupabase,dataSource:ssscData,warn:()=>{}});
  await ssscRunner.start();ssscRunner.capture();await ssscRunner.stop();
  assert(ssscSupabase.started&&ssscSupabase.stopped);cases.ssscEntryCompositionUsesOrchestrationAndPhaseOneCore=true;

  console.log("Headless shim and runner tests: PASS",cases);
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
