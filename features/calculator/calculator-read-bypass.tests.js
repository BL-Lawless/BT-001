"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..","..");
const calculator=fs.readFileSync(path.join(root,"features/calculator/presentation/calculatorModule.js"),"utf8");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");

assert(calculator.includes("const readRequestOptions = {off:opts.off,binanceRestGateBypass:true};"),"all readBinance hydration calls must opt into the scoped bypass");
assert(calculator.includes("getPositions(key,sec,off,{binanceRestGateBypass:options.binanceRestGateBypass===true})"),"positionRisk must receive the Read bypass marker");
assert.equal((calculator.match(/signedGet\(OPEN_(?:ALGO_)?ORDERS_URL[^\n]+binanceRestGateBypass:options\.binanceRestGateBypass===true/g)||[]).length,2,"regular and algo open-order reads must receive the marker");
assert(calculator.includes('return clock && typeof clock.offset === "function"'),"bypassed Read must use held clock state instead of a gated clock synchronization");
assert(main.includes("binanceRestGateBypass:options.binanceRestGateBypass===true"),"the shared signed GET helper must forward the explicit bypass marker");
assert(calculator.includes('"Read failed: rate limited (HTTP " + status + ")."'),"position read rejection must be specific");
assert(calculator.includes('"Read failed: rate limited (HTTP " + orderRateLimitStatus + ")."'),"settled order read rejection must be specific");
assert(calculator.includes("if(calculatorRowsHydrationPromise) return calculatorRowsHydrationPromise;\n    return readBinance({userRead:true});"),"manual Read must join automatic hydration rather than duplicate it");
assert(calculator.includes('addEventListener("click",readBinanceFromUser,false)'),"the Read button must use the deduplicating entry point");

console.log("calculator read bypass tests: PASS");
