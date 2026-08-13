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
  let timerId = 0;
  const timers = new Map();
  const hub = {
    setMaStackVisible(value) { visible = value; },
    ensureMaStackBuffers() { ensureCalls++; return Promise.resolve(); },
    getAuthoritativeMaSnapshot(intervalName, options) {
      snapshotCalls++;
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
  return { context, api: context.MA_STACK_STRIP, document, rows, periods, timers, hub, get visible() { return visible; }, get ensureCalls() { return ensureCalls; }, get snapshotCalls() { return snapshotCalls; } };
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

  const isolatedRuntime = createCoreOnlyRuntime(runtime.periods);
  const isolatedCore = isolatedRuntime.core;
  const isolatedRows = runtime.rows.slice();
  const isolated = isolatedCore.classify(isolatedRows, { tfKey: "fixture", tfInterval: "15m", sourceType: "isolated-test", sourcePath: "isolated-test", sourceIndex: isolatedRows.length - 1 }, { slots: isolatedRuntime.slots });
  assert(isolated && isolated.rank && isolated.rank.diagnostics, "isolated core classification failed");
  assert.equal(typeof isolatedCore.emaSeries, "function");
  assert.equal(isolatedCore.emaSeries([1, 2, 3, 4, 5], 3).length, 5);

  const events = api.markerEvents({ key: "15m", interval: "15m" }, runtime.rows);
  assert(Array.isArray(events), "markerEvents did not return an array");

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

  console.log("MA Stack extraction tests: PASS", { apiMethods: 9, canonicalPeriods: true, authoritativeSnapshot: true, lifecycle: true, throttle: true, domIdentity: true, eventLabContracts: 4 });
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
