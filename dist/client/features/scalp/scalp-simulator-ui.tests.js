"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

class FakeClassList{
  constructor(){this.values=new Set();}
  add(...names){names.forEach(name=>this.values.add(name));}
  remove(...names){names.forEach(name=>this.values.delete(name));}
  toggle(name,force){
    const enabled=force==null?!this.values.has(name):!!force;
    if(enabled)this.values.add(name);else this.values.delete(name);
    return enabled;
  }
  contains(name){return this.values.has(name);}
}

class FakeElement{
  constructor(id=""){
    this.id=id;this.value="";this.checked=false;this.disabled=false;this.textContent="";this.dataset={};
    this.classList=new FakeClassList();this.listeners=new Map();this.children=[];this.attributes={};this.style={};this.innerHTML="";
  }
  addEventListener(type,handler){const handlers=this.listeners.get(type)||[];handlers.push(handler);this.listeners.set(type,handlers);}
  removeEventListener(type,handler){this.listeners.set(type,(this.listeners.get(type)||[]).filter(candidate=>candidate!==handler));}
  async dispatch(type,properties={}){
    const event={target:this,key:"",...properties};
    const results=(this.listeners.get(type)||[]).map(handler=>handler(event));
    await Promise.all(results);
  }
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=[...children];}
  querySelectorAll(selector){return selector==="button[data-value]"?this.children:[];}
  querySelector(selector){return selector==="button.is-active"?this.children.find(child=>child.classList.contains("is-active"))||null:null;}
  closest(selector){return selector==="button[data-value]"&&this.dataset.value?this:null;}
  setAttribute(name,value){this.attributes[name]=String(value);}
}

function elementMap(){
  const ids=[
    "scalpSimulatorPopupRoot","scalpSimulatorToggle","scalpSimLoadData","scalpSimLoadStatus","scalpSimMinimumRank","scalpSimMinimumRankValue",
    "scalpSimFastSlopeMin","scalpSimFastSlopeMax","scalpSimSlowSlopeMin","scalpSimSlowSlopeMax","scalpSimSeparationMin","scalpSimSeparationMax","scalpSimRelativeVolumeMin","scalpSimRelativeVolumeMax",
    "scalpSimSlopeWeight","scalpSimMinEffectiveSeparation","scalpSimMinEffectiveSeparationValue","scalpSimVolumeGateThreshold","scalpSimMinVolumeGatedAngle","scalpSimMinVolumeGatedAngleValue",
    "scalpSimLot","scalpSimStop","scalpSimTarget","scalpSimMaxConcurrent","scalpSimMoveSlToBeEnabled","scalpSimBeThresholdPct","scalpSimClosePortionEnabled","scalpSimCloseThresholdPct",
    "scalpSimClosePortionPct","scalpSimRankBoostEnabled","scalpSimRankBoostThreshold","scalpSimRankBoostPoints","scalpSimResultsBody",
    "scalpSimStatEvents","scalpSimStatWinRate","scalpSimStatPnl","scalpSimStatRatio","scalpSimStatWins","scalpSimStatLosses",
    "scalpSimStatProfit","scalpSimStatLoss"
  ];
  const elements=Object.fromEntries(ids.map(id=>[id,new FakeElement(id)]));
  for(const [id,values] of [["scalpSimTimeframe",["ANY","1m","3m","5m","15m"]],["scalpSimDirection",["ANY","LONG","SHORT"]],["scalpSimEventType",["ANY","CROSS","BOUNCE"]]]){
    const segment=elements[id]=new FakeElement(id);
    for(const value of values){const button=new FakeElement();button.dataset.value=value;segment.appendChild(button);}
  }
  return elements;
}

async function testLauncher(){
  const button=new FakeElement("scalpSimulatorToggle");
  const opened=[];
  const registered=[];
  const intervals=[];
  const window={
    __BT001_SCALP_BUILD__:{},
    __BT001_SCALP_SIMULATOR_BRIDGE__:{registerPopup(popup){registered.push(popup);}},
    location:{href:"https://app.example/index.html"},
    open(url,name,features){
      const popup={url,name,features,closed:false,focusCalls:0,focus(){this.focusCalls+=1;}};
      opened.push(popup);
      return popup;
    },
    setInterval(handler){intervals.push(handler);return intervals.length;},
    clearInterval(){}
  };
  const context={window,document:{getElementById:id=>id==="scalpSimulatorToggle"?button:null},URL,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"simulator-ui.js"),"utf8"),context,{filename:"simulator-ui.js"});
  const Controller=window.__BT001_SCALP_BUILD__.ScalpSimulatorUI;
  const controller=new Controller();
  controller.install();

  await button.dispatch("click");
  assert.equal(opened.length,1,"the toolbar button must call window.open exactly once");
  assert.equal(opened[0].url,"https://app.example/features/scalp/simulator-popup.html");
  assert.equal(opened[0].name,"bt001ScalpSimulator");
  assert(opened[0].features.includes("popup=yes")&&opened[0].features.includes("resizable=yes")&&opened[0].features.includes("scrollbars=yes"),"popup must request native resizable window chrome");
  assert(!opened[0].features.includes("noopener"),"same-origin popup must retain its opener reference");
  assert.equal(registered[0],opened[0],"the main-window message bridge must register the exact popup WindowProxy");
  assert.equal(button.attributes["aria-pressed"],"true");

  await button.dispatch("click");
  assert.equal(opened.length,1,"clicking while open must focus the existing popup, not create another");
  assert.equal(opened[0].focusCalls,2);

  opened[0].closed=true;
  intervals[0]();
  assert.equal(button.attributes["aria-pressed"],"false");
  await button.dispatch("click");
  assert.equal(opened.length,2,"a closed popup must be reopenable");
  controller.destroy();
}

async function testPopup(){
  const elements=elementMap(),calls={load:0,recalculate:0};
  const result={eventsShown:1,trades:[{entryTimeMs:1710000000000,direction:"LONG",rank:91,fastSlope:.0123,slowSlope:.0045,separation:.0678,relativeVolume:1.25,effectiveSeparation:.0924,volumeGatedAngle:.0123,mddUsd:.4,pnlUsd:1.25,exitReason:"PARTIAL_TP"}]};
  let cache={events:[{}],candles:[{}],simulation:result};
  let lastConfig=null;
  let popupMessageHandler=null,exportsMissing=false;
  const snapshot={config:{minimumRank:70,lot:".010",stop:"5",target:"10",maxConcurrentAutoPositions:4,profitLockEnabled:false,lockThresholdPct:50,lockPortionPct:50,rankBoostEnabled:false,rankBoostThreshold:90,rankBoostPoints:20},filters:{tickSize:.1,stepSize:.001},rates:{maker:.0002,taker:.0004},formatted:{lot:"0.010",stop:"5.0",target:"10.0"}};
  const cacheView=()=>cache?{eventCount:cache.events.length,candleCount:cache.candles.length,simulation:cache.simulation}:null;
  const stateView=()=>({sources:["1m","3m","5m","15m"],snapshot,cache:cacheView()});
  const opener={
    closed:false,
    postMessage(message){
      calls.messages=(calls.messages||0)+1;
      let response;
      if(exportsMissing){
        response={ok:false,error:{code:"EXPORTS_MISSING",message:"Required main-app exports are not ready: simulatorData. Retrying…"}};
      }else if(message.action==="CONNECT"){
        response={ok:true,result:stateView()};
      }else if(message.action==="PING"){
        response={ok:true,result:{alive:true}};
      }else if(message.action==="LOAD_DATA"){
        calls.load+=1;lastConfig=message.payload.config;cache={events:[{},{}],candles:[{},{}],simulation:result};
        response={ok:true,result:{snapshot,cache:cacheView()}};
      }else if(message.action==="RECALCULATE"){
        calls.recalculate+=1;lastConfig=message.payload.config;cache={...cache,simulation:result};
        response={ok:true,result:{snapshot,cache:cacheView()}};
      }
      popupMessageHandler({data:{channel:message.channel,kind:"response",requestId:message.requestId,...response},source:opener});
    }
  };
  const timeoutEntries=[];
  const controls=()=>Object.values(elements).flatMap(element=>[element,...element.children]);
  const context={
    window:{
      opener,
      setTimeout(handler,delay){const entry={handler,delay,cleared:false};timeoutEntries.push(entry);return timeoutEntries.length;},
      clearTimeout(id){if(timeoutEntries[id-1])timeoutEntries[id-1].cleared=true;},
      addEventListener(type,handler){if(type==="message")popupMessageHandler=handler;}
    },
    document:{
      readyState:"complete",
      getElementById:id=>elements[id]||null,
      createElement:()=>new FakeElement(),
      querySelectorAll:selector=>selector==="button,input"?controls():[],
      addEventListener(){}
    },
    console,
    Date
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"simulator-popup.js"),"utf8"),context,{filename:"simulator-popup.js"});
  await Promise.resolve();await Promise.resolve();

  assert.equal(calls.load,0,"opening or reopening the popup must never fetch automatically");
  assert.equal(elements.scalpSimLoadStatus.textContent,"Using cached data · 1 events · 1 candles");
  assert.equal(elements.scalpSimStatEvents.textContent,"1","an opener-owned cache must render immediately in a reopened popup");
  const healthyProbe=timeoutEntries.find(entry=>entry.delay===1000&&!entry.cleared);
  assert(healthyProbe,"a healthy postMessage connection must be monitored without busy polling");

  const popupApi=context.window.BT001ScalpSimulatorPopup;
  context.window.opener=null;
  const missingOpener=popupApi.inspectOpener();
  assert.equal(missingOpener.code,"OPENER_MISSING");
  assert(missingOpener.message.includes("opener reference is missing"));
  context.window.opener={closed:true};
  const closedOpener=popupApi.inspectOpener();
  assert.equal(closedOpener.code,"OPENER_CLOSED");
  assert(closedOpener.message.includes("opener window is closed"));
  const securityError=new Error("Blocked by browser isolation");securityError.name="SecurityError";
  context.window.opener={closed:false,postMessage(){throw securityError;}};
  await assert.rejects(()=>popupApi.request("CONNECT"),error=>error.code==="OPENER_SECURITY_ERROR"&&error.message.includes("SecurityError"));
  context.window.opener=opener;
  exportsMissing=true;
  await assert.rejects(()=>popupApi.request("CONNECT"),error=>error.code==="EXPORTS_MISSING"&&error.message.includes("simulatorData"));
  exportsMissing=false;

  const lot=elements.scalpSimLot;
  lot.value=".020";
  await lot.dispatch("input");
  assert.equal(calls.recalculate,0,"number input must not recalculate while typing");
  await lot.dispatch("blur");
  assert.equal(calls.recalculate,1,"number input must recalculate on blur");
  assert.equal(lastConfig.lot,.02);

  const rank=elements.scalpSimMinimumRank;
  rank.value="82";
  await rank.dispatch("input");
  assert.equal(elements.scalpSimMinimumRankValue.textContent,"82");
  assert.equal(calls.recalculate,1,"rank slider must not recalculate while dragging");
  await rank.dispatch("mouseup");
  assert.equal(calls.recalculate,2,"rank slider must recalculate on mouse release");

  elements.scalpSimSlopeWeight.value="2.5";
  await elements.scalpSimSlopeWeight.dispatch("input");
  assert.equal(calls.recalculate,2,"slope weight must not recalculate while typing");
  await elements.scalpSimSlopeWeight.dispatch("blur");
  assert.equal(calls.recalculate,3);
  assert.equal(lastConfig.slopeWeight,2.5);

  const shortButton=elements.scalpSimDirection.children.find(button=>button.dataset.value==="SHORT");
  await elements.scalpSimDirection.dispatch("click",{target:shortButton});
  assert.equal(calls.recalculate,4);
  assert.equal(lastConfig.direction,"SHORT");

  await elements.scalpSimLoadData.dispatch("click");
  assert.equal(calls.load,1,"only an explicit Load data click may refetch");
  assert.equal(elements.scalpSimResultsBody.children.length,1);
  assert.equal(elements.scalpSimResultsBody.children[0].children.length,11);
  assert(elements.scalpSimResultsBody.children[0].children.slice(3,9).every(cell=>cell.textContent&&!cell.textContent.includes("NaN")),"raw and computed metric columns must render numeric values");

  opener.closed=true;
  assert.doesNotThrow(()=>healthyProbe.handler(),"opener loss must be handled without throwing");
  await Promise.resolve();await Promise.resolve();
  assert(elements.scalpSimLoadStatus.textContent.includes("opener window is closed"));
  assert.equal(elements.scalpSimLoadData.disabled,true);
  const expectedBackoff=[250,500,1000,2000,5000,5000];
  for(let index=0;index<expectedBackoff.length;index+=1){
    const retry=[...timeoutEntries].reverse().find(entry=>!entry.cleared);
    assert.equal(retry.delay,expectedBackoff[index],`retry ${index+1} must follow the configured backoff`);
    if(index<expectedBackoff.length-1){retry.handler();await Promise.resolve();await Promise.resolve();}
  }
  const recoveryRetry=[...timeoutEntries].reverse().find(entry=>!entry.cleared);
  opener.closed=false;
  recoveryRetry.handler();await Promise.resolve();await Promise.resolve();
  assert.equal(elements.scalpSimLoadData.disabled,false);
  assert(elements.scalpSimLoadStatus.textContent.includes("Reconnected · using cached data"));
  assert.doesNotThrow(()=>popupApi.recalculate());
}

async function run(){
  await testLauncher();
  await testPopup();
  console.log("SCALP simulator popup UI tests: PASS");
}

run().catch(error=>{console.error(error);process.exitCode=1;});
