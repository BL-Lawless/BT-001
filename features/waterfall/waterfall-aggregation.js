/* =========================================================
   BT001_WATERFALL_AGGREGATION - Pure Period/TF and trade bucketing rules
========================================================= */
(() => {
  "use strict";

  const PERIOD_OPTIONS = Object.freeze([
    Object.freeze({value:"1d",label:"1D"}),
    Object.freeze({value:"1w",label:"1W"}),
    Object.freeze({value:"1m",label:"1M"}),
    Object.freeze({value:"2m",label:"2M"}),
    Object.freeze({value:"3m",label:"3M"}),
    Object.freeze({value:"6m",label:"6M"}),
    Object.freeze({value:"1y",label:"1Y"})
  ]);
  const TF_OPTIONS = Object.freeze({
    "1d":Object.freeze(["1h","4h","6h"]),
    "1w":Object.freeze(["4h","6h","1d"]),
    "1m":Object.freeze(["4h","6h","1d","1w"]),
    "2m":Object.freeze(["4h","6h","1d","1w"]),
    "3m":Object.freeze(["4h","6h","1d","1w"]),
    "6m":Object.freeze(["4h","6h","1d","1w"]),
    "1y":Object.freeze(["4h","6h","1d","1w"])
  });
  const TF_MS = Object.freeze({
    "1h":60 * 60 * 1000,
    "4h":4 * 60 * 60 * 1000,
    "6h":6 * 60 * 60 * 1000,
    "1d":24 * 60 * 60 * 1000,
    "1w":7 * 24 * 60 * 60 * 1000
  });
  const NEXT_FINER_TF = Object.freeze({"1w":"1d","1d":"6h","6h":"4h","4h":"1h","1h":"1h"});

  const normalize = value => String(value || "").toLowerCase();
  const toMs = value => {
    const n = Number(value);
    if(!Number.isFinite(n) || n <= 0) return null;
    return n > 1e12 ? n : n * 1000;
  };
  const optionsForPeriod = period => (TF_OPTIONS[normalize(period)] || TF_OPTIONS["1m"]).slice();
  const defaultTfForPeriod = period => optionsForPeriod(period)[0];
  const validTfForPeriod = (period,tf) => {
    const normalized = normalize(tf);
    return optionsForPeriod(period).includes(normalized) ? normalized : defaultTfForPeriod(period);
  };
  const nextFinerTf = tf => NEXT_FINER_TF[normalize(tf)] || "1h";

  function bucketStartMs(closeMs,tf){
    const value = toMs(closeMs);
    const normalizedTf = normalize(tf);
    if(value == null || !TF_MS[normalizedTf]) return null;
    if(normalizedTf === "1w"){
      const dt = new Date(value);
      const dayStart = Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate());
      const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
      return dayStart - daysSinceMonday * TF_MS["1d"];
    }
    return Math.floor(value / TF_MS[normalizedTf]) * TF_MS[normalizedTf];
  }

  function isCurrentBucket(bucket,tf,nowMs=Date.now()){
    const now = toMs(nowMs);
    const start = bucketStartMs(now,tf);
    const bucketStart = Number(bucket && bucket.bucketStartMs);
    const bucketEnd = Number(bucket && bucket.bucketEndMs);
    return now != null && start != null && Number.isFinite(bucketStart) && Number.isFinite(bucketEnd) &&
      bucketStart === start && now >= bucketStart && now < bucketEnd;
  }

  function aggregateTrades(trades,tf,rawLimit=10){
    const normalizedTf = normalize(tf);
    const stepMs = TF_MS[normalizedTf];
    if(!stepMs) throw new Error("Unsupported WF aggregation TF: " + tf);
    const recentFirst = (Array.isArray(trades) ? trades : [])
      .map((trade,sourceIndex) => ({trade,sourceIndex,closeMs:toMs(trade && trade.finalExitTime)}))
      .filter(item => item.closeMs != null)
      .sort((a,b) => (b.closeMs - a.closeMs) || (a.sourceIndex - b.sourceIndex));
    const limit = Math.max(0,Math.floor(Number(rawLimit) || 0));
    const rawRecent = recentFirst.slice(0,limit);
    const older = recentFirst.slice(limit);
    const buckets = new Map();
    older.forEach(item => {
      const startMs = bucketStartMs(item.closeMs,normalizedTf);
      let bucket = buckets.get(startMs);
      if(!bucket){
        bucket = {startMs,endMs:startMs + stepMs,trades:[],net:0};
        buckets.set(startMs,bucket);
      }
      bucket.trades.push(item.trade);
      bucket.net += Number(item.trade && item.trade.net) || 0;
    });
    const aggregated = Array.from(buckets.values())
      .sort((a,b) => a.startMs - b.startMs)
      .map(bucket => ({
        id:["wf_bucket",normalizedTf,bucket.startMs].join("_"),
        aggregated:true,
        bucketTf:normalizedTf,
        bucketStartMs:bucket.startMs,
        bucketEndMs:bucket.endMs,
        sourceTrades:bucket.trades.slice().sort((a,b) => (toMs(a && a.finalExitTime) || 0) - (toMs(b && b.finalExitTime) || 0)),
        tradeCount:bucket.trades.length,
        finalExitTime:bucket.endMs,
        when:"",
        dir:"",
        net:bucket.net,
        realized:bucket.trades.reduce((sum,trade) => sum + (Number(trade && trade.realized) || 0),0),
        fees:bucket.trades.reduce((sum,trade) => sum + (Number(trade && trade.fees) || 0),0),
        fundingDelta:bucket.trades.reduce((sum,trade) => sum + (Number(trade && trade.fundingDelta) || 0),0),
        markerId:null,
        parentTradeId:null,
        chainId:null,
        start:0,
        end:0
      }));
    const rawChronological = rawRecent.slice().reverse().map(item => item.trade);
    const display = aggregated.concat(rawChronological);
    let cumulative = 0;
    display.forEach(item => {
      item.start = cumulative;
      cumulative += Number(item && item.net) || 0;
      item.end = cumulative;
    });
    return {
      recentFirst:recentFirst.map(item => item.trade),
      rawRecent:rawRecent.map(item => item.trade),
      aggregated,
      display,
      sourceCount:recentFirst.length,
      displayedTradeCount:rawRecent.length,
      aggregatedTradeCount:older.length,
      sourceNet:recentFirst.reduce((sum,item) => sum + (Number(item.trade && item.trade.net) || 0),0),
      displayNet:display.reduce((sum,item) => sum + (Number(item && item.net) || 0),0)
    };
  }

  function summarizeEntries(entries){
    const rows = Array.isArray(entries) ? entries : [];
    const wins = rows.filter(entry => Number(entry && entry.net) > 0);
    const losses = rows.filter(entry => Number(entry && entry.net) < 0);
    const totalWin = wins.reduce((sum,entry) => sum + (Number(entry && entry.net) || 0),0);
    const totalLoss = losses.reduce((sum,entry) => sum + (Number(entry && entry.net) || 0),0);
    return {
      wins:wins.length,
      losses:losses.length,
      averageWin:wins.length ? totalWin / wins.length : null,
      averageLoss:losses.length ? totalLoss / losses.length : null,
      largestWin:wins.length ? Math.max(...wins.map(entry => Number(entry.net))) : null,
      largestLoss:losses.length ? Math.min(...losses.map(entry => Number(entry.net))) : null,
      totalWin,
      totalLoss,
      grossWins:totalWin,
      grossLosses:Math.abs(totalLoss),
      net:totalWin + totalLoss
    };
  }

  function highWaterMark(entries){
    const rows = Array.isArray(entries) ? entries : [];
    let cumulative = 0;
    let high = {index:null,value:0};
    rows.forEach((entry,index) => {
      const start = cumulative;
      cumulative += Number(entry && entry.net) || 0;
      const top = Math.max(start,cumulative);
      if(top > high.value) high = {index,value:top};
    });
    return {...high,net:cumulative};
  }

  const api = Object.freeze({
    version:"BT001_WATERFALL_AGGREGATION_V1",
    PERIOD_OPTIONS,
    TF_OPTIONS,
    TF_MS,
    optionsForPeriod,
    defaultTfForPeriod,
    validTfForPeriod,
    nextFinerTf,
    bucketStartMs,
    isCurrentBucket,
    aggregateTrades,
    summarizeEntries,
    highWaterMark,
    toMs
  });
  if(typeof window !== "undefined") window.BT001_WATERFALL_AGGREGATION = api;
  if(typeof module !== "undefined" && module.exports) module.exports = api;
})();
