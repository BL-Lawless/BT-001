(() => {
  "use strict";
  let dprQuery=null;
  function watchDevicePixelRatio(){
    if(typeof matchMedia!=="function") return;
    if(dprQuery&&typeof dprQuery.removeEventListener==="function") dprQuery.removeEventListener("change",watchDevicePixelRatio);
    dprQuery=matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
    if(typeof dprQuery.addEventListener==="function") dprQuery.addEventListener("change",watchDevicePixelRatio,{once:true});
    try{if(typeof window.resizeCanvas==="function")window.resizeCanvas();else if(typeof window.draw==="function")window.draw();}catch(_e){}
  }
  function init(){ window.BT001HeatmapUI.init(); watchDevicePixelRatio(); }
  window.BT001HeatmapFeature=Object.freeze({
    init,
    draw(ctx,view){
      const report=window.BT001HeatmapRenderer.draw(ctx,view,window.BT001HeatmapState.snapshot());
      window.BT001HeatmapState.reportRender(report);
      return report;
    },
    drawDecorations(ctx,view){return window.BT001HeatmapRenderer.drawDecorations(ctx,view,window.BT001HeatmapState.snapshot());},
    refresh(){return window.BT001HeatmapState.refresh();},
    snapshot(){return window.BT001HeatmapState.snapshot();},
    destroy(){window.BT001HeatmapState.destroy();}
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
