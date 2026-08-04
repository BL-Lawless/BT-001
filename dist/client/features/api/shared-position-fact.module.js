(() => {
  "use strict";

  const MODULE="BT001_SHARED_POSITION_FACT_V1";
  const num=value=>Number.isFinite(Number(value))?Number(value):null;
  const upper=value=>String(value==null?"":value).toUpperCase();
  const sideFor=(amount,positionSide)=>Number(amount)<0||upper(positionSide)==="SHORT"?"SHORT":"LONG";
  const clone=value=>value&&typeof value==="object"?{...value}:value;

  function normalizePosition(position,symbolOverride){
    const symbol=upper(symbolOverride||(position&&position.symbol)||(position&&position.s));
    const rawAmount=num(position&&(position.positionAmt!=null?position.positionAmt:position.pa));
    const qty=position&&position.qty!=null?Math.abs(num(position.qty)||0):Math.abs(rawAmount||0);
    if(!(qty>1e-12))return null;
    const side=position&&position.side?upper(position.side):sideFor(rawAmount,position&&(position.positionSide||position.ps));
    const avg=num(position&&(position.avg!=null?position.avg:position.entryPrice!=null?position.entryPrice:position.ep))||0;
    return {
      symbol,
      side:side==="SHORT"?"SHORT":"LONG",
      qty,
      avg,
      positionSide:upper(position&&(position.positionSide||position.ps))||"BOTH",
      riskRow:position&&position.riskRow?clone(position.riskRow):null
    };
  }
  function signature(position,symbolOverride){
    const symbol=upper(symbolOverride||(position&&position.symbol));
    if(!position)return symbol+":FLAT";
    return [symbol,position.side,Number(position.qty).toFixed(8),Number(position.avg||0).toFixed(8)].join(":");
  }
  function factFromRisk(risk,symbol){
    const selected=upper(symbol);
    const rows=(Array.isArray(risk)?risk:[]).filter(row=>row&&upper(row.symbol)===selected);
    const active=rows.find(row=>Math.abs(num(row.positionAmt)||0)>1e-12)||null;
    const position=active?normalizePosition({...active,riskRow:active},selected):null;
    return {symbol:selected,position,risk:rows,updateTime:rows.reduce((latest,row)=>Math.max(latest,num(row&&row.updateTime)||0),0)};
  }
  function factFromAccountUpdate(event,symbol){
    const payload=event&&event.data?event.data:event;
    const selected=upper(symbol);
    const positions=payload&&payload.a&&Array.isArray(payload.a.P)?payload.a.P.filter(row=>row&&upper(row.s)===selected):[];
    if(!positions.length)return null;
    const active=positions.find(row=>Math.abs(num(row.pa)||0)>1e-12)||null;
    const risk=active?[{
      symbol:selected,positionAmt:String(active.pa),entryPrice:String(active.ep||0),positionSide:upper(active.ps)||"BOTH",
      unRealizedProfit:String(active.up||0),isolatedWallet:String(active.iw||0),breakEvenPrice:String(active.bep||0)
    }]:[];
    const position=active?normalizePosition({...active,riskRow:risk[0]},selected):null;
    return {symbol:selected,position,risk,eventTime:num(payload.E)||num(payload.T)||0,event:payload};
  }

  function createSharedPositionFactOwner(options={}){
    const now=typeof options.now==="function"?options.now:Date.now;
    const getSymbol=typeof options.getSymbol==="function"?options.getSymbol:()=>"";
    const onApply=typeof options.onApply==="function"?options.onApply:()=>{};
    const onPublish=typeof options.onPublish==="function"?options.onPublish:()=>{};
    const onDraw=typeof options.onDraw==="function"?options.onDraw:()=>{};
    const state={
      symbol:"",position:null,signature:"",revision:0,generation:0,source:"unavailable",coverageSource:"REST",
      streamRevision:0,streamSignature:"",lastAccountUpdateEventTime:0,lastAccountUpdateReceiveTime:0,
      sharedUiAppliedAt:0,positionChangePublishedAt:0,restObservedSignature:"",restObservedAt:0,
      restMismatchCount:0,lastRestMismatchAt:0,verifiedRevision:0,verifiedAt:0,lastRejectedReason:""
    };
    function snapshot(){return {...state,position:state.position?clone(state.position):null};}
    function captureExpectation(){return {symbol:state.symbol,signature:state.signature,revision:state.revision,generation:state.generation,streamRevision:state.streamRevision,streamSignature:state.streamSignature};}
    function changeDetail(previous,current,meta){
      return {
        previous:previous?clone(previous):null,current:current?clone(current):null,
        sizeChanged:Number(previous&&previous.qty||0).toFixed(8)!==Number(current&&current.qty||0).toFixed(8),
        sideChanged:String(previous&&previous.side||"")!==String(current&&current.side||""),
        averageEntryChanged:Number(previous&&previous.avg||0).toFixed(8)!==Number(current&&current.avg||0).toFixed(8),
        opened:!previous&&!!current,closed:!!previous&&!current,
        revision:state.revision,signature:state.signature,generation:state.generation,symbol:state.symbol,
        source:meta.source,coverageSource:state.coverageSource,eventTime:meta.eventTime||0,receivedAt:meta.receivedAt||0,appliedAt:state.sharedUiAppliedAt
      };
    }
    function apply(fact,meta={}){
      const symbol=upper(fact&&fact.symbol||getSymbol());
      const position=normalizePosition(fact&&fact.position,symbol);
      const nextSignature=signature(position,symbol);
      const changed=state.signature!==nextSignature;
      const previous=state.position;
      state.symbol=symbol;state.source=String(meta.source||"unknown");state.coverageSource=meta.authoritative?"USER_STREAM":"REST";
      if(!changed)return {accepted:true,changed:false,verified:false,snapshot:snapshot()};
      state.position=position;state.signature=nextSignature;state.revision+=1;state.generation+=1;state.sharedUiAppliedAt=now();
      onApply({previous,current:position?clone(position):null,risk:Array.isArray(fact&&fact.risk)?fact.risk.map(clone):[],snapshot:snapshot(),meta});
      const detail=changeDetail(previous,position,meta);
      state.positionChangePublishedAt=now();
      detail.publishedAt=state.positionChangePublishedAt;
      onPublish(detail);
      onDraw(detail);
      return {accepted:true,changed:true,verified:false,detail,snapshot:snapshot()};
    }
    function ingestStreamAccountUpdate(event,meta={}){
      const receivedAt=num(meta.receivedAt)||now();
      const fact=factFromAccountUpdate(event,meta.symbol||getSymbol());
      if(!fact)return {accepted:false,changed:false,reason:"selected-symbol-not-covered",snapshot:snapshot()};
      const eventTime=num(fact.eventTime)||0;
      if(eventTime&&state.lastAccountUpdateEventTime&&eventTime<state.lastAccountUpdateEventTime){
        state.lastRejectedReason="older-stream-event";
        return {accepted:false,changed:false,reason:state.lastRejectedReason,snapshot:snapshot()};
      }
      state.streamRevision+=1;state.lastAccountUpdateEventTime=eventTime||state.lastAccountUpdateEventTime;state.lastAccountUpdateReceiveTime=receivedAt;
      const result=apply(fact,{source:"ACCOUNT_UPDATE",authoritative:true,eventTime,receivedAt});
      state.streamSignature=signature(fact.position,fact.symbol);
      return {...result,streamRevision:state.streamRevision,snapshot:snapshot()};
    }
    function noteMismatch(observedSignature,reason){
      state.restObservedSignature=observedSignature;state.restObservedAt=now();state.restMismatchCount+=1;state.lastRestMismatchAt=state.restObservedAt;state.lastRejectedReason=reason;
      return {accepted:false,changed:false,mismatch:true,reason,snapshot:snapshot()};
    }
    function ingestRestRisk(risk,meta={}){
      const fact=factFromRisk(risk,meta.symbol||getSymbol());
      const observedSignature=signature(fact.position,fact.symbol);
      state.restObservedSignature=observedSignature;state.restObservedAt=num(meta.observedAt)||now();
      const expected=meta.expected||{};
      const newerStream=state.streamRevision>Number(expected.streamRevision||0);
      if(newerStream&&observedSignature!==state.signature)return noteMismatch(observedSignature,"newer-stream-revision");
      if(meta.verifyAgainstStream&&state.streamRevision>0&&observedSignature!==state.streamSignature)return noteMismatch(observedSignature,"rest-stream-signature-mismatch");
      if(!meta.ignoreStreamAuthority&&state.streamRevision>0&&observedSignature!==state.signature){
        const demonstrablyNewer=meta.allowAdvance===true&&Number(fact.updateTime||0)>Number(state.lastAccountUpdateEventTime||0);
        if(!demonstrablyNewer)return noteMismatch(observedSignature,"rest-not-newer-than-stream");
      }
      if(observedSignature===state.signature){
        state.verifiedRevision=state.revision;state.verifiedAt=state.restObservedAt;state.lastRejectedReason="";
        return {accepted:true,changed:false,verified:true,snapshot:snapshot(),fact};
      }
      const result=apply(fact,{source:String(meta.source||"positionRisk"),authoritative:false,receivedAt:state.restObservedAt});
      state.verifiedRevision=state.revision;state.verifiedAt=state.restObservedAt;state.lastRejectedReason="";
      return {...result,verified:true,snapshot:snapshot(),fact};
    }
    function guard(){return {symbol:state.symbol,signature:state.signature,revision:state.revision,generation:state.generation};}
    function isGuardCurrent(value){return !!value&&value.symbol===state.symbol&&value.signature===state.signature&&value.revision===state.revision&&value.generation===state.generation;}
    return Object.freeze({version:MODULE,snapshot,captureExpectation,ingestStreamAccountUpdate,ingestRestRisk,guard,isGuardCurrent,signature,normalizePosition,factFromRisk,factFromAccountUpdate});
  }

  function runSelfTests(){
    let clock=1000,publishes=[],draws=[],applies=[],consumerRevisions=[];
    const owner=createSharedPositionFactOwner({now:()=>++clock,getSymbol:()=>"BTCUSDT",onApply:item=>applies.push(item),onPublish:item=>{publishes.push(item);consumerRevisions=[item.revision,item.revision,item.revision];},onDraw:item=>draws.push(item)});
    const initial=owner.ingestRestRisk([{symbol:"BTCUSDT",positionAmt:"1",entryPrice:"60000",positionSide:"BOTH"}],{source:"seed",expected:owner.captureExpectation()});
    const pendingExpected=owner.captureExpectation();
    const stream=owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:2000,a:{P:[{s:"BTCUSDT",pa:"2",ep:"60500",ps:"BOTH"}]}},{receivedAt:2001});
    const stale=owner.ingestRestRisk([{symbol:"BTCUSDT",positionAmt:"1",entryPrice:"60000",positionSide:"BOTH"}],{source:"verification",expected:pendingExpected,verifyAgainstStream:true});
    const qtyAfterStale=owner.snapshot().position.qty;
    const publicationsBeforeMatch=publishes.length;
    const matching=owner.ingestRestRisk([{symbol:"BTCUSDT",positionAmt:"2",entryPrice:"60500",positionSide:"BOTH"}],{source:"verification",expected:owner.captureExpectation(),verifyAgainstStream:true});
    const publicationsAfterMatch=publishes.length;
    owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:3000,a:{P:[{s:"BTCUSDT",pa:"3",ep:"60600",ps:"BOTH"}]}},{receivedAt:3001});
    owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:3001,a:{P:[{s:"BTCUSDT",pa:"4",ep:"60700",ps:"BOTH"}]}},{receivedAt:3002});
    const newest=owner.snapshot();
    const oldGuard=owner.guard();
    owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:4000,a:{P:[{s:"BTCUSDT",pa:"0",ep:"0",ps:"BOTH"}]}},{receivedAt:4001});
    owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:4001,a:{P:[{s:"BTCUSDT",pa:"-1",ep:"60800",ps:"BOTH"}]}},{receivedAt:4002});
    const beforeUnchanged={publishes:publishes.length,draws:draws.length};
    const unchanged=owner.ingestStreamAccountUpdate({e:"ACCOUNT_UPDATE",E:4002,a:{P:[{s:"BTCUSDT",pa:"-1",ep:"60800",ps:"BOTH"}]}},{receivedAt:4003});
    return {
      accountUpdateAppliedBeforeRest:initial.changed&&stream.changed&&applies[1].current.qty===2,
      consumersShareRevision:consumerRevisions.length===3&&new Set(consumerRevisions).size===1,
      staleRestCannotRollback:stale.mismatch&&qtyAfterStale===2,
      matchingRestVerifiesWithoutFalsePublish:matching.verified&&publicationsAfterMatch===publicationsBeforeMatch,
      rapidFillsKeepNewest:newest.position.qty===4,
      oldReconstructionGuardRejected:!owner.isGuardCurrent(oldGuard)&&owner.snapshot().position.side==="SHORT",
      unchangedDoesNotPublishOrDraw:!unchanged.changed&&publishes.length===beforeUnchanged.publishes&&draws.length===beforeUnchanged.draws
    };
  }

  createSharedPositionFactOwner.runSelfTests=runSelfTests;
  createSharedPositionFactOwner.factFromRisk=factFromRisk;
  createSharedPositionFactOwner.factFromAccountUpdate=factFromAccountUpdate;
  window.createSharedPositionFactOwner=createSharedPositionFactOwner;
})();
