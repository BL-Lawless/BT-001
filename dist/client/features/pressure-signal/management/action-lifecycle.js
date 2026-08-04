(() => {
  "use strict";

  const build=window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};

  build.createActionLifecycle=function createActionLifecycle(options={}){
    const refreshMs=Math.max(100,Number(options.refreshMs)||1000);
    const timers=options.timers||window;
    const now=typeof options.now==="function"?options.now:Date.now;
    const state={
      initialized:false,destroyed:false,generation:0,inputFingerprint:"",lastRefreshReason:"initial",
      lastRunAt:0,lastPublished:null,lastValid:null,refreshState:"IDLE",schedulerTimer:null,pendingTimer:null,
      running:false,queuedReason:null,listeners:[],calculationCount:0,publicationCount:0,skippedCount:0,errorCount:0,lastError:null
    };

    function diagnostics(){
      return {
        initialized:state.initialized,generation:state.generation,inputFingerprint:state.inputFingerprint,
        lastRefreshReason:state.lastRefreshReason,lastRunAt:state.lastRunAt,refreshState:state.refreshState,
        publicationFingerprint:state.lastPublished&&state.lastPublished.publicationFingerprint||"",
        lastValidPublicationFingerprint:state.lastValid&&state.lastValid.publicationFingerprint||"",
        schedulerCount:state.schedulerTimer==null?0:1,pendingTimerCount:state.pendingTimer==null?0:1,
        listenerCount:state.listeners.length,calculationCount:state.calculationCount,publicationCount:state.publicationCount,
        skippedCount:state.skippedCount,errorCount:state.errorCount,lastError:state.lastError,
        boundedPublicationSnapshots:new Set([state.lastPublished,state.lastValid].filter(Boolean)).size
      };
    }
    function setState(next,message=""){
      state.refreshState=next;
      try{if(typeof options.onState==="function")options.onState(next,message);}catch(_e){}
    }
    async function run(reason="source-check"){
      if(!state.initialized||state.destroyed)return {ignored:true};
      if(state.running){state.queuedReason=reason;return {queued:true};}
      state.running=true;state.lastRunAt=now();
      try{
        const input=await options.captureInput(reason);
        if(!input||!input.fingerprint)return {unavailable:true};
        if(input.fingerprint===state.inputFingerprint){state.skippedCount+=1;state.lastRefreshReason=`${reason}:unchanged`;return {unchanged:true};}
        state.inputFingerprint=input.fingerprint;state.lastRefreshReason=reason;
        const generation=++state.generation;setState(state.lastValid?"REFRESHING":"UNAVAILABLE");state.calculationCount+=1;
        const result=await options.calculate(input,generation,reason,state.lastValid);
        if(generation!==state.generation)return {discarded:true};
        if(result&&result.retained){setState(result.refreshState||"REFRESHING",result.message||"");return {retained:true,publication:state.lastPublished};}
        const publication=result&&result.publication||result;
        if(!publication||publication.generation!==generation||publication.inputFingerprint!==input.fingerprint){
          state.errorCount+=1;setState(state.lastValid?"ERROR":"UNAVAILABLE","Incomplete or mixed-generation Action snapshot rejected");return {discarded:true};
        }
        state.lastPublished=publication;
        if(publication.refreshState==="READY")state.lastValid=publication;
        state.publicationCount+=1;state.lastError=null;
        if(typeof options.publish==="function")options.publish(publication);
        setState(publication.refreshState||"READY");
        return {published:true,publication};
      }catch(error){
        state.errorCount+=1;state.lastError=error&&error.stack||String(error);setState(state.lastValid?"ERROR":"UNAVAILABLE",state.lastValid?"Update delayed · showing last valid Action":"Action unavailable");
        try{if(typeof options.onError==="function")options.onError(error);}catch(_e){}
        return {error:state.lastError};
      }finally{
        state.running=false;
        if(state.queuedReason){const queued=state.queuedReason;state.queuedReason=null;schedule(true,queued);}
      }
    }
    function schedule(immediate=false,reason="source-check"){
      if(!state.initialized||state.destroyed)return;
      if(immediate){if(state.pendingTimer!=null)timers.clearTimeout(state.pendingTimer);state.pendingTimer=null;void run(reason);return;}
      if(state.pendingTimer!=null){state.queuedReason=reason;return;}
      const delay=Math.max(0,refreshMs-(now()-state.lastRunAt));
      state.pendingTimer=timers.setTimeout(()=>{state.pendingTimer=null;void run(state.queuedReason||reason);state.queuedReason=null;},delay);
    }
    function listen(target,type,reason=type){
      if(!target||typeof target.addEventListener!=="function")return false;
      const handler=()=>schedule(true,reason);target.addEventListener(type,handler,false);
      state.listeners.push(()=>target.removeEventListener(type,handler,false));return true;
    }
    function initialize(){
      if(state.initialized||state.destroyed)return api;
      state.initialized=true;state.schedulerTimer=timers.setInterval(()=>schedule(false,"freshness-check"),refreshMs);schedule(true,"initialization");return api;
    }
    function invalidate(reason="context-change"){
      state.generation+=1;state.inputFingerprint="";state.lastRefreshReason=reason;state.lastPublished=null;state.lastValid=null;setState("UNAVAILABLE");
    }
    function destroy(){
      if(state.destroyed)return;state.destroyed=true;state.initialized=false;state.generation+=1;
      if(state.schedulerTimer!=null)timers.clearInterval(state.schedulerTimer);if(state.pendingTimer!=null)timers.clearTimeout(state.pendingTimer);
      state.schedulerTimer=null;state.pendingTimer=null;state.listeners.splice(0).forEach(remove=>{try{remove();}catch(_e){}});state.refreshState="IDLE";
    }
    const api=Object.freeze({initialize,schedule,listen,invalidate,destroy,diagnostics,getLastPublication:()=>state.lastPublished,getLastValidPublication:()=>state.lastValid});
    return api;
  };
})();
