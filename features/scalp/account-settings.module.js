(() => {
  "use strict";

  const STORE="btc_futures_chart_v12_";
  const SK_SCALPER=STORE+"api_key_scalper";
  const SS_SCALPER=STORE+"api_secret_scalper";
  const SR_SCALPER=STORE+"remember_keys_scalper";
  const NICK_MAIN=STORE+"api_nickname_main";
  const NICK_SCALPER=STORE+"api_nickname_scalper";
  const SCALP_SLOT_KEY=STORE+"scalp_account_slot";
  const INTERFACE_SLOT_KEY=STORE+"main_interface_account_slot";
  const FUTURES_BASE="https://fapi.binance.com";
  const SPOT_BASE="https://api.binance.com";
  const $=id=>document.getElementById(id);
  const upper=value=>String(value==null?"":value).toUpperCase();
  const n=value=>Number.isFinite(Number(value))?Number(value):null;
  const listeners=new Set();
  const successfulSyncAt={main:0,scalper:0};
  const timeCache={futures:{offset:0,at:0},spot:{offset:0,at:0}};
  let connectionStatusBySlot={main:null,scalper:null};

  function getSlot(){
    const value=String(localStorage.getItem(SCALP_SLOT_KEY)||"main");
    return value==="scalper"?"scalper":"main";
  }
  function setSlot(slot){
    const next=slot==="scalper"?"scalper":"main";
    if(getSlot()===next)return;
    try{localStorage.setItem(SCALP_SLOT_KEY,next);}catch(_e){}
    notify();
    try{window.dispatchEvent(new CustomEvent("bt001:scalp-account-slot-changed",{detail:{slot:next}}));}catch(_e){}
  }
  function getInterfaceSlot(){
    const value=String(localStorage.getItem(INTERFACE_SLOT_KEY)||"main");
    return value==="scalper"?"scalper":"main";
  }
  function setInterfaceSlot(slot){
    const next=slot==="scalper"?"scalper":"main";
    if(getInterfaceSlot()===next){render();return;}
    try{localStorage.setItem(INTERFACE_SLOT_KEY,next);}catch(_e){}
    notify();
    try{if(typeof window.updateTabTitle==="function")window.updateTabTitle();}catch(_e){}
    try{window.dispatchEvent(new CustomEvent("bt001:main-account-slot-changed",{detail:{slot:next,nickname:getNickname(next)}}));}catch(_e){}
  }
  function switchInterfaceSlot(slot){
    setInterfaceSlot(slot);
    try{if(window.location&&typeof window.location.reload==="function")window.location.reload();}catch(_e){}
  }
  function getNickname(slot){
    const key=slot==="scalper"?NICK_SCALPER:NICK_MAIN,fallback=slot==="scalper"?"Scalper":"Main";
    try{return localStorage.getItem(key)||fallback;}catch(_e){return fallback;}
  }
  function setNickname(slot,value){
    const key=slot==="scalper"?NICK_SCALPER:NICK_MAIN,fallback=slot==="scalper"?"Scalper":"Main";
    try{localStorage.setItem(key,String(value||"").trim()||fallback);}catch(_e){}
    notify();
  }
  function getCredentials(slot){
    const suffix=slot==="scalper"?"Scalper":"",keyEl=$("apiKey"+suffix),secretEl=$("apiSecret"+suffix);
    return {key:keyEl?keyEl.value.trim():"",secret:secretEl?secretEl.value.trim():""};
  }
  function getInterfaceCredentials(){return getCredentials(getInterfaceSlot());}
  function hasScalperKeys(){const credentials=getCredentials("scalper");return !!(credentials.key&&credentials.secret);}
  function getScalperCredentials(){return getCredentials("scalper");}
  function isConfigured(slot){const credentials=getCredentials(slot);return !!(credentials.key&&credentials.secret);}
  function saveScalperKeysLocal(){
    const rememberEl=$("rememberKeysScalper"),credentials=getCredentials("scalper");
    if(!rememberEl)return;
    if(!rememberEl.checked){
      try{localStorage.removeItem(SK_SCALPER);localStorage.removeItem(SS_SCALPER);localStorage.setItem(SR_SCALPER,"0");}catch(_e){}
      notify();return;
    }
    try{localStorage.setItem(SR_SCALPER,"1");localStorage.setItem(SK_SCALPER,credentials.key);localStorage.setItem(SS_SCALPER,credentials.secret);}catch(_e){}
    notify();
  }
  function restoreScalperKeys(){
    const rememberEl=$("rememberKeysScalper"),keyEl=$("apiKeyScalper"),secretEl=$("apiSecretScalper");
    if(!rememberEl||!keyEl||!secretEl)return;
    let remembered="1";try{remembered=localStorage.getItem(SR_SCALPER);}catch(_e){}
    if(remembered==="0"){rememberEl.checked=false;return;}
    rememberEl.checked=true;
    try{keyEl.value=localStorage.getItem(SK_SCALPER)||"";secretEl.value=localStorage.getItem(SS_SCALPER)||"";}catch(_e){}
  }
  function clearScalperKeys(){
    try{localStorage.removeItem(SK_SCALPER);localStorage.removeItem(SS_SCALPER);localStorage.setItem(SR_SCALPER,"0");}catch(_e){}
    const keyEl=$("apiKeyScalper"),secretEl=$("apiSecretScalper"),rememberEl=$("rememberKeysScalper");
    if(keyEl)keyEl.value="";if(secretEl)secretEl.value="";if(rememberEl)rememberEl.checked=false;notify();
  }
  function snapshot(){
    return {slot:getSlot(),interfaceSlot:getInterfaceSlot(),accounts:{
      main:{nickname:getNickname("main"),configured:isConfigured("main"),connection:connectionStatusBySlot.main},
      scalper:{nickname:getNickname("scalper"),configured:isConfigured("scalper"),connection:connectionStatusBySlot.scalper}
    }};
  }
  function subscribe(listener){listeners.add(listener);try{listener(snapshot());}catch(_e){}return()=>listeners.delete(listener);}
  function notify(){const value=snapshot();listeners.forEach(listener=>{try{listener(value);}catch(_e){}});render();}
  function reportConnectionStatus(slot,status){connectionStatusBySlot[slot==="scalper"?"scalper":"main"]=status||null;notify();}
  function render(){
    const nicknameMain=$("apiNicknameMain"),nicknameScalper=$("apiNicknameScalper");
    if(nicknameMain&&document.activeElement!==nicknameMain)nicknameMain.value=getNickname("main");
    if(nicknameScalper&&document.activeElement!==nicknameScalper)nicknameScalper.value=getNickname("scalper");
    const toggleMain=$("apiScalperToggleMain"),toggleScalper=$("apiScalperToggleScalper"),slot=getSlot();
    if(toggleMain)toggleMain.checked=slot==="main";
    if(toggleScalper)toggleScalper.checked=slot==="scalper";
    const interfaceSlot=getInterfaceSlot();
    [["main","switchBinanceAccountMain"],["scalper","switchBinanceAccountScalper"]].forEach(([accountSlot,id])=>{
      const button=$(id);if(!button)return;
      const active=accountSlot===interfaceSlot;
      button.disabled=active;button.textContent=active?"Active":"Switch to";
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-pressed",active?"true":"false");
      button.title=active?`${getNickname(accountSlot)} is active for the main interface`:`Use ${getNickname(accountSlot)} for chart, manual trading, and calculator`;
    });
  }

  function modalFor(slot){return $(slot==="scalper"?"apiModalScalper":"apiModal");}
  function credentialInputFor(slot){return $(slot==="scalper"?"apiKeyScalper":"apiKey");}
  function closeCredentialModals(){["apiModal","apiModalScalper"].forEach(id=>{const modal=$(id);if(modal)modal.classList.add("hidden");});}
  function openCredentialModal(slot,event){
    if(event){event.preventDefault();event.stopImmediatePropagation();}
    const settings=$("settingsModal"),target=modalFor(slot),other=modalFor(slot==="scalper"?"main":"scalper");
    if(settings)settings.classList.add("hidden");
    if(other)other.classList.add("hidden");
    if(target)target.classList.remove("hidden");
    const input=credentialInputFor(slot);if(input)input.focus();
  }
  function closeScalperApiModal(){const modal=$("apiModalScalper");if(modal)modal.classList.add("hidden");}
  function publishCredentialChange(slot){
    try{window.dispatchEvent(new CustomEvent("bt001:api-account-credentials-changed",{detail:{slot:slot==="scalper"?"scalper":"main"}}));}catch(_e){}
  }

  async function hmacHex(secret,message){
    if(!window.crypto||!window.crypto.subtle)throw new Error("Secure signing is unavailable in this browser.");
    const encoder=new TextEncoder(),key=await window.crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    const signature=await window.crypto.subtle.sign("HMAC",key,encoder.encode(message));
    return Array.from(new Uint8Array(signature)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
  }
  async function serverOffset(kind){
    const cache=timeCache[kind],now=Date.now();
    if(now-cache.at<30000)return cache.offset;
    const rest=window.restService;if(!rest)throw new Error("REST service is unavailable.");
    const url=kind==="spot"?SPOT_BASE+"/api/v3/time":FUTURES_BASE+"/fapi/v1/time",data=await rest.get(url),serverTime=n(data&&data.serverTime);
    if(serverTime==null)throw new Error("Binance server time was unavailable.");
    cache.offset=serverTime-now;cache.at=now;return cache.offset;
  }
  async function signedGet(kind,path,credentials,params={}){
    const rest=window.restService;if(!rest)throw new Error("REST service is unavailable.");
    const offset=await serverOffset(kind),query=new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now()+offset)}).toString(),signature=await hmacHex(credentials.secret,query),base=kind==="spot"?SPOT_BASE:FUTURES_BASE;
    return rest.requestJson(`${base}${path}?${query}&signature=${signature}`,{method:"GET",cache:"no-store",headers:{"X-MBX-APIKEY":credentials.key}});
  }
  async function settled(label,promise){
    try{return {label,ok:true,data:await promise,error:null};}
    catch(error){return {label,ok:false,data:null,error:{message:error&&error.message||String(error),code:error&&error.code}};}
  }
  function permissionValue(...values){const defined=values.filter(value=>typeof value==="boolean");return defined.length?defined.some(Boolean):null;}
  function accountMode(spotReachable,futuresReachable){return spotReachable&&futuresReachable?"Both":futuresReachable?"Futures":spotReachable?"Spot":"Invalid";}
  function activeSymbol(){
    try{return window.BT001_BINANCE_TRADING&&window.BT001_BINANCE_TRADING.symbol?window.BT001_BINANCE_TRADING.symbol():"BTCUSDT";}catch(_e){return "BTCUSDT";}
  }
  async function readAccount(slot){
    const credentials=getCredentials(slot),symbol=activeSymbol();
    if(!credentials.key||!credentials.secret)return {slot,symbol,configured:false,mode:"Invalid",lastSyncAt:successfulSyncAt[slot],futuresReachable:false,spotReachable:false,permissions:{canTrade:null,canDeposit:null,canWithdraw:null},futures:{},errors:[{message:"API key and secret are not configured."}]};
    const [spot,futures]=await Promise.all([
      settled("Spot account",signedGet("spot","/api/v3/account",credentials)),
      settled("Futures account",signedGet("futures","/fapi/v2/account",credentials))
    ]);
    const extras=futures.ok?await Promise.all([
      settled("Position mode",signedGet("futures","/fapi/v1/positionSide/dual",credentials)),
      settled("Multi-assets mode",signedGet("futures","/fapi/v1/multiAssetsMargin",credentials)),
      settled("Commission rate",signedGet("futures","/fapi/v1/commissionRate",credentials,{symbol})),
      settled("Position risk",signedGet("futures","/fapi/v2/positionRisk",credentials,{symbol}))
    ]):[];
    const byLabel=Object.fromEntries(extras.map(result=>[result.label,result])),spotReachable=spot.ok,futuresReachable=futures.ok,mode=accountMode(spotReachable,futuresReachable);
    if(spotReachable||futuresReachable)successfulSyncAt[slot]=Date.now();
    const spotData=spot.data||{},futuresData=futures.data||{},positions=byLabel["Position risk"]&&byLabel["Position risk"].ok&&Array.isArray(byLabel["Position risk"].data)?byLabel["Position risk"].data:[],position=positions.find(row=>upper(row&&row.symbol)===upper(symbol))||null,commission=byLabel["Commission rate"]&&byLabel["Commission rate"].data||{},dual=byLabel["Position mode"]&&byLabel["Position mode"].data,multi=byLabel["Multi-assets mode"]&&byLabel["Multi-assets mode"].data;
    return {
      slot,symbol,configured:true,mode,lastSyncAt:successfulSyncAt[slot],spotReachable,futuresReachable,
      permissions:{
        canTrade:permissionValue(spotData.canTrade,futuresData.canTrade),
        canDeposit:permissionValue(spotData.canDeposit,futuresData.canDeposit),
        canWithdraw:permissionValue(spotData.canWithdraw,futuresData.canWithdraw)
      },
      futures:{
        positionMode:dual&&dual.dualSidePosition===true?"Hedge Mode":dual?"One-way":"-",
        multiAssetsMode:multi&&multi.multiAssetsMargin===true?"Multi-Assets":multi?"Single-Asset":"-",
        marginType:position&&position.marginType?String(position.marginType):"-",
        leverage:position&&n(position.leverage)!=null?`${Math.round(n(position.leverage))}x`:"-",
        makerRate:commission&&commission.makerCommissionRate!=null?commission.makerCommissionRate:"-",
        takerRate:commission&&commission.takerCommissionRate!=null?commission.takerCommissionRate:"-"
      },
      errors:[spot,futures,...extras].filter(result=>!result.ok).map(result=>({label:result.label,...result.error}))
    };
  }

  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));}
  function yesNo(value){return value==null?"-":value?"Yes":"No";}
  function badge(value){const cls=value==null?"is-neutral":value?"is-good":"is-bad";return `<span class="api-capability-badge ${cls}">${yesNo(value)}</span>`;}
  function row(label,value,options={}){return `<div class="api-capability-row${options.wide?" is-wide":""}"><span class="api-capability-label">${esc(label)}</span><span class="api-capability-value${options.badge?" is-badge":""}${options.error?" is-error":""}">${options.html?value:esc(value)}</span></div>`;}
  function formatSync(value){return value?new Date(value).toLocaleString():"-";}
  function renderStatus(result){
    const errors=result.errors||[],futures=result.futures||{},content=$("apiAccountStatusContent");
    if(!content)return;
    content.innerHTML=`<div class="api-capability-grid">
      ${row("Detected account mode",result.mode)}
      ${row("Last successful sync",formatSync(result.lastSyncAt))}
      ${row("Futures reachable",badge(result.futuresReachable),{badge:true,html:true})}
      ${row("Spot reachable",badge(result.spotReachable),{badge:true,html:true})}
      ${row("canTrade",badge(result.permissions&&result.permissions.canTrade),{badge:true,html:true})}
      ${row("canDeposit",badge(result.permissions&&result.permissions.canDeposit),{badge:true,html:true})}
      ${row("canWithdraw",badge(result.permissions&&result.permissions.canWithdraw),{badge:true,html:true})}
      ${row("Last API error / message",errors.length?errors.map(error=>`${error.label?error.label+": ":""}${error.code!=null?"["+error.code+"] ":""}${error.message}`).join(" | "):"-",{wide:true,error:errors.length>0})}
    </div>
    <div class="api-capability-subtitle">Futures details for ${esc(result.symbol)}</div>
    <div class="api-capability-grid">
      ${row("Position mode",futures.positionMode||"-")}
      ${row("Multi-assets mode",futures.multiAssetsMode||"-")}
      ${row("Margin type",futures.marginType||"-")}
      ${row("Leverage",futures.leverage||"-")}
      ${row("Maker / taker fee",`${futures.makerRate||"-"} / ${futures.takerRate||"-"}`,{wide:true})}
    </div>`;
  }
  function openStatusWindow(slot){
    const win=$("apiAccountStatusWindow"),title=$("apiAccountStatusTitle"),subtitle=$("apiAccountStatusSubtitle"),content=$("apiAccountStatusContent");
    if(!win||!content)return Promise.resolve(null);
    title.textContent=`${getNickname(slot)} — Binance Account Status`;
    subtitle.textContent=`${slot==="main"?"Main":"Scalper"} account · SCALP ${getSlot()===slot?"enabled":"not enabled"}`;
    content.innerHTML='<div class="api-account-status-loading">Reading Binance account status…</div>';
    win.classList.remove("hidden");
    return readAccount(slot).then(result=>{renderStatus(result);return result;}).catch(error=>{content.innerHTML=`<div class="api-account-status-error">${esc(error&&error.message||String(error))}</div>`;return null;});
  }
  function closeStatusWindow(){const win=$("apiAccountStatusWindow");if(win)win.classList.add("hidden");}
  function bindStatusDrag(){
    const win=$("apiAccountStatusWindow"),head=$("apiAccountStatusHead");if(!win||!head||head.dataset.dragBound==="1")return;head.dataset.dragBound="1";
    let drag=null;
    head.addEventListener("pointerdown",event=>{
      if(event.target.closest&&event.target.closest("button"))return;
      const rect=win.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};win.style.transform="none";win.style.left=rect.left+"px";win.style.top=rect.top+"px";
      try{head.setPointerCapture(event.pointerId);}catch(_e){}
    });
    head.addEventListener("pointermove",event=>{if(!drag)return;win.style.left=Math.max(0,Math.min(window.innerWidth-win.offsetWidth,drag.left+event.clientX-drag.x))+"px";win.style.top=Math.max(0,Math.min(window.innerHeight-40,drag.top+event.clientY-drag.y))+"px";});
    const stop=()=>{drag=null;};head.addEventListener("pointerup",stop);head.addEventListener("pointercancel",stop);
  }

  function bindCredentialButton(id,slot){
    const button=$(id);if(!button||button.dataset.accountDialogBound==="1")return;button.dataset.accountDialogBound="1";
    button.addEventListener("click",event=>openCredentialModal(slot,event),true);
  }
  function bind(){
    const nicknameMain=$("apiNicknameMain"),nicknameScalper=$("apiNicknameScalper");
    if(nicknameMain)nicknameMain.addEventListener("change",()=>setNickname("main",nicknameMain.value));
    if(nicknameScalper)nicknameScalper.addEventListener("change",()=>setNickname("scalper",nicknameScalper.value));
    const toggleMain=$("apiScalperToggleMain"),toggleScalper=$("apiScalperToggleScalper");
    if(toggleMain)toggleMain.addEventListener("change",()=>{if(toggleMain.checked)setSlot("main");else render();});
    if(toggleScalper)toggleScalper.addEventListener("change",()=>{if(toggleScalper.checked)setSlot("scalper");else render();});

    bindCredentialButton("openBinanceSettings","main");
    bindCredentialButton("openBinanceSettingsScalper","scalper");
    const closeScalper=$("closeApiKeysScalper");if(closeScalper)closeScalper.addEventListener("click",closeScalperApiModal);
    const modalScalper=$("apiModalScalper");if(modalScalper)modalScalper.addEventListener("click",event=>{if(event.target===modalScalper)closeScalperApiModal();});
    const saveMain=$("saveApiKeys");if(saveMain)saveMain.addEventListener("click",()=>publishCredentialChange("main"));
    const saveScalper=$("saveApiKeysScalper");if(saveScalper)saveScalper.addEventListener("click",()=>{
      saveScalperKeysLocal();publishCredentialChange("scalper");closeScalperApiModal();
      if(getInterfaceSlot()==="scalper"){try{if(window.location&&typeof window.location.reload==="function")window.location.reload();}catch(_e){}}
    });
    const readMain=$("readBinanceAccountMain"),readScalper=$("readBinanceAccountScalper"),closeStatus=$("closeApiAccountStatus");
    if(readMain)readMain.addEventListener("click",()=>openStatusWindow("main"));
    if(readScalper)readScalper.addEventListener("click",()=>openStatusWindow("scalper"));
    const switchMain=$("switchBinanceAccountMain"),switchScalper=$("switchBinanceAccountScalper");
    if(switchMain)switchMain.addEventListener("click",()=>switchInterfaceSlot("main"));
    if(switchScalper)switchScalper.addEventListener("click",()=>switchInterfaceSlot("scalper"));
    if(closeStatus)closeStatus.addEventListener("click",closeStatusWindow);
    window.addEventListener("keydown",event=>{if(event.key==="Escape"){closeScalperApiModal();closeStatusWindow();}});
    restoreScalperKeys();bindStatusDrag();render();
  }

  // This deferred script is intentionally loaded before main.js. Restore the second slot now so
  // an already-selected second account is available to main.js's very first authenticated read.
  restoreScalperKeys();
  window.BT001ScalpAccount=Object.freeze({
    getSlot,setSlot,getInterfaceSlot,setInterfaceSlot,getInterfaceCredentials,getCredentials,getNickname,isConfigured,getScalperCredentials,hasScalperKeys,clearScalperKeys,
    reportConnectionStatus,subscribe,snapshot,openCredentialModal,openStatusWindow,readAccount
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
