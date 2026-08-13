"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..", "..");
const volatilitySource = fs.readFileSync(path.join(__dirname, "ma-stack-volatility.js"), "utf8");
const coreSource = fs.readFileSync(path.join(__dirname, "ma-stack-core.js"), "utf8");
const runtimeSource = fs.readFileSync(path.join(__dirname, "ma-stack-runtime.js"), "utf8");
const moduleSource = fs.readFileSync(path.join(__dirname, "ma-stack.js"), "utf8");
const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "ma-stack.css"), "utf8");

class FakeElement {
  constructor(tagName, document) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.document = document;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.listeners = {};
    this.className = "";
    this.style = {};
    this._id = "";
    this._innerHTML = "";
  }
  set id(value) { this._id = value; if (value) this.document.byId.set(value, this); }
  get id() { return this._id; }
  set innerHTML(value) {
    this._innerHTML = String(value);
    const idPattern = /id="([^"]+)"/g;
    let match;
    while ((match = idPattern.exec(this._innerHTML))) {
      if (!this.document.byId.has(match[1])) {
        const child = new FakeElement("div", this.document);
        child.id = match[1];
        this.appendChild(child);
      }
    }
  }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child) { return this.appendChild(child); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); }
  querySelector(selector) {
    if (selector === ".k") return null;
    return null;
  }
  querySelectorAll() { return []; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
}

function createRuntime() {
  const byId = new Map();
  const document = {
    byId,
    body: null,
    createElement(tag) { return new FakeElement(tag, document); },
    getElementById(id) { return byId.get(id) || null; },
    querySelector(selector) {
      if (selector === ".metrics") return byId.get("metrics") || null;
      if (selector === ".metric-account-start") return byId.get("account") || null;
      return null;
    }
  };
  document.body = new FakeElement("body", document);
  const metrics = new FakeElement("div", document); metrics.id = "metrics"; document.body.appendChild(metrics);
  const account = new FakeElement("div", document); account.id = "account"; metrics.appendChild(account);
  const interval = new FakeElement("select", document); interval.id = "interval"; interval.value = "15m"; document.body.appendChild(interval);

  const periods = [3, 4, 5, 6, 7];
  const rows = Array.from({ length: 90 }, (_, i) => [
    1_700_000_000_000 + i * 60_000,
    100 + i,
    101 + i,
    99 + i,
    100.5 + i,
    10,
    1_700_000_059_999 + i * 60_000,
    1000
  ]);
  let visible = null;
  let ensureCalls = 0;
  let snapshotCalls = 0;
  const snapshotRequests = [];
  let timerId = 0;
  const timers = new Map();
  const hub = {
    setMaStackVisible(value) { visible = value; },
    ensureMaStackBuffers() { ensureCalls++; return Promise.resolve(); },
    getAuthoritativeMaSnapshot(intervalName, options) {
      snapshotCalls++;
      snapshotRequests.push({ interval: intervalName, options });
      return { reliable: true, rows, sourceType: "fixture", sourcePath: "fixture", sourceIndex: rows.length - 1, requestedInterval: intervalName, requestedOptions: options };
    },
    getChartBuffer() { return rows; },
    getClosedBuffer() { return rows; }
  };
  const context = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    document,
    PUBLIC_MARKET_DATA_HUB: hub,
    MA_FEATURE: { getCanonicalMASlots: () => periods.map((period, i) => ({ slot: i + 1, period })) },
    MA_STACK_RUNTIME: {
      getById: id => document.getElementById(id),
      ivSec: () => 60,
      getConfig: () => ({ symbol: "BTCUSDC" }),
      getInterval: () => "15m",
      createEvent: (type, options) => ({ type, ...options })
    },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    Date,
    Map,
    Set,
    Event: function Event(type, options) { return { type, ...options }; }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(volatilitySource, context, { filename: "ma-stack-volatility.js" });
  vm.runInContext(coreSource, context, { filename: "ma-stack-core.js" });
  vm.runInContext(runtimeSource, context, { filename: "ma-stack-runtime.js" });
  vm.runInContext(moduleSource, context, { filename: "ma-stack.js" });
  return { context, api: context.MA_STACK_STRIP, document, rows, periods, timers, hub, snapshotRequests, get visible() { return visible; }, get ensureCalls() { return ensureCalls; }, get snapshotCalls() { return snapshotCalls; } };
}

function createCoreOnlyRuntime(periods) {
  const context = { console: { log() {}, info() {}, warn() {}, error() {} }, Date, Map, Set };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(volatilitySource, context, { filename: "ma-stack-volatility.js" });
  vm.runInContext(coreSource, context, { filename: "ma-stack-core.js" });
  return {
    core: context.__BT001_MA_STACK_BUILD__.core,
    volatility: context.__BT001_MA_STACK_BUILD__.volatility,
    presentation: context.__BT001_MA_STACK_BUILD__.presentation,
    slots: periods.map((period, i) => ({ slot: i + 1, slotId: `MA${i + 1}`, period }))
  };
}

function scaledTrendRows(targetAtr, intervalMs = 60_000) {
  const length = 500;
  const endPrice = 63_822;
  const slope = targetAtr * 0.10;
  return Array.from({ length }, (_, index) => {
    const close = endPrice - slope * (length - 1 - index);
    return [
      1_700_000_000_000 + index * intervalMs,
      close - slope * 0.20,
      close + targetAtr / 2,
      close - targetAtr / 2,
      close,
      100,
      1_700_000_000_000 + (index + 1) * intervalMs - 1,
      1_000
    ];
  });
}

function scaledCompressionSnapshot(targetAtr, slots) {
  const length = 500;
  const endPrice = 63_822;
  const baseline = endPrice - targetAtr * 20;
  const alignedBySlot = {};
  const valuesBySlot = {};
  slots.forEach((slot, slotIndex) => {
    const values = Array.from({ length }, (_, index) => {
      const releaseProgress = index <= 488 ? 0 : index >= 499 ? 1 : (index - 488) / 11;
      const spreadAtr = 1.2 + (12 - 1.2) * releaseProgress;
      return baseline + targetAtr * spreadAtr * (4 - slotIndex) / 4 + targetAtr * 0.10 * (index - 499);
    });
    alignedBySlot[slot.slotId] = values;
    valuesBySlot[slot.slotId] = values.at(-1);
  });
  return { slots, alignedBySlot, valuesBySlot };
}

(async () => {
  const runtime = createRuntime();
  const api = runtime.api;
  const signatures = { start: 0, stop: 0, refresh: 0, refreshSoon: 0, markerEvents: 2, hubRowToKline: 1, stackPeriods: 0, stackSlots: 0, classifyTimeframe: 1 };
  assert.deepStrictEqual(Object.keys(api).sort(), Object.keys(signatures).sort());
  Object.entries(signatures).forEach(([name, length]) => {
    assert.equal(typeof api[name], "function", `${name} is not callable`);
    assert.equal(api[name].length, length, `${name} signature changed`);
  });

  assert.deepStrictEqual(Array.from(api.stackPeriods()), runtime.periods);
  assert.deepStrictEqual(Array.from(api.stackSlots(), slot => ({ slot: slot.slot, slotId: slot.slotId, period: slot.period })), runtime.periods.map((period, i) => ({ slot: i + 1, slotId: `MA${i + 1}`, period })));
  assert.deepStrictEqual(Array.from(api.hubRowToKline({ time: 100, open: 1, high: 2, low: 0, close: 1.5, volume: 4, quoteVolume: 6 })), [100000, 1, 2, 0, 1.5, 4, 160000, 6]);

  const classified = api.classifyTimeframe("15m", { includeForming: false });
  assert(classified && classified.slots.length === 5, "authoritative classification failed");
  assert.equal(classified.source.type, "fixture");
  assert(Number.isFinite(classified.adx) && Number.isFinite(classified.adxPrevious), "classification did not expose current and five-candle-shadow ADX");
  assert(runtime.snapshotCalls >= 1, "authoritative snapshot was not requested");
  assert(["up", "down", "mixed", "transition", "compression"].includes(classified.state));
  assert.equal(classified.provisional, false, "explicit closed-only result was not labeled final");

  const liveDefault = api.classifyTimeframe("15m");
  const hourlyDefault = api.classifyTimeframe("1h");
  assert.equal(liveDefault.provisional, true, "live timeframe default was not labeled provisional");
  assert.equal(liveDefault.source.includeForming, true, "live timeframe did not include forming data by default");
  assert.equal(hourlyDefault.provisional, false, "closed timeframe default was labeled provisional");
  assert.equal(hourlyDefault.source.includeForming, false, "hourly timeframe included forming data by default");
  assert.equal(runtime.snapshotRequests.at(-2).options.includeForming, true);
  assert.equal(runtime.snapshotRequests.at(-1).options.includeForming, false);

  const timeframePolicies = [
    ["1m", true], ["3m", true], ["5m", true], ["15m", true], ["30m", true],
    ["1h", false], ["4h", false], ["1d", false]
  ];
  timeframePolicies.forEach(([interval, includeForming]) => {
    const result = api.classifyTimeframe(interval);
    assert.equal(result.provisional, includeForming, `${interval} provisional policy changed`);
    assert.equal(result.source.includeForming, includeForming, `${interval} forming-candle request policy changed`);
  });

  const isolatedRuntime = createCoreOnlyRuntime(runtime.periods);
  const isolatedCore = isolatedRuntime.core;
  const isolatedVolatility = isolatedRuntime.volatility;
  const isolatedRows = runtime.rows.slice();
  const isolated = isolatedCore.classify(isolatedRows, { tfKey: "fixture", tfInterval: "15m", sourceType: "isolated-test", sourcePath: "isolated-test", sourceIndex: isolatedRows.length - 1 }, { slots: isolatedRuntime.slots });
  assert(isolated && isolated.rank && isolated.rank.diagnostics, "isolated core classification failed");
  assert.equal(typeof isolatedCore.emaSeries, "function");
  assert.equal(isolatedCore.emaSeries([1, 2, 3, 4, 5], 3).length, 5);
  const failedBullishOutcome = { type:"failed crossover",dir:-1,label:"EMA 9 / EMA 21 failed crossover",age:0 };
  const failedBearishOutcome = { type:"failed crossover",dir:1,label:"EMA 9 / EMA 21 failed crossover",age:0 };
  assert.equal(isolatedCore.cleanMaPairTypeText(failedBullishOutcome),"Failed Crossover | Bullish");
  assert.equal(isolatedCore.cleanMaPairTypeText(failedBearishOutcome),"Failed Crossover | Bearish");
  assert.equal(isolatedCore.cleanMaPairTypeText({type:"failed crossover",dir:0}),"Failed Crossover");
  assert.equal(isolatedCore.freshMaPairEventText(failedBullishOutcome),"EMAs 9 / 21 Failed Crossover | Bullish | current candle");
  assert.equal(isolatedCore.freshMaPairEventText(failedBearishOutcome),"EMAs 9 / 21 Failed Crossover | Bearish | current candle");
  assert.equal(failedBullishOutcome.type,"failed crossover","failed-crossover presentation changed the internal event type");
  assert.equal(isolatedCore.cleanMaPairTypeText({type:"crossover",dir:1}),"Bull Crossover","plain crossover wording changed");

  const scoreRuntime = createCoreOnlyRuntime([9, 21, 55, 100, 200]);
  const volatilityScales = [22, 25, 30, 80, 160, 240];
  const normalizedScores = volatilityScales.map(targetAtr => {
    const rows = scaledTrendRows(targetAtr);
    const measuredAtr = scoreRuntime.volatility.snapshot(rows, 14, 5).atr;
    const result = scoreRuntime.core.classify(rows, {
      tfKey:"1m", tfInterval:"1m", includeForming:true, sourceType:"scaled-regression", sourcePath:"scaled-regression", sourceIndex:rows.length - 1
    }, { slots:scoreRuntime.slots });
    assert(Math.abs(measuredAtr - targetAtr) < 1e-9, `scaled fixture ATR ${targetAtr} was not preserved`);
    assert.equal(result.alignment, 100, `scaled fixture ATR ${targetAtr} changed structural alignment`);
    return result;
  });
  const strengths = normalizedScores.map(result => result.strength);
  const qualities = normalizedScores.map(result => result.quality);
  assert(Math.max(...strengths) - Math.min(...strengths) <= 10, `ATR-normalized Strength diverged across scales: ${strengths.join(", ")}`);
  assert(Math.max(...qualities) - Math.min(...qualities) <= 10, `ATR-normalized Quality diverged across scales: ${qualities.join(", ")}`);
  assert(normalizedScores.at(-1).strength >= 80, "extreme high-conviction trend remained suppressed by overextension");
  assert(normalizedScores.at(-1).adx >= 90, "independent ADX no longer reports the extreme trend separately");

  const compressionReleaseScores = volatilityScales.map(targetAtr => {
    const rows = scaledTrendRows(targetAtr);
    return scoreRuntime.core.classify(rows, {
      tfKey:"1m", tfInterval:"1m", includeForming:true, sourceType:"compression-regression", sourcePath:"compression-regression", sourceIndex:rows.length - 1
    }, scaledCompressionSnapshot(targetAtr,scoreRuntime.slots));
  });
  const compressionQualities = compressionReleaseScores.map(result => result.quality);
  assert(Math.max(...compressionQualities) - Math.min(...compressionQualities) <= 10, `ATR-normalized pre-compression Quality diverged across scales: ${compressionQualities.join(", ")}`);
  assert(compressionQualities[0] <= compressionQualities.at(-1), "quiet-market pre-compression Quality remained higher than equivalent high-volatility Quality");

  const timeframeMs = {"1m":60_000,"3m":180_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"1h":3_600_000,"4h":14_400_000,"1d":86_400_000};
  timeframePolicies.forEach(([interval, includeForming]) => {
    const rows = scaledTrendRows(80, timeframeMs[interval]);
    const result = scoreRuntime.core.classify(rows, {
      tfKey:interval, tfInterval:interval, includeForming, sourceType:"timeframe-regression", sourcePath:"timeframe-regression", sourceIndex:rows.length - 1
    }, { slots:scoreRuntime.slots });
    assert.equal(result.strength, normalizedScores[3].strength, `${interval} changed normalized Strength`);
    assert.equal(result.quality, normalizedScores[3].quality, `${interval} changed normalized Quality`);
    assert.equal(result.provisional, includeForming, `${interval} core result changed provisional policy`);
  });

  const priceRows = [[1,101,102,100.8,101],[2,101,102,100.8,101]];
  const priceSeries = [[100,100]];
  const priceSlots = [{slot:1,slotId:"MA1",period:9}];
  const highAtrPriceEvent = isolatedCore.detectPriceMA(priceRows,priceSeries,priceSlots,{setup:1,atrSeries:[4,4]},2);
  const lowAtrPriceEvent = isolatedCore.detectPriceMA(priceRows,priceSeries,priceSlots,{setup:1,atrSeries:[2,2]},2);
  assert(highAtrPriceEvent && highAtrPriceEvent.type === "price bounce","ATR-relative price proximity did not admit a 0.20 ATR touch");
  assert(lowAtrPriceEvent && lowAtrPriceEvent.type !== "price bounce","ATR-relative price proximity admitted a 0.40 ATR non-touch");

  const rankCases = [
    ["crossover",700],
    ["failed crossover",700],
    ["bounce/no-cross",550],
    ["compression release",400],
    ["expansion",300],
    ["cross risk",200],
    ["compression",100],
    ["stack transition",200]
  ];
  rankCases.forEach(([type,base]) => {
    assert.equal(isolatedCore.pairEventRank({type,pairClass:"deep"}),base,`${type} non-adjacent severity tier is incorrect`);
    assert.equal(isolatedCore.pairEventRank({type,pairClass:"adjacent"}),base+25,`${type} adjacent bonus is incorrect`);
  });
  assert.equal(isolatedCore.pairEventRank({type:"stack transition"}),200,"stack transition without pairClass did not reach its severity tier");
  assert.equal(isolatedCore.pairEventRank({type:"deep defense",pairClass:"wide"}),550,"deep-defense severity tier is incorrect");

  const freshWideCrossover = {type:"crossover",pairClass:"wide",age:0,rank:95,ref:"MA1/MA5"};
  const staleWideCrossRisk = {type:"cross risk",pairClass:"wide",age:3,rank:52,ref:"MA1/MA4"};
  assert.equal(isolatedCore.pairEventScore(freshWideCrossover),800.095);
  assert.equal(isolatedCore.pairEventScore(staleWideCrossRisk),297.052);
  assert.strictEqual(isolatedCore.selectHigherPriorityPairEvent(staleWideCrossRisk,freshWideCrossover),freshWideCrossover,"fresh crossover did not replace stale cross risk");

  const stackTransitionCandidate = {type:"stack transition",age:0,rank:45,ref:"stack"};
  const adjacentCompressionCandidate = {type:"compression",pairClass:"adjacent",age:0,rank:45,ref:"MA1/MA2"};
  assert.strictEqual(isolatedCore.selectHigherPriorityPairEvent(adjacentCompressionCandidate,stackTransitionCandidate),stackTransitionCandidate,"pairClass-less stack transition did not outrank lower-tier compression");
  const transitionSeries = [Array(8).fill(1030),Array(8).fill(1000)];
  const transitionSelected = isolatedCore.detectMaPair(transitionSeries,[{slot:1,slotId:"MA1",period:9},{slot:2,slotId:"MA2",period:21}],{
    times:[1,2,3,4,5,6,7,8],alignment:60,setup:1,spreadDelta:0,nearCross:true,atrSeries:Array(8).fill(200)
  },8);
  assert(transitionSelected && transitionSelected.type==="stack transition" && transitionSelected.ref==="stack","production selector did not allow stack transition to outrank detected compression");

  const simultaneousCandidates = [
    {type:"compression release",pairClass:"adjacent",age:0,rank:70,ref:"MA1/MA2"},
    {type:"bounce/no-cross",pairClass:"adjacent",age:0,rank:78,ref:"MA2/MA3"},
    {type:"failed crossover",pairClass:"wide",age:2,rank:96,ref:"MA1/MA5"},
    {type:"cross risk",pairClass:"deep",age:0,rank:52,ref:"MA2/MA4"},
    {type:"expansion",pairClass:"adjacent",age:0,rank:58,ref:"MA3/MA4"}
  ];
  const simultaneousBest = simultaneousCandidates.reduce((best,event)=>isolatedCore.selectHigherPriorityPairEvent(best,event),null);
  assert.strictEqual(simultaneousBest,simultaneousCandidates[2],"multi-candidate selection did not prefer the decisive failed crossover");

  const trRows = [
    [0,10,11,9,10],
    [1,10,13,9,12],
    [2,12,15,12,14],
    [3,14,14,10,11]
  ];
  assert.equal(isolatedVolatility.trueRange(trRows[1],10),4,"true range did not include the largest gap/range component");
  assert.deepStrictEqual(Array.from(isolatedVolatility.trueRangeSeries(trRows).slice(1)),[4,3,4]);
  const atr2 = isolatedVolatility.atrSeries(trRows,2);
  assert.equal(atr2[2],3.5,"ATR seed average is incorrect");
  assert.equal(atr2[3],3.75,"Wilder ATR smoothing is incorrect");

  const monotonicRows = Array.from({length:45},(_value,index)=>[index,100+index,102+index,99+index,101+index]);
  const adxSnapshot = isolatedVolatility.snapshot(monotonicRows,14,5);
  assert(Math.abs(adxSnapshot.adx-100)<1e-9,"monotonic-trend ADX should converge to 100");
  assert.equal(adxSnapshot.adxShadow,adxSnapshot.adxSeries[monotonicRows.length-6],"ADX shadow did not use exactly five candles ago");
  const closedVolatility = isolatedVolatility.snapshot(monotonicRows.slice(0,-1),14,5);
  const formingRows = monotonicRows.concat([[45,145,175,80,146]]);
  const liveVolatility = isolatedVolatility.snapshot(formingRows,14,5);
  assert.notEqual(liveVolatility.atr,closedVolatility.atr,"forming-inclusive ATR did not consume the supplied forming candle");
  const alternateTfRows = Array.from({length:45},(_value,index)=>[index,200+index*2,205+index*2,195+index*2,202+index*2]);
  assert.notEqual(isolatedVolatility.snapshot(alternateTfRows,14,5).atr,closedVolatility.atr,"independent timeframe data produced a shared ATR result");

  const twoSlots = isolatedRuntime.slots.slice(0,2);
  const eventCtx = length => ({ times:Array.from({length},(_value,index)=>index+1), alignment:80, setup:1, spreadDelta:0.02, atrSeries:Array(length).fill(100) });
  const slowEventSeries = Array(11).fill(100);
  const failedFastSeries = [99,99,99,99,101,102,99,98,97,96,95];
  const failedAges = [7,8,9,10,11].map(length => isolatedCore.detectMaPair([failedFastSeries.slice(0,length),slowEventSeries.slice(0,length)],twoSlots,eventCtx(length),11));
  assert.deepStrictEqual(failedAges.map(event=>event && event.age),[0,1,2,3,4],"failed crossover did not age from its original cross-back candle");
  assert.equal(failedAges[0].dir,1,"failed-crossover dir no longer represents the original bullish cross");
  assert.equal(isolatedCore.cleanMaPairTypeText(failedAges[0]),"Failed Crossover | Bearish","bullish-cross failure did not display its bearish outcome");
  assert.deepStrictEqual(failedAges.map(event=>isolatedCore.freshMaPairEventText(event)),[
    "EMAs 3 / 4 Failed Crossover | Bearish | current candle",
    "EMAs 3 / 4 Failed Crossover | Bearish | 1 candle ago",
    "EMAs 3 / 4 Failed Crossover | Bearish | 2 candles ago",
    "EMAs 3 / 4 Failed Crossover | Bearish | 3 candles ago",
    "No fresh event"
  ]);
  const bullishOutcomeFast = [101,101,101,101,99,98,101];
  const bullishOutcomeFailure = isolatedCore.detectMaPair([bullishOutcomeFast,slowEventSeries.slice(0,7)],twoSlots,eventCtx(7),11);
  assert(bullishOutcomeFailure && bullishOutcomeFailure.type==="failed crossover" && bullishOutcomeFailure.dir===-1,"bearish-cross failure event construction changed");
  assert.equal(isolatedCore.cleanMaPairTypeText(bullishOutcomeFailure),"Failed Crossover | Bullish","bearish-cross failure did not display its bullish outcome");
  const newerCrossFast = failedFastSeries.slice(0,8).concat([101]);
  const newerCross = isolatedCore.detectMaPair([newerCrossFast,slowEventSeries.slice(0,9)],twoSlots,eventCtx(9),11);
  assert(newerCross && newerCross.type === "crossover" && newerCross.age === 0 && newerCross.dir === 1,"newer crossover did not replace the older failed crossover");

  const bounceFastSeries = [130,120,110,108,118,130,135,140,145,150];
  const bounceAges = [6,7,8,9,10].map(length => isolatedCore.detectMaPair([bounceFastSeries.slice(0,length),slowEventSeries.slice(0,length)],twoSlots,eventCtx(length),10));
  assert.deepStrictEqual(bounceAges.map(event=>event && event.age),[0,1,2,3,4],"confirmed bounce did not remain anchored to its first confirmation candle");
  assert.equal(isolatedCore.freshMaPairEventText(bounceAges[4]),"No fresh event","bounce remained fresh beyond its three-candle memory");

  const slowSlots = [{slot:1,slotId:"MA1",period:100},{slot:2,slotId:"MA2",period:200}];
  const slowBase = Array(6).fill(63822);
  const pairContext = {times:[1,2,3,4,5,6],alignment:100,setup:1,spreadDelta:0.02,atrSeries:Array(6).fill(120)};
  const microscopicDiff = [100,85,76.5,76,76.01,76.02];
  const microscopic = isolatedCore.detectMaPair([microscopicDiff.map((gap,index)=>slowBase[index]+gap),slowBase],slowSlots,pairContext,6);
  assert(!microscopic || microscopic.type!=="bounce/no-cross","two-cent EMA100/200 expansion still triggered a confirmed bounce");
  const nearMicroscopicDiff = [70,55,42,40,40.01,40.02];
  const nearMicroscopic = isolatedCore.detectMaPair([nearMicroscopicDiff.map((gap,index)=>slowBase[index]+gap),slowBase],slowSlots,pairContext,6);
  assert(!nearMicroscopic || nearMicroscopic.type!=="bounce/no-cross","ATR-near two-cent expansion bypassed the material expansion gate");
  const materialDiff = [100,70,50,40,60,90];
  const material = isolatedCore.detectMaPair([materialDiff.map((gap,index)=>slowBase[index]+gap),slowBase],slowSlots,pairContext,6);
  assert(material && material.type==="bounce/no-cross","material EMA100/200 re-expansion was not detected");
  assert(material.label.includes("MA-pair re-expansion") && material.displayType==="MA-pair Re-expansion","slow-pair wording was not corrected");
  const fastSlots = [{slot:1,slotId:"MA1",period:9},{slot:2,slotId:"MA2",period:21}];
  const fastDiff = [30,20,10,8,18,30];
  const fastBounce = isolatedCore.detectMaPair([fastDiff.map((gap,index)=>slowBase[index]+gap),slowBase],fastSlots,pairContext,6);
  assert(fastBounce && fastBounce.type==="bounce/no-cross" && fastBounce.displayType==="Bounce","fast-pair bounce behavior/wording regressed");

  const constantGapFast = Array(8).fill(1030),constantGapSlow = Array(8).fill(1000);
  const tightByAtr = isolatedCore.detectMaPair([constantGapFast,constantGapSlow],fastSlots,{...eventCtx(8),atrSeries:Array(8).fill(200)},8);
  const looseByAtr = isolatedCore.detectMaPair([constantGapFast,constantGapSlow],fastSlots,{...eventCtx(8),atrSeries:Array(8).fill(100)},8);
  assert(tightByAtr && tightByAtr.type==="compression","ATR-relative compression did not recognize a 0.15 ATR gap");
  assert(!looseByAtr || looseByAtr.type!=="compression","same dollar gap remained compressed at 0.30 ATR");
  const narrowingDiff = [70,68,66,64,62,60,55,50];
  const crossRisk = isolatedCore.detectMaPair([narrowingDiff.map(gap=>1000+gap),Array(8).fill(1000)],fastSlots,{...eventCtx(8),atrSeries:Array(8).fill(120)},8);
  const noCrossRisk = isolatedCore.detectMaPair([narrowingDiff.map(gap=>1000+gap),Array(8).fill(1000)],fastSlots,{...eventCtx(8),atrSeries:Array(8).fill(80)},8);
  assert(crossRisk && crossRisk.type==="cross risk","ATR-relative cross risk did not recognize a narrowing 0.42 ATR gap");
  assert(!noCrossRisk || noCrossRisk.type!=="cross risk","same dollar gap remained cross risk above 0.50 ATR");
  const releaseDiff = [70,65,60,55,50,30,29,60];
  const release = isolatedCore.detectMaPair([releaseDiff.map(gap=>1000+gap),Array(8).fill(1000)],fastSlots,{...eventCtx(8),atrSeries:Array(8).fill(120)},8);
  assert(release && release.type==="compression release","ATR-relative compression release origin/destination was not detected");

  const positionCases = [
    {price:90,mas:[100,110,120,130,140],expected:1},
    {price:105,mas:[100,110,120,130,140],expected:2},
    {price:115,mas:[100,110,120,130,140],expected:3},
    {price:125,mas:[100,110,120,130,140],expected:4},
    {price:135,mas:[100,110,120,130,140],expected:5},
    {price:150,mas:[100,110,120,130,140],expected:6},
    {price:125,mas:[140,100,130,110,120],expected:4},
    {price:125,mas:[140,130,120,110,100],expected:4}
  ];
  positionCases.forEach(({price,mas,expected}) => assert.equal(isolatedCore.pricePosition(price,mas),expected,`price-position mismatch for ${price} vs ${mas.join("/")}`));

  const fullBull = isolatedCore.buildStackRank([105, 104, 103, 102, 101], "up", 1, isolatedRuntime.slots);
  const brokenMiddleBull = isolatedCore.buildStackRank([105, 104, 106, 102, 101], "mixed", 1, isolatedRuntime.slots);
  const brokenSlowAdjacentBull = isolatedCore.buildStackRank([105, 104, 103, 100, 101], "mixed", 1, isolatedRuntime.slots);
  const fullBear = isolatedCore.buildStackRank([101, 102, 103, 104, 105], "down", -1, isolatedRuntime.slots);
  const brokenMiddleBear = isolatedCore.buildStackRank([101, 102, 100, 104, 105], "mixed", -1, isolatedRuntime.slots);
  assert.equal(fullBull.summary, "Bullish stack");
  assert.notEqual(brokenMiddleBull.summary, "Bullish stack", "MA2/MA3 contradiction was promoted to a bullish stack");
  assert.notEqual(brokenSlowAdjacentBull.summary, "Bullish stack", "adjacent MA4/MA5 contradiction was promoted to a bullish stack");
  assert.equal(fullBear.summary, "Bearish stack");
  assert.notEqual(brokenMiddleBear.summary, "Bearish stack", "MA2/MA3 contradiction was promoted to a bearish stack");
  const withinTolerance = isolatedCore.buildStackRank([105, 104, 103, 102, 101.995], "mixed", 1, isolatedRuntime.slots);
  assert.equal(withinTolerance.diagnostics.debug.bullishComparisons["MA4>MA5"], false, "adjacent MA4/MA5 tolerance was not applied");

  const adjacentFailSeries = [
    Array(8).fill(140), Array(8).fill(130), Array(8).fill(120),
    [99, 99, 99, 99, 101, 102, 99, 98], Array(8).fill(100)
  ];
  const adjacentFailure = isolatedCore.detectMaPair(adjacentFailSeries, isolatedRuntime.slots, { times:[1,2,3,4,5,6,7,8], alignment:60, setup:1, spreadDelta:0 }, 8);
  assert(adjacentFailure && adjacentFailure.ref === "MA4/MA5" && adjacentFailure.pairClass === "adjacent" && adjacentFailure.type === "failed crossover", "adjacent MA4/MA5 cross-back was not detected as failed");
  assert.equal(adjacentFailure.dir, 1, "failed adjacent MA4/MA5 direction did not describe the original bullish cross");
  const adjacentContractionSeries = [
    Array(8).fill(140), Array(8).fill(130), Array(8).fill(120),
    [99, 99, 99, 99, 101, 100.8, 100.5, 100.3], Array(8).fill(100)
  ];
  const adjacentContractionEvent = isolatedCore.detectMaPair(adjacentContractionSeries, isolatedRuntime.slots, { times:[1,2,3,4,5,6,7,8], alignment:60, setup:1, spreadDelta:0 }, 8);
  assert(!adjacentContractionEvent || adjacentContractionEvent.type !== "failed crossover", "adjacent MA4/MA5 contraction without cross-back was mislabeled failed");

  const pairVerificationCases = [
    { ref:"MA1/MA3", targetIndex:2, pairClass:"deep", baselines:[null,130,100,80,70] },
    { ref:"MA1/MA4", targetIndex:3, pairClass:"wide", baselines:[null,130,120,100,80] },
    { ref:"MA1/MA5", targetIndex:4, pairClass:"wide", baselines:[null,140,130,120,100] }
  ];
  pairVerificationCases.forEach(({ ref,targetIndex,pairClass,baselines }) => {
    const target = baselines[targetIndex];
    const buildSeries = ma1 => baselines.map((value,index) => index === 0 ? ma1 : Array(8).fill(value));
    const failedSeries = buildSeries([target-1,target-1,target-1,target-1,target+1,target+2,target-1,target-2]);
    const failure = isolatedCore.detectMaPair(failedSeries, isolatedRuntime.slots, { times:[1,2,3,4,5,6,7,8], alignment:60, setup:1, spreadDelta:0 }, 8);
    assert(failure && failure.ref === ref && failure.pairClass === pairClass && failure.type === "failed crossover", `${ref} genuine cross-back was not detected as a failed ${pairClass} crossover`);
    assert.equal(failure.dir, 1, `${ref} failure direction did not describe the original bullish cross`);

    const contractionSeries = buildSeries([target-1,target-1,target-1,target-1,target+1,target+0.8,target+0.5,target+0.3]);
    const contraction = isolatedCore.detectMaPair(contractionSeries, isolatedRuntime.slots, { times:[1,2,3,4,5,6,7,8], alignment:60, setup:1, spreadDelta:0 }, 8);
    assert(!contraction || contraction.type !== "failed crossover", `${ref} contraction without cross-back was mislabeled failed`);
  });

  const events = api.markerEvents({ key: "15m", interval: "15m" }, runtime.rows);
  assert(Array.isArray(events), "markerEvents did not return an array");

  const tfResults = Object.fromEntries(["1m","3m","5m","15m","30m","1H","4H","1D"].map((key,index) => [key, { ...isolated, pricePosition:index%6+1, provisional:["1m","3m","5m","15m","30m"].includes(key) }]));
  runtime.context.__BT001_MA_STACK_BUILD__.presentation.renderEnhanced(tfResults);
  const stripHtml = runtime.document.getElementById("v33MAStackStrip").innerHTML;
  assert.equal((stripHtml.match(/v33-ma-stack-group/g) || []).length, 8, "strip did not render all eight timeframes");
  assert.equal((stripHtml.match(/v33-ma-live-badge/g) || []).length, 5, "LIVE badge did not render on exactly five timeframes");
  assert.equal((stripHtml.match(/v33-price-position"/g) || []).length, 8, "price-position track did not render for all eight timeframes");
  assert.equal((stripHtml.match(/v33-price-position-mark is-current/g) || []).length, 8, "each timeframe did not render exactly one current-price dot");
  assert(stripHtml.includes('data-position="1"') && stripHtml.includes('data-position="6"'),"price-position endpoint rendering missing");
  ["1m","3m","5m","15m","30m"].forEach(tf => assert(stripHtml.includes(`data-tf="${tf}"`) && stripHtml.includes(`data-interval="${tf}"`), `${tf} DOM anchor missing`));
  assert(cssSource.includes(".v33-ma-stack-box .v33-ma-live-badge"), "LIVE badge styling missing");
  const tooltipBelow = runtime.context.__BT001_MA_STACK_BUILD__.presentation.compactTooltipHtml({key:"1m"},{...isolated,adx:24.9,adxPrevious:20});
  const tooltipBoundary = runtime.context.__BT001_MA_STACK_BUILD__.presentation.compactTooltipHtml({key:"1m"},{...isolated,adx:25,adxPrevious:20});
  assert(tooltipBelow.indexOf("Quality:") < tooltipBelow.indexOf("ADX:") && tooltipBelow.indexOf("ADX:") < tooltipBelow.indexOf("Spread:"),"ADX tooltip row is not immediately below Quality");
  assert(!tooltipBelow.includes("v33-ma-stack-tip-adx is-actionable"),"ADX below 25 rendered bold");
  assert(tooltipBoundary.includes("v33-ma-stack-tip-adx is-actionable") && tooltipBoundary.includes("ADX: 25 (from 20)"),"ADX 25 boundary did not render bold with shadow value");

  api.start();
  assert.equal(runtime.visible, true);
  assert(runtime.document.getElementById("v33MAStackMetric"), "metric DOM identity missing");
  assert(runtime.document.getElementById("v33MAStackStrip"), "strip DOM identity missing");
  assert.equal(runtime.timers.size, 1, "start did not schedule one refresh");
  api.refreshSoon();
  api.refreshSoon();
  assert.equal(runtime.timers.size, 1, "refreshSoon did not coalesce");
  const scheduled = Array.from(runtime.timers.values())[0];
  runtime.timers.clear();
  scheduled();
  await Promise.resolve();
  await Promise.resolve();
  assert(runtime.ensureCalls >= 1, "refresh did not ensure MA Stack buffers");
  api.stop();
  assert.equal(runtime.visible, false);

  assert(moduleSource.includes('tip.id = "v33MAStackTooltip"'), "tooltip DOM identity changed");
  assert(cssSource.includes("#v33MAStackMetric") && cssSource.includes(".v33-ma-stack-box") && cssSource.includes("#v33MAStackTooltip"));
  const maOwnerIndex = htmlSource.indexOf("features/ma/ma-index.js");
  const volatilityIndex = htmlSource.indexOf("features/ma-stack/ma-stack-volatility.js");
  const coreIndex = htmlSource.indexOf("features/ma-stack/ma-stack-core.js");
  const runtimeIndex = htmlSource.indexOf("features/ma-stack/ma-stack-runtime.js");
  const facadeIndex = htmlSource.indexOf("features/ma-stack/ma-stack.js");
  const mainIndex = htmlSource.indexOf("main.js");
  assert(maOwnerIndex < volatilityIndex && volatilityIndex < coreIndex && coreIndex < runtimeIndex && runtimeIndex < facadeIndex && facadeIndex < mainIndex, "MA Stack script dependency order changed");
  assert(!/const MA_STACK_STRIP = \(\(\) =>/.test(mainSource), "strip implementation remains in main.js");
  assert(mainSource.includes("const MA_STACK_STRIP = window.MA_STACK_STRIP;"), "Event Lab compatibility alias missing");
  ["stackPeriods", "hubRowToKline", "markerEvents", "stackSlots"].forEach(name => assert(mainSource.includes(`MA_STACK_STRIP.${name}`), `${name} Event Lab contract missing`));
  assert(!/function render\s*\(/.test(coreSource + runtimeSource + moduleSource), "dead render() remains");
  assert(!/function fetchTf\s*\(/.test(coreSource + runtimeSource + moduleSource), "dead fetchTf() remains");
  assert(coreSource.includes("root.core ="), "core build slice missing");
  assert(runtimeSource.includes("root.runtime ="), "runtime build slice missing");
  assert(moduleSource.includes("root.presentation ="), "presentation build slice missing");

  console.log("MA Stack extraction tests: PASS", { apiMethods: 9, volatilityIndependent: true, atrWilder: true, adxWilder: true, adxShadow: 5, atrNormalizedEvents: true, microscopicBounceRejected: true, canonicalPeriods: true, provisionalDefaults: true, liveBadges: 5, eventAging: true, bounceAging: true, newerEventHandoff: true, pricePositions: 6, fullStackOrdering: true, adjacentPairFailedCross: true, deepAndWidePairFailedCross: 3, authoritativeSnapshot: true, lifecycle: true, throttle: true, domIdentity: true, eventLabContracts: 4 });
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
