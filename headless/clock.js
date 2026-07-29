"use strict";

const {createExchangeClock}=require("../features/api/exchange-clock.module.js");

function createNodeExchangeClock(options={}){
  const fetchFn=options.fetch||globalThis.fetch;
  if(typeof fetchFn!=="function")throw new Error("A Fetch-compatible function is required for Binance clock synchronization");
  const baseUrl=String(options.baseUrl||"https://fapi.binance.com").replace(/\/+$/,"");
  return createExchangeClock({
    ...options,
    fetchServerTime:options.fetchServerTime||(async()=>{
      const response=await fetchFn(`${baseUrl}/fapi/v1/time`,{headers:{"Cache-Control":"no-cache"}});
      if(!response.ok)throw new Error(`Binance time HTTP ${response.status}`);
      const data=await response.json();
      return Number(data&&data.serverTime);
    })
  });
}

module.exports={createNodeExchangeClock};
