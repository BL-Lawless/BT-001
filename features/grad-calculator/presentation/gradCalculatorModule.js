(() => {
  "use strict";

  const MODULE = "GRAD_CALCULATOR_V1";
  const OWNER = "grad";
  const ORDER_URL = "https://fapi.binance.com/fapi/v1/order";
  const ALGO_URL = "https://fapi.binance.com/fapi/v1/algoOrder";
  const OPEN_ORDERS_URL = "https://fapi.binance.com/fapi/v1/openOrders";
  const OPEN_ALGO_URL = "https://fapi.binance.com/fapi/v1/openAlgoOrders";
  const sections = ["scaleIn","protection","scaleOut"];
  const state = {
    direction:"LONG",
    visible:true,
    livePosition:null,
    rows:{scaleIn:[],protection:[],scaleOut:[]},
    generators:{
      scaleIn:{start:"",end:"",step:"",lot:"0.000",count:"3",lastEdited:"step"},
      protection:{start:"",end:"",step:"",lot:"0.000",count:"2",lastEdited:"step"},
      scaleOut:{start:"",end:"",step:"",lot:"0.000",count:"3",lastEdited:"step"}
    },
    overlayBoxes:[],
    drag:null,
    rowSeq:0
  };

  const q = id => document.getElementById(id);
  const domain = () => window.GradCalculatorDomain;
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const money = value => {
    const parsed = number(value);
    if(parsed == null) return "-";
    return (parsed > 0 ? "+" : parsed < 0 ? "-" : "") + "$" + Math.abs(parsed).toFixed(2);
  };
  const moneyColor = value => number(value) == null || number(value) === 0 ? "#111" : number(value) > 0 ? "#047857" : "#f6465d";
  const priceText = value => number(value) == null ? "-" : Math.round(number(value)).toLocaleString("en-US");
  const lotText = value => number(value) == null ? "0.000" : Math.max(0,number(value)).toFixed(3);
  const currentSymbol = () => {
    try{ return cfg().symbol; }catch(_e){ return String(q("market")?.value || "").toUpperCase(); }
  };
  const currentMarketPrice = () => {
    const values = [
      typeof lastMarkPrice !== "undefined" ? lastMarkPrice : null,
      typeof candles !== "undefined" && candles.length ? candles[candles.length - 1].close : null,
      String(q("mClose")?.textContent || "").replace(/[$,]/g,"")
    ];
    for(const value of values){
      const parsed = number(value);
      if(parsed != null && parsed > 0) return parsed;
    }
    return null;
  };
  const redraw = () => {
    try{ if(typeof draw === "function") draw(); }catch(_e){}
  };
  const setStatus = text => {
    const node = q("gradCalcStatus");
    if(node) node.textContent = text || "";
  };
  const sectionName = section => section === "scaleIn" ? "Scale In" : section === "protection" ? "Protection" : "Scale Out";
  const rowType = (section,index) => section === "scaleIn" ? "entry" : section === "scaleOut" ? "exit" : index === 0 ? "sl" : "psl";
  const rowLabel = (section,index) => section === "scaleIn" ? `G Entry ${index + 1}` : section === "scaleOut" ? `G Exit ${index + 1}` : index === 0 ? "G SL" : `G PSL ${index}`;
  const createRowId = section => `grad_${section}_${Date.now()}_${++state.rowSeq}`;
  const clientPrefix = section => section === "scaleIn" ? "GRAD_SI_" : section === "scaleOut" ? "GRAD_SO_" : "GRAD_PR_";
  const ownedClientId = order => String(order && (order.clientOrderId || order.clientAlgoId || "") || "").startsWith("GRAD_");
  const ownedSection = order => {
    const id = String(order && (order.clientOrderId || order.clientAlgoId || "") || "");
    return id.startsWith("GRAD_SI_") ? "scaleIn" : id.startsWith("GRAD_SO_") ? "scaleOut" : id.startsWith("GRAD_PR_") ? "protection" : null;
  };
  const normalizeLot = value => Math.max(0,Math.floor((number(value) || 0) * 1000) / 1000);
  const sectionRows = section => state.rows[section] || [];
  const validRows = section => sectionRows(section).filter(row => number(row.level) > 0 && number(row.lot) >= 0.001);
  const weighted = section => domain().weightedAverage(validRows(section));
  const entryReference = () => weighted("scaleIn").average || number(state.livePosition && state.livePosition.entry);
  const positionDirection = () => state.livePosition && state.livePosition.side ? state.livePosition.side : state.direction;
  const rowPl = (section,row) => {
    const entry = entryReference();
    if(entry == null) return null;
    return domain().estimatePl(positionDirection(),entry,row.level,row.lot);
  };
  const sectionValue = section => validRows(section).reduce((sum,row) => sum + (rowPl(section,row) || 0),0);
  const leverage = () => {
    const boxes = typeof openPositionBoxes !== "undefined" && Array.isArray(openPositionBoxes) ? openPositionBoxes : [];
    const box = boxes.find(item => item && (!item.symbol || item.symbol === currentSymbol()) && number(item.leverage) > 0);
    return box ? number(box.leverage) : null;
  };
  const rowCost = row => {
    const level = number(row.level);
    const lot = number(row.lot);
    const lev = leverage();
    return level != null && lot != null && lev != null && lev > 0 ? level * lot / lev : null;
  };
  const sectionCost = section => validRows(section).reduce((sum,row) => sum + (rowCost(row) || 0),0);

  function rowModel(section,data={}){
    return {
      owner:OWNER,
      module:OWNER,
      section,
      localRowId:data.localRowId || createRowId(section),
      binanceOrderId:data.binanceOrderId || null,
      clientOrderId:data.clientOrderId || null,
      status:data.status || "local",
      level:data.level == null ? "" : String(data.level),
      lot:data.lot == null ? "0.000" : lotText(data.lot)
    };
  }
  function addRow(section,data={}){
    const row = rowModel(section,data);
    state.rows[section].push(row);
    renderSection(section);
    calculate();
    return row;
  }
  function clearSection(section){
    state.rows[section] = [];
    renderSection(section);
    calculate();
    setStatus(sectionName(section) + " cleared locally.");
  }
  function clearAll(){
    sections.forEach(section => { state.rows[section] = []; renderSection(section); });
    state.livePosition = null;
    state.overlayBoxes = [];
    calculate();
    setStatus("Grad Calculator cleared locally.");
  }

  function generatorMarkup(section,withDirection){
    const prefix = `grad${section}`;
    return `
      <div class="grad-calc-generator" data-generator="${section}">
        ${withDirection ? `<label>Direction<select id="${prefix}Direction"><option>LONG</option><option>SHORT</option></select></label>` : ""}
        <label>Start level<input id="${prefix}Start" type="number" min="0" step="1"></label>
        <label>End level<input id="${prefix}End" type="number" min="0" step="1"></label>
        <label>Step<input id="${prefix}Step" type="number" min="0" step="1"></label>
        <label>Total lot<input id="${prefix}Lot" type="number" min="0.001" step="0.001" value="0.000"></label>
        <label>Count<input id="${prefix}Count" type="number" min="1" step="1" value="${section === "protection" ? "2" : "3"}"></label>
        <button class="grad-calc-generate" id="${prefix}Generate" type="button">Generate</button>
      </div>`;
  }
  function sectionMarkup(section){
    const title = sectionName(section);
    const valueHead = section === "scaleIn" ? "Margin" : section === "protection" ? "Risk" : "PL";
    return `
      <div class="grad-calc-panel">
        <div class="grad-calc-section-head" id="grad${section}Title">
          <span>${title}</span>
          <span class="grad-calc-section-actions">
            <button data-clear-section="${section}" type="button">Clear</button>
            <button data-send-section="${section}" type="button">Send</button>
            <span class="grad-calc-caret" id="grad${section}Caret">▾</span>
          </span>
        </div>
        <div id="grad${section}Body">
          ${generatorMarkup(section,section === "scaleIn")}
          <div class="grad-calc-table-head"><div>#</div><div>Level</div><div>Lot</div><div>${valueHead}</div><div>x</div></div>
          <div id="grad${section}Rows"></div>
          <div class="grad-calc-section-totals"><span id="grad${section}AverageLabel">Average</span><span id="grad${section}Average">-</span></div>
          <div class="grad-calc-section-totals"><span id="grad${section}TotalLabel">Total ${valueHead}</span><span id="grad${section}Total">-</span></div>
        </div>
      </div>`;
  }
  function ensureWindow(){
    let win = q("gradCalcWindow");
    if(win) return win;
    win = document.createElement("div");
    win.id = "gradCalcWindow";
    win.className = "grad-calc-window hidden";
    win.innerHTML = `
      <div class="grad-calc-head" id="gradCalcHead"><div class="grad-calc-title">Grad Calculator V1</div><button id="gradCalcClose" type="button">x</button></div>
      <div class="grad-calc-body">
        ${sectionMarkup("scaleIn")}
        ${sectionMarkup("protection")}
        ${sectionMarkup("scaleOut")}
        <div class="grad-calc-panel">
          <div class="grad-calc-section-head" id="gradsummaryTitle"><span>Summary</span><span class="grad-calc-section-actions"><button id="gradSummaryClear" type="button">Clear</button><button type="button" disabled>Send</button><span class="grad-calc-caret" id="gradsummaryCaret">▾</span></span></div>
          <div id="gradsummaryBody">
            <div class="grad-calc-summary-row"><span>Total Scale In lots</span><span id="gradSummaryEntryLots">0.000</span></div>
            <div class="grad-calc-summary-row"><span>Average Entry</span><span id="gradSummaryEntryAvg">-</span></div>
            <div class="grad-calc-summary-row"><span>Total Risk</span><span id="gradSummaryRisk">-</span></div>
            <div class="grad-calc-summary-row"><span>Projected P/L</span><span id="gradSummaryPl">-</span></div>
          </div>
        </div>
        <div class="grad-calc-controls">
          <button id="gradCalcClear" type="button">Clear</button>
          <button id="gradCalcRead" type="button">Read</button>
          <label class="grad-calc-show"><input id="gradCalcShow" type="checkbox" checked><span>Show</span></label>
          <button id="gradCalcSend" type="button" disabled title="V1 uses section Send buttons">Send</button>
        </div>
        <div class="grad-calc-status" id="gradCalcStatus"></div>
      </div>`;
    document.body.appendChild(win);
    return win;
  }
  function ensureButton(){
    let wrap = q("gradCalcMetric");
    if(!wrap){
      wrap = document.createElement("div");
      wrap.id = "gradCalcMetric";
      wrap.className = "grad-calc-metric";
      wrap.innerHTML = `<button class="grad-calc-icon" id="gradCalcOpen" type="button" title="Grad Calculator">GR</button>`;
      const calcMetric = q("calcModuleMetric");
      if(calcMetric && calcMetric.parentNode) calcMetric.insertAdjacentElement("afterend",wrap);
      else document.querySelector(".metrics")?.appendChild(wrap);
    }
    return q("gradCalcOpen");
  }
  function renderSection(section){
    const container = q(`grad${section}Rows`);
    if(!container) return;
    container.innerHTML = "";
    sectionRows(section).forEach((model,index) => {
      const row = document.createElement("div");
      row.className = "grad-calc-row";
      row.dataset.owner = OWNER;
      row.dataset.module = OWNER;
      row.dataset.section = section;
      row.dataset.localRowId = model.localRowId;
      row.dataset.status = model.status;
      if(model.binanceOrderId != null) row.dataset.binanceOrderId = String(model.binanceOrderId);
      if(model.clientOrderId) row.dataset.clientOrderId = String(model.clientOrderId);
      row.innerHTML = `<span class="grad-calc-index">${index + 1}</span><input class="grad-calc-level" type="number" min="0" step="1" value="${model.level}"><input class="grad-calc-lot" type="number" min="0.001" step="0.001" value="${model.lot}"><span class="grad-calc-value">-</span><button class="grad-calc-remove" type="button">x</button>`;
      const level = row.querySelector(".grad-calc-level");
      const lot = row.querySelector(".grad-calc-lot");
      const sync = () => {
        model.level = level.value;
        model.lot = lotText(normalizeLot(lot.value));
        lot.value = model.lot;
        model.status = model.binanceOrderId ? "modified" : "local";
        row.dataset.status = model.status;
        calculate();
      };
      level.addEventListener("input",sync,false);
      lot.addEventListener("input",sync,false);
      row.querySelector(".grad-calc-remove").addEventListener("click",() => {
        state.rows[section] = sectionRows(section).filter(item => item.localRowId !== model.localRowId);
        renderSection(section);
        calculate();
      },false);
      container.appendChild(row);
    });
  }
  function updateRowValues(section){
    const rows = sectionRows(section);
    q(`grad${section}Rows`)?.querySelectorAll(".grad-calc-row").forEach((node,index) => {
      const model = rows[index];
      const valueNode = node.querySelector(".grad-calc-value");
      const value = section === "scaleIn" ? rowCost(model) : rowPl(section,model);
      valueNode.textContent = money(value);
      valueNode.style.color = section === "scaleIn" ? "#111" : moneyColor(value);
      const market = currentMarketPrice();
      const level = number(model.level);
      const invalid = section === "scaleIn" && market != null && level != null && (state.direction === "LONG" ? level >= market : level <= market);
      node.classList.toggle("is-invalid",invalid);
    });
  }
  function calculate(){
    sections.forEach(updateRowValues);
    const entry = weighted("scaleIn");
    const protection = weighted("protection");
    const exit = weighted("scaleOut");
    const risk = sectionValue("protection");
    const projected = sectionValue("scaleOut");
    q("gradscaleInAverage").textContent = priceText(entry.average);
    q("gradscaleInTotal").textContent = money(sectionCost("scaleIn"));
    q("gradprotectionAverage").textContent = priceText(protection.average);
    q("gradprotectionTotal").textContent = money(risk);
    q("gradprotectionTotal").style.color = moneyColor(risk);
    q("gradscaleOutAverage").textContent = priceText(exit.average);
    q("gradscaleOutTotal").textContent = money(projected);
    q("gradscaleOutTotal").style.color = moneyColor(projected);
    q("gradSummaryEntryLots").textContent = lotText(entry.quantity);
    q("gradSummaryEntryAvg").textContent = priceText(entry.average);
    q("gradSummaryRisk").textContent = money(risk);
    q("gradSummaryRisk").style.color = moneyColor(risk);
    q("gradSummaryPl").textContent = money(projected);
    q("gradSummaryPl").style.color = moneyColor(projected);
    redraw();
  }
  function readGenerator(section){
    const prefix = `grad${section}`;
    const generator = state.generators[section];
    generator.start = q(prefix + "Start").value;
    generator.end = q(prefix + "End").value;
    generator.step = q(prefix + "Step").value;
    generator.lot = q(prefix + "Lot").value;
    generator.count = q(prefix + "Count").value;
    if(section === "scaleIn") state.direction = q(prefix + "Direction").value === "SHORT" ? "SHORT" : "LONG";
    return generator;
  }
  function generate(section){
    const generator = readGenerator(section);
    const direction = section === "scaleIn"
      ? state.direction
      : section === "protection"
        ? positionDirection()
        : (positionDirection() === "SHORT" ? "LONG" : "SHORT");
    const generated = domain().generateLevels({...generator,direction});
    if(!generated.levels.length){
      setStatus(sectionName(section) + ": valid start level required.");
      return;
    }
    generator.step = generated.step == null ? "" : String(Number(generated.step.toFixed(8)));
    generator.end = generated.end == null ? "" : String(Number(generated.end.toFixed(8)));
    q(`grad${section}Step`).value = generator.step;
    q(`grad${section}End`).value = generator.end;
    const lots = domain().distributeLots(generator.lot,generated.levels.length);
    state.rows[section] = generated.levels.map((level,index) => rowModel(section,{level:Number(level.toFixed(8)),lot:lots[index]}));
    renderSection(section);
    calculate();
  }

  async function signedWrite(url,method,params){
    if(typeof hasKeys !== "function" || !hasKeys()) throw new Error("API keys are required.");
    const key = apiKeyEl.value.trim();
    const secret = apiSecretEl.value.trim();
    const offset = typeof timeOffset === "function" ? await timeOffset() : 0;
    const query = new URLSearchParams({...params,recvWindow:"5000",timestamp:String(Date.now() + offset)}).toString();
    const signature = await hmac(secret,query);
    const response = await API.fetch(url + "?" + query + "&signature=" + signature,{method,cache:"no-store",headers:{"X-MBX-APIKEY":key}});
    const data = await response.json().catch(() => ({}));
    if(!response.ok) throw new Error(data && data.msg ? data.msg : "HTTP " + response.status);
    return data;
  }
  async function livePosition(){
    if(typeof hasKeys !== "function" || !hasKeys()) return null;
    const key = apiKeyEl.value.trim();
    const secret = apiSecretEl.value.trim();
    const offset = typeof timeOffset === "function" ? await timeOffset() : 0;
    const positions = typeof getPositions === "function" ? await getPositions(key,secret,offset) : [];
    const found = (positions || []).find(row => row && row.symbol === currentSymbol() && Math.abs(number(row.positionAmt) || 0) > 0);
    if(!found) return null;
    const qty = Math.abs(number(found.positionAmt));
    return {side:number(found.positionAmt) < 0 || String(found.positionSide).toUpperCase() === "SHORT" ? "SHORT" : "LONG",qty,entry:number(found.entryPrice),positionSide:String(found.positionSide || "BOTH").toUpperCase()};
  }
  async function readOwnedOrders(){
    if(typeof hasKeys !== "function" || !hasKeys()) throw new Error("API keys are required.");
    const key = apiKeyEl.value.trim();
    const secret = apiSecretEl.value.trim();
    const offset = typeof timeOffset === "function" ? await timeOffset() : 0;
    const normal = await signedGet(OPEN_ORDERS_URL,{symbol:currentSymbol()},key,secret,offset).catch(() => []);
    const algo = await signedGet(OPEN_ALGO_URL,{symbol:currentSymbol()},key,secret,offset).catch(() => []);
    return [].concat(Array.isArray(normal) ? normal : [],Array.isArray(algo) ? algo : []).filter(ownedClientId);
  }
  function mergeOwnedOrders(orders){
    sections.forEach(section => {
      const local = sectionRows(section).filter(row => !row.binanceOrderId);
      const owned = orders.filter(order => ownedSection(order) === section).map(order => rowModel(section,{
        localRowId:`grad_owned_${order.orderId || order.algoId || order.clientOrderId || order.clientAlgoId}`,
        binanceOrderId:order.orderId || order.algoId || null,
        clientOrderId:order.clientOrderId || order.clientAlgoId || null,
        status:"sent",
        level:order.price || order.stopPrice || order.triggerPrice || "",
        lot:order.origQty || order.quantity || order.qty || "0.000"
      }));
      state.rows[section] = local.concat(owned);
      renderSection(section);
    });
  }
  async function read(){
    setStatus("Reading Grad-owned Binance state...");
    try{
      state.livePosition = await livePosition();
      const orders = await readOwnedOrders();
      mergeOwnedOrders(orders);
      calculate();
      setStatus(`Read ${orders.length} Grad-owned order(s).`);
    }catch(error){
      setStatus("Grad Read failed: " + error.message);
    }
  }
  function validateScaleIn(){
    const market = currentMarketPrice();
    if(market == null) throw new Error("Current market price unavailable.");
    validRows("scaleIn").forEach(row => {
      const level = number(row.level);
      if(state.direction === "LONG" && level >= market) throw new Error("Long Scale In entries must be below market.");
      if(state.direction === "SHORT" && level <= market) throw new Error("Short Scale In entries must be above market.");
    });
  }
  async function sendSection(section){
    setStatus("Sending " + sectionName(section) + "...");
    try{
      if(section === "scaleIn") validateScaleIn();
      if(section !== "scaleIn"){
        state.livePosition = await livePosition();
        if(!state.livePosition) throw new Error(sectionName(section) + " blocked: no valid open position.");
      }
      const rows = validRows(section).filter(row => row.status !== "sent");
      if(!rows.length) throw new Error("No valid local rows to send.");
      if(section === "protection" || section === "scaleOut"){
        const total = rows.reduce((sum,row) => sum + number(row.lot),0);
        if(total > state.livePosition.qty + 1e-9) throw new Error(sectionName(section) + " lots exceed live position size.");
      }
      for(let index=0;index<rows.length;index++){
        const row = rows[index];
        if(row.binanceOrderId != null && !String(row.clientOrderId || "").startsWith("GRAD_")){
          throw new Error("Grad ownership cannot be proven for an existing Binance order.");
        }
        const clientId = (clientPrefix(section) + Date.now().toString(36) + "_" + index).slice(0,36);
        let response;
        if(section === "protection"){
          const side = state.livePosition.side === "SHORT" ? "BUY" : "SELL";
          if(row.status === "modified" && row.binanceOrderId != null){
            await signedWrite(ALGO_URL,"DELETE",{symbol:currentSymbol(),algoId:String(row.binanceOrderId)});
          }
          const payload = {symbol:currentSymbol(),side,algoType:"CONDITIONAL",type:"STOP_MARKET",quantity:String(number(row.lot)),triggerPrice:String(number(row.level)),workingType:"CONTRACT_PRICE",clientAlgoId:clientId};
          if(state.livePosition.positionSide === "LONG" || state.livePosition.positionSide === "SHORT") payload.positionSide = state.livePosition.positionSide;
          else payload.reduceOnly = "true";
          response = await signedWrite(ALGO_URL,"POST",payload);
          row.binanceOrderId = response.algoId || response.orderId || null;
          row.clientOrderId = response.clientAlgoId || response.clientOrderId || clientId;
        }else{
          const isEntry = section === "scaleIn";
          const activeDirection = isEntry ? state.direction : positionDirection();
          const side = activeDirection === "LONG" ? (isEntry ? "BUY" : "SELL") : (isEntry ? "SELL" : "BUY");
          const payload = {symbol:currentSymbol(),side,type:"LIMIT",timeInForce:"GTC",quantity:String(number(row.lot)),price:String(number(row.level)),newClientOrderId:clientId};
          if(!isEntry){
            if(state.livePosition.positionSide === "LONG" || state.livePosition.positionSide === "SHORT") payload.positionSide = state.livePosition.positionSide;
            else payload.reduceOnly = "true";
          }
          if(row.status === "modified" && row.binanceOrderId != null){
            delete payload.newClientOrderId;
            payload.orderId = String(row.binanceOrderId);
            response = await signedWrite(ORDER_URL,"PUT",payload);
          }else{
          response = await signedWrite(ORDER_URL,"POST",payload);
          }
          row.binanceOrderId = response.orderId || null;
          row.clientOrderId = response.clientOrderId || row.clientOrderId || clientId;
        }
        row.status = "sent";
      }
      renderSection(section);
      calculate();
      setStatus(sectionName(section) + " sent.");
    }catch(error){
      setStatus(error.message || String(error));
    }
  }

  function priceFromCanvasY(clientY){
    if(typeof canvas === "undefined" || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const chartState = typeof currentPriceLineState !== "undefined" ? currentPriceLineState || {} : {};
    const top = number(chartState.top) ?? 8;
    const height = number(chartState.priceH) ?? (typeof lastAreaH !== "undefined" ? lastAreaH : null);
    const min = number(chartState.minP) ?? (typeof lastYMin !== "undefined" ? lastYMin : null);
    const max = number(chartState.maxP) ?? (typeof lastYMax !== "undefined" ? lastYMax : null);
    if(height == null || min == null || max == null || !(height > 0) || !(max > min)) return null;
    const clamped = Math.max(top,Math.min(top + height,y));
    return max - ((clamped - top) / height) * (max - min);
  }
  function drawGradLabels(){
    state.overlayBoxes = [];
    if(!state.visible || typeof canvas === "undefined" || !canvas || typeof ctx === "undefined" || !ctx) return;
    const chartState = typeof currentPriceLineState !== "undefined" ? currentPriceLineState || {} : {};
    const top = number(chartState.top) ?? 8;
    const height = number(chartState.priceH) ?? (typeof lastAreaH !== "undefined" ? lastAreaH : null);
    const min = number(chartState.minP) ?? (typeof lastYMin !== "undefined" ? lastYMin : null);
    const max = number(chartState.maxP) ?? (typeof lastYMax !== "undefined" ? lastYMax : null);
    if(height == null || min == null || max == null || !(height > 0) || !(max > min)) return;
    const leftEdge = 8;
    const chartRight = canvas.clientWidth - (typeof RIGHT_AXIS === "number" ? RIGHT_AXIS : 84);
    const items = [];
    sections.forEach(section => validRows(section).forEach((row,index) => items.push({section,row,index,label:rowLabel(section,index)})));
    ctx.save();
    ctx.font = "11px Arial";
    ctx.textBaseline = "middle";
    items.forEach((item,index) => {
      const level = number(item.row.level);
      const y = top + ((max - level) / (max - min)) * height;
      if(y < top || y > top + height) return;
      const value = item.section === "scaleIn" ? rowCost(item.row) : rowPl(item.section,item.row);
      const text = item.label + " | " + lotText(item.row.lot) + " | " + money(value);
      const width = Math.ceil(ctx.measureText(text).width) + 12;
      const x = Math.max(leftEdge,chartRight - width - 12 - (index % 3) * 18);
      const color = item.section === "scaleIn" ? "#2563eb" : item.section === "protection" ? "#b42334" : "#047857";
      ctx.setLineDash([5,2]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = .62;
      ctx.beginPath();
      ctx.moveTo(leftEdge,y);
      ctx.lineTo(chartRight,y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = .96;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x,y - 8,width,16);
      ctx.strokeStyle = color;
      ctx.strokeRect(x,y - 8,width,16);
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.fillText(text,x + 6,y + .5);
      state.overlayBoxes.push({x1:x,y1:y - 8,x2:x + width,y2:y + 8,row:item.row,section:item.section});
    });
    ctx.restore();
  }
  function installDrawHook(){
    if(window.__gradDrawWrapped || typeof draw !== "function") return;
    window.__gradDrawWrapped = true;
    const previous = draw;
    window.draw = draw = function(){
      const result = previous.apply(this,arguments);
      try{ drawGradLabels(); }catch(error){ console.warn(MODULE + " overlay failed",error); }
      return result;
    };
  }
  function overlayHit(clientX,clientY){
    if(typeof canvas === "undefined" || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return state.overlayBoxes.find(box => x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2) || null;
  }
  function installDrag(){
    if(typeof canvas === "undefined" || !canvas || canvas.__gradCalculatorDrag) return;
    canvas.__gradCalculatorDrag = true;
    canvas.addEventListener("mousedown",event => {
      const hit = overlayHit(event.clientX,event.clientY);
      if(!hit || !state.visible) return;
      state.drag = hit;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
    window.addEventListener("mousemove",event => {
      if(!state.drag) return;
      const level = priceFromCanvasY(event.clientY);
      if(level == null || level <= 0) return;
      state.drag.row.level = String(Number(level.toFixed(8)));
      renderSection(state.drag.section);
      calculate();
      event.preventDefault();
    },true);
    window.addEventListener("mouseup",event => {
      if(!state.drag) return;
      state.drag = null;
      event.preventDefault();
    },true);
  }

  function bindGenerator(section){
    const prefix = `grad${section}`;
    ["Start","End","Step","Lot","Count"].forEach(name => {
      const input = q(prefix + name);
      input.addEventListener("input",() => {
        if(name === "End" || name === "Step") state.generators[section].lastEdited = name.toLowerCase();
        readGenerator(section);
        if(number(q(prefix + "Start").value) > 0) generate(section);
      },false);
    });
    if(section === "scaleIn") q(prefix + "Direction").addEventListener("change",() => { readGenerator(section); calculate(); },false);
    q(prefix + "Generate").addEventListener("click",() => generate(section),false);
  }
  function installWindowDrag(win){
    const head = q("gradCalcHead");
    let drag = null;
    head.addEventListener("pointerdown",event => {
      if(event.target.closest("button")) return;
      const rect = win.getBoundingClientRect();
      drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
      head.setPointerCapture(event.pointerId);
    },false);
    head.addEventListener("pointermove",event => {
      if(!drag) return;
      win.style.left = Math.max(0,drag.left + event.clientX - drag.x) + "px";
      win.style.top = Math.max(0,drag.top + event.clientY - drag.y) + "px";
    },false);
    head.addEventListener("pointerup",event => {
      drag = null;
      try{ head.releasePointerCapture(event.pointerId); }catch(_e){}
    },false);
  }
  function bind(){
    const win = ensureWindow();
    const open = ensureButton();
    sections.forEach(section => {
      bindGenerator(section);
      q(`grad${section}Title`).addEventListener("click",event => {
        if(event.target.closest("button")) return;
        const body = q(`grad${section}Body`);
        const collapsed = body.classList.toggle("grad-calc-collapsed");
        q(`grad${section}Caret`).textContent = collapsed ? "▸" : "▾";
      },false);
    });
    q("gradsummaryTitle").addEventListener("click",() => {
      const body = q("gradsummaryBody");
      const collapsed = body.classList.toggle("grad-calc-collapsed");
      q("gradsummaryCaret").textContent = collapsed ? "▸" : "▾";
    },false);
    q("gradSummaryClear").addEventListener("click",event => {
      event.stopPropagation();
      setStatus("Grad Summary is derived from Grad sections.");
    },false);
    document.querySelectorAll("[data-clear-section]").forEach(button => button.addEventListener("click",event => clearSection(event.currentTarget.dataset.clearSection),false));
    document.querySelectorAll("[data-send-section]").forEach(button => button.addEventListener("click",event => sendSection(event.currentTarget.dataset.sendSection),false));
    q("gradCalcClear").addEventListener("click",clearAll,false);
    q("gradCalcRead").addEventListener("click",read,false);
    q("gradCalcShow").addEventListener("change",event => { state.visible = !!event.target.checked; redraw(); },false);
    q("gradCalcClose").addEventListener("click",() => { win.classList.add("hidden"); open.classList.remove("is-on"); },false);
    open.addEventListener("click",() => {
      const hidden = win.classList.toggle("hidden");
      open.classList.toggle("is-on",!hidden);
    },false);
    installWindowDrag(win);
    installDrawHook();
    installDrag();
    sections.forEach(renderSection);
    calculate();
    window.GRAD_CALCULATOR = {
      version:MODULE,
      owner:OWNER,
      state,
      open(){ win.classList.remove("hidden"); open.classList.add("is-on"); },
      hide(){ win.classList.add("hidden"); open.classList.remove("is-on"); },
      clear:clearAll,
      read,
      sendSection,
      setVisible(next){ state.visible = !!next; q("gradCalcShow").checked = state.visible; redraw(); },
      getOwnedRows(){ return sections.flatMap(section => sectionRows(section).map(row => ({...row}))); }
    };
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",bind,{once:true});
  else bind();
})();
