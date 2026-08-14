(() => {
  "use strict";
  const root = typeof window !== "undefined"
    ? (window.__BT001_MA_STACK_BUILD__ ||= {})
    : (globalThis.__BT001_MA_STACK_BUILD__ ||= {});
  const DEFAULT_PERIOD = 14;
  const finite = value => Number.isFinite(Number(value));
  const field = (row,index,name) => Number(Array.isArray(row) ? row[index] : row && row[name]);
  const high = row => field(row,2,"high");
  const low = row => field(row,3,"low");
  const close = row => field(row,4,"close");

  function trueRange(row,previousClose){
    const h=high(row),l=low(row),pc=Number(previousClose);
    if(!finite(h)||!finite(l)||!finite(pc)) return NaN;
    return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));
  }
  function trueRangeSeries(rows){
    const source=Array.isArray(rows)?rows:[];
    const out=Array(source.length).fill(NaN);
    for(let i=1;i<source.length;i++) out[i]=trueRange(source[i],close(source[i-1]));
    return out;
  }
  function wilderAverageSeries(values,period=DEFAULT_PERIOD,startIndex=1){
    const p=Math.max(1,Math.round(Number(period)||DEFAULT_PERIOD));
    const source=Array.isArray(values)?values:[];
    const out=Array(source.length).fill(NaN);
    const seedEnd=startIndex+p-1;
    if(seedEnd>=source.length) return out;
    let sum=0;
    for(let i=startIndex;i<=seedEnd;i++){
      if(!finite(source[i])) return out;
      sum+=Number(source[i]);
    }
    let current=sum/p;
    out[seedEnd]=current;
    for(let i=seedEnd+1;i<source.length;i++){
      if(!finite(source[i])) continue;
      current=((p-1)*current+Number(source[i]))/p;
      out[i]=current;
    }
    return out;
  }
  function atrSeries(rows,period=DEFAULT_PERIOD){
    return wilderAverageSeries(trueRangeSeries(rows),period,1);
  }
  function directionalSeries(rows,period=DEFAULT_PERIOD){
    const source=Array.isArray(rows)?rows:[];
    const plusDm=Array(source.length).fill(NaN),minusDm=Array(source.length).fill(NaN);
    for(let i=1;i<source.length;i++){
      const up=high(source[i])-high(source[i-1]);
      const down=low(source[i-1])-low(source[i]);
      if(!finite(up)||!finite(down)) continue;
      plusDm[i]=up>down&&up>0?up:0;
      minusDm[i]=down>up&&down>0?down:0;
    }
    return {
      plus:wilderAverageSeries(plusDm,period,1),
      minus:wilderAverageSeries(minusDm,period,1)
    };
  }
  function adxSeries(rows,period=DEFAULT_PERIOD){
    const source=Array.isArray(rows)?rows:[];
    const p=Math.max(1,Math.round(Number(period)||DEFAULT_PERIOD));
    const atr=atrSeries(source,p),dm=directionalSeries(source,p);
    const dx=Array(source.length).fill(NaN);
    for(let i=0;i<source.length;i++){
      if(!finite(atr[i])||Number(atr[i])<=0||!finite(dm.plus[i])||!finite(dm.minus[i])) continue;
      const plusDi=100*Number(dm.plus[i])/Number(atr[i]);
      const minusDi=100*Number(dm.minus[i])/Number(atr[i]);
      const total=plusDi+minusDi;
      dx[i]=total>0?100*Math.abs(plusDi-minusDi)/total:0;
    }
    return wilderAverageSeries(dx,p,p);
  }
  function snapshot(rows,period=DEFAULT_PERIOD,shadowBars=5){
    const atr=atrSeries(rows,period),adx=adxSeries(rows,period);
    const last=Math.max(0,adx.length-1),shadow=Math.max(0,last-Math.max(0,Math.round(Number(shadowBars)||0)));
    return {
      period:Math.max(1,Math.round(Number(period)||DEFAULT_PERIOD)),
      atrSeries:atr,
      adxSeries:adx,
      atr:finite(atr[last])?Number(atr[last]):null,
      adx:finite(adx[last])?Number(adx[last]):null,
      adxShadow:finite(adx[shadow])?Number(adx[shadow]):null,
      shadowBars:Math.max(0,Math.round(Number(shadowBars)||0))
    };
  }
  const api = {DEFAULT_PERIOD,trueRange,trueRangeSeries,wilderAverageSeries,atrSeries,adxSeries,snapshot};
  root.volatility = api;
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
})();
