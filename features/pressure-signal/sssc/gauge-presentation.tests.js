"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {directionRelativeAcceleration,createGaugeTracker}=require("./gauge-presentation.js");

const bearish=(acceleration,tf="1H")=>Object.freeze({
  tf,available:true,direction:-70,directionalStrength:-79,acceleration
});

// Bearish-confirming acceleration remains positive even as it eases from +60 to +50.
const easingTracker=createGaugeTracker();
const confirmingStrong=bearish(-60),confirmingEased=bearish(-50);
assert.equal(directionRelativeAcceleration(confirmingStrong),60);
assert.equal(directionRelativeAcceleration(confirmingEased),50);
easingTracker.update([confirmingStrong]);
assert.deepEqual(easingTracker.reading("1H"),{current:60,previous:null});
easingTracker.update([confirmingEased]);
assert.deepEqual(easingTracker.reading("1H"),{current:50,previous:60});
assert.equal(confirmingEased.acceleration,-50,"the presentation transform must not mutate underlying acceleration");

// A bearish row crossing from confirming raw acceleration to opposing acceleration must flip negative.
const reversalTracker=createGaugeTracker();
reversalTracker.update([bearish(-10)]);
assert.deepEqual(reversalTracker.reading("1H"),{current:10,previous:null});
reversalTracker.update([bearish(10)]);
assert.deepEqual(reversalTracker.reading("1H"),{current:-10,previous:10});

// Re-rendering an unchanged snapshot must not erase the last distinct trajectory reading.
reversalTracker.update([bearish(10)]);
assert.deepEqual(reversalTracker.reading("1H"),{current:-10,previous:10});

// The actual row renderer must consume the tracker reading, not directionalStrength.
const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const rowStart=main.indexOf("function rowHtml(d)");
const rowEnd=main.indexOf("function render(force=false)",rowStart);
const rowSource=main.slice(rowStart,rowEnd);
assert(rowSource.includes("powerGauge(gaugeTracker.reading(d.tf))"));
assert(!rowSource.includes("powerGauge(d.directionalStrength"));
assert(main.includes('class="ghostNeedle" data-gauge-previous="${prev}"'));
const index=fs.readFileSync(path.resolve(__dirname,"..","..","..","index.html"),"utf8");
assert(index.indexOf("features/pressure-signal/sssc/gauge-presentation.js")<index.indexOf('src="main.js"'),"gauge presentation must load before the row renderer");
assert(index.includes("<div>MOMENTUM</div><div>SCORE</div>"));

console.log("sssc gauge presentation tests: PASS");
