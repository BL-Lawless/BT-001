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
  constructor(id=""){this.id=id;this.value="";this.checked=false;this.disabled=false;this.textContent="";this.dataset={};this.classList=new FakeClassList();this.listeners=new Map();this.children=[];this.attributes={};this.style={};}
  addEventListener(type,handler){const handlers=this.listeners.get(type)||[];handlers.push(handler);this.listeners.set(type,handlers);}
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
  getBoundingClientRect(){return {left:90,top:70,width:430,height:420,right:520,bottom:490};}
  setPointerCapture(){}
  releasePointerCapture(){}
  remove(){this.removed=true;}
}

function elementMap(){
  const ids=[
    "scalpWindow","scalpSimulatorWindow","scalpSimulatorHead","scalpSimulatorCollapse","scalpSimulatorClose","scalpSimulatorToggle","scalpSimLoadData","scalpSimLoadStatus","scalpSimMinimumRank","scalpSimMinimumRankValue",
    "scalpSimLot","scalpSimStop","scalpSimTarget","scalpSimMaxConcurrent","scalpSimProfitLockEnabled","scalpSimLockThresholdPct",
    "scalpSimLockPortionPct","scalpSimRankBoostEnabled","scalpSimRankBoostThreshold","scalpSimRankBoostPoints","scalpSimResultsBody",
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

async function run(){
  const elements=elementMap(),calls={load:0,recalculate:0};
  elements.scalpSimulatorWindow.classList.add("hidden");
  let cache=null,lastConfig=null;
  const result={eventsShown:1,trades:[{entryTimeMs:1710000000000,direction:"LONG",rank:91,mddUsd:.4,pnlUsd:1.25,exitReason:"PARTIAL_TP"}]};
  const simulatorData={
    async loadData(config){calls.load+=1;lastConfig=config;cache={events:[{}],candles:[{}],simulation:result};return cache;},
    recalculate(config){calls.recalculate+=1;lastConfig=config;cache={...cache,simulation:result};return result;},
    getCache(){return cache;}
  };
  const context={
    window:{__BT001_SCALP_BUILD__:{
      config:{},
      calculations:{formatNumeric:(value,decimals)=>Number(value||0).toFixed(decimals)},
      simulatorData
    }},
    document:{
      getElementById:id=>elements[id]||null,
      createElement:()=>new FakeElement(),
      addEventListener(){},
      removeEventListener(){}
    },
    localStorage:{getItem:()=>null,setItem(){}},
    innerWidth:1920,
    innerHeight:1080,
    console,
    Date
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"simulator-ui.js"),"utf8"),context,{filename:"simulator-ui.js"});
  const Controller=context.window.__BT001_SCALP_BUILD__.ScalpSimulatorUI;
  const engine={snapshot:()=>({config:{minimumRank:70,lot:".010",stop:"5",target:"10",maxConcurrentAutoPositions:4,profitLockEnabled:false,lockThresholdPct:50,lockPortionPct:50,rankBoostEnabled:false,rankBoostThreshold:90,rankBoostPoints:20},filters:{tickSize:.1,stepSize:.001},rates:{maker:.0002,taker:.0004}})};
  const controller=new Controller(engine);
  controller.window=elements.scalpSimulatorWindow;
  controller.bind();

  await elements.scalpSimulatorToggle.dispatch("click");
  assert.equal(controller.active,true);
  assert.equal(calls.load,0,"opening simulator mode must never fetch data automatically");
  assert.equal(elements.scalpSimulatorToggle.textContent,"SIMULATOR");
  assert.equal(elements.scalpSimulatorWindow.classList.contains("hidden"),false,"simulator must open its own window");
  assert.equal(elements.scalpWindow.classList.contains("hidden"),false,"opening simulator must leave the live scalp window visible");

  cache={events:[{}],candles:[{}],simulation:result};
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
  rank.value="83";
  await rank.dispatch("touchend");
  assert.equal(calls.recalculate,3,"rank slider must recalculate on touch release");

  elements.scalpSimProfitLockEnabled.checked=true;
  await elements.scalpSimProfitLockEnabled.dispatch("change");
  assert.equal(calls.recalculate,4,"management toggles must recalculate immediately");
  assert.equal(elements.scalpSimLockThresholdPct.disabled,false);

  const shortButton=elements.scalpSimDirection.children.find(button=>button.dataset.value==="SHORT");
  await elements.scalpSimDirection.dispatch("click",{target:shortButton});
  assert.equal(calls.recalculate,5,"segment filters must recalculate immediately");
  assert.equal(lastConfig.direction,"SHORT");

  const threeMinuteButton=elements.scalpSimTimeframe.children.find(button=>button.dataset.value==="3m");
  await elements.scalpSimTimeframe.dispatch("click",{target:threeMinuteButton});
  assert.equal(calls.recalculate,6,"timeframe filter must recalculate immediately");
  assert.equal(lastConfig.sourceTimeframe,"3m");

  cache=null;
  await elements.scalpSimLoadData.dispatch("click");
  assert.equal(calls.load,1,"Load data must call the Stage 3 loader exactly once");
  assert.equal(elements.scalpSimStatEvents.textContent,"1");
  assert.equal(elements.scalpSimResultsBody.children.length,1);

  console.log("SCALP simulator UI tests: PASS");
}

run().catch(error=>{console.error(error);process.exitCode=1;});
