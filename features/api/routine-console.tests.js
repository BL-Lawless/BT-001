"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"../..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const gate=read("services/binance-rest-gate.service.js");
const main=read("main.js");
const calculator=read("features/calculator/presentation/calculatorModule.js");
const clock=read("features/api/exchange-clock.module.js");
const supabase=read("services/supabase.service.js");

assert(gate.includes("const REFOCUS_DIAG = false;"),"routine refocus diagnostics must remain silenced");
assert(!gate.includes('this.logger.warn("[Binance REST gate] Pausing all Binance REST requests"'));
assert(!gate.includes('this.logger.info("[Binance REST gate] Request pause ended"'));
assert(!calculator.includes('console.info(MODULE + " read diagnostic"'));
assert(!calculator.includes('console.info(MODULE + " flat cleanup"'));

assert(main.includes("window.binanceRealtimeDiagnostics = () => ({...diag,topOfBookFeed:topOfBookDiagnostics()});"));
assert(clock.includes("Object.freeze({now,fromLocal,offset,sync,ensureSynchronized,isReliable,status,CACHE_MS,maxRoundTripMs})"));
assert(supabase.includes("log,flushPending,pendingCount,loggingStatus"));
assert(!supabase.includes("setLatestSnapshot"));
assert(gate.includes("state() {"));

console.log("routine console audit tests: PASS");
