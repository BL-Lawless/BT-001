(() => {
  "use strict";

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  const last=series=>series&&series.length?series[series.length-1].value:null;
  const previous=(series,offset=8)=>series&&series.length>offset?series[series.length-1-offset].value:null;
  const freeze=value=>{
    if(!value||typeof value!=="object"||Object.isFrozen(value))return value;
    Object.freeze(value);Object.values(value).forEach(freeze);return value;
  };
  function ema(rows,period){
    const out=[];if(!Array.isArray(rows)||rows.length<period)return out;
    const alpha=2/(period+1);
    let current=rows.slice(0,period).reduce((sum,row)=>sum+Number(row.close),0)/period;
    out.push({time:rows[period-1].time,value:current});
    for(let i=period;i<rows.length;i++){current=Number(rows[i].close)*alpha+current*(1-alpha);out.push({time:rows[i].time,value:current});}
    return out;
  }
  function stackDirection(values){let bull=0,bear=0;for(let i=0;i<values.length-1;i++){if(values[i]>values[i+1])bull++;else if(values[i]<values[i+1])bear++;}return (bull-bear)/Math.max(1,values.length-1)*100;}
  function stackClean(values,price){const spreads=[];for(let i=0;i<values.length-1;i++)spreads.push(Math.abs(values[i]-values[i+1])/(price||values[i])*10000);return clamp(spreads.reduce((a,b)=>a+b,0)/Math.max(1,spreads.length)*7,0,100);}
  function slopeScore(series,price){const a=last(series),b=previous(series,8);return a==null||b==null||!price?0:clamp(((a-b)/price)*10000*7,-100,100);}
  function slopePower(series,price){const a=last(series),b=previous(series,8),c=previous(series,16);if(a==null||b==null||c==null||!price)return 0;return clamp((Math.abs((a-b)/price)-Math.abs((b-c)/price))*100000,-100,100);}
  function spreadDir(values,price){
    if(!Array.isArray(values)||values.length<2||!price)return 0;
    let sum=0,pairs=0;for(let i=0;i<values.length-1;i++){const a=Number(values[i]),b=Number(values[i+1]);if(Number.isFinite(a)&&Number.isFinite(b)){sum+=clamp((a-b)/price*10000*8,-100,100);pairs++;}}
    return pairs?clamp(sum/pairs,-100,100):0;
  }
  function spreadPower(seriesBySlot,price,slots){
    let sum=0,count=0;for(let i=0;i<slots.length-1;i++){const a=seriesBySlot[slots[i].slotId],b=seriesBySlot[slots[i+1].slotId],av=last(a),bv=last(b),ap=previous(a,8),bp=previous(b,8);if([av,bv,ap,bp,price].every(value=>value!=null)){sum+=clamp((Math.abs(av-bv)-Math.abs(ap-bp))/price*100000,-100,100);count++;}}
    return count?sum/count:0;
  }
  function crossState(fast,slow){
    const length=Math.min(fast.length,slow.length);if(length<3)return {label:"None",age:null,dir:0,quality:0,forming:false};
    const fa=fast.at(-1).value,sa=slow.at(-1).value,fp=fast.at(-2).value,sp=slow.at(-2).value,dist=fa-sa;let lastCross=null;
    for(let i=1;i<length;i++){const a0=fast[fast.length-length+i-1].value-slow[slow.length-length+i-1].value,a1=fast[fast.length-length+i].value-slow[slow.length-length+i].value;if(a0<=0&&a1>0)lastCross={age:length-i-1,dir:1};if(a0>=0&&a1<0)lastCross={age:length-i-1,dir:-1};}
    if(fp<=sp&&fa>sa)return {label:"Bull X Fresh",age:0,dir:1,quality:85,forming:false};
    if(fp>=sp&&fa<sa)return {label:"Bear X Fresh",age:0,dir:-1,quality:85,forming:false};
    if(Math.abs(dist/(sa||1))<.00035)return {label:(dist>=0?"Bull":"Bear")+" forming",age:null,dir:dist>=0?1:-1,quality:35,forming:true};
    if(lastCross){const stale=lastCross.age>24;return {label:(lastCross.dir>0?"Bull X ":"Bear X ")+(stale?"Old":"Confirmed"),age:lastCross.age,dir:lastCross.dir,quality:stale?25:60,forming:false};}
    return {label:"None",age:null,dir:0,quality:0,forming:false};
  }
  function eventForLevel(price,emaValue,direction){if(price==null||emaValue==null)return "n/a";const distance=(price-emaValue)/price*10000;if(Math.abs(distance)<8)return "Retest";if(direction>=0&&price>emaValue)return "Hold";if(direction<0&&price<emaValue)return "Reject";return direction>=0?"Loss":"Reclaim";}
  function clusterState(values,price){const spread=(Math.max(...values)-Math.min(...values))/(price||values[0])*10000;return spread<18?"Chop":spread<42?"Compressing":"Expanded";}
  function deriveEarlyWarning(confirmed,live){
    if(!confirmed?.available||!live?.available)return null;const hints=[];
    if(live.crosses&&Object.values(live.crosses).some(cross=>cross?.forming))hints.push("Unconfirmed cross forming");
    if(live.events&&confirmed.events&&live.events.vwap!==confirmed.events.vwap)hints.push("Unconfirmed VWAP "+live.events.vwap);
    if(Number(live.clean)>=18&&Number(confirmed.clean)<18)hints.push("Unconfirmed compression break");
    if(String(live.phase||"")!==String(confirmed.phase||""))hints.push("Unconfirmed "+(live.phase||"phase shift"));
    if(Number(live.magnitude)<Number(confirmed.magnitude)-10)hints.push("Unconfirmed momentum weakening");
    if(!hints.length&&Math.sign(Number(live.direction)||0)!==Math.sign(Number(confirmed.direction)||0))hints.push("Unconfirmed transition");
    return hints.length?freeze({label:hints[0],trial:live}):null;
  }
  function calculateTimeframe({label,interval,rows,slots,minimumRows=1,fullRows=1}){
    const fixedRows=Array.isArray(rows)?rows.map(row=>({...row})):[],normalizedSlots=Array.isArray(slots)?slots.map(slot=>({...slot})):[];
    if(normalizedSlots.length!==5)return freeze({tf:label,interval,available:false,reason:"ma-slots-unavailable"});
    if(fixedRows.length<minimumRows)return freeze({tf:label,interval,available:false,reason:"warmup-limited",rows:fixedRows.length,reliability:"insufficient-warmup",warmupLimited:true});
    const seriesBySlot={};for(const slot of normalizedSlots)seriesBySlot[slot.slotId]=ema(fixedRows,slot.period);
    const values=normalizedSlots.map(slot=>last(seriesBySlot[slot.slotId]));
    if(values.some(value=>value==null))return freeze({tf:label,interval,available:false,reason:"warmup-limited",rows:fixedRows.length,reliability:"insufficient-warmup",warmupLimited:true});
    const price=number(fixedRows.at(-1)?.close),stackDir=stackDirection(values),clean=stackClean(values,price);
    const slopeDir=.45*slopeScore(seriesBySlot.MA2,price)+.35*slopeScore(seriesBySlot.MA3,price)+.20*slopeScore(seriesBySlot.MA4,price);
    const sprDir=spreadDir(values,price),c12=crossState(seriesBySlot.MA1,seriesBySlot.MA2),c23=crossState(seriesBySlot.MA2,seriesBySlot.MA3),c34=crossState(seriesBySlot.MA3,seriesBySlot.MA4),c45=crossState(seriesBySlot.MA4,seriesBySlot.MA5);
    const direction=clamp(stackDir*.44+slopeDir*.30+sprDir*.20+c12.dir*6,-100,100);
    const slopePow=.55*slopePower(seriesBySlot.MA2,price)+.30*slopePower(seriesBySlot.MA3,price)+.15*slopePower(seriesBySlot.MA4,price);
    const sprPow=spreadPower(seriesBySlot,price,normalizedSlots),magnitude=clamp(slopePow*.52+sprPow*.42+(clean<20?-18:0),-100,100);
    const state=direction>55?"Bullish":direction>18?"Mixed Bullish":direction<-55?"Bearish":direction<-18?"Mixed Bearish":"Mixed";
    const phase=clean<18?"Compression / Chop":magnitude>35?(direction>=0?"Bullish Markup / Trend":"Bearish Transition"):magnitude<-25?(direction>=0?"Bullish Fading":"Bearish Fading"):Math.abs(direction)<25?"Compression / Chop":"Pullback / Retest";
    const magState=magnitude>35?"Expanding":magnitude>10?"Strengthening":magnitude<-35?"Fading":magnitude<-10?"Weakening":"Neutral";
    const events={x12:c12.label,x23:c23.label,x34:c34.label,x45:c45.label,ma1:eventForLevel(price,values[0],direction),ma2:eventForLevel(price,values[1],direction),ma3:eventForLevel(price,values[2],direction),cluster:clusterState(values,price)};
    return freeze({tf:label,interval,available:true,rows:fixedRows.length,price,emasBySlot:seriesBySlot,emaVals:values,direction,magnitude,state,phase,magState,stackDir,clean,slopeDir,sprDir,slopePow,sprPow,crosses:{c12,c23,c34,c45},slots:normalizedSlots,periods:normalizedSlots.map(slot=>slot.period),pairs:[[normalizedSlots[0],normalizedSlots[1]],[normalizedSlots[1],normalizedSlots[2]],[normalizedSlots[2],normalizedSlots[3]],[normalizedSlots[3],normalizedSlots[4]]],events,reliability:fixedRows.length>=fullRows?"full-warmup":"minimum-warmup",warmupLimited:false});
  }
  function aggregate(diagnostics){
    const items=Array.isArray(diagnostics)?diagnostics:[],available=items.filter(item=>item?.available);
    const average=key=>available.length?available.reduce((sum,item)=>sum+Number(item[key]||0),0)/available.length:0;
    const direction=average("direction"),magnitude=average("magnitude"),alignment=items.length?available.length/items.length:0;
    const clarity=clamp(Math.abs(direction)*.42+(100-Math.abs(magnitude))*.12+alignment*42,0,100);
    const risk=clamp(100-clarity+(available.slice(-2).some(item=>Math.sign(item.direction)!==Math.sign(direction))?14:0),0,100);
    return freeze({direction,magnitude,alignment,clarity,risk,availableCount:available.length,totalCount:items.length});
  }
  const api=freeze({ema,stackDirection,stackClean,slopeScore,slopePower,spreadDir,spreadPower,crossState,eventForLevel,clusterState,deriveEarlyWarning,calculateTimeframe,aggregate});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof window!=="undefined")window.BT001_SSSC_CALC=api;
})();
