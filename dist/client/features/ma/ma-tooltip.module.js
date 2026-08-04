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

  function installTooltipOwner() {
    if (window.__maTooltipOwnerInstalled) return;
    if (typeof window.candleTip !== "function") return;
    const runtime = window.MA_RUNTIME_CONTEXT || {};
    const chartCanvas = typeof runtime.getCanvas === "function" ? runtime.getCanvas() : window.canvas;
    const chartCtx = typeof runtime.getCtx === "function" ? runtime.getCtx() : window.ctx;
    if (!chartCtx || !chartCanvas) return;
    window.__maTooltipOwnerInstalled = true;

    window.candleTip = function (c) {
      const lines = [
        { text: window.formatDateTime(c.time * 1000) },
        { text: "O : " + window.ip(c.open) },
        { text: "H : " + window.ip(c.high) },
        { text: "L : " + window.ip(c.low) },
        { text: "C : " + window.ip(c.close) },
        { text: "V : " + window.fv(c.volume) }
      ];

      const seriesApi = window.MA_SERIES_MODULE;
      const settings = window.MA_SETTINGS_MODULE;
      const slots = seriesApi ? seriesApi.getCanonicalMASlots() : [];
      slots.forEach(slot => {
        if (!maMasterVisible()) return;
        if (!slot.enabled) return;
        lines.push({
          text: slot.label + " : " + formatValue(valueAt(slot.series, c.time)),
          color: slot.color
        });
      });

      const pad = 7;
      const lh = 14;
      const runtime = window.MA_RUNTIME_CONTEXT || {};
      const ctx = typeof runtime.getCtx === "function" ? runtime.getCtx() : window.ctx;
      const canvas = typeof runtime.getCanvas === "function" ? runtime.getCanvas() : window.canvas;
      const right = typeof runtime.getRightAxisWidth === "function" ? runtime.getRightAxisWidth() : Number(window.RIGHT_AXIS) || 84;
      if (!ctx || !canvas) return;
      ctx.save();
      let tw = 0;
      ctx.font = "11px Arial";
      lines.forEach(line => { tw = Math.max(tw, ctx.measureText(String(line.text)).width); });
      tw += pad * 2;
      const th = lines.length * lh + pad * 2;
      const x = Math.max(8, canvas.clientWidth - right - tw - 12);
      const y = 8;
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.strokeStyle = "#d9dce1";
      ctx.fillRect(x, y, tw, th);
      ctx.strokeRect(x, y, tw, th);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((line, i) => {
        ctx.fillStyle = line.color || "#1e2329";
        ctx.fillText(String(line.text), x + pad, y + pad + i * lh);
      });
      ctx.restore();
      if (settings) settings.updateLabels();
    };
  }

  window.MA_TOOLTIP_MODULE = {
    installTooltipOwner
  };
})();
