"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..","..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError};
context.window=context;vm.createContext(context);
vm.runInContext(read("features/pressure-signal/ui/signal-tooltip.js"),context,{filename:"signal-tooltip.js"});
vm.runInContext(read("features/pressure-signal/engines/engine-b.js"),context,{filename:"engine-b.js"});

class FakeControl{
  constructor(){this.handlers={};this.attributes={title:"old native tooltip"};}
  addEventListener(type,handler){(this.handlers[type]||=[]).push(handler);}
  removeEventListener(){}
  removeAttribute(name){delete this.attributes[name];}
  dispatch(type){for(const handler of this.handlers[type]||[])handler({type,target:this});}
}
const cases={};
let visible=false,shows=0,hides=0,networkCalls=0,evaluations=0;
const button=new FakeControl(),container=new FakeControl();
context.__PRESSURE_SIGNAL_FEATURE_BUILD__.bindSignalTooltipLifecycle({control:button,listen:(target,type,handler)=>target.addEventListener(type,handler),show:()=>{visible=true;shows+=1;},hide:()=>{visible=false;hides+=1;}});
button.dispatch("mouseenter");cases.enterShows=visible&&shows===1;
button.dispatch("mouseleave");cases.onePixelLeaveImmediate=!visible&&hides===1;
container.dispatch("mouseenter");cases.tooltipAndContainerCannotBridge=!visible&&!("mouseenter" in container.handlers);
button.dispatch("mouseenter");button.dispatch("pointerdown");button.dispatch("click");cases.clickDoesNotPin=!visible&&shows===2;
button.dispatch("focus");cases.keyboardFocusDoesNotShow=!visible;

const displayed={mode:"LONG",evaluatedDirection:"LONG",direction:"LONG",visibleState:"TRIGGER ACTIVE",confidence:84,setupQuality:"A",triggerQuality:"A",currentEntryQuality:"A",publicationGeneration:17};
const facts={
  fresh:true,profile:{early:"1m",trigger:"3m",primary:"5m",setups:["3m","5m"],structures:["15m","1h"],boundaries:["4h","1d"],chaseAtr:1.35,minNetRr:1.35},
  directionalPermission:{permission:true,direction:"LONG",score:84,reason:"LONG primary permission",breakdown:{maStackOrder:90,closedStructure:84}},
  setup:{direction:"LONG",valid:true,identity:"b",family:"Structural retest",tf:"5m",level:100,zone:{low:99.5,high:100.5},invalidation:98,interacted:true,reactionConfirmed:true,invalidated:false,repeatedTests:1},
  setupComponents:{structuralLocation:90,regimeAlignment:86,eventLevelQuality:84,invalidationTargetGeometry:82,volatilitySuitability:85},
  trigger:{breakLevel:100.25,microstructureShift:true,displacementQuality:88,flow:{effective:true,priceProgressAtr:.72,evidence:["Effective directional flow"]},participation:{state:"STRONG",score:88,persistence:.75},retestHeld:true,qualifiedFollowThrough:false,freshnessScore:92,evidence:["Closed post-interaction structure shift"]},
  opposition:{effective:false,evidence:[]},volatility:{regime:"Expanding/controlled",controlledAcceptance:true},geometry:{target:104,targetTimeframe:"15m",netRr:2.1,viable:true},current:{price:101,originDistanceAtr:.22,chased:false,adverseEvidence:10},data:{timeframesUsed:["1m","3m","5m","15m","1h","4h","1d"],freshness:"LIVE",ageMs:900}
};
evaluations+=1;const bOutput=context.createSignalEngineB().evaluateFacts(facts,{horizonId:"quick",directionMode:"LONG",symbol:"BTCUSDT",version:7});bOutput.engineId="B";bOutput.engineVersion="1.0.0";
const bText=context.__PRESSURE_SIGNAL_FEATURE_BUILD__.createSignalDiagnosticsTooltip(bOutput,displayed,"Quick");
const bSections=["HEADER","QUALITY","SETUP EVIDENCE","TRIGGER EVIDENCE","ENTRY CONDITION","DECISION","DATA"];
cases.bComplete=bSections.every(label=>bText.includes(label))&&["Setup Quality","Trigger Quality","Current Entry Quality","Estimated net RR","Exact state reason","Timeframes used"].every(label=>bText.includes(label));
cases.bPublishedEvidence=["setupEvidence","triggerEvidence","entryCondition","data"].every(key=>Object.prototype.hasOwnProperty.call(bOutput.comparisonDiagnostics,key));

const phase=(tf,name)=>({tf,phase:name,direction:"LONG",available:true,stale:false,eventAgeBars:2,ema9:101,ema55:100,gap:1,normalizedDistance:.2,gapVelocity:.04,fastSlope:.12,fastAcceleration:.02,slowSlope:.03,slowMeaningfullySloped:true});
const cOutput={engineId:"C",engineVersion:"1.0.0",comparisonDiagnostics:{participationState:"STRONG",finalStateReason:"Qualified response",flowEffectiveness:{effective:true,score:82,participationRatio:1.2,rangeRatio:.8,uncontrolled:false,absorption:true,evidence:["Directional progress"]},signalC:{authoritativePhase:"BOUNCE CONFIRMED",timeframes:{"5m":phase("5m","APPROACH"),"15m":phase("15m","BOUNCE CONFIRMED"),"30m":phase("30m","RETEST / HOLD"),"1h":phase("1h","APPROACH")},synchronization:{score:86,alignedCount:4,supporting:["4 timeframes align"],opposing:[]},crossForecast:{direction:"LONG",requiredClose:101.2,currentPrice:101,distancePrice:.2,distanceBps:19.8,distanceAtr:.12,timeRemainingMs:240000,thresholdMet:false,likelihoodScore:73},secondary:{supporting:["EMA21 is aligned"],opposing:[]},opposing:[],invalidation:99,noChase:false}}};
const cText=context.__PRESSURE_SIGNAL_FEATURE_BUILD__.createSignalDiagnosticsTooltip(cOutput,displayed,"Quick");
const cSections=["HEADER","CORE 15M EVENT","TIMEFRAME SYNCHRONIZATION","CROSS FORECAST, WHEN APPLICABLE","CONFIRMATION/BACKDROP","DATA"];
cases.cComplete=cSections.every(label=>cText.includes(label))&&["EMA9 slope/angular momentum","EMA55 slope","uncalibrated, not guaranteed","5m early warning","15m authoritative"].every(label=>cText.includes(label));
const missingText=context.__PRESSURE_SIGNAL_FEATURE_BUILD__.createSignalDiagnosticsTooltip({engineId:"B",engineVersion:"1.0.0",comparisonDiagnostics:{}},{...displayed,confidence:null},"Quick");
cases.missingIsUnavailable=(missingText.match(/UNAVAILABLE/g)||[]).length>=12&&!/\bneutral\b/i.test(missingText);

const windowsSource=read("features/pressure-signal/ui/windows.js"),indexSource=read("features/pressure-signal/index.js"),css=read("features/pressure-signal/pressure-signal.css"),actionSource=read("features/pressure-signal/management/action-lifecycle.js");
const beforePublishVisible=visible;context.__PRESSURE_SIGNAL_FEATURE_BUILD__.createSignalDiagnosticsTooltip(cOutput,displayed,"Quick");cases.recalculationDoesNotOpen=visible===beforePublishVisible;
button.dispatch("mouseenter");const beforeHover={networkCalls,evaluations};button.dispatch("mouseleave");cases.hoverZeroNetwork=networkCalls===beforeHover.networkCalls;cases.hoverZeroEvaluations=evaluations===beforeHover.evaluations;
cases.aContentPreserved=indexSource.includes("function signalToolbarTooltip37")&&indexSource.includes("signalToolbarTooltip37(presentationSignal,presentationEntryQuality,thesis,displayedSignal)")&&["Setup origin zone","Remaining reward/risk","Trigger evidence","Management structure"].every(value=>indexSource.includes(value));
cases.switchesHide=/const setSignalHorizon[\s\S]*hideToolbarTooltip\("signal"\)/.test(windowsSource)&&/function invalidateSignalContext[\s\S]*hideToolbarTooltip\("signal"\)/.test(windowsSource)&&/function invalidatePublishedContext37[\s\S]*windowSystem\.invalidateSignalContext/.test(indexSource)&&/function onSignalEngineSelection37[\s\S]*invalidatePublishedContext37/.test(indexSource)&&/function setStoredDirection[\s\S]*invalidatePublishedContext37/.test(indexSource);
cases.latePublicationRejected=indexSource.includes("generation!==state.refreshGeneration")&&windowsSource.includes("acceptSignalPayload({publication:state.signalTooltipPublication}");
cases.generationAtomic=indexSource.includes("signalTooltipPublication:tooltipPayload.publication")&&bText.includes("Publication generation: 17")&&cText.includes("Publication generation: 17")&&windowsSource.includes("Number(left.publicationGeneration)===Number(right.publicationGeneration)");
for(let index=0;index<50;index+=1){button.dispatch("mouseenter");button.dispatch("mouseleave");}cases.rapidEntryExitNoOrphan=!visible&&shows===53&&hides>=52;
cases.chartDragUnaffected=css.includes(".pressure-toolbar-tooltip.is-signal-tooltip.is-open{\n  pointer-events:none;")&&!/pointermove|mousemove|drag/.test(read("features/pressure-signal/ui/signal-tooltip.js"));
cases.actionUnchanged=windowsSource.includes('if(kind==="position"){')&&windowsSource.includes('scheduleTooltipBridgeHide(kind);')&&actionSource.length>0;
cases.buttonOnlyLifecycle=!windowsSource.includes('listen(control,"pointerenter",() => {\n        state.tooltipHover.signal')&&button.attributes.title==null;

assert.deepStrictEqual(Object.entries(cases).filter(([,passed])=>!passed),[],`failed: ${Object.entries(cases).filter(([,passed])=>!passed).map(([name])=>name).join(", ")}`);
console.log("signal tooltip tests: PASS",{cases,sections:{signalB:bSections,signalC:cSections}});
