"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.resolve(__dirname,"..","..");
const rapid=fs.readFileSync(path.join(__dirname,"rapidFireModule.js"),"utf8");
const calculator=fs.readFileSync(path.join(root,"features","calculator","presentation","calculatorModule.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"rapid-fire.css"),"utf8");

function between(source,startText,endText){
  const start=source.indexOf(startText);
  const end=source.indexOf(endText,start);
  assert(start>=0&&end>start,`missing source range ${startText}`);
  return source.slice(start,end);
}

(async()=>{
  assert(/id="rapidFireOpenSize" type="text" inputmode="decimal"/.test(rapid),"Remaining must use a decimal-preserving text draft input");
  assert(/id="rapidFireCloseSize" type="text" inputmode="decimal"/.test(rapid),"Close must use a decimal-preserving text draft input");
  const decimalContext={String};
  vm.createContext(decimalContext);
  vm.runInContext(between(rapid,"function decimalDraft","function protectionPlText"),decimalContext);
  assert.equal(decimalContext.decimalDraft("0."),"0.","an in-progress decimal point must be preserved");
  assert.equal(decimalContext.decimalDraft("0.005"),"0.005","0.005 must remain 0.005");
  assert.equal(decimalContext.decimalDraft("0..005"),"0.005","duplicate decimal points must be safely collapsed");

  assert(/id="rapidFireMasterSlPl" type="text"/.test(rapid)&&/id="rapidFireTakeProfitPl" type="text"/.test(rapid),"SL and TP P/L values must use decimal-preserving editable inputs");
  assert(rapid.includes("input.disabled=protectionBusy||!priceRules.available")&&!rapid.includes("input.disabled=!position||protectionBusy"),"protection inputs must stay enabled while flat once live price rules are available");
  assert(/\.rapid-fire-protection-pl-control\{[^}]*min-width:calc\(6ch \+ 23px\);[^}]*flex:1 0 calc\(6ch \+ 23px\);/s.test(css),"editable P/L fields must preserve their full six-character value and grow evenly in the compact RF layout");

  let referenceEntry=100;
  const conversionContext={
    rapidFireProtectionContext:()=>({entry:referenceEntry,quantity:2,direction:"LONG",exitRate:.001,entryCommission:.2}),
    normalizeRapidFirePrice:value=>({executable:true,text:String(value)}),
    num:value=>Number.isFinite(Number(value))?Number(value):null,
    currentSymbol:()=>"BTCUSDT",Number,String,Math,
    window:{BT001SymbolTradingSettings:{getCached:()=>({tickSize:.00000001}),normalizePrice:value=>String(value)}}
  };
  vm.createContext(conversionContext);
  vm.runInContext(between(calculator,"function rapidFireProtectionPriceFromPl","function rapidFireSnapshot"),conversionContext);
  assert.equal(Number(conversionContext.rapidFireProtectionPriceFromPl("tp",10)),105,"TP P/L-to-price conversion must remain fee-free");
  const slPrice=Number(conversionContext.rapidFireProtectionPriceFromPl("sl",-10));
  const slRoundTrip=(slPrice-referenceEntry)*2-.2-slPrice*2*.001;
  assert(Math.abs(slRoundTrip+10)<1e-9,"SL P/L-to-price conversion must include entry and exit fees");
  const firstFlatPrice=Number(conversionContext.rapidFireProtectionPriceFromPl("tp",10));
  referenceEntry=101;
  const movedFlatPrice=Number(conversionContext.rapidFireProtectionPriceFromPl("tp",10));
  assert.equal(movedFlatPrice-firstFlatPrice,1,"a flat P/L-driven estimate must follow the changing live reference price");

  const formatContext={
    num:value=>Number.isFinite(Number(value))?Number(value):null,
    clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
    toUpper:value=>String(value||"").toUpperCase(),String,Number,Math
  };
  vm.createContext(formatContext);
  vm.runInContext(between(calculator,"function formatChaseExecutionStatus","async function submitOpenPositionCloseChsLimit"),formatContext);
  const sellStatus=formatContext.formatChaseExecutionStatus({statusCode:"chasing",requestedQty:2,filledQty:1,price:"101.0",bestBid:"100.0",bestAsk:"101.0",meta:{orderSide:"SELL"}});
  const buyStatus=formatContext.formatChaseExecutionStatus({statusCode:"chasing",requestedQty:2,filledQty:1,price:"100.0",bestBid:"100.0",bestAsk:"101.0",meta:{orderSide:"BUY"}});
  assert(/best bid: 100\.0/.test(sellStatus.message),"sell-side chase status must show best bid");
  assert(/best ask: 101\.0/.test(buyStatus.message),"buy-side chase status must show best ask");

  let book={fresh:true,bid:100,ask:101};
  const projectionContext={
    window:{BT001_RAPID_FIRE_VISIBLE:true,PUBLIC_MARKET_DATA_HUB:{getTopOfBook:()=>book}},
    rapidFireNewAverageVisible:true,
    rapidFirePositionSnapshot:()=>({side:"LONG",qty:1,entry:99}),
    rapidFireAddDraft:{quantity:2,direction:"LONG"},
    normalizeRapidFireQuantity:value=>({quantity:Number(value),executable:Number(value)>0}),
    normalizedChasePrice:(_side,top)=>String(top.bid),
    openPositionCloseUi:{chsDistTicks:0},
    getArchitectureServices:()=>({domain:{weightedAverage:rows=>{const qty=rows.reduce((sum,row)=>sum+row.lot,0);return {qty,avg:rows.reduce((sum,row)=>sum+row.level*row.lot,0)/qty};}}}),
    normalizeRapidFirePrice:value=>({executable:true,text:Number(value).toFixed(2)}),
    fmtPrice:value=>String(value),num:value=>Number.isFinite(Number(value))?Number(value):null,
    Math,Number,String
  };
  vm.createContext(projectionContext);
  vm.runInContext(between(calculator,"function rapidFireNewAverageRow","function currentOverlayRows"),projectionContext);
  assert.equal(projectionContext.rapidFireNewAverageRow(null).level,(99+200)/3,"RF New Average must use Calculator's weighted-average service and the normalized chase anchor");
  book={fresh:true,bid:103,ask:104};
  assert.equal(projectionContext.rapidFireNewAverageRow(null).level,(99+206)/3,"RF New Average must recalculate from the moving top of book");
  projectionContext.rapidFireAddDraft.quantity=0;
  assert.equal(projectionContext.rapidFireNewAverageRow(null),null,"RF New Average must disappear when Add quantity is zero");

  let slPlaced=0,tpPlaced=0,positionReads=0,lastSlPrice=null,lastTpPrice=null;
  const stagingContext={
    num:value=>Number.isFinite(Number(value))?Number(value):null,
    rapidFireConfirmedFilledPosition:async()=>{positionReads+=1;return {qty:1,entry:100};},
    refreshRapidFireProtectionFees:async()=>{},
    rapidFireProtectionPriceFromPl:(kind,value,options)=>{assert.equal(options.position.entry,100);return kind==="sl"?95+Number(value):110+Number(value);},
    executeRapidFireMasterStop:async price=>{slPlaced+=1;lastSlPrice=Number(price);return {ok:true};},
    executeRapidFireTakeProfit:async price=>{tpPlaced+=1;lastTpPrice=Number(price);return {ok:true};},
    publishRapidFireStatus:()=>{},String,Array
  };
  vm.createContext(stagingContext);
  vm.runInContext(between(calculator,"async function placeRapidFireStagedProtections","function ensureRapidFireChaseEngine"),stagingContext);
  const staged={stagedProtection:{slPrice:95,tpPrice:110}};
  await stagingContext.placeRapidFireStagedProtections(staged,{statusCode:"chasing"});
  assert.deepEqual([slPlaced,tpPlaced,positionReads],[0,0,0],"sent or chasing Add orders must not place staged protection");
  await stagingContext.placeRapidFireStagedProtections(staged,{statusCode:"filled"});
  assert.deepEqual([slPlaced,tpPlaced,positionReads],[1,1,1],"a confirmed Add fill must place each staged protection exactly once");
  await stagingContext.placeRapidFireStagedProtections({stagedProtection:{slPl:-5,tpPl:10}},{statusCode:"filled"});
  assert.deepEqual([lastSlPrice,lastTpPrice],[90,120],"P/L-driven staged protection must be recalculated from the confirmed position before placement");
  assert(calculator.includes('stagedProtection:action==="add"&&!hasPosition')&&calculator.includes('String(state&&state.statusCode||state&&state.result||"").toLowerCase()!=="filled"'),"staging must be limited to flat Add and confirmed fill completion");

  assert(rapid.includes('kind==="sl"?bridge.cancelTakeProfit:bridge.cancelMasterStop')||rapid.includes('kind==="tp"?bridge.cancelTakeProfit:bridge.cancelMasterStop'),"SL clear must route to the Master SL cancel bridge");
  assert(calculator.includes('mode:"sl-cancel"')&&calculator.includes("Master SL cancellation was not confirmed."),"Master SL clear must use Binance algo cancellation and authoritative confirmation");

  console.log("RF TP/SL staging, projection, status, and decimal regression tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
