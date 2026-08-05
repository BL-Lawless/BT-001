"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname,"..","..","main.js"),"utf8");
// WF-EXT3-01/05: WF moved out of main.js into features/waterfall/waterfall.js - its own
// consumption of the balance snapshot (wfReturnMetrics) now lives there.
const wfSource = fs.readFileSync(path.resolve(__dirname,"..","..","features","waterfall","waterfall.js"),"utf8");

assert(source.includes("function commitAccountBalance(change={})"),"balance writes must use one commit function");
assert(!source.includes("accountBalanceState = v;"),"legacy scalar must not be assigned by individual source adapters");
assert(source.includes("accountBalanceState = next.value;"),"legacy scalar must mirror the owner value");
assert(source.includes('window.BT001_ACCOUNT_BALANCE = Object.freeze({'),"balance owner API must be exported");
assert(source.includes('new CustomEvent("bt001:account-balance-state"'),"balance commits must publish snapshots");
assert(source.includes('status:previous.value == null ? "unavailable" : "stale"'),"missing credentials must distinguish empty and retained state");
assert(source.includes('commitAccountBalance({status:"loading",lastAttemptAt:Date.now()});'),"refresh must publish loading state");
assert(source.includes('commitAccountBalance({status:"error",error:e && e.message ? e.message : String(e)});'),"refresh failures must publish error state");
assert(wfSource.includes('balanceSnapshot.status !== "fresh"'),"WF derived return must require a fresh balance snapshot");
assert(!wfSource.includes("if(accountBalanceState == null) return unavailable;"),"WF must no longer infer validity from the raw scalar");

const allowed = new Set(["unavailable","loading","fresh","stale","error"]);
let state = {value:null,asset:"",source:"unavailable",status:"unavailable",revision:0,updatedAt:0,verifiedAt:0,lastAttemptAt:0,error:null};
let legacy = null;
const commit = change => {
  const next = {...state,...change};
  next.status = allowed.has(next.status) ? next.status : "unavailable";
  next.error = next.status === "error" ? String(next.error || "Account balance unavailable") : null;
  next.revision = state.revision + 1;
  state = next;
  legacy = next.value;
  return Object.freeze({...next});
};

const loading = commit({status:"loading",lastAttemptAt:10});
assert.equal(loading.value,null,"initial loading state has no fabricated value");
const fresh = commit({value:1000,asset:"USDT",source:"balance-endpoint",status:"fresh",updatedAt:20,verifiedAt:20});
assert.equal(fresh.value,1000,"fresh commit exposes its value");
assert.equal(legacy,1000,"legacy scalar mirrors fresh value");
const refreshing = commit({status:"loading",lastAttemptAt:30});
assert.equal(refreshing.value,1000,"loading retains the last successful value");
const failed = commit({status:"error",error:"network"});
assert.equal(failed.value,1000,"error retains the last successful value");
assert.equal(failed.error,"network","error metadata is populated");
assert.equal(failed.revision,4,"revision increments on every committed transition");
assert(Object.isFrozen(failed),"snapshot copies are immutable");

const wfDerived = (selected,snapshot) => snapshot && snapshot.status === "fresh"
  ? selected / (snapshot.value - selected) * 100
  : null;
assert.equal(wfDerived(100,fresh),100/900*100,"fresh balance preserves derived Return % math");
assert.equal(wfDerived(-100,failed),null,"error balance produces unavailable Return %");
assert.equal(wfDerived(0,{...fresh,status:"stale"}),null,"stale balance produces unavailable Return %");

console.log("account balance owner tests: PASS");
