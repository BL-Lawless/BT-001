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
          health:"HEALTHY",healthHistory:[{state:"HEALTHY",at:now,reason:"Position campaign detected"}],
          pendingHealth:null,pendingCount:0,lastHealthSignature:"",paths:{A:{state:"CLEAR",history:[]},B:{state:"CLEAR",history:[]}},
          progress:{startedAt:now,startPrice:currentPrice,lastBasisKey:"",failedAttempts:0,state:"NORMAL"}
        };
        campaigns.set(key,created);
        return created;
      }
      const basis = existing.epochBasis;
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
        return {...recorded,tf,invalidation:numeric(recorded.invalidation) ?? recorded.level,source:"recorded",label:`Recorded ${recorded.family || "setup"} (${tf})`};
      }
      const chosenByUser = selectedHorizon != null;
      const tf = horizon.anchorTf;
      const desired = sideNumber(facts.position.side);
      const swing = structure(facts,tf,"swing");
      const pivot = desired > 0 ? swing && swing.latestLow : swing && swing.latestHigh;
      const structuralLevel = numeric(pivot && pivot.price);
      const ema55 = maValue(facts,tf,"MA3",true);
      const level = structuralLevel ?? ema55 ?? facts.position.price;
      return {
        source:chosenByUser ? "user-selected" : "inferred",
        profile:selectedHorizon || facts.horizon,
        tf,level,
        label:`${chosenByUser ? "User-selected" : "Inferred"} ${tf} ${structuralLevel != null ? "structure" : ema55 != null ? "EMA55" : "entry basis"}`,
        invalidation:level,
        expectedBehavior:`${facts.position.side} continuation should hold ${tf} ${structuralLevel != null ? "structure" : "EMA55"}`,
        inferred:!chosenByUser
      };
    }

    function structureFamily(facts,horizon,anchor){
      const desired = sideNumber(facts.position.side);
      const anchorRows = rowsFor(facts,anchor.tf,true);
      const adverseCloses = anchorRows.slice(-horizon.confirmCloses).filter(row => desired > 0 ? Number(row.close) < anchor.invalidation : Number(row.close) > anchor.invalidation).length;
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

    function progressFamily(facts,horizon,tracker,atr){
      const desired = sideNumber(facts.position.side);
      const progress = tracker.progress;
      const current = numeric(facts.currentPrice);
      const now = Number(facts.createdAt || Date.now());
      const elapsed = now-progress.startedAt;
      const favorable = current == null || progress.startPrice == null ? 0 : (current-progress.startPrice)*desired;
      const anchorRows = rowsFor(facts,horizon.anchorTf,true).slice(-6);
      let failedAttempts = 0;
      for(let index=1;index<anchorRows.length;index++){
        const previous = anchorRows[index-1];
        const row = anchorRows[index];
        if(desired > 0 && Number(row.high) <= Number(previous.high) && Number(row.close) < Number(previous.close)) failedAttempts += 1;
        if(desired < 0 && Number(row.low) >= Number(previous.low) && Number(row.close) > Number(previous.close)) failedAttempts += 1;
      }
      progress.failedAttempts = failedAttempts;
      const timedOut = elapsed >= horizon.progressMinutes*60000;
      const insufficientMove = atr > 0 && favorable < atr*horizon.expectedAtr;
      const confirmed = timedOut && insufficientMove && failedAttempts >= 2;
      const warning = (timedOut && insufficientMove) || failedAttempts >= 2;
      progress.state = confirmed ? "FAILED" : warning ? "STALLING" : "NORMAL";
      return {
        family:"Price progress and trade behavior",state:confirmed ? "CONFIRMED" : warning ? "WARNING" : "CLEAR",
        confirmed,warning,timedOut,failedAttempts,favorable,expected:atr*horizon.expectedAtr,
        reason:confirmed ? `${horizon.label} progress window elapsed with repeated continuation failure` : warning ? "Position progress is stalling" : "Position progress is normal for the management horizon"
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
      const anchor = selectAnchor(facts,horizon,tracker);
      const signature = closedSignature(facts,horizon);
      const now = Number(facts.createdAt || Date.now());
      const atr = trueRangeAverage(rowsFor(facts,horizon.anchorTf,true),14) || Math.max(Math.abs(facts.currentPrice || position.price)*0.0005,1e-8);
      const structureResult = structureFamily(facts,horizon,anchor);
      const maResult = maFamily(facts,horizon);
      const pressureResult = pressureFamily(facts,horizon);
      const progressResult = progressFamily(facts,horizon,tracker,atr);
      const families = [structureResult,maResult,pressureResult,progressResult];
      const confirmedFamilies = families.filter(family => family.confirmed);
      const warningFamilies = families.filter(family => family.warning && !family.confirmed);

      const desired = sideNumber(position.side);
      const liveRow = last(rowsFor(facts,anchor.tf,false));
      const formingBeyondAnchor = !!(liveRow && liveRow.final === false && (desired > 0 ? Number(liveRow.close) < anchor.invalidation : Number(liveRow.close) > anchor.invalidation));
      const anchorClosedBeyond = structureResult.adverseCloses > 0;
      const recentAnchorRows = rowsFor(facts,anchor.tf,true).slice(-(horizon.confirmCloses+3));
      const failedReclaim = recentAnchorRows.some(row => {
        const touched = desired > 0 ? Number(row.high) >= anchor.invalidation : Number(row.low) <= anchor.invalidation;
        const closedAdverse = desired > 0 ? Number(row.close) < anchor.invalidation : Number(row.close) > anchor.invalidation;
        return touched && closedAdverse;
      });
      const anchorConfirmed = structureResult.anchorFailed && (failedReclaim || maResult.confirmed || pressureResult.confirmed || progressResult.confirmed);
      const pathAProposed = anchorConfirmed ? "CONFIRMED" : structureResult.anchorFailed ? "DEVELOPING" : anchorClosedBeyond ? "DEVELOPING" : formingBeyondAnchor ? "WARNING" : "CLEAR";
      const pathAReason = pathAProposed === "CONFIRMED" ? "Management anchor failed on closed candles and reclaim/corroboration failed" : pathAProposed === "DEVELOPING" ? "Anchor failure is developing; closed recovery is not confirmed" : pathAProposed === "WARNING" ? "Forming candle is testing the management anchor" : "Management anchor remains intact";

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
        horizonId,horizonLabel:horizon.label,anchor,pathA,pathB,activatedPath,families,progress:progressResult,takeProfit,
        position:{...position,currentPrice:facts.currentPrice},atr,
        roi:{epoch:tracker.epoch,epochStartedAt:tracker.epochStartedAt,epochHistory:tracker.epochHistory.slice(),current:tracker.currentRoi,peak:tracker.peakRoi,surrenderPoints,relativeSurrender,peakAt:tracker.peakAt,timeSincePeakMs:tracker.peakAt == null ? null : Math.max(0,now-tracker.peakAt),maxFavorablePrice:tracker.maxFavorablePrice,campaignResult:tracker.campaignResult,campaignMfe:tracker.campaignMfe},
        healthHistory:tracker.healthHistory.slice(-20),
        analysis:[`Anchor: ${anchor.label} at ${format.price(anchor.level)}`,...families.map(family => `${family.family}: ${family.state} - ${family.reason}`),`Path B: ${pathB.state} - ${pathB.reason}`,`Path A: ${pathA.state} - ${pathA.reason}`],
        diagnostics:[
          `Snapshot: ${facts.version} at ${format.time(facts.createdAt)}`,
          `Anchor source: ${anchor.source}; management horizon: ${horizon.label}`,
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
