(() => {
  "use strict";

  function createSignalDetectorV2Core(S){
    if(!S)throw new Error("SCALP V2 signal configuration is required");
    const n=value=>{const out=Number(value);return Number.isFinite(out)?out:null;};
    const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
    const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
    const sign=value=>value>0?1:value<0?-1:0;
    const direction=value=>value>0?"LONG":value<0?"SHORT":null;
    const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
    const periods=()=>[S.emaFast,S.emaSlow,S.emaFast,S.emaSlow,S.emaFast];
    const closedRows=rows=>(Array.isArray(rows)?rows:[]).filter(row=>row&&row.final!==false);

    function atrTelemetry(rows,period=S.atrPeriod,lookback=S.atrTrajectoryLookbackBars){
      const source=closedRows(rows).slice(0,-1),ranges=[];
      for(let i=1;i<source.length;i++){
        const row=source[i],previous=source[i-1],high=n(row.high),low=n(row.low),previousClose=n(previous.close);
        if(high==null||low==null||previousClose==null)continue;
        ranges.push(Math.max(high-low,Math.abs(high-previousClose),Math.abs(low-previousClose)));
      }
      if(ranges.length<period)return {atr:null,priorAtr:null,atrChange:null};
      const series=[];let current=mean(ranges.slice(0,period));series.push(current);
      for(let i=period;i<ranges.length;i++){current=((period-1)*current+ranges[i])/period;series.push(current);}
      const priorAtr=series.length>lookback?series[series.length-1-lookback]:null;
      return {atr:current,priorAtr,atrChange:priorAtr>0?(current-priorAtr)/priorAtr:null};
    }

    function analyze(rows,fast,slow,index=rows.length-1){
      if(index<3)return null;
      const f=n(fast[index]),s=n(slow[index]),pf=n(fast[index-1]),ps=n(slow[index-1]),p2f=n(fast[index-2]),p2s=n(slow[index-2]);
      if([f,s,pf,ps,p2f,p2s].some(value=>value==null))return null;
      const volatility=atrTelemetry(rows.slice(0,index+1)),fastSlope=f-pf,previousFastSlope=pf-p2f;
      const atr=volatility.atr,normalize=value=>atr>0?value/atr:null;
      return {i:index,f,s,pf,ps,gap:f-s,previousGap:pf-ps,separation:Math.abs(f-s),separationAtr:normalize(Math.abs(f-s)),closedReferenceSeparation:Math.abs(pf-ps),fastSlope,fastSlopeAtr:normalize(fastSlope),previousFastSlope,previousFastSlopeAtr:normalize(previousFastSlope),fastAcceleration:fastSlope-previousFastSlope,fastAccelerationAtr:normalize(fastSlope-previousFastSlope),slowSlope:s-ps,slowSlopeAtr:normalize(s-ps),previousSlowSlope:ps-p2s,previousSlowSlopeAtr:normalize(ps-p2s),atr,priorAtr:volatility.priorAtr,atrChange:volatility.atrChange};
    }

    function pressureScore(rows,eventIndex,eventDirection){
      const event=rows[eventIndex],volume=n(event&&event.volume),buy=n(event&&event.takerBuyBase),open=n(event&&event.open),high=n(event&&event.high),low=n(event&&event.low),close=n(event&&event.close);
      if(!(volume>0)||buy==null||buy<0||buy>volume||[open,high,low,close].some(value=>value==null))return {available:false,reason:"pressure-input-unavailable"};
      const baseline=[];for(let i=eventIndex-1;i>=0&&baseline.length<S.pressureBaseline;i--){const value=n(rows[i]&&rows[i].volume);if(rows[i]&&rows[i].final!==false&&value>0)baseline.push(value);}
      if(baseline.length<S.pressureBaseline)return {available:false,reason:`pressure-baseline-${baseline.length}-of-${S.pressureBaseline}`};
      const relativeVolume=volume/mean(baseline),directionalShare=(eventDirection==="LONG"?buy:volume-buy)/volume,range=Math.max(high-low,Math.abs(close-open),Number.EPSILON),progress=clamp((eventDirection==="LONG"?close-open:open-close)/range,0,1),absorption=relativeVolume>=1.5&&progress<.18;
      return {available:true,score:Math.round(clamp(50+(directionalShare-.5)*100+clamp((relativeVolume-1)*10,-10,15)*(directionalShare>=.5?1:-1)+(progress-.15)*20- (absorption?45:0))),directionalVolumeShare:directionalShare,relativeVolume,pressureDirection:directionalShare>=.57?"ALIGNED":directionalShare<=.43?"OPPOSING":"BALANCED",absorption};
    }

    function slowContext(fast,slow,index,eventDirection,atrValue){
      const dir=eventDirection==="LONG"?1:-1,current=n(slow[index]),previous=n(slow[index-1]),currentSlope=current-previous;
      if(!(atrValue>0))return {mode:"ATR_UNAVAILABLE",score:null,wakeUp:null,maturity:null,age:0};
      if(!(dir*currentSlope>0))return {mode:"REVERSAL_UNSCORED",score:null,wakeUp:null,maturity:null,age:0};
      const start=Math.max(1,index-S.slowContextLookback+1),slopes=[];
      for(let i=start;i<=index;i++){const value=n(slow[i]),prior=n(slow[i-1]);if(value!=null&&prior!=null)slopes.push(value-prior);}
      let age=0;for(let i=slopes.length-1;i>=0&&dir*slopes[i]>0;i--)age++;
      const earlier=slopes[Math.max(0,slopes.length-1-Math.floor(S.slowContextLookback/2))]||0,currentSlopeAtr=currentSlope/atrValue,earlierSlopeAtr=earlier/atrValue,wakeUp=clamp(50+dir*(currentSlopeAtr-earlierSlopeAtr)/Math.max(S.slowWakeUpFullAtr,Number.EPSILON)*50),maturity=clamp(100*(1-(Math.max(1,age)-1)/S.slowContextLookback));
      return {mode:"SAME_DIRECTION",score:mean([wakeUp,maturity]),wakeUp,maturity,age,currentSlopeAtr,earlierSlopeAtr};
    }

    function ssscConviction(tf,eventDirection,getSnapshot,now=Date.now()){
      const requiredTf=tf==="15m"?"1h":"15m",snapshot=typeof getSnapshot==="function"?getSnapshot():null,eventAt=Date.parse(snapshot&&snapshot.event_at||"");
      if(!snapshot||!Number.isFinite(eventAt)||now-eventAt>S.ssscSnapshotMaxAgeMs)return {available:false,timeframe:requiredTf,multiplier:S.ssscUnavailableMultiplier,reason:"sssc-snapshot-unavailable-or-stale"};
      const read=snapshot.timeframes&&snapshot.timeframes[requiredTf],readDirection=n(read&&read.direction),momentum=n(read&&read.directionalAcceleration);
      if(!read||read.available!==true||readDirection==null||momentum==null||readDirection===0)return {available:false,timeframe:requiredTf,multiplier:S.ssscUnavailableMultiplier,reason:"sssc-timeframe-not-warmed"};
      const agrees=(eventDirection==="LONG"?1:-1)*readDirection>0,building=momentum>0;
      return {available:true,timeframe:requiredTf,direction:readDirection,directionalAcceleration:momentum,agrees,building,multiplier:agrees?(building?1:S.ssscAgreeDeceleratingMultiplier):S.ssscDisagreeMultiplier,reason:agrees?(building?"direction-agrees-momentum-building":"direction-agrees-momentum-decelerating"):"direction-disagrees"};
    }

    function cleanliness(analyses){
      const values=analyses.map(item=>item&&item.separationAtr).filter(value=>value!=null),scale=Math.max(S.approachBandAtr,Number.EPSILON);
      if(!values.length)return 0;
      const average=mean(values),dispersion=average>0?Math.sqrt(mean(values.map(value=>(value-average)**2)))/average:1;
      return clamp(100*Math.min(1,average/scale)/(1+dispersion));
    }

    function compressionState(rows,index,atrValue){
      const window=closedRows(rows).slice(Math.max(0,index-S.compressionLookbackBars+1),index+1),highs=window.map(row=>n(row.high)),lows=window.map(row=>n(row.low)),closes=window.map(row=>n(row.close));
      if(window.length<S.compressionLookbackBars||!(atrValue>0)||highs.some(value=>value==null)||lows.some(value=>value==null)||closes.some(value=>value==null))return {active:false,available:false,lookbackBars:S.compressionLookbackBars,rangeAtr:null,directionChanges:0,reason:"compression-input-unavailable"};
      let directionChanges=0,priorDirection=0;
      for(let i=1;i<closes.length;i++){const currentDirection=sign(closes[i]-closes[i-1]);if(currentDirection&&priorDirection&&currentDirection!==priorDirection)directionChanges++;if(currentDirection)priorDirection=currentDirection;}
      const rangeAtr=(Math.max(...highs)-Math.min(...lows))/atrValue,active=rangeAtr<=S.compressionRangeAtrThreshold&&directionChanges>=S.compressionMinDirectionChanges;
      return {active,available:true,lookbackBars:S.compressionLookbackBars,rangeAtr,directionChanges,rangeAtrThreshold:S.compressionRangeAtrThreshold,minDirectionChanges:S.compressionMinDirectionChanges,reason:active?"tight-oscillating-range":"range-not-compressed"};
    }

    function approachQuality(rows,analysis,eventDirection){
      const dir=eventDirection==="LONG"?1:-1,directionalSlope=dir*(analysis.fastSlopeAtr||0),directionalAcceleration=dir*(analysis.fastAccelerationAtr||0),value=Math.max(0,directionalSlope)+Math.max(0,directionalAcceleration),compression=compressionState(rows,analysis.i,analysis.atr),floor=S.approachQualityFloorAtr*(compression.active?S.compressionFloorRaiseMultiplier:1),wick=wickProtection(rows,analysis.i,analysis.atr),floorPassed=value>=floor&&!wick.protected,ceilingTier=value>=S.approachQualityCeilingAtr?"A":"B";
      return {floorPassed,ceilingTier,value,directionalSlopeAtr:directionalSlope,directionalAccelerationAtr:directionalAcceleration,floorThreshold:floor,baseFloorThreshold:S.approachQualityFloorAtr,ceilingThreshold:S.approachQualityCeilingAtr,wickIntegrityPassed:!wick.protected,compression:Object.freeze(compression),wickIntegrity:Object.freeze(wick),reason:wick.protected?"approach-invalidated-by-wick":value<floor?"approach-below-floor":"approach-floor-passed"};
    }

    function secondaryRating(sssc,pressure){
      const ssscScore=sssc.available?(sssc.agrees?(sssc.building?100:75):0):0,volumeRatio=pressure.available?pressure.relativeVolume:0,volumeScore=clamp(volumeRatio/Math.max(S.relativeVolumeWeakThreshold,Number.EPSILON)*60,0,100),weightTotal=S.secondarySsscWeight+S.secondaryVolumeWeight||1,score=Math.round((ssscScore*S.secondarySsscWeight+volumeScore*S.secondaryVolumeWeight)/weightTotal);
      return {score,ssscScore,volumeScore,relativeVolume:pressure.available?pressure.relativeVolume:null,ssscWeight:S.secondarySsscWeight,volumeWeight:S.secondaryVolumeWeight};
    }

    function scoreEvent(tf,event,analysis,rows,fast,slow,context={}){
      const dir=event.direction==="LONG"?1:-1,snap=clamp(Math.abs(analysis.fastAccelerationAtr||0)/Math.max(S.snapFullAtr,Number.EPSILON)*100);
      const followSlopes=(context.followAnalyses||[]).map(item=>Math.abs(item.fastSlopeAtr||0)),followThrough=clamp((mean(followSlopes)||Math.abs(analysis.fastSlopeAtr||0))/Math.max(S.followThroughFullAtr,Number.EPSILON)*100);
      const atrTrajectory=clamp(50+(analysis.atrChange||0)/Math.max(S.atrTrajectoryFullChange,Number.EPSILON)*50),engagement=analysis.atr>0?clamp((Math.abs(analysis.fastAccelerationAtr||0)+(mean(followSlopes)||Math.abs(analysis.fastSlopeAtr||0)))/Math.max(S.engagementFullAtr,Number.EPSILON)*100):50;
      const slowRead=slowContext(fast,slow,analysis.i,event.direction,analysis.atr),sssc=ssscConviction(tf,event.direction,context.getSsscSnapshot,context.now),wick=wickProtection(rows,analysis.i,analysis.atr),row=rows[analysis.i],price=n(row&&row.close),pricePosition=price==null||!(analysis.atr>0)?50:clamp(50+dir*((price-analysis.s)/analysis.atr)/Math.max(S.approachBandAtr,Number.EPSILON)*50);
      const geometry=event.eventType==="CROSS"
        ?{cleanliness:cleanliness(context.followAnalyses&&context.followAnalyses.length?context.followAnalyses:[analysis]),separationExpansion:clamp((analysis.separationAtr||0)/Math.max(S.approachBandAtr,Number.EPSILON)*100)*wick.multiplier,pricePosition}
        :{approachCloseness:clamp(100*(1-context.closestSeparationAtr/Math.max(S.approachBandAtr,Number.EPSILON))),rejectionExpansion:clamp(((analysis.separationAtr||0)-context.closestSeparationAtr)/Math.max(S.bounceExpansionAtr*2,Number.EPSILON)*100)*wick.multiplier,priceFollowThrough:pricePosition};
      const components={...geometry,snap:snap*wick.multiplier,followThrough:followThrough*wick.multiplier,engagement,atrTrajectory};
      if(slowRead.score!=null){components.ema55WakeUp=slowRead.wakeUp;components.ema55Maturity=slowRead.maturity;}
      const emaScore=Math.round(mean(Object.values(components))),pressure=pressureScore(rows,analysis.i,event.direction),approach=approachQuality(rows,analysis,event.direction),gapPassed=(analysis.separationAtr||0)>=S.crossMeaningfulGapAtr||event.eventType==="BOUNCE",whipsawPassed=context.whipsawPassed!==false,gates={passed:gapPassed&&whipsawPassed&&approach.floorPassed,gapSize:gapPassed,whipsawExclusion:whipsawPassed,approachQualityFloor:approach.floorPassed,failed:[...(!gapPassed?["gap-size"]:[]),...(!whipsawPassed?["whipsaw-exclusion"]:[]),...(!approach.floorPassed?[approach.reason]:[])]};
      if(!gates.passed){const ratingLayers=Object.freeze({gates:Object.freeze(gates),ceilingTier:approach.ceilingTier,weightedSecondaryScore:null});return Object.freeze({...event,qualified:false,rank:null,rankValue:null,rejectionReason:gates.failed.join(","),ratingLayers,rankDiagnostics:Object.freeze({profile:"V2",timeframe:tf,candleTime:event.candleTime,rankValue:null,emaScore,approachQuality:Object.freeze(approach),compression:approach.compression,wickIntegrity:approach.wickIntegrity,ratingLayers})});}
      const secondary=secondaryRating(sssc,pressure),rank=approach.ceilingTier==="A"?(secondary.score>=70?"A":secondary.score>=40?"B":"C"):(secondary.score>=40?"B":"C"),rankValue=rank==="A"?80+Math.round(secondary.score*.2):rank==="B"?60+Math.round(secondary.score*.19):Math.max(1,Math.round(secondary.score*.59)),ratingLayers=Object.freeze({gates:Object.freeze(gates),ceilingTier:approach.ceilingTier,weightedSecondaryScore:secondary.score});
      return Object.freeze({...event,rank,rankValue,emaScore,pressureScore:pressure.available?pressure.score:null,ratingLayers,rankDiagnostics:Object.freeze({profile:"V2",timeframe:tf,candleTime:event.candleTime,rankValue,emaScore,emaComponents:Object.freeze(components),pressureAvailable:pressure.available,pressureScore:pressure.available?pressure.score:null,pressure:Object.freeze({...pressure}),slowContext:Object.freeze(slowRead),sssc:Object.freeze(sssc),approachQuality:Object.freeze(approach),compression:approach.compression,wickIntegrity:approach.wickIntegrity,secondary:Object.freeze(secondary),ratingLayers})});
    }

    function wickProtection(rows,index,atrValue){
      const row=rows[index],open=n(row&&row.open),high=n(row&&row.high),low=n(row&&row.low),close=n(row&&row.close),range=high!=null&&low!=null?high-low:null,body=open!=null&&close!=null?Math.abs(close-open):null;
      const protectedCandle=range>0&&atrValue>0&&body/range<S.wickBodyRatioThreshold&&range/atrValue>=S.wickRangeAtrThreshold;
      return {protected:protectedCandle,bodyRatio:range>0?body/range:null,rangeAtr:atrValue>0&&range!=null?range/atrValue:null,multiplier:protectedCandle?S.wickScoreMultiplier:1};
    }

    function makeEvent(tf,type,eventDirection,row,now,raw={}){
      const candleTime=n(row&&row.time)||0;
      return {source:tf,eventId:[tf,type,eventDirection,candleTime,"V2"].join("|"),freshnessKey:[tf,type,eventDirection,candleTime].join("|"),eventType:type,direction:eventDirection,eventState:type==="BOUNCE"?"CONFIRMED":"LIVE",phase:type==="BOUNCE"?"CONFIRMED":"LIVE",qualified:true,projected:false,candleTime,publishedAt:now,reason:`V2 ATR-normalized ${type.toLowerCase()} qualified`,raw:Object.freeze({...raw})};
    }

    function bounceCandidate(rows,fast,slow){
      const end=rows.length-1,start=Math.max(3,end-S.bounceWindowBars+1),points=[];
      for(let i=start;i<=end;i++){const item=analyze(rows,fast,slow,i),side=item&&sign(item.gap);if(item&&side)points.push({analysis:item,side});}
      const current=points[points.length-1];if(!current||current.analysis.i!==end)return null;
      let suffix=points.length-1;while(suffix>0&&points[suffix-1].side===current.side&&points[suffix-1].analysis.i===points[suffix].analysis.i-1)suffix--;
      const same=points.slice(suffix);if(same.length<3)return null;
      let closest=0;for(let i=1;i<same.length;i++)if(same[i].analysis.separation<same[closest].analysis.separation)closest=i;
      if(closest===0||closest===same.length-1)return null;
      const touch=same[closest].analysis,separation=current.analysis.separation,dir=direction(current.side);
      if(!(touch.atr>0&&current.analysis.atr>0))return null;
      const approachedStrongly=same.slice(0,closest+1).some(point=>-current.side*(point.analysis.fastSlopeAtr||0)>=S.minFastSlopeAtr);
      if(!approachedStrongly||touch.separationAtr>S.observationBandAtr)return null;
      if(touch.separationAtr>S.approachBandAtr||touch.separationAtr>S.touchToleranceAtr)return null;
      if(current.analysis.separationAtr<touch.separationAtr+S.bounceExpansionAtr)return null;
      if((dir==="LONG"?1:-1)*(current.analysis.fastSlopeAtr||0)<=0)return null;
      return {direction:dir,analysis:current.analysis,closestSeparation:touch.separation,closestSeparationAtr:touch.separationAtr,touchCandleTime:n(rows[touch.i]&&rows[touch.i].time)||0,followAnalyses:same.slice(closest+1).map(item=>item.analysis)};
    }

    class Detector{
      constructor(options={}){this.getHub=typeof options.getHub==="function"?options.getHub:()=>null;this.getSsscSnapshot=typeof options.getSsscSnapshot==="function"?options.getSsscSnapshot:()=>null;this.pendingCrossByTf=new Map();this.lastCrossByTf=new Map();this.lastEmittedByTf=new Map();this.diagnosticsByTf=new Map();}
      reset(tf=null){if(tf){this.pendingCrossByTf.delete(tf);this.lastCrossByTf.delete(tf);this.lastEmittedByTf.delete(tf);this.diagnosticsByTf.delete(tf);}else{this.pendingCrossByTf.clear();this.lastCrossByTf.clear();this.lastEmittedByTf.clear();this.diagnosticsByTf.clear();}}
      diagnostics(){return {byTimeframe:Object.fromEntries([...this.diagnosticsByTf].map(([key,value])=>[key,clone(value)])),recent:[]};}
      expireNovelty(tf,analysis,rows){
        const prior=this.lastEmittedByTf.get(tf);if(!prior)return;
        const currentDirection=direction(sign(analysis&&analysis.gap));
        if(currentDirection&&currentDirection!==prior.direction){this.lastEmittedByTf.delete(tf);return;}
        if(prior.type==="BOUNCE"){
          const activeTouch=(Array.isArray(rows)?rows:[]).slice(-S.bounceWindowBars).some(row=>n(row&&row.time)===prior.anchorCandleTime);
          if(!activeTouch)this.lastEmittedByTf.delete(tf);
        }
      }
      novelEmission(tf,event,anchorCandleTime){
        if(!event)return null;
        const identity=[event.eventType,event.direction,n(anchorCandleTime)||0].join("|");
        const prior=this.lastEmittedByTf.get(tf);
        if(prior&&prior.identity===identity)return null;
        this.lastEmittedByTf.set(tf,{identity,type:event.eventType,direction:event.direction,anchorCandleTime:n(anchorCandleTime)||0,emittedCandleTime:n(event.candleTime)||0});
        return event;
      }
      evaluateTf(tf,update=null,now=Date.now()){
        const hub=this.getHub(),closed=!!(update&&update.type==="kline"&&update.tf===tf&&update.closed===true);
        if(!hub||typeof hub.getAuthoritativeMaSnapshot!=="function")return {ready:false,status:"V2 canonical EMA data unavailable",event:null,emittedEvent:null,detection:null};
        const snap=hub.getAuthoritativeMaSnapshot(tf,{includeForming:true,periods:periods(),requiredRows:S.minimumRows}),rows=snap&&snap.rows||[],fast=snap&&snap.alignedByPeriod&&snap.alignedByPeriod[S.emaFast]||[],slow=snap&&snap.alignedByPeriod&&snap.alignedByPeriod[S.emaSlow]||[],analysis=analyze(rows,fast,slow);
        if(!snap||!snap.reliable||!analysis)return {ready:false,status:snap&&snap.reason||"V2 EMA warming up",event:null,emittedEvent:null,detection:null};
        this.expireNovelty(tf,analysis,rows);
        let emittedEvent=null,event=null;
        if(closed){
          const pending=this.pendingCrossByTf.get(tf),currentTime=n(rows[analysis.i]&&rows[analysis.i].time)||0;
          if(pending&&currentTime>pending.candleTime){
            const stillSameSide=direction(sign(analysis.gap))===pending.direction,significant=(analysis.separationAtr||0)>=S.crossMeaningfulGapAtr,lastCross=this.lastCrossByTf.get(tf),intervalSeconds={"1m":60,"3m":180,"5m":300,"15m":900}[tf]||60,rapid=lastCross&&lastCross.direction!==pending.direction&&currentTime-lastCross.candleTime<=S.rapidReversalBars*intervalSeconds;
            if(stillSameSide&&significant&&!rapid){
              const base=makeEvent(tf,"CROSS",pending.direction,rows[analysis.i],now,{...analysis,crossAnchorCandleTime:pending.candleTime,crossMeaningfulGapAtr:S.crossMeaningfulGapAtr});
              const rated=scoreEvent(tf,base,analysis,rows,fast,slow,{followAnalyses:[analysis],getSsscSnapshot:this.getSsscSnapshot,now,whipsawPassed:!rapid});
              if(rated.qualified)emittedEvent=this.novelEmission(tf,rated,pending.candleTime);else event=rated;
              if(emittedEvent)this.lastCrossByTf.set(tf,{direction:pending.direction,candleTime:currentTime});
            }
            if(!stillSameSide||significant||rapid)this.pendingCrossByTf.delete(tf);
          }
          if(!emittedEvent&&sign(analysis.gap)&&sign(analysis.previousGap)&&sign(analysis.gap)!==sign(analysis.previousGap)){
            const eventDirection=direction(sign(analysis.gap));this.pendingCrossByTf.set(tf,{direction:eventDirection,candleTime:currentTime,analysis});
          }
          if(!emittedEvent){
            const bounce=bounceCandidate(rows,fast,slow);
            if(bounce){
              const base=makeEvent(tf,"BOUNCE",bounce.direction,rows[analysis.i],now,{...analysis,closestSeparation:bounce.closestSeparation,closestSeparationAtr:bounce.closestSeparationAtr});
              const rated=scoreEvent(tf,base,analysis,rows,fast,slow,{closestSeparationAtr:bounce.closestSeparationAtr,followAnalyses:bounce.followAnalyses,getSsscSnapshot:this.getSsscSnapshot,now});
              if(rated.qualified)emittedEvent=this.novelEmission(tf,rated,bounce.touchCandleTime);else event=rated;
            }
          }
        }
        event=emittedEvent||event;const status=event?`${event.eventState} ${event.direction} ${event.eventType}`:`V2 ${direction(sign(analysis.gap))||"FLAT"} EMA9/EMA55`;
        this.diagnosticsByTf.set(tf,{tf,profile:"V2",currentGap:analysis.gap,separationAtr:analysis.separationAtr,fastSlopeAtr:analysis.fastSlopeAtr,emittedEvent:clone(emittedEvent),lastEmittedSetup:clone(this.lastEmittedByTf.get(tf)||null)});
        return {ready:true,status,event,emittedEvent,oppositeCross:emittedEvent&&emittedEvent.eventType==="CROSS"?emittedEvent:null,detection:event,guide:n(rows[analysis.i]&&rows[analysis.i].close),analysis,diagnostics:this.diagnosticsByTf.get(tf)};
      }
    }

    return Object.freeze({Detector,detectorTools:Object.freeze({atrTelemetry,analyze,pressureScore,slowContext,ssscConviction,wickProtection,compressionState,approachQuality,secondaryRating,cleanliness,scoreEvent,bounceCandidate})});
  }

  const api=Object.freeze({createSignalDetectorV2Core});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SCALP_SIGNAL_DETECTOR_V2_CORE=api;
})();
