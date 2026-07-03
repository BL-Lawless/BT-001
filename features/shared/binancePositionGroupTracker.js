(function(){
  "use strict";

  const MODULE = "BT001_POSITION_GROUPS_V1";
  const STORE_KEY = "bt001_position_groups_v1";
  const MAX_META_ROWS = 600;

  if(typeof window === "undefined" || window.BT001PositionGroups) return;

  const state = loadState();

  function nowMs(){
    return Date.now();
  }
  function num(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function upper(value){
    return String(value == null ? "" : value).toUpperCase();
  }
  function safeClone(value){
    if(value == null || typeof value !== "object") return value;
    if(typeof structuredClone === "function"){
      try{ return structuredClone(value); }catch(_e){}
    }
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }
  function symbolKey(symbol){
    return upper(symbol).replace(/[^A-Z0-9]/g,"");
  }
  function sideOf(positionLike){
    const explicit = upper(positionLike && positionLike.side);
    if(explicit === "LONG" || explicit === "SHORT") return explicit;
    const ps = upper(positionLike && positionLike.positionSide);
    if(ps === "LONG" || ps === "SHORT") return ps;
    const amt = num(positionLike && positionLike.positionAmt);
    if(amt != null && Math.abs(amt) > 1e-12) return amt < 0 ? "SHORT" : "LONG";
    return "";
  }
  function positionSideOf(positionLike){
    const ps = upper(positionLike && positionLike.positionSide);
    if(ps === "LONG" || ps === "SHORT") return ps;
    const side = sideOf(positionLike);
    return side === "LONG" || side === "SHORT" ? side : "";
  }
  function normalizePosition(symbol,positionLike){
    const sym = symbolKey(symbol || positionLike && positionLike.symbol);
    if(!sym || !positionLike) return null;
    const qty = Math.abs(
      num(positionLike.qty) ??
      num(positionLike.positionAmt) ??
      num(positionLike.lot) ??
      0
    );
    if(!(qty > 0)) return null;
    return {
      symbol:sym,
      side:sideOf(positionLike) || "LONG",
      positionSide:positionSideOf(positionLike) || sideOf(positionLike) || "LONG",
      qty,
      entry:num(positionLike.entry) ?? num(positionLike.entryPrice) ?? num(positionLike.avg) ?? null
    };
  }
  function minuteStamp(ts){
    const dt = new Date(ts);
    const pad = value => String(value).padStart(2,"0");
    return (
      pad(dt.getFullYear() % 100) +
      pad(dt.getMonth() + 1) +
      pad(dt.getDate()) +
      pad(dt.getHours()) +
      pad(dt.getMinutes())
    );
  }
  function nextMinuteSuffix(stamp){
    const current = Math.max(0,Number(state.groupCountersByMinute[stamp]) || 0) + 1;
    state.groupCountersByMinute[stamp] = current;
    return current.toString(36).toUpperCase().padStart(2,"0").slice(-2);
  }
  function generateGroupId(side,ts){
    const stamp = minuteStamp(ts == null ? nowMs() : ts);
    const suffix = nextMinuteSuffix(stamp);
    return "BT1" + (side === "SHORT" ? "S" : "L") + stamp + suffix;
  }
  function sanitizeRoleCode(roleCode){
    const raw = upper(roleCode).replace(/[^A-Z0-9]/g,"");
    return raw ? raw.slice(0,1) : "X";
  }
  function roleTypeFromCode(roleCode,fallback){
    const code = sanitizeRoleCode(roleCode);
    if(code === "P") return "PSL";
    if(code === "M") return "MASTER_SL";
    if(code === "C") return "CHASE_CLOSE";
    if(code === "X") return "EXIT";
    return upper(fallback || code);
  }
  function clientIdInfo(clientId){
    const raw = upper(clientId).trim();
    const match = raw.match(/^(BT1[LS][A-Z0-9]{12})_([A-Z])([0-9]{2,})$/);
    if(!match) return null;
    return {
      positionGroupId:match[1],
      roleCode:match[2],
      roleType:roleTypeFromCode(match[2]),
      sequence:Number(match[3]) || 0,
      clientId:raw
    };
  }
  function activeGroup(symbol){
    const sym = symbolKey(symbol);
    return sym ? state.activeBySymbol[sym] || null : null;
  }
  function retiredGroup(symbol){
    const sym = symbolKey(symbol);
    return sym ? state.retiredBySymbol[sym] || null : null;
  }
  function cleanedGroup(symbol){
    const sym = symbolKey(symbol);
    return sym ? state.cleanedBySymbol[sym] || null : null;
  }
  function saveState(){
    pruneOrderMeta();
    try{
      localStorage.setItem(STORE_KEY,JSON.stringify(state));
    }catch(_e){}
  }
  function loadState(){
    const base = {
      version:1,
      activeBySymbol:{},
      retiredBySymbol:{},
      cleanedBySymbol:{},
      orderMetaByClientId:{},
      orderMetaByBinanceKey:{},
      groupCountersByMinute:{}
    };
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if(!raw) return base;
      const parsed = JSON.parse(raw);
      return {
        version:1,
        activeBySymbol:parsed && parsed.activeBySymbol ? parsed.activeBySymbol : {},
        retiredBySymbol:parsed && parsed.retiredBySymbol ? parsed.retiredBySymbol : {},
        cleanedBySymbol:parsed && parsed.cleanedBySymbol ? parsed.cleanedBySymbol : {},
        orderMetaByClientId:parsed && parsed.orderMetaByClientId ? parsed.orderMetaByClientId : {},
        orderMetaByBinanceKey:parsed && parsed.orderMetaByBinanceKey ? parsed.orderMetaByBinanceKey : {},
        groupCountersByMinute:parsed && parsed.groupCountersByMinute ? parsed.groupCountersByMinute : {}
      };
    }catch(_e){
      return base;
    }
  }
  function binanceKeys(meta){
    const keys = [];
    if(meta && meta.orderId != null && String(meta.orderId).trim() !== "") keys.push("order:" + String(meta.orderId).trim());
    if(meta && meta.algoId != null && String(meta.algoId).trim() !== "") keys.push("algo:" + String(meta.algoId).trim());
    return keys;
  }
  function clientKeys(meta){
    const keys = [];
    if(meta && meta.clientOrderId) keys.push(String(meta.clientOrderId).trim());
    if(meta && meta.clientAlgoId) keys.push(String(meta.clientAlgoId).trim());
    return keys.filter(Boolean);
  }
  function mergeMeta(existing,extra){
    const merged = Object.assign({},existing || {},extra || {});
    if(!merged.positionGroupId){
      const inferred = clientIdInfo(merged.clientOrderId) || clientIdInfo(merged.clientAlgoId);
      if(inferred){
        merged.positionGroupId = inferred.positionGroupId;
        if(!merged.roleCode) merged.roleCode = inferred.roleCode;
        if(!merged.roleType) merged.roleType = inferred.roleType;
      }
    }
    merged.symbol = symbolKey(merged.symbol);
    merged.side = upper(merged.side);
    merged.positionSide = upper(merged.positionSide);
    merged.roleCode = sanitizeRoleCode(merged.roleCode);
    merged.roleType = roleTypeFromCode(merged.roleCode,merged.roleType);
    merged.owner = upper(merged.owner);
    merged.updatedAt = nowMs();
    if(!merged.createdAt) merged.createdAt = merged.updatedAt;
    return merged;
  }
  function pruneOrderMeta(){
    const rows = Object.values(state.orderMetaByClientId || {});
    if(rows.length <= MAX_META_ROWS) return;
    rows.sort((a,b) => Number(a && a.updatedAt || 0) - Number(b && b.updatedAt || 0));
    const keep = new Set(rows.slice(-MAX_META_ROWS).map(row => String((row && (row.clientOrderId || row.clientAlgoId)) || "")));
    const nextClientMap = {};
    const nextBinanceMap = {};
    Object.keys(state.orderMetaByClientId || {}).forEach(key => {
      const row = state.orderMetaByClientId[key];
      if(!row) return;
      const primary = String((row.clientOrderId || row.clientAlgoId || "")).trim();
      if(!primary || !keep.has(primary)) return;
      nextClientMap[key] = row;
      binanceKeys(row).forEach(id => { nextBinanceMap[id] = row; });
    });
    state.orderMetaByClientId = nextClientMap;
    state.orderMetaByBinanceKey = nextBinanceMap;
  }
  function registerOrderMeta(metaLike){
    const merged = mergeMeta(findOrderMeta(metaLike) || {},metaLike || {});
    if(!merged.positionGroupId && !clientKeys(merged).length && !binanceKeys(merged).length) return null;
    clientKeys(merged).forEach(key => { state.orderMetaByClientId[key] = merged; });
    binanceKeys(merged).forEach(key => { state.orderMetaByBinanceKey[key] = merged; });
    saveState();
    return safeClone(merged);
  }
  function findOrderMeta(metaLike){
    if(!metaLike || typeof metaLike !== "object") return null;
    for(const key of clientKeys(metaLike)){
      if(state.orderMetaByClientId[key]) return safeClone(state.orderMetaByClientId[key]);
    }
    for(const key of binanceKeys(metaLike)){
      if(state.orderMetaByBinanceKey[key]) return safeClone(state.orderMetaByBinanceKey[key]);
    }
    const inferred = clientIdInfo(metaLike.clientOrderId) || clientIdInfo(metaLike.clientAlgoId);
    if(!inferred) return null;
    return mergeMeta({},Object.assign({},metaLike,inferred));
  }
  function syncPosition(symbol,positionLike){
    const next = normalizePosition(symbol,positionLike);
    if(!next) return {active:null,created:false,retired:null};
    const sym = next.symbol;
    let retired = null;
    const current = activeGroup(sym);
    if(current && (upper(current.side) !== next.side || upper(current.positionSide) !== next.positionSide)){
      retired = retireActiveGroup(sym,{reason:"flip",side:current.side,positionSide:current.positionSide});
    }
    let active = activeGroup(sym);
    let created = false;
    if(!active){
      active = {
        symbol:sym,
        positionGroupId:generateGroupId(next.side,nowMs()),
        side:next.side,
        positionSide:next.positionSide,
        openedAt:nowMs(),
        lastSeenAt:nowMs(),
        lastKnownQty:next.qty,
        lastKnownEntry:next.entry,
        roleSeqByCode:{}
      };
      state.activeBySymbol[sym] = active;
      created = true;
    }else{
      active.side = next.side;
      active.positionSide = next.positionSide;
      active.lastSeenAt = nowMs();
      active.lastKnownQty = next.qty;
      active.lastKnownEntry = next.entry;
      if(!(active.roleSeqByCode && typeof active.roleSeqByCode === "object")) active.roleSeqByCode = {};
    }
    saveState();
    return {active:safeClone(active),created,retired};
  }
  function retireActiveGroup(symbol,details){
    const sym = symbolKey(symbol || details && details.symbol);
    if(!sym) return null;
    const current = activeGroup(sym);
    if(!current) return null;
    delete state.activeBySymbol[sym];
    const retired = Object.assign({},current,{
      retiredAt:nowMs(),
      reason:details && details.reason ? String(details.reason) : "flat"
    });
    state.retiredBySymbol[sym] = retired;
    saveState();
    return safeClone(retired);
  }
  function nextChildClientId(options){
    const opts = options || {};
    const position = normalizePosition(opts.symbol,opts.position) || normalizePosition(opts.symbol,activeGroup(opts.symbol));
    if(!position) return "";
    const synced = syncPosition(position.symbol,position);
    const active = synced && synced.active ? synced.active : activeGroup(position.symbol);
    if(!active) return "";
    const roleCode = sanitizeRoleCode(opts.roleCode);
    const seqMap = active.roleSeqByCode || {};
    const seq = Math.max(0,Number(seqMap[roleCode]) || 0) + 1;
    seqMap[roleCode] = seq;
    active.roleSeqByCode = seqMap;
    active.lastSeenAt = nowMs();
    state.activeBySymbol[position.symbol] = active;
    saveState();
    return active.positionGroupId + "_" + roleCode + String(seq).padStart(2,"0");
  }
  function cleanupHandled(symbol,positionGroupId){
    const sym = symbolKey(symbol);
    const row = cleanedGroup(sym);
    return !!(sym && row && row.positionGroupId && row.positionGroupId === String(positionGroupId || ""));
  }
  function markCleanupHandled(symbol,positionGroupId){
    const sym = symbolKey(symbol);
    const groupId = String(positionGroupId || "").trim();
    if(!sym || !groupId) return;
    state.cleanedBySymbol[sym] = {positionGroupId:groupId,at:nowMs()};
    saveState();
  }
  function clearCleanupHandled(symbol){
    const sym = symbolKey(symbol);
    if(!sym) return;
    delete state.cleanedBySymbol[sym];
    saveState();
  }

  window.BT001PositionGroups = {
    version:MODULE,
    normalizePosition(symbol,positionLike){ return normalizePosition(symbol,positionLike); },
    syncPosition,
    retireActiveGroup,
    getActiveGroup(symbol){ return safeClone(activeGroup(symbol)); },
    getRetiredGroup(symbol){ return safeClone(retiredGroup(symbol)); },
    nextChildClientId,
    parseClientId(clientId){
      const parsed = clientIdInfo(clientId);
      return parsed ? safeClone(parsed) : null;
    },
    registerOrderMeta,
    lookupOrderMeta(orderLike){
      const found = findOrderMeta(orderLike || {});
      return found ? safeClone(found) : null;
    },
    positionGroupIdFor(orderLike){
      const found = findOrderMeta(orderLike || {});
      return found && found.positionGroupId ? found.positionGroupId : null;
    },
    roleTypeFromCode(roleCode,fallback){ return roleTypeFromCode(roleCode,fallback); },
    cleanupHandled,
    markCleanupHandled,
    clearCleanupHandled
  };
})();
