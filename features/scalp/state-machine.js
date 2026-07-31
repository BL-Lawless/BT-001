(() => {
  "use strict";
  const root=window.__BT001_SCALP_BUILD__ ||= {},C=root.config,calc=root.calculations,tranches=root.tranches,decisions=root.exitDecisions,loggerCore=window.BT001_SCALP_LOGGER_CORE;
  if(!C||!calc||!tranches||!decisions||!loggerCore)throw new Error("SCALP dependencies must load before state machine");
  const n=calc.n,quoteAsset=calc.quoteAsset,upper=value=>String(value||"").toUpperCase(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
  const exchangeClock=()=>typeof window!=="undefined"&&window.BT001ExchangeClock||null;
  const exchangeNow=fallback=>{const clock=exchangeClock();try{return clock&&typeof clock.now==="function"?clock.now():fallback;}catch(_error){return fallback;}};
  const exchangeFromLocal=value=>{const clock=exchangeClock();try{return clock&&typeof clock.fromLocal==="function"?clock.fromLocal(value):value;}catch(_error){return value;}};
  function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36).toUpperCase();}
  function clientId(kind,eventId,generation){return `${C.order.namespace}-${kind}-${generation}-${hash(eventId)}`.slice(0,36);}
  function trancheId(direction,eventId,generation){return `${upper(direction).slice(0,1)}${Number(generation||0).toString(36).toUpperCase()}${hash(eventId)}`.slice(0,20);}
  function trancheClientId(kind,id){return `${C.order.namespace}-${kind}-${id}`.slice(0,36);}
  function filterValue(settings,type,key){const row=Array.isArray(settings&&settings.filters)?settings.filters.find(item=>item&&item.filterType===type):null;return n(row&&row[key]);}
  function normalizedFilters(settings={}){const lotStep=n(settings.stepSize)||filterValue(settings,"LOT_SIZE","stepSize")||0.001,marketStep=filterValue(settings,"MARKET_LOT_SIZE","stepSize")||lotStep,lotMin=filterValue(settings,"LOT_SIZE","minQty")||0,marketMin=filterValue(settings,"MARKET_LOT_SIZE","minQty")||0,maximums=[filterValue(settings,"LOT_SIZE","maxQty"),filterValue(settings,"MARKET_LOT_SIZE","maxQty")].filter(value=>value>0);return {...settings,tickSize:n(settings.tickSize)||filterValue(settings,"PRICE_FILTER","tickSize")||0.01,stepSize:Math.max(lotStep,marketStep),lotStepSize:lotStep,marketStepSize:marketStep,minQty:Math.max(lotMin,marketMin),maxQty:maximums.length?Math.min(...maximums):null,minNotional:filterValue(settings,"MIN_NOTIONAL","notional")||filterValue(settings,"NOTIONAL","minNotional")||0};}
  function orderClient(row){return String(row&&(row.clientOrderId??row.origClientOrderId??row.clientAlgoId??row.c??row.ca)||"");}
  function isOwned(row){return orderClient(row).startsWith(C.order.namespace+"-");}
  function snapshotOrders(value){const snap=value&&value.orders&&Array.isArray(value.orders)?value:value&&value.snapshot||value||{};return [...(Array.isArray(snap.orders)?snap.orders:[]),...(Array.isArray(snap.algoOrders)?snap.algoOrders:[])];}
  function orphanRole(row){
    const id=orderClient(row),match=id.match(new RegExp(`^${C.order.namespace}-([TS])-(.+)$`));if(!match)return null;
    const explicit=upper(row&&row.positionSide),side=upper(row&&row.side),direction=["LONG","SHORT"].includes(explicit)?explicit:side==="SELL"?"LONG":side==="BUY"?"SHORT":null;
    const original=n(row&&(row.origQty??row.quantity??row.q??row.qty)),executed=n(row&&(row.executedQty??row.z))||0,remaining=original==null?null:Math.max(0,original-executed);
    const level=n(row&&(match[1]==="T"?(row.price??row.p):(row.triggerPrice??row.stopPrice??row.activatePrice??row.sp)));
    return {id,kind:match[1]==="T"?"PARTIAL_TP":"PSL",suffix:match[2],direction,remaining,level,executed,orderId:row&&(row.orderId??null),algoId:row&&(row.algoId??null),createdAt:n(row&&(row.time??row.updateTime??row.createTime))};
  }
  class ScalpEngine extends EventTarget{
    constructor(options={}){
      super();this.gateway=options.gateway||window.BT001_BINANCE_TRADING;this.now=options.now||Date.now;this.storage=options.storage||localStorage;this.accountSlot=tranches.normalizeSlot(options.accountSlot||"main");this.trancheStorageKey=tranches.storageKey(C.trancheSessionKey,this.accountSlot);
      // Default true preserves existing behaviour exactly (the single global Binance private
      // stream feeds these events for the default/only account). Set false when this engine is
      // bound to a secondary-account gateway (features/scalp/secondary-gateway.module.js), which
      // instead feeds onOrder/onPosition/onPrivateStatus directly via its own independent stream --
      // otherwise a second engine would also react to the FIRST account's order/position events.
      this.useGlobalPrivateEvents=options.useGlobalPrivateEvents!==false;
      this.state="OFF";this.status="";this.generation=0;this.config=this.loadConfig();this.detectors=options.detector?{V1:options.detector,V2:options.detector}:{V1:new root.Detector(),V2:root.DetectorV2?new root.DetectorV2():new root.Detector()};this.detector=this.detectors[this.config.engineProfile];this.guide=null;this.rates=calc.feeRates();this.filters=null;this.marketSymbol=this.gateway&&this.gateway.symbol?this.gateway.symbol():null;this.book=this.loadTrancheBook();this.livePositions={LONG:null,SHORT:null};this.externalPosition=null;this.latestBySource=new Map();this.lastQualifiedBySource=new Map();this.baseline=new Set();this.seen=new Set();this.rankRejected=new Set();this.armedAt=0;this.unsubHub=null;this.diagnostics=[];this.fillIdsByTranche=new Map();this.lastPrivateStatus=null;this.reconnectBusy=false;this.reconcileQueued=false;this.initialized=false;this.initializing=false;
      this.cascadeByTf=new Map();this.autoLossState=this.loadAutoLossState();
      this.activityLogger=options.activityLogger||loggerCore.createLogger({
        getSupabase:()=>window.BT001Supabase||null,
        getSymbol:()=>this.marketSymbol||(this.gateway&&typeof this.gateway.symbol==="function"?this.gateway.symbol():null)||null,
        getSignalTable:()=>this.config.engineProfile==="V2"?"scalp_v2_signals":"scalp_v1_signals",
        now:()=>exchangeNow(this.now()),
        fromLocal:exchangeFromLocal
      });
    }
    loadConfig(){let saved={};try{saved=JSON.parse(this.storage.getItem(C.configKey)||"{}");}catch(_e){}["autoEntryEnabled","autoTradingEnabled","cooloffMinutes"].forEach(key=>delete saved[key]);const nonnegative=(value,fallback,decimals)=>n(value)!=null&&n(value)>=0?Number(value).toFixed(decimals):fallback,minimumRank=Math.round(Math.max(0,Math.min(100,n(saved.minimumRank)??C.defaults.minimumRank))),positiveInt=(value,fallback)=>n(value)!=null&&n(value)>=1?Math.round(n(value)):fallback,nonnegativeNumber=(value,fallback)=>n(value)!=null&&n(value)>=0?n(value):fallback,percentage=(value,fallback,max=100)=>Math.max(1,Math.min(max,n(value)??fallback));return {...C.defaults,...saved,engineProfile:["V1","V2"].includes(saved.engineProfile)?saved.engineProfile:C.defaults.engineProfile,direction:C.directions.includes(saved.direction)?saved.direction:C.defaults.direction,source:C.sources.includes(saved.source)?saved.source:C.defaults.source,entryType:C.entryTypes.includes(saved.entryType)?saved.entryType:C.defaults.entryType,minimumRank,mode:"CONTINUOUS",lot:nonnegative(saved.lot,C.defaults.lot,3),target:nonnegative(saved.target,C.defaults.target,1),tpDelta:nonnegative(saved.tpDelta,C.defaults.tpDelta,0),tpDriver:["NET_TARGET","TP_DELTA"].includes(saved.tpDriver)?saved.tpDriver:C.defaults.tpDriver,stop:nonnegative(saved.stop,C.defaults.stop,1),slDelta:nonnegative(saved.slDelta,C.defaults.slDelta,0),slDriver:["NET_SL","SL_DELTA"].includes(saved.slDriver)?saved.slDriver:C.defaults.slDriver,maxConcurrentAutoPositions:positiveInt(saved.maxConcurrentAutoPositions,C.defaults.maxConcurrentAutoPositions),maxDailyAutoLossUsd:nonnegativeNumber(saved.maxDailyAutoLossUsd,C.defaults.maxDailyAutoLossUsd),profitLockEnabled:saved.profitLockEnabled===true,lockThresholdPct:percentage(saved.lockThresholdPct,C.defaults.lockThresholdPct),lockPortionPct:percentage(saved.lockPortionPct,C.defaults.lockPortionPct,99),rankBoostEnabled:saved.rankBoostEnabled===true,rankBoostThreshold:Math.max(0,Math.min(100,n(saved.rankBoostThreshold)??C.defaults.rankBoostThreshold)),rankBoostPoints:nonnegativeNumber(saved.rankBoostPoints,C.defaults.rankBoostPoints)};}
    loadTrancheBook(){
      let saved=null;try{saved=JSON.parse(this.storage.getItem(this.trancheStorageKey)||"null");}catch(_e){}
      if(saved)return tranches.normalize(saved,{accountSlot:this.accountSlot,symbol:this.gateway&&this.gateway.symbol?this.gateway.symbol():null});
      const book=tranches.create({accountSlot:this.accountSlot,symbol:this.gateway&&this.gateway.symbol?this.gateway.symbol():null});let legacy=null;try{legacy=JSON.parse(this.storage.getItem(C.sessionKey)||"null");}catch(_e){}
      const direction=tranches.normalizeDirection(legacy&&legacy.direction),remainingQty=Math.max(0,n(legacy&&(legacy.liveQty??legacy.filledQty))||0);
      if(direction&&remainingQty>0){
        const id=trancheId(direction,legacy.eventId||legacy.entryClientId||"legacy",legacy.generation||0);
        tranches.add(book,{...clone(legacy),trancheId:id,direction,requestedQty:n(legacy.requestedQty??legacy.filledQty??remainingQty)||remainingQty,filledQty:n(legacy.filledQty)||remainingQty,remainingQty,entryPrice:n(legacy.entryPrice??legacy.avgEntry)||0,partialTpClientId:legacy.partialTpClientId||legacy.tpClientId,pslClientId:legacy.pslClientId||legacy.slClientId,partialTpOrderId:legacy.partialTpOrderId||legacy.tpOrderId,pslOrderId:legacy.pslOrderId||legacy.slOrderId,partialTpPrice:n(legacy.partialTpPrice??legacy.tpPrice),pslPrice:n(legacy.pslPrice??legacy.slPrice),status:"ACTIVE",migratedFromLegacySession:true});
        try{this.storage.setItem(this.trancheStorageKey,JSON.stringify(tranches.snapshot(book)));}catch(_e){}
      }
      return book;
    }
    persistTrancheBook(){try{this.storage.setItem(this.trancheStorageKey,JSON.stringify(tranches.snapshot(this.book)));}catch(_e){}}
    trancheCounts(){return tranches.counts(this.book);}
    trancheQuantities(){return {LONG:tranches.activeQuantity(this.book,"LONG"),SHORT:tranches.activeQuantity(this.book,"SHORT")};}
    canAddDirection(direction){return tranches.canAdd(this.book,direction,this.config.maxConcurrentAutoPositions);}
    saveConfig(){try{this.storage.setItem(C.configKey,JSON.stringify(this.config));}catch(_e){}}
    loadAutoLossState(){try{const saved=JSON.parse(this.storage.getItem(C.autoLossKey)||"null");if(saved&&typeof saved.day==="string")return {day:saved.day,accumulatedUsd:Math.max(0,n(saved.accumulatedUsd)||0)};}catch(_e){}return {day:null,accumulatedUsd:0};}
    saveAutoLossState(){try{this.storage.setItem(C.autoLossKey,JSON.stringify(this.autoLossState));}catch(_e){}}
    emit(reason="update"){const detail=this.snapshot();this.dispatchEvent(new CustomEvent("change",{detail:{...detail,reason}}));try{window.dispatchEvent(new CustomEvent("bt001:scalp-state",{detail:{...detail,reason}}));}catch(_e){}}
    previewDirection(){if(["LONG","SHORT"].includes(upper(this.config.direction)))return upper(this.config.direction);const latest=this.displayDetection(this.config.source);return latest&&["LONG","SHORT"].includes(upper(latest.direction))?upper(latest.direction):"ANY";}
    outcomePreview(){const outcome=calc.linkedPreview({direction:this.previewDirection(),guide:this.guide,qty:this.config.lot,target:this.config.target,stop:this.config.stop,tpDelta:this.config.tpDelta,slDelta:this.config.slDelta,tpDriver:this.config.tpDriver,slDriver:this.config.slDriver,rates:this.rates,filters:this.filters||{}});if(outcome.available){const patch={};if(this.config.tpDriver==="TP_DELTA")patch.target=calc.formatNumeric(outcome.target,1);else patch.tpDelta=calc.formatNumeric(outcome.tpDelta,0);if(this.config.slDriver==="SL_DELTA")patch.stop=calc.formatNumeric(outcome.stop,1);else patch.slDelta=calc.formatNumeric(outcome.slDelta,0);let changed=false;for(const [key,value] of Object.entries(patch))if(this.config[key]!==value){this.config[key]=value;changed=true;}if(changed)this.saveConfig();}return outcome;}
    snapshot(){const outcome=this.outcomePreview(),trancheCounts=this.trancheCounts(),trancheQuantities=this.trancheQuantities();return {state:this.state,status:this.status,generation:this.generation,initialized:this.initialized,initializing:this.initializing,config:{...this.config},guide:this.guide,rates:{...this.rates},filters:this.filters?{...this.filters}:null,latest:this.displayDetection(this.config.source),detections:this.detectionRows(),outcome,trancheBook:tranches.snapshot(this.book),trancheCounts,trancheQuantities,positions:clone(this.livePositions),externalPosition:this.externalPosition?clone(this.externalPosition):null,armBlockedByPosition:!!this.externalPosition,active:trancheCounts.LONG+trancheCounts.SHORT>0,armed:this.state==="ARMED",locked:this.configurationLocked(),cascade:this.cascadeState(),dailyLoss:this.dailyLossSnapshot()};}
    log(action,data={}){this.diagnostics.push({at:this.now(),state:this.state,action,...data});if(this.diagnostics.length>120)this.diagnostics.shift();}
    transition(next,reason){
      if(next===this.state){this.status=reason||this.status;this.emit(reason);return;}const allowed=C.transitions[this.state]||[];if(!allowed.includes(next))throw new Error(`Invalid SCALP transition ${this.state} -> ${next}`);
      this.log("transition",{from:this.state,to:next,reason});this.state=next;this.status=reason||next;this.emit(reason);
    }
    isActive(){const counts=this.trancheCounts();return counts.LONG+counts.SHORT>0;}
    configurationLocked(){return tranches.DIRECTIONS.some(direction=>tranches.directionBook(this.book,direction).executionLock);}
    positions(){return this.livePositions;}
    position(direction){const normalized=tranches.normalizeDirection(direction);return normalized?this.livePositions[normalized]:this.livePositions.LONG||this.livePositions.SHORT||null;}
    normalizePositionFacts(value){const source=value&&value.positions?value.positions:value||{},single=value&&value.position?value.position:source&&["LONG","SHORT"].includes(upper(source.side))?source:null,result={LONG:source.LONG||null,SHORT:source.SHORT||null};if(single)result[upper(single.side)]=single;return result;}
    applyPositionFacts(value){this.livePositions=this.normalizePositionFacts(value);return this.livePositions;}
    async readExchangeFacts(){const facts=await this.gateway.reconcile();this.applyPositionFacts(facts||{});return {...facts,positions:this.livePositions};}
    adoptOrphanedTranches(ownedOrders){
      if(this.isActive())return {ok:false,error:"Local tranche book is not empty"};
      const owned=Array.isArray(ownedOrders)?ownedOrders:[],groups=new Map(),candidates=[],tolerance=Math.max(1e-8,(n(this.filters&&this.filters.stepSize)||0)*1e-6);
      if(!owned.length)return {ok:false,error:"No SCALP-owned orders found"};
      for(const order of owned){
        const role=orphanRole(order);if(!role||!role.direction||!(role.remaining>0)||!(role.level>0))return {ok:false,error:`Unrecognized orphan order ${orderClient(order)||"(missing client ID)"}`};
        const key=`${role.direction}:${role.suffix}`,group=groups.get(key)||{direction:role.direction,suffix:role.suffix,orders:{},raw:{}};
        if(group.orders[role.kind])return {ok:false,error:`Duplicate ${role.kind} for orphan group ${key}`};
        group.orders[role.kind]=role;group.raw[role.kind]=clone(order);groups.set(key,group);
      }
      for(const group of groups.values()){
        const tp=group.orders.PARTIAL_TP,psl=group.orders.PSL;if(!tp||!psl)return {ok:false,error:`Incomplete TP/PSL orphan pair ${group.direction}:${group.suffix}`};
        if(Math.abs(tp.remaining-psl.remaining)>tolerance)return {ok:false,error:`Quantity mismatch in orphan pair ${group.direction}:${group.suffix}`};
        const live=this.position(group.direction);if(!live)return {ok:false,error:`No ${group.direction} exchange position for orphan pair ${group.suffix}`};
        candidates.push({group,qty:Math.min(tp.remaining,psl.remaining),live});
      }
      for(const direction of tranches.DIRECTIONS){
        const liveQty=n(this.position(direction)&&this.position(direction).qty)||0,pairedQty=candidates.filter(item=>item.group.direction===direction).reduce((sum,item)=>sum+item.qty,0);
        if(liveQty-pairedQty>tolerance)return {ok:false,error:this.unprotectedQuantityText(direction,liveQty-pairedQty)};
        if(pairedQty-liveQty>tolerance)return {ok:false,error:`SCALP ${direction} protection exceeds the exchange position by ${this.quantityText(pairedQty-liveQty)} -- manual attention required.`};
      }
      const adopted=[];
      for(const {group,qty,live} of candidates){
        const tp=group.orders.PARTIAL_TP,psl=group.orders.PSL,id=/^[LS][0-9A-Z]+$/i.test(group.suffix)&&group.suffix.length<=20?group.suffix:trancheId(group.direction,`orphan:${group.suffix}`,0),entryPrice=n(live.avg)||0;
        const tranche=tranches.add(this.book,{trancheId:id,symbol:this.gateway.symbol(),quoteAsset:quoteAsset(this.gateway.symbol()),direction:group.direction,source:this.config.source,eventId:`orphan:${group.suffix}`,eventType:"RECOVERY",generation:0,entryClientId:`${C.order.namespace}-E-${group.suffix}`.slice(0,36),partialTpClientId:tp.id,pslClientId:psl.id,exitClientId:`${C.order.namespace}-X-${group.suffix}`.slice(0,36),partialTpOrderId:tp.orderId,pslOrderId:psl.algoId??psl.orderId,requestedQty:qty,filledQty:qty,remainingQty:qty,entryPrice,entryCommission:entryPrice*qty*this.rates.taker,entryCommissionActual:false,entryCommissionFills:[],fundingCost:0,fundingStatus:"unknown-after-orphan-recovery",mode:this.config.mode,target:n(this.config.target),stop:n(this.config.stop),tpDelta:n(this.config.tpDelta),slDelta:n(this.config.slDelta),tpDriver:this.config.tpDriver,slDriver:this.config.slDriver,partialTpPrice:tp.level,pslPrice:psl.level,createdAt:Math.min(tp.createdAt||this.now(),psl.createdAt||this.now()),status:"ACTIVE",recoveredFromOrphanOrders:true,orphanOrderSnapshot:group.raw});
        adopted.push(tranche);
      }
      this.setExternalPosition(null);this.persistTrancheBook();for(const tranche of adopted)this.logActivity("TRANCHE_RECOVERED",{sourceTimeframe:tranche.source,positionState:{direction:tranche.direction,trancheId:tranche.trancheId,recoveredFromOrphanOrders:true,...clone(tranche)}});
      this.log("orphan-orders-adopted",{count:adopted.length,trancheIds:adopted.map(row=>row.trancheId)});return {ok:true,tranches:adopted};
    }
    externalPositionText(position){return position&&["LONG","SHORT"].includes(upper(position.side))?`UNTRACKED ${upper(position.side)} POSITION · reconciliation required`:"OFF";}
    setExternalPosition(position){this.externalPosition=position?{symbol:position.symbol||this.gateway.symbol(),side:upper(position.side),qty:n(position.qty),avg:n(position.avg)}:null;if(this.state==="OFF"&&!this.isActive())this.status=this.externalPositionText(this.externalPosition);}
    rebaselineMarketDetections(reason){if(this.detector&&typeof this.detector.reset==="function")this.detector.reset();for(const source of C.timeframes){this.latestBySource.delete(source);this.lastQualifiedBySource.delete(source);}this.baseline.clear();this.seen.clear();this.rankRejected.clear();this.log("detection-baseline-reset",{reason});}
    displayDetection(source,at=this.now()){
      const current=this.latestBySource.get(source)||null,eventType=upper(current&&current.eventType)||"NONE";
      if(current&&eventType!=="NONE")return current;
      const retained=this.lastQualifiedBySource.get(source)||null,publishedAt=n(retained&&retained.publishedAt)||0,staleMs=C.signal.staleMs[source]||120000;
      return retained&&publishedAt&&at-publishedAt<=staleMs?retained:current;
    }
    detectionRows(){
      const now=this.now();return C.sources.map(source=>{const raw=this.displayDetection(source,now)||{source,eventType:"NONE",eventState:"NONE",qualified:false,publishedAt:0},eventType=upper(raw.eventType)||"NONE",direction=["LONG","SHORT"].includes(upper(raw.direction))?upper(raw.direction):null,phase=upper(raw.eventState||raw.phase)||(eventType==="NONE"?"NONE":"—"),publishedAt=n(raw.publishedAt)||0,stale=eventType!=="NONE"&&(!publishedAt||now-publishedAt>(C.signal.staleMs[source]||120000));let eligibility="ELIGIBLE";
        if(stale)eligibility="STALE";else if(this.externalPosition)eligibility="BLOCKED BY POSITION";else if(source!==this.config.source)eligibility="SOURCE FILTER";else if(direction&&!this.directionAllowed(direction))eligibility="DIR FILTER";else if(direction&&!this.canAddDirection(direction))eligibility="TRANCHE LIMIT";else if(eventType!=="NONE"&&!this.typeAllowed(eventType))eligibility="TYPE FILTER";else if(eventType==="NONE"||!raw.qualified||raw.projected)eligibility="NOT CONFIRMED";else if(this.config.minimumRank>0&&(raw.rankValue==null||n(raw.rankValue)<this.config.minimumRank))eligibility=`RANK < ${this.config.minimumRank}`;
        return {...clone(raw),source,eventType,direction,phase,rank:raw.rank||null,rankValue:raw.rankValue==null?null:n(raw.rankValue),stale,selected:source===this.config.source,eligibility};});
    }
    async refreshPreviewSettings(requestedSymbol=this.gateway.symbol()){
      const symbol=upper(requestedSymbol),results=await Promise.allSettled([this.gateway.filters(symbol),this.gateway.commissionRate(symbol)]),settings=results[0].status==="fulfilled"?results[0].value:null,commission=results[1].status==="fulfilled"?results[1].value:null;
      // A slower response for the prior market must never overwrite settings fetched for a newer
      // selection. The secondary gateway deliberately mirrors the main runtime symbol.
      if(symbol!==upper(this.gateway.symbol()))return false;
      this.filters=settings&&settings.status!=="error"?normalizedFilters(settings):null;
      if(commission)this.rates=calc.feeRates({makerCommissionRate:n(commission.makerCommissionRate),takerCommissionRate:n(commission.takerCommissionRate)});
      this.marketSymbol=symbol;return !!this.filters;
    }
    async initialize(){
      if(this.initialized)return this;
      if(this.initializing)throw new Error("SCALP initialization is already in progress");
      this.initializing=true;this.emit("initializing");
      try{
        if(!this.gateway)throw new Error("Canonical Binance trading gateway unavailable");const hub=window.PUBLIC_MARKET_DATA_HUB;
        if(hub&&hub.setTimeframeRequirements)hub.setTimeframeRequirements(C.consumerId,C.timeframes.map(tf=>({tf,count:C.signal.minimumRows})));
        if(hub&&hub.ensureTimeframeBuffer)await Promise.all(C.timeframes.map(tf=>hub.ensureTimeframeBuffer(tf,C.signal.minimumRows).catch(()=>null)));
        if(hub&&hub.subscribe)this.unsubHub=hub.subscribe(event=>this.onMarket(event));
        if(this.useGlobalPrivateEvents){window.addEventListener("bt001:binance-order-update",this._orderListener=event=>this.onOrder(event.detail));window.addEventListener("v13:open-position-change",this._positionListener=event=>this.onPosition(event.detail));window.addEventListener("bt001:binance-private-status",this._privateStatusListener=event=>this.onPrivateStatus(event.detail));}
        this.lastPrivateStatus=upper(this.gateway.connection()&&this.gateway.connection().streamStatus);
        C.timeframes.forEach(tf=>this.acceptDetection(tf,this.detector.evaluateTf(tf,null,this.now()),{notify:false,suppressEntry:true}));
        const p=window.PUBLIC_MARKET_DATA_HUB&&window.PUBLIC_MARKET_DATA_HUB.getLatestPrice&&window.PUBLIC_MARKET_DATA_HUB.getLatestPrice();if(p&&p.price)this.guide=p.price;
        await this.refreshPreviewSettings().catch(()=>null);
        await this.recover();this.initialized=true;return this;
      }finally{this.initializing=false;this.emit(this.initialized?"initialized":"initialization-failed");}
    }
    destroy(){if(this.unsubHub)this.unsubHub();const hub=window.PUBLIC_MARKET_DATA_HUB;if(hub&&hub.setTimeframeRequirements)hub.setTimeframeRequirements(C.consumerId,[]);if(this.useGlobalPrivateEvents){window.removeEventListener("bt001:binance-order-update",this._orderListener);window.removeEventListener("v13:open-position-change",this._positionListener);window.removeEventListener("bt001:binance-private-status",this._privateStatusListener);}}
    updateConfig(patch){
      const locked=this.configurationLocked(),protectedKeys=["engineProfile","direction","source","entryType","minimumRank","lot","target","tpDelta","tpDriver","stop","slDelta","slDriver","profitLockEnabled","lockThresholdPct","lockPortionPct","rankBoostEnabled","rankBoostThreshold","rankBoostPoints"],next={...patch};["autoEntryEnabled","autoTradingEnabled","mode","cooloffMinutes"].forEach(key=>delete next[key]);if(Object.prototype.hasOwnProperty.call(next,"engineProfile")&&!["V1","V2"].includes(next.engineProfile))delete next.engineProfile;if(Object.prototype.hasOwnProperty.call(next,"minimumRank"))next.minimumRank=Math.round(Math.max(0,Math.min(100,n(next.minimumRank)??0)));if(Object.prototype.hasOwnProperty.call(next,"profitLockEnabled"))next.profitLockEnabled=next.profitLockEnabled===true;if(Object.prototype.hasOwnProperty.call(next,"lockThresholdPct"))next.lockThresholdPct=Math.max(1,Math.min(100,n(next.lockThresholdPct)??C.defaults.lockThresholdPct));if(Object.prototype.hasOwnProperty.call(next,"lockPortionPct"))next.lockPortionPct=Math.max(1,Math.min(99,n(next.lockPortionPct)??C.defaults.lockPortionPct));if(Object.prototype.hasOwnProperty.call(next,"rankBoostEnabled"))next.rankBoostEnabled=next.rankBoostEnabled===true;if(Object.prototype.hasOwnProperty.call(next,"rankBoostThreshold"))next.rankBoostThreshold=Math.max(0,Math.min(100,n(next.rankBoostThreshold)??C.defaults.rankBoostThreshold));if(Object.prototype.hasOwnProperty.call(next,"rankBoostPoints"))next.rankBoostPoints=Math.max(0,n(next.rankBoostPoints)??C.defaults.rankBoostPoints);if(locked)protectedKeys.forEach(key=>delete next[key]);
      const profileChanged=Object.prototype.hasOwnProperty.call(next,"engineProfile")&&next.engineProfile!==this.config.engineProfile;this.config={...this.config,...next};if(profileChanged){this.detector=this.detectors[this.config.engineProfile];this.latestBySource.clear();this.lastQualifiedBySource.clear();}this.saveConfig();if(this.state==="ARMED"&&protectedKeys.some(key=>Object.prototype.hasOwnProperty.call(next,key)))this.rebase("configuration changed");
      this.emit("configuration");return this.config;
    }
    rebase(reason){this.generation+=1;this.armedAt=this.now();this.baseline.clear();this.seen.clear();this.rankRejected.clear();const latest=this.displayDetection(this.config.source);if(latest)this.baseline.add(latest.freshnessKey||latest.eventId);this.status=`ARMED · waiting for a new event (${reason})`;this.log("rebase",{reason,generation:this.generation});}
    sourceReady(){const hub=window.PUBLIC_MARKET_DATA_HUB,periods=root.detectorTools&&root.detectorTools.fixedPeriods?root.detectorTools.fixedPeriods():[C.signal.emaFast,C.signal.emaSlow,C.signal.emaFast,C.signal.emaSlow,C.signal.emaFast],snap=hub&&hub.getAuthoritativeMaSnapshot&&hub.getAuthoritativeMaSnapshot(this.config.source,{includeForming:true,periods,requiredRows:C.signal.minimumRows});return !!(snap&&snap.reliable);}
    async arm(){
      if(!this.initialized){const failed={ok:false,errors:["SCALP initialization is not complete"]};this.status=failed.errors[0];this.emit("arm-refused");return failed;}
      if(this.state!=="OFF"&&this.state!=="ERROR")return {ok:false,errors:[`Cannot arm from ${this.state}`]};
      const connection=this.gateway.connection(),streamHealthy=connection&&upper(connection.streamStatus)==="LIVE",symbol=this.gateway.symbol(),rawSettings=await this.gateway.filters(symbol),filtersReady=rawSettings&&rawSettings.status!=="error"&&n(rawSettings.tickSize)>0&&n(rawSettings.stepSize)>0,settings=normalizedFilters(rawSettings);this.filters=settings;
      let balance=null,facts=null;try{[balance,facts]=await Promise.all([this.gateway.balance(),this.readExchangeFacts()]);}catch(error){const failed={ok:false,errors:[`Binance reconciliation failed: ${error&&error.message||error}`]};this.status=failed.errors[0];this.emit("arm-refused");return failed;}
      const owned=snapshotOrders(facts&&facts.orders).filter(isOwned);if(!this.isActive()&&owned.length)this.adoptOrphanedTranches(owned);
      const ownedIds=new Set(owned.map(orderClient));let active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));
      await this.reconcileExternalActiveReduction(active,ownedIds);active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));
      const knownIds=new Set(active.flatMap(row=>[row.entryClientId,row.pslClientId,row.partialTpClientId,row.profitLockClientId,row.exitClientId].filter(Boolean))),unresolved=owned.filter(order=>ownedIds.has(orderClient(order))&&!knownIds.has(orderClient(order)));
      if(unresolved.length){const failed={ok:false,errors:["Unresolved SCALP-owned orders exist"]};this.status=failed.errors[0];this.emit("arm-refused");return failed;}
      for(const direction of tranches.DIRECTIONS){const live=this.position(direction),tracked=tranches.activeQuantity(this.book,direction);if(live&&Math.abs((n(live.qty)||0)-tracked)>1e-8){this.setExternalPosition(live);const failed={ok:false,errors:[this.externalPositionText(live)]};this.emit("arm-refused");return failed;}}
      this.setExternalPosition(null);
      const validation=calc.validateArm({config:this.config,filters:settings,guide:this.guide,balance,symbol,authenticated:this.gateway.isAuthenticated(),streamHealthy,sourceReady:this.sourceReady(),filtersReady,position:null,ownedOrders:[]});
      if(!validation.ok){this.status=validation.errors.join("; ");this.emit("arm-refused");return validation;}
      const counts=this.trancheCounts(),limit=this.config.maxConcurrentAutoPositions;if(counts.LONG>=limit&&counts.SHORT>=limit){const failed={ok:false,errors:[`Both direction tranche limits reached (${limit}/${limit})`]};this.status=failed.errors[0];this.emit("arm-refused");return failed;}
      if(this.state==="ERROR")this.transition("OFF","Previous error acknowledged");this.transition("ARMED","ARMED · waiting for a new qualifying event");this.rebase("armed");
      this.logActivity("ARMED",{sourceTimeframe:this.config.source});return validation;
    }
    autoConcurrentAutoCount(direction){const normalized=tranches.normalizeDirection(direction);return normalized?tranches.count(this.book,normalized):this.trancheCounts().LONG+this.trancheCounts().SHORT;}
    estimateRealizedPnl(tranche,reason){
      // Estimate only, for the daily auto-loss cap and decision log -- NOT used by any exit or
      // SL/TP logic. Exact realized fees/slippage on the exit leg are not tracked by this engine,
      // so TP/SL exits use the already-known protection price and other exits fall back to the
      // last observed guide price.
      const dir=upper(tranche&&tranche.direction),entry=n(tranche&&tranche.entryPrice),qty=n(tranche&&tranche.closedQty)||n(tranche&&tranche.filledQty);
      if(!["LONG","SHORT"].includes(dir)||!(entry>0)||!(qty>0))return null;
      const exit=n(tranche&&tranche.closedPrice)||(reason==="PARTIAL_TP"||reason==="TP"?n(tranche.partialTpPrice):reason==="PSL"||reason==="SL"?n(tranche.pslPrice):n(this.guide));
      if(!(exit>0))return null;
      const side=dir==="LONG"?1:-1,gross=(exit-entry)*qty*side,exitFeeRate=reason==="PARTIAL_TP"||reason==="TP"?(this.rates.conservativeTp||this.rates.taker):this.rates.taker,entryFee=(n(tranche.entryCommission)||0)*(qty/Math.max(qty,n(tranche.filledQty)||qty)),fees=entryFee+exit*qty*exitFeeRate;
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
        if(this.state==="ARMED"||this.isActive())this.disarm();
        else this.emit("daily-loss-cap-breached");
      }
    }
    recordTrancheClosed(tranche,reason){
      const pnl=this.estimateRealizedPnl(tranche,reason);
      if(pnl!=null&&pnl<0)this.applyAutoLoss(-pnl);
      this.logActivity("TRANCHE_CLOSED",{sourceTimeframe:tranche.source,detectorState:{reason},cascadeAgreement:tranche.cascadeAgreementAtEntry||null,positionState:{direction:tranche.direction,trancheId:tranche.trancheId,...tranche,estimatedRealizedPnlUsd:pnl}});
      this.recordTradeLedger(tranche,reason,pnl);
    }
    recordTradeLedger(tranche,reason,pnl){
      // One row per completed tranche SCALP placed.
      // estimated_realized_pnl_usd reuses estimateRealizedPnl() and carries the same caveat as the daily loss
      // cap above: exact realized fees/slippage on the exit leg are not tracked by this engine, so
      // this is an ESTIMATE, not an authoritative fill-derived P&L.
      this.activityLogger.logTrade({...tranche,symbol:tranche.symbol||this.marketSymbol||null},reason,pnl,this.guide);
    }
    logActivity(action,detail={}){
      // Fire-and-forget activity logging (PART 4). Never awaited by callers and never allowed to
      // affect engine state -- a missing/misconfigured Supabase credential, or a network failure
      // (buffered/retried inside services/supabase.service.js), must not change trading behaviour.
      this.activityLogger.logActivity(action,detail);
    }
    dailyLossSnapshot(){
      const cap=n(this.config.maxDailyAutoLossUsd),accumulatedUsd=this.autoLossState.accumulatedUsd;
      return {day:this.autoLossState.day,accumulatedUsd,capUsd:cap,breached:cap>0&&accumulatedUsd>=cap};
    }
    disarm(){if(this.state==="ARMED"){this.logActivity("DISARMED",{sourceTimeframe:this.config.source});this.transition("OFF","Disarmed");}else if(this.isActive()){this.status="ACTIVE · future entries disabled; TP/SL retained";this.emit("disarmed-active");}return this.snapshot();}
    onMarket(update){
      let refresh=null;const symbol=upper(update&&update.symbol);
      if(symbol&&symbol!==upper(this.marketSymbol)){
        this.marketSymbol=symbol;this.filters=null;this.rebaselineMarketDetections("symbol-change");
        // ARM is intentionally manual. A market change invalidates the prior arm cycle and must
        // return an idle armed engine to OFF so the user can explicitly arm the newly selected
        // symbol after its filters have refreshed.
        if(this.state==="ARMED"&&!this.isActive())this.disarm();
        refresh=this.refreshPreviewSettings(symbol).then(()=>this.emit("preview-settings")).catch(()=>false);
      }
      if(update&&update.type==="price"&&n(update.price)>0)this.guide=n(update.price);
      if(update&&update.type==="price"&&n(update.price)>0)this.maybeProfitLocks(n(update.price));
      if(update&&update.tf&&C.timeframes.includes(update.tf)){const result=this.detector.evaluateTf(update.tf,update,this.now());this.acceptDetection(update.tf,result);}
      this.emit("market");return refresh;
    }
    onPrivateStatus(detail){
      const next=upper(detail&&detail.streamStatus),previous=this.lastPrivateStatus;this.lastPrivateStatus=next;
      if(next!=="LIVE"){if(this.state==="ARMED"){this.transition("OFF","OFF · private stream disconnected; ARM was not retained");}else if(this.isActive()){this.status=`ACTIVE · private stream ${next.toLowerCase()}; exchange protection retained`;this.emit("private-stream-interrupted");}return;}
      if(previous&&previous!=="LIVE"){this.rebaselineMarketDetections("private-stream-reconnect");this.reconcileLive({reconnect:true}).catch(error=>this.fail(error,"Reconnect reconciliation failed"));}
    }
    async reconcileLive(options={}){
      if(this.reconnectBusy){this.reconcileQueued=true;return;}
      this.reconnectBusy=true;
      try{do{this.reconcileQueued=false;await this.recover(options);}while(this.reconcileQueued);}
      finally{this.reconnectBusy=false;}
    }
    async reconcileAfterReconnect(){return this.reconcileLive({reconnect:true});}
    recordCascade(source,event){
      if(!event||!["LONG","SHORT"].includes(upper(event.direction)))return;
      this.cascadeByTf.set(source,{timeframe:source,direction:upper(event.direction),eventType:event.eventType||null,at:n(event.publishedAt)||this.now(),candleTime:n(event.candleTime),rankValue:event.rankValue==null?null:n(event.rankValue),rank:event.rank||null});
    }
    cascadeState(){return [...this.cascadeByTf.values()].map(record=>({...record}));}
    cascadeAgreement(direction){
      const side=upper(direction),agreeing=[...this.cascadeByTf.values()].filter(record=>record.direction===side);
      return {direction:side,count:agreeing.length,timeframes:agreeing.map(record=>record.timeframe),records:agreeing.map(record=>({...record}))};
    }
    acceptDetection(source,result,control=true){
      const options=control&&typeof control==="object"?control:{notify:control!==false},notify=options.notify!==false,suppressEntry=options.suppressEntry===true;
      if(!result)return;const event=result.event||result.detection||{source,eventType:"NONE",direction:null,eventState:"NONE",qualified:false,projected:false,publishedAt:this.now(),status:result.status},emitted=result.emittedEvent||(result.event&&result.event.qualified&&!result.event.projected?result.event:null);this.latestBySource.set(source,{...event,source,status:result.status});if(emitted&&emitted.qualified&&!emitted.projected)this.lastQualifiedBySource.set(source,{...emitted,source,status:result.status});
      // Cascade tracking is a booster/informational signal only (see cascadeState()/cascadeAgreement()):
      // it is recorded for every watched timeframe here, never gated on this.config.source or this.state,
      // so it can never block or delay an entry on a faster timeframe. Each qualifying cross/bounce simply
      // replaces the prior record for that same timeframe -- which is also how expiry works: a record is
      // only ever overwritten (invalidated) by a new qualifying event on that SAME timeframe (an opposite
      // cross changes its direction; a same-direction cross/bounce just refreshes it), never by another
      // timeframe and never by a timer/staleness check.
      if(emitted&&emitted.qualified&&!emitted.projected){this.recordCascade(source,emitted);this.logActivity("DETECTION_QUALIFIED",{sourceTimeframe:source,detectorState:emitted,cascadeAgreement:this.cascadeAgreement(emitted.direction)});}
      if(!suppressEntry&&source===this.config.source&&this.state==="ARMED"&&emitted)this.considerEntry(emitted);
      this.status=this.state==="ARMED"?(event&&event.direction&&!this.directionAllowed(event.direction)?`ARMED · ${event.direction} ${event.eventType||"event"} ignored by DIR ${this.config.direction}`:`ARMED · ${result.status}`):this.status;if(notify)this.emit("signal");
    }
    directionAllowed(direction){return this.config.direction==="ANY"||this.config.direction===upper(direction);}
    typeAllowed(type){return this.config.entryType==="ANY"||this.config.entryType===upper(type);}
    considerEntry(event){
      const freshKey=event.freshnessKey||event.eventId;if(!event.qualified||event.projected||!this.directionAllowed(event.direction)||!this.typeAllowed(event.eventType)||this.baseline.has(freshKey)||this.seen.has(freshKey)||n(event.publishedAt)<this.armedAt)return false;
      if(!this.canAddDirection(event.direction)){this.seen.add(freshKey);const count=this.autoConcurrentAutoCount(event.direction),limit=this.config.maxConcurrentAutoPositions;this.status=`ARMED · ${upper(event.direction)} tranche limit reached (${count}/${limit})`;this.log("tranche-limit-blocked",{direction:upper(event.direction),count,limit,freshnessKey:freshKey});this.emit("tranche-limit-blocked");return false;}
      const threshold=n(this.config.minimumRank)||0,rank=event.rankValue==null?null:n(event.rankValue);if(threshold>0&&(rank==null||rank<threshold)){
        this.seen.add(freshKey);this.rankRejected.add(freshKey);this.log("rank-rejected",{freshnessKey:freshKey,rankValue:rank,minimumRank:threshold});this.status=`ARMED · event rank ${rank==null?"unavailable":rank} below ${threshold}`;
        this.logActivity("RANK_REJECTED",{sourceTimeframe:event.source,detectorState:event,cascadeAgreement:this.cascadeAgreement(event.direction)});
        return false;
      }
      const cascadeAgreement=this.cascadeAgreement(event.direction);
      this.seen.add(freshKey);
      this.executeEntry(event)
        .catch(error=>{this.logActivity("ENTRY_FAILED",{sourceTimeframe:event.source,detectorState:event,cascadeAgreement,positionState:{error:error&&error.message||String(error)}});if(!error||!error.scalpFatalReported)this.fail(error,"Entry failed");});
      return true;
    }
    quantityDecimals(){
      const step=n(this.filters&&this.filters.stepSize)||0.001,text=String(step).toLowerCase();
      if(text.includes("e-"))return Math.min(12,Math.max(0,Number(text.split("e-")[1])||0));
      return Math.min(12,(text.split(".")[1]||"").length);
    }
    normalizedOrderQuantity(qty){
      const normalized=calc.normalizeLot(qty,this.filters||{});
      if(!(normalized>0))throw new Error(`Order quantity ${qty} is below the symbol step size`);
      return normalized;
    }
    quantityText(qty){return this.normalizedOrderQuantity(qty).toFixed(this.quantityDecimals());}
    unprotectedQuantityText(direction,qty){return `Unprotected ${upper(direction)} quantity: ${this.quantityText(qty)} -- manual attention required.`;}
    orderParams(side,qty,extra={}){const params={symbol:this.gateway.symbol(),side,type:extra.type||"MARKET",quantity:this.quantityText(qty),newClientOrderId:extra.clientId};if(this.filters&&this.filters.positionMode==="HEDGE")params.positionSide=extra.positionSide|| (side==="BUY"?"LONG":"SHORT");else if(extra.reduceOnly)params.reduceOnly="true";return {...params,...extra.params};}
    makeTranche(event){
      const direction=upper(event.direction),id=trancheId(direction,event.eventId,this.generation),qty=calc.normalizeLot(this.config.lot,this.filters);
      return {
        trancheId:id,symbol:this.gateway.symbol(),quoteAsset:quoteAsset(this.gateway.symbol()),direction,source:event.source,eventId:event.eventId,eventType:event.eventType,generation:this.generation,
        entryClientId:trancheClientId("E",id),partialTpClientId:trancheClientId("T",id),pslClientId:trancheClientId("S",id),profitLockClientId:trancheClientId("L",id),exitClientId:trancheClientId("X",id),
        requestedQty:qty,filledQty:0,remainingQty:qty,entryPrice:0,entryCommission:0,entryCommissionActual:false,entryCommissionFills:[],
        fundingCost:0,fundingStatus:"no-known-settlement",mode:this.config.mode,target:n(this.config.target),stop:n(this.config.stop),tpDelta:n(this.config.tpDelta),slDelta:n(this.config.slDelta),tpDriver:this.config.tpDriver,slDriver:this.config.slDriver,
        profitLockEnabled:this.config.profitLockEnabled===true,lockThresholdPct:n(this.config.lockThresholdPct),lockPortionPct:n(this.config.lockPortionPct),profitLockTriggered:false,profitLockPending:false,
        rankBoostEnabled:this.config.rankBoostEnabled===true,rankBoostThreshold:n(this.config.rankBoostThreshold),rankBoostPoints:n(this.config.rankBoostPoints),triggerRank:event.rankValue==null?null:n(event.rankValue),rankBoostApplied:false,
        createdAt:this.now(),status:"ENTRY_PENDING",cascadeAgreementAtEntry:this.cascadeAgreement(direction)
      };
    }
    applyEntryResponse(tranche,response,beforePosition=null,afterPosition=null){
      const responseQty=n(response&&response.executedQty)||0,beforeQty=n(beforePosition&&beforePosition.qty)||0,afterQty=n(afterPosition&&afterPosition.qty)||0,delta=Math.max(0,afterQty-beforeQty),rawFilled=Math.max(n(tranche.filledQty)||0,responseQty,delta),filled=rawFilled>0?this.normalizedOrderQuantity(rawFilled):0;
      const responseAverage=n(response&&response.avgPrice),quote=n(response&&response.cumQuote),derived=delta>0&&afterPosition?((n(afterPosition.avg)||0)*afterQty-(n(beforePosition&&beforePosition.avg)||0)*beforeQty)/delta:null;
      if(filled>0){tranche.filledQty=filled;tranche.remainingQty=filled;tranche.entryPrice=responseAverage>0?responseAverage:quote>0?quote/filled:derived>0?derived:n(tranche.entryPrice)||0;if(!tranche.entryCommissionActual&&tranche.entryPrice>0)tranche.entryCommission=Math.max(n(tranche.entryCommission)||0,tranche.entryPrice*filled*this.rates.taker);tranche.status="PROTECTION_PENDING";}
      if(response&&response.orderId!=null)tranche.entryOrderId=response.orderId;
      this.persistTrancheBook();return filled;
    }
    async refreshLivePositions(){
      if(this.gateway.refreshPositions){const positions=await this.gateway.refreshPositions();return this.applyPositionFacts(positions);}
      const facts=await this.gateway.reconcile();return this.applyPositionFacts(facts);
    }
    async executeEntry(event){
      const direction=upper(event.direction),branch=tranches.directionBook(this.book,direction);
      if(!branch||branch.executionLock||this.state!=="ARMED"||!this.canAddDirection(direction))return null;
      branch.executionLock=String(event.eventId);branch.state="ENTRY_PENDING";
      const before=clone(this.position(direction)),tranche=tranches.add(this.book,this.makeTranche(event));this.fillIdsByTranche.set(tranche.trancheId,new Set());this.persistTrancheBook();this.status=`ENTRY · ${direction} tranche ${tranche.trancheId}`;this.emit("tranche-entry-started");
      const side=direction==="LONG"?"BUY":"SELL";
      try{
        let response=null;
        try{response=await this.gateway.submitOrder({...this.orderParams(side,tranche.requestedQty,{clientId:tranche.entryClientId,positionSide:direction}),newOrderRespType:"RESULT"});}
        catch(error){if(!error||!error.uncertain)throw error;response=await this.reconcileUncertainEntry(tranche);}
        await sleep(C.order.reconcileDelayMs);let after=null;try{await this.refreshLivePositions();after=this.position(direction);}catch(_e){}
        this.applyEntryResponse(tranche,response,before,after);
        if(!(tranche.filledQty>0)){const queried=await this.queryEntry(tranche);this.applyEntryResponse(tranche,queried,before,after);}
        if(!(tranche.filledQty>0))throw new Error(`Entry ${tranche.entryClientId} has no confirmed fill`);
        this.applyRankBoost(tranche,event);
        await this.ensureTrancheProtection(tranche);
        tranche.status="ACTIVE";branch.state="IDLE";this.persistTrancheBook();
        this.logActivity("TRANCHE_ADDED",{sourceTimeframe:tranche.source,detectorState:event,cascadeAgreement:tranche.cascadeAgreementAtEntry,positionState:{direction,trancheId:tranche.trancheId,...clone(tranche)}});
        this.status=`ARMED · ${direction} tranche ${tranche.trancheId} active`;this.emit("tranche-added");return tranche;
      }catch(error){
        let failure=error;
        if(tranche.filledQty>0){
          const protectionMessage=error&&error.message||String(error);tranche.status="UNPROTECTED";tranche.protectionFailure={at:this.now(),message:protectionMessage};tranche.remainingQty=this.normalizedOrderQuantity(tranche.remainingQty||tranche.filledQty);this.persistTrancheBook();
          try{
            await this.emergencyCloseTranche(tranche,"ENTRY_OR_PROTECTION_FAILED");
            this.logActivity("EMERGENCY_CLOSE_SUCCEEDED",{sourceTimeframe:tranche.source,detectorState:event,cascadeAgreement:tranche.cascadeAgreementAtEntry,positionState:{direction,trancheId:tranche.trancheId,quantity:tranche.closedQty,protectionError:protectionMessage,...clone(tranche)}});
          }catch(closeError){
            const closeMessage=closeError&&closeError.message||String(closeError),unprotectedQuantity=this.normalizedOrderQuantity(tranche.remainingQty||tranche.filledQty);
            tranche.status="UNPROTECTED";tranche.unprotectedQuantity=unprotectedQuantity;tranche.emergencyCloseFailure={at:this.now(),message:closeMessage};branch.state="ERROR";this.persistTrancheBook();
            const critical=new Error(`${this.unprotectedQuantityText(direction,unprotectedQuantity)} Protective failure: ${protectionMessage}. Emergency safety close failed: ${closeMessage}`);critical.scalpFatalReported=true;
            this.logActivity("EMERGENCY_CLOSE_FAILED",{sourceTimeframe:tranche.source,detectorState:event,cascadeAgreement:tranche.cascadeAgreementAtEntry,positionState:{direction,trancheId:tranche.trancheId,unprotectedQuantity,protectionError:protectionMessage,emergencyCloseError:closeMessage,...clone(tranche)}});
            this.fail(critical,"CRITICAL");failure=critical;
          }
        }else{tranches.remove(this.book,tranche.trancheId);this.fillIdsByTranche.delete(tranche.trancheId);}
        if(branch.state!=="ERROR")branch.state="IDLE";this.persistTrancheBook();throw failure;
      }finally{branch.executionLock=null;this.persistTrancheBook();}
    }
    async queryEntry(tranche){try{const order=await this.gateway.queryOrder({symbol:this.gateway.symbol(),origClientOrderId:tranche.entryClientId});if(order&&order.orderId!=null)tranche.entryOrderId=order.orderId;return order||null;}catch(_e){return null;}}
    async verifyRecoveryEntry(tranche){
      const expectedClientId=String(tranche&&tranche.entryClientId||"");
      if(!expectedClientId)return {ok:false,reason:"tranche has no entry client ID"};
      let order=null;
      try{order=await this.gateway.queryOrder({symbol:this.gateway.symbol(),origClientOrderId:expectedClientId});}
      catch(error){return {ok:false,reason:`matching entry order query failed: ${error&&error.message||error}`};}
      if(!order)return {ok:false,reason:`matching entry order ${expectedClientId} was not found`};
      const actualClientId=orderClient(order);
      if(actualClientId!==expectedClientId)return {ok:false,reason:`entry client ID mismatch (${actualClientId||"missing"} vs ${expectedClientId})`};
      if(order.orderId==null)return {ok:false,reason:`matching entry order ${expectedClientId} has no Binance order ID`};
      if(tranche.entryOrderId!=null&&String(tranche.entryOrderId)!==String(order.orderId))return {ok:false,reason:`entry order ID mismatch (${order.orderId} vs ${tranche.entryOrderId})`};
      const executedQty=n(order.executedQty??order.z)||0,claimedQty=Math.max(n(tranche.filledQty)||0,n(tranche.remainingQty)||0),tolerance=Math.max(1e-8,(n(this.filters&&this.filters.stepSize)||0)*1e-6);
      if(!(executedQty>0))return {ok:false,reason:`matching entry order ${expectedClientId} has no confirmed fill`};
      if(executedQty+tolerance<claimedQty)return {ok:false,reason:`matching entry fill ${this.quantityText(executedQty)} is smaller than tranche quantity ${this.quantityText(claimedQty)}`};
      const entryPrice=n(order.avgPrice),quote=n(order.cumQuote);
      if(!(n(tranche.entryPrice)>0)&&!(entryPrice>0)&&!(quote>0))return {ok:false,reason:`matching entry order ${expectedClientId} has no confirmed fill price`};
      tranche.entryOrderId=order.orderId;
      if(!(n(tranche.filledQty)>0))tranche.filledQty=this.normalizedOrderQuantity(executedQty);
      if(!(n(tranche.remainingQty)>0))tranche.remainingQty=tranche.filledQty;
      if(!(n(tranche.entryPrice)>0))tranche.entryPrice=entryPrice>0?entryPrice:quote/executedQty;
      tranche.recoveryEntryVerifiedAt=this.now();this.persistTrancheBook();
      return {ok:true,orderId:order.orderId,clientOrderId:actualClientId,executedQty,status:upper(order.status??order.orderStatus)};
    }
    recoveryProtectionDetail(tranche,extra={}){return {sourceTimeframe:tranche.source,positionState:{direction:tranche.direction,trancheId:tranche.trancheId,entryClientId:tranche.entryClientId,entryOrderId:tranche.entryOrderId,remainingQuantity:n(tranche.remainingQty)||0,...extra,...clone(tranche)}};}
    refuseRecoveryProtection(tranche,reason){
      tranche.recoveryProtectionFailure={at:this.now(),reason};this.persistTrancheBook();
      this.logActivity("PROTECTION_REBUILD_REFUSED",this.recoveryProtectionDetail(tranche,{reason}));
      const message=`ERROR · recovery protection refused for ${tranche.direction} tranche ${tranche.trancheId}: ${reason}. No protection order was submitted.`;
      if(this.state!=="ERROR"&&C.transitions[this.state]&&C.transitions[this.state].includes("ERROR"))this.transition("ERROR",message);else{this.status=message;this.emit("recovery-protection-refused");}
      return {ok:false,reason};
    }
    async reconcileUncertainEntry(tranche){
      for(const delay of [300,700,1500,3000]){await sleep(delay);const found=await this.queryEntry(tranche);if(found)return found;try{await this.refreshLivePositions();const live=this.position(tranche.direction);if(live&&n(live.qty)>0)return {avgPrice:String(n(live.avg)||0)};}catch(_e){}}
      throw new Error("Entry outcome remains ambiguous after reconciliation");
    }
    onOrder(detail){
      const o=detail&&detail.order||detail&&detail.event&&detail.event.o||detail&&detail.o||{},id=orderClient(o);if(!id||!isOwned(o))return;
      const tranche=tranches.findByClientId(this.book,id);if(!tranche)return;
      const status=upper(o.X??o.status??o.orderStatus),executed=n(o.z??o.executedQty)||0,average=n(o.ap??o.avgPrice??o.L??o.lastFilledPrice);
      if(id===tranche.entryClientId){
        if(executed>0){tranche.filledQty=this.normalizedOrderQuantity(Math.max(n(tranche.filledQty)||0,executed));tranche.remainingQty=this.normalizedOrderQuantity(Math.max(n(tranche.remainingQty)||0,executed));if(average>0)tranche.entryPrice=average;this.recordEntryCommission(tranche,o,status==="FILLED");this.persistTrancheBook();}
        return;
      }
      const reason=id===tranche.partialTpClientId?"PARTIAL_TP":id===tranche.pslClientId?"PSL":null;if(!reason)return;
      if(executed>0&&status==="PARTIALLY_FILLED"){tranche.exitExecutedQty=this.normalizedOrderQuantity(Math.max(n(tranche.exitExecutedQty)||0,executed));const remaining=Math.max(0,(n(tranche.filledQty)||0)-tranche.exitExecutedQty);tranche.remainingQty=remaining>0?this.normalizedOrderQuantity(remaining):0;tranche.status="EXIT_PENDING";this.persistTrancheBook();this.status=`${reason} · tranche ${tranche.trancheId} partially filled`;this.emit("tranche-exit-partial");this.resizeSiblingProtectionAfterPartial(tranche,reason).catch(error=>this.fail(error,"Partial tranche protection resize failed"));return;}
      if(status==="FILLED"){const branch=tranches.directionBook(this.book,tranche.direction);if(branch)branch.executionLock=`EXIT:${tranche.trancheId}`;tranche.status="EXIT_PENDING";this.persistTrancheBook();tranche.closedPrice=average>0?average:reason==="PARTIAL_TP"?n(tranche.partialTpPrice):n(tranche.pslPrice);tranche.closedQty=Math.max(executed,n(tranche.filledQty)||0);this.finishTranche(tranche,reason).catch(error=>this.fail(error,"Tranche exit reconciliation failed"));}
    }
    recordEntryCommission(tranche,order,finalFill=false){
      const amount=n(order.n??order.commission),fillId=String(order.t??order.tradeId??`${order.L??order.lastFilledPrice}|${order.l??order.lastFilledQty}|${amount}`),ids=this.fillIdsByTranche.get(tranche.trancheId)||new Set();this.fillIdsByTranche.set(tranche.trancheId,ids);if(amount==null||amount<0||ids.has(fillId))return false;ids.add(fillId);
      const asset=upper(order.N??order.commissionAsset),quote=upper(tranche.quoteAsset||quoteAsset(tranche.symbol)),fillQty=n(order.l??order.lastFilledQty)||0,fillPrice=n(order.L??order.lastFilledPrice)||n(order.ap??order.avgPrice)||n(tranche.entryPrice)||0,maker=typeof (order.m??order.maker)==="boolean"?!!(order.m??order.maker):null,sameQuote=!!asset&&asset===quote,converted=n(order.commissionQuoteAmount??order.quoteCommissionAmount),estimated=fillPrice*fillQty*(maker===true?this.rates.maker:this.rates.taker),record={fillId,amount,asset:asset||null,maker,fillQty,fillPrice,quoteAmount:sameQuote?amount:converted,estimatedQuote:estimated};
      const fills=Array.isArray(tranche.entryCommissionFills)?tranche.entryCommissionFills:[];fills.push(record);tranche.entryCommissionFills=fills;const known=fills.reduce((sum,fill)=>sum+(n(fill.quoteAmount)||0),0),fallback=fills.reduce((sum,fill)=>sum+(fill.quoteAmount==null?(n(fill.estimatedQuote)||0):0),0),covered=fills.reduce((sum,fill)=>sum+(n(fill.fillQty)||0),0),cumulative=n(order.z??order.executedQty)||n(tranche.filledQty)||0;
      tranche.entryCommission=known+fallback;tranche.entryCommissionActual=finalFill&&covered+1e-12>=cumulative&&fills.every(fill=>fill.quoteAmount!=null);return tranche.entryCommissionActual;
    }
    onPosition(detail){
      const value=detail&&detail.positions?detail.positions:detail&&detail.current?detail.current:detail;this.applyPositionFacts(value);
      if(!this.isActive())this.setExternalPosition(this.position());
      this.emit("position-fact");if(!tranches.DIRECTIONS.some(direction=>tranches.directionBook(this.book,direction).executionLock))this.reconcileLive({positionUpdate:true}).catch(error=>this.fail(error,"Position reconciliation failed"));
    }
    applyRankBoost(tranche,event){
      if(!tranche)return tranche;const result=decisions.rankBoost({tranche,eventRank:event&&event.rankValue,normalTp:this.protectionPrices(tranche).tp,tickSize:this.filters&&this.filters.tickSize});
      tranche.triggerRank=result.triggerRank;tranche.rankBoostApplied=result.applied;
      if(!result.applied)return tranche;
      tranche.basePartialTpPrice=result.normalTp;tranche.partialTpPrice=result.tpPrice;tranche.rankBoostAppliedAt=this.now();return tranche;
    }
    profitLockLevel(tranche){return decisions.profitLockLevel({tranche,tickSize:this.filters&&this.filters.tickSize});}
    profitLockQuantity(tranche){return decisions.profitLockQuantity({tranche,filters:this.filters||{}});}
    profitLockReached(tranche,price){return decisions.profitLockReached({tranche,price,tickSize:this.filters&&this.filters.tickSize});}
    maybeProfitLocks(price=this.guide){
      if(this.state==="ERROR"||this.state==="POSITION_MISMATCH")return;
      for(const direction of tranches.DIRECTIONS){
        const branch=tranches.directionBook(this.book,direction);if(!branch||branch.executionLock)continue;
        const tranche=tranches.activeTranches(this.book,direction).find(row=>this.profitLockReached(row,price));if(!tranche)continue;
        this.executeProfitLock(tranche,this.profitLockLevel(tranche)).catch(error=>this.fail(error,"Profit lock failed"));
      }
    }
    async executeProfitLock(tranche,designatedLevel=this.profitLockLevel(tranche)){
      const branch=tranches.directionBook(this.book,tranche&&tranche.direction),closeQty=this.profitLockQuantity(tranche);if(!branch||branch.executionLock||!(closeQty>0))return null;
      const lock=`PROFIT_LOCK:${tranche.trancheId}`,beforeQty=n(tranche.remainingQty)||0,originalPslPrice=n(tranche.pslPrice);let completed=false;branch.executionLock=lock;branch.state="EXIT_PENDING";tranche.profitLockPending=true;this.persistTrancheBook();
      try{
        await this.cancelTrancheProtection(tranche);tranche.pslOrderId=null;tranche.partialTpOrderId=null;this.persistTrancheBook();
        const side=tranche.direction==="LONG"?"SELL":"BUY",response=await this.gateway.submitOrder({...this.orderParams(side,closeQty,{clientId:tranche.profitLockClientId,positionSide:tranche.direction,reduceOnly:true}),newOrderRespType:"RESULT"}),executed=this.normalizedOrderQuantity(n(response&&response.executedQty)||closeQty),remaining=calc.normalizeLot(Math.max(0,beforeQty-executed),this.filters||{});
        tranche.profitLockOrderId=response&&response.orderId||null;tranche.profitLockPrice=designatedLevel;tranche.profitLockFillPrice=n(response&&response.avgPrice)||designatedLevel;tranche.profitLockClosedQty=executed;tranche.profitLockTriggered=true;tranche.profitLockTriggeredAt=this.now();tranche.remainingQty=remaining;
        if(!(remaining>0)){tranche.closedPrice=tranche.profitLockFillPrice;tranche.closedQty=executed;await this.finishTranche(tranche,"PROFIT_LOCK",{skipCancel:true});completed=true;return tranche;}
        const allocatedEntryCommission=(n(tranche.entryCommission)||0)*(remaining/Math.max(remaining,n(tranche.filledQty)||remaining)),breakeven=calc.feeAwareBreakeven({direction:tranche.direction,entryPrice:tranche.entryPrice,qty:remaining,entryCommission:allocatedEntryCommission,exitRate:this.rates.taker,tickSize:this.filters.tickSize});
        if(!(breakeven>0))throw new Error("Fee-aware breakeven price is unavailable");
        tranche.feeAwareBreakevenPrice=breakeven;tranche.pslPrice=breakeven;await this.ensureTrancheProtection(tranche);
        this.logActivity("PROFIT_LOCK_APPLIED",{sourceTimeframe:tranche.source,positionState:{direction:tranche.direction,trancheId:tranche.trancheId,designatedLevel,closedQuantity:executed,remainingQuantity:remaining,feeAwareBreakevenPrice:breakeven,...clone(tranche)}});
        this.status=`PROFIT LOCK · ${tranche.direction} tranche ${tranche.trancheId} · ${executed} closed`;this.emit("profit-lock-applied");completed=true;return tranche;
      }catch(error){
        if(n(tranche.remainingQty)>0&&(!tranche.pslOrderId||!tranche.partialTpOrderId)){
          if(!tranche.profitLockTriggered)tranche.pslPrice=originalPslPrice;
          try{await this.ensureTrancheProtection(tranche);}catch(protectionError){tranche.status="UNPROTECTED";tranche.unprotectedQuantity=n(tranche.remainingQty);tranche.profitLockFailure={at:this.now(),message:error&&error.message||String(error),protectionError:protectionError&&protectionError.message||String(protectionError)};this.logActivity("PROFIT_LOCK_FAILED",{sourceTimeframe:tranche.source,positionState:{direction:tranche.direction,trancheId:tranche.trancheId,unprotectedQuantity:tranche.unprotectedQuantity,error:tranche.profitLockFailure,...clone(tranche)}});throw new Error(`${this.unprotectedQuantityText(tranche.direction,tranche.remainingQty)} Profit-lock protection failed: ${tranche.profitLockFailure.protectionError}`);}
        }
        throw error;
      }finally{
        tranche.profitLockPending=false;if(branch.executionLock===lock)branch.executionLock=null;if(branch.state!=="ERROR")branch.state="IDLE";this.persistTrancheBook();if(completed&&this.state!=="ERROR"&&this.state!=="POSITION_MISMATCH")this.maybeProfitLocks(this.guide);
      }
    }
    protectionPrices(tranche){return calc.prices({direction:tranche.direction,entryPrice:tranche.entryPrice,qty:tranche.filledQty,entryCommission:tranche.entryCommission,target:tranche.target,stop:tranche.stop,tpDelta:tranche.tpDelta,slDelta:tranche.slDelta,tpDriver:tranche.tpDriver,slDriver:tranche.slDriver,makerRate:this.rates.maker,takerRate:this.rates.taker,conservativeTpRate:this.rates.conservativeTp,fundingCost:n(tranche.fundingCost)||0,tickSize:this.filters.tickSize});}
    async ensureTrancheProtection(tranche,{psl=true,tp=true}={}){
      if(!tranche||!(n(tranche.remainingQty)>0))throw new Error("Tranche has no confirmed quantity to protect");
      const outcome=this.protectionPrices(tranche),exitSide=tranche.direction==="LONG"?"SELL":"BUY",qty=this.quantityText(tranche.remainingQty);tranche.status="PROTECTION_PENDING";this.persistTrancheBook();
      if(psl&&!tranche.pslOrderId){
        const params={algoType:"CONDITIONAL",symbol:this.gateway.symbol(),side:exitSide,type:"STOP_MARKET",quantity:qty,triggerPrice:String(tranche.pslPrice||outcome.sl),workingType:"MARK_PRICE",clientAlgoId:tranche.pslClientId};if(this.filters&&this.filters.positionMode==="HEDGE")params.positionSide=tranche.direction;else params.reduceOnly="true";
        let response=null,lastError=null;for(let attempt=0;attempt<=C.order.protectionRetry;attempt++){try{response=await this.gateway.submitAlgoOrder(params);break;}catch(error){lastError=error;}}
        if(!response)throw new Error(`Protective PSL failed: ${lastError&&lastError.message||"unconfirmed"}`);tranche.pslOrderId=response.algoId??response.orderId??null;tranche.pslPrice=tranche.pslPrice||outcome.sl;this.persistTrancheBook();
      }
      if(tp&&!tranche.partialTpOrderId){
        let response=null,lastError=null;for(let attempt=0;attempt<=C.order.tpRetry;attempt++){try{response=await this.gateway.submitOrder(this.orderParams(exitSide,tranche.remainingQty,{type:"LIMIT",clientId:tranche.partialTpClientId,positionSide:tranche.direction,reduceOnly:true,params:{price:String(tranche.partialTpPrice||outcome.tp),timeInForce:"GTC"}}));break;}catch(error){lastError=error;}}
        if(!response)throw new Error(`PARTIAL_TP failed: ${lastError&&lastError.message||"unconfirmed"}`);tranche.partialTpOrderId=response.orderId??null;tranche.partialTpPrice=tranche.partialTpPrice||outcome.tp;this.persistTrancheBook();
      }
      tranche.status="ACTIVE";this.persistTrancheBook();return tranche;
    }
    async resizeSiblingProtectionAfterPartial(tranche,reason){
      if(!tranche||!(n(tranche.remainingQty)>0))return;
      const branch=tranches.directionBook(this.book,tranche.direction),lock=`RESIZE:${tranche.trancheId}`;if(branch)branch.executionLock=lock;
      try{
        if(reason==="PARTIAL_TP"){
          if(tranche.pslOrderId||tranche.pslClientId)await this.gateway.cancelAlgoOrder({symbol:this.gateway.symbol(),...(tranche.pslOrderId?{algoId:tranche.pslOrderId}:{clientAlgoId:tranche.pslClientId})}).catch(()=>null);
          tranche.pslOrderId=null;await this.ensureTrancheProtection(tranche,{psl:true,tp:false});
        }else if(reason==="PSL"){
          if(tranche.partialTpOrderId||tranche.partialTpClientId)await this.gateway.cancelOrder({symbol:this.gateway.symbol(),...(tranche.partialTpOrderId?{orderId:tranche.partialTpOrderId}:{origClientOrderId:tranche.partialTpClientId})}).catch(()=>null);
          tranche.partialTpOrderId=null;await this.ensureTrancheProtection(tranche,{psl:false,tp:true});
        }
        this.status=`${reason} · tranche ${tranche.trancheId} remaining ${tranche.remainingQty} protected`;this.emit("tranche-exit-partial-protected");
      }finally{if(branch&&branch.executionLock===lock){branch.executionLock=null;this.persistTrancheBook();}}
    }
    async cancelTrancheProtection(tranche,{keep=null}={}){
      if(!tranche)return;const symbol=this.gateway.symbol(),jobs=[];
      if(keep!=="TP"&&(tranche.partialTpOrderId||tranche.partialTpClientId))jobs.push(this.gateway.cancelOrder({symbol,...(tranche.partialTpOrderId?{orderId:tranche.partialTpOrderId}:{origClientOrderId:tranche.partialTpClientId})}).catch(()=>null));
      if(keep!=="PSL"&&(tranche.pslOrderId||tranche.pslClientId))jobs.push(this.gateway.cancelAlgoOrder({symbol,...(tranche.pslOrderId?{algoId:tranche.pslOrderId}:{clientAlgoId:tranche.pslClientId})}).catch(()=>null));
      await Promise.all(jobs);
    }
    async finishTranche(tranche,reason,{skipCancel=false}={}){
      if(!tranche||upper(tranche.status)==="CLOSED")return tranche;
      if(!skipCancel)await this.cancelTrancheProtection(tranche,{keep:reason==="PARTIAL_TP"?"TP":reason==="PSL"?"PSL":null});
      tranche.closedQty=n(tranche.closedQty)||n(tranche.filledQty)||0;tranche.closedPrice=n(tranche.closedPrice)||(reason==="PARTIAL_TP"?n(tranche.partialTpPrice):reason==="PSL"?n(tranche.pslPrice):n(this.guide));tranches.close(this.book,tranche.trancheId,{reason,closedAt:this.now()});this.recordTrancheClosed(tranche,reason);this.fillIdsByTranche.delete(tranche.trancheId);this.persistTrancheBook();
      const branch=tranches.directionBook(this.book,tranche.direction);if(branch){branch.state="IDLE";branch.executionLock=null;}
      const counts=this.trancheCounts();this.status=`${reason} · tranche ${tranche.trancheId} closed · LONG ${counts.LONG} SHORT ${counts.SHORT}`;this.emit("tranche-closed");return tranche;
    }
    async emergencyCloseTranche(tranche,reason){
      if(!tranche||!(n(tranche.remainingQty)>0))return;await this.cancelTrancheProtection(tranche);const side=tranche.direction==="LONG"?"SELL":"BUY";
      const response=await this.gateway.submitOrder(this.orderParams(side,tranche.remainingQty,{clientId:tranche.exitClientId,positionSide:tranche.direction,reduceOnly:true}));tranche.exitOrderId=response&&response.orderId||null;tranche.closedPrice=n(response&&response.avgPrice)||n(this.guide);tranche.closedQty=this.normalizedOrderQuantity(n(response&&response.executedQty)||n(tranche.remainingQty));await this.finishTranche(tranche,reason,{skipCancel:true});
    }
    async closeNow(){
      const active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));for(const tranche of active)await this.emergencyCloseTranche(tranche,"CLOSE_NOW");return this.snapshot();
    }
    fail(error,prefix){const message=error&&error.message||String(error);this.log("error",{message});for(const direction of tranches.DIRECTIONS){const branch=tranches.directionBook(this.book,direction);branch.executionLock=null;if(branch.state!=="IDLE")branch.state="ERROR";}this.persistTrancheBook();if(this.state!=="ERROR"&&C.transitions[this.state]&&C.transitions[this.state].includes("ERROR"))this.transition("ERROR",`${prefix}: ${message}`);else{this.status=`ERROR · ${prefix}: ${message}`;this.emit("error");}}
    async queryProtectionStatus(tranche){
      const result={tp:null,psl:null};try{result.tp=await this.gateway.queryOrder({symbol:this.gateway.symbol(),origClientOrderId:tranche.partialTpClientId});}catch(_e){}try{result.psl=await this.gateway.queryAlgoOrder({symbol:this.gateway.symbol(),clientAlgoId:tranche.pslClientId});}catch(_e){}return result;
    }
    async reconcileExternalActiveReduction(active,ownedIds){
      const reconciledIds=new Set(),tolerance=Math.max(1e-8,(n(this.filters&&this.filters.stepSize)||0)*1e-6);
      for(const direction of tranches.DIRECTIONS){
        const directional=active.filter(row=>row.direction===direction),trackedQty=directional.reduce((sum,row)=>sum+(n(row.remainingQty)||0),0),liveQty=n(this.position(direction)&&this.position(direction).qty)||0;
        let excess=Math.max(0,trackedQty-liveQty);if(excess<=tolerance)continue;
        // Binance exposes one net hedge-mode quantity, so an external reduction cannot identify
        // which local add was closed. Reconcile deterministically newest-first, preserving the
        // oldest tranche coverage and its designated protection for as long as possible.
        // Every status returned by activeTranches represents claimed backing exposure. Transitional
        // records (especially PROTECTION_PENDING persisted just before a failed/reloaded submit)
        // must be reconciled too; otherwise a flat exchange can leave a phantom tranche that the
        // later protection-rebuild pass mistakes for real exposure.
        const candidates=directional.map((row,index)=>({row,index})).sort((a,b)=>(n(b.row.createdAt)||0)-(n(a.row.createdAt)||0)||b.index-a.index);
        for(const {row:tranche} of candidates){
          if(excess<=tolerance)break;const before=n(tranche.remainingQty)||0;if(!(before>0))continue;
          const ids=[tranche.pslClientId,tranche.partialTpClientId].filter(Boolean),skipCancel=!!ownedIds&&!ids.some(id=>ownedIds.has(id));ids.forEach(id=>{reconciledIds.add(id);if(ownedIds)ownedIds.delete(id);});
          if(excess+tolerance>=before){
            tranche.externalCloseQuantity=before;tranche.closedQty=before;tranche.closedPrice=n(this.guide);await this.finishTranche(tranche,"MANUAL_EXTERNAL_CLOSE",{skipCancel});excess=Math.max(0,excess-before);continue;
          }
          await this.cancelTrancheProtection(tranche);const remaining=calc.normalizeLot(Math.max(0,before-excess),this.filters||{}),closed=Math.max(0,before-remaining);
          tranche.remainingQty=remaining;tranche.externalCloseQuantity=(n(tranche.externalCloseQuantity)||0)+closed;tranche.lastExternalReductionAt=this.now();tranche.pslOrderId=null;tranche.partialTpOrderId=null;tranche.status="ACTIVE";this.persistTrancheBook();
          this.logActivity("TRANCHE_EXTERNALLY_REDUCED",{sourceTimeframe:tranche.source,positionState:{direction,trancheId:tranche.trancheId,closedQuantity:closed,remainingQuantity:remaining,...clone(tranche)}});excess=Math.max(0,excess-closed);
        }
      }
      return reconciledIds;
    }
    async recover(options={}){
      let facts;try{facts=await this.readExchangeFacts();}catch(error){this.status=`ERROR · recovery read failed: ${error&&error.message||error}`;if(this.state!=="ERROR"&&C.transitions[this.state]&&C.transitions[this.state].includes("ERROR"))this.transition("ERROR",this.status);else this.emit("recovery-read-failed");throw error;}
      if(!this.filters){const raw=await this.gateway.filters(this.gateway.symbol());this.filters=normalizedFilters(raw);}
      const orders=snapshotOrders(facts&&facts.orders),owned=orders.filter(isOwned),ownedIds=new Set(owned.map(orderClient));let active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));
      if(!active.length){
        const live=this.position();if(owned.length){const adopted=this.adoptOrphanedTranches(owned);if(!adopted.ok){const message=`ERROR · unresolved SCALP-owned orders: ${adopted.error}`;if(this.state!=="ERROR")this.transition("ERROR",message);else{this.status=message;this.emit("orphan-recovery-refused");}return;}active=adopted.tranches;if(this.state==="ERROR"||this.state==="POSITION_MISMATCH")this.transition("OFF","Orphan SCALP orders reconciled");}
        else{
          this.setExternalPosition(live);
          if(!live&&(this.state==="ERROR"||this.state==="POSITION_MISMATCH")){this.transition("OFF","Exchange position reconciled · manual ARM required");return;}
          if(this.state!=="ARMED")this.status=this.externalPositionText(live);this.emit(options.reconnect?"reconnect-flat":"recovered-flat");return;
        }
      }
      let unprotected=active.filter(row=>upper(row.status)==="UNPROTECTED");
      if(unprotected.length){
        const tolerance=Math.max(1e-8,(n(this.filters&&this.filters.stepSize)||0)*1e-6);
        for(const direction of tranches.DIRECTIONS){
          const broken=unprotected.filter(row=>row.direction===direction);if(!broken.length)continue;
          const protectedQty=active.filter(row=>row.direction===direction&&upper(row.status)!=="UNPROTECTED").reduce((sum,row)=>sum+(n(row.remainingQty)||0),0),liveQty=n(this.position(direction)&&this.position(direction).qty)||0;
          if(Math.abs(liveQty-protectedQty)<=tolerance)for(const tranche of broken){tranche.closedQty=n(tranche.remainingQty)||n(tranche.filledQty)||0;tranche.closedPrice=n(this.guide);await this.finishTranche(tranche,"MANUAL_EXTERNAL_CLOSE",{skipCancel:true});}
        }
        active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));unprotected=active.filter(row=>upper(row.status)==="UNPROTECTED");
      }
      if(unprotected.length){
        const message=`ERROR · ${tranches.DIRECTIONS.map(direction=>{const protectedQty=active.filter(row=>row.direction===direction&&upper(row.status)!=="UNPROTECTED").reduce((sum,row)=>sum+(n(row.remainingQty)||0),0),liveQty=n(this.position(direction)&&this.position(direction).qty)||0,qty=Math.max(0,liveQty-protectedQty)||unprotected.filter(row=>row.direction===direction).reduce((sum,row)=>sum+(n(row.remainingQty)||0),0);return qty>0?this.unprotectedQuantityText(direction,qty):null;}).filter(Boolean).join(" ")}`;
        if(this.state!=="ERROR"&&C.transitions[this.state]&&C.transitions[this.state].includes("ERROR"))this.transition("ERROR",message);else{this.status=message;this.emit("unprotected-tranche-recovered");}
        return;
      }
      const knownIds=new Set(active.flatMap(row=>[row.entryClientId,row.pslClientId,row.partialTpClientId,row.profitLockClientId,row.exitClientId].filter(Boolean))),unknown=owned.filter(order=>!knownIds.has(orderClient(order)));if(unknown.length){if(this.state!=="POSITION_MISMATCH"&&C.transitions[this.state]&&C.transitions[this.state].includes("POSITION_MISMATCH"))this.transition("POSITION_MISMATCH","POSITION MISMATCH · unknown SCALP orders found");return;}
      // Resolve known exchange fills before treating any remaining directional deficit as an
      // external manual close. Otherwise a legitimate tranche PSL/TP fill could be misclassified.
      for(const tranche of active){
        const hasPsl=ownedIds.has(tranche.pslClientId),hasTp=ownedIds.has(tranche.partialTpClientId);if(hasPsl&&hasTp){tranche.status="ACTIVE";continue;}
        const status=await this.queryProtectionStatus(tranche),tpStatus=upper(status.tp&&(status.tp.status??status.tp.orderStatus)),pslStatus=upper(status.psl&&(status.psl.status??status.psl.orderStatus));
        if(tpStatus==="FILLED"){tranche.closedPrice=n(status.tp.avgPrice)||n(tranche.partialTpPrice);tranche.closedQty=n(status.tp.executedQty)||n(tranche.filledQty);await this.finishTranche(tranche,"PARTIAL_TP");continue;}
        if(pslStatus==="FILLED"){tranche.closedPrice=n(status.psl.avgPrice)||n(tranche.pslPrice);tranche.closedQty=n(status.psl.executedQty)||n(tranche.filledQty);await this.finishTranche(tranche,"PSL");continue;}
        const tpExecuted=n(status.tp&&status.tp.executedQty)||0,pslExecuted=n(status.psl&&status.psl.executedQty)||0,partialExecuted=Math.max(tpExecuted,pslExecuted);
        if(partialExecuted>0){
          tranche.exitExecutedQty=Math.max(n(tranche.exitExecutedQty)||0,partialExecuted);tranche.remainingQty=Math.max(0,(n(tranche.filledQty)||0)-tranche.exitExecutedQty);
          if(!(tranche.remainingQty>0)){tranche.closedPrice=tpExecuted>=pslExecuted?n(status.tp&&status.tp.avgPrice)||n(tranche.partialTpPrice):n(status.psl&&status.psl.avgPrice)||n(tranche.pslPrice);tranche.closedQty=n(tranche.filledQty)||partialExecuted;await this.finishTranche(tranche,tpExecuted>=pslExecuted?"PARTIAL_TP":"PSL");continue;}
          await this.cancelTrancheProtection(tranche);ownedIds.delete(tranche.pslClientId);ownedIds.delete(tranche.partialTpClientId);tranche.pslOrderId=null;tranche.partialTpOrderId=null;this.persistTrancheBook();
        }
      }
      active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));await this.reconcileExternalActiveReduction(active,ownedIds);active=tranches.DIRECTIONS.flatMap(direction=>tranches.activeTranches(this.book,direction));
      // Directional coverage alone cannot authorize a protection rebuild: another browser or manual
      // trade can contribute to the same hedge-mode net position. Require Binance to confirm the
      // exact SCALP entry order and its executed quantity before submitting any replacement order.
      for(const tranche of active){
        const hasPsl=ownedIds.has(tranche.pslClientId),hasTp=ownedIds.has(tranche.partialTpClientId);if(hasPsl&&hasTp){tranche.status="ACTIVE";continue;}
        const verification=await this.verifyRecoveryEntry(tranche);
        if(!verification.ok){this.refuseRecoveryProtection(tranche,verification.reason);return;}
        if(!hasPsl)tranche.pslOrderId=null;if(!hasTp)tranche.partialTpOrderId=null;
        const requested={psl:!hasPsl,tp:!hasTp},detail={verification,requested};
        this.logActivity("PROTECTION_REBUILD_STARTED",this.recoveryProtectionDetail(tranche,detail));
        try{
          await this.ensureTrancheProtection(tranche,requested);
          this.logActivity("PROTECTION_REBUILD_SUCCEEDED",this.recoveryProtectionDetail(tranche,detail));
        }catch(error){
          tranche.recoveryProtectionFailure={at:this.now(),reason:error&&error.message||String(error)};this.persistTrancheBook();
          this.logActivity("PROTECTION_REBUILD_FAILED",this.recoveryProtectionDetail(tranche,{...detail,error:tranche.recoveryProtectionFailure.reason}));
          throw error;
        }
      }
      for(const direction of tranches.DIRECTIONS){const expected=tranches.activeQuantity(this.book,direction),live=n(this.position(direction)&&this.position(direction).qty)||0;if(Math.abs(expected-live)>1e-8){if(this.state!=="POSITION_MISMATCH"&&C.transitions[this.state]&&C.transitions[this.state].includes("POSITION_MISMATCH"))this.transition("POSITION_MISMATCH",`POSITION MISMATCH · ${direction} exchange ${live} vs tranches ${expected}`);return;}}
      this.setExternalPosition(null);this.persistTrancheBook();const counts=this.trancheCounts(),message=counts.LONG+counts.SHORT>0?`ACTIVE · recovered LONG ${counts.LONG} SHORT ${counts.SHORT} · manual ARM required for adds`:"Exchange position reconciled · manual ARM required";if(this.state==="ERROR"||this.state==="POSITION_MISMATCH")this.transition("OFF",message);else{if(this.state!=="ARMED")this.status=message;this.emit(options.reconnect?"reconnected":"recovered");}
    }
    getDiagnostics(){return {snapshot:this.snapshot(),transitions:this.diagnostics.slice(),baseline:[...this.baseline],seen:[...this.seen],rankRejected:[...this.rankRejected],cascade:this.cascadeState(),feeAssumptions:{rates:{...this.rates},entry:"MARKET/taker per tranche",tp:"LIMIT/max(account maker,taker) per tranche",sl:"STOP_MARKET/taker per tranche",fundingStatus:"no-known-settlement"},currentDetections:Object.fromEntries([...this.latestBySource].map(([source,value])=>[source,clone(value)])),lastQualified:Object.fromEntries([...this.lastQualifiedBySource].map(([source,value])=>[source,clone(value)])),detector:this.detector&&typeof this.detector.diagnostics==="function"?this.detector.diagnostics():null};}
  }
  root.ScalpEngine=ScalpEngine;root.stateTools=Object.freeze({clientId,trancheId,trancheClientId,isOwned,orderClient,orphanRole,snapshotOrders,normalizedFilters,quoteAsset});
})();
