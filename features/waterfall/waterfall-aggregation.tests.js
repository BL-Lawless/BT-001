"use strict";

const assert = require("assert");
const aggregation = require("./waterfall-aggregation.js");

assert.deepStrictEqual(aggregation.PERIOD_OPTIONS.map(option => option.label),["1D","1W","1M","2M","3M","6M","1Y"]);
assert.deepStrictEqual(aggregation.optionsForPeriod("1d"),["1h","4h","6h"]);
assert.deepStrictEqual(aggregation.optionsForPeriod("1w"),["4h","6h","1d"]);
for(const period of ["1m","2m","3m","6m","1y"]){
  assert.deepStrictEqual(aggregation.optionsForPeriod(period),["4h","6h","1d","1w"]);
}
assert.strictEqual(aggregation.validTfForPeriod("1d","1w"),"1h","invalid TF must fall back to the finest option");
assert.strictEqual(aggregation.validTfForPeriod("1w","6h"),"6h","a still-valid TF must be retained");

const hour = aggregation.TF_MS["1h"];
const base = Date.UTC(2026,7,20,0,0,0,0);
const trades = Array.from({length:15},(_,index) => ({
  id:"trade_" + index,
  finalExitTime:base + index * hour,
  net:index < 5 ? index + 1 : (index % 2 ? -2 : 3),
  realized:index + 0.5,
  fees:-0.5,
  fundingDelta:0,
  dir:index % 2 ? "S" : "L"
}));
const result = aggregation.aggregateTrades(trades,"4h",10);

assert.deepStrictEqual(result.recentFirst.map(trade => trade.id),trades.slice().reverse().map(trade => trade.id),"all trades must sort newest first before the split");
assert.deepStrictEqual(result.rawRecent.map(trade => trade.id),trades.slice(5).reverse().map(trade => trade.id),"the newest ten must remain raw");
assert.strictEqual(result.aggregatedTradeCount,5);
assert.strictEqual(result.aggregated.length,2,"the five older trades span two 4H buckets");
assert.deepStrictEqual(result.aggregated.map(bucket => bucket.net),[10,5],"bucket bars must use exact net P/L sums");
assert(result.aggregated.every(bucket => bucket.dir === "" && bucket.markerId == null),"aggregated buckets must not expose trade direction markers");

const rawIds = new Set(result.rawRecent.map(trade => trade.id));
const bucketIds = result.aggregated.flatMap(bucket => bucket.sourceTrades.map(trade => trade.id));
assert(bucketIds.every(id => !rawIds.has(id)),"raw and aggregated trades must be disjoint");
assert.strictEqual(new Set(bucketIds.concat([...rawIds])).size,trades.length,"every source trade must appear exactly once");
assert(Math.abs(result.sourceNet-result.displayNet)<1e-9,"aggregation must preserve total net P/L");
assert.deepStrictEqual(result.display.slice(-10).map(trade => trade.id),trades.slice(5).map(trade => trade.id),"raw trades must render chronologically at the right-hand tail");
assert.strictEqual(aggregation.nextFinerTf("1w"),"1d");
assert.strictEqual(aggregation.nextFinerTf("1d"),"6h");
assert.strictEqual(aggregation.nextFinerTf("6h"),"4h");
assert.strictEqual(aggregation.nextFinerTf("4h"),"1h");

const sourceSummary = aggregation.summarizeEntries(trades);
assert.deepStrictEqual({
  wins:sourceSummary.wins,
  losses:sourceSummary.losses,
  totalWin:sourceSummary.totalWin,
  totalLoss:sourceSummary.totalLoss,
  net:sourceSummary.net
},{
  wins:10,
  losses:5,
  totalWin:30,
  totalLoss:-10,
  net:20
},"WF source summary metrics must describe the real individual closed trades");
for(const tf of ["4h","6h","1d","1w"]){
  const grouped = aggregation.aggregateTrades(trades,tf,10);
  assert.deepStrictEqual(aggregation.summarizeEntries(grouped.recentFirst),aggregation.summarizeEntries(trades),"source statistics must remain invariant at " + tf);
}
assert.deepStrictEqual(aggregation.highWaterMark(trades),{index:14,value:20,net:20},"source HWM must retain every individual trade's cumulative path");

const monday = Date.UTC(2026,7,17,0,0,0,0);
assert.strictEqual(aggregation.bucketStartMs(Date.UTC(2026,7,23,23,0,0,0),"1w"),monday,"weekly buckets must align to Monday 00:00 UTC");

for(const tf of ["4h","1d","1w"]){
  const now = Date.UTC(2026,7,20,13,37,0,0);
  const startMs = aggregation.bucketStartMs(now,tf);
  const bucket = {bucketStartMs:startMs,bucketEndMs:startMs+aggregation.TF_MS[tf]};
  assert.equal(aggregation.isCurrentBucket(bucket,tf,now),true,tf+" must identify its active, still-open bucket");
  assert.equal(aggregation.isCurrentBucket({bucketStartMs:startMs-aggregation.TF_MS[tf],bucketEndMs:startMs},tf,now),false,tf+" must not mark a completed historical bucket as current");
}

console.log("waterfall aggregation tests: PASS");
