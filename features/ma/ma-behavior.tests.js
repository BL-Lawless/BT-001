"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = path.resolve(__dirname, "..", "..");
const sources = {
  settings: fs.readFileSync(path.join(__dirname, "ma-settings.module.js"), "utf8"),
  series: fs.readFileSync(path.join(__dirname, "ma-series.module.js"), "utf8"),
  overlay: fs.readFileSync(path.join(__dirname, "ma-overlay.module.js"), "utf8"),
  tooltip: fs.readFileSync(path.join(__dirname, "ma-tooltip.module.js"), "utf8"),
  main: fs.readFileSync(path.join(repo, "main.js"), "utf8"),
  pressure: fs.readFileSync(path.join(repo, "features", "pressure-signal", "index.js"), "utf8"),
  html: fs.readFileSync(path.join(repo, "index.html"), "utf8"),
  manifest: fs.readFileSync(path.join(repo, "features", "settings", "tab-manifest.js"), "utf8"),
  css: fs.readFileSync(path.join(repo, "style.css"), "utf8")
};

const KEY = {
  period: n => n <= 3 ? `btc_futures_chart_v12_ema_period_${n}` : `btc_futures_chart_v13_32r1_ma${n}Period`,
  toggle: n => `btc_futures_chart_v12_ema_toggle_${n}`,
  color: n => n <= 3 ? `btc_futures_chart_v13_05_ema${n}_color` : `btc_futures_chart_v13_32r1_ma${n}Color`,
  alpha: n => n <= 3 ? `btc_futures_chart_v13_05_ema${n}_alpha` : `btc_futures_chart_v13_32r1_ma${n}Alpha`,
  width: n => n <= 3 ? `btc_futures_chart_v13_18_ema${n}_width` : `btc_futures_chart_v13_32r1_ma${n}Width`,
  vwapColor: "btc_futures_chart_v13_05_vwap_color",
  vwapAlpha: "btc_futures_chart_v13_05_vwap_alpha",
  vwapWidth: "btc_futures_chart_v13_18_vwap_width",
  master: "btc_futures_chart_v13_21_indicators_visible"
};

class FakeElement {
  constructor(id = "", owner = null) {
    this.id = id;
    this.owner = owner;
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this.children = [];
    this.listeners = new Map();
    this.className = "";
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type) {
    (this.listeners.get(type) || []).forEach(fn => fn({ target: this }));
  }
  appendChild(child) { this.children.push(child); return child; }
  insertBefore(child) { this.children.push(child); return child; }
  closest() { return this; }
  remove() { if (this.owner) this.owner.elements.delete(this.id); }
  querySelector(selector) {
    if (selector === ".settings-card-desc") return this.owner.desc;
    if (selector === ".patch8-indicator-grid") return this.owner.grid;
    return null;
  }
  set innerHTML(html) {
    this._innerHTML = html;
    const input = /<input id="([^"]+)"[^>]*?(?:value="([^"]*)")?[^>]*>/g;
    let match;
    while ((match = input.exec(html))) {
      const el = new FakeElement(match[1], this.owner);
      const tag = match[0];
      const value = tag.match(/value="([^"]*)"/);
      if (value) el.value = value[1];
      this.owner.elements.set(el.id, el);
    }
  }
  get innerHTML() { return this._innerHTML || ""; }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    getItem: k => values.has(k) ? values.get(k) : null,
    setItem: (k, v) => values.set(k, String(v)),
    snapshot: () => Object.fromEntries(values)
  };
}

function createRuntime(initial = {}, { toggles = true, candles = [{ close: 1 }, { close: 2 }] } = {}) {
  const storage = memoryStorage(initial);
  const dom = { elements: new Map(), desc: null, grid: null };
  const add = id => { const el = new FakeElement(id, dom); dom.elements.set(id, el); return el; };
  if (toggles) {
    ["tglEMA20", "tglEMA50", "tglEMA3", "tglEMA4", "tglEMA5", "tglVWAP"].forEach(add);
  }
  ["lblEMA20", "lblEMA50", "lblEMA3", "lblEMA4", "lblEMA5", "emaPeriod1", "emaPeriod2", "emaPeriod3"].forEach(add);
  const card = add("maSettingsCard");
  dom.desc = new FakeElement("description", dom);
  dom.grid = new FakeElement("grid", dom);
  card.appendChild = child => { dom.grid = child; return child; };
  const toggleBox = new FakeElement("toggles", dom);
  const document = {
    getElementById: id => dom.elements.get(id) || null,
    querySelector: selector => selector === ".indicator-toggles" ? toggleBox : null,
    createElement: () => new FakeElement("", dom)
  };
  let rebuilds = 0;
  let draws = 0;
  const seriesMap = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    document,
    localStorage: storage,
    candles,
    draw: () => { draws++; },
    MA_RUNTIME_CONTEXT: {
      getCandles: () => candles,
      getSeriesMap: () => seriesMap,
      computeEMA: (rows, period) => rows.map((row, index) => ({ time: index, value: row.close + period })),
      computeVWAP: rows => rows.map((row, index) => ({ time: index, value: row.close })),
      setVWAP: value => { context.vwap = value; },
      getVWAP: () => context.vwap
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(sources.settings, context, { filename: "ma-settings.module.js" });
  vm.runInContext(sources.series, context, { filename: "ma-series.module.js" });
  vm.runInContext(sources.overlay, context, { filename: "ma-overlay.module.js" });
  context.MA_FEATURE = {
    rebuildSeries() { rebuilds++; context.MA_SERIES_MODULE.rebuildSeries(); }
  };
  return { context, storage, dom, add, rebuilds: () => rebuilds, draws: () => draws };
}

function setToggleStates(runtime, states) {
  ["tglEMA20", "tglEMA50", "tglEMA3", "tglEMA4", "tglEMA5"].forEach((id, i) => {
    runtime.dom.elements.get(id).checked = !!states[i];
  });
}

// MA-T01: every legacy key family remains the live storage contract, including absent-key defaults.
{
  const defaults = createRuntime();
  assert.deepStrictEqual(Array.from(defaults.context.MA_SETTINGS_MODULE.getCanonicalMASettings(), s => ({
    period: s.period, color: s.color, alpha: s.alpha, width: s.width, enabled: s.enabled
  })), [
    { period: 9, color: "#ff7900", alpha: 100, width: 2, enabled: false },
    { period: 21, color: "#0000ff", alpha: 100, width: 2, enabled: false },
    { period: 55, color: "#d600a9", alpha: 100, width: 2, enabled: false },
    { period: 100, color: "#0b7a00", alpha: 100, width: 2, enabled: false },
    { period: 200, color: "#008c7a", alpha: 100, width: 2, enabled: false }
  ]);

  const stored = {};
  for (let n = 1; n <= 5; n++) {
    stored[KEY.period(n)] = 10 + n;
    stored[KEY.toggle(n)] = n % 2 ? "1" : "0";
    stored[KEY.color(n)] = `#00000${n}`;
    stored[KEY.alpha(n)] = 40 + n;
    stored[KEY.width(n)] = n;
  }
  stored[KEY.vwapColor] = "#123456";
  stored[KEY.vwapAlpha] = "37";
  stored[KEY.vwapWidth] = "4.5";
  stored[KEY.master] = "0";
  const rt = createRuntime(stored, { toggles: false });
  const slots = rt.context.MA_SETTINGS_MODULE.getCanonicalMASettings();
  slots.forEach((slot, i) => {
    const n = i + 1;
    assert.deepStrictEqual({ period: slot.period, color: slot.color, alpha: slot.alpha, width: slot.width, enabled: slot.enabled },
      { period: 10 + n, color: `#00000${n}`, alpha: 40 + n, width: n, enabled: n % 2 === 1 });
  });
  rt.context.MA_SETTINGS_MODULE.rebuildSettings();
  assert.equal(rt.dom.elements.get("maOwnerVWAPColor").value, "#123456");
  assert.equal(rt.dom.elements.get("maOwnerVWAPAlpha").value, "37");
  assert.equal(rt.dom.elements.get("maOwnerVWAPWidth").value, "4.5");
  const noVwap = createRuntime();
  noVwap.context.MA_SETTINGS_MODULE.rebuildSettings();
  assert.equal(noVwap.dom.elements.get("maOwnerVWAPColor").value, "#6f6658");
  assert.equal(noVwap.dom.elements.get("maOwnerVWAPAlpha").value, "100");
  assert.equal(noVwap.dom.elements.get("maOwnerVWAPWidth").value, "2");
  assert.equal(defaults.storage.getItem(KEY.master), null, "master visibility defaults by key absence");
}

// MA-T02: five-slot canonical snapshots track default, all-on, all-off, and mixed live settings.
{
  const rt = createRuntime();
  const snapshot = states => {
    setToggleStates(rt, states);
    return Array.from(rt.context.MA_SERIES_MODULE.getCanonicalMASlots(), s => ({
      slot: s.slot, period: s.period, color: s.color, alpha: s.alpha, stroke: s.stroke, width: s.width, enabled: s.enabled
    }));
  };
  assert.deepStrictEqual(snapshot([false, false, false, false, false]).map(s => s.enabled), [false, false, false, false, false]);
  assert.deepStrictEqual(snapshot([true, true, true, true, true]).map(s => s.enabled), [true, true, true, true, true]);
  assert.deepStrictEqual(snapshot([false, false, false, false, false]).map(s => s.enabled), [false, false, false, false, false]);
  rt.storage.setItem(KEY.period(1), "13");
  rt.storage.setItem(KEY.color(3), "#abcdef");
  rt.storage.setItem(KEY.alpha(4), "44");
  rt.storage.setItem(KEY.width(5), "5.5");
  const mixed = snapshot([true, false, true, false, true]);
  assert.deepStrictEqual(mixed.map(s => s.enabled), [true, false, true, false, true]);
  assert.equal(mixed[0].period, 13);
  assert.equal(mixed[2].color, "#abcdef");
  assert.equal(mixed[2].stroke, "rgba(171,205,239,1)");
  assert.equal(mixed[3].alpha, 44);
  assert.equal(mixed[3].stroke, "rgba(11,122,0,0.44)");
  assert.equal(mixed[4].width, 5.5);
  assert.deepStrictEqual(Array.from(rt.context.MA_SERIES_MODULE.getVWAPSeries()), [], "VWAP is a separate series, not a sixth MA slot");
}

// MA-T03: only the five owned toggle IDs mutate MA state.
{
  const rt = createRuntime();
  const ids = ["tglEMA20", "tglEMA50", "tglEMA3", "tglEMA4", "tglEMA5"];
  ids.forEach((id, i) => rt.context.MA_OVERLAY_MODULE.handleToggleChange({ id, checked: true }));
  ids.forEach((id, i) => assert.equal(rt.storage.getItem(KEY.toggle(i + 1)), "1"));
  const before = rt.storage.snapshot();
  ["tglTrades", "tglPositions", "tglLots", "tglDollarValues"].forEach(id => {
    rt.context.MA_OVERLAY_MODULE.handleToggleChange({ id, checked: true });
  });
  assert.deepStrictEqual(rt.storage.snapshot(), before);
}

// MA-T04: settings UI changes persist to the current keys, update snapshots, and rebuild MA series.
{
  const rt = createRuntime();
  rt.context.MA_SETTINGS_MODULE.rebuildSettings();
  const cases = [
    ["maOwnerMA2Period", "input", "34", KEY.period(2), s => s.period, 34],
    ["maOwnerMA3Color", "change", "#112233", KEY.color(3), s => s.color, "#112233"],
    ["maOwnerMA4Alpha", "input", "46", KEY.alpha(4), s => s.alpha, 46],
    ["maOwnerMA5Width", "change", "3.5", KEY.width(5), s => s.width, 3.5]
  ];
  cases.forEach(([id, event, value, key, read, expected]) => {
    const before = rt.rebuilds();
    const el = rt.dom.elements.get(id);
    el.value = value;
    el.dispatch(event);
    assert.equal(rt.storage.getItem(key), value);
    assert.equal(read(rt.context.MA_SERIES_MODULE.getCanonicalMASlots()[Number(id.match(/MA(\d)/)[1]) - 1]), expected);
    assert.equal(rt.rebuilds(), before + 1);
  });
  [["maOwnerVWAPColor", "#654321", KEY.vwapColor], ["maOwnerVWAPAlpha", "52", KEY.vwapAlpha], ["maOwnerVWAPWidth", "6", KEY.vwapWidth]].forEach(([id, value, key]) => {
    const el = rt.dom.elements.get(id);
    el.value = value;
    el.dispatch("change");
    assert.equal(rt.storage.getItem(key), value);
  });
}

// MA-T05: execute the live Patch 21 wrapper body and prove master-off suppresses every draw.
{
  const wrapper = sources.main.match(/if\(typeof drawInd === "function" && !window\.__v13Patch21DrawIndWrapped\)\{[\s\S]*?\n  \}/);
  assert(wrapper, "Patch 21 drawInd wrapper was not found");
  const calls = [];
  const context = { localStorage: memoryStorage(), drawInd: (...args) => calls.push(args) };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(`const IND_VIS_KEY21=${JSON.stringify(KEY.master)}; ${wrapper[0]}`, context);
  context.drawInd("MA1");
  context.drawInd("VWAP");
  assert.deepStrictEqual(calls.map(call => call[0]), ["MA1", "VWAP"]);
  context.localStorage.setItem(KEY.master, "0");
  context.drawInd("MA1-enabled");
  context.drawInd("VWAP-enabled");
  assert.equal(calls.length, 2, "master-off must suppress draws regardless of individual enabled state");
  assert(/function drawPriceLevels\(\)\{\s*if\(!levelsEnabled\(\)\) return;/.test(sources.main), "Key levels must depend only on their own stored toggle state");
  assert(/function drawDsma\(\)\{\s*if\(!enabled\(\)\) return;/.test(sources.main), "DSMA must depend only on its own stored toggle state");
  assert(!sources.main.includes("indicatorVisibilityOn"), "DSMA/Key levels must not retain a master-visibility helper");
}

function exposeFunction(source, startText, endText, names, prelude = "") {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert(start >= 0 && end > start, `could not extract ${startText}`);
  const context = { console: { log() {}, warn() {}, error() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(`${prelude}\n${source.slice(start, end)}\nthis.__exports={${names.join(",")}};`, context);
  return context;
}

// MA-T06: execute both external consumers' live provider-selection/normalization functions.
{
  const periods = [12, 26, 60, 111, 222];
  const canonical = periods.map((period, i) => ({ slot: i + 1, period }));
  const pressure = exposeFunction(sources.pressure, "  function signalCanonicalSlots37", "  function signalADataPlan37", ["signalCanonicalSlots37"]);
  pressure.MA_FEATURE = { getCanonicalMASlots: () => canonical };
  assert.deepStrictEqual(Array.from(pressure.__exports.signalCanonicalSlots37(), s => s.period), periods);
  pressure.MA_FEATURE = null;
  assert.deepStrictEqual(Array.from(pressure.__exports.signalCanonicalSlots37(), s => s.period), [9, 21, 55, 100, 200]);

  const sssc = exposeFunction(sources.main, "  let hadCanonicalMaSlots=false;", "  function pairSlots", ["currentMaSlots", "currentMaPeriods"], "const DEFAULT_MA_PERIODS=[9,21,55,100,200];");
  assert.deepStrictEqual(Array.from(sssc.__exports.currentMaPeriods()), [9, 21, 55, 100, 200], "startup fallback changed");
  sssc.MA_FEATURE = { getCanonicalMASlots: () => canonical };
  assert.deepStrictEqual(Array.from(sssc.__exports.currentMaPeriods()), periods, "SSSC did not consume current canonical periods");
  sssc.MA_FEATURE = null;
  assert.equal(sssc.__exports.currentMaSlots(), null, "SSSC reused defaults after canonical availability");
  assert.equal(sssc.__exports.currentMaSlots({ allowStartupFallback: false }), null);
  assert(!sources.pressure.slice(sources.pressure.indexOf("function signalCanonicalSlots37"), sources.pressure.indexOf("function signalADataPlan37")).includes("window.getCanonicalMASlots"), "Pressure Signal retains the compatibility-global fallback");
  assert(!sources.main.slice(sources.main.indexOf("function currentMaSlots"), sources.main.indexOf("function currentMaPeriods")).includes("window.getCanonicalMASlots"), "SSSC retains the compatibility-global fallback");
}

// Step 2 ownership: the owner has a static Chart-tab mount and old startup builders stay absent.
{
  assert(sources.html.includes('id="maSettingsCard"'), "the MA owner mount is not static");
  assert(sources.html.includes('id="emaPeriod1" type="hidden"'), "the live MA1 compatibility input is missing");
  assert(sources.manifest.includes('"maSettingsCard"'), "the settings registry does not adopt the MA owner card");
  ["patch5EmaCard", "installPatch8IndicatorSettings", "rebuildIndicatorSettings18", "tightenIndicatorRows19"].forEach(name => {
    assert(!sources.main.includes(name), `${name} startup builder remains`);
  });
  assert(!sources.html.includes('id="legacyEmaSettingsCard"'), "the legacy EMA card remains");
  assert(/#maSettingsCard \.patch8-indicator-grid\{[\s\S]*?grid-template-columns:96px 56px 96px minmax\(112px,1fr\) minmax\(112px,1fr\)/.test(sources.css), "the MA owner grid does not define all five columns");
  assert(sources.main.includes("function canonicalChartMASlots()"), "the chart lacks a direct canonical-slot reader");
  assert(sources.main.includes("drawInd(slot.series,vis,im,mapX,mapY,slot.stroke,slot.width)"), "the chart does not render from canonical slot fields");
}

// MA-B08/B09: MA registers rows without replacing candleTip and respects slot/master visibility.
{
  let registered = null;
  let labelUpdates = 0;
  const originalCandleTip = () => "base";
  const context = {
    candleTip: originalCandleTip,
    localStorage: memoryStorage(),
    fp: value => Number(value).toFixed(2),
    MA_SETTINGS_MODULE: { updateLabels: () => { labelUpdates++; } },
    MA_SERIES_MODULE: {
      getCanonicalMASlots: () => [
        { label: "EMA9", enabled: true, color: "#ff7900", series: [{ time: 10, value: 101.25 }] },
        { label: "EMA21", enabled: false, color: "#0000ff", series: [{ time: 10, value: 99 }] }
      ]
    },
    BT001_CANDLE_TOOLTIP_ROWS: {
      register(id, provider) { registered = { id, provider }; return true; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(sources.tooltip, context, { filename: "ma-tooltip.module.js" });
  context.MA_TOOLTIP_MODULE.installTooltipOwner();
  assert.equal(context.candleTip, originalCandleTip, "MA replaced the base candle tooltip");
  assert.equal(registered.id, "features-ma");
  let rows = registered.provider({ time: 10 });
  assert.deepStrictEqual(Array.from(rows, row => ({ text: row.text, color: row.color })), [{ text: "EMA9 : 101.25", color: "#ff7900" }]);
  assert.equal(labelUpdates, 1);
  context.localStorage.setItem(KEY.master, "0");
  rows = registered.provider({ time: 10 });
  assert.deepStrictEqual(Array.from(rows), [], "master-off did not suppress MA tooltip rows");
  assert(!/window\.candleTip\s*=/.test(sources.tooltip), "MA still assigns window.candleTip");
  assert(sources.main.includes("window.BT001_CANDLE_TOOLTIP_ROWS"), "base tooltip row registry is missing");
  assert(sources.main.includes("...window.BT001_CANDLE_TOOLTIP_ROWS.rows(c)"), "base tooltip does not collect contributed rows");
}

console.log("MA behavior tests: PASS", {
  storageCompatibility: true,
  fiveSlotSnapshots: true,
  toggleFiltering: true,
  settingsChanges: true,
  masterVisibility: true,
  externalConsumers: true
});
