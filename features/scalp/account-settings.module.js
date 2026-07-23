(() => {
  "use strict";

  // Second-account settings for SCALP only. Storage mirrors main.js's existing single-account
  // mechanism exactly (plain localStorage, DOM-input Save button, optional "remember" checkbox) --
  // this file just adds a second, independent set of keys/inputs for the "Scalper" slot. The
  // "Main" account's own storage/DOM elements/handlers in main.js are never touched or read here.
  const STORE = "btc_futures_chart_v12_";
  const SK_SCALPER = STORE + "api_key_scalper";
  const SS_SCALPER = STORE + "api_secret_scalper";
  const SR_SCALPER = STORE + "remember_keys_scalper";
  const NICK_MAIN = STORE + "api_nickname_main";
  const NICK_SCALPER = STORE + "api_nickname_scalper";
  const SCALP_SLOT_KEY = STORE + "scalp_account_slot"; // "main" | "scalper"

  const $ = id => document.getElementById(id);
  const listeners = new Set();
  let connectionStatusBySlot = { main: null, scalper: null };

  function getSlot() {
    const value = String(localStorage.getItem(SCALP_SLOT_KEY) || "main");
    return value === "scalper" ? "scalper" : "main";
  }
  function setSlot(slot) {
    const next = slot === "scalper" ? "scalper" : "main";
    if (getSlot() === next) return;
    try { localStorage.setItem(SCALP_SLOT_KEY, next); } catch (_e) {}
    notify();
    try { window.dispatchEvent(new CustomEvent("bt001:scalp-account-slot-changed", { detail: { slot: next } })); } catch (_e) {}
  }
  function getNickname(slot) {
    const key = slot === "scalper" ? NICK_SCALPER : NICK_MAIN;
    const fallback = slot === "scalper" ? "Scalper" : "Main";
    try { return localStorage.getItem(key) || fallback; } catch (_e) { return fallback; }
  }
  function setNickname(slot, value) {
    const key = slot === "scalper" ? NICK_SCALPER : NICK_MAIN;
    try { localStorage.setItem(key, String(value || "").trim() || (slot === "scalper" ? "Scalper" : "Main")); } catch (_e) {}
    notify();
  }
  function hasScalperKeys() {
    const keyEl = $("apiKeyScalper"), secretEl = $("apiSecretScalper");
    return !!(keyEl && secretEl && keyEl.value.trim() && secretEl.value.trim());
  }
  function getScalperCredentials() {
    const keyEl = $("apiKeyScalper"), secretEl = $("apiSecretScalper");
    return { key: keyEl ? keyEl.value.trim() : "", secret: secretEl ? secretEl.value.trim() : "" };
  }
  // "main" slot credentials are intentionally never read here -- when scalp is bound to "main",
  // it uses the existing window.BT001_BINANCE_TRADING gateway untouched, exactly as before this
  // feature existed. This module only ever needs to answer "which slot", not main's own secret.
  function isConfigured(slot) {
    return slot === "scalper" ? hasScalperKeys() : true;
  }
  function saveScalperKeysLocal() {
    const rememberEl = $("rememberKeysScalper"), keyEl = $("apiKeyScalper"), secretEl = $("apiSecretScalper");
    if (!rememberEl || !keyEl || !secretEl) return;
    if (!rememberEl.checked) {
      try { localStorage.removeItem(SK_SCALPER); localStorage.removeItem(SS_SCALPER); localStorage.setItem(SR_SCALPER, "0"); } catch (_e) {}
      notify();
      return;
    }
    try {
      localStorage.setItem(SR_SCALPER, "1");
      localStorage.setItem(SK_SCALPER, keyEl.value.trim());
      localStorage.setItem(SS_SCALPER, secretEl.value.trim());
    } catch (_e) {}
    notify();
  }
  function restoreScalperKeys() {
    const rememberEl = $("rememberKeysScalper"), keyEl = $("apiKeyScalper"), secretEl = $("apiSecretScalper");
    if (!rememberEl || !keyEl || !secretEl) return;
    let remembered = "1";
    try { remembered = localStorage.getItem(SR_SCALPER); } catch (_e) {}
    if (remembered === "0") { rememberEl.checked = false; return; }
    rememberEl.checked = true;
    try { keyEl.value = localStorage.getItem(SK_SCALPER) || ""; secretEl.value = localStorage.getItem(SS_SCALPER) || ""; } catch (_e) {}
  }
  function clearScalperKeys() {
    try { localStorage.removeItem(SK_SCALPER); localStorage.removeItem(SS_SCALPER); localStorage.setItem(SR_SCALPER, "0"); } catch (_e) {}
    const keyEl = $("apiKeyScalper"), secretEl = $("apiSecretScalper"), rememberEl = $("rememberKeysScalper");
    if (keyEl) keyEl.value = ""; if (secretEl) secretEl.value = ""; if (rememberEl) rememberEl.checked = false;
    notify();
  }

  function snapshot() {
    return {
      slot: getSlot(),
      accounts: {
        main: { nickname: getNickname("main"), configured: true, connection: connectionStatusBySlot.main },
        scalper: { nickname: getNickname("scalper"), configured: hasScalperKeys(), connection: connectionStatusBySlot.scalper }
      }
    };
  }
  function subscribe(listener) {
    listeners.add(listener);
    try { listener(snapshot()); } catch (_e) {}
    return () => listeners.delete(listener);
  }
  function notify() {
    const value = snapshot();
    listeners.forEach(listener => { try { listener(value); } catch (_e) {} });
    render();
  }
  function reportConnectionStatus(slot, status) {
    connectionStatusBySlot[slot === "scalper" ? "scalper" : "main"] = status || null;
    notify();
  }

  function statusText(slot) {
    const configured = isConfigured(slot), enabled = getSlot() === slot, connection = connectionStatusBySlot[slot];
    const parts = [`Configured: ${configured ? "Yes" : "No"}`];
    parts.push(`Scalper account: ${enabled ? "Yes (active)" : "No"}`);
    if (enabled) parts.push(`Connection: ${connection || (configured ? "Starting…" : "Not configured")}`);
    return parts.join(" · ");
  }

  function render() {
    const nicknameMain = $("apiNicknameMain"), nicknameScalper = $("apiNicknameScalper");
    if (nicknameMain && document.activeElement !== nicknameMain) nicknameMain.value = getNickname("main");
    if (nicknameScalper && document.activeElement !== nicknameScalper) nicknameScalper.value = getNickname("scalper");
    const toggleMain = $("apiScalperToggleMain"), toggleScalper = $("apiScalperToggleScalper"), slot = getSlot();
    if (toggleMain) toggleMain.checked = slot === "main";
    if (toggleScalper) toggleScalper.checked = slot === "scalper";
    const bodyMain = $("apiStatusBodyMain"), bodyScalper = $("apiStatusBodyScalper");
    if (bodyMain) bodyMain.textContent = statusText("main");
    if (bodyScalper) bodyScalper.textContent = statusText("scalper");
  }

  function openScalperApiModal() {
    const modal = $("apiModalScalper");
    if (modal) modal.classList.remove("hidden");
  }
  function closeScalperApiModal() {
    const modal = $("apiModalScalper");
    if (modal) modal.classList.add("hidden");
  }

  function bind() {
    const nicknameMain = $("apiNicknameMain"), nicknameScalper = $("apiNicknameScalper");
    if (nicknameMain) nicknameMain.addEventListener("change", () => setNickname("main", nicknameMain.value));
    if (nicknameScalper) nicknameScalper.addEventListener("change", () => setNickname("scalper", nicknameScalper.value));

    const toggleMain = $("apiScalperToggleMain"), toggleScalper = $("apiScalperToggleScalper");
    if (toggleMain) toggleMain.addEventListener("change", () => { if (toggleMain.checked) setSlot("main"); else render(); });
    if (toggleScalper) toggleScalper.addEventListener("change", () => { if (toggleScalper.checked) setSlot("scalper"); else render(); });

    const openScalper = $("openBinanceSettingsScalper");
    if (openScalper) openScalper.addEventListener("click", openScalperApiModal);
    const closeScalper = $("closeApiKeysScalper");
    if (closeScalper) closeScalper.addEventListener("click", closeScalperApiModal);
    const modalScalper = $("apiModalScalper");
    if (modalScalper) modalScalper.addEventListener("click", event => { if (event.target === modalScalper) closeScalperApiModal(); });
    const saveScalper = $("saveApiKeysScalper");
    if (saveScalper) saveScalper.addEventListener("click", () => { saveScalperKeysLocal(); closeScalperApiModal(); });

    restoreScalperKeys();
    render();
  }

  window.BT001ScalpAccount = Object.freeze({
    getSlot, setSlot, getNickname, isConfigured, getScalperCredentials,
    hasScalperKeys, clearScalperKeys, reportConnectionStatus, subscribe, snapshot
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
