"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"../..");

class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(){}dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn(event));return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
class TestStorage{constructor(seed={}){this.map=new Map(Object.entries(seed));}getItem(key){return this.map.get(key)||null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}}

function loadRuntime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout};
  context.window=context;context.localStorage=new TestStorage();context.dispatchEvent=()=>true;context.addEventListener=()=>{};context.removeEventListener=()=>{};
  vm.createContext(context);
  for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/exit-decisions.js","features/scalp/core/logger.js","features/scalp/core/signal-detector-core.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"])vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});
  return context;
}

function activeBook(build){
  const book=build.tranches.create({accountSlot:"scalper",symbol:"BTCUSDT"});
  for(const [index,suffix] of ["ONE","TWO"].entries())build.tranches.add(book,{
    trancheId:`SHORT-${suffix}`,symbol:"BTCUSDT",direction:"SHORT",source:"1m",eventId:`short-${suffix.toLowerCase()}`,eventType:"CROSS",generation:1,
    entryClientId:`SCALP-E-${suffix}`,partialTpClientId:`SCALP-T-${suffix}`,pslClientId:`SCALP-S-${suffix}`,exitClientId:`SCALP-X-${suffix}`,
    partialTpOrderId:100+index,pslOrderId:200+index,requestedQty:.01,filledQty:.01,remainingQty:.01,entryPrice:100,entryCommission:.0004,
    target:1,stop:1,tpDelta:0,slDelta:0,tpDriver:"NET_TARGET",slDriver:"NET_SL",partialTpPrice:90,pslPrice:110,fundingCost:0,createdAt:1000+index,status:"ACTIVE"
  });
  return book;
}

function gateway(){
  let positions={LONG:null,SHORT:{symbol:"BTCUSDT",side:"SHORT",positionSide:"SHORT",qty:.02,avg:100,leverage:10}};
  let orders=[
    {orderId:100,clientOrderId:"SCALP-T-ONE",symbol:"BTCUSDT",positionSide:"SHORT",side:"BUY",status:"NEW",origQty:".01",price:"90"},
    {orderId:101,clientOrderId:"SCALP-T-TWO",symbol:"BTCUSDT",positionSide:"SHORT",side:"BUY",status:"NEW",origQty:".01",price:"90"}
  ];
  let algoOrders=[
    {algoId:200,clientAlgoId:"SCALP-S-ONE",symbol:"BTCUSDT",positionSide:"SHORT",side:"BUY",status:"NEW",quantity:".01",triggerPrice:"110"},
    {algoId:201,clientAlgoId:"SCALP-S-TWO",symbol:"BTCUSDT",positionSide:"SHORT",side:"BUY",status:"NEW",quantity:".01",triggerPrice:"110"}
  ];
  let entryOrders=[];
  const calls=[],clone=value=>JSON.parse(JSON.stringify(value));
  return {
    calls,isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"LIVE"}),
    filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"HEDGE"}),
    commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),balance:async()=>[{asset:"USDT",availableBalance:"1000"}],
    reconcile:async()=>({positions:clone(positions),orders:{orders:clone(orders),algoOrders:clone(algoOrders)}}),
    queryOrder:async params=>orders.find(row=>row.clientOrderId===params.origClientOrderId)||entryOrders.find(row=>row.clientOrderId===params.origClientOrderId)||null,
    queryAlgoOrder:async params=>algoOrders.find(row=>row.clientAlgoId===params.clientAlgoId)||null,
    cancelOrder:async params=>{calls.push(["cancel-order",clone(params)]);orders=orders.filter(row=>String(row.orderId)!==String(params.orderId)&&row.clientOrderId!==params.origClientOrderId);},
    cancelAlgoOrder:async params=>{calls.push(["cancel-algo",clone(params)]);algoOrders=algoOrders.filter(row=>String(row.algoId)!==String(params.algoId)&&row.clientAlgoId!==params.clientAlgoId);},
    submitOrder:async params=>{calls.push(["order",clone(params)]);return {orderId:900};},
    submitAlgoOrder:async params=>{calls.push(["algo",clone(params)]);const row={algoId:901+algoOrders.length,clientAlgoId:params.clientAlgoId,symbol:params.symbol,positionSide:params.positionSide,side:params.side,status:"NEW",quantity:params.quantity,triggerPrice:params.triggerPrice};algoOrders.push(row);return row;},
    reduceExternally(qty,{keepProtection=true}={}){positions={LONG:null,SHORT:qty>0?{symbol:"BTCUSDT",side:"SHORT",positionSide:"SHORT",qty,avg:100,leverage:10}:null};if(!keepProtection){orders=[];algoOrders=[];}},
    closeExternally(options){this.reduceExternally(0,options);},
    removeProtection(clientId){orders=orders.filter(row=>row.clientOrderId!==clientId);algoOrders=algoOrders.filter(row=>row.clientAlgoId!==clientId);},
    addEntryOrder(row){entryOrders.push(clone(row));},
    positions:()=>clone(positions)
  };
}

async function waitForReconciliation(engine){for(let attempt=0;attempt<100;attempt++){await new Promise(resolve=>setTimeout(resolve,0));if(!engine.reconnectBusy)return;}throw new Error("Timed out waiting for live reconciliation");}

async function run(){
  const runtime=loadRuntime(),activityLogs=[];runtime.BT001Supabase={log:async(table,row)=>{activityLogs.push({table,row});return true;},getDeviceId:()=>"recovery-test"};const build=runtime.__BT001_SCALP_BUILD__,key=build.tranches.storageKey(build.config.trancheSessionKey,"scalper");
  const liveGateway=gateway(),liveStorage=new TestStorage({[key]:JSON.stringify(activeBook(build))}),liveEngine=new build.ScalpEngine({gateway:liveGateway,storage:liveStorage,accountSlot:"scalper"});
  liveEngine.guide=100;await liveEngine.recover();assert.deepEqual(JSON.parse(JSON.stringify(liveEngine.trancheCounts())),{LONG:0,SHORT:2});
  liveGateway.closeExternally();liveEngine.onPosition({positions:liveGateway.positions()});await waitForReconciliation(liveEngine);
  assert.deepEqual(JSON.parse(JSON.stringify(liveEngine.trancheCounts())),{LONG:0,SHORT:0});assert.equal(liveEngine.state,"OFF");assert(liveEngine.status.includes("Exchange position reconciled"));assert(!liveEngine.status.includes("Invalid outcome inputs"));
  for(const id of ["SHORT-ONE","SHORT-TWO"]){const row=build.tranches.find(liveEngine.book,id);assert.equal(row.status,"CLOSED");assert.equal(row.closeReason,"MANUAL_EXTERNAL_CLOSE");}
  assert.equal(liveGateway.calls.filter(([kind])=>kind==="cancel-order").length,2);assert.equal(liveGateway.calls.filter(([kind])=>kind==="cancel-algo").length,2);

  const startupGateway=gateway();startupGateway.closeExternally();const startupStorage=new TestStorage({[key]:JSON.stringify(activeBook(build))}),startupEngine=new build.ScalpEngine({gateway:startupGateway,storage:startupStorage,accountSlot:"scalper"});
  startupEngine.guide=100;await startupEngine.recover();assert.deepEqual(JSON.parse(JSON.stringify(startupEngine.trancheCounts())),{LONG:0,SHORT:0});assert.equal(startupEngine.state,"OFF");assert(startupEngine.status.includes("Exchange position reconciled"));assert(!startupEngine.status.includes("Invalid outcome inputs"));
  assert(!startupGateway.calls.some(([kind])=>kind==="order"||kind==="algo"),"startup recovery must not submit replacement protection for a flat direction");

  const staleGateway=gateway();staleGateway.filters=async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"HEDGE",filters:[{filterType:"LOT_SIZE",stepSize:".001",minQty:".001",maxQty:"100"},{filterType:"MARKET_LOT_SIZE",stepSize:".001",minQty:".001",maxQty:"100"}]});staleGateway.closeExternally({keepProtection:false});const staleBook=activeBook(build),staleBranch=build.tranches.directionBook(staleBook,"SHORT"),staleTranche=staleBranch.tranches[0];staleBranch.tranches=[staleTranche];staleTranche.status="PROTECTION_PENDING";staleTranche.pslOrderId=null;staleTranche.partialTpOrderId=null;
  const staleStorage=new TestStorage({[key]:JSON.stringify(staleBook)}),staleEngine=new build.ScalpEngine({gateway:staleGateway,storage:staleStorage,accountSlot:"scalper"});runtime.PUBLIC_MARKET_DATA_HUB={getAuthoritativeMaSnapshot:()=>({reliable:true})};staleEngine.initialized=true;staleEngine.guide=100;staleEngine.config={...staleEngine.config,lot:"0.100",target:"1",stop:"1"};
  const staleArm=await staleEngine.arm();assert.equal(staleArm.ok,true,staleArm.errors&&staleArm.errors.join("; "));assert.equal(staleEngine.state,"ARMED");assert.deepEqual(JSON.parse(JSON.stringify(staleEngine.trancheCounts())),{LONG:0,SHORT:0});assert.equal(build.tranches.find(staleEngine.book,staleTranche.trancheId).status,"CLOSED");assert.equal(build.tranches.find(staleEngine.book,staleTranche.trancheId).closeReason,"MANUAL_EXTERNAL_CLOSE");assert.equal(staleGateway.calls.length,0,"ARM with a stale transitional tranche and a flat exchange must make no exchange write at all");await staleEngine.recover();assert.equal(staleGateway.calls.length,0,"later reconciliation must not resurrect protection after ARM cleans the stale tranche");

  const rebuildBook=()=>{const book=activeBook(build),branch=build.tranches.directionBook(book,"SHORT");branch.tranches=[branch.tranches[0]];return book;};
  const refusedGateway=gateway();refusedGateway.reduceExternally(.01);["SCALP-S-ONE","SCALP-T-TWO","SCALP-S-TWO"].forEach(id=>refusedGateway.removeProtection(id));const refusedEngine=new build.ScalpEngine({gateway:refusedGateway,storage:new TestStorage({[key]:JSON.stringify(rebuildBook())}),accountSlot:"scalper"});refusedEngine.guide=100;await refusedEngine.recover();assert.equal(refusedEngine.state,"ERROR");assert(refusedEngine.status.includes("matching entry order SCALP-E-ONE was not found"));assert(refusedEngine.status.includes("No protection order was submitted"));assert.equal(refusedGateway.calls.length,0,"aggregate directional position coverage must never authorize a protection rebuild without the exact filled entry order");assert(activityLogs.some(item=>item.table==="scalp_positions"&&item.row.action==="PROTECTION_REBUILD_REFUSED"&&item.row.position_state.trancheId==="SHORT-ONE"));

  const rebuiltGateway=gateway();rebuiltGateway.reduceExternally(.01);["SCALP-S-ONE","SCALP-T-TWO","SCALP-S-TWO"].forEach(id=>rebuiltGateway.removeProtection(id));rebuiltGateway.addEntryOrder({orderId:990,clientOrderId:"SCALP-E-ONE",symbol:"BTCUSDT",positionSide:"SHORT",side:"SELL",status:"FILLED",executedQty:".01",avgPrice:"100"});const rebuiltEngine=new build.ScalpEngine({gateway:rebuiltGateway,storage:new TestStorage({[key]:JSON.stringify(rebuildBook())}),accountSlot:"scalper"});rebuiltEngine.guide=100;await rebuiltEngine.recover();assert.equal(rebuiltEngine.state,"OFF");assert.equal(rebuiltGateway.calls.filter(([kind])=>kind==="algo").length,1);assert(activityLogs.some(item=>item.table==="scalp_positions"&&item.row.action==="PROTECTION_REBUILD_STARTED"&&item.row.position_state.trancheId==="SHORT-ONE"&&item.row.position_state.verification.orderId===990));assert(activityLogs.some(item=>item.table==="scalp_positions"&&item.row.action==="PROTECTION_REBUILD_SUCCEEDED"&&item.row.position_state.trancheId==="SHORT-ONE"));

  const failedGateway=gateway();failedGateway.reduceExternally(.01);["SCALP-S-ONE","SCALP-T-TWO","SCALP-S-TWO"].forEach(id=>failedGateway.removeProtection(id));failedGateway.addEntryOrder({orderId:991,clientOrderId:"SCALP-E-ONE",symbol:"BTCUSDT",positionSide:"SHORT",side:"SELL",status:"FILLED",executedQty:".01",avgPrice:"100"});failedGateway.submitAlgoOrder=async params=>{failedGateway.calls.push(["algo",JSON.parse(JSON.stringify(params))]);throw new Error("replacement PSL rejected");};const failedEngine=new build.ScalpEngine({gateway:failedGateway,storage:new TestStorage({[key]:JSON.stringify(rebuildBook())}),accountSlot:"scalper"});failedEngine.guide=100;let rebuildFailure=null;try{await failedEngine.recover();}catch(error){rebuildFailure=error;}assert(rebuildFailure&&rebuildFailure.message.includes("Protective PSL failed"));assert(activityLogs.some(item=>item.table==="scalp_positions"&&item.row.action==="PROTECTION_REBUILD_FAILED"&&item.row.position_state.trancheId==="SHORT-ONE"&&item.row.position_state.error.includes("Protective PSL failed")));

  const reducedGateway=gateway();reducedGateway.reduceExternally(.01);const reducedStorage=new TestStorage({[key]:JSON.stringify(activeBook(build))}),reducedEngine=new build.ScalpEngine({gateway:reducedGateway,storage:reducedStorage,accountSlot:"scalper"});
  reducedEngine.guide=100;await reducedEngine.recover();assert.deepEqual(JSON.parse(JSON.stringify(reducedEngine.trancheCounts())),{LONG:0,SHORT:1});assert.equal(build.tranches.activeTranches(reducedEngine.book,"SHORT")[0].trancheId,"SHORT-ONE");assert.equal(build.tranches.find(reducedEngine.book,"SHORT-TWO").closeReason,"MANUAL_EXTERNAL_CLOSE");assert(!reducedGateway.calls.some(([kind])=>kind==="order"||kind==="algo"),"whole-tranche external reduction must not rebuild protection");
  console.log("SCALP active external-close recovery tests: PASS");
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
