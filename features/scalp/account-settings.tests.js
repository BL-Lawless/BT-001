"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),vm=require("vm");
const repo=path.resolve(__dirname,"..","..");

class MemoryStorage{
  constructor(seed={}){this.data=new Map(Object.entries(seed));}
  getItem(key){return this.data.has(key)?this.data.get(key):null;}
  setItem(key,value){this.data.set(key,String(value));}
  removeItem(key){this.data.delete(key);}
}
class ClassList{
  constructor(values=[]){this.values=new Set(values);}
  add(...values){values.forEach(value=>this.values.add(value));}
  remove(...values){values.forEach(value=>this.values.delete(value));}
  contains(value){return this.values.has(value);}
  toggle(value,force){if(force===true){this.values.add(value);return true;}if(force===false){this.values.delete(value);return false;}if(this.values.has(value)){this.values.delete(value);return false;}this.values.add(value);return true;}
}
class Element{
  constructor(id,document,{hidden=false,value="",checked=false}={}){
    this.id=id;this.ownerDocument=document;this.classList=new ClassList(hidden?["hidden"]:[]);this.value=value;this.checked=checked;this.disabled=false;this.dataset={};this.listeners={};this.style={};this.attributes={};this.textContent="";this.innerHTML="";this.offsetWidth=500;
  }
  addEventListener(type,listener,options){(this.listeners[type]||=[]).push({listener,capture:options===true||!!(options&&options.capture)});}
  dispatchEvent(event){this.dispatch(event.type,event);return true;}
  dispatch(type,extra={}){
    let stopped=false;
    const event={type,target:this,key:extra.key,clientX:extra.clientX||0,clientY:extra.clientY||0,pointerId:1,preventDefault(){},stopImmediatePropagation(){stopped=true;}};
    const rows=(this.listeners[type]||[]).slice().sort((a,b)=>Number(b.capture)-Number(a.capture));
    for(const row of rows){row.listener(event);if(stopped)break;}
    return event;
  }
  focus(){this.ownerDocument.activeElement=this;}
  closest(selector){return selector==="button"&&this.id==="closeApiAccountStatus"?this:null;}
  getBoundingClientRect(){return {left:100,top:76};}
  setPointerCapture(){}
  setAttribute(name,value){this.attributes[name]=String(value);}
}
function runtime(seed={}){
  const localStorage=new MemoryStorage(seed),elements={},windowListeners={};let reloads=0;
  const document={readyState:"complete",activeElement:null,getElementById:id=>elements[id]||null};
  const add=(id,options)=>elements[id]=new Element(id,document,options);
  [
    "apiNicknameMain","apiNicknameScalper","apiScalperToggleMain","apiScalperToggleScalper",
    "openBinanceSettings","openBinanceSettingsScalper","apiModal","apiModalScalper","settingsModal",
    "apiKey","apiSecret","apiKeyScalper","apiSecretScalper","rememberKeysScalper","closeApiKeysScalper",
    "saveApiKeysScalper","readBinanceAccountMain","readBinanceAccountScalper","switchBinanceAccountMain","switchBinanceAccountScalper","apiAccountStatusWindow",
    "apiAccountStatusTitle","apiAccountStatusSubtitle","apiAccountStatusContent","apiAccountStatusHead","closeApiAccountStatus","market"
  ].forEach(id=>add(id,{hidden:["apiModal","apiModalScalper","apiAccountStatusWindow"].includes(id)}));
  elements.apiNicknameMain.value="Main";elements.apiNicknameScalper.value="Scalper";elements.rememberKeysScalper.checked=true;elements.market.value="btcusdc";
  const context={console,Date,Promise,Map,Set,Array,Object,String,Number,Boolean,JSON,Math,Error,TypeError,URLSearchParams,TextEncoder,Uint8Array,localStorage,document,Event:class{constructor(type,options={}){this.type=type;this.bubbles=!!options.bubbles;}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},window:null,setTimeout,clearTimeout};
  context.window=context;context.innerWidth=1200;context.innerHeight=800;context.location={reload:()=>{reloads+=1;}};context.dispatchEvent=event=>{(windowListeners[event.type]||[]).forEach(listener=>listener(event));return true;};context.addEventListener=(type,listener)=>{(windowListeners[type]||=[]).push(listener);};
  // Simulate a previously installed buggy bubble listener. The new capture-bound handler must
  // stop it before it can redirect Main to the Scalper modal.
  elements.openBinanceSettings.addEventListener("click",()=>{elements.apiModal.classList.add("hidden");elements.apiModalScalper.classList.remove("hidden");});
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(repo,"features/scalp/account-settings.module.js"),"utf8"),context,{filename:"account-settings.module.js"});
  return {context,elements,localStorage,getReloads:()=>reloads};
}

async function run(){
  const {context,elements,localStorage,getReloads}=runtime(),api=context.BT001ScalpAccount,cases={};
  api.setSlot("scalper");
  elements.openBinanceSettings.dispatch("click");
  assert.equal(elements.apiModal.classList.contains("hidden"),false,"Main must open Main's credential dialog");
  assert.equal(elements.apiModalScalper.classList.contains("hidden"),true,"Main must never open the enabled Scalper slot's dialog");
  assert.equal(elements.settingsModal.classList.contains("hidden"),true);
  assert.equal(elements.apiKey.ownerDocument.activeElement,elements.apiKey);
  cases.mainOpenAlwaysTargetsMainDialog=true;

  elements.settingsModal.classList.remove("hidden");elements.apiModal.classList.add("hidden");
  elements.openBinanceSettingsScalper.dispatch("click");
  assert.equal(elements.apiModalScalper.classList.contains("hidden"),false,"Scalper Open button must open its own dialog");
  assert.equal(elements.apiModal.classList.contains("hidden"),true);
  assert.equal(elements.apiKeyScalper.ownerDocument.activeElement,elements.apiKeyScalper);
  cases.scalperOpenAlwaysTargetsScalperDialog=true;

  elements.readBinanceAccountMain.dispatch("click");
  await Promise.resolve();await Promise.resolve();
  assert.equal(elements.apiAccountStatusWindow.classList.contains("hidden"),false);
  assert(elements.apiAccountStatusTitle.textContent.includes("Main"));
  assert(elements.apiAccountStatusContent.innerHTML.includes("API key and secret are not configured"));
  cases.mainReadOpensStandaloneStatusWindow=true;

  elements.apiAccountStatusWindow.classList.add("hidden");
  elements.readBinanceAccountScalper.dispatch("click");
  await Promise.resolve();await Promise.resolve();
  assert.equal(elements.apiAccountStatusWindow.classList.contains("hidden"),false);
  assert(elements.apiAccountStatusTitle.textContent.includes("Scalper"));
  cases.scalperReadOpensSameStandaloneWindowForItsOwnAccount=true;

  elements.apiKey.value="main-key";elements.apiSecret.value="main-secret";
  elements.apiKeyScalper.value="scalper-key";elements.apiSecretScalper.value="scalper-secret";
  assert.deepEqual(JSON.parse(JSON.stringify(api.getInterfaceCredentials())),{key:"main-key",secret:"main-secret"});
  let marketChanges=0;elements.market.addEventListener("change",()=>{marketChanges+=1;});api.setSlot("main");elements.market.value="paxgusdt";elements.apiScalperToggleScalper.checked=true;elements.apiScalperToggleScalper.dispatch("change");assert.equal(api.getSlot(),"scalper");assert.equal(api.getInterfaceSlot(),"main");assert.equal(elements.market.value,"btcusdt");assert.equal(marketChanges,1);assert.equal(getReloads(),0);
  elements.market.value="clusdt";api.setSlot("scalper");assert.equal(elements.market.value,"clusdt","an already-enabled Scalper slot must not continuously override the symbol");
  elements.switchBinanceAccountScalper.dispatch("click");
  assert.equal(api.getInterfaceSlot(),"scalper");
  assert.deepEqual(JSON.parse(JSON.stringify(api.getInterfaceCredentials())),{key:"scalper-key",secret:"scalper-secret"});
  assert.equal(api.getSlot(),"scalper","switching the main interface must not alter the Scalper binding");
  assert.equal(elements.market.value,"btcusdt");
  assert.equal(elements.switchBinanceAccountScalper.disabled,true);
  assert.equal(elements.switchBinanceAccountMain.disabled,false);
  assert.equal(getReloads(),1);
  const reloadSeed=Object.fromEntries(localStorage.data),reloadedScalper=runtime(reloadSeed);assert.equal(reloadedScalper.elements.market.value,"btcusdt","the one-shot default must survive the Switch-to reload");assert.equal(reloadedScalper.localStorage.getItem("btc_futures_chart_v12_scalper_btcusdt_once"),null);
  const alreadyEnabled=runtime({"btc_futures_chart_v12_scalp_account_slot":"scalper"});assert.equal(alreadyEnabled.elements.market.value,"btcusdt","a persisted active Scalper account must retain its BTCUSDT default after refresh");
  api.setSlot("main");
  assert.equal(api.getInterfaceSlot(),"scalper","changing the Scalper binding must not alter the main-interface selection");
  elements.market.value="clusdt";
  elements.switchBinanceAccountMain.dispatch("click");
  assert.equal(api.getInterfaceSlot(),"main");
  assert.equal(api.getSlot(),"main");
  assert.equal(elements.market.value,"clusdt","switching back to Main must preserve the current symbol");
  assert.equal(getReloads(),2);
  assert.equal(localStorage.getItem("btc_futures_chart_v12_main_interface_account_slot"),"main");
  cases.mainInterfaceAndScalperSelectionsAreIndependent=true;
  cases.scalperActivationDefaultsBtcusdtOnceWithoutAffectingMain=true;

  const html=fs.readFileSync(path.join(repo,"index.html"),"utf8"),source=fs.readFileSync(path.join(repo,"features/scalp/account-settings.module.js"),"utf8"),css=fs.readFileSync(path.join(repo,"features/scalp/scalp.css"),"utf8");
  assert(!html.includes("Two independent Binance accounts."));
  assert(!html.includes('id="apiStatusMain"')&&!html.includes('id="apiStatusScalper"')&&!html.includes("<details"));
  assert(/apiScalperToggleMain[\s\S]*readBinanceAccountMain[\s\S]*switchBinanceAccountMain/.test(html)&&/apiScalperToggleScalper[\s\S]*readBinanceAccountScalper[\s\S]*switchBinanceAccountScalper/.test(html));
  assert(!html.includes('id="mActiveApiAccount"')&&!source.includes("mActiveApiAccount")&&!css.includes("metric-interface-account"));
  assert(html.indexOf('features/scalp/account-settings.module.js')<html.indexOf('src="main.js"'),"account selection must load before main.js");
  assert(html.includes('id="apiAccountStatusWindow"')&&source.includes("Detected account mode")&&source.includes("Last successful sync")&&source.includes("Futures reachable")&&source.includes("Spot reachable")&&source.includes("canTrade")&&source.includes("canDeposit"));
  assert(css.includes("#apiCapabilityCard,#readApiKeys{display:none!important}"));
  cases.settingsMarkupHasAdjacentReadsNoInlineStatusAndNoClutterCopy=true;

  const main=fs.readFileSync(path.join(repo,"main.js"),"utf8"),calculator=fs.readFileSync(path.join(repo,"features/calculator/presentation/calculatorModule.js"),"utf8"),grad=fs.readFileSync(path.join(repo,"features/grad-calculator/presentation/gradCalculatorModule.js"),"utf8"),scalpIndex=fs.readFileSync(path.join(repo,"features/scalp/index.js"),"utf8"),secondary=fs.readFileSync(path.join(repo,"features/scalp/secondary-gateway.module.js"),"utf8");
  assert(main.includes("window.BT001_ACTIVE_BINANCE_CREDENTIALS=activeApiCredentials"));
  assert(main.includes('getInterfaceSlot()==="scalper" ? "S " : "M "'));
  assert(source.includes('typeof window.updateTabTitle==="function"'));
  assert(calculator.includes("window.BT001_ACTIVE_BINANCE_CREDENTIALS()")&&grad.includes("window.BT001_ACTIVE_BINANCE_CREDENTIALS()"));
  assert(scalpIndex.includes("BT001ScalpSecondaryGateway.create(slot)")&&scalpIndex.includes("accountSlot:slot")&&secondary.includes("getCredentials(slot)")&&secondary.includes("normalizePositions"));
  cases.mainAndCalculatorsUseActiveAccountWhileScalpCanUseEitherIndependentSlot=true;

  const titleFunction=(main.match(/function updateTabTitle\(\)\{[\s\S]*?\n\}/)||[])[0];
  assert(titleFunction,"updateTabTitle function must remain available");
  const titleContext={document:{title:""},candles:[{close:100}],lastMarkPrice:null,openPositionBoxes:[{qty:.25}],openBoxesFloating:()=>5,titlePrice:value=>String(value),titlePL:value=>`+${value}`,window:{BT001ScalpAccount:{getInterfaceSlot:()=>"main"}}};
  vm.runInNewContext(`${titleFunction};updateTabTitle();`,titleContext);
  assert.equal(titleContext.document.title,"M 100 | 0.250 | +5");
  titleContext.window.BT001ScalpAccount.getInterfaceSlot=()=>"scalper";
  vm.runInNewContext("updateTabTitle();",titleContext);
  assert.equal(titleContext.document.title,"S 100 | 0.250 | +5");
  cases.tabTitlePrefixFlipsWithoutChangingExistingFormat=true;

  console.log("SCALP account settings tests: PASS",cases);
  return cases;
}
module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
