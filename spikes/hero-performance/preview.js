(() => {
  'use strict';

  const spike = window.HeroPerformanceSpike;
  const root = new URL('../../', location.href);
  const comparison = document.getElementById('comparison');
  const error = document.getElementById('preview-error');
  const candidate = document.getElementById('candidate');
  const theme = document.getElementById('theme');
  const width = document.getElementById('width');
  const seed = document.getElementById('seed');
  const freeze = document.getElementById('freeze');
  const frames = ['baseline', 'candidate'].map(name => ({
    name, frame: document.getElementById(name + '-preview'),
    panel: document.getElementById(name + '-panel'),
    metrics: document.getElementById(name + '-metrics'),
    api: null,
  }));
  let revision = 0;
  let sources = null;
  let blobUrls = [];
  let metricsTimer = 0;
  let resizeFrame = 0;

  const view = () => document.querySelector('input[name="view"]:checked').value;
  function showError(cause) {
    console.error('Hero performance preview failed:', cause);
    error.textContent = cause?.message ?? String(cause);
    error.hidden = false;
  }
  function seedValue() {
    const value = Number(seed.value);
    if (!Number.isInteger(value) || value < 1 || value > 4294967295) throw new Error('Layout seed must be an integer from 1 to 4294967295.');
    return value;
  }
  function saveUrl() {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ candidate: candidate.value, theme: theme.value, width: width.value, view: view(), seed: seedValue(), freeze: freeze.checked })) {
      url.searchParams.set(key, String(value));
    }
    history.replaceState(null, '', url);
  }
  function update(action) {
    try {
      saveUrl();
      error.hidden = true;
      action();
    } catch (cause) {
      showError(cause);
    }
  }
  function sizeFrames() {
    const viewportWidth = width.value === 'fit' ? Math.max(320, comparison.clientWidth - 2) : Number(width.value);
    const viewportHeight = viewportWidth <= 760 ? 844 : 960;
    frames.forEach(({ frame, panel }) => {
      if (frame.width !== String(viewportWidth)) frame.width = String(viewportWidth);
      if (frame.height !== String(viewportHeight)) frame.height = String(viewportHeight);
      if (panel.hidden) return;
      const stage = panel.querySelector('.stage');
      const scale = Math.min(1, panel.clientWidth / viewportWidth);
      stage.style.width = viewportWidth * scale + 'px';
      stage.style.height = viewportHeight * scale + 'px';
      frame.style.transform = `scale(${scale})`;
    });
  }
  function syncView() {
    const current = view();
    comparison.dataset.view = current;
    frames.forEach(item => {
      item.panel.hidden = current !== 'split' && current !== item.name;
      item.panel.inert = item.panel.hidden;
      item.api?.pause(item.panel.hidden);
    });
    sizeFrames();
    document.getElementById('view-note').textContent = current === 'split'
      ? 'Both scenes have identical internal dimensions. Desktop scenes may be scaled here; use A/B at native size to judge sharpness. Both renderers are active.'
      : 'Only the selected renderer is active. Switching A/B keeps the layout and chat; use Replay entrance to restart a comparison.';
  }
  function updateMetrics() {
    frames.forEach(item => {
      const experiment = item.frame.contentWindow?.HeroPerformanceExperiment;
      if (!item.api || !experiment) return;
      const stats = experiment.metrics();
      const state = item.panel.hidden ? 'Inactive' : freeze.checked ? 'Frozen' : 'Live';
      item.metrics.textContent = `${state} | ${stats.draws.toFixed(1)} draws/s, ${stats.backgrounds.toFixed(1)} backdrop updates/s | JS draw mean ${stats.mean.toFixed(2)} ms, p95 ${stats.p95.toFixed(2)} ms | ${(stats.pixels / 1e6).toFixed(2)}M buffer pixels, ${stats.canvases} canvases`;
    });
  }
  window.HeroPerformancePreview = {
    fail: showError,
    ready(child, current) {
      if (current !== revision) return;
      const item = frames.find(entry => entry.frame.contentWindow === child);
      if (!item) throw new Error('Hero spike: unrecognized preview frame.');
      item.api = child.HeroPerformanceExperiment.api;
      if (child.HeroPerformanceConfig.theme !== theme.value) item.api.theme(theme.value);
      if (child.HeroPerformanceConfig.frozen !== freeze.checked) item.api.freeze(freeze.checked);
      item.api.pause(item.panel.hidden);
      document.getElementById('retrieval').disabled = frames.some(entry => !entry.api);
      updateMetrics();
    },
  };

  async function render() {
    const current = ++revision;
    error.hidden = true;
    document.getElementById('retrieval').disabled = true;
    try {
      const layoutSeed = seedValue();
      saveUrl();
      if (!sources) {
        sources = Promise.all(['index.html', 'assets/site/field.js', 'index.js'].map(async path => {
          const response = await fetch(new URL(path, root));
          if (!response.ok) throw new Error(path + ' request failed: HTTP ' + response.status);
          return response.text();
        }));
      }
      const [homepage, source, chat] = await sources;
      if (current !== revision) return;
      const patched = spike.patch(source);
      blobUrls.forEach(url => URL.revokeObjectURL(url));
      blobUrls = [];
      const allowedScripts = new Set(['assets/site/entrance.js', 'chat-core.js', 'chat-content.js', 'assets/site/field-quality.js', 'assets/site/field.js']);
      frames.forEach(item => {
        item.api = null;
        item.metrics.textContent = 'Loading renderer...';
        const site = new DOMParser().parseFromString(homepage, 'text/html');
        const base = site.createElement('base');
        base.href = root.href;
        site.head.prepend(base);
        const config = { variant: item.name === 'baseline' ? 'baseline' : candidate.value, seed: layoutSeed, frozen: freeze.checked, theme: theme.value, revision: current };
        const bootstrap = site.querySelector('head > script:not([src])');
        if (!bootstrap) throw new Error('Hero spike: homepage preference bootstrap not found.');
        bootstrap.textContent = `
          window.HeroPerformanceConfig = ${JSON.stringify(config)};
          window.addEventListener('error', event => parent.HeroPerformancePreview.fail(event.error || new Error(event.message)));
          window.addEventListener('unhandledrejection', event => parent.HeroPerformancePreview.fail(event.reason));
          document.documentElement.dataset.theme = HeroPerformanceConfig.theme;
          document.documentElement.dataset.reducedEffects = 'false';
          document.documentElement.dataset.spikeFrozen = String(HeroPerformanceConfig.frozen);
          Math.random = (function () {
            let state = HeroPerformanceConfig.seed;
            return function () {
              state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
              return state / 4294967296;
            };
          })();`;
        site.querySelectorAll('script[src]').forEach(script => {
          if (!allowedScripts.has(script.getAttribute('src'))) script.remove();
        });
        const field = site.querySelector('script[src="assets/site/field.js"]');
        if (!field) throw new Error('Hero spike: homepage renderer not found.');
        const runtime = site.createElement('script');
        runtime.src = new URL('renderer.js', location.href).href;
        runtime.defer = true;
        field.before(runtime);
        const blob = URL.createObjectURL(new Blob([`
          Promise.all([...document.fonts].map(font => font.load())).then(() => {
            ${chat}
            ${patched}
          }).catch(error => parent.HeroPerformancePreview.fail(error));`], { type: 'text/javascript' }));
        blobUrls.push(blob);
        field.src = blob;
        site.querySelectorAll('body > :not(main), main > :not(.hero)').forEach(element => element.remove());
        const style = site.createElement('style');
        style.textContent = `
          .hero-viewport { min-height: 100svh; }
          .scroll-cue { display: none; }
          .spike-layout #app { transform: none !important; }
          html[data-spike-frozen="true"] .hero *,
          html[data-spike-frozen="true"] .hero *::before,
          html[data-spike-frozen="true"] .hero *::after { animation: none !important; transition: none !important; }`;
        site.head.appendChild(style);
        item.frame.srcdoc = '<!doctype html>\n' + site.documentElement.outerHTML;
      });
      document.getElementById('candidate-title').textContent = 'B: ' + spike.variants[candidate.value].label;
      document.getElementById('description').textContent = spike.variants[candidate.value].description;
      syncView();
    } catch (cause) {
      if (current !== revision) return;
      sources = null;
      showError(cause);
    }
  }

  frames.forEach(({ frame }) => {
    frame.addEventListener('load', () => {
      const url = frame.contentDocument?.querySelector('script[src^="blob:"]')?.src;
      if (url) {
        URL.revokeObjectURL(url);
        blobUrls = blobUrls.filter(value => value !== url);
      }
    });
    frame.addEventListener('error', () => showError(new Error('Hero spike: frame failed to load.')));
  });
  candidate.addEventListener('change', render);
  width.addEventListener('change', render);
  seed.addEventListener('change', render);
  theme.addEventListener('change', () => update(() => {
    frames.forEach(item => item.api?.theme(theme.value));
  }));
  freeze.addEventListener('change', () => update(() => {
    frames.forEach(item => item.api?.freeze(freeze.checked));
    updateMetrics();
  }));
  document.querySelectorAll('input[name="view"]').forEach(input => input.addEventListener('change', () => update(syncView)));
  document.getElementById('replay').addEventListener('click', render);
  document.getElementById('retrieval').addEventListener('click', () => frames.forEach(item => item.api?.replayRetrieval()));
  new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      sizeFrames();
    });
  }).observe(comparison);
  document.addEventListener('visibilitychange', () => {
    clearInterval(metricsTimer);
    if (!document.hidden) metricsTimer = setInterval(updateMetrics, 1000);
  });
  window.addEventListener('pagehide', () => {
    clearInterval(metricsTimer);
    cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    blobUrls.forEach(url => URL.revokeObjectURL(url));
  });
  window.addEventListener('pageshow', () => {
    clearInterval(metricsTimer);
    metricsTimer = setInterval(updateMetrics, 1000);
  });
  try {
    const params = new URLSearchParams(location.search);
    for (const [key, input] of Object.entries({ candidate, theme, width })) {
      if (!params.has(key)) continue;
      const value = params.get(key);
      if (![...input.options].some(option => option.value === value)) throw new Error('Invalid ' + key + ': ' + value);
      input.value = value;
    }
    if (params.has('seed')) seed.value = params.get('seed');
    seedValue();
    if (params.has('freeze') && !['true', 'false'].includes(params.get('freeze'))) throw new Error('Invalid freeze preference.');
    freeze.checked = params.get('freeze') === 'true';
    if (params.has('view')) {
      const input = [...document.querySelectorAll('input[name="view"]')].find(element => element.value === params.get('view'));
      if (!input) throw new Error('Invalid view: ' + params.get('view'));
      input.checked = true;
    }
    render();
  } catch (cause) {
    showError(cause);
  }
})();
