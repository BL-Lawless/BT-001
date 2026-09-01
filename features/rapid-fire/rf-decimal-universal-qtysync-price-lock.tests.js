"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const rapid=fs.readFileSync(path.join(__dirname,"rapidFireModule.js"),"utf8");
const calculator=fs.readFileSync(path.join(root,"features","calculator","presentation","calculatorModule.js"),"utf8");

function between(source,startText,endText){
  const start=source.indexOf(startText);
  const end=source.indexOf(endText,start);
  assert(start>=0&&end>start,`missing source range ${startText}`);
  return source.slice(start,end);
}

const editableIds=[
  "rapidFireOpenSize",
  "rapidFireCloseSize",
  "rapidFireLot",
  "rapidFireMasterSl",
  "rapidFireMasterSlPl",
  "rapidFireTakeProfit",
  "rapidFireTakeProfitPl"
];
for(const id of editableIds){
  assert(new RegExp(`id="${id}" type="text"`).test(rapid),`${id} must use a text draft so the browser cannot erase incomplete decimals`);
}
assert(!/<input(?=[^>]*type="number")(?=[^>]*rapidFire(?:OpenSize|CloseSize|Lot|MasterSl|MasterSlPl|TakeProfit|TakeProfitPl))[^>]*>/i.test(rapid),"no editable RF numeric field may use native number parsing");

for(const binding of [
  "bindNumericDraftInput(lotInput",
  "bindNumericDraftInput(openSize",
  "bindNumericDraftInput(closeSize",
  "bindNumericDraftInput(slInput",
  "bindNumericDraftInput(tpInput",
  "bindNumericDraftInput(slPlInput",
  "bindNumericDraftInput(tpPlInput"
])assert(rapid.includes(binding),`${binding} must use the universal RF numeric lifecycle`);

const draftContext={String,Event};
vm.createContext(draftContext);
vm.runInContext(between(rapid,"function decimalDraft","function bindNumericAdjustControls"),draftContext);
assert.equal(draftContext.decimalDraft("."),".","a lone decimal point must remain a valid editing draft");
assert.equal(draftContext.decimalDraft("0."),"0.","0. must survive until the user types fractional digits");
assert.equal(draftContext.decimalDraft("0.005"),"0.005","a completed decimal draft must remain unchanged before commit");
assert.equal(draftContext.decimalDraft("-0.",true),"-0.","signed P/L drafts must preserve their intermediate decimal state");

class DraftInput extends EventTarget{
  constructor(){super();this.value="";this.dataset={};this.blurred=false;}
  blur(){this.blurred=true;}
}
const input=new DraftInput();
const observed=[];
let commits=0;
draftContext.bindNumericDraftInput(input,{onDraft:value=>observed.push(value),onCommit:()=>{commits+=1;}});
input.value="0.";
input.dispatchEvent(new Event("input"));
assert.equal(input.value,"0.","the shared input event must preserve 0. while actively editing");
assert.deepEqual(observed,["0."],"draft callbacks must receive the preserved intermediate string");
assert.equal(commits,0,"precision clamping must not run during an input keystroke");
input.value="0.005";
input.dispatchEvent(new Event("input"));
assert.equal(commits,0,"completed typing must still wait for commit before normalization");
input.dispatchEvent(new Event("change"));
assert.equal(commits,1,"normalization must run at the shared commit boundary");

const lockContext={num:value=>Number.isFinite(Number(value))?Number(value):null};
vm.createContext(lockContext);
vm.runInContext(between(calculator,"function rapidFireProtectionPriceForUpdate","function isBinanceNoChangeOrderError"),lockContext);
assert.equal(lockContext.rapidFireProtectionPriceForUpdate("101.25",{price:"99.50"},true),"99.50","quantity-only sync must use the freshly read live TP price verbatim");
assert.equal(lockContext.rapidFireProtectionPriceForUpdate("101.25",{price:"99.50"},false),"101.25","manual repricing must still use the user's requested TP price");
assert(calculator.includes('executeRapidFireTakeProfit(null,{reconcile:true,quantityOnly:true,silent:true})'),"position-size reconciliation must explicitly enter quantity-only mode");
assert(calculator.includes('price:normalizedPrice')&&calculator.includes('quantity:normalizedQty.text'),"Binance TP amend must pair the new quantity with the locked existing price");
assert(calculator.includes('closePosition:"true"')&&!between(calculator,"function scheduleRapidFireTakeProfitReconcile","function publishRapidFireStatus").includes("executeRapidFireMasterStop"),"Master SL must remain a close-position order and must not be repriced during size reconciliation");
assert(calculator.includes("const protectionContext=rapidFireProtectionContext")&&calculator.includes("protectionContext.quantity"),"SL/TP P/L must recalculate from the new live position quantity without changing protection prices");
assert(rapid.includes("positionReferenceChanged&&referencePosition")&&rapid.includes('protectionEditDriver[kind]="price"'),"a changed live position reference must stop old P/L targets from deriving a new protection price");

console.log("RF universal decimal drafts and quantity-sync price-lock tests: PASS");
