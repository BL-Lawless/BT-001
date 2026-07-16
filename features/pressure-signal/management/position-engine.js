(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};

  build.createPositionEngine = function createPositionEngine(config,format){
    const campaigns = new Map();
    const recordedAnchors = new Map();
    let selectedHorizon = null;

    try{
      const saved = String(localStorage.getItem(config.storage.managementHorizon) || "");
      if(config.managementHorizons[saved]) selectedHorizon = saved;
    }catch(_e){}

    const numeric = format.number;
    const sideNumber = side => String(side).toUpperCase() === "SHORT" ? -1 : 1;
    const campaignKey = facts => `${facts.symbol}|${facts.position.side}`;
    const relativeChange = (next,previous) => previous > 0 ? Math.abs(next-previous)/previous : next === previous ? 0 : Infinity;
    const rowsFor = (facts,tf,closed=true) => {
      const map = closed ? facts.closedByTf : facts.rowsByTf;
      return Array.isArray(map && map[tf]) ? map[tf] : [];
    };
    const last = rows => Array.isArray(rows) && rows.length ? rows[rows.length-1] : null;
    const maSnapshot = (facts,tf,closed=true) => {
      const pair = facts.maByTf && facts.maByTf[tf];
      return pair ? (closed ? pair.closed : pair.live) : null;
    };
    const maValue = (facts,tf,slotId,closed=true) => numeric(maSnapshot(facts,tf,closed) && maSnapshot(facts,tf,closed).valuesBySlot && maSnapshot(facts,tf,closed).valuesBySlot[slotId]);
    const structure = (facts,tf,scope="swing") => {
      const snapshot = facts.structureByTf && facts.structureByTf[tf];
      return snapshot && snapshot[scope] || null;
    };
    const closedSignature = (facts,horizon) => [horizon.anchorTf,...horizon.triggerTfs,...horizon.regimeTfs]
      .map(tf => `${tf}:${numeric(last(rowsFor(facts,tf,true)) && last(rowsFor(facts,tf,true)).time) || 0}`)
      .join("|");

    function trueRangeAverage(rows,period=14){
      const source = (Array.isArray(rows) ? rows : []).slice(-(period+1));
      if(source.length < 3) return null;
      const values = [];
      for(let index=1;index<source.length;index++){
        const row = source[index];
        const previous = source[index-1];
        values.push(Math.max(
          Number(row.high)-Number(row.low),
          Math.abs(Number(row.high)-Number(previous.close)),
          Math.abs(Number(row.low)-Number(previous.close))
        ));
      }
      return values.reduce((sum,value) => sum+value,0)/values.length;
    }

    function trueRangeSeries(rows){
      const source = Array.isArray(rows) ? rows.filter(row => row && row.final !== false) : [];
      const values = [];
      for(let index=1;index<source.length;index++){
        const row = source[index];
        const previous = source[index-1];
        values.push(Math.max(
          Number(row.high)-Number(row.low),
          Math.abs(Number(row.high)-Number(previous.close)),
          Math.abs(Number(row.low)-Number(previous.close))
        ));
      }
      return values.filter(Number.isFinite);
    }

    function rollingAverage(values,period){
      const out = [];
      for(let index=period-1;index<values.length;index++){
        const window = values.slice(index-period+1,index+1);
        out.push(window.reduce((sum,value) => sum+value,0)/window.length);
      }
      return out;
    }

    function timeframeDataStatus(facts,tf){
      const item = facts.dataHealth && Array.isArray(facts.dataHealth.items)
        ? facts.dataHealth.items.find(entry => entry.tf === tf)
        : null;
      return item ? {status:item.status,ageMs:item.ageMs} : {status:"unavailable",ageMs:null};
    }

    function volatilityForTimeframe(facts,tf){
      const policy = config.volatility;
      const status = timeframeDataStatus(facts,tf);
      const rows = rowsFor(facts,tf,true).filter(row => row && row.final !== false);
      const ranges = trueRangeSeries(rows.slice(-(policy.historyCandles+policy.atrPeriod+1)));
      const history = rollingAverage(ranges,policy.atrPeriod).slice(-policy.historyCandles);
      if(status.status !== "sufficient" || history.length < policy.minimumSamples){
        return {available:false,tf,state:"UNAVAILABLE",percentile:null,atr:null,toleranceMultiplier:null,samples:history.length,required:policy.minimumSamples,status:status.status,ageMs:status.ageMs};
      }
      const atr = history[history.length-1];
      const percentile = history.length ? history.filter(value => value <= atr).length/history.length*100 : null;
      const regime = percentile < policy.quietPercentile ? "QUIET"
        : percentile < policy.highPercentile ? "NORMAL"
          : percentile < policy.extremePercentile ? "HIGH" : "EXTREME";
      return {available:true,tf,state:regime,percentile,atr,toleranceMultiplier:policy.toleranceMultipliers[regime],samples:history.length,required:policy.minimumSamples,status:status.status,ageMs:status.ageMs};
    }

    function volatilityRegime(facts,horizon){
      const primary = volatilityForTimeframe(facts,horizon.primaryTf);
      const context = volatilityForTimeframe(facts,horizon.contextTf);
      const contextConfirmation = !context.available || !primary.available ? "UNAVAILABLE" : context.state === primary.state ? "CONFIRMED" : "DIVERGENT";
      return {...primary,primaryTf:horizon.primaryTf,contextTf:horizon.contextTf,contextState:context.state,contextPercentile:context.percentile,contextAvailable:context.available,contextConfirmation};
    }

    function pressureShare(row,direction){
      const volume = numeric(row && (row.volume ?? row.baseVolume));
      const buy = numeric(row && row.takerBuyBase);
      if(!(volume > 0) || buy == null) return null;
      const buyShare = buy/volume;
      return direction > 0 ? buyShare : 1-buyShare;
    }

    function persistentPressure(facts,tf,direction,count){
      const rows = rowsFor(facts,tf,true).slice(-count);
      return rows.length >= count && rows.every(row => {
        const share = pressureShare(row,direction);
        return share != null && share >= config.pressure.strongShare;
      });
    }

    function initializeCampaign(facts){
      const key = campaignKey(facts);
      const position = facts.position;
      const currentPrice = numeric(facts.currentPrice);
      const floating = numeric(position.unrealizedPnl) ?? (currentPrice == null ? null : (currentPrice-position.price)*position.qty*sideNumber(position.side));
      const realized = numeric(position.realizedPnl) || 0;
      const campaignResult = floating == null ? realized : realized+floating;
      const margin = numeric(position.margin) ?? (numeric(position.leverage) > 0 ? position.price*Math.abs(position.qty)/position.leverage : null);
      const roi = floating != null && margin > 0 ? floating/margin*100 : null;
      const now = Number(facts.createdAt || Date.now());
      const existing = campaigns.get(key);
      if(!existing || existing.closedAt){
        const created = {
          key,symbol:facts.symbol,side:position.side,startedAt:now,
          epoch:1,epochStartedAt:now,epochBasis:{qty:Math.abs(position.qty),entry:position.price,margin,leverage:numeric(position.leverage)},
          epochHistory:[{epoch:1,startedAt:now,basis:{qty:Math.abs(position.qty),entry:position.price,margin,leverage:numeric(position.leverage)}}],
          currentRoi:roi,peakRoi:roi,peakAt:roi == null ? null : now,
          maxFavorablePrice:currentPrice,campaignMfe:campaignResult,campaignResult,
          initialQty:Math.abs(position.qty),maxQty:Math.abs(position.qty),partialProfitDetected:false,
          lifecycle:"FRESH",lifecycleBasis:"Original thesis and invalidation remain active",
          keyDefence:null,keyDefenceZoneWidth:null,originalInvalidation:null,lastMigrationKey:"",defenceMigration:null,
          health:"HEALTHY",healthHistory:[{state:"HEALTHY",at:now,reason:"Position campaign detected"}],
          pendingHealth:null,pendingCount:0,lastHealthSignature:"",paths:{A:{state:"CLEAR",history:[]},B:{state:"CLEAR",history:[]}},
          progress:{startedAt:now,startPrice:currentPrice,lastBasisKey:"",failedAttempts:0,state:"NORMAL"}
        };
        campaigns.set(key,created);
        return created;
      }
      const basis = existing.epochBasis;
      existing.maxQty = Math.max(Number(existing.maxQty || 0),Math.abs(position.qty));
      if(existing.maxQty > 0 && Math.abs(position.qty) <= existing.maxQty*(1-config.roiEpoch.quantityChange) && realized > 0){
        existing.partialProfitDetected = true;
      }
      const basisChanged = relativeChange(Math.abs(position.qty),basis.qty) >= config.roiEpoch.quantityChange
        || relativeChange(position.price,basis.entry) >= config.roiEpoch.entryChange
        || (margin != null && basis.margin != null && relativeChange(margin,basis.margin) >= config.roiEpoch.marginChange)
        || (numeric(position.leverage) != null && basis.leverage != null && relativeChange(position.leverage,basis.leverage) >= config.roiEpoch.leverageChange);
      if(basisChanged){
        existing.epoch += 1;
        existing.epochStartedAt = now;
        existing.epochBasis = {qty:Math.abs(position.qty),entry:position.price,margin,leverage:numeric(position.leverage)};
        existing.epochHistory.push({epoch:existing.epoch,startedAt:now,basis:{...existing.epochBasis}});
        if(existing.epochHistory.length > 20) existing.epochHistory.shift();
        existing.currentRoi = roi;
        existing.peakRoi = roi;
        existing.peakAt = roi == null ? null : now;
        existing.progress = {startedAt:now,startPrice:currentPrice,lastBasisKey:"",failedAttempts:0,state:"RESET"};
        existing.healthHistory.push({state:existing.health,at:now,reason:`ROI epoch ${existing.epoch} started after position basis changed`});
      }else{
        existing.currentRoi = roi;
        if(roi != null && (existing.peakRoi == null || roi > existing.peakRoi)){
          existing.peakRoi = roi;
          existing.peakAt = now;
        }
      }
      if(currentPrice != null){
        const better = existing.maxFavorablePrice == null || (sideNumber(position.side) > 0 ? currentPrice > existing.maxFavorablePrice : currentPrice < existing.maxFavorablePrice);
        if(better) existing.maxFavorablePrice = currentPrice;
      }
      existing.campaignResult = campaignResult;
      if(campaignResult != null && (existing.campaignMfe == null || campaignResult > existing.campaignMfe)) existing.campaignMfe = campaignResult;
      return existing;
    }

    function selectAnchor(facts,horizon,tracker){
      const key = campaignKey(facts);
      const recorded = recordedAnchors.get(key);
      if(recorded && recorded.level != null){
        const tf = recorded.tf || horizon.anchorTf;
        const userSelected = recorded.userSelected === true || recorded.selectionSource === "user-selected";
        return {
          ...recorded,tf,invalidation:numeric(recorded.invalidation) ?? recorded.level,
          source:userSelected ? "user-selected" : "system-selected",
          selectionSource:userSelected ? "user-selected" : "system-selected",
          defenceType:recorded.defenceType || recorded.family || "setup level",
          label:`${tf} ${recorded.defenceType || recorded.family || "setup level"}`
        };
      }
      const tf = horizon.anchorTf;
      const desired = sideNumber(facts.position.side);
      const swing = structure(facts,tf,"swing");
      const pivot = desired > 0 ? swing && swing.latestLow : swing && swing.latestHigh;
      const structuralLevel = numeric(pivot && pivot.price);
      const ema55 = maValue(facts,tf,"MA3",true);
      const level = structuralLevel ?? ema55 ?? facts.position.price;
      const defenceType = structuralLevel != null ? "structure" : ema55 != null ? "EMA55" : "entry basis";
      return {
        source:"system-selected",
        selectionSource:"system-selected",
        profile:selectedHorizon || facts.horizon,
        tf,level,defenceType,
        label:`${tf} ${defenceType}`,
        invalidation:level,
        expectedBehavior:`${facts.position.side} continuation should hold ${tf} ${structuralLevel != null ? "structure" : "EMA55"}`,
        inferred:true
      };
    }

    function positionLifecycle(facts,horizon,tracker,anchor){
      const desired = sideNumber(facts.position.side);
      const structureSnapshot = structure(facts,horizon.primaryTf,"swing");
      const event = structureSnapshot && structureSnapshot.latestEvent;
      const eventSide = event && event.direction === "bullish" ? 1 : event ? -1 : 0;
      const eventPrice = numeric(event && event.price);
      const breakTime = numeric(event && event.breakTime) || 0;
      const breakTimeMs = breakTime > 1e12 ? breakTime : breakTime*1000;
      const eventAfterPosition = breakTimeMs >= Number(tracker.startedAt || 0);
      const rows = rowsFor(facts,horizon.primaryTf,true).filter(row => numeric(row.time) >= breakTime);
      const held = eventPrice != null && rows.length >= horizon.confirmCloses && rows.slice(-horizon.confirmCloses).every(row => desired > 0 ? Number(row.close) > eventPrice : Number(row.close) < eventPrice);
      const retested = eventPrice != null && rows.some(row => Number(row.low) <= eventPrice && Number(row.high) >= eventPrice) && held;
      if(tracker.partialProfitDetected){
        tracker.lifecycle = "RUNNER";
        tracker.lifecycleBasis = "Meaningful partial profit realised; remainder managed against favourable structure";
      }else if(tracker.lifecycle === "FRESH" && eventAfterPosition && eventSide === desired && held){
        tracker.lifecycle = "ESTABLISHED";
        tracker.lifecycleBasis = `${horizon.primaryTf} ${retested ? "break and successful retest" : "favourable structure cleared and held"}`;
      }
      return {state:tracker.lifecycle,basis:tracker.lifecycleBasis,held,retested,event,eventPrice,eventAfterPosition};
    }

    function resolveKeyDefence(facts,horizon,tracker,volatility,lifecycle){
      const candidate = selectAnchor(facts,horizon,tracker);
      const desired = sideNumber(facts.position.side);
      const atr = volatility.atr || trueRangeAverage(rowsFor(facts,horizon.primaryTf,true),config.volatility.atrPeriod) || Math.max(Math.abs(facts.currentPrice || facts.position.price)*0.0005,1e-8);
      if(!tracker.keyDefence){
        tracker.keyDefence = {...candidate};
        if(candidate.source !== "system-selected" || candidate.recordedAt){
          tracker.originalInvalidation = {tf:candidate.tf,level:candidate.invalidation,source:candidate.source,label:candidate.label};
        }
      }else if(candidate.recordedAt && candidate.recordedAt !== tracker.keyDefence.recordedAt){
        tracker.keyDefence = {...candidate};
        tracker.originalInvalidation ||= {tf:candidate.tf,level:candidate.invalidation,source:candidate.source,label:candidate.label};
      }
      const current = tracker.keyDefence;
      const forward = desired > 0 ? candidate.level-current.level : current.level-candidate.level;
      const structureSnapshot = structure(facts,horizon.primaryTf,"swing");
      const event = structureSnapshot && structureSnapshot.latestEvent;
      const eventSide = event && event.direction === "bullish" ? 1 : event ? -1 : 0;
      const migrationKey = `${numeric(event && event.breakTime) || 0}|${Number(candidate.level).toPrecision(12)}`;
      const closes = rowsFor(facts,horizon.primaryTf,true).slice(-horizon.confirmCloses);
      const confirmedHold = closes.length >= horizon.confirmCloses && closes.every(row => desired > 0 ? Number(row.close) > candidate.level : Number(row.close) < candidate.level);
      const mayMigrate = lifecycle.state !== "FRESH" && candidate.source === "system-selected" && eventSide === desired
        && forward >= atr*config.managementLevels.migrationMinAtr && confirmedHold && migrationKey !== tracker.lastMigrationKey;
      if(mayMigrate){
        tracker.keyDefence = {...candidate};
        tracker.keyDefenceZoneWidth = null;
        tracker.lastMigrationKey = migrationKey;
        tracker.defenceMigration = {at:Number(facts.createdAt || Date.now()),from:current.level,to:candidate.level,basis:`${horizon.primaryTf} favourable structure confirmed and held on closed candles`};
      }
      const resolved = {...tracker.keyDefence};
      const proposedWidth = atr*config.managementLevels.zoneAtr*(volatility.toleranceMultiplier || 1);
      const latestClosed = last(rowsFor(facts,horizon.primaryTf,true));
      const crossedReference = !!(latestClosed && (desired > 0 ? Number(latestClosed.close) < resolved.level : Number(latestClosed.close) > resolved.level));
      const width = crossedReference && tracker.keyDefenceZoneWidth != null ? Math.min(proposedWidth,tracker.keyDefenceZoneWidth) : proposedWidth;
      tracker.keyDefenceZoneWidth = width;
      resolved.zone = {low:resolved.level-width,high:resolved.level+width,reference:resolved.level,width};
      resolved.failureBoundary = desired > 0 ? resolved.zone.low : resolved.zone.high;
      return {anchor:resolved,migration:tracker.defenceMigration,originalInvalidation:tracker.originalInvalidation,atr};
    }

    function levelRole(facts,level,anchor,atr){
      if(Array.isArray(level.roles) && level.roles.length) return level.roles;
      const desired = sideNumber(facts.position.side);
      const current = numeric(facts.currentPrice);
      const entry = numeric(facts.position.price);
      const price = numeric(level.reference);
      if(price == null || current == null) return ["distant context"];
      const ahead = (price-current)*desired >= 0;
      const beyondEntry = entry == null ? 0 : (price-entry)*desired;
      const distanceAtr = Math.abs(price-current)/Math.max(atr,1e-8);
      if(level.family === "original invalidation") return ["invalidation reinforcement"];
      if(level.family === "key defence") return ["defence"];
      if(level.family === "binance-exit") return ["objective"];
      if(level.family === "binance-protection") return ["defence"];
      if(level.family === "user"){
        const roles = beyondEntry < 0 ? ["invalidation reinforcement","defence"]
          : ahead ? ["objective",desired > 0 ? "resistance obstacle" : "support obstacle"]
            : ["retest level","defence"];
        if(distanceAtr > config.managementLevels.exceptionalDistanceAtr && !level.exceptional) roles.unshift("distant context");
        return roles;
      }
      if(distanceAtr > config.managementLevels.exceptionalDistanceAtr && !level.exceptional) return ["distant context"];
      if(ahead) return ["objective",desired > 0 ? "resistance obstacle" : "support obstacle"];
      return ["defence",desired > 0 ? "support" : "resistance"];
    }

    function interactionState(facts,level,horizon,volatility,atr){
      const desired = sideNumber(facts.position.side);
      const rows = rowsFor(facts,level.tf || horizon.primaryTf,false);
      const closed = rowsFor(facts,level.tf || horizon.primaryTf,true).slice(-3);
      const latest = rows.length ? rows[rows.length-1] : null;
      const zone = {low:level.low,high:level.high};
      const touched = [...closed,latest].filter(Boolean).some(row => Number(row.low) <= zone.high && Number(row.high) >= zone.low);
      const current = numeric(facts.currentPrice);
      const ahead = current == null ? false : (level.reference-current)*desired >= 0;
      const distance = current == null ? Infinity : current < zone.low ? zone.low-current : current > zone.high ? current-zone.high : 0;
      const approaching = distance <= atr*config.managementLevels.proximityAtr*(volatility.toleranceMultiplier || 1);
      const adverse = row => desired > 0 ? Number(row.close) < zone.low : Number(row.close) > zone.high;
      const supportive = row => desired > 0 ? Number(row.close) >= zone.high : Number(row.close) <= zone.low;
      const priorDistance = closed.length >= 2 ? Math.abs(Number(closed.at(-2).close)-level.reference) : null;
      const latestDistance = closed.length ? Math.abs(Number(closed.at(-1).close)-level.reference) : null;
      const approachQuality = priorDistance == null || latestDistance == null ? "unavailable" : latestDistance < priorDistance ? "improving" : latestDistance > priorDistance ? "moving away" : "flat";
      const failed = closed.length >= horizon.confirmCloses && closed.slice(-horizon.confirmCloses).every(adverse)
        && Math.abs(Number(closed.at(-1).close)-(desired > 0 ? zone.low : zone.high)) >= (zone.high-zone.low)*0.5;
      if(!ahead && failed) return {state:"FAILED",touched,formingWarning:false,confirmation:"Closed candle",approachQuality};
      if(!ahead && closed.length >= 2 && adverse(closed.at(-2)) && supportive(closed.at(-1))) return {state:"RECLAIMED",touched:true,formingWarning:false,confirmation:"Closed candle",approachQuality};
      const adverseMove = closed.length >= 2 && (Number(closed.at(-1).close)-Number(closed.at(-2).close))*desired < 0;
      if(touched && ahead && adverseMove && distance > (zone.high-zone.low)*0.5) return {state:"REJECTED",touched:true,formingWarning:false,confirmation:"Closed candle",approachQuality};
      if(!ahead && touched && closed.length >= 2 && closed.slice(-2).every(supportive)) return {state:"HOLDING",touched:true,formingWarning:false,confirmation:"Closed candle",approachQuality};
      const opposing = (facts.samples || []).some(sample => sample.available && sample.tf === horizon.primaryTf && sample.sideSign === -desired && Number(sample.dominantPct || 0) >= config.pressure.materialShare);
      const emaDegrading = level.family === "moving averages" && ((level.emaSlope != null && level.emaSlope*desired < 0) || level.stackCondition === "opposed");
      if(touched && adverseMove && (opposing || emaDegrading)) return {state:"WEAKENING",touched:true,formingWarning:!!(latest && latest.final === false),confirmation:latest && latest.final === false ? "Forming candle" : "Closed candle",approachQuality};
      if(touched) return {state:"TESTING",touched:true,formingWarning:!!(latest && latest.final === false),confirmation:latest && latest.final === false ? "Forming candle" : "Closed candle",approachQuality};
      if(approaching) return {state:"APPROACHING",touched:false,formingWarning:false,confirmation:"Proximity",approachQuality};
      return {state:null,touched:false,formingWarning:false,confirmation:"Unavailable",approachQuality};
    }

    function buildManagementLevelMap(facts,horizon,anchor,originalInvalidation,volatility,atr){
      const current = numeric(facts.currentPrice);
      const desired = sideNumber(facts.position.side);
      const raw = [];
      const add = spec => {
        const reference = numeric(spec.reference ?? spec.price);
        if(reference == null) return;
        const width = numeric(spec.width) ?? atr*config.managementLevels.zoneAtr*(volatility.toleranceMultiplier || 1);
        const low = numeric(spec.low) ?? reference-width;
        const high = numeric(spec.high) ?? reference+width;
        const distance = current == null ? null : Math.abs(reference-current);
        const level = {
          id:spec.id || `level-${raw.length}`,reference,low:Math.min(low,high),high:Math.max(low,high),
          source:spec.source || "System level",tf:spec.tf || horizon.primaryTf,family:spec.family || "structure",
          distance,distanceAtr:distance == null ? null : distance/Math.max(atr,1e-8),
          ahead:current == null ? null : (reference-current)*desired >= 0,
          behind:current == null ? null : (reference-current)*desired < 0,
          exceptional:!!spec.exceptional,requestedRole:spec.role || null,emaSlope:numeric(spec.emaSlope),stackCondition:spec.stackCondition || null,mergedZoneId:null
        };
        level.roles = spec.role ? [spec.role] : levelRole(facts,level,anchor,atr);
        const interaction = interactionState(facts,level,horizon,volatility,atr);
        Object.assign(level,{interactionState:interaction.state,interactionConfirmation:interaction.confirmation,approachQuality:interaction.approachQuality,formingWarning:interaction.formingWarning});
        level.relevance = level.interactionState ? "active"
          : level.exceptional ? "exceptional"
            : level.distanceAtr != null && level.distanceAtr <= horizon.materiallyCloseAtr[1] ? "nearby" : "contextual";
        raw.push(level);
      };

      if(originalInvalidation && numeric(originalInvalidation.level) != null){
        add({id:"original-invalidation",reference:originalInvalidation.level,tf:originalInvalidation.tf || horizon.primaryTf,source:"Original setup invalidation",family:"original invalidation",exceptional:true});
      }
      add({id:"key-defence",reference:anchor.level,low:anchor.zone.low,high:anchor.zone.high,width:anchor.zone.width,tf:anchor.tf,source:"Key defence",family:"key defence",exceptional:true});

      const structureTfs = [...new Set([horizon.primaryTf,horizon.contextTf,horizon.boundaryTf,...(horizon.extendedTfs || [])])];
      structureTfs.forEach(tf => {
        const snapshot = structure(facts,tf,"swing");
        const levels = [{name:"swing high",value:snapshot && snapshot.latestHigh},{name:"swing low",value:snapshot && snapshot.latestLow}];
        levels.forEach(item => {
          const price = numeric(item.value && item.value.price);
          if(price == null) return;
          add({id:`structure-${tf}-${item.name.replace(/\s/g,"-")}`,reference:price,tf,source:`${tf} ${item.name}`,family:"structure",exceptional:tf === "1d"});
        });
      });

      (Array.isArray(facts.userLevels) ? facts.userLevels : []).forEach((item,index) => add({
        id:item.id || `user-${index}`,reference:item.price ?? item.level,tf:item.tf || horizon.primaryTf,
        source:"User level",family:"user",role:item.role || null,exceptional:item.exceptional === true || item.strong === true
      }));
      (Array.isArray(facts.exitOrders) ? facts.exitOrders : []).forEach((item,index) => add({
        id:item.id || `exit-${index}`,reference:item.price ?? item.level,tf:item.tf || horizon.primaryTf,
        source:item.source || "Binance exit order",family:item.family || "binance-exit",exceptional:true
      }));

      const primaryEmaTfs = new Set(horizon.htfEmaTfs || []);
      const conditionalEmaTfs = new Set(horizon.conditionalEmaTfs || []);
      [...new Set([...primaryEmaTfs,...conditionalEmaTfs])].forEach(tf => {
        const snapshot = maSnapshot(facts,tf,true);
        const values = snapshot && snapshot.valuesBySlot || {};
        const slots = snapshot && Array.isArray(snapshot.slots) ? snapshot.slots : [];
        const available = Object.entries(values).map(([slotId,value]) => ({slotId,value:numeric(value),slot:slots.find(item => item.slotId === slotId)})).filter(item => item.value != null);
        const clustered = available.some((item,index) => available.slice(index+1).some(other => Math.abs(item.value-other.value) <= atr*config.managementLevels.confluenceAtr));
        const orderedValues = available.map(item => item.value);
        const stackCondition = orderedValues.length >= 3 && orderedValues.slice(0,-1).every((value,index) => desired > 0 ? value >= orderedValues[index+1] : value <= orderedValues[index+1]) ? "position aligned"
          : orderedValues.length >= 3 && orderedValues.slice(0,-1).every((value,index) => desired > 0 ? value <= orderedValues[index+1] : value >= orderedValues[index+1]) ? "opposed" : "mixed or flat";
        available.forEach(item => {
          const distanceAtr = current == null ? Infinity : Math.abs(item.value-current)/Math.max(atr,1e-8);
          if(conditionalEmaTfs.has(tf) && distanceAtr > horizon.materiallyCloseAtr[1] && !clustered) return;
          const period = Number(item.slot && item.slot.period) || String(item.slotId).replace(/\D/g,"");
          const series = snapshot && snapshot.seriesBySlot && Array.isArray(snapshot.seriesBySlot[item.slotId]) ? snapshot.seriesBySlot[item.slotId] : [];
          const seriesValue = point => numeric(point && typeof point === "object" ? point.value ?? point.close : point);
          const latest = seriesValue(series.at(-1));
          const previous = seriesValue(series.at(-2));
          const emaSlope = latest != null && previous != null ? latest-previous : null;
          add({id:`ema-${tf}-${item.slotId}`,reference:item.value,tf,source:`${tf} EMA${period}`,family:"moving averages",exceptional:clustered,emaSlope,stackCondition});
        });
      });

      const sorted = raw.slice().sort((a,b) => a.low-b.low || a.reference-b.reference);
      const groups = [];
      sorted.forEach(level => {
        const prior = groups[groups.length-1];
        if(!prior || level.low-prior.high > atr*config.managementLevels.confluenceAtr){
          groups.push({levels:[level],low:level.low,high:level.high});
        }else{
          prior.levels.push(level);
          prior.low = Math.min(prior.low,level.low);
          prior.high = Math.max(prior.high,level.high);
        }
      });
      const interactionRank = {FAILED:7,WEAKENING:6,REJECTED:5,RECLAIMED:4,HOLDING:3,TESTING:2,APPROACHING:1};
      const zones = groups.map((group,index) => {
        const id = `zone-${index+1}`;
        group.levels.forEach(level => { level.mergedZoneId = id; });
        const contributorFamilies = new Set(group.levels.map(level => level.family === "moving averages" ? "moving averages" : level.family === "key defence" || level.family === "original invalidation" ? "structure" : level.family));
        const activeInteraction = group.levels.slice().sort((a,b) => (interactionRank[b.interactionState] || 0)-(interactionRank[a.interactionState] || 0))[0];
        if(activeInteraction && activeInteraction.interactionState) contributorFamilies.add("price reaction");
        const pressureAvailable = (facts.samples || []).some(sample => sample.available && [horizon.triggerTf,horizon.primaryTf].includes(sample.tf));
        if(pressureAvailable && activeInteraction && activeInteraction.interactionState) contributorFamilies.add("pressure and participation");
        return {
          id,low:group.low,high:group.high,reference:group.levels.reduce((sum,level) => sum+level.reference,0)/group.levels.length,
          sources:group.levels.map(level => level.source),timeframes:[...new Set(group.levels.map(level => level.tf))],
          evidenceFamilies:[...contributorFamilies],independentFamilyCount:contributorFamilies.size,
          interactionState:activeInteraction && activeInteraction.interactionState || null,levelIds:group.levels.map(level => level.id)
        };
      });
      return {atr,levels:raw,zones,activeLevels:raw.filter(level => level.interactionState),materiallyCloseAtr:{minimum:horizon.materiallyCloseAtr[0],maximum:horizon.materiallyCloseAtr[1]}};
    }

    function stallReview(facts,horizon,tracker,volatility,levelMap,lifecycle,structureResult,maResult,pressureResult){
      const now = Number(facts.createdAt || Date.now());
      const elapsedMs = now-tracker.progress.startedAt;
      const volatilityFactor = volatility.state === "EXTREME" ? 0.75 : volatility.state === "HIGH" ? 0.85 : volatility.state === "QUIET" ? 1.5 : 1;
      const eligibleAfterMs = horizon.stallReviewMs*volatilityFactor;
      const eligible = elapsedMs >= eligibleAfterMs;
      const objectiveReached = levelMap.activeLevels.some(level => level.roles.includes("objective") && ["TESTING","HOLDING","RECLAIMED","REJECTED"].includes(level.interactionState));
      const boundaryConsolidation = levelMap.activeLevels.some(level => level.ahead && ["TESTING","APPROACHING"].includes(level.interactionState) && ["structure","user","moving averages","binance-exit"].includes(level.family));
      const validRetest = levelMap.activeLevels.some(level => level.roles.includes("retest level") && ["HOLDING","RECLAIMED"].includes(level.interactionState));
      const meaningfulProgress = lifecycle.state !== "FRESH" || (tracker.maxFavorablePrice != null && tracker.progress.startPrice != null && Math.abs(tracker.maxFavorablePrice-tracker.progress.startPrice) >= levelMap.atr*horizon.expectedAtr);
      const constructiveCompression = (levelMap.zones || []).some(zone => zone.evidenceFamilies.includes("moving averages") && ["TESTING","HOLDING"].includes(zone.interactionState)) && !pressureResult.warning && !pressureResult.confirmed;
      if(meaningfulProgress){
        const progressKey = `${lifecycle.state}|${Math.round(Number(tracker.maxFavorablePrice || facts.currentPrice)/Math.max(levelMap.atr,1e-8))}`;
        if(progressKey !== tracker.progress.lastBasisKey){
          tracker.progress.lastBasisKey = progressKey;
          tracker.progress.startedAt = now;
          tracker.progress.startPrice = numeric(facts.currentPrice);
        }
      }
      const nearestAhead = levelMap.levels.filter(level => level.ahead && level.distanceAtr != null).sort((a,b) => a.distanceAtr-b.distanceAtr)[0];
      const openSpace = !nearestAhead || nearestAhead.distanceAtr >= 0.75;
      const adequateVolatility = volatility.available && volatility.state !== "QUIET";
      const adverseReasons = [];
      if(pressureResult.warning || pressureResult.confirmed) adverseReasons.push(pressureResult.reason);
      if(structureResult.warning || structureResult.confirmed) adverseReasons.push(structureResult.reason);
      if(maResult.warning || maResult.confirmed) adverseReasons.push(maResult.reason);
      levelMap.activeLevels.filter(level => ["WEAKENING","REJECTED","FAILED"].includes(level.interactionState)).forEach(level => adverseReasons.push(`${level.source} ${level.interactionState.toLowerCase()}`));
      const adverseEvidence = [...new Set(adverseReasons)];
      const softened = boundaryConsolidation || validRetest || objectiveReached || constructiveCompression || volatility.state === "QUIET" || meaningfulProgress;
      const stalled = eligible && !meaningfulProgress && openSpace && adequateVolatility && adverseEvidence.length > 0 && !softened;
      tracker.progress.state = stalled ? "STALLED" : eligible ? softened ? "SUSPENDED" : "REVIEW ELIGIBLE" : "NOT ELIGIBLE";
      return {state:tracker.progress.state,stalled,eligible,eligibleAfterMs,elapsedMs,noMeaningfulProgress:!meaningfulProgress,openSpace,adequateVolatility,adverseEvidence,softened,softeningReasons:[boundaryConsolidation ? "Consolidating at a known boundary" : null,validRetest ? "Valid retest in progress" : null,objectiveReached ? "Objective reached" : null,constructiveCompression ? "Constructive compression at a known EMA zone" : null,volatility.state === "QUIET" ? "Quiet volatility" : null,meaningfulProgress ? "Meaningful favourable progress" : null].filter(Boolean)};
    }

    function currentConditions(facts,horizon,levelMap,lifecycle,stall,volatility){
      const desired = sideNumber(facts.position.side);
      const current = numeric(facts.currentPrice);
      const activeObjective = levelMap.activeLevels.find(level => level.roles.includes("objective") && ["TESTING","HOLDING","RECLAIMED","REJECTED","APPROACHING"].includes(level.interactionState));
      const supportive = levelMap.levels.filter(level => level.behind && (level.family === "structure" || level.family === "moving averages" || level.family === "key defence")).sort((a,b) => a.distance-b.distance)[0];
      const boundaryAhead = levelMap.levels.filter(level => level.ahead && (level.exceptional || level.tf === horizon.boundaryTf)).sort((a,b) => a.distance-b.distance)[0];
      const stretched = !!(current != null && supportive && supportive.distanceAtr >= 2.5 && (!boundaryAhead || boundaryAhead.distanceAtr <= horizon.materiallyCloseAtr[1] || volatility.state === "EXTREME"));
      const conditions = [];
      if(activeObjective) conditions.push("AT OBJECTIVE");
      if(stretched) conditions.push("EXTENDED");
      if(stall.stalled) conditions.push("STALLED");
      return {items:conditions,atObjective:!!activeObjective,objective:activeObjective || null,extended:stretched,stalled:stall.stalled,eventRisk:false,lifecycle:lifecycle.state,direction:desired};
    }

    function structureFamily(facts,horizon,anchor){
      const desired = sideNumber(facts.position.side);
      const anchorRows = rowsFor(facts,anchor.tf,true);
      const failureBoundary = numeric(anchor.failureBoundary) ?? anchor.invalidation;
      const adverseCloses = anchorRows.slice(-horizon.confirmCloses).filter(row => desired > 0 ? Number(row.close) < failureBoundary : Number(row.close) > failureBoundary).length;
      const adverseEvents = [...new Set([anchor.tf,...horizon.regimeTfs])].map(tf => {
        const swing = structure(facts,tf,"swing");
        const event = swing && swing.latestEvent;
        const side = event && event.direction === "bullish" ? 1 : event ? -1 : 0;
        const tfRows = rowsFor(facts,tf,true);
        const recentRows = tfRows.slice(-(horizon.confirmCloses+4));
        const cutoff = numeric(recentRows[0] && recentRows[0].time) || 0;
        return event && side === -desired && numeric(event.breakTime) >= cutoff ? {tf,event} : null;
      }).filter(Boolean);
      const confirmed = adverseCloses >= horizon.confirmCloses || adverseEvents.some(item => item.tf !== "1m");
      const warning = adverseCloses > 0 || adverseEvents.length > 0;
      return {
        family:"Structure",state:confirmed ? "CONFIRMED" : warning ? "WARNING" : "CLEAR",
        confirmed,warning,anchorFailed:adverseCloses >= horizon.confirmCloses,adverseCloses,adverseEvents,
        reason:confirmed ? (adverseCloses >= horizon.confirmCloses ? `${anchor.tf} anchor failed on closed candles` : `${adverseEvents[0].tf} opposite structure transition confirmed`) : warning ? "Structure is testing the position thesis" : "Anchor and expected structure remain intact"
      };
    }

    function maFamily(facts,horizon){
      const desired = sideNumber(facts.position.side);
      const tf = horizon.anchorTf;
      const rows = rowsFor(facts,tf,true);
      const closes = rows.slice(-horizon.confirmCloses);
      const ema9 = maValue(facts,tf,"MA1",true);
      const ema21 = maValue(facts,tf,"MA2",true);
      const ema55 = maValue(facts,tf,"MA3",true);
      const values = ["MA1","MA2","MA3","MA4","MA5"].map(slot => maValue(facts,tf,slot,true));
      const complete = values.every(value => value != null);
      const oppositeOrder = complete && values.slice(0,-1).every((value,index) => desired > 0 ? value < values[index+1] : value > values[index+1]);
      const beyond55 = ema55 != null && closes.length >= horizon.confirmCloses && closes.every(row => desired > 0 ? Number(row.close) < ema55 : Number(row.close) > ema55);
      const beyondFast = ema21 != null && closes.length && (desired > 0 ? Number(closes[closes.length-1].close) < ema21 : Number(closes[closes.length-1].close) > ema21);
      const confirmed = beyond55 || oppositeOrder;
      return {
        family:"MA behavior",state:confirmed ? "CONFIRMED" : beyondFast ? "WARNING" : "CLEAR",confirmed,warning:beyondFast,
        ema9,ema21,ema55,oppositeOrder,beyond55,
        reason:confirmed ? (oppositeOrder ? `${tf} full MA stack transitioned against the position` : `${tf} EMA55 failed on closed candles`) : beyondFast ? `${tf} EMA9/21 behavior is deteriorating` : `${tf} active MA structure remains intact`
      };
    }

    function pressureFamily(facts,horizon){
      const desired = sideNumber(facts.position.side);
      const relevant = (facts.samples || []).filter(sample => sample.available && sample.tf !== "1m");
      const opposing = relevant.map(sample => ({
        sample,
        share:sample.sideSign === -desired ? Number(sample.dominantPct || 0.5) : 0,
        persistent:sample.sideSign === -desired && persistentPressure(facts,sample.tf,-desired,config.pressure.persistentCloses)
      })).filter(item => item.share >= config.pressure.materialShare);
      const persistent = opposing.filter(item => item.persistent || (item.share >= config.pressure.strongShare && Number(item.sample.pressureMomentum || 0) >= config.pressure.accelerating));
      const absorptionAgainst = relevant.filter(sample =>
        sample.sideSign === desired
        && Number(sample.dominantPct || 0) >= config.pressure.strongShare
        && sample.priceRefuses
        && sample.evidenceState === "closed-confirmed"
      );
      const independentTfs = new Set(persistent.map(item => item.sample.tf));
      const confirmed = independentTfs.size >= 2 || persistent.some(item => horizon.triggerTfs.includes(item.sample.tf) && item.persistent) || absorptionAgainst.length > 0;
      const warning = opposing.length > 0 || absorptionAgainst.length > 0;
      const weakRecovery = relevant.some(sample => sample.sideSign === desired && numeric(sample.participationRatio) != null && sample.participationRatio < 0.85);
      return {
        family:"Volume pressure and participation",state:confirmed ? "CONFIRMED" : warning || weakRecovery ? "WARNING" : "CLEAR",
        confirmed,warning:warning || weakRecovery,opposing,persistent,absorptionAgainst,weakRecovery,
        reason:absorptionAgainst.length ? `Confirmed ${absorptionAgainst[0].tf} absorption is refusing position-aligned pressure` : confirmed ? `Persistent opposing pressure confirmed on ${[...independentTfs].join(" and ") || persistent[0].sample.tf}` : warning ? `${opposing[0].sample.tf} opposing pressure is material` : weakRecovery ? "Recovery participation is weak" : "Pressure is supportive or non-destructive"
      };
    }

    function advancePath(tracker,name,proposed,signature,reason,now){
      const path = tracker.paths[name];
      const previous = path.state;
      let next = proposed;
      if(proposed === "CLEAR" && previous !== "CLEAR") next = previous === "CLEARED" ? "CLEAR" : "CLEARED";
      if(next !== previous){
        path.state = next;
        path.lastSignature = signature;
        path.history.push({state:next,at:now,reason});
        if(path.history.length > 30) path.history.shift();
      }
      path.reason = reason;
      return {...path};
    }

    function stabilizeHealth(tracker,proposed,signature,reason,now){
      const order = config.healthOrder;
      if(proposed === "INVALIDATED"){
        if(tracker.health !== proposed) tracker.healthHistory.push({state:proposed,at:now,reason});
        tracker.health = proposed;
        return proposed;
      }
      const currentIndex = Math.max(0,order.indexOf(tracker.health));
      const proposedIndex = Math.max(0,order.indexOf(proposed));
      if(proposed === tracker.health){ tracker.pendingHealth = null; tracker.pendingCount = 0; return tracker.health; }
      if(signature === tracker.lastHealthSignature) return tracker.health;
      tracker.lastHealthSignature = signature;
      if(tracker.pendingHealth !== proposed){ tracker.pendingHealth = proposed; tracker.pendingCount = 1; }
      else tracker.pendingCount += 1;
      const required = proposedIndex > currentIndex ? (proposed === "CAUTION" || proposed === "WEAKENING" ? 1 : 2) : 2;
      if(tracker.pendingCount >= required){
        tracker.health = proposed;
        tracker.healthHistory.push({state:proposed,at:now,reason});
        tracker.pendingHealth = null;
        tracker.pendingCount = 0;
      }
      return tracker.health;
    }

    function takeProfitAssessment(facts,horizon,tracker,families,atr){
      const roi = tracker.currentRoi;
      if(!(roi >= config.takeProfit.minimumRoi)) return {active:false,reason:"Profit alone does not activate TAKE PROFIT"};
      const desired = sideNumber(facts.position.side);
      const current = numeric(facts.currentPrice);
      const ema21 = maValue(facts,horizon.anchorTf,"MA2",true);
      const extension = current != null && ema21 != null && atr > 0 ? Math.abs(current-ema21)/atr : 0;
      const boundaries = horizon.regimeTfs.flatMap(tf => {
        const swing = structure(facts,tf,"swing");
        return [swing && swing.latestHigh,swing && swing.latestLow].filter(Boolean).map(level => ({tf,price:numeric(level.price)}));
      }).filter(level => level.price != null && current != null && (desired > 0 ? level.price >= current : level.price <= current));
      const objective = boundaries.sort((a,b) => Math.abs(a.price-current)-Math.abs(b.price-current))[0];
      const atObjective = !!(objective && atr > 0 && Math.abs(objective.price-current) <= atr*config.takeProfit.objectiveAtr);
      const surrenderPoints = tracker.peakRoi != null && roi != null ? Math.max(0,tracker.peakRoi-roi) : 0;
      const relativeSurrender = tracker.peakRoi > 0 ? surrenderPoints/tracker.peakRoi : 0;
      const deterioration = families.some(family => family.confirmed);
      if(atObjective) return {active:true,reason:`Major ${objective.tf} objective is being tested`,objective};
      if(extension >= config.takeProfit.extensionAtr) return {active:true,reason:`Price is extended ${extension.toFixed(1)} ATR from ${horizon.anchorTf} EMA21`,extension};
      if(relativeSurrender >= config.takeProfit.relativeSurrender && deterioration) return {active:true,reason:"Material peak-ROI surrender is confirmed by independent deterioration",relativeSurrender};
      return {active:false,reason:"No objective, exhaustion, extension, or confirmed surrender condition"};
    }

    function evaluate(facts){
      const position = facts && facts.position;
      if(!position){
        const prefix = `${facts && facts.symbol || ""}|`;
        campaigns.forEach((campaign,key) => {
          if(key.startsWith(prefix) && !campaign.closedAt) campaign.closedAt = Number(facts && facts.createdAt || Date.now());
        });
        return {
          health:"NO POSITION",action:"WAIT",state:"WAIT",exit:"EXIT WAIT",primaryReason:"No open position is available to manage",
          reasons:["No open position is available to manage"],risks:[],threats:[],tooltipReasons:["No open position is available to manage"],
          watchCondition:"Management begins when an open position is detected",pathA:{state:"CLEAR"},pathB:{state:"CLEAR"},families:[],sufficient:true
        };
      }
      const horizonId = selectedHorizon || facts.horizon || "quick";
      const horizon = config.managementHorizons[horizonId] || config.managementHorizons.quick;
      const tracker = initializeCampaign(facts);
      const volatility = volatilityRegime(facts,horizon);
      const lifecycleSeed = tracker.keyDefence || selectAnchor(facts,horizon,tracker);
      const lifecycle = positionLifecycle(facts,horizon,tracker,lifecycleSeed);
      const defence = resolveKeyDefence(facts,horizon,tracker,volatility,lifecycle);
      const anchor = defence.anchor;
      const signature = closedSignature(facts,horizon);
      const now = Number(facts.createdAt || Date.now());
      const atr = defence.atr;
      const structureResult = structureFamily(facts,horizon,anchor);
      const maResult = maFamily(facts,horizon);
      const pressureResult = pressureFamily(facts,horizon);
      const levelMap = buildManagementLevelMap(facts,horizon,anchor,defence.originalInvalidation,volatility,atr);
      const stall = stallReview(facts,horizon,tracker,volatility,levelMap,lifecycle,structureResult,maResult,pressureResult);
      const progressResult = {family:"Stall Review",state:stall.stalled ? "WARNING" : "CLEAR",confirmed:false,warning:stall.stalled,reason:stall.stalled ? `Stall Review active - ${stall.adverseEvidence[0]}` : stall.eligible ? `Stall Review ${stall.state.toLowerCase()}` : "Stall Review not yet eligible",...stall};
      const families = [structureResult,maResult,pressureResult,progressResult];
      const confirmedFamilies = families.filter(family => family.confirmed);
      const warningFamilies = families.filter(family => family.warning && !family.confirmed);

      const desired = sideNumber(position.side);
      const liveRow = last(rowsFor(facts,anchor.tf,false));
      const formingBeyondAnchor = !!(liveRow && liveRow.final === false && (desired > 0 ? Number(liveRow.close) < anchor.failureBoundary : Number(liveRow.close) > anchor.failureBoundary));
      const anchorClosedBeyond = structureResult.adverseCloses > 0;
      const recentAnchorRows = rowsFor(facts,anchor.tf,true).slice(-(horizon.confirmCloses+3));
      const failedReclaim = recentAnchorRows.some(row => {
        const touched = desired > 0 ? Number(row.high) >= anchor.zone.low : Number(row.low) <= anchor.zone.high;
        const closedAdverse = desired > 0 ? Number(row.close) < anchor.failureBoundary : Number(row.close) > anchor.failureBoundary;
        return touched && closedAdverse;
      });
      const anchorConfirmed = structureResult.anchorFailed && (failedReclaim || maResult.confirmed || pressureResult.confirmed);
      const pathAProposed = anchorConfirmed ? "CONFIRMED" : structureResult.anchorFailed ? "DEVELOPING" : anchorClosedBeyond ? "DEVELOPING" : formingBeyondAnchor ? "WARNING" : "CLEAR";
      const pathAReason = pathAProposed === "CONFIRMED" ? "Key defence zone failed on closed candles and reclaim/corroboration failed" : pathAProposed === "DEVELOPING" ? "Key defence failure is developing; closed recovery is not confirmed" : pathAProposed === "WARNING" ? "Forming candle is testing the key defence zone" : "Key defence zone remains intact";

      const oppositeStructure = structureResult.adverseEvents.some(item => item.tf !== "1m" && horizon.regimeTfs.includes(item.tf));
      const pathBCorroborated = maResult.confirmed || pressureResult.confirmed;
      const pathBConfirmed = oppositeStructure && pathBCorroborated;
      const pathBProposed = pathBConfirmed ? "CONFIRMED" : oppositeStructure ? "DEVELOPING" : maResult.confirmed || pressureResult.confirmed ? "WARNING" : "CLEAR";
      const pathBReason = pathBConfirmed ? `Opposite structure plus ${maResult.confirmed ? "MA transition" : "persistent opposing pressure"} confirmed` : oppositeStructure ? "Opposite structural transition needs MA or pressure corroboration" : pathBProposed === "WARNING" ? "Adverse MA or pressure evidence lacks opposite regime structure" : "No confirmed opposite regime";
      const pathA = advancePath(tracker,"A",pathAProposed,signature,pathAReason,now);
      const pathB = advancePath(tracker,"B",pathBProposed,signature,pathBReason,now);

      let proposedHealth = "HEALTHY";
      if(pathA.state === "CONFIRMED" || pathB.state === "CONFIRMED") proposedHealth = "INVALIDATED";
      else if(confirmedFamilies.length >= 2 && (progressResult.confirmed || structureResult.anchorFailed)) proposedHealth = "AT RISK";
      else if(confirmedFamilies.length >= 1) proposedHealth = "WEAKENING";
      else if(warningFamilies.length >= 1 || pathA.state === "WARNING" || pathB.state === "WARNING") proposedHealth = "CAUTION";
      const healthReason = proposedHealth === "INVALIDATED" ? (pathB.state === "CONFIRMED" ? pathBReason : pathAReason)
        : proposedHealth === "AT RISK" ? `${confirmedFamilies.map(family => family.family).join(" and ")} confirm deterioration with failed recovery`
          : proposedHealth === "WEAKENING" ? confirmedFamilies[0].reason
            : proposedHealth === "CAUTION" ? (warningFamilies[0] && warningFamilies[0].reason || "Early warning is active") : "Anchor, pressure, and progress remain healthy";
      const health = stabilizeHealth(tracker,proposedHealth,signature,healthReason,now);
      const takeProfit = takeProfitAssessment(facts,horizon,tracker,families,atr);
      const conditions = currentConditions(facts,horizon,levelMap,lifecycle,stall,volatility);

      let action = "HOLD";
      if(health === "INVALIDATED") action = "CLOSE";
      else if(health === "AT RISK") action = "TRIM";
      else if(takeProfit.active && health !== "AT RISK") action = "TAKE PROFIT";
      else if(health === "WEAKENING") action = "TIGHTEN SL";
      const primaryReason = action === "TAKE PROFIT" ? takeProfit.reason : healthReason;
      const surrenderPoints = tracker.peakRoi != null && tracker.currentRoi != null ? Math.max(0,tracker.peakRoi-tracker.currentRoi) : null;
      const relativeSurrender = tracker.peakRoi > 0 && surrenderPoints != null ? surrenderPoints/tracker.peakRoi : null;
      const threats = families.filter(family => family.state !== "CLEAR").map(family => family.reason);
      const activatedPath = pathB.state === "CONFIRMED" ? "Path B - Confirmed opposite regime" : pathA.state === "CONFIRMED" ? "Path A - Management-anchor invalidation" : null;
      return {
        health,action,state:action,exit:action === "CLOSE" ? "EXIT EXIT" : `EXIT ${action}`,
        primaryReason,reasons:[primaryReason],risks:threats,threats,tooltipReasons:[primaryReason,...threats].filter((value,index,array) => array.indexOf(value) === index).slice(0,4),
        watchCondition:health === "HEALTHY" ? "Escalate only after persistent, closed-candle deterioration" : "Recovery requires confirmed anchor, pressure, and progress improvement",
        horizonId,horizonLabel:horizon.label,profileSource:selectedHorizon == null ? "default" : "user-selected",
        profileHierarchy:{earlyWarningTf:horizon.earlyWarningTf,triggerTf:horizon.triggerTf,primaryTf:horizon.primaryTf,contextTf:horizon.contextTf,boundaryTf:horizon.boundaryTf,extendedTfs:[...(horizon.extendedTfs || [])]},
        anchor,originalInvalidation:defence.originalInvalidation,defenceMigration:defence.migration,pathA,pathB,activatedPath,families,progress:progressResult,stallReview:stall,takeProfit,
        volatility,levelMap,lifecycle,conditions,
        position:{...position,currentPrice:facts.currentPrice},atr,
        roi:{epoch:tracker.epoch,epochStartedAt:tracker.epochStartedAt,epochHistory:tracker.epochHistory.slice(),current:tracker.currentRoi,peak:tracker.peakRoi,surrenderPoints,relativeSurrender,peakAt:tracker.peakAt,timeSincePeakMs:tracker.peakAt == null ? null : Math.max(0,now-tracker.peakAt),maxFavorablePrice:tracker.maxFavorablePrice,campaignResult:tracker.campaignResult,campaignMfe:tracker.campaignMfe},
        healthHistory:tracker.healthHistory.slice(-20),
        evidence:{
          primary:primaryReason,
          supporting:levelMap.activeLevels.filter(level => ["HOLDING","RECLAIMED"].includes(level.interactionState)).map(level => `${level.source} ${level.interactionState.toLowerCase()}`),
          conflicting:[...levelMap.activeLevels.filter(level => ["WEAKENING","REJECTED","FAILED"].includes(level.interactionState)).map(level => `${level.source} ${level.interactionState.toLowerCase()}`),...threats],
          formingWarnings:levelMap.activeLevels.filter(level => level.formingWarning).map(level => `${level.source} forming-candle ${String(level.interactionState).toLowerCase()}`),
          confirmation:anchorClosedBeyond || pathA.state === "CONFIRMED" || pathB.state === "CONFIRMED" ? "Closed candle" : formingBeyondAnchor ? "Forming candle" : "Monitoring",
          unavailable:volatility.available ? [] : [`${horizon.primaryTf} volatility history unavailable`],
          stale:volatility.status === "stale" ? [`${horizon.primaryTf} management data stale`] : [],
          dataAgeMs:volatility.ageMs
        },
        analysis:[`Key defence zone: ${format.price(anchor.zone.low)}-${format.price(anchor.zone.high)}; reference ${format.price(anchor.level)}`,...families.map(family => `${family.family}: ${family.state} - ${family.reason}`),`Lifecycle: ${lifecycle.state} - ${lifecycle.basis}`,`Conditions: ${conditions.items.join(", ") || "None"}`,`Volatility: ${volatility.available ? `${volatility.state} - ${Math.round(volatility.percentile)}th percentile - tolerance ${volatility.toleranceMultiplier.toFixed(2)}x; ${volatility.contextTf} context ${volatility.contextState} (${volatility.contextConfirmation.toLowerCase()})` : "Unavailable"}`,`Path B: ${pathB.state} - ${pathB.reason}`,`Path A: ${pathA.state} - ${pathA.reason}`],
        diagnostics:[
          `Snapshot: ${facts.version} at ${format.time(facts.snapshotCreatedAt || facts.createdAt)}`,
          `Anchor source: ${anchor.source}; management horizon: ${horizon.label}`,
          `Profile hierarchy: warning ${horizon.earlyWarningTf}; trigger ${horizon.triggerTf}; primary ${horizon.primaryTf}; context ${horizon.contextTf}; boundary ${horizon.boundaryTf}`,
          `Original invalidation: ${defence.originalInvalidation ? `${defence.originalInvalidation.tf} ${format.price(defence.originalInvalidation.level)}` : "Unavailable"}`,
          `Defence migration: ${defence.migration ? `${format.price(defence.migration.from)} to ${format.price(defence.migration.to)} - ${defence.migration.basis}` : "No confirmed migration"}`,
          `Volatility policy: ${config.volatility.historyCandles} closed candles; minimum ${config.volatility.minimumSamples}; ATR ${config.volatility.atrPeriod}; state ${volatility.state}`,
          `Management levels: ${levelMap.levels.length}; confluence zones: ${levelMap.zones.length}`,
          `Stall Review: ${stall.state}; elapsed ${Math.round(stall.elapsedMs/60000)}m; eligible after ${Math.round(stall.eligibleAfterMs/60000)}m; adverse evidence ${stall.adverseEvidence.join(" / ") || "none"}`,
          `Closed signature: ${signature}`,
          `Anchor confirmation candles: ${structureResult.adverseCloses}/${horizon.confirmCloses}; failed reclaim: ${failedReclaim ? "yes" : "no"}`,
          `Path A sequence: ${pathA.history.map(item => `${format.time(item.at)} ${item.state} - ${item.reason}`).join(" | ") || "No transitions"}`,
          `Path B sequence: ${pathB.history.map(item => `${format.time(item.at)} ${item.state} - ${item.reason}`).join(" | ") || "No transitions"}`,
          `Health proposal: ${proposedHealth}; persisted: ${health}`,
          `Independent confirmed families: ${confirmedFamilies.map(family => family.family).join(", ") || "None"}`,
          `ROI epochs: ${tracker.epochHistory.map(item => `#${item.epoch} ${format.time(item.startedAt)} qty ${item.basis.qty}, entry ${format.price(item.basis.entry)}, margin ${item.basis.margin == null ? "Unavailable" : item.basis.margin.toFixed(2)}`).join(" | ")}`,
          `Current ROI ${format.percent(tracker.currentRoi)}; peak ${format.percent(tracker.peakRoi)}; campaign MFE ${format.money(tracker.campaignMfe)}`,
          `Action reason: ${primaryReason}`
        ],
        sufficient:true
      };
    }

    function setManagementHorizon(next){
      if(!config.managementHorizons[next]) return selectedHorizon;
      selectedHorizon = next;
      try{ localStorage.setItem(config.storage.managementHorizon,next); }catch(_e){}
      return selectedHorizon;
    }

    function recordAnchor(positionKey,anchor){
      if(!positionKey || !anchor || numeric(anchor.level) == null) return false;
      const level = Number(anchor.level);
      recordedAnchors.set(String(positionKey),{...anchor,level,invalidation:numeric(anchor.invalidation) ?? level,recordedAt:Date.now()});
      return true;
    }

    function runSelfTests(){
      const seed = `PRESSURE_TEST_${Date.now()}`;
      const now = Date.now();
      const end = Math.floor(now/1000);
      const makeRows = (close=100000,forming=false) => Array.from({length:20},(_,index) => ({
        time:end-(19-index)*300,
        open:close-20,
        high:close+120,
        low:close-120,
        close,
        volume:1000,
        takerBuyBase:650,
        final:forming && index === 19 ? false : true
      }));
      const values = {MA1:100500,MA2:100300,MA3:99000,MA4:98000,MA5:97000};
      const oppositeValues = {MA1:97000,MA2:97500,MA3:98000,MA4:98500,MA5:99000};
      const facts = (symbol,overrides={}) => {
        const closedByTf = {"3m":makeRows(),"5m":makeRows(),"15m":makeRows(),"1h":makeRows()};
        const rowsByTf = Object.fromEntries(Object.entries(closedByTf).map(([tf,rows]) => [tf,rows.map(row => ({...row}))]));
        return {
          symbol,horizon:"quick",createdAt:now,version:"self-test",
          position:{symbol,side:"LONG",qty:1,price:100000,margin:10000,leverage:10,unrealizedPnl:0,realizedPnl:0},
          currentPrice:100000,
          samples:[{available:true,tf:"5m",sideSign:1,dominantPct:0.65,pressureMomentum:0.03,participationRatio:1,evidenceState:"closed-confirmed"}],
          rowsByTf,closedByTf,
          maByTf:{"5m":{closed:{valuesBySlot:{...values}},live:{valuesBySlot:{...values}}}},
          structureByTf:{"5m":{swing:{latestLow:{price:90000},latestHigh:{price:105000},latestEvent:null}}},
          ...overrides
        };
      };
      const results = {};
      try{
        const oneMinute = facts(`${seed}_1M`,{
          structureByTf:{
            "5m":{swing:{latestLow:{price:90000},latestHigh:{price:105000},latestEvent:null}},
            "1m":{swing:{latestEvent:{direction:"bearish",breakTime:end,price:99900}}}
          }
        });
        const oneMinuteResult = evaluate(oneMinute);
        results.oneMinuteCannotConfirmPathB = oneMinuteResult.pathB.state !== "CONFIRMED";

        const forming = facts(`${seed}_FORMING`);
        recordedAnchors.set(`${forming.symbol}|LONG`,{level:99500,tf:"5m",family:"test",invalidation:99500});
        forming.rowsByTf["5m"][forming.rowsByTf["5m"].length-1] = {...forming.rowsByTf["5m"].at(-1),close:99000,low:98900,final:false};
        const formingResult = evaluate(forming);
        results.formingCannotConfirmExit = formingResult.pathA.state !== "CONFIRMED" && formingResult.pathB.state !== "CONFIRMED";

        const conclusionOnly = facts(`${seed}_CONCLUSION`,{signalDirection:"SHORT",signalConfidence:99,entryState:"READY"});
        const conclusionResult = evaluate(conclusionOnly);
        results.entryConclusionIgnored = conclusionResult.pathA.state !== "CONFIRMED" && conclusionResult.pathB.state !== "CONFIRMED";

        const pathB = facts(`${seed}_PATH_B`);
        pathB.maByTf["5m"] = {closed:{valuesBySlot:{...oppositeValues}},live:{valuesBySlot:{...oppositeValues}}};
        pathB.structureByTf["15m"] = {swing:{latestEvent:{direction:"bearish",breakTime:end,price:99500}}};
        const pathBResult = evaluate(pathB);
        results.pathBConfirmsWithStructureAndMa = pathBResult.pathB.state === "CONFIRMED" && pathBResult.action === "CLOSE";

        const pathA = facts(`${seed}_PATH_A`);
        recordedAnchors.set(`${pathA.symbol}|LONG`,{level:99500,tf:"5m",family:"test",invalidation:99500});
        pathA.closedByTf["5m"].splice(-2,2,
          {...pathA.closedByTf["5m"].at(-2),high:99600,low:98800,close:99000},
          {...pathA.closedByTf["5m"].at(-1),high:99400,low:98700,close:98800}
        );
        pathA.rowsByTf["5m"] = pathA.closedByTf["5m"].map(row => ({...row}));
        const pathAResult = evaluate(pathA);
        results.pathAConfirmsIndependently = pathAResult.pathA.state === "CONFIRMED" && pathAResult.pathB.state !== "CONFIRMED" && pathAResult.action === "CLOSE";

        const roiOne = facts(`${seed}_ROI`);
        roiOne.position = {...roiOne.position,unrealizedPnl:1000};
        roiOne.currentPrice = 101000;
        const firstEpoch = evaluate(roiOne);
        const roiTwo = facts(roiOne.symbol,{createdAt:now+300000});
        roiTwo.position = {...roiTwo.position,qty:2,price:100500,margin:20100,unrealizedPnl:800};
        roiTwo.currentPrice = 100900;
        const secondEpoch = evaluate(roiTwo);
        results.addStartsNewRoiEpoch = secondEpoch.roi.epoch === firstEpoch.roi.epoch+1;
        results.addDoesNotCreateSurrender = secondEpoch.roi.surrenderPoints === 0;
        results.campaignMfeRemainsContinuous = secondEpoch.roi.campaignMfe >= firstEpoch.roi.campaignMfe;

        results.profileNamesUnchanged = config.managementHorizons.quick.label === "Quick" && config.managementHorizons["2_3h"].label === "2\u20133H" && config.managementHorizons["6_8h"].label === "6\u20138H";
        results.profileHierarchy = config.managementHorizons.quick.primaryTf === "5m" && config.managementHorizons.quick.contextTf === "15m" && config.managementHorizons.quick.boundaryTf === "1h"
          && config.managementHorizons["2_3h"].primaryTf === "15m" && config.managementHorizons["2_3h"].contextTf === "1h" && config.managementHorizons["2_3h"].boundaryTf === "4h"
          && config.managementHorizons["6_8h"].primaryTf === "1h" && config.managementHorizons["6_8h"].contextTf === "4h" && config.managementHorizons["6_8h"].boundaryTf === "1d";

        const historyRows = (count=130,close=100000) => Array.from({length:count},(_,index) => {
          const spread = 80+(index%25)*4;
          return {time:end-(count-1-index)*300,open:close-(index%3)*5,high:close+spread,low:close-spread,close,volume:1000,takerBuyBase:650,final:true};
        });
        const rich = facts(`${seed}_LEVELS`);
        const managementTfs = ["1m","3m","5m","15m","1h","4h","1d"];
        rich.closedByTf = Object.fromEntries(managementTfs.map(tf => [tf,historyRows()]));
        rich.rowsByTf = Object.fromEntries(managementTfs.map(tf => [tf,rich.closedByTf[tf].map(row => ({...row}))]));
        rich.dataHealth = {items:managementTfs.map(tf => ({tf,status:"sufficient",ageMs:3000}))};
        const slots = [9,21,55,100,200].map((period,index) => ({slotId:`MA${index+1}`,period}));
        const nearValues = {MA1:100080,MA2:100060,MA3:100040,MA4:100020,MA5:100000};
        rich.maByTf = Object.fromEntries(managementTfs.map(tf => [tf,{closed:{valuesBySlot:{...nearValues},slots},live:{valuesBySlot:{...nearValues},slots}}]));
        rich.maByTf["4h"] = {closed:{valuesBySlot:{MA1:110000,MA2:112000,MA3:114000,MA4:116000,MA5:118000},slots},live:{valuesBySlot:{MA1:110000,MA2:112000,MA3:114000,MA4:116000,MA5:118000},slots}};
        rich.maByTf["1d"] = {closed:{valuesBySlot:{MA1:120000,MA2:123000,MA3:126000,MA4:129000,MA5:132000},slots},live:{valuesBySlot:{MA1:120000,MA2:123000,MA3:126000,MA4:129000,MA5:132000},slots}};
        rich.structureByTf = {
          "5m":{swing:{latestLow:{price:99500},latestHigh:{price:100040},latestEvent:null}},
          "15m":{swing:{latestLow:{price:99000},latestHigh:{price:100050},latestEvent:null}},
          "1h":{swing:{latestLow:{price:98000},latestHigh:{price:102000},latestEvent:null}},
          "4h":{swing:{latestLow:{price:95000},latestHigh:{price:105000},latestEvent:null}},
          "1d":{swing:{latestLow:{price:90000},latestHigh:{price:110000},latestEvent:null}}
        };
        rich.userLevels = [{id:"near-user",price:100050},{id:"far-user",price:90000}];
        rich.exitOrders = [{id:"exit",price:100080,family:"binance-exit",source:"Binance exit order"}];
        const richHorizon = config.managementHorizons.quick;
        const richTracker = initializeCampaign(rich);
        const richVolatility = volatilityRegime(rich,richHorizon);
        const richLifecycle = positionLifecycle(rich,richHorizon,richTracker,selectAnchor(rich,richHorizon,richTracker));
        const richDefence = resolveKeyDefence(rich,richHorizon,richTracker,richVolatility,richLifecycle);
        const richMap = buildManagementLevelMap(rich,richHorizon,richDefence.anchor,richDefence.originalInvalidation,richVolatility,richDefence.atr);
        const userNear = richMap.levels.find(level => level.id === "near-user");
        const userFar = richMap.levels.find(level => level.id === "far-user");
        const emaNear = richMap.levels.find(level => level.family === "moving averages" && level.tf === "1h");
        const confluence = richMap.zones.find(zone => zone.levelIds.includes("near-user") && zone.evidenceFamilies.includes("moving averages") && zone.evidenceFamilies.includes("structure"));
        const richResult = evaluate(rich);
        results.userLevelsFirstClass = !!(userNear && userNear.source === "User level" && userNear.roles.includes("objective") && userFar && userFar.roles.includes("distant context") && userFar.roles.includes("invalidation reinforcement"));
        results.userTouchActivatesWithoutExit = !!(userNear && ["TESTING","APPROACHING"].includes(userNear.interactionState) && !/User level/i.test(richResult.primaryReason) && richResult.pathA.state !== "CONFIRMED" && richResult.pathB.state !== "CONFIRMED");
        results.htfEmaInteractionDetected = !!(emaNear && ["TESTING","APPROACHING"].includes(emaNear.interactionState));
        results.emaTouchRemainsUnresolved = !!(emaNear && emaNear.interactionState === "TESTING");
        results.repeatedEmaTestsAreContextual = !!(emaNear && emaNear.interactionState === "TESTING" && rich.closedByTf[emaNear.tf].length > 2);
        results.singleEmaTouchCannotClose = richResult.action !== "CLOSE" && richResult.pathA.state !== "CONFIRMED" && richResult.pathB.state !== "CONFIRMED";
        const profitableFacts = {...rich,currentPrice:101000};
        const objectiveRoles = levelRole(profitableFacts,{reference:102000,family:"user",exceptional:false},richDefence.anchor,richDefence.atr);
        const retestRoles = levelRole(profitableFacts,{reference:100500,family:"user",exceptional:false},richDefence.anchor,richDefence.atr);
        const invalidationRoles = levelRole(profitableFacts,{reference:99000,family:"user",exceptional:false},richDefence.anchor,richDefence.atr);
        results.userLevelRolesFollowLocation = objectiveRoles.includes("objective") && retestRoles.includes("retest level") && invalidationRoles.includes("invalidation reinforcement");
        results.distantConditionalEmaExcluded = !richMap.levels.some(level => level.family === "moving averages" && ["4h","1d"].includes(level.tf));
        results.confluenceMergesFamilies = !!(confluence && confluence.independentFamilyCount >= 3 && confluence.evidenceFamilies.filter(family => family === "moving averages").length === 1);

        const formingOnly = {...rich,rowsByTf:{...rich.rowsByTf,"5m":[...rich.rowsByTf["5m"],{...rich.rowsByTf["5m"].at(-1),time:end+300,high:120000,low:80000,final:false}]}};
        const formingVolatility = volatilityRegime(formingOnly,richHorizon);
        results.volatilityUsesClosedHistory = richVolatility.available && formingVolatility.available && richVolatility.atr === formingVolatility.atr && richVolatility.percentile === formingVolatility.percentile;
        const missingVolatility = volatilityRegime({...rich,dataHealth:{items:managementTfs.map(tf => ({tf,status:tf === "5m" ? "insufficient" : "sufficient",ageMs:3000}))}},richHorizon);
        results.missingVolatilityUnavailable = !missingVolatility.available && missingVolatility.state === "UNAVAILABLE";

        const penetration = {...rich,symbol:`${seed}_PENETRATION`,userLevels:[],exitOrders:[],closedByTf:{...rich.closedByTf},rowsByTf:{...rich.rowsByTf}};
        recordedAnchors.set(`${penetration.symbol}|LONG`,{level:99500,tf:"5m",family:"original setup",invalidation:99500,recordedAt:now});
        penetration.closedByTf["5m"] = penetration.closedByTf["5m"].map((row,index,array) => index >= array.length-2 ? {...row,open:99510,high:99530,low:99490,close:99495} : row);
        penetration.rowsByTf["5m"] = penetration.closedByTf["5m"].map(row => ({...row}));
        const penetrationResult = evaluate(penetration);
        results.trivialReferencePenetrationNotFailure = penetrationResult.anchor.zone.low < 99495 && penetrationResult.pathA.state !== "CONFIRMED";

        const profitOnlyTracker = initializeCampaign({...rich,symbol:`${seed}_PROFIT`,position:{...rich.position,symbol:`${seed}_PROFIT`,unrealizedPnl:2000}});
        const profitOnlyLifecycle = positionLifecycle({...rich,symbol:`${seed}_PROFIT`,position:{...rich.position,symbol:`${seed}_PROFIT`,unrealizedPnl:2000},structureByTf:{"5m":{swing:{latestLow:{price:99500},latestHigh:{price:101000},latestEvent:null}}}},richHorizon,profitOnlyTracker,richDefence.anchor);
        results.profitAloneDoesNotEstablish = profitOnlyLifecycle.state === "FRESH";

        const runnerSymbol = `${seed}_RUNNER`;
        const runnerOne = {...rich,symbol:runnerSymbol,position:{...rich.position,symbol:runnerSymbol,qty:1,realizedPnl:0}};
        initializeCampaign(runnerOne);
        const runnerTwo = {...runnerOne,createdAt:now+60000,position:{...runnerOne.position,qty:0.5,realizedPnl:100}};
        const runnerTracker = initializeCampaign(runnerTwo);
        const runnerLifecycle = positionLifecycle(runnerTwo,richHorizon,runnerTracker,richDefence.anchor);
        results.meaningfulPartialCreatesRunner = runnerLifecycle.state === "RUNNER";

        const establishedFacts = {...rich,symbol:`${seed}_ESTABLISHED`,createdAt:(end-7200)*1000,structureByTf:{...rich.structureByTf,"5m":{swing:{latestLow:{price:99500},latestHigh:{price:100500},latestEvent:{direction:"bullish",breakTime:end-3600,price:99900}}}}};
        const establishedTracker = initializeCampaign(establishedFacts);
        const establishedLifecycle = positionLifecycle(establishedFacts,richHorizon,establishedTracker,selectAnchor(establishedFacts,richHorizon,establishedTracker));
        results.establishedEventAvailable = establishedLifecycle.eventPrice === 99900;
        results.establishedRowsAvailable = rowsFor(establishedFacts,"5m",true).slice(-2).every(row => Number(row.close) > 99900);
        results.establishedEvidenceHeld = establishedLifecycle.held;
        results.establishedEvidenceState = establishedLifecycle.state === "ESTABLISHED";
        results.structureCreatesEstablished = establishedLifecycle.state === "ESTABLISHED" && /cleared and held|retest/.test(establishedLifecycle.basis);
        establishedTracker.keyDefence = {level:99000,invalidation:99000,tf:"5m",source:"system-selected",selectionSource:"system-selected",defenceType:"structure",label:"5m structure"};
        const migrated = resolveKeyDefence(establishedFacts,richHorizon,establishedTracker,richVolatility,establishedLifecycle);
        results.defenceMigratesForwardOnClosedConfirmation = migrated.anchor.level === 99500 && migrated.migration && /closed candles/.test(migrated.migration.basis);
        const backwardTracker = initializeCampaign({...establishedFacts,symbol:`${seed}_BACKWARD`});
        backwardTracker.lifecycle = "ESTABLISHED";
        backwardTracker.keyDefence = {level:99600,invalidation:99600,tf:"5m",source:"system-selected",selectionSource:"system-selected",defenceType:"structure",label:"5m structure"};
        const backward = resolveKeyDefence({...establishedFacts,symbol:`${seed}_BACKWARD`},richHorizon,backwardTracker,richVolatility,{...establishedLifecycle,state:"ESTABLISHED"});
        results.defenceNeverMigratesBackward = backward.anchor.level === 99600 && !backward.migration;
        results.originalInvalidationPreserved = !!penetrationResult.originalInvalidation;
        const freshTracker = initializeCampaign({...establishedFacts,symbol:`${seed}_FORMING_MIGRATION`});
        freshTracker.keyDefence = {level:99000,invalidation:99000,tf:"5m",source:"system-selected",selectionSource:"system-selected",defenceType:"structure",label:"5m structure"};
        const formingMigration = resolveKeyDefence({...establishedFacts,symbol:`${seed}_FORMING_MIGRATION`},richHorizon,freshTracker,richVolatility,{state:"FRESH"});
        results.formingNoiseCannotMigrateDefence = formingMigration.anchor.level === 99000 && !formingMigration.migration;
        const lockedTracker = initializeCampaign({...penetration,symbol:`${seed}_LOCKED_ZONE`});
        lockedTracker.keyDefence = {level:99500,invalidation:99500,tf:"5m",source:"system-selected",selectionSource:"system-selected",defenceType:"structure",label:"5m structure"};
        const normalZone = resolveKeyDefence({...rich,symbol:`${seed}_LOCKED_ZONE`},richHorizon,lockedTracker,{...richVolatility,toleranceMultiplier:1},{state:"FRESH"});
        const crossedFacts = {...penetration,symbol:`${seed}_LOCKED_ZONE`};
        const extremeZone = resolveKeyDefence(crossedFacts,richHorizon,lockedTracker,{...richVolatility,toleranceMultiplier:1.5},{state:"FRESH"});
        results.volatilityCannotWidenCrossedDefence = extremeZone.anchor.zone.width <= normalZone.anchor.zone.width;

        const stallVolatility = {...richVolatility,available:true,state:"NORMAL"};
        const noAdverseStall = stallReview({...rich,createdAt:now+richHorizon.stallReviewMs+1000},richHorizon,{...richTracker,progress:{...richTracker.progress,startedAt:now}},stallVolatility,{atr:richDefence.atr,levels:[],activeLevels:[]},{state:"FRESH"},{warning:false,confirmed:false},{warning:false,confirmed:false},{warning:false,confirmed:false});
        const adverseStall = stallReview({...rich,createdAt:now+richHorizon.stallReviewMs+1000},richHorizon,{...richTracker,progress:{...richTracker.progress,startedAt:now}},stallVolatility,{atr:richDefence.atr,levels:[],activeLevels:[]},{state:"FRESH"},{warning:false,confirmed:false},{warning:false,confirmed:false},{warning:true,confirmed:false,reason:"Persistent opposing pressure"});
        results.timeAloneCannotStall = !noAdverseStall.stalled;
        results.stallRequiresAllSafeguards = adverseStall.stalled && adverseStall.openSpace && adverseStall.adequateVolatility && adverseStall.adverseEvidence.length === 1;
        results.stallCannotConfirmExit = adverseStall.stalled && !("pathA" in adverseStall) && !("pathB" in adverseStall);
        const simultaneous = currentConditions(rich,richHorizon,{
          activeLevels:[{roles:["objective"],interactionState:"TESTING"}],
          levels:[
            {behind:true,family:"structure",distance:800,distanceAtr:3},
            {ahead:true,exceptional:true,tf:"1h",distance:200,distanceAtr:0.8}
          ]
        },{state:"ESTABLISHED"},{stalled:true},{state:"HIGH"});
        results.lifecycleConditionsRemainSeparate = simultaneous.lifecycle === "ESTABLISHED" && ["AT OBJECTIVE","EXTENDED","STALLED"].every(item => simultaneous.items.includes(item)) && simultaneous.eventRisk === false;
      }finally{
        [...campaigns.keys()].filter(key => key.startsWith(seed)).forEach(key => campaigns.delete(key));
        [...recordedAnchors.keys()].filter(key => key.startsWith(seed)).forEach(key => recordedAnchors.delete(key));
      }
      return {passed:Object.values(results).every(Boolean),results};
    }

    function destroy(){
      campaigns.clear();
      recordedAnchors.clear();
    }

    return {evaluate,setManagementHorizon,getManagementHorizon:() => selectedHorizon,recordAnchor,destroy,_selfTest:runSelfTests,_diagnostics:() => ({campaigns:[...campaigns.values()],recordedAnchors:[...recordedAnchors.entries()]})};
  };
})();
