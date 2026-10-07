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
  const meteorWait = () => between(12000, 36000);
  const meteorRest = () => between(36000, 72000);
  const profiles = {
    breathe: { duration: [3000, 5000], intensity: [.14, .22], growth: [.18, .35] },
    shimmer: { duration: [4000, 6000], intensity: [.12, .2], growth: [.15, .3] },
    sparkle: { duration: [2400, 3600], intensity: [.16, .24], growth: [.45, .7] },
  };
  let width = 0;
  let height = 0;
  let headerHeight = 0;
  let skyTop = 0;
  let skyBottom = 0;
  let protectedRects = [];
  let footerRects = [];
  let stars = [];
  let twinkle = null;
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
      const alpha = .18 + rank * .12 + random() * .07;
      const warm = random() < .12;
      // Vary shapes independently without moving the seeded star positions.
      const shapeRandom = seededRandom(Math.floor(random() * 4294967296));
      const tall = shapeRandom() < .35;
      const radius = rank < .58 ? .65 + rank * .7 :
        rank < .9 ? 1.2 + (rank - .58) * 2.1875 : 2.05 + (rank - .9) * 3.5;
      if (clearRect({ x: x - clearance, y: y - clearance, w: clearance * 2, h: clearance * 2 })) {
        stars.push({
          x, y, alpha, warm, twinkles: 0, radius: mobile ? .65 + (radius - .65) * .65 : radius,
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
    twinkle = null;
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
    const visible = stars.filter(star => inView(star.y));
    if (!visible.length) return;
    // Give the visible stars balanced turns instead of repeatedly picking one.
    const fewestTwinkles = Math.min(...visible.map(star => star.twinkles));
    const candidates = visible.filter(star => star.twinkles === fewestTwinkles);
    const kind = ['breathe', 'shimmer', 'sparkle'][Math.floor(Math.random() * 3)];
    const profile = profiles[kind];
    const star = candidates[Math.floor(Math.random() * candidates.length)];
    star.twinkles++;
    twinkle = {
      star, start: clock, kind,
      duration: between(...profile.duration), intensity: between(...profile.intensity),
      growth: between(...profile.growth) * (width <= 860 ? .65 : 1),
    };
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
    const active = twinkle?.star === star;
    const t = active ? Math.min(1, (clock - twinkle.start) / twinkle.duration) : 0;
    const breath = Math.sin(Math.PI * t) ** 2;
    const pulse = !active ? 0 : twinkle.kind === 'sparkle' ? breath ** 2 :
      twinkle.kind === 'shimmer' ? breath * (1 - .8 * breath) * 3.2 : breath;
    const stretch = Math.max(star.scaleX, star.scaleY);
    const arm = Math.min(width <= 860 ? 3.25 : 4.5,
      (star.radius * 1.55 + pulse * (active ? twinkle.growth : 0)) * stretch);
    return {
      radius: star.radius, arm,
      armX: arm * (star.scaleX / stretch), armY: arm * (star.scaleY / stretch), curve: star.curve,
      alpha: Math.min(.52, star.alpha + pulse * (active ? twinkle.intensity : 0)),
      haloRadius: star.halo ? Math.max(arm, Math.min(width <= 860 ? 3.5 : 4.5, star.radius * 1.9)) : 0,
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
    const color = star.warm ? '244,217,176' : '185,202,235';
    if (haloRadius) {
      const halo = ctx.createRadialGradient(star.x, y, 0, star.x, y, haloRadius);
      // An annular halo softens bright points without double-painting their cores.
      halo.addColorStop(0, `rgba(${color},0)`);
      halo.addColorStop(.45, `rgba(${color},0)`);
      halo.addColorStop(.65, `rgba(${color},${.025 * fade})`);
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
    if (twinkle || meteor) {
      animationFrame = requestAnimationFrame(tick);
    } else {
      const deadline = Math.min(nextTwinkle, meteorPending ? Infinity : nextMeteor);
      timer = setTimeout(tick, Math.max(16, deadline - clock));
    }
  }

  function tick() {
    advance();
    if (canRun()) {
      if (twinkle && clock >= twinkle.start + twinkle.duration) twinkle = null;
      if (meteor && clock >= meteor.start + meteor.duration) finishMeteor();
      if (clock >= nextTwinkle) {
        startTwinkle();
        nextTwinkle = clock + (twinkle?.duration || 0) + twinkleRest();
      }
      if (!meteor && !meteorPending && clock >= nextMeteor) tryMeteor();
    }
    draw();
    schedule();
  }

  function sync(retryPending = false) {
    advance();
    if (reducedMotion.matches || (twinkle && !inView(twinkle.star.y))) twinkle = null;
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
  reducedMotion.addEventListener('change', () => sync());
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
