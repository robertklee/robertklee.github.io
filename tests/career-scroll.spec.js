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
  await page.goto(origin);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

function curveLine(page) {
  return page.locator('.cm-curve-desktop .cm-curve-line:visible, .cm-curve-mobile .cm-curve-line:visible');
}

async function showCurve(page) {
  await page.locator('.cm-curve').evaluate(curve => {
    curve.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

async function expectComplete(page) {
  await expect.poll(() => curveLine(page).evaluate(line => getComputedStyle(line).clipPath)).toMatch(/^(none|inset\(-8px\) fill-box)$/);
  await expect(page.locator('.cm-step-now .cm-node')).toHaveCSS('transform', 'none');
  await expect(page.locator('.cm-step-now .cm-label')).toHaveCSS('opacity', '1');
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`career draws only when the curve enters view at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const plot = page.locator('.cm-plot');
    await expect(plot).toHaveClass(/is-animated/);
    await expect(plot).not.toHaveClass(/is-drawn/);
    await expect(curveLine(page)).toHaveCSS('clip-path', 'inset(-8px calc(100% + 8px) -8px -8px) fill-box');

    // The heading alone must not consume the curve's animation.
    await page.locator('.career-map').evaluate(card => {
      window.scrollTo({ top: scrollY + card.getBoundingClientRect().top - innerHeight + 100, behavior: 'instant' });
    });
    await expect(page.locator('.career-map')).toHaveClass(/is-revealed/);
    expect(await page.locator('.cm-curve').evaluate(curve => curve.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    await expect(plot).not.toHaveClass(/is-drawn/);
    await expect(curveLine(page)).toHaveCSS('clip-path', 'inset(-8px calc(100% + 8px) -8px -8px) fill-box');

    await showCurve(page);
    await expect(plot).toHaveClass(/is-drawn/);
    const animatedProperties = await plot.evaluate(element => {
      const animations = element.getAnimations({ subtree: true });
      animations.forEach(animation => {
        animation.pause();
        animation.currentTime = 900;
      });
      return animations.map(animation => animation.transitionProperty);
    });
    expect(animatedProperties).toContain('clip-path');
    expect(animatedProperties).toContain('transform');
    await expect(curveLine(page)).toHaveCSS('clip-path', 'inset(-8px 50% -8px -8px) fill-box');
    await expect(page.locator('.cm-step-first .cm-label')).toHaveCSS('opacity', '1');
    await expect(page.locator('.cm-step-now .cm-label')).toHaveCSS('opacity', '0');
    await expect(page.locator('.cm-step-now .cm-node')).toHaveCSS('transform', 'matrix(0, 0, 0, 0, 0, 0)');
    if (viewport.width > 860) {
      await expect(page.locator('.cm-step-garage .cm-label')).toHaveCSS('opacity', '1');
      await expect(page.locator('.cm-step-garage .cm-node')).toHaveCSS('transform', 'none');
    }

    await plot.evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
    await expectComplete(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.locator('.cm-curve').evaluate(curve => curve.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    await showCurve(page);
    await expectComplete(page);
    expect(await plot.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.locator('#theme-toggle').evaluate(button => button.click());
    await page.setViewportSize({ width: viewport.width > 860 ? 390 : 1440, height: 1000 });
    await expectComplete(page);
  });
}

test('career skips animation with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await showCurve(page);
  await expect(page.locator('.cm-plot')).not.toHaveClass(/is-animated/);
  await expectComplete(page);
});

for (const duringAnimation of [false, true]) {
  test(`career finishes when reduced motion is enabled ${duringAnimation ? 'during playback' : 'before first view'}`, async ({ page }) => {
    if (duringAnimation) {
      await showCurve(page);
      await expect(page.locator('.cm-plot')).toHaveClass(/is-drawn/);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.cm-plot')).not.toHaveClass(/is-animated/);
    await expectComplete(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await showCurve(page);
    await expectComplete(page);
  });
}

test('keyboard focus immediately exposes milestones and keeps navigation working', async ({ page }) => {
  const link = page.locator('.cm-step-now > a');
  await link.focus();
  await expect(page.locator('.cm-plot')).not.toHaveClass(/is-animated/);
  await expectComplete(page);
  await expect(page.locator('.career-map')).toHaveCSS('opacity', '1');
  await link.press('Enter');
  await expect(page).toHaveURL(/#profile-work-entry-1$/);
  await expect(page.locator('#profile-work-entry-1')).toHaveAttribute('open', '');
});

test('printing exposes the pending curve', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  await expectComplete(page);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the complete career chart remains visible and usable', async ({ page }) => {
    await showCurve(page);
    await expectComplete(page);
    await page.locator('.cm-step-now > a').click();
    await expect(page).toHaveURL(/#profile-work-entry-1$/);
  });
});
