(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {};
  const POPUP_NAME="bt001ScalpSimulator";
  const POPUP_FEATURES="popup=yes,resizable=yes,scrollbars=yes,width=760,height=820";

  class ScalpSimulatorUI{
    constructor(){
      this.popup=null;
      this.active=false;
      this.pollTimer=null;
      this.button=null;
      this.onToggle=()=>this.open();
    }
    install(){
      this.button=document.getElementById("scalpSimulatorToggle");
      if(this.button)this.button.addEventListener("click",this.onToggle);
      this.renderButton();
      return this;
    }
    popupIsOpen(){
      try{return !!this.popup&&!this.popup.closed;}
      catch(_error){return false;}
    }
    popupUrl(){
      try{return new URL("features/scalp/simulator-popup.html",window.location.href).href;}
      catch(_error){return "features/scalp/simulator-popup.html";}
    }
    open(){
      if(this.popupIsOpen()){
        try{this.popup.focus();}catch(_error){}
        this.active=true;
        this.renderButton();
        return this.popup;
      }
      this.popup=window.open(this.popupUrl(),POPUP_NAME,POPUP_FEATURES);
      this.active=this.popupIsOpen();
      if(this.popup){
        const bridge=window.__BT001_SCALP_SIMULATOR_BRIDGE__;
        if(bridge&&typeof bridge.registerPopup==="function")bridge.registerPopup(this.popup);
        try{this.popup.focus();}catch(_error){}
        this.watchPopup();
      }
      this.renderButton();
      return this.popup;
    }
    watchPopup(){
      if(this.pollTimer)window.clearInterval(this.pollTimer);
      this.pollTimer=window.setInterval(()=>{
        if(this.popupIsOpen())return;
        window.clearInterval(this.pollTimer);
        this.pollTimer=null;
        this.popup=null;
        this.active=false;
        this.renderButton();
      },500);
    }
    renderButton(){
      const button=this.button||document.getElementById("scalpSimulatorToggle");
      if(!button)return;
      button.textContent="SIMULATOR";
      button.classList.toggle("is-active",this.active);
      button.setAttribute("aria-pressed",String(this.active));
      button.title=this.active?"Focus simulator window":"Open simulator in a separate window";
    }
    destroy(){
      if(this.button)this.button.removeEventListener("click",this.onToggle);
      if(this.pollTimer)window.clearInterval(this.pollTimer);
      this.pollTimer=null;
      this.button=null;
    }
  }

  root.ScalpSimulatorUI=ScalpSimulatorUI;
})();
