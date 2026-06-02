(() => {
  "use strict";

  function buildSummary(domain,direction,entryRows,exitRows,stopLevel){
    const weightedAverage = domain && typeof domain.weightedAverage === "function"
      ? domain.weightedAverage
      : rows => {
        let qty = 0;
        let value = 0;
        for(const row of Array.isArray(rows) ? rows : []){
          const level = Number(row && row.level);
          const lot = Number(row && row.lot);
          if(!Number.isFinite(level) || !Number.isFinite(lot) || lot <= 0) continue;
          qty += lot;
          value += level * lot;
        }
        return qty > 0 ? {qty,avg:value / qty} : {qty:0,avg:null};
      };
    const estimatePl = domain && typeof domain.estimatePl === "function"
      ? domain.estimatePl
      : (side,en,ex,qty) => {
        const a = Number(en);
        const b = Number(ex);
        const q = Number(qty);
        if(!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(q)) return null;
        return side === "SHORT" ? (a - b) * q : (b - a) * q;
      };

    const entry = weightedAverage(entryRows);
    const exits = Array.isArray(exitRows) ? exitRows : [];
    const stop = Number.isFinite(Number(stopLevel)) ? Number(stopLevel) : null;

    let reward = 0;
    let rewardCount = 0;
    for(const row of exits){
      const pl = estimatePl(direction,entry.avg,row.level,row.lot);
      if(pl == null) continue;
      reward += pl;
      rewardCount += 1;
    }

    let risk = null;
    if(entry.avg != null && stop != null && entry.qty > 0){
      risk = estimatePl(direction,entry.avg,stop,entry.qty);
    }

    return {
      entryQty:entry.qty,
      entryAvg:entry.avg,
      risk,
      reward:rewardCount ? reward : null
    };
  }

  window.CalculatorApplication = {
    buildSummary
  };
})();
