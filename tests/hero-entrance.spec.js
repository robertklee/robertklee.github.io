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
  await page.locator('#theme-toggle').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.field-entering')).toHaveCount(0);
  expect(await page.evaluate(() => window.heroTimeline.filter(event => event.type === 'entrance').length)).toBe(1);
});

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

test('the profile remains readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.locator('#hero-name')).toHaveText('Robert Lee');
    await expect(page.locator('#profile-about')).toContainText('Senior Software Engineer');
    await expect(page.locator('.hero-noscript')).toBeVisible();
  } finally {
    await context.close();
  }
});
