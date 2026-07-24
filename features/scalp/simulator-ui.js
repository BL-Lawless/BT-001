(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,calc=root.calculations,data=root.simulatorData;
  if(!C||!calc||!data)throw new Error("SCALP simulator UI dependencies are unavailable");
  const q=id=>document.getElementById(id),money=value=>`${Number(value)<0?"-":""}$${Math.abs(Number(value)||0).toFixed(2)}`,WINDOW_KEY="bt001_scalp_simulator_window_v1";

  class ScalpSimulatorUI{
    constructor(engine){this.engine=engine;this.window=null;this.active=false;this.initialized=false;this.loading=false;this.uiState=this.loadState();}
    loadState(){try{return {...JSON.parse(localStorage.getItem(WINDOW_KEY)||"{}")};}catch(_e){return {};}}
    saveState(){try{localStorage.setItem(WINDOW_KEY,JSON.stringify(this.uiState));}catch(_e){}}
    segment(id,values){return `<div class="scalp-sim-segments" id="${id}">${values.map(value=>`<button type="button" data-value="${value}">${value}</button>`).join("")}</div>`;}
    markup(){
      return `<div class="scalp-simulator-view" id="scalpSimulatorView">
        <section class="calc-module-panel scalp-section scalp-sim-load"><button class="scalp-sim-load-button" id="scalpSimLoadData" type="button">Load data</button><div class="scalp-sim-load-status" id="scalpSimLoadStatus">Data not loaded</div></section>
        <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">FILTERS</div><div class="scalp-sim-grid">
          <label class="scalp-sim-rank"><span>Min rank</span><span class="scalp-rank-control"><input id="scalpSimMinimumRank" type="range" min="0" max="100" step="1" value="0"><output id="scalpSimMinimumRankValue">0</output></span></label>
          <div class="scalp-sim-control"><span>Timeframe</span>${this.segment("scalpSimTimeframe",["ANY",...C.sources])}</div>
          <div class="scalp-sim-control"><span>Direction</span>${this.segment("scalpSimDirection",["ANY","LONG","SHORT"])}</div>
          <div class="scalp-sim-control"><span>Event type</span>${this.segment("scalpSimEventType",["ANY","CROSS","BOUNCE"])}</div>
        </div></section>
        <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">RISK</div><div class="scalp-sim-fields">
          <label><span>Lot size</span><input class="scalp-input scalp-sim-number" id="scalpSimLot" type="number" min="0" step="0.001" inputmode="decimal"></label>
          <label><span>SL $</span><input class="scalp-input scalp-sim-number" id="scalpSimStop" type="number" min="0" step="0.5" inputmode="decimal"></label>
          <label><span>TP $</span><input class="scalp-input scalp-sim-number" id="scalpSimTarget" type="number" min="0" step="0.5" inputmode="decimal"></label>
          <label><span>Max Concurrent</span><input class="scalp-input scalp-sim-number" id="scalpSimMaxConcurrent" type="number" min="1" step="1" inputmode="numeric"></label>
        </div></section>
        <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">TRADE MANAGEMENT</div>
          <label class="scalp-feature-toggle"><input id="scalpSimProfitLockEnabled" type="checkbox"><span>Profit lock</span></label>
          <div class="scalp-feature-fields"><label><span>Lock at % of target</span><input class="scalp-input scalp-sim-number" id="scalpSimLockThresholdPct" type="number" min="1" max="100" step="1"></label><label><span>Close % of position</span><input class="scalp-input scalp-sim-number" id="scalpSimLockPortionPct" type="number" min="1" max="99" step="1"></label></div>
          <label class="scalp-feature-toggle"><input id="scalpSimRankBoostEnabled" type="checkbox"><span>Rank TP extension</span></label>
          <div class="scalp-feature-fields"><label><span>Rank threshold</span><input class="scalp-input scalp-sim-number" id="scalpSimRankBoostThreshold" type="number" min="0" max="100" step="1"></label><label><span>Extend TP by (points)</span><input class="scalp-input scalp-sim-number" id="scalpSimRankBoostPoints" type="number" min="0" step="1"></label></div>
        </section>
        <section class="calc-module-panel scalp-section"><div class="calc-module-section-title scalp-section-title">RESULTS</div>
          <div class="scalp-sim-stats">
            ${[["Events shown","scalpSimStatEvents"],["Win rate","scalpSimStatWinRate"],["Total P&L","scalpSimStatPnl"],["Profit ratio","scalpSimStatRatio"],["Winning trades","scalpSimStatWins"],["Losing trades","scalpSimStatLosses"],["Total profit","scalpSimStatProfit"],["Total loss","scalpSimStatLoss"]].map(([label,id])=>`<div class="scalp-sim-stat"><span>${label}</span><strong id="${id}">0</strong></div>`).join("")}
          </div>
          <div class="scalp-sim-table-wrap"><table class="scalp-sim-table"><thead><tr><th>Time</th><th>Direction</th><th>Rank</th><th>MDD</th><th>Exit P&L</th></tr></thead><tbody id="scalpSimResultsBody"><tr><td colspan="5">Load data to view results</td></tr></tbody></table></div>
        </section>
      </div>`;
    }
    ensureWindow(){
      if(this.window)return this.window;
      const win=document.createElement("section");win.id="scalpSimulatorWindow";win.className="calc-module-window scalp-window scalp-simulator-window hidden";win.setAttribute("aria-label","SCALP simulator");
      win.innerHTML=`<header class="calc-module-head scalp-head" id="scalpSimulatorHead"><div class="calc-module-title scalp-head-title">Scalp Simulator</div><div class="calc-module-actions scalp-head-actions"><button id="scalpSimulatorCollapse" type="button" title="Collapse">−</button><button id="scalpSimulatorClose" type="button" title="Hide">×</button></div></header><div class="calc-module-body scalp-body scalp-simulator-body">${this.markup()}</div>${["n","s","e","w","ne","nw","se","sw"].map(dir=>`<div class="calc-module-resize calc-module-resize-${dir} scalp-simulator-resize-handle" data-dir="${dir}"></div>`).join("")}`;
      document.body.appendChild(win);this.window=win;this.restoreGeometry();return win;
    }
    install(){this.ensureWindow();this.bind();this.renderButton();return this;}
    bind(){
      q("scalpSimulatorToggle").addEventListener("click",()=>this.show());
      q("scalpSimulatorClose").addEventListener("click",()=>this.hide());
      q("scalpSimulatorCollapse").addEventListener("click",()=>this.toggleCollapse());
      q("scalpSimLoadData").addEventListener("click",()=>this.loadData());
      ["scalpSimTimeframe","scalpSimDirection","scalpSimEventType"].forEach(id=>q(id).addEventListener("click",event=>{const button=event.target.closest("button[data-value]");if(!button)return;this.setSegment(id,button.dataset.value);this.recalculate();}));
      const rank=q("scalpSimMinimumRank");rank.addEventListener("input",()=>{q("scalpSimMinimumRankValue").textContent=rank.value;});rank.addEventListener("mouseup",()=>this.recalculate());rank.addEventListener("touchend",()=>this.recalculate());rank.addEventListener("keyup",event=>{if(event.key.startsWith("Arrow")||event.key==="Home"||event.key==="End")this.recalculate();});
      this.numberIds().forEach(id=>q(id).addEventListener("blur",()=>this.recalculate()));
      ["scalpSimProfitLockEnabled","scalpSimRankBoostEnabled"].forEach(id=>q(id).addEventListener("change",()=>{this.syncManagementDisabled();this.recalculate();}));
      this.bindDrag();this.bindResize();
    }
    numberIds(){return ["scalpSimLot","scalpSimStop","scalpSimTarget","scalpSimMaxConcurrent","scalpSimLockThresholdPct","scalpSimLockPortionPct","scalpSimRankBoostThreshold","scalpSimRankBoostPoints"];}
    setSegment(id,value){q(id).querySelectorAll("button[data-value]").forEach(button=>button.classList.toggle("is-active",button.dataset.value===String(value)));}
    segmentValue(id){const selected=q(id).querySelector("button.is-active");return selected?selected.dataset.value:"ANY";}
    initialize(){
      if(this.initialized)return;const snap=this.engine.snapshot(),cfg=snap.config||{};
      q("scalpSimMinimumRank").value=String(cfg.minimumRank??0);q("scalpSimMinimumRankValue").textContent=String(cfg.minimumRank??0);this.setSegment("scalpSimTimeframe","ANY");this.setSegment("scalpSimDirection","ANY");this.setSegment("scalpSimEventType","ANY");
      q("scalpSimLot").value=calc.formatNumeric(cfg.lot,3);q("scalpSimStop").value=calc.formatNumeric(cfg.stop,1);q("scalpSimTarget").value=calc.formatNumeric(cfg.target,1);q("scalpSimMaxConcurrent").value=String(cfg.maxConcurrentAutoPositions??1);
      q("scalpSimProfitLockEnabled").checked=cfg.profitLockEnabled===true;q("scalpSimLockThresholdPct").value=String(cfg.lockThresholdPct??50);q("scalpSimLockPortionPct").value=String(cfg.lockPortionPct??50);
      q("scalpSimRankBoostEnabled").checked=cfg.rankBoostEnabled===true;q("scalpSimRankBoostThreshold").value=String(cfg.rankBoostThreshold??90);q("scalpSimRankBoostPoints").value=String(cfg.rankBoostPoints??0);
      this.syncManagementDisabled();this.initialized=true;
    }
    syncManagementDisabled(){q("scalpSimLockThresholdPct").disabled=!q("scalpSimProfitLockEnabled").checked;q("scalpSimLockPortionPct").disabled=!q("scalpSimProfitLockEnabled").checked;q("scalpSimRankBoostThreshold").disabled=!q("scalpSimRankBoostEnabled").checked;q("scalpSimRankBoostPoints").disabled=!q("scalpSimRankBoostEnabled").checked;}
    show(){this.initialize();this.window.classList.remove("hidden");this.active=true;this.renderButton();}
    hide(){this.window.classList.add("hidden");this.active=false;this.renderButton();}
    renderButton(){const button=q("scalpSimulatorToggle");if(!button)return;button.textContent="SIMULATOR";button.classList.toggle("is-active",this.active);button.setAttribute("aria-pressed",String(this.active));}
    toggleCollapse(){
      if(!this.window.classList.contains("is-collapsed"))this.captureGeometry();
      this.uiState.collapsed=!this.window.classList.contains("is-collapsed");this.window.classList.toggle("is-collapsed",this.uiState.collapsed);q("scalpSimulatorCollapse").textContent=this.uiState.collapsed?"+":"−";this.saveState();
    }
    bindDrag(){
      const head=q("scalpSimulatorHead"),win=this.window;let start=null;
      head.addEventListener("pointerdown",event=>{if(event.target.closest("button"))return;const rect=win.getBoundingClientRect();start={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};head.setPointerCapture(event.pointerId);event.preventDefault();});
      head.addEventListener("pointermove",event=>{if(!start)return;win.style.left=Math.max(4,Math.min(innerWidth-80,start.left+event.clientX-start.x))+"px";win.style.top=Math.max(4,Math.min(innerHeight-34,start.top+event.clientY-start.y))+"px";});
      const end=event=>{if(!start)return;start=null;try{head.releasePointerCapture(event.pointerId);}catch(_e){}this.captureGeometry();};head.addEventListener("pointerup",end);head.addEventListener("pointercancel",end);
    }
    bindResize(){
      this.window.querySelectorAll(".scalp-simulator-resize-handle").forEach(handle=>handle.addEventListener("pointerdown",event=>{if(this.window.classList.contains("is-collapsed"))return;const rect=this.window.getBoundingClientRect(),dir=handle.dataset.dir,start={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};event.preventDefault();event.stopPropagation();const move=e=>{const dx=e.clientX-start.x,dy=e.clientY-start.y;let left=start.left,top=start.top,width=start.width,height=start.height;if(dir.includes("e"))width+=dx;if(dir.includes("s"))height+=dy;if(dir.includes("w")){width-=dx;left+=dx;}if(dir.includes("n")){height-=dy;top+=dy;}if(width<C.ui.minWidth){if(dir.includes("w"))left-=C.ui.minWidth-width;width=C.ui.minWidth;}if(height<C.ui.minHeight){if(dir.includes("n"))top-=C.ui.minHeight-height;height=C.ui.minHeight;}left=Math.max(4,Math.min(innerWidth-80,left));top=Math.max(4,Math.min(innerHeight-40,top));width=Math.min(width,innerWidth-left-4);height=Math.min(height,innerHeight-top-4);Object.assign(this.window.style,{left:left+"px",top:top+"px",width:width+"px",height:height+"px"});};const up=()=>{document.removeEventListener("pointermove",move,true);document.removeEventListener("pointerup",up,true);this.captureGeometry();};document.addEventListener("pointermove",move,true);document.addEventListener("pointerup",up,true);}));
    }
    captureGeometry(){if(this.window.classList.contains("is-collapsed"))return;const rect=this.window.getBoundingClientRect();this.uiState.geometry={left:rect.left,top:rect.top,width:rect.width,height:rect.height};this.saveState();}
    restoreGeometry(){
      const saved=this.uiState.geometry||{},live=q("scalpWindow"),liveLeft=parseFloat(live&&live.style.left)||90,liveTop=parseFloat(live&&live.style.top)||70,liveWidth=parseFloat(live&&live.style.width)||C.ui.defaultWidth,defaultWidth=520,defaultHeight=600;
      let left=Number(saved.left)||liveLeft+liveWidth+12,top=Number(saved.top)||liveTop,width=Math.max(C.ui.minWidth,Number(saved.width)||defaultWidth),height=Math.max(C.ui.minHeight,Number(saved.height)||defaultHeight);
      if(left+width>innerWidth-4)left=Math.max(4,liveLeft-width-12);left=Math.max(4,Math.min(innerWidth-80,left));top=Math.max(4,Math.min(innerHeight-40,top));width=Math.min(width,innerWidth-left-4);height=Math.min(height,innerHeight-top-4);
      Object.assign(this.window.style,{left:left+"px",top:top+"px",width:width+"px",height:height+"px"});if(this.uiState.collapsed)this.window.classList.add("is-collapsed");q("scalpSimulatorCollapse").textContent=this.uiState.collapsed?"+":"−";
    }
    config(){
      const snap=this.engine.snapshot();
      return {minimumRank:Number(q("scalpSimMinimumRank").value)||0,sourceTimeframe:this.segmentValue("scalpSimTimeframe"),direction:this.segmentValue("scalpSimDirection"),eventType:this.segmentValue("scalpSimEventType"),lot:Number(q("scalpSimLot").value)||0,stop:Number(q("scalpSimStop").value)||0,target:Number(q("scalpSimTarget").value)||0,maxConcurrentAutoPositions:Number(q("scalpSimMaxConcurrent").value)||1,profitLockEnabled:q("scalpSimProfitLockEnabled").checked,lockThresholdPct:Number(q("scalpSimLockThresholdPct").value)||0,lockPortionPct:Number(q("scalpSimLockPortionPct").value)||0,rankBoostEnabled:q("scalpSimRankBoostEnabled").checked,rankBoostThreshold:Number(q("scalpSimRankBoostThreshold").value)||0,rankBoostPoints:Number(q("scalpSimRankBoostPoints").value)||0,filters:snap.filters||{},rates:snap.rates||{}};
    }
    async loadData(){
      if(this.loading)return;this.loading=true;const button=q("scalpSimLoadData"),status=q("scalpSimLoadStatus");button.disabled=true;status.textContent="Loading events and price data…";status.classList.remove("is-error");
      try{const cache=await data.loadData(this.config());status.textContent=`Loaded ${cache.events.length} events · ${cache.candles.length} candles`;this.renderResults(cache.simulation);}
      catch(error){status.textContent=error&&error.message||String(error);status.classList.add("is-error");}
      finally{this.loading=false;button.disabled=false;}
    }
    recalculate(){
      if(!data.getCache())return null;
      try{const result=data.recalculate(this.config());q("scalpSimLoadStatus").classList.remove("is-error");this.renderResults(result);return result;}
      catch(error){q("scalpSimLoadStatus").textContent=error&&error.message||String(error);q("scalpSimLoadStatus").classList.add("is-error");return null;}
    }
    summarize(result){
      const trades=Array.isArray(result&&result.trades)?result.trades:[],wins=trades.filter(row=>Number(row.pnlUsd)>0),losses=trades.filter(row=>Number(row.pnlUsd)<0),totalProfit=wins.reduce((sum,row)=>sum+Number(row.pnlUsd),0),totalLoss=Math.abs(losses.reduce((sum,row)=>sum+Number(row.pnlUsd),0)),totalPnl=totalProfit-totalLoss;
      return {events:Number(result&&result.eventsShown)||0,trades,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length*100:0,totalProfit,totalLoss,totalPnl,ratio:totalLoss>0?totalProfit/totalLoss:totalProfit>0?Infinity:0};
    }
    renderResults(result){
      const stats=this.summarize(result),set=(id,value)=>{q(id).textContent=value;};set("scalpSimStatEvents",String(stats.events));set("scalpSimStatWinRate",`${stats.winRate.toFixed(1)}%`);set("scalpSimStatPnl",money(stats.totalPnl));set("scalpSimStatRatio",Number.isFinite(stats.ratio)?stats.ratio.toFixed(2):"∞");set("scalpSimStatWins",String(stats.wins));set("scalpSimStatLosses",String(stats.losses));set("scalpSimStatProfit",money(stats.totalProfit));set("scalpSimStatLoss",money(-stats.totalLoss));
      const body=q("scalpSimResultsBody");body.replaceChildren();
      if(!stats.trades.length){const row=document.createElement("tr"),cell=document.createElement("td");cell.colSpan=5;cell.textContent="No resolved trades";row.appendChild(cell);body.appendChild(row);return;}
      for(const trade of stats.trades){const row=document.createElement("tr"),values=[new Date(Number(trade.entryTimeMs)||Number(trade.candleTimeMs)).toLocaleString(),trade.direction,String(trade.rank),money(trade.mddUsd),`${money(trade.pnlUsd)} · ${trade.exitReason}`];for(const value of values){const cell=document.createElement("td");cell.textContent=value;row.appendChild(cell);}body.appendChild(row);}
    }
    destroy(){this.window&&this.window.remove();this.window=null;this.active=false;}
  }

  root.ScalpSimulatorUI=ScalpSimulatorUI;
})();
