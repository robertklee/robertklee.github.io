'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync, existsSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();
const sky = page => page.locator('.meteor-watch-canvas');
const state = page => page.evaluate(() => window.readMeteorWatch());
const showSection = (page, selector) => page.locator(selector).evaluate(element => {
  element.scrollIntoView({ block: 'start', behavior: 'instant' });
  window.dispatchEvent(new Event('scroll'));
});
const showAbout = page => showSection(page, '#profile-about');
const pixels = page => sky(page).evaluate(canvas => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0;
  let maxAlpha = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]) lit++;
    maxAlpha = Math.max(maxAlpha, data[i]);
  }
  return { lit, maxAlpha };
});

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
  page.on('console', message => {
    if (message.type() === 'error') errors.get(page).push(message.text());
  });
  await page.route('https://static.cloudflareinsights.com/**', route => route.fulfill({
    contentType: 'text/javascript', body: '',
  }));
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'dark');
    const sample = new URL(location.href).searchParams.get('sample');
    Math.random = () => sample === null ? .5 : Number(sample);
    const proto = CanvasRenderingContext2D.prototype;
    const fillRect = proto.fillRect;
    const fill = proto.fill;
    const gradient = proto.createLinearGradient;
    const washes = new WeakSet();
    proto.createLinearGradient = function (x0, y0, x1, y1) {
      const result = gradient.call(this, x0, y0, x1, y1);
      if (x0 === x1) washes.add(result);
      return result;
    };
    proto.fillRect = function (...args) {
      if (this.canvas.matches('.meteor-watch-canvas') &&
          (window.omitSkyStars || (window.omitSkyWash && washes.has(this.fillStyle)))) return;
      return fillRect.apply(this, args);
    };
    proto.fill = function (...args) {
      if (this.canvas.matches('.meteor-watch-canvas') && window.omitSkyStars && typeof this.fillStyle === 'string') return;
      return fill.apply(this, args);
    };
  });
  // Read private scheduling state without shipping a preview/debug API.
  await page.route('**/assets/site/meteor-watch.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: source.replace(/\n\}\)\(\);\s*$/, `
        window.readMeteorWatch = () => ({
          width, height, headerHeight, skyTop, skyBottom, stars, protectedRects,
          clock: clock + (lastNow === null ? 0 : performance.now() - lastNow),
          nextTwinkle, nextMeteor, twinkle, meteor, running: canRun(),
          timer: Boolean(timer), animationFrame: Boolean(animationFrame)
        });
      })();`),
    });
  });
  await page.clock.install({ time: new Date('2026-10-06T05:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T05:00:01Z'));
  await page.goto(origin);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(100);
  await expect(sky(page)).toHaveCount(1);
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('built homepage owns its sky assets, has no spike dependencies, and leaves the hero clear', async ({ page }) => {
  const assets = ['meteor-watch.js', 'meteor-watch.css'];
  for (const name of assets) {
    expect(existsSync(resolve(__dirname, '../dist/assets/site', name))).toBe(true);
    expect(readFileSync(resolve(__dirname, '../assets/site', name), 'utf8')).not.toContain('spikes/');
  }
  expect(existsSync(resolve(__dirname, '../dist/spikes'))).toBe(false);
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.reload();
  expect(requests.some(url => url.includes('/spikes/'))).toBe(false);
  expect((await pixels(page)).lit).toBe(0);
  expect((await state(page)).running).toBe(false);
  await expect(sky(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(sky(page)).toHaveCSS('pointer-events', 'none');
  await expect(sky(page)).toHaveCSS('position', 'fixed');
  await expect(page.locator('.hero .meteor-watch-canvas')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/night-sky-preview/);
  await showAbout(page);
  await page.clock.runFor(100);
  expect((await pixels(page)).lit).toBeGreaterThan(10000);
  const layout = await page.locator('body').evaluate(body => ({
    height: body.offsetHeight, width: body.offsetWidth, hero: body.querySelector('.hero').offsetHeight,
  }));
  await page.route('**/assets/site/meteor-watch.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.locator('body').evaluate(body => ({
    height: body.offsetHeight, width: body.offsetWidth, hero: body.querySelector('.hero').offsetHeight,
  }))).toEqual(layout);
});

test('layered mixed-shape stars stay faint and avoid all copy, cards, controls, and the footer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.omitSkyWash = true; });
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  expect(new Set(scene.stars.map(star => star.shape))).toEqual(new Set(['dots', 'diamonds', 'glints']));
  expect(Math.max(...scene.stars.map(star => star.radius))).toBeGreaterThan(2);
  expect(Math.min(...scene.stars.map(star => star.radius))).toBeLessThan(.6);
  expect(scene.stars.every(star => scene.protectedRects.every(rect =>
    star.x + 16 <= rect.x || star.x - 16 >= rect.x + rect.w ||
    star.y + 16 <= rect.y || star.y - 16 >= rect.y + rect.h))).toBe(true);
  const painted = await pixels(page);
  expect(painted.lit).toBeGreaterThan(15);
  expect(painted.lit).toBeLessThan(2000);
  expect(painted.maxAlpha).toBeLessThanOrEqual(82);
  for (const selector of ['#profile-about', '#profile-work', '#profile-experience', '#contact']) {
    await showSection(page, selector);
    await page.clock.runFor(100);
    expect(await sky(page).evaluate(canvas => {
      const ratio = canvas.width / document.documentElement.clientWidth;
      const ctx = canvas.getContext('2d');
      return [...document.querySelectorAll('.hero, .site-header, .section-heading, .cv-about-copy, figure, details, .contact-card, .site-footer')]
        .filter(element => {
          const r = element.getBoundingClientRect();
          const x = Math.max(0, Math.ceil(r.left * ratio));
          const y = Math.max(0, Math.ceil(r.top * ratio));
          const w = Math.min(canvas.width, Math.floor(r.right * ratio)) - x;
          const h = Math.min(canvas.height, Math.floor(r.bottom * ratio)) - y;
          return w > 0 && h > 0 && ctx.getImageData(x, y, w, h).data.some((value, i) => i % 4 === 3 && value > 0);
        }).map(element => {
          const r = element.getBoundingClientRect();
          return {
            name: element.className, rect: [r.left, r.top + window.scrollY, r.width, r.height],
            stars: window.readMeteorWatch().stars.filter(star =>
              star.x >= r.left && star.x <= r.right && star.y >= r.top + window.scrollY && star.y <= r.bottom + window.scrollY),
          };
        });
    }), selector).toEqual([]);
  }
});

for (const sample of [0, .5, .999]) {
  test(`first meteor uses 15-45s waits and later flights retain 45-90s rests (sample ${sample})`, async ({ page }) => {
    await page.goto(`${origin}/?sample=${sample}`);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(100);
    expect((await state(page)).nextMeteor).toBe(15000 + sample * 30000);
    await showAbout(page);
    await page.clock.runFor(100);
    const before = await state(page);
    await page.clock.fastForward(before.nextMeteor - before.clock - 100);
    expect((await state(page)).meteor).toBeNull();
    await page.clock.fastForward(101);
    const first = await state(page);
    expect(first.meteor).not.toBeNull();
    expect(first.nextMeteor - first.meteor.start - first.meteor.duration).toBeCloseTo(45000 + sample * 45000, 5);
    await page.evaluate(() => {
      window.omitSkyStars = true;
      window.omitSkyWash = true;
      window.dispatchEvent(new Event('scroll'));
    });
    await page.clock.runFor(Math.ceil(first.meteor.duration / 2));
    const painted = await pixels(page);
    expect(painted.lit).toBeGreaterThan(5);
    expect(painted.maxAlpha).toBeLessThanOrEqual(82);
    const { meteor, protectedRects } = await state(page);
    const rect = {
      x: Math.min(meteor.x, meteor.x + meteor.dx) - 1,
      y: Math.min(meteor.y, meteor.y + meteor.dy) - 1,
      w: Math.abs(meteor.dx) + 2, h: Math.abs(meteor.dy) + 2,
    };
    expect(protectedRects.every(p => rect.x + rect.w <= p.x || rect.x >= p.x + p.w ||
      rect.y + rect.h <= p.y || rect.y >= p.y + p.h)).toBe(true);
    await page.clock.fastForward(Math.ceil(first.meteor.duration));
    expect((await state(page)).meteor).toBeNull();
    expect((await pixels(page)).lit).toBe(0);
    const rest = await state(page);
    await page.clock.fastForward(rest.nextMeteor - rest.clock - 100);
    expect((await state(page)).meteor).toBeNull();
    await page.clock.fastForward(101);
    expect((await state(page)).meteor).not.toBeNull();
  });
}

test('shooting stars preserve large differences in travel length', async ({ page }) => {
  const distances = [];
  for (const sample of [.02, .99]) {
    await page.goto(`${origin}/?sample=${sample}`);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(100);
    await showAbout(page);
    await page.clock.runFor(100);
    const scene = await state(page);
    await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
    const { meteor } = await state(page);
    expect(meteor).not.toBeNull();
    distances.push(meteor.distance);
    expect(meteor.tail).toBeLessThanOrEqual(260);
    expect(meteor.tail).toBeLessThan(meteor.distance);
  }
  expect(Math.max(...distances) / Math.min(...distances)).toBeGreaterThan(8);
});

test('twinkles vary by profile, use real animation, and wait without an idle frame loop', async ({ page }) => {
  for (const [sample, kind] of [[.1, 'breathe'], [.5, 'shimmer'], [.9, 'sparkle']]) {
    await page.goto(`${origin}/?sample=${sample}`);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(100);
    await showAbout(page);
    await page.clock.runFor(100);
    const before = await state(page);
    expect(before.animationFrame).toBe(false);
    expect(before.timer).toBe(true);
    await page.clock.fastForward(before.nextTwinkle - before.clock + 1);
    const event = await state(page);
    expect(event.twinkle.kind).toBe(kind);
    expect(event.twinkle.duration).toBeGreaterThanOrEqual(2400);
    expect(event.twinkle.duration).toBeLessThanOrEqual(6000);
    expect(event.nextTwinkle - event.twinkle.start - event.twinkle.duration).toBeCloseTo(3000 + sample * 5000, 5);
    const image = await sky(page).evaluate(canvas => canvas.toDataURL());
    await page.clock.runFor(500);
    expect(await sky(page).evaluate(canvas => canvas.toDataURL())).not.toBe(image);
    await page.clock.fastForward(event.twinkle.duration + 100);
    expect((await state(page)).twinkle).toBeNull();
    expect((await state(page)).animationFrame).toBe(false);
  }
});

test('light mode, offscreen sky, hidden tabs, and page suspension pause active-viewing clocks', async ({ page }) => {
  await showAbout(page);
  await page.clock.runFor(100);
  const suspend = async (stop, resume) => {
    await page.evaluate(stop);
    await expect.poll(async () => (await state(page)).timer).toBe(false);
    const paused = await state(page);
    expect(paused.running).toBe(false);
    expect(paused.timer).toBe(false);
    expect(paused.animationFrame).toBe(false);
    await page.clock.fastForward(120000);
    expect((await state(page)).clock).toBe(paused.clock);
    await page.evaluate(resume);
    expect((await state(page)).running).toBe(true);
    expect((await state(page)).clock).toBe(paused.clock);
  };
  await suspend(
    () => { document.documentElement.dataset.theme = 'light'; },
    () => { document.documentElement.dataset.theme = 'dark'; }
  );
  await suspend(
    () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    },
    () => {
      document.getElementById('profile-about').scrollIntoView({ block: 'start', behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
    }
  );
  await suspend(
    () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    },
    () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  );
  await suspend(
    () => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
    () => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  );
});

test('theme toggle hides and clears the sky without reshuffling the stars; reduced motion stays static', async ({ page }) => {
  await showAbout(page);
  await page.clock.runFor(100);
  const positions = (await state(page)).stars.map(({ x, y }) => [x, y]);
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(sky(page)).toBeHidden();
  expect((await pixels(page)).lit).toBe(0);
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(sky(page)).toBeVisible();
  expect((await state(page)).stars.map(({ x, y }) => [x, y])).toEqual(positions);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await state(page)).running).toBe(false);
  const frozen = await sky(page).evaluate(canvas => canvas.toDataURL());
  const paused = await state(page);
  await page.clock.fastForward(120000);
  expect((await state(page)).clock).toBe(paused.clock);
  expect((await state(page)).meteor).toBeNull();
  expect((await state(page)).twinkle).toBeNull();
  expect(await sky(page).evaluate(canvas => canvas.toDataURL())).toBe(frozen);
  await page.emulateMedia({ media: 'print' });
  await expect(sky(page)).toBeHidden();
});

test('mobile retains smaller sparse stars and twinkles but never launches meteors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    await page.clock.runFor(32);
    return (await state(page)).width;
  }).toBe(390);
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  expect(scene.width).toBe(390);
  expect(Math.max(...scene.stars.map(star => star.radius))).toBeLessThan(2);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scene.stars.filter(star => star.y > scrollY && star.y < scrollY + 844).length).toBeGreaterThan(0);
  await page.clock.fastForward(120000);
  expect((await state(page)).meteor).toBeNull();
  expect((await state(page)).twinkle).not.toBeNull();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => {
    await page.clock.runFor(32);
    return (await state(page)).width;
  }).toBe(1440);
  const desktop = await state(page);
  expect(desktop.nextMeteor - desktop.clock).toBeGreaterThan(29000);
  expect(desktop.nextMeteor - desktop.clock).toBeLessThanOrEqual(30000);
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth)).toBe(true);
});

test('expanding records rebuilds safe sky layout and embedded pages omit the production effect', async ({ page }) => {
  const before = await state(page);
  await page.locator('#profile-work-entry-1').evaluate(element => { element.open = true; });
  await page.clock.runFor(100);
  expect((await state(page)).skyBottom).toBeGreaterThan(before.skyBottom);
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'embedded-homepage';
    frame.src = '/';
    document.body.append(frame);
  });
  await expect(page.frameLocator('#embedded-homepage').locator('#profile-about')).toHaveCount(1);
  await expect(page.frameLocator('#embedded-homepage').locator('.meteor-watch-canvas')).toHaveCount(0);
  await expect(page.frameLocator('#embedded-homepage').locator('body')).not.toHaveClass(/meteor-watch/);
});

test('unavailable Canvas support logs a warning and leaves the profile usable', async ({ page }) => {
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      return this.matches('.meteor-watch-canvas') ? null : getContext.apply(this, args);
    };
  });
  await page.reload();
  await expect(sky(page)).toHaveCount(0);
  await expect(page.locator('#profile-about-title')).toContainText('about Robert');
  expect(warnings).toContain('Meteor watch: Canvas 2D is unavailable; the decorative sky is disabled.');
});
