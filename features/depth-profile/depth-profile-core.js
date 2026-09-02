(() => {
  "use strict";

  function finite(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

  function aggregate({bids=[],asks=[],price,bucketSize,depthRange}={}){
    const current=finite(price),step=finite(bucketSize),range=finite(depthRange);
    if(!(current>0)||!(step>0)||!(range>0))return Object.freeze({price:current,bucketSize:step,depthRange:range,buckets:[],coverage:{bid:false,ask:false,complete:false}});
    const lower=current-range,upper=current+range;
    const buckets=new Map();
    const add=(side,level)=>{
      const levelPrice=finite(level&&level[0]),size=finite(level&&level[1]);
      if(!(size>0)||!(levelPrice>0))return;
      if(side==="bid"&&levelPrice>current)return;
      if(side==="ask"&&levelPrice<current)return;
      const index=Math.floor(levelPrice/step);
      const bucketLow=index*step,bucketHigh=bucketLow+step;
      if(bucketHigh<=lower||bucketLow>=upper)return;
      const key=side+":"+index;
      const existing=buckets.get(key)||{
        side,index,volume:0,
        low:bucketLow,
        high:bucketHigh
      };
      existing.volume+=size;
      buckets.set(key,existing);
    };
    bids.forEach(level=>add("bid",level));
    asks.forEach(level=>add("ask",level));
    const bidPrices=bids.map(level=>finite(level&&level[0])).filter(value=>value!=null);
    const askPrices=asks.map(level=>finite(level&&level[0])).filter(value=>value!=null);
    const bidCoverage=bidPrices.length>0&&Math.min(...bidPrices)<=lower;
    const askCoverage=askPrices.length>0&&Math.max(...askPrices)>=upper;
    const rows=Array.from(buckets.values()).filter(row=>row.volume>0).sort((a,b)=>a.low-b.low||a.side.localeCompare(b.side));
    rows.forEach(Object.freeze);
    return Object.freeze({price:current,bucketSize:step,depthRange:range,buckets:Object.freeze(rows),coverage:Object.freeze({bid:bidCoverage,ask:askCoverage,complete:bidCoverage&&askCoverage})});
  }

  function opacity(volume,zeroOpacityVolume=0,fullOpacityVolume=1,layerOpacity=1){
    const size=Math.max(0,finite(volume)||0);
    const zero=Math.max(0,finite(zeroOpacityVolume)||0);
    const full=Math.max(0,finite(fullOpacityVolume)||0);
    const ceiling=clamp(finite(layerOpacity)==null?1:Number(layerOpacity),0,1);
    if(size<=zero)return 0;
    if(full<=zero)return size>=full?ceiling:0;
    return clamp((size-zero)/(full-zero),0,1)*ceiling;
  }

  function barLength(volume,pixelsPerVolume=12,maxLength=Infinity){
    const size=Math.max(0,finite(volume)||0),scale=Math.max(0,finite(pixelsPerVolume)||0);
    return Math.min(Math.max(0,finite(maxLength)==null?Infinity:Number(maxLength)),size*scale);
  }

  const api=Object.freeze({aggregate,opacity,barLength});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001DepthProfileCore=api;
})();
