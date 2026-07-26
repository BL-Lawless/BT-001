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
    const klineLimit=Math.max(1,Number(options.klineLimit)||1500);
    const heartbeatMs=Math.max(1,Number(options.heartbeatMs)||500);

    let data={},lastFullFetch=0,currentSymbol="";
    let privateCandlesByTf={},privateFormingByTf={};
    let privateSocket=null,privateGeneration=0,calcTimer=null,started=false;

    function snapshot(){
      return {data:{...data},lastFullFetch,started,privateCandlesByTf,privateFormingByTf};
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
      for(const [label,tf] of tfs){
        data[label]=buildDiagnosticSet(label,tf)||{tf:label,interval:tf,available:false,reason:"No private data",mode:liveTfs.has(tf)?"live":"confirmed"};
      }
      publish();
    }
    function intervalSeconds(tf){return {"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400}[tf]||60;}
    function replacePrivateRows(tf,rows,target){
      const ordered=(Array.isArray(rows)?rows:[]).filter(row=>row&&Number.isFinite(Number(row.time))).sort((a,b)=>Number(a.time)-Number(b.time));
      const unique=[];
      for(const row of ordered){
        if(unique.length&&Number(unique.at(-1).time)===Number(row.time))unique[unique.length-1]={...row};
        else unique.push({...row});
      }
      const last=unique.at(-1),forming=last&&Number(last.time)*1000+intervalSeconds(tf)*1000>now();
      if(forming)privateFormingByTf[tf]={...unique.pop(),final:false};else delete privateFormingByTf[tf];
      privateCandlesByTf[tf]=unique.map(row=>({...row,final:true})).slice(-target);
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
    async function fetchPrivateWindow(tf,target){
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
      replacePrivateRows(tf,rows,target);
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
      privateSocket=connectWebSocket(wsBase(getWsUrl())+"?streams="+streams.join("/"),{reconnect:true,onMessage:event=>{
        if(token!==privateGeneration)return;
        let message;
        try{message=JSON.parse(event.data);message=message&&message.data?message.data:message;}catch(_error){return;}
        if(!message||message.e!=="kline"||!message.k||message.s!==getSymbol())return;
        const k=message.k;
        const row={time:Math.floor(Number(k.t)/1000),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),baseVolume:Number(k.v),quoteVolume:Number(k.q),openTime:Number(k.t),closeTime:Number(k.T),source:"sssc-ws"};
        upsertPrivateKline(k.i,row,k.x===true,target);
        calculate();
      }});
    }
    async function refresh(){
      currentSymbol=getSymbol();
      const targets=warmupTargets(getSlots({allowStartupFallback:true}));
      try{await Promise.all(tfs.map(([,tf])=>fetchPrivateWindow(tf,targets.full)));}
      catch(error){warn("SSSC private seed failed",error);}
      lastFullFetch=now();
      calculate();
      connectPrivateSocket(targets.full);
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
      closePrivateSocket();
    }

    return {startLive,stop,refresh,calculate,buildDiagnosticSet,upsertPrivateKline,connectPrivateSocket,getSnapshot:snapshot,warmupTargets};
  }

  const api={createOrchestration,warmupTargets,wsBase};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_ORCHESTRATION=api;
})();
