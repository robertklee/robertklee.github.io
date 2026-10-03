// Embedding-field backdrop: an illustrative HNSW index over Robert's work.
//
// The scene is a 3D point cloud seen in perspective. Most of it is a dense,
// generic background graph that recedes out of focus (drawn on two canvases
// that CSS blurs); the seven topic regions sit on the focal plane, sharp and
// labelled. Each chat question (`herochat:query`) runs a visible HNSW search:
// it enters at the sparse top layer deep in the background, makes long jumps
// that arc through depth, descends a layer at a time, and comes into focus as
// it lands on the exact documents the answer draws on. Answers that span
// several regions branch to each (diverse retrieval); off-topic questions end
// on a miss.
// Illustrative only: generated data, not a real index or embedding model.
(() => {
  'use strict';

  const backdrop = document.querySelector('[data-hero-backdrop]');
  if (!backdrop) return;
  const hero = backdrop.parentElement;
  const root = document.documentElement;

  // Depth of field: the far and mid planes render at lower resolution and are
  // blurred in CSS (on the GPU); the near plane, the focal plane, stays sharp.
  const PLANES = [
    { name: 'far', res: 0.5 },
    { name: 'mid', res: 0.75 },
    { name: 'near', res: 1 }
  ].map((plane, i) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'field-canvas field-' + plane.name;
    return Object.assign(plane, { i, canvas, ctx: canvas.getContext && canvas.getContext('2d'), scale: 1 });
  });
  if (PLANES.some(p => !p.ctx)) return;
  PLANES.forEach(p => backdrop.appendChild(p.canvas));
  const [FAR, MID, NEAR] = PLANES;

  // The readout sits above the conversation dim layer, so it lives on the hero.
  const readout = document.createElement('p');
  readout.className = 'field-readout';
  readout.setAttribute('aria-hidden', 'true');
  readout.innerHTML = '<span class="field-readout-dot"></span><span class="field-readout-text"></span>';
  hero.appendChild(readout);
  const readoutText = readout.lastElementChild;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  const CLUSTERS = [
    { id: 'diversity', label: 'Diversity', docs: ['Diversity capability', 'Redundancy reduction', 'Corpus-spanning grounding', 'E-commerce & recs', 'Distributed execution', 'Team of five'] },
    { id: 'agentic', label: 'Agentic retrieval', docs: ['Filter generation', 'Lucene boosts', 'Bounded operator set', 'Production analysis', 'Agent tool calling', 'RAG grounding'] },
    { id: 'performance', label: 'Performance & cost', docs: ['Scalar quantization', 'Binary quantization', 'SIMD distance', 'Workload benchmarks', 'Billing model'] },
    { id: 'engine', label: 'Search engine', docs: ['Vector search 1 to N', 'Subscore fusion', 'Score thresholds', 'HNSW quotas', 'Facet engine', 'Incident response'] },
    { id: 'ml', label: 'Vision & ML', docs: ['Pose estimation', 'Road segmentation', 'Monocular depth', 'Battlesnake RL', 'Chest X-ray app'] },
    { id: 'community', label: 'Community', docs: ['Digital literacy program', 'IEEE workshops', 'Tech & business conference', 'SENG 321 mentor', 'Mentoring engineers'] },
    { id: 'foundations', label: 'Foundations', docs: ['B.Eng, 97% average', 'Schulich Leader', 'YC AI Startup School', 'National champion', 'Research award', 'Design competitions'] }
  ];

  // Answers name the documents they draw on (`docs` in index.js TOPICS); a
  // query that names none lands on DEFAULT_DOCS, and MISS topics find nothing.
  const MISS = new Set(['easter-egg', 'not-found']);
  const DEFAULT_DOCS = ['Diversity capability', 'Filter generation', 'Scalar quantization', 'Pose estimation', 'Digital literacy program'];

  const TOP = 2; // layers L2 (sparse entry layer) .. L0 (every vector)
  const HOLD_MS = 9000;
  const FADE_MS = 1600;
  const FRAME_MS = 1000 / 30;
  const TAU = Math.PI * 2;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let F = 1000; // focal length; the focal plane is z = 0
  let ox = 0;
  let oy = 0;
  let unit = 1;
  let sigma = 24;
  let compact = false; // the chat card spans the hero: no side gutters
  let ui = 1; // stroke and marker scale for small screens
  let nodes = [];
  let edges = [];
  let adj = [];
  let entry = 0;
  let clusterInfo = [];
  let docIndex = new Map(); // document label -> node index
  let protectedRects = [];
  let colors = {};
  let palette = [];
  let query = null;
  let hover = null;
  let visible = true;
  let frame = 0;
  let lastFrame = 0;
  let lastDraw = 0;
  let farDirty = true;
  let farSkip = false;
  const clockStart = performance.now();
  const cam = { cy: 1, sy: 0, cp: 1, sp: 0, px: 0, py: 0, tx: 0, ty: 0, yaw: 0, pitch: 0 };

  // --- Utilities -------------------------------------------------------------
  // Deterministic layout per viewport size so the field doesn't reshuffle.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rand) {
    const u = Math.max(rand(), 1e-6);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
  const easeInOut = t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dist3 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

  function rgba(hex, a) {
    if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
      const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
      const n = parseInt(full.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return hex;
  }

  const STEPS = 40;
  function readColors() {
    const style = getComputedStyle(root);
    const v = name => style.getPropertyValue(name).trim();
    colors = {
      point: v('--art-strong') || '#2e52ce',
      edge: v('--art-fill') || '#8ea6ea',
      accent: v('--accent') || '#2e52ce',
      amber: v('--amber-strong') || '#e08a1e',
      amberText: v('--amber') || '#8f5208',
      faint: v('--faint') || '#656c7e',
      bg: v('--bg') || '#f5f5f0',
      dark: root.dataset.theme === 'dark'
    };
    palette = [colors.edge, colors.point].map(hex => Array.from({ length: STEPS + 1 }, (_, s) => rgba(hex, s / STEPS)));
    farDirty = true;
  }

  // --- Hero copy the field keeps clear of --------------------------------------
  function relRect(el, pad) {
    const b = backdrop.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left - b.left - pad, y: r.top - b.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  }
  function readProtected() {
    const sel = '.hero-eyebrow, .hero-viewport > h1, .hero-tagline, .hero-chat, .scroll-cue, .field-readout';
    protectedRects = [...hero.querySelectorAll(sel)].map(el => {
      const r = relRect(el, 10);
      if (r) r.glass = el.classList.contains('hero-chat');
      return r;
    }).filter(Boolean);
  }
  // The chat grows as it streams, so reserve room for a full answer up front.
  // When the card spans the hero (phones, narrow windows) it grows to nearly
  // the bottom, and the field composes around the copy instead of beside it.
  function layoutProtected() {
    readProtected();
    const chat = hero.querySelector('.hero-chat');
    const r = chat && relRect(chat, 16);
    compact = !!r && Math.min(r.x, width - r.x - r.w) < 90;
    if (!r) return;
    const reserve = compact ? Math.min(420, height - r.y - 40) : Math.min(340, height - r.y - 90);
    protectedRects.push({ x: r.x, y: r.y, w: r.w, h: Math.max(r.h, reserve), glass: true, reserve: true });
  }
  // Distance to the nearest hero copy. `throughGlass` ignores the chat card,
  // whose frosted surface already softens whatever passes behind it.
  function freeDist(x, y, throughGlass) {
    let d = Infinity;
    for (const r of protectedRects) {
      if (throughGlass && r.glass) continue;
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
      const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      d = Math.min(d, Math.hypot(dx, dy));
    }
    return d;
  }
  const insideAny = (x, y) => protectedRects.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  // Inside the card itself (its rect is padded by 10px), not its reserved space.
  const underGlass = (x, y) => compact && protectedRects.some(r => r.glass && !r.reserve && x > r.x + 10 && x < r.x + r.w - 10 && y > r.y + 10 && y < r.y + r.h - 10);
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const viewFade = (x, y) => (compact
    ? clamp(Math.min(x / 18, (width - x) / 18, y / 20, (height - y) / (height * 0.1)), 0, 1)
    : clamp(Math.min(x / 70, (width - x) / 70, y / 60, (height - y) / (height * 0.22)), 0, 1));
  // The search dims where it passes beneath hero copy. On compact screens most
  // of it runs behind the card, so there it stays lit and shows through.
  const clearAt = (x, y, floor) => floor + (1 - floor) * smooth(freeDist(x, y, compact) / 40);

  // --- Camera ----------------------------------------------------------------
  // A slow sway (plus a little pointer parallax) pivots about the focal plane,
  // so the focus regions hold still while the depths behind them slide.
  function setCamera(t, still) {
    if (!still) {
      cam.px += (cam.tx - cam.px) * 0.05;
      cam.py += (cam.ty - cam.py) * 0.05;
    }
    const yaw = still ? 0 : 0.075 * Math.sin(t / 16000) + cam.px;
    const pitch = still ? 0 : 0.04 * Math.sin(t / 23000 + 1.3) + cam.py;
    cam.yaw = yaw;
    cam.pitch = pitch;
    cam.cy = Math.cos(yaw);
    cam.sy = Math.sin(yaw);
    cam.cp = Math.cos(pitch);
    cam.sp = Math.sin(pitch);
  }
  function project(x, y, z, out) {
    const x1 = x * cam.cy - z * cam.sy;
    const z1 = x * cam.sy + z * cam.cy;
    const y1 = y * cam.cp - z1 * cam.sp;
    const z2 = Math.max(y * cam.sp + z1 * cam.cp, -F * 0.6);
    const s = F / (F + z2);
    out.sx = ox + x1 * s;
    out.sy = oy + y1 * s;
    out.s = s;
    out.zz = z2;
    return out;
  }
  const unproject = (sx, sy, z) => ({ x: (sx - ox) * (F + z) / F, y: (sy - oy) * (F + z) / F, z });
  const planeFor = zz => (zz < F * 0.1 ? NEAR : zz < F * 0.75 ? MID : FAR);

  // --- Scene -------------------------------------------------------------------
  function randomAxes(rand) {
    const unitVec = () => {
      const z = rand() * 2 - 1;
      const a = rand() * TAU;
      const r = Math.sqrt(1 - z * z);
      return [r * Math.cos(a), r * Math.sin(a), z];
    };
    const u = unitVec();
    let v = unitVec();
    const d = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    v = [v[0] - d * u[0], v[1] - d * u[1], v[2] - d * u[2]];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    v = v.map(c => c / l);
    return [u, v, [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]];
  }
  function sampleBlob(rand, c, axes, a, b, d) {
    const p = gauss(rand) * a;
    const q = gauss(rand) * b;
    const r = gauss(rand) * d;
    const [u, v, w] = axes;
    return { x: c.x + u[0] * p + v[0] * q + w[0] * r, y: c.y + u[1] * p + v[1] * q + w[1] * r, z: c.z + u[2] * p + v[2] * q + w[2] * r };
  }
  function bezier(a, c, b, t) {
    const m = 1 - t;
    return { x: m * m * a.x + 2 * m * t * c.x + t * t * b.x, y: m * m * a.y + 2 * m * t * c.y + t * t * b.y, z: m * m * a.z + 2 * m * t * c.z + t * t * b.z };
  }

  // Well-separated focus-region centres, inset from the edges and clear of the
  // hero copy where the viewport allows. Compact screens only have thin bands
  // around the copy, so they search those finely and keep regions on screen.
  function pickCentres(rand) {
    const margin = Math.max(28, sigma * 1.8);
    const inset = sigma * 2.4 + 6;
    const box = compact
      ? { l: inset, r: width - inset, t: sigma * 1.8 + 6, b: height - sigma * 1.8 - 6 }
      : { l: Math.max(margin, width * 0.06), r: width - Math.max(margin, width * 0.06), t: Math.max(margin, height * 0.1), b: height - Math.max(margin * 1.6, height * 0.17) };
    const GX = 28;
    const GY = compact ? 48 : 18;
    let candidates = [];
    for (let gx = 0; gx <= GX; gx++) {
      for (let gy = 0; gy <= GY; gy++) {
        const p = { x: box.l + (box.r - box.l) * gx / GX, y: box.t + (box.b - box.t) * gy / GY };
        candidates.push({ p, free: Math.min(freeDist(p.x, p.y), sigma * 3) });
      }
    }
    const roomy = candidates.filter(c => c.free >= sigma * 1.4);
    if (roomy.length >= CLUSTERS.length * 4) candidates = roomy;
    const centres = [];
    for (let c = 0; c < CLUSTERS.length; c++) {
      let best = null;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        const spread = centres.length ? Math.min(...centres.map(q => Math.hypot(q.x - cand.p.x, q.y - cand.p.y))) : 0;
        const score = spread + cand.free * 1.5 + rand() * 8;
        if (score > bestScore) { bestScore = score; best = cand.p; }
      }
      centres.push(best);
    }
    return centres;
  }

  function layout() {
    const box = backdrop.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    PLANES.forEach(p => {
      p.scale = dpr * p.res;
      p.canvas.width = Math.max(1, Math.round(width * p.scale));
      p.canvas.height = Math.max(1, Math.round(height * p.scale));
      p.canvas.style.width = width + 'px';
      p.canvas.style.height = height + 'px';
    });
    farDirty = true;
    layoutProtected();
    F = Math.max(width, height) * 1.15;
    unit = F / 1650;
    ox = width / 2;
    oy = height * 0.46;
    setCamera(0, true);

    const rand = rng(width * 7919 + height * 104729);
    const wide = width >= 900;
    sigma = compact ? clamp(width * 0.032, 11, 22) : Math.max(16, Math.min(40, Math.min(width, height) * 0.042));
    ui = clamp(Math.min(width, height) / 600, 0.75, 1);
    nodes = [];
    const add = (p, cluster) => nodes.push({ x: p.x, y: p.y, z: p.z, cluster, label: '', level: 0 }) - 1;
    const tmp = {};

    // 1. Focus regions on the focal plane: the topics the chat can reference.
    const centres = pickCentres(rand);
    const perCluster = wide ? 13 : compact && width < 600 ? 7 : 9;
    docIndex = new Map();
    clusterInfo = CLUSTERS.map((cluster, ci) => {
      const centre = unproject(centres[ci].x, centres[ci].y, 0);
      const angle = rand() * Math.PI;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const members = [];
      for (let i = 0; i < perCluster; i++) {
        let p = null;
        for (let tries = 0; tries < 24; tries++) {
          const u = gauss(rand) * sigma * 1.2;
          const v = gauss(rand) * sigma * 0.72;
          const q = { x: centre.x + u * ca - v * sa, y: centre.y + u * sa + v * ca, z: gauss(rand) * sigma * 0.8 };
          project(q.x, q.y, q.z, tmp);
          if (tmp.sx < 10 || tmp.sy < 10 || tmp.sx > width - 10 || tmp.sy > height - 10) continue;
          p = q;
          if (!insideAny(tmp.sx, tmp.sy)) break;
        }
        members.push(add(p || centre, ci));
      }
      // Nearest-to-centre points carry the region's document labels.
      const byCentre = members.slice().sort((a, b) => dist3(nodes[a], centre) - dist3(nodes[b], centre));
      byCentre.forEach((idx, j) => {
        nodes[idx].label = cluster.docs[j] || '';
        if (cluster.docs[j]) docIndex.set(cluster.docs[j], idx);
      });
      const radius = Math.sqrt(dist3(nodes[byCentre[Math.floor(byCentre.length * 0.8)]], centre));
      return { id: cluster.id, label: cluster.label, centre, members, hub: byCentre[0], radius, f: 1 };
    });

    // 2. The background: anisotropic groups at every depth, filaments between
    //    neighbouring groups, and unclustered noise, filling the whole frustum.
    const nBg = Math.round(clamp(width * height / 1300, 240, 1050));
    const zMin = F * 0.2;
    const zMax = F * 2.8;
    const depth = () => zMin + (zMax - zMin) * Math.pow(rand(), 0.8);
    const anywhere = z => unproject(-0.06 * width + rand() * width * 1.12, -0.06 * height + rand() * height * 1.12, z);
    const behind = p => { p.z = Math.max(zMin * 0.8, p.z); return p; };
    const groups = [];
    for (let g = 0, n = wide ? 26 : 14; g < n; g++) {
      const size = (0.45 + rand() * 1.25) * unit;
      groups.push({ c: anywhere(depth()), axes: randomAxes(rand), a: 130 * size, b: 60 * size * (0.5 + rand() * 0.7), d: 45 * size * (0.5 + rand() * 0.7), w: 0.25 + rand() * rand() * 2.4 });
    }
    const totalW = groups.reduce((s, g) => s + g.w, 0);
    groups.forEach(g => {
      const count = Math.max(3, Math.round(nBg * 0.64 * g.w / totalW));
      for (let i = 0; i < count; i++) add(behind(sampleBlob(rand, g.c, g.axes, g.a, g.b, g.d)), -1);
    });
    const nFil = wide ? 10 : 5;
    const perFil = Math.round(nBg * 0.2 / nFil);
    for (let f = 0; f < nFil; f++) {
      const a = groups[Math.floor(rand() * groups.length)];
      const b = groups.filter(g => g !== a).sort((g, h) => dist3(g.c, a.c) - dist3(h.c, a.c))[Math.floor(rand() * 2)];
      const ctrl = { x: (a.c.x + b.c.x) / 2 + gauss(rand) * 120 * unit, y: (a.c.y + b.c.y) / 2 + gauss(rand) * 120 * unit, z: (a.c.z + b.c.z) / 2 + gauss(rand) * 120 * unit };
      for (let i = 0; i < perFil; i++) {
        const p = bezier(a.c, ctrl, b.c, rand());
        add(behind({ x: p.x + gauss(rand) * 16 * unit, y: p.y + gauss(rand) * 16 * unit, z: p.z + gauss(rand) * 16 * unit }), -1);
      }
    }
    for (let i = 0, n = Math.round(nBg * 0.12); i < n; i++) add(anywhere(depth()), -1);

    // 3. Tendrils tie each focus region back into the graph behind it.
    const tendril = wide ? 8 : 5;
    const middle = groups.filter(g => g.c.z < F * 1.4);
    clusterInfo.forEach(c => {
      const g = (middle.length ? middle : groups).reduce((best, h) => (dist3(h.c, c.centre) < dist3(best.c, c.centre) ? h : best));
      const ctrl = { x: (c.centre.x + g.c.x) / 2 + gauss(rand) * 90 * unit, y: (c.centre.y + g.c.y) / 2 + gauss(rand) * 90 * unit, z: g.c.z * 0.4 };
      const ids = [];
      for (let i = 0; i < tendril; i++) {
        const p = bezier(c.centre, ctrl, g.c, (i + 0.6 + rand() * 0.6) / (tendril + 1));
        ids.push(add({ x: p.x + gauss(rand) * 10 * unit, y: p.y + gauss(rand) * 10 * unit, z: Math.max(F * 0.14, p.z + gauss(rand) * 10 * unit) }, -1));
      }
      // Midway along the tendril, behind the region: where searches drop to L0.
      c.gate = ids[Math.floor(tendril / 2)];
    });

    nodes.forEach(n => {
      n.phase = rand() * TAU;
      n.amp = (1.5 + rand() * 3) * unit * (n.cluster >= 0 ? 0.8 : 1 + n.z / F);
      n.freq = 0.00016 + rand() * 0.0002;
      n.r = 0.85 + rand() * 0.4;
      n.wx = n.x;
      n.wy = n.y;
    });

    buildGraph(rand);
    projectNodes(0, true);

    if (query) planQuery(query.spec, query.start);
    else setReadout(nodes.length + ' vectors · ' + (TOP + 1) + '-layer HNSW · ' + CLUSTERS.length + ' topics', false);
  }

  // --- HNSW-style graph ----------------------------------------------------------
  function knn(ids, i, C) {
    const best = [];
    const p = nodes[i];
    for (const j of ids) {
      if (j === i) continue;
      const d = dist3(p, nodes[j]);
      if (best.length === C && d >= best[C - 1].d) continue;
      if (best.length < C) best.push(null);
      let k = best.length - 1;
      while (k > 0 && best[k - 1].d > d) { best[k] = best[k - 1]; k--; }
      best[k] = { j, d };
    }
    return best;
  }
  // HNSW's neighbour-selection heuristic: keep a candidate only if it is closer
  // to the node than to every neighbour already kept, so links fan out in
  // different directions and some reach across to neighbouring regions.
  function heuristic(cands, M) {
    const out = [];
    for (const c of cands) {
      if (out.length >= M) break;
      if (out.every(o => dist3(nodes[c.j], nodes[o]) > c.d)) out.push(c.j);
    }
    for (const c of cands) {
      if (out.length >= Math.min(2, cands.length)) break;
      if (!out.includes(c.j)) out.push(c.j);
    }
    return out;
  }
  function buildLayer(ids, C, M) {
    const sets = new Map(ids.map(i => [i, new Set()]));
    const link = (a, b) => { sets.get(a).add(b); sets.get(b).add(a); };
    ids.forEach(i => heuristic(knn(ids, i, C), M).forEach(j => link(i, j)));
    // A minimum spanning tree guarantees one connected component per layer.
    const bestD = new Map();
    const bestTo = new Map();
    ids.slice(1).forEach(i => { bestD.set(i, dist3(nodes[i], nodes[ids[0]])); bestTo.set(i, ids[0]); });
    while (bestD.size) {
      let pick = -1;
      let pd = Infinity;
      bestD.forEach((d, i) => { if (d < pd) { pd = d; pick = i; } });
      link(pick, bestTo.get(pick));
      bestD.delete(pick);
      bestD.forEach((d, i) => {
        const nd = dist3(nodes[i], nodes[pick]);
        if (nd < d) { bestD.set(i, nd); bestTo.set(i, pick); }
      });
    }
    const out = [];
    sets.forEach((s, i) => { out[i] = [...s]; });
    return out;
  }
  function buildGraph(rand) {
    const all = nodes.map((_, i) => i);
    adj = [buildLayer(all, 12, 5)];
    edges = [];
    adj[0].forEach((nb, i) => nb.forEach(j => { if (i < j) edges.push(i, j); }));

    // Upper layers: exponentially fewer nodes with longer links, all in the
    // background. Each region's tendril gateway joins layer 1.
    const mL = 1 / Math.log(14);
    nodes.forEach(n => { n.level = n.cluster >= 0 ? 0 : Math.min(TOP, Math.floor(-Math.log(Math.max(rand(), 1e-9)) * mL)); });
    clusterInfo.forEach(c => { nodes[c.gate].level = Math.max(1, nodes[c.gate].level); });
    const deep = all.filter(i => nodes[i].cluster < 0 && nodes[i].z > F && nodes[i].level < TOP);
    let tops = all.filter(i => nodes[i].level === TOP).length;
    while (tops < 4 && deep.length) { nodes[deep.splice(Math.floor(rand() * deep.length), 1)[0]].level = TOP; tops++; }
    for (let l = 1; l <= TOP; l++) adj[l] = buildLayer(all.filter(i => nodes[i].level >= l), 8, l === TOP ? 3 : 4);
    // The entry point is the deepest top-layer node: every search starts far back.
    entry = all.filter(i => nodes[i].level === TOP).reduce((a, b) => (nodes[b].z > nodes[a].z ? b : a));
  }

  // --- Search ------------------------------------------------------------------
  function greedy(layer, from, target, steps) {
    let cur = from;
    for (let guard = 0; guard < 32; guard++) {
      const nb = adj[layer][cur] || [];
      let best = cur;
      let bestD = dist3(nodes[cur], target);
      for (const j of nb) {
        const d = dist3(nodes[j], target);
        if (d < bestD) { bestD = d; best = j; }
      }
      steps.push({ layer, from: cur, to: best, scan: nb });
      if (best === cur) return cur;
      cur = best;
    }
    return cur;
  }
  // Breadth-first along real links when greedy routing stalls short of the goal.
  function route(layer, from, goal, steps) {
    if (from === goal) return goal;
    const prev = new Map([[from, -1]]);
    const queue = [from];
    for (let h = 0; h < queue.length && !prev.has(goal); h++) {
      for (const j of adj[layer][queue[h]] || []) {
        if (!prev.has(j)) { prev.set(j, queue[h]); queue.push(j); }
      }
    }
    if (!prev.has(goal)) return from;
    const path = [];
    for (let i = goal; i !== -1; i = prev.get(i)) path.unshift(i);
    for (let k = 1; k < path.length; k++) steps.push({ layer, from: path[k - 1], to: path[k], scan: adj[layer][path[k - 1]] });
    return goal;
  }
  function search(target, ci, from, fromLayer) {
    const steps = [];
    let cur = from;
    for (let l = fromLayer; l >= 1; l--) {
      cur = greedy(l, cur, target, steps);
      if (l === 1 && ci != null) cur = route(1, cur, clusterInfo[ci].gate, steps);
      steps.push({ descend: true, at: cur, layer: l - 1 });
    }
    cur = greedy(0, cur, target, steps);
    if (ci != null && nodes[cur].cluster !== ci) {
      cur = route(0, cur, clusterInfo[ci].hub, steps);
      cur = greedy(0, cur, target, steps);
    }
    return { steps, end: cur };
  }
  // Long upper-layer jumps take longer; every hop first scans its neighbours.
  function schedule(steps, start) {
    let t = start;
    for (const st of steps) {
      st.t0 = t;
      if (st.descend) { st.tm = t; st.t1 = t + 220; t = st.t1; continue; }
      st.tm = t + (st.scan.length ? (st.layer ? 130 : 80) : 0);
      if (st.to === st.from) { st.t1 = st.tm; t = st.t1; continue; }
      const a = nodes[st.from];
      const b = nodes[st.to];
      const len = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      st.t1 = st.tm + (st.layer ? clamp(160 + len * 0.42, 220, 460) : clamp(90 + len * 0.5, 120, 240));
      t = st.t1;
    }
    return t;
  }
  const countHops = branches => branches.reduce((n, steps) => n + steps.filter(s => !s.descend && s.to !== s.from).length, 0);

  function emptiestSpot() {
    let best = { x: width * 0.12, y: height * 0.5 };
    let bestScore = -Infinity;
    const focus = nodes.filter(n => n.cluster >= 0);
    for (let gx = 1; gx < 20; gx++) {
      for (let gy = 1; gy < 10; gy++) {
        const p = { x: width * gx / 20, y: height * (0.08 + 0.74 * gy / 10) };
        if (insideAny(p.x, p.y)) continue;
        const near = Math.min(...focus.map(n => Math.hypot(n.sx - p.x, n.sy - p.y)));
        if (near > bestScore) { bestScore = near; best = p; }
      }
    }
    return unproject(best.x, best.y, 0);
  }

  // The answer's documents shape the search. Documents in one region make a
  // k-NN query that lands on exactly them; documents across regions make a
  // diverse retrieval that branches to each one. Off-topic questions miss.
  function resolveDocs(spec) {
    if (MISS.has(spec.topic)) return [];
    const hits = [];
    (spec.docs && spec.docs.length ? spec.docs : DEFAULT_DOCS).forEach(label => {
      const i = docIndex.get(label);
      if (i == null) console.warn('field: unknown document "' + label + '"');
      else if (!hits.includes(i)) hits.push(i);
    });
    return hits;
  }

  function planQuery(spec, start) {
    readProtected();
    const hits = resolveDocs(spec);
    const regions = [...new Set(hits.map(i => nodes[i].cluster))];
    const q = { spec, start, mode: 'miss', branches: [], results: [], target: null, land: 0, focusAt: 0, focus: null };
    if (regions.length === 1) {
      q.mode = 'knn';
      const ci = regions[0];
      const target = { x: 0, y: 0, z: 0 };
      hits.forEach(i => {
        target.x += nodes[i].x / hits.length;
        target.y += nodes[i].y / hits.length;
        target.z += nodes[i].z / hits.length;
      });
      if (hits.length === 1) {
        // A lone document: the query vector sits near it, not on top of it.
        const angle = rng(spec.topic.length * 131 + Math.round(start))() * TAU;
        target.x += Math.cos(angle) * sigma * 0.55;
        target.y += Math.sin(angle) * sigma * 0.55;
      }
      q.target = target;
      const { steps } = search(target, ci, entry, TOP);
      q.land = q.focusAt = schedule(steps, 0);
      q.branches = [steps];
      q.results = hits.slice()
        .sort((a, b) => dist3(nodes[a], target) - dist3(nodes[b], target))
        .map((i, rank) => ({ i, t: q.land + 120 + rank * 90 }));
      q.focus = clusterInfo.map((_, i) => (i === ci ? 1 : 0.3));
      setReadout('HNSW · L' + TOP + '→L0 · ' + countHops(q.branches) + ' hops · k=' + hits.length + ' · ' + clusterInfo[ci].label, true);
    } else if (regions.length > 1) {
      q.mode = 'diverse';
      const centroid = { x: 0, y: 0, z: 0 };
      regions.forEach(ci => {
        centroid.x += clusterInfo[ci].centre.x / regions.length;
        centroid.y += clusterInfo[ci].centre.y / regions.length;
      });
      // One shared descent through the top layer, then a branch per region
      // that lands on its first document and walks L0 to the rest.
      const trunk = [];
      const fork = greedy(TOP, entry, centroid, trunk);
      trunk.push({ descend: true, at: fork, layer: TOP - 1 });
      const forkAt = schedule(trunk, 0);
      q.branches = [trunk];
      regions.forEach((ci, k) => {
        let at = -1;
        let t = forkAt + k * 180;
        hits.filter(i => nodes[i].cluster === ci).forEach(i => {
          let steps = [];
          if (at < 0) {
            const found = search(nodes[i], ci, fork, TOP - 1);
            steps = found.steps;
            at = found.end;
          }
          at = route(0, at, i, steps);
          t = schedule(steps, t) + 120;
          q.branches.push(steps);
          q.results.push({ i, t });
        });
      });
      q.land = Math.max(...q.results.map(r => r.t));
      q.focusAt = Math.min(...q.results.map(r => r.t));
      q.focus = clusterInfo.map((_, i) => (regions.includes(i) ? 1 : 0.3));
      setReadout('Diverse retrieval · ' + q.results.length + ' results across ' + regions.length + ' topics', true);
    } else {
      q.target = emptiestSpot();
      const { steps } = search(q.target, null, entry, TOP);
      q.land = q.focusAt = schedule(steps, 0);
      q.branches = [steps];
      q.focus = clusterInfo.map(() => 0.55);
      setReadout('HNSW · ' + countHops(q.branches) + ' hops · 0 results above threshold', true);
    }
    query = q;
  }

  function setReadout(text, active) {
    readoutText.textContent = text;
    readout.classList.toggle('is-active', active);
  }

  // --- Drawing -----------------------------------------------------------------
  // The background is batched by plane, colour, and quantised alpha so a few
  // thousand links cost a handful of stroke calls.
  const batches = PLANES.map(() => ({ lines: new Map(), dots: new Map() }));
  function batch(map, color, a) {
    const s = Math.round(clamp(a, 0, 1) * STEPS);
    if (!s) return null;
    const key = color * 64 + s;
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    return arr;
  }
  function line(plane, color, a, x1, y1, x2, y2) {
    if (farSkip && plane === FAR) return;
    const arr = batch(batches[plane.i].lines, color, a);
    if (arr) arr.push(x1, y1, x2, y2);
  }
  function dot(plane, color, a, x, y, r) {
    if (farSkip && plane === FAR) return;
    const arr = batch(batches[plane.i].dots, color, a);
    if (arr) arr.push(x, y, r);
  }
  function flush() {
    PLANES.forEach((plane, i) => {
      const ctx = plane.ctx;
      const b = batches[i];
      ctx.lineWidth = plane === FAR ? 1.3 : 1;
      b.lines.forEach((arr, key) => {
        if (!arr.length) return;
        ctx.strokeStyle = palette[key >> 6][key & 63];
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 4) { ctx.moveTo(arr[k], arr[k + 1]); ctx.lineTo(arr[k + 2], arr[k + 3]); }
        ctx.stroke();
        arr.length = 0;
      });
      b.dots.forEach((arr, key) => {
        if (!arr.length) return;
        ctx.fillStyle = palette[key >> 6][key & 63];
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 3) { ctx.moveTo(arr[k] + arr[k + 2], arr[k + 1]); ctx.arc(arr[k], arr[k + 1], arr[k + 2], 0, TAU); }
        ctx.fill();
        arr.length = 0;
      });
    });
  }

  function projectNodes(t, still) {
    for (const n of nodes) {
      n.wx = still ? n.x : n.x + Math.sin(t * n.freq + n.phase) * n.amp;
      n.wy = still ? n.y : n.y + Math.cos(t * n.freq * 0.8 + n.phase) * n.amp;
      project(n.wx, n.wy, n.z, n);
      n.vis = viewFade(n.sx, n.sy) * (0.2 + 0.8 * smooth(freeDist(n.sx, n.sy) / 48));
    }
  }

  // A link is a straight line on layer 0; upper-layer links arc back through
  // depth, so long jumps visibly travel behind the scene.
  const linkA = {};
  const linkB = {};
  function linkPoint(A, B, u, bulge, out) {
    return project(A.wx + (B.wx - A.wx) * u, A.wy + (B.wy - A.wy) * u, A.z + (B.z - A.z) * u + bulge * Math.sin(Math.PI * u), out);
  }
  const bulgeOf = (A, B, layer) => (layer ? Math.sqrt(dist3(A, B)) * 0.3 : 0);
  function strokeLink(A, B, layer, from, to, color, a, lineWidth, dash, soften) {
    const bulge = bulgeOf(A, B, layer);
    const n = Math.max(1, Math.ceil(16 * (to - from)));
    let prev = linkPoint(A, B, from, bulge, linkA);
    let next = linkB;
    let travelled = 0;
    for (let k = 1; k <= n; k++) {
      const cur = linkPoint(A, B, from + (to - from) * k / n, bulge, next);
      const s = (prev.s + cur.s) / 2;
      const mx = (prev.sx + cur.sx) / 2;
      const my = (prev.sy + cur.sy) / 2;
      const ctx = pathPlane((prev.zz + cur.zz) / 2).ctx;
      // Behind the frosted card a fine or dashed line would blur away, so the
      // path widens into a soft streak; `soften` sets how bright it stays.
      const glass = soften > 0 && underGlass(mx, my);
      ctx.strokeStyle = rgba(color, a * clearAt(mx, my, 0.15) * (0.4 + 0.6 * s) * (glass ? soften : 1));
      ctx.lineWidth = lineWidth * (0.55 + 0.45 * s) * (glass ? 2 : 1);
      ctx.setLineDash(glass ? [] : dash || []);
      ctx.lineDashOffset = -travelled;
      ctx.beginPath();
      ctx.moveTo(prev.sx, prev.sy);
      ctx.lineTo(cur.sx, cur.sy);
      ctx.stroke();
      travelled += Math.hypot(cur.sx - prev.sx, cur.sy - prev.sy);
      next = prev;
      prev = cur;
    }
    PLANES.forEach(p => p.ctx.setLineDash([]));
  }
  // The search stays legible as it travels: deep stretches are only lightly soft.
  const pathPlane = zz => (zz < F * 0.3 ? NEAR : MID);
  function glow(p, color, radius, core, coreColor) {
    const ctx = NEAR.ctx;
    if (underGlass(p.sx, p.sy)) { radius *= 2; core *= 1.5; }
    ctx.globalAlpha = clearAt(p.sx, p.sy, 0.2);
    const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, radius);
    g.addColorStop(0, rgba(color, 0.6));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, core, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function ring(p, color, a, r, width) {
    const ctx = pathPlane(p.zz).ctx;
    ctx.strokeStyle = rgba(color, a);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, TAU);
    ctx.stroke();
  }
  function disc(p, color, a, r) {
    const ctx = pathPlane(p.zz).ctx;
    ctx.fillStyle = rgba(color, a * clearAt(p.sx, p.sy, 0.2));
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, TAU);
    ctx.fill();
  }

  function drawLabel(text, p, color, placed, strong) {
    const ctx = NEAR.ctx;
    ctx.font = (strong ? '500 ' : '400 ') + '11px "IBM Plex Mono", ui-monospace, monospace';
    // Narrow gutters can't fit a long label on one line; break it in two.
    const mid = text.length / 2;
    const cut = [...text.matchAll(/ /g)].map(m => m.index).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    const layouts = [[text]];
    if (cut != null) layouts.push([text.slice(0, cut), text.slice(cut + 1)]);
    for (const lines of layouts) {
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 14;
      const h = lines.length * 14 + 6;
      const box = placeLabel(p, w, h, placed);
      if (!box) continue;
      if (box.lead) {
        ctx.strokeStyle = rgba(color, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy + Math.sign(box.ly - p.sy) * 5);
        ctx.lineTo(box.lx, box.ly);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(colors.bg, 0.86);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(box.x, box.y, w, h, 6);
      else ctx.rect(box.x, box.y, w, h);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, box.x + 7, box.y + 10.5 + i * 14));
      return true;
    }
    return false;
  }
  function placeLabel(p, w, h, placed) {
    // Centred placements slide along the edge rather than fall off screen.
    const cx = clamp(p.sx - w / 2, 6, width - 6 - w);
    const options = [
      { x: p.sx + 10, y: p.sy - h / 2 },
      { x: p.sx - 10 - w, y: p.sy - h / 2 },
      { x: cx, y: p.sy - 14 - h },
      { x: cx, y: p.sy + 14 }
    ];
    // Neighbouring results (and the slivers beside the copy on compact
    // screens) crowd labels: one may sit a little further off, tied back to
    // its point by a leader line.
    for (let d = 40; d <= 112; d += 24) {
      for (const x of [cx, p.sx - 4, p.sx + 4 - w, 6, width - 6 - w]) options.push({ x, y: p.sy - d - h, lead: true }, { x, y: p.sy + d, lead: true });
    }
    for (const o of options) {
      const box = { x: o.x, y: o.y, w, h };
      if (box.x < 6 || box.y < 6 || box.x + w > width - 6 || box.y + h > height - 6) continue;
      if (protectedRects.some(r => overlaps(box, r)) || placed.some(r => overlaps(box, r))) continue;
      const lx = clamp(p.sx, box.x + 8, box.x + w - 8);
      const ly = box.y > p.sy ? box.y : box.y + h;
      // Leaders stay short: the label sits roughly above or below its point.
      if (o.lead && (p.sx < box.x - 40 || p.sx > box.x + w + 40)) continue;
      if (o.lead && [0.25, 0.5, 0.75].some(k => insideAny(p.sx + (lx - p.sx) * k, p.sy + (ly - p.sy) * k))) continue;
      placed.push(box);
      return Object.assign(box, { lead: !!o.lead, lx, ly });
    }
    return null;
  }

  function focusTarget(i, now, still) {
    const q = query;
    if (!q || !q.focus) return 1;
    if (still) return q.focus[i];
    const since = now - q.start - q.focusAt;
    return since < 0 || since > HOLD_MS + q.land - q.focusAt ? 1 : q.focus[i];
  }

  const tmpC = {};
  function draw(now) {
    const t = now - clockStart;
    const still = motionQuery.matches;
    const dt = lastDraw ? Math.min(120, now - lastDraw) : 0;
    lastDraw = now;
    const prevYaw = cam.yaw;
    const prevPitch = cam.pitch;
    setCamera(t, still);
    // The far plane is blurred and drifts slowly, so it repaints at half rate
    // unless the camera swings quickly (pointer parallax) or the scene changed.
    const swing = Math.abs(cam.yaw - prevYaw) + Math.abs(cam.pitch - prevPitch);
    farSkip = !still && !farDirty && dt > 0 && swing < 0.0006 && !farSkip;
    farDirty = false;
    projectNodes(t, still);
    clusterInfo.forEach((c, i) => {
      const goal = focusTarget(i, now, still);
      c.f = still ? goal : c.f + (goal - c.f) * (1 - Math.exp(-dt / 280));
    });

    PLANES.forEach(p => {
      if (farSkip && p === FAR) return;
      p.ctx.setTransform(p.scale, 0, 0, p.scale, 0, 0);
      p.ctx.clearRect(0, 0, width, height);
    });

    const dark = colors.dark;
    const bgEdge = dark ? 0.34 : 0.4;
    const fgEdge = dark ? 0.46 : 0.5;
    const bgDot = dark ? 0.72 : 0.6;
    const fgDot = dark ? 0.92 : 0.85;
    const depthA = s => 0.3 + 0.7 * s;

    for (let e = 0; e < edges.length; e += 2) {
      const A = nodes[edges[e]];
      const B = nodes[edges[e + 1]];
      const v = Math.min(A.vis, B.vis);
      if (v < 0.02) continue;
      if (A.cluster >= 0 && A.cluster === B.cluster) {
        // Focus regions cross-fade between the sharp and soft planes (rack focus).
        const f = clusterInfo[A.cluster].f;
        const a = fgEdge * v * (0.35 + 0.65 * f);
        line(NEAR, 1, a * f, A.sx, A.sy, B.sx, B.sy);
        line(MID, 1, a * (1 - f), A.sx, A.sy, B.sx, B.sy);
        continue;
      }
      // Everything off the focal plane, including links out of a region, is soft.
      const deep = A.zz > B.zz ? A : B;
      const plane = planeFor(deep.zz) === FAR ? FAR : MID;
      line(plane, plane === FAR ? 0 : 1, bgEdge * v * depthA(deep.s) * (plane === FAR ? 1.6 : 0.7), A.sx, A.sy, B.sx, B.sy);
    }
    for (const n of nodes) {
      if (n.vis < 0.02) continue;
      if (n.cluster >= 0) {
        const f = clusterInfo[n.cluster].f;
        const a = fgDot * n.vis * (0.35 + 0.65 * f);
        dot(NEAR, 1, a * f, n.sx, n.sy, n.r * 2.1);
        dot(MID, 1, a * (1 - f), n.sx, n.sy, n.r * 2.4);
      } else {
        const plane = planeFor(n.zz) === FAR ? FAR : MID;
        const r = n.r * (0.6 + 1.4 * n.s) * (n.level ? 1.35 : 1) * (plane === FAR ? 1.5 : 1);
        dot(plane, plane === FAR ? 0 : 1, bgDot * n.vis * depthA(n.s) * (plane === FAR ? 1.4 : 1), n.sx, n.sy, r);
      }
    }
    flush();

    // The answer's documents claim label space first; region names fit around.
    const placed = [];
    if (query) drawQuery(now, placed, still);
    const ctx = NEAR.ctx;
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    clusterInfo.forEach((c, ci) => {
      const p = project(c.centre.x, c.centre.y, 0, tmpC);
      const text = c.label.toUpperCase();
      const w = ctx.measureText(text).width;
      const cx = clamp(p.sx - w / 2, 10, width - 10 - w);
      const spots = [
        { x: cx, y: p.sy - c.radius - 18 },
        { x: cx, y: p.sy + c.radius + 18 }
      ];
      if (compact) spots.push({ x: p.sx + c.radius + 14, y: p.sy }, { x: p.sx - c.radius - 14 - w, y: p.sy });
      for (const s of spots) {
        const box = { x: s.x - 4, y: s.y - 8, w: w + 8, h: 16 };
        if (box.x < 6 || box.y < 6 || box.x + box.w > width - 6 || box.y + box.h > height - 6) continue;
        if (protectedRects.some(r => overlaps(box, r)) || placed.some(r => overlaps(box, r))) continue;
        // Never letter over another region's points.
        const hit = n => n.sx > box.x - 3 && n.sx < box.x + box.w + 3 && n.sy > box.y - 3 && n.sy < box.y + box.h + 3;
        if (clusterInfo.some((o, oi) => oi !== ci && o.members.some(i => hit(nodes[i])))) continue;
        placed.push(box);
        ctx.fillStyle = rgba(colors.faint, 0.8 * viewFade(p.sx, p.sy) * (0.3 + 0.7 * c.f));
        ctx.fillText(text, s.x, s.y);
        break;
      }
    });

    if (hover != null && nodes[hover]) {
      const p = nodes[hover];
      ring(p, colors.accent, 0.9, 6, 1.5);
      drawLabel(p.label || CLUSTERS[p.cluster].label, p, dark ? colors.point : colors.accent, placed, true);
    }
  }

  function drawSteps(steps, age, fade, still) {
    const dash = [7, 5];
    for (const st of steps) {
      if (age < st.t0) break;
      if (st.descend) {
        // Dropping a layer: a ring closes in on the node.
        const k = (age - st.t0) / (st.t1 - st.t0);
        const at = nodes[st.at];
        if (!still && k < 1) ring(at, colors.accent, (1 - k) * 0.8 * fade, 3 + 16 * (1 - ease(k)), 1.2);
        // A brief layer tag marks each step down the hierarchy, kept off the copy.
        let tag = still ? 0 : clamp(Math.min((age - st.t0) / 200, (st.t0 + 1600 - age) / 500), 0, 1) * fade;
        if (tag > 0) tag *= smooth(freeDist(at.sx + 14, at.sy - 9, compact) / 16);
        if (tag > 0) {
          const c = NEAR.ctx;
          c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
          c.textBaseline = 'middle';
          c.fillStyle = rgba(colors.dark ? colors.point : colors.accent, 0.85 * tag);
          c.fillText('L' + st.layer, at.sx + 9, at.sy - 9);
        }
        continue;
      }
      const A = nodes[st.from];
      // Scan: the hop weighs every neighbour before moving.
      if (!still && st.scan.length && age < st.tm + 260) {
        const k = clamp((age - st.t0) / (st.tm - st.t0 + 260), 0, 1);
        const flash = Math.sin(Math.PI * k) * 0.3 * fade;
        for (const j of st.scan) if (j !== st.to) strokeLink(A, nodes[j], st.layer, 0, 1, colors.accent, flash, 1, null);
      }
      if (st.to === st.from) continue;
      const B = nodes[st.to];
      const f = still ? 1 : clamp((age - st.tm) / (st.t1 - st.tm), 0, 1);
      if (f <= 0) continue;
      const e = easeInOut(f);
      strokeLink(A, B, st.layer, 0, e, colors.accent, 0.9 * fade, 2 * ui, st.layer ? dash : null, 0.35);
      disc(A, colors.accent, 0.85 * fade, (1.2 + 1.6 * A.s) * ui);
      if (f < 1) {
        strokeLink(A, B, st.layer, Math.max(0, e - 0.25), e, colors.accent, fade, 3.2 * ui, null, 0.8);
        const head = linkPoint(A, B, e, bulgeOf(A, B, st.layer), tmpC);
        glow(head, colors.accent, (9 + 13 * head.s) * ui, (2.2 + 1.8 * head.s) * ui, colors.dark ? '#ffffff' : colors.accent);
      } else {
        disc(B, colors.accent, 0.85 * fade, (1.2 + 1.6 * B.s) * ui);
      }
    }
  }

  function drawQuery(now, placed, still) {
    const q = query;
    const age = still ? Infinity : now - q.start;
    const since = age - q.land;
    const pathFade = still ? 1 : since < HOLD_MS ? 1 : clamp(1 - (since - HOLD_MS) / FADE_MS, 0, 1);
    const markFade = still ? 1 : since < HOLD_MS ? 1 : Math.max(0.35, pathFade);
    if (pathFade > 0) q.branches.forEach(steps => drawSteps(steps, age, pathFade, still));

    // The query vector: faint while the search is under way, solid on landing.
    if (q.target) {
      const p = project(q.target.x, q.target.y, q.target.z, {});
      const landed = age >= q.land;
      const color = q.mode === 'miss' ? colors.faint : colors.amber;
      const k = still ? 1 : ease(age / 400);
      ring(p, color, (landed ? 0.95 : 0.45) * markFade, 7 * k * ui, 1.6);
      if (!still && age < q.land + 1600) {
        const pulse = (age % 1400) / 1400;
        ring(p, color, (1 - pulse) * 0.5 * markFade, (7 + pulse * 18) * ui, 1.2);
      }
      if (q.mode === 'miss' && landed) {
        const steps = q.branches[0];
        const last = nodes[steps.length ? steps[steps.length - 1].from : entry];
        const c = NEAR.ctx;
        c.setLineDash([2, 5]);
        c.strokeStyle = rgba(colors.faint, 0.8 * markFade);
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(last.sx, last.sy);
        c.lineTo(p.sx, p.sy);
        c.stroke();
        c.setLineDash([]);
      }
    }

    q.results.forEach(r => {
      const local = still ? Infinity : age - r.t;
      if (local <= 0) return;
      const k = still ? 1 : ease(local / 380);
      const p = nodes[r.i];
      if (q.target) {
        const from = project(q.target.x, q.target.y, q.target.z, {});
        const c = NEAR.ctx;
        c.strokeStyle = rgba(colors.amber, 0.55 * markFade);
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(from.sx, from.sy);
        c.lineTo(from.sx + (p.sx - from.sx) * k, from.sy + (p.sy - from.sy) * k);
        c.stroke();
      }
      disc(p, colors.amber, markFade, 3.4 * k * ui);
      ring(p, colors.amber, 0.35 * markFade, 8 * k * ui, 1);
      if (k > 0.6 && p.label && markFade > 0.5) {
        NEAR.ctx.globalAlpha = Math.min(1, (k - 0.6) / 0.4);
        drawLabel(p.label, p, colors.amberText, placed, true);
        NEAR.ctx.globalAlpha = 1;
      }
    });
  }

  // --- Loop and wiring -----------------------------------------------------------
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    if (now - lastFrame >= FRAME_MS) {
      lastFrame = now;
      draw(now);
    }
    if (!motionQuery.matches) frame = requestAnimationFrame(tick);
  }
  function kick() {
    if (motionQuery.matches) {
      draw(performance.now());
      return;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }

  // A query is the topic plus the documents its answer draws on; the 404 page
  // replays a bare topic name.
  function onQuery(detail) {
    const spec = typeof detail === 'string' ? { topic: detail } : detail;
    if (!spec || !spec.topic) return;
    planQuery(spec, performance.now());
    kick();
  }

  document.addEventListener('herochat:query', e => onQuery(e.detail));
  document.addEventListener('site:themechange', () => { readColors(); kick(); });
  motionQuery.addEventListener('change', () => { lastFrame = 0; kick(); });
  document.addEventListener('visibilitychange', () => { lastDraw = 0; kick(); });

  let resizeTimer = 0;
  const relayout = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); lastFrame = 0; kick(); }, 120);
  };
  new ResizeObserver(relayout).observe(backdrop);

  // Protected areas move as the chat streams; refresh them cheaply.
  const app = document.getElementById('app');
  if (app) new ResizeObserver(() => { readProtected(); if (motionQuery.matches) kick(); }).observe(app);

  new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting);
    if (visible) { lastDraw = 0; kick(); }
  }).observe(hero);

  if (finePointer.matches) {
    hero.addEventListener('pointermove', e => {
      const b = backdrop.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;
      cam.tx = (x / width - 0.5) * 0.06;
      cam.ty = -(y / height - 0.5) * 0.035;
      let next = null;
      if (!insideAny(x, y)) {
        let best = 24 * 24;
        nodes.forEach((n, i) => {
          if (n.cluster < 0) return;
          const d = (n.sx - x) ** 2 + (n.sy - y) ** 2;
          if (d < best) { best = d; next = i; }
        });
      }
      if (next !== hover) { hover = next; kick(); }
    });
    hero.addEventListener('pointerleave', () => {
      cam.tx = 0;
      cam.ty = 0;
      if (hover != null) { hover = null; kick(); }
    });
  }

  readColors();
  layout();
  if (window.HeroChatLastQuery) onQuery(window.HeroChatLastQuery);
  kick();
})();
