(() => {
  'use strict';

  const tiers = [
    { name: 'full', maxDpr: 2, maxPixels: 16000000, maxNodes: 1200, density: 1, maxEdges: 2000, backgroundFps: 30, farResolution: .5, midResolution: .75, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(14px) saturate(1.2)', traversalOnly: false },
    { name: 'high', maxDpr: 1.75, maxPixels: 12000000, maxNodes: 1000, density: 1, maxEdges: 1500, backgroundFps: 30, farResolution: .5, midResolution: .75, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(12px) saturate(1.2)', traversalOnly: false },
    { name: 'balanced', maxDpr: 1.75, maxPixels: 9000000, maxNodes: 1000, density: 1, maxEdges: 1500, backgroundFps: 30, farResolution: .35, midResolution: .5, farBlur: 1.8, midBlur: .9, chatFilter: 'blur(8px) saturate(1.2)', traversalOnly: false },
    { name: 'low', maxDpr: 1, maxPixels: 4000000, maxNodes: 250, density: .25, maxEdges: 375, backgroundFps: 15, farResolution: .35, midResolution: .5, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: false },
    { name: 'traversal', maxDpr: 1, maxPixels: 4000000, maxNodes: 250, density: .25, maxEdges: 375, backgroundFps: 0, farResolution: .35, midResolution: .5, farBlur: 0, midBlur: 0, chatFilter: 'none', traversalOnly: true },
  ];
  const limits = { generatedNodes: 1200, generatedEdges: 2000, canvasDimension: 8192 };
  const policy = {
    initialTier: 1,
    warmupMs: 1200,
    sampleMs: 1000,
    slowFps: 27,
    severeFps: 18,
    smoothFps: 45,
    downgradeMs: 3000,
    severeMs: 2000,
    lastResortMs: 6000,
    recoverMs: 15000,
    recoveryHoldMs: 10000,
    recoveryQuietMs: 1000,
    longFrameRatio: .2,
    smoothLongFrameRatio: .05,
  };

  function create() {
    let index = policy.initialTier;
    let previous = null;
    let elapsed = 0;
    let frames = 0;
    let slowMs = 0;
    let severeMs = 0;
    let smoothMs = 0;
    let readyAt = 0;
    let recoverAt = 0;
    let fps = null;
    let paintFps = null;
    let paints = 0;
    let work = 0;
    let observedPaints = false;
    let longFrames = 0;
    let target = null;

    function clearWindow() {
      previous = null;
      elapsed = frames = paints = work = longFrames = 0;
    }

    function reset(now) {
      clearWindow();
      observedPaints = false;
      slowMs = severeMs = smoothMs = 0;
      readyAt = Math.max(readyAt, now + policy.warmupMs);
    }

    // Intentional timer-paced idle frames are not rendering-performance samples.
    function pause() {
      previous = null;
    }

    function change(next, now) {
      index = next;
      reset(now);
      recoverAt = now + policy.recoveryHoldMs;
      return tiers[index];
    }
    function recover(now) {
      if (index > 0 && now >= Math.max(readyAt, recoverAt) && smoothMs >= policy.recoverMs) return change(index - 1, now);
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
      const budget = 1000 / targetFps;
      if (interval > budget * 1.5) longFrames++;
      if (elapsed + .5 < policy.sampleMs) return null;
      fps = frames * 1000 / elapsed;
      paintFps = paints * 1000 / elapsed;
      const meanWork = paints ? work / paints : 0;
      const hasPaints = observedPaints;
      const longFrameRatio = longFrames / frames;
      const severe = fps < (paced ? targetFps * .6 : policy.severeFps) ||
        (hasPaints && (paintFps < targetFps * .6 || meanWork > budget));
      const slow = severe || fps < (paced ? targetFps * .9 : policy.slowFps) ||
        (frames >= 10 && longFrameRatio >= policy.longFrameRatio) ||
        (hasPaints && (paintFps < targetFps * .9 || meanWork > budget * .8));
      const smooth = fps >= (paced ? targetFps * .9 : policy.smoothFps) &&
        longFrameRatio <= policy.smoothLongFrameRatio &&
        (!hasPaints || (paintFps >= targetFps * .9 && meanWork <= 1000 / 30 * .5));
      // A single stalled frame contributes one bad window, not an entire streak.
      slowMs = slow ? slowMs + policy.sampleMs : 0;
      severeMs = severe ? severeMs + policy.sampleMs : 0;
      smoothMs = smooth ? smoothMs + policy.sampleMs : 0;
      elapsed = frames = paints = work = longFrames = 0;
      // Skip density-preserving steps when the current renderer cannot keep up.
      if (severeMs >= policy.severeMs && index < tiers.length - 1) {
        return change(index < tiers.length - 2 ? tiers.length - 2 : index + 1, now);
      }
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
