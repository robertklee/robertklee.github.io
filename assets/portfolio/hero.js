(() => {
  'use strict';

  const root = document.getElementById('hero-editorial');
  const frame = document.getElementById('original-hero-frame');
  const loading = document.getElementById('original-hero-loading');
  const errorPanel = document.getElementById('original-hero-error');
  const retry = document.getElementById('original-hero-retry');
  const themeToggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const previewBar = document.querySelector('.preview-bar');
  const wallpaperCanvas = document.getElementById('editorial-wallpaper');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const defaultThemeColor = themeMeta.content;
  const scriptURL = document.currentScript.src;
  const homepageURL = new URL('../../profile-source.html', scriptURL);
  const stylesheetURLs = ['theme.css', 'hero-frame.css'].map(path => new URL(path, scriptURL));
  let themeInitialized = false;
  let started = false;
  let cue;
  let fade;
  let scrollFrame = 0;
  let paperProgress = null;
  let wallpaper;
  let wallpaperLoaded = false;

  function resizeWallpaper() {
    if (!wallpaperLoaded) return;
    wallpaper.setSizeAttributes();
    const { width, height } = wallpaperCanvas;
    const { naturalWidth, naturalHeight } = wallpaper.imageNode;
    // Granim stretches each axis independently; match the CSS fallback's centered cover instead.
    const scale = Math.max(width / naturalWidth, height / naturalHeight);
    Object.assign(wallpaper.imagePosition, {
      x: (width - naturalWidth * scale) / 2,
      y: (height - naturalHeight * scale) / 2,
      width: naturalWidth * scale,
      height: naturalHeight * scale
    });
    if (reducedMotion.matches) wallpaper.clear();
    else wallpaper.makeGradient();
  }

  function updateWallpaperMotion() {
    const selected = document.body.dataset.study === 'hero-editorial';
    if (reducedMotion.matches) {
      if (wallpaper) {
        wallpaper.pause();
        wallpaper.clear();
      }
      wallpaperCanvas.dataset.motion = 'reduced';
      return;
    }
    if (!wallpaper) {
      if (!selected) return;
      if (typeof window.Granim !== 'function') {
        if (wallpaperCanvas.dataset.motion !== 'unavailable') console.error('The animated wallpaper could not load the bundled Granim library.');
        wallpaperCanvas.dataset.motion = 'unavailable';
        return;
      }
      wallpaper = new window.Granim({
        element: '#editorial-wallpaper',
        direction: 'top-bottom',
        isPausedWhenNotInView: false,
        stateTransitionSpeed: 1500,
        defaultStateName: document.documentElement.getAttribute('data-theme') === 'dark' ? 'sunset' : 'day',
        image: {
          source: new URL('../snow.jpg', scriptURL).href,
          position: ['center', 'center'],
          stretchMode: ['none', 'none'],
          blendingMode: 'multiply'
        },
        states: {
          day: {
            gradients: [['#527be2', '#adc7f2'], ['#6866c5', '#9bbaf0'], ['#357eb7', '#a8cdec']],
            transitionSpeed: 10000
          },
          sunset: {
            gradients: [['#10255b', '#345db2'], ['#20245e', '#5264ba'], ['#102e54', '#287aaa']],
            transitionSpeed: 9000
          }
        }
      });
      // Observe the laid-out canvas, including WebKit's deferred initial sizing.
      wallpaper.onResize('removeListeners');
      wallpaper.pause();
      wallpaperCanvas.dataset.motion = 'loading';
      // Granim schedules its first frame again when the photograph finishes loading.
      wallpaper.imageNode.addEventListener('load', () => {
        wallpaperLoaded = true;
        wallpaper.pause();
        resizeWallpaper();
        updateWallpaperMotion();
      }, { once: true });
      return;
    }
    if (!wallpaperLoaded) return;
    wallpaper.changeState(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sunset' : 'day');
    if (selected && paperProgress !== 1 && !document.hidden) {
      wallpaper.play();
      wallpaperCanvas.dataset.motion = 'running';
    } else {
      wallpaper.pause();
      wallpaperCanvas.dataset.motion = 'paused';
    }
  }

  function updateBackdrop() {
    if (document.body.dataset.study !== 'hero-editorial') return;
    const hero = root.getBoundingClientRect();
    // Finish the fade as the hero leaves the reading area beneath the sticky header.
    const progress = Math.min(1, Math.max(0, (previewBar.getBoundingClientRect().bottom - hero.top) / hero.height));
    if (progress !== paperProgress) {
      document.body.style.setProperty('--hero-paper-progress', String(progress));
      const wasOpaque = paperProgress === 1;
      paperProgress = progress;
      if (wasOpaque !== (progress === 1)) updateWallpaperMotion();
    }
  }

  function updateScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateCue();
      updateBackdrop();
    });
  }

  function syncTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    if (document.body.dataset.study === 'hero-editorial') {
      themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--editorial-bg').trim();
    }
    const content = frame.contentDocument;
    if (content?.querySelector('.hero-viewport')) {
      content.documentElement.setAttribute('data-theme', theme);
      content.getElementById('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.warn('The selected theme could not be saved:', error);
    }
    updateWallpaperMotion();
  }

  function initializeTheme() {
    if (themeInitialized) return;
    let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (error) {
      console.warn('The saved theme could not be read; using the system preference:', error);
    }
    document.documentElement.setAttribute('data-theme', theme);
    window.HeroChat.initThemeToggle(null);
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    themeInitialized = true;
    syncTheme();
  }

  function updateCue() {
    if (!cue) return;
    const scrolled = window.scrollY > 40;
    cue.classList.toggle('cue-hidden', scrolled);
    fade.classList.toggle('cue-hidden', scrolled);
  }

  function showError(error) {
    frame.removeAttribute('data-ready');
    root.setAttribute('aria-busy', 'false');
    loading.hidden = true;
    errorPanel.hidden = false;
    retry.disabled = false;
    console.error('Unable to load the original hero app:', error);
  }

  async function prepareFrame() {
    const content = frame.contentDocument;
    const hero = content?.querySelector('.hero-viewport');
    if (!hero || !content.querySelector('.hero-chat') || !frame.contentWindow.HeroChat) {
      throw new Error('The original homepage hero did not initialize.');
    }
    syncTheme();
    content.documentElement.classList.add('editorial-initializing');
    await Promise.all(stylesheetURLs.map(url => new Promise((resolve, reject) => {
      const stylesheet = content.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = url.href;
      stylesheet.onload = resolve;
      stylesheet.onerror = () => reject(new Error(`The editorial stylesheet could not load: ${url.pathname}`));
      content.head.append(stylesheet);
    })));
    const kicker = content.createElement('div');
    kicker.className = 'original-hero-kicker';
    const label = content.createElement('span');
    label.textContent = 'Robert Lee / An interactive introduction';
    const disclosure = content.createElement('span');
    disclosure.textContent = 'Prewritten conversation';
    kicker.append(label, disclosure);
    hero.prepend(kicker);

    // Keep the original app isolated; its theme and exit scroll belong to the surrounding page.
    cue = content.querySelector('.scroll-cue');
    fade = content.querySelector('.hero-scroll-fade');
    cue.setAttribute('aria-label', 'Explore the editorial stories below');
    cue.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.hash = 'hero-editorial-stories';
    }, true);
    content.querySelector('.scroll-cue-label').textContent = 'Explore the work';
    cue.querySelector('path').setAttribute('d', 'M12 5v14m-5-5 5 5 5-5');
    frame.contentWindow.granimInstance.pause();
    frame.contentWindow.dispatchEvent(new Event('resize'));
    frame.dataset.ready = 'true';
    frame.contentWindow.requestAnimationFrame(() => {
      frame.contentWindow.requestAnimationFrame(() => content.documentElement.classList.remove('editorial-initializing'));
    });
    root.setAttribute('aria-busy', 'false');
    loading.hidden = true;
    errorPanel.hidden = true;
    updateCue();
    updateBackdrop();
  }

  function loadHero() {
    started = true;
    cue = null;
    fade = null;
    retry.disabled = true;
    errorPanel.hidden = true;
    loading.hidden = false;
    root.setAttribute('aria-busy', 'true');
    frame.removeAttribute('data-ready');
    frame.src = homepageURL.href;
  }

  frame.addEventListener('load', () => {
    if (started && frame.contentDocument?.URL !== 'about:blank') prepareFrame().catch(showError);
  });
  frame.addEventListener('error', () => showError(new Error('The original homepage could not be reached.')));
  retry.addEventListener('click', loadHero);
  window.addEventListener('scroll', updateScroll, { passive: true });
  document.addEventListener('visibilitychange', updateWallpaperMotion);
  reducedMotion.addEventListener('change', updateWallpaperMotion);
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.some(entry => entry.target === previewBar)) {
      root.style.setProperty('--preview-height', `${previewBar.getBoundingClientRect().height}px`);
    }
    if (entries.some(entry => entry.target === wallpaperCanvas)) resizeWallpaper();
    updateScroll();
  });
  resizeObserver.observe(previewBar);
  resizeObserver.observe(root);
  resizeObserver.observe(wallpaperCanvas);

  function updateStudy() {
    const selected = document.body.dataset.study === 'hero-editorial';
    themeToggle.hidden = !selected;
    if (selected) {
      initializeTheme();
      syncTheme();
      document.querySelector('.study-nav [aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      updateBackdrop();
      if (!started) loadHero();
    } else {
      themeMeta.content = defaultThemeColor;
      document.body.style.removeProperty('--hero-paper-progress');
      paperProgress = null;
      updateWallpaperMotion();
    }
  }
  document.addEventListener('study-change', updateStudy);
  updateStudy();
})();
