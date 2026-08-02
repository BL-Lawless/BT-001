"use strict";

const WebSocketClient=require("ws");
const {sharedGate}=require("../services/binance-rest-gate.service.js");

function parseRestKline(row){
  return {
    time:Math.floor(Number(row[0])/1000),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),
    volume:Number(row[5]),baseVolume:Number(row[5]),openTime:Number(row[0]),closeTime:Number(row[6]),quoteVolume:Number(row[7]),
    tradeCount:Number(row[8]),takerBuyBase:Number(row[9]),takerBuyQuote:Number(row[10]),final:true,source:"headless-rest"
  };
}

function createBinanceDataSource(options={}){
  const rawFetch=options.fetch||globalThis.fetch,fetchFn=rawFetch&&rawFetch.__bt001BinanceGateWrapped?rawFetch:sharedGate.wrapFetch(rawFetch),WebSocketImpl=options.WebSocket||WebSocketClient;
  if(typeof fetchFn!=="function")throw new Error("A Fetch-compatible function is required for Binance market data");
  const restUrl=String(options.restUrl||"https://fapi.binance.com").replace(/\/+$/,"");
  async function fetchKlines(interval,endMs,limit,symbol){
    const query=new URLSearchParams({symbol:String(symbol),interval:String(interval),limit:String(Math.min(1500,Math.max(1,Number(limit)||1))),endTime:String(Math.floor(Number(endMs)))});
    const response=await fetchFn(`${restUrl}/fapi/v1/klines?${query}`,{headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});
    if(!response.ok)throw new Error(`Binance klines HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data))throw new Error("Invalid Binance klines response");
    return data.map(parseRestKline);
  }
  async function fetchCurrentFundingRate(symbol){
    const query=new URLSearchParams({symbol:String(symbol)});
    const response=await fetchFn(`${restUrl}/fapi/v1/premiumIndex?${query}`,{headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});
    if(!response.ok)throw new Error(`Binance premium index HTTP ${response.status}`);
    const data=await response.json(),fundingRate=Number(data&&data.lastFundingRate);
    if(!data||String(data.symbol)!==String(symbol)||!Number.isFinite(fundingRate))throw new Error("Invalid Binance premium index response");
    return {symbol:String(data.symbol),fundingRate,time:Number(data.time)||null};
  }
  async function fetchCurrentOpenInterest(symbol){
    const query=new URLSearchParams({symbol:String(symbol)});
    const response=await fetchFn(`${restUrl}/fapi/v1/openInterest?${query}`,{headers:{"Cache-Control":"no-cache","Pragma":"no-cache"}});
    if(!response.ok)throw new Error(`Binance open interest HTTP ${response.status}`);
    const data=await response.json(),openInterest=Number(data&&data.openInterest);
    if(!data||String(data.symbol)!==String(symbol)||!Number.isFinite(openInterest))throw new Error("Invalid Binance open interest response");
    return {symbol:String(data.symbol),openInterest,time:Number(data.time)||null};
  }
  function connectWebSocket(url,handlers={}){
    const now=options.now||Date.now,setTimeoutFn=options.setTimeoutFn||setTimeout,clearTimeoutFn=options.clearTimeoutFn||clearTimeout;
    const setIntervalFn=options.setIntervalFn||setInterval,clearIntervalFn=options.clearIntervalFn||clearInterval;
    const log=handlers.log||options.log||console.log,warn=handlers.warn||options.warn||console.warn;
    const label=String(handlers.connectionKey||"market-data");
    const reconnectDelayMs=Math.max(1,Number(handlers.reconnectDelayMs)||2000);
    const staleAfterMs=Math.max(1,Number(handlers.staleAfterMs)||90000);
    const healthCheckIntervalMs=Math.max(1,Number(handlers.healthCheckIntervalMs)||Math.min(30000,Math.ceil(staleAfterMs/3)));
    let socket=null,closed=false,retryTimer=null,healthTimer=null,generation=0,everOpened=false,openedAt=0,lastMessageAt=0,lastPongAt=0;
    const reconnect=handlers.reconnect===true;
    const emit=(state,detail={})=>{
      const message=`[Headless Binance WS] ${label} ${state}`;
      (state==="stalled"||state==="disconnected"?warn:log)(message,detail);
      if(typeof handlers.onState==="function")handlers.onState({state,at:now(),...detail});
    };
    const stopHealth=()=>{if(healthTimer!=null)clearIntervalFn(healthTimer);healthTimer=null;};
    const scheduleReconnect=reason=>{
      if(closed||!reconnect||retryTimer!=null)return;
      emit("reconnecting",{reason,delayMs:reconnectDelayMs});
      retryTimer=setTimeoutFn(()=>{retryTimer=null;open();},reconnectDelayMs);
    };
    const failConnection=reason=>{
      if(closed||!socket)return;
      const failed=socket;
      socket=null;generation+=1;stopHealth();
      emit("stalled",{reason,lastMessageAt:lastMessageAt||null,ageMs:lastMessageAt?now()-lastMessageAt:now()-openedAt});
      if(typeof handlers.onClose==="function")handlers.onClose({code:4000,reason,synthetic:true});
      try{
        if(typeof failed.terminate==="function")failed.terminate();
        else if(typeof failed.close==="function")failed.close();
      }catch(error){warn(`[Headless Binance WS] ${label} forced close failed`,error);}
      scheduleReconnect(reason);
    };
    const startHealth=()=>{
      stopHealth();
      healthTimer=setIntervalFn(()=>{
        if(closed||!socket)return;
        const reference=lastMessageAt||openedAt;
        if(now()-reference>staleAfterMs){failConnection("message-stall");return;}
        try{if(typeof socket.ping==="function")socket.ping();}catch(error){failConnection("ping-failed");}
      },healthCheckIntervalMs);
    };
    const open=()=>{
      const token=++generation,candidate=new WebSocketImpl(url);
      socket=candidate;openedAt=now();lastMessageAt=0;lastPongAt=0;
      if(typeof candidate.on==="function")candidate.on("pong",()=>{if(token===generation)lastPongAt=now();});
      candidate.onopen=event=>{
        if(token!==generation||closed)return;
        openedAt=now();
        emit(everOpened?"reconnected":"connected",{url});
        everOpened=true;startHealth();
        if(handlers.onOpen)handlers.onOpen(event);
      };
      candidate.onmessage=event=>{
        if(token!==generation||closed)return;
        lastMessageAt=now();
        if(handlers.onMessage)handlers.onMessage(event);
      };
      candidate.onerror=event=>{
        if(token!==generation||closed)return;
        warn(`[Headless Binance WS] ${label} error`,event);
        if(handlers.onError)handlers.onError(event);
        failConnection("socket-error");
      };
      candidate.onclose=event=>{
        if(token!==generation||closed)return;
        socket=null;stopHealth();
        emit("disconnected",{code:event&&event.code||null,reason:event&&event.reason||"close"});
        if(handlers.onClose)handlers.onClose(event);
        scheduleReconnect("close");
      };
    };
    open();
    return {
      disconnect(){
        closed=true;generation+=1;
        if(retryTimer!=null)clearTimeoutFn(retryTimer);
        retryTimer=null;stopHealth();
        const active=socket;socket=null;
        if(active&&typeof active.close==="function")active.close();
      },
      close(){this.disconnect();},
      status(){return {connected:!!socket,openedAt,lastMessageAt,lastPongAt,staleAfterMs};}
    };
  }
  return Object.freeze({fetchKlines,fetchCurrentFundingRate,fetchCurrentOpenInterest,connectWebSocket});
}

module.exports={createBinanceDataSource,parseRestKline};
