(() => {
  "use strict";

  const SLOT_IDS = [1, 2, 3, 4, 5];

  function readSeriesMap() {
    const context = window.MA_RUNTIME_CONTEXT;
    if (context && typeof context.getSeriesMap === "function") {
      return context.getSeriesMap();
    }
    if (!window.__maSeriesBySlot || typeof window.__maSeriesBySlot !== "object") {
      window.__maSeriesBySlot = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    }
    return window.__maSeriesBySlot;
  }

  function computeEMA(src, p) {
    const context = window.MA_RUNTIME_CONTEXT;
    if (context && typeof context.computeEMA === "function") return context.computeEMA(src, p);
    return typeof window.EMA === "function" ? window.EMA(src, p) : [];
  }

  function assignSlotSeries(slot, series) {
    const map = readSeriesMap();
    map[slot] = Array.isArray(series) ? series : [];
  }

  function rebuildSeries() {
    const settings = window.MA_SETTINGS_MODULE;
    const context = window.MA_RUNTIME_CONTEXT;
    const src = context && typeof context.getCandles === "function"
      ? context.getCandles()
      : Array.isArray(window.candles)
        ? window.candles
        : [];
    if (!settings || !src.length) return;

    settings.syncHiddenPeriodInputs();
    settings.slotIds.forEach(n => assignSlotSeries(n, computeEMA(src, settings.period(n))));

    const computeVWAP = context && typeof context.computeVWAP === "function"
      ? context.computeVWAP
      : window.VWAP;
    if (typeof computeVWAP === "function") {
      const vw = computeVWAP(src);
      if (context && typeof context.setVWAP === "function") context.setVWAP(vw);
      else window.vwap = vw;
    }

    settings.updateLabels();
  }

  function getVWAPSeries() {
    const context = window.MA_RUNTIME_CONTEXT;
    if (context && typeof context.getVWAP === "function") {
      const series = context.getVWAP();
      return Array.isArray(series) ? series : [];
    }
    return Array.isArray(window.vwap) ? window.vwap : [];
  }

  function getCanonicalMASlots() {
    const settings = window.MA_SETTINGS_MODULE;
    if (!settings) return [];
    const map = readSeriesMap();
    return settings.slotIds.map(n => ({
      slot: n,
      slotId: "MA" + n,
      period: settings.period(n),
      color: settings.color(n),
      alpha: settings.alpha(n),
      width: settings.width(n),
      enabled: settings.enabled(n),
      label: "EMA" + settings.period(n),
      seriesName: "MA" + n,
      series: Array.isArray(map[n]) ? map[n] : []
    }));
  }

  function getCanonicalMAPeriods() {
    return getCanonicalMASlots().map(s => s.period);
  }

  function getActiveChartMASeries() {
    const out = {};
    getCanonicalMASlots().forEach(s => { out[s.slot] = s.series; });
    return out;
  }

  window.MA_SERIES_MODULE = {
    rebuildSeries,
    getCanonicalMASlots,
    getCanonicalMAPeriods,
    getActiveChartMASeries,
    getVWAPSeries,
    getSeriesMap: readSeriesMap
  };
})();
