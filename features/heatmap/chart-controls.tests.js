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

const body=element("body"),wrap=element(),canvas=element("canvas"),target=element(),raf=[];let targetAvailable=false;
wrap.classList.add("chart-wrap");wrap.rect={left:100,right:1000,top:0,bottom:500,width:900,height:500};canvas.id="chart";wrap.appendChild(canvas);body.appendChild(wrap);
target.classList.add("v33-ma-stack-box");target.dataset.tf="1D";target.rect={left:800,right:910,top:8,bottom:30,width:110,height:22};body.appendChild(target);
const findById=(root,id)=>root.id===id?root:root.children.map(child=>findById(child,id)).find(Boolean)||null;
const document={body,readyState:"loading",fonts:null,createElement:element,getElementById:id=>findById(body,id),querySelector:selector=>selector==='.v33-ma-stack-box[data-tf="1D"]'&&targetAvailable?target:null,addEventListener(){}};
class Observer{constructor(callback){this.callback=callback;}observe(){}unobserve(){}disconnect(){}}
const context={console,Date,Math,Number,Object,Array,Set,Map,Error,Promise,String,Boolean,JSON,document,MutationObserver:Observer,ResizeObserver:Observer,requestAnimationFrame:callback=>{raf.push(callback);return raf.length;},cancelAnimationFrame(){},localStorage:{setItem(){}}};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,"ui.module.js"),"utf8"),context,{filename:"ui.module.js"});

const controls=context.BT001ChartOverlayControls,liq=element("button"),otf=element("button"),orders=element("button");
liq.id="heatmapOverlayToggle";otf.id="calcModuleOtfToggle";orders.id="calcModuleOrdersToggle";
controls.register(orders,"orders");controls.register(liq,"liq");controls.register(otf,"otf");
while(raf.length)raf.shift()();
const group=findById(body,"chartOverlayControlGroup");
assert.equal(group.classList.contains("is-aligned"),false,"controls must stay hidden while delayed MA Stack initialization is incomplete");
targetAvailable=true;controls.align();
assert.deepEqual(group.children.map(child=>child.dataset.chartControl),["liq","otf","orders"],"first frame order");
assert.equal(group.style.right,"90px","Orders group right edge must match 1D MA Stack");
assert.equal(group.classList.contains("is-aligned"),true,"group must be visible only after authoritative alignment");

liq.classList.toggle("is-on",true);controls.align();
assert.equal(group.style.right,"90px","restored/toggled LIQ state must not change geometry");
otf.classList.toggle("is-on",true);controls.align();
assert.equal(group.style.right,"90px","restored/toggled OTF state must not change geometry");
target.rect={left:740,right:860,top:8,bottom:30,width:120,height:22};controls.align();
assert.equal(group.style.right,"140px","resize/timeframe/MA Stack changes must realign the shared group");
assert.deepEqual(group.children.map(child=>child.dataset.chartControl),["liq","otf","orders"],"realignment must not drift child order");

console.log("chart control tests: PASS");
