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
  let book={symbol:"BTCUSDT",bid:100,ask:101,at:0,ageMs:0,fresh:true,staleAfterMs:2500};
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
