(() => {
  "use strict";
  const $=id=>document.getElementById(id),TAB_KEY="heatmap",SETTINGS_TAB_STORE="btc_futures_chart_v13_24_settings_tab";
  const statusText=status=>({NOT_LOADED:"NOT LOADED",REFRESH_REQUIRED:"REFRESH REQUIRED",STARTING_REQUEST:"STARTING ACTOR",LOADING:"LOADING",READY:"READY",UPDATE_FAILED:"UPDATE FAILED",UNAVAILABLE:"UNAVAILABLE"})[status]||status;
  const date=value=>value?new Date(value).toLocaleString():"--";
  const sourceDate=value=>Number.isFinite(Number(value))?new Date(Number(value)*1000).toLocaleString():"--";
  const elapsed=value=>{const total=Math.max(0,Math.floor((Number(value)||0)/1000));return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;};
  const text=(id,value)=>{const element=$(id);if(element)element.textContent=value==null||value===""?"--":String(value);};
  function manualRefresh(){return window.BT001HeatmapFeature.refresh();}
  function retryDatasetRetrieval(){return window.BT001HeatmapState.retryDatasetRetrieval();}
  function activateHeatmapTab(){const root=document.querySelector("#settingsModal .settings-grid.v24-settings-root, #settingsModal .settings-grid");if(!root)return false;root.querySelectorAll(".v24-settings-tab").forEach(button=>button.classList.toggle("active",button.dataset.tab===TAB_KEY));root.querySelectorAll(".v24-settings-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.tab===TAB_KEY));try{localStorage.setItem(SETTINGS_TAB_STORE,TAB_KEY);}catch(_error){}return true;}
  function ensureHeatmapPanel(){
    const grid=document.querySelector("#settingsModal .settings-grid");if(!grid)return null;
    const tabs=grid.querySelector(":scope > .v24-settings-tabs"),panelsRoot=grid.querySelector(":scope > .v24-settings-panels");
    if(!tabs||!panelsRoot)return {grid,panelGrid:grid};
    let tab=tabs.querySelector('.v24-settings-tab[data-tab="heatmap"]');
    if(!tab){tab=document.createElement("button");tab.type="button";tab.className="v24-settings-tab";tab.dataset.tab=TAB_KEY;tab.textContent="Heatmap";tabs.appendChild(tab);tab.addEventListener("click",activateHeatmapTab);}
    let panel=panelsRoot.querySelector('.v24-settings-panel[data-tab="heatmap"]');
    if(!panel){panel=document.createElement("div");panel.className="v24-settings-panel";panel.dataset.tab=TAB_KEY;const inner=document.createElement("div");inner.className="v24-settings-panel-grid";panel.appendChild(inner);panelsRoot.appendChild(panel);}
    return {grid,panel,panelGrid:panel.querySelector(".v24-settings-panel-grid")};
  }
  const CONTROL_ORDER=["liq","otf","orders"];
  let layoutFrame=0,layoutDiscoveryObserver=null,stackObserver=null,layoutResizeObserver=null,observedStackMetric=null,observedWrap=null,dprQuery=null;
  function ensureOverlayGroup(){
    const canvas=$("chart"),wrap=canvas&&canvas.parentElement;
    if(!wrap||!wrap.classList.contains("chart-wrap"))return null;
    let group=$("chartOverlayControlGroup");
    if(!group){group=document.createElement("div");group.id="chartOverlayControlGroup";group.className="chart-overlay-control-group";wrap.appendChild(group);}
    return group;
  }
  function orderOverlayControls(group){
    const desired=CONTROL_ORDER.map(role=>group.querySelector(`[data-chart-control="${role}"]`)).filter(Boolean);
    const current=Array.from(group.children).filter(control=>CONTROL_ORDER.includes(control.dataset.chartControl));
    if(current.length===desired.length&&current.every((control,index)=>control===desired[index]))return;
    desired.forEach(control=>group.appendChild(control));
  }
  function installLayoutObservers(){
    const group=ensureOverlayGroup(),canvas=$("chart"),wrap=canvas&&canvas.parentElement,metric=$("v33MAStackMetric");
    if(!group||!wrap)return;
    if(typeof ResizeObserver==="function"){
      if(!layoutResizeObserver)layoutResizeObserver=new ResizeObserver(scheduleOverlayAlignment);
      if(observedWrap!==wrap){if(observedWrap)layoutResizeObserver.unobserve(observedWrap);observedWrap=wrap;layoutResizeObserver.observe(wrap);}
      if(metric&&observedStackMetric!==metric){if(observedStackMetric)layoutResizeObserver.unobserve(observedStackMetric);observedStackMetric=metric;layoutResizeObserver.observe(metric);}
    }
    if(metric&&stackObserver&&stackObserver.__target!==metric){stackObserver.disconnect();stackObserver=null;}
    if(metric&&observedStackMetric!==metric)observedStackMetric=metric;
    if(metric&&!stackObserver&&typeof MutationObserver==="function"){
      stackObserver=new MutationObserver(scheduleOverlayAlignment);stackObserver.__target=metric;stackObserver.observe(metric,{childList:true,subtree:true,attributes:true,attributeFilter:["style","class"]});
    }
    if(!layoutDiscoveryObserver&&typeof MutationObserver==="function"&&document.body){
      layoutDiscoveryObserver=new MutationObserver(scheduleOverlayAlignment);layoutDiscoveryObserver.observe(document.body,{childList:true,subtree:true});
    }
  }
  function watchDevicePixelRatio(){
    if(typeof window.matchMedia!=="function")return;
    if(dprQuery){if(typeof dprQuery.removeEventListener==="function")dprQuery.removeEventListener("change",watchDevicePixelRatio);else if(typeof dprQuery.removeListener==="function")dprQuery.removeListener(watchDevicePixelRatio);}
    dprQuery=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
    if(typeof dprQuery.addEventListener==="function")dprQuery.addEventListener("change",watchDevicePixelRatio);else if(typeof dprQuery.addListener==="function")dprQuery.addListener(watchDevicePixelRatio);
    scheduleOverlayAlignment();
  }
  function alignOverlayGroup(){
    layoutFrame=0;
    const group=ensureOverlayGroup(),canvas=$("chart"),wrap=canvas&&canvas.parentElement,target=document.querySelector('.v33-ma-stack-box[data-tf="1D"]');
    if(!group||!wrap)return false;
    orderOverlayControls(group);installLayoutObservers();
    if(!target){group.classList.remove("is-aligned");return false;}
    try{
      const wrapRect=wrap.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
      if(!(targetRect.width>0)||!(targetRect.height>0)){group.classList.remove("is-aligned");return false;}
      group.style.right=Math.max(0,wrapRect.right-targetRect.right)+"px";
      group.classList.add("is-aligned");
      return true;
    }catch(_error){group.classList.remove("is-aligned");return false;}
  }
  function scheduleOverlayAlignment(){
    if(layoutFrame)return;
    layoutFrame=requestAnimationFrame(alignOverlayGroup);
  }
  function registerOverlayControl(control,role){
    const group=ensureOverlayGroup();
    if(!control||!group||!CONTROL_ORDER.includes(role))return false;
    control.dataset.chartControl=role;
    group.appendChild(control);orderOverlayControls(group);scheduleOverlayAlignment();return true;
  }
  window.BT001ChartOverlayControls=Object.freeze({register:registerOverlayControl,align:alignOverlayGroup,schedule:scheduleOverlayAlignment,group:ensureOverlayGroup,order:CONTROL_ORDER.slice()});
  let overlayObserver=null;
  function overlayToggle(){
    let button=$("heatmapOverlayToggle");if(button)return button;
    const canvas=$("chart"),wrap=canvas&&canvas.parentElement,orders=$("calcModuleOrdersToggle"),otf=$("calcModuleOtfToggle");if(!wrap||!wrap.classList.contains("chart-wrap")||!orders||!otf)return null;
    const group=ensureOverlayGroup();if(!group)return null;
    button=document.createElement("button");button.id="heatmapOverlayToggle";button.type="button";button.className="calc-module-orders-toggle heatmap-overlay-toggle is-off";button.textContent="LIQ";button.title="Show or hide liquidation heatmap";button.setAttribute("aria-label","Liquidation heatmap visibility");button.setAttribute("aria-pressed","false");
    registerOverlayControl(button,"liq");registerOverlayControl(otf,"otf");registerOverlayControl(orders,"orders");
    button.addEventListener("click",()=>{const state=window.BT001HeatmapState.snapshot();window.BT001HeatmapState.setPreference("enabled",!state.prefs.enabled);});
    if(overlayObserver){overlayObserver.disconnect();overlayObserver=null;}scheduleOverlayAlignment();return button;
  }
  function watchOverlayToggle(){
    if(overlayToggle()||overlayObserver||typeof MutationObserver!=="function"||!document.body)return;
    overlayObserver=new MutationObserver(()=>overlayToggle());overlayObserver.observe(document.body,{childList:true,subtree:true});
  }
  function settings(){
    const location=ensureHeatmapPanel();if(!location)return null;let card=$("heatmapSettingsCard");if(card){if(location.panelGrid&&card.parentNode!==location.panelGrid)location.panelGrid.appendChild(card);return card;}
    card=document.createElement("div");card.id="heatmapSettingsCard";card.className="settings-card heatmap-settings-card";
    card.innerHTML=`<div class="settings-card-title">Heatmap</div><div class="settings-card-desc">BTCUSDT liquidation levels shown as visual context only. Refresh is always manual.</div>
      <h4 class="heatmap-section-heading">Display</h4><div class="heatmap-settings-grid">
      <label><input id="heatmapEnabled" type="checkbox"> Enabled</label><label>Opacity <input id="heatmapOpacity" type="range" min="5" max="80"><output id="heatmapOpacityOut"></output></label>
      <label>Strength threshold <input id="heatmapStrength" type="range" min="0" max="100"><output id="heatmapStrengthOut"></output></label><label>Intensity mode <select id="heatmapMode"><option value="BALANCED">Balanced</option><option value="RAW">Raw</option></select></label>
      <label>Maximum clipping <input id="heatmapClipping" type="range" min="50" max="100"><output id="heatmapClippingOut"></output></label><label><input id="heatmapSmoothing" type="checkbox"> Cell smoothing</label>
      <label><input id="heatmapLegend" type="checkbox"> Show legend</label><label><input id="heatmapSourceLabel" type="checkbox"> Show source label</label></div>
      <h4 class="heatmap-section-heading">Source</h4><div class="heatmap-settings-grid"><span>Source market</span><strong>BTCUSDT (read-only)</strong><label>Selected duration <select id="heatmapDuration">${window.BT001HeatmapState.DURATIONS.map(value=>`<option>${value}</option>`).join("")}</select></label><span>Displayed duration</span><strong id="heatmapDisplayed">--</strong></div>
      <div class="heatmap-provider-section"><h4>Provider</h4><div class="heatmap-provider-grid">
      <label for="heatmapProviderSecret">Apify API key</label><input id="heatmapProviderSecret" type="password" autocomplete="new-password" spellcheck="false" placeholder="Paste key, then Save">
      <span>Key status</span><strong id="heatmapProviderKeyStatus">NOT CONFIGURED</strong><span>Actor identifier</span><strong>api_merge/coinank-liquidation-heatmap</strong><span>Connection test</span><span id="heatmapProviderTestResult">Not tested</span></div>
      <div class="heatmap-provider-actions"><button id="heatmapProviderSave" type="button">Save key</button><button id="heatmapProviderClear" type="button" class="secondary">Clear key</button><button id="heatmapProviderTest" type="button" class="secondary">Test connection</button></div><div class="heatmap-provider-note">Prototype only: stored locally in this browser after explicit Save. The field is never pre-populated.</div></div>
      <h4 class="heatmap-section-heading">Request and dataset</h4><div class="heatmap-settings-grid">
      <span>Status</span><strong id="heatmapStatus">NOT LOADED</strong><span>Exact stage</span><strong id="heatmapStage">NOT LOADED</strong><span>Failure reason</span><span id="heatmapReason">--</span><span>HTTP status</span><span id="heatmapHttpStatus">--</span>
      <span>Actor status</span><span id="heatmapRunStatus">--</span><span>Actor run ID</span><span id="heatmapRunId">--</span><span>Actor request started</span><span id="heatmapActorStarted">--</span><span>Actor completed</span><span id="heatmapActorCompleted">--</span><span>Actor duration</span><span id="heatmapRunDuration">--</span>
      <span>Dataset ID available</span><span id="heatmapDatasetIdAvailable">No</span><span>Dataset retrieval</span><span id="heatmapDatasetRetrieval">NOT REQUESTED</span><span>Last provider stage</span><span id="heatmapLastProviderStage">--</span><span>Failed stage</span><span id="heatmapFailedStage">--</span>
      <span>Raw payload cached</span><span id="heatmapRawCached">No</span><span>Parsed object cached</span><span id="heatmapParsedCached">No</span><span>Normalized data cached</span><span id="heatmapNormalizedCached">No</span><span>Heatmap object found</span><span id="heatmapObjectFound">--</span><span>Current attempt started</span><span id="heatmapRequestStarted">--</span><span>Elapsed</span><span id="heatmapElapsed">00:00</span><span>Timeout</span><span id="heatmapTimeout">--</span>
      <span>Last successful update</span><span id="heatmapLastUpdate">--</span><span>Dataset start</span><span id="heatmapDatasetStart">--</span><span>Dataset end</span><span id="heatmapDatasetEnd">--</span><span>Source chart interval</span><span id="heatmapInterval">--</span><span>Source price step</span><span id="heatmapPriceStep">--</span>
      <span>Raw dataset items</span><span id="heatmapRawItems">0</span><span>Raw indexed cells</span><span id="heatmapRawCells">0</span><span>Valid cells</span><span id="heatmapValidCells">0</span><span>Normalized cells</span><span id="heatmapNormalizedCells">0</span><span>Rejected cells</span><span id="heatmapRejectedCells">0</span><span>Timestamp unit</span><span id="heatmapTimestampUnit">--</span>
      <span>Visible time / price cells</span><span id="heatmapVisibleAxisCells">0 / 0</span><span>Visible cells</span><span id="heatmapVisibleCells">0</span><span>Drawn cells</span><span id="heatmapDrawnCells">0</span><span>Zero-draw diagnostic</span><span id="heatmapZeroDraw">No dataset loaded</span><span>Displaying</span><span id="heatmapDisplaying">No dataset</span>
      <span>Canvas CSS / backing</span><span id="heatmapCanvasSize">--</span><span>Plot rectangle</span><span id="heatmapPlotRect">--</span><span>Layer insertion</span><span id="heatmapLayer">--</span><span>Parsed object</span><span id="heatmapSelectedObject">--</span><span>Payload structure</span><span id="heatmapPayloadStructure">--</span><span>Decoded JSON paths</span><span id="heatmapDecodedPaths">none</span><span>Inspected candidates</span><span id="heatmapCandidatePaths">none</span><span>Required / missing fields</span><span id="heatmapFields">--</span><span>Rejection summary</span><span id="heatmapRejections">--</span></div>
      <div class="heatmap-fixed"><span>Automatic refresh: OFF</span><span>Refresh on app load: OFF</span><span>Refresh on enable: OFF</span><span>Refresh on duration change: OFF</span><span>Chart timeframe controls duration: OFF</span><span>Retain previous dataset during refresh: ON</span></div>
      <div class="heatmap-settings-actions"><button id="heatmapSettingsRefresh" type="button">Refresh BTCUSDT heatmap</button><button id="heatmapRetryDataset" type="button" class="secondary hidden">Retry dataset retrieval</button></div>`;
    location.panelGrid.appendChild(card);
    const bind=(id,name,event="change",readValue=element=>element.type==="checkbox"?element.checked:element.value)=>$(id).addEventListener(event,()=>window.BT001HeatmapState.setPreference(name,readValue($(id))));
    bind("heatmapEnabled","enabled");bind("heatmapOpacity","opacity","input",element=>Number(element.value));bind("heatmapStrength","strength","input",element=>Number(element.value));bind("heatmapMode","mode");bind("heatmapClipping","maxClipping","input",element=>Number(element.value));bind("heatmapSmoothing","smoothing");bind("heatmapLegend","showLegend");bind("heatmapSourceLabel","showSourceLabel");bind("heatmapDuration","selectedDuration");
    $("heatmapProviderSave").addEventListener("click",()=>{const input=$("heatmapProviderSecret"),saved=window.BT001HeatmapAuth.saveFromInput(input);text("heatmapProviderTestResult",saved?"Saved locally":"Enter an API key before saving");if(!saved)input.focus();});
    $("heatmapProviderClear").addEventListener("click",()=>{window.BT001HeatmapAuth.clear();const input=$("heatmapProviderSecret");if(input)input.value="";text("heatmapProviderTestResult","Cleared");});
    $("heatmapProviderTest").addEventListener("click",async()=>{const button=$("heatmapProviderTest");button.disabled=true;text("heatmapProviderTestResult","Testing...");const result=await window.BT001HeatmapAuth.testConnection();text("heatmapProviderTestResult",result.ok?"Connection successful":result.reason);button.disabled=false;});
    $("heatmapSettingsRefresh").addEventListener("click",manualRefresh);$("heatmapRetryDataset").addEventListener("click",retryDatasetRetrieval);return card;
  }
  function renderAuth(value){text("heatmapProviderKeyStatus",value.status);const test=$("heatmapProviderTest");if(test)test.disabled=!!value.testing;}
  function renderDiagnostics(state){
    const diagnostics=state.diagnostics||{},recovery=state.recovery||{},metadata=state.dataset&&state.dataset.metadata,canvas=diagnostics.canvas||{};
    text("heatmapStage",diagnostics.currentStage);text("heatmapReason",diagnostics.reason);text("heatmapHttpStatus",diagnostics.httpStatus);text("heatmapRunStatus",recovery.actorStatus||diagnostics.runStatus);text("heatmapRunId",recovery.runId||diagnostics.runId);text("heatmapActorStarted",date(recovery.actorRequestStartedAt));text("heatmapActorCompleted",date(recovery.actorCompletedAt||diagnostics.actorCompletedAt));text("heatmapRunDuration",recovery.runDurationMs!=null?elapsed(recovery.runDurationMs):"--");text("heatmapDatasetIdAvailable",recovery.datasetId?"Yes":"No");text("heatmapDatasetRetrieval",recovery.datasetRetrievalStatus||diagnostics.datasetRetrievalStatus);text("heatmapLastProviderStage",recovery.lastSuccessfulProviderStage||diagnostics.lastSuccessfulProviderStage);text("heatmapFailedStage",recovery.failedStage);text("heatmapRawCached",recovery.hasRawPayload?"Yes":"No");text("heatmapParsedCached",recovery.hasParsedCandidate?"Yes":"No");text("heatmapNormalizedCached",recovery.hasNormalizedCandidate?"Yes":"No");text("heatmapObjectFound",diagnostics.heatmapObjectFound==null?"--":diagnostics.heatmapObjectFound?"Yes":"No");text("heatmapRequestStarted",date(diagnostics.requestStartedAt));text("heatmapElapsed",elapsed(diagnostics.elapsedMs));text("heatmapTimeout",diagnostics.timeoutMs?`${diagnostics.timeoutMs} ms`:"--");
    text("heatmapRawItems",diagnostics.rawItemCount||0);text("heatmapRawCells",diagnostics.rawCellCount||0);text("heatmapValidCells",diagnostics.validCellCount||(metadata&&metadata.validCellCount)||0);text("heatmapNormalizedCells",diagnostics.normalizedCellCount||(metadata&&metadata.validCellCount)||0);text("heatmapRejectedCells",diagnostics.rejectedCellCount||(metadata&&metadata.rejectedCellCount)||0);text("heatmapTimestampUnit",diagnostics.timestampUnit||(metadata&&metadata.timestampUnit));text("heatmapVisibleAxisCells",`${diagnostics.visibleTimeCellCount||0} / ${diagnostics.visiblePriceCellCount||0}`);text("heatmapVisibleCells",diagnostics.visibleCellCount||0);text("heatmapDrawnCells",diagnostics.drawnCellCount||0);text("heatmapZeroDraw",diagnostics.zeroDrawReason);
    text("heatmapCanvasSize",canvas.cssWidth!=null?`${canvas.cssWidth}x${canvas.cssHeight} CSS / ${canvas.backingWidth}x${canvas.backingHeight} backing`:"--");text("heatmapPlotRect",canvas.plot?`x ${canvas.plot.left}, y ${canvas.plot.top}, ${canvas.plot.width}x${canvas.plot.height}`:"--");text("heatmapLayer",canvas.insertionPoint);text("heatmapSelectedObject",diagnostics.selectedObject);text("heatmapPayloadStructure",diagnostics.payloadStructure&&diagnostics.payloadStructure.summary);text("heatmapDecodedPaths",(diagnostics.decodedStringPaths||[]).join(", ")||"none");text("heatmapCandidatePaths",(diagnostics.inspectedCandidatePaths||[]).join(", ")||"none");text("heatmapFields",`${(diagnostics.requiredFieldsFound||[]).join(", ")||"none"} / missing: ${(diagnostics.missingFields||[]).join(", ")||"none"}`);text("heatmapRejections",Object.entries(diagnostics.rejectionReasons||{}).map(([key,value])=>`${key}: ${value}`).join(", ")||"none");text("heatmapDisplaying",diagnostics.displayingPreviousDataset?"Previous valid dataset":state.dataset?"Current valid dataset":"No dataset");
    const input=$("heatmapProviderSecret"),needsKey=diagnostics.reason==="API key not configured";if(input){input.classList.toggle("heatmap-auth-required",needsKey);const modal=$("settingsModal");if(needsKey&&modal&&!modal.classList.contains("hidden"))input.focus();}
  }
  function render(state){
    watchOverlayToggle();settings();const prefs=state.prefs,metadata=state.dataset&&state.dataset.metadata,values={heatmapEnabled:prefs.enabled,heatmapOpacity:prefs.opacity,heatmapStrength:prefs.strength,heatmapMode:prefs.mode,heatmapClipping:prefs.maxClipping,heatmapSmoothing:prefs.smoothing,heatmapLegend:prefs.showLegend,heatmapSourceLabel:prefs.showSourceLabel,heatmapDuration:prefs.selectedDuration};
    Object.entries(values).forEach(([id,value])=>{const element=$(id);if(element){if(element.type==="checkbox")element.checked=!!value;else element.value=String(value);}});
    const toggle=$("heatmapOverlayToggle");if(toggle){toggle.classList.toggle("is-on",prefs.enabled);toggle.classList.toggle("is-off",!prefs.enabled);toggle.setAttribute("aria-pressed",prefs.enabled?"true":"false");}
    const exactStatus=(state.loading||state.status==="UPDATE_FAILED"||state.status==="READY")&&state.diagnostics.currentStage?state.diagnostics.currentStage:statusText(state.status);
    text("heatmapDisplayed",state.displayedDuration||"--");text("heatmapStatus",exactStatus);text("heatmapOpacityOut",`${prefs.opacity}%`);text("heatmapStrengthOut",`${prefs.strength}%`);text("heatmapClippingOut",`${prefs.maxClipping}%`);text("heatmapLastUpdate",date(state.lastSuccessfulUpdate));text("heatmapDatasetStart",metadata?sourceDate(metadata.datasetStart):"--");text("heatmapDatasetEnd",metadata?sourceDate(metadata.datasetEnd):"--");text("heatmapInterval",metadata?(metadata.sourceInterval||`${metadata.chartIntervalSeconds}s`):"--");text("heatmapPriceStep",metadata?String(metadata.tickSize):"--");
    renderDiagnostics(state);const refresh=$("heatmapSettingsRefresh"),retry=$("heatmapRetryDataset");if(refresh)refresh.disabled=state.loading;if(retry){retry.disabled=state.loading;retry.classList.toggle("hidden",!state.recovery.retryEligible);retry.textContent=state.recovery.hasNormalizedCandidate?"Retry rendering":state.recovery.hasParsedCandidate?"Retry validation":state.recovery.hasRawPayload?"Retry parsing":"Retry dataset retrieval";}scheduleOverlayAlignment();try{if(typeof window.draw==="function")window.draw();}catch(_error){}
  }
  function init(){watchOverlayToggle();settings();installLayoutObservers();watchDevicePixelRatio();scheduleOverlayAlignment();window.BT001HeatmapState.subscribe(render);window.BT001HeatmapAuth.subscribe(renderAuth);window.addEventListener("resize",scheduleOverlayAlignment);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(scheduleOverlayAlignment).catch(()=>{});if(typeof document.fonts.addEventListener==="function")document.fonts.addEventListener("loadingdone",scheduleOverlayAlignment);}window.addEventListener("heatmap:diagnostics",event=>renderDiagnostics(event.detail));}
  window.BT001HeatmapUI=Object.freeze({init,statusText,settings,activateHeatmapTab,manualRefresh,retryDatasetRetrieval});
})();
