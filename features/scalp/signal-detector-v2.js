(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,core=window.BT001_SCALP_SIGNAL_DETECTOR_V2_CORE;
  if(!C||!core||typeof core.createSignalDetectorV2Core!=="function")throw new Error("SCALP config and V2 detector core must load before V2 detector glue");
  const built=core.createSignalDetectorV2Core(C.signalV2);
  class BrowserDetectorV2 extends built.Detector{
    constructor(options={}){super({...options,getHub:options.getHub||(()=>window.PUBLIC_MARKET_DATA_HUB)});}
  }
  root.DetectorV2=BrowserDetectorV2;
  root.detectorV2Tools=built.detectorTools;
})();
