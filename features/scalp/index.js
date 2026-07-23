(() => {
  "use strict";
  let installing=false,pendingReinstall=false;
  async function install(){
    if(installing){pendingReinstall=true;return;}
    installing=true;
    try{
      const build=window.__BT001_SCALP_BUILD__;if(!build||!build.ScalpEngine||!build.ScalpUI)return;
      try{if(window.BT001_SCALP&&window.BT001_SCALP.destroy)window.BT001_SCALP.destroy();}catch(_e){}
      // Default (no second account configured, or "Main" is the scalp-bound slot) uses
      // window.BT001_BINANCE_TRADING exactly as before this feature existed -- byte-for-byte the
      // same gateway/engine options as the original single-account behaviour.
      const accountApi=window.BT001ScalpAccount,slot=accountApi&&accountApi.getSlot?accountApi.getSlot():"main";
      const useSecondary=slot==="scalper"&&window.BT001ScalpSecondaryGateway&&accountApi&&accountApi.hasScalperKeys&&accountApi.hasScalperKeys();
      const secondaryGateway=useSecondary?window.BT001ScalpSecondaryGateway.create():null;
      const engineOptions=secondaryGateway?{gateway:secondaryGateway,useGlobalPrivateEvents:false}:{};
      const engine=new build.ScalpEngine(engineOptions),ui=new build.ScalpUI(engine);ui.install();
      if(secondaryGateway)secondaryGateway.attach(engine);
      const api={version:"BT001_SCALP_V1",engine,ui,show:()=>ui.show(),hide:()=>ui.hide(),arm:()=>engine.arm(),disarm:()=>engine.disarm(),closeNow:()=>engine.closeNow(),snapshot:()=>engine.snapshot(),diagnostics:()=>engine.getDiagnostics(),destroy:()=>{if(secondaryGateway)secondaryGateway.detach();ui.destroy();engine.destroy();}};
      Object.defineProperty(window,"BT001_SCALP",{value:Object.freeze(api),configurable:true});
      try{await engine.initialize();}catch(error){engine.fail(error,"SCALP initialization failed");}
    }finally{
      installing=false;
      if(pendingReinstall){pendingReinstall=false;install();}
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  // Rebind to the other account whenever the "Enable Scalper" toggle changes slot (see
  // features/scalp/account-settings.module.js) -- destroys and recreates exactly as a page reload
  // would, just without requiring one.
  window.addEventListener("bt001:scalp-account-slot-changed",()=>{install();});
})();
