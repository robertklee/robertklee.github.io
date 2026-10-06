'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
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

test('header navigation separates career growth from detailed experience', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const career = navigation.getByRole('link', { name: 'Career growth', exact: true });
  const experience = navigation.getByRole('link', { name: 'Experience', exact: true });
  await expect(career).toHaveAttribute('href', '#profile-work');
  await expect(experience).toHaveAttribute('href', '#profile-experience');

  for (const [link, id] of [[career, 'profile-work'], [experience, 'profile-experience']]) {
    await link.click();
    await expect(page).toHaveURL(`${origin}/#${id}`);
    await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(link).toHaveAttribute('aria-current', 'location');
    expect(await page.locator(`#${id}`).evaluate(section => {
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      return Math.abs(section.getBoundingClientRect().top - offset);
    })).toBeLessThan(2);
  }
});

test('header navigation includes leadership, awards, and education in page order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link')).toHaveText([
    'About', 'Career growth', 'Work examples', 'Experience',
    'Projects', 'Leadership', 'Awards', 'Education',
  ]);
  await expect(page.locator('#profile-leadership .eyebrow')).toHaveText('Community leadership & mentoring');

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, id] of [
      ['Leadership', 'profile-leadership'],
      ['Awards', 'profile-awards'],
      ['Education', 'profile-education'],
    ]) {
      const link = navigation.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', `#${id}`);
      await link.click();
      await expect(page).toHaveURL(`${origin}/#${id}`);
      await expect(page.locator(`#${id}`)).toBeFocused();
      await expect(link).toHaveAttribute('aria-current', 'location');
      expect(await page.locator(`#${id}`).evaluate(section => {
        const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
        return Math.abs(section.getBoundingClientRect().top - offset);
      })).toBeLessThan(2);
    }
  }
});

test('header links fit desktop and scroll independently on narrower screens', async ({ page }) => {
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 320, 390, 768, 860, 1024, 1280, 1281, 1366, 1920, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.locator('.site-header').evaluate(header => {
      const root = document.documentElement;
      return Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) - header.getBoundingClientRect().height);
    })).toBeLessThan(1);
    const layout = await page.locator('.site-header').evaluate(header => {
      const brand = header.querySelector('.brand').getBoundingClientRect();
      const navigation = header.querySelector('.site-nav');
      const nav = navigation.getBoundingClientRect();
      const actions = header.querySelector('.header-actions').getBoundingClientRect();
      return {
        height: header.getBoundingClientRect().height,
        pageWidth: document.documentElement.scrollWidth,
        separated: brand.right <= actions.left,
        navBelow: nav.top >= Math.max(brand.bottom, actions.bottom),
        desktopFit: nav.left >= brand.right && nav.right <= actions.left && navigation.scrollWidth <= navigation.clientWidth,
        overflow: getComputedStyle(navigation).overflowX,
      };
    });
    expect(layout.pageWidth).toBe(width);
    expect(layout.separated).toBe(true);
    if (width <= 1280) {
      expect(layout.navBelow).toBe(true);
      expect(layout.overflow).toBe('auto');
    } else {
      expect(layout.desktopFit).toBe(true);
      expect(layout.height).toBe(68);
    }
  }
});

test('the career card preserves its desktop and mobile curve geometry while allowing copy updates', () => {
  const source = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const card = source.match(/<figure class="career-map"[\s\S]*?<\/figure>/)[0];
  const svg = card.match(/<svg[\s\S]*?<\/svg>/)[0];
  const styles = [...card.matchAll(/style="([^"]+)"/g)].map(match => match[1]);
  expect(createHash('sha256').update(JSON.stringify({ svg, styles })).digest('hex')).toBe(
    '6a6f31022a57ebcf1211ebf18ede9689f6f9be75316eef60446285d59b57170c'
  );
});

async function showCurve(page) {
  await page.locator('.cm-curve').evaluate(curve => {
    curve.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

async function expectComplete(page) {
  await expect(curveLine(page)).toHaveCSS('stroke-dashoffset', '0px');
  await expect(page.locator('.cm-step-now .cm-node')).toHaveCSS('transform', 'none');
  await expect(page.locator('.cm-step-now .cm-label')).toHaveCSS('opacity', '1');
}

async function expectScaledStroke(page) {
  await expect.poll(() => curveLine(page).evaluate(line => {
    const length = line.getTotalLength();
    const matrix = line.getScreenCTM();
    let previous = line.getPointAtLength(0).matrixTransform(matrix);
    let renderedLength = 0;
    for (let i = 1; i <= 256; i++) {
      const point = line.getPointAtLength(length * i / 256).matrixTransform(matrix);
      renderedLength += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return Math.abs(parseFloat(getComputedStyle(line).strokeDasharray) - renderedLength - 2.5);
  })).toBeLessThan(0.6);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 861, height: 1000 }, { width: 860, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`career draws once with a viewport-aware trigger at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const plot = page.locator('.cm-plot');
    const card = page.locator('.career-map');
    await expect(plot).toHaveClass(/is-animated/);
    await expect(plot).not.toHaveClass(/is-drawn/);
    await expect(card).toHaveCSS('opacity', '0');
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 28)');
    await expectScaledStroke(page);
    expect(await curveLine(page).evaluate(line => parseFloat(getComputedStyle(line).strokeDashoffset))).toBeGreaterThan(0);

    await card.evaluate(card => {
      window.scrollTo({ top: scrollY + card.getBoundingClientRect().top - innerHeight + 100, behavior: 'instant' });
    });
    await expect(card).toHaveClass(/is-revealed/);
    expect(await page.locator('.cm-curve').evaluate(curve => curve.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    if (viewport.width <= 860) {
      await expect(plot).not.toHaveClass(/is-drawn/);
      await card.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
      await page.waitForTimeout(1500);
      await expect(plot).not.toHaveClass(/is-drawn/);
      expect(await curveLine(page).evaluate(line => parseFloat(getComputedStyle(line).strokeDashoffset))).toBeGreaterThan(0);
      await showCurve(page);
    }
    await expect(plot).toHaveClass(/is-drawn/);
    const animatedProperties = await card.evaluate(element => {
      const animations = element.getAnimations({ subtree: true });
      const delay = parseFloat(element.style.getPropertyValue('--reveal-delay'));
      animations.forEach(animation => {
        animation.pause();
        animation.currentTime = delay + 350;
      });
      return animations.map(animation => animation.transitionProperty);
    });
    expect(animatedProperties).toContain('stroke-dashoffset');
    expect(animatedProperties).toContain('transform');
    if (viewport.width > 860) {
      const opacity = Number(await card.evaluate(element => getComputedStyle(element).opacity));
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
      expect(await card.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m42)).toBeGreaterThan(0);
    }

    await card.evaluate(element => {
      const delay = parseFloat(element.querySelector('.cm-plot').style.getPropertyValue('--reveal-delay') || element.style.getPropertyValue('--reveal-delay'));
      element.getAnimations({ subtree: true }).forEach(animation => { animation.currentTime = delay + 750; });
    });
    const ratio = await curveLine(page).evaluate(line => {
      const style = getComputedStyle(line);
      return parseFloat(style.strokeDashoffset) / parseFloat(style.strokeDasharray);
    });
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.3);
    expect(Number(await page.locator('.cm-step-now .cm-label').evaluate(label => getComputedStyle(label).opacity))).toBeGreaterThan(0);
    await expect(page.locator('.cm-step-first .cm-label')).toHaveCSS('opacity', '0');
    expect(await page.locator('.cm-step-now .cm-node').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m11)).toBe(1);
    expect(await page.locator('.cm-step-first .cm-node').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m11)).toBeLessThan(1);

    await card.evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
    await expectComplete(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.locator('.cm-curve').evaluate(curve => curve.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    await showCurve(page);
    await expectComplete(page);
    expect(await plot.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    await page.locator('html').evaluate(root => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; });
    await page.setViewportSize({ width: viewport.width > 860 ? 390 : 1440, height: 1000 });
    await expectComplete(page);
    await expectScaledStroke(page);
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
