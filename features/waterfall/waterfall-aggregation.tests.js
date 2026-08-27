"use strict";

const assert = require("assert");
const aggregation = require("./waterfall-aggregation.js");

assert.deepStrictEqual(aggregation.PERIOD_OPTIONS.map(option => option.label),["1D","1W","1M","2M","3M","6M"]);
assert.deepStrictEqual(aggregation.optionsForPeriod("1d"),["6h","4h","1h","trades"]);
assert.deepStrictEqual(aggregation.optionsForPeriod("1w"),["1d","6h","4h"]);
for(const period of ["1m","2m","3m","6m"]){
  assert.deepStrictEqual(aggregation.optionsForPeriod(period),["1w","1d","6h","4h"]);
}
assert.strictEqual(aggregation.PERIOD_OPTIONS.some(option => option.value === "1y"),false,"1Y must remain absent until its data source is loadable");
assert.strictEqual(aggregation.defaultTfForPeriod("1d"),"6h","1D must default to its coarsest aggregated TF rather than Trades");
assert.strictEqual(aggregation.defaultTfForPeriod("1m"),"1w","longer periods must default to their coarsest TF");
assert.strictEqual(aggregation.validTfForPeriod("1d","1w"),"6h","invalid TF must fall back to the coarsest option");
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
const now = Date.UTC(2026,7,20,13,37,0,0);
const result = aggregation.aggregateTrades(trades,"4h",10,now);

assert.deepStrictEqual(result.recentFirst.map(trade => trade.id),trades.slice().reverse().map(trade => trade.id),"all trades must sort newest first before the split");
assert.deepStrictEqual(result.rawRecent.map(trade => trade.id),["trade_14","trade_13","trade_12"],"only trades in the current 4H bucket may remain raw");
assert.strictEqual(result.aggregatedTradeCount,12);
assert.strictEqual(result.aggregated.length,3,"all completed 4H buckets must remain aggregated");
assert.deepStrictEqual(result.aggregated.map(bucket => bucket.net),[10,4,2],"bucket bars must use exact net P/L sums");
assert(result.aggregated.every(bucket => bucket.dir === "" && bucket.markerId == null),"aggregated buckets must not expose trade direction markers");

const rawIds = new Set(result.rawRecent.map(trade => trade.id));
const bucketIds = result.aggregated.flatMap(bucket => bucket.sourceTrades.map(trade => trade.id));
assert(bucketIds.every(id => !rawIds.has(id)),"raw and aggregated trades must be disjoint");
assert.strictEqual(new Set(bucketIds.concat([...rawIds])).size,trades.length,"every source trade must appear exactly once");
assert(Math.abs(result.sourceNet-result.displayNet)<1e-9,"aggregation must preserve total net P/L");
assert.deepStrictEqual(result.display.slice(-3).map(trade => trade.id),["trade_12","trade_13","trade_14"],"current-bucket raw trades must render chronologically at the right-hand tail");
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
  const grouped = aggregation.aggregateTrades(trades,tf,10,now);
  assert.deepStrictEqual(aggregation.summarizeEntries(grouped.recentFirst),aggregation.summarizeEntries(trades),"source statistics must remain invariant at " + tf);
}
assert.deepStrictEqual(aggregation.highWaterMark(trades),{index:14,value:20,net:20},"source HWM must retain every individual trade's cumulative path");

const monday = Date.UTC(2026,7,17,0,0,0,0);
assert.strictEqual(aggregation.bucketStartMs(Date.UTC(2026,7,23,23,0,0,0),"1w"),monday,"weekly buckets must align to Monday 00:00 UTC");

for(const tf of ["4h","1d","1w"]){
  const bucketNow = Date.UTC(2026,7,20,13,37,0,0);
  const startMs = aggregation.bucketStartMs(bucketNow,tf);
  const bucket = {bucketStartMs:startMs,bucketEndMs:startMs+aggregation.TF_MS[tf]};
  assert.equal(aggregation.isCurrentBucket(bucket,tf,bucketNow),true,tf+" must identify its active, still-open bucket");
  assert.equal(aggregation.isCurrentBucket({bucketStartMs:startMs-aggregation.TF_MS[tf],bucketEndMs:startMs},tf,bucketNow),false,tf+" must not mark a completed historical bucket as current");
}

const dayNow = Date.UTC(2026,7,20,13,37,0,0);
const dailyBoundaryTrades = [
  {id:"yesterday_1",finalExitTime:Date.UTC(2026,7,19,22,0),net:1},
  {id:"yesterday_2",finalExitTime:Date.UTC(2026,7,19,23,0),net:2},
  {id:"today_1",finalExitTime:Date.UTC(2026,7,20,8,0),net:3},
  {id:"today_2",finalExitTime:Date.UTC(2026,7,20,12,0),net:4}
];
const dailyBoundary = aggregation.aggregateTrades(dailyBoundaryTrades,"1d",10,dayNow);
assert.deepStrictEqual(dailyBoundary.rawRecent.map(trade => trade.id),["today_2","today_1"],"a short daily raw tail must not reach backward into yesterday");
assert.deepStrictEqual(dailyBoundary.aggregated.flatMap(bucket => bucket.sourceTrades.map(trade => trade.id)),["yesterday_1","yesterday_2"],"prior-day trades must stay folded into their completed bucket");

const weekNow = Date.UTC(2026,7,20,13,37,0,0);
const weeklyBoundaryTrades = [
  {id:"prior_week",finalExitTime:Date.UTC(2026,7,16,23,0),net:1},
  {id:"this_week",finalExitTime:Date.UTC(2026,7,18,9,0),net:2}
];
const weeklyBoundary = aggregation.aggregateTrades(weeklyBoundaryTrades,"1w",10,weekNow);
assert.deepStrictEqual(weeklyBoundary.rawRecent.map(trade => trade.id),["this_week"],"a short weekly raw tail must not reach backward into the prior week");
assert.deepStrictEqual(weeklyBoundary.aggregated.flatMap(bucket => bucket.sourceTrades.map(trade => trade.id)),["prior_week"],"prior-week trades must stay folded into their completed bucket");

const overflowTrades = Array.from({length:12},(_,index) => ({
  id:"current_" + index,
  finalExitTime:Date.UTC(2026,7,20,12,index,0,0),
  net:1
}));
const overflow = aggregation.aggregateTrades(overflowTrades,"4h",10,now);
assert.strictEqual(overflow.rawRecent.length,10,"the current bucket must still honor the ten-trade raw cap");
assert.deepStrictEqual(overflow.rawRecent.map(trade => trade.id),overflowTrades.slice(2).reverse().map(trade => trade.id),"the ten newest current-bucket trades must remain raw");
assert.deepStrictEqual(overflow.aggregated.flatMap(bucket => bucket.sourceTrades.map(trade => trade.id)),["current_0","current_1"],"current-bucket overflow beyond ten must remain aggregated rather than disappear");

const tradesMode = aggregation.aggregateTrades(trades,"trades",10,now);
assert.deepStrictEqual(tradesMode.display.map(trade => trade.id),trades.map(trade => trade.id),"Trades mode must display every individual trade chronologically without aggregation");
assert.strictEqual(tradesMode.aggregated.length,0,"Trades mode must not create aggregate buckets");
assert.strictEqual(tradesMode.displayedTradeCount,trades.length,"Trades mode must not apply the ten-trade raw cap");
assert.equal(tradesMode.sourceNet,tradesMode.displayNet,"Trades mode must preserve exact selected-period net P/L");

const augustStart = Date.UTC(2026,7,1,0,0,0,0);
const partialWeek = aggregation.aggregateTrades([
  {id:"aug_1",finalExitTime:Date.UTC(2026,7,1,8,0),net:1},
  {id:"aug_2",finalExitTime:Date.UTC(2026,7,2,8,0),net:2}
],"1w",10,Date.UTC(2026,7,20,13,37),augustStart);
assert.equal(partialWeek.aggregated[0].bucketStartMs,augustStart,"the first weekly bucket must be clipped to the selected period's actual start");
assert.equal(partialWeek.aggregated[0].bucketEndMs,Date.UTC(2026,7,3,0,0),"period clipping must retain the natural end of the first partial weekly bucket");

console.log("waterfall aggregation tests: PASS");
