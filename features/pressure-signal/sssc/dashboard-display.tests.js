"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
assert(source.includes("setupStage=entryReady?'READY':buildingLong||buildingShort?'BUILDING':'NEUTRAL'"));
assert(source.includes("buildingLong?'BUILDING BULLISH':buildingShort?'BUILDING BEARISH'"));
assert(source.includes("buildingLong||buildingShort?'amber':'gray'"));
assert(source.includes("`${setupStage} · ${setupAction}`"));
assert(source.includes("entryReady?'Entry threshold confirmed':buildingLong||buildingShort?'Early directional strength · building':'Neutral'"));
console.log("SSSC dashboard building/ready display tests: PASS");
