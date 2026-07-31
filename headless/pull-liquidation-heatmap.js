"use strict";

const {createClient}=require("@supabase/supabase-js");
const {loadDotEnv,readConfig,required}=require("./config");
const {validateAndNormalize}=require("../features/heatmap/dataset.module");

const ACTOR_ID="api_merge~coinank-liquidation-heatmap";
const API_BASE="https://api.apify.com/v2";
const DURATION="3D";
const PROVIDER_DURATION="3d";
const TABLE="liquidation_heatmap_snapshots";
const POLL_INTERVAL_MS=4000;
const TIMEOUT_MS=120000;
const TERMINAL_FAILURES=new Set(["FAILED","ABORTED","TIMED-OUT"]);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function requestJson(url,options={},fetchFn=fetch){
  const response=await fetchFn(url,options);
  if(!response.ok)throw new Error(`Apify request failed (HTTP ${response.status})`);
  return response.json();
}

function headers(token,extra={}){
  return {Authorization:`Bearer ${token}`,Accept:"application/json",...extra};
}

async function pull(options={}){
  const env=options.env||process.env,fetchFn=options.fetchFn||fetch,now=options.now||Date.now;
  const baseConfig=readConfig(env),token=required(env,"APIFY_API_KEY");
  const startedAt=now();
  const startedPayload=await requestJson(`${API_BASE}/acts/${ACTOR_ID}/runs`,{
    method:"POST",headers:headers(token,{"Content-Type":"application/json"}),
    body:JSON.stringify({symbol:"BTCUSDT",interval:PROVIDER_DURATION})
  },fetchFn);
  const started=startedPayload&&startedPayload.data,runId=started&&started.id;
  if(!runId)throw new Error("Apify did not return an Actor run ID");
  let completed=started;
  while(String(completed&&completed.status||"").toUpperCase()!=="SUCCEEDED"){
    const status=String(completed&&completed.status||"").toUpperCase();
    if(TERMINAL_FAILURES.has(status))throw new Error(`Apify Actor ended with ${status}`);
    if(now()-startedAt>=TIMEOUT_MS)throw new Error("Apify Actor timed out");
    await delay(POLL_INTERVAL_MS);
    completed=(await requestJson(`${API_BASE}/actor-runs/${encodeURIComponent(runId)}`,{
      headers:headers(token)
    },fetchFn)).data;
  }
  const datasetId=completed.defaultDatasetId||started.defaultDatasetId;
  if(!datasetId)throw new Error("Completed Apify Actor run has no dataset");
  const dataset=await requestJson(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,{
    headers:headers(token)
  },fetchFn);
  if(!Array.isArray(dataset)||!dataset.length)throw new Error("Completed Apify dataset is empty");

  // event_at is captured immediately after the successful dataset response, before normalization
  // and insertion, so it represents retrieval availability rather than database write timing.
  const eventAt=new Date(now()).toISOString();
  const normalized=validateAndNormalize({items:dataset},{symbol:"BTCUSDT",duration:DURATION});
  const row={
    event_at:eventAt,machine_id:baseConfig.machineId,symbol:normalized.metadata.sourceSymbol,
    duration:DURATION,tick_size:normalized.metadata.tickSize,
    chart_interval_seconds:Math.round(normalized.metadata.chartIntervalSeconds),
    cells:normalized.cells,metadata:normalized.metadata,
    provider_run_id:String(runId),provider_dataset_id:String(datasetId)
  };
  const client=options.client||createClient(baseConfig.supabaseUrl,baseConfig.supabaseAnonKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const {error}=await client.from(TABLE).insert(row);
  if(error)throw error;
  return {table:TABLE,eventAt,runId:String(runId),datasetId:String(datasetId),cellCount:normalized.cells.length};
}

async function main(){
  loadDotEnv();
  const result=await pull();
  console.log(`[Heatmap] stored ${result.cellCount} cells from dataset ${result.datasetId}; event_at=${result.eventAt}`);
}

if(require.main===module)main().catch(error=>{console.error("[Heatmap] pull failed",error);process.exitCode=1;});
module.exports={ACTOR_ID,API_BASE,DURATION,PROVIDER_DURATION,TABLE,POLL_INTERVAL_MS,TIMEOUT_MS,pull,requestJson};
