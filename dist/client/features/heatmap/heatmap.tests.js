"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const root=__dirname,storage=new Map(),eventAt="2026-07-31T12:34:56.000Z";
  const chartTimeArray=Array.from({length:289},(_,index)=>1700000000+index*900),priceArray=Array.from({length:146},(_,index)=>59000+index*10),data=[];
  for(let timeIndex=0;timeIndex<chartTimeArray.length;timeIndex++)for(let priceIndex=0;priceIndex<priceArray.length;priceIndex++){const value=1+((timeIndex*priceArray.length+priceIndex)%9);data.push([String(timeIndex),String(priceIndex),String(value).padEnd(45,"0")]);}
  const rawPayload=[{success:true,message:"ok",tickSize:10,chartInterval:"15m",start:chartTimeArray[0],end:chartTimeArray.at(-1)+900,liqHeatMap:{data,chartTimeArray,priceArray,maxLiqValue:9e44}}];
  let row={id:17,event_at:eventAt,symbol:"BTCUSDT",duration:"3D",provider_run_id:"run-17",provider_dataset_id:"dataset-17",storage_path:"BTCUSDT/3D/2026/07/31/file.json",file_size_bytes:JSON.stringify(rawPayload).length,metadata:{rawCellCount:data.length}};
  let metadataReads=0,payloadReads=0,fetchCalls=0;
  const context={console,Date,Math,Number,Object,Array,Set,Map,Error,Promise,String,Boolean,JSON,URLSearchParams,
    fetch(){fetchCalls++;throw new Error("browser heatmap must never call a provider");},
    setTimeout:callback=>{Promise.resolve().then(callback);return 1;},clearTimeout(){},
    setInterval:()=>1,clearInterval(){},requestAnimationFrame:callback=>{Promise.resolve().then(callback);return 1;},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent(){},
    BT001Supabase:{
      async getLatestHeatmapSnapshotMetadata(symbol){metadataReads++;assert.equal(symbol,"BTCUSDT");return row;},
      async getHeatmapSnapshotPayload(storagePath){payloadReads++;assert.equal(storagePath,row.storage_path);return rawPayload;}
    }
  };
  context.window=context;
  vm.createContext(context);
  for(const file of ["dataset.module.js","provider-adapter.module.js","state.module.js","renderer.module.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }

  assert.equal(await context.BT001HeatmapState.refresh(),true);
  const ready=context.BT001HeatmapState.snapshot();
  assert.equal(metadataReads,1);
  assert.equal(payloadReads,1,"the first load must retrieve the Storage payload");
  assert.equal(fetchCalls,0,"Supabase bridge must make no Apify/CoinAnk request");
  assert.equal(ready.status,"READY");
  assert.equal(ready.displayedDuration,"3D");
  assert.equal(ready.lastSuccessfulUpdate,Date.parse(eventAt),"freshness must use row event_at");
  assert.equal(ready.dataset.cells.length,289*146,"real-scale 289x146 Storage payload must normalize end-to-end");

  const firstDataset=ready.dataset;
  assert.equal(await context.BT001HeatmapState.refresh(),true,"an unchanged metadata check is still a successful refresh");
  const unchanged=context.BT001HeatmapState.snapshot();
  assert.equal(metadataReads,2,"each refresh must still check the latest snapshot row");
  assert.equal(payloadReads,1,"an unchanged snapshot id must not re-download the Storage object");
  assert.strictEqual(unchanged.dataset,firstDataset,"an unchanged check must retain the currently rendered dataset");
  assert.equal(unchanged.lastSuccessfulUpdate,Date.parse(eventAt),"unchanged checks must preserve the dataset's as-of timestamp");

  const changedAt="2026-07-31T13:04:56.000Z";
  row={...row,id:18,event_at:changedAt,provider_run_id:"run-18",provider_dataset_id:"dataset-18",storage_path:"BTCUSDT/3D/2026/07/31/file-18.json"};
  let rejectNextRender=true;
  context.BT001HeatmapState.subscribe(state=>{
    if(rejectNextRender&&state.diagnostics.currentStage==="RENDERING"){
      rejectNextRender=false;
      context.BT001HeatmapState.reportRender({renderFailure:true,errorMessage:"synthetic render failure"});
    }
  });
  assert.equal(await context.BT001HeatmapState.refresh(),false,"a dataset that fails rendering must not become the comparison baseline");
  const rejected=context.BT001HeatmapState.snapshot();
  assert.equal(payloadReads,2);
  assert.strictEqual(rejected.dataset,firstDataset,"render failure must restore the previously published dataset");
  assert.equal(rejected.lastSuccessfulUpdate,Date.parse(eventAt));

  assert.equal(await context.BT001HeatmapState.refresh(),true);
  const changed=context.BT001HeatmapState.snapshot();
  assert.equal(metadataReads,4);
  assert.equal(payloadReads,3,"a new snapshot id must be downloaded again until it renders successfully");
  assert.notStrictEqual(changed.dataset,firstDataset,"a changed snapshot must replace the rendered dataset");
  assert.equal(changed.lastSuccessfulUpdate,Date.parse(changedAt),"a changed snapshot must update the existing freshness label source");
  context.BT001HeatmapState.setPreference("selectedDuration","1D");
  assert.equal(context.BT001HeatmapState.snapshot().prefs.selectedDuration,"3D","duration is fixed and read-only");

  context.BT001HeatmapState.setPreference("enabled",true);
  const fills=[],labels=[];
  const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},fill(){},fillRect(...args){fills.push(args);},strokeRect(){},fillText(value){labels.push(value);},measureText(value){return {width:value.length*6};},set imageSmoothingEnabled(v){},set fillStyle(v){},set strokeStyle(v){},set font(v){},set textBaseline(v){},set textAlign(v){}};
  const view={left:0,top:0,width:300,height:200,minPrice:59990,maxPrice:60020,visibleStartTime:1699999900,visibleEndTime:1700001000,timeToX:t=>(t-1699999900)/4,priceToY:p=>(60020-p)*5};
  const report=context.BT001HeatmapRenderer.draw(ctx,view,context.BT001HeatmapState.snapshot());
  assert(report.drawnCellCount>0,"Storage-fetched real-scale payload must render end-to-end");
  context.BT001HeatmapRenderer.drawDecorations(ctx,view,context.BT001HeatmapState.snapshot());
  assert(labels.some(label=>label.includes("as of")),"chart source label must include freshness");

  const ui=fs.readFileSync(path.join(root,"ui.module.js"),"utf8");
  for(const removed of ["heatmapProviderSecret","heatmapProviderTest","heatmapSettingsRefresh","heatmapRetryDataset","heatmapDuration","Automatic refresh: OFF"])assert(!ui.includes(removed),`${removed} must be removed`);
  assert(ui.includes("Data source: VM-scheduled (5x/day)"));
  const html=fs.readFileSync(path.join(root,"..","..","index.html"),"utf8");
  assert(!html.includes("features/heatmap/provider-auth.module.js"));
  assert(!html.includes("features/heatmap/provider-config.module.js"));
  console.log("heatmap tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
