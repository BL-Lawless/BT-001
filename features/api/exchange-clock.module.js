(() => {
  "use strict";

  const CACHE_MS=5*60*1000,MAX_RETRY_MS=15000;
  function createExchangeClock(options={}){
    const localNow=options.localNow||Date.now;
    const delay=options.delay||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    const onStatus=typeof options.onStatus==="function"?options.onStatus:()=>{};
    const fetchServerTime=options.fetchServerTime||(async()=>{
      const rest=typeof window!=="undefined"&&window.restService;
      if(!rest||typeof rest.get!=="function")throw new Error("REST service unavailable");
      const data=await rest.get("https://fapi.binance.com/fapi/v1/time");
      return Number(data&&data.serverTime);
    });
    let cachedOffset=0,lastAttemptAt=0,lastSuccessAt=null,lastSyncOk=false,inFlight=null;
    let consecutiveFailures=0,lastError=null;

    function isReliable(){return lastSuccessAt!=null&&localNow()-lastSuccessAt<CACHE_MS;}
    function status(){return Object.freeze({offsetMs:cachedOffset,lastAttemptAt,lastSuccessAt,lastSyncOk,reliable:isReliable(),consecutiveFailures,lastError});}
    function publish(){try{onStatus(status());}catch(_error){}}

    async function sync(force=false){
      const local=localNow();
      if(!force&&isReliable())return cachedOffset;
      const retryMs=Math.min(MAX_RETRY_MS,500*Math.pow(2,Math.min(consecutiveFailures,5)));
      if(!force&&lastAttemptAt&&local-lastAttemptAt<retryMs)return cachedOffset;
      if(inFlight)return inFlight;
      lastAttemptAt=local;
      inFlight=(async()=>{
        try{
          const before=localNow(),serverTime=Number(await fetchServerTime()),after=localNow();
          // Binance's serverTime is sampled before the response reaches us. Using the response
          // arrival time is intentionally conservative; midpoint correction can put signed
          // timestamps ahead of Binance by half the network round-trip.
          if(Number.isFinite(serverTime)){
            cachedOffset=serverTime-after;
            lastSuccessAt=after;
            lastSyncOk=true;
            consecutiveFailures=0;
            lastError=null;
          }else{
            lastSyncOk=false;
            consecutiveFailures+=1;
            lastError="Binance returned an invalid server time";
          }
        }catch(error){
          // Logging and signed requests retain a usable local clock when Binance time is unavailable.
          lastSyncOk=false;
          consecutiveFailures+=1;
          lastError=error&&error.message||String(error);
        }finally{inFlight=null;publish();}
        return cachedOffset;
      })();
      return inFlight;
    }
    async function ensureSynchronized({attempts=3,baseDelayMs=250}={}){
      const total=Math.max(1,Number(attempts)||1);
      for(let attempt=0;attempt<total;attempt++){
        await sync(attempt>0);
        if(isReliable())return cachedOffset;
        if(attempt+1<total)await delay(Math.min(MAX_RETRY_MS,baseDelayMs*Math.pow(2,attempt)));
      }
      throw new Error(`Binance exchange clock synchronization failed after ${total} attempt(s)${lastError?`: ${lastError}`:""}`);
    }
    function now(){return localNow()+cachedOffset;}
    function fromLocal(localMs){return Number(localMs)+cachedOffset;}
    function offset(){return cachedOffset;}
    return Object.freeze({now,fromLocal,offset,sync,ensureSynchronized,isReliable,status,CACHE_MS});
  }

  const api={createExchangeClock};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined"){
    let retryTimer=null;
    function renderStatus(state){
      const element=document.getElementById("exchangeClockStatus");
      if(element){
        element.hidden=!!state.reliable;
        element.textContent=state.reliable?"":`BINANCE CLOCK OFFLINE · signed account refresh paused${state.lastError?` · ${state.lastError}`:""}`;
      }
      try{window.dispatchEvent(new CustomEvent("bt001:exchange-clock-status",{detail:state}));}catch(_error){}
    }
    window.BT001ExchangeClock=createExchangeClock({onStatus:renderStatus});
    const maintain=async()=>{
      if(retryTimer!=null){clearTimeout(retryTimer);retryTimer=null;}
      try{
        await window.BT001ExchangeClock.ensureSynchronized({attempts:4,baseDelayMs:300});
        retryTimer=setTimeout(maintain,CACHE_MS);
      }catch(_error){
        renderStatus(window.BT001ExchangeClock.status());
        retryTimer=setTimeout(maintain,MAX_RETRY_MS);
      }
    };
    maintain();
  }
})();
