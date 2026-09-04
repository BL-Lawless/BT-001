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
assert(engine.ingest({symbol:"BTCUSDT",exchangeTime:60000,quantity:10,buyerIsMaker:false}));
assert(engine.ingest({symbol:"BTCUSDT",exchangeTime:61000,quantity:5,buyerIsMaker:true}));
let snap=engine.snapshot();
assert.equal(snap.buyVolume,10,"buyer takers must accumulate as buy-initiated volume");
assert.equal(snap.sellVolume,5,"buyer-maker trades must classify as seller takers");
assert.equal(snap.totalVolume,15);assert.equal(snap.buyPct,2/3);assert.equal(snap.delta,5);

engine.rollTo(120000);snap=engine.snapshot();
assert.equal(snap.current.start,120000,"the next bucket must start exactly on the fixed boundary");
assert.equal(snap.current.totalVolume,0,"a fresh bucket must reset cleanly");
assert.equal(snap.completed.length,1);assert.equal(snap.completed[0].locked,true,"completed buckets must lock");
assert.equal(snap.completed[0].totalVolume,15,"the completed bucket must retain its final volume");

engine.ingest({symbol:"BTCUSDT",exchangeTime:121000,quantity:18,takerSide:"buy"});
engine.ingest({symbol:"BTCUSDT",exchangeTime:122000,quantity:12,takerSide:"sell"});
snap=engine.snapshot();
assert.equal(snap.magnitudeRatio,2,"current total must be weighted against completed-bucket average only");
assert.equal(snap.totalLengthPct,100,"2x baseline activity must fill the available track");
assert.equal(snap.buyPct,.6);assert.equal(snap.sellPct,.4,"the color split must preserve the buy/sell proportions");

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
assert(featureSource.includes('stack.appendChild(node)')&&featureSource.includes('stack.appendChild(obi)'),"TVD must mount directly below OBI in one stack");
assert(/\.tvd-track\{[^}]*width:112px;[^}]*height:10px;/s.test(css),"TVD must use the OBI bar dimensions");
assert(/\.tvd-total\{[^}]*display:flex;/s.test(css)&&css.indexOf(".tvd-sell")<css.indexOf(".tvd-buy"),"red sell volume must sit left of green buy volume");
assert(featureSource.includes("tvd-duration-setting")&&featureSource.includes("tvd-lookback-setting")&&featureSource.includes("tvd-setting-input"),"both TVD settings must use inline click-to-edit controls");
assert(html.includes("taker-volume-delta-core.js")&&html.includes("taker-volume-delta.js")&&html.includes("taker-volume-delta.css"),"TVD assets must load in the app and standalone build");

console.log("TVD fixed-bucket, aggressor, magnitude, settings, and presentation tests: PASS");
