(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,S=C&&C.signal;
  if(!S)throw new Error("SCALP config must load before detector");

  const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
  const sign=value=>value>0?1:value<0?-1:0;
  const directionForSign=value=>value>0?"LONG":value<0?"SHORT":null;
  const fixedPeriods=()=>[S.emaFast,S.emaSlow,S.emaFast,S.emaSlow,S.emaFast];
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;

  function atr(rows,period=S.atrPeriod){
    const list=Array.isArray(rows)?rows:[],values=[];
    for(let i=Math.max(1,list.length-period);i<list.length;i++){
      const row=list[i],previous=list[i-1],high=n(row&&row.high),low=n(row&&row.low),previousClose=n(previous&&previous.close);
      if(high!=null&&low!=null&&previousClose!=null)values.push(Math.max(high-low,Math.abs(high-previousClose),Math.abs(low-previousClose)));
    }
    return values.length?values.reduce((total,value)=>total+value,0)/values.length:null;
  }

  function makeEvent({tf,type,direction,state,qualified,row,revision,reason,now=Date.now(),raw={}}){
    const candleTime=n(row&&row.time)||0;
    return Object.freeze({
      source:tf,
      eventId:[tf,type,direction,candleTime,revision||0,state].join("|"),
      freshnessKey:[tf,type,direction,candleTime].join("|"),
      eventType:type,direction,eventState:state,phase:state,
      qualified:qualified===true,projected:state==="PROJECTED",
      candleTime,publishedAt:now,reason,raw:Object.freeze({...raw})
    });
  }

  function noneDetection(tf,status,now){
    return Object.freeze({source:tf,eventType:"NONE",direction:null,eventState:"NONE",phase:"NONE",qualified:false,projected:false,publishedAt:now,rank:null,rankValue:null,status});
  }

  function rankLabel(value){return value>=80?"A":value>=60?"B":value>0?"C":null;}
  function canonicalMeta(tf,event){
    let model=null;
    try{
      const api=window.MA_STACK_STRIP;
      model=api&&typeof api.classifyTimeframe==="function"?api.classifyTimeframe(tf,{includeForming:true}):null;
    }catch(_e){}
    const maEvent=model&&model.maEvent;
    if(!maEvent||!event)return {rank:null,rankValue:null,quality:null,canonicalSource:null};
    const periods=String(maEvent.ref||maEvent.label||"").match(/\d+/g)||[];
    const pairMatches=periods.includes(String(S.emaFast))&&periods.includes(String(S.emaSlow));
    const canonicalType=String(maEvent.type||"").toLowerCase();
    const typeMatches=event.eventType==="CROSS"?canonicalType.includes("cross"):canonicalType.includes("bounce");
    const direction=Number(maEvent.dir)>0?"LONG":Number(maEvent.dir)<0?"SHORT":null;
    if(!pairMatches||!typeMatches||direction!==event.direction)return {rank:null,rankValue:null,quality:null,canonicalSource:null};
    const rankValue=n(maEvent.rank),quality=n(model.quality);
    return {rank:rankLabel(rankValue),rankValue,quality,canonicalSource:model.source||null};
  }
  function decorate(tf,event){return event?Object.freeze({...event,...canonicalMeta(tf,event)}):event;}

  function analyze(rows,fast,slow){
    const index=rows.length-1;
    if(index<2)return null;
    const range=atr(rows),emaFast=n(fast[index]),emaSlow=n(slow[index]),previousFast=n(fast[index-1]),previousSlow=n(slow[index-1]),priorFast=n(fast[index-2]);
    if(!(range>0)||[emaFast,emaSlow,previousFast,previousSlow,priorFast].some(value=>value==null))return null;
    const gap=emaFast-emaSlow,previousGap=previousFast-previousSlow;
    return {
      i:index,range,f:emaFast,s:emaSlow,pf:previousFast,ps:previousSlow,
      gap,previousGap,
      fastSlope:(emaFast-previousFast)/range,
      slowSlope:(emaSlow-previousSlow)/range,
      previousFastSlope:(previousFast-priorFast)/range,
      separation:Math.abs(gap)/range
    };
  }

  class Detector{
    constructor(){
      this.liveGapByTf=new Map();
      this.crossByTf=new Map();
      this.bounceByTf=new Map();
      this.lastClosedByTf=new Map();
      this.diagnosticsByTf=new Map();
      this.diagnosticHistory=[];
    }

    reset(tf=null){
      if(tf){
        this.liveGapByTf.delete(tf);this.crossByTf.delete(tf);this.bounceByTf.delete(tf);this.lastClosedByTf.delete(tf);this.diagnosticsByTf.delete(tf);
      }else{
        this.liveGapByTf.clear();this.crossByTf.clear();this.bounceByTf.clear();this.lastClosedByTf.clear();this.diagnosticsByTf.clear();this.diagnosticHistory.length=0;
      }
    }

    diagnostics(){
      const byTimeframe={};
      for(const [tf,value] of this.diagnosticsByTf)byTimeframe[tf]=clone(value);
      return {byTimeframe,recent:this.diagnosticHistory.map(clone)};
    }

    recordDiagnostic(tf,value){
      const item=Object.freeze({tf,...value});
      this.diagnosticsByTf.set(tf,item);
      this.diagnosticHistory.push(item);
      if(this.diagnosticHistory.length>36)this.diagnosticHistory.splice(0,this.diagnosticHistory.length-36);
    }

    snapshot(hub,tf,includeForming){
      return hub.getAuthoritativeMaSnapshot(tf,{includeForming,periods:fixedPeriods(),requiredRows:S.minimumRows});
    }

    evaluateTf(tf,hubUpdate=null,now=Date.now()){
      const hub=window.PUBLIC_MARKET_DATA_HUB;
      const updateAt=n(hubUpdate&&hubUpdate.exchangeTime)||now;
      const revisions=hubUpdate||hub&&typeof hub.getTimeframeRevisions==="function"&&hub.getTimeframeRevisions(tf)||{};
      let rejectionReason="";
      if(!hub||typeof hub.getAuthoritativeMaSnapshot!=="function"){
        const status="Canonical EMA data unavailable";
        this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:n(revisions.closedRevision)||0,formingRevision:n(revisions.formingRevision)||0,reliable:false,reliableReason:"hub-unavailable",ema9:null,ema55:null,currentGap:null,previousObservedGap:null,currentSign:0,previousSign:0,separationAtr:null,crossTrack:null,bounceTrack:null,bouncePhase:"NONE",emittedEvent:null,rejectionReason:status});
        return {ready:false,status,event:null,emittedEvent:null,oppositeCross:null,detection:noneDetection(tf,status,now)};
      }

      const live=this.snapshot(hub,tf,true);
      if(!live){
        const status="EMA9/EMA55 snapshot unavailable";
        this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:n(revisions.closedRevision)||0,formingRevision:n(revisions.formingRevision)||0,reliable:false,reliableReason:"snapshot-unavailable",ema9:null,ema55:null,currentGap:null,previousObservedGap:null,currentSign:0,previousSign:0,separationAtr:null,crossTrack:null,bounceTrack:null,bouncePhase:"NONE",emittedEvent:null,rejectionReason:status});
        return {ready:false,status,event:null,emittedEvent:null,oppositeCross:null,detection:noneDetection(tf,status,now)};
      }

      const rows=live.rows||[],fast=live.alignedByPeriod&&live.alignedByPeriod[S.emaFast]||[],slow=live.alignedByPeriod&&live.alignedByPeriod[S.emaSlow]||[],analysis=analyze(rows,fast,slow);
      if(!live.reliable||!analysis){
        const status=live.reason||"EMA9/EMA55 warming up";
        this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:n(revisions.closedRevision)||0,formingRevision:n(revisions.formingRevision)||0,reliable:false,reliableReason:status,ema9:analysis&&analysis.f||null,ema55:analysis&&analysis.s||null,currentGap:analysis&&analysis.gap||null,previousObservedGap:this.liveGapByTf.get(tf)&&this.liveGapByTf.get(tf).gap||null,currentSign:analysis?sign(analysis.gap):0,previousSign:this.liveGapByTf.get(tf)&&this.liveGapByTf.get(tf).sign||0,separationAtr:analysis&&analysis.separation||null,crossTrack:clone(this.crossByTf.get(tf)||null),bounceTrack:clone(this.bounceByTf.get(tf)||null),bouncePhase:this.bounceByTf.get(tf)&&this.bounceByTf.get(tf).phase||"NONE",emittedEvent:null,rejectionReason:status});
        return {ready:false,status,event:null,emittedEvent:null,oppositeCross:null,detection:noneDetection(tf,status,now)};
      }

      const row=rows[analysis.i],price=n(row&&row.close),currentSign=sign(analysis.gap),direction=directionForSign(currentSign),previous=this.liveGapByTf.get(tf)||null,previousObservedSign=previous&&previous.sign||0,previousNonZeroSign=previous&&previous.lastNonZeroSign||0;
      const crossed=!!previous&&currentSign!==0&&previousNonZeroSign!==0&&currentSign!==previousNonZeroSign;
      let event=null,emittedEvent=null,oppositeCross=null,projectedEvent=null,bounceEvent=null;

      if(crossed){
        const crossTrack={direction,phase:"CROSS",at:now,candleTime:n(row&&row.time)||0,fromSign:previousNonZeroSign,toSign:currentSign,gap:analysis.gap,separation:analysis.separation};
        this.crossByTf.set(tf,crossTrack);
        if(this.bounceByTf.has(tf))rejectionReason="bounce-invalidated-by-cross";
        this.bounceByTf.delete(tf);
        emittedEvent=makeEvent({tf,type:"CROSS",direction,state:"LIVE",qualified:true,row,revision:n(revisions.formingRevision)||0,reason:"Observed live EMA9/EMA55 sign transition",now,raw:{...analysis,previousObservedGap:previous.gap,previousObservedSign:previousNonZeroSign}});
        event=emittedEvent;
        oppositeCross=emittedEvent;
      }else{
        const sameSide=!!previous&&currentSign!==0&&previousNonZeroSign===currentSign;
        const contracting=sameSide&&analysis.separation<previous.separation-1e-12;
        const gapVelocity=previous?(analysis.gap-previous.gap)/analysis.range:0;
        const movingToward=sameSide&&(currentSign>0?gapVelocity<0:gapVelocity>0);
        const fastMovingToward=currentSign>0?analysis.fastSlope<=-S.minFastSlopeAtr:currentSign<0?analysis.fastSlope>=S.minFastSlopeAtr:false;
        let crossTrack=this.crossByTf.get(tf)||null;
        if(sameSide&&contracting&&movingToward&&fastMovingToward&&analysis.separation<=S.projectedBandAtr&&Math.abs(gapVelocity)>=S.minFastSlopeAtr){
          const projectedDirection=currentSign>0?"SHORT":"LONG";
          crossTrack={direction:projectedDirection,phase:"PROJECTED",at:crossTrack&&crossTrack.phase==="PROJECTED"?crossTrack.at:now,candleTime:n(row&&row.time)||0,lastSeparation:analysis.separation,lastGap:analysis.gap};
          this.crossByTf.set(tf,crossTrack);
          projectedEvent=makeEvent({tf,type:"CROSS",direction:projectedDirection,state:"PROJECTED",qualified:false,row,revision:n(revisions.formingRevision)||0,reason:"EMA9/EMA55 live gap is contracting toward a possible cross",now,raw:{...analysis,previousObservedGap:previous.gap}});
        }else if(crossTrack&&crossTrack.phase==="PROJECTED"){
          this.crossByTf.delete(tf);
          rejectionReason=contracting?"projected-move-no-longer-strong":"projected-gap-expanded";
        }else if(crossTrack&&crossTrack.phase==="CROSS"){
          this.crossByTf.delete(tf);
        }

        let bounceTrack=this.bounceByTf.get(tf)||null;
        if(bounceTrack&&currentSign!==0&&bounceTrack.sign!==currentSign){
          this.bounceByTf.delete(tf);bounceTrack=null;rejectionReason="bounce-regime-changed";
        }
        if(!bounceTrack&&sameSide&&contracting&&analysis.separation<=S.approachAtr){
          bounceTrack={direction,sign:currentSign,phase:"APPROACH",startedAt:now,startedCandleTime:n(row&&row.time)||0,lastCandleTime:n(row&&row.time)||0,lastSeparation:analysis.separation,closestSeparation:analysis.separation,contactSeen:false};
        }
        if(bounceTrack){
          const expanding=analysis.separation>bounceTrack.lastSeparation+1e-12;
          bounceTrack.lastCandleTime=n(row&&row.time)||bounceTrack.lastCandleTime;
          bounceTrack.closestSeparation=Math.min(bounceTrack.closestSeparation,analysis.separation);
          if(analysis.separation<=S.toleranceAtr){bounceTrack.contactSeen=true;bounceTrack.phase="CONTACT";}
          else if(contracting&&!bounceTrack.contactSeen)bounceTrack.phase="APPROACH";
          if(expanding&&!bounceTrack.contactSeen){
            this.bounceByTf.delete(tf);bounceTrack=null;rejectionReason="bounce-approach-expanded-before-contact";
          }else{
            bounceTrack.lastSeparation=analysis.separation;
            this.bounceByTf.set(tf,bounceTrack);
          }
        }
        if(bounceTrack){
          bounceEvent=makeEvent({tf,type:"BOUNCE",direction:bounceTrack.direction,state:bounceTrack.phase,qualified:false,row,revision:n(revisions.formingRevision)||0,reason:bounceTrack.phase==="CONTACT"?"EMA9 is within the EMA55 ATR tolerance without crossing":"EMA9/EMA55 same-side gap is contracting",now,raw:{...analysis,closestSeparation:bounceTrack.closestSeparation}});
        }
      }

      const isClosedUpdate=hubUpdate&&hubUpdate.type==="kline"&&hubUpdate.tf===tf&&hubUpdate.closed===true;
      if(!crossed&&isClosedUpdate){
        const closed=this.snapshot(hub,tf,false)||{},closedRows=closed.rows||[],closedFast=closed.alignedByPeriod&&closed.alignedByPeriod[S.emaFast]||[],closedSlow=closed.alignedByPeriod&&closed.alignedByPeriod[S.emaSlow]||[],closedAnalysis=analyze(closedRows,closedFast,closedSlow),closedRow=closedRows[closedRows.length-1];
        const closedTime=n(closedRow&&closedRow.time)||0;
        if(closedAnalysis&&closedRow&&this.lastClosedByTf.get(tf)!==closedTime){
          this.lastClosedByTf.set(tf,closedTime);
          const track=this.bounceByTf.get(tf)||null,closedSign=sign(closedAnalysis.gap),closedDirection=directionForSign(closedSign);
          if(track&&track.sign===closedSign&&track.contactSeen){
            const expanded=closedAnalysis.separation>=track.closestSeparation+S.bounceExpansionAtr;
            const slopeAway=closedDirection==="LONG"?closedAnalysis.fastSlope>0:closedAnalysis.fastSlope<0;
            const contradictorySlow=closedDirection==="LONG"?closedAnalysis.slowSlope<-S.maxOppositeSlowSlopeAtr:closedAnalysis.slowSlope>S.maxOppositeSlowSlopeAtr;
            if(expanded&&slopeAway&&!contradictorySlow){
              emittedEvent=makeEvent({tf,type:"BOUNCE",direction:closedDirection,state:"CONFIRMED",qualified:true,row:closedRow,revision:n(revisions.closedRevision)||0,reason:"EMA9 contacted EMA55 and closed expanding away on the original side",now,raw:{...closedAnalysis,closestSeparation:track.closestSeparation,contactSeen:true}});
              event=emittedEvent;
            }else{
              rejectionReason=contradictorySlow?"bounce-closed-against-strong-ema55-slope":!expanded?"bounce-close-did-not-expand":"bounce-close-fast-slope-not-away";
            }
            this.bounceByTf.delete(tf);
            bounceEvent=null;
          }else if(track){
            rejectionReason=track.contactSeen?"bounce-close-regime-changed":"bounce-close-without-contact";
            this.bounceByTf.delete(tf);
            bounceEvent=null;
          }
        }
      }

      if(!event)event=bounceEvent||projectedEvent||null;
      event=decorate(tf,event);emittedEvent=decorate(tf,emittedEvent);oppositeCross=decorate(tf,oppositeCross);
      const observation={gap:analysis.gap,sign:currentSign,lastNonZeroSign:currentSign||previousNonZeroSign,separation:analysis.separation,observedAt:now,candleTime:n(row&&row.time)||0,formingRevision:n(revisions.formingRevision)||0,closedRevision:n(revisions.closedRevision)||0};
      this.liveGapByTf.set(tf,observation);
      const status=event?`${event.eventState} ${event.direction} ${event.eventType}`:`${direction||"FLAT"} EMA9/EMA55`;
      const bounceTrack=this.bounceByTf.get(tf)||null,crossTrack=this.crossByTf.get(tf)||null;
      this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:observation.closedRevision,formingRevision:observation.formingRevision,reliable:true,reliableReason:"",ema9:analysis.f,ema55:analysis.s,currentGap:analysis.gap,previousObservedGap:previous&&previous.gap!=null?previous.gap:null,currentSign,previousSign:previousObservedSign,previousNonZeroSign,separationAtr:analysis.separation,crossTrack:clone(crossTrack),bounceTrack:clone(bounceTrack),bouncePhase:bounceTrack&&bounceTrack.phase||"NONE",emittedEvent:clone(emittedEvent),rejectionReason});
      return {ready:true,status,event,emittedEvent,oppositeCross,detection:event||noneDetection(tf,status,now),guide:price,analysis,diagnostics:this.diagnosticsByTf.get(tf),rejectionReason};
    }

    evaluateSignal(detail){
      if(!detail){const status="Waiting for canonical Signal publication";return {ready:false,status,event:null,emittedEvent:null,oppositeCross:null,detection:noneDetection("SIG",status,Date.now())};}
      const event=Object.freeze({...detail,source:"SIG",eventType:detail.eventType||"NONE",eventState:detail.eventState||"NONE",phase:detail.eventState||detail.phase||"NONE",qualified:detail.qualified===true,rank:detail.rank||null,rankValue:detail.rankValue==null?null:n(detail.rankValue)});
      const emittedEvent=event.eventType!=="NONE"&&event.qualified&&!event.projected?event:null;
      const oppositeCross=event.eventType==="CROSS"&&["CONFIRMED","LIVE","COMMITTED"].includes(event.eventState)?event:null;
      const status=event.eventType!=="NONE"?`${event.eventState} ${event.direction} ${event.eventType}`:`Signal ${event.visibleState||"waiting"}`;
      return {ready:true,status,event:event.eventType!=="NONE"?event:null,emittedEvent,detection:event,oppositeCross};
    }
  }

  root.Detector=Detector;
  root.detectorTools=Object.freeze({atr,analyze,makeEvent,fixedPeriods});
})();
