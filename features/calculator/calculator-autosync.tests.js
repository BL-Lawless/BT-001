"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");

assert(!source.includes("AUTO_SYNC_POLL_MS"),"the two-second REST poll must remain removed");
assert(!source.includes("checkAutoSyncStructuralState"),"Orders seeding must not restore recurring structural REST checks");
assert(source.includes("function hasReliableCalculatorPrivateState()"),"Orders open must use authoritative private-state freshness");
assert(source.includes('typeof cache.getSnapshot === "function"'),"order freshness must come from the main authoritative cache");
assert(source.includes('typeof sync.diagnostics === "function"'),"position freshness must come from the private coordinator");
assert(source.includes("let calculatorRowsHydrated = false;"),"Calculator-local hydration must default to false each session");
assert(source.includes("if(calculatorRowsHydrated && hasReliableCalculatorPrivateState()) return Promise.resolve(false);"),"fresh coordinator state may skip REST only after local rows were hydrated");
assert(source.includes('readBinance({preserveSendPlan:true,source:"ordersToggleLoad"})'),"an unseeded Orders open must perform exactly one authoritative read");
assert.equal((source.match(/source:"ordersToggleLoad"/g)||[]).length,1,"Orders open must have one one-shot seed call site");
assert(source.includes("try{ await ensureCalculatorRowsHydratedForOrders(); }catch(_e){}"),"explicit Orders opening must use the shared one-shot seed helper");
assert(source.includes("if(effectiveOrdersVisible()) ensureCalculatorRowsHydratedForOrders().catch(() => {});"),"default, persisted, or temporarily forced Orders opening must use the same seed helper");
assert(source.includes('setOrdersVisibilityConsumer("rapid-fire",active===true)'),"Rapid Fire must use the shared Orders visibility consumer without changing persisted manual state");
const mappingIndex=source.indexOf('mapped.exitRows.forEach(item => applyMappedRow("calcModuleExitRows",item));');
const hydratedIndex=source.indexOf("calculatorRowsHydrated = true;");
assert(mappingIndex>=0&&hydratedIndex>mappingIndex,"local hydration may be marked complete only after Binance rows are mapped");
assert(/diag\.openOrdersReadStatus === "ok"[\s\S]{0,120}hasKeys\(\)[\s\S]{0,80}calculatorRowsHydrated = true/.test(source),"failed or unauthenticated reads must not mark local hydration successful");

console.log("calculator autosync tests: PASS");
