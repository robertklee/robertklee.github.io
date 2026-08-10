var app = document.getElementById('app');

// The 404 hero mirrors the homepage: a live "reasoning model" moment. Here the
// visitor's prompt is the page they tried to reach, the model briefly "searches"
// the site for it (a nod to Robert's field, retrieval), and the answer is a
// friendly 404 that points back home. Hitting "Retry" can surface a playful
// hidden answer. The shared chat engine lives in chat-core.js (HeroChat).
(function heroChat() {
  if (!app) return;
  var H = window.HeroChat;
  var reduceMotion = H.reduceMotion;

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

  var variantIdx = pickVariant(-1, false); // first load: a straight 404, no egg
  var modelIdx = Math.floor(Math.random() * H.MODEL_GROUPS[0].length); // a frontier model first
  var THOUGHT = VARIANTS[variantIdx].thought;
  var ANSWER = VARIANTS[variantIdx].answer;
  var runToken = 0; // bumped on every (re)generation so stale runs abort

  var chat = document.createElement('div');
  chat.className = 'hero-chat';
  app.appendChild(chat);

  var cursor = H.createCursor();
  var stream = H.createStreamer({
    cursor: cursor,
    getToken: function () { return runToken; }
  });

  function makeLine(cls, prefix) {
    return H.makeLine(chat, cls, prefix);
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
  thinkChevron.innerHTML = H.CHEVRON_SVG;
  var thinkLabel = document.createElement('span');
  thinkLabel.className = 'think-label';
  thinkLabel.textContent = 'Thinking';
  thinkHead.appendChild(thinkChevron);
  thinkHead.appendChild(thinkLabel);
  think.line.insertBefore(thinkHead, think.txt);
  var answer = makeLine('chat-answer');

  think.line.classList.add('chat-pending');
  answer.line.classList.add('chat-pending');

  var fold = H.createHeroFold({
    app: app.parentElement, // the fixed-height hero-viewport
    think: think,
    answer: answer,
    thinkHead: thinkHead,
    getBottomEl: function () {
      return !actions.classList.contains('chat-actions-hidden') ? actions : answer.line;
    },
    initialReserve: 150
  });

  thinkHead.addEventListener('click', function () {
    if (!think.line.classList.contains('done')) return;
    fold.setFolded(!think.line.classList.contains('folded'));
  });

  // --- Retry toolbar + a single way back into the site ---------------------
  var actions = document.createElement('div');
  actions.className = 'chat-actions chat-actions-hidden';
  var retry = H.buildRetryMenu({
    onPick: function (i) { retryWith(i); },
    getCurrent: function () { return modelIdx; }
  });
  var modelTag = document.createElement('span');
  modelTag.className = 'model-tag';
  actions.appendChild(retry.wrap);
  actions.appendChild(modelTag);
  chat.appendChild(actions);

  // Ephemeral glowing "generating" orb, mirroring the homepage hero: shown
  // while the answer streams, then swapped for the retry/model footer. The
  // label beside it names the model that's responding.
  var gen = document.createElement('div');
  gen.className = 'gen-indicator';
  gen.setAttribute('aria-hidden', 'true');
  var genOrb = document.createElement('span');
  genOrb.className = 'gen-orb';
  gen.appendChild(genOrb);
  var genModel = document.createElement('span');
  genModel.className = 'gen-model';
  gen.appendChild(genModel);
  chat.appendChild(gen);

  // The homepage, rendered as a chip so it matches the site's suggested-action
  // styling. `.chat-suggest { display: flex }` is declared after
  // `.chat-actions-hidden` in styles.css (equal specificity, so it wins), which
  // means the class can't hide this row \u2014 drive visibility with an inline style.
  var suggest = document.createElement('div');
  suggest.className = 'chat-suggest';
  suggest.style.display = 'none';
  var homeChip = document.createElement('a');
  homeChip.className = 'suggest-chip';
  homeChip.href = '/';
  homeChip.innerHTML =
    '<span class="suggest-plus" aria-hidden="true">\uD83C\uDFE0</span>' +
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
      fold.ensureAnswerVisible();
    }
  }

  function applySelection() {
    THOUGHT = VARIANTS[variantIdx].thought;
    ANSWER = VARIANTS[variantIdx].answer;
    modelTag.textContent = H.MODELS[modelIdx];
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
    gen.classList.remove('on');
    fold.setReserve(150);
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
    fold.setFolded(true);
    thinkLabel.textContent = 'Thought for ' + H.thoughtSecs(THOUGHT) + 's';
    answer.txt.textContent = ANSWER;
    answer.txt.appendChild(cursor);
    revealActions();
  }

  async function run(streamPrompt) {
    resetGeneration();
    var myToken = runToken;
    applySelection();

    if (streamPrompt) {
      await H.wait(350);
      await stream(prompt, PROMPT, { base: 34, jitter: 30, subword: false });
      if (myToken !== runToken) return;
      await H.wait(320);
      if (myToken !== runToken) return;
    }

    think.line.classList.remove('chat-pending');
    think.line.classList.add('line-enter');
    think.line.classList.add('is-thinking');
    genModel.textContent = H.MODELS[modelIdx];
    gen.classList.add('on'); // glowing "generating" orb with the responding model
    think.txt.style.maxHeight = fold.cotCap(false) + 'px';
    var t0 = H.now();
    await stream(think, THOUGHT, H.thinkPace(THOUGHT));
    if (myToken !== runToken) return;
    var secs = H.reportedSecs(t0);
    think.line.classList.remove('is-thinking');
    think.line.classList.add('done');
    thinkLabel.textContent = 'Thought for ' + secs + 's';
    await H.wait(750);
    if (myToken !== runToken) return;
    fold.setFolded(true);
    answer.line.classList.remove('chat-pending');
    answer.line.classList.add('line-enter');
    await H.wait(320);
    if (myToken !== runToken) return;

    await stream(answer, ANSWER, { base: 22, jitter: 20, lead: 260 });
    if (myToken !== runToken) return;
    fold.refreshReserve();
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      think.txt.style.maxHeight =
        Math.min(think.txt.scrollHeight, fold.cotCap(true)) + 'px';
      fold.ensureAnswerVisible();
    }
    gen.classList.remove('on'); // swap the orb for the retry/model footer
    revealActions();
  }

  if (reduceMotion) {
    renderStatic();
  } else {
    run(true);
  }

  // Keep the expanded trace clamped to the hero when the viewport changes.
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (reduceMotion) return;
      fold.refreshReserve();
      var open = think.line.classList.contains('done') &&
        !think.line.classList.contains('folded');
      if (open) {
        think.txt.style.maxHeight =
          Math.min(think.txt.scrollHeight, fold.cotCap(true)) + 'px';
        fold.ensureAnswerVisible();
      }
    }, 150);
  });
})();


var initialTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
var granimInstance = HeroChat.createGranim(initialTheme);
HeroChat.initThemeToggle(granimInstance);
