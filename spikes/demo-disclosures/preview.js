(() => {
  'use strict';

  const variants = {
    collapsed: 'A / On demand',
    first: 'B / Lead with one',
    previews: 'C / Keep a glimpse',
  };
  const root = new URL('../../', location.href);
  const comparison = document.getElementById('comparison');
  const error = document.getElementById('preview-error');
  const width = document.getElementById('width');
  const theme = document.getElementById('theme');
  const compare = document.getElementById('compare');
  const section = document.getElementById('section');
  let panels = [];
  let revision = 0;

  function fail(cause) {
    console.error('Demo disclosure spike failed:', cause);
    error.textContent = cause.message || String(cause);
    error.hidden = false;
    comparison.setAttribute('aria-busy', 'false');
  }

  function selected() {
    return document.querySelector('input[name="variant"]:checked').value;
  }

  function jump(item) {
    const doc = item.frame.contentDocument;
    const target = doc.getElementById(section.value);
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function enhance(item) {
    const doc = item.frame.contentDocument;
    item.frame.contentWindow.createDemoDisclosures();
    const disclosures = [...doc.querySelectorAll('.demo-disclosure')];
    if (disclosures.length !== 5) throw new Error('Expected five work examples in the homepage.');
    disclosures.forEach((details, index) => {
      details.open = item.variant === 'first' && index === 0;
      if (item.variant !== 'previews') details.querySelector('.demo-miniature').remove();
    });
    doc.documentElement.dataset.demoVariant = item.variant;
  }

  function sizeFrames() {
    const available = Math.max(320, comparison.clientWidth - 2);
    const viewport = width.value === 'fit' ? available : Number(width.value);
    panels.forEach(item => {
      const scale = Math.min(1, item.panel.clientWidth / viewport);
      const height = viewport <= 760 ? 844 : 960;
      item.frame.width = String(viewport);
      item.frame.height = String(height);
      item.frame.style.transform = `scale(${scale})`;
      item.stage.style.width = viewport * scale + 'px';
      item.stage.style.height = height * scale + 'px';
    });
  }

  async function prepare(item, current) {
    try {
      const doc = item.frame.contentDocument;
      if (!doc.querySelector('#work')) throw new Error('Could not load the homepage for the preview.');
      doc.documentElement.dataset.theme = theme.value;
      await doc.fonts.ready;
      if (current !== revision) return;
      item.originalHeight = doc.getElementById('work').getBoundingClientRect().height;
      enhance(item);
      const style = doc.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('layout.css', location.href).href;
      const styled = new Promise((resolve, reject) => {
        style.onload = resolve;
        style.onerror = () => reject(new Error('Could not load the spike layout styles.'));
      });
      doc.head.append(style);
      await styled;
      if (current !== revision) return;
      const observer = new ResizeObserver(() => {
        const height = Math.round(doc.getElementById('work').getBoundingClientRect().height);
        const difference = Math.round((1 - height / item.originalHeight) * 100);
        item.metrics.textContent = `Work section: ${height.toLocaleString()}px / ${Math.abs(difference)}% ${difference < 0 ? 'taller' : 'shorter'} than original`;
      });
      observer.observe(doc.getElementById('work'));
      item.observer = observer;
      item.panel.dataset.ready = 'true';
      const target = doc.getElementById(decodeURIComponent(item.frame.contentWindow.location.hash.slice(1)));
      if (target) item.frame.contentWindow.dispatchEvent(new item.frame.contentWindow.HashChangeEvent('hashchange'));
      else jump(item);
      if (panels.every(panel => panel.panel.dataset.ready === 'true')) comparison.setAttribute('aria-busy', 'false');
    } catch (cause) {
      if (current === revision) fail(cause);
    }
  }

  function render() {
    const current = ++revision;
    error.hidden = true;
    comparison.setAttribute('aria-busy', 'true');
    panels.forEach(item => item.observer?.disconnect());
    comparison.replaceChildren();
    comparison.dataset.compare = String(compare.checked);
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ variant: selected(), width: width.value, theme: theme.value, compare: compare.checked })) {
      url.searchParams.set(key, String(value));
    }
    history.replaceState(null, '', url);
    panels = (compare.checked ? Object.keys(variants) : [selected()]).map(variant => {
      const panel = document.createElement('section');
      panel.className = 'panel';
      panel.dataset.variant = variant;
      panel.dataset.ready = 'false';
      panel.innerHTML = '<header class="panel-heading"><h2></h2><p>Loading the original page...</p></header><div class="stage"></div>';
      panel.querySelector('h2').textContent = variants[variant];
      const frame = document.createElement('iframe');
      frame.title = variants[variant] + ' / full website preview';
      const item = { variant, panel, frame, stage: panel.querySelector('.stage'), metrics: panel.querySelector('.panel-heading p') };
      frame.addEventListener('load', () => {
        item.observer?.disconnect();
        prepare(item, current);
      });
      const source = new URL('index.html', root);
      source.searchParams.set('demo-spike', variant);
      frame.src = source.href;
      item.stage.append(frame);
      comparison.append(panel);
      return item;
    });
    sizeFrames();
    document.getElementById('view-note').textContent = compare.checked
      ? 'All three use the same viewport width. Desktop views are scaled down here; switch to one alternative for a full-size read. Previews are static concept sketches, not additional live demos.'
      : 'All original contribution text is retained. The height comparison updates as you open demos. Small sketches in C are static; expand to use the real demo.';
  }

  const params = new URLSearchParams(location.search);
  if (params.has('variant')) {
    const radio = [...document.querySelectorAll('[name="variant"]')].find(input => input.value === params.get('variant'));
    if (radio) radio.checked = true;
    else { fail(new Error('Unknown layout variant. Use collapsed, first, or previews.')); return; }
  }
  for (const [key, input] of Object.entries({ width, theme })) {
    if (!params.has(key)) continue;
    if (![...input.options].some(option => option.value === params.get(key))) {
      fail(new Error(`Unknown ${key} option.`)); return;
    }
    input.value = params.get(key);
  }
  compare.checked = params.get('compare') === 'true';
  document.documentElement.dataset.theme = theme.value;
  document.querySelectorAll('[name="variant"]').forEach(input => input.addEventListener('change', render));
  width.addEventListener('change', render);
  compare.addEventListener('change', render);
  theme.addEventListener('change', () => {
    document.documentElement.dataset.theme = theme.value;
    render();
  });
  section.addEventListener('change', () => panels.filter(item => item.panel.dataset.ready === 'true').forEach(jump));
  document.getElementById('reset').addEventListener('click', render);
  // Rebuild at a new native width so the original-height comparison remains like-for-like.
  let resizeTimer = 0;
  let previousWidth = 0;
  new ResizeObserver(entries => {
    const nextWidth = Math.round(entries[0].contentRect.width);
    if (nextWidth === previousWidth) return;
    const initialized = previousWidth !== 0;
    previousWidth = nextWidth;
    clearTimeout(resizeTimer);
    if (initialized && width.value === 'fit') resizeTimer = setTimeout(render, 180);
    else sizeFrames();
  }).observe(comparison);
  render();
})();
