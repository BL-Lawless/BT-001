(() => {
  "use strict";

  const VERSION="1.0.0";
  const DEPTHS=Object.freeze({"1m":2900,"3m":980,"5m":596,"15m":320,"1h":320,"4h":320,"1d":320});
  const PROFILES=Object.freeze({
    quick:Object.freeze({early:"1m",trigger:"3m",primary:"5m",setups:["3m","5m"],structures:["15m","1h"],boundaries:["4h","1d"],eventWindow:7,chaseAtr:1.35,minNetRr:1.35}),
    "2_3h":Object.freeze({early:"3m",trigger:"5m",primary:"15m",setups:["5m","15m"],structures:["1h"],boundaries:["4h","1d"],eventWindow:7,chaseAtr:1.55,minNetRr:1.45}),
    "6_8h":Object.freeze({early:"5m",trigger:"15m",primary:"1h",setups:["15m","1h"],structures:["4h"],boundaries:["1d"],eventWindow:8,chaseAtr:1.75,minNetRr:1.55})
  });
  const GRADE=value=>value>=80?"A":value>=70?"B":value>=60?"C":"UNACCEPTABLE";
  const PRESENTATION=Object.freeze({
    "WATCHING":Object.freeze({definition:"A VALID SETUP AREA EXISTS, BUT PRICE HAS NOT REACHED IT YET.",tone:"gray",internal:"SETUP ARMED"}),
    "STAND BY":Object.freeze({definition:"PRICE IS AT THE SETUP AREA; WAIT FOR A CLOSED REACTION.",tone:"orange",internal:"ZONE ENGAGED"}),
    "TRIGGER FORMING":Object.freeze({definition:"THE SETUP REACTION EXISTS, BUT POST-INTERACTION CONFIRMATION IS INCOMPLETE.",tone:"orange",internal:"TRIGGER DEVELOPING"}),
    "TRIGGER ACTIVE":Object.freeze({definition:"PRICE IS DEMONSTRABLY JOINING THE INTENDED MOVE AFTER THE SETUP INTERACTION.",tone:"green",internal:"READY"}),
    "NO CHASE":Object.freeze({definition:"THE SETUP MOVED TOO FAR FROM ITS VALID ORIGIN FOR AN EFFICIENT NEW ENTRY.",tone:"red",internal:"EXPIRED"}),
    "SETUP FAILED":Object.freeze({definition:"A CLOSED CANDLE INVALIDATED THE SETUP OR REQUIRED REACTION.",tone:"red",internal:"INVALIDATED"}),
    "NO SETUP":Object.freeze({definition:"DIRECTIONAL PERMISSION EXISTS, BUT NO VALID ENTRY SETUP IS AVAILABLE.",tone:"gray",internal:"BIAS CONFIRMED"})
  });

  const num=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
  const average=values=>{const usable=values.map(Number).filter(Number.isFinite);return usable.length?usable.reduce((sum,value)=>sum+value,0)/usable.length:0;};
  const sideValue=direction=>direction==="LONG"?1:direction==="SHORT"?-1:0;
  const unique=values=>[...new Set((values||[]).filter(Boolean))];
  function closedRows(snapshot,tf){return (snapshot&&snapshot.closedByTf&&snapshot.closedByTf[tf]||[]).filter(row=>row&&row.final!==false&&num(row.close)!=null);}
  function trueRange(row,previous){const priorClose=num((previous&&previous.close)??row.open);return Math.max(num(row.high)-num(row.low),Math.abs(num(row.high)-priorClose),Math.abs(num(row.low)-priorClose));}
  function atr(rows,period=14){const source=rows.slice(-(period+1));if(source.length<3)return null;return average(source.slice(1).map((row,index)=>trueRange(row,source[index])));}
  function emaSeries(rows,period){
    if(rows.length<period)return [];
    const alpha=2/(period+1),series=[];let value=average(rows.slice(0,period).map(row=>row.close));
    series.push(value);for(let index=period;index<rows.length;index+=1){value=num(rows[index].close)*alpha+value*(1-alpha);series.push(value);}return series;
  }
  function emaSnapshot(rows){
    const out={};[9,21,55,100,200].forEach(period=>{const series=emaSeries(rows,period);out[period]={value:series.at(-1)??null,prior:series.at(-4)??series[0]??null,series};});return out;
  }
  function percentile(values,current){const usable=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!usable.length||!Number.isFinite(current))return null;return 100*usable.filter(value=>value<=current).length/usable.length;}
  function volatilityEvidence(rows){
    const currentAtr=atr(rows),ranges=rows.slice(-100).map((row,index,list)=>index?trueRange(row,list[index-1]):num(row.high)-num(row.low));
    const rank=percentile(ranges.slice(0,-1),average(ranges.slice(-5))),ratio=currentAtr&&average(ranges.slice(-5))/currentAtr||null;
    const regime=rank==null?"Unavailable":rank<25?"Compressed":rank<70?"Normal":rank<92?"Expanding/controlled":"Disorderly/extreme";
    return {atr:currentAtr,realizedRangePercentile:rank,rangeToAtr:ratio,regime,controlledAcceptance:regime!=="Disorderly/extreme"};
  }
  function candleFlow(rows,direction,window=8){
    const side=sideValue(direction),sample=rows.slice(-window),first=sample[0],last=sample.at(-1),rangeAtr=atr(rows)||average(sample.map(row=>num(row.high)-num(row.low)))||1;
    const totalVolume=sample.reduce((sum,row)=>sum+(num(row.volume)||0),0),buy=sample.reduce((sum,row)=>sum+(num(row.takerBuyBase)||0),0);
    const imbalance=totalVolume>0?(buy-(totalVolume-buy))/totalVolume:0;
    const progress=first&&last?(num(last.close)-num(first.open))*side/rangeAtr:0;
    const directionalImbalance=imbalance*side,efficiency=totalVolume>0?progress/Math.max(.25,Math.abs(directionalImbalance)*4):progress;
    const directionalCloses=sample.filter(row=>(num(row.close)-num(row.open))*side>0).length/Math.max(1,sample.length);
    const wickPenalty=average(sample.map(row=>{const range=Math.max(1e-9,num(row.high)-num(row.low)),body=Math.abs(num(row.close)-num(row.open));return 1-body/range;}));
    const effective=progress>=.28&&directionalCloses>=.5&&(directionalImbalance>=-.08||progress>=.65);
    const absorption=directionalImbalance<-.08&&progress>=.42&&directionalCloses>=.57;
    const ineffectiveHighVolume=Math.abs(directionalImbalance)>=.16&&progress<.16;
    return {effective:effective||absorption,absorption,ineffectiveHighVolume,directionalImbalance,priceProgressAtr:progress,efficiency,directionalCloseShare:directionalCloses,wickPenalty,evidence:[`Directional taker imbalance ${(directionalImbalance*100).toFixed(1)}%`,`Resulting price progress ${progress.toFixed(2)} ATR`,`Directional closes ${(directionalCloses*100).toFixed(0)}%`]};
  }
  function participationEvidence(rows,eventRows,direction){
    const baselineRows=rows.slice(-60,-Math.max(1,eventRows.length)),baselineVolume=average(baselineRows.map(row=>num(row.volume)||0)),baselineQuote=average(baselineRows.map(row=>num(row.quoteVolume)||0)),baselineTrades=average(baselineRows.map(row=>num(row.tradeCount)||0));
    const eventVolume=average(eventRows.map(row=>num(row.volume)||0)),eventQuote=average(eventRows.map(row=>num(row.quoteVolume)||0)),eventTrades=average(eventRows.map(row=>num(row.tradeCount)||0));
    const volumeRatio=baselineVolume?eventVolume/baselineVolume:null,quoteRatio=baselineQuote?eventQuote/baselineQuote:null,tradeRatio=baselineTrades?eventTrades/baselineTrades:null;
    const available=[volumeRatio,quoteRatio,tradeRatio].filter(Number.isFinite),ratio=available.length?average(available):null;
    const persistence=eventRows.length?eventRows.filter(row=>(num(row.close)-num(row.open))*sideValue(direction)>0).length/eventRows.length:0;
    const score=ratio==null?50:clamp(35+ratio*30+persistence*25,0,100),state=ratio==null?"UNAVAILABLE":ratio>=1.15?"STRONG":ratio>=.8?"NORMAL":"WEAK";
    return {state,score,volumeRatio,quoteVolumeRatio:quoteRatio,tradeCountRatio:tradeRatio,persistence,credibleAbsorption:false};
  }
  function swingPoints(rows){
    const highs=[],lows=[];for(let index=2;index<rows.length-2;index+=1){const row=rows[index];if(num(row.high)>=Math.max(...rows.slice(index-2,index+3).map(item=>num(item.high))))highs.push({index,time:row.time,price:num(row.high)});if(num(row.low)<=Math.min(...rows.slice(index-2,index+3).map(item=>num(item.low))))lows.push({index,time:row.time,price:num(row.low)});}return {highs,lows};
  }
  function setupCandidates(snapshot,profile,direction,volatility){
    const side=sideValue(direction),candidates=[];
    for(const tf of profile.setups){
      const rows=closedRows(snapshot,tf),current=rows.at(-1),currentPrice=num(snapshot.currentPrice)??num(current&&current.close),rangeAtr=atr(rows)||volatility.atr;
      if(rows.length<30||currentPrice==null||!(rangeAtr>0))continue;
      const emas=emaSnapshot(rows),width=rangeAtr*(volatility.regime==="Disorderly/extreme"?.28:volatility.regime==="Compressed"?.12:.18);
      const add=(family,level,activationIndex,quality,extra={})=>{if(!Number.isFinite(level))return;const zone={low:level-width,high:level+width},after=Math.max(0,activationIndex||rows.length-10),interactions=[];rows.slice(after).forEach((row,index)=>{if(num(row.low)<=zone.high&&num(row.high)>=zone.low)interactions.push(after+index);});const interactionIndex=interactions.at(-1)??null;const reactionRow=interactionIndex==null?null:rows[interactionIndex],body=reactionRow?(num(reactionRow.close)-num(reactionRow.open))*side:0,reactionConfirmed=!!reactionRow&&body>=rangeAtr*.12&&(num(reactionRow.close)-level)*side>=-width*.15;const invalidation=level-side*rangeAtr*.65,invalidated=interactionIndex!=null&&rows.slice(interactionIndex).some(row=>(num(row.close)-invalidation)*side<0);const distanceAtr=Math.max(0,currentPrice<zone.low?zone.low-currentPrice:currentPrice>zone.high?currentPrice-zone.high:0)/rangeAtr;candidates.push({family,tf,direction,level,zone,invalidation,activationIndex:after,interactionIndex,interactionTime:interactionIndex==null?null:rows[interactionIndex].time,interacted:interactionIndex!=null,reactionConfirmed,invalidated,distanceAtr,repeatedTests:interactions.length,quality,nonEma:!/^MA/.test(family),rows,...extra});};
      const pivots=swingPoints(rows.slice(-80)),baseIndex=Math.max(0,rows.length-80);
      const relevant=direction==="LONG"?pivots.highs:pivots.lows;
      [...relevant].reverse().slice(0,5).forEach(pivot=>{const index=baseIndex+pivot.index,broken=rows.slice(index+1).findIndex(row=>(num(row.close)-pivot.price)*side>rangeAtr*.08);if(broken>=0)add("Structural retest",pivot.price,index+1+broken,82,{structural:true});});
      const recent=rows.slice(-12);for(let index=2;index<recent.length;index+=1){const prior=recent.slice(Math.max(0,index-5),index),boundary=direction==="LONG"?Math.min(...prior.map(row=>num(row.low))):Math.max(...prior.map(row=>num(row.high))),row=recent[index],swept=direction==="LONG"?num(row.low)<boundary:num(row.high)>boundary,reclaimed=(num(row.close)-boundary)*side>0;if(swept&&reclaimed)add(direction==="LONG"?"Sweep and reclaim":"Sweep and rejection",boundary,rows.length-recent.length+index,86,{structural:true,sweep:true});}
      for(const period of [9,21]){const level=emas[period].value,near=recent.findIndex(row=>num(row.low)<=level+width&&num(row.high)>=level-width&&(num(row.close)-level)*side>0);if(near>=0)add(`MA${period} bounce/rejection`,level,rows.length-recent.length+near,period===21?78:72,{maPeriod:period});}
      const min=Math.min(emas[9].series.length,emas[21].series.length),fast=emas[9].series.slice(-min),slow=emas[21].series.slice(-min),offset=rows.length-min;for(let index=Math.max(1,min-12);index<min;index+=1){const before=(fast[index-1]-slow[index-1])*side,after=(fast[index]-slow[index])*side;if(before<=0&&after>0)add("MA crossover retest",slow[index],offset+index,74,{maPeriod:21,crossover:true});}
      const historicalRanges=rows.slice(-50,-10).map(row=>num(row.high)-num(row.low)),compressed=average(rows.slice(-10,-2).map(row=>num(row.high)-num(row.low)))<average(historicalRanges)*.68;const compressionBoundary=direction==="LONG"?Math.max(...rows.slice(-10,-2).map(row=>num(row.high))):Math.min(...rows.slice(-10,-2).map(row=>num(row.low))),release=rows.slice(-2).findIndex(row=>(num(row.close)-compressionBoundary)*side>rangeAtr*.18);if(compressed)add("Compression release",compressionBoundary,release>=0?rows.length-2+release:rows.length-2,release>=0?76:62,{compression:true,released:release>=0});
    }
    return candidates.sort((a,b)=>{const aScore=a.quality-(a.distanceAtr*8)+(a.structural?4:0),bScore=b.quality-(b.distanceAtr*8)+(b.structural?4:0);return bScore-aScore;});
  }
  function directionEvidence(snapshot,profile,directionMode="AUTO"){
    const primary=closedRows(snapshot,profile.primary),structuralSets=profile.structures.map(tf=>closedRows(snapshot,tf)),boundarySets=profile.boundaries.map(tf=>closedRows(snapshot,tf));
    const primaryAtr=atr(primary)||1,primaryEma=emaSnapshot(primary),alignment=(sets,direction,period=55)=>{const side=sideValue(direction),scores=sets.map(rows=>{const latest=rows.at(-1),ema=emaSnapshot(rows)[period].value;return latest&&ema!=null?((num(latest.close)-ema)*side>0?82:28):50;});return scores.length?average(scores):50;},evaluate=direction=>{
      const side=sideValue(direction),last=primary.at(-1),first=primary.at(-9),stackPairs=[[9,21],[21,55],[55,100]],stack=average(stackPairs.map(([fast,slow])=>(primaryEma[fast].value-primaryEma[slow].value)*side>0?100:0));
      const slopes=average([9,21,55].map(period=>(primaryEma[period].value-primaryEma[period].prior)*side>0?100:0));
      const pressure=last&&first?clamp(50+(num(last.close)-num(first.open))*side/primaryAtr*18):0;
      const structure=alignment(structuralSets,direction,55),boundary=alignment(boundarySets,direction,100);
      const flow=candleFlow(primary,direction,8),acceptance=clamp(45+flow.priceProgressAtr*22+(flow.effective?20:0)-(flow.ineffectiveHighVolume?22:0));
      const phase=clamp((stack+slopes+structure)/3);const score=clamp(stack*.22+slopes*.13+pressure*.2+structure*.2+boundary*.08+acceptance*.1+phase*.07);
      return {direction,score,breakdown:{maStackOrder:stack,maSlopeAndTransition:slopes,primaryPressure:pressure,closedStructure:structure,higherTimeframeBoundaries:boundary,recentAcceptanceFailure:acceptance,phaseConsistency:phase},flow};
    };
    const long=evaluate("LONG"),short=evaluate("SHORT"),automaticWinner=long.score>=short.score?long:short,automaticRunner=automaticWinner===long?short:long,automaticPermission=automaticWinner.score>=58&&automaticWinner.score-automaticRunner.score>=5,mode=["LONG","SHORT"].includes(String(directionMode).toUpperCase())?String(directionMode).toUpperCase():"AUTO",selected=mode==="LONG"?long:mode==="SHORT"?short:automaticWinner,permission=mode==="AUTO"?automaticPermission:selected.score>=58;
    const earlyOpposite=candleFlow(closedRows(snapshot,profile.early),selected.direction==="LONG"?"SHORT":"LONG",6),lowerTimeframeWarning={active:earlyOpposite.effective,direction:selected.direction==="LONG"?"SHORT":"LONG",evidence:earlyOpposite.evidence},opposingAutomaticBias=mode!=="AUTO"&&automaticPermission&&automaticWinner.direction!==mode;
    return {direction:mode==="AUTO"?(permission?selected.direction:null):mode,directionMode:mode,score:selected.score,longScore:long.score,shortScore:short.score,permission,automaticDirection:automaticPermission?automaticWinner.direction:null,opposingAutomaticBias,opposingEvidence:opposingAutomaticBias?[`Automatic evidence favors ${automaticWinner.direction} ${automaticWinner.score.toFixed(0)} versus selected ${mode} ${selected.score.toFixed(0)}`]:[],breakdown:{...selected.breakdown,lowerTimeframeWarning},primaryFlow:selected.flow,lowerTimeframeWarning,reason:permission?`${selected.direction} permission from primary/structural agreement`:mode==="AUTO"?`Directional evidence is mixed (${long.score.toFixed(0)} LONG / ${short.score.toFixed(0)} SHORT)`:`${mode} selected manually; directional evidence is unsupported (${selected.score.toFixed(0)})`};
  }
  function triggerEvidence(snapshot,profile,direction,setup,volatility){
    const rows=closedRows(snapshot,profile.trigger),side=sideValue(direction),interactionTime=num(setup&&setup.interactionTime),interactionIndex=interactionTime==null?-1:rows.findIndex(row=>num(row.time)>=interactionTime),post=interactionIndex>=0?rows.slice(interactionIndex,interactionIndex+profile.eventWindow+2):[];
    const postAfter=post.slice(1),preShiftRows=rows.slice(Math.max(0,interactionIndex-4),Math.max(1,interactionIndex)),referenceRows=preShiftRows.length?preShiftRows:(post.length?[post[0]]:rows.slice(-1)),breakLevel=direction==="LONG"?Math.max(...referenceRows.map(row=>num(row.high))):Math.min(...referenceRows.map(row=>num(row.low)));
    const triggerAtr=atr(rows)||volatility.atr||1,shiftRow=postAfter.find(row=>(num(row.close)-breakLevel)*side>triggerAtr*.04),shiftIndex=shiftRow?rows.indexOf(shiftRow):-1,microstructureShift=!!shiftRow;
    const eventRows=post.length?post:rows.slice(-profile.eventWindow),flow=candleFlow(eventRows,direction,profile.eventWindow),participation=participationEvidence(rows,eventRows,direction);
    if(flow.absorption&&flow.effective)participation.credibleAbsorption=true;
    const rangeAtr=triggerAtr,displacement=postAfter.reduce((best,row)=>Math.max(best,(num(row.close)-num(row.open))*side/rangeAtr),0),wickHeavy=postAfter.some(row=>{const range=Math.max(1e-9,num(row.high)-num(row.low)),body=Math.abs(num(row.close)-num(row.open));return body/range<.32&&(num(row.close)-num(row.open))*side>0;});
    const displacementScore=clamp(displacement*85+(flow.priceProgressAtr>0?25:0)-(wickHeavy&&flow.priceProgressAtr<.3?25:0));
    let retestHeld=false;if(shiftIndex>=0){retestHeld=rows.slice(shiftIndex+1,shiftIndex+4).some(row=>direction==="LONG"?num(row.low)<=breakLevel+rangeAtr*.12&&num(row.close)>breakLevel:num(row.high)>=breakLevel-rangeAtr*.12&&num(row.close)<breakLevel);}
    const follow=shiftIndex>=0?rows.slice(shiftIndex,shiftIndex+4):[],qualifiedFollowThrough=follow.length>=2&&flow.priceProgressAtr>=.55&&follow.filter(row=>(num(row.close)-num(row.open))*side>0).length>=2&&!wickHeavy;
    const freshness=shiftRow?Math.max(0,rows.length-1-shiftIndex):Infinity,freshnessScore=Number.isFinite(freshness)?clamp(100-freshness*15):0;
    return {microstructureShift,shiftTime:shiftRow&&shiftRow.time||null,breakLevel,displacementQuality:displacementScore,wickHeavy,flow,participation,retestHeld,qualifiedFollowThrough,freshnessCandles:freshness,freshnessScore,eventWindow:{from:post[0]&&post[0].time||null,to:post.at(-1)&&post.at(-1).time||null,count:post.length},evidence:[microstructureShift?`Closed ${profile.trigger} post-interaction structure shift`:`No closed ${profile.trigger} post-interaction structure shift`,...flow.evidence]};
  }
  function oppositionEvidence(snapshot,profile,direction){
    const rows=closedRows(snapshot,profile.primary),flow=candleFlow(rows,direction==="LONG"?"SHORT":"LONG",8),emas=emaSnapshot(rows),side=sideValue(direction),opposingStack=[9,21,55].every((period,index,array)=>index===array.length-1||(emas[period].value-emas[array[index+1]].value)*side<0);
    const effective=(flow.effective&&flow.priceProgressAtr>=.35)||(opposingStack&&flow.priceProgressAtr>=.2);
    return {effective,evidence:effective?[`${profile.primary} opposing flow produced ${flow.priceProgressAtr.toFixed(2)} ATR progress`,...(opposingStack?[`${profile.primary} MA stack is effectively opposed`]:[])]:[],neutral:!effective};
  }
  function targetGeometry(snapshot,profile,direction,setup,volatility){
    const side=sideValue(direction),price=num(snapshot.currentPrice),rangeAtr=atr(setup&&setup.rows||[])||volatility.atr||1,levels=[];
    [...profile.structures,...profile.boundaries].forEach(tf=>{const pivots=swingPoints(closedRows(snapshot,tf).slice(-120));(direction==="LONG"?pivots.highs:pivots.lows).forEach(point=>{if((point.price-price)*side>0)levels.push({price:point.price,tf});});});
    levels.sort((a,b)=>(a.price-b.price)*side);const target=levels[0]||null,stopDistance=Math.max(rangeAtr*.45,Math.abs(price-num(setup&&setup.invalidation))),allowance=rangeAtr*.08;
    if(!target)return {target:null,targetTimeframe:null,remainingDistance:null,stopDistance,grossRr:null,netRr:null,viable:false,feeSlippageAllowance:allowance,reason:"No confirmed opposing structural target"};
    const remaining=Math.abs(target.price-price),grossRr=remaining/stopDistance,netRr=Math.max(0,(remaining-allowance)/(stopDistance+allowance));
    return {target:target.price,targetTimeframe:target.tf,remainingDistance:remaining,stopDistance,grossRr,netRr,viable:netRr>=profile.minNetRr,feeSlippageAllowance:allowance};
  }
  function extractFacts(snapshot,horizonId,state,directionMode="AUTO"){
    const profile=PROFILES[horizonId]||PROFILES.quick,direction=directionEvidence(snapshot,profile,directionMode),selectedDirection=direction.direction||((direction.longScore>=direction.shortScore)?"LONG":"SHORT"),primaryVolatility=volatilityEvidence(closedRows(snapshot,profile.primary)),candidates=setupCandidates(snapshot,profile,selectedDirection,primaryVolatility),setup=candidates[0]||null;
    if(setup){const identity=[snapshot.symbol,horizonId,selectedDirection,setup.family,setup.tf,Math.round(setup.level*1e6)/1e6].join("|");setup.identity=identity;const previous=state.setupHistories.get(identity)||{firstSeenVersion:snapshot.version,maxTests:0};previous.maxTests=Math.max(previous.maxTests,setup.repeatedTests);previous.lastSeenVersion=snapshot.version;state.setupHistories.set(identity,previous);while(state.setupHistories.size>128)state.setupHistories.delete(state.setupHistories.keys().next().value);setup.repeatedTests=previous.maxTests;}
    const trigger=setup?triggerEvidence(snapshot,profile,selectedDirection,setup,primaryVolatility):{microstructureShift:false,displacementQuality:0,flow:{effective:false,evidence:[]},participation:{state:"UNAVAILABLE",score:50,credibleAbsorption:false},retestHeld:false,qualifiedFollowThrough:false,freshnessScore:0,evidence:[]},opposition=oppositionEvidence(snapshot,profile,selectedDirection),geometry=setup?targetGeometry(snapshot,profile,selectedDirection,setup,primaryVolatility):{netRr:0,viable:false};
    const price=num(snapshot.currentPrice),setupAtr=atr(setup&&setup.rows||[])||primaryVolatility.atr,originDistanceAtr=setup&&setupAtr?Math.max(0,Math.abs(price-setup.level)-((setup.zone.high-setup.zone.low)/2))/setupAtr:Infinity;
    const setupComponents={structuralLocation:setup?clamp(setup.quality+(setup.structural?8:0)-Math.max(0,setup.repeatedTests-2)*8):0,regimeAlignment:direction.permission?clamp(direction.score):25,eventLevelQuality:setup?setup.quality:0,invalidationTargetGeometry:geometry.viable?clamp(55+geometry.netRr*15):clamp(geometry.netRr*30),volatilitySuitability:primaryVolatility.regime==="Normal"?85:primaryVolatility.regime==="Expanding/controlled"?78:primaryVolatility.regime==="Compressed"?55:25};
    const fresh=String(snapshot&&snapshot.freshness&&snapshot.freshness.signalStatus||snapshot&&snapshot.health&&snapshot.health.status||"").toUpperCase();
    const timeframesUsed=unique([profile.early,profile.trigger,profile.primary,...profile.setups,...profile.structures,...profile.boundaries]),createdAt=num(snapshot&&snapshot.createdAt),ageMs=createdAt==null?null:Math.max(0,Date.now()-createdAt);
    return {fresh:["LIVE","SUFFICIENT"].includes(fresh),directionalPermission:direction,setup:setup?{...setup,valid:setup.quality>=60}:null,setupCandidates:candidates.map(item=>({family:item.family,tf:item.tf,quality:item.quality,distanceAtr:item.distanceAtr,interacted:item.interacted,nonEma:item.nonEma})),setupComponents,trigger,opposition,volatility:primaryVolatility,geometry,current:{price,originDistanceAtr,chased:originDistanceAtr>profile.chaseAtr,adverseEvidence:opposition.effective?70:15},data:{timeframesUsed,freshness:fresh||"UNAVAILABLE",ageMs},profile};
  }
  function scoreFacts(facts,{horizonId="quick",symbol="",version=0,directionMode="AUTO"}={}){
    const profile=facts.profile||PROFILES[horizonId]||PROFILES.quick,permission=facts.directionalPermission||{},mode=["LONG","SHORT"].includes(String(directionMode).toUpperCase())?String(directionMode).toUpperCase():"AUTO",publishedDirection=mode==="AUTO"?(permission.direction||"NO BIAS"):mode,rawSetup=facts.setup,setup=rawSetup&&(!rawSetup.direction||rawSetup.direction===publishedDirection)?rawSetup:null,trigger=facts.trigger||{},flow=trigger.flow||{},participation=trigger.participation||{},geometry=facts.geometry||{},volatility=facts.volatility||{},current=facts.current||{};
    const sc=facts.setupComponents||{},setupBreakdown={structuralLocation:clamp(sc.structuralLocation),regimeAlignment:clamp(sc.regimeAlignment),eventLevelQuality:clamp(sc.eventLevelQuality),invalidationTargetGeometry:clamp(sc.invalidationTargetGeometry),volatilitySuitability:clamp(sc.volatilitySuitability)};
    const setupScore=clamp(setupBreakdown.structuralLocation*.30+setupBreakdown.regimeAlignment*.25+setupBreakdown.eventLevelQuality*.20+setupBreakdown.invalidationTargetGeometry*.15+setupBreakdown.volatilitySuitability*.10);
    const triggerBreakdown={postInteractionMicrostructure:trigger.microstructureShift?100:0,reactionDisplacement:clamp(trigger.displacementQuality),directionalFlowEffectiveness:flow.effective?clamp(70+(flow.priceProgressAtr||0)*25-(flow.ineffectiveHighVolume?35:0)):clamp((flow.priceProgressAtr||0)*25),participationPersistence:clamp(participation.score??50),retestFollowThroughFreshness:clamp((trigger.retestHeld?100:trigger.qualifiedFollowThrough?82:0)*.75+(trigger.freshnessScore||0)*.25)};
    const triggerScore=clamp(triggerBreakdown.postInteractionMicrostructure*.25+triggerBreakdown.reactionDisplacement*.20+triggerBreakdown.directionalFlowEffectiveness*.25+triggerBreakdown.participationPersistence*.15+triggerBreakdown.retestFollowThroughFreshness*.15);
    const distanceScore=clamp(100-(num(current.originDistanceAtr)??profile.chaseAtr*2)/profile.chaseAtr*100),rewardScore=clamp((num(geometry.netRr)||0)/Math.max(profile.minNetRr,1)*75),adverseScore=clamp(100-(num(current.adverseEvidence)||0)),persistenceScore=clamp(((participation.score??50)+(volatility.controlledAcceptance===false?15:85))/2);
    const currentBreakdown={triggerCredibility:triggerScore,distanceFromOrigin:distanceScore,remainingRoomNetRewardRisk:rewardScore,currentAdverseEvidence:adverseScore,volatilityParticipationPersistence:persistenceScore};
    const currentScore=clamp(currentBreakdown.triggerCredibility*.30+currentBreakdown.distanceFromOrigin*.25+currentBreakdown.remainingRoomNetRewardRisk*.25+currentBreakdown.currentAdverseEvidence*.10+currentBreakdown.volatilityParticipationPersistence*.10);
    const weakParticipationAllowed=participation.state!=="WEAK"||(participation.credibleAbsorption===true&&flow.effective===true);
    const gates={
      freshData:facts.fresh===true,directionalPermission:permission.permission===true&&publishedDirection!=="NO BIAS",validSetup:!!setup&&setup.valid!==false,setupInteraction:!!setup&&setup.interacted===true,closedReaction:!!setup&&setup.reactionConfirmed===true,
      postInteractionShift:trigger.microstructureShift===true,effectiveFlow:flow.effective===true&&!flow.ineffectiveHighVolume,retestOrQualifiedFollowThrough:trigger.retestHeld===true||trigger.qualifiedFollowThrough===true,
      noEffectivePrimaryOpposition:!facts.opposition||facts.opposition.effective!==true,currentEntryAtLeastB:currentScore>=70,viableNetRewardRisk:geometry.viable===true&&(num(geometry.netRr)||0)>=profile.minNetRr,notChased:current.chased!==true,
      participationConviction:weakParticipationAllowed,controlledVolatility:volatility.regime!=="Disorderly/extreme"||volatility.controlledAcceptance===true,progressiveDisplacement:!(trigger.wickHeavy===true&&(flow.priceProgressAtr||0)<.3),setupNotWeakened:!(setup&&setup.repeatedTests>=4)
    };
    const failed=Object.entries(gates).filter(([,passed])=>!passed).map(([name])=>name),allActive=failed.length===0;
    let stateReason,stateName;
    if(!permission.permission){stateName="NO SETUP";stateReason=permission.reason||"Directional permission is unavailable";}
    else if(setup&&setup.invalidated){stateName="SETUP FAILED";stateReason="Closed structural invalidation breached the setup";}
    else if(!setup||setup.valid===false){stateName="NO SETUP";stateReason="Direction exists, but no valid setup location is available";}
    else if(!setup.interacted){stateName="WATCHING";stateReason="Valid setup location has not been reached";}
    else if(current.chased){stateName="NO CHASE";stateReason=`Entry is ${Number(current.originDistanceAtr).toFixed(2)} ATR from origin`;
    }else if(!setup.reactionConfirmed){stateName="STAND BY";stateReason="Setup is engaged without a closed-candle reaction";}
    else if(allActive){stateName="TRIGGER ACTIVE";stateReason="Closed reaction, post-interaction shift, effective flow and entry-efficiency gates all passed";}
    else{stateName="TRIGGER FORMING";stateReason=`Confirmation incomplete: ${failed.join(", ")}`;}
    const presentation=PRESENTATION[stateName],direction=publishedDirection,triggerIdentity=stateName==="TRIGGER ACTIVE"?[symbol,horizonId,direction,setup.identity,profile.trigger,trigger.shiftTime||version].join("|"):null;
    const reasons=unique([stateReason,...(permission.opposingEvidence||[]),...(trigger.evidence||[]),...(facts.opposition&&facts.opposition.evidence||[])]),exclusions=failed.map(name=>`Hard gate failed: ${name}`);
    const decision={state:presentation.internal,reason:stateReason,direction,setupIdentity:setup&&setup.identity||null,family:setup&&setup.family||null,tf:setup&&setup.tf||null,horizonId,triggerIdentity,triggerState:stateName==="TRIGGER ACTIVE"?"active":stateName==="TRIGGER FORMING"?"developing":"absent",interaction:{interactionTime:setup&&setup.interactionTime||null,reactionTime:setup&&setup.reactionConfirmed?setup.interactionTime:null,evidence:trigger.evidence||[]},pressure:{triggerTf:profile.trigger,primaryTf:profile.primary,evidence:flow.evidence||[],effectiveOpposition:facts.opposition&&facts.opposition.effective===true},assessments:{setup:{score:setupScore,grade:GRADE(setupScore)},trigger:{score:triggerScore,grade:GRADE(triggerScore)},current:{score:currentScore,grade:GRADE(currentScore)}}};
    const currentPrice=num(current.price),triggerLevel=num(trigger.breakLevel)??num(setup&&setup.level),relativeDelta=currentPrice==null||triggerLevel==null?null:(currentPrice-triggerLevel)*sideValue(direction);
    const setupEvidence=setup?{family:setup.family||null,timeframe:setup.tf||null,level:num(setup.level),zone:setup.zone||null,structural:setup.structural===true,nonEma:setup.nonEma===true,repeatedTests:num(setup.repeatedTests),interacted:setup.interacted===true,reactionConfirmed:setup.reactionConfirmed===true,event:(setup.family||"Setup")+(setup.interacted?" interaction active":" awaiting interaction"),regimeAlignment:`${profile.primary||"UNAVAILABLE"} primary / ${setup.tf||"UNAVAILABLE"} setup`,invalidation:num(setup.invalidation),target:num(geometry.target),targetTimeframe:geometry.targetTimeframe||null,targetAvailable:num(geometry.target)!=null}:null;
    const triggerDiagnostics={microstructureShift:trigger.microstructureShift===true,reactionConfirmed:setup?setup.reactionConfirmed===true:null,displacementQuality:num(trigger.displacementQuality),flowEffective:flow.effective===true,flowEvidence:flow.evidence||[],participationPersistence:num(participation.persistence),retestHeld:trigger.retestHeld===true,qualifiedFollowThrough:trigger.qualifiedFollowThrough===true,freshnessCandles:num(trigger.freshnessCandles)};
    const entryCondition={triggerLevel,zone:setup&&setup.zone||null,currentPrice,currentRelative:relativeDelta==null?null:relativeDelta===0?"AT TRIGGER":relativeDelta>0?`BEYOND BY ${relativeDelta.toFixed(6)}`:`BEFORE BY ${Math.abs(relativeDelta).toFixed(6)}`,invalidation:num(setup&&setup.invalidation),target:num(geometry.target),targetTimeframe:geometry.targetTimeframe||null};
    const data={timeframesUsed:facts.data&&facts.data.timeframesUsed||unique([profile.early,profile.trigger,profile.primary,...(profile.setups||[]),...(profile.structures||[]),...(profile.boundaries||[])]),freshness:facts.data&&facts.data.freshness||(facts.fresh?"LIVE":"STALE"),ageMs:num(facts.data&&facts.data.ageMs),missing:unique([!setup&&"setup location",triggerLevel==null&&"trigger level",currentPrice==null&&"current price",num(setup&&setup.invalidation)==null&&"invalidation",num(geometry.target)==null&&"target",num(geometry.netRr)==null&&"net reward/risk"])};
    const comparisonDiagnostics={directionMode:mode,automaticDirection:permission.automaticDirection||null,opposingAutomaticEvidence:permission.opposingEvidence||[],directionalPermissionScore:num(permission.score),directionalPermissionBreakdown:permission.breakdown||{},setupScore,setupBreakdown,triggerScore,triggerBreakdown,currentEntryScore:currentScore,currentEntryBreakdown:currentBreakdown,hardGates:{passed:Object.entries(gates).filter(([,value])=>value).map(([name])=>name),failed},supportingEvidence:unique([permission.reason,...(trigger.evidence||[]),...(flow.evidence||[])]),effectiveOppositionEvidence:facts.opposition&&facts.opposition.evidence||[],volatilityRegime:volatility.regime||"Unavailable",realizedRangePercentile:num(volatility.realizedRangePercentile),participationState:participation.state||"UNAVAILABLE",participation,flowEffectiveness:flow,chaseDistanceAtr:num(current.originDistanceAtr),remainingRewardRisk:num(geometry.netRr),setupEvidence,triggerEvidence:triggerDiagnostics,entryCondition,data,finalStateReason:stateReason,engineVersion:VERSION,publicationGeneration:null};
    return {direction,confidence:direction==="NO BIAS"?null:Math.round(num(permission.score)||0),entryState:stateName,setupIdentity:setup&&setup.identity||null,setupFamily:setup&&setup.family||null,setupTimeframe:setup&&setup.tf||null,setupQuality:GRADE(setupScore),triggerQuality:GRADE(triggerScore),currentEntryQuality:GRADE(currentScore),entryVerdict:stateName==="TRIGGER ACTIVE"?`READY ${direction}`:"WAIT",reasons,exclusions,triggerIdentity,triggerEvidence:[...(trigger.evidence||[])],dataStatus:facts.fresh?"sufficient":"stale",tone:presentation.tone,visibleState:stateName,definition:presentation.definition,decision,comparisonDiagnostics};
  }
  function createState(){return {evidenceByTf:new Map(),smcCache:new Map(),entryTrackers:new Map(),setupHistories:new Map(),seenTriggerAlertIds:new Set(),seenTriggerAlertOrder:[],evaluationCache:new Map(),fingerprints:new Map()};}
  function clearState(state){Object.values(state).forEach(value=>{if(value instanceof Map||value instanceof Set)value.clear();else if(Array.isArray(value))value.length=0;});}
  function createSignalEngineB(){
    const state=createState();let calculations=0,cacheHits=0,activations=0,deactivations=0,lastDiagnostics=null;
    const engine={
      id:"B",displayName:"Refined blend",version:VERSION,status:"available",state,
      getRequirements(context={}){const horizonId=PROFILES[context.horizonId]?context.horizonId:"quick",profile=PROFILES[horizonId],slots=typeof context.getCanonicalSlots==="function"?context.getCanonicalSlots():[9,21,55,100,200].map((period,index)=>({slotId:`MA${index+1}`,period})),timeframes=unique([profile.early,profile.trigger,profile.primary,...profile.setups,...profile.structures,...profile.boundaries]);const items=timeframes.map(tf=>({tf,historyTarget:DEPTHS[tf]||320,roles:unique([tf===profile.early&&`${tf} early warning`,tf===profile.trigger&&`${tf} post-interaction trigger`,tf===profile.primary&&`${tf} primary direction`,profile.setups.includes(tf)&&`${tf} setup location`,profile.structures.includes(tf)&&`${tf} closed structure`,profile.boundaries.includes(tf)&&`${tf} higher-timeframe boundary`]),signalRequired:true,managementRequired:false}));return {horizonId,engine:{id:"B",profile},slots,items,timeframes};},
      evaluate(context={}){const snapshot=context.snapshot;if(!snapshot)throw new Error("Signal B market snapshot is unavailable");const horizonId=PROFILES[context.horizonId]?context.horizonId:"quick",directionMode=["LONG","SHORT"].includes(String(context.directionMode||"AUTO").toUpperCase())?String(context.directionMode).toUpperCase():"AUTO",fingerprint=[snapshot.signature||snapshot.version,horizonId,directionMode].join("|"),publicationGeneration=Number(context.publicationGeneration)||0;if(state.evaluationCache.has(fingerprint)){cacheHits+=1;const cached=state.evaluationCache.get(fingerprint);cached.comparisonDiagnostics.publicationGeneration=publicationGeneration;lastDiagnostics=cached.comparisonDiagnostics;return cached;}calculations+=1;const facts=extractFacts(snapshot,horizonId,state,directionMode),result=scoreFacts(facts,{horizonId,symbol:snapshot.symbol,version:snapshot.version,directionMode});result.comparisonDiagnostics.publicationGeneration=publicationGeneration;lastDiagnostics=result.comparisonDiagnostics;state.evaluationCache.set(fingerprint,result);state.fingerprints.set(`${horizonId}|${directionMode}`,fingerprint);while(state.evaluationCache.size>24)state.evaluationCache.delete(state.evaluationCache.keys().next().value);return result;},
      evaluateFacts(facts,metadata={}){return scoreFacts(facts,metadata);},extractFacts(snapshot,horizonId="quick",directionMode="AUTO"){return extractFacts(snapshot,horizonId,state,directionMode);},
      onActivate(){activations+=1;},onDeactivate(){deactivations+=1;clearState(state);},reset(){clearState(state);},
      diagnostics(){return {calculations,cacheHits,activations,deactivations,cacheCounts:{evidenceByTf:state.evidenceByTf.size,setupHistories:state.setupHistories.size,evaluationCache:state.evaluationCache.size,fingerprints:state.fingerprints.size},lastPublication:lastDiagnostics,tuning:{directionalPermission:{minimum:58,minimumWinnerMargin:5},setupWeights:{structuralLocation:.30,regimeAlignment:.25,eventLevelQuality:.20,invalidationTargetGeometry:.15,volatilitySuitability:.10},triggerWeights:{postInteractionMicrostructure:.25,reactionDisplacement:.20,directionalFlowEffectiveness:.25,participationPersistence:.15,retestFollowThroughFreshness:.15},currentEntryWeights:{triggerCredibility:.30,distanceFromOrigin:.25,remainingRoomNetRewardRisk:.25,currentAdverseEvidence:.10,volatilityParticipationPersistence:.10},gradeBands:{A:80,B:70,C:60},maximumMaterialTests:3,feeSlippageAllowanceAtr:.08,profiles:PROFILES}};}
    };return engine;
  }

  Object.defineProperty(window,"createSignalEngineB",{value:createSignalEngineB,configurable:true});
})();
