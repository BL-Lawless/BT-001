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
for(const id of ["rapidFireWindow","rapidFireOpenSize","rapidFireCloseSize","rapidFirePl","rapidFirePlPercent","rapidFireDir","rapidFireLot","rapidFireAdd","rapidFireDouble","rapidFireBreakeven","rapidFireClose","rapidFireClosePercent","rapidFireReverse","rapidFireReversePercent","rapidFireStatus","rapidFireMasterSl","rapidFireMasterSlPl","rapidFireTakeProfit","rapidFireTakeProfitSet","rapidFireTakeProfitPl","rapidFireNewAverageToggle"]){
  assert(rapid.includes(id),`Rapid Fire must render ${id}`);
}
assert(rapid.includes("storageKey:WINDOW_KEY")&&rapid.includes("window.BT001FloatingWindow"),"Rapid Fire must use persisted shared floating-window behavior");
assert(rapid.includes('WINDOW_KEY="btc_futures_chart_v13_rapid_fire_window_v3"'),"Rapid Fire must bump its persisted geometry key after compacting the window");
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
assert(rapid.indexOf('id="rapidFireStatus"')>rapid.indexOf('id="rapidFireClosePercentText"')&&rapid.indexOf('rapid-fire-protection-row')>rapid.indexOf('id="rapidFireStatus"'),"status must span the width above the new protection row");
assert(rapid.includes("bridge.breakevenLock()")&&calculator.includes("breakevenLock:executeRapidFireBreakevenLock"),"B.E. must call the Calculator execution bridge");
assert(calculator.includes('timeInForce:"GTX"')&&calculator.includes('owner:"RAPID_FIRE"'),"Rapid Fire writes must use tracked GTX orders");
assert(main.includes('amendOrder:params=>tradingWrite("/fapi/v1/order","PUT",params)')&&calculator.includes("gateway.amendOrder")&&calculator.includes("originalOrderId"),"RF TP must amend price and full-position quantity in place through Binance's direct gateway");
assert(calculator.includes("rapidFireTakeProfitStateMatches(rapidFireTakeProfitOrder,normalizedPrice,normalizedQty.quantity)")&&calculator.includes('message:"TP — No change"'),"an unchanged normalized TP price and quantity must no-op before Binance amend");
assert(calculator.includes("isBinanceNoChangeOrderError(error)")&&calculator.includes("syncRapidFireTakeProfitFromSnapshot(await readOpenOrdersSnapshot({binanceRestGateBypass:true}))"),"a raced Binance no-change rejection must force an authoritative refresh and resolve as a no-op only when live state matches");
assert(calculator.includes('if(typeof gateway.submitOrder!=="function")throw new Error("Binance TP submission is unavailable.")')&&calculator.includes("response=await gateway.submitOrder(send)"),"new RF TP orders must reach the direct Binance submitOrder gateway");
assert(calculator.includes('("RF_TP_"+Date.now()')&&calculator.includes("/^RF_TP_/.test"),"RF TP must carry and rediscover its dedicated clientOrderId prefix");
assert(calculator.includes('else send.reduceOnly="true"')&&calculator.includes('roleType:"EXIT",owner:"RAPID_FIRE"'),"RF TP must be a tracked reduce-only exit independent of Calculator send");
assert(calculator.includes('gateway.commissionRate(symbol)')&&calculator.includes('type:"STOP_MARKET"'),"B.E. must use the live Binance commission rate and existing STOP_MARKET path");
assert(calculator.includes('source:"actual-open-fill-commission"')&&calculator.includes("marker.fee"),"B.E. must prefer the actual allocated entry commission already paid");
assert(calculator.includes('requested=Math.max(0,num(liveQtyValue)||0)*(1+clamp(num(reversePercent)||0,25,300)/100)'),"Reverse quantity must be position size times one plus the selected percentage");
assert(calculator.includes("openPositionCloseUi.chsDistTicks")&&calculator.includes("openPositionCloseUi.chsValidKey"),"Rapid Fire must consume OTF's shared chase settings");
assert(calculator.includes('if(action!=="add"&&!hasPosition)')&&calculator.includes('hasPosition?liveSide'),"DIR must follow an open position while flat Add can use the selected direction");
assert(calculator.includes('if(action==="double") requested=Math.abs(num(live.qty)||0)')&&rapid.includes('quantity:q("rapidFireLot").value'),"Double must use live position size independently of Add's lot input");
assert(rapid.includes("closePercent:closeSlider?closeSlider.value:100")&&rapid.includes("closeQty:closeQuantityOverride")&&!rapid.includes('closePercent:reverseSlider'),"only the Close controls may drive Rapid Fire summary P/L");
assert(calculator.includes('setOrdersVisibilityConsumer("rapid-fire",active===true)')&&calculator.includes("function effectiveOrdersVisible()"),"Rapid Fire visibility must force the existing Orders overlay mechanism without overwriting manual state");
assert(css.includes("grid-template-columns:repeat(4,minmax(0,1fr))")&&css.includes("border:1px solid #e6e8ea"),"Remaining, Close, and P/L summary boxes must share Calculator's bordered-cell style");
assert(css.includes("height:284px")&&css.includes("min-height:272px")&&rapid.includes("minHeight:272,defaultWidth:500,defaultHeight:284"),"Rapid Fire must open compactly and permit resizing below the default height");
assert(/\.rapid-fire-lot\{[^}]*width:100%/s.test(css)&&css.includes("grid-template-columns:82px 86px repeat(3,minmax(0,1fr))"),"DIR must match the row-title width while ADD, DBL, and B.E. share the remaining width equally");
assert(/\.rapid-fire-status\{[^}]*width:100%;[^}]*height:34px/s.test(css),"status must remain a full-width single-line row");
assert(css.includes(".rapid-fire-slider-ticks i")&&rapid.includes("sliderTicks(REVERSE_PERCENT_STEPS,25,300,100)"),"both sliders must render discrete tick markers");
assert(css.includes(".rapid-fire-slider-ticks i.is-reference{background:#4b5563}")&&css.includes(".rapid-fire-reverse-slider::-moz-range-progress"),"Reverse must emphasize 100 percent and suppress its progress fill");
assert(rapid.includes('q("rapidFireStatus").addEventListener("click",()=>setStatus(""),false)'),"clicking RF status must clear its message");
assert(rapid.includes('rapid-fire-summary-label">Remaining')&&rapid.includes('rapid-fire-summary-label">Close'),"the size boxes must use the Remaining and Close labels");
assert(rapid.includes('id="rapidFireOpenSize"')&&!/id="rapidFireOpenSize"[^>]*readonly/.test(rapid)&&rapid.includes('bindNumericDraftInput(openSize')&&rapid.includes('bindNumericDraftInput(closeSize'),"Remaining and Close must both be directly editable through the shared numeric draft binder");
assert(rapid.includes('editedKind==="remaining"')&&rapid.includes("closed:total-active")&&rapid.includes("remaining:total-active"),"only the actively edited RF size may be normalized; its counterpart must use plain subtraction from the true total");
assert(calculator.includes("normalizedClose=directCloseQty==null?normalizeRapidFireQuantity")&&calculator.includes("Math.max(0,directCloseQty||0)"),"RF summary must preserve the already-derived counterpart exactly instead of independently normalizing it again");
assert(css.includes("background:#aeb4bc")&&css.includes("background:#6b7280")&&rapid.includes('--rapid-fire-range-progress'),"slider fill must be lighter grey without changing the thumb color");
assert(calculator.includes('normalizedClose=directCloseQty==null?normalizeRapidFireQuantity(requestedCloseQty,{roundDown:true}):null')&&rapid.includes("remaining:size-closed"),"slider Close must normalize once while direct size edits preserve their exact subtraction-derived counterpart");
assert(rapid.includes("const CLOSE_PERCENT_STEPS=Object.freeze(Array.from({length:101},(_value,index)=>index))")&&rapid.includes('step="1"')&&rapid.includes("Math.round(value)+\"%\""),"Close must move in one-percent steps with a whole-number readout");
assert(calculator.includes("rapidFireProtectionPl")&&calculator.includes("raw-entryCommission-exit*qty*exitRate")&&calculator.includes("takeProfitPl")&&calculator.includes("feeAware:false"),"Master SL preview must include entry/exit fees while TP preview remains raw");
assert(calculator.includes("await cancelRapidFireProtections()")&&calculator.indexOf("await cancelRapidFireProtections()")<calculator.indexOf("const settingsApi=window.BT001SymbolTradingSettings;",calculator.indexOf("async function executeRapidFireChase")),"Reverse must cancel Master SL and TP before reading and submitting the reverse chase");
assert(calculator.includes('rapidFireProtection:true')&&calculator.includes('text:"TP | "'),"RF SL and TP drafts must feed Calculator's chart-level overlay");
assert(rapid.includes('rapid-fire-protection-label">SL</span>')&&!rapid.includes('rapid-fire-protection-label">Master SL</span>'),"the RF protection label must be SL");
assert(/\.rapid-fire-protection-price\{[^}]*min-width:0;[^}]*flex:1 1 66px;/s.test(css),"SL and TP price inputs must share one compact flexible width");
assert(rapid.includes('id="rapidFireTakeProfitSet" type="button">Set</button>')&&rapid.includes("const typedValue=takeProfitCommitValue(tpInput.value,takeProfitEditValue)")&&rapid.includes('commitProtection("tp",tpInput,typedValue)'),'TP Set must commit the captured edit rather than a blur-reverted field value');
assert(rapid.includes('String(rawValue==null?"":rawValue).trim()===""')&&rapid.includes('kind==="tp"?bridge.cancelTakeProfit:bridge.cancelMasterStop')&&calculator.includes("cancelTakeProfit:cancelRapidFireTakeProfit"),"empty TP plus Set must route through the dedicated Binance TP cancellation bridge");
assert(calculator.includes("syncRapidFireTakeProfitFromSnapshot(snapshot)")&&calculator.includes("gateway.cancelOrder(rapidFireTakeProfitIdentityParams(rapidFireTakeProfitOrder))")&&calculator.includes("cancelled:false,noOrder:true"),"TP cancellation must refresh authoritative orders, cancel the tracked Binance order, and no-op when none exists");
assert(!rapid.includes('tpInput.addEventListener("blur"')&&!rapid.includes('tpInput.addEventListener("change"')&&!rapid.includes('[slInput,tpInput].forEach(input=>input.addEventListener("keydown"'),"TP must not use a field-only blur submit/revert or submit on change/Enter");
assert(rapid.includes("pendingTakeProfitValue=hasLiveTakeProfit?null")&&rapid.includes('if(!bridge.snapshot().takeProfitOrder){')&&rapid.includes('pendingTakeProfitValue=normalized.text;'),"an unsent TP draft must persist only when no live Binance TP exists and must normalize on focus exit");
assert(rapid.includes("pendingTakeProfitValue=null;")&&rapid.includes("takeProfitEditValue=null;")&&css.includes("input.is-pending-unsent")&&css.includes("background:#edf9f0"),"a no-live-TP draft must be pale green until Set succeeds");
assert(rapid.includes('tpSet.addEventListener("mousedown",event=>event.preventDefault(),false)')&&rapid.includes('tpProtectionBox.addEventListener("focusout"')&&rapid.includes("tpProtectionBox.contains(document.activeElement)"),"TP blur reversion must treat its input and Set button as one focus group while preserving outside-click reversion");
assert(!/\.rapid-fire-protection-pl\{[^}]*margin-left:auto/s.test(css)&&css.includes("gap:5px"),"SL P/L must remain tightly grouped with its price field instead of being pushed right");
assert(calculator.includes("syncRapidFireMasterStopFromSnapshot")&&calculator.includes("findStopOrderForPosition(livePos,snapshot,true)")&&calculator.includes("syncRapidFireTakeProfitFromSnapshot"),"RF fields must sync the live whole-position Master SL and tagged TP from authoritative order snapshots");
assert(calculator.includes('window.addEventListener("v14:binance-state-change"')&&calculator.includes("scheduleRapidFireLiveOrderSync()"),"live Binance order changes must schedule RF field synchronization");
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
assert(rapid.includes('title="Show or hide the Average projection line"><span>Avg</span>')&&!rapid.includes("<span>New</span><span>Avg</span>"),"the New Average toggle must display the compact Avg label");
assert(rapid.includes('bindNumericAdjustControls(lotController,{upButton:q("rapidFireLotUp"),downButton:q("rapidFireLotDown"),step:0.001,precision:()=>Math.max(3,api().lotRules().precision),commit:false,min:0})'),"Add quantity must bind shared arrow and wheel adjustment at an exact 0.001 draft step");
assert(rapid.includes('lotController.commit("trigger")'),"Add execution must commit its wheel-adjusted draft through live symbol quantity normalization");

const numericAdjustStart=rapid.indexOf("function bindNumericAdjustControls");
const numericAdjustEnd=rapid.indexOf("function protectionPlText",numericAdjustStart);
const numericAdjustContext={
  number:value=>Number.isFinite(Number(value))?Number(value):null,
  protectionWheelValue:(current,step,direction,precision)=>Math.round(((Number(current)||0)+direction*step)*10**precision)/10**precision,
  Math
};
vm.createContext(numericAdjustContext);
vm.runInContext(rapid.slice(numericAdjustStart,numericAdjustEnd),numericAdjustContext);
let wheelListener=null;
let wheelDraft=null;
const wheelInput={value:"1.234",disabled:false,addEventListener:(name,listener)=>{if(name==="wheel")wheelListener=listener;},focus:()=>{}};
const wheelController={input:wheelInput,setDraft:value=>{wheelDraft=value;wheelInput.value=String(value);}};
const buttonListeners={};
const adjustButton=id=>({addEventListener:(name,listener)=>{buttonListeners[id+":"+name]=listener;}});
numericAdjustContext.bindNumericAdjustControls(wheelController,{upButton:adjustButton("up"),downButton:adjustButton("down"),step:.001,precision:3,commit:false,min:0});
let prevented=false;
wheelListener({deltaY:-1,preventDefault:()=>{prevented=true;}});
assert.equal(wheelDraft,1.235,"one upward Add wheel tick must increase quantity by exactly 0.001");
wheelListener({deltaY:1,preventDefault:()=>{}});
assert.equal(wheelDraft,1.234,"one downward Add wheel tick must decrease quantity by exactly 0.001");
buttonListeners["up:click"]();
assert.equal(wheelDraft,1.235,"the shared Add spinner-up control must use the same exact 0.001 adjustment");
buttonListeners["down:click"]();
assert.equal(wheelDraft,1.234,"the shared Add spinner-down control must use the same exact 0.001 adjustment");
assert.equal(prevented,true,"Add quantity wheel handling must prevent page scrolling");

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
const normalizeStep=value=>{const quantity=Math.floor((Number(value)+1e-12)/.001)*.001;return {quantity,executable:quantity>0};};
assert.deepEqual({...sizePartsContext.editedPositionSizeParts(.017,.0067,"remaining",normalizeStep)},{active:.006,closed:.011000000000000001,remaining:.006,total:.017},"editing Remaining must normalize only Remaining and derive Close by subtraction");
assert.deepEqual({...sizePartsContext.editedPositionSizeParts(.017,.0067,"close",normalizeStep)},{active:.006,closed:.006,remaining:.011000000000000001,total:.017},"editing Close must normalize only Close and derive Remaining by subtraction");

const tpFieldStart=rapid.indexOf("function takeProfitFieldState");
const tpFieldEnd=rapid.indexOf("function setCloseSliderDisplay",tpFieldStart);
const tpFieldContext={String};
vm.createContext(tpFieldContext);
vm.runInContext(rapid.slice(tpFieldStart,tpFieldEnd),tpFieldContext);
assert.deepEqual({...tpFieldContext.takeProfitFieldState(null,null,"65000")},{hasLive:false,pending:true,value:"65000"},"without a live TP, the unsent typed value must persist as pending");
assert.deepEqual({...tpFieldContext.takeProfitFieldState({orderId:"1"},64000,"65000")},{hasLive:true,pending:false,value:"64000"},"with a live TP, the authoritative Binance value must replace an unsent edit");

const tpCommitStart=rapid.indexOf("function takeProfitCommitValue");
const tpCommitEnd=rapid.indexOf("function setCloseSliderDisplay",tpCommitStart);
const tpCommitContext={};
vm.createContext(tpCommitContext);
vm.runInContext(rapid.slice(tpCommitStart,tpCommitEnd),tpCommitContext);
assert.equal(tpCommitContext.takeProfitCommitValue("64000","65000"),"65000","Set must prefer the captured typed TP over a stale live value rendered into the field");
assert.equal(tpCommitContext.takeProfitCommitValue("64000",null),"64000","Set may use the displayed value when there is no captured edit");

const tpMatchStart=calculator.indexOf("function rapidFireTakeProfitStateMatches");
const tpMatchEnd=calculator.indexOf("function isBinanceNoChangeOrderError",tpMatchStart);
const normalizeComparable=value=>{
  const number=Number(value);
  return Number.isFinite(number)?number.toFixed(3):null;
};
const tpMatchContext={normalizeLevelComparable:normalizeComparable,normalizeQtyComparable:normalizeComparable};
vm.createContext(tpMatchContext);
vm.runInContext(calculator.slice(tpMatchStart,tpMatchEnd),tpMatchContext);
assert.equal(tpMatchContext.rapidFireTakeProfitStateMatches({price:"65000.000",quantity:"0.250"},65000,.25),true,"same normalized TP price and quantity must be treated as unchanged");
assert.equal(tpMatchContext.rapidFireTakeProfitStateMatches({price:"65000.000",quantity:"0.250"},65001,.25),false,"a genuinely different normalized TP price must remain amendable");
assert.equal(tpMatchContext.rapidFireTakeProfitStateMatches({price:"65000.000",quantity:"0.250"},65000,.3),false,"a changed full-position quantity must remain amendable");

const tpCancelStart=calculator.indexOf("async function cancelRapidFireTakeProfit");
const tpCancelEnd=calculator.indexOf("async function cancelRapidFireProtections",tpCancelStart);
let cancelCalls=0;
const tpCancelContext={
  rapidFireProtectionBusy:false,rapidFireChaseContext:null,rapidFireProtectionAction:null,rapidFireTakeProfitOrder:null,rapidFireTakeProfitDraftPrice:null,
  hasKeys:()=>true,publishRapidFireStatus:()=>{},calculate:()=>{},
  readOpenOrdersSnapshot:async()=>({normalOrders:[]}),
  syncRapidFireTakeProfitFromSnapshot:snapshot=>{tpCancelContext.rapidFireTakeProfitOrder=snapshot.normalOrders[0]||null;},
  rapidFireTakeProfitIdentityParams:order=>({symbol:order.symbol,orderId:order.orderId}),
  binanceWriteConfirmed:()=>true,
  window:{BT001_BINANCE_TRADING:{cancelOrder:async()=>{cancelCalls+=1;return {status:"CANCELED"};}}},
  Object,String,Error
};
vm.createContext(tpCancelContext);
vm.runInContext(calculator.slice(tpCancelStart,tpCancelEnd),tpCancelContext);
void tpCancelContext.cancelRapidFireTakeProfit().then(noTpCancel=>{
  assert.equal(noTpCancel.noOrder,true,"empty TP Set must no-op when the authoritative snapshot has no tracked TP");
  assert.equal(cancelCalls,0,"empty TP Set must not send a Binance cancel when no TP exists");
  tpCancelContext.readOpenOrdersSnapshot=async()=>({normalOrders:[{symbol:"BTCUSDT",orderId:"77"}]});
  return tpCancelContext.cancelRapidFireTakeProfit();
}).then(liveTpCancel=>{
  assert.equal(liveTpCancel.cancelled,true,"empty TP Set must report a confirmed live TP cancellation");
  assert.equal(cancelCalls,1,"empty TP Set must send exactly one Binance cancel for the tracked TP");
}).catch(error=>{
  console.error(error);
  process.exitCode=1;
});

const closeMetricsStart=calculator.indexOf("function rapidFireCloseMetrics");
const closeMetricsEnd=calculator.indexOf("function rapidFireSnapshot",closeMetricsStart);
const closeMetricsContext={num:value=>Number.isFinite(Number(value))?Number(value):null,toUpper:value=>String(value||"").toUpperCase(),clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),Math};
vm.createContext(closeMetricsContext);
vm.runInContext(calculator.slice(closeMetricsStart,closeMetricsEnd),closeMetricsContext);
const halfMetrics=closeMetricsContext.rapidFireCloseMetrics(120,600,50);
assert.equal(halfMetrics.floatingPl,60,"50 percent Close selection must display half the full-position floating P/L");
assert.equal(halfMetrics.floatingPlPercent,10,"50 percent Close selection must display the selected P/L contribution against position margin");
assert.equal(closeMetricsContext.rapidFireProtectionPl(100,110,2,"LONG",{feeAware:false}),20,"TP preview must use raw price movement without fees");
assert.equal(closeMetricsContext.rapidFireProtectionPl(100,110,2,"LONG",{feeAware:true,entryCommission:.1,exitRate:.001}),19.68,"Master SL preview must subtract entry and STOP_MARKET exit fees");

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
