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
    if(!row.storage_path||row.raw_payload==null)throw new HeatmapProviderError("INVALID_ROW","Latest heatmap row does not contain a Storage payload pointer and payload");
    if(String(row.duration||"").toUpperCase()!=="3D")throw new HeatmapProviderError("INVALID_ROW_DURATION","Latest heatmap row is not the fixed 3D dataset");
    const dataset=window.BT001HeatmapDataset;
    if(!dataset||typeof dataset.validateAndNormalize!=="function")throw new HeatmapProviderError("NORMALIZER_UNAVAILABLE","Heatmap dataset normalizer is unavailable");
    let normalized;try{normalized=dataset.validateAndNormalize(row.raw_payload,{symbol:"BTCUSDT",duration:"3D"});}
    catch(error){throw new HeatmapProviderError("NORMALIZATION_FAILED",error&&error.message||"Stored heatmap normalization failed");}
    if(typeof onStage==="function")onStage({stage:"SUPABASE STORAGE DATASET RETRIEVED",datasetId:String(row.id),runId:String(row.provider_run_id||""),rawItemCount:normalized.diagnostics.rawItemCount});
    return {
      normalized,
      duration:String(row.duration).toUpperCase(),eventAt:row.event_at,datasetId:String(row.id),
      runId:String(row.provider_run_id||""),providerDatasetId:String(row.provider_dataset_id||""),table:TABLE
    };
  }
  window.BT001HeatmapProvider=Object.freeze({run,HeatmapProviderError,TABLE});
})();
