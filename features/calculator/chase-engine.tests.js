"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const source=fs.readFileSync(path.join(__dirname,"application","chaseEngine.js"),"utf8");

function harness(overrides={}){
  let now=0;
  class FakeDate extends Date{}
  FakeDate.now=()=>now;
  const updates=[];
  const finishes=[];
  const calls={submit:[],amend:[],query:[],cancel:[],verify:[]};
  const context={window:{},Date:FakeDate,Object,Set,String,Number,Math,Promise,clearTimeout:()=>{},setTimeout:()=>1};
  vm.createContext(context);
  vm.runInContext(source,context);
  let book={symbol:"BTCUSDT",bid:100,ask:101,at:0,ageMs:0,fresh:true,staleAfterMs:400};
  let order={symbol:"BTCUSDT",orderId:1,clientOrderId:"c1",status:"NEW",price:"101",origQty:"1",executedQty:"0"};
  const options={
    label:"Test CHS",
    pollMs:1000,
    getTopOfBook:()=>book,
    priceFor:(top,state)=>state.meta.side==="BUY"?String(top.bid):String(top.ask),
    submit:async payload=>{calls.submit.push(payload);return {...order,price:payload.price};},
    amend:async payload=>{calls.amend.push(payload);order={...order,price:payload.price};return order;},
    query:async identity=>{calls.query.push(identity);return order;},
    cancel:async identity=>{calls.cancel.push(identity);order={...order,status:"CANCELED"};return order;},
    verifyCanceled:async identity=>{calls.verify.push(identity);return true;},
    onUpdate:value=>updates.push(value),
    onFinish:async value=>finishes.push(value),
    ...overrides
  };
  const engine=context.window.CalculatorChaseEngine.create(options);
  return {engine,calls,updates,finishes,get book(){return book;},set book(value){book=value;},get order(){return order;},set order(value){order=value;},setNow(value){now=value;}};
}

(async()=>{
  {
    const h=harness({submit:async payload=>{h.calls.submit.push(payload);throw new Error("GTX would cross");}});
    await h.engine.start({symbol:"BTCUSDT",quantity:1,maxDurationMs:3000,meta:{side:"SELL"}});
    assert(h.engine.isActive(),"a GTX rejection must not fall back or silently finish the chase");
    assert.equal(h.calls.submit.length,1);
    assert(h.updates.some(item=>item.tone==="error"&&/GTX rejected/.test(item.message)));
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    await h.engine.tick();
    assert.equal(h.calls.amend.length,0,"an unchanged top-of-book price must not amend");
    h.book={...h.book,ask:102};
    await h.engine.tick();
    assert.equal(h.calls.amend.length,1,"a moved top-of-book price must amend once");
    assert.equal(h.calls.amend[0].price,"102");
    assert.equal(h.calls.amend[0].quantity,1,"the amend must always include quantity");
    const chasingUpdates=h.updates.filter(item=>item.statusCode==="chasing");
    assert(chasingUpdates.some(item=>item.price==="101"),"the chase status must publish the initial resting order price");
    assert.equal(chasingUpdates[chasingUpdates.length-1].price,"102","the chase status must publish each newly repriced resting order price");
    const bookUpdate=chasingUpdates.find(item=>item.bestBid&&item.bestAsk);
    assert.equal(bookUpdate.bestBid,"100","the chase status must publish the current best bid");
    assert.equal(bookUpdate.bestAsk,"101","the chase status must publish the current best ask");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.setNow(100);
    const applied=await h.engine.handleOrderUpdate({s:"BTCUSDT",i:1,c:"c1",X:"NEW",z:"0",p:"101"});
    await h.engine.tick();
    assert.equal(applied,true,"a matching NEW private update must become the current order state");
    assert.equal(h.calls.query.length,0,"a fresh private order update must skip the routine REST query");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.setNow(100);
    const applied=await h.engine.handleOrderUpdate({s:"BTCUSDT",i:999,c:"other",X:"NEW",z:"0.8",p:"99"});
    await h.engine.tick();
    assert.equal(applied,false,"a NEW private update for another identity must be ignored");
    assert.equal(h.calls.query.length,1,"an unrelated private update must not suppress the REST backstop");
    assert.equal(h.engine.state().filledQty,0);
    assert.equal(h.engine.state().price,"101");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.setNow(100);
    await h.engine.handleOrderUpdate({s:"BTCUSDT",i:1,c:"c1",X:"NEW",z:"0",p:"101"});
    h.setNow(351);
    await h.engine.tick();
    assert.equal(h.calls.query.length,1,"a private order update older than 250ms must fall back to REST");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.setNow(100);
    await h.engine.handleOrderUpdate({s:"BTCUSDT",i:1,c:"c1",X:"PARTIALLY_FILLED",z:"0.4",p:"101"});
    h.book={...h.book,ask:102};
    await h.engine.tick();
    assert.equal(h.calls.query.length,0,"a WS-backed amendment tick must not query REST");
    assert.equal(h.calls.amend.length,1,"a moved target must still amend from fresh WS-derived state");
    assert.equal(h.calls.amend[0].price,"102");
    assert.equal(h.calls.amend[0].quantity,1,"WS-derived partial fills must not change the existing amendQty calculation");
    assert.equal(h.engine.state().filledQty,0.4);
    assert.equal(h.engine.state().remainingQty,0.6);
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.setNow(100);
    const applied=await h.engine.handleOrderUpdate({s:"BTCUSDT",i:1,c:"c1",X:"FILLED",z:"1",p:"101"});
    assert.equal(applied,true,"a matching FILLED private update must be applied immediately");
    assert.equal(h.calls.query.length,0,"a WebSocket fill must not require REST confirmation");
    assert.equal(h.finishes.length,1);
    assert.equal(h.finishes[0].result,"filled");
    assert.equal(h.finishes[0].filledQty,1);
  }
  {
    const h=harness({amend:async payload=>{h.calls.amend.push(payload);return {...h.order,price:payload.price,status:"CANCELED"};}});
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.book={...h.book,ask:102};
    await h.engine.tick();
    assert.equal(h.calls.submit.length,2,"a crossing GTX amend cancellation must immediately resubmit");
    assert(h.updates.some(item=>item.tone==="error"&&/price crossed/.test(item.message)),"crossing recovery must be visibly distinct");
  }
  {
    let releaseAmend;
    let releaseReplacement;
    let nextOrderId=1;
    const amendPending=new Promise(resolve=>{releaseAmend=resolve;});
    const h=harness({
      submit:async payload=>{
        h.calls.submit.push(payload);
        nextOrderId+=1;
        h.order={...h.order,orderId:nextOrderId,clientOrderId:"c"+nextOrderId,status:"NEW",price:payload.price};
        if(nextOrderId===2) return h.order;
        return new Promise(resolve=>{releaseReplacement=()=>resolve(h.order);});
      },
      amend:async payload=>{h.calls.amend.push(payload);return amendPending;}
    });
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    const amendedOrder={...h.order};
    h.book={...h.book,ask:102};
    const pollTick=h.engine.tick();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls.amend.length,1,"the test must have an amend in flight");
    const reactiveRecovery=h.engine.handleOrderUpdate({s:"BTCUSDT",i:amendedOrder.orderId,c:amendedOrder.clientOrderId,X:"CANCELED",z:"0",p:"101"});
    await new Promise(resolve=>setImmediate(resolve));
    const queriesBeforeRecoveryTick=h.calls.query.length;
    await h.engine.tick();
    assert.equal(h.calls.query.length,queriesBeforeRecoveryTick,"poll ticks must stay idle while a reactive replacement submit is in flight");
    releaseReplacement();
    const reacted=await reactiveRecovery;
    assert.equal(reacted,true,"a matching private cancellation must be handled reactively");
    assert.equal(h.calls.submit.length,2,"the private cancellation must resubmit without another poll tick");
    assert.equal(h.engine.state().orderId,3,"reactive recovery must advance to the replacement order identity");
    releaseAmend({...amendedOrder,status:"CANCELED",price:"102"});
    await pollTick;
    assert.equal(h.calls.submit.length,2,"the stale amend response must not duplicate reactive recovery");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.book={...h.book,ask:102};
    await h.engine.tick();
    h.order={...h.order,status:"CANCELED"};
    await h.engine.tick();
    assert.equal(h.calls.submit.length,2,"polling must remain a crossing-cancellation recovery backstop when no private event arrives");
  }
  {
    let releaseQuery;
    let queryCount=0;
    let nextOrderId=1;
    const h=harness({
      submit:async payload=>{
        h.calls.submit.push(payload);
        nextOrderId+=1;
        h.order={...h.order,orderId:nextOrderId,clientOrderId:"q"+nextOrderId,status:"NEW",price:payload.price};
        return h.order;
      },
      query:async identity=>{
        h.calls.query.push(identity);
        queryCount+=1;
        if(queryCount===1) return h.order;
        return new Promise(resolve=>{releaseQuery=resolve;});
      }
    });
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.book={...h.book,ask:102};
    await h.engine.tick();
    const canceledOrder={...h.order};
    const pollTick=h.engine.tick();
    await new Promise(resolve=>setImmediate(resolve));
    const reacted=await h.engine.handleOrderUpdate({s:"BTCUSDT",i:canceledOrder.orderId,c:canceledOrder.clientOrderId,X:"CANCELED",z:"0",p:"102"});
    assert.equal(reacted,true,"a private cancellation must recover while a status query is in flight");
    releaseQuery({...canceledOrder,status:"NEW"});
    await pollTick;
    assert.equal(h.engine.state().orderId,3,"a stale query response must not overwrite the reactive replacement identity");
    assert.equal(h.calls.submit.length,2,"a stale query response must not trigger duplicate recovery");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    h.book={...h.book,ask:102};
    await h.engine.tick();
    const reacted=await h.engine.handleOrderUpdate({s:"BTCUSDT",i:999,c:"other",X:"CANCELED",z:"0",p:"101"});
    assert.equal(reacted,false,"a private cancellation for another order must be ignored");
    assert.equal(h.calls.submit.length,1,"an unrelated order event must not resubmit the chase");
  }
  {
    const h=harness();
    h.book={...h.book,fresh:false,hasData:true,state:"stale",ageMs:3000};
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    assert.equal(h.calls.submit.length,0,"stale book data must pause before placement");
    assert(h.engine.isActive());
    assert(h.updates.some(item=>item.reason==="stale-book"&&item.tone==="error"));
    h.book={...h.book,fresh:true,ageMs:0};
    await h.engine.tick();
    assert.equal(h.calls.submit.length,1,"the chase must resume automatically on fresh book data");
  }
  {
    const h=harness({waitForTopOfBook:async()=>({symbol:"BTCUSDT",bid:100,ask:101,fresh:true,hasData:true,state:"fresh"})});
    h.book={symbol:"BTCUSDT",bid:null,ask:null,at:null,ageMs:null,fresh:false,hasData:false,state:"waiting"};
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    assert(h.updates.some(item=>item.reason==="waiting-book"&&item.tone==="normal"),"first-tick readiness must show a non-error waiting state");
    assert.equal(h.calls.submit.length,1,"a first book tick arriving during the readiness wait must start the chase immediately");
  }
  {
    const h=harness({waitForTopOfBook:async()=>({symbol:"BTCUSDT",bid:null,ask:null,fresh:false,hasData:false,state:"waiting"})});
    h.book={symbol:"BTCUSDT",bid:null,ask:null,at:null,ageMs:null,fresh:false,hasData:false,state:"waiting"};
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    assert.equal(h.calls.submit.length,0);
    assert(h.updates.some(item=>item.reason==="missing-book"&&/unavailable/.test(item.message)),"a genuine first-tick timeout must be distinct from stale data");
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,maxDurationMs:3000,meta:{side:"SELL"}});
    h.order={...h.order,status:"PARTIALLY_FILLED",executedQty:"0.4"};
    h.setNow(1000);
    await h.engine.tick();
    h.setNow(3001);
    await h.engine.tick();
    assert.equal(h.calls.cancel.length,1,"the three-second cap must cancel the remainder");
    assert.equal(h.calls.verify.length,1,"expiry unlock requires confirmed absence from open orders");
    assert.equal(h.finishes[0].filledQty,0.4);
    assert.equal(h.finishes[0].remainingQty,0.6);
  }
  {
    const h=harness();
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    await assert.rejects(()=>h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}}),/already active/,"one engine instance must enforce a single active row chase");
  }
  {
    let confirms=false;
    const h=harness({verifyCanceled:async identity=>{h.calls.verify.push(identity);return confirms;}});
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    await h.engine.cancel("cancel requested");
    assert(h.engine.isActive(),"a row chase lock must remain held while cancel is unconfirmed");
    assert.equal(h.finishes.length,0);
    confirms=true;
    await h.engine.cancel("cancel requested");
    assert(!h.engine.isActive(),"the row chase lock may release after snapshot confirmation");
  }
  {
    let confirms=false;
    const h=harness({verifyCanceled:async identity=>{h.calls.verify.push(identity);return confirms;}});
    await h.engine.start({symbol:"BTCUSDT",quantity:1,meta:{side:"SELL"}});
    await h.engine.cancel("cancel requested");
    await h.engine.tick();
    assert(h.engine.isActive(),"a scheduled tick must keep retrying cancel verification instead of finishing from order status alone");
    assert.equal(h.finishes.length,0,"an unconfirmed cancel must not reach onFinish");
    assert.equal(h.calls.verify.length,2,"the pending cancel intent must be reverified on the next tick");
    confirms=true;
    await h.engine.tick();
    assert(!h.engine.isActive(),"a pending cancel may finish after a later authoritative confirmation");
  }
  console.log("Shared chase engine tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
