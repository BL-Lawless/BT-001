"use strict";
const assert=require("assert");
const {pull,STORAGE_BUCKET}=require("./pull-liquidation-heatmap");

(async()=>{
  const times=Array.from({length:289},(_,index)=>1700000000+index*900),prices=Array.from({length:146},(_,index)=>59000+index*10),data=[];
  for(let t=0;t<times.length;t++)for(let p=0;p<prices.length;p++){const value=1+((t*prices.length+p)%9);data.push([String(t),String(p),String(value).padEnd(45,"0")]);}
  const provider=[{success:true,message:"ok",tickSize:10,chartInterval:"15m",start:times[0],end:times.at(-1)+900,liqHeatMap:{data,chartTimeArray:times,priceArray:prices,maxLiqValue:9e44}}],rawBody=JSON.stringify(provider);
  const responses=[
    {ok:true,json:async()=>({data:{id:"run/real",status:"SUCCEEDED",defaultDatasetId:"dataset-real"}})},
    {ok:true,arrayBuffer:async()=>Buffer.from(rawBody)}
  ];
  let upload=null,insert=null;
  const client={storage:{from(bucket){assert.equal(bucket,STORAGE_BUCKET);return {async upload(path,body,options){upload={path,body,options};return {error:null};}};}},from(table){return {async insert(row){insert={table,row};return {error:null};}};}};
  const result=await pull({env:{APIFY_API_KEY:"apify",SUPABASE_URL:"https://example.supabase.co",SUPABASE_ANON_KEY:"anon",BT001_MACHINE_ID:"vm-test",BT001_SYMBOL:"BTCUSDT"},client,now:()=>Date.parse("2026-07-31T12:34:56.789Z"),fetchFn:async()=>responses.shift()});
  assert.equal(upload.body.toString("utf8"),rawBody,"VM upload must preserve the raw response exactly");
  assert.deepEqual(upload.options,{contentType:"application/json",upsert:false});
  assert.equal(insert.row.file_size_bytes,Buffer.byteLength(rawBody));
  assert.equal(insert.row.storage_path,upload.path);
  assert(!Object.prototype.hasOwnProperty.call(insert.row,"cells"));
  assert.equal(insert.row.metadata.rawCellCount,289*146);
  assert.match(result.storagePath,/^BTCUSDT\/3D\/2026\/07\/31\/20260731T123456789Z_run-real\.json$/);
  console.log("liquidation heatmap Storage writer tests: PASS",{cells:data.length,bytes:Buffer.byteLength(rawBody)});
})().catch(error=>{console.error(error);process.exitCode=1;});
