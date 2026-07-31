(() => {
  "use strict";

  const ENTRY_ACTIONS=new Set(["FRESH LONG","FRESH SHORT"]);
  const sideForEntry=action=>action==="FRESH LONG"?"LONG":action==="FRESH SHORT"?"SHORT":null;
  const finite=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};

  function createSignalTransitionTracker(options={}){
    const calculation=options.calculation;
    if(!calculation||typeof calculation.evaluatePositionAction!=="function")throw new Error("SSSC calculation is required");
    const confirmations=Math.max(2,Math.round(Number(options.confirmations)||2));
    let previousSetupAction=null,entryCandidate=null,exitCandidate=null,activeDirection=null;

    function advance(candidate,action,reason){
      if(!action)return null;
      if(candidate&&candidate.action===action)return {...candidate,count:candidate.count+1,reason};
      return {action,count:1,reason};
    }

    function trimRead(marketRead,side){
      const bias=finite(marketRead&&marketRead.marketBias);
      if(bias==null)return null;
      const crossed=side==="LONG"?bias< -8:side==="SHORT"?bias>8:false;
      if(!crossed)return null;
      const trimBias=side==="LONG"?-8.000001:8.000001;
      const read=calculation.evaluatePositionAction({...marketRead,marketBias:trimBias},{hasPosition:true,side});
      return read&&read.positionAction==="TRIM"?read:null;
    }

    function observe({marketRead,eventAt,machineId,symbol,snapshotId}={}){
      const setupAction=String(marketRead&&marketRead.setupAction||"WAIT"),setupReason=String(marketRead&&marketRead.reason||"");
      if(previousSetupAction===null){previousSetupAction=setupAction;return null;}
      let confirmed=null;
      if(ENTRY_ACTIONS.has(setupAction)){
        if(entryCandidate&&entryCandidate.action===setupAction)entryCandidate=advance(entryCandidate,setupAction,setupReason);
        else if(setupAction!==previousSetupAction)entryCandidate=advance(null,setupAction,setupReason);
        else entryCandidate=null;
        if(entryCandidate&&entryCandidate.count>=confirmations){
          confirmed={action:entryCandidate.action,reason:entryCandidate.reason};
          activeDirection=sideForEntry(entryCandidate.action);entryCandidate=null;exitCandidate=null;
        }
      }else entryCandidate=null;
      previousSetupAction=setupAction;

      if(!confirmed&&activeDirection){
        const read=trimRead(marketRead,activeDirection),exitAction=read?`EXIT ${activeDirection}`:null;
        exitCandidate=advance(exitCandidate,exitAction,read&&read.reason||"");
        if(exitCandidate&&exitCandidate.count>=confirmations){
          confirmed={action:exitCandidate.action,reason:exitCandidate.reason};
          activeDirection=null;exitCandidate=null;
        }
      }
      if(!confirmed)return null;
      return {event_at:eventAt,machine_id:machineId,symbol,action:confirmed.action,reason:confirmed.reason,snapshot_id:snapshotId};
    }

    function reset(){previousSetupAction=null;entryCandidate=null;exitCandidate=null;activeDirection=null;}
    function status(){return {previousSetupAction,entryCandidate:entryCandidate&&{...entryCandidate},exitCandidate:exitCandidate&&{...exitCandidate},activeDirection,confirmations};}
    return Object.freeze({observe,reset,status});
  }

  const api=Object.freeze({createSignalTransitionTracker});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_SIGNAL_TRANSITION=api;
})();
