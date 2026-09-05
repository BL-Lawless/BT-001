(() => {
  "use strict";

  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const HISTORY_LIMIT=200;
  const DIVERGENCE_LARGE=0.65;
  const DIVERGENCE_SMALL=0.25;
  const DIVERGENCE_SIGN_MIN=0.20;
  const fixedBucketStart=(timeMs,durationMs)=>Math.floor(Number(timeMs)/durationMs)*durationMs;

  function relationshipModel(buckets){
    const rows=(Array.isArray(buckets)?buckets:[]).map(bucket=>{
      const buy=Number(bucket&&bucket.buyVolume)||0,sell=Number(bucket&&bucket.sellVolume)||0;
      return {bucket,delta:buy-sell,priceChange:Number(bucket&&bucket.priceChange)||0};
    });
    const maxDelta=Math.max(0,...rows.map(row=>Math.abs(row.delta)));
    const maxPriceChange=Math.max(0,...rows.map(row=>Math.abs(row.priceChange)));
    return Object.freeze(rows.map(row=>{
      const deltaMagnitude=maxDelta>0?Math.abs(row.delta)/maxDelta:0;
      const priceMagnitude=maxPriceChange>0?Math.abs(row.priceChange)/maxPriceChange:0;
      const magnitudeMismatch=Math.max(deltaMagnitude,priceMagnitude)>=DIVERGENCE_LARGE&&Math.min(deltaMagnitude,priceMagnitude)<=DIVERGENCE_SMALL;
      const directionMismatch=Math.sign(row.delta)!==0&&Math.sign(row.priceChange)!==0&&Math.sign(row.delta)!==Math.sign(row.priceChange)&&deltaMagnitude>=DIVERGENCE_SIGN_MIN&&priceMagnitude>=DIVERGENCE_SIGN_MIN;
      return Object.freeze({...row,deltaMagnitude,priceMagnitude,divergent:magnitudeMismatch||directionMismatch,magnitudeMismatch,directionMismatch});
    }));
  }

  function createEngine(options={}){
    let durationMs=clamp(Math.round(Number(options.durationMs)||60000),1000,60*60*1000);
    let lookback=clamp(Math.round(Number(options.lookback)||20),2,200);
    let symbol="";
    let current=null;
    let completed=[];
    let revision=0;

    const emptyBucket=(start,baselineEligible=true)=>({start,end:start+durationMs,buyVolume:0,sellVolume:0,totalVolume:0,tradeCount:0,openPrice:null,lastPrice:null,priceChange:0,locked:false,baselineEligible});
    const notify=()=>{revision+=1;if(typeof options.onUpdate==="function")options.onUpdate(snapshot());};
    const appendCompleted=bucket=>{
      completed.push(Object.freeze({...bucket,locked:true}));
      if(completed.length>HISTORY_LIMIT)completed=completed.slice(-HISTORY_LIMIT);
    };
    function reset(nextSymbol=symbol){symbol=String(nextSymbol||"").toUpperCase();current=null;completed=[];notify();}
    function rollTo(timeMs,shouldNotify=true){
      const time=Number(timeMs);
      if(!Number.isFinite(time)||time<=0)return false;
      const targetStart=fixedBucketStart(time,durationMs);
      if(!current){current=emptyBucket(targetStart,Math.abs(time-targetStart)<1);if(shouldNotify)notify();return true;}
      if(targetStart<=current.start)return false;
      const prior=current;
      appendCompleted(prior);
      const missing=Math.max(0,Math.round((targetStart-prior.start)/durationMs)-1);
      const keepMissing=Math.min(missing,HISTORY_LIMIT);
      if(missing>HISTORY_LIMIT)completed=[];
      for(let offset=keepMissing;offset>0;offset-=1)appendCompleted(emptyBucket(targetStart-offset*durationMs));
      current=emptyBucket(targetStart);
      if(shouldNotify)notify();
      return true;
    }
    function ingest(trade){
      const time=Number(trade&&(trade.exchangeTime??trade.time??trade.T??trade.E));
      const quantity=Number(trade&&(trade.quantity??trade.q));
      const price=Number(trade&&trade.price);
      const nextSymbol=String(trade&&trade.symbol||symbol||"").toUpperCase();
      if(!Number.isFinite(time)||time<=0||!Number.isFinite(quantity)||quantity<=0)return false;
      if(symbol&&nextSymbol&&nextSymbol!==symbol)reset(nextSymbol);
      else if(!symbol&&nextSymbol)symbol=nextSymbol;
      rollTo(time,false);
      if(!current||time<current.start||time>=current.end)return false;
      const takerSide=String(trade&&trade.takerSide||"").toLowerCase();
      const sell=takerSide==="sell"||(takerSide!=="buy"&&trade&&trade.buyerIsMaker===true);
      if(sell)current.sellVolume+=quantity;else current.buyVolume+=quantity;
      current.totalVolume=current.buyVolume+current.sellVolume;
      current.tradeCount+=1;
      if(Number.isFinite(price)&&price>0){
        if(!(current.openPrice>0))current.openPrice=price;
        current.lastPrice=price;
        current.priceChange=current.lastPrice-current.openPrice;
      }
      notify();
      return true;
    }
    function configure(next={}){
      const nextDuration=clamp(Math.round(Number(next.durationMs)||durationMs),1000,60*60*1000);
      const nextLookback=clamp(Math.round(Number(next.lookback)||lookback),2,200);
      const durationChanged=nextDuration!==durationMs;
      durationMs=nextDuration;lookback=nextLookback;
      if(durationChanged){current=null;completed=[];}
      notify();
    }
    function snapshot(){
      const bucket=current?{...current}:null;
      const baselineBuckets=completed.filter(item=>item.baselineEligible!==false).slice(-lookback);
      const baselineTotal=baselineBuckets.reduce((sum,item)=>sum+item.totalVolume,0);
      const baselineAverage=baselineBuckets.length?baselineTotal/baselineBuckets.length:null;
      const total=bucket?bucket.totalVolume:0;
      const buy=bucket?bucket.buyVolume:0;
      const sell=bucket?bucket.sellVolume:0;
      const magnitudeRatio=baselineAverage>0?total/baselineAverage:null;
      return Object.freeze({
        symbol,durationMs,lookback,revision,current:bucket&&Object.freeze(bucket),
        completed:Object.freeze(completed.slice(-HISTORY_LIMIT)),baselineBuckets:Object.freeze(baselineBuckets.slice()),baselineAverage,
        baselineSampleCount:baselineBuckets.length,totalVolume:total,buyVolume:buy,sellVolume:sell,
        buyPct:total>0?buy/total:0,sellPct:total>0?sell/total:0,delta:buy-sell,
        magnitudeRatio,totalLengthPct:total>0?(magnitudeRatio==null?50:clamp(magnitudeRatio*50,2,100)):0
      });
    }
    return Object.freeze({ingest,rollTo,reset,configure,snapshot});
  }

  window.BT001TakerVolumeDeltaCore=Object.freeze({createEngine,fixedBucketStart,relationshipModel,divergenceThresholds:Object.freeze({large:DIVERGENCE_LARGE,small:DIVERGENCE_SMALL,signMin:DIVERGENCE_SIGN_MIN})});
})();
