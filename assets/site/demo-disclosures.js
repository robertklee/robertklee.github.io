(() => {
  'use strict';

  const miniatures = {
    'work-diversity': `
      <ellipse class="mini-fill" cx="48" cy="45" rx="38" ry="30"/><ellipse class="mini-fill" cx="146" cy="50" rx="40" ry="32"/>
      <path class="mini-edge" d="M95 50L28 35M95 50L62 60M95 50L140 30M95 50L166 60M28 35L52 26L62 60L28 35M140 30L166 60L133 68Z"/>
      <g class="mini-node"><circle cx="28" cy="35" r="5"/><circle cx="52" cy="26" r="4"/><circle cx="62" cy="60" r="5"/><circle cx="140" cy="30" r="5"/><circle cx="166" cy="60" r="5"/><circle cx="133" cy="68" r="4"/></g>
      <g class="mini-selected"><circle cx="28" cy="35" r="5"/><circle cx="140" cy="30" r="5"/><circle cx="166" cy="60" r="5"/></g>
      <path class="mini-warm" d="M95 42L103 50L95 58L87 50Z"/><text x="100" y="98" text-anchor="middle">Relevance + coverage</text>`,
    'work-agentic': `
      <rect class="mini-fill" x="8" y="12" width="184" height="23" rx="5"/><text x="100" y="28" text-anchor="middle">A request in plain words</text>
      <path class="mini-edge" d="M100 35V44M49 44H151M49 44V51M151 44V51"/>
      <rect class="mini-node" x="12" y="51" width="74" height="24" rx="5"/><rect class="mini-node" x="114" y="51" width="74" height="24" rx="5"/>
      <text x="49" y="67" text-anchor="middle">Filter</text><text x="151" y="67" text-anchor="middle">Boost</text>
      <text x="100" y="98" text-anchor="middle">Filters and boosts, checked</text>`,
    'work-quantization': `
      <text x="6" y="23">FP32</text><text x="6" y="52">INT8</text><text x="6" y="81">1-bit</text>
      <rect class="mini-fill" x="56" y="9" width="138" height="18" rx="3"/><rect class="mini-selected" x="56" y="38" width="35" height="18" rx="3"/><rect class="mini-warm" x="56" y="67" width="5" height="18" rx="2"/>
      <text x="100" y="105" text-anchor="middle">Smaller representations</text>`,
    'work-simd': `
      <text x="6" y="20">Scalar</text><text x="6" y="64">SIMD</text><path class="mini-edge" d="M65 16H191"/>
      <g class="mini-node"><rect x="69" y="8" width="18" height="16" rx="3"/><rect x="103" y="8" width="18" height="16" rx="3"/><rect x="137" y="8" width="18" height="16" rx="3"/><rect x="171" y="8" width="18" height="16" rx="3"/></g>
      <rect class="mini-fill" x="63" y="42" width="132" height="34" rx="5"/><g class="mini-selected"><rect x="69" y="51" width="24" height="16" rx="3"/><rect x="101" y="51" width="24" height="16" rx="3"/><rect x="133" y="51" width="24" height="16" rx="3"/><rect x="165" y="51" width="24" height="16" rx="3"/></g>
      <text x="100" y="101" text-anchor="middle">Calculate in parallel</text>`,
    'work-hnsw': `
      <path class="mini-edge" d="M20 16H180M20 46H180M20 78H180M55 16L140 16L118 46L90 78M32 78L60 78L90 78L125 78L166 78"/>
      <g class="mini-node"><circle cx="55" cy="16" r="5"/><circle cx="140" cy="16" r="5"/><circle cx="40" cy="46" r="4"/><circle cx="80" cy="46" r="4"/><circle cx="118" cy="46" r="5"/><circle cx="160" cy="46" r="4"/><circle cx="32" cy="78" r="4"/><circle cx="60" cy="78" r="4"/><circle cx="90" cy="78" r="5"/><circle cx="125" cy="78" r="4"/><circle cx="166" cy="78" r="4"/></g>
      <path d="M55 16H140L118 46L90 78" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="100" y="105" text-anchor="middle">Search with fewer comparisons</text>`,
  };

  window.createDemoDisclosures = () => {
    const chapters = [...document.querySelectorAll('#work .chapter')].filter(chapter => !chapter.querySelector('.demo-disclosure'));
    const entries = chapters.map(chapter => {
      const copy = chapter.querySelector('.chapter-copy');
      const figure = chapter.querySelector('.chapter-figure');
      const title = figure?.querySelector('.figure-heading h4');
      const description = figure?.querySelector('.figure-heading p:last-child');
      if (!copy?.querySelector('.chapter-points') || !title || !description || !miniatures[chapter.id]) {
        throw new Error(`Demo disclosure: incomplete contribution or preview for ${chapter.id}.`);
      }
      return { chapter, copy, figure, title, description };
    });

    entries.forEach(({ chapter, copy, figure, title, description }) => {
      const intro = document.createElement('div');
      intro.className = 'chapter-copy-intro';
      const support = document.createElement('div');
      support.className = 'chapter-copy-support';
      let supporting = false;
      [...copy.children].forEach(child => {
        if (child.classList.contains('chapter-points')) supporting = true;
        (supporting ? support : intro).append(child);
      });
      copy.append(intro, support);

      const details = document.createElement('details');
      details.className = 'demo-disclosure';
      details.id = chapter.id + '-demo';
      const summary = document.createElement('summary');
      summary.innerHTML = `
        <span class="demo-summary-copy"><span class="demo-summary-kicker">Interactive demo</span>
          <span class="demo-summary-title"></span><span class="demo-summary-description"></span></span>
        <span class="demo-summary-action"><span class="demo-explore">Explore demo</span><span class="demo-hide">Hide demo</span></span>`;
      const label = summary.querySelector('.demo-summary-title');
      label.textContent = title.textContent;
      label.id = chapter.id + '-demo-title';
      figure.setAttribute('aria-labelledby', label.id);
      summary.querySelector('.demo-summary-description').textContent = description.dataset.demoPreview || description.textContent;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'demo-miniature');
      svg.setAttribute('viewBox', '0 0 200 112');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.innerHTML = miniatures[chapter.id];
      summary.prepend(svg);

      const close = document.createElement('button');
      close.className = 'demo-close';
      close.type = 'button';
      close.textContent = 'Hide demo';
      close.setAttribute('aria-label', `Hide ${copy.querySelector('h4').textContent} demo`);
      close.addEventListener('click', () => {
        details.open = false;
        summary.focus({ preventScroll: true });
        const rect = summary.getBoundingClientRect();
        if (rect.top < document.querySelector('.site-header').getBoundingClientRect().bottom || rect.bottom > window.innerHeight) {
          summary.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      });
      figure.before(details);
      details.append(summary, figure, close);
    });
  };

  if (document.body.hasAttribute('data-demo-previews')) window.createDemoDisclosures();
})();
