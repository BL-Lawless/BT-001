"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=__dirname,context={console,Math,Number,Object,Array,Set,Map,Error,JSON};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,"domain","gradDomain.js"),"utf8"),context,{filename:"gradDomain.js"});

const result=context.GradCalculatorDomain._selfTest();
assert.equal(result.passed,true,JSON.stringify(result.cases,null,2));
for(const [name,passed] of Object.entries(result.cases))assert.equal(passed,true,name);

const source=fs.readFileSync(path.join(root,"presentation","gradCalculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(root,"grad-calculator.css"),"utf8");
for(const obsolete of ["gridAnchor","gridIndex","entryGrid:{","CUSTOM_ANCHORED","Linear grid","Custom anchored grid","gradEntryGridMode","is-grid-anchor"]){
  assert(!source.includes(obsolete),`obsolete persistent-anchor token remains: ${obsolete}`);
}
assert(!css.includes("grad-entry-grid-mode")&&!css.includes("is-grid-anchor"),"anchor-specific presentation must be removed");
assert(source.includes("domain().redistributeAroundPivot"),"all grids must use temporary-pivot redistribution");
assert(source.includes('dragGridPivot(state.drag.section,state.drag.row,level)'),"the drag path must be section-agnostic");
assert(source.includes('const box=hit(event.clientX,event.clientY),draggable=box&&box.status!=="executed"'),"all non-executed GR labels must be draggable");
assert(source.includes("rowIndex:list.indexOf(box.row)")&&source.includes("pivotPrice:number(box.row.level)"),"active drag state must contain only a temporary row index and pivot price");
assert(source.includes("originalRows:rows(box.section).map")&&source.includes('event.key!=="Escape"'),"drag cancellation must restore the original preview");
assert(source.includes("gridRows(section).length?resetGridToLinearFromCurrent(section)"),"Step must linearize every GR section without replacing rows");
assert(source.includes("initializeImportedGrid(section)"),"Read must preserve imported geometry for every section");
const importBlock=source.match(/function initializeImportedGrid[\s\S]*?const totalMargin/)[0];
assert(!/applyGridLevels|resetGridToLinearFromCurrent|generate\(/.test(importBlock),"Read must not reshape imported non-uniform grids");
assert(source.includes('record.role!=="masterSl"'),"Master SL must remain excluded from GR Protection rows");
assert(source.includes('actionableRows(preflight.section)')&&source.includes('await executeSection(preflight.section,currentRows)'),"Send must use the current displayed row prices");
assert(source.includes('const GR_PRICE_DECIMALS = 0')&&source.includes('const GR_PRICE_INCREMENT = 1')&&source.includes('const normalizeGrPrice = value =>'),"GR must have one authoritative whole-number price normalizer");
assert(source.includes('row.level=serializeGrPrice(row.level)')&&source.includes('triggerPrice:serializeGrPrice(row.level)')&&source.includes('price:serializeGrPrice(row.level)'),"Protection and Entry/Exit sends must renormalize and serialize current row prices");
assert(source.includes('function normalizeSectionPriceState(section)')&&source.includes('normalizeSectionPriceState(section);'),"validation must canonicalize all GR price state before Send");
assert(source.includes('exchangeLevel:data.exchangeLevel')&&source.includes('Number.isInteger(number(original))')&&source.includes('if(row.binanceOrderId&&row.status!=="executed")updatePriceStatus(row)'),"fractional imported live prices must remain distinguishable and require explicit Send after normalization");
assert(!source.includes('triggerPrice:String(number(row.level))')&&!source.includes('price:String(number(row.level))'),"GR Send must not serialize raw numeric price state");
assert(source.includes('function normalizedOrderedLevels')&&source.includes('if(!levels)return false'),"rounded grids must be rechecked and impossible geometry rejected");
assert(source.includes('data-step="1"')&&source.includes('step.addEventListener("wheel"')&&source.includes('nudgeStep(event.deltaY<0?stepIncrement():-stepIncrement())'),"every Step field must use whole-number wheel increments through the shared nudge path");
assert(source.includes('const commitStep=')&&source.includes('const nudgeStep=delta=>')&&source.includes('commitStep();return true'),"wheel/buttons and typed Step must share the commit handler");
assert.equal((source.match(/resetGridToLinearFromCurrent\(/g)||[]).length,2,"linear rebuilding must occur only in its helper and the Step commit path");
const dragBlock=source.match(/function dragGridPivot[\s\S]*?function resetGridToLinearFromCurrent/)[0];
assert(!/signedWrite\(|executeSection\(|executeSectionDirect\(|redistributeLotsOnly\(/.test(dragBlock),"dragging must change prices only and remain preview-only");

console.log("grad calculator tests: PASS",result.cases);
