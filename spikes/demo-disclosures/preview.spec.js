'use strict';

const { test, expect } = require('playwright/test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createPreviewServer } = require('./server');

let server;
let origin;
const errors = new WeakMap();
const source = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const variants = ['collapsed', 'first', 'previews'];
const ids = ['work-diversity', 'work-agentic', 'work-quantization', 'work-simd', 'work-hnsw'];

test.beforeAll(async () => {
  server = createPreviewServer();
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

async function ready(page) {
  await expect(page.locator('#preview-error')).toBeHidden();
  await expect(page.locator('#comparison')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#preview-error')).toBeHidden();
}
async function open(page, params = '') {
  await page.goto(`${origin}/spikes/demo-disclosures/?${params}`);
  await ready(page);
}
const frame = (page, variant) => page.frameLocator(`[data-variant="${variant}"] iframe`);
const range = (scope, selector, value) => scope.locator(selector).evaluate((input, next) => {
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

test('all three alternatives preserve every contribution and shorten the work section', async ({ page }) => {
  await open(page, 'compare=true&width=1440');
  const expectedCopy = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('#work .chapter-copy')].map(copy =>
      [...copy.children].map(child => child.textContent.trim()));
  }, source);
  for (const variant of variants) {
    const view = frame(page, variant);
    await expect(view.locator('.demo-disclosure')).toHaveCount(5);
    await expect(view.locator('.demo-disclosure[open]')).toHaveCount(variant === 'first' ? 1 : 0);
    await expect(view.locator('.demo-miniature')).toHaveCount(variant === 'previews' ? 5 : 0);
    const actualCopy = await view.locator('#work .chapter-copy').evaluateAll(copies =>
      copies.map(copy => [...copy.querySelectorAll('.chapter-copy-intro > *, .chapter-copy-support > *')].map(child => child.textContent.trim())));
    expect(actualCopy).toEqual(expectedCopy);
    for (const id of ids) {
      await expect(view.locator(`#${id} .chapter-points`)).toBeVisible();
      await expect(view.locator(`#${id} .chapter-lede`)).toBeVisible();
      const title = await view.locator(`#${id} .demo-summary-title`).textContent();
      if (variant === 'first' && id === 'work-diversity') {
        await expect(view.locator(`#${id} figure`)).toBeVisible();
        await expect(view.locator(`#${id} figure`)).toHaveAccessibleName(title);
      } else {
        await expect(view.locator(`#${id} figure`)).toBeHidden();
      }
    }
    const metrics = page.locator(`[data-variant="${variant}"] .panel-heading p`);
    await expect(metrics).toContainText('shorter than original');
    const percent = Number((await metrics.textContent()).match(/(\d+)%/)[1]);
    expect(percent).toBeGreaterThanOrEqual(15);
  }
});

test('keyboard disclosures and real interactions work in all five demos', async ({ page }) => {
  await open(page, 'variant=previews');
  const view = frame(page, 'previews');
  for (const [index, id] of ids.entries()) {
    const summary = view.locator(`#${id}-demo > summary`);
    await summary.focus();
    await summary.press(index % 2 ? 'Space' : 'Enter');
    await expect(view.locator(`#${id}-demo`)).toHaveAttribute('open', '');
    await expect(view.locator(`#${id} .demo-miniature`)).toBeHidden();
    await expect(view.locator(`#${id} figure`)).toBeVisible();
    if (id === 'work-diversity') {
      await range(view, '#dv-diversity', 1);
      await expect(view.locator('[data-dv-value]')).toHaveText('100%');
      await expect(view.locator('[data-dv-results] > li')).toHaveCount(6);
    } else if (id === 'work-agentic') {
      await view.locator('[data-request="preferences"]').click();
      await expect(view.locator('[data-request="preferences"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(view.locator('[data-ag-boost]')).not.toHaveText('');
    } else if (id === 'work-quantization') {
      await range(view, '#quantization-input', -0.5);
      await expect(view.locator('#quantization-input-value')).toHaveText('-0.500');
    } else if (id === 'work-simd') {
      await view.locator('[data-si-sample="opposite"]').click();
      await expect(view.locator('[data-si-vector-total]')).toHaveText('-1.00000');
    } else {
      await range(view, '#hn-ef', 24);
      await expect(view.locator('[data-hn-recall]')).toHaveText('3 of 3');
    }
    await view.locator(`#${id} .demo-close`).click();
    await expect(view.locator(`#${id}-demo`)).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();
    await expect(view.locator(`#${id} figure`)).toBeHidden();
  }
  await view.locator('#work-diversity-demo > summary').click();
  await expect(view.locator('#dv-diversity')).toHaveValue('1');
});

test('mobile dark layouts fit and keep experience and role links reachable', async ({ page }) => {
  await open(page, 'compare=true&width=390&theme=dark');
  for (const variant of variants) {
    const view = frame(page, variant);
    await expect(view.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await view.locator('html').evaluate(root => root.scrollWidth <= root.clientWidth)).toBe(true);
    for (const id of ids) {
      const details = view.locator(`#${id}-demo`);
      if (!(await details.evaluate(node => node.open))) await details.locator(':scope > summary').click();
      expect(await view.locator('html').evaluate(root => root.scrollWidth <= root.clientWidth)).toBe(true);
      await expect(view.locator(`#${id} figure`)).toBeVisible();
      await details.locator(':scope > summary').click();
    }
    await view.locator('#work-diversity .chapter-context a').click();
    await expect(view.locator('#profile-work-entry-1')).toHaveAttribute('open', '');
    await view.locator('#profile-work-entry-1 a[href="#work-diversity"]').click();
    await expect(view.locator('#work-diversity-demo')).toHaveAttribute('open', '');
    await expect(view.locator('#work-diversity')).toBeFocused();
  }
  await page.locator('#section').selectOption('profile-experience');
  for (const variant of variants) {
    const view = frame(page, variant);
    const position = await view.locator('#profile-experience').evaluate(node => node.getBoundingClientRect().top);
    expect(position).toBeGreaterThanOrEqual(0);
    expect(position).toBeLessThan(240);
  }
});

test('live playback stops while a disclosure is closed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page, 'variant=collapsed');
  const view = frame(page, 'collapsed');
  for (const [id, prefix, state] of [
    ['work-simd', 'si', '[data-si-scalar-ops]'],
    ['work-agentic', 'ag', '[data-ag-ops]'],
    ['work-hnsw', 'hn', '[data-hn-status]'],
  ]) {
    const summary = view.locator(`#${id}-demo > summary`);
    const pause = view.locator(`[data-${prefix}-pause]`);
    await summary.click();
    await view.locator(`[data-${prefix}-replay]`).click();
    await summary.click();
    await expect(view.locator(`#${id} figure`)).toBeHidden();
    await page.waitForTimeout(100);
    const before = await view.locator(state).innerHTML();
    await page.waitForTimeout(800);
    expect(await view.locator(state).innerHTML()).toBe(before);
    await summary.click();
    await expect(pause).toHaveAccessibleName('Pause animation');
    await view.locator(`[data-${prefix}-replay]`).click();
    await expect.poll(() => view.locator(state).innerHTML()).not.toBe(before);
    await pause.click();
    await summary.click();
    await summary.click();
    await expect(pause).toHaveAccessibleName('Resume animation');
    await summary.click();
  }

  for (const [id, selector] of [['work-diversity', '#dv-diversity'], ['work-quantization', '#quantization-input']]) {
    await view.locator(`#${id}-demo > summary`).click();
    await view.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await view.locator(`#${id}-demo > summary`).click();
    // The native toggle event is queued, rather than dispatched inside the click.
    await page.waitForTimeout(100);
    const value = await view.locator(selector).inputValue();
    await page.waitForTimeout(500);
    await expect(view.locator(selector)).toHaveValue(value);
  }
});

test('variant switching, reset and direct demo hashes are isolated from the homepage', async ({ page, request }) => {
  await open(page);
  for (const variant of variants) {
    await page.locator(`[name="variant"][value="${variant}"]`).check();
    await ready(page);
    await expect(page.locator('iframe')).toHaveCount(1);
    const view = frame(page, variant);
    await expect(view.locator('.demo-disclosure[open]')).toHaveCount(variant === 'first' ? 1 : 0);
    await view.locator('html').evaluate(() => { location.hash = '#hn-ef'; });
    await expect(view.locator('#work-hnsw-demo')).toHaveAttribute('open', '');
    await expect(view.locator('#hn-ef')).toBeInViewport();
  }
  await page.locator('#reset').click();
  await ready(page);
  await expect(frame(page, 'previews').locator('.demo-disclosure[open]')).toHaveCount(0);
  const original = await request.get(`${origin}/index.html`);
  expect(await original.text()).toBe(source);
  expect((await request.get(`${origin}/.git/config`)).status()).toBe(403);
});

test('a missing preview asset reports an explicit error', async ({ page }) => {
  await page.route('**/spikes/demo-disclosures/layout.css', route => route.fulfill({ status: 404, body: 'Missing' }));
  await page.goto(`${origin}/spikes/demo-disclosures/`);
  await expect(page.locator('#preview-error')).toContainText('Could not load the spike layout styles');
});
