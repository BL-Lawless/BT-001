"use strict";

const {createClient}=require("@supabase/supabase-js");
const {loadDotEnv,readConfig,required}=require("./config");

const ACTOR_ID="api_merge~coinank-liquidation-heatmap";
const API_BASE="https://api.apify.com/v2";
const DURATION="3D";
const PROVIDER_DURATION="3d";
const TABLE="liquidation_heatmap_snapshots";
const STORAGE_BUCKET="liquidation-heatmaps";
const POLL_INTERVAL_MS=4000;
const TIMEOUT_MS=120000;
const TERMINAL_FAILURES=new Set(["FAILED","ABORTED","TIMED-OUT"]);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function requestJson(url,options={},fetchFn=fetch){
  const response=await fetchFn(url,options);
  if(!response.ok)throw new Error(`Apify request failed (HTTP ${response.status})`);
  return response.json();
}
async function requestRawJson(url,options={},fetchFn=fetch){
  const response=await fetchFn(url,options);
  if(!response.ok)throw new Error(`Apify request failed (HTTP ${response.status})`);
  const body=Buffer.from(await response.arrayBuffer()),text=body.toString("utf8");
  let value;try{value=JSON.parse(text);}catch(_error){throw new Error("Apify dataset response was not valid JSON");}
  return {body,value};
}

function intervalSeconds(value){const match=String(value||"").trim().match(/^(\d+(?:\.\d+)?)([smhd])$/i);if(!match)return Number(value)||0;return Number(match[1])*({s:1,m:60,h:3600,d:86400})[match[2].toLowerCase()];}
function storagePath(eventAt,runId){const date=new Date(eventAt),day=date.toISOString().slice(0,10).replace(/-/g,"/"),stamp=date.toISOString().replace(/[-:.]/g,"");return `BTCUSDT/3D/${day}/${stamp}_${String(runId).replace(/[^a-z0-9_-]/gi,"-")}.json`;}

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
  const rawDataset=await requestRawJson(`${API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,{
    headers:headers(token)
  },fetchFn);
  const dataset=rawDataset.value;
  if(!Array.isArray(dataset)||!dataset.length)throw new Error("Completed Apify dataset is empty");

  // Preserve the provider response byte-for-byte. The browser owns normalization through the
  // existing heatmap dataset module; the VM only extracts small indexing metadata for the row.
  const eventAt=new Date(now()).toISOString();
  const item=dataset[0]||{},heatmap=item.liqHeatMap||{},path=storagePath(eventAt,runId),file=rawDataset.body;
  const tickSize=Number(item.tickSize),chartIntervalSeconds=intervalSeconds(item.chartInterval);
  const metadata={
    sourceSymbol:"BTCUSDT",sourceDuration:DURATION,providerMessage:item.message||null,
    datasetStart:item.start??null,datasetEnd:item.end??null,
    rawCellCount:Array.isArray(heatmap.data)?heatmap.data.length:0,
    chartTimeCount:Array.isArray(heatmap.chartTimeArray)?heatmap.chartTimeArray.length:0,
    priceCount:Array.isArray(heatmap.priceArray)?heatmap.priceArray.length:0,
    maxLiqValue:Number(heatmap.maxLiqValue)||null
  };
  const client=options.client||createClient(baseConfig.supabaseUrl,baseConfig.supabaseAnonKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const {error:uploadError}=await client.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:"application/json",upsert:false});
  if(uploadError)throw uploadError;
  const row={
    event_at:eventAt,machine_id:baseConfig.machineId,symbol:"BTCUSDT",
    duration:DURATION,tick_size:tickSize,
    chart_interval_seconds:Math.round(chartIntervalSeconds),metadata,
    storage_path:path,file_size_bytes:file.byteLength,
    provider_run_id:String(runId),provider_dataset_id:String(datasetId)
  };
  const {error}=await client.from(TABLE).insert(row);
  if(error)throw error;
  return {table:TABLE,bucket:STORAGE_BUCKET,storagePath:path,fileSizeBytes:file.byteLength,eventAt,runId:String(runId),datasetId:String(datasetId),cellCount:metadata.rawCellCount};
}

async function main(){
  loadDotEnv();
  const result=await pull();
  console.log(`[Heatmap] uploaded ${result.fileSizeBytes} bytes (${result.cellCount} cells) to ${result.bucket}/${result.storagePath}; event_at=${result.eventAt}`);
}

if(require.main===module)main().catch(error=>{console.error("[Heatmap] pull failed",error);process.exitCode=1;});
module.exports={ACTOR_ID,API_BASE,DURATION,PROVIDER_DURATION,TABLE,STORAGE_BUCKET,POLL_INTERVAL_MS,TIMEOUT_MS,pull,requestJson,requestRawJson,storagePath,intervalSeconds};
