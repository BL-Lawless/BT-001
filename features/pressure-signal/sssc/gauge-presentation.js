(() => {
  "use strict";

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

  function directionRelativeAcceleration(diagnostic){
    const acceleration=Number(diagnostic&&diagnostic.directionalAcceleration);
    if(!Number.isFinite(acceleration))return null;
    return clamp(acceleration,-100,100);
  }

  function createGaugeTracker(){
    const currentByTf=Object.create(null),previousByTf=Object.create(null);

    function update(diagnostics){
      for(const diagnostic of Array.isArray(diagnostics)?diagnostics:[]){
        if(!diagnostic||diagnostic.available!==true)continue;
        const tf=String(diagnostic.tf||"");
        const current=directionRelativeAcceleration(diagnostic);
        if(!tf||current==null)continue;
        if(Number.isFinite(currentByTf[tf])&&currentByTf[tf]!==current)previousByTf[tf]=currentByTf[tf];
        else if(!Object.prototype.hasOwnProperty.call(previousByTf,tf))previousByTf[tf]=null;
        currentByTf[tf]=current;
      }
      return snapshot();
    }

    function reading(tf){
      const key=String(tf||"");
      return Object.freeze({
        current:Number.isFinite(currentByTf[key])?currentByTf[key]:null,
        previous:Number.isFinite(previousByTf[key])?previousByTf[key]:null
      });
    }

    function snapshot(){
      return Object.freeze(Object.fromEntries(Object.keys(currentByTf).map(tf=>[tf,reading(tf)])));
    }

    return Object.freeze({update,reading,snapshot});
  }

  const api=Object.freeze({directionRelativeAcceleration,createGaugeTracker});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_GAUGE_PRESENTATION=api;
})();
