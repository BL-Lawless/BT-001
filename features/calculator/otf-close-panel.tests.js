"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..","..");
const calculator=fs.readFileSync(path.join(__dirname,"presentation","calculatorModule.js"),"utf8");
const floating=fs.readFileSync(path.join(root,"features","shared","floatingWindow.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

assert(html.includes('src="features/shared/floatingWindow.js"'),"the shared floating-window utility must load before Calculator starts");
assert(calculator.includes('id = "otfCloseChaseWindow"'),"the OTF close panel must be a DOM window");
for(const id of ["otfCloseChaseModeMkt","otfCloseChaseModeChs","otfCloseChasePercent","otfCloseChaseDist","otfCloseChaseValid","otfCloseChaseConfirm","otfCloseChaseCancel"]){
  assert(calculator.includes(id),`the DOM panel must include ${id}`);
}
assert(calculator.includes("storageKey:OTF_CLOSE_WINDOW_KEY"),"panel geometry must use global browser storage");
assert(calculator.includes("renderOpenPositionClosePanel();\n  }\n  function calculatorIsOpen"),"status updates must render the live DOM panel directly");
assert(!calculator.includes("otfClosePanels"),"the legacy canvas panel render list must be removed");
assert(!/controlType:"open-position-close-(?!toggle)/.test(calculator),"only the chart X toggle may retain a canvas hit box");
assert.equal((calculator.match(/controlType:"open-position-close-toggle"/g)||[]).length,1,"the original chart X must remain the sole close-panel canvas hit target");
assert(calculator.includes('timeInForce:"GTX"'),"the chase order must use post-only GTX");
assert(calculator.includes("hub.getTopOfBook()"),"the chase must use the shared top-of-book source");

assert(floating.includes('["n","ne","e","se","s","sw","w","nw"].forEach(edge => {'),"all eight resize edges must be installed");
assert(floating.includes("localStorage.setItem(key,JSON.stringify(value))"),"window geometry must persist through localStorage");
assert(floating.includes("(window.innerWidth - width) / 2") && floating.includes("(window.innerHeight - height) / 2"),"first-open geometry must be centered");
assert(css.includes(".otf-close-window{") && css.includes("min-width:360px") && css.includes("min-height:300px"),"the DOM panel must enforce its size floor");

console.log("OTF close DOM panel tests: PASS");
