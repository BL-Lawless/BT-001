"use strict";

const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");

function runtime(extra={}){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError,URLSearchParams,...extra};
  context.window=context;
  vm.createContext(context);
  for(const file of ["features/scalp/config.js","features/scalp/calculations.js","features/scalp/tranche-book.js","features/scalp/exit-decisions.js","features/scalp/simulator-data.js"]){
    vm.runInContext(fs.readFileSync(path.join(repo,file),"utf8"),context,{filename:file});
  }
  return context;
}
function eventRow({time,rank=50,direction="LONG",source="1m",eventType="CROSS",symbol="BTCUSDT",id,metrics=null}){
  const detector_state={source,direction,eventType,candleTime:time,rankValue:rank,eventId:id||`${source}|${direction}|${eventType}|${time}|${rank}`};
  if(metrics){detector_state.raw={fastSlope:metrics.fastSlope,slowSlope:metrics.slowSlope,separation:metrics.separation,previousFastSlope:metrics.previousFastSlope,previousGap:metrics.previousGap};detector_state.rankDiagnostics={relativeVolume:metrics.relativeVolume};}
  return {action:"DETECTION_QUALIFIED",symbol,source_timeframe:source,detector_state};
}
function candle(openTime,{open=100,high=101,low=99,close=100}={}){
  return {openTime,closeTime:openTime+59999,open,high,low,close,volume:1};
}

async function run(){
  const context=runtime(),data=context.__BT001_SCALP_BUILD__.simulatorData,cases={};

  const rows=[
    eventRow({time:1700000000,rank:40,id:"low"}),
    eventRow({time:1700000003,rank:88,symbol:"BTCUSDC",id:"highest"}),
    eventRow({time:1700000007,rank:60,id:"outside-window"}),
    eventRow({time:1700000002,rank:99,direction:"SHORT",id:"other-direction"}),
    eventRow({time:1700000002,rank:77,source:"3m",id:"other-timeframe"})
  ];
  const deduped=JSON.parse(JSON.stringify(data.dedupeEvents(rows)));
  assert.equal(deduped.length,4);assert(deduped.some(row=>row.eventId==="highest"));assert(!deduped.some(row=>row.eventId==="low"));assert(deduped.some(row=>row.eventId==="outside-window"));assert(deduped.some(row=>row.eventId==="other-direction"));assert(deduped.some(row=>row.eventId==="other-timeframe"&&row.sourceTimeframe==="3m"&&row.direction==="LONG"));
  assert(deduped.every(row=>!Object.prototype.hasOwnProperty.call(row,"symbol")),"BTCUSDT/BTCUSDC must not split the event stream");
  cases.candleTimeToleranceDedupeKeepsHighestRank=true;

  const rawMetrics={fastSlope:.2,slowSlope:.05,separation:.1,previousFastSlope:.12,previousGap:-.03,relativeVolume:.5},metricEvent=data.normalizeEvent(eventRow({time:0,rank:80,id:"metric-event",metrics:rawMetrics}));
  for(const [key,value] of Object.entries(rawMetrics))assert.equal(metricEvent[key],value,`${key} must be normalized from detector_state without recomputation`);
  const metricConfig=data.simulationConfig({slopeWeight:2,volumeGateThreshold:1}),computed=data.exploratoryMetrics(metricEvent,metricConfig);assert(Math.abs(computed.effectiveSeparation-.5)<1e-12);assert(Math.abs(computed.volumeGatedAngle-.1)<1e-12);
  const metricCandles=data.normalizeCandles([candle(0),candle(60000,{high:106,low:94})]),metricBase={lot:1,target:5,stop:5,minimumRank:70,direction:"LONG",eventType:"CROSS",sourceTimeframe:"1m",rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}};
  const rawFiltered=data.simulate([metricEvent],metricCandles,{...metricBase,minFastSlope:.15,maxFastSlope:.25,minSlowSlope:.04,maxSlowSlope:.06,minSeparation:.05,maxSeparation:.15,minRelativeVolume:.4,maxRelativeVolume:.6,slopeWeight:2,minEffectiveSeparation:.49,volumeGateThreshold:1,minVolumeGatedAngle:.09});
  assert.equal(rawFiltered.eventsShown,1);assert.equal(rawFiltered.trades.length,1);assert.equal(rawFiltered.trades[0].fastSlope,.2);assert.equal(rawFiltered.trades[0].slowSlope,.05);assert.equal(rawFiltered.trades[0].separation,.1);assert.equal(rawFiltered.trades[0].relativeVolume,.5);assert(Math.abs(rawFiltered.trades[0].effectiveSeparation-.5)<1e-12);assert(Math.abs(rawFiltered.trades[0].volumeGatedAngle-.1)<1e-12);
  assert.equal(data.simulate([metricEvent],metricCandles,{...metricBase,minFastSlope:.21}).eventsShown,0,"raw min/max filters must exclude independently");
  assert.equal(data.simulate([metricEvent],metricCandles,{...metricBase,slopeWeight:1,minEffectiveSeparation:.49}).eventsShown,0,"slope weight must recalculate the effective-separation gate");
  assert.equal(data.simulate([metricEvent],metricCandles,{...metricBase,slopeWeight:2,minEffectiveSeparation:.49,volumeGateThreshold:2,minVolumeGatedAngle:.09}).eventsShown,0,"volume threshold must multiplicatively damp the angle below the gate");
  assert.equal(data.simulate([metricEvent],metricCandles,{...metricBase,minimumRank:81,slopeWeight:2,minEffectiveSeparation:.49}).eventsShown,0,"rank and exploratory filters must combine");
  assert.equal(data.simulate([metricEvent],metricCandles,{...metricBase,minimumRank:0,slopeWeight:2,minEffectiveSeparation:.49}).eventsShown,1,"exploratory filters must work with rank disabled");
  cases.rawAndComputedExploratoryMetricsFilterTogether=true;

  const supabaseRequests=[],supabaseContext=runtime({
    BT001Supabase:{configured:()=>true,getUrl:()=>"https://project.supabase.co",getAnonKey:()=>"anon"},
    restService:{get:async(url,options)=>{supabaseRequests.push({url,options});return [];}}
  }),supabaseData=supabaseContext.__BT001_SCALP_BUILD__.simulatorData;
  await supabaseData.fetchSupabaseEvents();
  assert.equal(supabaseRequests.length,1);assert(supabaseRequests[0].url.includes("/rest/v1/scalp_activity_log?"));assert(supabaseRequests[0].url.includes("DETECTION_QUALIFIED"));assert(supabaseRequests[0].url.includes("detector_state"));assert.equal(supabaseRequests[0].options.headers.apikey,"anon");
  cases.readOnlySupabaseEventFetchUsesExistingCredentials=true;

  const rawEvents=[eventRow({time:0,rank:80,id:"first"})],priceRows=[candle(0),candle(60000,{high:106,low:94}),candle(120000)],calls={events:0,prices:0,args:[]};
  const service=data.create({
    fetchEvents:async()=>{calls.events+=1;return rawEvents;},
    fetchKlinePage:async(...args)=>{calls.prices+=1;calls.args.push(args);return priceRows;},
    now:()=>180000
  });
  assert.equal(calls.events,0);assert.equal(calls.prices,0);assert.equal(service.getCache(),null,"constructing/opening the service must not fetch");
  const firstLoad=await service.loadData({lot:1,target:5,stop:5,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(calls.events,1);assert.equal(calls.prices,1);assert(calls.args.every(args=>args[0]==="1m"&&args[3]==="BTCUSDT"));
  assert.equal(firstLoad.simulation.trades.length,1);assert.equal(firstLoad.simulation.trades[0].exitReason,"PSL");assert.equal(firstLoad.simulation.trades[0].pnlUsd,-5,"same-candle PSL+TP must use the shared PSL-first decision");
  service.recalculate({lot:1,target:5,stop:5,minimumRank:90,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(calls.events,1);assert.equal(calls.prices,1,"recalculation must reuse the session cache");
  await service.loadData({lot:1,target:5,stop:5,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(calls.events,2);assert.equal(calls.prices,2,"explicit Load data must fetch again");
  cases.manualLoadCachesUntilExplicitReload=true;

  const concurrencyEvents=[
    eventRow({time:0,rank:80,direction:"LONG",id:"long-1"}),
    eventRow({time:60,rank:81,direction:"LONG",id:"long-blocked"}),
    eventRow({time:60,rank:82,direction:"SHORT",id:"short-independent"})
  ].map(data.normalizeEvent),concurrencyCandles=data.normalizeCandles([candle(0),candle(60000),candle(120000,{high:106,low:94})]);
  const concurrent=data.simulate(concurrencyEvents,concurrencyCandles,{lot:1,target:5,stop:5,maxConcurrentAutoPositions:1,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(concurrent.trades.length,2);assert.deepEqual(Array.from(concurrent.trades.map(row=>row.direction).sort()),["LONG","SHORT"]);assert(concurrent.skipped.some(row=>row.eventId==="long-blocked"&&row.reason==="TRANCHE_LIMIT"));
  cases.replayUsesSharedPerDirectionConcurrency=true;

  const timeframeEvents=[
    data.normalizeEvent(eventRow({time:0,rank:80,direction:"LONG",source:"1m",id:"tf-1m"})),
    data.normalizeEvent(eventRow({time:0,rank:81,direction:"LONG",source:"3m",id:"tf-3m"}))
  ],timeframeCandles=data.normalizeCandles([candle(0),candle(60000),candle(120000),candle(180000),candle(240000,{high:106,low:94})]);
  const allTimeframes=data.simulate(timeframeEvents,timeframeCandles,{sourceTimeframe:"ANY",lot:1,target:5,stop:5,maxConcurrentAutoPositions:2,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  const onlyThreeMinute=data.simulate(timeframeEvents,timeframeCandles,{sourceTimeframe:"3m",lot:1,target:5,stop:5,maxConcurrentAutoPositions:2,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(allTimeframes.eventsShown,2);assert.equal(onlyThreeMinute.eventsShown,1);assert.equal(onlyThreeMinute.trades.length,1);assert.equal(onlyThreeMinute.trades[0].eventId,"tf-3m");assert.equal(onlyThreeMinute.config.sourceTimeframe,"3m");
  cases.timeframeFilterChangesEligibleSimulationEvents=true;

  const managedEvents=[data.normalizeEvent(eventRow({time:0,rank:95,direction:"LONG",id:"managed"}))],managedCandles=data.normalizeCandles([
    candle(0),
    candle(60000,{high:108,low:99,close:107}),
    candle(120000,{high:116,low:101,close:115})
  ]);
  const managed=data.simulate(managedEvents,managedCandles,{lot:1,target:10,stop:5,profitLockEnabled:true,lockThresholdPct:50,lockPortionPct:50,rankBoostEnabled:true,rankBoostThreshold:90,rankBoostPoints:5,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(managed.trades.length,1);assert.equal(managed.trades[0].rankBoostApplied,true);assert.equal(managed.trades[0].profitLockApplied,true);assert.equal(managed.trades[0].exitPrice,115);assert.equal(managed.trades[0].pnlUsd,11.25);
  cases.replayUsesSharedRankProfitLockAndFeeAwareExitMath=true;

  const unresolved=data.simulate([data.normalizeEvent(eventRow({time:0,rank:75,id:"unresolved"}))],data.normalizeCandles([candle(0)]),{lot:1,target:5,stop:5,rates:{maker:0,taker:0},filters:{tickSize:.1,stepSize:.001}});
  assert.equal(unresolved.trades.length,0);assert.equal(unresolved.diagnostics.endOfDataExcluded,1);
  cases.endOfDataTradesAreExcludedFromOutcomes=true;

  const source=fs.readFileSync(path.join(repo,"features/scalp/simulator-data.js"),"utf8"),html=fs.readFileSync(path.join(repo,"index.html"),"utf8");
  assert(!source.includes("created_at")&&!source.includes("maxDailyAutoLossUsd")&&!source.includes("DAILY_LOSS"));
  assert(source.includes("tranches.canAdd(")&&source.includes("decisions.evaluateProtectionCandle(")&&source.includes("decisions.rankBoost(")&&source.includes("decisions.profitLockDecision(")&&source.includes("calc.feeAwareBreakeven("));
  assert(html.indexOf("features/scalp/simulator-data.js")>html.indexOf("features/scalp/exit-decisions.js")&&html.indexOf("features/scalp/simulator-data.js")<html.indexOf("features/scalp/state-machine.js"));
  cases.noCreatedAtSyncNoDailyCapAndSharedDecisionReuse=true;

  console.log("SCALP simulator data tests: PASS",cases);
  return cases;
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
