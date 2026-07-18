(() => {
  "use strict";

  const IN_PROGRESS=new Set(["READY","RUNNING"]);
  const TERMINAL_FAILURES=new Set(["FAILED","ABORTED","TIMED-OUT"]);
  class HeatmapProviderError extends Error {
    constructor(code,message,details={}){super(message);this.name="HeatmapProviderError";this.code=code;this.stage=details.stage||"PROVIDER AUTHENTICATION";this.httpStatus=Number.isInteger(details.httpStatus)?details.httpStatus:null;this.runStatus=details.runStatus||null;}
  }
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const emit=(fn,stage,details={})=>{if(typeof fn==="function")fn({stage,...details});};
  function sanitizedHttpReason(status){if(status===401||status===403)return "Provider authentication rejected";if(status===404)return "Provider resource not found";if(status===429)return "Provider rate limit reached";if(status>=500)return "Provider service failed";return "Provider request rejected";}
  function terminalReason(status){return status==="FAILED"?"Actor failed":status==="ABORTED"?"Actor aborted":"Actor timed out";}
  async function jsonRequest(url,options,{stage,onStage,timeoutMs=30000,startedAt}){
    const controller=typeof AbortController==="function"?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),Math.max(1000,timeoutMs)):null;
    try{
      const response=await fetch(url,controller?Object.assign({},options,{signal:controller.signal}):options);
      emit(onStage,stage,{httpStatus:response.status,elapsedMs:Date.now()-startedAt});
      if(!response.ok)throw new HeatmapProviderError("HTTP_ERROR",sanitizedHttpReason(response.status),{stage,httpStatus:response.status});
      try{return await response.json();}catch(_error){throw new HeatmapProviderError("MALFORMED_JSON","Provider returned malformed JSON",{stage,httpStatus:response.status});}
    }catch(error){
      if(error instanceof HeatmapProviderError)throw error;
      if(error&&error.name==="AbortError")throw new HeatmapProviderError("REQUEST_TIMEOUT","Provider request timed out",{stage});
      throw new HeatmapProviderError("NETWORK_ERROR","Provider request blocked or unavailable",{stage});
    }finally{if(timer)clearTimeout(timer);}
  }
  function authHeaders(credential,extra){return Object.assign({"Authorization":`Bearer ${credential}`,"Accept":"application/json"},extra||{});}
  async function authenticatedJson(credential,url,options,request){
    try{return await jsonRequest(url,options,request);}
    catch(error){
      if(error&&[401,403].includes(error.httpStatus)){
        window.BT001HeatmapAuth.markRejected();
        throw new HeatmapProviderError("AUTH_REJECTED","Provider authentication rejected",{stage:request.stage,httpStatus:error.httpStatus,runStatus:error.runStatus});
      }
      throw error;
    }
  }

  async function retrieveDataset({datasetId,runId=null,requestId,isCurrent=()=>true,onStage,startedAt=Date.now(),timeoutMs}){
    const auth=window.BT001HeatmapAuth;
    const credential=auth&&auth.getCredential();
    if(!credential)throw new HeatmapProviderError("API_KEY_REQUIRED","API key not configured",{stage:"API KEY REQUIRED",runStatus:"SUCCEEDED"});
    const config=window.BT001HeatmapProviderConfig&&window.BT001HeatmapProviderConfig.get();
    if(!config||!config.apiBase)throw new HeatmapProviderError("INVALID_PROVIDER","Provider configuration unavailable",{stage:"DATASET RETRIEVAL FAILED",runStatus:"SUCCEEDED"});
    if(!datasetId)throw new HeatmapProviderError("MISSING_DATASET","Completed Actor run has no dataset",{stage:"DATASET RETRIEVAL FAILED",runStatus:"SUCCEEDED"});
    if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded",{stage:"RETRIEVING DATASET",runStatus:"SUCCEEDED"});
    const effectiveTimeout=Math.max(1000,Math.min(30000,Number(timeoutMs)||config.timeoutMs||30000));
    emit(onStage,"RETRIEVING DATASET",{runId,datasetId:String(datasetId),runStatus:"SUCCEEDED",datasetRetrievalStatus:"REQUESTING",elapsedMs:Date.now()-startedAt});
    let payload;
    try{
      payload=await authenticatedJson(credential,`${config.apiBase}/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,{headers:authHeaders(credential)},{stage:"RETRIEVING DATASET",onStage,timeoutMs:effectiveTimeout,startedAt});
    }catch(error){
      throw new HeatmapProviderError(error&&error.code||"DATASET_RETRIEVAL_FAILED",error&&error.message||"Dataset retrieval failed",{stage:"DATASET RETRIEVAL FAILED",httpStatus:error&&error.httpStatus,runStatus:"SUCCEEDED"});
    }
    const items=Array.isArray(payload)?payload:Array.isArray(payload&&payload.items)?payload.items:Array.isArray(payload&&payload.data)?payload.data:Array.isArray(payload&&payload.data&&payload.data.items)?payload.data.items:null;
    if(!Array.isArray(items)||!items.length)throw new HeatmapProviderError("EMPTY_DATASET","Completed dataset is empty",{stage:"DATASET RETRIEVAL FAILED",runStatus:"SUCCEEDED"});
    auth.markConfigured();
    emit(onStage,"DATASET RETRIEVED",{runId,datasetId:String(datasetId),runStatus:"SUCCEEDED",datasetRetrievalStatus:"RETRIEVED",rawItemCount:items.length,elapsedMs:Date.now()-startedAt});
    return {items,datasetId:String(datasetId),rawItemCount:items.length};
  }

  async function run({duration,requestId,isCurrent,onStage}){
    const startedAt=Date.now();
    emit(onStage,"PROVIDER AUTHENTICATION",{elapsedMs:0});
    const auth=window.BT001HeatmapAuth;
    const credential=auth&&auth.getCredential();
    if(!credential)throw new HeatmapProviderError("API_KEY_REQUIRED","API key not configured",{stage:"API KEY REQUIRED"});
    const config=window.BT001HeatmapProviderConfig&&window.BT001HeatmapProviderConfig.get();
    if(!config||!config.actorId||!config.actorApiId)throw new HeatmapProviderError("INVALID_ACTOR","Actor identifier unavailable",{stage:"INPUT VALIDATION"});
    const providerDuration=config.durationMap&&config.durationMap[duration];
    if(!providerDuration)throw new HeatmapProviderError("INVALID_INPUT","Selected duration is not supported",{stage:"INPUT VALIDATION"});
    const actor=encodeURIComponent(config.actorApiId);
    const input=config.buildInput({symbol:config.symbol,duration,providerDuration});

    emit(onStage,"STARTING ACTOR",{timeoutMs:config.timeoutMs,elapsedMs:Date.now()-startedAt});
    const startPayload=await authenticatedJson(credential,`${config.apiBase}/v2/acts/${actor}/runs`,{
      method:"POST",headers:authHeaders(credential,{"Content-Type":"application/json"}),body:JSON.stringify(input)
    },{stage:"STARTING ACTOR",onStage,timeoutMs:Math.min(30000,config.timeoutMs),startedAt});
    const started=startPayload&&startPayload.data;
    const runId=started&&started.id;
    if(!runId)throw new HeatmapProviderError("INVALID_RUN","Provider did not return a run identity",{stage:"STARTING ACTOR"});
    let completed=started;
    emit(onStage,"ACTOR STARTED",{runId:String(runId),runStatus:String(started.status||"").toUpperCase()||null,elapsedMs:Date.now()-startedAt});

    let consecutiveStatusErrors=0;
    while(true){
      if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded",{stage:"WAITING FOR COMPLETION"});
      const status=String(completed&&completed.status||"").toUpperCase();
      if(status==="SUCCEEDED")break;
      if(TERMINAL_FAILURES.has(status))throw new HeatmapProviderError(`ACTOR_${status}`,terminalReason(status),{stage:"WAITING FOR COMPLETION",runStatus:status});
      if(Date.now()-startedAt>=config.timeoutMs)throw new HeatmapProviderError("APPLICATION_TIMEOUT","Provider timeout",{stage:"WAITING FOR COMPLETION",runStatus:status||null});
      if(status&&!IN_PROGRESS.has(status)){
        consecutiveStatusErrors++;
        if(consecutiveStatusErrors>=config.maxConsecutiveStatusErrors)throw new HeatmapProviderError("INVALID_RUN_STATUS","Provider returned an unsupported Actor status",{stage:"WAITING FOR COMPLETION",runStatus:status});
      }
      emit(onStage,"ACTOR RUNNING",{runId:String(runId),runStatus:status||null,timeoutMs:config.timeoutMs,elapsedMs:Date.now()-startedAt,statusErrorCount:consecutiveStatusErrors});
      await delay(config.pollIntervalMs);
      if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded",{stage:"WAITING FOR COMPLETION"});
      if(Date.now()-startedAt>=config.timeoutMs)throw new HeatmapProviderError("APPLICATION_TIMEOUT","Provider timeout",{stage:"WAITING FOR COMPLETION",runStatus:status||null});
      try{
        const polled=await authenticatedJson(credential,`${config.apiBase}/v2/actor-runs/${encodeURIComponent(runId)}`,{headers:authHeaders(credential)},{stage:"ACTOR RUNNING",onStage,timeoutMs:Math.min(30000,Math.max(1000,config.timeoutMs-(Date.now()-startedAt))),startedAt});
        completed=polled&&polled.data;
        consecutiveStatusErrors=0;
      }catch(error){
        if(error&&["AUTH_REJECTED","STALE_REQUEST"].includes(error.code))throw error;
        consecutiveStatusErrors++;
        emit(onStage,"ACTOR RUNNING",{runId:String(runId),runStatus:status||null,timeoutMs:config.timeoutMs,elapsedMs:Date.now()-startedAt,statusErrorCount:consecutiveStatusErrors});
        if(consecutiveStatusErrors>=config.maxConsecutiveStatusErrors)throw new HeatmapProviderError("POLLING_FAILED","Provider status checks repeatedly failed",{stage:"WAITING FOR COMPLETION",httpStatus:error&&error.httpStatus,runStatus:status||null});
      }
    }
    if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded",{stage:"WAITING FOR COMPLETION"});
    const datasetId=completed&&completed.defaultDatasetId||started&&started.defaultDatasetId;
    const actorCompletedAt=Number.isFinite(Date.parse(completed&&completed.finishedAt||""))?Date.parse(completed.finishedAt):Date.now();
    const providerRunMs=Number(completed&&completed.stats&&completed.stats.runTimeSecs)*1000;
    const runDurationMs=Number.isFinite(providerRunMs)&&providerRunMs>=0?providerRunMs:Date.now()-startedAt;
    emit(onStage,"ACTOR SUCCEEDED",{runId:String(runId),datasetId:datasetId?String(datasetId):null,runStatus:"SUCCEEDED",actorCompletedAt,runDurationMs,datasetRetrievalStatus:datasetId?"NOT_REQUESTED":"UNAVAILABLE",lastSuccessfulProviderStage:"ACTOR SUCCEEDED",elapsedMs:Date.now()-startedAt});
    if(!datasetId)throw new HeatmapProviderError("MISSING_DATASET","Completed Actor run has no dataset",{stage:"RETRIEVING DATASET",runStatus:"SUCCEEDED"});
    const dataset=await retrieveDataset({datasetId,runId:String(runId),requestId,isCurrent,onStage,startedAt,timeoutMs:Math.max(1000,config.timeoutMs-(Date.now()-startedAt))});
    return {...dataset,runId:String(runId),terminalStatus:"SUCCEEDED",actorCompletedAt,runDurationMs,elapsedMs:Date.now()-startedAt};
  }

  window.BT001HeatmapProvider=Object.freeze({run,retrieveDataset,HeatmapProviderError});
})();
