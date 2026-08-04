(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,core=window.BT001_SCALP_SIGNAL_DETECTOR_CORE;
  if(!C||!core||typeof core.createSignalDetectorCore!=="function")throw new Error("SCALP config and signal detector core must load before detector glue");
  const built=core.createSignalDetectorCore(C.signal);
  class BrowserDetector extends built.Detector{
    constructor(options={}){
      super({...options,getHub:options.getHub||(()=>window.PUBLIC_MARKET_DATA_HUB)});
    }
  }
  root.Detector=BrowserDetector;
  root.detectorTools=built.detectorTools;
})();
