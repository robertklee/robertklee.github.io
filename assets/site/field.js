// Embedding-field backdrop: a 2D illustration of a vector index built from
// Robert's work. Clusters are topics, points are pieces of work, and faint
// edges form a k-nearest-neighbour graph. Each chat question
// (`herochat:query`) runs a visible search: a focused question walks a sparse
// hub layer then the local graph (HNSW-style) to its k nearest points; a broad
// question pulls one representative from several clusters (diverse retrieval).
// Illustrative only: hand-placed data, not a real index or embedding model.
(() => {
  'use strict';

  const backdrop = document.querySelector('[data-hero-backdrop]');
  if (!backdrop) return;
  const hero = backdrop.parentElement;
  const root = document.documentElement;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  canvas.className = 'field-canvas';
  backdrop.appendChild(canvas);

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
    { id: 'diversity', label: 'Diversity', docs: ['Diversity capability', 'Distributed execution', 'Redundancy reduction', 'Corpus-spanning grounding'] },
    { id: 'agentic', label: 'Agentic retrieval', docs: ['Filter generation', 'Boost generation', 'Verifiable operator set', 'Workload benchmarks', 'Billing model'] },
    { id: 'efficiency', label: 'Efficiency & scale', docs: ['Scalar quantization', 'Binary quantization', 'SIMD distance', 'Billion-vector scale'] },
    { id: 'relevance', label: 'Relevance', docs: ['Hybrid search', 'Vector search 1 to N', 'Facet aggregation', 'Index alias'] },
    { id: 'ml', label: 'Vision & ML', docs: ['Pose estimation', 'Road segmentation', 'Monocular depth', 'Battlesnake RL', 'Chest X-ray app'] },
    { id: 'community', label: 'Community', docs: ['Digital literacy program', 'IEEE student branch', 'Tech & business conference', 'SENG 321 mentor'] },
    { id: 'foundations', label: 'Foundations', docs: ['B.Eng, 97% average', 'Schulich Leader', 'YC AI Startup School', 'Undergraduate research award'] }
  ];

  // Chat topic -> how the field answers it.
  const TOPICS = {
    intro: { mode: 'diverse', clusters: ['diversity', 'agentic', 'efficiency', 'ml', 'community'] },
    search: { mode: 'diverse', clusters: ['diversity', 'agentic', 'efficiency', 'relevance'] },
    experience: { mode: 'diverse', clusters: ['diversity', 'agentic', 'efficiency', 'relevance', 'ml'] },
    skills: { mode: 'diverse', clusters: ['relevance', 'efficiency', 'agentic', 'ml', 'diversity'] },
    projects: { mode: 'diverse', clusters: ['ml', 'diversity', 'agentic', 'community', 'foundations'] },
    diversity: { mode: 'knn', cluster: 'diversity' },
    distributed: { mode: 'knn', cluster: 'efficiency' },
    performance: { mode: 'knn', cluster: 'efficiency' },
    relevance: { mode: 'knn', cluster: 'relevance' },
    rag: { mode: 'knn', cluster: 'agentic' },
    benchmarking: { mode: 'knn', cluster: 'agentic' },
    vision: { mode: 'knn', cluster: 'ml' },
    leadership: { mode: 'knn', cluster: 'community' },
    awards: { mode: 'knn', cluster: 'foundations' },
    'easter-egg': { mode: 'miss' },
    'not-found': { mode: 'miss' }
  };

  const K = 4;
  const GRAPH_K = 3;
  const HOP_MS = 150;
  const HOLD_MS = 9000;
  const FRAME_MS = 1000 / 30;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];
  let edges = [];
  let hubs = [];
  let hubEdges = [];
  let clusterInfo = [];
  let protectedRects = [];
  let colors = {};
  let query = null;
  let hover = null;
  let visible = true;
  let frame = 0;
  let lastFrame = 0;
  let clockStart = performance.now();

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
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

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
  }

  function relRect(el, pad) {
    const b = backdrop.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left - b.left - pad, y: r.top - b.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  }
  function readProtected() {
    const sel = '.hero-eyebrow, .hero-viewport > h1, .hero-tagline, .hero-chat, .scroll-cue, .field-readout';
    protectedRects = [...hero.querySelectorAll(sel)].map(el => relRect(el, 10)).filter(Boolean);
  }
  // The chat grows as it streams, so reserve room for a full answer up front.
  function layoutProtected() {
    readProtected();
    const chat = hero.querySelector('.hero-chat');
    const r = chat && relRect(chat, 16);
    if (r) protectedRects.push({ x: r.x, y: r.y, w: r.w, h: Math.max(r.h, Math.min(340, height - r.y - 90)) });
  }
  function rectDistance(p, r) {
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
    const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
    return Math.hypot(dx, dy);
  }
  function freeDistance(p) {
    let d = Infinity;
    for (const r of protectedRects) d = Math.min(d, rectDistance(p, r));
    return d;
  }
  const insideAny = (p, rects) => rects.some(r => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h);
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function layout() {
    const box = backdrop.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    layoutProtected();

    const rand = rng(width * 7919 + height * 104729);
    const wide = width >= 900;
    const perCluster = wide ? 10 : 7;
    const sigma = Math.max(16, Math.min(38, Math.min(width, height) * 0.04));
    const margin = Math.max(28, sigma * 1.8);

    // Choose well-separated cluster centres, inset from the edges and clear
    // of the hero copy where the viewport allows.
    const frame = { l: Math.max(margin, width * 0.06), r: width - Math.max(margin, width * 0.06), t: Math.max(margin, height * 0.1), b: height - Math.max(margin * 1.6, height * 0.17) };
    let candidates = [];
    for (let gx = 0; gx <= 28; gx++) {
      for (let gy = 0; gy <= 18; gy++) {
        const p = { x: frame.l + (frame.r - frame.l) * gx / 28, y: frame.t + (frame.b - frame.t) * gy / 18 };
        candidates.push({ p, free: Math.min(freeDistance(p), sigma * 3) });
      }
    }
    const roomy = candidates.filter(c => c.free >= sigma * 1.4);
    if (roomy.length >= CLUSTERS.length * 4) candidates = roomy;
    const centres = [];
    for (let c = 0; c < CLUSTERS.length; c++) {
      let best = null;
      let bestScore = -Infinity;
      for (const cand of candidates) {
        const spread = centres.length ? Math.min(...centres.map(q => Math.sqrt(dist2(q, cand.p)))) : 0;
        const score = spread + cand.free * 1.5 + rand() * 8;
        if (score > bestScore) { bestScore = score; best = cand.p; }
      }
      centres.push(best);
    }

    points = [];
    clusterInfo = CLUSTERS.map((cluster, ci) => {
      const centre = centres[ci];
      const members = [];
      for (let i = 0; i < perCluster; i++) {
        let p = null;
        for (let tries = 0; tries < 24; tries++) {
          const q = { x: centre.x + gauss(rand) * sigma, y: centre.y + gauss(rand) * sigma * 0.85 };
          if (q.x < 8 || q.y < 8 || q.x > width - 8 || q.y > height - 8) continue;
          p = q;
          if (!insideAny(q, protectedRects)) break;
        }
        if (!p) p = { x: centre.x, y: centre.y };
        members.push(points.length);
        points.push({ x: p.x, y: p.y, bx: p.x, by: p.y, cluster: ci, label: '' });
      }
      // Nearest-to-centre points carry the cluster's labels.
      const byCentre = members.slice().sort((a, b) => dist2(points[a], centre) - dist2(points[b], centre));
      byCentre.forEach((idx, j) => { points[idx].label = cluster.docs[j] || ''; });
      return { id: cluster.id, label: cluster.label, centre, members, hub: byCentre[0] };
    });
    const noise = wide ? 26 : 12;
    for (let i = 0; i < noise; i++) {
      const p = { x: 10 + rand() * (width - 20), y: 10 + rand() * (height - 20) };
      points.push({ x: p.x, y: p.y, bx: p.x, by: p.y, cluster: -1, label: '' });
    }
    points.forEach(p => {
      p.phase = rand() * Math.PI * 2;
      p.amp = 1.2 + rand() * 2.6;
      p.freq = 0.00018 + rand() * 0.00022;
      p.r = 1.3 + rand() * 0.9;
      p.dim = insideAny(p, protectedRects) ? 0.35 : 1;
    });

    // Layer 0: undirected kNN graph.
    const seen = new Set();
    edges = [];
    points.forEach((p, i) => {
      p.nbrs = points
        .map((q, j) => ({ j, d: dist2(p, q) }))
        .filter(o => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, GRAPH_K)
        .map(o => o.j);
    });
    const maxEdge = (sigma * 3.2) ** 2;
    points.forEach((p, i) => p.nbrs.forEach(j => {
      const key = i < j ? i + ':' + j : j + ':' + i;
      if (!seen.has(key) && dist2(p, points[j]) < maxEdge) { seen.add(key); edges.push([i, j]); }
      if (!points[j].nbrs.includes(i)) points[j].nbrs.push(i);
    }));

    // Layer 1: sparse links between cluster hubs (2 nearest + a spanning tree).
    hubs = clusterInfo.map(c => c.hub);
    const hubLinks = new Set();
    const link = (a, b) => hubLinks.add(a < b ? a + ':' + b : b + ':' + a);
    hubs.forEach(a => hubs
      .filter(b => b !== a)
      .sort((b, c) => dist2(points[a], points[b]) - dist2(points[a], points[c]))
      .slice(0, 2)
      .forEach(b => link(a, b)));
    const inTree = [hubs[0]];
    while (inTree.length < hubs.length) {
      let best = null;
      hubs.filter(h => !inTree.includes(h)).forEach(h => inTree.forEach(t => {
        const d = dist2(points[h], points[t]);
        if (!best || d < best.d) best = { h, t, d };
      }));
      link(best.h, best.t);
      inTree.push(best.h);
    }
    hubEdges = [...hubLinks].map(k => k.split(':').map(Number));

    if (query) planQuery(query.topic, query.start);
    else setReadout(points.length + ' points · ' + CLUSTERS.length + ' clusters', false);
  }

  function hubNeighbours(h) {
    return hubEdges.filter(e => e[0] === h || e[1] === h).map(e => (e[0] === h ? e[1] : e[0]));
  }

  // Greedy descent: sparse hub layer first, then the local kNN graph.
  function walk(target) {
    const entry = hubs.reduce((a, b) => (points[a].x + points[a].y < points[b].x + points[b].y ? a : b));
    const path = [{ i: entry, layer: 1 }];
    let cur = entry;
    for (let guard = 0; guard < 12; guard++) {
      const next = hubNeighbours(cur).reduce((best, n) => (dist2(points[n], target) < dist2(points[best], target) ? n : best), cur);
      if (next === cur) break;
      cur = next;
      path.push({ i: cur, layer: 1 });
    }
    for (let guard = 0; guard < 24; guard++) {
      const next = points[cur].nbrs.reduce((best, n) => (dist2(points[n], target) < dist2(points[best], target) ? n : best), cur);
      if (next === cur) break;
      cur = next;
      path.push({ i: cur, layer: 0 });
    }
    return path;
  }

  function nearest(target, k, filter) {
    return points
      .map((p, i) => ({ i, d: dist2(p, target) }))
      .filter(o => !filter || filter(points[o.i]))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map(o => o.i);
  }

  function emptiestSpot() {
    let best = { x: width * 0.12, y: height * 0.5 };
    let bestScore = -Infinity;
    for (let gx = 1; gx < 20; gx++) {
      for (let gy = 1; gy < 10; gy++) {
        const p = { x: width * gx / 20, y: height * (0.08 + 0.74 * gy / 10) };
        if (insideAny(p, protectedRects)) continue;
        const near = Math.sqrt(dist2(p, points[nearest(p, 1)[0]]));
        if (near > bestScore) { bestScore = near; best = p; }
      }
    }
    return best;
  }

  function planQuery(topic, start) {
    const spec = TOPICS[topic] || TOPICS.intro;
    readProtected();
    const q = { topic, start, mode: spec.mode, path: [], results: [], target: null };
    if (spec.mode === 'diverse') {
      const ids = spec.clusters.map(id => clusterInfo.find(c => c.id === id)).filter(Boolean);
      q.results = ids.map(c => c.hub);
      setReadout('Diverse retrieval · ' + q.results.length + ' results across ' + ids.length + ' clusters', true);
    } else if (spec.mode === 'knn') {
      const c = clusterInfo.find(x => x.id === spec.cluster) || clusterInfo[0];
      const seed = rng(topic.length * 131 + Math.round(start));
      q.target = { x: c.centre.x + (seed() - 0.5) * 18, y: c.centre.y + (seed() - 0.5) * 14 };
      q.path = walk(q.target);
      q.results = nearest(q.target, K);
      const hops = q.path.length - 1;
      setReadout('kNN · k=' + K + ' · ' + hops + (hops === 1 ? ' hop' : ' hops') + ' · ' + c.label, true);
    } else {
      q.target = emptiestSpot();
      q.path = walk(q.target);
      setReadout('0 results above threshold', true);
    }
    query = q;
  }

  function setReadout(text, active) {
    readoutText.textContent = text;
    readout.classList.toggle('is-active', active);
  }

  // --- Drawing ---------------------------------------------------------------
  function alpha(hex, a) {
    if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
      const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
      const n = parseInt(full.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return hex;
  }
  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
  function edgeFade(p) {
    const m = 56;
    return Math.min(1, p.x / m, (width - p.x) / m, p.y / m, (height - p.y) / (m * 1.6));
  }

  function chatAnchor(p) {
    const chat = hero.querySelector('.hero-chat');
    const r = chat && relRect(chat, 0);
    if (!r) return null;
    return { x: Math.max(r.x, Math.min(p.x, r.x + r.w)), y: Math.max(r.y, Math.min(p.y, r.y + r.h)) };
  }

  function drawLabel(text, p, color, placed, strong) {
    ctx.font = (strong ? '500 ' : '400 ') + '11px "IBM Plex Mono", ui-monospace, monospace';
    const w = ctx.measureText(text).width + 14;
    const h = 20;
    const options = [
      { x: p.x + 10, y: p.y - h / 2 },
      { x: p.x - 10 - w, y: p.y - h / 2 },
      { x: p.x - w / 2, y: p.y - 14 - h },
      { x: p.x - w / 2, y: p.y + 14 }
    ];
    for (const o of options) {
      const box = { x: o.x, y: o.y, w, h };
      if (box.x < 6 || box.y < 6 || box.x + w > width - 6 || box.y + h > height - 6) continue;
      if (protectedRects.some(r => overlaps(box, r)) || placed.some(r => overlaps(box, r))) continue;
      placed.push(box);
      ctx.fillStyle = alpha(colors.bg, 0.86);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(box.x, box.y, w, h, 6) : ctx.rect(box.x, box.y, w, h);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, box.x + 7, box.y + h / 2 + 0.5);
      return true;
    }
    return false;
  }

  function draw(now) {
    const t = now - clockStart;
    const still = motionQuery.matches;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    points.forEach(p => {
      p.x = still ? p.bx : p.bx + Math.sin(t * p.freq + p.phase) * p.amp;
      p.y = still ? p.by : p.by + Math.cos(t * p.freq * 0.8 + p.phase) * p.amp;
    });

    const pointAlpha = colors.dark ? 0.62 : 0.5;
    const edgeAlpha = colors.dark ? 0.2 : 0.28;

    ctx.lineWidth = 1;
    edges.forEach(([a, b]) => {
      const pa = points[a];
      const pb = points[b];
      ctx.strokeStyle = alpha(colors.edge, edgeAlpha * Math.min(edgeFade(pa), edgeFade(pb), pa.dim, pb.dim));
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });

    points.forEach(p => {
      ctx.fillStyle = alpha(colors.point, pointAlpha * edgeFade(p) * p.dim);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    const placed = [];
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    clusterInfo.forEach(c => {
      const text = c.label.toUpperCase();
      const w = ctx.measureText(text).width;
      const spots = [{ x: c.centre.x - w / 2, y: c.centre.y - 52 }, { x: c.centre.x - w / 2, y: c.centre.y + 44 }];
      for (const s of spots) {
        const box = { x: s.x - 4, y: s.y - 8, w: w + 8, h: 16 };
        if (box.x < 6 || box.y < 6 || box.x + box.w > width - 6 || box.y + box.h > height - 6) continue;
        if (protectedRects.some(r => overlaps(box, r)) || placed.some(r => overlaps(box, r))) continue;
        placed.push(box);
        ctx.fillStyle = alpha(colors.faint, 0.75 * edgeFade(c.centre));
        ctx.textBaseline = 'middle';
        ctx.fillText(text, s.x, s.y);
        break;
      }
    });

    if (query) drawQuery(now, placed, still);

    if (hover != null && points[hover]) {
      const p = points[hover];
      ctx.strokeStyle = alpha(colors.accent, 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      const cluster = p.cluster >= 0 ? CLUSTERS[p.cluster].label : 'Unclustered';
      drawLabel(p.label || cluster, p, colors.dark ? colors.point : colors.accent, placed, true);
    }
  }

  function drawQuery(now, placed, still) {
    const q = query;
    const age = still ? Infinity : now - q.start;
    const fade = still ? 1 : age < HOLD_MS ? 1 : Math.max(0.3, 1 - (age - HOLD_MS) / 1600);

    // Search path.
    const hopsShown = still ? q.path.length : Math.min(q.path.length, age / HOP_MS + 1);
    ctx.lineWidth = 1.5;
    for (let s = 1; s < q.path.length; s++) {
      const progress = hopsShown - s;
      if (progress <= 0) break;
      const a = points[q.path[s - 1].i];
      const b = points[q.path[s].i];
      const f = Math.min(1, progress);
      ctx.setLineDash(q.path[s].layer === 1 ? [5, 5] : []);
      ctx.strokeStyle = alpha(colors.accent, 0.75 * fade);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let s = 0; s < Math.min(q.path.length, Math.ceil(hopsShown)); s++) {
      const p = points[q.path[s].i];
      ctx.fillStyle = alpha(colors.accent, 0.85 * fade);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s === 0 ? 3.2 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const walkDone = still ? 0 : (q.path.length ? q.path.length - 1 : 0) * HOP_MS;

    // A miss: the closest node is still too far from the query to count.
    if (q.mode === 'miss' && q.path.length && (still || age > walkDone)) {
      const last = points[q.path[q.path.length - 1].i];
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = alpha(colors.faint, 0.8 * fade);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(q.target.x, q.target.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Query marker.
    if (q.target) {
      const k = still ? 1 : ease(age / 400);
      ctx.strokeStyle = alpha(q.mode === 'miss' ? colors.faint : colors.amber, 0.95 * fade);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(q.target.x, q.target.y, 7 * k, 0, Math.PI * 2);
      ctx.stroke();
      if (!still && age < walkDone + 1600) {
        const pulse = ((age % 1400) / 1400);
        ctx.strokeStyle = alpha(colors.amber, (1 - pulse) * 0.5 * fade);
        ctx.beginPath();
        ctx.arc(q.target.x, q.target.y, 7 + pulse * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Results.
    const stagger = q.mode === 'diverse' ? 170 : 90;
    q.results.forEach((idx, rank) => {
      const local = still ? Infinity : age - walkDone - rank * stagger - (q.mode === 'diverse' ? 250 : 120);
      if (local <= 0) return;
      const k = still ? 1 : ease(local / 380);
      const p = points[idx];
      const from = q.mode === 'diverse' ? chatAnchor(p) : q.target;
      if (from) {
        ctx.strokeStyle = alpha(colors.amber, 0.55 * fade);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(from.x + (p.x - from.x) * k, from.y + (p.y - from.y) * k);
        ctx.stroke();
      }
      ctx.fillStyle = alpha(colors.amber, fade);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = alpha(colors.amber, 0.35 * fade);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 * k, 0, Math.PI * 2);
      ctx.stroke();
      if (k > 0.6 && p.label && fade > 0.5) {
        ctx.globalAlpha = Math.min(1, (k - 0.6) / 0.4);
        drawLabel(p.label, p, colors.amberText, placed, true);
        ctx.globalAlpha = 1;
      }
    });
  }

  // --- Loop and wiring -------------------------------------------------------
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

  function onQuery(topic) {
    if (!topic) return;
    planQuery(topic, performance.now());
    kick();
  }

  document.addEventListener('herochat:query', e => onQuery(e.detail && e.detail.topic));
  document.addEventListener('site:themechange', () => { readColors(); kick(); });
  motionQuery.addEventListener('change', () => { lastFrame = 0; kick(); });
  document.addEventListener('visibilitychange', kick);

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
    if (visible) kick();
  }).observe(hero);

  if (finePointer.matches) {
    hero.addEventListener('pointermove', e => {
      const b = backdrop.getBoundingClientRect();
      const p = { x: e.clientX - b.left, y: e.clientY - b.top };
      let next = null;
      if (!insideAny(p, protectedRects)) {
        const [i] = nearest(p, 1);
        if (i != null && dist2(points[i], p) < 26 * 26) next = i;
      }
      if (next !== hover) { hover = next; kick(); }
    });
    hero.addEventListener('pointerleave', () => { if (hover != null) { hover = null; kick(); } });
  }

  readColors();
  layout();
  if (window.HeroChatLastQuery) onQuery(window.HeroChatLastQuery);
  kick();
})();
