"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
  const slice=(start,end)=>calculator.slice(calculator.indexOf(start),calculator.indexOf(end,calculator.indexOf(start))).trim();

  const cancelSource=slice("async function cancelRowChaseOriginalAfterFill","function markRowChaseOriginalCancelled");
  const cancelCalls=[];
  const cancelContext={
    signedOrderWrite:async(method,params)=>{cancelCalls.push({method,params});return {status:"CANCELED",orderId:params.orderId};},
    rowChaseIdentityParams:identity=>({symbol:identity.symbol,orderId:String(identity.orderId)}),
    toUpper:value=>String(value||"").toUpperCase(),
    setTimeout:callback=>{callback();return 1;},Promise
  };
  vm.createContext(cancelContext);
  vm.runInContext(cancelSource,cancelContext);
  const originalContext={originalOrderIdentity:{symbol:"BTCUSDT",orderId:55,clientOrderId:"original"}};
  const cancelled=await cancelContext.cancelRowChaseOriginalAfterFill(originalContext);
  assert.equal(cancelled.cancelled,true,"a chase-first fill must confirm the original order cancellation");
  assert.deepEqual(cancelCalls.map(call=>call.method),["DELETE"],"the first original-order action must be an immediate DELETE");

  let originalFirstCancel=null;
  const watchedContext={originalOrderIdentity:originalContext.originalOrderIdentity,originalFilledFirst:false,originalOrderLastStatus:""};
  const watchContext={
    rowChaseOriginalWatchGeneration:0,rowChaseOriginalWatchTimer:null,rowChaseOriginalWatchBusy:false,
    activeRowChase:watchedContext,ROW_CHASE_ORIGINAL_POLL_MS:500,
    clearTimeout:()=>{},setTimeout:()=>1,Math,Number,
    signedOrderWrite:async()=>({status:"FILLED"}),rowChaseIdentityParams:identity=>identity,
    toUpper:value=>String(value||"").toUpperCase(),
    ensureRowChaseEngine:()=>({cancel:async(reason,extra)=>{originalFirstCancel={reason,extra};},isActive:()=>false})
  };
  vm.createContext(watchContext);
  vm.runInContext(slice("function stopRowChaseOriginalWatch","async function cancelRowChaseOriginalAfterFill"),watchContext);
  await watchContext.pollRowChaseOriginalOrder(watchedContext,0);
  assert.equal(watchedContext.originalFilledFirst,true,"the original-order watcher must detect an original-first fill");
  assert.equal(originalFirstCancel.extra.result,"original-filled","an original-first fill must immediately cancel the chase with a distinct terminal result");

  let capturedOptions=null;
  let cancelOriginalCalls=0;
  let markedCancelled=0;
  let unlockCalls=0;
  const row={isConnected:true};
  const engineContext={
    rowChaseEngine:null,
    activeRowChase:null,
    window:{CalculatorChaseEngine:{create:options=>{capturedOptions=options;return {isActive:()=>false};}}},
    stopRowChaseOriginalWatch:()=>{},
    cancelRowChaseOriginalAfterFill:async()=>{cancelOriginalCalls++;return {required:true,cancelled:true,response:{status:"CANCELED"}};},
    markRowChaseOriginalCancelled:()=>{markedCancelled++;},
    setRowLocked:()=>{unlockCalls++;},refreshRowChaseButtons:()=>{},setRowChaseStatus:()=>{},
    beginRowChaseOrderSuppression:()=>{},readBinance:async()=>{},
    normalizedChasePrice:()=>"100",normalizeLevelComparable:value=>String(value),
    freshRowChaseClientId:()=>"chase",fmtLot:value=>String(value),signedOrderWrite:async()=>({}),
    binanceWriteConfirmed:()=>true,applyRowChaseWriteSuccess:()=>{},orderKeyFromMeta:()=>"",triggerConfirmedOrderBlink:()=>{},
    rowChaseIdentityParams:identity=>identity,readOpenOrdersSnapshot:async()=>({normalOrders:[]}),findNormalOrderByIdentity:()=>null,
    Promise,String
  };
  vm.createContext(engineContext);
  vm.runInContext(slice("function ensureRowChaseEngine","async function toggleRowChase"),engineContext);
  engineContext.ensureRowChaseEngine();

  engineContext.activeRowChase={row,wasLocked:false,symbol:"BTCUSDT",originalOrderIdentity:originalContext.originalOrderIdentity,originalFilledFirst:false};
  await capturedOptions.onFinish({result:"expired",message:"expired",tone:"normal",orderId:77,clientOrderId:"chase"});
  assert.equal(cancelOriginalCalls,0,"expiry must leave the original order completely untouched");
  assert.equal(markedCancelled,0,"expiry must not grey or retire the original row");
  assert.equal(unlockCalls,1,"expiry must simply restore the original row's prior lock state");

  engineContext.activeRowChase={row,wasLocked:false,symbol:"BTCUSDT",originalOrderIdentity:originalContext.originalOrderIdentity,originalFilledFirst:false};
  await capturedOptions.onFinish({result:"filled",message:"filled",tone:"normal",orderId:78,clientOrderId:"chase-2"});
  assert.equal(cancelOriginalCalls,1,"a chase fill must immediately invoke original-order cancellation");
  assert.equal(markedCancelled,1,"a confirmed cancellation must grey the original Calc row");

  const cleanupSource=slice("function clearRowChaseCancelledRowsAfterRead","function pruneMappedPartialStopRows");
  const cancelledRow={dataset:{rowChaseOriginalCancelled:"1"},removed:false,remove(){this.removed=true;}};
  const failedReadRow={dataset:{rowChaseOriginalCancelled:"1"},removed:false,remove(){this.removed=true;}};
  let activeRows={calcModuleEntryRows:[cancelledRow],calcModuleExitRows:[]};
  const cleanupContext={
    rows:id=>activeRows[id]||[],
    isRowChaseOriginalCancelled:row=>row&&row.dataset&&row.dataset.rowChaseOriginalCancelled==="1",
    clearBinanceMetaOnRow:row=>{delete row.dataset.rowChaseOriginalCancelled;},
    refreshEntryRowNumbers:()=>{},refreshExitRowNumbers:()=>{},readEntry:()=>({avg:null})
  };
  vm.createContext(cleanupContext);
  vm.runInContext(cleanupSource,cleanupContext);
  assert.equal(cleanupContext.clearRowChaseCancelledRowsAfterRead({normalFetchError:null}),1,"the next successful Calc reconciliation must remove the grey confirmation row");
  assert.equal(cancelledRow.removed,true);
  activeRows={calcModuleEntryRows:[failedReadRow],calcModuleExitRows:[]};
  assert.equal(cleanupContext.clearRowChaseCancelledRowsAfterRead({normalFetchError:new Error("read failed")}),0,"a failed Binance read must retain the confirmation until a later verified reconciliation");
  assert.equal(failedReadRow.removed,false);
  assert(calculator.includes("clearRowChaseCancelledRowsAfterRead(snapshot);"),"the normal readBinance mapping cycle must invoke grey-row cleanup");

  console.log("row chase original cleanup tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
