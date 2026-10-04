'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });

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
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(origin);
  await page.evaluate(() => {
    window.quantizationSamples = [];
    const slider = document.getElementById('quantization-input');
    const markers = [...document.querySelectorAll('[data-quantization-marker]')];
    const results = [...document.querySelectorAll('[data-quantization-result]')];
    new MutationObserver(() => {
      window.quantizationSamples.push({
        value: slider.valueAsNumber,
        positions: markers.map(marker => parseFloat(marker.style.getPropertyValue('--position'))),
        results: results.map(result => result.textContent),
      });
    }).observe(document.querySelector('.quantization-chart'), {
      subtree: true, attributes: true, attributeFilter: ['style'],
    });
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function showChart(page) {
  await page.locator('.quantization-chart').evaluate(chart => {
    chart.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`quantization sweeps only on first view at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.runFor(650);
    await expect(page.locator('#quantization-input')).toHaveValue('0.37');
    expect(await page.evaluate(() => window.quantizationSamples)).toEqual([]);
    await showChart(page);
    await page.clock.runFor(1300);
    expect(Number(await page.locator('#quantization-input').inputValue())).toBeLessThan(0);
    await page.clock.runFor(1900);
    await expect(page.locator('#quantization-input')).toHaveValue('0.37');
    const samples = await page.evaluate(() => window.quantizationSamples);
    expect(Math.min(...samples.map(sample => sample.value))).toBeLessThan(-0.64);
    expect(samples.some(sample => sample.results[2] === '-1')).toBe(true);
    expect(samples.at(-1).results[2]).toBe('+1');
    samples.forEach(sample => {
      const code = Math.round((sample.value + 1) * 127.5) - 128;
      expect(sample.positions[0]).toBeCloseTo((1 - Math.fround(sample.value)) * 50, 5);
      expect(sample.positions[1]).toBe((7 - Math.floor((code + 128) / 32) + 0.5) * 12.5);
      expect(sample.positions[2]).toBe(sample.value >= 0 ? 0 : 100);
      expect(Number(sample.results[0])).toBeCloseTo(Math.fround(sample.value), 8);
      expect(Number(sample.results[1])).toBeCloseTo((code + 128) / 127.5 - 1, 5);
    });
    await expect(page.locator('#quantization-announcement')).toBeEmpty();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.clock.runFor(100);
    await expect.poll(() => page.locator('.quantization-chart').evaluate(chart => chart.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    await showChart(page);
    await page.clock.runFor(3200);
    expect(await page.evaluate(() => window.quantizationSamples.length)).toBe(samples.length);
  });
}

test('quantization does not overwrite a value set before first view', async ({ page }) => {
  await page.locator('#quantization-input').evaluate(slider => {
    slider.value = '-0.2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await showChart(page);
  await page.clock.runFor(3200);
  await expect(page.locator('#quantization-input')).toHaveValue('-0.2');
  await expect(page.locator('#quantization-input-value')).toHaveText('-0.200');
});

test('quantization yields to keyboard interaction and keeps both controls usable', async ({ page }) => {
  await showChart(page);
  await page.clock.runFor(1300);
  expect(Number(await page.locator('#quantization-input').inputValue())).toBeLessThan(0);
  const slider = page.locator('#quantization-input');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('-1');
  await page.clock.runFor(3200);
  await expect(slider).toHaveValue('-1');
  await expect(page.locator('#quantization-announcement')).toContainText('binary sign: -1');
  await slider.click({ position: { x: 30, y: 22 } });
  const value = await slider.inputValue();
  await expect(page.locator('#quantization-input-value')).toHaveText(Number(value).toFixed(3));
  await page.locator('#qm-count').evaluate(count => {
    count.value = '6';
    count.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-qm-dim="768"]').click();
  await expect(page.locator('[data-qm-size="4"]')).toHaveText('3.07 GB');
  await expect(page.locator('[data-qm-size="1"]')).toHaveText('768 MB');
  await expect(page.locator('[data-qm-size="0.125"]')).toHaveText('96.0 MB');
});

test('quantization yields to pointer interaction during autoplay', async ({ page }) => {
  await showChart(page);
  await page.clock.runFor(1300);
  const slider = page.locator('#quantization-input');
  expect(Number(await slider.inputValue())).toBeLessThan(0);
  await slider.click({ position: { x: 30, y: 22 } });
  const value = await slider.inputValue();
  await page.clock.runFor(3200);
  await expect(slider).toHaveValue(value);
  await expect(page.locator('#quantization-input-value')).toHaveText(Number(value).toFixed(3));
});

test('quantization skips autoplay with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await showChart(page);
  await page.clock.runFor(3200);
  await expect(page.locator('#quantization-input')).toHaveValue('0.37');
  await expect(page.locator('[data-quantization-result="float"]')).toHaveText('+0.370000005');
  await expect(page.locator('[data-quantization-result="int"]')).toHaveText('+0.37255');
  await expect(page.locator('[data-quantization-result="binary"]')).toHaveText('+1');
});

test('quantization stops if reduced motion is enabled during autoplay', async ({ page }) => {
  await showChart(page);
  await page.clock.runFor(1300);
  expect(Number(await page.locator('#quantization-input').inputValue())).toBeLessThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const value = await page.locator('#quantization-input').inputValue();
  await page.clock.runFor(3200);
  await expect(page.locator('#quantization-input')).toHaveValue(value);
});
