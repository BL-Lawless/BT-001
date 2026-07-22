"use strict";
// Historical EMA9/EMA55/EMA200 cascade analysis for BTCUSDC around a specific trade entry.
// Fetches candles via services/rest.service.js's own request/response handling (same minimal
// window shim pattern as scripts/fetch-real-btcusdt-snapshot.js) against Binance's public
// GET /api/v3/klines endpoint, then computes EMAs using the exact same algorithm as the live
// chart's window.EMA(src,p) in main.js (copied verbatim below so the numbers match what was on
// screen this morning), and scans EMA9 vs EMA55 for sign-flip crossovers on each timeframe.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const OUT_FILE = path.join(root, "scripts", "ema-cascade-analysis.json");
const SYMBOL = "BTCUSDC";
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h"];
const LIMIT = 1000;
const END_TIME_MS = Date.parse("2026-07-22T07:00:00Z");
const EMA_SOURCE = "main.js EMA(src,p) [line 2347] — copied verbatim, seed = SMA of first p closes, then multiplier 2/(p+1)";

function restServiceContext() {
  const context = { console, fetch, Headers, URL, URLSearchParams };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(root, "services", "rest.service.js"), "utf8"),
    context,
    { filename: "services/rest.service.js" }
  );
  return context;
}

function klineUrl(symbol, interval, limit, endTime) {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("endTime", String(endTime));
  return url.toString();
}

// Same field mapping Signal B's own data-feed.js REST parser uses: taker buy base
// asset volume is index 9 of the raw kline array, no separate request required.
function normalizeRow(raw, nowMs) {
  if (!Array.isArray(raw) || raw.length < 11) return null;
  const closeTime = Number(raw[6]);
  const row = {
    time: Math.floor(Number(raw[0]) / 1000),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    takerBuyBase: Number(raw[9]),
    final: Number.isFinite(closeTime) && closeTime < nowMs
  };
  return Number.isFinite(row.time) && Number.isFinite(row.open) ? row : null;
}

// Copied verbatim from main.js's EMA(src,p) so results match the live chart's overlays exactly.
function EMA(src, p) {
  const out = [];
  let cur = null;
  const a = 2 / (p + 1);

  for (let i = 0; i < src.length; i++) {
    if (i < p - 1) continue;

    if (cur === null) {
      let s = 0;
      for (let j = i - p + 1; j <= i; j++) s += src[j].close;
      cur = s / p;
    } else {
      cur = src[i].close * a + cur * (1 - a);
    }

    out.push({ time: src[i].time, value: cur });
  }

  return out;
}

function attachEmas(rows) {
  const series = { ema9: EMA(rows, 9), ema55: EMA(rows, 55), ema200: EMA(rows, 200) };
  const byTime = key => new Map(series[key].map(point => [point.time, point.value]));
  const maps = { ema9: byTime("ema9"), ema55: byTime("ema55"), ema200: byTime("ema200") };
  return rows.map(row => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    ema9: maps.ema9.has(row.time) ? maps.ema9.get(row.time) : null,
    ema55: maps.ema55.has(row.time) ? maps.ema55.get(row.time) : null,
    ema200: maps.ema200.has(row.time) ? maps.ema200.get(row.time) : null
  }));
}

function detectCrossovers(candles) {
  const crossovers = [];
  let priorSign = null;
  for (const candle of candles) {
    if (candle.ema9 == null || candle.ema55 == null) continue;
    const diff = candle.ema9 - candle.ema55;
    if (diff === 0) continue;
    const sign = diff > 0 ? 1 : -1;
    if (priorSign !== null && sign !== priorSign) {
      crossovers.push({
        time: candle.time,
        direction: sign > 0 ? "bear-to-bull" : "bull-to-bear",
        ema9: candle.ema9,
        ema55: candle.ema55
      });
    }
    priorSign = sign;
  }
  return crossovers;
}

async function main() {
  const { restService } = restServiceContext();
  const timeframesOut = {};
  const summary = [];

  for (const tf of TIMEFRAMES) {
    const url = klineUrl(SYMBOL, tf, LIMIT, END_TIME_MS);
    const raw = await restService.get(url);
    const nowMs = Date.now();
    const rows = raw
      .map(entry => normalizeRow(entry, nowMs))
      .filter(row => row && row.final);

    const candles = attachEmas(rows);
    const crossovers = detectCrossovers(candles);
    timeframesOut[tf] = { candles, crossovers };

    summary.push({
      tf,
      count: candles.length,
      earliest: candles[0] ? new Date(candles[0].time * 1000).toISOString() : null,
      latest: candles.at(-1) ? new Date(candles.at(-1).time * 1000).toISOString() : null,
      crossoverCount: crossovers.length
    });
    console.log(`${tf}: fetched ${candles.length} closed candles, ${crossovers.length} crossovers`);
  }

  const output = {
    symbol: SYMBOL,
    generatedAt: new Date().toISOString(),
    emaSource: EMA_SOURCE,
    timeframes: timeframesOut
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
  console.log("\nTime range / crossover count per timeframe:");
  summary.forEach(({ tf, count, earliest, latest, crossoverCount }) => {
    console.log(`  ${tf.padEnd(3)}  count=${count}  earliest=${earliest}  latest=${latest}  crossovers=${crossoverCount}`);
  });

  console.log("\nCrossovers per timeframe:");
  for (const tf of TIMEFRAMES) {
    const list = timeframesOut[tf].crossovers;
    console.log(`  ${tf}:`);
    if (!list.length) {
      console.log("    (none)");
      continue;
    }
    list.forEach(c => {
      console.log(`    ${new Date(c.time * 1000).toISOString()}  ${c.direction}  ema9=${c.ema9.toFixed(2)} ema55=${c.ema55.toFixed(2)}`);
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
