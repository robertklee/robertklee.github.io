// "Relevance vs. diversity" figure: maximal marginal relevance (Carbonell &
// Goldstein, 1998) over a small, hand-made 2D dataset. Similarity is a linear
// falloff with distance, so the plot is the whole model: closer to the query
// means more relevant, closer to each other means more redundant.
// Illustrative only; this is not the production algorithm.
(() => {
  'use strict';

  const figure = document.querySelector('[data-diversity-demo]');
  if (!figure) return;
  const body = figure.querySelector('.dv-body');
  const svg = figure.querySelector('[data-dv-plot]');
  const input = figure.querySelector('#dv-lambda');
  const output = figure.querySelector('[data-dv-lambda]');
  const list = figure.querySelector('[data-dv-results]');
  const queryText = figure.querySelector('[data-dv-query]');
  const stats = {
    groups: figure.querySelector('[data-dv-groups]'),
    dupes: figure.querySelector('[data-dv-dupes]'),
    rel: figure.querySelector('[data-dv-rel]')
  };
  const live = figure.querySelector('[data-dv-live]');
  const buttons = [...figure.querySelectorAll('[data-scenario]')];
  if (!body || !svg || !input || !list) return;

  const NS = 'http://www.w3.org/2000/svg';
  const W = 560;
  const H = 300;
  const TOP_N = 6;
  const FALLOFF = 0.8;
  const DUPLICATE_SIM = 0.93;
  const QUERY = { x: 0.5, y: 0.52 };

  const LAYOUT = [
    ['a', 0.56, 0.47], ['a', 0.585, 0.455], ['a', 0.57, 0.5], ['a', 0.595, 0.485], ['a', 0.61, 0.44],
    ['b', 0.38, 0.4], ['b', 0.36, 0.37], ['c', 0.4, 0.7], ['c', 0.37, 0.74],
    ['d', 0.66, 0.7], ['d', 0.69, 0.73], ['e', 0.28, 0.55],
    ['f', 0.8, 0.3], ['g', 0.84, 0.26], ['h', 0.15, 0.2]
  ];

  const SCENARIOS = {
    product: {
      query: 'running shoes',
      mirror: false,
      groups: { a: 'Road, cushioned', b: 'Stability', c: 'Trail', d: 'Racing', e: 'Minimalist', f: 'Accessories', g: 'Accessories', h: 'Accessories' },
      titles: [
        'Stride Cushion 5, black', 'Stride Cushion 5, white', 'Stride Cushion 5, navy', 'Stride Cushion 5, wide', 'Stride Cushion 4, black',
        'Guide Stability 12', 'Guide Stability 11', 'Ridge Trail 3', 'Ridge Trail GTX',
        'Tempo Carbon racer', 'Tempo Lite trainer', 'Barefoot Flex',
        'Running socks, 3-pack', 'Gel insoles', 'Reflective running vest'
      ]
    },
    corpus: {
      query: 'What are the risks of moving our data platform to the cloud?',
      mirror: true,
      groups: { a: 'Cost', b: 'Security', c: 'Lock-in', d: 'Downtime', e: 'Latency', f: 'Skills', g: 'Off-topic', h: 'Off-topic' },
      titles: [
        'Cloud cost overrun review', 'Q3 cloud spend memo', 'Egress fees postmortem', 'FinOps budget alerts', 'Reserved pricing notes',
        'Shared-responsibility model', 'Data residency rules', 'Proprietary service lock-in', 'Exit strategy checklist',
        'Cutover downtime plan', 'Rollback rehearsal notes', 'Latency to on-prem systems',
        'Team upskilling plan', 'Vendor marketing brief', 'Office move logistics'
      ]
    }
  };

  let scenario = 'product';
  let docs = [];
  let nodes = [];
  let touched = false;

  const sim = (a, b) => Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / FALLOFF);
  const px = p => ({ x: 24 + p.x * (W - 48), y: 14 + p.y * (H - 28) });

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  function mmr(lambda) {
    const picked = [];
    while (picked.length < TOP_N) {
      let best = null;
      let bestScore = -Infinity;
      docs.forEach(d => {
        if (picked.includes(d)) return;
        const redundancy = picked.length ? Math.max(...picked.map(p => sim(d, p))) : 0;
        const score = lambda * d.rel - (1 - lambda) * redundancy;
        if (score > bestScore + 1e-9) { bestScore = score; best = d; }
      });
      picked.push(best);
    }
    return picked;
  }

  function build() {
    const s = SCENARIOS[scenario];
    docs = LAYOUT.map(([g, x, y], i) => {
      const d = { i, group: s.groups[g], title: s.titles[i], x: s.mirror ? 1 - x : x, y };
      d.rel = sim(QUERY, d);
      return d;
    });
    if (queryText) queryText.textContent = s.query;

    svg.textContent = '';
    const q = px(QUERY);
    const rings = el('g', { class: 'dv-rings' }, svg);
    [0.1, 0.2, 0.3, 0.4].forEach(r => {
      const radius = r * (W - 48);
      el('ellipse', { cx: q.x, cy: q.y, rx: radius, ry: r * (H - 28) }, rings);
      const label = el('text', { x: q.x + radius + 4, y: q.y - 4 }, rings);
      label.textContent = (1 - r / FALLOFF).toFixed(2);
    });

    // Label each spatial cluster of a group once, just above its points.
    const labels = el('g', { class: 'dv-group-labels' }, svg);
    [...new Set(docs.map(d => d.group))].forEach(name => {
      const clusters = [];
      docs.filter(d => d.group === name).map(px).forEach(p => {
        const home = clusters.find(c => Math.hypot(c[0].x - p.x, c[0].y - p.y) < 70);
        if (home) home.push(p); else clusters.push([p]);
      });
      clusters.forEach(c => {
        const t = el('text', { x: c.reduce((a, p) => a + p.x, 0) / c.length, y: Math.min(...c.map(p => p.y)) - 16, 'text-anchor': 'middle' }, labels);
        t.textContent = name;
      });
    });

    const links = el('g', { class: 'dv-links' }, svg);
    const points = el('g', { class: 'dv-points' }, svg);
    nodes = docs.map(d => {
      const p = px(d);
      const link = el('line', { x1: q.x, y1: q.y, x2: p.x, y2: p.y, class: 'dv-link' }, links);
      const g = el('g', { class: 'dv-point', transform: 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')' }, points);
      el('circle', { r: 10, class: 'dv-halo' }, g);
      const dot = el('circle', { r: 4.5, class: 'dv-dot' }, g);
      const rank = el('text', { class: 'dv-rank', 'text-anchor': 'middle', dy: '0.35em' }, g);
      return { g, dot, rank, link };
    });

    const query = el('g', { class: 'dv-query-mark', transform: 'translate(' + q.x + ' ' + q.y + ')' }, svg);
    el('circle', { r: 9 }, query);
    el('circle', { r: 2.5, class: 'dv-query-core' }, query);
    const qt = el('text', { y: 24, 'text-anchor': 'middle' }, query);
    qt.textContent = 'query';
  }

  function render() {
    const diversity = Number(input.value);
    const lambda = 1 - diversity;
    if (output) output.textContent = '\u03BB = ' + lambda.toFixed(2);
    input.setAttribute('aria-valuetext', 'Lambda ' + lambda.toFixed(2) + (diversity === 0 ? ', relevance only' : diversity === 1 ? ', diversity only' : ''));

    const picked = mmr(lambda);
    nodes.forEach((n, i) => {
      const rank = picked.indexOf(docs[i]);
      n.g.classList.toggle('is-picked', rank >= 0);
      n.link.classList.toggle('is-picked', rank >= 0);
      n.dot.setAttribute('r', rank >= 0 ? 9 : 4.5);
      n.rank.textContent = rank >= 0 ? String(rank + 1) : '';
    });

    const dupes = picked.map((d, i) => picked.slice(0, i).some(o => sim(d, o) >= DUPLICATE_SIM));
    const groups = new Set(picked.map(d => d.group)).size;
    const dupeCount = dupes.filter(Boolean).length;
    const avg = picked.reduce((a, d) => a + d.rel, 0) / picked.length;
    if (stats.groups) stats.groups.textContent = groups + ' of ' + new Set(docs.map(d => d.group)).size;
    if (stats.dupes) stats.dupes.textContent = String(dupeCount);
    if (stats.rel) stats.rel.textContent = avg.toFixed(2);

    list.textContent = '';
    picked.forEach((d, i) => {
      const li = document.createElement('li');
      li.className = dupes[i] ? 'is-dupe' : '';
      li.innerHTML = '<span class="dv-r" aria-hidden="true"></span><span class="dv-title"></span><span class="dv-tag"></span><span class="dv-score"></span>';
      li.children[0].textContent = String(i + 1);
      li.children[1].textContent = d.title;
      li.children[2].textContent = dupes[i] ? 'Near-duplicate' : d.group;
      li.children[3].textContent = d.rel.toFixed(2);
      li.children[3].setAttribute('aria-label', 'relevance ' + d.rel.toFixed(2));
      list.appendChild(li);
    });

    if (live) {
      clearTimeout(render.timer);
      render.timer = setTimeout(() => {
        live.textContent = 'Top six covers ' + groups + ' groups with ' + dupeCount + ' near-duplicate' + (dupeCount === 1 ? '' : 's') + '; average relevance ' + avg.toFixed(2) + '.';
      }, 500);
    }
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    scenario = button.dataset.scenario;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    build();
    render();
  }));
  input.addEventListener('input', () => { touched = true; render(); });

  body.hidden = false;
  build();
  render();

  // On first view, ease the slider from pure relevance to a balanced setting.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduced.matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now() + 500;
      const to = 0.5;
      const step = now => {
        if (touched) return;
        const t = Math.min(1, Math.max(0, (now - start) / 1600));
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        input.value = (to * eased).toFixed(2);
        render();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.55 });
    io.observe(svg);
  }
})();
