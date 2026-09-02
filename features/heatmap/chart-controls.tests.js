"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

function classList(){
  const values=new Set();
  return {add(...names){names.forEach(name=>values.add(name));},remove(...names){names.forEach(name=>values.delete(name));},contains(name){return values.has(name);},toggle(name,on){if(on===undefined)on=!values.has(name);on?values.add(name):values.delete(name);return on;}};
}
function element(tag="div"){
  return {tagName:tag.toUpperCase(),id:"",parentElement:null,parentNode:null,children:[],dataset:{},style:{},classList:classList(),rect:{left:0,right:0,top:0,bottom:0,width:0,height:0},
    appendChild(child){if(child.parentNode){child.parentNode.children=child.parentNode.children.filter(item=>item!==child);}child.parentNode=this;child.parentElement=this;this.children.push(child);return child;},
    querySelector(selector){const role=/^\[data-chart-control="([^"]+)"\]$/.exec(selector);if(role)return this.children.find(child=>child.dataset.chartControl===role[1])||null;return null;},
    getBoundingClientRect(){return this.rect;},setAttribute(){},addEventListener(){}};
}

const body=element("body"),toolbar=element(),calculatorMetric=element(),wrap=element(),canvas=element("canvas"),target=element("button"),maTarget=element(),raf=[];let targetAvailable=false;
wrap.classList.add("chart-wrap");wrap.rect={left:100,right:1000,top:0,bottom:500,width:900,height:500};canvas.id="chart";wrap.appendChild(canvas);body.appendChild(wrap);
target.id="calcOpenBtn";target.rect={left:916,right:944,top:8,bottom:36,width:28,height:28};calculatorMetric.appendChild(target);toolbar.appendChild(calculatorMetric);body.appendChild(toolbar);
maTarget.classList.add("v33-ma-stack-box");maTarget.dataset.tf="1D";maTarget.rect={left:800,right:910,top:8,bottom:30,width:110,height:22};body.appendChild(maTarget);
const findById=(root,id)=>root.id===id?root:root.children.map(child=>findById(child,id)).find(Boolean)||null;
const document={body,readyState:"loading",fonts:null,createElement:element,getElementById:id=>id==="calcOpenBtn"&&!targetAvailable?null:findById(body,id),querySelector:selector=>selector==='.v33-ma-stack-box[data-tf="1D"]'?maTarget:null,addEventListener(){}};
class Observer{constructor(callback){this.callback=callback;}observe(){}unobserve(){}disconnect(){}}
const context={console,Date,Math,Number,Object,Array,Set,Map,Error,Promise,String,Boolean,JSON,document,MutationObserver:Observer,ResizeObserver:Observer,requestAnimationFrame:callback=>{raf.push(callback);return raf.length;},cancelAnimationFrame(){},localStorage:{setItem(){}}};
context.window=context;
vm.createContext(context);
const uiSource=fs.readFileSync(path.join(__dirname,"ui.module.js"),"utf8");
assert(!uiSource.includes("v33MAStackMetric")&&!uiSource.includes("v33-ma-stack-box"),"overlay alignment must have no MA Stack/1D dependency");
vm.runInContext(uiSource,context,{filename:"ui.module.js"});

const controls=context.BT001ChartOverlayControls,liq=element("button"),book=element("button"),obd=element("button"),otf=element("button"),orders=element("button");
liq.id="heatmapOverlayToggle";book.id="bookOverlayToggle";obd.id="depthProfileOverlayToggle";otf.id="calcModuleOtfToggle";orders.id="calcModuleOrdersToggle";
controls.register(orders,"orders");controls.register(obd,"obd");controls.register(liq,"liq");controls.register(otf,"otf");controls.register(book,"book");
while(raf.length)raf.shift()();
const group=findById(body,"chartOverlayControlGroup");
assert.equal(group.classList.contains("is-aligned"),false,"controls must stay hidden while delayed Calculator initialization is incomplete");
targetAvailable=true;controls.align();
assert.deepEqual(group.children.map(child=>child.dataset.chartControl),["liq","book","obd","otf","orders"],"first frame order must keep OBD directly beside Book");
assert.equal(group.style.right,"56px","overlay row right edge must match the Calculator icon");
assert.equal(group.classList.contains("is-aligned"),true,"group must be visible only after authoritative alignment");

liq.classList.toggle("is-on",true);controls.align();
assert.equal(group.style.right,"56px","restored/toggled LIQ state must not change geometry");
otf.classList.toggle("is-on",true);controls.align();
assert.equal(group.style.right,"56px","restored/toggled OTF state must not change geometry");
maTarget.rect={left:700,right:760,top:8,bottom:30,width:60,height:22};controls.align();
assert.equal(group.style.right,"56px","MA Stack timeframe geometry must not influence the row anchor");
wrap.rect={left:80,right:820,top:0,bottom:500,width:740,height:500};target.rect={left:716,right:744,top:8,bottom:36,width:28,height:28};controls.align();
assert.equal(group.style.right,"76px","narrow viewport layout must realign to the Calculator icon");
wrap.rect={left:120,right:1320,top:0,bottom:500,width:1200,height:500};target.rect={left:1186,right:1214,top:8,bottom:36,width:28,height:28};controls.align();
assert.equal(group.style.right,"106px","wide viewport layout must realign to the Calculator icon");
assert.deepEqual(group.children.map(child=>child.dataset.chartControl),["liq","book","obd","otf","orders"],"realignment must not drift child order");

console.log("chart control tests: PASS");
