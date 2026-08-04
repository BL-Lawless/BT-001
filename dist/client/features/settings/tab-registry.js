(() => {
  "use strict";

  const ACTIVE_TAB_KEY = "bt001.settings.activeTab.v1";
  const LEGACY_TAB_KEY = "btc_futures_chart_v13_24_settings_tab";
  const LEGACY_MA_TAB_KEY = "btc_futures_chart_v13_ma_stack_markers_last_tab";
  const FALLBACK_TAB_ID = "apis";
  const LEGACY_IDS = Object.freeze({
    apis: "apis",
    overlays: "chart",
    chart: "chart",
    control: "chart",
    sessions: "sessions",
    "strategy-lab": "strategy-lab",
    assess: "assess",
    "ma-stack-markers": "ma-event-lab",
    "ma-event-lab": "ma-event-lab",
    "price-levels": "key-levels",
    "key-levels": "key-levels",
    smc: "smc",
    signals: "signals",
    heatmap: "heatmap",
    sssc: FALLBACK_TAB_ID
  });

  const definitions = new Map();
  const orders = new Map();
  const records = new Map();
  const listeners = new Set();
  let started = false;
  let root = null;
  let tabBar = null;
  let panelsRoot = null;
  let activeId = null;

  function assertDefinition(definition) {
    if (!definition || typeof definition !== "object") throw new TypeError("Settings tab definition is required");
    const id = String(definition.id || "");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new TypeError("Invalid settings tab ID: " + id);
    if (!String(definition.label || "").trim()) throw new TypeError("Settings tab label is required for " + id);
    if (definition.order == null || definition.order === "" || !Number.isFinite(Number(definition.order))) {
      throw new TypeError("Settings tab order is required for " + id);
    }
    if (typeof definition.mount !== "function") throw new TypeError("Settings tab mount must be a function for " + id);
    if (definitions.has(id)) throw new Error("Duplicate settings tab ID: " + id);
    if (orders.has(Number(definition.order))) throw new Error("Duplicate settings tab order: " + definition.order);
  }

  function sortedDefinitions() {
    return Array.from(definitions.values()).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  function emit(type, detail = {}) {
    const event = Object.freeze({ type, activeId, ...detail });
    listeners.forEach(listener => {
      try { listener(event); } catch (error) { console.error("Settings tab listener failed", error); }
    });
  }

  function createHost() {
    const grid = document.querySelector("#settingsModal .settings-grid");
    if (!grid) throw new Error("Settings grid is unavailable");
    grid.classList.add("v24-settings-root");
    tabBar = document.createElement("div");
    tabBar.className = "v24-settings-tabs";
    tabBar.setAttribute("role", "tablist");
    tabBar.setAttribute("aria-label", "Settings sections");
    panelsRoot = document.createElement("div");
    panelsRoot.className = "v24-settings-panels";
    grid.prepend(tabBar);
    grid.appendChild(panelsRoot);
    root = grid;
    tabBar.addEventListener("click", event => {
      const button = event.target && event.target.closest
        ? event.target.closest("[data-settings-tab-id]")
        : null;
      if (!button || button.parentNode !== tabBar) return;
      activate(button.dataset.settingsTabId, { persist: true, focus: true });
    });
    tabBar.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const ordered = sortedDefinitions().map(definition => definition.id);
      if (!ordered.length) return;
      const current = Math.max(0, ordered.indexOf(activeId));
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? ordered.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + ordered.length) % ordered.length;
      event.preventDefault();
      activate(ordered[next], { persist: true, focus: true });
    });
  }

  function publicRecord(record) {
    if (!record) return null;
    return {
      id: record.definition.id,
      label: record.definition.label,
      order: record.definition.order,
      button: record.button,
      panel: record.panel,
      body: record.body,
      error: record.error || null
    };
  }

  function contextFor(record) {
    return {
      id: record.definition.id,
      panel: record.panel,
      body: record.body,
      signal: record.controller.signal,
      adopt(element) {
        if (!element) return null;
        record.body.appendChild(element);
        return element;
      },
      activate() {
        return activate(record.definition.id, { persist: true, focus: true });
      },
      isActive() {
        return activeId === record.definition.id;
      },
      requestRefresh() {
        return refresh(record.definition.id);
      }
    };
  }

  function showMountError(record, error) {
    record.error = error;
    console.error(`Settings tab "${record.definition.id}" failed to mount`, error);
    let message = record.body.querySelector(".settings-tab-mount-error");
    if (!message) {
      message = document.createElement("div");
      message.className = "settings-card settings-tab-mount-error";
      record.body.appendChild(message);
    }
    message.textContent = `Unable to load ${record.definition.label}: ${error && error.message ? error.message : String(error)}`;
  }

  function mountRecord(record) {
    try {
      const result = record.definition.mount(contextFor(record));
      if (result && typeof result.then === "function") {
        result.then(cleanup => {
          if (typeof cleanup === "function") record.cleanup = cleanup;
          record.error = null;
        }).catch(error => showMountError(record, error));
      } else {
        if (typeof result === "function") record.cleanup = result;
        record.error = null;
      }
    } catch (error) {
      showMountError(record, error);
    }
  }

  function createRecord(definition) {
    const button = document.createElement("button");
    const buttonId = `settings-tab-${definition.id}`;
    const panelId = `settings-panel-${definition.id}`;
    button.type = "button";
    button.id = buttonId;
    button.className = "v24-settings-tab";
    button.dataset.tab = definition.id;
    button.dataset.settingsTabId = definition.id;
    button.textContent = definition.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panelId);
    button.setAttribute("aria-selected", "false");
    button.tabIndex = -1;

    const panel = document.createElement("div");
    panel.id = panelId;
    panel.className = "v24-settings-panel";
    panel.dataset.tab = definition.id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", buttonId);
    panel.hidden = true;
    const body = document.createElement("div");
    body.className = "v24-settings-panel-grid";
    panel.appendChild(body);

    tabBar.appendChild(button);
    panelsRoot.appendChild(panel);
    const record = { definition, button, panel, body, cleanup: null, error: null, controller: new AbortController() };
    records.set(definition.id, record);
    mountRecord(record);
    return record;
  }

  function reorderDom() {
    sortedDefinitions().forEach(definition => {
      const record = records.get(definition.id);
      if (!record) return;
      tabBar.appendChild(record.button);
      panelsRoot.appendChild(record.panel);
    });
  }

  function register(definition) {
    assertDefinition(definition);
    const normalized = Object.freeze({
      ...definition,
      id: String(definition.id),
      label: String(definition.label).trim(),
      order: Number(definition.order)
    });
    definitions.set(normalized.id, normalized);
    orders.set(normalized.order, normalized.id);
    if (started) {
      createRecord(normalized);
      reorderDom();
      if (!activeId) activate(FALLBACK_TAB_ID, { persist: true, focus: true });
    }
    emit("registered", { id: normalized.id });
    return normalized;
  }

  function unregister(id) {
    id = String(id || "");
    const definition = definitions.get(id);
    if (!definition) return false;
    const record = records.get(id);
    if (record) {
      try { if (typeof record.cleanup === "function") record.cleanup(); } catch (error) { console.error("Settings tab cleanup failed", error); }
      record.controller.abort();
      record.button.remove();
      record.panel.remove();
      records.delete(id);
    }
    definitions.delete(id);
    orders.delete(definition.order);
    if (activeId === id) {
      activeId = null;
      if (started && definitions.size) activate(FALLBACK_TAB_ID, { persist: true, focus: true });
    }
    emit("unregistered", { id });
    return true;
  }

  function readStoredTab() {
    try {
      const canonical = localStorage.getItem(ACTIVE_TAB_KEY);
      if (canonical) return canonical;
      const legacy = localStorage.getItem(LEGACY_TAB_KEY);
      if (legacy) return LEGACY_IDS[legacy] || FALLBACK_TAB_ID;
      if (localStorage.getItem(LEGACY_MA_TAB_KEY) === "1") return "ma-event-lab";
      return FALLBACK_TAB_ID;
    } catch (_error) {
      return FALLBACK_TAB_ID;
    }
  }

  function resolveId(id) {
    id = String(id || "");
    if (definitions.has(id)) return id;
    return definitions.has(FALLBACK_TAB_ID)
      ? FALLBACK_TAB_ID
      : (sortedDefinitions()[0] && sortedDefinitions()[0].id) || null;
  }

  function activate(id, { persist = true, focus = true } = {}) {
    if (!started) start();
    const resolved = resolveId(id);
    if (!resolved) return null;
    activeId = resolved;
    records.forEach((record, recordId) => {
      const active = recordId === resolved;
      record.button.classList.toggle("active", active);
      record.button.setAttribute("aria-selected", active ? "true" : "false");
      record.button.tabIndex = active ? 0 : -1;
      record.panel.classList.toggle("active", active);
      record.panel.hidden = !active;
    });
    if (persist) {
      try { localStorage.setItem(ACTIVE_TAB_KEY, resolved); } catch (_error) {}
    }
    const record = records.get(resolved);
    if (focus && record && typeof record.button.focus === "function") record.button.focus();
    if (record && typeof record.definition.onActivate === "function") {
      try { record.definition.onActivate(contextFor(record)); } catch (error) { console.error(`Settings tab "${resolved}" activation failed`, error); }
    }
    emit("activated", { id: resolved, requestedId: String(id || "") });
    return resolved;
  }

  function start() {
    if (started) return api;
    createHost();
    started = true;
    sortedDefinitions().forEach(createRecord);
    reorderDom();
    activate(readStoredTab(), { persist: true, focus: true });
    emit("started");
    return api;
  }

  function notifyOpen() {
    if (!started) start();
    records.forEach(record => {
      if (typeof record.definition.onOpen !== "function") return;
      try { record.definition.onOpen(contextFor(record)); } catch (error) { console.error(`Settings tab "${record.definition.id}" open hook failed`, error); }
    });
    const resolved = activate(activeId || readStoredTab(), { persist: true, focus: true });
    emit("opened", { id: resolved });
    return resolved;
  }

  function refresh(id) {
    const record = records.get(String(id || ""));
    if (!record) return false;
    mountRecord(record);
    emit("refreshed", { id: record.definition.id });
    return true;
  }

  function has(id) {
    return definitions.has(String(id || ""));
  }

  function get(id) {
    const definition = definitions.get(String(id || ""));
    if (!definition) return null;
    return publicRecord(records.get(definition.id)) || { id: definition.id, label: definition.label, order: definition.order, button: null, panel: null, body: null, error: null };
  }

  function list() {
    return sortedDefinitions().map(definition => get(definition.id));
  }

  function getActiveId() {
    return activeId;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Settings tab listener must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const api = Object.freeze({
    ACTIVE_TAB_KEY,
    LEGACY_TAB_KEY,
    LEGACY_MA_TAB_KEY,
    register,
    unregister,
    start,
    activate,
    notifyOpen,
    refresh,
    has,
    get,
    list,
    getActiveId,
    subscribe
  });

  Object.defineProperty(window, "BT001SettingsTabs", { value: api, configurable: true });
})();
