(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,calc=root.calculations;
  if(!C||!calc)throw new Error("SCALP dependencies must load before state machine");
  const n=calc.n,quoteAsset=calc.quoteAsset,upper=value=>String(value||"").toUpperCase(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
  function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase();}
  function clientId(kind,eventId,generation){return `${C.order.namespace}-${kind}-${generation}-${hash(eventId)}`.slice(0,36);}
  function filterValue(settings,type,key){const row=Array.isArray(settings&&settings.filters)?settings.filters.find(item=>item&&item.filterType===type):null;return n(row&&row[key]);}
  function normalizedFilters(settings={}){const lotStep=n(settings.stepSize)||filterValue(settings,"LOT_SIZE","stepSize")||0.001,marketStep=filterValue(settings,"MARKET_LOT_SIZE","stepSize")||lotStep,lotMin=filterValue(settings,"LOT_SIZE","minQty")||0,marketMin=filterValue(settings,"MARKET_LOT_SIZE","minQty")||0,maximums=[filterValue(settings,"LOT_SIZE","maxQty"),filterValue(settings,"MARKET_LOT_SIZE","maxQty")].filter(value=>value>0);return {...settings,tickSize:n(settings.tickSize)||filterValue(settings,"PRICE_FILTER","tickSize")||0.01,stepSize:Math.max(lotStep,marketStep),lotStepSize:lotStep,marketStepSize:marketStep,minQty:Math.max(lotMin,marketMin),maxQty:maximums.length?Math.min(...maximums):null,minNotional:filterValue(settings,"MIN_NOTIONAL","notional")||filterValue(settings,"NOTIONAL","minNotional")||0};}
  function orderClient(row){return String(row&&(row.clientOrderId??row.origClientOrderId??row.clientAlgoId??row.c??row.ca)||"");}
  function isOwned(row){return orderClient(row).startsWith(C.order.namespace+"-");}
  function snapshotOrders(value){const snap=value&&value.orders&&Array.isArray(value.orders)?value:value&&value.snapshot||value||{};return [...(Array.isArray(snap.orders)?snap.orders:[]),...(Array.isArray(snap.algoOrders)?snap.algoOrders:[])];}
  class ScalpEngine extends EventTarget{
    constructor(options={}){
      super();this.gateway=options.gateway||window.BT001_BINANCE_TRADING;this.detector=options.detector||new root.Detector();this.now=options.now||Date.now;this.storage=options.storage||localStorage;
      // Default true preserves existing behaviour exactly (the single global Binance private
      // stream feeds these events for the default/only account). Set false when this engine is
      // bound to a secondary-account gateway (features/scalp/secondary-gateway.module.js), which
      // instead feeds onOrder/onPosition/onPrivateStatus directly via its own independent stream --
      // otherwise a second engine would also react to the FIRST account's order/position events.
      this.useGlobalPrivateEvents=options.useGlobalPrivateEvents!==false;
      this.state="OFF";this.status="";this.generation=0;this.config=this.loadConfig();this.guide=null;this.rates=calc.feeRates();this.filters=null;this.marketSymbol=this.gateway&&this.gateway.symbol?this.gateway.symbol():null;this.latestBySource=new Map();this.lastQualifiedBySource=new Map();this.baseline=new Set();this.seen=new Set();this.rankRejected=new Set();this.armedAt=0;this.session=null;this.externalPosition=null;this.executionLock=null;this.exitLock=null;this.cooloffAfterFlat=false;this.cooloffTimer=null;this.unsubHub=null;this.diagnostics=[];this.fillIds=new Set();this.lastPrivateStatus=null;this.reconnectBusy=false;
      this.cascadeByTf=new Map();this.autoLossState=this.loadAutoLossState();
    }
    loadConfig(){let saved={};try{saved=JSON.parse(this.storage.getItem(C.configKey)||"{}");}catch(_e){}["autoEntryEnabled","autoTradingEnabled"].forEach(key=>delete saved[key]);const nonnegative=(value,fallback,decimals)=>n(value)!=null&&n(value)>=0?Number(value).toFixed(decimals):fallback,minimumRank=Math.round(Math.max(0,Math.min(100,n(saved.minimumRank)??C.defaults.minimumRank))),positiveInt=(value,fallback)=>n(value)!=null&&n(value)>=1?Math.round(n(value)):fallback,nonnegativeNumber=(value,fallback)=>n(value)!=null&&n(value)>=0?n(value):fallback;return {...C.defaults,...saved,direction:C.directions.includes(saved.direction)?saved.direction:C.defaults.direction,source:C.sources.includes(saved.source)?saved.source:C.defaults.source,entryType:C.entryTypes.includes(saved.entryType)?saved.entryType:C.defaults.entryType,minimumRank,mode:C.modes.includes(saved.mode)?saved.mode:C.defaults.mode,lot:nonnegative(saved.lot,C.defaults.lot,3),target:nonnegative(saved.target,C.defaults.target,1),tpDelta:nonnegative(saved.tpDelta,C.defaults.tpDelta,0),tpDriver:["NET_TARGET","TP_DELTA"].includes(saved.tpDriver)?saved.tpDriver:C.defaults.tpDriver,stop:nonnegative(saved.stop,C.defaults.stop,1),slDelta:nonnegative(saved.slDelta,C.defaults.slDelta,0),slDriver:["NET_SL","SL_DELTA"].includes(saved.slDriver)?saved.slDriver:C.defaults.slDriver,maxConcurrentAutoPositions:positiveInt(saved.maxConcurrentAutoPositions,C.defaults.maxConcurrentAutoPositions),maxDailyAutoLossUsd:nonnegativeNumber(saved.maxDailyAutoLossUsd,C.defaults.maxDailyAutoLossUsd)};}
    saveConfig(){try{this.storage.setItem(C.configKey,JSON.stringify(this.config));}catch(_e){}}
    loadAutoLossState(){try{const saved=JSON.parse(this.storage.getItem(C.autoLossKey)||"null");if(saved&&typeof saved.day==="string")return {day:saved.day,accumulatedUsd:Math.max(0,n(saved.accumulatedUsd)||0)};}catch(_e){}return {day:null,accumulatedUsd:0};}
    saveAutoLossState(){try{this.storage.setItem(C.autoLossKey,JSON.stringify(this.autoLossState));}catch(_e){}}
    emit(reason="update"){const detail=this.snapshot();this.dispatchEvent(new CustomEvent("change",{detail:{...detail,reason}}));try{window.dispatchEvent(new CustomEvent("bt001:scalp-state",{detail:{...detail,reason}}));}catch(_e){}}
    previewDirection(){if(this.session&&["LONG","SHORT"].includes(upper(this.session.direction)))return upper(this.session.direction);if(["LONG","SHORT"].includes(upper(this.config.direction)))return upper(this.config.direction);const latest=this.displayDetection(this.config.source);return latest&&["LONG","SHORT"].includes(upper(latest.direction))?upper(latest.direction):"ANY";}
    outcomePreview(){const actual=this.session&&n(this.session.avgEntry)>0&&(n(this.session.liveQty)>0||n(this.session.filledQty)>0),outcome=calc.linkedPreview({direction:this.previewDirection(),guide:this.guide,qty:actual?n(this.session.liveQty)||n(this.session.filledQty):this.config.lot,target:actual&&this.config.tpDriver==="NET_TARGET"?this.session.target:this.config.target,stop:actual&&this.config.slDriver==="NET_SL"?this.session.stop:this.config.stop,tpDelta:this.config.tpDelta,slDelta:this.config.slDelta,tpDriver:this.config.tpDriver,slDriver:this.config.slDriver,rates:this.rates,filters:this.filters||{},entryPrice:actual?this.session.avgEntry:null,entryCommission:actual?this.session.entryCommission:null,fundingCost:actual?n(this.session.fundingCost)||0:0});if(outcome.available){const patch={};if(this.config.tpDriver==="TP_DELTA")patch.target=calc.formatNumeric(outcome.target,1);else patch.tpDelta=calc.formatNumeric(outcome.tpDelta,0);if(this.config.slDriver==="SL_DELTA")patch.stop=calc.formatNumeric(outcome.stop,1);else patch.slDelta=calc.formatNumeric(outcome.slDelta,0);let changed=false;for(const [key,value] of Object.entries(patch))if(this.config[key]!==value){this.config[key]=value;changed=true;}if(actual){if(this.config.tpDriver==="TP_DELTA"&&n(this.session.target)!==n(patch.target)){this.session.target=n(patch.target);changed=true;}if(this.config.slDriver==="SL_DELTA"&&n(this.session.stop)!==n(patch.stop)){this.session.stop=n(patch.stop);changed=true;}}if(changed){this.saveConfig();if(actual)this.persistSession();}}return outcome;}
    snapshot(){const outcome=this.outcomePreview();return {state:this.state,status:this.status,generation:this.generation,config:{...this.config},guide:this.guide,rates:{...this.rates},filters:this.filters?{...this.filters}:null,latest:this.displayDetection(this.config.source),detections:this.detectionRows(),outcome,session:this.session?clone(this.session):null,externalPosition:this.externalPosition?clone(this.externalPosition):null,armBlockedByPosition:!!this.externalPosition&&!this.session,active:this.isActive(),armed:this.state==="ARMED",locked:this.configurationLocked(),cascade:this.cascadeState(),dailyLoss:this.dailyLossSnapshot()};}
    log(action,data={}){this.diagnostics.push({at:this.now(),state:this.state,action,...data});if(this.diagnostics.length>120)this.diagnostics.shift();}
    transition(next,reason){
      if(next===this.state){this.status=reason||this.status;this.emit(reason);return;}const allowed=C.transitions[this.state]||[];if(!allowed.includes(next))throw new Error(`Invalid SCALP transition ${this.state} -> ${next}`);
      this.log("transition",{from:this.state,to:next,reason});this.state=next;this.status=reason||next;this.emit(reason);
    }
    isActive(){return !["OFF","ARMED","COOL_OFF","ERROR","POSITION_MISMATCH"].includes(this.state);}
    configurationLocked(){return this.isActive()||!!this.session;}
    position(){const snap=this.gateway&&this.gateway.position&&this.gateway.position();return snap&&Object.prototype.hasOwnProperty.call(snap,"position")?snap.position:snap;}
    externalPositionText(position){return position&&["LONG","SHORT"].includes(upper(position.side))?`EXISTING ${upper(position.side)} POSITION · SCALP cannot arm`:"OFF";}
    setExternalPosition(position){this.externalPosition=position?{symbol:position.symbol||this.gateway.symbol(),side:upper(position.side),qty:n(position.qty),avg:n(position.avg)}:null;if(!this.session&&this.state==="OFF")this.status=this.externalPositionText(this.externalPosition);}
    rebaselineMarketDetections(reason){if(this.detector&&typeof this.detector.reset==="function")this.detector.reset();for(const source of C.timeframes){this.latestBySource.delete(source);this.lastQualifiedBySource.delete(source);}this.baseline.clear();this.seen.clear();this.rankRejected.clear();this.log("detection-baseline-reset",{reason});}
    displayDetection(source,at=this.now()){
      const current=this.latestBySource.get(source)||null,eventType=upper(current&&current.eventType)||"NONE";
      if(current&&eventType!=="NONE")return current;
      const retained=this.lastQualifiedBySource.get(source)||null,publishedAt=n(retained&&retained.publishedAt)||0,staleMs=C.signal.staleMs[source]||120000;
      return retained&&publishedAt&&at-publishedAt<=staleMs?retained:current;
    }
    detectionRows(){
      const now=this.now();return C.sources.map(source=>{const raw=this.displayDetection(source,now)||{source,eventType:"NONE",eventState:"NONE",qualified:false,publishedAt:0},eventType=upper(raw.eventType)||"NONE",direction=["LONG","SHORT"].includes(upper(raw.direction))?upper(raw.direction):null,phase=upper(raw.eventState||raw.phase)||(eventType==="NONE"?"NONE":"—"),publishedAt=n(raw.publishedAt)||0,stale=eventType!=="NONE"&&(!publishedAt||now-publishedAt>(C.signal.staleMs[source]||120000));let eligibility="ELIGIBLE";
        if(stale)eligibility="STALE";else if(source!==this.config.source)eligibility="SOURCE FILTER";else if(this.externalPosition&&!this.session)eligibility="BLOCKED BY POSITION";else if(direction&&!this.directionAllowed(direction))eligibility="DIR FILTER";else if(eventType!=="NONE"&&!this.typeAllowed(eventType))eligibility="TYPE FILTER";else if(eventType==="NONE"||!raw.qualified||raw.projected)eligibility="NOT CONFIRMED";else if(this.config.minimumRank>0&&(raw.rankValue==null||n(raw.rankValue)<this.config.minimumRank))eligibility=`RANK < ${this.config.minimumRank}`;
        return {...clone(raw),source,eventType,direction,phase,rank:raw.rank||null,rankValue:raw.rankValue==null?null:n(raw.rankValue),stale,selected:source===this.config.source,eligibility};});
    }
    async refreshPreviewSettings(){const symbol=this.gateway.symbol(),results=await Promise.allSettled([this.gateway.filters(symbol),this.gateway.commissionRate(symbol)]),settings=results[0].status==="fulfilled"?results[0].value:null,commission=results[1].status==="fulfilled"?results[1].value:null;if(settings&&settings.status!=="error")this.filters=normalizedFilters(settings);if(commission)this.rates=calc.feeRates({makerCommissionRate:n(commission.makerCommissionRate),takerCommissionRate:n(commission.takerCommissionRate)});this.marketSymbol=symbol;}
    async initialize(){
      if(!this.gateway)throw new Error("Canonical Binance trading gateway unavailable");const hub=window.PUBLIC_MARKET_DATA_HUB;
      if(hub&&hub.setTimeframeRequirements)hub.setTimeframeRequirements(C.consumerId,C.timeframes.map(tf=>({tf,count:C.signal.minimumRows})));
      if(hub&&hub.ensureTimeframeBuffer)await Promise.all(C.timeframes.map(tf=>hub.ensureTimeframeBuffer(tf,C.signal.minimumRows).catch(()=>null)));
      if(hub&&hub.subscribe)this.unsubHub=hub.subscribe(event=>this.onMarket(event));
      if(this.useGlobalPrivateEvents){window.addEventListener("bt001:binance-order-update",this._orderListener=event=>this.onOrder(event.detail));window.addEventListener("v13:open-position-change",this._positionListener=event=>this.onPosition(event.detail));window.addEventListener("bt001:binance-private-status",this._privateStatusListener=event=>this.onPrivateStatus(event.detail));}
      this.lastPrivateStatus=upper(this.gateway.connection()&&this.gateway.connection().streamStatus);
      C.timeframes.forEach(tf=>this.acceptDetection(tf,this.detector.evaluateTf(tf,null,this.now()),false));
      const p=window.PUBLIC_MARKET_DATA_HUB&&window.PUBLIC_MARKET_DATA_HUB.getLatestPrice&&window.PUBLIC_MARKET_DATA_HUB.getLatestPrice();if(p&&p.price)this.guide=p.price;
      await this.refreshPreviewSettings().catch(()=>null);
      await this.recover();this.emit("initialized");return this;
    }
    destroy(){if(this.unsubHub)this.unsubHub();const hub=window.PUBLIC_MARKET_DATA_HUB;if(hub&&hub.setTimeframeRequirements)hub.setTimeframeRequirements(C.consumerId,[]);if(this.useGlobalPrivateEvents){window.removeEventListener("bt001:binance-order-update",this._orderListener);window.removeEventListener("v13:open-position-change",this._positionListener);window.removeEventListener("bt001:binance-private-status",this._privateStatusListener);}if(this.cooloffTimer)clearTimeout(this.cooloffTimer);}
    updateConfig(patch){
      const locked=this.configurationLocked(),protectedKeys=["direction","source","entryType","minimumRank","mode","lot","target","tpDelta","tpDriver","stop","slDelta","slDriver","cooloffMinutes"],next={...patch};["autoEntryEnabled","autoTradingEnabled"].forEach(key=>delete next[key]);if(Object.prototype.hasOwnProperty.call(next,"minimumRank"))next.minimumRank=Math.round(Math.max(0,Math.min(100,n(next.minimumRank)??0)));if(locked)protectedKeys.forEach(key=>delete next[key]);
      this.config={...this.config,...next};this.saveConfig();if(this.state==="ARMED"&&protectedKeys.some(key=>Object.prototype.hasOwnProperty.call(next,key)))this.rebase("configuration changed");
      this.emit("configuration");return this.config;
    }
    rebase(reason){this.generation+=1;this.armedAt=this.now();this.baseline.clear();this.seen.clear();this.rankRejected.clear();const latest=this.displayDetection(this.config.source);if(latest)this.baseline.add(latest.freshnessKey||latest.eventId);this.status=`ARMED · waiting for a new event (${reason})`;this.log("rebase",{reason,generation:this.generation});}
    sourceReady(){const hub=window.PUBLIC_MARKET_DATA_HUB,periods=root.detectorTools&&root.detectorTools.fixedPeriods?root.detectorTools.fixedPeriods():[C.signal.emaFast,C.signal.emaSlow,C.signal.emaFast,C.signal.emaSlow,C.signal.emaFast],snap=hub&&hub.getAuthoritativeMaSnapshot&&hub.getAuthoritativeMaSnapshot(this.config.source,{includeForming:true,periods,requiredRows:C.signal.minimumRows});return !!(snap&&snap.reliable);}
    async arm(){
      if(this.state!=="OFF"&&this.state!=="ERROR")return {ok:false,errors:[`Cannot arm from ${this.state}`]};
      if(this.session)return {ok:false,errors:["Existing SCALP execution must be reconciled before arming"]};
      const existing=this.position();if(existing){this.setExternalPosition(existing);this.emit("arm-blocked-existing-position");return {ok:false,errors:[this.externalPositionText(existing)]};}this.setExternalPosition(null);
      const connection=this.gateway.connection(),streamHealthy=connection&&upper(connection.streamStatus)==="LIVE",symbol=this.gateway.symbol(),rawSettings=await this.gateway.filters(symbol),filtersReady=rawSettings&&rawSettings.status!=="error"&&n(rawSettings.tickSize)>0&&n(rawSettings.stepSize)>0,settings=normalizedFilters(rawSettings);this.filters=settings;
      let balance=null;try{balance=await this.gateway.balance();}catch(_e){}const orders=snapshotOrders(await this.gateway.orders({reason:"scalp-arm",maxAgeMs:0})).filter(isOwned),position=this.position();
      if(position){this.setExternalPosition(position);this.emit("arm-blocked-position-race");return {ok:false,errors:[this.externalPositionText(position)]};}
      const validation=calc.validateArm({config:this.config,filters:settings,guide:this.guide,balance,symbol,authenticated:this.gateway.isAuthenticated(),streamHealthy,sourceReady:this.sourceReady(),filtersReady,position,ownedOrders:orders});
      if(!validation.ok){this.status=validation.errors.join("; ");this.emit("arm-refused");return validation;}
      if(this.state==="ERROR")this.transition("OFF","Previous error acknowledged");this.cooloffAfterFlat=this.config.mode==="CONTINUOUS";this.transition("ARMED","ARMED · waiting for a new qualifying event");this.rebase("armed");
      this.logActivity("ARMED",{sourceTimeframe:this.config.source});return validation;
    }
    autoConcurrentAutoCount(){return this.session&&this.session.autoEntered?1:0;}
    estimateRealizedPnl(session,reason){
      // Estimate only, for the daily auto-loss cap and decision log -- NOT used by any exit or
      // SL/TP logic. Exact realized fees/slippage on the exit leg are not tracked by this engine,
      // so TP/SL exits use the already-known protection price and other exits fall back to the
      // last observed guide price.
      const dir=upper(session&&session.direction),entry=n(session&&session.avgEntry),qty=n(session&&session.liveQty)||n(session&&session.filledQty);
      if(!["LONG","SHORT"].includes(dir)||!(entry>0)||!(qty>0))return null;
      const exit=reason==="TP"?n(session.tpPrice):reason==="SL"?n(session.slPrice):n(this.guide);
      if(!(exit>0))return null;
      const side=dir==="LONG"?1:-1,gross=(exit-entry)*qty*side,exitFeeRate=reason==="TP"?(this.rates.conservativeTp||this.rates.taker):this.rates.taker,fees=(n(session.entryCommission)||0)+exit*qty*exitFeeRate;
      return gross-fees;
    }
    applyAutoLoss(lossUsd){
      const today=new Date(this.now()).toISOString().slice(0,10);
      if(this.autoLossState.day!==today)this.autoLossState={day:today,accumulatedUsd:0};
      this.autoLossState.accumulatedUsd+=Math.max(0,n(lossUsd)||0);this.saveAutoLossState();
      const cap=n(this.config.maxDailyAutoLossUsd);
      if(cap>0&&this.autoLossState.accumulatedUsd>=cap){
        const reason=`Daily loss cap of $${cap.toFixed(2)} reached (realized $${this.autoLossState.accumulatedUsd.toFixed(2)} today)`;
        this.log("daily-loss-cap-breached",{reason,accumulatedUsd:this.autoLossState.accumulatedUsd});
        this.logActivity("DAILY_LOSS_CAP_BREACHED",{positionState:{reason,accumulatedUsd:this.autoLossState.accumulatedUsd,capUsd:cap}});
        if(this.state==="ARMED"||this.state==="COOL_OFF"||this.isActive())this.disarm();
        else this.emit("daily-loss-cap-breached");
      }
    }
    recordPositionClosed(session,reason){
      const pnl=this.estimateRealizedPnl(session,reason);
      if(pnl!=null&&pnl<0)this.applyAutoLoss(-pnl);
      this.logActivity("POSITION_CLOSED",{sourceTimeframe:session.source,detectorState:{reason},cascadeAgreement:session.cascadeAgreementAtEntry||null,positionState:{...session,estimatedRealizedPnlUsd:pnl}});
      this.recordTradeLedger(session,reason,pnl);
    }
    recordTradeLedger(session,reason,pnl){
      // PART 2: scalp_trades -- one row per completed trade SCALP itself placed.
      // estimated_realized_pnl_usd reuses estimateRealizedPnl() and carries the same caveat as the daily loss
      // cap above: exact realized fees/slippage on the exit leg are not tracked by this engine, so
      // this is an ESTIMATE, not an authoritative fill-derived P&L.
      if(typeof window==="undefined"||!window.BT001Supabase||typeof window.BT001Supabase.log!=="function")return;
      const exitPrice=reason==="TP"?n(session.tpPrice):reason==="SL"?n(session.slPrice):n(this.guide);
      const row={
        created_at:new Date(n(session.createdAt)||this.now()).toISOString(),closed_at:new Date(this.now()).toISOString(),
        symbol:session.symbol||this.marketSymbol||null,direction:session.direction||null,mode:session.mode||null,source_timeframe:session.source||null,event_type:session.eventType||null,
        auto_entered:session.autoEntered===true,cascade_agreement_at_entry:clone(session.cascadeAgreementAtEntry||null),
        requested_qty:n(session.requestedQty),filled_qty:n(session.filledQty)??n(session.liveQty),
        avg_entry_price:n(session.avgEntry),entry_commission:n(session.entryCommission),
        exit_reason:reason||null,exit_price:exitPrice,estimated_realized_pnl_usd:pnl,
        raw_session:clone(session),
        device_id:typeof window.BT001Supabase.getDeviceId==="function"?window.BT001Supabase.getDeviceId():null
      };
      try{window.BT001Supabase.log("scalp_trades",row).catch(()=>{});}catch(_e){}
    }
    logActivity(action,detail={}){
      // Fire-and-forget activity logging (PART 4). Never awaited by callers and never allowed to
      // affect engine state -- a missing/misconfigured Supabase credential, or a network failure
      // (buffered/retried inside services/supabase.service.js), must not change trading behaviour.
      if(typeof window==="undefined"||!window.BT001Supabase||typeof window.BT001Supabase.log!=="function")return;
      const row={
        created_at:new Date(this.now()).toISOString(),
        symbol:this.marketSymbol||(this.gateway&&typeof this.gateway.symbol==="function"?this.gateway.symbol():null)||null,
        action,source_timeframe:detail.sourceTimeframe??null,auto_entered:false,
        detector_state:clone(detail.detectorState??null),cascade_agreement:clone(detail.cascadeAgreement??null),position_state:clone(detail.positionState??null),
        device_id:typeof window.BT001Supabase.getDeviceId==="function"?window.BT001Supabase.getDeviceId():null
      };
      try{window.BT001Supabase.log("scalp_activity_log",row).catch(()=>{});}catch(_e){}
    }
    dailyLossSnapshot(){
      const cap=n(this.config.maxDailyAutoLossUsd),accumulatedUsd=this.autoLossState.accumulatedUsd;
      return {day:this.autoLossState.day,accumulatedUsd,capUsd:cap,breached:cap>0&&accumulatedUsd>=cap};
    }
    disarm(){this.cooloffAfterFlat=false;if(this.state==="ARMED"||this.state==="COOL_OFF"){if(this.cooloffTimer)clearTimeout(this.cooloffTimer);this.logActivity("DISARMED",{sourceTimeframe:this.config.source});this.transition("OFF","Disarmed");}else if(this.isActive()){this.status="ACTIVE · future entries disabled; TP/SL retained";this.emit("disarmed-active");}return this.snapshot();}
    onMarket(update){if(update&&update.type==="price"&&n(update.price)>0){this.guide=n(update.price);const symbol=upper(update.symbol);if(symbol&&symbol!==upper(this.marketSymbol)){this.marketSymbol=symbol;this.rebaselineMarketDetections("symbol-change");this.refreshPreviewSettings().then(()=>this.emit("preview-settings")).catch(()=>null);}}if(update&&update.tf&&C.timeframes.includes(update.tf)){const result=this.detector.evaluateTf(update.tf,update,this.now());this.acceptDetection(update.tf,result);}this.emit("market");}
    onPrivateStatus(detail){
      const next=upper(detail&&detail.streamStatus),previous=this.lastPrivateStatus;this.lastPrivateStatus=next;
      if(next!=="LIVE"){if(this.state==="ARMED"||this.state==="COOL_OFF"){if(this.cooloffTimer)clearTimeout(this.cooloffTimer);this.cooloffTimer=null;this.transition("OFF","OFF · private stream disconnected; ARM was not retained");}else if(this.session){this.status=`${this.state} · private stream ${next.toLowerCase()}; exchange protection retained`;this.emit("private-stream-interrupted");}return;}
      if(previous&&previous!=="LIVE"){this.rebaselineMarketDetections("private-stream-reconnect");this.reconcileAfterReconnect().catch(error=>this.fail(error,"Reconnect reconciliation failed"));}
    }
    async reconcileAfterReconnect(){
      if(this.reconnectBusy)return;this.reconnectBusy=true;try{const facts=await this.gateway.reconcile(),live=this.position(),orders=snapshotOrders(facts&&facts.orders),owned=orders.filter(isOwned);
        if(!this.session){if(owned.length){if(this.state!=="ERROR")this.transition("ERROR","ERROR · reconnect found unresolved SCALP-owned orders");return;}this.setExternalPosition(live);if(this.state!=="OFF"&&C.transitions[this.state]&&C.transitions[this.state].includes("OFF"))this.transition("OFF",this.externalPositionText(live));else this.emit("reconnect-unrelated-position");return;}
        if(!live){if(this.isActive())await this.finishExit("reconnect-flat");else{await this.cancelOwned();this.clearSession();if(this.state!=="OFF"&&C.transitions[this.state]&&C.transitions[this.state].includes("OFF"))this.transition("OFF","OFF · reconnect confirmed flat");}return;}
        if(live.side!==this.session.direction||this.session.liveQty&&Math.abs(n(live.qty)-n(this.session.liveQty))>1e-10){if(this.state!=="POSITION_MISMATCH")this.transition("POSITION_MISMATCH","POSITION MISMATCH · reconnect size or side differs");return;}
        this.session.liveQty=n(live.qty);this.session.avgEntry=n(live.avg)||this.session.avgEntry;this.persistSession();const ids=new Set(owned.map(orderClient)),hasSl=ids.has(this.session.slClientId),hasTp=ids.has(this.session.tpClientId);
        if(hasSl&&hasTp){if(["ENTRY_SUBMITTED","ENTRY_PARTIAL"].includes(this.state))this.applyLiveFill(live);if(this.state==="ERROR")this.transition("ENTRY_FILLED","Reconnect recovered filled entry");if(this.state==="ENTRY_FILLED")this.transition("PROTECTION_SUBMITTING","Reconnect confirmed existing protection");if(this.state!=="ACTIVE"&&C.transitions[this.state]&&C.transitions[this.state].includes("ACTIVE"))this.transition("ACTIVE",`ACTIVE · ${this.session.direction} · reconnected`);else{this.status=`ACTIVE · ${this.session.direction} · reconnected`;this.emit("reconnected");}return;}
        if(this.state==="ERROR")this.transition("ENTRY_FILLED","Reconnect recovered live entry; rebuilding protection");else if(["ENTRY_SUBMITTED","ENTRY_PARTIAL"].includes(this.state))this.applyLiveFill(live);else if(this.state!=="ACTIVE"&&this.state!=="ENTRY_FILLED"&&this.state!=="PROTECTION_SUBMITTING"){this.transition("POSITION_MISMATCH","POSITION MISMATCH · cannot safely rebuild protection from current state");return;}
        await this.cancelOwned();this.session.slOrderId=null;this.session.tpOrderId=null;await this.ensureProtection(this.state==="ACTIVE");
      }finally{this.reconnectBusy=false;}
    }
    recordCascade(source,event){
      if(!event||!["LONG","SHORT"].includes(upper(event.direction)))return;
      this.cascadeByTf.set(source,{timeframe:source,direction:upper(event.direction),eventType:event.eventType||null,at:n(event.publishedAt)||this.now(),candleTime:n(event.candleTime),rankValue:event.rankValue==null?null:n(event.rankValue),rank:event.rank||null});
    }
    cascadeState(){return [...this.cascadeByTf.values()].map(record=>({...record}));}
    cascadeAgreement(direction){
      const side=upper(direction),agreeing=[...this.cascadeByTf.values()].filter(record=>record.direction===side);
      return {direction:side,count:agreeing.length,timeframes:agreeing.map(record=>record.timeframe),records:agreeing.map(record=>({...record}))};
    }
    acceptDetection(source,result,notify=true){
      if(!result)return;const event=result.event||result.detection||{source,eventType:"NONE",direction:null,eventState:"NONE",qualified:false,projected:false,publishedAt:this.now(),status:result.status},emitted=result.emittedEvent||(result.event&&result.event.qualified&&!result.event.projected?result.event:null);this.latestBySource.set(source,{...event,source,status:result.status});if(emitted&&emitted.qualified&&!emitted.projected)this.lastQualifiedBySource.set(source,{...emitted,source,status:result.status});
      // Cascade tracking is a booster/informational signal only (see cascadeState()/cascadeAgreement()):
      // it is recorded for every watched timeframe here, never gated on this.config.source or this.state,
      // so it can never block or delay an entry on a faster timeframe. Each qualifying cross/bounce simply
      // replaces the prior record for that same timeframe -- which is also how expiry works: a record is
      // only ever overwritten (invalidated) by a new qualifying event on that SAME timeframe (an opposite
      // cross changes its direction; a same-direction cross/bounce just refreshes it), never by another
      // timeframe and never by a timer/staleness check.
      if(emitted&&emitted.qualified&&!emitted.projected){this.recordCascade(source,emitted);this.logActivity("DETECTION_QUALIFIED",{sourceTimeframe:source,detectorState:emitted,cascadeAgreement:this.cascadeAgreement(emitted.direction)});}
      if(this.session&&result.oppositeCross&&result.oppositeCross.direction&&result.oppositeCross.direction!==this.session.direction&&source===this.session.source)this.requestExit("OPPOSITE_CROSS",result.oppositeCross).catch(error=>this.fail(error,"Opposite-cross exit failed"));
      if(source===this.config.source&&this.state==="ARMED"&&emitted)this.considerEntry(emitted);
      this.status=this.state==="ARMED"?(event&&event.direction&&!this.directionAllowed(event.direction)?`ARMED · ${event.direction} ${event.eventType||"event"} ignored by DIR ${this.config.direction}`:`ARMED · ${result.status}`):this.status;if(notify)this.emit("signal");
    }
    directionAllowed(direction){return this.config.direction==="ANY"||this.config.direction===upper(direction);}
    typeAllowed(type){return this.config.entryType==="ANY"||this.config.entryType===upper(type);}
    considerEntry(event){
      const freshKey=event.freshnessKey||event.eventId;if(!event.qualified||event.projected||!this.directionAllowed(event.direction)||!this.typeAllowed(event.eventType)||this.baseline.has(freshKey)||this.seen.has(freshKey)||n(event.publishedAt)<this.armedAt)return false;
      const threshold=n(this.config.minimumRank)||0,rank=event.rankValue==null?null:n(event.rankValue);if(threshold>0&&(rank==null||rank<threshold)){
        this.seen.add(freshKey);this.rankRejected.add(freshKey);this.log("rank-rejected",{freshnessKey:freshKey,rankValue:rank,minimumRank:threshold});this.status=`ARMED · event rank ${rank==null?"unavailable":rank} below ${threshold}`;
        this.logActivity("RANK_REJECTED",{sourceTimeframe:event.source,detectorState:event,cascadeAgreement:this.cascadeAgreement(event.direction)});
        return false;
      }
      const cascadeAgreement=this.cascadeAgreement(event.direction);
      this.seen.add(freshKey);
      this.executeEntry(event)
        .then(()=>this.logActivity("ENTRY_SUBMITTED",{sourceTimeframe:event.source,detectorState:event,cascadeAgreement,positionState:this.session?clone(this.session):null}))
        .catch(error=>{this.logActivity("ENTRY_FAILED",{sourceTimeframe:event.source,detectorState:event,cascadeAgreement,positionState:{error:error&&error.message||String(error)}});this.fail(error,"Entry failed");});
      return true;
    }
    orderParams(side,qty,extra={}){const params={symbol:this.gateway.symbol(),side,type:extra.type||"MARKET",quantity:String(qty),newClientOrderId:extra.clientId};if(this.filters&&this.filters.positionMode==="HEDGE")params.positionSide=extra.positionSide|| (side==="BUY"?"LONG":"SHORT");else if(extra.reduceOnly)params.reduceOnly="true";return {...params,...extra.params};}
    async executeEntry(event){
      if(this.executionLock||this.state!=="ARMED")return;this.executionLock=event.eventId;this.transition("ENTRY_LOCKED",`ENTRY · ${event.direction} ${event.eventType}`);const qty=calc.normalizeLot(this.config.lot,this.filters),generation=this.generation,entryId=clientId("E",event.eventId,generation);
      this.fillIds.clear();this.session={symbol:this.gateway.symbol(),quoteAsset:quoteAsset(this.gateway.symbol()),direction:event.direction,source:event.source,eventId:event.eventId,eventType:event.eventType,generation,entryClientId:entryId,tpClientId:clientId("T",event.eventId,generation),slClientId:clientId("S",event.eventId,generation),exitClientId:clientId("X",event.eventId,generation),requestedQty:qty,filledQty:0,avgEntry:0,entryCommission:0,entryCommissionActual:false,entryCommissionFills:[],fundingCost:0,fundingStatus:"no-known-settlement",mode:this.config.mode,target:n(this.config.target),stop:n(this.config.stop),createdAt:this.now(),autoEntered:false,cascadeAgreementAtEntry:this.cascadeAgreement(event.direction)};this.persistSession();
      this.transition("ENTRY_SUBMITTED","ENTRY · Market submitted");const side=event.direction==="LONG"?"BUY":"SELL";
      try{const response=await this.gateway.submitOrder({...this.orderParams(side,qty,{clientId:entryId}),newOrderRespType:"RESULT"});this.session.entryOrderId=response&&response.orderId||null;this.persistSession();}
      catch(error){if(error&&error.uncertain){this.status="ENTRY · outcome uncertain; reconciling by client order ID";this.emit("entry-uncertain");this.reconcileUncertainEntry(entryId,0).catch(next=>this.fail(next,"Entry reconciliation failed"));return;}else throw error;}
      await sleep(C.order.reconcileDelayMs);const live=this.position();if(live&&live.side===event.direction){this.applyLiveFill(live);await this.ensureProtection();}
    }
    async queryEntry(id){try{const order=await this.gateway.queryOrder({symbol:this.gateway.symbol(),origClientOrderId:id});if(order){this.session.entryOrderId=order.orderId||null;this.persistSession();return order;}}catch(_e){}return null;}
    async reconcileUncertainEntry(id,attempt){
      if(!this.session||this.session.entryClientId!==id)return;await sleep([300,700,1500,3000][attempt]||3000);const found=await this.queryEntry(id),live=this.position();
      if(live&&live.side===this.session.direction){this.applyLiveFill(live);await this.ensureProtection();return;}if(found){this.status="ENTRY · confirmed; awaiting authoritative fill";this.emit("entry-confirmed");return;}
      if(attempt<3){this.reconcileUncertainEntry(id,attempt+1);return;}this.fail(new Error("Entry outcome remains ambiguous after reconciliation"),"Entry uncertain");
    }
    onOrder(detail){
      const o=detail&&detail.order||detail&&detail.event&&detail.event.o||detail&&detail.o||{},id=orderClient(o);if(!id||!isOwned(o)||!this.session)return;
      const status=upper(o.X??o.status),executed=n(o.z??o.executedQty)||0,average=n(o.ap??o.avgPrice),commission=n(o.n??o.commission);
      if(id===this.session.entryClientId){if(executed>0){this.session.filledQty=Math.max(this.session.filledQty,executed);if(average>0)this.session.avgEntry=average;const actualChanged=commission!=null&&commission>=0?this.recordEntryCommission(o,status==="FILLED"):false;this.persistSession();if(status==="PARTIALLY_FILLED"&&this.state==="ENTRY_SUBMITTED")this.transition("ENTRY_PARTIAL","ENTRY · partial fill");if(actualChanged&&this.state==="ACTIVE")this.rebuildProtectionForActualCommission().catch(error=>this.fail(error,"Protection recalculation failed"));}if(status==="FILLED"){const live=this.position();if(live){this.applyLiveFill(live);this.ensureProtection().catch(error=>this.fail(error,"Protection failed"));}}}
      if((id===this.session.tpClientId||id===this.session.slClientId)&&status==="FILLED")this.finishExit(id===this.session.tpClientId?"TP":"SL").catch(error=>this.fail(error,"Exit reconciliation failed"));
    }
    recordEntryCommission(order,finalFill=false){
      const amount=n(order.n??order.commission),fillId=String(order.t??order.tradeId??`${order.L??order.lastFilledPrice}|${order.l??order.lastFilledQty}|${amount}`);if(amount==null||amount<0||this.fillIds.has(fillId))return false;this.fillIds.add(fillId);
      const asset=upper(order.N??order.commissionAsset),quote=upper(this.session.quoteAsset||quoteAsset(this.session.symbol)),fillQty=n(order.l??order.lastFilledQty)||0,fillPrice=n(order.L??order.lastFilledPrice)||n(order.ap??order.avgPrice)||n(this.session.avgEntry)||0,maker=typeof (order.m??order.maker)==="boolean"?!!(order.m??order.maker):null,sameQuote=!!asset&&asset===quote,conversionRaw=order.commissionQuoteAmount??order.quoteCommissionAmount,convertedQuote=conversionRaw==null?null:n(conversionRaw),estimatedQuote=fillPrice*fillQty*(maker===true?this.rates.maker:this.rates.taker),quoteAmount=sameQuote?amount:convertedQuote,record={fillId,amount,asset:asset||null,maker,fillQty,fillPrice,quoteAmount,conversionStatus:sameQuote?"quote-asset":convertedQuote!=null?"authoritative-conversion":"unavailable",estimatedQuote:quoteAmount!=null?quoteAmount:estimatedQuote};
      const fills=Array.isArray(this.session.entryCommissionFills)?this.session.entryCommissionFills:[];fills.push(record);this.session.entryCommissionFills=fills;const knownQuote=fills.reduce((sum,fill)=>sum+(fill.quoteAmount!=null?(n(fill.quoteAmount)||0):0),0),estimatedForeign=fills.reduce((sum,fill)=>sum+(fill.quoteAmount==null?(n(fill.estimatedQuote)||0):0),0),coveredQty=fills.reduce((sum,fill)=>sum+(n(fill.fillQty)||0),0),cumulativeQty=n(order.z??order.executedQty)||n(this.session.filledQty)||0,allAuthoritative=finalFill&&fills.length>0&&coveredQty+1e-12>=cumulativeQty&&fills.every(fill=>fill.quoteAmount!=null&&n(fill.quoteAmount)!=null),previousActual=this.session.entryCommissionActual===true,previous=n(this.session.entryCommission)||0;
      if(allAuthoritative){this.session.entryCommission=knownQuote;this.session.entryCommissionActual=true;this.session.commissionConversionStatus="authoritative";}else{const conservative=(n(this.session.avgEntry)||fillPrice)*(n(this.session.filledQty)||fillQty)*this.rates.taker;this.session.entryCommission=Math.max(conservative,knownQuote+estimatedForeign);this.session.entryCommissionActual=false;this.session.commissionConversionStatus=fills.some(fill=>fill.quoteAmount==null)?"foreign-asset-unavailable":"awaiting-final-fill";}
      return this.session.entryCommissionActual&&(!previousActual||Math.abs(previous-this.session.entryCommission)>1e-12);
    }
    onPosition(detail){
      const current=detail&&Object.prototype.hasOwnProperty.call(detail,"current")?detail.current:this.position();if(!this.session){if(current&&this.state==="ARMED")this.transition("OFF",this.externalPositionText(current));this.setExternalPosition(current);this.emit(current?"unrelated-position-detected":"unrelated-position-cleared");return;}
      if(current&&current.side===this.session.direction){if(this.state==="ENTRY_SUBMITTED"||this.state==="ENTRY_PARTIAL"||this.state==="ERROR"&&this.session.entryClientId){if(this.state==="ERROR")this.transition("ENTRY_FILLED","Late entry fill recovered; submitting protection");this.applyLiveFill(current);this.ensureProtection().catch(error=>this.fail(error,"Protection failed"));return;}if(this.state==="ACTIVE"&&Math.abs(n(current.qty)-n(this.session.liveQty))>1e-10){this.transition("POSITION_MISMATCH","POSITION MISMATCH · unexpected live size change");}}
      else if(!current&&this.isActive())this.finishExit("position-flat").catch(error=>this.fail(error,"Flat cleanup failed"));
      else if(current&&current.side!==this.session.direction)this.transition("POSITION_MISMATCH","POSITION MISMATCH · position side changed");
    }
    applyLiveFill(position){this.session.liveQty=n(position.qty);this.session.filledQty=Math.max(n(this.session.filledQty)||0,n(position.qty)||0);this.session.avgEntry=n(position.avg)||n(this.session.avgEntry)||0;if(!this.session.entryCommissionActual)this.session.entryCommission=Math.max(n(this.session.entryCommission)||0,this.session.avgEntry*this.session.liveQty*this.rates.taker);this.persistSession();if(this.state==="ENTRY_SUBMITTED"||this.state==="ENTRY_PARTIAL")this.transition("ENTRY_FILLED",`ENTRY FILLED · ${this.session.direction}`);}
    protectionPrices(){return calc.prices({direction:this.session.direction,entryPrice:this.session.avgEntry,qty:this.session.liveQty,entryCommission:this.session.entryCommission,target:this.session.target,stop:this.session.stop,makerRate:this.rates.maker,takerRate:this.rates.taker,conservativeTpRate:this.rates.conservativeTp,fundingCost:n(this.session.fundingCost)||0,tickSize:this.filters.tickSize});}
    async ensureProtection(recovery=false){
      if(!this.session||this.session.protectionBusy||["EXIT_LOCKED","EXITING","FLAT_RECONCILING"].includes(this.state)||this.state==="ACTIVE"&&!recovery)return;const live=this.position();if(!live)return;this.applyLiveFill(live);this.session.protectionBusy=true;this.persistSession();if(this.state==="ENTRY_FILLED"||this.state==="ACTIVE")this.transition("PROTECTION_SUBMITTING",recovery?"Rebuilding recovered protection":"Submitting exchange-side SL");const outcome=this.protectionPrices(),exitSide=this.session.direction==="LONG"?"SELL":"BUY";
      let sl=null,slError=null;for(let attempt=0;attempt<=C.order.protectionRetry;attempt++){try{const params={algoType:"CONDITIONAL",symbol:this.gateway.symbol(),side:exitSide,type:"STOP_MARKET",quantity:String(this.session.liveQty),triggerPrice:String(outcome.sl),workingType:"MARK_PRICE",clientAlgoId:this.session.slClientId};if(this.filters.positionMode==="HEDGE")params.positionSide=this.session.direction;else params.reduceOnly="true";sl=await this.gateway.submitAlgoOrder(params);break;}catch(error){slError=error;await this.gateway.reconcile().catch(()=>null);}}
      if(!sl){this.session.protectionBusy=false;this.persistSession();await this.requestExit("SL_PROTECTION_FAILED",null,{critical:true});throw new Error(`Protective SL failed: ${slError&&slError.message||"unconfirmed"}`);}
      this.session.slOrderId=sl.algoId??sl.orderId??null;this.session.slPrice=outcome.sl;this.persistSession();let tp=null,tpError=null;
      for(let attempt=0;attempt<=C.order.tpRetry;attempt++){try{tp=await this.gateway.submitOrder(this.orderParams(exitSide,this.session.liveQty,{type:"LIMIT",clientId:this.session.tpClientId,reduceOnly:true,positionSide:this.session.direction,params:{price:String(outcome.tp),timeInForce:"GTC"}}));break;}catch(error){tpError=error;await this.gateway.orders({reason:"scalp-tp-retry",maxAgeMs:0}).catch(()=>null);}}
      this.session.protectionBusy=false;this.session.tpPrice=outcome.tp;if(tp)this.session.tpOrderId=tp.orderId||null;this.persistSession();if(!tp){this.status=`ERROR · SL active, TP unconfirmed: ${tpError&&tpError.message||"submission failed"}`;this.emit("tp-error");return;}
      this.transition("ACTIVE",`ACTIVE · ${this.session.direction}`);this.executionLock=null;
    }
    async rebuildProtectionForActualCommission(){
      if(!this.session||this.state!=="ACTIVE"||this.session.actualCommissionRebuild)return;this.session.actualCommissionRebuild=true;const old={tpOrderId:this.session.tpOrderId,tpClientId:this.session.tpClientId,slOrderId:this.session.slOrderId,slClientId:this.session.slClientId},revision=(n(this.session.protectionRevision)||0)+1;this.session.protectionRevision=revision;this.session.tpClientId=clientId("T",this.session.eventId,`${this.session.generation}R${revision}`);this.session.slClientId=clientId("S",this.session.eventId,`${this.session.generation}R${revision}`);this.session.tpOrderId=null;this.session.slOrderId=null;this.persistSession();
      try{await this.ensureProtection(true);}finally{const symbol=this.gateway.symbol();await Promise.all([this.gateway.cancelOrder({symbol,...(old.tpOrderId?{orderId:old.tpOrderId}:{origClientOrderId:old.tpClientId})}).catch(()=>null),this.gateway.cancelAlgoOrder({symbol,...(old.slOrderId?{algoId:old.slOrderId}:{clientAlgoId:old.slClientId})}).catch(()=>null)]);if(this.session){this.session.actualCommissionRebuild=false;this.persistSession();}}
    }
    async cancelOwned(){
      if(!this.session)return;const symbol=this.gateway.symbol(),jobs=[];
      if(this.session.tpOrderId||this.session.tpClientId)jobs.push(this.gateway.cancelOrder({symbol,...(this.session.tpOrderId?{orderId:this.session.tpOrderId}:{origClientOrderId:this.session.tpClientId})}).catch(()=>null));
      if(this.session.slOrderId||this.session.slClientId)jobs.push(this.gateway.cancelAlgoOrder({symbol,...(this.session.slOrderId?{algoId:this.session.slOrderId}:{clientAlgoId:this.session.slClientId})}).catch(()=>null));await Promise.all(jobs);
    }
    async requestExit(reason,event=null,options={}){
      if(this.exitLock||!this.session)return;this.exitLock=reason;if(this.state==="ACTIVE"||this.state==="PROTECTION_SUBMITTING")this.transition("EXIT_LOCKED",`EXIT · ${reason}`);else if(!["EXIT_LOCKED","EXITING"].includes(this.state))return;
      await this.cancelOwned();const reconciled=await this.gateway.reconcile().catch(()=>null),live=this.position();if(!live){await this.finishExit(reason);return;}this.transition("EXITING",`EXITING · ${reason}`);const qty=calc.normalizeLot(live.qty,this.filters),side=live.side==="LONG"?"SELL":"BUY";
      try{await this.gateway.submitOrder(this.orderParams(side,qty,{clientId:this.session.exitClientId,reduceOnly:true,positionSide:live.side}));}
      catch(error){if(error&&error.uncertain){let found=null;try{found=await this.gateway.queryOrder({symbol:this.gateway.symbol(),origClientOrderId:this.session.exitClientId});}catch(_e){}if(!found)throw error;}else throw error;}
      await sleep(C.order.reconcileDelayMs);await this.gateway.refreshPosition().catch(()=>null);if(!this.position())await this.finishExit(reason);else{this.status=options.critical?"ERROR · protection failed and emergency close is not yet confirmed":`EXITING · ${reason}`;this.emit("exit-pending");}
    }
    async finishExit(reason){
      if(!this.session)return;if(this.position()){this.status=`EXITING · ${reason}; remaining position detected`;this.emit("not-flat");return;}if(this.state!=="FLAT_RECONCILING")this.transition("FLAT_RECONCILING",`FLAT · cleaning SCALP orders`);await this.cancelOwned();const finished=this.session;this.recordPositionClosed(finished,reason);const continuous=finished.mode==="CONTINUOUS"&&this.cooloffAfterFlat!==false;this.clearSession();this.executionLock=null;this.exitLock=null;
      if(continuous){this.transition("COOL_OFF",`COOL-OFF · ${this.config.cooloffMinutes}m`);const delay=Math.max(0,n(this.config.cooloffMinutes)||0)*60000;this.cooloffTimer=setTimeout(()=>{this.cooloffTimer=null;this.transition("OFF","OFF · cool-off complete; manual ARM required");},delay);}else this.transition("OFF",`OFF · ${reason}`);
    }
    async closeNow(){if(!this.session)return;return this.requestExit("CLOSE_NOW");}
    fail(error,prefix){this.log("error",{message:error&&error.message||String(error)});this.executionLock=null;this.exitLock=null;if(this.state!=="ERROR"&&C.transitions[this.state]&&C.transitions[this.state].includes("ERROR"))this.transition("ERROR",`${prefix}: ${error&&error.message||error}`);else{this.status=`ERROR · ${prefix}`;this.emit("error");}}
    persistSession(){if(!this.session)return;try{const clean={...this.session};delete clean.protectionBusy;this.storage.setItem(C.sessionKey,JSON.stringify(clean));}catch(_e){}}
    clearSession(){this.session=null;this.fillIds.clear();try{this.storage.removeItem(C.sessionKey);}catch(_e){}}
    async recover(){
      let saved=null;try{saved=JSON.parse(this.storage.getItem(C.sessionKey)||"null");}catch(_e){}const reconciled=await this.gateway.reconcile().catch(()=>null),position=this.position(),orders=snapshotOrders(reconciled&&reconciled.orders||await this.gateway.orders({reason:"scalp-recovery",maxAgeMs:0}).catch(()=>null)),owned=orders.filter(isOwned);
      if(!position&&!owned.length){this.clearSession();this.setExternalPosition(null);return;}if(!saved){if(position&&!owned.length){this.clearSession();this.setExternalPosition(position);return;}this.transition("ERROR","ERROR · unresolved SCALP-owned orders require reconciliation");return;}
      const recognizable=position&&position.symbol===saved.symbol&&position.side===saved.direction,ownedIds=new Set(owned.map(orderClient)),ordersMatch=owned.every(row=>[saved.tpClientId,saved.slClientId,saved.entryClientId,saved.exitClientId].includes(orderClient(row)));
      if(!recognizable||!ordersMatch){this.session=saved;this.transition("POSITION_MISMATCH","POSITION MISMATCH · recovery facts are ambiguous");return;}
      this.session={fundingCost:0,fundingStatus:"no-known-settlement",entryCommissionFills:[],quoteAsset:quoteAsset(saved.symbol),...saved,autoEntered:saved.autoEntered===true,liveQty:n(position.qty),avgEntry:n(position.avg)||saved.avgEntry};this.fillIds=new Set(this.session.entryCommissionFills.map(fill=>String(fill.fillId)));this.filters=normalizedFilters(await this.gateway.filters(saved.symbol));this.persistSession();const hasSl=ownedIds.has(saved.slClientId),hasTp=ownedIds.has(saved.tpClientId);
      if(hasSl&&hasTp)this.transition("ACTIVE",`ACTIVE · ${saved.direction} · recovered`);else{this.transition("ACTIVE",`ACTIVE · ${saved.direction} · rebuilding protection`);await this.cancelOwned();this.session.slOrderId=null;this.session.tpOrderId=null;await this.ensureProtection(true);}
    }
    getDiagnostics(){return {snapshot:this.snapshot(),transitions:this.diagnostics.slice(),baseline:[...this.baseline],seen:[...this.seen],rankRejected:[...this.rankRejected],cascade:this.cascadeState(),feeAssumptions:{rates:{...this.rates},entry:"MARKET/taker",tp:"LIMIT/max(account maker,taker)",sl:"STOP_MARKET/taker trigger-fill estimate",fundingStatus:this.session&&this.session.fundingStatus||"no-known-settlement",commissionConversionStatus:this.session&&this.session.commissionConversionStatus||"estimated"},currentDetections:Object.fromEntries([...this.latestBySource].map(([source,value])=>[source,clone(value)])),lastQualified:Object.fromEntries([...this.lastQualifiedBySource].map(([source,value])=>[source,clone(value)])),detector:this.detector&&typeof this.detector.diagnostics==="function"?this.detector.diagnostics():null};}
  }
  root.ScalpEngine=ScalpEngine;root.stateTools=Object.freeze({clientId,isOwned,orderClient,snapshotOrders,normalizedFilters,quoteAsset});
})();
