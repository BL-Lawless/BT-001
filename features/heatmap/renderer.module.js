(() => {
  "use strict";
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function thresholdValue(meta,pct){const p=clamp(pct/100,0,1);if(p<=.5)return meta.p50*(p/.5);if(p<=.9)return meta.p50+(meta.p90-meta.p50)*((p-.5)/.4);return meta.p90+(meta.p99-meta.p90)*((p-.9)/.1);}
  function palette(t,alpha){const stops=[[51,65,85],[30,136,229],[139,92,246],[245,158,11],[239,68,68]];const pos=clamp(t,0,1)*(stops.length-1),i=Math.min(stops.length-2,Math.floor(pos)),f=pos-i,a=stops[i],b=stops[i+1];return `rgba(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)},${alpha})`;}
  function intensity(raw,meta,prefs){const clipPercent=clamp(prefs.maxClipping,50,100)/100;const cap=clipPercent>=.999?meta.maxLiqValue:(clipPercent<=.5?meta.p50:clipPercent<=.9?meta.p50+(meta.p90-meta.p50)*((clipPercent-.5)/.4):meta.p90+(meta.p99-meta.p90)*((clipPercent-.9)/.09));const safeCap=Math.max(Number.EPSILON,cap);return prefs.mode==="RAW"?clamp(raw/safeCap,0,1):clamp(Math.log1p(raw)/Math.log1p(safeCap),0,1);}
  function emptyReport(reason,view,total=0){return {totalCellCount:total,visibleTimeCellCount:0,visiblePriceCellCount:0,visibleCellCount:0,thresholdCellCount:0,drawnCellCount:0,invalidCoordinateCount:0,zeroDrawReason:reason,canvas:view&&view.canvas||null};}
  function draw(ctx,view,state){
    const dataset=state.dataset,prefs=state.prefs;
    if(!dataset)return emptyReport("No dataset loaded",view,0);
    if(!prefs.enabled)return emptyReport("Heatmap hidden",view,dataset.cells.length);
    if(!ctx)return emptyReport("Canvas unavailable",view,dataset.cells.length);
    if(!view||!(view.width>0)||!(view.height>0))return emptyReport("Zero-sized plot",view,dataset.cells.length);
    if(typeof view.timeToX!=="function"||typeof view.priceToY!=="function")return emptyReport("Chart coordinate conversion unavailable",view,dataset.cells.length);
    if(!(prefs.opacity>0))return emptyReport("Opacity is zero",view,dataset.cells.length);
    const meta=dataset.metadata,cutoff=thresholdValue(meta,prefs.strength),alpha=clamp(prefs.opacity/100,.01,.8),cells=dataset.cells,buckets=Array.from({length:16},()=>[]);
    let visibleTimeCellCount=0,visiblePriceCellCount=0,visibleCellCount=0,thresholdCellCount=0,drawnCellCount=0,invalidCoordinateCount=0;
    let lo=0,hi=cells.length;while(lo<hi){const mid=(lo+hi)>>>1;if(cells[mid].startTime<view.visibleStartTime)lo=mid+1;else hi=mid;}let first=lo;while(first>0&&cells[first-1].endTime>=view.visibleStartTime)first--;
    ctx.save();ctx.beginPath();ctx.rect(view.left,view.top,view.width,view.height);ctx.clip();ctx.imageSmoothingEnabled=!!prefs.smoothing;
    for(let cellIndex=first;cellIndex<cells.length;cellIndex++){
      const cell=cells[cellIndex];if(cell.startTime>view.visibleEndTime)break;
      if(cell.endTime<view.visibleStartTime)continue;visibleTimeCellCount++;
      if(cell.upperPrice<view.minPrice||cell.lowerPrice>view.maxPrice)continue;visiblePriceCellCount++;visibleCellCount++;
      if(cell.rawIntensity<cutoff)continue;thresholdCellCount++;
      let x1=view.timeToX(cell.startTime),x2=view.timeToX(cell.endTime),y1=view.priceToY(cell.upperPrice),y2=view.priceToY(cell.lowerPrice);
      if(![x1,x2,y1,y2].every(Number.isFinite)){invalidCoordinateCount++;continue;}
      const left=Math.max(view.left,Math.min(x1,x2)),right=Math.min(view.left+view.width,Math.max(x1,x2)),top=Math.max(view.top,Math.min(y1,y2)),bottom=Math.min(view.top+view.height,Math.max(y1,y2));
      if(right<=left||bottom<=top)continue;
      const normalized=intensity(cell.rawIntensity,meta,prefs),grow=prefs.smoothing?.35:0,bucket=Math.min(15,Math.floor(normalized*16));
      buckets[bucket].push(left-grow,top-grow,Math.max(.5,right-left+grow*2),Math.max(.5,bottom-top+grow*2));drawnCellCount++;
    }
    for(let bucket=0;bucket<buckets.length;bucket++){const rects=buckets[bucket];if(!rects.length)continue;const normalized=(bucket+.5)/buckets.length;ctx.fillStyle=palette(normalized,alpha*(.24+.76*normalized));ctx.beginPath();for(let i=0;i<rects.length;i+=4)ctx.rect(rects[i],rects[i+1],rects[i+2],rects[i+3]);ctx.fill();}
    ctx.restore();
    let zeroDrawReason=null;
    if(!drawnCellCount){
      if(!visibleTimeCellCount)zeroDrawReason="Loaded dataset is outside current visible time range";
      else if(!visiblePriceCellCount)zeroDrawReason="Loaded dataset is outside current visible price range";
      else if(!thresholdCellCount)zeroDrawReason="Dataset loaded · 0 cells pass current visual threshold";
      else if(invalidCoordinateCount)zeroDrawReason="Chart coordinate conversion rejected visible cells";
      else zeroDrawReason="No visible cell reached the draw call";
    }
    return {totalCellCount:cells.length,visibleTimeCellCount,visiblePriceCellCount,visibleCellCount,thresholdCellCount,drawnCellCount,invalidCoordinateCount,zeroDrawReason,canvas:view.canvas||null};
  }
  function drawDecorations(ctx,view,state){
    const p=state.prefs,d=state.dataset;if(!p.enabled||!d||!view)return;
    ctx.save();ctx.font="11px Arial";ctx.textBaseline="top";
    if(p.showSourceLabel){const label=`BTCUSDT liquidation heatmap · ${state.displayedDuration||"—"} · visual context`;const w=ctx.measureText(label).width+12,x=view.left+8,y=view.top+34;ctx.fillStyle="rgba(255,255,255,.88)";ctx.fillRect(x,y,w,20);ctx.strokeStyle="rgba(156,163,175,.65)";ctx.strokeRect(x,y,w,20);ctx.fillStyle="#374151";ctx.fillText(label,x+6,y+5);}
    if(p.showLegend){const labels=["Low","Medium","High","Extreme"],sw=38,gap=2,total=labels.length*sw+(labels.length-1)*gap,x=view.left+view.width-total-10,y=view.top+10;for(let i=0;i<labels.length;i++){ctx.fillStyle=palette((i+1)/labels.length,clamp(p.opacity/100,.05,.8));ctx.fillRect(x+i*(sw+gap),y,sw,8);ctx.fillStyle="#374151";ctx.font="9px Arial";ctx.textAlign="center";ctx.fillText(labels[i],x+i*(sw+gap)+sw/2,y+10);}ctx.textAlign="left";}
    ctx.restore();
  }
  window.BT001HeatmapRenderer=Object.freeze({draw,drawDecorations,_test:{intensity,thresholdValue}});
})();
