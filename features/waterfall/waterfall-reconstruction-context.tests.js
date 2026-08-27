"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname,"..","..","main.js"),"utf8");
const helperStart = source.indexOf("function closedTradeBoundaryExecutionGroups(");
const helperEnd = source.indexOf("function closedTradeFastSummarySideFromRaw(",helperStart);
assert(helperStart >= 0 && helperEnd > helperStart,"verified-flat reconstruction helpers must exist");

const sandbox = {
  closedTradeNumber(value){
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
};
vm.createContext(sandbox);
vm.runInContext(
  source.slice(helperStart,helperEnd) +
  ";this.boundaryGroups=closedTradeBoundaryExecutionGroups;this.verifiedContext=closedTradeVerifiedFlatContext;",
  sandbox
);

function fill(time,side,qty,orderId,realizedPnl=0){
  return {time,side,qty:String(qty),orderId,id:orderId,positionSide:"BOTH",realizedPnl:String(realizedPnl)};
}

// The range starts in a real +0.055 carry-in long. Its close provides a proven
// flat checkpoint before the selected period. The selected period then contains
// a 0.005 short followed by one BUY 0.055 reverse fill: close 0.005 + open 0.050.
const reverseFixture = [
  fill(2000,"SELL",0.055,1,10),
  fill(6000,"SELL",0.005,2,0),
  fill(7000,"BUY",0.055,3,-1.2335),
  fill(8000,"SELL",0.050,4,51.55)
];
const verified = sandbox.verifiedContext(
  reverseFixture,
  1000,
  5000,
  {supported:true,positionAmt:0,updateTime:8000}
);
assert.equal(verified.verified,true,"a flat exchange position before the period must verify the reconstruction boundary");
assert(Math.abs(verified.startingPosition-0.055)<1e-12,"reverse anchoring must recover the non-flat +0.055 range-start position");
assert.equal(verified.verifiedAt,2000,"the last proven flat before the period must be the reconstruction checkpoint");
assert.equal(verified.rows.length,3,"carry-in rows before the proven flat must be removed");

let position = 0;
position += verified.rows[0].side === "BUY" ? Number(verified.rows[0].qty) : -Number(verified.rows[0].qty);
assert(Math.abs(position+0.005)<1e-12,"the selected-period position must begin with the real 0.005 short");
position += verified.rows[1].side === "BUY" ? Number(verified.rows[1].qty) : -Number(verified.rows[1].qty);
assert(Math.abs(position-0.050)<1e-12,"the 0.055 BUY must close 0.005 short and retain the real 0.050 long remainder");

const unverified = sandbox.verifiedContext(
  reverseFixture,
  1000,
  1500,
  {supported:true,positionAmt:0,updateTime:8000}
);
assert.equal(unverified.verified,false,"a truncated non-flat range with no flat checkpoint before the period must not be reconstructed as flat");
assert.equal(unverified.reason,"no-verified-flat-before-period");
assert.equal(unverified.rows.length,0,"unverified context must never feed a plausible-but-false reconstruction");

const fastBody = source.slice(source.indexOf("async function loadFast("),source.indexOf("async function loadDetail("));
const detailBody = source.slice(source.indexOf("async function loadDetail("),source.indexOf("function clear(){"));
[fastBody,detailBody].forEach(body => {
  assert(body.includes("closedTradePositionAnchor("),"Fast and Detail must anchor against Binance positionRisk");
  assert(body.includes("closedTradeVerifiedFlatContext("),"Fast and Detail must require a proven-flat reconstruction boundary");
  assert(body.includes("!context.verified"),"Fast and Detail must backfill or fail closed when context is unverified");
});
assert(!source.includes("maxContextStart"),"Fast reconstruction must not stop at an arbitrary period-scaled context ceiling");
assert(!source.includes("maxBackfillStart"),"Detail reconstruction must not stop at an arbitrary context ceiling");
assert(source.includes("fundingTotal:summaries.reduce"),"Fast totals must include Binance funding so they match Position History");

console.log("waterfall verified-flat reconstruction context tests: PASS");
