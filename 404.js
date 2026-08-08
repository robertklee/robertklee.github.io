var app = document.getElementById('app');

// The 404 hero mirrors the homepage: a live "reasoning model" moment. Here the
// visitor's prompt is the page they tried to reach, the model briefly "searches"
// the site for it (a nod to Robert's field, retrieval), and the answer is a
// friendly 404 that points back home. A retry regenerates with a different
// model, just like the main page.
(function heroChat() {
  if (!app) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The route the visitor actually tried to reach. On GitHub Pages the address
  // bar keeps the requested path even though this 404 document is served, so we
  // can surface it in the "prompt" for a personal touch.
  var rawPath = (window.location.pathname || '') + (window.location.search || '');
  var reqPath = rawPath && rawPath !== '/' && rawPath !== '/404.html' ? rawPath : '';
  if (reqPath.length > 60) reqPath = reqPath.slice(0, 57) + '...';

  // The visitor's "question" varies per load. When we know the missing route we
  // weave it in; otherwise we fall back to generic phrasings.
  var PROMPTS = reqPath ? [
    'Take me to ' + reqPath,
    'Where can I find ' + reqPath + '?',
    'Open ' + reqPath + ' for me.',
    'I was looking for ' + reqPath,
    'Is ' + reqPath + ' here somewhere?'
  ] : [
    'Where\u2019s the page I was looking for?',
    'I think this link is broken \u2014 can you help?',
    'Can you find the page I wanted?',
    'Hmm, this page won\u2019t load. What happened?',
    'Where did this page go?'
  ];
  var PROMPT = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];

  // Like a real reasoning model, the same prompt yields a different chain-of-
  // thought and answer each time. Every variant lands on the same truth: there
  // is no page here (404), so the best move is to head back to the homepage.
  // Two pools. `egg: false` variants are the straight, helpful 404s; the first
  // load always shows one of these so the page reads clearly. `egg: true`
  // variants are the easter eggs \u2014 playful, on-brand answers that only surface
  // when a curious visitor hits "Retry" (and even then only some of the time,
  // thanks to the weighting below). Keep egg answers to a single line.
  var VARIANTS = [
    {
      w: 2,
      thought: "Someone followed a link to this route, so let me try to resolve it. I'll embed the requested path and look it up across the pages I know about \u2014 home, experience, projects, photography. Nothing matches; there's simply no document at this address. That's a 404. The honest, useful move is to point them back to the homepage, where everything actually lives.",
      answer: "That page isn't here (404). The link may be broken or the page moved \u2014 but everything's still one hop away on the homepage."
    },
    {
      w: 2,
      thought: "Let me search for this route. Running a nearest-neighbor lookup over the site's index... the closest matches all live on the main page, but none are an exact hit for this URL. So this is a genuine miss, not a ranking problem \u2014 a real 404. I'll say so plainly and send them somewhere that exists.",
      answer: "Looks like a 404 \u2014 I searched the site and couldn't find anything at this address. Head back to the homepage to pick up where you meant to go."
    },
    {
      w: 2,
      thought: "A request came in for a page that doesn't exist. I could try to guess at something close, but the honest answer is there's no index entry for this route \u2014 the retrieval turned up zero relevant documents. Better to return a clean 404 than to hallucinate a page. I'll offer the homepage as the way back.",
      answer: "No page lives at this URL (404). Nothing to retrieve here \u2014 but the homepage has all of Robert's work, so let's get you back on track."
    },
    {
      w: 2,
      thought: "Time to ground this in reality. I embedded the path and scanned the index for a nearest neighbor... and the nearest neighbor is pretty far away. There's no page at this address, so the right call is a 404. I'll keep it friendly and route the visitor to the homepage.",
      answer: "Even nearest-neighbor search came up empty \u2014 there's no page at this address (404). The homepage is your best next hop."
    },

    // --- Easter eggs (retry-only) -------------------------------------------
    {
      egg: true, w: 1,
      thought: "This one deserves a little poetry. The visitor hit a dead end, so instead of a dry error I'll answer in a haiku \u2014 five, seven, five \u2014 that still admits the page is gone and points home. A small reward for retrying.",
      answer: "Page slips through the mist \u2014 no vector points to it here \u2014 the homepage remains. (404)"
    },
    {
      egg: true, w: 1,
      thought: "Let me be playful but technical. I ran approximate nearest-neighbor search over every route; the recall was honest and the answer was still 'nothing.' Even a bigger efSearch wouldn't rescue this query. I'll wink at that and send them home.",
      answer: "I cranked efSearch all the way up and walked every layer of the HNSW graph \u2014 the nearest neighbor to this page is still just the homepage. (404, but at least the recall was honest.)"
    },
    {
      egg: true, w: 1,
      thought: "A fun angle: on Azure AI Search we compress vectors up to 32x, but this page compressed all the way to zero bytes \u2014 there's nothing left to retrieve. I'll lean into the quantization pun and point home.",
      answer: "Someone quantized this page a little too aggressively \u2014 it compressed all the way down to 0 bytes (404). The full-precision version lives on the homepage."
    },
    {
      egg: true, w: 1,
      thought: "The tempting move is to hallucinate a convincing page. But grounding matters \u2014 if it isn't in the index, I won't pretend it is. So I'll refuse to make one up and hand back an honest 404, with the homepage as the trustworthy source.",
      answer: "I could hallucinate a lovely page for you here\u2026 but I'd rather stay grounded. There's genuinely nothing at this URL (404) \u2014 the homepage is the source of truth."
    },
    {
      egg: true, w: 1,
      thought: "Let me give this a retro-terminal wink. The route resolves to a null pointer; the honest status is 404. I'll keep it short and a little nerdy, then route home.",
      answer: "> GET this_page \u2192 404 NOT_FOUND \u00b7 nearest match: '/' \u00b7 hint: head to the homepage."
    },
    {
      egg: true, w: 1,
      thought: "They hit retry, which means they're curious \u2014 nice. There's still no page here, but I can reward the curiosity with a different flavor of the same truth. I'll acknowledge the retry loop and gently point home before they generate a dozen more.",
      answer: "Keep hitting retry and I'll keep finding new ways to say the same thing: this page doesn't exist (404). The homepage, however, definitely does."
    },
    {
      egg: true, w: 1,
      thought: "If they've retried this far, they've basically found the easter egg. I'll let them in on it \u2014 the missing page is real, but the hunt is the fun part \u2014 and still make sure they can get back to the actual site.",
      answer: "Congrats \u2014 you found the easter egg. The page you wanted is still missing (that part's real: 404), but you've earned a fast track back to the homepage."
    },
    {
      egg: true, w: 1,
      thought: "The backdrop is a snowy mountain, so I'll lean into the 'lost' metaphor. This URL is off the map; no trail leads here. I'll admit the 404 and point down the ridge to the homepage.",
      answer: "You've wandered off the map \u2014 there's no trail to this page (404). Follow the ridge back down to the homepage."
    }
  ];

  // Weighted, exclusion-aware variant picker. `allowEggs = false` restricts the
  // draw to the straight 404s (used on first load); `true` opens up the easter
  // eggs (used on every retry). The weights make eggs an occasional surprise
  // rather than the default.
  function pickVariant(exclude, allowEggs) {
    var pool = [];
    var total = 0;
    VARIANTS.forEach(function (v, i) {
      if (i === exclude) return;
      if (!allowEggs && v.egg) return;
      var w = v.w || 1;
      pool.push({ i: i, w: w });
      total += w;
    });
    if (!pool.length) return exclude < 0 ? 0 : exclude;
    var r = Math.random() * total;
    for (var k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) return pool[k].i;
    }
    return pool[pool.length - 1].i;
  }

  // Same model line-up as the homepage, grouped by capability tier, so the
  // "retry with a different model" control feels consistent across the site.
  var MODEL_GROUPS = [
    ['Claude Fable 5', 'Claude Mythos 5 - Research Preview', 'Claude Opus 5', 'Gemini 3.1 Pro', 'GPT-5.6 Sol'], // frontier
    ['Claude Sonnet 5', 'GPT-5.6 Terra'], // balanced
    ['Claude Haiku 4.5', 'GPT-5.6 Luna'] // efficient
  ];
  var MODEL_GROUP_LABELS = ['Frontier', 'Balanced', 'Efficient'];
  var MODELS = [];
  var MODEL_GROUP_OF = [];
  MODEL_GROUPS.forEach(function (g, gi) {
    g.forEach(function (name) { MODELS.push(name); MODEL_GROUP_OF.push(gi); });
  });

  var variantIdx = pickVariant(-1, false); // first load: a straight 404, no egg
  var modelIdx = Math.floor(Math.random() * MODEL_GROUPS[0].length); // pick a frontier model first
  var THOUGHT = VARIANTS[variantIdx].thought;
  var ANSWER = VARIANTS[variantIdx].answer;
  var runToken = 0; // bumped on every (re)generation so stale runs abort

  var CHEVRON_SVG =
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var chat = document.createElement('div');
  chat.className = 'hero-chat';
  app.appendChild(chat);

  var cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.textContent = '\u258B';

  function makeLine(cls, prefix) {
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
    chat.appendChild(line);
    return { line: line, txt: txt };
  }

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

  function stream(target, text, opts) {
    opts = opts || {};
    var base = opts.base == null ? 45 : opts.base;
    var jitter = opts.jitter == null ? 45 : opts.jitter;
    var punct = opts.punct == null ? 180 : opts.punct;
    var fade = opts.fade !== false && !reduceMotion;
    var tokens = tokenize(text, opts.subword !== false);
    target.txt.appendChild(cursor);
    var myToken = runToken;
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (myToken !== runToken) return resolve();
        if (i >= tokens.length) return resolve();
        var chunk = tokens[i++];
        if (fade) {
          var span = document.createElement('span');
          span.className = 'tok';
          span.textContent = chunk;
          target.txt.insertBefore(span, cursor);
        } else {
          target.txt.insertBefore(document.createTextNode(chunk), cursor);
        }
        target.txt.scrollTop = target.txt.scrollHeight;
        var delay = base + Math.random() * jitter;
        if (/[.,;!?\u2014]$/.test(chunk)) delay += punct;
        setTimeout(step, delay);
      })();
    });
  }

  function now() {
    return (window.performance && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  // Spread the thinking trace across a random 1-4s window so its "Thought for Ns"
  // pill reflects a plausible, non-repeating duration.
  function thinkPace(text) {
    var targetMs = 1000 + Math.random() * 3000;
    var n = Math.max(1, tokenize(text, false).length);
    var overheadPerTok = 9;
    var avg = Math.max(0, targetMs / n - overheadPerTok);
    return { base: avg * 0.6, jitter: avg * 0.8, punct: 0, subword: false };
  }

  function thoughtSecs() {
    return 1 + Math.floor(Math.random() * 4);
  }

  function reportedSecs(t0) {
    return Math.min(4, Math.max(1, Math.round((now() - t0) / 1000)));
  }

  // Keep an expanded chain-of-thought from growing past the full-height hero on
  // small screens; anything longer scrolls inside the trace.
  var answerReserve = 150;

  function cotCap(expanded) {
    var box = app.parentElement;
    if (!box || !box.getBoundingClientRect) return 100000;
    var boxBottom = box.getBoundingClientRect().bottom;
    var txtTop = think.txt.getBoundingClientRect().top;
    var reserve = expanded ? answerReserve : 56;
    return Math.max(120, Math.floor(boxBottom - txtTop - reserve));
  }

  function ensureAnswerVisible() {
    if (!think.line.classList.contains('done') ||
        think.line.classList.contains('folded')) return;
    var box = app.parentElement;
    if (!box || !box.getBoundingClientRect) return;
    var limit = Math.round(box.getBoundingClientRect().bottom) - 16;
    var bottomEl = !actions.classList.contains('chat-actions-hidden') ? actions : answer.line;
    var overflow = Math.round(bottomEl.getBoundingClientRect().bottom) - limit;
    if (overflow > 0) {
      think.txt.style.maxHeight = Math.max(80, think.txt.clientHeight - overflow) + 'px';
    }
  }

  var prompt = makeLine('chat-prompt', '\u276F');
  var think = makeLine('chat-think');
  var thinkHead = document.createElement('button');
  thinkHead.type = 'button';
  thinkHead.className = 'think-head';
  thinkHead.setAttribute('aria-expanded', 'true');
  var thinkChevron = document.createElement('span');
  thinkChevron.className = 'think-chevron';
  thinkChevron.setAttribute('aria-hidden', 'true');
  thinkChevron.innerHTML = CHEVRON_SVG;
  var thinkLabel = document.createElement('span');
  thinkLabel.className = 'think-label';
  thinkLabel.textContent = 'Thinking';
  thinkHead.appendChild(thinkChevron);
  thinkHead.appendChild(thinkLabel);
  think.line.insertBefore(thinkHead, think.txt);
  var answer = makeLine('chat-answer');

  think.line.classList.add('chat-pending');
  answer.line.classList.add('chat-pending');

  function setFolded(folded) {
    var el = think.txt;
    thinkHead.setAttribute('aria-expanded', folded ? 'false' : 'true');
    if (reduceMotion) {
      think.line.classList.toggle('folded', folded);
      el.style.maxHeight = folded ? '0px' : cotCap(true) + 'px';
      if (!folded) ensureAnswerVisible();
      return;
    }
    if (folded) {
      el.style.maxHeight = el.clientHeight + 'px';
      void el.offsetHeight;
      think.line.classList.add('folded');
      el.style.maxHeight = '0px';
    } else {
      think.line.classList.remove('folded');
      if (answer.txt.textContent) {
        answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
      }
      var cap = cotCap(true);
      el.style.maxHeight = Math.min(el.scrollHeight, cap) + 'px';
      var done = function (e) {
        if (e.propertyName && e.propertyName !== 'max-height') return;
        el.style.maxHeight = cap + 'px';
        ensureAnswerVisible();
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    }
  }

  thinkHead.addEventListener('click', function () {
    if (!think.line.classList.contains('done')) return;
    setFolded(!think.line.classList.contains('folded'));
  });

  // --- Retry / regenerate toolbar (mirrors the homepage) -------------------
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
    return { wrap: wrap, btn: btn, updateChecks: updateChecks, closeMenu: closeMenu };
  }

  var actions = document.createElement('div');
  actions.className = 'chat-actions chat-actions-hidden';
  var retry = buildRetryMenu({
    onPick: function (i) { retryWith(i); },
    getCurrent: function () { return modelIdx; }
  });
  var modelTag = document.createElement('span');
  modelTag.className = 'model-tag';
  actions.appendChild(retry.wrap);
  actions.appendChild(modelTag);
  chat.appendChild(actions);

  // A single, clear way back into the site: the homepage. Rendered as a chip
  // so it matches the homepage's suggested-action styling.
  var suggest = document.createElement('div');
  suggest.className = 'chat-suggest';
  // `.chat-suggest { display: flex }` is declared after `.chat-actions-hidden`
  // in styles.css (equal specificity, so it wins), which means the class can't
  // hide this row. Drive its visibility with an inline style, which always wins.
  suggest.style.display = 'none';
  var homeChip = document.createElement('a');
  homeChip.className = 'suggest-chip';
  homeChip.href = '/';
  homeChip.innerHTML =
    '<span class="suggest-plus" aria-hidden="true">\u2302</span>' +
    '<span class="suggest-text">Take me to the homepage</span>' +
    '<span class="suggest-plus" aria-hidden="true">\u2192</span>';
  suggest.appendChild(homeChip);
  chat.appendChild(suggest);

  function setActionsVisible(show) {
    actions.classList.toggle('chat-actions-hidden', !show);
    suggest.style.display = show ? 'flex' : 'none';
  }
  function revealActions() {
    setActionsVisible(true);
    if (!reduceMotion) {
      actions.classList.remove('line-enter');
      void actions.offsetWidth;
      actions.classList.add('line-enter');
      suggest.classList.remove('suggest-enter');
      void suggest.offsetWidth;
      suggest.classList.add('suggest-enter');
    }
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      ensureAnswerVisible();
    }
  }

  function applySelection() {
    THOUGHT = VARIANTS[variantIdx].thought;
    ANSWER = VARIANTS[variantIdx].answer;
    modelTag.textContent = MODELS[modelIdx];
    retry.updateChecks();
  }
  function pickDifferentVariant() {
    // Retry opens up the easter eggs; the weighting keeps them an occasional
    // surprise rather than every time.
    return pickVariant(variantIdx, true);
  }
  function resetGeneration() {
    runToken++;
    if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
    think.txt.innerHTML = '';
    answer.txt.innerHTML = '';
    think.line.classList.remove('done', 'folded', 'line-enter', 'is-thinking');
    think.line.classList.add('chat-pending');
    think.txt.style.maxHeight = '';
    answer.line.classList.remove('line-enter');
    answer.line.classList.add('chat-pending');
    thinkLabel.textContent = 'Thinking';
    thinkHead.setAttribute('aria-expanded', 'true');
    answerReserve = 150;
  }
  function retryWith(idx) {
    modelIdx = idx;
    variantIdx = pickDifferentVariant();
    if (reduceMotion) {
      renderStatic();
    } else {
      setActionsVisible(false);
      run(false);
    }
  }

  function renderStatic() {
    resetGeneration();
    applySelection();
    prompt.txt.textContent = PROMPT;
    think.line.classList.remove('chat-pending');
    answer.line.classList.remove('chat-pending');
    think.txt.textContent = THOUGHT;
    think.line.classList.add('done');
    setFolded(true);
    thinkLabel.textContent = 'Thought for ' + thoughtSecs() + 's';
    answer.txt.textContent = ANSWER;
    answer.txt.appendChild(cursor);
    revealActions();
  }

  async function run(streamPrompt) {
    resetGeneration();
    var myToken = runToken;
    applySelection();

    if (streamPrompt) {
      await wait(350);
      await stream(prompt, PROMPT, { base: 34, jitter: 30, subword: false });
      if (myToken !== runToken) return;
      await wait(320);
      if (myToken !== runToken) return;
    }

    think.line.classList.remove('chat-pending');
    think.line.classList.add('line-enter');
    think.line.classList.add('is-thinking');
    think.txt.style.maxHeight = cotCap(false) + 'px';
    var t0 = now();
    await stream(think, THOUGHT, thinkPace(THOUGHT));
    if (myToken !== runToken) return;
    var secs = reportedSecs(t0);
    think.line.classList.remove('is-thinking');
    think.line.classList.add('done');
    thinkLabel.textContent = 'Thought for ' + secs + 's';
    await wait(750);
    if (myToken !== runToken) return;
    setFolded(true);
    answer.line.classList.remove('chat-pending');
    answer.line.classList.add('line-enter');
    await wait(320);
    if (myToken !== runToken) return;

    await stream(answer, ANSWER, { base: 45, jitter: 45 });
    if (myToken !== runToken) return;
    answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      think.txt.style.maxHeight =
        Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
      ensureAnswerVisible();
    }
    revealActions();
  }

  if (reduceMotion) {
    renderStatic();
  } else {
    run(true);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (reduceMotion) return;
      if (answer.txt.textContent) {
        answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
      }
      var open = think.line.classList.contains('done') &&
        !think.line.classList.contains('folded');
      if (open) {
        think.txt.style.maxHeight =
          Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
        ensureAnswerVisible();
      }
    }, 150);
  });
})();


var initialTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

var granimInstance = new Granim({
    element: '#canvas-image-blending',
    direction: 'top-bottom',
    isPausedWhenNotInView: true,
    stateTransitionSpeed: 1500,
    defaultStateName: initialTheme === 'dark' ? 'sunset' : 'day',
    image : {
        source: 'assets/snow.jpg',
        position: ['center', 'center'],
        stretchMode: ['stretch-if-smaller', 'stretch-if-smaller'],
        blendingMode: 'multiply',
    },
    states : {
        // Light mode: the original bright, cool daytime palette.
        "day": {
            gradients: [
                ['#29323c', '#485563'],
                ['#FF6B6B', '#556270'],
                ['#80d3fe', '#7ea0c4'],
                ['#f0ab51', '#eceba3']
            ],
            transitionSpeed: 8000
        },
        // Dark mode: blue hour easing into a warm rose dusk (alpenglow on snow).
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

// THEME / DARK MODE (matches the homepage toggle).
;(function () {
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var meta = document.querySelector('meta[name="theme-color"]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    if (typeof granimInstance !== 'undefined' && granimInstance && granimInstance.changeState) {
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
})();
