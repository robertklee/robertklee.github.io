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
    const current = sections.find(section => visible.has(section));
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
})();
