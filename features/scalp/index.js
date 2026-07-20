(() => {
  "use strict";
  async function install(){
    const build=window.__BT001_SCALP_BUILD__;if(!build||!build.ScalpEngine||!build.ScalpUI)return;
    try{if(window.BT001_SCALP&&window.BT001_SCALP.destroy)window.BT001_SCALP.destroy();}catch(_e){}
    const engine=new build.ScalpEngine(),ui=new build.ScalpUI(engine);ui.install();
    const api={version:"BT001_SCALP_V1",engine,ui,show:()=>ui.show(),hide:()=>ui.hide(),arm:()=>engine.arm(),disarm:()=>engine.disarm(),closeNow:()=>engine.closeNow(),snapshot:()=>engine.snapshot(),diagnostics:()=>engine.getDiagnostics(),destroy:()=>{ui.destroy();engine.destroy();}};
    Object.defineProperty(window,"BT001_SCALP",{value:Object.freeze(api),configurable:true});
    try{await engine.initialize();}catch(error){engine.fail(error,"SCALP initialization failed");}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
