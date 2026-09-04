(() => {
  "use strict";

  const MODULE="DEPTH-PROFILE-REFINEMENT-BATCH";
  const PREFIX="bt001.depthProfile.v1.";
  const WINDOW_KEY=PREFIX+"settingsWindow";
  const KEYS=Object.freeze({enabled:PREFIX+"enabled",bucketSize:PREFIX+"bucketSize",depthRange:PREFIX+"depthRange",zeroOpacityVolume:PREFIX+"zeroOpacityVolume",fullOpacityVolume:PREFIX+"fullOpacityVolume",maxBarLength:PREFIX+"maxBarLength",layerOpacity:PREFIX+"layerOpacity"});
  const DEFAULTS=Object.freeze({enabled:false,bucketSize:50,depthRange:400,zeroOpacityVolume:0,fullOpacityVolume:10,maxBarLength:600,layerOpacity:72});
  const REPAINT_MS=750;
  const PIXELS_PER_VOLUME=12;
  const core=window.BT001DepthProfileCore;
  let model=core.aggregate();
  let sourceSnapshot=null;
  let refreshTimer=null;
  let unsubscribe=null;
  let lastRefreshAt=0;
  let lastDrawAt=0;
  let settingsWindowApi=null;
  let bookControlObserver=null;

  function q(id){return document.getElementById(id);}
  function read(key,fallback){try{const value=localStorage.getItem(key);return value==null?fallback:value;}catch(_error){return fallback;}}
  function write(key,value){try{localStorage.setItem(key,String(value));}catch(_error){}}
  function numeric(key,fallback,min,max){const value=Number(read(key,fallback));return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;}
  function settings(){return Object.freeze({enabled:read(KEYS.enabled,DEFAULTS.enabled?"1":"0")==="1",bucketSize:numeric(KEYS.bucketSize,DEFAULTS.bucketSize,1,5000),depthRange:numeric(KEYS.depthRange,DEFAULTS.depthRange,10,10000),zeroOpacityVolume:numeric(KEYS.zeroOpacityVolume,DEFAULTS.zeroOpacityVolume,0,99999),fullOpacityVolume:Math.round(numeric(KEYS.fullOpacityVolume,DEFAULTS.fullOpacityVolume,1,100000)),maxBarLength:Math.round(numeric(KEYS.maxBarLength,DEFAULTS.maxBarLength,10,5000)),layerOpacity:Math.round(numeric(KEYS.layerOpacity,DEFAULTS.layerOpacity,0,100))});}
  function feed(){return window.BT001_BOOK_PRESSURE_GAUGE||null;}
  function redraw(){try{if(typeof window.draw==="function")window.draw();else if(typeof draw==="function")draw();}catch(_error){}}
  function syncToggle(){
    const current=settings(),button=q("depthProfileOverlayToggle"),settingsInput=q("depthProfileEnabled");
    if(button){button.classList.toggle("is-on",current.enabled);button.classList.toggle("is-off",!current.enabled);button.setAttribute("aria-pressed",current.enabled?"true":"false");}
    if(settingsInput)settingsInput.checked=current.enabled;
  }
  function updateSettingsStatus(){
    const node=q("depthProfileCoverageStatus");if(!node)return;
    if(!sourceSnapshot||!sourceSnapshot.fresh){node.textContent="Waiting for synchronized live depth…";node.className="depth-profile-coverage is-waiting";return;}
    node.textContent=model.coverage.complete
      ?`Live coverage confirmed for ±$${model.depthRange} (${model.buckets.length} populated buckets).`
      :`Live depth is partial at ±$${model.depthRange}; bars use only confirmed levels.`;
    node.className="depth-profile-coverage "+(model.coverage.complete?"is-complete":"is-partial");
  }
  function refreshNow(){
    if(refreshTimer!=null){clearTimeout(refreshTimer);refreshTimer=null;}
    const source=feed();
    sourceSnapshot=source&&typeof source.levelsSnapshot==="function"?source.levelsSnapshot():null;
    const current=settings();
    model=sourceSnapshot&&sourceSnapshot.fresh
      ?core.aggregate({bids:sourceSnapshot.bids,asks:sourceSnapshot.asks,price:sourceSnapshot.price,bucketSize:current.bucketSize,depthRange:current.depthRange})
      :core.aggregate({price:sourceSnapshot&&sourceSnapshot.price,bucketSize:current.bucketSize,depthRange:current.depthRange});
    lastRefreshAt=Date.now();
    updateSettingsStatus();
    redraw();
  }
  function scheduleRefresh(immediate=false){
    if(immediate){refreshNow();return;}
    if(refreshTimer!=null)return;
    const wait=Math.max(0,REPAINT_MS-(Date.now()-lastRefreshAt));
    refreshTimer=setTimeout(refreshNow,wait);
  }
  function drawUnderlay(layout){
    const current=settings();
    if(!current.enabled||!sourceSnapshot||!sourceSnapshot.fresh||!model.buckets.length)return;
    const {ctx,left,top,chartRight,priceH,minP,maxP,mapY}=layout||{};
    if(!ctx||!(chartRight>left)||!(priceH>0)||!(maxP>minP)||typeof mapY!=="function")return;
    ctx.save();
    ctx.beginPath();ctx.rect(left,top,chartRight-left,priceH);ctx.clip();
    for(const bucket of model.buckets){
      const y1=mapY(bucket.high),y2=mapY(bucket.low);
      const y=Math.max(top,Math.min(y1,y2));
      const bottom=Math.min(top+priceH,Math.max(y1,y2));
      const height=Math.max(1,bottom-y);
      const width=core.barLength(bucket.volume,PIXELS_PER_VOLUME,Math.min(chartRight-left,current.maxBarLength));
      if(!(width>0)||bottom<top||y>top+priceH)continue;
      const alpha=core.opacity(bucket.volume,current.zeroOpacityVolume,current.fullOpacityVolume,current.layerOpacity/100);
      if(!(alpha>0))continue;
      ctx.fillStyle=bucket.side==="bid"?`rgba(0,168,61,${alpha.toFixed(4)})`:`rgba(220,38,38,${alpha.toFixed(4)})`;
      ctx.fillRect(chartRight-width,y,width,height);
    }
    ctx.restore();
    lastDrawAt=Date.now();
  }
  function existingBookControl(group){
    if(!group)return null;
    const registered=group.querySelector('[data-chart-control="book"]');if(registered)return registered;
    return Array.from(document.querySelectorAll("button")).find(button=>button!==q("depthProfileOverlayToggle")&&String(button.textContent||"").trim().toLowerCase()==="book")||null;
  }
  function ensureToggle(){
    const controls=window.BT001ChartOverlayControls;
    const group=controls&&typeof controls.group==="function"?controls.group():q("chartOverlayControlGroup");
    if(!group)return null;
    const book=existingBookControl(group);
    if(book&&controls&&typeof controls.register==="function")controls.register(book,"book");
    let button=q("depthProfileOverlayToggle");
    if(!button){
      button=document.createElement("button");button.id="depthProfileOverlayToggle";button.type="button";button.className="calc-module-orders-toggle depth-profile-overlay-toggle is-off";button.textContent="OBD";button.title="Toggle Depth Profile · double-click or right-click for settings";button.setAttribute("aria-label","Order book depth profile visibility");button.setAttribute("aria-pressed","false");
    }
    if(controls&&typeof controls.register==="function")controls.register(button,"obd");else{button.dataset.chartControl="obd";group.appendChild(button);}
    if(!button.__depthProfileBound){
      button.__depthProfileBound=true;
      button.addEventListener("click",()=>{write(KEYS.enabled,settings().enabled?"0":"1");syncToggle();scheduleRefresh(true);},false);
      button.addEventListener("dblclick",event=>{event.preventDefault();openSettings();},false);
      button.addEventListener("contextmenu",event=>{event.preventDefault();openSettings();},false);
    }
    syncToggle();return button;
  }
  function watchBookControl(){
    const controls=window.BT001ChartOverlayControls,group=controls&&typeof controls.group==="function"?controls.group():q("chartOverlayControlGroup");
    if(existingBookControl(group)){if(bookControlObserver){bookControlObserver.disconnect();bookControlObserver=null;}ensureToggle();return;}
    if(bookControlObserver||typeof MutationObserver!=="function"||!document.body)return;
    bookControlObserver=new MutationObserver(()=>{const currentGroup=controls&&typeof controls.group==="function"?controls.group():q("chartOverlayControlGroup");if(existingBookControl(currentGroup)){bookControlObserver.disconnect();bookControlObserver=null;ensureToggle();}});
    bookControlObserver.observe(document.body,{childList:true,subtree:true});
  }
  function bindControl(id,key,{output,min,max,normalize=value=>value,suffix=""}={}){
    const input=q(id);if(!input||input.__depthProfileBound)return;
    input.__depthProfileBound=true;
    const commit=()=>{let value=Math.max(min,Math.min(max,Number(input.value)));if(!Number.isFinite(value))return;value=normalize(value);input.value=String(value);write(key,value);const out=q(output);if(out)out.textContent=String(value)+suffix;scheduleRefresh(true);};
    input.addEventListener("input",commit,false);input.addEventListener("change",commit,false);
  }
  function settingsMarkup(current){return `<div class="depth-profile-settings-intro">Resting bid/ask liquidity from the synchronized deep book. Settings update the chart live.</div>
      <label class="toggle depth-profile-settings-toggle"><input id="depthProfileEnabled" type="checkbox" ${current.enabled?"checked":""}> Show Depth Profile on chart</label>
      <div class="depth-profile-settings-grid">
        <label for="depthProfileBucketSize">Bucket size ($)</label><input id="depthProfileBucketSize" type="number" min="1" max="5000" step="1" value="${current.bucketSize}"><output id="depthProfileBucketSizeValue">${current.bucketSize}</output>
        <label for="depthProfileRange">Depth range each side ($)</label><input id="depthProfileRange" type="number" min="10" max="10000" step="10" value="${current.depthRange}"><output id="depthProfileRangeValue">${current.depthRange}</output>
        <label for="depthProfileZeroOpacityVolume">Zero-opacity volume</label><input id="depthProfileZeroOpacityVolume" type="number" min="0" max="99999" step="0.1" value="${current.zeroOpacityVolume}"><output id="depthProfileZeroOpacityVolumeValue">${current.zeroOpacityVolume}</output>
        <label for="depthProfileFullOpacityVolume">Full-opacity volume</label><input id="depthProfileFullOpacityVolume" type="number" min="1" max="100000" step="1" value="${current.fullOpacityVolume}"><output id="depthProfileFullOpacityVolumeValue">${current.fullOpacityVolume}</output>
        <label for="depthProfileMaxBarLength">Maximum bar length (px)</label><input id="depthProfileMaxBarLength" type="number" min="10" max="5000" step="10" value="${current.maxBarLength}"><output id="depthProfileMaxBarLengthValue">${current.maxBarLength}</output>
        <label for="depthProfileLayerOpacity">Overall layer opacity</label><input id="depthProfileLayerOpacity" type="range" min="0" max="100" step="1" value="${current.layerOpacity}"><output id="depthProfileLayerOpacityValue">${current.layerOpacity}%</output>
      </div><div class="depth-profile-settings-note">Volume opacity is zero at the lower threshold, scales linearly to the full-opacity threshold, then is multiplied by overall layer opacity. Visual data refresh: 750 ms.</div><div id="depthProfileCoverageStatus" class="depth-profile-coverage"></div>`;}
  function bindSettingsControls(){
    const enabledInput=q("depthProfileEnabled");if(enabledInput&&!enabledInput.__depthProfileBound){enabledInput.__depthProfileBound=true;enabledInput.addEventListener("change",()=>{write(KEYS.enabled,enabledInput.checked?"1":"0");syncToggle();scheduleRefresh(true);},false);}
    bindControl("depthProfileBucketSize",KEYS.bucketSize,{output:"depthProfileBucketSizeValue",min:1,max:5000});
    bindControl("depthProfileRange",KEYS.depthRange,{output:"depthProfileRangeValue",min:10,max:10000});
    bindControl("depthProfileZeroOpacityVolume",KEYS.zeroOpacityVolume,{output:"depthProfileZeroOpacityVolumeValue",min:0,max:99999});
    bindControl("depthProfileFullOpacityVolume",KEYS.fullOpacityVolume,{output:"depthProfileFullOpacityVolumeValue",min:1,max:100000,normalize:Math.round});
    bindControl("depthProfileMaxBarLength",KEYS.maxBarLength,{output:"depthProfileMaxBarLengthValue",min:10,max:5000,normalize:Math.round});
    bindControl("depthProfileLayerOpacity",KEYS.layerOpacity,{output:"depthProfileLayerOpacityValue",min:0,max:100,normalize:Math.round,suffix:"%"});
    updateSettingsStatus();syncToggle();
  }
  function ensureSettingsWindow(){
    let win=q("depthProfileSettingsWindow");if(win)return win;
    win=document.createElement("section");win.id="depthProfileSettingsWindow";win.className="calc-module-window depth-profile-settings-window hidden";win.setAttribute("aria-label","Depth Profile settings");
    win.innerHTML=`<header class="calc-module-head" id="depthProfileSettingsHead" data-floating-window-header><div class="calc-module-title">Depth Profile settings</div><div class="calc-module-actions"><button id="depthProfileSettingsClose" type="button" title="Close" aria-label="Close Depth Profile settings">×</button></div></header><div class="calc-module-body depth-profile-settings-body">${settingsMarkup(settings())}</div>`;
    document.body.appendChild(win);
    const floating=window.BT001FloatingWindow;if(floating&&typeof floating.install==="function")settingsWindowApi=floating.install(win,{header:q("depthProfileSettingsHead"),storageKey:WINDOW_KEY,minWidth:380,minHeight:320,defaultWidth:440,defaultHeight:390});
    q("depthProfileSettingsClose").addEventListener("click",()=>{if(settingsWindowApi)settingsWindowApi.hide();else win.classList.add("hidden");},false);
    bindSettingsControls();return win;
  }
  function openSettings(){
    const win=ensureSettingsWindow(),modal=q("settingsModal");
    if(modal)modal.classList.add("hidden");
    if(settingsWindowApi)settingsWindowApi.show();else win.classList.remove("hidden");
    bindSettingsControls();
  }
  function mountSettings(root){
    if(!root&&window.BT001SettingsTabs){const record=window.BT001SettingsTabs.get("heatmap");root=record&&record.body;}
    if(!root)return false;
    const current=settings();
    let card=q("depthProfileSettingsCard");
    if(!card){card=document.createElement("div");card.id="depthProfileSettingsCard";card.className="settings-card depth-profile-settings-card";root.appendChild(card);}
    card.innerHTML=`<div class="settings-card-title">Depth Profile</div>
      <div class="settings-card-desc">Controls open in a non-blocking floating panel so the chart and trading controls remain usable.</div><div class="depth-profile-settings-launcher"><span>OBD layer controls</span><button id="depthProfileOpenSettings" type="button">Open floating settings</button></div>`;
    q("depthProfileOpenSettings").addEventListener("click",openSettings,false);
    return true;
  }
  function install(){
    ensureToggle();watchBookControl();
    const source=feed();
    if(!unsubscribe&&source&&typeof source.subscribeDepth==="function")unsubscribe=source.subscribeDepth(()=>scheduleRefresh(false));
    scheduleRefresh(true);
  }
  const api=Object.freeze({version:MODULE,drawUnderlay,mountSettings,openSettings,refresh:()=>scheduleRefresh(true),settings,snapshot:()=>Object.freeze({model,source:sourceSnapshot,lastRefreshAt,lastDrawAt,repaintMs:REPAINT_MS,pixelsPerVolume:PIXELS_PER_VOLUME})});
  Object.defineProperty(window,"BT001_DEPTH_PROFILE",{value:api,configurable:true});
  install();setTimeout(install,120);setTimeout(install,700);
})();
