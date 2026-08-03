"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {create}=require("./visibility-recovery-gate.module.js");

(async()=>{
  async function exerciseArea(name,windowMs){
    let clock=0,areaRuns=0;
    const areaGate=create({windowMs,now:()=>clock,skippedReason:`recent-${name}`});
    await areaGate.run(`${name}:first`,async()=>{areaRuns+=1;});
    clock=1;
    await areaGate.run(`${name}:rapid-focus`,async()=>{areaRuns+=1;});
    await areaGate.run(`${name}:rapid-pageshow`,async()=>{areaRuns+=1;});
    assert.equal(areaRuns,1,`${name}: rapid events must produce one real pass`);
    assert.equal(areaGate.diagnostics().suppressedAttempts,2,`${name}: suppressed attempts must be diagnosed`);
    clock=windowMs;
    await areaGate.run(`${name}:after-window`,async()=>{areaRuns+=1;});
    assert.equal(areaRuns,2,`${name}: an event after the window must run`);
    clock=windowMs*2;
    await assert.rejects(areaGate.run(`${name}:failure`,async()=>{areaRuns+=1;throw new Error(`${name} failed`);}),new RegExp(`${name} failed`));
    await areaGate.run(`${name}:failure-retry`,async()=>{areaRuns+=1;});
    assert.equal(areaGate.diagnostics().completedRuns,3,`${name}: a failure must permit immediate retry`);
    assert.equal(areaGate.diagnostics().lastRunReason,`${name}:failure-retry`);
  }

  await exerciseArea("main-account",30000);
  await exerciseArea("public-market",30000);
  await exerciseArea("sssc",60000);

  let now=1000,runs=0;
  const gate=create({windowMs:30000,now:()=>now,skippedReason:"recent-test-recovery"});
  await gate.run("direct-listener:focus",async()=>{runs+=1;});
  now=1005;
  const directDuplicate=await gate.run("direct-listener:pageshow",async()=>{runs+=1;});
  const publicDuplicate=await gate.run("public-market-handler",async()=>{runs+=1;});
  assert.equal(runs,1,"direct and public-market trigger paths must share one cooldown state");
  assert.equal(directDuplicate.skipped,true);
  assert.equal(publicDuplicate.skipped,true);
  assert.equal(gate.diagnostics().suppressedAttempts,2);

  now=31000;
  await gate.run("after-window",async()=>{runs+=1;});
  assert.equal(runs,2,"a return after the debounce window must run");
  assert.equal(gate.diagnostics().completedRuns,2);

  now=62000;
  await assert.rejects(gate.run("failed-attempt",async()=>{runs+=1;throw new Error("temporary failure");}),/temporary failure/);
  assert.equal(gate.diagnostics().completedRuns,2,"failed attempts must not count as completed");
  assert.equal(gate.diagnostics().lastCompletedAt,31000,"failed attempts must not advance the cooldown anchor");
  assert.equal(gate.diagnostics().lastError,"temporary failure");
  await gate.run("immediate-retry",async()=>{runs+=1;});
  assert.equal(gate.diagnostics().completedRuns,3,"a failed attempt must permit immediate retry");
  assert.equal(gate.diagnostics().lastRunReason,"immediate-retry");

  let resolveInFlight,inFlightRuns=0;
  now=93000;
  const first=gate.run("in-flight-first",()=>{inFlightRuns+=1;return new Promise(resolve=>{resolveInFlight=resolve;});});
  const joined=gate.run("in-flight-duplicate",async()=>{inFlightRuns+=1;});
  assert.equal(inFlightRuns,1,"in-flight attempts must coalesce");
  resolveInFlight(true);
  await Promise.all([first,joined]);
  assert.equal(gate.diagnostics().completedRuns,4);

  let routedNow=0,mainRuns=0,scalpRuns=0;
  const routedMainGate=create({windowMs:30000,now:()=>routedNow});
  const routedScalpGate=create({windowMs:30000,now:()=>routedNow});
  async function routedAuthenticatedRecovery(reason){
    await routedMainGate.run(reason,async()=>{mainRuns+=1;routedNow+=10;});
    await routedScalpGate.run(reason,async()=>{scalpRuns+=1;routedNow+=10;});
  }
  await routedAuthenticatedRecovery("focus-visibility-recovery:focus");
  routedNow+=1;
  await routedAuthenticatedRecovery("public-visibility-return");
  assert.equal(mainRuns,1);
  assert.equal(scalpRuns,1);
  assert.equal(routedMainGate.diagnostics().suppressedAttempts,1);
  assert.equal(routedScalpGate.diagnostics().suppressedAttempts,1,"outer main suppression must not hide the attempt from SCALP's independent gate");
  assert.notEqual(routedMainGate.diagnostics().lastCompletedAt,routedScalpGate.diagnostics().lastCompletedAt,"main and SCALP completion anchors must be recorded independently");

  const root=path.resolve(__dirname,"..","..");
  const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert(html.includes('features/api/visibility-recovery-gate.module.js'),"the browser must load the shared visibility gate before main.js");
  assert(main.includes('mainVisibilityRecoveryGate21.run(reason,runReason=>performVisibleAccountsRecovery21(runReason,smartDecision))'),"both main-account entry points must route through one gate after independently evaluating stream evidence");
  const mainWorkStart=main.indexOf("async function performVisibleAccountsRecovery21"),mainEntryStart=main.indexOf("async function recoverVisibleAccounts21",mainWorkStart),mainEntryEnd=main.indexOf("window.BT001VisibilityRecovery=",mainEntryStart);
  const mainWorkSource=main.slice(mainWorkStart,mainEntryStart),mainEntrySource=main.slice(mainEntryStart,mainEntryEnd);
  assert(!mainWorkSource.includes("scalpVisibilityRecoveryGate21.run"),"SCALP's gate must not be nested inside the main-account gate");
  assert(mainEntrySource.includes("await mainVisibilityRecoveryGate21.run")&&mainEntrySource.includes("await scalpVisibilityRecoveryGate21.run"),"every visibility attempt must reach the independent main and SCALP gates in sequence");
  assert(main.includes('publicMarketVisibilityRecoveryGate.run(reason,runPublicMarketVisibilityRecovery)'),"public market visibility work must use its post-completion gate");
  assert(main.includes('ssscVisibilityRecoveryGate.run(reason,async()=>'),"SSSC visibility work must use its post-completion gate");
  assert(main.includes('windowMs:MAIN_VISIBILITY_RECOVERY_DEBOUNCE_MS21')&&main.includes('windowMs:PUBLIC_MARKET_VISIBILITY_DEBOUNCE_MS')&&main.includes('windowMs:SSSC_VISIBILITY_RECOVERY_DEBOUNCE_MS'));
  assert(main.includes('const main=mainVisibilityRecoveryGate21.diagnostics()')&&main.includes('return {active:main.inFlight,runs:main.completedRuns,main,'));
  assert(main.includes('get:()=>publicMarketVisibilityRecoveryGate.diagnostics()'));
  assert(main.includes('visibilityRecoveryDiagnostics:()=>ssscVisibilityRecoveryGate.diagnostics()'));
  assert(main.includes('window.BT001VisibilityBurstDiagnostics=()=>'));

  console.log("visibility recovery gate tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
