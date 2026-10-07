(() => {
  'use strict';

  const tiers = [
    { name: 'full', maxDpr: 2, farResolution: .5, midResolution: .75, backgroundStep: 1, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(14px) saturate(1.2)', traversalOnly: false },
    { name: 'high', maxDpr: 1.75, farResolution: .5, midResolution: .75, backgroundStep: 1, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(12px) saturate(1.2)', traversalOnly: false },
    { name: 'balanced', maxDpr: 1.25, farResolution: .4, midResolution: .6, backgroundStep: 2, farBlur: 1, midBlur: .5, chatFilter: 'blur(8px) saturate(1.1)', traversalOnly: false },
    { name: 'low', maxDpr: 1, farResolution: .35, midResolution: .5, backgroundStep: 3, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: false },
    { name: 'traversal', maxDpr: 1, farResolution: .35, midResolution: .5, backgroundStep: 4, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: true },
  ];
  const policy = {
    initialTier: 1,
    warmupMs: 1200,
    sampleMs: 1000,
    slowFps: 24,
    smoothFps: 50,
    downgradeMs: 3000,
    lastResortMs: 6000,
    recoverMs: 12000,
    cooldownMs: 4000,
  };

  function create() {
    let index = policy.initialTier;
    let previous = null;
    let elapsed = 0;
    let frames = 0;
    let slowMs = 0;
    let smoothMs = 0;
    let readyAt = 0;
    let fps = null;

    function reset(now) {
      previous = null;
      elapsed = frames = 0;
      slowMs = smoothMs = 0;
      readyAt = Math.max(readyAt, now + policy.warmupMs);
    }

    // Intentional timer-paced idle frames are not rendering-performance samples.
    function pause() {
      previous = null;
      elapsed = frames = 0;
    }

    function frame(now) {
      if (now < readyAt) {
        previous = null;
        return null;
      }
      if (previous === null) {
        previous = now;
        return null;
      }
      const interval = now - previous;
      previous = now;
      if (interval <= 0) return null;
      elapsed += interval;
      frames++;
      if (elapsed < policy.sampleMs) return null;
      fps = frames * 1000 / elapsed;
      // A single stalled frame contributes one bad window, not an entire streak.
      slowMs = fps < policy.slowFps ? slowMs + policy.sampleMs : 0;
      smoothMs = fps >= policy.smoothFps ? smoothMs + policy.sampleMs : 0;
      elapsed = frames = 0;
      const downgradeMs = index === tiers.length - 2 ? policy.lastResortMs : policy.downgradeMs;
      let next = index;
      if (slowMs >= downgradeMs) next = Math.min(tiers.length - 1, index + 1);
      else if (smoothMs >= policy.recoverMs) next = Math.max(0, index - 1);
      if (next === index) return null;
      index = next;
      reset(now);
      readyAt = now + policy.cooldownMs;
      return tiers[index];
    }

    return {
      get current() { return tiers[index]; },
      get fps() { return fps; },
      frame,
      reset,
      pause,
    };
  }

  window.HeroFieldQuality = { tiers, policy, create };
})();
