"use strict";

// One-off fetch of real BTCUSDC candles (including taker-buy base volume) for
// the scalp-analysis window, using services/rest.service.js against Binance's
// public GET /api/v3/klines endpoint.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const OUT_FILE = path.join(root, "scripts", "scalp-analysis-window.json");
const BASE_URL = "https://api.binance.com/api/v3/klines";
const SYMBOL = "BTCUSDC";
const WINDOW_START = "2026-07-22T09:30:00Z";
const WINDOW_END = "2026-07-23T02:00:00Z";
const START_TIME = Date.parse(WINDOW_START);
const END_TIME = Date.parse(WINDOW_END);
const TIMEFRAMES = ["1m", "3m", "5m", "15m"];
const LIMIT = 1000;

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

function klineUrl(interval) {
  const url = new URL(BASE_URL);
  url.searchParams.set("symbol", SYMBOL);
  url.searchParams.set("interval", interval);
  url.searchParams.set("startTime", String(START_TIME));
  url.searchParams.set("endTime", String(END_TIME));
  url.searchParams.set("limit", String(LIMIT));
  return url.toString();
}

// Match the existing historical snapshot convention: candle time is Unix
// seconds, numeric OHLCV fields are numbers, and raw kline index 9 supplies
// taker-buy base-asset volume.
function normalizeRow(raw) {
  if (!Array.isArray(raw) || raw.length < 10) return null;
  const row = {
    time: Math.floor(Number(raw[0]) / 1000),
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    takerBuyBase: Number(raw[9])
  };
  return Object.values(row).every(Number.isFinite) ? row : null;
}

function isoTime(row) {
  return row ? new Date(row.time * 1000).toISOString() : null;
}

async function main() {
  const { restService } = restServiceContext();
  const timeframes = {};
  const summary = [];

  for (const timeframe of TIMEFRAMES) {
    const raw = await restService.get(klineUrl(timeframe));
    if (!Array.isArray(raw)) {
      throw new TypeError(`Binance returned a non-array response for ${timeframe}`);
    }

    const rows = raw.map(normalizeRow).filter(Boolean);
    if (rows.some(row => row.time * 1000 < START_TIME || row.time * 1000 > END_TIME)) {
      throw new RangeError(`Binance returned an out-of-window candle for ${timeframe}`);
    }

    timeframes[timeframe] = rows;
    summary.push({
      timeframe,
      count: rows.length,
      first: isoTime(rows[0]),
      last: isoTime(rows.at(-1))
    });
  }

  const output = {
    symbol: SYMBOL,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    timeframes
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUT_FILE}`);
  for (const item of summary) {
    console.log(
      `${item.timeframe.padEnd(3)} count=${String(item.count).padStart(3)}`
      + ` first=${item.first} last=${item.last}`
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
