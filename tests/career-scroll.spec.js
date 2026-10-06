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

test('a subtle curve sweep culminates in only the current marker shimmering across themes and layouts', async ({ page }) => {
  const marker = page.locator('.cm-step-now .cm-node');
  await marker.scrollIntoViewIfNeeded();
  await expect(page.locator('.cm-plot')).toHaveClass(/is-flowing/);
  const starts = await page.locator('.cm-plot').evaluate(async plot => {
    const animations = plot.getAnimations({ subtree: true }).filter(animation =>
      ['cm-curve-flow', 'cm-current-shimmer'].includes(animation.animationName)
    );
    await Promise.all(animations.map(animation => animation.ready));
    return animations.map(animation => animation.startTime);
  });
  expect(starts).toHaveLength(3);
  expect(starts[0]).not.toBeNull();
  expect(starts.every(start => start === starts[0])).toBe(true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await marker.scrollIntoViewIfNeeded();
      await expect(page.locator('.cm-plot')).toHaveClass(/is-flowing/);
      const flow = page.locator('.cm-curve-desktop .cm-curve-flow:visible, .cm-curve-mobile .cm-curve-flow:visible');
      const sweep = await flow.evaluate(path => {
        const animation = path.getAnimations().find(animation => animation.animationName === 'cm-curve-flow');
        if (!animation) throw new Error('Missing career curve sweep');
        animation.pause();
        const color = document.createElement('span');
        color.style.color = 'color-mix(in srgb, var(--accent) 35%, white)';
        document.body.append(color);
        const expectedStroke = getComputedStyle(color).color;
        color.remove();
        const length = parseFloat(path.style.getPropertyValue('--curve-length'));
        const samples = [0, 6000, 7200, 8400, 9000, 10200, 11400].map(time => {
          animation.currentTime = time;
          const style = getComputedStyle(path);
          return { opacity: Number(style.opacity), offset: parseFloat(style.strokeDashoffset) / length };
        });
        return {
          duration: animation.effect.getTiming().duration,
          iterations: animation.effect.getTiming().iterations,
          matchesCurve: path.getAttribute('d') === path.previousElementSibling.getAttribute('d'),
          dashLength: parseFloat(getComputedStyle(path).strokeDasharray) / length,
          strokeWidth: parseFloat(getComputedStyle(path).strokeWidth),
          stroke: getComputedStyle(path).stroke,
          expectedStroke,
          filter: getComputedStyle(path).filter,
          curveFilter: getComputedStyle(path.previousElementSibling).filter,
          pointerEvents: getComputedStyle(path).pointerEvents,
          samples,
        };
      });
      expect(sweep.duration).toBe(12000);
      expect(sweep.iterations).toBe(Infinity);
      expect(sweep.matchesCurve).toBe(true);
      expect(sweep.dashLength).toBeCloseTo(.08, 5);
      expect(sweep.strokeWidth).toBe(2.5);
      expect(sweep.stroke).toBe(sweep.expectedStroke);
      expect(sweep.filter).toContain('blur(1px)');
      expect(sweep.filter).toContain('drop-shadow(');
      expect(sweep.filter).toContain('2px');
      expect(sweep.curveFilter).toBe('none');
      expect(sweep.pointerEvents).toBe('none');
      for (const [index, opacity] of [0, 0, .45, .45, 0, 0, 0].entries()) {
        expect(sweep.samples[index].opacity).toBeCloseTo(opacity, 5);
      }
      for (const [index, offset] of [.08, .08, -.352, -.784, -1, -1, -1].entries()) {
        expect(sweep.samples[index].offset).toBeCloseTo(offset, 5);
      }
      const shimmer = await marker.evaluate(node => {
        const animation = node.getAnimations({ subtree: true }).find(animation => animation.animationName === 'cm-current-shimmer');
        if (!animation) throw new Error('Missing current-role shimmer');
        animation.pause();
        const samples = [0, 9000, 10200, 11400, 11900].map(time => {
          animation.currentTime = time;
          const style = getComputedStyle(node, '::after');
          return { opacity: Number(style.opacity), position: style.backgroundPositionX };
        });
        const style = getComputedStyle(node, '::after');
        return {
          duration: animation.effect.getTiming().duration,
          iterations: animation.effect.getTiming().iterations,
          pointerEvents: style.pointerEvents,
          sheenWidth: parseFloat(style.width),
          samples,
        };
      });
      expect(shimmer.duration).toBe(sweep.duration);
      expect(shimmer.iterations).toBe(Infinity);
      expect(shimmer.pointerEvents).toBe('none');
      expect(shimmer.sheenWidth).toBe(width === 390 ? 12 : 14);
      for (const [index, opacity] of [0, 0, .45, 0, 0].entries()) {
        expect(shimmer.samples[index].opacity).toBeCloseTo(opacity, 5);
      }
      expect(shimmer.samples[1].position).toBe('100%');
      expect(shimmer.samples[2].position).toBe('50%');
      expect(shimmer.samples[3].position).toBe('0%');
      await expect.poll(() => marker.evaluate(node => node.getBoundingClientRect().width)).toBe(width === 390 ? 16 : 18);
      expect(await page.locator('.cm-step:not(.cm-step-now) .cm-node').evaluateAll(nodes =>
        nodes.every(node => getComputedStyle(node, '::after').animationName === 'none')
      )).toBe(true);
    }
  }
  for (const media of [{ reducedMotion: 'reduce' }, { reducedMotion: 'no-preference', media: 'print' }]) {
    await page.emulateMedia(media);
    expect(await marker.evaluate(node => {
      const style = getComputedStyle(node, '::after');
      return { animation: style.animationName, opacity: style.opacity };
    })).toEqual({ animation: 'none', opacity: '0' });
    expect(await page.locator('.cm-curve-flow').evaluateAll(paths =>
      paths.every(path => getComputedStyle(path).animationName === 'none' && getComputedStyle(path).opacity === '0')
    )).toBe(true);
  }
});

test('the periodic curve sweep stops offscreen and in hidden tabs, and restarts after reduced motion', async ({ page }) => {
  const plot = page.locator('.cm-plot');
  await expect(plot).not.toHaveClass(/is-flowing/);
  await showCurve(page);
  await expect(plot).toHaveClass(/is-flowing/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(plot).not.toHaveClass(/is-flowing/);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(plot).toHaveClass(/is-flowing/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(plot).not.toHaveClass(/is-flowing/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(plot).toHaveClass(/is-flowing/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(plot).not.toHaveClass(/is-flowing/);
  await expect(page.locator('.cm-curve-flow')).toHaveCount(2);
});

test('editorial glow is reserved for three achievements across themes and layouts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const accents = page.locator('.card-accent');
  await expect(accents).toHaveCount(3);
  await expect(accents.locator('.cv-record-title, h3')).toHaveText([
    'Senior Software Engineer, Microsoft Azure AI Search',
    "Founder & Program Director, Senior's Digital Literacy Program, University of Victoria",
    'Schulich Leader Scholarship',
  ]);
  await expect(page.locator('#profile-work-entry-2').locator('..')).not.toHaveClass(/card-accent/);
  await expect(page.locator('.chapter-figure.card-accent')).toHaveCount(0);

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const styles = await accents.evaluateAll(cards => cards.map(card => {
        const style = getComputedStyle(card);
        const edge = getComputedStyle(card, '::before');
        const sheen = getComputedStyle(card, '::after');
        return {
          shadow: style.boxShadow,
          background: style.backgroundImage,
          mask: edge.maskComposite,
          gradient: edge.backgroundImage,
          pointerEvents: edge.pointerEvents,
          animation: edge.animationName,
          transition: edge.transitionDuration,
          opacity: edge.opacity,
          sheenAnimation: sheen.animationName,
          sheenOpacity: sheen.opacity,
        };
      }));
      for (const style of styles) {
        expect(style.shadow).not.toBe('none');
        expect(style.mask.split(',').map(value => value.trim())).toEqual(['exclude', 'exclude']);
        expect(style.gradient).toContain('radial-gradient');
        expect(style.pointerEvents).toBe('none');
        expect(style.animation).toBe('none');
        expect(style.transition).toBe('0s');
        expect(Number(style.opacity)).toBeLessThan(1);
        expect(style.sheenAnimation).toBe('none');
        expect(style.sheenOpacity).toBe('0');
      }
      expect(styles[0].background).toContain('linear-gradient');
      expect(styles[1].background).toBe('none');
      expect(styles[2].background).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});

test('amber edge sheen crosses the top and follows the full right edge before resting', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const { width, expanded } of [
      { width: 1440, expanded: false }, { width: 390, expanded: false },
      { width: 1440, expanded: true }, { width: 390, expanded: true },
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.card-accent details').evaluateAll((details, expanded) => {
        details.forEach(details => { details.open = expanded; });
      }, expanded);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const frames = await page.locator('.card-accent').evaluateAll(cards => cards.map(card => {
        const sheen = getComputedStyle(card, '::after');
        const animation = card.getAnimations({ subtree: true }).find(animation => animation.animationName === 'card-accent-sheen');
        if (!animation) throw new Error('Missing card sheen animation');
        animation.pause();
        const coordinate = (position, length) => {
          const percent = position.includes('%') ? Number(position.match(/-?[\d.]+(?:e[+-]?\d+)?(?=%)/)[0]) : 0;
          const pixels = position.match(/[+-]?\s*[\d.]+(?:e[+-]?\d+)?(?=px)/);
          return (length - 160) * percent / 100 + (pixels ? Number(pixels[0].replace(/\s/g, '')) : 0);
        };
        const keyframes = animation.effect.getKeyframes();
        const turn = [keyframes[3], keyframes[7], keyframes[11]];
        const bottom = keyframes[12].offset;
        const positionAt = time => {
          animation.currentTime = time;
          const style = getComputedStyle(card, '::after');
          return {
            x: coordinate(style.backgroundPositionX, card.clientWidth) + 80,
            y: coordinate(style.backgroundPositionY, card.clientHeight) + 80,
          };
        };
        const segments = keyframes.slice(2, 13).map((frame, index) => {
          const previous = keyframes[index + 1];
          const duration = (frame.offset - previous.offset) * 10000;
          const midpoint = (frame.offset + previous.offset) * 5000;
          const before = positionAt(midpoint - duration / 4);
          const after = positionAt(midpoint + duration / 4);
          return {
            speed: Math.hypot(after.x - before.x, after.y - before.y) / (duration / 2),
            midpoint: positionAt(midpoint),
          };
        });
        const samples = [3000, keyframes[2].offset * 10000, turn[0].offset * 10000, 9800, 6500,
          ...turn.map(frame => frame.offset * 10000),
          (turn[2].offset + bottom) / 2 * 10000, 9500,
          turn[0].offset * 10000 - 10, turn[2].offset * 10000 + 10,
          bottom * 10000, (bottom + .95) / 2 * 10000,
        ].map(time => {
          animation.currentTime = time;
          const style = getComputedStyle(card, '::after');
          return {
            opacity: Number(style.opacity),
            position: style.backgroundPosition,
            x: coordinate(style.backgroundPositionX, card.clientWidth) + 80,
            y: coordinate(style.backgroundPositionY, card.clientHeight) + 80,
          };
        });
        return {
          width: card.clientWidth,
          height: card.clientHeight,
          radius: parseFloat(getComputedStyle(card).borderTopRightRadius),
          gradient: sheen.backgroundImage,
          segments,
          easings: keyframes.map(frame => frame.easing),
          duration: animation.effect.getTiming().duration,
          iterations: animation.effect.getTiming().iterations,
          pointerEvents: sheen.pointerEvents,
          mask: sheen.maskComposite,
          edge: getComputedStyle(card, '::before').backgroundImage,
          samples,
        };
      }));
      for (const frame of frames) {
        expect(frame.duration).toBe(10000);
        expect(frame.iterations).toBe(Infinity);
        expect(frame.pointerEvents).toBe('none');
        expect(frame.mask).toContain('exclude');
        expect(frame.gradient).toContain('32px');
        expect(frame.edge).toContain(theme === 'light' ? '224, 138, 30' : '244, 185, 100');
        expect(frame.samples[0].opacity).toBe(0);
        expect(frame.samples[1].opacity).toBeCloseTo(.8);
        expect(frame.samples[2].opacity).toBeCloseTo(.8);
        expect(frame.samples[1].position).not.toBe(frame.samples[2].position);
        expect(frame.samples[3].opacity).toBe(0);
        expect(frame.samples[4].x).toBeCloseTo(-80);
        expect(frame.samples[4].y).toBeCloseTo(0);
        expect(frame.samples[5].opacity).toBeCloseTo(.8);
        expect(frame.samples[5].x).toBeCloseTo(frame.width - frame.radius, 1);
        expect(frame.samples[5].y).toBeCloseTo(0);
        expect(frame.samples[6].x).toBeCloseTo(frame.width - frame.radius * (1 - Math.SQRT1_2), 1);
        expect(frame.samples[6].y).toBeCloseTo(frame.radius * (1 - Math.SQRT1_2), 1);
        expect(frame.samples[7].x).toBeCloseTo(frame.width, 1);
        expect(frame.samples[7].y).toBeCloseTo(frame.radius, 1);
        expect(frame.samples[8].x).toBeCloseTo(frame.width, 1);
        expect(frame.samples[8].y).toBeGreaterThan(frame.radius);
        expect(frame.samples[8].opacity).toBeGreaterThan(0);
        expect(frame.samples[8].opacity).toBeCloseTo(.8);
        expect(frame.samples[9].y).toBeCloseTo(frame.height + 80, 1);
        expect(frame.samples[9].opacity).toBe(0);
        expect(frame.samples[12].y).toBeCloseTo(frame.height, 1);
        expect(frame.samples[12].opacity).toBeCloseTo(.8);
        expect(frame.samples[13].y).toBeGreaterThan(frame.height);
        expect(frame.samples[13].opacity).toBeGreaterThan(0);
        expect(frame.samples[13].opacity).toBeLessThan(.8);
        expect(frame.easings.every(easing => easing === 'linear')).toBe(true);
        const topSpeed = (frame.samples[5].x - frame.samples[10].x) / 10;
        const rightSpeed = (frame.samples[11].y - frame.samples[7].y) / 10;
        for (const segment of frame.segments) {
          expect(Math.abs(segment.speed / topSpeed - 1)).toBeLessThan(.01);
        }
        for (const segment of frame.segments.slice(2, 10)) {
          const distance = Math.hypot(
            segment.midpoint.x - (frame.width - frame.radius),
            segment.midpoint.y - frame.radius,
          );
          expect(Math.abs(distance - frame.radius)).toBeLessThan(.1);
        }
        expect(rightSpeed).toBeCloseTo(topSpeed, 2);
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.card-accent').evaluateAll(cards =>
    cards.every(card => getComputedStyle(card, '::after').animationName === 'none')
  )).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const restored = await page.locator('.card-accent').evaluateAll(cards => cards.map(card => {
    const animation = card.getAnimations({ subtree: true }).find(animation => animation.animationName === 'card-accent-sheen');
    if (!animation) throw new Error('Missing restored card sheen animation');
    const radius = parseFloat(getComputedStyle(card).borderTopRightRadius);
    const top = card.clientWidth - radius + 80;
    const corner = 16 * radius * Math.sin(Math.PI / 32);
    return {
      actual: animation.effect.getKeyframes()[3].offset,
      expected: .65 + .3 * top / (top + corner + card.clientHeight - radius + 80),
    };
  }));
  for (const frame of restored) expect(frame.actual).toBeCloseTo(frame.expected, 5);
});

test('accent glow preserves disclosure interaction, focus, and open-card shadow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const id of ['profile-work-entry-1', 'profile-leadership-entry-3']) {
    const details = page.locator(`#${id}`);
    const summary = details.locator(':scope > summary');
    await summary.focus();
    expect(await details.evaluate(details => getComputedStyle(details.parentElement, '::before').opacity)).toBe('1');
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    const shadow = await details.evaluate(details => getComputedStyle(details.parentElement).boxShadow);
    expect(shadow.split(/,(?![^(]*\))/)).toHaveLength(3);
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
  }
  const awardLink = page.locator('.award-card.card-accent a');
  await awardLink.focus();
  await expect(awardLink).toBeFocused();
  expect(await page.locator('.award-card.card-accent').evaluate(card => getComputedStyle(card, '::before').opacity)).toBe('1');
});

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

    await card.evaluate(element => element.getAnimations({ subtree: true })
      .filter(animation => animation.effect.getTiming().iterations !== Infinity)
      .forEach(animation => animation.finish()));
    await expectComplete(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.locator('.cm-curve').evaluate(curve => curve.getBoundingClientRect().top)).toBeGreaterThan(viewport.height);
    await showCurve(page);
    await expectComplete(page);
    expect(await plot.evaluate(element => element.getAnimations({ subtree: true })
      .filter(animation => animation.effect.getTiming().iterations !== Infinity).length)).toBe(0);
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
