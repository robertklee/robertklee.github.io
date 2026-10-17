(() => {
  'use strict';

  // Embedded pages keep their host's decorative treatment.
  if (window.self !== window.top) return;
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const header = document.querySelector('.site-header');
  if (!hero || !header) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'meteor-watch-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Meteor watch: Canvas 2D is unavailable; the decorative sky is disabled.');
    return;
  }
  document.body.classList.add('meteor-watch');
  document.body.prepend(canvas);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const between = (min, max) => min + Math.random() * (max - min);
  const twinkleRest = () => between(800, 2000);
  const twinkleGap = () => between(400, 1200);
  const twinkleLimit = () => width <= 860 ? 3 : 5;
  // Slow fades read smoothly at ~30fps, so twinkle-only animation skips every other frame.
  const twinkleFrame = 33;
  const meteorWait = () => between(12000, 36000);
  const meteorRest = () => between(36000, 72000);
  const profiles = {
    breathe: { duration: [3000, 5000], intensity: [.28, .4], growth: [.35, .6] },
    shimmer: { duration: [4000, 6000], intensity: [.24, .36], growth: [.3, .55] },
    sparkle: { duration: [2400, 3600], intensity: [.32, .45], growth: [.9, 1.4] },
  };
  let width = 0;
  let height = 0;
  let headerHeight = 0;
  let skyTop = 0;
  let skyBottom = 0;
  let protectedRects = [];
  let footerRects = [];
  let stars = [];
  let dust = null;
  let twinkles = [];
  let meteor = null;
  let meteorPending = false;
  let clock = 0;
  let lastNow = null;
  let timer = 0;
  let animationFrame = 0;
  let layoutFrame = 0;
  let pageActive = true;
  let nextTwinkle = twinkleRest();
  let nextMeteor = meteorWait();

  const inView = y => y >= window.scrollY + headerHeight + 16 && y <= window.scrollY + height - 24;
  const canRun = () => pageActive && !document.hidden && !reducedMotion.matches &&
    root.dataset.theme === 'dark' && window.scrollY + height > skyTop + 24 && window.scrollY < skyBottom;
  const overlaps = (rect, p) => rect.x < p.x + p.w && rect.x + rect.w > p.x &&
    rect.y < p.y + p.h && rect.y + rect.h > p.y;
  const clearBounds = rect => rect.x >= (width <= 860 ? 0 : 8) &&
    rect.x + rect.w <= width - (width <= 860 ? 0 : 8) &&
    rect.y >= skyTop + 8 && rect.y + rect.h <= skyBottom - 8 &&
    !footerRects.some(p => overlaps(rect, p));
  const clearRect = rect => clearBounds(rect) && !protectedRects.some(p => overlaps(rect, p));
  const trackRect = (flight, fraction = 1) => ({
    x: Math.min(flight.x, flight.x + flight.dx * fraction) - 4,
    y: Math.min(flight.y, flight.y + flight.dy * fraction) - 4,
    w: Math.abs(flight.dx * fraction) + 8, h: Math.abs(flight.dy * fraction) + 8,
  });
  const meteorFits = flight => {
    const full = trackRect(flight);
    return clearBounds(full) && full.y >= window.scrollY + headerHeight + 16 &&
      full.y + full.h <= window.scrollY + height - 24 &&
      clearRect(trackRect(flight, flight.mobile ? .7 : 1));
  };

  function advance() {
    const now = performance.now();
    if (lastNow !== null) clock += now - lastNow;
    lastNow = canRun() ? now : null;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  // Faint background dust is pre-rendered into one tile and filled as a pattern,
  // so hundreds of points cost a single fill per layer per frame. Both parallax
  // layers share the tile; the nearer one is mirrored and shifted to hide repeats.
  const dustLayers = [
    { depth: .35, alpha: .7, mirror: false, shift: 0 },
    { depth: .65, alpha: 1, mirror: true, shift: 211 },
  ];
  function buildDust(mobile, dpr) {
    const key = `${mobile}:${dpr}`;
    if (dust?.key === key) return;
    const tile = document.createElement('canvas');
    const tileWidth = 512;
    const tileHeight = 448;
    tile.width = Math.round(tileWidth * dpr);
    tile.height = Math.round(tileHeight * dpr);
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) {
      dust = { key, pattern: null };
      return;
    }
    tileCtx.scale(dpr, dpr);
    const random = seededRandom(9157);
    for (let i = 0; i < (mobile ? 85 : 100); i++) {
      const x = 1 + random() * (tileWidth - 2);
      const y = 1 + random() * (tileHeight - 2);
      const radius = (.3 + random() ** 3 * .45) * (mobile ? .85 : 1);
      const alpha = .1 + random() ** 2 * .2;
      const tint = random();
      const color = tint < .1 ? '244,217,176' : tint < .25 ? '228,232,244' : tint < .35 ? '166,192,255' : '185,202,235';
      tileCtx.fillStyle = `rgba(${color},${alpha})`;
      tileCtx.beginPath();
      tileCtx.arc(x, y, radius, 0, Math.PI * 2);
      tileCtx.fill();
    }
    dust = { key, dpr, pattern: ctx.createPattern(tile, 'repeat') };
  }

  function drawDust(visibleTop) {
    if (!dust?.pattern) return;
    const top = skyTop - window.scrollY;
    const rest = Math.max(visibleTop, top + 180);
    for (const layer of dustLayers) {
      // Distant layers drift slower than the page; reduced motion pins them to it.
      const depth = reducedMotion.matches ? 1 : layer.depth;
      const offset = Math.round(top * depth * dust.dpr) / dust.dpr;
      dust.pattern.setTransform(new DOMMatrix().translate(layer.shift, offset)
        .scale((layer.mirror ? -1 : 1) / dust.dpr, 1 / dust.dpr));
      ctx.fillStyle = dust.pattern;
      // Match the stars' 180px fade-in below the hero with a few stepped bands.
      for (let band = 0; band < 6; band++) {
        const y = top + band * 30;
        if (y + 30 < visibleTop || y > height) continue;
        ctx.globalAlpha = layer.alpha * (band + .5) / 6;
        ctx.fillRect(0, y, width, 30);
      }
      ctx.globalAlpha = layer.alpha;
      if (rest < height) ctx.fillRect(0, rest, width, height - rest);
    }
    ctx.globalAlpha = 1;
  }

  // The Milky Way is pre-rendered once at quarter resolution, where blur is free,
  // and drifts slower than the dust so it reads as the most distant layer. Its
  // texture spans just enough "sky" to cross the screen diagonally once while
  // the page scrolls from the hero to the footer.
  const bandScale = .25;
  let band = null;
  function bandDepth() {
    if (reducedMotion.matches) return 1;
    return Math.min(.3, Math.max(.08, 2 * height / Math.max(1, skyBottom - skyTop - height)));
  }

  function buildBand() {
    const depth = bandDepth();
    const span = Math.ceil(height * (1 - depth) + (skyBottom - skyTop) * depth);
    const key = `${width}:${span}:${depth}`;
    if (band?.key === key) return;
    const texture = document.createElement('canvas');
    texture.width = Math.ceil(width * bandScale);
    texture.height = Math.ceil(span * bandScale);
    const b = texture.getContext('2d');
    band = { key, depth, span, texture: b ? texture : null };
    if (!b) return;
    b.scale(bandScale, bandScale);
    const random = seededRandom(4271);
    const normal = () => (random() + random() + random() - 1.5) / 1.5;
    const spread = width <= 860 ? 95 : 190;
    const slope = width * 1.2 / span;
    const point = (s, offset) => {
      const u = s / span;
      const x = width * (-.1 + 1.2 * u) + width * .05 * Math.sin(u * Math.PI * 3 + .8);
      const length = Math.hypot(1, slope);
      return [x + offset / length, s - offset * slope / length];
    };
    const blob = (x, y, radius, color, alpha) => {
      const glow = b.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(${color},${alpha})`);
      glow.addColorStop(1, `rgba(${color},0)`);
      b.fillStyle = glow;
      b.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    for (let s = -spread; s < span + spread; s += 48) {
      blob(...point(s, normal() * spread * .15), spread * (1.1 + random() * .4), '91,128,255', .045);
    }
    for (let i = 0; i < span / 9; i++) {
      const s = random() * span;
      const tone = random();
      const color = tone < .5 ? '120,150,255' : tone < .8 ? '150,124,255' : '205,214,255';
      blob(...point(s, normal() * spread * .8), spread * (.12 + random() ** 2 * .35), color, .025 + random() * .045);
    }
    // A warmer, brighter bulge gives the band one focal point instead of a uniform stripe.
    for (let i = 0; i < 24; i++) {
      const s = span * (.56 + normal() * .05);
      blob(...point(s, normal() * spread * .35), spread * (.2 + random() * .35), '244,206,160', .04 + random() * .03);
    }
    b.globalCompositeOperation = 'destination-out';
    for (let s = 0; s < span; s += 14) {
      if (random() < .3) continue;
      blob(...point(s, -spread * .12 + Math.sin(s / 140) * spread * .1 + normal() * spread * .05),
        spread * (.06 + random() * .12), '0,0,0', .25 + random() * .35);
    }
    b.globalCompositeOperation = 'source-over';
    for (let i = 0; i < span * spread / 90; i++) {
      const [x, y] = point(random() * span, normal() * spread * .7);
      b.fillStyle = `rgba(214,222,255,${.05 + random() ** 3 * .25})`;
      b.fillRect(x, y, 1 / bandScale, 1 / bandScale);
    }
  }

  function drawBand(visibleTop) {
    if (!band?.texture) return;
    const top = skyTop - window.scrollY;
    const origin = top * band.depth;
    const paint = (from, to, alpha) => {
      from = Math.max(from, visibleTop);
      to = Math.min(to, height);
      if (to <= from) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(band.texture, 0, (from - origin) * bandScale, band.texture.width, (to - from) * bandScale,
        0, from, width, to - from);
    };
    // Match the stars' and dust's 180px fade-in below the hero.
    for (let step = 0; step < 6; step++) paint(top + step * 30, top + step * 30 + 30, (step + .5) / 6);
    paint(top + 180, height, 1);
    ctx.globalAlpha = 1;
  }

  function measure() {
    advance();
    if (meteor) finishMeteor();
    width = root.clientWidth;
    height = window.innerHeight;
    headerHeight = header.getBoundingClientRect().height;
    skyTop = hero.getBoundingClientRect().bottom + window.scrollY;
    skyBottom = document.body.getBoundingClientRect().top + window.scrollY + document.body.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mobile = width <= 860;
    buildDust(mobile, dpr);
    buildBand();
    const selectors = [
      'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'figure', 'details', 'a', 'button', 'input', 'select',
      '.section-heading', '.cv-about-copy', '.chapter-copy', '.chapter-figure', '.cv-record', '.award-card', '.contact-card',
    ].join(',');
    footerRects = [];
    protectedRects = [...document.querySelectorAll(`main :is(${selectors}), .site-footer`)]
      .filter(element => !hero.contains(element) && element.getClientRects().length)
      .map(element => {
        const r = element.getBoundingClientRect();
        const horizontalPad = mobile ? 4 : 18;
        const bottomPad = mobile ? 8 : 36;
        // Reserve both ends of the existing 28px content-reveal translation.
        const rect = {
          x: r.left - horizontalPad, y: r.top + window.scrollY - 36,
          w: r.width + horizontalPad * 2, h: r.height + 36 + bottomPad,
        };
        if (element.matches('.site-footer')) footerRects.push(rect);
        return rect;
      });
    const random = seededRandom(Math.round(width) + 731);
    const cell = mobile ? 112 : 128;
    const clearance = mobile ? 8 : 16;
    stars = [];
    function addPoint(x, y) {
      const rank = random();
      const alpha = .42 + rank * .3 + random() * .13;
      const tint = random();
      // Rough stellar classes: mostly blue-white, with white, hot blue, yellow, and rare orange-red points.
      const color = tint < .04 ? '255,180,140' : tint < .13 ? '244,217,176' : tint < .3 ? '228,232,244' :
        tint < .45 ? '166,192,255' : '185,202,235';
      // Vary shapes independently without moving the seeded star positions.
      const shapeRandom = seededRandom(Math.floor(random() * 4294967296));
      const tall = shapeRandom() < .35;
      const radius = rank < .58 ? .65 + rank * .7 :
        rank < .9 ? 1.2 + (rank - .58) * 2.1875 : 2.05 + (rank - .9) * 3.5;
      if (clearRect({ x: x - clearance, y: y - clearance, w: clearance * 2, h: clearance * 2 })) {
        stars.push({
          x, y, alpha, color, twinkles: 0, radius: mobile ? .65 + (radius - .65) * .65 : radius,
          shape: 'astroid', halo: rank > .85,
          scaleX: tall ? .68 + shapeRandom() * .18 : 1,
          scaleY: tall ? 1.08 + shapeRandom() * .14 : 1,
          curve: .45 + shapeRandom() * .23,
        });
      }
    }
    let row = 0;
    for (let y = skyTop + 20; y < skyBottom - 20; y += cell) {
      for (let x = 12; x < width - 12; x += cell) {
        addPoint(x + random() * (cell - 24), y + random() * (cell - 24));
      }
      if (mobile) addPoint(row++ % 2 ? width - 8 : 8, y + random() * (cell - 24));
    }
    twinkles = [];
    sync(true);
  }

  function queueMeasure() {
    if (layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      measure();
    });
  }

  function startTwinkle() {
    const visible = stars.filter(star => inView(star.y) && !twinkles.some(active => active.star === star));
    if (!visible.length) return;
    // Give the visible stars balanced turns instead of repeatedly picking one.
    const fewestTwinkles = Math.min(...visible.map(star => star.twinkles));
    const candidates = visible.filter(star => star.twinkles === fewestTwinkles);
    const kind = ['breathe', 'shimmer', 'sparkle'][Math.floor(Math.random() * 3)];
    const profile = profiles[kind];
    const star = candidates[Math.floor(Math.random() * candidates.length)];
    star.twinkles++;
    twinkles.push({
      star, start: clock, kind,
      duration: between(...profile.duration), intensity: between(...profile.intensity),
      growth: between(...profile.growth) * (width <= 860 ? .65 : 1),
    });
  }

  function startMeteor() {
    const mobile = width <= 860;
    const desired = mobile ? between(36, Math.min(220, width * .55)) :
      between(70, Math.min(760, width * .65));
    const angle = between(-.11, .11);
    const rightward = Math.random() < .5;
    // Try shallower full-length tracks before shortening to fit a clear gap.
    const distances = mobile ? [desired, Math.max(28, desired * .65), Math.max(28, desired * .35), 28] :
      [desired, desired * .65, desired * .35, 70];
    for (const distance of distances) {
      for (const tilt of [angle, angle * .25]) {
        const dx = Math.cos(tilt) * distance * (rightward ? 1 : -1);
        const dy = Math.sin(tilt) * distance;
        const w = Math.abs(dx) + 8;
        const h = Math.abs(dy) + 8;
        const candidates = [];
        for (let y = Math.max(skyTop + 16, window.scrollY + headerHeight + 16);
          y <= window.scrollY + height - h - 24; y += 12) {
          for (let x = 12; x <= width - w - 12; x += 32) {
            const flight = {
              x: x + 4 + (dx < 0 ? Math.abs(dx) : 0),
              y: y + 4 + (dy < 0 ? Math.abs(dy) : 0), dx, dy, mobile,
            };
            if (meteorFits(flight)) candidates.push(flight);
          }
        }
        if (!candidates.length) continue;
        const point = candidates[Math.floor(Math.random() * candidates.length)];
        meteor = {
          ...point, distance,
          tail: mobile ? Math.min(64, distance * between(.12, .28)) :
            Math.min(260, distance * between(.18, .45)),
          start: clock, duration: between(800, 1300) + distance * .7,
          displayed: false,
        };
        return true;
      }
    }
    return false;
  }

  function tryMeteor() {
    meteorPending = false;
    if (!startMeteor()) {
      if (width <= 860) meteorPending = true;
      else nextMeteor = clock + meteorRest();
    }
  }

  function finishMeteor() {
    if (meteor.displayed || !meteor.mobile) nextMeteor = clock + meteorRest();
    else meteorPending = true;
    meteor = null;
  }

  function starAppearance(star) {
    const twinkle = twinkles.find(candidate => candidate.star === star);
    const active = Boolean(twinkle);
    const t = active ? Math.min(1, (clock - twinkle.start) / twinkle.duration) : 0;
    const breath = Math.sin(Math.PI * t) ** 2;
    const pulse = !active ? 0 : twinkle.kind === 'sparkle' ? breath ** 2 :
      twinkle.kind === 'shimmer' ? breath * (1 - .8 * breath) * 3.2 : breath;
    const stretch = Math.max(star.scaleX, star.scaleY);
    const arm = Math.min(width <= 860 ? 4.25 : 6,
      (star.radius * 1.55 + pulse * (active ? twinkle.growth : 0)) * stretch);
    return {
      radius: star.radius, arm,
      armX: arm * (star.scaleX / stretch), armY: arm * (star.scaleY / stretch), curve: star.curve,
      alpha: Math.min(1, star.alpha + pulse * (active ? twinkle.intensity : 0)),
      haloRadius: star.halo ? Math.max(arm, Math.min(width <= 860 ? 4.5 : 6, star.radius * 2.4)) : 0,
    };
  }

  function traceStar(x, y, armX, armY, curve) {
    const insetX = armX * curve;
    const insetY = armY * curve;
    ctx.beginPath();
    ctx.moveTo(x, y - armY);
    ctx.bezierCurveTo(x, y - insetY, x + insetX, y, x + armX, y);
    ctx.bezierCurveTo(x + insetX, y, x, y + insetY, x, y + armY);
    ctx.bezierCurveTo(x, y + insetY, x - insetX, y, x - armX, y);
    ctx.bezierCurveTo(x - insetX, y, x, y - insetY, x, y - armY);
    ctx.closePath();
  }

  function drawStar(star, y, fade) {
    const { radius, arm, armX, armY, curve, alpha, haloRadius } = starAppearance(star);
    const { color } = star;
    if (haloRadius) {
      const halo = ctx.createRadialGradient(star.x, y, 0, star.x, y, haloRadius);
      // An annular halo softens bright points without double-painting their cores.
      halo.addColorStop(0, `rgba(${color},0)`);
      halo.addColorStop(.45, `rgba(${color},0)`);
      halo.addColorStop(.65, `rgba(${color},${.07 * fade})`);
      halo.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(star.x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);
    }
    const light = ctx.createRadialGradient(star.x, y, 0, star.x, y, arm);
    light.addColorStop(0, `rgba(${color},${alpha * fade})`);
    light.addColorStop(.35 * radius / arm, `rgba(${color},${alpha * fade * .95})`);
    light.addColorStop(.85 * radius / arm, `rgba(${color},${alpha * fade * .75})`);
    light.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = light;
    traceStar(star.x, y, armX, armY, curve);
    ctx.fill();
  }

  function meteorOpacity(flight, t) {
    if (t <= 0 || t >= 1) return 0;
    const end = flight.mobile ? Math.max(0, (t - .7) / .3) : 0;
    return Math.sin(Math.PI * t) * .32 * (1 - end * end * (3 - 2 * end));
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (root.dataset.theme !== 'dark') return;
    ctx.save();
    ctx.beginPath();
    const visibleTop = Math.max(headerHeight, skyTop - window.scrollY);
    ctx.rect(0, visibleTop, width, Math.max(0, Math.min(height, skyBottom - window.scrollY) - visibleTop));
    ctx.clip();
    const wash = ctx.createLinearGradient(0, skyTop - window.scrollY, 0, skyBottom - window.scrollY);
    wash.addColorStop(0, 'rgba(24,40,75,0)');
    wash.addColorStop(.035, 'rgba(24,40,75,.14)');
    wash.addColorStop(1, 'rgba(24,40,75,.03)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    drawBand(visibleTop);
    drawDust(visibleTop);
    stars.forEach(star => {
      if (star.y < window.scrollY + visibleTop - 16 || star.y > window.scrollY + height + 16) return;
      const fade = Math.min(1, Math.max(0, (star.y - skyTop) / 180));
      drawStar(star, star.y - window.scrollY, fade);
    });
    if (meteor) {
      const t = Math.min(1, (clock - meteor.start) / meteor.duration);
      const x = meteor.x + meteor.dx * t;
      const y = meteor.y + meteor.dy * t - window.scrollY;
      const tailFraction = Math.min(meteor.tail / meteor.distance, t);
      const tailX = x - meteor.dx * tailFraction;
      const tailY = y - meteor.dy * tailFraction;
      const trail = ctx.createLinearGradient(tailX, tailY, x, y);
      trail.addColorStop(0, 'rgba(185,202,235,0)');
      const opacity = meteorOpacity(meteor, t);
      trail.addColorStop(1, `rgba(185,202,235,${opacity})`);
      const nx = -meteor.dy / meteor.distance * .5;
      const ny = meteor.dx / meteor.distance * .5;
      ctx.fillStyle = trail;
      // A single fill prevents the trail/head overlap from brightening the head.
      ctx.beginPath();
      ctx.moveTo(tailX - nx, tailY - ny);
      ctx.lineTo(x - nx, y - ny);
      ctx.lineTo(x + nx, y + ny);
      ctx.lineTo(tailX + nx, tailY + ny);
      ctx.closePath();
      ctx.moveTo(x + 1, y);
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
      if (opacity > 0 && canRun()) meteor.displayed = true;
    }
    ctx.restore();
  }

  function schedule() {
    clearTimeout(timer);
    cancelAnimationFrame(animationFrame);
    timer = 0;
    animationFrame = 0;
    if (!canRun()) return;
    if (meteor) {
      animationFrame = requestAnimationFrame(tick);
    } else if (twinkles.length) {
      timer = setTimeout(tick, twinkleFrame);
    } else {
      const deadline = Math.min(nextTwinkle, meteorPending ? Infinity : nextMeteor);
      timer = setTimeout(tick, Math.max(16, deadline - clock));
    }
  }

  function tick() {
    advance();
    if (canRun()) {
      twinkles = twinkles.filter(active => clock < active.start + active.duration);
      if (meteor && clock >= meteor.start + meteor.duration) finishMeteor();
      if (clock >= nextTwinkle) {
        if (twinkles.length < twinkleLimit()) startTwinkle();
        nextTwinkle = clock + twinkleGap();
      }
      if (!meteor && !meteorPending && clock >= nextMeteor) tryMeteor();
    }
    draw();
    schedule();
  }

  function sync(retryPending = false) {
    advance();
    twinkles = reducedMotion.matches ? [] : twinkles.filter(active => inView(active.star.y));
    if (meteor && (reducedMotion.matches || !meteorFits(meteor))) finishMeteor();
    if (retryPending && meteorPending && canRun()) tryMeteor();
    canvas.hidden = root.dataset.theme !== 'dark';
    draw();
    schedule();
  }

  const resizeObserver = new ResizeObserver(queueMeasure);
  [document.body, hero, header].forEach(element => resizeObserver.observe(element));
  document.addEventListener('site:themechange', () => sync());
  document.addEventListener('visibilitychange', () => sync());
  document.addEventListener('toggle', queueMeasure, true);
  reducedMotion.addEventListener('change', () => {
    buildBand();
    sync();
  });
  window.addEventListener('resize', queueMeasure);
  window.addEventListener('scroll', () => sync(true), { passive: true });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    sync();
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    sync();
    queueMeasure();
  });
  document.fonts.ready.then(queueMeasure);
  measure();
})();
