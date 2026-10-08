/* Lightweight, dependency-free performance profiles for Heartbeat. */
(function () {
  "use strict";

  const PRESETS = {
    desktop: { samples: 10000, dpr: 1.75, pointSize: 4.8, glow: 1.0 },
    mobile:  { samples: 5000, dpr: 1.4, pointSize: 4.7, glow: 0.85 },
    low:     { samples: 2400, dpr: 1.0, pointSize: 4.5, glow: 0.65 }
  };
  const ORDER = ["desktop", "mobile", "low"];

  function initialTier() {
    const narrow = Math.min(window.innerWidth, window.innerHeight) <= 600;
    const reducedMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
    const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;

    if (reducedMotion || lowMemory || lowCores) return "low";
    if (narrow || (navigator.deviceMemory && navigator.deviceMemory <= 4)) return "mobile";
    return "desktop";
  }

  function profile(tier) {
    const preset = PRESETS[tier] || PRESETS.mobile;
    return {
      tier: tier,
      samples: preset.samples,
      dpr: Math.min(window.devicePixelRatio || 1, preset.dpr),
      pointSize: preset.pointSize,
      glow: preset.glow
    };
  }

  // Only downgrade. A two-window hysteresis prevents oscillation while interacting.
  function createMonitor(onDowngrade) {
    let tier = initialTier();
    let last = 0;
    let elapsed = 0;
    let frames = 0;
    let slowWindows = 0;

    return {
      get tier() { return tier; },
      reset: function () {
        last = 0;
        elapsed = 0;
        frames = 0;
        slowWindows = 0;
      },
      tick: function (now) {
        if (!last) { last = now; return; }
        const delta = now - last;
        last = now;
        if (delta > 250 || delta <= 0) return; // hidden tabs / resumed rendering
        elapsed += delta;
        frames += 1;
        if (elapsed < 3500) return;

        const fps = frames * 1000 / elapsed;
        const target = tier === "low" ? 27 : tier === "mobile" ? 42 : 48;
        slowWindows = fps < target ? slowWindows + 1 : 0;
        elapsed = 0;
        frames = 0;

        if (slowWindows >= 2 && tier !== "low") {
          tier = ORDER[ORDER.indexOf(tier) + 1];
          slowWindows = 0;
          onDowngrade(profile(tier));
        }
      }
    };
  }

  window.HeartbeatQuality = { initialTier: initialTier, profile: profile, createMonitor: createMonitor };
})();
