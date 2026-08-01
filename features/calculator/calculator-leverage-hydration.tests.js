"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const source=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");

function functionSource(name){
  const marker=`  function ${name}(`;
  const start=source.indexOf(marker);
  assert(start>=0,`${name} must exist`);
  const bodyStart=source.indexOf("{",start);
  let depth=0;
  for(let index=bodyStart;index<source.length;index++){
    if(source[index]==="{")depth++;
    else if(source[index]==="}"){
      depth--;
      if(depth===0)return source.slice(start,index+1).trim();
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

(async()=>{
  const ensureSource=functionSource("ensureSymbolSettingsLoaded");
  assert(!ensureSource.includes("finally(() => {\n        lastSettingsRequestedSymbol = \"\";\n        try{ calculate();"),"settling a null result must not automatically recalculate");

  let now=1000,helperCalls=0,httpRequests=0,calculations=0,cached=null,nextLeverage=null,ensure=null;
  const helper={
    getCached:()=>cached,
    get:async symbol=>{
      helperCalls++;
      httpRequests+=4; // exchangeInfo plus the three signed settings endpoints
      cached={symbol,leverage:nextLeverage,loadedAt:now,status:"ready"};
      return cached;
    }
  };
  const calculate=()=>{calculations++;ensure();};
  ensure=new Function(
    "window","currentSymbol","calculate","num","Date","lastSettingsRequestedSymbol","settledNullLeverageAtBySymbol","SYMBOL_SETTINGS_CACHE_WINDOW_MS",
    `return (${ensureSource});`
  )(
    {BT001SymbolTradingSettings:helper},
    ()=>"BTCUSDT",
    calculate,
    value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;},
    {now:()=>now},
    "",
    new Map(),
    30000
  );

  ensure();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(helperCalls,1,"null leverage must start exactly one settings bundle");
  assert.equal(httpRequests,4,"that bundle must contain one public and three signed requests");
  assert.equal(calculations,0,"null leverage must settle without self-scheduling calculate()");

  ensure();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(helperCalls,1,"another calculation inside the same cache window must reuse the settled null result");

  now+=30001;
  nextLeverage=25;
  ensure();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(helperCalls,2,"an externally triggered calculation after cache expiry must retry settings hydration");
  assert.equal(httpRequests,8,"the legitimate retry must issue exactly one new bundle");
  assert.equal(calculations,1,"newly available leverage must update Calculator margin once");

  const setMarginSource=functionSource("setMargin");
  const setMargin=new Function("num",`return (${setMarginSource});`)(value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;});
  const node={textContent:"",title:""};
  setMargin(node,{value:null,unavailable:true});
  assert.equal(node.textContent,"-","unavailable leverage must use the normal unavailable margin glyph");
  assert.equal(node.title,"Leverage unavailable");

  console.log("calculator leverage hydration tests passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
