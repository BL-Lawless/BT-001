(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,calc=root.calculations,tranches=root.tranches,decisions=root.exitDecisions;
  if(!C||!calc||!tranches||!decisions)throw new Error("SCALP simulator data dependencies are unavailable");
  const n=calc.n,upper=value=>String(value||"").toUpperCase(),clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
  const EVENT_ACTION="DETECTION_QUALIFIED",DEDUPE_TOLERANCE_MS=5000,PRICE_INTERVAL="1m",PRICE_SYMBOL="BTCUSDT",PAGE_SIZE=1000,KLINE_PAGE_SIZE=1500,BINANCE_PAGE_DELAY_MS=200;

  function timeMs(value){
    const parsed=n(value);if(parsed==null)return null;
    return parsed<1e11?Math.round(parsed*1000):Math.round(parsed);
  }
  function timeframeMs(value){
    const match=String(value||"").trim().match(/^(\d+)([mhd])$/i);if(!match)return 60000;
    return Number(match[1])*({m:60000,h:3600000,d:86400000}[match[2].toLowerCase()]||60000);
  }
  function detectorState(row){
    const value=row&&row.detector_state;
    if(value&&typeof value==="object")return value;
    if(typeof value==="string")try{return JSON.parse(value);}catch(_e){}
    return null;
  }
  function detectorMetric(state,key){
    const direct=n(state&&state[key]),raw=n(state&&state.raw&&state.raw[key]),diagnostic=n(state&&state.rankDiagnostics&&state.rankDiagnostics[key]);
    return direct??raw??diagnostic;
  }
  function normalizeEvent(row){
    const state=detectorState(row);if(!state)return null;
    const source=String(row&&row.source_timeframe||state.source||"").trim().toLowerCase(),direction=upper(state.direction),eventType=upper(state.eventType),candleTimeMs=timeMs(state.candleTime),rank=n(state.rankValue??(state.rankDiagnostics&&state.rankDiagnostics.rankValue));
    if(!source||!["LONG","SHORT"].includes(direction)||!["CROSS","BOUNCE"].includes(eventType)||candleTimeMs==null||rank==null)return null;
    return {sourceTimeframe:source,direction,eventType,candleTime:n(state.candleTime),candleTimeMs,signalCloseTimeMs:candleTimeMs+timeframeMs(source)-1,rank,fastSlope:detectorMetric(state,"fastSlope"),slowSlope:detectorMetric(state,"slowSlope"),separation:detectorMetric(state,"separation"),previousFastSlope:detectorMetric(state,"previousFastSlope"),previousGap:detectorMetric(state,"previousGap"),atr:detectorMetric(state,"atr"),priorAtr:detectorMetric(state,"priorAtr"),atrChange:detectorMetric(state,"atrChange"),directionalAccelerationAtr:detectorMetric(state,"directionalAccelerationAtr"),relativeVolume:detectorMetric(state,"relativeVolume"),eventId:String(state.eventId||state.freshnessKey||`${source}|${direction}|${eventType}|${candleTimeMs}`),detectorState:clone(state)};
  }
  function dedupeEvents(rows,{toleranceMs=DEDUPE_TOLERANCE_MS}={}){
    const normalized=(Array.isArray(rows)?rows:[]).filter(row=>!row||!row.action||upper(row.action)===EVENT_ACTION).map(normalizeEvent).filter(Boolean).sort((a,b)=>a.sourceTimeframe.localeCompare(b.sourceTimeframe)||a.direction.localeCompare(b.direction)||a.candleTimeMs-b.candleTimeMs||b.rank-a.rank),groups=[];
    for(const event of normalized){
      const previous=groups[groups.length-1],same=previous&&previous.sourceTimeframe===event.sourceTimeframe&&previous.direction===event.direction&&event.candleTimeMs-previous.anchorTimeMs<=toleranceMs;
      if(!same)groups.push({sourceTimeframe:event.sourceTimeframe,direction:event.direction,anchorTimeMs:event.candleTimeMs,event});
      else if(event.rank>previous.event.rank)previous.event=event;
    }
    return groups.map(group=>group.event).sort((a,b)=>a.candleTimeMs-b.candleTimeMs||a.sourceTimeframe.localeCompare(b.sourceTimeframe)||a.direction.localeCompare(b.direction));
  }

  async function fetchSupabaseEvents(){
    const supabase=window.BT001Supabase,rest=window.restService;
    if(!supabase||typeof supabase.configured!=="function"||!supabase.configured())throw new Error("Supabase URL/anon key are not configured");
    if(!rest||typeof rest.get!=="function")throw new Error("services/rest.service.js (window.restService) is unavailable");
    const base=String(supabase.getUrl()).replace(/\/+$/,""),key=supabase.getAnonKey(),rows=[];
    for(let offset=0;;offset+=PAGE_SIZE){
      const query=new URLSearchParams({select:"action,source_timeframe,detector_state",action:`eq.${EVENT_ACTION}`,detector_state:"not.is.null",limit:String(PAGE_SIZE),offset:String(offset)});
      const batch=await rest.get(`${base}/rest/v1/scalp_activity_log?${query}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
      if(!Array.isArray(batch))throw new Error("Invalid Supabase scalp activity response");
      rows.push(...batch);if(batch.length<PAGE_SIZE)break;
    }
    return rows;
  }
  async function fetchBinancePage(interval,endMs,limit,symbol){
    if(typeof window.klinesForInterval!=="function")throw new Error("The app Binance historical-data function is unavailable");
    return window.klinesForInterval(interval,endMs,limit,symbol);
  }
  function normalizeCandle(row){
    if(Array.isArray(row))return {openTime:n(row[0]),closeTime:n(row[6]),open:n(row[1]),high:n(row[2]),low:n(row[3]),close:n(row[4]),volume:n(row[5])};
    const explicitOpen=n(row&&row.openTime),explicitClose=n(row&&row.closeTime),openTime=explicitOpen??timeMs(row&&row.time),closeTime=explicitClose,open=n(row&&row.open),high=n(row&&row.high),low=n(row&&row.low),close=n(row&&row.close),volume=n(row&&row.volume);
    return {openTime,closeTime:closeTime??(openTime==null?null:openTime+60000-1),open,high,low,close,volume};
  }
  function normalizeCandles(rows){
    const byTime=new Map();
    for(const raw of Array.isArray(rows)?rows:[]){const row=normalizeCandle(raw);if(row.openTime!=null&&row.closeTime!=null&&row.open>0&&row.high>0&&row.low>0&&row.close>0)byTime.set(row.openTime,row);}
    return [...byTime.values()].sort((a,b)=>a.openTime-b.openTime);
  }
  async function fetchHistoricalCandles(events,fetchPage=fetchBinancePage,now=Date.now){
    if(!events.length)return [];
    const startMs=Math.min(...events.map(event=>event.candleTimeMs)),endMs=Math.max(n(now())||Date.now(),Math.max(...events.map(event=>event.signalCloseTimeMs))),rows=[];let cursor=endMs,pages=0;
    while(cursor>=startMs&&pages<5000){
      if(pages>0)await new Promise(resolve=>setTimeout(resolve,BINANCE_PAGE_DELAY_MS));
      const batch=await fetchPage(PRICE_INTERVAL,cursor,KLINE_PAGE_SIZE,PRICE_SYMBOL);pages+=1;
      const normalized=normalizeCandles(batch);if(!normalized.length)break;
      rows.push(...normalized);const oldest=normalized[0].openTime;
      if(oldest<=startMs||normalized.length<KLINE_PAGE_SIZE)break;
      cursor=oldest-1;
    }
    return normalizeCandles(rows).filter(row=>row.closeTime>=startMs&&row.openTime<=endMs);
  }

  function simulationConfig(input={}){
    const filters={tickSize:n(input.filters&&input.filters.tickSize)||.1,stepSize:n(input.filters&&input.filters.stepSize)||.001},rates=calc.feeRates(input.rates||{});
    const requestedTimeframe=String(input.sourceTimeframe||"ANY").trim().toLowerCase(),sourceTimeframe=requestedTimeframe==="any"?"ANY":C.sources.includes(requestedTimeframe)?requestedTimeframe:"ANY";
    const optional=value=>n(value);
    return {
      minimumRank:Math.max(0,n(input.minimumRank)??C.defaults.minimumRank),direction:["LONG","SHORT","ANY"].includes(upper(input.direction))?upper(input.direction):"ANY",eventType:["CROSS","BOUNCE","ANY"].includes(upper(input.eventType))?upper(input.eventType):"ANY",sourceTimeframe,
      minFastSlope:optional(input.minFastSlope),maxFastSlope:optional(input.maxFastSlope),minSlowSlope:optional(input.minSlowSlope),maxSlowSlope:optional(input.maxSlowSlope),minSeparation:optional(input.minSeparation),maxSeparation:optional(input.maxSeparation),minRelativeVolume:optional(input.minRelativeVolume),maxRelativeVolume:optional(input.maxRelativeVolume),
      slopeWeight:Math.max(0,n(input.slopeWeight)??1),minEffectiveSeparation:Math.max(0,n(input.minEffectiveSeparation)??0),volumeGateThreshold:Math.max(Number.EPSILON,n(input.volumeGateThreshold)??1),minVolumeGatedAngle:Math.max(0,n(input.minVolumeGatedAngle)??0),
      lot:calc.normalizeLot(n(input.lot)??n(C.defaults.lot),filters),target:Math.max(0,n(input.target)??n(C.defaults.target)),stop:Math.max(0,n(input.stop)??n(C.defaults.stop)),maxConcurrentAutoPositions:Math.max(1,Math.round(n(input.maxConcurrentAutoPositions)??C.defaults.maxConcurrentAutoPositions)),
      profitLockEnabled:input.profitLockEnabled===true,lockThresholdPct:Math.max(1,Math.min(100,n(input.lockThresholdPct)??C.defaults.lockThresholdPct)),lockPortionPct:Math.max(1,Math.min(99,n(input.lockPortionPct)??C.defaults.lockPortionPct)),
      rankBoostEnabled:input.rankBoostEnabled===true,rankBoostThreshold:Math.max(0,Math.min(100,n(input.rankBoostThreshold)??C.defaults.rankBoostThreshold)),rankBoostPoints:Math.max(0,n(input.rankBoostPoints)??C.defaults.rankBoostPoints),filters,rates
    };
  }
  function exploratoryMetrics(event,config){
    const fastSlope=n(event&&event.fastSlope),separation=n(event&&event.separation),relativeVolume=n(event&&event.relativeVolume),slopeWeight=Math.max(0,n(config&&config.slopeWeight)??1),volumeGateThreshold=Math.max(Number.EPSILON,n(config&&config.volumeGateThreshold)??1);
    return {
      effectiveSeparation:fastSlope==null||separation==null?null:separation+slopeWeight*Math.abs(fastSlope),
      volumeGatedAngle:fastSlope==null||relativeVolume==null?null:Math.abs(fastSlope)*Math.min(1,Math.max(0,relativeVolume)/volumeGateThreshold)
    };
  }
  function withinRange(value,min,max){
    if(min==null&&max==null)return true;
    const numeric=n(value);return numeric!=null&&(min==null||numeric>=min)&&(max==null||numeric<=max);
  }
  function eventAllowed(event,config){
    const metrics=exploratoryMetrics(event,config),effectiveActive=config.minEffectiveSeparation>0,volumeAngleActive=config.minVolumeGatedAngle>0;
    return event.rank>=config.minimumRank&&(config.direction==="ANY"||event.direction===config.direction)&&(config.eventType==="ANY"||event.eventType===config.eventType)&&(config.sourceTimeframe==="ANY"||event.sourceTimeframe===config.sourceTimeframe)
      &&withinRange(event.fastSlope,config.minFastSlope,config.maxFastSlope)&&withinRange(event.slowSlope,config.minSlowSlope,config.maxSlowSlope)&&withinRange(event.separation,config.minSeparation,config.maxSeparation)&&withinRange(event.relativeVolume,config.minRelativeVolume,config.maxRelativeVolume)
      &&(!effectiveActive||(metrics.effectiveSeparation!=null&&metrics.effectiveSeparation>=config.minEffectiveSeparation))
      &&(!volumeAngleActive||(metrics.volumeGatedAngle!=null&&metrics.volumeGatedAngle>=config.minVolumeGatedAngle));
  }
  function entryCandleIndex(candles,event){
    let low=0,high=candles.length-1,answer=-1;
    while(low<=high){const mid=(low+high)>>1;if(candles[mid].closeTime>=event.signalCloseTimeMs){answer=mid;high=mid-1;}else low=mid+1;}
    return answer;
  }
  function pnlAt(tranche,qty,price,exitRate){
    const quantity=n(qty)||0,entry=n(tranche.entryPrice)||0,exit=n(price)||0,side=tranche.direction==="LONG"?1:-1,gross=(exit-entry)*quantity*side,entryFee=(n(tranche.entryCommission)||0)*(quantity/Math.max(quantity,n(tranche.filledQty)||quantity));
    return gross-entryFee-exit*quantity*(n(exitRate)||0);
  }
  function openTranche(book,event,candle,config,sequence){
    const qty=config.lot,entryPrice=candle.close,entryCommission=entryPrice*qty*config.rates.taker,base={trancheId:`SIM-${event.direction[0]}-${sequence}`,direction:event.direction,source:event.sourceTimeframe,eventId:event.eventId,eventType:event.eventType,triggerRank:event.rank,requestedQty:qty,filledQty:qty,remainingQty:qty,entryPrice,entryCommission,status:"ACTIVE",createdAt:event.signalCloseTimeMs,profitLockEnabled:config.profitLockEnabled,lockThresholdPct:config.lockThresholdPct,lockPortionPct:config.lockPortionPct,profitLockTriggered:false,profitLockPending:false,rankBoostEnabled:config.rankBoostEnabled,rankBoostThreshold:config.rankBoostThreshold,rankBoostPoints:config.rankBoostPoints,realizedPnlUsd:0,mddUsd:0};
    const levels=calc.prices({direction:event.direction,entryPrice,qty,entryCommission,target:config.target,stop:config.stop,makerRate:config.rates.maker,takerRate:config.rates.taker,conservativeTpRate:config.rates.conservativeTp,fundingCost:0,tickSize:config.filters.tickSize}),boost=decisions.rankBoost({tranche:base,eventRank:event.rank,normalTp:levels.tp,tickSize:config.filters.tickSize});
    base.pslPrice=levels.sl;base.partialTpPrice=boost.tpPrice;base.basePartialTpPrice=boost.normalTp;base.rankBoostApplied=boost.applied;
    return tranches.add(book,base);
  }
  function updateMdd(tranche,candle,decision){
    const adverse=tranche.direction==="LONG"?(decision&&decision.reason==="PSL"?decision.exitPrice:candle.low):(decision&&decision.reason==="PSL"?decision.exitPrice:candle.high),drawdown=Math.max(0,(tranche.direction==="LONG"?tranche.entryPrice-adverse:adverse-tranche.entryPrice)*(n(tranche.filledQty)||0));
    tranche.mddUsd=Math.max(n(tranche.mddUsd)||0,drawdown);
  }
  function closeOutcome(book,tranche,decision,eventById,candle,config){
    const qty=n(tranche.remainingQty)||0,rate=decision.reason==="PARTIAL_TP"?config.rates.conservativeTp:config.rates.taker,pnl=(n(tranche.realizedPnlUsd)||0)+pnlAt(tranche,qty,decision.exitPrice,rate),event=eventById.get(tranche.eventId),metrics=exploratoryMetrics(event,config);
    tranches.close(book,tranche.trancheId,{reason:decision.reason,closedAt:candle.closeTime});
    return {eventId:tranche.eventId,candleTime:event.candleTime,candleTimeMs:event.candleTimeMs,entryTimeMs:tranche.createdAt,exitTimeMs:candle.closeTime,sourceTimeframe:event.sourceTimeframe,direction:tranche.direction,eventType:event.eventType,rank:event.rank,fastSlope:event.fastSlope,slowSlope:event.slowSlope,separation:event.separation,previousFastSlope:event.previousFastSlope,previousGap:event.previousGap,atr:event.atr,priorAtr:event.priorAtr,atrChange:event.atrChange,directionalAccelerationAtr:event.directionalAccelerationAtr,relativeVolume:event.relativeVolume,effectiveSeparation:metrics.effectiveSeparation,volumeGatedAngle:metrics.volumeGatedAngle,lot:n(tranche.filledQty),entryPrice:tranche.entryPrice,exitPrice:decision.exitPrice,exitReason:decision.reason,pnlUsd:pnl,mddUsd:n(tranche.mddUsd)||0,profitLockApplied:!!tranche.profitLockTriggered,rankBoostApplied:!!tranche.rankBoostApplied};
  }
  function applyProfitLock(tranche,candle,config){
    const triggerPrice=tranche.direction==="LONG"?candle.high:candle.low,lock=decisions.profitLockDecision({tranche,price:triggerPrice,filters:config.filters});
    if(!lock.reached||!(lock.quantity>0))return false;
    const before=n(tranche.remainingQty)||0,remaining=calc.normalizeLot(Math.max(0,before-lock.quantity),config.filters),allocatedEntryCommission=(n(tranche.entryCommission)||0)*(remaining/Math.max(remaining,n(tranche.filledQty)||remaining)),breakeven=calc.feeAwareBreakeven({direction:tranche.direction,entryPrice:tranche.entryPrice,qty:remaining,entryCommission:allocatedEntryCommission,exitRate:config.rates.taker,tickSize:config.filters.tickSize});
    tranche.realizedPnlUsd=(n(tranche.realizedPnlUsd)||0)+pnlAt(tranche,lock.quantity,lock.level,config.rates.taker);tranche.profitLockTriggered=true;tranche.profitLockPrice=lock.level;tranche.profitLockClosedQty=lock.quantity;tranche.remainingQty=remaining;tranche.feeAwareBreakevenPrice=breakeven;tranche.pslPrice=breakeven;
    return true;
  }
  function simulate(events,candles,input={}){
    const config=simulationConfig(input),book=tranches.create({accountSlot:"main",symbol:PRICE_SYMBOL}),eligible=events.filter(event=>eventAllowed(event,config)),scheduled=new Map(),eventById=new Map(eligible.map(event=>[event.eventId,event]));
    for(const event of eligible){const index=entryCandleIndex(candles,event);if(index<0)continue;const bucket=scheduled.get(index)||[];bucket.push(event);scheduled.set(index,bucket);}
    const trades=[],skipped=[];let sequence=0;
    for(let index=0;index<candles.length;index++){
      const candle=candles[index];
      for(const direction of tranches.DIRECTIONS){
        for(const tranche of [...tranches.activeTranches(book,direction)]){
          const exit=decisions.evaluateProtectionCandle({tranche,candle});updateMdd(tranche,candle,exit);
          if(exit.resolved){trades.push(closeOutcome(book,tranche,exit,eventById,candle,config));continue;}
          applyProfitLock(tranche,candle,config);
        }
      }
      for(const event of scheduled.get(index)||[]){
        if(!(config.lot>0)||!(config.target>0)||!(config.stop>0)){skipped.push({eventId:event.eventId,reason:"INVALID_RISK_INPUTS"});continue;}
        if(!tranches.canAdd(book,event.direction,config.maxConcurrentAutoPositions)){skipped.push({eventId:event.eventId,reason:"TRANCHE_LIMIT"});continue;}
        openTranche(book,event,candle,config,++sequence);
      }
    }
    const endOfDataExcluded=tranches.DIRECTIONS.reduce((sum,direction)=>sum+tranches.count(book,direction),0);
    return {config,trades,eventsShown:eligible.length,skipped,diagnostics:{endOfDataExcluded}};
  }

  function create(options={}){
    const fetchEvents=options.fetchEvents||fetchSupabaseEvents,fetchPage=options.fetchKlinePage||fetchBinancePage,now=options.now||Date.now;let cache=null;
    return {
      async loadData(simulationInput={}){
        const rawEvents=await fetchEvents(),events=dedupeEvents(rawEvents),candles=await fetchHistoricalCandles(events,fetchPage,now),simulation=simulate(events,candles,simulationInput);
        cache={loadedAt:n(now())||Date.now(),events,candles,simulation};return cache;
      },
      recalculate(simulationInput={}){if(!cache)throw new Error("Simulator data has not been loaded");cache={...cache,simulation:simulate(cache.events,cache.candles,simulationInput)};return cache.simulation;},
      getCache(){return cache;}
    };
  }

  const service=create();
  root.simulatorData=Object.freeze({
    EVENT_ACTION,DEDUPE_TOLERANCE_MS,PRICE_INTERVAL,PRICE_SYMBOL,normalizeEvent,dedupeEvents,normalizeCandles,fetchSupabaseEvents,fetchHistoricalCandles,simulationConfig,exploratoryMetrics,eventAllowed,simulate,create,
    loadData:input=>service.loadData(input),recalculate:input=>service.recalculate(input),getCache:()=>service.getCache()
  });
})();
