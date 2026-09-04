(() => {
  "use strict";

  const MODULE="TVD-BUILD-OBD-DBLCLICK-RF-DECIMALS";
  const PREFIX="bt001.tvd.v1.";
  const KEYS=Object.freeze({duration:PREFIX+"bucketDurationSeconds",lookback:PREFIX+"baselineLookback"});
  const DEFAULTS=Object.freeze({durationSeconds:60,lookback:20});
  const LIMITS=Object.freeze({durationMin:1,durationMax:3600,lookbackMin:2,lookbackMax:200});
  const core=window.BT001TakerVolumeDeltaCore;
  let redrawFrame=null;
  let exchangeOffsetMs=0;

  function readNumber(key,fallback,min,max){
    try{const raw=localStorage.getItem(key);if(raw==null)return fallback;const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;}catch(_error){return fallback;}
  }
  function writeNumber(key,value){try{localStorage.setItem(key,String(value));}catch(_error){}}
  const initial=Object.freeze({
    durationSeconds:readNumber(KEYS.duration,DEFAULTS.durationSeconds,LIMITS.durationMin,LIMITS.durationMax),
    lookback:Math.round(readNumber(KEYS.lookback,DEFAULTS.lookback,LIMITS.lookbackMin,LIMITS.lookbackMax))
  });
  const requestRender=()=>{
    if(redrawFrame!=null)return;
    redrawFrame=requestAnimationFrame(()=>{redrawFrame=null;render();});
  };
  const engine=core.createEngine({durationMs:initial.durationSeconds*1000,lookback:initial.lookback,onUpdate:requestRender});
  const q=id=>document.getElementById(id);
  const exchangeNow=()=>Date.now()+exchangeOffsetMs;
  const volume=value=>Number(value||0).toLocaleString(undefined,{maximumFractionDigits:3});
  const durationText=seconds=>seconds<60?seconds+"s":seconds%60===0?(seconds/60)+"m":Number(seconds/60).toFixed(1)+"m";

  function ensureGauge(){
    const obi=q("chartBookPressureGauge");
    if(!obi)return null;
    let stack=q("marketPressureGaugeStack");
    if(!stack){
      stack=document.createElement("span");stack.id="marketPressureGaugeStack";stack.className="market-pressure-gauge-stack";
      obi.parentNode.insertBefore(stack,obi);stack.appendChild(obi);
    }else if(obi.parentNode!==stack)stack.insertBefore(obi,stack.firstChild);
    let node=q("chartTakerVolumeDeltaGauge");
    if(!node){
      node=document.createElement("span");node.id="chartTakerVolumeDeltaGauge";node.className="chart-tvd-gauge";node.setAttribute("role","group");
      node.innerHTML='<span class="tvd-track" aria-hidden="true"><span class="tvd-total"><span class="tvd-sell"></span><span class="tvd-buy"></span></span></span><span class="tvd-setting tvd-duration-setting"></span><span class="tvd-setting tvd-lookback-setting"></span>';
      stack.appendChild(node);
    }
    return node;
  }
  function editSetting(slot,{value,label,min,max,step,commit}){
    if(!slot||slot.querySelector("input"))return;
    const input=document.createElement("input");
    input.type="text";input.className="tvd-setting-input";input.inputMode="decimal";input.value=String(value);input.setAttribute("aria-label",label);
    ["pointerdown","mousedown","click"].forEach(type=>input.addEventListener(type,event=>event.stopPropagation()));
    let closed=false;
    const close=()=>{if(closed)return;closed=true;slot.replaceChildren();requestRender();};
    input.addEventListener("keydown",event=>{
      if(event.key==="Enter"){
        event.preventDefault();const next=Math.max(min,Math.min(max,Number(input.value)));
        if(Number.isFinite(next)){commit(step>=1?Math.round(next):next);close();}
      }else if(event.key==="Escape"){event.preventDefault();close();}
    });
    input.addEventListener("blur",close,{once:true});slot.replaceChildren(input);input.focus();input.select();
  }
  function settingButton(slot,{text,title,label,onEdit}){
    if(!slot||slot.querySelector("input"))return;
    let button=slot.querySelector("button");
    if(!button){button=document.createElement("button");button.type="button";button.className="tvd-setting-button";slot.appendChild(button);button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();onEdit(slot);});}
    button.textContent=text;button.title=title;button.setAttribute("aria-label",label);
  }
  function setDuration(seconds){
    const next=Math.max(LIMITS.durationMin,Math.min(LIMITS.durationMax,Number(seconds)));
    if(!Number.isFinite(next))return false;
    writeNumber(KEYS.duration,next);engine.configure({durationMs:next*1000});engine.rollTo(exchangeNow());return true;
  }
  function setLookback(value){
    const next=Math.max(LIMITS.lookbackMin,Math.min(LIMITS.lookbackMax,Math.round(Number(value))));
    if(!Number.isFinite(next))return false;
    writeNumber(KEYS.lookback,next);engine.configure({lookback:next});return true;
  }
  function render(){
    const node=ensureGauge();if(!node)return;
    engine.rollTo(exchangeNow(),false);
    const model=engine.snapshot(),total=node.querySelector(".tvd-total"),buy=node.querySelector(".tvd-buy"),sell=node.querySelector(".tvd-sell");
    total.style.width=model.totalLengthPct+"%";
    sell.style.width=(model.sellPct*100)+"%";buy.style.width=(model.buyPct*100)+"%";
    node.classList.toggle("is-waiting",!model.current||model.totalVolume<=0);
    settingButton(node.querySelector(".tvd-duration-setting"),{
      text:durationText(model.durationMs/1000),title:"TVD fixed bucket duration. Click to edit seconds.",label:"TVD bucket duration "+durationText(model.durationMs/1000),
      onEdit:slot=>editSetting(slot,{value:model.durationMs/1000,label:"TVD fixed bucket duration in seconds",min:LIMITS.durationMin,max:LIMITS.durationMax,step:1,commit:setDuration})
    });
    settingButton(node.querySelector(".tvd-lookback-setting"),{
      text:model.lookback+"b",title:"TVD baseline lookback. Click to edit completed bucket count.",label:"TVD baseline lookback "+model.lookback+" completed buckets",
      onEdit:slot=>editSetting(slot,{value:model.lookback,label:"TVD baseline lookback in completed buckets",min:LIMITS.lookbackMin,max:LIMITS.lookbackMax,step:1,commit:setLookback})
    });
    const current=model.current;
    const ratio=model.magnitudeRatio==null?"warming":model.magnitudeRatio.toFixed(2)+"x";
    const buyPct=Math.round(model.buyPct*100),sellPct=Math.round(model.sellPct*100);
    const period=current?new Date(current.start).toLocaleTimeString()+"–"+new Date(current.end).toLocaleTimeString():"waiting for trades";
    node.title="TVD (Taker Volume Delta) · LIVE fixed bucket "+period+" · Total "+volume(model.totalVolume)+" · Buy "+volume(model.buyVolume)+" ("+buyPct+"%) · Sell "+volume(model.sellVolume)+" ("+sellPct+"%) · Delta "+volume(model.delta)+" · Baseline "+ratio+" across "+model.baselineSampleCount+" completed bucket(s)";
    node.setAttribute("aria-label",node.title);
  }
  function onMarketEvent(event){
    if(!event||event.type!=="aggTrade")return;
    const at=Number(event.exchangeTime);
    if(Number.isFinite(at))exchangeOffsetMs=at-Date.now();
    engine.ingest(event);
  }
  function install(){
    const hub=window.PUBLIC_MARKET_DATA_HUB;
    if(hub&&typeof hub.subscribe==="function"&&!window.__bt001TvdSubscribed){window.__bt001TvdSubscribed=true;window.__bt001TvdUnsubscribe=hub.subscribe(onMarketEvent);}
    engine.rollTo(exchangeNow());render();
  }

  const api=Object.freeze({version:MODULE,snapshot:engine.snapshot,setDurationSeconds:setDuration,setLookback,refresh:render,_ingest:onMarketEvent,_rollTo:time=>engine.rollTo(time)});
  Object.defineProperty(window,"BT001_TVD",{value:api,configurable:true});
  install();setTimeout(install,120);setTimeout(install,700);setInterval(()=>engine.rollTo(exchangeNow()),250);
})();
