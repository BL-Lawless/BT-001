(() => {
  "use strict";

  function bind(){
    const supabase=window.BT001Supabase;
    const urlInput=document.getElementById("scalpSupabaseUrl"),keyInput=document.getElementById("scalpSupabaseAnonKey"),
      status=document.getElementById("scalpSupabaseStatus"),saveButton=document.getElementById("scalpSupabaseSave"),clearButton=document.getElementById("scalpSupabaseClear"),
      testButton=document.getElementById("scalpSupabaseTest"),testStatus=document.getElementById("scalpSupabaseTestStatus");
    if(!supabase||!urlInput||!keyInput||!status||!saveButton||!clearButton)return;

    function render(){
      const configured=supabase.configured(),pending=supabase.pendingCount();
      status.textContent=configured?(pending?`CONFIGURED · ${pending} log row(s) pending retry`:"CONFIGURED"):"NOT CONFIGURED";
    }
    function setTestStatus(text,tone){
      if(!testStatus)return;
      testStatus.textContent=text;
      testStatus.classList.toggle("is-ok",tone==="ok");
      testStatus.classList.toggle("is-warning",tone==="warning");
    }
    saveButton.addEventListener("click",()=>{
      const urlOk=urlInput.value.trim()?supabase.saveUrlFromInput(urlInput):true,keyOk=keyInput.value.trim()?supabase.saveKeyFromInput(keyInput):true;
      render();
      if(!urlOk||!keyOk)status.textContent="Enter a project URL and anon key before saving";
      setTestStatus("",null);
    });
    clearButton.addEventListener("click",()=>{supabase.clearUrl();supabase.clearKey();urlInput.value="";keyInput.value="";render();setTestStatus("",null);});
    if(testButton&&testStatus&&typeof supabase.testConnection==="function"){
      testButton.addEventListener("click",async()=>{
        testButton.disabled=true;setTestStatus("Testing...",null);
        try{
          const result=await supabase.testConnection();
          setTestStatus(result.message,result.ok?"ok":"warning");
        }catch(error){
          setTestStatus(`Test failed unexpectedly: ${error&&error.message||String(error)}`,"warning");
        }finally{
          testButton.disabled=false;
        }
      });
    }
    render();
    setInterval(render,5000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
