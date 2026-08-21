"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.resolve(__dirname,"..","..","style.css"),"utf8");
const helperStart=source.indexOf("function pinOpenPositionEntryRow");
const helperEnd=source.indexOf("function snapshotManualRows",helperStart);
const helper=source.slice(helperStart,helperEnd);

assert(helper.includes('rows("calcModuleEntryRows").find(isOpenPositionRow)'),"pinning must identify only the M/open-position row");
assert(helper.includes("container.insertBefore(openRow,container.firstElementChild)"),"the open-position row must move to the first Entries slot");
assert(source.includes("function refreshEntryRowNumbers(){\n    pinOpenPositionEntryRow();"),"every Entries renumber pass must enforce the pin");
assert(source.includes("if(isEntry) pinOpenPositionEntryRow();"),"adding any new entry must preserve the open-position row at the top");
assert(source.includes('if(containerId==="calcModuleEntryRows") pinOpenPositionEntryRow();'),"bulk row rebuilds must preserve the open-position row at the top");
assert(source.includes('<span class="calc-module-section-main"><button class="calc-module-dir is-long"')&&!source.includes('calc-module-section-main">Entries '),"Entries header must start with the direction badge and omit the Entries label");
assert(/\.calc-module-dir\{[^}]*border:1px solid rgba\(31,41,55,\.42\);[^}]*font-weight:700/s.test(css),"Calculator direction badge must use the same thin-edge bold box treatment as Rapid Fire");
assert(css.includes(".calc-module-dir.is-long{")&&css.includes("rgba(187,247,208,.72)")&&css.includes(".calc-module-dir.is-short{")&&css.includes("rgba(254,202,202,.72)"),"Calculator direction badge must use matching pale LONG/SHORT fills");

console.log("Calculator open-position row pinning tests: PASS");
