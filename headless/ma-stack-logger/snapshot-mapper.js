"use strict";

const ENGINE_VERSION="ma-stack-vm-1";
const SCHEMA_VERSION=1;

function finite(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function boundedInteger(value){const parsed=finite(value);return parsed==null?null:Math.round(parsed);}
function isoTime(value){
  const parsed=finite(value);if(parsed==null)return null;
  const millis=Math.abs(parsed)<1e12?parsed*1000:parsed,date=new Date(millis);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function direction(value){const parsed=finite(value);return parsed>0?"bullish":parsed<0?"bearish":"neutral";}

function pairPeriods(event,slots){
  const indexes=String(event&&event.ref||"").match(/^MA(\d+)\/MA(\d+)$/i);
  if(!indexes)return null;
  const first=slots[Number(indexes[1])-1],second=slots[Number(indexes[2])-1];
  return first&&second?`EMA ${first.period} / EMA ${second.period}`:null;
}

function eventFields(event,slots){
  if(!event)return {
    ma_event_type:null,ma_event_pair:null,ma_event_pair_slots:null,ma_event_pair_class:null,ma_event_direction_raw:null,
    ma_event_outcome_direction:null,ma_event_age_candles:null,ma_event_at:null,ma_event_payload:null
  };
  const raw=finite(event.dir),failed=String(event.type||"").toLowerCase()==="failed crossover",outcome=raw==null?null:(failed?-raw:raw);
  return {
    ma_event_type:event.type||null,
    ma_event_pair:pairPeriods(event,slots),
    ma_event_pair_slots:event.ref||null,
    ma_event_pair_class:event.pairClass||null,
    ma_event_direction_raw:raw,
    ma_event_outcome_direction:outcome==null?null:direction(outcome),
    ma_event_age_candles:boundedInteger(event.age),
    ma_event_at:isoTime(event.time),
    ma_event_payload:{...event}
  };
}

function mapSnapshotRow(options={}){
  const result=options.result||{},metadata=options.metadata||{},candle=metadata.candle&&metadata.candle.current||null;
  if(!candle)throw new Error(`MA Stack ${options.timeframe||"unknown"} snapshot has no source candle`);
  const available=result.available!==false,rank=result.rank||{},leds=rank.diagnostics&&rank.diagnostics.ledStates||{};
  return {
    event_at:String(options.eventAt),capture_id:String(options.captureId),machine_id:String(options.machineId),symbol:String(options.symbol),timeframe:String(options.timeframe),
    candle_open_at:isoTime(candle.openTime),candle_close_at:isoTime(candle.closeTime),provisional:metadata.includeForming===true,
    available,unavailable_reason:available?null:String(result.unavailableReason||"classification-unavailable"),
    state:available?String(result.state||"mixed"):"mixed",phase:available?(result.phase||null):null,selected_regime:available?(rank.selectedRegime||null):null,
    setup_direction:available?boundedInteger(result.setup):null,strength:available?boundedInteger(result.strength):null,quality:available?boundedInteger(result.quality):null,
    alignment_pct:available?boundedInteger(result.alignment):null,adx:available?finite(result.adx):null,adx_shadow_5:available?finite(result.adxPrevious):null,
    led_ma1:available&&leds.MA1===true,led_ma2:available&&leds.MA2===true,led_ma3:available&&leds.MA3===true,led_ma4:available&&leds.MA4===true,led_ma5:available&&leds.MA5===true,
    led_match_count:available?boundedInteger(rank.okCount):null,ma_periods:Object.fromEntries(options.slots.map(slot=>[slot.slotId,slot.period])),
    spread_pct:available?finite(result.spreadPct):null,spread_atr:available?finite(result.spreadAtr):null,spread_score:available?boundedInteger(result.spreadScore):null,
    spread_label:available?(result.spreadLabel||null):null,spread_condition:available?(result.spreadCondition||null):null,
    ...eventFields(available?result.maEvent:null,options.slots),engine_version:ENGINE_VERSION,schema_version:SCHEMA_VERSION
  };
}

module.exports={ENGINE_VERSION,SCHEMA_VERSION,finite,isoTime,direction,pairPeriods,eventFields,mapSnapshotRow};
