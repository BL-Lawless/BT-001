(() => {
  "use strict";

  const build = window.__PRESSURE_SIGNAL_FEATURE_BUILD__ ||= {};
  const number = value => {
    if(value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const price = value => {
    const parsed = number(value);
    return parsed == null ? "Unavailable" : Math.round(parsed).toLocaleString("en-US",{maximumFractionDigits:0});
  };
  const percent = value => {
    const parsed = number(value);
    return parsed == null ? "Unavailable" : `${parsed >= 0 ? "+" : ""}${parsed.toFixed(1)}%`;
  };
  const money = value => {
    const parsed = number(value);
    return parsed == null ? "Unavailable" : `${parsed >= 0 ? "+" : "-"}${Math.abs(parsed).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  };
  const quantity = value => {
    const parsed = number(value);
    return parsed == null ? "Unavailable" : Math.abs(parsed).toLocaleString("en-US",{maximumFractionDigits:8});
  };
  const time = value => {
    const date = new Date(Number(value) || Date.now());
    return Number.isFinite(date.getTime()) ? date.toISOString() : "Unavailable";
  };
  const lines = values => (Array.isArray(values) ? values : []).filter(Boolean);

  function richTokens(text){
    const source = String(text || "");
    const fragment = document.createDocumentFragment();
    const expression = /(?<![A-Za-z0-9])(?:\d{1,3}(?:,\d{3}){1,2}|\d{4,7})(?:\.\d+)?(?:\s*[-\u2013]\s*(?:\d{1,3}(?:,\d{3}){1,2}|\d{4,7})(?:\.\d+)?)?(?![A-Za-z0-9])/g;
    const priceContext = /(?:price|\bentry\b|\bexit\b|\bstop\b|\bpsl\b|\btrigger\b|entry zone|origin zone|invalidation|anchor|defence|support|resistance|level|ema\s*\d|ma[1-5]|objective|obstacle|boundary|target|weighted average|\bstart\b|\bend\b|zone basis|reclaim|break|pivot|master sl|technical stop|stop trigger|liquidation|\bhigh\b|\blow\b)/i;
    const excludedContext = /^(?:snapshot|updated|floating p\/l|current margin roi|peak margin roi|peak surrendered|relative surrender|campaign result|campaign monetary mfe|position health|action|data):/i;
    const calculatedLabel = /^(?:action|recommendation|state|direction|bias|bias confidence|entry|trigger|entry mode|setup family|family|origin-zone status|obstacle significance|setup quality|trigger quality|current entry quality|stop protection|protection|stop evaluation|stop quality|stop purpose|stop findings|psl coverage|psl distribution|liquidation risk|lifecycle|current conditions|conditions|exit warning|data status|action status|confirmation|participation|momentum|volatility|context volatility|stall review|absorption|adverse-evidence gate|health|position health|path a - anchor invalidation|path b - opposite regime|exit activated|exit quality|quantity|gr exit ladder|exit ladder source|start quality|average quality|end quality|distribution|position coverage|before primary target|near primary target|toward extended target|beyond extended target|remaining room):\s*/i;
    source.split(/(\n)/).forEach(line => {
      if(line === "\n"){
        fragment.appendChild(document.createTextNode(line));
        return;
      }
      const calculated = line.match(calculatedLabel);
      const priceMatches = priceContext.test(line) ? Array.from(line.matchAll(expression)) : [];
      if(calculated && !priceMatches.length){
        fragment.appendChild(document.createTextNode(line.slice(0,calculated[0].length)));
        const strong = document.createElement("strong");
        strong.className = "pressure-calculated-value";
        strong.textContent = line.slice(calculated[0].length);
        fragment.appendChild(strong);
        return;
      }
      if(!priceMatches.length || excludedContext.test(line.trim())){
        fragment.appendChild(document.createTextNode(line));
        return;
      }
      let index = 0;
      for(const match of priceMatches){
        if(match.index > index) fragment.appendChild(document.createTextNode(line.slice(index,match.index)));
        const strong = document.createElement("strong");
        strong.className = "pressure-price-value";
        strong.textContent = match[0].split(/\s*[-\u2013]\s*/).map(part => price(Number(part.replaceAll(",","")))).join("\u2013");
        fragment.appendChild(strong);
        index = match.index + match[0].length;
      }
      if(index < line.length) fragment.appendChild(document.createTextNode(line.slice(index)));
    });
    return fragment;
  }

  build.reporting = Object.freeze({number,price,percent,money,quantity,time,lines,priceTokens:richTokens,richTokens});
})();
