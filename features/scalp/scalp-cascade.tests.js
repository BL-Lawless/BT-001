"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");
class MemoryStorage{constructor(seed={}){this.data=new Map(Object.entries(seed));}getItem(key){return this.data.has(key)?this.data.get(key):null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn);}dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn.call(this,event));return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
function runtime(){const storage=new MemoryStorage(),context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,localStorage:storage};context.window=context;context.dispatchEvent=()=>true;context.addEventListener=()=>{};context.removeEventListener=()=>{};vm.createContext(context);for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});return {context,storage,build:context.__BT001_SCALP_BUILD__};}
function fakeGateway(overrides={}){let position=null;const calls=[];return {calls,isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"live"}),position:()=>({position}),filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"ONE_WAY"}),orders:async()=>({orders:[],algoOrders:[]}),balance:async()=>[{asset:"USDT",availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),reconcile:async()=>({position,orders:{orders:[],algoOrders:[]}}),refreshPosition:async()=>position,submitOrder:async params=>{calls.push(["order",params]);if(params.type==="MARKET"&&!params.reduceOnly){position={symbol:"BTCUSDT",side:params.side==="BUY"?"LONG":"SHORT",qty:Number(params.quantity),avg:100};return {orderId:1,executedQty:params.quantity,avgPrice:"100"};}if(params.type==="MARKET"&&params.reduceOnly){position=null;return {orderId:4};}return {orderId:3};},submitAlgoOrder:async params=>{calls.push(["algo",params]);return {algoId:2};},cancelOrder:async params=>{calls.push(["cancel-order",params]);},cancelAlgoOrder:async params=>{calls.push(["cancel-algo",params]);},queryOrder:async()=>null,...overrides,_setPosition:value=>{position=value;},_position:()=>position};}
function event(direction="LONG",type="CROSS",id="new-1",source="1m"){return {source,eventId:id,freshnessKey:id,eventType:type,direction,eventState:type==="CROSS"?"COMMITTED":"CONFIRMED",qualified:true,projected:false,publishedAt:Date.now()+5,candleTime:Date.now()};}

async function run(){
  const {build}=runtime(),C=build.config,cases={};

  // A qualifying cross or confirmed bounce on ANY watched timeframe records an active cascade entry
  // (timeframe, direction, timestamp, rank at the time) -- independently per timeframe.
  const engine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  engine.acceptDetection("3m",{status:"LIVE LONG CROSS",event:{...event("LONG","CROSS","c1","3m"),rankValue:72,rank:"B"}},false);
  let cascade=engine.cascadeState();
  assert.equal(cascade.length,1);assert.equal(cascade[0].timeframe,"3m");assert.equal(cascade[0].direction,"LONG");assert.equal(cascade[0].rankValue,72);assert.equal(cascade[0].eventType,"CROSS");
  cases.qualifyingCrossRecordsCascadeEntry=true;

  engine.acceptDetection("5m",{status:"CONFIRMED SHORT BOUNCE",event:{...event("SHORT","BOUNCE","b1","5m"),rankValue:65,rank:"B"}},false);
  cascade=engine.cascadeState();
  assert.equal(cascade.length,2);
  const tf3=cascade.find(row=>row.timeframe==="3m"),tf5=cascade.find(row=>row.timeframe==="5m");
  assert.equal(tf3.direction,"LONG","a different timeframe's opposite-direction event must not touch another timeframe's cascade record");
  assert.equal(tf5.direction,"SHORT");assert.equal(tf5.eventType,"BOUNCE");
  cases.confirmedBounceAlsoRecordsAndOtherTimeframesAreIndependent=true;

  // Cascade records never expire on a timer -- only an opposite-direction cross on the SAME
  // timeframe invalidates them, regardless of how much (simulated) time passes.
  let clock=1000;
  const timedEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage(),now:()=>clock});
  timedEngine.acceptDetection("15m",{status:"LIVE LONG CROSS",event:{...event("LONG","CROSS","t1","15m"),rankValue:80,rank:"A",publishedAt:clock}},false);
  clock+=C.signal.staleMs["15m"]*10;
  const timedRecord=timedEngine.cascadeState().find(row=>row.timeframe==="15m");
  assert(timedRecord,"cascade record must not expire via a timer");
  assert.equal(timedRecord.direction,"LONG");
  cases.cascadeRecordDoesNotExpireOnATimer=true;

  // Expiry rule: an OPPOSITE-direction cross on the SAME timeframe invalidates (replaces) that
  // timeframe's record; unrelated timeframes are left exactly as they were.
  engine.acceptDetection("3m",{status:"LIVE SHORT CROSS",event:{...event("SHORT","CROSS","c2","3m"),rankValue:55,rank:"C"}},false);
  cascade=engine.cascadeState();
  assert.equal(cascade.length,2,"expiry replaces the existing timeframe record rather than accumulating a second one");
  const tf3after=cascade.find(row=>row.timeframe==="3m"),tf5after=cascade.find(row=>row.timeframe==="5m");
  assert.equal(tf3after.direction,"SHORT","opposite-direction cross on the SAME timeframe must invalidate the prior record");
  assert.equal(tf5after.direction,"SHORT","untouched timeframe must be unaffected by another timeframe's opposite cross");
  cases.oppositeCrossOnSameTimeframeExpiresPriorRecord=true;

  // A same-direction confirmed bounce on the SAME timeframe refreshes (does not expire) the record.
  engine.acceptDetection("15m",{status:"CONFIRMED SHORT BOUNCE",event:{...event("SHORT","BOUNCE","b2","15m"),rankValue:70,rank:"B"}},false);
  const agreement=engine.cascadeAgreement("SHORT");
  assert.equal(agreement.count,3);assert.deepEqual(Array.from(agreement.timeframes).sort(),["15m","3m","5m"]);
  cases.cascadeAgreementReportsAllCurrentlyAgreeingTimeframes=true;

  // Cascade tracking is a booster, not a gate: opposite-direction agreement recorded on a SLOWER
  // timeframe must never block or delay an entry firing on a FASTER (armed/selected) timeframe.
  const gateEngine=new build.ScalpEngine({gateway:fakeGateway(),storage:new MemoryStorage()});
  gateEngine.state="ARMED";gateEngine.armedAt=0;gateEngine.config={...gateEngine.config,direction:"ANY",entryType:"ANY",minimumRank:0,source:"1m"};
  gateEngine.acceptDetection("15m",{status:"LIVE SHORT CROSS",event:{...event("SHORT","CROSS","opp15","15m"),rankValue:90,rank:"A"}},false);
  assert.equal(gateEngine.cascadeAgreement("SHORT").count,1);
  let entered=false;gateEngine.executeEntry=async()=>{entered=true;};
  gateEngine.acceptDetection("1m",{status:"LIVE LONG CROSS",event:{...event("LONG","CROSS","fast1","1m"),rankValue:10,rank:"C"}});
  assert.equal(entered,true,"cascade disagreement on a slower timeframe must never block or delay a faster-timeframe entry");
  cases.cascadeNeverBlocksOrDelaysFasterTimeframeEntry=true;

  console.log("SCALP cascade tests: PASS",cases);
  return cases;
}
module.exports=run;if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
