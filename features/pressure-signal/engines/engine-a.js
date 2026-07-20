(() => {
  "use strict";

  function createState(){
    return {
      evidenceByTf:new Map(),smcCache:new Map(),entryTrackers:new Map(),setupHistories:new Map(),
      seenTriggerAlertIds:new Set(),seenTriggerAlertOrder:[]
    };
  }
  function clearState(state){
    state.evidenceByTf.clear();state.smcCache.clear();state.entryTrackers.clear();state.setupHistories.clear();
    state.seenTriggerAlertIds.clear();state.seenTriggerAlertOrder.length=0;
  }
  function createSignalEngineA(){
    const state=createState();
    let activations=0,deactivations=0;
    return {
      id:"A",displayName:"Current",version:"1.0.0",status:"available",state,
      getRequirements(context){
        if(!context || typeof context.getSignalARequirements!=="function") throw new Error("Signal A requirements provider is unavailable");
        return context.getSignalARequirements();
      },
      evaluate(context){
        if(!context || typeof context.evaluateSignalA!=="function") throw new Error("Signal A evaluation provider is unavailable");
        return context.evaluateSignalA();
      },
      onActivate(){activations+=1;},
      onDeactivate(){deactivations+=1;clearState(state);},
      reset(){clearState(state);},
      diagnostics(){return {activations,deactivations,cacheCounts:{evidenceByTf:state.evidenceByTf.size,smcCache:state.smcCache.size,entryTrackers:state.entryTrackers.size,setupHistories:state.setupHistories.size,seenTriggerAlerts:state.seenTriggerAlertIds.size}};}
    };
  }

  Object.defineProperty(window,"createSignalEngineA",{value:createSignalEngineA,configurable:true});
})();
