"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");

assert(main.includes("const BINANCE_BACKFILL_PAGE_DELAY_MS = 300;"),"pagination must retain a named 300ms minimum delay");
assert(main.includes("const BINANCE_RECONSTRUCTION_MAX_PAGES = 60;"),"a reconstruction pass must have a named page ceiling");
assert(main.includes("const BINANCE_RECONSTRUCTION_MAX_WEIGHT = 600;"),"a reconstruction pass must have a named weight ceiling");
assert(main.includes("reserveBinanceReconstructionRequest(requestBudget,5)"),"userTrades pagination must reserve weight from the pass budget");
assert(main.includes("reserveBinanceReconstructionRequest(requestBudget,30)"),"legacy income pagination must reserve weight from the pass budget");
assert(main.includes("reserveBinanceReconstructionRequest(budget,30)"),"income range pagination must reserve weight from the pass budget");
assert.equal((main.match(/while\(!requestBudget\.limited && \(!context\.verified \|\| hasPeriodUnresolvedClose/g)||[]).length,2,"Fast and Detail verified-flat/unresolved expansion must stop at the shared pass ceiling");
assert(main.includes("request limit reached — retry to load more"),"the WF status must surface a retry/load-more state when capped");
assert(main.includes("if(cached && cached.inFlight) return cached.inFlight;"),"forced and ordinary symbol-settings readers must share an in-flight request");
assert(main.includes("const exchangeInfo = symbolSettings && symbolSettings.exchangeInfo || null;"),"API capability rendering must reuse symbol-settings exchangeInfo");

console.log("rate limit income pacing tests: PASS");
