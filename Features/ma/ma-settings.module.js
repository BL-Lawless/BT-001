(() => {
  "use strict";

  const STYLE = "btc_futures_chart_v13_05_";
  const WIDTH = "btc_futures_chart_v13_18_";
  const EXTRA = "btc_futures_chart_v13_32r1_";
  const TOGGLE = "btc_futures_chart_v12_ema_toggle_";
  const STORE = "btc_futures_chart_v12_";
  const CORE_PERIOD_KEYS = [null, "ema_period_1", "ema_period_2", "ema_period_3"];
  const SLOT_IDS = [1, 2, 3, 4, 5];

  const defaults = {
    1: { period: 9, color: "#ff7900", alpha: 100, width: 2, toggle: "tglEMA20", label: "lblEMA20", periodEl: "emaPeriod1" },
    2: { period: 21, color: "#0000ff", alpha: 100, width: 2, toggle: "tglEMA50", label: "lblEMA50", periodEl: "emaPeriod2" },
    3: { period: 55, color: "#d600a9", alpha: 100, width: 2, toggle: "tglEMA3", label: "lblEMA3", periodEl: "emaPeriod3" },
    4: { period: 100, color: "#0b7a00", alpha: 100, width: 2, toggle: "tglEMA4", label: "lblEMA4" },
    5: { period: 200, color: "#008c7a", alpha: 100, width: 2, toggle: "tglEMA5", label: "lblEMA5" }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d = null) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const $id = id => document.getElementById(id);
  const ls = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? String(d) : v;
    } catch (_e) {
      return String(d);
    }
  };
  const set = (k, v) => {
    try { localStorage.setItem(k, String(v)); } catch (_e) {}
  };

  const corePeriodKey = n => STORE + CORE_PERIOD_KEYS[n];
  const periodKey = n => (n <= 3 ? corePeriodKey(n) : EXTRA + "ma" + n + "Period");
  const toggleKey = n => TOGGLE + n;
  const colorKey = n => (n <= 3 ? STYLE + "ema" + n + "_color" : EXTRA + "ma" + n + "Color");
  const alphaKey = n => (n <= 3 ? STYLE + "ema" + n + "_alpha" : EXTRA + "ma" + n + "Alpha");
  const widthKey = n => (n <= 3 ? WIDTH + "ema" + n + "_width" : EXTRA + "ma" + n + "Width");
  const vwapColorKey = () => STYLE + "vwap_color";
  const vwapAlphaKey = () => STYLE + "vwap_alpha";
  const vwapWidthKey = () => WIDTH + "vwap_width";

  function period(n) {
    return Math.max(1, Math.min(999, Math.round(num(ls(periodKey(n), defaults[n].period), defaults[n].period))));
  }
  function color(n) { return ls(colorKey(n), defaults[n].color); }
  function alpha(n) { return clamp(num(ls(alphaKey(n), defaults[n].alpha), defaults[n].alpha), 0, 100); }
  function width(n) { return clamp(num(ls(widthKey(n), defaults[n].width), defaults[n].width), 1, 10); }
  function vwapColor() { return ls(vwapColorKey(), "#6f6658"); }
  function vwapAlpha() { return clamp(num(ls(vwapAlphaKey(), 100), 100), 0, 100); }
  function vwapWidth() { return clamp(num(ls(vwapWidthKey(), 2), 2), 1, 10); }
  function rgba(hex, alphaPct) {
    const a = clamp(num(alphaPct, 100), 0, 100) / 100;
    let h = String(hex || "#000000").replace("#", "");
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    h = (h + "000000").slice(0, 6);
    return `rgba(${parseInt(h.slice(0, 2), 16) || 0},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 0},${a})`;
  }
  function strokeFor(n) { return rgba(color(n), alpha(n)); }
  function enabled(n) {
    const el = $id(defaults[n].toggle);
    if (el) return !!el.checked;
    try { return localStorage.getItem(toggleKey(n)) === "1"; } catch (_e) { return false; }
  }

  function setEnabled(n, on) {
    set(toggleKey(n), on ? "1" : "0");
    const el = $id(defaults[n].toggle);
    if (el) el.checked = !!on;
  }

  function syncHiddenPeriodInputs() {
    [1, 2, 3].forEach(n => {
      const el = $id(defaults[n].periodEl);
      if (el) el.value = String(period(n));
    });
  }

  function updateLabels() {
    SLOT_IDS.forEach(n => {
      const l = $id(defaults[n].label);
      if (l) l.textContent = "EMA" + period(n);
    });
  }

  function ensureToggle(n) {
    const box = document.querySelector(".indicator-toggles");
    if (!box) return;
    const before = $id("tglVWAP") && $id("tglVWAP").closest("label");
    let el = $id(defaults[n].toggle);
    if (!el) {
      const lab = document.createElement("label");
      lab.className = "toggle";
      lab.innerHTML = `<input id="${defaults[n].toggle}" type="checkbox"><span id="${defaults[n].label}">EMA${period(n)}</span>`;
      box.insertBefore(lab, before || null);
      el = $id(defaults[n].toggle);
    }
    if (!el) return;
    try {
      const raw = localStorage.getItem(toggleKey(n));
      if (raw != null) el.checked = raw === "1";
    } catch (_e) {}
    if (!el.__maOwnerBound) {
      el.__maOwnerBound = true;
      el.addEventListener("change", () => {
        setEnabled(n, !!el.checked);
        if (window.MA_FEATURE && typeof window.MA_FEATURE.ensureDepthForCurrentState === "function" && el.checked) {
          window.MA_FEATURE.ensureDepthForCurrentState();
        }
        if (typeof window.indicators === "function") window.indicators();
        if (typeof window.draw === "function") window.draw();
      }, false);
    }
  }

  function ensureToggles() {
    ensureToggle(4);
    ensureToggle(5);
    updateLabels();
  }

  function getCanonicalMASettings() {
    return SLOT_IDS.map(n => ({
      slot: n,
      slotId: "MA" + n,
      period: period(n),
      color: color(n),
      alpha: alpha(n),
      width: width(n),
      enabled: enabled(n)
    }));
  }

  function inputRow(n) {
    return `<div>EMA${period(n)}</div><div><input id="maOwnerMA${n}Period" type="number" min="1" max="999" step="1" value="${period(n)}"></div><input id="maOwnerMA${n}Color" type="color" value="${color(n)}"><input id="maOwnerMA${n}Alpha" type="range" min="0" max="100" step="1" value="${alpha(n)}"><input id="maOwnerMA${n}Width" type="range" min="1" max="10" step="0.5" value="${width(n)}" title="Thickness">`;
  }

  function bindSettingsRow(n) {
    const p = $id(`maOwnerMA${n}Period`);
    const c = $id(`maOwnerMA${n}Color`);
    const a = $id(`maOwnerMA${n}Alpha`);
    const w = $id(`maOwnerMA${n}Width`);
    const refresh = () => {
      syncHiddenPeriodInputs();
      updateLabels();
      if (window.MA_FEATURE && typeof window.MA_FEATURE.rebuildSeries === "function") window.MA_FEATURE.rebuildSeries();
      try { if (window.MA_STACK_STRIP) window.MA_STACK_STRIP.refreshSoon(); } catch (_e) {}
      try { if (typeof window.draw === "function") window.draw(); } catch (_e) {}
    };
    if (p && !p.__maOwnerBound) {
      p.__maOwnerBound = true;
      const sync = () => {
        set(periodKey(n), clamp(Math.round(num(p.value, defaults[n].period)), 1, 999));
        refresh();
      };
      p.addEventListener("input", sync, false);
      p.addEventListener("change", sync, false);
    }
    if (c && !c.__maOwnerBound) {
      c.__maOwnerBound = true;
      const sync = () => { set(colorKey(n), c.value); refresh(); };
      c.addEventListener("input", sync, false);
      c.addEventListener("change", sync, false);
    }
    if (a && !a.__maOwnerBound) {
      a.__maOwnerBound = true;
      const sync = () => { set(alphaKey(n), clamp(num(a.value, defaults[n].alpha), 0, 100)); refresh(); };
      a.addEventListener("input", sync, false);
      a.addEventListener("change", sync, false);
    }
    if (w && !w.__maOwnerBound) {
      w.__maOwnerBound = true;
      const sync = () => { set(widthKey(n), clamp(num(w.value, defaults[n].width), 1, 10)); refresh(); };
      w.addEventListener("input", sync, false);
      w.addEventListener("change", sync, false);
    }
  }

  function bindVWAPSettings() {
    [
      ["maOwnerVWAPColor", vwapColorKey(), value => value],
      ["maOwnerVWAPAlpha", vwapAlphaKey(), value => clamp(num(value, 100), 0, 100)],
      ["maOwnerVWAPWidth", vwapWidthKey(), value => clamp(num(value, 2), 1, 10)]
    ].forEach(([id, key, normalize]) => {
      const el = $id(id);
      if (!el || el.__maOwnerBound) return;
      el.__maOwnerBound = true;
      const sync = () => {
        set(key, normalize(el.value));
        try { if (typeof window.draw === "function") window.draw(); } catch (_e) {}
      };
      el.addEventListener("input", sync, false);
      el.addEventListener("change", sync, false);
    });
  }

  function rebuildSettings() {
    const card = $id("patch8IndicatorCard");
    if (!card) return;
    const old = $id("v32r1MASettings");
    if (old) old.remove();
    const desc = card.querySelector(".settings-card-desc");
    if (desc) desc.textContent = "Set period, color, transparency, and thickness in one row per indicator.";
    let grid = card.querySelector(".patch8-indicator-grid");
    if (!grid) {
      grid = document.createElement("div");
      card.appendChild(grid);
    }
    grid.className = "patch8-indicator-grid ma-owner-grid";
    grid.innerHTML = `<div class="patch8-head">Indicator</div><div class="patch8-head">Value</div><div class="patch8-head">Color</div><div class="patch8-head">Transparency</div><div class="patch8-head">Thickness</div>${SLOT_IDS.map(inputRow).join("")}<div>VWAP</div><div><span style="color:var(--muted)">-</span></div><input id="maOwnerVWAPColor" type="color" value="${vwapColor()}"><input id="maOwnerVWAPAlpha" type="range" min="0" max="100" step="1" value="${vwapAlpha()}"><input id="maOwnerVWAPWidth" type="range" min="1" max="10" step="0.5" value="${vwapWidth()}" title="Thickness">`;
    SLOT_IDS.forEach(bindSettingsRow);
    bindVWAPSettings();
  }

  window.MA_SETTINGS_MODULE = {
    defaults,
    slotIds: SLOT_IDS,
    period,
    color,
    alpha,
    width,
    strokeFor,
    enabled,
    setEnabled,
    syncHiddenPeriodInputs,
    updateLabels,
    ensureToggles,
    rebuildSettings,
    getCanonicalMASettings
  };
})();
