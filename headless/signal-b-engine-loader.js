"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");

function loadSignalBEngine(options={}){
  const filename=options.filename||path.resolve(__dirname,"../features/pressure-signal/engines/engine-b.js");
  const window={};
  vm.runInNewContext(fs.readFileSync(filename,"utf8"),{window,console,Map,Set,Date,Math,Number,String,Object,Array,JSON},{filename});
  if(typeof window.createSignalEngineB!=="function")throw new Error("Signal B engine factory was not exported");
  return window.createSignalEngineB();
}

module.exports={loadSignalBEngine};
