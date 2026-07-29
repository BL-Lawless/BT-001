"use strict";

function emaSeries(rows,period){
  const result=new Array(rows.length).fill(null);
  if(rows.length<period)return result;
  let seed=0;
  for(let index=0;index<period;index++)seed+=Number(rows[index].close);
  let value=seed/period;result[period-1]=value;
  const alpha=2/(period+1);
  for(let index=period;index<rows.length;index++){value=Number(rows[index].close)*alpha+value*(1-alpha);result[index]=value;}
  return result;
}

function createScalpMarketHub(options={}){
  const dataSource=options.dataSource,symbol=String(options.symbol||""),timeframes=options.timeframes||["1m","3m","5m","15m"];
  const minimumRows=Math.max(80,Number(options.minimumRows)||80),now=options.now||Date.now;
  if(!dataSource||typeof dataSource.fetchKlines!=="function"||typeof dataSource.connectWebSocket!=="function")throw new Error("A Binance data source is required");
  const closed=new Map(),forming=new Map(),revisions=new Map(),listeners=new Set();
  let socket=null;
  const intervalSeconds=tf=>({"1m":60,"3m":180,"5m":300,"15m":900}[tf]||60);
  function rows(tf,includeForming){
    const values=[...(closed.get(tf)||[])],live=forming.get(tf);
    if(includeForming&&live)values.push(live);
    return values;
  }
  function getAuthoritativeMaSnapshot(tf,request={}){
    const source=rows(tf,request.includeForming===true),periods=[...new Set(request.periods||[9,55])];
    const required=Math.max(Number(request.requiredRows)||minimumRows,Math.max(...periods));
    const alignedByPeriod=Object.fromEntries(periods.map(period=>[period,emaSeries(source,period)]));
    return {reliable:source.length>=required,reason:source.length>=required?"":`warming-${source.length}-of-${required}`,rows:source,alignedByPeriod,valuesByPeriod:Object.fromEntries(periods.map(period=>[period,alignedByPeriod[period].at(-1)]))};
  }
  function getTimeframeRevisions(tf){return {...(revisions.get(tf)||{closedRevision:0,formingRevision:0})};}
  function publish(update){for(const listener of listeners)listener(update);}
  function apply(message){
    if(!message||message.e!=="kline"||message.s!==symbol||!message.k||!timeframes.includes(message.k.i))return false;
    const k=message.k,tf=k.i,row={time:Math.floor(Number(k.t)/1000),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),takerBuyBase:Number(k.V),baseVolume:Number(k.v),quoteVolume:Number(k.q),openTime:Number(k.t),closeTime:Number(k.T),final:k.x===true};
    const revision=revisions.get(tf)||{closedRevision:0,formingRevision:0};
    if(k.x===true){
      const list=closed.get(tf)||[],index=list.findIndex(item=>item.time===row.time);
      if(index>=0)list[index]=row;else list.push(row);
      list.sort((a,b)=>a.time-b.time);while(list.length>minimumRows+25)list.shift();
      closed.set(tf,list);forming.delete(tf);revision.closedRevision+=1;
    }else{forming.set(tf,row);revision.formingRevision+=1;}
    revisions.set(tf,revision);
    publish({type:"kline",tf,closed:k.x===true,closedRevision:revision.closedRevision,formingRevision:revision.formingRevision,exchangeTime:Number(message.E)||now()});
    return true;
  }
  async function start(){
    await Promise.all(timeframes.map(async tf=>{
      const fetched=await dataSource.fetchKlines(tf,now(),minimumRows+1,symbol),step=intervalSeconds(tf),current=[];
      for(const row of fetched){
        const isForming=Number(row.time)*1000+step*1000>now();
        if(isForming)forming.set(tf,{...row,final:false});else current.push({...row,final:true});
      }
      closed.set(tf,current.slice(-(minimumRows+25)));revisions.set(tf,{closedRevision:current.length,formingRevision:forming.has(tf)?1:0});
    }));
    const streams=timeframes.map(tf=>`${symbol.toLowerCase()}@kline_${tf}`).join("/");
    socket=dataSource.connectWebSocket(`${String(options.wsUrl||"wss://fstream.binance.com/market/stream").replace(/\/+$/,"")}?streams=${streams}`,{
      reconnect:true,onMessage:event=>{try{const envelope=JSON.parse(event.data),message=envelope&&envelope.data||envelope;apply(message);}catch(_error){}}
    });
  }
  function stop(){if(socket)socket.disconnect();socket=null;}
  return Object.freeze({start,stop,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},getAuthoritativeMaSnapshot,getTimeframeRevisions,apply});
}

module.exports={createScalpMarketHub,emaSeries};
