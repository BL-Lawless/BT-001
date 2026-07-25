"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..", "..");
const registryPath = path.join(root, "features/settings/tab-registry.js");
const manifestPath = path.join(root, "features/settings/tab-manifest.js");
const registrySource = fs.readFileSync(registryPath, "utf8");
const manifestSource = fs.readFileSync(manifestPath, "utf8");
const CANONICAL_KEY = "bt001.settings.activeTab.v1";
const IDS = ["apis", "chart", "sessions", "strategy-lab", "assess", "ma-event-lab", "key-levels", "smc", "signals", "heatmap"];
const ORDERS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }
  add(...names) {
    names.forEach(name => this.values.add(name));
    this.sync();
  }
  remove(...names) {
    names.forEach(name => this.values.delete(name));
    this.sync();
  }
  contains(name) {
    return this.values.has(name);
  }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : !!force;
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    this.sync();
    return enabled;
  }
  setFromString(value) {
    this.values = new Set(String(value || "").split(/\s+/).filter(Boolean));
    this.sync();
  }
  sync() {
    this.element._className = Array.from(this.values).join(" ");
  }
}

function descendants(element) {
  const result = [];
  element.children.forEach(child => {
    result.push(child, ...descendants(child));
  });
  return result;
}

function matches(element, selector) {
  if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
  if (selector.startsWith("#")) return element.id === selector.slice(1);
  return false;
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.classList = new FakeClassList(this);
    this._className = "";
    this.id = "";
    this.textContent = "";
    this.hidden = false;
    this.tabIndex = 0;
    this.listeners = new Map();
  }
  set className(value) {
    this.classList.setFromString(value);
  }
  get className() {
    return this._className;
  }
  appendChild(child) {
    if (child.parentNode) {
      const index = child.parentNode.children.indexOf(child);
      if (index >= 0) child.parentNode.children.splice(index, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  prepend(child) {
    if (child.parentNode) {
      const index = child.parentNode.children.indexOf(child);
      if (index >= 0) child.parentNode.children.splice(index, 1);
    }
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name] || null;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  querySelector(selector) {
    return descendants(this).find(element => matches(element, selector)) || null;
  }
  querySelectorAll(selector) {
    return descendants(this).filter(element => matches(element, selector));
  }
  focus() {
    this.focused = true;
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    snapshot() {
      return Object.fromEntries(values);
    }
  };
}

function createRuntime(initialStorage = {}) {
  const grid = new FakeElement("div");
  grid.className = "settings-grid";
  const storage = memoryStorage(initialStorage);
  const quietConsole = { log() {}, warn() {}, error() {} };
  const document = {
    createElement: tagName => new FakeElement(tagName),
    querySelector: selector => selector === "#settingsModal .settings-grid" ? grid : null
  };
  const context = {
    console: quietConsole,
    document,
    localStorage: storage,
    AbortController,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    TypeError
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(registrySource, context, { filename: "tab-registry.js" });
  return { api: context.BT001SettingsTabs, grid, storage };
}

function definitions(failingId = null) {
  return IDS.map((id, index) => ({
    id,
    label: id,
    order: ORDERS[index],
    mount({ body }) {
      if (id === failingId) throw new Error("fixture mount failed");
      const marker = new FakeElement("div");
      marker.id = `mounted-${id}`;
      body.appendChild(marker);
    }
  }));
}

function captureManifest() {
  const captured = [];
  const context = {
    console,
    document: { getElementById: () => null },
    BT001SettingsTabs: {
      register(definition) {
        captured.push(definition);
      },
      start() {
        return this;
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(manifestSource, context, { filename: "tab-manifest.js" });
  return captured;
}

function allJavaScript(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...allJavaScript(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) result.push(full);
  }
  return result;
}

const manifest = captureManifest();
assert.deepStrictEqual(manifest.map(item => item.id), IDS, "manifest IDs or order changed");
assert.deepStrictEqual(manifest.map(item => item.order), ORDERS, "manifest orders changed");
assert.equal(new Set(manifest.map(item => item.id)).size, manifest.length, "manifest contains a duplicate ID");
assert.equal(new Set(manifest.map(item => item.order)).size, manifest.length, "manifest contains a duplicate order");

const runtime = createRuntime();
definitions("assess").forEach(definition => runtime.api.register(definition));
runtime.api.start();
assert.equal(runtime.grid.querySelectorAll(".v24-settings-tab").length, IDS.length, "registry did not create exactly one button per definition");
assert.equal(runtime.grid.querySelectorAll(".v24-settings-panel").length, IDS.length, "registry did not create exactly one panel per definition");
assert(runtime.api.get("assess").error, "failed mount was not recorded");
assert(runtime.api.get("heatmap").body.querySelector("#mounted-heatmap"), "one failed mount prevented another tab from mounting");

for (const id of IDS) {
  assert.equal(runtime.api.activate(id, { persist: true, focus: true }), id);
  assert.equal(runtime.storage.snapshot()[CANONICAL_KEY], id, `${id} did not persist through the canonical key`);
}

for (const id of IDS) {
  const restored = createRuntime({ [CANONICAL_KEY]: id });
  definitions().forEach(definition => restored.api.register(definition));
  restored.api.start();
  assert.equal(restored.api.getActiveId(), id, `reload did not restore ${id}`);
}

const invalid = createRuntime();
definitions().forEach(definition => invalid.api.register(definition));
invalid.api.start();
assert.equal(invalid.api.activate("sssc", { persist: true, focus: true }), "apis", "removed SSSC ID did not fall back to APIs");
assert.equal(invalid.api.activate("control", { persist: true, focus: true }), "apis", "removed Control ID did not fall back to APIs");

const legacyControl = createRuntime({ btc_futures_chart_v13_24_settings_tab: "control" });
definitions().forEach(definition => legacyControl.api.register(definition));
legacyControl.api.start();
assert.equal(legacyControl.api.getActiveId(), "chart", "legacy stored Control selection was not migrated to Chart");
const legacyMa = createRuntime({ btc_futures_chart_v13_ma_stack_markers_last_tab: "1" });
definitions().forEach(definition => legacyMa.api.register(definition));
legacyMa.api.start();
assert.equal(legacyMa.api.getActiveId(), "ma-event-lab", "legacy MAs Event Lab selection was not migrated");

const validation = createRuntime();
validation.api.register(definitions()[0]);
assert.throws(() => validation.api.register(definitions()[0]), /Duplicate settings tab ID/);
assert.throws(() => validation.api.register({ id: "chart", label: "Chart", order: 100, mount() {} }), /Duplicate settings tab order/);
assert.throws(() => validation.api.register({ id: "Bad ID", label: "Bad", order: 200, mount() {} }), /Invalid settings tab ID/);
assert.throws(() => validation.api.register({ id: "bad", label: "", order: 200, mount() {} }), /label is required/);
assert.throws(() => validation.api.register({ id: "bad", label: "Bad", mount() {} }), /order is required/);
assert.throws(() => validation.api.register({ id: "bad", label: "Bad", order: 200 }), /mount must be a function/);

assert(!IDS.includes("control") && !IDS.includes("sssc") && !IDS.includes("supabase") && !IDS.includes("scalp"), "removed settings tabs remain in the manifest");
const chartMount = manifestSource.slice(manifestSource.indexOf("chart(context)"), manifestSource.indexOf("sessions(context)"));
assert(chartMount.includes('"v21TrackpadCard"'), "Trackpad sensitivity is not explicitly mounted under Chart");
assert(manifestSource.includes('"scalpSupabaseSettingsCard"'), "Supabase card has no explicit manifest destination");
assert(manifestSource.slice(manifestSource.indexOf("apis(context)"), manifestSource.indexOf("chart(context)")).includes('"scalpSupabaseSettingsCard"'), "Supabase card is not mounted under APIs");

const mainSource = fs.readFileSync(path.join(root, "main.js"), "utf8");
assert(!/installSettingsTabs24|tabForCard24|dedupeMovedCards24|fallbackGrid/.test(mainSource), "the unmatched-card fallback router remains");
assert(!/installSsscSettingsPlaceholder|setSsscTabActive/.test(mainSource), "dead SSSC Settings placeholder remains");
assert(!/OpenSettingsWrapped|prevOpenSettings|prevOpenSssc|prevOpen26/.test(mainSource), "an independent openSettings wrapper remains");
assert.equal((mainSource.match(/function installDaySeparatorToggle\s*\(/g) || []).length, 1, "duplicate day-separator installer remains");
assert(mainSource.includes("BT001SettingsTabs.notifyOpen()"), "openSettings is not centralized through notifyOpen");

const rogueCreators = allJavaScript(root)
  .filter(file => file !== registryPath && !file.endsWith(".tests.js"))
  .filter(file => /className\s*=\s*["']v24-settings-tab["']/.test(fs.readFileSync(file, "utf8")));
assert.deepStrictEqual(rogueCreators.map(file => path.relative(root, file)), [], "another source creates a .v24-settings-tab");

console.log("settings tab registry tests: PASS", {
  manifestDefinitions: manifest.length,
  canonicalPersistence: true,
  reloadPersistence: true,
  legacyMigration: true,
  isolatedMountFailure: true,
  centralizedOwnership: true
});
