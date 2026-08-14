"use strict";

const WebSocketClient=require("ws");

const TF_MS=Object.freeze({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"4h":14400000,"1d":86400000});

function parseRestKline(row){
  return {
    openTime:Number(row[0]),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5]),
    closeTime:Number(row[6]),quoteVolume:Number(row[7]),tradeCount:Number(row[8]),takerBuyBase:Number(row[9]),takerBuyQuote:Number(row[10]),final:false
  };
}

function parseWsKline(message){
  const k=message&&message.k;
  if(!k)return null;
  return {
    openTime:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),
    closeTime:Number(k.T),quoteVolume:Number(k.q),tradeCount:Number(k.n),takerBuyBase:Number(k.V),takerBuyQuote:Number(k.Q),final:k.x===true
  };
}

function coreRow(row){
  return row?[row.openTime,row.open,row.high,row.low,row.close,row.volume,row.closeTime,row.quoteVolume]:null;
}

function verifyContinuity(timeframe,rows){
  const step=TF_MS[timeframe];
  if(!step)throw new Error(`Unsupported MA Stack timeframe ${timeframe}`);
  const source=Array.isArray(rows)?rows:[];
  for(let index=1;index<source.length;index++){
    if(Number(source[index].openTime)-Number(source[index-1].openTime)!==step){
      throw new Error(`MA Stack ${timeframe} candle continuity gap at ${source[index-1].openTime}/${source[index].openTime}`);
    }
  }
  return true;
}

function normalizeSeed(timeframe,rows,target,at=Date.now()){
  const ordered=(Array.isArray(rows)?rows:[]).filter(row=>Number.isFinite(row.openTime)).sort((a,b)=>a.openTime-b.openTime);
  const unique=[];
  for(const row of ordered){
    if(unique.length&&unique.at(-1).openTime===row.openTime)unique[unique.length-1]={...row};
    else unique.push({...row});
  }
  let forming=null;
  if(unique.length&&unique.at(-1).closeTime>=at)forming={...unique.pop(),final:false};
  const closed=unique.map(row=>({...row,final:true})).slice(-target);
  if(closed.length<target)throw new Error(`MA Stack ${timeframe} warmup incomplete: ${closed.length}/${target} closed candles`);
  verifyContinuity(timeframe,closed);
  return {closed,forming};
}

function createMaStackMarketFeed(options={}){
  const symbol=String(options.symbol||"").toUpperCase(),timeframes=Object.freeze([...(options.timeframes||[])]);
  const restUrl=String(options.restUrl||"https://fapi.binance.com").replace(/\/+$/,""),wsUrl=String(options.wsUrl||"wss://fstream.binance.com/market/stream").replace(/\/+$/,"");
  const target=Math.max(1,Number(options.bufferRows)||235),fetchFn=options.fetch||globalThis.fetch,WebSocketImpl=options.WebSocket||WebSocketClient;
  const now=options.now||Date.now,setTimeoutFn=options.setTimeoutFn||setTimeout,clearTimeoutFn=options.clearTimeoutFn||clearTimeout;
  const setIntervalFn=options.setIntervalFn||setInterval,clearIntervalFn=options.clearIntervalFn||clearInterval;
  const warn=options.warn||console.warn,log=options.log||console.log,staleAfterMs=Math.max(1000,Number(options.staleAfterMs)||90000);
  if(!symbol||!timeframes.length||typeof fetchFn!=="function")throw new Error("MA Stack feed requires symbol, timeframes, and fetch");
  const listeners=new Set(),closedByTf=new Map(),formingByTf=new Map();
  let socket=null,desired=false,ready=false,repairing=false,everOpened=false,generation=0,reconnectAttempt=0,reconnectTimer=null,healthTimer=null,lastMessageAt=0,repairPromise=null,queued=[];

  async function fetchTimeframe(timeframe){
    const query=new URLSearchParams({symbol,interval:timeframe,limit:String(Math.min(1500,target+1)),endTime:String(now())});
    const response=await fetchFn(`${restUrl}/fapi/v1/klines?${query}`,{headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});
    if(!response.ok)throw new Error(`MA Stack Binance REST ${timeframe} HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data))throw new Error(`MA Stack Binance REST ${timeframe} returned invalid klines`);
    return normalizeSeed(timeframe,data.map(parseRestKline),target,now());
  }

  async function reseed(reason){
    if(repairPromise)return repairPromise;
    repairing=true;ready=false;
    repairPromise=(async()=>{
      log(`[MA Stack feed] ${reason} REST reseed started`);
      const loaded=await Promise.all(timeframes.map(async timeframe=>[timeframe,await fetchTimeframe(timeframe)]));
      const nextClosed=new Map(),nextForming=new Map();
      for(const [timeframe,value] of loaded){nextClosed.set(timeframe,value.closed);if(value.forming)nextForming.set(timeframe,value.forming);}
      const advancedClosedTimeframes=timeframes.filter(timeframe=>{
        const previous=(closedByTf.get(timeframe)||[]).at(-1),next=(nextClosed.get(timeframe)||[]).at(-1);
        return !!previous&&!!next&&next.openTime>previous.openTime;
      });
      closedByTf.clear();formingByTf.clear();
      for(const [key,value] of nextClosed)closedByTf.set(key,value);
      for(const [key,value] of nextForming)formingByTf.set(key,value);
      const pending=queued.splice(0);repairing=false;ready=true;
      for(const message of pending)applyMessage(message,false);
      log(`[MA Stack feed] ${reason} REST reseed complete`);
      publish({type:"reseed",reason,closedTimeframes:advancedClosedTimeframes});
      return true;
    })().catch(error=>{repairing=false;ready=false;warn(`[MA Stack feed] ${reason} REST reseed failed`,error);throw error;}).finally(()=>{repairPromise=null;});
    return repairPromise;
  }

  function publish(update){for(const listener of listeners){try{listener(update);}catch(error){warn("[MA Stack feed] listener failed",error);}}}

  function wouldGap(timeframe,row){
    if(!row||row.final!==true)return false;
    const last=(closedByTf.get(timeframe)||[]).at(-1);
    return !!last&&row.openTime>last.openTime+TF_MS[timeframe];
  }

  function applyMessage(message,emit=true){
    if(!message||message.e!=="kline"||message.s!==symbol||!message.k||!timeframes.includes(message.k.i))return false;
    const timeframe=message.k.i,row=parseWsKline(message);
    if(wouldGap(timeframe,row)){
      queued.push(message);
      reseed("continuity-repair").catch(()=>forceReconnect("continuity-repair-failed"));
      return false;
    }
    if(row.final){
      const list=closedByTf.get(timeframe)||[],index=list.findIndex(item=>item.openTime===row.openTime);
      if(index>=0)list[index]=row;else list.push(row);
      list.sort((a,b)=>a.openTime-b.openTime);while(list.length>target)list.shift();
      closedByTf.set(timeframe,list);
      if(formingByTf.get(timeframe)&&formingByTf.get(timeframe).openTime<=row.openTime)formingByTf.delete(timeframe);
    }else formingByTf.set(timeframe,row);
    if(emit)publish({type:"kline",timeframe,closed:row.final,candle:row,at:Number(message.E)||now()});
    return true;
  }

  function consume(raw){
    lastMessageAt=now();
    let envelope;
    try{envelope=JSON.parse(String(raw));}catch(error){warn("[MA Stack feed] invalid WebSocket payload",error);return;}
    const message=envelope&&envelope.data||envelope;
    if(repairing||!ready){queued.push(message);if(queued.length>10000)queued.shift();return;}
    applyMessage(message,true);
  }

  function stopHealth(){if(healthTimer!=null)clearIntervalFn(healthTimer);healthTimer=null;}
  function scheduleReconnect(reason){
    if(!desired||reconnectTimer!=null)return;
    const delay=Math.min(30000,2000*Math.pow(2,Math.min(reconnectAttempt,4)));reconnectAttempt+=1;
    warn(`[MA Stack feed] reconnect scheduled (${reason}) in ${delay}ms`);
    reconnectTimer=setTimeoutFn(()=>{reconnectTimer=null;connect();},delay);
  }
  function forceReconnect(reason){
    ready=false;stopHealth();
    const active=socket;socket=null;generation+=1;
    try{if(active&&typeof active.terminate==="function")active.terminate();else if(active&&typeof active.close==="function")active.close();}catch(_error){}
    scheduleReconnect(reason);
  }
  function startHealth(){
    stopHealth();
    healthTimer=setIntervalFn(()=>{
      if(desired&&lastMessageAt&&now()-lastMessageAt>staleAfterMs)forceReconnect("message-stall");
      else{try{if(socket&&typeof socket.ping==="function")socket.ping();}catch(_error){forceReconnect("ping-failed");}}
    },Math.min(30000,Math.ceil(staleAfterMs/3)));
  }
  function connect(){
    if(!desired)return;
    ready=false;
    const token=++generation,streams=timeframes.map(timeframe=>`${symbol.toLowerCase()}@kline_${timeframe}`).join("/");
    const candidate=new WebSocketImpl(`${wsUrl}?streams=${streams}`);socket=candidate;
    candidate.on("open",()=>{
      if(token!==generation||!desired)return;
      lastMessageAt=now();startHealth();reconnectAttempt=0;
      if(!everOpened){everOpened=true;ready=true;log("[MA Stack feed] WebSocket connected");return;}
      reseed("reconnect").catch(()=>forceReconnect("reseed-failed"));
    });
    candidate.on("message",data=>{if(token===generation&&desired)consume(data);});
    candidate.on("error",error=>{if(token===generation&&desired){warn("[MA Stack feed] WebSocket error",error);forceReconnect("socket-error");}});
    candidate.on("close",event=>{if(token!==generation||!desired)return;socket=null;ready=false;stopHealth();scheduleReconnect(`close-${event&&event.code||"unknown"}`);});
  }

  async function start(){
    if(desired)return false;
    desired=true;await reseed("startup");connect();return true;
  }
  function stop(){
    desired=false;ready=false;repairing=false;generation+=1;queued=[];stopHealth();
    if(reconnectTimer!=null)clearTimeoutFn(reconnectTimer);reconnectTimer=null;
    const active=socket;socket=null;try{if(active&&typeof active.close==="function")active.close();}catch(_error){}
  }
  function getRows(timeframe,includeForming=false){
    const rows=(closedByTf.get(timeframe)||[]).map(coreRow),forming=formingByTf.get(timeframe);
    if(includeForming&&forming)rows.push(coreRow(forming));
    return rows;
  }
  function candleState(timeframe){
    const forming=formingByTf.get(timeframe)||null,closed=(closedByTf.get(timeframe)||[]).at(-1)||null;
    return {forming,closed,current:forming||closed,provisional:!!forming};
  }
  return Object.freeze({start,stop,reseed,applyMessage,getRows,candleState,isReady:()=>ready&&!repairing,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},diagnostics:()=>({desired,ready,repairing,everOpened,lastMessageAt,queued:queued.length,reconnectAttempt})});
}

module.exports={TF_MS,parseRestKline,parseWsKline,coreRow,verifyContinuity,normalizeSeed,createMaStackMarketFeed};
