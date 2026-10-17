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
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const between = (min, max) => min + Math.random() * (max - min);
  const twinkleRest = () => between(800, 2000);
  const twinkleGap = () => between(400, 1200);
  const twinkleLimit = () => width <= 860 ? 3 : 5;
  // Slow fades read smoothly at ~30fps, so twinkle-only animation skips every other frame.
  const twinkleFrame = 33;
  const meteorWait = () => between(12000, 36000);
  const meteorRest = () => between(36000, 72000);
  // Lands just after the theme toggle's 500ms circular reveal finishes.
  const welcomeDelay = 650;
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
  let fastTimer = false;
  let animationFrame = 0;
  let layoutFrame = 0;
  let pageActive = true;
  let nextTwinkle = twinkleRest();
  let nextMeteor = meteorWait();
  let welcomeAt = null;
  let wasDark = root.dataset.theme === 'dark';
  let pointer = null;
  const glowing = new Map();
  let glowClock = 0;

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

  // Recognizable schematic patterns, not sky coordinates: [x, y, magnitude, colour?].
  // Edges are listed in tracing order.
  const constellationPatterns = [
    { name: 'Big Dipper', points: [[0, 38, 2], [22, 17, 2], [44, 12, 1], [70, 18, 1], [120, 8, 3], [127, 45, 2], [78, 52, 1]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
    { name: 'Orion', points: [[36, 0, 1], [8, 12, 3, '255,180,140'], [62, 16, 2], [26, 50, 2], [36, 47, 2], [46, 44, 2],
      [14, 90, 2], [68, 86, 3, '166,192,255']],
      edges: [[1, 0], [0, 2], [2, 5], [5, 4], [4, 3], [3, 1], [3, 6], [5, 7]] },
    { name: 'Cygnus', points: [[40, 0, 3, '228,232,244'], [42, 34, 2], [44, 62, 1], [46, 92, 2, '244,217,176'], [8, 24, 1], [76, 46, 2]],
      edges: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]] },
    { name: 'Cassiopeia', points: [[0, 0, 2], [28, 36, 2], [55, 8, 3], [83, 34, 2], [112, 0, 1]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { name: 'Leo', points: [[2, 14, 1], [12, 4, 1], [26, 14, 1], [32, 30, 2, '244,217,176'], [22, 48, 1], [24, 66, 3, '166,192,255'],
      [88, 52, 1], [86, 30, 2], [124, 48, 2]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 7], [7, 3]] },
    { name: 'Lyra', points: [[10, 0, 3, '210,224,255'], [22, 22, 1], [40, 26, 1], [36, 54, 2], [16, 50, 2]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
    { name: 'Crux', points: [[24, 0, 2, '255,180,140'], [20, 66, 3, '166,192,255'], [0, 28, 2], [42, 22, 1], [30, 44, 1]],
      edges: [[0, 1], [2, 3]] },
  ];
  const constellationHold = 2200;
  const constellationFade = 2400;
  const constellationFlash = 900;
  const revealed = new Map();
  let constellations = [];

  function fitConstellation(pattern, y0, y1, nearby, random) {
    const mobile = width <= 860;
    const pad = mobile ? 8 : 24;
    const step = mobile ? 8 : 16;
    for (const scale of mobile ? [.75, .6] : [1.1, .9]) {
      const w = Math.max(...pattern.points.map(([x]) => x)) * scale;
      const h = Math.max(...pattern.points.map(([, y]) => y)) * scale;
      const candidates = [];
      for (let y = y0; y + h <= y1; y += step) {
        for (let x = 12; x + w <= width - 12; x += step) {
          const box = { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
          if (!nearby.some(rect => overlaps(box, rect))) candidates.push([x, y]);
        }
      }
      if (!candidates.length) continue;
      const [x, y] = candidates[Math.floor(random() * candidates.length)];
      const index = constellations.length;
      const points = pattern.points.map(([px, py, magnitude, color = '185,202,235']) => {
        const radius = [1.15, 1.6, 2.2][magnitude - 1];
        return {
          x: x + px * scale, y: y + py * scale, color, constellation: index, arrival: 0,
          radius: mobile ? .65 + (radius - .65) * .65 : radius, alpha: .62 + magnitude * .08,
          halo: magnitude > 1, scaleX: 1, scaleY: 1, curve: .55, twinkles: 0,
        };
      });
      const lengths = pattern.edges.map(([a, b]) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      const duration = Math.min(4200, Math.max(1800, 900 + total * 9));
      let traced = 0;
      pattern.edges.forEach(([a, b], i) => {
        // Each point flashes when the tracing line first touches it.
        if (!points[a].arrival) points[a].arrival = traced / total * duration || 1;
        traced += lengths[i];
        if (!points[b].arrival) points[b].arrival = traced / total * duration;
      });
      return {
        name: pattern.name, edges: pattern.edges, points, lengths, total, duration,
        box: { x, y, w, h }, start: revealed.get(pattern.name) ?? null,
      };
    }
    return null;
  }

  function placeConstellations(random) {
    const top = skyTop + 220;
    const span = Math.max(height * 1.4, (skyBottom - top) / constellationPatterns.length);
    const unused = [...constellationPatterns];
    constellations = [];
    for (let band = top; band < skyBottom - 200 && unused.length; band += span) {
      const last = constellations.at(-1)?.box;
      // Keep roughly one constellation per screen, even across band edges.
      const y0 = Math.max(band, last ? last.y + last.h + height * .8 : band);
      const y1 = Math.min(band + span, skyBottom - 200);
      const nearby = [...protectedRects, ...footerRects].filter(rect => rect.y < y1 + 32 && rect.y + rect.h > y0 - 160);
      // Use the next pattern that fits; smaller ones can fill gaps that larger ones cannot.
      for (const [order, pattern] of unused.entries()) {
        const constellation = fitConstellation(pattern, y0, y1, nearby, random);
        if (!constellation) continue;
        constellations.push(constellation);
        unused.splice(order, 1);
        break;
      }
    }
    const clear = width <= 860 ? 10 : 18;
    stars = stars.filter(star => !constellations.some(({ box }) =>
      overlaps({ x: star.x, y: star.y, w: 0, h: 0 }, { x: box.x - clear, y: box.y - clear, w: box.w + clear * 2, h: box.h + clear * 2 })));
  }

  const constellationAge = constellation => constellation.start === null ? -1 : clock - constellation.start;
  const constellationAnimating = constellation => !reducedMotion.matches && constellationAge(constellation) >= 0 &&
    constellationAge(constellation) < constellation.duration + constellationHold + constellationFade + constellationFlash;

  function revealConstellations() {
    if (!canRun()) return;
    for (const constellation of constellations) {
      const { box } = constellation;
      if (constellation.start !== null || box.y < window.scrollY + headerHeight + 24 ||
        box.y + box.h > window.scrollY + height - 60) continue;
      constellation.start = clock;
      revealed.set(constellation.name, clock);
    }
  }

  function constellationFlashOf(star) {
    const constellation = constellations[star.constellation];
    if (!constellation || reducedMotion.matches) return 0;
    const t = (constellationAge(constellation) - star.arrival) / constellationFlash;
    return t < 0 || t > 1 || constellationAge(constellation) < 0 ? 0 : Math.sin(Math.PI * t) ** 2;
  }

  function drawConstellations() {
    const mobile = width <= 860;
    for (const constellation of constellations) {
      const { box, points, edges, lengths, total, duration } = constellation;
      if (box.y + box.h < window.scrollY - 20 || box.y > window.scrollY + height + 20) continue;
      const age = reducedMotion.matches ? Infinity : constellationAge(constellation);
      if (age > 0) {
        const fading = Math.min(1, Math.max(0, (age - duration - constellationHold) / constellationFade));
        const alpha = .38 - .24 * fading * fading * (3 - 2 * fading);
        let remaining = total * Math.min(1, age / duration);
        ctx.strokeStyle = `rgba(185,202,235,${alpha})`;
        ctx.lineWidth = mobile ? .7 : .85;
        ctx.lineCap = 'round';
        ctx.beginPath();
        edges.forEach(([a, b], i) => {
          if (remaining <= 0) return;
          const from = points[a];
          const to = points[b];
          const length = lengths[i];
          // Leave a small gap at each star so lines read as joins, not strokes through cores.
          const gap = Math.min(length / 3, mobile ? 3 : 4.5);
          const reach = Math.min(length - gap, remaining);
          remaining -= length;
          if (reach <= gap) return;
          const ux = (to.x - from.x) / length;
          const uy = (to.y - from.y) / length;
          ctx.moveTo(from.x + ux * gap, from.y - window.scrollY + uy * gap);
          ctx.lineTo(from.x + ux * reach, from.y - window.scrollY + uy * reach);
        });
        ctx.stroke();
      }
      points.forEach(star => drawStar(star, star.y - window.scrollY, 1));
    }
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
    glowing.clear();
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
    placeConstellations(seededRandom(Math.round(width) + 97));
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

  // Occasional showers add a few shorter, near-parallel streaks beside the main meteor.
  function addCompanions(primary) {
    const count = primary.mobile ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
    const ux = primary.dx / primary.distance;
    const uy = primary.dy / primary.distance;
    const lanes = [0];
    primary.companions = [];
    for (let i = 0; i < count; i++) {
      const delay = 120 + i * 200 + between(0, 100);
      const duration = Math.min(between(600, 900) + primary.distance * .35, primary.duration - delay);
      if (duration < 350) break;
      const tilt = between(-.01, .01);
      const dirX = ux * Math.cos(tilt) - uy * Math.sin(tilt);
      const dirY = ux * Math.sin(tilt) + uy * Math.cos(tilt);
      const distance = primary.distance * between(.45, .75);
      const preferred = i % 2 ? -1 : 1;
      const offsets = [preferred, -preferred].flatMap(side => [between(26, 60), 18, 52, 86].map(gap => gap * side))
        .filter(offset => lanes.every(lane => Math.abs(offset - lane) >= 18));
      const shifts = [primary.distance * between(-.15, .3), 0];
      const flight = offsets.flatMap(offset => shifts.map(along => ({
        x: primary.x + ux * along - uy * offset, y: primary.y + uy * along + ux * offset, offset,
        dx: dirX * distance, dy: dirY * distance, distance, mobile: primary.mobile,
        tail: primary.tail * distance / primary.distance, start: primary.start + delay, duration,
      }))).find(meteorFits);
      if (!flight) continue;
      lanes.push(flight.offset);
      primary.companions.push(flight);
    }
  }

  function startMeteor(shower = false) {
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
          displayed: false, companions: [],
        };
        if (shower || Math.random() < .25) addCompanions(meteor);
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

  const glowRadius = 150;
  function glowTarget(star) {
    if (!pointer) return 0;
    const reach = 1 - Math.hypot(star.x - pointer.x, star.y - window.scrollY - pointer.y) / glowRadius;
    return reach > 0 ? reach * reach : 0;
  }

  function nearPointer() {
    if (!pointer) return [];
    const y = pointer.y + window.scrollY;
    return [...stars, ...constellations.flatMap(({ points }) => points)]
      .filter(star => Math.abs(star.y - y) < glowRadius && Math.abs(star.x - pointer.x) < glowRadius);
  }

  function updateGlow() {
    if (!canRun()) {
      glowing.clear();
      return;
    }
    // Ease with the animation clock so the glow follows the cursor softly at any frame rate.
    const ease = 1 - Math.exp(-Math.min(100, glowing.size ? clock - glowClock : twinkleFrame) / 220);
    glowClock = clock;
    nearPointer().forEach(star => {
      if (!glowing.has(star) && glowTarget(star) > 0) glowing.set(star, 0);
    });
    glowing.forEach((value, star) => {
      const target = glowTarget(star);
      const next = value + (target - value) * ease;
      if (target === 0 && next < .005) glowing.delete(star);
      else glowing.set(star, next);
    });
  }

  function starAppearance(star) {
    const twinkle = twinkles.find(candidate => candidate.star === star);
    const active = Boolean(twinkle);
    const t = active ? Math.min(1, (clock - twinkle.start) / twinkle.duration) : 0;
    const breath = Math.sin(Math.PI * t) ** 2;
    const pulse = !active ? 0 : twinkle.kind === 'sparkle' ? breath ** 2 :
      twinkle.kind === 'shimmer' ? breath * (1 - .8 * breath) * 3.2 : breath;
    const flash = star.constellation === undefined ? 0 : constellationFlashOf(star);
    const glow = glowing.get(star) || 0;
    const stretch = Math.max(star.scaleX, star.scaleY);
    const arm = Math.min(width <= 860 ? 4.25 : 6,
      (star.radius * 1.55 + pulse * (active ? twinkle.growth : 0) + flash * 1.2 + glow * 1.5) * stretch);
    return {
      radius: star.radius, arm,
      armX: arm * (star.scaleX / stretch), armY: arm * (star.scaleY / stretch), curve: star.curve,
      alpha: Math.min(1, star.alpha + pulse * (active ? twinkle.intensity : 0) + flash * .3 + glow * .4),
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

  function drawMeteor(flight, strength) {
    const t = (clock - flight.start) / flight.duration;
    const opacity = meteorOpacity(flight, Math.min(1, t)) * strength;
    if (opacity <= 0) return 0;
    const x = flight.x + flight.dx * t;
    const y = flight.y + flight.dy * t - window.scrollY;
    const tailFraction = Math.min(flight.tail / flight.distance, t);
    const tailX = x - flight.dx * tailFraction;
    const tailY = y - flight.dy * tailFraction;
    const trail = ctx.createLinearGradient(tailX, tailY, x, y);
    trail.addColorStop(0, 'rgba(185,202,235,0)');
    trail.addColorStop(1, `rgba(185,202,235,${opacity})`);
    const nx = -flight.dy / flight.distance * .5;
    const ny = flight.dx / flight.distance * .5;
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
    return opacity;
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
    drawDust(visibleTop);
    stars.forEach(star => {
      if (star.y < window.scrollY + visibleTop - 16 || star.y > window.scrollY + height + 16) return;
      const fade = Math.min(1, Math.max(0, (star.y - skyTop) / 180));
      drawStar(star, star.y - window.scrollY, fade);
    });
    drawConstellations();
    if (meteor) {
      meteor.companions.forEach(flight => drawMeteor(flight, .85));
      if (drawMeteor(meteor, 1) > 0 && canRun()) meteor.displayed = true;
    }
    ctx.restore();
  }

  function schedule() {
    clearTimeout(timer);
    cancelAnimationFrame(animationFrame);
    timer = 0;
    fastTimer = false;
    animationFrame = 0;
    if (!canRun()) return;
    if (meteor) {
      animationFrame = requestAnimationFrame(tick);
    } else if (twinkles.length || glowing.size || constellations.some(constellationAnimating)) {
      fastTimer = true;
      timer = setTimeout(tick, twinkleFrame);
    } else {
      const deadline = Math.min(nextTwinkle, meteorPending ? Infinity : nextMeteor, welcomeAt ?? Infinity);
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
      if (welcomeAt !== null && clock >= welcomeAt) {
        welcomeAt = null;
        // Greet a switch to dark mode with a shower; if no route is clear, the normal schedule continues.
        if (!meteor && startMeteor(true)) meteorPending = false;
      }
      if (!meteor && !meteorPending && clock >= nextMeteor) tryMeteor();
      revealConstellations();
    }
    updateGlow();
    draw();
    schedule();
  }

  function sync(retryPending = false) {
    advance();
    twinkles = reducedMotion.matches ? [] : twinkles.filter(active => inView(active.star.y));
    if (meteor && (reducedMotion.matches || !meteorFits(meteor))) finishMeteor();
    if (meteor) meteor.companions = meteor.companions.filter(meteorFits);
    if (!canRun()) welcomeAt = null;
    if (retryPending && meteorPending && canRun()) tryMeteor();
    revealConstellations();
    updateGlow();
    canvas.hidden = root.dataset.theme !== 'dark';
    draw();
    schedule();
  }

  const resizeObserver = new ResizeObserver(queueMeasure);
  [document.body, hero, header].forEach(element => resizeObserver.observe(element));
  document.addEventListener('site:themechange', () => {
    const dark = root.dataset.theme === 'dark';
    if (dark && !wasDark) welcomeAt = clock + welcomeDelay;
    wasDark = dark;
    sync();
  });
  document.addEventListener('visibilitychange', () => sync());
  document.addEventListener('toggle', queueMeasure, true);
  reducedMotion.addEventListener('change', () => sync());
  window.addEventListener('resize', queueMeasure);
  window.addEventListener('scroll', () => sync(true), { passive: true });
  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    pointer = event.clientY > headerHeight ? { x: event.clientX, y: event.clientY } : null;
    // Running frames pick up the new position; otherwise wake only when a star needs to respond.
    if (!canRun() || animationFrame || fastTimer || (!glowing.size && !nearPointer().some(glowTarget))) return;
    tick();
  }, { passive: true });
  window.addEventListener('pointerout', event => {
    if (event.relatedTarget || !pointer) return;
    pointer = null;
    if (canRun() && !animationFrame && !fastTimer) tick();
  });
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
