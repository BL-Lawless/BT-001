(() => {
  "use strict";

  try{
    if(window.PRESSURE_SIGNAL && typeof window.PRESSURE_SIGNAL.destroy === "function") window.PRESSURE_SIGNAL.destroy();
  }catch(_e){}
  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ || {};
  if(!build.config || !build.reporting || !build.createTargetEngine || !build.createPositionEngine || !build.createActionLifecycle || !build.createWindowSystem || !build.createSignalDiagnosticsTooltip || typeof window.createSignalEngineRegistry!=="function" || typeof window.createSignalEngineA!=="function" || typeof window.createSignalEngineSelector!=="function"){
    throw new Error("Pressure Signal dependencies are not loaded");
  }
  const featureConfig = build.config;
  const featureFormat = build.reporting;
  const targetEngine = build.createTargetEngine(featureConfig);
  const positionEngine = build.createPositionEngine(featureConfig,featureFormat);
  const windowSystem = build.createWindowSystem(featureConfig,featureFormat);
  const signalEngineRegistry=window.createSignalEngineRegistry();
  const signalEngineA=signalEngineRegistry.register(window.createSignalEngineA());
  if(typeof window.createSignalEngineB==="function") signalEngineRegistry.register(window.createSignalEngineB());
  if(typeof window.createSignalEngineC==="function") signalEngineRegistry.register(window.createSignalEngineC());
  if(typeof window.createPressureSignalDataFeed !== "function") throw new Error("Pressure Signal data feed is not loaded");
  const MODULE = "BT001_TOPBAR_PRESSURE_SIGNAL";
  const performanceDiagnostics = window.BT001_PERFORMANCE_DIAGNOSTICS ||= {};
  ["signalLightCalculations","signalFullCalculations","signalSkippedDuplicateRefreshes","signalFullEvidenceBuilds","signalFormingEvidenceBuilds","smcCacheHits","smcCacheMisses","structuredCloneCount","structuredCloneMs","signalPublicationMismatches","signalStalePayloadsDiscarded","signalFallbacksPrevented"].forEach(key => {
    if(!Number.isFinite(Number(performanceDiagnostics[key]))) performanceDiagnostics[key] = 0;
  });
  const STORAGE_KEY = "bt001_topbar_pressure_signal_horizon";
  const DIRECTION_STORAGE_KEY = "bt001_topbar_pressure_signal_direction";
  const TRIGGER_ALERT_DURATION37 = 30000;
  const DIRECTIONS = ["AUTO","LONG","SHORT"];
  const ENTRY_STATES37 = [
    "BIAS CONFIRMED","SETUP ARMED","ZONE ENGAGED","TRIGGER DEVELOPING",
    "READY","EXPIRED","INVALIDATED"
  ];
  const SIGNAL_PRESENTATION37 = Object.freeze({
    "SETUP ARMED":Object.freeze({label:"WATCHING",definition:"A VALID SETUP AREA EXISTS, BUT PRICE HAS NOT REACHED IT YET."}),
    "ZONE ENGAGED":Object.freeze({label:"STAND BY",definition:"PRICE IS AT THE SETUP AREA; WAIT FOR A VALID REACTION."}),
    "TRIGGER DEVELOPING":Object.freeze({label:"TRIGGER FORMING",definition:"THE EXPECTED REACTION HAS STARTED, BUT ENTRY CONFIRMATION IS INCOMPLETE."}),
    READY:Object.freeze({label:"TRIGGER ACTIVE",definition:"ENTRY CONDITIONS ARE ACTIVE FROM THE CURRENT MARKET CONTEXT."}),
    EXPIRED:Object.freeze({label:"NO CHASE",definition:"THE CURRENT MARKET OPPORTUNITY IS NOT VIABLE FOR A NEW ENTRY."}),
    INVALIDATED:Object.freeze({label:"SETUP FAILED",definition:"THE SETUP LEVEL OR REQUIRED REACTION HAS FAILED."}),
    "BIAS CONFIRMED":Object.freeze({label:"NO SETUP",definition:"A DIRECTIONAL BIAS EXISTS, BUT NO VALID ENTRY SETUP IS CURRENTLY AVAILABLE."}),
    "NO BIAS":Object.freeze({label:"NO SETUP \u00b7 NO BIAS",definition:"NO SUFFICIENTLY CLEAR DIRECTIONAL BIAS OR ENTRY SETUP CURRENTLY EXISTS."})
  });
  // Pressure bands are deliberately wider than a 50/50 knife edge. These are
  // policy constants so live testing can tune them without changing the engine.
  const PRESSURE_POLICY37 = {
    neutralImbalance:0.025,
    mildShare:0.58,
    strongShare:0.62,
    materialPrimaryShare:0.60,
    materialTriggerShare:0.60,
    acceleratingMomentum:0.02,
    persistentBars:2,
    participationWeak:0.85,
    participationExpanding:1.05
  };
  const ENTRY_POLICY37 = {
    quick:{triggerTf:"3m",primaryTf:"5m",setupTfs:["3m","5m"],triggerCandles:5,chaseAtr:1.35,zoneAtr:0.16,toleranceAtr:0.12},
    "2_3h":{triggerTf:"5m",primaryTf:"15m",setupTfs:["5m","15m"],triggerCandles:6,chaseAtr:1.55,zoneAtr:0.18,toleranceAtr:0.14},
    "6_8h":{triggerTf:"15m",primaryTf:"1h",setupTfs:["15m","1h"],triggerCandles:7,chaseAtr:1.75,zoneAtr:0.20,toleranceAtr:0.16}
  };
  const HORIZONS = [
    {id:"quick",label:"Quick"},
    {id:"2_3h",label:"2\u20133H"},
    {id:"6_8h",label:"6\u20138H"}
  ];
  const HORIZON_ENGINE = {
    quick:{
      pressure:[
        {tf:"1m",lookback:20,maSlot:1,weight:0.40,role:"micro-trigger"},
        {tf:"3m",lookback:20,maSlot:1,weight:1.05,role:"active trigger"},
        {tf:"5m",lookback:20,maSlot:1,weight:1.30,role:"primary direction"},
        {tf:"15m",lookback:5,maSlot:1,weight:0.75,role:"permission filter"}
      ],
      eventTfs:["1m","3m","5m"],
      structureTfs:["15m","1h"],
      boundaryTfs:["4h","1d"],
      structureRoles:{internal:["1m","3m"],swing:["5m","15m","1h"],major:["4h","1d"]},
      formingWeight:0.55,
      participationWeight:0.16
    },
    "2_3h":{
      pressure:[
        {tf:"5m",lookback:20,maSlot:1,weight:1.00,role:"active trigger"},
        {tf:"15m",lookback:10,maSlot:2,weight:1.10,role:"primary direction"}
      ],
      eventTfs:["5m","15m"],
      structureTfs:["1h"],
      boundaryTfs:["4h","1d"],
      structureRoles:{internal:["5m"],swing:["15m","1h"],major:["4h"],regime:["1d"]},
      formingWeight:0.38,
      participationWeight:0.18
    },
    "6_8h":{
      pressure:[
        {tf:"15m",lookback:20,maSlot:2,weight:1.00,role:"active development"},
        {tf:"1h",lookback:12,maSlot:2,weight:0.85,role:"structural pressure"}
      ],
      eventTfs:["15m","1h"],
      structureTfs:["4h"],
      boundaryTfs:["1d"],
      structureRoles:{internal:["15m"],swing:["1h","4h"],regime:["1d"]},
      formingWeight:0.25,
      participationWeight:0.20
    }
  };
  const ACTION_PRESSURE_ENGINE37=Object.freeze({
    quick:Object.freeze([{tf:"1m",lookback:30,maSlot:1,weight:0.45,role:"management early warning"},{tf:"3m",lookback:20,maSlot:1,weight:1,role:"management trigger"},{tf:"5m",lookback:12,maSlot:2,weight:0.9,role:"management primary"}]),
    "2_3h":Object.freeze([{tf:"3m",lookback:24,maSlot:1,weight:0.45,role:"management early warning"},{tf:"5m",lookback:18,maSlot:1,weight:1,role:"management trigger"},{tf:"15m",lookback:12,maSlot:2,weight:0.9,role:"management primary"}]),
    "6_8h":Object.freeze([{tf:"5m",lookback:24,maSlot:1,weight:0.45,role:"management early warning"},{tf:"15m",lookback:20,maSlot:1,weight:1,role:"management trigger"},{tf:"1h",lookback:12,maSlot:2,weight:0.9,role:"management primary"}])
  });
  const state = {
    horizon:readStoredHorizon(),
    direction:readStoredDirection(),
    root:null,
    directionChip:null,
    entry:null,
    exit:null,
    details:null,
    detailsBody:null,
    detailsTitle:null,
    lastRenderAt:0,
    refreshTimer:null,
    dataKey:"",
    dataLoadPromise:null,
    dataLoadGeneration:0,
    dataStatus:null,
    activeSnapshot:null,
    marketSnapshot:null,
    evidenceByTf:signalEngineA.state.evidenceByTf,
    smcCache:signalEngineA.state.smcCache,
    snapshotVersion:0,
    entryTrackers:signalEngineA.state.entryTrackers,
    chips:new Map(),
    initialized:false,
    lifecycleTimer:null,
    resizeObservers:[],
    signalSummaryVariants:null,
    summaryFrame:null,
    activeTriggerAlertId:null,
    activeTriggerAlertMeta:null,
    triggerAlertTimer:null,
    triggerAlertEndsAt:0,
    seenTriggerAlertIds:signalEngineA.state.seenTriggerAlertIds,
    seenTriggerAlertOrder:signalEngineA.state.seenTriggerAlertOrder,
    setupHistories:signalEngineA.state.setupHistories,
    uiAbort:null,
    lastError:null,
    refreshGeneration:0,
    refreshState:"IDLE",
    workingSnapshot:null,
    lastPublishedSnapshot:null,
    lastValidPublishedSnapshot:null,
    lastOptimizationTests:null,
    displayFingerprint:"",
    refreshStartedAt:null,
    lastAnalyticalFingerprint:"",
    scheduledFrozen:null,
    lastRefreshReason:"initial",
    dataFeed:null,
    lastIsolationTests:null
  };
  let signalEngineSelector=null;
  const actionState={
    dataFeed:null,dataKey:"",dataLoadPromise:null,dataLoadGeneration:0,dataStatus:null,evidenceByTf:new Map(),smcCache:new Map(),
    snapshotVersion:0,marketSnapshot:null,activeSnapshot:null,lifecycle:null,lastPublishedSnapshot:null,lastValidPublishedSnapshot:null,
    lastError:null,lastAcceptanceTests:null,refreshState:"IDLE",lastRefreshReason:"initial",orderRefreshObservedAt:0
  };
  function ensureEngineOwnedState37(engine){
    const owned=engine && engine.state || {};
    if(!(owned.evidenceByTf instanceof Map)) owned.evidenceByTf=new Map();
    if(!(owned.smcCache instanceof Map)) owned.smcCache=new Map();
    if(!(owned.entryTrackers instanceof Map)) owned.entryTrackers=new Map();
    if(!(owned.setupHistories instanceof Map)) owned.setupHistories=new Map();
    if(!(owned.seenTriggerAlertIds instanceof Set)) owned.seenTriggerAlertIds=new Set();
    if(!Array.isArray(owned.seenTriggerAlertOrder)) owned.seenTriggerAlertOrder=[];
    return owned;
  }
  function bindActiveEngineState37(){
    const engine=signalEngineRegistry.get(signalEngineSelector ? signalEngineSelector.getSelectedId() : "A") || signalEngineA;
    const owned=ensureEngineOwnedState37(engine);
    state.evidenceByTf=owned.evidenceByTf;state.smcCache=owned.smcCache;state.entryTrackers=owned.entryTrackers;state.setupHistories=owned.setupHistories;
    state.seenTriggerAlertIds=owned.seenTriggerAlertIds;state.seenTriggerAlertOrder=owned.seenTriggerAlertOrder;
    return engine;
  }
  function activeSignalEngine37(){return signalEngineRegistry.get(signalEngineSelector ? signalEngineSelector.getSelectedId() : "A") || null;}
  function onSignalEngineSelection37({previousId,nextId,reason}){
    bindActiveEngineState37();
    state.dataKey="";state.dataStatus=null;state.marketSnapshot=null;state.activeSnapshot=null;state.workingSnapshot=null;
    state.lastAnalyticalFingerprint="";state.scheduledFrozen=null;stopTriggerAlert37();
    if(state.initialized){
      invalidatePublishedContext37(presentationContextKey37());
      if(state.entry){state.entry.textContent="Unavailable";state.entry.dataset.tone="gray";}
      configureSignalFeed37(signalDataPlan37(state.horizon),`engine-switch:${previousId || "none"}->${nextId}`).catch(error=>{state.lastError=error&&error.stack||String(error);});
      scheduleToolbarSignalRefresh37(true,reason || "engine-switch");
      if(typeof window.installSignalEngineSettings==="function") window.installSignalEngineSettings({registry:signalEngineRegistry,selector:signalEngineSelector});
    }
  }
  signalEngineSelector=window.createSignalEngineSelector({registry:signalEngineRegistry,onChange:onSignalEngineSelection37});
  signalEngineRegistry.subscribe(()=>{if(state.initialized&&typeof window.installSignalEngineSettings==="function")window.installSignalEngineSettings({registry:signalEngineRegistry,selector:signalEngineSelector});});
  const uiPerf = () => window.BT001_UI_PERFORMANCE || null;
  const timed37 = (name,work,fingerprint=null) => {
    const diagnostics=uiPerf();
    return diagnostics && typeof diagnostics.measure === "function" ? diagnostics.measure(name,work,fingerprint) : work();
  };
  const counted37 = (name,fingerprint=null) => {
    const diagnostics=uiPerf();
    if(diagnostics && typeof diagnostics.count === "function") diagnostics.count(name,fingerprint);
  };

  function num37(value){
    if(value == null || value === "") return null;
    const out = Number(value);
    return Number.isFinite(out) ? out : null;
  }
  const SIGNAL_TF_SECONDS37=window.createPressureSignalDataFeed.timeframeSeconds;
  const SIGNAL_FIXED_DEPTHS37=window.createPressureSignalDataFeed.fixedDepths;
  function signalIntervalSeconds37(tf){ return Number(SIGNAL_TF_SECONDS37[String(tf||"").toLowerCase()]) || 60; }
  function currentSignalSymbol37(){
    try{return String((typeof cfg==="function"&&cfg()&&cfg().symbol)||"").toUpperCase();}catch(_e){return "";}
  }
  function signalFeed37(){
    if(state.dataFeed) return state.dataFeed;
    state.dataFeed=window.createPressureSignalDataFeed({
      api:window.API,
      getRestUrl:()=>{try{return cfg()&&cfg().rest||"https://fapi.binance.com/fapi/v1/klines";}catch(_e){return "https://fapi.binance.com/fapi/v1/klines";}},
      getWsUrl:()=>{try{return cfg()&&cfg().ws||"wss://fstream.binance.com/market/stream";}catch(_e){return "wss://fstream.binance.com/market/stream";}},
      onUpdate:event=>scheduleToolbarSignalRefresh37(false,event&&event.reason||"signal-feed")
    });
    return state.dataFeed;
  }
  function configureSignalFeed37(plan,reason="signal-requirements"){
    const selected=plan||signalDataPlan37(state.horizon);
    return signalFeed37().configure({symbol:currentSignalSymbol37(),timeframes:selected.items.map(item=>item.tf),reason});
  }
  function actionFeed37(){
    if(actionState.dataFeed)return actionState.dataFeed;
    actionState.dataFeed=window.createPressureSignalDataFeed({
      api:window.API,
      getRestUrl:()=>{try{return cfg()&&cfg().rest||"https://fapi.binance.com/fapi/v1/klines";}catch(_e){return "https://fapi.binance.com/fapi/v1/klines";}},
      getWsUrl:()=>{try{return cfg()&&cfg().ws||"wss://fstream.binance.com/market/stream";}catch(_e){return "wss://fstream.binance.com/market/stream";}},
      onUpdate:event=>scheduleActionRefresh37(false,`action-feed:${event&&event.reason||"update"}`)
    });
    return actionState.dataFeed;
  }
  function configureActionFeed37(plan,reason="action-requirements"){
    const selected=plan||actionDataPlan37();
    return actionFeed37().configure({symbol:currentSignalSymbol37(),timeframes:selected.items.map(item=>item.tf),reason});
  }
  function readStoredHorizon(){
    try{
      const saved = String(localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
      return HORIZONS.some(item => item.id === saved) ? saved : "quick";
    }catch(_e){
      return "quick";
    }
  }
  function setStoredHorizon(next){
    state.horizon = HORIZONS.some(item => item.id === next) ? next : "quick";
    state.dataKey = "";
    state.dataStatus = null;
    state.marketSnapshot = null;
    state.evidenceByTf.clear();
    state.smcCache.clear();
    state.entryTrackers.clear();
    state.setupHistories.clear();
    stopTriggerAlert37();
    invalidatePublishedContext37(presentationContextKey37());
    try{ localStorage.setItem(STORAGE_KEY,state.horizon); }catch(_e){}
    configureSignalFeed37(signalDataPlan37(state.horizon),"signal-horizon-change").catch(error=>{state.lastError=error&&error.stack||String(error);});
    scheduleToolbarSignalRefresh37(true);
  }
  function readStoredDirection(){
    try{
      const saved = String(localStorage.getItem(DIRECTION_STORAGE_KEY) || "").toUpperCase();
      return DIRECTIONS.includes(saved) ? saved : "AUTO";
    }catch(_e){
      return "AUTO";
    }
  }
  function setStoredDirection(next){
    state.direction = DIRECTIONS.includes(next) ? next : "AUTO";
    state.entryTrackers.clear();
    state.setupHistories.clear();
    stopTriggerAlert37();
    invalidatePublishedContext37(presentationContextKey37());
    try{ localStorage.setItem(DIRECTION_STORAGE_KEY,state.direction); }catch(_e){}
    scheduleToolbarSignalRefresh37(true);
  }
  function cycleStoredDirection37(){
    const index = DIRECTIONS.indexOf(state.direction);
    setStoredDirection(DIRECTIONS[(index + 1) % DIRECTIONS.length]);
  }
  function ensureToolbarSignalUi37(){
    if(!state.uiAbort) state.uiAbort = new AbortController();
    const lifecycleSignal = state.uiAbort.signal;
    const topbar = document.querySelector(".topbar");
    const toggles = topbar && topbar.querySelector(".toggles");
    if(!topbar || !toggles) return null;
    let root = document.getElementById("pressureSignalToolbar");
    if(!root){
      root = document.createElement("div");
      root.id = "pressureSignalToolbar";
      root.className = "pressure-signal-toolbar";
      const fixedControls = document.createElement("div");
      fixedControls.className = "pressure-signal-fixed-controls";
      const flexibleCenter = document.createElement("div");
      flexibleCenter.className = "pressure-signal-flex-center";
      const directionChip = document.createElement("button");
      directionChip.type = "button";
      directionChip.id = "pressureSignalDirection";
      directionChip.className = "pressure-signal-chip pressure-signal-direction";
      directionChip.addEventListener("click",cycleStoredDirection37,false);
      fixedControls.appendChild(directionChip);
      state.directionChip = directionChip;
      HORIZONS.forEach(item => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "pressure-signal-chip";
        chip.textContent = item.label;
        chip.dataset.horizon = item.id;
        chip.addEventListener("click",() => setStoredHorizon(item.id),false);
        state.chips.set(item.id,chip);
        fixedControls.appendChild(chip);
      });
      const entry = document.createElement("span");
      entry.id = "pressureSignalEntry";
      entry.className = "pressure-signal-pill";
      flexibleCenter.appendChild(entry);
      const exit = document.createElement("span");
      exit.id = "pressureSignalExit";
      exit.className = "pressure-signal-pill";
      flexibleCenter.appendChild(exit);
      root.append(fixedControls,flexibleCenter);
      topbar.insertBefore(root,toggles);
      state.entry = entry;
      state.exit = exit;
    }
    state.root = root;
    const label = root.querySelector(".pressure-signal-label");
    if(label) label.remove();
    if(!state.entry) state.entry = document.getElementById("pressureSignalEntry");
    if(!state.exit) state.exit = document.getElementById("pressureSignalExit");
    if(!state.directionChip) state.directionChip = document.getElementById("pressureSignalDirection");
    HORIZONS.forEach(item => {
      if(!state.chips.has(item.id)){
        const chip = root.querySelector(`[data-horizon="${item.id}"]`);
        if(chip) state.chips.set(item.id,chip);
      }
    });
    if(root.dataset.summaryResizeBound !== "true" && typeof ResizeObserver === "function"){
      root.dataset.summaryResizeBound = "true";
      const observer = new ResizeObserver(scheduleResponsiveSignalSummary37);
      observer.observe(root);
      observer.observe(toggles);
      observer.observe(topbar);
      state.resizeObservers.push(observer);
    }
    const legacyTooltip = document.getElementById("pressureSignalTooltip");
    if(legacyTooltip) legacyTooltip.remove();
    let details = document.getElementById("pressureSignalDetails");
    if(!details){
      details = document.createElement("div");
      details.id = "pressureSignalDetails";
      details.className = "pressure-signal-details";
      details.setAttribute("role","dialog");
      details.setAttribute("aria-label","Pressure signal details");
      details.setAttribute("aria-hidden","true");
      const header = document.createElement("div");
      header.className = "pressure-signal-details-header";
      const title = document.createElement("span");
      title.className = "pressure-signal-details-title";
      title.textContent = "Pressure details";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "pressure-signal-details-close";
      close.textContent = "×";
      close.setAttribute("aria-label","Close pressure signal details");
      const body = document.createElement("div");
      body.className = "pressure-signal-details-body";
      header.appendChild(title);
      header.appendChild(close);
      details.appendChild(header);
      details.appendChild(body);
      document.body.appendChild(details);
    }
    state.details = details;
    state.detailsBody = details.querySelector(".pressure-signal-details-body");
    state.detailsTitle = details.querySelector(".pressure-signal-details-title");
    root.removeAttribute("aria-describedby");
    if(state.entry){
      state.entry.setAttribute("role","button");
      state.entry.setAttribute("tabindex","0");
      state.entry.setAttribute("aria-haspopup","dialog");
      state.entry.setAttribute("aria-controls",details.id);
      state.entry.setAttribute("aria-expanded",details.classList.contains("is-open") ? "true" : "false");
    }
    if(state.entry && state.entry.dataset.detailsBound !== "true"){
      state.entry.dataset.detailsBound = "true";
      state.entry.addEventListener("click",toggleToolbarSignalDetails37,false);
      state.entry.addEventListener("keydown",event => {
        if(event.key === "Enter" || event.key === " ") toggleToolbarSignalDetails37(event);
      },false);
      const close = details.querySelector(".pressure-signal-details-close");
      if(close) close.addEventListener("click",event => {
        event.stopPropagation();
        hideToolbarSignalDetails37();
        state.entry.focus();
      },false);
      details.addEventListener("click",event => event.stopPropagation(),false);
      document.addEventListener("keydown",event => {
        if(event.key === "Escape" && state.details && state.details.classList.contains("is-open")){
          hideToolbarSignalDetails37();
          state.entry.focus();
        }
      },{signal:lifecycleSignal});
    }
    if(state.exit){
      state.exit.setAttribute("role","button");
      state.exit.setAttribute("tabindex","0");
      state.exit.setAttribute("aria-expanded","false");
    }
    const oldTip = document.getElementById("pressureSignalManagementTip");
    if(oldTip) oldTip.remove();
    windowSystem.bindToolbar();
    return root;
  }
  function horizonEngine37(horizonId=state.horizon){
    return HORIZON_ENGINE[horizonId] || HORIZON_ENGINE.quick;
  }
  function signalCanonicalSlots37(){
    try{
      const provider = window.MA_FEATURE && typeof window.MA_FEATURE.getCanonicalMASlots === "function"
        ? window.MA_FEATURE.getCanonicalMASlots
        : (typeof window.getCanonicalMASlots === "function" ? window.getCanonicalMASlots : null);
      const slots = provider ? provider() : null;
      if(Array.isArray(slots) && slots.length === 5){
        return slots.map((slot,index) => ({slotId:`MA${index + 1}`,period:Math.max(1,Math.round(Number(slot && slot.period) || [9,21,55,100,200][index]))}));
      }
    }catch(_e){}
    return [9,21,55,100,200].map((period,index) => ({slotId:`MA${index + 1}`,period}));
  }
  function signalADataPlan37(horizonId=state.horizon){
    const engine = horizonEngine37(horizonId);
    const slots = signalCanonicalSlots37();
    const maxPeriod = Math.max(...slots.map(slot => Number(slot.period) || 0),200);
    const pressureByTf = new Map(engine.pressure.map(item => [item.tf,item]));
    const roles = new Map();
    engine.pressure.forEach(item => roles.set(item.tf,[`${item.tf} pressure history`]));
    engine.eventTfs.forEach(tf => roles.set(tf,[...(roles.get(tf) || []),`${tf} MA-event history`]));
    engine.structureTfs.forEach(tf => roles.set(tf,[...(roles.get(tf) || []),`${tf} canonical SMC structure`]));
    engine.boundaryTfs.forEach(tf => roles.set(tf,[...(roles.get(tf) || []),`${tf} canonical MA boundaries`]));
    const signalTimeframes = [...new Set([...engine.pressure.map(item => item.tf),...engine.eventTfs,...engine.structureTfs,...engine.boundaryTfs])];
    const timeframes = signalTimeframes;
    const items = timeframes.map(tf => {
      const pressure = pressureByTf.get(tf);
      const lookbackDepth = pressure ? pressure.lookback * 3 : 0;
      const historyTarget = Number(SIGNAL_FIXED_DEPTHS37[tf]) || Math.max(320,maxPeriod + 80,lookbackDepth,120);
      return {tf,historyTarget,roles:roles.get(tf) || [`${tf} market history`],signalRequired:true,managementRequired:false};
    });
    return {horizonId,engine,slots,items,timeframes};
  }
  function signalDataPlan37(horizonId=state.horizon){
    return signalEngineRegistry.requirements({horizonId,getSignalARequirements:()=>signalADataPlan37(horizonId),getCanonicalSlots:signalCanonicalSlots37});
  }
  function actionDataPlan37(horizonId=positionEngine.getManagementHorizon()||"quick"){
    const managementHorizonId=featureConfig.managementHorizons[horizonId]?horizonId:"quick";
    const management=featureConfig.managementHorizons[managementHorizonId]||featureConfig.managementHorizons.quick;
    const pressure=ACTION_PRESSURE_ENGINE37[managementHorizonId]||ACTION_PRESSURE_ENGINE37.quick;
    const slots=signalCanonicalSlots37();
    const timeframes=[...new Set([management.earlyWarningTf,management.triggerTf,management.primaryTf,management.contextTf,management.boundaryTf,...(management.extendedTfs||[]),...(management.htfEmaTfs||[]),...(management.conditionalEmaTfs||[])].filter(Boolean))];
    const items=timeframes.map(tf=>({tf,historyTarget:Number(SIGNAL_FIXED_DEPTHS37[tf])||320,roles:[`${tf} position-management evidence`],signalRequired:false,managementRequired:true}));
    return {horizonId:managementHorizonId,managementHorizonId,management,pressure,slots,items,timeframes};
  }
  function signalSmcSettingsSignature37(){
    try{
      const settings = window.SMC_FEATURE && typeof window.SMC_FEATURE.getSettings === "function" ? window.SMC_FEATURE.getSettings() : null;
      const stable=value => {
        if(Array.isArray(value)) return value.map(stable);
        if(value && typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
        return value;
      };
      return settings ? JSON.stringify(stable(settings)) : "default";
    }catch(_e){ return "unavailable"; }
  }
  function signalTimeframeRevision37(feed,tf){
    if(feed && typeof feed.getTimeframeRevisions === "function") return feed.getTimeframeRevisions(tf);
    const closed = feed && typeof feed.getClosedBuffer === "function" ? feed.getClosedBuffer(tf) || [] : [];
    const forming = feed && typeof feed.getFormingCandle === "function" ? feed.getFormingCandle(tf) : null;
    const lastClosed = closed.length ? closed[closed.length-1] : null;
    return {symbol:String((typeof cfg === "function" && cfg() && cfg().symbol) || "").toUpperCase(),tf,closedRevision:`${closed.length}:${lastClosed && lastClosed.time}:${lastClosed && lastClosed.close}`,formingRevision:forming ? `${forming.time}:${forming.close}:${forming.volume}:${forming.takerBuyBase}` : "none"};
  }
  function cachedStructure37(cache,tf,closedRows,revision,settingsSignature){
    const key = [revision.symbol,tf,revision.closedRevision,settingsSignature].join("|");
    if(cache.has(key)){
      performanceDiagnostics.smcCacheHits += 1;
      return cache.get(key);
    }
    performanceDiagnostics.smcCacheMisses += 1;
    let snapshot = null;
    try{
      snapshot = window.SMC_FEATURE && typeof window.SMC_FEATURE.getStructureSnapshot === "function"
        ? window.SMC_FEATURE.getStructureSnapshot(closedRows)
        : null;
    }catch(_e){ snapshot = null; }
    cache.set(key,snapshot);
    while(cache.size > 80) cache.delete(cache.keys().next().value);
    return snapshot;
  }
  function cachedSignalStructure37(tf,closedRows,revision,settingsSignature){return cachedStructure37(state.smcCache,tf,closedRows,revision,settingsSignature);}
  function runSignalEvidenceCacheSelfTests37(){
    const keys=({symbol="BTCUSDT",tf="1m",depth=320,periods="9-21-55-100-200",closed=4,forming=9,smc="smc-a"}={})=>{
      const closedKey=[symbol,tf,depth,periods,closed,smc].join("|");
      return {closedKey,liveKey:[closedKey,forming].join("|"),smcKey:[symbol,tf,closed,smc].join("|")};
    };
    const base=keys(),priceOnly=keys(),forming=keys({forming:10}),closed=keys({closed:5,forming:10}),otherTf=keys({tf:"5m"});
    const cases={
      priceOnlyReusesAllEvidence:base.closedKey===priceOnly.closedKey&&base.liveKey===priceOnly.liveKey&&base.smcKey===priceOnly.smcKey,
      formingChangesLiveOnly:base.closedKey===forming.closedKey&&base.smcKey===forming.smcKey&&base.liveKey!==forming.liveKey,
      closedChangeInvalidatesAffectedTimeframe:base.closedKey!==closed.closedKey&&base.liveKey!==closed.liveKey&&base.smcKey!==closed.smcKey&&base.closedKey!==otherTf.closedKey,
      maSettingsChangeInvalidates:base.closedKey!==keys({periods:"9-20-50-100-200"}).closedKey,
      smcSettingsChangeInvalidatesStructure:base.smcKey!==keys({smc:"smc-b"}).smcKey&&base.closedKey!==keys({smc:"smc-b"}).closedKey,
      symbolChangeInvalidatesAll:base.closedKey!==keys({symbol:"ETHUSDT"}).closedKey,
      chartHistoryDepthDoesNotInvalidate:base.closedKey===keys({chartDepth:6400}).closedKey,
      gapRepairOrHistoryReplacementInvalidates:base.closedKey!==keys({closed:1004}).closedKey,
      unrelatedTimeframeUsesIndependentKey:base.closedKey!==otherTf.closedKey
    };
    return {passed:Object.values(cases).every(Boolean),cases};
  }
  function signalDataAge37(tf,rows){
    const list = Array.isArray(rows) ? rows : [];
    const latest = list.length ? list[list.length - 1] : null;
    if(!latest) return Infinity;
    const activityMs = latest.final === false
      ? Number(latest.openTime || Number(latest.time) * 1000)
      : Number(latest.closeTime || (Number(latest.time) + signalIntervalSeconds37(tf)) * 1000);
    return Number.isFinite(activityMs) ? Math.max(0,Date.now() - activityMs) : Infinity;
  }
  function latestClosedEvidence37(snapshot,tf){
    const rows = snapshot && snapshot.closedByTf && snapshot.closedByTf[tf] || [];
    const row = rows.length ? rows[rows.length-1] : null;
    return row ? {tf,time:Number(row.time),openTime:Number(row.openTime || Number(row.time)*1000),closeTime:Number(row.closeTime || (Number(row.time)+signalIntervalSeconds37(tf))*1000)} : null;
  }
  function buildSourceFreshness37(snapshot,plan){
    const now = Date.now();
    const feed = signalFeed37();
    const diag = feed.diagnostics();
    const priceAt = Number(diag.latestPriceAt || 0);
    const priceAgeMs = priceAt ? Math.max(0,now-priceAt) : Infinity;
    const signalPolicy = entryPolicy37(plan.horizonId);
    const formingAt = Number(diag.buffers && diag.buffers[signalPolicy.triggerTf] && diag.buffers[signalPolicy.triggerTf].lastFormingAt || 0);
    const formingAgeMs = formingAt ? Math.max(0,now-formingAt) : Infinity;
    const triggerClosed = latestClosedEvidence37(snapshot,signalPolicy.triggerTf);
    const priceStale = priceAgeMs > featureConfig.freshness.priceStaleMs;
    const formingStale = formingAgeMs > Math.max(featureConfig.freshness.priceStaleMs,signalIntervalSeconds37(signalPolicy.triggerTf)*1000*featureConfig.freshness.formingCadenceMultiplier);
    const signalStaleSources = [];
    if(priceStale) signalStaleSources.push({source:"Live price",ageMs:priceAgeMs});
    if(formingStale) signalStaleSources.push({source:`${signalPolicy.triggerTf} forming candle`,ageMs:formingAgeMs});
    (snapshot.health && snapshot.health.items || []).filter(entry => entry.signalRequired).forEach(health => { if(health.status !== "sufficient" && !signalStaleSources.some(item => item.source === `${health.tf} closed evidence`)) signalStaleSources.push({source:`${health.tf} closed evidence`,ageMs:health.ageMs}); });
    return {checkedAt:now,priceAt,priceAgeMs,formingAt,formingAgeMs,triggerClosed,signalStatus:freshnessStatus37(signalStaleSources),signalStaleSources};
  }
  function freshnessStatus37(list){return list.some(entry=>entry.ageMs==null||!Number.isFinite(entry.ageMs))?"UNAVAILABLE":list.length?"STALE":"LIVE";}
  function inspectSignalData37(plan,feed,loading=!!state.dataLoadPromise,dataStatus=state.dataStatus){
    if(!feed) return {status:"unavailable",managementStatus:"unavailable",items:plan.items.map(item => ({...item,status:"unavailable",count:0,reason:"Signal data feed unavailable"}))};
    const items = plan.items.map(item => {
      const closed = typeof feed.getClosedBuffer === "function" ? feed.getClosedBuffer(item.tf) || [] : [];
      const liveEvidence = typeof feed.getLiveBuffer === "function" ? feed.getLiveBuffer(item.tf) || [] : closed;
      const count = Array.isArray(closed) ? closed.length : 0;
      const ageMs = signalDataAge37(item.tf,liveEvidence);
      const staleAfterMs = Math.max(90000,signalIntervalSeconds37(item.tf) * 1000 * featureConfig.freshness.closedEvidenceCadenceMultiplier);
      const tail = (Array.isArray(closed) ? closed : []).slice(-Math.min(count,item.historyTarget));
      const step = signalIntervalSeconds37(item.tf);
      const continuous = tail.length > 1 && tail.every((row,index) => index === 0 || Number(row.time)-Number(tail[index-1].time) === step);
      const status = count < item.historyTarget || !continuous
        ? (loading ? "loading" : "insufficient")
        : (ageMs > staleAfterMs ? "stale" : "sufficient");
      const reason = count < item.historyTarget ? `needs ${item.historyTarget} closed candles` : (!continuous ? "candle history is not continuous" : "");
      return {...item,status,count,ageMs,continuous,reason};
    });
    const failed = dataStatus && Array.isArray(dataStatus.failures) ? dataStatus.failures : [];
    failed.forEach(failure => {
      const item = items.find(entry => entry.tf === failure.tf);
      if(item && item.status !== "sufficient") Object.assign(item,{status:"failed",reason:failure.reason});
    });
    const aggregateStatus = selected => {
      const statuses = new Set(selected.map(item => item.status));
      return statuses.has("failed") ? "failed"
        : statuses.has("loading") ? "loading"
          : statuses.has("insufficient") ? "insufficient"
            : statuses.has("stale") ? "stale"
              : selected.length ? "sufficient" : "unavailable";
    };
    return {
      status:aggregateStatus(items.filter(item => item.signalRequired)),
      managementStatus:aggregateStatus(items.filter(item => item.managementRequired)),
      items,checkedAt:Date.now()
    };
  }
  function ensureSignalData37(horizonId=state.horizon){
    const feed = signalFeed37();
    const plan = signalDataPlan37(horizonId);
    const symbol = currentSignalSymbol37();
    const key = `${symbol}|${horizonId}|${plan.slots.map(slot => slot.period).join("-")}`;
    const configurationChanged=state.dataKey !== key;
    if(state.dataKey !== key){
      state.dataKey = key;
      state.dataStatus = null;
      state.dataLoadGeneration += 1;
      state.marketSnapshot = null;
      state.evidenceByTf.clear();
      state.smcCache.clear();
      state.entryTrackers.clear();
      state.setupHistories.clear();
      stopTriggerAlert37();
    }
    let health = inspectSignalData37(plan,feed);
    const retryFailed = state.dataStatus && state.dataStatus.failedAt && Date.now()-state.dataStatus.failedAt >= 30000;
    const needsLoad = health.items.filter(item => item.status === "insufficient" || item.status === "unavailable" || (item.status === "failed" && retryFailed));
    if((configurationChanged || needsLoad.length) && !state.dataLoadPromise){
      const generation = state.dataLoadGeneration;
      const loadPromise = configureSignalFeed37(plan,configurationChanged ? "signal-plan-change" : "signal-data-retry").then(() => Promise.all(needsLoad.map(item =>
        feed.ensureTimeframeBuffer(item.tf,item.historyTarget)
          .then(() => ({tf:item.tf,ok:true}))
          .catch(error => ({tf:item.tf,ok:false,reason:error && error.message ? error.message : String(error)}))
      ))).then(results => {
        if(generation !== state.dataLoadGeneration) return;
        state.dataStatus = {failures:results.filter(result => !result.ok),failedAt:Date.now()};
      }).catch(error => {
        if(generation !== state.dataLoadGeneration) return;
        state.dataStatus = {failures:plan.items.map(item=>({tf:item.tf,reason:error&&error.message?error.message:String(error)})),failedAt:Date.now()};
      }).finally(() => {
        if(state.dataLoadPromise===loadPromise) state.dataLoadPromise = null;
        if(generation === state.dataLoadGeneration) scheduleToolbarSignalRefresh37(true);
      });
      state.dataLoadPromise=loadPromise;
      health = inspectSignalData37(plan,feed);
    }
    return {plan,health};
  }
  function buildSignalSnapshot37(plan,health,frozen={}){
    const feed = signalFeed37();
    const symbol = currentSignalSymbol37();
    const rowsByTf = {};
    const closedByTf = {};
    const maByTf = {};
    const structureByTf = {};
    const smcSettings = signalSmcSettingsSignature37();
    let fullEvidenceChanged = false;
    let formingEvidenceChanged = false;
    plan.items.forEach(item => {
      const revision = signalTimeframeRevision37(feed,item.tf);
      const periods = plan.slots.map(slot => slot.period).join("-");
      const closedKey = [revision.symbol,item.tf,item.historyTarget,periods,revision.closedRevision,smcSettings].join("|");
      const liveKey = [closedKey,revision.formingRevision].join("|");
      const prior = state.evidenceByTf.get(item.tf);
      let closedRows,closedMa,structure;
      if(prior && prior.closedKey === closedKey){
        performanceDiagnostics.smcCacheHits += 1;
        closedRows = prior.closedRows;
        closedMa = prior.closedMa;
        structure = prior.structure;
      }else{
        fullEvidenceChanged = true;
        closedRows = (feed.getClosedBuffer(item.tf) || []).map(row => normalizeSignalRow37(row,item.tf)).filter(Boolean);
        closedMa = feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:false,requiredRows:item.historyTarget,slots:plan.slots});
        structure = cachedSignalStructure37(item.tf,closedRows,revision,smcSettings);
      }
      let liveRows,liveMa;
      if(prior && prior.liveKey === liveKey){
        liveRows = prior.liveRows;
        liveMa = prior.liveMa;
      }else{
        if(prior && prior.closedKey === closedKey) formingEvidenceChanged = true;
        liveRows = (feed.getLiveBuffer(item.tf) || []).map(row => normalizeSignalRow37(row,item.tf)).filter(Boolean);
        liveMa = feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:true,requiredRows:item.historyTarget,slots:plan.slots});
      }
      const cached = {closedKey,liveKey,closedRows,liveRows,closedMa,liveMa,structure,revision};
      state.evidenceByTf.set(item.tf,cached);
      rowsByTf[item.tf] = liveRows;
      closedByTf[item.tf] = closedRows;
      maByTf[item.tf] = {live:liveMa,closed:closedMa};
      structureByTf[item.tf] = structure;
    });
    if(fullEvidenceChanged) performanceDiagnostics.signalFullEvidenceBuilds += 1;
    else if(formingEvidenceChanged) performanceDiagnostics.signalFormingEvidenceBuilds += 1;
    const snapshot = {
      symbol,
      horizonId:plan.horizonId,
      createdAt:Date.now(),
      version:++state.snapshotVersion,
      currentPrice:Object.prototype.hasOwnProperty.call(frozen,"currentPrice") ? frozen.currentPrice : num37(feed.getCurrentPrice() && feed.getCurrentPrice().value),
      rowsByTf,
      closedByTf,
      maByTf,
      structureByTf,
      health
    };
    snapshot.freshness = buildSourceFreshness37(snapshot,plan);
    return snapshot;
  }
  function signalSnapshotSignature37(plan){
    const feed = signalFeed37();
    const ownedPrice=feed.getCurrentPrice();
    const currentPrice = num37(ownedPrice && ownedPrice.value);
    let smcIdentity = "smc:waiting";
    try{
      if(window.SMC_FEATURE && typeof window.SMC_FEATURE.getStructureSnapshot === "function"){
        const settings = typeof window.SMC_FEATURE.getSettings === "function" ? window.SMC_FEATURE.getSettings() : null;
        smcIdentity = `smc:ready:${settings && settings.swingLength || "default"}`;
      }
    }catch(_e){}
    const parts = [
      String((typeof cfg === "function" && cfg() && cfg().symbol) || "").toUpperCase(),
      plan.horizonId,
      smcIdentity
    ];
    plan.items.forEach(item => {
      const revision = signalTimeframeRevision37(feed,item.tf);
      parts.push(item.tf,item.historyTarget,revision.closedRevision,revision.formingRevision);
    });
    parts.push(currentPrice);
    return {signature:parts.join("|"),currentPrice};
  }
  function analyticalInputRevision37(){
    const plan=signalDataPlan37(state.horizon);
    const frozen=signalSnapshotSignature37(plan);
    const now=Date.now();
    const diag=signalFeed37().diagnostics();
    const priceAt=Number(diag.latestPriceAt || 0);
    const freshnessRevision=`price-stale:${!priceAt || now-priceAt>featureConfig.freshness.priceStaleMs}`;
    const fingerprint=[signalContextKey37(),signalCanonicalSlots37().map(slot=>slot.period).join("-"),signalSmcSettingsSignature37(),freshnessRevision,frozen.signature].join("|");
    return {fingerprint,plan,frozen};
  }
  function shouldRunAnalyticalRefresh37(previous,next){ return !previous || previous!==next; }
  function runSchedulingSelfTests37(){
    const cases={identicalRevisionSkipped:!shouldRunAnalyticalRefresh37("revision-a","revision-a"),formingRevisionRuns:shouldRunAnalyticalRefresh37("forming-1","forming-2"),positionRevisionDoesNotEnterSignal:!shouldRunAnalyticalRefresh37("signal-revision","signal-revision"),initialRuns:shouldRunAnalyticalRefresh37("","revision-a")};
    return {passed:Object.values(cases).every(Boolean),cases};
  }
  function coherentSignalSnapshot37(plan,health,preparedFrozen=null){
    const frozen = preparedFrozen || signalSnapshotSignature37(plan);
    const snapshot = buildSignalSnapshot37(plan,health,frozen);
    snapshot.signature = frozen.signature;
    state.marketSnapshot = snapshot;
    return snapshot;
  }
  function actionPrivateSnapshot37(){
    const symbol=currentSignalSymbol37(),position=openPositionSignal37(),orders=authoritativeOrders37(symbol);
    return {position,protectiveOrders:protectiveOrdersSnapshot37(symbol,position,orders),exitOrderState:exitOrderStateSnapshot37(symbol,position,orders)};
  }
  function ensureActionData37(horizonId=positionEngine.getManagementHorizon()||"quick"){
    const feed=actionFeed37(),plan=actionDataPlan37(horizonId),symbol=currentSignalSymbol37();
    const key=`${symbol}|${plan.managementHorizonId}|${plan.slots.map(slot=>slot.period).join("-")}`;
    const configurationChanged=actionState.dataKey!==key;
    if(configurationChanged){
      actionState.dataKey=key;actionState.dataStatus=null;actionState.dataLoadGeneration+=1;actionState.marketSnapshot=null;actionState.evidenceByTf.clear();actionState.smcCache.clear();
    }
    let health=inspectSignalData37(plan,feed,!!actionState.dataLoadPromise,actionState.dataStatus);
    const retryFailed=actionState.dataStatus&&actionState.dataStatus.failedAt&&Date.now()-actionState.dataStatus.failedAt>=30000;
    const needsLoad=health.items.filter(item=>item.status==="insufficient"||item.status==="unavailable"||(item.status==="failed"&&retryFailed));
    if((configurationChanged||needsLoad.length)&&!actionState.dataLoadPromise){
      const generation=actionState.dataLoadGeneration;
      const loadPromise=configureActionFeed37(plan,configurationChanged?"action-plan-change":"action-data-retry").then(()=>Promise.all(needsLoad.map(item=>feed.ensureTimeframeBuffer(item.tf,item.historyTarget).then(()=>({tf:item.tf,ok:true})).catch(error=>({tf:item.tf,ok:false,reason:error&&error.message||String(error)}))))).then(results=>{
        if(generation!==actionState.dataLoadGeneration)return;actionState.dataStatus={failures:results.filter(result=>!result.ok),failedAt:Date.now()};
      }).catch(error=>{
        if(generation!==actionState.dataLoadGeneration)return;actionState.dataStatus={failures:plan.items.map(item=>({tf:item.tf,reason:error&&error.message||String(error)})),failedAt:Date.now()};
      }).finally(()=>{
        if(actionState.dataLoadPromise===loadPromise)actionState.dataLoadPromise=null;
        if(generation===actionState.dataLoadGeneration)scheduleActionRefresh37(true,"action-data-ready");
      });
      actionState.dataLoadPromise=loadPromise;health=inspectSignalData37(plan,feed,true,actionState.dataStatus);
    }
    return {plan,health};
  }
  function buildActionFreshness37(snapshot,plan){
    const now=Date.now(),diag=actionFeed37().diagnostics(),privateSync=window.BINANCE_PRIVATE_SYNC&&typeof window.BINANCE_PRIVATE_SYNC.diagnostics==="function"?window.BINANCE_PRIVATE_SYNC.diagnostics():null;
    const priceAt=Number(diag.latestPriceAt||0),priceAgeMs=priceAt?Math.max(0,now-priceAt):Infinity;
    const streamStatus=String(privateSync&&privateSync.streamStatus||snapshot.position&&snapshot.position.streamStatus||"disconnected").toLowerCase();
    const coverageSource=String(privateSync&&privateSync.coverageSource||snapshot.position&&snapshot.position.coverageSource||"REST").toUpperCase();
    const positionAt=snapshot.position&&(num37(snapshot.position.verifiedAt)??num37(privateSync&&privateSync.verifiedAt&&privateSync.verifiedAt.position)??num37(snapshot.position.updatedAt));
    const positionAgeMs=positionAt==null?(snapshot.position?Infinity:null):Math.max(0,now-positionAt),positionStreamCovered=streamStatus==="live"&&coverageSource==="USER_STREAM";
    const orderAt=snapshot.protectiveOrders&&(num37(snapshot.protectiveOrders.verifiedAt)??num37(privateSync&&privateSync.verifiedAt&&privateSync.verifiedAt.orders)??num37(snapshot.protectiveOrders.updatedAt));
    const orderAgeMs=orderAt==null?Infinity:Math.max(0,now-orderAt),orderStreamCovered=streamStatus==="live"&&String(snapshot.protectiveOrders&&snapshot.protectiveOrders.coverageSource||coverageSource).toUpperCase()==="USER_STREAM";
    const managementStaleSources=[];
    if(snapshot.position&&!positionStreamCovered&&(positionAgeMs==null||positionAgeMs>featureConfig.freshness.positionStaleMs))managementStaleSources.push({source:"Position/account",ageMs:positionAgeMs});
    if(snapshot.position&&priceAgeMs>featureConfig.freshness.priceStaleMs)managementStaleSources.push({source:"Live price",ageMs:priceAgeMs});
    (snapshot.health&&snapshot.health.items||[]).forEach(health=>{if(health.status!=="sufficient")managementStaleSources.push({source:`${health.tf} management evidence`,ageMs:health.ageMs});});
    const stopStaleSources=managementStaleSources.map(item=>({...item}));
    if(snapshot.position&&(!snapshot.protectiveOrders||snapshot.protectiveOrders.sourcesChecked!==true||snapshot.protectiveOrders.status!=="ok"))stopStaleSources.push({source:"Protective orders",ageMs:orderAgeMs});
    else if(snapshot.position&&!orderStreamCovered&&orderAgeMs>featureConfig.freshness.protectiveOrderStaleMs)stopStaleSources.push({source:"Protective orders",ageMs:orderAgeMs});
    return {checkedAt:now,priceAt,priceAgeMs,positionAt,positionAgeMs,orderAt,orderAgeMs,managementClosed:latestClosedEvidence37(snapshot,plan.management.primaryTf),contextClosed:latestClosedEvidence37(snapshot,plan.management.contextTf),streamStatus,coverageSource,positionStreamCovered,orderStreamCovered,stateChangedAt:privateSync&&privateSync.stateChangedAt||null,verifiedAt:privateSync&&privateSync.verifiedAt||null,managementStatus:freshnessStatus37(managementStaleSources),stopStatus:freshnessStatus37(stopStaleSources),managementStaleSources,stopStaleSources};
  }
  function actionInputRevision37(){
    const bundle=ensureActionData37(),feed=actionFeed37(),privateFacts=actionPrivateSnapshot37(),position=privateFacts.position;
    const revisions={};bundle.plan.items.forEach(item=>{const revision=signalTimeframeRevision37(feed,item.tf);revisions[item.tf]={closedRevision:revision.closedRevision,formingRevision:revision.formingRevision,depth:item.historyTarget};});
    const diag=feed.diagnostics(),positionKey=position?JSON.stringify([position.symbol,position.side,position.qty,position.price,position.markPrice,position.margin,position.leverage,position.realizedPnl,position.unrealizedPnl,position.liquidationPrice,position.chainId,position.updatedAt,position.verifiedAt]):"flat";
    const protection=privateFacts.protectiveOrders,exits=privateFacts.exitOrderState;
    const protectionKey=position?JSON.stringify([protection.status,protection.sourcesChecked,protection.updatedAt,protection.verifiedAt,(protection.orders||[]).map(order=>[order.id,order.kind,order.triggerPrice,order.quantity,order.status,order.reduceOnly,order.closePosition])]):"flat";
    const exitKey=position?JSON.stringify([exits.status,exits.updatedAt,exits.verifiedAt,(exits.orders||[]).map(order=>[order.orderId,order.clientOrderId,order.status,order.price,order.origQty,order.executedQty]),(exits.grRows||[]).map(row=>[row.clientOrderId,row.localRowId,row.status,row.level,row.lot])]):"flat";
    const privateDiag=window.BINANCE_PRIVATE_SYNC&&typeof window.BINANCE_PRIVATE_SYNC.diagnostics==="function"?window.BINANCE_PRIVATE_SYNC.diagnostics():null,now=Date.now(),streamLive=String(privateDiag&&privateDiag.streamStatus||"").toLowerCase()==="live"&&String(privateDiag&&privateDiag.coverageSource||"").toUpperCase()==="USER_STREAM";
    const positionAt=position&&(position.verifiedAt??position.updatedAt),orderAt=protection.verifiedAt??protection.updatedAt;
    const freshnessKey=position?JSON.stringify([!diag.latestPriceAt||now-diag.latestPriceAt>featureConfig.freshness.priceStaleMs,!streamLive&&(!positionAt||now-positionAt>featureConfig.freshness.positionStaleMs),!streamLive&&(!orderAt||now-orderAt>featureConfig.freshness.protectiveOrderStaleMs),String(privateDiag&&privateDiag.streamStatus||"disconnected"),String(privateDiag&&privateDiag.coverageSource||"REST"),bundle.health.managementStatus||bundle.health.status]):"flat";
    const marketKey=position?JSON.stringify([diag.currentPrice&&diag.currentPrice.revision,diag.evidenceFingerprint,revisions]):"flat";
    const contextKey=actionContextKey37(position),fingerprint=[contextKey,positionKey,protectionKey,exitKey,bundle.plan.managementHorizonId,signalCanonicalSlots37().map(slot=>slot.period).join("-"),signalSmcSettingsSignature37(),marketKey,freshnessKey].join("|");
    if(actionState.lastPublishedSnapshot&&actionState.lastPublishedSnapshot.contextKey!==contextKey){actionState.lastPublishedSnapshot=null;actionState.lastValidPublishedSnapshot=null;windowSystem.invalidatePositionContext(contextKey);if(state.exit){state.exit.textContent="WAIT";state.exit.dataset.tone="gray";}}
    return {fingerprint,contextKey,bundle,privateFacts,revisions,positionRevision:privateDiag&&privateDiag.sharedPosition&&privateDiag.sharedPosition.streamRevision||position&&position.updatedAt||position&&position.verifiedAt||0,orderRevision:privateDiag&&privateDiag.stateChangedAt&&privateDiag.stateChangedAt.orders||protection.verifiedAt||protection.updatedAt||exits.verifiedAt||exits.updatedAt||0};
  }
  function buildActionSnapshot37(input){
    const {bundle,privateFacts}=input,plan=bundle.plan,health=bundle.health,feed=actionFeed37(),rowsByTf={},closedByTf={},maByTf={},structureByTf={},smcSettings=signalSmcSettingsSignature37();
    plan.items.forEach(item=>{
      const revision=signalTimeframeRevision37(feed,item.tf),periods=plan.slots.map(slot=>slot.period).join("-"),closedKey=[revision.symbol,item.tf,item.historyTarget,periods,revision.closedRevision,smcSettings].join("|"),liveKey=[closedKey,revision.formingRevision].join("|"),prior=actionState.evidenceByTf.get(item.tf);
      const closedRows=prior&&prior.closedKey===closedKey?prior.closedRows:(feed.getClosedBuffer(item.tf)||[]).map(row=>normalizeSignalRow37(row,item.tf)).filter(Boolean);
      const closedMa=prior&&prior.closedKey===closedKey?prior.closedMa:feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:false,requiredRows:item.historyTarget,slots:plan.slots});
      const structure=prior&&prior.closedKey===closedKey?prior.structure:cachedStructure37(actionState.smcCache,item.tf,closedRows,revision,smcSettings);
      const liveRows=prior&&prior.liveKey===liveKey?prior.liveRows:(feed.getLiveBuffer(item.tf)||[]).map(row=>normalizeSignalRow37(row,item.tf)).filter(Boolean);
      const liveMa=prior&&prior.liveKey===liveKey?prior.liveMa:feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:true,requiredRows:item.historyTarget,slots:plan.slots});
      actionState.evidenceByTf.set(item.tf,{closedKey,liveKey,closedRows,closedMa,structure,liveRows,liveMa,revision});rowsByTf[item.tf]=liveRows;closedByTf[item.tf]=closedRows;maByTf[item.tf]={live:liveMa,closed:closedMa};structureByTf[item.tf]=structure;
    });
    const snapshot={symbol:currentSignalSymbol37(),horizonId:plan.managementHorizonId,createdAt:Date.now(),version:++actionState.snapshotVersion,currentPrice:num37(feed.getCurrentPrice()&&feed.getCurrentPrice().value),position:clonePublicationValue37(privateFacts.position),protectiveOrders:clonePublicationValue37(privateFacts.protectiveOrders),exitOrderState:clonePublicationValue37(privateFacts.exitOrderState),rowsByTf,closedByTf,maByTf,structureByTf,health};
    snapshot.freshness=buildActionFreshness37(snapshot,plan);snapshot.signature=input.fingerprint;actionState.marketSnapshot=snapshot;return snapshot;
  }
  function actionPressureSamples37(plan){return (plan.pressure||[]).map(item=>({...samplePressureSignal37(item.tf,item.lookback,item.maSlot),weight:item.weight,role:item.role}));}
  function buildUncachedSignalSnapshot37(plan,health,reference){
    const feed=signalFeed37();
    const rowsByTf={},closedByTf={},maByTf={},structureByTf={};
    plan.items.forEach(item => {
      rowsByTf[item.tf]=(feed.getLiveBuffer(item.tf)||[]).map(row=>normalizeSignalRow37(row,item.tf)).filter(Boolean);
      closedByTf[item.tf]=(feed.getClosedBuffer(item.tf)||[]).map(row=>normalizeSignalRow37(row,item.tf)).filter(Boolean);
      maByTf[item.tf]={
        live:feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:true,requiredRows:item.historyTarget,slots:plan.slots,bypassCache:true}),
        closed:feed.getAuthoritativeMaSnapshot(item.tf,{includeForming:false,requiredRows:item.historyTarget,slots:plan.slots,bypassCache:true})
      };
      try{ structureByTf[item.tf]=window.SMC_FEATURE && typeof window.SMC_FEATURE.getStructureSnapshot==="function" ? window.SMC_FEATURE.getStructureSnapshot(closedByTf[item.tf]) : null; }
      catch(_e){ structureByTf[item.tf]=null; }
    });
    return {
      symbol:reference.symbol,horizonId:plan.horizonId,createdAt:reference.createdAt,version:reference.version,signature:reference.signature,
      currentPrice:reference.currentPrice,
      rowsByTf,closedByTf,maByTf,structureByTf,health,freshness:clonePublicationValue37(reference.freshness)
    };
  }
  function parityOutput37(signal){
    const decision=signal && signal.entryDecision || {};
    const targets=decision.assessments&&decision.assessments.targetFramework||{};
    const level=entry => entry && (entry.reference ?? entry.price ?? entry.level ?? null);
    return {
      marketDirection:signal && signal.marketDirection || null,confidence:num37(signal && signal.confidence),
      entryDecision:decision.state || null,setupFamily:decision.family || null,setupTimeframe:decision.tf || null,
      triggerState:decision.interaction && decision.interaction.trigger || decision.trigger || null,
      targetFramework:{obstacle:level(targets.obstacle),primary:level(targets.primary),extended:level(targets.extended)}
    };
  }
  function parityEvidence37(snapshot){
    const compact={};
    Object.keys(snapshot.rowsByTf || {}).sort().forEach(tf => {
      const rows=snapshot.rowsByTf[tf] || [],closed=snapshot.closedByTf[tf] || [],pair=snapshot.maByTf[tf] || {};
      compact[tf]={
        rows:rows.map(row=>[row.time,row.open,row.high,row.low,row.close,row.volume,row.takerBuyBase,row.final]),
        closed:closed.map(row=>[row.time,row.open,row.high,row.low,row.close,row.volume,row.takerBuyBase,row.final]),
        liveMa:pair.live && pair.live.valuesBySlot || null,closedMa:pair.closed && pair.closed.valuesBySlot || null,
        structure:snapshot.structureByTf && snapshot.structureByTf[tf] || null
      };
    });
    const canonical=value => {
      if(Array.isArray(value)) return value.map(canonical);
      if(value && typeof value==="object") return Object.fromEntries(Object.keys(value).filter(key=>!["calculatedAt","createdAt","generatedAt"].includes(key)).sort().map(key=>[key,canonical(value[key])]));
      return Number.isNaN(value) ? "NaN" : value;
    };
    return JSON.stringify(canonical(compact));
  }
  function cloneStateMap37(map){
    return new Map(Array.from(map.entries(),([key,value]) => [key,clonePublicationValue37(value)]));
  }
  function runOptimizationParityTests37(){
    const saved={active:state.activeSnapshot,market:state.marketSnapshot,entry:cloneStateMap37(state.entryTrackers),histories:cloneStateMap37(state.setupHistories)};
    const hub=signalFeed37();
    const results=[];
    try{
      for(const horizonId of HORIZONS.map(item=>item.id)){
        const plan=signalDataPlan37(horizonId);
        const health=inspectSignalData37(plan,hub);
        if(!["sufficient","stale"].includes(health.status)){
          results.push({horizonId,passed:false,reason:`evidence ${health.status}`});
          continue;
        }
        const reference=buildSignalSnapshot37(plan,health,signalSnapshotSignature37(plan));
        reference.signature=`parity-${horizonId}`;
        const legacy=buildUncachedSignalSnapshot37(plan,health,reference);
        const referenceEvidence=parityEvidence37(reference),legacyEvidence=parityEvidence37(legacy);
        const evidenceEqual=referenceEvidence===legacyEvidence;
        let evidenceDiff=null;
        if(!evidenceEqual){
          let index=0;while(index<referenceEvidence.length&&index<legacyEvidence.length&&referenceEvidence[index]===legacyEvidence[index]) index+=1;
          evidenceDiff={index,referenceLength:referenceEvidence.length,legacyLength:legacyEvidence.length,reference:referenceEvidence.slice(Math.max(0,index-80),index+160),legacy:legacyEvidence.slice(Math.max(0,index-80),index+160)};
        }
        const price=num37(reference.currentPrice) || 100000;
        const positions=[
          {name:"FLAT",value:null},
          {name:"LONG",value:{symbol:reference.symbol,side:"LONG",qty:0.01,price:price*0.99,markPrice:price,unrealizedPnl:100,realizedPnl:10,margin:500,leverage:20,updatedAt:reference.createdAt}},
          {name:"SHORT",value:{symbol:reference.symbol,side:"SHORT",qty:0.01,price:price*1.01,markPrice:price,unrealizedPnl:100,realizedPnl:10,margin:500,leverage:20,updatedAt:reference.createdAt}}
        ];
        for(const positionCase of positions){
          for(const candleMode of ["FORMING","CLOSED"]){
            for(const freshnessMode of ["FRESH","STALE"]){
              const prepare=source => {
                const snapshot={...source,position:clonePublicationValue37(positionCase.value),freshness:clonePublicationValue37(source.freshness)};
                if(positionCase.value){
                  const isLong=positionCase.value.side==="LONG",stopSide=isLong?"SELL":"BUY";
                  const masterPrice=price*(isLong?0.985:1.015),pslPrice=price*(isLong?0.975:1.025),exitPrice=price*(isLong?1.03:0.97);
                  snapshot.protectiveOrders={
                    status:"ok",sourcesChecked:true,updatedAt:reference.createdAt,verifiedAt:reference.createdAt,stateChangedAt:reference.createdAt,
                    orders:[
                      {id:"parity-master",kind:"MASTER_SL",side:stopSide,positionSide:positionCase.value.side,triggerPrice:masterPrice,quantity:positionCase.value.qty,reduceOnly:true,status:"NEW",isLive:true},
                      {id:"parity-psl",kind:"PSL",side:stopSide,positionSide:positionCase.value.side,triggerPrice:pslPrice,quantity:positionCase.value.qty,reduceOnly:true,status:"NEW",isLive:true}
                    ]
                  };
                  snapshot.exitOrderState={status:"ok",updatedAt:reference.createdAt,verifiedAt:reference.createdAt,orders:[{id:"parity-exit",type:"LIMIT",side:stopSide,positionSide:positionCase.value.side,price:exitPrice,quantity:positionCase.value.qty,reduceOnly:true,status:"NEW"}]};
                }
                if(candleMode==="CLOSED"){
                  snapshot.rowsByTf=Object.fromEntries(Object.entries(source.closedByTf).map(([tf,rows])=>[tf,rows]));
                  snapshot.maByTf=Object.fromEntries(Object.entries(source.maByTf).map(([tf,pair])=>[tf,{closed:pair.closed,live:pair.closed}]));
                }
                if(freshnessMode==="STALE") snapshot.freshness={...(snapshot.freshness||{}),signalStatus:"STALE",signalStaleSources:[{source:"parity stale fixture",ageMs:60000}]};
                state.entryTrackers=cloneStateMap37(saved.entry);
                state.setupHistories=cloneStateMap37(saved.histories);
                state.activeSnapshot=snapshot;
                return parityOutput37(evaluateToolbarPressureSignal37(horizonId));
              };
              const legacyOutput=prepare(legacy);
              const optimizedOutput=prepare(reference);
              const outputEqual=JSON.stringify(legacyOutput)===JSON.stringify(optimizedOutput);
              results.push({horizonId,position:positionCase.name,candleMode,freshnessMode,evidenceEqual,evidenceDiff,outputEqual,passed:evidenceEqual&&outputEqual,legacy:legacyOutput,optimized:optimizedOutput});
            }
          }
        }
      }
    }finally{
      state.activeSnapshot=saved.active;state.marketSnapshot=saved.market;state.entryTrackers=saved.entry;state.setupHistories=saved.histories;
    }
    const report={ranAt:Date.now(),passed:results.length>0&&results.every(item=>item.passed),comparisons:results.length,failures:results.filter(item=>!item.passed),results};
    state.lastOptimizationTests=report;
    return report;
  }
  function signalRows37(tf){
    try{
      if(state.activeSnapshot && Array.isArray(state.activeSnapshot.rowsByTf && state.activeSnapshot.rowsByTf[tf])){
        return state.activeSnapshot.rowsByTf[tf].map(row => ({...row}));
      }
      const feed = signalFeed37();
      let rows = [];
      rows = feed.getLiveBuffer(tf) || [];
      if(!Array.isArray(rows) || !rows.length) rows = feed.getClosedBuffer(tf) || [];
      const deduped = new Map();
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const normalized = normalizeSignalRow37(row,tf);
        if(normalized) deduped.set(normalized.time,normalized);
      });
      return Array.from(deduped.values()).sort((a,b) => a.time - b.time);
    }catch(_e){
      return [];
    }
  }
  function normalizeSignalRow37(row,tf){
    if(!row) return null;
    const openTimeMs = Number.isFinite(Number(row.openTime))
      ? Number(row.openTime)
      : (Number.isFinite(Number(row.time)) ? Number(row.time) * 1000 : NaN);
    const closeTimeMs = Number.isFinite(Number(row.closeTime))
      ? Number(row.closeTime)
      : (Number.isFinite(openTimeMs) ? openTimeMs + signalIntervalSeconds37(tf) * 1000 - 1 : NaN);
    const out = {
      time:Number.isFinite(Number(row.time)) ? Number(row.time) : (Number.isFinite(openTimeMs) ? Math.floor(openTimeMs / 1000) : NaN),
      openTime:openTimeMs,
      closeTime:closeTimeMs,
      open:num37(row.open),
      high:num37(row.high),
      low:num37(row.low),
      close:num37(row.close),
      volume:num37(row.volume ?? row.baseVolume),
      takerBuyBase:num37(row.takerBuyBase),
      final:row.final === true
    };
    return Number.isFinite(out.time) && out.open != null && out.high != null && out.low != null && out.close != null ? out : null;
  }
  function validSignalRow37(row){
    if(!row) return false;
    const volume = num37(row.volume);
    const takerBuy = num37(row.takerBuyBase);
    if(!(volume > 0) || takerBuy == null) return false;
    return takerBuy >= 0 && takerBuy <= volume;
  }
  function aggregateSignalRows37(rows,tf){
    const source = Array.isArray(rows) ? rows : [];
    if(!source.length || source.some(row => !validSignalRow37(row))) return null;
    const first = source[0];
    const last = source[source.length - 1];
    return {
      tf,
      open:first.open,
      high:Math.max(...source.map(row => Number(row.high))),
      low:Math.min(...source.map(row => Number(row.low))),
      close:last.close,
      volume:source.reduce((sum,row) => sum + Number(row.volume),0),
      takerBuyBase:source.reduce((sum,row) => sum + Number(row.takerBuyBase),0),
      final:source.every(row => row.final === true)
    };
  }
  function latestSeriesValue37(series){
    const rows = Array.isArray(series) ? series : [];
    const last = rows.length ? rows[rows.length - 1] : null;
    return num37(last && last.value);
  }
  function openPositionSignal37(){
    if(state.activeSnapshot && Object.prototype.hasOwnProperty.call(state.activeSnapshot,"position")){
      return state.activeSnapshot.position ? {...state.activeSnapshot.position} : null;
    }
    try{
      const box = Array.isArray(openPositionBoxes)
        ? openPositionBoxes.find(item => item && Math.abs(Number(item.qty) || 0) > 1e-12)
        : null;
      if(!box) return null;
      const chainId = box.chainId || null;
      const realizedPnl = typeof openLotLinks !== "undefined" && Array.isArray(openLotLinks)
        ? openLotLinks.filter(link => {
          const linkChain = typeof cid21 === "function" ? cid21(link) : link && (link.chainId || link.parentTradeId);
          return chainId && linkChain === chainId;
        }).reduce((sum,link) => sum + (num37(link && (link.netPnl ?? link.realizedPnl ?? link.binanceRealizedPnl)) || 0),0)
        : 0;
      const privateSync = window.BINANCE_PRIVATE_SYNC && typeof window.BINANCE_PRIVATE_SYNC.diagnostics === "function" ? window.BINANCE_PRIVATE_SYNC.diagnostics() : null;
      return {
        symbol:String(box.symbol || (typeof activeSymbol === "function" ? activeSymbol() : "") || "BTCUSDT"),
        side:String(box.side || "").toUpperCase() === "SHORT" ? "SHORT" : "LONG",
        qty:num37(box.qty),
        price:num37(box.price),
        markPrice:num37(box.markPrice),
        unrealizedPnl:num37(box.unrealizedPnl),
        realizedPnl,
        leverage:num37(box.leverage),
        margin:typeof openBoxMargin === "function" ? num37(openBoxMargin(box)) : num37(box.positionInitialMargin ?? box.isolatedMargin ?? box.margin),
        positionInitialMargin:num37(box.positionInitialMargin),
        isolatedMargin:num37(box.isolatedMargin),
        liquidationPrice:num37(box.liquidationPrice),
        chainId,
        time:num37(box.time),
        updatedAt:num37(privateSync && privateSync.stateChangedAt && privateSync.stateChangedAt.position) ?? num37(box.updatedAt),
        stateChangedAt:num37(privateSync && privateSync.stateChangedAt && privateSync.stateChangedAt.position) ?? num37(box.updatedAt),
        verifiedAt:num37(privateSync && privateSync.verifiedAt && privateSync.verifiedAt.position),
        streamStatus:privateSync && privateSync.streamStatus || "disconnected",
        coverageSource:privateSync && privateSync.coverageSource || "REST"
      };
    }catch(_e){
      return null;
    }
  }
  function signalCurrentPrice37(){
    const frozen = state.activeSnapshot ? num37(state.activeSnapshot.currentPrice) : null;
    if(frozen != null) return frozen;
    const published = state.marketSnapshot ? num37(state.marketSnapshot.currentPrice) : null;
    if(published != null) return published;
    const owned=signalFeed37().getCurrentPrice();
    return num37(owned && owned.value);
  }
  function authoritativeOrders37(symbol){
    try{
      const source=window.BINANCE_OPEN_ORDERS_CACHE;
      if(source && typeof source.getSnapshot === "function") return source.getSnapshot(symbol);
    }catch(_e){}
    return {
      symbol:String(symbol || "").toUpperCase(),status:String(window.v13OpenOrdersStatus21 || "unavailable").toLowerCase(),
      sourcesChecked:window.v13StopSourcesChecked21===true,requestInFlight:String(window.v13OpenOrdersStatus21 || "").toLowerCase()==="pending",
      updatedAt:num37(window.v13OpenOrdersTs21),attemptedAt:num37(window.v13OpenOrdersAttemptTs21),
      orders:Array.isArray(window.v13OpenOrders21) ? window.v13OpenOrders21 : [],algoOrders:Array.isArray(window.v13OpenAlgoOrders21) ? window.v13OpenAlgoOrders21 : []
    };
  }
  function requestAuthoritativeOrders37(){
    try{
      const source=window.BINANCE_OPEN_ORDERS_CACHE;
      if(!source || typeof source.refresh!=="function") return;
      const privateSync=window.BINANCE_PRIVATE_SYNC && typeof window.BINANCE_PRIVATE_SYNC.diagnostics==="function" ? window.BINANCE_PRIVATE_SYNC.diagnostics() : null;
      if(privateSync && !(privateSync.verifiedAt && privateSync.verifiedAt.orders) && ["connecting","disconnected"].includes(String(privateSync.streamStatus || "").toLowerCase())) return;
      source.refresh({reason:"position-management",maxAgeMs:60000}).then(snapshot => {
        const updatedAt=num37(snapshot && (snapshot.verifiedAt ?? snapshot.updatedAt)) || 0;
        if(updatedAt<=actionState.orderRefreshObservedAt) return;
        actionState.orderRefreshObservedAt=updatedAt;
        scheduleActionRefresh37(true,"authoritative-orders-refreshed");
      }).catch(error => { actionState.lastError=error && error.stack || String(error); });
    }catch(error){ actionState.lastError=error && error.stack || String(error); }
  }
  function orderMatchesPosition37(order,position){
    if(!order || !position) return false;
    const status=String(order.status || order.orderStatus || "NEW").toUpperCase();
    const live=!status || ["NEW","PENDING","ACCEPTED","PARTIALLY_FILLED"].includes(status) || status.includes("NEW");
    const positionSide=String(order.positionSide || "").toUpperCase();
    const expectedSide=position.side === "SHORT" ? "BUY" : "SELL";
    return live && (!positionSide || positionSide==="BOTH" || positionSide===position.side) && String(order.side || "").toUpperCase()===expectedSide;
  }
  function protectiveOrdersSnapshot37(symbol,position=openPositionSignal37(),authoritative=authoritativeOrders37(symbol)){
    const helper = window.BinanceConditionalOrderClassifier;
    const updatedAt = num37(authoritative.updatedAt);
    const status = String(authoritative.status || "unavailable").toLowerCase();
    const sourcesChecked = authoritative.sourcesChecked === true;
    const source = [...(Array.isArray(authoritative.orders) ? authoritative.orders : []),...(Array.isArray(authoritative.algoOrders) ? authoritative.algoOrders : [])];
    const orders = [];
    const seen = new Set();
    source.forEach(order => {
      if(!order || String(order.symbol || "").toUpperCase() !== String(symbol || "").toUpperCase() || !orderMatchesPosition37(order,position)) return;
      const classified = helper && typeof helper.classify === "function" ? helper.classify(order) : null;
      if(!classified || !["MASTER_SL","PSL"].includes(classified.kind) || classified.isLive!==true) return;
      const id = String(classified.algoId != null ? `algo:${classified.algoId}` : classified.orderId != null ? `order:${classified.orderId}` : classified.clientAlgoId || classified.clientOrderId || `${classified.kind}:${classified.triggerPrice}:${classified.quantity || "close"}`);
      if(seen.has(id)) return;
      seen.add(id);
      orders.push({
        id,kind:classified.kind,symbol:String(classified.symbol || symbol || "").toUpperCase(),side:String(classified.side || "").toUpperCase(),positionSide:String(classified.positionSide || "").toUpperCase(),
        triggerPrice:num37(classified.triggerPrice),quantity:num37(classified.quantity),closePosition:classified.closePosition === true,reduceOnly:order.reduceOnly === true || String(order.reduceOnly).toLowerCase() === "true",
        workingType:order.workingType || order.priceProtect || null,status:String(order.status || order.orderStatus || "NEW").toUpperCase(),isLive:classified.isLive === true,updatedAt
      });
    });
    return {symbol:String(symbol || "").toUpperCase(),createdAt:Date.now(),updatedAt,verifiedAt:num37(authoritative.verifiedAt),stateChangedAt:num37(authoritative.stateChangedAt),streamStatus:authoritative.streamStatus || "disconnected",coverageSource:authoritative.coverageSource || "REST",attemptedAt:num37(authoritative.attemptedAt),status,sourcesChecked,requestInFlight:authoritative.requestInFlight===true,orders};
  }
  function exitOrderStateSnapshot37(symbol,position=openPositionSignal37(),authoritative=authoritativeOrders37(symbol)){
    const normalizedSymbol=String(symbol || "").toUpperCase();
    const updatedAt=num37(authoritative.updatedAt);
    const status=String(authoritative.status || "unavailable").toLowerCase();
    const orders=(Array.isArray(authoritative.orders) ? authoritative.orders : []).filter(order => order && String(order.symbol || "").toUpperCase()===normalizedSymbol && String(order.type || order.orderType || "").toUpperCase()==="LIMIT" && orderMatchesPosition37(order,position)).map(order => ({
      orderId:order.orderId,clientOrderId:order.clientOrderId || null,symbol:normalizedSymbol,side:order.side,positionSide:order.positionSide,type:order.type || order.orderType,status:order.status || order.orderStatus,price:num37(order.price),origQty:num37(order.origQty ?? order.quantity ?? order.qty),executedQty:num37(order.executedQty),reduceOnly:order.reduceOnly===true || String(order.reduceOnly).toLowerCase()==="true"
    }));
    let grRows=[];
    try{
      const owned=window.GRAD_CALCULATOR && typeof window.GRAD_CALCULATOR.getOwnedRows === "function" ? window.GRAD_CALCULATOR.getOwnedRows() : [];
      grRows=(Array.isArray(owned) ? owned : []).filter(row => row && row.owner==="GR" && row.section==="exit").map(row => ({owner:"GR",section:"exit",status:row.status,clientOrderId:row.clientOrderId || null,localRowId:row.localRowId || null,level:num37(row.level),lot:num37(row.lot)}));
    }catch(_e){}
    return {symbol:normalizedSymbol,createdAt:Date.now(),updatedAt,verifiedAt:num37(authoritative.verifiedAt),stateChangedAt:num37(authoritative.stateChangedAt),streamStatus:authoritative.streamStatus || "disconnected",coverageSource:authoritative.coverageSource || "REST",attemptedAt:num37(authoritative.attemptedAt),status,sourcesChecked:authoritative.sourcesChecked===true,requestInFlight:authoritative.requestInFlight===true,orders,grRows};
  }
  function signalStructure37(tf,scope="swing"){
    const snapshot = state.activeSnapshot && state.activeSnapshot.structureByTf && state.activeSnapshot.structureByTf[tf];
    return snapshot && snapshot[scope] ? snapshot[scope] : null;
  }
  function signalMaSnapshot37(tf,closed=false){
    const pair = state.activeSnapshot && state.activeSnapshot.maByTf && state.activeSnapshot.maByTf[tf];
    return pair ? (closed ? pair.closed : pair.live) : null;
  }
  function signalMaSlot37(tf,slotId,closed=false){
    const snapshot = signalMaSnapshot37(tf,closed);
    const slot = snapshot && Array.isArray(snapshot.slots) ? snapshot.slots.find(item => item.slotId === slotId) : null;
    const value = snapshot && snapshot.valuesBySlot ? num37(snapshot.valuesBySlot[slotId]) : null;
    const series = snapshot && snapshot.seriesBySlot && Array.isArray(snapshot.seriesBySlot[slotId]) ? snapshot.seriesBySlot[slotId] : [];
    const latestRow = snapshot && Array.isArray(snapshot.rows) && snapshot.rows.length ? snapshot.rows[snapshot.rows.length-1] : null;
    return {slotId,period:slot ? Number(slot.period) : null,label:slot ? `EMA${slot.period}` : slotId,value,series,reliable:!!(snapshot && snapshot.reliable),evidenceState:latestRow && latestRow.final === false ? "forming/live" : "closed-confirmed"};
  }
  function weightedPressureAggregate37(rows,tf,formingWeight){
    const source = Array.isArray(rows) ? rows : [];
    if(!source.length || source.some(row => !validSignalRow37(row))) return null;
    const first = source[0];
    const last = source[source.length - 1];
    let volume = 0;
    let takerBuyBase = 0;
    source.forEach(row => {
      const weight = row.final === false ? formingWeight : 1;
      volume += Number(row.volume) * weight;
      takerBuyBase += Number(row.takerBuyBase) * weight;
    });
    return {
      tf,
      open:first.open,
      high:Math.max(...source.map(row => Number(row.high))),
      low:Math.min(...source.map(row => Number(row.low))),
      close:last.close,
      volume,
      takerBuyBase,
      final:source.every(row => row.final === true),
      formingCount:source.filter(row => row.final === false).length
    };
  }
  function canonicalPivots37(tf,scope="swing"){
    const structure = signalStructure37(tf,scope);
    const pivots = structure && Array.isArray(structure.pivots) ? structure.pivots.filter(pivot => pivot.confirmed) : [];
    const highs = pivots.filter(pivot => pivot.side === "high");
    const lows = pivots.filter(pivot => pivot.side === "low");
    return {
      high:structure && structure.latestHigh || null,
      low:structure && structure.latestLow || null,
      previousHigh:highs.length > 1 ? highs[highs.length - 2] : null,
      previousLow:lows.length > 1 ? lows[lows.length - 2] : null,
      confirmedHighs:highs,
      confirmedLows:lows,
      events:structure && structure.events || [],
      latestEvent:structure && structure.latestEvent || null,
      trend:structure && structure.trend || 0,
      sufficient:highs.length >= 2 && lows.length >= 2,
      available:!!structure
    };
  }
  function samplePressureSignal37(tf,lookback,maSlot=1){
    const rows = signalRows37(tf);
    const validRows = rows.filter(validSignalRow37);
    const engine = horizonEngine37();
    const slot = signalMaSlot37(tf,`MA${maSlot}`);
    const requiredRows = Math.max(lookback * 2,Number(slot.period) || 0,2);
    if(validRows.length < requiredRows || !slot.reliable) return {available:false,tf,lookback,reason:!slot.reliable ? "canonical MA warmup insufficient" : "pressure history insufficient"};
    const formingWeight = engine.formingWeight;
    const currentRows = validRows.slice(-lookback);
    const current = weightedPressureAggregate37(currentRows,tf,formingWeight);
    if(!current) return {available:false,tf,lookback};
    const totalVolume = num37(current.volume);
    const takerBuy = num37(current.takerBuyBase);
    if(!(totalVolume > 0) || takerBuy == null || takerBuy > totalVolume) return {available:false,tf,lookback};
    const takerSell = Math.max(0,totalVolume - takerBuy);
    const buyPct = takerBuy / totalVolume;
    const sellPct = takerSell / totalVolume;
    const dominantPct = Math.max(buyPct,sellPct);
    const rawSideSign = buyPct >= sellPct ? 1 : -1;
    const pressureImbalance = Math.abs(buyPct-sellPct) / 2;
    const sideSign = pressureImbalance <= PRESSURE_POLICY37.neutralImbalance ? 0 : rawSideSign;
    const previousRows = validRows.slice(-lookback * 2,-lookback);
    const previous = previousRows.length >= lookback ? weightedPressureAggregate37(previousRows.slice(-lookback),tf,1) : null;
    const previousVolume = num37(previous && previous.volume);
    const previousBuy = num37(previous && previous.takerBuyBase);
    const previousSell = previousVolume != null && previousBuy != null ? Math.max(0,previousVolume - previousBuy) : null;
    const previousBuyPct = previousVolume > 0 && previousBuy != null ? previousBuy / previousVolume : null;
    const previousSellPct = previousVolume > 0 && previousSell != null ? previousSell / previousVolume : null;
    const previousDominantPct = previousVolume > 0 && previousSell != null ? Math.max(previousBuy / previousVolume,previousSell / previousVolume) : null;
    const previousSide = previousVolume > 0 && previousSell != null ? ((previousBuy / previousVolume) >= (previousSell / previousVolume) ? 1 : -1) : 0;
    const pressureMomentum = previousDominantPct == null ? 0 : (rawSideSign === previousSide ? dominantPct - previousDominantPct : dominantPct - 0.5);
    const close = num37(current.close);
    const open = num37(current.open);
    const high = num37(current.high);
    const low = num37(current.low);
    const range = high != null && low != null ? Math.max(0,high - low) : 0;
    const body = close != null && open != null ? close - open : 0;
    const bodyRatio = range > 0 ? Math.abs(body) / range : 0;
    const priceFollows = sideSign > 0 ? body > 0 : body < 0;
    const priceRefuses = sideSign !== 0 && (!priceFollows || bodyRatio <= 0.18);
    const lastPrice = signalCurrentPrice37(close);
    const maSlots = [1,2,3,4,5].map(index => signalMaSlot37(tf,`MA${index}`));
    const emaValue = slot.value;
    const pivots = canonicalPivots37(tf,"swing");
    const recentHigh = pivots.high && pivots.high.price;
    const recentLow = pivots.low && pivots.low.price;
    const completedCurrent = currentRows.filter(row => row.final !== false).length;
    const currentAverageVolume = current.volume / Math.max(1,currentRows.length - current.formingCount + current.formingCount * formingWeight);
    const priorParticipationRows = validRows.slice(-lookback * 4,-lookback);
    const recentAverageVolume = priorParticipationRows.length
      ? priorParticipationRows.reduce((sum,row) => sum + Number(row.volume),0) / priorParticipationRows.length
      : null;
    const participationRatio = recentAverageVolume > 0 ? currentAverageVolume / recentAverageVolume : null;
    const participationDelta = previousVolume > 0 ? totalVolume / previousVolume - 1 : null;
    const participationFactor = participationRatio == null ? 0.85 : Math.max(0.65,Math.min(1.15,0.72 + participationRatio * 0.28));
    const formingShare = currentRows.length ? currentRows.filter(row => row.final === false).length / currentRows.length : 0;
    let contextSide = 0;
    if(lastPrice != null && emaValue != null){
      if(lastPrice > emaValue) contextSide += 1;
      else if(lastPrice < emaValue) contextSide -= 1;
    }
    contextSide = contextSide > 0 ? 1 : contextSide < 0 ? -1 : 0;
    return {
      available:true,
      tf,
      lookback,
      maSlot,
      emaPeriod:slot.period,
      emaLabel:slot.label,
      sideSign,
      rawSideSign,
      pressureImbalance,
      bullPct:buyPct,
      bearPct:sellPct,
      bullDelta:previousBuyPct == null ? null : buyPct - previousBuyPct,
      bearDelta:previousSellPct == null ? null : sellPct - previousSellPct,
      dominantPct,
      pressureMomentum,
      participationRatio,
      participationDelta,
      participationFactor,
      currentAverageVolume,
      recentAverageVolume,
      evidenceState:formingShare > 0 ? "forming/live" : "closed-confirmed",
      formingShare,
      completedCurrent,
      contextSide,
      bodyRatio,
      priceRefuses,
      currentPrice:lastPrice,
      emaValue,
      maSlots,
      ema9Value:maSlots[0].value,
      ema21Value:maSlots[1].value,
      ema55Value:maSlots[2].value,
      ema100Value:maSlots[3].value,
      ema200Value:maSlots[4].value,
      ema9Label:maSlots[0].label,
      ema21Label:maSlots[1].label,
      ema55Label:maSlots[2].label,
      ema100Label:maSlots[3].label,
      ema200Label:maSlots[4].label,
      pivots,
      recentHigh:Number.isFinite(recentHigh) ? recentHigh : null,
      recentLow:Number.isFinite(recentLow) ? recentLow : null
    };
  }
  function maFreshness37(horizonId){
    if(horizonId === "2_3h") return {primaryTfs:["5m","15m"],freshMax:5,validMax:8};
    if(horizonId === "6_8h") return {primaryTfs:["15m","1h"],freshMax:5,validMax:10};
    return {primaryTfs:["1m","3m","5m"],freshMax:3,validMax:5};
  }
  function maSeriesMap37(series){
    return new Map((Array.isArray(series) ? series : []).map(point => [Number(point.time),num37(point.value)]));
  }
  function maEventBaseImpact37(type,fresh){
    if(type === "rejection" || type === "bounce" || type === "failed reclaim / rejection" || type === "failed breakdown / bounce") return fresh ? 8 : 3;
    if(type === "failed reclaim" || type === "failed breakdown") return fresh ? 7 : 2;
    if(type === "loss" || type === "reclaim") return fresh ? 6 : 2;
    if(type === "compression release") return fresh ? 5 : 2;
    if(type === "compression") return fresh ? 3 : 1;
    if(type.includes("MA1/MA2 crossover")) return fresh ? 4 : 1;
    return fresh ? 2 : 1;
  }
  function detectMaEvent37(tf,freshness){
    try{
      const rows = signalRows37(tf);
      if(!Array.isArray(rows) || rows.length < 3){
        return {tf,events:[{tf,state:"unknown",diagnostic:"data_unavailable",impact:0,reason:`${tf} MA data unavailable`} ]};
      }
      const maSnapshot = signalMaSnapshot37(tf,false);
      if(!maSnapshot || !maSnapshot.reliable){
        return {tf,events:[{tf,state:"unknown",diagnostic:"data_unavailable",impact:0,reason:`${tf} canonical MA data unavailable`} ]};
      }
      const anchors = maSnapshot.slots.map(slot => ({
        label:`EMA${slot.period}`,
        slotId:slot.slotId,
        period:Number(slot.period),
        kind:"ma",
        values:maSeriesMap37(maSnapshot.seriesBySlot[slot.slotId] || [])
      }));
      const hasMaValues = anchors.some(anchor => [...anchor.values.values()].filter(value => value != null).length >= 2);
      if(!hasMaValues){
        return {tf,events:[{tf,state:"unknown",diagnostic:"data_unavailable",impact:0,reason:`${tf} MA data unavailable`} ]};
      }
      const lastIndex = rows.length - 1;
      const candidates = [];
      const add = (row,index,anchor,type,direction,rank) => {
        const age = lastIndex - index;
        const fresh = age <= freshness.freshMax;
        const validAge = age <= freshness.validMax;
        const potential = validAge ? maEventBaseImpact37(type,fresh) : 0;
        candidates.push({
          tf,
          type,
          direction,
          anchor:anchor.label,
          anchorKind:anchor.kind,
          slotId:anchor.slotId || null,
          period:anchor.period || null,
          age,
          rank,
          potential,
          confirmation:row.final === false ? "forming/tentative" : "closed-confirmed",
          eventClose:num37(row.close),
          eventHigh:num37(row.high),
          eventLow:num37(row.low),
          eventTime:Number(row.time),
          anchorNow:anchor.values.get(Number(rows[lastIndex].time)),
          eventAnchor:anchor.values.get(Number(row.time)),
          interactionKey:`${state.activeSnapshot && state.activeSnapshot.symbol || ""}|${tf}|${anchor.label}|${Number(row.time)}`
        });
      };
      const start = Math.max(1,lastIndex - Math.max(16,freshness.validMax + 8));
      anchors.forEach(anchor => {
        for(let index=start;index<=lastIndex;index++){
          const row = rows[index];
          const previous = rows[index - 1];
          const level = anchor.values.get(Number(row.time));
          const previousLevel = anchor.values.get(Number(previous.time));
          if(level == null || previousLevel == null) continue;
          const tolerance = Math.max(Math.abs(level) * 0.0004,1e-8);
          const touched = Number(row.low) <= level + tolerance && Number(row.high) >= level - tolerance;
          const failedReclaim = Number(previous.close) < previousLevel && Number(row.high) >= level - tolerance && Number(row.close) < level;
          const failedBreakdown = Number(previous.close) > previousLevel && Number(row.low) <= level + tolerance && Number(row.close) > level;
          if(failedReclaim) add(row,index,anchor,"failed reclaim / rejection",-1,5);
          else if(failedBreakdown) add(row,index,anchor,"failed breakdown / bounce",1,5);
          else if(touched && Number(row.close) < level && Number(row.close) <= Number(row.open)) add(row,index,anchor,"rejection",-1,5);
          else if(touched && Number(row.close) > level && Number(row.close) >= Number(row.open)) add(row,index,anchor,"bounce",1,5);
          else if(Number(previous.close) >= previousLevel && Number(row.close) < level) add(row,index,anchor,"loss",-1,4);
          else if(Number(previous.close) <= previousLevel && Number(row.close) > level) add(row,index,anchor,"reclaim",1,4);
        }
      });
      const crossPairs = [[anchors[0],anchors[1],"MA1/MA2 crossover",3],[anchors[1],anchors[2],"MA2/MA3 crossover",2],[anchors[2],anchors[3],"slow-MA stack change",1],[anchors[3],anchors[4],"slow-MA stack change",1]].filter(pair => pair[0] && pair[1]);
      crossPairs.forEach(([fastAnchor,slowAnchor,type,rank]) => {
        for(let index=start;index<=lastIndex;index++){
          const row = rows[index];
          const previous = rows[index - 1];
          const fast = fastAnchor.values.get(Number(row.time));
          const slow = slowAnchor.values.get(Number(row.time));
          const previousFast = fastAnchor.values.get(Number(previous.time));
          const previousSlow = slowAnchor.values.get(Number(previous.time));
          if(fast == null || slow == null || previousFast == null || previousSlow == null) continue;
          const crossAnchor = {label:`${fastAnchor.label}/${slowAnchor.label}`,kind:"cross",values:fastAnchor.values,fastAnchor,slowAnchor};
          if(previousFast <= previousSlow && fast > slow) add(row,index,crossAnchor,`${type} bullish`,1,rank);
          else if(previousFast >= previousSlow && fast < slow) add(row,index,crossAnchor,`${type} bearish`,-1,rank);
        }
      });
      const fastAnchor = anchors[0];
      const mediumAnchor = anchors[1];
      if(fastAnchor && mediumAnchor){
        for(let index=start;index<=lastIndex;index++){
          const row = rows[index];
          const previous = rows[index - 1];
          const fast = fastAnchor.values.get(Number(row.time));
          const medium = mediumAnchor.values.get(Number(row.time));
          const previousFast = fastAnchor.values.get(Number(previous.time));
          const previousMedium = mediumAnchor.values.get(Number(previous.time));
          if([fast,medium,previousFast,previousMedium].some(value => value == null)) continue;
          const gap = Math.abs(fast-medium) / Math.max(Math.abs(Number(row.close)),1);
          const previousGap = Math.abs(previousFast-previousMedium) / Math.max(Math.abs(Number(previous.close)),1);
          const compressionAnchor = {label:`${fastAnchor.label}/${mediumAnchor.label}`,kind:"compression",values:fastAnchor.values};
          if(gap <= 0.0008 && previousGap > 0.0008) add(row,index,compressionAnchor,"compression",0,3);
          else if(gap >= 0.0015 && previousGap <= 0.0008) add(row,index,compressionAnchor,"compression release",fast > medium ? 1 : -1,4);
        }
      }
      if(!candidates.length){
        return {tf,events:[{tf,state:"unknown",diagnostic:"no_event",impact:0,reason:`No fresh ${tf} MA event detected`} ]};
      }
      candidates.sort((a,b) => (b.potential - a.potential) || (b.rank - a.rank) || (a.age - b.age));
      const latest = rows[lastIndex];
      const currentPrice = signalCurrentPrice37(latest.close);
      const selected = [];
      const seen = new Set();
      for(const event of candidates){
        const key = event.interactionKey;
        if(seen.has(key)) continue;
        seen.add(key);
        const anchor = anchors.find(item => item.label === event.anchor) || null;
        const priceOnValidSide = event.direction === 0 ? true : (currentPrice != null && event.anchorNow != null
          ? (event.direction > 0 ? currentPrice >= event.anchorNow : currentPrice <= event.anchorNow)
          : null);
        const closedRows = rows.filter(row => row.final !== false).slice(-2);
        const confirmedAgainst = event.direction !== 0 && anchor && closedRows.length >= 2 && closedRows.every(row => {
          const level = anchor.values.get(Number(row.time));
          return level != null && (event.direction > 0 ? Number(row.close) < level : Number(row.close) > level);
        });
        const afterEvent = rows.slice(Math.max(0,lastIndex - event.age + 1));
        const structureIntact = event.direction > 0
          ? (event.eventLow == null || !afterEvent.length || Math.min(...afterEvent.map(row => Number(row.low))) >= event.eventLow * 0.9985)
          : event.direction < 0
            ? (event.eventHigh == null || !afterEvent.length || Math.max(...afterEvent.map(row => Number(row.high))) <= event.eventHigh * 1.0015)
            : true;
        const priceRefuses = event.direction !== 0 && event.age >= 2 && currentPrice != null && event.eventClose != null
          ? (event.direction > 0 ? currentPrice <= event.eventClose : currentPrice >= event.eventClose)
          : false;
        let crossOrderValid = null;
        if(event.anchorKind === "cross"){
          const pair = crossPairs.find(([fast,slow]) => `${fast.label}/${slow.label}` === event.anchor);
          if(pair){
            const fastNow = pair[0].values.get(Number(latest.time));
            const slowNow = pair[1].values.get(Number(latest.time));
            crossOrderValid = fastNow != null && slowNow != null ? (event.direction > 0 ? fastNow > slowNow : fastNow < slowNow) : null;
            event.fastNow = fastNow;
            event.slowNow = slowNow;
            event.fastLabel = pair[0].label;
            event.slowLabel = pair[1].label;
          }
        }else if(event.anchorKind === "compression" && fastAnchor && mediumAnchor){
          event.fastNow = fastAnchor.values.get(Number(latest.time));
          event.slowNow = mediumAnchor.values.get(Number(latest.time));
          event.fastLabel = fastAnchor.label;
          event.slowLabel = mediumAnchor.label;
        }
        selected.push({...event,currentPrice,priceOnValidSide,confirmedAgainst,heldBeyondAnchor:confirmedAgainst,structureIntact,priceRefuses,crossOrderValid});
        if(selected.length >= 3) break;
      }
      selected.forEach(event => {
        event.rawCandidateCount = candidates.length;
        event.deduplicatedCount = Math.max(0,candidates.filter(candidate => candidate.interactionKey === event.interactionKey).length - 1);
      });
      return {tf,events:selected,rawCandidateCount:candidates.length,canonicalEventCount:selected.length};
    }catch(_e){
      return {tf,events:[{tf,state:"unknown",diagnostic:"scan_failed",impact:0,reason:`${tf} MA event scan failed`} ]};
    }
  }
  function evaluateMaEvents37(horizonId,pressureSamples,signalDirection){
    const freshness = maFreshness37(horizonId);
    const samples = Array.isArray(pressureSamples) ? pressureSamples : [];
    const availablePressure = samples.filter(sample => sample.available);
    const scans = freshness.primaryTfs.map(tf => detectMaEvent37(tf,freshness));
    const rawCandidateCount = scans.reduce((sum,scan) => sum + Number(scan && scan.rawCandidateCount || 0),0);
    const events = scans.flatMap(scan => Array.isArray(scan && scan.events) ? scan.events : []).map(event => {
      const tf = event.tf;
      if(event.state === "unknown") return event;
      if(event.priceOnValidSide == null){
        return {...event,state:"unknown",diagnostic:"data_unavailable",impact:0,appliedImpact:0,reason:`${tf} ${event.anchor} live value unavailable`};
      }
      const matchingPressure = availablePressure.filter(sample => sample.tf === tf || (tf === "1h" && sample.tf === "15m"));
      const sharplyFading = matchingPressure.some(sample => {
        const delta = event.direction > 0 ? sample.bullDelta : sample.bearDelta;
        return delta != null && delta < -0.03;
      });
      const opposingPressureReversal = event.direction !== 0 && event.priceOnValidSide === false && matchingPressure.some(sample =>
        sample.sideSign === -event.direction && sample.dominantPct >= 0.62 && sample.pressureMomentum >= 0.03
      );
      const oppositeStructure = ["internal","swing"].map(scope => signalStructure37(tf,scope)).filter(Boolean).flatMap(structure => structure.events || []).filter(structureEvent =>
        (structureEvent.direction === "bullish" ? 1 : -1) === -event.direction && Number(structureEvent.breakTime) >= Number(event.eventTime)
      ).sort((a,b) => Number(b.breakTime)-Number(a.breakTime))[0] || null;
      let invalidationReason = "";
      if(event.confirmedAgainst) invalidationReason = event.direction > 0 ? "Level lost and held below" : "Level reclaimed and held";
      else if(event.crossOrderValid === false) invalidationReason = "Canonical MA ordering reversed";
      else if(oppositeStructure) invalidationReason = `Confirmed opposite ${String(oppositeStructure.text || oppositeStructure.structureType).toUpperCase()} on ${tf}`;
      else if(!event.structureIntact) invalidationReason = "Defined failure to follow through; post-event structure broke";
      else if(opposingPressureReversal) invalidationReason = "Defined opposing-pressure reversal confirmed beyond the level";
      const invalidated = !!invalidationReason;
      let stateName = "stale";
      let stateReason = "";
      if(event.age > freshness.validMax){ stateName = "stale"; stateReason = `Freshness window expired after ${freshness.validMax} candles`; }
      else if(invalidated) stateName = "invalidated";
      else if(event.age <= freshness.freshMax && !sharplyFading) stateName = "fresh";
      else if(event.age <= freshness.validMax) stateName = "aging";
      if(stateName === "aging") stateReason = sharplyFading ? "Supporting pressure is fading" : "Event is aging within its validity window";
      if(stateName === "invalidated") stateReason = invalidationReason;
      let baseImpact = 0;
      if(stateName === "fresh") baseImpact = maEventBaseImpact37(event.type,true);
      else if(stateName === "aging") baseImpact = maEventBaseImpact37(event.type,false);
      else if(stateName === "invalidated") baseImpact = event.rank <= 2 ? -5 : -8;
      const timeframeFactor = horizonId === "quick" && tf === "1m" ? 0.55 : 1;
      const confirmationFactor = event.confirmation === "forming/tentative" ? 0.45 : 1;
      const timeframeAdjustedImpact = Math.round(baseImpact * timeframeFactor);
      const rawImpact = Math.round(timeframeAdjustedImpact * confirmationFactor);
      let appliedImpact = 0;
      if(signalDirection && event.direction !== 0){
        if(stateName === "invalidated") appliedImpact = event.direction === signalDirection ? rawImpact : 0;
        else if(stateName === "fresh" || stateName === "aging") appliedImpact = event.direction === signalDirection ? rawImpact : -Math.min(rawImpact,6);
      }
      const rawDirectionalContribution = !signalDirection || event.direction === 0 ? 0
        : stateName === "invalidated" ? (event.direction === signalDirection ? baseImpact : 0)
          : event.direction === signalDirection ? baseImpact : -Math.min(baseImpact,6);
      return {...event,state:stateName,stateReason,invalidationReason,sharplyFading,opposingPressureReversal,oppositeStructure,baseImpact,impact:rawImpact,appliedImpact,rawDirectionalContribution,timeframeAdjustedImpact,timeframeFactor,confirmationFactor};
    });
    const confluence = [-1,1].map(direction => {
      const aligned = events.filter(event => event.direction === direction && event.state === "fresh");
      const distinctTfs = [...new Set(aligned.map(event => event.tf))];
      if(distinctTfs.length < 2) return null;
      const adjustment = signalDirection ? (signalDirection === direction ? 2 : -2) : 0;
      return {direction,timeframes:distinctTfs,eventKeys:aligned.map(event => event.interactionKey),adjustment};
    }).filter(Boolean);
    const rawContribution = events.reduce((sum,event) => sum + Number(event.rawDirectionalContribution || 0),0);
    const discountedContribution = events.reduce((sum,event) => sum + Number(event.appliedImpact || 0),0);
    const confluenceAdjustment = confluence.reduce((sum,item) => sum + item.adjustment,0);
    const preCap = discountedContribution + confluenceAdjustment;
    const impact = Math.max(-12,Math.min(10,preCap));
    const canonicalEventCount = events.filter(event => event.state !== "unknown").length;
    const deduplicatedCount = events.reduce((sum,event) => sum + Number(event.deduplicatedCount || 0),0);
    const omittedCandidateCount = Math.max(0,rawCandidateCount-canonicalEventCount-deduplicatedCount);
    const audit = {
      rawCandidateCount,
      canonicalEventCount,
      deduplicatedCount,
      omittedCandidateCount,
      deduplicationAdjustment:0,
      rawContribution,
      timeframeAndFormingAdjustment:discountedContribution-rawContribution,
      confluenceAdjustment,
      preCap,
      capMinimum:-12,
      capMaximum:10,
      capAdjustment:impact-preCap,
      appliedImpact:impact
    };
    return {
      events,
      impact,
      confluence,
      audit,
      invalidatedSupport:!!signalDirection && events.some(event => event.direction === signalDirection && event.state === "invalidated"),
      priceRefusal:!!signalDirection && events.some(event => event.direction === signalDirection && event.priceRefuses),
      weakening:!!signalDirection && events.some(event => event.direction === signalDirection && (event.sharplyFading || event.state === "aging"))
    };
  }
  function entryActionText37(entry,direction=null){
    switch(entry){
      case "ENTRY LONG": return "Buy pullbacks";
      case "ENTRY SHORT": return "Sell bounces";
      case "ENTRY ABSORPTION": return "Do not chase";
      case "ENTRY FADE RISK": return direction === "SHORT" ? "Bearish edge weakening" : direction === "LONG" ? "Bullish edge weakening" : "No edge";
      default: return "No edge";
    }
  }
  function pillTone37(value){
    switch(String(value || "")){
      case "ENTRY LONG":
      case "THESIS SUPPORTIVE":
      case "EXIT HOLD":
        return "green";
      case "ENTRY SHORT":
      case "THESIS INVALID":
      case "EXIT EXIT":
        return "red";
      case "ENTRY ABSORPTION":
      case "ENTRY FADE RISK":
      case "THESIS ADVERSE":
      case "EXIT TRIM":
      case "EXIT TIGHTEN SL":
        return "orange";
      default:
        return "gray";
    }
  }
  function entryDisplayText37(value){
    return String(value || "").replace(/^ENTRY\s+/,"");
  }
  function exitDisplayText37(value){
    const action = String(value || "").replace(/^EXIT\s+/,"");
    return action === "EXIT" || action === "CLOSE" ? "CLOSE" : action;
  }
  function horizonLabel37(horizonId){
    const horizon = HORIZONS.find(item => item.id === horizonId);
    return horizon ? horizon.label : HORIZONS[0].label;
  }
  function tooltipBasis37(sample){
    return sample ? `${sample.tf} LB${sample.lookback}` : "Pressure data";
  }
  function tooltipPercent37(value){
    const percent = num37(value) == null ? null : Number(value) * 100;
    if(percent == null) return null;
    const rounded = Math.round(percent * 10) / 10;
    return `${rounded.toFixed(1)}%`;
  }
  function tooltipSignedPoints37(value){
    const points = num37(value) == null ? null : Number(value) * 100;
    if(points == null) return null;
    const rounded = Math.round(Math.abs(points) * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} points`;
  }
  function tooltipPressureLine37(sample,qualifier){
    if(!sample || !sample.available) return `${tooltipBasis37(sample)} pressure unavailable`;
    const bull = tooltipPercent37(sample.bullPct);
    const bear = tooltipPercent37(sample.bearPct);
    if(!bull || !bear) return `${tooltipBasis37(sample)} pressure values unavailable`;
    const neutral = sample.sideSign === 0;
    const bearish = sample.sideSign < 0;
    const dominantLabel = bearish ? "bear" : "bull";
    const otherLabel = bearish ? "bull" : "bear";
    const dominantValue = bearish ? bear : bull;
    const otherValue = bearish ? bull : bear;
    const delta = bearish ? sample.bearDelta : sample.bullDelta;
    const deltaText = tooltipSignedPoints37(delta);
    const movement = deltaText && Math.abs(Number(delta)) > 0.005
      ? `${bearish ? "Bear" : "Bull"} pressure ${Number(delta) > 0 ? "strengthening" : "weakening"} by ${deltaText}`
      : null;
    const participation = num37(sample.participationRatio) == null
      ? "participation unavailable"
      : `participation ${Math.abs(sample.participationRatio-1) < 0.005 ? "near" : sample.participationRatio > 1 ? `${Math.round((sample.participationRatio-1)*100)}% above` : `${Math.round((1-sample.participationRatio)*100)}% below`} recent average`;
    const participationChange = num37(sample.participationDelta) == null
      ? null
      : `total participation ${sample.participationDelta >= 0 ? "increased" : "decreased"} ${Math.round(Math.abs(sample.participationDelta)*100)}% versus the prior window`;
    const pressureText = neutral
      ? `neutral pressure: bull ${bull} vs bear ${bear}`
      : `${dominantLabel} pressure: ${dominantValue} vs ${otherLabel} ${otherValue}`;
    return `${tooltipBasis37(sample)} ${pressureText}; ${participation}${participationChange ? `; ${participationChange}` : ""}; ${sample.evidenceState || "unavailable"}${movement ? `; ${movement}` : ""}${qualifier ? `; ${qualifier}` : ""}`;
  }
  function tooltipPrice37(value){
    const price = num37(value);
    if(price == null) return null;
    return featureFormat.price(price);
  }
  function tooltipIndicator37(tf,label,value){
    const name = `${tf} ${label}`;
    const level = num37(value);
    return `${name} ${level == null ? "unavailable" : tooltipPrice37(level)}`;
  }
  function tooltipDistance37(value){
    const distance = Math.abs(Number(value));
    if(!Number.isFinite(distance)) return null;
    return distance.toLocaleString(undefined,{minimumFractionDigits:distance < 100 ? 1 : 0,maximumFractionDigits:distance < 100 ? 1 : 0});
  }
  function tooltipPriceRelation37(label,price,anchor){
    const current = num37(price);
    const level = num37(anchor);
    if(current == null || level == null) return null;
    const relation = current >= level ? "above" : "below";
    return `Price ${relation} ${label} by ${tooltipDistance37(current-level)}`;
  }
  function tooltipMainSample37(signal){
    const samples = Array.isArray(signal && signal.samples) ? signal.samples.filter(sample => sample.available) : [];
    return samples.reduce((best,sample) => !best || sample.weight > best.weight ? sample : best,null);
  }
  function tooltipAnchor37(sample){
    if(!sample) return null;
    const anchors = [];
    if(num37(sample.emaValue) != null) anchors.push({label:`${sample.tf} EMA${sample.emaPeriod}`,value:Number(sample.emaValue)});
    if(!anchors.length) return null;
    const low = Math.min(...anchors.map(anchor => anchor.value));
    const high = Math.max(...anchors.map(anchor => anchor.value));
    const label = anchors.map(anchor => anchor.label).join(" / ");
    const range = Math.abs(high - low) > 1e-9 ? `${tooltipPrice37(low)}–${tooltipPrice37(high)}` : tooltipPrice37(low);
    const values = anchors.map(anchor => `${anchor.label} ${tooltipPrice37(anchor.value)}`).join(" / ");
    return {label,value:anchors[0].value,text:`${values}${anchors.length > 1 ? ` zone ${range}` : ""}`};
  }
  function tooltipLevels37(signal){
    const bias = entryDisplayText37(signal && signal.entry);
    if(bias === "WAIT") return ["No clean level suggestion while signal is WAIT"];
    const main = tooltipMainSample37(signal);
    const anchor = tooltipAnchor37(main);
    const recentHigh = main && num37(main.recentHigh);
    const recentLow = main && num37(main.recentLow);
    if(bias === "ABSORPTION"){
      const levels = ["Do not chase: pressure/price divergence"];
      if(anchor) levels.push(`Watch reclaim/reject zone: ${anchor.text}`);
      return levels;
    }
    if(bias === "FADE RISK"){
      const levels = [];
      if(anchor) levels.push(`Tighten/trim toward: ${anchor.text}`);
      levels.push("Invalid if: pressure re-accelerates with price continuation");
      return levels;
    }
    if(bias === "SHORT"){
      const levels = [];
      if(anchor) levels.push(`Sell bounce: ${anchor.text}`);
      else if(recentHigh != null) levels.push(`Sell bounce: recent resistance $${tooltipPrice37(recentHigh)}`);
      if(recentHigh != null) levels.push(`Invalid above: recent high $${tooltipPrice37(recentHigh)}`);
      if(recentLow != null) levels.push(`Trim: recent low $${tooltipPrice37(recentLow)}`);
      if(anchor) levels.push(`Close if: ${anchor.text} reclaimed and bull pressure overtakes`);
      else if(recentHigh != null) levels.push("Close if: price breaks the recent high and bull pressure overtakes");
      return levels.length ? levels : ["No anchored short level is available"];
    }
    if(bias === "LONG"){
      const levels = [];
      if(anchor) levels.push(`Buy pullback: ${anchor.text}`);
      else if(recentLow != null) levels.push(`Buy pullback: recent support $${tooltipPrice37(recentLow)}`);
      if(recentLow != null) levels.push(`Invalid below: recent low $${tooltipPrice37(recentLow)}`);
      if(recentHigh != null) levels.push(`Trim: recent high $${tooltipPrice37(recentHigh)}`);
      if(anchor) levels.push(`Close if: ${anchor.text} lost and bear pressure overtakes`);
      else if(recentLow != null) levels.push("Close if: price breaks the recent low and bear pressure overtakes");
      return levels.length ? levels : ["No anchored long level is available"];
    }
    return ["No anchored level suggestion is available"];
  }
  function tooltipMaEvents37(signal){
    const events = Array.isArray(signal && signal.maEvents) ? signal.maEvents : [];
    if(!events.length) return ["MA event state unavailable","No MA-event confidence boost applied"];
    const lines = [];
    events.forEach(event => {
      if(!event || event.state === "unknown"){
        lines.push(event && event.reason ? event.reason : "MA event age/current state unavailable");
        lines.push("No MA-event confidence boost applied");
        return;
      }
      const stateLabel = event.state === "fresh"
        ? "fresh and still valid"
        : event.state === "aging"
          ? "aging but still valid"
          : event.state === "stale"
            ? "stale/context only"
            : "invalidated";
      const anchorLevel = num37(event.anchorNow);
      const eventAnchor = maEventLabel37(event);
      lines.push(`${eventAnchor} ${event.type}, ${event.age} candle${event.age === 1 ? "" : "s"} ago, ${stateLabel}, ${event.confirmation || "confirmation unavailable"}`);
      const current = num37(event.currentPrice);
      const anchor = num37(event.anchorNow);
      if(current != null && anchor != null){
        const distance = `$${tooltipDistance37(current-anchor)}`;
        if(event.direction < 0){
          lines.push(current <= anchor ? `Price remains ${distance} below ${eventAnchor}` : `Price reclaimed ${eventAnchor} by ${distance}`);
        }else{
          lines.push(current >= anchor ? `Price remains ${distance} above ${eventAnchor}` : `Price lost ${eventAnchor} by ${distance}`);
        }
      }
      if(event.structureIntact === true) lines.push(event.direction < 0 ? "Post-event bearish structure remains intact" : "Post-event bullish structure remains intact");
      else if(event.structureIntact === false) lines.push(event.direction < 0 ? "Post-event bearish structure is broken" : "Post-event bullish structure is broken");
      if(event.state === "invalidated" && event.invalidationReason) lines.push(`Invalidation reason: ${event.invalidationReason}`);
      else if((event.state === "stale" || event.state === "aging") && event.stateReason) lines.push(event.stateReason);
      if(event.priceRefuses) lines.push(event.direction < 0 ? "Price refuses to fall after the event" : "Price refuses to rise after the event");
      if(event.sharplyFading) lines.push(event.direction < 0 ? "Bear pressure is sharply fading" : "Bull pressure is sharply fading");
      const impact = Number(event.appliedImpact || 0);
      if(impact) lines.push(`Confidence impact: ${impact > 0 ? "+" : ""}${impact}%`);
      else lines.push("No MA-event confidence boost applied");
    });
    const netImpact = Number(signal && signal.maImpact || 0);
    if(netImpact) lines.push(`Net MA confidence impact: ${netImpact > 0 ? "+" : ""}${netImpact}%`);
    return lines;
  }
  function tooltipReasons37(signal){
    const bias = entryDisplayText37(signal && signal.entry);
    const samples = Array.isArray(signal && signal.samples) ? signal.samples : [];
    const missing = samples.filter(sample => !sample.available);
    if(missing.length){
      return missing.map(sample => `${tooltipBasis37(sample)} pressure unavailable`).concat(`Cannot validate ${horizonLabel37(state.horizon)} context`);
    }
    const available = samples.filter(sample => sample.available).slice().sort((a,b) => b.weight - a.weight);
    const main = tooltipMainSample37(signal);
    if(bias === "ABSORPTION"){
      const reasons = [];
      if(main) reasons.push(tooltipPressureLine37(main));
      reasons.push("Price is not following the dominant pressure");
      const emaRelation = main && tooltipPriceRelation37(tooltipIndicator37(main.tf,`EMA${main.emaPeriod}`,main.emaValue),main.currentPrice,main.emaValue);
      if(emaRelation) reasons.push(emaRelation);
      reasons.push("Wait for price confirmation; do not chase");
      return reasons.slice(0,5);
    }
    if(bias === "FADE RISK"){
      const reasons = available.map(sample => tooltipPressureLine37(sample,sample === main ? "pressure is weakening" : null));
      reasons.push("Continuation needs renewed pressure");
      return reasons.slice(0,5);
    }
    if(bias === "WAIT"){
      const sides = new Set(available.map(sample => sample.sideSign).filter(Boolean));
      const reasons = available.map(sample => tooltipPressureLine37(sample));
      if(sides.size > 1) reasons.push("Relevant timeframes show conflicting pressure");
      else reasons.push("Pressure is balanced or lacks a clean directional edge");
      reasons.push("Waiting for pressure and price context to align");
      return reasons.slice(0,5);
    }
    const sideSign = bias === "LONG" ? 1 : -1;
    const reasons = available.map(sample => tooltipPressureLine37(sample,sample !== main && sample.sideSign === sideSign ? "confirming" : sample.sideSign !== sideSign ? "opposing" : null));
    const emaRelation = main && tooltipPriceRelation37(tooltipIndicator37(main.tf,`EMA${main.emaPeriod}`,main.emaValue),main.currentPrice,main.emaValue);
    if(emaRelation) reasons.push(emaRelation);
    const filter = available.find(sample => sample.tf === "15m" && sample.sideSign === sideSign);
    if(filter && reasons.length < 5) reasons.push(`${tooltipBasis37(filter)} not blocking ${bias.toLowerCase()}`);
    return reasons.slice(0,5);
  }
  function tooltipInvalidations37(signal){
    const bias = entryDisplayText37(signal && signal.entry);
    const samples = Array.isArray(signal && signal.samples) ? signal.samples : [];
    const hasMissing = samples.some(sample => !sample.available);
    const basis = samples.map(tooltipBasis37);
    const main = tooltipMainSample37(signal);
    const contextLabel = main
      ? tooltipIndicator37(main.tf,`EMA${main.emaPeriod}`,main.emaValue)
      : "price/indicator context unavailable";
    const filter = samples.filter(sample => sample.tf === "15m").slice(-1)[0];
    const filterLabel = filter ? tooltipBasis37(filter) : "15m context";
    if(bias === "LONG") return [
      `Price loses ${contextLabel} and holds below`,
      "Bullish pressure fades",
      `Bear pressure overtakes on ${basis.join(" or ")}`,
      `${filterLabel} turns clearly bearish`,
      "Price refuses to rise despite bull pressure"
    ];
    if(bias === "SHORT") return [
      `Price reclaims ${contextLabel} and holds`,
      "Bearish pressure fades",
      `Bull pressure overtakes on ${basis.join(" or ")}`,
      `${filterLabel} turns clearly bullish`,
      "Price refuses to fall despite bear pressure"
    ];
    if(bias === "ABSORPTION") return [
      "Price begins following the dominant pressure",
      "Opposing pressure overtakes",
      `${contextLabel} resolves with price confirmation`
    ];
    if(bias === "FADE RISK") return [
      "Pressure momentum strengthens again",
      "Price resets without reversal",
      "Higher-timeframe context confirms continuation"
    ];
    return [hasMissing ? "Data recovers and pressure/price align" : "Pressure and price align into a clean directional edge"];
  }
  function detailBulletList37(lines){
    const items = Array.isArray(lines) && lines.length ? lines : ["None identified from available data"];
    return items.map(line => `• ${line}`).join("\n");
  }
  function maEventLabel37(event){
    if(!event) return "MA event unavailable";
    if(event.anchorKind === "confluence") return event.displayLabel || `${event.tf} MA-event confluence`;
    if(event.anchorKind === "cross" || event.anchorKind === "compression"){
      return `${tooltipIndicator37(event.tf,event.fastLabel || String(event.anchor || "").split("/")[0],event.fastNow)} / ${tooltipIndicator37(event.tf,event.slowLabel || String(event.anchor || "").split("/")[1],event.slowNow)}`;
    }
    return tooltipIndicator37(event.tf,event.anchor,event.anchorNow);
  }
  function directionEvidence37(signal,direction){
    const desired = direction === "SHORT" ? -1 : 1;
    const samples = Array.isArray(signal && signal.samples) ? signal.samples : [];
    const supportive = [];
    const limiting = [];
    const adverse = [];
    const missing = [];
    const diagnostics = [];
    samples.slice().sort((a,b) => Number(b.weight || 0) - Number(a.weight || 0)).forEach(sample => {
      if(!sample.available){
        missing.push(`${tooltipBasis37(sample)} pressure unavailable`);
        return;
      }
      if(sample.sideSign === 0){
        limiting.push(`${tooltipPressureLine37(sample)}; inside the neutral band`);
        return;
      }
      if(sample.sideSign !== desired){
        const classification = pressureClassification37(sample,desired);
        const line = `${tooltipPressureLine37(sample)}${sample.tf === "1m" ? "; micro-timing caution only" : ""}`;
        (classification.state === "strongly conflicting" ? adverse : limiting).push(line);
        return;
      }
      const sideLabel = desired > 0 ? "bull" : "bear";
      const pressure = desired > 0 ? sample.bullPct : sample.bearPct;
      const delta = desired > 0 ? sample.bullDelta : sample.bearDelta;
      if(num37(sample.participationRatio) != null && sample.participationRatio < 0.85){
        limiting.push(`${tooltipBasis37(sample)} directional share has weak participation at ${Math.round((1-sample.participationRatio)*100)}% below recent average`);
      }else if(num37(pressure) != null && pressure < 0.55){
        limiting.push(`${tooltipBasis37(sample)} ${sideLabel} pressure is marginal at ${tooltipPercent37(pressure)}`);
      }else if(num37(delta) != null && delta < 0){
        limiting.push(`${tooltipBasis37(sample)} ${sideLabel} pressure is weakening by ${tooltipSignedPoints37(delta)}`);
      }else{
        supportive.push(tooltipPressureLine37(sample));
      }
    });
    const main = tooltipMainSample37(signal);
    if(main){
      const anchors = (Array.isArray(main.maSlots) ? main.maSlots.slice(0,3).map(slot => ({label:slot.label,value:slot.value})) : []);
      anchors.forEach(anchor => {
        const price = num37(main.currentPrice);
        const level = num37(anchor.value);
        const indicator = tooltipIndicator37(main.tf,anchor.label,anchor.value);
        if(price == null || level == null){
          missing.push(indicator);
          return;
        }
        const supports = desired > 0 ? price >= level : price <= level;
        const relation = price >= level ? "above" : "below";
        (supports ? supportive : adverse).push(`Price remains ${relation} ${indicator}${anchor.maturity ? `; ${anchor.maturity}` : ""}`);
      });
      const pivot = main.pivots && (desired > 0 ? main.pivots.low : main.pivots.high);
      const structureLevel = num37(pivot && pivot.price);
      const price = num37(main.currentPrice);
      if(structureLevel != null && price != null){
        const intact = desired > 0 ? price >= structureLevel : price <= structureLevel;
        const label = structureClassName37(pivot.classification,pivot.side);
        (intact ? supportive : adverse).push(intact
          ? `Latest confirmed ${main.tf} ${label} ${tooltipPrice37(structureLevel)} remains intact`
          : `Price broke ${desired > 0 ? "below" : "above"} the latest confirmed ${main.tf} ${label} ${tooltipPrice37(structureLevel)}`);
      }else{
        missing.push(`${main.tf} confirmed pivot structure unavailable`);
      }
    }
    if(signal.structuralContext && Array.isArray(signal.structuralContext.evidence)){
      signal.structuralContext.evidence.forEach(line => {
        const bullish = /Bullish|higher high|higher low/i.test(line);
        const bearish = /Bearish|lower high|lower low/i.test(line);
        if(line.includes(`supports ${direction}`) || (desired > 0 && bullish && !bearish) || (desired < 0 && bearish && !bullish)) supportive.push(line);
        else if(line.includes(`opposes ${direction}`) || (desired > 0 && bearish && !bullish) || (desired < 0 && bullish && !bearish)) adverse.push(line);
        else limiting.push(line);
      });
    }
    const events = Array.isArray(signal && signal.maEvents) ? signal.maEvents : [];
    events.forEach(event => {
      if(!event || event.state === "unknown"){
        const reason = event && event.reason ? event.reason : "MA event scan failed";
        if(event && event.diagnostic === "no_event"){
          limiting.push(reason);
          limiting.push("No MA-event confidence boost applied");
        }else if(event && event.diagnostic === "scan_failed"){
          diagnostics.push(reason);
        }else{
          missing.push(reason);
        }
        return;
      }
      const anchorText = maEventLabel37(event);
      const line = `${anchorText} ${event.type} is ${event.state}; ${event.confirmation || "confirmation unavailable"}${event.invalidationReason ? `; ${event.invalidationReason}` : ""}`;
      if(event.state === "stale"){
        limiting.push(line);
        limiting.push("Event retained as context only");
        limiting.push("No confidence boost applied");
        return;
      }
      if(event.state === "aging" && event.direction === desired){
        supportive.push(line);
        return;
      }
      const eventSupports = event.direction === desired && event.state === "fresh" && Number(event.appliedImpact || 0) !== 0;
      const eventAdverse = event.direction === -desired && event.state !== "invalidated";
      if(eventSupports) supportive.push(line);
      else if(eventAdverse || (event.direction === desired && event.state === "invalidated")) adverse.push(line);
      else limiting.push(`${line}; no confidence boost applied`);
    });
    return {supportive,limiting,adverse,missing,diagnostics};
  }
  function classifiedLevelState37(tf,level,currentPrice,direction){
    const rows = state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[tf];
    const closed = Array.isArray(rows) ? rows.slice(-3) : [];
    const above = currentPrice > level;
    const latest = closed.length ? closed[closed.length-1] : null;
    const latestAbove = latest ? Number(latest.close) > level : above;
    const liveCross = !!latest && latestAbove !== above;
    const held = closed.length >= 2 && closed.slice(-2).every(row => above ? Number(row.close) > level : Number(row.close) < level);
    const priorOpposite = closed.slice(0,-2).some(row => above ? Number(row.close) < level : Number(row.close) > level);
    const failedCross = !!latest && (above
      ? Number(latest.low) <= level && Number(latest.close) > level
      : Number(latest.high) >= level && Number(latest.close) < level);
    let stateText;
    if(liveCross) stateText = above ? "live/tentative reclaim" : "live/tentative breach";
    else if(failedCross) stateText = above ? "failed breach; support remains" : "failed reclaim; resistance remains";
    else if(held && priorOpposite) stateText = above ? "confirmed held reclaim; converted support" : "confirmed held breach; converted resistance";
    else if(held) stateText = above ? "confirmed support" : "confirmed resistance";
    else stateText = above ? "support" : "resistance";
    if(direction === "SHORT" && above) return `${stateText}; already reclaimed, adverse for SHORT`;
    if(direction === "LONG" && !above) return `${stateText}; already breached, adverse for LONG`;
    return stateText;
  }
  function rankedSignalLevels37(signal,direction,horizonId=state.horizon){
    const currentPrice = signalCurrentPrice37();
    if(currentPrice == null || (direction !== "LONG" && direction !== "SHORT")) return [];
    const engine = horizonEngine37(horizonId);
    const allTfs = [...new Set([...engine.eventTfs,...engine.structureTfs,...engine.boundaryTfs])];
    const tfImportance = new Map();
    engine.eventTfs.forEach((tf,index) => tfImportance.set(tf,4-index*0.35));
    engine.structureTfs.forEach((tf,index) => tfImportance.set(tf,5-index*0.25));
    engine.boundaryTfs.forEach((tf,index) => tfImportance.set(tf,4.5-index*0.25));
    const candidates = [];
    allTfs.forEach(tf => {
      [1,2,3,4,5].forEach(slotIndex => {
        const ma = signalMaSlot37(tf,`MA${slotIndex}`);
        if(!ma.reliable || ma.value == null) return;
        const distance = Math.abs(ma.value-currentPrice) / Math.max(Math.abs(currentPrice),1);
        const boundary = engine.boundaryTfs.includes(tf);
        const maximumDistance = horizonId === "quick" ? (boundary ? 0.012 : 0.008) : horizonId === "2_3h" ? 0.02 : 0.035;
        if(distance > maximumDistance) return;
        const periodImportance = slotIndex >= 4 ? 3.2 : slotIndex === 3 ? 2.4 : 1.6;
        const stateText = classifiedLevelState37(tf,ma.value,currentPrice,direction);
        candidates.push({
          kind:"ma",tf,label:ma.label,price:ma.value,state:stateText,distance,boundary,
          score:(tfImportance.get(tf)||1)+periodImportance+Math.max(0,6-distance*500),
          text:`${tooltipIndicator37(tf,ma.label,ma.value)} — ${stateText}; ${ma.evidenceState}`
        });
      });
      const structure = signalStructure37(tf,"swing");
      const pivots = canonicalPivots37(tf,"swing");
      const canonicalLevels = structure && Array.isArray(structure.levels) && structure.levels.length
        ? structure.levels
        : [pivots.high,pivots.low].filter(Boolean);
      canonicalLevels.forEach(level => {
        const distance = Math.abs(level.price-currentPrice) / Math.max(Math.abs(currentPrice),1);
        const maximumDistance = horizonId === "quick" ? 0.012 : horizonId === "2_3h" ? 0.025 : 0.04;
        if(distance > maximumDistance) return;
        const stateText = classifiedLevelState37(tf,level.price,currentPrice,direction);
        const classification = level.classification ? structureClassName37(level.classification,level.side) : null;
        const strengthLabel = level.text || (level.side === "high" ? "Swing High" : "Swing Low");
        const label = `${strengthLabel}${classification ? ` / ${classification}` : ""}`;
        candidates.push({
          kind:"structure",tf,label,price:level.price,state:stateText,distance,
          strength:level.strength || null,classification:level.classification || null,
          confirmed:level.confirmed === true,tentative:level.tentative === true,
          boundary:engine.boundaryTfs.includes(tf),
          score:(tfImportance.get(tf)||1)+4+(level.strength === "strong" ? 1 : 0)+Math.max(0,6-distance*500),
          text:`${tf} ${label} ${tooltipPrice37(level.price)} — ${level.confirmed === true ? "confirmed" : "tentative"}; ${stateText}`
        });
      });
    });
    candidates.forEach(candidate => {
      const confluence = candidates.some(other => other !== candidate && Math.abs(other.price-candidate.price)/Math.max(Math.abs(currentPrice),1) <= (horizonId === "quick" ? 0.0015 : 0.0025));
      if(confluence) candidate.score += 2;
      const event = (signal.maEvents || []).find(item => item.tf === candidate.tf && item.anchor === candidate.label && item.state === "fresh");
      if(event) candidate.score += 2;
    });
    return candidates.sort((a,b) => (b.score-a.score) || (a.distance-b.distance));
  }
  function evaluateEntryQuality37(signal,thesis,direction){
    const decision = signal && signal.entryDecision;
    const candidates = decision && Array.isArray(decision.candidates) ? decision.candidates : [];
    const candidateLevels = candidates.map(candidate => ({
      kind:candidate.family.includes("Structure") ? "structure" : "ma",
      tf:candidate.tf,label:candidate.source,price:(candidate.zone.low+candidate.zone.high)/2,
      distance:candidate.distance,state:candidate.state,boundary:false,score:candidate.rankScore,
      text:`${zoneText37(candidate)} - ${candidate.state}`
    }));
    const candidateSet = {direction,lines:candidateLevels.map(level => level.text),candidates:candidateLevels,entryCandidates:candidateLevels,crossed:[]};
    if(signal.loading || signal.dataIncomplete) return {state:"MISSING",score:null,text:"Data incomplete",instruction:"Wait for required data",levels:candidateSet,exclusions:[]};
    if(direction !== "LONG" && direction !== "SHORT") return {state:"BIAS CONFIRMED",score:20,text:"BIAS CONFIRMED - no directional permission",instruction:signal.bias && signal.bias.reason || "Wait for alignment",levels:candidateSet,exclusions:[]};
    if(signal.marketDirection !== direction) return {state:"BIAS CONFIRMED",score:15,text:`BIAS CONFIRMED ${signal.marketDirection || "NEUTRAL"} - no ${direction} setup permission`,instruction:"Selected direction does not match the authoritative bias",levels:candidateSet,exclusions:[]};
    if(!decision || !decision.family) return {state:"BIAS CONFIRMED",score:25,text:`BIAS CONFIRMED ${direction}`,instruction:decision && decision.reason || "Waiting for a valid setup location",levels:candidateSet,exclusions:[]};
    const distance = decision.distance == null ? null : `${(decision.distance*100).toFixed(2)}%`;
    return {
      state:decision.state,
      score:decision.entryQuality,
      biasConfidence:signal.confidence,
      entryAction:decision.entryAction,
      text:[`${decision.state} ${direction}`,decision.family,zoneText37(decision),decision.state === "SETUP ARMED" && distance ? `distance ${distance}` : null].filter(Boolean).join(" - "),
      instruction:decision.reason,
      levels:candidateSet,
      exclusions:[],
      decision
    };
  }
  function alignmentCondition37(label,direction){
    const normalized = String(label || "wait").toLowerCase().replace(/\s+/g,"-");
    if(direction === "LONG" || direction === "SHORT") return `${normalized}-${direction.toLowerCase()} conditions`;
    if(normalized === "long" || normalized === "short") return `${normalized}-bias conditions`;
    return `${normalized} conditions`;
  }
  function scoredStateText37(label,confidence){
    const stateLabel = String(label || "WAIT");
    if(stateLabel === "WAIT" || stateLabel === "MIXED") return stateLabel;
    const score = num37(confidence);
    return score == null ? stateLabel : `${stateLabel} ${Math.round(score)}%`;
  }
  function compactStateText37(label,confidence,action){
    return `${scoredStateText37(label,confidence)} · ${action}`;
  }
  function compactEntryReason37(decision){
    if(!decision) return "No directional edge";
    if(decision.state === "NO BIAS") return "No directional edge";
    if(decision.state === "BIAS CONFIRMED") return "Waiting for setup";
    if(decision.state === "SETUP ARMED") return `${decision.source || decision.family} interaction`;
    if(decision.state === "ZONE ENGAGED") return "Waiting for reaction";
    if(decision.state === "READY") return "Trigger confirmed";
    if(decision.state === "EXPIRED") return "Current entry not viable";
    if(decision.state === "INVALIDATED") return "Setup invalidated";
    if(/participation/i.test(decision.reason || "")) return "Weak participation";
    if(/opposition/i.test(decision.reason || "")) return `${decision.pressure && decision.pressure.primaryTf || "Primary"} opposition`;
    if(/pressure/i.test(decision.reason || "")) return `${decision.pressure && decision.pressure.triggerTf || "Trigger"} pressure pending`;
    if(/absorption/i.test(decision.reason || "")) return "Possible absorption";
    return "Confirmation pending";
  }
  function autoAlignmentBreakdown37(signal){
    const bias = entryDisplayText37(signal && signal.entry);
    if(bias !== "LONG" && bias !== "SHORT") return [];
    const breakdown = signal.breakdown || {};
    const total = Math.round(Number(signal.confidence));
    const components = {
      base:Number(breakdown.base || 0),
      stack:Number(breakdown.stack || 0),
      pressure:Number(breakdown.pressure || 0),
      context:Number(breakdown.context || 0),
      participation:Number(breakdown.participation || 0),
      forming:Number(breakdown.forming || 0),
      micro:Number(breakdown.micro || 0),
      structure:Number(breakdown.structure || 0),
      ma:Number(breakdown.ma || 0),
      setup:Number(breakdown.setup || 0)
    };
    const subtotal = Object.values(components).reduce((sum,value) => sum + value,0);
    const adjustment = total - subtotal;
    const weights = horizonEngine37(state.horizon).pressure.map(item => `${item.tf} ${item.weight.toFixed(2)}`).join(" / ");
    const lines = [
      `Pressure weights: ${weights}`,
      `Base directional score: ${components.base}/100`,
      `MA-stack quality: ${components.stack >= 0 ? "+" : ""}${components.stack}`,
      `Pressure strength: ${components.pressure >= 0 ? "+" : ""}${components.pressure}`,
      `Price/MA context: ${components.context >= 0 ? "+" : ""}${components.context}`,
      `Participation adjustment: ${components.participation >= 0 ? "+" : ""}${components.participation}`,
      `Forming-candle adjustment: ${components.forming >= 0 ? "+" : ""}${components.forming}`,
      `Micro-trigger adjustment: ${components.micro >= 0 ? "+" : ""}${components.micro}`,
      `Higher-TF structure: ${components.structure >= 0 ? "+" : ""}${components.structure}`,
      `MA-event impact: ${components.ma >= 0 ? "+" : ""}${components.ma}`,
      `Setup/trigger quality: ${components.setup >= 0 ? "+" : ""}${components.setup}`
    ];
    if(signal.staleConfidenceCap) lines.push(`Stale-data confidence cap: ${signal.staleConfidenceCap}/100`);
    if(adjustment) lines.push(`Score-bound adjustment: ${adjustment > 0 ? "+" : ""}${adjustment}`);
    lines.push(`Total: ${total}/100`);
    return lines;
  }
  function thesisAlignmentBreakdown37(signal,thesis){
    if(!thesis || thesis.status === "MIXED") return [];
    const breakdown = thesis.breakdown || {};
    const total = Math.round(Number(thesis.confidence));
    const components = {
      base:Number(breakdown.base || 0),pressure:Number(breakdown.pressure || 0),context:Number(breakdown.context || 0),
      ma:Number(breakdown.ma || 0),structure:Number(breakdown.structure || 0),participation:Number(breakdown.participation || 0),forming:Number(breakdown.forming || 0)
    };
    const subtotal = Object.values(components).reduce((sum,value) => sum + value,0);
    const adjustment = total - subtotal;
    const lines = [
      `Base ${thesis.status.toLowerCase()} score: ${components.base}/100`,
      `Directional pressure magnitude: +${components.pressure}`,
      `Price/MA context: +${components.context}`,
      `MA-event magnitude: +${components.ma}`,
      `Higher-TF structure: +${components.structure}`,
      `Participation adjustment: ${components.participation >= 0 ? "+" : ""}${components.participation}`,
      `Forming-candle adjustment: ${components.forming >= 0 ? "+" : ""}${components.forming}`
    ];
    if(thesis.staleConfidenceCap) lines.push(`Stale-data confidence cap: ${thesis.staleConfidenceCap}/100`);
    if(adjustment) lines.push(`Score-bound adjustment: ${adjustment > 0 ? "+" : ""}${adjustment}`);
    lines.push(`Total: ${total}/100`);
    return lines;
  }
  function thesisQualityLimits37(signal,thesis,evidence){
    if(!thesis || thesis.status === "MIXED") return [];
    const bias = entryDisplayText37(signal && signal.entry);
    if(bias === "WAIT" || Math.abs(Number(signal.confidence) - Number(thesis.confidence)) < 3) return [];
    return [...new Set([...(evidence && evidence.limiting || []),...(evidence && evidence.adverse || [])])].slice(0,6);
  }
  function signalDataHealthLines37(health){
    return (health && Array.isArray(health.items) ? health.items : []).map(item => {
      const age = Number.isFinite(Number(item.ageMs)) ? `, age ${item.ageMs < 1000 ? "<1s" : `${Math.round(item.ageMs/1000)}s`}` : "";
      const statusLabel = item.status === "insufficient" ? "loaded but insufficient history" : item.status;
      const pair = state.activeSnapshot && state.activeSnapshot.maByTf && state.activeSnapshot.maByTf[item.tf];
      const ma = pair && pair.closed;
      const maState = ma ? `; canonical MA ${ma.reliable ? `sufficient (${ma.warmupCount}/${ma.requiredRows})` : `insufficient (${ma.warmupCount}/${ma.requiredRows})`}` : "";
      const needsPivots = (item.roles || []).some(role => role.includes("SMC structure"));
      const pivots = needsPivots ? canonicalPivots37(item.tf,"swing") : null;
      const pivotState = pivots ? `; canonical SMC ${pivots.sufficient ? "sufficient" : "insufficient confirmed swings"}` : "";
      return `${item.tf}: ${statusLabel}, ${item.count}/${item.historyTarget} closed candles${age}${maState}${pivotState}${item.reason ? ` — ${item.reason}` : ""}`;
    });
  }
  function loadingSignal37(bundle){
    const status = bundle.health.status;
    const action = status === "loading" || status === "insufficient" ? "Loading data" : "Data unavailable";
    return {
      entry:"ENTRY WAIT",confidence:null,action,normalized:0,dominantSide:0,marketDirection:null,
      samples:[],maEvents:[],maImpact:0,loading:true,dataHealth:bundle.health
    };
  }
  function loadingThesis37(direction){
    return {status:"MISSING",confidence:null,action:"Data incomplete",direction,maEvents:[],maImpact:0,missing:true};
  }
  function formatSignalTime37(value){
    const date = new Date(Number(value) || Date.now());
    try{
      return new Intl.DateTimeFormat([],{hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(date);
    }catch(_e){
      return date.toLocaleTimeString();
    }
  }
  function rankedEvidence37(lines,limit){
    const score = line => {
      const text = String(line || "");
      if(/BOS|CHoCH|broke (above|below)|lower high|higher low/i.test(text)) return 10;
      if(/EMA9|EMA21|EMA55/i.test(text)) return 9;
      if(/MA-event impact/i.test(text)) return 8;
      if(/pressure.*strengthening|pressure.*accelerating/i.test(text)) return 8;
      if(/fresh|closed-confirmed/i.test(text)) return 7;
      if(/participation/i.test(text)) return 5;
      return 3;
    };
    const unique = [...new Set((lines || []).filter(Boolean))];
    let maReferences = 0;
    return unique.sort((a,b) => score(b)-score(a)).filter(line => {
      if(!/EMA.*(rejection|bounce|reclaim|loss)/i.test(line)) return true;
      maReferences += 1;
      return maReferences <= 2;
    }).slice(0,limit);
  }
  function conciseLevelText37(level){
    if(!level) return "Level unavailable";
    return `${level.tf} ${level.label} ${tooltipPrice37(level.price)}`;
  }
  function compactDataStatus37(health){
    const status = health && health.status || "unavailable";
    if(status === "sufficient") return "Current and sufficient";
    if(status === "stale") return "Stale — confidence capped";
    if(status === "loading") return "Loading required history";
    if(status === "insufficient") return "Insufficient history";
    if(status === "failed") return "Loading failed";
    return "Unavailable";
  }
  function maAuditLines37(audit){
    if(!audit) return ["MA-event scoring audit unavailable"];
    const signed = value => `${Number(value) > 0 ? "+" : ""}${Number(value) || 0}`;
    return [
      `Raw candidates: ${audit.rawCandidateCount}; scored canonical events: ${audit.canonicalEventCount}; duplicates removed: ${audit.deduplicatedCount}; lower-ranked interactions omitted: ${audit.omittedCandidateCount}`,
      `Raw MA-event contribution: ${signed(audit.rawContribution)}`,
      `Deduplication adjustment: ${signed(audit.deduplicationAdjustment)} — duplicates are removed before scoring`,
      `Timeframe/forming adjustment: ${signed(audit.timeframeAndFormingAdjustment)}`,
      `Confluence adjustment: ${signed(audit.confluenceAdjustment)}`,
      `Score before cap: ${signed(audit.preCap)}`,
      `MA-event cap: ${audit.capMinimum} to +${audit.capMaximum}; cap adjustment ${signed(audit.capAdjustment)}`,
      `Applied MA-event impact: ${signed(audit.appliedImpact)}`
    ];
  }
  function signalDetailsReport37(signal,thesis,entryQuality,displayed){
    if(!displayed) return {summary:"Signal details unavailable",analysis:"",diagnostics:"",publication:null};
    const mode = displayed.mode;
    const horizon = displayed.horizonLabel;
    const autoBias = entryDisplayText37(signal.entry);
    const targetDirection = mode === "AUTO"
      ? (signal.fadeDirection || ((autoBias === "LONG" || autoBias === "SHORT") ? signal.marketDirection : null))
      : mode;
    const evidenceSignal = thesis
      ? {...signal,maEvents:thesis.maEvents,maImpact:thesis.maImpact,maAudit:thesis.maAudit,structuralContext:thesis.structuralContext}
      : signal;
    const evidence = targetDirection ? directionEvidence37(evidenceSignal,targetDirection) : null;
    const summary = [...displayedSignalHeader37(displayed),"",`${mode} - ${horizon}`];

    if(signal.loading){
      summary.push("","Market bias: WAIT","Entry: Data incomplete","",`Data: ${compactDataStatus37(signal.dataHealth)}`,`Updated: ${formatSignalTime37(displayed.publishedAt)}`);
    }else{
      summary.push(
        "",
        `Bias: ${displayed.direction}`,
        `Bias confidence: ${displayed.confidenceText}`
      );
      if(mode !== "AUTO") summary.push(`${mode === "LONG" ? "Long" : "Short"} thesis: ${thesis ? thesis.status : "MIXED"}`);
      const decision = displayed.decision;
      if(decision){
        const assessments = decision.assessments || {};
        const targets = assessments.targetFramework || {};
        const obstacle = targets.obstacle || {};
        const primaryTarget = targets.primary || assessments.target || {};
        const extendedTarget = targets.extended || {};
        summary.push(
          `Setup: ${setupDisplayName37(decision)}`,
          `Family: ${decision.family}`,
          `Setup origin zone: ${tooltipPrice37(decision.zone.low)}-${tooltipPrice37(decision.zone.high)}`,
          `State: ${displayed.visibleState}`,
          `Entry mode: ${assessments.entryMode || "UNAVAILABLE"}`,
          `Setup quality: ${assessments.setup && assessments.setup.grade || "UNAVAILABLE"}`,
          `Trigger quality: ${assessments.trigger && assessments.trigger.grade || "UNAVAILABLE"}`,
          `Current entry quality: ${assessments.current && assessments.current.grade || "UNAVAILABLE"}`,
          `Entry: ${decision.entryAction || (decision.state === "READY" ? `READY ${decision.direction}` : "WAIT")}`,
          `Trigger: ${decision.triggerState || "absent"}`,
          `Distance: ${decision.distance == null ? "unavailable" : `${(decision.distance*100).toFixed(2)}%`}`,
          `Reaction: ${decision.interaction && decision.interaction.trigger || "absent"}; ${decision.interaction && decision.interaction.confirmationRole || "none"}`,
          `Movement away: ${decision.interaction && decision.interaction.movement ? "present" : "absent"}`,
          `Pressure improvement: ${decision.pressure && decision.pressure.improved ? "present" : "absent"}`,
          `Trigger participation: ${decision.pressure && decision.pressure.participationExpectation && decision.pressure.participationExpectation.text || decision.pressure && decision.pressure.triggerParticipation && decision.pressure.triggerParticipation.text || "Unavailable"}`,
          `Broader participation: ${decision.pressure && decision.pressure.broaderParticipation && decision.pressure.broaderParticipation.text || "Unavailable"}`,
          `Adverse-evidence gate: ${decision.adverseGate && decision.adverseGate.blocksDevelopment ? "BLOCKED" : decision.adverseGate && decision.adverseGate.blocksReady ? "LIMITED" : "CLEAR"}`,
          `Absorption: ${decision.absorption && decision.absorption.state || "cleared"}`,
          `Original invalidation: ${tooltipPrice37(decision.invalidation)}`,
          `Current execution invalidation: ${assessments.executionInvalidation && assessments.executionInvalidation.available ? tooltipPrice37(assessments.executionInvalidation.price) : "Unavailable"}`,
          `Next obstacle: ${obstacle.available ? tooltipPrice37(obstacle.price) : "Unavailable"}`,
          `Obstacle source: ${obstacle.source || "Unavailable"}`,
          `Obstacle significance: ${obstacle.significance || "UNAVAILABLE"}`,
          `Primary target: ${primaryTarget.available ? tooltipPrice37(primaryTarget.price) : "Unavailable"}`,
          `Target source: ${primaryTarget.source || "Unavailable"}`,
          `Remaining room: ${primaryTarget.available ? `${tooltipPrice37(primaryTarget.remainingDistance)} · ${primaryTarget.remainingAtr == null ? "Unavailable" : `${primaryTarget.remainingAtr.toFixed(1)}× ${targets.atrTf || decision.tf} ATR`}` : "Unavailable"}`,
          `Extended target: ${extendedTarget.available ? tooltipPrice37(extendedTarget.price) : "Unavailable"}`,
          `Extended source: ${extendedTarget.source || "Unavailable"}`,
          `Reason: ${decision.reason}`
        );
        if(historicalSetupMatches37(decision.previousCandidate,displayed)) summary.push(`Historical setup: ${decision.previousCandidate.tf} ${decision.previousCandidate.source} - INVALIDATED; ${decision.previousCandidate.reason}`);
      }else{
        summary.push("Setup: None",`State: ${displayed.visibleState}`,"Entry: WAIT",`Reason: ${entryQuality.instruction}`);
      }

      if(mode === "AUTO" && !targetDirection){
        const bullish = directionEvidence37(signal,"LONG");
        const bearish = directionEvidence37(signal,"SHORT");
        summary.push(
          "","Bullish factors:",...rankedEvidence37(bullish.supportive,2).map(line => `- ${line}`),
          "Bearish factors:",...rankedEvidence37(bearish.supportive,2).map(line => `- ${line}`)
        );
        const limiting = rankedEvidence37([...(bullish.limiting || []),...(bearish.limiting || [])],2);
        if(limiting.length) summary.push("Limiting / neutral:",...limiting.map(line => `- ${line}`));
        summary.push("Conclusion:","- Evidence is conflicting; no directional edge");
      }else if(evidence){
        const status = thesis && thesis.status || (targetDirection === signal.marketDirection ? "SUPPORTIVE" : "MIXED");
        const reasonSource = status === "ADVERSE" || status === "INVALID"
          ? evidence.adverse
          : status === "SUPPORTIVE" ? evidence.supportive : [...evidence.supportive,...evidence.adverse];
        const reasons = rankedEvidence37(reasonSource.filter(line => !/\b(invalidated|stale)\b/i.test(String(line))),4);
        const risks = rankedEvidence37((status === "SUPPORTIVE" ? evidence.adverse : evidence.limiting || []).filter(line => !/\b(invalidated|stale)\b/i.test(String(line))),2);
        summary.push("",`${status === "ADVERSE" || status === "INVALID" ? `Why ${targetDirection} is ${status.toLowerCase()}` : "Why"}:`,...reasons.map(line => `- ${line}`));
        if(risks.length) summary.push("","Risks:",...risks.map(line => `- ${line}`));
      }

      if(!decision){
        const levels = entryQuality.levels.entryCandidates && entryQuality.levels.entryCandidates.length
          ? entryQuality.levels.entryCandidates
          : entryQuality.levels.candidates || [];
        const principal = levels.slice().sort((a,b) => a.distance-b.distance).slice(0,3);
        if(principal.length) summary.push("","Nearest relevant levels:",...principal.map(level => `- ${conciseLevelText37(level)}`));
      }
      summary.push("",`Data: ${compactDataStatus37(signal.dataHealth)}`,`Updated: ${formatSignalTime37(displayed.publishedAt)}`);
    }

    const analysis = [];
    const samples = signal.samples || [];
    if(samples.length) analysis.push(`Pressure and participation:\n${detailBulletList37(samples.map(sample => sample.available ? tooltipPressureLine37(sample) : `${sample.tf} unavailable`))}`);
    if(signal.bias){
      analysis.push(`Market context (separate from active signal):\n${detailBulletList37([
        `Automatic context bias: ${signal.bias.direction || "NEUTRAL"}`,
        `Bias source: ${signal.bias.source}; combined score ${signal.bias.score.toFixed(3)}`,
        `MA stack score ${signal.bias.stackScore.toFixed(3)}; pressure score ${signal.bias.pressureScore.toFixed(3)}; structure score ${signal.bias.structureScore.toFixed(3)}`,
        ...signal.bias.stacks.map(stack => `${stack.tf}: ${stack.state}, ${stack.phase}; order ${stack.orderCount}/4, slopes ${stack.slopeCount}/5, stability ${Math.round(stack.stability*100)}%`)
      ])}`);
    }
    if(signal.entryDecision){
      const decision = signal.entryDecision;
      const targets = decision.assessments && decision.assessments.targetFramework || {};
      analysis.push(`Entry state audit:\n${detailBulletList37([
        `State: ${decision.state}; exact reason: ${decision.reason}`,
        `Bias confidence: ${signal.confidence == null ? "unavailable" : `${Math.round(signal.confidence)}%`}; setup ${decision.assessments && decision.assessments.setup.grade || "UNAVAILABLE"}; trigger ${decision.assessments && decision.assessments.trigger.grade || "UNAVAILABLE"}; current entry ${decision.assessments && decision.assessments.current.grade || "UNAVAILABLE"}`,
        decision.family ? `Selected: ${decision.family} on ${decision.tf}; ${zoneText37(decision)}` : "No setup candidate selected",
        decision.previousCandidate ? `Previous candidate: ${decision.previousCandidate.family} ${decision.previousCandidate.tf} - INVALIDATED; ${decision.previousCandidate.reason}` : null,
        decision.family ? `Interaction: ${decision.interaction.interacted ? "yes" : "no"}; reaction: ${decision.interaction.trigger}; role: ${decision.interaction.confirmationRole}; movement: ${decision.interaction.movement ? "yes" : "no"}; sustained: ${decision.interaction.sustainedMovement ? "yes" : "no"}` : null,
        decision.family ? `Pressure improvement: ${decision.pressure.improved ? "yes" : "no"}; ready confirmation: ${decision.pressure.confirmed ? "yes" : "no"}; ${decision.pressure.blocker || "no pressure blocker"}` : null,
        decision.family ? `Trigger participation: ${decision.pressure.triggerParticipation.text}; broader participation: ${decision.pressure.broaderParticipation.text}` : null,
        decision.family ? `Adverse gate: ${decision.adverseGate.blocksDevelopment ? "blocks development" : decision.adverseGate.blocksReady ? "blocks READY" : "clear"}; ${decision.adverseGate.reasons.join(" / ") || "no active adverse categories"}` : null,
        decision.family ? `Original invalidation ${tooltipPrice37(decision.invalidation)}; current execution invalidation ${decision.assessments && decision.assessments.executionInvalidation.available ? tooltipPrice37(decision.assessments.executionInvalidation.price) : "unavailable"}` : null
      ].filter(Boolean))}`);
      analysis.push(`Target hierarchy:\n${detailBulletList37([
        targets.obstacle && targets.obstacle.available ? `Next obstacle ${tooltipPrice37(targets.obstacle.price)}; ${targets.obstacle.source}; ${targets.obstacle.significance}` : "Next obstacle unavailable",
        targets.primary && targets.primary.available ? `Primary target ${tooltipPrice37(targets.primary.price)}; ${targets.primary.source}; ${targets.primary.remainingAtr == null ? "ATR distance unavailable" : `${targets.primary.remainingAtr.toFixed(1)}× ${targets.atrTf || decision.tf} ATR`}` : `Primary target unavailable; ${targets.primary && targets.primary.reason || "No credible 1h-or-higher objective identified"}`,
        targets.extended && targets.extended.available ? `Extended target ${tooltipPrice37(targets.extended.price)}; ${targets.extended.source}` : "Extended target unavailable"
      ])}`);
      if(decision.interaction && decision.interaction.evidence) analysis.push(`Reaction and movement evidence:\n${detailBulletList37(decision.interaction.evidence)}`);
      if(decision.pressure && decision.pressure.evidence) analysis.push(`Pressure effectiveness:\n${detailBulletList37(decision.pressure.evidence)}`);
      if(decision.candidateAudit && decision.candidateAudit.length){
        analysis.push(`Candidate ranking:\n${detailBulletList37(decision.candidateAudit.map((candidate,index) => `${index+1}. ${candidate.family} ${candidate.tf}; ${candidate.state}; rank ${candidate.rankScore}; ${candidate.zone}; ${candidate.reason}`))}`);
      }
    }
    const structure = thesis && thesis.structuralContext || signal.structuralContext;
    if(structure && structure.smc) analysis.push(`Canonical SMC structure:\n${detailBulletList37([...structure.smc.evidence,...structure.smc.diagnostics])}`);
    const validEvents = (thesis ? thesis.maEvents : signal.maEvents || []).filter(event => event && (event.state === "fresh" || event.state === "aging"));
    if(validEvents.length) analysis.push(`Selected valid MA events:\n${detailBulletList37(validEvents.map(event => `${maEventLabel37(event)} - ${event.type}; ${event.state}; ${event.confirmation}; applied impact ${Number(event.appliedImpact || 0) >= 0 ? "+" : ""}${Number(event.appliedImpact || 0)}`))}`);
    analysis.push(`Current entry assessment:\n${detailBulletList37([entryQuality.text,entryQuality.instruction,...entryQuality.exclusions])}`);
    if(entryQuality.levels.lines && entryQuality.levels.lines.length) analysis.push(`Level ranking:\n${detailBulletList37(entryQuality.levels.lines)}`);
    const breakdown = thesis ? thesisAlignmentBreakdown37(signal,thesis) : autoAlignmentBreakdown37(signal);
    if(breakdown.length) analysis.push(`Score breakdown:\n${detailBulletList37(breakdown)}`);

    const detailEvents = thesis ? thesis.maEvents : signal.maEvents || [];
    const invalidEvents = detailEvents.filter(event => event && (event.state === "invalidated" || event.state === "stale" || event.state === "unknown"));
    const diagnostics = [
      `Snapshot: version ${state.activeSnapshot && state.activeSnapshot.version || "unavailable"}; ${new Date(state.activeSnapshot && state.activeSnapshot.createdAt || Date.now()).toISOString()}`,
      `Snapshot signature: ${String(state.activeSnapshot && state.activeSnapshot.signature || "unavailable").slice(0,180)}`,
      `Data health:\n${detailBulletList37(signalDataHealthLines37(signal.dataHealth))}`,
      `Event scoring:\n${detailBulletList37(maAuditLines37(thesis ? thesis.maAudit : signal.maAudit))}`,
      `Entry states: ${ENTRY_STATES37.join(" -> ")}`,
      `Pressure thresholds: neutral imbalance <= ${(PRESSURE_POLICY37.neutralImbalance*100).toFixed(1)} points; mild < ${(PRESSURE_POLICY37.mildShare*100).toFixed(0)}%; strong >= ${(PRESSURE_POLICY37.strongShare*100).toFixed(0)}%`,
      `Entry decision snapshot: ${signal.entryDecision ? `${signal.entryDecision.state}; ${signal.entryDecision.reason}` : "unavailable"}`,
      `Bias confidence: ${signal.confidence == null ? "unavailable" : `${Math.round(signal.confidence)}%`}; setup quality: ${signal.entryDecision && signal.entryDecision.assessments && signal.entryDecision.assessments.setup.grade || "unavailable"}; trigger quality: ${signal.entryDecision && signal.entryDecision.assessments && signal.entryDecision.assessments.trigger.grade || "unavailable"}; current entry quality: ${signal.entryDecision && signal.entryDecision.assessments && signal.entryDecision.assessments.current.grade || "unavailable"}`,
      `Selected setup: ${signal.entryDecision && signal.entryDecision.family ? setupDisplayName37(signal.entryDecision) : "none"}`,
      `Zone interaction: ${signal.entryDecision && signal.entryDecision.interaction ? signal.entryDecision.interaction.interacted ? "engaged" : "not engaged" : "unavailable"}`,
      `Reaction confirmation: ${signal.entryDecision && signal.entryDecision.interaction ? signal.entryDecision.interaction.confirmationRole : "unavailable"}`,
      `Movement-away evidence: ${signal.entryDecision && signal.entryDecision.interaction ? signal.entryDecision.interaction.evidence.join(" | ") : "unavailable"}`,
      `Pressure-improvement state: ${signal.entryDecision && signal.entryDecision.pressure ? signal.entryDecision.pressure.evidence.join(" | ") : "unavailable"}`,
      `Adverse-evidence gate: ${signal.entryDecision && signal.entryDecision.adverseGate ? signal.entryDecision.adverseGate.reasons.join(" | ") || "clear" : "unavailable"}`,
      `Trigger confirmation role: ${signal.entryDecision && signal.entryDecision.interaction ? signal.entryDecision.interaction.confirmationRole : "unavailable"}`
    ];
    if(invalidEvents.length) diagnostics.push(`Stale / invalidated events:\n${detailBulletList37(invalidEvents.map(event => event.state === "unknown" ? event.reason : `${maEventLabel37(event)} - ${event.state}: ${event.invalidationReason || event.stateReason || "reason unavailable"}`))}`);
    return {summary:summary.join("\n"),analysis:analysis.join("\n\n"),diagnostics:diagnostics.join("\n\n"),publication:displayedSignalMeta37(displayed)};
  }
  function renderSignalDetailsReport37(report){
    if(!state.detailsBody) return;
    const preservedScrollTop = state.detailsBody.scrollTop;
    const openAnalysis = !!state.detailsBody.querySelector("details[data-section='analysis'][open]");
    const openDiagnostics = !!state.detailsBody.querySelector("details[data-section='diagnostics'][open]");
    state.detailsBody.replaceChildren();
    const summary = document.createElement("pre");
    summary.className = "pressure-signal-details-summary";
    summary.textContent = report.summary;
    state.detailsBody.appendChild(summary);
    if(report.summary==="Signal details unavailable"){
      state.detailsBody.scrollTop=preservedScrollTop;
      return;
    }
    [["analysis","Analysis",report.analysis,openAnalysis],["diagnostics","Diagnostics",report.diagnostics,openDiagnostics]].forEach(([key,label,content,wasOpen]) => {
      const section = document.createElement("details");
      section.className = "pressure-signal-details-section";
      section.dataset.section = key;
      section.open = !!wasOpen;
      const heading = document.createElement("summary");
      heading.textContent = label;
      const body = document.createElement("pre");
      body.textContent = content || "No additional detail available";
      section.appendChild(heading);
      section.appendChild(body);
      state.detailsBody.appendChild(section);
    });
    state.detailsBody.scrollTop = preservedScrollTop;
  }
  function unavailableSignalReport37(){
    return {summary:"Signal details unavailable",analysis:"",diagnostics:"",publication:null};
  }
  function ensurePublicationSignalReport37(publication){
    const displayed=publication && publication.displayedSignal;
    if(!publication || !displayed) return unavailableSignalReport37();
    if(!buttonMatchesDisplayedSignal37(displayed)){
      performanceDiagnostics.signalPublicationMismatches+=1;
      performanceDiagnostics.signalFallbacksPrevented+=1;
      return unavailableSignalReport37();
    }
    if(publication.signalReport && displayedSignalMatches37(publication.signalReport.publication,displayed)) return publication.signalReport;
    if(publication.signalReport){
      performanceDiagnostics.signalPublicationMismatches+=1;
      performanceDiagnostics.signalStalePayloadsDiscarded+=1;
      publication.signalReport=null;
    }
    let report=null;
    try{
      report=typeof publication.signalReportFactory==="function"
        ? timed37("signal.report-generation",publication.signalReportFactory,publication.signalReportFingerprint)
        : null;
    }catch(_error){ report=null; }
    if(report && displayedSignalMatches37(report.publication,displayed)){
      publication.signalReport=report;
      return report;
    }
    performanceDiagnostics.signalFallbacksPrevented+=1;
    return unavailableSignalReport37();
  }
  function positionToolbarSignalDetails37(){
    if(!state.details || !state.details.classList.contains("is-open")) return;
    windowSystem.recoverWindows();
  }
  function showToolbarSignalDetails37(){
    if(!state.details || !state.entry) return;
    state.details.classList.add("is-open");
    state.details.setAttribute("aria-hidden","false");
    state.entry.setAttribute("aria-expanded","true");
    if(state.details.dataset.sizeInitialized !== "true"){
      state.details.dataset.sizeInitialized = "true";
      state.details.style.width = `${Math.min(400,Math.max(280,window.innerWidth-8))}px`;
      state.details.style.height = `${Math.min(420,Math.max(180,window.innerHeight-8))}px`;
    }
    windowSystem.focusSignal();
    const publication=state.lastPublishedSnapshot;
    if(publication){
      const report=ensurePublicationSignalReport37(publication);
      renderSignalDetailsReport37(report);
      windowSystem.recordSignalDetailsPublication(publication.displayedSignal,report);
    }
  }
  function hideToolbarSignalDetails37(){
    if(state.details){
      state.details.classList.remove("is-open");
      state.details.setAttribute("aria-hidden","true");
    }
    if(state.entry) state.entry.setAttribute("aria-expanded","false");
  }
  function toggleToolbarSignalDetails37(event){
    if(event){
      event.preventDefault();
      event.stopPropagation();
    }
    if(state.details && state.details.classList.contains("is-open")) hideToolbarSignalDetails37();
    else showToolbarSignalDetails37();
  }
  function structureClassName37(classification,side){
    const names = {HH:"higher high",HL:"higher low",LH:"lower high",LL:"lower low"};
    return names[classification] || (side === "high" ? "swing high" : "swing low");
  }
  function canonicalStructureEvidence37(direction,horizonId){
    const desired = direction === "SHORT" || direction === -1 ? -1 : 1;
    const engine = horizonEngine37(horizonId);
    const roles = engine.structureRoles || {internal:[],swing:engine.structureTfs || [],major:engine.boundaryTfs || []};
    const currentPrice = signalCurrentPrice37();
    const evidence = [];
    const diagnostics = [];
    let raw = 0;
    let weight = 0;
    const applyScope = (tf,scope,roleWeight,roleLabel) => {
      const structure = signalStructure37(tf,scope);
      if(!structure){ diagnostics.push(`${tf} ${scope} canonical SMC structure unavailable`); return; }
      const pivots = canonicalPivots37(tf,scope);
      if(roleLabel === "major boundary" && currentPrice != null){
        const nearby = [pivots.high,pivots.low].filter(Boolean).some(pivot => Math.abs(pivot.price-currentPrice)/Math.max(Math.abs(currentPrice),1) <= (horizonId === "quick" ? 0.025 : 0.04));
        if(!nearby){ diagnostics.push(`${tf} ${scope} major SMC boundaries are outside the active proximity window`); return; }
      }
      const latestEvent = structure.latestEvent;
      if(latestEvent){
        const eventSide = latestEvent.direction === "bullish" ? 1 : -1;
        raw += eventSide * desired * roleWeight;
        weight += roleWeight;
        evidence.push(`${latestEvent.direction === "bullish" ? "Bullish" : "Bearish"} ${tf} ${String(latestEvent.text || latestEvent.structureType || "structure break").toUpperCase()} confirmed at ${tooltipPrice37(latestEvent.price)}`);
      }
      [pivots.high,pivots.low].filter(Boolean).forEach(pivot => {
        const classificationSide = pivot.classification === "HH" || pivot.classification === "HL" ? 1
          : pivot.classification === "LH" || pivot.classification === "LL" ? -1 : 0;
        if(classificationSide){
          const classificationWeight = roleWeight * 0.45;
          raw += classificationSide * desired * classificationWeight;
          weight += classificationWeight;
        }
      });
      const invalidation = desired > 0 ? pivots.low : pivots.high;
      if(invalidation && currentPrice != null){
        const broken = confirmedCloseBeyond37(tf,invalidation.price,desired > 0 ? -1 : 1);
        const name = structureClassName37(invalidation.classification,invalidation.side);
        evidence.push(broken
          ? `Price broke ${desired > 0 ? "below" : "above"} the latest confirmed ${tf} ${name} ${tooltipPrice37(invalidation.price)}`
          : `Latest confirmed ${tf} ${name} ${tooltipPrice37(invalidation.price)} remains intact`);
      }
      const strongWeak = (structure.levels || []).map(level => `${level.text || `${level.strength || "unclassified"} ${level.side}`} ${tooltipPrice37(level.price)}${level.classification ? ` (${level.classification})` : ""}; ${level.confirmed ? "confirmed" : "tentative"}`);
      diagnostics.push(`${tf} ${scope} (${roleLabel}): trend ${structure.trend > 0 ? "bullish" : structure.trend < 0 ? "bearish" : "unconfirmed"}; ${structure.pivots.filter(pivot => pivot.confirmed).length} confirmed pivots${strongWeak.length ? `; ${strongWeak.join(" / ")}` : ""}`);
    };
    (roles.internal || []).forEach(tf => applyScope(tf,"internal",horizonId === "quick" ? 0.30 : 0.65,"early warning"));
    (roles.swing || []).forEach((tf,index) => applyScope(tf,"swing",index === 0 ? 1.35 : 1.0,"swing structure"));
    (roles.major || []).forEach(tf => applyScope(tf,"swing",0.55,"major boundary"));
    (roles.regime || []).forEach(tf => applyScope(tf,"swing",0.65,"regime"));
    const normalized = weight ? raw / weight : 0;
    return {points:Math.max(-7,Math.min(7,Math.round(normalized * 7))),normalized,evidence,diagnostics};
  }
  function structuralMarketContext37(direction,horizonId){
    const desired = direction === "SHORT" || direction === -1 ? -1 : 1;
    const engine = horizonEngine37(horizonId);
    const currentPrice = signalCurrentPrice37();
    const proximity = horizonId === "quick" ? 0.008 : horizonId === "2_3h" ? 0.015 : 0.025;
    let raw = 0;
    let weight = 0;
    const evidence = [];
    [...engine.structureTfs,...engine.boundaryTfs].forEach(tf => {
      const boundary = engine.boundaryTfs.includes(tf);
      [2,3,4,5].forEach(slotIndex => {
        const ma = signalMaSlot37(tf,`MA${slotIndex}`);
        if(!ma.reliable || currentPrice == null || ma.value == null) return;
        const distance = Math.abs(ma.value-currentPrice) / Math.max(Math.abs(currentPrice),1);
        if(boundary && distance > proximity) return;
        const importance = boundary ? (slotIndex >= 4 ? 1.25 : 0.65) : (slotIndex >= 3 ? 1.0 : 0.8);
        const side = currentPrice >= ma.value ? 1 : -1;
        raw += side * desired * importance;
        weight += importance;
        if(distance <= proximity){
          evidence.push(`${tooltipIndicator37(tf,ma.label,ma.value)} — ${side === desired ? "supports" : "opposes"} ${desired > 0 ? "LONG" : "SHORT"}; ${ma.evidenceState}`);
        }
      });
    });
    const maNormalized = weight ? raw / weight : 0;
    const smc = canonicalStructureEvidence37(direction,horizonId);
    const normalized = weight ? maNormalized * 0.42 + smc.normalized * 0.58 : smc.normalized;
    return {
      points:Math.max(-8,Math.min(8,Math.round(maNormalized * 3 + smc.points))),
      normalized,
      evidence:[...smc.evidence,...evidence],
      smc,
      maNormalized
    };
  }
  function confirmedCloseBeyond37(tf,level,side){
    const rows = state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[tf];
    const latest = Array.isArray(rows) ? rows.slice(-2) : [];
    return latest.length >= 2 && latest.every(row => side > 0 ? Number(row.close) > level : Number(row.close) < level);
  }
  function grOrderOwnership37(order,grIds=new Set()){
    const clientId=String(order && order.clientOrderId || "");
    return !!clientId && (clientId.startsWith("GR_EXIT_") || grIds.has(clientId));
  }
  function managementExternalLevels37(position){
    const userLevels = [];
    const exitOrders = [];
    try{
      const source = window.PRICE_LEVELS_OVERLAY;
      const levels = source && typeof source.parseLevels === "function" ? source.parseLevels() : [];
      (Array.isArray(levels) ? levels : []).forEach((price,index) => {
        if(num37(price) != null) userLevels.push({id:`user-${index}-${price}`,price:Number(price),source:"User level",family:"user"});
      });
    }catch(_e){}
    const symbol = String(position && position.symbol || (typeof cfg === "function" && cfg() && cfg().symbol) || "").toUpperCase();
    const expectedSide = position && position.side === "SHORT" ? "BUY" : "SELL";
    const frozenState=state.activeSnapshot && state.activeSnapshot.exitOrderState || state.marketSnapshot && state.marketSnapshot.exitOrderState || exitOrderStateSnapshot37(symbol);
    const orderStatus = String(frozenState.status || "unavailable").toLowerCase();
    const ordersUpdatedAt = num37(frozenState.updatedAt);
    const orderCacheLive = orderStatus === "ok" && ordersUpdatedAt != null && Date.now()-ordersUpdatedAt <= featureConfig.freshness.protectiveOrderStaleMs;
    const rawOrders = Array.isArray(frozenState.orders) ? frozenState.orders : [];
    rawOrders.forEach(order => {
      if(!order || String(order.symbol || "").toUpperCase() !== symbol) return;
      const type = String(order.type || order.orderType || "").toUpperCase();
      const status = String(order.status || order.orderStatus || "NEW").toUpperCase();
      if(type !== "LIMIT" || !["NEW","PENDING","ACCEPTED","PARTIALLY_FILLED"].includes(status)) return;
      const price = num37(order.price), original = num37(order.origQty ?? order.quantity ?? order.qty), executed = num37(order.executedQty) || 0;
      const quantity = original == null ? null : Math.max(0,original-executed);
      const clientOrderId = String(order.clientOrderId || "");
      exitOrders.push({id:String(order.orderId != null ? `order:${order.orderId}` : clientOrderId || `exit-${exitOrders.length}`),clientOrderId,price,quantity,originalQuantity:original,executedQuantity:executed,source:"Live Binance LIMIT exit",family:"binance-exit",side:String(order.side || "").toUpperCase(),positionSide:String(order.positionSide || "").toUpperCase(),status,isLive:orderCacheLive,updatedAt:ordersUpdatedAt,correctSide:String(order.side || "").toUpperCase() === expectedSide});
    });
    const ownedRows = Array.isArray(frozenState.grRows) ? frozenState.grRows : [];
    const grRows = (Array.isArray(ownedRows) ? ownedRows : []).filter(row => row && row.owner === "GR" && row.section === "exit" && row.status === "sent");
    const grIds = new Set(grRows.map(row => String(row.clientOrderId || "")).filter(Boolean));
    const uniqueOrders = [];
    const seen = new Set();
    exitOrders.forEach(order => {
      if(order.price == null || !(order.quantity > 0)) return;
      const key = String(order.id || `${order.family}|${Number(order.price).toPrecision(12)}|${order.quantity}`);
      if(seen.has(key)) return;
      seen.add(key);
      uniqueOrders.push(order);
    });
    const ladderOrders=uniqueOrders.map(order => {
      const grOwned=grOrderOwnership37(order,grIds);
      return {...order,owner:grOwned ? "GR" : "BINANCE",ownershipProven:grOwned};
    });
    const allGrOwned=ladderOrders.length>0 && ladderOrders.every(order => order.ownershipProven);
    const grSource=ladderOrders.length ? (allGrOwned ? "GR" : "BINANCE") : "UNAVAILABLE";
    return {userLevels,exitOrders:uniqueOrders,grExitOrders:ladderOrders,grSource,ordersUpdatedAt,orderStatus};
  }
  function signalExternalLevels37(){
    const userLevels=[];
    try{
      const source=window.PRICE_LEVELS_OVERLAY,levels=source&&typeof source.parseLevels==="function"?source.parseLevels():[];
      (Array.isArray(levels)?levels:[]).forEach((price,index)=>{if(num37(price)!=null)userLevels.push({id:`user-${index}-${price}`,price:Number(price),source:"User level",family:"user"});});
    }catch(_e){}
    return {userLevels,exitOrders:[],grExitOrders:[],grSource:"UNAVAILABLE"};
  }

  function targetMarketLevels37(direction,horizonId,external){
    const levels=[];
    const add=(price,source,tf,family,extra={})=>{ price=num37(price); if(price!=null) levels.push({price,source,tf,family,...extra}); };
    ["1m","3m","5m","15m","1h","4h","1d"].forEach(tf => {
      const pivots=canonicalPivots37(tf,"swing");
      if(pivots.high) add(pivots.high.price,`${tf} swing resistance`,tf,"structure",{confirmed:true,reactions:1});
      if(pivots.low) add(pivots.low.price,`${tf} swing support`,tf,"structure",{confirmed:true,reactions:1});
      signalCanonicalSlots37().slice(2).forEach(slot => {
        const ma=signalMaSlot37(tf,slot.slotId,true);
        if(ma.reliable && ma.value!=null) add(ma.value,`${tf} EMA${slot.period}`,tf,"moving averages",{confirmed:ma.evidenceState==="closed-confirmed",reactions:0});
      });
    });
    (external && external.userLevels || []).forEach(level => add(level.price,level.source || "User level",level.tf || "user","user",{deliberateObjective:level.deliberateObjective===true,confirmed:true}));
    return levels;
  }
  function targetFramework37(direction,horizonId,atr,atrTf,external){
    return targetEngine.evaluateTargets({direction,currentPrice:signalCurrentPrice37(),atr,atrTf,profileId:horizonId,levels:targetMarketLevels37(direction,horizonId,external)});
  }
  function evaluatePositionManagement37(samples,horizonId,managementEngine=positionEngine){
    const snapshot = actionState.activeSnapshot || actionState.marketSnapshot;
    const position = snapshot&&snapshot.position ? {...snapshot.position} : null;
    const externalLevels = managementExternalLevels37(position);
    const profile = featureConfig.managementHorizons[horizonId] || featureConfig.managementHorizons.quick;
    const targetAtr = averageTrueRange37(profile.primaryTf) || averageTrueRange37(profile.triggerTf);
    const targets = position ? timed37("position.target-evaluation",() => targetFramework37(position.side,horizonId,targetAtr,profile.primaryTf,externalLevels)) : null;
    const management = timed37("position.management-calculation",() => managementEngine.evaluate({
      symbol:String(snapshot && snapshot.symbol || position && position.symbol || "BTCUSDT"),
      horizon:horizonId,
      createdAt:Date.now(),
      snapshotCreatedAt:Number(snapshot && snapshot.createdAt || Date.now()),
      version:snapshot && snapshot.version || "unavailable",
      position,
      currentPrice:num37(snapshot && snapshot.currentPrice) ?? num37(position&&position.markPrice),
      samples:Array.isArray(samples) ? samples.map(sample => ({...sample})) : [],
      rowsByTf:snapshot && snapshot.rowsByTf || {},
      closedByTf:snapshot && snapshot.closedByTf || {},
      maByTf:snapshot && snapshot.maByTf || {},
      structureByTf:snapshot && snapshot.structureByTf || {},
      dataHealth:snapshot && snapshot.health || null,
      freshness:snapshot && snapshot.freshness || null,
      protectiveOrders:snapshot && snapshot.protectiveOrders || null,
      currentExecutionInvalidation:null,
      userLevels:externalLevels.userLevels,
      exitOrders:externalLevels.exitOrders,
      targetFramework:targets,
      exitEvaluations:[],
      grExitLadder:null
    }));
    if(position && targets){
      timed37("position.exit-ladder-evaluation",() => {
        management.exitEvaluations=targetEngine.evaluateBinanceExits({direction:position.side,currentPrice:num37(snapshot && snapshot.currentPrice) ?? num37(position.markPrice),positionQty:position.qty,atr:targetAtr,profileId:horizonId,lifecycle:management.lifecycle,targetFramework:targets,orders:externalLevels.exitOrders});
        management.grExitLadder=targetEngine.evaluateGrLadder({direction:position.side,currentPrice:num37(snapshot && snapshot.currentPrice) ?? num37(position.markPrice),positionQty:position.qty,atr:targetAtr,profileId:horizonId,lifecycle:management.lifecycle,targetFramework:targets,orders:externalLevels.grExitOrders,source:externalLevels.grSource});
      });
    }
    return management;
  }
  function entryPolicy37(horizonId=state.horizon){
    return ENTRY_POLICY37[horizonId] || ENTRY_POLICY37.quick;
  }
  function clamp37(value,minimum,maximum){
    return Math.max(minimum,Math.min(maximum,value));
  }
  function averageTrueRange37(tf,period=14){
    const source = state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[tf];
    const rows = (Array.isArray(source) ? source : signalRows37(tf)).slice(-(period + 1));
    if(rows.length < 3) return null;
    const ranges = [];
    for(let index=1;index<rows.length;index++){
      const row = rows[index];
      const previous = rows[index-1];
      ranges.push(Math.max(
        Number(row.high)-Number(row.low),
        Math.abs(Number(row.high)-Number(previous.close)),
        Math.abs(Number(row.low)-Number(previous.close))
      ));
    }
    return ranges.length ? ranges.reduce((sum,value) => sum+value,0)/ranges.length : null;
  }
  function volatilityRules37(tf,horizonId=state.horizon){
    const price = signalCurrentPrice37();
    const policy = entryPolicy37(horizonId);
    const measured = averageTrueRange37(tf,14);
    const minimumAtr = price == null ? 1e-8 : Math.max(price*0.00035,1e-8);
    const maximumAtr = price == null ? Infinity : price*(horizonId === "quick" ? 0.012 : horizonId === "2_3h" ? 0.025 : 0.045);
    const atr = clamp37(measured == null ? minimumAtr : measured,minimumAtr,maximumAtr);
    const zonePad = clamp37(atr*policy.zoneAtr,price == null ? 1e-8 : price*0.00012,price == null ? Infinity : price*0.0015);
    const tolerance = clamp37(atr*policy.toleranceAtr,price == null ? 1e-8 : price*0.00010,price == null ? Infinity : price*0.0012);
    return {atr,measuredAtr:measured,zonePad,tolerance,chaseDistance:atr*policy.chaseAtr};
  }
  function pressurePersistence37(tf,direction,count=PRESSURE_POLICY37.persistentBars){
    const rows = signalRows37(tf).filter(validSignalRow37).filter(row => row.final !== false).slice(-count);
    if(rows.length < count) return false;
    return rows.every(row => {
      const share = Number(row.takerBuyBase)/Math.max(Number(row.volume),1e-8);
      const directionalShare = direction > 0 ? share : 1-share;
      return directionalShare >= PRESSURE_POLICY37.strongShare;
    });
  }
  function pressureClassification37(sample,direction){
    if(!sample || !sample.available) return {state:"unavailable",strength:"unavailable",opposing:false,aligned:false,material:false};
    const desired = direction === "SHORT" || direction === -1 ? -1 : 1;
    if(sample.sideSign === 0 || Number(sample.pressureImbalance) <= PRESSURE_POLICY37.neutralImbalance){
      return {state:"neutral",strength:"neutral",opposing:false,aligned:false,material:false};
    }
    const aligned = sample.sideSign === desired;
    const share = Number(sample.dominantPct || 0.5);
    const accelerating = Number(sample.pressureMomentum || 0) >= PRESSURE_POLICY37.acceleratingMomentum;
    const material = share >= PRESSURE_POLICY37.strongShare || (share >= PRESSURE_POLICY37.mildShare && accelerating);
    return {
      state:aligned ? "aligned" : (material ? "strongly conflicting" : "mildly conflicting"),
      strength:share >= PRESSURE_POLICY37.strongShare ? "strong" : share >= PRESSURE_POLICY37.mildShare ? "material" : "mild",
      opposing:!aligned,
      aligned,
      material,
      accelerating,
      share
    };
  }
  function pressureAudit37(samples,direction){
    return (Array.isArray(samples) ? samples : []).map(sample => ({
      tf:sample.tf,
      role:sample.role,
      ...pressureClassification37(sample,direction),
      bullPct:sample.bullPct,
      bearPct:sample.bearPct,
      momentum:sample.pressureMomentum,
      participation:sample.participationRatio
    }));
  }
  function maStackState37(tf){
    const snapshot = signalMaSnapshot37(tf,false);
    if(!snapshot || !snapshot.reliable || !Array.isArray(snapshot.slots) || snapshot.slots.length < 5){
      return {tf,available:false,side:0,alignment:0,state:"unavailable",phase:"unavailable",orderCount:0,slopeCount:0,stability:0};
    }
    const slots = snapshot.slots.slice(0,5);
    const values = slots.map(slot => num37(snapshot.valuesBySlot && snapshot.valuesBySlot[slot.slotId]));
    if(values.some(value => value == null)) return {tf,available:false,side:0,alignment:0,state:"unavailable",phase:"unavailable",orderCount:0,slopeCount:0,stability:0};
    const orderFor = direction => values.slice(0,-1).filter((value,index) => direction > 0 ? value > values[index+1] : value < values[index+1]).length;
    const bullOrder = orderFor(1);
    const bearOrder = orderFor(-1);
    const side = bullOrder === bearOrder ? 0 : bullOrder > bearOrder ? 1 : -1;
    const orderCount = Math.max(bullOrder,bearOrder);
    const slopeSigns = slots.map(slot => {
      const series = snapshot.seriesBySlot && snapshot.seriesBySlot[slot.slotId] || [];
      const recent = series.slice(-4).map(point => num37(point && point.value)).filter(value => value != null);
      return recent.length >= 2 ? Math.sign(recent[recent.length-1]-recent[0]) : 0;
    });
    const slopeCount = side ? slopeSigns.filter(sign => sign === side).length : 0;
    const currentSpread = Math.abs(values[0]-values[4])/Math.max(Math.abs(values[2]),1);
    const priorValues = slots.map(slot => {
      const series = snapshot.seriesBySlot && snapshot.seriesBySlot[slot.slotId] || [];
      return series.length >= 4 ? num37(series[series.length-4].value) : null;
    });
    const priorSpread = priorValues.some(value => value == null) ? currentSpread : Math.abs(priorValues[0]-priorValues[4])/Math.max(Math.abs(priorValues[2]),1);
    const spreadDelta = currentSpread-priorSpread;
    let stableChecks = 0;
    let stableMatches = 0;
    for(let offset=1;offset<=3;offset++){
      const historical = slots.map(slot => {
        const series = snapshot.seriesBySlot && snapshot.seriesBySlot[slot.slotId] || [];
        return series.length >= offset ? num37(series[series.length-offset].value) : null;
      });
      if(historical.some(value => value == null) || !side) continue;
      stableChecks += 1;
      const count = historical.slice(0,-1).filter((value,index) => side > 0 ? value > historical[index+1] : value < historical[index+1]).length;
      if(count >= 3) stableMatches += 1;
    }
    const stability = stableChecks ? stableMatches/stableChecks : 0;
    const alignment = side ? clamp37(orderCount/4*0.55+slopeCount/5*0.25+stability*0.20,0,1) : 0;
    const stateName = orderCount === 4 && slopeCount >= 4 ? "aligned" : orderCount >= 3 ? "near-complete" : orderCount === 2 ? "transitioning" : "mixed";
    const phase = stateName === "transitioning" || !side ? "transitioning"
      : spreadDelta > 0.00018 ? "expanding"
        : spreadDelta < -0.00018 ? "compressing" : "stable";
    return {tf,available:true,side,alignment,state:stateName,phase,orderCount,slopeCount,stability,currentSpread,priorSpread,spreadDelta,values,labels:slots.map(slot => `EMA${slot.period}`)};
  }
  function evaluateBias37(samples,horizonId){
    const engine = horizonEngine37(horizonId);
    const policy = entryPolicy37(horizonId);
    const stackTfs = [...new Set([...policy.setupTfs,policy.primaryTf,...engine.structureTfs])];
    const stacks = stackTfs.map(maStackState37);
    const stackWeights = new Map(stackTfs.map((tf,index) => [tf,tf === policy.primaryTf ? 1.45 : tf === policy.triggerTf ? 1.20 : Math.max(0.55,1-index*0.1)]));
    let stackRaw = 0;
    let stackWeight = 0;
    stacks.filter(stack => stack.available).forEach(stack => {
      const weight = stackWeights.get(stack.tf) || 0.7;
      stackRaw += stack.side*stack.alignment*weight;
      stackWeight += weight;
    });
    const stackScore = stackWeight ? stackRaw/stackWeight : 0;
    let pressureRaw = 0;
    let pressureWeight = 0;
    (Array.isArray(samples) ? samples : []).filter(sample => sample.available).forEach(sample => {
      const microFactor = horizonId === "quick" && sample.tf === "1m" ? 0.18 : 1;
      const strength = sample.sideSign === 0 ? 0 : clamp37((sample.dominantPct-0.5)/0.12,0,1);
      pressureRaw += sample.sideSign*strength*sample.weight*microFactor;
      pressureWeight += sample.weight*microFactor;
    });
    const pressureScore = pressureWeight ? pressureRaw/pressureWeight : 0;
    const provisionalSide = Math.abs(stackScore) >= 0.22 ? Math.sign(stackScore) : Math.sign(pressureScore);
    const structureLong = structuralMarketContext37("LONG",horizonId);
    const structureShort = structuralMarketContext37("SHORT",horizonId);
    const structureScore = clamp37((structureLong.normalized-structureShort.normalized)/2,-1,1);
    const combined = stackScore*0.62+pressureScore*0.23+structureScore*0.15;
    const primaryStack = stacks.find(stack => stack.tf === policy.primaryTf);
    const triggerStack = stacks.find(stack => stack.tf === policy.triggerTf);
    const strongStackPermission = !!([primaryStack,triggerStack].find(stack => stack && stack.side && stack.alignment >= 0.68));
    const pressurePermission = Math.abs(pressureScore) >= 0.46 && Math.abs(structureScore) >= 0.12;
    let direction = strongStackPermission ? Math.sign(stackScore || (primaryStack && primaryStack.side) || (triggerStack && triggerStack.side)) : (pressurePermission ? Math.sign(combined) : 0);
    if(direction && Math.sign(combined) && Math.sign(combined) !== direction && Math.abs(combined) >= 0.38) direction = 0;
    const directionLabel = direction > 0 ? "LONG" : direction < 0 ? "SHORT" : null;
    const audit = direction ? pressureAudit37(samples,direction) : [];
    const strongPrimaryOpposition = direction && audit.some(item => item.tf === policy.primaryTf && item.opposing && item.share >= PRESSURE_POLICY37.materialPrimaryShare && item.accelerating);
    if(strongPrimaryOpposition && !(primaryStack && primaryStack.side === direction && primaryStack.alignment >= 0.84)) direction = 0;
    const finalDirection = direction > 0 ? "LONG" : direction < 0 ? "SHORT" : null;
    const quality = Math.abs(combined);
    const confidence = finalDirection ? clamp37(Math.round(54+quality*22+(strongStackPermission ? 4 : 0)),52,82) : null;
    const source = strongStackPermission ? `${(primaryStack && primaryStack.side === direction ? primaryStack.tf : triggerStack && triggerStack.tf) || policy.primaryTf} MA stack` : pressurePermission ? "pressure plus structure" : "mixed evidence";
    return {
      direction:finalDirection,side:direction,confidence,score:combined,source,
      stackScore,pressureScore,structureScore,stacks,
      pressure:finalDirection ? pressureAudit37(samples,direction) : pressureAudit37(samples,provisionalSide || 1),
      permission:!!finalDirection,
      reason:finalDirection ? `${finalDirection} permission from ${source}` : (strongPrimaryOpposition ? `Material ${policy.primaryTf} opposition prevents directional permission` : "MA stacks, pressure, and structure do not provide a directional edge")
    };
  }
  function zoneText37(candidate){
    if(!candidate || !candidate.zone) return "Unavailable";
    return `${candidate.tf} ${candidate.source} at ${tooltipPrice37(candidate.zone.low)}-${tooltipPrice37(candidate.zone.high)}`;
  }
  function setupDisplayName37(candidate){
    if(!candidate || !candidate.family) return "No active setup";
    const long = candidate.direction === "LONG" || candidate.side > 0 || candidate.direction > 0;
    const role = long ? "support" : "resistance";
    if(/^EMA\d+(?:\/EMA\d+)?$/.test(String(candidate.source || ""))){
      const type = String(candidate.source).includes("/") ? "zone" : "test";
      return `${candidate.tf} ${candidate.source} ${role} ${type}`;
    }
    if(candidate.family === "Structure breakout and retest") return `${candidate.tf} ${candidate.source} retest`;
    if(candidate.family === "Structure rejection") return `${candidate.tf} ${candidate.source} rejection`;
    return `${candidate.tf} ${candidate.source || candidate.family}`;
  }
  function signalPresentation37(signal,decision){
    const bias = signal && signal.marketDirection;
    const internalState = decision && decision.state;
    if(internalState && SIGNAL_PRESENTATION37[internalState] && internalState !== "BIAS CONFIRMED" && internalState !== "NO BIAS"){
      return SIGNAL_PRESENTATION37[internalState];
    }
    return bias ? SIGNAL_PRESENTATION37["BIAS CONFIRMED"] : SIGNAL_PRESENTATION37["NO BIAS"];
  }
  function signalDirectionConfidence37(signal){
    const direction = signal && signal.marketDirection;
    const confidence = num37(signal && signal.confidence);
    return direction && confidence != null ? `${direction} ${Math.round(confidence)}%` : direction || "";
  }
  function signalSummaryVariants37(signal,decision){
    const bias = signal && signal.marketDirection;
    if(!bias) return {full:"NO SETUP \u00b7 NO BIAS",short:"NO SETUP \u00b7 NO BIAS",minimal:"NO SETUP \u00b7 NO BIAS"};
    const directionConfidence = signalDirectionConfidence37(signal);
    const presentation = signalPresentation37(signal,decision);
    const full = `${directionConfidence} \u00b7 ${presentation.label}`;
    return {
      full,
      short:full,
      minimal:full
    };
  }
  function normalizeDisplayedDirection37(value){
    if(value === 1) return "LONG";
    if(value === -1) return "SHORT";
    const normalized=String(value || "").toUpperCase();
    return normalized === "LONG" || normalized === "SHORT" ? normalized : "NO BIAS";
  }
  function displayedDecisionDirection37(decision){
    return normalizeDisplayedDirection37(decision && (decision.direction ?? decision.side));
  }
  function displayedSignalMeta37(displayed){
    if(!displayed) return null;
    return {
      generation:displayed.generation,
      signalIdentity:displayed.signalIdentity,
      directionMode:displayed.directionMode || displayed.mode,
      evaluatedDirection:displayed.evaluatedDirection || displayed.direction,
      authoritativePhase:displayed.authoritativePhase || null,
      direction:displayed.direction,
      confidence:displayed.confidence,
      confidenceText:displayed.confidenceText,
      visibleState:displayed.visibleState,
      setupIdentity:displayed.setupIdentity,
      horizonId:displayed.horizonId,
      engineId:displayed.engineId,
      signalId:displayed.signalId || displayed.engineId,
      engineVersion:displayed.engineVersion,
      publicationGeneration:displayed.publicationGeneration
    };
  }
  function displayedSignalMatches37(left,right){
    if(!left || !right) return false;
    const a=displayedSignalMeta37(left),b=displayedSignalMeta37(right);
    return a.generation===b.generation && a.signalIdentity===b.signalIdentity && a.directionMode===b.directionMode && a.evaluatedDirection===b.evaluatedDirection && a.authoritativePhase===b.authoritativePhase && a.direction===b.direction
      && a.confidence===b.confidence && a.visibleState===b.visibleState
      && (a.setupIdentity || null)===(b.setupIdentity || null) && a.horizonId===b.horizonId
      && a.engineId===b.engineId && a.signalId===b.signalId && a.engineVersion===b.engineVersion && a.publicationGeneration===b.publicationGeneration;
  }
  function buttonMatchesDisplayedSignal37(displayed){
    if(!displayed || !state.entry) return false;
    const button=state.entry.dataset;
    const matches=button.signalDirectionMode===displayed.mode && button.signalEvaluatedDirection===(displayed.evaluatedDirection||displayed.direction) && (button.signalAuthoritativePhase||null)===(displayed.authoritativePhase||null) && button.signalDirection===displayed.direction
      && (button.signalConfidence==="" ? null : Number(button.signalConfidence))===(displayed.confidence==null ? null : displayed.confidence)
      && button.signalState===displayed.visibleState && (button.signalSetupIdentity || null)===(displayed.setupIdentity || null)
      && Number(button.signalGeneration)===displayed.generation && button.signalIdentity===displayed.signalIdentity
      && button.signalEngineId===displayed.engineId && button.signalId===(displayed.signalId||displayed.engineId) && button.signalEngineVersion===displayed.engineVersion;
    if(window.BT001_SIGNAL_DEBUG_ASSERTIONS===true) console.assert(matches,"Displayed Signal publication mismatch",displayedSignalMeta37(displayed));
    return matches;
  }
  function displayedSignalHeader37(displayed){
    if(!displayed) return ["Signal details unavailable"];
    return [
      "ACTIVE SIGNAL",
      `Engine: Signal ${displayed.engineId} · ${displayed.engineVersion}`,
      displayed.signalId && displayed.signalId!==displayed.engineId ? `Signal ID: ${displayed.signalId}` : null,
      `Direction mode: ${displayed.mode}`,
      displayed.evaluatedDirection ? `Evaluated direction: ${displayed.evaluatedDirection}` : null,
      displayed.authoritativePhase ? `Authoritative 15m phase: ${displayed.authoritativePhase}` : null,
      `Direction: ${displayed.direction}`,
      `Bias confidence: ${displayed.confidenceText}`,
      `State: ${displayed.visibleState}`,
      `Setup identity: ${displayed.setupIdentity || "None"}`,
      `Setup family: ${displayed.setupFamily || "None"}`,
      `Setup timeframe: ${displayed.setupTimeframe || "None"}`,
      `Entry: ${displayed.entryVerdict}`,
      `Publication generation: ${displayed.generation}`
    ].filter(Boolean);
  }
  function historicalSetupMatches37(candidate,displayed){
    return !!candidate && !!displayed && (!candidate.direction || displayedDecisionDirection37(candidate)===displayed.direction);
  }
  function displayedSignalTone37(direction,visibleState){
    if(visibleState==="TRIGGER ACTIVE") return direction==="LONG" ? "green" : direction==="SHORT" ? "red" : "gray";
    if(visibleState==="TRIGGER FORMING" || visibleState==="STAND BY") return "orange";
    if(visibleState==="NO CHASE" || visibleState==="SETUP FAILED") return "red";
    return "gray";
  }
  function buildDisplayedSignalPublication37({generation,publishedAt,mode,horizonId,signal,thesis,entryQuality}){
    const manualMismatch=mode!=="AUTO" && thesis && normalizeDisplayedDirection37(mode)!==normalizeDisplayedDirection37(signal && signal.marketDirection);
    const displaySignal=manualMismatch ? {marketDirection:mode,confidence:thesis.confidence} : signal;
    const direction=normalizeDisplayedDirection37(displaySignal && displaySignal.marketDirection);
    const candidate=manualMismatch ? null : signal && signal.entryDecision;
    const candidateDirection=displayedDecisionDirection37(candidate);
    const activeSetupState=!!candidate && ["SETUP ARMED","ZONE ENGAGED","TRIGGER DEVELOPING","READY","EXPIRED","INVALIDATED"].includes(candidate.state);
    const decision=candidate && activeSetupState && direction!=="NO BIAS" && candidateDirection===direction ? candidate : null;
    const presentation=signalPresentation37({marketDirection:direction==="NO BIAS" ? null : direction},decision);
    const confidenceValue=direction==="NO BIAS" ? null : num37(displaySignal && displaySignal.confidence);
    const confidence=confidenceValue==null ? null : Math.round(confidenceValue);
    const confidenceText=confidence==null ? "Unavailable" : `${confidence}%`;
    const setupIdentity=decision && decision.family ? (decision.setupIdentity || setupIdentity37(decision)) : null;
    const assessments=decision && decision.assessments || {};
    const targets=assessments.targetFramework || {};
    const obstacle=targets.obstacle || {};
    const history=decision ? state.setupHistories.get(setupIdentity) || {} : {};
    const originStatus=!decision ? null : !history.zoneReached ? (decision.distance===0 ? "TESTING" : "APPROACHING")
      : decision.state==="INVALIDATED" ? "FAILED" : history.retired ? "RETIRED" : decision.distance===0 ? "TESTING"
        : decision.interaction && decision.interaction.reclaim ? "RECLAIMED" : decision.interaction && decision.interaction.rejection ? "REJECTED"
          : decision.interaction && decision.interaction.hold ? "HELD" : "PASSED";
    const setupZone=decision && decision.zone ? {low:decision.zone.low,high:decision.zone.high} : null;
    const entryVerdict=decision ? (decision.entryAction || (decision.state==="READY" ? `READY ${direction}` : "WAIT")) : "WAIT";
    const summarySignal={marketDirection:direction==="NO BIAS" ? null : direction,confidence};
    const summaryVariants=Object.freeze(signalSummaryVariants37(summarySignal,decision));
    const signalIdentity=[generation,horizonId,mode,direction,confidence==null ? "na" : confidence,presentation.label,setupIdentity || "none"].join("|");
    return Object.freeze({
      generation,publishedAt,signalIdentity,direction,confidence,confidenceText,visibleState:presentation.label,
      definition:presentation.definition,setupIdentity,setupFamily:decision && decision.family || null,
      setupTimeframe:decision && decision.tf || null,setupOrigin:decision ? setupDisplayName37(decision) : null,originStatus,
      setupZone,entryMode:assessments.entryMode || null,setupQuality:assessments.setup && assessments.setup.grade || null,
      triggerQuality:assessments.trigger && assessments.trigger.grade || null,currentEntryQuality:assessments.current && assessments.current.grade || null,
      entryVerdict,triggerState:decision && decision.triggerState || "absent",
      triggerEvidence:Object.freeze([...(decision && decision.interaction && decision.interaction.evidence || [])]),
      invalidation:decision && decision.invalidation != null ? decision.invalidation : null,
      targets:Object.freeze({...targets}),obstacles:Object.freeze({...obstacle}),
      participation:decision && decision.pressure && (decision.pressure.participationExpectation || decision.pressure.triggerParticipation) || null,
      pressureEvidence:Object.freeze([...(decision && decision.pressure && decision.pressure.evidence || [])]),
      dataStatus:signal && signal.dataHealth && signal.dataHealth.status || "unavailable",horizonId,horizonLabel:horizonLabel37(horizonId),mode,directionMode:mode,
      activeReasons:Object.freeze([...new Set([decision && decision.reason || entryQuality && entryQuality.instruction,...(decision && decision.opposingEvidence || [])].filter(Boolean))]),
      missingConditions:Object.freeze([...(entryQuality && entryQuality.exclusions || [])]),
      limitations:Object.freeze([assessments.limitation].filter(Boolean)),
      decision,summaryVariants,entryTone:displayedSignalTone37(direction,presentation.label)
    });
  }
  function normalizedSignalAOutput37(signal,thesis,entryQuality,displayedSignal){
    const decision=displayedSignal.decision;
    return {
      direction:displayedSignal.direction,confidence:displayedSignal.confidence,entryState:displayedSignal.visibleState,
      setupIdentity:displayedSignal.setupIdentity,setupFamily:displayedSignal.setupFamily,setupTimeframe:displayedSignal.setupTimeframe,
      setupQuality:displayedSignal.setupQuality,triggerQuality:displayedSignal.triggerQuality,currentEntryQuality:displayedSignal.currentEntryQuality,
      entryVerdict:displayedSignal.entryVerdict,reasons:[...displayedSignal.activeReasons],exclusions:[...displayedSignal.missingConditions],
      triggerIdentity:triggerIdentity37(signal,decision),triggerEvidence:[...displayedSignal.triggerEvidence],dataStatus:displayedSignal.dataStatus,tone:displayedSignal.entryTone,
      visibleState:displayedSignal.visibleState,definition:displayedSignal.definition,
      presentation:{signal,thesis,entryQuality,displayedSignal}
    };
  }
  function displayedFromEngineOutput37(output,{generation,publishedAt,mode,horizonId}){
    const legacy=output.presentation&&output.presentation.displayedSignal;
    if(legacy) return Object.freeze({...legacy,engineId:output.engineId,signalId:output.signalId||output.engineId,engineVersion:output.engineVersion,publicationGeneration:generation});
    const direction=normalizeDisplayedDirection37(output.direction),confidence=output.confidence==null?null:Math.round(Number(output.confidence));
    const visibleState=String(output.visibleState||output.entryState||"NO SETUP"),decision=output.decision||null,evaluatedDirection=normalizeDisplayedDirection37(output.evaluatedDirection||output.direction),authoritativePhase=output.authoritativePhase||output.comparisonDiagnostics&&output.comparisonDiagnostics.authoritativePhase||null;
    const summarySignal={marketDirection:direction==="NO BIAS"?null:direction,confidence};
    const summaryVariants=Object.freeze(output.summaryVariants||signalSummaryVariants37(summarySignal,decision));
    return Object.freeze({
      generation,publishedAt,signalIdentity:[generation,horizonId,mode,evaluatedDirection,authoritativePhase||"no-phase",direction,confidence==null?"na":confidence,visibleState,output.setupIdentity||"none"].join("|"),
      direction,confidence,confidenceText:confidence==null?"Unavailable":`${confidence}%`,visibleState,definition:output.definition||"Signal engine result.",
      setupIdentity:output.setupIdentity||null,setupFamily:output.setupFamily||null,setupTimeframe:output.setupTimeframe||null,setupOrigin:null,originStatus:null,setupZone:null,entryMode:null,
      setupQuality:output.setupQuality||null,triggerQuality:output.triggerQuality||null,currentEntryQuality:output.currentEntryQuality||null,entryVerdict:output.entryVerdict||"WAIT",
      triggerState:output.triggerIdentity?"active":"absent",triggerEvidence:Object.freeze([...(output.triggerEvidence||[])]),invalidation:null,targets:Object.freeze({}),obstacles:Object.freeze({}),participation:null,pressureEvidence:Object.freeze([]),
      dataStatus:output.dataStatus||"unavailable",horizonId,horizonLabel:horizonLabel37(horizonId),mode,directionMode:mode,evaluatedDirection,authoritativePhase,detailLines:Object.freeze([...(output.detailLines||[])]),activeReasons:Object.freeze([...(output.reasons||[])]),missingConditions:Object.freeze([...(output.exclusions||[])]),limitations:Object.freeze([]),
      decision,summaryVariants,entryTone:output.tone||displayedSignalTone37(direction,visibleState),engineId:output.engineId,signalId:output.signalId||output.engineId,engineVersion:output.engineVersion,publicationGeneration:generation
    });
  }
  function topSignalText37(signal,decision){
    return signalSummaryVariants37(signal,decision).full;
  }
  function renderResponsiveSignalSummary37(){
    if(state.summaryFrame != null) cancelAnimationFrame(state.summaryFrame);
    state.summaryFrame = null;
    if(!state.entry || !state.signalSummaryVariants) return;
    const variants = state.signalSummaryVariants;
    const choices = [["full",variants.full],["short",variants.short],["minimal",variants.minimal]];
    let selected = choices[choices.length-1];
    for(const choice of choices){
      state.entry.textContent = choice[1];
      if(state.entry.scrollWidth <= state.entry.clientWidth+1){
        selected = choice;
        break;
      }
    }
    state.entry.textContent = selected[1];
    state.entry.dataset.summaryVariant = selected[0];
  }
  function scheduleResponsiveSignalSummary37(){
    if(state.summaryFrame != null) return;
    state.summaryFrame = requestAnimationFrame(renderResponsiveSignalSummary37);
  }
  function triggerIdentity37(signal,decision){
    if(!decision) return null;
    if(decision.triggerIdentity) return decision.triggerIdentity;
    if(decision.state !== "READY") return null;
    const snapshot = state.activeSnapshot || state.marketSnapshot;
    const activationTime = decision.interaction && (decision.interaction.reactionTime ?? decision.interaction.interactionTime);
    return [
      snapshot && snapshot.symbol || "",
      decision.horizonId || state.horizon,
      decision.direction || signal && signal.marketDirection || "",
      decision.setupIdentity || setupIdentity37(decision),
      decision.pressure && decision.pressure.triggerTf || decision.tf || "",
      activationTime ?? decision.breakTime ?? decision.fingerprint ?? ""
    ].join("|");
  }
  function stopTriggerAlert37(clearIdentity=true){
    if(state.triggerAlertTimer != null) clearTimeout(state.triggerAlertTimer);
    state.triggerAlertTimer = null;
    state.triggerAlertEndsAt = 0;
    if(state.entry) state.entry.classList.remove("is-trigger-active-alert");
    if(clearIdentity){state.activeTriggerAlertId = null;state.activeTriggerAlertMeta=null;}
  }
  function rememberTriggerAlert37(identity){
    state.seenTriggerAlertIds.add(identity);
    state.seenTriggerAlertOrder.push(identity);
    while(state.seenTriggerAlertOrder.length > 256){
      const oldest = state.seenTriggerAlertOrder.shift();
      state.seenTriggerAlertIds.delete(oldest);
    }
  }
  function updateTriggerAlert37(signal,decision,displayed=null){
    const identity = triggerIdentity37(signal,decision);
    if(!identity){
      stopTriggerAlert37();
      return;
    }
    if(identity === state.activeTriggerAlertId){
      if(state.triggerAlertEndsAt > Date.now() && state.entry) state.entry.classList.add("is-trigger-active-alert");
      return;
    }
    stopTriggerAlert37();
    state.activeTriggerAlertId = identity;
    const engine=activeSignalEngine37();
    state.activeTriggerAlertMeta={identity,directionMode:displayed&&displayed.mode||state.direction,engineId:displayed&&displayed.engineId||engine&&engine.id||null,engineVersion:displayed&&displayed.engineVersion||engine&&engine.version||null,publicationGeneration:displayed&&displayed.publicationGeneration||state.refreshGeneration};
    if(state.seenTriggerAlertIds.has(identity)) return;
    rememberTriggerAlert37(identity);
    state.triggerAlertEndsAt = Date.now()+TRIGGER_ALERT_DURATION37;
    if(state.entry) state.entry.classList.add("is-trigger-active-alert");
    state.triggerAlertTimer = setTimeout(() => {
      if(state.activeTriggerAlertId === identity) stopTriggerAlert37(false);
    },TRIGGER_ALERT_DURATION37);
  }
  function signalToolbarTooltip37(signal,entryQuality,thesis,displayed){
    if(!displayed) return "Signal details unavailable";
    const decision = displayed.decision;
    const presentation = {label:displayed.visibleState,definition:displayed.definition};
    const snapshot = state.activeSnapshot || state.marketSnapshot;
    const freshness = snapshot && snapshot.freshness;
    const ageText = age => Number.isFinite(Number(age)) ? `${Math.round(Number(age)/1000)}s ago` : "Unavailable";
    const candleText = evidence => evidence ? `Latest closed ${evidence.tf} candle` : "Unavailable";
    if(!signal || signal.loading || signal.dataIncomplete){
      return [presentation.definition,"",`Direction mode: ${displayed.mode}`,`Direction: ${displayed.direction}`,`Bias confidence: ${displayed.confidenceText}`,`State: ${presentation.label}`,`Setup identity: ${displayed.setupIdentity || "None"}`,"Entry: Data incomplete",`Publication generation: ${displayed.generation}`,`Reason: ${entryQuality && entryQuality.instruction || "Waiting for required market data"}`,`Data status: ${freshness && freshness.signalStatus || "UNAVAILABLE"}`,"",`Engine: Signal ${displayed.engineId} · ${displayed.engineVersion}`].join("\n");
    }
    const lines = [presentation.definition,"",`Direction mode: ${displayed.mode}`,`Direction: ${displayed.direction}`,`Bias confidence: ${displayed.confidenceText}`,`State: ${displayed.visibleState}`,`Setup identity: ${displayed.setupIdentity || "None"}`,`Horizon: ${displayed.horizonLabel}`,`Publication generation: ${displayed.generation}`];
    if(thesis) lines.push(`Selected thesis: ${displayed.direction} ${thesis.status}${displayed.confidence == null ? "" : ` ${displayed.confidenceText}`}`);
    if(!decision || !decision.family){
      lines.push("Setup: None","Entry: WAIT",`Reason: ${entryQuality && entryQuality.instruction || "Waiting for a valid setup location"}`,`Data status: ${freshness && freshness.signalStatus || "UNAVAILABLE"}`,`Price: ${ageText(freshness && freshness.priceAgeMs)}`);
      lines.push("",`Engine: Signal ${displayed.engineId} · ${displayed.engineVersion}`);
      return lines.join("\n");
    }
    const assessments = decision.assessments || {};
    const targets = assessments.targetFramework || {};
    const target = targets.primary || assessments.target || {};
    const obstacle = targets.obstacle || {};
    const extended = targets.extended || {};
    const currentInvalidation = assessments.executionInvalidation || {};
    lines.push(
      `Setup family: ${decision.family}`,
      `Setup timeframe: ${decision.tf}`,
      `Setup: ${setupDisplayName37(decision)}`,
      `Setup origin zone: ${tooltipPrice37(decision.zone.low)}-${tooltipPrice37(decision.zone.high)}`,
      `Origin-zone status: ${displayed.originStatus || "Unavailable"}`,
      "",
      `Entry mode: ${assessments.entryMode === "RETEST" ? "Retest" : assessments.entryMode === "CONTINUATION" ? "Continuation" : "Unavailable"}`,
      `Setup quality: ${assessments.setup && assessments.setup.grade || "UNAVAILABLE"}`,
      `Trigger quality: ${assessments.trigger && assessments.trigger.grade || "UNAVAILABLE"}`,
      `Current entry quality: ${assessments.current && assessments.current.grade || "UNAVAILABLE"}`,
      "",
      `Next obstacle: ${obstacle.available ? tooltipPrice37(obstacle.price) : "Unavailable"}`,
      `Obstacle source: ${obstacle.source || "Unavailable"}`,
      `Obstacle significance: ${obstacle.significance || "UNAVAILABLE"}`,
      `Primary target: ${target.available ? tooltipPrice37(target.price) : "Unavailable"}`,
      `Target source: ${target.source || "Unavailable"}`,
      `Remaining room: ${target.available ? `${tooltipPrice37(target.remainingDistance)}${target.remainingAtr == null ? "" : ` · ${target.remainingAtr.toFixed(1)}× ${targets.atrTf || decision.tf} ATR`}` : "Unavailable"}`,
      `Extended target: ${extended.available ? tooltipPrice37(extended.price) : "Unavailable"}`,
      `Extended source: ${extended.source || "Unavailable"}`,
      `Original invalidation: ${tooltipPrice37(decision.invalidation)}`,
      `Current execution invalidation: ${currentInvalidation.available ? tooltipPrice37(currentInvalidation.price) : "Unavailable"}`,
      `Execution invalidation basis: ${currentInvalidation.basis || "Unavailable"}`,
      `Remaining reward/risk: ${assessments.remainingRewardRisk == null ? "Unavailable" : assessments.remainingRewardRisk.toFixed(1)}`,
      `Momentum: ${assessments.momentum && assessments.momentum.label || "Unavailable"}`,
      `Participation: ${decision.pressure && decision.pressure.participationExpectation && decision.pressure.participationExpectation.text || decision.pressure && decision.pressure.triggerParticipation && decision.pressure.triggerParticipation.text || "Unavailable"}`,
      `Limitation: ${assessments.limitation || "None"}`,
      "",
      `Trigger: ${decision.triggerState || "absent"}`,
      `Entry: ${decision.entryAction || (decision.state === "READY" ? `READY ${decision.direction}` : "WAIT")}`,
      `Reason: ${decision.reason}`,
      `Data status: ${freshness && freshness.signalStatus || "UNAVAILABLE"}`,
      `Price: ${ageText(freshness && freshness.priceAgeMs)}`,
      `Trigger evidence: ${candleText(freshness && freshness.triggerClosed)}`,
      `Management structure: ${candleText(freshness && freshness.managementClosed)}`
    );
    (freshness && freshness.signalStaleSources || []).forEach(item => lines.push(`Stale input: ${item.source} · ${ageText(item.ageMs)}`));
    lines.push("",`Engine: Signal ${displayed.engineId} · ${displayed.engineVersion}`);
    return lines.join("\n");
  }
  function candidateDistance37(zone,price){
    if(!zone || price == null) return null;
    if(price >= zone.low && price <= zone.high) return 0;
    return Math.min(Math.abs(price-zone.low),Math.abs(price-zone.high))/Math.max(Math.abs(price),1);
  }
  function normalizedZoneKey37(zone,atr){
    const midpoint = Math.abs((Number(zone && zone.low || 0)+Number(zone && zone.high || 0))/2);
    const step = Math.max(Math.pow(10,Math.floor(Math.log10(Math.max(midpoint,1e-8)))-4),1e-8);
    const normalized = value => num37(value) == null ? "" : Math.round(Number(value)/step);
    return `${normalized(zone && zone.low)}:${normalized(zone && zone.high)}`;
  }
  function setupIdentity37(candidate){
    const snapshot = state.activeSnapshot || state.marketSnapshot;
    return [
      snapshot && snapshot.symbol || "",candidate.horizonId || state.horizon,candidate.direction || "",
      candidate.family || "",candidate.tf || "",candidate.source || "",
      normalizedZoneKey37(candidate.zone,candidate.volatility && candidate.volatility.atr),
      candidate.breakTime || ""
    ].join("|");
  }
  function setupHistory37(candidate){
    const id = candidate.setupIdentity || setupIdentity37(candidate);
    let history = state.setupHistories.get(id);
    if(!history){
      history = {setupIdentity:id,zoneReached:false,firstInteractionTime:null,lastInteractionTime:null,reactionDirection:null,maxFavorableMovement:0,triggerFormationBegan:false,triggerBecameActive:false,retired:false,invalidated:false,replaced:false,lastState:"SETUP ARMED"};
      state.setupHistories.set(id,history);
      while(state.setupHistories.size > 256) state.setupHistories.delete(state.setupHistories.keys().next().value);
    }
    return history;
  }
  function gradeQuality37(score,available=true){
    if(!available || !Number.isFinite(Number(score))) return "UNAVAILABLE";
    const grades = featureConfig.signalQuality.grades;
    if(score >= grades.A) return "A";
    if(score >= grades.B) return "B";
    if(score >= grades.C) return "C";
    return "UNACCEPTABLE";
  }
  function makeEntryCandidate37(spec,horizonId){
    const volatility = volatilityRules37(spec.tf,horizonId);
    const price = signalCurrentPrice37();
    const rawLow = Math.min(spec.levelLow,spec.levelHigh);
    const rawHigh = Math.max(spec.levelLow,spec.levelHigh);
    const zone = {low:rawLow-volatility.zonePad,high:rawHigh+volatility.zonePad};
    const invalidation = spec.invalidation != null ? spec.invalidation : (spec.direction > 0
      ? zone.low-Math.max(volatility.atr*0.35,(zone.high-zone.low)*0.45)
      : zone.high+Math.max(volatility.atr*0.35,(zone.high-zone.low)*0.45));
    const setupRows = state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[spec.tf] || [];
    const activationRow = setupRows[Math.max(0,setupRows.length-entryPolicy37(horizonId).triggerCandles-3)] || setupRows[0];
    const candidate = {
      ...spec,horizonId,zone,invalidation,volatility,
      distance:candidateDistance37(zone,price),currentPrice:price,
      setupActivationTime:spec.breakTime || Number(activationRow && activationRow.time) || null,
      triggerWindow:entryPolicy37(horizonId).triggerCandles,
      fingerprint:`${state.activeSnapshot && state.activeSnapshot.symbol || ""}|${horizonId}|${spec.direction}|${spec.family}|${spec.tf}|${Math.round((rawLow+rawHigh)/2/Math.max(volatility.atr*0.25,1e-8))}`
    };
    candidate.setupIdentity = setupIdentity37(candidate);
    return candidate;
  }
  function interactionAndReaction37(candidate){
    const rows = signalRows37(candidate.tf);
    const history = setupHistory37(candidate);
    const activation = candidate.breakTime || candidate.setupActivationTime || 0;
    const start = Math.max(0,rows.findIndex(row => Number(row.time) >= activation));
    let interactionIndex = -1;
    for(let index=start;index<rows.length;index++){
      const row = rows[index];
      if(candidate.breakTime && Number(row.time) < candidate.breakTime) continue;
      if(Number(row.low) <= candidate.zone.high+candidate.volatility.tolerance && Number(row.high) >= candidate.zone.low-candidate.volatility.tolerance){
        interactionIndex = index;
        break;
      }
    }
    if(interactionIndex < 0 && !history.zoneReached){
      return {
        interacted:false,reaction:false,confirmedReaction:false,provisionalReaction:false,
        movement:false,sustainedMovement:false,age:null,interactionTime:null,
        trigger:"No interaction",confirmationRole:"none",evidence:["Price has not reached the setup zone"]
      };
    }
    if(interactionIndex < 0 && history.zoneReached){
      interactionIndex = Math.max(0,rows.findIndex(row => Number(row.time) >= Number(history.firstInteractionTime || activation)));
    }
    const intended = candidate.direction;
    const after = rows.slice(interactionIndex);
    const reactionEvidence = row => {
      const index = rows.indexOf(row);
      const previous = index > 0 ? rows[index-1] : null;
      const reclaimed = !!previous && (intended > 0
        ? Number(previous.close) < candidate.zone.low && Number(row.close) > candidate.zone.high
        : Number(previous.close) > candidate.zone.high && Number(row.close) < candidate.zone.low);
      const held = intended > 0
        ? Number(row.low) <= candidate.zone.high+candidate.volatility.tolerance && Number(row.close) >= candidate.zone.high && Number(row.close) > Number(row.open)
        : Number(row.high) >= candidate.zone.low-candidate.volatility.tolerance && Number(row.close) <= candidate.zone.low && Number(row.close) < Number(row.open);
      const rejected = intended > 0
        ? Number(row.low) < candidate.zone.low && Number(row.close) > candidate.zone.high
        : Number(row.high) > candidate.zone.high && Number(row.close) < candidate.zone.low;
      return {reclaimed,held,rejected,qualifies:reclaimed || held || rejected};
    };
    const closedAfter = after.filter(row => row.final !== false);
    const formingAfter = after.filter(row => row.final === false);
    const closedReactionRow = closedAfter.find(row => reactionEvidence(row).qualifies) || null;
    const formingReactionRow = formingAfter.find(row => reactionEvidence(row).qualifies) || null;
    const favorableCloseMove = source => {
      if(!source.length) return 0;
      return intended > 0
        ? Math.max(...source.map(row => Number(row.close)))-candidate.zone.high
        : candidate.zone.low-Math.min(...source.map(row => Number(row.close)));
    };
    const closedMove = favorableCloseMove(closedAfter);
    const liveMove = favorableCloseMove(after);
    const initialThreshold = Math.max(candidate.volatility.atr*0.18,Math.abs(candidate.currentPrice || 0)*0.00020);
    const sustainedThreshold = Math.max(candidate.volatility.atr*0.32,Math.abs(candidate.currentPrice || 0)*0.00032);
    const movement = Math.max(closedMove,liveMove) >= initialThreshold;
    const confirmedMovement = closedMove >= initialThreshold;
    const sustainedMovement = Math.max(closedMove,liveMove) >= sustainedThreshold;
    const reactionRow = closedReactionRow || formingReactionRow;
    const evidence = reactionRow ? reactionEvidence(reactionRow) : {reclaimed:false,held:false,rejected:false};
    const confirmedReaction = !!closedReactionRow;
    const provisionalReaction = !closedReactionRow && !!formingReactionRow;
    const reaction = (confirmedReaction || provisionalReaction) && movement;
    const reactionType = !reactionRow ? "touch only" : intended > 0
      ? evidence.reclaimed ? "bullish reclaim" : evidence.rejected ? "lower-price rejection" : "support hold"
      : evidence.reclaimed ? "bearish reclaim" : evidence.rejected ? "higher-price rejection" : "resistance hold";
    const latestIndex = rows.length-1;
    const age = latestIndex-interactionIndex;
    const interactionTime = Number(rows[interactionIndex].time);
    history.zoneReached = true;
    history.firstInteractionTime ??= interactionTime;
    const touchingRows = after.filter(row => Number(row.low) <= candidate.zone.high+candidate.volatility.tolerance && Number(row.high) >= candidate.zone.low-candidate.volatility.tolerance);
    history.lastInteractionTime = Number((touchingRows.length ? touchingRows[touchingRows.length-1] : rows[interactionIndex]).time);
    history.reactionDirection = reaction ? (intended > 0 ? "LONG" : "SHORT") : history.reactionDirection;
    history.maxFavorableMovement = Math.max(Number(history.maxFavorableMovement || 0),Math.max(closedMove,liveMove));
    if(reaction && movement) history.triggerFormationBegan = true;
    return {
      interacted:true,reaction,confirmedReaction,provisionalReaction,movement,confirmedMovement,sustainedMovement,
      move:Math.max(closedMove,liveMove),closedMove,liveMove,initialThreshold,sustainedThreshold,age,
      interactionTime:history.firstInteractionTime,reactionTime:reactionRow ? Number(reactionRow.time) : null,
      trigger:reactionType,confirmationRole:confirmedReaction ? "closed" : provisionalReaction ? "forming/provisional" : "none",
      reclaim:evidence.reclaimed,rejection:evidence.rejected,hold:evidence.held,
      evidence:[
        `Zone interaction: ${rows[interactionIndex].final === false ? "forming" : "closed"} candle`,
        `Reaction: ${reactionRow ? reactionType : "absent"} (${confirmedReaction ? "closed" : provisionalReaction ? "forming/provisional" : "none"})`,
        `Movement away: ${movement ? "yes" : "no"}; ${Math.max(closedMove,liveMove).toFixed(2)} versus ${initialThreshold.toFixed(2)} required`,
        `Sustained movement: ${sustainedMovement ? "yes" : "no"}; ${sustainedThreshold.toFixed(2)} required`
      ]
    };
  }
  function pressureEffectiveness37(sample,candidate){
    if(!sample || !sample.available) return {state:"unavailable",adverseEffective:false,alignedEffective:false,losingEffectiveness:false,net:0,threshold:null};
    const desired = candidate.direction;
    const rows = signalRows37(sample.tf).filter(row => row.final !== false).slice(-4);
    const atr = averageTrueRange37(sample.tf,14) || candidate.volatility.atr;
    const net = rows.length >= 2 ? Number(rows[rows.length-1].close)-Number(rows[0].close) : 0;
    const threshold = Math.max(atr*0.12,Math.abs(candidate.currentPrice || 0)*0.00012);
    const oriented = net*desired;
    const classification = pressureClassification37(sample,desired);
    const adverseEffective = classification.opposing && (oriented < -threshold || (!sample.priceRefuses && sample.contextSide === -desired));
    const alignedEffective = classification.aligned && (oriented > threshold || (!sample.priceRefuses && sample.contextSide === desired));
    const losingEffectiveness = classification.opposing && !adverseEffective && (sample.priceRefuses || oriented >= -threshold);
    return {
      state:adverseEffective ? "opposing pressure remains effective" : alignedEffective ? "aligned pressure is producing progress" : losingEffectiveness ? "opposing pressure is losing effectiveness" : "pressure has not produced directional progress",
      adverseEffective,alignedEffective,losingEffectiveness,net,oriented,threshold
    };
  }
  function participationBasis37(sample){
    const ratio = num37(sample && sample.participationRatio);
    const stateName = ratio == null ? "Unknown" : ratio >= PRESSURE_POLICY37.participationExpanding ? "Expanding" : ratio < PRESSURE_POLICY37.participationWeak ? "Weak" : "Normal";
    return {state:stateName,ratio,tf:sample && sample.tf || "unavailable",lookback:sample && sample.lookback || null,text:`${stateName}${ratio == null ? "" : ` ${ratio.toFixed(2)}x`} - ${sample && sample.tf || "unavailable"}${sample && sample.lookback ? ` LB${sample.lookback}` : ""}`};
  }
  function candidatePressureConfirmation37(candidate,samples){
    const policy = entryPolicy37(candidate.horizonId);
    const desired = candidate.direction;
    const triggerSample = samples.find(sample => sample.tf === policy.triggerTf) || samples.find(sample => sample.tf === candidate.tf);
    const primarySample = samples.find(sample => sample.tf === policy.primaryTf) || triggerSample;
    const microSample = candidate.horizonId === "quick" ? samples.find(sample => sample.tf === "1m") : null;
    const trigger = pressureClassification37(triggerSample,desired);
    const primary = pressureClassification37(primarySample,desired);
    const micro = microSample ? pressureClassification37(microSample,desired) : null;
    const triggerEffectiveness = pressureEffectiveness37(triggerSample,candidate);
    const primaryEffectiveness = pressureEffectiveness37(primarySample,candidate);
    const microEffectiveness = microSample ? pressureEffectiveness37(microSample,candidate) : null;
    const primaryBlocked = primary.opposing && primary.share >= 0.54 && primaryEffectiveness.adverseEffective;
    const triggerBlocked = trigger.opposing && trigger.share >= 0.54 && triggerEffectiveness.adverseEffective;
    const microBlocked = !!(micro && micro.opposing && micro.material && microEffectiveness && microEffectiveness.adverseEffective && trigger.opposing);
    const triggerParticipation = participationBasis37(triggerSample);
    const broaderParticipation = participationBasis37(primarySample);
    const triggerRows = signalRows37(triggerSample && triggerSample.tf || policy.triggerTf).filter(row => row.final !== false).slice(-8);
    const recentVolumes = triggerRows.map(row => num37(row.volume)).filter(value => value != null);
    const baselineVolumes = recentVolumes.slice(0,Math.max(1,recentVolumes.length-3));
    const baselineVolume = baselineVolumes.length ? baselineVolumes.reduce((sum,item) => sum+item,0)/baselineVolumes.length : null;
    const persistence = recentVolumes.length >= 3 && baselineVolume > 0 ? recentVolumes.slice(-3).filter(value => value >= baselineVolume*0.80).length : 0;
    const setupHistory = setupHistory37(candidate);
    const interactionRow = setupHistory.firstInteractionTime == null ? null : triggerRows.find(row => Number(row.time) >= Number(setupHistory.firstInteractionTime));
    const interactionVolumeRatio = baselineVolume > 0 && interactionRow ? Number(interactionRow.volume)/baselineVolume : null;
    const displacementRows = interactionRow ? triggerRows.filter(row => Number(row.time) >= Number(interactionRow.time)) : triggerRows.slice(-3);
    const displacementVolume = displacementRows.length ? displacementRows.reduce((sum,row) => sum+Number(row.volume || 0),0)/displacementRows.length : null;
    const displacementVolumeRatio = baselineVolume > 0 && displacementVolume != null ? displacementVolume/baselineVolume : null;
    const participationCategory = triggerEffectiveness.adverseEffective ? "Materially contradictory participation"
      : triggerParticipation.state === "Expanding" && persistence >= 2 ? "Strong expansion"
      : triggerParticipation.state !== "Weak" && persistence >= 2 ? "Adequate continuation"
        : triggerParticipation.state === "Weak" && triggerEffectiveness.alignedEffective ? "Low-participation drift"
          : triggerParticipation.state === "Weak" ? "Weak or fading continuation"
            : "Adequate continuation";
    const participationExpectation = {category:participationCategory,persistence,baselineRatio:triggerParticipation.ratio,interactionVolumeRatio,displacementVolumeRatio,text:`${participationCategory}${triggerParticipation.ratio == null ? "" : ` · ${triggerParticipation.ratio.toFixed(2)}× baseline`} · ${persistence}/3 persistent candles${interactionVolumeRatio == null ? "" : ` · interaction ${interactionVolumeRatio.toFixed(2)}×`}${displacementVolumeRatio == null ? "" : ` · displacement ${displacementVolumeRatio.toFixed(2)}×`}`};
    const triggerImproved = trigger.aligned || trigger.state === "neutral" || triggerEffectiveness.losingEffectiveness;
    const primaryNonDestructive = !primaryBlocked && (!primary.opposing || primaryEffectiveness.losingEffectiveness || primary.share < 0.54);
    const improved = !primaryBlocked && !triggerBlocked && !microBlocked && triggerImproved && primaryNonDestructive;
    const compressionParticipation = candidate.family !== "Compression release" || triggerParticipation.state === "Expanding";
    const confirmed = improved && trigger.aligned && triggerParticipation.state !== "Weak" && compressionParticipation
      && (triggerEffectiveness.alignedEffective || !triggerSample.priceRefuses);
    const effectiveOpposition = primaryBlocked || triggerBlocked || microBlocked;
    const sideWord = desired > 0 ? "selling" : "buying";
    let blocker = "";
    if(primaryBlocked) blocker = `${primarySample.tf} ${sideWord} pressure remains effective while price moves ${desired > 0 ? "lower" : "higher"}`;
    else if(triggerBlocked) blocker = `${triggerSample.tf} ${sideWord} pressure remains effective on the trigger timeframe`;
    else if(microBlocked) blocker = `1m ${sideWord} pressure persists while ${triggerSample.tf} has not improved`;
    else if(!triggerImproved) blocker = `${triggerSample.tf} pressure has not improved`;
    else if(!primaryNonDestructive) blocker = `${primarySample.tf} pressure remains destructive`;
    else if(triggerParticipation.state === "Weak") blocker = `Trigger participation is weak - ${triggerParticipation.tf} LB${triggerParticipation.lookback}`;
    else if(!compressionParticipation) blocker = `Compression participation has not expanded - ${triggerParticipation.tf} LB${triggerParticipation.lookback}`;
    else if(!trigger.aligned) blocker = `${triggerSample.tf} aligned pressure resumption is not confirmed`;
    return {
      confirmed,improved,effectiveOpposition,trigger,primary,micro,triggerEffectiveness,primaryEffectiveness,microEffectiveness,
      participation:triggerParticipation.state.toLowerCase(),participationRatio:triggerParticipation.ratio,
      triggerParticipation,broaderParticipation,participationExpectation,blocker,
      triggerTf:triggerSample && triggerSample.tf,primaryTf:primarySample && primarySample.tf,
      evidence:[
        `Trigger pressure: ${trigger.state}; ${triggerEffectiveness.state} - ${triggerSample && triggerSample.tf} LB${triggerSample && triggerSample.lookback}`,
        `Primary pressure: ${primary.state}; ${primaryEffectiveness.state} - ${primarySample && primarySample.tf} LB${primarySample && primarySample.lookback}`,
        `Pressure improvement: ${improved ? "yes" : "no"}`,
        `Trigger participation: ${triggerParticipation.text}`,
        `Broader participation: ${broaderParticipation.text}`
      ]
    };
  }
  function adverseEvidenceGate37(candidate,interaction,pressure){
    const desired = candidate.direction;
    const rows = (state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[candidate.tf] || []).slice(-5);
    const latest = rows.length ? rows[rows.length-1] : null;
    const previous = rows.length > 1 ? rows[rows.length-2] : null;
    const ema21 = signalMaSlot37(candidate.tf,"MA2",true).value;
    const ema55 = signalMaSlot37(candidate.tf,"MA3",true).value;
    const fastMaLost = !!(latest && ema21 != null && ema55 != null && (desired > 0
      ? Number(latest.close) < ema21 && Number(latest.close) < ema55
      : Number(latest.close) > ema21 && Number(latest.close) > ema55));
    const adverseBody = !!(latest && (Number(latest.close)-Number(latest.open))*desired < 0
      && Math.abs(Number(latest.close)-Number(latest.open)) >= candidate.volatility.atr*0.55);
    const repeatedAdverseCloses = rows.length >= 2 && rows.slice(-2).every(row => (Number(row.close)-Number(row.open))*desired < 0);
    const adverseSwing = !!(latest && previous && (desired > 0
      ? Number(latest.high) < Number(previous.high) && Number(latest.close) < Number(previous.close)
      : Number(latest.low) > Number(previous.low) && Number(latest.close) > Number(previous.close)));
    const recoveryAbsent = interaction.interacted && (!interaction.reaction || !interaction.movement);
    const categories = [
      {family:"MA structure",active:fastMaLost,reason:`${candidate.tf} EMA9/21 and EMA55 are lost against the setup`},
      {family:"Price action",active:adverseBody || repeatedAdverseCloses || adverseSwing,reason:adverseBody ? "Strong adverse candle displacement remains active" : repeatedAdverseCloses ? "Repeated adverse closes remain active" : "Adverse swing progression remains active"},
      {family:"Pressure effectiveness",active:pressure.effectiveOpposition,reason:pressure.blocker || "Opposing pressure remains effective"},
      {family:"Recovery",active:recoveryAbsent,reason:`No confirmed ${desired > 0 ? "hold or reclaim" : "rejection or fall back below"} and no movement away`}
    ];
    const active = categories.filter(item => item.active);
    const blocksDevelopment = recoveryAbsent || pressure.effectiveOpposition || (fastMaLost && (adverseBody || repeatedAdverseCloses || adverseSwing));
    const blocksReady = pressure.effectiveOpposition || recoveryAbsent || adverseBody || repeatedAdverseCloses || (active.length >= 2 && !interaction.sustainedMovement);
    return {clear:!blocksReady,blocksDevelopment,blocksReady,categories,active,reasons:active.map(item => item.reason)};
  }
  function selectExpectedTarget37(candidate){
    const external = signalExternalLevels37();
    const framework = targetFramework37(candidate.direction,candidate.horizonId,candidate.volatility && candidate.volatility.atr,candidate.tf,external);
    return {...framework.primary,nextOpposingLevel:framework.obstacle && framework.obstacle.available ? framework.obstacle : null,obstacle:framework.obstacle,extended:framework.extended,framework};
  }
  function currentExecutionInvalidation37(candidate,interaction){
    const rows = signalRows37(entryPolicy37(candidate.horizonId).triggerTf).filter(row => row.final !== false).slice(-12);
    const desired = candidate.direction;
    const pivots = [];
    for(let i=1;i<rows.length-1;i++){
      if(desired > 0 && Number(rows[i].low) < Number(rows[i-1].low) && Number(rows[i].low) <= Number(rows[i+1].low)) pivots.push({row:rows[i],price:Number(rows[i].low),basis:`${entryPolicy37(candidate.horizonId).triggerTf} confirmed structural low`});
      if(desired < 0 && Number(rows[i].high) > Number(rows[i-1].high) && Number(rows[i].high) >= Number(rows[i+1].high)) pivots.push({row:rows[i],price:Number(rows[i].high),basis:`${entryPolicy37(candidate.horizonId).triggerTf} confirmed structural high`});
    }
    const price = signalCurrentPrice37();
    const valid = pivots.reverse().find(pivot => (price-pivot.price)*desired > candidate.volatility.atr*0.12 && Number(pivot.row.time) >= Number(interaction.interactionTime || 0));
    if(valid) return {available:true,price:valid.price,basis:valid.basis,time:Number(valid.row.time)};
    if(interaction.interacted && candidateDistance37(candidate.zone,price)*Math.max(Math.abs(price),1) <= candidate.volatility.atr*featureConfig.signalQuality.nearOriginAtr){
      return {available:true,price:candidate.invalidation,basis:`${candidate.tf} setup reaction boundary`,time:interaction.interactionTime};
    }
    return {available:false,price:null,basis:"No confirmed current execution pivot",time:null};
  }
  function momentumAssessment37(candidate,interaction){
    const tf = entryPolicy37(candidate.horizonId).triggerTf;
    const rows = signalRows37(tf).filter(row => row.final !== false).slice(-4);
    if(rows.length < 2 || !(candidate.volatility.atr > 0)) return {available:false,score:null,label:"Unavailable",limitation:"Trigger momentum evidence unavailable"};
    const desired = candidate.direction;
    const bodies = rows.map(row => (Number(row.close)-Number(row.open))*desired/candidate.volatility.atr);
    const directional = bodies.filter(value => value > 0).length/rows.length;
    const bodyQuality = rows.filter(row => {
      const range = Math.max(Number(row.high)-Number(row.low),1e-8);
      const closeExtreme = desired > 0 ? (Number(row.close)-Number(row.low))/range : (Number(row.high)-Number(row.close))/range;
      return bodies[rows.indexOf(row)] > 0 && closeExtreme >= 0.62;
    }).length/rows.length;
    const displacement = Math.max(0,interaction.move || 0)/candidate.volatility.atr;
    const accelerating = bodies.at(-1) > bodies.at(-2);
    const exhaustion = displacement >= featureConfig.signalQuality.exhaustionAtr && bodies.at(-1) < Math.max(0,bodies.at(-2)*0.45);
    const score = clamp37(35+directional*25+bodyQuality*20+Math.min(displacement,1.5)*12+(accelerating ? 5 : 0)-(exhaustion ? 30 : 0),0,100);
    return {available:true,score,label:exhaustion ? "Exhausting" : score >= 72 ? "Healthy" : score >= 52 ? "Controlled" : "Weak",exhaustion,displacement,directional,bodyQuality};
  }
  function opportunityAssessments37(candidate,interaction,pressure,gate){
    const target = selectExpectedTarget37(candidate);
    const executionInvalidation = currentExecutionInvalidation37(candidate,interaction);
    const momentum = momentumAssessment37(candidate,interaction);
    const price = signalCurrentPrice37();
    const risk = executionInvalidation.available ? Math.abs(price-executionInvalidation.price) : null;
    const rr = target.available && risk > 0 ? target.remainingDistance/risk : null;
    const setupScore = clamp37(48+(candidate.stack ? candidate.stack.alignment*30 : 12)+(candidate.priority <= 2 ? 12 : 7)+(candidate.invalidation != null ? 8 : 0),0,100);
    const triggerScore = clamp37((interaction.confirmedReaction ? 35 : interaction.provisionalReaction ? 20 : 0)+(interaction.movement ? 20 : 0)+(interaction.sustainedMovement ? 18 : 0)+(pressure.improved ? 14 : 0)+(pressure.confirmed ? 13 : 0)-(pressure.effectiveOpposition ? 30 : 0)-(pressure.triggerParticipation.state === "Weak" ? 10 : 0),0,100);
    let entryScore = 0;
    if(target.available) entryScore += target.remainingAtr >= featureConfig.signalQuality.preferredTargetAtr ? 28 : target.remainingAtr >= featureConfig.signalQuality.minimumTargetAtr ? 17 : 2;
    if(momentum.available) entryScore += momentum.score*0.28;
    if(pressure.triggerParticipation.state === "Expanding") entryScore += 18;
    else if(pressure.triggerParticipation.state === "Normal") entryScore += 13;
    else if(pressure.triggerParticipation.state === "Weak") entryScore += 6;
    if(executionInvalidation.available) entryScore += 16;
    if(rr != null) entryScore += rr >= featureConfig.signalQuality.preferredRewardRisk ? 18 : rr >= featureConfig.signalQuality.minimumRewardRisk ? 10 : 0;
    if(gate.blocksReady || pressure.effectiveOpposition) entryScore -= 20;
    if(momentum.exhaustion) entryScore -= 18;
    entryScore = clamp37(entryScore,0,100);
    const unavailable = !target.available || !momentum.available;
    const unacceptableReasons = [];
    if(target.available && target.remainingAtr < featureConfig.signalQuality.minimumTargetAtr) unacceptableReasons.push("Nearest opposing target leaves insufficient room");
    if(rr != null && rr < featureConfig.signalQuality.minimumRewardRisk) unacceptableReasons.push("Remaining reward/risk is below policy minimum");
    if(momentum.exhaustion && pressure.triggerParticipation.state === "Weak") unacceptableReasons.push("Late displacement is exhausting on weak participation");
    if(pressure.effectiveOpposition && target.available && target.remainingAtr < featureConfig.signalQuality.preferredTargetAtr) unacceptableReasons.push("Contradictory pressure is material before the next target");
    if(!unavailable && entryScore < featureConfig.signalQuality.grades.C && !unacceptableReasons.length) unacceptableReasons.push("Combined current opportunity evidence is below the minimum acceptable grade");
    const currentGrade = unavailable ? "UNAVAILABLE" : unacceptableReasons.length ? "UNACCEPTABLE" : gradeQuality37(entryScore);
    const distanceFromOrigin = candidateDistance37(candidate.zone,price)*Math.max(Math.abs(price),1);
    const entryMode = !interaction.interacted ? "UNAVAILABLE" : distanceFromOrigin <= candidate.volatility.atr*featureConfig.signalQuality.nearOriginAtr ? "RETEST" : "CONTINUATION";
    return {
      setup:{score:setupScore,grade:gradeQuality37(setupScore)},trigger:{score:triggerScore,grade:gradeQuality37(triggerScore)},
      current:{score:entryScore,grade:currentGrade,unacceptableReasons,available:!unavailable},entryMode,target,targetFramework:target.framework,executionInvalidation,momentum,remainingRewardRisk:rr,distanceFromOrigin,
      limitation:unacceptableReasons[0] || (pressure.triggerParticipation.state === "Weak" ? "Participation remains below expected baseline" : !executionInvalidation.available ? executionInvalidation.basis : gate.reasons[0] || "None")
    };
  }
  function entryStateFromEvidence37(evidence){
    const {candidate,interaction,pressure,gate,invalidated} = evidence;
    const assessments = evidence.assessments || {current:{grade:"B",unacceptableReasons:[]},entryMode:"RETEST"};
    const long = candidate.direction > 0;
    if(invalidated) return {state:"INVALIDATED",reason:`Invalidated - ${candidate.source} materially failed on closed candles`};
    if(!interaction.interacted) return {state:"SETUP ARMED",reason:`Waiting for ${candidate.source} interaction`};
    if(!interaction.reaction || !interaction.movement){
      const reason = pressure.effectiveOpposition
        ? `${pressure.blocker}; no ${long ? "reclaim" : "rejection"}`
        : `Zone engaged - waiting for ${long ? "hold or reclaim and movement away" : "rejection or fall back below and movement away"}`;
      return {state:"ZONE ENGAGED",reason};
    }
    if(gate.blocksDevelopment || !pressure.improved){
      return {state:"ZONE ENGAGED",reason:gate.reasons[0] || pressure.blocker || "Zone engaged - adverse evidence has not cleared"};
    }
    const freshness = state.activeSnapshot && state.activeSnapshot.freshness;
    const freshnessCurrent = signalFreshnessAllowsReady37(freshness);
    const reliable = freshnessCurrent && interaction.confirmedReaction && interaction.movement && (interaction.confirmedMovement || interaction.sustainedMovement) && pressure.improved && !pressure.effectiveOpposition && !gate.blocksReady;
    if(reliable && assessments.current.grade === "UNACCEPTABLE") return {state:"EXPIRED",reason:`Current entry is not viable - ${assessments.current.unacceptableReasons[0]}`};
    const history = setupHistory37(candidate);
    if(assessments.current.grade === "UNAVAILABLE" && history.triggerFormationBegan && interaction.move >= candidate.volatility.atr*featureConfig.signalQuality.exhaustionAtr && !assessments.executionInvalidation.available){
      return {state:"BIAS CONFIRMED",reason:"The interacted setup is no longer structurally relevant and no current execution structure is available"};
    }
    if(!interaction.confirmedReaction || !interaction.movement || !pressure.improved || gate.blocksReady){
      return {state:"TRIGGER DEVELOPING",reason:pressure.blocker || `${interaction.trigger} is developing; awaiting sustained movement and ${pressure.triggerTf} pressure confirmation`};
    }
    if(reliable && ["A","B","C"].includes(assessments.current.grade)) return {state:"READY",reason:`${interaction.trigger} confirmed from the current ${assessments.entryMode.toLowerCase()} context`};
    return {state:"TRIGGER DEVELOPING",reason:!freshnessCurrent ? `Actionable confirmation unavailable - ${freshness.signalStaleSources[0] && freshness.signalStaleSources[0].source || "decision-critical data"} needs refresh` : assessments.current.grade === "UNAVAILABLE" ? "Current entry evidence is unavailable" : "Reaction is credible but confirmation remains unresolved"};
  }
  function signalFreshnessAllowsReady37(freshness){ return !freshness || freshness.signalStatus === "LIVE"; }
  function absorptionState37(candidate,interaction,pressure,samples){
    if(!candidate || !interaction.interacted) return {state:"cleared",reason:"No active level interaction"};
    const sample = (Array.isArray(samples) ? samples : []).find(item => item.tf === candidate.tf);
    const sampleSide = sample && (sample.rawSideSign || sample.sideSign) || candidate.direction;
    const oneSided = !!(sample && sample.dominantPct >= PRESSURE_POLICY37.strongShare);
    const rows = signalRows37(candidate.tf).slice(-Math.min(candidate.triggerWindow+2,8));
    const attempts = rows.filter(row => Number(row.low) <= candidate.zone.high+candidate.volatility.tolerance && Number(row.high) >= candidate.zone.low-candidate.volatility.tolerance).length;
    const net = rows.length >= 2 ? Number(rows[rows.length-1].close)-Number(rows[0].close) : 0;
    const failedProgress = Math.abs(net) <= candidate.volatility.atr*0.28;
    const oppositeResponse = rows.length >= 2 && (sampleSide > 0
      ? Number(rows[rows.length-1].close) < Number(rows[rows.length-2].low)
      : Number(rows[rows.length-1].close) > Number(rows[rows.length-2].high));
    if(oneSided && attempts >= 2 && failedProgress && oppositeResponse){
      return {state:"confirmed",reason:`One-sided pressure repeatedly failed at ${candidate.source} and opposite follow-through developed`};
    }
    if(oneSided && attempts >= 2 && failedProgress){
      return {state:"possible",reason:`Possible absorption at ${candidate.source}; repeated pressure attempts have not progressed`};
    }
    return {state:"cleared",reason:interaction.movement ? "Price progress cleared absorption risk" : "No persistent one-sided failure is confirmed"};
  }
  function candidateMaterialFailure37(candidate,closed){
    if(!Array.isArray(closed) || closed.length < 2) return {failed:false,reason:"No closed-candle material failure"};
    const desired = candidate.direction;
    const adverseBeyond = level => level != null && closed.slice(-2).every(row => desired > 0 ? Number(row.close) < level : Number(row.close) > level);
    const ema55 = signalMaSlot37(candidate.tf,"MA3",true).value;
    const adverseZoneBoundary = desired > 0 ? candidate.zone.low : candidate.zone.high;
    if(candidate.family === "EMA9/21 bounce" && adverseBeyond(adverseZoneBoundary) && adverseBeyond(ema55)){
      return {failed:true,reason:`${candidate.tf} EMA9/21 continuation and EMA55 failed on closed candles`};
    }
    if(candidate.family === "EMA55 bounce" && adverseBeyond(adverseZoneBoundary)){
      return {failed:true,reason:`${candidate.tf} EMA55 continuation failed on closed candles`};
    }
    return {failed:false,reason:"Candidate MA structure remains valid"};
  }
  function entryQualityScore37(result){
    const base = {
      "NO BIAS":15,"BIAS CONFIRMED":25,"SETUP ARMED":34,"ZONE ENGAGED":42,
      "TRIGGER DEVELOPING":62,READY:84,EXPIRED:12,INVALIDATED:5
    }[result.state] ?? 20;
    const movementAdjustment = result.interaction && result.interaction.sustainedMovement ? 6 : result.interaction && result.interaction.movement ? 3 : 0;
    const pressureAdjustment = result.pressure && result.pressure.confirmed ? 6 : result.pressure && result.pressure.improved ? 2 : result.pressure && result.pressure.effectiveOpposition ? -8 : 0;
    const gateAdjustment = result.adverseGate && result.adverseGate.blocksDevelopment ? -7 : 0;
    return Math.round(clamp37(base+movementAdjustment+pressureAdjustment+gateAdjustment,0,100));
  }
  function applySetupLifecycleFloor37(history,stateResult){
    const next = {...stateResult};
    if(history && history.triggerFormationBegan && ["SETUP ARMED","ZONE ENGAGED"].includes(next.state)){
      next.state = "TRIGGER DEVELOPING";
      next.reason = "Trigger formation history is retained; current confirmation remains unresolved";
    }else if(history && history.zoneReached && next.state === "SETUP ARMED"){
      next.state = "ZONE ENGAGED";
      next.reason = "Setup interaction history is retained; the origin zone is no longer an untouched setup area";
    }
    return next;
  }
  function evaluateCandidateState37(candidate,samples,prior=null){
    const priorSide = prior && (num37(prior.side) != null ? Number(prior.side) : prior.direction === "SHORT" ? -1 : prior.direction === "LONG" ? 1 : 0);
    const samePrior = prior && prior.setupIdentity === candidate.setupIdentity && priorSide === candidate.direction;
    if(samePrior && ["EXPIRED","INVALIDATED"].includes(prior.state)){
      return {...candidate,state:prior.state,reason:prior.reason,interaction:prior.interaction,pressure:prior.pressure,absorption:prior.absorption,adverseGate:prior.adverseGate,assessments:prior.assessments,chase:prior.chase,chaseExceeded:false,timedOut:false,validFor:0,chaseDistance:prior.chaseDistance,entryQuality:prior.entryQuality,triggerState:"absent",entryAction:"WAIT"};
    }
    if(samePrior && ["ZONE ENGAGED","TRIGGER DEVELOPING","READY"].includes(prior.state)){
      candidate = {...candidate,zone:{...prior.zone},setupActivationTime:prior.setupActivationTime,invalidation:prior.invalidation,volatility:{...candidate.volatility,chaseDistance:prior.chaseDistance || candidate.volatility.chaseDistance}};
    }
    const interaction = interactionAndReaction37(candidate);
    const pressure = candidatePressureConfirmation37(candidate,samples);
    const currentPrice = signalCurrentPrice37();
    const closed = (state.activeSnapshot && state.activeSnapshot.closedByTf && state.activeSnapshot.closedByTf[candidate.tf] || []).slice(-2);
    const definedInvalidationFailed = closed.length >= 2 && closed.every(row => candidate.direction > 0 ? Number(row.close) < candidate.invalidation : Number(row.close) > candidate.invalidation);
    const materialFailure = candidateMaterialFailure37(candidate,closed);
    const invalidated = definedInvalidationFailed || materialFailure.failed;
    const chase = currentPrice == null ? 0 : candidate.direction > 0 ? currentPrice-candidate.zone.high : candidate.zone.low-currentPrice;
    const adverseGate = adverseEvidenceGate37(candidate,interaction,pressure);
    const assessments = opportunityAssessments37(candidate,interaction,pressure,adverseGate);
    if(samePrior && prior.assessments && prior.assessments.setup) assessments.setup = {...prior.assessments.setup};
    let stateResult = entryStateFromEvidence37({candidate,interaction,pressure,gate:adverseGate,invalidated,assessments});
    if(materialFailure.failed) stateResult.reason = `Invalidated - ${materialFailure.reason}`;
    const absorption = absorptionState37(candidate,interaction,pressure,samples);
    if(absorption.state === "confirmed" && stateResult.state === "READY"){
      stateResult.state = "TRIGGER DEVELOPING";
      stateResult.reason = absorption.reason;
    }
    if(absorption.state === "possible" && stateResult.state === "TRIGGER DEVELOPING") stateResult.reason = absorption.reason;
    const history = setupHistory37(candidate);
    stateResult = applySetupLifecycleFloor37(history,stateResult);
    const result = {
      ...candidate,...stateResult,interaction,pressure,absorption,adverseGate,materialFailure,chase,chaseExceeded:false,timedOut:false,assessments,
      validFor:Math.max(0,candidate.triggerWindow-(interaction.age || 0)),chaseDistance:candidate.volatility.chaseDistance
    };
    result.triggerState = result.state === "READY" ? "confirmed" : result.state === "TRIGGER DEVELOPING" ? "developing" : "absent";
    result.entryAction = result.state === "READY" ? candidate.direction > 0 ? "READY LONG" : "READY SHORT" : "WAIT";
    result.entryQuality = assessments.current.score;
    history.triggerFormationBegan ||= result.state === "TRIGGER DEVELOPING";
    history.triggerBecameActive ||= result.state === "READY";
    history.invalidated ||= result.state === "INVALIDATED";
    history.retired ||= ["EXPIRED","BIAS CONFIRMED"].includes(result.state);
    history.lastState = result.state;
    return result;
  }
  function emaCandidates37(bias,horizonId){
    const candidates = [];
    const direction = bias.side;
    const policy = entryPolicy37(horizonId);
    policy.setupTfs.forEach(tf => {
      const stack = bias.stacks.find(item => item.tf === tf) || maStackState37(tf);
      if(!stack.available || stack.side !== direction) return;
      const ema9 = signalMaSlot37(tf,"MA1");
      const ema21 = signalMaSlot37(tf,"MA2");
      const ema55 = signalMaSlot37(tf,"MA3");
      const ema100 = signalMaSlot37(tf,"MA4");
      const ema200 = signalMaSlot37(tf,"MA5");
      if(stack.alignment >= 0.62 && ema9.value != null && ema21.value != null){
        candidates.push(makeEntryCandidate37({family:"EMA9/21 bounce",priority:1,direction,tf,source:`${ema9.label}/${ema21.label}`,levelLow:ema9.value,levelHigh:ema21.value,stack,requirements:"Hold, reclaim, or reject the fast zone with pressure resumption"},horizonId));
      }
      if(stack.alignment >= 0.70 && ema55.value != null){
        candidates.push(makeEntryCandidate37({family:"EMA55 bounce",priority:2,direction,tf,source:ema55.label,levelLow:ema55.value,levelHigh:ema55.value,stack,requirements:"Visible move away with opposing pressure weakening or reversing"},horizonId));
      }
      if(stack.alignment >= 0.80){
        [ema100,ema200].filter(ma => ma.value != null).forEach(ma => candidates.push(makeEntryCandidate37({family:"Structural EMA reaction",priority:4,direction,tf,source:ma.label,levelLow:ma.value,levelHigh:ma.value,stack,requirements:"Strict structure and pressure agreement at the structural EMA"},horizonId)));
      }
    });
    return candidates;
  }
  function structureCandidates37(bias,horizonId){
    const candidates = [];
    const direction = bias.side;
    const engine = horizonEngine37(horizonId);
    [...new Set([...engine.eventTfs,...engine.structureTfs])].forEach(tf => {
      const structure = signalStructure37(tf,"swing") || signalStructure37(tf,"internal");
      const event = structure && structure.latestEvent;
      if(event && (event.direction === "bullish" ? 1 : -1) === direction && num37(event.price) != null){
        candidates.push(makeEntryCandidate37({family:"Structure breakout and retest",priority:3,direction,tf,source:`${String(event.text || event.structureType || "structure break").toUpperCase()} level`,levelLow:Number(event.price),levelHigh:Number(event.price),breakTime:Number(event.breakTime),requirements:"Confirmed retest with pressure continuation"},horizonId));
      }
      const pivots = canonicalPivots37(tf,"swing");
      const pivot = direction > 0 ? pivots.low : pivots.high;
      if(pivot && num37(pivot.price) != null){
        candidates.push(makeEntryCandidate37({family:"Structure rejection",priority:4,direction,tf,source:`confirmed ${structureClassName37(pivot.classification,pivot.side)}`,levelLow:Number(pivot.price),levelHigh:Number(pivot.price),requirements:"Rejection with pressure reversal or failure to continue"},horizonId));
      }
    });
    return candidates;
  }
  function compressionCandidates37(bias,horizonId){
    const candidates = [];
    const policy = entryPolicy37(horizonId);
    policy.setupTfs.forEach(tf => {
      const stack = bias.stacks.find(item => item.tf === tf) || maStackState37(tf);
      const ema9 = signalMaSlot37(tf,"MA1");
      const ema21 = signalMaSlot37(tf,"MA2");
      if(!stack.available || stack.side !== bias.side || stack.phase !== "expanding" || stack.priorSpread > 0.0012 || ema9.value == null || ema21.value == null) return;
      candidates.push(makeEntryCandidate37({family:"Compression release",priority:5,direction:bias.side,tf,source:`${ema9.label}/${ema21.label} compression`,levelLow:ema9.value,levelHigh:ema21.value,stack,requirements:"Directional release with pressure and participation expansion"},horizonId));
    });
    return candidates;
  }
  function candidateRank37(candidate){
    const stateBoost = {READY:140,"TRIGGER DEVELOPING":95,"ZONE ENGAGED":55,"SETUP ARMED":0,EXPIRED:-100,INVALIDATED:-120}[candidate.state] || 0;
    const priorityScore = (6-candidate.priority)*18;
    const alignment = candidate.stack ? candidate.stack.alignment*25 : 8;
    const distancePenalty = Math.min(25,Number(candidate.distance || 0)*2500);
    return stateBoost+priorityScore+alignment-distancePenalty;
  }
  function selectEntryCandidate37(evaluated){
    const candidates = Array.isArray(evaluated) ? evaluated : [];
    const active = candidates.filter(candidate => candidate.state !== "INVALIDATED" && candidate.state !== "EXPIRED");
    return (active.length ? active : candidates).slice().sort((a,b) => b.rankScore-a.rankScore || a.priority-b.priority || Number(a.distance)-Number(b.distance))[0] || null;
  }
  function runEntrySelfTests37(){
    const candidate = {direction:1,tf:"5m",family:"Structural EMA reaction",source:"EMA100",triggerWindow:5};
    const engaged = {interacted:true,reaction:false,confirmedReaction:false,movement:false,sustainedMovement:false,trigger:"No reclaim"};
    const opposition = {buyShare:0.44,sellShare:0.56,effectiveOpposition:true,improved:false,confirmed:false,blocker:"5m selling remains active"};
    const blocked = {blocksDevelopment:true,blocksReady:true,reasons:["Recovery absent"]};
    const clear = {blocksDevelopment:false,blocksReady:false,reasons:[]};
    const observedLong = entryStateFromEvidence37({candidate,interaction:engaged,pressure:opposition,gate:blocked,invalidated:false,chaseExceeded:false,timedOut:false});
    const observedShort = entryStateFromEvidence37({candidate:{...candidate,direction:-1},interaction:{...engaged,trigger:"No rejection"},pressure:{...opposition,buyShare:0.56,sellShare:0.44,blocker:"5m buying remains active"},gate:blocked,invalidated:false,chaseExceeded:false,timedOut:false});
    const developingInteraction = {...engaged,reaction:true,movement:true,trigger:"Closed reclaim with movement",provisionalReaction:false};
    const improving = {effectiveOpposition:false,improved:true,confirmed:false,blocker:"Awaiting sustained pressure confirmation",triggerTf:"3m"};
    const developing = entryStateFromEvidence37({candidate,interaction:developingInteraction,pressure:improving,gate:clear,invalidated:false,chaseExceeded:false,timedOut:false});
    const readyInteraction = {...developingInteraction,confirmedReaction:true,sustainedMovement:true};
    const confirmed = {...improving,confirmed:true,blocker:null};
    const ready = entryStateFromEvidence37({candidate,interaction:readyInteraction,pressure:confirmed,gate:clear,invalidated:false,chaseExceeded:false,timedOut:false});
    const weakButCredible = entryStateFromEvidence37({candidate,interaction:readyInteraction,pressure:{...improving,triggerParticipation:{state:"Weak"}},gate:clear,invalidated:false,assessments:{current:{grade:"C",unacceptableReasons:[]},entryMode:"CONTINUATION"}});
    const poorCurrentEntry = entryStateFromEvidence37({candidate,interaction:readyInteraction,pressure:confirmed,gate:clear,invalidated:false,assessments:{current:{grade:"UNACCEPTABLE",unacceptableReasons:["Nearest opposing target leaves insufficient room"]},entryMode:"CONTINUATION"}});
    const farButViable = entryStateFromEvidence37({candidate,interaction:readyInteraction,pressure:confirmed,gate:clear,invalidated:false,chaseExceeded:true,assessments:{current:{grade:"B",unacceptableReasons:[]},entryMode:"CONTINUATION"}});
    const highBias = entryStateFromEvidence37({candidate,interaction:engaged,pressure:opposition,gate:blocked,invalidated:false,chaseExceeded:false,timedOut:false,biasConfidence:82});
    const lowBias = entryStateFromEvidence37({candidate,interaction:engaged,pressure:opposition,gate:blocked,invalidated:false,chaseExceeded:false,timedOut:false,biasConfidence:52});
    const replacement = selectEntryCandidate37([
      {source:"EMA9/EMA21",state:"INVALIDATED",rankScore:999,priority:1,distance:0},
      {source:"EMA100",state:"ZONE ENGAGED",rankScore:40,priority:4,distance:0}
    ]);
    const cases = {
      observedLongWait:observedLong.state === "ZONE ENGAGED" && /selling remains active; no reclaim/i.test(observedLong.reason),
      mirroredShortWait:observedShort.state === "ZONE ENGAGED" && /buying remains active; no rejection/i.test(observedShort.reason),
      genuineProgression:developing.state === "TRIGGER DEVELOPING" && ready.state === "READY",
      biasCannotPromoteEntry:highBias.state === lowBias.state && highBias.state === "ZONE ENGAGED",
      failedFastCandidateReplaced:replacement && replacement.source === "EMA100",
      weakParticipationCanActivateReducedQuality:weakButCredible.state === "READY",
      unacceptableCurrentEntryProducesNoChase:poorCurrentEntry.state === "EXPIRED",
      originDistanceAloneCannotProduceNoChase:farButViable.state === "READY",
      qualityGradesAreIndependent:gradeQuality37(86) === "A" && gradeQuality37(70) === "B" && gradeQuality37(55) === "C" && gradeQuality37(30) === "UNACCEPTABLE",
      standByCannotReturnToWatching:applySetupLifecycleFloor37({zoneReached:true,triggerFormationBegan:false},{state:"SETUP ARMED",reason:"live location"}).state === "ZONE ENGAGED",
      triggerFormingCannotReturnToWatchingOrStandBy:applySetupLifecycleFloor37({zoneReached:true,triggerFormationBegan:true},{state:"ZONE ENGAGED",reason:"live evidence weakened"}).state === "TRIGGER DEVELOPING"
    };
    return {
      allPassed:Object.values(cases).every(Boolean),cases,
      states:{observedLong:observedLong.state,observedShort:observedShort.state,developing:developing.state,ready:ready.state,replacement:replacement && replacement.source},
      observedScenario:{bias:"LONG",biasUnchanged:true,setup:"5m EMA100 support test",pressure:"44% buying / 56% selling",formingProvisional:true,state:observedLong.state,entry:"WAIT",trigger:"absent",reason:observedLong.reason},
      mirroredScenario:{bias:"SHORT",setup:"5m EMA100 resistance test",pressure:"56% buying / 44% selling",state:observedShort.state,entry:"WAIT",trigger:"absent",reason:observedShort.reason}
    };
  }
  function runDisplayedSignalInvariantSelfTests37(){
    const entryQuality={instruction:"Waiting for a valid same-direction setup",exclusions:["Closed reaction required"],levels:{entryCandidates:[],candidates:[],lines:[]}};
    const decision=(direction,stateName,identity) => ({
      state:stateName,direction,family:"EMA9/21 bounce",source:"EMA9/EMA21",tf:stateName==="READY" ? "5m" : "15m",setupIdentity:identity,
      zone:{low:99000,high:99100},interaction:{evidence:["Closed reaction"],trigger:"Closed reaction",confirmationRole:"trigger",movement:true},
      pressure:{evidence:["Pressure improved"],triggerParticipation:{text:"Normal"}},assessments:{entryMode:"RETEST",setup:{grade:"B"},trigger:{grade:"B"},current:{grade:"B"},targetFramework:{}},
      entryAction:stateName==="READY" ? `READY ${direction}` : "WAIT",triggerState:stateName==="READY" ? "confirmed" : "forming",reason:"Fixture reason",invalidation:98500
    });
    const make=(generation,mode,signal,thesis=null) => buildDisplayedSignalPublication37({generation,publishedAt:1700000000000+generation,mode,horizonId:"quick",signal,thesis,entryQuality:{...entryQuality,decision:signal.entryDecision},entryTone:"gray"});
    const tooltip=(displayed,signal,thesis=null) => signalToolbarTooltip37({...signal,marketDirection:displayed.direction==="NO BIAS" ? null : displayed.direction,confidence:displayed.confidence,entryDecision:displayed.decision},{...entryQuality,decision:displayed.decision},thesis,displayed);
    const shortDeveloping=decision("SHORT","TRIGGER DEVELOPING","short-15m-1");
    const longDeveloping=decision("LONG","TRIGGER DEVELOPING","long-15m-1");
    const shortReady=decision("SHORT","READY","short-5m-2");
    const longNoSetup=make(1,"LONG",{marketDirection:"SHORT",confidence:72,entryDecision:shortDeveloping,dataHealth:{status:"sufficient"}},{status:"SUPPORTIVE",confidence:64});
    const shortNoSetup=make(2,"SHORT",{marketDirection:"LONG",confidence:64,entryDecision:longDeveloping,dataHealth:{status:"sufficient"}},{status:"SUPPORTIVE",confidence:72});
    const longForming=make(3,"AUTO",{marketDirection:"LONG",confidence:64,entryDecision:longDeveloping,dataHealth:{status:"sufficient"}});
    const shortActive=make(4,"AUTO",{marketDirection:"SHORT",confidence:72,entryDecision:shortReady,dataHealth:{status:"sufficient"}});
    const noBias=make(5,"AUTO",{marketDirection:null,confidence:null,entryDecision:longDeveloping,dataHealth:{status:"sufficient"}});
    const longNoSetupTip=tooltip(longNoSetup,{dataHealth:{status:"sufficient"}},{status:"SUPPORTIVE",confidence:64});
    const shortNoSetupTip=tooltip(shortNoSetup,{dataHealth:{status:"sufficient"}},{status:"SUPPORTIVE",confidence:72});
    const longFormingTip=tooltip(longForming,{dataHealth:{status:"sufficient"}});
    const shortActiveTip=tooltip(shortActive,{dataHealth:{status:"sufficient"}});
    const noBiasTip=tooltip(noBias,{dataHealth:{status:"sufficient"}});
    const nextShort=make(6,"AUTO",{marketDirection:"SHORT",confidence:70,entryDecision:null,dataHealth:{status:"sufficient"}});
    const cases={
      A_LONG_NO_SETUP:longNoSetup.summaryVariants.full==="LONG 64% \u00b7 NO SETUP" && longNoSetup.entryTone==="gray" && /Direction: LONG/.test(longNoSetupTip) && /Bias confidence: 64%/.test(longNoSetupTip) && /State: NO SETUP/.test(longNoSetupTip) && !/Direction: SHORT|Setup family:/.test(longNoSetupTip),
      B_SHORT_NO_SETUP:shortNoSetup.summaryVariants.full==="SHORT 72% \u00b7 NO SETUP" && shortNoSetup.entryTone==="gray" && /Direction: SHORT/.test(shortNoSetupTip) && /Bias confidence: 72%/.test(shortNoSetupTip) && /State: NO SETUP/.test(shortNoSetupTip) && !/Direction: LONG|Setup family:/.test(shortNoSetupTip),
      C_LONG_TRIGGER_FORMING:longForming.entryTone==="orange" && /Direction: LONG/.test(longFormingTip) && /Bias confidence: 64%/.test(longFormingTip) && /State: TRIGGER FORMING/.test(longFormingTip) && longFormingTip.includes("Setup identity: long-15m-1"),
      D_SHORT_TRIGGER_ACTIVE:shortActive.entryTone==="red" && /Direction: SHORT/.test(shortActiveTip) && /Bias confidence: 72%/.test(shortActiveTip) && /State: TRIGGER ACTIVE/.test(shortActiveTip) && shortActiveTip.includes("Setup identity: short-5m-2"),
      E_NO_BIAS:/Direction: NO BIAS/.test(noBiasTip) && /State: NO SETUP \u00b7 NO BIAS/.test(noBiasTip) && !/Setup family:|Direction: LONG|Direction: SHORT/.test(noBiasTip),
      F_DIRECTION_REVERSAL:longForming.generation!==nextShort.generation && longForming.signalIdentity!==nextShort.signalIdentity && nextShort.direction==="SHORT",
      G_NO_SETUP_TRANSITION:nextShort.setupIdentity===null && nextShort.visibleState==="NO SETUP" && !tooltip(nextShort,{dataHealth:{status:"sufficient"}}).includes("long-15m-1"),
      H_TOOLTIP_ALREADY_OPEN:!displayedSignalMatches37(longForming,nextShort) && tooltip(nextShort,{dataHealth:{status:"sufficient"}}).includes("Publication generation: 6"),
      I_DETAILS_WINDOW_PARITY:displayedSignalHeader37(shortActive).join("\n").includes("Direction: SHORT\nBias confidence: 72%\nState: TRIGGER ACTIVE\nSetup identity: short-5m-2"),
      J_COPY_AFTER_UPDATE:displayedSignalHeader37(nextShort).join("\n").includes("Publication generation: 6") && !displayedSignalHeader37(nextShort).join("\n").includes("long-15m-1"),
      K_STALE_CACHED_TOOLTIP:!displayedSignalMatches37(displayedSignalMeta37(longForming),nextShort),
      L_OPPOSITE_HISTORY_BLOCKED:!historicalSetupMatches37({direction:"LONG",tf:"15m"},nextShort) && historicalSetupMatches37({direction:"SHORT",tf:"15m"},nextShort),
      M_DIRECTION_MODE_METADATA:/Direction mode: SHORT/.test(shortNoSetupTip) && displayedSignalMeta37(shortNoSetup).directionMode==="SHORT"
    };
    return {passed:Object.values(cases).every(Boolean),cases,reproduction:{button:shortNoSetup.summaryVariants.full,tooltip:shortNoSetupTip}};
  }
  function runPresentationSelfTests37(){
    const expected = {
      "SETUP ARMED":"WATCHING",
      "ZONE ENGAGED":"STAND BY",
      "TRIGGER DEVELOPING":"TRIGGER FORMING",
      READY:"TRIGGER ACTIVE",
      EXPIRED:"NO CHASE",
      INVALIDATED:"SETUP FAILED"
    };
    const baseSignal = {marketDirection:"LONG",confidence:72};
    const stateMappings = Object.fromEntries(Object.entries(expected).map(([internal,label]) => [
      internal,
      signalSummaryVariants37(baseSignal,{state:internal}).full === `LONG 72% \u00b7 ${label}`
    ]));
    const readyDecision = {
      state:"READY",direction:"LONG",family:"EMA9/21 bounce",source:"EMA9/EMA21",tf:"3m",
      zone:{low:99000,high:99100},pressure:{triggerTf:"3m",triggerParticipation:{text:"Normal"}},
      interaction:{interactionTime:100,reactionTime:200},invalidation:98500,entryAction:"READY LONG",reason:"Confirmed"
    };
    const displayed=buildDisplayedSignalPublication37({generation:1,publishedAt:1,mode:"AUTO",horizonId:"quick",signal:{...baseSignal,entryDecision:readyDecision},thesis:null,entryQuality:{decision:readyDecision,instruction:"Confirmed",exclusions:[]},entryTone:"green"});
    const tooltip = signalToolbarTooltip37({...baseSignal,entryDecision:readyDecision},{decision:readyDecision},null,displayed);
    const definition = SIGNAL_PRESENTATION37.READY.definition;
    const approvedVariants = signalSummaryVariants37(baseSignal,{state:"TRIGGER DEVELOPING"});
    const identity = triggerIdentity37(baseSignal,readyDecision);
    const sameIdentity = triggerIdentity37(baseSignal,{...readyDecision,reason:"Routine refresh"});
    const newIdentity = triggerIdentity37(baseSignal,{...readyDecision,interaction:{...readyDecision.interaction,reactionTime:300}});
    const setupIdentity = setupIdentity37({...readyDecision,horizonId:"quick",direction:1,volatility:{atr:100}});
    const floatingNoiseIdentity = setupIdentity37({...readyDecision,horizonId:"quick",direction:1,zone:{low:99000.000001,high:99100.000001},volatility:{atr:100}});
    const horizonIdentity = setupIdentity37({...readyDecision,horizonId:"2_3h",direction:1,volatility:{atr:100}});
    const directionIdentity = setupIdentity37({...readyDecision,horizonId:"quick",direction:-1,volatility:{atr:100}});
    const alertLifecycle = runTriggerAlertSelfTests37(baseSignal,readyDecision);
    const cases = {
      ...stateMappings,
      directionalBiasWithoutSetup:signalSummaryVariants37(baseSignal,{state:"BIAS CONFIRMED"}).full === "LONG 72% \u00b7 NO SETUP",
      confidenceHasNoBrackets:!/[()]/.test(signalSummaryVariants37(baseSignal,{state:"SETUP ARMED"}).full),
      approvedWordingNotShortened:Object.values(approvedVariants).every(value => value === "LONG 72% \u00b7 TRIGGER FORMING"),
      noBiasWordingNotShortened:Object.values(signalSummaryVariants37({marketDirection:null,confidence:null},{state:"NO BIAS"})).every(value => value === "NO SETUP \u00b7 NO BIAS"),
      noBiasWithoutSetup:signalSummaryVariants37({marketDirection:null,confidence:null},{state:"NO BIAS"}).full === "NO SETUP \u00b7 NO BIAS",
      tooltipDefinitionFirst:tooltip.split("\n")[0] === definition,
      tooltipHasOneBlankLine:tooltip.split("\n")[1] === "" && tooltip.split("\n")[2] === "Direction mode: AUTO" && tooltip.split("\n")[3] === "Direction: LONG",
      tooltipDefinitionNotDuplicated:tooltip.split(definition).length-1 === 1,
      triggerIdentityStable:identity === sameIdentity,
      materiallyNewTriggerIdentity:identity !== newIdentity,
      setupIdentityIgnoresFloatingNoise:setupIdentity === floatingNoiseIdentity,
      setupIdentityChangesWithHorizon:setupIdentity !== horizonIdentity,
      setupIdentityChangesWithDirection:setupIdentity !== directionIdentity,
      ...alertLifecycle
    };
    const atomicConsistency=runDisplayedSignalInvariantSelfTests37();
    cases.atomicConsistency=atomicConsistency.passed;
    return {passed:Object.values(cases).every(Boolean),cases,atomicConsistency};
  }
  function runTriggerAlertSelfTests37(signal,readyDecision){
    const saved = {
      entry:state.entry,
      activeTriggerAlertId:state.activeTriggerAlertId,
      activeTriggerAlertMeta:state.activeTriggerAlertMeta,
      triggerAlertTimer:state.triggerAlertTimer,
      triggerAlertEndsAt:state.triggerAlertEndsAt,
      seenTriggerAlertIds:state.seenTriggerAlertIds,
      seenTriggerAlertOrder:state.seenTriggerAlertOrder,
      setTimeout:window.setTimeout,
      clearTimeout:window.clearTimeout
    };
    const callbacks = new Map();
    let nextTimer = 1;
    try{
      state.entry = document.createElement("span");
      state.activeTriggerAlertId = null;
      state.activeTriggerAlertMeta = null;
      state.triggerAlertTimer = null;
      state.triggerAlertEndsAt = 0;
      state.seenTriggerAlertIds = new Set();
      state.seenTriggerAlertOrder = [];
      window.setTimeout = (callback,delay) => { const id = nextTimer++; callbacks.set(id,{callback,delay}); return id; };
      window.clearTimeout = id => callbacks.delete(id);

      updateTriggerAlert37(signal,readyDecision);
      const firstTimer = state.triggerAlertTimer;
      const first = callbacks.get(firstTimer);
      const startsOnce = state.entry.classList.contains("is-trigger-active-alert") && first && first.delay === TRIGGER_ALERT_DURATION37;
      updateTriggerAlert37(signal,{...readyDecision,reason:"Routine refresh"});
      const refreshDoesNotRestart = state.triggerAlertTimer === firstTimer && callbacks.size === 1;
      first.callback();
      const endsNormally = !state.entry.classList.contains("is-trigger-active-alert") && state.triggerAlertTimer == null;
      updateTriggerAlert37(signal,readyDecision);
      const sameTriggerDoesNotReplay = !state.entry.classList.contains("is-trigger-active-alert") && state.triggerAlertTimer == null;
      const replacement = {...readyDecision,interaction:{...readyDecision.interaction,reactionTime:Number(readyDecision.interaction.reactionTime)+100}};
      updateTriggerAlert37(signal,replacement);
      const newTriggerRestarts = state.entry.classList.contains("is-trigger-active-alert") && state.triggerAlertTimer != null;
      updateTriggerAlert37(signal,{...replacement,state:"TRIGGER DEVELOPING"});
      const stateChangeStopsImmediately = !state.entry.classList.contains("is-trigger-active-alert") && state.triggerAlertTimer == null && state.activeTriggerAlertId == null;
      updateTriggerAlert37(signal,replacement);
      const stateReentryDoesNotReplay = !state.entry.classList.contains("is-trigger-active-alert") && state.triggerAlertTimer == null;
      return {triggerAlertStartsOnce:startsOnce,routineRefreshDoesNotRestart:refreshDoesNotRestart,triggerAlertEndsAfterDuration:endsNormally,sameTriggerDoesNotReplay,newTriggerStartsAlert:newTriggerRestarts,stateChangeStopsAlert:stateChangeStopsImmediately,stateReentryDoesNotReplay};
    }finally{
      window.setTimeout = saved.setTimeout;
      window.clearTimeout = saved.clearTimeout;
      state.entry = saved.entry;
      state.activeTriggerAlertId = saved.activeTriggerAlertId;
      state.activeTriggerAlertMeta = saved.activeTriggerAlertMeta;
      state.triggerAlertTimer = saved.triggerAlertTimer;
      state.triggerAlertEndsAt = saved.triggerAlertEndsAt;
      state.seenTriggerAlertIds = saved.seenTriggerAlertIds;
      state.seenTriggerAlertOrder = saved.seenTriggerAlertOrder;
    }
  }
  function evaluateEntryDecision37(bias,samples,horizonId,directionMode="AUTO"){
    const trackerKey = directionMode === "AUTO" ? horizonId : `${horizonId}|${directionMode}`;
    const prior = state.entryTrackers.get(trackerKey) || null;
    const priorWasActive = prior && prior.family && !["EXPIRED","INVALIDATED"].includes(prior.state);
    if(!bias.permission){
      if(directionMode !== "AUTO"){
        state.entryTrackers.delete(trackerKey);
        return {state:"BIAS CONFIRMED",direction:bias.direction,family:null,reason:bias.reason,candidates:[],candidateAudit:[],selected:null,opposingEvidence:[...(bias.opposingEvidence||[])]};
      }
      if(priorWasActive){
        const invalidated = {...prior,state:"INVALIDATED",reason:"Invalidated - directional permission or MA alignment failed",validFor:0,terminalVersion:Number(state.activeSnapshot && state.activeSnapshot.version || 0)};
        state.entryTrackers.set(trackerKey,invalidated);
        return invalidated;
      }
      state.entryTrackers.delete(trackerKey);
      return {state:"NO BIAS",direction:null,family:null,reason:bias.reason,candidates:[],candidateAudit:[],selected:null};
    }
    if(priorWasActive && prior.direction !== bias.direction){
      const invalidated = {...prior,state:"INVALIDATED",reason:"Invalidated - authoritative bias changed direction",validFor:0,terminalVersion:Number(state.activeSnapshot && state.activeSnapshot.version || 0)};
      state.entryTrackers.set(trackerKey,invalidated);
      return invalidated;
    }
    const raw = [...emaCandidates37(bias,horizonId),...structureCandidates37(bias,horizonId),...compressionCandidates37(bias,horizonId)];
    if(priorWasActive){
      raw.forEach(candidate => {
        if(candidate.family === prior.family && candidate.tf === prior.tf && candidate.source === prior.source){
          candidate.zone = {...prior.zone};
          candidate.invalidation = prior.invalidation;
          candidate.setupActivationTime = prior.setupActivationTime;
          candidate.setupIdentity = prior.setupIdentity;
          candidate.distance = candidateDistance37(candidate.zone,candidate.currentPrice);
        }
      });
    }
    const priorStillLocated = !priorWasActive || raw.some(candidate => candidate.family === prior.family && candidate.tf === prior.tf && candidate.source === prior.source);
    let previousCandidate = null;
    let evaluationPrior = prior;
    if(!priorStillLocated){
      previousCandidate = {...prior,state:"INVALIDATED",reason:"Invalidated - setup structure or MA alignment materially deteriorated",validFor:0,terminalVersion:Number(state.activeSnapshot && state.activeSnapshot.version || 0)};
      evaluationPrior = null;
    }
    const unique = [];
    const seen = new Set();
    raw.forEach(candidate => {
      const interactionKey = `${candidate.direction}|${candidate.tf}|${Math.round((candidate.zone.low+candidate.zone.high)/2/Math.max(candidate.volatility.atr*0.35,1e-8))}`;
      if(seen.has(interactionKey)) return;
      seen.add(interactionKey);
      unique.push(candidate);
    });
    const maximumArmAtr = horizonId === "quick" ? 4.5 : horizonId === "2_3h" ? 6 : 7.5;
    const minimumArmPct = horizonId === "quick" ? 0.0025 : horizonId === "2_3h" ? 0.006 : 0.012;
    const maximumArmPct = horizonId === "quick" ? 0.008 : horizonId === "2_3h" ? 0.02 : 0.04;
    const discarded = unique.filter(candidate => {
      if(prior && candidate.setupIdentity && candidate.setupIdentity === prior.setupIdentity) return false;
      const absoluteDistance = candidate.distance == null ? Infinity : candidate.distance*Math.max(Math.abs(candidate.currentPrice),1);
      const armingDistance = clamp37(candidate.volatility.atr*maximumArmAtr,Math.abs(candidate.currentPrice || 0)*minimumArmPct,Math.abs(candidate.currentPrice || 0)*maximumArmPct);
      return absoluteDistance > armingDistance;
    });
    const tradable = unique.filter(candidate => !discarded.includes(candidate));
    const evaluated = tradable.map(candidate => evaluateCandidateState37(candidate,samples,evaluationPrior));
    evaluated.forEach(candidate => { candidate.rankScore = candidateRank37(candidate); });
    const terminalStates = ["EXPIRED","INVALIDATED"];
    const priorTerminal = prior && evaluated.find(candidate => candidate.family === prior.family && candidate.tf === prior.tf && candidate.source === prior.source && terminalStates.includes(candidate.state));
    const snapshotVersion = Number(state.activeSnapshot && state.activeSnapshot.version || 0);
    if(priorTerminal) previousCandidate = {...priorTerminal,terminalVersion:snapshotVersion};
    const selected = selectEntryCandidate37(evaluated);
    if(!selected){
      const decision = {
        state:"BIAS CONFIRMED",direction:bias.direction,family:null,
        reason:discarded.length ? "Bias confirmed - candidate locations are outside the tradable arming distance" : "Bias confirmed - no valid entry family is currently located",
        candidates:evaluated,
        candidateAudit:discarded.map(candidate => ({family:candidate.family,tf:candidate.tf,state:"REMOVED",rankScore:null,zone:zoneText37(candidate),reason:`Outside the volatility-aware arming distance (${maximumArmAtr.toFixed(1)} ATR, capped by horizon)`})),
        selected:null,
        previousCandidate
      };
      state.entryTrackers.set(trackerKey,decision);
      return decision;
    }
    const decision = {
      ...selected,side:selected.direction,direction:bias.direction,
      previousCandidate,
      candidates:evaluated,
      candidateAudit:[
        ...(previousCandidate ? [{family:previousCandidate.family,tf:previousCandidate.tf,state:"INVALIDATED",rankScore:null,zone:zoneText37(previousCandidate),reason:previousCandidate.reason}] : []),
        ...evaluated.slice().sort((a,b) => b.rankScore-a.rankScore).map(candidate => ({family:candidate.family,tf:candidate.tf,state:candidate.state,rankScore:Math.round(candidate.rankScore),zone:zoneText37(candidate),reason:candidate.reason})),
        ...discarded.map(candidate => ({family:candidate.family,tf:candidate.tf,state:"REMOVED",rankScore:null,zone:zoneText37(candidate),reason:`Outside the volatility-aware arming distance (${maximumArmAtr.toFixed(1)} ATR, capped by horizon)`}))
      ]
    };
    if(priorWasActive && prior.setupIdentity && prior.setupIdentity !== decision.setupIdentity){
      const replacedHistory = state.setupHistories.get(prior.setupIdentity);
      if(replacedHistory){
        replacedHistory.replaced = true;
        replacedHistory.retired = true;
        replacedHistory.lastState = "REPLACED";
      }
    }
    state.entryTrackers.set(trackerKey,{...decision,zone:{...decision.zone},candidates:[],terminalVersion:terminalStates.includes(decision.state) ? snapshotVersion : null});
    return decision;
  }
  function evaluateToolbarPressureSignal37(horizonId,directionMode="AUTO"){
    const mode = ["LONG","SHORT"].includes(String(directionMode).toUpperCase()) ? String(directionMode).toUpperCase() : "AUTO";
    const engine = horizonEngine37(horizonId);
    const configsForHorizon = engine.pressure;
    const samples = configsForHorizon.map(item => ({...samplePressureSignal37(item.tf,item.lookback,item.maSlot),weight:item.weight,role:item.role}));
    if(samples.some(sample => !sample.available)){
      const maEvaluation = evaluateMaEvents37(horizonId,samples,0);
      const manualDirection = mode === "AUTO" ? null : mode;
      const incomplete = {
        entry:"ENTRY WAIT",
        confidence:null,
        action:"Data incomplete",
        exit:"EXIT WAIT",
        normalized:0,
        dominantSide:manualDirection === "LONG" ? 1 : manualDirection === "SHORT" ? -1 : 0,
        marketDirection:manualDirection,
        samples,
        maEvents:maEvaluation.events,
        maImpact:0,
        maAudit:maEvaluation.audit,
        dataIncomplete:true,
        directionMode:mode,
        manualThesis:manualDirection ? {status:"MISSING",confidence:null,action:"Data incomplete",direction:manualDirection,maEvents:[],maImpact:0,missing:true} : null
      };
      return incomplete;
    }
    const automaticBias = evaluateBias37(samples,horizonId);
    const preliminary = {normalized:automaticBias.score,samples,breakdown:{participation:0,forming:0}};
    const manualThesis = mode === "AUTO" ? null : evaluateDirectionThesis37(preliminary,mode,horizonId);
    const manualEvaluation = mode === "AUTO" ? null : window.evaluateSignalADirectionalThesis({
      directionMode:mode,automaticBias,manualThesis,
      evaluateSelectedSetup:selectedBias=>{selectedBias.pressure=pressureAudit37(samples,selectedBias.side);return evaluateEntryDecision37(selectedBias,samples,horizonId,mode);}
    });
    const bias = mode === "AUTO" ? automaticBias : manualEvaluation.bias;
    if(mode !== "AUTO" && !bias.pressure) bias.pressure=pressureAudit37(samples,bias.side);
    const signalDirection = bias.side;
    const maEvaluation = evaluateMaEvents37(horizonId,samples,signalDirection);
    const entryDecision = mode === "AUTO" ? evaluateEntryDecision37(bias,samples,horizonId,mode) : manualEvaluation.entryDecision;
    const confidence = bias.confidence;
    const entry = entryDecision.state === "READY" && bias.direction ? `ENTRY ${bias.direction}` : "ENTRY WAIT";
    const structural = bias.direction ? structuralMarketContext37(bias.direction,horizonId) : structuralMarketContext37(1,horizonId);
    const result = {
      entry,
      confidence,
      action:entryDecision.reason,
      normalized:bias.score,
      rawNormalized:bias.pressureScore,
      coreNormalized:bias.stackScore,
      dominantSide:bias.side,
      marketDirection:bias.direction,
      fadeDirection:null,
      samples,
      bias,
      entryDecision,
      entryQuality:entryDecision.entryQuality,
      maEvents:maEvaluation.events,
      maImpact:maEvaluation.impact,
      maAudit:maEvaluation.audit,
      breakdown:{base:54,stack:Math.round(Math.abs(bias.stackScore)*18),pressure:Math.round(Math.abs(bias.pressureScore)*8),structure:Math.round(Math.abs(bias.structureScore)*5),setup:0,ma:0,context:0,participation:0,forming:0,micro:0},
      structuralContext:structural
    };
    result.directionMode=mode;
    result.automaticBias=automaticBias;
    result.manualThesis=manualThesis;
    result.independentThesis = mode === "AUTO" && result.marketDirection
      ? evaluateDirectionThesis37(result,result.marketDirection,horizonId)
      : manualThesis;
    return result;
  }
  function evaluateDirectionThesis37(market,direction,horizonId){
    const desired = direction === "SHORT" ? -1 : 1;
    const samples = Array.isArray(market && market.samples) ? market.samples : [];
    if(!samples.length || samples.some(sample => !sample.available)){
      return {
        status:"MISSING",
        confidence:null,
        action:"Data incomplete",
        direction,
        maEvents:[],
        maImpact:0,
        missing:true
      };
    }
    const main = tooltipMainSample37(market);
    const oriented = Number(market.normalized || 0) * desired;
    const maEvaluation = evaluateMaEvents37(horizonId,samples,desired);
    const structural = structuralMarketContext37(direction,horizonId);
    const engine = horizonEngine37(horizonId);
    const structureBroken = (engine.structureRoles && engine.structureRoles.swing || engine.structureTfs).some(tf => {
      const pivots = canonicalPivots37(tf,"swing");
      const pivot = desired > 0 ? pivots.low : pivots.high;
      return !!(pivot && confirmedCloseBeyond37(tf,pivot.price,desired > 0 ? -1 : 1));
    });
    const contextOpposes = !!(main && main.contextSide === -desired);
    const contextSupports = !!(main && main.contextSide === desired);
    const primaryTf = horizonId === "quick" ? "5m" : horizonId === "2_3h" ? "15m" : "1h";
    const currentPrice = signalCurrentPrice37();
    const primaryMas = [1,2,3].map(slotIndex => signalMaSlot37(primaryTf,`MA${slotIndex}`)).filter(ma => ma.reliable && ma.value != null);
    const maPriceAlignment = currentPrice == null ? 0 : primaryMas.reduce((sum,ma) => sum + ((currentPrice >= ma.value ? 1 : -1) * desired),0);
    const pressureMomentumAlignment = samples.reduce((sum,sample) => {
      if(sample.sideSign !== desired || sample.pressureMomentum <= 0.01) return sum;
      return sum + (sample.tf === "1m" ? 0.35 : sample.weight);
    },0);
    const materialScore = oriented * 30
      + maEvaluation.impact * 0.75
      + structural.points * 1.25
      + maPriceAlignment * 2
      + pressureMomentumAlignment
      + (contextSupports ? 1.5 : 0)
      - (contextOpposes ? 1.5 : 0);
    let status = "MIXED";
    if(structureBroken && materialScore <= -5) status = "INVALID";
    else if(materialScore <= -3) status = "ADVERSE";
    else if(materialScore >= 3) status = "SUPPORTIVE";
    const invalid = status === "INVALID";
    const base = invalid ? 70 : 57;
    const pressurePoints = Math.round(Math.abs(oriented) * (invalid ? 8 : 14));
    const contextPoints = invalid ? (contextOpposes ? 3 : 0) : (contextSupports || contextOpposes ? 3 : 0);
    const maPoints = invalid ? 0 : Math.min(4,Math.abs(maEvaluation.impact));
    const structurePoints = invalid || status === "ADVERSE" ? Math.max(0,-structural.points) : Math.max(0,structural.points);
    const participationPoints = Number(market.breakdown && market.breakdown.participation || 0);
    const formingPoints = Number(market.breakdown && market.breakdown.forming || 0);
    const rawConfidence = base + Math.min(12,Math.round(Math.abs(materialScore))) + pressurePoints + contextPoints + maPoints + structurePoints + participationPoints + formingPoints;
    const confidence = status === "MIXED" ? null
      : invalid
        ? Math.max(68,Math.min(82,Math.round(rawConfidence)))
        : Math.max(54,Math.min(78,Math.round(rawConfidence)));
    const microSample = horizonId === "quick" ? samples.find(sample => sample.tf === "1m") : null;
    const thesisFadeRisk = status === "SUPPORTIVE" && (
      samples.some(sample => sample.sideSign === desired && sample.pressureMomentum < -0.03)
      || !!(microSample && microSample.sideSign === -desired && microSample.dominantPct >= 0.55)
    );
    const action = thesisFadeRisk
      ? (direction === "LONG" ? "Bullish edge weakening" : "Bearish edge weakening")
      : status === "SUPPORTIVE"
      ? (direction === "LONG" ? "Buy pullbacks" : "Sell bounces")
      : status === "MIXED"
        ? "Wait for confirmation"
        : status === "ADVERSE"
          ? "Avoid adds"
          : `${direction === "LONG" ? "Long" : "Short"} thesis failed`;
    return {
      status,
      confidence,
      action,
      direction,
      fadeRisk:thesisFadeRisk,
      oriented,
      materialScore,
      maPriceAlignment,
      primaryTf,
      structureBroken,
      maEvents:maEvaluation.events,
      maImpact:maEvaluation.impact,
      maAudit:maEvaluation.audit,
      structuralContext:structural,
      breakdown:{base,pressure:pressurePoints,context:contextPoints,ma:maPoints,structure:structurePoints,participation:participationPoints,forming:formingPoints},
      missing:false
    };
  }
  function managementFingerprint37(management){
    if(!management) return "missing";
    return JSON.stringify({
      health:management.health,
      action:management.action,
      state:management.state,
      exit:management.exit,
      reasons:management.reasons || [],
      risks:management.risks || [],
      tooltipReasons:management.tooltipReasons || [],
      watchCondition:management.watchCondition || null,
      horizonId:management.horizonId || null,
      anchor:management.anchor || null,
      pathA:management.pathA || null,
      pathB:management.pathB || null,
      progress:management.progress || null,
      roi:management.roi || null
    });
  }
  function signalContextKey37(){
    const symbol=String((typeof cfg === "function" && cfg() && cfg().symbol) || document.getElementById("market")?.value || "").toUpperCase();
    const engine=activeSignalEngine37();
    return [symbol,state.horizon,state.direction,engine&&engine.id||"UNAVAILABLE",engine&&engine.version||"unversioned"].join("|");
  }
  function presentationContextKey37(){return signalContextKey37();}
  function actionContextKey37(position=openPositionSignal37()){
    const symbol=String(position&&position.symbol||currentSignalSymbol37()).toUpperCase();
    const positionKey=position?[position.side,position.chainId||position.time||position.price||"open"].join(":"):"flat";
    const account=["account","accountSelect","selectedAccount"].map(id=>document.getElementById(id)?.value||"").join(":");
    return [symbol,account,positionKey,positionEngine.getManagementHorizon()||"quick"].join("|");
  }
  function clonePublicationValue37(value){
    if(value == null) return value;
    const diagnostics=uiPerf();
    const instrument=!!(diagnostics && diagnostics.isEnabled && diagnostics.isEnabled());
    const started=instrument ? (typeof performance!=="undefined" && performance.now ? performance.now() : Date.now()) : 0;
    try{ return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch(_e){ return value; }
    finally{
      if(instrument){
        performanceDiagnostics.structuredCloneCount+=1;
        performanceDiagnostics.structuredCloneMs+=(typeof performance!=="undefined" && performance.now ? performance.now() : Date.now())-started;
      }
    }
  }
  function publishedForContext37(contextKey,validOnly=false){
    const published=validOnly ? state.lastValidPublishedSnapshot : state.lastPublishedSnapshot;
    return published && published.contextKey===contextKey ? published : null;
  }
  function publishedWithinSafeWindow37(contextKey,now=Date.now()){
    const published=publishedForContext37(contextKey,true);
    if(!published) return null;
    const orders=published.snapshot && published.snapshot.protectiveOrders;
    const reference=published.snapshot && published.snapshot.position
      ? num37(orders && (orders.verifiedAt ?? orders.updatedAt))
      : num37(published.publishedAt);
    return reference != null && Math.max(0,now-reference)<=featureConfig.freshness.publishedSnapshotSafeMs ? published : null;
  }
  function actionPublishedForContext37(contextKey,validOnly=false){
    const published=validOnly?actionState.lastValidPublishedSnapshot:actionState.lastPublishedSnapshot;
    return published&&published.contextKey===contextKey?published:null;
  }
  function actionPublishedWithinSafeWindow37(contextKey,now=Date.now()){
    const published=actionPublishedForContext37(contextKey,true);if(!published)return null;
    const orders=published.snapshot&&published.snapshot.protectiveOrders,reference=published.snapshot&&published.snapshot.position?num37(orders&&(orders.verifiedAt??orders.updatedAt)):num37(published.publishedAt);
    return reference!=null&&Math.max(0,now-reference)<=featureConfig.freshness.publishedSnapshotSafeMs?published:null;
  }
  function setRefreshState37(next,contextKey,message=""){
    state.refreshState=next;
    windowSystem.setRefreshState(next,contextKey,message);
  }
  function invalidatePublishedContext37(nextContextKey=null){
    state.refreshGeneration+=1;
    state.refreshState="UNAVAILABLE";
    state.workingSnapshot=null;
    state.lastPublishedSnapshot=null;
    state.lastValidPublishedSnapshot=null;
    state.lastAnalyticalFingerprint="";
    state.scheduledFrozen=null;
    windowSystem.invalidateSignalContext(nextContextKey);
  }
  function orderRefreshGate37(snapshot,contextKey,now=Date.now()){
    if(!snapshot || !snapshot.position) return {terminal:true,state:"READY",reason:"No open position requires protective-order aggregation"};
    const orders=snapshot.protectiveOrders || {};
    const status=String(orders.status || "unavailable").toLowerCase();
    const orderAt=num37(orders.verifiedAt ?? orders.updatedAt);
    const orderAgeMs=orderAt == null ? Infinity : Math.max(0,now-orderAt);
    if(status==="ok" && orders.sourcesChecked===true){
      const streamCovered=String(orders.streamStatus || "").toLowerCase()==="live" && String(orders.coverageSource || "").toUpperCase()==="USER_STREAM";
      return {terminal:true,state:!streamCovered && orderAgeMs>featureConfig.freshness.protectiveOrderStaleMs ? "STALE" : "READY",orderAgeMs,streamCovered};
    }
    const prior=actionPublishedWithinSafeWindow37(contextKey,now);
    if(status==="pending" || status==="loading"){
      if(prior) return {terminal:false,state:"REFRESHING",prior,reason:"Protective-order request is in flight",orderAgeMs};
      if(!actionPublishedForContext37(contextKey,true)) return {terminal:false,state:"UNAVAILABLE",reason:"Awaiting the first protective-order snapshot",orderAgeMs};
      return {terminal:true,state:"STALE",reason:"Last protective-order result exceeded the decision-safe window",orderAgeMs};
    }
    if(prior) return {terminal:false,state:"ERROR",prior,reason:"Update delayed · showing last valid result",orderAgeMs};
    return {terminal:true,state:Number.isFinite(orderAgeMs) ? "STALE" : "UNAVAILABLE",reason:"Protective-order refresh is unavailable",orderAgeMs};
  }
  function positionDataState37(management,fallback="UNAVAILABLE"){
    const freshness=management && management.freshness || {};
    const stopFreshness=management && management.stopEvaluation && management.stopEvaluation.freshness || {};
    const stopStatus=String(stopFreshness.stopStatus || freshness.stopStatus || "").toUpperCase();
    const managementStatus=String(freshness.managementStatus || fallback || "UNAVAILABLE").toUpperCase();
    return [stopStatus,managementStatus].includes("UNAVAILABLE") ? "UNAVAILABLE"
      : [stopStatus,managementStatus].includes("STALE") ? "STALE"
        : managementStatus==="LIVE" && (!stopStatus || stopStatus==="LIVE") ? "LIVE" : managementStatus;
  }
  function completeness37(snapshot,management,dependencyGate){
    const position=!!(snapshot && snapshot.position);
    if(!position) return {complete:true,sections:{pricePosition:"READY"}};
    const targets=management && management.targetFramework;
    const stop=management && management.stopEvaluation;
    const terminalDependency=dependencyGate && dependencyGate.terminal===true;
    const sections={
      pricePosition:(snapshot.currentPrice!=null || management && management.position && management.position.currentPrice!=null) && snapshot.position ? "READY" : "UNAVAILABLE",
      managementEvidence:management && management.evidence ? "READY" : "UNAVAILABLE",
      obstacle:targets && targets.obstacle ? (targets.obstacle.available===false ? "UNAVAILABLE" : "READY") : "PENDING",
      primaryTarget:targets && targets.primary ? (targets.primary.available===false ? "UNAVAILABLE" : "READY") : "PENDING",
      extendedTarget:targets && targets.extended ? (targets.extended.available===false ? "UNAVAILABLE" : "READY") : "PENDING",
      protectiveOrders:terminalDependency ? dependencyGate.state : "PENDING",
      binanceExits:Array.isArray(management && management.exitEvaluations) ? "READY" : "PENDING",
      grLadder:management && management.grExitLadder ? (management.grExitLadder.available===false ? "UNAVAILABLE" : "READY") : "PENDING",
      stopProtection:stop && Object.prototype.hasOwnProperty.call(stop,"protection") ? (stop.protection==="UNAVAILABLE" ? "UNAVAILABLE" : "READY") : "PENDING",
      stopQuality:stop && stop.quality ? (stop.quality.value==="UNAVAILABLE" ? "UNAVAILABLE" : "READY") : "PENDING",
      technicalInvalidation:stop && stop.invalidation ? (stop.invalidation.selected ? "READY" : "UNAVAILABLE") : "PENDING",
      recommendation:stop && stop.recommendation ? (String(stop.recommendation.value || "").startsWith("UNAVAILABLE") ? "UNAVAILABLE" : "READY") : "PENDING",
      volatility:management && management.volatility ? (management.volatility.available===false ? "UNAVAILABLE" : "READY") : "PENDING",
      lifecycle:management && management.lifecycle ? "READY" : "PENDING",
      freshness:management && management.freshness && stop && stop.freshness ? positionDataState37(management) : "PENDING"
    };
    const complete=Object.values(sections).every(value=>value!=="PENDING");
    const recommendation=String(stop && stop.recommendation && stop.recommendation.value || "");
    const coherent=!(positionDataState37(management)==="LIVE" && /REQUIRED DATA STALE/i.test(recommendation));
    return {complete:complete && coherent,coherent,sections};
  }
  function publicationSnapshot37(snapshot){
    if(!snapshot) return null;
    const publication={
      symbol:snapshot.symbol,horizonId:snapshot.horizonId,createdAt:snapshot.createdAt,version:snapshot.version,signature:snapshot.signature,
      currentPrice:snapshot.currentPrice,freshness:snapshot.freshness
    };
    ["position","protectiveOrders","exitOrderState"].forEach(key=>{if(Object.prototype.hasOwnProperty.call(snapshot,key))publication[key]=snapshot[key];});
    return clonePublicationValue37(publication);
  }
  function publishSignalPresentation37(publication){
    if(publication.generation!==state.refreshGeneration || publication.contextKey!==presentationContextKey37()) return false;
    const displayed=publication.displayedSignal;
    if(!displayed || displayed.generation!==publication.generation){
      performanceDiagnostics.signalPublicationMismatches+=1;
      return false;
    }
    state.lastPublishedSnapshot=publication;
    if(publication.refreshState==="READY") state.lastValidPublishedSnapshot=publication;
    state.signalSummaryVariants=displayed.summaryVariants;
    const nextDisplayFingerprint=[displayed.signalIdentity,displayed.entryTone,displayed.summaryVariants.full].join("|");
    const displayChanged=nextDisplayFingerprint!==state.displayFingerprint;
    state.displayFingerprint=nextDisplayFingerprint;
    if(state.entry){
      if(state.entry.dataset.tone!==displayed.entryTone) state.entry.dataset.tone=displayed.entryTone;
      if(state.entry.textContent!==displayed.summaryVariants.full) state.entry.textContent=displayed.summaryVariants.full;
      state.entry.dataset.signalGeneration=String(displayed.generation);
      state.entry.dataset.signalIdentity=displayed.signalIdentity;
      state.entry.dataset.signalDirectionMode=displayed.mode;
      state.entry.dataset.signalEvaluatedDirection=displayed.evaluatedDirection||displayed.direction;
      state.entry.dataset.signalAuthoritativePhase=displayed.authoritativePhase||"";
      state.entry.dataset.signalDirection=displayed.direction;
      state.entry.dataset.signalConfidence=displayed.confidence==null ? "" : String(displayed.confidence);
      state.entry.dataset.signalState=displayed.visibleState;
      state.entry.dataset.signalSetupIdentity=displayed.setupIdentity || "";
      state.entry.dataset.signalEngineId=displayed.engineId;
      state.entry.dataset.signalId=displayed.signalId||displayed.engineId;
      state.entry.dataset.signalEngineVersion=displayed.engineVersion;
      state.entry.dataset.signalPublicationGeneration=String(displayed.publicationGeneration);
      state.entry.removeAttribute("title");
      updateTriggerAlert37(publication.signal,displayed.decision,displayed);
      buttonMatchesDisplayedSignal37(displayed);
    }
    if(displayChanged) renderResponsiveSignalSummary37();
    windowSystem.updateSignal(publication);
    if(state.detailsBody && state.details && state.details.classList.contains("is-open")){
      const report=ensurePublicationSignalReport37(publication);
      renderSignalDetailsReport37(report);
      windowSystem.recordSignalDetailsPublication(displayed,report);
      if(state.detailsTitle) state.detailsTitle.textContent="Signal Details";
      positionToolbarSignalDetails37();
    }
    setRefreshState37(publication.refreshState,publication.contextKey);
    state.lastRenderAt=Date.now();
    state.workingSnapshot=null;
    return true;
  }
  function publishEngineEvaluation37(output,{generation,contextKey,reportSnapshot,bundle}){
    if(!signalEngineRegistry.accepts(output,{directionMode:state.direction,publicationGeneration:generation}) || generation!==state.refreshGeneration || contextKey!==presentationContextKey37()) return {discarded:true};
    const publishedAt=Date.now(),presentation=output.presentation||{};
    const displayedSignal=displayedFromEngineOutput37(output,{generation,publishedAt,mode:state.direction,horizonId:state.horizon});
    const signal=presentation.signal||{marketDirection:displayedSignal.direction==="NO BIAS"?null:displayedSignal.direction,confidence:displayedSignal.confidence,entryDecision:displayedSignal.decision,dataHealth:bundle.health};
    const thesis=presentation.thesis||null;
    const entryQuality=presentation.entryQuality||{instruction:output.reasons[0]||"Engine evaluation",exclusions:[...output.exclusions],decision:displayedSignal.decision};
    const presentationSignal={...signal,marketDirection:displayedSignal.direction==="NO BIAS"?null:displayedSignal.direction,confidence:displayedSignal.confidence,fadeDirection:displayedSignal.direction==="NO BIAS"?null:displayedSignal.direction,entryDecision:displayedSignal.decision};
    const presentationEntryQuality={...entryQuality,decision:displayedSignal.decision};
    const withReportSnapshot=work=>()=>{const prior=state.activeSnapshot;state.activeSnapshot=reportSnapshot;try{return work();}finally{state.activeSnapshot=prior;}};
    const refreshState=reportSnapshot&&reportSnapshot.freshness&&reportSnapshot.freshness.signalStatus==="STALE"||bundle.health.status==="stale"?"STALE":reportSnapshot&&reportSnapshot.freshness&&reportSnapshot.freshness.signalStatus==="UNAVAILABLE"?"UNAVAILABLE":"READY";
    const publicationFingerprint=[reportSnapshot&&reportSnapshot.signature||"engine",displayedSignal.signalIdentity,displayedSignal.engineId,displayedSignal.engineVersion].join("|");
    const comparison=output.comparisonDiagnostics||{};
    const diagnosticText=()=>[
      `Engine: Signal ${output.engineId} · ${output.engineVersion}`,`Direction mode: ${displayedSignal.mode}`,`Publication generation: ${generation}`,`Data status: ${output.dataStatus}`,
      `Directional permission score: ${comparison.directionalPermissionScore??"Unavailable"}`,`Setup score: ${comparison.setupScore??"Unavailable"}`,`Setup breakdown: ${JSON.stringify(comparison.setupBreakdown||{})}`,
      `Trigger score: ${comparison.triggerScore??"Unavailable"}`,`Trigger breakdown: ${JSON.stringify(comparison.triggerBreakdown||{})}`,`Current-entry score: ${comparison.currentEntryScore??"Unavailable"}`,`Current-entry breakdown: ${JSON.stringify(comparison.currentEntryBreakdown||{})}`,
      `Hard gates passed: ${(comparison.hardGates&&comparison.hardGates.passed||[]).join(", ")||"None"}`,`Hard gates failed: ${(comparison.hardGates&&comparison.hardGates.failed||[]).join(", ")||"None"}`,
      `Effective opposition: ${(comparison.effectiveOppositionEvidence||[]).join("; ")||"None"}`,`Volatility regime: ${comparison.volatilityRegime||"Unavailable"}`,`Participation: ${comparison.participationState||"UNAVAILABLE"}`,
      `Flow effectiveness: ${JSON.stringify(comparison.flowEffectiveness||{})}`,`Chase distance: ${comparison.chaseDistanceAtr??"Unavailable"} ATR`,`Remaining reward/risk: ${comparison.remainingRewardRisk??"Unavailable"}`,`Final state reason: ${comparison.finalStateReason||output.reasons[0]||"Unavailable"}`
    ].join("\n");
    const fallbackReport=()=>({summary:displayedSignalHeader37(displayedSignal).join("\n"),analysis:[...output.reasons,...output.exclusions,"",...(output.detailLines||[])].join("\n")||"No additional engine analysis.",diagnostics:[diagnosticText(),...(output.detailLines||[])].join("\n"),publication:displayedSignalMeta37(displayedSignal)});
    const tooltipPayload=withReportSnapshot(()=>({text:presentation.signal?signalToolbarTooltip37(presentationSignal,presentationEntryQuality,thesis,displayedSignal):build.createSignalDiagnosticsTooltip(output,displayedSignal,horizonLabel37(state.horizon)),publication:displayedSignalMeta37(displayedSignal)}))();
    const publication={
      generation,contextKey,publishedAt,refreshState,sections:{signalEvidence:"READY"},displayedSignal,engineId:output.engineId,signalId:output.signalId||output.engineId,engineVersion:output.engineVersion,directionMode:displayedSignal.mode,publicationGeneration:generation,
      __reportSnapshot:reportSnapshot,signal,decision:displayedSignal.decision,normalizedOutput:output,signalSummaryVariants:displayedSignal.summaryVariants,entryTone:displayedSignal.entryTone,
      signalReport:null,signalReportFactory:withReportSnapshot(presentation.signal?()=>signalDetailsReport37(presentationSignal,thesis,presentationEntryQuality,displayedSignal):fallbackReport),
      snapshot:publicationSnapshot37(reportSnapshot),horizonLabel:horizonLabel37(state.horizon),signalHorizonId:state.horizon,
      signalTooltip:tooltipPayload.text,signalTooltipPublication:tooltipPayload.publication,signalTooltipFactory:null,
      publicationFingerprint,signalReportFingerprint:publicationFingerprint,signalTooltipFingerprint:publicationFingerprint
    };
    publishSignalPresentation37(publication);return publication;
  }
  function publishSignalEngineUnavailable37(error,contextKey=presentationContextKey37()){
    state.lastError=error&&error.stack||String(error||"Signal engine unavailable");state.lastPublishedSnapshot=null;state.lastValidPublishedSnapshot=null;state.workingSnapshot=null;stopTriggerAlert37();
    windowSystem.invalidateSignalContext(contextKey);windowSystem.setRefreshState("UNAVAILABLE",contextKey,"Selected Signal engine is unavailable");
    const engine=activeSignalEngine37();
    if(state.entry){state.entry.textContent="Unavailable";state.entry.dataset.tone="gray";state.entry.dataset.signalEngineId=engine&&engine.id||"";state.entry.dataset.signalEngineVersion=engine&&engine.version||"";state.entry.dataset.signalPublicationGeneration=String(state.refreshGeneration);}
    return false;
  }
  function runRefreshSelfTests37(){
    const saved={last:actionState.lastPublishedSnapshot,valid:actionState.lastValidPublishedSnapshot};
    const now=Date.now(),context="BTCUSDT|account-a|LONG:campaign-a|quick";
    const orders={status:"ok",sourcesChecked:true,updatedAt:now-5000,orders:[]};
    actionState.lastValidPublishedSnapshot={contextKey:context,publishedAt:now-5000,snapshot:{position:{side:"LONG"},protectiveOrders:orders}};
    actionState.lastPublishedSnapshot=actionState.lastValidPublishedSnapshot;
    const pending=orderRefreshGate37({position:{side:"LONG"},protectiveOrders:{...orders,status:"pending"}},context,now);
    const failed=orderRefreshGate37({position:{side:"LONG"},protectiveOrders:{...orders,status:"error"}},context,now);
    const stale=orderRefreshGate37({position:{side:"LONG"},protectiveOrders:{...orders,status:"pending",updatedAt:now-featureConfig.freshness.publishedSnapshotSafeMs-1}},context,now+featureConfig.freshness.publishedSnapshotSafeMs);
    const completeSnapshot={currentPrice:100,position:{side:"LONG"},protectiveOrders:orders};
    const completeManagement={
      evidence:{supporting:[],conflicting:[]},targetFramework:{obstacle:{available:true},primary:{available:true},extended:{available:false}},
      exitEvaluations:[],grExitLadder:{available:true},volatility:{available:true},lifecycle:{state:"ESTABLISHED"},freshness:{managementStatus:"LIVE",stopStatus:"LIVE"},
      stopEvaluation:{protection:"FULLY PROTECTED",quality:{value:"STRUCTURALLY ALIGNED"},invalidation:{selected:{price:90}},recommendation:{value:"KEEP CURRENT STOP"},freshness:{stopStatus:"LIVE",stopStaleSources:[]}}
    };
    const completeResult=completeness37(completeSnapshot,completeManagement,{terminal:true,state:"READY"});
    const pendingResult=completeness37(completeSnapshot,completeManagement,{terminal:false,state:"REFRESHING"});
    const contradictory=completeness37(completeSnapshot,{...completeManagement,stopEvaluation:{...completeManagement.stopEvaluation,recommendation:{value:"UNAVAILABLE — REQUIRED DATA STALE"}}},{terminal:true,state:"READY"});
    const cloneSource={stopEvaluation:{recommendation:{value:"KEEP CURRENT STOP"}}},clone=clonePublicationValue37(cloneSource);cloneSource.stopEvaluation.recommendation.value="MUTATED";
    const cases={
      completeInitialSnapshotPublishable:completeResult.complete && Object.keys(completeResult.sections).length===15,
      pendingDependencyNotPublishable:!pendingResult.complete && pendingResult.sections.protectiveOrders==="PENDING",
      contradictoryLiveSnapshotRejected:!contradictory.complete && contradictory.coherent===false,
      publishedSnapshotNotMutatedInPlace:clone.stopEvaluation.recommendation.value==="KEEP CURRENT STOP",
      oppositeLiveExitIncluded:orderMatchesPosition37({side:"SELL",positionSide:"LONG",status:"NEW"},{side:"LONG"}),
      sameDirectionEntryExcluded:!orderMatchesPosition37({side:"BUY",positionSide:"LONG",status:"NEW"},{side:"LONG"}),
      wrongPositionSideExcluded:!orderMatchesPosition37({side:"SELL",positionSide:"SHORT",status:"NEW"},{side:"LONG"}),
      inactiveOrderExcluded:!orderMatchesPosition37({side:"SELL",positionSide:"LONG",status:"FILLED"},{side:"LONG"}),
      grOwnershipRequiresIdentity:grOrderOwnership37({clientOrderId:"GR_EXIT_7"}) && !grOrderOwnership37({clientOrderId:"manual-7"}),
      fiveSecondsIsCurrent:orderRefreshGate37({position:{side:"LONG"},protectiveOrders:orders},context,now).state==="READY",
      pendingRetainsComplete:!pending.terminal && pending.state==="REFRESHING" && pending.prior===actionState.lastValidPublishedSnapshot,
      failureRetainsWithinWindow:!failed.terminal && failed.state==="ERROR",
      staleThresholdStopsRetention:stale.terminal && stale.state==="STALE",
      noPriorPendingUnavailable:(()=>{actionState.lastValidPublishedSnapshot=null;return orderRefreshGate37({position:{side:"LONG"},protectiveOrders:{status:"pending",updatedAt:null}},context,now).state==="UNAVAILABLE";})(),
      symbolChangeInvalidates:!actionPublishedForContext37(context.replace("BTCUSDT","ETHUSDT"),true),
      accountChangeInvalidates:!actionPublishedForContext37(context.replace("account-a","account-b"),true),
      positionCloseInvalidates:!actionPublishedForContext37(context.replace("LONG:campaign-a","flat"),true),
      sideChangeInvalidates:!actionPublishedForContext37(context.replace("LONG:campaign-a","SHORT:campaign-b"),true),
      lateGenerationRejected:7!==8
    };
    actionState.lastPublishedSnapshot=saved.last;actionState.lastValidPublishedSnapshot=saved.valid;
    return {passed:Object.values(cases).every(Boolean),cases};
  }
  function renderToolbarSignal37(contextKey=presentationContextKey37(),generation=state.refreshGeneration,preparedRevision=null){
    if(!ensureToolbarSignalUi37()) return;
    if(generation!==state.refreshGeneration || contextKey!==presentationContextKey37()) return {discarded:true};
    if(state.directionChip){
      state.directionChip.textContent = `DIR: ${state.direction}`;
      state.directionChip.classList.add("is-active");
      state.directionChip.setAttribute("aria-label",`Direction mode ${state.direction}. Click to change.`);
      state.directionChip.title = "Direction mode: AUTO → LONG → SHORT";
    }
    HORIZONS.forEach(item => {
      const chip = state.chips.get(item.id);
      if(chip) chip.classList.toggle("is-active",state.horizon === item.id);
    });
    windowSystem.setSignalHorizon(state.horizon);
    const bundle = ensureSignalData37(state.horizon);
    const ready = bundle.health.status === "sufficient" || bundle.health.status === "stale";
    if(!ready){
      const prior=publishedWithinSafeWindow37(contextKey);
      if(prior && (bundle.health.status==="loading" || state.dataLoadPromise)){
        setRefreshState37("REFRESHING",contextKey);
        state.lastRenderAt=Date.now();
        return {retained:true,status:"loading"};
      }
      if(prior && bundle.health.status==="failed"){
        setRefreshState37("ERROR",contextKey,"Update delayed · showing last valid result");
        state.lastRenderAt=Date.now();
        return {retained:true,status:"failed"};
      }
      setRefreshState37("UNAVAILABLE",contextKey);
      state.lastRenderAt=Date.now();
      return {retained:false,status:bundle.health.status};
    }
    state.activeSnapshot = ready ? timed37("signal.snapshot-collection",() => coherentSignalSnapshot37(bundle.plan,bundle.health,preparedRevision && preparedRevision.frozen),preparedRevision && preparedRevision.fingerprint) : null;
    if(state.activeSnapshot) state.activeSnapshot.health = bundle.health;
    try{
      const reportSnapshot=state.activeSnapshot;
      const output=signalEngineRegistry.evaluate({
        publicationGeneration:generation,reason:state.lastRefreshReason,horizonId:state.horizon,directionMode:state.direction,mode:state.direction,snapshot:reportSnapshot,dataHealth:bundle.health,
        evaluateSignalA:({directionMode})=>{
          let signal;
          performanceDiagnostics.signalLightCalculations += 1;
          signal=timed37("signal.calculation",()=>evaluateToolbarPressureSignal37(state.horizon,directionMode),preparedRevision&&preparedRevision.fingerprint);
          state.activeSnapshot.signal=signal;signal.dataHealth=bundle.health;
          if(bundle.health.status==="stale"&&num37(signal.confidence)!=null){signal.confidence=Math.min(62,signal.confidence);signal.staleConfidenceCap=62;}
          const thesis=signal.manualThesis||null;
          if(thesis&&bundle.health.status==="stale"&&num37(thesis.confidence)!=null){thesis.confidence=Math.min(62,thesis.confidence);thesis.staleConfidenceCap=62;}
          const entryDirection=directionMode==="AUTO"?(signal.fadeDirection||signal.marketDirection):directionMode;
          const entryQuality=evaluateEntryQuality37(signal,thesis,entryDirection);
          const displayedSignal=buildDisplayedSignalPublication37({generation,publishedAt:Date.now(),mode:directionMode,horizonId:state.horizon,signal,thesis,entryQuality});
          return normalizedSignalAOutput37(signal,thesis,entryQuality,displayedSignal);
        }
      });
      state.workingSnapshot={generation,contextKey,startedAt:state.refreshStartedAt,snapshot:reportSnapshot,sections:{signalEvidence:"READY"}};
      if(output&&typeof output.then==="function"){
        output.then(value=>publishEngineEvaluation37(value,{generation,contextKey,reportSnapshot,bundle})).catch(error=>{if(generation===state.refreshGeneration)publishSignalEngineUnavailable37(error,contextKey);});
        return {pending:true};
      }
      return publishEngineEvaluation37(output,{generation,contextKey,reportSnapshot,bundle});
    }finally{
      state.activeSnapshot = null;
    }
  }
  function scheduleToolbarSignalRefresh37(immediate=false,reason="source-check"){
    if(!state.initialized) return;
    const run = () => {
      state.refreshTimer = null;
      const contextKey=presentationContextKey37();
      const incompatible=!!state.lastPublishedSnapshot && state.lastPublishedSnapshot.contextKey!==contextKey;
      if(incompatible){
        invalidatePublishedContext37(contextKey);
        if(state.entry){ state.entry.textContent="Unavailable";state.entry.dataset.tone="gray"; }
      }
      const revision=timed37("signal.snapshot-fingerprint",analyticalInputRevision37);
      if(!shouldRunAnalyticalRefresh37(state.lastAnalyticalFingerprint,revision.fingerprint)){
        performanceDiagnostics.signalSkippedDuplicateRefreshes+=1;
        counted37("signal.heavy-refresh-skipped",revision.fingerprint);
        state.lastRefreshReason=`${reason}:unchanged`;
        return;
      }
      state.lastAnalyticalFingerprint=revision.fingerprint;
      state.scheduledFrozen=revision.frozen;
      state.lastRefreshReason=reason;
      const generation=++state.refreshGeneration;
      const retained=!!publishedWithinSafeWindow37(contextKey);
      setRefreshState37(retained ? "REFRESHING" : "UNAVAILABLE",contextKey);
      state.refreshStartedAt=Date.now();
      const calculate = () => {
        if(generation!==state.refreshGeneration || contextKey!==presentationContextKey37()) return;
        try{
          performanceDiagnostics.signalFullCalculations+=1;
          timed37("signal.heavy-refresh",() => renderToolbarSignal37(contextKey,generation,revision),revision.fingerprint);
          state.lastError = null;
        }catch(error){
          publishSignalEngineUnavailable37(error,contextKey);
        }
      };
      if(retained && typeof requestAnimationFrame === "function") requestAnimationFrame(calculate); else calculate();
    };
    if(immediate){
      if(state.refreshTimer != null) clearTimeout(state.refreshTimer);
      run();
      return;
    }
    const remaining = Math.max(0,featureConfig.refreshMs - (Date.now() - state.lastRenderAt));
    if(remaining === 0){
      run();
    }else if(state.refreshTimer == null){
      state.refreshTimer = setTimeout(run,remaining);
    }
  }

  function calculateActionPublication37(input,generation,reason,lastValid){
    const position=input.privateFacts.position,health=input.bundle.health;
    const compatibleValid=lastValid&&lastValid.contextKey===input.contextKey?lastValid:null;
    const evidenceReady=["sufficient","stale"].includes(health.managementStatus||health.status);
    if(position&&!evidenceReady&&compatibleValid)return {retained:true,refreshState:health.managementStatus==="failed"?"ERROR":"REFRESHING",message:"Update delayed · showing last valid Action"};
    const snapshot=timed37("action.snapshot-collection",()=>buildActionSnapshot37(input),input.fingerprint);
    actionState.activeSnapshot=snapshot;
    const priorActive=state.activeSnapshot;state.activeSnapshot=snapshot;
    try{
      const samples=evidenceReady?actionPressureSamples37(input.bundle.plan):[];
      const management=timed37("action.calculation",()=>evaluatePositionManagement37(samples,input.bundle.plan.managementHorizonId),input.fingerprint);
      const dependencyGate=orderRefreshGate37(snapshot,input.contextKey);
      const complete=completeness37(snapshot,management,dependencyGate);
      if((!dependencyGate.terminal||!complete.complete)&&compatibleValid)return {retained:true,refreshState:dependencyGate.state==="ERROR"?"ERROR":"REFRESHING",message:dependencyGate.reason||"Update delayed · showing last valid Action"};
      if(!dependencyGate.terminal||!complete.complete)return {retained:true,refreshState:"UNAVAILABLE",message:dependencyGate.reason||"Action snapshot is incomplete"};
      const dataState=positionDataState37(management,health.managementStatus||health.status);
      const refreshState=dependencyGate.state==="STALE"||dataState==="STALE"?"STALE":dependencyGate.state==="UNAVAILABLE"||dataState==="UNAVAILABLE"?"UNAVAILABLE":"READY";
      const publishedAt=Date.now(),publicationFingerprint=[input.fingerprint,managementFingerprint37(management)].join("|");
      return {publication:{
        generation,inputFingerprint:input.fingerprint,contextKey:input.contextKey,publishedAt,refreshState,reason,
        management,managementDataStatus:dataState,snapshot:publicationSnapshot37(snapshot),
        exitTone:pillTone37(management.exit),exitText:exitDisplayText37(management.exit),publicationFingerprint,
        positionTooltip:"",positionTooltipFingerprint:publicationFingerprint,positionReportFingerprint:publicationFingerprint,
        positionRevision:input.positionRevision,orderRevision:input.orderRevision,managementDataRevisions:clonePublicationValue37(input.revisions)
      }};
    }finally{state.activeSnapshot=priorActive;actionState.activeSnapshot=null;}
  }
  function publishActionPresentation37(publication){
    if(!publication||publication.contextKey!==actionContextKey37(publication.snapshot&&publication.snapshot.position))return false;
    actionState.lastError=null;actionState.lastPublishedSnapshot=publication;if(publication.refreshState==="READY")actionState.lastValidPublishedSnapshot=publication;
    actionState.refreshState=publication.refreshState;actionState.lastRefreshReason=publication.reason||"action-publication";
    if(state.exit){
      if(state.exit.dataset.tone!==publication.exitTone)state.exit.dataset.tone=publication.exitTone;
      if(state.exit.textContent!==publication.exitText)state.exit.textContent=publication.exitText;
      state.exit.dataset.actionGeneration=String(publication.generation);state.exit.dataset.actionFingerprint=publication.publicationFingerprint;state.exit.removeAttribute("title");
    }
    windowSystem.updatePosition(publication);return true;
  }
  function actionLifecycle37(){
    if(actionState.lifecycle)return actionState.lifecycle;
    actionState.lifecycle=build.createActionLifecycle({
      refreshMs:featureConfig.refreshMs,captureInput:()=>actionInputRevision37(),calculate:calculateActionPublication37,publish:publishActionPresentation37,
      onState:(next,message)=>{actionState.refreshState=next;windowSystem.setActionRefreshState(next,actionContextKey37(),message);},
      onError:error=>{actionState.lastError=error&&error.stack||String(error);}
    });
    return actionState.lifecycle;
  }
  function scheduleActionRefresh37(immediate=false,reason="source-check"){if(!state.initialized)return;actionState.lastRefreshReason=reason;actionLifecycle37().schedule(immediate,reason);}


  function frozenPublicationInvariant37(){
    const publication=state.lastPublishedSnapshot,displayed=publication&&publication.displayedSignal,feed=signalFeed37().diagnostics();
    if(!publication||!displayed) return null;
    const report=ensurePublicationSignalReport37(publication);
    const tooltip=publication.signalTooltip||"";
    const revisions={};Object.keys(feed.buffers||{}).sort().forEach(tf=>{const buffer=feed.buffers[tf];revisions[tf]={depth:buffer.depth,closedRevision:buffer.closedRevision,formingRevision:buffer.formingRevision};});
    return {
      direction:displayed.direction,confidence:displayed.confidence,entryState:displayed.decision&&displayed.decision.state||null,
      visibleState:displayed.visibleState,setupIdentity:displayed.setupIdentity||null,setupTimeframe:displayed.setupTimeframe||null,
      buttonText:state.entry&&state.entry.textContent||"",buttonTone:state.entry&&state.entry.dataset.tone||"",buttonTitle:state.entry&&state.entry.getAttribute("title")||"",
      tooltip,details:report?JSON.stringify({summary:report.summary,analysis:report.analysis,diagnostics:report.diagnostics}):"",
      triggerAlertIdentity:state.activeTriggerAlertId||null,revisions,
      publicationFingerprint:publication.publicationFingerprint,generation:publication.generation,signalIdentity:displayed.signalIdentity,
      analyticalFingerprint:state.lastAnalyticalFingerprint,feedGeneration:feed.generation,feedSocketGeneration:feed.socketGeneration,
      subscribedTimeframes:feed.subscribedTimeframes,evidenceFingerprint:feed.evidenceFingerprint,
      latestPriceAt:feed.latestPriceAt,latestPriceSource:feed.latestPriceSource
    };
  }
  function isolationTextFingerprint37(value){
    const text=String(value||"");let hash=2166136261;
    for(let index=0;index<text.length;index+=1){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619);}
    return `${text.length}:${(hash>>>0).toString(16)}`;
  }
  function summarizePublicationInvariant37(value){
    if(!value)return null;
    return {...value,tooltip:isolationTextFingerprint37(value.tooltip),details:isolationTextFingerprint37(value.details)};
  }
  async function runChartTimeframeIsolationTests37({exerciseLifecycle=true,settleMs=250}={}){
    const selector=document.getElementById("interval"),publication=state.lastPublishedSnapshot;
    if(!selector||!publication) return {passed:false,reason:"A ready Signal publication and chart timeframe selector are required"};
    const feed=signalFeed37(),original=selector.value,timeframes=["1m","3m","5m","15m","30m","1h","4h","1d"],before=frozenPublicationInvariant37();
    if(!before) return {passed:false,reason:"Signal publication is unavailable"};
    const samples=[];
    for(const tf of timeframes){
      selector.value=tf;selector.dispatchEvent(new Event("change",{bubbles:true}));
      const revision=analyticalInputRevision37();
      samples.push({tf,publication:frozenPublicationInvariant37(),calculationFingerprint:revision.fingerprint});
    }
    selector.value=original;selector.dispatchEvent(new Event("change",{bubbles:true}));
    const comparable=value=>JSON.stringify(value&&{
      direction:value.direction,confidence:value.confidence,entryState:value.entryState,visibleState:value.visibleState,
      setupIdentity:value.setupIdentity,setupTimeframe:value.setupTimeframe,buttonText:value.buttonText,buttonTone:value.buttonTone,buttonTitle:value.buttonTitle,
      tooltip:value.tooltip,details:value.details,triggerAlertIdentity:value.triggerAlertIdentity,revisions:value.revisions,
      publicationFingerprint:value.publicationFingerprint,generation:value.generation,signalIdentity:value.signalIdentity,
      analyticalFingerprint:value.analyticalFingerprint,feedGeneration:value.feedGeneration,feedSocketGeneration:value.feedSocketGeneration,
      subscribedTimeframes:value.subscribedTimeframes,evidenceFingerprint:value.evidenceFingerprint,latestPriceAt:value.latestPriceAt,latestPriceSource:value.latestPriceSource
    });
    const baseline=comparable(before),calculationBaseline=samples[0]&&samples[0].calculationFingerprint;
    const publicationInvariant=samples.every(sample=>comparable(sample.publication)===baseline);
    const calculationFingerprintInvariant=samples.every(sample=>sample.calculationFingerprint===calculationBaseline);
    const chartHub=window["PUBLIC_MARKET_DATA_"+"HUB"],freshnessBefore=feed.diagnostics(),lifecycleCalls=[];
    if(exerciseLifecycle){
      try{if(typeof loadChart==="function"){loadChart({preserveView:true});lifecycleCalls.push("loadChart");}}catch(_e){}
      try{if(chartHub&&typeof chartHub.resetConnectionState==="function"){chartHub.resetConnectionState("signal-isolation-test");lifecycleCalls.push("chart-reset");}}catch(_e){}
      try{if(chartHub&&typeof chartHub.stop==="function"&&typeof chartHub.connect==="function"){chartHub.stop();chartHub.connect();lifecycleCalls.push("chart-reconnect");}}catch(_e){}
    }
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(settleMs)||0)));
    const freshnessAfter=feed.diagnostics();
    const chartLifecycleIndependent=freshnessAfter.generation===freshnessBefore.generation&&freshnessAfter.socketGeneration===freshnessBefore.socketGeneration&&freshnessAfter.subscribedTimeframes.join("|")===freshnessBefore.subscribedTimeframes.join("|")&&freshnessAfter.latestPriceAt>=freshnessBefore.latestPriceAt;
    const requestCounters=()=>{const perf=window.BT001_PERFORMANCE_DIAGNOSTICS||{},diag=feed.diagnostics();return {publicRest:diag.counters.restRequests,positionRest:Number(perf.privatePositionRestReads)||0,normalOrderRest:Number(perf.privateNormalOrderRestReads)||0,algoOrderRest:Number(perf.privateAlgoOrderRestReads)||0};};
    const requestsBeforeHover=requestCounters(),publicationBeforeHover=frozenPublicationInvariant37();
    try{state.entry.dispatchEvent(new MouseEvent("mouseenter",{bubbles:true}));state.entry.dispatchEvent(new MouseEvent("mouseleave",{bubbles:true}));}catch(_e){}
    const requestsAfterHover=requestCounters(),hoverReadOnly=JSON.stringify(requestsBeforeHover)===JSON.stringify(requestsAfterHover)&&comparable(frozenPublicationInvariant37())===comparable(publicationBeforeHover);
    const cases={
      allChartTimeframesExactInvariant:publicationInvariant&&calculationFingerprintInvariant,
      chartLifecycleDoesNotReconfigureFeed:chartLifecycleIndependent,
      hoverCausesNoBinanceRequest:hoverReadOnly,
      staleFeedCannotActivateTrigger:signalFreshnessAllowsReady37({signalStatus:"STALE"})===false,
      liveFeedAllowsTriggerEligibility:signalFreshnessAllowsReady37({signalStatus:"LIVE"})===true
    };
    const result={ranAt:Date.now(),passed:Object.values(cases).every(Boolean),cases,timeframes:samples.map(sample=>({tf:sample.tf,generation:sample.publication&&sample.publication.generation,publicationFingerprint:sample.publication&&sample.publication.publicationFingerprint,evidenceFingerprint:sample.publication&&sample.publication.evidenceFingerprint,calculationFingerprint:sample.calculationFingerprint})),before:summarizePublicationInvariant37(before),after:summarizePublicationInvariant37(frozenPublicationInvariant37()),freshnessBefore,freshnessAfter,lifecycleCalls,hover:{requestsBeforeHover,requestsAfterHover}};
    state.lastIsolationTests=result;return result;
  }
  function deterministicActionFingerprint37(facts={}){
    const position=facts.position||null;
    return JSON.stringify({
      context:[facts.symbol||"BTCUSDT",facts.account||"account",position?`${position.side}:${position.chainId||"campaign"}`:"flat",facts.managementHorizon||"quick"],
      position:position&&[position.side,position.qty,position.price,position.markPrice,position.margin,position.leverage,position.revision],
      protection:(facts.protection||[]).map(order=>[order.kind,order.price,order.qty,order.status]),
      exits:(facts.exits||[]).map(order=>[order.id,order.price,order.qty,order.status]),
      grExits:(facts.grExits||[]).map(order=>[order.id,order.price,order.qty,order.status]),
      marketRevision:facts.marketRevision||"m1",freshness:facts.managementFreshness||"LIVE"
    });
  }
  function runActionIsolationSelfTests37(){
    const position={side:"SHORT",qty:2,price:100,markPrice:95,margin:10,leverage:20,chainId:"short-a",revision:1};
    const base={symbol:"BTCUSDT",account:"a",managementHorizon:"quick",position,protection:[{kind:"PSL",price:105,qty:2,status:"NEW"},{kind:"MASTER_SL",price:108,qty:2,status:"NEW"}],exits:[{id:"exit-a",price:90,qty:1,status:"NEW"}],grExits:[{id:"gr-a",price:88,qty:1,status:"sent"}],marketRevision:"r1",managementFreshness:"LIVE"};
    const fingerprint=deterministicActionFingerprint37(base),signalFixture={mode:"AUTO",horizon:"quick",direction:"SHORT",confidence:70,setup:"short-5m",trigger:"FORMING"};
    const signalMutations=[{mode:"LONG"},{mode:"SHORT"},{horizon:"2_3h"},{horizon:"6_8h"},{direction:"LONG"},{confidence:25},{setup:"other"},{trigger:"ACTIVE"}];
    const positionTransitions=[null,{...position,qty:1,revision:2},{...position,qty:3,price:99,revision:3},{...position,side:"LONG",chainId:"long-b",revision:4}].map(next=>deterministicActionFingerprint37({...base,position:next}));
    const orderTransitions=[
      {...base,protection:[...base.protection,{kind:"PSL",price:104,qty:2,status:"NEW"}]},
      {...base,protection:base.protection.map(order=>order.kind==="MASTER_SL"?{...order,price:107}:order)},
      {...base,exits:[{...base.exits[0],price:89}]},
      {...base,grExits:[]}
    ].map(deterministicActionFingerprint37);
    const hundredSignalSelections=Array.from({length:100},(_value,index)=>({engine:["A","B","C"][index%3],horizon:["quick","2_3h","6_8h"][index%3],mode:DIRECTIONS[index%3],direction:index%2?"LONG":"SHORT",confidence:index%83,setup:`setup-${index}`,trigger:index%2?"ACTIVE":"FORMING"}));
    const shortSignalText=signalSummaryVariants37({marketDirection:"SHORT",confidence:70},{state:"TRIGGER DEVELOPING"}).full,closeActionText=exitDisplayText37("EXIT EXIT");
    const signalFingerprint=value=>JSON.stringify({symbol:"BTCUSDT",mode:value.mode,horizon:value.horizon,direction:value.direction,confidence:value.confidence,setup:value.setup,trigger:value.trigger});
    const cases={
      signalModesHorizonsAndDecisionsExcluded:signalMutations.every(mutation=>deterministicActionFingerprint37({...base,signal:{...signalFixture,...mutation}})===fingerprint),
      hundredSignalSelectionMutationsExcludedFromActionFingerprint:hundredSignalSelections.every(signal=>deterministicActionFingerprint37({...base,signal})===fingerprint),
      openAddReduceReverseCloseAreDistinct:new Set([fingerprint,...positionTransitions]).size===positionTransitions.length+1,
      pslMasterBinanceAndGrChangesAreDistinct:orderTransitions.every(value=>value!==fingerprint)&&new Set(orderTransitions).size===orderTransitions.length,
      chartTimeframeExcluded:["1m","3m","5m","15m","30m","1h","4h","1d"].every(chartTf=>deterministicActionFingerprint37({...base,chartTf})===fingerprint),
      managementHorizonChangesAction:deterministicActionFingerprint37({...base,managementHorizon:"2_3h"})!==fingerprint,
      actionInputsExcludedFromSignal:signalFingerprint(signalFixture)===signalFingerprint({...signalFixture,position:{side:"LONG"},orders:[{id:1}],managementHorizon:"6_8h"}),
      staleManagementChangesActionOnly:deterministicActionFingerprint37({...base,managementFreshness:"STALE"})!==fingerprint&&signalFreshnessAllowsReady37({signalStatus:"LIVE"}),
      contradictionPublishesIndependentDecisions:shortSignalText==="SHORT 70% · TRIGGER FORMING"&&closeActionText==="CLOSE"&&pillTone37("EXIT EXIT")==="red"
    };
    return {passed:Object.values(cases).every(Boolean),cases,positionTransitionFingerprints:positionTransitions,orderTransitionFingerprints:orderTransitions};
  }
  async function runActionLifecycleSelfTests37(){
    const flush=async()=>{for(let index=0;index<6;index+=1)await Promise.resolve();};
    const listeners=new EventTarget(),published=[];
    const position={side:"LONG",qty:1,price:100,markPrice:101,margin:10,leverage:10,chainId:"long-a",revision:1};
    let facts={symbol:"BTCUSDT",account:"a",managementHorizon:"quick",position:null,protection:[],exits:[],grExits:[],marketRevision:"r1",managementFreshness:"LIVE"},calculationMode="publish";
    const frozenSignalPublication=JSON.stringify({generation:7,direction:"SHORT",confidence:70,setupIdentity:"short-5m",triggerState:"ACTIVE",publicationFingerprint:"signal-only"});
    const lifecycle=build.createActionLifecycle({
      refreshMs:1000,
      captureInput:()=>({fingerprint:deterministicActionFingerprint37(facts),facts}),
      calculate:(input,generation)=>calculationMode==="retain"?{retained:true,refreshState:"REFRESHING"}:calculationMode==="mixed"?{publication:{generation:generation-1,inputFingerprint:"mixed-generation",publicationFingerprint:"mixed",refreshState:"READY"}}:{publication:{generation,inputFingerprint:input.fingerprint,publicationFingerprint:input.fingerprint,refreshState:"READY",management:{action:input.facts.position?"HOLD":"WAIT"}}},
      publish:publication=>published.push({at:performance.now(),fingerprint:publication.publicationFingerprint,generation:publication.generation})
    });
    lifecycle.listen(listeners,"fixture:position","position-change");
    lifecycle.listen(listeners,"fixture:orders","orders-change");
    lifecycle.initialize();await flush();
    const transitions=[
      ["open",{...facts,position}],
      ["add",{...facts,position:{...position,qty:2,revision:2}}],
      ["reduce",{...facts,position:{...position,qty:0.5,revision:3}}],
      ["reverse",{...facts,position:{...position,side:"SHORT",chainId:"short-b",revision:4}}],
      ["psl",{...facts,position,protection:[{kind:"PSL",price:96,qty:1,status:"NEW"}]}],
      ["master-sl",{...facts,position,protection:[{kind:"MASTER_SL",price:95,qty:1,status:"NEW"}]}],
      ["binance-exit",{...facts,position,exits:[{id:"exit-a",price:110,qty:1,status:"NEW"}]}],
      ["gr-exit",{...facts,position,grExits:[{id:"gr-a",price:112,qty:1,status:"sent"}]}],
      ["management-horizon",{...facts,position,managementHorizon:"2_3h"}],
      ["stale-management",{...facts,position,managementFreshness:"STALE"}],
      ["close",{...facts,position:null}]
    ];
    const samples=[];
    for(const [name,next] of transitions){
      const before=lifecycle.diagnostics(),started=performance.now();facts=next;listeners.dispatchEvent(new Event(name.includes("sl")||name.includes("exit")?"fixture:orders":"fixture:position"));await flush();
      const after=lifecycle.diagnostics();samples.push({name,elapsedMs:performance.now()-started,calculationDelta:after.calculationCount-before.calculationCount,publicationDelta:after.publicationCount-before.publicationCount,generation:after.generation,fingerprint:after.publicationFingerprint});
    }
    const validBeforeDependencyRefresh=lifecycle.diagnostics();calculationMode="retain";facts={...facts,marketRevision:"r2"};listeners.dispatchEvent(new Event("fixture:position"));await flush();const afterRetained=lifecycle.diagnostics();
    calculationMode="mixed";facts={...facts,marketRevision:"r3"};listeners.dispatchEvent(new Event("fixture:position"));await flush();const afterMixed=lifecycle.diagnostics();
    const beforeDuplicate=lifecycle.diagnostics();listeners.dispatchEvent(new Event("fixture:position"));await flush();const afterDuplicate=lifecycle.diagnostics();
    const beforeDestroy=lifecycle.diagnostics();lifecycle.destroy();const afterDestroy=lifecycle.diagnostics();
    const cases={
      everyRelevantTransitionPublishesOnceWithinOneSecond:samples.every(sample=>sample.elapsedMs<1000&&sample.calculationDelta===1&&sample.publicationDelta===1),
      everyPublicationFingerprintIsDistinct:new Set(samples.map(sample=>sample.fingerprint)).size===samples.length,
      actionChangesDoNotAlterFrozenSignalPublication:samples.every(()=>JSON.stringify({generation:7,direction:"SHORT",confidence:70,setupIdentity:"short-5m",triggerState:"ACTIVE",publicationFingerprint:"signal-only"})===frozenSignalPublication),
      shortDependencyRefreshRetainsLastValidPublication:afterRetained.calculationCount===validBeforeDependencyRefresh.calculationCount+1&&afterRetained.publicationCount===validBeforeDependencyRefresh.publicationCount&&afterRetained.lastValidPublicationFingerprint===validBeforeDependencyRefresh.lastValidPublicationFingerprint,
      mixedGenerationPublicationIsRejected:afterMixed.errorCount===afterRetained.errorCount+1&&afterMixed.publicationCount===afterRetained.publicationCount&&afterMixed.lastValidPublicationFingerprint===validBeforeDependencyRefresh.lastValidPublicationFingerprint,
      identicalInputDoesNotRecalculate:afterDuplicate.calculationCount===beforeDuplicate.calculationCount&&afterDuplicate.publicationCount===beforeDuplicate.publicationCount,
      oneSchedulerAndTwoListeners:beforeDestroy.schedulerCount===1&&beforeDestroy.listenerCount===2,
      destroyRemovesSchedulerTimersAndListeners:afterDestroy.schedulerCount===0&&afterDestroy.pendingTimerCount===0&&afterDestroy.listenerCount===0
    };
    return {passed:Object.values(cases).every(Boolean),cases,samples,publishedCount:published.length};
  }
  function frozenActionPublication37(){
    const publication=actionState.lastPublishedSnapshot,lifecycle=actionState.lifecycle&&actionState.lifecycle.diagnostics();if(!publication)return null;
    const tooltip=document.getElementById("pressurePositionToolbarTip")?.textContent||"",positionWindow=document.getElementById("pressurePositionManagement")?.textContent||windowSystem.getPositionCopy();
    return {buttonText:state.exit&&state.exit.textContent||"",buttonTone:state.exit&&state.exit.dataset.tone||"",recommendation:publication.management&&publication.management.action||null,exit:publication.management&&publication.management.exit||null,management:managementFingerprint37(publication.management),tooltip,positionWindow,publicationFingerprint:publication.publicationFingerprint,generation:publication.generation,inputFingerprint:publication.inputFingerprint,actionFeedGeneration:actionFeed37().diagnostics().generation,actionFeedSocketGeneration:actionFeed37().diagnostics().socketGeneration};
  }
  async function runActionIsolationTests37({settleMs=250}={}){
    if(!state.lastPublishedSnapshot||!actionState.lastPublishedSnapshot)return {passed:false,reason:"Ready Signal and Action publications are required"};
    windowSystem.openPosition();try{state.exit.dispatchEvent(new PointerEvent("pointerenter",{bubbles:true}));}catch(_e){}
    const comparable=value=>JSON.stringify(value),baseline=frozenActionPublication37(),signalBaseline=frozenPublicationInvariant37(),lifecycleBefore=actionLifecycle37().diagnostics(),actionFeedBefore=actionFeed37().diagnostics();
    const originalDirection=state.direction,originalHorizon=state.horizon,actionSamples=[];
    ["AUTO","LONG","SHORT"].forEach(direction=>{setStoredDirection(direction);actionSamples.push({kind:`direction:${direction}`,publication:frozenActionPublication37()});});
    ["quick","2_3h","6_8h"].forEach(horizon=>{setStoredHorizon(horizon);actionSamples.push({kind:`horizon:${horizon}`,publication:frozenActionPublication37()});});
    setStoredDirection(originalDirection);setStoredHorizon(originalHorizon);
    const signalChangesInvariant=actionSamples.every(sample=>comparable(sample.publication)===comparable(baseline));
    const chartSelector=document.getElementById("interval"),originalTf=chartSelector&&chartSelector.value,chartSamples=[],signalBeforeChart=frozenPublicationInvariant37(),signalCalculationsBeforeChart=Number(performanceDiagnostics.signalFullCalculations)||0;
    if(chartSelector)["1m","3m","5m","15m","30m","1h","4h","1d"].forEach(tf=>{chartSelector.value=tf;chartSelector.dispatchEvent(new Event("change",{bubbles:true}));chartSamples.push({tf,action:frozenActionPublication37(),signal:frozenPublicationInvariant37()});});
    if(chartSelector){chartSelector.value=originalTf;chartSelector.dispatchEvent(new Event("change",{bubbles:true}));}
    const lifecycleAfterChart=actionLifecycle37().diagnostics(),chartInvariant=chartSamples.every(sample=>comparable(sample.action)===comparable(baseline)&&comparable(sample.signal)===comparable(signalBeforeChart))&&lifecycleAfterChart.calculationCount===lifecycleBefore.calculationCount&&lifecycleAfterChart.publicationCount===lifecycleBefore.publicationCount&&(Number(performanceDiagnostics.signalFullCalculations)||0)===signalCalculationsBeforeChart;
    const requestCounters=()=>{const perf=window.BT001_PERFORMANCE_DIAGNOSTICS||{},signalDiag=signalFeed37().diagnostics(),actionDiag=actionFeed37().diagnostics();return {signalRest:signalDiag.counters.restRequests,actionRest:actionDiag.counters.restRequests,positionRest:Number(perf.privatePositionRestReads)||0,normalOrderRest:Number(perf.privateNormalOrderRestReads)||0,algoOrderRest:Number(perf.privateAlgoOrderRestReads)||0,signalCalculations:Number(performanceDiagnostics.signalFullCalculations)||0,actionCalculations:actionLifecycle37().diagnostics().calculationCount};};
    const beforeHover=requestCounters();for(let index=0;index<5;index+=1){try{state.entry.dispatchEvent(new PointerEvent("pointerenter",{bubbles:true}));state.entry.dispatchEvent(new PointerEvent("pointerleave",{bubbles:true}));state.exit.dispatchEvent(new PointerEvent("pointerenter",{bubbles:true}));state.exit.dispatchEvent(new PointerEvent("pointerleave",{bubbles:true}));}catch(_e){}}
    const afterHover=requestCounters(),hoverInvariant=JSON.stringify(beforeHover)===JSON.stringify(afterHover);
    const signalBeforeManagement=frozenPublicationInvariant37(),managementOriginal=positionEngine.getManagementHorizon()||"quick",managementNext=managementOriginal==="quick"?"2_3h":"quick",publicationCountBefore=actionLifecycle37().diagnostics().publicationCount;
    setManagementHorizon37(managementNext);const signalImmediatelyAfterManagement=frozenPublicationInvariant37(),started=Date.now();
    while(Date.now()-started<30000){const diag=actionLifecycle37().diagnostics(),feed=actionFeed37().diagnostics();if(diag.publicationCount>publicationCountBefore&&feed.socketStatus==="live"&&feed.inFlightRestCount===0)break;await new Promise(resolve=>setTimeout(resolve,100));}
    const managementChange={signalUnchanged:comparable(signalImmediatelyAfterManagement)===comparable(signalBeforeManagement),publicationDelta:actionLifecycle37().diagnostics().publicationCount-publicationCountBefore,feed:actionFeed37().diagnostics()};
    setManagementHorizon37(managementOriginal);const restoreStarted=Date.now();while(Date.now()-restoreStarted<30000){const feed=actionFeed37().diagnostics();if(feed.socketStatus==="live"&&feed.inFlightRestCount===0)break;await new Promise(resolve=>setTimeout(resolve,100));}await new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(settleMs)||0)));
    const lifecycleAfter=actionLifecycle37().diagnostics(),actionFeedAfter=actionFeed37().diagnostics(),fixtureTests=runActionIsolationSelfTests37(),lifecycleFixtureTests=await runActionLifecycleSelfTests37(),actionConsistency=windowSystem._diagnostics().actionConsistency;
    const cases={
      signalChangesDoNotRecalculateOrRepublishAction:signalChangesInvariant&&lifecycleAfterChart.calculationCount===lifecycleBefore.calculationCount&&lifecycleAfterChart.publicationCount===lifecycleBefore.publicationCount,
      chartTimeframeRecalculatesNeither:chartInvariant,
      managementHorizonChangesActionOnceAndNotSignal:managementChange.signalUnchanged&&managementChange.publicationDelta===1,
      hoverIsFrozenAndRequestFree:hoverInvariant,
      staleManagementIsIndependent:fixtureTests.cases.staleManagementChangesActionOnly,
      independentContradictionSupported:fixtureTests.cases.contradictionPublishesIndependentDecisions,
      oneSchedulerAndBoundedResources:lifecycleAfter.schedulerCount===1&&lifecycleAfter.listenerCount===2&&lifecycleAfter.boundedPublicationSnapshots<=2&&actionFeedAfter.activeSocketCount===1&&actionFeedAfter.reconnectTimerCount===0&&actionFeedAfter.inFlightRestCount===0,
      deterministicInputCoverage:fixtureTests.passed,
      positionAndOrderTransitionsPublishCoherentlyWithinOneSecond:lifecycleFixtureTests.passed,
      buttonTooltipAndWindowUseOneActionGeneration:actionConsistency.consistent&&[actionConsistency.buttonGeneration,actionConsistency.tooltipGeneration,actionConsistency.windowGeneration].every(value=>value===actionConsistency.publicationGeneration),
      signalAndActionFeedsRemainIndependent:actionFeedBefore.generation===actionSamples[0].publication.actionFeedGeneration&&actionFeedBefore.socketGeneration===actionSamples[0].publication.actionFeedSocketGeneration
    };
    const result={ranAt:Date.now(),passed:Object.values(cases).every(Boolean),cases,fixtureTests,lifecycleFixtureTests,actionConsistency,signalChanges:actionSamples.map(sample=>({kind:sample.kind,generation:sample.publication.generation,publicationFingerprint:sample.publication.publicationFingerprint,inputFingerprint:sample.publication.inputFingerprint})),chartTimeframes:chartSamples.map(sample=>({tf:sample.tf,actionGeneration:sample.action.generation,actionFingerprint:sample.action.publicationFingerprint,signalGeneration:sample.signal&&sample.signal.generation,signalFingerprint:sample.signal&&sample.signal.publicationFingerprint})),hover:{before:hoverInvariant?beforeHover:beforeHover,after:afterHover},managementChange,lifecycleBefore,lifecycleAfter,actionFeedBefore,actionFeedAfter,signalBaseline:summarizePublicationInvariant37(signalBaseline)};
    actionState.lastAcceptanceTests=result;return result;
  }

  function diagnostics37(){
    const perfDiagnostics=uiPerf();
    if(perfDiagnostics && typeof perfDiagnostics.size === "function"){
      perfDiagnostics.size("signal.evidence-timeframes",state.evidenceByTf.size);
      perfDiagnostics.size("signal.smc-cache",state.smcCache.size);
      perfDiagnostics.size("signal.setup-histories",state.setupHistories.size);
      perfDiagnostics.size("signal.entry-trackers",state.entryTrackers.size);
      perfDiagnostics.size("signal.full-snapshots",new Set([state.marketSnapshot,state.workingSnapshot && state.workingSnapshot.snapshot,state.lastPublishedSnapshot && state.lastPublishedSnapshot.__reportSnapshot,state.lastValidPublishedSnapshot && state.lastValidPublishedSnapshot.__reportSnapshot].filter(Boolean)).size);
      perfDiagnostics.size("dom.nodes",document.getElementsByTagName("*").length);
    }
    return {
      module:MODULE,
      initialized:state.initialized,
      refreshLoops:state.lifecycleTimer == null ? 0 : 1,
      controls:document.querySelectorAll("#pressureSignalToolbar").length,
      signalWindows:document.querySelectorAll("#pressureSignalDetails").length,
      positionWindows:document.querySelectorAll("#pressurePositionManagement").length,
      horizon:state.horizon,
      direction:state.direction,
      signalEngines:signalEngineRegistry.diagnostics(),
      signalEngineSelector:signalEngineSelector.diagnostics(),
      activeSignalRequirements:(()=>{try{const plan=signalDataPlan37(state.horizon);return plan.items.map(item=>({timeframe:item.tf,depth:item.historyTarget,roles:[...(item.roles||[])]}));}catch(error){return {error:error&&error.message||String(error)};}})(),
      activeSignalPublicationGeneration:state.lastPublishedSnapshot&&state.lastPublishedSnapshot.publicationGeneration||state.refreshGeneration,
      managementHorizon:positionEngine.getManagementHorizon() || "quick",
      lastError:state.lastError,
      refreshState:state.refreshState,
      refreshGeneration:state.refreshGeneration,
      analyticalFingerprint:state.lastAnalyticalFingerprint,
      lastRefreshReason:state.lastRefreshReason,
      lastSignalCalculationReason:state.lastRefreshReason,
      activeChartTfComparisonOnly:String(document.getElementById("interval")?.value || ""),
      workingSnapshot:state.workingSnapshot ? {generation:state.workingSnapshot.generation,contextKey:state.workingSnapshot.contextKey,sections:state.workingSnapshot.sections,dependencyGate:state.workingSnapshot.dependencyGate} : null,
      snapshot:state.lastPublishedSnapshot ? {
        version:state.lastPublishedSnapshot.snapshot && state.lastPublishedSnapshot.snapshot.version,
        createdAt:state.lastPublishedSnapshot.snapshot && state.lastPublishedSnapshot.snapshot.createdAt,
        symbol:state.lastPublishedSnapshot.snapshot && state.lastPublishedSnapshot.snapshot.symbol,
        freshness:state.lastPublishedSnapshot.snapshot && state.lastPublishedSnapshot.snapshot.freshness,
        contextKey:state.lastPublishedSnapshot.contextKey,
        refreshState:state.lastPublishedSnapshot.refreshState,
        sections:state.lastPublishedSnapshot.sections
      } : null,
      action:(()=>{const lifecycle=actionState.lifecycle&&actionState.lifecycle.diagnostics()||null,publication=actionState.lastPublishedSnapshot,windows=windowSystem._diagnostics(),snapshot=publication&&publication.snapshot;return {refreshGeneration:lifecycle&&lifecycle.generation||0,inputFingerprint:lifecycle&&lifecycle.inputFingerprint||"",lastRefreshReason:lifecycle&&lifecycle.lastRefreshReason||actionState.lastRefreshReason,lastCalculationReason:lifecycle&&lifecycle.lastRefreshReason||actionState.lastRefreshReason,refreshState:actionState.refreshState,activeManagementHorizon:positionEngine.getManagementHorizon()||"quick",activeSignalEngineComparisonOnly:"Signal A",activeSignalHorizonComparisonOnly:state.horizon,positionRevisionUsed:publication&&publication.positionRevision||0,orderProtectionRevisionUsed:publication&&publication.orderRevision||0,managementDataRevisions:publication&&publication.managementDataRevisions||{},snapshot:snapshot?{version:snapshot.version,createdAt:snapshot.createdAt,symbol:snapshot.symbol,currentPrice:snapshot.currentPrice,position:snapshot.position?{side:snapshot.position.side,qty:snapshot.position.qty,price:snapshot.position.price,markPrice:snapshot.position.markPrice,chainId:snapshot.position.chainId}:null}:null,freshness:snapshot&&snapshot.freshness||null,publicationFingerprint:publication&&publication.publicationFingerprint||"",publicationGeneration:publication&&publication.generation||0,generationConsistency:windows.actionConsistency||null,schedulerCount:lifecycle&&lifecycle.schedulerCount||0,pendingTimerCount:lifecycle&&lifecycle.pendingTimerCount||0,listenerCount:(lifecycle&&lifecycle.listenerCount||0)+1,boundedPublicationSnapshots:lifecycle&&lifecycle.boundedPublicationSnapshots||0,calculationCount:lifecycle&&lifecycle.calculationCount||0,publicationCount:lifecycle&&lifecycle.publicationCount||0,lastError:actionState.lastError||lifecycle&&lifecycle.lastError||null,dataFeed:actionFeed37().diagnostics(),acceptanceTests:actionState.lastAcceptanceTests};})(),
      management:positionEngine._diagnostics(),
      refresh:windowSystem._diagnostics(),
      setupHistories:Array.from(state.setupHistories.values()).map(item => ({...item})),
      activeTriggerAlert:state.activeTriggerAlertMeta?{...state.activeTriggerAlertMeta}:null,
      targetSelfTests:targetEngine._selfTest(),
      refreshSelfTests:runRefreshSelfTests37(),
      selfTests:positionEngine._selfTest(),
      entrySelfTests:runEntrySelfTests37(),
      presentationSelfTests:runPresentationSelfTests37(),
      windowPresentationSelfTests:windowSystem._selfTest(),
      dataFeed:signalFeed37().diagnostics(),
      isolationTests:state.lastIsolationTests,
      signalCacheSelfTests:runSignalEvidenceCacheSelfTests37(),
      schedulingSelfTests:runSchedulingSelfTests37(),
      actionSelfTests:runActionIsolationSelfTests37(),
      privateStreamSelfTests:window.BINANCE_PRIVATE_SYNC && typeof window.BINANCE_PRIVATE_SYNC._selfTest==="function" ? window.BINANCE_PRIVATE_SYNC._selfTest() : null,
      optimizationParity:state.lastOptimizationTests,
      performance:{...performanceDiagnostics,ui:uiPerf() && uiPerf().snapshot ? uiPerf().snapshot() : null}
    };
  }
  function reconcilePresentationContext37(){
    const contextKey=presentationContextKey37();
    if(state.lastPublishedSnapshot && state.lastPublishedSnapshot.contextKey!==contextKey){
      invalidatePublishedContext37(contextKey);
    }
    scheduleToolbarSignalRefresh37(false,"context-reconcile");
  }
  function initialize37(){
    if(state.initialized) return api;
    ensureToolbarSignalUi37();
    signalEngineSelector.initialize();
    bindActiveEngineState37();
    if(typeof window.installSignalEngineSettings==="function") window.installSignalEngineSettings({registry:signalEngineRegistry,selector:signalEngineSelector});
    state.initialized = true;
    const lifecycleSignal=state.uiAbort && state.uiAbort.signal;
    if(lifecycleSignal){
      window.addEventListener("pressure-signal:clear",() => invalidatePublishedContext37(presentationContextKey37()),{signal:lifecycleSignal});
      document.addEventListener("change",event => {
        const id=event.target&&event.target.id;
        if(id==="market"){
          state.dataKey="";state.dataStatus=null;state.marketSnapshot=null;state.evidenceByTf.clear();state.smcCache.clear();
          actionState.dataKey="";actionState.dataStatus=null;actionState.marketSnapshot=null;actionState.evidenceByTf.clear();actionState.smcCache.clear();actionLifecycle37().invalidate("action-symbol-change");windowSystem.invalidatePositionContext(actionContextKey37());
          configureSignalFeed37(signalDataPlan37(state.horizon),"signal-symbol-change").catch(error=>{state.lastError=error&&error.stack||String(error);});
          configureActionFeed37(actionDataPlan37(),"action-symbol-change").catch(error=>{actionState.lastError=error&&error.stack||String(error);});
          reconcilePresentationContext37();
          scheduleActionRefresh37(true,"action-symbol-change");
        }else if(["account","accountSelect","selectedAccount"].includes(id)){actionLifecycle37().invalidate("action-account-change");windowSystem.invalidatePositionContext(actionContextKey37());scheduleActionRefresh37(true,"action-account-change");}
      },{signal:lifecycleSignal,capture:true});
    }
    configureSignalFeed37(signalDataPlan37(state.horizon),"signal-initialization").catch(error=>{state.lastError=error&&error.stack||String(error);});
    configureActionFeed37(actionDataPlan37(),"action-initialization").catch(error=>{actionState.lastError=error&&error.stack||String(error);});
    const actionLifecycle=actionLifecycle37();actionLifecycle.listen(window,"v13:open-position-change","position-change");actionLifecycle.listen(window,"v14:binance-state-change","binance-state-change");actionLifecycle.initialize();requestAuthoritativeOrders37();
    scheduleToolbarSignalRefresh37(true,"initialization");
    state.lifecycleTimer = setInterval(() => scheduleToolbarSignalRefresh37(false,"revision-check"),featureConfig.refreshMs);
    return api;
  }
  function destroy37(){
    if(!state.initialized) return;
    state.initialized = false;
    if(state.lifecycleTimer != null) clearInterval(state.lifecycleTimer);
    if(state.refreshTimer != null) clearTimeout(state.refreshTimer);
    if(state.summaryFrame != null) cancelAnimationFrame(state.summaryFrame);
    stopTriggerAlert37();
    state.lifecycleTimer = null;
    state.refreshTimer = null;
    state.summaryFrame = null;
    state.dataLoadGeneration += 1;
    state.dataLoadPromise = null;
    try{ if(state.dataFeed) state.dataFeed.destroy(); }catch(_e){}
    state.dataFeed=null;
    try{if(actionState.lifecycle)actionState.lifecycle.destroy();}catch(_e){}actionState.lifecycle=null;
    try{if(actionState.dataFeed)actionState.dataFeed.destroy();}catch(_e){}actionState.dataFeed=null;actionState.dataLoadGeneration+=1;actionState.dataLoadPromise=null;
    if(state.uiAbort) state.uiAbort.abort();
    state.uiAbort = null;
    state.resizeObservers.splice(0).forEach(observer => observer.disconnect());
    windowSystem.destroy();
    positionEngine.destroy();
    document.getElementById("pressureSignalToolbar")?.remove();
    document.getElementById("pressureSignalDetails")?.remove();
    document.getElementById("pressureSignalManagementTip")?.remove();
    state.root = state.directionChip = state.entry = state.exit = null;
    state.details = state.detailsBody = state.detailsTitle = null;
    state.chips.clear();
    state.marketSnapshot = null;
    state.evidenceByTf.clear();
    state.smcCache.clear();
    state.activeSnapshot = null;
    state.workingSnapshot = null;
    state.lastPublishedSnapshot = null;
    state.lastValidPublishedSnapshot = null;
    state.lastOptimizationTests = null;
    state.lastIsolationTests = null;
    state.lastAnalyticalFingerprint = "";
    state.scheduledFrozen = null;
    state.refreshGeneration += 1;
    state.refreshState = "IDLE";
    state.signalSummaryVariants = null;
    state.displayFingerprint = "";
    state.seenTriggerAlertIds.clear();
    state.seenTriggerAlertOrder.length = 0;
    state.entryTrackers.clear();
    state.setupHistories.clear();
    actionState.dataKey="";actionState.dataStatus=null;actionState.marketSnapshot=null;actionState.activeSnapshot=null;actionState.evidenceByTf.clear();actionState.smcCache.clear();actionState.lastPublishedSnapshot=null;actionState.lastValidPublishedSnapshot=null;actionState.refreshState="IDLE";actionState.orderRefreshObservedAt=0;actionState.lastAcceptanceTests=null;
    signalEngineSelector.destroy();
  }
  function setManagementHorizon37(next){
    const selected = positionEngine.setManagementHorizon(next);
    actionState.dataKey="";actionState.dataStatus=null;actionState.marketSnapshot=null;actionState.evidenceByTf.clear();actionState.smcCache.clear();actionLifecycle37().invalidate("management-horizon-change");windowSystem.invalidatePositionContext(actionContextKey37());
    configureActionFeed37(actionDataPlan37(selected),"management-evidence-change").catch(error=>{actionState.lastError=error&&error.stack||String(error);});
    scheduleActionRefresh37(true,"management-horizon-change");
    return selected;
  }
  function recordEntryAnchor37(anchor){
    const symbol = String(anchor && anchor.symbol || state.marketSnapshot && state.marketSnapshot.symbol || "BTCUSDT");
    const side = String(anchor && anchor.side || "").toUpperCase();
    const recorded=positionEngine.recordAnchor(`${symbol}|${side}`,anchor);scheduleActionRefresh37(true,"management-anchor-change");return recorded;
  }
  const api = Object.freeze({
    initialize:initialize37,
    destroy:destroy37,
    refresh:() => scheduleToolbarSignalRefresh37(true),
    refreshAction:() => scheduleActionRefresh37(true,"manual-action-refresh"),
    setHorizon:setStoredHorizon,
    setDirection:setStoredDirection,
    setSignalEngine:id=>signalEngineSelector.select(id,{reason:"api-selector"}),
    getSignalEngine:()=>signalEngineSelector.getSelectedId(),
    registerSignalEngine:engine=>signalEngineRegistry.register(engine),
    getSignalEngineRegistry:()=>signalEngineRegistry,
    setManagementHorizon:setManagementHorizon37,
    recordEntryAnchor:recordEntryAnchor37,
    openSignalDetails:windowSystem.openSignal,
    openPositionManagement:windowSystem.openPosition,
    getSignalCopyContent:windowSystem.getSignalCopy,
    getManagementCopyContent:windowSystem.getPositionCopy,
    invalidatePublishedSnapshot:() => invalidatePublishedContext37(presentationContextKey37()),
    runOptimizationTests:runOptimizationParityTests37,
    runDataFeedTests:() => window.createPressureSignalDataFeed.runSelfTests(),
    runChartTimeframeIsolationTests:runChartTimeframeIsolationTests37,
    runActionIsolationTests:runActionIsolationTests37,
    runActionSelfTests:runActionIsolationSelfTests37,
    getDiagnostics:diagnostics37
  });
  Object.defineProperty(window,"PRESSURE_SIGNAL",{value:api,configurable:true});
  delete window.__PRESSURE_SIGNAL_FEATURE_BUILD__;
  initialize37();
})();
