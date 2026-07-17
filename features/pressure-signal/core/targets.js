(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};
  build.createTargetEngine = function createTargetEngine(config){
    const policy = config.targetFramework;
    const number = value => {
      if(value == null || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const directionNumber = direction => String(direction || "").toUpperCase() === "SHORT" || Number(direction) < 0 ? -1 : 1;
    const targetTimeframe = level => policy.eligibleTimeframes.includes(String(level && level.tf || "").toLowerCase());
    const deliberateUserObjective = level => String(level && level.family || "").toLowerCase() === "user" && level.deliberateObjective === true;
    const automaticTargetEligible = level => {
      const family = String(level && level.family || "").toLowerCase();
      if(deliberateUserObjective(level)) return true;
      return targetTimeframe(level) && ["structure","moving averages","support","resistance","boundary"].includes(family);
    };
    const favourable = (price,current,direction) => price != null && current != null && (price-current)*direction > 0;
    const tfWeight = (profile,tf) => ({
      quick:{"1h":38,"4h":25,"1d":18},
      "2_3h":{"1h":31,"4h":36,"1d":22},
      "6_8h":{"1h":27,"4h":39,"1d":37}
    }[profile] || {"1h":31,"4h":36,"1d":22})[tf] || 0;
    const normalizeLevel = (level,current,direction,atr) => {
      const price = number(level && (level.price ?? level.reference));
      if(!favourable(price,current,direction)) return null;
      const distance = Math.abs(price-current);
      return {...level,price,distance,distanceAtr:atr > 0 ? distance/atr : null,tf:String(level.tf || "").toLowerCase(),family:String(level.family || "structure").toLowerCase()};
    };
    const clusterLevels = (levels,atr) => {
      const tolerance = Math.max((atr || 0)*policy.mergeAtr,1e-8);
      const sorted = levels.slice().sort((a,b) => a.price-b.price);
      const clusters = [];
      sorted.forEach(level => {
        const prior = clusters.at(-1);
        if(!prior || level.price-prior.high > tolerance) clusters.push({levels:[level],low:level.price,high:level.price});
        else { prior.levels.push(level); prior.low=Math.min(prior.low,level.price); prior.high=Math.max(prior.high,level.price); }
      });
      return clusters.map(cluster => {
        const families = [...new Set(cluster.levels.map(level => level.family === "moving averages" ? "moving averages" : level.family))];
        const timeframes = [...new Set(cluster.levels.map(level => level.tf))];
        const representative = cluster.levels.slice().sort((a,b) => (b.confirmed === true)-(a.confirmed === true) || (b.reactions || 0)-(a.reactions || 0))[0];
        return {...representative,price:cluster.levels.reduce((sum,level) => sum+level.price,0)/cluster.levels.length,low:cluster.low,high:cluster.high,evidenceFamilies:families,timeframes,confluenceCount:families.length,sources:[...new Set(cluster.levels.map(level => level.source))]};
      });
    };
    const credibility = (level,profile) => {
      const familyScore = level.family === "structure" || level.family === "boundary" ? 23 : level.family === "user" ? 25 : level.family === "moving averages" ? (level.confluenceCount > 1 ? 16 : 9) : 12;
      return tfWeight(profile,level.tf)+familyScore+(level.confirmed === false ? 0 : 7)+Math.min(12,Number(level.reactions || 0)*3)+Math.min(12,Math.max(0,(level.confluenceCount || 1)-1)*6)-Math.min(18,Number(level.distanceAtr || 0)*0.65);
    };
    function evaluateTargets(input){
      const current = number(input.currentPrice), atr = number(input.atr), direction = directionNumber(input.direction), profile = input.profileId || "quick";
      if(current == null || !(atr > 0)) return {available:false,obstacle:{available:false,significance:"UNAVAILABLE"},primary:{available:false,reason:"Required price or volatility is unavailable"},extended:{available:false},candidates:[]};
      const normalized = (input.levels || []).map(level => normalizeLevel(level,current,direction,atr)).filter(Boolean);
      const targetRaw = normalized.filter(automaticTargetEligible).filter(level => level.distanceAtr == null || level.distanceAtr <= policy.maximumDistanceAtr[profile]);
      const targets = clusterLevels(targetRaw,atr).map(level => ({...level,score:credibility(level,profile),available:true}));
      const byDistance = targets.slice().sort((a,b) => a.distance-b.distance || b.score-a.score);
      let primary = null;
      if(profile === "quick") primary = byDistance.find(level => level.tf === "1h" && level.score >= 48) || byDistance.find(level => level.score >= 52) || null;
      else {
        const ranked = targets.slice().sort((a,b) => b.score-a.score || a.distance-b.distance);
        primary = ranked.find(level => level.score >= 50) || null;
        const nearestOneHour = byDistance.find(level => level.tf === "1h" && level.score >= 56);
        if(nearestOneHour && (!primary || nearestOneHour.distance <= primary.distance*1.20)) primary = nearestOneHour;
      }
      const primaryOut = primary ? {...primary,remainingDistance:primary.distance,remainingAtr:primary.distanceAtr,reason:"Credible 1h-or-higher objective"} : {available:false,price:null,source:"Unavailable",reason:"No credible 1h-or-higher objective identified",remainingDistance:null,remainingAtr:null};
      const extendedChoices = primary ? targets.filter(level => (level.price-primary.price)*direction > Math.max(atr*policy.mergeAtr,1e-8)) : [];
      const extended = extendedChoices.sort((a,b) => {
        const aHigher = ["4h","1d"].includes(a.tf) ? 1 : 0, bHigher = ["4h","1d"].includes(b.tf) ? 1 : 0;
        return bHigher-aHigher || b.score-a.score || a.distance-b.distance;
      })[0] || null;
      const obstacleCandidates = normalized.filter(level => policy.obstacleTimeframes.includes(level.tf) || (level.family === "user" && !level.deliberateObjective)).filter(level => !primary || (primary.price-level.price)*direction >= 0);
      const obstacleLevel = clusterLevels(obstacleCandidates,atr).sort((a,b) => Math.abs(a.price-current)-Math.abs(b.price-current))[0] || null;
      let obstacle = {available:false,price:null,source:"Unavailable",significance:"UNAVAILABLE"};
      if(obstacleLevel){
        const families = obstacleLevel.evidenceFamilies || [];
        const distanceAtr = Math.abs(obstacleLevel.price-current)/atr;
        const significance = (obstacleLevel.tf === "15m" && families.length >= 2) || (obstacleLevel.reactions || 0) >= 3 ? "MAJOR" : obstacleLevel.tf === "15m" || families.length >= 2 || distanceAtr <= policy.majorObstacleAtr ? "MODERATE" : "MINOR";
        obstacle = {...obstacleLevel,available:true,distance:Math.abs(obstacleLevel.price-current),distanceAtr,significance};
      }
      return {available:primaryOut.available,obstacle,primary:primaryOut,extended:extended ? {...extended,remainingDistance:extended.distance,remainingAtr:extended.distanceAtr} : {available:false,price:null,source:"Unavailable"},candidates:targets,profileId:profile,direction:direction > 0 ? "LONG" : "SHORT",atr,atrTf:input.atrTf || null};
    }

    const near = (price,level,atr) => level && level.available && Math.abs(price-level.price) <= atr*policy.nearTargetAtr;
    function evaluateBinanceExits(input){
      const direction = directionNumber(input.direction), current = number(input.currentPrice), qty = Math.abs(number(input.positionQty) || 0), atr = number(input.atr), framework = input.targetFramework || {};
      const primary = framework.primary || {}, extended = framework.extended || {}, obstacle = framework.obstacle || {};
      const lifecycle=String(input.lifecycle && input.lifecycle.state || input.lifecycle || "").toUpperCase();
      const earlyThreshold=({quick:.55,"2_3h":.50,"6_8h":.45}[input.profileId] || policy.largeEarlyShare)+(lifecycle==="RUNNER"?.10:0);
      let cumulative = 0;
      const ordered=(input.orders || []).slice().sort((a,b) => direction > 0 ? Number(a.price)-Number(b.price) : Number(b.price)-Number(a.price));
      return ordered.map(order => {
        const price=number(order.price), quantity=Math.abs(number(order.quantity) || 0), share=qty > 0 ? quantity/qty : null;
        const positionSide=String(order.positionSide || "").toUpperCase();
        const correctSide = order.correctSide !== false && price != null && current != null && (price-current)*direction > 0 && (!order.side || String(order.side).toUpperCase() === (direction > 0 ? "SELL" : "BUY")) && (!positionSide || positionSide === "BOTH" || positionSide === (direction > 0 ? "LONG" : "SHORT"));
        if(correctSide && order.isLive !== false) cumulative += quantity;
        const cumulativeShare = qty > 0 ? cumulative/qty : null;
        const clustered=atr > 0 && ordered.some(other => other!==order && number(other.price)!=null && Math.abs(Number(other.price)-price)<=atr*policy.mergeAtr);
        let quality="UNAVAILABLE",reason="Required target or order data is unavailable";
        if(!correctSide || order.isLive === false){ quality="WRONG SIDE / STALE"; reason="Exit is on the wrong side, already passed, or not live for this position"; }
        else if(!(atr > 0) || !primary.available){ quality="UNAVAILABLE"; reason="No credible 1h-or-higher Primary target is available"; }
        else if(Math.abs(price-current) <= atr*policy.noiseAtr && !near(price,obstacle,atr)){ quality="INSIDE NOISE"; reason="Exit is inside normal volatility without meaningful objective support"; }
        else if(near(price,primary,atr)){ quality="WELL PLACED"; reason="Exit aligns with the credible Primary target"; }
        else if((price-primary.price)*direction > 0){
          if(extended.available && (near(price,extended,atr) || (extended.price-price)*direction >= -atr*policy.nearTargetAtr)){ quality="AGGRESSIVE"; reason="Exit is beyond Primary but supported by the Extended target"; }
          else { quality="TOO FAR"; reason="Exit lies beyond credible 1h-or-higher objective support"; }
        }else if((primary.price-price)*direction > 0){
          const excessive = (share != null && share > earlyThreshold) || (cumulativeShare != null && cumulativeShare > earlyThreshold);
          quality=excessive ? "TOO EARLY" : "CONSERVATIVE";
          reason=excessive ? "Excessive cumulative quantity exits before the Primary target" : "A modest partial exits before Primary while retaining most position quantity";
        }
        if(clustered) reason += "; clustered with another live exit inside the volatility-aware merge band";
        return {...order,price,quantity,share,cumulativeQuantity:cumulative,cumulativeShare,clustered,quality,reason};
      });
    }

    function evaluateGrLadder(input){
      const direction=directionNumber(input.direction), current=number(input.currentPrice), positionQty=Math.abs(number(input.positionQty)||0), atr=number(input.atr), framework=input.targetFramework || {};
      const expectedSide=direction > 0 ? "SELL" : "BUY",expectedPositionSide=direction > 0 ? "LONG" : "SHORT";
      const normalized=(input.orders || []).map(order => ({...order,price:number(order && order.price),quantity:Math.abs(number(order && order.quantity)||0)}));
      const valid=normalized.filter(order => {
        const ps=String(order.positionSide || "").toUpperCase();
        return order && order.isLive !== false && order.price!=null && order.quantity>0 && favourable(order.price,current,direction) && (!order.side || String(order.side).toUpperCase()===expectedSide) && (!ps || ps==="BOTH" || ps===expectedPositionSide);
      }).sort((a,b) => direction > 0 ? a.price-b.price : b.price-a.price);
      const invalidOrders=normalized.filter(order => !valid.includes(order));
      const source=input.source || "UNAVAILABLE";
      if(!valid.length || !(positionQty > 0) || !(atr > 0)) return {available:false,source,overallQuality:invalidOrders.length ? "INVALID" : "UNAVAILABLE",startQuality:"UNAVAILABLE",averageQuality:"UNAVAILABLE",endQuality:"UNAVAILABLE",distributionQuality:"UNAVAILABLE",orders:valid,invalidOrders};
      const total=valid.reduce((sum,order)=>sum+order.quantity,0), weightedAverage=valid.reduce((sum,order)=>sum+order.price*order.quantity,0)/total;
      const start=valid[0].price,end=valid.at(-1).price,primary=framework.primary || {},extended=framework.extended || {},obstacle=framework.obstacle || {};
      const primaryBand=atr*policy.nearTargetAtr, extendedBand=primaryBand;
      const buckets={beforePrimary:0,nearPrimary:0,towardExtended:0,beyondExtended:0};
      valid.forEach(order => {
        if(!primary.available || (primary.price-order.price)*direction > primaryBand) buckets.beforePrimary+=order.quantity;
        else if(Math.abs(order.price-primary.price)<=primaryBand) buckets.nearPrimary+=order.quantity;
        else if(extended.available && (extended.price-order.price)*direction >= -extendedBand) buckets.towardExtended+=order.quantity;
        else buckets.beyondExtended+=order.quantity;
      });
      const pct=value => total > 0 ? value/total : null;
      const earlyShare=pct(buckets.beforePrimary),nearShare=pct(buckets.nearPrimary),beyondShare=pct(buckets.beyondExtended),coverage=total/positionQty;
      const lifecycle=String(input.lifecycle && input.lifecycle.state || input.lifecycle || "").toUpperCase();
      const frontThreshold=({quick:.65,"2_3h":.60,"6_8h":.55}[input.profileId] || .60)+(lifecycle==="RUNNER"?.10:0);
      const largestShare=Math.max(...valid.map(order=>order.quantity/total));
      const clusterShare=Math.max(...valid.map(order=>valid.filter(other=>Math.abs(other.price-order.price)<=atr*policy.mergeAtr).reduce((sum,item)=>sum+item.quantity,0)/total));
      const ratePoint = price => !primary.available ? "UNAVAILABLE" : near(price,primary,atr) ? "WELL PLACED" : (price-primary.price)*direction < 0 ? "CONSERVATIVE" : extended.available && (near(price,extended,atr) || (extended.price-price)*direction >= -extendedBand) ? "AGGRESSIVE" : "TOO FAR";
      let startQuality=ratePoint(start);
      if(startQuality === "CONSERVATIVE" && Math.abs(start-current)<=atr*policy.noiseAtr && earlyShare>policy.smallPartialShare) startQuality="TOO EARLY";
      else if(startQuality === "CONSERVATIVE" && obstacle.available && near(start,obstacle,atr) && earlyShare<=policy.largeEarlyShare) startQuality="CONSERVATIVE";
      else if(primary.available && (start-primary.price)*direction > primaryBand && !near(start,primary,atr)) startQuality="TOO LATE";
      const averageQuality=ratePoint(weightedAverage);
      let endQuality="UNAVAILABLE";
      if(primary.available && near(end,primary,atr)) endQuality="WELL PLACED";
      else if(extended.available && near(end,extended,atr)) endQuality="AGGRESSIVE";
      else if(!extended.available && primary.available && (end-primary.price)*direction > primaryBand) endQuality="UNSUPPORTED";
      else if(extended.available && (end-extended.price)*direction > extendedBand) endQuality="TOO FAR";
      else if(primary.available) endQuality="WELL PLACED";
      let distributionQuality="BALANCED";
      if(coverage>1+policy.coverageTolerance) distributionQuality="OVERALLOCATED";
      else if(coverage<1-policy.coverageTolerance) distributionQuality="INCOMPLETE";
      else if(largestShare>=policy.concentrationShare || clusterShare>=policy.concentrationShare) distributionQuality="CONCENTRATED";
      else if(earlyShare>frontThreshold) distributionQuality="FRONT-LOADED";
      else if(beyondShare>0.45) distributionQuality="OVER-AGGRESSIVE";
      else if(nearShare<0.15 && pct(buckets.towardExtended)+beyondShare>0.65) distributionQuality="BACK-LOADED";
      else if(earlyShare>0.45) distributionQuality="OVER-CONSERVATIVE";
      let overallQuality=averageQuality;
      if(invalidOrders.length || ["OVERALLOCATED"].includes(distributionQuality)) overallQuality="INVALID";
      else if(["CONCENTRATED","INCOMPLETE"].includes(distributionQuality)) overallQuality="UNBALANCED";
      else if(["FRONT-LOADED","OVER-CONSERVATIVE"].includes(distributionQuality) || startQuality==="TOO EARLY") overallQuality="TOO EARLY";
      else if(["BACK-LOADED","OVER-AGGRESSIVE"].includes(distributionQuality)) overallQuality="AGGRESSIVE";
      else if(["TOO FAR","UNSUPPORTED"].includes(endQuality)) overallQuality=endQuality==="TOO FAR"?"TOO FAR":"UNBALANCED";
      return {available:true,source,orders:valid,invalidOrders,start,end,weightedAverage,totalQuantity:total,coverage,largestShare,clusterShare,buckets:{...buckets,beforePrimaryPct:pct(buckets.beforePrimary),nearPrimaryPct:pct(buckets.nearPrimary),towardExtendedPct:pct(buckets.towardExtended),beyondExtendedPct:pct(buckets.beyondExtended)},startQuality,averageQuality,endQuality,distributionQuality,overallQuality,reasons:{start:`Start is ${startQuality.toLowerCase()} relative to obstacle and Primary target`,average:`Quantity-weighted average is ${averageQuality.toLowerCase()} relative to the 1h+ hierarchy`,end:`End is ${endQuality.toLowerCase()} relative to Primary and Extended targets`,distribution:`Distribution is ${distributionQuality.toLowerCase()} across volatility-aware target bands`}};
    }

    function selfTest(){
      const level=(price,tf="1h",family="structure")=>({price,tf,family,source:`${tf} ${family}`,confirmed:true,reactions:2});
      const base={currentPrice:100,atr:10,direction:"LONG",profileId:"quick",levels:[level(110,"15m"),level(120,"1h"),level(150,"4h"),level(180,"1d")]};
      const targets=evaluateTargets(base), none=evaluateTargets({...base,levels:[level(110,"15m")]}), profiles=["quick","2_3h","6_8h"].map(profileId=>evaluateTargets({...base,profileId}));
      const profileScenario=["quick","2_3h","6_8h"].map(profileId=>evaluateTargets({...base,profileId,levels:[level(105,"15m"),level(140,"1h"),level(125,"4h"),level(130,"1d")]}));
      const distantOnly=evaluateTargets({...base,levels:[level(300,"1h")]});
      const dailyOnly=evaluateTargets({...base,profileId:"6_8h",levels:[level(130,"1d")]});
      const allLowTf=evaluateTargets({...base,levels:[level(104,"1m"),level(106,"3m"),level(108,"5m"),level(110,"15m"),level(120,"1h")]});
      const shortTargets=evaluateTargets({...base,direction:"SHORT",currentPrice:200,levels:[level(190,"15m"),level(180,"1h"),level(150,"4h")]});
      const exitsSmall=evaluateBinanceExits({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,orders:[{price:110,quantity:.2,side:"SELL",isLive:true}]});
      const exitsLarge=evaluateBinanceExits({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,orders:[{price:110,quantity:.8,side:"SELL",isLive:true}]});
      const exitRange=evaluateBinanceExits({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,orders:[{price:120,quantity:.2,side:"SELL",isLive:true},{price:150,quantity:.2,side:"SELL",isLive:true},{price:180,quantity:.2,side:"SELL",isLive:true},{price:90,quantity:.2,side:"SELL",isLive:true}]});
      const cumulativeEarly=evaluateBinanceExits({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,orders:[{price:110,quantity:.3,side:"SELL",isLive:true},{price:111,quantity:.3,side:"SELL",isLive:true}]});
      const ladder=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:110,quantity:.2},{price:120,quantity:.3},{price:150,quantity:.5}]});
      const shortLadder=evaluateGrLadder({direction:"SHORT",currentPrice:200,positionQty:1,atr:10,targetFramework:shortTargets,source:"AUTHORITATIVE",orders:[{price:190,quantity:.2},{price:180,quantity:.3},{price:150,quantity:.5}]});
      const front=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:105,quantity:.35},{price:110,quantity:.30},{price:120,quantity:.35}]});
      const back=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:120,quantity:.10},{price:140,quantity:.45},{price:150,quantity:.45}]});
      const incomplete=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:120,quantity:.5}]});
      const over=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:120,quantity:1.2}]});
      const concentrated=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:120,quantity:.7},{price:150,quantity:.3}]});
      const invalidLadder=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:targets,source:"AUTHORITATIVE",orders:[{price:120,quantity:.8,side:"SELL"},{price:90,quantity:.2,side:"SELL"}]});
      const unsupportedFramework={...targets,obstacle:{available:true,price:140,tf:"15m",source:"15m obstacle",significance:"MAJOR"},extended:{available:false,price:null,source:"Unavailable"}};
      const unsupportedEnd=evaluateGrLadder({direction:"LONG",currentPrice:100,positionQty:1,atr:10,targetFramework:unsupportedFramework,source:"AUTHORITATIVE",orders:[{price:120,quantity:.9},{price:140,quantity:.1}]});
      const binanceExcluded=evaluateTargets({...base,levels:[level(110,"15m"),{price:105,tf:"1h",family:"binance-exit",source:"Binance exit"},level(120,"1h")]});
      const cases={
        lowTfCannotBecomeTarget:policy.obstacleTimeframes.every(tf=>allLowTf.primary.tf!==tf&&allLowTf.extended.tf!==tf),lowTfCanBeObstacle:targets.obstacle.tf==="15m",oneHourPrimary:targets.primary.tf==="1h",higherTfExtended:["4h","1d"].includes(targets.extended.tf),dailyCanBeFormalTarget:dailyOnly.primary.tf==="1d",noTargetUnavailable:!none.primary.available,distantTargetRejected:!distantOnly.primary.available,
        profileEligibilityPreserved:profiles.every(result=>policy.eligibleTimeframes.includes(result.primary.tf)),profileRankingDiffers:profileScenario[0].primary.tf==="1h"&&profileScenario[1].primary.tf==="4h"&&["4h","1d"].includes(profileScenario[2].primary.tf),wrongSideRejected:targets.candidates.every(item=>item.price>100),shortSideCorrect:shortTargets.primary.price<200,
        binanceExitCannotInfluenceTarget:binanceExcluded.primary.price===targets.primary.price,smallEarlyConservative:exitsSmall[0].quality==="CONSERVATIVE",largeEarlyTooEarly:exitsLarge[0].quality==="TOO EARLY",nearPrimaryWellPlaced:exitRange.find(item=>item.price===120).quality==="WELL PLACED",extendedExitAggressive:exitRange.find(item=>item.price===150).quality==="AGGRESSIVE",unsupportedExitTooFar:exitRange.find(item=>item.price===180).quality==="TOO FAR",wrongSideExitDetected:exitRange.find(item=>item.price===90).quality==="WRONG SIDE / STALE",cumulativeEarlyQuantityUsed:cumulativeEarly[0].quality==="CONSERVATIVE"&&cumulativeEarly[1].quality==="TOO EARLY",
        longStartEnd:ladder.start===110&&ladder.end===150,shortStartEnd:shortLadder.start===190&&shortLadder.end===150,weightedAverageUsesQuantity:Math.abs(ladder.weightedAverage-133)<1e-9&&ladder.weightedAverage!==(110+120+150)/3,
        ratingsIndependent:!!(ladder.startQuality&&ladder.averageQuality&&ladder.endQuality),distributionTotals:Math.abs(Object.values(ladder.buckets).slice(0,4).reduce((a,b)=>a+b,0)-ladder.totalQuantity)<1e-9,
        frontLoadedDetected:front.distributionQuality==="FRONT-LOADED",backLoadedDetected:back.distributionQuality==="BACK-LOADED",concentrationDetected:concentrated.distributionQuality==="CONCENTRATED",incompleteDetected:incomplete.distributionQuality==="INCOMPLETE",overallocatedDetected:over.distributionQuality==="OVERALLOCATED",wrongSideMakesLadderInvalid:invalidLadder.overallQuality==="INVALID",unsupportedEndNotHidden:unsupportedEnd.averageQuality==="WELL PLACED"&&unsupportedEnd.endQuality==="UNSUPPORTED"&&unsupportedEnd.overallQuality!=="WELL PLACED",lowerTfCannotValidateEnd:unsupportedFramework.obstacle.tf==="15m"&&unsupportedEnd.endQuality==="UNSUPPORTED",goodEndCannotHideEarlyQuantity:front.endQuality==="WELL PLACED"&&front.overallQuality!=="WELL PLACED"
      };
      return {passed:Object.values(cases).every(Boolean),cases};
    }
    return Object.freeze({evaluateTargets,evaluateBinanceExits,evaluateGrLadder,isAutomaticTargetEligible:automaticTargetEligible,_selfTest:selfTest});
  };
})();
