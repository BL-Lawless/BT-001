const API = (() => {
  function normalizeHeaders(headers = {}) {
    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }

    return { ...headers };
  }

  function createError(message, details = {}) {
    const error = new Error(message || "Request failed");
    Object.assign(error, details);
    return error;
  }

  async function parseBody(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (_error) {
        return null;
      }
    }

    try {
      return await response.text();
    } catch (_error) {
      return null;
    }
  }

  async function request(url, options = {}) {
    const config = {
      method: options.method || "GET",
      cache: options.cache || "no-store",
      ...options,
      headers: normalizeHeaders(options.headers)
    };

    try {
      return await fetch(url, config);
    } catch (error) {
      throw createError(error.message || "Network request failed", {
        cause: error,
        url,
        options: config,
        isNetworkError: true
      });
    }
  }

  async function requestJson(url, options = {}) {
    const response = await request(url, options);
    const data = await parseBody(response);

    if (!response.ok) {
      const message = data && typeof data === "object" && data.msg
        ? data.msg
        : `HTTP ${response.status}`;

      throw createError(message, {
        status: response.status,
        data,
        url,
        options
      });
    }

    return data;
  }

  async function getData(url, options = {}) {
    return requestJson(url, { ...options, method: "GET" });
  }

  async function postData(url, data, options = {}) {
    const headers = normalizeHeaders(options.headers);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    return requestJson(url, {
      ...options,
      method: "POST",
      headers,
      body: headers["Content-Type"] === "application/json" && typeof data !== "string"
        ? JSON.stringify(data)
        : data
    });
  }

  async function updateData(url, data, options = {}) {
    const headers = normalizeHeaders(options.headers);
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    return requestJson(url, {
      ...options,
      method: options.method || "PUT",
      headers,
      body: headers["Content-Type"] === "application/json" && typeof data !== "string"
        ? JSON.stringify(data)
        : data
    });
  }

  async function deleteData(url, options = {}) {
    return requestJson(url, { ...options, method: "DELETE" });
  }

  function createWebSocket(url, protocols) {
    return protocols ? new WebSocket(url, protocols) : new WebSocket(url);
  }

  return {
    fetch: request,
    request,
    requestJson,
    getData,
    postData,
    updateData,
    deleteData,
    createWebSocket
  };
})();
