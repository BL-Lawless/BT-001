(() => {
  "use strict";

  function getRest() {
    return window.restService || null;
  }

  const api = {
    fetch(url, options) {
      const rest = getRest();
      return rest.request(url, options);
    },
    request(url, options) {
      const rest = getRest();
      return rest.request(url, options);
    },
    requestJson(url, options) {
      const rest = getRest();
      return rest.requestJson(url, options);
    },
    getData(url, options) {
      const rest = getRest();
      return rest.get(url, options);
    },
    postData(url, data, options) {
      const rest = getRest();
      return rest.post(url, data, options);
    },
    updateData(url, data, options) {
      const rest = getRest();
      return rest.put(url, data, options);
    },
    deleteData(url, options) {
      const rest = getRest();
      return rest.delete(url, options);
    }
  };

  window.BINANCE_REST_MODULE = api;
})();

