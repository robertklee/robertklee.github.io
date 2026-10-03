// "Intent to operators" figure. A request is split into phrases; each phrase
// that fits a small, typed operator set becomes a filter (must match) or a
// boost (ranks higher), checked against the index schema before it runs.
// Filters are logical combinations of eq, ne, and, or over categorical
// (low-cardinality string, string[], boolean) fields; boosts are Lucene term
// boosts. Anything outside the set is left to ranking rather than guessed.
// The sample index and requests are illustrative only.
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

  // [name, type, in the operator set]: only categorical fields qualify.
  const FIELDS = [
    ['category', 'string', true], ['city', 'string', true], ['district', 'string', true],
    ['tags', 'string[]', true], ['parking', 'boolean', true],
    ['description', 'text', false], ['rate', 'number', false], ['location', 'geo point', false]
  ];
  const TYPES = Object.fromEntries(FIELDS.map(([name, type]) => [name, type]));

  // Each request is a list of segments: plain text, or a phrase with the
  // operator it maps to. kind: filter | boost | rank.
  const REQUESTS = {
    constraints: [
      { text: 'Pet-friendly', kind: 'filter', op: 'eq', field: 'tags', expr: "tags/any(t: t eq 'pet-friendly')" },
      ' ',
      { text: 'boutique or resort', kind: 'filter', op: 'eq \u00B7 or', field: 'category', expr: "(category eq 'Boutique' or category eq 'Resort')" },
      ' hotel with ',
      { text: 'free parking', kind: 'filter', op: 'eq', field: 'parking', expr: 'parking eq true' },
      ', ',
      { text: 'away from downtown', kind: 'filter', op: 'ne', field: 'district', expr: "district ne 'Downtown'" }
    ],
    preferences: [
      { text: 'Seattle', kind: 'filter', op: 'eq', field: 'city', expr: "city eq 'Seattle'" },
      ' hotel, ',
      { text: 'ideally boutique', kind: 'boost', op: 'boost ^3', field: 'category', expr: 'category:Boutique^3' },
      ', ',
      { text: 'bonus points for a rooftop bar', kind: 'boost', op: 'boost ^2', field: 'tags', expr: 'tags:"rooftop-bar"^2' }
    ],
    open: [
      { text: 'A quiet place my parents would love', kind: 'rank', op: 'no operator', expr: 'Left to semantic ranking' },
      ', ',
      { text: 'with a pool', kind: 'filter', op: 'eq', field: 'tags', expr: "tags/any(t: t eq 'pool')" },
      ', ',
      { text: 'under $250', kind: 'rank', op: 'outside set', field: 'rate', expr: 'Numeric range: left to ranking' }
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

  FIELDS.forEach(([name, type, inSet]) => {
    const chip = make('li', 'ag-field');
    chip.dataset.field = name;
    if (!inSet) chip.dataset.out = '';
    chip.append(make('span', 'ag-field-name', name), make('span', 'ag-field-type', type));
    if (!inSet) chip.append(make('span', 'cv-sr-only', '(outside the operator set)'));
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
      if (s.field && s.kind === 'rank') {
        check.textContent = '\u2717 ' + s.field + ' \u00B7 ' + TYPES[s.field];
        check.setAttribute('aria-label', 'Field ' + s.field + ' is ' + TYPES[s.field] + ', outside the operator set');
      } else if (s.field) {
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
