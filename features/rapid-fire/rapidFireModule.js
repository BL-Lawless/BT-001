(() => {
  "use strict";

  const WINDOW_KEY="btc_futures_chart_v13_rapid_fire_window_v3";
  const CLOSE_PERCENT_STEPS=Object.freeze(Array.from({length:101},(_value,index)=>index));
  const CLOSE_PERCENT_TICKS=Object.freeze(Array.from({length:11},(_value,index)=>index*10));
  const REVERSE_PERCENT_STEPS=Object.freeze([25,...Array.from({length:28},(_value,index)=>(index+3)*10)]);
  let windowApi=null;
  let statusUnsubscribe=null;
  let refreshTimer=null;
  let selectedDirection="LONG";
  let doubleArmTimer=null;
  let closeQuantityOverride=null;
  let pendingTakeProfitValue=null;
  let takeProfitEditValue=null;

  function q(id){return document.getElementById(id);}
  function api(){return window.CALCULATOR_MODULE&&window.CALCULATOR_MODULE.rapidFire;}
  function number(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
  function money(value){
    const parsed=number(value);
    if(parsed==null)return "-";
    return (parsed>0?"+":parsed<0?"-":"")+"$"+Math.abs(parsed).toFixed(2);
  }
  function percent(value){
    const parsed=number(value);
    if(parsed==null)return "-";
    const rounded=Number(parsed.toFixed(2));
    return (rounded>0?"+":"")+rounded+"%";
  }
  function moneyColor(value){const parsed=number(value);return parsed==null||parsed===0?"#111":parsed>0?"#047857":"#f6465d";}
  function lot(value,precision=3){const parsed=number(value);return parsed==null?"0.000":parsed.toFixed(Math.max(0,precision));}
  function positionSizeParts(sizeValue,closeQtyValue){
    const size=Math.max(0,number(sizeValue)||0);
    const closed=Math.min(size,Math.max(0,number(closeQtyValue)||0));
    return {closed,remaining:size-closed};
  }
  function editedPositionSizeParts(sizeValue,editedValue,editedKind,normalizeQuantity){
    const total=Math.max(0,number(sizeValue)||0);
    const raw=number(editedValue);
    const clamped=raw==null?0:Math.max(0,Math.min(total,raw));
    const normalized=normalizeQuantity(clamped);
    const active=normalized&&normalized.executable?Math.min(total,normalized.quantity):0;
    return editedKind==="remaining"
      ? {active,closed:total-active,remaining:active,total}
      : {active,closed:active,remaining:total-active,total};
  }
  function takeProfitFieldState(liveOrder,livePriceValue,pendingValue){
    const hasLive=!!liveOrder;
    const pending=!hasLive&&pendingValue!=null&&String(pendingValue).trim()!=="";
    return {
      hasLive,
      pending,
      value:hasLive?(livePriceValue==null?"":String(livePriceValue)):(pending?String(pendingValue):"")
    };
  }
  function takeProfitCommitValue(inputValue,editValue){
    return editValue!=null?editValue:inputValue;
  }
  function setCloseSliderDisplay(percentValue){
    const slider=q("rapidFireClosePercent");
    const text=q("rapidFireClosePercentText");
    const value=Math.max(0,Math.min(100,number(percentValue)||0));
    if(slider){
      slider.value=String(value);
      slider.style.setProperty("--rapid-fire-range-progress",value+"%");
    }
    if(text)text.textContent=Math.round(value)+"%";
  }
  function isOpen(){const win=q("rapidFireWindow");return !!(win&&!win.classList.contains("hidden"));}

  function resetDoubleArm(){
    if(doubleArmTimer!=null)clearTimeout(doubleArmTimer);
    doubleArmTimer=null;
    const button=q("rapidFireDouble");
    if(!button)return;
    button.classList.remove("is-confirm-armed");
    delete button.dataset.armed;
    button.textContent="DBL";
    button.title="Click once to arm, then again within 3 seconds";
  }
  function setStatus(message,tone){
    const node=q("rapidFireStatus");
    if(!node)return;
    node.textContent=String(message||"");
    node.classList.toggle("is-error",tone==="error");
  }
  function snapPercent(value,steps){
    const target=number(value);
    if(target==null||!Array.isArray(steps)||!steps.length)return 0;
    return steps.reduce((best,current)=>Math.abs(current-target)<Math.abs(best-target)?current:best,steps[0]);
  }
  function sliderTicks(steps,min,max,emphasizedValue){
    const span=Math.max(1,max-min);
    return `<span class="rapid-fire-slider-ticks" aria-hidden="true">${steps.map(value=>`<i${value===emphasizedValue?' class="is-reference"':''} style="left:${((value-min)/span*100).toFixed(4)}%"></i>`).join("")}</span>`;
  }
  function bindDiscreteSlider(slider,textNode,steps){
    const apply=value=>{
      const snapped=snapPercent(value,steps);
      slider.value=String(snapped);
      textNode.textContent=snapped+"%";
      const min=number(slider.min)||0;
      const max=number(slider.max)||100;
      const progress=max===min?0:(snapped-min)/(max-min)*100;
      slider.style.setProperty("--rapid-fire-range-progress",progress+"%");
    };
    slider.addEventListener("input",()=>apply(slider.value),false);
    slider.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowDown","ArrowRight","ArrowUp"].includes(event.key))return;
      event.preventDefault();
      const current=snapPercent(slider.value,steps);
      const index=Math.max(0,steps.indexOf(current));
      const direction=event.key==="ArrowRight"||event.key==="ArrowUp"?1:-1;
      apply(steps[Math.max(0,Math.min(steps.length-1,index+direction))]);
      slider.dispatchEvent(new Event("change",{bubbles:true}));
    },false);
    apply(slider.value);
  }
  function render(){
    const bridge=api();
    if(!bridge)return;
    const closeSlider=q("rapidFireClosePercent");
    const slInput=q("rapidFireMasterSl");
    const tpInput=q("rapidFireTakeProfit");
    const slEditing=document.activeElement===slInput;
    const tpEditing=document.activeElement===tpInput;
    const snapshot=bridge.snapshot({
      closePercent:closeSlider?closeSlider.value:100,
      closeQty:closeQuantityOverride,
      slPrice:slEditing?slInput.value:null,
      tpPrice:tpEditing?tpInput.value:null
    });
    const position=snapshot.position;
    if(position)selectedDirection=position.side;
    const openSize=q("rapidFireOpenSize");
    const closeSize=q("rapidFireCloseSize");
    const floating=q("rapidFirePl");
    const floatingPercent=q("rapidFirePlPercent");
    const rules=bridge.lotRules();
    const precision=Math.max(3,number(rules.precision)||3);
    const {closed,remaining}=positionSizeParts(snapshot.size,snapshot.closeQty);
    if(openSize){
      openSize.min="0.000";
      openSize.max=lot(snapshot.size,precision);
      openSize.step=String(rules.stepSize);
      openSize.dataset.precision=String(precision);
      if(document.activeElement!==openSize)openSize.value=lot(remaining,precision);
    }
    if(closeSize){
      closeSize.min="0.000";
      closeSize.max=lot(snapshot.size,precision);
      closeSize.step=String(rules.stepSize);
      closeSize.dataset.precision=String(precision);
      if(document.activeElement!==closeSize)closeSize.value=lot(closed,precision);
    }
    if(closeQuantityOverride!=null){
      closeQuantityOverride=closed;
      setCloseSliderDisplay(snapshot.closePercent);
    }
    if(floating){floating.textContent=money(snapshot.floatingPl);floating.style.color=moneyColor(snapshot.floatingPl);}
    if(floatingPercent){floatingPercent.textContent=percent(snapshot.floatingPlPercent);floatingPercent.style.color=moneyColor(snapshot.floatingPlPercent);}
    const dir=q("rapidFireDir");
    if(dir){
      const shownDirection=position?position.side:selectedDirection;
      dir.textContent=shownDirection;
      dir.classList.toggle("is-long",shownDirection==="LONG");
      dir.classList.toggle("is-short",shownDirection==="SHORT");
      dir.classList.toggle("is-locked",!!position);
      dir.setAttribute("aria-disabled",position?"true":"false");
      dir.title=position?"Direction follows the open position":"Click to switch LONG / SHORT";
    }
    const lotInput=q("rapidFireLot");
    if(lotInput){
      lotInput.min="0.000";
      lotInput.step=String(rules.stepSize);
      lotInput.dataset.precision=String(rules.precision);
    }
    const busy=!!snapshot.busy;
    const actionButtons={add:q("rapidFireAdd"),double:q("rapidFireDouble"),close:q("rapidFireClose"),reverse:q("rapidFireReverse"),breakeven:q("rapidFireBreakeven")};
    const actionLabels={add:"ADD",double:"DBL",close:"Close",reverse:"Reverse",breakeven:"B.E."};
    Object.entries(actionButtons).forEach(([action,button])=>{
      if(!button)return;
      const active=busy&&snapshot.activeAction===action;
      button.disabled=busy&&(!active||action==="breakeven");
      button.classList.toggle("is-cancel",active&&action!=="breakeven");
      if(active&&action!=="breakeven")button.textContent="Cancel";
      else if(action!=="double"||button.dataset.armed!=="1")button.textContent=actionLabels[action];
    });
    if(!position){
      q("rapidFireDouble").disabled=true;
      q("rapidFireBreakeven").disabled=true;
      q("rapidFireClose").disabled=true;
      q("rapidFireReverse").disabled=true;
      resetDoubleArm();
    }
    const protectionBusy=!!snapshot.protectionBusy;
    [slInput,tpInput].forEach(input=>{if(input)input.disabled=!position||protectionBusy;});
    const tpSet=q("rapidFireTakeProfitSet");
    if(tpSet)tpSet.disabled=!position||protectionBusy;
    if(slInput&&document.activeElement!==slInput)slInput.value=snapshot.masterStopPrice==null?"":String(snapshot.masterStopPrice);
    const tpField=takeProfitFieldState(snapshot.takeProfitOrder,snapshot.takeProfitPrice,pendingTakeProfitValue);
    if(tpField.hasLive)pendingTakeProfitValue=null;
    if(tpInput&&document.activeElement!==tpInput){
      tpInput.value=tpField.value;
    }
    if(tpInput)tpInput.classList.toggle("is-pending-unsent",tpField.pending);
    const slPreview=q("rapidFireMasterSlPl");
    const tpPreview=q("rapidFireTakeProfitPl");
    if(slPreview){slPreview.textContent=money(snapshot.masterSlPl);slPreview.style.color=moneyColor(snapshot.masterSlPl);}
    if(tpPreview){tpPreview.textContent=money(snapshot.takeProfitPl);tpPreview.style.color=moneyColor(snapshot.takeProfitPl);}
  }
  async function execute(config){
    const bridge=api();
    if(!bridge)return;
    try{
      const pending=bridge.execute(config);
      render();
      await pending;
    }
    catch(_error){}
    render();
  }
  async function executeOrCancel(config){
    const bridge=api();
    const snapshot=bridge&&bridge.snapshot();
    if(snapshot&&snapshot.active&&snapshot.activeAction===config.action){
      try{await bridge.cancel();}catch(_error){}
      render();
      return;
    }
    await execute(config);
  }
  async function lockBreakeven(){
    const bridge=api();
    if(!bridge||typeof bridge.breakevenLock!=="function")return;
    try{
      const pending=bridge.breakevenLock();
      render();
      await pending;
    }catch(_error){}
    render();
  }
  async function commitProtection(kind,input,valueOverride){
    const bridge=api();
    if(!bridge||!input)return;
    const rawValue=valueOverride!=null?valueOverride:input.value;
    if(kind==="tp"&&String(rawValue==null?"":rawValue).trim()===""){
      try{
        const snapshot=bridge.snapshot();
        if(snapshot.takeProfitOrder&&typeof bridge.cancelTakeProfit==="function"){
          const pending=bridge.cancelTakeProfit();
          render();
          await pending;
        }
        pendingTakeProfitValue=null;
        takeProfitEditValue=null;
        if(typeof bridge.clearProtectionDraft==="function")bridge.clearProtectionDraft("tp");
      }catch(_error){takeProfitEditValue=null;}
      render();
      return;
    }
    const price=number(rawValue);
    if(!(price>0))return;
    try{
      const pending=kind==="sl"?bridge.setMasterStop(price):bridge.setTakeProfit(price);
      render();
      await pending;
      if(kind==="tp"){
        pendingTakeProfitValue=null;
        takeProfitEditValue=null;
      }
    }catch(_error){if(kind==="tp")takeProfitEditValue=null;}
    render();
  }
  function previewProtection(kind,input){
    const bridge=api();
    if(bridge&&typeof bridge.setProtectionDraft==="function")bridge.setProtectionDraft(kind,input.value);
    render();
  }
  function ensureWindow(){
    let win=q("rapidFireWindow");
    if(win)return win;
    win=document.createElement("section");
    win.id="rapidFireWindow";
    win.className="calc-module-window rapid-fire-window hidden";
    win.setAttribute("aria-label","Rapid Fire");
    win.innerHTML=`
      <header class="calc-module-head rapid-fire-head" id="rapidFireHead" data-floating-window-header>
        <div class="calc-module-title">Rapid Fire</div>
        <div class="calc-module-actions"><button id="rapidFireCloseWindow" type="button" title="Close" aria-label="Close Rapid Fire">x</button></div>
      </header>
      <div class="rapid-fire-body">
        <div class="rapid-fire-summary" aria-label="Position summary">
          <label class="rapid-fire-summary-cell"><span class="rapid-fire-summary-label">Remaining</span><input class="rapid-fire-size-input" id="rapidFireOpenSize" type="number" inputmode="decimal" min="0.000" step="0.001" value="0.000" aria-label="Remaining lot"></label>
          <label class="rapid-fire-summary-cell"><span class="rapid-fire-summary-label">Close</span><input class="rapid-fire-size-input" id="rapidFireCloseSize" type="number" inputmode="decimal" min="0.000" step="0.001" value="0.000" aria-label="Close lot"></label>
          <div class="rapid-fire-summary-cell"><div class="rapid-fire-summary-label">Floating P/L</div><div class="rapid-fire-summary-value" id="rapidFirePl">-</div></div>
          <div class="rapid-fire-summary-cell"><div class="rapid-fire-summary-label">Floating P/L%</div><div class="rapid-fire-summary-value" id="rapidFirePlPercent">-</div></div>
        </div>
        <div class="rapid-fire-add-row" aria-label="Add, double, or protect position">
          <button class="rapid-fire-dir is-long" id="rapidFireDir" type="button">LONG</button>
          <input class="rapid-fire-lot" id="rapidFireLot" type="number" inputmode="decimal" min="0.000" step="0.001" value="0.000" aria-label="Rapid Fire lot size">
          <button class="rapid-fire-button" id="rapidFireAdd" type="button">ADD</button>
          <button class="rapid-fire-button" id="rapidFireDouble" type="button" title="Click once to arm, then again within 3 seconds">DBL</button>
          <button class="rapid-fire-button" id="rapidFireBreakeven" type="button" title="Place a fee-aware Master SL at breakeven">B.E.</button>
        </div>
        <div class="rapid-fire-action-group" id="rapidFireActionGroup">
          <div class="rapid-fire-action-row">
            <button class="rapid-fire-action-title" id="rapidFireReverse" type="button">Reverse</button>
            <span class="rapid-fire-slider-shell">
              ${sliderTicks(REVERSE_PERCENT_STEPS,25,300,100)}
              <input class="rapid-fire-reverse-slider" id="rapidFireReversePercent" type="range" min="25" max="300" step="1" value="100" aria-label="Reverse percentage">
            </span>
            <span class="rapid-fire-slider-value" id="rapidFireReversePercentText">100%</span>
          </div>
          <div class="rapid-fire-action-row">
            <button class="rapid-fire-action-title" id="rapidFireClose" type="button">Close</button>
            <span class="rapid-fire-slider-shell">
              ${sliderTicks(CLOSE_PERCENT_TICKS,0,100)}
              <input id="rapidFireClosePercent" type="range" min="0" max="100" step="1" value="100" aria-label="Close percentage">
            </span>
            <span class="rapid-fire-slider-value" id="rapidFireClosePercentText">100%</span>
          </div>
        </div>
        <div class="rapid-fire-status" id="rapidFireStatus" aria-live="polite"></div>
        <div class="rapid-fire-protection-row" aria-label="Rapid Fire protection orders">
          <label class="rapid-fire-protection-box">
            <span class="rapid-fire-protection-label">SL</span>
            <input id="rapidFireMasterSl" type="number" inputmode="decimal" min="0" placeholder="Price" aria-label="Master stop loss price">
            <span class="rapid-fire-protection-pl" id="rapidFireMasterSlPl">-</span>
          </label>
          <label class="rapid-fire-protection-box">
            <span class="rapid-fire-protection-label">TP</span>
            <input id="rapidFireTakeProfit" type="number" inputmode="decimal" min="0" placeholder="Price" aria-label="Take profit price">
            <button class="rapid-fire-protection-set" id="rapidFireTakeProfitSet" type="button">Set</button>
            <span class="rapid-fire-protection-pl" id="rapidFireTakeProfitPl">-</span>
          </label>
        </div>
      </div>`;
    document.body.appendChild(win);
    const floating=window.BT001FloatingWindow;
    if(floating&&typeof floating.install==="function"){
      windowApi=floating.install(win,{header:q("rapidFireHead"),storageKey:WINDOW_KEY,minWidth:430,minHeight:272,defaultWidth:500,defaultHeight:284});
    }
    q("rapidFireCloseWindow").addEventListener("click",hide,false);
    q("rapidFireStatus").addEventListener("click",()=>setStatus(""),false);
    q("rapidFireDir").addEventListener("click",()=>{
      if(api().snapshot().position)return;
      selectedDirection=selectedDirection==="LONG"?"SHORT":"LONG";
      render();
    },false);
    q("rapidFireLot").addEventListener("change",event=>{
      const bridge=api();
      const normalized=bridge.normalizeQuantity(event.target.value);
      event.target.value=lot(normalized.quantity,normalized.precision);
    },false);
    const openSize=q("rapidFireOpenSize");
    const closeSize=q("rapidFireCloseSize");
    const syncEditedSize=(editedKind,event,finalize=false)=>{
      const bridge=api();
      const snapshot=bridge.snapshot();
      const precision=Math.max(3,number(event.target.dataset.precision)||3);
      const parts=editedPositionSizeParts(snapshot.size,event.target.value,editedKind,value=>bridge.normalizeQuantity(value));
      const edited=parts.active;
      closeQuantityOverride=parts.closed;
      const typed=event.target.value;
      setCloseSliderDisplay(parts.total>0?closeQuantityOverride/parts.total*100:0);
      render();
      event.target.value=finalize?lot(edited,precision):typed;
    };
    openSize.addEventListener("input",event=>syncEditedSize("remaining",event),false);
    openSize.addEventListener("change",event=>syncEditedSize("remaining",event,true),false);
    closeSize.addEventListener("input",event=>{
      syncEditedSize("close",event);
    },false);
    closeSize.addEventListener("change",event=>{
      syncEditedSize("close",event,true);
    },false);
    q("rapidFireAdd").addEventListener("click",()=>executeOrCancel({action:"add",direction:selectedDirection,quantity:q("rapidFireLot").value}),false);
    q("rapidFireDouble").addEventListener("click",()=>{
      const button=q("rapidFireDouble");
      const snapshot=api().snapshot();
      if(snapshot.active&&snapshot.activeAction==="double"){
        void executeOrCancel({action:"double"});
        return;
      }
      if(button.dataset.armed==="1"){
        resetDoubleArm();
        void executeOrCancel({action:"double"});
        return;
      }
      button.dataset.armed="1";
      button.classList.add("is-confirm-armed");
      button.textContent="Confirm";
      button.title="Click again within 3 seconds to confirm";
      doubleArmTimer=setTimeout(resetDoubleArm,3000);
    },false);
    q("rapidFireBreakeven").addEventListener("click",()=>{void lockBreakeven();},false);
    const closeSlider=q("rapidFireClosePercent");
    bindDiscreteSlider(closeSlider,q("rapidFireClosePercentText"),CLOSE_PERCENT_STEPS);
    closeSlider.addEventListener("input",()=>{closeQuantityOverride=null;render();},false);
    q("rapidFireClose").addEventListener("click",()=>executeOrCancel({action:"close",percent:closeSlider.value,quantity:closeQuantityOverride}),false);
    const reverseSlider=q("rapidFireReversePercent");
    bindDiscreteSlider(reverseSlider,q("rapidFireReversePercentText"),REVERSE_PERCENT_STEPS);
    q("rapidFireReverse").addEventListener("click",()=>executeOrCancel({action:"reverse",percent:reverseSlider.value}),false);
    const slInput=q("rapidFireMasterSl");
    const tpInput=q("rapidFireTakeProfit");
    slInput.addEventListener("input",()=>previewProtection("sl",slInput),false);
    tpInput.addEventListener("input",()=>{
      const bridge=api();
      const hasLiveTakeProfit=!!(bridge&&bridge.snapshot().takeProfitOrder);
      takeProfitEditValue=tpInput.value.trim()===""?null:tpInput.value;
      pendingTakeProfitValue=hasLiveTakeProfit?null:takeProfitEditValue;
      previewProtection("tp",tpInput);
    },false);
    slInput.addEventListener("change",()=>{void commitProtection("sl",slInput);},false);
    slInput.addEventListener("keydown",event=>{if(event.key==="Enter")slInput.blur();},false);
    const tpSet=q("rapidFireTakeProfitSet");
    const tpProtectionBox=tpInput.closest(".rapid-fire-protection-box");
    tpSet.addEventListener("mousedown",event=>event.preventDefault(),false);
    tpProtectionBox.addEventListener("focusout",()=>{setTimeout(()=>{
      if(tpProtectionBox.contains(document.activeElement))return;
      const bridge=api();
      if(!bridge||!bridge.snapshot().takeProfitOrder)return;
      pendingTakeProfitValue=null;
      takeProfitEditValue=null;
      if(typeof bridge.clearProtectionDraft==="function")bridge.clearProtectionDraft("tp");
      render();
    },0);},false);
    tpSet.addEventListener("click",()=>{
      const typedValue=takeProfitCommitValue(tpInput.value,takeProfitEditValue);
      void commitProtection("tp",tpInput,typedValue);
    },false);
    statusUnsubscribe=api().subscribe(detail=>{
      setStatus(detail.message,detail.tone);
      render();
    });
    window.addEventListener("v13:open-position-change",render,false);
    return win;
  }
  function show(){
    const win=ensureWindow();
    if(windowApi)windowApi.show();else win.classList.remove("hidden");
    window.BT001_RAPID_FIRE_VISIBLE=true;
    api().setVisible(true);
    render();
    if(refreshTimer==null)refreshTimer=setInterval(()=>{if(isOpen())render();},500);
  }
  function hide(){
    const win=q("rapidFireWindow");
    if(windowApi)windowApi.hide();else if(win)win.classList.add("hidden");
    window.BT001_RAPID_FIRE_VISIBLE=false;
    const bridge=api();
    if(bridge)bridge.setVisible(false);
    resetDoubleArm();
    if(refreshTimer!=null){clearInterval(refreshTimer);refreshTimer=null;}
  }
  function bind(){
    const trigger=q("rapidFireBtn");
    if(!trigger||trigger.dataset.bound==="1")return;
    trigger.dataset.bound="1";
    trigger.addEventListener("click",()=>isOpen()?hide():show(),false);
    window.RAPID_FIRE_MODULE=Object.freeze({open:show,hide,snapshot:()=>api()?.snapshot()||null,destroy(){hide();if(statusUnsubscribe)statusUnsubscribe();}});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
