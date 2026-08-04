"use strict";
const assert=require("assert");
const calculation=require("./calculation.js");
const {createSignalTransitionTracker}=require("./core/signal-transition.js");
const {createSupabaseLogger}=require("../../../headless/supabase-client.js");

const read=(setupAction,marketBias,reason=`reason-${setupAction}`)=>({
  setupAction,reason,marketBias,marketStrength:marketBias,aggregateConfidence:80,timingRisk:20
});
const observe=(tracker,marketRead,index)=>tracker.observe({
  marketRead,eventAt:new Date(index*30000).toISOString(),machineId:"vm-sssc",symbol:"BTCUSDT",snapshotId:index
});

const entryTracker=createSignalTransitionTracker({calculation});
assert.equal(observe(entryTracker,read("WAIT",0),1),null);
assert.equal(observe(entryTracker,read("FRESH LONG",50,"Bullish direction and strength confirmed"),2),null);
const entry=observe(entryTracker,read("FRESH LONG",51,"Bullish direction and strength confirmed"),3);
assert(entry,"a two-snapshot entry transition must confirm");
assert.equal(entry.action,"FRESH LONG");
assert.equal(entry.snapshot_id,3);
assert.equal(observe(entryTracker,read("FRESH LONG",52),4),null,"a continuing entry state must log only once");

const blipTracker=createSignalTransitionTracker({calculation});
assert.equal(observe(blipTracker,read("WAIT",0),1),null);
assert.equal(observe(blipTracker,read("FRESH SHORT",-50),2),null);
assert.equal(observe(blipTracker,read("WAIT",0),3),null,"a one-cycle entry blip must not log");

const exitTracker=createSignalTransitionTracker({calculation});
observe(exitTracker,read("WAIT",0),1);
observe(exitTracker,read("FRESH LONG",50),2);
observe(exitTracker,read("FRESH LONG",50),3);
assert.equal(observe(exitTracker,read("WAIT",-7),4),null,"bias inside the TRIM boundary must not exit");
assert.equal(observe(exitTracker,read("WAIT",-9),5),null);
const exit=observe(exitTracker,read("WAIT",-9),6);
assert(exit,"two snapshots beyond -8 must confirm without waiting for -30");
assert.equal(exit.action,"EXIT LONG");
assert.equal(exit.reason,"Bearish pressure opposes LONG","the signal reason must come from SSSC's TRIM state");
assert.equal(exit.snapshot_id,6);

async function integration(){
  let nextId=40;
  const inserts=[];
  const client={from:table=>({insert(row){
    inserts.push({table,row});
    if(table!=="sssc_snapshots")return Promise.resolve({error:null});
    const id=++nextId;
    return {select(){return {single:async()=>({data:{id},error:null})};}};
  }})};
  const tracker=createSignalTransitionTracker({calculation});
  const supabase=createSupabaseLogger({url:"u",key:"k",machineId:"vm-sssc",client,signalTracker:tracker});
  const snapshot=(setupAction,index)=>({event_at:new Date(index*30000).toISOString(),machine_id:"vm-sssc",symbol:"BTCUSDT",aggregate:read(setupAction,50,"Bullish direction and strength confirmed")});
  supabase.setLatestSnapshot(snapshot("WAIT",1));await supabase.flushSnapshot();
  supabase.setLatestSnapshot(snapshot("FRESH LONG",2));await supabase.flushSnapshot();
  supabase.setLatestSnapshot(snapshot("FRESH LONG",3));await supabase.flushSnapshot();
  const snapshots=inserts.filter(item=>item.table==="sssc_snapshots"),signals=inserts.filter(item=>item.table==="sssc_signals");
  assert.equal(signals.length,1);
  assert.equal(signals[0].row.snapshot_id,43,"signal must reference the snapshot inserted in its confirming cycle");
  assert.equal(signals[0].row.event_at,snapshots[2].row.event_at);
}

integration().then(()=>console.log("SSSC signal transition tests: PASS")).catch(error=>{console.error(error);process.exitCode=1;});
