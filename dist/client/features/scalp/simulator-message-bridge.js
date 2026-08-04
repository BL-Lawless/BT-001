(() => {
  "use strict";

  const CHANNEL="BT001_SCALP_SIMULATOR_RPC_V1";
  let registeredPopup=null;

  function dependencies(){
    const build=window.__BT001_SCALP_BUILD__;
    const app=window.BT001_SCALP;
    const missing=[];
    if(!build)missing.push("__BT001_SCALP_BUILD__");
    if(build&&!build.simulatorData)missing.push("simulatorData");
    if(build&&!build.calculations)missing.push("calculations");
    if(!app||typeof app.snapshot!=="function")missing.push("BT001_SCALP.snapshot");
    return missing.length?{ok:false,missing}:{ok:true,build,app,data:build.simulatorData,calc:build.calculations};
  }

  function snapshotView(deps){
    const snapshot=deps.app.snapshot()||{};
    const config=snapshot.config||{};
    return {
      config,
      filters:snapshot.filters||{},
      rates:snapshot.rates||{},
      formatted:{
        lot:deps.calc.formatNumeric(config.lot,3),
        stop:deps.calc.formatNumeric(config.stop,1),
        target:deps.calc.formatNumeric(config.target,1)
      }
    };
  }

  function cacheView(cache){
    if(!cache)return null;
    return {
      eventCount:Array.isArray(cache.events)?cache.events.length:0,
      candleCount:Array.isArray(cache.candles)?cache.candles.length:0,
      simulation:cache.simulation||null
    };
  }

  function stateView(deps){
    return {
      sources:Array.isArray(deps.build.config&&deps.build.config.sources)?[...deps.build.config.sources]:["1m","3m","5m","15m"],
      snapshot:snapshotView(deps),
      cache:cacheView(deps.data.getCache())
    };
  }

  function actionConfig(deps,payload){
    const current=snapshotView(deps);
    return {...(payload&&payload.config||{}),filters:current.filters,rates:current.rates};
  }

  function response(source,requestId,body){
    source.postMessage({channel:CHANNEL,kind:"response",requestId,...body},"*");
  }

  async function onMessage(event){
    const message=event&&event.data;
    if(!message||message.channel!==CHANNEL||message.kind!=="request"||!message.requestId||!event.source||event.source!==registeredPopup)return;
    const deps=dependencies();
    if(!deps.ok){
      try{response(event.source,message.requestId,{ok:false,error:{code:"EXPORTS_MISSING",message:`Required main-app exports are not ready: ${deps.missing.join(", ")}. Retrying…`,missing:deps.missing}});}catch(_error){}
      return;
    }
    try{
      let result;
      if(message.action==="CONNECT"){
        result=stateView(deps);
      }else if(message.action==="PING"){
        result={alive:true};
      }else if(message.action==="LOAD_DATA"){
        const cache=await deps.data.loadData(actionConfig(deps,message.payload));
        result={snapshot:snapshotView(deps),cache:cacheView(cache)};
      }else if(message.action==="RECALCULATE"){
        const simulation=deps.data.recalculate(actionConfig(deps,message.payload));
        result={snapshot:snapshotView(deps),cache:cacheView({...deps.data.getCache(),simulation})};
      }else{
        throw Object.assign(new Error(`Unsupported simulator action: ${message.action}`),{code:"UNSUPPORTED_ACTION"});
      }
      response(event.source,message.requestId,{ok:true,result});
    }catch(error){
      try{response(event.source,message.requestId,{ok:false,error:{code:error&&error.code||"ACTION_FAILED",message:error&&error.message||String(error)}});}catch(_responseError){}
    }
  }

  window.addEventListener("message",onMessage);
  window.__BT001_SCALP_SIMULATOR_BRIDGE__=Object.freeze({channel:CHANNEL,onMessage,dependencies,stateView,registerPopup(source){registeredPopup=source;}});
})();
