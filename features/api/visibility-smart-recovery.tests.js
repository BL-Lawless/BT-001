"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {decidePrivateStreamRestSkip}=require("./visibility-smart-recovery.module.js");

const healthy={streamStatus:"live",listenKeyActive:true,starts:1,reconnects:0,connectedAt:1000,disconnectedAt:0,lastCloseAt:0,lastError:null};
assert.equal(decidePrivateStreamRestSkip({hiddenSince:2000,visibleAt:9000,before:healthy,after:{...healthy}}).skipRest,true,"continuous stream history must skip REST");
assert.equal(decidePrivateStreamRestSkip({hiddenSince:2000,visibleAt:9000,before:healthy,after:{...healthy,starts:2,reconnects:1,connectedAt:5000}}).skipRest,false,"a hidden-window reconnect must force REST");
assert.equal(decidePrivateStreamRestSkip({hiddenSince:2000,visibleAt:9000,before:healthy,after:{...healthy,disconnectedAt:4000,lastCloseAt:4000}}).skipRest,false,"any hidden-window disconnect must force REST");
assert.equal(decidePrivateStreamRestSkip({hiddenSince:2000,visibleAt:9000,before:null,after:healthy}).skipRest,false,"missing history must conservatively force REST");
assert.equal(decidePrivateStreamRestSkip({hiddenSince:2000,visibleAt:9000,before:healthy,after:{...healthy,reconnects:undefined}}).skipRest,false,"inconclusive counters must conservatively force REST");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(html.includes("features/api/visibility-smart-recovery.module.js"));
assert(main.includes("decidePrivateStreamRestSkip"));
assert(main.includes("captureMainHiddenStreamHistory21"));
const entryStart=main.indexOf("async function recoverVisibleAccounts21");
const entryEnd=main.indexOf("window.BT001VisibilityRecovery=",entryStart);
const entry=main.slice(entryStart,entryEnd);
assert(entry.includes("mainVisibilityRecoveryGate21.run")&&entry.includes("scalpVisibilityRecoveryGate21.run"),"smart evidence must not nest or hide SCALP's independent gate");

console.log("visibility smart recovery tests: PASS");
