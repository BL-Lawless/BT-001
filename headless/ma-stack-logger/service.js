"use strict";

const crypto=require("crypto");
const {RESULT_KEYS,classifyAll}=require("./classifier.js");
const {mapSnapshotRow}=require("./snapshot-mapper.js");

function createMaStackLoggerService(options={}){
  const config=options.config,feed=options.feed,writer=options.writer,now=options.now||Date.now,randomUUID=options.randomUUID||crypto.randomUUID;
  const setIntervalFn=options.setIntervalFn||setInterval,clearIntervalFn=options.clearIntervalFn||clearInterval,warn=options.warn||console.warn;
  if(!config||!feed||!writer)throw new Error("MA Stack logger service requires config, feed, and writer");
  let timer=null,unsubscribe=null,latest=null,started=false;
  const confirmedKeys=new Set();

  function refresh(){latest=classifyAll(feed,config,now());return latest;}
  function rowsFor(timeframes,batch=refresh()){
    const captureId=randomUUID();
    return timeframes.map(timeframe=>{
      const key=RESULT_KEYS[timeframe];
      return mapSnapshotRow({
        result:batch.results[key],metadata:batch.metadata[key],slots:batch.slots,eventAt:batch.eventAt,captureId,
        machineId:config.machineId,symbol:config.symbol,timeframe
      });
    });
  }
  function confirmedKey(row){return `${row.machine_id}|${row.symbol}|${row.timeframe}|${row.candle_open_at}`;}
  function acceptConfirmedOnce(row){
    if(row.provisional)return true;
    const key=confirmedKey(row);if(confirmedKeys.has(key))return false;
    confirmedKeys.add(key);if(confirmedKeys.size>10000)confirmedKeys.delete(confirmedKeys.values().next().value);return true;
  }
  async function captureProvisional(){
    if(!feed.isReady())return false;
    const rows=rowsFor(config.liveTimeframes).filter(acceptConfirmedOnce);
    if(!rows.length)return true;
    if(rows.some(row=>!row.provisional)){
      const outcomes=[];for(const row of rows)outcomes.push(await writer.write(row));return outcomes.every(value=>value!==false);
    }
    return writer.write(rows);
  }
  async function captureClosed(timeframe){
    if(!config.closedTimeframes.includes(timeframe)||!feed.isReady())return false;
    const row=rowsFor([timeframe])[0];
    if(!acceptConfirmedOnce(row))return true;
    return writer.write(row);
  }
  function handleUpdate(update){
    refresh();
    if(update&&update.type==="kline"&&update.closed===true&&config.closedTimeframes.includes(update.timeframe)){
      captureClosed(update.timeframe).catch(error=>warn("[MA Stack logger] closed-candle write failed",error));
    }
    if(update&&update.type==="reseed"&&update.reason!=="startup"){
      for(const timeframe of update.closedTimeframes||[]){
        if(config.closedTimeframes.includes(timeframe))captureClosed(timeframe).catch(error=>warn("[MA Stack logger] recovered closed-candle write failed",error));
      }
    }
  }
  async function start(){
    if(started)return false;
    started=true;unsubscribe=feed.subscribe(handleUpdate);
    await writer.start();await feed.start();refresh();
    timer=setIntervalFn(()=>captureProvisional().catch(error=>warn("[MA Stack logger] provisional write failed",error)),config.provisionalIntervalMs);
    return true;
  }
  async function stop(){
    if(!started)return;
    if(timer!=null)clearIntervalFn(timer);timer=null;
    if(unsubscribe)unsubscribe();unsubscribe=null;feed.stop();await writer.stop();started=false;
  }
  return Object.freeze({start,stop,refresh,captureProvisional,captureClosed,handleUpdate,status:()=>({started,intervalMs:config.provisionalIntervalMs,hasClassification:!!latest})});
}

module.exports={createMaStackLoggerService};
