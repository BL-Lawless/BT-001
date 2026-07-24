(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {},calc=root.calculations;
  if(!calc)throw new Error("SCALP calculations must load before exit decisions");
  const n=calc.n,upper=value=>String(value||"").toUpperCase();
  const CANDLE_TIE_BREAK="PSL_FIRST";

  function rankBoost({tranche={},eventRank,normalTp,tickSize=.01}={}){
    const direction=upper(tranche.direction),rank=eventRank==null?n(tranche.triggerRank):n(eventRank),threshold=n(tranche.rankBoostThreshold),points=n(tranche.rankBoostPoints),baseTp=n(normalTp),tick=n(tickSize)||.01;
    const applied=!!tranche.rankBoostEnabled&&rank!=null&&threshold!=null&&rank>threshold&&points>0&&baseTp>0&&["LONG","SHORT"].includes(direction);
    const tpPrice=applied?calc.roundStep(direction==="LONG"?baseTp+points:baseTp-points,tick,direction==="LONG"?"up":"down"):baseTp;
    return {triggerRank:rank,applied,normalTp:baseTp,tpPrice};
  }

  function profitLockLevel({tranche={},tickSize=.01}={}){
    const entry=n(tranche.entryPrice),tp=n(tranche.partialTpPrice),pct=n(tranche.lockThresholdPct),direction=upper(tranche.direction);
    if(!(entry>0)||!(tp>0)||!(pct>0)||!["LONG","SHORT"].includes(direction))return null;
    return calc.roundStep(entry+(tp-entry)*(pct/100),n(tickSize)||.01,direction==="LONG"?"up":"down");
  }

  function profitLockQuantity({tranche={},filters={}}={}){
    const remaining=n(tranche.remainingQty)||0,step=n(filters.stepSize)||.001,requested=calc.normalizeLot(remaining*((n(tranche.lockPortionPct)||0)/100),filters),maximum=calc.normalizeLot(Math.max(0,remaining-step),filters);
    return Math.min(requested,maximum);
  }

  function profitLockReached({tranche={},price,tickSize=.01}={}){
    const level=profitLockLevel({tranche,tickSize}),current=n(price),direction=upper(tranche.direction);
    return !!(tranche.profitLockEnabled&&!tranche.profitLockTriggered&&!tranche.profitLockPending&&upper(tranche.status)==="ACTIVE"&&level>0&&current>0&&(direction==="LONG"?current>=level:direction==="SHORT"&&current<=level));
  }

  function profitLockDecision({tranche={},price,filters={}}={}){
    const level=profitLockLevel({tranche,tickSize:filters.tickSize}),quantity=profitLockQuantity({tranche,filters});
    return {reached:profitLockReached({tranche,price,tickSize:filters.tickSize}),level,quantity};
  }

  function evaluateProtectionCandle({tranche={},candle={}}={}){
    const direction=upper(tranche.direction),high=n(candle.high??candle.h),low=n(candle.low??candle.l),pslPrice=n(tranche.pslPrice??tranche.slPrice),tpPrice=n(tranche.partialTpPrice??tranche.tpPrice);
    if(!["LONG","SHORT"].includes(direction)||!(high>0)||!(low>0)||high<low||!(pslPrice>0)||!(tpPrice>0))return {resolved:false,reason:null,exitPrice:null,pslTouched:false,tpTouched:false,tieBreak:null};
    const pslTouched=direction==="LONG"?low<=pslPrice:high>=pslPrice,tpTouched=direction==="LONG"?high>=tpPrice:low<=tpPrice;
    if(pslTouched)return {resolved:true,reason:"PSL",exitPrice:pslPrice,pslTouched:true,tpTouched,tieBreak:tpTouched?CANDLE_TIE_BREAK:null};
    if(tpTouched)return {resolved:true,reason:"PARTIAL_TP",exitPrice:tpPrice,pslTouched:false,tpTouched:true,tieBreak:null};
    return {resolved:false,reason:null,exitPrice:null,pslTouched:false,tpTouched:false,tieBreak:null};
  }

  root.exitDecisions=Object.freeze({
    CANDLE_TIE_BREAK,rankBoost,profitLockLevel,profitLockQuantity,profitLockReached,profitLockDecision,evaluateProtectionCandle
  });
})();
