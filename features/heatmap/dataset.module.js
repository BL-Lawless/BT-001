(() => {
  "use strict";

  class HeatmapDatasetError extends Error {
    constructor(message,diagnostics={},stage="DATASET VALIDATION FAILED"){super(message);this.name="HeatmapDatasetError";this.code="INVALID_DATASET";this.stage=stage;this.diagnostics=diagnostics;}
  }
  const finite=value=>Number.isFinite(Number(value));
  const number=value=>Number(value);
  function timestampUnit(value){
    if(value instanceof Date)return "milliseconds";
    if(typeof value==="string"&&!/^\s*-?\d+(?:\.\d+)?\s*$/.test(value))return Number.isFinite(Date.parse(value))?"ISO":"invalid";
    const n=Math.abs(Number(value));
    if(!Number.isFinite(n))return "invalid";
    if(n>1e14)return "microseconds";
    if(n>1e11)return "milliseconds";
    return "seconds";
  }
  function timestamp(value){
    const unit=timestampUnit(value);
    if(unit==="ISO")return Date.parse(value)/1000;
    let n=value instanceof Date?value.getTime():Number(value);
    if(!Number.isFinite(n))return NaN;
    if(unit==="microseconds")n/=1000000;
    else if(unit==="milliseconds")n/=1000;
    return n;
  }
  function intervalSeconds(value){
    if(finite(value)){const n=number(value);return n>100000?n/1000:n;}
    const match=/^\s*(\d+(?:\.\d+)?)\s*([mhdw])\s*$/i.exec(String(value||""));
    if(!match)return NaN;
    return number(match[1])*({m:60,h:3600,d:86400,w:604800})[match[2].toLowerCase()];
  }
  function median(values){
    const sorted=values.filter(v=>finite(v)&&number(v)>0).map(number).sort((a,b)=>a-b);
    if(!sorted.length)return NaN;const mid=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }
  function percentile(sorted,p){
    if(!sorted.length)return 0;const pos=Math.max(0,Math.min(sorted.length-1,(sorted.length-1)*p));
    const lo=Math.floor(pos),hi=Math.ceil(pos),f=pos-lo;return sorted[lo]+(sorted[hi]-sorted[lo])*f;
  }
  function rawItems(payload){
    if(payload&&Array.isArray(payload.items))return payload.items;
    return Array.isArray(payload)?payload:[payload];
  }
  const CORE_FIELDS=Object.freeze(["chartTimeArray","priceArray","data"]);
  const JSON_PAYLOAD_KEYS=new Set(["output","result","payload","body","response","content","dataset","data","item","value","raw"]);
  const REFERENCE_KEYS=/^(?:url|href|downloadUrl|outputUrl|fileUrl|resourceUrl|keyValueStoreUrl)$/i;
  const MAX_SEARCH_DEPTH=8,MAX_SEARCH_NODES=800,MAX_ARRAY_CHILDREN=100,MAX_JSON_CHARS=50*1024*1024;
  const plainObject=value=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.prototype.toString.call(value)==="[object Object]";
  const valueType=value=>Array.isArray(value)?"array":value===null?"null":typeof value;
  const safeKeys=value=>plainObject(value)?Object.keys(value).slice(0,40):[];
  function plausibleJsonString(value,key,isArrayItem){
    if(typeof value!=="string"||!value.trim()||value.length>MAX_JSON_CHARS)return false;
    const trimmed=value.trim(),bracketed=trimmed[0]==="{"||trimmed[0]==="[";
    if(!bracketed)return false;
    return isArrayItem||JSON_PAYLOAD_KEYS.has(String(key||""))||CORE_FIELDS.some(field=>value.includes(`"${field}"`));
  }
  function payloadStructure(items){
    const item=items.find(value=>value!=null),topKeys=safeKeys(item),records=[],jsonLikePaths=[],referencePaths=[];let maxDepth=0,nodeCount=0;
    const seen=new Set();
    function inspect(value,path,depth,key,isArrayItem){
      if(nodeCount>=120||depth>4)return;maxDepth=Math.max(maxDepth,depth);nodeCount++;
      const record={path,type:valueType(value)};
      if(Array.isArray(value))record.length=value.length;
      else if(plainObject(value))record.keys=safeKeys(value);
      else if(typeof value==="string"){
        record.jsonLike=plausibleJsonString(value,key,isArrayItem);
        record.urlLike=/^https?:\/\//i.test(value.trim());
        if(record.jsonLike)jsonLikePaths.push(path);
        if(record.urlLike||REFERENCE_KEYS.test(String(key||"")))referencePaths.push(path);
      }
      records.push(record);
      if(depth>=4)return;
      if(Array.isArray(value))for(let i=0;i<Math.min(value.length,20);i++){const child=value[i];if(child&&typeof child==="object"||typeof child==="string")inspect(child,`${path}[${i}]`,depth+1,String(i),true);}
      else if(plainObject(value)&&!seen.has(value)){
        seen.add(value);
        for(const childKey of Object.keys(value).slice(0,40)){const child=value[childKey];if(child&&typeof child==="object"||typeof child==="string")inspect(child,`${path}.${childKey}`,depth+1,childKey,false);}
      }
    }
    inspect(item,"datasetItems[0]",0,"0",true);
    const summary=`Top-level type: ${valueType(item)}; keys: ${topKeys.join(", ")||"none"}; inspected depth: ${maxDepth}; JSON-like strings: ${jsonLikePaths.length}; output references: ${referencePaths.length}`;
    return Object.freeze({topLevelType:valueType(item),topLevelKeys:Object.freeze(topKeys),maxInspectedDepth:maxDepth,inspectedNodeCount:nodeCount,jsonLikeStringPaths:Object.freeze(jsonLikePaths),referencePaths:Object.freeze(referencePaths),records:Object.freeze(records.map(record=>Object.freeze(record))),summary});
  }
  function findHeatmapObject(payload){
    const items=rawItems(payload);const seen=new Set();const candidates=[],decodedStrings=[],jsonDecodeFailures=[],inspectedPaths=[];let inspectedNodeCount=0,stop=false;
    const metadataKeys=["tickSize","chartInterval","start","end","datasetStartTime","datasetEndTime","sourceSymbol","symbol","sourceInterval","interval","duration"];
    function walk(value,path,depth,inherited={},key="",isArrayItem=false){
      if(stop||value==null||depth>MAX_SEARCH_DEPTH||inspectedNodeCount>=MAX_SEARCH_NODES)return;
      inspectedNodeCount++;inspectedPaths.push(path);
      if(typeof value==="string"){
        if(!plausibleJsonString(value,key,isArrayItem))return;
        try{
          const decoded=JSON.parse(value);decodedStrings.push({path,decodedType:valueType(decoded),decodedKeys:safeKeys(decoded)});walk(decoded,`${path} → decoded JSON`,depth+1,inherited,key,false);
        }catch(error){jsonDecodeFailures.push({path,reason:"Invalid JSON"});}
        return;
      }
      if(typeof value!=="object"||seen.has(value))return;seen.add(value);
      const context={...inherited};
      if(!Array.isArray(value))for(const key of metadataKeys)if(value[key]!=null)context[key]=value[key];
      const found=CORE_FIELDS.filter(key=>Object.prototype.hasOwnProperty.call(value,key));
      if(found.length)candidates.push({value,path,found,context});
      if(found.length===3){stop=true;return;}
      if(Array.isArray(value)){
        for(let i=0;i<Math.min(value.length,MAX_ARRAY_CHILDREN)&&!stop;i++){const child=value[i];if(child&&typeof child==="object"||typeof child==="string")walk(child,`${path}[${i}]`,depth+1,context,String(i),true);}
      }else{
        const keys=Object.keys(value);
        for(const childKey of keys){
          if(stop)break;const child=value[childKey];
          if(CORE_FIELDS.includes(childKey)&&Array.isArray(child)){
            const wrapperData=childKey==="data"&&found.length===1&&child.slice(0,20).some(item=>plainObject(item)||typeof item==="string");
            if(!wrapperData)continue;
          }
          if(child&&typeof child==="object"||typeof child==="string")walk(child,`${path}.${childKey}`,depth+1,context,childKey,false);
        }
      }
    }
    walk(items,"datasetItems",0);
    const complete=candidates.find(candidate=>candidate.found.length===3);
    return {items,selected:complete||null,candidates,decodedStrings,jsonDecodeFailures,inspectedPaths,inspectedNodeCount,structure:payloadStructure(items)};
  }
  function cellParts(cell,outerIndex,innerIndex,matrix){
    if(Array.isArray(cell)&&cell.length>=3)return {timeIndex:number(cell[0]),priceIndex:number(cell[1]),raw:number(cell[2])};
    if(cell&&typeof cell==="object"){
      const ti=cell.timeIndex??cell.timeIdx??cell.xIndex??cell.x??(matrix?outerIndex:undefined);
      const pi=cell.priceIndex??cell.priceIdx??cell.yIndex??cell.y??(matrix?innerIndex:undefined);
      const raw=cell.intensity??cell.value??cell.liquidation??cell.liqValue??cell.z;
      return {timeIndex:number(ti),priceIndex:number(pi),raw:number(raw)};
    }
    if(matrix&&finite(cell))return {timeIndex:outerIndex,priceIndex:innerIndex,raw:number(cell)};
    return null;
  }
  function eachCell(data,visit){
    if(!Array.isArray(data))return;
    for(let i=0;i<data.length;i++){
      const row=data[i];
      const triplet=Array.isArray(row)&&row.length>=3&&Number.isInteger(number(row[0]))&&Number.isInteger(number(row[1]));
      if(Array.isArray(row)&&!triplet){for(let j=0;j<row.length;j++)visit(cellParts(row[j],i,j,true));}
      else visit(cellParts(row,i,0,false));
    }
  }
  function addReason(reasons,key){reasons[key]=(reasons[key]||0)+1;}

  function locate(payload){
    const located=findHeatmapObject(payload);const rawItemCount=located.items.filter(Boolean).length;
    const common={rawItemCount,heatmapObjectFound:false,selectedObject:null,requiredFieldsFound:[],missingFields:CORE_FIELDS.slice(),payloadStructure:located.structure,inspectedCandidatePaths:located.candidates.map(candidate=>candidate.path).slice(0,20),decodedStringPaths:located.decodedStrings.map(item=>item.path),jsonDecodeFailurePaths:located.jsonDecodeFailures.map(item=>item.path)};
    if(!rawItemCount)throw new HeatmapDatasetError("Dataset item missing",common,"DATASET PARSING FAILED");
    if(!located.selected){
      const found=Array.from(new Set(located.candidates.flatMap(candidate=>candidate.found)));
      const missing=CORE_FIELDS.filter(key=>!found.includes(key)),best=located.candidates.slice().sort((a,b)=>b.found.length-a.found.length)[0];
      const diagnostics={...common,requiredFieldsFound:found,missingFields:missing,selectedObject:best&&best.path||null};
      if(located.jsonDecodeFailures.length)throw new HeatmapDatasetError(`JSON decode failed at ${located.jsonDecodeFailures[0].path}`,diagnostics,"DATASET PARSING FAILED");
      if(located.structure.referencePaths.length)throw new HeatmapDatasetError(`Unsupported output reference at ${located.structure.referencePaths[0]}`,diagnostics,"DATASET PARSING FAILED");
      if(best)throw new HeatmapDatasetError(`Core fields missing at ${best.path}: ${CORE_FIELDS.filter(field=>!best.found.includes(field)).join(", ")}`,diagnostics,"DATASET PARSING FAILED");
      throw new HeatmapDatasetError("Unsupported dataset wrapper: no heatmap core fields were found within the bounded search",diagnostics,"DATASET PARSING FAILED");
    }
    const source=Object.assign({},located.selected.context||{},located.selected.value);
    const requiredFieldsFound=CORE_FIELDS.filter(key=>source[key]!=null),missingFields=CORE_FIELDS.filter(key=>source[key]==null);
    const diagnostics={...common,heatmapObjectFound:true,selectedObject:located.selected.path,requiredFieldsFound,missingFields};
    return Object.freeze({kind:"BT001_HEATMAP_LOCATED",source,diagnostics:Object.freeze(diagnostics)});
  }

  function validateAndNormalize(payload,expected={}){
    const parsed=payload&&payload.kind==="BT001_HEATMAP_LOCATED"?payload:locate(payload),source=parsed.source,baseDiagnostics=parsed.diagnostics;
    const rawItemCount=baseDiagnostics.rawItemCount;
    if(!Array.isArray(source.chartTimeArray))throw new HeatmapDatasetError("Core field type invalid: chartTimeArray must be an array",baseDiagnostics);
    if(!Array.isArray(source.priceArray))throw new HeatmapDatasetError("Core field type invalid: priceArray must be an array",baseDiagnostics);
    if(!Array.isArray(source.data))throw new HeatmapDatasetError("Core field type invalid: data must be an array",baseDiagnostics);
    if(!source.chartTimeArray.length)throw new HeatmapDatasetError("Empty heatmap dataset: chartTimeArray is empty",baseDiagnostics);
    if(!source.priceArray.length)throw new HeatmapDatasetError("Empty heatmap dataset: priceArray is empty",baseDiagnostics);
    if(!source.data.length)throw new HeatmapDatasetError("Empty heatmap dataset: data is empty",baseDiagnostics);

    const units=new Set(source.chartTimeArray.map(timestampUnit));
    if(units.has("invalid")||units.size!==1)throw new HeatmapDatasetError("Timestamp units are invalid or mixed",{...baseDiagnostics,timestampUnit:Array.from(units).join(", ")});
    const detectedUnit=Array.from(units)[0];
    const times=source.chartTimeArray.map(timestamp);const prices=source.priceArray.map(number);
    if(times.some(v=>!Number.isFinite(v))||prices.some(v=>!Number.isFinite(v)))throw new HeatmapDatasetError("Dataset axes contain non-finite values",{...baseDiagnostics,timestampUnit:detectedUnit},"NORMALIZATION FAILED");
    const plausibleMin=Date.UTC(2017,0,1)/1000,plausibleMax=Date.now()/1000+7*86400;
    if(times.some(v=>v<plausibleMin||v>plausibleMax))throw new HeatmapDatasetError("Normalized timestamps fall outside plausible coverage",{...baseDiagnostics,timestampUnit:detectedUnit},"NORMALIZATION FAILED");
    for(let i=1;i<times.length;i++)if(times[i]<=times[i-1])throw new HeatmapDatasetError("chartTimeArray is not strictly chronological",{...baseDiagnostics,timestampUnit:detectedUnit});
    let priceDirection=0;
    for(let i=1;i<prices.length;i++){const direction=Math.sign(prices[i]-prices[i-1]);if(!direction||(priceDirection&&direction!==priceDirection))throw new HeatmapDatasetError("priceArray is not strictly ordered",baseDiagnostics);priceDirection=direction;}
    if(prices.some(price=>price<=0))throw new HeatmapDatasetError("priceArray contains non-positive prices",baseDiagnostics);

    const priceDiffs=prices.slice(1).map((v,i)=>Math.abs(v-prices[i])).filter(v=>v>0);
    const tickSize=finite(source.tickSize)&&number(source.tickSize)>0?number(source.tickSize):median(priceDiffs);
    const inferredInterval=median(times.slice(1).map((v,i)=>v-times[i]));
    const declaredInterval=intervalSeconds(source.chartInterval??source.sourceInterval);
    const timeStep=finite(declaredInterval)&&declaredInterval>0?declaredInterval:inferredInterval;
    if(!finite(timeStep)||timeStep<=0)throw new HeatmapDatasetError("Source chart interval cannot be determined",baseDiagnostics);
    if(!finite(tickSize)||tickSize<=0)throw new HeatmapDatasetError("Source price step cannot be determined",baseDiagnostics);

    const cells=[];let rejected=0,rawCellCount=0;const rejectionReasons={};
    eachCell(source.data,parts=>{
      rawCellCount++;
      if(!parts){rejected++;addReason(rejectionReasons,"unsupported cell");return;}
      if(!Number.isInteger(parts.timeIndex)){rejected++;addReason(rejectionReasons,"invalid time index");return;}
      if(!Number.isInteger(parts.priceIndex)){rejected++;addReason(rejectionReasons,"invalid price index");return;}
      if(parts.timeIndex<0||parts.timeIndex>=times.length){rejected++;addReason(rejectionReasons,"time index out of bounds");return;}
      if(parts.priceIndex<0||parts.priceIndex>=prices.length){rejected++;addReason(rejectionReasons,"price index out of bounds");return;}
      if(!finite(parts.raw)||parts.raw<0){rejected++;addReason(rejectionReasons,"invalid intensity");return;}
      const start=times[parts.timeIndex],end=parts.timeIndex+1<times.length?times[parts.timeIndex+1]:start+timeStep,price=prices[parts.priceIndex];
      if(!finite(start)||!finite(end)||end<=start){rejected++;addReason(rejectionReasons,"invalid resolved timestamp");return;}
      if(!finite(price)||price<=0){rejected++;addReason(rejectionReasons,"invalid resolved price");return;}
      let adjacent=parts.priceIndex+1<prices.length?prices[parts.priceIndex+1]:price+tickSize*(priceDirection||1);
      const lower=Math.min(price,adjacent),upper=Math.max(price,adjacent);
      if(!(upper>lower)){rejected++;addReason(rejectionReasons,"invalid price bounds");return;}
      cells.push({startTime:start,endTime:end,lowerPrice:lower,upperPrice:upper,centerPrice:(lower+upper)/2,rawIntensity:parts.raw,normalizedIntensity:0,timeIndex:parts.timeIndex,priceIndex:parts.priceIndex});
    });
    if(!cells.length)throw new HeatmapDatasetError(rawCellCount?"Invalid indexed-cell structure: no source cells passed validation":"Empty heatmap dataset: data contains no cells",{...baseDiagnostics,timestampUnit:detectedUnit,rawCellCount,validCellCount:0,rejectedCellCount:rejected,rejectionReasons});
    cells.sort((a,b)=>a.startTime-b.startTime||a.lowerPrice-b.lowerPrice);
    const intensities=cells.map(cell=>cell.rawIntensity).sort((a,b)=>a-b);
    const declaredMax=finite(source.maxLiqValue)&&number(source.maxLiqValue)>0?number(source.maxLiqValue):0;
    const rawMax=Math.max(declaredMax,intensities[intensities.length-1]||0);
    if(!(rawMax>0))throw new HeatmapDatasetError("Dataset intensity maximum is unusable",baseDiagnostics,"NORMALIZATION FAILED");
    for(const cell of cells)cell.normalizedIntensity=Math.max(0,Math.min(1,cell.rawIntensity/rawMax));
    const sourceSymbol=String(source.sourceSymbol??source.symbol??expected.symbol??"BTCUSDT").toUpperCase();
    if(expected.symbol&&sourceSymbol!==String(expected.symbol).toUpperCase())throw new HeatmapDatasetError("Dataset source symbol does not match BTCUSDT",baseDiagnostics);
    if(source.duration!=null&&expected.duration&&String(source.duration).toUpperCase()!==String(expected.duration).toUpperCase())throw new HeatmapDatasetError("Dataset duration does not match the requested duration",baseDiagnostics);
    const datasetStart=timestamp(source.datasetStartTime??source.startTime??source.start??times[0]);
    const datasetEnd=timestamp(source.datasetEndTime??source.endTime??source.end??(times[times.length-1]+timeStep));
    if(!finite(datasetStart)||!finite(datasetEnd)||datasetEnd<=datasetStart)throw new HeatmapDatasetError("Dataset coverage is invalid",baseDiagnostics,"NORMALIZATION FAILED");
    const diagnostics=Object.freeze({...baseDiagnostics,timestampUnit:detectedUnit,rawCellCount,validCellCount:cells.length,rejectedCellCount:rejected,rejectionReasons:Object.freeze(rejectionReasons)});
    return Object.freeze({cells:Object.freeze(cells),metadata:Object.freeze({sourceSymbol,sourceInterval:String(source.sourceInterval??source.chartInterval??""),chartIntervalSeconds:timeStep,tickSize,datasetStart,datasetEnd,validCellCount:cells.length,rejectedCellCount:rejected,maxLiqValue:rawMax,p50:percentile(intensities,.50),p90:percentile(intensities,.90),p99:percentile(intensities,.99),rawItemCount,rawCellCount,timestampUnit:detectedUnit,selectedObject:baseDiagnostics.selectedObject,rejectionReasons:Object.freeze(rejectionReasons)}),diagnostics});
  }

  window.BT001HeatmapDataset=Object.freeze({locate,validateAndNormalize,HeatmapDatasetError,_test:{timestamp,timestampUnit,intervalSeconds,percentile,findHeatmapObject,payloadStructure}});
})();
