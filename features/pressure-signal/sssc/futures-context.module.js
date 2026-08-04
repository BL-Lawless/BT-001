(() => {
  "use strict";
  const BASE="https://fapi.binance.com";
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  async function responseJson(response,label){if(!response||!response.ok)throw new Error(`${label} request failed${response?` (HTTP ${response.status})`:""}`);return response.json();}
  async function fetchCurrent(symbol,fetchFn=window.fetch){
    const selected=String(symbol||"").trim().toUpperCase();if(!selected)throw new Error("A Binance Futures symbol is required");
    const query=`symbol=${encodeURIComponent(selected)}`;
    const [premium,interest]=await Promise.all([
      fetchFn(`${BASE}/fapi/v1/premiumIndex?${query}`,{cache:"no-store"}).then(response=>responseJson(response,"Funding rate")),
      fetchFn(`${BASE}/fapi/v1/openInterest?${query}`,{cache:"no-store"}).then(response=>responseJson(response,"Open interest"))
    ]);
    const fundingRate=number(premium&&premium.lastFundingRate),openInterest=number(interest&&interest.openInterest);
    if(fundingRate==null)throw new Error("Invalid Binance premium index response");
    if(openInterest==null)throw new Error("Invalid Binance open interest response");
    return {symbol:selected,funding_rate:fundingRate,open_interest:openInterest,event_at:new Date().toISOString()};
  }
  function displayText(context,now=Date.now(),formatDateTime=window.formatDateTime){
    if(!context)return "Funding rate: — · Open interest: — · As of —";
    const eventMs=Date.parse(context.event_at),age=Number.isFinite(eventMs)?Math.max(0,Math.round((Number(now)-eventMs)/1000)):null;
    const ageText=age==null?"unknown":age<60?`${age}s ago`:age<3600?`${Math.floor(age/60)}m ago`:`${Math.floor(age/3600)}h ago`;
    const asOf=Number.isFinite(eventMs)&&typeof formatDateTime==="function"?formatDateTime(eventMs):context.event_at;
    const funding=number(context.funding_rate),interest=number(context.open_interest);
    return `Funding rate: ${funding==null?"—":funding.toFixed(8)} · Open interest: ${interest==null?"—":interest.toLocaleString("en-US",{maximumFractionDigits:3})} · As of ${asOf} (${ageText})`;
  }
  window.BT001SsscFuturesContext=Object.freeze({BASE,fetchCurrent,displayText});
})();
