(() => {
  "use strict";

  const MODULE = "BINANCE_USDM_USER_DATA_STREAM";
  const KEEPALIVE_MS = 45 * 60 * 1000;
  const MAX_RECONNECT_MS = 30000;
  const PRIVATE_EVENTS = Object.freeze(["ORDER_TRADE_UPDATE","ACCOUNT_UPDATE"]);

  function normalizeSymbol(value){
    return String(value || "").toUpperCase();
  }

  function buildStreamUrl(wsBase,listenKey){
    const base=String(wsBase || "wss://fstream.binance.com/private/ws").replace(/\/+$/g,"");
    const separator=base.includes("?")?"&":"?";
    return `${base}${separator}listenKey=${encodeURIComponent(String(listenKey || ""))}&events=${encodeURIComponent(PRIVATE_EVENTS.join("/"))}`;
  }

  function redactStreamUrl(url){
    return String(url || "").replace(/([?&]listenKey=)[^&]*/i,"$1{listenKey}");
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
    const getWsBase = options.getWsBase || (() => "wss://fstream.binance.com/private/ws");
    const onDirty = typeof options.onDirty === "function" ? options.onDirty : () => {};
    const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
    const onAuthoritativeSeed = typeof options.onAuthoritativeSeed === "function" ? options.onAuthoritativeSeed : () => {};
    const onPositionFact = typeof options.onPositionFact === "function" ? options.onPositionFact : () => {};
    const onOrderFact = typeof options.onOrderFact === "function" ? options.onOrderFact : () => {};
    const reportPerformance = options.reportPerformance !== false;
    const connectionKey=String(options.connectionKey||"").trim();
    const timers = options.timers || window;
    const now = typeof options.now === "function" ? options.now : Date.now;
    const state = {
      desired:false,status:"disconnected",coverageSource:"REST",apiKey:null,listenKey:null,socket:null,
      generation:0,reconnectAttempt:0,reconnectTimer:null,keepaliveTimer:null,lastEventAt:0,
      connectedAt:0,disconnectedAt:0,lastError:null,accountStreamEvents:0,starts:0,keepalives:0,reconnects:0,
      lastAccountUpdateEventTime:0,lastAccountUpdateReceiveTime:0,lastPositionFactAt:0,restEndpoint:"",wsEndpoint:"",wsEndpointCapturedAt:0,
      lastCloseAt:0,lastCloseCode:null,lastCloseReason:null
    };

    function diagnostics(){
      return {
        module:MODULE,status:state.status,streamStatus:state.status,coverageSource:state.coverageSource,
        connectedAt:state.connectedAt,disconnectedAt:state.disconnectedAt,lastEventAt:state.lastEventAt,
        lastError:state.lastError,accountStreamEvents:state.accountStreamEvents,starts:state.starts,
        keepalives:state.keepalives,reconnects:state.reconnects,listenKeyActive:!!state.listenKey,
        lastAccountUpdateEventTime:state.lastAccountUpdateEventTime,lastAccountUpdateReceiveTime:state.lastAccountUpdateReceiveTime,
        lastPositionFactAt:state.lastPositionFactAt,restEndpoint:state.restEndpoint,wsEndpoint:state.wsEndpoint,wsEndpointCapturedAt:state.wsEndpointCapturedAt,
        lastCloseAt:state.lastCloseAt,lastCloseCode:state.lastCloseCode,lastCloseReason:state.lastCloseReason,
        transport:"Binance USD-M listenKey private user stream"
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
      return buildStreamUrl(getWsBase(),listenKey);
    }
    async function requestListenKey(method,apiKey){
      const key = String(apiKey || state.apiKey || getApiKey() || "").trim();
      if(!key) throw new Error("Binance API key unavailable");
      const base = String(getRestBase() || "https://fapi.binance.com").replace(/\/+$/,"");
      state.restEndpoint=base+"/fapi/v1/listenKey";
      return api.requestJson(state.restEndpoint,{method,headers:{"X-MBX-APIKEY":key},cache:"no-store"});
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
      const receivedAt=now();
      state.lastEventAt = receivedAt;
      state.accountStreamEvents += 1;
      if(classified.positionDirty&&classified.event.e==="ACCOUNT_UPDATE"){
        state.lastAccountUpdateEventTime=Number(classified.event.E||classified.event.T)||0;
        state.lastAccountUpdateReceiveTime=receivedAt;
        try{
          onPositionFact({event:classified.event,eventTime:state.lastAccountUpdateEventTime,receivedAt,symbol:normalizeSymbol(getSymbol())});
          state.lastPositionFactAt=now();
        }catch(error){state.lastError=String(error&&error.message||error);}
      }
      if(classified.ordersDirty&&classified.event.e==="ORDER_TRADE_UPDATE"){
        try{onOrderFact({event:classified.event,order:classified.event.o||null,eventTime:Number(classified.event.E||classified.event.T)||0,receivedAt,symbol:normalizeSymbol(getSymbol())});}
        catch(error){state.lastError=String(error&&error.message||error);}
      }
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
        const connectionUrl=streamUrl(state.listenKey);
        state.wsEndpoint=redactStreamUrl(connectionUrl);
        state.wsEndpointCapturedAt=now();
        state.socket = api.connectWebSocket(connectionUrl,{
          connectionKey,
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
            state.lastCloseAt=now();
            state.lastCloseCode=event && Number.isFinite(Number(event.code)) ? Number(event.code) : null;
            state.lastCloseReason=String(event && event.reason || "");
            onDirty({positionDirty:true,ordersDirty:true,reason:"user-stream-disconnect",immediate:true});
            scheduleReconnect("user stream closed " + String(event && event.code || "") + (state.lastCloseReason ? ` (${state.lastCloseReason})` : ""));
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
  createBinanceUserDataStream.buildStreamUrl = buildStreamUrl;
  createBinanceUserDataStream.constants = Object.freeze({KEEPALIVE_MS,MAX_RECONNECT_MS});
  createBinanceUserDataStream.runSelfTests = async function runSelfTests(){
    const scheduled=[];
    const timers={setTimeout(callback,delay){const item={callback,delay,id:scheduled.length+1,cancelled:false};scheduled.push(item);return item.id;},clearTimeout(id){const item=scheduled.find(entry=>entry.id===id);if(item)item.cancelled=true;}};
    const requests=[];
    let socketUrl=null;
    let socketOptions=null;
    const dirty=[];
    const statuses=[];
    const seeds=[];
    const positionFacts=[];
    const orderFacts=[];
    const api={
      async requestJson(url,options){requests.push({url,method:options.method});return {listenKey:"test-listen-key"};},
      connectWebSocket(url,options){socketUrl=url;socketOptions=options;return {disconnect(){}};}
    };
    const stream=createBinanceUserDataStream({api,getApiKey:()=>"test-key",getSymbol:()=>"BTCUSDT",onDirty:event=>dirty.push(event),onStatus:status=>statuses.push(status),onAuthoritativeSeed:event=>seeds.push(event),onPositionFact:event=>positionFacts.push(event),onOrderFact:event=>orderFacts.push(event),timers,reportPerformance:false,now:(()=>{let t=1000;return()=>++t;})()});
    await stream.start();
    socketOptions.onOpen();
    const keepaliveWasScheduled=scheduled.some(item=>!item.cancelled&&item.delay===KEEPALIVE_MS);
    stream._handlePayload({e:"ACCOUNT_UPDATE",a:{P:[{s:"BTCUSDT",pa:"2"}]}});
    stream._handlePayload({e:"ORDER_TRADE_UPDATE",o:{s:"BTCUSDT",X:"NEW"}});
    stream._handlePayload({e:"ORDER_TRADE_UPDATE",o:{s:"ETHUSDT",X:"NEW"}});
    socketOptions.onClose({code:1006,reason:"abnormal closure"});
    const reconnectWasScheduled=scheduled.some(item=>!item.cancelled&&item.delay>=1000&&item.delay<=MAX_RECONNECT_MS);
    stream.stop();
    const cases={
      initialListenKeyRestSeedOnce:requests.filter(item=>item.method==="POST").length===1 && seeds.length===1,
      accountUpdateMarksOnlyPosition:dirty.some(item=>item.reason==="account-update"&&item.positionDirty&&!item.ordersDirty),
      accountUpdatePublishesFactSynchronously:positionFacts.length===1&&positionFacts[0].event&&positionFacts[0].event.e==="ACCOUNT_UPDATE",
      orderUpdateMarksOnlyOrders:dirty.some(item=>item.reason==="order-trade-update"&&item.ordersDirty&&!item.positionDirty),
      orderUpdatePublishesFactSynchronously:orderFacts.length===1&&orderFacts[0].order&&orderFacts[0].order.s==="BTCUSDT",
      unrelatedSymbolIgnored:dirty.filter(item=>item.reason==="order-trade-update").length===1,
      disconnectMarksBothForRecovery:dirty.some(item=>item.reason==="user-stream-disconnect"&&item.positionDirty&&item.ordersDirty&&item.immediate),
      disconnectSchedulesReconnect:reconnectWasScheduled,
      liveCoveragePublished:statuses.some(item=>item.streamStatus==="live"&&item.coverageSource==="USER_STREAM"),
      keepaliveScheduledBeforeExpiry:keepaliveWasScheduled,
      listenKeyClosedOnStop:requests.some(item=>item.method==="DELETE"),
      privateWebSocketUsesDocumentedQuerySubscription:socketUrl==="wss://fstream.binance.com/private/ws?listenKey=test-listen-key&events=ORDER_TRADE_UPDATE%2FACCOUNT_UPDATE",
      privateEndpointDiagnostics:stream.diagnostics().restEndpoint.endsWith("/fapi/v1/listenKey")&&stream.diagnostics().wsEndpoint==="wss://fstream.binance.com/private/ws?listenKey={listenKey}&events=ORDER_TRADE_UPDATE%2FACCOUNT_UPDATE",
      nativeCloseDiagnosticsRetained:stream.diagnostics().lastCloseCode===1006&&stream.diagnostics().lastCloseReason==="abnormal closure"&&stream.diagnostics().lastCloseAt>0
    };
    return {passed:Object.values(cases).every(Boolean),cases};
  };
  window.createBinanceUserDataStream = createBinanceUserDataStream;
})();
