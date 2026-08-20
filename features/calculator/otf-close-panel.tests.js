"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const floating=fs.readFileSync(path.join(root,"features","shared","floatingWindow.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

assert(html.includes('src="features/shared/floatingWindow.js"'),"the shared floating-window utility must load before Calculator starts");
assert(calculator.includes('id = "otfCloseChaseWindow"'),"the OTF close panel must be a DOM window");
for(const id of ["otfCloseChaseModeMkt","otfCloseChaseModeChs","otfCloseChasePercent","otfCloseChaseQtyInput","otfCloseChaseDist","otfCloseChaseValid","otfCloseChaseConfirm","otfCloseChaseCancel"]){
  assert(calculator.includes(id),`the DOM panel must include ${id}`);
}
assert(calculator.includes("storageKey:OTF_CLOSE_WINDOW_KEY"),"panel geometry must use global browser storage");
assert(calculator.includes("renderOpenPositionClosePanel();\n  }\n  function calculatorIsOpen"),"status updates must render the live DOM panel directly");
assert(!calculator.includes("otfClosePanels"),"the legacy canvas panel render list must be removed");
assert(!/controlType:"open-position-close-(?!toggle)/.test(calculator),"only the chart X toggle may retain a canvas hit box");
assert.equal((calculator.match(/controlType:"open-position-close-toggle"/g)||[]).length,1,"the original chart X must remain the sole close-panel canvas hit target");
assert(calculator.includes('timeInForce:"GTX"'),"the chase order must use post-only GTX");
assert(calculator.includes("hub.getTopOfBook()"),"the chase must use the shared top-of-book source");
assert(calculator.includes('event.type!=="price"'),"the visible OTF preview must listen to the shared TF-independent price events");
assert(calculator.includes("refreshOpenPositionClosePreviewSummary();"),"live price events must refresh the OTF percentage P/L summary without slider input");
assert(calculator.includes('>Validity: Manual</button>')&&calculator.includes('valid.textContent = "Validity: "'),"the validity chip must consistently use the Validity: X label format");
for(const label of ["%","SIZE","P/L"]){
  assert(calculator.includes(`<div class="otf-close-summary-label">${label}</div>`),`the summary must include the ${label} metric label`);
}
assert.equal((calculator.match(/class="otf-close-summary-cell"/g)||[]).length,3,"the summary must render three individual metric cells");
assert(calculator.includes('id="otfCloseChaseConfirm" type="button">Confirm</button>'),"the close action must use the concise Confirm label");
assert(calculator.indexOf('<div class="otf-close-actions">')<calculator.indexOf('<div class="otf-close-live hidden"'),"feedback status must render below the Confirm/Cancel row");
assert(calculator.includes("plText.style.color=moneyColor(infoPl);"),"preview P/L must use the same positive/negative color logic as header P/L");
assert(calculator.includes('id="otfCloseChaseQtyInput" type="number" inputmode="decimal"'),"the SIZE cell must be a directly editable numeric lot input");
assert(calculator.includes('openPositionCloseUi.quantity = null;')&&calculator.includes('setOpenPositionCloseQuantity(event.target.value'),"slider and quantity edits must maintain a two-way selection model");
assert(calculator.includes('qtyInput.step=String(preview.stepSize);')&&calculator.includes('qtyInput.max=String(preview.maxQty);'),"the quantity input must expose the symbol step and live position maximum");
assert(calculator.includes('typeof rules.helper.normalizeQty==="function"'),"quantity edits must use the shared symbol quantity normalizer");

const subscriptionStart=calculator.indexOf("function stopOpenPositionCloseLivePriceSubscription");
const subscriptionEnd=calculator.indexOf("function renderOpenPositionClosePanel",subscriptionStart);
let listener=null,unsubscribed=0,previewRefreshes=0;
const subscriptionContext={
  openPositionCloseLivePriceUnsubscribe:null,
  openPositionCloseLivePriceFrame:null,
  openPositionCloseUi:{open:true},
  window:{PUBLIC_MARKET_DATA_HUB:{subscribe:next=>{listener=next;return()=>{unsubscribed++;};}}},
  currentSymbol:()=>"BTCUSDT",
  toUpper:value=>String(value||"").toUpperCase(),
  refreshOpenPositionClosePreviewSummary:()=>{previewRefreshes++;},
  requestAnimationFrame:callback=>{callback();return 1;},
  cancelAnimationFrame:()=>{},clearTimeout:()=>{},setTimeout:callback=>{callback();return 1;},Math
};
vm.createContext(subscriptionContext);
vm.runInContext(calculator.slice(subscriptionStart,subscriptionEnd),subscriptionContext);
subscriptionContext.syncOpenPositionCloseLivePriceSubscription(true);
listener({type:"price",symbol:"BTCUSDT",price:62000});
assert.equal(previewRefreshes,1,"a live market price tick must update the visible OTF preview without slider interaction");
subscriptionContext.syncOpenPositionCloseLivePriceSubscription(false);
assert.equal(unsubscribed,1,"closing the OTF panel must release its live-price subscription");

const quantityStart=calculator.indexOf("function symbolLotSizeRules");
const quantityEnd=calculator.indexOf("function normalizedChasePrice",quantityStart);
const quantityContext={
  window:{BT001SymbolTradingSettings:{
    getCached:()=>({stepSize:0.001,filters:[{filterType:"LOT_SIZE",stepSize:"0.001",minQty:"0.001"}]}),
    normalizeQty:value=>(Math.round(Number(value)/0.001)*0.001).toFixed(3)
  }},
  currentSymbol:()=>"BTCUSDT",toUpper:value=>String(value||"").toUpperCase(),
  num:value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;},
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
  openPositionCloseUi:{percent:0,quantity:null},
  openPositionClosePreviewPosition:()=>({qty:0.01,entry:100,side:"LONG"}),
  currentPriceReference:()=>101,direction:"LONG",Math,Number,String,Array
};
vm.createContext(quantityContext);
vm.runInContext(calculator.slice(quantityStart,quantityEnd),quantityContext);
let quantityPreview=quantityContext.setOpenPositionCloseQuantity(0.0056,{allowZero:false});
assert.equal(quantityPreview.roundedQty,0.006,"typed quantities must normalize to the symbol lot step");
assert.equal(quantityContext.openPositionCloseUi.percent,60,"typing a quantity must move the percentage selection");
quantityPreview=quantityContext.setOpenPositionCloseQuantity(1,{allowZero:false});
assert.equal(quantityPreview.roundedQty,0.01,"typed quantities must clamp to the live position size");
assert.equal(quantityContext.openPositionCloseUi.percent,100,"a quantity clamped to the position size must move the slider to 100%");
quantityPreview=quantityContext.setOpenPositionCloseQuantity(0.0001,{allowZero:false});
assert.equal(quantityPreview.roundedQty,0.001,"typed quantities must clamp to the minimum symbol lot");
quantityContext.openPositionCloseUi.quantity=null;
quantityContext.openPositionCloseUi.percent=55;
quantityPreview=quantityContext.openPositionClosePreview({qty:0.01,entry:100,side:"LONG"});
assert.equal(quantityPreview.roundedQty,0.005,"slider quantities must retain the existing downward lot-step rounding");

assert(floating.includes('["n","ne","e","se","s","sw","w","nw"].forEach(edge => {'),"all eight resize edges must be installed");
assert(floating.includes("localStorage.setItem(key,JSON.stringify(value))"),"window geometry must persist through localStorage");
assert(floating.includes("(window.innerWidth - width) / 2") && floating.includes("(window.innerHeight - height) / 2"),"first-open geometry must be centered");
const otfCss=css.slice(css.indexOf(".otf-close-window{"),css.indexOf(".calc-module-window.is-collapsed",css.indexOf(".otf-close-window{")));
assert(otfCss.includes("min-width:360px") && otfCss.includes("min-height:240px"),"the compact DOM panel must enforce its reduced size floor");
assert(otfCss.includes("background:#f3f5f7")&&otfCss.includes("background:#eef0f2")&&otfCss.includes("border:1px solid #d9dce1"),"the OTF panel must use Calculator's neutral grey palette");
for(const warmColor of ["#fffdf8","#fff8e8","#53351f","#d6c6aa","#b7791f","#7c4700","#8b5e14","#267a50","#eaf8f0","#166534","#cf8585","#fff0f0","#991b1b"]){
  assert(!otfCss.includes(warmColor),`the OTF panel must not retain warm/green/red color ${warmColor}`);
}
assert(otfCss.includes("border-radius:6px")&&otfCss.includes("border-radius:5px"),"window and control corners must use subtle Calculator-like radii");
assert(otfCss.includes(".otf-close-summary-cell{")&&otfCss.includes("border:1px solid #e6e8ea")&&otfCss.includes("background:#fff"),"summary metrics must match Calculator's white bordered cells");
assert(otfCss.includes(".otf-close-summary-label{")&&otfCss.includes("font-size:9px")&&otfCss.includes("color:#707a8a"),"summary labels must match Calculator's small muted metric labels");
assert(otfCss.includes(".otf-close-summary-value{")&&otfCss.includes("font-size:14px")&&otfCss.includes("font-weight:700"),"summary values must match Calculator's bold metric values");
assert(otfCss.includes(".otf-close-summary-input{")&&otfCss.includes("background:transparent")&&otfCss.includes("text-align:center"),"the editable SIZE value must retain the white summary-cell presentation");
assert(/\.otf-close-label\{[^}]*font-weight:400/s.test(otfCss),"section labels must use regular font weight");
assert(/\.otf-close-live\.is-error\{[^}]*color:#f6465d/s.test(otfCss),"error feedback must retain its red status state");

console.log("OTF close DOM panel tests: PASS");
