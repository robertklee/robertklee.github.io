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
  const twinkleRest = () => between(2000, 5000);
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
  let stars = [];
  let twinkle = null;
  let meteor = null;
  let clock = 0;
  let lastNow = null;
  let timer = 0;
  let animationFrame = 0;
  let layoutFrame = 0;
  let pageActive = true;
  let nextTwinkle = twinkleRest();
  let nextMeteor = between(15000, 45000);

  const inView = y => y >= window.scrollY + headerHeight + 16 && y <= window.scrollY + height - 24;
  const canRun = () => pageActive && !document.hidden && !reducedMotion.matches &&
    root.dataset.theme === 'dark' && window.scrollY + height > skyTop + 24 && window.scrollY < skyBottom;
  const clearRect = rect => rect.x >= (width <= 860 ? 0 : 8) &&
    rect.x + rect.w <= width - (width <= 860 ? 0 : 8) &&
    rect.y >= skyTop + 8 && rect.y + rect.h <= skyBottom - 8 &&
    !protectedRects.some(p => rect.x < p.x + p.w && rect.x + rect.w > p.x &&
      rect.y < p.y + p.h && rect.y + rect.h > p.y);

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
    const wasDesktop = width > 860;
    width = root.clientWidth;
    height = window.innerHeight;
    headerHeight = header.getBoundingClientRect().height;
    skyTop = hero.getBoundingClientRect().bottom + window.scrollY;
    skyBottom = document.body.getBoundingClientRect().top + window.scrollY + document.body.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!wasDesktop && width > 860) nextMeteor = clock + between(15000, 45000);
    const mobile = width <= 860;
    const selectors = [
      'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'figure', 'details', 'a', 'button', 'input', 'select',
      '.section-heading', '.cv-about-copy', '.chapter-copy', '.chapter-figure', '.cv-record', '.award-card', '.contact-card',
    ].join(',');
    protectedRects = [...document.querySelectorAll(`main :is(${selectors}), .site-footer`)]
      .filter(element => !hero.contains(element) && element.getClientRects().length)
      .map(element => {
        const r = element.getBoundingClientRect();
        const horizontalPad = mobile ? 4 : 18;
        const bottomPad = mobile ? 8 : 36;
        // Reserve both ends of the existing 28px content-reveal translation.
        return {
          x: r.left - horizontalPad, y: r.top + window.scrollY - 36,
          w: r.width + horizontalPad * 2, h: r.height + 36 + bottomPad,
        };
      });
    const random = seededRandom(Math.round(width) + 731);
    const cell = mobile ? 112 : 128;
    const clearance = mobile ? 8 : 16;
    stars = [];
    function addPoint(x, y) {
      const rank = random();
      const alpha = .18 + random() * .2;
      const warm = random() < .12;
      const shapeRank = random();
      const radius = rank < .7 ? .45 + rank * .8 :
        rank < .94 ? 1.15 + (rank - .7) * 2.5 : 2.1 + (rank - .94) * 10;
      if (clearRect({ x: x - clearance, y: y - clearance, w: clearance * 2, h: clearance * 2 })) {
        stars.push({
          x, y, alpha, warm, twinkles: 0, radius: radius * (mobile ? .65 : 1),
          shape: shapeRank < .82 ? 'dots' : shapeRank < .92 ? 'diamonds' : 'glints',
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
    meteor = null;
    sync();
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
    const desired = between(70, Math.min(760, width * .65));
    const angle = between(-.11, .11);
    const rightward = Math.random() < .5;
    // Try shallower full-length tracks before shortening to fit a clear gap.
    for (const distance of [desired, desired * .65, desired * .35, 70]) {
      for (const tilt of [angle, angle * .25]) {
        const dx = Math.cos(tilt) * distance * (rightward ? 1 : -1);
        const dy = Math.sin(tilt) * distance;
        const w = Math.abs(dx) + 8;
        const h = Math.abs(dy) + 8;
        const candidates = [];
        for (let y = Math.max(skyTop + 16, window.scrollY + headerHeight + 16);
          y <= window.scrollY + height - h - 24; y += 12) {
          for (let x = 12; x <= width - w - 12; x += 32) {
            if (clearRect({ x, y, w, h })) candidates.push({ x, y });
          }
        }
        if (!candidates.length) continue;
        const point = candidates[Math.floor(Math.random() * candidates.length)];
        meteor = {
          x: point.x + 4 + (dx < 0 ? Math.abs(dx) : 0),
          y: point.y + 4 + (dy < 0 ? Math.abs(dy) : 0),
          dx, dy, distance, tail: Math.min(260, distance * between(.18, .45)),
          start: clock, duration: between(800, 1300) + distance * .7,
        };
        return;
      }
    }
  }

  function drawStar(x, y, radius, alpha, shape, warm) {
    ctx.fillStyle = warm ? `rgba(244,217,176,${alpha})` : `rgba(185,202,235,${alpha})`;
    ctx.beginPath();
    if (shape === 'diamonds') {
      ctx.moveTo(x, y - radius * 1.5);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius * 1.5);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
    } else if (shape === 'glints') {
      const arm = radius * 2.5;
      const waist = radius * .3;
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x + waist, y - waist);
      ctx.lineTo(x + arm * .75, y);
      ctx.lineTo(x + waist, y + waist);
      ctx.lineTo(x, y + arm);
      ctx.lineTo(x - waist, y + waist);
      ctx.lineTo(x - arm * .75, y);
      ctx.lineTo(x - waist, y - waist);
      ctx.closePath();
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
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
      const t = twinkle?.star === star ? Math.min(1, (clock - twinkle.start) / twinkle.duration) : 0;
      const breath = Math.sin(Math.PI * t) ** 2;
      const pulse = twinkle?.kind === 'sparkle' ? breath ** 2 :
        twinkle?.kind === 'shimmer' ? breath * (1 - .8 * breath) * 3.2 : breath;
      const radius = star.radius + pulse * (twinkle?.growth || 0);
      if (pulse && twinkle.kind === 'sparkle') {
        const halo = ctx.createRadialGradient(star.x, star.y - window.scrollY, 0, star.x, star.y - window.scrollY, radius * 3.2);
        halo.addColorStop(0, `rgba(185,202,235,${pulse * fade * .035})`);
        halo.addColorStop(1, 'rgba(185,202,235,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(star.x - 16, star.y - window.scrollY - 16, 32, 32);
      }
      drawStar(star.x, star.y - window.scrollY, radius,
        Math.min(.52, star.alpha + pulse * (twinkle?.intensity || 0)) * fade, star.shape, star.warm);
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
      trail.addColorStop(1, `rgba(185,202,235,${Math.sin(Math.PI * t) * .32})`);
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
      const deadline = width > 860 ? Math.min(nextTwinkle, nextMeteor) : nextTwinkle;
      timer = setTimeout(tick, Math.max(16, deadline - clock));
    }
  }

  function tick() {
    advance();
    if (canRun()) {
      if (twinkle && clock >= twinkle.start + twinkle.duration) twinkle = null;
      if (meteor && clock >= meteor.start + meteor.duration) meteor = null;
      if (clock >= nextTwinkle) {
        startTwinkle();
        nextTwinkle = clock + (twinkle?.duration || 0) + twinkleRest();
      }
      if (width > 860 && clock >= nextMeteor) {
        startMeteor();
        nextMeteor = clock + (meteor?.duration || 0) + between(45000, 90000);
      }
    }
    draw();
    schedule();
  }

  function sync() {
    advance();
    if (reducedMotion.matches || (twinkle && !inView(twinkle.star.y))) twinkle = null;
    if (reducedMotion.matches || width <= 860 || (meteor && !inView(meteor.y))) meteor = null;
    canvas.hidden = root.dataset.theme !== 'dark';
    draw();
    schedule();
  }

  const resizeObserver = new ResizeObserver(queueMeasure);
  [document.body, hero, header].forEach(element => resizeObserver.observe(element));
  document.addEventListener('site:themechange', sync);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('toggle', queueMeasure, true);
  reducedMotion.addEventListener('change', sync);
  window.addEventListener('resize', queueMeasure);
  window.addEventListener('scroll', sync, { passive: true });
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
