"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..","..");

// Minimal DOM stand-in covering only what richTokens()/priceTokens() actually calls:
// document.createDocumentFragment/createElement/createTextNode, and appendChild.
class FakeNode{constructor(textContent=""){this.textContent=textContent;this.children=[];}appendChild(child){this.children.push(child);return child;}}
class FakeElement extends FakeNode{constructor(tagName){super("");this.tagName=tagName;this.className="";}}

function runtime(){
  const context={console,Map,Set,Array,Object,String,Number,Boolean,Date,Promise,JSON,Math,Error,TypeError};
  context.window=context;
  context.document={
    createDocumentFragment:()=>new FakeNode(),
    createElement:tag=>new FakeElement(tag),
    createTextNode:text=>new FakeNode(text)
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(repo,"features/pressure-signal/diagnostics/reporting.js"),"utf8"),context,{filename:"reporting.js"});
  return {build:context.__PRESSURE_SIGNAL_FEATURE_BUILD__};
}

// Fragments here are always flat (text nodes and <strong> elements appended directly, no
// nesting), so concatenating each child's textContent in order reproduces exactly what a
// browser's fragment.textContent would render.
function renderedText(fragment){return fragment.children.map(child=>child.textContent).join("");}

async function run(){
  const {build}=runtime(),reporting=build.reporting,cases={};

  // Regression for the "13.400000" -> "13.400,000" bug: a small relative-delta value (short
  // integer part, long decimal tail) must render byte-for-byte unchanged -- never split into a
  // thousands-comma group anywhere, since the tail is a decimal fraction, not its own price.
  const beforeLine="Relative to trigger: BEFORE BY 13.400000";
  const beforeText=renderedText(reporting.priceTokens(beforeLine));
  assert.equal(beforeText,beforeLine,"a small relative-delta value must render unchanged, not comma-split");
  assert(!beforeText.includes("13.400,000"),`must never mangle into the split form, got: ${beforeText}`);
  assert(!/\d,\d{3}/.test(beforeText),"no comma-grouped digit run should appear anywhere in this line");
  cases.smallDeltaValueNeverCommaSplit=true;

  // Same two lines already validated manually: genuine 5-digit prices (whole number and a
  // dash-separated range) must still be detected and comma-formatted as full price tokens.
  const realPriceLine="Location/structure: Structural retest on 5m; level 65853.000000; zone 65850.000000 - 65856.000000";
  const realPriceText=renderedText(reporting.priceTokens(realPriceLine));
  assert.equal(realPriceText,"Location/structure: Structural retest on 5m; level 65,853; zone 65,850–65,856");
  cases.realPricesAndRangesStillFormatCorrectly=true;

  console.log("pressure-signal reporting tests: PASS",cases);
  return cases;
}
module.exports=run;if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
