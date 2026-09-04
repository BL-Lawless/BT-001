"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

const start=main.indexOf("function computeBookPressureModel");
const end=main.indexOf("function updateBookPressureReference",start);
assert(start>=0&&end>start,"Book Pressure model must be present");
const compute=vm.runInNewContext(`(${main.slice(start,end).trim()})`,{Number,Math,Object});
const referenceStart=main.indexOf("function updateBookPressureReference");
const referenceEnd=main.indexOf("function ensureBookPressureGauge",referenceStart);
const referenceState={bookPressureDepthHistory:new Map()};
const updateReference=vm.runInNewContext(`(${main.slice(referenceStart,referenceEnd).trim()})`,{Number,String,Math,meterState:referenceState,BOOK_PRESSURE_REFERENCE_MS:180000,BOOK_PRESSURE_REFERENCE_MAX_SAMPLES:2000});

const bid=compute({fresh:true,bidDepthSize:80,askDepthSize:20},100,120);
assert.equal(bid.side,"bid");
assert.equal(bid.tone,"strong");
assert.equal(bid.lean,.6);
assert.equal(bid.rawLean,.6);
assert.equal(bid.magnitudeRatio,1);
assert.equal(bid.referenceSamples,120);

const ask=compute({fresh:true,bidDepthSize:40,askDepthSize:60},100);
assert.equal(ask.side,"ask");
assert.equal(ask.tone,"muted");
assert(Math.abs(ask.lean + .2)<1e-12);

const balanced=compute({fresh:true,bidDepthSize:100,askDepthSize:104},204);
assert.equal(balanced.side,"neutral","a roughly five-percent-or-tighter size difference must stay neutral");
assert.equal(compute({fresh:false,bidDepthSize:100,askDepthSize:1},101).available,false,"stale book data must not drive the gauge");

const thin=compute({fresh:true,bidDepthSize:.02,askDepthSize:.001},10);
assert(thin.rawLean>.9,"the thin fixture must have a near-extreme raw ratio");
assert(thin.lean<.01&&thin.side==="neutral","trivial total depth must remain muted despite an extreme ratio");
const large=compute({fresh:true,bidDepthSize:50,askDepthSize:2},10);
assert.equal(large.lean,1,"a genuinely large bid imbalance must reach full deflection immediately");
assert.equal(large.side,"bid");
assert.equal(large.tone,"strong");

const firstReference=updateReference({fresh:true,symbol:"BTCUSDT",at:1000,updateId:1,bidDepthSize:6,askDepthSize:4});
assert.deepEqual(JSON.parse(JSON.stringify(firstReference)),{typicalDepth:10,sampleCount:0},"the first tick must bootstrap its own per-symbol depth reference");
const secondReference=updateReference({fresh:true,symbol:"BTCUSDT",at:1100,updateId:2,bidDepthSize:12,askDepthSize:8});
assert.deepEqual(JSON.parse(JSON.stringify(secondReference)),{typicalDepth:10,sampleCount:1},"a new tick must compare against prior samples, not dilute itself before display");
assert.deepEqual(JSON.parse(JSON.stringify(updateReference({fresh:true,symbol:"BTCUSDT",at:1100,updateId:2,bidDepthSize:12,askDepthSize:8}))),{typicalDepth:10,sampleCount:1},"redraws of the same update must not duplicate reference samples");
assert.equal(referenceState.bookPressureDepthHistory.get("BTCUSDT").samples.length,2);
const expiredReference=updateReference({fresh:true,symbol:"BTCUSDT",at:181200,updateId:3,bidDepthSize:18,askDepthSize:12});
assert.deepEqual(JSON.parse(JSON.stringify(expiredReference)),{typicalDepth:30,sampleCount:0},"samples outside the three-minute window must expire before calibration");

assert(main.includes('subscribeTopOfBook:subscribeTopOfBookTick'),"the shared market hub must expose its existing top-of-book tick subscription");
assert(main.includes('const BOOK_PRESSURE_WINDOW_MIN = .01')&&main.includes('const BOOK_PRESSURE_WINDOW_MAX = 10'),"percentage window must accept exactly 0.01 through 10 percent");
assert(main.includes('const BOOK_PRESSURE_WINDOW_KEY = "bt001_book_pressure_window_percentage_v1"'),"percentage window must use a versioned persistence key");
assert(main.includes('localStorage.getItem(BOOK_PRESSURE_WINDOW_KEY)')&&main.includes('localStorage.setItem(BOOK_PRESSURE_WINDOW_KEY,String(next))'),"percentage window must load and persist through browser storage");
assert(main.includes('symbol.toLowerCase()+"@depth@100ms"')&&main.includes('"&limit=1000"'),"Book Pressure must use a synchronized deep order book instead of the five-level chase feed");
assert(main.includes('raw.replace(/\\/(?:public|market|private)\\/stream$/i,"/stream")'),"the deep feed must normalize legacy configured paths to Binance's live combined-stream endpoint");
assert(main.includes('typeof socket.disconnect==="function"')&&main.includes('socket.disconnect()'),"the managed deep-feed connection must be cleanly disconnected before replacement");
const windowStart=main.indexOf("function computeBookPressureWindow");
const windowEnd=main.indexOf("function bookPressureDepthSnapshot",windowStart);
const computeWindow=vm.runInNewContext(`(${main.slice(windowStart,windowEnd).trim()})`,{Number,Math,Object,Array});
const narrowWindow=computeWindow([[99.5,2],[98,10]],[[100.5,3],[102,12]],100,1);
assert.deepEqual(JSON.parse(JSON.stringify(narrowWindow)),{price:100,percentage:1,distance:1,lower:99,upper:101,bidDepthSize:2,askDepthSize:3,bidLevelCount:1,askLevelCount:1,bidCoverageComplete:true,askCoverageComplete:true,coverageComplete:true},"one-percent depth must include only resting sizes within one percent of current price");
const wideWindow=computeWindow([[99.5,2],[98,10]],[[100.5,3],[102,12]],100,3);
assert.equal(wideWindow.bidDepthSize,12);assert.equal(wideWindow.askDepthSize,15);assert.equal(wideWindow.distance,3);
assert(main.includes('current*pct/100'),"live dollar equivalent must derive from current price and the stored percentage");
const dollarStart=main.indexOf("function bookPressurePercentageFromDollar");
const dollarEnd=main.indexOf("function setBookPressureDollar",dollarStart);
const percentageFromDollar=vm.runInNewContext(`(${main.slice(dollarStart,dollarEnd).trim()})`,{Number,BOOK_PRESSURE_WINDOW_MIN:.01,BOOK_PRESSURE_WINDOW_MAX:10});
assert.equal(percentageFromDollar(50,50000),.1,"$50 at a $50,000 current price must convert to 0.1 percent");
assert.equal(percentageFromDollar(5,50000),.01,"the minimum converted percentage must be accepted");
assert.equal(percentageFromDollar(5000,50000),10,"the maximum converted percentage must be accepted");
assert.equal(percentageFromDollar(4.99,50000),null);assert.equal(percentageFromDollar(5000.01,50000),null);assert.equal(percentageFromDollar("bad",50000),null);
assert(main.includes('value.textContent=dollarText')&&main.includes('"$"+distance.toFixed(1)'),"the passive readout must show only the live dollar equivalent with one decimal");
assert(main.includes('if(keyEvent.key==="Enter")')&&main.includes('setBookPressureDollar(input.value)'),"Enter must treat the draft as dollars and convert it at the live price");
assert(main.includes('if(!Number.isFinite(next)||next<BOOK_PRESSURE_WINDOW_MIN||next>BOOK_PRESSURE_WINDOW_MAX) return false'),"invalid and out-of-range drafts must be rejected without changing state");
assert(main.includes('track.addEventListener("click"')&&main.includes('editBookPressureWindowControl(node,bookPressureDepthSnapshot())'),"clicking the OBI bar must open the existing inline dollar editor");
assert(main.includes('value.className="book-pressure-window-value"')&&!main.includes('className="book-pressure-window-button"'),"the dollar readout must be passive and the dedicated settings button must be removed");
assert(main.includes('track.addEventListener("pointerdown",event=>event.stopPropagation())')&&main.includes('input.addEventListener("mousedown",event=>event.stopPropagation())'),"the bar and editor must not leak gestures to competing handlers");
assert(!main.includes('<span class="book-pressure-label">'),"the Book Pressure gauge must render no adjacent label wording");
assert(!main.includes('setTopOfBookConsumerActive("book-pressure-gauge",true)'),"Book Pressure must not keep the bounded chase depth5 feed active");
assert(main.includes("const BOOK_PRESSURE_REFERENCE_MS = 3 * 60 * 1000"),"typical depth must use the documented three-minute reference window");
assert(main.includes("const lean = Math.max(-1,Math.min(1,rawLean * magnitudeRatio))"),"deflection must combine instantaneous imbalance with current-vs-typical total depth");
assert(!main.slice(start,end).includes("history")&&!main.slice(start,end).includes("previous"),"the displayed lean model must not smooth or average consecutive readings");
assert(main.includes('fill.style.left = model.side === "bid" ? "50%" : model.side === "ask" ? (50 - magnitudePct) + "%" : "calc(50% - 2px)"'),"Book Pressure must deflect bid/green right and ask/red left");
assert(main.includes('className = "chart-market-gauges"'),"Book Pressure and ADX/ATR must be kept together in one non-wrapping row group");
assert(/\.chart-market-gauges\{[^}]*display:inline-flex;[^}]*white-space:nowrap;/s.test(css),"the shared ADX/ATR and Book Pressure group must not split across rows");
assert(/\.chart-book-pressure-gauge\{[^}]*min-height:20px;[^}]*border-left:1px solid/s.test(css),"Book Pressure must share the ADX/ATR row sizing and separator language");
assert(/\.book-pressure-track\{[^}]*width:112px;[^}]*height:10px;/s.test(css),"freed label space must widen the Book Pressure bar");
assert(/\.book-pressure-window-control\{[^}]*width:56px;[^}]*height:18px/s.test(css),"the editable dollar control must stay compact while fitting the full valid dollar range");
assert(/\.book-pressure-window-value,.book-pressure-window-input\{[^}]*border:0;[^}]*background:transparent;[^}]*font:400 12\.5px\/16px Arial,sans-serif;/s.test(css),"the passive readout and inline editor must retain the readable compact treatment without a button box");
assert(css.includes(".chart-book-pressure-gauge.is-bid-strong .book-pressure-fill{background:#00a83d}")&&css.includes(".chart-book-pressure-gauge.is-ask-strong .book-pressure-fill{background:#dc2626}"),"strong bid/ask lean must use the established green/red colors");

console.log("Book Pressure percentage-window, persistence, UI, and deep-feed tests passed.");
