"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const series=require("./canonical-candle-series.js");

const merge=(existing,incoming)=>({...existing,...incoming,high:Math.max(existing.high,incoming.high),low:Math.min(existing.low,incoming.low)});
const first={time:100,open:10,high:11,low:9,close:10,final:false,source:"ws"};
const update={time:100,open:10,high:12,low:8,close:11,final:false,source:"ws"};
let forming=null,warnings=[];
forming=series.upsertForming(forming,first,merge);
forming=series.upsertForming(forming,update,merge);
assert.equal(forming.time,100);
assert.equal(forming.close,11);
assert.equal(forming.high,12);
assert.equal(forming.low,8);
assert.equal(warnings.length,0,"same-open-time forming churn is expected and must not warn");

const closed=[];
const finalRow={...update,final:true};
series.upsertFinalized(closed,finalRow,{source:"ws",merge,warn:detail=>warnings.push(detail)});
series.upsertFinalized(closed,{...finalRow,close:11.5},{source:"ws",merge,warn:detail=>warnings.push(detail)});
assert.equal(closed.length,1,"a repeated finalized open time must never create a second canonical row");
assert.equal(warnings.length,1,"a genuine repeated finalized WS candle must be diagnosed");
assert.equal(warnings[0].existing.time,warnings[0].incoming.time);

series.upsertFinalized(closed,{...finalRow,source:"rest"},{source:"rest",merge,warn:detail=>warnings.push(detail)});
assert.equal(closed.length,1);
assert.equal(warnings.length,1,"expected REST reconciliation overlap must not create warning noise");

series.upsertFinalized(closed,{...finalRow,time:160},{source:"ws",merge,warn:detail=>warnings.push(detail)});
assert(series.strictlyIncreasingUnique(closed));
assert(!series.strictlyIncreasingUnique([closed[0],{...closed[0]}]));
assert(!series.strictlyIncreasingUnique([closed[1],closed[0]]));

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const assertionIndex=main.indexOf("canonicalSeries.strictlyIncreasingUnique(normalizedRows)");
const emaIndex=main.indexOf("const built = buildAlignedEmaSeries(rows,slot.period)",assertionIndex);
assert(assertionIndex>=0&&emaIndex>assertionIndex,"canonical uniqueness must be asserted before rows reach EMA calculation");

console.log("canonical candle series tests: PASS");
