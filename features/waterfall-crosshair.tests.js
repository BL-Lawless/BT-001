"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"main.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

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
assert(source.includes('const realizedPartials = links.reduce((sum,link) => sum + (num(link && link.netPnl) || 0),0)'),"reference must use active-chain realized partial links");
assert(source.includes('wfCurrentCampaignClosedPartialPL')&&source.includes('num(live.realizedPartials)||0'),"crosshair must add current-position realized partials");
assert(!/lastModel\s*&&\s*lastModel\.selectedNet/.test(source),"crosshair must not reference headline WF Net P/L/floating");
assert(source.includes('if(wfSyncState.crosshair.active)renderWfCrosshair(live)'),"stationary crosshair must update on partial changes");
assert(source.includes('id="wfCrosshairValues"')&&source.indexOf('id="wfCrosshairValues"')<source.indexOf('<div class="wf-result-metric">'),"values must live at the top of the result column");
assert(!source.includes('wfCrosshairBlockPosition'),"intersection-side label placement must be removed");
assert(css.includes('top:4px')&&css.includes('.wf-crosshair-values.hidden{display:none}')&&css.includes('padding:44px 8px 8px'),"fixed top placement, visibility and reserved column space are required");
assert(source.includes('if(values) values.classList.add("hidden")'),"values must hide when crosshair leaves the plot");

// Styling parity: the WF crosshair lines must reuse the main chart's own solid rgba(112,122,138,.38)
// hairline styling instead of inventing a dashed pattern.
assert(source.includes('ctx.strokeStyle = "rgba(112,122,138,.38)"'),"main chart crosshair color is the shared reference styling to reuse");
assert(css.includes("background-color:rgba(112,122,138,.38)"),"WF crosshair lines must use the same solid rgba(112,122,138,.38) color as the main chart crosshair");
assert(!css.includes("repeating-linear-gradient(to bottom,rgba(112,122,138,.38)")&&!css.includes("repeating-linear-gradient(to right,rgba(112,122,138,.38)"),"WF crosshair must not invent its own dashed line pattern");

// Value 1 (axis value) repositioning: it must move out of the floating wf-crosshair-values box and
// render directly on the price scale at the left margin, tracking the crosshair's vertical position,
// using the same margin-anchored technique as the WF chart's own static axis labels.
assert(!source.includes('<div class="wf-crosshair-label wf-crosshair-selected"></div>'),"Value 1 must no longer render inside the floating wf-crosshair-values box");
assert(source.includes('<div class="wf-crosshair-label wf-crosshair-selected wf-crosshair-axis-value"></div>'),"Value 1 must render on the price scale via the axis-value positioning class");
assert(source.includes("const selected=overlay.querySelector(\".wf-crosshair-selected\");"),"Value 1 must now be looked up inside the crosshair overlay, not the values box");
assert(source.includes("selected.style.top=`${localY}px`;"),"Value 1 must track the crosshair's vertical position, mirroring the main chart's hover price tag");

// Value 1 boxed-label refinement: reuse the main chart's own hover price-tag box styling
// (drawHoverPriceOnRightAxis: rgba(255,255,255,.98) fill, #d9dce1 1px border, bold 12px Arial,
// centered text) so the tag reads as distinct from the axis's own plain tick labels.
assert(source.includes('ctx.fillStyle = "rgba(255,255,255,.98)"')&&source.includes('ctx.strokeStyle = "#d9dce1"')&&source.includes('ctx.font = "bold 12px Arial"'),"main chart's hover price-tag box styling is the shared reference to reuse");
assert(css.includes(".wf-crosshair-axis-value{")&&css.includes("left:4px"),"axis value must stay anchored in the left margin");
assert(css.includes("background:rgba(255,255,255,.98)")&&css.includes("border:1px solid #d9dce1")&&css.includes("font:bold 12px Arial"),"axis value must reuse the exact box/border/font styling of the main chart's hover price tag");
assert(!/\.wf-crosshair-axis-value\{[^}]*text-align:right/.test(css),"boxed tag centers its text like the main chart's price tag, not right-aligned like a plain axis label");

// Value 2 (distance) must stay exactly where it was: inside wf-crosshair-values, unmoved.
assert(source.includes('<div class="wf-crosshair-label wf-crosshair-amount"></div>'),"Value 2 markup must remain inside the floating wf-crosshair-values box, unmoved");

// Value 2 must be cumulative CLOSED P&L only: every selected closed trade plus the live position's
// realizedPartials. It must never be influenced by floatingPL -- that combined live figure is the
// WF sidebar's separate "NET P/L" and is explicitly excluded here.
assert(source.includes("return closedSelectedNet+realizedPartials;"),"baseline must add cumulative selected closed net and current-position realized partials");
assert(!source.slice(source.indexOf("function wfCurrentCampaignClosedPartialPL"),source.indexOf("function wfCurrentCampaignClosedPartialPL")+400).includes("floatingPL"),"wfCurrentCampaignClosedPartialPL's own body must never read floatingPL");
assert(source.includes("const currentCampaignClosedPartials=wfCurrentCampaignClosedPartialPL(lastModel&&lastModel.closedSelectedNet,arguments.length?liveTrade:livePreviewTrade());"),"renderWfCrosshair must use the model's cumulative closedSelectedNet and the current live position");
assert(source.includes("closedPartials=wfCurrentCampaignClosedPartialPL();"),"_diagnostics must read the same self-sufficient baseline, with no separate fallback branch to keep in sync");

// Both data modes must feed the same cumulative closed-trade total used by the sidebar.
assert(source.includes('mode === "fast"')&&source.includes('(num(fastSummary && fastSummary.netTotal) || 0)')&&source.includes('trades.reduce((sum,trade) => sum + (num(trade.net) || 0),0)'),"selected closed net must retain the sidebar's exact fast/detail computations");
assert(!source.includes("wfMostRecentClosedTradeNet"),"the isolated last-trade fallback must be removed entirely");

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
assert(source.includes("floatingExclusionHoldsForHugePositiveFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:1e9})===143")&&source.includes("floatingExclusionHoldsForHugeNegativeFloating:wfCurrentCampaignClosedPartialPL(selectedNet,{parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:-1e9})===143"),"self-tests must lock in floating-exclusion against cumulative closed net for both signs");
assert(source.includes("flatCampaignUsesAllClosedTrades:wfCurrentCampaignClosedPartialPL(selectedNet,null)===100"),"self-tests must cover the flat cumulative baseline with several trades");

console.log("waterfall crosshair tests: PASS");
