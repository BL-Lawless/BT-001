"use strict";

const fs=require("fs");
const path=require("path");

const DEFAULT_SNAPSHOT_PATH=path.resolve(__dirname,"..","artifacts","sssc-latest.json");

function snapshotPath(env=process.env){return path.resolve(String(env.SSSC_SNAPSHOT_PATH||DEFAULT_SNAPSHOT_PATH));}

function writeAtomicSnapshot(filePath,payload){
  if(!payload||typeof payload!=="object")return false;
  const target=path.resolve(filePath),directory=path.dirname(target),temporary=`${target}.${process.pid}.tmp`;
  fs.mkdirSync(directory,{recursive:true});
  try{fs.writeFileSync(temporary,JSON.stringify(payload),{encoding:"utf8",mode:0o600});fs.renameSync(temporary,target);return true;}
  finally{try{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}catch(_error){}}
}

function readSnapshot(filePath){
  try{return JSON.parse(fs.readFileSync(path.resolve(filePath),"utf8"));}catch(_error){return null;}
}

module.exports={DEFAULT_SNAPSHOT_PATH,snapshotPath,writeAtomicSnapshot,readSnapshot};
