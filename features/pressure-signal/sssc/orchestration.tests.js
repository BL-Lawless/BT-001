"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const calculation=require("./calculation.js");
const {createOrchestration,warmupTargets}=require("./orchestration.js");

(async()=>{
  const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
  const showSource=main.slice(main.indexOf("function show(){ visible=true"),main.indexOf("function hide(){ visible=false"));
  assert(!showSource.includes("startLive"),"show() must only reveal already-running data");
  const pipelineStart=main.indexOf("function ensurePipeline(){");
  const installSource=main.slice(pipelineStart,main.indexOf("if(window.BT001SettingsTabs",pipelineStart));
  assert(installSource.includes("ensurePipeline()?.startLive()"),"app installation must automatically start SSSC");

  let timerCallback=null,socketOptions=null,calculationCalls=0,updates=0;
  const slots=[1,2,3,4,5].map((period,index)=>({slotId:`MA${index+1}`,period}));
  const engine={
    calculateTimeframe(input){calculationCalls++;return calculation.calculateTimeframe(input);},
    deriveEarlyWarning:calculation.deriveEarlyWarning
  };
  const pipeline=createOrchestration({
    tfs:[["1M","1m"]],
    liveTfs:["1m"],
    getSlots:()=>slots,
    getCalculation:()=>engine,
    getSymbol:()=>"BTCUSDT",
    fetchKlines:async()=>[],
    connectWebSocket:(_url,options)=>{socketOptions=options;return {disconnect(){}};},
    getWsUrl:()=>"wss://fstream.binance.com/market/stream",
    setIntervalFn:callback=>{timerCallback=callback;return 7;},
    clearIntervalFn:()=>{},
    onUpdate:()=>updates++
  });
  pipeline.startLive();
  assert.equal(pipeline.getSnapshot().started,true,"pipeline must start without any show() call");
  assert.equal(typeof timerCallback,"function","always-on heartbeat must be installed");
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof socketOptions.onMessage,"function","private socket must connect during automatic startup");

  const beforeSocket=updates;
  socketOptions.onMessage({data:JSON.stringify({e:"kline",s:"BTCUSDT",k:{i:"1m",t:6000,T:65999,o:"100",h:"102",l:"99",c:"101",v:"2",q:"202",x:false}})});
  assert(updates>beforeSocket,"incoming WebSocket klines must immediately calculate and publish");

  const beforeHeartbeat=updates;
  timerCallback();
  assert(updates>beforeHeartbeat,"heartbeat must calculate regardless of dashboard visibility");

  const dynamic=[5,10,20,7,8].map((period,index)=>({slotId:`MA${index+1}`,period}));
  assert.deepEqual(warmupTargets(dynamic),{longestPeriod:20,minimum:60,full:100});
  let capturedRows=[];
  const slicingPipeline=createOrchestration({
    tfs:[["1M","1m"]],liveTfs:[],getSlots:()=>dynamic,
    getCalculation:()=>({
      calculateTimeframe(input){capturedRows.push(input.rows);return {tf:input.label,interval:input.interval,available:false,reason:"fixture"};},
      deriveEarlyWarning:()=>null
    }),
    getSymbol:()=>"BTCUSDT",fetchKlines:async()=>[],connectWebSocket:()=>({}),getWsUrl:()=>"wss://example/ws"
  });
  for(let time=1;time<=140;time++)slicingPipeline.upsertPrivateKline("1m",{time,close:time},true,140);
  slicingPipeline.buildDiagnosticSet("1M","1m");
  assert.equal(capturedRows[0].length,100,"closed rows must be sliced to 5x longest period before calculation");
  assert.equal(capturedRows[0][0].time,41);

  console.log("sssc always-on orchestration tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
