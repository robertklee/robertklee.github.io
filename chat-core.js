// Shared "reasoning model" chat engine used by both the homepage hero
// (index.js) and the 404 page (404.js). It bundles the pieces both pages need:
// token streaming, the collapsible chain-of-thought fold logic, the
// retry/model picker, the animated mountain backdrop, and the theme toggle.
// Everything is exposed on the global `HeroChat` object; page scripts supply
// only their own content and orchestration.
window.HeroChat = (function () {
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reused for every collapsible "thinking" trace.
  var CHEVRON_SVG =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Model line-up for the "retry with a different model" control, grouped by
  // capability tier (frontier -> balanced -> efficient) and sorted within tier.
  var MODEL_GROUPS = [
    ['Claude Fable 5', 'Claude Mythos 5 - Research Preview', 'Claude Opus 5', 'Gemini 3.1 Pro', 'GPT-5.6 Sol'], // frontier
    ['Claude Sonnet 5', 'GPT-5.6 Terra'], // balanced
    ['Claude Haiku 4.5', 'GPT-5.6 Luna'] // efficient
  ];
  var MODEL_GROUP_LABELS = ['Frontier', 'Balanced', 'Efficient'];
  var MODELS = [];
  var MODEL_GROUP_OF = []; // tier index per flat model index (for tier labels)
  MODEL_GROUPS.forEach(function (g, gi) {
    g.forEach(function (name) { MODELS.push(name); MODEL_GROUP_OF.push(gi); });
  });

  function tokenize(text, subword) {
    var out = [];
    (text.match(/\s*\S+/g) || []).forEach(function (word) {
      if (!subword) { out.push(word); return; }
      var lead = word.match(/^\s*/)[0];
      var core = word.slice(lead.length);
      if (core.length > 7) {
        var cut = Math.ceil(core.length / 2);
        out.push(lead + core.slice(0, cut));
        out.push(core.slice(cut));
      } else { out.push(word); }
    });
    return out;
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  // Spread a "thinking" stream across a random 1-4s window so its "Thought for
  // Ns" pill reflects a plausible, non-repeating duration. `extra` merges in any
  // per-call stream options (e.g. an `orb`).
  function thinkPace(text, extra) {
    var n = Math.max(1, tokenize(text, false).length);
    // Thinking time scales with how much there is to "reason" about: a longer
    // chain-of-thought takes proportionally longer to stream, plus a little
    // randomness, clamped to a believable window.
    var targetMs = Math.min(8000, 800 + n * 60 + Math.random() * 700);
    // Every token carries an unavoidable per-token cost (span creation, insert,
    // scroll) even at zero delay. Subtract an estimate so short targets are
    // actually reachable and a genuine short think can occur.
    var overheadPerTok = 9;
    var avg = Math.max(0, targetMs / n - overheadPerTok);
    var o = { base: avg * 0.6, jitter: avg * 0.8, punct: 0, subword: false,
      // A short beat before the first thought token appears, like a real model
      // spinning up before it emits anything.
      lead: 200 };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
      }
    }
    return o;
  }

  // For the reduced-motion / static render there's no animation to time, so we
  // derive a plausible thinking duration that still scales with thought length.
  function thoughtSecs(text) {
    if (!text) return 1 + Math.floor(Math.random() * 4);
    var n = Math.max(1, tokenize(text, false).length);
    var secs = Math.round((800 + n * 60) / 1000 + Math.random());
    return Math.max(1, Math.min(9, secs));
  }

  function reportedSecs(t0) {
    return Math.min(9, Math.max(1, Math.round((now() - t0) / 1000)));
  }

  // Build a chat line: an optional prefix span (e.g. the prompt caret) plus a
  // `.txt` span the streamer writes into. Returns { line, txt }.
  function makeLine(parent, cls, prefix) {
    var line = document.createElement('div');
    line.className = 'chat-line ' + cls;
    if (prefix) {
      var pre = document.createElement('span');
      pre.className = 'chat-prefix';
      pre.textContent = prefix;
      line.appendChild(pre);
    }
    var txt = document.createElement('span');
    txt.className = 'txt';
    line.appendChild(txt);
    parent.appendChild(line);
    return { line: line, txt: txt };
  }

  // The shared flashing block cursor that trails the currently-streaming line.
  function createCursor() {
    var cursor = document.createElement('span');
    cursor.className = 'stream-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.textContent = '\u258B';
    return cursor;
  }

  // Create a token streamer bound to a shared cursor. `cfg.getToken` supplies
  // the live run token so a stream aborts when a newer (re)generation starts;
  // `cfg.onChunk` runs after each token (used to keep a scrolling transcript
  // pinned to the newest text).
  function createStreamer(cfg) {
    cfg = cfg || {};
    var cursor = cfg.cursor;
    return function stream(target, text, opts) {
      opts = opts || {};
      var base = opts.base == null ? 55 : opts.base;
      var jitter = opts.jitter == null ? 50 : opts.jitter;
      var punct = opts.punct == null ? 210 : opts.punct;
      // Optional "time to first token" pause so a stream doesn't begin the
      // instant it's called -- real models take a beat before emitting text.
      var lead = opts.lead == null ? 0 : opts.lead;
      var fade = opts.fade !== false && !reduceMotion;
      var tokens = tokenize(text, opts.subword !== false);
      // Keep the shared cursor as the last child of the active text node so
      // newly streamed tokens are inserted just before it.
      target.txt.appendChild(cursor);
      // Lead the currently-generating line with the ephemeral orb, if requested.
      var orb = opts.orb && opts.orb.gen;
      if (orb) {
        target.txt.insertBefore(orb, target.txt.firstChild);
        orb.classList.add('on');
      }
      var startToken = cfg.getToken ? cfg.getToken() : 0;
      function stale() { return cfg.getToken ? cfg.getToken() !== startToken : false; }
      return new Promise(function (resolve) {
        function finish() {
          if (orb) orb.classList.remove('on');
          resolve();
        }
        var i = 0;
        function step() {
          if (stale()) return finish();
          if (i >= tokens.length) return finish();
          var chunk = tokens[i++];
          if (fade) {
            // Each token fades in for that ChatGPT "tokens landing" feel.
            var span = document.createElement('span');
            span.className = 'tok';
            span.textContent = chunk;
            target.txt.insertBefore(span, cursor);
          } else {
            target.txt.insertBefore(document.createTextNode(chunk), cursor);
          }
          // Keep the newest text in view when the trace is height-capped.
          target.txt.scrollTop = target.txt.scrollHeight;
          if (cfg.onChunk) cfg.onChunk();
          var delay = base + Math.random() * jitter;
          if (/[.,;!?\u2014]$/.test(chunk)) delay += punct;
          setTimeout(step, delay);
        }
        // Hold for the lead (plus a little jitter) before the first token lands.
        var firstLead = lead > 0 ? lead + Math.random() * lead * 0.5 : 0;
        if (firstLead > 0) setTimeout(step, firstLead); else step();
      });
    };
  }

  // Builds a reusable "retry with a different model" dropdown: a pill button
  // plus a grouped model menu. opts.onPick(idx) fires when a model is chosen;
  // opts.getCurrent() supplies the checked model when the menu opens.
  function buildRetryMenu(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'retry-wrap';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Retry with a different model');
    btn.innerHTML =
      '<span class="retry-icon" aria-hidden="true">\u21BB</span>' +
      '<span class="retry-text">Retry</span>' +
      '<span class="retry-caret" aria-hidden="true">\u25BE</span>';
    var menu = document.createElement('div');
    menu.className = 'retry-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Choose a model to retry with');
    var items = [];
    MODELS.forEach(function (name, i) {
      if (i === 0 || MODEL_GROUP_OF[i] !== MODEL_GROUP_OF[i - 1]) {
        var label = document.createElement('div');
        label.className = 'retry-group-label';
        label.textContent = MODEL_GROUP_LABELS[MODEL_GROUP_OF[i]];
        menu.appendChild(label);
      }
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'retry-item';
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML =
        '<span class="retry-check" aria-hidden="true">\u2713</span>' +
        '<span class="retry-name"></span>';
      item.querySelector('.retry-name').textContent = name;
      item.addEventListener('click', function () {
        closeMenu();
        opts.onPick(i);
      });
      menu.appendChild(item);
      items.push(item);
    });
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    function onDocClick(e) { if (!wrap.contains(e.target)) closeMenu(); }
    function onKey(e) { if (e.key === 'Escape') { closeMenu(); btn.focus(); } }
    function updateChecks() {
      var cur = opts.getCurrent();
      items.forEach(function (it, i) {
        it.classList.toggle('current', i === cur);
        it.setAttribute('aria-checked', i === cur ? 'true' : 'false');
      });
    }
    function openMenu() {
      updateChecks();
      menu.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKey, true);
    }
    function closeMenu() {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.classList.contains('open')) closeMenu();
      else openMenu();
    });
    return {
      wrap: wrap, btn: btn, menu: menu,
      updateChecks: updateChecks, closeMenu: closeMenu
    };
  }

  // Controller for the intro chain-of-thought trace. The hero is a fixed-height
  // block, so an expanded trace must not grow past it; this caps the open trace
  // to the room actually available (anchored to the trace top with a reserve for
  // the answer below) and lets anything longer scroll inside the trace.
  //
  // cfg: { app, think, answer, thinkHead, getBottomEl(), skipEnsure(), initialReserve }
  //   app        - the fixed-height container to clamp against (e.g. hero-viewport)
  //   think      - { line, txt } of the thinking trace
  //   answer     - { line, txt } of the answer
  //   thinkHead  - the trace's toggle button (for aria-expanded)
  //   getBottomEl- returns the lowest visible element (answer or a toolbar below it)
  //   skipEnsure - optional: when true, skip the hero clamp (e.g. transcript scrolls)
  function createHeroFold(cfg) {
    var answerReserve = cfg.initialReserve || 170;

    function cotCap(expanded) {
      var box = cfg.app;
      if (!box || !box.getBoundingClientRect) return 100000;
      var boxBottom = box.getBoundingClientRect().bottom;
      var txtTop = cfg.think.txt.getBoundingClientRect().top;
      // While thinking the answer isn't laid out yet, so only keep the trace
      // from spilling past the hero; once expanded, reserve room for the answer.
      var reserve = expanded ? answerReserve : 56;
      return Math.max(120, Math.floor(boxBottom - txtTop - reserve));
    }

    // After an open trace settles, if the answer still ends too close to the
    // bottom of the hero, shrink the trace just enough to pull it back inside.
    function ensureAnswerVisible() {
      if (cfg.skipEnsure && cfg.skipEnsure()) return;
      if (!cfg.think.line.classList.contains('done') ||
          cfg.think.line.classList.contains('folded')) return;
      var box = cfg.app;
      if (!box || !box.getBoundingClientRect) return;
      var limit = Math.round(box.getBoundingClientRect().bottom) - 16;
      var bottomEl = cfg.getBottomEl ? cfg.getBottomEl() : cfg.answer.line;
      var overflow = Math.round(bottomEl.getBoundingClientRect().bottom) - limit;
      if (overflow > 0) {
        cfg.think.txt.style.maxHeight =
          Math.max(80, cfg.think.txt.clientHeight - overflow) + 'px';
      }
    }

    // Smoothly fold / unfold the trace: measure the real height and animate
    // max-height (plus opacity) so the collapse glides instead of snapping.
    function setFolded(folded) {
      var el = cfg.think.txt;
      if (cfg.thinkHead) cfg.thinkHead.setAttribute('aria-expanded', folded ? 'false' : 'true');
      if (reduceMotion) {
        cfg.think.line.classList.toggle('folded', folded);
        el.style.maxHeight = folded ? '0px' : cotCap(true) + 'px';
        if (!folded) ensureAnswerVisible();
        return;
      }
      if (folded) {
        el.style.maxHeight = el.clientHeight + 'px'; // current rendered height
        void el.offsetHeight; // commit the start height before transitioning
        cfg.think.line.classList.add('folded');
        el.style.maxHeight = '0px';
      } else {
        cfg.think.line.classList.remove('folded');
        // Re-measure the answer just before opening so the reserve reflects its
        // real wrapped height (which can vary with web-font load timing).
        if (cfg.answer.txt.textContent) {
          answerReserve = Math.round(cfg.answer.line.getBoundingClientRect().height) + 40;
        }
        var cap = cotCap(true);
        el.style.maxHeight = Math.min(el.scrollHeight, cap) + 'px';
        var done = function (e) {
          if (e.propertyName && e.propertyName !== 'max-height') return;
          el.style.maxHeight = cap + 'px'; // stay capped so a long trace scrolls
          ensureAnswerVisible(); // guarantee the answer clears the hero bottom
          el.removeEventListener('transitionend', done);
        };
        el.addEventListener('transitionend', done);
      }
    }

    // Cache the answer's true height so an expanded trace reserves enough room.
    function refreshReserve() {
      if (cfg.answer.txt.textContent) {
        answerReserve = Math.round(cfg.answer.line.getBoundingClientRect().height) + 40;
      }
    }
    function setReserve(v) { answerReserve = v; }

    return {
      cotCap: cotCap,
      ensureAnswerVisible: ensureAnswerVisible,
      setFolded: setFolded,
      refreshReserve: refreshReserve,
      setReserve: setReserve
    };
  }

  // The animated mountain backdrop. Light mode is a bright, cool daytime
  // palette; dark mode is a blue-hour-into-rose dusk (alpenglow on snow).
  function createGranim(initialTheme) {
    return new Granim({
      element: '#canvas-image-blending',
      direction: 'top-bottom',
      isPausedWhenNotInView: true,
      stateTransitionSpeed: 1500,
      defaultStateName: initialTheme === 'dark' ? 'sunset' : 'day',
      image: {
        source: 'assets/snow.jpg',
        position: ['center', 'center'],
        stretchMode: ['stretch-if-smaller', 'stretch-if-smaller'],
        blendingMode: 'multiply'
      },
      states: {
        "day": {
          gradients: [
            ['#29323c', '#485563'],
            ['#FF6B6B', '#556270'],
            ['#80d3fe', '#7ea0c4'],
            ['#f0ab51', '#eceba3']
          ],
          transitionSpeed: 8000
        },
        "sunset": {
          gradients: [
            ['#0d1b2a', '#2c5364'],
            ['#1b263b', '#41668c'],
            ['#2b3a5e', '#a86a80'],
            ['#3a1c71', '#d76d77']
          ],
          transitionSpeed: 6000
        }
      }
    });
  }

  // Dark-mode toggle: persists choice, animates a circular reveal from the
  // button (View Transitions API), and cross-fades the Granim backdrop toward
  // the matching palette.
  function initThemeToggle(granimInstance) {
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');
    var meta = document.querySelector('meta[name="theme-color"]');

    function currentTheme() {
      return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
      root.setAttribute('data-theme', theme);
      try { localStorage.setItem('theme', theme); } catch (e) {}
      if (toggle) toggle.setAttribute('aria-pressed', theme === 'dark');
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1117' : '#ffffff');
    }

    function switchTheme(event) {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';

      if (granimInstance && granimInstance.changeState) {
        granimInstance.changeState(next === 'dark' ? 'sunset' : 'day');
      }

      if (!document.startViewTransition || reduceMotion) {
        applyTheme(next);
        return;
      }

      var x = event && event.clientX ? event.clientX : window.innerWidth - 33;
      var y = event && event.clientY ? event.clientY : 33;
      var endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      var transition = document.startViewTransition(function () {
        applyTheme(next);
      });

      transition.ready.then(function () {
        root.animate(
          {
            clipPath: [
              'circle(0px at ' + x + 'px ' + y + 'px)',
              'circle(' + endRadius + 'px at ' + x + 'px ' + y + 'px)'
            ]
          },
          {
            duration: 500,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)'
          }
        );
      });
    }

    if (toggle) {
      applyTheme(currentTheme());
      toggle.addEventListener('click', switchTheme);
    }
  }

  return {
    reduceMotion: reduceMotion,
    CHEVRON_SVG: CHEVRON_SVG,
    MODELS: MODELS,
    MODEL_GROUPS: MODEL_GROUPS,
    MODEL_GROUP_OF: MODEL_GROUP_OF,
    MODEL_GROUP_LABELS: MODEL_GROUP_LABELS,
    tokenize: tokenize,
    wait: wait,
    now: now,
    thinkPace: thinkPace,
    thoughtSecs: thoughtSecs,
    reportedSecs: reportedSecs,
    makeLine: makeLine,
    createCursor: createCursor,
    createStreamer: createStreamer,
    buildRetryMenu: buildRetryMenu,
    createHeroFold: createHeroFold,
    createGranim: createGranim,
    initThemeToggle: initThemeToggle
  };
})();
