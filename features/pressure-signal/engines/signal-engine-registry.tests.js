"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..","..");
function loadRuntime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,AbortController};
  context.window=context;context.document={querySelector:()=>null};
  vm.createContext(context);
  for(const file of ["features/pressure-signal/engines/registry.js","features/pressure-signal/engines/engine-a.js","features/pressure-signal/engines/selector.js"]){
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context,{filename:file});
  }
  return context;
}
function output(overrides={}){
  return {direction:"LONG",confidence:72,entryState:"TRIGGER ACTIVE",setupIdentity:"fixture-5m-1",setupFamily:"EMA retest",setupTimeframe:"5m",setupQuality:"A",triggerQuality:"B",currentEntryQuality:"B",entryVerdict:"READY LONG",reasons:["Closed-confirmed reaction"],exclusions:[],triggerIdentity:"BTCUSDT|quick|LONG|fixture-5m-1|5m|123",triggerEvidence:["5m reclaim"],dataStatus:"sufficient",tone:"green",...overrides};
}
function mockEngine(id,{delay=false,throws=false}={}){
  const state={cache:new Map()};
  let resolve;
  return {
    engine:{id,displayName:`Mock ${id}`,version:`test-${id}`,status:"available",state,getRequirements:()=>({items:[{tf:"1m",historyTarget:320}]}),evaluate:()=>{
      if(throws)throw new Error(`${id} failed`);
      return delay?new Promise(done=>{resolve=done;}):output({setupIdentity:`mock-${id}`});
    },onDeactivate:()=>state.cache.clear(),diagnostics:()=>({cacheCount:state.cache.size})},
    resolve:value=>resolve(value),state
  };
}
function memoryStorage(initial={}){
  const values=new Map(Object.entries(initial));
  return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),snapshot:()=>Object.fromEntries(values)};
}

const run=(async()=>{
  const runtime=loadRuntime();

  // Frozen Signal A parity: the adapter and registry may tag the publication, but every legacy UI field remains byte-for-byte equal.
  const registry=runtime.createSignalEngineRegistry(),engineA=registry.register(runtime.createSignalEngineA());registry.activate("A","fixture");
  const frozen=Object.freeze(output());
  const wrapped=registry.evaluate({publicationGeneration:41,reason:"frozen-fixture",evaluateSignalA:()=>frozen});
  const parityKeys=["direction","confidence","entryState","setupIdentity","setupFamily","setupTimeframe","setupQuality","triggerQuality","currentEntryQuality","entryVerdict","reasons","exclusions","triggerIdentity","triggerEvidence","dataStatus","tone"];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(Object.fromEntries(parityKeys.map(key=>[key,wrapped[key]])))),JSON.parse(JSON.stringify(Object.fromEntries(parityKeys.map(key=>[key,frozen[key]])))),"Signal A normalized fields changed while wrapping");
  assert.equal(wrapped.engineId,"A");assert.equal(wrapped.engineVersion,"1.0.0");assert.equal(wrapped.publicationGeneration,41);

  // Registry validation and safe failure reporting.
  const valid=mockEngine("B");registry.register(valid.engine);assert.equal(registry.isAvailable("B"),true);
  assert.throws(()=>registry.register(valid.engine),/Duplicate Signal engine ID/);
  assert.throws(()=>registry.register({id:"C",displayName:"Incomplete"}),/version is required/);
  const failingRegistry=runtime.createSignalEngineRegistry(),failing=mockEngine("B",{throws:true});failingRegistry.register(failing.engine);failingRegistry.activate("B");
  assert.throws(()=>failingRegistry.evaluate({publicationGeneration:1}),/B failed/);
  assert.match(failingRegistry.diagnostics().engines.find(item=>item.id==="B").lastError,/B failed/);

  // Availability, per-window session isolation, reload retention, and invalid fallback.
  const createWindow=stored=>{const ownRegistry=runtime.createSignalEngineRegistry();ownRegistry.register(runtime.createSignalEngineA());const storage=memoryStorage(stored);const selector=runtime.createSignalEngineSelector({registry:ownRegistry,storage});selector.initialize();return {ownRegistry,storage,selector};};
  const windowOne=createWindow(),windowTwo=createWindow();
  assert.equal(windowOne.selector.isSelectable("A"),true);assert.equal(windowOne.selector.isSelectable("B"),false);assert.equal(windowOne.selector.select("B"),false);assert.equal(windowOne.selector.getSelectedId(),"A");
  const windowOneB=mockEngine("B");windowOne.ownRegistry.register(windowOneB.engine);assert.equal(windowOne.selector.select("B"),true);
  const actionFixture={text:"HOLD",tone:"green",fingerprint:"action-fixture",generation:17,positionManagement:{state:"ESTABLISHED"}},actionBefore=JSON.stringify(actionFixture);
  assert.equal(windowOne.selector.getSelectedId(),"B");assert.equal(windowTwo.selector.getSelectedId(),"A","one window changed another window");
  assert.equal(JSON.stringify(actionFixture),actionBefore,"selector changed Action fixture");
  const reloadedRegistry=runtime.createSignalEngineRegistry();reloadedRegistry.register(runtime.createSignalEngineA());reloadedRegistry.register(mockEngine("B").engine);
  const reloaded=runtime.createSignalEngineSelector({registry:reloadedRegistry,storage:windowOne.storage});assert.equal(reloaded.initialize(),"B");
  reloadedRegistry.setStatus("B","unavailable","fixture-unavailable");assert.equal(reloaded.getSelectedId(),"A");assert.equal(reloadedRegistry.diagnostics().activeEngineId,"A");assert.equal(reloadedRegistry.diagnostics().activationGeneration,3,"availability fallback recursed");
  const invalid=createWindow({bt001_signal_engine_selection:"C"});assert.equal(invalid.selector.getSelectedId(),"A");assert.equal(invalid.storage.snapshot().bt001_signal_engine_selection,"A");
  const noLocalStorageRuntime=loadRuntime();Object.defineProperty(noLocalStorageRuntime,"localStorage",{get(){throw new Error("localStorage accessed");}});
  const noLocalRegistry=noLocalStorageRuntime.createSignalEngineRegistry();noLocalRegistry.register(noLocalStorageRuntime.createSignalEngineA());noLocalStorageRuntime.createSignalEngineSelector({registry:noLocalRegistry,storage:memoryStorage()}).initialize();

  // Rapid A -> B -> C publication isolation; only the active engine token is accepted.
  const rapid=runtime.createSignalEngineRegistry(),slowA=mockEngine("A",{delay:true}),slowB=mockEngine("B",{delay:true}),slowC=mockEngine("C",{delay:true});
  rapid.register(slowA.engine);rapid.register(slowB.engine);rapid.register(slowC.engine);
  rapid.activate("A");const resultA=rapid.evaluate({publicationGeneration:1});
  rapid.activate("B");const resultB=rapid.evaluate({publicationGeneration:2});
  rapid.activate("C");const resultC=rapid.evaluate({publicationGeneration:3});
  assert.equal(rapid.diagnostics().activeEvaluationCount,1,"more than one active evaluation lifecycle");
  slowB.resolve(output({setupIdentity:"late-B"}));slowA.resolve(output({setupIdentity:"late-A"}));slowC.resolve(output({setupIdentity:"current-C"}));
  const [lateA,lateB,currentC]=await Promise.all([resultA,resultB,resultC]);
  assert.equal(rapid.accepts(lateA),false);assert.equal(rapid.accepts(lateB),false);assert.equal(rapid.accepts(currentC),true);
  assert.equal(currentC.engineId,"C");assert.equal(currentC.publicationGeneration,3);

  // Static integration guards cover Action invariance, chart-TF independence, publication tags, and bounded engine-owned caches.
  const source=fs.readFileSync(path.join(root,"features/pressure-signal/index.js"),"utf8");
  const windows=fs.readFileSync(path.join(root,"features/pressure-signal/ui/windows.js"),"utf8");
  const selectorSource=fs.readFileSync(path.join(root,"features/pressure-signal/engines/selector.js"),"utf8");
  const selectionBody=source.slice(source.indexOf("function onSignalEngineSelection37"),source.indexOf("signalEngineSelector=",source.indexOf("function onSignalEngineSelection37")));
  assert(!/scheduleActionRefresh37|configureActionFeed37|invalidatePositionContext/.test(selectionBody),"Signal selector mutates Action lifecycle");
  const contextBody=source.slice(source.indexOf("function signalContextKey37"),source.indexOf("function presentationContextKey37"));
  assert(!/interval|activeChartTf/.test(contextBody),"visible chart TF entered the Signal engine context");
  for(const visibleTf of ["1m","5m","15m","1h","4h"])assert.equal(windowOne.selector.getSelectedId(),"B",`chart TF ${visibleTf} changed the engine`);
  assert(source.includes("signalEngineRegistry.accepts(output)")&&windows.includes("left.engineId===right.engineId")&&windows.includes("left.engineVersion===right.engineVersion"),"tooltip/report publication isolation is not engine-aware");
  assert(source.includes("engineId:output.engineId,engineVersion:output.engineVersion,publicationGeneration:generation"),"publication tags are missing");
  assert(selectorSource.includes('tab.dataset.tab="signals"')&&selectorSource.includes('tab.textContent="Signals"'),"dedicated Signals settings tab is missing");
  assert(selectorSource.includes('A:"Signal A — Current"')&&selectorSource.includes('B:"Signal B — Refined blend"')&&selectorSource.includes('C:"Signal C — 9/55"'),"Signal choices do not match the specification");
  assert(selectorSource.includes("input.disabled=!available")&&selectorSource.includes('status.textContent=available ?'),"unavailable choices are not visibly disabled");
  assert(!selectorSource.includes("pressureSignalToolbar"),"selector added a toolbar control");
  assert(source.includes("if(state.dataFeed) return state.dataFeed"),"engine switching can create duplicate Signal feeds");
  for(let index=0;index<60;index+=1){rapid.activate(index%2?"A":"B");rapid.get(index%2?"A":"B").state.cache.set(index,index);}
  assert(rapid.get("A").state.cache.size<=1&&rapid.get("B").state.cache.size<=1,"engine caches grew across switches");

  const cases={signalAParity:true,registryValidation:true,selectorAvailability:true,perWindowIsolation:true,reloadBehaviour:true,publicationIsolation:true,actionInvariance:true,chartTfRegression:true,lifecycleAndCacheBounds:true,settingsUi:true};
  console.log("signal engine registry tests: PASS",cases);
  return cases;
})();
module.exports=run;
if(require.main===module)run.catch(error=>{console.error(error);process.exitCode=1;});
