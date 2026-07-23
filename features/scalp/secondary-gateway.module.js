(() => {
  "use strict";

  // Independent Binance Futures client for the "Scalper" account slot -- only ever constructed
  // when that slot is actually configured AND enabled (see features/scalp/index.js). It never
  // touches window.BT001_BINANCE_TRADING's internals, main.js's apiKeyEl/apiSecretEl, or the
  // main account's private stream/position cache; it builds its own signed requests and its own
  // independent user-data-stream via the already-parameterized window.createBinanceUserDataStream
  // factory (features/api/binance-user-stream.module.js), reusing the generic window.API/
  // window.restService HTTP layer exactly as the rest of the app already does.
  const REST_BASE = "https://fapi.binance.com";
  const WS_BASE = "wss://fstream.binance.com/private/ws"; // matches main.js's selectedPrivateWsBase21() for live (non-testnet) trading

  const upper = value => String(value || "").toUpperCase();
  const n = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };

  async function hmacHex(secret, message) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return Array.from(new Uint8Array(signature)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  // Binance server time is a single universal clock-skew value, not account-specific -- fetched
  // independently here (public, unauthenticated endpoint) rather than reusing any main.js internal.
  let cachedOffset = 0, offsetFetchedAt = 0;
  async function timeOffset() {
    if (Date.now() - offsetFetchedAt < 5 * 60 * 1000) return cachedOffset;
    try {
      const data = await window.restService.get(`${REST_BASE}/fapi/v1/time`);
      const serverTime = n(data && data.serverTime);
      if (serverTime != null) { cachedOffset = serverTime - Date.now(); offsetFetchedAt = Date.now(); }
    } catch (_e) {}
    return cachedOffset;
  }

  async function signedRequest(credentials, path, method, params = {}) {
    const rest = window.restService;
    if (!rest) throw new Error("services/rest.service.js (window.restService) is unavailable");
    if (!credentials || !credentials.key || !credentials.secret) throw new Error("Scalper account credentials are required");
    const off = await timeOffset();
    const query = new URLSearchParams({ ...params, recvWindow: "5000", timestamp: String(Date.now() + off) }).toString();
    const signature = await hmacHex(credentials.secret, query);
    const url = `${REST_BASE}${path}?${query}&signature=${signature}`;
    return rest.requestJson(url, { method: String(method || "GET").toUpperCase(), cache: "no-store", headers: { "X-MBX-APIKEY": credentials.key } });
  }

  function normalizePosition(rows, symbol) {
    const row = (Array.isArray(rows) ? rows : []).find(item => upper(item && item.symbol) === upper(symbol) && Math.abs(n(item && item.positionAmt) || 0) > 1e-12);
    if (!row) return null;
    const amt = n(row.positionAmt) || 0;
    return { symbol: upper(row.symbol), side: amt > 0 ? "LONG" : "SHORT", qty: Math.abs(amt), avg: n(row.entryPrice) || 0, leverage: n(row.leverage) || 1 };
  }

  function create() {
    let streamStatus = "OFFLINE", stream = null, attachedEngine = null;

    function credentials() {
      return window.BT001ScalpAccount ? window.BT001ScalpAccount.getScalperCredentials() : { key: "", secret: "" };
    }
    // Scalp keeps trading whatever symbol the app is already showing -- this account gets its own
    // credentials/balance/position/orders, not its own independently-selected symbol.
    function symbol() {
      return window.BT001_BINANCE_TRADING ? window.BT001_BINANCE_TRADING.symbol() : null;
    }
    function isAuthenticated() {
      const creds = credentials();
      return !!(creds.key && creds.secret);
    }
    function setStreamStatus(status) {
      streamStatus = status;
      if (window.BT001ScalpAccount) window.BT001ScalpAccount.reportConnectionStatus("scalper", status);
    }

    async function positionRows() {
      const data = await signedRequest(credentials(), "/fapi/v2/positionRisk", "GET", { symbol: symbol() });
      return Array.isArray(data) ? data : [];
    }
    async function balance() {
      const data = await signedRequest(credentials(), "/fapi/v2/balance", "GET");
      return Array.isArray(data) ? data : [];
    }
    async function position() {
      const rows = await positionRows().catch(() => []);
      return { position: normalizePosition(rows, symbol()) };
    }
    async function refreshPosition() { return (await position()).position; }
    async function filters(sym = symbol()) {
      // Exchange-level lot/tick/notional rules are account-agnostic (public exchangeInfo); position
      // mode (one-way vs hedge) and leverage are per-account and fetched from THIS account.
      const [exchangeInfo, dual, rows] = await Promise.all([
        window.restService.get(`${REST_BASE}/fapi/v1/exchangeInfo?symbol=${encodeURIComponent(sym)}`).catch(() => null),
        signedRequest(credentials(), "/fapi/v1/positionSide/dual", "GET").catch(() => null),
        positionRows().catch(() => [])
      ]);
      const symbolInfo = exchangeInfo && Array.isArray(exchangeInfo.symbols) ? exchangeInfo.symbols.find(item => upper(item.symbol) === upper(sym)) : null;
      const positionRow = rows.find(item => upper(item && item.symbol) === upper(sym));
      return {
        filters: (symbolInfo && symbolInfo.filters) || [],
        positionMode: dual && dual.dualSidePosition === true ? "HEDGE" : "ONE_WAY",
        leverage: n(positionRow && positionRow.leverage) || 1
      };
    }
    async function commissionRate(sym = symbol()) {
      return signedRequest(credentials(), "/fapi/v1/commissionRate", "GET", { symbol: sym });
    }
    async function orders() {
      const [openOrders, openAlgoOrders] = await Promise.all([
        signedRequest(credentials(), "/fapi/v1/openOrders", "GET", { symbol: symbol() }).catch(() => []),
        // Best-effort: this app's algo-order endpoint (/fapi/v1/algoOrder) is used for submit/cancel/
        // query by exact id; its "list all open" counterpart isn't independently confirmed here, so a
        // failure degrades to an empty list rather than breaking reconciliation entirely. Verify this
        // endpoint against your Binance account before relying on it for live algo-order reconciliation.
        signedRequest(credentials(), "/fapi/v1/openAlgoOrders", "GET", { symbol: symbol() }).catch(() => [])
      ]);
      const algoList = Array.isArray(openAlgoOrders) ? openAlgoOrders : (openAlgoOrders && Array.isArray(openAlgoOrders.orders) ? openAlgoOrders.orders : []);
      return { orders: Array.isArray(openOrders) ? openOrders : [], algoOrders: algoList };
    }
    async function reconcile() {
      const [pos, ord] = await Promise.all([position(), orders()]);
      return { position: pos.position, orders: ord };
    }
    function submitOrder(params) { return signedRequest(credentials(), "/fapi/v1/order", "POST", params); }
    function cancelOrder(params) { return signedRequest(credentials(), "/fapi/v1/order", "DELETE", params); }
    function queryOrder(params) { return signedRequest(credentials(), "/fapi/v1/order", "GET", params); }
    function submitAlgoOrder(params) { return signedRequest(credentials(), "/fapi/v1/algoOrder", "POST", params); }
    function cancelAlgoOrder(params) { return signedRequest(credentials(), "/fapi/v1/algoOrder", "DELETE", params); }
    function queryAlgoOrder(params) { return signedRequest(credentials(), "/fapi/v1/algoOrder", "GET", params); }
    function markDirty() {} // no shared main-app cache to invalidate for this account

    function attach(engine) {
      attachedEngine = engine;
      if (typeof window.createBinanceUserDataStream !== "function") { setStreamStatus("UNAVAILABLE"); return; }
      stream = window.createBinanceUserDataStream({
        api: window.API,
        getApiKey: () => credentials().key,
        getSymbol: symbol,
        getRestBase: () => REST_BASE,
        getWsBase: () => WS_BASE,
        onPositionFact: () => { refreshPosition().then(current => { if (attachedEngine) attachedEngine.onPosition({ current }); }).catch(() => {}); },
        onOrderFact: payload => { if (attachedEngine) attachedEngine.onOrder(payload); },
        onDirty: () => {},
        onStatus: statusDetail => { setStreamStatus(upper(statusDetail && statusDetail.streamStatus) || "OFFLINE"); if (attachedEngine) attachedEngine.onPrivateStatus(statusDetail); },
        onAuthoritativeSeed: () => { refreshPosition().then(current => { if (attachedEngine) attachedEngine.onPosition({ current }); }).catch(() => {}); }
      });
      stream.start();
    }
    function detach() {
      if (stream) { try { stream.stop(); } catch (_e) {} }
      stream = null; attachedEngine = null; setStreamStatus("OFFLINE");
    }

    return Object.freeze({
      isAuthenticated, symbol, connection: () => ({ streamStatus }),
      position, filters, orders, balance, commissionRate, refreshPosition, reconcile,
      submitOrder, cancelOrder, queryOrder, submitAlgoOrder, cancelAlgoOrder, queryAlgoOrder,
      markDirty, attach, detach
    });
  }

  window.BT001ScalpSecondaryGateway = Object.freeze({ create });
})();
