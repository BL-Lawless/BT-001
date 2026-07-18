"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const storage = new Map();
const context = {
  console,
  Date,
  Math,
  Number,
  Object,
  Array,
  Set,
  Map,
  Error,
  Promise,
  String,
  Boolean,
  JSON,
  encodeURIComponent,
  setTimeout,
  clearTimeout,
  localStorage:{getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
  fetch:undefined
};
context.window=context;
vm.createContext(context);
for(const file of ["provider-config.module.js","provider-auth.module.js","provider-adapter.module.js","dataset.module.js","state.module.js","renderer.module.js"]){
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
}

function fixture(duration="3D"){
  return [{
    chartTimeArray:[1700000000000,1700000900000,1700001800000],
    priceArray:[60000,60010,60020],
    data:[[0,0,10],[1,1,100],[2,2,1000],[9,0,7],[1,2,"bad"]],
    tickSize:10,
    chartInterval:"15m",
    maxLiqValue:1000,
    datasetStartTime:1700000000000,
    datasetEndTime:1700002700000,
    sourceSymbol:"BTCUSDT",
    sourceInterval:"15m",
    duration
  }];
}

module.exports=(async()=>{
  const uiSource=fs.readFileSync(path.join(root,"ui.module.js"),"utf8");
  const styleSource=fs.readFileSync(path.join(root,"..","..","style.css"),"utf8");
  assert(uiSource.includes('tab.dataset.tab=TAB_KEY'),"Heatmap Settings tab must be registered");
  assert(uiSource.includes('panel.dataset.tab=TAB_KEY'),"Heatmap Settings panel must be registered");
  assert.equal((uiSource.match(/addEventListener\("click",manualRefresh\)/g)||[]).length,1,"Refresh must exist only in Settings");
  assert(uiSource.includes('button.id="heatmapOverlayToggle"'),"standard chart overlay toggle must be installed");
  assert(uiSource.includes("group.appendChild(otf);group.appendChild(button);group.appendChild(orders)"),"Heatmap toggle must be grouped after OTF and before Orders");
  assert(!uiSource.includes("heatmapCompact"),"dedicated compact chart controls must be removed");
  assert(!uiSource.includes("openHeatmapSettings"),"chart-level Settings shortcut must be removed");
  assert(styleSource.includes(".chart-overlay-control-group > .calc-module-orders-toggle{position:static !important"),"grouped controls must use flex flow, not separate absolute placement");
  assert(!/\.heatmap-overlay-toggle\s*\{[^}]*position\s*:\s*absolute/i.test(styleSource),"Heatmap toggle must not be absolutely positioned");
  assert(!uiSource.includes("setInterval"),"UI must not install automatic refresh");
  let fetchCount=0;
  context.fetch=async()=>{fetchCount++;throw new Error("unexpected network request");};
  assert.equal(fetchCount,0,"module load must not fetch");
  context.BT001HeatmapState.setPreference("enabled",true);
  context.BT001HeatmapState.setPreference("selectedDuration","1W");
  assert.equal(fetchCount,0,"preference changes must not fetch");
  assert.equal(context.BT001HeatmapState.snapshot().status,"NOT_LOADED");
  const missingConfig=context.BT001HeatmapState.refresh();
  assert.equal(context.BT001HeatmapState.snapshot().status,"STARTING_REQUEST","Refresh must confirm the click synchronously");
  assert.equal(await missingConfig,false);
  assert.equal(context.BT001HeatmapState.snapshot().status,"UPDATE_FAILED");
  assert.equal(context.BT001HeatmapState.snapshot().diagnostics.currentStage,"API KEY REQUIRED");
  assert.equal(context.BT001HeatmapState.snapshot().diagnostics.reason,"API key not configured");
  assert.equal(fetchCount,0,"missing configuration must fail before fetch with visible diagnostics");

  const normalized=context.BT001HeatmapDataset.validateAndNormalize({items:fixture()},{symbol:"BTCUSDT"});
  assert.equal(normalized.metadata.validCellCount,3);
  assert.equal(normalized.metadata.rejectedCellCount,2);
  assert.equal(normalized.cells[0].startTime,1700000000);
  assert.equal(normalized.cells[0].endTime,1700000900);
  assert.equal(normalized.cells[2].lowerPrice,60020);
  assert.equal(normalized.cells[2].upperPrice,60030);
  assert.equal(normalized.cells[2].rawIntensity,1000);
  assert.equal(normalized.metadata.rawCellCount,5);
  assert.equal(normalized.metadata.timestampUnit,"milliseconds");
  const nested=context.BT001HeatmapDataset.validateAndNormalize({items:[{output:{heatmap:fixture()[0]}}]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(nested.metadata.selectedObject,"datasetItems[0].output.heatmap");
  const actualShape=context.BT001HeatmapDataset.validateAndNormalize({items:[{tickSize:10,chartInterval:"15m",start:1700000000000,end:1700002700000,liqHeatMap:{chartTimeArray:fixture()[0].chartTimeArray,priceArray:fixture()[0].priceArray,data:fixture()[0].data,maxLiqValue:1000}}]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(actualShape.metadata.selectedObject,"datasetItems[0].liqHeatMap");
  assert.equal(actualShape.metadata.tickSize,10);
  const stringWrappedItem={title:"cached dataset item",data:JSON.stringify({success:true,tickSize:10,chartInterval:"15m",liqHeatMap:fixture()[0]})};
  const stringWrapped=context.BT001HeatmapDataset.validateAndNormalize({items:[stringWrappedItem]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(stringWrapped.metadata.selectedObject,"datasetItems[0].data → decoded JSON.liqHeatMap");
  assert.equal(stringWrapped.diagnostics.payloadStructure.topLevelType,"object");
  assert.deepEqual(Array.from(stringWrapped.diagnostics.payloadStructure.topLevelKeys),["title","data"]);
  assert.deepEqual(Array.from(stringWrapped.diagnostics.decodedStringPaths),["datasetItems[0].data"]);
  const directString=context.BT001HeatmapDataset.validateAndNormalize({items:[JSON.stringify(fixture()[0])]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(directString.metadata.selectedObject,"datasetItems[0] → decoded JSON");
  const dataArrayWrapper=context.BT001HeatmapDataset.validateAndNormalize({items:[{response:{data:[{payload:fixture()[0]}]}}]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(dataArrayWrapper.metadata.selectedObject,"datasetItems[0].response.data[0].payload");
  const optionalMetadataMissing=context.BT001HeatmapDataset.validateAndNormalize({items:[{content:{chartTimeArray:fixture()[0].chartTimeArray,priceArray:fixture()[0].priceArray,data:fixture()[0].data}}]},{symbol:"BTCUSDT",duration:"3D"});
  assert.equal(optionalMetadataMissing.metadata.selectedObject,"datasetItems[0].content");
  assert.equal(optionalMetadataMissing.metadata.tickSize,10);
  assert.equal(optionalMetadataMissing.metadata.chartIntervalSeconds,900);
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{output:{chartTimeArray:[],priceArray:[],data:[]}}]}),error=>error.stage==="DATASET VALIDATION FAILED"&&/Empty heatmap dataset/.test(error.message));
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{data:'{"chartTimeArray": [1]'}]}),error=>error.stage==="DATASET PARSING FAILED"&&/JSON decode failed/.test(error.message));
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{content:{unrelated:true}}]}),error=>error.stage==="DATASET PARSING FAILED"&&/Unsupported dataset wrapper/.test(error.message));
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{outputUrl:"https://example.invalid/result.json"}]}),error=>error.stage==="DATASET PARSING FAILED"&&/Unsupported output reference/.test(error.message)&&error.diagnostics.payloadStructure.referencePaths.length===1);
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{result:{chartTimeArray:fixture()[0].chartTimeArray}}]}),error=>error.stage==="DATASET PARSING FAILED"&&/Core fields missing/.test(error.message)&&error.diagnostics.selectedObject==="datasetItems[0].result");
  assert.throws(()=>context.BT001HeatmapDataset.validateAndNormalize({items:[{chartTimeArray:fixture()[0].chartTimeArray,priceArray:fixture()[0].priceArray,data:[[99,99,"bad"]]}]}),error=>error.stage==="DATASET VALIDATION FAILED"&&/Invalid indexed-cell structure/.test(error.message));

  const requests=[];
  const secretInput={value:"private-value"};
  assert(context.BT001HeatmapAuth.saveFromInput(secretInput));
  assert.equal(secretInput.value,"","saved key must be cleared from the visible input");
  assert.equal(context.BT001HeatmapAuth.keyStatus(),"CONFIGURED");
  assert.equal(fetchCount,0,"saving a key must not start an Actor");
  const credentialSlots=Array.from(storage.entries()).filter(([_key,value])=>String(value).includes("private-value"));
  assert.equal(credentialSlots.length,1);
  assert(!/key|token|secret/i.test(credentialSlots[0][0]),"credential storage slot must be opaque");
  let connectionCalls=0;
  context.fetch=async(url,options={})=>{connectionCalls++;assert(url.endsWith("/v2/users/me"));assert(options.headers.Authorization);return {ok:true,status:200,json:async()=>({data:{id:"user"}})};};
  assert((await context.BT001HeatmapAuth.testConnection()).ok);
  assert.equal(connectionCalls,1,"connection test should make one lightweight request");
  assert.equal(fetchCount,0,"connection test must not start an Actor");
  context.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url.endsWith("/runs")) return {ok:true,status:201,json:async()=>({data:{id:"run-1",status:"SUCCEEDED",defaultDatasetId:"dataset-1"}})};
    if(url.includes("/datasets/")) return {ok:true,status:200,json:async()=>({data:{items:[{tickSize:10,chartInterval:"15m",data:JSON.stringify({liqHeatMap:fixture("1W")[0]})}]}})};
    throw new Error(`Unexpected URL ${url}`);
  };
  const stages=[];
  const unsubscribe=context.BT001HeatmapState.subscribe(value=>stages.push(value.diagnostics.currentStage));
  const first=context.BT001HeatmapState.refresh();
  const duplicate=await context.BT001HeatmapState.refresh();
  assert.equal(duplicate,false,"concurrent refresh must be ignored");
  assert.equal(await first,true);
  const ready=context.BT001HeatmapState.snapshot();
  assert.equal(ready.status,"READY");
  assert.equal(ready.displayedDuration,"1W");
  assert.equal(requests.length,2,"one manual refresh should start one run and read one dataset");
  assert(requests.every(req=>!req.url.includes("private-value")),"credential must not appear in URLs");
  assert(requests.every(req=>req.options.headers.Authorization==="Bearer private-value"));
  assert.equal(JSON.parse(requests[0].options.body).interval,"1w","UI duration must map to the Actor interval");
  assert.equal(JSON.parse(requests[0].options.body).symbol,"BTCUSDT");
  assert.equal(ready.recovery.actorStatus,"SUCCEEDED");
  assert.equal(ready.recovery.datasetId,"dataset-1");
  assert.equal(ready.recovery.datasetRetrievalStatus,"RETRIEVED");
  for(const expectedStage of ["STARTING ACTOR","PROVIDER AUTHENTICATION","ACTOR STARTED","ACTOR SUCCEEDED","RETRIEVING DATASET","DATASET RETRIEVED","PARSING DATASET","VALIDATING DATASET","NORMALIZING","PUBLISHING DATASET","RENDERING","READY"]){
    assert(stages.includes(expectedStage),`missing request stage: ${expectedStage}`);
  }
  unsubscribe();

  context.BT001HeatmapState.setPreference("selectedDuration","3D");
  assert.equal(context.BT001HeatmapState.snapshot().status,"REFRESH_REQUIRED");
  assert.equal(context.BT001HeatmapState.snapshot().displayedDuration,"1W");
  const retained=context.BT001HeatmapState.snapshot().dataset;
  let recoveryActorStarts=0,recoveryDatasetReads=0;
  context.fetch=async(url,options={})=>{
    requests.push({url,options});
    if(url.endsWith("/runs")){recoveryActorStarts++;return {ok:true,status:201,json:async()=>({data:{id:"recover-run",status:"SUCCEEDED",defaultDatasetId:"recover-dataset",finishedAt:new Date().toISOString(),stats:{runTimeSecs:7}}})};}
    if(url.includes("/datasets/")){
      recoveryDatasetReads++;
      if(recoveryDatasetReads===1)return {ok:false,status:503,json:async()=>({error:"temporary"})};
      return {ok:true,status:200,json:async()=>fixture("3D")};
    }
    throw new Error(`Unexpected recovery URL ${url}`);
  };
  assert.equal(await context.BT001HeatmapState.refresh(),false);
  let failed=context.BT001HeatmapState.snapshot();
  assert.equal(failed.status,"UPDATE_FAILED");
  assert.equal(failed.diagnostics.currentStage,"DATASET RETRIEVAL FAILED");
  assert.equal(failed.recovery.actorStatus,"SUCCEEDED","successful Actor status must survive downstream failure");
  assert.equal(failed.recovery.datasetId,"recover-dataset");
  assert.equal(failed.recovery.datasetRetrievalStatus,"FAILED");
  assert.equal(failed.recovery.retryEligible,true);
  assert.strictEqual(failed.dataset,retained,"failed refresh must retain last valid dataset");
  assert.equal(failed.diagnostics.displayingPreviousDataset,true);
  assert.equal(await context.BT001HeatmapState.retryDatasetRetrieval(),true);
  const recovered=context.BT001HeatmapState.snapshot();
  assert.equal(recoveryActorStarts,1,"dataset recovery must not start another Actor");
  assert.equal(recoveryDatasetReads,2,"dataset recovery must retry only the retained dataset GET");
  assert.equal(recovered.status,"READY");
  assert.equal(recovered.displayedDuration,"3D");
  assert.equal(recovered.recovery.retryEligible,false);
  context.BT001HeatmapState.reportRender({renderFailure:true,errorMessage:"synthetic renderer failure",drawnCellCount:0,zeroDrawReason:"Heatmap renderer failed before draw"});
  const renderFailed=context.BT001HeatmapState.snapshot();
  assert.equal(renderFailed.diagnostics.currentStage,"RENDERING FAILED");
  assert.equal(renderFailed.recovery.actorStatus,"SUCCEEDED");
  assert.equal(renderFailed.recovery.hasNormalizedCandidate,true);
  assert.equal(renderFailed.recovery.retryEligible,true);
  assert.equal(await context.BT001HeatmapState.retryDatasetRetrieval(),true);
  assert.equal(recoveryActorStarts,1,"render recovery must not start another Actor");
  assert.equal(recoveryDatasetReads,2,"render recovery must not call the provider");

  let rawActorStarts=0,rawDatasetReads=0;
  context.BT001HeatmapState.setPreference("selectedDuration","1D");
  context.fetch=async url=>{
    if(url.endsWith("/runs")){rawActorStarts++;return {ok:true,status:201,json:async()=>({data:{id:"raw-run",status:"SUCCEEDED",defaultDatasetId:"raw-dataset"}})};}
    if(url.includes("/datasets/")){rawDatasetReads++;return {ok:true,status:200,json:async()=>[{notAHeatmap:true}]};}
    throw new Error(`Unexpected cached-payload URL ${url}`);
  };
  assert.equal(await context.BT001HeatmapState.refresh(),false);
  failed=context.BT001HeatmapState.snapshot();
  assert.equal(failed.diagnostics.currentStage,"DATASET PARSING FAILED");
  assert.equal(failed.recovery.hasRawPayload,true);
  assert.equal(failed.recovery.hasNormalizedCandidate,false);
  assert.equal(await context.BT001HeatmapState.retryDatasetRetrieval(),false);
  assert.equal(rawActorStarts,1,"cached-payload recovery must not start another Actor");
  assert.equal(rawDatasetReads,1,"cached-payload recovery must not download the dataset again");

  let validationActorStarts=0,validationDatasetReads=0;
  context.fetch=async url=>{
    if(url.endsWith("/runs")){validationActorStarts++;return {ok:true,status:201,json:async()=>({data:{id:"validation-run",status:"SUCCEEDED",defaultDatasetId:"validation-dataset"}})};}
    if(url.includes("/datasets/")){validationDatasetReads++;return {ok:true,status:200,json:async()=>[{output:{chartTimeArray:"invalid",priceArray:fixture()[0].priceArray,data:fixture()[0].data}}]};}
    throw new Error(`Unexpected validation URL ${url}`);
  };
  assert.equal(await context.BT001HeatmapState.refresh(),false);
  failed=context.BT001HeatmapState.snapshot();
  assert.equal(failed.diagnostics.currentStage,"DATASET VALIDATION FAILED");
  assert.equal(failed.recovery.hasParsedCandidate,true);
  assert.equal(await context.BT001HeatmapState.retryDatasetRetrieval(),false);
  assert.equal(validationActorStarts,1,"parsed-payload retry must not start another Actor");
  assert.equal(validationDatasetReads,1,"parsed-payload retry must resume at validation without downloading");

  const liveProvider=context.BT001HeatmapProvider;
  context.BT001HeatmapProvider={run:async({onStage})=>{onStage({stage:"ACTOR SUCCEEDED",runId:"associated-run",datasetId:"associated-dataset",runStatus:"SUCCEEDED",actorCompletedAt:Date.now(),runDurationMs:2000,datasetRetrievalStatus:"NOT_REQUESTED"});return {runId:"associated-run",datasetId:"wrong-dataset",items:fixture("1D")};}};
  assert.equal(await context.BT001HeatmapState.refresh(),false);
  failed=context.BT001HeatmapState.snapshot();
  assert.equal(failed.diagnostics.currentStage,"DATASET ASSOCIATION FAILED");
  assert.equal(failed.recovery.datasetId,"associated-dataset");
  context.BT001HeatmapProvider=liveProvider;

  context.BT001HeatmapAuth.clear();
  assert.equal(context.BT001HeatmapAuth.keyStatus(),"NOT CONFIGURED");

  const fills=[];
  const ctx={save(){},restore(){},beginPath(){},rect(...args){if(args.length)fills.push(args);},clip(){},fill(){},fillRect(...args){fills.push(args);},measureText(){return {width:20};},strokeRect(){},fillText(){},set imageSmoothingEnabled(v){this.smoothing=v;},set fillStyle(v){this.color=v;},set strokeStyle(v){},set font(v){},set textBaseline(v){},set textAlign(v){}};
  const renderState={...failed,status:"READY",prefs:{...failed.prefs,enabled:true,strength:0,opacity:35},dataset:retained};
  const stats=context.BT001HeatmapRenderer.draw(ctx,{left:0,top:0,width:300,height:200,minPrice:59990,maxPrice:60040,visibleStartTime:1699999900,visibleEndTime:1700002800,timeToX:t=>(t-1699999900)/10,priceToY:p=>(60040-p)*4},renderState);
  assert.equal(stats.drawnCellCount,3);
  assert(fills.length>=3);
  assert(context.BT001HeatmapRenderer._test.intensity(100,retained.metadata,{mode:"BALANCED",maxClipping:99})>context.BT001HeatmapRenderer._test.intensity(100,retained.metadata,{mode:"RAW",maxClipping:99}),"Balanced mode should lift medium values");

  let simulatedNow=0,pollCount=0,actorStarts=0,datasetReads=0;
  class SimulatedDate extends Date{static now(){return simulatedNow;}}
  const longStorage=new Map();
  const longContext={console,Date:SimulatedDate,Math,Number,Object,Array,Set,Map,Error,Promise,String,Boolean,JSON,encodeURIComponent,
    setTimeout(callback,ms){simulatedNow+=Number(ms)||0;Promise.resolve().then(callback);return 1;},clearTimeout(){},
    localStorage:{getItem:key=>longStorage.has(key)?longStorage.get(key):null,setItem:(key,value)=>longStorage.set(key,String(value)),removeItem:key=>longStorage.delete(key)}};
  longContext.window=longContext;
  longContext.fetch=async(url,options={})=>{
    if(url.endsWith("/runs")){actorStarts++;return {ok:true,status:201,json:async()=>({data:{id:"long-run",status:"READY"}})};}
    if(url.includes("/actor-runs/")){pollCount++;return {ok:true,status:200,json:async()=>({data:{id:"long-run",status:pollCount>=8?"SUCCEEDED":"RUNNING",defaultDatasetId:pollCount>=8?"long-dataset":undefined}})};}
    if(url.includes("/datasets/")){datasetReads++;return {ok:true,status:200,json:async()=>[{complete:true}]};}
    throw new Error("unexpected long-run request");
  };
  vm.createContext(longContext);
  for(const file of ["provider-config.module.js","provider-auth.module.js","provider-adapter.module.js"]){vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),longContext,{filename:file});}
  longContext.BT001HeatmapAuth.saveFromInput({value:"long-run-placeholder"});
  const longStages=[];
  const longResult=await longContext.BT001HeatmapProvider.run({duration:"3D",requestId:1,isCurrent:()=>true,onStage:update=>longStages.push(update)});
  assert.equal(actorStarts,1,"long-running workflow must not restart the Actor");
  assert.equal(datasetReads,1,"dataset must be retrieved once after success");
  assert.equal(longResult.terminalStatus,"SUCCEEDED");
  assert(longResult.elapsedMs>=30000,"simulated Actor run must remain active beyond 30 seconds");
  assert(longStages.some(update=>update.stage==="ACTOR RUNNING"&&update.runStatus==="READY"));
  assert(longStages.some(update=>update.stage==="ACTOR RUNNING"&&update.runStatus==="RUNNING"));

  console.log("heatmap tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;throw error;});
