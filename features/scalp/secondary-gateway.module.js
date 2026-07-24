(() => {
  "use strict";

  // Independent Binance Futures client for whichever account SCALP uses (see
  // features/scalp/index.js). It never
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
    if (!credentials || !credentials.key || !credentials.secret) throw new Error("Selected Binance account credentials are required");
    const off = await timeOffset();
    const query = new URLSearchParams({ ...params, recvWindow: "5000", timestamp: String(Date.now() + off) }).toString();
    const signature = await hmacHex(credentials.secret, query);
    const url = `${REST_BASE}${path}?${query}&signature=${signature}`;
    return rest.requestJson(url, { method: String(method || "GET").toUpperCase(), cache: "no-store", headers: { "X-MBX-APIKEY": credentials.key } });
  }

  function normalizePositions(rows, symbol) {
    const positions = { LONG: null, SHORT: null };
    for (const row of (Array.isArray(rows) ? rows : [])) {
      if (upper(row && row.symbol) !== upper(symbol)) continue;
      const amount = n(row && row.positionAmt) || 0;
      if (Math.abs(amount) <= 1e-12) continue;
      const explicit = upper(row && row.positionSide);
      const side = explicit === "LONG" || explicit === "SHORT" ? explicit : amount < 0 ? "SHORT" : "LONG";
      positions[side] = {
        symbol: upper(row.symbol), side, positionSide: side, qty: Math.abs(amount),
        avg: n(row.entryPrice) || 0, leverage: n(row.leverage) || 1
      };
    }
    return positions;
  }
  function filterNumber(filters, type, key) {
    const row = (Array.isArray(filters) ? filters : []).find(item => upper(item && item.filterType) === type);
    return n(row && row[key]);
  }
  function flattenSymbolFilters(symbolInfo) {
    const filters = (symbolInfo && Array.isArray(symbolInfo.filters)) ? symbolInfo.filters : [];
    const lotStepSize = filterNumber(filters, "LOT_SIZE", "stepSize");
    const marketStepSize = filterNumber(filters, "MARKET_LOT_SIZE", "stepSize") || lotStepSize;
    const lotMinQty = filterNumber(filters, "LOT_SIZE", "minQty") || 0;
    const marketMinQty = filterNumber(filters, "MARKET_LOT_SIZE", "minQty") || 0;
    const maximums = [
      filterNumber(filters, "LOT_SIZE", "maxQty"),
      filterNumber(filters, "MARKET_LOT_SIZE", "maxQty")
    ].filter(value => value > 0);
    return {
      filters,
      tickSize: filterNumber(filters, "PRICE_FILTER", "tickSize"),
      stepSize: Math.max(lotStepSize || 0, marketStepSize || 0) || null,
      lotStepSize,
      marketStepSize,
      minQty: Math.max(lotMinQty, marketMinQty),
      maxQty: maximums.length ? Math.min(...maximums) : null,
      minNotional: filterNumber(filters, "MIN_NOTIONAL", "notional") || filterNumber(filters, "NOTIONAL", "minNotional")
    };
  }

  function create(accountSlot = "scalper") {
    const slot = accountSlot === "main" ? "main" : "scalper";
    let streamStatus = "OFFLINE", stream = null, attachedEngine = null;

    function credentials() {
      return window.BT001ScalpAccount && window.BT001ScalpAccount.getCredentials ? window.BT001ScalpAccount.getCredentials(slot) : { key: "", secret: "" };
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
      if (window.BT001ScalpAccount) window.BT001ScalpAccount.reportConnectionStatus(slot, status);
    }

    async function positionRows() {
      const data = await signedRequest(credentials(), "/fapi/v2/positionRisk", "GET", { symbol: symbol() });
      return Array.isArray(data) ? data : [];
    }
    async function balance() {
      const data = await signedRequest(credentials(), "/fapi/v2/balance", "GET");
      return Array.isArray(data) ? data : [];
    }
    async function positions() {
      const rows = await positionRows();
      return { positions: normalizePositions(rows, symbol()) };
    }
    async function position() {
      const result = await positions();
      return { position: result.positions.LONG || result.positions.SHORT || null, positions: result.positions };
    }
    async function refreshPositions() { return (await positions()).positions; }
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
        symbol: upper(sym),
        status: symbolInfo ? "ready" : "error",
        ...flattenSymbolFilters(symbolInfo),
        positionMode: dual && dual.dualSidePosition === true ? "HEDGE" : "ONE_WAY",
        leverage: n(positionRow && positionRow.leverage) || 1
      };
    }
    async function commissionRate(sym = symbol()) {
      return signedRequest(credentials(), "/fapi/v1/commissionRate", "GET", { symbol: sym });
    }
    async function orders() {
      const [openOrders, openAlgoOrders] = await Promise.all([
        signedRequest(credentials(), "/fapi/v1/openOrders", "GET", { symbol: symbol() }),
        // The list read must succeed before reconciliation is trusted. A failure is surfaced to the
        // engine so it cannot mistake an unreadable order list for an empty one.
        signedRequest(credentials(), "/fapi/v1/openAlgoOrders", "GET", { symbol: symbol() })
      ]);
      const algoList = Array.isArray(openAlgoOrders) ? openAlgoOrders : (openAlgoOrders && Array.isArray(openAlgoOrders.orders) ? openAlgoOrders.orders : []);
      return { orders: Array.isArray(openOrders) ? openOrders : [], algoOrders: algoList };
    }
    async function reconcile() {
      const [pos, ord] = await Promise.all([positions(), orders()]);
      return { positions: pos.positions, position: pos.positions.LONG || pos.positions.SHORT || null, orders: ord };
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
        onPositionFact: () => { refreshPositions().then(current => { if (attachedEngine) attachedEngine.onPosition({ positions: current, current }); }).catch(() => {}); },
        onOrderFact: payload => { if (attachedEngine) attachedEngine.onOrder(payload); },
        onDirty: () => {},
        onStatus: statusDetail => { setStreamStatus(upper(statusDetail && statusDetail.streamStatus) || "OFFLINE"); if (attachedEngine) attachedEngine.onPrivateStatus(statusDetail); },
        onAuthoritativeSeed: () => { refreshPositions().then(current => { if (attachedEngine) attachedEngine.onPosition({ positions: current, current }); }).catch(() => {}); }
      });
      stream.start();
    }
    function detach() {
      if (stream) { try { stream.stop(); } catch (_e) {} }
      stream = null; attachedEngine = null; setStreamStatus("OFFLINE");
    }

    return Object.freeze({
      isAuthenticated, symbol, connection: () => ({ streamStatus }),
      position, positions, filters, orders, balance, commissionRate, refreshPosition, refreshPositions, reconcile,
      submitOrder, cancelOrder, queryOrder, submitAlgoOrder, cancelAlgoOrder, queryAlgoOrder,
      markDirty, attach, detach
    });
  }

  window.BT001ScalpSecondaryGateway = Object.freeze({ create, normalizePositions, flattenSymbolFilters });
})();
