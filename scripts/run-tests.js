"use strict";
const {spawnSync}=require("child_process");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const testDirs=[path.join(root,"features"),path.join(root,"headless")].filter(fs.existsSync);

function findTestFiles(dir){
  const results=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())results.push(...findTestFiles(full));
    else if(entry.isFile()&&entry.name.endsWith(".tests.js"))results.push(full);
  }
  return results;
}

const files=testDirs.flatMap(findTestFiles).sort();
if(files.length===0){
  console.log("No *.tests.js files found.");
  process.exit(0);
}

const results=files.map(file=>{
  const relative=path.relative(root,file);
  const outcome=spawnSync(process.execPath,[file],{cwd:root,encoding:"utf8"});
  const passed=outcome.status===0;
  console.log(`${passed?"PASS":"FAIL"}  ${relative}`);
  if(!passed){
    const output=(outcome.stdout||"")+(outcome.stderr||"");
    console.log(output.trim().split("\n").map(line=>`    ${line}`).join("\n"));
  }
  return {relative,passed};
});

const failed=results.filter(result=>!result.passed);
console.log("");
console.log(`${results.length} test files, ${results.length-failed.length} passed, ${failed.length} failed`);
if(failed.length>0){
  console.log("Failed:",failed.map(result=>result.relative).join(", "));
  process.exitCode=1;
}
