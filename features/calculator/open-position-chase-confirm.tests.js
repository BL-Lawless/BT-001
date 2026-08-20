"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const source=fs.readFileSync(path.join(root,"features","calculator","presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

assert(source.includes('button.dataset.openPositionChaseArmed="1"'),"first open-position C click must arm the action");
assert(source.includes('setTimeout(()=>resetOpenPositionRowChaseArm(button),3000)'),"the arm must expire after three seconds");
assert(source.includes('if(button&&button.dataset.openPositionChaseArmed==="1")'),"the second click must recognize the armed state");
assert(source.includes('resetOpenPositionRowChaseArm(button);\n      void toggleRowChase(row,rowType);'),"the confirmed action must reset before invoking the existing chase behavior");
assert(source.includes('if(!isOpenPositionRow(row)||activeRowChase)'),"ordinary entry/exit C buttons must bypass the confirmation gate");

assert(source.includes('<div>Lot</div><div>Chase</div><div>Margin</div>')&&source.includes('<div>Lot</div><div>Chase</div><div>PL</div>'),"entry and exit chase columns must use the Chase header");
assert(source.includes('originalCancelled?"—":isOpenPositionRow(row)?"D":"C"'),"the open-position row must use D while all other idle chase rows use C");
assert(/\.calc-module-row-open-position \.calc-module-row-chase\{[^}]*background:rgba\(220,38,38,\.12\)/s.test(css),"idle open-position D must use a faint red background");
assert(/\.calc-module-row-open-position \.calc-module-row-chase\.is-confirm-armed\{[^}]*background:#b91c1c;[^}]*color:#fff/s.test(css),"armed open-position D must be solid red with white text");
assert(/\.calc-module-row-chase\{[^}]*width:22px;[^}]*height:26px;[^}]*border:1px solid #d9dce1;[^}]*background:#fff;[^}]*font-size:9px/s.test(css),"chase buttons must keep their box dimensions while using a smaller glyph");

const gateStart=source.indexOf("function resetOpenPositionRowChaseArm");
const gateEnd=source.indexOf("function setRowChaseStatus",gateStart);
let timerCallback=null,actionCount=0,open=true;
const classes=new Set();
const button={dataset:{},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},title:"",__openPositionChaseArmTimer:null};
const row={querySelector:()=>button};
const context={
  clearTimeout:()=>{},setTimeout:callback=>{timerCallback=callback;return 1;},
  isOpenPositionRow:()=>open,activeRowChase:null,toggleRowChase:()=>{actionCount++;}
};
vm.createContext(context);
vm.runInContext(source.slice(gateStart,gateEnd),context);
context.handleRowChaseButtonClick(row,"entry");
assert.equal(actionCount,0,"first open-position C click must not fire");
assert.equal(button.dataset.openPositionChaseArmed,"1");
assert(classes.has("is-confirm-armed"));
timerCallback();
assert.equal(actionCount,0,"expiry must fire nothing");
assert(!classes.has("is-confirm-armed"),"expiry must restore idle styling");
context.handleRowChaseButtonClick(row,"entry");
context.handleRowChaseButtonClick(row,"entry");
assert.equal(actionCount,1,"second click inside the arm window must fire exactly once");
assert(!classes.has("is-confirm-armed"),"confirmed action must reset styling");
open=false;
context.handleRowChaseButtonClick(row,"entry");
assert.equal(actionCount,2,"ordinary row C buttons must retain one-click behavior");

console.log("open-position chase confirmation tests: PASS");
