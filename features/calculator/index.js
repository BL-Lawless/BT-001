(() => {
  "use strict";

  function loadScript(src){
    return new Promise((resolve,reject) => {
      const existing = document.querySelector(`script[data-calculator-src="${src}"]`);
      if(existing){
        if(existing.dataset.loaded === "1"){
          resolve();
          return;
        }
        existing.addEventListener("load",() => resolve(),{once:true});
        existing.addEventListener("error",() => reject(new Error("Failed to load: " + src)),{once:true});
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.calculatorSrc = src;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(script);
    });
  }

  const CalculatorFeature = {
    async start(){
      if(window.__calculatorPresentationLoaded) return;
      window.__calculatorPresentationLoaded = true;

      try{
        await loadScript("features/calculator/domain/calculatorDomain.js");
        await loadScript("features/calculator/application/calculatorService.js");
        await loadScript("features/calculator/infrastructure/storageAdapter.js");
        await loadScript("features/calculator/presentation/calculatorModule.js");
      }catch(error){
        console.error("Calculator feature bootstrap failed.",error);
      }
    }
  };

  window.CalculatorFeature = CalculatorFeature;
  CalculatorFeature.start();
})();
