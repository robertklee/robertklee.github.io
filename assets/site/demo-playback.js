(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  window.createDemoPlayback = ({ target, pauseButton, loopNote, paint, announce, stepMs = 200 }) => {
    const pauseIcon = pauseButton.querySelector('[data-demo-pause-icon]');
    const playIcon = pauseButton.querySelector('[data-demo-play-icon]');
    let timer = 0;
    let repeatTimer = 0;
    let frames = [];
    let index = 0;
    let inView = false;
    let paused = false;
    const stop = () => { clearInterval(timer); timer = 0; };
    const clearRepeat = () => { clearTimeout(repeatTimer); repeatTimer = 0; };
    const canRepeat = () => inView && !paused && !reduced.matches && !document.hidden;
    const complete = () => {
      stop();
      index = frames.length - 1;
      paint(frames[index]);
      announce();
      clearRepeat();
      if (canRepeat()) repeatTimer = setTimeout(() => {
        repeatTimer = 0;
        if (canRepeat()) play(frames);
      }, 2000);
    };
    const run = () => {
      timer = setInterval(() => {
        index++;
        if (index === frames.length - 1) complete();
        else paint(frames[index]);
      }, stepMs);
    };
    const show = next => {
      clearRepeat();
      frames = next;
      complete();
    };
    const play = next => {
      clearRepeat();
      stop();
      frames = next;
      index = 0;
      if (reduced.matches || paused) { complete(); return; }
      paint(frames[index]);
      run();
    };
    const syncControls = () => {
      pauseButton.hidden = reduced.matches || !('IntersectionObserver' in window);
      const label = paused ? 'Resume animation' : 'Pause animation';
      if (pauseIcon && playIcon) {
        pauseIcon.toggleAttribute('hidden', paused);
        playIcon.toggleAttribute('hidden', !paused);
        pauseButton.setAttribute('aria-label', label);
        pauseButton.title = label;
      } else {
        pauseButton.textContent = label;
      }
      loopNote.hidden = pauseButton.hidden;
    };
    const syncCycle = () => {
      clearRepeat();
      syncControls();
      if (canRepeat()) {
        if (timer) return;
        if (index === frames.length - 1) {
          index = 0;
          paint(frames[index]);
        }
        run();
      } else {
        stop();
        if (reduced.matches) show(frames);
      }
    };
    syncControls();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        const visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5);
        if (visible === inView) return;
        inView = visible;
        syncCycle();
      }, { threshold: [0, 0.5] });
      observer.observe(target);
    }
    reduced.addEventListener('change', () => {
      if (reduced.matches || inView) syncCycle();
      else syncControls();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && timer) complete();
      syncCycle();
    });
    pauseButton.addEventListener('click', () => {
      paused = !paused;
      syncCycle();
    });
    return {
      show,
      play,
      replay(next = frames) {
        paused = false;
        syncControls();
        play(next);
      }
    };
  };
})();
