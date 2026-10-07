(() => {
  'use strict';

  const tiers = [
    { name: 'full', maxDpr: 2, maxPixels: 16000000, maxNodes: 1200, density: 1, maxEdges: 2000, backgroundFps: 30, farResolution: .5, midResolution: .75, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(14px) saturate(1.2)', traversalOnly: false },
    { name: 'high', maxDpr: 1.75, maxPixels: 12000000, maxNodes: 1000, density: 1, maxEdges: 1500, backgroundFps: 30, farResolution: .5, midResolution: .75, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(12px) saturate(1.2)', traversalOnly: false },
    { name: 'balanced', maxDpr: 1.75, maxPixels: 12000000, maxNodes: 500, density: .5, maxEdges: 750, backgroundFps: 30, farResolution: .5, midResolution: .75, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(12px) saturate(1.2)', traversalOnly: false },
    { name: 'low', maxDpr: 1, maxPixels: 4000000, maxNodes: 250, density: .25, maxEdges: 375, backgroundFps: 15, farResolution: .35, midResolution: .5, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: false },
    { name: 'traversal', maxDpr: 1, maxPixels: 4000000, maxNodes: 250, density: .25, maxEdges: 375, backgroundFps: 0, farResolution: .35, midResolution: .5, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: true },
  ];
  const limits = { generatedNodes: 1200, generatedEdges: 2000, canvasDimension: 8192 };
  const policy = {
    initialTier: 1,
    warmupMs: 1200,
    sampleMs: 3000,
    slowFps: 24,
    smoothFps: 45,
    downgradeMs: 6000,
    lastResortMs: 12000,
    recoverMs: 30000,
    cooldownMs: 15000,
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
    let paintFps = null;
    let paints = 0;
    let work = 0;
    let observedPaints = false;
    let target = null;

    function clearWindow() {
      previous = null;
      elapsed = frames = paints = work = 0;
    }

    function reset(now) {
      clearWindow();
      observedPaints = false;
      slowMs = smoothMs = 0;
      readyAt = Math.max(readyAt, now + policy.warmupMs);
    }

    // Intentional timer-paced idle frames are not rendering-performance samples.
    function pause() {
      previous = null;
    }

    function change(next, now) {
      index = next;
      reset(now);
      readyAt = now + policy.cooldownMs;
      return tiers[index];
    }
    function recover(now) {
      if (index > 0 && now >= readyAt && smoothMs >= policy.recoverMs) return change(index - 1, now);
      return null;
    }
    function paint(duration) {
      if (previous === null) return;
      observedPaints = true;
      paints++;
      work += duration;
    }
    function frame(now, targetFps = 30, paced = false, allowRecovery = true) {
      const nextTarget = `${targetFps}:${paced}`;
      if (target !== nextTarget) {
        target = nextTarget;
        clearWindow();
      }
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
      paintFps = paints * 1000 / elapsed;
      const meanWork = paints ? work / paints : 0;
      const hasPaints = observedPaints;
      const slow = fps < (paced ? targetFps * .8 : policy.slowFps) ||
        (hasPaints && (paintFps < targetFps * .8 || meanWork > 1000 / targetFps * .8));
      const smooth = fps >= (paced ? targetFps * .9 : policy.smoothFps) &&
        (!hasPaints || (paintFps >= targetFps * .9 && meanWork <= 1000 / 30 * .5));
      // A single stalled frame contributes one bad window, not an entire streak.
      slowMs = slow ? slowMs + policy.sampleMs : 0;
      smoothMs = smooth ? smoothMs + policy.sampleMs : 0;
      elapsed = frames = paints = work = 0;
      const downgradeMs = index === tiers.length - 2 ? policy.lastResortMs : policy.downgradeMs;
      if (slowMs >= downgradeMs && index < tiers.length - 1) return change(index + 1, now);
      return allowRecovery ? recover(now) : null;
    }

    return {
      get current() { return tiers[index]; },
      get fps() { return fps; },
      get paintFps() { return paintFps; },
      frame,
      paint,
      recover,
      reset,
      pause,
    };
  }

  window.HeroFieldQuality = { tiers, limits, policy, create };
})();
