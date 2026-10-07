'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');
const { runInNewContext, Script } = require('node:vm');

let server;
let origin;
const errors = new WeakMap();

test.beforeAll(async () => {
  const root = resolve(__dirname, '../..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(root + sep)) return response.writeHead(403).end();
    readFile(file, (error, content) => {
      if (error) {
        if (error.code !== 'ENOENT') console.error(error);
        return response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code);
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
  await page.route('**/chat-core.js', async route => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: await response.text() + `
        const createStreamer = HeroChat.createStreamer;
        HeroChat.createStreamer = function (config) {
          const stream = createStreamer(config);
          return (target, text, options) => stream(target, text, Object.assign({}, options, {
            base: 0, jitter: 0, punct: 0, lead: 0, fade: false
          }));
        };`,
    });
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function open(page, params = '') {
  await page.goto(`${origin}/spikes/hero-performance/?${params}`);
  await ready(page);
}
async function ready(page) {
  await expect(page.locator('#retrieval')).toBeEnabled();
  await expect(page.locator('#preview-error')).toBeHidden();
}
const inspect = (page, name) => page.locator(`#${name}-preview`).evaluate(frame => frame.contentWindow.HeroPerformanceExperiment.api.inspect());
const metrics = (page, name) => page.locator(`#${name}-preview`).evaluate(frame => frame.contentWindow.HeroPerformanceExperiment.metrics());

test('source transformation fails explicitly when the real renderer changes', () => {
  const window = {};
  runInNewContext(readFileSync(resolve(__dirname, 'renderer.js'), 'utf8'), { window });
  const source = readFileSync(resolve(__dirname, '../../assets/site/field.js'), 'utf8');
  expect(() => new Script(window.HeroPerformanceSpike.patch(source))).not.toThrow();
  expect(() => window.HeroPerformanceSpike.patch(source.replace('  function draw(now) {', '  function changedDraw(now) {'))).toThrow(/renderer anchor changed/);
});

  test.describe('real renderer', () => {
    test.setTimeout(60000);

    test('all treatments preserve the graph and density, with real resolution/filter changes', async ({ page }) => {
      await open(page, 'freeze=true&view=split&width=844');
      for (const variant of ['soft', 'paced', 'combined', 'still']) {
        await page.locator('#candidate').selectOption(variant);
        await ready(page);
        await expect(page.frameLocator('#candidate-preview').locator('.hero')).toHaveAttribute('data-spike-variant', variant);
        const baseline = await inspect(page, 'baseline');
        const candidate = await inspect(page, 'candidate');
        expect(candidate.graph).toEqual(baseline.graph);
        expect(candidate.edges).toEqual(baseline.edges);
        expect(candidate.decoration).toEqual(baseline.decoration);
        expect(candidate.positions).toEqual(baseline.positions);
        expect(candidate.settings.maxNodes).toBe(1000);
        expect(candidate.settings.density).toBe(1);
        expect(candidate.seed).toBe(baseline.seed);
        await page.evaluate(() => {
          for (const name of ['baseline', 'candidate']) {
            const child = document.getElementById(name + '-preview').contentWindow;
            child.document.dispatchEvent(new child.CustomEvent('herochat:query', {
              detail: { topic: 'performance', docs: ['Scalar quantization', 'Binary quantization'] },
            }));
          }
        });
        const baselineQuery = (await inspect(page, 'baseline')).query;
        const candidateQuery = (await inspect(page, 'candidate')).query;
        expect(candidateQuery.mode).toBe('knn');
        expect(candidateQuery.land).toBe(baselineQuery.land);
        expect(candidateQuery.results).toEqual(baselineQuery.results);
        const canvasCount = ['paced', 'combined', 'still'].includes(variant) ? 4 : 3;
        await expect(page.frameLocator('#candidate-preview').locator('.field-canvas')).toHaveCount(canvasCount);
        await expect(page.frameLocator('#candidate-preview').locator('.field-far')).toHaveCSS('filter', 'blur(1.8px)');
        await expect(page.frameLocator('#candidate-preview').locator('.hero-chat')).toHaveCSS('backdrop-filter', ['soft', 'combined'].includes(variant) ? 'blur(8px) saturate(1.2)' : 'blur(12px) saturate(1.2)');
        if (variant === 'soft') {
          const before = await metrics(page, 'baseline');
          const after = await metrics(page, 'candidate');
          expect(candidate.dpr).toBe(baseline.dpr);
          expect(after.pixels).toBeLessThan(before.pixels * .8);
        }
        if (variant === 'combined') expect(candidate.dpr).toBeLessThanOrEqual(1.5);
      }
      await page.locator('#theme').selectOption('dark');
      for (const name of ['baseline', 'candidate']) {
        await expect(page.frameLocator(`#${name}-preview`).locator('html')).toHaveAttribute('data-theme', 'dark');
      }
      await page.screenshot({ path: test.info().outputPath('frozen-dark-comparison.png'), fullPage: true });
    });

    test('paced backdrop keeps independent retrieval and time-based drift without excessive background updates', async ({ page }) => {
      await open(page, 'candidate=paced&view=candidate&width=844');
      const site = page.frameLocator('#candidate-preview');
      await expect(site.locator('.suggest-chip').first()).toBeVisible({ timeout: 15000 });
      await page.locator('#retrieval').click();
      const start = (await inspect(page, 'candidate')).sceneTime;
      await page.waitForTimeout(3200);
      const stats = await metrics(page, 'candidate');
      expect(stats.draws).toBeGreaterThan(20);
      expect(stats.draws).toBeLessThan(36);
      expect(stats.backgrounds).toBeGreaterThan(8);
      expect(stats.backgrounds).toBeLessThan(19);
      const end = await inspect(page, 'candidate');
      expect(end.sceneTime - start).toBeGreaterThan(2500);
      expect(end.sceneTime - start).toBeLessThan(3700);
      expect(end.settings.backgroundFps).toBe(15);
      expect((await inspect(page, 'baseline')).paused).toBe(true);
      await site.locator('.suggest-chip').first().click();
      await expect(site.locator('.chat-turn .chat-answer')).not.toHaveClass(/chat-pending/, { timeout: 15000 });
      expect((await inspect(page, 'candidate')).query.notified).toBe(true);
    });

    test('freeze stops frames/timers, theme preserves geometry, and A/B stops the inactive renderer', async ({ page }) => {
      await open(page, 'view=split&width=844');
      await page.locator('#freeze').check();
      for (const name of ['baseline', 'candidate']) {
        const snapshot = await inspect(page, name);
        expect(snapshot.frozen).toBe(true);
        expect(snapshot.activity.frame).toBe(0);
        expect(snapshot.activity.wakeTimer).toBe(0);
      }
      const before = await inspect(page, 'candidate');
      await page.locator('#theme').selectOption('dark');
      expect((await inspect(page, 'candidate')).graph).toEqual(before.graph);
      expect((await inspect(page, 'baseline')).positions).toEqual((await inspect(page, 'candidate')).positions);
      await page.locator('#freeze').uncheck();
      await page.locator('input[name="view"][value="baseline"]').check();
      await expect(page.locator('#candidate-panel')).toBeHidden();
      const inactive = await inspect(page, 'candidate');
      expect(inactive.paused).toBe(true);
      expect(inactive.activity.frame).toBe(0);
      expect(inactive.activity.wakeTimer).toBe(0);
      await page.locator('input[name="view"][value="candidate"]').check();
      expect((await inspect(page, 'baseline')).paused).toBe(true);
      expect((await inspect(page, 'candidate')).paused).toBe(false);
    });

    test('phone rendering, bookmarked settings and saved production preferences stay isolated', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('reduced-effects', 'true');
      });
      await open(page, 'candidate=soft&theme=light&width=390&freeze=true&view=split&seed=12345');
      for (const name of ['baseline', 'candidate']) {
        const site = page.frameLocator(`#${name}-preview`);
        await expect(site.locator('body')).toHaveClass(/chat-compact/);
        await expect(site.locator('html')).toHaveAttribute('data-reduced-effects', 'false');
        await expect(site.locator('html')).toHaveAttribute('data-theme', 'light');
        await expect(site.locator('.hero')).toHaveAttribute('data-field-quality', 'high');
        expect((await inspect(page, name)).seed).toBe(12345);
      }
      expect(await page.evaluate(() => ({ theme: localStorage.getItem('theme'), reduced: localStorage.getItem('reduced-effects') }))).toEqual({ theme: 'dark', reduced: 'true' });
      await page.locator('#theme').selectOption('dark');
      await page.reload();
      await ready(page);
      await expect(page.locator('#theme')).toHaveValue('dark');
      await expect(page.locator('#candidate')).toHaveValue('soft');
      await expect(page.locator('#width')).toHaveValue('390');
      expect(await page.evaluate(() => ({ theme: localStorage.getItem('theme'), reduced: localStorage.getItem('reduced-effects') }))).toEqual({ theme: 'dark', reduced: 'true' });
      const firstGraph = (await inspect(page, 'baseline')).graph;
      await page.locator('#seed').fill('54321');
      await page.locator('#seed').dispatchEvent('change');
      await ready(page);
      expect((await inspect(page, 'baseline')).graph).not.toEqual(firstGraph);
      expect((await inspect(page, 'baseline')).graph).toEqual((await inspect(page, 'candidate')).graph);
      await page.screenshot({ path: test.info().outputPath('phone-comparison.png'), fullPage: true });
    });

    test('reduced motion stays static and still-backdrop retrieval releases the real chat hold', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page, 'candidate=still&view=candidate&width=844');
      const site = page.frameLocator('#candidate-preview');
      await expect(site.locator('.suggest-chip').first()).toBeVisible();
      const snapshot = await inspect(page, 'candidate');
      expect(snapshot.activity.frame).toBe(0);
      expect(snapshot.activity.wakeTimer).toBe(0);
      expect(snapshot.query.notified).toBe(true);
      await site.locator('.suggest-chip').first().click();
      await expect(site.locator('.chat-turn .chat-answer')).not.toHaveClass(/chat-pending/);
      expect((await inspect(page, 'candidate')).query.notified).toBe(true);
    });

    test('still backdrop preserves its positions while normal-motion retrieval animates', async ({ page }) => {
      await open(page, 'candidate=still&view=candidate&width=844');
      const site = page.frameLocator('#candidate-preview');
      await expect(site.locator('.suggest-chip').first()).toBeVisible({ timeout: 15000 });
      const before = await inspect(page, 'candidate');
      await page.locator('#retrieval').click();
      await page.waitForTimeout(3600);
      const after = await inspect(page, 'candidate');
      const stats = await metrics(page, 'candidate');
      expect(after.positions).toEqual(before.positions);
      expect(after.sceneTime).toBe(before.sceneTime);
      expect(stats.draws).toBeGreaterThan(20);
      expect(stats.backgrounds).toBeLessThan(3);
      await expect.poll(async () => (await inspect(page, 'candidate')).query.notified).toBe(true);
    });
  });
test('invalid bookmarked options produce a visible error rather than silently defaulting', async ({ page }) => {
  await page.goto(`${origin}/spikes/hero-performance/?candidate=unknown`);
  await expect(page.locator('#preview-error')).toHaveText('Invalid candidate: unknown');
});
