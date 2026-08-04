"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");
const calc=require("./calculation.js");
const {directionRelativeAcceleration,createGaugeTracker}=require("./gauge-presentation.js");

const slots=[9,21,55,100,200].map((period,index)=>({slot:index+1,slotId:`MA${index+1}`,period}));
const baseTime=1700000000;

function weakeningBearishDiagnostic(recentStep){
  let close=200,previous=close;
  const rows=[];
  for(let index=0;index<1000;index++){
    const step=index<984
      ?-.03+Math.sin(index*.7)*.01
      :index<992
        ?-.05+Math.sin(index*1.1)*.01
        :recentStep+Math.sin(index*1.3)*.01;
    close+=step;
    rows.push({
      time:baseTime+index*60,open:previous,close,
      high:Math.max(previous,close)+.05,low:Math.min(previous,close)-.05,final:true
    });
    previous=close;
  }
  return {
    rows,
    diagnostic:calc.calculateTimeframe({label:"1M",interval:"1m",rows,slots,minimumRows:600,fullRows:1000})
  };
}

// End-to-end reproduction: price has turned upward, the bearish EMA structure is still declining
// but less steeply, and its gaps are contracting. Unsigned expansion/contraction remains useful and
// negative, while the direction-relative acceleration must warn with a negative gauge value.
const reproduced=weakeningBearishDiagnostic(.06),bearish=reproduced.diagnostic;
assert.equal(bearish.available,true);
assert.equal(bearish.state,"Bearish");
assert(bearish.direction<0);
assert(reproduced.rows.at(-1).close>reproduced.rows.at(-2).close,"the current price move must be upward");
for(const slotId of ["MA2","MA3","MA4"]){
  const series=bearish.emasBySlot[slotId],recentMove=series.at(-1).value-series.at(-9).value,priorMove=series.at(-9).value-series.at(-17).value;
  assert(recentMove<0,`${slotId} must still be declining`);
  assert(Math.abs(recentMove)<Math.abs(priorMove),`${slotId} decline must be weakening`);
}
const normalization=calc.buildNormalization(reproduced.rows,"1m",reproduced.rows.at(-1).close);
const priorValues=bearish.slots.map(slot=>bearish.emasBySlot[slot.slotId].at(-9).value);
const priorGaps=priorValues.slice(0,-1).map((value,index)=>Math.abs(value-priorValues[index+1])/normalization.atrAtHorizon);
bearish.normalizedDistances.adjacentGaps.forEach((gap,index)=>assert(gap<priorGaps[index],`gap ${index+1} must be contracting`));
assert(bearish.expansionContraction<0,"unsigned magnitude-change must retain its contraction meaning");
assert.equal(bearish.acceleration,bearish.expansionContraction,"legacy aggregate acceleration remains the unsigned compatibility alias");
assert(bearish.signedAcceleration>0,"signed acceleration must identify the upward reversal impulse");
assert(bearish.directionalAcceleration<0,"upward acceleration must oppose an established bearish direction");
assert.equal(directionRelativeAcceleration(bearish),bearish.directionalAcceleration);

// Two complete OHLC calculation cycles drive both the current and shadow needles.
const priorCycle=weakeningBearishDiagnostic(.05).diagnostic;
const tracker=createGaugeTracker();
tracker.update([priorCycle]);
assert.deepEqual(tracker.reading("1M"),{current:priorCycle.directionalAcceleration,previous:null});
tracker.update([bearish]);
assert.deepEqual(tracker.reading("1M"),{current:bearish.directionalAcceleration,previous:priorCycle.directionalAcceleration});
tracker.update([bearish]);
assert.deepEqual(tracker.reading("1M"),{current:bearish.directionalAcceleration,previous:priorCycle.directionalAcceleration});

// The actual row renderer consumes the tracker, and the detail view distinguishes the two metrics.
const main=fs.readFileSync(path.resolve(__dirname,"..","..","..","main.js"),"utf8");
const rowStart=main.indexOf("function rowHtml(d)");
const rowEnd=main.indexOf("function render(force=false)",rowStart);
const rowSource=main.slice(rowStart,rowEnd);
assert(rowSource.includes("powerGauge(gaugeTracker.reading(d.tf))"));
assert(!rowSource.includes("powerGauge(d.directionalStrength"));
assert(main.includes("Expansion / contraction: ${signed(d.expansionContraction)}"));
assert(main.includes("Directional acceleration: ${signed(d.directionalAcceleration)}"));
assert(main.includes('class="ghostNeedle" data-gauge-previous="${prev}"'));
const index=fs.readFileSync(path.resolve(__dirname,"..","..","..","index.html"),"utf8");
assert(index.indexOf("features/pressure-signal/sssc/gauge-presentation.js")<index.indexOf('src="main.js"'),"gauge presentation must load before the row renderer");
assert(index.includes("<div>MOMENTUM</div><div>SCORE</div>"));

console.log("sssc gauge presentation tests: PASS");
