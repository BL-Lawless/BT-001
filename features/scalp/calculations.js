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
  function linkedSide({direction,entryPrice,qty,entryCommission,target,stop,tpDelta,slDelta,tpDriver,slDriver,makerRate,takerRate,tickSize}){
    const d=String(direction||"").toUpperCase(),e=n(entryPrice),q=n(qty),ec=n(entryCommission),t=n(target),s=n(stop),td=n(tpDelta),sd=n(slDelta),mr=n(makerRate),tr=n(takerRate),tick=n(tickSize)||.01;
    if(!["LONG","SHORT"].includes(d)||!(e>0)||!(q>0)||ec==null||mr==null||tr==null)throw new Error("Invalid linked outcome inputs");
    let tp,tpNet,tpMove,tpFee;if(tpDriver==="TP_DELTA"){
      if(td==null||td<0)throw new Error("Invalid TP delta");tp=roundStep(d==="LONG"?e+td:e-td,tick,d==="LONG"?"up":"down");if(!(tp>0))throw new Error("Invalid TP price");tpMove=Math.abs(tp-e);tpFee=tp*q*mr;tpNet=d==="LONG"?(tp-e)*q-ec-tpFee:(e-tp)*q-ec-tpFee;
    }else{
      if(!(t>0))throw new Error("Invalid net target");const raw=d==="LONG"?(t+ec+e*q)/(q*(1-mr)):(e*q-ec-t)/(q*(1+mr));tp=roundStep(raw,tick,d==="LONG"?"up":"down");if(!(tp>0))throw new Error("Invalid TP price");tpMove=Math.abs(tp-e);tpFee=tp*q*mr;tpNet=t;
    }
    let sl,slNet,slMove,slFee;if(slDriver==="SL_DELTA"){
      if(sd==null||sd<0)throw new Error("Invalid SL delta");sl=roundStep(d==="LONG"?e-sd:e+sd,tick,d==="LONG"?"up":"down");if(!(sl>0))throw new Error("Invalid SL price");slMove=Math.abs(e-sl);slFee=sl*q*tr;slNet=d==="LONG"?(e-sl)*q+ec+slFee:(sl-e)*q+ec+slFee;
    }else{
      if(!(s>0))throw new Error("Invalid net SL");const raw=d==="LONG"?(e*q+ec-s)/(q*(1-tr)):(s+e*q-ec)/(q*(1+tr));sl=roundStep(raw,tick,d==="LONG"?"up":"down");if(!(sl>0))throw new Error("Invalid SL price");slMove=Math.abs(e-sl);slFee=sl*q*tr;slNet=s;
    }
    return {direction:d,entryPrice:e,qty:q,tp,sl,target:Math.max(0,tpNet),stop:Math.max(0,slNet),tpDelta:tpMove,slDelta:slMove,tpFee,slFee,entryFee:ec,entryCommission:ec};
  }
  function linkedPreview({direction,guide,qty,target,stop,tpDelta,slDelta,tpDriver="NET_TARGET",slDriver="NET_SL",rates,filters={},entryPrice,entryCommission}){
    const r=rates||feeRates(),e=n(entryPrice)||n(guide),q=n(qty),ec=n(entryCommission)??(e>0&&q>0?e*q*r.taker:null),known=String(direction||"").toUpperCase(),args={entryPrice:e,qty:q,entryCommission:ec,target,stop,tpDelta,slDelta,tpDriver,slDriver,makerRate:r.maker,takerRate:r.taker,tickSize:n(filters.tickSize)||.01};
    if(!(e>0))return {available:false,reason:"WAITING FOR MARKET DATA"};if(!(q>0))return {available:false,reason:"ENTER TRADE VALUES"};
    try{
      if(["LONG","SHORT"].includes(known))return {...linkedSide({...args,direction:known}),available:true,conservative:false};
      const long=linkedSide({...args,direction:"LONG"}),short=linkedSide({...args,direction:"SHORT"});
      return {available:true,direction:"ANY",conservative:true,entryPrice:e,qty:q,target:tpDriver==="TP_DELTA"?Math.min(long.target,short.target):n(target),stop:slDriver==="SL_DELTA"?Math.max(long.stop,short.stop):n(stop),tpDelta:Math.max(long.tpDelta,short.tpDelta),slDelta:Math.min(long.slDelta,short.slDelta),tpFee:Math.max(long.tpFee,short.tpFee),slFee:Math.max(long.slFee,short.slFee),entryFee:Math.max(long.entryFee,short.entryFee)};
    }catch(_e){return {available:false,reason:"OUTCOME UNAVAILABLE"};}
  }
  function preview({direction,guide,qty,target,stop,rates,filters={}}){
    return linkedPreview({direction,guide,qty,target,stop,tpDriver:"NET_TARGET",slDriver:"NET_SL",rates,filters});
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
    const valid=value=>value!==null&&value!==""&&Number.isFinite(Number(value)),integer=value=>valid(value)?Math.round(Number(value)).toLocaleString("en-US"):"-",money=value=>valid(value)?`$${Number(value).toFixed(2)}`:"-";
    return {guide:valid(model&&model.guide)?Number(model.guide).toLocaleString("en-US",{maximumFractionDigits:2}):"-",tpDelta:integer(model&&model.tpDelta),slDelta:integer(model&&model.slDelta),tpFees:money(model&&model.tpFee),slFees:money(model&&model.slFee)};
  }
  root.calculations=Object.freeze({n,roundStep,feeRates,prices,estimate,linkedSide,linkedPreview,preview,normalizeLot,formatNumeric,stepNumeric,validateArm,formatOutcome});
})();
