"use strict";

const fs=require("fs");
const path=require("path");
const vm=require("vm");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const must=(condition,message)=>{if(!condition)throw new Error(message);};
const replaceOne=(text,pattern,replacement,label)=>{
  const flags=pattern.flags.includes("g")?pattern.flags:pattern.flags+"g";
  const hits=text.match(new RegExp(pattern.source,flags));
  must(hits&&hits.length===1,`${label}: expected one match, found ${hits?hits.length:0}`);
  return text.replace(pattern,replacement);
};
const scriptSafe=source=>source.replace(/<\/script/gi,"<\\/script");
const styleSafe=source=>source.replace(/<\/style/gi,"<\\/style");
const check=(source,file)=>{new vm.Script(source,{filename:file});return source;};

let html=read("index.html");
const ordered=[];
html=html.replace(/\s*<script\s+src="([^"]+)"\s+defer><\/script>/g,(_tag,src)=>{ordered.push(src.split("?")[0]);return "";});
must(ordered.length>0,"No deferred scripts found");

html=replaceOne(html,/<div class="modal-backdrop hidden" id="apiModalScalper">[\s\S]*?(?=<div class="modal-backdrop hidden" id="settingsModal">)/,"","secondary API modal");
html=replaceOne(html,/<label class="toggle api-account-scalper-toggle"><input id="apiScalperToggleMain" type="checkbox"\/> Enable Scalper<\/label>\s*/,"","secondary enable toggle");
html=replaceOne(html,/<button class="secondary api-account-switch" id="switchBinanceAccountMain" type="button">Switch to<\/button>\s*/,"","account switch button");
html=replaceOne(html,/<div class="api-account-block" data-account="scalper">[\s\S]*?<button class="secondary" id="openBinanceSettingsScalper" type="button">Open Binance API<\/button>\s*<\/div>\s*/,"","secondary account card");
html=replaceOne(html,/<div class="settings-card" id="scalpSupabaseSettingsCard">\s*<div class="settings-card-title">Supabase \(SCALP auto-entry log\)<\/div>\s*<div class="settings-card-desc">[\s\S]*?<\/div>/,'<div class="settings-card" id="heatmapSupabaseSettingsCard">\n<div class="settings-card-title">HeatMap DBase</div>',"HeatMap card");
html=html.replace(/scalpSupabase/g,"heatmapSupabase");
html=html.replace(/\s*<link rel="stylesheet" href="([^"]+)"\/>/g,(_tag,href)=>{
  const file=href.split("?")[0];
  return /^features\/scalp\//i.test(file)?"":`\n<style>\n/* bundled: ${file} */\n${styleSafe(read(file))}\n</style>`;
});

function mainSource(source){
  source=replaceOne(source,/  const accountPrefix = window\.BT001ScalpAccount[^\n]+\n  document\.title = accountPrefix \+ /,'  document.title = "M " + ',"main title");
  source=replaceOne(source,/function activeApiCredentials\(\)\{[\s\S]*?\n\}/,'function activeApiCredentials(){\n  return {key:apiKeyEl.value.trim(),secret:apiSecretEl.value.trim()};\n}',"main credentials");
  source=source.replace(/scalp-order-write/g,"order-write").replace(/scalp-reconcile/g,"account-reconcile").replace(/reason\|\|"scalp"/g,'reason||"account"');
  source=replaceOne(source,/  const SCALP_VISIBILITY_RECOVERY_DEBOUNCE_MS21[\s\S]*?  const MAIN_VISIBILITY_RECOVERY_DEBOUNCE_MS21/,"  const MAIN_VISIBILITY_RECOVERY_DEBOUNCE_MS21","secondary visibility implementation");
  source=replaceOne(source,/  async function recoverVisibleAccounts21\(reason="visibility-return"\)\{[\s\S]*?\n  \}\n  window\.BT001VisibilityRecovery=Object\.freeze\([^\n]+\);/,`  async function recoverVisibleAccounts21(reason="visibility-return"){
    if(document.hidden)return null;
    const smartDecision=evaluateMainVisibilityRestSkip21();
    return mainVisibilityRecoveryGate21.run(reason,runReason=>performVisibleAccountsRecovery21(runReason,smartDecision));
  }
  window.BT001VisibilityRecovery=Object.freeze({recover:recoverVisibleAccounts21,diagnostics:()=>{const main=mainVisibilityRecoveryGate21.diagnostics();return {active:main.inFlight,runs:main.completedRuns,main,mainSmart:{...mainSmartRecoveryDiagnostics21}};}});`,"visibility recovery");
  source=replaceOne(source,/return \{main:authenticated\.main\|\|null,scalp:authenticated\.scalp\|\|null,publicMarket:/,"return {main:authenticated.main||null,publicMarket:","visibility diagnostics");
  must(!/scalp/i.test(source),"main.js still contains stripped content");
  return source;
}

function supabaseSource(source){
  source=source.replace(/bt001_scalp_sb_u_v1/g,"bt001_heatmap_sb_u_v1").replace(/bt001_scalp_sb_k_v1/g,"bt001_heatmap_sb_k_v1");
  source=replaceOne(source,/  \/\/ Real end-to-end verification[\s\S]*?(?=  window\.BT001Supabase=Object\.freeze)/,`  async function testConnection(){
    if(!configured())return {ok:false,reason:"NOT_CONFIGURED",message:"Enter a project URL and anon key, then Save, before testing"};
    try{await getLatestHeatmapSnapshotMetadata("BTCUSDT");return {ok:true,reason:"OK",message:"Success: connected to the HeatMap database"};}
    catch(error){const status=error&&error.status;return {ok:false,reason:Number.isFinite(status)?"HTTP_ERROR":"NETWORK_ERROR",message:Number.isFinite(status)?\`Rejected (HTTP \${status})\`:\`Could not reach \${getUrl()||"the configured URL"} -- \${error&&error.message||String(error)}\`};}
  }
  async function testDbAccess(){
    if(!configured())return {ok:false,reason:"NOT_CONFIGURED",message:"Enter a project URL and anon key, then Save, before testing",results:[]};
    try{const row=await getLatestHeatmapSnapshotMetadata("BTCUSDT"),results=[{table:"liquidation_heatmap_snapshots",ok:true,message:row?"Latest snapshot is readable":"Table is readable; no snapshot is currently available",reason:"OK"}];return {ok:true,results,message:"HeatMap DB access test succeeded."};}
    catch(error){const status=Number.isFinite(error&&error.status)?error.status:null,reason=status?\`HTTP \${status}\`:error&&error.message||String(error);return {ok:false,results:[{table:"liquidation_heatmap_snapshots",ok:false,reason}],message:"HeatMap DB access test failed."};}
  }

`,"HeatMap connection tests");
  must(!/scalp/i.test(source),"Supabase source still contains stripped content");
  return source;
}

function dynamicLoader(source,kind){
  source=replaceOne(source,/      script\.src = src;/,`      const embedded=document.querySelector('script[type="application/x-bt001-source"][data-bundle-path="'+src+'"]');
      const objectUrl=embedded?URL.createObjectURL(new Blob([embedded.textContent],{type:"application/javascript"})):null;
      if(!objectUrl){reject(new Error("Missing bundled implementation: " + src));return;}
      script.src = objectUrl;`,`${kind} source`);
  source=replaceOne(source,/      script\.onload = \(\) => \{\n        script\.dataset\.loaded = "1";\n        resolve\(\);\n      \};/,`      script.onload = () => {
        URL.revokeObjectURL(objectUrl);
        script.dataset.loaded = "1";
        resolve();
      };`,`${kind} load`);
  return replaceOne(source,/      script\.onerror = \(\) => reject\(new Error\("Failed to load: " \+ src\)\);/,'      script.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load: " + src)); };',`${kind} error`);
}

const mainAccount=`(()=>{
"use strict";
const $=id=>document.getElementById(id),STORE="btc_futures_chart_v12_api_nickname_main",BASE="https://fapi.binance.com";let clock={value:0,at:0};
const credentials=()=>({key:$("apiKey")?.value.trim()||"",secret:$("apiSecret")?.value.trim()||""});
const nickname=()=>{try{return localStorage.getItem(STORE)||"Main"}catch(_e){return "Main"}};
async function hmac(secret,message){const enc=new TextEncoder(),key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]),sig=await crypto.subtle.sign("HMAC",key,enc.encode(message));return [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("")}
async function offset(){if(Date.now()-clock.at<30000)return clock.value;const data=await window.restService.get(BASE+"/fapi/v1/time");clock={value:Number(data.serverTime)-Date.now(),at:Date.now()};return clock.value}
async function get(path){const c=credentials();if(!c.key||!c.secret)throw new Error("API key and secret are not configured.");const q=new URLSearchParams({recvWindow:"5000",timestamp:String(Date.now()+await offset())}).toString(),signature=await hmac(c.secret,q);return window.restService.requestJson(BASE+path+"?"+q+"&signature="+signature,{method:"GET",cache:"no-store",headers:{"X-MBX-APIKEY":c.key}})}
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
async function open(){const panel=$("apiAccountStatusWindow"),content=$("apiAccountStatusContent");if(!panel||!content)return;$("apiAccountStatusTitle").textContent=nickname()+" — Binance Account Status";$("apiAccountStatusSubtitle").textContent="Main account";content.textContent="Reading Binance account status…";panel.classList.remove("hidden");try{const account=await get("/fapi/v2/account");content.innerHTML='<div class="api-capability-grid"><div class="api-capability-row"><span class="api-capability-label">Last successful sync</span><span class="api-capability-value">'+esc(new Date().toLocaleString())+'</span></div><div class="api-capability-row"><span class="api-capability-label">Futures reachable</span><span class="api-capability-value">Yes</span></div><div class="api-capability-row"><span class="api-capability-label">Can trade</span><span class="api-capability-value">'+esc(account.canTrade===true?"Yes":"No")+'</span></div></div>'}catch(error){content.textContent=error?.message||String(error)}}
const name=$("apiNicknameMain");if(name){name.value=nickname();name.addEventListener("change",()=>{try{localStorage.setItem(STORE,name.value.trim()||"Main")}catch(_e){}})}$("readBinanceAccountMain")?.addEventListener("click",open);$("closeApiAccountStatus")?.addEventListener("click",()=>$("apiAccountStatusWindow")?.classList.add("hidden"));
})();`;

const dynamic=[
  "features/calculator/domain/calculatorDomain.js","features/calculator/application/calculatorService.js","features/calculator/application/chaseEngine.js","features/calculator/infrastructure/storageAdapter.js","features/calculator/presentation/calculatorModule.js","features/rapid-fire/rapidFireModule.js","features/grad-calculator/domain/gradDomain.js","features/grad-calculator/presentation/gradCalculatorModule.js"
];
const inert=dynamic.map(file=>`<script type="application/x-bt001-source" data-bundle-path="${file}">\n${scriptSafe(check(read(file),file))}\n</script>`);
const executable=[];
for(const file of ordered){
  if(/^features\/scalp\//i.test(file)){
    if(file==="features/scalp/account-settings.module.js")executable.push(`<script>\n/* bundled: main-account-settings */\n${scriptSafe(check(mainAccount,"main-account-settings"))}\n</script>`);
    if(file==="features/scalp/supabase-settings.module.js"){
      const settings=read(file).replace(/scalpSupabase/g,"heatmapSupabase").replace(/all five tables/g,"HeatMap table");
      must(!/scalp/i.test(settings),"HeatMap settings still contains stripped content");
      executable.push(`<script>\n/* bundled: heatmap-database-settings */\n${scriptSafe(check(settings,"heatmap-database-settings"))}\n</script>`);
    }
    continue;
  }
  let source=read(file);
  if(file==="main.js")source=mainSource(source);
  if(file==="services/supabase.service.js")source=supabaseSource(source);
  if(file==="features/pressure-signal/index.js")source=source.replace(/structuredScalpSignal37/g,"structuredSignal37");
  if(file==="features/settings/tab-manifest.js")source=source.replace(/scalpSupabaseSettingsCard/g,"heatmapSupabaseSettingsCard");
  if(file==="features/calculator/index.js")source=dynamicLoader(source,"calculator");
  if(file==="features/grad-calculator/index.js")source=dynamicLoader(source,"grad");
  must(!/scalp/i.test(source),`${file} still contains stripped content`);
  executable.push(`<script>\n/* bundled: ${file} */\n${scriptSafe(check(source,file))}\n</script>`);
}

const bundle=`\n<!-- Standalone execution block: all formerly deferred scripts are after the complete document markup. -->\n${inert.join("\n")}\n${executable.join("\n")}\n`;
// Use a callback: a replacement string would reinterpret source tokens such as $&, $`, $', and $$.
html=replaceOne(html,/\n<\/body>/,()=>`${bundle}\n</body>`,"safe end-of-body insertion");
must(!/<script\s+src=|<link\s+rel="stylesheet"/i.test(html),"External asset reference remains");
must(!/scalp/i.test(html),"Stripped content remains");
fs.writeFileSync(path.join(root,"standalone.html"),html,"utf8");
console.log(`Built standalone.html (${Buffer.byteLength(html)} bytes; ${executable.length} executable blocks)`);
