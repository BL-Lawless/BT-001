const REFOCUS_DIAG = false;

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.BinanceRestGate = api.BinanceRestGate;
    if (!root.BINANCE_REST_GATE) root.BINANCE_REST_GATE = api.sharedGate;
    if (typeof root.fetch === "function" && !root.fetch.__bt001BinanceGateWrapped) {
      root.fetch = root.BINANCE_REST_GATE.wrapFetch(root.fetch.bind(root));
    }
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const DEFAULT_429_PAUSE_MS = 60 * 1000;
  const DEFAULT_418_PAUSE_MS = 5 * 60 * 1000;
  const MAX_TIMER_MS = 0x7fffffff;
  const refocusDiagNow = () => typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  function refocusDiagValue(key,value) {
    if(typeof value === "number" && Number.isFinite(value) && ["performanceNow","elapsedMs","remainingMs"].includes(key)){
      return value.toFixed(1);
    }
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }
  function refocusDiag(event,detail={}) {
    if(!REFOCUS_DIAG)return;
    const fields={performanceNow:refocusDiagNow(),...detail};
    const suffix=Object.entries(fields)
      .map(([key,value])=>`${key}=${refocusDiagValue(key,value)}`)
      .join(" ");
    console.log(`[REFOCUS-DIAG] ${event}${suffix ? ` ${suffix}` : ""}`);
  }

  function hostnameOf(input) {
    try {
      const raw = input && typeof input === "object" && input.url ? input.url : input;
      return new URL(String(raw), "https://invalid.local").hostname.toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function isBinanceRestUrl(input) {
    const host = hostnameOf(input);
    return host === "api.binance.com"
      || host === "fapi.binance.com"
      || host.endsWith(".binance.com")
      || host.endsWith(".binancefuture.com");
  }

  function parseRetryAfter(value, now) {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return now + seconds * 1000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? date : 0;
  }

  function parseBannedUntil(value) {
    const text = typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? String(value.msg || value.message || JSON.stringify(value))
        : "";
    const match = text.match(/banned\s+until\s+(\d{10,})/i);
    if (!match) return 0;
    const timestamp = Number(match[1]);
    return Number.isFinite(timestamp)
      ? (timestamp < 1e12 ? timestamp * 1000 : timestamp)
      : 0;
  }

  class BinanceRestGate {
    constructor(options = {}) {
      this.now = typeof options.now === "function" ? options.now : Date.now;
      this.logger = options.logger || console;
      this.default429PauseMs = Number(options.default429PauseMs) || DEFAULT_429_PAUSE_MS;
      this.default418PauseMs = Number(options.default418PauseMs) || DEFAULT_418_PAUSE_MS;
      this.pausedUntil = 0;
      this.pauseStatus = null;
      this.pauseReason = "";
      this.pauseLogged = false;
      this.exitTimer = null;
      this.waiters = [];
    }

    state() {
      this.refresh();
      return Object.freeze({
        paused: this.pausedUntil > this.now(),
        pausedUntil: this.pausedUntil,
        remainingMs: Math.max(0, this.pausedUntil - this.now()),
        status: this.pauseStatus,
        reason: this.pauseReason
      });
    }

    isPaused() {
      return this.state().paused;
    }

    refresh() {
      if (this.pausedUntil && this.now() >= this.pausedUntil) this.exitPause();
    }

    exitPause() {
      if (!this.pausedUntil) return;
      const previousUntil = this.pausedUntil;
      this.pausedUntil = 0;
      this.pauseStatus = null;
      this.pauseReason = "";
      if (this.exitTimer != null) clearTimeout(this.exitTimer);
      this.exitTimer = null;
      this.pauseLogged = false;
      refocusDiag("BINANCE_REST_GATE paused state changed",{
        previousPaused:true,
        paused:false,
        remainingMs:0,
        previousUntil
      });
      const waiters = this.waiters.splice(0);
      for (const resolve of waiters) {
        try { resolve(); } catch (_error) {}
      }
    }

    scheduleExit() {
      if (this.exitTimer != null) clearTimeout(this.exitTimer);
      const delay = Math.max(1, Math.min(MAX_TIMER_MS, this.pausedUntil - this.now()));
      this.exitTimer = setTimeout(() => {
        this.exitTimer = null;
        if (this.now() >= this.pausedUntil) this.exitPause();
        else this.scheduleExit();
      }, delay);
      if (this.exitTimer && typeof this.exitTimer.unref === "function") this.exitTimer.unref();
    }

    pause(until, details = {}) {
      const nextUntil = Math.max(this.now() + 1, Number(until) || 0);
      const wasPaused = this.pausedUntil > this.now();
      if (nextUntil <= this.pausedUntil && wasPaused) return this.state();
      this.pausedUntil = nextUntil;
      this.pauseStatus = details.status || this.pauseStatus;
      this.pauseReason = details.reason || this.pauseReason || "Binance rate limit";
      if (!wasPaused) {
        this.pauseLogged = true;
        refocusDiag("BINANCE_REST_GATE paused state changed",{
          previousPaused:false,
          paused:true,
          remainingMs:Math.max(0,this.pausedUntil-this.now()),
          pausedUntil:this.pausedUntil,
          status:this.pauseStatus
        });
      }
      this.scheduleExit();
      return this.state();
    }

    beforeRequest(input) {
      if (!isBinanceRestUrl(input)) return;
      this.refresh();
      if (this.pausedUntil > this.now()) {
        return new Promise(resolve => this.waiters.push(resolve));
      }
    }

    async observeResponse(response) {
      if (!response || response.ok) return response;
      const now = this.now();
      let body = "";
      try { body = await response.clone().text(); } catch (_error) {}
      const bannedUntil = parseBannedUntil(body);
      const rateLimited = response.status === 429 || response.status === 418;
      if (!rateLimited && !bannedUntil) return response;
      const retryHeader = response.headers && typeof response.headers.get === "function"
        ? response.headers.get("retry-after")
        : null;
      const retryUntil = parseRetryAfter(retryHeader, now);
      const fallbackUntil = now + (response.status === 418 ? this.default418PauseMs : this.default429PauseMs);
      this.pause(Math.max(retryUntil, bannedUntil) || fallbackUntil, {
        status: response.status,
        reason: bannedUntil
          ? `Binance IP ban response: ${body.slice(0, 240)}`
          : `Binance rate-limit response HTTP ${response.status}`
      });
      return response;
    }

    wrapFetch(fetchFn) {
      if (typeof fetchFn !== "function") throw new TypeError("A fetch function is required");
      const gate = this;
      const wrapped = async function gatedBinanceFetch(input, options) {
        if (!isBinanceRestUrl(input)) return fetchFn(input, options);
        const pause = gate.beforeRequest(input);
        if (pause) await pause;
        const response = await fetchFn(input, options);
        return gate.observeResponse(response);
      };
      Object.defineProperty(wrapped, "__bt001BinanceGateWrapped", { value: true });
      return wrapped;
    }
  }

  const sharedGate = new BinanceRestGate();

  return Object.freeze({
    BinanceRestGate,
    sharedGate,
    isBinanceRestUrl,
    parseRetryAfter,
    parseBannedUntil,
    constants: Object.freeze({ DEFAULT_429_PAUSE_MS, DEFAULT_418_PAUSE_MS })
  });
});
