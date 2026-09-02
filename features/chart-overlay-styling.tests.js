"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const depthProfile=fs.readFileSync(path.join(__dirname,"depth-profile","depth-profile.js"),"utf8");
const buttonToggleIds=["tglEMA20","tglEMA50","tglEMA3","tglEMA4","tglEMA5","tglVWAP","tglDSMA","tglKeyLevels","tglSMC"];

buttonToggleIds.forEach(id=>assert(css.includes("#"+id),id+" must use the chart indicator button treatment"));
assert(/\.chart-indicator-toggles > label\.toggle:has\([^}]+\)\{[^}]*height:22px;[^}]*padding:0 8px;[^}]*border:1px solid #d9dce1;[^}]*border-radius:6px;[^}]*font-size:11px;[^}]*font-weight:700;/s.test(css),"indicator controls must match the OBD/OTF/Orders button dimensions and typography");
assert(/\.chart-indicator-toggles > label\.toggle:has\([^}]+:checked\)\{[^}]*background:rgba\(245,190,55,\.18\);[^}]*opacity:1;/s.test(css),"checked indicator controls must expose an active filled state");
assert(/\.chart-indicator-toggles > label\.toggle > input:is\([^}]+\)\{[^}]*position:absolute;[^}]*opacity:0;[^}]*pointer-events:none;/s.test(css),"legacy checkbox state owners must be visually hidden without replacing their event logic");
assert(/\.chart-volatility-readout\{[^}]*min-height:20px;[^}]*font:700 14px\/1 Arial,sans-serif;/s.test(css),"ADX/ATR must use the larger 14px type without changing its 20px minimum height");
assert(/\.chart-book-pressure-gauge\{[^}]*min-height:20px;[^}]*font:700 14px\/1 Arial,sans-serif;/s.test(css),"Book Pressure must use the larger 14px type without changing its 20px minimum height");
assert(/\.adx-direction-tag\{[^}]*font-size:1em;/.test(css),"the ADX direction glyph must inherit the enlarged readout size");
const orderRules=["tglEMA20","tglEMA50","tglEMA3","tglEMA4","tglEMA5","tglVWAP","tglDSMA","tglKeyLevels","tglSMC"].map((id,index)=>`.chart-indicator-toggles > label.toggle:has(> #${id}){order:${index-9}}`);
orderRules.forEach(rule=>assert(css.includes(rule),"missing deterministic indicator order rule: "+rule));
assert(main.includes('<span id="lblKeyLevels">LEVELS</span>')&&main.includes('buttonLabel.textContent="LEVELS"'),"the Key levels chart button must be labeled LEVELS on creation and refresh");
assert(/\.chart-overlay-control-group\{[^}]*top:6px;[^}]*display:flex;[^}]*align-items:center;[^}]*gap:6px;/.test(css),"overlay buttons must share the indicator row centerline and preserve spacing");
assert(main.includes('fill.style.left = model.side === "bid" ? "50%" : model.side === "ask" ? (50 - magnitudePct) + "%" : "calc(50% - 2px)"'),"Book Pressure direction must be green-right/red-left");
assert(depthProfile.includes("const y1=mapY(bucket.high),y2=mapY(bucket.low);")&&depthProfile.includes("ctx.fillRect(chartRight-width,y,width,height);"),"Depth Profile must retain its independent vertical price orientation");

console.log("chart overlay styling tests: PASS");
