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
  function resolveSignalADirectionMode({directionMode="AUTO",automaticBias=null,manualThesis=null}={}){
    const mode=["LONG","SHORT"].includes(String(directionMode).toUpperCase())?String(directionMode).toUpperCase():"AUTO";
    if(mode==="AUTO") return {...(automaticBias||{}),directionMode:mode,automaticDirection:automaticBias&&automaticBias.direction||null};
    const side=mode==="LONG"?1:-1,status=String(manualThesis&&manualThesis.status||"MISSING").toUpperCase(),permission=status==="SUPPORTIVE"&&!(manualThesis&&manualThesis.missing),automaticDirection=automaticBias&&automaticBias.direction||null,opposingAutomaticBias=!!(automaticDirection&&automaticDirection!==mode);
    const opposingEvidence=opposingAutomaticBias?[`Automatic evidence favors ${automaticDirection}; ${mode} remains the selected direction`]:[];
    return {...(automaticBias||{}),direction:mode,side,confidence:(manualThesis&&manualThesis.confidence)??null,permission,directionMode:mode,automaticDirection,reason:permission?`${mode} permission from the manually selected thesis`:`${mode} selected manually; ${status.toLowerCase()} evidence does not support a setup`,opposingAutomaticBias,opposingEvidence};
  }
  function evaluateSignalADirectionalThesis({directionMode="AUTO",automaticBias=null,manualThesis=null,evaluateSelectedSetup=null}={}){
    const bias=resolveSignalADirectionMode({directionMode,automaticBias,manualThesis});
    if(bias.directionMode==="AUTO") return {bias,entryDecision:typeof evaluateSelectedSetup==="function"?evaluateSelectedSetup(bias):null};
    const selectedDecision=bias.permission&&typeof evaluateSelectedSetup==="function"
      ? evaluateSelectedSetup(bias)
      : {state:"BIAS CONFIRMED",direction:bias.direction,family:null,reason:bias.reason,candidates:[],candidateAudit:[],selected:null,opposingEvidence:[...(bias.opposingEvidence||[])]};
    const entryDecision=selectedDecision ? {...selectedDecision,opposingEvidence:[...(bias.opposingEvidence||[])]} : selectedDecision;
    return {bias,entryDecision};
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
        const directionMode=["AUTO","LONG","SHORT"].includes(String(context.directionMode||"AUTO").toUpperCase())?String(context.directionMode||"AUTO").toUpperCase():"AUTO";
        return context.evaluateSignalA({directionMode,horizonId:context.horizonId,snapshot:context.snapshot});
      },
      onActivate(){activations+=1;},
      onDeactivate(){deactivations+=1;clearState(state);},
      reset(){clearState(state);},
      diagnostics(){return {activations,deactivations,cacheCounts:{evidenceByTf:state.evidenceByTf.size,smcCache:state.smcCache.size,entryTrackers:state.entryTrackers.size,setupHistories:state.setupHistories.size,seenTriggerAlerts:state.seenTriggerAlertIds.size}};}
    };
  }

  Object.defineProperty(window,"createSignalEngineA",{value:createSignalEngineA,configurable:true});
  Object.defineProperty(window,"resolveSignalADirectionMode",{value:resolveSignalADirectionMode,configurable:true});
  Object.defineProperty(window,"evaluateSignalADirectionalThesis",{value:evaluateSignalADirectionalThesis,configurable:true});
})();
