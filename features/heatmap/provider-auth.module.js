(() => {
  "use strict";

  /* Opaque key name by design: it must not reveal the stored value's purpose in
     diagnostics, copied settings, or DOM. This is local prototype storage only. */
  const STORAGE_SLOT="btc_futures_chart_v13_hmp_v1";
  const listeners=new Set();
  let verification="UNVERIFIED";
  let testing=false;

  function readRecord(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_SLOT)||"null");
      return parsed&&typeof parsed.s==="string"&&parsed.s.trim()?parsed:null;
    }catch(_e){return null;}
  }
  function getCredential(){const record=readRecord();return record?record.s.trim():"";}
  function keyStatus(){
    if(!getCredential())return "NOT CONFIGURED";
    return verification==="REJECTED"?"REJECTED":verification==="UNKNOWN"?"UNKNOWN":"CONFIGURED";
  }
  function snapshot(){return Object.freeze({status:keyStatus(),testing});}
  function notify(){const value=snapshot();listeners.forEach(listener=>{try{listener(value);}catch(_e){}});}
  function subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);}
  function saveFromInput(input){
    const value=input&&typeof input.value==="string"?input.value.trim():"";
    if(!value)return false;
    try{localStorage.setItem(STORAGE_SLOT,JSON.stringify({s:value}));}
    catch(_e){if(input)input.value="";verification="UNKNOWN";notify();return false;}
    if(input)input.value="";
    verification="CONFIGURED";notify();return true;
  }
  function clear(){try{localStorage.removeItem(STORAGE_SLOT);}catch(_e){}verification="UNVERIFIED";testing=false;notify();}
  function markRejected(){if(getCredential()){verification="REJECTED";notify();}}
  function markUnknown(){if(getCredential()){verification="UNKNOWN";notify();}}
  function markConfigured(){if(getCredential()){verification="CONFIGURED";notify();}}
  async function testConnection(){
    const credential=getCredential();
    if(!credential){verification="UNKNOWN";notify();return {ok:false,status:"NOT CONFIGURED",httpStatus:null,reason:"API key not configured"};}
    const config=window.BT001HeatmapProviderConfig.get();
    testing=true;notify();
    try{
      const response=await fetch(`${config.apiBase}/v2/users/me`,{method:"GET",headers:{"Accept":"application/json","Authorization":`Bearer ${credential}`}});
      if(response.status===401||response.status===403){markRejected();return {ok:false,status:"REJECTED",httpStatus:response.status,reason:"Provider authentication rejected"};}
      if(!response.ok){markUnknown();return {ok:false,status:"UNKNOWN",httpStatus:response.status,reason:"Provider connection test failed"};}
      try{await response.json();}catch(_e){markUnknown();return {ok:false,status:"UNKNOWN",httpStatus:response.status,reason:"Provider returned malformed JSON"};}
      markConfigured();return {ok:true,status:"CONFIGURED",httpStatus:response.status,reason:null};
    }catch(_error){markUnknown();return {ok:false,status:"UNKNOWN",httpStatus:null,reason:"Provider request blocked or unavailable"};}
    finally{testing=false;notify();}
  }

  window.BT001HeatmapAuth=Object.freeze({getCredential,keyStatus,snapshot,subscribe,saveFromInput,clear,markRejected,markUnknown,markConfigured,testConnection});
})();
