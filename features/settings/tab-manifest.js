(() => {
  "use strict";

  const registry = window.BT001SettingsTabs;
  if (!registry) throw new Error("Settings tab registry is unavailable");

  function adoptIds(context, ids) {
    ids.forEach(id => {
      const element = document.getElementById(id);
      if (element) context.adopt(element);
    });
  }

  const mounts = {
    apis(context) {
      adoptIds(context, ["binanceSettingsCard", "gptSettingsCard", "scalpSupabaseSettingsCard", "apiCapabilityCard"]);
    },
    chart(context) {
      adoptIds(context, [
        "chartCandleSettingsCard",
        "maSettingsCard",
        "patch5ClosedCard",
        "v21TrackpadCard",
      ]);
    },
    sessions(context) {
      adoptIds(context, ["v22SessionsCard"]);
    },
    strategyLab(context) {
      adoptIds(context, ["strategyLabSettingsCard"]);
    },
    assess(context) {
      if (!window.AssessClipboardModule || typeof window.AssessClipboardModule.mountSettings !== "function") {
        throw new Error("Assess settings mount is unavailable");
      }
      window.AssessClipboardModule.mountSettings(context.body);
    },
    maEventLab(context) {
      if (!window.MA_STACK_MARKERS || typeof window.MA_STACK_MARKERS.mountSettings !== "function") {
        throw new Error("MAs Event Lab settings mount is unavailable");
      }
      window.MA_STACK_MARKERS.mountSettings(context.body);
    },
    keyLevels(context) {
      if (!window.PRICE_LEVELS_OVERLAY || typeof window.PRICE_LEVELS_OVERLAY.mountSettings !== "function") {
        throw new Error("Key levels settings mount is unavailable");
      }
      window.PRICE_LEVELS_OVERLAY.mountSettings(context.body);
      if (window.DSMA_LEVELS_OVERLAY && typeof window.DSMA_LEVELS_OVERLAY.mountSettings === "function") {
        window.DSMA_LEVELS_OVERLAY.mountSettings(context.body);
      }
    },
    smc(context) {
      if (!window.SMC_FEATURE || typeof window.SMC_FEATURE.mountSettings !== "function") {
        throw new Error("SMC settings mount is unavailable");
      }
      window.SMC_FEATURE.mountSettings(context.body);
    },
    signals(context) {
      if (typeof window.mountSignalEngineSettings !== "function") {
        throw new Error("Signals settings mount is unavailable");
      }
      window.mountSignalEngineSettings(context.body);
    },
    heatmap(context) {
      if (!window.BT001HeatmapUI || typeof window.BT001HeatmapUI.settings !== "function") {
        throw new Error("Heatmap settings mount is unavailable");
      }
      window.BT001HeatmapUI.settings(context.body);
      if (window.BT001_DEPTH_PROFILE && typeof window.BT001_DEPTH_PROFILE.mountSettings === "function") {
        window.BT001_DEPTH_PROFILE.mountSettings(context.body);
      }
    }
  };

  const SETTINGS_TABS = Object.freeze([
    Object.freeze({
      id: "apis",
      label: "APIs",
      order: 100,
      mount: mounts.apis,
      onOpen() {
        if (typeof window.BT001RefreshApiCapabilityInfo === "function") {
          window.BT001RefreshApiCapabilityInfo({ force: false }).catch(() => {});
        }
      }
    }),
    Object.freeze({ id: "chart", label: "Chart", order: 200, mount: mounts.chart }),
    Object.freeze({ id: "sessions", label: "Sessions", order: 300, mount: mounts.sessions }),
    Object.freeze({ id: "strategy-lab", label: "Strategy Lab", order: 400, mount: mounts.strategyLab }),
    Object.freeze({ id: "assess", label: "Assess", order: 500, mount: mounts.assess }),
    Object.freeze({ id: "ma-event-lab", label: "MAs Event Lab", order: 600, mount: mounts.maEventLab }),
    Object.freeze({ id: "key-levels", label: "Key levels", order: 700, mount: mounts.keyLevels }),
    Object.freeze({ id: "smc", label: "SMC", order: 800, mount: mounts.smc }),
    Object.freeze({ id: "signals", label: "Signals", order: 900, mount: mounts.signals }),
    Object.freeze({ id: "heatmap", label: "Heatmap", order: 1000, mount: mounts.heatmap })
  ]);

  Object.defineProperty(window, "BT001_SETTINGS_TAB_MANIFEST", { value: SETTINGS_TABS, configurable: true });
  SETTINGS_TABS.forEach(definition => registry.register(definition));
  registry.start();
})();
