"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname,"presentation","calculatorModule.js"),
  "utf8"
);

function functionSource(name){
  const marker = `  async function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0,`${name} must exist`);
  const closeAndBody = source.indexOf("){",start);
  assert(closeAndBody >= 0,`${name} must have a function body`);
  const bodyStart = closeAndBody + 1;
  let depth = 0;
  for(let index=bodyStart;index<source.length;index++){
    if(source[index] === "{") depth++;
    else if(source[index] === "}"){
      depth--;
      if(depth === 0) return source.slice(start, index + 1).trim();
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

(async function run(){
  const directSend = functionSource("executeDirectSend");
  assert.equal(
    (directSend.match(/await timeOffset\(\)/g) || []).length,
    1,
    "one direct Send must synchronize the exchange clock exactly once"
  );
  assert(directSend.includes("signedPosition({off:sendContext.off})"));
  assert(directSend.includes("readOpenOrdersSnapshot({off:sendContext.off})"));
  assert(directSend.includes("sendContext,"));
  assert(!directSend.includes("waitForSendRestGate"),"Send must not pre-wait on the shared REST pause");

  const openOrders = functionSource("readOpenOrdersSnapshot");
  assert(openOrders.includes("await Promise.allSettled(["));
  assert(openOrders.includes("signedGet(OPEN_ORDERS_URL"));
  assert(openOrders.includes("signedGet(OPEN_ALGO_ORDERS_URL"));
  assert(
    !openOrders.includes("unwrapOrders(await signedGet"),
    "normal and algo order reads must not be sequential awaits"
  );

  const positionHelperSource = functionSource("positionForSendValidation");
  let now = 4000;
  let positionReads = 0;
  const signedPosition = async options => {
    positionReads++;
    assert.deepEqual(options,{off:17});
    return {qty:2,source:"refreshed"};
  };
  const positionForSendValidation = new Function(
    "signedPosition",
    "Date",
    "SEND_POSITION_MAX_AGE_MS",
    `return (${positionHelperSource});`
  )(signedPosition,{now:() => now},5000);

  const context = {
    off:17,
    livePosition:{qty:1,source:"preflight"},
    positionFetchedAt:1000
  };
  assert.equal(
    (await positionForSendValidation(context)).source,
    "preflight",
    "Exit/PSL validation must reuse a fresh preflight position"
  );
  assert.equal(positionReads,0);

  now = 7001;
  assert.equal(
    (await positionForSendValidation(context)).source,
    "refreshed",
    "stale preflight position must be refreshed"
  );
  assert.equal(positionReads,1);
  assert.equal(context.positionFetchedAt,7001);
  await positionForSendValidation(context);
  assert.equal(
    positionReads,
    1,
    "the second Exit/PSL validator must reuse the first validator's refresh"
  );

  const writeSource = functionSource("signedBinanceWrite");
  assert(writeSource.includes("binanceRestGateBypass:true"),"Calculator order writes must bypass a pre-existing shared pause");
  assert(writeSource.includes("This order was rejected by Binance: rate limited"),"a live order-write 429/418 must become a direct row error");
  assert(!source.includes("Binance rate limit pause active, retrying in"),"Calculator Send must not render a shared-pause countdown");

  console.log("calculator send-path tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
