"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const rapid=fs.readFileSync(path.join(__dirname,"rapidFireModule.js"),"utf8");
const calculator=fs.readFileSync(path.join(root,"features","calculator","presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"rapid-fire.css"),"utf8");

function between(source,startText,endText){
  const start=source.indexOf(startText);
  const end=source.indexOf(endText,start);
  assert(start>=0&&end>start,`missing source range ${startText}`);
  return source.slice(start,end);
}

assert(/id="rapidFireTakeProfitPl" type="text"/.test(rapid)&&rapid.includes('id="rapidFireTakeProfitPlUp"')&&rapid.includes('id="rapidFireTakeProfitPlDown"'),"TP P/L must expose decimal-safe custom spinner arrows");
assert(rapid.includes('upButton,downButton,step:0.5,precision:2')&&rapid.includes('bindNumericAdjustControls(numericControllers.tpPl,protectionAdjustOptions("tp","pl"'),"TP P/L arrows and wheel must retain a shared 0.5 step and two-decimal precision");
assert(rapid.includes("function protectionPlText(value)")&&rapid.includes("parsed.toFixed(2)"),"P/L display must use two decimal places");

const protectionMarkup=between(rapid,'<div class="rapid-fire-protection-row"','</div>\n      </div>`');
const protectionOrder=["rapidFireMasterSl","rapidFireMasterSlPl","rapidFireTakeProfit","rapidFireTakeProfitPl","rapidFireTakeProfitSet","rapidFireNewAverageToggle"].map(id=>protectionMarkup.indexOf(`id="${id}"`));
assert(protectionOrder.every((position,index)=>position>=0&&(index===0||position>protectionOrder[index-1])),"the row order must be SL Price, SL P/L, TP Price, TP P/L, Set, then Average toggle");
assert(/\.rapid-fire-protection-row\{[^}]*display:flex;[^}]*gap:5px;/s.test(css)&&/\.rapid-fire-new-average-toggle\{[^}]*width:58px;[^}]*flex:0 0 58px;/s.test(css),"the protection row must retain its five-pixel spacing and compact Average allocation");
assert(!protectionMarkup.includes('<span>Avg</span>')&&protectionMarkup.includes('id="rapidFireNewAverageToggle"'),"the Average toggle must contain no text label");
assert(calculator.includes("if(window.BT001_RAPID_FIRE_VISIBLE!==true||!rapidFireNewAverageVisible)return null;"),"the New Average toggle must gate projection rendering");
assert(rapid.includes("bridge.setNewAverageVisible(next)")&&calculator.includes("setNewAverageVisible:setRapidFireNewAverageVisible"),"the row toggle must update Calculator projection state");

const numericFieldControls=[
  {name:"Add quantity",input:"rapidFireLot",up:"rapidFireLotUp",down:"rapidFireLotDown",binding:"bindNumericAdjustControls(lotController"},
  {name:"Remaining",input:"rapidFireOpenSize",up:"rapidFireOpenSizeUp",down:"rapidFireOpenSizeDown",binding:"bindNumericAdjustControls(sizeControllers.remaining"},
  {name:"Close",input:"rapidFireCloseSize",up:"rapidFireCloseSizeUp",down:"rapidFireCloseSizeDown",binding:"bindNumericAdjustControls(sizeControllers.close"},
  {name:"SL Price",input:"rapidFireMasterSl",up:"rapidFireMasterSlUp",down:"rapidFireMasterSlDown",binding:"bindNumericAdjustControls(numericControllers.slPrice"},
  {name:"SL P/L",input:"rapidFireMasterSlPl",up:"rapidFireMasterSlPlUp",down:"rapidFireMasterSlPlDown",binding:"bindNumericAdjustControls(numericControllers.slPl"},
  {name:"TP Price",input:"rapidFireTakeProfit",up:"rapidFireTakeProfitUp",down:"rapidFireTakeProfitDown",binding:"bindNumericAdjustControls(numericControllers.tpPrice"},
  {name:"TP P/L",input:"rapidFireTakeProfitPl",up:"rapidFireTakeProfitPlUp",down:"rapidFireTakeProfitPlDown",binding:"bindNumericAdjustControls(numericControllers.tpPl"}
];
for(const field of numericFieldControls){
  assert(new RegExp(`id="${field.input}" type="text"`).test(rapid),`${field.name} must remain a decimal-safe text input`);
  assert(rapid.includes(`id="${field.up}"`)&&rapid.includes(`id="${field.down}"`),`${field.name} must expose both custom spinner buttons`);
  assert(rapid.includes(field.binding),`${field.name} must use the shared arrow/wheel controller`);
}
assert.equal((rapid.match(/bindNumericAdjustControls\(/g)||[]).length,8,"exactly seven fields plus the shared definition must use the unified adjust-control path");
assert.equal((rapid.match(/class="rapid-fire-number-control/g)||[]).length,7,"all seven numeric fields must inherit hover/focus spinner visibility from the shared wrapper");
assert(/\.rapid-fire-number-steppers\{[^}]*opacity:0;[^}]*visibility:hidden;[^}]*pointer-events:none;/s.test(css),"all seven shared spinner controls must be hidden and non-interactive by default");
assert(css.includes(".rapid-fire-number-control:hover .rapid-fire-number-steppers")&&css.includes(".rapid-fire-number-control:focus-within .rapid-fire-number-steppers"),"all seven shared spinner controls must reveal on field hover or focus");
assert(/\.rapid-fire-number-control:focus-within \.rapid-fire-number-steppers\{[^}]*opacity:1;[^}]*visibility:visible;[^}]*pointer-events:auto;/s.test(css),"revealed shared spinner controls must become visible and interactive");
assert(rapid.includes('{passive:false}')&&rapid.includes("event.preventDefault()"),"wheel handlers must suppress native page/input scrolling");
assert(rapid.includes("const NUMERIC_HOLD_DELAY_MS=320")&&rapid.includes("const NUMERIC_HOLD_INTERVAL_MS=80")&&rapid.includes('button.addEventListener("mouseleave",stopHold,false)')&&rapid.includes('document.addEventListener("mouseup",stopHold,{once:true})'),"all seven shared spinner bindings must repeat after a short delay and stop on leave or mouse-up");
assert(/\.rapid-fire-protection-price\{[^}]*padding:4px 18px 4px 3px;/s.test(css)&&/\.rapid-fire-protection-pl\{[^}]*padding:4px 18px 4px 3px;/s.test(css),"price and P/L text must keep three pixels on each side plus a permanently reserved fifteen-pixel spinner");
assert(/\.rapid-fire-protection-price-control\{[^}]*min-width:calc\(7ch \+ 23px\);[^}]*flex:1 0 calc\(7ch \+ 23px\);/s.test(css)&&/\.rapid-fire-protection-pl-control\{[^}]*min-width:calc\(6ch \+ 23px\);[^}]*flex:1 0 calc\(6ch \+ 23px\);/s.test(css),"all four value fields must receive the same flex-grow share above their exact content minima");

const wheelContext={number:value=>Number.isFinite(Number(value))?Number(value):null,Math};
vm.createContext(wheelContext);
vm.runInContext(between(rapid,"function protectionWheelValue","function positionSizeParts"),wheelContext);
assert.equal(wheelContext.protectionWheelValue("100.00","0.01",1,2),100.01,"price wheel-up must add one live tick");
assert.equal(wheelContext.protectionWheelValue("100.00","0.01",-1,2),99.99,"price wheel-down must subtract one live tick");
assert.equal(wheelContext.protectionWheelValue("1.00","0.5",1,2),1.5,"P/L wheel-up must add 0.5");

const settings={
  tickSize:"0.01000000",
  stepSize:"0.00100000",
  filters:[
    {filterType:"PRICE_FILTER",tickSize:"0.01000000"},
    {filterType:"LOT_SIZE",stepSize:"0.00100000",minQty:"0.00100000",maxQty:"1000.00000000"}
  ]
};
const precisionContext={
  window:{BT001SymbolTradingSettings:{
    getCached:()=>settings,
    normalizePrice:value=>(Math.round(Number(value)/.01)*.01).toFixed(2),
    normalizeQty:value=>(Math.round(Number(value)/.001)*.001).toFixed(3)
  }},
  currentSymbol:()=>"BTCUSDT",
  toUpper:value=>String(value||"").toUpperCase(),
  num:value=>Number.isFinite(Number(value))?Number(value):null,
  Math,Number,String,Array,Object
};
vm.createContext(precisionContext);
vm.runInContext(between(calculator,"function rapidFirePrecision","function rapidFireOpenEntryCommission"),precisionContext);
assert.equal(precisionContext.rapidFirePriceRules().precision,2,"PRICE_FILTER precision must come from the live tick string");
assert.equal(precisionContext.rapidFireLotRules().precision,3,"LOT_SIZE precision must come from the live step string");
assert.equal(precisionContext.normalizeRapidFirePrice("123.456").text,"123.46","price fields must normalize to a valid live tick");
assert.equal(precisionContext.normalizeRapidFireQuantity("0.0126").text,"0.013","lot fields must normalize to a valid live step");
assert.equal(precisionContext.rapidFirePrecision("1.00000000"),0,"integer-tick symbols must display zero price decimals");
assert.equal(precisionContext.rapidFirePrecision("0.10"),1,"BTC-style tenth ticks must display one price decimal");
assert.equal(precisionContext.rapidFirePrecision("0.01000"),2,"trailing filter zeros must not create rejected extra decimals");
assert.equal(precisionContext.rapidFirePrecision("0.00010000"),4,"small-tick symbols must retain all accepted decimals");
precisionContext.window.BT001SymbolTradingSettings.getCached=()=>null;
assert.equal(precisionContext.rapidFireLotRules().available,false,"RF must not invent a fallback lot step when Binance filters are unavailable");
assert.equal(precisionContext.rapidFirePriceRules().available,false,"RF must not invent a fallback price tick when Binance filters are unavailable");
assert(!rapid.includes("Math.max(3,number(rules.precision)"),"RF lot display must not force three decimals over the symbol's live precision");
assert(calculator.includes("Binance LOT_SIZE step size is unavailable for the current symbol.")&&calculator.includes("Binance PRICE_FILTER tick size is unavailable for the current symbol."),"real-order paths must fail closed when live Binance filters are unavailable");

const signatureContext={String};
vm.createContext(signatureContext);
vm.runInContext(between(rapid,"function protectionOrderSignature","function normalizedPriceText"),signatureContext);
assert.notEqual(
  signatureContext.protectionOrderSignature({orderId:"7",price:"100.00",quantity:"1"}),
  signatureContext.protectionOrderSignature({orderId:"7",price:"100.01",quantity:"1"}),
  "an external in-place order move must change the authoritative RF signature"
);
assert(rapid.includes("authoritativeProtectionChange.sl||authoritativeProtectionChange.tp")&&rapid.includes("protectionEditDriver[kind]=\"price\""),"authoritative order changes must replace active drafts and reset P/L driving state");
assert(calculator.includes("scheduleRapidFireLiveOrderSync()")&&calculator.includes('new CustomEvent("bt001:rapid-fire-live-sync"')&&rapid.includes('window.addEventListener("bt001:rapid-fire-live-sync",render,false)'),"external Binance/OTF state changes must flow back into RF immediately after authoritative refresh");

console.log("RF field controls, live-sync, and Binance precision regression tests: PASS");
