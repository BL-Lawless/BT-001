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
  const signedVolume=value=>{const n=Number(value)||0;return (n>0?"+":n<0?"-":"")+volume(Math.abs(n));};
  const signedPrice=value=>{const n=Number(value)||0;return (n>0?"+$":n<0?"-$":"$")+Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:2});};
  const tone=value=>Number(value)>0?"positive":Number(value)<0?"negative":"neutral";
  const miniBar=(kind,value,magnitude)=>'<i class="tvd-relation-bar-cell is-'+kind+'"><b class="tvd-relation-bar is-'+tone(value)+'" style="height:'+(value===0?1:Math.max(3,magnitude*48)).toFixed(2)+'%"></b></i>';

  function renderRelationship(node,model){
    const display=node&&node.querySelector(".tvd-delta-price-display");if(!display)return;
    const current=model.current||{};
    display.querySelector(".tvd-current-delta").textContent="Δ: "+signedVolume(model.delta);
    display.querySelector(".tvd-current-price").textContent="Px: "+signedPrice(current.priceChange);
    const tooltip=display.querySelector(".tvd-relation-tooltip");
    const rows=core.relationshipModel(model.baselineBuckets);
    if(!rows.length){tooltip.innerHTML='<div class="tvd-relation-heading">Completed buckets: 0/'+model.lookback+'</div><div class="tvd-relation-empty">Waiting for completed TVD buckets</div>';return;}
    const pairs=rows.map((row,index)=>{
      const bucket=row.bucket||{},time=new Date(Number(bucket.start)||0).toLocaleTimeString();
      const reason=row.directionMismatch?"direction mismatch":row.magnitudeMismatch?"magnitude mismatch":"proportionate";
      return '<span class="tvd-relation-pair'+(row.divergent?' is-divergent':'')+'" title="'+time+' · Δ '+signedVolume(row.delta)+' · Px '+signedPrice(row.priceChange)+' · '+reason+'">'+miniBar("delta",row.delta,row.deltaMagnitude)+miniBar("price",row.priceChange,row.priceMagnitude)+'</span>';
    }).join("");
    tooltip.innerHTML='<div class="tvd-relation-heading">Completed buckets: '+rows.length+'/'+model.lookback+' · oldest → newest</div><div class="tvd-relation-chart">'+pairs+'</div><div class="tvd-relation-legend"><span>Δ</span><span>Px</span><span class="is-divergence-key">divergence</span></div>';
  }

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
      node.innerHTML='<span class="tvd-track" role="button" tabindex="0" aria-label="Edit TVD bucket duration and baseline lookback"><span class="tvd-total"><span class="tvd-sell"></span><span class="tvd-buy"></span></span></span><span class="tvd-delta-price-display" tabindex="0"><span class="tvd-current-delta">Δ: 0</span><span class="tvd-current-price">Px: $0</span><span class="tvd-relation-tooltip" role="tooltip"></span></span>';
      stack.appendChild(node);
    }
    const track=node.querySelector(".tvd-track");
    if(track&&!track.__tvdEditBound){
      track.__tvdEditBound=true;
      track.addEventListener("pointerdown",event=>event.stopPropagation());
      track.addEventListener("mousedown",event=>event.stopPropagation());
      track.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();openSettingsEditor(node);});
      track.addEventListener("keydown",event=>{
        if(event.key!=="Enter"&&event.key!==" ")return;
        event.preventDefault();event.stopPropagation();openSettingsEditor(node);
      });
    }
    return node;
  }
  function openSettingsEditor(node){
    if(!node||node.querySelector(".tvd-settings-editor"))return;
    const model=engine.snapshot();
    const editor=document.createElement("span");editor.className="tvd-settings-editor";
    editor.innerHTML='<input class="tvd-setting-input tvd-duration-input" type="text" inputmode="decimal" aria-label="TVD fixed bucket duration in seconds" title="Bucket duration (seconds)"><input class="tvd-setting-input tvd-lookback-input" type="text" inputmode="numeric" aria-label="TVD baseline lookback in completed buckets" title="Baseline lookback (completed buckets)">';
    const durationInput=editor.querySelector(".tvd-duration-input"),lookbackInput=editor.querySelector(".tvd-lookback-input");
    durationInput.value=String(model.durationMs/1000);lookbackInput.value=String(model.lookback);
    ["pointerdown","mousedown","click"].forEach(type=>editor.addEventListener(type,event=>event.stopPropagation()));
    let closed=false;
    const close=()=>{if(closed)return;closed=true;editor.remove();requestRender();};
    const commit=()=>{
      const duration=Math.max(LIMITS.durationMin,Math.min(LIMITS.durationMax,Number(durationInput.value)));
      const lookback=Math.max(LIMITS.lookbackMin,Math.min(LIMITS.lookbackMax,Math.round(Number(lookbackInput.value))));
      if(!Number.isFinite(duration)||!Number.isFinite(lookback))return false;
      setDuration(Math.round(duration));setLookback(lookback);close();return true;
    };
    editor.addEventListener("keydown",event=>{
      if(event.key==="Enter"){
        event.preventDefault();commit();
      }else if(event.key==="Escape"){event.preventDefault();close();}
    });
    editor.addEventListener("focusout",()=>setTimeout(()=>{if(!editor.contains(document.activeElement))close();},0));
    node.insertBefore(editor,node.querySelector(".tvd-delta-price-display"));durationInput.focus();durationInput.select();
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
    renderRelationship(node,model);
    const current=model.current;
    const ratio=model.magnitudeRatio==null?"warming":model.magnitudeRatio.toFixed(2)+"x";
    const buyPct=Math.round(model.buyPct*100),sellPct=Math.round(model.sellPct*100);
    const period=current?new Date(current.start).toLocaleTimeString()+"–"+new Date(current.end).toLocaleTimeString():"waiting for trades";
    node.title="TVD (Taker Volume Delta) · LIVE fixed bucket "+period+" · Total "+volume(model.totalVolume)+" · Buy "+volume(model.buyVolume)+" ("+buyPct+"%) · Sell "+volume(model.sellVolume)+" ("+sellPct+"%) · Delta "+volume(model.delta)+" · Baseline "+ratio+" across "+model.baselineSampleCount+" completed bucket(s)";
    node.setAttribute("aria-label",node.title);
    const track=node.querySelector(".tvd-track");
    if(track){track.title="Click bar to edit TVD bucket duration and baseline lookback";track.setAttribute("aria-label","Edit TVD bucket duration and baseline lookback");}
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
