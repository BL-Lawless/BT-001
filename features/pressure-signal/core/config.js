(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};
  build.config = Object.freeze({
    refreshMs:1000,
    managementHorizons:Object.freeze({
      quick:Object.freeze({label:"Quick",earlyWarningTf:"1m",triggerTf:"3m",primaryTf:"5m",contextTf:"15m",boundaryTf:"1h",extendedTfs:["4h","1d"],htfEmaTfs:["15m","1h"],conditionalEmaTfs:["4h","1d"],anchorTf:"5m",triggerTfs:["3m","5m"],regimeTfs:["15m","1h"],confirmCloses:2,stallReviewMs:60*60*1000,materiallyCloseAtr:[1,1.5],expectedAtr:0.70}),
      "2_3h":Object.freeze({label:"2\u20133H",earlyWarningTf:"3m",triggerTf:"5m",primaryTf:"15m",contextTf:"1h",boundaryTf:"4h",extendedTfs:["1d"],htfEmaTfs:["1h","4h"],conditionalEmaTfs:["1d"],anchorTf:"15m",triggerTfs:["5m","15m"],regimeTfs:["1h","4h"],confirmCloses:2,stallReviewMs:3*60*60*1000,materiallyCloseAtr:[1,1.5],expectedAtr:0.85}),
      "6_8h":Object.freeze({label:"6\u20138H",earlyWarningTf:"5m",triggerTf:"15m",primaryTf:"1h",contextTf:"4h",boundaryTf:"1d",extendedTfs:[],htfEmaTfs:["1h","4h","1d"],conditionalEmaTfs:[],anchorTf:"1h",triggerTfs:["15m","1h"],regimeTfs:["4h","1d"],confirmCloses:2,stallReviewMs:12*60*60*1000,materiallyCloseAtr:[1,1.5],expectedAtr:1.00})
    }),
    managementLevels:Object.freeze({zoneAtr:0.12,proximityAtr:0.35,confluenceAtr:0.20,exceptionalDistanceAtr:3.0,migrationMinAtr:0.20}),
    volatility:Object.freeze({atrPeriod:14,historyCandles:100,minimumSamples:60,quietPercentile:25,highPercentile:75,extremePercentile:95,toleranceMultipliers:Object.freeze({QUIET:0.80,NORMAL:1.00,HIGH:1.25,EXTREME:1.50})}),
    pressure:Object.freeze({neutralImbalance:0.025,materialShare:0.60,strongShare:0.62,accelerating:0.02,persistentCloses:2}),
    healthOrder:Object.freeze(["HEALTHY","CAUTION","WEAKENING","AT RISK","INVALIDATED"]),
    pathOrder:Object.freeze(["CLEAR","WARNING","DEVELOPING","CONFIRMED","CLEARED"]),
    actions:Object.freeze(["HOLD","TIGHTEN SL","TAKE PROFIT","TRIM","CLOSE"]),
    roiEpoch:Object.freeze({quantityChange:0.02,entryChange:0.0005,marginChange:0.05,leverageChange:0.01}),
    takeProfit:Object.freeze({minimumRoi:8,extensionAtr:2.5,relativeSurrender:0.35,objectiveAtr:0.35}),
    storage:Object.freeze({managementHorizon:"bt001_pressure_management_horizon",signalWindow:"bt001_pressure_signal_window",positionWindow:"bt001_pressure_position_window"})
  });
})();
