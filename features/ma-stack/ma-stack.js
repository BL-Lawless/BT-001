(() => {
  "use strict";

  function runtime(){ return window.MA_STACK_RUNTIME || {}; }
  const $id = id => {
    const fn = runtime().getById;
    return typeof fn === "function" ? fn(id) : document.getElementById(id);
  };
  const ivSec = value => {
    const fn = runtime().ivSec;
    return typeof fn === "function" ? fn(value) : 0;
  };
  const cfg = () => {
    const fn = runtime().getConfig;
    return typeof fn === "function" ? fn() : null;
  };
  const iv = () => {
    const fn = runtime().getInterval;
    return typeof fn === "function" ? fn() : "";
  };
  const Event = function(type,options){
    const fn = runtime().createEvent;
    return typeof fn === "function" ? fn(type,options) : new window.Event(type,options);
  };
/* MA_STACK_STRIP — isolated removable values-line module. */
  const MA_STACK_STRIP = (() => {
    const TFs = [
      {key:"1m", interval:"1m"}, {key:"3m", interval:"3m"}, {key:"5m", interval:"5m"}, {key:"15m", interval:"15m"},
      {key:"30m", interval:"30m"},
      {key:"1H", interval:"1h"}, {key:"4H", interval:"4h"}, {key:"1D", interval:"1d"}
    ];
    let refreshTimer = null, pending = false, lastRefresh = 0;
    let blinkSymbol = "";
    const lastEventKeyByTf = new Map();
    const lastBlinkEventByTf = new Map();
    const LIVE_TFS = new Set(["1m","3m","5m","15m","30m"]);
    function hub(){ return window.PUBLIC_MARKET_DATA_HUB || null; }
    function hubRowToKline(row){
      if(!row) return null;
      return [
        Number(row.openTime || row.time * 1000),
        Number(row.open),
        Number(row.high),
        Number(row.low),
        Number(row.close),
        Number(row.volume || row.baseVolume || 0),
        Number(row.closeTime || ((Number(row.time) + (typeof ivSec === "function" ? ivSec(row.interval) : 0)) * 1000)),
        Number(row.quoteVolume || 0)
      ];
    }
    function stackSlots(){
      try{
        const provider =
          (window.MA_FEATURE && typeof window.MA_FEATURE.getCanonicalMASlots === "function")
            ? window.MA_FEATURE.getCanonicalMASlots
            : (typeof window.getCanonicalMASlots === "function" ? window.getCanonicalMASlots : null);
        const slots = provider ? provider() : null;
        if(!Array.isArray(slots) || slots.length !== 5) return null;
        return slots.map((slot,i) => {
          const period = Math.round(Number(slot && slot.period));
          if(!Number.isFinite(period) || period <= 0) return null;
          return {
            slot:i + 1,
            slotId:"MA" + (i + 1),
            period:Math.max(1,Math.min(999,period))
          };
        });
      }catch(_e){
        return null;
      }
    }
    function stackPeriods(){
      const slots = stackSlots();
      return Array.isArray(slots) && slots.length === 5 ? slots.map(slot => slot.period) : null;
    }
    function ensureDom(){
      const existing = $id("v33MAStackMetric");
      if(existing){
        const oldTitle = existing.querySelector(".k");
        if(oldTitle) oldTitle.remove();
        return;
      }
      const metricsEl=document.querySelector(".metrics"); if(!metricsEl) return;
      const metric=document.createElement("div"); metric.className="metric metric-wide"; metric.id="v33MAStackMetric";
      metric.innerHTML='<div class="v"><div id="v33MAStackStrip" class="v33-ma-stack-strip"><span style="color:var(--muted)">loading</span></div></div>';
      const assess=$id("v29AssessMetric");
      const acct=document.querySelector(".metric-account-start");
      metricsEl.insertBefore(metric, assess || acct || null);
    }
    function emaSeries(values,p){
      if(!Array.isArray(values) || values.length < p) return [];
      const a=2/(p+1), out=[]; let cur=0;
      for(let i=0;i<p;i++) cur += values[i];
      cur /= p; out[p-1]=cur;
      for(let i=p;i<values.length;i++){ cur = values[i]*a + cur*(1-a); out[i]=cur; }
      return out;
    }
    function maLabelP(slots,i){
      const slot = slots && slots[i];
      if(!slot) return "MA" + (i + 1);
      return `EMA ${slot.period}`;
    }
    function pairLabel(slots,i,j){ return `${maLabelP(slots,i)} / ${maLabelP(slots,j)}`; }
    function spreadScoreLabel(score){
      if(score <= 20) return "Tight Compression";
      if(score <= 40) return "Mild Compression";
      if(score <= 60) return "Balanced Spread";
      if(score <= 80) return "Moderate Expansion";
      return "Stretched Expansion";
    }
    function spreadDisplay(spreadPct){
      if(!Number.isFinite(spreadPct)) return "Unavailable";
      const score = Math.round(Math.max(0,Math.min(100,spreadPct/0.65*100)));
      return `${spreadScoreLabel(score)} | ${score}`;
    }
    function clamp100(v){ return Math.max(0,Math.min(100,Math.round(v))); }
    function eventText(ev,freshOnly=false){
      if(!ev) return freshOnly ? "No fresh event" : "None";
      if(freshOnly) return freshMaPairEventText(ev);
      return ev.label;
    }
    function maPairAgeText(age){
      const n = Math.max(0,Math.floor(Number(age)));
      if(!Number.isFinite(n) || n > 3) return "";
      if(n === 0) return "current candle";
      return `${n} candle${n === 1 ? "" : "s"} ago`;
    }
    function cleanMaPairPeriodText(ev){
      const periods = [];
      String((ev && ev.label) || (ev && ev.ref) || "").replace(/EMA\s*(\d+)/gi,(_m,p)=>{
        const n = Number(p);
        if(Number.isFinite(n)) periods.push(n);
        return _m;
      });
      if(periods.length >= 2) return `EMAs ${periods[0]} / ${periods[1]}`;
      return "EMAs";
    }
    function cleanMaPairTypeText(ev){
      const raw = String(ev && ev.type || "").toLowerCase().trim();
      if(raw === "crossover") return Number(ev && ev.dir) < 0 ? "Bear Crossover" : "Bull Crossover";
      if(raw === "bounce/no-cross") return "Bounce";
      return raw
        .replace(/[-/]+/g," ")
        .split(/\s+/)
        .filter(Boolean)
        .map(word=>word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ") || "Event";
    }
    function freshMaPairEventText(ev){
      const age = maPairAgeText(ev && ev.age);
      if(!ev || !age) return "No fresh event";
      return `${cleanMaPairPeriodText(ev)} ${cleanMaPairTypeText(ev)} | ${age}`;
    }
    function bounceSetupClassification(ev,ctx){
      const type = String(ev && ev.type || "").toLowerCase().trim();
      if(type !== "bounce/no-cross") return "";
      if(!ctx || !ctx.setup || ctx.state === "mixed" || ctx.state === "transition" || ctx.state === "compression"){
        return "mixed setup";
      }
      return Number(ev && ev.dir) === Number(ctx.setup) ? "supports setup" : "defies setup";
    }
    function maPairTooltipLine(ev){
      const text = freshMaPairEventText(ev);
      return text === "No fresh event" ? "MA Pair: No fresh event" : text;
    }
    function setupDir(upPairs,downPairs,upSlope,downSlope){ if(upPairs || upSlope >= 4) return 1; if(downPairs || downSlope >= 4) return -1; return 0; }
    function eventIdentity(tf,r){
      if(!r || (r.blinkIntent !== "green" && r.blinkIntent !== "red") || !r.blinkEvent) return "";
      const ev = r.blinkEvent;
      return [
        tf.key,
        ev.eventClass || "",
        ev.type || "",
        ev.ref || ev.label || "",
        ev.time || "",
        ev.dir || 0,
        r.blinkIntent
      ].join("|");
    }
    function pairEventRank(ev){
      if(!ev) return 0;
      const t = String(ev.type || "").toLowerCase();
      const adjacent = ev.pairClass === "adjacent";
      if(adjacent && (t === "crossover" || t === "failed crossover" || t === "bounce/no-cross")) return 500;
      if(adjacent && (t === "compression release" || t === "stack transition")) return 400;
      if(!adjacent && (t === "bounce/no-cross" || t === "deep defense")) return 300;
      if(!adjacent && (t === "compression" || t === "cross risk")) return 200;
      return adjacent ? 100 : 50;
    }
    function actionableMaPair(ev){
      if(!ev) return false;
      const type = String(ev.type || "").toLowerCase();
      return type === "crossover" || type === "failed crossover" || type === "bounce/no-cross" || type === "compression release" || type === "deep defense";
    }
    function maPairIntent(ev,ctx){
      if(!ev || ev.age !== 0) return {intent:"none",reason:"No current-candle MA-pair event",display:"Event - none"};
      const type = String(ev.type || "").toLowerCase();
      const weakSetup = !ctx.setup || ctx.alignment < 60 || ctx.strength < 35 || ctx.quality < 40 || ctx.state === "mixed" || ctx.state === "transition" || ctx.state === "compression";
      if(type.includes("cross risk") || type.includes("compression") || type.includes("transition")){
        return {intent:"none",reason:"MA-pair compression/cross risk",display:ev.pairClass === "adjacent" ? "Event - transition risk" : "Event - compression risk"};
      }
      if(weakSetup){
        if(actionableMaPair(ev)){
          return {intent:"none",reason:"Weak or mixed stack context",display:ev.pairClass === "adjacent" ? "Event - transition risk" : "Event - deep MA defense"};
        }
        return {intent:"none",reason:"Weak or mixed stack context",display:"Event - none"};
      }
      if(!ev.dir) return {intent:"none",reason:"Ambiguous MA-pair event",display:"Event - none"};
      const supports = ev.dir === ctx.setup;
      return {
        intent:supports ? "green" : "red",
        reason:`MA-pair event ${supports ? "supports setup" : "conflicts with setup"}`,
        display:`Event - MA-pair event ${supports ? "supports setup" : "conflicts with setup"}`
      };
    }
    function normalizeMaPairEvent(ev,ctx){
      if(!ev) return null;
      const type = String(ev.type || "").toLowerCase();
      if(ev.age > 5) return null;
      const weakDeep = ev.pairClass !== "adjacent" && (ctx.alignment < 40 || ctx.strength < 25 || ctx.quality < 45 || ctx.state === "mixed" || ctx.state === "transition" || ctx.state === "compression");
      if(weakDeep && type === "bounce/no-cross"){
        return {
          ...ev,
          type:"cross risk",
          dir:0,
          label:`${ev.ref} ${ev.pairClass === "wide" ? "wide-pair" : "deep"} cross risk`,
          rank:Math.min(ev.rank || 0,52)
        };
      }
      return ev;
    }
    function signOf(v){ return v > 0 ? 1 : v < 0 ? -1 : 0; }
    function isConfirmedBounce(diff, fast, slow, idx){
      const start = idx - 5;
      if(start < 0) return false;
      const signs = [], pct = [];
      for(let k=start;k<=idx;k++){
        const d = diff[k];
        const s = slow[k];
        if(!Number.isFinite(d)||!Number.isFinite(s)||!Number.isFinite(fast[k])) return false;
        const sg = signOf(d);
        if(!sg) return false;
        signs.push(sg);
        pct.push(Math.abs(d)/Math.max(1,Math.abs(s)));
      }
      if(!signs.every(s => s === signs[0])) return false;
      let minLocal = 0;
      for(let k=1;k<pct.length;k++) if(pct[k] < pct[minLocal]) minLocal = k;
      if(minLocal < 2 || minLocal > 3) return false;
      let shrinkCount = 0;
      for(let k=1;k<=minLocal;k++) if(pct[k] < pct[k-1]) shrinkCount++;
      if(shrinkCount < 2 || pct[minLocal] > 0.0012) return false;
      const expandsTwice = pct[minLocal+1] > pct[minLocal] && pct[minLocal+2] > pct[minLocal+1];
      const expandsMeaningfully = pct[pct.length-1] > Math.max(pct[minLocal]*1.35,pct[minLocal]+0.00025);
      if(!expandsTwice && !expandsMeaningfully) return false;
      const minIdx = start + minLocal;
      const fastAway = signs[0] > 0 ? fast[idx] > fast[minIdx] : fast[idx] < fast[minIdx];
      return fastAway;
    }
    function isFailedCross(diff, idx){
      const start = Math.max(1,idx-5);
      const curSign = signOf(diff[idx]);
      if(!curSign) return false;
      let crossIdx = -1;
      for(let k=start;k<=idx;k++){
        const prevSign = signOf(diff[k-1]), thisSign = signOf(diff[k]);
        if(prevSign && thisSign && prevSign !== thisSign) crossIdx = k;
      }
      if(crossIdx < 0 || crossIdx === idx) return false;
      const beforeSign = signOf(diff[crossIdx-1]);
      const crossedSign = signOf(diff[crossIdx]);
      if(!beforeSign || !crossedSign || beforeSign === crossedSign) return false;
      const crossedBack = curSign === beforeSign;
      const postCrossFailed = curSign === crossedSign && Math.abs(diff[idx]) < Math.abs(diff[crossIdx])*.65;
      return crossedBack || postCrossFailed;
    }
    function detectMaPair(series, slots, ctx, lookback){
      const len = series[0] ? series[0].length : 0;
      const start = Math.max(2, len - (lookback || 18));
      let best = null;
      const add = ev => {
        if(!ev) return;
        if(ev.age > 5 && best && best.age <= 5) return;
        const score = pairEventRank(ev) + (100 - Math.min(99,ev.age || 0)) + (ev.rank || 0) / 1000;
        const bestScore = best ? pairEventRank(best) + (100 - Math.min(99,best.age || 0)) + (best.rank || 0) / 1000 : -1;
        if(!best || score > bestScore) best = ev;
      };
      for(let a=0; a<slots.length-1; a++){
        for(let b=a+1; b<slots.length; b++){
          const fast = series[a], slow = series[b];
          if(!fast || !slow || !fast.length || !slow.length) continue;
          const pairRef = `MA${a+1}/MA${b+1}`;
          const pairText = pairLabel(slots,a,b);
          const pairClass = b === a + 1 ? "adjacent" : (b - a >= 3 ? "wide" : "deep");
          const pairPrefix = pairClass === "adjacent" ? "" : (pairClass === "wide" ? "wide-pair " : "deep ");
          const diff = fast.map((v,k)=>Number.isFinite(v)&&Number.isFinite(slow[k]) ? v - slow[k] : NaN);
          for(let i=start;i<len;i++){
            const f2=fast[i-2], s2=slow[i-2], f0=fast[i-1], s0=slow[i-1], f1=fast[i], s1=slow[i];
            if(![f2,s2,f0,s0,f1,s1].every(Number.isFinite)) continue;
            const prev=f0-s0, cur=f1-s1, older=f2-s2, age=len-1-i;
            const ref=Math.max(1,Math.abs(s1));
            const prevPct=Math.abs(prev)/ref, curPct=Math.abs(cur)/ref, olderPct=Math.abs(older)/ref;
            const eventTime = ctx.times && ctx.times[i] ? ctx.times[i] : i;
            const curSign = signOf(cur);
            if(prev <= 0 && cur > 0) add({eventClass:"MA-pair",type:"crossover",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}bull crossover`,age,dir:1,time:eventTime,rank:95});
            if(prev >= 0 && cur < 0) add({eventClass:"MA-pair",type:"crossover",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}bear crossover`,age,dir:-1,time:eventTime,rank:95});
            if(isFailedCross(diff,i)) add({eventClass:"MA-pair",type:"failed crossover",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}failed crossover`,age,dir:curSign || -signOf(diff[Math.max(0,i-1)]),time:eventTime,rank:82});
            const sameSide = Math.sign(cur) === Math.sign(prev) && Math.sign(cur) !== 0;
            const movingTogether = sameSide && curPct < prevPct && prevPct <= olderPct;
            const deepBounceOk = pairClass === "adjacent" || (ctx.alignment >= 40 && ctx.setup && curSign === ctx.setup && ctx.spreadDelta >= -0.005);
            if(sameSide && deepBounceOk && isConfirmedBounce(diff,fast,slow,i)) add({eventClass:"MA-pair",type:"bounce/no-cross",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}bounce / no-cross`,age,dir:curSign,time:eventTime,rank:78});
            if(sameSide && olderPct <= 0.0009 && curPct > Math.max(olderPct*1.55,0.0012)) add({eventClass:"MA-pair",type:"compression release",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}compression release`,age,dir:curSign,time:eventTime,rank:70});
            if(movingTogether && curPct <= 0.0018) add({eventClass:"MA-pair",type:"cross risk",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}cross risk`,age,dir:0,time:eventTime,rank:52});
            else if(curPct <= 0.0007) add({eventClass:"MA-pair",type:"compression",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}compression`,age,dir:0,time:eventTime,rank:45});
            if(sameSide && curPct > prevPct*1.35 && ctx.spreadDelta > 0.01) add({eventClass:"MA-pair",type:"expansion",pairClass,ref:pairRef,label:`${pairText} ${pairPrefix}expansion`,age,dir:curSign,time:eventTime,rank:58});
          }
        }
      }
      if(ctx.nearCross && !best) add({eventClass:"MA-pair",type:"stack transition",ref:"stack",label:"Stack transition",age:0,dir:0,time:ctx.times && ctx.times[len-1] ? ctx.times[len-1] : len-1,rank:45});
      return best;
    }
    function detectPriceMA(rows, series, slots, ctx, lookback){
      const len = rows.length;
      const start = Math.max(1, len - (lookback || 10));
      let best = null;
      const add = ev => {
        if(!ev) return;
        if(!best || ev.age < best.age || (ev.age === best.age && ev.rank > best.rank)) best = ev;
      };
      for(let i=len-1;i>=start;i--){
        const row = rows[i] || [], prevRow = rows[i-1] || [];
        const o=Number(row[1]), h=Number(row[2]), l=Number(row[3]), c=Number(row[4]), pc=Number(prevRow[4]);
        if(!Number.isFinite(o)||!Number.isFinite(h)||!Number.isFinite(l)||!Number.isFinite(c)||!Number.isFinite(pc)) continue;
        const age=len-1-i, tol=Math.max(c*0.0008,1);
        for(let idx=0; idx<series.length; idx++){
          const ema=series[idx]&&series[idx][i], pema=series[idx]&&series[idx][i-1];
          if(!Number.isFinite(ema)||!Number.isFinite(pema)) continue;
          const tag=maLabelP(slots,idx);
          const eventTime = Number(row[0]) || i;
          if(pc <= pema && c > ema) add({eventClass:"Price-MA",type:"price reclaim",ref:tag,label:`Price reclaim of ${tag}`,age,dir:1,time:eventTime,rank:70});
          if(pc >= pema && c < ema) add({eventClass:"Price-MA",type:"price loss",ref:tag,label:`Price loss of ${tag}`,age,dir:-1,time:eventTime,rank:70});
          if(l <= ema + tol && c > ema && c >= o) add({eventClass:"Price-MA",type:"price bounce",ref:tag,label:`Price bounce from ${tag}`,age,dir:1,time:eventTime,rank:62});
          if(h >= ema - tol && c < ema && c <= o) add({eventClass:"Price-MA",type:"price rejection",ref:tag,label:`Price rejection from ${tag}`,age,dir:-1,time:eventTime,rank:62});
          if(l <= ema + tol && c < ema && pc > pema) add({eventClass:"Price-MA",type:"failed breakdown",ref:tag,label:`Failed breakdown at ${tag}`,age,dir:1,time:eventTime,rank:54});
          if(h >= ema - tol && c > ema && pc < pema) add({eventClass:"Price-MA",type:"failed reclaim",ref:tag,label:`Failed reclaim at ${tag}`,age,dir:-1,time:eventTime,rank:54});
          if(Math.abs(c-ema) <= tol && Math.abs(pc-pema) <= tol) add({eventClass:"Price-MA",type:"MA hold / ride",ref:tag,label:`MA hold / ride at ${tag}`,age,dir:ctx.setup,time:eventTime,rank:38});
          if((c>ema&&pc>pema&&l>ema) || (c<ema&&pc<pema&&h<ema)) add({eventClass:"Price-MA",type:"MA break with acceptance",ref:tag,label:`MA break with acceptance ${tag}`,age,dir:c>ema?1:-1,time:eventTime,rank:36});
        }
      }
      return best;
    }
    function unavailable(reason){
      return {state:"mixed",icon:"~",strength:0,alignment:0,quality:0,setup:0,maPair:"No fresh event",priceEvent:"None",maPairAge:null,priceEventAge:null,blinkIntent:"none",blinkReason:"Unavailable",title:`State: Unavailable\nStack direction: mixed\nStack Alignment: 0%\nStrength: 0%\nQuality: 0%\nHigher TF agreement: mixed / unavailable\nSpread: Unavailable\nSlope agreement: unavailable\nPhase: ${reason || "Unavailable"}\nMA Pair: No fresh event\nPrice-MA: None\nMA-pair age: -\nPrice-MA age: -\nBlink intent: none\nBlink reason: Unavailable`};
    }
    function classify(rows,debugCtx,snapshot){
      const slots = stackSlots();
      if(!Array.isArray(slots) || slots.length !== 5) return unavailable("MA slots unavailable");
      const periods = slots.map(slot => slot.period);
      const maxPeriod = Math.max(...periods);
      const candles = (Array.isArray(rows)?rows:[]).filter(r=>r && Number.isFinite(Number(r[4])));
      const closes = candles.map(r=>Number(r[4]));
      const times = candles.map(r=>Number(r[0]) || 0);
      if(closes.length < maxPeriod + 10) return unavailable("Insufficient data");
      const latest = closes[closes.length-1];
      let series = periods.map(p=>emaSeries(closes,p));
      let vals = series.map(s=>s[s.length-1]);
      if(
        snapshot &&
        Array.isArray(snapshot.slots) &&
        snapshot.slots.length === slots.length &&
        snapshot.alignedBySlot &&
        snapshot.valuesBySlot &&
        slots.every(slot => Array.isArray(snapshot.alignedBySlot[slot.slotId]) && snapshot.alignedBySlot[slot.slotId].length === candles.length)
      ){
        series = slots.map(slot => snapshot.alignedBySlot[slot.slotId].slice());
        vals = slots.map(slot => Number(snapshot.valuesBySlot && snapshot.valuesBySlot[slot.slotId]));
      }
      const prevIdx = Math.max(0, closes.length-6);
      const prev2Idx = Math.max(0, closes.length-12);
      const prev = series.map(s=>s[prevIdx]);
      const prev2 = series.map(s=>s[prev2Idx]);
      if(vals.some(v=>!Number.isFinite(v)) || prev.some(v=>!Number.isFinite(v)) || prev2.some(v=>!Number.isFinite(v))) return unavailable("Insufficient MA data");
      const pairDirs = vals.slice(0,-1).map((v,i)=>Math.sign(v-vals[i+1]));
      const upPairs = pairDirs.every(x=>x>0), downPairs = pairDirs.every(x=>x<0);
      let allBull=0, allBear=0, allTotal=0, slowBull=0, slowBear=0, slowTotal=0;
      for(let i=0;i<vals.length-1;i++){
        for(let j=i+1;j<vals.length;j++){
          const d = Math.sign(vals[i]-vals[j]);
          if(!d) continue;
          allTotal++;
          if(d>0) allBull++; else allBear++;
          if(i > 0){
            slowTotal++;
            if(d>0) slowBull++; else slowBear++;
          }
        }
      }
      const adjacentScore = clamp100(Math.max(pairDirs.filter(x=>x>0).length,pairDirs.filter(x=>x<0).length)/(periods.length-1)*100);
      const allScore = allTotal ? clamp100(Math.max(allBull,allBear)/allTotal*100) : 0;
      const slowScore = slowTotal ? clamp100(Math.max(slowBull,slowBear)/slowTotal*100) : adjacentScore;
      const alignment = upPairs || downPairs ? 100 : clamp100(Math.max(adjacentScore*.50 + slowScore*.35 + allScore*.15, Math.min(80,allScore*.85)));
      const spread = Math.max(...vals)-Math.min(...vals);
      const spreadPct = latest ? spread/latest*100 : 0;
      const prevSpread = Math.max(...prev)-Math.min(...prev);
      const prevSpreadPct = latest ? prevSpread/latest*100 : spreadPct;
      const prev2Spread = Math.max(...prev2)-Math.min(...prev2);
      const prev2SpreadPct = latest ? prev2Spread/latest*100 : prevSpreadPct;
      const spreadDelta = spreadPct - prevSpreadPct;
      const spreadAccel = spreadDelta - (prevSpreadPct - prev2SpreadPct);
      const slopeSigns = vals.map((v,i)=>v-prev[i]);
      const prevSlopeSigns = prev.map((v,i)=>v-prev2[i]);
      const slopeMagPct = vals.reduce((s,v,i)=>s+Math.abs(v-prev[i])/Math.max(1,latest),0)/vals.length*100;
      const accelPct = slopeSigns.reduce((s,v,i)=>s+Math.abs(v-prevSlopeSigns[i])/Math.max(1,latest),0)/vals.length*100;
      const upSlope = slopeSigns.filter(x=>x>0).length, downSlope = slopeSigns.filter(x=>x<0).length;
      const slopeAgree = Math.max(upSlope,downSlope);
      const tight = spreadPct < 0.15;
      const nearCross = vals.slice(0,-1).some((v,i)=> latest && Math.abs(v-vals[i+1])/latest < 0.0005);
      const setup = setupDir(upPairs,downPairs,upSlope,downSlope);
      let state="mixed", icon="MX", stateLabel="Mixed";
      if(upPairs){ state="up"; icon="UP"; stateLabel="Up stack"; }
      else if(downPairs){ state="down"; icon="DN"; stateLabel="Down stack"; }
      else if(tight){ state="compression"; icon="CP"; stateLabel="Compression"; }
      else if(nearCross){ state="transition"; icon="TX"; stateLabel="Transition"; }
      let phase="Chop / Mixed";
      if(tight && spreadDelta > 0.01) phase="Compression Release";
      else if(tight && spreadDelta < -0.01) phase="Flattening Compression";
      else if(tight) phase="Neutral Compression";
      else if(nearCross) phase="Stack Transition";
      else if((upPairs||downPairs) && spreadDelta > 0 && slopeAgree >= 4) phase="Clean Expanding Trend";
      else if(upPairs || downPairs) phase="Ordered but Late/Flattening";
      const rank = buildStackRank(vals,state,setup,slots,{
        tfKey:debugCtx && debugCtx.tfKey ? debugCtx.tfKey : null,
        tfInterval:debugCtx && debugCtx.tfInterval ? debugCtx.tfInterval : null,
        sourceType:debugCtx && debugCtx.sourceType ? debugCtx.sourceType : "unknown",
        sourcePath:debugCtx && debugCtx.sourcePath ? debugCtx.sourcePath : "MA_STACK_STRIP.fetchTf -> emaSeries(closes,p)",
        sourceIndex:Number.isFinite(Number(debugCtx && debugCtx.sourceIndex))
          ? Number(debugCtx.sourceIndex)
          : Math.max(0,closes.length - 1)
      });
      const fastStack = rank.fastPairState || rank.fastStack || "mixed";
      const slowStack = rank.slowPairState || rank.slowStack || "mixed";
      const selectedBias = rank.selectedRegime || rank.selectedSide || "mixed";
      if(!tight){
        if(rank.summary === "Bullish stack"){
          state = "up";
          icon = "UP";
          stateLabel = "Bullish stack";
        }else if(rank.summary === "Bearish stack"){
          state = "down";
          icon = "DN";
          stateLabel = "Bearish stack";
        }else if(selectedBias === "bullish"){
          state = "transition";
          icon = "TX";
          stateLabel = rank.summary || "Bullish regime / pullback";
        }else if(selectedBias === "bearish"){
          state = "transition";
          icon = "TX";
          stateLabel = rank.summary || "Bearish regime / pullback";
        }else if(nearCross){
          state = "transition";
          icon = "TX";
          stateLabel = "Transition";
        }else{
          state = "mixed";
          icon = "MX";
          stateLabel = "Mixed";
        }
      }
      if(!tight){
        if(rank.summary === "Bullish stack"){
          phase = spreadDelta > 0 && slopeAgree >= 4 ? "Clean Expanding Trend" : "Bullish stack";
        }else if(rank.summary === "Bearish stack"){
          phase = spreadDelta > 0 && slopeAgree >= 4 ? "Clean Expanding Trend" : "Bearish stack";
        }else{
          phase = rank.summary || "Transition / Compression";
        }
      }
      const spreadScore = clamp100(spreadPct/0.55*100);
      const expansionScore = clamp100((spreadDelta+0.04)/0.12*100);
      const slopeScore = clamp100(slopeMagPct/0.08*100);
      const slopeAgreeScore = clamp100(slopeAgree/5*100);
      const accelScore = clamp100(accelPct/0.04*100);
      const compressionRelease = tight ? 45 : (prevSpreadPct < 0.18 && spreadDelta > 0.015 ? 85 : 55);
      const flattenPenalty = spreadDelta < -0.01 || slopeMagPct < 0.012 ? 14 : 0;
      const chopPenalty = (!upPairs && !downPairs && !tight) || nearCross ? 18 : 0;
      const overextensionPenalty = spreadPct > 1.2 ? Math.min(18,(spreadPct-1.2)*12) : 0;
      const rawStrength = alignment*.24 + spreadScore*.18 + expansionScore*.14 + slopeScore*.16 + slopeAgreeScore*.12 + accelScore*.08 + compressionRelease*.08 - flattenPenalty - chopPenalty - overextensionPenalty;
      const structureFloor = alignment >= 40 ? Math.min(35,14 + alignment*.20 + slopeAgreeScore*.05) : alignment >= 20 ? Math.min(25,10 + alignment*.22) : 0;
      const strength = clamp100(Math.max(rawStrength,structureFloor));
      const ctx = {spreadDelta,nearCross,setup,times,alignment};
      const rawMaEvent = detectMaPair(series,slots,ctx,18);
      const priceEvent = detectPriceMA(candles,series,slots,{setup},10);
      const validStructure = rawMaEvent ? 70 : 35;
      const eventFreshScore = rawMaEvent ? Math.max(0,100-rawMaEvent.age*18) : 0;
      const priceConfirm = priceEvent && priceEvent.dir && setup && priceEvent.dir === setup ? 80 : priceEvent ? 45 : 35;
      const preCompression = prev2SpreadPct < 0.22 ? 82 : 45;
      const quality = clamp100(preCompression*.16 + validStructure*.16 + expansionScore*.14 + slopeAgreeScore*.14 + alignment*.14 + priceConfirm*.12 + eventFreshScore*.10 + (chopPenalty?25:75)*.04 - chopPenalty*.55);
      const maEvent = normalizeMaPairEvent(rawMaEvent,{alignment,strength,quality,state});
      const maIntent = maPairIntent(maEvent,{setup,state,strength,quality,alignment});
      const blink = maIntent;
      const blinkEvent = blink.intent === "none" ? null : maEvent;
      const maPair = eventText(maEvent,true);
      const priceMa = eventText(priceEvent,false);
      const spreadCondition = tight ? "compression" : spreadDelta > 0.01 ? "expanding" : spreadDelta < -0.01 ? "contracting" : "balanced";
      const title = `State: ${stateLabel}\nStack direction: ${setup>0?"bullish":setup<0?"bearish":"mixed"}\nStack Alignment: ${alignment}%\nStrength: ${strength}%\nQuality: ${quality}%\nHigher TF agreement: pending\nSpread: ${spreadDisplay(spreadPct)}\nSpread condition: ${spreadCondition}\nSlope agreement: ${slopeAgree}/5\nPhase: ${phase}\nMA Pair: ${maPair}\nPrice-MA: ${priceMa}\nMA-pair age: ${maEvent?maEvent.age:"-"}\nPrice-MA age: ${priceEvent?priceEvent.age:"-"}\nBlink intent: ${blink.intent}\nBlink reason: ${blink.reason}`;
      rank.state = state;
      rank.summaryState = phase;
      return {state,icon,strength,alignment,quality,title,phase,setup,maPair,maEvent,priceEvent:priceMa,maPairAge:maEvent?maEvent.age:null,priceEventAge:priceEvent?priceEvent.age:null,blinkIntent:blink.intent,blinkReason:blink.reason,blinkEvent,eventDisplay:blink.display,rank};
    }
    function bg(state,strength){
      const a = 0.25 + Math.max(0,Math.min(100,strength))/100*0.32;
      if(state === "up") return `rgba(34,197,94,${a})`;
      if(state === "down") return `rgba(248,113,113,${a})`;
      return "";
    }
    function switchTf(interval){
      const sel=$id("interval");
      if(!sel || !interval) return;
      if(sel.value !== interval){
        sel.value = interval;
        sel.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }
    function iconClass(_icon){ return "v33-stack-icon"; }
    function stackIconHtml(icon){
      const code = String(icon || "MX").toUpperCase();
      if(code === "UP") return `<span class="${iconClass(code)}" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 2L10 7H7.4V10H4.6V7H2z" fill="currentColor"/></svg></span>`;
      if(code === "DN") return `<span class="${iconClass(code)}" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M6 10L2 5h2.6V2h2.8v3H10z" fill="currentColor"/></svg></span>`;
      if(code === "CP") return `<span class="${iconClass(code)}" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 4h8M2 8h8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>`;
      if(code === "TX") return `<span class="${iconClass(code)}" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 4h6M6 2l2 2-2 2M10 8H4M6 6 4 8l2 2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
      return `<span class="${iconClass(code)}" aria-hidden="true"><svg viewBox="0 0 12 12"><circle cx="3" cy="6" r="1.2" fill="currentColor"/><circle cx="6" cy="6" r="1.2" fill="currentColor"/><circle cx="9" cy="6" r="1.2" fill="currentColor"/></svg></span>`;
    }
    function titleLine(title,label,fallback="-"){
      const m = String(title || "").match(new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&") + ":\\s*(.*)$","m"));
      return m ? m[1] : fallback;
    }
    function stateText(r){
      const label = r.state === "up" ? "Up stack" : r.state === "down" ? "Down stack" : r.state === "compression" ? "Compression" : r.state === "transition" ? "Transition" : "Mixed";
      return `${label} / ${r.phase || "-"}`;
    }
    function maPairTooltipSummary(ev,r){
      const text = freshMaPairEventText(ev);
      if(text === "No fresh event") return "MA Pair: No fresh event";
      const bounceClass = bounceSetupClassification(ev,r);
      return bounceClass ? `${text} | ${bounceClass}` : text;
    }
    function combinedDisplayScore(r){
      const strength = Math.max(0,Math.min(100,Number(r && r.strength) || 0));
      const quality = Math.max(0,Math.min(100,Number(r && r.quality) || 0));
      return Math.max(0,Math.min(100,Math.round(strength * 0.6 + quality * 0.4)));
    }
    function stackButtonStyle(r){
      const fill = combinedDisplayScore(r);
      return ` style="--v33-stack-fill:${fill}%"`;
    }
    function rankVisualMeta(rank){
      const labels = Array.isArray(rank && rank.labels) && rank.labels.length === 5 ? rank.labels : ["EMA 9","EMA 21","EMA 55","EMA 100","EMA 200"];
      const ledStates = rank && rank.diagnostics && rank.diagnostics.ledStates ? rank.diagnostics.ledStates : {
        MA1:!!(rank && rank.okByEma && rank.okByEma[0]),
        MA2:!!(rank && rank.okByEma && rank.okByEma[1]),
        MA3:!!(rank && rank.okByEma && rank.okByEma[2]),
        MA4:!!(rank && rank.okByEma && rank.okByEma[3]),
        MA5:!!(rank && rank.okByEma && rank.okByEma[4])
      };
      return [
        {slotId:"MA5",label:labels[4] || "EMA 200",on:!!ledStates.MA5},
        {slotId:"MA4",label:labels[3] || "EMA 100",on:!!ledStates.MA4},
        {slotId:"MA3",label:labels[2] || "EMA 55",on:!!ledStates.MA3},
        {slotId:"MA2",label:labels[1] || "EMA 21",on:!!ledStates.MA2},
        {slotId:"MA1",label:labels[0] || "EMA 9",on:!!ledStates.MA1}
      ];
    }
    function buildStackRank(vals,state,setup,slots,debugCtx){
      const safeSlots = Array.isArray(slots) && slots.length === 5
        ? slots.map((slot,i) => ({
            slot:i + 1,
            slotId:"MA" + (i + 1),
            period:Number(slot && slot.period)
          }))
        : [1,2,3,4,5].map(n => ({slot:n,slotId:"MA" + n,period:null}));
      const labels = safeSlots.map((slot,i) =>
        Number.isFinite(slot.period) && slot.period > 0
          ? `EMA ${slot.period}`
          : `MA${i + 1}`
      );
      const slotIds = safeSlots.map(slot => slot.slotId);
      const off = [false,false,false,false,false];
      const emptyLedStates = Object.fromEntries(slotIds.map(slotId => [slotId,false]));
      const emptyValues = Object.fromEntries(slotIds.map(slotId => [slotId,null]));
      const emptyValid = Object.fromEntries(slotIds.map(slotId => [slotId,false]));
      const emptyComparisons = {
        "MA1<MA2":false,
        "MA2<MA3":false,
        "MA3<MA4":false,
        "MA4<MA5":false
      };
      const empty = {
        side:"mixed",
        selectedSide:"mixed",
        selectedRegime:"mixed",
        okByEma:off.slice(),
        okCount:0,
        summary:"Transition / Compression",
        labels,
        fastStack:"mixed",
        slowStack:"mixed",
        fastPairState:"mixed",
        slowPairState:"mixed",
        hingeStatus:"mixed",
        hingeText:"mixed",
        hingeSlotLabel:labels[2] || "MA3",
        fastMatch:0,
        slowMatch:0,
        hingeMatch:0,
        diagnostics:{
          selectedRegime:"mixed",
          fastPairState:"mixed",
          slowPairState:"mixed",
          hingeStatus:"mixed",
          hingeText:"mixed",
          ledMatch:0,
          ledStates:emptyLedStates,
          summary:"Transition / Compression",
          debug:{
            tfKey:debugCtx && debugCtx.tfKey ? debugCtx.tfKey : null,
            tfInterval:debugCtx && debugCtx.tfInterval ? debugCtx.tfInterval : null,
            sourceType:debugCtx && debugCtx.sourceType ? debugCtx.sourceType : "unknown",
            sourcePath:debugCtx && debugCtx.sourcePath ? debugCtx.sourcePath : "unknown",
            sourceIndex:Number.isFinite(Number(debugCtx && debugCtx.sourceIndex)) ? Number(debugCtx.sourceIndex) : null,
            tolerance:null,
            values:emptyValues,
            valid:emptyValid,
            bearishComparisons:{...emptyComparisons},
            bullishComparisons:{
              "MA1>MA2":false,
              "MA2>MA3":false,
              "MA3>MA4":false,
              "MA4>MA5":false
            },
            deltas:{
              "MA1-MA2":null,
              "MA2-MA3":null,
              "MA3-MA4":null,
              "MA4-MA5":null
            },
            labels
          }
        }
      };
      if(!Array.isArray(vals) || vals.length !== 5 || vals.some(v => !Number.isFinite(v))) return empty;

      const [ma1,ma2,ma3,ma4,ma5] = vals.map(Number);
      if(![ma1,ma2,ma3,ma4,ma5].every(Number.isFinite)) return empty;
      const base = Math.max(Math.abs(ma4),Math.abs(ma5),1);
      const tol = base * 0.0001;
      const cmp = (a,b) => (a > b + tol ? 1 : a < b - tol ? -1 : 0);
      const c12 = cmp(ma1,ma2);
      const c23 = cmp(ma2,ma3);
      const c34 = cmp(ma3,ma4);
      const c45 = cmp(ma4,ma5);
      const fullBull = c12 > 0 && c23 > 0 && c34 > 0 && c45 > 0;
      const fullBear = c12 < 0 && c23 < 0 && c34 < 0 && c45 < 0;
      const zoneLo = Math.min(ma4,ma5) - tol;
      const zoneHi = Math.max(ma4,ma5) + tol;
      const inSlowZone = ma3 >= zoneLo && ma3 <= zoneHi;

      const slowPairState = c45 === 0 ? "mixed" : (c45 > 0 ? "bullish" : "bearish");
      const selectedRegime = slowPairState === "bullish" || slowPairState === "bearish" ? slowPairState : "mixed";
      const fastPairState = c12 === 0 ? "mixed" : (c12 > 0 ? "bullish" : "bearish");

      let hingeStatus = "mixed";
      let hingeText = "mixed";
      if(selectedRegime === "bullish"){
        if(inSlowZone || Math.abs(ma3 - ma4) <= tol){
          hingeStatus = "contested";
          hingeText = "contested";
        }else if(ma3 > ma4 + tol){
          hingeStatus = "supports_bullish";
          hingeText = "supports bullish regime";
        }else{
          hingeStatus = "lost";
          hingeText = "lost / under attack";
        }
      }else if(selectedRegime === "bearish"){
        if(inSlowZone || Math.abs(ma3 - ma4) <= tol){
          hingeStatus = "contested";
          hingeText = "contested";
        }else if(ma3 < ma4 - tol){
          hingeStatus = "supports_bearish";
          hingeText = "supports bearish regime";
        }else{
          hingeStatus = "reclaimed";
          hingeText = "reclaimed / under attack";
        }
      }

      const ledStates = Object.fromEntries(slotIds.map(slotId => [slotId,false]));
      let fastMatch = 0;
      let slowMatch = 0;
      let hingeMatch = 0;
      if(fullBull || fullBear){
        slotIds.forEach(slotId => { ledStates[slotId] = true; });
        fastMatch = 2;
        slowMatch = 2;
        hingeMatch = 1;
      }else if(selectedRegime === "bullish"){
        ledStates.MA4 = true;
        ledStates.MA5 = true;
        slowMatch = 2;
        if(fastPairState === "bullish"){
          ledStates.MA1 = true;
          ledStates.MA2 = true;
          fastMatch = 2;
        }
        if(hingeStatus === "supports_bullish"){
          ledStates.MA3 = true;
          hingeMatch = 1;
        }
      }else if(selectedRegime === "bearish"){
        ledStates.MA4 = true;
        ledStates.MA5 = true;
        slowMatch = 2;
        if(fastPairState === "bearish"){
          ledStates.MA1 = true;
          ledStates.MA2 = true;
          fastMatch = 2;
        }
        if(hingeStatus === "supports_bearish"){
          ledStates.MA3 = true;
          hingeMatch = 1;
        }
      }

      const okByEma = slotIds.map(slotId => !!ledStates[slotId]);
      const okCount = okByEma.filter(Boolean).length;
      let summary = "Transition / Compression";
      if(fullBull){
        summary = "Bullish stack";
      }else if(fullBear){
        summary = "Bearish stack";
      }else if(selectedRegime === "bullish"){
        if(fastPairState === "bullish" && hingeStatus === "supports_bullish") summary = "Bullish stack";
        else if(hingeStatus === "supports_bullish" && fastPairState === "bearish") summary = "Bullish regime / pullback";
        else if((hingeStatus === "lost" || hingeStatus === "contested") && fastPairState === "bearish") summary = "Bullish regime under bearish breakdown";
        else if(hingeStatus === "lost") summary = "Bullish regime under bearish breakdown";
        else summary = "Bullish regime / pullback";
      }else if(selectedRegime === "bearish"){
        if(fastPairState === "bearish" && hingeStatus === "supports_bearish") summary = "Bearish stack";
        else if(hingeStatus === "supports_bearish" && fastPairState === "bullish") summary = "Bearish regime / pullback";
        else if((hingeStatus === "reclaimed" || hingeStatus === "contested") && fastPairState === "bullish") summary = "Bearish regime under bullish reclaim";
        else if(hingeStatus === "reclaimed") summary = "Bearish regime under bullish reclaim";
        else summary = "Bearish regime / pullback";
      }

      const valuesBySlot = {MA1:ma1,MA2:ma2,MA3:ma3,MA4:ma4,MA5:ma5};
      const diagnostics = {
        selectedRegime,
        fastPairState,
        slowPairState,
        hingeStatus,
        hingeText,
        ledMatch:okCount,
        ledStates:{...ledStates},
        summary,
        debug:{
          tfKey:debugCtx && debugCtx.tfKey ? debugCtx.tfKey : null,
          tfInterval:debugCtx && debugCtx.tfInterval ? debugCtx.tfInterval : null,
          sourceType:debugCtx && debugCtx.sourceType ? debugCtx.sourceType : "unknown",
          sourcePath:debugCtx && debugCtx.sourcePath ? debugCtx.sourcePath : "MA_STACK_STRIP.snapshot",
          sourceIndex:Number.isFinite(Number(debugCtx && debugCtx.sourceIndex)) ? Number(debugCtx.sourceIndex) : null,
          tolerance:tol,
          values:valuesBySlot,
          valid:{MA1:true,MA2:true,MA3:true,MA4:true,MA5:true},
          bearishComparisons:{
            "MA1<MA2":c12 < 0,
            "MA2<MA3":c23 < 0,
            "MA3<MA4":c34 < 0,
            "MA4<MA5":c45 < 0
          },
          bullishComparisons:{
            "MA1>MA2":c12 > 0,
            "MA2>MA3":c23 > 0,
            "MA3>MA4":c34 > 0,
            "MA4>MA5":c45 > 0
          },
          deltas:{
            "MA1-MA2":ma1 - ma2,
            "MA2-MA3":ma2 - ma3,
            "MA3-MA4":ma3 - ma4,
            "MA4-MA5":ma4 - ma5
          },
          labels
        }
      };
      return {
        side:selectedRegime,
        selectedSide:selectedRegime,
        selectedRegime,
        okByEma,
        okCount,
        summary,
        labels,
        fastStack:fastPairState,
        slowStack:slowPairState,
        fastPairState,
        slowPairState,
        hingeStatus,
        hingeText,
        hingeSlotLabel:labels[2] || "MA3",
        fastMatch,
        slowMatch,
        hingeMatch,
        diagnostics
      };
    }
    function escHtml(v){ return String(v == null ? "" : v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
    function compactTooltipHtml(tf,r){
      const alignment = Math.max(0,Math.min(5,Math.round((Number(r.alignment)||0)/20)));
      const rows = [
        `State: ${stateText(r)}`,
        `MA Stack Alignment: ${alignment}/5`,
        `Strength: ${Number.isFinite(r.strength) ? r.strength : 0}%`,
        `Quality: ${Number.isFinite(r.quality) ? r.quality : 0}%`,
        `Spread: ${titleLine(r.title,"Spread")}`
      ];
      return `<div class="v33-ma-stack-tip-title">${escHtml(tf.key)}</div>`+
        rows.map(line=>`<div class="v33-ma-stack-tip-row">${escHtml(line)}</div>`).join("")+
        `<div class="v33-ma-stack-tip-spacer"></div>`+
        `<div class="v33-ma-stack-tip-event">${escHtml(maPairTooltipSummary(r && r.maEvent,r))}</div>`;
    }
    function compactRankTooltipHtml(tf,r){
      const rank = r && r.rank ? r.rank : buildStackRank(null,"mixed",0);
      const diag = rank && rank.diagnostics ? rank.diagnostics : null;
      const dbg = diag && diag.debug ? diag.debug : null;
      const labelMap = Array.isArray(rank.labels) && rank.labels.length === 5 ? rank.labels : ["EMA 9","EMA 21","EMA 55","EMA 100","EMA 200"];
      const side = rank.selectedRegime === "bullish" || rank.selectedRegime === "bearish" ? rank.selectedRegime : "mixed";
      const ledStates = diag && diag.ledStates ? diag.ledStates : {
        MA1:!!(rank.okByEma && rank.okByEma[0]),
        MA2:!!(rank.okByEma && rank.okByEma[1]),
        MA3:!!(rank.okByEma && rank.okByEma[2]),
        MA4:!!(rank.okByEma && rank.okByEma[3]),
        MA5:!!(rank.okByEma && rank.okByEma[4])
      };
      const visualMeta = rankVisualMeta(rank);
      const sideLabel = side === "bullish" ? "Selected regime: bullish" : side === "bearish" ? "Selected regime: bearish" : "Selected regime: transition/compression";
      const fastState = rank.fastPairState || rank.fastStack || "mixed";
      const slowState = rank.slowPairState || rank.slowStack || "mixed";
      const fastScore = Number.isFinite(Number(rank.fastMatch)) ? Number(rank.fastMatch) : 0;
      const slowScore = Number.isFinite(Number(rank.slowMatch)) ? Number(rank.slowMatch) : 0;
      const hingeText = rank.hingeText || "mixed";
      const fastText = fastState === "mixed" ? "Fast pair: mixed 0/2" : `Fast pair: ${fastState} ${fastScore}/2`;
      const slowText = slowState === "mixed" ? "Slow pair: mixed 0/2" : `Slow pair: ${slowState} ${slowScore}/2`;
      const rankRows = visualMeta.map(item => `${item.label}: ${item.on ? "OK" : "out"}`);
      const fmtDbg = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-US",{maximumFractionDigits:8}) : String(v);
      const showDebug = !!window.MA_SOURCE_DEBUG;
      const dbgLines = !showDebug
        ? []
        : (dbg ? [
        "DEBUG",
        `TF used: ${dbg.tfKey || tf.key || "-"}`,
        `TF interval: ${dbg.tfInterval || "-"}`,
        `source index: ${Number.isFinite(Number(dbg.sourceIndex)) ? Number(dbg.sourceIndex) : "-"}`,
        `source type: ${dbg.sourceType || "-"}`,
        `source path: ${dbg.sourcePath || "-"}`,
        `${labelMap[0]}: ${fmtDbg(dbg.values && dbg.values.MA1)} (valid: ${!!(dbg.valid && dbg.valid.MA1)})`,
        `${labelMap[1]}: ${fmtDbg(dbg.values && dbg.values.MA2)} (valid: ${!!(dbg.valid && dbg.valid.MA2)})`,
        `${labelMap[2]}: ${fmtDbg(dbg.values && dbg.values.MA3)} (valid: ${!!(dbg.valid && dbg.valid.MA3)})`,
        `${labelMap[3]}: ${fmtDbg(dbg.values && dbg.values.MA4)} (valid: ${!!(dbg.valid && dbg.valid.MA4)})`,
        `${labelMap[4]}: ${fmtDbg(dbg.values && dbg.values.MA5)} (valid: ${!!(dbg.valid && dbg.valid.MA5)})`,
        `tol: ${fmtDbg(dbg.tolerance)}`,
        `${labelMap[0]} < ${labelMap[1]}: ${!!(dbg.bearishComparisons && dbg.bearishComparisons["MA1<MA2"])}`,
        `${labelMap[1]} < ${labelMap[2]}: ${!!(dbg.bearishComparisons && dbg.bearishComparisons["MA2<MA3"])}`,
        `${labelMap[2]} < ${labelMap[3]}: ${!!(dbg.bearishComparisons && dbg.bearishComparisons["MA3<MA4"])}`,
        `${labelMap[3]} < ${labelMap[4]}: ${!!(dbg.bearishComparisons && dbg.bearishComparisons["MA4<MA5"])}`,
        `${labelMap[0]} > ${labelMap[1]}: ${!!(dbg.bullishComparisons && dbg.bullishComparisons["MA1>MA2"])}`,
        `${labelMap[1]} > ${labelMap[2]}: ${!!(dbg.bullishComparisons && dbg.bullishComparisons["MA2>MA3"])}`,
        `${labelMap[2]} > ${labelMap[3]}: ${!!(dbg.bullishComparisons && dbg.bullishComparisons["MA3>MA4"])}`,
        `${labelMap[3]} > ${labelMap[4]}: ${!!(dbg.bullishComparisons && dbg.bullishComparisons["MA4>MA5"])}`,
        `${labelMap[0]} - ${labelMap[1]}: ${fmtDbg(dbg.deltas && dbg.deltas["MA1-MA2"])}`,
        `${labelMap[1]} - ${labelMap[2]}: ${fmtDbg(dbg.deltas && dbg.deltas["MA2-MA3"])}`,
        `${labelMap[2]} - ${labelMap[3]}: ${fmtDbg(dbg.deltas && dbg.deltas["MA3-MA4"])}`,
        `${labelMap[3]} - ${labelMap[4]}: ${fmtDbg(dbg.deltas && dbg.deltas["MA4-MA5"])}`
      ] : ["DEBUG: unavailable"]);
      return `<div class="v33-ma-stack-tip-title">${escHtml(tf.key)} Stack Rank</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(sideLabel)}</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(`LED Bias Match: ${Number(rank.okCount)||0}/5`)}</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(fastText)}</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(`${rank.hingeSlotLabel || "MA3"}: ${hingeText}`)}</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(slowText)}</div>`+
        `<div class="v33-ma-stack-tip-row">${escHtml(`Summary: ${rank.summary || "Transition / Compression"}`)}</div>`+
        `<div class="v33-ma-stack-tip-spacer is-small"></div>`+
        rankRows.map(line=>`<div class="v33-ma-stack-tip-row">${escHtml(line)}</div>`).join("")+
        (showDebug ? `<div class="v33-ma-stack-tip-spacer"></div>` : "")+
        dbgLines.map(line=>`<div class="v33-ma-stack-tip-row">${escHtml(line)}</div>`).join("");
    }
    function ensureMaStackTooltip(){
      let tip = document.getElementById("v33MAStackTooltip");
      if(tip) return tip;
      tip = document.createElement("div");
      tip.id = "v33MAStackTooltip";
      tip.style.cssText = "position:fixed;z-index:99999;display:none;pointer-events:none;white-space:nowrap";
      document.body.appendChild(tip);
      return tip;
    }
    function positionMaStackTooltip(btn){
      const tip = ensureMaStackTooltip();
      const r = btn.getBoundingClientRect();
      const pad = 8;
      let x = r.left;
      let y = r.bottom + 8;
      const tw = tip.offsetWidth || 180;
      const th = tip.offsetHeight || 140;
      if(x + tw + pad > window.innerWidth) x = Math.max(pad,window.innerWidth - tw - pad);
      if(y + th + pad > window.innerHeight) y = Math.max(pad,r.top - th - 8);
      tip.style.left = Math.round(x) + "px";
      tip.style.top = Math.round(y) + "px";
    }
    function showMaStackTooltip(btn){
      const tip = ensureMaStackTooltip();
      tip.innerHTML = btn.__v33TipHtml || "";
      tip.style.display = "block";
      positionMaStackTooltip(btn);
    }
    function hideMaStackTooltip(){
      const tip = document.getElementById("v33MAStackTooltip");
      if(tip) tip.style.display = "none";
    }
    function applyHigherTfAgreement(results){
      const order = TFs.map(x=>x.key);
      order.forEach((key,idx)=>{
        const r = results[key];
        if(!r || !Number.isFinite(r.quality)) return;
        const higher = order.slice(idx+1).map(k=>results[k]).find(x=>x && Number.isFinite(x.setup) && x.setup);
        const agreement = higher && r.setup ? (higher.setup === r.setup ? "aligned" : "conflicting") : "mixed / unavailable";
        const delta = agreement === "aligned" ? 8 : agreement === "conflicting" ? -12 : -3;
        r.quality = clamp100(r.quality + delta);
        r.title = String(r.title || "").replace(/Quality: \d+%/,`Quality: ${r.quality}%`).replace(/Higher TF agreement: .*/m,`Higher TF agreement: ${agreement}`);
      });
    }
    function render(results){
      ensureDom(); const strip=$id("v33MAStackStrip"); if(!strip) return;
      const tooltipHtmlByTf = new Map();
      const html = TFs.map(tf=>{
        const r=results[tf.key] || unavailable("Unavailable");
        const style = stackButtonStyle(r);
        const ev = r.blinkIntent === "green" ? "green" : r.blinkIntent === "red" ? "red" : "";
        const eventKey = eventIdentity(tf,r);
        tooltipHtmlByTf.set(tf.key,compactTooltipHtml(tf,r));
        return `<button type="button" class="v33-ma-stack-box" data-interval="${tf.interval}" data-tf="${tf.key}" data-event="${ev||''}" data-event-key="${eventKey.replace(/"/g,'&quot;')}" data-state="${r.state}" aria-label="${tf.key} MA Stack"${style}><span class="v33-tf-label">${tf.key}</span>${stackIconHtml(r.icon)}</button>`;
      }).join("");
      if(strip.__v33LastHtml !== html){
        strip.innerHTML = html;
        strip.__v33LastHtml = html;
      }
      strip.querySelectorAll(".v33-ma-stack-box").forEach(btn=>{
        const tf = btn.dataset.tf || "";
        const ev = btn.dataset.event || "";
        const evKey = btn.dataset.eventKey || "";
        btn.__v33TipHtml = tooltipHtmlByTf.get(tf) || "";
        if(ev && evKey && lastEventKeyByTf.get(tf) !== evKey){
          lastEventKeyByTf.set(tf,evKey);
          lastBlinkEventByTf.set(tf, ev);
          btn.classList.remove("v33-flash-cross","v33-flash-bounce");
          void btn.offsetWidth;
          btn.classList.add(ev === "red" ? "v33-flash-cross" : "v33-flash-bounce");
          setTimeout(()=>btn.classList.remove("v33-flash-cross","v33-flash-bounce"),1100);
        }
        if(btn.__v33ClickBound) return;
        btn.__v33ClickBound = true;
        btn.addEventListener("click",()=>switchTf(btn.dataset.interval),false);
        btn.addEventListener("mouseenter",()=>showMaStackTooltip(btn),false);
        btn.addEventListener("mousemove",()=>positionMaStackTooltip(btn),false);
        btn.addEventListener("mouseleave",hideMaStackTooltip,false);
        btn.addEventListener("focus",()=>showMaStackTooltip(btn),false);
        btn.addEventListener("blur",hideMaStackTooltip,false);
      });
    }
    function renderEnhanced(results){
      ensureDom(); const strip=$id("v33MAStackStrip"); if(!strip) return;
      const summaryTooltipHtmlByTf = new Map();
      const rankTooltipHtmlByTf = new Map();
      const html = TFs.map(tf=>{
        const r=results[tf.key] || unavailable("Unavailable");
        const style = stackButtonStyle(r);
        const ev = r.blinkIntent === "green" ? "green" : r.blinkIntent === "red" ? "red" : "";
        const eventKey = eventIdentity(tf,r);
        const rank = r && r.rank ? r.rank : buildStackRank(null,"mixed",0);
        const visualMeta = rankVisualMeta(rank);
        const leds = visualMeta.map(item => {
          const on = item.on;
          const side = rank.selectedSide === "bullish" ? "bull" : rank.selectedSide === "bearish" ? "bear" : "off";
          const cls = on && side !== "off" ? `v33-rank-led is-on ${side}` : "v33-rank-led";
          return `<span class="${cls}" data-ema="${item.label}" aria-hidden="true"></span>`;
        }).join("");
        summaryTooltipHtmlByTf.set(tf.key,compactTooltipHtml(tf,r));
        rankTooltipHtmlByTf.set(tf.key,compactRankTooltipHtml(tf,r));
        return `<div class="v33-ma-stack-group" data-tf="${tf.key}"><button type="button" class="v33-ma-stack-box" data-interval="${tf.interval}" data-tf="${tf.key}" data-event="${ev||''}" data-event-key="${eventKey.replace(/"/g,'&quot;')}" data-state="${r.state}" aria-label="${tf.key} MA Stack"${style}><span class="v33-ma-head"><span class="v33-tf-label">${tf.key}</span>${stackIconHtml(r.icon)}</span></button><span class="v33-ma-rank-leds" data-tf="${tf.key}" aria-hidden="true">${leds}</span></div>`;
      }).join("");
      if(strip.__v33LastHtml !== html){
        strip.innerHTML = html;
        strip.__v33LastHtml = html;
      }
      strip.querySelectorAll(".v33-ma-stack-box").forEach(btn=>{
        const tf = btn.dataset.tf || "";
        const ev = btn.dataset.event || "";
        const evKey = btn.dataset.eventKey || "";
        btn.__v33SummaryTipHtml = summaryTooltipHtmlByTf.get(tf) || "";
        btn.__v33RankTipHtml = rankTooltipHtmlByTf.get(tf) || "";
        const head = btn.querySelector(".v33-ma-head");
        const group = btn.closest(".v33-ma-stack-group");
        const ledRow = group ? group.querySelector(".v33-ma-rank-leds") : null;
        if(ev && evKey && lastEventKeyByTf.get(tf) !== evKey){
          lastEventKeyByTf.set(tf,evKey);
          lastBlinkEventByTf.set(tf, ev);
          btn.classList.remove("v33-flash-cross","v33-flash-bounce");
          void btn.offsetWidth;
          btn.classList.add(ev === "red" ? "v33-flash-cross" : "v33-flash-bounce");
          setTimeout(()=>btn.classList.remove("v33-flash-cross","v33-flash-bounce"),1100);
        }
        if(btn.__v33ClickBound) return;
        btn.__v33ClickBound = true;
        btn.addEventListener("click",()=>switchTf(btn.dataset.interval),false);
        if(head){
          head.addEventListener("mouseenter",()=>{ btn.__v33TipHtml = btn.__v33SummaryTipHtml || ""; showMaStackTooltip(btn); },false);
          head.addEventListener("mousemove",()=>positionMaStackTooltip(btn),false);
        }
        if(ledRow){
          ledRow.addEventListener("mouseenter",()=>{ btn.__v33TipHtml = btn.__v33RankTipHtml || ""; showMaStackTooltip(btn); },false);
          ledRow.addEventListener("mousemove",()=>positionMaStackTooltip(btn),false);
          ledRow.addEventListener("mouseleave",hideMaStackTooltip,false);
          ledRow.addEventListener("click",()=>switchTf(btn.dataset.interval),false);
        }
        if(group) group.addEventListener("mouseleave",hideMaStackTooltip,false);
        else btn.addEventListener("mouseleave",hideMaStackTooltip,false);
        btn.addEventListener("focus",()=>{ btn.__v33TipHtml = btn.__v33SummaryTipHtml || ""; showMaStackTooltip(btn); },false);
        btn.addEventListener("blur",hideMaStackTooltip,false);
      });
    }
    async function fetchTf(tf){
      const h = hub();
      if(!h) return null;
      const periods = stackPeriods();
      if(!Array.isArray(periods) || periods.length !== 5) return null;
      const maxPeriod = Math.max(...periods);
      const limit = Math.max(260,Math.min(1000,maxPeriod+60));
      const sourceRows = LIVE_TFS.has(tf.interval) && typeof h.getChartBuffer === "function"
        ? h.getChartBuffer(tf.interval)
        : (typeof h.getClosedBuffer === "function" ? h.getClosedBuffer(tf.interval) : []);
      const rows = (Array.isArray(sourceRows) ? sourceRows : [])
        .slice(-limit)
        .map(hubRowToKline)
        .filter(row => row && row.every((v,idx) => idx > 5 || Number.isFinite(v)));
      return rows.length ? rows : null;
    }
    async function refresh(){
      if(pending) return; pending=true; ensureDom();
      try{
        const liveSymbol = (typeof cfg === "function" && cfg() && cfg().symbol ? cfg().symbol : "").toUpperCase();
        if(liveSymbol && blinkSymbol !== liveSymbol){
          blinkSymbol = liveSymbol;
          lastEventKeyByTf.clear();
          lastBlinkEventByTf.clear();
        }
        const out={};
        const h = hub();
        if(h && typeof h.ensureMaStackBuffers === "function"){
          await h.ensureMaStackBuffers(false).catch(() => {});
        }
        await Promise.all(TFs.map(async tf=>{
          try{
            const slots = stackSlots();
            if(!Array.isArray(slots) || slots.length !== 5){
              out[tf.key] = unavailable("MA slots unavailable");
              return;
            }
            const periods = slots.map(slot => slot.period);
            const includeForming = LIVE_TFS.has(tf.interval);
            let snapshot = null;
            if(h && typeof h.getAuthoritativeMaSnapshot === "function"){
              snapshot = h.getAuthoritativeMaSnapshot(tf.interval,{
                slots,
                includeForming,
                requiredRows:Math.max(...periods) + 10
              });
            }
            const rows = snapshot && Array.isArray(snapshot.rows)
              ? snapshot.rows
                  .map(row => Array.isArray(row) ? row : hubRowToKline(row))
                  .filter(row => row && row.every((v,idx) => idx > 5 || Number.isFinite(v)))
              : null;
            if(!snapshot){
              out[tf.key] = unavailable("MA snapshot unavailable");
              return;
            }
            if(snapshot && !snapshot.reliable){
              out[tf.key] = unavailable(`Warmup: ${snapshot.warmupCount}/${snapshot.requiredRows}`);
              return;
            }
            out[tf.key] = rows && rows.length ? classify(rows,{
              tfKey:tf.key,
              tfInterval:tf.interval,
              sourceType:snapshot ? snapshot.sourceType : (includeForming ? "hub.getChartBuffer" : "hub.getClosedBuffer"),
              sourcePath:snapshot ? snapshot.sourcePath : `PUBLIC_MARKET_DATA_HUB.${includeForming ? "getChartBuffer" : "getClosedBuffer"}(${tf.interval}) -> hubRowToKline -> emaSeries`,
              sourceIndex:snapshot && Number.isFinite(Number(snapshot.sourceIndex)) ? Number(snapshot.sourceIndex) : null
            },snapshot) : unavailable("Unavailable");
          }catch(e){
            out[tf.key]=unavailable("Fetch failed: "+(e&&e.message?e.message:String(e)));
          }
        }));
        applyHigherTfAgreement(out);
        renderEnhanced(out); lastRefresh=Date.now();
        if(window.MA_SOURCE_DEBUG){
          try{
            const htf = TFs.find(x => x.interval === (typeof iv === "function" ? iv() : "")) || TFs[0];
            const selected = htf ? out[htf.key] : null;
            const rankDbg = selected && selected.rank && selected.rank.diagnostics ? selected.rank.diagnostics.debug : null;
            const sssc = window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3 && typeof window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3.getDiagnosticForTf === "function"
              ? window.R13_SSSC_PROTO_V1_LIVE_COSMETIC_REBUILD_R3.getDiagnosticForTf(htf ? htf.key : "")
              : null;
            console.info("MA_SOURCE_DEBUG parity",{
              tfKey:htf ? htf.key : null,
              tfInterval:htf ? htf.interval : null,
              chartSnapshot:rankDbg && rankDbg.values ? rankDbg.values : null,
              maStack:rankDbg && rankDbg.values ? rankDbg.values : null,
              sssc:sssc && Array.isArray(sssc.emaVals) ? {
                MA1:sssc.emaVals[0],
                MA2:sssc.emaVals[1],
                MA3:sssc.emaVals[2],
                MA4:sssc.emaVals[3],
                MA5:sssc.emaVals[4]
              } : null,
              source:rankDbg ? {
                sourcePath:rankDbg.sourcePath,
                sourceIndex:rankDbg.sourceIndex,
                sourceType:rankDbg.sourceType
              } : null
            });
          }catch(_debugErr){}
        }
      }finally{
        pending=false;
      }
    }
    function refreshSoon(){ if(refreshTimer || pending) return; const wait=Math.max(50,1000-(Date.now()-lastRefresh)); refreshTimer=setTimeout(()=>{ refreshTimer=null; refresh(); },wait); }
    function start(){ ensureDom(); const h=hub(); if(h && typeof h.setMaStackVisible === "function") h.setMaStackVisible(true); refreshSoon(); }
    function stop(){ if(refreshTimer) clearTimeout(refreshTimer); refreshTimer=null; const h=hub(); if(h && typeof h.setMaStackVisible === "function") h.setMaStackVisible(false); }
    function labEventBucket(ev){
      const type = String(ev && ev.type || "").toLowerCase();
      const deep = ev && ev.pairClass !== "adjacent";
      if(type === "crossover") return "crossover";
      if(type === "failed crossover") return "failed";
      if(type === "bounce/no-cross") return deep ? "deepBounce" : "bounce";
      if(type === "compression") return deep ? "deepRisk" : "compression";
      if(type === "compression release") return "release";
      if(type === "stack transition") return "transition";
      if(deep && type === "cross risk") return "deepRisk";
      return "";
    }
    function labEventSettingKey(bucket){
      return bucket === "deepBounce" || bucket === "deepRisk" ? "deep" : bucket;
    }
    function labPairIndexes(slots,ref){
      const m = String(ref || "").match(/MA(\d)[^/]*\/\s*MA(\d)/i);
      if(!m) return null;
      const a = Number(m[1]) - 1;
      const b = Number(m[2]) - 1;
      return a >= 0 && b >= 0 ? {a,b} : null;
    }
    function labPairStillValid(ev,series,slots,candidateIdx,confirmedIdx){
      const pair = labPairIndexes(slots,ev.ref);
      if(!pair) return true;
      if(confirmedIdx <= candidateIdx) return true;
      const fast = series[pair.a], slow = series[pair.b];
      if(!fast || !slow) return false;
      const cd = Number(fast[candidateIdx]) - Number(slow[candidateIdx]);
      const pd = Number(fast[Math.max(0,candidateIdx-1)]) - Number(slow[Math.max(0,candidateIdx-1)]);
      const fd = Number(fast[confirmedIdx]) - Number(slow[confirmedIdx]);
      if(![cd,pd,fd].every(Number.isFinite)) return false;
      const type = String(ev.type || "").toLowerCase();
      const dir = Number(ev.dir) || signOf(cd) || signOf(fd);
      const confirmedSign = signOf(fd);
      const sameSideThroughConfirmation = () => {
        if(!dir) return false;
        for(let k=candidateIdx;k<=confirmedIdx;k++){
          const d = Number(fast[k]) - Number(slow[k]);
          if(!Number.isFinite(d) || signOf(d) !== dir) return false;
        }
        return true;
      };
      if(type === "crossover") return dir && confirmedSign === dir;
      if(type === "failed crossover") return dir && confirmedSign === dir;
      if(type === "bounce/no-cross") return sameSideThroughConfirmation() && Math.abs(fd) >= Math.abs(cd) * 0.98;
      if(type === "compression release") return dir && confirmedSign === dir && Math.abs(fd) >= Math.abs(cd) * 1.02;
      if(type === "compression" || type === "cross risk") return Math.abs(fd) <= Math.max(Math.abs(cd) * 1.35,Math.abs(Number(slow[confirmedIdx])) * 0.0025);
      return true;
    }
    function labStackStillValid(ev,confirmed){
      if(!confirmed) return false;
      const type = String(ev.type || "").toLowerCase();
      if(type !== "stack transition") return true;
      return confirmed.state === "transition" || !!(confirmed.maEvent && String(confirmed.maEvent.type || "").toLowerCase() === "stack transition");
    }
    function markerEvents(tf,rows,opts={}){
      const source = (Array.isArray(rows) ? rows : []).filter(row => row && row.every((v,idx) => idx > 5 || Number.isFinite(v)));
      const slots = stackSlots();
      if(!Array.isArray(slots) || slots.length !== 5) return [];
      const periods = slots.map(slot => slot.period);
      const maxPeriod = Math.max(...periods);
      const start = Math.max(maxPeriod + 10, Number(opts.startIndex) || maxPeriod + 10);
      const end = Math.min(source.length - 1, Number.isFinite(opts.endIndex) ? opts.endIndex : source.length - 1);
      const windowSize = Math.max(maxPeriod + 25, Math.min(320,maxPeriod + 100));
      const closes = source.map(r=>Number(r[4]));
      const series = periods.map(p=>emaSeries(closes,p));
      const out = [];
      for(let i=start;i<=end;i++){
        const slice = source.slice(Math.max(0,i-windowSize+1),i+1);
        if(slice.length < maxPeriod + 10) continue;
        const r = classify(slice);
        const ev = r && r.maEvent;
        if(!ev || ev.age !== 0) continue;
        const bucket = labEventBucket(ev);
        const settingKey = labEventSettingKey(bucket);
        const confirmationCandles = typeof opts.confirmationCandlesFor === "function"
          ? Math.max(0,Math.min(20,Math.round(Number(opts.confirmationCandlesFor(settingKey,bucket,ev)) || 0)))
          : 0;
        const confirmedIndex = i + confirmationCandles;
        if(confirmedIndex > end || confirmedIndex >= source.length) continue;
        const confirmedSlice = source.slice(Math.max(0,confirmedIndex-windowSize+1),confirmedIndex+1);
        if(confirmedSlice.length < maxPeriod + 10) continue;
        const confirmed = confirmationCandles ? classify(confirmedSlice) : r;
        if(!labPairStillValid(ev,series,slots,i,confirmedIndex)) continue;
        if(!labStackStillValid(ev,confirmed)) continue;
        const candidateRow = source[i] || [];
        const confirmedRow = source[confirmedIndex] || [];
        const candidateTime = Math.floor((Number(candidateRow[0]) || Number(ev.time) || 0)/1000);
        const confirmedTime = Math.floor((Number(confirmedRow[0]) || Number(ev.time) || 0)/1000);
        const strength = Number(confirmed && confirmed.strength) || Number(r.strength) || 0;
        const quality = Number(confirmed && confirmed.quality) || Number(r.quality) || 0;
        const alignment = Number(confirmed && confirmed.alignment) || Number(r.alignment) || 0;
        const outcomeWindow = typeof opts.outcomeWindowFor === "function"
          ? opts.outcomeWindowFor(settingKey,bucket,ev)
          : undefined;
        out.push({
          tf:tf.key,
          interval:tf.interval,
          time:confirmedTime,
          candidateTime,
          confirmedTime,
          confirmationCandles,
          price:Number(confirmedRow[4]),
          type:ev.type,
          eventType:ev.type,
          pairClass:ev.pairClass || "adjacent",
          ref:ev.ref || "",
          pair:ev.ref || "",
          label:ev.label || "",
          timeframe:tf.key,
          strength,
          quality,
          alignment,
          Strength:strength,
          Quality:quality,
          Alignment:alignment,
          outcomeWindow,
          sourceIndex:confirmedIndex,
          candidateIndex:i,
          confirmedIndex,
          state:(confirmed && confirmed.state) || r.state || "mixed"
        });
      }
      return out;
    }
    function classifyTimeframe(interval,options={}){
      const h=hub(),slots=stackSlots();
      if(!h||typeof h.getAuthoritativeMaSnapshot!=="function"||!Array.isArray(slots)||slots.length!==5)return null;
      const periods=slots.map(slot=>slot.period),includeForming=options.includeForming!==false;
      const snapshot=h.getAuthoritativeMaSnapshot(interval,{slots,includeForming,requiredRows:Math.max(...periods)+10});
      if(!snapshot||!snapshot.reliable||!Array.isArray(snapshot.rows))return null;
      const rows=snapshot.rows.map(row=>Array.isArray(row)?row:hubRowToKline(row)).filter(row=>row&&row.every((value,index)=>index>5||Number.isFinite(value)));
      if(!rows.length)return null;
      return {...classify(rows,{tfKey:interval,tfInterval:interval,sourceType:snapshot.sourceType||"PUBLIC_MARKET_DATA_HUB",sourcePath:snapshot.sourcePath||`PUBLIC_MARKET_DATA_HUB.getAuthoritativeMaSnapshot(${interval})`,sourceIndex:Number.isFinite(Number(snapshot.sourceIndex))?Number(snapshot.sourceIndex):null},snapshot),slots,source:{type:snapshot.sourceType||"PUBLIC_MARKET_DATA_HUB",path:snapshot.sourcePath||"getAuthoritativeMaSnapshot",index:Number.isFinite(Number(snapshot.sourceIndex))?Number(snapshot.sourceIndex):null,includeForming}};
    }
    return {start,stop,refresh,refreshSoon,markerEvents,hubRowToKline,stackPeriods,stackSlots,classifyTimeframe};
  })();
  window.MA_STACK_STRIP = MA_STACK_STRIP;

})();
