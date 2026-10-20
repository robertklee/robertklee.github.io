'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();
const source = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test.beforeAll(async () => {
  const output = resolve(__dirname, '../dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(output, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
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
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('homepage defaults to five visual previews without hiding contribution copy', async ({ page }) => {
  await page.goto(origin);
  await expect(page.locator('.demo-disclosure')).toHaveCount(5);
  await expect(page.locator('.demo-disclosure[open]')).toHaveCount(0);
  await expect(page.locator('.demo-miniature')).toHaveCount(5);
  const expected = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('.chapter-copy')].map(copy => [...copy.children].map(child => child.textContent.trim()));
  }, source);
  const actual = await page.locator('.chapter-copy').evaluateAll(copies => copies.map(copy =>
    [...copy.querySelectorAll('.chapter-copy-intro > *, .chapter-copy-support > *')].map(child => child.textContent.trim())));
  expect(actual).toEqual(expected);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const chapter of await page.locator('#work .chapter').all()) {
        await expect(chapter.locator('.chapter-copy')).toBeVisible();
        await expect(chapter.locator('.demo-miniature')).toBeVisible();
        await expect(chapter.locator('figure')).toBeHidden();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('keyboard expansion preserves real controls and restores focus when collapsed', async ({ page }) => {
  await page.goto(origin);
  const summary = page.locator('#work-diversity-demo > summary');
  await summary.focus();
  await summary.press('Enter');
  await expect(page.locator('#work-diversity figure')).toBeVisible();
  await expect(page.locator('#work-diversity .demo-miniature')).toBeHidden();
  await page.locator('#dv-diversity').focus();
  await page.locator('#dv-diversity').press('End');
  await expect(page.locator('[data-dv-value]')).toHaveText('100%');
  await page.locator('#work-diversity .demo-close').click();
  await expect(summary).toBeFocused();
  await expect(page.locator('#work-diversity figure')).toBeHidden();
  await summary.press('Space');
  await expect(page.locator('#dv-diversity')).toHaveValue('1');
  const name = await page.locator('#work-diversity .demo-summary-title').textContent();
  await expect(page.locator('#work-diversity figure')).toHaveAccessibleName(name);
});

test('chapter, nested control, title and history links open before scrolling', async ({ page }) => {
  await page.goto(`${origin}/#work-simd`);
  await expect(page.locator('#work-simd-demo')).toHaveAttribute('open', '');
  await page.locator('#work-simd .chapter-context a').click();
  await expect(page.locator('#profile-work-entry-2')).toHaveAttribute('open', '');
  await page.locator('#work-simd-demo').evaluate(demo => { demo.open = false; });
  await page.goBack();
  await expect(page.locator('#work-simd-demo')).toHaveAttribute('open', '');
  await expect(page.locator('#work-simd-title')).toBeInViewport();
  await page.reload();
  await expect(page.locator('#work-simd-demo')).toHaveAttribute('open', '');
  await expect(page.locator('#work-simd-title')).toBeInViewport();
  await page.evaluate(() => { location.hash = '#hn-ef'; });
  await expect(page.locator('#work-hnsw-demo')).toHaveAttribute('open', '');
  await expect(page.locator('#hn-ef')).toBeInViewport();
  await page.goto(`${origin}/#quantization-title`);
  await expect(page.locator('#work-quantization-demo')).toHaveAttribute('open', '');
  await expect(page.locator('#work-quantization-demo > summary')).toBeInViewport();
});

test('closed previews do not start sweeps and closing cancels a running sweep', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin);
  for (const [id, selector, initial] of [
    ['work-diversity', '#dv-diversity', '0'],
    ['work-quantization', '#quantization-input', '0.37'],
  ]) {
    const summary = page.locator(`#${id}-demo > summary`);
    await summary.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await expect(page.locator(selector)).toHaveValue(initial);
    await summary.click();
    const chart = page.locator(id === 'work-diversity' ? '[data-dv-plot]' : '.quantization-chart');
    await chart.scrollIntoViewIfNeeded();
    await expect(page.locator(selector)).not.toHaveValue(initial);
    await summary.click();
    await page.waitForTimeout(100);
    const stopped = await page.locator(selector).inputValue();
    await page.waitForTimeout(800);
    await expect(page.locator(selector)).toHaveValue(stopped);
  }
});
