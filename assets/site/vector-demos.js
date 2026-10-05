(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const svgElement = (tag, attrs, parent) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent.appendChild(node);
    return node;
  };
  const revealBody = figure => {
    figure.querySelector('.vector-demo-body').hidden = false;
    figure.querySelector('[data-vector-fallback]').hidden = true;
  };
  const press = (buttons, selected) => buttons.forEach(button => {
    button.setAttribute('aria-pressed', String(button === selected));
  });

  function playback(paint, announce) {
    let timer = 0;
    let frames = [];
    let index = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const complete = () => {
      stop();
      paint(frames[frames.length - 1]);
      announce();
    };
    reduced.addEventListener('change', () => {
      if (reduced.matches && timer) complete();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && timer) complete();
    });
    return {
      show(next) { frames = next; complete(); },
      play(next) {
        stop();
        frames = next;
        index = 0;
        if (reduced.matches) { complete(); return; }
        paint(frames[index]);
        timer = setInterval(() => {
          index++;
          if (index === frames.length - 1) complete();
          else paint(frames[index]);
        }, 200);
      }
    };
  }

  function onFirstView(target, play) {
    if (reduced.matches || !('IntersectionObserver' in window)) return () => {};
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (!reduced.matches) play();
    }, { threshold: 0.5 });
    observer.observe(target);
    return () => observer.disconnect();
  }

  const simd = document.querySelector('[data-simd-demo]');
  if (simd) {
    const unit = values => {
      const norm = Math.hypot(...values);
      return values.map(value => value / norm);
    };
    const query = unit([0.2, -0.4, 0.8, 0.1, -0.7, 0.6, 0.3, -0.2, 0.9, -0.5, 0.4, 0.7, -0.1, 0.5, -0.8, 0.2]);
    const samples = {
      near: unit(query.map((value, i) => value + (i % 3 - 1) * 0.03)),
      far: unit([0.7, 0.3, -0.2, 0.8, 0.1, -0.4, 0.9, 0.5, -0.6, 0.2, -0.3, 0.1, 0.8, -0.4, 0.6, -0.7]),
      opposite: query.map(value => -value)
    };
    const laneButtons = [...simd.querySelectorAll('[data-si-lanes]')];
    const sampleButtons = [...simd.querySelectorAll('[data-si-sample]')];
    let lanes = 4;
    let sample = 'near';
    let terms = [];
    let scalarTiles = [];
    let vectorTiles = [];
    let accumulators = [];

    function buildSIMD() {
      terms = query.map((value, i) => value * samples[sample][i]);
      [['query', query], ['candidate', samples[sample]]].forEach(([name, values]) => {
        const row = simd.querySelector(`[data-si-${name}]`);
        row.replaceChildren(...values.map(value => {
          const node = make('span', '', value.toFixed(3));
          node.title = String(value);
          return node;
        }));
      });
      const tiles = name => {
        const row = simd.querySelector(`[data-si-${name}-terms]`);
        const nodes = terms.map((term, i) => {
          const node = make('span', '', term.toFixed(3));
          node.setAttribute('aria-label', `Dimension ${i + 1}: product ${term.toFixed(3)}`);
          return node;
        });
        row.replaceChildren(...nodes);
        return nodes;
      };
      scalarTiles = tiles('scalar');
      vectorTiles = tiles('vector');
      accumulators = Array.from({ length: lanes }, (_, i) => {
        const node = make('span');
        node.append(make('small', '', `Lane ${i + 1}`), make('strong', '', '0.000'));
        return node;
      });
      simd.querySelector('[data-si-accumulators]').replaceChildren(...accumulators);
    }

    function paintSIMD(tick) {
      const scalarCount = tick;
      const vectorCount = Math.min(query.length, tick * lanes);
      const vectorSteps = query.length / lanes;
      const reductionComplete = tick > vectorSteps;
      [[scalarTiles, scalarCount, 1], [vectorTiles, vectorCount, lanes]].forEach(([tiles, count, width]) => {
        tiles.forEach((tile, i) => {
          tile.classList.toggle('is-done', i < count);
          tile.classList.toggle('is-active', count < query.length && i >= count - width && i < count);
        });
      });
      const sums = Array(lanes).fill(0);
      terms.slice(0, vectorCount).forEach((term, i) => { sums[i % lanes] += term; });
      accumulators.forEach((node, i) => {
        node.lastChild.textContent = sums[i].toFixed(3);
        node.classList.toggle('is-reducing', tick === vectorSteps + 1);
      });
      simd.querySelector('[data-si-scalar-ops]').textContent = `${tick} / 16 MAC operations`;
      simd.querySelector('[data-si-vector-ops]').textContent = `${Math.ceil(vectorCount / lanes)} / ${16 / lanes} vector MAC operations`;
      simd.querySelector('[data-si-scalar-total]').textContent = terms.slice(0, scalarCount).reduce((sum, term) => sum + term, 0).toFixed(5);
      simd.querySelector('[data-si-vector-total]').textContent = reductionComplete
        ? sums.reduce((sum, value) => sum + value, 0).toFixed(5) : '--';
      simd.querySelector('[data-si-reduction]').textContent = reductionComplete
        ? `Complete: ${lanes} lanes to one sum`
        : vectorCount === query.length ? `Ready: combine ${lanes} lanes` : 'Waiting for lane sums';
      simd.querySelector('[data-si-status]').textContent = tick === 16
        ? `Same dot product. SIMD: ${16 / lanes} vector MAC operations + reduction; scalar: 16 MAC operations.`
        : tick === vectorSteps ? 'Packed accumulation is complete; the horizontal reduction is still pending.'
        : tick === vectorSteps + 1 ? 'Horizontal reduction combines the lane sums into one dot product.'
        : reductionComplete ? 'SIMD reduction is complete; the scalar loop is still accumulating.'
        : 'Blue: accumulated. Amber: the current multiply-accumulate operation.';
    }

    const frames = Array.from({ length: 17 }, (_, i) => i);
    const player = playback(paintSIMD, () => {
      simd.querySelector('[data-si-live]').textContent = simd.querySelector('[data-si-status]').textContent +
        ` Dot product ${simd.querySelector('[data-si-vector-total]').textContent}, equal to cosine similarity for these unit vectors.`;
    });
    buildSIMD();
    player.show(frames);
    revealBody(simd);
    const cancelAuto = onFirstView(simd.querySelector('.si-processors'), () => player.play(frames));
    laneButtons.forEach(button => button.addEventListener('click', () => {
      cancelAuto();
      lanes = Number(button.dataset.siLanes);
      press(laneButtons, button);
      buildSIMD();
      player.play(frames);
    }));
    sampleButtons.forEach(button => button.addEventListener('click', () => {
      cancelAuto();
      sample = button.dataset.siSample;
      press(sampleButtons, button);
      buildSIMD();
      player.play(frames);
    }));
    simd.querySelector('[data-si-replay]').addEventListener('click', () => {
      cancelAuto();
      player.play(frames);
    });
  }

  const hnsw = document.querySelector('[data-hnsw-demo]');
  if (hnsw) {
    const points = [
      [44, 55], [70, 105], [58, 170], [110, 35], [132, 95], [130, 170],
      [178, 62], [192, 124], [205, 207], [244, 30], [253, 100], [260, 167],
      [311, 48], [325, 118], [319, 210], [368, 78], [379, 165], [406, 31],
      [439, 86], [429, 205], [483, 45], [490, 129], [504, 195], [535, 91]
    ].map(([x, y], id) => ({ id, x, y, label: String.fromCharCode(65 + id) }));
    const presets = { right: { x: 470, y: 160 }, middle: { x: 295, y: 115 }, left: { x: 90, y: 145 } };
    const graph = points.map(() => new Set());
    const connect = (a, b) => { graph[a].add(b); graph[b].add(a); };
    points.forEach(a => {
      points.filter(b => b !== a).sort((b, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(a.x - c.x, a.y - c.y))
        .slice(0, 2).forEach(b => connect(a.id, b.id));
    });
    [[0, 3], [2, 5], [5, 8], [8, 11], [11, 14], [14, 19], [19, 22]].forEach(([a, b]) => connect(a, b));
    const levels = [
      new Map(graph.map((neighbours, id) => [id, neighbours])),
      new Map([[0, [3, 20]], [3, [0, 6]], [6, [3, 9]], [9, [6, 12]], [12, [9, 15]], [15, [12, 18]], [18, [15, 20]], [20, [0, 18]]]),
      new Map([[0, [6, 20]], [6, [0, 12]], [12, [6, 20]], [20, [0, 12]]]),
      new Map([[0, [20]], [20, [0]]])
    ];
    const plot = hnsw.querySelector('[data-hn-plot]');
    const efInput = hnsw.querySelector('#hn-ef');
    const buttons = [...hnsw.querySelectorAll('[data-hn-query]')];
    const nodeElements = [];
    const edges = [];
    const queryMarkers = [];
    let query = presets.right;
    let exact = [];
    let required = [];
    let boundary = [];
    const layout = [
      { label: 345, offset: 370, scale: 0.9 },
      { label: 228, offset: 245, scale: 0.28 },
      { label: 116, offset: 132, scale: 0.25 },
      { label: 18, offset: 30, scale: 0.22 }
    ];
    const yAt = (point, level) => layout[level].offset + point.y * layout[level].scale;
    const key = (layer, a, b) => `${layer}:${Math.min(a, b)}-${Math.max(a, b)}`;
    const descentLines = [3, 2, 1].map(level => ({
      level,
      node: svgElement('line', { class: 'hn-descent', 'data-from-level': level, 'data-to-level': level - 1 }, plot)
    }));
    let baseLayer;

    [3, 2, 1, 0].forEach(layer => {
      const group = svgElement('g', { class: 'hn-level', 'data-level': layer }, plot);
      if (layer === 0) baseLayer = group;
      svgElement('rect', { x: 0, y: layout[layer].label - 20, width: 560, height: 24, class: 'hn-heading-bg' }, group);
      const label = svgElement('text', { x: 16, y: layout[layer].label, class: 'hn-layer-label' }, group);
      label.textContent = `LEVEL ${layer} | ${layer === 0 ? 'BASE GRAPH | ' : ''}${levels[layer].size} VECTORS`;
      const seen = new Set();
      const ids = [...levels[layer].keys()];
      ids.forEach(id => {
        const neighbours = levels[layer].get(id);
        neighbours.forEach(other => {
          const edgeKey = key(layer, id, other);
          if (seen.has(edgeKey)) return;
          seen.add(edgeKey);
          const a = points[id];
          const b = points[other];
          const node = svgElement('line', {
            x1: a.x, y1: yAt(a, layer), x2: b.x, y2: yAt(b, layer), class: 'hn-edge',
            'data-layer': layer, 'data-from': id, 'data-to': other
          }, group);
          edges.push({ node, key: edgeKey });
        });
      });
      ids.forEach(id => {
        const point = points[id];
        const node = svgElement('g', {
          class: 'hn-node', transform: `translate(${point.x} ${yAt(point, layer)})`,
          'data-layer': layer, 'data-id': id, 'data-x': point.x, 'data-y': point.y
        }, group);
        svgElement('circle', { r: 11 }, node);
        const text = svgElement('text', { dy: '0.35em' }, node);
        text.textContent = point.label;
        nodeElements.push({ node, id, layer });
      });
      const marker = svgElement('g', { class: 'hn-query' }, group);
      svgElement('circle', { r: 14 }, marker);
      svgElement('path', { d: 'M-5 0H5M0-5V5' }, marker);
      queryMarkers.push({ marker, layer });
    });
    [105, 217, 334].forEach(y => svgElement('line', { x1: 16, y1: y, x2: 544, y2: y, class: 'hn-divider' }, plot));

    function search() {
      const ef = efInput.valueAsNumber;
      const cache = new Map();
      const examined = new Set();
      const frames = [];
      const descents = [];
      const rawDistance = id => Math.hypot(points[id].x - query.x, points[id].y - query.y);
      const distance = id => {
        if (!cache.has(id)) cache.set(id, rawDistance(id));
        return cache.get(id);
      };
      const byDistance = (a, b) => distance(a) - distance(b) || a - b;
      const record = (layer, current, status, results = []) => {
        frames.push({ layer, current, status, results, descents: [...descents], checked: [...cache.keys()], examined: new Set(examined) });
      };
      let entry = 0;
      distance(entry);
      record(3, entry, 'Level 3: start at A on the sparsest level.');
      for (let level = 3; level > 0; level--) {
        while (true) {
          let next = entry;
          levels[level].get(entry).forEach(id => {
            examined.add(key(level, entry, id));
            if (distance(id) < distance(next)) next = id;
          });
          record(level, entry, `Level ${level}: check neighbours of ${points[entry].label}.`);
          if (next === entry) break;
          entry = next;
        }
        descents.push({ level, id: entry });
        record(level - 1, entry, `Descend ${level} -> ${level - 1} at ${points[entry].label}.`);
      }
      const visited = new Set([entry]);
      const candidates = [entry];
      const best = [entry];
      while (candidates.length) {
        candidates.sort(byDistance);
        const current = candidates.shift();
        best.sort(byDistance);
        if (best.length >= ef && distance(current) > distance(best[best.length - 1])) break;
        graph[current].forEach(id => {
          if (visited.has(id)) return;
          visited.add(id);
          examined.add(key(0, current, id));
          distance(id);
          if (best.length < ef || distance(id) < distance(best[best.length - 1])) {
            candidates.push(id);
            best.push(id);
            best.sort(byDistance);
            if (best.length > ef) best.pop();
          }
        });
        record(0, current, `Level 0: expand ${points[current].label}; retained ${best.length}/${ef}, frontier ${candidates.length}.`);
      }
      const ranked = points.map(point => point.id).sort((a, b) => rawDistance(a) - rawDistance(b) || a - b);
      exact = ranked.slice(0, 3);
      const cutoff = rawDistance(exact[2]);
      // Include coordinate roundoff from responsive screen-to-graph transforms.
      const atCutoff = id => Math.abs(rawDistance(id) - cutoff) <= 8 * Number.EPSILON *
        Math.max(1, cutoff, rawDistance(id), Math.abs(query.x) + Math.abs(points[id].x), Math.abs(query.y) + Math.abs(points[id].y));
      required = ranked.filter(id => rawDistance(id) < cutoff && !atCutoff(id));
      boundary = ranked.filter(atCutoff);
      const results = best.sort(byDistance).slice(0, 3);
      record(0, null, 'Search complete. Amber nodes are the graph results.', results);
      return frames;
    }

    function paintHNSW(frame) {
      const boundaryHits = frame.results.filter(id => boundary.includes(id)).length;
      const hits = frame.results.filter(id => required.includes(id)).length + Math.min(3 - required.length, boundaryHits);
      const missed = frame.results.length ? [
        ...required.filter(id => !frame.results.includes(id)),
        ...boundary.filter(id => !frame.results.includes(id)).slice(0, Math.max(0, 3 - required.length - boundaryHits))
      ] : [];
      nodeElements.forEach(({ node, id, layer }) => {
        node.classList.toggle('is-checked', frame.checked.includes(id));
        node.classList.toggle('is-current', frame.layer === layer && frame.current === id);
        node.classList.toggle('is-result', layer === 0 && frame.results.includes(id));
        node.classList.toggle('is-missed', layer === 0 && missed.includes(id));
      });
      edges.forEach(({ node, key: edgeKey }) => node.classList.toggle('is-examined', frame.examined.has(edgeKey)));
      descentLines.forEach(({ node, level }) => {
        const step = frame.descents.find(descent => descent.level === level);
        node.style.display = step ? '' : 'none';
        if (!step) return;
        const entry = points[step.id];
        node.dataset.entry = step.id;
        Object.entries({ x1: entry.x, x2: entry.x, y1: yAt(entry, level) + 12, y2: yAt(entry, level - 1) - 12 })
          .forEach(([name, value]) => node.setAttribute(name, value));
      });
      hnsw.querySelector('[data-hn-checks]').textContent = `${frame.checked.length} / 24`;
      hnsw.querySelector('[data-hn-recall]').textContent = frame.results.length ? `${Math.round(hits / 3 * 100)}%` : '--';
      hnsw.querySelector('[data-hn-results]').textContent = frame.results.length ? frame.results.map(id => points[id].label).join(', ') : 'Searching...';
      hnsw.querySelector('[data-hn-status]').textContent = frame.status;
    }

    function prepareSearch() {
      const frames = search();
      queryMarkers.forEach(({ marker, layer }) => marker.setAttribute('transform', `translate(${query.x} ${yAt(query, layer)})`));
      plot.dataset.queryX = query.x;
      plot.dataset.queryY = query.y;
      hnsw.querySelector('#hn-ef-value').textContent = `${efInput.value} candidates`;
      efInput.setAttribute('aria-valuetext', `${efInput.value} retained candidates`);
      hnsw.querySelector('[data-hn-exact]').textContent = exact.map(id => points[id].label).join(', ');
      const tieNote = hnsw.querySelector('[data-hn-ties]');
      tieNote.hidden = boundary.length <= 3 - required.length;
      tieNote.textContent = tieNote.hidden ? '' : `Cutoff tie: ${boundary.map(id => points[id].label).join(', ')} share ` +
        `${3 - required.length} remaining place${3 - required.length === 1 ? '' : 's'}. Interchangeable tied results receive equal recall credit.`;
      return frames;
    }

    const player = playback(paintHNSW, () => {
      hnsw.querySelector('[data-hn-live]').textContent = `Search complete. ${hnsw.querySelector('[data-hn-checks]').textContent} distance checks. ` +
        `Recall at three ${hnsw.querySelector('[data-hn-recall]').textContent}. Results ${hnsw.querySelector('[data-hn-results]').textContent}. ` +
        hnsw.querySelector('[data-hn-ties]').textContent;
    });
    player.show(prepareSearch());
    revealBody(hnsw);
    const cancelAuto = onFirstView(baseLayer, () => player.play(prepareSearch()));
    buttons.forEach(button => button.addEventListener('click', () => {
      cancelAuto();
      query = presets[button.dataset.hnQuery];
      press(buttons, button);
      player.play(prepareSearch());
    }));
    efInput.addEventListener('input', () => {
      cancelAuto();
      player.show(prepareSearch());
    });
    plot.addEventListener('click', event => {
      const location = new DOMPoint(event.clientX, event.clientY).matrixTransform(plot.getScreenCTM().inverse());
      if (location.y < layout[0].offset) return;
      cancelAuto();
      query = { x: Math.max(25, Math.min(535, location.x)), y: Math.max(25, Math.min(215, (location.y - layout[0].offset) / layout[0].scale)) };
      press(buttons, null);
      player.play(prepareSearch());
    });
    hnsw.querySelector('[data-hn-replay]').addEventListener('click', () => {
      cancelAuto();
      player.play(prepareSearch());
    });
  }
})();
