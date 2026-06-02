(() => {
  "use strict";

  function ensureDepthForCurrentState() {
    try {
      const runtime = window.MA_RUNTIME_CONTEXT || {};
      const candles = typeof runtime.getCandles === "function" ? runtime.getCandles() : window.candles;
      const desiredDepth = typeof runtime.chartDesiredClosedDepth === "function" ? runtime.chartDesiredClosedDepth : window.chartDesiredClosedDepth;
      const older = typeof runtime.olderIfNeeded === "function" ? runtime.olderIfNeeded : window.olderIfNeeded;
      const currentRange = typeof runtime.range === "function" ? runtime.range : window.range;
      if (!Array.isArray(candles) || !candles.length) return;
      if (typeof desiredDepth !== "function" || typeof older !== "function" || typeof currentRange !== "function") return;
      const visible = typeof runtime.getVisibleCount === "function"
        ? runtime.getVisibleCount()
        : window.visibleCount || (typeof runtime.getDefaultVisible === "function" ? runtime.getDefaultVisible() : 283);
      const need = desiredDepth(visible);
      if (candles.length >= need) return;
      older(currentRange());
    } catch (_e) {}
  }

  function handleToggleChange(el) {
    if (!el || !el.id) return;
    const byId = { tglEMA20: 1, tglEMA50: 2, tglEMA3: 3, tglEMA4: 4, tglEMA5: 5 };
    const slot = byId[el.id];
    if (!slot) return;
    const settings = window.MA_SETTINGS_MODULE;
    if (settings) settings.setEnabled(slot, !!el.checked);
    if (el.checked) ensureDepthForCurrentState();
  }

  window.MA_OVERLAY_MODULE = {
    ensureDepthForCurrentState,
    handleToggleChange
  };
})();
