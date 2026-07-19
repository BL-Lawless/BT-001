"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const root=path.resolve(__dirname,"..","..");
  const context={console,Math,Number,Object,Array,Set,Map,Date,Promise,JSON,URL};
  context.window=context;
  context.BT001_PERFORMANCE_DIAGNOSTICS={};
  vm.createContext(context);
  for(const file of ["features/api/shared-position-fact.module.js","features/api/binance-user-stream.module.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }

  const ownerCases=context.createSharedPositionFactOwner.runSelfTests();
  for(const [name,passed] of Object.entries(ownerCases))assert.equal(passed,true,name);
  const streamResult=await context.createBinanceUserDataStream.runSelfTests();
  assert.equal(streamResult.passed,true,JSON.stringify(streamResult.cases,null,2));

  const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
  const calculator=fs.readFileSync(path.join(root,"features/calculator/presentation/calculatorModule.js"),"utf8");
  const grad=fs.readFileSync(path.join(root,"features/grad-calculator/presentation/gradCalculatorModule.js"),"utf8");
  const pressure=fs.readFileSync(path.join(root,"features/pressure-signal/index.js"),"utf8");
  assert(main.includes("SHARED_POSITION_OWNER.ingestStreamAccountUpdate"),"ACCOUNT_UPDATE must enter the shared owner immediately");
  assert(main.includes("expectedPosition=SHARED_POSITION_OWNER.captureExpectation()")&&main.includes("verifyAgainstStream"),"REST verification must carry the stream expectation");
  assert(main.includes("schedulePositionVerificationRetry")&&main.includes("restMismatchCount"),"REST mismatches need bounded retry diagnostics");
  assert(main.includes('"wss://fstream.binance.com/private/ws"'),"production user stream must use Binance's current /private endpoint");
  assert(main.includes("lastSig21=sharedPositionSig21();"),"private reconciliation signatures must remain sourced from the shared owner");
  assert(main.includes("SHARED_POSITION_OWNER.isGuardCurrent(reconstructionGuard)"),"reconstruction must have a current-generation guard");
  assert(main.includes("reconstructionPending:reconstructionNeeded")&&!main.includes("const loaded = await loadActiveParentReconstruction"),"trade reconstruction must remain detached from the position-fact path");
  assert(calculator.includes('source:"calculator-positionRisk"')&&calculator.includes("sharedOwner.ingestRestRisk"),"Calculator positionRisk must feed the shared owner");
  assert(calculator.includes("reconcileOpenPositionRow(next);")&&!calculator.includes("},250);\n  }\n  function markBinanceRowNeedsReview"),"Calculator shared position reconciliation must be immediate");
  assert(grad.includes('window.addEventListener("v13:open-position-change",applySharedPosition'),"GR must consume the immediate shared fact event");
  assert(grad.includes('source:"gr-positionRisk"')&&grad.includes("sharedOwner.ingestRestRisk"),"GR positionRisk must feed and consume the shared owner");
  assert(main.includes('onDraw:detail=>scheduleAccountChartDraw'),"shared update bursts must use the single RAF draw scheduler");
  assert(main.includes('window.addEventListener("v13:open-position-change",event =>')&&main.includes("maybeRefreshLivePreview();"),"Waterfall must consume the shared position event");
  assert(pressure.includes('window.addEventListener("v13:open-position-change",reconcilePresentationContext37'),"Action/Position Management must consume the shared position event");

  console.log("shared position fact tests: PASS",ownerCases,streamResult.cases);
})().catch(error=>{console.error(error);process.exitCode=1;});
