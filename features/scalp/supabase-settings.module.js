(() => {
  "use strict";

  function bind(){
    const supabase=window.BT001Supabase;
    const urlInput=document.getElementById("scalpSupabaseUrl"),keyInput=document.getElementById("scalpSupabaseAnonKey"),
      status=document.getElementById("scalpSupabaseStatus"),saveButton=document.getElementById("scalpSupabaseSave"),clearButton=document.getElementById("scalpSupabaseClear");
    if(!supabase||!urlInput||!keyInput||!status||!saveButton||!clearButton)return;

    function render(){
      const configured=supabase.configured(),pending=supabase.pendingCount();
      status.textContent=configured?(pending?`CONFIGURED · ${pending} log row(s) pending retry`:"CONFIGURED"):"NOT CONFIGURED";
    }
    saveButton.addEventListener("click",()=>{
      const urlOk=urlInput.value.trim()?supabase.saveUrlFromInput(urlInput):true,keyOk=keyInput.value.trim()?supabase.saveKeyFromInput(keyInput):true;
      render();
      if(!urlOk||!keyOk)status.textContent="Enter a project URL and anon key before saving";
    });
    clearButton.addEventListener("click",()=>{supabase.clearUrl();supabase.clearKey();urlInput.value="";keyInput.value="";render();});
    render();
    setInterval(render,5000);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})();
