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

  function priceTokens(text){
    const source = String(text || "");
    const fragment = document.createDocumentFragment();
    const expression = /(?<![A-Za-z0-9])(?:\d{1,3}(?:,\d{3}){1,2}|\d{5,6})(?:\.\d+)?(?:\s*-\s*(?:\d{1,3}(?:,\d{3}){1,2}|\d{5,6})(?:\.\d+)?)?(?![A-Za-z0-9])/g;
    const priceContext = /(?:price|entry zone|invalidation|anchor|support|resistance|level|ema\s*\d|ma[1-5]|objective|boundary|target|zone basis|chase|reclaim|break|pivot|\bhigh\b|\blow\b|\batr\b)/i;
    const excludedContext = /^(?:snapshot|updated|floating p\/l|current margin roi|peak margin roi|peak surrendered|relative surrender|campaign result|campaign monetary mfe|position health|action|data):/i;
    source.split(/(\n)/).forEach(line => {
      if(line === "\n" || !priceContext.test(line) || excludedContext.test(line.trim())){
        fragment.appendChild(document.createTextNode(line));
        return;
      }
      let index = 0;
      for(const match of line.matchAll(expression)){
        if(match.index > index) fragment.appendChild(document.createTextNode(line.slice(index,match.index)));
        const strong = document.createElement("strong");
        strong.className = "pressure-price-value";
        strong.textContent = match[0].split(/\s*-\s*/).map(part => price(Number(part.replaceAll(",","")))).join("-");
        fragment.appendChild(strong);
        index = match.index + match[0].length;
      }
      if(index < line.length) fragment.appendChild(document.createTextNode(line.slice(index)));
    });
    return fragment;
  }

  build.reporting = Object.freeze({number,price,percent,money,quantity,time,lines,priceTokens});
})();
