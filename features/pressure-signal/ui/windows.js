(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};

  build.createWindowSystem = function createWindowSystem(config,format){
    const state = {
      signalReport:null,management:null,snapshot:null,signalCopy:"",positionCopy:"",
      signalHorizonId:null,
      signalWindow:null,positionWindow:null,positionBody:null,positionTitle:null,
      signalTooltip:"",positionTooltip:"",signalTip:null,positionTip:null,
      overlay:null,activeWindow:null,signalBound:false,positionBound:false,viewportBound:false,
      signalTooltipBound:false,positionTooltipBound:false,tooltipScrollBound:false,
      tooltipHover:{
        signal:{buttonHovered:false,tooltipHovered:false,bridgeTimer:null},
        position:{buttonHovered:false,tooltipHovered:false,bridgeTimer:null}
      },
      geometry:new WeakMap(),resizeObservers:[],mutationObservers:[],listeners:[]
    };
    const TOOLTIP_BRIDGE_DELAY = 110;

    const listen = (target,type,handler,options=false) => {
      if(!target) return;
      target.addEventListener(type,handler,options);
      state.listeners.push(() => target.removeEventListener(type,handler,options));
    };
    const stored = key => {
      try{ return JSON.parse(localStorage.getItem(key) || "null"); }catch(_e){ return null; }
    };
    const save = (key,value) => {
      try{ localStorage.setItem(key,JSON.stringify(value)); }catch(_e){}
    };
    const minimumSize = element => element && element.classList.contains("pressure-position-window")
      ? {width:380,height:180}
      : {width:300,height:200};
    const allWindows = () => [state.signalWindow,state.positionWindow].filter(Boolean);
    const ensureOverlay = () => {
      if(state.overlay && state.overlay.isConnected) return state.overlay;
      const existing = document.getElementById("pressureWindowOverlay");
      state.overlay = existing || document.createElement("div");
      state.overlay.id = "pressureWindowOverlay";
      state.overlay.className = "pressure-window-overlay";
      if(!existing) document.body.appendChild(state.overlay);
      if(!state.viewportBound){
        state.viewportBound = true;
        listen(window,"resize",() => {
          allWindows().forEach(win => clampToViewport(win));
          repositionOpenTooltips();
          if(state.signalWindow) save(config.storage.signalWindow,windowState(state.signalWindow));
          if(state.positionWindow) save(config.storage.positionWindow,windowState(state.positionWindow));
        },{passive:true});
      }
      return state.overlay;
    };
    const bringToFront = element => {
      if(!element) return;
      state.activeWindow = element;
      allWindows().forEach(win => {
        const active = win === element;
        win.classList.toggle("is-window-active",active);
        win.style.zIndex = active ? "2" : "1";
      });
    };
    const clampToViewport = element => {
      if(!element || !element.isConnected || !element.classList.contains("is-open")) return;
      let rect = element.getBoundingClientRect();
      if(!(rect.width > 0) || !(rect.height > 0)) return;
      const header = element.querySelector(".pressure-signal-details-header,.pressure-position-header");
      const headerHeight = Math.max(30,header && header.getBoundingClientRect().height || 0);
      const accessibleWidth = Math.min(160,Math.max(96,rect.width*0.35));
      const minLeft = Math.min(4,accessibleWidth-rect.width);
      const maxLeft = Math.max(minLeft,window.innerWidth-accessibleWidth);
      const maxTop = Math.max(4,window.innerHeight-headerHeight-2);
      const left = Math.max(minLeft,Math.min(maxLeft,rect.left));
      const top = Math.max(4,Math.min(maxTop,rect.top));
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${Math.round(top)}px`;
    };
    const makeDraggable = (element,header,persist) => {
      if(!element || !header) return;
      let drag = null;
      listen(element,"pointerdown",() => bringToFront(element),true);
      listen(header,"pointerdown",event => {
        if(event.target.closest("button")) return;
        const rect = element.getBoundingClientRect();
        drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
        bringToFront(element);
        element.classList.add("is-dragging");
        try{ header.setPointerCapture(event.pointerId); }catch(_e){}
        event.preventDefault();
      });
      listen(header,"pointermove",event => {
        if(!drag) return;
        element.style.left = `${Math.round(drag.left+event.clientX-drag.x)}px`;
        element.style.top = `${Math.round(drag.top+event.clientY-drag.y)}px`;
        clampToViewport(element);
      });
      const endDrag = event => {
        if(!drag) return;
        drag = null;
        element.classList.remove("is-dragging");
        try{ header.releasePointerCapture(event.pointerId); }catch(_e){}
        persist();
      };
      listen(header,"pointerup",endDrag);
      listen(header,"pointercancel",endDrag);
    };
    const makeResizable = (element,persist) => {
      if(!element) return;
      const minimum = minimumSize(element);
      let resize = null;
      ["n","ne","e","se","s","sw","w","nw"].forEach(edge => {
        const handle = document.createElement("div");
        handle.className = `pressure-resize-handle pressure-resize-${edge}`;
        handle.dataset.resizeEdge = edge;
        handle.setAttribute("aria-hidden","true");
        element.appendChild(handle);
        listen(handle,"pointerdown",event => {
          if(element.classList.contains("is-collapsed")) return;
          const rect = element.getBoundingClientRect();
          resize = {edge,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};
          bringToFront(element);
          element.classList.add("is-resizing");
          try{ handle.setPointerCapture(event.pointerId); }catch(_e){}
          event.preventDefault();
          event.stopPropagation();
        });
        listen(handle,"pointermove",event => {
          if(!resize || resize.edge !== edge) return;
          const dx = event.clientX-resize.x;
          const dy = event.clientY-resize.y;
          let left = resize.left;
          let top = resize.top;
          let width = resize.right-resize.left;
          let height = resize.bottom-resize.top;
          if(edge.includes("w")){
            left = Math.max(4,Math.min(resize.right-minimum.width,resize.left+dx));
            width = resize.right-left;
          }else if(edge.includes("e")){
            width = Math.max(minimum.width,resize.right+dx-resize.left);
          }
          if(edge.includes("n")){
            top = Math.max(4,Math.min(resize.bottom-minimum.height,resize.top+dy));
            height = resize.bottom-top;
          }else if(edge.includes("s")){
            height = Math.max(minimum.height,resize.bottom+dy-resize.top);
          }
          Object.assign(element.style,{left:`${Math.round(left)}px`,top:`${Math.round(top)}px`,width:`${Math.round(width)}px`,height:`${Math.round(height)}px`});
          event.preventDefault();
          event.stopPropagation();
        });
        const endResize = event => {
          if(!resize || resize.edge !== edge) return;
          resize = null;
          element.classList.remove("is-resizing");
          try{ handle.releasePointerCapture(event.pointerId); }catch(_e){}
          clampToViewport(element);
          persist();
          event.stopPropagation();
        };
        listen(handle,"pointerup",endResize);
        listen(handle,"pointercancel",endResize);
      });
    };
    const windowState = element => {
      if(!element) return null;
      const rect = element.getBoundingClientRect();
      const prior = state.geometry.get(element) || {};
      const computed = getComputedStyle(element);
      const visible = rect.width > 0 && rect.height > 0;
      const expanded = visible && !element.classList.contains("is-collapsed");
      const finiteStyle = (property,fallback) => {
        const value = Number.parseFloat(element.style[property] || computed[property]);
        return Number.isFinite(value) ? value : fallback;
      };
      const geometry = {
        left:visible ? rect.left : (Number.isFinite(prior.left) ? prior.left : finiteStyle("left",8)),
        top:visible ? rect.top : (Number.isFinite(prior.top) ? prior.top : finiteStyle("top",8)),
        width:expanded ? rect.width : (Number.isFinite(prior.width) ? prior.width : finiteStyle("width",400)),
        height:expanded ? rect.height : (Number.isFinite(prior.height) ? prior.height : finiteStyle("height",420))
      };
      state.geometry.set(element,geometry);
      const sections = {};
      element.querySelectorAll("details[data-section]").forEach(section => { sections[section.dataset.section] = section.open; });
      const body = element.querySelector(".pressure-signal-details-body,.pressure-position-body");
      return {open:element.classList.contains("is-open"),...geometry,scrollTop:body && body.scrollTop || 0,sections,collapsed:element.classList.contains("is-collapsed")};
    };
    const restore = (element,key) => {
      const value = stored(key);
      if(!element || !value) return;
      const minimum = minimumSize(element);
      state.geometry.set(element,{left:value.left,top:value.top,width:value.width,height:value.height});
      if(Number.isFinite(value.left)) element.style.left = `${value.left}px`;
      if(Number.isFinite(value.top)) element.style.top = `${value.top}px`;
      if(Number.isFinite(value.width)) element.style.width = `${Math.max(minimum.width,value.width)}px`;
      if(Number.isFinite(value.height)) element.style.height = `${Math.max(minimum.height,value.height)}px`;
      if(Number.isFinite(value.width) || Number.isFinite(value.height)) element.dataset.sizeInitialized = "true";
      element.classList.toggle("is-collapsed",!!value.collapsed);
      if(value.open){ element.classList.add("is-open"); element.setAttribute("aria-hidden","false"); }
      requestAnimationFrame(() => {
        clampToViewport(element);
        const body = element.querySelector(".pressure-signal-details-body,.pressure-position-body");
        if(body) body.scrollTop = Number(value.scrollTop || 0);
        Object.entries(value.sections || {}).forEach(([name,open]) => {
          const section = element.querySelector(`details[data-section="${name}"]`);
          if(section) section.open = !!open;
        });
      });
    };

    function copyText(text,button){
      const value = String(text || "");
      const done = () => {
        if(!button) return;
        const previous = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { if(button.isConnected) button.textContent = previous; },900);
      };
      if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
        navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value,done));
      }else fallbackCopy(value,done);
    }
    function fallbackCopy(value,done){
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try{ document.execCommand("copy"); done(); }catch(_e){}
      area.remove();
    }

    function renderPriceText(pre,text){
      pre.replaceChildren(format.priceTokens(String(text || "")));
    }

    function createToolbarTooltip(id,label){
      const tip = document.createElement("div");
      tip.id = id;
      tip.className = "pressure-toolbar-tooltip";
      tip.setAttribute("role","tooltip");
      tip.setAttribute("aria-label",label);
      tip.setAttribute("aria-hidden","true");
      const pre = document.createElement("pre");
      tip.appendChild(pre);
      document.body.appendChild(tip);
      const kind = id === "pressureSignalToolbarTip" ? "signal" : "position";
      listen(tip,"pointerenter",() => {
        const hover = state.tooltipHover[kind];
        hover.tooltipHovered = true;
        clearTooltipBridge(kind);
      });
      listen(tip,"pointerleave",() => {
        state.tooltipHover[kind].tooltipHovered = false;
        scheduleTooltipBridgeHide(kind);
      });
      return tip;
    }
    function ensureToolbarTooltips(){
      if(!state.signalTip || !state.signalTip.isConnected) state.signalTip = createToolbarTooltip("pressureSignalToolbarTip","Signal summary");
      if(!state.positionTip || !state.positionTip.isConnected) state.positionTip = createToolbarTooltip("pressurePositionToolbarTip","Position management summary");
      return {signal:state.signalTip,position:state.positionTip};
    }
    function renderToolbarTooltip(kind){
      const tips = ensureToolbarTooltips();
      const tip = tips[kind];
      const content = kind === "signal" ? state.signalTooltip : state.positionTooltip;
      const pre = tip && tip.querySelector("pre");
      if(pre) renderPriceText(pre,content);
      if(tip && tip.classList.contains("is-open")) positionToolbarTooltip(kind);
    }
    function positionToolbarTooltip(kind){
      const control = document.getElementById(kind === "signal" ? "pressureSignalEntry" : "pressureSignalExit");
      const tip = kind === "signal" ? state.signalTip : state.positionTip;
      if(!tip || !tip.classList.contains("is-open")) return;
      if(!toolbarControlAvailable(control)){
        hideToolbarTooltip(kind);
        return;
      }
      const controlRect = control.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 6;
      const left = Math.max(4,Math.min(window.innerWidth-tipRect.width-4,controlRect.left));
      const below = controlRect.bottom+margin;
      const top = below+tipRect.height <= window.innerHeight-4
        ? below
        : Math.max(4,controlRect.top-tipRect.height-margin);
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    }
    function toolbarControl(kind){
      return document.getElementById(kind === "signal" ? "pressureSignalEntry" : "pressureSignalExit");
    }
    function toolbarControlAvailable(control){
      if(!control || !control.isConnected || control.hidden) return false;
      const style = getComputedStyle(control);
      if(style.display === "none" || style.visibility === "hidden") return false;
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
    function clearTooltipBridge(kind){
      const hover = state.tooltipHover[kind];
      if(!hover || hover.bridgeTimer == null) return;
      clearTimeout(hover.bridgeTimer);
      hover.bridgeTimer = null;
    }
    function hideToolbarTooltip(kind){
      const hover = state.tooltipHover[kind];
      clearTooltipBridge(kind);
      if(hover){
        hover.buttonHovered = false;
        hover.tooltipHovered = false;
      }
      const tip = kind === "signal" ? state.signalTip : state.positionTip;
      if(!tip) return;
      tip.classList.remove("is-open");
      tip.setAttribute("aria-hidden","true");
    }
    function scheduleTooltipBridgeHide(kind){
      const hover = state.tooltipHover[kind];
      if(!hover) return;
      clearTooltipBridge(kind);
      if(hover.buttonHovered || hover.tooltipHovered) return;
      hover.bridgeTimer = setTimeout(() => {
        hover.bridgeTimer = null;
        if(!hover.buttonHovered && !hover.tooltipHovered) hideToolbarTooltip(kind);
      },TOOLTIP_BRIDGE_DELAY);
    }
    function showToolbarTooltip(kind){
      const tip = kind === "signal" ? state.signalTip : state.positionTip;
      const content = kind === "signal" ? state.signalTooltip : state.positionTooltip;
      if(!tip || !content || !toolbarControlAvailable(toolbarControl(kind))) return;
      renderToolbarTooltip(kind);
      hideTooltips(kind);
      clearTooltipBridge(kind);
      tip.classList.add("is-open");
      tip.setAttribute("aria-hidden","false");
      positionToolbarTooltip(kind);
    }
    function hideTooltips(exceptKind=null){
      ["signal","position"].forEach(kind => {
        if(kind !== exceptKind) hideToolbarTooltip(kind);
      });
    }
    function repositionOpenTooltips(){
      ["signal","position"].forEach(positionToolbarTooltip);
    }
    function bindToolbarTooltip(control,kind){
      if(!control) return;
      const flag = kind === "signal" ? "signalTooltipBound" : "positionTooltipBound";
      if(state[flag]) return;
      state[flag] = true;
      const tip = kind === "signal" ? state.signalTip : state.positionTip;
      control.setAttribute("aria-describedby",tip.id);
      listen(control,"pointerenter",() => {
        state.tooltipHover[kind].buttonHovered = true;
        clearTooltipBridge(kind);
        showToolbarTooltip(kind);
      });
      listen(control,"pointerleave",() => {
        state.tooltipHover[kind].buttonHovered = false;
        scheduleTooltipBridgeHide(kind);
      });
      listen(control,"blur",() => hideToolbarTooltip(kind));
      listen(control,"pointerdown",() => hideToolbarTooltip(kind));
    }
    function positionTooltipText(management){
      if(!management) return "Action: WAIT\nPosition health: Unavailable\nPrimary reason: Position management is unavailable\nManagement anchor: Unavailable\nExit monitor: None";
      const anchor = management.anchor;
      const source = anchor && String(anchor.source || "selected").toLowerCase();
      const anchorText = anchor
        ? `${anchor.label} at ${format.price(anchor.level)} (${source})`
        : "Unavailable";
      const pathRank = {CONFIRMED:4,DEVELOPING:3,WARNING:2,CLEAR:1};
      const paths = [["Path A",management.pathA],["Path B",management.pathB]].filter(([,path]) => path);
      const advanced = paths.sort((a,b) => (pathRank[b[1].state] || 0)-(pathRank[a[1].state] || 0))[0];
      const monitor = management.activatedPath || (advanced && advanced[1].state !== "CLEAR"
        ? `${advanced[0]} ${advanced[1].state}${advanced[1].reason ? ` - ${advanced[1].reason}` : ""}`
        : "None");
      return [
        `Action: ${management.action || "WAIT"}`,
        `Position health: ${management.health || "Unavailable"}`,
        `Primary reason: ${management.primaryReason || "Unavailable"}`,
        `Management anchor: ${anchorText}`,
        `Exit monitor: ${monitor}`
      ].join("\n");
    }

    function enhanceSignalWindow(){
      const win = document.getElementById("pressureSignalDetails");
      if(!win || state.signalBound) return;
      state.signalBound = true;
      state.signalWindow = win;
      ensureOverlay().appendChild(win);
      win.setAttribute("aria-label","Signal Details");
      const header = win.querySelector(".pressure-signal-details-header");
      const title = win.querySelector(".pressure-signal-details-title");
      const close = win.querySelector(".pressure-signal-details-close");
      if(title) title.textContent = "Signal Details";
      const horizon = document.createElement("div");
      horizon.className = "pressure-management-horizon pressure-signal-window-horizon";
      const signalHorizonLabels = {quick:"Quick","2_3h":"2\u20133H","6_8h":"6\u20138H"};
      Object.keys(config.managementHorizons).forEach(id => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.signalHorizon = id;
        button.textContent = signalHorizonLabels[id] || config.managementHorizons[id].label;
        listen(button,"click",event => {
          event.stopPropagation();
          if(window.PRESSURE_SIGNAL && typeof window.PRESSURE_SIGNAL.setHorizon === "function") window.PRESSURE_SIGNAL.setHorizon(id);
        });
        horizon.appendChild(button);
      });
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "pressure-window-control pressure-window-copy";
      copy.textContent = "Copy";
      copy.setAttribute("aria-label","Copy Signal Details");
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "pressure-window-control";
      collapse.textContent = "-";
      collapse.setAttribute("aria-label","Collapse Signal Details");
      if(header){
        header.insertBefore(horizon,close || null);
        header.insertBefore(collapse,close || null);
        header.insertBefore(copy,collapse);
      }
      listen(copy,"click",event => { event.stopPropagation(); copyText(state.signalCopy,copy); });
      const persist = () => save(config.storage.signalWindow,windowState(win));
      makeDraggable(win,header,persist);
      makeResizable(win,persist);
      listen(collapse,"click",event => {
        event.stopPropagation();
        windowState(win);
        win.classList.toggle("is-collapsed");
        collapse.textContent = win.classList.contains("is-collapsed") ? "+" : "-";
        persist();
      });
      const body = win.querySelector(".pressure-signal-details-body");
      listen(body,"scroll",persist,{passive:true});
      if(typeof MutationObserver === "function"){
        const observer = new MutationObserver(persist);
        observer.observe(win,{attributes:true,attributeFilter:["class","style","aria-hidden"]});
        state.mutationObservers.push(observer);
      }
      if(typeof ResizeObserver === "function"){
        const observer = new ResizeObserver(persist);
        observer.observe(win);
        state.resizeObservers.push(observer);
      }
      restore(win,config.storage.signalWindow);
      collapse.textContent = win.classList.contains("is-collapsed") ? "+" : "-";
      if(win.classList.contains("is-open")) bringToFront(win);
    }

    function createPositionWindow(){
      if(state.positionWindow) return state.positionWindow;
      const win = document.createElement("section");
      win.id = "pressurePositionManagement";
      win.className = "pressure-position-window";
      win.setAttribute("role","dialog");
      win.setAttribute("aria-label","Position Management");
      win.setAttribute("aria-hidden","true");
      const header = document.createElement("header");
      header.className = "pressure-position-header";
      const title = document.createElement("span");
      title.className = "pressure-position-title";
      title.textContent = "Position Management";
      const horizon = document.createElement("div");
      horizon.className = "pressure-management-horizon";
      Object.entries(config.managementHorizons).forEach(([id,item]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.managementHorizon = id;
        button.textContent = item.label;
        button.addEventListener("click",event => {
          event.stopPropagation();
          if(window.PRESSURE_SIGNAL && typeof window.PRESSURE_SIGNAL.setManagementHorizon === "function") window.PRESSURE_SIGNAL.setManagementHorizon(id);
        });
        horizon.appendChild(button);
      });
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "pressure-window-control pressure-window-copy";
      copy.textContent = "Copy";
      copy.setAttribute("aria-label","Copy Position Management");
      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "pressure-window-control";
      collapse.textContent = "-";
      collapse.setAttribute("aria-label","Collapse Position Management");
      const close = document.createElement("button");
      close.type = "button";
      close.className = "pressure-window-control pressure-window-close";
      close.textContent = "\u00d7";
      close.setAttribute("aria-label","Close Position Management");
      const body = document.createElement("div");
      body.className = "pressure-position-body";
      header.append(title,horizon,copy,collapse,close);
      win.append(header,body);
      ensureOverlay().appendChild(win);
      state.positionWindow = win;
      state.positionBody = body;
      state.positionTitle = title;
      listen(copy,"click",event => { event.stopPropagation(); copyText(state.positionCopy,copy); });
      listen(collapse,"click",event => {
        event.stopPropagation();
        windowState(win);
        win.classList.toggle("is-collapsed");
        collapse.textContent = win.classList.contains("is-collapsed") ? "+" : "-";
        save(config.storage.positionWindow,windowState(win));
      });
      listen(close,"click",event => { event.stopPropagation(); closePosition(); });
      listen(body,"scroll",() => save(config.storage.positionWindow,windowState(win)),{passive:true});
      if(typeof MutationObserver === "function"){
        const observer = new MutationObserver(() => save(config.storage.positionWindow,windowState(win)));
        observer.observe(win,{attributes:true,attributeFilter:["class","style","aria-hidden"]});
        state.mutationObservers.push(observer);
      }
      makeDraggable(win,header,() => save(config.storage.positionWindow,windowState(win)));
      makeResizable(win,() => save(config.storage.positionWindow,windowState(win)));
      if(typeof ResizeObserver === "function"){
        const observer = new ResizeObserver(() => save(config.storage.positionWindow,windowState(win)));
        observer.observe(win);
        state.resizeObservers.push(observer);
      }
      restore(win,config.storage.positionWindow);
      collapse.textContent = win.classList.contains("is-collapsed") ? "+" : "-";
      if(win.classList.contains("is-open")) bringToFront(win);
      return win;
    }

    function bindToolbar(){
      ensureToolbarTooltips();
      enhanceSignalWindow();
      createPositionWindow();
      const signalIndicator = document.getElementById("pressureSignalEntry");
      const indicator = document.getElementById("pressureSignalExit");
      bindToolbarTooltip(signalIndicator,"signal");
      bindToolbarTooltip(indicator,"position");
      if(!state.tooltipScrollBound){
        state.tooltipScrollBound = true;
        listen(document,"scroll",() => hideTooltips(),{capture:true,passive:true});
        listen(window,"blur",() => hideTooltips());
        listen(document,"visibilitychange",() => { if(document.hidden) hideTooltips(); });
        listen(document.documentElement,"pointerleave",() => hideTooltips());
        listen(document,"pointercancel",() => hideTooltips(),true);
        listen(document,"pointerdown",event => {
          const target = event.target;
          const insideKind = ["signal","position"].find(kind => {
            const control = toolbarControl(kind);
            const tip = kind === "signal" ? state.signalTip : state.positionTip;
            return control && control.contains(target) || tip && tip.contains(target);
          });
          hideTooltips(insideKind || null);
        },true);
        const topbar = document.querySelector(".topbar");
        if(topbar && typeof MutationObserver === "function"){
          const observer = new MutationObserver(() => {
            ["signal","position"].forEach(kind => {
              const tip = kind === "signal" ? state.signalTip : state.positionTip;
              if(tip && tip.classList.contains("is-open") && !toolbarControlAvailable(toolbarControl(kind))) hideToolbarTooltip(kind);
            });
          });
          observer.observe(topbar,{subtree:true,childList:true,attributes:true,attributeFilter:["class","style","hidden","aria-hidden"]});
          state.mutationObservers.push(observer);
        }
      }
      if(indicator && indicator.dataset.positionWindowBound !== "true"){
        indicator.dataset.positionWindowBound = "true";
        const open = event => {
          if(event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopImmediatePropagation();
          openPosition();
        };
        listen(indicator,"click",open,true);
        listen(indicator,"keydown",open,true);
        indicator.setAttribute("aria-controls","pressurePositionManagement");
        indicator.setAttribute("aria-haspopup","dialog");
      }
    }

    function reportSection(label,text,open){
      const details = document.createElement("details");
      details.dataset.section = label.toLowerCase();
      details.open = !!open;
      const summary = document.createElement("summary");
      summary.textContent = label;
      const pre = document.createElement("pre");
      renderPriceText(pre,text);
      details.append(summary,pre);
      return details;
    }

    function positionReport(management,snapshot){
      const position = management && management.position;
      if(!position){
        return {summary:"No open position.",analysis:"Management starts when a position is detected.",diagnostics:"No position campaign or ROI epoch is active."};
      }
      const roi = management.roi || {};
      const summary = [
        `Symbol: ${snapshot.symbol}`,
        `Position: ${position.side} ${format.quantity(position.qty)}`,
        `Average entry price: ${format.price(position.price)}`,
        `Current price: ${format.price(position.currentPrice)}`,
        `Floating P/L: ${format.money(position.unrealizedPnl)}`,
        `Current margin ROI: ${format.percent(roi.current)}`,
        `ROI epoch: ${roi.epoch}`,
        `Peak margin ROI: ${format.percent(roi.peak)}`,
        `Time since peak: ${roi.timeSincePeakMs == null ? "Unavailable" : `${Math.round(roi.timeSincePeakMs/60000)} minutes`}`,
        `Peak surrendered: ${roi.surrenderPoints == null ? "Unavailable" : `${roi.surrenderPoints.toFixed(1)} percentage points`}`,
        `Relative surrender: ${roi.relativeSurrender == null ? "Unavailable" : `${Math.round(roi.relativeSurrender*100)}%`}`,
        `Maximum favorable price: ${format.price(roi.maxFavorablePrice)}`,
        `Campaign result: ${format.money(roi.campaignResult)}`,
        `Campaign monetary MFE: ${format.money(roi.campaignMfe)}`,
        `Management horizon: ${management.horizonLabel}`,
        `Management anchor: ${management.anchor.label} at ${format.price(management.anchor.level)}`,
        `Anchor source: ${management.anchor.source}`,
        `Position health: ${management.health}`,
        `Action: ${management.action}`,
        `Primary reason: ${management.primaryReason}`,
        `Failure to progress: ${management.progress.state}`,
        `Path B - Opposite regime: ${management.pathB.state}`,
        `Path A - Anchor invalidation: ${management.pathA.state}`,
        management.activatedPath ? `Exit activated: ${management.activatedPath}` : "Exit activated: No"
      ].join("\n");
      return {
        summary,
        analysis:(management.analysis || []).join("\n"),
        diagnostics:[...(management.diagnostics || []),"Health history:",...(management.healthHistory || []).map(item => `${format.time(item.at)} - ${item.state}: ${item.reason}`),"Threats:",...(management.threats || ["None"])].join("\n")
      };
    }

    function renderPosition(){
      if(!state.positionBody || !state.management || !state.snapshot) return;
      const preserved = windowState(state.positionWindow);
      const report = positionReport(state.management,state.snapshot);
      state.positionBody.replaceChildren();
      const pre = document.createElement("pre");
      pre.className = "pressure-position-summary";
      renderPriceText(pre,report.summary);
      state.positionBody.append(pre,reportSection("Analysis",report.analysis,preserved && preserved.sections.analysis),reportSection("Diagnostics",report.diagnostics,preserved && preserved.sections.diagnostics));
      if(preserved) state.positionBody.scrollTop = preserved.scrollTop;
      state.positionWindow.querySelectorAll("[data-management-horizon]").forEach(button => button.classList.toggle("is-active",button.dataset.managementHorizon === state.management.horizonId));
      state.positionCopy = [
        "POSITION MANAGEMENT",
        `Symbol: ${state.snapshot.symbol}`,
        `Position: ${state.management.position ? `${state.management.position.side} ${format.quantity(state.management.position.qty)}` : "None"}`,
        `Snapshot: ${format.time(state.snapshot.createdAt)}`,
        "",
        report.summary,"","Analysis",report.analysis,"","Diagnostics",report.diagnostics
      ].join("\n");
    }

    function update(payload){
      state.signalReport = payload.signalReport || state.signalReport;
      state.management = payload.management || state.management;
      state.snapshot = payload.snapshot || state.snapshot;
      setSignalHorizon(payload.signalHorizonId || state.signalHorizonId);
      state.signalTooltip = payload.signalTooltip || state.signalTooltip;
      state.positionTooltip = positionTooltipText(state.management);
      bindToolbar();
      renderToolbarTooltip("signal");
      renderToolbarTooltip("position");
      if(state.signalReport && state.snapshot){
        state.signalCopy = [
          "SIGNAL DETAILS",
          `Symbol: ${state.snapshot.symbol}`,
          `Horizon: ${payload.horizonLabel}`,
          `Snapshot: ${format.time(state.snapshot.createdAt)}`,
          "",state.signalReport.summary,"","Analysis",state.signalReport.analysis,"","Diagnostics",state.signalReport.diagnostics
        ].join("\n");
      }
      const signalWindow = document.getElementById("pressureSignalDetails");
      if(signalWindow){
        signalWindow.querySelectorAll("pre").forEach(pre => renderPriceText(pre,pre.textContent));
      }
      renderPosition();
    }

    function openSignal(){
      bindToolbar();
      hideTooltips();
      const entry = document.getElementById("pressureSignalEntry");
      const win = document.getElementById("pressureSignalDetails");
      if(entry && win && !win.classList.contains("is-open")) entry.click();
      if(win){ bringToFront(win); requestAnimationFrame(() => clampToViewport(win)); }
    }
    function openPosition(){
      const win = createPositionWindow();
      hideTooltips();
      win.classList.add("is-open");
      win.setAttribute("aria-hidden","false");
      bringToFront(win);
      requestAnimationFrame(() => clampToViewport(win));
      const indicator = document.getElementById("pressureSignalExit");
      if(indicator) indicator.setAttribute("aria-expanded","true");
      save(config.storage.positionWindow,windowState(win));
    }
    function closePosition(){
      const win = createPositionWindow();
      win.classList.remove("is-open");
      win.setAttribute("aria-hidden","true");
      const indicator = document.getElementById("pressureSignalExit");
      if(indicator) indicator.setAttribute("aria-expanded","false");
      save(config.storage.positionWindow,windowState(win));
    }
    function destroy(){
      hideTooltips();
      state.listeners.splice(0).forEach(remove => { try{ remove(); }catch(_e){} });
      state.resizeObservers.splice(0).forEach(observer => observer.disconnect());
      state.mutationObservers.splice(0).forEach(observer => observer.disconnect());
      if(state.signalTip) state.signalTip.remove();
      if(state.positionTip) state.positionTip.remove();
      if(state.overlay) state.overlay.remove();
      state.signalBound = false;
      state.signalWindow = null;
      state.positionWindow = null;
      state.positionBody = null;
      state.positionTitle = null;
      state.signalTip = null;
      state.positionTip = null;
      state.overlay = null;
      state.activeWindow = null;
      state.viewportBound = false;
      state.signalTooltipBound = false;
      state.positionTooltipBound = false;
      state.tooltipScrollBound = false;
      ["signal","position"].forEach(kind => {
        const hover = state.tooltipHover[kind];
        if(!hover) return;
        clearTooltipBridge(kind);
        hover.buttonHovered = false;
        hover.tooltipHovered = false;
      });
    }

    const recoverWindows = () => allWindows().forEach(win => clampToViewport(win));
    const setSignalHorizon = horizonId => {
      const changed = !!horizonId && horizonId !== state.signalHorizonId;
      if(changed) hideTooltips();
      if(horizonId) state.signalHorizonId = horizonId;
      if(state.signalWindow){
        state.signalWindow.querySelectorAll("[data-signal-horizon]").forEach(button => button.classList.toggle("is-active",button.dataset.signalHorizon === state.signalHorizonId));
      }
      return state.signalHorizonId;
    };
    const focusSignal = () => {
      bindToolbar();
      hideTooltips();
      if(state.signalWindow){ bringToFront(state.signalWindow); requestAnimationFrame(() => clampToViewport(state.signalWindow)); }
    };

    return {update,bindToolbar,openSignal,openPosition,closePosition,focusSignal,recoverWindows,setSignalHorizon,getSignalCopy:() => state.signalCopy,getPositionCopy:() => state.positionCopy,destroy};
  };
})();
