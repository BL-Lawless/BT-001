"use strict";

const assert=require("assert");
const {
  readMonitorConfig,evaluateHeartbeat,evaluateSignalBHeartbeat,evaluateMaStackHeartbeat,MA_STACK_TIMEFRAMES,createSupabaseSnapshotReader,
  checkSystemdServices,runMonitorOnce,report
}=require("./monitor-heartbeat.js");

function snapshot(at,value=1){
  return {
    created_at:new Date(at).toISOString(),event_at:new Date(at-100).toISOString(),
    machine_id:"vm-btc-sig-logger",symbol:"BTCUSDT",
    timeframes:{"1m":{available:true,atr:value,direction:1}},
    aggregate:{marketBias:value,aggregateConfidence:75}
  };
}

function sigBSnapshot(at,value=1){return {created_at:new Date(at).toISOString(),event_at:new Date(at-100).toISOString(),machine_id:"vm-btc-sig-logger",symbol:"BTCUSDT",direction:"LONG",entry_state:"WATCHING",confidence:60+value,setup_score:value,hard_gates:{passed:[String(value)]},flow_effectiveness:{effective:value%2===0},signal_output:{readinessScore:value}};}

function maStackSnapshot(timeframe,at,value=1){return {created_at:new Date(at).toISOString(),event_at:new Date(at-100).toISOString(),candle_open_at:new Date(at-value*60000).toISOString(),machine_id:"vm-btc-sig-logger",symbol:"BTCUSDT",timeframe,available:true,state:"up",phase:`phase-${value}`,selected_regime:"bullish",setup_direction:1,strength:60+value,quality:70+value,alignment_pct:100,adx:25+value,adx_shadow_5:20+value,led_ma1:true,led_ma2:true,led_ma3:true,led_ma4:true,led_ma5:true,spread_pct:value,spread_atr:value,spread_score:50+value,spread_label:"Balanced Spread",spread_condition:"expanding",ma_event_type:null,ma_event_pair:null,ma_event_outcome_direction:null,ma_event_age_candles:null};}

function healthyMaStackRows(at){return MA_STACK_TIMEFRAMES.flatMap(tf=>Array.from({length:8},(_,index)=>maStackSnapshot(tf,at-index*30000,index+1)));}

function fakeClient(rows,error=null){
  const calls=[];
  const query={
    select(value){calls.push(["select",value]);return this;},
    eq(column,value){calls.push(["eq",column,value]);return this;},
    order(column,value){calls.push(["order",column,value]);return this;},
    limit(value){calls.push(["limit",value]);return Promise.resolve({data:rows,error});}
  };
  return {calls,from(table){calls.push(["from",table]);return query;}};
}

function fakeMonitorClient(snapshotRows,sigBRows=Array.from({length:8},(_,index)=>sigBSnapshot(Date.now()-index*30000,index+1)),maStackRows=healthyMaStackRows(Date.now())){
  const inserts=[],unresolved=[],calls=[];
  return {
    inserts,calls,
    from(table){
      calls.push(["from",table]);
      const filters={};
      return {
        select(value){calls.push(["select",table,value]);return this;},
        eq(column,value){filters[column]=value;return this;},
        in(column,value){filters[column]=value;return this;},
        is(column,value){filters[column]=value;return this;},
        gte(column,value){filters[column]=value;return this;},
        order(){return this;},
        limit(){
          if(table==="sssc_snapshots")return Promise.resolve({data:snapshotRows,error:null});
          if(table==="sig_b_snapshots")return Promise.resolve({data:sigBRows,error:null});
          if(table==="ma_stack_snapshots")return Promise.resolve({data:maStackRows.filter(row=>!filters.timeframe||row.timeframe===filters.timeframe),error:null});
          const match=unresolved.find(row=>row.machine_id===filters.machine_id&&row.check_name===filters.check_name);
          return Promise.resolve({data:match?[match]:[],error:null});
        },
        insert(row){
          inserts.push(row);
          unresolved.push({id:`incident-${inserts.length}`,created_at:new Date().toISOString(),...row});
          return Promise.resolve({error:null});
        }
      };
    }
  };
}

async function run(){
  const cases={},now=Date.parse("2026-07-30T12:00:00.000Z");
  const config=readMonitorConfig({SUPABASE_URL:"https://example.supabase.co/",SUPABASE_ANON_KEY:"anon"});
  assert.equal(config.machineId,"vm-btc-sig-logger");assert.equal(config.staleMs,180000);assert.equal(config.frozenRows,8);
  assert.equal(config.sigBStaleMs,180000);assert.equal(config.sigBFrozenRows,8);
  assert.equal(config.maStackFastStaleMs,90000);assert.equal(config.maStackSlowGraceMs,180000);assert.equal(config.maStackFrozenRows,8);
  assert.equal(config.incidentDedupeMs,21600000);
  cases.monitorDefaultsMatchVmCadence=true;

  const healthyRows=Array.from({length:8},(_,index)=>snapshot(now-index*30000,index+1));
  const healthy=evaluateHeartbeat({
    rows:healthyRows,services:[{name:"sssc-logger",active:true},{name:"scalp-signal-logger",active:true}],
    machineId:config.machineId,staleMs:config.staleMs,frozenRows:config.frozenRows,now
  });
  assert.equal(healthy.healthy,true);assert.deepEqual(healthy.incidents,[]);
  cases.healthySnapshotAndServicesDoNotAlert=true;

  const stale=evaluateHeartbeat({
    rows:[snapshot(now-180001,1)],services:[],machineId:config.machineId,
    staleMs:180000,frozenRows:8,now
  });
  assert(stale.incidents.some(item=>item.code==="SSSC_STALE"));
  cases.staleLatestSnapshotAlerts=true;

  const frozen=evaluateHeartbeat({
    rows:Array.from({length:8},(_,index)=>snapshot(now-index*30000,42)),
    services:[],machineId:config.machineId,staleMs:180000,frozenRows:8,now
  });
  assert(frozen.incidents.some(item=>item.code==="SSSC_FROZEN_DUPLICATES"));
  cases.frozenCalculatedPayloadAlertsEvenWhileRowsAdvance=true;

  const sigBHealthy=Array.from({length:8},(_,index)=>sigBSnapshot(now-index*30000,index+1));
  assert.equal(evaluateSignalBHeartbeat({rows:sigBHealthy,machineId:config.machineId,staleMs:180000,frozenRows:8,now}).healthy,true);
  const frozenSigB=Array.from({length:8},(_,index)=>{const row=sigBSnapshot(now-index*30000,42);row.signal_output.comparisonDiagnostics={publicationGeneration:index+1};row.signal_output.__engineToken=`token-${index}`;return row;});
  assert(evaluateSignalBHeartbeat({rows:frozenSigB,machineId:config.machineId,staleMs:180000,frozenRows:8,now}).incidents.some(item=>item.code==="SIGB_FROZEN_DUPLICATES"));
  cases.sigBStalenessAndFrozenPayloadChecksMatchSsscPattern=true;

  const maHealthy=evaluateMaStackHeartbeat({rows:healthyMaStackRows(now),machineId:config.maStackMachineId,fastStaleMs:90000,slowGraceMs:180000,frozenRows:8,now});
  assert.equal(maHealthy.healthy,true);
  const maStaleRows=healthyMaStackRows(now).filter(row=>row.timeframe!=="1h");maStaleRows.push(maStackSnapshot("1h",now-3600000-180001,1));
  assert(evaluateMaStackHeartbeat({rows:maStaleRows,machineId:config.maStackMachineId,fastStaleMs:90000,slowGraceMs:180000,frozenRows:8,now}).incidents.some(item=>item.code==="MA_STACK_STALE"&&item.timeframe==="1h"));
  const withoutDaily=healthyMaStackRows(now).filter(row=>row.timeframe!=="1d");
  assert(!evaluateMaStackHeartbeat({rows:withoutDaily,startedAt:new Date(now).toISOString(),machineId:config.maStackMachineId,fastStaleMs:90000,slowGraceMs:180000,frozenRows:8,now}).incidents.some(item=>item.code==="MA_STACK_NO_ROWS"&&item.timeframe==="1d"));
  assert(evaluateMaStackHeartbeat({rows:withoutDaily,startedAt:new Date(now).toISOString(),machineId:config.maStackMachineId,fastStaleMs:90000,slowGraceMs:180000,frozenRows:8,now:now+86400000+180001}).incidents.some(item=>item.code==="MA_STACK_NO_ROWS"&&item.timeframe==="1d"));
  const frozenMa=healthyMaStackRows(now).map(row=>row.timeframe==="1m"?{...maStackSnapshot("1m",Date.parse(row.created_at),42),candle_open_at:row.candle_open_at}:row);
  assert(evaluateMaStackHeartbeat({rows:frozenMa,machineId:config.maStackMachineId,fastStaleMs:90000,slowGraceMs:180000,frozenRows:8,now}).incidents.some(item=>item.code==="MA_STACK_FROZEN_DUPLICATES"&&item.timeframe==="1m"));
  cases.maStackDualCadenceAndFrozenPayloadChecks=true;

  const down=evaluateHeartbeat({
    rows:healthyRows,services:[{name:"sssc-logger",active:true,status:"active"},{name:"scalp-signal-logger",active:false,status:"failed"}],
    machineId:config.machineId,staleMs:180000,frozenRows:8,now
  });
  assert(down.incidents.some(item=>item.code==="SERVICE_DOWN"&&item.service==="scalp-signal-logger"));
  cases.systemdDownAlertsWithoutUsingSignalCadence=true;

  const client=fakeClient(healthyRows),reader=createSupabaseSnapshotReader({client,url:"u",key:"k"});
  assert.equal((await reader.latest(config.machineId,8)).length,8);
  assert.deepEqual(client.calls.find(call=>call[0]==="eq"),["eq","machine_id","vm-btc-sig-logger"]);
  cases.supabaseQueryIsMachineScopedAndReadOnly=true;

  const serviceStates=checkSystemdServices({
    services:["sssc-logger","scalp-signal-logger"],
    spawnSync:(_command,args)=>({status:args[1]==="sssc-logger"?0:3,stdout:args[1]==="sssc-logger"?"active\n":"failed\n"})
  });
  assert.deepEqual(serviceStates.map(item=>item.active),[true,false]);
  cases.systemdStatusIsMockable=true;

  const incidentClient=fakeMonitorClient([snapshot(now-180001,7)],sigBHealthy,healthyMaStackRows(now));
  const incidentConfig={...config,checkSystemd:false};
  const firstIncident=await runMonitorOnce({config:incidentConfig,client:incidentClient,now:()=>now});
  assert(firstIncident.incidentWrites.some(item=>item.inserted));
  assert.equal(incidentClient.inserts.length,1);
  assert.deepEqual(incidentClient.inserts[0],{
    machine_id:"vm-btc-sig-logger",check_name:"sssc_stale",severity:"error",
    detail:{
      ageMs:180001,checked_at:"2026-07-30T12:00:00.000Z",code:"SSSC_STALE",
      lastRowAt:"2026-07-30T11:56:59.999Z",
      message:"Latest SSSC snapshot is stale (180s old; limit 180s)"
    }
  });
  const repeatedIncident=await runMonitorOnce({config:incidentConfig,client:incidentClient,now:()=>now+60000});
  assert(repeatedIncident.incidentWrites.some(item=>item.deduplicated));
  assert.equal(incidentClient.inserts.length,1,"an ongoing unresolved incident must not insert every minute");
  cases.incidentInsertIsStructuredAndRepeatedIncidentIsDeduplicated=true;

  const queryFailure=await runMonitorOnce({
    config:{...config,checkSystemd:false},
    reader:{latest:async()=>{throw new Error("network unavailable");},latestSignalB:async()=>sigBHealthy},now:()=>now
  });
  assert(queryFailure.incidents.some(item=>item.code==="SUPABASE_QUERY_FAILED"));
  assert(!queryFailure.incidents.some(item=>item.code==="SSSC_NO_ROWS"),"query failure must not be misreported as proof that no rows exist");
  const alerts=[];assert.equal(report(queryFailure,{error:line=>alerts.push(line)}),1);assert(alerts.length>=1);
  cases.queryFailureIsActionableAndExitsNonzero=true;

  console.log("VM logger heartbeat monitor tests: PASS",cases);
}

module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
