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
  let pendingMasterStopValue=null;
  let pendingTakeProfitValue=null;
  let takeProfitEditValue=null;
  const protectionEditDriver={sl:"price",tp:"price"};
  const protectionPlTarget={sl:null,tp:null};
  const lastProtectionOrderSignature={sl:null,tp:null};
  let lastProtectionPositionSignature=null;

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
  function lot(value,precision=0){const digits=Math.max(0,Number(precision)||0);const parsed=number(value);return (parsed==null?0:parsed).toFixed(digits);}
  function decimalDraft(value,allowNegative=false){
    let text=String(value==null?"":value).replace(/,/g,"").replace(allowNegative?/[^0-9.\-]/g:/[^0-9.]/g,"");
    const negative=allowNegative&&text.startsWith("-");
    text=text.replace(/-/g,"");
    const dot=text.indexOf(".");
    if(dot>=0)text=text.slice(0,dot+1)+text.slice(dot+1).replace(/\./g,"");
    return (negative?"-":"")+text;
  }
  function bindNumericDraftInput(input,options){
    const opts=options||{};
    if(!input)return null;
    const controller={
      input,
      commit(reason,event){
        if(typeof opts.onCommit==="function")opts.onCommit(input.value,reason||"change",event||null);
      },
      setDraft(value,commit=false){
        input.value=decimalDraft(value,opts.allowNegative===true);
        input.dispatchEvent(new Event("input",{bubbles:true}));
        if(commit)input.dispatchEvent(new Event("change",{bubbles:true}));
      }
    };
    input.dataset.rfNumericDraft="1";
    input.addEventListener("input",event=>{
      const draft=decimalDraft(event.target.value,opts.allowNegative===true);
      if(event.target.value!==draft)event.target.value=draft;
      if(typeof opts.onDraft==="function")opts.onDraft(draft,event);
    },false);
    input.addEventListener("change",event=>controller.commit("change",event),false);
    input.addEventListener("keydown",event=>{
      if(event.key!=="Enter")return;
      event.preventDefault();
      input.blur();
    },false);
    return controller;
  }
  function bindNumericAdjustControls(controller,{upButton=null,downButton=null,step,precision,commit=true,min=null,base=null,validateBase=null,normalize=null,format=null}={}){
    if(!controller)return null;
    const adjust=direction=>{
      if(controller.input.disabled)return;
      const increment=Math.max(0,number(typeof step==="function"?step():step)||0);
      if(!(increment>0))return;
      const digits=Math.max(0,number(typeof precision==="function"?precision():precision)||0);
      const current=typeof base==="function"?base():controller.input.value;
      if(typeof validateBase==="function"&&!validateBase(current))return;
      let next=protectionWheelValue(current,increment,direction,digits);
      if(next==null)return;
      if(min!=null&&number(min)!=null)next=Math.max(number(min),next);
      if(typeof normalize==="function"){
        next=normalize(next);
        if(next==null)return;
      }
      if(typeof format==="function")next=format(next);
      controller.setDraft(next,commit);
    };
    [[upButton,1],[downButton,-1]].forEach(([button,direction])=>{
      if(!button)return;
      button.addEventListener("mousedown",event=>event.preventDefault(),false);
      button.addEventListener("click",()=>adjust(direction),false);
    });
    controller.input.addEventListener("wheel",event=>{
      const direction=event.deltaY<0?1:-1;
      event.preventDefault();
      try{controller.input.focus({preventScroll:true});}catch(_e){controller.input.focus();}
      adjust(direction);
    },{passive:false});
    return {adjust};
  }
  function protectionPlText(value){const parsed=number(value);return parsed==null?"":parsed.toFixed(2);}
  function protectionOrderSignature(order){
    if(!order)return "";
    const meta=order.meta||{};
    return [order.orderId,order.clientOrderId,meta.algoId,meta.clientAlgoId,order.price,order.quantity].map(value=>String(value==null?"":value)).join("|");
  }
  function normalizedPriceText(value,bridge){
    const normalized=bridge&&typeof bridge.normalizePrice==="function"?bridge.normalizePrice(value):null;
    return normalized&&normalized.executable?normalized.text:(number(value)>0?String(value):"");
  }
  function protectionWheelValue(currentValue,stepValue,direction,precision){
    const current=number(currentValue)||0;
    const step=Math.max(0,number(stepValue)||0);
    if(!(step>0))return null;
    const scale=Math.pow(10,Math.max(0,number(precision)||0));
    return Math.round((current+direction*step)*scale)/scale;
  }
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
    const slPlInput=q("rapidFireMasterSlPl");
    const tpPlInput=q("rapidFireTakeProfitPl");
    const lotInput=q("rapidFireLot");
    const addQuantity=lotInput?lotInput.value:0;
    if(typeof bridge.setAddDraft==="function")bridge.setAddDraft(addQuantity,selectedDirection);
    const referenceSnapshot=bridge.snapshot({addQuantity,direction:selectedDirection});
    const referencePosition=referenceSnapshot.position;
    const positionSignature=referencePosition
      ? [referenceSnapshot.symbol,referencePosition.side,referencePosition.qty,referencePosition.entry].map(String).join("|")
      : "";
    const positionReferenceChanged=lastProtectionPositionSignature!==null&&lastProtectionPositionSignature!==positionSignature;
    lastProtectionPositionSignature=positionSignature;
    if(positionReferenceChanged&&referencePosition){
      ["sl","tp"].forEach(kind=>{
        protectionEditDriver[kind]="price";
        protectionPlTarget[kind]=null;
        const liveOrder=kind==="sl"?referenceSnapshot.masterStopOrder:referenceSnapshot.takeProfitOrder;
        if(liveOrder&&typeof bridge.clearProtectionDraft==="function")bridge.clearProtectionDraft(kind);
      });
    }
    ["sl","tp"].forEach(kind=>{
      const target=protectionPlTarget[kind];
      if(protectionEditDriver[kind]!=="pl"||target==null||typeof bridge.protectionPriceFromPl!=="function")return;
      const price=bridge.protectionPriceFromPl(kind,target,{quantity:addQuantity,direction:selectedDirection});
      if(!(number(price)>0))return;
      const input=kind==="sl"?slInput:tpInput;
      const priceText=normalizedPriceText(price,bridge);
      input.value=priceText;
      if(kind==="sl")pendingMasterStopValue=priceText;
      else pendingTakeProfitValue=priceText;
      if(typeof bridge.setProtectionDraft==="function")bridge.setProtectionDraft(kind,priceText);
    });
    const slEditing=document.activeElement===slInput;
    const tpEditing=document.activeElement===tpInput;
    let snapshot=bridge.snapshot({
      closePercent:closeSlider?closeSlider.value:100,
      closeQty:closeQuantityOverride,
      slPrice:slEditing?slInput.value:null,
      tpPrice:tpEditing?tpInput.value:null,
      addQuantity,
      direction:selectedDirection
    });
    const liveOrderSignatures={
      sl:protectionOrderSignature(snapshot.masterStopOrder),
      tp:protectionOrderSignature(snapshot.takeProfitOrder)
    };
    const authoritativeProtectionChange={sl:false,tp:false};
    ["sl","tp"].forEach(kind=>{
      const previous=lastProtectionOrderSignature[kind];
      const current=liveOrderSignatures[kind];
      authoritativeProtectionChange[kind]=previous!==null&&previous!==current;
      lastProtectionOrderSignature[kind]=current;
      if(!authoritativeProtectionChange[kind])return;
      protectionEditDriver[kind]="price";
      protectionPlTarget[kind]=null;
      if(kind==="sl")pendingMasterStopValue=null;
      else{pendingTakeProfitValue=null;takeProfitEditValue=null;}
    });
    if(authoritativeProtectionChange.sl||authoritativeProtectionChange.tp){
      snapshot=bridge.snapshot({
        closePercent:closeSlider?closeSlider.value:100,
        closeQty:closeQuantityOverride,
        addQuantity,
        direction:selectedDirection
      });
    }
    const position=snapshot.position;
    if(position)selectedDirection=position.side;
    const openSize=q("rapidFireOpenSize");
    const closeSize=q("rapidFireCloseSize");
    const floating=q("rapidFirePl");
    const floatingPercent=q("rapidFirePlPercent");
    const rules=bridge.lotRules();
    const precision=Math.max(0,number(rules.precision)||0);
    const zeroLot=lot(0,precision);
    const priceRules=typeof bridge.priceRules==="function"?bridge.priceRules():{tickSize:0,precision:0,available:false};
    [slInput,tpInput].forEach(input=>{
      if(!input)return;
      input.step=priceRules.available?String(priceRules.tickSize):"any";
      input.dataset.precision=String(priceRules.precision);
    });
    const {closed,remaining}=positionSizeParts(snapshot.size,snapshot.closeQty);
    if(openSize){
      openSize.disabled=!rules.available;
      openSize.min=zeroLot;
      openSize.max=lot(snapshot.size,precision);
      openSize.step=rules.available?String(rules.stepSize):"any";
      openSize.dataset.precision=String(precision);
      if(document.activeElement!==openSize)openSize.value=lot(remaining,precision);
    }
    if(closeSize){
      closeSize.disabled=!rules.available;
      closeSize.min=zeroLot;
      closeSize.max=lot(snapshot.size,precision);
      closeSize.step=rules.available?String(rules.stepSize):"any";
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
    if(lotInput){
      lotInput.disabled=!rules.available;
      lotInput.min=zeroLot;
      lotInput.step=rules.available?String(rules.stepSize):"any";
      lotInput.dataset.precision=String(rules.precision);
      if(document.activeElement!==lotInput&&number(lotInput.value)===0)lotInput.value=zeroLot;
    }
    const busy=!!snapshot.busy;
    const actionButtons={add:q("rapidFireAdd"),double:q("rapidFireDouble"),close:q("rapidFireClose"),reverse:q("rapidFireReverse"),breakeven:q("rapidFireBreakeven")};
    const actionLabels={add:"ADD",double:"DBL",close:"Close",reverse:"Reverse",breakeven:"B.E."};
    Object.entries(actionButtons).forEach(([action,button])=>{
      if(!button)return;
      const active=busy&&snapshot.activeAction===action;
      button.disabled=!rules.available||(busy&&(!active||action==="breakeven"));
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
    [slInput,tpInput,slPlInput,tpPlInput].forEach(input=>{if(input)input.disabled=protectionBusy||!priceRules.available;});
    const tpSet=q("rapidFireTakeProfitSet");
    if(tpSet)tpSet.disabled=protectionBusy||!priceRules.available;
    if(slInput&&(document.activeElement!==slInput||authoritativeProtectionChange.sl))slInput.value=snapshot.masterStopPrice==null?"":normalizedPriceText(snapshot.masterStopPrice,bridge);
    if(!position&&snapshot.masterStopPrice>0)pendingMasterStopValue=String(snapshot.masterStopPrice);
    const tpField=takeProfitFieldState(snapshot.takeProfitOrder,snapshot.takeProfitPrice,pendingTakeProfitValue);
    if(tpField.hasLive)pendingTakeProfitValue=null;
    if(tpInput&&(document.activeElement!==tpInput||authoritativeProtectionChange.tp)){
      tpInput.value=tpField.value===""?"":normalizedPriceText(tpField.value,bridge);
    }
    if(tpInput)tpInput.classList.toggle("is-pending-unsent",tpField.pending);
    if(slInput)slInput.classList.toggle("is-pending-unsent",!position&&number(snapshot.masterStopPrice)>0);
    if(slPlInput&&(document.activeElement!==slPlInput||authoritativeProtectionChange.sl))slPlInput.value=protectionEditDriver.sl==="pl"&&protectionPlTarget.sl!=null?protectionPlText(protectionPlTarget.sl):protectionPlText(snapshot.masterSlPl);
    if(tpPlInput&&(document.activeElement!==tpPlInput||authoritativeProtectionChange.tp))tpPlInput.value=protectionEditDriver.tp==="pl"&&protectionPlTarget.tp!=null?protectionPlText(protectionPlTarget.tp):protectionPlText(snapshot.takeProfitPl);
    if(slPlInput)slPlInput.style.color=moneyColor(snapshot.masterSlPl);
    if(tpPlInput)tpPlInput.style.color=moneyColor(snapshot.takeProfitPl);
    const newAverageToggle=q("rapidFireNewAverageToggle");
    if(newAverageToggle){
      newAverageToggle.setAttribute("aria-pressed",snapshot.newAverageVisible?"true":"false");
      newAverageToggle.classList.toggle("is-active",!!snapshot.newAverageVisible);
    }
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
    const snapshot=bridge.snapshot();
    if(String(rawValue==null?"":rawValue).trim()===""){
      try{
        const liveOrder=kind==="tp"?snapshot.takeProfitOrder:snapshot.masterStopOrder;
        const cancel=kind==="tp"?bridge.cancelTakeProfit:bridge.cancelMasterStop;
        const shouldCheckAuthoritatively=kind==="sl"&&snapshot.position&&typeof cancel==="function";
        if(snapshot.position&&(liveOrder||shouldCheckAuthoritatively)&&typeof cancel==="function"){
          const pending=cancel();
          render();
          await pending;
        }
        if(kind==="sl")pendingMasterStopValue=null;
        else{pendingTakeProfitValue=null;takeProfitEditValue=null;}
        protectionPlTarget[kind]=null;
        protectionEditDriver[kind]="price";
        if(typeof bridge.clearProtectionDraft==="function")bridge.clearProtectionDraft(kind);
      }catch(_error){if(kind==="tp")takeProfitEditValue=null;}
      render();
      return;
    }
    const price=number(rawValue);
    if(!(price>0))return;
    const normalized=typeof bridge.normalizePrice==="function"?bridge.normalizePrice(price):null;
    if(!normalized||!normalized.executable){
      setStatus("Binance PRICE_FILTER tick size is unavailable for the current symbol.","error");
      return;
    }
    const normalizedPrice=normalized.text;
    input.value=normalizedPrice;
    if(!snapshot.position){
      if(typeof bridge.setProtectionDraft==="function")bridge.setProtectionDraft(kind,normalizedPrice);
      if(kind==="sl")pendingMasterStopValue=normalizedPrice;
      else{pendingTakeProfitValue=normalizedPrice;takeProfitEditValue=null;}
      render();
      return;
    }
    try{
      const pending=kind==="sl"?bridge.setMasterStop(normalizedPrice):bridge.setTakeProfit(normalizedPrice);
      render();
      await pending;
      protectionEditDriver[kind]="price";
      protectionPlTarget[kind]=null;
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
          <label class="rapid-fire-summary-cell"><span class="rapid-fire-summary-label">Remaining</span><span class="rapid-fire-number-control rapid-fire-size-control"><input class="rapid-fire-size-input" id="rapidFireOpenSize" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="0" aria-label="Remaining lot"><span class="rapid-fire-number-steppers"><button id="rapidFireOpenSizeUp" type="button" tabindex="-1" aria-label="Increase Remaining lot">&#9650;</button><button id="rapidFireOpenSizeDown" type="button" tabindex="-1" aria-label="Decrease Remaining lot">&#9660;</button></span></span></label>
          <label class="rapid-fire-summary-cell"><span class="rapid-fire-summary-label">Close</span><span class="rapid-fire-number-control rapid-fire-size-control"><input class="rapid-fire-size-input" id="rapidFireCloseSize" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="0" aria-label="Close lot"><span class="rapid-fire-number-steppers"><button id="rapidFireCloseSizeUp" type="button" tabindex="-1" aria-label="Increase Close lot">&#9650;</button><button id="rapidFireCloseSizeDown" type="button" tabindex="-1" aria-label="Decrease Close lot">&#9660;</button></span></span></label>
          <div class="rapid-fire-summary-cell"><div class="rapid-fire-summary-label">Floating P/L</div><div class="rapid-fire-summary-value" id="rapidFirePl">-</div></div>
          <div class="rapid-fire-summary-cell"><div class="rapid-fire-summary-label">Floating P/L%</div><div class="rapid-fire-summary-value" id="rapidFirePlPercent">-</div></div>
        </div>
        <div class="rapid-fire-add-row" aria-label="Add, double, or protect position">
          <button class="rapid-fire-dir is-long" id="rapidFireDir" type="button">LONG</button>
          <span class="rapid-fire-number-control rapid-fire-lot-control">
            <input class="rapid-fire-lot" id="rapidFireLot" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" value="0" aria-label="Rapid Fire lot size">
            <span class="rapid-fire-number-steppers"><button id="rapidFireLotUp" type="button" tabindex="-1" aria-label="Increase Rapid Fire lot">&#9650;</button><button id="rapidFireLotDown" type="button" tabindex="-1" aria-label="Decrease Rapid Fire lot">&#9660;</button></span>
          </span>
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
            <span class="rapid-fire-number-control rapid-fire-protection-price-control"><input class="rapid-fire-protection-price" id="rapidFireMasterSl" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="Price" aria-label="Master stop loss price"><span class="rapid-fire-number-steppers"><button id="rapidFireMasterSlUp" type="button" tabindex="-1" aria-label="Increase stop loss price">&#9650;</button><button id="rapidFireMasterSlDown" type="button" tabindex="-1" aria-label="Decrease stop loss price">&#9660;</button></span></span>
            <span class="rapid-fire-number-control rapid-fire-protection-pl-control"><input class="rapid-fire-protection-pl" id="rapidFireMasterSlPl" type="text" inputmode="decimal" pattern="-?[0-9]*[.]?[0-9]*" placeholder="P/L" aria-label="Master stop loss P/L"><span class="rapid-fire-number-steppers"><button id="rapidFireMasterSlPlUp" type="button" tabindex="-1" aria-label="Increase stop loss P/L">&#9650;</button><button id="rapidFireMasterSlPlDown" type="button" tabindex="-1" aria-label="Decrease stop loss P/L">&#9660;</button></span></span>
          </label>
          <label class="rapid-fire-protection-box">
            <span class="rapid-fire-protection-label">TP</span>
            <span class="rapid-fire-number-control rapid-fire-protection-price-control"><input class="rapid-fire-protection-price" id="rapidFireTakeProfit" type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="Price" aria-label="Take profit price"><span class="rapid-fire-number-steppers"><button id="rapidFireTakeProfitUp" type="button" tabindex="-1" aria-label="Increase take profit price">&#9650;</button><button id="rapidFireTakeProfitDown" type="button" tabindex="-1" aria-label="Decrease take profit price">&#9660;</button></span></span>
            <button class="rapid-fire-protection-set" id="rapidFireTakeProfitSet" type="button">Set</button>
            <span class="rapid-fire-number-control rapid-fire-protection-pl-control rapid-fire-tp-pl-control">
              <input class="rapid-fire-protection-pl" id="rapidFireTakeProfitPl" type="text" inputmode="decimal" pattern="-?[0-9]*[.]?[0-9]*" placeholder="P/L" aria-label="Take profit P/L">
              <span class="rapid-fire-number-steppers"><button id="rapidFireTakeProfitPlUp" type="button" tabindex="-1" aria-label="Increase take profit P/L">&#9650;</button><button id="rapidFireTakeProfitPlDown" type="button" tabindex="-1" aria-label="Decrease take profit P/L">&#9660;</button></span>
            </span>
          </label>
          <button class="rapid-fire-new-average-toggle is-active" id="rapidFireNewAverageToggle" type="button" aria-pressed="true" title="Show or hide the Average projection line"><span>Avg</span><i aria-hidden="true"></i></button>
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
      if(typeof api().setAddDraft==="function")api().setAddDraft(q("rapidFireLot").value,selectedDirection);
      render();
    },false);
    const lotInput=q("rapidFireLot");
    const openSize=q("rapidFireOpenSize");
    const closeSize=q("rapidFireCloseSize");
    const syncEditedSize=(editedKind,input,finalize=false)=>{
      const bridge=api();
      const snapshot=bridge.snapshot();
      const precision=Math.max(0,number(input.dataset.precision)||0);
      const parts=editedPositionSizeParts(snapshot.size,input.value,editedKind,value=>bridge.normalizeQuantity(value));
      const edited=parts.active;
      closeQuantityOverride=parts.closed;
      const typed=input.value;
      setCloseSliderDisplay(parts.total>0?closeQuantityOverride/parts.total*100:0);
      render();
      input.value=finalize?lot(edited,precision):typed;
    };
    const lotController=bindNumericDraftInput(lotInput,{
      onDraft:value=>{
        const bridge=api();
        if(bridge&&typeof bridge.setAddDraft==="function")bridge.setAddDraft(value,selectedDirection);
        render();
      },
      onCommit:()=>{
        const bridge=api();
        const normalized=bridge.normalizeQuantity(lotInput.value);
        if(normalized.available)lotInput.value=normalized.text;
        if(typeof bridge.setAddDraft==="function")bridge.setAddDraft(lotInput.value,selectedDirection);
      }
    });
    bindNumericAdjustControls(lotController,{upButton:q("rapidFireLotUp"),downButton:q("rapidFireLotDown"),step:0.001,precision:()=>Math.max(3,api().lotRules().precision),commit:false,min:0});
    const sizeControllers={
      remaining:bindNumericDraftInput(openSize,{onDraft:()=>syncEditedSize("remaining",openSize),onCommit:()=>syncEditedSize("remaining",openSize,true)}),
      close:bindNumericDraftInput(closeSize,{onDraft:()=>syncEditedSize("close",closeSize),onCommit:()=>syncEditedSize("close",closeSize,true)})
    };
    bindNumericAdjustControls(sizeControllers.remaining,{upButton:q("rapidFireOpenSizeUp"),downButton:q("rapidFireOpenSizeDown"),step:()=>api().lotRules().stepSize,precision:()=>api().lotRules().precision,min:0});
    bindNumericAdjustControls(sizeControllers.close,{upButton:q("rapidFireCloseSizeUp"),downButton:q("rapidFireCloseSizeDown"),step:()=>api().lotRules().stepSize,precision:()=>api().lotRules().precision,min:0});
    q("rapidFireAdd").addEventListener("click",()=>{
      lotController.commit("trigger");
      void executeOrCancel({action:"add",
        direction:selectedDirection,quantity:q("rapidFireLot").value,
        slPrice:q("rapidFireMasterSl").value,tpPrice:q("rapidFireTakeProfit").value,
        slPl:protectionEditDriver.sl==="pl"?protectionPlTarget.sl:null,
        tpPl:protectionEditDriver.tp==="pl"?protectionPlTarget.tp:null
      });
    },false);
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
    const slPlInput=q("rapidFireMasterSlPl");
    const tpPlInput=q("rapidFireTakeProfitPl");
    const newAverageToggle=q("rapidFireNewAverageToggle");
    newAverageToggle.addEventListener("click",()=>{
      const bridge=api();
      const next=newAverageToggle.getAttribute("aria-pressed")!=="true";
      if(bridge&&typeof bridge.setNewAverageVisible==="function")bridge.setNewAverageVisible(next);
      render();
    },false);
    const draftProtectionPrice=(kind,input,value)=>{
      protectionEditDriver[kind]="price";
      protectionPlTarget[kind]=null;
      if(kind==="sl")pendingMasterStopValue=value.trim()===""?null:value;
      else{
        const bridge=api();
        const hasLiveTakeProfit=!!(bridge&&bridge.snapshot().takeProfitOrder);
        takeProfitEditValue=value.trim()===""?null:value;
        pendingTakeProfitValue=hasLiveTakeProfit?null:takeProfitEditValue;
      }
      previewProtection(kind,input);
    };
    const finalizeProtectionPriceDraft=(kind,input)=>{
      if(input.value.trim()==="")return;
      const bridge=api();
      const normalized=bridge.normalizePrice(input.value);
      if(!normalized.executable)return;
      input.value=normalized.text;
      if(kind==="sl")pendingMasterStopValue=normalized.text;
      else{pendingTakeProfitValue=normalized.text;takeProfitEditValue=normalized.text;}
      previewProtection(kind,input);
    };
    const draftProtectionPl=(kind,plInput,priceInput,value)=>{
      protectionEditDriver[kind]="pl";
      protectionPlTarget[kind]=value.trim()===""?null:value;
      if(protectionPlTarget[kind]==null){
        priceInput.value="";
        if(kind==="sl")pendingMasterStopValue=null;
        else{pendingTakeProfitValue=null;takeProfitEditValue="";}
        previewProtection(kind,priceInput);
        return;
      }
      const bridge=api();
      const price=bridge&&typeof bridge.protectionPriceFromPl==="function"
        ? bridge.protectionPriceFromPl(kind,protectionPlTarget[kind],{quantity:lotInput.value,direction:selectedDirection})
        : null;
      if(number(price)>0){
        priceInput.value=String(price);
        if(kind==="sl")pendingMasterStopValue=String(price);
        else{pendingTakeProfitValue=String(price);takeProfitEditValue=String(price);}
        previewProtection(kind,priceInput);
      }else render();
    };
    const finalizeProtectionPl=(kind,input)=>{
      if(input.value.trim()==="")return;
      input.value=protectionPlText(input.value);
      protectionPlTarget[kind]=input.value;
    };
    const numericControllers={
      slPrice:bindNumericDraftInput(slInput,{onDraft:value=>draftProtectionPrice("sl",slInput,value),onCommit:()=>{void commitProtection("sl",slInput);}}),
      tpPrice:bindNumericDraftInput(tpInput,{onDraft:value=>draftProtectionPrice("tp",tpInput,value),onCommit:()=>finalizeProtectionPriceDraft("tp",tpInput)}),
      slPl:bindNumericDraftInput(slPlInput,{allowNegative:true,onDraft:value=>draftProtectionPl("sl",slPlInput,slInput,value),onCommit:()=>{finalizeProtectionPl("sl",slPlInput);void commitProtection("sl",slInput);}}),
      tpPl:bindNumericDraftInput(tpPlInput,{allowNegative:true,onDraft:value=>draftProtectionPl("tp",tpPlInput,tpInput,value),onCommit:()=>finalizeProtectionPl("tp",tpPlInput)})
    };
    const protectionAdjustOptions=(kind,mode,upButton,downButton)=>{
      const bridge=api();
      const controller=numericControllers[kind+(mode==="price"?"Price":"Pl")];
      if(mode==="price")return {
        upButton,downButton,
        step:()=>api().priceRules().tickSize,
        precision:()=>api().priceRules().precision,
        base:()=>{
          const snapshot=api().snapshot();
          const fallback=kind==="sl"?snapshot.masterStopPrice:snapshot.takeProfitPrice;
          return number(controller.input.value)>0?controller.input.value:(number(fallback)>0?fallback:snapshot.protectionReferencePrice);
        },
        validateBase:value=>number(value)>0,
        normalize:value=>{
          const normalized=api().normalizePrice(value);
          return normalized.executable?normalized.text:null;
        }
      };
      return {
        upButton,downButton,step:0.5,precision:2,
        base:()=>{
          const snapshot=bridge.snapshot();
          const fallback=kind==="sl"?snapshot.masterSlPl:snapshot.takeProfitPl;
          return number(controller.input.value)==null?fallback:controller.input.value;
        },
        format:protectionPlText
      };
    };
    bindNumericAdjustControls(numericControllers.slPrice,protectionAdjustOptions("sl","price",q("rapidFireMasterSlUp"),q("rapidFireMasterSlDown")));
    bindNumericAdjustControls(numericControllers.slPl,protectionAdjustOptions("sl","pl",q("rapidFireMasterSlPlUp"),q("rapidFireMasterSlPlDown")));
    bindNumericAdjustControls(numericControllers.tpPrice,protectionAdjustOptions("tp","price",q("rapidFireTakeProfitUp"),q("rapidFireTakeProfitDown")));
    bindNumericAdjustControls(numericControllers.tpPl,protectionAdjustOptions("tp","pl",q("rapidFireTakeProfitPlUp"),q("rapidFireTakeProfitPlDown")));
    const tpSet=q("rapidFireTakeProfitSet");
    const tpProtectionBox=tpInput.closest(".rapid-fire-protection-box");
    tpSet.addEventListener("mousedown",event=>event.preventDefault(),false);
    tpProtectionBox.addEventListener("focusout",()=>{setTimeout(()=>{
      if(tpProtectionBox.contains(document.activeElement))return;
      const bridge=api();
      if(!bridge)return;
      if(!bridge.snapshot().takeProfitOrder){
        if(tpInput.value.trim()!==""){
          const normalized=bridge.normalizePrice(tpInput.value);
          if(normalized.executable){
            tpInput.value=normalized.text;
            pendingTakeProfitValue=normalized.text;
            takeProfitEditValue=normalized.text;
            if(typeof bridge.setProtectionDraft==="function")bridge.setProtectionDraft("tp",normalized.text);
            render();
          }
        }
        return;
      }
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
    window.addEventListener("bt001:rapid-fire-live-sync",render,false);
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
