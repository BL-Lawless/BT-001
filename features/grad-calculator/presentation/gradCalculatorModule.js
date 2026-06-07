(() => {
  "use strict";

  const MODULE = "GR_COMMIT_V4";
  const OWNER = "grad";
  const ORDER_URL = "https://fapi.binance.com/fapi/v1/order";
  const ALGO_URL = "https://fapi.binance.com/fapi/v1/algoOrder";
  const OPEN_ORDERS_URL = "https://fapi.binance.com/fapi/v1/openOrders";
  const OPEN_ALGO_URL = "https://fapi.binance.com/fapi/v1/openAlgoOrders";
  const sections = ["entry","protection","exit"];
  const state = {
    active:"entry",
    direction:"LONG",
    livePosition:null,
    positionBasis:{protection:null,exit:null},
    stale:{protection:false,exit:false},
    rows:{entry:[],protection:[],exit:[]},
    visible:{entry:true,protection:true,exit:true},
    generators:{
      entry:{start:"",end:"",step:"",lot:"0.000",count:"3",lastEdited:"end"},
      protection:{start:"",end:"",step:"",lot:"0.000",count:"2",lastEdited:"end"},
      exit:{start:"",end:"",step:"",lot:"0.000",count:"3",lastEdited:"end"}
    },
    overlayBoxes:[],
    drag:null,
    rowSeq:0,
    preflight:null
  };

  const q = id => document.getElementById(id);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const domain = () => window.GradCalculatorDomain;
  const fmtPrice = value => number(value) == null ? "-" : Math.round(number(value)).toLocaleString("en-US");
  const fmtLevelInput = value => number(value) == null ? "" : String(Math.round(number(value)));
  const fmtStep = value => number(value) == null ? "" : number(value).toFixed(1);
  const fmtLot = value => number(value) == null ? "0.000" : Math.max(0,number(value)).toFixed(3);
  const fmtMoney = value => number(value) == null ? "-" : (number(value) > 0 ? "+" : number(value) < 0 ? "-" : "") + "$" + Math.abs(number(value)).toFixed(2);
  const moneyColor = value => number(value) == null || number(value) === 0 ? "#111" : number(value) > 0 ? "#047857" : "#f6465d";
  const sectionTitle = section => section === "entry" ? "Entry" : section === "protection" ? "Protection" : "Exit";
  const clientPrefix = section => section === "entry" ? "GRAD_EN_" : section === "protection" ? "GRAD_PR_" : "GRAD_EX_";
  const currentSymbol = () => { try{return cfg().symbol;}catch(_e){return String(q("market")?.value || "").toUpperCase();} };
  const currentPrice = () => {
    for(const value of [typeof lastMarkPrice !== "undefined" ? lastMarkPrice : null,typeof candles !== "undefined" && candles.length ? candles[candles.length - 1].close : null,String(q("mClose")?.textContent || "").replace(/[$,]/g,"")]){
      const parsed = number(value);
      if(parsed != null && parsed > 0) return parsed;
    }
    return null;
  };
  const redraw = () => { try{if(typeof draw === "function") draw();}catch(_e){} };
  const setStatus = text => { const node=q("gradCalcStatus"); if(node) node.textContent=text || ""; };
  const rows = section => state.rows[section];
  const validRows = section => rows(section).filter(row => number(row.level) > 0 && number(row.lot) >= .001);
  const weighted = section => domain().weightedAverage(validRows(section));
  const referenceEntry = () => weighted("entry").average || number(state.livePosition && state.livePosition.entry);
  const positionDirection = () => state.livePosition && state.livePosition.side || state.direction;
  const rowPl = (section,row) => {
    const entry = referenceEntry();
    return entry == null ? null : domain().estimatePl(positionDirection(),entry,row.level,row.lot);
  };
  const totalPl = section => validRows(section).reduce((sum,row) => sum + (rowPl(section,row) || 0),0);
  const leverage = () => {
    const list = typeof openPositionBoxes !== "undefined" && Array.isArray(openPositionBoxes) ? openPositionBoxes : [];
    const box = list.find(item => item && (!item.symbol || item.symbol === currentSymbol()) && number(item.leverage) > 0);
    return box ? number(box.leverage) : null;
  };
  const rowMargin = row => {
    const lev=leverage(), level=number(row.level), lot=number(row.lot);
    return lev && level && lot ? level * lot / lev : null;
  };
  const totalMargin = () => validRows("entry").reduce((sum,row) => sum + (rowMargin(row) || 0),0);
  const ownedClientId = order => String(order && (order.clientOrderId || order.clientAlgoId || "") || "").startsWith("GRAD_");
  const orderSection = order => {
    const id=String(order && (order.clientOrderId || order.clientAlgoId || "") || "");
    if(id.startsWith("GRAD_EN_") || id.startsWith("GRAD_SI_")) return "entry";
    if(id.startsWith("GRAD_PR_")) return "protection";
    if(id.startsWith("GRAD_EX_") || id.startsWith("GRAD_SO_")) return "exit";
    return null;
  };
  const createRowId = section => `gr_${section}_${Date.now()}_${++state.rowSeq}`;
  const rowLabel = (section,index) => section === "entry" ? `G Entry ${index + 1}` : section === "exit" ? `G Exit ${index + 1}` : index === 0 ? "G SL" : `G PSL ${index}`;

  function rowModel(section,data={}){
    return {
      owner:OWNER,module:OWNER,section,
      localRowId:data.localRowId || createRowId(section),
      binanceOrderId:data.binanceOrderId || null,
      clientOrderId:data.clientOrderId || null,
      status:data.status || "local",
      level:fmtLevelInput(data.level),
      lot:fmtLot(data.lot)
    };
  }
  function clearSection(section){
    state.rows[section]=[];
    if(section!=="entry"){state.positionBasis[section]=null;state.stale[section]=false;}
    renderSection(section);
    calculate();
    setStatus(sectionTitle(section) + " cleared locally.");
  }
  function clearAll(){
    sections.forEach(section => {state.rows[section]=[];renderSection(section);});
    state.livePosition=null;
    state.positionBasis={protection:null,exit:null};
    state.stale={protection:false,exit:false};
    calculate();
    setStatus("All GR local state cleared.");
  }
  function showSection(section,next){
    state.visible[section]=!!next;
    const button=q(`grad${section}Show`);
    if(button) button.classList.toggle("is-on",state.visible[section]);
    redraw();
  }
  function setActive(section){
    state.active=section;
    sections.forEach(name => {
      q(`gradTab${name}`)?.classList.toggle("is-active",name===section);
      q(`gradPanel${name}`)?.classList.toggle("is-active",name===section);
    });
  }

  function generatorMarkup(section){
    const prefix=`grad${section}`;
    return `<div class="grad-calc-generator">
      ${section==="entry" ? `<label>Direction<select id="${prefix}Direction"><option>LONG</option><option>SHORT</option></select></label>` : ""}
      <label>Start level<input id="${prefix}Start" type="number" min="0" step="10"></label>
      <label>End level<input id="${prefix}End" type="number" min="0" step="10"></label>
      <label>Step<input id="${prefix}Step" type="number" min="0" step="0.1"></label>
      <label>Total lot<input id="${prefix}Lot" type="number" min="0.001" step="0.001" value="0.000"></label>
      <label>Count<input id="${prefix}Count" type="number" min="1" step="1" value="${section==="protection" ? 2 : 3}"></label>
    </div>`;
  }
  function panelMarkup(section){
    const valueTitle=section==="entry" ? "Margin" : section==="protection" ? "Risk" : "PL";
    return `<section class="grad-calc-tab-panel" id="gradPanel${section}">
      <div class="grad-calc-tab-actions">
        <button id="grad${section}Clear" type="button">Clear</button>
        <button id="grad${section}Read" type="button">Read</button>
        <button id="grad${section}Show" class="is-on" type="button">Show</button>
        <button id="grad${section}Send" type="button">Send</button>
      </div>
      ${generatorMarkup(section)}
      <div class="grad-calc-table-head"><div>#</div><div>Level</div><div>Lot</div><div>${valueTitle}</div><div>x</div></div>
      <div id="grad${section}Rows"></div>
      <div class="grad-calc-section-totals"><span>Average ${sectionTitle(section)}</span><span id="grad${section}Average">-</span></div>
      <div class="grad-calc-section-totals"><span>Total ${valueTitle}</span><span id="grad${section}Total">-</span></div>
    </section>`;
  }
  function ensureWindow(){
    let win=q("gradCalcWindow");
    if(win) return win;
    win=document.createElement("div");
    win.id="gradCalcWindow";
    win.className="grad-calc-window hidden";
    win.innerHTML=`<div class="grad-calc-head" id="gradCalcHead"><div class="grad-calc-title">GR Commit V4</div><button id="gradCalcClose" type="button">x</button></div>
      <div class="grad-calc-body">
        <div class="grad-calc-tabs">${sections.map(section=>`<button id="gradTab${section}" type="button">${sectionTitle(section)}</button>`).join("")}</div>
        <div class="grad-calc-tab-stage">${sections.map(panelMarkup).join("")}</div>
        <div class="grad-calc-summary">
          <div class="grad-calc-summary-title">Summary</div>
          <div class="grad-calc-summary-grid">
            <div><span>Entry lots</span><b id="gradSummaryEntryLots">0.000</b></div>
            <div><span>Average Entry</span><b id="gradSummaryEntryAvg">-</b></div>
            <div><span>Total Risk</span><b id="gradSummaryRisk">-</b></div>
            <div><span>Projected P/L</span><b id="gradSummaryPl">-</b></div>
          </div>
        </div>
        <button class="grad-calc-clear-all" id="gradCalcClearAll" type="button">Clear All GR</button>
        <div class="grad-calc-status" id="gradCalcStatus"></div>
      </div>
      ${["n","e","s","w","ne","se","sw","nw"].map(edge=>`<div class="grad-resize-handle grad-resize-${edge}" data-edge="${edge}"></div>`).join("")}`;
    document.body.appendChild(win);
    return win;
  }
  function arrangeMetricButtons(){
    const gr=q("gradCalcMetric"), assess=q("v29AssessMetric"), floating=q("mFloatPL")?.closest(".metric"), account=q("mBalance")?.closest(".metric");
    if(!gr || !account || !account.parentNode) return;
    account.insertAdjacentElement("beforebegin",gr);
    if(assess){
      if(floating && floating.parentNode) floating.insertAdjacentElement("afterend",assess);
      else gr.insertAdjacentElement("afterend",assess);
    }
  }
  function ensureButton(){
    let wrap=q("gradCalcMetric");
    if(!wrap){
      wrap=document.createElement("div");
      wrap.id="gradCalcMetric";
      wrap.className="grad-calc-metric";
      wrap.innerHTML=`<button class="grad-calc-icon" id="gradCalcOpen" type="button" title="GR Commit">GR</button>`;
      document.querySelector(".metrics")?.appendChild(wrap);
    }
    arrangeMetricButtons();
    [0,250,1000].forEach(delay=>setTimeout(arrangeMetricButtons,delay));
    return q("gradCalcOpen");
  }
  function ensurePreflight(){
    let modal=q("gradPreflight");
    if(modal) return modal;
    modal=document.createElement("div");
    modal.id="gradPreflight";
    modal.className="grad-preflight hidden";
    modal.innerHTML=`<div class="grad-preflight-box"><div class="grad-preflight-head"><b id="gradPreflightTitle">GR Preflight</b><button id="gradPreflightClose" type="button">x</button></div><div id="gradPreflightMessage"></div><table><thead><tr><th>#</th><th>Level</th><th>Lot</th><th>Status</th></tr></thead><tbody id="gradPreflightRows"></tbody></table><button id="gradPreflightConfirm" type="button">Confirm Send</button></div>`;
    document.body.appendChild(modal);
    q("gradPreflightClose").onclick=()=>modal.classList.add("hidden");
    q("gradPreflightConfirm").onclick=confirmPreflight;
    return modal;
  }

  function renderSection(section){
    const container=q(`grad${section}Rows`);
    if(!container) return;
    container.innerHTML="";
    rows(section).forEach((model,index)=>{
      const node=document.createElement("div");
      node.className="grad-calc-row";
      Object.assign(node.dataset,{owner:OWNER,module:OWNER,section,localRowId:model.localRowId,status:model.status});
      if(model.binanceOrderId!=null) node.dataset.binanceOrderId=String(model.binanceOrderId);
      node.innerHTML=`<span class="grad-calc-index">${index+1}</span><input class="grad-calc-level" type="number" min="0" step="10" value="${fmtLevelInput(model.level)}"><input class="grad-calc-lot" type="number" min="0.001" step="0.001" value="${fmtLot(model.lot)}"><span class="grad-calc-value">-</span><button class="grad-calc-remove" type="button">x</button>`;
      const level=node.querySelector(".grad-calc-level"), lot=node.querySelector(".grad-calc-lot");
      const sync=()=>{
        model.level=fmtLevelInput(level.value);
        model.lot=fmtLot(lot.value);
        level.value=model.level;lot.value=model.lot;
        model.status=model.binanceOrderId ? "modified" : "local";
        node.dataset.status=model.status;
        syncGeneratorFromRows(section);
        calculate();
      };
      level.onchange=sync;lot.onchange=sync;
      node.querySelector(".grad-calc-remove").onclick=()=>{state.rows[section]=rows(section).filter(row=>row.localRowId!==model.localRowId);renderSection(section);syncGeneratorFromRows(section);calculate();};
      container.appendChild(node);
    });
  }
  function updateRowValues(section){
    const total=validRows(section).reduce((sum,row)=>sum+(number(row.lot)||0),0);
    const exceedsPosition=section!=="entry"&&state.livePosition&&total>state.livePosition.qty+1e-9;
    q(`grad${section}Rows`)?.querySelectorAll(".grad-calc-row").forEach((node,index)=>{
      const row=rows(section)[index];
      const value=section==="entry" ? rowMargin(row) : rowPl(section,row);
      const valueNode=node.querySelector(".grad-calc-value");
      valueNode.textContent=fmtMoney(value);
      valueNode.style.color=section==="entry" ? "#111" : moneyColor(value);
      const market=currentPrice(), level=number(row.level);
      node.classList.toggle("is-invalid",section==="entry" && market!=null && level!=null && (state.direction==="LONG" ? level>=market : level<=market));
      node.classList.toggle("is-invalid-lot",!!exceedsPosition);
    });
  }
  function calculate(){
    sections.forEach(updateRowValues);
    const entry=weighted("entry"), protection=weighted("protection"), exit=weighted("exit");
    const risk=totalPl("protection"), projected=totalPl("exit");
    q("gradentryAverage").textContent=fmtPrice(entry.average);q("gradentryTotal").textContent=fmtMoney(totalMargin());
    q("gradprotectionAverage").textContent=fmtPrice(protection.average);q("gradprotectionTotal").textContent=fmtMoney(risk);q("gradprotectionTotal").style.color=moneyColor(risk);
    q("gradexitAverage").textContent=fmtPrice(exit.average);q("gradexitTotal").textContent=fmtMoney(projected);q("gradexitTotal").style.color=moneyColor(projected);
    q("gradSummaryEntryLots").textContent=fmtLot(entry.quantity);q("gradSummaryEntryAvg").textContent=fmtPrice(entry.average);
    q("gradSummaryRisk").textContent=fmtMoney(risk);q("gradSummaryRisk").style.color=moneyColor(risk);
    q("gradSummaryPl").textContent=fmtMoney(projected);q("gradSummaryPl").style.color=moneyColor(projected);
    ["protection","exit"].forEach(section=>q(`gradPanel${section}`)?.classList.toggle("is-stale",state.stale[section]));
    redraw();
  }
  function generatorDirection(section){
    const direction=positionDirection();
    if(section==="entry") return state.direction==="LONG" ? -1 : 1;
    if(section==="protection") return direction==="LONG" ? -1 : 1;
    return direction==="LONG" ? 1 : -1;
  }
  function readGenerator(section){
    const prefix=`grad${section}`, generator=state.generators[section];
    generator.start=q(prefix+"Start").value;generator.end=q(prefix+"End").value;generator.step=q(prefix+"Step").value;generator.lot=q(prefix+"Lot").value;generator.count=q(prefix+"Count").value;
    if(section==="entry") state.direction=q(prefix+"Direction").value==="SHORT" ? "SHORT" : "LONG";
    return generator;
  }
  function writeGenerator(section){
    const prefix=`grad${section}`, generator=state.generators[section];
    q(prefix+"Start").value=fmtLevelInput(generator.start);q(prefix+"End").value=fmtLevelInput(generator.end);q(prefix+"Step").value=fmtStep(generator.step);q(prefix+"Lot").value=fmtLot(generator.lot);q(prefix+"Count").value=String(Math.max(1,Math.floor(number(generator.count)||1)));
  }
  function generate(section){
    const generator=readGenerator(section), start=number(generator.start), count=Math.max(1,Math.floor(number(generator.count)||1)), sign=generatorDirection(section);
    if(start==null || start<=0) return;
    let step=Math.abs(number(generator.step)||0);
    const end=number(generator.end);
    if(generator.lastEdited!=="step" && end!=null && count>1) step=Math.abs(end-start)/(count-1);
    const levels=Array.from({length:count},(_,index)=>start+sign*step*index);
    generator.step=step;generator.end=levels[levels.length-1];generator.count=count;
    const lots=domain().distributeLots(generator.lot,count);
    state.rows[section]=levels.map((level,index)=>rowModel(section,{level,lot:lots[index]}));
    writeGenerator(section);renderSection(section);calculate();
  }
  function syncGeneratorFromRows(section){
    const list=rows(section);
    if(!list.length) return;
    const generator=state.generators[section];
    generator.start=number(list[0].level);generator.end=number(list[list.length-1].level);generator.count=list.length;
    generator.step=list.length>1 ? Math.abs(number(generator.end)-number(generator.start))/(list.length-1) : 0;
    generator.lot=list.reduce((sum,row)=>sum+(number(row.lot)||0),0);
    generator.lastEdited="end";
    writeGenerator(section);
  }
  function redistributeFromBoundaries(section,boundary,level){
    const list=rows(section),generator=state.generators[section],start=boundary==="start"?number(level):number(generator.start),end=boundary==="end"?number(level):number(generator.end);
    if(list.length<2||start==null||end==null||start<=0||end<=0)return false;
    const sign=generatorDirection(section);
    if((end-start)*sign<0)return false;
    const step=Math.abs(end-start)/(list.length-1);
    list.forEach((row,index)=>{row.level=fmtLevelInput(start+sign*step*index);row.status=row.binanceOrderId?"modified":"local";});
    generator.start=start;generator.end=end;generator.step=step;generator.count=list.length;generator.lastEdited="end";
    writeGenerator(section);renderSection(section);calculate();
    return true;
  }

  async function signedWrite(url,method,params){
    if(typeof hasKeys!=="function" || !hasKeys()) throw new Error("API keys are required.");
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const query=new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now()+offset)}).toString(),signature=await hmac(secret,query);
    const response=await API.fetch(url+"?"+query+"&signature="+signature,{method,cache:"no-store",headers:{"X-MBX-APIKEY":key}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data&&data.msg?data.msg:"HTTP "+response.status);
    return data;
  }
  async function livePosition(){
    if(typeof hasKeys!=="function" || !hasKeys()) return null;
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const list=typeof getPositions==="function" ? await getPositions(key,secret,offset) : [];
    const found=(list||[]).find(row=>row&&row.symbol===currentSymbol()&&Math.abs(number(row.positionAmt)||0)>0);
    if(!found) return null;
    return {side:number(found.positionAmt)<0||String(found.positionSide).toUpperCase()==="SHORT"?"SHORT":"LONG",qty:Math.abs(number(found.positionAmt)),entry:number(found.entryPrice),positionSide:String(found.positionSide||"BOTH").toUpperCase()};
  }
  const positionFingerprint = position => position ? [currentSymbol(),position.side,fmtLot(position.qty),position.positionSide].join("|") : "none";
  function setPositionBasis(section,position){
    state.positionBasis[section]=positionFingerprint(position);
    state.stale[section]=false;
  }
  async function refreshPositionAwareness(section,{quiet=false}={}){
    if(section==="entry")return null;
    const current=await livePosition();
    state.livePosition=current;
    const basis=state.positionBasis[section];
    state.stale[section]=!!basis&&positionFingerprint(current)!==basis;
    if(state.stale[section]&&!quiet)setStatus(sectionTitle(section)+" is stale — open position changed. Read again before Send.");
    calculate();
    return current;
  }
  async function ownedOrders(section){
    if(typeof hasKeys!=="function" || !hasKeys()) throw new Error("API keys are required.");
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const normal=await signedGet(OPEN_ORDERS_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    const algo=await signedGet(OPEN_ALGO_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    return [].concat(Array.isArray(normal)?normal:[],Array.isArray(algo)?algo:[]).filter(order=>ownedClientId(order)&&orderSection(order)===section);
  }
  function importOwned(section,ordersList){
    state.rows[section]=ordersList.map(order=>rowModel(section,{localRowId:`gr_owned_${order.orderId||order.algoId||order.clientOrderId||order.clientAlgoId}`,binanceOrderId:order.orderId||order.algoId||null,clientOrderId:order.clientOrderId||order.clientAlgoId||null,status:"sent",level:order.price||order.stopPrice||order.triggerPrice,lot:order.origQty||order.quantity||order.qty}));
    renderSection(section);syncGeneratorFromRows(section);calculate();
  }
  function seedPositionGenerator(section){
    const generator=state.generators[section],entry=number(state.livePosition&&state.livePosition.entry),direction=positionDirection();
    if(entry==null)return;
    const unit=Math.max(1,Math.round(entry*.002));
    if(number(generator.start)==null || number(generator.start)<=0){
      generator.start=section==="protection"
        ? entry+(direction==="LONG"?-unit:unit)
        : entry+(direction==="LONG"?unit:-unit);
    }
    if(number(generator.end)==null || number(generator.end)<=0){
      generator.end=section==="protection"
        ? entry+(direction==="LONG"?-unit*3:unit*3)
        : entry+(direction==="LONG"?unit*3:-unit*3);
    }
    generator.lastEdited="end";
    writeGenerator(section);
  }
  async function readSection(section){
    setStatus("Reading GR "+sectionTitle(section)+"...");
    try{
      if(section==="entry"){
        importOwned(section,await ownedOrders(section));
      }else{
        state.livePosition=await livePosition();
        if(!state.livePosition) throw new Error(sectionTitle(section)+" Read blocked: no valid open position.");
        setPositionBasis(section,state.livePosition);
        state.generators[section].lot=state.livePosition.qty;
        seedPositionGenerator(section);
        q(`grad${section}Lot`).value=fmtLot(state.livePosition.qty);
        generate(section);
      }
      setStatus(sectionTitle(section)+" Read complete.");
    }catch(error){setStatus(error.message||String(error));}
  }
  function validateSection(section){
    const allRows=rows(section),list=validRows(section),errors=[];
    if(!list.length) errors.push("No valid rows.");
    if(section==="entry"){
      const market=currentPrice();
      if(market==null) errors.push("Current market price unavailable.");
      list.forEach(row=>{const level=number(row.level);if(state.direction==="LONG"&&level>=market)errors.push("Long entries must be below market.");if(state.direction==="SHORT"&&level<=market)errors.push("Short entries must be above market.");});
    }else{
      if(!state.livePosition) errors.push("No valid open position.");
      if(!state.positionBasis[section]) errors.push(sectionTitle(section)+" requires Read before Send.");
      if(state.stale[section]) errors.push(sectionTitle(section)+" is stale. Read again before Send.");
      const total=list.reduce((sum,row)=>sum+number(row.lot),0);
      if(state.livePosition&&total>state.livePosition.qty+1e-9) errors.push("Total lots exceed live position size.");
    }
    allRows.forEach(row=>{
      const level=number(row.level),lot=number(row.lot);
      if(level==null||level<=0||Math.abs(level-Math.round(level))>1e-9)errors.push("Price level must be a positive whole number.");
      if(lot==null||lot<.001)errors.push("Lot below Binance minimum.");
      else if(Math.abs(lot*1000-Math.round(lot*1000))>1e-7)errors.push("Lot must follow the 0.001 increment.");
      if(row.binanceOrderId!=null&&!String(row.clientOrderId||"").startsWith("GRAD_"))errors.push("GR ownership cannot be proven.");
    });
    return [...new Set(errors)];
  }
  async function openPreflight(section){
    try{if(section!=="entry")await refreshPositionAwareness(section);}catch(_e){state.livePosition=null;state.stale[section]=true;}
    const errors=validateSection(section),list=validRows(section).filter(row=>row.status==="local"||row.status==="modified");
    if(!list.length)errors.push("No local or modified GR rows to send.");
    state.preflight={section,rows:list.slice(),valid:errors.length===0};
    ensurePreflight().classList.remove("hidden");
    q("gradPreflightTitle").textContent="GR "+sectionTitle(section)+" Preflight";
    q("gradPreflightMessage").textContent=errors.join(" ")||"Ready to send GR-owned orders.";
    q("gradPreflightRows").innerHTML=list.map((row,index)=>`<tr><td>${index+1}</td><td>${fmtLevelInput(row.level)}</td><td>${fmtLot(row.lot)}</td><td>${row.status}</td></tr>`).join("");
    q("gradPreflightConfirm").disabled=!state.preflight.valid;
  }
  async function executeSection(section,list){
    for(let index=0;index<list.length;index++){
      const row=list[index],clientId=(clientPrefix(section)+Date.now().toString(36)+"_"+index).slice(0,36);
      if(section==="protection"){
        const side=state.livePosition.side==="SHORT"?"BUY":"SELL";
        if(row.status==="modified"&&row.binanceOrderId!=null)await signedWrite(ALGO_URL,"DELETE",{symbol:currentSymbol(),algoId:String(row.binanceOrderId)});
        const payload={symbol:currentSymbol(),side,algoType:"CONDITIONAL",type:"STOP_MARKET",quantity:String(number(row.lot)),triggerPrice:String(number(row.level)),workingType:"CONTRACT_PRICE",clientAlgoId:clientId};
        if(["LONG","SHORT"].includes(state.livePosition.positionSide))payload.positionSide=state.livePosition.positionSide;else payload.reduceOnly="true";
        const response=await signedWrite(ALGO_URL,"POST",payload);row.binanceOrderId=response.algoId||response.orderId||null;row.clientOrderId=response.clientAlgoId||clientId;
      }else{
        const direction=section==="entry"?state.direction:state.livePosition.side,side=direction==="LONG"?(section==="entry"?"BUY":"SELL"):(section==="entry"?"SELL":"BUY");
        const payload={symbol:currentSymbol(),side,type:"LIMIT",timeInForce:"GTC",quantity:String(number(row.lot)),price:String(number(row.level)),newClientOrderId:clientId};
        if(section==="exit"){if(["LONG","SHORT"].includes(state.livePosition.positionSide))payload.positionSide=state.livePosition.positionSide;else payload.reduceOnly="true";}
        let response;
        if(row.status==="modified"&&row.binanceOrderId!=null){delete payload.newClientOrderId;payload.orderId=String(row.binanceOrderId);response=await signedWrite(ORDER_URL,"PUT",payload);}else response=await signedWrite(ORDER_URL,"POST",payload);
        row.binanceOrderId=response.orderId||null;row.clientOrderId=response.clientOrderId||row.clientOrderId||clientId;
      }
      row.status="sent";
    }
  }
  async function confirmPreflight(){
    const preflight=state.preflight;
    if(!preflight||!preflight.valid)return;
    q("gradPreflightConfirm").disabled=true;
    try{
      if(preflight.section!=="entry")await refreshPositionAwareness(preflight.section);
      const errors=validateSection(preflight.section);
      if(errors.length)throw new Error(errors.join(" "));
      const currentRows=validRows(preflight.section).filter(row=>row.status==="local"||row.status==="modified");
      if(!currentRows.length)throw new Error("No local or modified GR rows to send.");
      await executeSection(preflight.section,currentRows);renderSection(preflight.section);calculate();q("gradPreflight").classList.add("hidden");setStatus(sectionTitle(preflight.section)+" Send complete.");
    }
    catch(error){q("gradPreflightMessage").textContent=error.message||String(error);}
    finally{q("gradPreflightConfirm").disabled=false;}
  }

  function priceFromY(clientY){
    if(typeof canvas==="undefined"||!canvas)return null;
    const rect=canvas.getBoundingClientRect(),y=clientY-rect.top,s=typeof currentPriceLineState!=="undefined"?currentPriceLineState||{}:{},top=number(s.top)??8,height=number(s.priceH)??lastAreaH,min=number(s.minP)??lastYMin,max=number(s.maxP)??lastYMax;
    if(!(height>0)||min==null||max==null||!(max>min))return null;
    return max-((Math.max(top,Math.min(top+height,y))-top)/height)*(max-min);
  }
  function drawLabels(){
    state.overlayBoxes=[];
    if(typeof canvas==="undefined"||!canvas||typeof ctx==="undefined"||!ctx)return;
    const s=typeof currentPriceLineState!=="undefined"?currentPriceLineState||{}:{},top=number(s.top)??8,height=number(s.priceH)??lastAreaH,min=number(s.minP)??lastYMin,max=number(s.maxP)??lastYMax;
    if(!(height>0)||min==null||max==null||!(max>min))return;
    const right=canvas.clientWidth-(typeof RIGHT_AXIS==="number"?RIGHT_AXIS:84),items=[];
    sections.forEach(section=>{if(state.visible[section])validRows(section).forEach((row,index)=>items.push({section,row,index}));});
    ctx.save();ctx.font="11px Arial";ctx.textBaseline="middle";
    items.forEach((item,index)=>{const level=number(item.row.level),y=top+((max-level)/(max-min))*height;if(y<top||y>top+height)return;const value=item.section==="entry"?rowMargin(item.row):rowPl(item.section,item.row),text=rowLabel(item.section,item.index)+" | "+fmtLot(item.row.lot)+" | "+fmtMoney(value),w=Math.ceil(ctx.measureText(text).width)+12,x=Math.max(8,right-w-12-(index%3)*18),color=item.section==="entry"?"#2563eb":item.section==="protection"?"#b42334":"#047857",sectionRows=validRows(item.section),boundary=item.index===0?"start":item.index===sectionRows.length-1?"end":null;ctx.setLineDash([5,2]);ctx.strokeStyle=color;ctx.globalAlpha=.62;ctx.beginPath();ctx.moveTo(8,y);ctx.lineTo(right,y);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.96;ctx.fillStyle="#fff";ctx.fillRect(x,y-8,w,16);ctx.strokeStyle=color;ctx.lineWidth=boundary?2:1;ctx.strokeRect(x,y-8,w,16);ctx.lineWidth=1;ctx.fillStyle=color;ctx.globalAlpha=1;ctx.fillText(text,x+6,y+.5);state.overlayBoxes.push({owner:OWNER,module:OWNER,section:item.section,localRowId:item.row.localRowId,binanceOrderId:item.row.binanceOrderId,status:item.row.status,boundary,x1:x,y1:y-8,x2:x+w,y2:y+8,row:item.row});});
    ctx.restore();
  }
  function installDrawHook(){if(window.__gradDrawWrapped||typeof draw!=="function")return;window.__gradDrawWrapped=true;const previous=draw;window.draw=draw=function(){const result=previous.apply(this,arguments);try{drawLabels();}catch(error){console.warn(MODULE+" overlay failed",error);}return result;};}
  function hit(clientX,clientY){if(typeof canvas==="undefined"||!canvas)return null;const rect=canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;return state.overlayBoxes.find(box=>x>=box.x1&&x<=box.x2&&y>=box.y1&&y<=box.y2)||null;}
  function installDrag(){if(typeof canvas==="undefined"||!canvas||canvas.__gradV4Drag)return;canvas.__gradV4Drag=true;canvas.addEventListener("mousedown",event=>{const box=hit(event.clientX,event.clientY);if(!box||!box.boundary)return;state.drag=box;event.preventDefault();event.stopImmediatePropagation();},true);window.addEventListener("mousemove",event=>{if(!state.drag)return;const level=priceFromY(event.clientY);if(level==null||level<=0)return;redistributeFromBoundaries(state.drag.section,state.drag.boundary,level);event.preventDefault();},true);window.addEventListener("mouseup",event=>{if(!state.drag)return;state.drag=null;event.preventDefault();},true);}
  function bindGenerator(section){
    const prefix=`grad${section}`;
    ["Start","End","Step","Lot","Count"].forEach(name=>q(prefix+name).addEventListener("input",()=>{const generator=state.generators[section];if(name==="Step")generator.lastEdited="step";else if(name==="End")generator.lastEdited="end";readGenerator(section);if(number(q(prefix+"Start").value)>0)generate(section);},false));
    if(section==="entry")q(prefix+"Direction").addEventListener("change",()=>{readGenerator(section);generate(section);},false);
  }
  function installWindowDrag(win){const head=q("gradCalcHead");let drag=null;head.addEventListener("pointerdown",event=>{if(event.target.closest("button"))return;const rect=win.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};head.setPointerCapture(event.pointerId);});head.addEventListener("pointermove",event=>{if(!drag)return;win.style.left=Math.max(0,drag.left+event.clientX-drag.x)+"px";win.style.top=Math.max(0,drag.top+event.clientY-drag.y)+"px";});head.addEventListener("pointerup",event=>{drag=null;try{head.releasePointerCapture(event.pointerId);}catch(_e){}});}
  function installWindowResize(win){
    win.querySelectorAll(".grad-resize-handle").forEach(handle=>handle.addEventListener("pointerdown",event=>{
      const edge=handle.dataset.edge,rect=win.getBoundingClientRect(),origin={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
      handle.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();
      const move=moveEvent=>{
        const dx=moveEvent.clientX-origin.x,dy=moveEvent.clientY-origin.y,minWidth=390,minHeight=360;
        let left=origin.left,top=origin.top,width=origin.width,height=origin.height;
        if(edge.includes("e"))width=Math.max(minWidth,origin.width+dx);
        if(edge.includes("s"))height=Math.max(minHeight,origin.height+dy);
        if(edge.includes("w")){width=Math.max(minWidth,origin.width-dx);left=origin.left+(origin.width-width);}
        if(edge.includes("n")){height=Math.max(minHeight,origin.height-dy);top=origin.top+(origin.height-height);}
        win.style.left=Math.max(0,left)+"px";win.style.top=Math.max(0,top)+"px";win.style.width=Math.min(width,window.innerWidth-Math.max(0,left))+"px";win.style.height=Math.min(height,window.innerHeight-Math.max(0,top))+"px";
      };
      const up=()=>{handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",up);handle.removeEventListener("pointercancel",up);};
      handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",up);handle.addEventListener("pointercancel",up);
    }));
  }
  function installPositionWatcher(){
    window.setInterval(async()=>{for(const section of ["protection","exit"]){if(!state.positionBasis[section])continue;try{await refreshPositionAwareness(section,{quiet:true});}catch(_e){state.stale[section]=true;calculate();}}},15000);
  }
  function bind(){
    const win=ensureWindow(),open=ensureButton();ensurePreflight();
    sections.forEach(section=>{bindGenerator(section);q(`gradTab${section}`).onclick=()=>setActive(section);q(`grad${section}Clear`).onclick=()=>clearSection(section);q(`grad${section}Read`).onclick=()=>readSection(section);q(`grad${section}Show`).onclick=()=>showSection(section,!state.visible[section]);q(`grad${section}Send`).onclick=()=>openPreflight(section);renderSection(section);});
    q("gradCalcClearAll").onclick=clearAll;q("gradCalcClose").onclick=()=>{win.classList.add("hidden");open.classList.remove("is-on");};open.onclick=()=>{const hidden=win.classList.toggle("hidden");open.classList.toggle("is-on",!hidden);arrangeMetricButtons();};
    installWindowDrag(win);installWindowResize(win);installDrawHook();installDrag();installPositionWatcher();setActive("entry");calculate();
    window.GRAD_CALCULATOR={version:MODULE,owner:OWNER,state,open(){win.classList.remove("hidden");open.classList.add("is-on");},hide(){win.classList.add("hidden");open.classList.remove("is-on");},clear:clearAll,readSection,sendSection:openPreflight,setVisible:showSection,getOwnedRows(){return sections.flatMap(section=>rows(section).map(row=>({...row})));}};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
