'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();

async function accelerateStreams(page) {
  await page.route('**/chat-core.js', async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: await response.text() + `
        (function () {
          var createStreamer = HeroChat.createStreamer;
          HeroChat.createStreamer = function (cfg) {
            var stream = createStreamer(cfg);
            return function (target, text, opts) {
              return stream(target, text, Object.assign({}, opts, {
                base: 0, jitter: 0, punct: 0, lead: 0, fade: false
              }));
            };
          };
        })();
      `,
    });
  });
}

async function expectRetrievalBeforeOutput(page, scope, queryId, minimumHold) {
  await expect(scope.locator('.hero-retrieval-note')).toBeVisible();
  await expect(scope.locator('.chat-think')).toHaveClass(/chat-pending/);
  await expect(scope.locator('.chat-answer')).toHaveClass(/chat-pending/);
  await expect(scope.locator('.chat-think .txt')).toBeEmpty();
  await expect(scope.locator('.chat-answer .txt')).toBeEmpty();
  await expect(scope.locator('.chat-think')).not.toHaveClass(/chat-pending/, { timeout: 10000 });
  const timeline = await page.evaluate(id => window.heroTimeline.filter(event => event.queryId === id), queryId);
  const query = timeline.find(event => event.type === 'query');
  const landed = timeline.find(event => event.type === 'landed');
  expect(query.thinking).toBe(false);
  expect(query.answerPending).toBe(true);
  expect(landed.time - query.time).toBeGreaterThanOrEqual(minimumHold);
  expect(landed.time - query.time).toBeLessThan(minimumHold + 320);
  expect(timeline.find(event => event.type === 'thinking').time).toBeGreaterThanOrEqual(landed.time);
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
}

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
test.setTimeout(45000);

test.beforeAll(async () => {
  const output = resolve(__dirname, '../dist');
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  };
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(output, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(output + sep)) {
      response.writeHead(403).end();
      return;
    }
    readFile(file, (error, content) => {
      if (error) {
        if (error.code !== 'ENOENT') console.error(error);
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code);
        return;
      }
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(content);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  await page.addInitScript(() => {
    const sample = new URL(location.href).searchParams.get('sample');
    Math.random = () => sample === null ? .35 : Number(sample);
    window.heroTimeline = [];
    let queryId = 0;
    let landedQuery = 0;
    let thinkingQuery = 0;
    document.addEventListener('herochat:query', event => {
      queryId++;
      window.heroTimeline.push({
        type: 'query', time: performance.now(), topic: event.detail.topic, queryId,
        thinking: ![...document.querySelectorAll('.chat-think')].at(-1).classList.contains('chat-pending'),
        answerPending: [...document.querySelectorAll('.chat-answer')].at(-1).classList.contains('chat-pending'),
      });
    });
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target.matches?.('html.hero-retrieval-payoff') && landedQuery !== queryId) {
          landedQuery = queryId;
          window.heroTimeline.push({ type: 'landed', time: performance.now(), queryId });
        }
        if (record.target.matches?.('.chat-think:not(.chat-pending)') &&
            record.target === [...document.querySelectorAll('.chat-think')].at(-1) && thinkingQuery !== queryId) {
          thinkingQuery = queryId;
          window.heroTimeline.push({ type: 'thinking', time: performance.now(), queryId });
        }
        if (record.target.matches?.('.hero.field-entering')) {
          window.heroTimeline.push({ type: 'entrance', time: performance.now() });
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function inspectIdleField(page) {
  await page.route('**/index.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const card = document.createElement('div');
      card.className = 'hero-chat';
      card.style.height = '250px';
      card.innerHTML = '<div class="chat-think chat-pending"><div class="txt"></div></div>' +
        '<div class="chat-answer chat-pending"><div class="txt"></div></div>';
      document.getElementById('app').appendChild(card);
    `,
  }));
  await page.route('**/404.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
  const field = readFileSync(resolve(__dirname, '../assets/site/field.js'), 'utf8');
  const hook = '  readColors();\n  layout();';
  expect(field.split(hook)).toHaveLength(2);
  await page.route('**/assets/site/field.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: field.replace(hook, `
      window.heroFieldTest = {
        get colors() { return { ...colors }; },
        get graph() {
          return {
            nodes: nodes.map(({ x, y, z, r, kind, cluster }) => ({ x, y, z, r, kind, cluster })),
            edges: [...edges], decoration: [...backdropEdges]
          };
        },
        get query() { return query; },
        get regions() { return clusterInfo; },
        get motionReduced() { return motionQuery.matches; },
        get visibility() {
          return nodes.map(node => ({
            visibility: node.vis, distance: freeDist(node.sx, node.sy),
            retrievalClearance: clearAt(node.sx, node.sy, .2)
          }));
        },
        get hoverTarget() {
          const node = nodes.find(node => node.cluster >= 0 && !insideAny(node.sx, node.sy) && node.vis > .3);
          const bounds = backdrop.getBoundingClientRect();
          return node && { x: bounds.left + node.sx, y: bounds.top + node.sy, region: CLUSTERS[node.cluster].id };
        },
        draw,
        onQuery
      };
${hook}`),
  }));
  await page.addInitScript(() => {
    window.heroPaint = {};
    const proto = CanvasRenderingContext2D.prototype;
    const paths = new WeakMap();
    for (const method of ['clearRect', 'beginPath', 'arc', 'fill', 'stroke', 'fillText']) {
      const original = proto[method];
      proto[method] = function (...args) {
        if (this.canvas.matches('.field-canvas')) {
          const name = this.canvas.className;
          if (method === 'clearRect') window.heroPaint[name] = { fill: [], stroke: [], text: [] };
          const paint = window.heroPaint[name];
          if (method === 'beginPath') paths.set(this, []);
          if (method === 'arc') paths.get(this).push(args.slice(0, 3));
          if (paint && ['fill', 'stroke'].includes(method) && this.globalCompositeOperation !== 'destination-out') {
            paint[method].push({
              style: this[method + 'Style'], arcs: [...paths.get(this)],
              width: this.lineWidth, dash: this.getLineDash(),
            });
          }
          if (paint && method === 'fillText') paint.text.push({ text: args[0], style: this.fillStyle });
        }
        return original.apply(this, args);
      };
    }
  });
}

function meanAlpha(operations) {
  const alphas = operations.map(({ style }) => {
    const match = style.match(/^rgba\([\d.,\s]+,\s*([\d.]+)\)$/);
    return match ? Number(match[1]) : 1;
  });
  return alphas.reduce((sum, alpha) => sum + alpha, 0) / alphas.length;
}

for (const pathname of ['/', '/404.html']) {
  test(`dark idle contrast preserves graph geometry on ${pathname}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await inspectIdleField(page);
    await page.goto(origin + pathname);
    await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 0);
    const light = await page.evaluate(() => ({
      graph: window.heroFieldTest.graph, paint: window.heroPaint,
    }));
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 1);
    const dark = await page.evaluate(() => ({
      graph: window.heroFieldTest.graph, paint: window.heroPaint,
    }));
    expect(dark.graph).toEqual(light.graph);
    for (const plane of ['field-canvas field-far', 'field-canvas field-mid', 'field-canvas field-near']) {
      expect(dark.paint[plane].fill.length).toBeGreaterThan(0);
      expect(meanAlpha(dark.paint[plane].fill)).toBeLessThan(meanAlpha(light.paint[plane].fill) * .75);
      expect(meanAlpha(dark.paint[plane].stroke)).toBeLessThan(meanAlpha(light.paint[plane].stroke) * .75);
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 0);
    expect(await page.evaluate(() => window.heroFieldTest.graph)).toEqual(light.graph);
  });
}

test('hero colors and idle contrast interpolate without rebuilding on interrupted theme switches', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inspectIdleField(page);
  await page.goto(origin);
  await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
  const graph = await page.evaluate(() => window.heroFieldTest.graph);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForFunction(() => {
    const { darkMix, point } = window.heroFieldTest.colors;
    return darkMix > .1 && darkMix < .85 && point !== '#2e52ce' && point !== '#a6bdff';
  });
  const before = await page.evaluate(() => {
    const colors = window.heroFieldTest.colors;
    document.documentElement.dataset.theme = 'light';
    return colors;
  });
  const after = await page.evaluate(() => window.heroFieldTest.colors);
  expect(Math.abs(after.darkMix - before.darkMix)).toBeLessThan(.15);
  await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 0);
  expect(await page.evaluate(() => window.heroFieldTest.colors.point)).toBe('#2e52ce');
  expect(await page.evaluate(() => window.heroFieldTest.graph)).toEqual(graph);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForFunction(() => window.heroFieldTest.colors.darkMix > .1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => ({
    colors: window.heroFieldTest.colors,
    reducedMotion: window.heroFieldTest.motionReduced,
  })), { timeout: 2000 }).toMatchObject({ colors: { darkMix: 1 }, reducedMotion: true });
  expect(await page.evaluate(() => window.heroFieldTest.colors.point)).toBe('#a6bdff');
});

test('dark hero texture fades independently of the graph and shared art tokens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const pathname of ['/', '/404.html']) {
    await page.goto(origin + pathname);
    const texture = () => page.evaluate(() => {
      const hero = getComputedStyle(document.querySelector('.hero'), '::before');
      const grid = getComputedStyle(document.querySelector('.hero-backdrop'), '::before');
      const root = getComputedStyle(document.documentElement);
      return {
        glow: Number(hero.opacity), grid: Number(grid.opacity),
        glowTransition: hero.transitionDuration, gridTransition: grid.transitionDuration,
        art: root.getPropertyValue('--art-strong').trim(),
        sharedGlow: root.getPropertyValue('--glow-1').trim(),
      };
    });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    expect(await texture()).toMatchObject({ glow: 1, grid: 1, art: '#2e52ce' });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    expect(await texture()).toEqual({
      glow: .45, grid: .15, glowTransition: '0s', gridTransition: '0s',
      art: '#a6bdff', sharedGlow: 'rgba(91, 128, 255, .16)',
    });
    await expect(page.locator('.field-canvas')).toHaveCount(3);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await texture()).toMatchObject({ glowTransition: '0.6s', gridTransition: '0.6s' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`dark copy clearance quiets decoration without dimming retrieval at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await inspectIdleField(page);
    await page.goto(origin);
    await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
    const light = await page.evaluate(() => window.heroFieldTest.visibility);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 1);
    const dark = await page.evaluate(() => window.heroFieldTest.visibility);
    const nearCopy = light.map((node, i) => ({ ...node, i }))
      .filter(node => node.distance > 20 && node.distance < 60 && node.visibility > .05);
    expect(nearCopy.length).toBeGreaterThan(10);
    for (const node of nearCopy) {
      expect(dark[node.i].visibility).toBeLessThan(light[node.i].visibility);
      expect(dark[node.i].retrievalClearance).toBe(light[node.i].retrievalClearance);
    }
    await page.evaluate(() => {
      document.body.classList.add('convo-active');
      window.heroFieldTest.draw(performance.now());
    });
    const conversation = await page.evaluate(() => window.heroFieldTest.visibility);
    const unchangedCopy = nearCopy.filter(({ i }) => conversation[i].distance === dark[i].distance);
    expect(unchangedCopy.length).toBeGreaterThan(0);
    for (const { i } of unchangedCopy) {
      expect(conversation[i].visibility).toBeLessThan(dark[i].visibility);
      expect(conversation[i].retrievalClearance).toBe(dark[i].retrievalClearance);
    }
  });

  test(`dark retrieval emphasizes relevant regions and preserves paths and result markers at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await inspectIdleField(page);
    await page.goto(origin);
    await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
    const search = () => page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('herochat:query', {
        detail: { topic: 'performance', docs: ['Scalar quantization', 'Binary quantization'] },
      }));
    });
    const markers = () => page.evaluate(() => {
      const color = window.heroFieldTest.colors.amber;
      const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)).join(', ');
      return Object.values(window.heroPaint).flatMap(plane => plane.fill)
        .filter(operation => operation.style === color || operation.style.startsWith(`rgba(${rgb},`))
        .map(({ style, arcs }) => ({ alpha: style === color ? 1 : Number(style.slice(style.lastIndexOf(',') + 1, -1)), arcs }));
    });
    const paths = () => page.evaluate(() => Object.values(window.heroPaint).flatMap(plane => plane.stroke)
      .filter(operation => operation.dash.length > 0)
      .map(({ style, width, dash }) => ({
        alpha: Number(style.slice(style.lastIndexOf(',') + 1, -1)), width, dash,
      })));
    await search();
    // Let resize observers refresh copy clearance before comparing themes.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const lightMarkers = await markers();
    const lightPaths = await paths();
    expect(lightMarkers.length).toBe(2);
    expect(lightPaths.length).toBeGreaterThan(0);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 1);
    expect(await markers()).toEqual(lightMarkers);
    expect(await paths()).toEqual(lightPaths);
    const retrieval = await page.evaluate(() => ({
      regions: window.heroFieldTest.regions.map(({ id, attention }) => ({ id, attention })),
      labels: window.heroPaint['field-canvas field-near'].text,
    }));
    expect(retrieval.regions.find(region => region.id === 'performance').attention).toBe(1);
    expect(retrieval.regions.filter(region => region.id !== 'performance').every(region => region.attention === 0)).toBe(true);
    const inactive = retrieval.labels.filter(label =>
      !['PERFORMANCE & COST', 'Scalar quantization', 'Binary quantization'].includes(label.text));
    expect(inactive.length).toBeGreaterThan(0);
    expect(meanAlpha(inactive)).toBeLessThan(.2);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('herochat:query', {
      detail: { topic: 'behind-the-scenes' },
    })));
    const overview = await page.evaluate(() => ({
      regions: window.heroFieldTest.regions.map(({ attention }) => attention),
      labels: window.heroPaint['field-canvas field-near'].text,
    }));
    expect(overview.regions.every(value => value === 0)).toBe(true);
    const restored = overview.labels.filter(label => inactive.some(previous => previous.text === label.text));
    expect(restored.length).toBeGreaterThan(0);
    expect(meanAlpha(restored)).toBeGreaterThan(meanAlpha(inactive) * 2);
  });
}

test('hover restores a dark idle region and expired retrieval restores topic labels', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inspectIdleField(page);
  await page.goto(origin);
  await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForFunction(() => window.heroFieldTest.colors.darkMix === 1);
  const target = await page.evaluate(() => window.heroFieldTest.hoverTarget);
  expect(target).toBeTruthy();
  await page.mouse.move(target.x, target.y);
  expect(await page.evaluate(id => window.heroFieldTest.regions.find(region => region.id === id).attention, target.region)).toBe(1);
  await page.mouse.move(0, 0);
  expect(await page.evaluate(id => window.heroFieldTest.regions.find(region => region.id === id).attention, target.region)).toBe(0);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('herochat:query', {
    detail: { topic: 'performance', docs: ['Scalar quantization', 'Binary quantization'] },
  })));
  const inactive = await page.evaluate(() => window.heroPaint['field-canvas field-near'].text
    .filter(label => !['PERFORMANCE & COST', 'Scalar quantization', 'Binary quantization'].includes(label.text)));
  expect(inactive.length).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const query = window.heroFieldTest.query;
    query.start = performance.now() - query.land - 11000;
    window.heroFieldTest.draw(performance.now());
  });
  await page.waitForFunction(() => window.heroFieldTest.regions.every(region => region.attention < .02));
  const restored = await page.evaluate(names => window.heroPaint['field-canvas field-near'].text
    .filter(label => names.includes(label.text)), inactive.map(label => label.text));
  expect(restored.length).toBeGreaterThan(0);
  expect(meanAlpha(restored)).toBeGreaterThan(meanAlpha(inactive) * 2);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 1920, height: 1080 }]) {
  test(`Airy backdrop caps idle edges and keeps search connected at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const spikeRequests = [];
    page.on('request', request => { if (request.url().includes('/spikes/')) spikeRequests.push(request.url()); });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/index.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.addInitScript(() => {
      window.heroIdleSegments = {};
      const positions = new WeakMap();
      const proto = CanvasRenderingContext2D.prototype;
      const moveTo = proto.moveTo;
      const lineTo = proto.lineTo;
      const clearRect = proto.clearRect;
      proto.moveTo = function (x, y) {
        positions.set(this, [x, y]);
        return moveTo.call(this, x, y);
      };
      proto.clearRect = function (...args) {
        if (this.canvas.matches('.field-far, .field-mid')) window.heroIdleSegments[this.canvas.className] = [];
        return clearRect.apply(this, args);
      };
      proto.lineTo = function (x, y) {
        const from = positions.get(this);
        if (from && this.canvas.matches('.field-far, .field-mid')) {
          window.heroIdleSegments[this.canvas.className].push(Math.hypot(x - from[0], y - from[1]));
        }
        positions.set(this, [x, y]);
        return lineTo.call(this, x, y);
      };
    });
    await page.route('**/assets/site/entrance.js', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: await response.text() + `
          const originalLayout = window.HeroFieldEntrance.layout;
          window.HeroFieldEntrance.layout = function (model) {
            window.heroFieldGraph = {
              nodes: model.nodes.map(({ x, y, z, cluster }) => ({ x, y, z, cluster })),
              edges: [...model.edges]
            };
            return originalLayout.call(this, model);
          };
        `,
      });
    });
    await page.goto(origin);
    await page.waitForFunction(() => window.heroFieldGraph);
    const stats = await page.evaluate(() => {
      const { nodes, edges } = window.heroFieldGraph;
      const neighbours = nodes.map(() => []);
      for (let k = 0; k < edges.length; k += 2) {
        const a = edges[k];
        const b = edges[k + 1];
        neighbours[a].push(b);
        neighbours[b].push(a);
      }
      const visited = new Set([0]);
      for (const i of visited) {
        neighbours[i].forEach(j => visited.add(j));
      }
      return {
        connected: visited.size === nodes.length,
        idleLengths: Object.values(window.heroIdleSegments).flat(),
      };
    });
    expect(stats.connected).toBe(true);
    expect(stats.idleLengths.length).toBeGreaterThan(50);
    expect(Math.max(...stats.idleLengths)).toBeLessThanOrEqual(100);
    await page.route('**/404.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
    await page.goto(`${origin}/404.html`);
    await expect(page.locator('.field-canvas')).toHaveCount(3);
    await page.waitForFunction(() => Object.values(window.heroIdleSegments).flat().length > 50);
    const missingPageLengths = await page.evaluate(() => Object.values(window.heroIdleSegments).flat());
    expect(Math.max(...missingPageLengths)).toBeLessThanOrEqual(100);
    expect(spikeRequests).toEqual([]);
  });
}

test('opening retrieval lands before model output without restarting on theme or resize', async ({ page }) => {
  await page.goto(origin);
  const stats = page.locator('.field-readout-stats');
  await expect(stats).toBeVisible();
  await expect(stats).toHaveText(/^\d+ vectors · 3-layer HNSW · 7 topics$/);
  await expect(page.locator('.hero-retrieval-note')).toHaveText('Retrieving sources...');
  await expect(page.locator('.chat-think')).toHaveClass(/chat-pending/);
  await expect(page.locator('.chat-answer')).toHaveClass(/chat-pending/);
  await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/, { timeout: 10000 });
  const timeline = await page.evaluate(() => window.heroTimeline);
  const query = timeline.find(event => event.type === 'query');
  const landed = timeline.find(event => event.type === 'landed');
  expect(query.thinking).toBe(false);
  expect(landed.time - query.time).toBeGreaterThanOrEqual(3380);
  expect(landed.time - query.time).toBeLessThan(3700);
  expect(timeline.find(event => event.type === 'thinking').time).toBeGreaterThanOrEqual(landed.time);
  expect(timeline.filter(event => event.type === 'query')).toHaveLength(1);
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  await expect(page.locator('.hero-entrance-rim')).toHaveCount(0);
  await expect(stats).toBeVisible();
  await expect(stats).toHaveText(/^\d+ vectors · 3-layer HNSW · 7 topics$/);
  await page.locator('#theme-toggle').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.field-entering')).toHaveCount(0);
  expect(await page.evaluate(() => window.heroTimeline.filter(event => event.type === 'entrance').length)).toBe(1);
});

for (const pathname of ['/', '/404.html']) {
  test(`graph stats persist alongside retrieval status and refresh on resize on ${pathname}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await inspectIdleField(page);
    await page.goto(origin + pathname);
    await page.waitForFunction(() => window.heroFieldTest?.graph.nodes.length > 0);
    const stats = page.locator('.field-readout-stats');
    const status = page.locator('.field-readout-text');
    const nodeCount = await page.evaluate(() => window.heroFieldTest.graph.nodes.length);
    const initialStats = `${nodeCount} vectors · 3-layer HNSW · 7 topics`;
    await expect(stats).toBeVisible();
    await expect(stats).toHaveText(initialStats);
    await expect(status).toBeHidden();
    for (const { query, text } of [
      { query: { topic: 'engine', docs: ['HNSW graph search'] }, text: /HNSW .* k=1/ },
      { query: { topic: 'intro' }, text: /Diverse retrieval/ },
      { query: { topic: 'not-found' }, text: /0 results above threshold/ },
      { query: { topic: 'behind-the-scenes' }, text: 'Illustrative graph · scripted chat' },
    ]) {
      await page.evaluate(detail => window.heroFieldTest.onQuery(detail), query);
      await expect(status).toBeVisible();
      await expect(status).toHaveText(text);
      await expect(stats).toBeVisible();
      await expect(stats).toHaveText(initialStats);
      const bounds = await page.evaluate(() => {
        const stats = document.querySelector('.field-readout-stats').getBoundingClientRect();
        const status = document.querySelector('.field-readout-text').getBoundingClientRect();
        return { statsBottom: stats.bottom, statusTop: status.top };
      });
      expect(bounds.statsBottom).toBeLessThan(bounds.statusTop);
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(count => window.heroFieldTest.graph.nodes.length !== count, nodeCount);
    const resizedCount = await page.evaluate(() => window.heroFieldTest.graph.nodes.length);
    await expect(stats).toHaveText(`${resizedCount} vectors · 3-layer HNSW · 7 topics`);
    await expect(status).toHaveText('Illustrative graph · scripted chat');
    await page.locator('#theme-toggle').click();
    await expect(stats).toBeVisible();
    await expect(stats).toHaveText(`${resizedCount} vectors · 3-layer HNSW · 7 topics`);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`follow-ups and both kinds of model retry wait for graph navigation at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await accelerateStreams(page);
    await page.goto(origin);
    const minimumHold = viewport.width < 960 ? 2780 : 3380;
    const intro = page.locator('.hero-chat');
    await expectRetrievalBeforeOutput(page, intro, 1, minimumHold);
    await expect(page.locator('.suggest-chip').first()).toBeVisible();
    await intro.locator('.retry-btn').click();
    await intro.locator('.retry-item').first().click();
    await expectRetrievalBeforeOutput(page, intro, 2, minimumHold);
    await expect(page.locator('.suggest-chip').first()).toBeVisible();

    await page.locator('.suggest-chip').first().click();
    const firstTurn = page.locator('.chat-turn').first();
    await expectRetrievalBeforeOutput(page, firstTurn, 3, minimumHold);
    await expect(firstTurn.locator('.retry-btn')).toBeVisible();
    await expect(page.locator('.suggest-chip').first()).toBeVisible();
    await firstTurn.locator('.retry-btn').click();
    await firstTurn.locator('.retry-item').first().click();
    await expectRetrievalBeforeOutput(page, firstTurn, 4, minimumHold);
    await expect(page.locator('.suggest-chip').first()).toBeVisible();

    await page.locator('.suggest-chip').first().click();
    const secondTurn = page.locator('.chat-turn').nth(1);
    await expectRetrievalBeforeOutput(page, secondTurn, 5, minimumHold);
    await expect(page.locator('.suggest-chip').first()).toBeVisible();
    expect(await page.evaluate(() => window.heroTimeline.filter(event => event.type === 'query').length)).toBe(5);
    expect(await page.evaluate(() => window.heroTimeline.filter(event => event.type === 'entrance').length)).toBe(1);
  });
}

test('leaving the hero releases a follow-up retrieval hold without a payoff', async ({ page }) => {
  await accelerateStreams(page);
  await page.goto(origin);
  await expect(page.locator('.suggest-chip').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.suggest-chip').first().click();
  const turn = page.locator('.chat-turn');
  await expect(turn.locator('.hero-retrieval-note')).toBeVisible();
  await expect(turn.locator('.chat-think')).toHaveClass(/chat-pending/);
  await page.locator('.site-nav a[href="#work"]').click();
  await expect(turn.locator('.chat-think')).not.toHaveClass(/chat-pending/);
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  expect(await page.evaluate(() => window.heroTimeline.some(event => event.type === 'landed' && event.queryId === 2))).toBe(false);
});

test('the behind-the-scenes overview releases a superseded retry without a retrieval hold', async ({ page }) => {
  await accelerateStreams(page);
  await page.goto(origin);
  await expect(page.locator('.suggest-chip').first()).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { Math.random = () => .05; });
  for (let index = 0; index < 3; index++) {
    await page.locator('.suggest-chip').first().click();
    await expect(page.locator('.suggest-chip').first()).toBeVisible({ timeout: 15000 });
  }
  const discovery = page.getByRole('button', { name: 'How does this page work?', exact: true });
  await expect(discovery).toBeVisible();
  const previousTurn = page.locator('.chat-turn').last();
  await previousTurn.locator('.retry-btn').click();
  await previousTurn.locator('.retry-item').first().click();
  await expect(previousTurn.locator('.hero-retrieval-note')).toBeVisible();
  await discovery.click();
  const overview = page.locator('.chat-turn').last();
  await expect(overview.locator('.chat-think')).not.toHaveClass(/chat-pending/, { timeout: 1500 });
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/hero-retrieving/);
  expect(await page.evaluate(() => window.HeroChatLastQuery.topic)).toBe('behind-the-scenes');
  expect(await page.evaluate(() => window.heroTimeline.some(event => event.type === 'landed' && event.queryId === 5))).toBe(false);
  await expect(overview.locator('.retry-btn')).toBeVisible();
  await overview.locator('.retry-btn').click();
  await overview.locator('.retry-item').first().click();
  await expect(overview.locator('.chat-answer .txt')).not.toBeEmpty();
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/hero-retrieving/);
});

test('all ten opening answers foreground standout work and keep minor features out of initial suggestions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const field = readFileSync(resolve(__dirname, '../assets/site/field.js'), 'utf8');
  const regions = [...field.matchAll(/docs: \[([^\]]+)\]/g)].map(match =>
    [...match[1].matchAll(/'([^']+)'/g)].map(label => label[1]));
  const minorFeatures = /subscore|score threshold|quota/i;
  for (let index = 0; index < 10; index++) {
    await page.goto(`${origin}/?sample=${(index + .5) / 10}`);
    const content = await page.evaluate(() => window.HeroChatContent);
    expect(content.PROMPTS).toHaveLength(10);
    expect(content.VARIANTS).toHaveLength(10);
    const variant = content.VARIANTS[index];
    expect([variant.thought, variant.answer, ...variant.docs].join(' ')).not.toMatch(minorFeatures);
    expect(variant.answer).toContain('Senior Software Engineer on Microsoft Azure AI Search');
    expect(variant.answer).toMatch(/vector-search diversity|agentic/i);
    expect(regions.filter(docs => variant.docs.some(doc => docs.includes(doc))).length).toBeGreaterThanOrEqual(2);
    for (const doc of variant.docs) expect(regions.flat()).toContain(doc);
    await expect(page.locator('.chat-answer .txt')).toContainText(variant.answer);
    expect(await page.evaluate(() => window.HeroChatLastQuery)).toEqual({ topic: 'intro', docs: variant.docs });
    await expect(page.locator('.hero-eyebrow')).toHaveCount(0);
    const chips = page.locator('.suggest-chip');
    await expect(chips).toHaveCount(3);
    await expect(page.locator('.suggest-chip[data-general]')).not.toHaveCount(0);
    const initialPrompts = await chips.allTextContents();
    for (const topic of content.TOPICS.filter(topic => topic.followupOnly)) {
      for (const prompt of topic.prompts) expect(initialPrompts.join(' ')).not.toContain(prompt);
    }
  }
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`technical achievements highlight flagship work on both answer variants at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin);
    const topic = await page.evaluate(() => window.HeroChatContent.TOPICS.find(topic => topic.id === 'technical-achievements'));
    await page.getByRole('button', { name: topic.prompts[0], exact: true }).click();
    const turn = page.locator('.chat-turn');
    const answer = turn.locator('.chat-answer .txt');
    for (let index = 0; index < topic.variants.length; index++) {
      if (index > 0) {
        await turn.locator('.retry-btn').click();
        await turn.locator('.retry-item').first().click();
      }
      await expect(answer).toContainText(topic.variants[index].answer);
      await expect(answer).toContainText('technical lead for a team of five engineers and scientists');
      await expect(answer).toContainText('distributed execution');
      await expect(answer).toContainText('bounded, verifiable operator set');
      await expect(answer).toContainText(/8\u201332\u00d7.*20\u00d7.*depending on the workload/);
      expect([topic.variants[index].thought, topic.variants[index].answer, ...topic.docs].join(' ')).not.toMatch(/subscore|score threshold|quota/i);
      expect(await page.evaluate(() => window.HeroChatLastQuery)).toEqual({ topic: topic.id, docs: topic.docs });
      await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
      await expect(page.locator('html')).not.toHaveClass(/hero-retrieving/);
      await expect(turn.locator('.source-chip')).toHaveText(['1Vector diversity', '2Agentic retrieval', '3Quantization']);
      for (const [id] of topic.sources) await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const recognition = await page.evaluate(() => window.HeroChatContent.TOPICS.find(topic => topic.id === 'recognition'));
    expect(recognition.prompts.join(' ')).toMatch(/awards|recognition/i);
    expect(recognition.prompts.join(' ')).not.toMatch(/achievements/i);
    await expect(turn.locator('.retry-btn')).toBeDisabled();
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`graph search questions, both answers, and citations work at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await accelerateStreams(page);
    await page.route('**/chat-content.js', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: await response.text() + `
          window.HeroChatContent.TOPICS.find(topic => topic.id === 'graph-search').weight = 4;
        `,
      });
    });
    for (const sample of [.35, .75]) {
      await page.goto(`${origin}/?sample=${sample}`);
      const topic = await page.evaluate(() => window.HeroChatContent.TOPICS.find(topic => topic.id === 'graph-search'));
      const firstVariant = Math.floor(sample * topic.variants.length);
      await page.getByRole('button', { name: topic.prompts[firstVariant], exact: true }).click();
      const turn = page.locator('.chat-turn');
      for (const index of [firstVariant, 1 - firstVariant]) {
        if (index !== firstVariant) {
          await turn.locator('.retry-btn').click();
          await turn.locator('.retry-item').first().click();
        }
        const answer = turn.locator('.chat-answer .txt');
        await expect(answer).toContainText(topic.variants[index].answer);
        await expect(answer).toContainText(/graph search/i);
        await expect(answer).toContainText(/candidate pool/i);
        await expect(answer).toContainText(/recall/i);
        await expect(answer).toContainText(/quota enforcement/i);
        await expect(answer).toContainText('SIMD');
        expect(await page.evaluate(() => window.HeroChatLastQuery)).toEqual({ topic: topic.id, docs: topic.docs });
        await expect(turn.locator('.source-chip')).toHaveText(['1HNSW graph search', '2SIMD distance kernels', '3Software Engineer II']);
      }
      await turn.locator('.source-chip[href="#work-hnsw"]').click();
      await expect(page).toHaveURL(/#work-hnsw$/);
      await expect(page.locator('#work-hnsw-title')).toBeInViewport();
    }
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mobile card grows and caps with accessible follow-ups at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(origin);
    await expect(page.locator('.hero-retrieval-note')).toBeVisible();
    const initialHeight = await page.locator('.hero-chat').evaluate(element => element.offsetHeight);
    expect(initialHeight).toBeLessThan(170);
    await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/, { timeout: 10000 });
    const hold = await page.evaluate(() => {
      const query = window.heroTimeline.find(event => event.type === 'query');
      const landed = window.heroTimeline.find(event => event.type === 'landed');
      return landed.time - query.time;
    });
    expect(hold).toBeGreaterThanOrEqual(2780);
    expect(hold).toBeLessThan(3100);
    await expect.poll(() => page.locator('.hero-chat').evaluate(element => element.offsetHeight)).toBeGreaterThan(initialHeight + 30);
    await expect(page.locator('.chat-mobile-followups .suggest-chip').first()).toBeVisible({ timeout: 25000 });
    await page.locator('.chat-think .think-head').first().click();
    const bounds = await page.evaluate(() => ({
      card: document.getElementById('app').getBoundingClientRect().bottom,
      cue: document.querySelector('.scroll-cue').getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(bounds.card).toBeLessThanOrEqual(bounds.cue + 2);
    expect(bounds.overflow).toBe(0);
    await page.locator('.retry-btn').click();
    await expect(page.locator('.retry-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.chat-mobile-followups button.suggest-chip').first().click();
    await expect(page.locator('body')).toHaveClass(/convo-active/);
    await expect(page.locator('.chat-turn')).toHaveCount(1);
    await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
    await expect.poll(() => page.locator('.hero-chat').evaluate(element => element.scrollHeight - element.clientHeight), { timeout: 20000 }).toBeGreaterThan(10);
    const capped = await page.evaluate(() => ({
      card: document.getElementById('app').getBoundingClientRect().bottom,
      cue: document.querySelector('.scroll-cue').getBoundingClientRect().top,
    }));
    expect(capped.card).toBeLessThanOrEqual(capped.cue + 2);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`reduced motion shows the complete answer immediately at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin);
    await expect(page.locator('.chat-answer .txt')).toContainText('Hi');
    await expect(page.locator('.suggest-chip').first()).toBeVisible();
    await expect(page.locator('.hero-retrieval-note, .hero-entrance-rim, .field-entering')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/hero-entrance-armed|hero-entrance-running|hero-retrieving/);
    expect(await page.locator('#app').evaluate(element => getComputedStyle(element).transform)).toBe('none');
  });
}

test('leaving the hero releases the opening hold without a payoff', async ({ page }) => {
  await page.goto(origin);
  await expect(page.locator('.hero-retrieval-note')).toBeVisible();
  await page.locator('.site-nav a[href="#work"]').click();
  await expect(page.locator('html')).not.toHaveClass(/hero-retrieving/);
  await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/);
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  expect(await page.evaluate(() => window.heroTimeline.some(event => event.type === 'landed'))).toBe(false);
  await page.locator('.brand').click();
  await expect(page.locator('.field-entering')).toHaveCount(0);
});

test('a deep link does not leave the offscreen chat waiting for a draw', async ({ page }) => {
  await page.goto(`${origin}/#profile-projects`);
  await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/);
  await expect(page.locator('.hero-retrieval-note, .hero-entrance-rim')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/hero-entrance-armed|hero-retrieving/);
});

test('page visibility loss releases the hold without pretending sources landed', async ({ page }) => {
  await page.goto(origin);
  await expect(page.locator('.hero-retrieval-note')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/);
  await expect(page.locator('.hero-retrieval-note, .hero-entrance-rim')).toHaveCount(0);
  expect(await page.evaluate(() => window.heroTimeline.some(event => event.type === 'landed'))).toBe(false);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.field-entering')).toHaveCount(0);
});

test('unavailable Canvas logs a warning and does not block the chat', async ({ page }) => {
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === '2d' ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto(origin);
  await expect(page.locator('.chat-think')).not.toHaveClass(/chat-pending/);
  expect(warnings).toContain('hero: retrieval visualization unavailable; skipping the animated hold.');
  await expect(page.locator('.hero-retrieval-note')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/hero-entrance-armed|hero-entrance-running/);
});

test('the 404 shares the Airy field without installing homepage coordination', async ({ page }) => {
  await page.goto(`${origin}/404.html`);
  await expect(page.locator('.field-canvas')).toHaveCount(3);
  expect(await page.evaluate(() => typeof window.HeroFieldEntrance)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.HeroChatIntro)).toBe('undefined');
  await expect(page.locator('.field-entering, .hero-retrieval-note')).toHaveCount(0);
});

test.describe('email reveal', () => {
  test.use({ reducedMotion: 'reduce' });
  const address = Buffer.from('aGVsbG9Acm9iZXJ0a2wuY29t', 'base64').toString();

  test('email stays hidden during passive browsing and synthetic clicks', async ({ page }) => {
    await page.goto(origin);
    for (const path of ['/', '/index.js', '/assets/site/site.js']) {
      const response = await page.request.get(origin + path);
      expect(response.ok()).toBe(true);
      expect(await response.text()).not.toContain(address);
    }
    const buttons = page.locator('[data-email-reveal]');
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) {
      await button.hover();
      await button.focus();
      await button.evaluate(element => {
        element.click();
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    expect(await page.content()).not.toContain(address);
    await expect(buttons).toHaveCount(2);
  });

  for (const key of ['Enter', 'Space']) {
    test(`email can be revealed with ${key} without opening an email app`, async ({ page }) => {
      await page.goto(origin);
      const button = page.locator('.cv-contact-links [data-email-reveal]');
      await button.focus();
      await page.keyboard.press(key);
      const link = page.locator('.cv-contact-links').getByRole('link', { name: address, exact: true });
      await expect(link).toHaveAttribute('href', `mailto:${address}`);
      await expect(link).toBeFocused();
      await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
      await expect(page.locator('#contact [data-email-reveal]')).toHaveCount(1);
      await expect(page).toHaveURL(origin + '/');
    });
  }

  test('email reveals when the decorative child of an About button is clicked', async ({ page }) => {
    await page.goto(origin);
    await page.locator('.cv-contact-links [data-email-reveal] span').click();
    const link = page.locator('.cv-contact-links').getByRole('link', { name: address, exact: true });
    await expect(link).toHaveAttribute('href', `mailto:${address}`);
    await expect(link).toBeFocused();
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`email contact button reveals a copyable link at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(origin);
      await page.locator('#contact [data-email-reveal]').click();
      const link = page.locator('#contact').getByRole('link', { name: address, exact: true });
      await expect(link).toHaveAttribute('href', `mailto:${address}`);
      await expect(link).toHaveClass('button button-solid');
      await expect(link).toBeFocused();
      await expect(page.locator('.cv-contact-links [data-email-reveal]')).toHaveCount(1);
      await expect(page).toHaveURL(origin + '/');
    });

    test(`email in the dynamically created chat stays hidden until clicked at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(origin);
      for (let turn = 1; turn <= 3; turn++) {
        await page.locator('button.suggest-chip').first().click();
        await expect(page.locator('.chat-turn')).toHaveCount(turn);
      }
      const button = page.locator('.chat-cta [data-email-reveal]');
      await expect(button).toBeVisible();
      await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
      expect(await page.content()).not.toContain(address);
      await button.click();
      const link = page.locator('.chat-cta').getByRole('link', { name: address, exact: true });
      await expect(link).toHaveAttribute('href', `mailto:${address}`);
      await expect(link).toHaveClass('chat-cta-link');
      await expect(link).toBeFocused();
      await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
      await expect(page.locator('[data-email-reveal]')).toHaveCount(2);
    });
  }
});

test('the profile remains readable without JavaScript and email stays hidden', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.locator('#hero-name')).toHaveText('Robert Lee');
    await expect(page.locator('#profile-about')).toContainText('Senior Software Engineer');
    await expect(page.locator('.hero-noscript')).toBeVisible();
    await expect(page.locator('#contact noscript p')).toContainText('Email reveal requires JavaScript');
    await expect(page.locator('#contact noscript p')).toBeVisible();
    await expect(page.locator('#contact').getByRole('link', { name: 'LinkedIn' })).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
