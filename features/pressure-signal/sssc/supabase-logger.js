(() => {
  "use strict";
  const core=typeof module!=="undefined"&&module.exports
    ?require("./core/snapshot-logger.js")
    :window.BT001_SSSC_SNAPSHOT_LOGGER_CORE;
  if(!core)throw new Error("SSSC snapshot logger core must load before browser glue");
  const exchangeNow=()=>{
    const clock=typeof globalThis!=="undefined"&&globalThis.BT001ExchangeClock;
    try{return clock&&typeof clock.now==="function"?clock.now():Date.now();}catch(_error){return Date.now();}
  };
  const api=Object.freeze({
    ...core,
    buildSnapshotPayload:options=>core.buildSnapshotPayload({...options,now:options&&options.now||exchangeNow}),
    createSnapshotLogger:options=>core.createSnapshotLogger({
      ...options,now:options&&options.now||exchangeNow,
      warn:options&&options.warn||((...args)=>{if(typeof console!=="undefined"&&typeof console.warn==="function")console.warn(...args);})
    })
  });
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_SUPABASE_LOGGER=api;
})();
