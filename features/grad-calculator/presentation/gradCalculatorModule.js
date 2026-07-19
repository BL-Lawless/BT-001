(() => {
  "use strict";

  const MODULE = "GR_COMMIT_V15";
  const OWNER = "GR";
  const STORE_KEY = "bt001_gr_commit_v5_orders";
  const EXPRESS_KEY = "bt001_gr_commit_v5_express_mode";
  const ORDER_URL = "https://fapi.binance.com/fapi/v1/order";
  const ALGO_URL = "https://fapi.binance.com/fapi/v1/algoOrder";
  const OPEN_ORDERS_URL = "https://fapi.binance.com/fapi/v1/openOrders";
  const OPEN_ALGO_URL = "https://fapi.binance.com/fapi/v1/openAlgoOrders";
  const sections = ["entry","protection","exit"];
  const conditionalClassifier = window.BinanceConditionalOrderClassifier || null;
  const positionGroupTracker = window.BT001PositionGroups || null;
  const CONDITIONAL_KIND = conditionalClassifier && conditionalClassifier.KINDS
    ? conditionalClassifier.KINDS
    : {MASTER_SL:"MASTER_SL",PSL:"PSL",MASTER_TP:"MASTER_TP",PARTIAL_TP:"PARTIAL_TP",UNKNOWN:"UNKNOWN"};
  const state = {
    active:"entry",
    direction:"LONG",
    livePosition:null,
    positionBasis:{protection:null,exit:null},
    stale:{protection:false,exit:false},
    loadedMode:{entry:false,protection:false,exit:false},
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
    clientSeq:0,
    preflight:null,
    reconcile:null,
    expressMode:false,
    labelFrame:0,
    lastSettingsRequestedSymbol:""
  };

  const q = id => document.getElementById(id);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const domain = () => window.GradCalculatorDomain;
  const GR_PRICE_DECIMALS = 0;
  const GR_PRICE_INCREMENT = 1;
  const fmtPrice = value => {
    const normalized=normalizeGrPrice(value);
    return normalized==null?"-":Number(normalized).toLocaleString("en-US",{minimumFractionDigits:GR_PRICE_DECIMALS,maximumFractionDigits:GR_PRICE_DECIMALS});
  };
  const fmtGridLevelInput = value => normalizeGrPrice(value) || "";
  const fmtSectionLevel = (_section,value) => fmtGridLevelInput(value);
  const normalizeGrStep = value => number(value) == null ? null : String(Math.max(0,Math.round(number(value))));
  const fmtStep = value => normalizeGrStep(value) || "";
  const fmtLot = value => number(value) == null ? "0.000" : Math.max(0,number(value)).toFixed(3);
  const fmtMoney = value => number(value) == null ? "-" : (number(value) > 0 ? "+" : number(value) < 0 ? "-" : "") + "$" + Math.abs(number(value)).toFixed(2);
  const moneyColor = value => number(value) == null || number(value) === 0 ? "#111" : number(value) > 0 ? "#047857" : "#f6465d";
  const sectionTitle = section => section === "entry" ? "Entry" : section === "protection" ? "Protection" : "Exit";
  const clientPrefix = section => section === "entry" ? "GR_ENTRY_" : section === "protection" ? "GR_PROT_PSL_" : "GR_EXIT_";
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
  const statusText = () => String(q("gradCalcStatus")?.textContent || "");
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
    if(box) return number(box.leverage);
    const settings = window.BT001SymbolTradingSettings && typeof window.BT001SymbolTradingSettings.getCached === "function"
      ? window.BT001SymbolTradingSettings.getCached(currentSymbol())
      : null;
    return number(settings && settings.leverage);
  };
  const ensureSymbolSettingsLoaded = () => {
    const helper = window.BT001SymbolTradingSettings;
    if(!helper || typeof helper.get !== "function") return;
    const symbol = currentSymbol();
    if(!symbol || state.lastSettingsRequestedSymbol === symbol) return;
    state.lastSettingsRequestedSymbol = symbol;
    Promise.resolve(helper.get(symbol))
      .catch(() => null)
      .finally(() => {
        state.lastSettingsRequestedSymbol = "";
        try{calculate();}catch(_e){}
      });
  };
  const rowMargin = row => {
    const lev=leverage(), level=number(row.level), lot=number(row.lot);
    if(lev && level && lot) return {value:level * lot / lev,unavailable:false};
    if(level && lot){
      ensureSymbolSettingsLoaded();
      return {value:null,unavailable:true};
    }
    return {value:null,unavailable:false};
  };
  const ORDERS_VISIBLE_KEY = "btc_futures_chart_v13_calculator_orders_visible";
  const ordersVisible = () => {
    try{
      const raw = localStorage.getItem(ORDERS_VISIBLE_KEY);
      return raw == null ? true : raw !== "0";
    }catch(_e){
      return true;
    }
  };
  const symbolSettings = () => {
    const helper = window.BT001SymbolTradingSettings;
    return helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
  };
  const priceTick = () => {
    const tick=number(symbolSettings()&&symbolSettings().tickSize);
    return Math.max(GR_PRICE_INCREMENT,tick&&tick>0?tick:GR_PRICE_INCREMENT);
  };
  const normalizeGrPrice = value => {
    const parsed=number(value);
    if(parsed==null)return null;
    const helper=window.BT001SymbolTradingSettings,settings=symbolSettings(),tick=priceTick();
    const filterNormalized=helper&&typeof helper.normalizePrice==="function"
      ? helper.normalizePrice(parsed,{...(settings||{}),tickSize:String(tick)})
      : (Math.round(parsed/tick)*tick).toFixed(GR_PRICE_DECIMALS);
    const filtered=number(filterNormalized);
    return filtered==null?null:filtered.toFixed(GR_PRICE_DECIMALS);
  };
  const normalizeLevelComparable = normalizeGrPrice;
  const serializeGrPrice = value => {
    const normalized=normalizeGrPrice(value);
    if(normalized==null||number(normalized)<=0||!/^(?:0|[1-9]\d*)$/.test(normalized))throw new Error("GR price is not a valid whole-number Binance price.");
    return normalized;
  };
  const normalizeQtyComparable = value => {
    const helper = window.BT001SymbolTradingSettings;
    const settings = helper && typeof helper.getCached === "function" ? helper.getCached(currentSymbol()) : null;
    return helper && typeof helper.normalizeQty === "function"
      ? helper.normalizeQty(value,settings)
      : (number(value) == null ? null : Number(number(value).toFixed(3)).toFixed(3));
  };
  const qtyStep = () => {
    const step = number(symbolSettings() && symbolSettings().stepSize);
    return step && step > 0 ? step : 0.001;
  };
  const qtyPrecision = () => {
    const stepText = String((symbolSettings() && symbolSettings().stepSize) || "");
    const decimal = stepText.includes(".") ? stepText.split(".")[1].replace(/0+$/,"") : "";
    return decimal.length || 3;
  };
  const normalizeQtyDown = value => {
    const qty = number(value);
    if(qty == null) return null;
    const step = qtyStep();
    const precision = qtyPrecision();
    const normalized = Math.floor((qty + 1e-12) / step) * step;
    return Number(normalized.toFixed(precision));
  };
  const qtyEqual = (a,b) => {
    const left = normalizeQtyComparable(a);
    const right = normalizeQtyComparable(b);
    return left != null && right != null && left === right;
  };
  const sameLevelValue = (a,b) => normalizeLevelComparable(a) != null && normalizeLevelComparable(a) === normalizeLevelComparable(b);
  const sameQtyValue = (a,b) => normalizeQtyComparable(a) != null && normalizeQtyComparable(a) === normalizeQtyComparable(b);
  const normalizedPriceValue = value => number(normalizeLevelComparable(value));
  function gridRows(section){
    return rows(section).filter(row=>row.status!=="executed");
  }
  function displayGridRows(section){
    return gridRows(section).concat(rows(section).filter(row=>row.status==="executed"));
  }
  function updatePriceStatus(row){
    if(row.binanceOrderId){
      const original=row.exchangeLevel!=null?row.exchangeLevel:row.stopPrice!=null?row.stopPrice:row.price!=null?row.price:row.level;
      row.status=Number.isInteger(number(original))&&sameLevelValue(row.level,original)&&sameQtyValue(row.lot,row.originalLot!=null?row.originalLot:row.lot)?"sent":"modified";
    }else row.status="local";
  }
  function applyGridLevels(section,list,levels){
    list.forEach((row,index)=>{const next=fmtSectionLevel(section,levels[index]);if(!sameLevelValue(row.level,next)){row.level=next;updatePriceStatus(row);}});
  }
  function normalizedOrderedLevels(levels,sign){
    const normalized=(levels||[]).map(normalizedPriceValue),tick=priceTick(),direction=sign<0?-1:1;
    if(normalized.some(level=>level==null||level<=0))return null;
    const tolerance=Math.max(1e-12,tick*1e-9,Math.max(...normalized.map(Math.abs))*Number.EPSILON*16);
    return normalized.slice(1).every((level,index)=>(level-normalized[index])*direction+tolerance>=tick)?normalized:null;
  }
  function syncGridGenerator(section,list=gridRows(section)){
    if(!list.length)return;
    const generator=state.generators[section];
    generator.start=normalizeGrPrice(list[0].level);generator.end=normalizeGrPrice(list[list.length-1].level);generator.count=list.length;
    generator.step=normalizeGrStep(list.length>1?Math.abs(number(generator.end)-number(generator.start))/(list.length-1):0);
    generator.lot=list.reduce((sum,row)=>sum+(number(row.lot)||0),0);generator.lastEdited="end";
    writeGenerator(section);
  }
  function commitGridPreview(section,message){
    renderSection(section);calculate();persistRows();redraw();
    if(message)setStatus(message);
  }
  function dragGridPivot(section,row,level){
    const list=gridRows(section),index=list.indexOf(row),snapped=normalizedPriceValue(level);
    if(index<0||snapped==null||snapped<=0)return false;
    if(index===0||index===list.length-1)return redistributeFromBoundaries(section,index===0?"start":"end",snapped);
    const result=domain().redistributeAroundPivot({levels:list.map(item=>number(item.level)),index,value:snapped,sign:generatorDirection(section),minSpacing:priceTick(),normalize:normalizedPriceValue});
    if(!result.valid)return false;
    if(state.drag)state.drag.pivotPrice=result.pivotValue;
    applyGridLevels(section,list,result.levels);syncGridGenerator(section,list);
    commitGridPreview(section,"GR "+sectionTitle(section)+" grid preview updated. Click Send to apply live changes.");return true;
  }
  function resetGridToLinearFromCurrent(section){
    const list=gridRows(section),generator=state.generators[section],start=normalizedPriceValue(generator.start),step=Math.abs(number(normalizeGrStep(generator.step))||0),sign=generatorDirection(section);
    if(!list.length||start==null||start<=0)return false;
    const levels=normalizedOrderedLevels(list.map((_row,index)=>start+sign*step*index),sign);
    if(!levels)return false;
    applyGridLevels(section,list,levels);syncGridGenerator(section,list);commitGridPreview(section,"GR "+sectionTitle(section)+" returned to a uniform linear grid.");return true;
  }
  function initializeImportedGrid(section){
    const sign=generatorDirection(section),active=rows(section).filter(row=>row.status!=="executed").sort((a,b)=>(number(a.level)-number(b.level))*sign),executed=rows(section).filter(row=>row.status==="executed");
    state.rows[section]=active.concat(executed);
    syncGridGenerator(section,active);
  }
  const totalMargin = () => validRows("entry").reduce((sum,row) => sum + (number(rowMargin(row).value) || 0),0);
  const clientIdOf = order => String(order && (order.clientOrderId || order.clientAlgoId || "") || "");
  const trackedOrderMeta = order => {
    if(!positionGroupTracker || !order) return null;
    try{return positionGroupTracker.lookupOrderMeta(order);}catch(_e){return null;}
  };
  const buildTrackedPosition = position => {
    if(!position) return null;
    const qty = Math.abs(number(position.qty) || 0);
    if(!(qty > 0)) return null;
    const side = String(position.side || state.direction).toUpperCase() === "SHORT" ? "SHORT" : "LONG";
    const ps = String(position.positionSide || "").toUpperCase();
    return {
      symbol:currentSymbol(),
      side,
      positionSide:ps === "LONG" || ps === "SHORT" ? ps : side,
      qty,
      entry:number(position.entry)
    };
  };
  const nextTrackedClientId = (roleCode,position) => {
    if(!positionGroupTracker) return "";
    const trackedPosition = buildTrackedPosition(position);
    if(!trackedPosition) return "";
    try{
      return positionGroupTracker.nextChildClientId({
        symbol:trackedPosition.symbol,
        position:trackedPosition,
        roleCode,
        owner:"GR"
      }) || "";
    }catch(_e){
      return "";
    }
  };
  const registerTrackedOrderMeta = meta => {
    if(!positionGroupTracker || !meta) return null;
    try{return positionGroupTracker.registerOrderMeta(meta);}catch(_e){return null;}
  };
  const ownedClientId = order => {
    const clientId = clientIdOf(order);
    if(/^(GR_ENTRY_|GR_PROT_|GR_EXIT_)/.test(clientId)) return true;
    const tracked = trackedOrderMeta(order);
    return !!(tracked && tracked.owner === "GR");
  };
  const orderSection = order => {
    const id=clientIdOf(order);
    if(id.startsWith("GR_ENTRY_")) return "entry";
    if(id.startsWith("GR_PROT_")) return "protection";
    if(id.startsWith("GR_EXIT_")) return "exit";
    const tracked = trackedOrderMeta(order);
    if(!tracked || tracked.owner !== "GR") return null;
    if(tracked.roleCode === "P") return "protection";
    if(tracked.roleCode === "X") return "exit";
    return null;
  };
  const signedStatus = order => String(order && (order.status || order.orderStatus || "NEW") || "NEW").toUpperCase();
  const isReduceOnly = order => {
    const reduceOnly = order && order.reduceOnly;
    return reduceOnly === true || String(reduceOnly).toLowerCase() === "true";
  };
  const isLiveOrder = order => {
    const status = signedStatus(order);
    return !status || status === "NEW" || status === "PENDING" || status === "ACCEPTED" || status === "PARTIALLY_FILLED" || status.includes("NEW");
  };
  const orderLevel = (section,order) => {
    const candidates=section==="protection"?[order&&order.stopPrice,order&&order.triggerPrice,order&&order.price]:[order&&order.price,order&&order.stopPrice,order&&order.triggerPrice];
    return candidates.map(number).find(value=>value!=null&&value>0)||null;
  };
  const classifyConditionalOrder = order => conditionalClassifier && typeof conditionalClassifier.classify === "function"
    ? conditionalClassifier.classify(order)
    : {
        kind:CONDITIONAL_KIND.UNKNOWN,
        sourceOrder:order || null,
        symbol:order && order.symbol != null ? order.symbol : null,
        side:order && order.side != null ? order.side : null,
        positionSide:order && order.positionSide != null ? order.positionSide : null,
        triggerPrice:number(order && (order.stopPrice ?? order.triggerPrice ?? order.price)),
        quantity:number(order && (order.origQty ?? order.quantity ?? order.qty)),
        closePosition:order && (order.closePosition === true || String(order.closePosition).toLowerCase() === "true"),
        clientOrderId:order && order.clientOrderId != null ? order.clientOrderId : null,
        clientAlgoId:order && order.clientAlgoId != null ? order.clientAlgoId : null,
        orderId:order && order.orderId != null ? order.orderId : null,
        algoId:order && order.algoId != null ? order.algoId : null,
        ownership:null,
        typeText:"",
        isLive:true
      };
  const classifyGrProtectionOrder = order => classifyConditionalOrder(order);
  const liveExitSide = position => position && position.side === "SHORT" ? "BUY" : "SELL";
  const positionSideMatches = (order,position) => {
    const ps = String(order && order.positionSide || "").toUpperCase();
    return !ps || ps === "BOTH" || ps === String(position && position.positionSide || "").toUpperCase() || ps === String(position && position.side || "").toUpperCase();
  };
  const protectionOrderMatchesLivePosition = order => {
    if(!order || !state.livePosition) return false;
    if(String(order.symbol || "").toUpperCase() !== currentSymbol()) return false;
    const classified = classifyGrProtectionOrder(order);
    if(classified.kind !== CONDITIONAL_KIND.PSL) return false;
    const expectedSide = state.livePosition.side === "SHORT" ? "BUY" : "SELL";
    if(String(order.side || "").toUpperCase() !== expectedSide) return false;
    const ps = String(order.positionSide || "").toUpperCase();
    return !ps || ps === "BOTH" || ps === state.livePosition.positionSide || ps === state.livePosition.side;
  };
  const createRowId = section => `gr_${section}_${Date.now()}_${++state.rowSeq}`;
  const rowLabel = (section,index) => section === "entry" ? `G Entry ${index + 1}` : section === "exit" ? `G Exit ${index + 1}` : `G PSL ${index + 1}`;

  function storedRecords(){
    try{return JSON.parse(localStorage.getItem(STORE_KEY)||"[]").filter(record=>record&&record.owner===OWNER);}catch(_e){return [];}
  }
  function loadExpressMode(){
    try{
      const raw = localStorage.getItem(EXPRESS_KEY);
      return raw == null ? true : raw === "1";
    }catch(_e){return true;}
  }
  function saveExpressMode(next){
    state.expressMode=!!next;
    const tgl=q("gradExpressToggle");
    if(tgl) tgl.checked=state.expressMode;
    try{localStorage.setItem(EXPRESS_KEY,state.expressMode?"1":"0");}catch(_e){}
  }
  function persistRows(){
    const records=sections.flatMap(section=>rows(section)).map(row=>({...row}));
    const otherSymbols=storedRecords().filter(record=>record.symbol!==currentSymbol());
    try{localStorage.setItem(STORE_KEY,JSON.stringify(otherSymbols.concat(records)));}catch(_e){}
  }
  function purgeStoredEntryRecords(){
    try{
      const records=JSON.parse(localStorage.getItem(STORE_KEY)||"[]");
      const retained=Array.isArray(records)?records.filter(record=>!(record&&record.section==="entry"&&record.symbol===currentSymbol())):[];
      localStorage.setItem(STORE_KEY,JSON.stringify(retained));
    }catch(_e){
      try{localStorage.removeItem(STORE_KEY);}catch(_e2){}
    }
  }
  function orderMetadata(section,data={}){
    return {
      owner:data.owner || OWNER,module:data.module || data.owner || OWNER,section,
      localRowId:data.localRowId || createRowId(section),
      clientOrderId:data.clientOrderId || null,
      binanceOrderId:data.binanceOrderId || null,
      symbol:data.symbol || currentSymbol(),
      side:data.side || null,
      orderType:data.orderType || null,
      role:data.role || (section==="protection"?"psl":section),
      exchangeLevel:data.exchangeLevel!=null?String(data.exchangeLevel):String(data.stopPrice!=null?data.stopPrice:data.price!=null?data.price:data.level),
      level:fmtSectionLevel(section,data.level),
      price:data.price!=null?fmtSectionLevel(section,data.price):(section==="protection"?null:fmtSectionLevel(section,data.level)),
      stopPrice:data.stopPrice!=null?fmtSectionLevel(section,data.stopPrice):(section==="protection"?fmtSectionLevel(section,data.level):null),
      lot:fmtLot(data.lot),
      originalLot:data.originalLot!=null?fmtLot(data.originalLot):null,
      status:data.status || "local"
    };
  }

  function rowModel(section,data={}){
    const row=orderMetadata(section,data);
    if(row.binanceOrderId&&row.status!=="executed")updatePriceStatus(row);
    return row;
  }
  function clearSection(section){
    state.rows[section]=[];
    state.loadedMode[section]=false;
    if(section!=="entry"){state.positionBasis[section]=null;state.stale[section]=false;}
    renderSection(section);
    calculate();
    persistRows();
    setStatus(sectionTitle(section) + " cleared locally.");
  }
  function flushEntryHistory(){
    const before=rows("entry").length;
    state.rows.entry=[];
    state.loadedMode.entry=false;
    state.generators.entry={start:"",end:"",step:"",lot:"0.000",count:"3",lastEdited:"end"};
    if(state.preflight&&state.preflight.section==="entry"){q("gradPreflight")?.classList.add("hidden");state.preflight=null;}
    writeGenerator("entry");
    purgeStoredEntryRecords();
    renderSection("entry");calculate();persistRows();
    setStatus("GR Entry Flush removed "+before+" local/internal record(s). Click Read to load currently open GR_ENTRY_ orders.");
  }
  function clearAll(){
    sections.forEach(section => {state.rows[section]=[];renderSection(section);});
    state.livePosition=null;
    state.positionBasis={protection:null,exit:null};
    state.stale={protection:false,exit:false};
    state.loadedMode={entry:false,protection:false,exit:false};
    calculate();
    persistRows();
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
    const reconcileMarkup = section==="protection"
      ? `<div class="grad-calc-reconcile-actions"><span>Reconcile</span><div><button id="gradProtectionReconcile" type="button" title="Reconcile Protection">RP</button></div></div>`
      : section==="exit"
        ? `<div class="grad-calc-reconcile-actions"><span>Reconcile</span><div><button id="gradExitReconcile" type="button" title="Reconcile Exits">RE</button></div></div>`
        : "";
    return `<div class="grad-calc-generator">
      ${section==="entry" ? `<label>Direction<select id="${prefix}Direction"><option>LONG</option><option>SHORT</option></select></label>` : ""}
      <label>Start level<input id="${prefix}Start" type="number" min="0" step="${priceTick()}"></label>
      <label>End level<input id="${prefix}End" type="number" min="0" step="${priceTick()}"></label>
      <label>Step<span class="grad-step-control"><input id="${prefix}Step" type="text" inputmode="numeric" data-step="1"><span class="grad-step-buttons"><button id="${prefix}StepUp" type="button">▲</button><button id="${prefix}StepDown" type="button">▼</button></span></span></label>
      <label>Total lot<input id="${prefix}Lot" type="number" min="0.001" step="0.001" value="0.000"></label>
      <label>Count<input id="${prefix}Count" type="number" min="1" step="1" value="${section==="protection" ? 2 : 3}"></label>
      ${reconcileMarkup}
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
    win.innerHTML=`<div class="grad-calc-head" id="gradCalcHead"><div class="grad-calc-title">GR position</div><div class="grad-calc-actions"><button id="gradCalcCollapse" type="button" title="Collapse">-</button><button id="gradCalcClose" type="button">x</button></div></div>
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
        <label class="grad-calc-express"><input id="gradExpressToggle" type="checkbox"> <span>Express Mode</span></label>
        <button class="grad-calc-clear-all" id="gradCalcClearAll" type="button">Clear All GR</button>
        <div class="grad-calc-status" id="gradCalcStatus"></div>
      </div>
      ${["n","e","s","w","ne","se","sw","nw"].map(edge=>`<div class="grad-resize-handle grad-resize-${edge}" data-edge="${edge}"></div>`).join("")}`;
    document.body.appendChild(win);
    return win;
  }
  function arrangeMetricButtons(){
    const gr=q("gradCalcMetric"),calc=q("calcModuleMetric"),assess=q("v29AssessMetric"),floating=q("mFloatPL")?.closest(".metric"),lot=q("mLotSize")?.closest(".metric"),account=q("mBalance")?.closest(".metric"),parent=account&&account.parentNode;
    if(!gr||!calc||!account||!lot||!floating||!parent)return;
    [gr,calc,account,lot,floating,assess].filter(Boolean).forEach(node=>parent.appendChild(node));
  }
  function ensureButton(){
    let wrap=q("gradCalcMetric");
    if(!wrap){
      wrap=document.createElement("div");
      wrap.id="gradCalcMetric";
      wrap.className="grad-calc-metric";
      wrap.innerHTML=`<button class="grad-calc-icon" id="gradCalcOpen" type="button" title="GR Commit" aria-label="Open GR"><svg viewBox="0 0 24 24" class="grad-levels-icon" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="6.5" r="1.7" fill="currentColor"/><circle cx="15.5" cy="12" r="1.7" fill="currentColor"/><circle cx="11" cy="17.5" r="1.7" fill="currentColor"/></svg></button>`;
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
    modal.className="calc-module-send-popup hidden";
    modal.innerHTML=`<div class="calc-module-send-popup-head" id="gradPreflightHead"><div class="calc-module-send-popup-title" id="gradPreflightTitle">Send Plan</div><button id="gradPreflightClose" type="button" title="Close">x</button></div>
      <div class="calc-module-send-summary" id="gradPreflightMessage"></div>
      <div class="calc-module-send-wrap"><table class="calc-module-send-table"><colgroup><col class="calc-col-action"><col class="calc-col-type"><col class="calc-col-side"><col class="calc-col-old-price"><col class="calc-col-new-price"><col class="calc-col-old-qty"><col class="calc-col-new-qty"><col class="calc-col-status"><col class="calc-col-response"></colgroup><thead><tr><th>Action</th><th>Type</th><th>Side</th><th>Old Price</th><th>New Price</th><th>Old Qty</th><th>New Qty</th><th>Status</th><th>Binance Response</th></tr></thead><tbody id="gradPreflightRows"></tbody></table></div>
      <div class="calc-module-send-popup-actions"><button id="gradPreflightConfirm" type="button">Confirm Send</button></div>`;
    document.body.appendChild(modal);
    q("gradPreflightClose").onclick=()=>{if(state.preflight&&state.preflight.executing){setStatus("Confirm Send is in progress.");return;}modal.classList.add("hidden");state.preflight=null;};
    q("gradPreflightConfirm").onclick=confirmPreflight;
    const head=q("gradPreflightHead");let drag=null;
    head.addEventListener("pointerdown",event=>{if(event.target.closest("button"))return;const rect=modal.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};try{head.setPointerCapture(event.pointerId);}catch(_e){}event.preventDefault();});
    head.addEventListener("pointermove",event=>{if(!drag)return;modal.style.left=Math.max(6,drag.left+event.clientX-drag.x)+"px";modal.style.top=Math.max(6,drag.top+event.clientY-drag.y)+"px";modal.style.right="auto";});
    head.addEventListener("pointerup",event=>{drag=null;try{head.releasePointerCapture(event.pointerId);}catch(_e){}});
    return modal;
  }
  function blinkSendButton(section){
    const btn=q(`grad${section}Send`);
    if(!btn) return;
    btn.classList.remove("bt001-send-success-blink");
    void btn.offsetWidth;
    btn.classList.add("bt001-send-success-blink");
    clearTimeout(btn.__bt001SendBlinkTimer);
    btn.__bt001SendBlinkTimer=setTimeout(()=>{
      btn.classList.remove("bt001-send-success-blink");
      btn.__bt001SendBlinkTimer=null;
    },900);
  }
  function showSendErrorWindow(section,message,list,context={}){
    const modal=ensurePreflight();
    const rowsList=Array.isArray(list)?list:[];
    const side=section==="entry"
      ? (state.direction==="LONG"?"BUY":"SELL")
      : (state.livePosition&&state.livePosition.side==="SHORT"?"BUY":"SELL");
    q("gradPreflightTitle").textContent="Send Results";
    q("gradPreflightMessage").textContent=message||"Send failed.";
    q("gradPreflightMessage").classList.add("is-stale");
    q("gradPreflightRows").innerHTML=`<tr class="calc-module-send-section"><td colspan="9">GR ${sectionTitle(section)}</td></tr>`+rowsList.map(row=>{
      const action=section==="exit"&&context.exitFullRecreate?"Recreate":row&&row.binanceOrderId?"Modify":"Create";
      const type=section==="protection"?"STOP_MARKET":"LIMIT";
      return `<tr class="is-error"><td>${action}</td><td>${type}</td><td>${side}</td><td>${row&&row.binanceOrderId?fmtSectionLevel(section,row.price||row.stopPrice||row.level):"-"}</td><td>${fmtSectionLevel(section,row&&row.level)}</td><td>${row&&row.binanceOrderId?fmtLot(row.originalLot||row.lot):"-"}</td><td>${fmtLot(row&&row.lot)}</td><td>Failed</td><td class="calc-module-send-response">${message||"Send failed."}</td></tr>`;
    }).join("");
    q("gradPreflightConfirm").parentElement.style.display="none";
    modal.classList.remove("hidden");
  }
  function closeReconcilePreview(){
    q("gradReconcilePreview")?.classList.add("hidden");
    state.reconcile=null;
  }
  function ensureReconcilePreview(){
    let modal=q("gradReconcilePreview");
    if(modal) return modal;
    modal=document.createElement("div");
    modal.id="gradReconcilePreview";
    modal.className="calc-module-send-popup hidden";
    modal.innerHTML=`<div class="calc-module-send-popup-head" id="gradReconcileHead"><div class="calc-module-send-popup-title" id="gradReconcileTitle">Reconcile Preview</div><button id="gradReconcileClose" type="button" title="Close">x</button></div>
      <div class="calc-module-send-summary" id="gradReconcileMessage"></div>
      <div class="calc-module-send-wrap"><table class="calc-module-send-table"><colgroup><col class="calc-col-action"><col class="calc-col-type"><col class="calc-col-side"><col class="calc-col-old-price"><col class="calc-col-new-price"><col class="calc-col-old-qty"><col class="calc-col-new-qty"><col class="calc-col-status"><col class="calc-col-response"></colgroup><thead><tr><th>Action</th><th>Type</th><th>Side</th><th>Level</th><th>New Level</th><th>Current Lot</th><th>New Lot</th><th>Status</th><th>Binance Response</th></tr></thead><tbody id="gradReconcileRows"></tbody></table></div>
      <div class="calc-module-send-popup-actions"><button id="gradReconcileConfirm" type="button">Confirm</button><button id="gradReconcileCancel" type="button">Cancel</button><button id="gradReconcileManualClose" type="button">Manual Edit / Close</button></div>`;
    document.body.appendChild(modal);
    q("gradReconcileClose").onclick=()=>{if(state.reconcile&&state.reconcile.executing){setStatus("Reconcile confirm is in progress.");return;}closeReconcilePreview();};
    q("gradReconcileCancel").onclick=()=>{if(state.reconcile&&state.reconcile.executing)return;closeReconcilePreview();};
    q("gradReconcileManualClose").onclick=()=>{if(state.reconcile&&state.reconcile.executing)return;closeReconcilePreview();};
    q("gradReconcileConfirm").onclick=confirmReconcilePreview;
    const head=q("gradReconcileHead");let drag=null;
    head.addEventListener("pointerdown",event=>{if(event.target.closest("button"))return;const rect=modal.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};try{head.setPointerCapture(event.pointerId);}catch(_e){}event.preventDefault();});
    head.addEventListener("pointermove",event=>{if(!drag)return;modal.style.left=Math.max(6,drag.left+event.clientX-drag.x)+"px";modal.style.top=Math.max(6,drag.top+event.clientY-drag.y)+"px";modal.style.right="auto";});
    head.addEventListener("pointerup",event=>{drag=null;try{head.releasePointerCapture(event.pointerId);}catch(_e){}});
    return modal;
  }

  function renderSection(section){
    const container=q(`grad${section}Rows`);
    if(!container) return;
    container.innerHTML="";
    const displayRows=displayGridRows(section);
    displayRows.forEach((model,index)=>{
      const node=document.createElement("div");
      node.className="grad-calc-row";
      Object.assign(node.dataset,{owner:OWNER,module:OWNER,section,localRowId:model.localRowId,status:model.status});
      if(model.binanceOrderId!=null) node.dataset.binanceOrderId=String(model.binanceOrderId);
      node.innerHTML=`<span class="grad-calc-index">${index+1}</span><input class="grad-calc-level" type="number" min="0" step="${priceTick()}" value="${fmtSectionLevel(section,model.level)}"><input class="grad-calc-lot" type="number" min="0.001" step="0.001" value="${fmtLot(model.lot)}"><span class="grad-calc-value">-</span><button class="grad-calc-remove" type="button">x</button>`;
      const level=node.querySelector(".grad-calc-level"), lot=node.querySelector(".grad-calc-lot");
      if(section==="entry"&&model.status==="executed"){node.classList.add("is-executed");level.disabled=true;lot.disabled=true;node.querySelector(".grad-calc-remove").disabled=true;}
      const sync=()=>{
        model.level=fmtSectionLevel(section,level.value);
        model.lot=fmtLot(lot.value);
        level.value=model.level;lot.value=model.lot;
        if(model.binanceOrderId){
          const originalLevel = model.stopPrice != null ? model.stopPrice : model.price != null ? model.price : model.level;
          const originalLot = model.originalLot != null ? model.originalLot : model.lot;
          model.status=(sameLevelValue(model.level,originalLevel) && sameQtyValue(model.lot,originalLot)) ? "sent" : "modified";
        }else{
          model.status="local";
        }
        node.dataset.status=model.status;
        syncGeneratorFromRows(section);
        calculate();
        persistRows();
      };
      level.oninput=sync;lot.oninput=sync;level.onchange=sync;lot.onchange=sync;
      node.querySelector(".grad-calc-remove").onclick=()=>{state.rows[section]=rows(section).filter(row=>row.localRowId!==model.localRowId);renderSection(section);syncGeneratorFromRows(section);calculate();persistRows();};
      container.appendChild(node);
    });
  }
  function updateRowValues(section){
    const total=validRows(section).reduce((sum,row)=>sum+(number(row.lot)||0),0);
    const exceedsPosition=section!=="entry"&&state.livePosition&&total>state.livePosition.qty+1e-9;
    const displayRows=displayGridRows(section);
    q(`grad${section}Rows`)?.querySelectorAll(".grad-calc-row").forEach((node,index)=>{
      const row=displayRows[index];
      const value=section==="entry" ? rowMargin(row) : rowPl(section,row);
      const valueNode=node.querySelector(".grad-calc-value");
      if(section==="entry" && value && value.unavailable){
        valueNode.textContent="Leverage unavailable";
        valueNode.style.color="#111";
      }else{
        const displayValue = value && typeof value === "object" ? value.value : value;
        valueNode.textContent=fmtMoney(displayValue);
        valueNode.style.color=section==="entry" ? "#111" : moneyColor(displayValue);
      }
      const market=currentPrice(), level=number(row.level);
      node.classList.toggle("is-invalid",section==="entry" && market!=null && level!=null && (state.direction==="LONG" ? level>=market : level<=market));
      node.classList.toggle("is-invalid-lot",!!exceedsPosition);
    });
  }
  function calculate(){
    sections.forEach(updateRowValues);
    const entry=weighted("entry"), protection=weighted("protection"), exit=weighted("exit");
    const risk=totalPl("protection"), projected=totalPl("exit");
    const entryMargins = validRows("entry").map(rowMargin);
    const entryMarginUnavailable = entryMargins.some(item => item && item.unavailable);
    q("gradentryAverage").textContent=fmtPrice(entry.average);q("gradentryTotal").textContent=entryMarginUnavailable&&totalMargin()===0?"Leverage unavailable":fmtMoney(totalMargin());
    q("gradprotectionAverage").textContent=fmtPrice(protection.average);q("gradprotectionTotal").textContent=fmtMoney(risk);q("gradprotectionTotal").style.color=moneyColor(risk);
    q("gradexitAverage").textContent=fmtPrice(exit.average);q("gradexitTotal").textContent=fmtMoney(projected);q("gradexitTotal").style.color=moneyColor(projected);
    q("gradSummaryEntryLots").textContent=fmtLot(entry.quantity);q("gradSummaryEntryAvg").textContent=fmtPrice(entry.average);
    q("gradSummaryRisk").textContent=fmtMoney(risk);q("gradSummaryRisk").style.color=moneyColor(risk);
    q("gradSummaryPl").textContent=fmtMoney(projected);q("gradSummaryPl").style.color=moneyColor(projected);
    ["protection","exit"].forEach(section=>q(`gradPanel${section}`)?.classList.toggle("is-stale",state.stale[section]));
    const protectionTotal = validRows("protection").reduce((sum,row)=>sum + (number(row.lot) || 0),0);
    const exceedsProtection = !!(state.livePosition && protectionTotal > state.livePosition.qty + 1e-9);
    const warning = "Protection total lot cannot exceed live open-position size.";
    if(exceedsProtection) setStatus(warning);
    else if(statusText() === warning) setStatus("");
    redraw();
  }
  function liveOrdersSnapshotBySymbol(snapshot){
    const sym = currentSymbol();
    return {
      normal:(snapshot && Array.isArray(snapshot.normal) ? snapshot.normal : []).filter(order => String(order && order.symbol || "").toUpperCase() === sym).filter(isLiveOrder),
      algo:(snapshot && Array.isArray(snapshot.algo) ? snapshot.algo : []).filter(order => String(order && order.symbol || "").toUpperCase() === sym).filter(isLiveOrder)
    };
  }
  async function openOrdersSnapshot(){
    if(typeof hasKeys!=="function" || !hasKeys()) throw new Error("API keys are required.");
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const normal=await signedGet(OPEN_ORDERS_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    const algo=await signedGet(OPEN_ALGO_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    return liveOrdersSnapshotBySymbol({normal:Array.isArray(normal)?normal:[],algo:Array.isArray(algo)?algo:[]});
  }
  function reconcileOrderKey(item){
    if(!item) return "";
    if(item.isAlgo){
      if(item.order && item.order.algoId != null) return "algo:" + String(item.order.algoId);
      if(item.order && item.order.clientAlgoId) return "calgo:" + String(item.order.clientAlgoId);
    }
    if(item.order && item.order.orderId != null) return "id:" + String(item.order.orderId);
    if(item.order && item.order.clientOrderId) return "cid:" + String(item.order.clientOrderId);
    return "";
  }
  function protectionReconcileItems(snapshot,position){
    state.livePosition = position;
    return [].concat(snapshot.algo || [],snapshot.normal || [])
      .filter(order => protectionOrderMatchesLivePosition(order))
      .map(order => {
        const classified = classifyGrProtectionOrder(order);
        return {
          key:reconcileOrderKey({order,isAlgo:(snapshot.algo || []).includes(order)}),
          isAlgo:(snapshot.algo || []).includes(order),
          order,
          type:String(order.type || order.orderType || order.algoType || "STOP_MARKET").toUpperCase(),
          side:liveExitSide(position),
          positionSide:String(order.positionSide || position.positionSide || "").toUpperCase(),
          level:number(classified.triggerPrice),
          qty:normalizeQtyDown(classified.quantity),
          workingType:String(order.workingType || "CONTRACT_PRICE"),
          price:number(order.price),
          timeInForce:String(order.timeInForce || "GTC").toUpperCase()
        };
      })
      .filter(item => item.level != null && item.qty != null && item.qty > 0);
  }
  function exitReconcileItems(snapshot,position){
    const side = liveExitSide(position);
    return (snapshot.normal || [])
      .filter(order => String(order.type || order.orderType || "").toUpperCase() === "LIMIT")
      .filter(order => String(order.side || "").toUpperCase() === side)
      .filter(order => positionSideMatches(order,position))
      .map(order => ({
        key:reconcileOrderKey({order,isAlgo:false}),
        isAlgo:false,
        order,
        type:"LIMIT",
        side,
        positionSide:String(order.positionSide || position.positionSide || "").toUpperCase(),
        level:number(order.price),
        qty:normalizeQtyDown(order.origQty || order.quantity || order.qty),
        reduceOnly:isReduceOnly(order),
        timeInForce:String(order.timeInForce || "GTC").toUpperCase()
      }))
      .filter(item => item.level != null && item.qty != null && item.qty > 0);
  }
  function sortReconcileWorstFirst(kind,items,position){
    return items.slice().sort((a,b) => {
      const left = number(normalizeLevelComparable(a.level)) ?? number(a.level) ?? 0;
      const right = number(normalizeLevelComparable(b.level)) ?? number(b.level) ?? 0;
      if(kind === "RP") return position.side === "SHORT" ? right - left : left - right;
      return position.side === "SHORT" ? left - right : right - left;
    });
  }
  function buildReconcilePlan(kind,position,snapshot){
    if(!position) throw new Error("No valid open position.");
    const targetQty = normalizeQtyDown(position.qty);
    const items = kind === "RP" ? protectionReconcileItems(snapshot,position) : exitReconcileItems(snapshot,position);
    const currentTotal = normalizeQtyDown(items.reduce((sum,item) => sum + (number(item.qty) || 0),0)) || 0;
    if(targetQty == null) throw new Error("Live open-position lot is unavailable.");
    if(currentTotal <= targetQty + 1e-9){
      return {kind,position,items,actions:items.map(item=>({item,action:"Keep",newQty:item.qty})),currentTotal,targetQty,excess:0,finalTotal:currentTotal,already:true};
    }
    let remaining = normalizeQtyDown(currentTotal - targetQty) || 0;
    const actionMap = new Map();
    sortReconcileWorstFirst(kind,items,position).forEach(item => {
      let action = "Keep";
      let newQty = item.qty;
      if(remaining > 1e-9){
        if(item.qty <= remaining + 1e-9){
          action = "Cancel";
          newQty = 0;
          remaining = normalizeQtyDown(Math.max(0,remaining - item.qty)) || 0;
        }else{
          const reducedQty = normalizeQtyDown(Math.max(0,item.qty - remaining));
          if(reducedQty == null || reducedQty <= 0){
            action = "Cancel";
            newQty = 0;
            remaining = normalizeQtyDown(Math.max(0,remaining - item.qty)) || 0;
          }else{
            action = "Reduce";
            newQty = reducedQty;
            remaining = normalizeQtyDown(Math.max(0,remaining - (item.qty - reducedQty))) || 0;
          }
        }
      }
      actionMap.set(item.key,{item,action,newQty});
    });
    const actions = items.map(item => actionMap.get(item.key) || {item,action:"Keep",newQty:item.qty});
    const finalTotal = normalizeQtyDown(actions.reduce((sum,entry)=>sum + (entry.action === "Cancel" ? 0 : number(entry.newQty) || 0),0)) || 0;
    if(!qtyEqual(finalTotal,targetQty)) throw new Error("Reconcile could not reach the live open-position lot after stepSize normalization.");
    return {kind,position,items,actions,currentTotal,targetQty,excess:normalizeQtyDown(currentTotal - targetQty) || 0,finalTotal,already:false};
  }
  function renderReconcilePreview(plan){
    const section=plan.kind==="RP"?"protection":"exit";
    state.reconcile = {...plan,executing:false,fingerprint:positionFingerprint(plan.position)};
    ensureReconcilePreview().classList.remove("hidden");
    q("gradReconcileTitle").textContent = plan.kind === "RP" ? "Reconcile Protection Preview" : "Reconcile Exits Preview";
    q("gradReconcileConfirm").textContent = plan.kind === "RP" ? "Confirm RP" : "Confirm RE";
    q("gradReconcileConfirm").disabled = !!plan.already;
    q("gradReconcileConfirm").parentElement.style.display = "flex";
    q("gradReconcileMessage").textContent = plan.already
      ? (plan.kind === "RP" ? "Protection already reconciled." : "Exits already reconciled.")
      : "Live lot: " + fmtLot(plan.targetQty) + " | Current total: " + fmtLot(plan.currentTotal) + " | Excess: " + fmtLot(plan.excess) + " | Final total: " + fmtLot(plan.finalTotal);
    q("gradReconcileMessage").classList.toggle("is-stale",!!plan.already);
    q("gradReconcileRows").innerHTML = `<tr class="calc-module-send-section"><td colspan="9">${plan.kind === "RP" ? "GR Reconcile Protection" : "GR Reconcile Exits"}</td></tr>` + plan.actions.map(entry => `<tr class="${entry.action !== "Keep" ? "is-writable" : ""}"><td>${entry.action}</td><td>${entry.item.type}</td><td>${entry.item.side}</td><td>${fmtSectionLevel(section,entry.item.level)}</td><td>${fmtSectionLevel(section,entry.item.level)}</td><td>${fmtLot(entry.item.qty)}</td><td>${fmtLot(entry.action === "Cancel" ? 0 : entry.newQty)}</td><td>${entry.action === "Keep" ? "Ready" : "Planned"}</td><td class="calc-module-send-response">${entry.item.key || entry.item.type}</td></tr>`).join("");
  }
  async function openReconcile(kind){
    try{
      const position = await livePosition();
      state.livePosition = position;
      if(!position) throw new Error((kind === "RP" ? "Protection" : "Exits") + " reconcile blocked: no valid open position.");
      const snapshot = await openOrdersSnapshot();
      const plan = buildReconcilePlan(kind,position,snapshot);
      renderReconcilePreview(plan);
      setStatus(plan.already ? (kind === "RP" ? "Protection already reconciled." : "Exits already reconciled.") : (kind === "RP" ? "Protection reconcile preview ready." : "Exit reconcile preview ready."));
    }catch(error){
      setStatus(error.message || String(error));
    }
  }
  function generatorDirection(section){
    const direction=positionDirection();
    if(section==="entry") return state.direction==="LONG" ? -1 : 1;
    if(section==="protection") return direction==="LONG" ? -1 : 1;
    return direction==="LONG" ? 1 : -1;
  }
  function readGenerator(section){
    const prefix=`grad${section}`, generator=state.generators[section];
    const start=q(prefix+"Start").value,end=q(prefix+"End").value,step=q(prefix+"Step").value;
    generator.start=normalizeGrPrice(start)??start;generator.end=normalizeGrPrice(end)??end;generator.step=normalizeGrStep(step)??step;generator.lot=q(prefix+"Lot").value;generator.count=q(prefix+"Count").value;
    if(section==="entry") state.direction=q(prefix+"Direction").value==="SHORT" ? "SHORT" : "LONG";
    return generator;
  }
  function writeGenerator(section){
    const prefix=`grad${section}`, generator=state.generators[section];
    q(prefix+"Start").value=fmtSectionLevel(section,generator.start);q(prefix+"End").value=fmtSectionLevel(section,generator.end);q(prefix+"Step").value=fmtStep(generator.step);q(prefix+"Lot").value=fmtLot(generator.lot);q(prefix+"Count").value=String(Math.max(1,Math.floor(number(generator.count)||1)));
  }
  function generate(section){
    const generator=readGenerator(section), start=normalizedPriceValue(generator.start),totalLot=Math.max(0,number(generator.lot)||0),maxCount=section==="exit"?Math.floor(totalLot/.001+1e-9):Infinity;
    let count=Math.max(1,Math.floor(number(generator.count)||1));
    if(section==="exit"&&maxCount<1){setStatus("Exit generation blocked: total lot must be at least 0.001.");return;}
    if(section==="exit"&&count>maxCount){count=maxCount;generator.count=count;q("gradexitCount").value=String(count);setStatus("Exit count limited to "+count+" for total lot "+fmtLot(totalLot)+".");}
    const sign=generatorDirection(section);
    if(start==null || start<=0) return;
    let step=Math.abs(number(normalizeGrStep(generator.step))||0);
    const end=normalizedPriceValue(generator.end);
    if(generator.lastEdited!=="step" && end!=null && count>1) step=Math.abs(end-start)/(count-1);
    const levels=normalizedOrderedLevels(Array.from({length:count},(_,index)=>start+sign*step*index),sign);
    if(!levels){setStatus(sectionTitle(section)+" grid cannot preserve one price increment between levels.");return;}
    generator.step=normalizeGrStep(step);generator.end=normalizeGrPrice(levels[levels.length-1]);generator.count=count;
    const lots=domain().distributeLots(totalLot,count);
    state.rows[section]=levels.map((level,index)=>rowModel(section,{level,lot:lots[index]}));
    state.loadedMode[section]=false;
    syncGridGenerator(section,gridRows(section));
    renderSection(section);calculate();persistRows();
  }
  function syncGeneratorFromRows(section){
    syncGridGenerator(section);
  }
  function redistributeFromBoundaries(section,boundary,level){
    const list=gridRows(section),generator=state.generators[section],start=boundary==="start"?normalizedPriceValue(level):normalizedPriceValue(generator.start),end=boundary==="end"?normalizedPriceValue(level):normalizedPriceValue(generator.end);
    if(list.length<2||start==null||end==null||start<=0||end<=0)return false;
    const sign=generatorDirection(section);
    if((end-start)*sign<0)return false;
    const step=Math.abs(end-start)/(list.length-1),levels=normalizedOrderedLevels(list.map((_row,index)=>start+sign*step*index),sign);
    if(!levels)return false;
    applyGridLevels(section,list,levels);
    generator.start=normalizeGrPrice(start);generator.end=normalizeGrPrice(end);generator.step=normalizeGrStep(step);generator.count=list.length;generator.lastEdited="end";
    writeGenerator(section);renderSection(section);calculate();persistRows();redraw();
    return true;
  }
  function redistributeLotsOnly(section,total){
    const list=gridRows(section),lots=domain().distributeLots(total,list.length);
    list.forEach((row,index)=>{row.lot=fmtLot(lots[index]);row.status=row.binanceOrderId?"modified":"local";});
    renderSection(section);calculate();persistRows();
  }

  async function signedWrite(url,method,params){
    if(typeof hasKeys!=="function" || !hasKeys()) throw new Error("API keys are required.");
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const query=new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now()+offset)}).toString(),signature=await hmac(secret,query);
    const response=await API.fetch(url+"?"+query+"&signature="+signature,{method,cache:"no-store",headers:{"X-MBX-APIKEY":key}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data&&data.msg?data.msg:"HTTP "+response.status);
    try{
      const cache=window.BINANCE_OPEN_ORDERS_CACHE;
      if(cache&&typeof cache.refresh==="function") cache.refresh({reason:"gr-order-write",maxAgeMs:0}).catch(()=>{});
    }catch(_e){}
    return data;
  }
  function sharedLivePosition(){
    const list = typeof openPositionBoxes !== "undefined" && Array.isArray(openPositionBoxes) ? openPositionBoxes : [];
    const boxes = list.filter(box => box && (!box.symbol || box.symbol === currentSymbol()) && Math.abs(number(box.qty) || 0) > 0);
    if(!boxes.length) return null;
    const first=boxes[0],qty=boxes.reduce((sum,box)=>sum+Math.abs(number(box.qty)||0),0);
    const weightedEntry=qty ? boxes.reduce((sum,box)=>sum+Math.abs(number(box.qty)||0)*(number(box.entryPrice ?? box.price)||0),0)/qty : null;
    const side=String(first.side || first.positionSide || "").toUpperCase()==="SHORT" ? "SHORT" : "LONG";
    return {side,qty,entry:weightedEntry,current:currentPrice(),positionSide:String(first.positionSide||"BOTH").toUpperCase()};
  }
  async function livePosition({preferShared=false}={}){
    if(preferShared) return sharedLivePosition();
    if(typeof hasKeys!=="function" || !hasKeys()) return null;
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const list=typeof getPositions==="function" ? await getPositions(key,secret,offset) : [];
    const found=(list||[]).find(row=>row&&row.symbol===currentSymbol()&&Math.abs(number(row.positionAmt)||0)>0);
    if(!found) return null;
    const position = {side:number(found.positionAmt)<0||String(found.positionSide).toUpperCase()==="SHORT"?"SHORT":"LONG",qty:Math.abs(number(found.positionAmt)),entry:number(found.entryPrice),current:currentPrice(),positionSide:String(found.positionSide||"BOTH").toUpperCase()};
    if(positionGroupTracker){
      try{ positionGroupTracker.syncPosition(currentSymbol(),position); }catch(_e){}
    }
    return position;
  }
  const positionFingerprint = position => position ? [currentSymbol(),position.side,fmtLot(position.qty),position.positionSide].join("|") : "none";
  function setPositionBasis(section,position){
    state.positionBasis[section]=positionFingerprint(position);
    state.stale[section]=false;
  }
  async function refreshPositionAwareness(section,{quiet=false,preferShared=false}={}){
    if(section==="entry")return null;
    const current=await livePosition({preferShared});
    state.livePosition=current;
    const basis=state.positionBasis[section];
    state.stale[section]=!!basis&&positionFingerprint(current)!==basis;
    if(state.stale[section]&&!quiet)setStatus(sectionTitle(section)+" is stale — open position changed. Read again before Send.");
    calculate();
    return current;
  }
  async function sectionOrders(section){
    if(typeof hasKeys!=="function" || !hasKeys()) throw new Error("API keys are required.");
    const key=apiKeyEl.value.trim(),secret=apiSecretEl.value.trim(),offset=typeof timeOffset==="function" ? await timeOffset() : 0;
    const normal=await signedGet(OPEN_ORDERS_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    const algo=await signedGet(OPEN_ALGO_URL,{symbol:currentSymbol()},key,secret,offset).catch(()=>[]);
    return [].concat(Array.isArray(normal)?normal:[],Array.isArray(algo)?algo:[]).filter(order=>{
      if(section==="protection"){
        return isLiveOrder(order) && protectionOrderMatchesLivePosition(order);
      }
      return ownedClientId(order)&&orderSection(order)===section;
    });
  }
  function fromBinanceOrder(section,order){
    const status=String(order.status||order.orderStatus||"").toUpperCase()==="FILLED"?"executed":"sent";
    const classified = section === "protection" ? classifyGrProtectionOrder(order) : null;
    const lot=order.executedQty&&status==="executed"?order.executedQty:(classified && classified.quantity != null ? classified.quantity : order.origQty||order.quantity||order.qty);
    return rowModel(section,{localRowId:`gr_owned_${order.orderId||order.algoId||clientIdOf(order)}`,binanceOrderId:order.orderId||order.algoId||null,clientOrderId:clientIdOf(order)||null,status,symbol:order.symbol||currentSymbol(),side:order.side||null,orderType:order.type||order.orderType||null,role:section==="protection"?"psl":section,level:orderLevel(section,order),price:number(order.price)>0?order.price:null,stopPrice:number(order.stopPrice)>0?order.stopPrice:number(order.triggerPrice)>0?order.triggerPrice:null,lot,originalLot:lot});
  }
  function importOwned(section,ordersList){
    const imported=ordersList.map(order=>fromBinanceOrder(section,order));
    state.rows[section]=imported;
    state.loadedMode[section]=true;
    if(section==="entry"){
      const side=String(imported.find(row=>row.side)?.side||"").toUpperCase();
      if(side==="BUY"||side==="SELL"){state.direction=side==="SELL"?"SHORT":"LONG";const direction=q("gradentryDirection");if(direction)direction.value=state.direction;}
    }
    initializeImportedGrid(section);
    renderSection(section);calculate();
    persistRows();
  }
  async function readSection(section){
    setStatus("Reading GR "+sectionTitle(section)+"...");
    try{
      state.rows[section]=[];
      state.loadedMode[section]=false;
      renderSection(section);calculate();redraw();
      if(section==="entry"){
        importOwned(section,await sectionOrders(section));
      }else{
        state.livePosition=await livePosition();
        if(!state.livePosition) throw new Error(sectionTitle(section)+" Read blocked: no valid open position.");
        setPositionBasis(section,state.livePosition);
        state.generators[section].lot=state.livePosition.qty;
        q(`grad${section}Lot`).value=fmtLot(state.livePosition.qty);
        importOwned(section,await sectionOrders(section));
      }
      setStatus(sectionTitle(section)+" Read complete.");
    }catch(error){setStatus(error.message||String(error));}
  }
  function normalizeSectionPriceState(section){
    rows(section).forEach(row=>{
      const level=normalizeGrPrice(row.level);
      if(level!=null){row.level=level;updatePriceStatus(row);}
      if(row.price!=null)row.price=normalizeGrPrice(row.price);
      if(row.stopPrice!=null)row.stopPrice=normalizeGrPrice(row.stopPrice);
    });
    const generator=state.generators[section];
    if(generator){
      generator.start=normalizeGrPrice(generator.start)??generator.start;
      generator.end=normalizeGrPrice(generator.end)??generator.end;
      generator.step=normalizeGrStep(generator.step)??generator.step;
    }
  }
  function validateSection(section){
    normalizeSectionPriceState(section);
    const allRows=rows(section).filter(row=>row.status!=="executed"),list=validRows(section).filter(row=>row.status!=="executed"),errors=[];
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
      const level=number(row.level),lot=number(row.lot),normalized=normalizeGrPrice(row.level);
      if(level==null||level<=0||normalized==null||String(row.level)!==normalized)errors.push("Price level must be a canonical whole-number symbol price.");
      if(lot==null||lot<.001)errors.push("Lot below Binance minimum.");
      else if(Math.abs(lot*1000-Math.round(lot*1000))>1e-7)errors.push("Lot must follow the 0.001 increment.");
    });
    const ids=allRows.map(clientIdOf).filter(Boolean);
    if(new Set(ids).size!==ids.length)errors.push("Duplicate GR clientOrderIds detected.");
    const ordered=gridRows(section),sign=generatorDirection(section),tick=priceTick();
    const orderTolerance=Math.max(1e-12,tick*1e-9,...ordered.map(row=>Math.abs(number(row.level)||0)*Number.EPSILON*16));
    ordered.slice(1).forEach((row,index)=>{if((number(row.level)-number(ordered[index].level))*sign+orderTolerance<tick)errors.push(sectionTitle(section)+" levels must remain ordered with at least one tick between prices.");});
    if(ordered.length&&(!sameLevelValue(ordered[0].level,state.generators[section].start)||!sameLevelValue(ordered[ordered.length-1].level,state.generators[section].end)))errors.push(sectionTitle(section)+" Start and End do not match the displayed grid endpoints.");
    const prices=allRows.map(row=>normalizeLevelComparable(row.level)).filter(value=>value!=null);
    if(new Set(prices).size!==prices.length)errors.push("Duplicate GR price levels detected.");
    return [...new Set(errors)];
  }
  function actionableRows(section){
    const list=validRows(section).filter(row=>row.status==="local"||row.status==="modified");
    return list;
  }
  function exitQuantityChanged(liveOrders){
    const current=validRows("exit"),live=(liveOrders||[]).filter(order=>orderSection(order)==="exit");
    if(!live.length)return false;
    if(current.length!==live.length)return true;
    const liveById=new Map(live.map(order=>[clientIdOf(order),fmtLot(order.origQty||order.quantity||order.qty)]));
    return current.some(row=>!row.clientOrderId||!liveById.has(row.clientOrderId)||liveById.get(row.clientOrderId)!==fmtLot(row.lot));
  }
  async function openPreflight(section){
    try{if(section!=="entry")await refreshPositionAwareness(section);}catch(_e){state.livePosition=null;state.stale[section]=true;}
    let liveExitOrders=[],exitFullRecreate=false;
    if(section==="exit"){try{liveExitOrders=await sectionOrders("exit");exitFullRecreate=exitQuantityChanged(liveExitOrders);}catch(error){setStatus(error.message||String(error));}}
    const errors=validateSection(section),list=section==="exit"&&exitFullRecreate?validRows("exit"):actionableRows(section);
    if(!list.length)errors.push("No local or modified GR rows to send.");
    state.preflight={section,rows:list.slice(),valid:errors.length===0,exitFullRecreate,liveExitOrders};
    ensurePreflight().classList.remove("hidden");
    q("gradPreflightTitle").textContent="Send Plan";
    q("gradPreflightMessage").textContent=errors.length?errors.join(" | "):"CBS: OFF | Stops: ON | Writable: "+list.length+" | Blocked: 0 | Ignored: 0 | Skipped: 0";
    q("gradPreflightMessage").classList.toggle("is-stale",errors.length>0);
    const side=section==="entry"?(state.direction==="LONG"?"BUY":"SELL"):(state.livePosition&&state.livePosition.side==="SHORT"?"BUY":"SELL");
    q("gradPreflightRows").innerHTML=`<tr class="calc-module-send-section"><td colspan="9">GR ${sectionTitle(section)}</td></tr>`+list.map(row=>{
      const action=section==="exit"&&exitFullRecreate?"Recreate":row.binanceOrderId?"Modify":"Create",type=section==="protection"?"STOP_MARKET":"LIMIT";
      return `<tr class="is-writable"><td>${action}</td><td>${type}</td><td>${side}</td><td>${row.binanceOrderId?fmtSectionLevel(section,row.price||row.stopPrice||row.level):"-"}</td><td>${fmtSectionLevel(section,row.level)}</td><td>${row.binanceOrderId?fmtLot(row.originalLot||row.lot):"-"}</td><td>${fmtLot(row.lot)}</td><td>Ready</td><td class="calc-module-send-response">${sectionTitle(section)} order</td></tr>`;
    }).join("");
    q("gradPreflightConfirm").parentElement.style.display=state.preflight.valid?"flex":"none";
    q("gradPreflightConfirm").disabled=!state.preflight.valid;
  }
  function freshClientId(prefix,row,section){
    if(section === "protection" || section === "exit"){
      const trackedId = nextTrackedClientId(section === "protection" ? "P" : "X",state.livePosition);
      if(trackedId) return trackedId;
    }
    const suffix=Date.now().toString(36)+"_"+(++state.clientSeq).toString(36)+"_"+Math.random().toString(36).slice(2,7);
    const room=Math.max(1,36-prefix.length-suffix.length-2),rowPart=String(row.localRowId||"row").replace(/[^a-zA-Z0-9]/g,"").slice(-room);
    return prefix+rowPart+"_"+suffix;
  }
  async function executeSection(section,list,context={}){
    if(section==="exit"&&context.exitFullRecreate){
      for(const order of context.liveExitOrders||[]){
        if(order&&order.orderId!=null)await signedWrite(ORDER_URL,"DELETE",{symbol:currentSymbol(),orderId:String(order.orderId)});
      }
      list.forEach(row=>{row.binanceOrderId=null;row.clientOrderId=null;row.status="local";});
    }
    for(let index=0;index<list.length;index++){
      const row=list[index],clientId=freshClientId(clientPrefix(section),row,section);
      row.level=serializeGrPrice(row.level);
      let sentSide=null,sentType=null;
      if(section==="protection"){
        const side=state.livePosition.side==="SHORT"?"BUY":"SELL";
        sentSide=side;sentType="STOP_MARKET";
        if(row.status==="modified"&&row.binanceOrderId!=null)await signedWrite(ALGO_URL,"DELETE",{symbol:currentSymbol(),algoId:String(row.binanceOrderId)});
        const payload={symbol:currentSymbol(),side,algoType:"CONDITIONAL",type:"STOP_MARKET",quantity:String(number(row.lot)),triggerPrice:serializeGrPrice(row.level),workingType:"CONTRACT_PRICE",clientAlgoId:clientId};
        if(["LONG","SHORT"].includes(state.livePosition.positionSide))payload.positionSide=state.livePosition.positionSide;else payload.reduceOnly="true";
        delete payload.closePosition;
        const response=await signedWrite(ALGO_URL,"POST",payload);row.binanceOrderId=response.algoId||response.orderId||null;row.clientOrderId=response.clientAlgoId||clientId;
        registerTrackedOrderMeta({
          symbol:currentSymbol(),
          side,
          positionSide:payload.positionSide || "",
          positionGroupId:positionGroupTracker ? positionGroupTracker.positionGroupIdFor({clientAlgoId:row.clientOrderId}) : null,
          roleCode:"P",
          roleType:"PSL",
          owner:"GR",
          algoId:row.binanceOrderId,
          orderId:response && response.orderId != null ? response.orderId : null,
          clientAlgoId:row.clientOrderId
        });
      }else{
        const direction=section==="entry"?state.direction:state.livePosition.side,side=direction==="LONG"?(section==="entry"?"BUY":"SELL"):(section==="entry"?"SELL":"BUY");
        sentSide=side;sentType="LIMIT";
        const payload={symbol:currentSymbol(),side,type:"LIMIT",timeInForce:"GTC",quantity:String(number(row.lot)),price:serializeGrPrice(row.level),newClientOrderId:clientId};
        if(section==="exit"){if(["LONG","SHORT"].includes(state.livePosition.positionSide))payload.positionSide=state.livePosition.positionSide;else payload.reduceOnly="true";}
        let response;
        if(row.status==="modified"&&row.binanceOrderId!=null){delete payload.newClientOrderId;payload.orderId=String(row.binanceOrderId);response=await signedWrite(ORDER_URL,"PUT",payload);}else response=await signedWrite(ORDER_URL,"POST",payload);
        row.binanceOrderId=response.orderId||null;row.clientOrderId=response.clientOrderId||row.clientOrderId||clientId;
        if(section==="exit"){
          registerTrackedOrderMeta({
            symbol:currentSymbol(),
            side,
            positionSide:payload.positionSide || "",
            positionGroupId:positionGroupTracker ? positionGroupTracker.positionGroupIdFor({clientOrderId:row.clientOrderId}) : null,
            roleCode:"X",
            roleType:"EXIT",
            owner:"GR",
            orderId:row.binanceOrderId,
            clientOrderId:row.clientOrderId
          });
        }
      }
      Object.assign(row,{owner:OWNER,module:OWNER,section,clientOrderId:row.clientOrderId||clientId,symbol:currentSymbol(),side:sentSide,orderType:sentType,exchangeLevel:serializeGrPrice(row.level),price:section==="protection"?null:fmtSectionLevel(section,row.level),stopPrice:section==="protection"?fmtSectionLevel(section,row.level):null,originalLot:fmtLot(row.lot),status:"sent"});
      persistRows();
    }
  }
  async function confirmPreflight(){
    const preflight=state.preflight;
    if(!preflight||!preflight.valid)return;
    q("gradPreflightConfirm").disabled=true;
    preflight.executing=true;q("gradPreflightConfirm").textContent="Sending...";
    try{
      if(preflight.section!=="entry")await refreshPositionAwareness(preflight.section);
      const errors=validateSection(preflight.section);
      if(errors.length)throw new Error(errors.join(" "));
      const currentRows=preflight.section==="exit"&&preflight.exitFullRecreate?validRows("exit"):actionableRows(preflight.section);
      if(!currentRows.length)throw new Error("No local or modified GR rows to send.");
      await executeSection(preflight.section,currentRows);renderSection(preflight.section);calculate();q("gradPreflightTitle").textContent="Send Results";q("gradPreflightMessage").textContent="Confirmed: "+currentRows.length+" | Failed: 0";q("gradPreflightMessage").classList.remove("is-stale");q("gradPreflightRows").querySelectorAll("tr.is-writable").forEach(row=>{row.classList.remove("is-writable");const cells=row.querySelectorAll("td");if(cells[7])cells[7].textContent="Confirmed";if(cells[8])cells[8].textContent="Binance confirmed";});q("gradPreflightConfirm").parentElement.style.display="none";setStatus(sectionTitle(preflight.section)+" Send complete.");
    }
    catch(error){q("gradPreflightMessage").textContent=error.message||String(error);q("gradPreflightMessage").classList.add("is-stale");}
    finally{preflight.executing=false;q("gradPreflightConfirm").textContent="Confirm Send";q("gradPreflightConfirm").disabled=!preflight.valid;}
  }
  async function executeSectionDirect(section){
    try{if(section!=="entry")await refreshPositionAwareness(section);}catch(_e){state.livePosition=null;state.stale[section]=true;}
    let liveExitOrders=[],exitFullRecreate=false;
    if(section==="exit"){
      try{
        liveExitOrders=await sectionOrders("exit");
        exitFullRecreate=exitQuantityChanged(liveExitOrders);
      }catch(error){
        const message=error&&error.message?error.message:String(error);
        showSendErrorWindow(section,message,[],{exitFullRecreate,liveExitOrders});
        setStatus(message);
        return;
      }
    }
    const errors=validateSection(section);
    const list=section==="exit"&&exitFullRecreate?validRows("exit"):actionableRows(section);
    if(!list.length) errors.push("No local or modified GR rows to send.");
    if(errors.length){
      const message=errors.join(" | ");
      showSendErrorWindow(section,message,list,{exitFullRecreate,liveExitOrders});
      setStatus(message);
      return;
    }
    q("gradPreflight")?.classList.add("hidden");
    setStatus(sectionTitle(section)+" Send executing...");
    try{
      await executeSection(section,list,{exitFullRecreate,liveExitOrders});
      renderSection(section);
      calculate();
      q("gradPreflight")?.classList.add("hidden");
      state.preflight=null;
      setStatus(sectionTitle(section)+" Send confirmed.");
      blinkSendButton(section);
    }catch(error){
      const message=error&&error.message?error.message:String(error);
      showSendErrorWindow(section,message,list,{exitFullRecreate,liveExitOrders});
      setStatus(sectionTitle(section)+" Send failed: "+message);
    }
  }
  async function cancelReconcileItem(item){
    if(item.isAlgo){
      const payload = {symbol:currentSymbol()};
      if(item.order && item.order.algoId != null) payload.algoId = String(item.order.algoId);
      else if(item.order && item.order.clientAlgoId) payload.clientAlgoId = String(item.order.clientAlgoId);
      else throw new Error("Protection order is missing cancel metadata.");
      return signedWrite(ALGO_URL,"DELETE",payload);
    }
    const payload = {symbol:currentSymbol()};
    if(item.order && item.order.orderId != null) payload.orderId = String(item.order.orderId);
    else if(item.order && item.order.clientOrderId) payload.origClientOrderId = String(item.order.clientOrderId);
    else throw new Error("Order is missing cancel metadata.");
    return signedWrite(ORDER_URL,"DELETE",payload);
  }
  async function recreateProtectionItem(item,newQty,position){
    const qty = normalizeQtyDown(newQty);
    if(qty == null || qty < 0.001) throw new Error("Protection reduce quantity is invalid.");
    if(item.isAlgo){
      const clientAlgoId = nextTrackedClientId("P",position);
      const payload = {
        symbol:currentSymbol(),
        side:item.side,
        algoType:"CONDITIONAL",
        type:"STOP_MARKET",
        quantity:String(qty),
        triggerPrice:serializeGrPrice(item.level),
        workingType:String(item.workingType || "CONTRACT_PRICE")
      };
      if(clientAlgoId) payload.clientAlgoId = clientAlgoId;
      if(["LONG","SHORT"].includes(position.positionSide)) payload.positionSide = position.positionSide;
      else payload.reduceOnly = "true";
      const response = await signedWrite(ALGO_URL,"POST",payload);
      registerTrackedOrderMeta({
        symbol:currentSymbol(),
        side:item.side,
        positionSide:payload.positionSide || "",
        positionGroupId:positionGroupTracker ? positionGroupTracker.positionGroupIdFor({clientAlgoId:response && response.clientAlgoId ? response.clientAlgoId : clientAlgoId}) : null,
        roleCode:"P",
        roleType:"PSL",
        owner:"GR",
        algoId:response && response.algoId != null ? response.algoId : null,
        orderId:response && response.orderId != null ? response.orderId : null,
        clientAlgoId:response && response.clientAlgoId ? response.clientAlgoId : clientAlgoId
      });
      return response;
    }
    const payload = {
      symbol:currentSymbol(),
      side:item.side,
      type:String(item.type || "STOP_MARKET").toUpperCase(),
      quantity:String(qty),
      stopPrice:serializeGrPrice(item.level)
    };
    if(payload.type === "STOP" || payload.type === "TAKE_PROFIT"){
      if(!(number(item.price) > 0)) throw new Error("Protection STOP order is missing its price.");
      payload.price = serializeGrPrice(item.price);
      payload.timeInForce = item.timeInForce || "GTC";
    }
    if(["LONG","SHORT"].includes(position.positionSide)) payload.positionSide = position.positionSide;
    else payload.reduceOnly = "true";
    if(item.order && item.order.workingType) payload.workingType = String(item.order.workingType);
    const response = await signedWrite(ORDER_URL,"POST",payload);
    registerTrackedOrderMeta({
      symbol:currentSymbol(),
      side:item.side,
      positionSide:payload.positionSide || "",
      positionGroupId:positionGroupTracker ? positionGroupTracker.positionGroupIdFor({clientOrderId:response && response.clientOrderId}) : null,
      roleCode:"P",
      roleType:"PSL",
      owner:"GR",
      orderId:response && response.orderId != null ? response.orderId : null,
      clientOrderId:response && response.clientOrderId ? response.clientOrderId : ""
    });
    return response;
  }
  async function reduceExitItem(item,newQty){
    const qty = normalizeQtyDown(newQty);
    if(qty == null || qty < 0.001) throw new Error("Exit reduce quantity is invalid.");
    const payload = {
      symbol:currentSymbol(),
      side:item.side,
      type:"LIMIT",
      quantity:String(qty),
      price:serializeGrPrice(item.level),
      timeInForce:item.timeInForce || "GTC"
    };
    if(item.order && item.order.orderId != null) payload.orderId = String(item.order.orderId);
    else if(item.order && item.order.clientOrderId) payload.origClientOrderId = String(item.order.clientOrderId);
    else throw new Error("Exit order is missing modify metadata.");
    if(item.positionSide && item.positionSide !== "BOTH") payload.positionSide = item.positionSide;
    if(item.reduceOnly) payload.reduceOnly = "true";
    return signedWrite(ORDER_URL,"PUT",payload);
  }
  async function confirmReconcilePreview(){
    const reconcile = state.reconcile;
    if(!reconcile || reconcile.executing || reconcile.already) return;
    reconcile.executing = true;
    q("gradReconcileConfirm").disabled = true;
    q("gradReconcileConfirm").textContent = "Sending...";
    try{
      const live = await livePosition();
      if(positionFingerprint(live) !== reconcile.fingerprint) throw new Error("Position changed - reconcile again.");
      const snapshot = await openOrdersSnapshot();
      const latest = buildReconcilePlan(reconcile.kind,live,snapshot);
      if(latest.already) throw new Error(reconcile.kind === "RP" ? "Protection already reconciled." : "Exits already reconciled.");
      const changed = latest.actions.filter(entry => entry.action !== "Keep");
      for(const entry of changed){
        if(entry.action === "Cancel"){
          await cancelReconcileItem(entry.item);
        }else if(entry.action === "Reduce"){
          if(reconcile.kind === "RP"){
            await cancelReconcileItem(entry.item);
            await recreateProtectionItem(entry.item,entry.newQty,live);
          }else{
            await reduceExitItem(entry.item,entry.newQty);
          }
        }
      }
      q("gradReconcileTitle").textContent = "Reconcile Results";
      q("gradReconcileMessage").textContent = "Confirmed actions: " + changed.length + " | Final total: " + fmtLot(latest.finalTotal);
      q("gradReconcileMessage").classList.remove("is-stale");
      q("gradReconcileRows").querySelectorAll("tr.is-writable").forEach(row=>{row.classList.remove("is-writable");const cells=row.querySelectorAll("td");if(cells[7])cells[7].textContent="Confirmed";if(cells[8])cells[8].textContent="Binance confirmed";});
      q("gradReconcileConfirm").parentElement.style.display = "none";
      if(reconcile.kind === "RP") await readSection("protection");
      else await readSection("exit");
      setStatus((reconcile.kind === "RP" ? "Protection" : "Exit") + " reconcile complete.");
    }catch(error){
      q("gradReconcileMessage").textContent=error.message||String(error);
      q("gradReconcileMessage").classList.add("is-stale");
      setStatus(error.message||String(error));
    }finally{
      if(state.reconcile) state.reconcile.executing=false;
      q("gradReconcileConfirm").textContent = reconcile && reconcile.kind === "RP" ? "Confirm RP" : "Confirm RE";
      q("gradReconcileConfirm").disabled = !!(state.reconcile && state.reconcile.already);
    }
  }
  async function executeExpressSection(section){
    await openPreflight(section);
    const preflight = state.preflight;
    if(!preflight) return;
    if(!preflight.valid){
      ensurePreflight().classList.remove("hidden");
      q("gradPreflightTitle").textContent="Send Results";
      q("gradPreflightConfirm").parentElement.style.display="none";
      return;
    }
    q("gradPreflightConfirm").parentElement.style.display="none";
    await confirmPreflight();
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
    const right=canvas.clientWidth-(typeof RIGHT_AXIS==="number"?RIGHT_AXIS:84),items=[],drawnBoxes=[],shiftLeft=ordersVisible()?150:0;
    sections.forEach(section=>{if(state.visible[section])displayGridRows(section).forEach((row,index)=>{if(number(row.level)>0&&number(row.lot)>=.001)items.push({section,row,index});});});
    ctx.save();ctx.font="11px Arial";ctx.textBaseline="middle";
    const prepared=items.map(item=>{
      const level=number(item.row.level),y=top+((max-level)/(max-min))*height;
      if(y<top||y>top+height)return null;
      const value=item.section==="entry"?null:rowPl(item.section,item.row);
      const text=item.section==="entry"?rowLabel(item.section,item.index)+" | "+fmtLot(item.row.lot):rowLabel(item.section,item.index)+" | "+fmtLot(item.row.lot)+" | "+fmtMoney(value);
      const w=Math.ceil(ctx.measureText(text).width)+12,color=item.section==="entry"?"#374151":item.section==="protection"?moneyColor(value):"#047857",sectionRows=gridRows(item.section).filter(row=>number(row.level)>0&&number(row.lot)>=.001),boundary=item.row.status!=="executed"&&(item.row===sectionRows[0]?"start":item.row===sectionRows[sectionRows.length-1]?"end":null);
      return {item,y,value,text,w,color,boundary,x:Math.max(8,right-w-12-shiftLeft)};
    }).filter(Boolean);
    prepared.forEach(entry=>{
      ctx.setLineDash([5,2]);ctx.strokeStyle=entry.color;ctx.globalAlpha=.62;ctx.beginPath();ctx.moveTo(8,entry.y);ctx.lineTo(right,entry.y);ctx.stroke();
    });
    ctx.setLineDash([]);
    prepared.sort((a,b)=>Number(!!b.boundary)-Number(!!a.boundary)).forEach(entry=>{
      const {item,y,text,w,color,boundary,x}=entry;
      if(y-8<top||y+8>top+height)return;
      if(drawnBoxes.some(box=>x<box.x2&&x+w>box.x1&&y-8<box.y2&&y+8>box.y1))return;
      ctx.globalAlpha=.96;ctx.fillStyle="#fff";ctx.fillRect(x,y-8,w,16);ctx.strokeStyle=color;ctx.lineWidth=boundary?2:1;ctx.strokeRect(x,y-8,w,16);ctx.lineWidth=1;ctx.fillStyle=color;ctx.globalAlpha=1;ctx.fillText(text,x+6,y+.5);
      const box={owner:OWNER,module:OWNER,section:item.section,localRowId:item.row.localRowId,binanceOrderId:item.row.binanceOrderId,status:item.row.status,boundary,x1:x,y1:y-8,x2:x+w,y2:y+8,row:item.row};
      drawnBoxes.push(box);state.overlayBoxes.push(box);
    });
    ctx.restore();
  }
  function scheduleTopLayerLabels(){
    if(state.labelFrame){
      try{ cancelAnimationFrame(state.labelFrame); }catch(_e){}
      state.labelFrame = 0;
    }
    state.labelFrame = requestAnimationFrame(() => {
      state.labelFrame = 0;
      try{drawLabels();}catch(error){console.warn(MODULE+" overlay failed",error);}
      try{window.CANDLE_CLOSE_COUNTDOWN?.draw?.();}catch(_e){}
    });
  }
  function installDrawHook(){if(window.__gradDrawWrapped||typeof draw!=="function")return;window.__gradDrawWrapped=true;const previous=draw;window.draw=draw=function(){const result=previous.apply(this,arguments);scheduleTopLayerLabels();return result;};}
  function hit(clientX,clientY){if(typeof canvas==="undefined"||!canvas)return null;const rect=canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;return state.overlayBoxes.find(box=>x>=box.x1&&x<=box.x2&&y>=box.y1&&y<=box.y2)||null;}
  function dragSnapshot(box,pointerId){
    const list=gridRows(box.section);
    return {section:box.section,row:box.row,rowIndex:list.indexOf(box.row),pointerId,pivotPrice:number(box.row.level),originalRows:rows(box.section).map(row=>({localRowId:row.localRowId,level:row.level,status:row.status})),originalGenerator:{...state.generators[box.section]}};
  }
  function restoreDragPreview(drag){
    if(!drag)return;
    drag.originalRows.forEach(saved=>{const row=rows(drag.section).find(item=>item.localRowId===saved.localRowId);if(row)Object.assign(row,saved);});
    state.generators[drag.section]={...drag.originalGenerator};
    writeGenerator(drag.section);renderSection(drag.section);calculate();persistRows();redraw();
  }
  function cancelActiveGridDrag(){
    const drag=state.drag;if(!drag)return false;state.drag=null;restoreDragPreview(drag);try{canvas.releasePointerCapture(drag.pointerId);}catch(_e){}if(canvas)canvas.style.cursor="";return true;
  }
  function installDrag(){
    if(typeof canvas==="undefined"||!canvas||canvas.__gradV4Drag)return;
    canvas.__gradV4Drag=true;
    canvas.addEventListener("pointerdown",event=>{
      const box=hit(event.clientX,event.clientY),draggable=box&&box.status!=="executed";
      if(!draggable)return;
      state.drag=dragSnapshot(box,event.pointerId);
      try{canvas.setPointerCapture(event.pointerId);}catch(_e){}
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    canvas.addEventListener("pointermove",event=>{
      if(!state.drag){const box=hit(event.clientX,event.clientY);canvas.style.cursor=box&&box.status!=="executed"?"ns-resize":"";return;}
      if(event.pointerId!==state.drag.pointerId)return;
      const level=priceFromY(event.clientY);if(level==null||level<=0)return;
      dragGridPivot(state.drag.section,state.drag.row,level);
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    const finish=(event,cancelled=false)=>{
      if(!state.drag||event.pointerId!==state.drag.pointerId)return;
      const drag=state.drag;state.drag=null;
      if(cancelled)restoreDragPreview(drag);
      try{canvas.releasePointerCapture(event.pointerId);}catch(_e){}
      canvas.style.cursor="";event.preventDefault();event.stopImmediatePropagation();
    };
    canvas.addEventListener("pointerup",event=>finish(event,false),true);
    canvas.addEventListener("pointercancel",event=>finish(event,true),true);
    canvas.addEventListener("pointerleave",()=>{if(!state.drag)canvas.style.cursor="";},true);
    document.addEventListener("keydown",event=>{if(event.key!=="Escape"||!state.drag)return;cancelActiveGridDrag();event.preventDefault();},true);
  }
  function bindGenerator(section){
    const prefix=`grad${section}`;
    ["Start","End","Lot","Count"].forEach(name=>q(prefix+name).addEventListener("input",()=>{
      cancelActiveGridDrag();
      const generator=state.generators[section];
      if(name==="End")generator.lastEdited="end";
      readGenerator(section);
      if(state.loadedMode[section]&&name==="Lot"){
        redistributeLotsOnly(section,state.generators[section].lot);
        setStatus(sectionTitle(section)+" loaded-order mode: levels remain fixed until boundary edit or regeneration.");
        return;
      }
      if(state.loadedMode[section]&&name==="Count"&&section==="entry"){
        state.generators[section].count=rows(section).length||1;q(prefix+"Count").value=String(state.generators[section].count);
        setStatus(sectionTitle(section)+" loaded-order mode: count remains derived from loaded rows.");
        return;
      }
      if(section==="entry"&&(name==="Start"||name==="End")&&gridRows("entry").length>1){
        const boundary=name.toLowerCase(),value=number(q(prefix+name).value),updated=redistributeFromBoundaries("entry",boundary,value);
        if(!updated)setStatus("GR Entry boundary is outside the valid ordered range.");
        return;
      }
      if(section==="entry"&&name==="Count")state.loadedMode.entry=false;
      if((section==="exit"||section==="protection")&&name==="Count")state.loadedMode[section]=false;
      if(name==="Start"||name==="End")state.loadedMode[section]=false;
      if(number(q(prefix+"Start").value)>0)generate(section);
    },false));
    ["Start","End"].forEach(name=>q(prefix+name).addEventListener("blur",()=>{readGenerator(section);q(prefix+name).value=fmtSectionLevel(section,state.generators[section][name.toLowerCase()]);},false));
    const step=q(prefix+"Step");
    step.addEventListener("input",()=>{cancelActiveGridDrag();state.generators[section].step=step.value;state.generators[section].lastEdited="step";},false);
    const commitStep=()=>{cancelActiveGridDrag();const value=normalizeGrStep(step.value);if(value==null){step.value=state.generators[section].step===""?"":fmtStep(state.generators[section].step);return;}state.loadedMode[section]=false;state.generators[section].step=value;state.generators[section].lastEdited="step";step.value=value;readGenerator(section);if(number(q(prefix+"Start").value)>0){const rebuilt=gridRows(section).length?resetGridToLinearFromCurrent(section):(generate(section),true);if(!rebuilt&&gridRows(section).length)setStatus(sectionTitle(section)+" Step cannot preserve one price increment between levels.");}};
    step.addEventListener("blur",commitStep,false);step.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();step.blur();}},false);
    const stepIncrement=()=>Math.max(GR_PRICE_INCREMENT,number(step.dataset.step)||GR_PRICE_INCREMENT);
    const nudgeStep=delta=>{if(step.disabled)return false;const base=number(step.value)??number(state.generators[section].step)??0;step.value=normalizeGrStep(base+delta);commitStep();return true;};
    q(prefix+"StepUp").onclick=()=>nudgeStep(stepIncrement());q(prefix+"StepDown").onclick=()=>nudgeStep(-stepIncrement());
    if(!step.__gradWheelBound){step.__gradWheelBound=true;step.addEventListener("wheel",event=>{if(step.disabled)return;if(nudgeStep(event.deltaY<0?stepIncrement():-stepIncrement())){event.preventDefault();event.stopPropagation();}},{passive:false});}
    if(section==="entry")q(prefix+"Direction").addEventListener("change",()=>{cancelActiveGridDrag();readGenerator(section);generate(section);},false);
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
    let timer=null;
    const refresh=()=>{
      if(timer!=null)window.clearTimeout(timer);
      timer=window.setTimeout(async()=>{
        timer=null;
        for(const section of ["protection","exit"]){
          if(!state.positionBasis[section])continue;
          try{await refreshPositionAwareness(section,{quiet:true,preferShared:true});}
          catch(_e){state.stale[section]=true;calculate();}
        }
      },200);
    };
    window.addEventListener("v13:open-position-change",refresh,false);
    window.addEventListener("v14:binance-state-change",refresh,false);
  }
  function setWindowCollapsed(win,collapsed){
    const button=q("gradCalcCollapse"),body=win.querySelector(".grad-calc-body"),stage=win.querySelector(".grad-calc-tab-stage"),head=q("gradCalcHead");
    if(!button||!body)return;
    if(collapsed){
      if(win.classList.contains("is-collapsed")) return;
      const rect=win.getBoundingClientRect();
      win.dataset.expandedWidth=Math.round(rect.width)+"px";
      win.dataset.expandedHeight=Math.round(rect.height)+"px";
      win.dataset.bodyScrollTop=String(body.scrollTop||0);
      win.dataset.stageScrollTop=String(stage&&stage.scrollTop||0);
      win.style.width=win.dataset.expandedWidth;
      win.style.height=((head&&head.offsetHeight)||34)+"px";
      win.classList.add("is-collapsed");
      button.setAttribute("aria-pressed","true");
      button.title="Restore";
      return;
    }
    if(!win.classList.contains("is-collapsed")) return;
    win.classList.remove("is-collapsed");
    if(win.dataset.expandedWidth) win.style.width=win.dataset.expandedWidth;
    if(win.dataset.expandedHeight) win.style.height=win.dataset.expandedHeight;
    button.setAttribute("aria-pressed","false");
    button.title="Collapse";
    requestAnimationFrame(()=>{
      body.scrollTop=Number(win.dataset.bodyScrollTop||0)||0;
      if(stage) stage.scrollTop=Number(win.dataset.stageScrollTop||0)||0;
    });
  }
  function restorePersistentState(){
    const records=storedRecords().filter(record=>record.symbol===currentSymbol()&&sections.includes(record.section)&&(["local"].includes(record.status)||ownedClientId(record)));
    sections.forEach(section=>{state.rows[section]=records.filter(record=>record.section===section&&record.role!=="masterSl").map(record=>rowModel(section,record));state.loadedMode[section]=state.rows[section].some(row=>row.status==="sent"||row.status==="executed");});
  }
  function bind(){
    const win=ensureWindow(),open=ensureButton();ensurePreflight();ensureReconcilePreview();restorePersistentState();
    state.expressMode=loadExpressMode();
    saveExpressMode(state.expressMode);
    clearAll();
    q("gradExpressToggle").addEventListener("change",event=>saveExpressMode(!!(event.target&&event.target.checked)),false);
    sections.forEach(section=>{bindGenerator(section);q(`gradTab${section}`).onclick=()=>{window.__bt001LastOverlayModule="gr";try{draw();}catch(_e){}setActive(section);};q(`grad${section}Clear`).onclick=()=>clearSection(section);q(`grad${section}Read`).onclick=()=>readSection(section);q(`grad${section}Show`).onclick=()=>showSection(section,!state.visible[section]);q(`grad${section}Send`).onclick=()=>{window.__bt001LastOverlayModule="gr";try{draw();}catch(_e){}void executeSectionDirect(section);};renderSection(section);});
    q("gradProtectionReconcile").onclick=()=>openReconcile("RP");
    q("gradExitReconcile").onclick=()=>openReconcile("RE");
    q("gradCalcHead").addEventListener("pointerdown",()=>{window.__bt001LastOverlayModule="gr";try{draw();}catch(_e){}},false);
    q("gradCalcClearAll").onclick=clearAll;q("gradCalcCollapse").onclick=()=>setWindowCollapsed(win,!win.classList.contains("is-collapsed"));q("gradCalcClose").onclick=()=>{win.classList.add("hidden");open.classList.remove("is-on");};open.onclick=()=>{const hidden=win.classList.toggle("hidden");open.classList.toggle("is-on",!hidden);arrangeMetricButtons();window.__bt001LastOverlayModule="gr";try{draw();}catch(_e){}};
    installWindowDrag(win);installWindowResize(win);installDrawHook();installDrag();installPositionWatcher();setActive("entry");calculate();
    window.GRAD_CALCULATOR={version:MODULE,owner:OWNER,state,open(){win.classList.remove("hidden");open.classList.add("is-on");window.__bt001LastOverlayModule="gr";try{draw();}catch(_e){}},hide(){win.classList.add("hidden");open.classList.remove("is-on");},clear:clearAll,readSection,sendSection:executeSectionDirect,setVisible:showSection,drawOverlayNow:drawLabels,getOwnedRows(){return sections.flatMap(section=>rows(section).map(row=>({...row})));},getGrid(section="entry"){return {section:sections.includes(section)?section:"entry",levels:gridRows(sections.includes(section)?section:"entry").map(row=>({localRowId:row.localRowId,level:row.level,lot:row.lot,status:row.status,binanceOrderId:row.binanceOrderId||null}))};},getEntryGrid(){return this.getGrid("entry");},_selfTest(){return domain()._selfTest();}};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
