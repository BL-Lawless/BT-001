(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,S=C&&C.signal;
  if(!S)throw new Error("SCALP config must load before detector");

  const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
  const sign=value=>value>0?1:value<0?-1:0;
  const directionForSign=value=>value>0?"LONG":value<0?"SHORT":null;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
  const rounded=value=>Math.round(clamp(value));
  const fixedPeriods=()=>[S.emaFast,S.emaSlow,S.emaFast,S.emaSlow,S.emaFast];
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;

  function atrTelemetry(rows,period=S.atrPeriod,lookback=S.atrTrajectoryLookbackBars){
    const source=(Array.isArray(rows)?rows:[]).slice(0,-1).filter(row=>row&&row.final!==false),ranges=[];
    for(let i=1;i<source.length;i++){
      const row=source[i],previous=source[i-1],high=n(row&&row.high),low=n(row&&row.low),previousClose=n(previous&&previous.close);
      if(high==null||low==null||previousClose==null)continue;
      ranges.push(Math.max(high-low,Math.abs(high-previousClose),Math.abs(low-previousClose)));
    }
    if(ranges.length<period)return {atr:null,priorAtr:null,atrChange:null,period,lookback,finalizedCount:source.length};
    const series=[];let current=ranges.slice(0,period).reduce((total,value)=>total+value,0)/period;
    series.push(current);
    for(let i=period;i<ranges.length;i++){current=((period-1)*current+ranges[i])/period;series.push(current);}
    const atr=current,priorAtr=series.length>lookback?series[series.length-1-lookback]:null,atrChange=priorAtr>0?(atr-priorAtr)/priorAtr:null;
    return {atr,priorAtr,atrChange,period,lookback,finalizedCount:source.length};
  }
  function atr(rows,period=S.atrPeriod){return atrTelemetry(rows,period).atr;}

  function makeEvent({tf,type,direction,state,qualified,row,revision,reason,rejectionReason="",now=Date.now(),raw={}}){
    const candleTime=n(row&&row.time)||0;
    return Object.freeze({
      source:tf,
      eventId:[tf,type,direction,candleTime,revision||0,state].join("|"),
      freshnessKey:[tf,type,direction,candleTime].join("|"),
      eventType:type,direction,eventState:state,phase:state,
      qualified:qualified===true,projected:state==="PROJECTED",rejectionReason,
      candleTime,publishedAt:now,reason,raw:Object.freeze({...raw})
    });
  }

  function noneDetection(tf,status,now){
    return Object.freeze({source:tf,eventType:"NONE",direction:null,eventState:"NONE",phase:"NONE",qualified:false,projected:false,publishedAt:now,rank:null,rankValue:null,status});
  }

  function rankLabel(value){return value>=80?"A":value>=60?"B":value>=1?"C":null;}
  function mean(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
  function separationSignificance(gaps,meaningfulGap=S.crossMeaningfulGapAtr){
    const values=(Array.isArray(gaps)?gaps:[]).map(n).filter(value=>value!=null&&value>=0),target=n(meaningfulGap);
    if(!values.length||!(target>0))return {available:false,average:null,minimum:null,dispersion:null,uniformity:null,significance:null};
    const average=mean(values),minimum=Math.min(...values),variance=mean(values.map(value=>(value-average)**2)),dispersion=average>0?Math.sqrt(variance)/average:1,uniformity=clamp(1/(1+dispersion),0,1),averageSignificance=clamp(average/target,0,1),minimumSignificance=clamp(minimum/target,0,1),significance=clamp(Math.min(averageSignificance,minimumSignificance)*uniformity,0,1);
    return {available:true,average,minimum,dispersion,uniformity,significance,meaningfulGap:target};
  }
  function directionalAcceleration(direction,analysis){
    const dir=direction==="LONG"?1:direction==="SHORT"?-1:0,normalized=n(analysis&&analysis.directionalAccelerationAtr),current=n(analysis&&analysis.fastSlope),previous=n(analysis&&analysis.previousFastSlope);
    if(!dir)return null;
    return normalized!=null?dir*normalized:current!=null&&previous!=null?dir*(current-previous):null;
  }
  function atrConviction(direction,analysis){
    const dir=direction==="LONG"?1:direction==="SHORT"?-1:0,velocity=dir*(n(analysis&&analysis.fastSlope)||0),acceleration=directionalAcceleration(direction,analysis),atrChange=n(analysis&&analysis.atrChange);
    return {
      velocityRelativeToAtr:clamp(velocity/Math.max(Number(S.velocityConvictionAtrPerBar)||1,Number.EPSILON)*100),
      atrTrajectory:clamp(50+(atrChange||0)/Math.max(Number(S.atrTrajectoryFullChange)||1,Number.EPSILON)*50),
      atrNormalizedAcceleration:clamp(50+(acceleration||0)/Math.max(Number(S.accelerationConvictionAtrPerBar)||1,Number.EPSILON)*50)
    };
  }
  function bounceQualification(track,analysis){
    const direction=track&&track.direction,dir=direction==="LONG"?1:direction==="SHORT"?-1:0,closest=n(track&&track.closestSeparation),separation=n(analysis&&analysis.separation),fastSlope=n(analysis&&analysis.fastSlope),slowSlope=n(analysis&&analysis.slowSlope),maxOpposite=n(S.maxOppositeSlowSlopeAtr);
    const expanded=closest!=null&&separation!=null&&separation>=closest+S.bounceExpansionAtr,slopeAway=dir!==0&&fastSlope!=null&&dir*fastSlope>0,directionalSlowSlope=dir&&slowSlope!=null?dir*slowSlope:null,slowSlopeAllowed=directionalSlowSlope!=null&&maxOpposite!=null&&directionalSlowSlope>=-Math.abs(maxOpposite);
    const reason=!expanded?"bounce-close-did-not-expand":!slopeAway?"bounce-close-fast-slope-not-away":!slowSlopeAllowed?"bounce-close-opposite-slow-slope":"";
    return {qualified:expanded&&slopeAway&&slowSlopeAllowed,expanded,slopeAway,slowSlopeAllowed,directionalSlowSlope,reason};
  }
  function bounceReasonText(reason){
    return ({
      "bounce-approach-threshold-not-reached":"EMA9/EMA55 contracted, but never entered the ATR-relative approach zone",
      "bounce-contact-not-reached":"EMA9/EMA55 entered approach, but did not reach the ATR-relative contact zone",
      "bounce-close-did-not-expand":"EMA9/EMA55 contacted, but separation has not expanded enough to confirm",
      "bounce-close-fast-slope-not-away":"EMA9 slope is not moving away in the bounce direction",
      "bounce-close-opposite-slow-slope":"EMA55 is moving too strongly against the bounce direction",
      "bounce-awaiting-closed-candle":"Bounce geometry is valid intrabar and is waiting for the candle close"
    })[reason]||reason||"Bounce candidate is not yet qualified";
  }
  function pressureScore(rows,eventIndex,direction){
    const event=rows[eventIndex],volume=n(event&&event.volume),takerBuy=n(event&&event.takerBuyBase),open=n(event&&event.open),high=n(event&&event.high),low=n(event&&event.low),close=n(event&&event.close);
    if(!(volume>0))return {available:false,reason:"event-volume-unavailable"};
    if(takerBuy==null||takerBuy<0||takerBuy>volume)return {available:false,reason:"event-taker-volume-unavailable"};
    if([open,high,low,close].some(value=>value==null))return {available:false,reason:"event-ohlc-unavailable"};
    const priorClosed=[];
    for(let i=eventIndex-1;i>=0&&priorClosed.length<S.pressureBaseline;i--){const row=rows[i];if(row&&row.final!==false)priorClosed.push(row);}
    if(priorClosed.length<S.pressureBaseline)return {available:false,reason:`pressure-baseline-${priorClosed.length}-of-${S.pressureBaseline}`};
    const baseline=priorClosed.map(row=>n(row.volume));if(baseline.some(value=>!(value>0)))return {available:false,reason:"pressure-baseline-volume-unavailable"};
    const averageVolume=mean(baseline),relativeVolume=volume/averageVolume,buyShare=clamp(takerBuy/volume,0,1),directionalVolume=direction==="LONG"?takerBuy:volume-takerBuy,directionalShare=clamp(directionalVolume/volume,0,1),opposingShare=1-directionalShare;
    const range=Math.max(high-low,Math.abs(close-open),Number.EPSILON),progress=clamp((direction==="LONG"?close-open:open-close)/range,0,1),effectiveness=clamp(progress/Math.max(relativeVolume,.25),0,1),pressureDirection=directionalShare>=.57?"ALIGNED":directionalShare<=.43?"OPPOSING":"BALANCED",absorption=relativeVolume>=1.5&&progress<.18;
    const shareTerm=(directionalShare-.5)*100,relativeTerm=clamp((relativeVolume-1)*10,-10,15)*(directionalShare>=.5?1:-1),progressTerm=(progress-.15)*20,effectivenessTerm=(effectiveness-.2)*10,absorptionPenalty=absorption?45:0;
    const score=rounded(50+shareTerm+relativeTerm+progressTerm+effectivenessTerm-absorptionPenalty);
    return {available:true,reason:"",score,directionalVolumeShare:directionalShare,relativeVolume,pressureDirection,absorption,opposingShare,directionalPriceProgress:progress,participationEffectiveness:effectiveness,baselineCount:baseline.length,averageBaselineVolume:averageVolume,eventVolume:volume,eventTakerBuyBase:takerBuy,buyShare,eventClosed:event.final===true};
  }
  function emaScore(event,analysis,row,track,previous,lastCross){
    const dir=event.direction==="LONG"?1:-1,close=n(row&&row.close)||analysis.s,pricePosition=dir*(close-analysis.s)/analysis.atr,slowContext=dir*analysis.slowSlope,acceleration=directionalAcceleration(event.direction,analysis),accelerationScore=clamp(50+(acceleration||0)*400),conviction=atrConviction(event.direction,analysis);
    let components;
    if(event.eventType==="CROSS"){
      const crossingReference=n(track&&track.crossingSeparation)??0,postCrossDisplacement=Math.max(0,analysis.separation-crossingReference),rapid=lastCross&&lastCross.direction!==event.direction&&Math.abs((n(row&&row.time)||0)-lastCross.candleTime)<=2*({"1m":60,"3m":180,"5m":300,"15m":900}[event.source]||60),significance=separationSignificance([analysis.separation]);
      components={directionalSlope:clamp(50+dir*analysis.fastSlope*400),directionalAcceleration:accelerationScore,velocityRelativeToAtr:conviction.velocityRelativeToAtr,atrTrajectory:conviction.atrTrajectory,atrNormalizedAcceleration:conviction.atrNormalizedAcceleration,separationExpansion:clamp(50+postCrossDisplacement*250),pricePosition:clamp(50+pricePosition*100),ema55Context:clamp(50+slowContext*250),cleanliness:clamp((significance.significance||0)*100),rapidReversalStability:rapid?15:100,dataReliabilityFreshness:100};
    }else{
      const closest=n(track&&track.closestSeparation)??analysis.separation,closeness=clamp(100*(1-closest/Math.max(S.approachAtr,Number.EPSILON))),expansion=clamp((analysis.separation-closest)*100/Math.max(S.bounceExpansionAtr*2,Number.EPSILON));
      components={approachCloseness:closeness,sameSideIntegrity:100,rejectionExpansion:expansion,directionalSlope:clamp(50+dir*analysis.fastSlope*400),directionalAcceleration:accelerationScore,velocityRelativeToAtr:conviction.velocityRelativeToAtr,atrTrajectory:conviction.atrTrajectory,atrNormalizedAcceleration:conviction.atrNormalizedAcceleration,priceFollowThrough:clamp(50+pricePosition*75),ema55Context:clamp(50+slowContext*250),dataReliabilityFreshness:100};
    }
    return {score:rounded(mean(Object.values(components))),components};
  }
  function rankEvent(tf,event,analysis,rows,track,previous,lastCross){
    if(!event||!event.qualified)return event;
    const row=rows[analysis.i],ema=emaScore(event,analysis,row,track,previous,lastCross),pressure=pressureScore(rows,analysis.i,event.direction),emaContribution=pressure.available?ema.score*.70:ema.score,pressureContribution=pressure.available?pressure.score*.30:null,rankValue=Math.round(emaContribution+(pressureContribution||0)),rank=rankLabel(rankValue);
    const rankDiagnostics=Object.freeze({timeframe:tf,candleTime:event.candleTime,rankValue,rank,emaScore:ema.score,emaContribution,emaComponents:Object.freeze({...ema.components}),pressureAvailable:pressure.available,pressureScore:pressure.available?pressure.score:null,pressureContribution,directionalVolumeShare:pressure.available?pressure.directionalVolumeShare:null,relativeVolume:pressure.available?pressure.relativeVolume:null,pressureDirection:pressure.available?pressure.pressureDirection:null,absorption:pressure.available?pressure.absorption:false,pressureUnavailableReason:pressure.available?"":pressure.reason,rejectionReasons:pressure.available?[]:[pressure.reason],pressure:pressure.available?Object.freeze({...pressure}):null});
    return Object.freeze({...event,rank,rankValue,emaScore:ema.score,pressureScore:pressure.available?pressure.score:null,rankDiagnostics});
  }

  function analyze(rows,fast,slow){
    const index=rows.length-1;
    if(index<2)return null;
    const volatility=atrTelemetry(rows),atrValue=volatility.atr,emaFast=n(fast[index]),emaSlow=n(slow[index]),previousFast=n(fast[index-1]),previousSlow=n(slow[index-1]),priorFast=n(fast[index-2]);
    if(!(atrValue>0)||[emaFast,emaSlow,previousFast,previousSlow,priorFast].some(value=>value==null))return null;
    const gap=emaFast-emaSlow,previousGap=previousFast-previousSlow,fastVelocity=emaFast-previousFast,previousFastVelocity=previousFast-priorFast;
    return {
      i:index,atr:atrValue,priorAtr:volatility.priorAtr,atrChange:volatility.atrChange,f:emaFast,s:emaSlow,pf:previousFast,ps:previousSlow,
      gap,previousGap,
      fastVelocity,previousFastVelocity,
      fastSlope:fastVelocity/atrValue,
      slowSlope:(emaSlow-previousSlow)/atrValue,
      previousFastSlope:previousFastVelocity/atrValue,
      directionalAccelerationAtr:(fastVelocity-previousFastVelocity)/atrValue,
      separation:Math.abs(gap)/atrValue,
      closedReferenceSeparation:Math.abs(previousGap)/atrValue
    };
  }

  function analyzeAt(rows,fast,slow,index){
    if(index<2||index>=rows.length)return null;
    return analyze(rows.slice(0,index+1),fast.slice(0,index+1),slow.slice(0,index+1));
  }

  function rebuildBounceWindow(rows,fast,slow,windowBars=S.bounceWindowBars){
    const source=Array.isArray(rows)?rows:[],lastIndex=source.length-1,limit=Math.max(3,Math.round(Number(windowBars)||12));
    if(lastIndex<2)return {candidate:null,reason:"bounce-window-insufficient-data",phase:"NONE",qualified:false};
    const points=[];
    for(let index=Math.max(2,lastIndex-limit+1);index<=lastIndex;index++){
      const analysis=analyzeAt(source,fast,slow,index),row=source[index],gapSign=analysis?sign(analysis.gap):0;
      if(analysis&&gapSign&&Number.isFinite(analysis.separation))points.push({index,row,analysis,sign:gapSign,separation:analysis.separation});
    }
    const current=points[points.length-1];
    if(!current||current.index!==lastIndex)return {candidate:null,reason:"bounce-window-current-analysis-unavailable",phase:"NONE",qualified:false};
    let suffixStart=points.length-1;
    while(suffixStart>0&&points[suffixStart-1].index===points[suffixStart].index-1&&points[suffixStart-1].sign===current.sign)suffixStart--;
    const sameSide=points.slice(suffixStart);
    if(sameSide.length<2)return {candidate:null,reason:"bounce-window-same-side-history-insufficient",phase:"NONE",qualified:false};
    let minimumOffset=-1;
    for(let index=sameSide.length-1;index>=1;index--){
      const contractedIntoPoint=sameSide[index].separation<sameSide[index-1].separation-1e-12;
      const isEndpoint=index===sameSide.length-1;
      const turnedOrHeld=isEndpoint||sameSide[index].separation<=sameSide[index+1].separation+1e-12;
      if(contractedIntoPoint&&turnedOrHeld){minimumOffset=index;break;}
    }
    if(minimumOffset<0)return {candidate:null,reason:"bounce-window-no-contraction",phase:"NONE",qualified:false};
    let contractionCount=0;
    for(let index=1;index<=minimumOffset;index++)if(sameSide[index].separation<sameSide[index-1].separation-1e-12)contractionCount++;
    if(!contractionCount)return {candidate:null,reason:"bounce-window-no-contraction",phase:"NONE",qualified:false};
    const closest=sameSide[minimumOffset],direction=directionForSign(current.sign);
    const candidate={
      architecture:"ROLLING_WINDOW_REBUILD",
      direction,sign:current.sign,phase:"APPROACH",
      startedCandleTime:n(sameSide[0].row&&sameSide[0].row.time)||0,
      lastCandleTime:n(current.row&&current.row.time)||0,
      closestCandleTime:n(closest.row&&closest.row.time)||0,
      closestIndex:closest.index,currentIndex:current.index,
      closestSeparation:closest.separation,lastSeparation:current.separation,
      contactSeen:closest.separation<=S.toleranceAtr,
      contractionCount,evaluatedBars:sameSide.length,
      windowStartIndex:sameSide[0].index,windowEndIndex:current.index
    };
    if(closest.separation>S.projectedBandAtr){
      return {candidate:null,reason:"bounce-outside-observation-band",phase:"NONE",qualified:false};
    }
    if(closest.separation>S.approachAtr){
      candidate.phase="OUTSIDE APPROACH";
      return {candidate,reason:"bounce-approach-threshold-not-reached",phase:candidate.phase,qualified:false,analysis:current.analysis};
    }
    if(!candidate.contactSeen){
      candidate.phase="APPROACH";
      return {candidate,reason:"bounce-contact-not-reached",phase:candidate.phase,qualified:false,analysis:current.analysis};
    }
    let firstQualified=null;
    for(let offset=minimumOffset+1;offset<sameSide.length;offset++){
      const point=sameSide[offset],qualification=bounceQualification(candidate,point.analysis);
      if(qualification.qualified){firstQualified={point,qualification};break;}
    }
    if(firstQualified&&firstQualified.point.index<current.index){
      return {candidate:null,reason:"bounce-already-confirmed-in-window",phase:"NONE",qualified:false,previouslyConfirmed:true,firstQualified};
    }
    if(firstQualified){
      candidate.phase="CONFIRMED";
      return {candidate,reason:"",phase:candidate.phase,qualified:true,analysis:current.analysis,qualification:firstQualified.qualification,firstQualified};
    }
    const qualification=bounceQualification(candidate,current.analysis);
    const phase=qualification.reason==="bounce-close-fast-slope-not-away"
      ?"WAITING SLOPE"
      :qualification.reason==="bounce-close-opposite-slow-slope"
        ?"WAITING CONTEXT"
        :minimumOffset===sameSide.length-1
          ?"CONTACT"
          :"WAITING EXPANSION";
    candidate.phase=phase;
    return {candidate,reason:qualification.reason||"bounce-close-did-not-expand",phase,qualified:false,analysis:current.analysis,qualification};
  }

  class Detector{
    constructor(){
      this.liveGapByTf=new Map();
      this.crossByTf=new Map();
      this.lastClosedByTf=new Map();
      this.lastActualCrossByTf=new Map();
      this.diagnosticsByTf=new Map();
      this.diagnosticHistory=[];
    }

    reset(tf=null){
      if(tf){
        this.liveGapByTf.delete(tf);this.crossByTf.delete(tf);this.lastClosedByTf.delete(tf);this.lastActualCrossByTf.delete(tf);this.diagnosticsByTf.delete(tf);
      }else{
        this.liveGapByTf.clear();this.crossByTf.clear();this.lastClosedByTf.clear();this.lastActualCrossByTf.clear();this.diagnosticsByTf.clear();this.diagnosticHistory.length=0;
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
        this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:n(revisions.closedRevision)||0,formingRevision:n(revisions.formingRevision)||0,reliable:false,reliableReason:status,ema9:analysis&&analysis.f||null,ema55:analysis&&analysis.s||null,currentGap:analysis&&analysis.gap||null,previousObservedGap:this.liveGapByTf.get(tf)&&this.liveGapByTf.get(tf).gap||null,currentSign:analysis?sign(analysis.gap):0,previousSign:this.liveGapByTf.get(tf)&&this.liveGapByTf.get(tf).sign||0,separationAtr:analysis&&analysis.separation||null,crossTrack:clone(this.crossByTf.get(tf)||null),bounceTrack:null,bouncePhase:"NONE",emittedEvent:null,rejectionReason:status});
        return {ready:false,status,event:null,emittedEvent:null,oppositeCross:null,detection:noneDetection(tf,status,now)};
      }

      const row=rows[analysis.i],price=n(row&&row.close),currentSign=sign(analysis.gap),direction=directionForSign(currentSign),previous=this.liveGapByTf.get(tf)||null,previousObservedSign=previous&&previous.sign||0,previousNonZeroSign=previous&&previous.lastNonZeroSign||0,priorBarSign=sign(analysis.previousGap);
      const crossed=currentSign!==0&&priorBarSign!==0&&currentSign!==priorBarSign;
      const isClosedUpdate=hubUpdate&&hubUpdate.type==="kline"&&hubUpdate.tf===tf&&hubUpdate.closed===true;
      let event=null,emittedEvent=null,oppositeCross=null,projectedEvent=null,bounceEvent=null;
      const qualifyCross=(crossTrack,reason)=>{
        crossTrack.phase="CROSS";crossTrack.separation=analysis.separation;this.crossByTf.set(tf,crossTrack);
        let qualified=makeEvent({tf,type:"CROSS",direction:crossTrack.direction,state:"LIVE",qualified:true,row,revision:n(revisions.formingRevision)||0,reason,now,raw:{...analysis,previousObservedGap:previous&&previous.gap,previousObservedSign:previousNonZeroSign,significance:separationSignificance([analysis.separation])}});
        qualified=rankEvent(tf,qualified,analysis,rows,crossTrack,previous,this.lastActualCrossByTf.get(tf)||null);this.lastActualCrossByTf.set(tf,{direction:crossTrack.direction,candleTime:n(row&&row.time)||0,publishedAt:now});
        return qualified;
      };

      if(crossed){
        const significant=analysis.separation>=S.crossMeaningfulGapAtr,crossTrack={direction,phase:significant?(isClosedUpdate?"CROSS":"PENDING_CLOSE"):"PENDING_SIGNIFICANCE",at:now,candleTime:n(row&&row.time)||0,fromSign:priorBarSign,toSign:currentSign,gap:analysis.gap,separation:analysis.separation,crossingSeparation:0,closedReferenceSeparation:analysis.closedReferenceSeparation};
        this.crossByTf.set(tf,crossTrack);
        if(significant&&isClosedUpdate){
          emittedEvent=qualifyCross(crossTrack,"Observed live EMA9/EMA55 sign transition with meaningful displacement");
          event=emittedEvent;oppositeCross=emittedEvent;
        }else if(significant){
          rejectionReason="cross-awaiting-closed-candle";
          event=makeEvent({tf,type:"CROSS",direction,state:"CONFIRMING",qualified:false,row,revision:n(revisions.formingRevision)||0,reason:"EMA9/EMA55 crossed with meaningful ATR-relative displacement and is waiting for the candle close",rejectionReason,now,raw:{...analysis,previousObservedGap:previous&&previous.gap,previousObservedSign:previousNonZeroSign,priorBarSign,significance:separationSignificance([analysis.separation])}});
        }else{
          rejectionReason="cross-separation-below-significance";
          event=makeEvent({tf,type:"CROSS",direction,state:"PENDING SIGNIFICANCE",qualified:false,row,revision:isClosedUpdate?n(revisions.closedRevision)||0:n(revisions.formingRevision)||0,reason:"EMA9/EMA55 sign transitioned but displacement is below the ATR significance gate",rejectionReason,now,raw:{...analysis,previousObservedGap:previous&&previous.gap,previousObservedSign:previousNonZeroSign,priorBarSign,significance:separationSignificance([analysis.separation])}});
        }
      }else{
        const sameSide=!!previous&&currentSign!==0&&previousNonZeroSign===currentSign;
        const contracting=sameSide&&analysis.separation<previous.separation-1e-12;
        const gapVelocity=previous?(analysis.gap-previous.gap)/analysis.atr:0;
        const movingToward=sameSide&&(currentSign>0?gapVelocity<0:gapVelocity>0);
        const fastMovingToward=currentSign>0?analysis.fastSlope<=-S.minFastSlopeAtr:currentSign<0?analysis.fastSlope>=S.minFastSlopeAtr:false;
        let crossTrack=this.crossByTf.get(tf)||null;
        if(crossTrack&&crossTrack.phase==="PENDING_SIGNIFICANCE"&&crossTrack.direction===direction){
          if(analysis.separation>=S.crossMeaningfulGapAtr){
            if(isClosedUpdate){
              emittedEvent=qualifyCross(crossTrack,"EMA9/EMA55 cross expanded beyond the ATR significance gate on a closed candle");
              event=emittedEvent;oppositeCross=emittedEvent;
            }else{
              crossTrack.phase="PENDING_CLOSE";this.crossByTf.set(tf,crossTrack);
              rejectionReason="cross-awaiting-closed-candle";
              event=makeEvent({tf,type:"CROSS",direction,state:"CONFIRMING",qualified:false,row,revision:n(revisions.formingRevision)||0,reason:"EMA9/EMA55 cross cleared the ATR significance gate and is waiting for the candle close",rejectionReason,now,raw:{...analysis,previousObservedGap:previous&&previous.gap,previousObservedSign:previousNonZeroSign,significance:separationSignificance([analysis.separation])}});
            }
          }else{
            rejectionReason="cross-separation-below-significance";
            event=makeEvent({tf,type:"CROSS",direction,state:"PENDING SIGNIFICANCE",qualified:false,row,revision:isClosedUpdate?n(revisions.closedRevision)||0:n(revisions.formingRevision)||0,reason:"EMA9/EMA55 cross is waiting for meaningful ATR-relative displacement",rejectionReason,now,raw:{...analysis,previousObservedGap:previous&&previous.gap,previousObservedSign:previousNonZeroSign,significance:separationSignificance([analysis.separation])}});
          }
        }else if(crossTrack&&crossTrack.phase==="PENDING_CLOSE"){
          this.crossByTf.delete(tf);
          rejectionReason="cross-did-not-close-across";
        }else if(sameSide&&contracting&&movingToward&&fastMovingToward&&analysis.separation<=S.projectedBandAtr&&Math.abs(gapVelocity)>=S.minFastSlopeAtr){
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

      }

      const rebuiltBounce=!crossed&&!event?rebuildBounceWindow(rows,fast,slow,S.bounceWindowBars):null;
      if(rebuiltBounce&&rebuiltBounce.candidate){
        const candidate=rebuiltBounce.candidate,candidateAnalysis=rebuiltBounce.analysis||analysis;
        rejectionReason=rebuiltBounce.reason;
        if(rebuiltBounce.qualified&&isClosedUpdate&&this.lastClosedByTf.get(tf)!==(n(row&&row.time)||0)){
          this.lastClosedByTf.set(tf,n(row&&row.time)||0);
          emittedEvent=makeEvent({tf,type:"BOUNCE",direction:candidate.direction,state:"CONFIRMED",qualified:true,row,revision:n(revisions.closedRevision)||0,reason:"Rolling EMA9/EMA55 window rebuilt a same-side contact and confirmed expansion away",now,raw:{...candidateAnalysis,closestSeparation:candidate.closestSeparation,closestCandleTime:candidate.closestCandleTime,contactSeen:true,bounceWindow:candidate,directionalSlowSlope:rebuiltBounce.qualification&&rebuiltBounce.qualification.directionalSlowSlope}});
          emittedEvent=rankEvent(tf,emittedEvent,candidateAnalysis,rows,candidate,null,this.lastActualCrossByTf.get(tf)||null);
          event=emittedEvent;
        }else{
          const phase=rebuiltBounce.qualified?"CONFIRMING":rebuiltBounce.phase;
          const candidateReason=bounceReasonText(rebuiltBounce.qualified?"bounce-awaiting-closed-candle":rebuiltBounce.reason);
          const candidateRejection=rebuiltBounce.qualified?"bounce-awaiting-closed-candle":rebuiltBounce.reason;
          rejectionReason=candidateRejection;
          bounceEvent=makeEvent({tf,type:"BOUNCE",direction:candidate.direction,state:phase,qualified:false,row,revision:n(revisions.formingRevision)||0,reason:candidateReason,rejectionReason:candidateRejection,now,raw:{...candidateAnalysis,closestSeparation:candidate.closestSeparation,closestCandleTime:candidate.closestCandleTime,contactSeen:candidate.contactSeen,bounceWindow:candidate}});
        }
      }

      if(!event){
        const bounceInsideApproach=!!(rebuiltBounce&&rebuiltBounce.candidate&&rebuiltBounce.candidate.closestSeparation<=S.approachAtr);
        event=bounceInsideApproach?(bounceEvent||projectedEvent||null):(projectedEvent||bounceEvent||null);
      }
      if(emittedEvent){event=emittedEvent;if(emittedEvent.eventType==="CROSS")oppositeCross=emittedEvent;}
      const observation={gap:analysis.gap,sign:currentSign,lastNonZeroSign:currentSign||previousNonZeroSign,separation:analysis.separation,observedAt:now,candleTime:n(row&&row.time)||0,formingRevision:n(revisions.formingRevision)||0,closedRevision:n(revisions.closedRevision)||0};
      this.liveGapByTf.set(tf,observation);
      const status=event?`${event.eventState} ${event.direction} ${event.eventType}`:`${direction||"FLAT"} EMA9/EMA55`;
      const bounceTrack=rebuiltBounce&&rebuiltBounce.candidate||null,crossTrack=this.crossByTf.get(tf)||null;
      this.recordDiagnostic(tf,{lastMarketUpdateAt:updateAt,closedRevision:observation.closedRevision,formingRevision:observation.formingRevision,reliable:true,reliableReason:"",ema9:analysis.f,ema55:analysis.s,currentGap:analysis.gap,previousObservedGap:previous&&previous.gap!=null?previous.gap:null,currentSign,previousSign:previousObservedSign,previousNonZeroSign,atr:analysis.atr,priorAtr:analysis.priorAtr,atrChange:analysis.atrChange,separationAtr:analysis.separation,crossTrack:clone(crossTrack),bounceTrack:clone(bounceTrack),bouncePhase:bounceTrack&&bounceTrack.phase||"NONE",emittedEvent:clone(emittedEvent),rankDiagnostics:clone(emittedEvent&&emittedEvent.rankDiagnostics||null),rejectionReason});
      return {ready:true,status,event,emittedEvent,oppositeCross,detection:event||noneDetection(tf,status,now),guide:price,analysis,diagnostics:this.diagnosticsByTf.get(tf),rejectionReason};
    }

  }

  root.Detector=Detector;
  root.detectorTools=Object.freeze({atr,atrTelemetry,analyze,analyzeAt,rebuildBounceWindow,makeEvent,fixedPeriods,rankLabel,pressureScore,separationSignificance,directionalAcceleration,atrConviction,bounceQualification,emaScore,rankEvent});
})();
