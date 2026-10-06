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

  const accentCards = [...document.querySelectorAll('.card-accent')];
  function paceAccentSheen(card) {
    const animation = card.getAnimations({ subtree: true }).find(animation => animation.animationName === 'card-accent-sheen');
    if (!animation) return;
    const radius = parseFloat(getComputedStyle(card).borderTopRightRadius);
    const width = card.clientWidth;
    const height = card.clientHeight;
    const top = card.clientWidth - radius + 80;
    const cornerStep = Math.PI / 16;
    const cornerChord = 2 * radius * Math.sin(cornerStep / 2);
    const corner = cornerChord * 8;
    const right = height - radius;
    const travel = top + corner + right + 80;
    const frame = (offset, x, y, opacity) => ({
      offset, backgroundPosition: `${x - 80}px ${y - 80}px`, opacity, easing: 'linear',
    });
    const atDistance = distance => .65 + .3 * distance / travel;
    const frames = [
      frame(0, -80, 0, 0),
      frame(.65, -80, 0, 0),
      frame(atDistance(80), 0, 0, .8),
      frame(atDistance(top), width - radius, 0, .8),
    ];
    for (let step = 1; step <= 8; step++) {
      const angle = cornerStep * step;
      frames.push(frame(atDistance(top + cornerChord * step),
        width - radius + radius * Math.sin(angle), radius * (1 - Math.cos(angle)), .8));
    }
    frames.push(
      frame(atDistance(top + corner + right), width, height, .8),
      frame(.95, width, height + 80, 0),
      frame(1, width, height + 80, 0),
    );
    animation.effect.setKeyframes(frames);
  }
  const accentResizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => paceAccentSheen(entry.target));
  });
  accentCards.forEach(card => accentResizeObserver.observe(card));
  reducedMotion.addEventListener('change', () => accentCards.forEach(paceAccentSheen));

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
  // A reload can restore the old scroll position after collapsed records change height.
  window.addEventListener('pageshow', event => {
    if (!event.persisted && window.location.hash) requestAnimationFrame(() => scrollToSection());
  });

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

  // Decode only on user activation; delegated clicks also cover chat-created buttons.
  document.addEventListener('click', event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const button = event.target.closest('button[data-email-reveal]');
    if (!button) return;
    const address = atob('aGVsbG9Acm9iZXJ0a2wuY29t');
    const link = document.createElement('a');
    link.className = button.className;
    link.href = `mailto:${address}`;
    link.textContent = address;
    button.replaceWith(link);
    link.focus({ preventScroll: true });
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


  const careerPlot = document.querySelector('.cm-plot');
  const careerCard = careerPlot?.closest('.career-map');
  const mobileCareer = window.matchMedia('(max-width: 860px)');
  if (careerPlot) {
    const curve = careerPlot.querySelector('.cm-curve');
    const lines = [...curve.querySelectorAll('.cm-curve-line')];
    const flows = lines.map(line => {
      const flow = line.cloneNode();
      flow.setAttribute('class', 'cm-curve-flow');
      line.after(flow);
      return flow;
    });
    const measureCurve = () => {
      lines.forEach((line, index) => {
        if (!line.getClientRects().length) return;
        // Non-scaling strokes need screen-pixel dash lengths, including the mobile SVG transform.
        const matrix = line.getScreenCTM();
        const length = line.getTotalLength();
        let previous = line.getPointAtLength(0).matrixTransform(matrix);
        let renderedLength = 0;
        for (let i = 1; i <= 64; i++) {
          const point = line.getPointAtLength(length * i / 64).matrixTransform(matrix);
          renderedLength += Math.hypot(point.x - previous.x, point.y - previous.y);
          previous = point;
        }
        for (const path of [line, flows[index]]) path.style.setProperty('--curve-length', `${Math.ceil(renderedLength) + 2}px`);
      });
    };
    measureCurve();
    new ResizeObserver(measureCurve).observe(curve);
    let curveVisible = false;
    const syncFlow = () => careerPlot.classList.toggle('is-flowing', curveVisible && !document.hidden && !reducedMotion.matches);
    const flowObserver = new IntersectionObserver(entries => {
      curveVisible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .25);
      syncFlow();
    }, { threshold: [0, .25] });
    flowObserver.observe(curve);
    document.addEventListener('visibilitychange', syncFlow);
    reducedMotion.addEventListener('change', syncFlow);
  }

  // Scroll reveals and count-ups. Only content that starts below the fold is hidden,
  // so nothing already on screen flickers; reduced motion skips all of it.
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

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
    if (el === careerCard && !mobileCareer.matches && careerPlot.classList.contains('is-animated')) careerPlot.classList.add('is-drawn');
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
    careerPlot.classList.add('is-animated');
    const curveObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.25)) return;
      if (!careerPlot.classList.contains('is-drawn')) {
        careerPlot.style.setProperty('--reveal-delay', '0ms');
        careerPlot.classList.add('is-drawn');
      }
      curveObserver.disconnect();
    }, { threshold: 0.25 });
    curveObserver.observe(curve);

    const finishCareer = () => {
      curveObserver.disconnect();
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
