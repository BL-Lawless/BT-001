"use strict";

const WebSocketClient=require("ws");
const {sharedGate}=require("../services/binance-rest-gate.service.js");

function parseRestKline(row){
  return {
    time:Math.floor(Number(row[0])/1000),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),
    volume:Number(row[5]),baseVolume:Number(row[5]),openTime:Number(row[0]),closeTime:Number(row[6]),quoteVolume:Number(row[7]),final:true,source:"headless-rest"
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
  function connectWebSocket(url,handlers={}){
    let socket=null,closed=false,retryTimer=null;
    const reconnect=handlers.reconnect===true;
    const open=()=>{
      socket=new WebSocketImpl(url);
      socket.onopen=event=>handlers.onOpen&&handlers.onOpen(event);
      socket.onmessage=event=>handlers.onMessage&&handlers.onMessage(event);
      socket.onerror=event=>handlers.onError&&handlers.onError(event);
      socket.onclose=event=>{
        handlers.onClose&&handlers.onClose(event);
        if(!closed&&reconnect)retryTimer=setTimeout(open,2000);
      };
    };
    open();
    return {disconnect(){closed=true;if(retryTimer!=null)clearTimeout(retryTimer);if(socket&&typeof socket.close==="function")socket.close();},close(){this.disconnect();}};
  }
  return Object.freeze({fetchKlines,connectWebSocket});
}

module.exports={createBinanceDataSource,parseRestKline};
