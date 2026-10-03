// "Relevance vs. diversity" figure. A deliberately simple toy on a hand-made
// 2D dataset: closer to the query means more relevant, closer together means
// more alike. The plot shows a neighbourhood graph and the clusters it forms;
// as diversity rises, results that repeat an already-covered neighbourhood
// give way to relevant results from other clusters.
// Illustrative only; it is not the production algorithm.
(() => {
  'use strict';

  const figure = document.querySelector('[data-diversity-demo]');
  if (!figure) return;
  const body = figure.querySelector('.dv-body');
  const svg = figure.querySelector('[data-dv-plot]');
  const input = figure.querySelector('#dv-diversity');
  const output = figure.querySelector('[data-dv-value]');
  const list = figure.querySelector('[data-dv-results]');
  const queryText = figure.querySelector('[data-dv-query]');
  const queryLabel = figure.querySelector('[data-dv-query-label]');
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
  const GRAPH_K = 2;
  const QUERY = { x: 0.5, y: 0.52 };

  const LAYOUT = [
    ['a', 0.58, 0.505], ['a', 0.565, 0.455], ['a', 0.61, 0.505], ['a', 0.595, 0.455], ['a', 0.625, 0.455],
    ['b', 0.38, 0.4], ['b', 0.36, 0.37], ['c', 0.4, 0.7], ['c', 0.37, 0.74],
    ['d', 0.66, 0.7], ['d', 0.69, 0.73], ['e', 0.28, 0.55],
    ['f', 0.8, 0.3], ['g', 0.84, 0.26], ['h', 0.15, 0.2]
  ];

  // Every scenario reuses the same geometry, reflected about the query, so the
  // trade-off plays out identically whichever story is on screen.
  const SCENARIOS = {
    product: {
      label: 'Query',
      query: 'running shoes',
      anchor: 'query',
      flip: [false, false],
      groups: { a: 'Road, cushioned', b: 'Stability', c: 'Trail', d: 'Racing', e: 'Minimalist', f: 'Accessories', g: 'Accessories', h: 'Accessories' },
      titles: [
        'Stride Cushion 5, black', 'Stride Cushion 5, white', 'Stride Cushion 5, navy', 'Stride Cushion 5, wide', 'Stride Cushion 4, black',
        'Guide Stability 12', 'Guide Stability 11', 'Ridge Trail 3', 'Ridge Trail GTX',
        'Tempo Carbon racer', 'Tempo Lite trainer', 'Barefoot Flex',
        'Running socks, 3-pack', 'Gel insoles', 'Reflective running vest'
      ]
    },
    grounding: {
      label: 'Question',
      query: 'What makes great engineers stay?',
      anchor: 'question',
      flip: [true, false],
      groups: { a: 'Compensation', b: 'Growth', c: 'Flexibility', d: 'Team culture', e: 'Managers', f: 'Tangential', g: 'Tangential', h: 'Tangential' },
      titles: [
        'Engineering salary survey', 'Salary survey, summary', 'Salary survey, slide deck', 'Salary survey, FAQ', 'Pay benchmarks, last year',
        'Career ladder guide', 'Mentorship program review', 'Hybrid work policy', 'Remote work survey',
        'Engagement survey results', 'Team health check', 'What great managers do',
        'Office snack vendors', 'Parking permit update', 'Holiday party logistics'
      ]
    },
    feed: {
      label: 'Signal',
      query: 'You watched one sourdough video',
      anchor: 'you',
      flip: [false, true],
      groups: { a: 'Sourdough', b: 'Pizza', c: 'Pastry', d: 'Fermentation', e: 'Gear', f: 'Tangential', g: 'Tangential', h: 'Tangential' },
      titles: [
        'Sourdough starter, day 1', 'Sourdough starter, day 2', 'Sourdough starter, day 3', 'Sourdough starter, day 4', 'Sourdough starter, week 2',
        'Neapolitan pizza at home', 'Cold-fermented pizza dough', 'Laminated croissant dough', 'Rough puff pastry',
        'Kimchi for beginners', 'Homemade kombucha', 'Choosing a Dutch oven',
        'Kitchen remodel tour', 'Weekly grocery haul', 'Celebrity chef drama'
      ]
    }
  };

  let scenario = 'product';
  let docs = [];
  let nodes = [];
  let regions = [];
  let touched = false;

  const PAD = 28;
  let view = { x0: 0, y0: 0, sx: 1, sy: 1 };

  const sim = (a, b) => Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / FALLOFF);
  const px = p => ({ x: PAD + (p.x - view.x0) * view.sx, y: PAD + (p.y - view.y0) * view.sy });

  // Fit the plot to the data, leaving headroom above for cluster labels.
  function fit(points) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const x0 = Math.min(...xs) - 0.05;
    const x1 = Math.max(...xs) + 0.05;
    const y0 = Math.min(...ys) - 0.08;
    const y1 = Math.max(...ys) + 0.05;
    view = { x0, y0, sx: (W - 2 * PAD) / (x1 - x0), sy: (H - 2 * PAD) / (y1 - y0) };
  }

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  // Greedy toy re-rank: each step takes the result with the best balance of
  // relevance and novelty relative to what has already been chosen.
  function rerank(diversity) {
    const picked = [];
    while (picked.length < TOP_N) {
      let best = null;
      let bestScore = -Infinity;
      docs.forEach(d => {
        if (picked.includes(d)) return;
        const overlap = picked.length ? Math.max(...picked.map(p => sim(d, p))) : 0;
        const score = (1 - diversity) * d.rel - diversity * overlap;
        if (score > bestScore + 1e-9) { bestScore = score; best = d; }
      });
      picked.push(best);
    }
    return picked;
  }

  function build() {
    const s = SCENARIOS[scenario];
    docs = LAYOUT.map(([g, x, y], i) => {
      const d = {
        i,
        group: s.groups[g],
        title: s.titles[i],
        x: s.flip[0] ? 2 * QUERY.x - x : x,
        y: s.flip[1] ? 2 * QUERY.y - y : y
      };
      d.rel = sim(QUERY, d);
      return d;
    });
    fit(docs.concat(QUERY));
    docs.forEach(d => { d.p = px(d); });
    if (queryText) queryText.textContent = s.query;
    if (queryLabel) queryLabel.textContent = s.label;

    svg.textContent = '';
    const q = px(QUERY);
    const rings = el('g', { class: 'dv-rings' }, svg);
    [0.1, 0.2, 0.3, 0.4].forEach(r => el('ellipse', { cx: q.x, cy: q.y, rx: r * view.sx, ry: r * view.sy }, rings));

    // Clusters: points of a group that sit together form one soft region.
    regions = [];
    docs.forEach(d => {
      const home = regions.find(r => r.name === d.group && Math.hypot(r.members[0].p.x - d.p.x, r.members[0].p.y - d.p.y) < 70);
      if (home) home.members.push(d); else regions.push({ name: d.group, members: [d] });
    });
    const regionLayer = el('g', { class: 'dv-regions' }, svg);
    const labels = el('g', { class: 'dv-group-labels' }, svg);
    regions.forEach(r => {
      const xs = r.members.map(m => m.p.x);
      const ys = r.members.map(m => m.p.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 20;
      const ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 18;
      r.shape = el('ellipse', { cx, cy, rx, ry, class: 'dv-region' }, regionLayer);
      r.label = el('text', { x: cx, y: cy - ry - 6, 'text-anchor': 'middle' }, labels);
      r.label.textContent = r.name;
    });

    // Neighbourhood graph: each point linked to its nearest neighbours.
    const graph = el('g', { class: 'dv-graph' }, svg);
    const seen = new Set();
    docs.forEach(a => {
      docs.filter(b => b !== a)
        .sort((b, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(a.x - c.x, a.y - c.y))
        .slice(0, GRAPH_K)
        .forEach(b => {
          const key = Math.min(a.i, b.i) + '-' + Math.max(a.i, b.i);
          if (seen.has(key)) return;
          seen.add(key);
          el('line', { x1: a.p.x, y1: a.p.y, x2: b.p.x, y2: b.p.y }, graph);
        });
    });

    const links = el('g', { class: 'dv-links' }, svg);
    const points = el('g', { class: 'dv-points' }, svg);
    nodes = docs.map(d => {
      const link = el('line', { x1: q.x, y1: q.y, x2: d.p.x, y2: d.p.y, class: 'dv-link' }, links);
      const g = el('g', { class: 'dv-point', transform: 'translate(' + d.p.x.toFixed(1) + ' ' + d.p.y.toFixed(1) + ')' }, points);
      const dot = el('circle', { r: 4.5, class: 'dv-dot' }, g);
      const rank = el('text', { class: 'dv-rank', 'text-anchor': 'middle', dy: '0.35em' }, g);
      return { g, dot, rank, link };
    });

    const query = el('g', { class: 'dv-query-mark', transform: 'translate(' + q.x + ' ' + q.y + ')' }, svg);
    el('circle', { r: 9 }, query);
    el('circle', { r: 2.5, class: 'dv-query-core' }, query);
    const qt = el('text', { y: 24, 'text-anchor': 'middle' }, query);
    qt.textContent = s.anchor;
  }

  function render() {
    const diversity = Number(input.value);
    const pct = Math.round(diversity * 100);
    const label = pct === 0 ? 'Off' : pct + '%';
    if (output) output.textContent = label;
    input.setAttribute('aria-valuetext', pct === 0 ? 'Off, relevance only' : pct + ' percent');

    const picked = rerank(diversity);
    nodes.forEach((n, i) => {
      const rank = picked.indexOf(docs[i]);
      n.g.classList.toggle('is-picked', rank >= 0);
      n.link.classList.toggle('is-picked', rank >= 0);
      n.dot.setAttribute('r', rank >= 0 ? 8.5 : 4.5);
      n.rank.textContent = rank >= 0 ? String(rank + 1) : '';
    });
    regions.forEach(r => {
      const covered = r.members.some(m => picked.includes(m));
      r.shape.classList.toggle('is-covered', covered);
      r.label.classList.toggle('is-covered', covered);
    });

    const dupes = picked.map((d, i) => picked.slice(0, i).some(o => sim(d, o) >= DUPLICATE_SIM));
    const groups = new Set(picked.map(d => d.group)).size;
    const total = new Set(docs.map(d => d.group)).size;
    const dupeCount = dupes.filter(Boolean).length;
    const avg = picked.reduce((a, d) => a + d.rel, 0) / picked.length;
    if (stats.groups) stats.groups.textContent = groups + ' of ' + total;
    if (stats.dupes) stats.dupes.textContent = String(dupeCount);
    if (stats.rel) stats.rel.textContent = avg.toFixed(2);

    list.textContent = '';
    picked.forEach((d, i) => {
      const li = document.createElement('li');
      if (dupes[i]) li.className = 'is-dupe';
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
        live.textContent = 'Diversity ' + label + '. Top six covers ' + groups + ' of ' + total + ' groups with ' + dupeCount +
          ' near-duplicate' + (dupeCount === 1 ? '' : 's') + '; average relevance ' + avg.toFixed(2) + '.';
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
