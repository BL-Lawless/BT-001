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
assert(source.includes('wfCurrentCampaignClosedPartialPL')&&source.includes('num(live.realizedPartials)||0'),"crosshair must use current-campaign realized partials");
assert(!/const current=Number\(lastModel && lastModel\.selectedNet\)/.test(source),"crosshair must not reference WF Net P/L/floating");
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

// Value 2 must be CLOSED P&L only (realizedPartials, or the last closed trade's net when flat) and
// must never be influenced by floatingPL -- that combined figure (netLivePL = realizedPartials +
// floatingPL) is the WF sidebar's separate "NET P/L" and is explicitly excluded here.
assert(source.includes("if(live&&live.parentTradeId)return num(live.realizedPartials)||0;"),"the live-position branch must still use realizedPartials only, unchanged");
assert(!source.slice(source.indexOf("function wfCurrentCampaignClosedPartialPL"),source.indexOf("function wfCurrentCampaignClosedPartialPL")+400).includes("floatingPL"),"wfCurrentCampaignClosedPartialPL's own body must never read floatingPL");
assert(source.includes("const currentCampaignClosedPartials=wfCurrentCampaignClosedPartialPL(arguments.length?liveTrade:livePreviewTrade());"),"renderWfCrosshair must route through the (now self-sufficient) wfCurrentCampaignClosedPartialPL for its baseline");
assert(source.includes("closedPartials=wfCurrentCampaignClosedPartialPL();"),"_diagnostics must read the same self-sufficient baseline, with no separate fallback branch to keep in sync");

// Fallback baseline fix, folded into wfCurrentCampaignClosedPartialPL itself: with no live position,
// the distance value must use the most recently closed trade's own net P/L instead of a flat 0.
assert(source.includes("return wfMostRecentClosedTradeNet();"),"wfCurrentCampaignClosedPartialPL must fall back to the most recently closed trade's net P/L, not a bare 0, when there is no live position");
assert(source.includes("function wfMostRecentClosedTradeNet(trades){")&&source.includes("rows[rows.length-1]"),"fallback must read the last (most recent) trade from the cached WF model");

const mostRecentClosedTradeNet=trades=>{
  const rows=Array.isArray(trades)?trades:[];
  const last=rows.length?rows[rows.length-1]:null;
  return last?(Number(last.net)||0):0;
};
assert.equal(mostRecentClosedTradeNet([{net:-150},{net:220}]),220,"fallback baseline uses the most recently closed trade's own net P/L, not an earlier one");
assert.equal(mostRecentClosedTradeNet([]),0,"fallback baseline is 0 when there is no closed-trade history at all");
assert.equal(difference(500,mostRecentClosedTradeNet([{net:-150},{net:220}])),"+$280","distance value uses the last-closed-trade baseline instead of 0 when flat");
assert.equal(difference(500,mostRecentClosedTradeNet([])),"+$500","distance value still falls back to 0 baseline when there is truly no trade history");

// Executable mirror of the floating-exclusion lock-in: realizedPartials must drive the distance no
// matter how large floatingPL is, in either direction.
const currentCampaignClosedPartialPL=liveTrade=>liveTrade&&liveTrade.parentTradeId?(Number(liveTrade.realizedPartials)||0):mostRecentClosedTradeNet([]);
assert.equal(currentCampaignClosedPartialPL({parentTradeId:"campaign-a",realizedPartials:43,floatingPL:1e9}),43,"a huge positive floatingPL must never leak into the closed-P&L baseline");
assert.equal(currentCampaignClosedPartialPL({parentTradeId:"campaign-a",realizedPartials:43,floatingPL:-1e9}),43,"a huge negative floatingPL must never leak into the closed-P&L baseline");
assert.equal(difference(55,currentCampaignClosedPartialPL({parentTradeId:"campaign-a",realizedPartials:43,floatingPL:1e9})),"+$12","distance text is unaffected by floatingPL regardless of magnitude or sign");

// Self-tests: both the floating-exclusion lock-in and the no-position fallback must be present as
// named cases in runWfCrosshairSelfTests, restoring lastModel afterward so the check can't leak into
// (or depend on) live app state.
assert(source.includes("floatingExclusionHoldsForHugePositiveFloating:wfCurrentCampaignClosedPartialPL({parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:1e9})===43")&&source.includes("floatingExclusionHoldsForHugeNegativeFloating:wfCurrentCampaignClosedPartialPL({parentTradeId:\"campaign-a\",realizedPartials:43,floatingPL:-1e9})===43"),"self-tests must lock in floating-exclusion for both huge-positive and huge-negative floatingPL");
assert(source.includes("flatCampaignUsesLastClosedTradeNet=wfCurrentCampaignClosedPartialPL(null)===220")&&source.includes("lastModel=priorModel;"),"self-tests must cover the no-position fallback via the integrated call and restore lastModel afterward");

console.log("waterfall crosshair tests: PASS");
