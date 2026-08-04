(() => {
  "use strict";
  const PULL_HOURS_UTC=Object.freeze([0,7,13,17,21]);
  const pad=value=>String(value).padStart(2,"0");
  function nextScheduledPull(now=Date.now()){
    const current=new Date(Number(now));
    for(const hour of PULL_HOURS_UTC){const candidate=Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate(),hour);if(candidate>current.getTime())return candidate;}
    return Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate()+1,0);
  }
  function countdown(target,now=Date.now()){
    const remaining=Number(target)-Number(now);if(!(remaining>0))return "Updating...";
    const minutes=Math.ceil(remaining/60000);return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
  }
  function pullTimestamp(value){
    if(value==null||value==="")return "-- | --";const date=new Date(Number(value));if(!Number.isFinite(date.getTime()))return "-- | --";
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth()+1)}/${date.getUTCFullYear()} | ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
  function line(lastPull,nextPull,updating=false,now=Date.now()){return `BTCUSDT Heatmap · ${pullTimestamp(lastPull)} - ${updating?"Updating...":`Next update in ${countdown(nextPull,now)}`}`;}
  window.BT001HeatmapFreshness=Object.freeze({PULL_HOURS_UTC,nextScheduledPull,countdown,pullTimestamp,line});
})();
