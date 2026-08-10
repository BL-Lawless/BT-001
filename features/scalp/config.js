(() => {
  "use strict";
  const root=typeof window!=="undefined"?(window.__BT001_SCALP_BUILD__ ||= {}):{};
  const STATES=Object.freeze(["OFF","ARMED","ENTRY_LOCKED","ENTRY_SUBMITTED","ENTRY_PARTIAL","ENTRY_FILLED","PROTECTION_SUBMITTING","ACTIVE","EXIT_LOCKED","EXITING","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"]);
  const TRANSITIONS=Object.freeze({
    OFF:["ARMED","ACTIVE","ERROR","POSITION_MISMATCH"],ARMED:["OFF","ENTRY_LOCKED","ERROR","POSITION_MISMATCH"],
    ENTRY_LOCKED:["ENTRY_SUBMITTED","ARMED","ERROR","POSITION_MISMATCH"],ENTRY_SUBMITTED:["ENTRY_PARTIAL","ENTRY_FILLED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    ENTRY_PARTIAL:["ENTRY_PARTIAL","ENTRY_FILLED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],ENTRY_FILLED:["PROTECTION_SUBMITTING","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    PROTECTION_SUBMITTING:["ACTIVE","EXIT_LOCKED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],ACTIVE:["PROTECTION_SUBMITTING","EXIT_LOCKED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    EXIT_LOCKED:["EXITING","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],EXITING:["FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    FLAT_RECONCILING:["OFF","ERROR","POSITION_MISMATCH"],
    ERROR:["OFF","ENTRY_FILLED","ACTIVE","POSITION_MISMATCH"],POSITION_MISMATCH:["OFF","ACTIVE","ERROR"]
  });
  const config=Object.freeze({
    version:"2.0.0",consumerId:"BT001_SCALP",configKey:"bt001_scalp_config_v1",windowKey:"bt001_scalp_window_v1",sessionKey:"bt001_scalp_active_session_v1",trancheSessionKey:"bt001_scalp_tranche_book_v2",autoLossKey:"bt001_scalp_auto_loss_v1",
    states:STATES,transitions:TRANSITIONS,timeframes:Object.freeze(["1m","3m","5m","15m"]),sources:Object.freeze(["1m","3m","5m","15m"]),
    directions:Object.freeze(["SHORT","LONG","ANY"]),entryTypes:Object.freeze(["BOUNCE","CROSS","ANY"]),modes:Object.freeze(["CONTINUOUS"]),
    defaults:Object.freeze({engineProfile:"V1",direction:"ANY",source:Object.freeze(["1m"]),entryType:"ANY",minimumRank:0,lot:"0.000",target:"5.0",tpDelta:"0",tpDriver:"NET_TARGET",stop:"3.0",slDelta:"0",slDriver:"NET_SL",mode:"CONTINUOUS",maxConcurrentAutoPositions:1,maxDailyAutoLossUsd:25,profitLockEnabled:false,lockThresholdPct:50,lockPortionPct:50,moveSlToBeEnabled:false,beThresholdPct:50,closePortionEnabled:false,closeThresholdPct:50,closePortionPct:50,rankBoostEnabled:false,rankBoostThreshold:90,rankBoostPoints:0}),
    fees:Object.freeze({fallbackMaker:0.0002,fallbackTaker:0.0004}),
    signal:Object.freeze({emaFast:9,emaSlow:55,minimumRows:80,atrPeriod:14,atrTrajectoryLookbackBars:8,atrTrajectoryFullChange:0.25,velocityConvictionAtrPerBar:1.5,accelerationConvictionAtrPerBar:0.5,pressureBaseline:20,crossMeaningfulGapAtr:0.10,toleranceAtr:0.12,approachAtr:0.24,bounceWindowBars:12,bounceExpansionAtr:0.005,maxOppositeSlowSlopeAtr:0.12,minFastSlopeAtr:0.006,projectedBandAtr:0.36,staleMs:Object.freeze({"1m":120000,"3m":360000,"5m":600000,"15m":1800000})}),
    signalV2:Object.freeze({emaFast:9,emaSlow:55,minimumRows:80,atrPeriod:14,atrTrajectoryLookbackBars:8,atrTrajectoryFullChange:0.25,pressureBaseline:20,crossMeaningfulGapAtr:0.10,touchToleranceAtr:0.05,approachBandAtr:0.15,minFastSlopeAtr:0.015,bounceExpansionAtr:0.03,observationBandAtr:0.30,bounceWindowBars:12,snapFullAtr:0.08,followThroughFullAtr:0.10,engagementFullAtr:0.35,slowContextLookback:20,slowWakeUpFullAtr:0.05,ssscAgreeDeceleratingMultiplier:0.85,ssscDisagreeMultiplier:0.65,ssscUnavailableMultiplier:0.75,relativeVolumeWeakThreshold:0.80,maxWeakVolumeDiscount:0.25,wickBodyRatioThreshold:0.25,wickRangeAtrThreshold:1.25,wickScoreMultiplier:0.65,rapidReversalBars:2,ssscSnapshotMaxAgeMs:120000,staleMs:Object.freeze({"1m":120000,"3m":360000,"5m":600000,"15m":1800000})}),
    order:Object.freeze({namespace:"SCALP",entryPrefix:"SCALP-E",tpPrefix:"SCALP-T",slPrefix:"SCALP-S",exitPrefix:"SCALP-X",reconcileDelayMs:250,protectionRetry:1,tpRetry:2}),
    ui:Object.freeze({minWidth:370,minHeight:350,defaultWidth:430,defaultHeight:420})
  });
  root.config=config;
  if(typeof module!=="undefined"&&module.exports)module.exports=config;
})();
