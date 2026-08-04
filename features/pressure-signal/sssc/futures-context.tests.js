"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

(async()=>{
  const root=path.resolve(__dirname,"..","..",".."),calls=[];
  const responses={
    BTCUSDT:{lastFundingRate:"0.00010000",openInterest:"12345.678"},
    BTCUSDC:{lastFundingRate:"-0.00002500",openInterest:"9876.543"}
  };
  const fetch=async url=>{
    calls.push(String(url));const parsed=new URL(url),symbol=parsed.searchParams.get("symbol"),shape=responses[symbol];
    assert(shape,`unexpected symbol ${symbol}`);
    return {ok:true,status:200,json:async()=>parsed.pathname.endsWith("/premiumIndex")?{symbol,lastFundingRate:shape.lastFundingRate,markPrice:"62000.1"}:{symbol,openInterest:shape.openInterest,time:1770000000000}};
  };
  const context={window:null,fetch,Date,Number,String,Object,Promise,Math,URL,encodeURIComponent};context.window=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,"futures-context.module.js"),"utf8"),context,{filename:"futures-context.module.js"});
  const source=context.BT001SsscFuturesContext;

  const usdt=await source.fetchCurrent("BTCUSDT",fetch),usdc=await source.fetchCurrent("BTCUSDC",fetch);
  assert.deepEqual({symbol:usdt.symbol,funding_rate:usdt.funding_rate,open_interest:usdt.open_interest},{symbol:"BTCUSDT",funding_rate:.0001,open_interest:12345.678});
  assert.deepEqual({symbol:usdc.symbol,funding_rate:usdc.funding_rate,open_interest:usdc.open_interest},{symbol:"BTCUSDC",funding_rate:-.000025,open_interest:9876.543});
  assert(calls.some(url=>url==="https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"));
  assert(calls.some(url=>url==="https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"));
  assert(calls.some(url=>url.endsWith("premiumIndex?symbol=BTCUSDC"))&&calls.some(url=>url.endsWith("openInterest?symbol=BTCUSDC")),"both endpoints must use the currently selected BTCUSDC symbol");

  const eventAt="2026-08-04T10:00:00.000Z",display=source.displayText({...usdt,event_at:eventAt},Date.parse("2026-08-04T10:00:30.000Z"),()=>"04/08/2026, 10:00:00");
  assert.equal(display,"Funding rate: 0.00010000 · Open interest: 12,345.678 · As of 04/08/2026, 10:00:00 (30s ago)");

  const main=fs.readFileSync(path.join(root,"main.js"),"utf8"),supabase=fs.readFileSync(path.join(root,"services","supabase.service.js"),"utf8");
  const refresh=main.slice(main.indexOf("function refreshFuturesContext()"),main.indexOf("function renderFuturesContext()"));
  assert(refresh.includes("BT001SsscFuturesContext")&&refresh.includes("fetchCurrent(symbol)"));
  assert(!/Supabase|getLatestFuturesMarketSnapshot|futures_market_snapshots/.test(refresh),"SSSC futures context must not call Supabase");
  assert(!supabase.includes("getLatestFuturesMarketSnapshot")&&!supabase.includes("futures_market_snapshots"),"the browser Supabase service must expose no futures snapshot read path");
  console.log("SSSC futures context tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
