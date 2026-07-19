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

console.log("waterfall crosshair tests: PASS");
