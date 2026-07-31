"use strict";
const assert=require("assert");
const {CONTEXT_INTERVAL_MS,TABLE,createFuturesMarketContextLogger}=require("./futures-market-context-logger.js");

async function run(){
  const writes=[],requests=[],scheduled=[];
  const dataSource={
    fetchCurrentFundingRate:async symbol=>{requests.push(["funding",symbol]);return {symbol,fundingRate:.0001,time:1000};},
    fetchCurrentOpenInterest:async symbol=>{requests.push(["open-interest",symbol]);return {symbol,openInterest:12345.67,time:1001};}
  };
  const logger=createFuturesMarketContextLogger({
    dataSource,symbol:"BTCUSDT",now:()=>2000,
    supabase:{getDeviceId:()=>"vm-test",log:async(table,row)=>{writes.push({table,row});return true;}},
    setIntervalFn:(fn,ms)=>{scheduled.push({fn,ms});return 1;},clearIntervalFn:()=>{}
  });
  await logger.start();
  assert.deepEqual(requests,[["funding","BTCUSDT"],["open-interest","BTCUSDT"]]);
  assert.equal(writes.length,1);assert.equal(writes[0].table,TABLE);
  assert.deepEqual(writes[0].row,{event_at:new Date(2000).toISOString(),machine_id:"vm-test",symbol:"BTCUSDT",funding_rate:.0001,open_interest:12345.67});
  assert.equal(scheduled[0].ms,CONTEXT_INTERVAL_MS);
  await scheduled[0].fn();assert.equal(writes.length,2);
  logger.stop();
  console.log("Futures market context logger tests: PASS");
}
module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
