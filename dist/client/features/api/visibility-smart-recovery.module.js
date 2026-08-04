(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.BT001VisibilitySmartRecovery=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";

  function finite(value){return Number.isFinite(Number(value));}
  function statusOf(value){return String(value&&(value.streamStatus||value.status)||"").toLowerCase();}
  function decidePrivateStreamRestSkip(evidence={}){
    const hiddenSince=Number(evidence.hiddenSince),visibleAt=Number(evidence.visibleAt);
    const before=evidence.before,after=evidence.after;
    const fallback=reason=>({skipRest:false,reason});
    if(!finite(hiddenSince)||!finite(visibleAt)||hiddenSince<=0||visibleAt<hiddenSince)return fallback("invalid-hidden-window");
    if(!before||!after||typeof before!=="object"||typeof after!=="object")return fallback("missing-connection-history");
    if(statusOf(before)!=="live"||statusOf(after)!=="live")return fallback("stream-not-continuously-live");
    if(before.listenKeyActive!==true||after.listenKeyActive!==true)return fallback("listen-key-history-inconclusive");
    for(const field of ["starts","reconnects","connectedAt"]){
      if(!finite(before[field])||!finite(after[field]))return fallback(`missing-${field}-history`);
      if(Number(before[field])!==Number(after[field]))return fallback(`${field}-changed-during-hidden-window`);
    }
    if(Number(after.connectedAt)<=0||Number(after.connectedAt)>hiddenSince)return fallback("connection-not-proven-before-hidden-window");
    for(const field of ["disconnectedAt","lastCloseAt"]){
      if(!finite(after[field]))return fallback(`missing-${field}-history`);
      const at=Number(after[field]);
      if(at>=hiddenSince&&at<=visibleAt)return fallback(`${field}-during-hidden-window`);
    }
    if(after.lastError!=null&&String(after.lastError)!=="")return fallback("stream-reported-error");
    return {skipRest:true,reason:"private-stream-continuously-healthy"};
  }

  return Object.freeze({decidePrivateStreamRestSkip});
});
