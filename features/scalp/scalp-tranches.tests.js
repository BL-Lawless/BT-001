"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const repo=path.resolve(__dirname,"../..");
class TestEventTarget{constructor(){this.listeners={};}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(){}dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn(event));return true;}}
class TestEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}

function load(files,extra={}){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,URLSearchParams,TextEncoder,...extra};
  context.window=context;context.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  vm.createContext(context);
  files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file}));
  return context;
}

function hedgeGateway(){
  const positions={LONG:null,SHORT:null},normal=[],algo=[],calls=[];let nextId=1;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const remove=(rows,params)=>{const index=rows.findIndex(row=>String(row.orderId??row.algoId)===String(params.orderId??params.algoId)||String(row.clientOrderId??row.clientAlgoId)===String(params.origClientOrderId??params.clientAlgoId));if(index>=0)rows.splice(index,1);};
  return {
    calls,positions,normal,algo,isAuthenticated:()=>true,symbol:()=>"BTCUSDT",connection:()=>({streamStatus:"LIVE"}),
    filters:async()=>({tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"HEDGE"}),
    balance:async()=>[{asset:"USDT",availableBalance:"1000"}],commissionRate:async()=>({makerCommissionRate:.0002,takerCommissionRate:.0004}),
    refreshPositions:async()=>clone(positions),reconcile:async()=>({positions:clone(positions),orders:{orders:clone(normal),algoOrders:clone(algo)}}),
    orders:async()=>({orders:clone(normal),algoOrders:clone(algo)}),
    submitOrder:async params=>{
      calls.push(["order",clone(params)]);
      const id=nextId++;
      if(params.type==="MARKET"){
        const direction=params.positionSide,qty=Number(params.quantity),prior=positions[direction],price=direction==="LONG"?100:110,newQty=(prior?prior.qty:0)+(params.side===(direction==="LONG"?"BUY":"SELL")?qty:-qty);
        positions[direction]=newQty>1e-12?{symbol:"BTCUSDT",side:direction,positionSide:direction,qty:newQty,avg:prior?prior.avg:price,leverage:10}:null;
        return {orderId:id,executedQty:String(qty),avgPrice:String(price)};
      }
      const row={orderId:id,clientOrderId:params.newClientOrderId,symbol:"BTCUSDT",positionSide:params.positionSide,side:params.side,type:params.type,status:"NEW",origQty:params.quantity,price:params.price};normal.push(row);return row;
    },
    submitAlgoOrder:async params=>{calls.push(["algo",clone(params)]);const row={algoId:nextId++,clientAlgoId:params.clientAlgoId,symbol:"BTCUSDT",positionSide:params.positionSide,side:params.side,type:params.type,status:"NEW",quantity:params.quantity,triggerPrice:params.triggerPrice};algo.push(row);return row;},
    cancelOrder:async params=>{calls.push(["cancel-order",clone(params)]);remove(normal,params);return {status:"CANCELED"};},
    cancelAlgoOrder:async params=>{calls.push(["cancel-algo",clone(params)]);remove(algo,params);return {status:"CANCELED"};},
    queryOrder:async params=>normal.find(row=>row.clientOrderId===params.origClientOrderId)||null,
    queryAlgoOrder:async params=>algo.find(row=>row.clientAlgoId===params.clientAlgoId)||null,
    fill(clientId,direction,qty){
      const normalIndex=normal.findIndex(row=>row.clientOrderId===clientId),algoIndex=algo.findIndex(row=>row.clientAlgoId===clientId),row=normalIndex>=0?normal.splice(normalIndex,1)[0]:algoIndex>=0?algo.splice(algoIndex,1)[0]:null;
      const prior=positions[direction],next=Math.max(0,(prior?prior.qty:0)-qty);positions[direction]=next>1e-12?{...prior,qty:next}:null;
      return {...row,status:"FILLED",executedQty:String(qty),avgPrice:String(direction==="LONG"?95:115)};
    }
  };
}

function signal(direction,id){return {source:"1m",eventId:id,freshnessKey:id,eventType:"CROSS",direction,eventState:"COMMITTED",qualified:true,projected:false,publishedAt:Date.now()+5,candleTime:Date.now()};}

async function run(){
  const context=load(["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js"]);
  const {tranches,calculations:calc,config}=context.__BT001_SCALP_BUILD__;
  const book=tranches.create({accountSlot:"scalper",symbol:"BTCUSDT"});
  tranches.add(book,{trancheId:"L1",direction:"LONG",requestedQty:.1,filledQty:.1,remainingQty:.1,status:"ACTIVE"});
  tranches.add(book,{trancheId:"S1",direction:"SHORT",requestedQty:.2,filledQty:.2,remainingQty:.2,status:"ACTIVE"});
  assert.deepEqual(JSON.parse(JSON.stringify(tranches.counts(book))),{LONG:1,SHORT:1});
  assert.equal(tranches.canAdd(book,"LONG",1),false);
  assert.equal(tranches.canAdd(book,"SHORT",2),true);
  assert.equal(tranches.findByClientId(book,""),null);
  book.directions.LONG.tranches[0].pslClientId="SCALP-P-L1";
  assert.equal(tranches.findByClientId(book,"SCALP-P-L1").trancheId,"L1");
  tranches.close(book,"L1",{reason:"PSL",closedAt:10});
  assert.equal(tranches.count(book,"LONG"),0);
  assert.equal(tranches.count(book,"SHORT"),1);
  assert.equal(tranches.canAdd(book,"LONG",1),true);
  assert.notEqual(tranches.storageKey(config.trancheSessionKey,"main"),tranches.storageKey(config.trancheSessionKey,"scalper"));

  const validationBase={config:{...config.defaults,lot:"0.100",target:"1",stop:"1",maxConcurrentAutoPositions:1},filters:{stepSize:.001,minQty:.001,minNotional:5,leverage:10},guide:100,balance:[{asset:"USDT",availableBalance:"1000"}],symbol:"BTCUSDT",authenticated:true,streamHealthy:true,sourceReady:true,filtersReady:true,ownedOrders:[]};
  const longBlocked=calc.validateArm({...validationBase,direction:"LONG",trancheCounts:{LONG:1,SHORT:0},position:{side:"SHORT",qty:.2}});
  assert.equal(longBlocked.ok,false);assert(longBlocked.errors.includes("LONG tranche limit reached (1/1)"));
  const longAllowedWithShortOpen=calc.validateArm({...validationBase,direction:"LONG",trancheCounts:{LONG:0,SHORT:1},position:{side:"SHORT",qty:.2}});
  assert.equal(longAllowedWithShortOpen.ok,true);

  const gatewayContext=load(["features/scalp/secondary-gateway.module.js"],{
    crypto:{subtle:{}},
    BT001ScalpAccount:{},
    BT001_BINANCE_TRADING:{symbol:()=>"BTCUSDT"}
  });
  const normalized=gatewayContext.BT001ScalpSecondaryGateway.normalizePositions([
    {symbol:"BTCUSDT",positionSide:"LONG",positionAmt:"0.25",entryPrice:"100",leverage:"10"},
    {symbol:"BTCUSDT",positionSide:"SHORT",positionAmt:"-0.40",entryPrice:"110",leverage:"10"},
    {symbol:"ETHUSDT",positionSide:"LONG",positionAmt:"2",entryPrice:"3000"}
  ],"BTCUSDT");
  assert.equal(normalized.LONG.qty,.25);assert.equal(normalized.LONG.side,"LONG");
  assert.equal(normalized.SHORT.qty,.4);assert.equal(normalized.SHORT.side,"SHORT");
  const exchangeInfoPayload={symbols:[{symbol:"BTCUSDT",filters:[
    {filterType:"PRICE_FILTER",tickSize:"0.10"},
    {filterType:"LOT_SIZE",stepSize:"0.001",minQty:"0.001",maxQty:"100"},
    {filterType:"MARKET_LOT_SIZE",stepSize:"0.005",minQty:"0.005",maxQty:"50"},
    {filterType:"MIN_NOTIONAL",notional:"5"}
  ]}]};
  const filterRequests=[],filterRest={
    get:async url=>url.includes("/exchangeInfo")?exchangeInfoPayload:{serverTime:Date.now()},
    requestJson:async url=>{filterRequests.push(url);if(url.includes("/positionSide/dual"))return {dualSidePosition:true};if(url.includes("/positionRisk"))return [{symbol:"BTCUSDT",positionAmt:"0",positionSide:"LONG",entryPrice:"0",leverage:"20"}];if(url.includes("/balance"))return [{asset:"USDT",availableBalance:"1000"}];if(url.includes("/openOrders")||url.includes("/openAlgoOrders"))return [];throw new Error(`Unexpected signed request ${url}`);}
  };
  const filterRuntime=load(["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/signal-detector.js","features/scalp/state-machine.js","features/scalp/secondary-gateway.module.js"],{
    EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,Uint8Array,
    crypto:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1,2,3]).buffer}},
    restService:filterRest,BT001ScalpAccount:{getCredentials:()=>({key:"scalper-key",secret:"scalper-secret"}),reportConnectionStatus:()=>{}},
    BT001_BINANCE_TRADING:{symbol:()=>"BTCUSDT"},PUBLIC_MARKET_DATA_HUB:{getAuthoritativeMaSnapshot:()=>({reliable:true})},
    createBinanceUserDataStream:options=>({start:()=>options.onStatus({streamStatus:"LIVE"}),stop:()=>{}})
  });
  filterRuntime.dispatchEvent=()=>true;filterRuntime.addEventListener=()=>{};filterRuntime.removeEventListener=()=>{};
  const filterGateway=filterRuntime.BT001ScalpSecondaryGateway.create("scalper"),flatFilters=await filterGateway.filters("BTCUSDT");
  assert.equal(typeof flatFilters.tickSize,"number");assert.equal(flatFilters.tickSize,.1);assert.equal(typeof flatFilters.stepSize,"number");assert.equal(flatFilters.stepSize,.005);assert.equal(flatFilters.minNotional,5);assert.equal(flatFilters.minQty,.005);assert.equal(flatFilters.maxQty,50);assert(Array.isArray(flatFilters.filters));
  const filterEngine=new filterRuntime.__BT001_SCALP_BUILD__.ScalpEngine({gateway:filterGateway,storage:filterRuntime.localStorage,accountSlot:"scalper",useGlobalPrivateEvents:false});filterEngine.guide=100;filterEngine.config={...filterEngine.config,lot:"0.100",target:"1",stop:"1"};filterGateway.attach(filterEngine);const filterArmResult=await filterEngine.arm();assert.equal(filterArmResult.ok,true,filterArmResult.errors&&filterArmResult.errors.join("; "));assert(!filterArmResult.errors.includes("Current symbol trading filters are unavailable"));assert.equal(filterEngine.state,"ARMED");filterGateway.detach();assert(filterRequests.some(url=>url.includes("/positionSide/dual")));

  const logs=[],runtime=load(["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/signal-detector.js","features/scalp/state-machine.js"],{
    EventTarget:TestEventTarget,CustomEvent:TestEvent,setTimeout,clearTimeout,
    BT001Supabase:{log:async(table,row)=>{logs.push({table,row});return true;},getDeviceId:()=>"test"}
  });
  runtime.dispatchEvent=()=>true;runtime.addEventListener=()=>{};runtime.removeEventListener=()=>{};
  const gateway=hedgeGateway(),storage=new (class{constructor(){this.map=new Map();}getItem(key){return this.map.get(key)||null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}})();
  const legacyStorage=new (class{constructor(seed){this.map=new Map(Object.entries(seed));}getItem(key){return this.map.get(key)||null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}})({
    [runtime.__BT001_SCALP_BUILD__.config.sessionKey]:JSON.stringify({symbol:"BTCUSDT",direction:"LONG",source:"1m",eventId:"legacy-open",generation:3,filledQty:.1,liveQty:.1,avgEntry:100,entryClientId:"SCALP-E-LEGACY",tpClientId:"SCALP-T-LEGACY",slClientId:"SCALP-S-LEGACY",tpOrderId:41,slOrderId:42,target:1,stop:1})
  });
  const migrated=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway,storage:legacyStorage,accountSlot:"scalper"}),migratedRow=runtime.__BT001_SCALP_BUILD__.tranches.activeTranches(migrated.book,"LONG")[0];
  assert(migratedRow&&migratedRow.migratedFromLegacySession);assert.equal(migratedRow.partialTpClientId,"SCALP-T-LEGACY");assert.equal(migratedRow.pslClientId,"SCALP-S-LEGACY");
  assert(legacyStorage.getItem(runtime.__BT001_SCALP_BUILD__.tranches.storageKey(runtime.__BT001_SCALP_BUILD__.config.trancheSessionKey,"scalper")));assert.equal(legacyStorage.getItem(runtime.__BT001_SCALP_BUILD__.tranches.storageKey(runtime.__BT001_SCALP_BUILD__.config.trancheSessionKey,"main")),null);
  const orphanGateway=hedgeGateway(),orphanStorage=new (class{constructor(){this.map=new Map();}getItem(key){return this.map.get(key)||null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}})();
  orphanGateway.positions.LONG={symbol:"BTCUSDT",side:"LONG",positionSide:"LONG",qty:.1,avg:100,leverage:10};
  orphanGateway.normal.push({orderId:501,clientOrderId:"SCALP-T-7-ORPHAN",symbol:"BTCUSDT",positionSide:"LONG",side:"SELL",type:"LIMIT",status:"NEW",origQty:".1",executedQty:"0",price:"105"});
  orphanGateway.algo.push({algoId:502,clientAlgoId:"SCALP-S-7-ORPHAN",symbol:"BTCUSDT",positionSide:"LONG",side:"SELL",type:"STOP_MARKET",status:"NEW",quantity:".1",executedQty:"0",triggerPrice:"97"});
  const orphanEngine=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway:orphanGateway,storage:orphanStorage,accountSlot:"scalper"});orphanEngine.state="ERROR";orphanEngine.status="ERROR · Unresolved SCALP-owned orders exist";orphanEngine.setExternalPosition(orphanGateway.positions.LONG);orphanEngine.acceptDetection("1m",{status:"LIVE LONG CROSS",event:signal("LONG","orphan-visible")},false);assert.equal(orphanEngine.snapshot().detections.find(row=>row.source==="1m").eligibility,"BLOCKED BY POSITION");
  await orphanEngine.recover();const adopted=runtime.__BT001_SCALP_BUILD__.tranches.activeTranches(orphanEngine.book,"LONG")[0];assert(adopted&&adopted.recoveredFromOrphanOrders);assert.equal(adopted.partialTpClientId,"SCALP-T-7-ORPHAN");assert.equal(adopted.pslClientId,"SCALP-S-7-ORPHAN");assert.equal(adopted.partialTpOrderId,501);assert.equal(adopted.pslOrderId,502);assert.equal(adopted.partialTpPrice,105);assert.equal(adopted.pslPrice,97);assert.equal(orphanEngine.state,"OFF");assert(orphanEngine.status.includes("manual ARM required"));assert.notEqual(orphanEngine.snapshot().detections.find(row=>row.source==="1m").eligibility,"BLOCKED BY POSITION");assert.equal(orphanGateway.calls.length,0,"orphan adoption must be read-only on the exchange");
  const orphanKey=runtime.__BT001_SCALP_BUILD__.tranches.storageKey(runtime.__BT001_SCALP_BUILD__.config.trancheSessionKey,"scalper");assert(orphanStorage.getItem(orphanKey));const orphanReloaded=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway:orphanGateway,storage:orphanStorage,accountSlot:"scalper"});await orphanReloaded.recover();assert.equal(orphanReloaded.trancheCounts().LONG,1);assert.equal(orphanGateway.calls.length,0);
  const ambiguousGateway=hedgeGateway(),ambiguousStorage=new (class{constructor(){this.map=new Map();}getItem(key){return this.map.get(key)||null;}setItem(key,value){this.map.set(key,String(value));}removeItem(key){this.map.delete(key);}})();ambiguousGateway.positions.LONG={symbol:"BTCUSDT",side:"LONG",positionSide:"LONG",qty:.1,avg:100,leverage:10};ambiguousGateway.normal.push({orderId:601,clientOrderId:"SCALP-T-MISSING-SL",symbol:"BTCUSDT",positionSide:"LONG",side:"SELL",origQty:".1",price:"105"});const ambiguousEngine=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway:ambiguousGateway,storage:ambiguousStorage,accountSlot:"scalper"});await ambiguousEngine.recover();assert.equal(ambiguousEngine.state,"ERROR");assert(ambiguousEngine.status.includes("Incomplete TP/PSL orphan pair"));assert.deepEqual(JSON.parse(JSON.stringify(ambiguousEngine.trancheCounts())),{LONG:0,SHORT:0});assert.equal(ambiguousGateway.calls.length,0,"ambiguous orphan state must fail closed without exchange writes");
  const engine=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway,storage,accountSlot:"scalper"});
  engine.guide=100;engine.filters={tickSize:.1,stepSize:.001,minQty:.001,minNotional:5,leverage:10,positionMode:"HEDGE"};engine.config={...engine.config,lot:"0.100",target:"1",stop:"1",maxConcurrentAutoPositions:2};engine.state="ARMED";engine.armedAt=Date.now()-10;
  const firstLong=await engine.executeEntry(signal("LONG","long-1")),secondLong=await engine.executeEntry(signal("LONG","long-2"));
  assert(firstLong&&secondLong);assert.deepEqual(JSON.parse(JSON.stringify(engine.trancheCounts())),{LONG:2,SHORT:0});assert.equal(gateway.positions.LONG.qty,.2);
  assert.equal(gateway.algo.filter(row=>row.positionSide==="LONG").length,2);assert.equal(gateway.normal.filter(row=>row.positionSide==="LONG").length,2);
  const short=await engine.executeEntry(signal("SHORT","short-1"));assert(short);assert.deepEqual(JSON.parse(JSON.stringify(engine.trancheCounts())),{LONG:2,SHORT:1});assert.equal(gateway.positions.SHORT.qty,.1);
  const blocked=await engine.executeEntry(signal("LONG","long-blocked"));assert.equal(blocked,null);assert.equal(engine.trancheCounts().LONG,2);
  const filledPsl=gateway.fill(firstLong.pslClientId,"LONG",.1);engine.onOrder({order:filledPsl});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(engine.trancheCounts().LONG,1);assert.equal(runtime.__BT001_SCALP_BUILD__.tranches.find(engine.book,secondLong.trancheId).status,"ACTIVE");assert(gateway.normal.some(row=>row.clientOrderId===secondLong.partialTpClientId));assert(gateway.algo.some(row=>row.clientAlgoId===secondLong.pslClientId));
  const replacement=await engine.executeEntry(signal("LONG","long-3"));assert(replacement);assert.equal(engine.trancheCounts().LONG,2);
  const siblingBefore=runtime.__BT001_SCALP_BUILD__.tranches.find(engine.book,secondLong.trancheId),siblingPslId=siblingBefore.pslOrderId;gateway.positions.LONG={...gateway.positions.LONG,qty:gateway.positions.LONG.qty-.04};engine.onOrder({order:{clientOrderId:replacement.partialTpClientId,status:"PARTIALLY_FILLED",executedQty:".04",avgPrice:String(replacement.partialTpPrice)}});await new Promise(resolve=>setTimeout(resolve,0));assert(Math.abs(replacement.remainingQty-.06)<1e-10);assert.equal(runtime.__BT001_SCALP_BUILD__.tranches.find(engine.book,secondLong.trancheId).pslOrderId,siblingPslId);assert(gateway.algo.some(row=>row.clientAlgoId===replacement.pslClientId&&Math.abs(Number(row.quantity)-.06)<1e-10));
  const lossAfterFirst=engine.autoLossState.accumulatedUsd,filledShortPsl=gateway.fill(short.pslClientId,"SHORT",.1);engine.onOrder({order:filledShortPsl});await new Promise(resolve=>setTimeout(resolve,0));assert(engine.autoLossState.accumulatedUsd>lossAfterFirst,"each tranche loss must be accumulated independently");
  assert(logs.filter(item=>item.table==="scalp_activity_log"&&item.row.action==="TRANCHE_ADDED").length===4);assert(logs.some(item=>item.row.action==="TRANCHE_CLOSED"&&item.row.position_state.trancheId===firstLong.trancheId));
  assert(logs.some(item=>item.table==="scalp_trades"&&item.row.raw_session.trancheId===firstLong.trancheId));
  const recovered=new runtime.__BT001_SCALP_BUILD__.ScalpEngine({gateway,storage,accountSlot:"scalper"});await recovered.recover();assert.deepEqual(JSON.parse(JSON.stringify(recovered.trancheCounts())),{LONG:2,SHORT:0});assert.equal(recovered.state,"OFF");assert(recovered.status.includes("manual ARM required"));
  console.log("SCALP tranche foundation tests: PASS");
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
