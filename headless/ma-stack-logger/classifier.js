"use strict";

const core=require("../../features/ma-stack/ma-stack-core.js");

const RESULT_KEYS=Object.freeze({"1m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","4h":"4H","1d":"1D"});

function slotsFor(periods){
  return periods.map((period,index)=>Object.freeze({slot:index+1,slotId:`MA${index+1}`,period:Number(period)}));
}

function classifyAll(feed,config,at=Date.now()){
  const slots=slotsFor(config.maPeriods),liveSet=new Set(config.liveTimeframes),results={},metadata={};
  for(const timeframe of config.timeframes){
    const candle=feed.candleState(timeframe),includeForming=liveSet.has(timeframe)&&candle.provisional===true;
    const rows=feed.getRows(timeframe,includeForming),key=RESULT_KEYS[timeframe];
    results[key]=core.classify(rows,{
      tfKey:key,tfInterval:timeframe,includeForming,sourceType:"MA_STACK_VM_BINANCE",sourcePath:`ma-stack-market-feed:${timeframe}`,sourceIndex:Math.max(0,rows.length-1)
    },{slots});
    metadata[key]={timeframe,candle,includeForming,rowCount:rows.length};
  }
  core.applyHigherTfAgreement(results);
  return {eventAt:new Date(at).toISOString(),results,metadata,slots};
}

module.exports={RESULT_KEYS,slotsFor,classifyAll};
