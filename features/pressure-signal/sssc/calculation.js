(() => {
  "use strict";

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  const last=series=>series&&series.length?series[series.length-1].value:null;
  const previous=(series,offset=8)=>series&&series.length>offset?series[series.length-1-offset].value:null;
  const freeze=value=>{
    if(!value||typeof value!=="object"||Object.isFrozen(value))return value;
    Object.freeze(value);Object.values(value).forEach(freeze);return value;
  };
  const TIMEFRAME_ROLES=freeze({
    "1d":{label:"1D",role:"regime"},"4h":{label:"4H",role:"regime"},"1h":{label:"1H",role:"structure"},
    "15m":{label:"15M",role:"bridge"},"5m":{label:"5M",role:"execution"},"3m":{label:"3M",role:"trigger"},"1m":{label:"1M",role:"trigger"}
  });
  const ROLE_ORDER=freeze(["regime","structure","bridge","execution","trigger"]);
  const SSSC_ATR_PERIOD=12;
  const INTERVAL_MS=freeze({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000});
  const MAX_SAMPLE_GAP_MULTIPLIER=1.5;
  const NORMALIZED_MEANINGFUL_GAP=.10;
  const NORMALIZATION_EPSILON=1e-10;
  const intervalMs=interval=>INTERVAL_MS[String(interval||"").toLowerCase()]||null;
  const timestampMs=value=>{
    const parsed=Number(value);
    if(!Number.isFinite(parsed))return null;
    return Math.abs(parsed)>=1e12?parsed:parsed*1000;
  };
  const isNearZero=(value,scale=1)=>!Number.isFinite(Number(value))||Math.abs(Number(value))<=Math.max(Math.abs(Number(scale)||1)*NORMALIZATION_EPSILON,NORMALIZATION_EPSILON);
  function ema(rows,period){
    const out=[];if(!Array.isArray(rows)||rows.length<period)return out;
    const alpha=2/(period+1);
    let current=rows.slice(0,period).reduce((sum,row)=>sum+Number(row.close),0)/period;
    out.push({time:rows[period-1].time,value:current});
    for(let i=period;i<rows.length;i++){current=Number(rows[i].close)*alpha+current*(1-alpha);out.push({time:rows[i].time,value:current});}
    return out;
  }
  function finalizedRows(rows){
    return (Array.isArray(rows)?rows:[])
      .filter(row=>row&&row.final!==false&&timestampMs(row.time)!=null)
      .map(row=>({...row}))
      .sort((a,b)=>timestampMs(a.time)-timestampMs(b.time));
  }
  function trueRange(row,previousClose){
    const high=number(row&&row.high),low=number(row&&row.low),prior=number(previousClose);
    if(high==null||low==null||prior==null)return null;
    return Math.max(high-low,Math.abs(high-prior),Math.abs(low-prior));
  }
  function atrSeries(rows,period=SSSC_ATR_PERIOD){
    const source=finalizedRows(rows),ranges=[];
    for(let index=1;index<source.length;index++){
      const range=trueRange(source[index],source[index-1].close);
      if(range==null)return [];
      ranges.push({time:source[index].time,value:range});
    }
    if(ranges.length<period)return [];
    const out=[];
    let current=ranges.slice(0,period).reduce((sum,item)=>sum+item.value,0)/period;
    out.push({time:ranges[period-1].time,value:current});
    for(let index=period;index<ranges.length;index++){
      current=((period-1)*current+ranges[index].value)/period;
      out.push({time:ranges[index].time,value:current});
    }
    return out;
  }
  function pointAtTime(series,targetTimeMs,sampleIntervalMs){
    if(!Array.isArray(series)||!series.length||!Number.isFinite(targetTimeMs)||!Number.isFinite(sampleIntervalMs))return null;
    let low=0,high=series.length-1;
    while(low<=high){
      const middle=(low+high)>>1,time=timestampMs(series[middle].time);
      if(time===targetTimeMs)return {value:number(series[middle].value),timeMs:time,targetTimeMs,interpolated:false};
      if(time<targetTimeMs)low=middle+1;else high=middle-1;
    }
    const before=series[high],after=series[low];
    if(!before||!after)return null;
    const beforeMs=timestampMs(before.time),afterMs=timestampMs(after.time),gapMs=afterMs-beforeMs;
    if(!(gapMs>0)||gapMs>sampleIntervalMs*MAX_SAMPLE_GAP_MULTIPLIER)return null;
    const beforeValue=number(before.value),afterValue=number(after.value);
    if(beforeValue==null||afterValue==null)return null;
    const ratio=(targetTimeMs-beforeMs)/gapMs;
    return {value:beforeValue+(afterValue-beforeValue)*ratio,timeMs:targetTimeMs,targetTimeMs,interpolated:true,bracket:[beforeMs,afterMs]};
  }
  function closeSeries(rows){
    return finalizedRows(rows).map(row=>({time:row.time,value:number(row.close)})).filter(point=>point.value!=null);
  }
  function realizedVolatility(rows,startTimeMs,endTimeMs,sampleIntervalMs){
    const series=closeSeries(rows),start=pointAtTime(series,startTimeMs,sampleIntervalMs),end=pointAtTime(series,endTimeMs,sampleIntervalMs);
    if(!start||!end||endTimeMs<=startTimeMs)return {available:false,reason:"elapsed-history-unavailable",startTimeMs,endTimeMs};
    const points=[{timeMs:startTimeMs,value:start.value}];
    for(const point of series){
      const time=timestampMs(point.time);
      if(time>startTimeMs&&time<endTimeMs)points.push({timeMs:time,value:point.value});
    }
    points.push({timeMs:endTimeMs,value:end.value});
    let sumSquares=0;
    for(let index=1;index<points.length;index++){
      const previousPoint=points[index-1],currentPoint=points[index];
      if(currentPoint.timeMs-previousPoint.timeMs>sampleIntervalMs*MAX_SAMPLE_GAP_MULTIPLIER)return {available:false,reason:"elapsed-history-gap",startTimeMs,endTimeMs};
      if(!(previousPoint.value>0)||!(currentPoint.value>0))return {available:false,reason:"nonpositive-close",startTimeMs,endTimeMs};
      const value=Math.log(currentPoint.value/previousPoint.value);
      sumSquares+=value*value;
    }
    const value=Math.sqrt(sumSquares);
    if(isNearZero(value))return {available:false,reason:"realized-volatility-near-zero",startTimeMs,endTimeMs,value};
    return {available:true,value,priceVolatility:end.value*value,startTimeMs,endTimeMs,samples:points.length-1};
  }
  function buildNormalization(rows,interval,price){
    const duration=intervalMs(interval),evaluationTimeMs=timestampMs(rows&&rows.at(-1)?.time),closed=finalizedRows(rows);
    const volatilityEndTimeMs=timestampMs(closed.at(-1)?.time),horizonMs=duration==null?null:duration*8,staleAfterMs=duration==null?null:duration*24;
    const atrValues=atrSeries(closed,SSSC_ATR_PERIOD),atr=number(atrValues.at(-1)?.value);
    const atrAvailable=duration!=null&&atr!=null&&!isNearZero(atr,price);
    const recent=duration==null||volatilityEndTimeMs==null?{available:false,reason:"elapsed-history-unavailable"}:realizedVolatility(closed,volatilityEndTimeMs-horizonMs,volatilityEndTimeMs,duration);
    const prior=duration==null||volatilityEndTimeMs==null?{available:false,reason:"elapsed-history-unavailable"}:realizedVolatility(closed,volatilityEndTimeMs-horizonMs*2,volatilityEndTimeMs-horizonMs,duration);
    const atrAtHorizon=evaluationTimeMs==null||horizonMs==null?null:pointAtTime(atrValues,evaluationTimeMs-horizonMs,duration);
    const unavailable=[];
    if(duration==null)unavailable.push("interval");
    if(!atrAvailable)unavailable.push(atr==null?"atr-unavailable":"atr-near-zero");
    if(!recent.available)unavailable.push("rv-recent-"+recent.reason);
    if(!prior.available)unavailable.push("rv-prior-"+prior.reason);
    if(!atrAtHorizon||isNearZero(atrAtHorizon.value,price))unavailable.push("atr-horizon-unavailable");
    const RV=freeze({
      recent:recent.available?recent.value:null,prior:prior.available?prior.value:null,
      recentPriceVolatility:recent.available?recent.priceVolatility:null,priorPriceVolatility:prior.available?prior.priceVolatility:null,
      recentWindow:freeze({startTimeMs:recent.startTimeMs??null,endTimeMs:recent.endTimeMs??null,samples:recent.samples??0,status:recent.available?"available":recent.reason}),
      priorWindow:freeze({startTimeMs:prior.startTimeMs??null,endTimeMs:prior.endTimeMs??null,samples:prior.samples??0,status:prior.available?"available":prior.reason})
    });
    return {
      status:unavailable.length?"unavailable":"available",unavailable,atrPeriod:SSSC_ATR_PERIOD,atr:atrAvailable?atr:null,
      atrInBps:atrAvailable&&price?atr/price*10000:null,atrSeries:atrValues,atrAtHorizon:atrAtHorizon&&number(atrAtHorizon.value),
      RV,intervalMs:duration,evaluationTimeMs,volatilityEndTimeMs,horizonMs,staleAfterMs,
      resolvedElapsedHorizons:freeze({slopeMs:horizonMs,spreadPowerMs:horizonMs,crossoverStaleMs:staleAfterMs,evaluationTimeMs,volatilityEndTimeMs})
    };
  }
  function separationMetrics(values,atr){
    if(!Array.isArray(values)||values.length<2||isNearZero(atr))return {available:false,reason:"normalization-unavailable",spreads:[],average:null,minimum:null,dispersion:null,uniformity:null,significance:null,compressionFactor:null};
    const spreads=[];for(let i=0;i<values.length-1;i++)spreads.push(Math.abs(values[i]-values[i+1])/atr);
    const average=spreads.length?spreads.reduce((a,b)=>a+b,0)/spreads.length:0;
    const minimum=spreads.length?Math.min(...spreads):0;
    const variance=spreads.length?spreads.reduce((sum,value)=>sum+(value-average)**2,0)/spreads.length:0;
    const dispersion=average>0?Math.sqrt(variance)/average:1;
    const averageSignificance=clamp(average/NORMALIZED_MEANINGFUL_GAP,0,1);
    const minimumSignificance=clamp(minimum/NORMALIZED_MEANINGFUL_GAP,0,1);
    const uniformity=clamp(1/(1+dispersion),0,1);
    const significance=clamp(Math.min(averageSignificance,minimumSignificance)*uniformity,0,1);
    return {available:true,spreads,average,minimum,dispersion,uniformity,significance,compressionFactor:significance,meaningfulGap:NORMALIZED_MEANINGFUL_GAP,unit:"atr"};
  }
  function rawStackDirection(values){let bull=0,bear=0;for(let i=0;i<values.length-1;i++){if(values[i]>values[i+1])bull++;else if(values[i]<values[i+1])bear++;}return (bull-bear)/Math.max(1,values.length-1)*100;}
  function stackDirection(values,atr){const metrics=separationMetrics(values,atr);return metrics.available?rawStackDirection(values)*metrics.significance:null;}
  function stackClean(values,atr){const metrics=separationMetrics(values,atr);return metrics.available?clamp(metrics.average/.50*100,0,100):null;}
  function slopeScore(series,context){
    const latest=series&&series.at(-1),nowMs=timestampMs(latest&&latest.time),target=nowMs==null?null:pointAtTime(series,nowMs-context.horizonMs,context.intervalMs);
    if(!latest||!target||!context.RV.recentPriceVolatility||isNearZero(context.RV.recentPriceVolatility,latest.value))return null;
    return clamp((latest.value-target.value)/context.RV.recentPriceVolatility*100,-100,100);
  }
  function slopePower(series,context){
    const latest=series&&series.at(-1),nowMs=timestampMs(latest&&latest.time);
    const recentAnchor=nowMs==null?null:pointAtTime(series,nowMs-context.horizonMs,context.intervalMs);
    const priorAnchor=nowMs==null?null:pointAtTime(series,nowMs-context.horizonMs*2,context.intervalMs);
    if(!latest||!recentAnchor||!priorAnchor||!context.RV.recentPriceVolatility||!context.RV.priorPriceVolatility)return null;
    const recent=Math.abs(latest.value-recentAnchor.value)/context.RV.recentPriceVolatility;
    const prior=Math.abs(recentAnchor.value-priorAnchor.value)/context.RV.priorPriceVolatility;
    return clamp((recent-prior)*100,-100,100);
  }
  function signedSlopeAcceleration(series,context){
    const latest=series&&series.at(-1),nowMs=timestampMs(latest&&latest.time);
    const recentAnchor=nowMs==null?null:pointAtTime(series,nowMs-context.horizonMs,context.intervalMs);
    const priorAnchor=nowMs==null?null:pointAtTime(series,nowMs-context.horizonMs*2,context.intervalMs);
    if(!latest||!recentAnchor||!priorAnchor||!context.RV.recentPriceVolatility||!context.RV.priorPriceVolatility)return null;
    const recentVelocity=(latest.value-recentAnchor.value)/context.RV.recentPriceVolatility;
    const priorVelocity=(recentAnchor.value-priorAnchor.value)/context.RV.priorPriceVolatility;
    return clamp((recentVelocity-priorVelocity)*100,-100,100);
  }
  function spreadDir(values,atr){
    if(!Array.isArray(values)||values.length<2||isNearZero(atr))return null;
    let sum=0,pairs=0;for(let i=0;i<values.length-1;i++){const a=Number(values[i]),b=Number(values[i+1]);if(Number.isFinite(a)&&Number.isFinite(b)){sum+=clamp((a-b)/(.50*atr)*100,-100,100);pairs++;}}
    return pairs?clamp(sum/pairs,-100,100):null;
  }
  function spreadPower(seriesBySlot,slots,context){
    if(isNearZero(context.atr)||isNearZero(context.atrAtHorizon))return null;
    let sum=0,count=0;
    for(let i=0;i<slots.length-1;i++){
      const fast=seriesBySlot[slots[i].slotId],slow=seriesBySlot[slots[i+1].slotId],fastLatest=fast&&fast.at(-1),slowLatest=slow&&slow.at(-1);
      const nowMs=timestampMs(fastLatest&&fastLatest.time),targetMs=nowMs==null?null:nowMs-context.horizonMs;
      const fastPrior=targetMs==null?null:pointAtTime(fast,targetMs,context.intervalMs),slowPrior=targetMs==null?null:pointAtTime(slow,targetMs,context.intervalMs);
      if(fastLatest&&slowLatest&&fastPrior&&slowPrior){
        const currentGap=Math.abs(fastLatest.value-slowLatest.value)/context.atr;
        const priorGap=Math.abs(fastPrior.value-slowPrior.value)/context.atrAtHorizon;
        sum+=clamp((currentGap-priorGap)/.50*100,-100,100);count++;
      }
    }
    return count===slots.length-1?sum/count:null;
  }
  function signedSpreadAcceleration(seriesBySlot,slots,context){
    if(isNearZero(context.atr)||isNearZero(context.atrAtHorizon))return null;
    let sum=0,count=0;
    for(let i=0;i<slots.length-1;i++){
      const fast=seriesBySlot[slots[i].slotId],slow=seriesBySlot[slots[i+1].slotId],fastLatest=fast&&fast.at(-1),slowLatest=slow&&slow.at(-1);
      const nowMs=timestampMs(fastLatest&&fastLatest.time),targetMs=nowMs==null?null:nowMs-context.horizonMs;
      const fastPrior=targetMs==null?null:pointAtTime(fast,targetMs,context.intervalMs),slowPrior=targetMs==null?null:pointAtTime(slow,targetMs,context.intervalMs);
      if(fastLatest&&slowLatest&&fastPrior&&slowPrior){
        const currentSignedGap=(fastLatest.value-slowLatest.value)/context.atr;
        const priorSignedGap=(fastPrior.value-slowPrior.value)/context.atrAtHorizon;
        sum+=clamp((currentSignedGap-priorSignedGap)/.50*100,-100,100);count++;
      }
    }
    return count===slots.length-1?sum/count:null;
  }
  function crossState(fast,slow,context={}){
    const length=Math.min(fast&&fast.length||0,slow&&slow.length||0),none={label:"None",ageMs:null,crossTime:null,dir:0,quality:0,forming:false};
    if(length<3||!context.intervalMs||!context.staleAfterMs)return {...none,normalizationStatus:"unavailable"};
    const fastValues=fast.slice(-length),slowValues=slow.slice(-length),fa=fastValues.at(-1).value,sa=slowValues.at(-1).value,dist=fa-sa;
    const nowMs=timestampMs(fastValues.at(-1).time);let lastCross=null;
    for(let i=1;i<length;i++){
      const a0=fastValues[i-1].value-slowValues[i-1].value,a1=fastValues[i].value-slowValues[i].value,dir=a0<=0&&a1>0?1:a0>=0&&a1<0?-1:0;
      if(dir){
        const priorTimeMs=timestampMs(fastValues[i-1].time),crossTime=timestampMs(fastValues[i].time),gapMs=crossTime-priorTimeMs;
        lastCross={dir,crossTime,priorTimeMs,gapMs,timingAvailable:gapMs>0&&gapMs<=context.intervalMs*MAX_SAMPLE_GAP_MULTIPLIER,index:i};
      }
    }
    if(lastCross&&lastCross.index===length-1){
      if(!lastCross.timingAvailable)return {label:(lastCross.dir>0?"Bull":"Bear")+" X Timing Unavailable",ageMs:null,crossTime:null,dir:lastCross.dir,quality:0,forming:false,normalizationStatus:"unavailable",reason:"crossover-data-gap"};
      return {label:(lastCross.dir>0?"Bull":"Bear")+" X Fresh",ageMs:0,crossTime:lastCross.crossTime,dir:lastCross.dir,quality:85,forming:false,staleAfterMs:context.staleAfterMs,normalizationStatus:"available"};
    }
    if(!isNearZero(context.atr)&&Math.abs(dist)/context.atr<=.10)return {label:(dist>=0?"Bull":"Bear")+" forming",ageMs:null,crossTime:null,dir:dist>=0?1:-1,quality:35,forming:true,staleAfterMs:context.staleAfterMs,normalizedDistance:Math.abs(dist)/context.atr,normalizationStatus:"available"};
    if(lastCross){
      if(!lastCross.timingAvailable||nowMs==null)return {label:(lastCross.dir>0?"Bull":"Bear")+" X Timing Unavailable",ageMs:null,crossTime:null,dir:lastCross.dir,quality:0,forming:false,normalizationStatus:"unavailable",reason:"crossover-data-gap"};
      const ageMs=Math.max(0,nowMs-lastCross.crossTime),stale=ageMs>context.staleAfterMs;
      return {label:(lastCross.dir>0?"Bull X ":"Bear X ")+(stale?"Old":"Confirmed"),ageMs,crossTime:lastCross.crossTime,dir:lastCross.dir,quality:stale?25:60,forming:false,staleAfterMs:context.staleAfterMs,normalizationStatus:"available"};
    }
    return {...none,staleAfterMs:context.staleAfterMs,normalizationStatus:isNearZero(context.atr)?"unavailable":"available"};
  }
  function crossWeight(cross,staleAfterMs=cross&&cross.staleAfterMs){
    if(!cross||!cross.dir)return 0;
    const quality=clamp(Number(cross.quality)/100,0,1);
    const ageMs=Number(cross.ageMs);
    const ageDecay=Number.isFinite(ageMs)&&Number(staleAfterMs)>0?clamp(1-ageMs/Number(staleAfterMs),0,1):cross.forming?1:cross.ageMs==null&&cross.quality===0?0:1;
    return quality*ageDecay;
  }
  function eventForLevel(price,emaValue,atr){if(price==null||emaValue==null||isNearZero(atr))return "Normalization unavailable";const distance=Math.abs(price-emaValue)/atr;if(distance<=.25)return "Near";return price>emaValue?"Above":"Below";}
  function clusterState(values,atr){if(!Array.isArray(values)||!values.length||isNearZero(atr))return "Normalization unavailable";const spread=(Math.max(...values)-Math.min(...values))/atr;return spread<.50?"Tight":spread<1.25?"Moderate Separation":"Wide Separation";}
  function phaseLabel({compressionFactor,directionalStrength,direction,acceleration}){
    const strengthAgrees=direction!==0&&directionalStrength!==0&&Math.sign(direction)===Math.sign(directionalStrength);
    if(compressionFactor<.5)return "Compressed";
    if(Math.abs(directionalStrength)>35&&strengthAgrees)return direction>0?"Bullish Trend / Expansion":"Bearish Trend / Expansion";
    if(acceleration< -25)return "Trend Decelerating";
    if(Math.abs(direction)<25)return "Directionally Mixed";
    return "Transition";
  }
  function deriveEarlyWarning(confirmed,live){
    if(!confirmed?.available||!live?.available)return null;const hints=[];
    if(live.crosses&&Object.values(live.crosses).some(cross=>cross?.forming))hints.push("Unconfirmed cross forming");
    if(live.events&&confirmed.events&&live.events.vwap!==confirmed.events.vwap)hints.push("Unconfirmed VWAP "+live.events.vwap);
    if(Number(live.compressionFactor)>=.50&&Number(confirmed.compressionFactor)<.50)hints.push("Unconfirmed compression break");
    if(String(live.phase||"")!==String(confirmed.phase||""))hints.push("Unconfirmed "+(live.phase||"phase shift"));
    if(Math.abs(Number(live.directionalStrength))<Math.abs(Number(confirmed.directionalStrength))-10)hints.push("Unconfirmed strength weakening");
    if(!hints.length&&Math.sign(Number(live.direction)||0)!==Math.sign(Number(confirmed.direction)||0))hints.push("Unconfirmed transition");
    return hints.length?freeze({label:hints[0],trial:live}):null;
  }
  function calculateTimeframe({label,interval,rows,slots,minimumRows=1,fullRows=1}){
    const fixedRows=Array.isArray(rows)?rows.map(row=>({...row})):[],normalizedSlots=Array.isArray(slots)?slots.map(slot=>({...slot})):[];
    if(normalizedSlots.length!==5)return freeze({tf:label,interval,available:false,reason:"ma-slots-unavailable"});
    if(fixedRows.length<minimumRows)return freeze({tf:label,interval,available:false,reason:"warmup-limited",rows:fixedRows.length,reliability:"insufficient-warmup",warmupLimited:true});
    const seriesBySlot={};for(const slot of normalizedSlots)seriesBySlot[slot.slotId]=ema(fixedRows,slot.period);
    const values=normalizedSlots.map(slot=>last(seriesBySlot[slot.slotId]));
    if(values.some(value=>value==null))return freeze({tf:label,interval,available:false,reason:"warmup-limited",rows:fixedRows.length,reliability:"insufficient-warmup",warmupLimited:true});
    const price=number(fixedRows.at(-1)?.close),normalization=buildNormalization(fixedRows,interval,price);
    if(normalization.status!=="available"){
      const telemetry=freeze({status:"unavailable",unavailable:normalization.unavailable,atrPeriod:SSSC_ATR_PERIOD,atr:normalization.atr,atrInBps:normalization.atrInBps,RV:normalization.RV,resolvedElapsedHorizons:normalization.resolvedElapsedHorizons});
      return freeze({tf:label,interval,available:false,reason:"normalization-unavailable",rows:fixedRows.length,reliability:"normalization-unavailable",warmupLimited:false,normalization:telemetry,atr:telemetry.atr,atrInBps:telemetry.atrInBps,RV:telemetry.RV,resolvedElapsedHorizons:telemetry.resolvedElapsedHorizons});
    }
    const context={atr:normalization.atr,atrAtHorizon:normalization.atrAtHorizon,RV:normalization.RV,intervalMs:normalization.intervalMs,horizonMs:normalization.horizonMs,staleAfterMs:normalization.staleAfterMs};
    const separation=separationMetrics(values,normalization.atr),stackDir=stackDirection(values,normalization.atr),clean=stackClean(values,normalization.atr);
    const slopeScores={MA2:slopeScore(seriesBySlot.MA2,context),MA3:slopeScore(seriesBySlot.MA3,context),MA4:slopeScore(seriesBySlot.MA4,context)};
    if(Object.values(slopeScores).some(value=>value==null))return freeze({tf:label,interval,available:false,reason:"normalization-unavailable",rows:fixedRows.length,reliability:"normalization-unavailable",warmupLimited:false,normalization:freeze({status:"unavailable",unavailable:["slope-anchor-unavailable"],atr:normalization.atr,atrInBps:normalization.atrInBps,RV:normalization.RV,resolvedElapsedHorizons:normalization.resolvedElapsedHorizons})});
    const slopeDir=.45*slopeScores.MA2+.35*slopeScores.MA3+.20*slopeScores.MA4;
    const sprDir=spreadDir(values,normalization.atr),crossContext={atr:normalization.atr,intervalMs:normalization.intervalMs,staleAfterMs:normalization.staleAfterMs};
    const c12=crossState(seriesBySlot.MA1,seriesBySlot.MA2,crossContext),c23=crossState(seriesBySlot.MA2,seriesBySlot.MA3,crossContext),c34=crossState(seriesBySlot.MA3,seriesBySlot.MA4,crossContext),c45=crossState(seriesBySlot.MA4,seriesBySlot.MA5,crossContext);
    const crossoverWeight=crossWeight(c12),crossoverContribution=c12.dir*6*crossoverWeight;
    const direction=clamp(stackDir*.44+slopeDir*.30+sprDir*.20+crossoverContribution,-100,100);
    const slopePowers={MA2:slopePower(seriesBySlot.MA2,context),MA3:slopePower(seriesBySlot.MA3,context),MA4:slopePower(seriesBySlot.MA4,context)};
    const signedSlopeAccelerations={MA2:signedSlopeAcceleration(seriesBySlot.MA2,context),MA3:signedSlopeAcceleration(seriesBySlot.MA3,context),MA4:signedSlopeAcceleration(seriesBySlot.MA4,context)};
    const sprPow=spreadPower(seriesBySlot,normalizedSlots,context),signedSprAcceleration=signedSpreadAcceleration(seriesBySlot,normalizedSlots,context);
    if(Object.values(slopePowers).some(value=>value==null)||Object.values(signedSlopeAccelerations).some(value=>value==null)||sprPow==null||signedSprAcceleration==null)return freeze({tf:label,interval,available:false,reason:"normalization-unavailable",rows:fixedRows.length,reliability:"normalization-unavailable",warmupLimited:false,normalization:freeze({status:"unavailable",unavailable:["power-anchor-unavailable"],atr:normalization.atr,atrInBps:normalization.atrInBps,RV:normalization.RV,resolvedElapsedHorizons:normalization.resolvedElapsedHorizons})});
    const slopePow=.55*slopePowers.MA2+.30*slopePowers.MA3+.15*slopePowers.MA4;
    const signedSlopeAccelerationValue=.55*signedSlopeAccelerations.MA2+.30*signedSlopeAccelerations.MA3+.15*signedSlopeAccelerations.MA4;
    const expansionContraction=clamp(slopePow*.52+sprPow*.42,-100,100),acceleration=expansionContraction;
    const rawStrength=clamp(slopeDir*.52+sprDir*.42,-100,100);
    const compressionPenalty=18*(1-separation.compressionFactor);
    const directionalStrength=Math.sign(rawStrength)*Math.max(0,Math.abs(rawStrength)-compressionPenalty);
    const signedAcceleration=clamp(signedSlopeAccelerationValue*.52+signedSprAcceleration*.42,-100,100);
    const directionalAcceleration=clamp(Math.sign(direction)*signedAcceleration,-100,100);
    const state=direction>55?"Bullish":direction>18?"Mixed Bullish":direction<-55?"Bearish":direction<-18?"Mixed Bearish":"Mixed";
    const phase=phaseLabel({compressionFactor:separation.compressionFactor,directionalStrength,direction,acceleration:expansionContraction});
    const strengthState=directionalStrength>35?"Bullish Strength":directionalStrength>10?"Strong Bullish":directionalStrength<-35?"Bearish Strength":directionalStrength<-10?"Strong Bearish":"Neutral";
    const accelerationState=expansionContraction>35?"Strong Expansion":expansionContraction>10?"Mild Expansion":expansionContraction<-35?"Strong Contraction":expansionContraction<-10?"Mild Contraction":"Stable";
    const priceToEma=values.map(value=>Math.abs(price-value)/normalization.atr),clusterSpan=(Math.max(...values)-Math.min(...values))/normalization.atr;
    const normalizedDistances=freeze({adjacentGaps:separation.spreads.slice(),averageAdjacentGap:separation.average,minimumAdjacentGap:separation.minimum,priceToEma,clusterSpan,unit:"atr"});
    const telemetry=freeze({status:"available",unavailable:[],atrPeriod:SSSC_ATR_PERIOD,atr:normalization.atr,atrInBps:normalization.atrInBps,RV:normalization.RV,normalizedDistances,resolvedElapsedHorizons:normalization.resolvedElapsedHorizons});
    const events={x12:c12.label,x23:c23.label,x34:c34.label,x45:c45.label,ma1:eventForLevel(price,values[0],normalization.atr),ma2:eventForLevel(price,values[1],normalization.atr),ma3:eventForLevel(price,values[2],normalization.atr),cluster:clusterState(values,normalization.atr)};
    return freeze({tf:label,interval,available:true,rows:fixedRows.length,price,emasBySlot:seriesBySlot,emaVals:values,direction,directionalStrength,acceleration,expansionContraction,signedAcceleration,directionalAcceleration,state,phase,strengthState,accelerationState,stackDir,clean,separation,compressionFactor:separation.compressionFactor,compressionPenalty,rawStrength,slopeDir,sprDir,slopePow,sprPow,signedSlopeAcceleration:signedSlopeAccelerationValue,signedSpreadAcceleration:signedSprAcceleration,crossoverWeight,crossoverContribution,crosses:{c12,c23,c34,c45},slots:normalizedSlots,periods:normalizedSlots.map(slot=>slot.period),pairs:[[normalizedSlots[0],normalizedSlots[1]],[normalizedSlots[1],normalizedSlots[2]],[normalizedSlots[2],normalizedSlots[3]],[normalizedSlots[3],normalizedSlots[4]]],events,reliability:fixedRows.length>=fullRows?"full-warmup":"minimum-warmup",warmupLimited:false,normalization:telemetry,atr:telemetry.atr,atrInBps:telemetry.atrInBps,RV:telemetry.RV,normalizedDistances,resolvedElapsedHorizons:telemetry.resolvedElapsedHorizons});
  }
  function timeframeInterval(item){
    const interval=String(item&&item.interval||"").toLowerCase();
    if(TIMEFRAME_ROLES[interval])return interval;
    const label=String(item&&item.tf||"").toUpperCase();
    return Object.keys(TIMEFRAME_ROLES).find(key=>TIMEFRAME_ROLES[key].label===label)||"";
  }
  function metricValue(item,key){
    const value=item&&item[key];
    if(value===null||value===undefined||value==="")return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  }
  function averageValues(values){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
  function aggregate(diagnostics){
    const items=Array.isArray(diagnostics)?diagnostics:[],known=items.map(item=>({item,interval:timeframeInterval(item)})).filter(entry=>entry.interval);
    const available=known.filter(entry=>entry.item?.available);
    const roleSummaries={};
    for(const role of ROLE_ORDER){
      const expectedIntervals=Object.keys(TIMEFRAME_ROLES).filter(interval=>TIMEFRAME_ROLES[interval].role===role);
      const entries=available.filter(entry=>TIMEFRAME_ROLES[entry.interval].role===role);
      const metrics={};
      const metricCoverage={};
      for(const key of ["direction","directionalStrength","acceleration"]){
        const values=entries.map(entry=>metricValue(entry.item,key)).filter(value=>value!==null);
        metrics[key]=averageValues(values);
        metricCoverage[key]={availableCount:values.length,totalCount:expectedIntervals.length,ratio:expectedIntervals.length?values.length/expectedIntervals.length:0};
      }
      const signs=entries.map(entry=>metricValue(entry.item,"direction")).filter(value=>value!==null).map(Math.sign);
      const agreements=entries.map(entry=>{
        const direction=metricValue(entry.item,"direction"),directionalStrength=metricValue(entry.item,"directionalStrength");
        return direction===null||directionalStrength===null?null:Math.sign(direction)*directionalStrength;
      }).filter(value=>value!==null);
      const reliability={fullWarmup:0,minimumWarmup:0,other:0,unavailable:Math.max(0,expectedIntervals.length-entries.length)};
      for(const {item} of entries){
        if(item.reliability==="full-warmup")reliability.fullWarmup++;
        else if(item.reliability==="minimum-warmup")reliability.minimumWarmup++;
        else reliability.other++;
      }
      roleSummaries[role]={
        role,intervals:expectedIntervals,availableIntervals:entries.map(entry=>entry.interval),
        availableCount:entries.length,totalCount:expectedIntervals.length,coverage:expectedIntervals.length?entries.length/expectedIntervals.length:0,
        direction:metrics.direction,directionalStrength:metrics.directionalStrength,acceleration:metrics.acceleration,
        alignment:signs.length?Math.abs(signs.reduce((sum,sign)=>sum+sign,0)/signs.length):0,
        momentumAgreement:averageValues(agreements),metricCoverage,reliability
      };
    }
    const roleAverage=key=>averageValues(ROLE_ORDER.map(role=>roleSummaries[role][key]).filter(value=>value!==null));
    const direction=roleAverage("direction"),directionalStrength=roleAverage("directionalStrength"),acceleration=roleAverage("acceleration");
    const directionRoles=ROLE_ORDER.map(role=>roleSummaries[role].direction).filter(value=>value!==null);
    const alignment=directionRoles.length?Math.abs(directionRoles.reduce((sum,value)=>sum+Math.sign(value),0)/directionRoles.length):0;
    const momentumAgreement=roleAverage("momentumAgreement")??0;
    const configuredCount=Object.keys(TIMEFRAME_ROLES).length,availableIntervals=new Set(available.map(entry=>entry.interval));
    const coverage=availableIntervals.size/configuredCount;
    const metricCoverage={};
    for(const key of ["direction","directionalStrength","acceleration"]){
      const validIntervals=new Set(available.filter(entry=>metricValue(entry.item,key)!==null).map(entry=>entry.interval));
      metricCoverage[key]={availableCount:validIntervals.size,totalCount:configuredCount,ratio:validIntervals.size/configuredCount};
    }
    const reliability={fullWarmup:0,minimumWarmup:0,other:0,unavailable:configuredCount-availableIntervals.size,byRole:{}};
    for(const role of ROLE_ORDER){
      reliability.byRole[role]={...roleSummaries[role].reliability};
      reliability.fullWarmup+=roleSummaries[role].reliability.fullWarmup;
      reliability.minimumWarmup+=roleSummaries[role].reliability.minimumWarmup;
      reliability.other+=roleSummaries[role].reliability.other;
    }
    const confidenceConstraint=coverage<alignment?"coverage":alignment<coverage?"alignment":coverage<1?"coverage-and-alignment":"none";
    const structuralConfidence=Math.min(coverage,alignment);
    const aggregateConfidence=clamp(Math.abs(direction||0)*.42+momentumAgreement*.12+structuralConfidence*42,0,100);
    const triggerEntries=available.filter(entry=>TIMEFRAME_ROLES[entry.interval].role==="trigger");
    const aggregateSign=Math.sign(direction||0);
    const opposing=triggerEntries.map(entry=>metricValue(entry.item,"direction")).filter(value=>value!==null&&aggregateSign&&Math.sign(value)!==aggregateSign);
    const triggerTotal=Object.values(TIMEFRAME_ROLES).filter(meta=>meta.role==="trigger").length;
    const oppositionStrength=opposing.reduce((sum,value)=>sum+clamp(Math.abs(value)/100,0,1),0)/triggerTotal;
    const triggerPenalty=14*oppositionStrength;
    const strongOpposing=triggerEntries.filter(entry=>{const value=metricValue(entry.item,"direction");return value!==null&&aggregateSign&&Math.sign(value)!==aggregateSign&&Math.abs(value)>55;});
    const unanimousStrongOpposition=triggerEntries.length===triggerTotal&&strongOpposing.length===triggerTotal;
    const timingRisk=clamp(100-aggregateConfidence+triggerPenalty,0,100);
    return freeze({
      direction,directionalStrength,acceleration,coverage,alignment,momentumAgreement,structuralConfidence,confidenceConstraint,aggregateConfidence,timingRisk,
      roleSummaries,roleCoverage:Object.fromEntries(ROLE_ORDER.map(role=>[role,roleSummaries[role].coverage])),
      metricCoverage,reliability,
      triggerRisk:{role:"trigger",availableCount:triggerEntries.length,totalCount:triggerTotal,coverage:triggerEntries.length/triggerTotal,disagreeingCount:opposing.length,oppositionStrength,penalty:triggerPenalty,unanimousStrongOpposition},
      availableCount:availableIntervals.size,totalCount:configuredCount
    });
  }
  function evaluateMarketSetup(summary={}){
    const marketBias=metricValue(summary,"direction")??0,marketStrength=metricValue(summary,"directionalStrength")??0,marketAcceleration=metricValue(summary,"acceleration")??0;
    const aggregateConfidence=metricValue(summary,"aggregateConfidence")??0,timingRisk=metricValue(summary,"timingRisk")??100;
    const hasHigherTimeframeCoverage=Number(summary&&summary.roleCoverage&&summary.roleCoverage.regime)>0||Number(summary&&summary.roleCoverage&&summary.roleCoverage.structure)>0;
    const triggerVeto=summary&&summary.triggerRisk&&summary.triggerRisk.unanimousStrongOpposition===true;
    let setupAction="WAIT",reason="Market setup thresholds are not satisfied";
    if(!hasHigherTimeframeCoverage)reason="Regime or structure coverage required";
    else if(triggerVeto)reason="Unanimous strong trigger opposition";
    else if(aggregateConfidence<52)reason="Aggregate confidence below setup threshold";
    else if(timingRisk>72)reason="Timing risk above setup threshold";
    else if(marketBias>45&&marketStrength>10){setupAction="FRESH LONG";reason="Bullish direction and strength confirmed";}
    else if(marketBias< -45&&marketStrength< -10){setupAction="FRESH SHORT";reason="Bearish direction and strength confirmed";}
    return freeze({marketBias,marketStrength,marketAcceleration,aggregateConfidence,timingRisk,setupAction,reason});
  }
  function evaluatePositionAction(marketRead={},positionContext={}){
    const hasPosition=positionContext&&positionContext.hasPosition===true;
    const positionSide=String(positionContext&&positionContext.side||"").toUpperCase();
    if(!hasPosition)return freeze({positionAction:null,positionSide:null,reason:"No open position"});
    if(positionSide!=="LONG"&&positionSide!=="SHORT")return freeze({positionAction:null,positionSide:null,reason:"Invalid position side"});
    const direction=metricValue(marketRead,"marketBias")??0,strength=metricValue(marketRead,"marketStrength")??0;
    const aggregateConfidence=metricValue(marketRead,"aggregateConfidence")??0,timingRisk=metricValue(marketRead,"timingRisk")??100;
    const addQualityOk=aggregateConfidence>=52&&timingRisk<=72;
    if(positionSide==="SHORT"){
      if(direction>30)return freeze({positionAction:"EXIT",positionSide,reason:"Bullish direction invalidates SHORT"});
      if(direction>8)return freeze({positionAction:"TRIM",positionSide,reason:"Bullish pressure opposes SHORT"});
      if(direction< -35&&strength< -20){
        if(addQualityOk)return freeze({positionAction:"ADD",positionSide,reason:"Bearish direction and strength confirm ADD"});
        return freeze({positionAction:"HOLD",positionSide,reason:aggregateConfidence<52?"ADD blocked by low aggregate confidence":"ADD blocked by high timing risk"});
      }
      return freeze({positionAction:"HOLD",positionSide,reason:"No SHORT position adjustment threshold met"});
    }
    if(direction< -30)return freeze({positionAction:"EXIT",positionSide,reason:"Bearish direction invalidates LONG"});
    if(direction< -8)return freeze({positionAction:"TRIM",positionSide,reason:"Bearish pressure opposes LONG"});
    if(direction>35&&strength>20){
      if(addQualityOk)return freeze({positionAction:"ADD",positionSide,reason:"Bullish direction and strength confirm ADD"});
      return freeze({positionAction:"HOLD",positionSide,reason:aggregateConfidence<52?"ADD blocked by low aggregate confidence":"ADD blocked by high timing risk"});
    }
    return freeze({positionAction:"HOLD",positionSide,reason:"No LONG position adjustment threshold met"});
  }
  const api=freeze({TIMEFRAME_ROLES,ROLE_ORDER,SSSC_ATR_PERIOD,INTERVAL_MS,ema,atrSeries,realizedVolatility,buildNormalization,separationMetrics,rawStackDirection,stackDirection,stackClean,slopeScore,slopePower,signedSlopeAcceleration,spreadDir,spreadPower,signedSpreadAcceleration,crossState,crossWeight,eventForLevel,clusterState,phaseLabel,deriveEarlyWarning,calculateTimeframe,aggregate,evaluateMarketSetup,evaluatePositionAction});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_CALC=api;
})();
