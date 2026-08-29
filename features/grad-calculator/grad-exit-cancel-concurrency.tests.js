"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const source=fs.readFileSync(path.join(__dirname,"presentation","gradCalculatorModule.js"),"utf8");
const start=source.indexOf("async function executeSection");
const end=source.indexOf("async function confirmPreflight",start);
assert(start>=0&&end>start,"executeSection must remain testable as an isolated send boundary");

(async()=>{
  const calls=[];
  const pending=[];
  const context={
    ORDER_URL:"/fapi/v1/order",
    currentSymbol:()=>"BTCUSDT",
    signedWrite:(url,method,payload)=>{
      calls.push({url,method,payload});
      return new Promise((resolve,reject)=>pending.push({resolve,reject}));
    },
    Promise,Object,Array,String,Number,Math,Error
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);

  const execution=context.executeSection("exit",[],{
    exitFullRecreate:true,
    liveExitOrders:[
      {orderId:101,clientOrderId:"GR_X_1"},
      {orderId:102,clientOrderId:"GR_X_2"},
      {orderId:103,clientOrderId:"GR_X_3"},
      {algoId:999,clientAlgoId:"GR_P_1"}
    ]
  });

  assert.equal(calls.length,3,"all tracked GR LIMIT exit cancellations must start concurrently");
  assert(calls.every(call=>call.url===context.ORDER_URL&&call.method==="DELETE"),"exit recreation must use only the regular order cancellation endpoint");
  assert.deepEqual(calls.map(call=>call.payload.orderId),["101","102","103"],"only exit orders carrying regular orderIds may enter the cancellation batch");

  let finished=false;
  execution.then(()=>{finished=true;},()=>{finished=true;});
  pending[0].resolve({orderId:101,status:"CANCELED"});
  pending[1].reject(new Error("cancel denied"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(finished,false,"GR must wait for every concurrent cancellation before continuing");

  pending[2].resolve({orderId:103,status:"CANCELED"});
  await assert.rejects(execution,error=>/cancelled 2 of 3/.test(error.message)&&/1 failed/.test(error.message)&&/New exit orders were not placed/.test(error.message)&&/order 102: cancel denied/.test(error.message),"a partial cancellation failure must identify the failed order and abort replacement placement");

  console.log("GR exit cancellation concurrency tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
