"use strict";

function createLoggerRunner(options={}){
  const component=options.component;
  if(!component)throw new Error("A logger component is required");
  const dataSource=options.dataSource||null;
  const captureIntervalMs=Number(options.captureIntervalMs)||0;
  const warn=typeof options.warn==="function"?options.warn:console.warn;
  let started=false,timer=null;
  function capture(){
    if(typeof component.capture!=="function")return false;
    try{return component.capture();}catch(error){warn("[Headless runner] Capture failed",error);return false;}
  }
  async function start(){
    if(started)return;
    started=true;
    if(dataSource&&typeof dataSource.start==="function")await dataSource.start();
    if(typeof component.start==="function")await component.start();
    if(captureIntervalMs>0&&typeof component.capture==="function")timer=setInterval(capture,captureIntervalMs);
  }
  async function stop(){
    if(!started)return;
    if(timer!=null)clearInterval(timer);timer=null;
    if(typeof component.stop==="function")await component.stop();
    if(dataSource&&typeof dataSource.stop==="function")await dataSource.stop();
    started=false;
  }
  function logActivity(...args){
    if(typeof component.logActivity!=="function")throw new Error("Logger component does not accept activity events");
    return component.logActivity(...args);
  }
  function logTrade(...args){
    if(typeof component.logTrade!=="function")throw new Error("Logger component does not accept trade events");
    return component.logTrade(...args);
  }
  return Object.freeze({start,stop,capture,logActivity,logTrade,status:()=>Object.freeze({started,captureIntervalMs})});
}

function installProcessShutdown(runner,processLike=process){
  let stopping=false;
  const stop=async signal=>{
    if(stopping)return;
    stopping=true;
    try{await runner.stop();}finally{if(signal&&typeof processLike.exit==="function")processLike.exit(0);}
  };
  processLike.once("SIGINT",()=>stop("SIGINT"));
  processLike.once("SIGTERM",()=>stop("SIGTERM"));
  return stop;
}

module.exports={createLoggerRunner,installProcessShutdown};
