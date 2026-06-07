(() => {
  "use strict";

  function loadScript(src){
    return new Promise((resolve,reject) => {
      const existing = document.querySelector(`script[data-grad-src="${src}"]`);
      if(existing){
        if(existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",() => reject(new Error("Failed to load: " + src)),{once:true});
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.gradSrc = src;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(script);
    });
  }

  async function start(){
    if(window.__gradCalculatorLoaded) return;
    window.__gradCalculatorLoaded = true;
    try{
      await loadScript("features/grad-calculator/domain/gradDomain.js");
      await loadScript("features/grad-calculator/presentation/gradCalculatorModule.js");
    }catch(error){
      console.error("Grad Calculator bootstrap failed.",error);
    }
  }

  window.GradCalculatorFeature = {version:"GR_COMMIT_V4",start};
  start();
})();
