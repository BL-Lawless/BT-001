"use strict";

const path=require("path");

function loadDotEnv(options={}){
  const dotenv=options.dotenv||require("dotenv");
  const envPath=options.path||path.resolve(__dirname,"..",".env");
  dotenv.config({path:envPath,quiet:true});
}

function required(env,key){
  const value=String(env&&env[key]||"").trim();
  if(!value)throw new Error(`${key} is required`);
  return value;
}

function parsePeriods(raw){
  const values=String(raw||"9,21,55,100,200").split(",").map(value=>Number(value.trim()));
  if(values.length!==5||values.some(value=>!Number.isInteger(value)||value<=0))throw new Error("SSSC_MA_PERIODS must contain exactly five positive integers");
  return values;
}

function readConfig(env=process.env){
  const supabaseUrl=required(env,"SUPABASE_URL").replace(/\/+$/,"");
  const supabaseAnonKey=required(env,"SUPABASE_ANON_KEY");
  const machineId=required(env,"BT001_MACHINE_ID");
  const symbol=required(env,"BT001_SYMBOL").toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))throw new Error("BT001_SYMBOL must be an uppercase Binance symbol without separators");
  return Object.freeze({
    supabaseUrl,supabaseAnonKey,machineId,
    symbol,
    binanceRestUrl:String(env.BINANCE_REST_URL||"https://fapi.binance.com").replace(/\/+$/,""),
    binanceWsUrl:String(env.BINANCE_WS_URL||"wss://fstream.binance.com/market/stream").replace(/\/+$/,""),
    maPeriods:Object.freeze(parsePeriods(env.SSSC_MA_PERIODS))
  });
}

module.exports={loadDotEnv,readConfig,required,parsePeriods};
