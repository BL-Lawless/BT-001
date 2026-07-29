(() => {
  "use strict";
  const SIGNAL_ACTIONS=Object.freeze(["DETECTION_QUALIFIED","RANK_REJECTED"]);
  const POSITION_ACTIONS=Object.freeze(["TRANCHE_ADDED","TRANCHE_CLOSED","TRANCHE_RECOVERED","ENTRY_FAILED","EMERGENCY_CLOSE_FAILED","EMERGENCY_CLOSE_SUCCEEDED","PROTECTION_REBUILD_STARTED","PROTECTION_REBUILD_SUCCEEDED","PROTECTION_REBUILD_FAILED","PROTECTION_REBUILD_REFUSED","TRANCHE_EXTERNALLY_REDUCED","PROFIT_LOCK_APPLIED","PROFIT_LOCK_FAILED"]);
  const OPERATIONAL_ACTIONS=Object.freeze(["ARMED","DISARMED","CONNECTION_TEST","DAILY_LOSS_CAP_BREACHED"]);
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  function activityTable(action){
    return SIGNAL_ACTIONS.includes(action)?"scalp_v1_signals":POSITION_ACTIONS.includes(action)?"scalp_positions":OPERATIONAL_ACTIONS.includes(action)?"scalp_operational":null;
  }
  function buildActivityLog({action,detail={},symbol=null,machineId=null,now=Date.now}={}){
    const table=activityTable(action);
    if(!table)return null;
    const positionState=clone(detail.positionState??null),event_at=new Date(now()).toISOString();
    const row=table==="scalp_v1_signals"?{
      event_at,symbol,action,source_timeframe:detail.sourceTimeframe??null,
      detector_state:clone(detail.detectorState??null),cascade_agreement:clone(detail.cascadeAgreement??null),machine_id:machineId
    }:table==="scalp_positions"?{
      event_at,symbol,action,direction:positionState?.direction??null,
      tranche_id:positionState?.trancheId??null,position_state:positionState,machine_id:machineId
    }:{event_at,action,detail:clone(detail),machine_id:machineId};
    return {table,row};
  }
  function buildTradeLog({tranche,reason,pnl,guide,machineId=null,now=Date.now,fromLocal=value=>value}={}){
    if(!tranche)return null;
    const exitPrice=number(tranche.closedPrice)||(["PARTIAL_TP","TP"].includes(reason)?number(tranche.partialTpPrice):["PSL","SL"].includes(reason)?number(tranche.pslPrice):number(guide));
    return {table:"scalp_trades",row:{
      created_at:new Date(fromLocal(number(tranche.createdAt)||now())).toISOString(),
      closed_at:new Date(fromLocal(number(tranche.closedAt)||now())).toISOString(),
      symbol:tranche.symbol||null,direction:tranche.direction||null,mode:tranche.mode||null,
      source_timeframe:tranche.source||null,event_type:tranche.eventType||null,auto_entered:false,
      cascade_agreement_at_entry:clone(tranche.cascadeAgreementAtEntry||null),
      requested_qty:number(tranche.requestedQty),filled_qty:number(tranche.closedQty)??number(tranche.filledQty),
      avg_entry_price:number(tranche.entryPrice),entry_commission:number(tranche.entryCommission),
      exit_reason:reason||null,exit_price:exitPrice,estimated_realized_pnl_usd:pnl,
      raw_session:clone({trancheId:tranche.trancheId,...tranche}),device_id:machineId
    }};
  }
  function createLogger(options={}){
    const getSupabase=options.getSupabase,getSymbol=options.getSymbol;
    const now=typeof options.now==="function"?options.now:Date.now;
    const fromLocal=typeof options.fromLocal==="function"?options.fromLocal:value=>value;
    function publish(client,result){
      if(!result)return false;
      if(!client||typeof client.log!=="function")return false;
      try{const pending=client.log(result.table,result.row);if(pending&&typeof pending.catch==="function")pending.catch(()=>{});}catch(_error){}
      return true;
    }
    return Object.freeze({
      logActivity(action,detail={}){
        const client=typeof getSupabase==="function"?getSupabase():null;
        if(!client||typeof client.log!=="function")return false;
        const machineId=typeof client.getDeviceId==="function"?client.getDeviceId():null;
        return publish(client,buildActivityLog({action,detail,symbol:typeof getSymbol==="function"?getSymbol():null,machineId,now}));
      },
      logTrade(tranche,reason,pnl,guide){
        const client=typeof getSupabase==="function"?getSupabase():null;
        if(!client||typeof client.log!=="function")return false;
        const machineId=typeof client.getDeviceId==="function"?client.getDeviceId():null;
        return publish(client,buildTradeLog({tranche,reason,pnl,guide,machineId,now,fromLocal}));
      }
    });
  }
  const api=Object.freeze({SIGNAL_ACTIONS,POSITION_ACTIONS,OPERATIONAL_ACTIONS,activityTable,buildActivityLog,buildTradeLog,createLogger});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SCALP_LOGGER_CORE=api;
})();
