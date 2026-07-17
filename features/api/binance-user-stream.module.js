(() => {
  "use strict";

  const MODULE = "BINANCE_USDM_USER_DATA_STREAM";
  const KEEPALIVE_MS = 45 * 60 * 1000;
  const MAX_RECONNECT_MS = 30000;

  function normalizeSymbol(value){
    return String(value || "").toUpperCase();
  }

  function classifyEvent(payload,selectedSymbol){
    const event = payload && payload.data ? payload.data : payload;
    const symbol = normalizeSymbol(selectedSymbol);
    if(!event || !event.e) return {positionDirty:false,ordersDirty:false,expired:false,event:null};
    if(event.e === "listenKeyExpired") return {positionDirty:true,ordersDirty:true,expired:true,event};
    if(event.e === "ACCOUNT_UPDATE"){
      const positions = event.a && Array.isArray(event.a.P) ? event.a.P : [];
      return {positionDirty:positions.some(item => normalizeSymbol(item && item.s) === symbol),ordersDirty:false,expired:false,event};
    }
    if(event.e === "ORDER_TRADE_UPDATE"){
      return {positionDirty:false,ordersDirty:normalizeSymbol(event.o && event.o.s) === symbol,expired:false,event};
    }
    return {positionDirty:false,ordersDirty:false,expired:false,event};
  }

  function createBinanceUserDataStream(options={}){
    const api = options.api || window.API;
    const getApiKey = options.getApiKey || (() => "");
    const getSymbol = options.getSymbol || (() => "");
    const getRestBase = options.getRestBase || (() => "https://fapi.binance.com");
    const getWsBase = options.getWsBase || (() => "wss://fstream.binance.com/ws");
    const onDirty = typeof options.onDirty === "function" ? options.onDirty : () => {};
    const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
    const onAuthoritativeSeed = typeof options.onAuthoritativeSeed === "function" ? options.onAuthoritativeSeed : () => {};
    const reportPerformance = options.reportPerformance !== false;
    const timers = options.timers || window;
    const now = typeof options.now === "function" ? options.now : Date.now;
    const state = {
      desired:false,status:"disconnected",coverageSource:"REST",apiKey:null,listenKey:null,socket:null,
      generation:0,reconnectAttempt:0,reconnectTimer:null,keepaliveTimer:null,lastEventAt:0,
      connectedAt:0,disconnectedAt:0,lastError:null,accountStreamEvents:0,starts:0,keepalives:0,reconnects:0
    };

    function diagnostics(){
      return {
        module:MODULE,status:state.status,streamStatus:state.status,coverageSource:state.coverageSource,
        connectedAt:state.connectedAt,disconnectedAt:state.disconnectedAt,lastEventAt:state.lastEventAt,
        lastError:state.lastError,accountStreamEvents:state.accountStreamEvents,starts:state.starts,
        keepalives:state.keepalives,reconnects:state.reconnects,listenKeyActive:!!state.listenKey
      };
    }
    function publishStatus(next,error=null){
      state.status = next;
      state.coverageSource = next === "live" ? "USER_STREAM" : "REST";
      state.lastError = error ? String(error && error.message || error) : null;
      if(next === "disconnected" || next === "error") state.disconnectedAt = now();
      try{ onStatus(diagnostics()); }catch(_e){}
    }
    function clearTimer(name){
      if(state[name] != null){ timers.clearTimeout(state[name]); state[name] = null; }
    }
    function closeSocket(){
      const socket = state.socket;
      state.socket = null;
      if(!socket) return;
      try{
        if(typeof socket.disconnect === "function") socket.disconnect();
        else if(typeof socket.close === "function") socket.close();
      }catch(_e){}
    }
    function streamUrl(listenKey){
      return String(getWsBase() || "wss://fstream.binance.com/ws").replace(/\/+$/,"") + "/" + encodeURIComponent(listenKey);
    }
    async function requestListenKey(method,apiKey){
      const key = String(apiKey || state.apiKey || getApiKey() || "").trim();
      if(!key) throw new Error("Binance API key unavailable");
      const base = String(getRestBase() || "https://fapi.binance.com").replace(/\/+$/,"");
      return api.requestJson(base + "/fapi/v1/listenKey",{method,headers:{"X-MBX-APIKEY":key},cache:"no-store"});
    }
    function scheduleKeepalive(token){
      clearTimer("keepaliveTimer");
      state.keepaliveTimer = timers.setTimeout(async () => {
        state.keepaliveTimer = null;
        if(!state.desired || token !== state.generation || !state.listenKey) return;
        try{
          const response = await requestListenKey("PUT");
          if(token !== state.generation) return;
          if(response && response.listenKey) state.listenKey = response.listenKey;
          state.keepalives += 1;
          scheduleKeepalive(token);
        }catch(error){
          publishStatus("error",error);
          onDirty({positionDirty:true,ordersDirty:true,reason:"user-stream-keepalive-failed",immediate:true});
          scheduleReconnect("listen-key keepalive failed");
        }
      },KEEPALIVE_MS);
    }
    function scheduleReconnect(reason){
      if(!state.desired || state.reconnectTimer != null) return;
      closeSocket();
      clearTimer("keepaliveTimer");
      publishStatus("disconnected",reason);
      const delay = Math.min(MAX_RECONNECT_MS,1000 * Math.pow(2,Math.min(state.reconnectAttempt,5)));
      state.reconnectAttempt += 1;
      state.reconnects += 1;
      state.reconnectTimer = timers.setTimeout(() => {
        state.reconnectTimer = null;
        start({reconnect:true}).catch(() => {});
      },delay);
    }
    function handlePayload(payload){
      let event = payload;
      if(typeof payload === "string"){
        try{ event = JSON.parse(payload); }catch(_e){ return; }
      }
      const classified = classifyEvent(event,getSymbol());
      if(!classified.event) return;
      state.lastEventAt = now();
      state.accountStreamEvents += 1;
      if(reportPerformance && window.BT001_PERFORMANCE_DIAGNOSTICS) window.BT001_PERFORMANCE_DIAGNOSTICS.accountStreamEvents = state.accountStreamEvents;
      if(classified.positionDirty || classified.ordersDirty){
        onDirty({...classified,reason:classified.event.e === "ACCOUNT_UPDATE" ? "account-update" : classified.event.e === "ORDER_TRADE_UPDATE" ? "order-trade-update" : "listen-key-expired"});
      }
      if(classified.expired) scheduleReconnect("listen key expired");
    }
    async function start({reconnect=false}={}){
      const key = String(getApiKey() || "").trim();
      if(!key){ stop(); return false; }
      state.apiKey = key;
      state.desired = true;
      state.generation += 1;
      const token = state.generation;
      clearTimer("reconnectTimer");
      clearTimer("keepaliveTimer");
      closeSocket();
      publishStatus("connecting");
      try{
        const response = await requestListenKey("POST");
        if(token !== state.generation || !state.desired) return false;
        if(!response || !response.listenKey) throw new Error("Binance listen key was not returned");
        state.listenKey = response.listenKey;
        state.starts += 1;
        state.socket = api.connectWebSocket(streamUrl(state.listenKey),{
          reconnect:false,
          onOpen:() => {
            if(token !== state.generation || !state.desired) return;
            state.reconnectAttempt = 0;
            state.connectedAt = now();
            publishStatus("live");
            scheduleKeepalive(token);
            onAuthoritativeSeed({reason:reconnect ? "user-stream-reconnect" : "user-stream-start",reconnect});
          },
          onMessage:event => { if(token === state.generation && state.desired) handlePayload(event && event.data); },
          onError:error => {
            if(token !== state.generation || !state.desired) return;
            publishStatus("error",error || "user stream error");
            onDirty({positionDirty:true,ordersDirty:true,reason:"user-stream-error",immediate:true});
            scheduleReconnect("user stream error");
          },
          onClose:event => {
            if(token !== state.generation || !state.desired) return;
            onDirty({positionDirty:true,ordersDirty:true,reason:"user-stream-disconnect",immediate:true});
            scheduleReconnect("user stream closed " + String(event && event.code || ""));
          }
        });
        return true;
      }catch(error){
        if(token !== state.generation) return false;
        publishStatus("error",error);
        onDirty({positionDirty:true,ordersDirty:true,reason:"user-stream-start-failed",immediate:true});
        scheduleReconnect("listen-key start failed");
        return false;
      }
    }
    function stop(){
      const listenKey=state.listenKey,apiKey=state.apiKey;
      state.desired = false;
      state.generation += 1;
      clearTimer("reconnectTimer");
      clearTimer("keepaliveTimer");
      closeSocket();
      state.listenKey = null;
      state.apiKey = null;
      if(listenKey && apiKey) requestListenKey("DELETE",apiKey).catch(() => {});
      publishStatus("disconnected");
    }

    return Object.freeze({start,stop,diagnostics,_handlePayload:handlePayload,_simulateDisconnect:reason => scheduleReconnect(reason || "simulated disconnect")});
  }

  createBinanceUserDataStream.classifyEvent = classifyEvent;
  createBinanceUserDataStream.constants = Object.freeze({KEEPALIVE_MS,MAX_RECONNECT_MS});
  createBinanceUserDataStream.runSelfTests = async function runSelfTests(){
    const scheduled=[];
    const timers={setTimeout(callback,delay){const item={callback,delay,id:scheduled.length+1,cancelled:false};scheduled.push(item);return item.id;},clearTimeout(id){const item=scheduled.find(entry=>entry.id===id);if(item)item.cancelled=true;}};
    const requests=[];
    let socketOptions=null;
    const dirty=[];
    const statuses=[];
    const seeds=[];
    const api={
      async requestJson(url,options){requests.push({url,method:options.method});return {listenKey:"test-listen-key"};},
      connectWebSocket(_url,options){socketOptions=options;return {disconnect(){}};}
    };
    const stream=createBinanceUserDataStream({api,getApiKey:()=>"test-key",getSymbol:()=>"BTCUSDT",onDirty:event=>dirty.push(event),onStatus:status=>statuses.push(status),onAuthoritativeSeed:event=>seeds.push(event),timers,reportPerformance:false,now:(()=>{let t=1000;return()=>++t;})()});
    await stream.start();
    socketOptions.onOpen();
    const keepaliveWasScheduled=scheduled.some(item=>!item.cancelled&&item.delay===KEEPALIVE_MS);
    stream._handlePayload({e:"ACCOUNT_UPDATE",a:{P:[{s:"BTCUSDT",pa:"2"}]}});
    stream._handlePayload({e:"ORDER_TRADE_UPDATE",o:{s:"BTCUSDT",X:"NEW"}});
    stream._handlePayload({e:"ORDER_TRADE_UPDATE",o:{s:"ETHUSDT",X:"NEW"}});
    socketOptions.onClose({code:1006});
    const reconnectWasScheduled=scheduled.some(item=>!item.cancelled&&item.delay>=1000&&item.delay<=MAX_RECONNECT_MS);
    stream.stop();
    const cases={
      initialListenKeyRestSeedOnce:requests.filter(item=>item.method==="POST").length===1 && seeds.length===1,
      accountUpdateMarksOnlyPosition:dirty.some(item=>item.reason==="account-update"&&item.positionDirty&&!item.ordersDirty),
      orderUpdateMarksOnlyOrders:dirty.some(item=>item.reason==="order-trade-update"&&item.ordersDirty&&!item.positionDirty),
      unrelatedSymbolIgnored:dirty.filter(item=>item.reason==="order-trade-update").length===1,
      disconnectMarksBothForRecovery:dirty.some(item=>item.reason==="user-stream-disconnect"&&item.positionDirty&&item.ordersDirty&&item.immediate),
      disconnectSchedulesReconnect:reconnectWasScheduled,
      liveCoveragePublished:statuses.some(item=>item.streamStatus==="live"&&item.coverageSource==="USER_STREAM"),
      keepaliveScheduledBeforeExpiry:keepaliveWasScheduled,
      listenKeyClosedOnStop:requests.some(item=>item.method==="DELETE")
    };
    return {passed:Object.values(cases).every(Boolean),cases};
  };
  window.createBinanceUserDataStream = createBinanceUserDataStream;
})();
