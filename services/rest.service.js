(function (global) {
  class RestError extends Error {
    constructor(message, details = {}) {
      super(message || "Request failed");
      this.name = "RestError";
      Object.assign(this, details);
    }
  }

  class RestService {
    constructor({ defaultHeaders = {}, authToken = null } = {}) {
      this.defaultHeaders = { ...defaultHeaders };
      this.authToken = authToken;
    }

    setAuthToken(token) {
      this.authToken = token || null;
    }

    clearAuthToken() {
      this.authToken = null;
    }

    normalizeHeaders(headers = {}) {
      if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
      }

      return { ...headers };
    }

    buildHeaders(headers = {}) {
      const merged = {
        ...this.defaultHeaders,
        ...this.normalizeHeaders(headers)
      };

      if (this.authToken && !merged.Authorization) {
        merged.Authorization = `Bearer ${this.authToken}`;
      }

      return merged;
    }

    async parseBody(response) {
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

    async request(url, options = {}) {
      const config = {
        method: options.method || "GET",
        cache: options.cache || "no-store",
        ...options,
        headers: this.buildHeaders(options.headers)
      };

      try {
        return await fetch(url, config);
      } catch (error) {
        throw new RestError(error.message || "Network request failed", {
          cause: error,
          url,
          options: config,
          isNetworkError: true
        });
      }
    }

    async requestJson(url, options = {}) {
      const response = await this.request(url, options);
      const data = await this.parseBody(response);

      if (!response.ok) {
        const message = data && typeof data === "object" && data.msg
          ? data.msg
          : `HTTP ${response.status}`;

        throw new RestError(message, {
          status: response.status,
          data,
          url,
          options
        });
      }

      return data;
    }

    get(url, options = {}) {
      return this.requestJson(url, { ...options, method: "GET" });
    }

    post(url, data, options = {}) {
      return this.sendWithBody(url, data, { ...options, method: "POST" });
    }

    put(url, data, options = {}) {
      return this.sendWithBody(url, data, { ...options, method: "PUT" });
    }

    delete(url, options = {}) {
      return this.requestJson(url, { ...options, method: "DELETE" });
    }

    sendWithBody(url, data, options = {}) {
      const headers = this.buildHeaders(options.headers);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      return this.requestJson(url, {
        ...options,
        headers,
        body: headers["Content-Type"] === "application/json" && typeof data !== "string"
          ? JSON.stringify(data)
          : data
      });
    }
  }

  global.RestError = RestError;
  global.RestService = RestService;
  global.restService = new RestService();
})(window);
