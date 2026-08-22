"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const bootstrap=fs.readFileSync(path.join(root,"features","calculator","index.js"),"utf8");
const calculator=fs.readFileSync(path.join(root,"features","calculator","presentation","calculatorModule.js"),"utf8");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const rapid=fs.readFileSync(path.join(__dirname,"rapidFireModule.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"rapid-fire.css"),"utf8");

assert(html.indexOf('id="rapidFireBtn"')<html.indexOf('id="ssscDashBtn"'),"Rapid Fire trigger must sit immediately left of SSSC");
assert(bootstrap.includes('await loadScript("features/rapid-fire/rapidFireModule.js")'),"Rapid Fire must load after Calculator exposes its execution bridge");
for(const id of ["rapidFireWindow","rapidFireSize","rapidFirePl","rapidFirePlPercent","rapidFireDir","rapidFireLot","rapidFireAdd","rapidFireDouble","rapidFireBreakeven","rapidFireClose","rapidFireClosePercent","rapidFireReverse","rapidFireReversePercent","rapidFireStatus"]){
  assert(rapid.includes(id),`Rapid Fire must render ${id}`);
}
assert(rapid.includes("storageKey:WINDOW_KEY")&&rapid.includes("window.BT001FloatingWindow"),"Rapid Fire must use persisted shared floating-window behavior");
assert(rapid.includes('id="rapidFireDir" type="button">LONG</button>')&&!rapid.includes("rapid-fire-dir-label"),"DIR selector must display only LONG or SHORT without a DIR label");
assert(css.includes(".rapid-fire-dir.is-long")&&css.includes(".rapid-fire-dir.is-short")&&css.includes("rgba(31,41,55,.42)"),"DIR selector must use pale directional styling with a thin dark edge");
assert(/\.rapid-fire-dir\.is-locked\{[^}]*font-weight:700/s.test(css)&&css.includes(".rapid-fire-dir.is-locked.is-long{color:#166534}")&&css.includes(".rapid-fire-dir.is-locked.is-short{color:#991b1b}"),"locked DIR text must remain bold and direction-colored without replacing the pale box");
assert(rapid.includes('button.dataset.armed="1"')&&rapid.includes("setTimeout(resetDoubleArm,3000)"),"Double must use the three-second arm/confirm gate");
assert(rapid.includes('executeOrCancel({action:"add"')&&rapid.includes('executeOrCancel({action:"close"')&&rapid.includes('executeOrCancel({action:"reverse"'),"Add, Close, and Reverse triggers must dispatch their chase actions");
assert(rapid.includes('button.textContent="Cancel"')&&rapid.includes("await bridge.cancel()"),"the active action trigger must provide manual cancellation");
assert(rapid.includes('button.classList.toggle("is-cancel",active&&action!=="breakeven")')&&css.includes(".rapid-fire-button.is-cancel"),"Add, DBL, Close, and Reverse must all use the unified reddish in-flight Cancel state");
assert.equal((rapid.match(/id="rapidFireClose"/g)||[]).length,1,"Close must use one physical title/Cancel button");
assert.equal((rapid.match(/id="rapidFireReverse"/g)||[]).length,1,"Reverse must use one physical title/Cancel button");
assert(rapid.includes('id="rapidFireClose" type="button">Close</button>')&&rapid.includes('id="rapidFireReverse" type="button">Reverse</button>'),"row titles must be the only Close and Reverse triggers");
assert(rapid.includes('actionLabels={add:"ADD",double:"DBL",close:"Close",reverse:"Reverse"'),"action buttons must return to their shortened labels when idle");
assert(rapid.indexOf('id="rapidFireReverse"')<rapid.indexOf('id="rapidFireClose"'),"Reverse row must render above Close");
assert(rapid.indexOf('id="rapidFireStatus"')>rapid.indexOf('id="rapidFireClosePercentText"'),"status must be the full-width bottom row");
assert(rapid.includes("bridge.breakevenLock()")&&calculator.includes("breakevenLock:executeRapidFireBreakevenLock"),"B.E. must call the Calculator execution bridge");
assert(calculator.includes('timeInForce:"GTX"')&&calculator.includes('owner:"RAPID_FIRE"'),"Rapid Fire writes must use tracked GTX orders");
assert(calculator.includes('gateway.commissionRate(symbol)')&&calculator.includes('type:"STOP_MARKET"'),"B.E. must use the live Binance commission rate and existing STOP_MARKET path");
assert(calculator.includes('source:"actual-open-fill-commission"')&&calculator.includes("marker.fee"),"B.E. must prefer the actual allocated entry commission already paid");
assert(calculator.includes('requested=Math.max(0,num(liveQtyValue)||0)*(1+clamp(num(reversePercent)||0,25,300)/100)'),"Reverse quantity must be position size times one plus the selected percentage");
assert(calculator.includes("openPositionCloseUi.chsDistTicks")&&calculator.includes("openPositionCloseUi.chsValidKey"),"Rapid Fire must consume OTF's shared chase settings");
assert(calculator.includes('if(action!=="add"&&!hasPosition)')&&calculator.includes('hasPosition?liveSide'),"DIR must follow an open position while flat Add can use the selected direction");
assert(calculator.includes('if(action==="double") requested=Math.abs(num(live.qty)||0)')&&rapid.includes('quantity:q("rapidFireLot").value'),"Double must use live position size independently of Add's lot input");
assert(rapid.includes('bridge.snapshot({closePercent:closeSlider?closeSlider.value:100})')&&!rapid.includes('closePercent:reverseSlider'),"only the Close slider may drive Rapid Fire summary P/L");
assert(calculator.includes('setOrdersVisibilityConsumer("rapid-fire",active===true)')&&calculator.includes("function effectiveOrdersVisible()"),"Rapid Fire visibility must force the existing Orders overlay mechanism without overwriting manual state");
assert(css.includes("grid-template-columns:repeat(3,minmax(0,1fr))")&&css.includes("border:1px solid #e6e8ea"),"Rapid Fire summary must match Calculator's white bordered-cell style");
assert(css.includes("height:258px")&&css.includes("min-height:258px"),"Rapid Fire window must fit its content without the former dead space");
assert(/\.rapid-fire-lot\{[^}]*width:100%/s.test(css)&&css.includes("grid-template-columns:82px 86px repeat(3,minmax(0,1fr))"),"DIR must match the row-title width while ADD, DBL, and B.E. share the remaining width equally");
assert(/\.rapid-fire-status\{[^}]*width:100%;[^}]*height:34px/s.test(css),"status must be a full-width single-line bottom row");
assert(css.includes(".rapid-fire-slider-ticks i")&&rapid.includes("sliderTicks(REVERSE_PERCENT_STEPS,25,300,100)"),"both sliders must render discrete tick markers");
assert(css.includes(".rapid-fire-slider-ticks i.is-reference{background:#4b5563}")&&css.includes(".rapid-fire-reverse-slider::-moz-range-progress"),"Reverse must emphasize 100 percent and suppress its progress fill");
assert(rapid.includes('q("rapidFireStatus").addEventListener("click",()=>setStatus(""),false)'),"clicking RF status must clear its message");
assert(rapid.includes('rapid-fire-summary-label">Position Size')&&!rapid.includes("Open Position Size"),"position summary must use the shortened label");
assert(rapid.includes("snapshot.closeQty")&&rapid.includes("rapid-fire-size-closed")&&rapid.includes("rapid-fire-size-remaining"),"position size must always render closed and remaining quantities");
assert(css.includes(".rapid-fire-size-closed{color:#4b5563}")&&css.includes(".rapid-fire-size-remaining{color:#111}"),"closed quantity must be dark grey and remaining quantity black");
assert(css.includes("background:#aeb4bc")&&css.includes("background:#6b7280")&&rapid.includes('--rapid-fire-range-progress'),"slider fill must be lighter grey without changing the thumb color");
assert(calculator.includes("const normalizedClose=normalizeRapidFireQuantity(requestedCloseQty,{roundDown:true})")&&calculator.includes("normalizedClose.executable?")&&rapid.includes("remaining:size-closed"),"Close display must round only the executable close quantity and derive remainder by subtraction");
assert(main.includes('window.BT001_RAPID_FIRE_VISIBLE===true')&&main.includes("const floatingOn = !cb || cb.checked")&&main.includes("return !cb || cb.checked"),"RF must force only the Expected P/L cursor label while marker visibility follows the manual toggle");
assert(calculator.includes("handleEffectiveOrdersVisibilityChange"),"RF Orders release must still use the effective visibility transition for OTF shutdown");
const tradingWriteSource=main.slice(main.indexOf("async function tradingWrite"),main.indexOf("window.BT001_BINANCE_TRADING",main.indexOf("async function tradingWrite")));
assert(tradingWriteSource.includes('markPrivateDirty21({positionDirty:true,ordersDirty:true},"scalp-order-write",{immediate:true})'),"remaining direct gateway writes must retain private-state reconciliation");
assert(tradingWriteSource.includes('cache.refresh({reason:"trading-order-write",maxAgeMs:0})'),"remaining direct gateway writes must retain chart-marker synchronization");
const rapidChaseSource=calculator.slice(calculator.indexOf("function ensureRapidFireChaseEngine"),calculator.indexOf("async function cancelRapidFireChase"));
const otfChaseSource=calculator.slice(calculator.indexOf("function ensureOpenPositionCloseChaseEngine"),calculator.indexOf("async function cancelOpenPositionCloseChs"));
for(const source of [rapidChaseSource,otfChaseSource]){
  assert(source.includes("PUBLIC_MARKET_DATA_HUB")&&source.includes("getTopOfBook")&&source.includes("ensureTopOfBook"),"RF and OTF chase must use the shared live top-of-book source");
  assert(source.includes("normalizedChasePrice")&&source.includes('signedOrderWrite("PUT"'),"RF and OTF chase must share price normalization and signed chase amendments");
}
assert(rapidChaseSource.includes('signedOrderWrite("POST"')&&otfChaseSource.includes("submitOpenPositionCloseChsLimit"),"RF and OTF initial placements must remain on their established signed chase write paths");
assert(!rapidChaseSource.includes("BT001_BINANCE_TRADING")&&!rapidChaseSource.includes("tradingWrite"),"Add, Double, Close, and Reverse must not route through the direct RF Target gateway");
for(const action of ["add","double","close","reverse"])assert(rapidChaseSource.includes(`action===\"${action}\"`)||action==="add","all RF actions must remain in the shared chase execution path");
assert(rapid.includes("const REVERSE_PERCENT_STEPS=Object.freeze([25,...Array.from({length:28},(_value,index)=>(index+3)*10)])"),"Reverse steps must be 25, then every 10 percent from 30 through 300");

const snapStart=rapid.indexOf("function snapPercent");
const snapEnd=rapid.indexOf("function sliderTicks",snapStart);
const snapContext={number:value=>Number.isFinite(Number(value))?Number(value):null,Array,Math};
vm.createContext(snapContext);
vm.runInContext(rapid.slice(snapStart,snapEnd),snapContext);
const reverseSteps=[25,...Array.from({length:28},(_value,index)=>(index+3)*10)];
assert.equal(snapContext.snapPercent(27,reverseSteps),25,"Reverse must preserve its 25 percent lower endpoint");
assert.equal(snapContext.snapPercent(28,reverseSteps),30,"Reverse must snap to the nearest ten-percent point above its endpoint");
assert.equal(snapContext.snapPercent(296,reverseSteps),300,"Reverse must snap through the 300 percent endpoint");

const sizePartsStart=rapid.indexOf("function positionSizeParts");
const sizePartsEnd=rapid.indexOf("function isOpen",sizePartsStart);
const sizePartsContext={number:value=>Number.isFinite(Number(value))?Number(value):null,Math};
vm.createContext(sizePartsContext);
vm.runInContext(rapid.slice(sizePartsStart,sizePartsEnd),sizePartsContext);
assert.deepEqual({...sizePartsContext.positionSizeParts(1.25,0)},{closed:0,remaining:1.25},"0 percent Close must leave the full position open");
assert.deepEqual({...sizePartsContext.positionSizeParts(1.25,1.25)},{closed:1.25,remaining:0},"100 percent Close must show the full position as closed and zero remaining");
assert.deepEqual({...sizePartsContext.positionSizeParts(1.25,.5)},{closed:.5,remaining:.75},"position-size split must reflect the Close slider quantity");

const closeMetricsStart=calculator.indexOf("function rapidFireCloseMetrics");
const closeMetricsEnd=calculator.indexOf("function rapidFireSnapshot",closeMetricsStart);
const closeMetricsContext={num:value=>Number.isFinite(Number(value))?Number(value):null,clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),Math};
vm.createContext(closeMetricsContext);
vm.runInContext(calculator.slice(closeMetricsStart,closeMetricsEnd),closeMetricsContext);
const halfMetrics=closeMetricsContext.rapidFireCloseMetrics(120,600,50);
assert.equal(halfMetrics.floatingPl,60,"50 percent Close selection must display half the full-position floating P/L");
assert.equal(halfMetrics.floatingPlPercent,10,"50 percent Close selection must display the selected P/L contribution against position margin");

const reverseStart=calculator.indexOf("function openPositionReverseOrderQuantity");
const reverseEnd=calculator.indexOf("function normalizedChasePrice",reverseStart);
const reverseContext={
  window:{BT001SymbolTradingSettings:{
    getCached:()=>({stepSize:.001,filters:[{filterType:"LOT_SIZE",stepSize:"0.001",minQty:"0.001",maxQty:"100"}]}),
    normalizeQty:value=>(Math.round(Number(value)/.001)*.001).toFixed(3)
  }},
  currentSymbol:()=>"BTCUSDT",toUpper:value=>String(value||"").toUpperCase(),
  num:value=>Number.isFinite(Number(value))?Number(value):null,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),Math,Number,String,Array
};
vm.createContext(reverseContext);
vm.runInContext(calculator.slice(reverseStart,reverseEnd),reverseContext);
assert.equal(reverseContext.openPositionReverseOrderQuantity(.01,25).requested,.0125,"25 percent reverse must request 1.25x current size");
assert.equal(reverseContext.openPositionReverseOrderQuantity(.01,300).requested,.04,"300 percent reverse must request 4x current size");

const breakevenStart=calculator.indexOf("function feeAwareBreakevenStop");
const breakevenEnd=calculator.indexOf("async function replaceMasterStopAtBreakeven",breakevenStart);
const breakevenContext={num:value=>Number.isFinite(Number(value))?Number(value):null,toUpper:value=>String(value||"").toUpperCase(),Math,Error};
vm.createContext(breakevenContext);
vm.runInContext(calculator.slice(breakevenStart,breakevenEnd),breakevenContext);
const longBe=breakevenContext.feeAwareBreakevenStop(100,1,.05,"LONG",.0005,.01);
const shortBe=breakevenContext.feeAwareBreakevenStop(100,1,.05,"SHORT",.0005,.01);
assert(longBe.rounded>100,"fee-aware LONG breakeven must round above entry");
assert(shortBe.rounded<100,"fee-aware SHORT breakeven must round below entry");
assert.equal(longBe.rounded,100.11,"LONG breakeven must cover entry and taker STOP_MARKET exit fees");
assert.equal(shortBe.rounded,99.9,"SHORT breakeven must cover entry and taker STOP_MARKET exit fees");

console.log("Rapid Fire module tests: PASS");
