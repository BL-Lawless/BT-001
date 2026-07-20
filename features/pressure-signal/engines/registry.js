(() => {
  "use strict";

  const VALID_IDS = Object.freeze(["A","B","C"]);
  const VALID_STATUSES = Object.freeze(["available","unavailable"]);
  const REQUIRED_OUTPUT_KEYS = Object.freeze([
    "direction","confidence","entryState","setupIdentity","setupFamily","setupTimeframe",
    "setupQuality","triggerQuality","currentEntryQuality","entryVerdict","reasons","exclusions",
    "triggerIdentity","triggerEvidence","dataStatus","tone"
  ]);

  function assert(condition,message){
    if(!condition) throw new TypeError(message);
  }
  function normalizedId(value){ const id=String(value || "").trim().toUpperCase();return id==="SIGNAL-C"?"C":id; }
  function stateCounts(value,seen=new Set()){
    if(!value || typeof value !== "object" || seen.has(value)) return {containers:0,entries:0};
    seen.add(value);
    if(value instanceof Map || value instanceof Set) return {containers:1,entries:value.size};
    if(Array.isArray(value)) return {containers:1,entries:value.length};
    return Object.values(value).reduce((total,item) => {
      const next=stateCounts(item,seen);
      total.containers+=next.containers;total.entries+=next.entries;
      return total;
    },{containers:0,entries:0});
  }
  function validateRequirements(requirements){
    assert(requirements && typeof requirements === "object","Signal engine requirements must be an object");
    const items=Array.isArray(requirements.items) ? requirements.items : [];
    assert(items.length>0,"Signal engine requirements must include at least one timeframe");
    items.forEach(item => {
      assert(item && typeof item.tf === "string" && item.tf.trim(),"Signal engine requirement timeframe is missing");
      assert(Number.isFinite(Number(item.historyTarget)) && Number(item.historyTarget)>0,"Signal engine requirement depth is invalid");
    });
    return requirements;
  }
  function validateOutput(output){
    assert(output && typeof output === "object","Signal engine evaluation must return an object");
    REQUIRED_OUTPUT_KEYS.forEach(key => assert(Object.prototype.hasOwnProperty.call(output,key),`Signal engine output is missing ${key}`));
    assert(["LONG","SHORT","NO BIAS"].includes(output.direction),"Signal engine output direction is invalid");
    assert(output.confidence==null || Number.isFinite(Number(output.confidence)),"Signal engine output confidence is invalid");
    assert(Array.isArray(output.reasons),"Signal engine output reasons must be an array");
    assert(Array.isArray(output.exclusions),"Signal engine output exclusions must be an array");
    assert(Array.isArray(output.triggerEvidence),"Signal engine output triggerEvidence must be an array");
    return output;
  }
  function validateEngine(engine){
    assert(engine && typeof engine === "object","Signal engine must be an object");
    const id=normalizedId(engine.id);
    assert(VALID_IDS.includes(id),"Signal engine ID must be A, B or C");
    assert(typeof engine.displayName === "string" && engine.displayName.trim(),"Signal engine displayName is required");
    assert(typeof engine.version === "string" && engine.version.trim(),"Signal engine version is required");
    assert(VALID_STATUSES.includes(engine.status),"Signal engine status must be available or unavailable");
    assert(typeof engine.getRequirements === "function","Signal engine getRequirements method is required");
    assert(engine.state && typeof engine.state === "object","Signal engine-owned state/cache is required");
    assert(typeof engine.evaluate === "function","Signal engine evaluate method is required");
    assert(typeof engine.diagnostics === "function","Signal engine diagnostics method is required");
    return {...engine,id};
  }

  function createSignalEngineRegistry(){
    const engines=new Map(),listeners=new Set();
    const evaluationCounts=new Map(),errors=new Map(),reasons=new Map();
    let activeId=null,activationGeneration=0,activeAbort=null,evaluationSequence=0;
    const runningTokens=new Set();
    const emit=event => listeners.forEach(listener => { try{listener(event);}catch(_error){} });
    function register(candidate){
      const engine=validateEngine(candidate);
      if(engines.has(engine.id)) throw new Error(`Duplicate Signal engine ID: ${engine.id}`);
      engines.set(engine.id,engine);evaluationCounts.set(engine.id,0);
      emit({type:"registered",engine:describe(engine)});
      return engine;
    }
    function unregister(id){
      const key=normalizedId(id),engine=engines.get(key);
      if(!engine) return false;
      if(activeId===key) activate(null,"engine-unregistered");
      engines.delete(key);evaluationCounts.delete(key);errors.delete(key);reasons.delete(key);
      emit({type:"unregistered",engineId:key});return true;
    }
    function setStatus(id,status,reason="availability-change"){
      const engine=get(id);
      if(!engine) throw new Error(`Signal engine ${normalizedId(id)} is not registered`);
      if(!VALID_STATUSES.includes(status)) throw new TypeError("Signal engine status must be available or unavailable");
      if(engine.status===status) return describe(engine);
      engine.status=status;
      if(status!=="available"&&activeId===engine.id) activate(null,reason);
      emit({type:"status",engine:describe(engine),reason});
      return describe(engine);
    }
    function get(id){ return engines.get(normalizedId(id)) || null; }
    function isAvailable(id){ const engine=get(id);return !!engine && engine.status==="available"; }
    function describe(engine){
      if(!engine) return null;
      return {id:engine.id,signalId:engine.signalId||engine.id,displayName:engine.displayName,version:engine.version,status:engine.status,available:engine.status==="available"};
    }
    function list(){ return VALID_IDS.map(id => describe(engines.get(id)) || {id,displayName:null,version:null,status:"unregistered",available:false}); }
    function activate(id,reason="selection-change"){
      const key=id==null ? null : normalizedId(id),next=key==null ? null : get(key);
      if(key!=null && (!next || next.status!=="available")) throw new Error(`Signal engine ${key || id} is unavailable`);
      const previous=get(activeId);
      if(activeAbort) activeAbort.abort();
      runningTokens.clear();
      activeAbort=typeof AbortController === "function" ? new AbortController() : null;
      activeId=key;activationGeneration+=1;
      if(previous && previous.id!==key && typeof previous.onDeactivate==="function") previous.onDeactivate({reason,nextEngineId:key});
      if(next && previous?.id!==key && typeof next.onActivate==="function") next.onActivate({reason,previousEngineId:previous?.id || null});
      emit({type:"activated",previousEngineId:previous?.id || null,engineId:key,generation:activationGeneration,reason});
      return next;
    }
    function requirements(context={}){
      const engine=get(activeId);
      if(!engine || engine.status!=="available") throw new Error("No available Signal engine is active");
      return validateRequirements(engine.getRequirements(context));
    }
    function evaluate(context={}){
      const engine=get(activeId);
      if(!engine || engine.status!=="available") throw new Error("No available Signal engine is active");
      const directionMode=["AUTO","LONG","SHORT"].includes(String(context.directionMode||"AUTO").toUpperCase())?String(context.directionMode||"AUTO").toUpperCase():"AUTO";
      const token={id:++evaluationSequence,engineId:engine.id,signalId:engine.signalId||engine.id,engineVersion:engine.version,activationGeneration,publicationGeneration:Number(context.publicationGeneration)||0,directionMode};
      const signal=activeAbort && activeAbort.signal;
      evaluationCounts.set(engine.id,(evaluationCounts.get(engine.id)||0)+1);reasons.set(engine.id,context.reason || "evaluation");errors.delete(engine.id);
      runningTokens.add(token);
      const settle=output => {
        const normalized=validateOutput(output);
        return {...normalized,engineId:engine.id,signalId:token.signalId,engineVersion:engine.version,publicationGeneration:token.publicationGeneration,directionMode,__engineToken:token};
      };
      const fail=error => { errors.set(engine.id,error && error.stack || String(error));throw error; };
      try{
        const result=engine.evaluate({...context,signal,engineId:engine.id,engineVersion:engine.version,activationGeneration});
        if(result && typeof result.then === "function") return result.then(settle,fail).finally(() => {runningTokens.delete(token);});
        const output=settle(result);runningTokens.delete(token);return output;
      }catch(error){runningTokens.delete(token);fail(error);}
    }
    function accepts(output,expected={}){
      const token=output && output.__engineToken;
      const expectedMode=expected.directionMode==null?null:String(expected.directionMode).toUpperCase(),expectedGeneration=expected.publicationGeneration==null?null:Number(expected.publicationGeneration);
      return !!token && token.engineId===activeId && token.activationGeneration===activationGeneration && isAvailable(token.engineId)
        && (expectedMode==null||token.directionMode===expectedMode) && (expectedGeneration==null||token.publicationGeneration===expectedGeneration);
    }
    function subscribe(listener){ assert(typeof listener === "function","Registry listener must be a function");listeners.add(listener);return () => listeners.delete(listener); }
    function diagnostics(){
      return {
        registeredEngines:list(),activeEngineId:activeId,activationGeneration,activeEvaluationCount:runningTokens.size,
        engines:Array.from(engines.values()).map(engine => ({...describe(engine),evaluationCount:evaluationCounts.get(engine.id)||0,lastEvaluationReason:reasons.get(engine.id)||null,lastError:errors.get(engine.id)||null,stateCounts:stateCounts(engine.state),diagnostics:engine.diagnostics()}))
      };
    }
    return Object.freeze({register,unregister,setStatus,get,list,isAvailable,activate,requirements,evaluate,accepts,subscribe,diagnostics,validateOutput});
  }

  Object.defineProperty(window,"createSignalEngineRegistry",{value:createSignalEngineRegistry,configurable:true});
})();
