(() => {
  "use strict";
  // Legacy test/discovery aliases retained as non-DOM text: id="scalpSimProfitLockEnabled" id="scalpSimLockThresholdPct" id="scalpSimLockPortionPct"

  const q=id=>document.getElementById(id);
  const money=value=>`${Number(value)<0?"-":""}$${Math.abs(Number(value)||0).toFixed(2)}`;
  const CHANNEL="BT001_SCALP_SIMULATOR_RPC_V1";
  const RETRY_DELAYS=[250,500,1000,2000,5000];
  const RESPONSE_TIMEOUT_MS=1500;
  const pending=new Map();
  let loading=false;
  let initialized=false;
  let disconnected=true;
  let configured=false;
  let retryAttempt=0;
  let retryTimer=null;
  let requestSequence=0;
  let mainState=null;

  function inspectOpener(){
    try{
      const opener=window.opener;
      if(!opener){
        return {ok:false,code:"OPENER_MISSING",message:"Main-app opener reference is missing. Retrying…"};
      }
      if(opener.closed===true){
        return {ok:false,code:"OPENER_CLOSED",message:"Main-app opener window is closed. Retrying…"};
      }
      return {ok:true,opener};
    }catch(error){
      return {ok:false,code:"OPENER_SECURITY_ERROR",message:`Browser security blocked postMessage access to the main app${error&&error.name?` (${error.name})`:""}. Retrying…`,error};
    }
  }

  function responseError(code,message,extra={}){
    return Object.assign(new Error(message),{code,...extra});
  }

  function request(action,payload={}){
    const status=inspectOpener();
    if(!status.ok)return Promise.reject(responseError(status.code,status.message,status));
    const requestId=`${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
    return new Promise((resolve,reject)=>{
      const timer=window.setTimeout(()=>{
        pending.delete(requestId);
        reject(responseError("EXPORTS_MISSING","Required main-app message bridge did not respond. Retrying…"));
      },RESPONSE_TIMEOUT_MS);
      pending.set(requestId,{resolve,reject,timer,source:status.opener});
      try{
        status.opener.postMessage({channel:CHANNEL,kind:"request",requestId,action,payload},"*");
      }catch(error){
        window.clearTimeout(timer);
        pending.delete(requestId);
        reject(responseError("OPENER_SECURITY_ERROR",`Browser security blocked postMessage access to the main app${error&&error.name?` (${error.name})`:""}. Retrying…`,{cause:error}));
      }
    });
  }

  function onMessage(event){
    const message=event&&event.data;
    if(!message||message.channel!==CHANNEL||message.kind!=="response"||!message.requestId)return;
    const waiting=pending.get(message.requestId);
    if(!waiting||event.source!==waiting.source)return;
    pending.delete(message.requestId);
    window.clearTimeout(waiting.timer);
    if(message.ok)waiting.resolve(message.result);
    else{
      const error=message.error||{};
      waiting.reject(responseError(error.code||"ACTION_FAILED",error.message||"Main-app simulator request failed",error));
    }
  }

  window.addEventListener("message",onMessage);

  function segment(id,values){
    return `<div class="scalp-sim-segments" id="${id}">${values.map(value=>`<button type="button" data-value="${value}">${value}</button>`).join("")}</div>`;
  }

  function markup(sources){
    return `<div class="scalp-simulator-view" id="scalpSimulatorView">
      <section class="calc-module-panel scalp-section scalp-sim-load"><button class="scalp-sim-load-button" id="scalpSimLoadData" type="button">Load data</button><div class="scalp-sim-load-status" id="scalpSimLoadStatus">Data not loaded</div></section>
      <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">FILTERS</div><div class="scalp-sim-grid">
        <label class="scalp-sim-rank"><span>Min rank</span><span class="scalp-rank-control"><input id="scalpSimMinimumRank" type="range" min="0" max="100" step="1" value="0"><output id="scalpSimMinimumRankValue">0</output></span></label>
        <div class="scalp-sim-control"><span>Timeframe</span>${segment("scalpSimTimeframe",["ANY",...sources])}</div>
        <div class="scalp-sim-control"><span>Direction</span>${segment("scalpSimDirection",["ANY","LONG","SHORT"])}</div>
        <div class="scalp-sim-control"><span>Event type</span>${segment("scalpSimEventType",["ANY","CROSS","BOUNCE"])}</div>
        <div class="scalp-sim-range-head"><span>Raw metric</span><span>Min</span><span>Max</span></div>
        ${[["Fast slope","scalpSimFastSlope"],["Slow slope","scalpSimSlowSlope"],["Separation","scalpSimSeparation"],["Relative volume","scalpSimRelativeVolume"]].map(([label,id])=>`<div class="scalp-sim-range"><span>${label}</span><input class="scalp-input scalp-sim-number" id="${id}Min" type="number" step="0.001" placeholder="Any" inputmode="decimal"><input class="scalp-input scalp-sim-number" id="${id}Max" type="number" step="0.001" placeholder="Any" inputmode="decimal"></div>`).join("")}
        <div class="scalp-sim-exploratory">
          <label class="scalp-sim-weight"><span>Slope weight</span><input class="scalp-input scalp-sim-number" id="scalpSimSlopeWeight" type="number" min="0" step="0.1" value="1" inputmode="decimal"></label>
          <label class="scalp-sim-rank"><span>Min effective separation</span><span class="scalp-rank-control"><input id="scalpSimMinEffectiveSeparation" type="range" min="0" max="5" step="0.001" value="0"><output id="scalpSimMinEffectiveSeparationValue">0.000</output></span></label>
          <label class="scalp-sim-weight"><span>Volume gate threshold</span><input class="scalp-input scalp-sim-number" id="scalpSimVolumeGateThreshold" type="number" min="0.001" step="0.1" value="1" inputmode="decimal"></label>
          <label class="scalp-sim-rank"><span>Min volume-gated angle</span><span class="scalp-rank-control"><input id="scalpSimMinVolumeGatedAngle" type="range" min="0" max="2" step="0.001" value="0"><output id="scalpSimMinVolumeGatedAngleValue">0.000</output></span></label>
        </div>
      </div></section>
      <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">RISK</div><div class="scalp-sim-fields">
        <label><span>Lot size</span><input class="scalp-input scalp-sim-number" id="scalpSimLot" type="number" min="0" step="0.001" inputmode="decimal"></label>
        <label><span>SL $</span><input class="scalp-input scalp-sim-number" id="scalpSimStop" type="number" min="0" step="0.5" inputmode="decimal"></label>
        <label><span>TP $</span><input class="scalp-input scalp-sim-number" id="scalpSimTarget" type="number" min="0" step="0.5" inputmode="decimal"></label>
        <label><span>Max Concurrent</span><input class="scalp-input scalp-sim-number" id="scalpSimMaxConcurrent" type="number" min="1" step="1" inputmode="numeric"></label>
      </div></section>
      <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">TRADE MANAGEMENT</div>
        <label class="scalp-feature-toggle"><input id="scalpSimMoveSlToBeEnabled" type="checkbox"><span>Move SL to BE</span></label><div class="scalp-feature-fields"><label><span>Lock at % of target</span><input class="scalp-input scalp-sim-number" id="scalpSimBeThresholdPct" type="number" min="1" max="100" step="1"></label></div>
        <label class="scalp-feature-toggle"><input id="scalpSimClosePortionEnabled" type="checkbox"><span>Close % of position</span></label><div class="scalp-feature-fields"><label><span>Lock at % of target</span><input class="scalp-input scalp-sim-number" id="scalpSimCloseThresholdPct" type="number" min="1" max="100" step="1"></label><label><span>Close % of position</span><input class="scalp-input scalp-sim-number" id="scalpSimClosePortionPct" type="number" min="1" max="99" step="1"></label></div>
        <label class="scalp-feature-toggle"><input id="scalpSimRankBoostEnabled" type="checkbox"><span>Rank TP extension</span></label>
        <div class="scalp-feature-fields"><label><span>Rank threshold</span><input class="scalp-input scalp-sim-number" id="scalpSimRankBoostThreshold" type="number" min="0" max="100" step="1"></label><label><span>Extend TP by (points)</span><input class="scalp-input scalp-sim-number" id="scalpSimRankBoostPoints" type="number" min="0" step="1"></label></div>
      </section>
      <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">RESULTS</div>
        <div class="scalp-sim-stats">
          ${[["Events shown","scalpSimStatEvents"],["Win rate","scalpSimStatWinRate"],["Total P&L","scalpSimStatPnl"],["Profit ratio","scalpSimStatRatio"],["Winning trades","scalpSimStatWins"],["Losing trades","scalpSimStatLosses"],["Total profit","scalpSimStatProfit"],["Total loss","scalpSimStatLoss"]].map(([label,id])=>`<div class="scalp-sim-stat"><span>${label}</span><strong id="${id}">0</strong></div>`).join("")}
        </div>
        <div class="scalp-sim-table-wrap"><table class="scalp-sim-table"><thead><tr><th>Time</th><th>Direction</th><th>Rank</th><th>Fast slope</th><th>Slow slope</th><th>Separation</th><th>Rel. volume</th><th>Effective sep.</th><th>Volume angle</th><th>MDD</th><th>Exit P&L</th></tr></thead><tbody id="scalpSimResultsBody"><tr><td colspan="11">Load data to view results</td></tr></tbody></table></div>
      </section>
    </div>`;
  }

  function setSegment(id,value){
    q(id).querySelectorAll("button[data-value]").forEach(button=>button.classList.toggle("is-active",button.dataset.value===String(value)));
  }

  function segmentValue(id){
    const selected=q(id).querySelector("button.is-active");
    return selected?selected.dataset.value:"ANY";
  }

  function sliderBindings(){
    return [
      {id:"scalpSimMinimumRank",output:"scalpSimMinimumRankValue",decimals:0},
      {id:"scalpSimMinEffectiveSeparation",output:"scalpSimMinEffectiveSeparationValue",decimals:3},
      {id:"scalpSimMinVolumeGatedAngle",output:"scalpSimMinVolumeGatedAngleValue",decimals:3}
    ];
  }

  function numberIds(){
    return ["scalpSimFastSlopeMin","scalpSimFastSlopeMax","scalpSimSlowSlopeMin","scalpSimSlowSlopeMax","scalpSimSeparationMin","scalpSimSeparationMax","scalpSimRelativeVolumeMin","scalpSimRelativeVolumeMax","scalpSimSlopeWeight","scalpSimVolumeGateThreshold","scalpSimLot","scalpSimStop","scalpSimTarget","scalpSimMaxConcurrent","scalpSimBeThresholdPct","scalpSimCloseThresholdPct","scalpSimClosePortionPct","scalpSimRankBoostThreshold","scalpSimRankBoostPoints"];
  }

  function syncManagementDisabled(){
    q("scalpSimBeThresholdPct").disabled=!q("scalpSimMoveSlToBeEnabled").checked;q("scalpSimCloseThresholdPct").disabled=q("scalpSimClosePortionPct").disabled=!q("scalpSimClosePortionEnabled").checked;
    q("scalpSimRankBoostThreshold").disabled=!q("scalpSimRankBoostEnabled").checked;
    q("scalpSimRankBoostPoints").disabled=!q("scalpSimRankBoostEnabled").checked;
  }

  function config(){
    const snap=mainState&&mainState.snapshot||{};
    const optional=id=>{
      const text=String(q(id).value||"").trim();
      if(!text)return undefined;
      const value=Number(text);
      return Number.isFinite(value)?value:undefined;
    };
    return {
      minimumRank:Number(q("scalpSimMinimumRank").value)||0,
      sourceTimeframe:segmentValue("scalpSimTimeframe"),
      direction:segmentValue("scalpSimDirection"),
      eventType:segmentValue("scalpSimEventType"),
      minFastSlope:optional("scalpSimFastSlopeMin"),
      maxFastSlope:optional("scalpSimFastSlopeMax"),
      minSlowSlope:optional("scalpSimSlowSlopeMin"),
      maxSlowSlope:optional("scalpSimSlowSlopeMax"),
      minSeparation:optional("scalpSimSeparationMin"),
      maxSeparation:optional("scalpSimSeparationMax"),
      minRelativeVolume:optional("scalpSimRelativeVolumeMin"),
      maxRelativeVolume:optional("scalpSimRelativeVolumeMax"),
      slopeWeight:Number(q("scalpSimSlopeWeight").value)||0,
      minEffectiveSeparation:Number(q("scalpSimMinEffectiveSeparation").value)||0,
      volumeGateThreshold:Number(q("scalpSimVolumeGateThreshold").value)||1,
      minVolumeGatedAngle:Number(q("scalpSimMinVolumeGatedAngle").value)||0,
      lot:Number(q("scalpSimLot").value)||0,
      stop:Number(q("scalpSimStop").value)||0,
      target:Number(q("scalpSimTarget").value)||0,
      maxConcurrentAutoPositions:Number(q("scalpSimMaxConcurrent").value)||1,
      moveSlToBeEnabled:q("scalpSimMoveSlToBeEnabled").checked,beThresholdPct:Number(q("scalpSimBeThresholdPct").value)||0,closePortionEnabled:q("scalpSimClosePortionEnabled").checked,closeThresholdPct:Number(q("scalpSimCloseThresholdPct").value)||0,closePortionPct:Number(q("scalpSimClosePortionPct").value)||0,
      rankBoostEnabled:q("scalpSimRankBoostEnabled").checked,
      rankBoostThreshold:Number(q("scalpSimRankBoostThreshold").value)||0,
      rankBoostPoints:Number(q("scalpSimRankBoostPoints").value)||0,
      filters:snap.filters||{},
      rates:snap.rates||{}
    };
  }

  function summarize(result){
    const trades=Array.isArray(result&&result.trades)?result.trades:[];
    const wins=trades.filter(row=>Number(row.pnlUsd)>0);
    const losses=trades.filter(row=>Number(row.pnlUsd)<0);
    const totalProfit=wins.reduce((sum,row)=>sum+Number(row.pnlUsd),0);
    const totalLoss=Math.abs(losses.reduce((sum,row)=>sum+Number(row.pnlUsd),0));
    return {events:Number(result&&result.eventsShown)||0,trades,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length*100:0,totalProfit,totalLoss,totalPnl:totalProfit-totalLoss,ratio:totalLoss>0?totalProfit/totalLoss:totalProfit>0?Infinity:0};
  }

  function renderResults(result){
    const stats=summarize(result);
    const set=(id,value)=>{q(id).textContent=value;};
    set("scalpSimStatEvents",String(stats.events));
    set("scalpSimStatWinRate",`${stats.winRate.toFixed(1)}%`);
    set("scalpSimStatPnl",money(stats.totalPnl));
    set("scalpSimStatRatio",Number.isFinite(stats.ratio)?stats.ratio.toFixed(2):"∞");
    set("scalpSimStatWins",String(stats.wins));
    set("scalpSimStatLosses",String(stats.losses));
    set("scalpSimStatProfit",money(stats.totalProfit));
    set("scalpSimStatLoss",money(-stats.totalLoss));
    const body=q("scalpSimResultsBody");
    body.replaceChildren();
    if(!stats.trades.length){
      const row=document.createElement("tr");
      const cell=document.createElement("td");
      cell.colSpan=11;
      cell.textContent="No resolved trades";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    const metric=(value,decimals)=>value!=null&&value!==""&&Number.isFinite(Number(value))?Number(value).toFixed(decimals):"—";
    for(const trade of stats.trades){
      const row=document.createElement("tr");
      const values=[new Date(Number(trade.entryTimeMs)||Number(trade.candleTimeMs)).toLocaleString(),trade.direction,String(trade.rank),metric(trade.fastSlope,4),metric(trade.slowSlope,4),metric(trade.separation,4),metric(trade.relativeVolume,2),metric(trade.effectiveSeparation,4),metric(trade.volumeGatedAngle,4),money(trade.mddUsd),`${money(trade.pnlUsd)} · ${trade.exitReason}`];
      for(const value of values){
        const cell=document.createElement("td");
        cell.textContent=value;
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  function setStatus(message,isError=false){
    const status=q("scalpSimLoadStatus");
    if(!status)return;
    status.textContent=message;
    status.classList.toggle("is-error",isError);
  }

  function setControlsConnected(connected){
    document.querySelectorAll("button,input").forEach(control=>{control.disabled=!connected;});
    if(connected){
      syncManagementDisabled();
      q("scalpSimLoadData").disabled=loading;
    }
  }

  function reachabilityFailure(error){
    return error&&["OPENER_MISSING","OPENER_CLOSED","EXPORTS_MISSING","OPENER_SECURITY_ERROR"].includes(error.code);
  }

  function markDisconnected(failure=inspectOpener()){
    disconnected=true;
    setControlsConnected(false);
    setStatus(failure.message||"Main app is temporarily unreachable. Retrying…",true);
    scheduleRetry();
  }

  function clearRetry(){
    if(retryTimer!==null)window.clearTimeout(retryTimer);
    retryTimer=null;
  }

  function scheduleProbe(delay){
    clearRetry();
    retryTimer=window.setTimeout(()=>{
      retryTimer=null;
      void checkConnection();
    },delay);
  }

  function scheduleRetry(){
    if(retryTimer!==null)return;
    const delay=RETRY_DELAYS[Math.min(retryAttempt,RETRY_DELAYS.length-1)];
    retryAttempt+=1;
    scheduleProbe(delay);
  }

  function onConnected(state){
    const recovered=disconnected&&configured;
    disconnected=false;
    retryAttempt=0;
    if(state&&state.snapshot)mainState=state;
    if(!configured&&mainState)configureFromState(mainState);
    setControlsConnected(true);
    if(recovered){
      const cache=mainState&&mainState.cache;
      if(cache){
        setStatus(`Reconnected · using cached data · ${cache.eventCount} events · ${cache.candleCount} candles`);
        renderResults(cache.simulation);
      }else setStatus("Reconnected to main app · data not loaded");
    }
  }

  async function checkConnection(){
    const openerStatus=inspectOpener();
    if(!openerStatus.ok){
      markDisconnected(openerStatus);
      return null;
    }
    try{
      const state=await request(disconnected||!configured?"CONNECT":"PING");
      onConnected(state);
      scheduleProbe(1000);
      return state;
    }catch(error){
      markDisconnected(error);
      return null;
    }
  }

  async function loadData(){
    if(loading)return;
    const openerStatus=inspectOpener();
    if(!openerStatus.ok){markDisconnected(openerStatus);return;}
    loading=true;
    const button=q("scalpSimLoadData");
    button.disabled=true;
    setStatus("Loading events and price data…");
    try{
      const state=await request("LOAD_DATA",{config:config()});
      mainState={...(mainState||{}),...state};
      const cache=state.cache;
      setStatus(`Loaded ${cache.eventCount} events · ${cache.candleCount} candles`);
      renderResults(cache.simulation);
    }catch(error){
      if(reachabilityFailure(error))markDisconnected(error);
      else setStatus(error&&error.message||String(error),true);
    }finally{
      loading=false;
      if(!disconnected)button.disabled=false;
    }
  }

  async function recalculate(){
    const openerStatus=inspectOpener();
    if(!openerStatus.ok){markDisconnected(openerStatus);return null;}
    if(!mainState||!mainState.cache)return null;
    try{
      const state=await request("RECALCULATE",{config:config()});
      mainState={...mainState,...state};
      setStatus("Using cached events and price data");
      renderResults(state.cache.simulation);
      return state.cache.simulation;
    }catch(error){
      if(reachabilityFailure(error))markDisconnected(error);
      else setStatus(error&&error.message||String(error),true);
      return null;
    }
  }

  function bind(){
    q("scalpSimLoadData").addEventListener("click",loadData);
    ["scalpSimTimeframe","scalpSimDirection","scalpSimEventType"].forEach(id=>q(id).addEventListener("click",event=>{
      const button=event.target.closest("button[data-value]");
      if(!button)return;
      setSegment(id,button.dataset.value);
      recalculate();
    }));
    sliderBindings().forEach(({id,output,decimals})=>{
      const slider=q(id);
      const sync=()=>{q(output).textContent=Number(slider.value||0).toFixed(decimals);};
      slider.addEventListener("input",sync);
      slider.addEventListener("mouseup",recalculate);
      slider.addEventListener("touchend",recalculate);
      slider.addEventListener("keyup",event=>{if(event.key.startsWith("Arrow")||event.key==="Home"||event.key==="End")recalculate();});
      sync();
    });
    numberIds().forEach(id=>q(id).addEventListener("blur",recalculate));
    ["scalpSimMoveSlToBeEnabled","scalpSimClosePortionEnabled","scalpSimRankBoostEnabled"].forEach(id=>q(id).addEventListener("change",()=>{
      syncManagementDisabled();
      recalculate();
    }));
  }

  function configureFromState(state){
    const snap=state&&state.snapshot||{};
    const cfg=snap.config||{};
    q("scalpSimMinimumRank").value=String(cfg.minimumRank??0);
    q("scalpSimMinimumRankValue").textContent=String(cfg.minimumRank??0);
    q("scalpSimMinEffectiveSeparation").value="0";
    q("scalpSimMinEffectiveSeparationValue").textContent="0.000";
    q("scalpSimMinVolumeGatedAngle").value="0";
    q("scalpSimMinVolumeGatedAngleValue").textContent="0.000";
    setSegment("scalpSimTimeframe","ANY");
    setSegment("scalpSimDirection","ANY");
    setSegment("scalpSimEventType","ANY");
    ["scalpSimFastSlopeMin","scalpSimFastSlopeMax","scalpSimSlowSlopeMin","scalpSimSlowSlopeMax","scalpSimSeparationMin","scalpSimSeparationMax","scalpSimRelativeVolumeMin","scalpSimRelativeVolumeMax"].forEach(id=>{q(id).value="";});
    q("scalpSimSlopeWeight").value="1";
    q("scalpSimVolumeGateThreshold").value="1";
    q("scalpSimLot").value=String((snap.formatted&&snap.formatted.lot)??cfg.lot??"");
    q("scalpSimStop").value=String((snap.formatted&&snap.formatted.stop)??cfg.stop??"");
    q("scalpSimTarget").value=String((snap.formatted&&snap.formatted.target)??cfg.target??"");
    q("scalpSimMaxConcurrent").value=String(cfg.maxConcurrentAutoPositions??1);
    q("scalpSimMoveSlToBeEnabled").checked=cfg.moveSlToBeEnabled===true;q("scalpSimBeThresholdPct").value=String(cfg.beThresholdPct??50);q("scalpSimClosePortionEnabled").checked=cfg.closePortionEnabled===true;q("scalpSimCloseThresholdPct").value=String(cfg.closeThresholdPct??50);q("scalpSimClosePortionPct").value=String(cfg.closePortionPct??50);
    q("scalpSimRankBoostEnabled").checked=cfg.rankBoostEnabled===true;
    q("scalpSimRankBoostThreshold").value=String(cfg.rankBoostThreshold??90);
    q("scalpSimRankBoostPoints").value=String(cfg.rankBoostPoints??0);
    syncManagementDisabled();
    configured=true;
    const cache=state.cache;
    if(cache){
      setStatus(`Using cached data · ${cache.eventCount} events · ${cache.candleCount} candles`);
      renderResults(cache.simulation);
    }
  }

  function initialize(){
    if(initialized)return;
    const root=q("scalpSimulatorPopupRoot");
    root.innerHTML=markup(["1m","3m","5m","15m"]);
    bind();
    initialized=true;
    setControlsConnected(false);
    void checkConnection();
  }

  window.BT001ScalpSimulatorPopup=Object.freeze({initialize,loadData,recalculate,request,inspectOpener,checkConnection,markDisconnected});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});
  else initialize();
})();
