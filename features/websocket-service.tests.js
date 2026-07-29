"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const originalWindow=global.window,originalWebSocket=global.WebSocket,originalSetTimeout=global.setTimeout,originalClearTimeout=global.clearTimeout;
const timers=[];
global.setTimeout=(callback,delay)=>{const timer={id:timers.length+1,callback,delay,cancelled:false};timers.push(timer);return timer.id;};
global.clearTimeout=id=>{const timer=timers.find(item=>item.id===id);if(timer)timer.cancelled=true;};
class FakeWebSocket{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){this.url=url;this.readyState=FakeWebSocket.CONNECTING;this.closeCalls=0;FakeWebSocket.instances.push(this);}
  close(){this.closeCalls++;this.readyState=FakeWebSocket.CLOSED;}
  open(){this.readyState=FakeWebSocket.OPEN;if(this.onopen)this.onopen({});}
  serverClose(){this.readyState=FakeWebSocket.CLOSED;if(this.onclose)this.onclose({code:1006});}
}
FakeWebSocket.instances=[];
global.window=global;global.WebSocket=FakeWebSocket;
require("../services/websocket.service.js");

const service=new global.WebSocketService({WebSocketCtor:FakeWebSocket});
const first=service.connect("wss://example.test/stream",{connectionKey:"market",reconnect:true});
const repeated=service.connect("wss://example.test/stream",{connectionKey:"market",reconnect:true});
assert.strictEqual(first,repeated);
assert.equal(FakeWebSocket.instances.length,1,"rapid duplicate connect calls must share one in-flight socket per stream key");
assert.equal(service.diagnostics()[0].activeSocketCount,1);

first.connect();
assert.equal(FakeWebSocket.instances.length,1,"connect() must be idempotent while CONNECTING");
FakeWebSocket.instances[0].serverClose();
first.scheduleReconnect();
assert.equal(timers.filter(timer=>!timer.cancelled).length,1,"repeated errors must leave only one reconnect timer");

const pending=service.connect("wss://example.test/private",{connectionKey:"private"});
const pendingSocket=FakeWebSocket.instances.at(-1);
pending.disconnect();
assert.equal(pendingSocket.closeCalls,0,"disconnect must not close a socket before its handshake establishes");
pendingSocket.open();
assert.equal(pendingSocket.closeCalls,1,"a superseded handshake must close immediately after it establishes");

const main=fs.readFileSync(path.resolve(__dirname,"..","main.js"),"utf8");
const connVisualSource=main.slice(main.indexOf("function connVisual(status)"),main.indexOf("// Legacy status names"));
const connVisual=Function(`${connVisualSource};return connVisual;`)();
for(const status of ["WS LIVE","WS WAITING","RECONNECTING","WS STALE"]){
  assert.deepEqual(connVisual(status),{text:"W",bg:"#0ecb81",glow:"rgba(14,203,129,.45)"});
}
assert.deepEqual(connVisual("REST FALLBACK"),{text:"R",bg:"#0ecb81",glow:"rgba(14,203,129,.45)"});
assert.deepEqual(connVisual("OFFLINE / ERROR"),{text:"X",bg:"#f6465d",glow:"rgba(246,70,93,.42)"});
assert(main.includes('scheduleReconnect("stream requirements changed",100)'),"public stream requirement changes must be debounced");
assert(main.includes("connect({force:true,reason})"),"public stale/error recovery must replace a half-dead socket instead of no-oping while it still reports OPEN");
assert(main.includes('scheduleReconnect("stale WebSocket",1000)')&&main.includes("diag.hiddenMessageCount += 1"),"public ingestion must watchdog stale sockets without using visibility as its primary trigger and retain evidence of hidden-tab traffic");
const statusLoop=main.slice(main.indexOf("function runStatusLoop()"),main.indexOf("function startStatusLoop()"));
assert(
  statusLoop.indexOf("if(document.hidden) return;")<statusLoop.indexOf("refreshConnectionStatus()")&&
  statusLoop.indexOf("if(document.hidden) return;")<statusLoop.indexOf('scheduleReconnect("stale WebSocket",1000)'),
  "background throttling must neither paint an OPEN public socket offline nor race it with forced reconnect/REST recovery"
);
const connectionStatusSource=main.slice(main.indexOf("function refreshConnectionStatus()"),main.indexOf("function setLegacyConnectionState"));
assert(!connectionStatusSource.includes("BT001ExchangeClock"),"the public connectivity LED must not misreport exchange-clock/private-account health");
assert(connectionStatusSource.includes("socketOpen()")&&connectionStatusSource.includes("activeChartAge()"),"the connectivity LED must remain driven by public socket and active-chart freshness");
assert(main.includes('scheduleReconnect("stale WebSocket on visibility return",0)'),"foreground recovery must replace an OPEN-but-stale public socket");
assert(main.includes("diag.gapRepairInFlightByTf = state.gapRepairInFlightByTf")&&main.includes("diag.lastGapRepairMsByTf = state.lastGapRepairMsByTf"),"public diagnostics must expose the repair maps that the repair path actually mutates");
assert(main.includes("pruneMaCache(tf,{liveOnly:true})")&&main.includes('value.sourceType === "getChartBuffer"'),"forming ticks must preserve still-valid closed-only MA cache entries");
const formingRevisionCallSites=[...main.matchAll(/bumpFormingRevision\(([^)]+)\)/g)].map(match=>match[1].trim());
assert(
  formingRevisionCallSites.length>=4&&formingRevisionCallSites.every(argument=>argument==="tf"),
  "every forming-revision mutation must remain scoped to the timeframe whose candle changed"
);
const repairSource=main.slice(main.indexOf("async function repairMissingClosedCandles"),main.indexOf("function ingestRestRows"));
assert.equal(
  (repairSource.match(/bumpClosedRevision\(tf\)/g)||[]).length,1,
  "a successful bulk gap repair must publish only one closed revision"
);
assert(repairSource.includes("if(repairChanged)bumpClosedRevision(tf)"),"a no-op repair must not bump closed revision");
assert(repairSource.includes("if(!stale&&!unresolvedGaps.length)state.lastGapRepairMsByTf[tf] = now()"),"repair diagnostics must only mark a current gap repaired after continuity validation succeeds");
assert(main.includes('["connecting","live"].includes(streamStatus)'),"focus/pageshow recovery must not restart an already-connecting private stream");
assert(main.includes('connectionKey:"public-market-data"')&&main.includes('connectionKey:"main-private-user-data"'));

global.window=originalWindow;global.WebSocket=originalWebSocket;global.setTimeout=originalSetTimeout;global.clearTimeout=originalClearTimeout;
console.log("websocket service tests: PASS");
