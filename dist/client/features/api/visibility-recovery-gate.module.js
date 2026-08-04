(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.BT001VisibilityRecoveryGate=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";

  function isGenuineVisibilityEvent(event,windowRef,documentRef){
    if(!event||typeof event.type!=="string")return false;
    if(event.type==="focus"||event.type==="pageshow")return event.target===windowRef;
    if(event.type==="visibilitychange")return event.target===documentRef;
    return false;
  }

  function create(options={}){
    const windowMs=Number.isFinite(Number(options.windowMs))?Math.max(0,Number(options.windowMs)):30000;
    const now=typeof options.now==="function"?options.now:Date.now;
    const skippedReason=String(options.skippedReason||"recent-visibility-recovery");
    let inFlight=null,lastCompletedAt=null,completedRuns=0,suppressedAttempts=0;
    let lastRunReason=null,lastSuppressedReason=null,lastSuppressedAt=0,lastError=null;

    async function run(reason,recover){
      if(typeof recover!=="function")return null;
      const requestedAt=now(),normalizedReason=String(reason||"visibility-recovery");
      if(inFlight){
        suppressedAttempts+=1;lastSuppressedReason=normalizedReason;lastSuppressedAt=requestedAt;
        return inFlight;
      }
      if(lastCompletedAt!=null&&requestedAt-lastCompletedAt<windowMs){
        suppressedAttempts+=1;lastSuppressedReason=normalizedReason;lastSuppressedAt=requestedAt;
        return {skipped:true,reason:skippedReason,lastCompletedAt,nextEligibleAt:lastCompletedAt+windowMs};
      }
      lastRunReason=normalizedReason;lastError=null;
      inFlight=(async()=>{
        try{
          const result=await recover(normalizedReason);
          lastCompletedAt=now();completedRuns+=1;
          return result;
        }catch(error){
          lastError=String(error&&error.message||error);
          throw error;
        }finally{
          inFlight=null;
        }
      })();
      return inFlight;
    }

    function diagnostics(){
      return {
        windowMs,inFlight:!!inFlight,lastCompletedAt,completedRuns,suppressedAttempts,lastRunReason,
        lastSuppressedReason,lastSuppressedAt,lastError,nextEligibleAt:lastCompletedAt==null?0:lastCompletedAt+windowMs
      };
    }

    return Object.freeze({run,diagnostics});
  }

  return Object.freeze({create,isGenuineVisibilityEvent});
});
