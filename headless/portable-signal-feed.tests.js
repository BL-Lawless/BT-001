"use strict";

const assert=require("assert");
const {createPressureSignalDataFeed}=require("../features/pressure-signal/data-feed.js");

function rawRows(lastOpen,count,stepMs){
  return Array.from({length:count},(_,index)=>{
    const openTime=lastOpen-(count-1-index)*stepMs,close=40000+index;
    return [openTime,String(close-1),String(close+2),String(close-2),String(close),"10",openTime+stepMs-1,String(close*10),20,"6",String(close*6),"0"];
  });
}

async function run(){
  const stepMs=300000,boundary=1900000200000-Math.floor(1900000200000%stepMs);
  let now=boundary+20000,dataset=rawRows(boundary,597,stepMs),restRequests=0,socketHandlers=null,boundaryCallback=null;
  const api={
    async requestJson(url){
      restRequests+=1;const parsed=new URL(url),end=Number(parsed.searchParams.get("endTime")),limit=Number(parsed.searchParams.get("limit"));
      return dataset.filter(row=>Number(row[0])<=end).slice(-limit);
    },
    connectWebSocket(_url,handlers){socketHandlers=handlers;return {disconnect(){}};}
  };
  const timers={setTimeout:()=>1,clearTimeout:()=>{},setInterval:callback=>{boundaryCallback=callback;return 2;},clearInterval:()=>{boundaryCallback=null;}};
  const updates=[],feed=createPressureSignalDataFeed({api,timers,now:()=>now,getRestUrl:()=>"https://fapi.binance.com/fapi/v1/klines",
    getWsUrl:()=>"wss://fstream.binance.com/market/stream",boundaryGuard:true,boundaryGraceMs:15000,boundaryCheckIntervalMs:5000,onUpdate:event=>updates.push(event)});
  await feed.configure({symbol:"BTCUSDT",timeframes:["5m"],reason:"portable-test"});socketHandlers.onOpen();
  assert.equal(feed.getClosedBuffer("5m").at(-1).time,(boundary-stepMs)/1000);assert(feed.getFormingCandle("5m"));assert.equal(typeof boundaryCallback,"function");

  now=boundary+stepMs+20000;dataset=rawRows(boundary+stepMs,597,stepMs);
  const repairs=feed._checkClosedCandleBoundaries();assert.equal(repairs.length,1);assert.equal(repairs[0].tf,"5m");
  while(feed.diagnostics().inFlightRestCount)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(feed.getClosedBuffer("5m").at(-1).time,boundary/1000,"boundary repair must REST-promote the missed close");
  assert.equal(feed.diagnostics().counters.boundaryRepairs,1);assert(updates.some(event=>event.reason==="boundary-repair-start"));
  assert(restRequests>=2,"initial hydration and boundary recovery must both use raw REST requests");
  feed.destroy();assert.equal(feed.diagnostics().boundaryTimerCount,0);

  console.log("Portable Signal candle feed tests: PASS");
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
