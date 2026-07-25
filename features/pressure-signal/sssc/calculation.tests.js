"use strict";
const assert=require("assert");
const calc=require("./calculation.js");

const slots=[9,21,55,100,200].map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
const rows=Array.from({length:1000},(_,index)=>({
  time:index+1,close:100+index*.02+Math.sin(index/11),high:101+index*.02,low:99+index*.02,
  volume:10,baseVolume:10,quoteVolume:(100+index*.02)*10
}));
const diagnostic=calc.calculateTimeframe({label:"1H",interval:"1h",rows,slots,minimumRows:600,fullRows:1000});

assert.equal(diagnostic.available,true);
assert.equal(diagnostic.reliability,"full-warmup");
assert(Math.abs(diagnostic.stackDir-100)<1e-12);
assert(Math.abs(diagnostic.direction-87.79744580955077)<1e-9);
assert(Math.abs(diagnostic.magnitude-(-68.41287127623903))<1e-9);
assert(Object.isFrozen(diagnostic)&&Object.isFrozen(diagnostic.crosses)&&Object.isFrozen(diagnostic.emaVals));

const summary=calc.aggregate([diagnostic]);
assert(Math.abs(summary.direction-87.79744580955077)<1e-9);
assert(Math.abs(summary.magnitude-(-68.41287127623903))<1e-9);
assert(Math.abs(summary.clarity-82.66538268686264)<1e-9);
assert(Math.abs(summary.risk-17.334617313137358)<1e-9);
assert(Object.isFrozen(summary));

const mixed=calc.aggregate([
  {...diagnostic,direction:60,magnitude:20},
  {...diagnostic,direction:-20,magnitude:-10},
  {available:false}
]);
assert.equal(mixed.direction,20);
assert.equal(mixed.magnitude,5);
assert.equal(mixed.alignment,2/3);
assert(Math.abs(mixed.clarity-47.8)<1e-9);
assert(Math.abs(mixed.risk-66.2)<1e-9);

const minimum=calc.calculateTimeframe({label:"1H",interval:"1h",rows:rows.slice(-600),slots,minimumRows:600,fullRows:1000});
assert.equal(minimum.available,true);
assert.equal(minimum.reliability,"minimum-warmup");
const insufficient=calc.calculateTimeframe({label:"1H",interval:"1h",rows:rows.slice(-599),slots,minimumRows:600,fullRows:1000});
assert.equal(insufficient.available,false);
assert.equal(insufficient.reason,"warmup-limited");

console.log("sssc calculation tests: PASS");
