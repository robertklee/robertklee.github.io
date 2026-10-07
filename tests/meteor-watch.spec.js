'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync, existsSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');
const { transformSync } = require('esbuild');

let server;
let origin;
const errors = new WeakMap();
const sky = page => page.locator('.meteor-watch-canvas');
const state = page => page.evaluate(() => window.readMeteorWatch());
const resizeSky = async (page, width, height) => {
  await page.setViewportSize({ width, height });
  await expect.poll(async () => {
    await page.clock.runFor(32);
    const scene = await state(page);
    return { width: scene.width, height: scene.height };
  }).toEqual({ width, height });
};
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
    const radialGradient = proto.createRadialGradient;
    const washes = new WeakSet();
    const starPaints = new WeakSet();
    proto.createLinearGradient = function (x0, y0, x1, y1) {
      const result = gradient.call(this, x0, y0, x1, y1);
      if (x0 === x1) washes.add(result);
      return result;
    };
    proto.createRadialGradient = function (...args) {
      const result = radialGradient.apply(this, args);
      starPaints.add(result);
      return result;
    };
    proto.fillRect = function (...args) {
      if (this.canvas.matches('.meteor-watch-canvas') &&
          (window.omitSkyStars || (window.omitSkyWash && washes.has(this.fillStyle)))) return;
      return fillRect.apply(this, args);
    };
    proto.fill = function (...args) {
      if (this.canvas.matches('.meteor-watch-canvas') && window.omitSkyStars &&
          (typeof this.fillStyle === 'string' || starPaints.has(this.fillStyle))) return;
      return fill.apply(this, args);
    };
  });
  // Read private scheduling state without shipping a preview/debug API.
  await page.route('**/assets/site/meteor-watch.js', async route => {
    const response = await route.fetch();
    const source = readFileSync(resolve(__dirname, '../assets/site/meteor-watch.js'), 'utf8');
    const options = { loader: 'js', minify: true, legalComments: 'inline' };
    expect(await response.text()).toBe(transformSync(source, options).code);
    const instrumented = source.replace('function startMeteor() {', `function startMeteor() {
        window.meteorAttempts = (window.meteorAttempts || 0) + 1;`)
      .replace(/\n\}\)\(\);\s*$/, `
        window.readMeteorWatch = () => ({
          width, height, headerHeight, skyTop, skyBottom, stars, protectedRects, footerRects,
          appearances: stars.map(starAppearance), meteorPending,
          attempts: window.meteorAttempts || 0,
          clock: clock + (lastNow === null ? 0 : performance.now() - lastNow),
          nextTwinkle, nextMeteor, twinkle, meteor, running: canRun(),
          timer: Boolean(timer), animationFrame: Boolean(animationFrame)
        });
        window.setMeteorWatchRects = (rects, footers = footerRects) => {
          protectedRects = rects;
          footerRects = footers;
        };
        window.meteorWatchFits = flight => meteorFits(flight);
        window.meteorWatchOpacity = (flight, t) => meteorOpacity(flight, t);
        window.paintMeteorWatchStar = (index, kind, progress = 0) => {
          const star = stars[index];
          const profile = profiles[kind];
          twinkle = kind ? {
            star, kind, start: clock - progress * profile.duration[0],
            duration: profile.duration[0], intensity: profile.intensity[1],
            growth: profile.growth[1] * (width <= 860 ? .65 : 1), points: profile.points,
          } : null;
          draw();
          schedule();
          return starAppearance(star);
        };
        window.meteorWatchPath = appearance => {
          const commands = [];
          const methods = ['beginPath', 'moveTo', 'bezierCurveTo', 'closePath'];
          const originals = methods.map(method => ctx[method]);
          methods.forEach(method => { ctx[method] = (...args) => commands.push([method, ...args]); });
          try { traceStar(0, 0, appearance.radius, appearance.arm, appearance.morph); }
          finally { methods.forEach((method, i) => { ctx[method] = originals[i]; }); }
          return commands;
        };
      })();`);
    expect(instrumented).not.toBe(source);
    await route.fulfill({
      response,
      body: transformSync(instrumented, options).code,
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

test('soft bounded stars mix approximately 40% curved astroids and avoid protected content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.omitSkyWash = true; });
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  expect(new Set(scene.stars.map(star => star.shape))).toEqual(new Set(['point', 'astroid']));
  const proportion = scene.stars.filter(star => star.shape === 'astroid').length / scene.stars.length;
  expect(proportion).toBeGreaterThan(.34);
  expect(proportion).toBeLessThan(.46);
  expect(Math.max(...scene.stars.map(star => star.radius))).toBeGreaterThan(2.3);
  expect(Math.max(...scene.stars.map(star => star.radius))).toBeLessThanOrEqual(2.4);
  expect(Math.min(...scene.stars.map(star => star.radius))).toBeGreaterThanOrEqual(.65);
  expect(Math.min(...scene.stars.map(star => star.radius))).toBeLessThan(.75);
  const mediumAndBright = scene.stars.filter(star => star.radius >= 1.2).length / scene.stars.length;
  const bright = scene.stars.filter(star => star.radius >= 2.05).length / scene.stars.length;
  expect(mediumAndBright).toBeGreaterThan(.36);
  expect(mediumAndBright).toBeLessThan(.5);
  expect(bright).toBeGreaterThan(.06);
  expect(bright).toBeLessThan(.15);
  expect(scene.appearances.every(star => Math.max(star.arm, star.haloRadius) <= 4.5)).toBe(true);
  expect(Math.min(...scene.stars.map(star => star.alpha))).toBeGreaterThanOrEqual(.18);
  expect(Math.max(...scene.stars.map(star => star.alpha))).toBeLessThan(.38);
  expect(scene.stars.every(star => scene.protectedRects.every(rect =>
    star.x + 16 <= rect.x || star.x - 16 >= rect.x + rect.w ||
    star.y + 16 <= rect.y || star.y - 16 >= rect.y + rect.h))).toBe(true);
  const painted = await pixels(page);
  expect(painted.lit).toBeGreaterThan(15);
  expect(painted.lit).toBeLessThan(2000);
  expect(painted.maxAlpha).toBeGreaterThan(40);
  expect(painted.maxAlpha).toBeLessThanOrEqual(97);
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

for (const [width, sample] of [1440, 390].flatMap(width => [0, .5, .999].map(sample => [width, sample]))) {
  test(`${width}px first meteor waits 12-36s and displayed flights finish before 36-72s rests (sample ${sample})`, async ({ page }) => {
    await resizeSky(page, width, 1000);
    await page.goto(`${origin}/?sample=${sample}`);
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(100);
    expect((await state(page)).nextMeteor).toBe(12000 + sample * 24000);
    expect((await state(page)).nextTwinkle).toBe(800 + sample * 1200);
    await showAbout(page);
    await page.clock.runFor(100);
    const before = await state(page);
    await page.clock.fastForward(before.nextMeteor - before.clock - 100);
    expect((await state(page)).meteor).toBeNull();
    await page.clock.fastForward(101);
    const first = await state(page);
    expect(first.meteor).not.toBeNull();
    expect(first.nextMeteor).toBe(before.nextMeteor);
    expect(first.meteor.displayed).toBe(false);
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
    expect(meteor.displayed).toBe(true);
    const fraction = meteor.mobile ? .7 : 1;
    const rect = {
      x: Math.min(meteor.x, meteor.x + meteor.dx * fraction) - 4,
      y: Math.min(meteor.y, meteor.y + meteor.dy * fraction) - 4,
      w: Math.abs(meteor.dx * fraction) + 8, h: Math.abs(meteor.dy * fraction) + 8,
    };
    expect(protectedRects.every(p => rect.x + rect.w <= p.x || rect.x >= p.x + p.w ||
      rect.y + rect.h <= p.y || rect.y >= p.y + p.h)).toBe(true);
    await page.clock.fastForward(Math.ceil(first.meteor.duration));
    expect((await state(page)).meteor).toBeNull();
    expect((await pixels(page)).lit).toBe(0);
    const rest = await state(page);
    expect(rest.nextMeteor - rest.clock).toBeCloseTo(36000 + sample * 36000, 5);
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
    expect((await state(page)).nextTwinkle).toBe(800 + sample * 1200);
    await showAbout(page);
    await page.clock.runFor(100);
    const before = await state(page);
    expect(before.animationFrame).toBe(false);
    expect(before.timer).toBe(true);
    await page.clock.fastForward(before.nextTwinkle - before.clock + 1);
    const event = await state(page);
    expect(event.twinkle.kind).toBe(kind);
    const durations = { breathe: [3000, 5000], shimmer: [4000, 6000], sparkle: [2400, 3600] };
    const [min, max] = durations[kind];
    expect(event.twinkle.duration).toBeCloseTo(min + sample * (max - min), 5);
    expect(event.twinkle.duration).toBeGreaterThanOrEqual(2400);
    expect(event.twinkle.duration).toBeLessThanOrEqual(6000);
    expect(event.nextTwinkle - event.twinkle.start - event.twinkle.duration).toBeCloseTo(800 + sample * 1200, 5);
    const image = await sky(page).evaluate(canvas => canvas.toDataURL());
    await page.clock.runFor(500);
    expect(await sky(page).evaluate(canvas => canvas.toDataURL())).not.toBe(image);
    await page.clock.fastForward(event.twinkle.duration + 100);
    expect((await state(page)).twinkle).toBeNull();
    expect((await state(page)).animationFrame).toBe(false);
  }
});

test('all profiles smoothly grow concave curved points and return to their bounded resting cores', async ({ page }) => {
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  const visible = star => star.y > scrollY + scene.headerHeight + 24 && star.y < scrollY + scene.height - 24;
  const point = scene.stars.findIndex(star => star.shape === 'point' && visible(star));
  const astroid = scene.stars.findIndex(star => star.shape === 'astroid' && visible(star));
  expect(point).toBeGreaterThanOrEqual(0);
  expect(astroid).toBeGreaterThanOrEqual(0);
  const paint = (index, kind, progress) => page.evaluate(
    ([index, kind, progress]) => window.paintMeteorWatchStar(index, kind, progress), [index, kind, progress]
  );
  const curved = async appearance => {
    const path = await page.evaluate(appearance => window.meteorWatchPath(appearance), appearance);
    const curves = path.filter(command => command[0] === 'bezierCurveTo');
    expect(curves).toHaveLength(4);
    const [, x1, y1, x2, y2, x3, y3] = curves[0];
    // At the diagonal, curved concave sides sit inside a straight diamond edge.
    const x = (3 * x1 + 3 * x2 + x3) / 8;
    const y = (-appearance.arm + 3 * y1 + 3 * y2 + y3) / 8;
    expect(x).toBeLessThan(appearance.arm / 2);
    expect(-y).toBeLessThan(appearance.arm / 2);
  };
  const rest = await paint(point, null, 0);
  const image = await sky(page).evaluate(canvas => canvas.toDataURL());
  const peaks = [];
  for (const kind of ['breathe', 'shimmer', 'sparkle']) {
    const start = await paint(point, kind, 0);
    expect(start).toEqual(rest);
    expect(await sky(page).evaluate(canvas => canvas.toDataURL())).toBe(image);
    let peak;
    for (const progress of [.001, .1, .2, .3, .4, .5, .6, .7, .8, .9, .999]) {
      const appearance = await paint(point, kind, progress);
      expect(appearance.radius).toBe(rest.radius);
      expect(appearance.alpha).toBeLessThanOrEqual(.52);
      expect(Math.max(appearance.arm, appearance.haloRadius)).toBeLessThanOrEqual(4.5);
      if (!peak || appearance.morph > peak.morph) peak = appearance;
      if (progress === .5) {
        expect(await sky(page).evaluate(canvas => canvas.toDataURL()) !== image).toBe(true);
      }
      if (progress === .001 || progress === .999) {
        expect(appearance.arm - rest.arm).toBeLessThan(.001);
        expect(appearance.morph).toBeLessThan(.001);
      }
    }
    await curved(peak);
    peaks.push(peak.morph);
    const end = await paint(point, kind, 1);
    expect(end.radius).toBe(rest.radius);
    expect(end.morph).toBeCloseTo(0, 10);
    expect(end.arm).toBeCloseTo(rest.arm, 10);
    expect(await sky(page).evaluate(canvas => canvas.toDataURL())).toBe(image);
    const restingAstroid = await paint(astroid, null, 0);
    await curved(restingAstroid);
    for (const progress of [0, .3, .5, .7, 1]) {
      const appearance = await paint(astroid, kind, progress);
      expect(appearance.morph).toBe(1);
      expect(appearance.radius).toBe(restingAstroid.radius);
      expect(appearance.arm).toBeGreaterThanOrEqual(restingAstroid.arm);
      expect(Math.max(appearance.arm, appearance.haloRadius)).toBeLessThanOrEqual(4.5);
    }
    await paint(point, null, 0);
  }
  expect(peaks[2]).toBeGreaterThan(peaks[0]);
  expect(peaks[2]).toBeGreaterThan(peaks[1]);
  for (const shape of ['point', 'astroid']) {
    const largest = scene.stars.reduce((best, star, i) =>
      star.shape === shape && (best < 0 || star.radius > scene.stars[best].radius) ? i : best, -1);
    expect(scene.stars[largest].radius).toBeGreaterThan(2.3);
    for (const kind of ['breathe', 'shimmer', 'sparkle']) {
      const appearance = await paint(largest, kind, kind === 'shimmer' ? .3 : .5);
      expect(appearance.radius).toBeLessThanOrEqual(2.4);
      expect(Math.max(appearance.arm, appearance.haloRadius)).toBeLessThanOrEqual(4.5);
    }
  }
});

test('brighter stars have soft cores and faint compact halo edges, not solid disks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.omitSkyWash = true; });
  const scene = await state(page);
  const bright = scene.stars.find(star => star.halo && star.radius > 2.05 &&
    star.shape === 'point' && star.y >= scene.skyTop + 180);
  expect(bright).toBeTruthy();
  await page.evaluate(y => {
    window.scrollTo({ top: y - window.innerHeight / 2, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
  }, bright.y);
  await page.clock.runFor(100);
  const patch = await sky(page).evaluate((canvas, star) => {
    const ratio = canvas.width / document.documentElement.clientWidth;
    const x = Math.floor(star.x * ratio);
    const y = Math.floor((star.y - window.scrollY) * ratio);
    const data = canvas.getContext('2d').getImageData(x - 7, y - 7, 15, 15).data;
    const alphas = [...data].filter((_, i) => i % 4 === 3);
    const outside = alphas.filter((_, i) => {
      const px = i % 15 - 7;
      const py = Math.floor(i / 15) - 7;
      return Math.abs(px) === 7 || Math.abs(py) === 7;
    });
    return { alphas, outside };
  }, bright);
  expect(Math.max(...patch.alphas)).toBeGreaterThan(40);
  expect(Math.max(...patch.alphas)).toBeLessThanOrEqual(97);
  expect(patch.alphas.some(alpha => alpha > 0 && alpha < 10)).toBe(true);
  expect(new Set(patch.alphas.filter(alpha => alpha > 0)).size).toBeGreaterThan(5);
  expect(patch.outside.every(alpha => alpha === 0)).toBe(true);
});

test('five different visible stars take turns within thirty seconds, faster than the old cadence', async ({ page }) => {
  await showAbout(page);
  await page.clock.runFor(100);
  const initial = await state(page);
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const before = await state(page);
    await page.clock.fastForward(before.nextTwinkle - before.clock + 1);
    const scene = await state(page);
    expect(scene.twinkle).not.toBeNull();
    const { star } = scene.twinkle;
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(star.y).toBeGreaterThanOrEqual(scrollY + scene.headerHeight + 16);
    expect(star.y).toBeLessThanOrEqual(scrollY + scene.height - 24);
    seen.add(`${star.x},${star.y}`);
    expect(scene.stars.reduce((sum, point) => sum + point.twinkles, 0)).toBe(i + 1);
    expect(seen.size).toBe(i + 1);
    expect(scene.clock - initial.clock).toBeLessThanOrEqual(30000);
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

for (const width of [320, 390, 860, 861]) {
  test(`${width}px sky launches safe flights with bounded mobile tracks and no overflow`, async ({ page }) => {
    await resizeSky(page, width, 844);
    await showAbout(page);
    await page.clock.runFor(100);
    const scene = await state(page);
    expect(scene.width).toBe(width);
    const mobile = width <= 860;
    expect(scene.nextMeteor).toBe(24000);
    expect(Math.max(...scene.stars.map(star => star.radius))).toBeLessThanOrEqual(mobile ? 1.8 : 2.4);
    expect(Math.min(...scene.stars.map(star => star.radius))).toBeGreaterThanOrEqual(.65);
    expect(scene.appearances.every(star => Math.max(star.arm, star.haloRadius) <= (mobile ? 3.5 : 4.5))).toBe(true);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scene.stars.filter(star => star.y > scrollY && star.y < scrollY + 844).length).toBeGreaterThan(0);
    await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
    const launch = await state(page);
    expect(launch.meteor).not.toBeNull();
    expect(launch.meteor.mobile).toBe(mobile);
    expect(launch.nextMeteor).toBe(scene.nextMeteor);
    expect(launch.meteor.distance).toBeLessThanOrEqual(mobile ? 220 : 760);
    expect(launch.meteor.tail).toBeLessThanOrEqual(mobile ? 64 : 260);
    expect(launch.meteor.tail).toBeLessThan(launch.meteor.distance);
    expect(await page.evaluate(flight => window.meteorWatchFits(flight), launch.meteor)).toBe(true);
    await page.evaluate(() => { window.omitSkyStars = true; window.omitSkyWash = true; });
    await page.clock.runFor(Math.ceil(launch.meteor.duration / 2));
    expect((await state(page)).meteor.displayed).toBe(true);
    const painted = await pixels(page);
    expect(painted.lit).toBeGreaterThan(5);
    expect(painted.maxAlpha).toBeLessThanOrEqual(82);
    await page.screenshot({ path: test.info().outputPath(`sky-${width}px-flight.png`) });
    await page.clock.fastForward(Math.ceil(launch.meteor.duration));
    const rest = await state(page);
    expect(rest.meteor).toBeNull();
    expect(rest.meteorPending).toBe(false);
    expect(rest.nextMeteor - rest.clock).toBe(54000);
    expect((await pixels(page)).lit).toBe(0);
    expect(await page.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('mobile permits only the fading final 30% behind copy and never relaxes boundaries', async ({ page }) => {
  await resizeSky(page, 390, 844);
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  const band = Math.max(scene.skyTop + 16, scrollY + scene.headerHeight + 16) + 120;
  const rects = [
    { x: 0, y: 0, w: 390, h: band },
    { x: 0, y: band + 8, w: 390, h: scene.skyBottom },
    { x: 0, y: band, w: 45, h: 8 },
    { x: 151, y: band, w: 239, h: 8 },
  ];
  await page.evaluate(rects => window.setMeteorWatchRects(rects, []), rects);
  await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
  const launch = await state(page);
  expect(launch.meteor).not.toBeNull();
  const flight = launch.meteor;
  expect(flight.distance).toBeCloseTo(125.25, 10);
  expect(flight.x + flight.dx).toBeLessThan(45);
  expect(flight.x + flight.dx * .7 - 4).toBeGreaterThanOrEqual(45);
  expect(await page.evaluate(flight => window.meteorWatchFits({ ...flight, mobile: false }), flight)).toBe(false);
  await page.evaluate(rects => window.setMeteorWatchRects(rects, []), [
    ...rects.slice(0, 2), { ...rects[2], w: 60 }, rects[3],
  ]);
  expect(await page.evaluate(flight => window.meteorWatchFits(flight), flight)).toBe(false);
  await page.evaluate(rects => window.setMeteorWatchRects(rects, []), rects);
  const opacities = await page.evaluate(flight =>
    [.7, .7001, .75, .8, .85, .9, .95, 1].map(t => window.meteorWatchOpacity(flight, t)), flight);
  expect(opacities[0] - opacities[1]).toBeLessThan(.001);
  expect(opacities.every((alpha, i) => i === 0 || alpha < opacities[i - 1])).toBe(true);
  expect(opacities.at(-1)).toBe(0);
  expect(flight.y - 4).toBeGreaterThan(scene.skyTop);
  expect(flight.y - 4).toBeGreaterThan(scrollY + scene.headerHeight);
  expect(flight.y + 4).toBeLessThan(scrollY + scene.height);
  await page.evaluate(() => { window.omitSkyStars = true; window.omitSkyWash = true; });
  const painted = [];
  for (const progress of [.7, .8, .9, .97]) {
    const current = await state(page);
    await page.clock.runFor(Math.ceil(flight.start + flight.duration * progress - current.clock));
    const overlap = await sky(page).evaluate((canvas, band) => {
      const ratio = canvas.width / document.documentElement.clientWidth;
      const data = canvas.getContext('2d').getImageData(
        0, Math.floor((band - window.scrollY) * ratio), 45 * ratio, 8 * ratio).data;
      return data.some((value, i) => i % 4 === 3 && value > 0);
    }, band);
    painted.push(await pixels(page));
    expect(overlap).toBe(progress > .7 && progress < .97);
    if (progress === .8) {
      await page.screenshot({ path: test.info().outputPath('mobile-fading-endpoint.png'), animations: 'disabled' });
    }
  }
  expect(painted.every((sample, i) => i === 0 || sample.maxAlpha <= painted[i - 1].maxAlpha)).toBe(true);
  await page.clock.fastForward(Math.ceil(flight.duration));
  expect((await pixels(page)).lit).toBe(0);
  await page.evaluate(flight => {
    window.setMeteorWatchRects([], [{ x: flight.x + flight.dx - 4, y: flight.y - 4, w: 12, h: 8 }]);
  }, flight);
  expect(await page.evaluate(flight => window.meteorWatchFits(flight), flight)).toBe(false);
  expect(await page.evaluate(flight => window.meteorWatchFits({ ...flight, y: window.readMeteorWatch().skyTop }), flight)).toBe(false);
  expect(await page.evaluate(flight =>
    window.meteorWatchFits({ ...flight, y: window.scrollY + window.readMeteorWatch().headerHeight }), flight)).toBe(false);
});

for (const retry of ['scroll', 'layout']) {
  test(`blocked mobile eligibility stays pending without polling until a ${retry} opens a route`, async ({ page }) => {
    await resizeSky(page, 390, 844);
    await showAbout(page);
    await page.clock.runFor(100);
    const scene = await state(page);
    await page.evaluate(scene => window.setMeteorWatchRects([{ x: 0, y: 0, w: scene.width, h: scene.skyBottom }]), scene);
    await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
    const blocked = await state(page);
    expect(blocked.meteor).toBeNull();
    expect(blocked.meteorPending).toBe(true);
    expect(blocked.nextMeteor).toBe(scene.nextMeteor);
    expect(blocked.attempts).toBe(1);
    const turns = blocked.stars.reduce((sum, star) => sum + star.twinkles, 0);
    for (let i = 0; i < 3; i++) {
      const before = await state(page);
      await page.clock.fastForward(before.nextTwinkle - before.clock + 1);
      const turn = await state(page);
      expect(turn.twinkle).not.toBeNull();
      await page.clock.runFor(32);
      await page.clock.fastForward(turn.twinkle.duration + 1);
    }
    const idle = await state(page);
    expect(idle.attempts).toBe(1);
    expect(idle.nextMeteor).toBe(scene.nextMeteor);
    expect(idle.stars.reduce((sum, star) => sum + star.twinkles, 0)).toBeGreaterThan(turns);
    expect(idle.animationFrame).toBe(false);
    expect(idle.timer).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const paused = await state(page);
    await page.clock.fastForward(120000);
    expect((await state(page)).clock).toBe(paused.clock);
    await page.evaluate(() => {
      window.setMeteorWatchRects([]);
      window.dispatchEvent(new Event('scroll'));
    });
    expect((await state(page)).attempts).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await state(page)).meteorPending).toBe(true);
    expect((await state(page)).attempts).toBe(1);
    if (retry === 'scroll') {
      await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.clock.runFor(32);
    }
    const launch = await state(page);
    expect(launch.meteor).not.toBeNull();
    expect(launch.meteorPending).toBe(false);
    expect(launch.attempts).toBe(2);
    expect(launch.nextMeteor).toBe(scene.nextMeteor);
    await page.clock.runFor(32);
    expect((await state(page)).meteor.displayed).toBe(true);
    await page.clock.fastForward(Math.ceil(launch.meteor.duration));
    const rest = await state(page);
    expect(rest.attempts).toBe(2);
    expect(rest.nextMeteor - rest.clock).toBe(54000);
  });
}

test('unpainted mobile cancellations stay eligible; displayed cancellations begin a rest', async ({ page }) => {
  await resizeSky(page, 390, 844);
  await showAbout(page);
  await page.clock.runFor(100);
  const before = await state(page);
  await page.clock.fastForward(before.nextMeteor - before.clock + 1);
  expect((await state(page)).meteor.displayed).toBe(false);
  const leave = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
  };
  await page.evaluate(leave);
  const canceled = await state(page);
  expect(canceled.meteor).toBeNull();
  expect(canceled.meteorPending).toBe(true);
  expect(canceled.nextMeteor).toBe(before.nextMeteor);
  await page.clock.fastForward(120000);
  expect((await state(page)).clock).toBe(canceled.clock);
  await showAbout(page);
  expect((await state(page)).meteor).not.toBeNull();
  await page.clock.runFor(32);
  expect((await state(page)).meteor.displayed).toBe(true);
  await page.evaluate(leave);
  const displayed = await state(page);
  expect(displayed.meteor).toBeNull();
  expect(displayed.meteorPending).toBe(false);
  expect(displayed.nextMeteor - displayed.clock).toBe(54000);
  await showAbout(page);
  expect((await state(page)).meteor).toBeNull();
});

test('resizing preserves first deadlines, pending eligibility, and post-display rests across the breakpoint', async ({ page }) => {
  const initial = await state(page);
  await resizeSky(page, 860, 1000);
  await showAbout(page);
  await page.clock.runFor(100);
  const mobile = await state(page);
  expect(mobile.nextMeteor).toBe(initial.nextMeteor);
  await page.evaluate(scene => window.setMeteorWatchRects([{ x: 0, y: 0, w: scene.width, h: scene.skyBottom }]), mobile);
  await page.clock.fastForward(mobile.nextMeteor - mobile.clock + 1);
  expect((await state(page)).meteorPending).toBe(true);
  await resizeSky(page, 1440, 1000);
  const desktop = await state(page);
  expect(desktop.nextMeteor).toBe(initial.nextMeteor);
  expect(desktop.meteorPending).toBe(false);
  expect(desktop.meteor.mobile).toBe(false);
  await page.clock.runFor(32);
  expect((await state(page)).meteor.displayed).toBe(true);
  await resizeSky(page, 390, 844);
  const rest = await state(page);
  expect(rest.meteor).toBeNull();
  expect(rest.nextMeteor - rest.clock).toBeGreaterThan(53950);
  expect(rest.nextMeteor - rest.clock).toBeLessThanOrEqual(54000);
  const deadline = rest.nextMeteor;
  await resizeSky(page, 861, 1000);
  expect((await state(page)).nextMeteor).toBe(deadline);
});

test('desktop placement failures retain a normal rest rather than mobile pending retries', async ({ page }) => {
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  await page.evaluate(scene => window.setMeteorWatchRects([{ x: 0, y: 0, w: scene.width, h: scene.skyBottom }]), scene);
  await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
  const blocked = await state(page);
  expect(blocked.meteor).toBeNull();
  expect(blocked.meteorPending).toBe(false);
  expect(blocked.nextMeteor - blocked.clock).toBe(54000);
  await page.evaluate(() => {
    window.setMeteorWatchRects([]);
    window.dispatchEvent(new Event('scroll'));
  });
  expect((await state(page)).meteor).toBeNull();
  expect((await state(page)).attempts).toBe(1);
});

test('mobile flights pause without catching up and reduced motion cancels all motion', async ({ page }) => {
  await resizeSky(page, 390, 844);
  await showAbout(page);
  await page.clock.runFor(100);
  const scene = await state(page);
  await page.clock.fastForward(scene.nextMeteor - scene.clock + 1);
  await page.clock.runFor(64);
  const flight = await state(page);
  expect(flight.meteor.displayed).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const paused = await state(page);
  await page.clock.fastForward(120000);
  expect((await state(page)).clock).toBe(paused.clock);
  expect((await state(page)).meteor).toEqual(paused.meteor);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await state(page)).meteor).toEqual(paused.meteor);
  await page.clock.runFor(32);
  expect((await state(page)).clock).toBeGreaterThan(paused.clock);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => {
    await page.clock.runFor(32);
    return (await state(page)).meteor;
  }).toBeNull();
  const reduced = await state(page);
  expect(reduced.meteor).toBeNull();
  expect(reduced.twinkle).toBeNull();
  expect(reduced.animationFrame).toBe(false);
  expect(reduced.timer).toBe(false);
  expect(reduced.nextMeteor - reduced.clock).toBe(54000);
  const staticImage = await sky(page).evaluate(canvas => canvas.toDataURL());
  await page.clock.fastForward(120000);
  expect(await sky(page).evaluate(canvas => canvas.toDataURL())).toBe(staticImage);
});

for (const ratio of [1, 2]) {
  test.describe(`visual samples at ${ratio}x pixel density`, () => {
    test.use({ deviceScaleFactor: ratio });
    test('small, medium, and bright stars have noticeably different painted core areas', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => { window.omitSkyWash = true; });
      for (const width of [1440, 390]) {
        await resizeSky(page, width, 1000);
        const scene = await state(page);
        const points = scene.stars.filter(star => star.shape === 'point' &&
          star.y > scene.skyTop + 300 && star.y < scene.skyBottom - 1000 &&
          scene.stars.every(other => other === star || Math.hypot(other.x - star.x, other.y - star.y) > 16));
        expect(points.length).toBeGreaterThan(3);
        const targets = width <= 860 ? [.72, 1.25, 1.73] : [.75, 1.55, 2.3];
        const painted = [];
        for (const [i, target] of targets.entries()) {
          const star = points.reduce((best, star) =>
            Math.abs(star.radius - target) < Math.abs(best.radius - target) ? star : best);
          expect(Math.abs(star.radius - target)).toBeLessThan(.1);
          await page.evaluate(y => {
            window.scrollTo({ top: y - window.innerHeight / 2, behavior: 'instant' });
            window.dispatchEvent(new Event('scroll'));
          }, star.y);
          await page.clock.runFor(100);
          painted.push(await sky(page).evaluate((canvas, star) => {
            const ratio = canvas.width / document.documentElement.clientWidth;
            const data = canvas.getContext('2d').getImageData(
              Math.floor((star.x - 6) * ratio), Math.floor((star.y - window.scrollY - 6) * ratio),
              12 * ratio, 12 * ratio).data;
            let corePixels = 0;
            let totalAlpha = 0;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] >= 16) corePixels++;
              totalAlpha += data[i];
            }
            return { corePixels, totalAlpha };
          }, star));
          const scrollY = await page.evaluate(() => window.scrollY);
          await page.screenshot({
            path: test.info().outputPath(`size-${width}px-${ratio}x-${i}.png`), animations: 'disabled',
            clip: { x: star.x - 6, y: star.y - scrollY - 6, width: 12, height: 12 },
          });
        }
        expect(painted[0].corePixels).toBeGreaterThan(0);
        expect(painted[1].corePixels).toBeGreaterThan(painted[0].corePixels * 1.5);
        expect(painted[2].corePixels).toBeGreaterThan(painted[1].corePixels * 1.4);
        expect(painted[1].totalAlpha).toBeGreaterThan(painted[0].totalAlpha * 2);
        expect(painted[2].totalAlpha).toBeGreaterThan(painted[1].totalAlpha * 1.5);
      }
    });
    test('desktop and mobile stars retain visible size variety and bounded curved points', async ({ page }) => {
      for (const width of [1440, 390]) {
        await resizeSky(page, width, 1000);
        await showAbout(page);
        await page.clock.runFor(100);
        await page.evaluate(() => { window.omitSkyWash = true; });
        const scene = await state(page);
        const scrollY = await page.evaluate(() => window.scrollY);
        const visible = star => star.y > scrollY + scene.headerHeight + 24 && star.y < scrollY + scene.height - 24;
        const largest = shape => scene.stars.reduce((best, star, i) =>
          star.shape === shape && visible(star) && (best < 0 || star.radius > scene.stars[best].radius) ? i : best, -1);
        const point = largest('point');
        const astroid = largest('astroid');
        expect(point).toBeGreaterThanOrEqual(0);
        expect(astroid).toBeGreaterThanOrEqual(0);
        await page.evaluate(index => window.paintMeteorWatchStar(index, null), point);
        await page.screenshot({ path: test.info().outputPath(`sky-${width}px-${ratio}x-rest.png`), animations: 'disabled' });
        const samples = [];
        for (const [label, index, kind, progress] of [
          ['Light point', point, null, 0], ['Curved astroid', astroid, null, 0],
          ['Breathe', point, 'breathe', .5], ['Shimmer', point, 'shimmer', .3],
          ['Sparkle', point, 'sparkle', .5], ['Returned point', point, 'sparkle', 1],
        ]) {
          const appearance = await page.evaluate(
            ([index, kind, progress]) => window.paintMeteorWatchStar(index, kind, progress), [index, kind, progress]
          );
          expect(appearance.radius).toBeLessThanOrEqual(width <= 860 ? 1.8 : 2.4);
          expect(Math.max(appearance.arm, appearance.haloRadius)).toBeLessThanOrEqual(width <= 860 ? 3.5 : 4.5);
          const image = await sky(page).evaluate((canvas, star) => {
            const ratio = canvas.width / document.documentElement.clientWidth;
            const sample = document.createElement('canvas');
            sample.width = sample.height = 12 * ratio;
            sample.getContext('2d').drawImage(canvas,
              (star.x - 6) * ratio, (star.y - window.scrollY - 6) * ratio,
              12 * ratio, 12 * ratio, 0, 0, 12 * ratio, 12 * ratio);
            return sample.toDataURL();
          }, scene.stars[index]);
          samples.push({ label, image });
        }
        await page.evaluate(async samples => {
          const panel = document.createElement('canvas');
          panel.id = 'star-samples';
          panel.width = 900;
          panel.height = 200;
          panel.style.cssText = 'position:fixed;inset:0;z-index:99999;width:900px;height:200px';
          const ctx = panel.getContext('2d');
          ctx.fillStyle = '#080e1b';
          ctx.fillRect(0, 0, panel.width, panel.height);
          ctx.font = '14px sans-serif';
          ctx.imageSmoothingEnabled = false;
          for (const [i, sample] of samples.entries()) {
            const image = new Image();
            image.src = sample.image;
            await image.decode();
            ctx.drawImage(image, i * 150 + 15, 25, 120, 120);
            ctx.fillStyle = '#b9caeb';
            ctx.fillText(sample.label, i * 150 + 12, 175);
          }
          document.body.append(panel);
        }, samples);
        await page.locator('#star-samples').screenshot({
          path: test.info().outputPath(`star-shapes-${width}px-${ratio}x.png`),
        });
        await page.locator('#star-samples').evaluate(element => element.remove());
      }
    });
  });
}

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
