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

  // A refresh must fan all independent timeframe windows out together. Pagination within one
  // window remains ordered because the next cursor comes from the preceding response.
  let releaseParallelFetches;
  const parallelFetchGate=new Promise(resolve=>{releaseParallelFetches=resolve;});
  const parallelFetchStarts=[];
  const parallelPipeline=createOrchestration({
    tfs:[["1M","1m"],["3M","3m"],["5M","5m"]],liveTfs:[],getSlots:()=>dynamic,
    getCalculation:()=>engine,getSymbol:()=>"BTCUSDT",
    fetchKlines:async tf=>{parallelFetchStarts.push(tf);await parallelFetchGate;return [];},
    connectWebSocket:()=>({disconnect(){}}),getWsUrl:()=>"wss://example/ws"
  });
  const parallelRefresh=parallelPipeline.refresh();
  await Promise.resolve();
  assert.deepEqual(
    parallelFetchStarts.slice().sort(),
    ["1m","3m","5m"],
    "SSSC refresh must start every timeframe fetch before waiting for any one timeframe"
  );
  releaseParallelFetches();
  await parallelRefresh;

  // REST parsing marks every row final:false. Seeding must retain only the active tail as
  // forming and stamp the time-confirmed history final:true before normalization consumes it.
  const hour=60*60,seedStart=1700000000,seedNow=(seedStart+1000*hour)*1000+hour*500;
  const standardSlots=[9,21,55,100,200].map((period,index)=>({slotId:`MA${index+1}`,period}));
  const restShapedRows=Array.from({length:1001},(_,index)=>{
    const close=30000+index*2+Math.sin(index/9)*20;
    return {
      time:seedStart+index*hour,openTime:(seedStart+index*hour)*1000,closeTime:(seedStart+(index+1)*hour)*1000-1,
      open:close-2,high:close+15,low:close-15,close,volume:10,baseVolume:10,quoteVolume:close*10,final:false
    };
  });
  let restFetches=0;
  const seededPipeline=createOrchestration({
    tfs:[["1H","1h"]],liveTfs:["1h"],getSlots:()=>standardSlots,getCalculation:()=>calculation,
    getSymbol:()=>"BTCUSDT",now:()=>seedNow,
    fetchKlines:async()=>{restFetches++;return restShapedRows;},
    connectWebSocket:()=>({disconnect(){}}),getWsUrl:()=>"wss://example/ws"
  });
  await seededPipeline.refresh();
  const seededSnapshot=seededPipeline.getSnapshot(),storedHistory=seededSnapshot.privateCandlesByTf["1h"],storedForming=seededSnapshot.privateFormingByTf["1h"];
  assert.equal(restFetches,1);
  assert.equal(storedHistory.length,1000);
  assert(storedHistory.every(row=>row.final===true),"all time-confirmed REST history must be stamped final:true");
  assert.equal(storedForming.time,restShapedRows.at(-1).time);
  assert.equal(storedForming.final,false,"only the genuinely active tail may remain forming");
  const normalizedHistory=calculation.calculateTimeframe({
    label:"1H",interval:"1h",rows:storedHistory,slots:standardSlots,minimumRows:600,fullRows:1000
  });
  assert.equal(normalizedHistory.available,true,"REST-seeded history must survive finalizedRows and produce a diagnostic");
  assert.equal(normalizedHistory.normalization.status,"available");
  assert(normalizedHistory.atr>0,"atrSeries must receive the finalized REST history");
  assert(normalizedHistory.RV.recent>0&&normalizedHistory.RV.prior>0,"buildNormalization must retain both RV windows");
  assert.equal(seededSnapshot.data["1H"].available,true,"the orchestration-to-calculation live diagnostic must be available");
  assert(seededSnapshot.data["1H"].atr>0&&seededSnapshot.data["1H"].RV.recent>0);

  // A reconnect after several missed closes must REST-reseed every timeframe before queued WS
  // messages are applied or another calculation can observe the discontinuous series.
  const reconnectSlots=[5,10,20,7,8].map((period,index)=>({slotId:`MA${index+1}`,period}));
  const reconnectStart=1800000000,minute=60;
  const candles=(first,count)=>Array.from({length:count},(_,index)=>{
    const time=reconnectStart+(first+index)*minute,close=40000+(first+index)*3+Math.sin((first+index)/4)*5;
    return {time,openTime:time*1000,closeTime:(time+minute)*1000-1,open:close-1,high:close+4,low:close-4,close,volume:10,baseVolume:10,quoteVolume:close*10};
  });
  let reconnectRows=candles(0,101),reconnectSocket=null,reconnectWarnings=[],failRepair=false,reconnectUpdates=0;
  const reconnectPipeline=createOrchestration({
    tfs:[["1M","1m"]],liveTfs:["1m"],getSlots:()=>reconnectSlots,getCalculation:()=>calculation,
    getSymbol:()=>"BTCUSDT",now:()=>((reconnectStart+1000*minute)*1000),
    fetchKlines:async()=>{if(failRepair)throw new Error("REST unavailable");return reconnectRows;},
    connectWebSocket:(_url,options)=>{reconnectSocket=options;return {disconnect(){}};},
    getWsUrl:()=>"wss://example/ws",setIntervalFn:()=>1,clearIntervalFn:()=>{},
    setTimeoutFn:()=>99,clearTimeoutFn:()=>{},warn:(message,detail)=>reconnectWarnings.push({message,detail}),
    onUpdate:()=>{reconnectUpdates+=1;}
  });
  await reconnectPipeline.refresh();
  await reconnectSocket.onOpen();
  assert.equal(reconnectPipeline.getSnapshot().data["1M"].available,true);
  reconnectSocket.onClose({code:1006});
  reconnectSocket.onMessage({data:JSON.stringify({
    e:"kline",s:"BTCUSDT",k:{i:"1m",t:(reconnectStart+104*minute)*1000,T:(reconnectStart+105*minute)*1000-1,o:"40300",h:"40305",l:"40295",c:"40302",v:"10",q:"403020",x:true}
  })});
  assert.equal(reconnectPipeline.getSnapshot().continuity.queuedMessages,1);
  reconnectRows=candles(3,101);
  assert.equal(await reconnectSocket.onOpen(),true);
  const repairedSnapshot=reconnectPipeline.getSnapshot(),repairedRows=repairedSnapshot.privateCandlesByTf["1m"];
  assert.equal(repairedSnapshot.continuity.blocked,false);
  assert.equal(repairedSnapshot.continuity.queuedMessages,0);
  assert.deepEqual(reconnectPipeline.continuityGaps("1m",repairedRows),[]);
  assert.equal(repairedSnapshot.data["1M"].available,true);
  assert.notEqual(repairedSnapshot.data["1M"].reason,"normalization-unavailable");
  assert(repairedSnapshot.continuity.socketEvents.some(event=>event.type==="repair-success"));

  failRepair=true;
  reconnectSocket.onClose({code:1006});
  assert.equal(await reconnectSocket.onOpen(),false);
  const failedRepairSnapshot=reconnectPipeline.getSnapshot();
  assert.equal(failedRepairSnapshot.continuity.blocked,true,"failed REST repair must keep discontinuous WS input quarantined");
  assert(failedRepairSnapshot.continuity.repairFailures>=1);
  assert(reconnectWarnings.some(entry=>entry.message==="SSSC reconnect continuity repair failed"));
  const updatesBeforeBlockedCalculate=reconnectUpdates;
  reconnectPipeline.calculate();
  assert(reconnectUpdates>updatesBeforeBlockedCalculate,"continuity failures must not suppress the regular publish heartbeat");

  console.log("sssc always-on orchestration tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
