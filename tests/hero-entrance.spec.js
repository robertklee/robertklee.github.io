'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();

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
    Math.random = () => .35;
    window.heroTimeline = [];
    document.addEventListener('herochat:query', event => {
      window.heroTimeline.push({
        type: 'query', time: performance.now(), topic: event.detail.topic,
        thinking: !document.querySelector('.chat-think').classList.contains('chat-pending'),
      });
    });
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target.matches?.('html.hero-retrieval-payoff') && !window.heroTimeline.some(event => event.type === 'landed')) {
          window.heroTimeline.push({ type: 'landed', time: performance.now() });
        }
        if (record.target.matches?.('.chat-think:not(.chat-pending)') && !window.heroTimeline.some(event => event.type === 'thinking')) {
          window.heroTimeline.push({ type: 'thinking', time: performance.now() });
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

test('the 404 keeps its existing field and does not install homepage coordination', async ({ page }) => {
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
