"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..", "..");
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
  vm.runInContext(coreSource, context, { filename: "ma-stack-core.js" });
  vm.runInContext(runtimeSource, context, { filename: "ma-stack-runtime.js" });
  vm.runInContext(moduleSource, context, { filename: "ma-stack.js" });
  return { context, api: context.MA_STACK_STRIP, document, rows, periods, timers, hub, snapshotRequests, get visible() { return visible; }, get ensureCalls() { return ensureCalls; }, get snapshotCalls() { return snapshotCalls; } };
}

function createCoreOnlyRuntime(periods) {
  const context = { console: { log() {}, info() {}, warn() {}, error() {} }, Date, Map, Set };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(coreSource, context, { filename: "ma-stack-core.js" });
  return {
    core: context.__BT001_MA_STACK_BUILD__.core,
    slots: periods.map((period, i) => ({ slot: i + 1, slotId: `MA${i + 1}`, period }))
  };
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

  const isolatedRuntime = createCoreOnlyRuntime(runtime.periods);
  const isolatedCore = isolatedRuntime.core;
  const isolatedRows = runtime.rows.slice();
  const isolated = isolatedCore.classify(isolatedRows, { tfKey: "fixture", tfInterval: "15m", sourceType: "isolated-test", sourcePath: "isolated-test", sourceIndex: isolatedRows.length - 1 }, { slots: isolatedRuntime.slots });
  assert(isolated && isolated.rank && isolated.rank.diagnostics, "isolated core classification failed");
  assert.equal(typeof isolatedCore.emaSeries, "function");
  assert.equal(isolatedCore.emaSeries([1, 2, 3, 4, 5], 3).length, 5);

  const twoSlots = isolatedRuntime.slots.slice(0,2);
  const eventCtx = length => ({ times:Array.from({length},(_value,index)=>index+1), alignment:80, setup:1, spreadDelta:0.02 });
  const slowEventSeries = Array(11).fill(100);
  const failedFastSeries = [99,99,99,99,101,102,99,98,97,96,95];
  const failedAges = [7,8,9,10,11].map(length => isolatedCore.detectMaPair([failedFastSeries.slice(0,length),slowEventSeries.slice(0,length)],twoSlots,eventCtx(length),11));
  assert.deepStrictEqual(failedAges.map(event=>event && event.age),[0,1,2,3,4],"failed crossover did not age from its original cross-back candle");
  assert.deepStrictEqual(failedAges.map(event=>isolatedCore.freshMaPairEventText(event)),[
    "EMAs 3 / 4 Failed Crossover | current candle",
    "EMAs 3 / 4 Failed Crossover | 1 candle ago",
    "EMAs 3 / 4 Failed Crossover | 2 candles ago",
    "EMAs 3 / 4 Failed Crossover | 3 candles ago",
    "No fresh event"
  ]);
  const newerCrossFast = failedFastSeries.slice(0,8).concat([101]);
  const newerCross = isolatedCore.detectMaPair([newerCrossFast,slowEventSeries.slice(0,9)],twoSlots,eventCtx(9),11);
  assert(newerCross && newerCross.type === "crossover" && newerCross.age === 0 && newerCross.dir === 1,"newer crossover did not replace the older failed crossover");

  const bounceFastSeries = [100.2,100.15,100.1,100.05,100.08,100.12,100.16,100.2,100.24,100.28];
  const bounceAges = [6,7,8,9,10].map(length => isolatedCore.detectMaPair([bounceFastSeries.slice(0,length),slowEventSeries.slice(0,length)],twoSlots,eventCtx(length),10));
  assert.deepStrictEqual(bounceAges.map(event=>event && event.age),[0,1,2,3,4],"confirmed bounce did not remain anchored to its first confirmation candle");
  assert.equal(isolatedCore.freshMaPairEventText(bounceAges[4]),"No fresh event","bounce remained fresh beyond its three-candle memory");

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
  const coreIndex = htmlSource.indexOf("features/ma-stack/ma-stack-core.js");
  const runtimeIndex = htmlSource.indexOf("features/ma-stack/ma-stack-runtime.js");
  const facadeIndex = htmlSource.indexOf("features/ma-stack/ma-stack.js");
  const mainIndex = htmlSource.indexOf("main.js");
  assert(maOwnerIndex < coreIndex && coreIndex < runtimeIndex && runtimeIndex < facadeIndex && facadeIndex < mainIndex, "MA Stack script dependency order changed");
  assert(!/const MA_STACK_STRIP = \(\(\) =>/.test(mainSource), "strip implementation remains in main.js");
  assert(mainSource.includes("const MA_STACK_STRIP = window.MA_STACK_STRIP;"), "Event Lab compatibility alias missing");
  ["stackPeriods", "hubRowToKline", "markerEvents", "stackSlots"].forEach(name => assert(mainSource.includes(`MA_STACK_STRIP.${name}`), `${name} Event Lab contract missing`));
  assert(!/function render\s*\(/.test(coreSource + runtimeSource + moduleSource), "dead render() remains");
  assert(!/function fetchTf\s*\(/.test(coreSource + runtimeSource + moduleSource), "dead fetchTf() remains");
  assert(coreSource.includes("root.core ="), "core build slice missing");
  assert(runtimeSource.includes("root.runtime ="), "runtime build slice missing");
  assert(moduleSource.includes("root.presentation ="), "presentation build slice missing");

  console.log("MA Stack extraction tests: PASS", { apiMethods: 9, canonicalPeriods: true, provisionalDefaults: true, liveBadges: 5, eventAging: true, bounceAging: true, newerEventHandoff: true, pricePositions: 6, fullStackOrdering: true, adjacentPairFailedCross: true, deepAndWidePairFailedCross: 3, authoritativeSnapshot: true, lifecycle: true, throttle: true, domIdentity: true, eventLabContracts: 4 });
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
