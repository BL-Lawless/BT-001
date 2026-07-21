(() => {
  "use strict";

  const build=window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};
  const unavailable=value=>value==null||value===""||Number.isNaN(value)||String(value).trim().toUpperCase()==="UNAVAILABLE"?"UNAVAILABLE":String(value);
  const number=(value,digits=1)=>Number.isFinite(Number(value))?Number(value).toFixed(digits):"UNAVAILABLE";
  const list=value=>Array.isArray(value)?value.length?value.join("; "):"NONE":"UNAVAILABLE";
  const namedScores=value=>{
    const entries=Object.entries(value||{});
    return entries.length?entries.map(([name,score])=>`${name}: ${number(score,0)}`).join("; "):"UNAVAILABLE";
  };
  const zone=value=>value&&Number.isFinite(Number(value.low))&&Number.isFinite(Number(value.high))?`${number(value.low,6)} - ${number(value.high,6)}`:"UNAVAILABLE";
  const price=value=>number(value,6);
  const truth=value=>value===true?"YES":value===false?"NO":"UNAVAILABLE";
  const section=(label,lines)=>[label,...lines].join("\n");
  const quality=(label,grade,score,reasons)=>`${label}: ${unavailable(grade)} / ${number(score,0)} | ${reasons}`;
  const rewardRisk=diagnostics=>diagnostics.rewardRiskStatus==="INVALID"||diagnostics.remainingRewardRisk==="INVALID"?"INVALID":number(diagnostics.remainingRewardRisk,2);

  build.bindSignalTooltipLifecycle=function bindSignalTooltipLifecycle({control,listen,show,hide}){
    if(!control||typeof listen!=="function")return null;
    control.removeAttribute("title");
    const enter=()=>show();
    const leave=()=>hide();
    const dismiss=()=>hide();
    listen(control,"mouseenter",enter);
    listen(control,"mouseleave",leave);
    listen(control,"blur",dismiss);
    listen(control,"pointerdown",dismiss);
    return Object.freeze({enter,leave,dismiss});
  };

  function signalB(output,displayed,horizonLabel){
    const diagnostics=output.comparisonDiagnostics||{},setup=diagnostics.setupEvidence||{},trigger=diagnostics.triggerEvidence||{},entry=diagnostics.entryCondition||{},data=diagnostics.data||{},decision=output.decision||{};
    const setupReasons=namedScores(diagnostics.setupBreakdown),triggerReasons=namedScores(diagnostics.triggerBreakdown),currentReasons=namedScores(diagnostics.currentEntryBreakdown);
    const supporting=list(diagnostics.supportingEvidence||output.triggerEvidence||output.reasons),opposing=list([...(diagnostics.opposingAutomaticEvidence||[]),...(diagnostics.effectiveOppositionEvidence||[])]);
    return [
      section("HEADER",[
        `Signal B \u2014 Refined Blend \u00b7 ${unavailable(output.engineVersion)}`,
        `Mode: ${unavailable(displayed.mode)} | Evaluated: ${unavailable(displayed.evaluatedDirection||displayed.direction)} | Horizon: ${unavailable(horizonLabel)}`,
        `State: ${unavailable(displayed.visibleState)} | Confidence/alignment: ${number(displayed.confidence,0)}`,
        `Readiness score: ${number(diagnostics.readinessScore,0)}`,
        `Publication generation: ${unavailable(displayed.publicationGeneration)}`
      ]),
      section("QUALITY",[
        quality("Setup Quality",displayed.setupQuality,diagnostics.setupScore,setupReasons),
        quality("Trigger Quality",displayed.triggerQuality,diagnostics.triggerScore,triggerReasons),
        quality("Current Entry Quality",displayed.currentEntryQuality,diagnostics.currentEntryScore,currentReasons)
      ]),
      section("SETUP EVIDENCE",[
        `Location/structure: ${setup.family?`${setup.family} on ${unavailable(setup.timeframe)}; level ${price(setup.level)}; zone ${zone(setup.zone)}`:"UNAVAILABLE"}`,
        `Regime/timeframe alignment: ${unavailable(setup.regimeAlignment)} | ${namedScores(diagnostics.directionalPermissionBreakdown)}`,
        `Active MA/level event: ${unavailable(setup.event)}`,
        `Invalidation: ${price(setup.invalidation)} | Target: ${setup.targetAvailable===false?"UNAVAILABLE":price(setup.target)} (${unavailable(setup.targetTimeframe)})`,
        `Volatility suitability: ${number(diagnostics.setupBreakdown&&diagnostics.setupBreakdown.volatilitySuitability,0)} | ${unavailable(diagnostics.volatilityRegime)}`
      ]),
      section("TRIGGER EVIDENCE",[
        `Post-interaction structure shift: ${truth(trigger.microstructureShift)}`,
        `Reaction/displacement: ${truth(trigger.reactionConfirmed)} / ${number(trigger.displacementQuality,0)}`,
        `Directional flow effectiveness: ${truth(trigger.flowEffective)} | ${list(trigger.flowEvidence)}`,
        `Participation/persistence: ${unavailable(diagnostics.participationState)} / ${number(trigger.participationPersistence,2)}`,
        `Retest / qualified follow-through: ${truth(trigger.retestHeld)} / ${truth(trigger.qualifiedFollowThrough)}`
      ]),
      section("ENTRY CONDITION",[
        `Trigger level / zone: ${price(entry.triggerLevel)} / ${zone(entry.zone)}`,
        `Current price: ${price(entry.currentPrice)} | Relative to trigger: ${unavailable(entry.currentRelative)}`,
        `Chase distance: ${number(diagnostics.chaseDistanceAtr,2)} ATR`,
        `Invalidation: ${price(entry.invalidation)}`,
        `Target: ${price(entry.target)} (${unavailable(entry.targetTimeframe)}) | Estimated net RR: ${rewardRisk(diagnostics)}`,
        `Volatility/participation persistence: ${unavailable(diagnostics.volatilityRegime)} / ${unavailable(diagnostics.participationState)}`
      ]),
      section("DECISION",[
        `Passed activation gates: ${list(diagnostics.hardGates&&diagnostics.hardGates.passed)}`,
        `Failed or pending gates: ${list([...(diagnostics.hardGates&&diagnostics.hardGates.failed||[]),...(diagnostics.hardGates&&diagnostics.hardGates.pending||[])])}`,
        `Supporting evidence: ${supporting}`,
        `Opposing evidence: ${opposing}`,
        `Exact state reason: ${unavailable(diagnostics.finalStateReason||decision.reason)}`
      ]),
      section("DATA",[
        `Timeframes used: ${list(data.timeframesUsed)}`,
        `Freshness/data age: ${unavailable(data.freshness)} / ${data.ageMs==null?"UNAVAILABLE":`${Math.max(0,Math.round(Number(data.ageMs)/1000))}s`}`,
        `Missing or unavailable: ${list(data.missing)}`
      ])
    ].join("\n\n");
  }

  const phaseFreshness=phase=>!phase?"UNAVAILABLE":phase.available===false?"UNAVAILABLE":phase.stale===true?"STALE":Number.isFinite(Number(phase.eventAgeBars))?`${Number(phase.eventAgeBars)} bars old`:"UNAVAILABLE";
  const phaseLine=(label,phase)=>`${label}: ${phase?`${unavailable(phase.phase)} / ${unavailable(phase.direction)} / ${phaseFreshness(phase)}`:"UNAVAILABLE"}`;
  function signalC(output,displayed,horizonLabel){
    const diagnostics=output.comparisonDiagnostics||{},model=diagnostics.signalC||{},phases=model.timeframes||{},core=phases["15m"]||{},sync=model.synchronization||{},forecast=model.crossForecast||null,flow=diagnostics.flowEffectiveness||{},secondary=model.secondary||{};
    const forecastLines=forecast?[
      `Possible cross: ${unavailable(forecast.direction)}; remains intrabar/unconfirmed`,
      `Required 15m candle-close price: ${forecast.direction==="SHORT"?"<=":">="} ${price(forecast.requiredClose)}`,
      `Current price: ${price(forecast.currentPrice)} | Threshold met intrabar: ${truth(forecast.thresholdMet)}`,
      `Distance: ${price(forecast.distancePrice)} / ${number(forecast.distanceBps,1)} bps / ${number(forecast.distanceAtr,2)} ATR`,
      `Time remaining: ${forecast.timeRemainingMs==null?"UNAVAILABLE":`${Math.ceil(Number(forecast.timeRemainingMs)/1000)}s`}`,
      `Cross-likelihood estimate (uncalibrated, not guaranteed): ${number(forecast.likelihoodScore,0)}/100`
    ]:["Possible cross: UNAVAILABLE","Required 15m candle-close price: UNAVAILABLE","Current price / distance / time remaining: UNAVAILABLE","Cross-likelihood estimate: UNAVAILABLE"];
    return [
      section("HEADER",[
        `Signal C \u2014 9/55 \u00b7 ${unavailable(output.engineVersion)}`,
        `Mode: ${unavailable(displayed.mode)} | Evaluated: ${unavailable(displayed.evaluatedDirection||displayed.direction)} | Horizon: ${unavailable(horizonLabel)}`,
        `State: ${unavailable(displayed.visibleState)} | Overall alignment/confidence: ${number(displayed.confidence,0)}`,
        `Publication generation: ${unavailable(displayed.publicationGeneration)}`
      ]),
      section("CORE 15M EVENT",[
        `Authoritative phase/classification: ${unavailable(model.authoritativePhase||core.phase)}`,
        `EMA9 / EMA55: ${price(core.ema9)} / ${price(core.ema55)}`,
        `Gap / normalized gap: ${number(core.gap,6)} / ${number(core.normalizedDistance,3)} ATR`,
        `Gap contraction/expansion: ${core.gapVelocity==null?"UNAVAILABLE":Number(core.gapVelocity)>0?`CONTRACTING (${number(core.gapVelocity,6)})`:`EXPANDING (${number(core.gapVelocity,6)})`}`,
        `EMA9 slope/angular momentum: ${number(core.fastSlope,6)} / acceleration ${number(core.fastAcceleration,6)}`,
        `EMA55 slope: ${number(core.slowSlope,6)} / ${core.slowMeaningfullySloped===true?"MEANINGFULLY SLOPED":core.slowMeaningfullySloped===false?"FLAT":"UNAVAILABLE"}`,
        `Event age/freshness: ${phaseFreshness(core)}`
      ]),
      section("TIMEFRAME SYNCHRONIZATION",[
        phaseLine("5m early warning",phases["5m"]),phaseLine("15m authoritative",core),phaseLine("30m intermediate",phases["30m"]),phaseLine("1h broad",phases["1h"]),
        `Overall: ${number(sync.score,0)} / direction ${unavailable(displayed.evaluatedDirection||displayed.direction)} / aligned ${unavailable(sync.alignedCount)}`,
        `Synchronization support/opposition: ${list(sync.supporting)} / ${list(sync.opposing)}`
      ]),
      section("CROSS FORECAST, WHEN APPLICABLE",forecastLines),
      section("CONFIRMATION/BACKDROP",[
        `Volume effectiveness: ${truth(flow.effective)} | score ${number(flow.score,0)}`,
        `Participation: ${unavailable(diagnostics.participationState)} | ratio ${number(flow.participationRatio,2)}x`,
        `Spread/range behaviour: ${number(flow.rangeRatio,2)} ATR | uncontrolled ${truth(flow.uncontrolled)}`,
        `Absorption/rejection: ${truth(flow.absorption)} | ${list(flow.evidence)}`,
        `Secondary EMA/VWAP/structure support: ${list(secondary.supporting)}`,
        `Opposing evidence: ${list(model.opposing)}`,
        `Invalidation: ${price(model.invalidation)}`,
        `NO CHASE: ${model.noChase===true?unavailable(diagnostics.finalStateReason):"NOT ACTIVE"}`
      ]),
      section("DATA",[
        `5m freshness: ${phaseFreshness(phases["5m"])}`,
        `15m freshness: ${phaseFreshness(core)}`,
        `30m freshness: ${phaseFreshness(phases["30m"])}`,
        `1h freshness: ${phaseFreshness(phases["1h"])}`,
        `Missing inputs: ${list(["5m","15m","30m","1h"].filter(tf=>!phases[tf]||phases[tf].available===false))}`
      ])
    ].join("\n\n");
  }

  build.createSignalDiagnosticsTooltip=function createSignalDiagnosticsTooltip(output,displayed,horizonLabel){
    if(output&&output.engineId==="B")return signalB(output,displayed,horizonLabel);
    if(output&&output.engineId==="C")return signalC(output,displayed,horizonLabel);
    return "Signal details unavailable";
  };
})();
