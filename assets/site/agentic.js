// "Intent to operators" figure. A request is split into phrases; each phrase
// that fits a small, typed operator vocabulary becomes a filter (must match)
// or a boost (ranks higher), checked against the index schema before it runs.
// Anything outside the vocabulary is left to ranking rather than guessed.
// Sample index, operator names, and syntax are illustrative only.
(() => {
  'use strict';

  const figure = document.querySelector('[data-agentic-demo]');
  if (!figure) return;
  const body = figure.querySelector('.ag-body');
  const request = figure.querySelector('[data-ag-request]');
  const schema = figure.querySelector('[data-ag-schema]');
  const ops = figure.querySelector('[data-ag-ops]');
  const out = {
    filter: figure.querySelector('[data-ag-filter]'),
    boost: figure.querySelector('[data-ag-boost]')
  };
  const live = figure.querySelector('[data-ag-live]');
  const buttons = [...figure.querySelectorAll('[data-request]')];
  if (!body || !request || !ops) return;

  const FIELDS = [
    ['category', 'string'], ['tags', 'string[]'], ['rate', 'number'], ['rating', 'number'],
    ['parking', 'boolean'], ['location', 'geo point'], ['renovated', 'date']
  ];
  const TYPES = Object.fromEntries(FIELDS);

  // Each request is a list of segments: plain text, or a phrase with the
  // operator it maps to. kind: filter | boost | rank.
  const REQUESTS = {
    constraints: [
      { text: 'Pet-friendly', kind: 'filter', op: 'Has tag', field: 'tags', expr: "tags/any(t: t eq 'pet-friendly')" },
      ' hotel ',
      { text: 'near the Seattle waterfront', kind: 'filter', op: 'Within', field: 'location', expr: 'geo.distance(location, POINT(-122.34 47.61)) le 2' },
      ' with ',
      { text: 'free parking', kind: 'filter', op: 'Equals', field: 'parking', expr: 'parking eq true' },
      ', ',
      { text: 'under $200 a night', kind: 'filter', op: 'Range', field: 'rate', expr: 'rate lt 200' }
    ],
    preferences: [
      { text: 'Boutique', kind: 'filter', op: 'Equals', field: 'category', expr: "category eq 'Boutique'" },
      ' hotel, ',
      { text: 'recently renovated', kind: 'boost', op: 'Prefer recent', field: 'renovated', expr: 'freshness(renovated, P2Y)' },
      ', ',
      { text: 'ideally with a rooftop bar', kind: 'boost', op: 'Prefer tag', field: 'tags', expr: "tags/any(t: t eq 'rooftop-bar')" }
    ],
    open: [
      { text: 'A quiet place my parents would love', kind: 'rank', op: 'No operator', expr: 'Left to semantic ranking' },
      ', ',
      { text: 'under $250', kind: 'filter', op: 'Range', field: 'rate', expr: 'rate lt 250' }
    ]
  };

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const STEP_MS = 420;
  let timers = [];
  let current = 'constraints';

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  FIELDS.forEach(([name, type]) => {
    const chip = make('li', 'ag-field');
    chip.dataset.field = name;
    chip.append(make('span', 'ag-field-name', name), make('span', 'ag-field-type', type));
    schema.appendChild(chip);
  });

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function render(key, animate) {
    clearTimers();
    current = key;
    const segments = REQUESTS[key];
    const phrases = segments.filter(s => typeof s === 'object');

    request.textContent = '';
    const marks = phrases.map(() => null);
    let p = 0;
    segments.forEach(s => {
      if (typeof s === 'string') { request.append(s); return; }
      const mark = make('mark', 'ag-phrase ag-' + s.kind, s.text);
      marks[p++] = mark;
      request.append(mark);
    });
    request.append('.');

    ops.textContent = '';
    const rows = phrases.map(s => {
      const li = make('li', 'ag-op ag-' + s.kind);
      li.append(make('span', 'ag-op-phrase', '\u201C' + s.text + '\u201D'));
      const badge = make('span', 'ag-op-kind', s.op);
      li.append(badge);
      li.append(make('code', 'ag-op-expr', s.expr));
      const check = make('span', 'ag-op-check');
      if (s.field) {
        check.textContent = '\u2713 ' + s.field + ' \u00B7 ' + TYPES[s.field];
        check.setAttribute('aria-label', 'Validated: field ' + s.field + ' exists and is ' + TYPES[s.field]);
      } else {
        check.textContent = '\u2192 ranking';
        check.setAttribute('aria-label', 'No filter applied');
      }
      li.append(check);
      return li;
    });
    rows.forEach(r => ops.appendChild(r));

    const filters = phrases.filter(s => s.kind === 'filter');
    const boosts = phrases.filter(s => s.kind === 'boost');
    if (out.filter) out.filter.textContent = filters.length ? filters.map(s => s.expr).join('\nand ') : 'none';
    if (out.boost) out.boost.textContent = boosts.length ? boosts.map(s => s.expr).join('\n') : 'none';

    const chips = [...schema.children];
    chips.forEach(c => { c.className = 'ag-field'; });

    const reveal = i => {
      const s = phrases[i];
      marks[i].classList.add('is-on');
      rows[i].classList.add('is-on');
      const chip = s.field && chips.find(c => c.dataset.field === s.field);
      if (chip) chip.classList.add('is-used', 'ag-' + s.kind);
    };
    const finish = () => {
      figure.classList.add('is-done');
      if (live) {
        live.textContent = filters.length + ' filter' + (filters.length === 1 ? '' : 's') + ', ' + boosts.length + ' boost' +
          (boosts.length === 1 ? '' : 's') + (phrases.some(s => s.kind === 'rank') ? '; the rest is left to ranking.' : '; every phrase validated.');
      }
    };

    figure.classList.remove('is-done');
    if (!animate || reduced.matches) {
      phrases.forEach((_, i) => reveal(i));
      finish();
      return;
    }
    phrases.forEach((_, i) => timers.push(setTimeout(() => reveal(i), 200 + i * STEP_MS)));
    timers.push(setTimeout(finish, 200 + phrases.length * STEP_MS));
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    render(button.dataset.request, true);
  }));

  body.hidden = false;
  const autoplay = !reduced.matches && 'IntersectionObserver' in window;
  render(current, false);
  if (autoplay) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      render(current, true);
    }, { threshold: 0.5 });
    io.observe(ops);
  }
})();
