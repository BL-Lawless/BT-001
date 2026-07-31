"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const root=__dirname,storage=new Map(),eventAt="2026-07-31T12:34:56.000Z";
  const row={
    id:17,event_at:eventAt,symbol:"BTCUSDT",duration:"3D",provider_run_id:"run-17",provider_dataset_id:"dataset-17",
    cells:[
      {startTime:1700000000,endTime:1700000900,lowerPrice:60000,upperPrice:60010,centerPrice:60005,rawIntensity:100,normalizedIntensity:1,timeIndex:0,priceIndex:0}
    ],
    metadata:{sourceSymbol:"BTCUSDT",sourceInterval:"15m",chartIntervalSeconds:900,tickSize:10,datasetStart:1700000000,datasetEnd:1700000900,validCellCount:1,rejectedCellCount:0,maxLiqValue:100,p50:50,p90:90,p99:99,timestampUnit:"seconds"}
  };
  let reads=0,fetchCalls=0;
  const context={console,Date,Math,Number,Object,Array,Set,Map,Error,Promise,String,Boolean,JSON,URLSearchParams,
    fetch(){fetchCalls++;throw new Error("browser heatmap must never call a provider");},
    setTimeout:callback=>{Promise.resolve().then(callback);return 1;},clearTimeout(){},
    setInterval:()=>1,clearInterval(){},requestAnimationFrame:callback=>{Promise.resolve().then(callback);return 1;},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent(){},
    BT001Supabase:{async getLatestHeatmapSnapshot(symbol){reads++;assert.equal(symbol,"BTCUSDT");return row;}}
  };
  context.window=context;
  vm.createContext(context);
  for(const file of ["provider-adapter.module.js","state.module.js","renderer.module.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }

  assert.equal(await context.BT001HeatmapState.refresh(),true);
  const ready=context.BT001HeatmapState.snapshot();
  assert.equal(reads,1);
  assert.equal(fetchCalls,0,"Supabase bridge must make no Apify/CoinAnk request");
  assert.equal(ready.status,"READY");
  assert.equal(ready.displayedDuration,"3D");
  assert.equal(ready.lastSuccessfulUpdate,Date.parse(eventAt),"freshness must use row event_at");
  assert.equal(ready.dataset.cells.length,1);
  context.BT001HeatmapState.setPreference("selectedDuration","1D");
  assert.equal(context.BT001HeatmapState.snapshot().prefs.selectedDuration,"3D","duration is fixed and read-only");

  context.BT001HeatmapState.setPreference("enabled",true);
  const fills=[],labels=[];
  const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},fill(){},fillRect(...args){fills.push(args);},strokeRect(){},fillText(value){labels.push(value);},measureText(value){return {width:value.length*6};},set imageSmoothingEnabled(v){},set fillStyle(v){},set strokeStyle(v){},set font(v){},set textBaseline(v){},set textAlign(v){}};
  const view={left:0,top:0,width:300,height:200,minPrice:59990,maxPrice:60020,visibleStartTime:1699999900,visibleEndTime:1700001000,timeToX:t=>(t-1699999900)/4,priceToY:p=>(60020-p)*5};
  const report=context.BT001HeatmapRenderer.draw(ctx,view,context.BT001HeatmapState.snapshot());
  assert.equal(report.drawnCellCount,1,"manually inserted normalized row must render end-to-end");
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
