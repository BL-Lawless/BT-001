(() => {
  "use strict";

  const registry = new Set();
  let zIndex = 10020;

  function readState(key){
    if(!key) return null;
    try{ return JSON.parse(localStorage.getItem(key) || "null"); }catch(_e){ return null; }
  }

  function saveState(key,value){
    if(!key) return;
    try{ localStorage.setItem(key,JSON.stringify(value)); }catch(_e){}
  }

  function finite(value,fallback){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function install(element,options={}){
    if(!element) return null;
    if(element.__bt001FloatingWindow) return element.__bt001FloatingWindow;

    const header = options.header || element.querySelector("[data-floating-window-header]");
    const storageKey = String(options.storageKey || "");
    const minWidth = Math.max(1,finite(options.minWidth,300));
    const minHeight = Math.max(1,finite(options.minHeight,200));
    const defaultWidth = Math.max(minWidth,finite(options.defaultWidth,minWidth));
    const defaultHeight = Math.max(minHeight,finite(options.defaultHeight,minHeight));
    const viewportMargin = Math.max(0,finite(options.viewportMargin,6));
    let drag = null;
    let resize = null;

    element.dataset.floatingWindow = "true";
    registry.add(element);

    const bringToFront = () => {
      zIndex += 1;
      element.style.zIndex = String(zIndex);
      registry.forEach(candidate => candidate.classList.toggle("is-window-active",candidate === element));
    };

    const clampToViewport = () => {
      if(!element.isConnected || element.classList.contains("hidden")) return;
      const rect = element.getBoundingClientRect();
      if(!(rect.width > 0) || !(rect.height > 0)) return;
      const accessibleWidth = Math.min(160,Math.max(80,rect.width * 0.3));
      const headerHeight = Math.max(32,header && header.getBoundingClientRect().height || 0);
      const minLeft = Math.min(viewportMargin,accessibleWidth - rect.width);
      const maxLeft = Math.max(minLeft,window.innerWidth - accessibleWidth);
      const maxTop = Math.max(viewportMargin,window.innerHeight - headerHeight);
      element.style.left = Math.round(Math.max(minLeft,Math.min(maxLeft,rect.left))) + "px";
      element.style.top = Math.round(Math.max(viewportMargin,Math.min(maxTop,rect.top))) + "px";
    };

    const geometry = () => {
      const rect = element.getBoundingClientRect();
      return {
        left:Math.round(rect.left),
        top:Math.round(rect.top),
        width:Math.round(Math.max(minWidth,rect.width)),
        height:Math.round(Math.max(minHeight,rect.height))
      };
    };

    const persist = () => saveState(storageKey,geometry());

    const applyGeometry = value => {
      const width = Math.max(minWidth,finite(value && value.width,defaultWidth));
      const height = Math.max(minHeight,finite(value && value.height,defaultHeight));
      const defaultLeft = Math.max(viewportMargin,(window.innerWidth - width) / 2);
      const defaultTop = Math.max(viewportMargin,(window.innerHeight - height) / 2);
      Object.assign(element.style,{
        left:Math.round(finite(value && value.left,defaultLeft)) + "px",
        top:Math.round(finite(value && value.top,defaultTop)) + "px",
        width:Math.round(width) + "px",
        height:Math.round(height) + "px"
      });
    };

    element.addEventListener("pointerdown",bringToFront,true);
    if(header){
      header.addEventListener("pointerdown",event => {
        if(event.target.closest("button,input,select,textarea,a")) return;
        const rect = element.getBoundingClientRect();
        drag = {x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
        bringToFront();
        element.classList.add("is-dragging");
        try{ header.setPointerCapture(event.pointerId); }catch(_e){}
        event.preventDefault();
      });
      header.addEventListener("pointermove",event => {
        if(!drag) return;
        element.style.left = Math.round(drag.left + event.clientX - drag.x) + "px";
        element.style.top = Math.round(drag.top + event.clientY - drag.y) + "px";
        clampToViewport();
      });
      const endDrag = event => {
        if(!drag) return;
        drag = null;
        element.classList.remove("is-dragging");
        try{ header.releasePointerCapture(event.pointerId); }catch(_e){}
        persist();
      };
      header.addEventListener("pointerup",endDrag);
      header.addEventListener("pointercancel",endDrag);
    }

    ["n","ne","e","se","s","sw","w","nw"].forEach(edge => {
      let handle = element.querySelector(`[data-floating-resize="${edge}"]`);
      if(!handle){
        handle = document.createElement("div");
        handle.className = `calc-module-resize calc-module-resize-${edge}`;
        handle.dataset.floatingResize = edge;
        handle.setAttribute("aria-hidden","true");
        element.appendChild(handle);
      }
      handle.addEventListener("pointerdown",event => {
        const rect = element.getBoundingClientRect();
        resize = {edge,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom};
        bringToFront();
        element.classList.add("is-resizing");
        try{ handle.setPointerCapture(event.pointerId); }catch(_e){}
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener("pointermove",event => {
        if(!resize || resize.edge !== edge) return;
        const dx = event.clientX - resize.x;
        const dy = event.clientY - resize.y;
        let left = resize.left;
        let top = resize.top;
        let right = resize.right;
        let bottom = resize.bottom;
        if(edge.includes("w")) left = Math.min(resize.right - minWidth,resize.left + dx);
        if(edge.includes("e")) right = Math.max(resize.left + minWidth,resize.right + dx);
        if(edge.includes("n")) top = Math.min(resize.bottom - minHeight,resize.top + dy);
        if(edge.includes("s")) bottom = Math.max(resize.top + minHeight,resize.bottom + dy);
        left = Math.max(viewportMargin,left);
        top = Math.max(viewportMargin,top);
        right = Math.min(window.innerWidth - viewportMargin,right);
        bottom = Math.min(window.innerHeight - viewportMargin,bottom);
        if(right - left < minWidth){
          if(edge.includes("w")) left = right - minWidth;
          else right = left + minWidth;
        }
        if(bottom - top < minHeight){
          if(edge.includes("n")) top = bottom - minHeight;
          else bottom = top + minHeight;
        }
        Object.assign(element.style,{
          left:Math.round(left) + "px",
          top:Math.round(top) + "px",
          width:Math.round(right - left) + "px",
          height:Math.round(bottom - top) + "px"
        });
        event.preventDefault();
        event.stopPropagation();
      });
      const endResize = event => {
        if(!resize || resize.edge !== edge) return;
        resize = null;
        element.classList.remove("is-resizing");
        try{ handle.releasePointerCapture(event.pointerId); }catch(_e){}
        clampToViewport();
        persist();
        event.stopPropagation();
      };
      handle.addEventListener("pointerup",endResize);
      handle.addEventListener("pointercancel",endResize);
    });

    const onViewportResize = () => {
      clampToViewport();
      if(!element.classList.contains("hidden")) persist();
    };
    window.addEventListener("resize",onViewportResize,{passive:true});

    const stored = readState(storageKey);
    let hasOpened = false;
    applyGeometry(stored);

    const api = {
      bringToFront,
      clampToViewport,
      persist,
      show(){
        if(!hasOpened && !stored) applyGeometry(null);
        hasOpened = true;
        element.classList.remove("hidden");
        clampToViewport();
        bringToFront();
      },
      hide(){ element.classList.add("hidden"); },
      destroy(){
        window.removeEventListener("resize",onViewportResize);
        registry.delete(element);
        delete element.__bt001FloatingWindow;
      }
    };
    element.__bt001FloatingWindow = api;
    return api;
  }

  window.BT001FloatingWindow = Object.freeze({install});
})();
