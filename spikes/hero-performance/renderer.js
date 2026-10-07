(() => {
  'use strict';

  const variants = {
    baseline: { label: 'Current High quality', description: 'Original High rendering: full decorative density, .5/.75 soft buffers, 12px chat blur, and a 30 FPS active backdrop.', settings: {} },
    soft: { label: 'Softer buffers', description: 'Keep sharp content and full density. Lower only the far/mid buffers to .35/.5 resolution and chat blur to 8px; retain the original depth blur and motion.', settings: { farResolution: .35, midResolution: .5, chatFilter: 'blur(8px) saturate(1.2)' } },
    paced: { label: 'Slower backdrop', description: 'Keep High density, resolution, and blur. Update the backdrop at 15 FPS, with an independent 30 FPS retrieval overlay and coalesced chat-clearance updates.', settings: { backgroundFps: 15 } },
    combined: { label: 'Combined treatment', description: 'Combine softer buffers and 8px chat blur with a 1.5 pixel-ratio cap and a 15 FPS backdrop. Keep full density and 30 FPS retrieval.', settings: { maxDpr: 1.5, farResolution: .35, midResolution: .5, chatFilter: 'blur(8px) saturate(1.2)', backgroundFps: 15 } },
    still: { label: 'Still backdrop', description: 'Last-resort visual reference: retain High density and depth/chat blur, but cache a still backdrop. Retrieval remains animated at 30 FPS; the entrance settles immediately.', settings: { backgroundFps: 0, traversalOnly: true } },
  };

  function replaceOnce(source, anchor, replacement) {
    if (source.split(anchor).length !== 2) throw new Error('Hero spike: renderer anchor changed: ' + anchor.trim().split('\n')[0]);
    return source.replace(anchor, replacement);
  }

  function patch(source) {
    const edits = [
      ['  const layoutSeed = Math.floor(Math.random() * 4294967296);', '  const experiment = window.HeroPerformanceExperiment;\n  const layoutSeed = experiment.seed;'],
      ['  const qualitySettings = window.HeroFieldQuality;', `  const qualitySettings = {
    ...window.HeroFieldQuality,
    tiers: window.HeroFieldQuality.tiers.map(tier => tier.name === 'high' ? experiment.quality : tier),
    create: () => experiment.monitor,
  };`],
      ['if (!colors.point || motionQuery.matches || quality.traversalOnly) {', 'if (!colors.point || motionQuery.matches || experiment.frozen || quality.traversalOnly) {'],
      ['Math.round(start))() * TAU', 'layoutSeed)() * TAU'],
      ['    layoutProtected();', `    root.classList.add('spike-layout');
    try { layoutProtected(); }
    finally { root.classList.remove('spike-layout'); }`],
      ['  function setCamera(t, still) {', '  function setCamera(t, still, elapsed = FRAME_MS) {\n    const rate = quality.backgroundFps < 30 ? 1 - Math.pow(.95, elapsed / FRAME_MS) : .05;'],
      ['cam.px = approach(cam.px, cam.tx, 0.05, 0.0001);', 'cam.px = approach(cam.px, cam.tx, rate, 0.0001);'],
      ['cam.py = approach(cam.py, cam.ty, 0.05, 0.0001);', 'cam.py = approach(cam.py, cam.ty, rate, 0.0001);'],
      ['if (!quality.traversalOnly || still) setCamera(t, still);', 'if (!quality.traversalOnly || still) setCamera(t, still, elapsed || FRAME_MS);'],
      ['  function draw(now) {\n    const still = motionQuery.matches;', `  function draw(now) {
    const started = performance.now();
    const previousBackground = lastBackgroundDraw;
    drawScene(now);
    experiment.record(performance.now() - started, lastBackgroundDraw !== previousBackground);
  }
  function drawScene(now) {
    const still = motionQuery.matches || experiment.frozen;
    if (experiment.copyDirty && (still || !quality.backgroundFps || !lastBackgroundDraw ||
        now - lastBackgroundDraw + .5 >= 1000 / quality.backgroundFps)) {
      experiment.copyDirty = false;
      readProtected();
    }`],
      ['  function tick(now) {\n    frame = 0;\n    if (!visible || document.hidden) return;', '  function tick(now) {\n    frame = 0;\n    if (!visible || document.hidden || experiment.paused) return;'],
      ['    if (!motionQuery.matches) scheduleFrame(now);', '    if (!motionQuery.matches && !experiment.frozen) scheduleFrame(now);'],
      ['    if (!visible || document.hidden) { stop(); return; }\n    if (motionQuery.matches) {', '    if (!visible || document.hidden || experiment.paused) { stop(); return; }\n    if (motionQuery.matches || experiment.frozen) {'],
      [`  window.addEventListener('storage', event => {
    if (event.key === 'reduced-effects' || event.key === null) setReducedEffects(event.newValue === 'true', false);
  });`, ''],
      ['  const copyObserver = new ResizeObserver(() => { readProtected(); kick(); });', `  const copyObserver = new ResizeObserver(() => {
    if (quality.backgroundFps === 15) experiment.copyDirty = true;
    else readProtected();
    kick();
  });`],
      ['  const relayout = () => {\n    clearTimeout(resizeTimer);', `  const relayout = () => {
    const box = backdrop.getBoundingClientRect();
    if (!box.width || !box.height) return;
    if (Math.round(box.width) === width && Math.round(box.height) === height) return;
    clearTimeout(resizeTimer);`],
      ['  kick();\n})();', `  experiment.attach({
    freeze(enabled) {
      experiment.frozen = enabled;
      root.dataset.spikeFrozen = String(enabled);
      stop();
      activate();
    },
    pause(enabled) {
      experiment.paused = enabled;
      stop();
      if (enabled && entranceEffect) entranceEffect.interrupt();
      if (!enabled) activate();
    },
    theme(value) {
      root.dataset.theme = value;
      document.dispatchEvent(new Event('site:themechange'));
    },
    replayRetrieval() {
      if (window.HeroChatLastQuery) onQuery(window.HeroChatLastQuery);
    },
    inspect() {
      return {
        seed: layoutSeed,
        settings: { ...quality },
        dpr,
        frozen: experiment.frozen,
        paused: experiment.paused,
        activity: { frame, wakeTimer, visible, interval: frameInterval(performance.now()) },
        graph: nodes.map(({ x, y, z, r, kind, cluster }) => ({ x, y, z, r, kind, cluster })),
        edges: [...edges],
        decoration: { nodes: [...drawnDecorationNodes], edges: [...drawnDecorationEdges] },
        positions: nodes.map(node => [node.sx, node.sy]),
        sceneTime,
        query: query && {
          mode: query.mode, land: query.land, notified: query.notified,
          results: query.results.map(result => ({ ...result })),
        },
      };
    },
  });
  kick();
})();`],
    ];
    for (const [anchor, replacement] of edits) source = replaceOnce(source, anchor, replacement);
    return source;
  }

  window.HeroPerformanceSpike = { variants, patch };
  const config = window.HeroPerformanceConfig;
  if (!config) return;
  const variant = variants[config.variant];
  if (!variant) throw new Error('Hero spike: unknown treatment: ' + config.variant);
  const high = window.HeroFieldQuality.tiers.find(tier => tier.name === 'high');
  if (!high) throw new Error('Hero spike: High quality is unavailable.');
  const quality = { ...high, ...variant.settings };
  let samples = [];
  let api = null;
  window.HeroPerformanceExperiment = {
    seed: config.seed,
    frozen: config.frozen,
    paused: false,
    copyDirty: false,
    quality,
    monitor: { current: quality, fps: null, paintFps: null, frame() { return null; }, recover() { return null; }, reset() {}, pause() {}, paint() {} },
    record(duration, background) {
      const now = performance.now();
      samples.push({ now, duration, background });
      samples = samples.filter(sample => sample.now > now - 3000);
    },
    metrics() {
      const now = performance.now();
      samples = samples.filter(sample => sample.now > now - 3000);
      const durations = samples.map(sample => sample.duration).sort((a, b) => a - b);
      const pixels = [...document.querySelectorAll('.field-canvas')].reduce((sum, canvas) => sum + canvas.width * canvas.height, 0);
      return {
        draws: samples.length / 3,
        backgrounds: samples.filter(sample => sample.background).length / 3,
        mean: samples.length ? samples.reduce((sum, sample) => sum + sample.duration, 0) / samples.length : 0,
        p95: durations.length ? durations[Math.ceil(durations.length * .95) - 1] : 0,
        pixels,
        canvases: document.querySelectorAll('.field-canvas').length,
      };
    },
    attach(renderer) {
      api = renderer;
      document.querySelector('.hero').dataset.spikeVariant = config.variant;
      window.parent.HeroPerformancePreview.ready(window, config.revision);
    },
    get api() { return api; },
  };
})();
