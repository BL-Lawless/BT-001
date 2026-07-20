(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {};
  const STATES=Object.freeze(["OFF","ARMED","ENTRY_LOCKED","ENTRY_SUBMITTED","ENTRY_PARTIAL","ENTRY_FILLED","PROTECTION_SUBMITTING","ACTIVE","EXIT_LOCKED","EXITING","FLAT_RECONCILING","COOL_OFF","ERROR","POSITION_MISMATCH"]);
  const TRANSITIONS=Object.freeze({
    OFF:["ARMED","ACTIVE","ERROR","POSITION_MISMATCH"],ARMED:["OFF","ENTRY_LOCKED","ERROR","POSITION_MISMATCH"],
    ENTRY_LOCKED:["ENTRY_SUBMITTED","ARMED","ERROR","POSITION_MISMATCH"],ENTRY_SUBMITTED:["ENTRY_PARTIAL","ENTRY_FILLED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    ENTRY_PARTIAL:["ENTRY_PARTIAL","ENTRY_FILLED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],ENTRY_FILLED:["PROTECTION_SUBMITTING","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    PROTECTION_SUBMITTING:["ACTIVE","EXIT_LOCKED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],ACTIVE:["PROTECTION_SUBMITTING","EXIT_LOCKED","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    EXIT_LOCKED:["EXITING","FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],EXITING:["FLAT_RECONCILING","ERROR","POSITION_MISMATCH"],
    FLAT_RECONCILING:["OFF","COOL_OFF","ERROR","POSITION_MISMATCH"],COOL_OFF:["ARMED","OFF","ERROR","POSITION_MISMATCH"],
    ERROR:["OFF","ENTRY_FILLED","ACTIVE","POSITION_MISMATCH"],POSITION_MISMATCH:["OFF","ACTIVE","ERROR"]
  });
  root.config=Object.freeze({
    version:"1.0.0",consumerId:"BT001_SCALP",configKey:"bt001_scalp_config_v1",windowKey:"bt001_scalp_window_v1",sessionKey:"bt001_scalp_active_session_v1",
    states:STATES,transitions:TRANSITIONS,timeframes:Object.freeze(["1m","3m","5m"]),sources:Object.freeze(["1m","3m","5m","SIG"]),
    directions:Object.freeze(["SHORT","LONG","ANY"]),entryTypes:Object.freeze(["BOUNCE","CROSS","ANY"]),modes:Object.freeze(["SINGLE","CONTINUOUS"]),
    defaults:Object.freeze({direction:"ANY",source:"1m",entryType:"ANY",lot:"0.000",target:"5.0",tpDelta:"0",tpDriver:"NET_TARGET",stop:"3.0",slDelta:"0",slDriver:"NET_SL",mode:"SINGLE",cooloffMinutes:1}),
    fees:Object.freeze({fallbackMaker:0.0002,fallbackTaker:0.0004}),
    signal:Object.freeze({emaFast:9,emaSlow:55,minimumRows:80,atrPeriod:14,toleranceAtr:0.12,rejectionAtr:0.08,minFastSlopeAtr:0.006,minSlowSlopeAtr:0.002,minSeparationAtr:0.025,maxCompressionAtr:0.04,projectedBandAtr:0.08,crossPersistenceMs:Object.freeze({"1m":3000,"3m":5000,"5m":8000}),staleMs:Object.freeze({"1m":120000,"3m":360000,"5m":600000,"SIG":120000})}),
    order:Object.freeze({namespace:"SCALP",entryPrefix:"SCALP-E",tpPrefix:"SCALP-T",slPrefix:"SCALP-S",exitPrefix:"SCALP-X",reconcileDelayMs:250,protectionRetry:1,tpRetry:2}),
    ui:Object.freeze({minWidth:370,minHeight:470,defaultWidth:430,defaultHeight:500})
  });
})();
