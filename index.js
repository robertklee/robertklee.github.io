var app = document.getElementById('app');

// Turn the hero into a mini "reasoning model" moment: a user prompt, a brief
// chain-of-thought that collapses into a "Thought for Ns" pill, then the
// streamed answer - all trailed by a flashing block cursor.
(function heroChat() {
  if (!app) return;

  var PROMPT = 'Hi! Tell me about Robert Lee.';

  // Real language models are non-deterministic: the same prompt yields a
  // different chain-of-thought and answer each time. To echo that, we keep a
  // set of {thought, answer} pairs and pick one at random on every page load.
  var VARIANTS = [
    {
      thought: "The visitor wants a quick intro, so let me pull together what matters. Robert's a senior engineer at Microsoft Azure AI Search, working across information retrieval, search relevance, and ranking \u2014 from classic keyword search to vector search, hybrid retrieval, and agentic retrieval, plus the RAG infrastructure behind enterprise AI. He's shipped work like vector quantization for major cost and latency wins, and cares about surfacing the right results fast at scale. I'll keep the reply to one sharp, welcoming line.",
      answer: "Welcome! I'm Robert \u2014 I build the vector, hybrid, and agentic retrieval that grounds enterprise AI with the right knowledge at billion-vector scale."
    },
    {
      thought: "Let me think about what makes Robert's work stand out. On Azure AI Search he drove vector quantization from public preview all the way to GA \u2014 compression that cut customers' memory and cost by up to 8\u201332\u00d7 and latency by as much as 20\u00d7. So a recurring theme is making billion-scale vector search dramatically cheaper and faster without giving up relevance. I'll lead with that efficiency angle in a single line.",
      answer: "Welcome! I'm Robert \u2014 I make billion-scale vector search dramatically cheaper and faster, so enterprise AI finds the right answer in milliseconds."
    },
    {
      thought: "The most interesting part of Robert's work is relevance. He built a hybrid-search relevance stack on Azure AI Search that fuses keyword and vector signals, and he tunes ranking for messy, complex, global queries. The through-line is getting the right results to the top \u2014 not just returning matches. Let me capture that in one line.",
      answer: "Welcome! I'm Robert \u2014 I fuse keyword and vector search into ranking that puts the right result first, even for the world's messiest queries."
    },
    {
      thought: "What's most current in Robert's work? Agentic retrieval \u2014 turning research prototypes into production systems that ground LLMs and multi-agent workflows in governed enterprise knowledge. The goal is giving AI agents trustworthy, permission-aware access to the right information. I'll frame the intro around grounding AI, in one sentence.",
      answer: "Welcome! I'm Robert \u2014 I build the agentic retrieval that grounds LLMs and AI agents in governed, enterprise-grade knowledge."
    },
    {
      thought: "Let me focus on the systems side. Robert works on distributed search infrastructure serving billions of vectors, where performance and correctness are everything, and he's often the engineer who root-causes the gnarliest production incidents. The story here is reliability at massive scale. One confident line should do it.",
      answer: "Welcome! I'm Robert \u2014 I build distributed retrieval that stays fast, correct, and reliable across billions of vectors."
    },
    {
      thought: "Zooming out, Robert's field is information retrieval: search relevance and ranking for complex, global queries. His day-to-day sits right where classic information retrieval meets modern vector search and applied machine learning. I want the intro to signal genuine depth in search, phrased warmly in a single line.",
      answer: "Welcome! I'm Robert \u2014 I work where information retrieval, vector search, and applied ML meet, helping people find exactly what they need."
    },
    {
      thought: "A lot of people care about RAG right now, so let me connect Robert to that. He doesn't just wire up pipelines \u2014 he builds the retrieval infrastructure underneath RAG: the vector and hybrid search, indexing, and ranking that decide what an LLM actually gets to read. I'll make the intro about being the foundation for RAG, in one line.",
      answer: "Welcome! I'm Robert \u2014 I build the retrieval infrastructure beneath enterprise RAG that decides what your AI actually gets to read."
    },
    {
      thought: "One thing that really defines Robert is shipping. He takes ambitious retrieval research and turns it into production-grade features that reach general availability and get adopted widely \u2014 vector quantization is a good example. The theme is carrying big ideas all the way to customers at scale. Let me say that simply.",
      answer: "Welcome! I'm Robert \u2014 I take ambitious retrieval research all the way to production, shipping features that reach billion-vector scale."
    },
    {
      thought: "Let me pick something a little less obvious. Robert built the benchmarking infrastructure that made a new serverless search offering possible, alongside quantization work that slashed cost and latency. So part of his impact is the measurement and infra that let big bets ship safely. I'll keep the intro about enabling what ships, in one line.",
      answer: "Welcome! I'm Robert \u2014 I build the benchmarks and infrastructure that let ambitious search features ship with confidence at scale."
    },
    {
      thought: "Maybe I should show some range. Beyond the retrieval engine at Azure AI Search, Robert has trained deep neural networks from scratch and loves building communities and mentoring engineers. But the core is the same: a builder who cares about getting the right information to people. Let me give a warm, human one-liner that still nods to the work.",
      answer: "Welcome! I'm Robert \u2014 an engineer who loves building things that help people find the right answer, from neural nets to billion-scale search."
    }
  ];

  // A "retry" control lets visitors regenerate the answer with a different
  // model, dramatizing the same idea: one prompt, many possible completions.
  // Models are implicitly grouped by capability (frontier -> balanced ->
  // efficient) and sorted alphabetically within each tier; the menu draws a
  // faint separator between tiers instead of explicit group labels.
  var MODEL_GROUPS = [
    ['Claude Fable 5', 'Claude Opus 5', 'Gemini 3.1 Pro', 'GPT-5.6 Sol'], // frontier
    ['Claude Sonnet 5', 'GPT-5.6 Terra'],                                         // balanced
    ['Claude Haiku 4.5', 'GPT-5.6 Luna']                                                        // efficient
  ];
  var MODELS = [];
  var MODEL_GROUP_OF = []; // tier index per flat model index (for separators)
  MODEL_GROUPS.forEach(function (g, gi) {
    g.forEach(function (name) { MODELS.push(name); MODEL_GROUP_OF.push(gi); });
  });

  var variantIdx = Math.floor(Math.random() * VARIANTS.length);
  var modelIdx = Math.floor(Math.random() * MODEL_GROUPS[0].length); // always "pick" a frontier model on first load
  var THOUGHT = VARIANTS[variantIdx].thought;
  var ANSWER = VARIANTS[variantIdx].answer;
  var runToken = 0; // bumped on every (re)generation so stale runs abort

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
    // Keep the shared cursor as the last child of the active text node so
    // newly streamed tokens are inserted just before it.
    target.txt.appendChild(cursor);
    var myToken = runToken; // if a retry starts a new run, this stream aborts
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (myToken !== runToken) return resolve();
        if (i >= tokens.length) return resolve();
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

  // The hero is a fixed-height block; an expanded chain-of-thought must not
  // grow past it (on narrow screens the overflow would overlap the next
  // section). Cap the open trace to the space actually available, anchored to
  // the (stable) trace top and a reserve for the answer below it, and let
  // anything longer scroll inside the trace.
  var answerReserve = 170; // updated to the real answer height once it streams

  function cotCap(expanded) {
    var box = app.parentElement;
    if (!box || !box.getBoundingClientRect) return 100000;
    var boxBottom = box.getBoundingClientRect().bottom;
    var txtTop = think.txt.getBoundingClientRect().top;
    // While thinking the answer isn't laid out yet, so only keep the trace
    // from spilling past the hero; once expanded, reserve room for the answer.
    var reserve = expanded ? answerReserve : 56;
    return Math.max(120, Math.floor(boxBottom - txtTop - reserve));
  }

  // Belt-and-suspenders: after an open trace settles, if the answer still ends
  // too close to the bottom of the hero (layout can vary with fonts/viewport),
  // shrink the trace just enough to pull the answer safely back inside.
  function ensureAnswerVisible() {
    if (!think.line.classList.contains('done') ||
        think.line.classList.contains('folded')) return;
    var box = app.parentElement;
    if (!box || !box.getBoundingClientRect) return;
    var limit = Math.round(box.getBoundingClientRect().bottom) - 16;
    // The retry toolbar sits below the answer, so clamp against whichever is
    // currently the lowest visible element.
    var bottomEl = (typeof actions !== 'undefined' && actions &&
      !actions.classList.contains('chat-actions-hidden')) ? actions : answer.line;
    var overflow = Math.round(bottomEl.getBoundingClientRect().bottom) - limit;
    if (overflow > 0) {
      think.txt.style.maxHeight = Math.max(80, think.txt.clientHeight - overflow) + 'px';
    }
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var prompt = makeLine('chat-prompt', '\u276F');
  var think = makeLine('chat-think');
  var thinkHead = document.createElement('button');
  thinkHead.type = 'button';
  thinkHead.className = 'think-head';
  thinkHead.setAttribute('aria-expanded', 'true');
  var thinkChevron = document.createElement('span');
  thinkChevron.className = 'think-chevron';
  thinkChevron.setAttribute('aria-hidden', 'true');
  thinkChevron.textContent = '\u25BE';
  var thinkLabel = document.createElement('span');
  thinkLabel.className = 'think-label';
  thinkLabel.textContent = 'Thinking';
  thinkHead.appendChild(thinkChevron);
  thinkHead.appendChild(thinkLabel);
  think.line.insertBefore(thinkHead, think.txt);
  var answer = makeLine('chat-answer');

  // Keep the thinking and answer lines hidden until their phase begins so the
  // "Thinking" header doesn't appear while the prompt is still typing.
  think.line.classList.add('chat-pending');
  answer.line.classList.add('chat-pending');

  // Smoothly fold / unfold the chain-of-thought trace. We measure the real
  // height and animate max-height (plus opacity) so the collapse glides
  // instead of snapping.
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
      el.style.maxHeight = el.clientHeight + 'px'; // current rendered height
      void el.offsetHeight; // commit the start height before transitioning
      think.line.classList.add('folded');
      el.style.maxHeight = '0px';
    } else {
      think.line.classList.remove('folded');
      // Re-measure the answer just before opening so the reserve reflects its
      // real wrapped height (which can vary with web-font load timing).
      if (answer.txt.textContent) {
        answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
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

  var toggleBound = false;
  function enableThoughtToggle() {
    if (toggleBound) return;
    toggleBound = true;
    thinkHead.addEventListener('click', function () {
      if (!think.line.classList.contains('done')) return;
      setFolded(!think.line.classList.contains('folded'));
    });
  }

  // --- Retry / regenerate toolbar -----------------------------------------
  // A subtle control under the answer lets visitors regenerate the response
  // with a different model. Same prompt, fresh sample: it picks a different
  // chain-of-thought/answer variant and relabels it with the chosen model.
  var actions = document.createElement('div');
  actions.className = 'chat-actions chat-actions-hidden';

  var retryWrap = document.createElement('div');
  retryWrap.className = 'retry-wrap';

  var retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'retry-btn';
  retryBtn.setAttribute('aria-haspopup', 'true');
  retryBtn.setAttribute('aria-expanded', 'false');
  retryBtn.setAttribute('aria-label', 'Retry with a different model');
  retryBtn.innerHTML =
    '<span class="retry-icon" aria-hidden="true">\u21BB</span>' +
    '<span class="retry-text">Retry</span>' +
    '<span class="retry-caret" aria-hidden="true">\u25BE</span>';

  var menu = document.createElement('div');
  menu.className = 'retry-menu';
  menu.setAttribute('role', 'menu');
  var menuHead = document.createElement('div');
  menuHead.className = 'retry-menu-head';
  menuHead.textContent = 'Try again with';
  menu.appendChild(menuHead);

  var menuItems = [];
  MODELS.forEach(function (name, i) {
    if (i > 0 && MODEL_GROUP_OF[i] !== MODEL_GROUP_OF[i - 1]) {
      var sep = document.createElement('div');
      sep.className = 'retry-sep';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
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
      retryWith(i);
    });
    menu.appendChild(item);
    menuItems.push(item);
  });

  var modelTag = document.createElement('span');
  modelTag.className = 'model-tag';

  retryWrap.appendChild(retryBtn);
  retryWrap.appendChild(menu);
  actions.appendChild(retryWrap);
  actions.appendChild(modelTag);
  chat.appendChild(actions);

  function onDocClick(e) { if (!retryWrap.contains(e.target)) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') { closeMenu(); retryBtn.focus(); } }
  function openMenu() {
    menu.classList.add('open');
    retryBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
  }
  function closeMenu() {
    menu.classList.remove('open');
    retryBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
  }
  retryBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.classList.contains('open')) closeMenu();
    else openMenu();
  });

  function updateMenuChecks() {
    menuItems.forEach(function (it, i) {
      it.classList.toggle('current', i === modelIdx);
      it.setAttribute('aria-checked', i === modelIdx ? 'true' : 'false');
    });
  }
  function setActionsVisible(show) {
    actions.classList.toggle('chat-actions-hidden', !show);
  }
  function revealActions() {
    setActionsVisible(true);
    if (!reduceMotion) {
      actions.classList.remove('line-enter');
      void actions.offsetWidth;
      actions.classList.add('line-enter');
    }
    // Now that the toolbar occupies space below the answer, make sure an
    // expanded trace still leaves room for both inside the hero.
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      ensureAnswerVisible();
    }
  }
  function applySelection() {
    THOUGHT = VARIANTS[variantIdx].thought;
    ANSWER = VARIANTS[variantIdx].answer;
    modelTag.textContent = MODELS[modelIdx];
    updateMenuChecks();
  }
  function pickDifferentVariant() {
    if (VARIANTS.length < 2) return variantIdx;
    var idx;
    do { idx = Math.floor(Math.random() * VARIANTS.length); } while (idx === variantIdx);
    return idx;
  }
  function resetGeneration() {
    runToken++; // cancels any in-flight run's streams/awaits
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
    answerReserve = 170;
  }
  function retryWith(idx) {
    modelIdx = idx;
    variantIdx = pickDifferentVariant();
    if (reduceMotion) {
      renderStatic();
    } else {
      setActionsVisible(false); // hide the toolbar while it "regenerates"
      run(false);               // keep the same prompt; regenerate the rest
    }
  }

  // Instant, no-animation render (used when the visitor prefers reduced motion,
  // and on retry in that mode).
  function renderStatic() {
    resetGeneration();
    applySelection();
    prompt.txt.textContent = PROMPT;
    think.line.classList.remove('chat-pending');
    answer.line.classList.remove('chat-pending');
    think.txt.textContent = THOUGHT;
    think.line.classList.add('done');
    setFolded(true);
    thinkLabel.textContent = 'Thought for 2s';
    answer.txt.textContent = ANSWER;
    answer.txt.appendChild(cursor);
    revealActions();
  }

  // Animated generation. On first load streamPrompt is true; retries keep the
  // existing prompt and regenerate only the thinking + answer.
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
    think.txt.style.maxHeight = cotCap(false) + 'px'; // keep the live trace inside the hero
    var t0 = now();
    await stream(think, THOUGHT, { base: 20, jitter: 22, punct: 60, subword: false });
    if (myToken !== runToken) return;
    var secs = Math.max(1, Math.round((now() - t0) / 1000));
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
    // Cache the answer's true height so an expanded trace always reserves
    // enough room to keep the answer within the hero. If the user expanded the
    // trace while the answer was still streaming, re-clamp it now.
    answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      think.txt.style.maxHeight =
        Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
      ensureAnswerVisible();
    }
    revealActions();
  }

  enableThoughtToggle();

  if (reduceMotion) {
    renderStatic();
  } else {
    run(true);
  }

  // Keep the expanded trace clamped to the hero when the viewport changes
  // (e.g. rotating a phone), so it never grows into the next section.
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
        source: 'assets/snow.jpg', //change image for intro section if desired
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

//RESUME
// The resume path is base64-encoded rather than embedded as a literal URL so
// crawlers that scrape links from JS can't discover it. Combined with the
// unguessable filename and robots.txt Disallow, this keeps it out of search
// results. (GitHub Pages can't send an X-Robots-Tag: noindex header.)
var resume = document.getElementById("resume");
resume.onclick = function() {
  window.open(atob("L3IvZG9jcy9kb2MtNTYzNGZjMmY0NmUzNTU0NjJmM2YwMGVhNDIyYWIxMzMucGRm"), "_blank");
};

// Project 1
var btn_proj_1 = document.getElementById("btn-proj1");
btn_proj_1.onclick = function() {
  window.open("https://github.com/robertklee/COCO-Human-Pose", "_blank");
};

// Project 2
var btn_proj_2 = document.getElementById("btn-proj2");
btn_proj_2.onclick = function() {
  window.open("https://github.com/robertklee/KITTI-RoadSeg", "_blank");
};

// Project 3
var btn_proj_3 = document.getElementById("btn-proj3");
btn_proj_3.onclick = function() {
  window.open("https://github.com/DeclanMcIntosh/monodepthV2tf", "_blank");
};

// THEME / DARK MODE
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

    // Animate the mountain hero's gradient toward a sunset (dark) or the
    // cool daytime palette (light); Granim cross-fades over stateTransitionSpeed.
    if (typeof granimInstance !== 'undefined' && granimInstance && granimInstance.changeState) {
      granimInstance.changeState(next === 'dark' ? 'sunset' : 'day');
    }

    // Fallback for browsers without the View Transitions API, or when the
    // user prefers reduced motion: switch instantly (CSS handles the fade).
    if (!document.startViewTransition || reduceMotion) {
      applyTheme(next);
      return;
    }

    // Animate a circular reveal that expands from the toggle button.
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

