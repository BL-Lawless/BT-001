"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(root,"main.js"),"utf8");
const html = fs.readFileSync(path.join(root,"index.html"),"utf8");
const waterfall = fs.readFileSync(path.join(root,"features","waterfall","waterfall.js"),"utf8");

assert(source.includes("window.BT001_DISPLAY_CONTROLS = Object.freeze({"),"display-controls owner must be exported");
assert(source.includes('version:"BT001_DISPLAY_CONTROLS_V1"'),"display-controls owner must be versioned");
for(const member of [
  "snapshot:displayControlsSnapshot",
  "setVisibility:setDisplayControlsVisibility",
  "setPeriod:setDisplayControlsPeriod",
  "periodWindow:displayControlsPeriodWindow",
  "subscribe:subscribeDisplayControls"
]) assert(source.includes(member),`display-controls owner must expose ${member}`);
assert(source.includes('new CustomEvent("bt001:display-controls-state"'),"effective control changes must publish");
assert(source.includes("const positions = trades &&"),"Positions must remain subordinate to Trades");
assert(source.includes("const lots = trades &&"),"Lots must remain subordinate to Trades");
assert(source.includes("const win = closedTradePeriodWindowMs(selected.value);"),"period owner must reuse the canonical UTC session window");

assert(source.includes("displayControlsRevision:snapshot.revision"),"load requests must capture the display-controls revision");
assert(source.includes("resolvedRange:{startMs:range.startMs,endMs:range.endMs}"),"load requests must carry one resolved range");
assert(source.includes("displayControlsRequestIsCurrent(request)"),"closed-trade commits must reject stale control requests");
assert(!source.includes("const win = closedTradePeriodWindowMs(period || opt.period);"),"owner loads must not re-derive their range from the DOM-selected period");
assert(waterfall.includes("function displayControlsLoadRequest(period,opt={})"),"Waterfall must source fast/detail request ranges from the display owner");
assert(waterfall.includes("window.BT001_DISPLAY_CONTROLS"),"Waterfall must use the display-controls owner for load requests");

for(const dead of ["customRange","customFrom","customTo","customDateModal","parseCustomDate","customReportRangeMs"]){
  assert(!html.includes(dead),`${dead} UI must be removed`);
  assert(!source.includes(dead),`${dead} code must be removed`);
  assert(!waterfall.includes(dead),`${dead} Waterfall branch must be removed`);
}
assert(!source.includes("localMidnight26"),"Patch 26 local-midnight report logic must be deleted");
assert(!source.includes("__v13Patch26ReportWrapped"),"Patch 26 report wrapper guard must be deleted");
assert(source.includes('const text = operational || "";'),"toolbar status must render operational text only");
assert(!source.includes('const text = operational || summary;'),"completed closed-trade summary must not render in the toolbar");

const patch18Capture = source.indexOf("const prevTradeOverlays18");
const activeRendererStart = source.lastIndexOf("tradeOverlays = function(vis,mapX,mapY,slot,clip){",patch18Capture);
const activeRenderer = source.slice(activeRendererStart,source.indexOf("\n  };",activeRendererStart));
assert(activeRenderer.includes("const visibility = window.BT001_DISPLAY_CONTROLS.snapshot().visibility;"),"live renderer must read visibility from the display-controls owner");
for(const control of ["tglResults","tglPositions","tglLots","tglDollarValues"]){
  assert(!activeRenderer.includes(control),`live renderer must not read ${control} directly`);
}
for(const dispatch of [
  "const positionsOn = tradesOn && !!visibility.positions;",
  "const lotsOn = tradesOn && !!visibility.lots;",
  "if(tradesOn){",
  "if(positionsOn) drawFullTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);",
  "else drawSimplifiedTrades15(vis,mapX,mapY,slot,clip,lotsOn,placedLabels);",
  "drawOpenOverlay15(vis,mapX,mapY,slot,clip,placedLabels);"
]) assert(activeRenderer.includes(dispatch),`live renderer must preserve dispatch: ${dispatch}`);

let revision = 1;
let published = 0;
let visibility = {trades:true,positions:true,lots:true};
function setVisibility(patch={}){
  const trades = Object.prototype.hasOwnProperty.call(patch,"trades") ? !!patch.trades : visibility.trades;
  const positions = trades && (Object.prototype.hasOwnProperty.call(patch,"positions") ? !!patch.positions : visibility.positions);
  const lots = trades && (Object.prototype.hasOwnProperty.call(patch,"lots") ? !!patch.lots : visibility.lots);
  const changed = trades !== visibility.trades || positions !== visibility.positions || lots !== visibility.lots;
  visibility = {trades,positions,lots};
  if(changed){ revision++; published++; }
  return Object.freeze({revision,visibility:Object.freeze({...visibility}),capabilities:Object.freeze({positionsEnabled:trades,lotsEnabled:trades})});
}

const off = setVisibility({trades:false});
assert.deepEqual(off.visibility,{trades:false,positions:false,lots:false},"Trades off must force dependent visibility off");
assert.deepEqual(off.capabilities,{positionsEnabled:false,lotsEnabled:false});
const same = setVisibility({trades:false,positions:true,lots:true});
assert.equal(same.revision,off.revision,"an ineffective subordinate update must not publish");
assert.equal(published,1,"only one effective visibility change should publish");
assert(Object.isFrozen(off)&&Object.isFrozen(off.visibility)&&Object.isFrozen(off.capabilities),"snapshots and nested fields must be immutable");

console.log("display controls owner tests: PASS");
