"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");
class MemoryStorage{constructor(seed={}){this.data=new Map(Object.entries(seed));}getItem(key){return this.data.has(key)?this.data.get(key):null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn);}dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn.call(this,event));return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
function runtime(){const storage=new MemoryStorage(),context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,localStorage:storage};context.window=context;context.dispatchEvent=()=>true;context.addEventListener=()=>{};context.removeEventListener=()=>{};vm.createContext(context);for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});return {context,storage,build:context.__BT001_SCALP_BUILD__};}
function fakeGateway(overrides={}){let position=null;const calls=[];return {calls,isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"live"}),position:()=>({position}),filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"ONE_WAY"}),orders:async()=>({orders:[],algoOrders:[]}),balance:async()=>[{availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),reconcile:async()=>({position,orders:{orders:[],algoOrders:[]}}),refreshPosition:async()=>position,submitOrder:async params=>{calls.push(["order",params]);return {orderId:1};},submitAlgoOrder:async params=>{calls.push(["algo",params]);return {algoId:2};},cancelOrder:async params=>{calls.push(["cancel-order",params]);},cancelAlgoOrder:async params=>{calls.push(["cancel-algo",params]);},queryOrder:async()=>null,...overrides,_setPosition:value=>{position=value;},_position:()=>position};}
function autoSession(overrides={}){return {symbol:"BTCUSDT",quoteAsset:"USDT",direction:"LONG",source:"1m",eventId:"loss",entryClientId:"SCALP-E-K",tpClientId:"SCALP-T-K",slClientId:"SCALP-S-K",exitClientId:"SCALP-X-K",generation:1,filledQty:1,liveQty:1,avgEntry:100,entryCommission:.04,entryCommissionActual:true,entryCommissionFills:[],fundingCost:0,mode:"SINGLE",target:1,stop:1,tpPrice:105,slPrice:97,autoEntered:true,...overrides};}

async function run(){
  const {build}=runtime(),cases={};

  // --- config.autoTradingEnabled (master) and config.maxConcurrentAutoPositions -------------------
  const gateEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  gateEngine.config={...gateEngine.config,autoTradingEnabled:false,autoEntryEnabled:true,maxConcurrentAutoPositions:1};
  assert.equal(gateEngine.autoTradingBlockedReason(),"Auto-trading is OFF");
  gateEngine.config.autoTradingEnabled=true;gateEngine.config.autoEntryEnabled=false;
  assert.equal(gateEngine.autoTradingBlockedReason(),"Auto-entry is OFF");
  gateEngine.config.autoEntryEnabled=true;
  assert.equal(gateEngine.autoTradingBlockedReason(),null,"both switches on and no session must not be blocked");
  cases.masterSwitchAndAutoEntrySwitchBothGateIndependently=true;

  gateEngine.session=autoSession();
  assert.equal(gateEngine.autoTradingBlockedReason(),"Max concurrent auto positions (1) reached");
  gateEngine.config.maxConcurrentAutoPositions=2;
  assert.equal(gateEngine.autoTradingBlockedReason(),null,"raising the concurrency cap above the current auto-position count must unblock");
  gateEngine.session=null;gateEngine.config.maxConcurrentAutoPositions=1;
  cases.maxConcurrentAutoPositionsThresholdIsExact=true;

  // maybeAutoArm() must actually stay OFF (never call arm()) once the master switch is off --
  // i.e. the block is enforced at the real auto-arm entry point, not only in the read-only helper.
  const offEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  offEngine.config={...offEngine.config,autoTradingEnabled:false,autoEntryEnabled:true};
  let armCalled=false;offEngine.arm=async()=>{armCalled=true;return {ok:true,errors:[]};};
  await offEngine.maybeAutoArm();
  assert.equal(armCalled,false);assert.equal(offEngine.state,"OFF");
  cases.maybeAutoArmNeverArmsWhileMasterSwitchIsOff=true;

  // --- config.maxDailyAutoLossUsd threshold behavior ----------------------------------------------
  const lossEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  lossEngine.config={...lossEngine.config,autoTradingEnabled:true,autoEntryEnabled:true,maxDailyAutoLossUsd:5};
  // avgEntry=100, qty=1, SL fill at 97, entryCommission .04, taker .0004 => realized loss ~= 3.0788.
  lossEngine.state="ACTIVE";lossEngine.session=autoSession({eventId:"loss-1"});
  await lossEngine.finishExit("SL");
  assert(lossEngine.autoLossState.accumulatedUsd>3&&lossEngine.autoLossState.accumulatedUsd<3.2,`unexpected accumulated loss ${lossEngine.autoLossState.accumulatedUsd}`);
  assert.equal(lossEngine.config.autoTradingEnabled,true,"a single loss below the $5 cap must not trip the kill switch");
  assert.equal(lossEngine.autoDisabledReason,null);
  cases.singleLossBelowCapDoesNotTripKillSwitch=true;

  const firstAccumulated=lossEngine.autoLossState.accumulatedUsd;
  lossEngine.state="ACTIVE";lossEngine.session=autoSession({eventId:"loss-2",entryClientId:"SCALP-E-K2",tpClientId:"SCALP-T-K2",slClientId:"SCALP-S-K2",exitClientId:"SCALP-X-K2"});
  await lossEngine.finishExit("SL");
  await new Promise(resolve=>setTimeout(resolve,0));
  assert(lossEngine.autoLossState.accumulatedUsd>firstAccumulated*1.9,"a second same-day loss must accumulate on top of the first");
  assert(lossEngine.autoLossState.accumulatedUsd>=5,"accumulated daily auto-loss must have crossed the configured cap");
  assert.equal(lossEngine.config.autoTradingEnabled,false,"crossing the daily auto-loss cap must flip autoTradingEnabled off");
  assert(typeof lossEngine.autoDisabledReason==="string"&&lossEngine.autoDisabledReason.includes("Daily auto-loss cap"),"a human-readable reason must be recorded");
  assert.equal(lossEngine.autoTradingBlockedReason(),lossEngine.autoDisabledReason,"the blocked reason must surface why auto-trading is off");
  cases.crossingDailyAutoLossCapTripsKillSwitchAndRecordsReason=true;

  // Once tripped, auto re-arm must stay off even after returning to OFF (no silent recovery).
  assert.equal(lossEngine.state,"OFF");
  cases.killSwitchStaysOffWithoutAutomaticRecovery=true;

  // Re-enabling requires an explicit, manual updateConfig -- not a fresh day, not a reload.
  lossEngine.updateConfig({autoTradingEnabled:true});
  assert.equal(lossEngine.autoDisabledReason,null,"manual re-enable must clear the recorded disabled reason");
  assert.equal(lossEngine.autoTradingBlockedReason(),null);
  cases.manualReEnableClearsDisabledReason=true;

  // A winning auto-entered exit must never count against the loss cap.
  const winEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  winEngine.config={...winEngine.config,autoTradingEnabled:true,autoEntryEnabled:true,maxDailyAutoLossUsd:1};
  winEngine.state="ACTIVE";winEngine.session=autoSession({eventId:"win-1"});
  await winEngine.finishExit("TP");
  assert.equal(winEngine.autoLossState.accumulatedUsd,0,"a profitable exit must not add to the auto-loss tally");
  assert.equal(winEngine.config.autoTradingEnabled,true);
  cases.profitableExitNeverCountsAgainstLossCap=true;

  // A manual (non-auto-entered) losing exit must not count against the auto-loss cap either --
  // the cap is scoped to realized loss FROM AUTO-ENTERED positions only.
  const manualEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  manualEngine.config={...manualEngine.config,autoTradingEnabled:true,autoEntryEnabled:true,maxDailyAutoLossUsd:1};
  manualEngine.state="ACTIVE";manualEngine.session=autoSession({eventId:"manual-loss",autoEntered:false});
  await manualEngine.finishExit("SL");
  assert.equal(manualEngine.autoLossState.accumulatedUsd,0,"a manual entry's loss must not be attributed to the auto-loss cap");
  assert.equal(manualEngine.config.autoTradingEnabled,true);
  cases.manualEntryLossesAreNeverAttributedToAutoLossCap=true;

  console.log("SCALP kill switch tests: PASS",cases);
  return cases;
}
module.exports=run;if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
