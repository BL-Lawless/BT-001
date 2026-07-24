"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

async function run(){
  const calls={load:0,recalculate:0};
  let cache={events:[{}],candles:[{},{}],simulation:{eventsShown:1,trades:[]}};
  const simulatorData={
    getCache:()=>cache,
    async loadData(config){calls.load+=1;calls.loadConfig=config;cache={events:[{},{}],candles:[{},{},{}],simulation:{eventsShown:2,trades:[]}};return cache;},
    recalculate(config){calls.recalculate+=1;calls.recalculateConfig=config;cache={...cache,simulation:{eventsShown:3,trades:[]}};return cache.simulation;}
  };
  let listener=null;
  const context={
    console,
    __BT001_SCALP_BUILD__:{
      config:{sources:["1m","3m","5m","15m"]},
      calculations:{formatNumeric:(value,decimals)=>Number(value||0).toFixed(decimals)},
      simulatorData
    },
    BT001_SCALP:{snapshot:()=>({config:{lot:".010",stop:"5",target:"10"},filters:{tickSize:.1},rates:{maker:.0002}})},
    addEventListener(type,handler){if(type==="message")listener=handler;}
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"simulator-message-bridge.js"),"utf8"),context,{filename:"simulator-message-bridge.js"});
  assert(listener,"main-window bridge must install a message listener");
  const bridge=context.__BT001_SCALP_SIMULATOR_BRIDGE__;
  const responses=[];
  const source={postMessage(message,targetOrigin){responses.push({message,targetOrigin});}};
  bridge.registerPopup(source);
  const send=async(action,payload={})=>{
    responses.length=0;
    await bridge.onMessage({source,data:{channel:bridge.channel,kind:"request",requestId:`request-${action}`,action,payload}});
    assert.equal(responses.length,1);
    assert.equal(responses[0].targetOrigin,"*","file:// communication must use a wildcard target origin");
    return responses[0].message;
  };

  const connected=await send("CONNECT");
  assert.equal(connected.ok,true);
  assert.equal(connected.result.cache.eventCount,1);
  assert.equal(connected.result.cache.candleCount,2);
  assert.equal(connected.result.snapshot.formatted.lot,"0.010");

  const loaded=await send("LOAD_DATA",{config:{lot:.02,filters:{stale:true},rates:{stale:true}}});
  assert.equal(loaded.ok,true);
  assert.equal(calls.load,1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.loadConfig.filters)),{tickSize:.1},"main bridge must inject current filters instead of trusting stale popup state");
  assert.equal(loaded.result.cache.eventCount,2);

  const recalculated=await send("RECALCULATE",{config:{minimumRank:80}});
  assert.equal(recalculated.ok,true);
  assert.equal(calls.recalculate,1);
  assert.equal(recalculated.result.cache.simulation.eventsShown,3);

  const ping=await send("PING");
  assert.deepEqual(JSON.parse(JSON.stringify(ping.result)),{alive:true});

  context.BT001_SCALP=null;
  const missing=await send("CONNECT");
  assert.equal(missing.ok,false);
  assert.equal(missing.error.code,"EXPORTS_MISSING");
  assert(missing.error.message.includes("BT001_SCALP.snapshot"));

  console.log("SCALP simulator message bridge tests: PASS");
}

run().catch(error=>{console.error(error);process.exitCode=1;});
