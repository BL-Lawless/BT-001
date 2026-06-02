(() => {
  "use strict";

  function buildApi() {
    const restApi = window.BINANCE_REST_MODULE || null;
    const wsApi = window.BINANCE_WS_MODULE || null;
    if (!restApi || !wsApi) return null;
    return {
      fetch: restApi.fetch,
      request: restApi.request,
      requestJson: restApi.requestJson,
      getData: restApi.getData,
      postData: restApi.postData,
      updateData: restApi.updateData,
      deleteData: restApi.deleteData,
      createWebSocket: wsApi.createWebSocket,
      connectWebSocket: wsApi.connectWebSocket,
      rest: window.restService,
      websocket: window.websocketService
    };
  }

  function install() {
    const api = buildApi();
    if (!api) return;
    window.API = api;
    window.API_FEATURE = {
      version: "FEATURES_API_OWNER_V1",
      api
    };
  }

  install();
  setTimeout(install, 0);
})();

