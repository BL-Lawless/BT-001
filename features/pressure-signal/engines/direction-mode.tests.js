"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..","..");
function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,AbortController};
  context.window=context;context.document={querySelector:()=>null};
  vm.createContext(context);
  for(const file of ["features/pressure-signal/engines/registry.js","features/pressure-signal/engines/engine-a.js","features/pressure-signal/engines/engine-b.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }
  return context;
}
function facts({permission=true,direction="LONG",setupDirection="LONG"}={}){
  return {
    fresh:true,profile:{trigger:"3m",primary:"5m",chaseAtr:1.35,minNetRr:1.35},
    directionalPermission:{permission,direction,score:permission?84:34,automaticDirection:direction==="LONG"?"SHORT":"LONG",opposingEvidence:permission?[]:[`Automatic evidence favors ${direction==="LONG"?"SHORT":"LONG"}`],reason:permission?`${direction} selected thesis is supported`:`${direction} selected thesis is unsupported`,breakdown:{}},
    setup:{direction:setupDirection,valid:true,identity:`fixture-${setupDirection}`,family:"Structural retest",tf:"5m",interacted:true,interactionTime:120,reactionConfirmed:true,invalidated:false,repeatedTests:1,nonEma:true},
    setupComponents:{structuralLocation:90,regimeAlignment:86,eventLevelQuality:84,invalidationTargetGeometry:82,volatilitySuitability:85},
    trigger:{microstructureShift:true,shiftTime:180,displacementQuality:88,wickHeavy:false,flow:{effective:true,ineffectiveHighVolume:false,priceProgressAtr:.72,evidence:["Effective directional flow"]},participation:{state:"STRONG",score:88,credibleAbsorption:false},retestHeld:true,qualifiedFollowThrough:false,freshnessScore:92,evidence:["Closed structure shift"]},
    opposition:{effective:false,evidence:[]},volatility:{regime:"Expanding/controlled",controlledAcceptance:true},geometry:{netRr:2.1,viable:true},current:{originDistanceAtr:.22,chased:false,adverseEvidence:10}
  };
}
function rows(tf,count=260,side=-1){
  const seconds={"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400}[tf],start=1700000000,output=[];let price=40000;
  for(let index=0;index<count;index+=1){const move=side*(3+(index%5===0?2:0))+Math.sin(index/7)*.64,open=price,close=open+move,high=Math.max(open,close)+5,low=Math.min(open,close)-5,volume=100+(index%11)*4;output.push({time:start+index*seconds,openTime:(start+index*seconds)*1000,closeTime:(start+(index+1)*seconds)*1000-1,open,high,low,close,volume,quoteVolume:volume*close,tradeCount:80+index%17,takerBuyBase:volume*(side>0?.57:.43),final:true});price=close;}
  return output;
}
function snapshot(){const timeframes=["1m","3m","5m","15m","1h","4h","1d"],closedByTf=Object.fromEntries(timeframes.map(tf=>[tf,rows(tf)]));return {symbol:"BTCUSDT",version:1,signature:"manual-mode-fixed-snapshot",currentPrice:closedByTf["1m"].at(-1).close,closedByTf,rowsByTf:closedByTf,maByTf:{},structureByTf:{},freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};}
function output(direction){return {direction,confidence:70,entryState:"NO SETUP",setupIdentity:null,setupFamily:null,setupTimeframe:null,setupQuality:"C",triggerQuality:"C",currentEntryQuality:"C",entryVerdict:"WAIT",reasons:[`${direction} result`],exclusions:[],triggerIdentity:null,triggerEvidence:[],dataStatus:"sufficient",tone:"gray"};}
function delayedEngine(id){const pending=[],state={cache:new Map()};return {pending,engine:{id,displayName:`Delayed ${id}`,version:"test",status:"available",state,getRequirements:()=>({items:[]}),evaluate:context=>new Promise(resolve=>pending.push({context,resolve})),diagnostics:()=>({cacheCount:state.cache.size})}};}

const run=(async()=>{
  const context=runtime();

  // Signal A resolves the requested thesis before any setup is selected.
  const automaticBias={direction:"SHORT",side:-1,confidence:73,permission:true,stacks:[]};
  const autoA=context.resolveSignalADirectionMode({directionMode:"AUTO",automaticBias});
  const unsupportedLongA=context.resolveSignalADirectionMode({directionMode:"LONG",automaticBias,manualThesis:{direction:"LONG",status:"ADVERSE",confidence:61,missing:false}});
  const validLongA=context.resolveSignalADirectionMode({directionMode:"LONG",automaticBias,manualThesis:{direction:"LONG",status:"SUPPORTIVE",confidence:68,missing:false}});
  assert.equal(autoA.direction,"SHORT");
  assert.equal(unsupportedLongA.direction,"LONG");assert.equal(unsupportedLongA.permission,false);assert.equal(unsupportedLongA.opposingAutomaticBias,true);
  assert.equal(validLongA.direction,"LONG");assert.equal(validLongA.permission,true);
  let unsupportedSetupCalled=false;
  const noSetupLongA=context.evaluateSignalADirectionalThesis({directionMode:"LONG",automaticBias,manualThesis:{direction:"LONG",status:"ADVERSE",confidence:61,missing:false},evaluateSelectedSetup:()=>{unsupportedSetupCalled=true;return {state:"READY",direction:"SHORT"};}});
  assert.equal(noSetupLongA.bias.direction,"LONG");assert.equal(noSetupLongA.entryDecision.state,"BIAS CONFIRMED");assert.equal(noSetupLongA.entryDecision.direction,"LONG");assert.equal(unsupportedSetupCalled,false);
  const activeLongA=context.evaluateSignalADirectionalThesis({directionMode:"LONG",automaticBias,manualThesis:{direction:"LONG",status:"SUPPORTIVE",confidence:68,missing:false},evaluateSelectedSetup:selected=>({state:"READY",direction:selected.direction,family:"LONG fixture"})});
  assert.equal(activeLongA.bias.direction,"LONG");assert.equal(activeLongA.entryDecision.state,"READY");assert.equal(activeLongA.entryDecision.direction,"LONG");
  let receivedA=null;context.createSignalEngineA().evaluate({directionMode:"LONG",horizonId:"quick",snapshot:{signature:"a"},evaluateSignalA:contract=>{receivedA=contract;return output("LONG");}});
  assert.equal(receivedA.directionMode,"LONG");assert.equal(receivedA.horizonId,"quick");

  // Signal B keeps manual direction through no-setup, active-setup, and opposite-setup cases.
  const engineB=context.createSignalEngineB();
  const noSetupLongB=engineB.evaluateFacts(facts({permission:false,direction:"LONG"}),{horizonId:"quick",directionMode:"LONG"});
  assert.equal(noSetupLongB.direction,"LONG");assert.equal(noSetupLongB.entryState,"NO SETUP");assert.equal(noSetupLongB.entryVerdict,"WAIT");
  const activeLongB=engineB.evaluateFacts(facts(),{horizonId:"quick",directionMode:"LONG"});
  assert.equal(activeLongB.direction,"LONG");assert.equal(activeLongB.entryState,"TRIGGER ACTIVE");assert.equal(activeLongB.entryVerdict,"READY LONG");
  const oppositeSetupB=engineB.evaluateFacts(facts({setupDirection:"SHORT"}),{horizonId:"quick",directionMode:"LONG"});
  assert.equal(oppositeSetupB.direction,"LONG");assert.equal(oppositeSetupB.entryState,"NO SETUP");assert.equal(oppositeSetupB.setupIdentity,null);

  // The same fixed snapshot has independent AUTO/LONG fingerprints; AUTO SHORT cannot leak into LONG.
  const fixed=snapshot(),autoB=engineB.evaluate({snapshot:fixed,horizonId:"quick",directionMode:"AUTO",publicationGeneration:1}),manualLongB=engineB.evaluate({snapshot:fixed,horizonId:"quick",directionMode:"LONG",publicationGeneration:2});
  assert.equal(autoB.direction,"SHORT");assert.equal(manualLongB.direction,"LONG");assert.notStrictEqual(autoB,manualLongB);assert.equal(engineB.diagnostics().cacheCounts.fingerprints,2);

  // Late AUTO and LONG completions are rejected after AUTO -> LONG -> SHORT for both engines.
  for(const id of ["A","B"]){
    const delayed=delayedEngine(id),registry=context.createSignalEngineRegistry();registry.register(delayed.engine);registry.activate(id);
    const auto=registry.evaluate({directionMode:"AUTO",publicationGeneration:11}),long=registry.evaluate({directionMode:"LONG",publicationGeneration:12}),short=registry.evaluate({directionMode:"SHORT",publicationGeneration:13});
    delayed.pending[2].resolve(output("SHORT"));delayed.pending[1].resolve(output("LONG"));delayed.pending[0].resolve(output("SHORT"));
    const [lateAuto,lateLong,currentShort]=await Promise.all([auto,long,short]),expected={directionMode:"SHORT",publicationGeneration:13};
    assert.equal(registry.accepts(lateAuto,expected),false,`${id} accepted late AUTO`);assert.equal(registry.accepts(lateLong,expected),false,`${id} accepted late LONG`);assert.equal(registry.accepts(currentShort,expected),true,`${id} rejected current SHORT`);
    assert.equal(currentShort.directionMode,"SHORT");assert.equal(currentShort.publicationGeneration,13);
  }

  // Integration guards cover fingerprints/context, invalidation, visible metadata, and Action isolation.
  const source=fs.readFileSync(path.join(root,"features/pressure-signal/index.js"),"utf8"),windows=fs.readFileSync(path.join(root,"features/pressure-signal/ui/windows.js"),"utf8");
  const directionBody=source.slice(source.indexOf("function setStoredDirection"),source.indexOf("function cycleStoredDirection37"));
  const contextBody=source.slice(source.indexOf("function signalContextKey37"),source.indexOf("function presentationContextKey37"));
  assert(contextBody.includes("state.direction"));assert(source.includes("const fingerprint=[signalContextKey37()"));
  assert(directionBody.includes("invalidatePublishedContext37")&&directionBody.includes("scheduleToolbarSignalRefresh37(true)"));
  assert(!/actionState|scheduleActionRefresh37|positionEngine|updatePosition/.test(directionBody),"direction change mutated Action");
  assert(source.includes("directionMode:state.direction")&&source.includes("evaluateToolbarPressureSignal37(state.horizon,directionMode)"));
  assert(source.includes("button.signalDirectionMode===displayed.mode")&&source.includes("state.entry.dataset.signalDirectionMode=displayed.mode"));
  assert(source.includes("`Direction mode: ${displayed.mode}`")&&windows.includes("leftMode===rightMode")&&windows.includes("button.dataset.signalDirectionMode===displayed.mode"));
  assert(source.includes("[generation,horizonId,mode,direction")&&source.includes("signalEngineRegistry.accepts(output,{directionMode:state.direction,publicationGeneration:generation})"));

  const cases={signalAManualThesis:true,signalANoSetup:true,signalAValidSetup:true,signalBNoSetup:true,signalBValidSetup:true,oppositeSetupRejected:true,modeFingerprintIsolation:true,rapidSwitchA:true,rapidSwitchB:true,tooltipDetailsModeIsolation:true,actionInvariant:true};
  console.log("direction mode tests: PASS",cases);return cases;
})();
module.exports=run;
if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
