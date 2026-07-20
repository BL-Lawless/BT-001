(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config;
  if(!C) throw new Error("SCALP config must load before calculations");
  const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
  const decimalPlaces=value=>{const text=String(value||"");return text.includes(".")?text.split(".")[1].length:0;};
  function roundStep(value,step,mode="nearest"){
    const v=n(value),s=n(step);if(v==null||!(s>0))return v;
    const scale=10**Math.min(12,Math.max(decimalPlaces(step),decimalPlaces(value)));
    const units=v*scale/(s*scale),rounded=mode==="up"?Math.ceil(units-1e-10):mode==="down"?Math.floor(units+1e-10):Math.round(units);
    return Number((rounded*s).toFixed(Math.min(12,decimalPlaces(step))));
  }
  function feeRates(account={}){
    const maker=n(account.makerCommissionRate??account.maker),taker=n(account.takerCommissionRate??account.taker);
    return {maker:maker!=null&&maker>=0?maker:C.fees.fallbackMaker,taker:taker!=null&&taker>=0?taker:C.fees.fallbackTaker,makerFallback:maker==null,takerFallback:taker==null};
  }
  function prices({direction,entryPrice,qty,entryCommission,target,stop,makerRate,takerRate,tickSize}){
    const d=String(direction||"").toUpperCase(),e=n(entryPrice),q=n(qty),ec=n(entryCommission),t=n(target),s=n(stop),mr=n(makerRate),tr=n(takerRate),tick=n(tickSize);
    if(!["LONG","SHORT"].includes(d)||!(e>0)||!(q>0)||!(t>0)||!(s>0)||ec==null||mr==null||tr==null) throw new Error("Invalid outcome inputs");
    const rawTp=d==="LONG"?(t+ec+e*q)/(q*(1-mr)):(e*q-ec-t)/(q*(1+mr));
    const rawSl=d==="LONG"?(e*q+ec-s)/(q*(1-tr)):(s+e*q-ec)/(q*(1+tr));
    const tp=roundStep(rawTp,tick,d==="LONG"?"up":"down"),sl=roundStep(rawSl,tick,d==="LONG"?"up":"down");
    return {tp,sl,tpDelta:Math.abs(tp-e),slDelta:Math.abs(e-sl),tpFee:tp*q*mr,slFee:sl*q*tr,entryCommission:ec,rawTp,rawSl};
  }
  function estimate({direction="LONG",guide,qty,target,stop,rates,filters={}}){
    const q=n(qty),g=n(guide),r=rates||feeRates();if(!(q>0)||!(g>0))return null;
    return prices({direction,entryPrice:g,qty:q,entryCommission:g*q*r.taker,target,stop,makerRate:r.maker,takerRate:r.taker,tickSize:n(filters.tickSize)||0.01});
  }
  function normalizeLot(qty,filters={}){return roundStep(n(qty)||0,n(filters.stepSize)||0.001,"down");}
  function formatNumeric(value,decimals){const number=n(value);return (number==null?0:number).toFixed(decimals);}
  function stepNumeric(value,step,direction,decimals){const current=n(value)||0,next=Math.max(0,roundStep(current+(direction<0?-step:step),step));return formatNumeric(next,decimals);}
  function validateArm({config,filters={},guide,balance,authenticated,streamHealthy,sourceReady,filtersReady=true,position,ownedOrders}){
    const errors=[],q=n(config&&config.lot),target=n(config&&config.target),stop=n(config&&config.stop),price=n(guide),normalized=normalizeLot(q,filters),minQty=n(filters.minQty)||0,maxQty=n(filters.maxQty),minNotional=n(filters.minNotional)||0;
    if(!authenticated)errors.push("Authenticated Binance connection required");if(!streamHealthy)errors.push("Healthy Binance user-data stream required");if(!sourceReady)errors.push("Selected signal source is not ready");if(!filtersReady)errors.push("Current symbol trading filters are unavailable");
    if(!(q>0))errors.push("Lot size must be greater than 0.000");if(Math.abs((q||0)-normalized)>1e-10)errors.push(`Lot must match step size ${filters.stepSize||0.001}`);if(q<minQty)errors.push(`Lot is below minimum quantity ${minQty}`);if(maxQty!=null&&q>maxQty)errors.push(`Lot exceeds maximum quantity ${maxQty}`);
    if(!(target>0))errors.push("Net target must be greater than zero");if(!(stop>0))errors.push("Net stop must be greater than zero");if(price&&q*price<minNotional)errors.push(`Notional is below minimum ${minNotional}`);
    const balanceRow=Array.isArray(balance)?balance.find(row=>n(row&&row.availableBalance)!=null)||balance[0]:balance;
    const available=n(balanceRow&&(balanceRow.availableBalance??balanceRow.available));
    if(available==null)errors.push("Available margin is unavailable");else if(price&&q*price>available*Math.max(1,n(filters.leverage)||1))errors.push("Available margin is insufficient");
    if(position&&Math.abs(n(position.positionAmt??position.qty)||0)>0)errors.push("An open position already exists for this symbol");if(Array.isArray(ownedOrders)&&ownedOrders.length)errors.push("Unresolved SCALP-owned orders exist");
    return {ok:errors.length===0,errors,normalizedLot:normalized};
  }
  function formatOutcome(model){
    const integer=value=>Number.isFinite(Number(value))?Math.round(Number(value)).toLocaleString("en-US"):"-",money=value=>Number.isFinite(Number(value))?`$${Number(value).toFixed(2)}`:"-";
    return {guide:Number.isFinite(Number(model&&model.guide))?Number(model.guide).toLocaleString("en-US",{maximumFractionDigits:2}):"-",tpDelta:integer(model&&model.tpDelta),slDelta:integer(model&&model.slDelta),tpFees:money(model&&model.tpFee),slFees:money(model&&model.slFee)};
  }
  root.calculations=Object.freeze({n,roundStep,feeRates,prices,estimate,normalizeLot,formatNumeric,stepNumeric,validateArm,formatOutcome});
})();
