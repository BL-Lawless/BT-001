"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const {createLifecycleTracker,isGenuineVisibilityEvent}=require("./visibility-recovery-gate.module.js");

const browserWindow={kind:"window"};
const browserDocument={kind:"document",hidden:false};
const tracker=createLifecycleTracker({documentRef:browserDocument});
assert.equal(isGenuineVisibilityEvent({type:"focus",target:browserWindow},browserWindow,browserDocument,tracker),false,"window focus cannot initiate recovery");
assert.equal(isGenuineVisibilityEvent({type:"pageshow",target:browserWindow,persisted:false},browserWindow,browserDocument,tracker),false,"ordinary pageshow cannot initiate recovery");
assert.equal(isGenuineVisibilityEvent({type:"visibilitychange",target:browserDocument},browserWindow,browserDocument,tracker),false,"visible visibilitychange without hidden evidence cannot initiate recovery");

browserDocument.hidden=true;
tracker.observe({type:"visibilitychange",target:browserDocument});
browserDocument.hidden=false;
const visibleEvent={type:"visibilitychange",target:browserDocument};
const evidence=tracker.observe(visibleEvent);
assert.equal(evidence.trigger,"hidden-to-visible");
assert.equal(tracker.observe(visibleEvent),evidence,"all recovery domains must share one event generation");
assert.equal(evidence.generation,1);

tracker.observe({type:"freeze"});
assert.equal(tracker.observe({type:"resume"}).trigger,"freeze-to-resume");
tracker.observe({type:"pagehide"});
assert.equal(tracker.observe({type:"pageshow",persisted:false}).trigger,"page-restored");

const root=path.resolve(__dirname,"..","..");
const main=fs.readFileSync(path.join(root,"main.js"),"utf8");
const publicRecovery=main.slice(main.indexOf("function scheduleVisibilityRecovery"),main.indexOf("window.BINANCE_REALTIME_DIAG"));
const privateRecovery=main.slice(main.indexOf("const handleAuthenticatedLifecycle21"),main.indexOf("if(marketEl)",main.indexOf("const handleAuthenticatedLifecycle21")));
const ssscRecovery=main.slice(main.indexOf("function scheduleSsscVisibilityRecovery"),main.indexOf("function install()",main.indexOf("function scheduleSsscVisibilityRecovery")));
assert(!publicRecovery.includes('"focus"')&&!privateRecovery.includes('"focus"')&&!ssscRecovery.includes('"focus"'),"recovery domains must not register focus listeners");
assert(main.includes('document.addEventListener("visibilitychange",scheduleVisibilityRecovery,false)'));
assert(main.includes('window.addEventListener("pageshow",scheduleVisibilityRecovery,false)'));
assert(!main.slice(main.indexOf("function handleVisibilityReturn()"),main.indexOf("async function runPublicMarketVisibilityRecovery")).includes("BT001VisibilityRecovery.recover"),"public recovery must not cascade into private recovery");
const publicWork=main.slice(main.indexOf("async function runPublicMarketVisibilityRecovery"),main.indexOf("function scheduleVisibilityRecovery"));
assert(!publicWork.includes("ensureSsscBuffers")&&!publicWork.includes("recoverVisibleAccounts21"),"public lifecycle recovery must not invoke SSSC or private-account work");
assert(publicWork.includes('syncOutcome.reason==="stale-request"')&&publicWork.includes(":active-market-retry"),"BT001-FIX-01 stale REST work must retry against the active market");
assert(publicWork.includes('syncOutcome.reason==="error"'),"only a genuine REST failure should fail public visibility recovery");
console.log("visibility focus routing tests: PASS");
