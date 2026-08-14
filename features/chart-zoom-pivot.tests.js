"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");

const source=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))).trim();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const pivotContext={Math,Number,clamp,MAX_FUTURE_RATIO:.5,rightOffset:0,visibleCount:0,zoomPivotExactRightOffset:null,zoomPivotRoundedRightOffset:null,zoomPivotVisibleCount:null};
vm.createContext(pivotContext);
vm.runInContext(`${slice("function resetZoomPivotContinuity","function zoomAt")};this.solve=solveZoomPivotRightOffset;this.next=zoomPivotRightOffset;this.phase=zoomPivotRenderPhase;this.reset=resetZoomPivotContinuity;`,pivotContext);

const baseZoom=slice("function zoomAt(mx,dy)",'canvas.addEventListener("wheel"');
const wrappedZoom=slice("/* Trackpad sensitivity: make zoom speed proportional to wheel delta magnitude. */","/* Direct-marker hit testing");
for(const [name,zoom,ratio] of [["base",baseZoom,"clamp((mx-left)/chartW,0,1)"],["runtime wrapper",wrappedZoom,"clamp26((mx-left)/chartW,0,1)"]]){
  assert(zoom.includes(`const ratio = ${ratio};`)&&zoom.includes("rightOffset = zoomPivotRightOffset(rightOffset,visibleCount,nc,ratio,candles.length);"),`${name} zoom must use the shared continuous cursor-pivot formula`);
  assert(!/\b(?:anchor|global|idxView|newEnd)\b/.test(zoom),`${name} zoom must not snap a future-space cursor to a real candle`);
  assert(!zoom.includes("clampView()"),`${name} zoom must not mutate rightOffset through a second code path`);
  assert.equal((zoom.match(/\brightOffset\s*=/g)||[]).length,1,`${name} zoom must assign rightOffset exactly once through the pivot formula`);
}
assert((source.match(/const zoomPhase = zoomPivotRenderPhase\(\);/g)||[]).length>=3,"every main-chart X renderer must consume the retained fractional zoom phase");
assert((source.match(/Math\.floor\(\(mouse\.x-left\)\/slot-zoomPhase\)/g)||[]).length>=2,"crosshair candle lookup must use the same fractional phase as rendering");

const candleCount=500,minVisible=40;
const leftBoundary=(visible,rightOffset)=>candleCount-rightOffset-visible;
const axisAtCursor=(visible,rightOffset,ratio)=>leftBoundary(visible,rightOffset)+ratio*visible;
const latestPosition=(visible,rightOffset)=>(candleCount-.5-leftBoundary(visible,rightOffset))/visible;
const zoomedVisible=(visible,direction)=>clamp(Math.round(visible*Math.exp(direction*.2)),minVisible,candleCount);

// Future-space pivot: preserve the continuous point beyond the last candle. The latest candle
// may move only by pure scaling around that pivot, plus the explicitly required final half-slot rounding.
pivotContext.reset();
let visible=80,rightOffset=-10,exactRight=rightOffset;
const futureRatio=.95,futurePivot=axisAtCursor(visible,exactRight,futureRatio);
for(const direction of [-1,-1,-1,-1,-1,1,1,1,1,1]){
  const priorLatest=latestPosition(visible,exactRight),nextVisible=zoomedVisible(visible,direction);
  const nextExact=pivotContext.solve(exactRight,visible,nextVisible,futureRatio);
  assert(Math.abs(axisAtCursor(nextVisible,nextExact,futureRatio)-futurePivot)<1e-9,"future-space zoom must preserve the same continuous empty-space pivot");
  const expectedLatest=futureRatio+(priorLatest-futureRatio)*(visible/nextVisible);
  assert(Math.abs(latestPosition(nextVisible,nextExact)-expectedLatest)<1e-9,"latest-candle motion must be pure zoom scaling, not cursor-induced panning");
  const nextRounded=pivotContext.next(rightOffset,visible,nextVisible,futureRatio,candleCount);
  assert.equal(nextRounded,Math.round(nextExact),"rightOffset must round once, after the continuous pivot solution");
  assert(Math.abs(latestPosition(nextVisible,nextRounded)-expectedLatest)<=.5/nextVisible+1e-12,"rendered latest-candle motion must differ only by final half-slot quantization");
  visible=nextVisible;rightOffset=nextRounded;exactRight=nextExact;
}

// Required numeric regression: N=500,V=100,R=10,u=.6 gives S=390 and pivot/index 450
// (not 445). Verify that exact state, rendered phase, and candle identity survive every step.
pivotContext.reset();
visible=100;rightOffset=10;
const realRatio=.6,anchoredCandle=450,roundedOnlyIndices=[];
assert.equal(Math.floor(axisAtCursor(visible,rightOffset,realRatio)),anchoredCandle,"the stated starting values put candle 450 beneath the cursor");
for(const direction of [-1,-1,-1,-1,-1,1,1,1,1,1]){
  const phase=pivotContext.phase();
  const renderedAxis=axisAtCursor(visible,rightOffset,realRatio)-phase;
  assert.equal(Math.floor(renderedAxis),anchoredCandle,"the same candle must remain beneath the cursor before every zoom step");
  roundedOnlyIndices.push(Math.floor(axisAtCursor(visible,rightOffset,realRatio)));
  const nextVisible=zoomedVisible(visible,direction);
  rightOffset=pivotContext.next(rightOffset,visible,nextVisible,realRatio,candleCount);
  visible=nextVisible;
  pivotContext.rightOffset=rightOffset;pivotContext.visibleCount=visible;
}
assert.equal(Math.floor(axisAtCursor(visible,rightOffset,realRatio)-pivotContext.phase()),anchoredCandle,"the same candle must remain beneath the cursor after the final zoom step");
assert(roundedOnlyIndices.includes(449),"the regression fixture must reproduce the old rounded-renderer jump from candle 450 to 449");

console.log("chart zoom pivot tests: PASS");
