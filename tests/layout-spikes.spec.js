'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();
const approaches = ['snapshot', 'career-first', 'integrated', 'integrated-curve'];
const storyIds = ['diversity', 'agentic', 'quantization', 'simd', 'hnsw'];
const canonicalRecords = readFileSync(resolve(__dirname, '../index.html'), 'utf8').match(/<details class="cv-details"/g).length;

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test.beforeAll(async () => {
  const output = resolve(__dirname, '../dist');
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.png': 'image/png', '.jpg': 'image/jpeg',
  };
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
  page.on('response', response => {
    if (response.status() >= 400) errors.get(page).push(`${response.status()} ${response.url()}`);
  });
});

test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('the comparison overview links all four previews and does not alter the homepage', async ({ page }) => {
  await page.goto(`${origin}/spikes/`);
  await expect(page.locator('h1')).toHaveText('Four ways to tell the same career.');
  for (const approach of approaches) {
    await expect(page.locator(`.spike-options a[href="/spikes/${approach}.html"]`)).toBeVisible();
  }
  await page.locator('.spike-original-link').click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.locator('#profile-work-title')).toHaveText('Experience, made tangible.');
  await expect(page.locator('.spike-switcher')).toHaveCount(0);
  const source = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  expect(readFileSync(resolve(__dirname, '../dist/index.html'), 'utf8')).toBe(source);
});

for (const approach of approaches) {
  test(`${approach}: distinct reading order, complete CV, and contribution attribution`, async ({ page }) => {
    await page.goto(`${origin}/spikes/${approach}.html`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    const order = await page.locator('main > section').evaluateAll(sections => sections.map(section => section.id));
    expect(order.slice(0, approach === 'snapshot' ? 5 : 4)).toEqual(
      approach === 'snapshot' ? ['top', 'profile-about', 'career-snapshot', 'work', 'profile-work'] :
      approach === 'career-first' ? ['top', 'profile-work', 'work', 'profile-about'] :
      ['top', 'profile-about', 'profile-work', 'profile-projects']
    );
    for (let role = 1; role <= 6; role++) {
      await expect(page.locator(`#profile-work-entry-${role}`)).toHaveCount(1);
    }
    for (const id of storyIds) {
      const chapter = page.locator(`#work-${id}`);
      await expect(chapter).toHaveCount(1);
      await expect(chapter.locator('.spike-chapter-context')).toContainText('Microsoft Azure AI Search');
      await expect(chapter.locator('.spike-chapter-context > a')).toHaveCSS('display', 'flex');
      await expect(chapter.locator('.chapter-lede')).toContainText('My contribution');
      await expect(chapter.locator('.spike-illustration-label')).toHaveText('Interactive concept illustration');
    }
    await expect(page.locator('#work-simd .chapter-lede')).toContainText('independent vector accumulator registers');
    await expect(page.locator('#work-hnsw .chapter-points')).toContainText('test suite');
    await expect(page.locator('#work-hnsw .chapter-points')).toContainText('production incidents');
    await expect(page.locator('#work-hnsw .spike-illustration-scope')).toContainText('not the production reliability work');
    await expect(page.locator('#profile-work-entry-1')).toContainText('production billing model');
    await expect(page.locator('#profile-work-entry-2')).toContainText('facet-aggregation engine');
    expect(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    })).toEqual([]);
    expect(await page.locator('a[href^="#"]').evaluateAll(links =>
      links.filter(link => link.hash && !document.getElementById(decodeURIComponent(link.hash.slice(1)))).map(link => link.hash)
    )).toEqual([]);
    if (approach === 'integrated' || approach === 'integrated-curve') {
      await expect(page.locator('.spike-role-group').nth(0).locator('.chapter')).toHaveCount(2);
      await expect(page.locator('.spike-role-group').nth(1).locator('.chapter')).toHaveCount(3);
      await expect(page.locator('.career-map')).toHaveCount(approach === 'integrated' ? 0 : 1);
    } else {
      await expect(page.locator('.career-map')).toHaveCount(1);
    }
  });

  test(`${approach}: role links, expand-all, demo controls, and comparison switcher work`, async ({ page }) => {
    await page.goto(`${origin}/spikes/${approach}.html`);
    await page.locator('[data-expand-all][aria-controls="profile-work-records"]').click();
    await expect(page.locator('#profile-work-records details.cv-details[open]')).toHaveCount(6);
    await page.locator('[data-expand-all][aria-controls="profile-work-records"]').click();
    await expect(page.locator('#profile-work-records details.cv-details[open]')).toHaveCount(0);

    await page.locator('#work-hnsw .spike-chapter-context a').click();
    await expect(page).toHaveURL(/\/spikes\/[^/]+\.html#profile-work-entry-2$/);
    await expect(page.locator('#profile-work-entry-2')).toHaveAttribute('open', '');

    const theme = await page.locator('html').getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');

    await page.locator('[data-si-lanes="8"]').click();
    await page.locator('[data-si-sample="opposite"]').click();
    await expect(page.locator('[data-si-vector-total]')).toHaveText('-1.00000');
    await expect(page.locator('[data-si-vector-ops]')).toHaveText('2 / 2 vector MAC operations');
    await expect(page.locator('[data-si-reduction]')).toHaveText('Complete: 8 lanes to one sum');
    await page.locator('#hn-ef').evaluate(input => {
      input.value = '24';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('[data-hn-query="left"]').click();
    await expect(page.locator('[data-hn-recall]')).toHaveText('100%');

    await page.locator('[data-scenario="product"]').click();
    await expect(page.locator('[data-scenario="product"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-request="preferences"]').click();
    await expect(page.locator('[data-request="preferences"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-quant-meter]')).toBeVisible();

    await page.locator('.spike-switcher summary').click();
    const next = approaches[(approaches.indexOf(approach) + 1) % approaches.length];
    await page.locator(`.spike-switcher a[href="/spikes/${next}.html"]`).click();
    await expect(page).toHaveURL(`${origin}/spikes/${next}.html`);
  });

  test(`${approach}: normal-motion reveals and autoplay preserve keyboard role navigation`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${origin}/spikes/${approach}.html`);
    const figure = page.locator('#work-simd .chapter-figure');
    await figure.scrollIntoViewIfNeeded();
    await expect(figure).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-si-reduction]')).toHaveText('Complete: 4 lanes to one sum', { timeout: 10000 });
    const link = page.locator('#work-simd .spike-chapter-context a');
    await link.focus();
    await link.press('Enter');
    await expect(page.locator('#profile-work-entry-2')).toHaveAttribute('open', '');
    await expect(page.locator('#profile-work-entry-2')).toBeFocused();
    await expect(page.locator('#profile-work-entry-2').locator('..')).toHaveCSS('opacity', '1');
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    test(`${approach}: layout fits both themes at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${origin}/spikes/${approach}.html`);
      await page.evaluate(() => document.fonts.ready);
      for (const theme of ['light', 'dark']) {
        await page.locator('html').evaluate((root, value) => { root.dataset.theme = value; }, theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        for (const id of storyIds) {
          const context = page.locator(`#work-${id} .spike-chapter-context`);
          await context.scrollIntoViewIfNeeded();
          await expect(context).toBeVisible();
          const bounds = await page.locator(`#work-${id} .chapter-figure`).boundingBox();
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
      if (approach === 'snapshot') {
        const distance = await page.evaluate(() =>
          document.getElementById('career-snapshot').getBoundingClientRect().top -
          document.getElementById('top').getBoundingClientRect().bottom
        );
        expect(distance).toBeLessThan(viewport.width > 640 ? 1000 : 1300);
      }
      await page.locator('.spike-switcher summary').click();
      const bounds = await page.locator('.spike-switcher').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    });
  }
}

test('D is C with the unchanged canonical career curve before the role groups', async ({ page }) => {
  await page.goto(`${origin}/spikes/integrated-curve.html`);
  const canonical = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const expectedCard = await page.evaluate(source =>
    new DOMParser().parseFromString(source, 'text/html').querySelector('.career-map').outerHTML, canonical);
  expect(await page.locator('.career-map').evaluate(card => card.outerHTML)).toBe(expectedCard);
  expect(await page.locator('#profile-work > .career-map').evaluate(card =>
    card.nextElementSibling.id
  )).toBe('profile-work-records');
  const roles = await page.locator('#profile-work-records').innerHTML();
  await page.goto(`${origin}/spikes/integrated.html`);
  expect(await page.locator('#profile-work-records').innerHTML()).toBe(roles);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`D preserves the curve animation and milestone navigation at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${origin}/spikes/integrated-curve.html`);
    const card = page.locator('.career-map');
    const plot = page.locator('.cm-plot');
    await expect(plot).toHaveClass(/is-animated/);
    await expect(plot).not.toHaveClass(/is-drawn/);
    await expect(card).toHaveCSS('opacity', '0');
    await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(plot).toHaveClass(/is-drawn/);
    await expect(page.locator('.cm-curve-line:visible')).toHaveCSS('stroke-dashoffset', '0px');
    const milestone = page.locator('.cm-step-now > a');
    await milestone.focus();
    await milestone.press('Enter');
    await expect(page).toHaveURL(/integrated-curve\.html#profile-work-entry-1$/);
    await expect(page.locator('#profile-work-entry-1')).toHaveAttribute('open', '');
    await expect(page.locator('#profile-work-entry-1')).toBeFocused();
  });
}

test('the overview fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${origin}/spikes/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const approach of approaches) {
    test(`${approach}: static content, details, and preview navigation remain available`, async ({ page }) => {
      await page.goto(`${origin}/spikes/${approach}.html`);
      await expect(page.locator('.chapter')).toHaveCount(5);
      await expect(page.locator('details.cv-details')).toHaveCount(canonicalRecords);
      await expect(page.locator('[data-vector-fallback]').nth(0)).toBeVisible();
      await expect(page.locator('[data-vector-fallback]').nth(1)).toBeVisible();
      await page.locator('#profile-work-entry-2 > summary').click();
      await expect(page.locator('#profile-work-entry-2')).toHaveAttribute('open', '');
      await page.locator('.spike-switcher summary').click();
      await page.locator('.spike-switcher a[href="/spikes/"]').click();
      await expect(page).toHaveURL(`${origin}/spikes/`);
    });
  }
});
