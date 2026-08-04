(() => {
  "use strict";

  function readFlag(key,defaultValue){
    try{
      const raw = localStorage.getItem(key);
      if(raw == null) return !!defaultValue;
      return raw === "1";
    }catch(_e){
      return !!defaultValue;
    }
  }

  function writeFlag(key,next){
    try{ localStorage.setItem(key,next ? "1" : "0"); }catch(_e){}
  }

  window.CalculatorInfrastructure = {
    readFlag,
    writeFlag
  };
})();