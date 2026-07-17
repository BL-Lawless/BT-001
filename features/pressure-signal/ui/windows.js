(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};

  build.createWindowSystem = function createWindowSystem(config,format){
    const state = {
      signalReport:null,management:null,managementDataStatus:null,snapshot:null,signalCopy:"",positionCopy:"",
      signalHorizonId:null,
      signalWindow:null,positionWindow:null,positionBody:null,positionTitle:null,
      signalTooltip:"",positionTooltip:"",signalTip:null,positionTip:null,
      overlay:null,activeWindow:null,signalBound:false,positionBound:false,viewportBound:false,
      signalTooltipBound:false,positionTooltipBound:false,tooltipScrollBound:false,tooltipGeometryBound:false,tooltipLayoutFrame:null,
      tooltipHover:{
        signal:{buttonHovered:false,tooltipHovered:false,bridgeTimer:null},
        position:{buttonHovered:false,tooltipHovered:false,bridgeTimer:null}
      },
      geometry:new WeakMap(),resizeObservers:[],mutationObservers:[],listeners:[]
      ,updating:false,refreshState:"IDLE",refreshMessage:"",contextKey:null
    };
    const TOOLTIP_BRIDGE_DELAY = 110;
    const TOOLTIP_VERTICAL_GAP = 3;
    const TOOLTIP_VIEWPORT_MARGIN = 4;
    const TOOLTIP_BOTTOM_SAFETY = 10;
    const TOOLTIP_COLUMN_GAP = 12;
    const TOOLTIP_PREFERRED_COLUMN_WIDTH = 338;
    const TOOLTIP_MIN_COLUMN_WIDTH = 240;

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

    function tooltipContentBlocks(text){
      const lines=String(text || "").split("\n");
      const specs=[];
      const isHeading=line => /^[A-Z][A-Z0-9 /&()\-\u2013]{2,}$/.test(String(line || "").trim()) && !String(line || "").includes(":");
      for(let index=0;index<lines.length;index+=1){
        const line=lines[index];
        if(!line.trim()){
          if(specs.length) specs[specs.length-1].blankAfter=(specs[specs.length-1].blankAfter || 0)+1;
          continue;
        }
        const grouped=[line];
        if(isHeading(line) && index+1<lines.length && lines[index+1].trim()) grouped.push(lines[++index]);
        specs.push({lines:grouped,blankAfter:0});
      }
      return specs.map(spec => {
        const block=document.createElement("div");
        block.className="pressure-tooltip-block";
        spec.lines.forEach(line => {
          const row=document.createElement("div");
          row.className="pressure-tooltip-line";
          row.appendChild(format.priceTokens(line));
          block.appendChild(row);
        });
        if(spec.blankAfter) block.style.paddingBottom=`${spec.blankAfter*1.45}em`;
        return block;
      });
    }

    function linearTooltipPartitions(heights,columnCount){
      const count=heights.length;
      const columns=Math.max(1,Math.min(Number(columnCount) || 1,count || 1));
      if(!count) return {groups:[],maxHeight:0,columnHeights:[]};
      const prefix=[0];
      heights.forEach(height => prefix.push(prefix[prefix.length-1]+height));
      const dp=Array.from({length:columns+1},()=>Array(count+1).fill(Infinity));
      const cuts=Array.from({length:columns+1},()=>Array(count+1).fill(0));
      dp[0][0]=0;
      for(let k=1;k<=columns;k+=1){
        for(let i=k;i<=count;i+=1){
          for(let j=k-1;j<i;j+=1){
            const candidate=Math.max(dp[k-1][j],prefix[i]-prefix[j]);
            if(candidate<dp[k][i]){ dp[k][i]=candidate;cuts[k][i]=j; }
          }
        }
      }
      const ranges=[];
      let end=count;
      for(let k=columns;k>0;k-=1){
        const start=cuts[k][end];
        ranges.unshift([start,end]);
        end=start;
      }
      const columnHeights=ranges.map(([start,finish])=>prefix[finish]-prefix[start]);
      return {groups:ranges,maxHeight:Math.max(...columnHeights,0),columnHeights};
    }

    function tooltipViewport(){
      return {width:Math.max(1,window.innerWidth),height:Math.max(1,window.innerHeight)};
    }

    function layoutToolbarTooltip(kind){
      const control=toolbarControl(kind);
      const tip=kind==="signal" ? state.signalTip : state.positionTip;
      const flow=tip && tip.querySelector(".pressure-tooltip-flow");
      if(!tip || !flow || !tip.classList.contains("is-open")) return;
      if(!toolbarControlAvailable(control)){ hideToolbarTooltip(kind);return; }
      const controlRect=control.getBoundingClientRect();
      const viewport=tooltipViewport();
      const priorScrollTop=tip.scrollTop;
      const top=controlRect.bottom+TOOLTIP_VERTICAL_GAP;
      const availableHeight=Math.max(1,viewport.height-top-TOOLTIP_BOTTOM_SAFETY);
      const usableWidth=Math.max(1,viewport.width-TOOLTIP_VIEWPORT_MARGIN*2);
      const blocks=Array.from(flow.querySelectorAll(".pressure-tooltip-block"));
      if(!blocks.length) return;

      tip.classList.add("is-measuring");
      tip.style.top=`${top}px`;
      tip.style.left=`${TOOLTIP_VIEWPORT_MARGIN}px`;
      tip.style.width="max-content";
      tip.style.maxWidth="360px";
      tip.style.maxHeight="none";
      tip.style.overflowY="hidden";
      flow.className="pressure-tooltip-flow";
      flow.style.display="block";
      flow.style.width="max-content";
      flow.style.gridTemplateColumns="";
      flow.style.columnGap="";
      flow.replaceChildren(...blocks);
      const computed=getComputedStyle(tip);
      const chromeX=Number.parseFloat(computed.paddingLeft)+Number.parseFloat(computed.paddingRight)+Number.parseFloat(computed.borderLeftWidth)+Number.parseFloat(computed.borderRightWidth);
      const chromeY=Number.parseFloat(computed.paddingTop)+Number.parseFloat(computed.paddingBottom)+Number.parseFloat(computed.borderTopWidth)+Number.parseFloat(computed.borderBottomWidth);
      const naturalOuter=Math.min(360,Math.max(chromeX+1,tip.getBoundingClientRect().width));
      const preferredColumnWidth=Math.min(TOOLTIP_PREFERRED_COLUMN_WIDTH,Math.max(180,naturalOuter-chromeX));
      const contentCapacity=Math.max(8,availableHeight-chromeY);
      const maxColumns=Math.max(1,Math.min(blocks.length,Math.floor((usableWidth-chromeX+TOOLTIP_COLUMN_GAP)/(TOOLTIP_MIN_COLUMN_WIDTH+TOOLTIP_COLUMN_GAP)) || 1));
      let chosen=null;
      let fallback=null;

      for(let columns=1;columns<=maxColumns;columns+=1){
        const perColumn=Math.max(1,Math.floor((usableWidth-chromeX-TOOLTIP_COLUMN_GAP*(columns-1))/columns));
        const columnWidth=Math.min(preferredColumnWidth,perColumn);
        if(columns>1 && columnWidth<TOOLTIP_MIN_COLUMN_WIDTH) continue;
        tip.style.width=`${Math.min(usableWidth,chromeX+columnWidth*columns+TOOLTIP_COLUMN_GAP*(columns-1))}px`;
        tip.style.maxWidth="none";
        flow.style.width=`${columnWidth}px`;
        blocks.forEach(block => { block.style.width=`${columnWidth}px`; });
        const heights=blocks.map(block => block.getBoundingClientRect().height);
        const partition=linearTooltipPartitions(heights,columns);
        const candidate={columns,columnWidth,partition,heights,outerWidth:Math.min(usableWidth,chromeX+columnWidth*columns+TOOLTIP_COLUMN_GAP*(columns-1))};
        fallback=candidate;
        if(partition.maxHeight<=contentCapacity+0.5){ chosen=candidate;break; }
      }
      chosen ||= fallback;
      if(!chosen) return;
      const scrolling=chosen.partition.maxHeight>contentCapacity+0.5;
      const columns=chosen.partition.groups.map(([start,end],index) => {
        const column=document.createElement("div");
        column.className="pressure-tooltip-column";
        column.dataset.column=String(index+1);
        blocks.slice(start,end).forEach(block => { block.style.width="";column.appendChild(block); });
        return column;
      });
      flow.replaceChildren(...columns);
      flow.className=`pressure-tooltip-flow${chosen.columns>1 ? " is-multicolumn" : ""}`;
      flow.style.display="grid";
      flow.style.width="100%";
      flow.style.gridTemplateColumns=`repeat(${chosen.columns},minmax(0,1fr))`;
      flow.style.columnGap=`${TOOLTIP_COLUMN_GAP}px`;
      tip.style.width=`${chosen.outerWidth}px`;
      tip.style.maxWidth="none";
      tip.style.maxHeight=`${availableHeight}px`;
      tip.style.overflowY=scrolling ? "auto" : "hidden";
      tip.dataset.columns=String(chosen.columns);
      tip.dataset.maxColumns=String(maxColumns);
      tip.dataset.scrolling=scrolling ? "true" : "false";
      tip.dataset.availableHeight=String(availableHeight);
      tip.dataset.columnHeights=chosen.partition.columnHeights.map(value=>Math.round(value*10)/10).join(",");

      const width=tip.getBoundingClientRect().width;
      const viewportLeft=TOOLTIP_VIEWPORT_MARGIN;
      const viewportRight=viewport.width-TOOLTIP_VIEWPORT_MARGIN;
      const rightSpace=viewportRight-controlRect.left;
      const leftSpace=controlRect.right-viewportLeft;
      let left;
      if(width<=rightSpace) left=controlRect.left;
      else if(width<=leftSpace) left=controlRect.right-width;
      else left=rightSpace>=leftSpace ? controlRect.left : controlRect.right-width;
      left=Math.max(viewportLeft,Math.min(viewportRight-width,left));
      tip.style.left=`${left}px`;
      tip.classList.remove("is-measuring");
      if(scrolling) tip.scrollTop=Math.min(priorScrollTop,Math.max(0,tip.scrollHeight-tip.clientHeight));
    }

    function createToolbarTooltip(id,label){
      const tip = document.createElement("div");
      tip.id = id;
      tip.className = "pressure-toolbar-tooltip";
      tip.setAttribute("role","tooltip");
      tip.setAttribute("aria-label",label);
      tip.setAttribute("aria-hidden","true");
      const flow = document.createElement("div");
      flow.className="pressure-tooltip-flow";
      tip.appendChild(flow);
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
      listen(tip,"wheel",event => event.stopPropagation(),{passive:true});
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
      const flow = tip && tip.querySelector(".pressure-tooltip-flow");
      if(flow) flow.replaceChildren(...tooltipContentBlocks(content || ""));
      if(tip && tip.classList.contains("is-open")) positionToolbarTooltip(kind);
    }
    function positionToolbarTooltip(kind){
      layoutToolbarTooltip(kind);
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
    function scheduleTooltipRelayout(){
      if(state.tooltipLayoutFrame != null) return;
      state.tooltipLayoutFrame=requestAnimationFrame(() => {
        state.tooltipLayoutFrame=null;
        repositionOpenTooltips();
      });
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
    function profileSourceText(management){
      const source = String(management && management.profileSource || "").toLowerCase();
      if(source === "user-selected") return "User selected";
      if(source === "default") return "Default";
      return management && management.horizonLabel ? "Default" : "Unavailable";
    }
    const displayTimeframe = value => String(value || "-") === "1d" ? "1D" : String(value || "-");
    const ageText = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value)/1000)}s ago` : "Unavailable";
    const closedEvidenceText = evidence => evidence && evidence.tf ? `Latest closed ${displayTimeframe(evidence.tf)} candle` : "Unavailable";
    function keyDefenceText(anchor){
      if(!anchor || anchor.level == null) return "Unavailable";
      const sourceLabel = anchor.defenceType
        ? `${anchor.tf || ""} ${anchor.defenceType}`
        : anchor.label || `${anchor.tf || ""} level`;
      const rawLabel = sourceLabel
        .replace(/\b(?:User-selected|Inferred|Recorded)\s+/gi,"")
        .replace(/\s*\([^)]*\)\s*$/g,"")
        .replace(/\s+/g," ")
        .trim();
      const userSelected = anchor.userSelected === true || String(anchor.selectionSource || "").toLowerCase() === "user-selected";
      return `${rawLabel || "Level"} at ${format.price(anchor.level)} \u00b7 ${userSelected ? "User selected" : "System selected"}`;
    }
    function exitWarningText(management,dataStatus){
      if(!management || management.sufficient !== true || (dataStatus && dataStatus !== "sufficient") || !management.position || !management.anchor) return "Unavailable";
      const pathA = management.pathA && management.pathA.state;
      const pathB = management.pathB && management.pathB.state;
      if(!pathA || !pathB) return "Unavailable";
      if(management.activatedPath || pathA === "CONFIRMED" || pathB === "CONFIRMED") return "Confirmed";
      const rank = {DEVELOPING:2,WARNING:1};
      if((rank[pathA] || 0) >= (rank[pathB] || 0) && rank[pathA]) return "Key defence weakening";
      if(rank[pathB]) return "Opposite regime developing";
      if(["CLEAR","CLEARED"].includes(pathA) && ["CLEAR","CLEARED"].includes(pathB)) return "Clear";
      return "Unavailable";
    }
    function positionDataState(management,dataStatus){
      const freshness=management && management.freshness || {};
      const stopFreshness=management && management.stopEvaluation && management.stopEvaluation.freshness || {};
      const stopStatus=String(stopFreshness.stopStatus || freshness.stopStatus || "").toUpperCase();
      const managementStatus=String(freshness.managementStatus || dataStatus || "UNAVAILABLE").toUpperCase();
      return [stopStatus,managementStatus].includes("UNAVAILABLE") ? "UNAVAILABLE"
        : [stopStatus,managementStatus].includes("STALE") ? "STALE"
          : managementStatus==="LIVE" && (!stopStatus || stopStatus==="LIVE") ? "LIVE" : managementStatus;
    }
    function positionStaleSources(management){
      const freshness=management && management.freshness || {};
      const stopFreshness=management && management.stopEvaluation && management.stopEvaluation.freshness || {};
      const combined=[...(freshness.managementStaleSources || []),...(stopFreshness.stopStaleSources || freshness.stopStaleSources || [])];
      return combined.filter((item,index)=>combined.findIndex(candidate=>candidate.source===item.source)===index);
    }
    function stopSummaryLines(management){
      const stop = management && management.stopEvaluation;
      if(!stop) return ["Stop protection: UNAVAILABLE","Stop quality: UNAVAILABLE","Recommendation: UNAVAILABLE \u2014 REQUIRED DATA STALE"];
      const simulation = stop.simulation || {};
      const master = simulation.validMaster || simulation.masters && simulation.masters[0] || null;
      const invalidation = stop.invalidation && stop.invalidation.selected;
      const lines = [
        `Stop protection: ${stop.protection || "UNAVAILABLE"}`,
        `Master SL: ${master && master.triggerPrice != null ? format.price(master.triggerPrice) : "Unavailable"}`,
        `PSL coverage: ${format.quantity(simulation.pslQuantity)} / ${format.quantity(simulation.positionQuantity)} BTC`,
        `Stop quality: ${stop.evaluation || "UNAVAILABLE"}`,
        `Technical invalidation: ${invalidation ? invalidation.low !== invalidation.high ? `${format.price(invalidation.low)}-${format.price(invalidation.high)}` : format.price(invalidation.price) : "Unavailable"}`,
        `Recommendation: ${stop.recommendation && stop.recommendation.value || "UNAVAILABLE \u2014 REQUIRED DATA STALE"}`
      ];
      (stop.freshness && stop.freshness.stopStaleSources || []).slice(0,2).forEach(item => lines.push(`Stale input: ${item.source} \u00b7 ${ageText(item.ageMs)}`));
      return lines;
    }
    function stopDetailLines(management){
      const stop = management && management.stopEvaluation;
      if(!stop) return ["Stop evaluation: UNAVAILABLE","Recommendation: UNAVAILABLE \u2014 REQUIRED DATA STALE"];
      const lossMoney = value => value == null ? "Unavailable" : `$${Math.abs(Number(value)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      const simulation = stop.simulation || {};
      const invalidation = stop.invalidation || {};
      const technical = stop.technical || {};
      const risk = stop.risk || {};
      const liquidation = stop.liquidation || {};
      const lines = [
        `Stop evaluation: ${stop.evaluation || "UNAVAILABLE"}`,
        `Protection: ${stop.protection || "UNAVAILABLE"}`,
        `Stop purpose: ${stop.purpose && stop.purpose.value || "UNKNOWN / UNCLASSIFIED"}`,
        `Stop-purpose basis: ${stop.purpose && stop.purpose.reason || "Unavailable"}`,
        `Original invalidation: ${invalidation.original ? format.price(invalidation.original.price) : "Unavailable"}`,
        `Current structural invalidation: ${invalidation.currentStructural ? `${format.price(invalidation.currentStructural.low)}-${format.price(invalidation.currentStructural.high)}` : "Unavailable"}`,
        `Current execution invalidation: ${invalidation.currentExecution ? format.price(invalidation.currentExecution.price) : "Unavailable"}`,
        `Technical stop: ${technical.available ? format.price(technical.price) : "Unavailable"}`,
        `Volatility buffer: ${technical.available ? `${format.price(technical.buffer)} \u00b7 ${Number(technical.multiplier).toFixed(3)}\u00d7 ATR` : "Unavailable"}`,
        `Stop quality: ${stop.quality && stop.quality.value || "UNAVAILABLE"}`,
        `Stop findings: ${(stop.quality && stop.quality.issues || []).join(" \u00b7 ") || "None"}`,
        `PSL coverage: ${format.quantity(simulation.pslQuantity)} / ${format.quantity(simulation.positionQuantity)} BTC`,
        `Uncovered quantity: ${format.quantity(simulation.uncoveredQuantity)} BTC`,
        `Master SL residual coverage: ${format.quantity(simulation.masterResidual)} BTC`,
        `PSL distribution: ${simulation.distribution || "UNAVAILABLE"}`,
        `Liquidation risk: ${liquidation.value || "UNAVAILABLE"}`,
        `Liquidation price: ${liquidation.available ? format.price(liquidation.price) : "Unavailable"}`,
        `Estimated gross loss: ${lossMoney(risk.grossLoss)}`,
        `Estimated fees: ${lossMoney(risk.fees)}`,
        `Estimated slippage: ${lossMoney(risk.slippage)}`,
        `Estimated total loss: ${lossMoney(risk.totalLoss)}`,
        "Risk limit: Unavailable",
        "Size recommendation: Unavailable",
        `Recommendation: ${stop.recommendation && stop.recommendation.value || "UNAVAILABLE \u2014 REQUIRED DATA STALE"}`,
        `Recommendation reason: ${stop.recommendation && stop.recommendation.reason || "Unavailable"}`
      ];
      (simulation.sequence || []).forEach(stage => lines.push(`${stage.index}. ${stage.kind}: trigger ${format.price(stage.triggerPrice)}; before ${format.quantity(stage.quantityBefore)} BTC; executes ${format.quantity(stage.executedQuantity)} BTC; remaining ${format.quantity(stage.remainingQuantity)} BTC${stage.closePosition ? "; closePosition residual" : ""}${stage.ineffective ? "; ineffective after earlier protection" : ""}`));
      (stop.freshness && stop.freshness.stopStaleSources || []).forEach(item => lines.push(`Stale input: ${item.source} \u00b7 ${ageText(item.ageMs)}`));
      return lines;
    }
    function targetSummaryLines(management){
      const framework=management && management.targetFramework || {};
      const obstacle=framework.obstacle || {},primary=framework.primary || {},extended=framework.extended || {};
      return [
        `Next obstacle: ${obstacle.available ? format.price(obstacle.price) : "Unavailable"}`,
        `Obstacle source: ${obstacle.source || "Unavailable"}`,
        `Obstacle significance: ${obstacle.significance || "UNAVAILABLE"}`,
        `Primary target: ${primary.available ? format.price(primary.price) : "Unavailable"}`,
        `Target source: ${primary.source || "Unavailable"}`,
        `Remaining room: ${primary.available ? `${format.price(primary.remainingDistance)} · ${primary.remainingAtr == null ? "Unavailable" : `${Number(primary.remainingAtr).toFixed(1)}× ${framework.atrTf || "management"} ATR`}` : "Unavailable"}`,
        `Extended target: ${extended.available ? format.price(extended.price) : "Unavailable"}`,
        `Extended source: ${extended.source || "Unavailable"}`
      ];
    }
    function grSummaryLines(management){
      const ladder=management && management.grExitLadder;
      const label=ladder && ladder.source==="BINANCE" ? "Binance exit ladder" : "GR exit ladder";
      if(!ladder || !ladder.available) return [`${label}: UNAVAILABLE`,`Exit ladder source: ${ladder && ladder.source || "UNAVAILABLE"}`];
      return [
        `${label}: ${ladder.overallQuality}`,
        `Exit ladder source: ${ladder.source === "BINANCE" ? "Inferred from live Binance exits" : ladder.source}`,
        `Start: ${format.price(ladder.start)}`,
        `Start quality: ${ladder.startQuality}`,
        `Weighted average: ${format.price(ladder.weightedAverage)}`,
        `Average quality: ${ladder.averageQuality}`,
        `End: ${format.price(ladder.end)}`,
        `End quality: ${ladder.endQuality}`,
        `Distribution: ${ladder.distributionQuality}`
      ];
    }
    function exitPlanDetailLines(management){
      const lines=[...targetSummaryLines(management),"","BINANCE EXIT EVALUATION"];
      const exits=management && management.exitEvaluations || [];
      if(!exits.length) lines.push("Binance exits: Unavailable");
      exits.forEach((order,index) => lines.push(
        `Binance Exit ${index+1}: ${format.price(order.price)}`,
        `Quantity: ${format.quantity(order.quantity)} BTC · ${order.share == null ? "Unavailable" : `${Math.round(order.share*100)}%`}`,
        `Exit quality: ${order.quality}`,
        `Exit reason: ${order.reason}`
      ));
      const ladderTitle=management && management.grExitLadder && management.grExitLadder.source==="BINANCE" ? "BINANCE EXIT LADDER" : "GR EXIT LADDER";
      lines.push("",ladderTitle,...grSummaryLines(management));
      const ladder=management && management.grExitLadder;
      if(ladder && ladder.available){
        lines.push(
          `Before Primary target: ${Math.round((ladder.buckets.beforePrimaryPct || 0)*100)}%`,
          `Near Primary target: ${Math.round((ladder.buckets.nearPrimaryPct || 0)*100)}%`,
          `Toward Extended target: ${Math.round((ladder.buckets.towardExtendedPct || 0)*100)}%`,
          `Beyond Extended target: ${Math.round((ladder.buckets.beyondExtendedPct || 0)*100)}%`,
          `Position coverage: ${Math.round(ladder.coverage*100)}%`,
          `Start reason: ${ladder.reasons.start}`,
          `Average reason: ${ladder.reasons.average}`,
          `End reason: ${ladder.reasons.end}`,
          `Distribution reason: ${ladder.reasons.distribution}`
        );
      }
      return lines;
    }
    function positionTooltipText(management,dataStatus){
      if(!management) return "Action: WAIT\nPosition health: Unavailable\nPrimary reason: Position management is unavailable\nManagement profile: Unavailable\nKey defence: Unavailable\nExit warning: Unavailable";
      const anchor = management.anchor;
      const profile = management.horizonLabel
        ? `${management.horizonLabel} \u00b7 ${profileSourceText(management)}`
        : "Unavailable";
      const volatility = management.volatility || {};
      const lifecycle = management.lifecycle || {};
      const conditions = management.conditions && Array.isArray(management.conditions.items) ? management.conditions.items : [];
      const stall = management.stallReview || {};
      const evidence = management.evidence || {};
      const freshness = management.freshness || {};
      const dataState = positionDataState(management,dataStatus === "sufficient" ? "LIVE" : dataStatus);
      const staleLines = positionStaleSources(management).map(item => `Stale input: ${item.source} \u00b7 ${ageText(item.ageMs)}`);
      return [
        `Action: ${management.presentationAction || management.action || "WAIT"}`,
        `Position health: ${management.health || "Unavailable"}`,
        `Primary reason: ${management.primaryReason || "Unavailable"}`,
        `Management profile: ${profile}`,
        `Key defence: ${keyDefenceText(anchor)}`,
        `Exit warning: ${exitWarningText(management,dataState === "LIVE" ? "sufficient" : "stale")}`,
        ...targetSummaryLines(management),
        ...grSummaryLines(management),
        ...stopSummaryLines(management),
        `Volatility: ${volatility.available ? `${volatility.tf || management.profileHierarchy && management.profileHierarchy.primaryTf || "-"} ${volatility.state} \u00b7 ${Math.round(volatility.percentile)}th percentile \u00b7 Tolerance ${Number(volatility.toleranceMultiplier).toFixed(2)}\u00d7` : "Unavailable"}`,
        `Context volatility: ${volatility.available ? `${volatility.contextTf} ${volatility.contextState}` : "Unavailable"}`,
        `Lifecycle: ${lifecycle.state || "Unavailable"}`,
        `Current conditions: ${conditions.join(" \u00b7 ") || "None"}`,
        `Stall Review: ${stall.state || "Unavailable"}`,
        `Confirmation: ${evidence.confirmation || "Unavailable"}`,
        `Support: ${(evidence.supporting || []).join(" / ") || "None"}`,
        `Conflict: ${(evidence.conflicting || []).join(" / ") || "None"}`,
        `Data status: ${dataState}`,
        `Price/position: ${ageText(Math.max(Number(freshness.priceAgeMs || 0),Number(freshness.positionAgeMs || 0)))}`,
        `Management evidence: ${closedEvidenceText(freshness.managementClosed)}`,
        `Context evidence: ${closedEvidenceText(freshness.contextClosed)}`,
        ...(dataState === "LIVE" ? [] : staleLines),
        ...(management.actionAvailable === false ? ["Action status: Unavailable pending refresh"] : [])
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
      if(!state.tooltipGeometryBound){
        state.tooltipGeometryBound=true;
        if(typeof ResizeObserver==="function"){
          const observer=new ResizeObserver(scheduleTooltipRelayout);
          [signalIndicator,indicator].filter(Boolean).forEach(control => observer.observe(control));
          state.resizeObservers.push(observer);
        }
        if(window.visualViewport){
          listen(window.visualViewport,"resize",scheduleTooltipRelayout,{passive:true});
          listen(window.visualViewport,"scroll",scheduleTooltipRelayout,{passive:true});
        }
        if(document.fonts){
          Promise.resolve(document.fonts.ready).then(scheduleTooltipRelayout).catch(()=>{});
          listen(document.fonts,"loadingdone",scheduleTooltipRelayout);
        }
      }
      if(!state.tooltipScrollBound){
        state.tooltipScrollBound = true;
        listen(document,"scroll",event => {
          const target=event.target;
          if([state.signalTip,state.positionTip].some(tip => tip && (target===tip || tip.contains(target)))) return;
          hideTooltips();
        },{capture:true,passive:true});
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
            scheduleTooltipRelayout();
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
      const volatility = management.volatility || {};
      const lifecycle = management.lifecycle || {};
      const conditions = management.conditions && Array.isArray(management.conditions.items) ? management.conditions.items : [];
      const stall = management.stallReview || {};
      const evidence = management.evidence || {};
      const freshness = management.freshness || {};
      const hierarchy = management.profileHierarchy || {};
      const levelMap = management.levelMap || {levels:[],zones:[]};
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
        `Management profile: ${management.horizonLabel} \u00b7 ${profileSourceText(management)}`,
        `Profile timeframes: warning ${displayTimeframe(hierarchy.earlyWarningTf)} \u00b7 trigger ${displayTimeframe(hierarchy.triggerTf)} \u00b7 primary ${displayTimeframe(hierarchy.primaryTf)} \u00b7 context ${displayTimeframe(hierarchy.contextTf)} \u00b7 boundary ${displayTimeframe(hierarchy.boundaryTf)}`,
        `Key defence: ${keyDefenceText(management.anchor)}`,
        `Key defence zone: ${management.anchor.zone ? `${format.price(management.anchor.zone.low)}-${format.price(management.anchor.zone.high)}` : "Unavailable"}`,
        `Original invalidation: ${management.originalInvalidation ? `${management.originalInvalidation.tf} at ${format.price(management.originalInvalidation.level)}` : "Unavailable"}`,
        ...targetSummaryLines(management),
        ...grSummaryLines(management),
        ...stopSummaryLines(management),
        `Key defence migration: ${management.defenceMigration ? management.defenceMigration.basis : "No confirmed migration"}`,
        `Volatility: ${volatility.available ? `${volatility.tf || hierarchy.primaryTf || "-"} ${volatility.state} \u00b7 ${Math.round(volatility.percentile)}th percentile \u00b7 Tolerance ${Number(volatility.toleranceMultiplier).toFixed(2)}\u00d7` : "Unavailable"}`,
        `Context volatility: ${volatility.available ? `${volatility.contextTf} ${volatility.contextState}` : "Unavailable"}`,
        `Lifecycle: ${lifecycle.state || "Unavailable"}`,
        `Lifecycle basis: ${lifecycle.basis || "Unavailable"}`,
        `Current conditions: ${conditions.join(" \u00b7 ") || "None"}`,
        `Stall Review: ${stall.state || "Unavailable"}`,
        `Position health: ${management.health}`,
        `Action: ${management.presentationAction || management.action}`,
        `Primary reason: ${management.primaryReason}`,
        `Confirmation: ${evidence.confirmation || "Unavailable"}`,
        `Support: ${(evidence.supporting || []).join(" / ") || "None"}`,
        `Conflict: ${(evidence.conflicting || []).join(" / ") || "None"}`,
        `Forming warning: ${(evidence.formingWarnings || []).join(" / ") || "None"}`,
        `Data status: ${positionDataState(management)}`,
        `Price/position: ${ageText(Math.max(Number(freshness.priceAgeMs || 0),Number(freshness.positionAgeMs || 0)))}`,
        `Management evidence: ${closedEvidenceText(freshness.managementClosed)}`,
        `Context evidence: ${closedEvidenceText(freshness.contextClosed)}`,
        ...positionStaleSources(management).map(item => `Stale input: ${item.source} \u00b7 ${ageText(item.ageMs)}`),
        ...(management.actionAvailable === false ? ["Action status: Unavailable pending refresh"] : []),
        `Path B - Opposite regime: ${management.pathB.state}`,
        `Path A - Anchor invalidation: ${management.pathA.state}`,
        management.activatedPath ? `Exit activated: ${management.activatedPath}` : "Exit activated: No"
      ].join("\n");
      const levelLines = (levelMap.levels || []).map(level => `${level.source}: ${format.price(level.low)}-${format.price(level.high)}; reference ${format.price(level.reference)}; ${level.roles.join(" / ")}; ${level.interactionState || "not active"}; approach ${level.approachQuality || "unavailable"}; ${level.relevance}; ${level.mergedZoneId || "unmerged"}`);
      const zoneLines = (levelMap.zones || []).map(zone => `${zone.id}: ${format.price(zone.low)}-${format.price(zone.high)}; reference ${format.price(zone.reference)}; ${zone.independentFamilyCount} independent families (${zone.evidenceFamilies.join(", ")}); ${zone.interactionState || "not active"}`);
      return {
        summary,
        analysis:["TARGET AND EXIT FRAMEWORK",...exitPlanDetailLines(management),"","STOP EVALUATION",...stopDetailLines(management),"",...(management.analysis || []),"Management level map:",...(levelLines.length ? levelLines : ["Unavailable"]),"Confluence zones:",...(zoneLines.length ? zoneLines : ["Unavailable"])].join("\n"),
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
      if(Object.prototype.hasOwnProperty.call(payload,"managementDataStatus")) state.managementDataStatus = payload.managementDataStatus;
      state.snapshot = payload.snapshot || state.snapshot;
      setSignalHorizon(payload.signalHorizonId || state.signalHorizonId);
      state.signalTooltip = payload.signalTooltip || state.signalTooltip;
      state.positionTooltip = positionTooltipText(state.management,state.managementDataStatus);
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

    function updatingElements(){
      return [document.getElementById("pressureSignalToolbar"),state.signalWindow,state.positionWindow,state.signalTip,state.positionTip].filter(Boolean);
    }
    function setUpdatingVisual(){
      state.updating=false;
      updatingElements().forEach(element => element.classList.remove("is-updating"));
      [state.signalWindow,state.positionWindow].filter(Boolean).forEach(win => {
        const indicator=win.querySelector(".pressure-updating-indicator");
        if(indicator) indicator.remove();
      });
      if(state.signalTooltip) renderToolbarTooltip("signal");
      if(state.positionTooltip) renderToolbarTooltip("position");
    }
    function beginUpdate(contextKey){
      bindToolbar();
      const compatible=!!contextKey && !!state.contextKey && contextKey===state.contextKey && !!state.signalReport;
      if(!compatible){ invalidateContext(contextKey); return false; }
      return true;
    }
    function completeUpdate(contextKey){
      if(contextKey) state.contextKey=contextKey;
      setUpdatingVisual(false);
    }
    function setRefreshState(next,contextKey,message=""){
      const normalized=["IDLE","REFRESHING","READY","STALE","UNAVAILABLE","ERROR"].includes(next) ? next : "ERROR";
      if(contextKey) state.contextKey=contextKey;
      state.refreshState=normalized;
      state.refreshMessage=message || "";
      setUpdatingVisual(false);
    }
    function invalidateContext(nextContextKey=null){
      setUpdatingVisual(false);
      state.refreshState="UNAVAILABLE";state.refreshMessage="";
      state.contextKey=nextContextKey;
      state.signalReport=null;state.management=null;state.snapshot=null;state.signalCopy="";state.positionCopy="";
      state.signalTooltip="Direction: NO BIAS\nState: NO SETUP\nEntry: Unavailable\nData status: UNAVAILABLE";
      state.positionTooltip="Action: WAIT\nPosition health: Unavailable\nExit warning: Unavailable\nData status: UNAVAILABLE";
      if(state.signalWindow){
        state.signalWindow.querySelectorAll("pre").forEach(pre => { pre.textContent="Unavailable"; });
      }
      if(state.positionBody) state.positionBody.replaceChildren();
      renderToolbarTooltip("signal");renderToolbarTooltip("position");
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
      state.tooltipGeometryBound = false;
      if(state.tooltipLayoutFrame != null){ cancelAnimationFrame(state.tooltipLayoutFrame);state.tooltipLayoutFrame=null; }
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

    function runPresentationSelfTests(){
      const base = {
        sufficient:true,position:{side:"LONG"},horizonLabel:"Quick",profileSource:"default",
        action:"HOLD",health:"HEALTHY",primaryReason:"Healthy",
        anchor:{tf:"5m",defenceType:"structure",label:"User-selected 5m structure",level:64913,source:"user-selected",selectionSource:"system-selected"},
        pathA:{state:"CLEAR"},pathB:{state:"CLEAR"},activatedPath:null
      };
      const defaultText = positionTooltipText(base,"sufficient");
      const selectedText = positionTooltipText({...base,profileSource:"user-selected"},"sufficient");
      const explicitDefence = positionTooltipText({...base,anchor:{...base.anchor,selectionSource:"user-selected"}},"sufficient");
      const pathAText = positionTooltipText({...base,pathA:{state:"WARNING"}},"sufficient");
      const pathBText = positionTooltipText({...base,pathB:{state:"DEVELOPING"}},"sufficient");
      const confirmedText = positionTooltipText({...base,pathA:{state:"CONFIRMED"}},"sufficient");
      const staleText = positionTooltipText(base,"stale");
      const sourceStaleText = positionTooltipText({...base,action:"CLOSE",presentationAction:"Unavailable pending refresh",actionAvailable:false,freshness:{managementStatus:"STALE",priceAgeMs:2000,positionAgeMs:171000,managementStaleSources:[{source:"Position pressure",ageMs:171000}],managementClosed:{tf:"5m"},contextClosed:{tf:"15m"}}},"sufficient");
      const refined={...base,targetFramework:{atrTf:"5m",obstacle:{available:true,price:64180,source:"15m local structure",significance:"MODERATE"},primary:{available:true,price:63720,source:"1h swing support",remainingDistance:375,remainingAtr:1.6},extended:{available:true,price:63250,source:"4h support zone"}},exitEvaluations:[{price:64150,quantity:.003,share:.12,quality:"CONSERVATIVE",reason:"Small partial near obstacle"}],grExitLadder:{available:true,source:"AUTHORITATIVE",overallQuality:"CONSERVATIVE",start:64150,startQuality:"TOO EARLY",weightedAverage:63760,averageQuality:"WELL PLACED",end:63180,endQuality:"AGGRESSIVE",distributionQuality:"BALANCED",coverage:1,buckets:{beforePrimaryPct:.25,nearPrimaryPct:.5,towardExtendedPct:.25,beyondExtendedPct:0},reasons:{start:"Start reason",average:"Average reason",end:"End reason",distribution:"Distribution reason"}}};
      const refinedTooltip=positionTooltipText(refined,"sufficient");
      const refinedReport=positionReport(refined,{symbol:"BTCUSDT",createdAt:Date.now()});
      const formattingProbe = document.createElement("pre");
      const plainFormattingText = ["Entry: 64250.49","Key defence zone: 64880.2-64940.4","Primary target: 63720.2","Weighted average: 63760.4","Action: HOLD","Setup quality: A","Recommendation: KEEP CURRENT STOP","Obstacle significance: MODERATE","Exit quality: CONSERVATIVE","GR exit ladder: WELL PLACED"].join("\n");
      renderPriceText(formattingProbe,plainFormattingText);
      const strongValues = Array.from(formattingProbe.querySelectorAll("strong")).map(node => node.textContent);
      renderPriceText(formattingProbe,plainFormattingText);
      const refreshedStrongValues = Array.from(formattingProbe.querySelectorAll("strong")).map(node => node.textContent);
      const balancedProbe=linearTooltipPartitions([60,10,10,60],2);
      const headingProbe=tooltipContentBlocks("SECTION\nRelated row\nNext row");
      const cases = {
        defaultProfile:defaultText.includes("Management profile: Quick \u00b7 Default"),
        userSelectedProfile:selectedText.includes("Management profile: Quick \u00b7 User selected"),
        systemSelectedDefence:defaultText.includes("Key defence: 5m structure at") && defaultText.includes("\u00b7 System selected"),
        explicitUserDefence:explicitDefence.includes("\u00b7 User selected"),
        clearWarning:defaultText.includes("Exit warning: Clear"),
        keyDefenceWeakening:pathAText.includes("Exit warning: Key defence weakening"),
        oppositeRegimeDeveloping:pathBText.includes("Exit warning: Opposite regime developing"),
        confirmedWarning:confirmedText.includes("Exit warning: Confirmed"),
        staleUnavailable:staleText.includes("Exit warning: Unavailable"),
        sourceAwareFreshness:sourceStaleText.includes("Data status: STALE") && sourceStaleText.includes("Stale input: Position pressure \u00b7 171s ago") && sourceStaleText.includes("Action status: Unavailable pending refresh") && !sourceStaleText.includes(["Data","age:"].join(" ")),
        positionConsumesTargetHierarchy:refinedTooltip.includes("Next obstacle: 64,180") && refinedTooltip.includes("Primary target: 63,720") && refinedTooltip.includes("Extended target: 63,250"),
        positionConsumesGrLadder:refinedTooltip.includes("GR exit ladder: CONSERVATIVE") && refinedTooltip.includes("Weighted average: 63,760") && refinedReport.analysis.includes("Before Primary target: 25%") && refinedReport.analysis.includes("Exit quality: CONSERVATIVE"),
        pricesAndRangesFormattedBold:strongValues.includes("64,250") && strongValues.includes("64,880\u201364,940"),
        calculatedValuesBoldLabelsNormal:strongValues.includes("HOLD") && strongValues.includes("A") && strongValues.includes("KEEP CURRENT STOP") && strongValues.includes("MODERATE") && strongValues.includes("CONSERVATIVE") && strongValues.includes("WELL PLACED") && !strongValues.some(value => /Action:|Setup quality:|Recommendation:/.test(value)),
        targetAndWeightedPricesFormatted:strongValues.includes("63,720") && strongValues.includes("63,760"),
        formattingSurvivesRefresh:JSON.stringify(strongValues) === JSON.stringify(refreshedStrongValues),
        tooltipColumnsPreserveOrder:JSON.stringify(balancedProbe.groups) === JSON.stringify([[0,2],[2,4]]),
        tooltipColumnsBalanceMeasuredBlocks:balancedProbe.maxHeight===70 && balancedProbe.columnHeights.every(height => height===70),
        tooltipHeadingKeptWithContent:headingProbe.length===2 && headingProbe[0].querySelectorAll(".pressure-tooltip-line").length===2,
        plainCopyContainsNoMarkup:!/[<>]|\*\*/.test(plainFormattingText),
        noLegacyExitMonitor:![defaultText,selectedText,pathAText,pathBText,confirmedText,staleText].some(text => text.includes("Exit monitor:") || text.includes("Exit monitor: None"))
      };
      return {passed:Object.values(cases).every(Boolean),cases,formatting:{strongValues,refreshedStrongValues}};
    }

    const tooltipDiagnostics=tip => {
      if(!tip) return null;
      const rect=tip.getBoundingClientRect();
      return {open:tip.classList.contains("is-open"),ariaHidden:tip.getAttribute("aria-hidden"),columns:Number(tip.dataset.columns || 0),maxColumns:Number(tip.dataset.maxColumns || 0),scrolling:tip.dataset.scrolling==="true",availableHeight:Number(tip.dataset.availableHeight || 0),columnHeights:String(tip.dataset.columnHeights || "").split(",").filter(Boolean).map(Number),rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height},scrollHeight:tip.scrollHeight,clientHeight:tip.clientHeight};
    };
    return {update,beginUpdate,completeUpdate,setRefreshState,invalidateContext,bindToolbar,openSignal,openPosition,closePosition,focusSignal,recoverWindows,setSignalHorizon,getSignalCopy:() => state.signalCopy,getPositionCopy:() => state.positionCopy,destroy,_selfTest:runPresentationSelfTests,_diagnostics:() => ({updating:state.updating,refreshState:state.refreshState,refreshMessage:state.refreshMessage,contextKey:state.contextKey,hasSignal:!!state.signalReport,hasManagement:!!state.management,tooltips:{signal:tooltipDiagnostics(state.signalTip),position:tooltipDiagnostics(state.positionTip)}})};
  };
})();
