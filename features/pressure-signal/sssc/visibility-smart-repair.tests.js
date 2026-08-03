"use strict";

const assert=require("assert");
const {createOrchestration}=require("./orchestration.js");

(async()=>{
  const step=60,base=1999999980;
  let activeIndex=100,connects=0,disconnects=0,socketOptions=null,failNextTargeted=false;
  const fetches=[];
  const rowsEndingAt=(endIndex,count)=>Array.from({length:count},(_,offset)=>{
    const index=endIndex-count+1+offset,time=base+index*step,close=50000+index;
    return {time,openTime:time*1000,closeTime:(time+step)*1000-1,open:close-1,high:close+2,low:close-2,close,volume:10,baseVolume:10,quoteVolume:close*10};
  });
  const pipeline=createOrchestration({
    tfs:[["1M","1m"]],liveTfs:["1m"],
    getSlots:()=>[5,10,20,7,8].map((period,index)=>({slotId:`MA${index+1}`,period})),
    getCalculation:()=>({calculateTimeframe:input=>({tf:input.label,interval:input.interval,available:false}),deriveEarlyWarning:()=>null}),
    getSymbol:()=>"BTCUSDT",now:()=>((base+activeIndex*step)*1000+30000),visibilityRepairMaxCandles:100,
    fetchKlines:async (tf,_cursor,limit)=>{
      fetches.push({tf,limit,activeIndex});
      if(limit<101&&failNextTargeted){failNextTargeted=false;throw new Error("targeted REST failed");}
      return rowsEndingAt(activeIndex,limit);
    },
    connectWebSocket:(_url,options)=>{connects+=1;socketOptions=options;return {disconnect(){disconnects+=1;}};},
    getWsUrl:()=>"wss://example/ws",setIntervalFn:()=>1,clearIntervalFn:()=>{},setTimeoutFn:()=>1,clearTimeoutFn:()=>{}
  });

  assert.equal(await pipeline.refresh(),true);
  await socketOptions.onOpen();
  assert.equal(connects,1);
  fetches.length=0;

  activeIndex=103;
  const small=await pipeline.repairVisibility("test-small-gap");
  assert.equal(small.mode,"targeted","a small gap must use targeted repair");
  assert.equal(small.totalMissing,3);
  assert.deepEqual(fetches.map(item=>item.limit),[5],"targeted repair must fetch missing closes plus a small forming-candle margin");
  assert.equal(pipeline.getSnapshot().privateFormingByTf["1m"].time,base+activeIndex*step,"the current forming candle must be refreshed");
  assert.equal(connects,1,"a healthy socket must not be rebuilt for targeted visibility repair");
  assert.equal(disconnects,0);

  fetches.length=0;activeIndex=104;failNextTargeted=true;
  const failed=await pipeline.repairVisibility("test-failed-targeted-repair");
  assert.equal(failed.mode,"full-fallback","a targeted repair failure must fall back to a full atomic reload");
  assert.equal(failed.ok,true);
  assert.equal(failed.blocked,false,"a successful fallback must clear continuity.blocked");
  assert(fetches.some(item=>item.limit<101)&&fetches.some(item=>item.limit===101),"failed targeted and fallback full requests must both be observable");
  assert.equal(connects,1,"a repair failure alone must not reconnect a socket that remained healthy");

  fetches.length=0;activeIndex=250;
  const large=await pipeline.repairVisibility("test-large-gap");
  assert.equal(large.mode,"full-fallback");
  assert.equal(large.fallbackReason,"gap-threshold-exceeded");
  assert.deepEqual(fetches.map(item=>item.limit),[101],"an oversized gap must bypass targeted reads and use the full window once");
  assert.equal(connects,1,"even a full data fallback must preserve a demonstrably healthy socket");

  socketOptions.onClose({code:1006});
  activeIndex=251;fetches.length=0;
  const unhealthy=await pipeline.repairVisibility("test-unhealthy-socket");
  assert.equal(unhealthy.mode,"full-fallback");
  assert.equal(unhealthy.fallbackReason,"socket-unhealthy");
  assert.equal(unhealthy.reconnected,true);
  assert.equal(connects,2,"an unhealthy socket must be rebuilt");
  assert.equal(disconnects,1);

  console.log("SSSC visibility smart repair tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
