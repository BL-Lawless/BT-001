(() => {
  "use strict";

  function number(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function weightedAverage(rows){
    let quantity = 0;
    let value = 0;
    (rows || []).forEach(row => {
      const level = number(row && row.level);
      const lot = number(row && row.lot);
      if(level == null || lot == null || level <= 0 || lot <= 0) return;
      quantity += lot;
      value += level * lot;
    });
    return {quantity,average:quantity > 0 ? value / quantity : null};
  }
  function estimatePl(direction,entry,level,lot){
    const en = number(entry);
    const ex = number(level);
    const qty = number(lot);
    if(en == null || ex == null || qty == null) return null;
    return direction === "SHORT" ? (en - ex) * qty : (ex - en) * qty;
  }
  function generateLevels({start,end,step,count,lastEdited,direction}){
    const first = number(start);
    let last = number(end);
    let distance = Math.abs(number(step) || 0);
    const size = Math.max(1,Math.floor(number(count) || 1));
    if(first == null || first <= 0) return {levels:[],step:null,end:null};
    const sign = direction === "SHORT" ? 1 : -1;
    if(lastEdited === "end" && last != null && size > 1){
      distance = Math.abs(last - first) / (size - 1);
    }else{
      last = first + sign * distance * (size - 1);
    }
    const levels = Array.from({length:size},(_,index) => first + sign * distance * index);
    return {levels,step:distance,end:last};
  }
  function distributeLots(total,count){
    const units = Math.max(0,Math.round((number(total) || 0) * 1000));
    const size = Math.max(1,Math.floor(number(count) || 1));
    const eachUnits = Math.floor(units / size);
    let remainingUnits = units;
    return Array.from({length:size},(_,index) => {
      const lotUnits = index === size - 1 ? remainingUnits : Math.min(eachUnits,remainingUnits);
      remainingUnits -= lotUnits;
      return lotUnits / 1000;
    });
  }

  window.GradCalculatorDomain = {number,weightedAverage,estimatePl,generateLevels,distributeLots};
})();
