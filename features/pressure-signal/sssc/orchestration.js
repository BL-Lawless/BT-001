(() => {
  "use strict";

  const DEFAULT_TFS=[["1D","1d"],["4H","4h"],["1H","1h"],["15M","15m"],["5M","5m"],["3M","3m"],["1M","1m"]];
  const DEFAULT_LIVE_TFS=["15m","5m","3m","1m"];
  const DEFAULT_MA_PERIODS=[9,21,55,100,200];

  function warmupTargets(slots){
    const periods=Array.isArray(slots)?slots.map(slot=>Math.max(1,Math.round(Number(slot&&slot.period)||0))).filter(Number.isFinite):[];
    const longestPeriod=periods.length?Math.max(...periods):Math.max(...DEFAULT_MA_PERIODS);
    return {
      longestPeriod,
      minimum:Math.max(longestPeriod+16,Math.ceil(longestPeriod*3)),
      full:Math.max(longestPeriod+16,Math.ceil(longestPeriod*5))
    };
  }

  function wsBase(rawUrl){
    const raw=String(rawUrl||"wss://fstream.binance.com/market/stream").replace(/\/+$/,"");
    if(/\/market\/stream$/i.test(raw))return raw;
    if(/\/market\/ws$/i.test(raw))return raw.replace(/\/market\/ws$/i,"/market/stream");
    if(/\/(?:public|private)\/stream$/i.test(raw))return raw.replace(/\/(?:public|private)\/stream$/i,"/market/stream");
    if(/\/(?:public|private)\/ws$/i.test(raw))return raw.replace(/\/(?:public|private)\/ws$/i,"/market/stream");
    if(/\/stream$/i.test(raw))return raw.replace(/\/stream$/i,"/market/stream");
    if(/\/ws$/i.test(raw))return raw.replace(/\/ws$/i,"/market/stream");
    if(/\/(?:public|market|private)$/i.test(raw))return raw.replace(/\/(?:public|market|private)$/i,"/market/stream");
    return raw+"/market/stream";
  }

  function createOrchestration(options={}){
    const tfs=Array.isArray(options.tfs)?options.tfs:DEFAULT_TFS;
    const liveTfs=new Set(options.liveTfs||DEFAULT_LIVE_TFS);
    const getSlots=options.getSlots;
    const getCalculation=options.getCalculation;
    const getSymbol=options.getSymbol;
    const fetchKlines=options.fetchKlines;
    const connectWebSocket=options.connectWebSocket;
    const getWsUrl=options.getWsUrl;
    const onUpdate=typeof options.onUpdate==="function"?options.onUpdate:()=>{};
    const warn=typeof options.warn==="function"?options.warn:()=>{};
    const now=typeof options.now==="function"?options.now:Date.now;
    const setIntervalFn=options.setIntervalFn||setInterval;
    const clearIntervalFn=options.clearIntervalFn||clearInterval;
    const setTimeoutFn=options.setTimeoutFn||setTimeout;
    const clearTimeoutFn=options.clearTimeoutFn||clearTimeout;
    const klineLimit=Math.max(1,Number(options.klineLimit)||1500);
    const heartbeatMs=Math.max(1,Number(options.heartbeatMs)||500);
    const closedCandleLagGuard=options.closedCandleLagGuard===true;
    const closedCandleGraceMs=Math.max(1000,Number(options.closedCandleGraceMs)||15000);
    const closedCandleCheckIntervalMs=Math.max(1000,Number(options.closedCandleCheckIntervalMs)||5000);
    const visibilityRepairMaxCandles=Math.max(1,Number(options.visibilityRepairMaxCandles)||100);

    let data={},lastFullFetch=0,currentSymbol="";
    let privateCandlesByTf={},privateFormingByTf={};
    let privateSocket=null,privateGeneration=0,calcTimer=null,started=false;
    let privateEverOpened=false,continuityBlocked=false,repairPromise=null,repairTimer=null,privateWindowTarget=0,lastClosedCandleCheckAt=0;
    let queuedSocketMessages=[],socketEvents=[],repairAttempts=0,repairSuccesses=0,repairFailures=0;
    let visibilityRepairAttempts=0,visibilityRepairSuccesses=0,visibilityRepairFallbacks=0,lastVisibilityRepair=null;

    function snapshot(){
      return {
        data:{...data},lastFullFetch,started,privateCandlesByTf,privateFormingByTf,
        continuity:{
          blocked:continuityBlocked,repairing:!!repairPromise,queuedMessages:queuedSocketMessages.length,
          repairAttempts,repairSuccesses,repairFailures,socketEvents:socketEvents.slice(),
          visibilityRepair:{maxCandles:visibilityRepairMaxCandles,attempts:visibilityRepairAttempts,successes:visibilityRepairSuccesses,fallbacks:visibilityRepairFallbacks,last:lastVisibilityRepair}
        }
      };
    }
    function publish(){onUpdate(snapshot());}
    function vwap(rows){
      let quote=0,base=0;
      for(const candle of rows){
        const bv=Number(candle.baseVolume??candle.volume),qv=Number(candle.quoteVolume);
        if(Number.isFinite(qv)&&Number.isFinite(bv)&&bv>0){quote+=qv;base+=bv;}
      }
      return base>0?quote/base:null;
    }
    function decorateDiagnostic(core,rows){
      if(!core||!core.available)return core;
      const value=vwap(rows);
      const event=value==null?"Unavailable":core.price>value?"Above":"Below";
      return {...core,vwap:value,events:{...core.events,vwap:event,earlyWarning:"None"}};
    }
    function buildDiagnosticSet(label,tf){
      const slots=getSlots({allowStartupFallback:true});
      if(!Array.isArray(slots)||slots.length!==5)return {tf:label,interval:tf,available:false,reason:"ma-slots-unavailable",mode:liveTfs.has(tf)?"live":"confirmed"};
      const engine=getCalculation();
      if(!engine)return {tf:label,interval:tf,available:false,reason:"calculation-module-unavailable"};
      const targets=warmupTargets(slots);
      const closedRows=(privateCandlesByTf[tf]||[]).slice(-targets.full);
      const forming=privateFormingByTf[tf];
      const liveRows=liveTfs.has(tf)&&forming?closedRows.concat({...forming}).slice(-targets.full):closedRows.slice();
      const input={label,interval:tf,slots,minimumRows:targets.minimum,fullRows:targets.full};
      const confirmedDiagnostic=decorateDiagnostic(engine.calculateTimeframe({...input,rows:closedRows}),closedRows);
      const liveDiagnostic=decorateDiagnostic(engine.calculateTimeframe({...input,rows:liveRows}),liveRows);
      const warning=engine.deriveEarlyWarning(confirmedDiagnostic,liveDiagnostic);
      const mode=liveTfs.has(tf)&&liveRows.length>closedRows.length?"live":"confirmed";
      const active=liveTfs.has(tf)&&liveDiagnostic&&liveDiagnostic.available?liveDiagnostic:confirmedDiagnostic;
      return active&&active.available?{
        ...active,
        mode:liveTfs.has(tf)?mode:"confirmed",
        confirmedDiagnostic,
        liveDiagnostic,
        earlyWarning:warning,
        events:{...active.events,earlyWarning:warning?warning.label:"None"}
      }:active;
    }
    function calculate(){
      const liveSymbol=getSymbol();
      if(currentSymbol&&currentSymbol!==liveSymbol){
        data={};privateCandlesByTf={};privateFormingByTf={};
        refresh(true).catch(error=>warn("SSSC symbol refresh failed",error));
        return;
      }
      currentSymbol=liveSymbol;
      if(checkClosedCandleProgress())return;
      for(const [label,tf] of tfs){
        data[label]=buildDiagnosticSet(label,tf)||{tf:label,interval:tf,available:false,reason:"No private data",mode:liveTfs.has(tf)?"live":"confirmed"};
      }
      publish();
    }
    function intervalSeconds(tf){return {"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400}[tf]||60;}
    function closedCandleLags(at=now()){
      const current=Number(at),lags=[];
      if(!Number.isFinite(current))return lags;
      for(const [,tf] of tfs){
        const rows=privateCandlesByTf[tf]||[];
        if(!rows.length)continue;
        const stepMs=intervalSeconds(tf)*1000,boundaryMs=Math.floor(current/stepMs)*stepMs;
        if(current-boundaryMs<closedCandleGraceMs)continue;
        const expectedOpenTime=(boundaryMs-stepMs)/1000,lastOpenTime=Number(rows.at(-1)&&rows.at(-1).time);
        if(!Number.isFinite(lastOpenTime)||lastOpenTime<expectedOpenTime)lags.push({tf,lastOpenTime:Number.isFinite(lastOpenTime)?lastOpenTime:null,expectedOpenTime,behindCandles:Number.isFinite(lastOpenTime)?Math.round((expectedOpenTime-lastOpenTime)/(stepMs/1000)):null});
      }
      return lags;
    }
    function checkClosedCandleProgress(){
      const current=now();
      if(!closedCandleLagGuard||!started||!lastFullFetch||!privateWindowTarget||continuityBlocked||repairPromise||current-lastClosedCandleCheckAt<closedCandleCheckIntervalMs)return false;
      lastClosedCandleCheckAt=current;
      const lags=closedCandleLags(current);
      if(!lags.length)return false;
      warn("Closed-candle boundary lag detected; forcing REST reseed",{lags,graceMs:closedCandleGraceMs});
      repairContinuity(privateWindowTarget,"closed-candle-lag").catch(()=>{});
      publish();
      return true;
    }
    function normalizedPrivateRows(tf,rows,target){
      const ordered=(Array.isArray(rows)?rows:[]).filter(row=>row&&Number.isFinite(Number(row.time))).sort((a,b)=>Number(a.time)-Number(b.time));
      const unique=[];
      for(const row of ordered){
        if(unique.length&&Number(unique.at(-1).time)===Number(row.time))unique[unique.length-1]={...row};
        else unique.push({...row});
      }
      const last=unique.at(-1),forming=last&&Number(last.time)*1000+intervalSeconds(tf)*1000>now();
      const formingRow=forming?{...unique.pop(),final:false}:null;
      return {closed:unique.map(row=>({...row,final:true})).slice(-target),forming:formingRow};
    }
    function replacePrivateRows(tf,rows,target){
      const normalized=normalizedPrivateRows(tf,rows,target);
      privateCandlesByTf[tf]=normalized.closed;
      if(normalized.forming)privateFormingByTf[tf]=normalized.forming;else delete privateFormingByTf[tf];
      return normalized;
    }
    function upsertPrivateKline(tf,row,closed,target){
      if(!row)return;
      if(!closed){privateFormingByTf[tf]={...row,final:false};return;}
      const rows=privateCandlesByTf[tf]||(privateCandlesByTf[tf]=[]);
      const index=rows.findIndex(item=>Number(item.time)===Number(row.time));
      if(index>=0)rows[index]={...row,final:true};else rows.push({...row,final:true});
      rows.sort((a,b)=>Number(a.time)-Number(b.time));
      while(rows.length>target)rows.shift();
      if(privateFormingByTf[tf]&&Number(privateFormingByTf[tf].time)<=Number(row.time))delete privateFormingByTf[tf];
    }
    async function loadPrivateWindow(tf,target){
      let rows=[],cursor=now();
      while(rows.length<target+1){
        const remaining=target+1-rows.length;
        const batch=await fetchKlines(tf,cursor,Math.min(klineLimit,remaining),getSymbol());
        if(!batch.length)break;
        rows=batch.concat(rows);
        const oldest=batch[0];
        if(batch.length<Math.min(klineLimit,remaining)||!oldest)break;
        cursor=Number(oldest.openTime||Number(oldest.time)*1000)-1;
      }
      return normalizedPrivateRows(tf,rows,target);
    }
    async function fetchPrivateWindow(tf,target){
      const loaded=await loadPrivateWindow(tf,target);
      privateCandlesByTf[tf]=loaded.closed;
      if(loaded.forming)privateFormingByTf[tf]=loaded.forming;else delete privateFormingByTf[tf];
      return loaded;
    }
    function continuityGaps(tf,rows){
      const source=Array.isArray(rows)?rows:[],step=intervalSeconds(tf),gaps=[];
      for(let index=1;index<source.length;index++){
        const previous=Number(source[index-1]&&source[index-1].time),current=Number(source[index]&&source[index].time);
        if(!Number.isFinite(previous)||!Number.isFinite(current)||current-previous!==step){
          gaps.push({tf,previousTime:previous,currentTime:current,expectedTime:Number.isFinite(previous)?previous+step:null});
        }
      }
      return gaps;
    }
    function recordSocketEvent(type,detail={}){
      socketEvents.push({type,at:now(),...detail});
      if(socketEvents.length>100)socketEvents=socketEvents.slice(-100);
    }
    function scheduleRepairRetry(target,reason){
      if(repairTimer!=null)return;
      repairTimer=setTimeoutFn(()=>{
        repairTimer=null;
        repairContinuity(target,`${reason}-retry`).catch(()=>{});
      },Math.min(30000,4000*Math.max(1,repairFailures)));
    }
    async function repairContinuity(target,reason="ws-reconnect"){
      if(repairPromise)return repairPromise;
      continuityBlocked=true;repairAttempts+=1;recordSocketEvent("repair-start",{reason});
      repairPromise=(async()=>{
        try{
          const loaded=await Promise.all(tfs.map(async ([,tf])=>[tf,await loadPrivateWindow(tf,target)]));
          const failures=[];
          for(const [tf,value] of loaded){
            const gaps=continuityGaps(tf,value.closed);
            if(gaps.length)failures.push(...gaps);
          }
          if(failures.length)throw Object.assign(new Error("SSSC REST reconnect backfill left candle gaps"),{gaps:failures});
          // Commit all timeframes atomically so calculations never observe a partially repaired set.
          const nextClosed={},nextForming={};
          for(const [tf,value] of loaded){nextClosed[tf]=value.closed;if(value.forming)nextForming[tf]=value.forming;}
          privateCandlesByTf=nextClosed;privateFormingByTf=nextForming;lastFullFetch=now();
          continuityBlocked=false;repairSuccesses+=1;recordSocketEvent("repair-success",{reason});
          const queued=queuedSocketMessages.splice(0);
          for(const message of queued)applySocketKline(message,target,{publish:false});
          calculate();
          return true;
        }catch(error){
          repairFailures+=1;
          const gaps=Array.isArray(error&&error.gaps)?error.gaps:[];
          recordSocketEvent("repair-failed",{reason,error:error&&error.message||String(error),gaps});
          warn("SSSC reconnect continuity repair failed",{reason,error,gaps});
          scheduleRepairRetry(target,reason);
          return false;
        }finally{repairPromise=null;}
      })();
      return repairPromise;
    }
    function applySocketKline(message,target,{publish=true}={}){
      if(!message||message.e!=="kline"||!message.k||message.s!==getSymbol())return false;
      const k=message.k;
      const row={time:Math.floor(Number(k.t)/1000),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),baseVolume:Number(k.v),quoteVolume:Number(k.q),
        tradeCount:Number(k.n),takerBuyBase:Number(k.V),takerBuyQuote:Number(k.Q),openTime:Number(k.t),closeTime:Number(k.T),source:"sssc-ws"};
      upsertPrivateKline(k.i,row,k.x===true,target);
      if(publish)calculate();
      return true;
    }
    function closePrivateSocket(){
      if(!privateSocket)return;
      try{
        if(typeof privateSocket.disconnect==="function")privateSocket.disconnect();
        else if(typeof privateSocket.close==="function")privateSocket.close();
      }catch(_error){}
      privateSocket=null;
    }
    function connectPrivateSocket(target){
      closePrivateSocket();
      const token=++privateGeneration;
      const streams=tfs.map(([,tf])=>getSymbol().toLowerCase()+"@kline_"+tf);
      privateSocket=connectWebSocket(wsBase(getWsUrl())+"?streams="+streams.join("/"),{
        connectionKey:"sssc-private-market-data",reconnect:true,
        onOpen:()=>{
          const reconnect=privateEverOpened,needsRepair=reconnect||continuityBlocked;privateEverOpened=true;
          recordSocketEvent(reconnect?"reconnected":"opened");
          if(needsRepair)return repairContinuity(target,reconnect?"ws-reconnect":"initial-connect-repair");
          continuityBlocked=false;
          return Promise.resolve(true);
        },
        onClose:event=>{continuityBlocked=true;recordSocketEvent("closed",{code:event&&event.code||null});},
        onError:()=>{continuityBlocked=true;recordSocketEvent("error");},
        onMessage:event=>{
        if(token!==privateGeneration)return;
        let message;
        try{message=JSON.parse(event.data);message=message&&message.data?message.data:message;}catch(_error){return;}
        if(continuityBlocked||repairPromise){queuedSocketMessages.push(message);if(queuedSocketMessages.length>5000)queuedSocketMessages.shift();return;}
        applySocketKline(message,target);
      }});
    }
    async function fullReload({reconnect=true,reason="full-refresh"}={}){
      currentSymbol=getSymbol();
      const targets=warmupTargets(getSlots({allowStartupFallback:true}));
      privateWindowTarget=targets.full;
      continuityBlocked=true;
      let success=false;
      try{
        const loaded=await Promise.all(tfs.map(async ([,tf])=>[tf,await loadPrivateWindow(tf,targets.full)]));
        const gaps=loaded.flatMap(([tf,value])=>continuityGaps(tf,value.closed));
        if(gaps.length)throw Object.assign(new Error("SSSC private seed contains candle gaps"),{gaps});
        const nextClosed={},nextForming={};
        for(const [tf,value] of loaded){nextClosed[tf]=value.closed;if(value.forming)nextForming[tf]=value.forming;}
        privateCandlesByTf=nextClosed;privateFormingByTf=nextForming;continuityBlocked=false;
        if(repairTimer!=null){clearTimeoutFn(repairTimer);repairTimer=null;}
        lastFullFetch=now();success=true;
        const queued=queuedSocketMessages.splice(0);
        for(const message of queued)applySocketKline(message,targets.full,{publish:false});
      }catch(error){continuityBlocked=true;warn("SSSC private seed failed",{error,gaps:error&&error.gaps||[]});}
      calculate();
      if(reconnect)connectPrivateSocket(targets.full);
      recordSocketEvent(success?"full-reload-success":"full-reload-failed",{reason,reconnect});
      return success;
    }
    async function refresh(){
      return fullReload({reconnect:true,reason:"refresh"});
    }
    function visibilityGapPlan(at=now()){
      const current=Number(at),items=[];
      if(!Number.isFinite(current))return {repairable:false,reason:"invalid-clock",items,totalMissing:Infinity};
      for(const [,tf] of tfs){
        const rows=privateCandlesByTf[tf]||[],last=Number(rows.at(-1)&&rows.at(-1).time),step=intervalSeconds(tf);
        if(!rows.length||!Number.isFinite(last))return {repairable:false,reason:`missing-${tf}-history`,items,totalMissing:Infinity};
        const activeOpen=Math.floor(current/(step*1000))*step,expectedClosed=activeOpen-step;
        const delta=expectedClosed-last;
        if(delta<0||delta%step!==0)return {repairable:false,reason:`invalid-${tf}-closed-tail`,items,totalMissing:Infinity};
        items.push({tf,lastOpenTime:last,expectedClosedOpenTime:expectedClosed,activeOpenTime:activeOpen,missingCandles:delta/step});
      }
      const totalMissing=items.reduce((sum,item)=>sum+item.missingCandles,0);
      return {repairable:totalMissing<=visibilityRepairMaxCandles,reason:totalMissing<=visibilityRepairMaxCandles?"targeted":"gap-threshold-exceeded",items,totalMissing};
    }
    async function repairVisibility(reason="visibility-return"){
      visibilityRepairAttempts+=1;
      if(repairPromise){
        const prior=await repairPromise;
        if(!prior||continuityBlocked)return repairVisibility(`${reason}-after-blocked-repair`);
      }
      const socketUnhealthy=!privateSocket||continuityBlocked;
      const plan=visibilityGapPlan();
      if(socketUnhealthy||!plan.repairable){
        visibilityRepairFallbacks+=1;
        const fallbackReason=socketUnhealthy?"socket-unhealthy":plan.reason;
        const ok=await fullReload({reconnect:socketUnhealthy,reason:`visibility-fallback:${fallbackReason}`});
        lastVisibilityRepair={at:now(),reason,mode:"full-fallback",fallbackReason,ok,reconnected:socketUnhealthy,totalMissing:plan.totalMissing};
        return {...lastVisibilityRepair,blocked:continuityBlocked};
      }
      continuityBlocked=true;
      repairPromise=(async()=>{
        try{
          const fetched=await Promise.all(plan.items.map(async item=>{
            const limit=Math.min(klineLimit,Math.max(2,item.missingCandles+2));
            return [item,await fetchKlines(item.tf,now(),limit,getSymbol()),limit];
          }));
          const loaded=[];
          for(const [item,rows,limit] of fetched){
            const prior=(privateCandlesByTf[item.tf]||[]).concat(privateFormingByTf[item.tf]?[privateFormingByTf[item.tf]]:[]);
            const value=normalizedPrivateRows(item.tf,prior.concat(Array.isArray(rows)?rows:[]),privateWindowTarget);
            const gaps=continuityGaps(item.tf,value.closed);
            const last=Number(value.closed.at(-1)&&value.closed.at(-1).time);
            const forming=Number(value.forming&&value.forming.time);
            if(gaps.length||last!==item.expectedClosedOpenTime||forming!==item.activeOpenTime){
              throw Object.assign(new Error(`SSSC targeted visibility repair incomplete for ${item.tf}`),{gaps,tf:item.tf,last,expected:item.expectedClosedOpenTime,forming,active:item.activeOpenTime});
            }
            loaded.push([item.tf,value,limit]);
          }
          const nextClosed={...privateCandlesByTf},nextForming={...privateFormingByTf};
          for(const [tf,value] of loaded){nextClosed[tf]=value.closed;nextForming[tf]=value.forming;}
          privateCandlesByTf=nextClosed;privateFormingByTf=nextForming;continuityBlocked=false;
          const queued=queuedSocketMessages.splice(0);
          for(const message of queued)applySocketKline(message,privateWindowTarget,{publish:false});
          calculate();visibilityRepairSuccesses+=1;
          recordSocketEvent("visibility-repair-success",{reason,totalMissing:plan.totalMissing});
          return {ok:true,mode:"targeted",reason,totalMissing:plan.totalMissing,requests:loaded.map(([tf,,limit])=>({tf,limit})),reconnected:false};
        }catch(error){
          recordSocketEvent("visibility-repair-failed",{reason,error:error&&error.message||String(error)});
          warn("SSSC targeted visibility repair failed",{reason,error});
          return {ok:false,error};
        }finally{repairPromise=null;}
      })();
      const targeted=await repairPromise;
      if(targeted.ok){lastVisibilityRepair={...targeted,at:now(),blocked:false};return lastVisibilityRepair;}
      visibilityRepairFallbacks+=1;
      const ok=await fullReload({reconnect:false,reason:"visibility-fallback:targeted-repair-failed"});
      lastVisibilityRepair={at:now(),reason,mode:"full-fallback",fallbackReason:"targeted-repair-failed",ok,reconnected:false,totalMissing:plan.totalMissing,blocked:continuityBlocked};
      return lastVisibilityRepair;
    }
    function startLive(){
      if(started)return;
      started=true;
      currentSymbol=getSymbol();
      calculate();
      calcTimer=setIntervalFn(calculate,heartbeatMs);
      refresh(false).catch(error=>warn("SSSC seed failed",error));
    }
    function stop(){
      started=false;
      if(calcTimer)clearIntervalFn(calcTimer);
      calcTimer=null;
      privateGeneration++;
      if(repairTimer!=null)clearTimeoutFn(repairTimer);
      repairTimer=null;queuedSocketMessages=[];
      closePrivateSocket();
    }

    return {startLive,stop,refresh,repairVisibility,calculate,buildDiagnosticSet,upsertPrivateKline,connectPrivateSocket,getSnapshot:snapshot,warmupTargets,continuityGaps,closedCandleLags,checkClosedCandleProgress,repairContinuity,visibilityGapPlan};
  }

  const api={createOrchestration,warmupTargets,wsBase};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_ORCHESTRATION=api;
})();
