(() => {
  "use strict";
  const KEY="btc_futures_chart_heatmap_v1_";
  const DURATIONS=Object.freeze(["12H","1D","3D","1W","2W","1M"]);
  const DEFAULTS=Object.freeze({enabled:false,selectedDuration:"3D",opacity:45,strength:20,mode:"BALANCED",maxClipping:99,smoothing:false,showLegend:true,showSourceLabel:true});
  const listeners=new Set();
  const read=(name,fallback)=>{try{const value=localStorage.getItem(KEY+name);return value==null?fallback:value;}catch(_error){return fallback;}};
  const bool=(name,fallback)=>read(name,fallback?"1":"0")==="1";
  const num=(name,fallback,min,max)=>Math.max(min,Math.min(max,Number(read(name,fallback))||fallback));
  const storedDuration=read("selectedDuration",DEFAULTS.selectedDuration);
  const emptyDiagnostics=()=>({requestStartedAt:null,currentStage:"NOT LOADED",reason:null,httpStatus:null,runStatus:null,runId:null,datasetId:null,datasetRetrievalStatus:"NOT REQUESTED",lastSuccessfulProviderStage:null,actorCompletedAt:null,runDurationMs:null,timeoutMs:null,elapsedMs:0,statusErrorCount:0,statusTimeline:[],rawItemCount:0,heatmapObjectFound:null,selectedObject:null,requiredFieldsFound:[],missingFields:[],payloadStructure:null,inspectedCandidatePaths:[],decodedStringPaths:[],jsonDecodeFailurePaths:[],rawCellCount:0,validCellCount:0,normalizedCellCount:0,rejectedCellCount:0,rejectionReasons:{},timestampUnit:null,visibleTimeCellCount:0,visiblePriceCellCount:0,visibleCellCount:0,thresholdCellCount:0,drawnCellCount:0,invalidCoordinateCount:0,zeroDrawReason:"No dataset loaded",displayingPreviousDataset:false,lastDrawAt:null,canvas:null});
  const emptyRecovery=()=>({runId:null,datasetId:null,duration:null,actorStatus:null,actorRequestStartedAt:null,actorCompletedAt:null,runDurationMs:null,datasetRetrievalStatus:"NOT REQUESTED",lastSuccessfulProviderStage:null,failedStage:null,retryEligible:false,hasRawPayload:false,hasParsedCandidate:false,hasNormalizedCandidate:false,cachedRunId:null,cachedDatasetId:null,rawPayloadRequestGeneration:null});
  const state={prefs:{enabled:bool("enabled",DEFAULTS.enabled),selectedDuration:DURATIONS.includes(storedDuration)?storedDuration:DEFAULTS.selectedDuration,opacity:num("opacity",DEFAULTS.opacity,5,80),strength:num("strength",DEFAULTS.strength,0,100),mode:read("mode",DEFAULTS.mode)==="RAW"?"RAW":"BALANCED",maxClipping:num("maxClipping",DEFAULTS.maxClipping,50,100),smoothing:bool("smoothing",DEFAULTS.smoothing),showLegend:bool("showLegend",DEFAULTS.showLegend),showSourceLabel:bool("showSourceLabel",DEFAULTS.showSourceLabel)},dataset:null,displayedDuration:null,status:"NOT_LOADED",loading:false,lastSuccessfulUpdate:null,error:null,requestGeneration:0,diagnostics:emptyDiagnostics(),recovery:emptyRecovery()};
  let retainedRawPayload=null,retainedParsedCandidate=null,retainedNormalizedCandidate=null,pendingPublication=null;
  const snapshot=()=>({...state,prefs:{...state.prefs},recovery:{...state.recovery},diagnostics:{...state.diagnostics,rejectionReasons:{...state.diagnostics.rejectionReasons},statusTimeline:state.diagnostics.statusTimeline.map(item=>({...item}))}});
  function notify(){const value=snapshot();listeners.forEach(listener=>{try{listener(value);}catch(_error){}});}
  function emitDiagnostics(){try{if(typeof window.CustomEvent==="function"&&typeof window.dispatchEvent==="function")window.dispatchEvent(new CustomEvent("heatmap:diagnostics",{detail:snapshot()}));}catch(_error){}}
  function persist(name,value){try{localStorage.setItem(KEY+name,typeof value==="boolean"?(value?"1":"0"):String(value));}catch(_error){}}
  function setPreference(name,value){
    if(!(name in state.prefs)||name==="selectedDuration"&&!DURATIONS.includes(value))return;
    state.prefs[name]=value;persist(name,value);
    if(name==="selectedDuration"&&!state.loading)state.status=state.displayedDuration&&state.displayedDuration!==value?"REFRESH_REQUIRED":(state.dataset?"READY":"NOT_LOADED");
    if(name==="enabled"&&state.dataset&&!state.loading){state.diagnostics.currentStage=value?"READY":"READY · OVERLAY OFF";state.diagnostics.zeroDrawReason=value?"Redraw pending":"Heatmap hidden";}
    notify();
  }
  function subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
  function requestStage(update){
    if(!update||typeof update!=="object")return;
    const allowed=["stage","httpStatus","runStatus","runId","datasetId","datasetRetrievalStatus","lastSuccessfulProviderStage","actorCompletedAt","runDurationMs","timeoutMs","elapsedMs","statusErrorCount","rawItemCount"],mapped={stage:"currentStage"};
    for(const key of allowed)if(update[key]!=null)state.diagnostics[mapped[key]||key]=update[key];
    if(update.stage==="ACTOR SUCCEEDED"&&update.runStatus==="SUCCEEDED"){
      Object.assign(state.recovery,{runId:update.runId||null,datasetId:update.datasetId||null,duration:state.recovery.duration||state.prefs.selectedDuration,actorStatus:"SUCCEEDED",actorRequestStartedAt:state.diagnostics.requestStartedAt,actorCompletedAt:update.actorCompletedAt||Date.now(),runDurationMs:Number(update.runDurationMs)||0,datasetRetrievalStatus:update.datasetRetrievalStatus||"NOT REQUESTED",lastSuccessfulProviderStage:"ACTOR SUCCEEDED",failedStage:null,retryEligible:false});
    }
    if(update.stage==="DATASET RETRIEVED"){
      state.recovery.datasetRetrievalStatus="RETRIEVED";state.recovery.lastSuccessfulProviderStage="DATASET RETRIEVED";
      state.diagnostics.lastSuccessfulProviderStage="DATASET RETRIEVED";
    }else if(update.stage==="RETRIEVING DATASET")state.recovery.datasetRetrievalStatus="REQUESTING";
    if(update.runStatus&&(!state.diagnostics.statusTimeline.length||state.diagnostics.statusTimeline[state.diagnostics.statusTimeline.length-1].status!==update.runStatus))state.diagnostics.statusTimeline.push({status:update.runStatus,elapsedMs:Number(update.elapsedMs)||0});
    if(update.stage&&update.stage!=="STARTING ACTOR")state.status="LOADING";
    notify();
  }
  function datasetDiagnostics(normalized){
    const diagnostics=normalized&&normalized.diagnostics||{};
    Object.assign(state.diagnostics,{rawItemCount:Number(diagnostics.rawItemCount)||0,heatmapObjectFound:diagnostics.heatmapObjectFound===true,selectedObject:diagnostics.selectedObject||null,requiredFieldsFound:Array.isArray(diagnostics.requiredFieldsFound)?diagnostics.requiredFieldsFound.slice():[],missingFields:Array.isArray(diagnostics.missingFields)?diagnostics.missingFields.slice():[],payloadStructure:diagnostics.payloadStructure||state.diagnostics.payloadStructure,inspectedCandidatePaths:Array.isArray(diagnostics.inspectedCandidatePaths)?diagnostics.inspectedCandidatePaths.slice():[],decodedStringPaths:Array.isArray(diagnostics.decodedStringPaths)?diagnostics.decodedStringPaths.slice():[],jsonDecodeFailurePaths:Array.isArray(diagnostics.jsonDecodeFailurePaths)?diagnostics.jsonDecodeFailurePaths.slice():[],rawCellCount:Number(diagnostics.rawCellCount)||0,validCellCount:Number(diagnostics.validCellCount)||0,normalizedCellCount:Number(diagnostics.validCellCount)||0,rejectedCellCount:Number(diagnostics.rejectedCellCount)||0,rejectionReasons:{...(diagnostics.rejectionReasons||{})},timestampUnit:diagnostics.timestampUnit||null});
  }
  function reportRender(report){
    if(!report||typeof report!=="object")return;
    Object.assign(state.diagnostics,{visibleTimeCellCount:Number(report.visibleTimeCellCount)||0,visiblePriceCellCount:Number(report.visiblePriceCellCount)||0,visibleCellCount:Number(report.visibleCellCount)||0,thresholdCellCount:Number(report.thresholdCellCount)||0,drawnCellCount:Number(report.drawnCellCount)||0,invalidCoordinateCount:Number(report.invalidCoordinateCount)||0,zeroDrawReason:report.zeroDrawReason||null,lastDrawAt:Date.now(),canvas:report.canvas||state.diagnostics.canvas});
    if(report.renderFailure){
      const message=report.errorMessage||"Heatmap renderer failed before draw";
      state.status="UPDATE_FAILED";state.error=message;state.diagnostics.currentStage="RENDERING FAILED";state.diagnostics.reason=message;
      if(pendingPublication){state.dataset=pendingPublication.previousDataset;state.displayedDuration=pendingPublication.previousDuration;state.lastSuccessfulUpdate=pendingPublication.previousUpdate;pendingPublication.renderFailure=message;}
      state.diagnostics.displayingPreviousDataset=!!state.dataset;
      state.recovery.failedStage="RENDERING FAILED";state.recovery.retryEligible=state.recovery.actorStatus==="SUCCEEDED"&&!!state.recovery.datasetId&&!!retainedNormalizedCandidate;
    }else if(pendingPublication){pendingPublication.rendered=true;}
    else if(!state.loading&&state.dataset&&(state.status==="READY"||state.status==="REFRESH_REQUIRED")){
      const reason=report.zeroDrawReason||null;
      if(!state.prefs.enabled)state.diagnostics.currentStage="READY · OVERLAY OFF";
      else if(!report.drawnCellCount&&reason&&/outside current visible/i.test(reason))state.diagnostics.currentStage="READY · OUTSIDE VISIBLE CHART RANGE";
      else if(!report.drawnCellCount&&reason&&/threshold/i.test(reason))state.diagnostics.currentStage="READY · HIDDEN BY VISUAL THRESHOLD";
      else if(!report.drawnCellCount)state.diagnostics.currentStage="READY · NO DRAWABLE CELLS";
      else state.diagnostics.currentStage="READY";
      state.diagnostics.reason=reason;
    }
    emitDiagnostics();
  }
  function failureDetails(error){return {reason:error&&error.message?String(error.message):"Heatmap update failed",stage:error&&error.stage?String(error.stage):state.diagnostics.currentStage||"UPDATE FAILED",httpStatus:Number.isInteger(error&&error.httpStatus)?error.httpStatus:null,runStatus:error&&error.runStatus?String(error.runStatus):state.diagnostics.runStatus};}
  function nextPaint(){return new Promise(resolve=>{if(typeof requestAnimationFrame==="function")requestAnimationFrame(()=>resolve());else setTimeout(resolve,0);});}
  function markFailure(error){
    const failure=failureDetails(error),downstream=state.recovery.actorStatus==="SUCCEEDED"&&!!state.recovery.datasetId;
    if(failure.stage==="DATASET RETRIEVAL FAILED"||(downstream&&!retainedRawPayload&&["RETRIEVING DATASET","PROVIDER AUTHENTICATION","API KEY REQUIRED"].includes(failure.stage)))state.recovery.datasetRetrievalStatus="FAILED";
    state.recovery.failedStage=failure.stage;state.recovery.retryEligible=downstream;
    state.error=failure.reason;state.status="UPDATE_FAILED";Object.assign(state.diagnostics,{currentStage:failure.stage,reason:failure.reason,httpStatus:failure.httpStatus,runStatus:downstream?"SUCCEEDED":failure.runStatus,elapsedMs:Date.now()-(state.diagnostics.requestStartedAt||Date.now()),datasetRetrievalStatus:state.recovery.datasetRetrievalStatus,displayingPreviousDataset:!!state.dataset});
    if(error&&error.diagnostics)Object.assign(state.diagnostics,error.diagnostics);
  }
  async function publishNormalized(normalized,duration,requestId){
    if(requestId!==state.requestGeneration)return false;
    retainedNormalizedCandidate=normalized;state.recovery.hasNormalizedCandidate=true;datasetDiagnostics(normalized);
    state.diagnostics.currentStage="NORMALIZING";state.diagnostics.elapsedMs=Date.now()-state.diagnostics.requestStartedAt;notify();
    state.diagnostics.currentStage="PUBLISHING DATASET";notify();
    const previous={previousDataset:state.dataset,previousDuration:state.displayedDuration,previousUpdate:state.lastSuccessfulUpdate,rendered:false,renderFailure:null};
    pendingPublication=previous;state.dataset=normalized;state.displayedDuration=duration;state.diagnostics.currentStage="RENDERING";state.diagnostics.reason=null;notify();
    if(previous.renderFailure){const error=new Error(previous.renderFailure);error.stage="RENDERING FAILED";throw error;}
    pendingPublication=null;state.lastSuccessfulUpdate=Date.now();state.error=null;state.recovery.failedStage=null;state.recovery.retryEligible=false;
    state.status=state.prefs.selectedDuration===duration?"READY":"REFRESH_REQUIRED";state.diagnostics.currentStage=state.prefs.enabled?"READY":"READY · OVERLAY OFF";state.diagnostics.elapsedMs=Date.now()-state.diagnostics.requestStartedAt;state.diagnostics.displayingPreviousDataset=false;if(!state.prefs.enabled)state.diagnostics.zeroDrawReason="Heatmap hidden";notify();return true;
  }
  async function processPayload(payload,duration,requestId){
    if(requestId!==state.requestGeneration)return false;
    const payloadDatasetId=payload&&payload.datasetId!=null?String(payload.datasetId):null;
    if(payloadDatasetId&&state.recovery.datasetId&&payloadDatasetId!==String(state.recovery.datasetId)){const error=new Error("Cached dataset does not belong to the retained successful run");error.stage="DATASET ASSOCIATION FAILED";throw error;}
    retainedRawPayload=payload;state.recovery.hasRawPayload=true;state.recovery.datasetRetrievalStatus="RETRIEVED";state.diagnostics.datasetRetrievalStatus="RETRIEVED";
    state.recovery.cachedRunId=state.recovery.runId;state.recovery.cachedDatasetId=payloadDatasetId||state.recovery.datasetId;state.recovery.rawPayloadRequestGeneration=requestId;
    state.diagnostics.currentStage="PARSING DATASET";state.status="LOADING";notify();
    const parsed=window.BT001HeatmapDataset.locate(payload);
    retainedParsedCandidate=parsed;state.recovery.hasParsedCandidate=true;datasetDiagnostics(parsed);
    state.diagnostics.currentStage="VALIDATING DATASET";notify();
    const normalized=window.BT001HeatmapDataset.validateAndNormalize(parsed,{symbol:"BTCUSDT",duration});
    return publishNormalized(normalized,duration,requestId);
  }
  function beginRequest(stage,duration){
    state.loading=true;state.status="STARTING_REQUEST";state.error=null;state.diagnostics=emptyDiagnostics();state.diagnostics.requestStartedAt=Date.now();state.diagnostics.currentStage=stage;state.diagnostics.displayingPreviousDataset=!!state.dataset;
    state.recovery=emptyRecovery();state.recovery.duration=duration;retainedRawPayload=null;retainedParsedCandidate=null;retainedNormalizedCandidate=null;pendingPublication=null;
    if(state.dataset)datasetDiagnostics(state.dataset);notify();
  }
  async function refresh(){
    if(state.loading)return false;
    const requestId=++state.requestGeneration,requestedDuration=state.prefs.selectedDuration;beginRequest("STARTING ACTOR",requestedDuration);
    if(!DURATIONS.includes(requestedDuration)){state.loading=false;markFailure(Object.assign(new Error("Selected duration missing"),{stage:"INPUT VALIDATION"}));notify();return false;}
    try{
      await nextPaint();if(requestId!==state.requestGeneration)return false;
      const payload=await window.BT001HeatmapProvider.run({duration:requestedDuration,requestId,isCurrent:id=>id===state.requestGeneration,onStage:update=>{if(requestId===state.requestGeneration)requestStage(update);}});
      if(requestId!==state.requestGeneration)return false;
      retainedRawPayload=payload;state.recovery.hasRawPayload=true;
      return await processPayload(payload,requestedDuration,requestId);
    }catch(error){if(requestId!==state.requestGeneration)return false;markFailure(error);return false;}
    finally{if(requestId===state.requestGeneration){state.loading=false;notify();}}
  }
  async function retryDatasetRetrieval(){
    if(state.loading||!state.recovery.retryEligible)return false;
    const checkpoint={...state.recovery},requestId=++state.requestGeneration;state.loading=true;state.status="LOADING";state.error=null;state.diagnostics.requestStartedAt=Date.now();state.diagnostics.currentStage="RECOVERY STARTED";state.diagnostics.reason=null;state.diagnostics.httpStatus=null;state.diagnostics.displayingPreviousDataset=!!state.dataset;notify();
    try{
      await nextPaint();if(requestId!==state.requestGeneration)return false;
      if(retainedNormalizedCandidate){state.diagnostics.currentStage="RETRYING RENDER";notify();return await publishNormalized(retainedNormalizedCandidate,checkpoint.duration,requestId);}
      if(retainedParsedCandidate){state.diagnostics.currentStage="RETRYING VALIDATION";notify();const normalized=window.BT001HeatmapDataset.validateAndNormalize(retainedParsedCandidate,{symbol:"BTCUSDT",duration:checkpoint.duration});return await publishNormalized(normalized,checkpoint.duration,requestId);}
      if(retainedRawPayload){state.diagnostics.currentStage="RETRYING CACHED PAYLOAD";notify();return await processPayload(retainedRawPayload,checkpoint.duration,requestId);}
      const payload=await window.BT001HeatmapProvider.retrieveDataset({datasetId:checkpoint.datasetId,runId:checkpoint.runId,requestId,isCurrent:id=>id===state.requestGeneration,onStage:update=>{if(requestId===state.requestGeneration)requestStage(update);},startedAt:state.diagnostics.requestStartedAt});
      if(requestId!==state.requestGeneration)return false;
      return await processPayload(payload,checkpoint.duration,requestId);
    }catch(error){if(requestId!==state.requestGeneration)return false;markFailure(error);return false;}
    finally{if(requestId===state.requestGeneration){state.loading=false;notify();}}
  }
  function destroy(){state.requestGeneration++;state.loading=false;state.diagnostics.currentStage="DESTROYED";notify();}
  window.BT001HeatmapState=Object.freeze({DURATIONS,DEFAULTS,snapshot,setPreference,subscribe,refresh,retryDatasetRetrieval,reportRender,destroy});
})();
