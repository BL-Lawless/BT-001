"use strict";

const path=require("path");

const TABLE="ma_stack_snapshots";
const TIMEFRAMES=Object.freeze(["1m","3m","5m","15m","30m","1h","4h","1d"]);
const LIVE_TIMEFRAMES=Object.freeze(["1m","3m","5m","15m","30m"]);
const CLOSED_TIMEFRAMES=Object.freeze(["1h","4h","1d"]);
const VOLATILITY_MINIMUM_ROWS=28;

function required(env,key){
  const value=String(env&&env[key]||"").trim();
  if(!value)throw new Error(`${key} is required`);
  return value;
}

function positiveInteger(value,fallback,name){
  const parsed=Number(value==null||value===""?fallback:value);
  if(!Number.isInteger(parsed)||parsed<=0)throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parsePeriods(raw="9,21,55,100,200"){
  const values=String(raw).split(",").map(value=>Number(value.trim()));
  if(values.length!==5||values.some(value=>!Number.isInteger(value)||value<1||value>999)){
    throw new Error("MA_STACK_MA_PERIODS must contain exactly five integers from 1 to 999");
  }
  return Object.freeze(values);
}

function loadMaStackEnv(options={}){
  const dotenv=options.dotenv||require("dotenv");
  const envPath=options.path||path.resolve(__dirname,"..","..",".env.ma-stack");
  dotenv.config({path:envPath,quiet:true});
  return envPath;
}

function readMaStackConfig(env=process.env){
  const symbol=String(env.MA_STACK_SYMBOL||"BTCUSDT").trim().toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol))throw new Error("MA_STACK_SYMBOL must be an uppercase Binance symbol without separators");
  const maPeriods=parsePeriods(env.MA_STACK_MA_PERIODS||"9,21,55,100,200");
  const minimumRows=Math.max(Math.max(...maPeriods)+10,VOLATILITY_MINIMUM_ROWS);
  return Object.freeze({
    table:TABLE,
    timeframes:TIMEFRAMES,
    liveTimeframes:LIVE_TIMEFRAMES,
    closedTimeframes:CLOSED_TIMEFRAMES,
    symbol,
    maPeriods,
    minimumRows,
    bufferRows:minimumRows+25,
    provisionalIntervalMs:positiveInteger(env.MA_STACK_PROVISIONAL_INTERVAL_MS,30000,"MA_STACK_PROVISIONAL_INTERVAL_MS"),
    machineId:required(env,"MA_STACK_MACHINE_ID"),
    supabaseUrl:required(env,"SUPABASE_URL").replace(/\/+$/,""),
    supabaseAnonKey:required(env,"SUPABASE_ANON_KEY"),
    restUrl:String(env.MA_STACK_BINANCE_REST_URL||"https://fapi.binance.com").replace(/\/+$/,""),
    wsUrl:String(env.MA_STACK_BINANCE_WS_URL||"wss://fstream.binance.com/market/stream").replace(/\/+$/,""),
    spoolPath:path.resolve(String(env.MA_STACK_SPOOL_PATH||path.resolve(__dirname,"..","..","artifacts","ma-stack-supabase-spool.jsonl")))
  });
}

module.exports={TABLE,TIMEFRAMES,LIVE_TIMEFRAMES,CLOSED_TIMEFRAMES,VOLATILITY_MINIMUM_ROWS,required,positiveInteger,parsePeriods,loadMaStackEnv,readMaStackConfig};
