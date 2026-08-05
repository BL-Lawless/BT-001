"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.resolve(__dirname,"..","..","main.js"),"utf8");
const sharedSource = fs.readFileSync(path.resolve(__dirname,"shared-position-fact.module.js"),"utf8");
// WF-EXT3-01/05: WF moved out of main.js into features/waterfall/waterfall.js - its own
// consumption of the visual owner (subscription, snapshot reads, livePreviewTrade) now
// lives there.
const wfSource = fs.readFileSync(path.resolve(__dirname,"..","..","features","waterfall","waterfall.js"),"utf8");

assert(source.includes("function commitOpenPositionVisualState(next={},meta={})"),"visual state must have one commit/publication point");
assert(source.includes('window.BT001_OPEN_POSITION_VISUAL = Object.freeze({'),"visual owner API must be exported separately");
assert(source.includes("function cloneOpenPositionVisualValue(value,seen=new WeakMap())"),"visual snapshot rows must be recursively copied and frozen");
assert(source.includes('new CustomEvent("bt001:open-position-visual-state"'),"visual commits need a distinct event");
assert(!sharedSource.includes("bt001:open-position-visual-state"),"shared authoritative owner must not be modified for visual publication");
assert(source.includes('window.dispatchEvent(new CustomEvent("v13:open-position-change"'),"authoritative event remains present");
assert(source.includes('source:"patch14-position-risk"'),"Patch 14 business-state writes must use the visual commit path");
assert(source.includes('status:"stale"')&&source.includes('source:"patch14-position-risk-stale"'),"Patch 14 stale-state commits must publish through the visual owner");
assert(source.includes('source:"patch21-position-risk"'),"Patch 21 business-state writes must use the visual commit path");
assert(source.includes("const sameCampaignContext = !!("),"risk-only commits must discard reconstruction from a different symbol/side campaign");
assert(source.includes("function suppressOpenPositionRenderState()"),"temporary render suppression remains separate");
assert(!wfSource.includes("prevRefreshOpenPosition"),"WF must not wrap refreshOpenPosition");
assert(!wfSource.includes("__bt001WfLivePositionStripBridge"),"WF must not wrap updatePositionStrip");
assert(!wfSource.includes("updateWfLiveStripSnapshot"),"position-strip change detection must be removed from WF");
assert(wfSource.includes('window.addEventListener("bt001:open-position-visual-state"'),"WF must subscribe to visual commits");
assert(wfSource.includes("window.BT001_OPEN_POSITION_VISUAL.snapshot()"),"WF must read the visual snapshot");
assert(wfSource.includes("visual.authoritativePositionRevision !== authoritative.revision"),"WF must reject visual state lagging the authoritative fact");
assert(!wfSource.slice(wfSource.indexOf("function livePreviewTrade()"),wfSource.indexOf("function wfLivePreviewBars")).includes("OPEN_POSITION_STATE"),"WF live preview must not read OPEN_POSITION_STATE directly");

let owner = {
  revision:0,symbol:"",status:"unavailable",updatedAt:0,authoritativePositionRevision:0,
  markers:[],links:[],boxes:[],activeParentChainIds:new Set()
};
const commit = (next,meta) => {
  owner = {...owner,...next,revision:owner.revision+1,symbol:meta.symbol,status:meta.status,authoritativePositionRevision:meta.authoritativePositionRevision};
  const links = Object.freeze(owner.links.map(row=>Object.freeze({...row})));
  const byChain = {};
  links.forEach(link=>{if(link.chainId)byChain[link.chainId]=(byChain[link.chainId]||0)+(Number(link.netPnl)||0);});
  return Object.freeze({
    revision:owner.revision,symbol:owner.symbol,status:owner.status,
    authoritativePositionRevision:owner.authoritativePositionRevision,
    markers:Object.freeze(owner.markers.map(row=>Object.freeze({...row}))),
    links,
    boxes:Object.freeze(owner.boxes.map(row=>Object.freeze({...row}))),
    activeParentChainIds:Object.freeze(Array.from(owner.activeParentChainIds)),
    realizedPartials:Object.freeze({total:Object.values(byChain).reduce((sum,value)=>sum+value,0),byChain:Object.freeze(byChain)})
  });
};

const first = commit({
  markers:[{id:"entry",chainId:"campaign",tooltip:["entry"]}],
  links:[{id:"partial",chainId:"campaign",netPnl:12.5}],
  boxes:[{chainId:"campaign",unrealizedPnl:30}],
  activeParentChainIds:new Set(["campaign"])
},{symbol:"BTCUSDT",status:"reconstructed",authoritativePositionRevision:7});
assert.equal(first.revision,1,"visual revision increments per commit");
assert.equal(first.realizedPartials.byChain.campaign,12.5,"snapshot exposes realized partials by chain");
assert(Object.isFrozen(first)&&Object.isFrozen(first.markers)&&Object.isFrozen(first.markers[0]),"snapshot rows are immutable copies");
assert.equal(first.authoritativePositionRevision,7,"snapshot is tied to an authoritative revision");

const second = commit({boxes:[{chainId:"campaign",unrealizedPnl:40}]},{symbol:"BTCUSDT",status:"risk-only",authoritativePositionRevision:8});
assert.equal(second.revision,2,"risk-only commits also publish a revision");
assert.notEqual(second.authoritativePositionRevision,first.authoritativePositionRevision,"consumers can detect authoritative revision changes");

console.log("open position visual owner tests: PASS");
