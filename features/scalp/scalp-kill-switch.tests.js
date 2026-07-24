"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");
class MemoryStorage{constructor(seed={}){this.data=new Map(Object.entries(seed));}getItem(key){return this.data.has(key)?this.data.get(key):null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn);}dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn.call(this,event));return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
function runtime(){const storage=new MemoryStorage(),context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,localStorage:storage};context.window=context;context.dispatchEvent=()=>true;context.addEventListener=()=>{};context.removeEventListener=()=>{};vm.createContext(context);for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});return {context,storage,build:context.__BT001_SCALP_BUILD__};}
function fakeGateway(overrides={}){let position=null;const calls=[];return {calls,isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"live"}),position:()=>({position}),filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"ONE_WAY"}),orders:async()=>({orders:[],algoOrders:[]}),balance:async()=>[{asset:"USDT",availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),reconcile:async()=>({position,orders:{orders:[],algoOrders:[]}}),refreshPosition:async()=>position,submitOrder:async params=>{calls.push(["order",params]);return {orderId:1};},submitAlgoOrder:async params=>{calls.push(["algo",params]);return {algoId:2};},cancelOrder:async params=>{calls.push(["cancel-order",params]);},cancelAlgoOrder:async params=>{calls.push(["cancel-algo",params]);},queryOrder:async()=>null,...overrides,_setPosition:value=>{position=value;}};}
function session(overrides={}){return {symbol:"BTCUSDT",quoteAsset:"USDT",direction:"LONG",source:"1m",eventId:"loss",entryClientId:"SCALP-E-K",tpClientId:"SCALP-T-K",slClientId:"SCALP-S-K",exitClientId:"SCALP-X-K",generation:1,filledQty:1,liveQty:1,avgEntry:100,entryCommission:.04,entryCommissionActual:true,entryCommissionFills:[],fundingCost:0,mode:"SINGLE",target:1,stop:1,tpPrice:105,slPrice:97,...overrides};}

async function run(){
  const {build}=runtime(),C=build.config,cases={};
  const machineSource=fs.readFileSync(path.join(repo,"features/scalp/state-machine.js"),"utf8"),uiSource=fs.readFileSync(path.join(repo,"features/scalp/ui.js"),"utf8"),configSource=fs.readFileSync(path.join(repo,"features/scalp/config.js"),"utf8");

  assert(!machineSource.includes("maybeAutoArm")&&!machineSource.includes("autoTradingBlockedReason"));
  assert(machineSource.includes("autoConcurrentAutoCount(){return this.session&&this.session.autoEntered?1:0;}"));
  assert(!uiSource.includes("scalpAutoTradingEnabled")&&!uiSource.includes("scalpAutoEntryEnabled")&&uiSource.includes("scalpMaxConcurrentAutoPositions"));
  assert(!configSource.includes("autoEntryEnabled")&&!configSource.includes("autoTradingEnabled")&&configSource.includes("maxConcurrentAutoPositions:1"));
  assert.equal((machineSource.match(/transition\("ARMED"/g)||[]).length,1,"only the manual arm() path may transition the engine to ARMED");
  cases.allAutoArmPathsStayRemovedWhileConcurrentCountIsRestored=true;

  const legacyStorage=new MemoryStorage({[C.configKey]:JSON.stringify({...C.defaults,autoEntryEnabled:true,autoTradingEnabled:true,maxConcurrentAutoPositions:9})}),legacyEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:legacyStorage});
  for(const key of ["autoEntryEnabled","autoTradingEnabled"])assert.equal(Object.prototype.hasOwnProperty.call(legacyEngine.config,key),false,`${key} must be removed from loaded config`);
  assert.equal(legacyEngine.config.maxConcurrentAutoPositions,9);
  legacyEngine.updateConfig({autoEntryEnabled:true,autoTradingEnabled:true,maxConcurrentAutoPositions:7});
  for(const key of ["autoEntryEnabled","autoTradingEnabled"])assert.equal(Object.prototype.hasOwnProperty.call(legacyEngine.config,key),false,`${key} updates must be ignored`);
  assert.equal(legacyEngine.config.maxConcurrentAutoPositions,7);
  legacyEngine.session=session({autoEntered:true});assert.equal(legacyEngine.autoConcurrentAutoCount(),1);legacyEngine.session.autoEntered=false;assert.equal(legacyEngine.autoConcurrentAutoCount(),0);legacyEngine.session=null;assert.equal(legacyEngine.autoConcurrentAutoCount(),0);
  cases.legacyAutoTogglesStayRemovedWhileConcurrentConfigAndCountWork=true;

  const transitionEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});let armCalls=0;transitionEngine.arm=async()=>{armCalls+=1;return {ok:true,errors:[]};};transitionEngine.state="ARMED";transitionEngine.transition("OFF","test");assert.equal(armCalls,0);assert.equal(transitionEngine.state,"OFF");
  cases.transitionToOffNeverArmsItself=true;

  const lossEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});lossEngine.config={...lossEngine.config,maxDailyAutoLossUsd:5};
  lossEngine.state="ACTIVE";lossEngine.session=session({eventId:"loss-1"});await lossEngine.finishExit("SL");
  assert(lossEngine.autoLossState.accumulatedUsd>3&&lossEngine.autoLossState.accumulatedUsd<3.2,`unexpected accumulated loss ${lossEngine.autoLossState.accumulatedUsd}`);assert.equal(lossEngine.state,"OFF");assert.equal(lossEngine.snapshot().dailyLoss.breached,false);
  cases.manualArmedLossTracksBelowCapWithoutDisarm=true;

  const firstAccumulated=lossEngine.autoLossState.accumulatedUsd;let disarmCalls=0,originalDisarm=lossEngine.disarm.bind(lossEngine);lossEngine.disarm=()=>{disarmCalls+=1;return originalDisarm();};lossEngine.state="ACTIVE";lossEngine.cooloffAfterFlat=true;lossEngine.session=session({eventId:"loss-2",mode:"CONTINUOUS",entryClientId:"SCALP-E-K2",tpClientId:"SCALP-T-K2",slClientId:"SCALP-S-K2",exitClientId:"SCALP-X-K2"});await lossEngine.finishExit("SL");
  assert(lossEngine.autoLossState.accumulatedUsd>firstAccumulated*1.9);assert.equal(disarmCalls,1,"breaching the cap while active must call disarm()");assert.equal(lossEngine.state,"OFF","cap breach must prevent continuous cool-off from re-arming");assert.equal(lossEngine.snapshot().dailyLoss.breached,true);
  cases.capBreachDisarmsActiveEngineAndPreventsContinuousRestart=true;

  const armedEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});armedEngine.config={...armedEngine.config,maxDailyAutoLossUsd:1};armedEngine.state="ARMED";armedEngine.applyAutoLoss(1.1);assert.equal(armedEngine.state,"OFF");
  cases.capBreachDisarmsArmedEngine=true;

  const winEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});winEngine.config={...winEngine.config,maxDailyAutoLossUsd:1};winEngine.state="ACTIVE";winEngine.session=session({eventId:"win-1"});await winEngine.finishExit("TP");assert.equal(winEngine.autoLossState.accumulatedUsd,0);
  cases.profitableExitNeverCountsAgainstLossCap=true;

  console.log("SCALP daily loss/manual-arm tests: PASS",cases);
  return cases;
}
module.exports=run;if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
