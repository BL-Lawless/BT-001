(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config;
  if(!C) throw new Error("SCALP config must load before calculations");
  const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
  const upper=value=>String(value||"").toUpperCase();
  function quoteAsset(symbol){const value=upper(symbol);return ["USDT","USDC","FDUSD","BUSD"].find(asset=>value.endsWith(asset))||null;}
  const decimalPlaces=value=>{const text=String(value||"");return text.includes(".")?text.split(".")[1].length:0;};
  function roundStep(value,step,mode="nearest"){
    const v=n(value),s=n(step);if(v==null||!(s>0))return v;
    const scale=10**Math.min(12,Math.max(decimalPlaces(step),decimalPlaces(value)));
    const units=v*scale/(s*scale),rounded=mode==="up"?Math.ceil(units-1e-10):mode==="down"?Math.floor(units+1e-10):Math.round(units);
    return Number((rounded*s).toFixed(Math.min(12,decimalPlaces(step))));
  }
  function feeRates(account={}){
    const maker=n(account.makerCommissionRate??account.maker),taker=n(account.takerCommissionRate??account.taker);
    const resolvedMaker=maker!=null&&maker>=0?maker:C.fees.fallbackMaker,resolvedTaker=taker!=null&&taker>=0?taker:C.fees.fallbackTaker;
    const makerFallback=maker==null||maker<0,takerFallback=taker==null||taker<0;
    return {maker:resolvedMaker,taker:resolvedTaker,conservativeTp:Math.max(resolvedMaker,resolvedTaker),makerFallback,takerFallback,source:makerFallback||takerFallback?"fallback":"account-commission-rate"};
  }
  function prices({direction,entryPrice,qty,entryCommission,target,stop,makerRate,takerRate,conservativeTpRate,fundingCost=0,tickSize}){
    const d=String(direction||"").toUpperCase(),e=n(entryPrice),q=n(qty),ec=n(entryCommission),t=n(target),s=n(stop),mr=n(makerRate),tr=n(takerRate),rtp=Math.max(n(conservativeTpRate)||0,mr||0,tr||0),funding=n(fundingCost),tick=n(tickSize);
    if(!["LONG","SHORT"].includes(d)||!(e>0)||!(q>0)||!(t>0)||!(s>0)||ec==null||mr==null||tr==null) throw new Error("Invalid outcome inputs");
    if(funding==null)throw new Error("Invalid funding input");
    const rawTp=d==="LONG"?(e*q+t+ec+funding)/(q*(1-rtp)):(e*q-t-ec-funding)/(q*(1+rtp));
    const rawSl=d==="LONG"?(e*q+ec+funding-s)/(q*(1-tr)):(e*q+s-ec-funding)/(q*(1+tr));
    const tp=roundStep(rawTp,tick,d==="LONG"?"up":"down"),sl=roundStep(rawSl,tick,d==="LONG"?"up":"down");
    return {tp,sl,tpDelta:Math.abs(tp-e),slDelta:Math.abs(e-sl),tpFee:tp*q*rtp,slFee:sl*q*tr,entryCommission:ec,fundingCost:funding,rawTp,rawSl,diagnostics:{entryRate:tr,tpRate:rtp,slRate:tr,tpRateAssumption:"conservative-max-maker-taker",slFillAssumption:"trigger-price-estimate; execution slippage unavailable",fundingStatus:funding===0?"explicit-zero/no-known-settlement":"provided-known-cost",entrySlippageStatus:"actual-average-fill-after-entry"}};
  }
  function estimate({direction="LONG",guide,qty,target,stop,rates,filters={}}){
    const q=n(qty),g=n(guide),r=rates||feeRates();if(!(q>0)||!(g>0))return null;
    return prices({direction,entryPrice:g,qty:q,entryCommission:g*q*r.taker,target,stop,makerRate:r.maker,takerRate:r.taker,conservativeTpRate:r.conservativeTp,fundingCost:0,tickSize:n(filters.tickSize)||0.01});
  }
  function linkedSide({direction,entryPrice,qty,entryCommission,target,stop,tpDelta,slDelta,tpDriver,slDriver,makerRate,takerRate,conservativeTpRate,fundingCost=0,tickSize}){
    const d=String(direction||"").toUpperCase(),e=n(entryPrice),q=n(qty),ec=n(entryCommission),t=n(target),s=n(stop),td=n(tpDelta),sd=n(slDelta),mr=n(makerRate),tr=n(takerRate),rtp=Math.max(n(conservativeTpRate)||0,mr||0,tr||0),funding=n(fundingCost),tick=n(tickSize)||.01;
    if(!["LONG","SHORT"].includes(d)||!(e>0)||!(q>0)||ec==null||mr==null||tr==null)throw new Error("Invalid linked outcome inputs");
    let tp,tpNet,tpMove,tpFee;if(tpDriver==="TP_DELTA"){
      if(td==null||td<0)throw new Error("Invalid TP delta");tp=roundStep(d==="LONG"?e+td:e-td,tick,d==="LONG"?"up":"down");if(!(tp>0))throw new Error("Invalid TP price");tpMove=Math.abs(tp-e);tpFee=tp*q*rtp;tpNet=d==="LONG"?(tp-e)*q-ec-funding-tpFee:(e-tp)*q-ec-funding-tpFee;
    }else{
      if(!(t>0))throw new Error("Invalid net target");const raw=d==="LONG"?(e*q+t+ec+funding)/(q*(1-rtp)):(e*q-t-ec-funding)/(q*(1+rtp));tp=roundStep(raw,tick,d==="LONG"?"up":"down");if(!(tp>0))throw new Error("Invalid TP price");tpMove=Math.abs(tp-e);tpFee=tp*q*rtp;tpNet=d==="LONG"?(tp-e)*q-ec-funding-tpFee:(e-tp)*q-ec-funding-tpFee;
    }
    let sl,slNet,slMove,slFee;if(slDriver==="SL_DELTA"){
      if(sd==null||sd<0)throw new Error("Invalid SL delta");sl=roundStep(d==="LONG"?e-sd:e+sd,tick,d==="LONG"?"up":"down");if(!(sl>0))throw new Error("Invalid SL price");slMove=Math.abs(e-sl);slFee=sl*q*tr;slNet=d==="LONG"?(e-sl)*q+ec+funding+slFee:(sl-e)*q+ec+funding+slFee;
    }else{
      if(!(s>0))throw new Error("Invalid net SL");const raw=d==="LONG"?(e*q+ec+funding-s)/(q*(1-tr)):(e*q+s-ec-funding)/(q*(1+tr));sl=roundStep(raw,tick,d==="LONG"?"up":"down");if(!(sl>0))throw new Error("Invalid SL price");slMove=Math.abs(e-sl);slFee=sl*q*tr;slNet=d==="LONG"?(e-sl)*q+ec+funding+slFee:(sl-e)*q+ec+funding+slFee;
    }
    return {direction:d,entryPrice:e,qty:q,tp,sl,target:Math.max(0,tpNet),stop:Math.max(0,slNet),tpDelta:tpMove,slDelta:slMove,tpFee,slFee,entryFee:ec,entryCommission:ec,fundingCost:funding,diagnostics:{entryRate:tr,tpRate:rtp,slRate:tr,tpRateAssumption:"conservative-max-maker-taker",slFillAssumption:"trigger-price-estimate; execution slippage unavailable",fundingStatus:funding===0?"explicit-zero/no-known-settlement":"provided-known-cost",entrySlippageStatus:"actual-average-fill-after-entry"}};
  }
  function linkedPreview({direction,guide,qty,target,stop,tpDelta,slDelta,tpDriver="NET_TARGET",slDriver="NET_SL",rates,filters={},entryPrice,entryCommission,fundingCost=0}){
    const r=rates||feeRates(),e=n(entryPrice)||n(guide),q=n(qty),ec=n(entryCommission)??(e>0&&q>0?e*q*r.taker:null),known=String(direction||"").toUpperCase(),args={entryPrice:e,qty:q,entryCommission:ec,target,stop,tpDelta,slDelta,tpDriver,slDriver,makerRate:r.maker,takerRate:r.taker,conservativeTpRate:n(r.conservativeTp)??Math.max(r.maker,r.taker),fundingCost,tickSize:n(filters.tickSize)||.01};
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
  function validateArm({config,filters={},guide,balance,symbol,authenticated,streamHealthy,sourceReady,filtersReady=true,position,ownedOrders}){
    const errors=[],q=n(config&&config.lot),target=n(config&&config.target),stop=n(config&&config.stop),price=n(guide),normalized=normalizeLot(q,filters),minQty=n(filters.minQty)||0,maxQty=n(filters.maxQty),minNotional=n(filters.minNotional)||0;
    if(!authenticated)errors.push("Authenticated Binance connection required");if(!streamHealthy)errors.push("Healthy Binance user-data stream required");if(!sourceReady)errors.push("Selected signal source is not ready");if(!filtersReady)errors.push("Current symbol trading filters are unavailable");
    if(!(q>0))errors.push("Lot size must be greater than 0.000");if(Math.abs((q||0)-normalized)>1e-10)errors.push(`Lot must match step size ${filters.stepSize||0.001}`);if(q<minQty)errors.push(`Lot is below minimum quantity ${minQty}`);if(maxQty!=null&&q>maxQty)errors.push(`Lot exceeds maximum quantity ${maxQty}`);
    if(!(target>0))errors.push("Net target must be greater than zero");if(!(stop>0))errors.push("Net stop must be greater than zero");if(price&&q*price<minNotional)errors.push(`Notional is below minimum ${minNotional}`);
    const requiredAsset=quoteAsset(symbol),balanceRows=Array.isArray(balance)?balance:(balance?[balance]:[]);
    const balanceRow=requiredAsset?balanceRows.find(row=>upper(row&&row.asset)===requiredAsset):null;
    const available=n(balanceRow&&(balanceRow.availableBalance??balanceRow.available));
    const leverage=Math.max(1,n(filters.leverage)||1),requiredMargin=price&&q>0?(price*q)/leverage:null;
    if(available==null)errors.push("Available margin is unavailable");
    else if(requiredMargin!=null&&requiredMargin>available)errors.push(`Available margin is insufficient: requires $${requiredMargin.toFixed(2)} at ${leverage}x leverage, have $${available.toFixed(2)} (short $${(requiredMargin-available).toFixed(2)})`);
    if(position&&Math.abs(n(position.positionAmt??position.qty)||0)>0)errors.push("An open position already exists for this symbol");if(Array.isArray(ownedOrders)&&ownedOrders.length)errors.push("Unresolved SCALP-owned orders exist");
    return {ok:errors.length===0,errors,normalizedLot:normalized};
  }
  function formatOutcome(model){
    const valid=value=>value!==null&&value!==""&&Number.isFinite(Number(value)),integer=value=>valid(value)?Math.round(Number(value)).toLocaleString("en-US"):"-",money=value=>valid(value)?`$${Number(value).toFixed(2)}`:"-";
    return {guide:valid(model&&model.guide)?Number(model.guide).toLocaleString("en-US",{maximumFractionDigits:2}):"-",tpDelta:integer(model&&model.tpDelta),slDelta:integer(model&&model.slDelta),tpFees:money(model&&model.tpFee),slFees:money(model&&model.slFee)};
  }
  root.calculations=Object.freeze({n,quoteAsset,roundStep,feeRates,prices,estimate,linkedSide,linkedPreview,preview,normalizeLot,formatNumeric,stepNumeric,validateArm,formatOutcome});
})();
