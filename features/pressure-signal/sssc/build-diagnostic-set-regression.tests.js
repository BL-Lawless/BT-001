"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const calculation=require("./calculation.js");

const source=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");

function extractFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert(start>=0,`${name} must exist in main.js`);
  const bodyStart=source.indexOf("{",start);
  let depth=0;
  for(let index=bodyStart;index<source.length;index++){
    if(source[index]==="{")depth++;
    else if(source[index]==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`Could not extract ${name}`);
}

const buildSource=extractFunction("buildDiagnosticSet");
const confirmed={
  tf:"15M",interval:"15m",available:true,direction:25,magnitude:30,
  phase:"Pullback / Retest",clean:25,crosses:{c12:{forming:false}},
  events:{vwap:"Hold",earlyWarning:"None"}
};
const live={
  ...confirmed,direction:-10,magnitude:5,
  phase:"Bearish Transition",crosses:{c12:{forming:true}},
  events:{vwap:"Loss",earlyWarning:"None"}
};
let calculationCalls=0;
const engine={
  calculateTimeframe(){
    calculationCalls++;
    return calculationCalls===1?confirmed:live;
  },
  deriveEarlyWarning:calculation.deriveEarlyWarning
};
const closedRows=Array.from({length:4},(_,index)=>({time:index+1,close:100+index}));
const formingRow={time:5,close:90};

const buildDiagnosticSet=Function(
  "currentMaSlots","calc","warmupTargets","privateCandlesByTf","privateFormingByTf",
  "LIVE_DIAG_TFS","decorateDiagnostic",
  `"use strict";${buildSource};return buildDiagnosticSet;`
)(
  ()=>[9,21,55,100,200].map((period,index)=>({slotId:`MA${index+1}`,period})),
  ()=>engine,
  ()=>({minimum:3,full:5}),
  {"15m":closedRows},
  {"15m":formingRow},
  new Set(["15m"]),
  value=>value
);

let result;
assert.doesNotThrow(()=>{result=buildDiagnosticSet("15M","15m");});

assert(Object.isFrozen(live),"deriveEarlyWarning must freeze the live diagnostic fixture");
assert.notStrictEqual(result,live,"the updated diagnostic set must be a spread copy");
assert.notStrictEqual(result.events,live.events,"events must be updated with a spread copy");
assert.equal(result.mode,"live");
assert.equal(result.liveDiagnostic,live);
assert.equal(result.earlyWarning.label,"Unconfirmed cross forming");
assert.equal(result.events.earlyWarning,"Unconfirmed cross forming");
assert.equal(live.events.earlyWarning,"None","the frozen live diagnostic must not be mutated");

console.log("sssc build diagnostic set frozen-live regression test: PASS");
