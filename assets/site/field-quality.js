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
    changeWarmupMs: 250,
    sampleMs: 1000,
    evidenceMaxAgeMs: 30000,
    catastrophicFrameMs: 250,
    catastrophicDrawMs: 100,
    catastrophicFrames: 2,
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

  function create({ trackDrawStats = false } = {}) {
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
    let measurement = null;
    let paints = 0;
    let work = 0;
    let drawDurations = [];
    let observedPaints = false;
    let target = null;
    let drawBudget = 1000 / 30;
    let activeAt = null;
    let lastActiveAt = null;
    let catastrophicFrames = 0;
    let catastrophicDraws = 0;
    let backgroundCost = null;
    let backgroundAt = null;
    let evidence;

    function clearWindow() {
      previous = null;
      elapsed = frames = paints = work = 0;
      drawDurations = [];
      measurement = null;
    }

    function clearEvidence() {
      // Policy evidence spans cadences; debug windows still report one target.
      evidence = {
        elapsed: 0, frames: 0, longFrames: 0, paints: 0, work: 0, budgetWork: 0,
        expectedPaints: 0, slowCallbacks: 0, severeCallbacks: 0, smoothCallbacks: 0,
        backgrounds: 0, backgroundWork: 0, backgroundBudgetWork: 0,
      };
    }

    function reset(now, warmupMs = policy.warmupMs) {
      clearWindow();
      clearEvidence();
      observedPaints = false;
      slowMs = severeMs = smoothMs = 0;
      activeAt = lastActiveAt = backgroundAt = null;
      backgroundCost = null;
      catastrophicFrames = catastrophicDraws = 0;
      readyAt = now + warmupMs;
    }

    // Intentional timer-paced idle frames are not rendering-performance samples.
    function pause() {
      previous = null;
      activeAt = null;
      catastrophicFrames = 0;
    }

    function change(next, now) {
      const downgrade = next > index;
      index = next;
      reset(now, downgrade ? policy.changeWarmupMs : policy.warmupMs);
      recoverAt = now + policy.recoveryHoldMs;
      return tiers[index];
    }
    function recover(now) {
      const backgroundReady = !observedPaints || (backgroundAt !== null &&
        now - backgroundAt <= policy.evidenceMaxAgeMs && backgroundCost <= 1000 / 30 * .5);
      if (index > 0 && backgroundReady && lastActiveAt !== null && now - lastActiveAt <= policy.evidenceMaxAgeMs &&
          now >= Math.max(readyAt, recoverAt) && smoothMs >= policy.recoverMs) return change(index - 1, now);
      return null;
    }
    function paint(duration, background = true) {
      if (activeAt === null) return;
      catastrophicDraws = duration >= Math.max(policy.catastrophicDrawMs, drawBudget * 3) ? catastrophicDraws + 1 : 0;
      if (background) {
        backgroundCost = duration;
        backgroundAt = activeAt;
      }
      if (previous === null) return;
      observedPaints = true;
      paints++;
      work += duration;
      if (trackDrawStats) drawDurations.push(duration);
      evidence.paints++;
      evidence.work += duration;
      evidence.budgetWork += duration / drawBudget;
      if (background) {
        evidence.backgrounds++;
        evidence.backgroundWork += duration;
        evidence.backgroundBudgetWork += duration / (1000 / (tiers[index].backgroundFps || 30));
      }
    }
    function frame(now, targetFps = 30, paced = false, allowRecovery = true) {
      if (lastActiveAt !== null && now - lastActiveAt > policy.evidenceMaxAgeMs) {
        clearWindow();
        clearEvidence();
        observedPaints = false;
        slowMs = severeMs = smoothMs = 0;
        catastrophicFrames = catastrophicDraws = 0;
        backgroundCost = backgroundAt = null;
        activeAt = null;
      }
      const activeInterval = activeAt === null ? 0 : now - activeAt;
      activeAt = lastActiveAt = now;
      const budget = 1000 / targetFps;
      drawBudget = budget;
      catastrophicFrames = activeInterval >= Math.max(policy.catastrophicFrameMs, budget * 3) ? catastrophicFrames + 1 : 0;
      if ((catastrophicFrames >= policy.catastrophicFrames || catastrophicDraws >= policy.catastrophicFrames) &&
          index < tiers.length - 1) {
        return change(index < tiers.length - 2 ? tiers.length - 2 : index + 1, now);
      }
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
      const activeMs = Math.min(interval, policy.sampleMs);
      evidence.elapsed += activeMs;
      evidence.frames++;
      if (interval > budget * 1.5) evidence.longFrames++;
      evidence.expectedPaints += activeMs / budget;
      evidence.slowCallbacks += activeMs * (paced ? targetFps * .9 : policy.slowFps) / 1000;
      evidence.severeCallbacks += activeMs * (paced ? targetFps * .6 : policy.severeFps) / 1000;
      evidence.smoothCallbacks += activeMs * (paced ? targetFps * .9 : policy.smoothFps) / 1000;
      if (elapsed + .5 >= policy.sampleMs) {
        fps = frames * 1000 / elapsed;
        paintFps = paints * 1000 / elapsed;
        if (trackDrawStats) drawDurations.sort((a, b) => a - b);
        measurement = {
          fps, paintFps: observedPaints ? paintFps : null, targetFps,
          meanDrawMs: paints ? work / paints : null,
          p95DrawMs: drawDurations.length ? drawDurations[Math.ceil(drawDurations.length * .95) - 1] : null,
        };
        elapsed = frames = paints = work = 0;
        drawDurations = [];
      }
      if (evidence.elapsed + .5 < policy.sampleMs) return null;
      const hasPaints = observedPaints;
      const longFrameRatio = evidence.longFrames / evidence.frames;
      const meanBudgetWork = evidence.paints ? evidence.budgetWork / evidence.paints : 0;
      const backgroundBudgetWork = evidence.backgrounds ? evidence.backgroundBudgetWork / evidence.backgrounds : 0;
      if (evidence.backgrounds) backgroundCost = evidence.backgroundWork / evidence.backgrounds;
      const severe = evidence.frames < evidence.severeCallbacks ||
        (hasPaints && (evidence.paints < evidence.expectedPaints * .6 || meanBudgetWork > 1 || backgroundBudgetWork > 1));
      const slow = severe || evidence.frames < evidence.slowCallbacks ||
        (evidence.frames >= 10 && longFrameRatio >= policy.longFrameRatio) ||
        (hasPaints && (evidence.paints < evidence.expectedPaints * .9 || meanBudgetWork > .8 || backgroundBudgetWork > .8));
      const smooth = evidence.frames >= evidence.smoothCallbacks &&
        longFrameRatio <= policy.smoothLongFrameRatio &&
        (!hasPaints || (evidence.paints >= evidence.expectedPaints * .9 &&
          evidence.work / Math.max(1, evidence.paints) <= 1000 / 30 * .5 &&
          backgroundAt !== null && now - backgroundAt <= policy.evidenceMaxAgeMs && backgroundCost <= 1000 / 30 * .5));
      // A single stalled frame contributes one bad window, not an entire streak.
      slowMs = slow ? slowMs + policy.sampleMs : 0;
      severeMs = severe ? severeMs + policy.sampleMs : 0;
      smoothMs = smooth ? smoothMs + policy.sampleMs : 0;
      clearEvidence();
      // Skip density-preserving steps when the current renderer cannot keep up.
      if (severeMs >= policy.severeMs && index < tiers.length - 1) {
        return change(index < tiers.length - 2 ? tiers.length - 2 : index + 1, now);
      }
      const downgradeMs = index === tiers.length - 2 ? policy.lastResortMs : policy.downgradeMs;
      if (slowMs >= downgradeMs && index < tiers.length - 1) return change(index + 1, now);
      return allowRecovery ? recover(now) : null;
    }

    clearEvidence();
    return {
      get current() { return tiers[index]; },
      get fps() { return fps; },
      get paintFps() { return paintFps; },
      get measurement() { return measurement; },
      frame,
      paint,
      recover,
      reset,
      pause,
    };
  }

  window.HeroFieldQuality = { tiers, limits, policy, create };
})();
