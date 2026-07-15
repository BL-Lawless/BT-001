(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};
  build.config = Object.freeze({
    refreshMs:1000,
    managementHorizons:Object.freeze({
      quick:Object.freeze({label:"Quick",anchorTf:"5m",triggerTfs:["3m","5m"],regimeTfs:["15m","1h"],confirmCloses:2,progressMinutes:30,expectedAtr:0.70}),
      "2_3h":Object.freeze({label:"2-3H",anchorTf:"15m",triggerTfs:["5m","15m"],regimeTfs:["1h","4h"],confirmCloses:2,progressMinutes:120,expectedAtr:0.85}),
      "6_8h":Object.freeze({label:"6-8H",anchorTf:"1h",triggerTfs:["15m","1h"],regimeTfs:["4h","1d"],confirmCloses:2,progressMinutes:360,expectedAtr:1.00})
    }),
    pressure:Object.freeze({neutralImbalance:0.025,materialShare:0.60,strongShare:0.62,accelerating:0.02,persistentCloses:2}),
    healthOrder:Object.freeze(["HEALTHY","CAUTION","WEAKENING","AT RISK","INVALIDATED"]),
    pathOrder:Object.freeze(["CLEAR","WARNING","DEVELOPING","CONFIRMED","CLEARED"]),
    actions:Object.freeze(["HOLD","TIGHTEN SL","TAKE PROFIT","TRIM","CLOSE"]),
    roiEpoch:Object.freeze({quantityChange:0.02,entryChange:0.0005,marginChange:0.05,leverageChange:0.01}),
    takeProfit:Object.freeze({minimumRoi:8,extensionAtr:2.5,relativeSurrender:0.35,objectiveAtr:0.35}),
    storage:Object.freeze({managementHorizon:"bt001_pressure_management_horizon",signalWindow:"bt001_pressure_signal_window",positionWindow:"bt001_pressure_position_window"})
  });
})();
