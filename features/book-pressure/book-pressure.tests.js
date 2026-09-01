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
assert(main.includes('setTopOfBookConsumerActive("book-pressure-gauge",true)'),"the gauge must keep the shared depth5@100ms feed active");
assert(main.includes('tradabilityHub.subscribeTopOfBook(() => updateBookPressureGauge())'),"each top-of-book tick must update the gauge");
assert(main.includes("const BOOK_PRESSURE_REFERENCE_MS = 3 * 60 * 1000"),"typical depth must use the documented three-minute reference window");
assert(main.includes("const lean = Math.max(-1,Math.min(1,rawLean * magnitudeRatio))"),"deflection must combine instantaneous imbalance with current-vs-typical total depth");
assert(!main.slice(start,end).includes("history")&&!main.slice(start,end).includes("previous"),"the displayed lean model must not smooth or average consecutive readings");
assert(main.includes('className = "chart-market-gauges"'),"Book Pressure and ADX/ATR must be kept together in one non-wrapping row group");
assert(/\.chart-market-gauges\{[^}]*display:inline-flex;[^}]*white-space:nowrap;/s.test(css),"the shared ADX/ATR and Book Pressure group must not split across rows");
assert(/\.chart-book-pressure-gauge\{[^}]*min-height:20px;[^}]*border-left:1px solid/s.test(css),"Book Pressure must share the ADX/ATR row sizing and separator language");
assert(/\.book-pressure-track\{[^}]*width:72px;[^}]*height:10px;/s.test(css),"Book Pressure must render as one compact horizontal battery track");
assert(css.includes(".chart-book-pressure-gauge.is-bid-strong .book-pressure-fill{background:#00a83d}")&&css.includes(".chart-book-pressure-gauge.is-ask-strong .book-pressure-fill{background:#dc2626}"),"strong bid/ask lean must use the established green/red colors");

console.log("Book Pressure lean model and live shared-feed integration tests passed.");
