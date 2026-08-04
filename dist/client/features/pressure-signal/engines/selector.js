(() => {
  "use strict";

  const STORAGE_KEY="bt001_signal_engine_selection";
  const LABELS=Object.freeze({A:"Signal A — Current",B:"Signal B — Refined blend",C:"Signal C — 9/55"});

  function createSignalEngineSelector({registry,storage,onChange,storageKey=STORAGE_KEY}={}){
    if(!registry) throw new TypeError("Signal engine registry is required");
    let session=storage;
    if(!session){try{session=window.sessionStorage;}catch(_error){session=null;}}
    let selectedId="A",destroyed=false;
    const unsubscribe=registry.subscribe(event=>{
      if(destroyed || registry.isAvailable(selectedId)) return;
      if(registry.isAvailable("A")) select("A",{reason:event&&event.type||"engine-unavailable"});
    });
    function stored(){try{return String(session&&session.getItem(storageKey)||"").toUpperCase();}catch(_error){return "";}}
    function resolve(id){return registry.isAvailable(id) ? String(id).toUpperCase() : "A";}
    function persist(id){try{if(session)session.setItem(storageKey,id);}catch(_error){}}
    function select(id,{persistSelection=true,reason="selector"}={}){
      if(destroyed) return false;
      const next=String(id || "").toUpperCase();
      if(!registry.isAvailable(next)) return false;
      const previousId=selectedId;
      if(previousId===next && registry.diagnostics().activeEngineId===next){if(persistSelection)persist(next);return true;}
      selectedId=next;
      try{registry.activate(next,reason);}catch(error){selectedId=previousId;throw error;}
      if(persistSelection)persist(next);
      if(typeof onChange==="function") onChange({previousId,nextId:next,reason,activationGeneration:registry.diagnostics().activationGeneration});
      return true;
    }
    function initialize(){
      const candidate=resolve(stored());
      if(candidate!==stored()) persist(candidate);
      select(candidate,{persistSelection:true,reason:"initial-selection"});
      return candidate;
    }
    function diagnostics(){return {selectedEngineId:selectedId,selectedEngineVersion:registry.get(selectedId)?.version || null,selectionStorageType:"sessionStorage",storageKey};}
    function destroy(){destroyed=true;unsubscribe();}
    return Object.freeze({initialize,select,getSelectedId:()=>selectedId,isSelectable:id=>registry.isAvailable(id),diagnostics,destroy});
  }

  function installSignalEngineSettings({registry,selector,body}={}){
    if(!body && window.BT001SettingsTabs){
      const definition=window.BT001SettingsTabs.get("signals");
      body=definition && definition.body;
    }
    if(!body || !registry || !selector) return false;
    let card=document.getElementById("signalEngineSettingsCard");
    if(!card){
      card=document.createElement("div");
      card.id="signalEngineSettingsCard";
      card.className="settings-card signal-engine-settings-card";
      card.innerHTML='<div class="settings-card-title">Signal engine</div><div class="settings-card-desc">Choose the entry Signal engine for this browser window. The Signal horizon controls remain independent.</div><div class="signal-engine-choices" role="radiogroup" aria-label="Signal engine"></div><div class="signal-engine-storage-note">Selection is stored for this window only (sessionStorage).</div>';
    }
    body.appendChild(card);
    const choices=card.querySelector(".signal-engine-choices");
    if(choices){
      choices.replaceChildren();
      ["A","B","C"].forEach(id=>{
        const descriptor=registry.get(id),available=!!descriptor && descriptor.status==="available",selected=selector.getSelectedId()===id;
        const label=document.createElement("label");label.className="signal-engine-choice";label.dataset.available=String(available);
        const input=document.createElement("input");input.type="radio";input.name="signalEngineSelector";input.value=id;input.checked=selected;input.disabled=!available;
        const copy=document.createElement("span");copy.className="signal-engine-choice-copy";
        const name=document.createElement("strong");name.textContent=LABELS[id];
        const status=document.createElement("small");status.textContent=available ? `${descriptor.version} · Available` : "Unavailable";
        copy.append(name,status);label.append(input,copy);choices.appendChild(label);
        input.addEventListener("change",()=>{if(input.checked && selector.select(id,{reason:"settings-selector"})) installSignalEngineSettings({registry,selector,body});});
      });
    }
    return true;
  }

  Object.defineProperty(window,"createSignalEngineSelector",{value:createSignalEngineSelector,configurable:true});
  Object.defineProperty(window,"installSignalEngineSettings",{value:installSignalEngineSettings,configurable:true});
})();
