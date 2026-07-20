(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,S=C&&C.signal;
  if(!S) throw new Error("SCALP config must load before detector");
  const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
  const sign=value=>value>0?1:value<0?-1:0;
  function atr(rows,period=S.atrPeriod){
    const list=Array.isArray(rows)?rows:[],values=[];
    for(let i=Math.max(1,list.length-period);i<list.length;i++){const row=list[i],prev=list[i-1],h=n(row&&row.high),l=n(row&&row.low),pc=n(prev&&prev.close);if(h!=null&&l!=null&&pc!=null)values.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));}
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function makeEvent({tf,type,direction,state,qualified,row,revision,reason,now=Date.now(),raw={}}){
    const candleTime=n(row&&row.time)||0;
    return Object.freeze({source:tf,eventId:[tf,type,direction,candleTime,revision||0,state].join("|"),freshnessKey:[tf,type,direction,candleTime].join("|"),eventType:type,direction,eventState:state,phase:state,qualified:qualified===true,projected:state==="PROJECTED",candleTime,publishedAt:now,reason,raw:Object.freeze({...raw})});
  }
  function noneDetection(tf,status,now){return Object.freeze({source:tf,eventType:"NONE",direction:null,eventState:"NONE",phase:"NONE",qualified:false,projected:false,publishedAt:now,rank:null,rankValue:null,status});}
  function rankLabel(value){return value>=80?"A":value>=60?"B":value>0?"C":null;}
  function canonicalMeta(tf,event){
    let model=null;try{const api=window.MA_STACK_STRIP;model=api&&typeof api.classifyTimeframe==="function"?api.classifyTimeframe(tf,{includeForming:true}):null;}catch(_e){}const maEvent=model&&model.maEvent;
    if(!maEvent||!event)return {rank:null,rankValue:null,quality:null,canonicalSource:null};
    const periods=String(maEvent.ref||maEvent.label||"").match(/\d+/g)||[],pairMatches=periods.includes(String(S.emaFast))&&periods.includes(String(S.emaSlow)),canonicalType=String(maEvent.type||"").toLowerCase(),typeMatches=event.eventType==="CROSS"?canonicalType.includes("cross"):canonicalType.includes("bounce"),dir=Number(maEvent.dir)>0?"LONG":Number(maEvent.dir)<0?"SHORT":null;
    if(!pairMatches||!typeMatches||dir!==event.direction)return {rank:null,rankValue:null,quality:null,canonicalSource:null};
    const rankValue=n(maEvent.rank),quality=n(model.quality);return {rank:rankLabel(rankValue),rankValue,quality,canonicalSource:model.source||null};
  }
  function decorate(tf,event){return event?Object.freeze({...event,...canonicalMeta(tf,event)}):event;}
  function analyze(rows,fast,slow){
    const i=rows.length-1;if(i<2)return null;
    const range=atr(rows),f=n(fast[i]),s=n(slow[i]),pf=n(fast[i-1]),ps=n(slow[i-1]),ppf=n(fast[i-2]);
    if(!(range>0)||[f,s,pf,ps,ppf].some(value=>value==null))return null;
    const gap=f-s,previousGap=pf-ps,fastSlope=(f-pf)/range,slowSlope=(s-ps)/range,previousFastSlope=(pf-ppf)/range,separation=Math.abs(gap)/range;
    return {i,range,f,s,pf,ps,gap,previousGap,fastSlope,slowSlope,previousFastSlope,separation,compressed:separation<S.maxCompressionAtr};
  }
  class Detector{
    constructor(){this.crossByTf=new Map();this.lastClosedByTf=new Map();}
    reset(tf=null){if(tf){this.crossByTf.delete(tf);this.lastClosedByTf.delete(tf);}else{this.crossByTf.clear();this.lastClosedByTf.clear();}}
    evaluateTf(tf,hubUpdate=null,now=Date.now()){
      const hub=window.PUBLIC_MARKET_DATA_HUB;if(!hub||typeof hub.getAuthoritativeMaSnapshot!=="function"){const status="Canonical EMA data unavailable";return {ready:false,status,event:null,oppositeCross:null,detection:noneDetection(tf,status,now)};}
      const live=hub.getAuthoritativeMaSnapshot(tf,{includeForming:true,periods:[S.emaFast,S.emaSlow,S.emaFast,S.emaSlow,S.emaFast],requiredRows:S.minimumRows});
      if(!live){const status="EMA9/EMA55 snapshot unavailable";return {ready:false,status,event:null,oppositeCross:null,detection:noneDetection(tf,status,now)};}
      const rows=live.rows||[],fast=live.alignedByPeriod&&live.alignedByPeriod[S.emaFast]||[],slow=live.alignedByPeriod&&live.alignedByPeriod[S.emaSlow]||[],a=analyze(rows,fast,slow);
      if(!live.reliable||!a){const status=live.reason||"EMA9/EMA55 warming up";return {ready:false,status,event:null,oppositeCross:null,detection:noneDetection(tf,status,now)};}
      const row=rows[a.i],price=n(row&&row.close),direction=a.gap>0?"LONG":a.gap<0?"SHORT":null,crossed=sign(a.gap)!==0&&sign(a.previousGap)!==0&&sign(a.gap)!==sign(a.previousGap);
      let track=this.crossByTf.get(tf),event=null,oppositeCross=null;
      if(track&&track.direction!==direction){this.crossByTf.delete(tf);track=null;}
      if(crossed){const candleTime=n(row&&row.time)||0;if(!track||track.direction!==direction||track.candleTime!==candleTime){track={direction,startedAt:now,initialSeparation:a.separation,candleTime};this.crossByTf.set(tf,track);oppositeCross=makeEvent({tf,type:"CROSS",direction,state:"LIVE",qualified:false,row,revision:hubUpdate&&hubUpdate.formingRevision,reason:"EMA9 crossed EMA55 intrabar",now,raw:a});}}
      if(track&&track.direction===direction){
        const beyond=direction==="LONG"?price>a.s:price<a.s,meaningful=direction==="LONG"?a.fastSlope>=S.minFastSlopeAtr:a.fastSlope<=-S.minFastSlopeAtr,increasing=a.separation>track.initialSeparation+S.minSeparationAtr;
        if(now-track.startedAt>=S.crossPersistenceMs[tf]&&beyond&&meaningful&&increasing&&!a.compressed)event=makeEvent({tf,type:"CROSS",direction,state:"COMMITTED",qualified:true,row,revision:hubUpdate&&hubUpdate.formingRevision,reason:`Live cross persisted ${S.crossPersistenceMs[tf]/1000}s with expanding separation`,now,raw:a});
        else event=makeEvent({tf,type:"CROSS",direction,state:"LIVE",qualified:false,row,revision:hubUpdate&&hubUpdate.formingRevision,reason:a.compressed?"Cross rejected: EMA compression":"Live cross awaiting commitment",now,raw:a});
      }else if(!track&&a.separation<=S.projectedBandAtr&&Math.abs(a.fastSlope)>=S.minFastSlopeAtr&&!a.compressed){
        const projected=a.fastSlope>0?"LONG":"SHORT";event=makeEvent({tf,type:"CROSS",direction:projected,state:"PROJECTED",qualified:false,row,revision:hubUpdate&&hubUpdate.formingRevision,reason:"EMA9 trajectory approaches EMA55",now,raw:a});
      }
      if(hubUpdate&&hubUpdate.type==="kline"&&hubUpdate.tf===tf&&hubUpdate.closed===true){
        const closed=hub.getAuthoritativeMaSnapshot(tf,{includeForming:false,periods:[S.emaFast,S.emaSlow,S.emaFast,S.emaSlow,S.emaFast],requiredRows:S.minimumRows})||{},cr=closed.rows||[],cf=closed.alignedByPeriod&&closed.alignedByPeriod[S.emaFast]||[],cs=closed.alignedByPeriod&&closed.alignedByPeriod[S.emaSlow]||[],ca=analyze(cr,cf,cs),closedRow=cr[cr.length-1];
        if(ca&&closedRow&&this.lastClosedByTf.get(tf)!==closedRow.time){
          this.lastClosedByTf.set(tf,closedRow.time);const d=ca.gap>0?"LONG":"SHORT",low=n(closedRow.low),high=n(closedRow.high),close=n(closedRow.close),touch=d==="LONG"?low<=ca.s+ca.range*S.toleranceAtr:high>=ca.s-ca.range*S.toleranceAtr,trendClose=d==="LONG"?close>ca.s:close<ca.s,rejection=d==="LONG"?(close-ca.s)/ca.range:(ca.s-close)/ca.range,slopeAway=d==="LONG"?ca.fastSlope>=S.minFastSlopeAtr:ca.fastSlope<=-S.minFastSlopeAtr,slowOk=d==="LONG"?ca.f>ca.s:ca.f<ca.s;
          const slowTrend=d==="LONG"?ca.slowSlope>=S.minSlowSlopeAtr:ca.slowSlope<=-S.minSlowSlopeAtr;
          if(touch&&trendClose&&rejection>=S.rejectionAtr&&slopeAway&&slowTrend&&slowOk&&!ca.compressed)event=makeEvent({tf,type:"BOUNCE",direction:d,state:"CONFIRMED",qualified:true,row:closedRow,revision:hubUpdate.closedRevision,reason:"Closed candle rejected EMA55 with EMA9/EMA55 maintaining trend-side slope",now,raw:ca});
        }
      }
      if(!event&&direction){const low=n(row&&row.low),high=n(row&&row.high),distance=Math.abs(price-a.s)/a.range,contact=direction==="LONG"?low<=a.s+a.range*S.toleranceAtr:high>=a.s-a.range*S.toleranceAtr;if(contact||distance<=S.toleranceAtr*2)event=makeEvent({tf,type:"BOUNCE",direction,state:contact?"CONTACT":"APPROACH",qualified:false,row,revision:hubUpdate&&hubUpdate.formingRevision,reason:contact?"Price is contacting EMA55":"Price is approaching EMA55",now,raw:a});}
      event=decorate(tf,event);oppositeCross=decorate(tf,oppositeCross);const status=event?`${event.eventState} ${event.direction} ${event.eventType}`:`${direction||"FLAT"} EMA9/EMA55`;
      return {ready:true,status,event,oppositeCross,detection:event||noneDetection(tf,status,now),guide:price,analysis:a};
    }
    evaluateSignal(detail){
      if(!detail){const status="Waiting for canonical Signal publication";return {ready:false,status,event:null,oppositeCross:null,detection:noneDetection("SIG",status,Date.now())};}
      const event=Object.freeze({...detail,source:"SIG",eventType:detail.eventType||"NONE",eventState:detail.eventState||"NONE",phase:detail.eventState||detail.phase||"NONE",qualified:detail.qualified===true,rank:detail.rank||null,rankValue:detail.rankValue==null?null:n(detail.rankValue)});
      const oppositeCross=event.eventType==="CROSS"&&["CONFIRMED","LIVE","COMMITTED"].includes(event.eventState)?event:null;
      const status=event.eventType!=="NONE"?`${event.eventState} ${event.direction} ${event.eventType}`:`Signal ${event.visibleState||"waiting"}`;return {ready:true,status,event:event.eventType!=="NONE"?event:null,detection:event,oppositeCross};
    }
  }
  root.Detector=Detector;root.detectorTools=Object.freeze({atr,analyze,makeEvent});
})();
