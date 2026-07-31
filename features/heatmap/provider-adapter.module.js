(() => {
  "use strict";
  const TABLE="liquidation_heatmap_snapshots";
  class HeatmapProviderError extends Error{
    constructor(code,message,details={}){super(message);this.name="HeatmapProviderError";this.code=code;this.stage=details.stage||"SUPABASE DATASET READ";this.httpStatus=Number.isInteger(details.httpStatus)?details.httpStatus:null;}
  }
  async function run({duration="3D",requestId,isCurrent=()=>true,onStage}={}){
    if(String(duration).toUpperCase()!=="3D")throw new HeatmapProviderError("INVALID_DURATION","VM heatmap duration must be 3D",{stage:"INPUT VALIDATION"});
    if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded");
    const source=window.BT001Supabase;
    if(!source||typeof source.getLatestHeatmapSnapshot!=="function")throw new HeatmapProviderError("SUPABASE_UNAVAILABLE","Supabase heatmap reader is unavailable");
    if(typeof onStage==="function")onStage({stage:"READING SUPABASE"});
    let row;
    try{row=await source.getLatestHeatmapSnapshot("BTCUSDT");}
    catch(error){throw new HeatmapProviderError("SUPABASE_READ_FAILED",error&&error.message||"Heatmap read failed",{httpStatus:error&&error.status});}
    if(!isCurrent(requestId))throw new HeatmapProviderError("STALE_REQUEST","Request was superseded");
    if(!row)throw new HeatmapProviderError("NO_DATASET","No VM heatmap snapshot is available");
    if(!Array.isArray(row.cells)||!row.metadata||typeof row.metadata!=="object")throw new HeatmapProviderError("INVALID_ROW","Latest heatmap row does not contain normalized cells and metadata");
    if(String(row.duration||"").toUpperCase()!=="3D")throw new HeatmapProviderError("INVALID_ROW_DURATION","Latest heatmap row is not the fixed 3D dataset");
    if(typeof onStage==="function")onStage({stage:"SUPABASE DATASET RETRIEVED",datasetId:String(row.id),runId:String(row.provider_run_id||""),rawItemCount:1});
    return {
      normalized:Object.freeze({cells:Object.freeze(row.cells),metadata:Object.freeze(row.metadata),diagnostics:Object.freeze({rawItemCount:1,validCellCount:row.cells.length,normalizedCellCount:row.cells.length,rejectedCellCount:Number(row.metadata.rejectedCellCount)||0,timestampUnit:row.metadata.timestampUnit||null})}),
      duration:String(row.duration).toUpperCase(),eventAt:row.event_at,datasetId:String(row.id),
      runId:String(row.provider_run_id||""),providerDatasetId:String(row.provider_dataset_id||""),table:TABLE
    };
  }
  window.BT001HeatmapProvider=Object.freeze({run,HeatmapProviderError,TABLE});
})();
