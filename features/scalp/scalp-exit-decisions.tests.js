"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");

function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError};
  context.window=context;
  vm.createContext(context);
  for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/exit-decisions.js"]){
    vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});
  }
  return context.__BT001_SCALP_BUILD__;
}

function plain(value){return JSON.parse(JSON.stringify(value));}

async function run(){
  const build=runtime(),decisions=build.exitDecisions,tranches=build.tranches,cases={};

  const long={direction:"LONG",rankBoostEnabled:true,rankBoostThreshold:90,rankBoostPoints:10,triggerRank:null};
  const beforeRank=JSON.stringify(long),boosted=plain(decisions.rankBoost({tranche:long,eventRank:91,normalTp:110.05,tickSize:.1}));
  assert.deepEqual(boosted,{triggerRank:91,applied:true,normalTp:110.05,tpPrice:120.1});
  assert.equal(JSON.stringify(long),beforeRank,"rankBoost must not mutate the tranche");
  assert.equal(decisions.rankBoost({tranche:long,eventRank:90,normalTp:110.05,tickSize:.1}).applied,false,"rank must strictly exceed the threshold");
  const shortBoost=decisions.rankBoost({tranche:{...long,direction:"SHORT"},eventRank:95,normalTp:90.05,tickSize:.1});
  assert.equal(shortBoost.tpPrice,80);
  cases.rankBoostIsPureStrictAndDirectionAware=true;

  const lockTranche={direction:"LONG",entryPrice:100,partialTpPrice:110,remainingQty:.01,filledQty:.01,entryCommission:.0004,profitLockEnabled:true,lockThresholdPct:50,lockPortionPct:50,profitLockTriggered:false,profitLockPending:false,status:"ACTIVE"};
  const beforeLock=JSON.stringify(lockTranche),filters={tickSize:.1,stepSize:.001};
  assert.equal(decisions.profitLockLevel({tranche:lockTranche,tickSize:filters.tickSize}),105);
  assert.equal(decisions.profitLockQuantity({tranche:lockTranche,filters}),.005);
  assert.equal(decisions.profitLockReached({tranche:lockTranche,price:104.9,tickSize:filters.tickSize}),false);
  assert.equal(decisions.profitLockReached({tranche:lockTranche,price:105,tickSize:filters.tickSize}),true);
  assert.deepEqual(plain(decisions.profitLockDecision({tranche:lockTranche,price:105,filters})),{reached:true,level:105,quantity:.005});
  assert.equal(JSON.stringify(lockTranche),beforeLock,"profit-lock decisions must not mutate the tranche");
  cases.profitLockMathIsPureAndReturnBased=true;

  const longTie=plain(decisions.evaluateProtectionCandle({tranche:{direction:"LONG",pslPrice:95,partialTpPrice:105},candle:{open:100,high:106,low:94,close:101}}));
  assert.deepEqual(longTie,{resolved:true,reason:"PSL",exitPrice:95,pslTouched:true,tpTouched:true,tieBreak:"PSL_FIRST"});
  const shortTie=plain(decisions.evaluateProtectionCandle({tranche:{direction:"SHORT",pslPrice:105,partialTpPrice:95},candle:{open:100,high:106,low:94,close:99}}));
  assert.deepEqual(shortTie,{resolved:true,reason:"PSL",exitPrice:105,pslTouched:true,tpTouched:true,tieBreak:"PSL_FIRST"});
  const tpOnly=plain(decisions.evaluateProtectionCandle({tranche:{direction:"LONG",pslPrice:95,partialTpPrice:105},candle:{high:106,low:99}}));
  assert.deepEqual(tpOnly,{resolved:true,reason:"PARTIAL_TP",exitPrice:105,pslTouched:false,tpTouched:true,tieBreak:null});
  assert.equal(decisions.evaluateProtectionCandle({tranche:{direction:"LONG",pslPrice:95,partialTpPrice:105},candle:{high:104,low:96}}).resolved,false);
  cases.candleProtectionUsesPslFirstTieBreak=true;

  const book=tranches.create();tranches.add(book,{trancheId:"L1",direction:"LONG",remainingQty:.01,status:"ACTIVE"});
  assert.equal(tranches.canAdd(book,"LONG",1),false);assert.equal(tranches.canAdd(book,"SHORT",1),true);
  cases.perDirectionConcurrencyRemainsPureAndUnchanged=true;

  const machine=fs.readFileSync(path.join(repo,"features/scalp/state-machine.js"),"utf8"),html=fs.readFileSync(path.join(repo,"index.html"),"utf8");
  assert(machine.includes("decisions.rankBoost({tranche")&&machine.includes("decisions.profitLockLevel({tranche")&&machine.includes("decisions.profitLockQuantity({tranche")&&machine.includes("decisions.profitLockReached({tranche"));
  assert(html.indexOf("features/scalp/exit-decisions.js")>html.indexOf("features/scalp/tranche-book.js")&&html.indexOf("features/scalp/exit-decisions.js")<html.indexOf("features/scalp/state-machine.js"));
  cases.liveStateMachineConsumesSharedPureDecisions=true;

  console.log("SCALP exit decision tests: PASS",cases);
  return cases;
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
