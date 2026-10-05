(() => {
  'use strict';

  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const app = document.getElementById('app');
  if (!hero || !app) return;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  let compactEntrance = false;
  let arrivals = new WeakMap();
  let rim = null;
  let rimObserver = null;
  let completeRetrieval = null;
  let activeQuery = null;
  let retrievalNote = null;
  let payoffTimer = 0;

  if (!motionQuery.matches) root.classList.add('hero-entrance-armed');

  function finishEntrance() {
    root.classList.remove('hero-entrance-armed', 'hero-entrance-running');
    if (rimObserver) rimObserver.disconnect();
    if (rim) rim.remove();
  }

  function finishRetrieval(payoff) {
    if (!completeRetrieval) return;
    root.classList.remove('hero-retrieving');
    retrievalNote.remove();
    if (payoff && !motionQuery.matches) {
      root.classList.add('hero-retrieval-payoff');
      clearTimeout(payoffTimer);
      payoffTimer = setTimeout(() => root.classList.remove('hero-retrieval-payoff'), 750);
    }
    const resolve = completeRetrieval;
    completeRetrieval = null;
    activeQuery = null;
    resolve();
  }

  window.HeroChatIntro = {
    afterPrompt(startRetrieval, container, topicId) {
      finishRetrieval(false);
      clearTimeout(payoffTimer);
      root.classList.remove('hero-retrieval-payoff');
      if (topicId === 'behind-the-scenes') {
        startRetrieval();
        return Promise.resolve();
      }
      if (!hero.querySelector('.field-canvas')) {
        console.warn('hero: retrieval visualization unavailable; skipping the animated hold.');
        finishEntrance();
        startRetrieval();
        return Promise.resolve();
      }
      const bounds = hero.getBoundingClientRect();
      if (motionQuery.matches || document.hidden || bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
        finishEntrance();
        startRetrieval();
        return Promise.resolve();
      }
      root.classList.add('hero-retrieving');
      retrievalNote = document.createElement('p');
      retrievalNote.className = 'hero-retrieval-note';
      retrievalNote.setAttribute('role', 'status');
      retrievalNote.textContent = 'Retrieving sources...';
      (container || hero.querySelector('.hero-chat')).appendChild(retrievalNote);
      return new Promise(resolve => {
        completeRetrieval = resolve;
        activeQuery = startRetrieval();
      });
    },
  };

  window.HeroFieldEntrance = {
    duration(compact) {
      compactEntrance = compact;
      const duration = compact ? 1250 : 1850;
      root.style.setProperty('--hero-enter-duration', `${duration}ms`);
      return duration;
    },
    layout({ nodes, edges, entry }) {
      const neighbors = nodes.map(() => []);
      for (let i = 0; i < edges.length; i += 2) {
        neighbors[edges[i]].push(edges[i + 1]);
        neighbors[edges[i + 1]].push(edges[i]);
      }
      const distances = new Int32Array(nodes.length).fill(-1);
      const queue = [entry];
      distances[entry] = 0;
      let longest = 0;
      for (let i = 0; i < queue.length; i++) {
        const from = queue[i];
        for (const to of neighbors[from]) {
          if (distances[to] !== -1) continue;
          distances[to] = distances[from] + 1;
          longest = Math.max(longest, distances[to]);
          queue.push(to);
        }
      }
      if (queue.length !== nodes.length) throw new Error('The entrance wave requires a connected field graph.');
      arrivals = new WeakMap(nodes.map((node, i) => [node, .06 + .57 * distances[i] / Math.max(1, longest)]));
    },
    start() {
      root.classList.remove('hero-entrance-armed');
      root.classList.add('hero-entrance-running');
      const ns = 'http://www.w3.org/2000/svg';
      rim = document.createElementNS(ns, 'svg');
      rim.classList.add('hero-entrance-rim');
      rim.setAttribute('aria-hidden', 'true');
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('pathLength', '1');
      rect.setAttribute('x', '1');
      rect.setAttribute('y', '1');
      rim.appendChild(rect);
      app.appendChild(rim);
      const resize = () => {
        const width = app.offsetWidth;
        const height = app.offsetHeight;
        rim.setAttribute('viewBox', `0 0 ${width} ${height}`);
        rect.setAttribute('width', String(Math.max(0, width - 2)));
        rect.setAttribute('height', String(Math.max(0, height - 2)));
        rect.setAttribute('rx', String(parseFloat(getComputedStyle(app.querySelector('.hero-chat')).borderRadius)));
      };
      rimObserver = new ResizeObserver(resize);
      rimObserver.observe(app);
      resize();
    },
    finish: finishEntrance,
    interrupt() {
      finishEntrance();
      finishRetrieval(false);
    },
    nodeProgress(node, progress) {
      return smooth((progress - arrivals.get(node)) / .2);
    },
    edgeProgress(a, b, progress) {
      return smooth((progress - Math.min(arrivals.get(a), arrivals.get(b)) - .08) / .22);
    },
    cameraScale(progress) {
      return 1 + .065 * Math.pow(1 - progress, 3);
    },
    cameraYaw() {
      return 0;
    },
    queryDuration() {
      return compactEntrance ? 2400 : 3000;
    },
    queryLanded(spec) {
      if (spec === activeQuery) finishRetrieval(true);
    },
    draw({ ctx, nodes, edges, progress, colors, compact, clearAt }) {
      if (progress === 1) return;
      const tail = 1 - smooth((progress - .8) / .2);
      const pulse = node => Math.exp(-Math.pow((progress - arrivals.get(node) - .14) / .085, 2)) * tail;
      ctx.save();
      ctx.strokeStyle = colors.accent;
      ctx.fillStyle = colors.accent;
      ctx.lineCap = 'round';
      for (let i = 0; i < edges.length; i += 2) {
        const a = nodes[edges[i]];
        const b = nodes[edges[i + 1]];
        const local = a.cluster >= 0 && a.cluster === b.cluster;
        if (!local && !a.level && !b.level) continue;
        const strength = Math.max(pulse(a), pulse(b));
        if (strength < .08) continue;
        const from = arrivals.get(a) <= arrivals.get(b) ? a : b;
        const to = from === a ? b : a;
        const travel = smooth((progress - arrivals.get(from) - .06) / .16);
        const x = from.sx + (to.sx - from.sx) * travel;
        const y = from.sy + (to.sy - from.sy) * travel;
        ctx.globalAlpha = strength * (local ? .8 : .35) * Math.min(a.vis, b.vis) * clearAt(x, y, .12);
        ctx.lineWidth = local ? 2 : 1.2;
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.shadowColor = colors.accent;
      ctx.shadowBlur = compact ? 8 : 12;
      for (const node of nodes) {
        if (node.cluster < 0) continue;
        const strength = pulse(node);
        if (strength < .04) continue;
        ctx.globalAlpha = strength * node.vis;
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, node.kind === 'hub' ? 5.5 : 3.3, 0, Math.PI * 2);
        ctx.fill();
        if (node.kind === 'hub') {
          ctx.lineWidth = 1.3;
          ctx.globalAlpha *= .65;
          ctx.beginPath();
          ctx.arc(node.sx, node.sy, 7 + 16 * smooth((progress - arrivals.get(node)) / .3), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
})();
