(function (global) {
  const rest = global.restService;
  const websocket = global.websocketService;

  if (!rest) {
    throw new Error("rest.service.js must load before apis.js");
  }

  if (!websocket) {
    throw new Error("websocket.service.js must load before apis.js");
  }

  global.API = {
    fetch: (url, options) => rest.request(url, options),
    request: (url, options) => rest.request(url, options),
    requestJson: (url, options) => rest.requestJson(url, options),
    getData: (url, options) => rest.get(url, options),
    postData: (url, data, options) => rest.post(url, data, options),
    updateData: (url, data, options) => rest.put(url, data, options),
    deleteData: (url, options) => rest.delete(url, options),
    createWebSocket: (url, protocols) => websocket.createWebSocket(url, protocols),
    connectWebSocket: (url, options) => websocket.connect(url, options),
    rest,
    websocket
  };
})(window);
