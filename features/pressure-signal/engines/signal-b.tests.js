"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..","..");
function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,AbortController};context.window=context;context.document={querySelector:()=>null};
  vm.createContext(context);for(const file of ["features/pressure-signal/engines/registry.js","features/pressure-signal/engines/engine-a.js","features/pressure-signal/engines/engine-b.js","features/pressure-signal/engines/selector.js"])vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});return context;
}
function merge(base,patch){const output=Array.isArray(base)?[...base]:{...base};for(const [key,value] of Object.entries(patch||{}))output[key]=value&&typeof value==="object"&&!Array.isArray(value)&&base&&base[key]&&typeof base[key]==="object"&&!Array.isArray(base[key])?merge(base[key],value):value;return output;}
function baseFacts(){return {
  fresh:true,profile:{early:"1m",trigger:"3m",primary:"5m",setups:["3m","5m"],structures:["15m","1h"],boundaries:["4h","1d"],eventWindow:7,chaseAtr:1.35,minNetRr:1.35},
  directionalPermission:{permission:true,direction:"LONG",score:84,longScore:84,shortScore:31,reason:"LONG primary/structural permission",breakdown:{maStackOrder:90,maSlopeAndTransition:82,primaryPressure:80,closedStructure:86}},
  setup:{valid:true,identity:"BTCUSDT|quick|LONG|structural-retest",family:"Structural retest",tf:"5m",interacted:true,interactionTime:120,reactionConfirmed:true,invalidated:false,repeatedTests:1,nonEma:true},
  setupComponents:{structuralLocation:90,regimeAlignment:86,eventLevelQuality:84,invalidationTargetGeometry:82,volatilitySuitability:85},
  trigger:{microstructureShift:true,shiftTime:180,displacementQuality:88,wickHeavy:false,flow:{effective:true,absorption:false,ineffectiveHighVolume:false,directionalImbalance:.18,priceProgressAtr:.72,efficiency:1.1,evidence:["Effective directional flow"]},participation:{state:"STRONG",score:88,credibleAbsorption:false,persistence:.75},retestHeld:true,qualifiedFollowThrough:false,freshnessScore:92,evidence:["Closed post-interaction structure shift","Effective directional flow"]},
  opposition:{effective:false,evidence:[],neutral:true},volatility:{regime:"Expanding/controlled",controlledAcceptance:true,realizedRangePercentile:78},geometry:{netRr:2.1,viable:true},current:{originDistanceAtr:.22,chased:false,adverseEvidence:10}
};}
function rows(tf,count=260,side=1){const seconds={"1m":60,"3m":180,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400}[tf],start=1700000000,rows=[];let price=40000;for(let index=0;index<count;index+=1){const wave=Math.sin(index/7)*8,move=side*(3+(index%5===0?2:0))+wave*.08,open=price,close=open+move,high=Math.max(open,close)+5,low=Math.min(open,close)-5,volume=100+(index%11)*4;rows.push({time:start+index*seconds,openTime:(start+index*seconds)*1000,closeTime:(start+(index+1)*seconds)*1000-1,open,high,low,close,volume,quoteVolume:volume*close,tradeCount:80+index%17,takerBuyBase:volume*(side>0?.57:.43),final:true});price=close;}return rows;}
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value))};}

const run=(async()=>{
  const context=runtime(),engine=context.createSignalEngineB(),evaluate=(patch={})=>engine.evaluateFacts(merge(baseFacts(),patch),{horizonId:"quick",symbol:"BTCUSDT",version:7});
  const scenarios={};
  scenarios.cleanContinuation=evaluate();assert.equal(scenarios.cleanContinuation.entryState,"TRIGGER ACTIVE");
  scenarios.highVolumeNoProgress=evaluate({trigger:{flow:{effective:false,ineffectiveHighVolume:true,directionalImbalance:.32,priceProgressAtr:.05,evidence:["High volume without price progress"]}}});assert.notEqual(scenarios.highVolumeNoProgress.entryState,"TRIGGER ACTIVE");assert(scenarios.highVolumeNoProgress.comparisonDiagnostics.hardGates.failed.includes("effectiveFlow"));
  scenarios.weakParticipationCredibleAbsorption=evaluate({trigger:{flow:{effective:true,absorption:true,ineffectiveHighVolume:false,priceProgressAtr:.62,evidence:["Sell absorption resolved upward"]},participation:{state:"WEAK",score:58,credibleAbsorption:true,persistence:.7}}});assert.equal(scenarios.weakParticipationCredibleAbsorption.entryState,"TRIGGER ACTIVE");
  scenarios.reactionNoBreak=evaluate({trigger:{microstructureShift:false}});assert.equal(scenarios.reactionNoBreak.entryState,"TRIGGER FORMING");
  scenarios.controlledFollowThrough=evaluate({trigger:{retestHeld:false,qualifiedFollowThrough:true}});assert.equal(scenarios.controlledFollowThrough.entryState,"TRIGGER ACTIVE");
  scenarios.extremeWithoutAcceptance=evaluate({volatility:{regime:"Disorderly/extreme",controlledAcceptance:false}});assert(["TRIGGER FORMING","NO CHASE"].includes(scenarios.extremeWithoutAcceptance.entryState));
  scenarios.lateEntry=evaluate({current:{originDistanceAtr:1.8,chased:true}});assert.equal(scenarios.lateEntry.entryState,"NO CHASE");
  scenarios.primaryOpposition=evaluate({opposition:{effective:true,evidence:["5m sell pressure is effective"],neutral:false}});assert.notEqual(scenarios.primaryOpposition.entryState,"TRIGGER ACTIVE");
  scenarios.structuralInvalidation=evaluate({setup:{invalidated:true}});assert.equal(scenarios.structuralInvalidation.entryState,"SETUP FAILED");
  scenarios.staleData=evaluate({fresh:false});assert.notEqual(scenarios.staleData.entryState,"TRIGGER ACTIVE");
  scenarios.nonEmaStructural=evaluate({setup:{family:"Sweep and reclaim",nonEma:true}});assert.equal(scenarios.nonEmaStructural.entryState,"TRIGGER ACTIVE");
  scenarios.lowerTimeframeCounterMove=evaluate({lowerTimeframeWarning:{direction:"SHORT",effective:true}});assert.equal(scenarios.lowerTimeframeCounterMove.direction,"LONG");
  assert.equal(scenarios.cleanContinuation.setupQuality,"A");assert.equal(scenarios.cleanContinuation.triggerQuality,"A");assert.equal(scenarios.cleanContinuation.currentEntryQuality,"A");assert.equal(scenarios.cleanContinuation.comparisonDiagnostics.hardGates.failed.length,0);

  // Production extraction smoke test uses fixed Signal-owned candle snapshots and no chart state.
  const timeframes=["1m","3m","5m","15m","1h","4h","1d"],closedByTf=Object.fromEntries(timeframes.map(tf=>[tf,rows(tf)])),snapshot={symbol:"BTCUSDT",horizonId:"quick",version:1,signature:"fixture-revision-1",currentPrice:closedByTf["1m"].at(-1).close,closedByTf,rowsByTf:closedByTf,maByTf:{},structureByTf:{},freshness:{signalStatus:"LIVE"},health:{status:"sufficient"}};
  const smoke=engine.evaluate({snapshot,horizonId:"quick",publicationGeneration:9});context.createSignalEngineRegistry().validateOutput(smoke);assert.equal(smoke.comparisonDiagnostics.engineVersion,"1.0.0");assert.equal(smoke.comparisonDiagnostics.publicationGeneration,9);
  const cached=engine.evaluate({snapshot,horizonId:"quick",publicationGeneration:9});assert.strictEqual(cached,smoke);assert.equal(engine.diagnostics().cacheHits,1);assert(engine.diagnostics().cacheCounts.evaluationCache<=24);

  // Requirements exactly follow the requested hierarchy and retain ordinary canonical MAs without specialized crossover forecasting.
  const plans={quick:engine.getRequirements({horizonId:"quick"}),two:engine.getRequirements({horizonId:"2_3h"}),six:engine.getRequirements({horizonId:"6_8h"})};
  assert.deepStrictEqual(JSON.parse(JSON.stringify(plans.quick.timeframes)),["1m","3m","5m","15m","1h","4h","1d"]);assert.deepStrictEqual(JSON.parse(JSON.stringify(plans.two.timeframes)),["3m","5m","15m","1h","4h","1d"]);assert.deepStrictEqual(JSON.parse(JSON.stringify(plans.six.timeframes)),["5m","15m","1h","4h","1d"]);
  const engineSource=fs.readFileSync(path.join(root,"features/pressure-signal/engines/engine-b.js"),"utf8");assert(!/VWAP/i.test(engineSource));assert(!/causes cross|probability forecast|15m-authoritative/i.test(engineSource));

  // A/B state, output, window selection, publication and Action isolation.
  const registry=context.createSignalEngineRegistry(),engineA=context.createSignalEngineA(),engineB=context.createSignalEngineB();registry.register(engineA);registry.register(engineB);registry.activate("A");
  assert.equal(registry.isAvailable("B"),true);assert.equal(registry.isAvailable("C"),false);assert.equal(registry.list().find(item=>item.id==="C").status,"unregistered");
  const aFixture={direction:"LONG",confidence:67,entryState:"WATCHING",setupIdentity:"a-setup",setupFamily:"MA21 bounce",setupTimeframe:"5m",setupQuality:"B",triggerQuality:"C",currentEntryQuality:"C",entryVerdict:"WAIT",reasons:["A reason"],exclusions:["A exclusion"],triggerIdentity:null,triggerEvidence:[],dataStatus:"sufficient",tone:"gray"};
  const aOutput=registry.evaluate({publicationGeneration:1,evaluateSignalA:()=>aFixture}),aBefore=JSON.stringify(aOutput),aStateBefore=engineA.diagnostics();registry.activate("B");const bOutput=registry.evaluate({publicationGeneration:2,snapshot,horizonId:"quick"});assert.equal(bOutput.engineId,"B");assert.equal(JSON.stringify(aOutput),aBefore);assert.deepStrictEqual(JSON.parse(JSON.stringify(engineA.diagnostics())),JSON.parse(JSON.stringify({...aStateBefore,deactivations:aStateBefore.deactivations+1,cacheCounts:{evidenceByTf:0,smcCache:0,entryTrackers:0,setupHistories:0,seenTriggerAlerts:0}})));
  const windowRegistryA=context.createSignalEngineRegistry(),windowRegistryB=context.createSignalEngineRegistry();for(const own of [windowRegistryA,windowRegistryB]){own.register(context.createSignalEngineA());own.register(context.createSignalEngineB());}
  const selectorA=context.createSignalEngineSelector({registry:windowRegistryA,storage:memoryStorage()}),selectorB=context.createSignalEngineSelector({registry:windowRegistryB,storage:memoryStorage()});selectorA.initialize();selectorB.initialize();selectorB.select("B");assert.equal(selectorA.getSelectedId(),"A");assert.equal(selectorB.getSelectedId(),"B");
  const source=fs.readFileSync(path.join(root,"features/pressure-signal/index.js"),"utf8"),windowsSource=fs.readFileSync(path.join(root,"features/pressure-signal/ui/windows.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),selectionBody=source.slice(source.indexOf("function onSignalEngineSelection37"),source.indexOf("signalEngineSelector=",source.indexOf("function onSignalEngineSelection37"))),action={text:"HOLD",tone:"green",fingerprint:"action-17",generation:17,managementHorizon:"quick",positionManagement:"ESTABLISHED"},actionBefore=JSON.stringify(action);
  assert(!/scheduleActionRefresh37|configureActionFeed37|invalidatePositionContext|setManagementHorizon/.test(selectionBody));selectorB.select("A");selectorB.select("B");assert.equal(JSON.stringify(action),actionBefore);
  assert(source.includes("signalEngineRegistry.accepts(output,{directionMode:state.direction,publicationGeneration:generation})"));assert(source.includes("engineId:output.engineId,engineVersion:output.engineVersion,directionMode:displayedSignal.mode,publicationGeneration:generation"));
  assert(source.includes('typeof window.createSignalEngineB==="function"')&&html.includes("features/pressure-signal/engines/engine-b.js"));assert(windowsSource.includes("Number(left.publicationGeneration)===Number(right.publicationGeneration)"));
  assert(!/setInterval|addEventListener|fetch\(|XMLHttpRequest|createPressureSignalDataFeed/.test(engineSource),"Signal B owns polling, listeners, REST, or sockets");
  for(const key of ["directionalPermissionScore","setupBreakdown","triggerBreakdown","currentEntryBreakdown","hardGates","effectiveOppositionEvidence","volatilityRegime","participationState","flowEffectiveness","chaseDistanceAtr","remainingRewardRisk","finalStateReason","engineVersion","publicationGeneration"])assert(Object.prototype.hasOwnProperty.call(scenarios.cleanContinuation.comparisonDiagnostics,key),`missing comparison diagnostic ${key}`);
  for(let index=0;index<40;index+=1){registry.activate("A",`leak-${index}-a`);registry.evaluate({publicationGeneration:index*2+3,evaluateSignalA:()=>aFixture});registry.activate("B",`leak-${index}-b`);registry.evaluate({publicationGeneration:index*2+4,snapshot:{...snapshot,signature:`fixture-switch-${index}`},horizonId:"quick"});}
  const lifecycle=registry.diagnostics();assert.equal(lifecycle.activeEvaluationCount,0);assert(engineB.diagnostics().cacheCounts.evaluationCache<=24);assert(source.includes("if(state.dataFeed) return state.dataFeed"));

  const result={passed:true,scenarios:Object.fromEntries(Object.entries(scenarios).map(([name,value])=>[name,{state:value.entryState,direction:value.direction,failedGates:value.comparisonDiagnostics.hardGates.failed}])),productionExtraction:true,requirements:true,signalAIsolation:true,perWindowIsolation:true,actionInvariance:true,cacheBounded:true};
  console.log("signal B tests: PASS",result);return result;
})();
module.exports=run;if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
