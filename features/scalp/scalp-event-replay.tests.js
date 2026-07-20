"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");

class MemoryStorage{constructor(){this.data=new Map();}getItem(key){return this.data.has(key)?this.data.get(key):null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn);}dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn.call(this,event);return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}

function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,localStorage:new MemoryStorage()};
  context.window=context;context.dispatchEvent=()=>true;context.addEventListener=()=>{};context.removeEventListener=()=>{};
  vm.createContext(context);
  for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});
  return {context,build:context.__BT001_SCALP_BUILD__};
}

function ema(rows,period){
  const aligned=new Array(rows.length).fill(NaN);let current=null,alpha=2/(period+1);
  for(let i=0;i<rows.length;i++){
    if(i<period-1)continue;
    if(current==null){let sum=0;for(let j=i-period+1;j<=i;j++)sum+=rows[j].close;current=sum/period;}
    else current=rows[i].close*alpha+current*(1-alpha);
    aligned[i]=current;
  }
  return aligned;
}

class CanonicalReplayHub{
  constructor(){this.buffers=new Map();this.listeners=new Set();this.requirements=[];this.requests=[];this.visibleTf="1h";}
  seed(tf,closes){
    const seconds={"1m":60,"3m":180,"5m":300}[tf],rows=[];
    closes.forEach((close,index)=>{const previous=index?closes[index-1]:close,open=previous;rows.push({time:(index+1)*seconds,open,high:Math.max(open,close)+0.5,low:Math.min(open,close)-0.5,close,final:true});});
    this.buffers.set(tf,{closed:rows,forming:null,closedRevision:1,formingRevision:0});
  }
  setTimeframeRequirements(id,requirements){this.requirements.push({id,requirements:JSON.parse(JSON.stringify(requirements))});}
  ensureTimeframeBuffer(){return Promise.resolve(true);}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  getLatestPrice(){return {price:100,source:"aggTrade"};}
  getTimeframeRevisions(tf){const state=this.buffers.get(tf);return {tf,closedRevision:state.closedRevision,formingRevision:state.formingRevision};}
  rows(tf,includeForming=true,formingOverride=undefined){const state=this.buffers.get(tf),forming=formingOverride===undefined?state.forming:formingOverride;return state.closed.concat(includeForming&&forming?[forming]:[]).map(row=>({...row}));}
  getAuthoritativeMaSnapshot(tf,options={}){
    this.requests.push({tf,includeForming:options.includeForming!==false,periods:(options.periods||[]).slice()});
    const rows=this.rows(tf,options.includeForming!==false),periods=options.periods||[9,21,55,100,200],alignedByPeriod={},valuesByPeriod={};
    for(const period of periods)if(!alignedByPeriod[period]){alignedByPeriod[period]=ema(rows,period);valuesByPeriod[period]=alignedByPeriod[period][rows.length-1];}
    const reliable=rows.length>=Number(options.requiredRows||0)&&periods.every(period=>Number.isFinite(valuesByPeriod[period]));
    return {reliable,reason:reliable?"":"warmup-limited",rows,alignedByPeriod,valuesByPeriod};
  }
  makeForming(tf,close,extra={}){const state=this.buffers.get(tf),previous=state.closed[state.closed.length-1],seconds={"1m":60,"3m":180,"5m":300}[tf],open=previous.close;return {time:previous.time+seconds,open,high:extra.high??Math.max(open,close)+0.5,low:extra.low??Math.min(open,close)-0.5,close,final:false};}
  previewAnalysis(tf,close,tools){const row=this.makeForming(tf,close),snapshot=this.getAuthoritativeMaSnapshotForRows(this.rows(tf,true,row));return tools.analyze(snapshot.rows,snapshot.alignedByPeriod[9],snapshot.alignedByPeriod[55]);}
  getAuthoritativeMaSnapshotForRows(rows){const alignedByPeriod={9:ema(rows,9),55:ema(rows,55)};return {rows,alignedByPeriod};}
  closeForSeparation(tf,direction,target,tools){
    const state=this.buffers.get(tf),closed=this.getAuthoritativeMaSnapshot(tf,{includeForming:false,periods:[9,55,9,55,9],requiredRows:80}),fast=closed.valuesByPeriod[9],slow=closed.valuesByPeriod[55],af=2/10,as=2/56,desiredSign=direction==="LONG"?1:-1;
    const solve=gap=>(gap-fast*(1-af)+slow*(1-as))/(af-as);
    let low=1e-7,high=20,best=solve(desiredSign*low);
    for(let i=0;i<70;i++){const magnitude=(low+high)/2,candidate=solve(desiredSign*magnitude),analysis=this.previewAnalysis(tf,candidate,tools);best=candidate;if(!analysis||analysis.separation<target)low=magnitude;else high=magnitude;}
    assert.equal(Math.sign(this.previewAnalysis(tf,best,tools).gap),desiredSign);
    return best;
  }
  emitForming(tf,close,extra={}){const state=this.buffers.get(tf);state.forming=this.makeForming(tf,close,extra);state.formingRevision+=1;const update={type:"kline",tf,closed:false,row:{...state.forming},closedRevision:state.closedRevision,formingRevision:state.formingRevision,exchangeTime:state.forming.time*1000+500};for(const listener of this.listeners)listener(update);return update;}
  emitClose(tf,close,extra={}){const state=this.buffers.get(tf),row=this.makeForming(tf,close,extra);row.final=true;state.closed.push(row);state.forming=null;state.closedRevision+=1;state.formingRevision+=1;const update={type:"kline",tf,closed:true,row:{...row},closedRevision:state.closedRevision,formingRevision:state.formingRevision,exchangeTime:row.time*1000+59999};for(const listener of this.listeners)listener(update);return update;}
}

function trend(direction,count=90,slope=0.08){return Array.from({length:count},(_,index)=>100+(direction==="LONG"?1:-1)*slope*index+Math.sin(index/5)*0.01);}
function flatBias(direction,count=90){return Array.from({length:count},(_,index)=>100+(index>78?(direction==="LONG"?1:-1)*(index-78)*0.006:0));}
function gateway(){let position=null;return {isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"live"}),position:()=>({position}),filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,positionMode:"ONE_WAY"}),orders:async()=>({orders:[],algoOrders:[]}),balance:async()=>[{availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),reconcile:async()=>({position,orders:{orders:[],algoOrders:[]}}),refreshPosition:async()=>position,submitOrder:async()=>({orderId:1}),submitAlgoOrder:async()=>({algoId:2}),cancelOrder:async()=>{},cancelAlgoOrder:async()=>{},queryOrder:async()=>null,_setPosition:value=>{position=value;}};}

async function initializedEngine(build,context,hub,options={}){
  context.PUBLIC_MARKET_DATA_HUB=hub;
  const engine=new build.ScalpEngine({gateway:options.gateway||gateway(),storage:new MemoryStorage(),now:options.now||Date.now});
  await engine.initialize();
  return engine;
}

async function run(){
  const {context,build}=runtime(),tools=build.detectorTools,cases={};

  const crossHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])crossHub.seed(tf,trend("LONG"));let clock=100000;const crossEngine=await initializedEngine(build,context,crossHub,{now:()=>++clock});
  assert.deepEqual(crossHub.requirements.at(-1).requirements.map(item=>item.tf),["1m","3m","5m"]);assert.equal(crossHub.visibleTf,"1h");
  const bearishClose=crossHub.closeForSeparation("1m","SHORT",0.08,tools);crossHub.emitForming("1m",bearishClose);let row=crossEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"LIVE");assert.equal(row.qualified,true);assert.equal(row.rank,null);cases.bearishIntrabarCrossImmediate=true;

  const bullishHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])bullishHub.seed(tf,trend("SHORT"));const bullishEngine=await initializedEngine(build,context,bullishHub,{now:()=>++clock});const bullishClose=bullishHub.closeForSeparation("1m","LONG",0.08,tools);bullishHub.emitForming("1m",bullishClose);row=bullishEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"LONG");assert.equal(row.eventType,"CROSS");assert.equal(row.qualified,true);assert(!build.config.signal.crossPersistenceMs);cases.bullishCrossImmediateWithoutCloseOrTimer=true;

  const projectedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])projectedHub.seed(tf,trend("LONG"));const projectedEngine=await initializedEngine(build,context,projectedHub,{now:()=>++clock}),projectedClose=projectedHub.closeForSeparation("1m","LONG",0.30,tools);projectedHub.emitForming("1m",projectedClose);row=projectedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"PROJECTED");assert.equal(row.qualified,false);assert.equal(row.eligibility,"NOT CONFIRMED");projectedHub.emitForming("1m",projectedHub.closeForSeparation("1m","LONG",0.34,tools));row=projectedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"NONE");assert.equal(projectedEngine.getDiagnostics().detector.byTimeframe["1m"].rejectionReason,"projected-gap-expanded");cases.projectedNeverQualifiesAndInvalidatesOnExpansion=true;

  async function bounce(direction,tf="1m",seed=trend(direction),seedRange=0.5){
    const hub=new CanonicalReplayHub();for(const item of ["1m","3m","5m"]){hub.seed(item,item===tf?seed:trend("LONG"));if(item===tf&&seedRange!==0.5)for(const row of hub.buffers.get(item).closed){row.high=Math.max(row.open,row.close)+seedRange;row.low=Math.min(row.open,row.close)-seedRange;}}const engine=await initializedEngine(build,context,hub,{now:()=>++clock});
    hub.emitForming(tf,hub.closeForSeparation(tf,direction,0.30,tools));
    hub.emitForming(tf,hub.closeForSeparation(tf,direction,0.18,tools));let approach=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(approach.eventType,"BOUNCE",JSON.stringify(engine.getDiagnostics().detector.byTimeframe[tf]));assert.equal(approach.phase,"APPROACH");
    hub.emitForming(tf,hub.closeForSeparation(tf,direction,0.05,tools));let contact=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(contact.eventType,"BOUNCE");assert.equal(contact.phase,"CONTACT");
    const state=hub.buffers.get(tf),last=state.closed[state.closed.length-1],finalClose=last.close+(direction==="LONG"?2:-2);hub.emitClose(tf,finalClose);let confirmed=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(confirmed.eventType,"BOUNCE");assert.equal(confirmed.phase,"CONFIRMED");assert.equal(confirmed.direction,direction);assert.equal(confirmed.qualified,true);
    return {hub,engine,confirmed};
  }
  await bounce("SHORT");cases.bearishBounceApproachContactConfirmed=true;
  await bounce("LONG");cases.bullishBounceApproachContactConfirmed=true;

  const priceTouchHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])priceTouchHub.seed(tf,trend("LONG"));const priceTouchEngine=await initializedEngine(build,context,priceTouchHub,{now:()=>++clock}),priceState=priceTouchHub.buffers.get("1m"),lastPriceRow=priceState.closed.at(-1),slow=priceTouchHub.getAuthoritativeMaSnapshot("1m",{includeForming:false,periods:[9,55,9,55,9],requiredRows:80}).valuesByPeriod[55];priceTouchHub.emitForming("1m",lastPriceRow.close+0.1,{low:slow-0.2,high:lastPriceRow.close+0.6});row=priceTouchEngine.snapshot().detections.find(item=>item.source==="1m");assert.notEqual(row.eventType,"BOUNCE");cases.priceTouchWithoutEmaApproachRejected=true;

  const flatHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"]){flatHub.seed(tf,tf==="1m"?flatBias("LONG"):trend("LONG"));if(tf==="1m")for(const candle of flatHub.buffers.get(tf).closed){candle.high=Math.max(candle.open,candle.close)+10;candle.low=Math.min(candle.open,candle.close)-10;}}const flatEngine=await initializedEngine(build,context,flatHub,{now:()=>++clock});flatHub.emitForming("1m",flatHub.closeForSeparation("1m","LONG",0.02,tools));flatHub.emitForming("1m",flatHub.closeForSeparation("1m","LONG",0.01,tools));flatHub.emitForming("1m",flatHub.closeForSeparation("1m","LONG",0.0005,tools));flatHub.emitClose("1m",flatHub.closeForSeparation("1m","LONG",0.008,tools));const flatConfirmed=flatEngine.snapshot().detections.find(item=>item.source==="1m"),flatDiag=flatEngine.getDiagnostics().detector.byTimeframe["1m"];assert.equal(flatConfirmed.phase,"CONFIRMED");assert(Math.abs(flatConfirmed.raw.slowSlope)<0.002,String(flatConfirmed.raw.slowSlope));assert.equal(flatDiag.reliable,true);cases.nearlyFlatEma55AllowsBounce=true;

  const invalidHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])invalidHub.seed(tf,trend("LONG"));const invalidEngine=await initializedEngine(build,context,invalidHub,{now:()=>++clock});invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","LONG",0.18,tools));invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","LONG",0.05,tools));invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","SHORT",0.05,tools));row=invalidEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(invalidEngine.getDiagnostics().detector.byTimeframe["1m"].bounceTrack,null);cases.crossInvalidatesBounce=true;

  const blockedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])blockedHub.seed(tf,trend("LONG"));const blockedGateway=gateway();blockedGateway._setPosition({symbol:"BTCUSDT",side:"LONG",qty:.2,avg:100});const blockedEngine=await initializedEngine(build,context,blockedHub,{gateway:blockedGateway,now:()=>++clock});blockedEngine.config={...blockedEngine.config,source:"1m",direction:"ANY"};blockedHub.emitForming("1m",blockedHub.closeForSeparation("1m","SHORT",0.05,tools));row=blockedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"CROSS");assert.equal(row.eligibility,"BLOCKED BY POSITION");cases.unrelatedPositionDoesNotSuppressDetection=true;
  const blockedBounce=await bounce("SHORT");blockedBounce.engine.setExternalPosition({symbol:"BTCUSDT",side:"LONG",qty:.2,avg:100});row=blockedBounce.engine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"CONFIRMED");assert.equal(row.eligibility,"BLOCKED BY POSITION");cases.unrelatedPositionDoesNotSuppressBounce=true;

  const sourceHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])sourceHub.seed(tf,trend("LONG"));const sourceEngine=await initializedEngine(build,context,sourceHub,{now:()=>++clock});sourceEngine.config={...sourceEngine.config,source:"1m"};sourceHub.emitForming("3m",sourceHub.closeForSeparation("3m","SHORT",0.05,tools));row=sourceEngine.snapshot().detections.find(item=>item.source==="3m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(row.eligibility,"SOURCE FILTER");assert(sourceHub.requirements.some(item=>item.requirements.every(req=>["1m","3m","5m"].includes(req.tf))));cases.nonSelectedAndOffChartDetectionRemainPopulated=true;

  const retainedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])retainedHub.seed(tf,trend("LONG"));const retainedEngine=await initializedEngine(build,context,retainedHub,{now:()=>++clock});retainedEngine.state="ARMED";retainedEngine.armedAt=clock-1;retainedEngine.config={...retainedEngine.config,source:"1m",direction:"ANY",entryType:"ANY"};let entries=0;retainedEngine.executeEntry=async()=>{entries+=1;};retainedHub.emitForming("1m",retainedHub.closeForSeparation("1m","SHORT",0.05,tools));assert.equal(entries,1);retainedHub.emitForming("1m",retainedHub.closeForSeparation("1m","SHORT",0.20,tools));row=retainedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(entries,1);clock+=build.config.signal.staleMs["1m"]+1;row=retainedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"NONE");assert.equal(entries,1);cases.retainedEventVisibleUntilStaleWithoutReexecution=true;

  const reconnectHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])reconnectHub.seed(tf,trend("LONG"));const reconnectEngine=await initializedEngine(build,context,reconnectHub,{now:()=>++clock});assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").eventType,"NONE");reconnectEngine.onPrivateStatus({streamStatus:"disconnected"});reconnectHub.emitForming("1m",reconnectHub.closeForSeparation("1m","SHORT",0.05,tools));assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").direction,"SHORT");reconnectEngine.onPrivateStatus({streamStatus:"live"});assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").eventType,"NONE");reconnectHub.emitForming("1m",reconnectHub.closeForSeparation("1m","SHORT",0.08,tools));assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").eventType,"NONE");reconnectHub.emitForming("1m",reconnectHub.closeForSeparation("1m","LONG",0.05,tools));const reconnectCross=reconnectEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(reconnectCross.eventType,"CROSS");assert.equal(reconnectCross.direction,"LONG");cases.reconnectRebaselinesThenDetectsNextTransition=true;

  const exitHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])exitHub.seed(tf,trend("LONG"));const exitEngine=await initializedEngine(build,context,exitHub,{now:()=>++clock});exitEngine.state="ACTIVE";exitEngine.session={symbol:"BTCUSDT",direction:"LONG",source:"1m",eventId:"owned",liveQty:.1};let exitReason=null;exitEngine.requestExit=async reason=>{exitReason=reason;};exitHub.emitForming("1m",exitHub.closeForSeparation("1m","SHORT",0.05,tools));assert.equal(exitReason,"OPPOSITE_CROSS");cases.oppositeLiveCrossStillExitsOwnedPosition=true;

  assert(crossHub.requests.filter(request=>request.tf==="1m").every(request=>request.periods.join(",")==="9,55,9,55,9"));const diagnostics=crossEngine.getDiagnostics().detector.byTimeframe["1m"];for(const key of ["lastMarketUpdateAt","closedRevision","formingRevision","reliable","ema9","ema55","currentGap","previousObservedGap","currentSign","previousSign","separationAtr","crossTrack","bouncePhase","emittedEvent","rejectionReason"])assert(Object.prototype.hasOwnProperty.call(diagnostics,key),key);cases.fixedCanonicalPeriodsAndBoundedDiagnostics=true;

  for(const engine of [crossEngine,bullishEngine,projectedEngine,priceTouchEngine,flatEngine,invalidEngine,blockedEngine,blockedBounce.engine,sourceEngine,retainedEngine,reconnectEngine,exitEngine])engine.destroy();
  console.log("SCALP event replay tests: PASS",cases);
  return cases;
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
