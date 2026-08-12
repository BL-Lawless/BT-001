(() => {
  "use strict";

  function valueAt(arr, t) {
    if (typeof window.valAt === "function") return window.valAt(arr, t);
    if (!Array.isArray(arr)) return null;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Number(arr[i].time) <= Number(t)) return arr[i].value;
    }
    return null;
  }

  function formatValue(v) {
    const n = Number(v);
    if (Number.isFinite(n) && typeof window.fp === "function") return window.fp(n);
    return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "-";
  }

  function maMasterVisible() {
    try {
      return localStorage.getItem("btc_futures_chart_v13_21_indicators_visible") !== "0";
    } catch (_e) {
      return true;
    }
  }

  function maRows(c) {
    const seriesApi = window.MA_SERIES_MODULE;
    const settings = window.MA_SETTINGS_MODULE;
    const slots = seriesApi ? seriesApi.getCanonicalMASlots() : [];
    const rows = [];
    slots.forEach(slot => {
      if (!maMasterVisible() || !slot.enabled) return;
      rows.push({
        text: slot.label + " : " + formatValue(valueAt(slot.series, c.time)),
        color: slot.color
      });
    });
    if (settings) settings.updateLabels();
    return rows;
  }

  function installTooltipOwner() {
    const registry = window.BT001_CANDLE_TOOLTIP_ROWS;
    if (!registry || typeof registry.register !== "function") return;
    registry.register("features-ma", maRows);
  }

  window.MA_TOOLTIP_MODULE = {
    installTooltipOwner
  };
})();
