"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {spawnSync} = require("child_process");

const root = path.resolve(__dirname,"..");
const html = fs.readFileSync(path.join(root,"standalone.html"),"utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(),"bt001-inline-check-"));
const pattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let match,index=0,checked=0,failures=0;

while((match=pattern.exec(html))){
  index+=1;
  const attrs=match[1]||"";
  const source=match[2];
  const embedded=(attrs.match(/data-bundle-path="([^"]+)"/i)||[])[1];
  const marker=embedded||(source.match(/\/\* bundled: ([^*]+) \*\//)||[])[1]||`inline-${index}`;
  const file=path.join(temp,`inline-${String(index).padStart(3,"0")}.js`);
  fs.writeFileSync(file,source,"utf8");
  const result=spawnSync(process.execPath,["--check",file],{encoding:"utf8"});
  checked+=1;
  if(result.status!==0){
    failures+=1;
    console.error(`FAIL block ${index}: ${marker.trim()}`);
    console.error((result.stderr||result.stdout||"").trim());
  }
}

fs.rmSync(temp,{recursive:true,force:true});
console.log(`Checked ${checked} inline and embedded script blocks; ${failures} failed.`);
process.exitCode=failures?1:0;
