"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const coreSource=fs.readFileSync(path.join(__dirname,"taker-volume-delta-core.js"),"utf8");
const featureSource=fs.readFileSync(path.join(__dirname,"taker-volume-delta.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"taker-volume-delta.css"),"utf8");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const context={window:{},Object,Number,String,Math};
vm.createContext(context);vm.runInContext(coreSource,context);

const core=context.window.BT001TakerVolumeDeltaCore;
assert.equal(core.fixedBucketStart(65999,60000),60000,"fixed buckets must align to exchange-time boundaries");
const engine=core.createEngine({durationMs:60000,lookback:20});
assert(engine.ingest({symbol:"BTCUSDT",exchangeTime:60000,price:100,quantity:10,buyerIsMaker:false}));
assert(engine.ingest({symbol:"BTCUSDT",exchangeTime:61000,price:104,quantity:5,buyerIsMaker:true}));
let snap=engine.snapshot();
assert.equal(snap.buyVolume,10,"buyer takers must accumulate as buy-initiated volume");
assert.equal(snap.sellVolume,5,"buyer-maker trades must classify as seller takers");
assert.equal(snap.totalVolume,15);assert.equal(snap.buyPct,2/3);assert.equal(snap.delta,5);
assert.equal(snap.current.openPrice,100);assert.equal(snap.current.lastPrice,104);assert.equal(snap.current.priceChange,4,"price change must update live from the bucket's first to latest trade");

engine.rollTo(120000);snap=engine.snapshot();
assert.equal(snap.current.start,120000,"the next bucket must start exactly on the fixed boundary");
assert.equal(snap.current.totalVolume,0,"a fresh bucket must reset cleanly");
assert.equal(snap.completed.length,1);assert.equal(snap.completed[0].locked,true,"completed buckets must lock");
assert.equal(snap.completed[0].totalVolume,15,"the completed bucket must retain its final volume");
assert.equal(snap.completed[0].priceChange,4,"the completed bucket must lock its final price change");
assert.equal(snap.baselineBuckets.length,1,"relationship history must use the same eligible completed buckets as the TVD baseline");

engine.ingest({symbol:"BTCUSDT",exchangeTime:121000,price:104,quantity:18,takerSide:"buy"});
engine.ingest({symbol:"BTCUSDT",exchangeTime:122000,price:101,quantity:12,takerSide:"sell"});
snap=engine.snapshot();
assert.equal(snap.magnitudeRatio,2,"current total must be weighted against completed-bucket average only");
assert.equal(snap.totalLengthPct,100,"2x baseline activity must fill the available track");
assert.equal(snap.buyPct,.6);assert.equal(snap.sellPct,.4,"the color split must preserve the buy/sell proportions");
assert.equal(snap.current.priceChange,-3,"forming-bucket price change must remain live");

const relationship=core.relationshipModel([
  {start:1,buyVolume:100,sellVolume:0,priceChange:1},
  {start:2,buyVolume:50,sellVolume:0,priceChange:-10},
  {start:3,buyVolume:30,sellVolume:20,priceChange:5}
]);
assert.deepEqual(Array.from(relationship,row=>row.bucket.start),[1,2,3],"relationship history must retain oldest-to-newest bucket order");
assert.equal(relationship[0].magnitudeMismatch,true,"large delta paired with flat price must be highlighted");
assert.equal(relationship[1].directionMismatch,true,"opposing meaningful delta and price directions must be highlighted");
assert.equal(relationship[2].divergent,false,"ordinary proportional pairs must remain untinted");

const historyEngine=core.createEngine({durationMs:1000,lookback:2});
historyEngine.ingest({symbol:"BTCUSDT",exchangeTime:1000,price:10,quantity:1,takerSide:"buy"});
historyEngine.ingest({symbol:"BTCUSDT",exchangeTime:2000,price:11,quantity:2,takerSide:"sell"});
historyEngine.ingest({symbol:"BTCUSDT",exchangeTime:3000,price:12,quantity:3,takerSide:"buy"});
historyEngine.rollTo(4000);const historySnap=historyEngine.snapshot();
assert.deepEqual(Array.from(historySnap.baselineBuckets,bucket=>bucket.start),[2000,3000],"tooltip history must follow a reduced lookback immediately and retain newest eligible buckets");
assert.equal(core.relationshipModel(historySnap.baselineBuckets).length,historySnap.lookback,"a warmed tooltip must show exactly the configured TVD lookback count");

engine.configure({lookback:2});assert.equal(engine.snapshot().lookback,2,"baseline lookback must be adjustable");
engine.configure({durationMs:5000});snap=engine.snapshot();
assert.equal(snap.durationMs,5000,"bucket duration must be adjustable");
assert.equal(snap.completed.length,0,"changing duration must discard incompatible baseline buckets");
engine.ingest({symbol:"BTCUSDT",exchangeTime:12345,quantity:1,takerSide:"buy"});
assert.equal(engine.snapshot().current.start,10000,"custom durations must retain fixed alignment");
engine.ingest({symbol:"ETHUSDT",exchangeTime:12400,quantity:2,takerSide:"sell"});
snap=engine.snapshot();assert.equal(snap.symbol,"ETHUSDT");assert.equal(snap.buyVolume,0);assert.equal(snap.sellVolume,2,"symbol changes must reset rather than mix volume");

assert(featureSource.includes('DEFAULTS=Object.freeze({durationSeconds:60,lookback:20})'),"TVD must default to one-minute buckets and a separate 20-bucket baseline");
assert(featureSource.includes('event.type!=="aggTrade"')&&main.includes('publishMarketUpdate({type:"aggTrade"'),"TVD must consume the existing public aggTrade flow");
assert(main.includes('takerSide:buyerIsMaker?"sell":"buy"'),"aggTrade maker-side classification must identify the aggressor");
assert(featureSource.includes('class="tvd-sell"')&&featureSource.includes('class="tvd-buy"'),"TVD must render one split red/green total bar");
assert(!featureSource.includes('<span class="tvd-label">')&&!css.includes(".tvd-label"),"TVD must match OBI's no-visible-label treatment");
assert(featureSource.includes('stack.appendChild(node)')&&featureSource.includes('stack.appendChild(obi)'),"TVD must mount directly below OBI in one stack");
assert(/\.tvd-track\{[^}]*width:112px;[^}]*height:10px;/s.test(css),"TVD must use the OBI bar dimensions");
assert(/\.market-pressure-gauge-stack\{[^}]*row-gap:2px;/s.test(css)&&/\.market-pressure-gauge-stack \.chart-book-pressure-gauge\{[^}]*height:10px;[^}]*flex:0 0 10px;/s.test(css)&&/\.chart-tvd-gauge\{[^}]*height:10px;[^}]*flex:0 0 10px;/s.test(css),"the resting stack must be exactly two ten-pixel bars plus the two-pixel middle gap, allowing equal parent padding above and below");
assert(css.includes(".chart-tvd-gauge:has(.tvd-settings-editor){height:18px;min-height:18px;flex-basis:18px}"),"the compact resting frame must still expand to fit both TVD editors");
assert(/\.tvd-total\{[^}]*display:flex;/s.test(css)&&css.indexOf(".tvd-sell")<css.indexOf(".tvd-buy"),"red sell volume must sit left of green buy volume");
assert(featureSource.includes('class="tvd-track" role="button"')&&featureSource.includes('track.addEventListener("click"')&&featureSource.includes("openSettingsEditor(node)"),"clicking the TVD bar must open its settings editor");
assert(!featureSource.includes("tvd-setting-button")&&!featureSource.includes("tvd-duration-setting")&&!featureSource.includes("tvd-lookback-setting")&&!css.includes(".tvd-setting-button"),"TVD must render no dedicated resting setting values or buttons");
assert(featureSource.includes('class="tvd-setting-input tvd-duration-input"')&&featureSource.includes('class="tvd-setting-input tvd-lookback-input"')&&featureSource.includes('node.insertBefore(editor,node.querySelector(".tvd-delta-price-display"))'),"one TVD bar click must reveal duration and lookback editors simultaneously");
assert(featureSource.includes("LIMITS.durationMin")&&featureSource.includes("LIMITS.durationMax")&&featureSource.includes("LIMITS.lookbackMin")&&featureSource.includes("LIMITS.lookbackMax"),"the joint editor must retain both settings ranges");
assert(featureSource.includes('class="tvd-delta-price-display"')&&featureSource.includes('class="tvd-current-delta"')&&featureSource.includes('class="tvd-current-price"'),"TVD must show the compact raw delta/price relationship inline");
assert(featureSource.includes('renderRelationship(node,model)')&&featureSource.includes('current.priceChange'),"the inline relationship must update from every live TVD render");
assert(featureSource.includes('core.relationshipModel(model.baselineBuckets)')&&featureSource.includes("model.lookback+' · oldest → newest"),"the tooltip must chart exactly the TVD baseline history in oldest-to-newest order");
assert(featureSource.indexOf('miniBar("delta"')<featureSource.indexOf('miniBar("price"'),"each history bucket must show delta then price as an adjacent pair");
assert(css.includes(".tvd-delta-price-display:hover .tvd-relation-tooltip")&&css.includes(".tvd-relation-pair.is-divergent"),"the relationship chart must be hover-revealed and tint divergent pairs");
assert(/\.tvd-relation-chart\{[^}]*gap:0;/s.test(css)&&/\.tvd-relation-pair\{[^}]*min-width:1px;/s.test(css),"the tooltip must retain every bucket at the maximum 200-bucket lookback");
assert(html.includes("taker-volume-delta-core.js")&&html.includes("taker-volume-delta.js")&&html.includes("taker-volume-delta.css"),"TVD assets must load in the app and standalone build");

console.log("TVD fixed-bucket, aggressor, magnitude, settings, relationship, and presentation tests: PASS");
