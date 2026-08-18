"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.resolve(__dirname,"..","..","main.js"),"utf8");

assert(!source.includes("WF-RECON-"+"DIAG1"),"the superseded reconstruction diagnostics must be removed");
assert(!source.includes("ROW-CHASE-B1-"+"DIAG1"),"the superseded row-chase diagnostics must be removed");
assert(source.includes("version:'WF-FLIP-DIAG2'"),"flip-boundary diagnostics must carry their task identifier");
assert(source.includes("console.info('[WF-FLIP-DIAG2]'"),"each flip must be visible in the diagnostic console stream");
assert(source.includes("const openBefore = totalQty();"),"flip diagnostics must observe the existing computed position size");
assert(source.includes("earliestLotEntryWasFirstProcessedRow:earliestWasFirstRow12"),"flip diagnostics must report whether the earliest lot begins at the fetch boundary");
assert(source.includes("startingPositionUnverifiedAtFetchBoundary:earliestWasFirstRow12"),"the boundary-confidence flag must be explicit");
assert(source.includes("contributingLots:contributingLots12"),"the exact lots used by the flip must be captured for the 1D/1W diff");
assert(source.indexOf("flipDiag12({")<source.indexOf("const closePnlTotal = pnl;",source.indexOf("flipDiag12({")),"flip telemetry must observe state before close/reverse mutation");

console.log("waterfall flip-boundary diagnostics tests: PASS");
