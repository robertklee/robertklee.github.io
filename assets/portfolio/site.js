(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigation = [...document.querySelectorAll('.site-nav a')];

  function scrollToSection(animate = false, focus = false) {
    const id = window.location.hash.slice(1);
    if (!id || id === 'hero-editorial') {
      window.scrollTo({ top: 0, behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant' });
      navigation.forEach(link => link.removeAttribute('aria-current'));
      return;
    }
    const target = document.getElementById(id);
    if (!target) {
      console.warn(`The linked section "${id}" does not exist.`);
      return;
    }
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView({ block: 'start', behavior: animate && !reducedMotion.matches ? 'smooth' : 'instant' });
    if (focus) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (window.location.hash !== link.hash) window.history.pushState(null, '', link.href);
    scrollToSection(true, true);
  });
  window.addEventListener('popstate', () => scrollToSection());
  window.addEventListener('hashchange', () => scrollToSection(true));
  scrollToSection();

  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    const id = visible[0].target.id === 'hero-editorial-content' ? 'hero-editorial-stories' : visible[0].target.id;
    navigation.forEach(link => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-115px 0px -60% 0px', threshold: 0 });
  navigation.forEach(link => {
    const target = document.getElementById(link.hash === '#hero-editorial-stories' ? 'hero-editorial-content' : link.hash.slice(1));
    if (target) observer.observe(target);
  });
})();
