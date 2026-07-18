(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    apiBase: "https://api.apify.com",
    actorId: "api_merge/coinank-liquidation-heatmap",
    symbol: "BTCUSDT",
    pollIntervalMs: 4000,
    timeoutMs: 120000,
    maxConsecutiveStatusErrors: 3
  });
  const DEFAULT_DURATION_MAP = Object.freeze({
    "12H":"12h","1D":"1d","3D":"3d","1W":"1w","2W":"2w","1M":"1M"
  });

  function readPrivateConfig(){
    const root = window.BT001_PRIVATE_CONFIG;
    const value = root && root.heatmap;
    return value && typeof value === "object" ? value : {};
  }

  function get(){
    const privateConfig = readPrivateConfig();
    const durationMap=Object.assign({},DEFAULT_DURATION_MAP,privateConfig.durationMap||{});
    return Object.freeze({
      apiBase:String(privateConfig.apiBase || DEFAULTS.apiBase).replace(/\/$/, ""),
      actorId:DEFAULTS.actorId,
      actorApiId:DEFAULTS.actorId.replace("/","~"),
      symbol:DEFAULTS.symbol,
      pollIntervalMs:Math.max(3000, Number(privateConfig.pollIntervalMs) || DEFAULTS.pollIntervalMs),
      timeoutMs:Math.max(10000, Number(privateConfig.timeoutMs) || DEFAULTS.timeoutMs),
      maxConsecutiveStatusErrors:Math.max(1,Math.floor(Number(privateConfig.maxConsecutiveStatusErrors)||DEFAULTS.maxConsecutiveStatusErrors)),
      durationMap:Object.freeze(durationMap),
      buildInput:typeof privateConfig.buildInput === "function"
        ? privateConfig.buildInput
        : ({symbol,providerDuration}) => ({symbol,interval:providerDuration})
    });
  }

  window.BT001HeatmapProviderConfig = Object.freeze({get});
})();
