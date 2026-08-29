"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const engine=fs.readFileSync(path.join(__dirname,"application","chaseEngine.js"),"utf8");
const floating=fs.readFileSync(path.join(root,"features","shared","floatingWindow.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

assert(html.includes('src="features/shared/floatingWindow.js"'),"the shared floating-window utility must load before Calculator starts");
assert(calculator.includes('id = "otfCloseChaseWindow"'),"the OTF close panel must be a DOM window");
for(const id of ["otfCloseChasePercent","otfCloseChaseQtyInput","otfCloseChaseDist","otfCloseChaseValid","otfCloseChaseConfirm","otfCloseChasePlPercentText"]){
  assert(calculator.includes(id),`the DOM panel must include ${id}`);
}
assert(!calculator.includes('id="otfCloseChaseCancel"'),"OTF must not create a second cancellation button");
assert(!calculator.includes("otfCloseChaseModeMkt")&&!calculator.includes("otfCloseChaseModeChs")&&!calculator.includes('type:"MARKET"'),"OTF must be CHS-only with no MKT selector or MARKET close path");
assert(!calculator.includes("otfCloseChaseModeRev"),"OTF must not render a REV mode control");
assert(!calculator.includes('openPositionCloseUi.mode = "REV"'),"OTF must not select REV internally");
assert(calculator.includes("storageKey:OTF_CLOSE_WINDOW_KEY"),"panel geometry must use global browser storage");
assert(calculator.includes("OTF_CLOSE_PREFERENCES_KEY")&&calculator.includes("saveOpenPositionClosePreferences();"),"OTF close percent and chase distance must persist independently of geometry");
assert(calculator.includes("OTF_CLOSE_WINDOW_MIN_HEIGHT = 180")&&calculator.includes("OTF_CLOSE_WINDOW_DEFAULT_HEIGHT = 194"),"OTF floating geometry must use the compact content height and a lower manual resize floor");
assert(calculator.includes("storedPercent==null?100")&&calculator.includes("storedDist==null?1"),"fresh OTF state must default to 100 percent and one tick");
assert(calculator.includes('timeInForce:"GTX"'),"the chase order must use post-only GTX");
assert(calculator.includes("hub.getTopOfBook()"),"the chase must use the shared top-of-book source");
assert(calculator.includes('event.type!=="price"'),"the visible OTF preview must listen to TF-independent price events");
for(const label of ["%","SIZE","P/L","P/L%"]){
  assert(calculator.includes(`<div class="otf-close-summary-label">${label}</div>`),`the summary must include the ${label} metric label`);
}
assert.equal((calculator.match(/class="otf-close-summary-cell"/g)||[]).length,4,"the summary must render four metric cells");
assert(calculator.includes("currentFloatingPlPercent(openPositionClosePreviewPosition())"),"P/L percent must be derived from floating P/L and open-position margin");
assert(calculator.includes("floating/margin*100"),"margin-based P/L percent must use floating P/L divided by margin");
assert(calculator.includes('<div class="otf-close-execution-row">')&&calculator.indexOf('id="otfCloseChaseLive"')<calculator.indexOf('id="otfCloseChaseConfirm"'),"feedback status must render left of the single Close/Cancel button");
assert(calculator.includes('id="otfCloseChaseConfirm" type="button">Close</button>')&&calculator.includes('executeButton.textContent=chsActive?"Cancel":"Close"'),"OTF must use Close while idle and Cancel while chasing");
for(const message of [
  "Waiting for price...","Chasing — ","Price feed stale","Repricing...",
  "Filled — ","Cancelled","Expired","No price data","Stopped"
]) assert(calculator.includes(message),`OTF must expose the exact status message fragment: ${message}`);
assert(engine.includes('?"repricing":"chasing"')&&engine.includes('statusCode:"no-price"'),"the shared engine must publish stable repricing and no-price lifecycle codes");

const persisted=new Map();
const preferenceContext={
  OTF_CLOSE_PREFERENCES_KEY:"otf-test",openPositionCloseUi:null,
  localStorage:{getItem:key=>persisted.get(key)||null,setItem:(key,value)=>persisted.set(key,value)},
  num:value=>Number.isFinite(Number(value))?Number(value):null,
  clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),JSON,Math
};
const preferenceStart=calculator.indexOf("function loadOpenPositionClosePreferences");
const preferenceEnd=calculator.indexOf("function num",preferenceStart);
vm.createContext(preferenceContext);
vm.runInContext(calculator.slice(preferenceStart,preferenceEnd),preferenceContext);
let preferences=preferenceContext.loadOpenPositionClosePreferences();
assert.equal(preferences.percent,100,"fresh OTF state must use a 100 percent close selection");
assert.equal(preferences.chsDistTicks,1,"fresh OTF state must use a one-tick chase distance");
preferenceContext.openPositionCloseUi={percent:42,chsDistTicks:5};
preferenceContext.saveOpenPositionClosePreferences();
preferences=preferenceContext.loadOpenPositionClosePreferences();
assert.equal(preferences.percent,42,"changed close percentage must survive a reload");
assert.equal(preferences.chsDistTicks,5,"changed chase distance must survive a reload");

const statusStart=calculator.indexOf("function formatChaseExecutionStatus");
const statusEnd=calculator.indexOf("async function submitOpenPositionCloseChsLimit",statusStart);
const statusContext={num:value=>Number.isFinite(Number(value))?Number(value):null,clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),fmtLot:value=>Number(value).toFixed(3),Number,String,Math};
vm.createContext(statusContext);
vm.runInContext(calculator.slice(statusStart,statusEnd),statusContext);
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"waiting"}).message,"Waiting for price...");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"chasing",filledQty:.002,remainingQty:.003}).message,"Chasing — 40%");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"chasing",filledQty:.002,remainingQty:.003,price:"62123.4"}).message,"Chasing — 40% @ price: 62123.4","OTF and Rapid Fire must show the shared engine's current resting price");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"chasing",requestedQty:1,filledQty:0,price:"62123.400"}).message,"Chasing — 0% @ price: 62123.400","the status must preserve the live order price representation");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"filled",requestedQty:.01,filledQty:.007}).message,"Filled — 70%");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"cancelled"}).message,"Cancelled");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"expired"}).message,"Expired");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"no-price"}).message,"No price data");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"stopped"}).message,"Stopped");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"stopped",message:"Rapid Fire amend rejected — chase paused: invalid book"}).message,"Rapid Fire amend rejected — chase paused: invalid book","Rapid Fire must surface the chase engine's stopped reason");
assert.equal(statusContext.formatChaseExecutionStatus({statusCode:"inactive",message:"OTF Close inactive — remaining qty not chased"}).message,"OTF Close inactive — remaining qty not chased","OTF Close must surface the chase engine's inactive reason");

const subscriptionStart=calculator.indexOf("function stopOpenPositionCloseLivePriceSubscription");
const subscriptionEnd=calculator.indexOf("function renderOpenPositionClosePanel",subscriptionStart);
let listener=null,unsubscribed=0,previewRefreshes=0;
const subscriptionContext={
  openPositionCloseLivePriceUnsubscribe:null,openPositionCloseLivePriceFrame:null,openPositionCloseUi:{open:true},
  window:{PUBLIC_MARKET_DATA_HUB:{subscribe:next=>{listener=next;return()=>{unsubscribed++;};}}},
  currentSymbol:()=>"BTCUSDT",toUpper:value=>String(value||"").toUpperCase(),
  refreshOpenPositionClosePreviewSummary:()=>{previewRefreshes++;},requestAnimationFrame:callback=>{callback();return 1;},
  cancelAnimationFrame:()=>{},clearTimeout:()=>{},setTimeout:callback=>{callback();return 1;},Math
};
vm.createContext(subscriptionContext);
vm.runInContext(calculator.slice(subscriptionStart,subscriptionEnd),subscriptionContext);
subscriptionContext.syncOpenPositionCloseLivePriceSubscription(true);
listener({type:"price",symbol:"BTCUSDT",price:62000});
assert.equal(previewRefreshes,1,"a live market-price tick must update the visible OTF summary");
subscriptionContext.syncOpenPositionCloseLivePriceSubscription(false);
assert.equal(unsubscribed,1,"closing OTF must release its live-price subscription");

assert(floating.includes('["n","ne","e","se","s","sw","w","nw"].forEach(edge => {'),"all eight resize edges must be installed");
assert(floating.includes("localStorage.setItem(key,JSON.stringify(value))"),"window geometry must persist through localStorage");
const otfCss=css.slice(css.indexOf(".otf-close-window{"),css.indexOf(".calc-module-window.is-collapsed",css.indexOf(".otf-close-window{")));
assert(otfCss.includes("grid-template-columns:repeat(4,minmax(0,1fr))"),"OTF summary must lay out four cells");
assert(/\.otf-close-execution-row \.otf-close-confirm\{[^}]*width:40px;[^}]*height:46px;/s.test(otfCss),"Close/Cancel must use the compact width sized for the shorter label");
assert(otfCss.includes("grid-template-columns:minmax(0,1fr) 40px"),"status must occupy the left column and compact Close/Cancel the right column");
assert(otfCss.includes("--otf-close-range-progress")&&otfCss.includes("#aeb4bc")&&otfCss.includes("background:#6b7280"),"OTF slider must use the lighter-grey fill and unchanged dark-grey thumb");
assert(/\.otf-close-window\{[^}]*height:194px;[^}]*min-height:180px;/s.test(otfCss),"OTF CSS height and resize floor must match compact geometry");
assert(/\.otf-close-live\{[^}]*height:46px;[^}]*min-height:46px;/s.test(otfCss),"status must exactly match the Execute/Cancel height");
assert(/\.otf-close-live\{[^}]*border:1px solid #d9dce1;[^}]*background:#f7f8f9;/s.test(otfCss),"status must be a bordered light-grey box");
assert(/\.otf-close-live\.is-error\{[^}]*color:#f6465d/s.test(otfCss),"error feedback must retain its red state");

console.log("OTF close DOM panel tests: PASS");
