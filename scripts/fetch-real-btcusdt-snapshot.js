"use strict";
// One-off fetch of real BTCUSDT candles (with taker-buy volume) for every timeframe
// Signal B's "quick" profile reads, using services/rest.service.js's own request/response
// handling (loaded here in a minimal window shim) against Binance's public
// GET /api/v3/klines endpoint.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const OUT_FILE = path.join(root, "scripts", "real-btcusdt-snapshot.json");
const SYMBOL = "BTCUSDT";
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"];
const LIMIT = 500;

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

function klineUrl(symbol, interval, limit) {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
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

async function main() {
  const { restService } = restServiceContext();
  const snapshot = {};
  const summary = [];

  for (const tf of TIMEFRAMES) {
    const url = klineUrl(SYMBOL, tf, LIMIT);
    const raw = await restService.get(url);
    const nowMs = Date.now();
    const rows = raw
      .map(entry => normalizeRow(entry, nowMs))
      .filter(row => row && row.final);

    snapshot[tf] = rows;
    summary.push({
      tf,
      count: rows.length,
      earliest: rows[0] ? new Date(rows[0].time * 1000).toISOString() : null,
      latest: rows.at(-1) ? new Date(rows.at(-1).time * 1000).toISOString() : null
    });
    console.log(`${tf}: fetched ${rows.length} closed candles`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${OUT_FILE}`);
  console.log("\nTime range per timeframe:");
  summary.forEach(({ tf, count, earliest, latest }) => {
    console.log(`  ${tf.padEnd(3)}  count=${count}  earliest=${earliest}  latest=${latest}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
