(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.BT001VisibilityRecoveryGate=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";

  function createLifecycleTracker(options={}){
    const documentRef=options.documentRef;
    let hidden=!!(documentRef&&documentRef.hidden),frozen=false,pageHidden=false,generation=0,lastTrigger=null;
    const observed=typeof WeakMap!=="undefined"?new WeakMap():null;
    function observe(event){
      if(!event||typeof event.type!=="string")return null;
      if(observed&&observed.has(event))return observed.get(event);
      let trigger=null;
      if(event.type==="visibilitychange"){
        if(documentRef&&documentRef.hidden)hidden=true;
        else if(hidden){hidden=false;trigger="hidden-to-visible";}
      }else if(event.type==="freeze"){frozen=true;}
      else if(event.type==="resume"&&frozen){frozen=false;trigger="freeze-to-resume";}
      else if(event.type==="pagehide"){pageHidden=true;}
      else if(event.type==="pageshow"&&(pageHidden||event.persisted===true)){pageHidden=false;trigger="page-restored";}
      // focus is deliberately informational only; it can never prove a lifecycle transition.
      const result=trigger?Object.freeze({trigger,generation:++generation,eventType:event.type}):null;
      if(result)lastTrigger=result;
      if(observed)observed.set(event,result);
      return result;
    }
    function diagnostics(){return {hidden,frozen,pageHidden,generation,lastTrigger};}
    return Object.freeze({observe,diagnostics});
  }

  function isGenuineVisibilityEvent(event,windowRef,documentRef,tracker){
    void windowRef;
    return !!(tracker&&typeof tracker.observe==="function"&&tracker.observe(event));
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

  return Object.freeze({create,createLifecycleTracker,isGenuineVisibilityEvent});
});
