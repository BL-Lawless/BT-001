(() => {
  "use strict";

  const MODULE = "SMC_SETTINGS_STYLE_01";
  const TOGGLE_KEY = "btc_futures_chart_v13_smc_toggle";
  const SETTINGS_KEY = "btc_futures_chart_v13_smc_settings_v2";
  const TAB_KEY = "btc_futures_chart_v13_24_settings_tab";
  const DEFAULTS = {
    mode: "historical",
    styleMode: "colored",
    colorCandles: false,
    showInternalStructure: true,
    internalBullishStructure: "all",
    internalBearishStructure: "all",
    bullishInternalColor: "#4f46e5",
    bearishInternalColor: "#b45309",
    confluenceFilter: false,
    internalLabelSize: "small",
    showSwingStructure: true,
    swingBullishStructure: "all",
    swingBearishStructure: "all",
    bullishSwingColor: "#0f766e",
    bearishSwingColor: "#b91c1c",
    swingLabelSize: "normal",
    showSwingPoints: false,
    swingLength: 4,
    showStrongWeakHighLow: true,
    maxHistoricalEvents: 12,
    levelRenderStyle: "line",
    levelBandOpacity: 0.14,
    lineOpacitySwing: 0.78,
    lineOpacityInternal: 0.42
  };
  const MONO = {
    swingBull: "#475569",
    swingBear: "#1f2937",
    internalBull: "#94a3b8",
    internalBear: "#64748b",
    levels: "#52525b"
  };
  const LABEL_SCALE = { tiny: 0.82, small: 0.94, normal: 1.06 };

  const state = {
    enabled: false,
    settings: loadSettings(),
    drawings: emptyDrawings(),
    lastSignature: "",
    occupiedBoxes: [],
    levelRows: [],
    candleTint: null
  };

  function emptyDrawings() {
    return {
      swingEvents: [],
      internalEvents: [],
      swingPoints: [],
      levels: [],
      swingBias: 0
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function alpha(hex, amount) {
    const raw = String(hex || "").replace("#", "");
    if (raw.length !== 6) return `rgba(17,24,39,${amount})`;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${amount})`;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sanitizeEnum(value, allowed, fallback) {
    const raw = String(value || "").trim().toLowerCase();
    return allowed.includes(raw) ? raw : fallback;
  }

  function sanitizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
  }

  function currentInterval() {
    try {
      if (typeof iv === "function") return iv();
    } catch (_e) {}
    return document.getElementById("interval")?.value || "15m";
  }

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return sanitizeSettings(raw);
    } catch (_e) {
      return { ...DEFAULTS };
    }
  }

  function sanitizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      mode: sanitizeEnum(source.mode, ["historical", "present"], DEFAULTS.mode),
      styleMode: sanitizeEnum(source.styleMode, ["colored", "monochrome"], DEFAULTS.styleMode),
      colorCandles: !!source.colorCandles,
      showInternalStructure: source.showInternalStructure !== false,
      internalBullishStructure: sanitizeEnum(source.internalBullishStructure, ["all", "bos", "choch"], DEFAULTS.internalBullishStructure),
      internalBearishStructure: sanitizeEnum(source.internalBearishStructure, ["all", "bos", "choch"], DEFAULTS.internalBearishStructure),
      bullishInternalColor: sanitizeColor(source.bullishInternalColor, DEFAULTS.bullishInternalColor),
      bearishInternalColor: sanitizeColor(source.bearishInternalColor, DEFAULTS.bearishInternalColor),
      confluenceFilter: !!source.confluenceFilter,
      internalLabelSize: sanitizeEnum(source.internalLabelSize, ["tiny", "small", "normal"], DEFAULTS.internalLabelSize),
      showSwingStructure: source.showSwingStructure !== false,
      swingBullishStructure: sanitizeEnum(source.swingBullishStructure, ["all", "bos", "choch"], DEFAULTS.swingBullishStructure),
      swingBearishStructure: sanitizeEnum(source.swingBearishStructure, ["all", "bos", "choch"], DEFAULTS.swingBearishStructure),
      bullishSwingColor: sanitizeColor(source.bullishSwingColor, DEFAULTS.bullishSwingColor),
      bearishSwingColor: sanitizeColor(source.bearishSwingColor, DEFAULTS.bearishSwingColor),
      swingLabelSize: sanitizeEnum(source.swingLabelSize, ["tiny", "small", "normal"], DEFAULTS.swingLabelSize),
      showSwingPoints: !!source.showSwingPoints,
      swingLength: clamp(Math.round(num(source.swingLength) || DEFAULTS.swingLength), 2, 10),
      showStrongWeakHighLow: source.showStrongWeakHighLow !== false,
      maxHistoricalEvents: clamp(Math.round(num(source.maxHistoricalEvents) || DEFAULTS.maxHistoricalEvents), 2, 20),
      levelRenderStyle: sanitizeEnum(source.levelRenderStyle, ["line", "band"], DEFAULTS.levelRenderStyle),
      levelBandOpacity: clamp(num(source.levelBandOpacity) || DEFAULTS.levelBandOpacity, 0.04, 0.35),
      lineOpacitySwing: clamp(num(source.lineOpacitySwing) || DEFAULTS.lineOpacitySwing, 0.2, 1),
      lineOpacityInternal: clamp(num(source.lineOpacityInternal) || DEFAULTS.lineOpacityInternal, 0.12, 0.8)
    };
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_e) {}
  }

  function updateSettings(partial) {
    state.settings = sanitizeSettings({ ...state.settings, ...partial });
    persistSettings();
    invalidate();
    syncSettingsControls();
    safeDraw();
  }

  function invalidate() {
    state.drawings = emptyDrawings();
    state.lastSignature = "";
    state.candleTint = null;
  }

  function currentHubRows() {
    const hub = window.PUBLIC_MARKET_DATA_HUB || null;
    const tf = currentInterval();
    let rows = [];
    if (hub && typeof hub.getClosedBuffer === "function") rows = hub.getClosedBuffer(tf) || [];
    if ((!Array.isArray(rows) || !rows.length) && typeof candles !== "undefined" && Array.isArray(candles)) rows = candles;
    return Array.isArray(rows) ? rows : [];
  }

  function normalizeRows(rows) {
    return rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const time = num(row.time);
        const openTimeMs = Number.isFinite(num(row.openTime)) ? num(row.openTime) : (Number.isFinite(time) ? time * 1000 : NaN);
        const open = num(row.open);
        const high = num(row.high);
        const low = num(row.low);
        const close = num(row.close);
        if (!Number.isFinite(time) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
        return { time, openTime: openTimeMs, open, high, low, close };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time)
      .map((row, index) => ({ ...row, index }));
  }

  function pivotAt(rows, index, left, right, side) {
    const row = rows[index];
    if (!row || index < left || index + right >= rows.length) return false;
    const center = side === "high" ? row.high : row.low;
    for (let cursor = index - left; cursor <= index + right; cursor++) {
      if (cursor === index) continue;
      const other = rows[cursor];
      const value = side === "high" ? other.high : other.low;
      if (side === "high" && value >= center) return false;
      if (side === "low" && value <= center) return false;
    }
    return true;
  }

  function detectPivots(rows, scope, left, right) {
    const pivots = [];
    for (let index = left; index < rows.length - right; index++) {
      if (pivotAt(rows, index, left, right, "high")) {
        const row = rows[index];
        pivots.push({ scope, side: "high", price: row.high, index, confirmIndex: index + right, time: row.time, openTime: row.openTime });
      }
      if (pivotAt(rows, index, left, right, "low")) {
        const row = rows[index];
        pivots.push({ scope, side: "low", price: row.low, index, confirmIndex: index + right, time: row.time, openTime: row.openTime });
      }
    }
    return pivots.sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      return a.side === b.side ? 0 : (a.side === "high" ? -1 : 1);
    });
  }

  function classifySwingPoints(pivots) {
    const lastBySide = { high: null, low: null };
    const points = [];
    for (const pivot of pivots) {
      const previous = lastBySide[pivot.side];
      let text = "";
      if (previous) {
        if (pivot.side === "high") text = pivot.price > previous.price ? "HH" : "LH";
        else text = pivot.price > previous.price ? "HL" : "LL";
      }
      if (text) points.push({ ...pivot, text });
      lastBySide[pivot.side] = pivot;
    }
    return points;
  }

  function detectBreaks(rows, pivots, scope) {
    const pivotByIndex = new Map();
    for (const pivot of pivots) {
      const list = pivotByIndex.get(pivot.index) || [];
      list.push({ ...pivot, broken: false });
      pivotByIndex.set(pivot.index, list);
    }

    let trend = 0;
    let activeHigh = null;
    let activeLow = null;
    const events = [];

    for (let index = 0; index < rows.length; index++) {
      const pending = pivotByIndex.get(index);
      if (pending && pending.length) {
        for (const pivot of pending) {
          if (pivot.side === "high") activeHigh = pivot;
          else activeLow = pivot;
        }
      }
      const row = rows[index];
      if (!row) continue;

      if (activeHigh && !activeHigh.broken && index > activeHigh.confirmIndex && row.close > activeHigh.price) {
        const structureType = trend < 0 ? "choch" : "bos";
        trend = 1;
        activeHigh.broken = true;
        events.push({
          scope,
          direction: "bullish",
          structureType,
          text: structureType === "choch" ? "CHoCH" : "BOS",
          pivotTime: activeHigh.time,
          pivotOpenTime: activeHigh.openTime,
          breakTime: row.time,
          breakOpenTime: row.openTime,
          price: activeHigh.price,
          index,
          pivotIndex: activeHigh.index
        });
      }

      if (activeLow && !activeLow.broken && index > activeLow.confirmIndex && row.close < activeLow.price) {
        const structureType = trend > 0 ? "choch" : "bos";
        trend = -1;
        activeLow.broken = true;
        events.push({
          scope,
          direction: "bearish",
          structureType,
          text: structureType === "choch" ? "CHoCH" : "BOS",
          pivotTime: activeLow.time,
          pivotOpenTime: activeLow.openTime,
          breakTime: row.time,
          breakOpenTime: row.openTime,
          price: activeLow.price,
          index,
          pivotIndex: activeLow.index
        });
      }
    }

    const latestHigh = [...pivots].reverse().find((pivot) => pivot.side === "high" && pivot.confirmIndex < rows.length - 1) || null;
    const latestLow = [...pivots].reverse().find((pivot) => pivot.side === "low" && pivot.confirmIndex < rows.length - 1) || null;
    const levelLabels = [];
    if (latestHigh) {
      levelLabels.push({
        scope,
        side: "high",
        strength: trend < 0 ? "strong" : "weak",
        text: trend < 0 ? "Strong High" : "Weak High",
        price: latestHigh.price,
        time: latestHigh.time,
        openTime: latestHigh.openTime,
        index: latestHigh.index
      });
    }
    if (latestLow) {
      levelLabels.push({
        scope,
        side: "low",
        strength: trend > 0 ? "strong" : "weak",
        text: trend > 0 ? "Strong Low" : "Weak Low",
        price: latestLow.price,
        time: latestLow.time,
        openTime: latestLow.openTime,
        index: latestLow.index
      });
    }

    return { events, levelLabels, trend };
  }

  function eventMatchesFilter(event, bullishSetting, bearishSetting) {
    const filter = event.direction === "bullish" ? bullishSetting : bearishSetting;
    if (filter === "all") return true;
    return filter === event.structureType;
  }

  function scopeVisible(scope) {
    return scope === "swing" ? state.settings.showSwingStructure : state.settings.showInternalStructure;
  }

  function scopeWeight(scope) {
    return scope === "swing" ? 2 : 1;
  }

  function cappedEvents(events, mode, fallbackCap) {
    const cap = clamp(fallbackCap, 2, 20);
    if (mode === "present") return events.slice(-Math.min(cap, 4));
    return events.slice(-cap);
  }

  function candleTintFromBias(bias) {
    if (!state.settings.colorCandles || !bias) return null;
    const color = pickDirectionalColor("swing", bias > 0 ? "bullish" : "bearish");
    return alpha(color, 0.10);
  }

  function structureScopeSnapshot(rows, scope, length) {
    const pivots = detectPivots(rows, scope, length, length);
    const points = classifySwingPoints(pivots);
    const classificationByPivot = new Map(points.map((point) => [`${point.index}:${point.side}`, point.text]));
    const classifiedPivots = pivots.map((pivot) => ({
      ...pivot,
      classification: classificationByPivot.get(`${pivot.index}:${pivot.side}`) || null,
      confirmed: pivot.confirmIndex < rows.length - 1,
      tentative: pivot.confirmIndex >= rows.length - 1
    }));
    const breaks = detectBreaks(rows, classifiedPivots, scope);
    const latestHigh = [...classifiedPivots].reverse().find((pivot) => pivot.side === "high" && pivot.confirmed) || null;
    const latestLow = [...classifiedPivots].reverse().find((pivot) => pivot.side === "low" && pivot.confirmed) || null;
    const latestEvent = breaks.events.length ? breaks.events[breaks.events.length - 1] : null;
    return {
      scope,
      pivots: classifiedPivots,
      points,
      events: breaks.events,
      latestEvent,
      latestHigh,
      latestLow,
      trend: breaks.trend || 0,
      levelLabels: breaks.levelLabels,
      levels: breaks.levelLabels.map((level) => ({
        ...level,
        classification: classificationByPivot.get(`${level.index}:${level.side}`) || null,
        confirmed: true,
        tentative: false
      }))
    };
  }

  function calculateStructureSnapshot(inputRows, options = {}) {
    const rows = normalizeRows(inputRows);
    const swingLength = clamp(Math.round(num(options.swingLength) || state.settings.swingLength), 2, 10);
    const internalLength = clamp(Math.round(swingLength / 2), 1, Math.max(1, swingLength - 1));
    const swing = structureScopeSnapshot(rows, "swing", swingLength);
    const internal = structureScopeSnapshot(rows, "internal", internalLength);
    return {
      rows: rows.length,
      swingLength,
      internalLength,
      swing,
      internal,
      swingBias: swing.trend || 0,
      calculatedAt: Date.now()
    };
  }

  function buildDrawings(rows) {
    const settings = state.settings;
    const structure = calculateStructureSnapshot(rows, { swingLength: settings.swingLength });
    const swingPoints = structure.swing.points;
    const swingBreaks = structure.swing;
    const internalBreaks = structure.internal;
    const swingBias = structure.swingBias;

    let swingEvents = swingBreaks.events.filter((event) => eventMatchesFilter(event, settings.swingBullishStructure, settings.swingBearishStructure));
    let internalEvents = internalBreaks.events.filter((event) => eventMatchesFilter(event, settings.internalBullishStructure, settings.internalBearishStructure));

    if (settings.confluenceFilter && swingBias) {
      internalEvents = internalEvents.filter((event) => (event.direction === "bullish" ? 1 : -1) === swingBias);
    }

    swingEvents = cappedEvents(swingEvents, settings.mode, settings.maxHistoricalEvents);
    internalEvents = cappedEvents(internalEvents, settings.mode, Math.max(2, Math.ceil(settings.maxHistoricalEvents * 0.55)));

    const levels = settings.showStrongWeakHighLow
      ? swingBreaks.levelLabels.slice(-2)
      : [];

    state.candleTint = candleTintFromBias(swingBias);

    return {
      swingEvents,
      internalEvents,
      swingPoints: settings.showSwingPoints ? swingPoints.slice(settings.mode === "present" ? -4 : -8) : [],
      levels,
      swingBias
    };
  }

  function signature(rows) {
    if (!rows.length) return "empty";
    const last = rows[rows.length - 1];
    const s = state.settings;
    return [
      currentInterval(),
      rows.length,
      last.openTime,
      last.close,
      s.mode,
      s.styleMode,
      s.colorCandles ? 1 : 0,
      s.showInternalStructure ? 1 : 0,
      s.internalBullishStructure,
      s.internalBearishStructure,
      s.bullishInternalColor,
      s.bearishInternalColor,
      s.confluenceFilter ? 1 : 0,
      s.internalLabelSize,
      s.showSwingStructure ? 1 : 0,
      s.swingBullishStructure,
      s.swingBearishStructure,
      s.bullishSwingColor,
      s.bearishSwingColor,
      s.swingLabelSize,
      s.showSwingPoints ? 1 : 0,
      s.swingLength,
      s.showStrongWeakHighLow ? 1 : 0,
      s.maxHistoricalEvents,
      s.levelRenderStyle,
      s.levelBandOpacity,
      s.lineOpacitySwing,
      s.lineOpacityInternal
    ].join(":");
  }

  function ensureDrawings() {
    const rows = normalizeRows(currentHubRows());
    const nextSignature = signature(rows);
    if (nextSignature === state.lastSignature) return state.drawings;
    state.lastSignature = nextSignature;
    state.drawings = buildDrawings(rows);
    return state.drawings;
  }

  function viewState() {
    if (typeof canvas === "undefined" || !canvas || !Array.isArray(candles) || candles.length < 2) return null;
    if (typeof range !== "function") return null;
    const r = range();
    const vis = candles.slice(r.start, r.end);
    if (!vis.length) return null;
    const left = typeof LEFT_PAD === "number" ? LEFT_PAD : 12;
    const right = typeof RIGHT_AXIS === "number" ? RIGHT_AXIS : 84;
    const top = 18;
    const bottom = 30;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const usable = Math.max(120, h - top - bottom);
    const priceH = Number.isFinite(Number(lastAreaH)) && lastAreaH > 0 ? lastAreaH : Math.floor(usable * 0.78);
    const chartW = Math.max(20, w - left - right);
    const total = Math.max(2, vis.length + (r.futureBars || 0));
    const slot = chartW / total;
    const minP = Number.isFinite(Number(lastYMin)) ? Number(lastYMin) : Math.min(...vis.map((row) => num(row.low)).filter(Number.isFinite));
    const maxP = Number.isFinite(Number(lastYMax)) ? Number(lastYMax) : Math.max(...vis.map((row) => num(row.high)).filter(Number.isFinite));
    if (!(maxP > minP)) return null;
    const timeToIndex = new Map();
    vis.forEach((row, index) => {
      if (!row) return;
      const t = num(row.time);
      if (Number.isFinite(t)) timeToIndex.set(t, index);
      const openTime = Number.isFinite(num(row.openTime)) ? num(row.openTime) : (Number.isFinite(t) ? t * 1000 : NaN);
      if (Number.isFinite(openTime)) timeToIndex.set(openTime, index);
    });
    return {
      vis,
      left,
      top,
      right,
      h,
      priceH,
      chartW,
      chartRight: w - right,
      minP,
      maxP,
      slot,
      timeToIndex,
      mapX(index) { return left + index * slot + slot / 2; },
      mapY(price) { return top + ((maxP - price) / (maxP - minP)) * priceH; }
    };
  }

  function resetLayoutState() {
    state.occupiedBoxes = [];
    state.levelRows = [];
  }

  function collides(box) {
    return state.occupiedBoxes.some((other) => (
      box.x < other.x + other.w &&
      box.x + box.w > other.x &&
      box.y < other.y + other.h &&
      box.y + box.h > other.y
    ));
  }

  function reserveBox(box) {
    state.occupiedBoxes.push(box);
  }

  function measureLabel(ctx, text, font, padX, height) {
    ctx.save();
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + padX * 2;
    ctx.restore();
    return { width, height };
  }

  function drawLabel(ctx, x, y, text, stroke, fill, textColor, font, clipBox, options = {}) {
    const padX = options.padX || 4;
    const height = options.height || 15;
    const metrics = measureLabel(ctx, text, font, padX, height);
    const tries = options.tries || [{ dx: 0, dy: 0 }, { dx: 0, dy: -12 }, { dx: 0, dy: 12 }];
    let placed = null;
    for (const attempt of tries) {
      const box = {
        x: clamp(x - metrics.width / 2 + attempt.dx, clipBox.left + 2, clipBox.chartRight - metrics.width - 2),
        y: clamp(y - metrics.height / 2 + attempt.dy, clipBox.top + 2, clipBox.top + clipBox.priceH - metrics.height - 2),
        w: metrics.width,
        h: metrics.height
      };
      if (!options.allowOverlap && collides(box)) continue;
      placed = box;
      break;
    }
    if (!placed) {
      if (!options.allowSkip) return null;
      placed = {
        x: clamp(x - metrics.width / 2, clipBox.left + 2, clipBox.chartRight - metrics.width - 2),
        y: clamp(y - metrics.height / 2, clipBox.top + 2, clipBox.top + clipBox.priceH - metrics.height - 2),
        w: metrics.width,
        h: metrics.height
      };
    }
    reserveBox(placed);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fillRect(placed.x, placed.y, placed.w, placed.h);
    ctx.strokeRect(placed.x + 0.5, placed.y + 0.5, placed.w, placed.h);
    ctx.fillStyle = textColor;
    ctx.fillText(text, placed.x + placed.w / 2, placed.y + placed.h / 2 + 0.5);
    ctx.restore();
    return placed;
  }

  function pickDirectionalColor(scope, direction) {
    const s = state.settings;
    if (s.styleMode === "monochrome") {
      if (scope === "swing") return direction === "bullish" ? MONO.swingBull : MONO.swingBear;
      return direction === "bullish" ? MONO.internalBull : MONO.internalBear;
    }
    if (scope === "swing") return direction === "bullish" ? s.bullishSwingColor : s.bearishSwingColor;
    return direction === "bullish" ? s.bullishInternalColor : s.bearishInternalColor;
  }

  function levelColor() {
    return state.settings.styleMode === "monochrome" ? MONO.levels : "#6b7280";
  }

  function labelFont(scope) {
    const s = state.settings;
    const sizeKey = scope === "swing" ? s.swingLabelSize : s.internalLabelSize;
    const scale = LABEL_SCALE[sizeKey] || 1;
    const pxSize = scope === "swing" ? Math.round(10 * scale) : Math.round(9 * scale);
    return `${Math.max(8, pxSize)}px Arial`;
  }

  function visibleWindowFilter(items, view, edgeExtractor, scope) {
    const firstTime = num(view.vis[0] && view.vis[0].time);
    const lastTime = num(view.vis[view.vis.length - 1] && view.vis[view.vis.length - 1].time);
    return items.filter((item) => {
      if (scope && !scopeVisible(scope)) return false;
      const edge = num(edgeExtractor(item));
      return Number.isFinite(edge) && edge >= firstTime && edge <= lastTime;
    });
  }

  function drawCandleTint(ctx, view) {
    if (!state.candleTint || !state.settings.colorCandles) return;
    ctx.save();
    ctx.fillStyle = state.candleTint;
    for (let index = 0; index < view.vis.length; index++) {
      const row = view.vis[index];
      if (!row) continue;
      const x = view.mapX(index);
      const open = num(row.open);
      const close = num(row.close);
      if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
      const yTop = Math.min(view.mapY(open), view.mapY(close));
      const yBottom = Math.max(view.mapY(open), view.mapY(close));
      const width = Math.max(2, Math.min(10, view.slot * 0.58));
      ctx.fillRect(Math.round(x - width / 2), Math.round(yTop), Math.round(width), Math.max(1, Math.round(yBottom - yTop)));
    }
    ctx.restore();
  }

  function drawStructureEvent(ctx, view, item) {
    const startIndex = view.timeToIndex.get(item.pivotOpenTime) ?? view.timeToIndex.get(item.pivotTime);
    const endIndex = view.timeToIndex.get(item.breakOpenTime) ?? view.timeToIndex.get(item.breakTime);
    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return;
    const startX = view.mapX(startIndex);
    const endX = view.mapX(endIndex);
    const y = view.mapY(item.price);
    const color = pickDirectionalColor(item.scope, item.direction);
    const opacity = item.scope === "swing" ? state.settings.lineOpacitySwing : state.settings.lineOpacityInternal;
    const stroke = alpha(color, opacity);
    const font = labelFont(item.scope);
    const lineLeft = Math.min(startX, endX);
    const lineRight = Math.max(startX, endX);

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = item.scope === "swing" ? 1.4 : 1;
    ctx.setLineDash(item.scope === "internal" ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(typeof px === "function" ? px(lineLeft) : lineLeft, typeof px === "function" ? px(y) : y);
    ctx.lineTo(typeof px === "function" ? px(lineRight) : lineRight, typeof px === "function" ? px(y) : y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const labelX = item.scope === "swing" ? (lineLeft + lineRight) / 2 : lineRight - Math.min(18, Math.abs(lineRight - lineLeft) * 0.2);
    const labelY = y + (item.direction === "bullish" ? -10 : 10);
    const labelText = item.scope === "internal" ? `i${item.text}` : item.text;
    drawLabel(
      ctx,
      labelX,
      labelY,
      labelText,
      stroke,
      "rgba(255,255,255,.93)",
      color,
      font,
      view,
      { allowSkip: true, tries: item.direction === "bullish" ? [{ dx: 0, dy: -8 }, { dx: 0, dy: 7 }] : [{ dx: 0, dy: 8 }, { dx: 0, dy: -7 }] }
    );
  }

  function nextLevelRow(y, top, bottom) {
    const minGap = 16;
    let candidate = clamp(y, top + 3, bottom - minGap - 3);
    for (const rowY of state.levelRows) {
      if (Math.abs(candidate - rowY) < minGap) candidate = rowY + minGap;
    }
    candidate = clamp(candidate, top + 3, bottom - minGap - 3);
    state.levelRows.push(candidate);
    state.levelRows.sort((a, b) => a - b);
    return candidate;
  }

  function drawLevel(ctx, view, item) {
    const index = view.timeToIndex.get(item.openTime) ?? view.timeToIndex.get(item.time);
    if (!Number.isFinite(index)) return;
    const anchorX = view.mapX(index);
    const lineY = view.mapY(item.price);
    const baseColor = levelColor();
    const stroke = alpha(baseColor, Math.max(0.5, state.settings.lineOpacitySwing));
    const fill = alpha(baseColor, state.settings.levelBandOpacity);
    const font = labelFont("swing");

    if (state.settings.levelRenderStyle === "band") {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.fillRect(Math.round(anchorX), Math.round(lineY - 5), Math.max(1, Math.round(view.chartRight - anchorX)), 10);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(typeof px === "function" ? px(anchorX) : anchorX, typeof px === "function" ? px(lineY) : lineY);
    ctx.lineTo(typeof px === "function" ? px(view.chartRight) : view.chartRight, typeof px === "function" ? px(lineY) : lineY);
    ctx.stroke();
    ctx.restore();

    const labelY = nextLevelRow(lineY - 7, view.top, view.top + view.priceH);
    drawLabel(
      ctx,
      view.chartRight - 46,
      labelY + 7,
      item.text,
      stroke,
      "rgba(255,255,255,.94)",
      baseColor,
      font,
      view,
      { allowSkip: true, tries: [{ dx: 0, dy: 0 }] }
    );
  }

  function drawSwingPoint(ctx, view, item) {
    const index = view.timeToIndex.get(item.openTime) ?? view.timeToIndex.get(item.time);
    if (!Number.isFinite(index)) return;
    const x = view.mapX(index);
    const y = view.mapY(item.price) + (item.side === "high" ? -10 : 10);
    const color = alpha(levelColor(), 0.75);
    drawLabel(
      ctx,
      x,
      y,
      item.text,
      color,
      "rgba(255,255,255,.85)",
      levelColor(),
      labelFont("internal"),
      view,
      { allowSkip: true, tries: [{ dx: 0, dy: 0 }, { dx: 0, dy: item.side === "high" ? -10 : 10 }] }
    );
  }

  function drawSmc() {
    if (!state.enabled) return;
    if (typeof ctx === "undefined" || !ctx) return;
    const view = viewState();
    if (!view) return;
    const drawings = ensureDrawings();
    resetLayoutState();

    ctx.save();
    ctx.beginPath();
    ctx.rect(view.left, view.top, view.chartW, view.priceH);
    ctx.clip();

    drawCandleTint(ctx, view);

    const swingEvents = visibleWindowFilter(drawings.swingEvents, view, (item) => item.breakTime, "swing");
    const internalEvents = visibleWindowFilter(drawings.internalEvents, view, (item) => item.breakTime, "internal");
    const levels = visibleWindowFilter(drawings.levels, view, (item) => item.time, "swing");
    const swingPoints = visibleWindowFilter(drawings.swingPoints, view, (item) => item.time, "swing");

    if (scopeVisible("internal")) internalEvents.forEach((item) => drawStructureEvent(ctx, view, item));
    if (scopeVisible("swing")) swingEvents.forEach((item) => drawStructureEvent(ctx, view, item));
    levels.forEach((item) => drawLevel(ctx, view, item));
    swingPoints.forEach((item) => drawSwingPoint(ctx, view, item));

    ctx.restore();
  }

  function safeDraw() {
    try {
      if (typeof draw === "function") draw();
    } catch (error) {
      console.warn(MODULE + " redraw failed", error);
    }
  }

  function setEnabled(nextEnabled) {
    state.enabled = !!nextEnabled;
    try {
      localStorage.setItem(TOGGLE_KEY, state.enabled ? "1" : "0");
    } catch (_e) {}
    const toggle = document.getElementById("tglSMC");
    if (toggle) toggle.checked = state.enabled;
    if (!state.enabled) invalidate();
    safeDraw();
  }

  function restoreEnabled() {
    try {
      return localStorage.getItem(TOGGLE_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function radioGroup(name, current, options) {
    return options.map((option) => (
      `<label class="smc-radio"><input type="radio" name="${name}" value="${option.value}" ${current === option.value ? "checked" : ""}> <span>${option.label}</span></label>`
    )).join("");
  }

  function settingsCardHtml() {
    const s = state.settings;
    return `
      <div class="settings-card smc-settings-card">
        <div class="settings-card-title">Smart Money Concepts</div>
        <div class="settings-card-desc">Phase 0-2 only. LuxAlgo-style settings parity for structure display and visual comparison.</div>

        <div class="smc-group">
          <div class="smc-group-title">Smart Money Concepts</div>
          <div class="smc-group-grid">
            <div class="smc-field"><span>Mode</span><div class="smc-inline">${radioGroup("smcMode", s.mode, [{ value: "historical", label: "Historical" }, { value: "present", label: "Present" }])}</div></div>
            <div class="smc-field"><span>Style</span><div class="smc-inline">${radioGroup("smcStyleMode", s.styleMode, [{ value: "colored", label: "Colored" }, { value: "monochrome", label: "Monochrome" }])}</div></div>
            <label class="smc-field smc-disabled"><span>Color Candles</span><span class="smc-note-inline"><input id="smcColorCandles" type="checkbox" ${s.colorCandles ? "checked" : ""} disabled> Later-phase</span></label>
          </div>
        </div>

        <div class="smc-group">
          <div class="smc-group-title">Real Time Internal Structure</div>
          <div class="smc-group-grid">
            <label class="smc-field"><span>Show Internal Structure</span><input id="smcShowInternalStructure" type="checkbox" ${s.showInternalStructure ? "checked" : ""}></label>
            <div class="smc-field"><span>Bullish Structure</span><select id="smcInternalBullishStructure"><option value="all"${s.internalBullishStructure === "all" ? " selected" : ""}>All</option><option value="bos"${s.internalBullishStructure === "bos" ? " selected" : ""}>BOS</option><option value="choch"${s.internalBullishStructure === "choch" ? " selected" : ""}>CHoCH</option></select></div>
            <div class="smc-field"><span>Bearish Structure</span><select id="smcInternalBearishStructure"><option value="all"${s.internalBearishStructure === "all" ? " selected" : ""}>All</option><option value="bos"${s.internalBearishStructure === "bos" ? " selected" : ""}>BOS</option><option value="choch"${s.internalBearishStructure === "choch" ? " selected" : ""}>CHoCH</option></select></div>
            <label class="smc-field"><span>Bullish internal color</span><input id="smcBullishInternalColor" type="color" value="${escapeHtml(s.bullishInternalColor)}"></label>
            <label class="smc-field"><span>Bearish internal color</span><input id="smcBearishInternalColor" type="color" value="${escapeHtml(s.bearishInternalColor)}"></label>
            <label class="smc-field"><span>Confluence Filter</span><input id="smcConfluenceFilter" type="checkbox" ${s.confluenceFilter ? "checked" : ""}></label>
            <div class="smc-field"><span>Internal Label Size</span><select id="smcInternalLabelSize"><option value="tiny"${s.internalLabelSize === "tiny" ? " selected" : ""}>Tiny</option><option value="small"${s.internalLabelSize === "small" ? " selected" : ""}>Small</option><option value="normal"${s.internalLabelSize === "normal" ? " selected" : ""}>Normal</option></select></div>
          </div>
        </div>

        <div class="smc-group">
          <div class="smc-group-title">Real Time Swing Structure</div>
          <div class="smc-group-grid">
            <label class="smc-field"><span>Show Swing Structure</span><input id="smcShowSwingStructure" type="checkbox" ${s.showSwingStructure ? "checked" : ""}></label>
            <div class="smc-field"><span>Bullish Structure</span><select id="smcSwingBullishStructure"><option value="all"${s.swingBullishStructure === "all" ? " selected" : ""}>All</option><option value="bos"${s.swingBullishStructure === "bos" ? " selected" : ""}>BOS</option><option value="choch"${s.swingBullishStructure === "choch" ? " selected" : ""}>CHoCH</option></select></div>
            <div class="smc-field"><span>Bearish Structure</span><select id="smcSwingBearishStructure"><option value="all"${s.swingBearishStructure === "all" ? " selected" : ""}>All</option><option value="bos"${s.swingBearishStructure === "bos" ? " selected" : ""}>BOS</option><option value="choch"${s.swingBearishStructure === "choch" ? " selected" : ""}>CHoCH</option></select></div>
            <label class="smc-field"><span>Bullish swing color</span><input id="smcBullishSwingColor" type="color" value="${escapeHtml(s.bullishSwingColor)}"></label>
            <label class="smc-field"><span>Bearish swing color</span><input id="smcBearishSwingColor" type="color" value="${escapeHtml(s.bearishSwingColor)}"></label>
            <div class="smc-field"><span>Swing Label Size</span><select id="smcSwingLabelSize"><option value="tiny"${s.swingLabelSize === "tiny" ? " selected" : ""}>Tiny</option><option value="small"${s.swingLabelSize === "small" ? " selected" : ""}>Small</option><option value="normal"${s.swingLabelSize === "normal" ? " selected" : ""}>Normal</option></select></div>
            <label class="smc-field"><span>Show Swing Points</span><input id="smcShowSwingPoints" type="checkbox" ${s.showSwingPoints ? "checked" : ""}></label>
            <label class="smc-field"><span>Swing Length</span><input id="smcSwingLength" type="range" min="2" max="10" step="1" value="${s.swingLength}"><span id="smcSwingLengthVal">${s.swingLength}</span></label>
            <label class="smc-field"><span>Show Strong / Weak High-Low</span><input id="smcShowStrongWeakHighLow" type="checkbox" ${s.showStrongWeakHighLow ? "checked" : ""}></label>
          </div>
        </div>

        <div class="smc-group">
          <div class="smc-group-title">Display Style</div>
          <div class="smc-group-grid">
            <label class="smc-field"><span>Max Historical Events</span><input id="smcMaxHistoricalEvents" type="range" min="2" max="20" step="1" value="${s.maxHistoricalEvents}"><span id="smcMaxHistoricalEventsVal">${s.maxHistoricalEvents}</span></label>
            <div class="smc-field"><span>Level Style</span><select id="smcLevelRenderStyle"><option value="line"${s.levelRenderStyle === "line" ? " selected" : ""}>Line</option><option value="band"${s.levelRenderStyle === "band" ? " selected" : ""}>Band / Zone</option></select></div>
            <label class="smc-field"><span>Band Opacity</span><input id="smcLevelBandOpacity" type="range" min="0.04" max="0.35" step="0.01" value="${s.levelBandOpacity}"><span id="smcLevelBandOpacityVal">${s.levelBandOpacity.toFixed(2)}</span></label>
            <label class="smc-field"><span>Swing Line Opacity</span><input id="smcLineOpacitySwing" type="range" min="0.20" max="1.00" step="0.05" value="${s.lineOpacitySwing}"><span id="smcLineOpacitySwingVal">${s.lineOpacitySwing.toFixed(2)}</span></label>
            <label class="smc-field"><span>Internal Line Opacity</span><input id="smcLineOpacityInternal" type="range" min="0.12" max="0.80" step="0.04" value="${s.lineOpacityInternal}"><span id="smcLineOpacityInternalVal">${s.lineOpacityInternal.toFixed(2)}</span></label>
          </div>
        </div>

        <details class="smc-group smc-group-muted">
          <summary>Later-phase parity groups</summary>
          <div class="smc-later-note">Order Blocks, EQH / EQL, Fair Value Gaps, Daily / Weekly / Monthly Levels, and Premium / Discount Zones stay inactive until their phase is implemented.</div>
        </details>
      </div>`;
  }

  function syncSettingsControls() {
    const s = state.settings;
    const checked = (id, value) => { const el = document.getElementById(id); if (el) el.checked = !!value; };
    const value = (id, next) => { const el = document.getElementById(id); if (el) el.value = String(next); };
    const text = (id, next) => { const el = document.getElementById(id); if (el) el.textContent = String(next); };

    const mode = document.querySelector(`input[name="smcMode"][value="${s.mode}"]`);
    if (mode) mode.checked = true;
    const styleMode = document.querySelector(`input[name="smcStyleMode"][value="${s.styleMode}"]`);
    if (styleMode) styleMode.checked = true;

    checked("smcColorCandles", s.colorCandles);
    checked("smcShowInternalStructure", s.showInternalStructure);
    value("smcInternalBullishStructure", s.internalBullishStructure);
    value("smcInternalBearishStructure", s.internalBearishStructure);
    value("smcBullishInternalColor", s.bullishInternalColor);
    value("smcBearishInternalColor", s.bearishInternalColor);
    checked("smcConfluenceFilter", s.confluenceFilter);
    value("smcInternalLabelSize", s.internalLabelSize);
    checked("smcShowSwingStructure", s.showSwingStructure);
    value("smcSwingBullishStructure", s.swingBullishStructure);
    value("smcSwingBearishStructure", s.swingBearishStructure);
    value("smcBullishSwingColor", s.bullishSwingColor);
    value("smcBearishSwingColor", s.bearishSwingColor);
    value("smcSwingLabelSize", s.swingLabelSize);
    checked("smcShowSwingPoints", s.showSwingPoints);
    value("smcSwingLength", s.swingLength);
    text("smcSwingLengthVal", s.swingLength);
    checked("smcShowStrongWeakHighLow", s.showStrongWeakHighLow);
    value("smcMaxHistoricalEvents", s.maxHistoricalEvents);
    text("smcMaxHistoricalEventsVal", s.maxHistoricalEvents);
    value("smcLevelRenderStyle", s.levelRenderStyle);
    value("smcLevelBandOpacity", s.levelBandOpacity);
    text("smcLevelBandOpacityVal", s.levelBandOpacity.toFixed(2));
    value("smcLineOpacitySwing", s.lineOpacitySwing);
    text("smcLineOpacitySwingVal", s.lineOpacitySwing.toFixed(2));
    value("smcLineOpacityInternal", s.lineOpacityInternal);
    text("smcLineOpacityInternalVal", s.lineOpacityInternal.toFixed(2));
  }

  function bindControl(id, eventName, handler) {
    const el = document.getElementById(id);
    if (!el || el.dataset.smcBound === "1") return;
    el.dataset.smcBound = "1";
    el.addEventListener(eventName, handler, false);
    if (eventName !== "change") el.addEventListener("change", handler, false);
  }

  function bindRadioGroup(name, handler) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      if (el.dataset.smcBound === "1") return;
      el.dataset.smcBound = "1";
      el.addEventListener("change", handler, false);
    });
  }

  function installSettingsBindings() {
    bindRadioGroup("smcMode", (e) => updateSettings({ mode: e.target.value }));
    bindRadioGroup("smcStyleMode", (e) => updateSettings({ styleMode: e.target.value }));
    bindControl("smcShowInternalStructure", "change", (e) => updateSettings({ showInternalStructure: !!e.target.checked }));
    bindControl("smcInternalBullishStructure", "change", (e) => updateSettings({ internalBullishStructure: e.target.value }));
    bindControl("smcInternalBearishStructure", "change", (e) => updateSettings({ internalBearishStructure: e.target.value }));
    bindControl("smcBullishInternalColor", "input", (e) => updateSettings({ bullishInternalColor: e.target.value }));
    bindControl("smcBearishInternalColor", "input", (e) => updateSettings({ bearishInternalColor: e.target.value }));
    bindControl("smcConfluenceFilter", "change", (e) => updateSettings({ confluenceFilter: !!e.target.checked }));
    bindControl("smcInternalLabelSize", "change", (e) => updateSettings({ internalLabelSize: e.target.value }));
    bindControl("smcShowSwingStructure", "change", (e) => updateSettings({ showSwingStructure: !!e.target.checked }));
    bindControl("smcSwingBullishStructure", "change", (e) => updateSettings({ swingBullishStructure: e.target.value }));
    bindControl("smcSwingBearishStructure", "change", (e) => updateSettings({ swingBearishStructure: e.target.value }));
    bindControl("smcBullishSwingColor", "input", (e) => updateSettings({ bullishSwingColor: e.target.value }));
    bindControl("smcBearishSwingColor", "input", (e) => updateSettings({ bearishSwingColor: e.target.value }));
    bindControl("smcSwingLabelSize", "change", (e) => updateSettings({ swingLabelSize: e.target.value }));
    bindControl("smcShowSwingPoints", "change", (e) => updateSettings({ showSwingPoints: !!e.target.checked }));
    bindControl("smcSwingLength", "input", (e) => updateSettings({ swingLength: e.target.value }));
    bindControl("smcShowStrongWeakHighLow", "change", (e) => updateSettings({ showStrongWeakHighLow: !!e.target.checked }));
    bindControl("smcMaxHistoricalEvents", "input", (e) => updateSettings({ maxHistoricalEvents: e.target.value }));
    bindControl("smcLevelRenderStyle", "change", (e) => updateSettings({ levelRenderStyle: e.target.value }));
    bindControl("smcLevelBandOpacity", "input", (e) => updateSettings({ levelBandOpacity: e.target.value }));
    bindControl("smcLineOpacitySwing", "input", (e) => updateSettings({ lineOpacitySwing: e.target.value }));
    bindControl("smcLineOpacityInternal", "input", (e) => updateSettings({ lineOpacityInternal: e.target.value }));
  }

  function activateSettingsTab() {
    const root = document.querySelector("#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid");
    if (!root) return;
    root.querySelectorAll(".v24-settings-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === "smc"));
    root.querySelectorAll(".v24-settings-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.tab === "smc"));
    try {
      localStorage.setItem(TAB_KEY, "smc");
    } catch (_e) {}
  }

  function installSettingsPanel() {
    const grid = document.querySelector("#settingsModal .settings-grid");
    if (!grid) return;
    const tabs = grid.querySelector(":scope > .v24-settings-tabs");
    const panelsRoot = grid.querySelector(":scope > .v24-settings-panels");
    if (!tabs || !panelsRoot) return;

    let tab = document.getElementById("smcSettingsTab");
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button";
      tab.id = "smcSettingsTab";
      tab.className = "v24-settings-tab";
      tab.dataset.tab = "smc";
      tab.textContent = "SMC";
      tabs.appendChild(tab);
    }
    if (!tab.dataset.smcBound) {
      tab.dataset.smcBound = "1";
      tab.addEventListener("click", activateSettingsTab, false);
    }

    let panel = document.getElementById("smcSettingsPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "smcSettingsPanel";
      panel.className = "v24-settings-panel";
      panel.dataset.tab = "smc";
      const inner = document.createElement("div");
      inner.className = "v24-settings-panel-grid";
      inner.id = "smcSettingsPanelGrid";
      panel.appendChild(inner);
      panelsRoot.appendChild(panel);
    }
    const inner = panel.querySelector(".v24-settings-panel-grid");
    if (inner) inner.innerHTML = settingsCardHtml();
    installSettingsBindings();
    syncSettingsControls();
  }

  function installSettingsStyles() {
    if (document.getElementById("smcSettingsStyles")) return;
    const style = document.createElement("style");
    style.id = "smcSettingsStyles";
    style.textContent = `
      .smc-settings-card{display:flex;flex-direction:column;gap:12px}
      .smc-group{display:flex;flex-direction:column;gap:10px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#fff}
      .smc-group-title{font-weight:700;color:#111827;font-size:13px}
      .smc-group-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 14px}
      .smc-field{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:#1f2937}
      .smc-field select,.smc-field input[type="range"]{flex:1;min-width:96px}
      .smc-field input[type="color"]{width:42px;height:28px;padding:0;border:0;background:transparent}
      .smc-inline{display:flex;flex-wrap:wrap;gap:8px}
      .smc-radio{display:inline-flex;align-items:center;gap:6px}
      .smc-group-muted{background:#fafaf9}
      .smc-later-note{font-size:12px;color:#6b7280;line-height:1.5}
      .smc-disabled{opacity:.65}
      .smc-note-inline{display:inline-flex;align-items:center;gap:6px;color:#6b7280}
    `;
    document.head.appendChild(style);
  }

  function installToggle() {
    const toggle = document.getElementById("tglSMC");
    if (!toggle || toggle.__smcBound) return;
    toggle.__smcBound = true;
    state.enabled = restoreEnabled();
    toggle.checked = state.enabled;
    toggle.addEventListener("change", () => setEnabled(toggle.checked), false);
  }

  function installDrawHook() {
    if (typeof draw !== "function" || window.__smcSettingsStyle01Wrapped) return;
    window.__smcSettingsStyle01Wrapped = true;
    const previous = draw;
    draw = window.draw = function () {
      const result = previous.apply(this, arguments);
      try {
        drawSmc();
      } catch (error) {
        console.warn(MODULE + " draw failed", error);
      }
      return result;
    };
  }

  function installOpenSettingsHook() {
    if (typeof openSettings !== "function" || window.__smcOpenSettingsWrappedV2) return;
    window.__smcOpenSettingsWrappedV2 = true;
    const previous = openSettings;
    openSettings = window.openSettings = function () {
      const result = previous.apply(this, arguments);
      setTimeout(() => {
        installSettingsStyles();
        installSettingsPanel();
      }, 0);
      setTimeout(installSettingsPanel, 160);
      return result;
    };
  }

  function install() {
    installToggle();
    installDrawHook();
    installOpenSettingsHook();
    installSettingsStyles();
    installSettingsPanel();
    if (state.enabled) safeDraw();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
  setTimeout(install, 120);
  setTimeout(install, 500);

  window.SMC_FEATURE = {
    version: MODULE,
    enabled() { return !!state.enabled; },
    getSettings() { return { ...state.settings }; },
    setEnabled,
    updateSettings,
    activateSettingsTab,
    getStructureSnapshot(rows, options) {
      return calculateStructureSnapshot(rows, options);
    },
    redraw() {
      invalidate();
      safeDraw();
    }
  };
})();
