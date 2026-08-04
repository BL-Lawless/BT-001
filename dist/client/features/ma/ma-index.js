(() => {
  "use strict";

  function buildFacade() {
    const settings = window.MA_SETTINGS_MODULE;
    const series = window.MA_SERIES_MODULE;
    const overlay = window.MA_OVERLAY_MODULE;
    const tooltip = window.MA_TOOLTIP_MODULE;
    if (!settings || !series || !overlay || !tooltip) return null;

    const facade = {
      __owner: "features-ma",
      version: "FEATURES_MA_OWNER_V1",
      period: settings.period,
      color: settings.color,
      alpha: settings.alpha,
      width: settings.width,
      strokeFor: settings.strokeFor,
      enabled: settings.enabled,
      ensureDepthForCurrentState: overlay.ensureDepthForCurrentState,
      handleToggleChange: overlay.handleToggleChange,
      rebuildSeries: series.rebuildSeries,
      getCanonicalMASlots: series.getCanonicalMASlots,
      getCanonicalMAPeriods: series.getCanonicalMAPeriods,
      getActiveChartMASeries: series.getActiveChartMASeries,
      getVWAPSeries: series.getVWAPSeries,
      getCanonicalMASettings: settings.getCanonicalMASettings,
      rebuildSettings: settings.rebuildSettings,
      install() {
        settings.ensureToggles();
        settings.syncHiddenPeriodInputs();
        series.rebuildSeries();
        tooltip.installTooltipOwner();
        settings.updateLabels();
        settings.rebuildSettings();
      }
    };
    return facade;
  }

  function installIndicatorsBridge(facade) {
    if (window.__maIndicatorsBridgeInstalled) return;
    if (typeof window.indicators !== "function") return;
    if (window.indicators.__usesMAFeature) return;
    window.__maIndicatorsBridgeInstalled = true;
    const prev = window.indicators;
    window.indicators = function () {
      const r = prev.apply(this, arguments);
      facade.rebuildSeries();
      return r;
    };
  }

  function activate() {
    const facade = buildFacade();
    if (!facade) return;
    window.MA_FEATURE = facade;
    window.getCanonicalMASlots = facade.getCanonicalMASlots;
    window.getCanonicalMAPeriods = facade.getCanonicalMAPeriods;
    window.getActiveChartMASeries = facade.getActiveChartMASeries;
    window.getCanonicalMASettings = facade.getCanonicalMASettings;
    window.getVWAPSeries = facade.getVWAPSeries;
    installIndicatorsBridge(facade);
    facade.install();
  }

  function boot() {
    activate();
    setTimeout(activate, 60);
    setTimeout(activate, 250);
    setTimeout(activate, 700);
  }

  boot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }
})();
