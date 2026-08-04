(() => {
  "use strict";

  function timeOf(row){return Number(row&&row.time);}
  function upsertForming(existing,incoming,merge){
    if(!incoming)return existing||null;
    return existing&&timeOf(existing)===timeOf(incoming)
      ? merge(existing,incoming)
      : {...incoming,final:false};
  }
  function upsertFinalized(rows,incoming,{source="ws",merge,warn}={}){
    const arr=Array.isArray(rows)?rows:[];
    const time=timeOf(incoming);
    if(!Number.isFinite(time))return {rows:arr,inserted:false,collision:false,expected:false};
    const idx=arr.findIndex(row=>timeOf(row)===time);
    if(idx<0){
      arr.push({...incoming,final:true});
      arr.sort((a,b)=>timeOf(a)-timeOf(b));
      return {rows:arr,inserted:true,collision:false,expected:false};
    }
    const existing=arr[idx],existingSource=String(existing&&existing.source||"unknown");
    // REST polling/backfill deliberately overlaps canonical history, and the first WS final for a
    // REST-seeded candle is an expected authority handoff. A repeated WS final is a real duplicate
    // finalized ingestion attempt and remains diagnosable.
    const expected=source==="rest"||existingSource!==source;
    if(!expected&&typeof warn==="function")warn({time,source,existingSource,existing:{...existing},incoming:{...incoming}});
    if(source==="rest"){
      arr[idx]=typeof merge==="function"?merge(existing,incoming):{...incoming,final:true};
    }else if(source==="ws"||existingSource!=="ws"){
      arr[idx]=source==="ws"?{...incoming,final:true}:(typeof merge==="function"?merge(existing,incoming):{...incoming,final:true});
    }
    return {rows:arr,inserted:false,collision:true,expected};
  }
  function strictlyIncreasingUnique(rows){
    if(!Array.isArray(rows))return false;
    for(let index=0;index<rows.length;index++){
      const time=timeOf(rows[index]);
      if(!Number.isFinite(time)||(index>0&&time<=timeOf(rows[index-1])))return false;
    }
    return true;
  }

  const api=Object.freeze({upsertForming,upsertFinalized,strictlyIncreasingUnique});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001CanonicalCandleSeries=api;
})();
