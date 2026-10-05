(() => {
  'use strict';

  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigation = [...document.querySelectorAll('.site-nav a')];

  // Theme: index.js owns the toggle (circular reveal); keep the browser chrome in step.
  function syncThemeColor() {
    const background = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (themeMeta && background) themeMeta.content = background;
    document.dispatchEvent(new CustomEvent('site:themechange', { detail: { theme: root.dataset.theme } }));
  }
  new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  syncThemeColor();

  // Header height drives the hero's viewport-filling height.
  new ResizeObserver(() => {
    root.style.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
  }).observe(header);

  let scrollFrame = 0;
  function onScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // In-page navigation: smooth scroll, open targeted records, and move focus.
  function scrollToSection(animate = false, focus = false) {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const behavior = animate && !reducedMotion.matches ? 'smooth' : 'instant';
    if (!id || id === 'top') {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView({ block: 'start', behavior });
    if (focus) {
      if (!target.hasAttribute('tabindex') && !target.matches('a, button, summary, input')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.location.hash !== link.hash) window.history.pushState(null, '', link.hash === '#top' ? window.location.pathname : link.href);
    scrollToSection(true, link.hash !== '#top');
  });
  window.addEventListener('popstate', () => scrollToSection());
  if (window.location.hash) scrollToSection();

  // Highlight the section in view.
  const sections = navigation.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
    const active = sections.filter(section => visible.has(section));
    const current = active.find(section => !active.some(other => other !== section && section.contains(other)));
    navigation.forEach(link => {
      if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  sections.forEach(section => observer.observe(section));

  // Resume: the path stays base64-encoded so crawlers that scrape links skip it.
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-profile-resume]')) {
      window.open(atob('L3IvZG9jcy9kb2MtNTYzNGZjMmY0NmUzNTU0NjJmM2YwMGVhNDIyYWIxMzMucGRm'), '_blank', 'noopener,noreferrer');
    }
  });

  // Expand or collapse every record in a section.
  document.querySelectorAll('[data-expand-all]').forEach(button => {
    const list = document.getElementById(button.getAttribute('aria-controls'));
    if (!list) return;
    const records = [...list.querySelectorAll('details.cv-details')];
    const sync = () => {
      const allOpen = records.length > 0 && records.every(record => record.open);
      button.setAttribute('aria-expanded', String(allOpen));
      button.firstChild.textContent = allOpen ? 'Collapse all ' : 'Expand all ';
      button.lastElementChild.textContent = allOpen ? '\u2212' : '+';
    };
    button.addEventListener('click', () => {
      const open = !records.every(record => record.open);
      records.forEach(record => { record.open = open; });
      sync();
    });
    records.forEach(record => record.addEventListener('toggle', sync));
    sync();
  });


  // Scroll reveals and count-ups. Only content that starts below the fold is hidden,
  // so nothing already on screen flickers; reduced motion skips all of it.
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

  const careerPlot = document.querySelector('.cm-plot');
  const careerCard = careerPlot?.closest('.career-map');

  const countUp = (el, delay) => {
    const text = el.textContent;
    const parts = text.split(/(\d+(?:\.\d+)?)/);
    if (parts.length < 2) return;
    const visual = document.createElement('span');
    const spoken = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    spoken.className = 'cv-sr-only';
    spoken.textContent = text;
    el.replaceChildren(visual, spoken);
    const render = progress => {
      visual.textContent = parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const decimals = (part.split('.')[1] || '').length;
        return (parseFloat(part) * progress).toFixed(decimals);
      }).join('');
    };
    render(0);
    const duration = 1400;
    setTimeout(() => {
      const start = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - start) / duration);
        render(1 - Math.pow(1 - t, 4));
        if (t < 1) requestAnimationFrame(tick);
        else visual.textContent = text;
      };
      requestAnimationFrame(tick);
    }, delay);
  };

  const reveal = (el, delay = 0) => {
    el.style.setProperty('--reveal-delay', `${delay}ms`);
    el.classList.add('is-revealed');
    if (el === careerCard && careerPlot.classList.contains('is-animated')) careerPlot.classList.add('is-drawn');
    el.querySelectorAll('[data-count]').forEach(counter => countUp(counter, delay + 150));
    revealer.unobserve(el);
  };
  const revealer = new IntersectionObserver(entries => {
    entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach((entry, i) => reveal(entry.target, Math.min(i, 5) * 80));
  }, { rootMargin: '0px 0px -8% 0px' });
  // Keyboard focus can land just inside the margin above; never leave a focused element invisible.
  document.addEventListener('focusin', event => {
    const hidden = event.target instanceof Element && event.target.closest('.reveal:not(.is-revealed)');
    if (hidden) reveal(hidden);
  });

  const fold = window.innerHeight;
  document.querySelectorAll([
    '.section-heading', '.cv-about > *', '.chapter-copy', '.chapter-figure', '.career-map',
    '.cv-records > *', '.impact-stats > li', '.award-cards > li', '.award-list > li', '.contact-card',
  ].join(',')).forEach(el => {
    if (el.getBoundingClientRect().top <= fold) return;
    el.classList.add('reveal');
    revealer.observe(el);
  });

  if (careerCard?.classList.contains('reveal')) {
    const curve = careerPlot.querySelector('.cm-curve');
    const lines = [...curve.querySelectorAll('.cm-curve-line')];
    const measureCurve = () => {
      lines.forEach(line => {
        if (!line.getClientRects().length) return;
        // Non-scaling strokes need dash lengths in screen pixels, including the mobile SVG transform.
        const matrix = line.getScreenCTM();
        const length = line.getTotalLength();
        let previous = line.getPointAtLength(0).matrixTransform(matrix);
        let renderedLength = 0;
        for (let i = 1; i <= 64; i++) {
          const point = line.getPointAtLength(length * i / 64).matrixTransform(matrix);
          renderedLength += Math.hypot(point.x - previous.x, point.y - previous.y);
          previous = point;
        }
        line.style.setProperty('--curve-length', `${Math.ceil(renderedLength) + 2}px`);
      });
    };
    measureCurve();
    new ResizeObserver(measureCurve).observe(curve);
    careerPlot.classList.add('is-animated');

    const finishCareer = () => {
      careerPlot.classList.remove('is-animated');
      careerCard.classList.remove('reveal');
      revealer.unobserve(careerCard);
    };
    careerPlot.addEventListener('focusin', finishCareer);
    reducedMotion.addEventListener('change', event => {
      if (event.matches) finishCareer();
    });
  }
})();
