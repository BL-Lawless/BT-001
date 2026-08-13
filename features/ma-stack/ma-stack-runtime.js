(() => {
  "use strict";
  const root = window.__BT001_MA_STACK_BUILD__ ||= {};
  if(!root.core) throw new Error("MA Stack core is unavailable");
  const TFs = root.TFs, LIVE_TFS = root.LIVE_TFS;
  const {unavailable,classify,applyHigherTfAgreement,markerEvents} = root.core;
  let refreshTimer = null, pending = false, lastRefresh = 0;
  let blinkSymbol = "";
  const lastEventKeyByTf = new Map();
  const lastBlinkEventByTf = new Map();
  const runtimeAdapter = () => window.MA_STACK_RUNTIME || {};
  const $id = id => { const fn=runtimeAdapter().getById; return typeof fn==="function" ? fn(id) : document.getElementById(id); };
  const ivSec = value => { const fn=runtimeAdapter().ivSec; return typeof fn==="function" ? fn(value) : 0; };
  const cfg = () => { const fn=runtimeAdapter().getConfig; return typeof fn==="function" ? fn() : null; };
  const iv = () => { const fn=runtimeAdapter().getInterval; return typeof fn==="function" ? fn() : ""; };
  const ensureDom = () => root.presentation && root.presentation.ensureDom();
  const renderEnhanced = results => root.presentation && root.presentation.renderEnhanced(results);
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
            },{...snapshot,slots}) : unavailable("Unavailable");
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
    function classifyTimeframe(interval,options={}){
      const h=hub(),slots=stackSlots();
      if(!h||typeof h.getAuthoritativeMaSnapshot!=="function"||!Array.isArray(slots)||slots.length!==5)return null;
      const periods=slots.map(slot=>slot.period),includeForming=options.includeForming!==false;
      const snapshot=h.getAuthoritativeMaSnapshot(interval,{slots,includeForming,requiredRows:Math.max(...periods)+10});
      if(!snapshot||!snapshot.reliable||!Array.isArray(snapshot.rows))return null;
      const rows=snapshot.rows.map(row=>Array.isArray(row)?row:hubRowToKline(row)).filter(row=>row&&row.every((value,index)=>index>5||Number.isFinite(value)));
      if(!rows.length)return null;
      return {...classify(rows,{tfKey:interval,tfInterval:interval,sourceType:snapshot.sourceType||"PUBLIC_MARKET_DATA_HUB",sourcePath:snapshot.sourcePath||`PUBLIC_MARKET_DATA_HUB.getAuthoritativeMaSnapshot(${interval})`,sourceIndex:Number.isFinite(Number(snapshot.sourceIndex))?Number(snapshot.sourceIndex):null},{...snapshot,slots}),slots,source:{type:snapshot.sourceType||"PUBLIC_MARKET_DATA_HUB",path:snapshot.sourcePath||"getAuthoritativeMaSnapshot",index:Number.isFinite(Number(snapshot.sourceIndex))?Number(snapshot.sourceIndex):null,includeForming}};
    }
  root.runtime = {hub,hubRowToKline,stackSlots,stackPeriods,refresh,refreshSoon,start,stop,classifyTimeframe,lastEventKeyByTf,lastBlinkEventByTf};
})();
