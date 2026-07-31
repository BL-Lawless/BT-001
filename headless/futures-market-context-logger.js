"use strict";

const CONTEXT_INTERVAL_MS=30000;
const TABLE="futures_market_snapshots";

function createFuturesMarketContextLogger(options={}){
  const dataSource=options.dataSource,supabase=options.supabase,symbol=String(options.symbol||"").trim();
  const now=typeof options.now==="function"?options.now:Date.now,warn=options.warn||console.warn;
  const setIntervalFn=options.setIntervalFn||setInterval,clearIntervalFn=options.clearIntervalFn||clearInterval;
  const intervalMs=Math.max(1,Number(options.intervalMs)||CONTEXT_INTERVAL_MS);
  let timer=null,pending=null;
  async function capture(){
    if(pending)return pending;
    if(!symbol||!dataSource||typeof dataSource.fetchCurrentFundingRate!=="function"||typeof dataSource.fetchCurrentOpenInterest!=="function"||!supabase||typeof supabase.log!=="function")return false;
    pending=(async()=>{
      const [funding,interest]=await Promise.all([
        dataSource.fetchCurrentFundingRate(symbol),
        dataSource.fetchCurrentOpenInterest(symbol)
      ]);
      const machineId=typeof supabase.getDeviceId==="function"?String(supabase.getDeviceId()||"").trim():"";
      if(!machineId)throw new Error("machine_id is required for futures market context logging");
      return supabase.log(TABLE,{
        event_at:new Date(now()).toISOString(),machine_id:machineId,symbol,
        funding_rate:funding.fundingRate,open_interest:interest.openInterest
      });
    })();
    try{return await pending;}finally{pending=null;}
  }
  async function start(){
    if(timer!=null)return false;
    await capture().catch(error=>warn("[Headless Futures Context] Initial write failed",error));
    timer=setIntervalFn(()=>capture().catch(error=>warn("[Headless Futures Context] Write failed",error)),intervalMs);
    return true;
  }
  function stop(){if(timer!=null)clearIntervalFn(timer);timer=null;}
  return Object.freeze({start,stop,capture,status:()=>Object.freeze({started:timer!=null,intervalMs,table:TABLE})});
}

module.exports={CONTEXT_INTERVAL_MS,TABLE,createFuturesMarketContextLogger};
