(() => {
  "use strict";

  function number(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function weightedAverage(rows){
    let quantity = 0;
    let value = 0;
    (rows || []).forEach(row => {
      const level = number(row && row.level);
      const lot = number(row && row.lot);
      if(level == null || lot == null || level <= 0 || lot <= 0) return;
      quantity += lot;
      value += level * lot;
    });
    return {quantity,average:quantity > 0 ? value / quantity : null};
  }
  function estimatePl(direction,entry,level,lot){
    const en = number(entry);
    const ex = number(level);
    const qty = number(lot);
    if(en == null || ex == null || qty == null) return null;
    return direction === "SHORT" ? (en - ex) * qty : (ex - en) * qty;
  }
  function generateLevels({start,end,step,count,lastEdited,direction}){
    const first = number(start);
    let last = number(end);
    let distance = Math.abs(number(step) || 0);
    const size = Math.max(1,Math.floor(number(count) || 1));
    if(first == null || first <= 0) return {levels:[],step:null,end:null};
    const sign = direction === "SHORT" ? 1 : -1;
    if(lastEdited === "end" && last != null && size > 1){
      distance = Math.abs(last - first) / (size - 1);
    }else{
      last = first + sign * distance * (size - 1);
    }
    const levels = Array.from({length:size},(_,index) => first + sign * distance * index);
    return {levels,step:distance,end:last};
  }
  function distributeLots(total,count){
    const units = Math.max(0,Math.round((number(total) || 0) * 1000));
    const size = Math.max(1,Math.floor(number(count) || 1));
    const eachUnits = Math.floor(units / size);
    let remainingUnits = units;
    return Array.from({length:size},(_,index) => {
      const lotUnits = index === size - 1 ? remainingUnits : Math.min(eachUnits,remainingUnits);
      remainingUnits -= lotUnits;
      return lotUnits / 1000;
    });
  }
  function normalizedNumber(value,normalize){
    const candidate=typeof normalize==="function"?normalize(value):value;
    return number(candidate);
  }
  function redistributeAroundPivot({levels,index,value,sign=1,minSpacing=0,normalize}){
    const source=(levels||[]).map(number),target=Math.floor(number(index)),direction=sign<0?-1:1,spacing=Math.max(0,number(minSpacing)||0),last=source.length-1;
    if(source.length<3||!Number.isInteger(target)||target<=0||target>=last||source.some(level=>level==null||level<=0))return {valid:false,levels:source,reason:"Invalid pivot grid"};
    const tolerance=Math.max(1e-12,spacing*1e-9,Math.max(...source.map(Math.abs))*Number.EPSILON*16);
    const top=source[0],bottom=source[last],snapped=normalizedNumber(value,normalize);
    if(snapped==null||snapped<=0||(bottom-top)*direction+tolerance<spacing*last)return {valid:false,levels:source,reason:"Invalid pivot price"};
    const lower=direction>0?top+spacing*target:bottom+spacing*(last-target),upper=direction>0?bottom-spacing*(last-target):top-spacing*target;
    if(upper+tolerance<lower)return {valid:false,levels:source,reason:"Insufficient endpoint spacing"};
    const pivot=normalizedNumber(Math.max(lower,Math.min(upper,snapped)),normalize),out=source.slice();
    if(pivot==null||pivot<lower-tolerance||pivot>upper+tolerance)return {valid:false,levels:source,reason:"Pivot normalization exceeded bounds"};
    out[0]=top;out[target]=pivot;out[last]=bottom;
    for(const [leftIndex,rightIndex] of [[0,target],[target,last]]){
      const left=out[leftIndex],right=out[rightIndex],span=rightIndex-leftIndex;
      for(let rowIndex=leftIndex+1;rowIndex<rightIndex;rowIndex+=1){
        const raw=left+(right-left)*(rowIndex-leftIndex)/span;
        let next=normalizedNumber(raw,normalize);
        if(next==null)return {valid:false,levels:source,reason:"Normalization failed"};
        if(direction>0)next=Math.max(out[rowIndex-1]+spacing,Math.min(right-spacing*(rightIndex-rowIndex),next));
        else next=Math.max(right+spacing*(rightIndex-rowIndex),Math.min(out[rowIndex-1]-spacing,next));
        out[rowIndex]=normalizedNumber(next,normalize);
        if(out[rowIndex]==null)return {valid:false,levels:source,reason:"Normalization failed"};
      }
    }
    const ordered=out.slice(1).every((level,rowIndex)=>(level-out[rowIndex])*direction+tolerance>=spacing);
    return ordered?{valid:true,levels:out,pivotValue:out[target],pivotIndex:target}:{valid:false,levels:source,reason:"Pivot redistribution is not ordered"};
  }
  function selfTest(){
    const snap=value=>Math.round(value),one=redistributeAroundPivot({levels:[100,90,80,70,60,50],index:2,value:72,sign:-1,minSpacing:1,normalize:snap});
    const second=redistributeAroundPivot({levels:one.levels,index:4,value:58,sign:-1,minSpacing:1,normalize:snap});
    const clamped=redistributeAroundPivot({levels:[100,90,80,70,60,50],index:2,value:49,sign:-1,minSpacing:1,normalize:snap});
    const ascending=redistributeAroundPivot({levels:[50,60,70,80,90,100],index:2,value:73,sign:1,minSpacing:1,normalize:snap});
    const protection=redistributeAroundPivot({levels:[100,90,80,70,60],index:2,value:76,sign:-1,minSpacing:1,normalize:snap});
    const exit=redistributeAroundPivot({levels:[50,60,70,80,90],index:2,value:74,sign:1,minSpacing:1,normalize:snap});
    const whole=value=>Math.round(Number(value));
    const wholePrice=redistributeAroundPivot({levels:[64128,64126,64124,64122,64120],index:2,value:64123.55000000001,sign:-1,minSpacing:1,normalize:whole});
    const impossible=redistributeAroundPivot({levels:[100,99.7,99.3,99],index:2,value:99.5,sign:-1,minSpacing:1,normalize:whole});
    const lots=[.001,.002,.003,.004,.005,.006],ids=["a","b","c","d","e","f"],customSend=second.levels.slice();
    const cases={
      A_oneTemporaryPivot:one.valid&&JSON.stringify(one.levels)==="[100,86,72,65,57,50]"&&one.levels[0]===100&&one.levels[5]===50,
      B_laterPivotReleasesFirst:second.valid&&second.levels[4]===58&&second.levels[2]!==72&&second.levels[0]===100&&second.levels[5]===50,
      C_crossingPrevented:clamped.valid&&clamped.pivotValue===53,
      D_ascendingOrder:ascending.valid&&ascending.levels.every((value,index)=>!index||value>ascending.levels[index-1]),
      E_descendingOrder:one.valid&&one.levels.every((value,index)=>!index||value<one.levels[index-1]),
      F_protectionPivot:protection.valid&&protection.levels[0]===100&&protection.levels[4]===60&&protection.levels[2]===76,
      G_exitPivot:exit.valid&&exit.levels[0]===50&&exit.levels[4]===90&&exit.levels[2]===74,
      H_customSendPricesUnchanged:JSON.stringify(customSend)===JSON.stringify(second.levels),
      I_lotsRemainIndependent:JSON.stringify(lots)===JSON.stringify([.001,.002,.003,.004,.005,.006]),
      J_rowIdentityUnchanged:JSON.stringify(ids)===JSON.stringify(["a","b","c","d","e","f"]),
      K_wholePricePivotCanonical:wholePrice.valid&&wholePrice.levels.every(Number.isInteger)&&wholePrice.levels.slice(1).every((value,index)=>wholePrice.levels[index]-value>=1-1e-8),
      L_impossibleRoundedGeometryRejected:impossible.valid===false
    };
    return {passed:Object.values(cases).every(Boolean),cases};
  }

  window.GradCalculatorDomain = {number,weightedAverage,estimatePl,generateLevels,distributeLots,redistributeAroundPivot,_selfTest:selfTest};
})();
