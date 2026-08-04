"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {isGenuineVisibilityEvent}=require("./visibility-recovery-gate.module.js");

const browserWindow={kind:"window"};
const browserDocument={kind:"document",hidden:false};
const chart={kind:"chart"};

const timeframeSwitchFocus={type:"focus",target:chart,currentTarget:browserWindow};
assert.equal(
  isGenuineVisibilityEvent(timeframeSwitchFocus,browserWindow,browserDocument),
  false,
  "programmatic focus on the chart must not be classified as a visibility return"
);

const recoveryRuns={main:0,publicMarket:0,sssc:0};
for(const area of Object.keys(recoveryRuns)){
  if(isGenuineVisibilityEvent(timeframeSwitchFocus,browserWindow,browserDocument))recoveryRuns[area]+=1;
}
assert.deepEqual(
  recoveryRuns,
  {main:0,publicMarket:0,sssc:0},
  "timeframe switching while the document stays visible must not enter any recovery path"
);

assert.equal(isGenuineVisibilityEvent({type:"focus",target:browserWindow},browserWindow,browserDocument),true,"real window focus must remain eligible");
assert.equal(isGenuineVisibilityEvent({type:"visibilitychange",target:browserDocument},browserWindow,browserDocument),true,"document visibility changes must remain eligible");
assert.equal(isGenuineVisibilityEvent({type:"pageshow",target:browserWindow},browserWindow,browserDocument),true,"real pageshow must remain eligible");
assert.equal(isGenuineVisibilityEvent({type:"visibilitychange",target:chart},browserWindow,browserDocument),false,"non-document visibility events must be rejected");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const publicStart=main.indexOf("function scheduleVisibilityRecovery(event)");
const publicEnd=main.indexOf("[\"visibilitychange\",\"focus\",\"pageshow\"]",publicStart);
const authenticatedStart=main.indexOf("[\"visibilitychange\",\"focus\",\"pageshow\"].forEach(name => window.addEventListener",publicEnd);
const authenticatedEnd=main.indexOf("if(marketEl)",authenticatedStart);
const ssscStart=main.indexOf("function scheduleSsscVisibilityRecovery(event)");
const ssscEnd=main.indexOf("function install()",ssscStart);
const requiredGuard="isGenuineVisibilityEvent(event,window,document)";

assert(publicStart>=0&&publicEnd>publicStart&&main.slice(publicStart,publicEnd).includes(requiredGuard),"public-market recovery must reject element focus");
assert(authenticatedStart>=0&&authenticatedEnd>authenticatedStart&&main.slice(authenticatedStart,authenticatedEnd).includes(requiredGuard),"main/SCALP authenticated recovery must reject element focus");
assert(ssscStart>=0&&ssscEnd>ssscStart&&main.slice(ssscStart,ssscEnd).includes(requiredGuard),"SSSC recovery must reject element focus");

const focusStart=main.indexOf("function focusChart13()");
const focusEnd=main.indexOf("document.querySelectorAll('select')",focusStart);
assert(focusStart>=0&&focusEnd>focusStart&&main.slice(focusStart,focusEnd).includes("c.focus("),"regression fixture must cover the chart-focus behavior used after timeframe changes");

console.log("visibility focus routing tests: PASS");
