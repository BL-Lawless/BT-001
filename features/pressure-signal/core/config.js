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
    signalQuality:Object.freeze({grades:Object.freeze({A:80,B:65,C:50}),minimumRewardRisk:1.25,preferredRewardRisk:2,minimumTargetAtr:0.55,preferredTargetAtr:1.25,nearOriginAtr:0.45,exhaustionAtr:2.8}),
    targetFramework:Object.freeze({
      eligibleTimeframes:Object.freeze(["1h","4h","1d"]),obstacleTimeframes:Object.freeze(["1m","3m","5m","15m"]),
      mergeAtr:0.20,nearTargetAtr:0.30,noiseAtr:0.25,majorObstacleAtr:0.75,
      maximumDistanceAtr:Object.freeze({quick:14,"2_3h":22,"6_8h":32}),
      concentrationShare:0.60,smallPartialShare:0.25,largeEarlyShare:0.50,coverageTolerance:1e-8
    }),
    freshness:Object.freeze({
      priceStaleMs:8000,
      positionStaleMs:45000,
      protectiveOrderStaleMs:45000,
      publishedSnapshotSafeMs:45000,
      formingCadenceMultiplier:3,
      closedEvidenceCadenceMultiplier:3
    }),
    stopEvaluation:Object.freeze({
      buffers:Object.freeze({quick:Object.freeze({minimumAtr:0.20,maximumAtr:0.35,defaultAtr:0.275}),"2_3h":Object.freeze({minimumAtr:0.25,maximumAtr:0.50,defaultAtr:0.375}),"6_8h":Object.freeze({minimumAtr:0.30,maximumAtr:0.60,defaultAtr:0.45})}),
      tightToleranceAtr:0.10,wideToleranceAtr:0.45,duplicateAtr:0.10,wideGapAtr:1.50,concentrationShare:0.70,liquidationMinimumAtr:0.35,quantityTolerance:1e-8
    }),
    healthOrder:Object.freeze(["HEALTHY","CAUTION","WEAKENING","AT RISK","INVALIDATED"]),
    pathOrder:Object.freeze(["CLEAR","WARNING","DEVELOPING","CONFIRMED","CLEARED"]),
    actions:Object.freeze(["HOLD","TIGHTEN SL","TAKE PROFIT","TRIM","CLOSE"]),
    roiEpoch:Object.freeze({quantityChange:0.02,entryChange:0.0005,marginChange:0.05,leverageChange:0.01}),
    takeProfit:Object.freeze({minimumRoi:8,extensionAtr:2.5,relativeSurrender:0.35,objectiveAtr:0.35}),
    storage:Object.freeze({managementHorizon:"bt001_pressure_management_horizon",signalWindow:"bt001_pressure_signal_window",positionWindow:"bt001_pressure_position_window"})
  });
})();
