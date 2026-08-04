(() => {
  "use strict";

  function getWs() {
    return window.websocketService || null;
  }

  window.BINANCE_WS_MODULE = {
    createWebSocket(url, protocols) {
      const ws = getWs();
      return ws.createWebSocket(url, protocols);
    },
    connectWebSocket(url, options) {
      const ws = getWs();
      return ws.connect(url, options);
    }
  };
})();

