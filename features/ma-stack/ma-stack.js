(() => {
  "use strict";
  const root = window.__BT001_MA_STACK_BUILD__ ||= {};
  if(!root.core || !root.runtime) throw new Error("MA Stack dependencies are unavailable");
  const TFs = root.TFs;
  const {unavailable,eventIdentity,buildStackRank,clamp100,bounceSetupClassification,freshMaPairEventText} = root.core;
  const {lastEventKeyByTf,lastBlinkEventByTf} = root.runtime;
  const runtimeAdapter = () => window.MA_STACK_RUNTIME || {};
  const $id = id => { const fn=runtimeAdapter().getById; return typeof fn==="function" ? fn(id) : document.getElementById(id); };
  const Event = function(type,options){ const fn=runtimeAdapter().createEvent; return typeof fn==="function" ? fn(type,options) : new window.Event(type,options); };
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
        const liveBadge = r.provisional ? '<span class="v33-ma-live-badge" aria-label="Live forming candle">L</span>' : "";
        return `<div class="v33-ma-stack-group" data-tf="${tf.key}"><button type="button" class="v33-ma-stack-box" data-interval="${tf.interval}" data-tf="${tf.key}" data-event="${ev||''}" data-event-key="${eventKey.replace(/"/g,'&quot;')}" data-state="${r.state}" data-provisional="${r.provisional?'true':'false'}" aria-label="${tf.key} MA Stack${r.provisional?' (live, forming candle)':''}"${style}><span class="v33-ma-head"><span class="v33-tf-label">${tf.key}</span>${stackIconHtml(r.icon)}${liveBadge}</span></button><span class="v33-ma-rank-leds" data-tf="${tf.key}" aria-hidden="true">${leds}</span></div>`;
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
  root.presentation = {ensureDom,renderEnhanced};
  function markerEvents(tf,rows){ return root.core.markerEvents(tf,rows,{slots:root.runtime.stackSlots()}); }
  const api = {
    start:root.runtime.start,
    stop:root.runtime.stop,
    refresh:root.runtime.refresh,
    refreshSoon:root.runtime.refreshSoon,
    markerEvents,
    hubRowToKline:root.runtime.hubRowToKline,
    stackPeriods:root.runtime.stackPeriods,
    stackSlots:root.runtime.stackSlots,
    classifyTimeframe:root.runtime.classifyTimeframe
  };
  window.MA_STACK_STRIP = api;
})();
