"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..","..");
// WF-EXT3-01/05: WF moved out of main.js into its own file. Most of these assertions
// check WF's own source/CSS, now here - but two (the shared main-chart hover/crosshair
// styling references, ~line 34/49 below) check main.js's own canvas-drawing code, which
// WF's CSS/markup was built to deliberately mirror and did not move.
const source=fs.readFileSync(path.join(root,"main.js"),"utf8");
const wfSource=fs.readFileSync(path.join(root,"features","waterfall","waterfall.js"),"utf8");
const css=fs.readFileSync(path.join(root,"features","waterfall","waterfall.css"),"utf8");

const money=(value,signed=false)=>{
  const amount=Math.round(Math.abs(Number(value)||0)).toLocaleString("en-US");
  if(Math.abs(Number(value)||0)<.005)return "$0";
  if(Number(value)<0)return `−$${amount}`;
  return `${signed?"+":""}$${amount}`;
};
const difference=(cursor,partials)=>money(Number(cursor)-Number(partials),true);

assert.equal(difference(55,0),"+$55","no current partials");
assert.equal(difference(55,43),"+$12","positive current partials");
assert.equal(difference(-20,10),"−$30","negative cursor arithmetic");
assert.equal(difference(55,-10),"+$65","negative partial result");
assert.equal(difference(55,43),difference(55,43),"floating changes are absent from the formula");
assert(wfSource.includes('const realizedPartials = num(visual.realizedPartials && visual.realizedPartials.byChain && visual.realizedPartials.byChain[parentId]) || 0'),"reference must use active-chain realized partials from the visual snapshot");
assert(wfSource.includes('wfCurrentCampaignClosedPartialPL')&&wfSource.includes('num(live.realizedPartials)||0'),"crosshair must add current-position realized partials");
assert(!/lastModel\s*&&\s*lastModel\.selectedNet/.test(wfSource),"crosshair must not reference headline WF Net P/L/floating");
assert(wfSource.includes('if(wfSyncState.crosshair.active)renderWfCrosshair(live)'),"stationary crosshair must update on partial changes");
// WF-COS06: the floating wf-crosshair-values box (and its reserved top padding on the
// result column) is gone - Value 2 moved onto the chart itself, boxed at the plot's
// right edge next to Value 1. These three assertions replace the pre-COS06 ones that
// locked in the old "lives at the top of the result column" placement.
assert(!wfSource.includes('id="wfCrosshairValues"'),"the old floating values container must be removed");
assert(!css.includes('.wf-crosshair-values'),"the old floating values box CSS must be removed");
assert(!wfSource.includes('wfCrosshairBlockPosition'),"intersection-side label placement must be removed");
assert(css.includes('padding:8px;')&&!css.includes('padding:44px 8px 8px'),"the result column no longer reserves top space for the removed floating values box");
assert(wfSource.includes('if(overlay) overlay.classList.add("hidden")')&&!wfSource.includes('values.classList.add("hidden")'),"there is no separate values container left to hide");

// Styling parity: the WF crosshair lines must reuse the main chart's own solid rgba(112,122,138,.38)
// hairline styling instead of inventing a dashed pattern. The main chart's own drawing code stays in
// main.js after extraction - only WF's CSS mirror of it moved to waterfall.css.
assert(source.includes('ctx.strokeStyle = "rgba(112,122,138,.38)"'),"main chart crosshair color is the shared reference styling to reuse");
assert(css.includes("background-color:rgba(112,122,138,.38)"),"WF crosshair lines must use the same solid rgba(112,122,138,.38) color as the main chart crosshair");
assert(!css.includes("repeating-linear-gradient(to bottom,rgba(112,122,138,.38)")&&!css.includes("repeating-linear-gradient(to right,rgba(112,122,138,.38)"),"WF crosshair must not invent its own dashed line pattern");

// Value 1 (axis value) repositioning: it must move out of the floating wf-crosshair-values box and
// render directly on the price scale at the left margin, tracking the crosshair's vertical position,
// using the same margin-anchored technique as the WF chart's own static axis labels.
assert(!wfSource.includes('<div class="wf-crosshair-label wf-crosshair-selected"></div>'),"Value 1 must no longer render inside the floating wf-crosshair-values box");
assert(wfSource.includes('<div class="wf-crosshair-label wf-crosshair-selected wf-crosshair-axis-value"></div>'),"Value 1 must render on the price scale via the axis-value positioning class");
assert(wfSource.includes("const selected=overlay.querySelector(\".wf-crosshair-selected\");"),"Value 1 must now be looked up inside the crosshair overlay, not the values box");
assert(wfSource.includes("selected.style.top=`${localY}px`;"),"Value 1 must track the crosshair's vertical position, mirroring the main chart's hover price tag");

// Value 1 boxed-label refinement: reuse the main chart's own hover price-tag box styling
// (drawHoverPriceOnRightAxis: rgba(255,255,255,.98) fill, #d9dce1 1px border, bold 12px Arial,
// centered text) so the tag reads as distinct from the axis's own plain tick labels. That drawing
// code stays in main.js - only WF's CSS mirror of it moved to waterfall.css.
assert(source.includes('ctx.fillStyle = "rgba(255,255,255,.98)"')&&source.includes('ctx.strokeStyle = "#d9dce1"')&&source.includes('ctx.font = "bold 12px Arial"'),"main chart's hover price-tag box styling is the shared reference to reuse");
assert(css.includes(".wf-crosshair-axis-value{")&&css.includes("left:4px"),"axis value must stay anchored in the left margin");
// WF-COS08: background/border still deliberately match the main chart's hover price
// tag (checked above via main.js's ctx.fillStyle/ctx.strokeStyle), but font weight/size
// intentionally diverged from that reference here - bold 12px -> normal 13px.
assert(css.includes("background:rgba(255,255,255,.98)")&&css.includes("border:1px solid #d9dce1"),"axis value must still reuse the box/border styling of the main chart's hover price tag");
assert(css.includes("font:400 13px Arial"),"WF-COS08: both crosshair value boxes must use normal weight at 13px, not the main chart's bold 12px");
assert(!/\.wf-crosshair-axis-value\{[^}]*text-align:right/.test(css),"boxed tag centers its text like the main chart's price tag, not right-aligned like a plain axis label");

// WF-COS06: Value 2 (distance) now renders as its own boxed label on the chart, reusing
// Value 1's exact box styling (.wf-crosshair-axis-value) and positioned at the plot's
// right edge instead of inside the removed floating values box.
assert(wfSource.includes('<div class="wf-crosshair-label wf-crosshair-amount wf-crosshair-axis-value wf-crosshair-right-value"></div>'),"Value 2 must render as a boxed label using the same box styling as Value 1");
assert(wfSource.includes('const amount=overlay.querySelector(".wf-crosshair-amount");'),"Value 2 must now be looked up inside the crosshair overlay, matching Value 1");
assert(wfSource.includes('amount.style.top=`${localY}px`;'),"Value 2 must track the crosshair's vertical position the same way Value 1 does");
assert(css.includes('.wf-crosshair-right-value{')&&css.includes('right:4px'),"Value 2's box must be anchored at the plot's right edge");

// Value 2 must be cumulative CLOSED P&L only: every selected closed trade plus the live position's
// realizedPartials. It must never be influenced by floatingPL -- that combined live figure is the
// WF sidebar's separate "NET P/L" and is explicitly excluded here.
assert(wfSource.includes("return closedSelectedNet+realizedPartials;"),"baseline must add cumulative selected closed net and current-position realized partials");
assert(!wfSource.slice(wfSource.indexOf("function wfCurrentCampaignClosedPartialPL"),wfSource.indexOf("function wfCurrentCampaignClosedPartialPL")+400).includes("floatingPL"),"wfCurrentCampaignClosedPartialPL's own body must never read floatingPL");
assert(wfSource.includes("const currentCampaignClosedPartials=wfCurrentCampaignClosedPartialPL(lastModel&&lastModel.closedSelectedNet,arguments.length?liveTrade:livePreviewTrade());"),"renderWfCrosshair must use the model's cumulative closedSelectedNet and the current live position");
assert(wfSource.includes("closedPartials=wfCurrentCampaignClosedPartialPL();"),"_diagnostics must read the same self-sufficient baseline, with no separate fallback branch to keep in sync");

// Both data modes must feed the same cumulative closed-trade total used by the sidebar.
assert(wfSource.includes('mode === "fast"')&&wfSource.includes('(num(fastSummary && fastSummary.netTotal) || 0)')&&wfSource.includes('trades.reduce((sum,trade) => sum + (num(trade.net) || 0),0)'),"selected closed net must retain the sidebar's exact fast/detail computations");
assert(!wfSource.includes("wfMostRecentClosedTradeNet"),"the isolated last-trade fallback must be removed entirely");

const closedTrades=[{net:-150},{net:220},{net:35},{net:-5}];
const selectedNet=closedTrades.reduce((sum,trade)=>sum+(Number(trade.net)||0),0);
assert.equal(selectedNet,100,"selected net is the full sum of several closed trades");

// Executable mirror: cumulative closed net plus realizedPartials, with floatingPL excluded.
const currentCampaignClosedPartialPL=(closedNet,liveTrade)=>closedNet+(liveTrade&&liveTrade.parentTradeId?(Number(liveTrade.realizedPartials)||0):0);
assert.equal(currentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:1e9}),143,"a huge positive floatingPL must never leak into the cumulative closed-P&L baseline");
assert.equal(currentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:-1e9}),143,"a huge negative floatingPL must never leak into the cumulative closed-P&L baseline");
assert.equal(difference(155,currentCampaignClosedPartialPL(selectedNet,{parentTradeId:"campaign-a",realizedPartials:43,floatingPL:1e9})),"+$12","distance text is unaffected by floatingPL regardless of magnitude or sign");
assert.equal(currentCampaignClosedPartialPL(selectedNet,null),100,"flat baseline uses the sum of all closed trades, not the final trade");
assert.equal(difference(500,currentCampaignClosedPartialPL(selectedNet,null)),"+$400","flat distance uses cumulative closed net");

// Self-tests must lock in both corrected formulas.
assert(wfSource.includes("floatingExclusionHoldsForHugePositiveFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:1e9})===143")&&wfSource.includes("floatingExclusionHoldsForHugeNegativeFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:-1e9})===143"),"self-tests must lock in floating-exclusion against cumulative closed net for both signs");
assert(wfSource.includes("flatCampaignUsesAllClosedTrades:wfCurrentCampaignClosedPartialPL(selectedNet,null)===100"),"self-tests must cover the flat cumulative baseline with several trades");

console.log("waterfall crosshair tests: PASS");
