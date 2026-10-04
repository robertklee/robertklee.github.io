(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const effect = params.get('effect') || 'dramatic';
  const dramatic = effect === 'dramatic';
  const durations = {
    depth: [1700, 1100],
    signal: [1750, 1200],
    camera: [1900, 1300],
    hybrid: [1850, 1250],
    dramatic: [1850, 1250],
  };
  const root = document.documentElement;
  const notify = (message, error = false) => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'hero-entrance-spike', message, error }, window.location.origin);
    }
  };

  window.addEventListener('error', event => {
    notify(`Preview error: ${event.message}`, true);
    const message = document.getElementById('spike-error');
    if (message) { message.hidden = false; message.textContent = event.message; }
  });
  window.addEventListener('unhandledrejection', event => {
    notify(`Preview error: ${String(event.reason)}`, true);
  });
  if (effect !== 'baseline' && !Object.hasOwn(durations, effect)) throw new Error(`Unknown entrance direction: ${effect}`);

  root.dataset.spikeEffect = effect;
  root.dataset.spikeMotion = params.get('motion') === 'reduce' ? 'reduce' : 'system';
  root.dataset.spikeCard = params.get('card') === 'fill' ? 'fill' : 'content';
  root.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  document.title = `${effect} - hero entrance preview`;

  // Only this disposable preview overrides the motion query and random source.
  // The real engine then renders its existing reduced-motion path.
  if (root.dataset.spikeMotion === 'reduce') {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => matchMedia(query === '(prefers-reduced-motion: reduce)' ? '(min-width: 0px)' : query);
  }
  let seed = Number(params.get('seed') || 2401);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('The chat seed must be an unsigned 32-bit integer.');
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('DOMContentLoaded', () => {
    if (reducedMotion) {
      notify('Reduced motion: static graph and complete answer; no entrance.');
    } else if (effect === 'baseline') {
      const hero = document.querySelector('.hero');
      let started = false;
      new MutationObserver(() => {
        if (hero.classList.contains('field-entering')) {
          started = true;
          notify('Playing the current entrance. The same seeded chat is used across directions.');
        } else if (started) {
          notify('Entrance complete. Chat continues normally. Replay to compare.');
        }
      }).observe(hero, { attributes: true, attributeFilter: ['class'] });
    }
  });
  if (effect === 'baseline') return;
  if (!reducedMotion) root.classList.add('spike-armed');

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const signal = effect === 'signal' || effect === 'hybrid' || dramatic;
  let compactEntrance = false;
  let arrivals = new WeakMap();
  let rim = null;
  let rimObserver = null;

  window.HeroFieldEntrance = {
    duration(compact) {
      compactEntrance = compact;
      const duration = durations[effect][compact ? 1 : 0];
      root.style.setProperty('--spike-duration', `${duration}ms`);
      return duration;
    },
    layout({ nodes, edges, entry }) {
      if (!signal) return;
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
    start(hero) {
      root.classList.remove('spike-armed');
      root.classList.add('spike-running');
      notify(`Playing ${effect}: graph and chat run together, without cutting the entrance short.`);
      if (!signal) return;
      const app = hero.querySelector('#app');
      const ns = 'http://www.w3.org/2000/svg';
      rim = document.createElementNS(ns, 'svg');
      rim.classList.add('spike-rim');
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
    finish() {
      root.classList.remove('spike-armed', 'spike-running');
      root.classList.add('spike-done');
      if (rimObserver) rimObserver.disconnect();
      if (rim) rim.remove();
      notify(dramatic && root.classList.contains('spike-retrieving')
        ? 'Entrance settled. Retrieval is working; the question remains on screen.'
        : 'Entrance complete. Chat continues normally. Replay to compare.');
    },
    nodeProgress(node, progress) {
      if (signal) return smooth((progress - arrivals.get(node)) / .2);
      if (effect === 'camera') return smooth((progress - .04 - node.phase / (Math.PI * 2) * .07) / .38);
      const depth = node.cluster >= 0 ? .3 : node.z > 750 ? 0 : .13;
      return smooth((progress - depth - node.phase / (Math.PI * 2) * .04) / .32);
    },
    edgeProgress(a, b, progress) {
      const delay = signal
        ? Math.min(arrivals.get(a), arrivals.get(b)) + .08
        : a.cluster >= 0 && a.cluster === b.cluster ? .46 : .2;
      return smooth((progress - delay) / (signal ? .22 : .34));
    },
    cameraScale(progress) {
      const distance = effect === 'camera' ? .22 : effect === 'hybrid' || dramatic ? .065 : 0;
      return 1 + distance * Math.pow(1 - progress, 3);
    },
    cameraYaw(progress) {
      return effect === 'camera' ? -.085 * Math.pow(1 - progress, 3) : 0;
    },
    draw({ ctx, nodes, edges, progress, colors, compact, clearAt }) {
      if (!signal || progress === 1) return;
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

  if (dramatic) {
    let completeRetrieval = null;
    let retrievalNote = null;
    window.HeroChatIntro = {
      afterPrompt(startRetrieval) {
        if (!document.querySelector('.field-canvas')) throw new Error('The retrieval-first preview requires Canvas 2D.');
        root.classList.add('spike-retrieving');
        retrievalNote = document.createElement('p');
        retrievalNote.className = 'spike-retrieval-note';
        retrievalNote.setAttribute('role', 'status');
        retrievalNote.textContent = 'Retrieving sources...';
        document.querySelector('.hero-chat').appendChild(retrievalNote);
        notify('Question complete. Holding the text while retrieval finds the supporting documents.');
        return new Promise(resolve => {
          completeRetrieval = resolve;
          startRetrieval();
        });
      },
    };
    window.HeroFieldEntrance.queryDuration = (spec, duration) => spec.topic === 'intro' ? compactEntrance ? 2400 : 3000 : duration;
    window.HeroFieldEntrance.queryLanded = () => {
      if (!completeRetrieval) return;
      root.classList.remove('spike-retrieving');
      root.classList.add('spike-payoff');
      retrievalNote.remove();
      notify('Sources retrieved. Model output follows. Replay to compare.');
      completeRetrieval();
      completeRetrieval = null;
      setTimeout(() => root.classList.remove('spike-payoff'), 750);
    };
  }
})();
