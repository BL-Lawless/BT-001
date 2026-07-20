(() => {
  "use strict";

  const MODULE = "PRESSURE_SIGNAL_PUBLIC_DATA_FEED";
  const TF_SECONDS = Object.freeze({"1m":60,"3m":180,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,"1d":86400});
  const FIXED_DEPTHS = Object.freeze({"1m":2900,"3m":980,"5m":596,"15m":320,"30m":320,"1h":320,"4h":320,"1d":320});
  const REST_PAGE_LIMIT = 1500;
  const MAX_RECONNECT_MS = 30000;

  const number = value => {
    const parsed=Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const canonicalTf = value => {
    const raw=String(value || "").trim();
    const normalized=raw === "1D" ? "1d" : raw.toLowerCase();
    return Object.prototype.hasOwnProperty.call(TF_SECONDS,normalized) ? normalized : "";
  };
  const cloneRow = row => row ? {...row} : row;
  const rowKey = row => row ? [row.time,row.open,row.high,row.low,row.close,row.volume,row.quoteVolume,row.tradeCount,row.takerBuyBase,row.takerBuyQuote,row.final===true?1:0].join(":") : "";
  const rowsKey = rows => (Array.isArray(rows) ? rows : []).map(rowKey).join("|");
  const stableRequirementsKey = requirements => [...requirements.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([tf,depth])=>`${tf}:${depth}`).join("|");

  function parseRestRow(raw,clock){
    if(!Array.isArray(raw) || raw.length < 11) return null;
    const openTime=number(raw[0]),closeTime=number(raw[6]);
    const row={
      time:openTime==null?null:Math.floor(openTime/1000),openTime,closeTime,
      open:number(raw[1]),high:number(raw[2]),low:number(raw[3]),close:number(raw[4]),
      volume:number(raw[5]),baseVolume:number(raw[5]),quoteVolume:number(raw[7]),tradeCount:number(raw[8]),
      takerBuyBase:number(raw[9]),takerBuyQuote:number(raw[10]),final:closeTime!=null&&closeTime<clock,source:"signal-rest"
    };
    return row.time!=null&&row.open!=null&&row.high!=null&&row.low!=null&&row.close!=null ? row : null;
  }
  function parseWsRow(k){
    if(!k) return null;
    const openTime=number(k.t),closeTime=number(k.T);
    const row={
      time:openTime==null?null:Math.floor(openTime/1000),openTime,closeTime,
      open:number(k.o),high:number(k.h),low:number(k.l),close:number(k.c),
      volume:number(k.v),baseVolume:number(k.v),quoteVolume:number(k.q),tradeCount:number(k.n),
      takerBuyBase:number(k.V),takerBuyQuote:number(k.Q),final:k.x===true,source:"signal-ws"
    };
    return row.time!=null&&row.open!=null&&row.high!=null&&row.low!=null&&row.close!=null ? row : null;
  }
  function emaSeries(rows,period){
    const out=[];
    let current=null;
    const alpha=2/(period+1);
    for(let index=0;index<rows.length;index+=1){
      if(index<period-1) continue;
      if(current==null){
        let sum=0;
        for(let cursor=index-period+1;cursor<=index;cursor+=1) sum+=Number(rows[cursor].close);
        current=sum/period;
      }else current=Number(rows[index].close)*alpha+current*(1-alpha);
      out.push({time:Number(rows[index].time),value:current});
    }
    return out;
  }
  function normalizeSlots(options={}){
    const defaults=[9,21,55,100,200];
    const supplied=Array.isArray(options.slots)&&options.slots.length===5 ? options.slots : null;
    return defaults.map((fallback,index)=>({
      slot:index+1,slotId:`MA${index+1}`,
      period:Math.max(1,Math.round(Number(supplied&&supplied[index]&&supplied[index].period)||fallback))
    }));
  }

  function createPressureSignalDataFeed(options={}){
    const api=options.api || window.API;
    const timers=options.timers || window;
    const now=typeof options.now==="function" ? options.now : Date.now;
    const getRestUrl=typeof options.getRestUrl==="function" ? options.getRestUrl : () => "https://fapi.binance.com/fapi/v1/klines";
    const getWsUrl=typeof options.getWsUrl==="function" ? options.getWsUrl : () => "wss://fstream.binance.com/market/stream";
    const onUpdate=typeof options.onUpdate==="function" ? options.onUpdate : () => {};
    const state={
      desired:false,destroyed:false,symbol:"",requirements:new Map(),configurationKey:"",configurationGeneration:0,
      socketGeneration:0,socket:null,reconnectTimer:null,reconnectAttempt:0,seedInFlight:new Map(),
      closed:new Map(),forming:new Map(),revisions:new Map(),timestamps:new Map(),maCache:new Map(),
      price:{value:null,source:null,at:0,revision:0},lastError:null,lastCalculationReason:"initial"
    };
    const counters={socketCreates:0,socketCloses:0,reconnectSchedules:0,restRequests:0,restSeeds:0,gapRepairs:0,updates:0,listenerCount:0};
    const status={socketStatus:"idle",connectedAt:0,lastMessageAt:0,lastConfiguredAt:0,lastSeedAt:0};

    function tfState(tf){
      const interval=canonicalTf(tf);
      if(!state.revisions.has(interval)) state.revisions.set(interval,{closedRevision:0,formingRevision:0});
      if(!state.timestamps.has(interval)) state.timestamps.set(interval,{lastClosedAt:0,lastFormingAt:0,lastRestSeedAt:0});
      return {revision:state.revisions.get(interval),timestamps:state.timestamps.get(interval)};
    }
    function depthFor(tf){ return FIXED_DEPTHS[canonicalTf(tf)] || 320; }
    function pruneMa(tf){
      for(const [key,value] of state.maCache) if(value&&value.interval===tf) state.maCache.delete(key);
    }
    function emit(reason,detail={}){
      counters.updates+=1;
      state.lastCalculationReason=String(reason||"feed-update");
      try{ onUpdate({reason:state.lastCalculationReason,symbol:state.symbol,generation:state.configurationGeneration,...detail}); }catch(_e){}
    }
    function trimClosed(tf,rows){
      const interval=canonicalTf(tf),depth=depthFor(interval),deduped=new Map();
      (Array.isArray(rows)?rows:[]).filter(row=>row&&row.final===true).forEach(row=>deduped.set(Number(row.time),{...row,final:true}));
      return [...deduped.values()].sort((a,b)=>Number(a.time)-Number(b.time)).slice(-depth);
    }
    function replaceClosed(tf,rows,reason="closed-update"){
      const interval=canonicalTf(tf),prior=state.closed.get(interval)||[],next=trimClosed(interval,rows);
      if(rowsKey(prior)===rowsKey(next)) return false;
      state.closed.set(interval,next);
      const meta=tfState(interval);meta.revision.closedRevision+=1;meta.timestamps.lastClosedAt=now();
      pruneMa(interval);emit(reason,{tf:interval,kind:"closed"});return true;
    }
    function replaceForming(tf,row,reason="forming-update"){
      const interval=canonicalTf(tf),prior=state.forming.get(interval)||null,next=row?{...row,final:false}:null;
      if(rowKey(prior)===rowKey(next)) return false;
      if(next) state.forming.set(interval,next); else state.forming.delete(interval);
      const meta=tfState(interval);meta.revision.formingRevision+=1;meta.timestamps.lastFormingAt=now();
      pruneMa(interval);emit(reason,{tf:interval,kind:"forming"});return true;
    }
    function getClosedBuffer(tf){ return (state.closed.get(canonicalTf(tf))||[]).map(cloneRow); }
    function getFormingCandle(tf){ return cloneRow(state.forming.get(canonicalTf(tf))||null); }
    function getLiveBuffer(tf){
      const interval=canonicalTf(tf),closed=getClosedBuffer(interval),forming=getFormingCandle(interval);
      if(!forming) return closed;
      const withoutSame=closed.filter(row=>Number(row.time)!==Number(forming.time));
      return [...withoutSame,forming].sort((a,b)=>Number(a.time)-Number(b.time));
    }
    function revisions(tf){
      const interval=canonicalTf(tf),meta=tfState(interval);
      return {symbol:state.symbol,tf:interval,closedRevision:meta.revision.closedRevision,formingRevision:meta.revision.formingRevision};
    }
    function continuity(tf,rows=getClosedBuffer(tf)){
      const interval=canonicalTf(tf),step=TF_SECONDS[interval];
      return rows.length<2 || rows.every((row,index)=>index===0||Number(row.time)-Number(rows[index-1].time)===step);
    }
    function restUrl(symbol,tf,endTime,limit){
      const url=new URL(String(getRestUrl()||"https://fapi.binance.com/fapi/v1/klines"));
      url.searchParams.set("symbol",symbol);url.searchParams.set("interval",tf);url.searchParams.set("limit",String(limit));
      if(Number.isFinite(Number(endTime))) url.searchParams.set("endTime",String(Math.floor(Number(endTime))));
      return url.toString();
    }
    async function seedTimeframe(tf,{force=false,reason="seed"}={}){
      const interval=canonicalTf(tf);
      if(!interval||!state.requirements.has(interval)) return {ignored:true};
      const existing=state.seedInFlight.get(interval);
      if(existing) return existing.promise;
      const token=state.configurationGeneration,symbol=state.symbol,target=depthFor(interval);
      if(!force&&getClosedBuffer(interval).length===target&&continuity(interval)) return {cached:true,tf:interval,count:target};
      const promise=(async()=>{
        let cursor=now(),raw=[];
        while(raw.length<target+1){
          const limit=Math.min(REST_PAGE_LIMIT,target+1-raw.length);
          counters.restRequests+=1;
          const batch=await api.requestJson(restUrl(symbol,interval,cursor,limit),{method:"GET",cache:"no-store"});
          if(token!==state.configurationGeneration||symbol!==state.symbol||!state.requirements.has(interval)) return {discarded:true};
          if(!Array.isArray(batch)||!batch.length) break;
          raw=[...batch,...raw];
          const earliest=number(batch[0]&&batch[0][0]);
          if(earliest==null||batch.length<limit) break;
          cursor=earliest-1;
        }
        const clock=now(),parsed=raw.map(row=>parseRestRow(row,clock)).filter(Boolean),closed=parsed.filter(row=>row.final),forming=parsed.filter(row=>!row.final).slice(-1)[0]||null;
        replaceClosed(interval,closed,reason==="gap-repair"?"gap-repair-closed":"rest-seed-closed");
        replaceForming(interval,forming,reason==="gap-repair"?"gap-repair-forming":"rest-seed-forming");
        const meta=tfState(interval);meta.timestamps.lastRestSeedAt=clock;status.lastSeedAt=clock;counters.restSeeds+=1;
        if(reason==="gap-repair") counters.gapRepairs+=1;
        if(getClosedBuffer(interval).length<target||!continuity(interval)) throw new Error(`${interval} Signal history seed incomplete`);
        return {tf:interval,count:getClosedBuffer(interval).length,forming:!!forming,continuous:true};
      })().catch(error=>{state.lastError=error&&error.message?error.message:String(error);throw error;}).finally(()=>{
        const current=state.seedInFlight.get(interval);if(current&&current.promise===promise) state.seedInFlight.delete(interval);
      });
      state.seedInFlight.set(interval,{promise,token});
      return promise;
    }
    async function seedRequired(options={}){
      const results=await Promise.all([...state.requirements.keys()].map(tf=>seedTimeframe(tf,options).then(value=>({ok:true,value})).catch(error=>({ok:false,error}))));
      const failure=results.find(result=>!result.ok);if(failure) throw failure.error;return results.map(result=>result.value);
    }
    function normalizeWsBase(){
      const raw=String(getWsUrl()||"wss://fstream.binance.com/market/stream").replace(/\/+$/,"");
      if(/\/market\/stream$/i.test(raw)) return raw;
      if(/\/(?:market|public|private)?\/?(?:ws|stream)$/i.test(raw)) return raw.replace(/\/(?:market|public|private)?\/?(?:ws|stream)$/i,"/market/stream");
      return raw+"/market/stream";
    }
    function streams(){
      const base=state.symbol.toLowerCase(),list=[...state.requirements.keys()].sort().map(tf=>`${base}@kline_${tf}`);
      return [...list,`${base}@aggTrade`,`${base}@markPrice@1s`];
    }
    function closeSocket(){
      const socket=state.socket;state.socket=null;if(!socket)return;
      counters.socketCloses+=1;
      try{if(typeof socket.disconnect==="function")socket.disconnect();else if(typeof socket.close==="function")socket.close();}catch(_e){}
    }
    function clearReconnect(){ if(state.reconnectTimer!=null){timers.clearTimeout(state.reconnectTimer);state.reconnectTimer=null;} }
    function scheduleReconnect(reason){
      if(!state.desired||state.destroyed||state.reconnectTimer!=null)return;
      closeSocket();status.socketStatus="disconnected";state.lastError=String(reason||"Signal socket disconnected");
      const delay=Math.min(MAX_RECONNECT_MS,1000*Math.pow(2,Math.min(state.reconnectAttempt,5)));state.reconnectAttempt+=1;counters.reconnectSchedules+=1;
      state.reconnectTimer=timers.setTimeout(()=>{state.reconnectTimer=null;connect();},delay);
    }
    function updatePrice(value,source,at){
      const price=number(value),timestamp=number(at)||now();if(price==null||price<=0||timestamp<state.price.at)return false;
      if(price===state.price.value&&source===state.price.source&&timestamp===state.price.at)return false;
      state.price={value:price,source,at:timestamp,revision:state.price.revision+1};emit("signal-price",{kind:"price",source});return true;
    }
    function handleKline(event){
      const tf=canonicalTf(event&&event.k&&event.k.i);if(!tf||!state.requirements.has(tf))return false;
      const row=parseWsRow(event.k);if(!row)return false;
      const meta=tfState(tf);meta.timestamps.lastFormingAt=number(event.E)||now();
      if(row.final){
        const closed=getClosedBuffer(tf),last=closed[closed.length-1];
        if(last&&Number(row.time)>Number(last.time)+TF_SECONDS[tf]) seedTimeframe(tf,{force:true,reason:"gap-repair"}).catch(()=>{});
        replaceClosed(tf,[...closed,row],"signal-closed-kline");
        const forming=getFormingCandle(tf);if(forming&&Number(forming.time)===Number(row.time))replaceForming(tf,null,"signal-forming-cleared");
      }else replaceForming(tf,row,"signal-forming-kline");
      return true;
    }
    function handlePayload(payload){
      let message=payload;
      if(typeof payload==="string"){try{message=JSON.parse(payload);}catch(_e){return false;}}
      const event=message&&message.data?message.data:message;if(!event)return false;
      if(event.s&&String(event.s).toUpperCase()!==state.symbol)return false;
      status.lastMessageAt=number(event.E)||now();state.lastError=null;
      if(event.e==="kline"&&event.k)return handleKline(event);
      if(event.e==="aggTrade")return updatePrice(event.p,"aggTrade",event.T||event.E);
      if(event.e==="markPriceUpdate")return updatePrice(event.p,"markPrice",event.E);
      return false;
    }
    function repairAfterReconnect(){
      [...state.requirements.keys()].forEach(tf=>{
        if(getClosedBuffer(tf).length!==depthFor(tf)||!continuity(tf)) seedTimeframe(tf,{force:true,reason:"gap-repair"}).catch(()=>{});
      });
    }
    function connect(){
      if(!state.desired||state.destroyed||!state.symbol||!state.requirements.size)return false;
      clearReconnect();closeSocket();state.socketGeneration+=1;const token=state.socketGeneration;
      const url=normalizeWsBase()+"?streams="+streams().join("/");status.socketStatus="connecting";counters.socketCreates+=1;
      try{
        state.socket=api.connectWebSocket(url,{reconnect:false,
          onOpen:()=>{if(token!==state.socketGeneration||!state.socket)return;status.socketStatus="live";status.connectedAt=now();state.reconnectAttempt=0;repairAfterReconnect();emit("signal-socket-live",{kind:"lifecycle"});},
          onMessage:event=>{if(token===state.socketGeneration&&state.socket)handlePayload(event&&event.data);},
          onError:error=>{if(token!==state.socketGeneration)return;status.socketStatus="error";scheduleReconnect(error&&error.message||"Signal socket error");},
          onClose:event=>{if(token!==state.socketGeneration)return;status.socketStatus="disconnected";scheduleReconnect(`Signal socket closed ${event&&event.code||""}`);}
        });
        return true;
      }catch(error){status.socketStatus="error";scheduleReconnect(error&&error.message||String(error));return false;}
    }
    function normalizeRequirements(input){
      const map=new Map();
      (Array.isArray(input)?input:[]).forEach(item=>{const tf=canonicalTf(item&&typeof item==="object"?item.tf:item);if(tf)map.set(tf,depthFor(tf));});
      return map;
    }
    async function configure({symbol,timeframes,reason="configuration"}={}){
      if(state.destroyed) throw new Error("Signal feed is destroyed");
      const nextSymbol=String(symbol||"").toUpperCase(),nextRequirements=normalizeRequirements(timeframes),nextKey=`${nextSymbol}|${stableRequirementsKey(nextRequirements)}`;
      if(!nextSymbol||!nextRequirements.size) return {configured:false,reason:"empty-requirements"};
      if(nextKey===state.configurationKey){
        if(state.seedInFlight.size) await Promise.all([...state.seedInFlight.values()].map(entry=>entry.promise));
        return {configured:false,unchanged:true,generation:state.configurationGeneration};
      }
      const symbolChanged=state.symbol!==nextSymbol;state.configurationGeneration+=1;state.configurationKey=nextKey;state.symbol=nextSymbol;state.requirements=nextRequirements;state.desired=true;status.lastConfiguredAt=now();
      state.seedInFlight.clear();clearReconnect();closeSocket();status.socketStatus="seeding";
      if(symbolChanged){state.closed.clear();state.forming.clear();state.revisions.clear();state.timestamps.clear();state.maCache.clear();state.price={value:null,source:null,at:0,revision:state.price.revision+1};}
      else{
        [...state.closed.keys()].filter(tf=>!nextRequirements.has(tf)).forEach(tf=>{state.closed.delete(tf);state.forming.delete(tf);state.revisions.delete(tf);state.timestamps.delete(tf);pruneMa(tf);});
      }
      emit(reason,{kind:"configuration",symbolChanged});
      await seedRequired({force:symbolChanged,reason:symbolChanged?"symbol-seed":"requirement-seed"});
      if(nextKey===state.configurationKey&&state.desired&&!state.destroyed) connect();
      return {configured:true,symbolChanged,generation:state.configurationGeneration,timeframes:[...state.requirements.keys()].sort()};
    }
    async function ensureTimeframeBuffer(tf){ return seedTimeframe(tf,{force:false,reason:"requirement-seed"}); }
    function getCurrentPrice(){ return state.price.value==null?null:{...state.price}; }
    function isPriceFresh(maxAgeMs){ return state.price.at>0&&Math.max(0,now()-state.price.at)<=Math.max(0,Number(maxAgeMs)||0); }
    function getAuthoritativeMaSnapshot(tf,options={}){
      const interval=canonicalTf(tf),includeForming=options.includeForming!==false,slots=normalizeSlots(options),periods=slots.map(slot=>slot.period),rows=(includeForming?getLiveBuffer(interval):getClosedBuffer(interval)).slice(-depthFor(interval));
      const rev=revisions(interval),cacheKey=[state.symbol,interval,includeForming?"live":"closed",periods.join("-"),depthFor(interval),rev.closedRevision,includeForming?rev.formingRevision:"-"].join("|"),bypass=options.bypassCache===true;
      if(!bypass&&state.maCache.has(cacheKey))return state.maCache.get(cacheKey);
      const seriesBySlot={},alignedBySlot={},valuesBySlot={},seriesByPeriod={},alignedByPeriod={},valuesByPeriod={};
      slots.forEach(slot=>{
        const points=emaSeries(rows,slot.period),aligned=new Array(rows.length).fill(NaN);let cursor=0,last=NaN;
        rows.forEach((row,index)=>{while(cursor<points.length&&Number(points[cursor].time)<=Number(row.time)){const value=Number(points[cursor].value);if(Number.isFinite(value))last=value;cursor+=1;}aligned[index]=last;});
        seriesBySlot[slot.slotId]=points;alignedBySlot[slot.slotId]=aligned;valuesBySlot[slot.slotId]=Number.isFinite(last)?last:null;
        seriesByPeriod[slot.period]=points;alignedByPeriod[slot.period]=aligned;valuesByPeriod[slot.period]=valuesBySlot[slot.slotId];
      });
      const valuesValid=slots.every(slot=>Number.isFinite(Number(valuesBySlot[slot.slotId]))),requiredRows=depthFor(interval);
      const snapshot={requestedTf:String(tf||interval),interval,sourceType:includeForming?"signal-forming":"signal-closed",sourcePath:`PRESSURE_SIGNAL_DATA_FEED.${includeForming?"getLiveBuffer":"getClosedBuffer"}(${interval}) -> EMA`,sourceIndex:rows.length?rows.length-1:null,candleTime:rows.length?Number(rows[rows.length-1].time):null,rows,slots,periods,seriesBySlot,alignedBySlot,valuesBySlot,seriesByPeriod,alignedByPeriod,valuesByPeriod,valuesValid,warmupCount:rows.length,requiredRows,reliable:valuesValid&&getClosedBuffer(interval).length===requiredRows,reason:!rows.length?"no-candles":valuesValid?"":"insufficient-ma-data"};
      if(!bypass){state.maCache.set(cacheKey,snapshot);while(state.maCache.size>160)state.maCache.delete(state.maCache.keys().next().value);}
      return snapshot;
    }
    function evidenceFingerprint(){
      return [state.symbol,state.configurationGeneration,state.price.revision,...[...state.requirements.keys()].sort().flatMap(tf=>{const rev=revisions(tf);return[tf,depthFor(tf),rev.closedRevision,rev.formingRevision];})].join("|");
    }
    function diagnostics(){
      const buffers={};[...state.requirements.keys()].sort().forEach(tf=>{const rev=revisions(tf),stamp=tfState(tf).timestamps;buffers[tf]={depth:depthFor(tf),closed:getClosedBuffer(tf).length,forming:!!getFormingCandle(tf),closedRevision:rev.closedRevision,formingRevision:rev.formingRevision,lastClosedAt:stamp.lastClosedAt,lastFormingAt:stamp.lastFormingAt,lastRestSeedAt:stamp.lastRestSeedAt};});
      return {module:MODULE,symbol:state.symbol,generation:state.configurationGeneration,socketGeneration:state.socketGeneration,socketStatus:status.socketStatus,subscribedTimeframes:[...state.requirements.keys()].sort(),streams:state.symbol?streams():[],buffers,currentPrice:getCurrentPrice(),latestPriceSource:state.price.source,latestPriceAt:state.price.at,lastCalculationReason:state.lastCalculationReason,lastError:state.lastError,connectedAt:status.connectedAt,lastMessageAt:status.lastMessageAt,lastConfiguredAt:status.lastConfiguredAt,lastSeedAt:status.lastSeedAt,evidenceFingerprint:evidenceFingerprint(),activeSocketCount:state.socket?1:0,reconnectTimerCount:state.reconnectTimer==null?0:1,inFlightRestCount:state.seedInFlight.size,listenerCount:counters.listenerCount,counters:{...counters}};
    }
    function destroy(){
      if(state.destroyed)return;state.destroyed=true;state.desired=false;state.configurationGeneration+=1;state.socketGeneration+=1;clearReconnect();closeSocket();state.seedInFlight.clear();status.socketStatus="destroyed";
    }
    function injectClosedForTest(tf,rows){return replaceClosed(tf,[...getClosedBuffer(tf),...(Array.isArray(rows)?rows:[])],"test-history-injection");}
    return Object.freeze({configure,destroy,ensureTimeframeBuffer,getClosedBuffer,getFormingCandle,getLiveBuffer,getTimeframeRevisions:revisions,getAuthoritativeMaSnapshot,getCurrentPrice,isPriceFresh,evidenceFingerprint,diagnostics,_handlePayload:handlePayload,_injectClosedForTest:injectClosedForTest,_simulateDisconnect:reason=>scheduleReconnect(reason||"test-disconnect")});
  }

  function deterministicRows(tf,count,symbolSeed=0){
    const step=TF_SECONDS[tf]*1000,start=1700000000000-step*count;
    return Array.from({length:count},(_,index)=>{const openTime=start+index*step,base=30000+symbolSeed+index*.25;return[openTime,String(base),String(base+8),String(base-7),String(base+2),"100",openTime+step-1,"3000000",100,"55","1650000","0"];});
  }
  createPressureSignalDataFeed.runSelfTests=async function(){
    let clock=1800000000000;
    const datasets=new Map();
    Object.keys(TF_SECONDS).forEach(tf=>datasets.set(`BTCUSDT|${tf}`,deterministicRows(tf,FIXED_DEPTHS[tf]+40,0)));
    Object.keys(TF_SECONDS).forEach(tf=>datasets.set(`ETHUSDT|${tf}`,deterministicRows(tf,FIXED_DEPTHS[tf]+40,500)));
    const requests=[],connections=[],scheduled=[];
    const api={
      async requestJson(url){requests.push(url);const parsed=new URL(url),symbol=parsed.searchParams.get("symbol"),tf=parsed.searchParams.get("interval"),limit=Number(parsed.searchParams.get("limit")),end=Number(parsed.searchParams.get("endTime"));const rows=datasets.get(`${symbol}|${tf}`)||[];return rows.filter(row=>Number(row[0])<=end).slice(-limit);},
      connectWebSocket(url,handlers){const connection={url,handlers,closed:false,disconnect(){this.closed=true;}};connections.push(connection);return connection;}
    };
    const timers={setTimeout(callback,delay){const item={id:scheduled.length+1,callback,delay,cancelled:false};scheduled.push(item);return item.id;},clearTimeout(id){const item=scheduled.find(entry=>entry.id===id);if(item)item.cancelled=true;}};
    const updates=[];
    const feed=createPressureSignalDataFeed({api,timers,now:()=>clock,getRestUrl:()=>"https://fapi.binance.com/fapi/v1/klines",getWsUrl:()=>"wss://fstream.binance.com/market/stream",onUpdate:event=>updates.push(event)});
    await feed.configure({symbol:"BTCUSDT",timeframes:["1m","3m"],reason:"test-initial"});
    connections[connections.length-1].handlers.onOpen();
    feed._handlePayload({e:"aggTrade",s:"BTCUSDT",p:"45000",T:clock});
    const frozen=feed.diagnostics(),requestsAfterInitial=requests.length;
    const externalChart={tf:"1m",loads:0,resets:0,reconnects:0};
    ["1m","3m","5m","15m","30m","1h","4h","1d"].forEach(tf=>{externalChart.tf=tf;externalChart.loads+=1;externalChart.resets+=1;externalChart.reconnects+=1;});
    const afterChart=feed.diagnostics();
    const oldest=feed.getClosedBuffer("1m")[0],oldOutside={...oldest,time:Number(oldest.time)-TF_SECONDS["1m"],openTime:Number(oldest.openTime)-TF_SECONDS["1m"]*1000,closeTime:Number(oldest.closeTime)-TF_SECONDS["1m"]*1000,close:Number(oldest.close)-999,final:true};
    const revBeforeOld=feed.getTimeframeRevisions("1m").closedRevision;feed._injectClosedForTest("1m",[oldOutside]);const revAfterOld=feed.getTimeframeRevisions("1m").closedRevision;
    const priceFingerprint=feed.evidenceFingerprint();feed._handlePayload({e:"aggTrade",s:"BTCUSDT",p:"45001",T:clock+1});const priceChanged=feed.evidenceFingerprint()!==priceFingerprint;
    const formingBefore=feed.getTimeframeRevisions("1m").formingRevision,formingOpen=Math.floor(clock/(TF_SECONDS["1m"]*1000))*(TF_SECONDS["1m"]*1000);
    feed._handlePayload({e:"kline",E:clock+2,s:"BTCUSDT",k:{i:"1m",t:formingOpen,T:formingOpen+59999,o:"45000",h:"45010",l:"44990",c:"45002",v:"100",q:"4500000",n:20,V:"55",Q:"2475000",x:false}});
    const formingChanged=feed.getTimeframeRevisions("1m").formingRevision===formingBefore+1;
    clock+=9000;const staleBlocks=feed.isPriceFresh(8000)===false;
    await feed.configure({symbol:"BTCUSDT",timeframes:["5m","15m"],reason:"test-horizon"});
    const horizonDiag=feed.diagnostics(),requestsAfterHorizon=requests.length;
    await feed.configure({symbol:"BTCUSDT",timeframes:["5m","15m"],reason:"duplicate"});
    const duplicateAvoided=requests.length===requestsAfterHorizon;
    await feed.configure({symbol:"ETHUSDT",timeframes:["5m","15m"],reason:"test-symbol"});
    const symbolDiag=feed.diagnostics();
    for(let index=0;index<6;index+=1) await feed.configure({symbol:"ETHUSDT",timeframes:index%2?["1m","3m"]:["5m","15m"],reason:"repeat"});
    const accumulation=feed.diagnostics();
    const cases={
      initialFixedDepths:frozen.buffers["1m"].closed===FIXED_DEPTHS["1m"]&&frozen.buffers["3m"].closed===FIXED_DEPTHS["3m"],
      ownsPriceAndTimestamp:frozen.currentPrice&&frozen.currentPrice.value===45000&&frozen.currentPrice.source==="aggTrade"&&frozen.currentPrice.at===1800000000000,
      chartLifecycleInvariant:frozen.evidenceFingerprint===afterChart.evidenceFingerprint&&frozen.latestPriceAt===afterChart.latestPriceAt&&requests.length>=requestsAfterInitial,
      oldHistoryOutsideWindowInvariant:revBeforeOld===revAfterOld,
      realPriceChangeUpdates:priceChanged,
      realFormingCandleUpdates:formingChanged,
      genuinePriceStalenessDetected:staleBlocks,
      horizonReconfiguresSubscriptions:horizonDiag.subscribedTimeframes.join("|")==="15m|5m",
      symbolChangeReseeds:symbolDiag.symbol==="ETHUSDT"&&symbolDiag.generation>horizonDiag.generation&&symbolDiag.buffers["5m"].closed===FIXED_DEPTHS["5m"],
      duplicateConfigurationCoalesced:duplicateAvoided,
      noSocketTimerListenerAccumulation:accumulation.activeSocketCount===1&&accumulation.reconnectTimerCount===0&&accumulation.listenerCount===0&&accumulation.inFlightRestCount===0,
      oneSocketPerConfiguration:connections.filter(connection=>!connection.closed).length===1
    };
    feed.destroy();
    const destroyed=feed.diagnostics();
    cases.destroyClosesOwnedResources=destroyed.socketStatus==="destroyed"&&destroyed.activeSocketCount===0&&destroyed.reconnectTimerCount===0&&destroyed.inFlightRestCount===0;
    return {passed:Object.values(cases).every(Boolean),cases,diagnostics:accumulation,destroyed,requests:requests.length,updates:updates.length,externalChart};
  };
  createPressureSignalDataFeed.fixedDepths=FIXED_DEPTHS;
  createPressureSignalDataFeed.timeframeSeconds=TF_SECONDS;
  createPressureSignalDataFeed.constants=Object.freeze({REST_PAGE_LIMIT,MAX_RECONNECT_MS});
  window.createPressureSignalDataFeed=createPressureSignalDataFeed;
})();
