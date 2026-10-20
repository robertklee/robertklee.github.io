(() => {
  'use strict';

  const miniatures = {
    'work-diversity': `
      <g class="mini-fill"><ellipse cx="100" cy="100" rx="72" ry="58"/><ellipse cx="250" cy="82" rx="60" ry="54"/><ellipse cx="410" cy="108" rx="64" ry="53"/><ellipse cx="558" cy="78" rx="60" ry="51"/></g>
      <path class="mini-edge" d="M55 87L90 64L135 81L145 119L108 138L70 121Z M55 87L145 119M90 64L108 138M70 121L135 81
        M214 67L252 49L280 76L269 113L232 108Z M214 67L269 113M252 49L232 108
        M369 96L404 75L447 93L439 130L392 142Z M369 96L439 130M404 75L392 142
        M523 64L560 46L593 74L579 106L539 110Z M523 64L579 106M560 46L539 110"/>
      <path class="mini-query-links" d="M325 29L90 64M325 29L145 119M325 29L252 49M325 29L404 75M325 29L439 130M325 29L560 46"/>
      <g class="mini-node">
        <circle cx="55" cy="87" r="5"/><circle cx="90" cy="64" r="8"/><circle cx="135" cy="81" r="5"/><circle cx="145" cy="119" r="8"/><circle cx="108" cy="138" r="5"/><circle cx="70" cy="121" r="5"/>
        <circle cx="214" cy="67" r="5"/><circle cx="252" cy="49" r="8"/><circle cx="280" cy="76" r="5"/><circle cx="269" cy="113" r="5"/><circle cx="232" cy="108" r="5"/>
        <circle cx="369" cy="96" r="5"/><circle cx="404" cy="75" r="8"/><circle cx="447" cy="93" r="5"/><circle cx="439" cy="130" r="8"/><circle cx="392" cy="142" r="5"/>
        <circle cx="523" cy="64" r="5"/><circle cx="560" cy="46" r="8"/><circle cx="593" cy="74" r="5"/><circle cx="579" cy="106" r="5"/><circle cx="539" cy="110" r="5"/>
      </g>
      <g class="mini-selected"><circle cx="90" cy="64" r="8"/><circle cx="145" cy="119" r="8"/><circle cx="252" cy="49" r="8"/><circle cx="404" cy="75" r="8"/><circle cx="439" cy="130" r="8"/><circle cx="560" cy="46" r="8"/></g>
      <circle class="mini-query-halo" cx="325" cy="29" r="20"/>
      <path class="mini-warm" d="M325 18L336 29L325 40L314 29Z"/>`,
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
      if (chapter.id === 'work-diversity') {
        details.classList.add('demo-disclosure-featured');
        svg.setAttribute('viewBox', '0 0 640 180');
        summary.querySelector('.demo-summary-copy').after(svg);
        const note = document.createElement('span');
        note.className = 'demo-preview-note';
        note.textContent = 'One query. Results across more topics.';
        const action = summary.querySelector('.demo-summary-action');
        action.before(note);
        action.querySelector('.demo-explore').textContent = 'Try the interactive demo';
      }

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
