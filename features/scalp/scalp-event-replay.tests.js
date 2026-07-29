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
  for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/exit-decisions.js","features/scalp/core/logger.js","features/scalp/core/signal-detector-core.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});
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
  constructor(){this.buffers=new Map();this.listeners=new Set();this.requirements=[];this.requests=[];this.visibleTf="1h";this.seed("15m",trend("LONG"));}
  seed(tf,closes){
    const seconds={"1m":60,"3m":180,"5m":300,"15m":900}[tf],rows=[];
    closes.forEach((close,index)=>{const previous=index?closes[index-1]:close,open=previous;rows.push({time:(index+1)*seconds,open,high:Math.max(open,close)+0.5,low:Math.min(open,close)-0.5,close,volume:100,takerBuyBase:50,final:true});});
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
  makeForming(tf,close,extra={}){const state=this.buffers.get(tf),previous=state.closed[state.closed.length-1],seconds={"1m":60,"3m":180,"5m":300,"15m":900}[tf],open=previous.close;return {time:previous.time+seconds,open,high:extra.high??Math.max(open,close)+0.5,low:extra.low??Math.min(open,close)-0.5,close,volume:extra.volume??100,takerBuyBase:extra.takerBuyBase??50,final:false};}
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
function gateway(){let position=null;return {isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"live"}),position:()=>({position}),filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,positionMode:"ONE_WAY"}),orders:async()=>({orders:[],algoOrders:[]}),balance:async()=>[{asset:"USDT",availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),reconcile:async()=>({position,orders:{orders:[],algoOrders:[]}}),refreshPosition:async()=>position,submitOrder:async()=>({orderId:1}),submitAlgoOrder:async()=>({algoId:2}),cancelOrder:async()=>{},cancelAlgoOrder:async()=>{},queryOrder:async()=>null,_setPosition:value=>{position=value;}};}

async function initializedEngine(build,context,hub,options={}){
  context.PUBLIC_MARKET_DATA_HUB=hub;
  const engine=new build.ScalpEngine({gateway:options.gateway||gateway(),storage:new MemoryStorage(),now:options.now||Date.now});
  await engine.initialize();
  return engine;
}

async function run(){
  const {context,build}=runtime(),tools=build.detectorTools,cases={};

  const scoreEvent={source:"1m",eventType:"CROSS",direction:"LONG"},scoreRow={time:60,close:100.5},scoreAnalysis=(separation,previousFastSlope)=>({s:100,f:100+separation,atr:1,priorAtr:1,atrChange:0,separation,fastSlope:.08,previousFastSlope,directionalAccelerationAtr:.08-previousFastSlope,slowSlope:.02});
  const shallowScore=tools.emaScore(scoreEvent,scoreAnalysis(.01,.08),scoreRow,null,{separation:.01},null),decisiveScore=tools.emaScore(scoreEvent,scoreAnalysis(.40,.08),scoreRow,null,{separation:.40},null);
  assert.equal(shallowScore.components.cleanliness,10);
  assert.equal(decisiveScore.components.cleanliness,100);
  assert(decisiveScore.score>shallowScore.score,"meaningful post-cross displacement must score above near-zero separation");
  assert.equal(shallowScore.components.rapidReversalStability,100,"rapid reversal stability must remain a distinct component");
  cases.crossSignificanceRewardsDecisiveSeparation=true;

  const sharpTurn=tools.emaScore(scoreEvent,scoreAnalysis(.40,-.04),scoreRow,null,{separation:.40},null),losingForce=tools.emaScore(scoreEvent,scoreAnalysis(.40,.14),scoreRow,null,{separation:.40},null);
  assert.equal(sharpTurn.components.directionalSlope,82);
  assert.equal(losingForce.components.directionalSlope,82);
  assert.equal(sharpTurn.components.directionalAcceleration,98);
  assert.equal(Math.round(losingForce.components.directionalAcceleration),26);
  assert(sharpTurn.score>losingForce.score);
  const bounceScoreEvent={...scoreEvent,eventType:"BOUNCE"},bounceTrack={direction:"LONG",closestSeparation:.05};
  assert.equal(tools.emaScore(bounceScoreEvent,scoreAnalysis(.08,-.04),scoreRow,bounceTrack,null,null).components.directionalAcceleration,98);
  assert.equal(Math.round(tools.emaScore(bounceScoreEvent,scoreAnalysis(.08,.14),scoreRow,bounceTrack,null,null).components.directionalAcceleration),26);
  cases.crossAndBounceScoreDirectionalAcceleration=true;

  const convictionAnalysis=(fastSlope,atrChange=0,previousFastSlope=fastSlope)=>({s:100,f:100.4,atr:1,priorAtr:1,atrChange,separation:.40,fastSlope,previousFastSlope,directionalAccelerationAtr:fastSlope-previousFastSlope,slowSlope:.02});
  const lowVelocity=tools.emaScore(scoreEvent,convictionAnalysis(.30),scoreRow,{crossingSeparation:0},{separation:.40},null),highVelocity=tools.emaScore(scoreEvent,convictionAnalysis(1.50),scoreRow,{crossingSeparation:0},{separation:.40},null);
  assert.equal(lowVelocity.components.velocityRelativeToAtr,20);
  assert.equal(highVelocity.components.velocityRelativeToAtr,100);
  assert(highVelocity.score>lowVelocity.score,"1.5 ATR-per-bar velocity must score above 0.3 ATR-per-bar at identical separation");
  const expandingAtr=tools.emaScore(scoreEvent,convictionAnalysis(.30,.25),scoreRow,{crossingSeparation:0},{separation:.40},null),contractingAtr=tools.emaScore(scoreEvent,convictionAnalysis(.30,-.25),scoreRow,{crossingSeparation:0},{separation:.40},null);
  assert.equal(expandingAtr.components.atrTrajectory,100);
  assert.equal(contractingAtr.components.atrTrajectory,0);
  assert(expandingAtr.score>contractingAtr.score,"expanding ATR must score above contracting ATR for the same event geometry");
  const accelerating=tools.emaScore(scoreEvent,convictionAnalysis(.50,0,0),scoreRow,{crossingSeparation:0},{separation:.40},null),decelerating=tools.emaScore(scoreEvent,convictionAnalysis(.10,0,.60),scoreRow,{crossingSeparation:0},{separation:.40},null);
  assert.equal(accelerating.components.atrNormalizedAcceleration,100);
  assert.equal(decelerating.components.atrNormalizedAcceleration,0);
  assert(Object.prototype.hasOwnProperty.call(tools.emaScore(bounceScoreEvent,convictionAnalysis(.50,0,0),scoreRow,bounceTrack,null,null).components,"atrNormalizedAcceleration"));
  cases.atrVelocityTrajectoryAndAccelerationAreFirstClassConviction=true;

  const finalizedAtrRows=Array.from({length:60},(_,index)=>({time:index+1,open:100,high:101+(index%3)*.05,low:99-(index%3)*.05,close:100+(index%2)*.1,volume:100,final:true}));
  const quietForming={time:61,open:100,high:101,low:99,close:100.1,volume:100,final:false},hugeForming={...quietForming,high:1000,low:1,close:900};
  const atrFast=Array.from({length:61},(_,index)=>100+index*.01),atrSlow=Array.from({length:61},(_,index)=>99+index*.005);
  const quietAnalysis=tools.analyze(finalizedAtrRows.concat(quietForming),atrFast,atrSlow),hugeAnalysis=tools.analyze(finalizedAtrRows.concat(hugeForming),atrFast,atrSlow);
  assert(quietAnalysis&&hugeAnalysis);
  assert.equal(hugeAnalysis.atr,quietAnalysis.atr,"the forming event candle must not inflate its own ATR denominator");
  assert.equal(hugeAnalysis.priorAtr,quietAnalysis.priorAtr);
  assert.equal(hugeAnalysis.atrChange,quietAnalysis.atrChange);
  assert(!Object.prototype.hasOwnProperty.call(hugeAnalysis,"range"),"raw detector output must expose atr rather than the obsolete range name");
  cases.atrIsLaggedWilderAndFinalizedOnly=true;

  const fixedGeometryAnalysis=convictionAnalysis(.30),sparseUpdates=tools.emaScore(scoreEvent,fixedGeometryAnalysis,scoreRow,{crossingSeparation:0},{separation:.001},null),frequentUpdates=tools.emaScore(scoreEvent,fixedGeometryAnalysis,scoreRow,{crossingSeparation:0},{separation:.39},null);
  assert.equal(sparseUpdates.components.separationExpansion,frequentUpdates.components.separationExpansion);
  assert.equal(sparseUpdates.score,frequentUpdates.score,"identical cross geometry must score identically regardless of live WS update frequency");
  const freshCross=tools.emaScore(scoreEvent,{...fixedGeometryAnalysis,separation:.12,f:100.12},scoreRow,{crossingSeparation:0},{separation:.30},null);
  assert.equal(freshCross.components.separationExpansion,80,"fresh post-cross displacement must be measured from the crossing point, not pre-cross contraction");
  cases.crossExpansionUsesFixedTransitionGeometry=true;

  const opposedBounce=tools.bounceQualification({direction:"LONG",closestSeparation:.05},{separation:.08,fastSlope:.08,slowSlope:-.13});
  assert.equal(opposedBounce.expanded,true);
  assert.equal(opposedBounce.slopeAway,true);
  assert.equal(opposedBounce.slowSlopeAllowed,false);
  assert.equal(opposedBounce.qualified,false);
  assert.equal(opposedBounce.reason,"bounce-close-opposite-slow-slope");
  cases.opposingSlowSlopeBlocksBounce=true;

  const wrongSlopeRows=Array.from({length:80},(_,index)=>({time:index+1,open:100,high:101,low:99,close:100,volume:100,takerBuyBase:50,final:true})),wrongSlopeFast=Array(80).fill(100.4),wrongSlopeSlow=Array(80).fill(100);wrongSlopeFast[78]=99.9;wrongSlopeSlow[78]=99.8;wrongSlopeFast[79]=99.56;wrongSlopeSlow[79]=99.4;const wrongSlopeWindow=tools.rebuildBounceWindow(wrongSlopeRows,wrongSlopeFast,wrongSlopeSlow,12);assert(wrongSlopeWindow.candidate);assert.equal(wrongSlopeWindow.phase,"WAITING SLOPE");assert.equal(wrongSlopeWindow.reason,"bounce-close-fast-slope-not-away");assert.equal(wrongSlopeWindow.qualified,false);cases.rollingBounceWrongSlopeHasExplicitRejection=true;

  const crossHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])crossHub.seed(tf,trend("LONG"));let clock=100000;const crossEngine=await initializedEngine(build,context,crossHub,{now:()=>++clock});
  assert.deepEqual(crossHub.requirements.at(-1).requirements.map(item=>item.tf),["1m","3m","5m","15m"]);assert.equal(crossHub.visibleTf,"1h");
  const bearishClose=crossHub.closeForSeparation("1m","SHORT",0.12,tools);crossHub.emitForming("1m",bearishClose,{volume:25,takerBuyBase:2});let row=crossEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"CONFIRMING");assert.equal(row.qualified,false);assert.equal(row.rankValue,null);assert.equal(row.rejectionReason,"cross-awaiting-closed-candle");assert.equal(crossEngine.getDiagnostics().detector.byTimeframe["1m"].emittedEvent,null);crossHub.emitClose("1m",bearishClose,{volume:250,takerBuyBase:20});row=crossEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.phase,"LIVE");assert.equal(row.qualified,true);assert(Number.isInteger(row.rankValue));assert(row.rankDiagnostics&&row.rankDiagnostics.pressureAvailable);assert.equal(row.rankDiagnostics.pressure.eventClosed,true);assert.equal(row.rankDiagnostics.pressure.eventVolume,250);assert(row.raw.atr>0&&row.raw.priorAtr>0&&Number.isFinite(row.raw.atrChange));assert(!Object.prototype.hasOwnProperty.call(row.raw,"range"));const crossClosedPressure=row.rankDiagnostics.pressure;cases.crossCandidateVisibleIntrabarButQualifiesOnlyOnClose=true;

  const bullishHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])bullishHub.seed(tf,trend("SHORT"));const bullishEngine=await initializedEngine(build,context,bullishHub,{now:()=>++clock});const bullishClose=bullishHub.closeForSeparation("1m","LONG",0.12,tools);bullishHub.emitForming("1m",bullishClose);row=bullishEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"LONG");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"CONFIRMING");assert.equal(row.qualified,false);bullishHub.emitClose("1m",bullishClose);row=bullishEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.qualified,true);assert(!build.config.signal.crossPersistenceMs);cases.bullishCrossClosesWithoutTimer=true;
  const frozenCrossRank=row.rankValue;bullishHub.emitForming("1m",bullishHub.closeForSeparation("1m","LONG",0.20,tools),{volume:900,takerBuyBase:0});row=bullishEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.rankValue,frozenCrossRank);cases.crossRankFreezesOnQualifiedUpdate=true;

  const baseline=Array.from({length:20},(_,index)=>({time:index+1,open:100,high:101,low:99,close:100,volume:100,takerBuyBase:50,final:true})),pressure=(volume,takerBuyBase,close,high=101,low=99)=>tools.pressureScore(baseline.concat({time:21,open:100,high,low,close,volume,takerBuyBase,final:false}),20,"LONG"),aligned=pressure(200,180,101),balanced=pressure(100,50,100.2),opposing=pressure(200,20,99),absorbed=pressure(300,270,100.01,101,99);assert(aligned.score>balanced.score&&balanced.score>opposing.score);assert(absorbed.absorption&&absorbed.score<60);assert.equal(tools.pressureScore([{time:1,open:100,high:101,low:99,close:100}],0,"LONG").available,false);cases.deterministicPressureOrderingAbsorptionAndMissingFallback=true;

  const fifteenHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])fifteenHub.seed(tf,trend("LONG"));fifteenHub.seed("15m",trend("LONG"));const fifteenEngine=await initializedEngine(build,context,fifteenHub,{now:()=>++clock}),fifteenClose=fifteenHub.closeForSeparation("15m","SHORT",0.12,tools);fifteenHub.emitForming("15m",fifteenClose,{volume:25,takerBuyBase:2});let fifteen=fifteenEngine.snapshot().detections.find(item=>item.source==="15m");assert.equal(fifteen.phase,"CONFIRMING");assert.equal(fifteen.rankValue,null);fifteenHub.emitClose("15m",fifteenClose,{volume:250,takerBuyBase:20});fifteen=fifteenEngine.snapshot().detections.find(item=>item.source==="15m");assert.equal(fifteen.eventType,"CROSS");assert.equal(fifteen.direction,"SHORT");assert.equal(fifteen.rankDiagnostics.timeframe,"15m");assert.equal(fifteen.rankDiagnostics.pressure.eventVolume,250);assert.equal(fifteen.rankDiagnostics.pressure.eventClosed,true);cases.fifteenMinuteDetectionAndOwnClosedPressureRows=true;
  const allTfHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])allTfHub.seed(tf,trend("LONG"));const allTfEngine=await initializedEngine(build,context,allTfHub,{now:()=>++clock});for(const [index,tf] of ["1m","3m","5m","15m"].entries()){const close=allTfHub.closeForSeparation(tf,"SHORT",0.12,tools);allTfHub.emitForming(tf,close,{volume:20,takerBuyBase:2});let detected=allTfEngine.snapshot().detections.find(item=>item.source===tf);assert.equal(detected.phase,"CONFIRMING",tf);assert.equal(detected.qualified,false);allTfHub.emitClose(tf,close,{volume:200+index*10,takerBuyBase:20});detected=allTfEngine.snapshot().detections.find(item=>item.source===tf);assert.equal(detected.eventType,"CROSS",tf);assert.equal(detected.rankDiagnostics.timeframe,tf);assert.equal(detected.rankDiagnostics.pressure.eventVolume,200+index*10);assert.equal(detected.rankDiagnostics.pressure.eventClosed,true);}cases.allFourTimeframesEvaluateIndependentlyOnClose=true;

  const microscopicHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])microscopicHub.seed(tf,trend("LONG"));const microscopicEngine=await initializedEngine(build,context,microscopicHub,{now:()=>++clock});microscopicHub.emitForming("1m",microscopicHub.closeForSeparation("1m","SHORT",0.01,tools));row=microscopicEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"PENDING SIGNIFICANCE");assert.equal(row.qualified,false);assert.equal(row.rankValue,null);assert.equal(row.eligibility,"NOT CONFIRMED");assert.equal(microscopicEngine.getDiagnostics().detector.byTimeframe["1m"].rejectionReason,"cross-separation-below-significance");const microscopicClose=microscopicHub.closeForSeparation("1m","SHORT",0.12,tools);microscopicHub.emitForming("1m",microscopicClose);row=microscopicEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.phase,"CONFIRMING");assert.equal(row.qualified,false);microscopicHub.emitClose("1m",microscopicClose);row=microscopicEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.phase,"LIVE");assert.equal(row.qualified,true);cases.microscopicCrossWaitsForMeaningfulDisplacementAndClose=true;

  const projectedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])projectedHub.seed(tf,trend("LONG"));const projectedEngine=await initializedEngine(build,context,projectedHub,{now:()=>++clock}),projectedClose=projectedHub.closeForSeparation("1m","LONG",0.30,tools);projectedHub.emitForming("1m",projectedClose);row=projectedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.phase,"PROJECTED");assert.equal(row.qualified,false);assert.equal(row.eligibility,"NOT CONFIRMED");projectedHub.emitForming("1m",projectedHub.closeForSeparation("1m","LONG",0.34,tools));row=projectedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"OUTSIDE APPROACH");assert.equal(row.rejectionReason,"bounce-approach-threshold-not-reached");assert.equal(projectedEngine.getDiagnostics().detector.byTimeframe["1m"].rejectionReason,"bounce-approach-threshold-not-reached");cases.projectedInvalidationSurfacesRebuiltBounceRejection=true;

  async function bounce(direction,tf="1m",seed=trend(direction),seedRange=0.5){
    const hub=new CanonicalReplayHub();for(const item of ["1m","3m","5m","15m"]){hub.seed(item,item===tf?seed:trend("LONG"));if(item===tf&&seedRange!==0.5)for(const row of hub.buffers.get(item).closed){row.high=Math.max(row.open,row.close)+seedRange;row.low=Math.min(row.open,row.close)-seedRange;}}const engine=await initializedEngine(build,context,hub,{now:()=>++clock});
    hub.emitClose(tf,hub.closeForSeparation(tf,direction,0.30,tools));
    hub.emitClose(tf,hub.closeForSeparation(tf,direction,0.18,tools));let approach=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(approach.eventType,"BOUNCE",JSON.stringify(engine.getDiagnostics().detector.byTimeframe[tf]));assert.equal(approach.phase,"APPROACH");assert.equal(approach.rejectionReason,"bounce-contact-not-reached");
    hub.emitClose(tf,hub.closeForSeparation(tf,direction,0.05,tools));let contact=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(contact.eventType,"BOUNCE");assert.equal(contact.phase,"CONTACT");assert.equal(contact.rejectionReason,"bounce-close-did-not-expand");
    hub.emitClose(tf,hub.closeForSeparation(tf,direction,0.12,tools));let confirmed=engine.snapshot().detections.find(item=>item.source===tf);assert.equal(confirmed.eventType,"BOUNCE");assert.equal(confirmed.phase,"CONFIRMED");assert.equal(confirmed.direction,direction);assert.equal(confirmed.qualified,true);assert.equal(confirmed.raw.bounceWindow.architecture,"ROLLING_WINDOW_REBUILD");assert.equal(confirmed.rankDiagnostics.pressure.eventClosed,true);
    return {hub,engine,confirmed};
  }
  await bounce("SHORT");cases.bearishBounceApproachContactConfirmed=true;
  const frozenBounce=await bounce("LONG"),bounceRank=frozenBounce.confirmed.rankValue,bounceClosedPressure=frozenBounce.confirmed.rankDiagnostics.pressure;frozenBounce.hub.emitForming("1m",frozenBounce.hub.closeForSeparation("1m","LONG",0.20,tools),{volume:800,takerBuyBase:0});assert.equal(frozenBounce.engine.getDiagnostics().lastQualified["1m"].rankValue,bounceRank);cases.bullishBounceApproachContactConfirmedAndRankFrozen=true;
  assert.equal(crossClosedPressure.eventClosed,true);assert.equal(bounceClosedPressure.eventClosed,true);assert.equal(crossClosedPressure.baselineCount,bounceClosedPressure.baselineCount);assert.equal(crossClosedPressure.eventVolume,250,"CROSS must score the complete close volume, not the forming volume of 25");assert.equal(bounceClosedPressure.eventVolume,100);cases.crossAndBouncePressureUseComparableClosedCandles=true;

  const wiggleHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])wiggleHub.seed(tf,trend("LONG"));const wiggleEngine=await initializedEngine(build,context,wiggleHub,{now:()=>++clock});wiggleHub.emitClose("1m",wiggleHub.closeForSeparation("1m","LONG",0.30,tools));wiggleHub.emitClose("1m",wiggleHub.closeForSeparation("1m","LONG",0.18,tools));for(let index=0;index<984;index++)wiggleHub.emitForming("1m",wiggleHub.closeForSeparation("1m","LONG",index%2?0.17:0.19,tools));assert.equal(wiggleEngine.detector.bounceByTf,undefined,"rolling BOUNCE evaluation must not retain a mutable track map");wiggleHub.emitClose("1m",wiggleHub.closeForSeparation("1m","LONG",0.05,tools));row=wiggleEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"CONTACT");wiggleHub.emitClose("1m",wiggleHub.closeForSeparation("1m","LONG",0.12,tools));row=wiggleEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.phase,"CONFIRMED");assert.equal(row.raw.bounceWindow.architecture,"ROLLING_WINDOW_REBUILD");cases.nineHundredEightyFourIntrabarWigglesCannotResetRollingBounce=true;wiggleEngine.destroy();

  const outsideApproachMinimums=[0.25,0.255,0.26,0.27,0.28,0.30,0.32,0.35];
  for(const [index,minimum] of outsideApproachMinimums.entries()){
    const hub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])hub.seed(tf,trend("LONG"));const engine=await initializedEngine(build,context,hub,{now:()=>++clock});hub.emitClose("1m",hub.closeForSeparation("1m","LONG",0.36,tools));hub.emitClose("1m",hub.closeForSeparation("1m","LONG",minimum,tools));hub.emitClose("1m",hub.closeForSeparation("1m","LONG",minimum+0.03,tools));const candidate=engine.snapshot().detections.find(item=>item.source==="1m");assert.equal(candidate.eventType,"BOUNCE",`outside-approach replay ${index+1}`);assert.equal(candidate.phase,"OUTSIDE APPROACH",`outside-approach replay ${index+1}`);assert.equal(candidate.qualified,false);assert.equal(candidate.rejectionReason,"bounce-approach-threshold-not-reached");engine.destroy();
  }
  cases.eightPlausibleButOutsideApproachReplaysRejectExplicitly=true;

  const approachOnlyHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])approachOnlyHub.seed(tf,trend("LONG"));const approachOnlyEngine=await initializedEngine(build,context,approachOnlyHub,{now:()=>++clock});approachOnlyHub.emitClose("1m",approachOnlyHub.closeForSeparation("1m","LONG",0.30,tools));approachOnlyHub.emitClose("1m",approachOnlyHub.closeForSeparation("1m","LONG",0.18,tools));approachOnlyHub.emitClose("1m",approachOnlyHub.closeForSeparation("1m","LONG",0.22,tools));row=approachOnlyEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"APPROACH");assert.equal(row.rejectionReason,"bounce-contact-not-reached");assert.equal(approachOnlyEngine.getDiagnostics().detector.byTimeframe["1m"].rejectionReason,"bounce-contact-not-reached");cases.approachWithoutContactRemainsVisibleWithReason=true;approachOnlyEngine.destroy();

  const julContactTime=Date.parse("2026-07-26T07:30:00Z")/1000,julHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m","15m"])julHub.seed(tf,trend("LONG"));const julState=julHub.buffers.get("15m"),julPreContactLast=julContactTime-3*900,julShift=julPreContactLast-julState.closed.at(-1).time;for(const candle of julState.closed)candle.time+=julShift;const julEngine=await initializedEngine(build,context,julHub,{now:()=>++clock});julHub.emitClose("15m",julHub.closeForSeparation("15m","LONG",0.30,tools));julHub.emitClose("15m",julHub.closeForSeparation("15m","LONG",0.18,tools));julHub.emitClose("15m",julHub.closeForSeparation("15m","LONG",0.05,tools));row=julEngine.snapshot().detections.find(item=>item.source==="15m");assert.equal(row.candleTime,julContactTime);assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"CONTACT");assert.equal(row.qualified,false);assert.equal(row.rejectionReason,"bounce-close-did-not-expand");julHub.emitClose("15m",julHub.closeForSeparation("15m","LONG",0.12,tools));row=julEngine.snapshot().detections.find(item=>item.source==="15m");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"CONFIRMED");assert.equal(row.qualified,true);assert.equal(row.raw.closestCandleTime,julContactTime,"the Jul 26 07:30 UTC contact must remain discoverable on the next candle");assert.equal(row.candleTime,julContactTime+900);cases.jul26FifteenMinuteContactGetsNextCandleConfirmationChance=true;julEngine.destroy();

  const scalpUiSource=fs.readFileSync(path.join(repo,"features/scalp/ui.js"),"utf8");assert(scalpUiSource.includes("row.rejectionReason")&&scalpUiSource.includes("el.title=detail.join"),"Trigger Monitor rows must expose candidate rejection details");cases.triggerMonitorSurfacesBounceRejectionReason=true;

  const priceTouchHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])priceTouchHub.seed(tf,trend("LONG"));const priceTouchEngine=await initializedEngine(build,context,priceTouchHub,{now:()=>++clock}),priceState=priceTouchHub.buffers.get("1m"),lastPriceRow=priceState.closed.at(-1),slow=priceTouchHub.getAuthoritativeMaSnapshot("1m",{includeForming:false,periods:[9,55,9,55,9],requiredRows:80}).valuesByPeriod[55];priceTouchHub.emitForming("1m",lastPriceRow.close+0.1,{low:slow-0.2,high:lastPriceRow.close+0.6});row=priceTouchEngine.snapshot().detections.find(item=>item.source==="1m");assert.notEqual(row.eventType,"BOUNCE");cases.priceTouchWithoutEmaApproachRejected=true;

  const flatHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"]){flatHub.seed(tf,tf==="1m"?flatBias("LONG"):trend("LONG"));if(tf==="1m")for(const candle of flatHub.buffers.get(tf).closed){candle.high=Math.max(candle.open,candle.close)+10;candle.low=Math.min(candle.open,candle.close)-10;}}const flatEngine=await initializedEngine(build,context,flatHub,{now:()=>++clock});flatHub.emitClose("1m",flatHub.closeForSeparation("1m","LONG",0.02,tools));flatHub.emitClose("1m",flatHub.closeForSeparation("1m","LONG",0.01,tools));flatHub.emitClose("1m",flatHub.closeForSeparation("1m","LONG",0.0005,tools));flatHub.emitClose("1m",flatHub.closeForSeparation("1m","LONG",0.008,tools));const flatConfirmed=flatEngine.snapshot().detections.find(item=>item.source==="1m"),flatDiag=flatEngine.getDiagnostics().detector.byTimeframe["1m"];assert.equal(flatConfirmed.phase,"CONFIRMED",JSON.stringify({flatConfirmed,flatDiag}));assert(Math.abs(flatConfirmed.raw.slowSlope)<0.002,String(flatConfirmed.raw.slowSlope));assert.equal(flatDiag.reliable,true);cases.nearlyFlatEma55AllowsBounce=true;

  const invalidHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])invalidHub.seed(tf,trend("LONG"));const invalidEngine=await initializedEngine(build,context,invalidHub,{now:()=>++clock});invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","LONG",0.18,tools));invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","LONG",0.05,tools));invalidHub.emitForming("1m",invalidHub.closeForSeparation("1m","SHORT",0.12,tools));row=invalidEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(invalidEngine.getDiagnostics().detector.byTimeframe["1m"].bounceTrack,null);cases.crossInvalidatesBounce=true;

  const blockedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])blockedHub.seed(tf,trend("LONG"));const blockedGateway=gateway();blockedGateway._setPosition({symbol:"BTCUSDT",side:"LONG",qty:.2,avg:100});const blockedEngine=await initializedEngine(build,context,blockedHub,{gateway:blockedGateway,now:()=>++clock});blockedEngine.config={...blockedEngine.config,source:"1m",direction:"ANY"};blockedHub.emitForming("1m",blockedHub.closeForSeparation("1m","SHORT",0.12,tools));row=blockedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"CROSS");assert.equal(row.eligibility,"BLOCKED BY POSITION");cases.unrelatedPositionDoesNotSuppressDetection=true;
  const blockedBounce=await bounce("SHORT");blockedBounce.engine.setExternalPosition({symbol:"BTCUSDT",side:"LONG",qty:.2,avg:100});row=blockedBounce.engine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.direction,"SHORT");assert.equal(row.eventType,"BOUNCE");assert.equal(row.phase,"CONFIRMED");assert.equal(row.eligibility,"BLOCKED BY POSITION");cases.unrelatedPositionDoesNotSuppressBounce=true;

  const sourceHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])sourceHub.seed(tf,trend("LONG"));const sourceEngine=await initializedEngine(build,context,sourceHub,{now:()=>++clock});sourceEngine.config={...sourceEngine.config,source:"1m"};sourceHub.emitForming("3m",sourceHub.closeForSeparation("3m","SHORT",0.12,tools));row=sourceEngine.snapshot().detections.find(item=>item.source==="3m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(row.eligibility,"SOURCE FILTER");assert(sourceHub.requirements.some(item=>item.requirements.every(req=>["1m","3m","5m","15m"].includes(req.tf))));cases.nonSelectedAndOffChartDetectionRemainPopulated=true;

  const retainedHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])retainedHub.seed(tf,trend("LONG"));const retainedEngine=await initializedEngine(build,context,retainedHub,{now:()=>++clock});retainedEngine.state="ARMED";retainedEngine.armedAt=clock-1;retainedEngine.config={...retainedEngine.config,source:"1m",direction:"ANY",entryType:"ANY"};let entries=0;retainedEngine.executeEntry=async()=>{entries+=1;};const retainedClose=retainedHub.closeForSeparation("1m","SHORT",0.12,tools);retainedHub.emitForming("1m",retainedClose);assert.equal(entries,0);retainedHub.emitClose("1m",retainedClose);assert.equal(entries,1);retainedHub.emitForming("1m",retainedHub.closeForSeparation("1m","SHORT",0.20,tools));row=retainedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"CROSS");assert.equal(row.direction,"SHORT");assert.equal(entries,1);clock+=build.config.signal.staleMs["1m"]+1;row=retainedEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(row.eventType,"NONE");assert.equal(entries,1);cases.formingCrossNeverExecutesAndClosedEventRetainsWithoutReexecution=true;

  const reconnectHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])reconnectHub.seed(tf,trend("LONG"));const reconnectEngine=await initializedEngine(build,context,reconnectHub,{now:()=>++clock});assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").eventType,"NONE");reconnectEngine.onPrivateStatus({streamStatus:"disconnected"});reconnectHub.emitForming("1m",reconnectHub.closeForSeparation("1m","SHORT",0.05,tools));assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").direction,"SHORT");reconnectEngine.onPrivateStatus({streamStatus:"live"});assert.equal(reconnectEngine.snapshot().detections.find(item=>item.source==="1m").eventType,"NONE");reconnectHub.emitForming("1m",reconnectHub.closeForSeparation("1m","SHORT",0.08,tools));let reconnectCross=reconnectEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(reconnectCross.eventType,"CROSS");assert.equal(reconnectCross.phase,"PENDING SIGNIFICANCE");const reconnectClose=reconnectHub.closeForSeparation("1m","SHORT",0.12,tools);reconnectHub.emitForming("1m",reconnectClose);reconnectCross=reconnectEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(reconnectCross.phase,"CONFIRMING");assert.equal(reconnectCross.qualified,false);reconnectHub.emitClose("1m",reconnectClose);reconnectCross=reconnectEngine.snapshot().detections.find(item=>item.source==="1m");assert.equal(reconnectCross.eventType,"CROSS");assert.equal(reconnectCross.direction,"SHORT");assert.equal(reconnectCross.qualified,true);cases.reconnectRebaselinesThenRequiresClosedTransition=true;

  const exitHub=new CanonicalReplayHub();for(const tf of ["1m","3m","5m"])exitHub.seed(tf,trend("LONG"));const exitEngine=await initializedEngine(build,context,exitHub,{now:()=>++clock});exitEngine.state="ARMED";exitEngine.armedAt=clock-1;exitEngine.config={...exitEngine.config,minimumRank:100};build.tranches.add(exitEngine.book,{trancheId:"OWNED-LONG",symbol:"BTCUSDT",direction:"LONG",source:"1m",eventId:"owned",requestedQty:.1,filledQty:.1,remainingQty:.1,status:"ACTIVE"});exitHub.emitForming("1m",exitHub.closeForSeparation("1m","SHORT",0.12,tools));assert.equal(exitEngine.trancheCounts().LONG,1);assert.equal(exitEngine.snapshot().detections.find(item=>item.source==="1m").direction,"SHORT");cases.oppositeLiveCrossLeavesExistingDirectionIndependent=true;

  assert(crossHub.requests.filter(request=>request.tf==="1m").every(request=>request.periods.join(",")==="9,55,9,55,9"));const diagnostics=crossEngine.getDiagnostics().detector.byTimeframe["1m"];for(const key of ["lastMarketUpdateAt","closedRevision","formingRevision","reliable","ema9","ema55","currentGap","previousObservedGap","currentSign","previousSign","atr","priorAtr","atrChange","separationAtr","crossTrack","bouncePhase","emittedEvent","rejectionReason"])assert(Object.prototype.hasOwnProperty.call(diagnostics,key),key);cases.fixedCanonicalPeriodsAndBoundedDiagnostics=true;

  for(const engine of [crossEngine,bullishEngine,fifteenEngine,allTfEngine,microscopicEngine,projectedEngine,frozenBounce.engine,priceTouchEngine,flatEngine,invalidEngine,blockedEngine,blockedBounce.engine,sourceEngine,retainedEngine,reconnectEngine,exitEngine])engine.destroy();
  console.log("SCALP event replay tests: PASS",cases);
  return cases;
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
