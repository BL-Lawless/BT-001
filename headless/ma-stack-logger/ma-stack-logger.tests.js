"use strict";

const assert=require("assert");
const fs=require("fs");
const os=require("os");
const path=require("path");
const vm=require("vm");
const {EventEmitter}=require("events");
const volatility=require("../../features/ma-stack/ma-stack-volatility.js");
const core=require("../../features/ma-stack/ma-stack-core.js");
const {TIMEFRAMES,LIVE_TIMEFRAMES,CLOSED_TIMEFRAMES,readMaStackConfig}=require("./config.js");
const {TF_MS,coreRow,verifyContinuity,normalizeSeed,createMaStackMarketFeed}=require("./market-feed.js");
const {slotsFor,classifyAll}=require("./classifier.js");
const {eventFields,mapSnapshotRow}=require("./snapshot-mapper.js");
const {createMaStackWriter}=require("./supabase-writer.js");
const {createMaStackLoggerService}=require("./service.js");

function candles(timeframe,count=236,start=Date.parse("2026-01-01T00:00:00Z")){
  const step=TF_MS[timeframe];
  return Array.from({length:count},(_,index)=>{
    const base=60000+index*15,openTime=start+index*step;
    return {openTime,open:base-4,high:base+12,low:base-10,close:base,volume:100+index,closeTime:openTime+step-1,quoteVolume:(100+index)*base,final:true};
  });
}

function config(){
  return readMaStackConfig({SUPABASE_URL:"https://example.supabase.co",SUPABASE_ANON_KEY:"anon",MA_STACK_MACHINE_ID:"vm-ma-stack-test"});
}

function fakeFeed(options={}){
  const closed=Object.fromEntries(TIMEFRAMES.map(tf=>[tf,candles(tf,235)])),forming={};
  for(const tf of LIVE_TIMEFRAMES){
    const last=closed[tf].at(-1),step=TF_MS[tf];
    forming[tf]={...last,openTime:last.openTime+step,closeTime:last.closeTime+step,close:last.close+4,final:false};
  }
  const listeners=new Set(),calls=[];
  return {
    calls,closed,forming,
    async start(){return true;},stop(){},isReady(){return true;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    emit(update){for(const listener of listeners)listener(update);},
    getRows(tf,includeForming){calls.push([tf,includeForming]);const rows=closed[tf].map(coreRow);if(includeForming&&forming[tf])rows.push(coreRow(forming[tf]));return rows;},
    candleState(tf){const live=forming[tf]||null,last=closed[tf].at(-1);return {forming:live,closed:last,current:live||last,provisional:!!live};}
  };
}

async function run(){
  const cases={};

  assert.equal(typeof core.classify,"function");assert.equal(typeof core.applyHigherTfAgreement,"function");
  assert.equal(typeof volatility.atrSeries,"function");assert.equal(typeof volatility.adxSeries,"function");
  const monotonic=candles("1m",235).map(coreRow),volatilityResult=volatility.snapshot(monotonic,14,5);
  assert(Number.isFinite(volatilityResult.atr)&&Number.isFinite(volatilityResult.adx)&&Number.isFinite(volatilityResult.adxShadow));assert(Math.abs(volatilityResult.adx-100)<1e-9);
  const classified=core.classify(monotonic,{includeForming:false},{slots:slotsFor([9,21,55,100,200])});
  assert.equal(classified.available,true);assert(Number.isFinite(classified.strength)&&Number.isFinite(classified.quality));
  const browserContext={console,Date,Map,Set};browserContext.window=browserContext;vm.createContext(browserContext);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..","..","features","ma-stack","ma-stack-volatility.js"),"utf8"),browserContext);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..","..","features","ma-stack","ma-stack-core.js"),"utf8"),browserContext);
  const browserClassified=browserContext.__BT001_MA_STACK_BUILD__.core.classify(monotonic,{includeForming:false},{slots:slotsFor([9,21,55,100,200])});
  assert.deepEqual([classified.state,classified.strength,classified.quality,classified.alignment,classified.adx,classified.adxPrevious],[browserClassified.state,browserClassified.strength,browserClassified.quality,browserClassified.alignment,browserClassified.adx,browserClassified.adxPrevious]);
  cases.plainNodeLoadsCoreAndVolatility=true;

  const cfg=config();
  assert.equal(cfg.minimumRows,210,"warmup must be max MA period + 10");assert.equal(cfg.bufferRows,235);
  assert.equal(readMaStackConfig({SUPABASE_URL:"u",SUPABASE_ANON_KEY:"k",MA_STACK_MACHINE_ID:"m",MA_STACK_MA_PERIODS:"1,2,3,4,5"}).minimumRows,28,"ADX warmup must dominate unusually short MA configurations");
  assert.deepEqual(cfg.timeframes,TIMEFRAMES);assert.deepEqual(cfg.liveTimeframes,LIVE_TIMEFRAMES);assert.deepEqual(cfg.closedTimeframes,CLOSED_TIMEFRAMES);
  cases.warmupAndHardcodedTimeframesMatchCore=true;

  const restRows=candles("1m",236),forming={...restRows.at(-1),closeTime:Date.parse("2030-01-01T00:00:00Z")};restRows[restRows.length-1]=forming;
  const seeded=normalizeSeed("1m",restRows,235,Date.parse("2026-01-02T00:00:00Z"));
  assert.equal(seeded.closed.length,235);assert(seeded.forming);assert.equal(verifyContinuity("1m",seeded.closed),true);
  const broken=seeded.closed.slice();broken[10]={...broken[10],openTime:broken[10].openTime+1};
  assert.throws(()=>verifyContinuity("1m",broken),/continuity gap/);
  cases.bootstrapSeparatesFormingAndRejectsGaps=true;

  const sockets=[],reconnectCallbacks=[],feedNow=Date.parse("2027-01-01T00:00:30Z"),fetchCalls=[];
  class FakeSocket extends EventEmitter{
    constructor(url){super();this.url=url;sockets.push(this);}
    ping(){}terminate(){this.emit("close",{code:4000});}close(){this.emit("close",{code:1000});}
  }
  const mockFetch=async url=>{
    const parsed=new URL(url),tf=parsed.searchParams.get("interval"),step=TF_MS[tf],activeOpen=Math.floor(feedNow/step)*step,start=activeOpen-235*step;
    fetchCalls.push(tf);
    const data=Array.from({length:236},(_,index)=>{const openTime=start+index*step,base=50000+index;return [openTime,String(base),String(base+10),String(base-10),String(base+2),"100",openTime+step-1,"5000000",100,"50","2500000"];});
    return {ok:true,async json(){return data;}};
  };
  const ownedFeed=createMaStackMarketFeed({symbol:"BTCUSDT",timeframes:TIMEFRAMES,bufferRows:235,fetch:mockFetch,WebSocket:FakeSocket,now:()=>feedNow,
    setTimeoutFn:fn=>{reconnectCallbacks.push(fn);return reconnectCallbacks.length;},clearTimeoutFn:()=>{},setIntervalFn:()=>1,clearIntervalFn:()=>{},log:()=>{},warn:()=>{}});
  await ownedFeed.start();assert.equal(fetchCalls.length,8);assert.equal(sockets.length,1);assert(TIMEFRAMES.every(tf=>sockets[0].url.includes(`btcusdt@kline_${tf}`)));assert.equal(ownedFeed.isReady(),false);
  sockets[0].emit("open");assert.equal(ownedFeed.isReady(),true);sockets[0].emit("close",{code:1006});assert.equal(reconnectCallbacks.length,1);
  reconnectCallbacks.shift()();assert.equal(sockets.length,2);sockets[1].emit("open");
  for(let index=0;index<4;index++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetchCalls.length,16);assert.equal(ownedFeed.isReady(),true);ownedFeed.stop();
  cases.feedOwnsAllStreamsAndReseedsAfterReconnect=true;

  const feed=fakeFeed(),batch=classifyAll(feed,cfg,Date.parse("2026-01-02T00:00:00Z"));
  assert.equal(Object.keys(batch.results).length,8);assert.equal(feed.calls.length,8);
  assert.equal(batch.results["1m"].provisional,true);assert.equal(batch.results["1H"].provisional,false);
  assert(Number.isFinite(batch.results["1m"].spreadPct));assert(Number.isFinite(batch.results["1m"].spreadAtr));assert(Number.isInteger(batch.results["1m"].spreadScore));
  assert.equal(typeof batch.results["1m"].spreadLabel,"string");assert(["compression","expanding","contracting","balanced"].includes(batch.results["1m"].spreadCondition));
  cases.allEightClassifiedAndHigherTfPassApplied=true;
  cases.structuredSpreadFieldsAreAdditive=true;

  const slots=slotsFor(cfg.maPeriods),failed={type:"failed crossover",dir:-1,ref:"MA1/MA2",pairClass:"adjacent",age:0,time:Date.now()};
  const failedFields=eventFields(failed,slots);assert.equal(failedFields.ma_event_direction_raw,-1);assert.equal(failedFields.ma_event_outcome_direction,"bullish");
  const normalFields=eventFields({...failed,type:"crossover"},slots);assert.equal(normalFields.ma_event_outcome_direction,"bearish");
  cases.failedCrossoverOutcomeIsInverted=true;

  const mapped=mapSnapshotRow({result:batch.results["1m"],metadata:batch.metadata["1m"],slots,eventAt:batch.eventAt,captureId:"00000000-0000-4000-8000-000000000001",machineId:cfg.machineId,symbol:cfg.symbol,timeframe:"1m"});
  assert.equal(mapped.provisional,true);assert.equal(typeof mapped.led_ma1,"boolean");assert.equal(typeof mapped.led_ma5,"boolean");assert.equal(mapped.spread_score,batch.results["1m"].spreadScore);
  const unavailable=core.unavailable("fixture unavailable",false),unavailableRow=mapSnapshotRow({result:unavailable,metadata:batch.metadata["1H"],slots,eventAt:batch.eventAt,captureId:"00000000-0000-4000-8000-000000000002",machineId:cfg.machineId,symbol:cfg.symbol,timeframe:"1h"});
  assert.equal(unavailableRow.available,false);assert.equal(unavailableRow.unavailable_reason,"fixture unavailable");assert.equal(unavailableRow.strength,null);assert.equal(unavailableRow.adx,null);
  cases.mapperPreservesLedsAndUnavailableState=true;

  const writes=[],timers=[];
  const writer={async start(){},async stop(){},async write(rows){writes.push(Array.isArray(rows)?rows:[rows]);return true;}};
  const cadenceFeed=fakeFeed(),service=createMaStackLoggerService({config:cfg,feed:cadenceFeed,writer,now:()=>Date.parse("2026-01-02T00:00:00Z"),randomUUID:()=>"00000000-0000-4000-8000-000000000003",setIntervalFn:fn=>{timers.push(fn);return 1;},clearIntervalFn:()=>{}});
  await service.start();assert.equal(timers.length,1);
  await timers[0]();assert.equal(writes.length,1);assert.deepEqual(writes[0].map(row=>row.timeframe),LIVE_TIMEFRAMES);assert(writes[0].every(row=>row.provisional));
  cadenceFeed.emit({type:"kline",timeframe:"1m",closed:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,1,"fast close must not create a second write path");
  cadenceFeed.emit({type:"kline",timeframe:"1h",closed:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,2);assert.deepEqual(writes[1].map(row=>row.timeframe),["1h"]);assert.equal(writes[1][0].provisional,false);
  assert(cadenceFeed.calls.length>=32,"each trigger must classify all eight timeframes");await service.stop();
  cases.timerAndCloseCadencesAreDisjointAndClassifyAllEight=true;

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ma-stack-writer-")),spoolPath=path.join(temp,"spool.jsonl");
  let failing=true,insertCalls=0;
  const client={from(table){assert.equal(table,"ma_stack_snapshots");return {async insert(){insertCalls+=1;return failing?{error:new Error("offline")}:{error:null};}};}};
  const durable=createMaStackWriter({client,table:"ma_stack_snapshots",spoolPath,attempts:3,baseDelayMs:1,sleep:async()=>{},warn:()=>{}});
  await durable.start();const failedWrite=await durable.write({id:"spooled"});assert.equal(failedWrite,false);assert.equal(insertCalls,3);assert(fs.readFileSync(spoolPath,"utf8").includes("spooled"));
  failing=false;assert.equal(await durable.write({id:"current"}),true);assert.equal(fs.readFileSync(spoolPath,"utf8"),"");await durable.stop();
  const duplicateWriter=createMaStackWriter({client:{from(){return {async insert(){return {error:{code:"23505",message:"confirmed duplicate"}};}};}},table:"ma_stack_snapshots",spoolPath,attempts:1,warn:()=>{}});
  await duplicateWriter.start();assert.equal(await duplicateWriter.write({id:"confirmed",provisional:false}),true);assert.equal(fs.readFileSync(spoolPath,"utf8"),"");await duplicateWriter.stop();
  fs.rmSync(temp,{recursive:true,force:true});
  cases.writerRetriesSpoolsAndRecovers=true;

  console.log("Independent MA Stack VM logger tests: PASS",cases);
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
