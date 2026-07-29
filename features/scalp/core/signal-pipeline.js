(() => {
  "use strict";
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
  const upper=value=>String(value||"").toUpperCase();
  const finite=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};

  function createSignalPipeline(options={}){
    const detector=options.detector,getSymbol=options.getSymbol,getMachineId=options.getMachineId,write=options.write;
    const timeframes=Object.freeze([...(options.timeframes||["1m","3m","5m","15m"])]);
    const now=typeof options.now==="function"?options.now:Date.now;
    if(!detector||typeof detector.evaluateTf!=="function")throw new Error("A signal detector is required");
    if(typeof write!=="function")throw new Error("A signal writer is required");
    const cascadeByTf=new Map(),seen=new Set();
    function recordCascade(source,event){
      const direction=upper(event&&event.direction);
      if(!["LONG","SHORT"].includes(direction))return;
      cascadeByTf.set(source,{timeframe:source,direction,eventType:event.eventType||null,at:finite(event.publishedAt)||now(),candleTime:finite(event.candleTime),rankValue:event.rankValue==null?null:finite(event.rankValue),rank:event.rank||null});
    }
    function cascadeAgreement(direction){
      const side=upper(direction),records=[...cascadeByTf.values()].filter(record=>record.direction===side);
      return {direction:side,count:records.length,timeframes:records.map(record=>record.timeframe),records:records.map(clone)};
    }
    function rowsFor(source,event){
      const machine_id=String(typeof getMachineId==="function"?getMachineId():"").trim();
      if(!machine_id)throw new Error("machine_id is required for scalp signal logging");
      const symbol=String(typeof getSymbol==="function"?getSymbol():"").trim();
      if(!symbol)throw new Error("symbol is required for scalp signal logging");
      const cascade_agreement=cascadeAgreement(event.direction),detector_state=clone(event);
      const common={symbol,action:"DETECTION_QUALIFIED",source_timeframe:source,detector_state,cascade_agreement,machine_id};
      return [
        {table:"scalp_v1_signals",row:{event_at:new Date(now()).toISOString(),...common}},
        {table:"scalp_v2_signals",row:common}
      ];
    }
    function accept(source,result){
      const event=result&&result.emittedEvent;
      if(!event||event.qualified!==true||event.projected===true)return false;
      const key=String(event.eventId||event.freshnessKey||"");
      if(key&&seen.has(key))return false;
      if(key){seen.add(key);if(seen.size>1000)seen.delete(seen.values().next().value);}
      recordCascade(source,event);
      for(const item of rowsFor(source,event)){
        try{const pending=write(item.table,item.row);if(pending&&typeof pending.catch==="function")pending.catch(()=>{});}catch(_error){}
      }
      return true;
    }
    function handleUpdate(update){
      const source=String(update&&update.tf||"");
      if(!timeframes.includes(source))return false;
      return accept(source,detector.evaluateTf(source,update,now()));
    }
    function evaluateAll(){
      for(const source of timeframes)accept(source,detector.evaluateTf(source,null,now()));
    }
    function reset(){detector.reset();cascadeByTf.clear();seen.clear();}
    return Object.freeze({handleUpdate,evaluateAll,accept,reset,cascadeAgreement,cascadeState:()=>[...cascadeByTf.values()].map(clone),diagnostics:()=>detector.diagnostics()});
  }
  const api=Object.freeze({createSignalPipeline});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SCALP_SIGNAL_PIPELINE_CORE=api;
})();
