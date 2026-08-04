(() => {
  "use strict";

  function toNumber(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function weightedAverage(rows){
    let qty = 0;
    let value = 0;
    for(const row of Array.isArray(rows) ? rows : []){
      const level = toNumber(row && row.level);
      const lot = toNumber(row && row.lot);
      if(level == null || lot == null || lot <= 0) continue;
      qty += lot;
      value += level * lot;
    }
    return qty > 0 ? {qty,avg:value / qty} : {qty:0,avg:null};
  }

  function estimatePl(direction,entryPrice,exitPrice,qty){
    const en = toNumber(entryPrice);
    const ex = toNumber(exitPrice);
    const q = toNumber(qty);
    if(en == null || ex == null || q == null) return null;
    return direction === "SHORT" ? (en - ex) * q : (ex - en) * q;
  }

  window.CalculatorDomain = {
    toNumber,
    weightedAverage,
    estimatePl
  };
})();