var app = document.getElementById('app');

// Turn the hero into a mini "reasoning model" moment: a user prompt, a brief
// chain-of-thought that collapses into a "Thought for Ns" pill, then the
// streamed answer - all trailed by a flashing block cursor.
(function heroChat() {
  if (!app || !window.HeroChatContent) return;

  // The scripted copy lives in chat-content.js as HeroChatContent.
  var CONTENT = window.HeroChatContent;
  var PROMPTS = CONTENT.PROMPTS;
  var PROMPT = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  var VARIANTS = CONTENT.VARIANTS;
  var TOPICS = CONTENT.TOPICS;
  var BEHIND_SCENES = CONTENT.BEHIND_SCENES;

  // The shared chat engine (streaming, retry/model menu, fold logic, timing
  // helpers, theme toggle) lives in chat-core.js as HeroChat.
  var H = window.HeroChat;
  var reduceMotion = H.reduceMotion;

  // Let the hero's embedding field (assets/site/field.js) visualise each
  // answer as a retrieval that lands on the documents it draws on. The last
  // query is kept for late listeners.
  function emitQuery(topicId, docs) {
    var detail = { topic: topicId, docs: docs || [] };
    window.HeroChatLastQuery = detail;
    try {
      document.dispatchEvent(new CustomEvent('herochat:query', { detail: detail }));
    } catch (e) {}
  }
  var CHEVRON_SVG = H.CHEVRON_SVG;
  var MODELS = H.MODELS;

  // Track which variant (answer) and prompt (chip) indices have already been
  // shown, per topic, so the "model" never repeats the same answer or the same
  // suggestion chip within a visit. When a pool is exhausted we start a fresh
  // cycle without immediately repeating the option we just showed.
  var usedVariants = {}; // topicId -> variant indices already shown
  var usedPrompts = {};  // topicId -> phrasing indices already shown
  function pickUnusedIdx(store, key, count, avoid) {
    if (count <= 1) return 0;
    var used = store[key] || (store[key] = []);
    var last = used.length ? used[used.length - 1] : -1;
    if (used.length >= count) used.length = 0; // exhausted: begin a fresh cycle
    if (avoid == null && used.length === 0) avoid = last; // no back-to-back repeat
    var pool = [];
    for (var i = 0; i < count; i++) {
      if (used.indexOf(i) === -1 && i !== avoid) pool.push(i);
    }
    if (!pool.length) { // only the avoided option is left; allow it
      for (var j = 0; j < count; j++) if (used.indexOf(j) === -1) pool.push(j);
    }
    var idx = pool[Math.floor(Math.random() * pool.length)];
    used.push(idx);
    return idx;
  }

  var variantIdx = pickUnusedIdx(usedVariants, 'intro', VARIANTS.length);
  var modelIdx = Math.floor(Math.random() * H.MODEL_GROUPS[0].length); // always "pick" a frontier model on first load
  var THOUGHT = VARIANTS[variantIdx].thought;
  var ANSWER = VARIANTS[variantIdx].answer;
  var runToken = 0; // bumped on every (re)generation so stale runs abort
  var convoMode = false; // becomes true once the visitor asks a follow-up
  var stickBottom = true; // auto-follow new output unless the visitor scrolls up
  var activeTurnTop = null; // top element of the current turn (for revealing its answer)
  var chipScrollKnown = false; // visitor has picked a non-first chip, so they know the row scrolls

  var chat = document.createElement('div');
  chat.className = 'hero-chat';
  app.appendChild(chat);

  // Track whether the visitor is parked at the bottom. Streaming only auto-
  // scrolls while this holds, so scrolling up to re-read earlier text sticks
  // instead of being yanked back down on the next token.
  //
  // Only a genuine visitor gesture may flip this off. Content reflow -- most
  // notably the thinking fold collapsing/expanding at the start of a chip-driven
  // turn -- also fires scroll events, and those must NOT disengage auto-follow;
  // otherwise the fold animation could nudge the view a few pixels off the
  // bottom and strand the streaming answer above the fold. So we gate the
  // scroll handler behind a short window opened by wheel / touch / scrollbar /
  // key input, and ignore reflow- or script-driven scrolls.
  var userScrollUntil = 0;
  function markUserScroll() { userScrollUntil = Date.now() + 500; }
  chat.addEventListener('wheel', markUserScroll, { passive: true });
  chat.addEventListener('touchmove', markUserScroll, { passive: true });
  chat.addEventListener('keydown', markUserScroll);
  chat.addEventListener('mousedown', function (e) {
    // A press on the scroll container itself (not a chip/link within it) is a
    // scrollbar grab, so let drags started there count as visitor scrolling.
    if (e.target === chat) markUserScroll();
  });
  chat.addEventListener('scroll', function () {
    if (Date.now() > userScrollUntil) return; // reflow / programmatic scroll
    markUserScroll(); // keep the window alive through touch-scroll momentum
    stickBottom = (chat.scrollHeight - chat.scrollTop - chat.clientHeight) < 24;
  });

  var cursor = H.createCursor();

  var makeLineIn = H.makeLine;
  function makeLine(cls, prefix) {
    return H.makeLine(chat, cls, prefix);
  }

  var wait = H.wait;
  var now = H.now;
  var thinkPace = H.thinkPace;
  var thoughtSecs = H.thoughtSecs;
  var reportedSecs = H.reportedSecs;

  // Streams tokens into a line (trailing the shared cursor), aborting when a
  // newer (re)generation bumps runToken, and following the newest tokens down
  // the transcript while in conversation mode.
  var stream = H.createStreamer({
    cursor: cursor,
    getToken: function () { return runToken; },
    onChunk: function () { if (convoMode && stickBottom) chat.scrollTop = chat.scrollHeight; }
  });

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

  // Keep the thinking and answer lines hidden until their phase begins so the
  // "Thinking" header doesn't appear while the prompt is still typing.
  think.line.classList.add('chat-pending');
  answer.line.classList.add('chat-pending');

  // The chain-of-thought fold controller (open-trace cap, answer-clamp, and the
  // fold/unfold animation) lives in chat-core. In conversation mode the
  // transcript scrolls, so skip the hero-bottom clamp; the lowest visible
  // element is the retry toolbar when it's showing, else the answer line.
  var fold = H.createHeroFold({
    app: app.parentElement,
    think: think,
    answer: answer,
    thinkHead: thinkHead,
    getBottomEl: function () {
      return (typeof actions !== 'undefined' && actions &&
        !actions.classList.contains('chat-actions-hidden')) ? actions : answer.line;
    },
    skipEnsure: function () { return convoMode; },
    initialReserve: 170
  });
  var cotCap = fold.cotCap;
  var ensureAnswerVisible = fold.ensureAnswerVisible;
  var setFolded = fold.setFolded;

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

  // The retry/model dropdown builder lives in chat-core (H.buildRetryMenu):
  // opts.onPick(idx) fires when a model is chosen; opts.getCurrent() supplies
  // the checked model when the menu opens.
  var buildRetryMenu = H.buildRetryMenu;

  var actions = document.createElement('div');
  actions.className = 'chat-actions chat-actions-hidden';

  var introRetry = buildRetryMenu({
    onPick: function (i) { retryWith(i); },
    getCurrent: function () { return modelIdx; }
  });

  var modelTag = document.createElement('span');
  modelTag.className = 'model-tag';

  actions.appendChild(introRetry.wrap);
  actions.appendChild(modelTag);
  chat.appendChild(actions);

  // Ephemeral glowing "generating" orb for the intro sequence, mirroring the
  // one shown for follow-up turns (createFollowTurn). It sits where the retry/
  // model footer will land: shown while the intro streams, swapped out for the
  // toolbar once the answer completes.
  var introGen = document.createElement('div');
  introGen.className = 'gen-indicator';
  introGen.setAttribute('aria-hidden', 'true');
  var introOrb = document.createElement('span');
  introOrb.className = 'gen-orb';
  introGen.appendChild(introOrb);
  var introGenModel = document.createElement('span');
  introGenModel.className = 'gen-model';
  introGen.appendChild(introGenModel);
  chat.appendChild(introGen);

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
    introRetry.updateChecks();
  }
  function pickDifferentVariant() {
    return pickUnusedIdx(usedVariants, 'intro', VARIANTS.length, variantIdx);
  }
  function resetGeneration() {
    runToken++; // cancels any in-flight run's streams/awaits
    removeActiveSuggestions();
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
    introGen.classList.remove('on');
    fold.setReserve(170);
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
    activeTurnTop = prompt.line;
    stickBottom = true;
    prompt.txt.textContent = PROMPT;
    emitQuery('intro', VARIANTS[variantIdx].docs);
    think.line.classList.remove('chat-pending');
    answer.line.classList.remove('chat-pending');
    think.txt.textContent = THOUGHT;
    think.line.classList.add('done');
    setFolded(true);
    thinkLabel.textContent = 'Thought for ' + thoughtSecs(THOUGHT) + 's';
    answer.txt.textContent = ANSWER;
    answer.txt.appendChild(cursor);
    revealActions();
    showSuggestions('intro');
  }

  // Animated generation. On first load streamPrompt is true; retries keep the
  // existing prompt and regenerate only the thinking + answer.
  async function run(streamPrompt) {
    resetGeneration();
    var myToken = runToken;
    applySelection();
    activeTurnTop = prompt.line;
    stickBottom = true;

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
    emitQuery('intro', VARIANTS[variantIdx].docs);
    introGenModel.textContent = MODELS[modelIdx];
    introGen.classList.add('on'); // glowing "generating" orb, as on follow-ups
    think.txt.style.maxHeight = cotCap(false) + 'px'; // keep the live trace inside the hero
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

    await stream(answer, ANSWER, { base: 22, jitter: 20, lead: 260 });
    if (myToken !== runToken) return;
    // Cache the answer's true height so an expanded trace always reserves
    // enough room to keep the answer within the hero. If the user expanded the
    // trace while the answer was still streaming, re-clamp it now.
    fold.refreshReserve();
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      think.txt.style.maxHeight =
        Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
      ensureAnswerVisible();
    }
    introGen.classList.remove('on'); // swap the orb for the retry/model footer
    revealActions();
    showSuggestions('intro');
  }

  // --- Suggested follow-ups + conversation mode ----------------------------
  // After each answer we offer ChatGPT-style follow-up chips. Clicking one
  // dims the backdrop and grows the hero into a scrollable chat
  // transcript, appending a fresh prompt -> thinking -> answer for that topic.

  // A dim layer that sits between the animated backdrop and the content, so
  // "conversation mode" can spotlight the chat over a quieter backdrop.
  var heroDim = document.createElement('div');
  heroDim.id = 'hero-dim';
  heroDim.setAttribute('aria-hidden', 'true');
  var backdropEl = document.querySelector('[data-hero-backdrop]');
  if (backdropEl && backdropEl.parentNode) {
    backdropEl.parentNode.insertBefore(heroDim, backdropEl.nextSibling);
  }

  var activeSuggestRow = null;
  var lastFollowTurn = null; // only the newest follow-up turn is retryable
  var discoveryShown = false;
  var turnCount = 0; // completed follow-up turns (drives the "reach out" nudge)
  // Once the chat runs long, nudge visitors toward reaching Robert directly:
  // the CTA appears from CTA_AFTER turns on, chips continue for a couple more
  // turns, then from CHIPS_UNTIL on we show only the CTA and let it wind down.
  var CTA_AFTER = 3;
  var CHIPS_UNTIL = 10;
  var DISCOVERY_MIN_TURN = 3;

  function scrollChatToBottom() {
    if (convoMode && stickBottom) chat.scrollTop = chat.scrollHeight;
  }

  // When suggestions/CTA appear, always keep the whole suggestion row (chips +
  // CTA) in view so it's never buried below the fold. If the turn also fits, we
  // additionally pin its top so the answer reads from its first line; when the
  // answer is too tall to do both, showing the row wins and the answer's tail
  // stays visible above it (scroll up for the rest). Parks the visitor off-
  // bottom, disengaging auto-follow until they scroll back down or start a turn.
  function revealAnswer(topEl, bottomEl) {
    if (!convoMode) return;
    if (!bottomEl) { scrollChatToBottom(); return; }
    var ctop = chat.getBoundingClientRect().top;
    var viewH = chat.clientHeight;
    var PAD = 12;
    var bottom = bottomEl.getBoundingClientRect().bottom - ctop + chat.scrollTop;
    var showRow = bottom - viewH + PAD;      // keep the suggestions/CTA in view
    var showTop = showRow;
    if (topEl) {
      var top = topEl.getBoundingClientRect().top - ctop + chat.scrollTop;
      showTop = top - PAD;                   // reveal the turn top when it fits
    }
    chat.scrollTop = Math.max(0, showTop, showRow);
  }

  // Size the scroll panel to the room left in the hero below the chat's top.
  // On wider screens it stops at ~62% of the viewport, leaving a band of the
  // hero's HNSW backdrop visible so each retrieval can be seen behind the chat.
  var wideQuery = window.matchMedia ? window.matchMedia('(min-width: 761px)') : null;
  function updateConvoHeight() {
    if (!convoMode) return;
    var box = app.parentElement;
    if (!box || !box.getBoundingClientRect) return;
    // Leave a band at the hero's bottom for the persistent scroll cue so the
    // compact chevron never overlaps the chat's chips/CTA in conversation mode.
    var avail = Math.floor(box.getBoundingClientRect().bottom -
      chat.getBoundingClientRect().top - 40);
    if (wideQuery && wideQuery.matches) {
      avail = Math.min(avail, Math.max(440, Math.round(window.innerHeight * 0.62)));
    }
    chat.style.maxHeight = Math.max(220, avail) + 'px';
  }

  function enterConvoMode() {
    if (convoMode) return;
    convoMode = true;
    document.body.classList.add('convo-active');
    heroDim.classList.add('on');
    chat.classList.add('convo');
    // The header glides up (CSS transition) to free vertical room, so track the
    // chat height frame-by-frame while it settles -- the panel grows in lockstep
    // with the move instead of leaving a gap or overshooting the reserved band.
    var settleUntil = Date.now() + 650;
    (function settle() {
      updateConvoHeight();
      if (Date.now() < settleUntil) requestAnimationFrame(settle);
    })();
  }

  function hideIntroActions() {
    if (typeof actions !== 'undefined' && actions) {
      actions.classList.add('chat-actions-hidden');
    }
  }

  function removeActiveSuggestions() {
    if (activeSuggestRow && activeSuggestRow.parentNode) {
      activeSuggestRow.parentNode.removeChild(activeSuggestRow);
    }
    activeSuggestRow = null;
  }

  // A lightweight fold for follow-up traces. In conversation mode the whole
  // transcript scrolls, so we don't clamp to the hero -- just animate height.
  function simpleFold(els, folded) {
    els.head.setAttribute('aria-expanded', folded ? 'false' : 'true');
    els.line.classList.toggle('folded', folded);
    if (reduceMotion) {
      els.txt.style.maxHeight = folded ? '0px' : 'none';
      return;
    }
    if (folded) {
      els.txt.style.maxHeight = els.txt.scrollHeight + 'px';
      void els.txt.offsetHeight;
      els.txt.style.maxHeight = '0px';
    } else {
      // Only keep the transcript pinned to the bottom if the visitor was
      // already there; if they've scrolled up to re-read a trace, expanding it
      // must not yank the view down to the latest message.
      var atBottom = (chat.scrollHeight - chat.scrollTop - chat.clientHeight) < 8;
      els.txt.style.maxHeight = els.txt.scrollHeight + 'px';
      var done = function (e) {
        if (e.propertyName && e.propertyName !== 'max-height') return;
        els.txt.style.maxHeight = 'none';
        els.txt.removeEventListener('transitionend', done);
        if (atBottom) scrollChatToBottom();
      };
      els.txt.addEventListener('transitionend', done);
    }
  }

  function createFollowTurn() {
    var wrap = document.createElement('div');
    wrap.className = 'chat-turn';
    chat.appendChild(wrap);
    var t = { wrap: wrap };
    t.prompt = makeLineIn(wrap, 'chat-prompt', '\u276F');
    t.think = makeLineIn(wrap, 'chat-think');
    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'think-head';
    head.setAttribute('aria-expanded', 'true');
    var chev = document.createElement('span');
    chev.className = 'think-chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.innerHTML = CHEVRON_SVG;
    var lbl = document.createElement('span');
    lbl.className = 'think-label';
    lbl.textContent = 'Thinking';
    head.appendChild(chev);
    head.appendChild(lbl);
    t.think.line.insertBefore(head, t.think.txt);
    t.thinkLabel = lbl;
    t.thinkEls = { line: t.think.line, txt: t.think.txt, head: head };
    head.addEventListener('click', function () {
      if (!t.think.line.classList.contains('done')) return;
      simpleFold(t.thinkEls, !t.think.line.classList.contains('folded'));
    });
    t.answer = makeLineIn(wrap, 'chat-answer');
    t.think.line.classList.add('chat-pending');
    t.answer.line.classList.add('chat-pending');
    t.sources = document.createElement('div');
    t.sources.className = 'chat-sources';
    t.sources.hidden = true;
    wrap.appendChild(t.sources);
    var meta = document.createElement('div');
    meta.className = 'follow-meta chat-actions-hidden';
    var retryCtl = buildRetryMenu({
      onPick: function (i) { retryFollowWithModel(t, i); },
      getCurrent: function () { return t.modelIdx; }
    });
    var mtag = document.createElement('span');
    mtag.className = 'model-tag';
    meta.appendChild(retryCtl.wrap);
    meta.appendChild(mtag);
    wrap.appendChild(meta);
    var gen = document.createElement('div');
    gen.className = 'gen-indicator';
    gen.setAttribute('aria-hidden', 'true');
    var orb = document.createElement('span');
    orb.className = 'gen-orb';
    gen.appendChild(orb);
    var genModel = document.createElement('span');
    genModel.className = 'gen-model';
    gen.appendChild(genModel);
    wrap.appendChild(gen);
    t.meta = meta;
    t.gen = gen;
    t.genModel = genModel;
    t.modelTag = mtag;
    t.retryCtl = retryCtl;
    t.retryBtn = retryCtl.btn;
    return t;
  }

  // Cite the page sections behind a finished answer.
  function showSources(t) {
    var list = (t.topic.sources || []).filter(function (src) {
      return document.getElementById(src[0]);
    });
    t.sources.textContent = '';
    t.sources.hidden = !list.length;
    if (!list.length) return;
    var label = document.createElement('span');
    label.className = 'chat-sources-label';
    label.textContent = 'Sources';
    t.sources.appendChild(label);
    list.forEach(function (src, i) {
      var link = document.createElement('a');
      link.className = 'source-chip';
      link.href = '#' + src[0];
      var n = document.createElement('span');
      n.className = 'source-n';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = String(i + 1);
      link.appendChild(n);
      link.appendChild(document.createTextNode(src[1]));
      t.sources.appendChild(link);
    });
    if (!reduceMotion) {
      t.sources.classList.remove('line-enter');
      void t.sources.offsetWidth;
      t.sources.classList.add('line-enter');
    }
  }

  // While a follow-up turn streams, hide its retry/model footer and show an
  // ephemeral animated indicator; swap them back once the answer completes.
  function showGenerating(t) {
    if (!t) return;
    t.meta.classList.add('chat-actions-hidden');
    t.meta.classList.remove('line-enter');
    if (t.genModel) t.genModel.textContent = MODELS[t.modelIdx];
    if (t.gen) t.gen.classList.add('on');
  }

  function finishGenerating(t) {
    if (!t) return;
    if (t.gen) t.gen.classList.remove('on');
    t.meta.classList.remove('chat-actions-hidden', 'line-enter');
    void t.meta.offsetWidth; // reflow so the reveal animation replays
    t.meta.classList.add('line-enter');
  }

  // A topic is "accessible" when it's asked and answered in plain language for
  // friends, family, and other non-engineers. Every suggestion row has one.
  function isAccessible(topic) { return topic.category === 'general'; }

  var askedTopics = {}; // topicId -> true once the visitor has asked it
  function pickTopics(excludeId, n) {
    // Weighted shuffle: sorting by u^(1/weight) draws without replacement in
    // proportion to each topic's weight. Topics already asked go to the back,
    // so the chips keep moving to new stories until every one has been told.
    var pool = TOPICS.filter(function (t) { return t.id !== excludeId; })
      .map(function (t) { return { t: t, key: Math.pow(Math.random(), 1 / (t.weight || 1)) }; })
      .sort(function (a, b) { return b.key - a.key; })
      .map(function (e) { return e.t; });
    pool = pool.filter(function (t) { return !askedTopics[t.id]; })
      .concat(pool.filter(function (t) { return askedTopics[t.id]; }));
    var picks = pool.slice(0, n);
    // Every row offers at least one plain-language chip. If the draw came back
    // without one, swap the next accessible topic from the shuffled remainder
    // into a random slot, so it isn't always last (and hidden on phones, where
    // the row scrolls sideways).
    if (n > 0 && !picks.some(isAccessible)) {
      for (var k = n; k < pool.length; k++) {
        if (isAccessible(pool[k])) {
          picks.pop();
          picks.splice(Math.floor(Math.random() * n), 0, pool[k]);
          break;
        }
      }
    }
    return picks;
  }

  function pickDifferentVariantIdx(topic, currentIdx) {
    return pickUnusedIdx(usedVariants, topic.id, topic.variants.length, currentIdx);
  }

  // Each follow-up turn allows a single retry. Once the visitor moves on to a
  // new turn (or has already used it), the button is spent.
  function disableFollowRetry(t) {
    if (!t) return;
    t.retried = true;
    if (t.retryCtl) t.retryCtl.closeMenu();
    if (t.retryBtn) {
      t.retryBtn.disabled = true;
      t.retryBtn.classList.add('retry-used');
    }
    // If this turn was superseded mid-generation, drop its indicator and
    // reveal the (now spent) footer so it doesn't linger as an orb.
    if (t.gen && t.gen.classList.contains('on')) {
      t.gen.classList.remove('on');
      t.meta.classList.remove('chat-actions-hidden');
    }
  }

  // A friendly "reach out to Robert" card shown once the conversation runs long.
  function buildContactCta() {
    var cta = document.createElement('div');
    cta.className = 'chat-cta';
    var msg = document.createElement('span');
    msg.className = 'chat-cta-text';
    msg.textContent = 'Enjoying the conversation? Reach out to the real Robert:';
    cta.appendChild(msg);
    var links = document.createElement('div');
    links.className = 'chat-cta-links';
    var li = document.createElement('a');
    li.className = 'chat-cta-link';
    li.href = 'https://www.linkedin.com/in/robert-k-lee/';
    li.target = '_blank';
    li.rel = 'noopener noreferrer';
    li.textContent = 'Connect on LinkedIn';
    var em = document.createElement('a');
    em.className = 'chat-cta-link';
    em.href = 'mailto:hello@robertkl.com';
    em.textContent = 'Email Robert';
    links.appendChild(li);
    links.appendChild(em);
    cta.appendChild(links);
    return cta;
  }

  function showSuggestions(excludeId) {
    removeActiveSuggestions();
    var row = document.createElement('div');
    row.className = 'chat-suggest' + (reduceMotion ? '' : ' suggest-enter');
    var chipsWrap = null;
    if (turnCount < CHIPS_UNTIL) {
      chipsWrap = document.createElement('div');
      chipsWrap.className = 'suggest-chips';
      pickTopics(excludeId, 3).forEach(function (topic) {
        var phrasing = topic.prompts[pickUnusedIdx(usedPrompts, topic.id, topic.prompts.length)];
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggest-chip';
        if (isAccessible(topic)) chip.dataset.general = '';
        chip.innerHTML = '<span class="suggest-plus" aria-hidden="true">' + H.ICONS.plus + '</span>' +
          '<span class="suggest-text"></span>';
        chip.querySelector('.suggest-text').textContent = phrasing;
        chip.addEventListener('click', function () { runChip(chip, topic, phrasing, row); });
        chipsWrap.appendChild(chip);
      });
      row.appendChild(chipsWrap);
      maybeAddDiscovery(row);
    }
    if (turnCount >= CTA_AFTER) row.appendChild(buildContactCta());
    chat.appendChild(row);
    activeSuggestRow = row;
    revealAnswer(activeTurnTop, row);
    if (chipsWrap) initChipScroll(chipsWrap);
    return row;
  }

  // On narrow screens the suggestion chips sit on a single horizontally-
  // scrollable line. Toggle edge-fade classes so it's clear more chips exist
  // beyond the visible edge, and give a subtle one-time sideways nudge so the
  // overflow is discoverable without the visitor having to guess.
  function initChipScroll(chipsWrap) {
    function nudge(x) {
      if (chipsWrap.scrollTo) chipsWrap.scrollTo({ left: x, behavior: 'smooth' });
      else chipsWrap.scrollLeft = x;
    }
    function update() {
      var max = chipsWrap.scrollWidth - chipsWrap.clientWidth;
      chipsWrap.classList.toggle('more-right', chipsWrap.scrollLeft < max - 2);
      chipsWrap.classList.toggle('more-left', chipsWrap.scrollLeft > 2);
    }
    chipsWrap.addEventListener('scroll', update);
    requestAnimationFrame(update); // paint the edge fades right away

    // Nudge this chip set once, but only after it has actually scrolled into
    // view. The intro's chips are appended while they may still be below the
    // fold, so firing immediately (and once per visit) burned the hint off-
    // screen and left the follow-up turns -- where the visitor is actually
    // picking chips -- with no motion cue. Gating on visibility per set means
    // each fresh, overflowing row gets exactly one visible nudge.
    var hinted = false;
    function hint() {
      if (hinted || reduceMotion || chipScrollKnown) return;
      var max = chipsWrap.scrollWidth - chipsWrap.clientWidth;
      if (max < 24) return; // nothing beyond the edge to reveal
      hinted = true;
      nudge(Math.min(48, max));
      setTimeout(function () { nudge(0); }, 650);
    }
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0] && entries[0].isIntersecting) {
          io.disconnect();
          requestAnimationFrame(hint);
        }
      }, { threshold: 0.6 });
      io.observe(chipsWrap);
    } else {
      requestAnimationFrame(hint);
    }
  }

  function runChip(chip, topic, phrasing, row) {
    // Picking any chip past the first means the visitor already found the
    // horizontally-scrolling row, so we can retire the "more chips" nudge.
    var chipsParent = chip.parentNode;
    if (chipsParent && chipsParent.firstElementChild !== chip) chipScrollKnown = true;
    askTopic(topic, phrasing, row);
  }

  // The discovery is also a general question, so replacing a general chip
  // keeps both an accessible option and the row's technical questions.
  function maybeAddDiscovery(row) {
    if (discoveryShown || turnCount < DISCOVERY_MIN_TURN || Math.random() > 0.10) return;
    var chips = row.querySelectorAll('.suggest-chip[data-general]');
    if (!chips.length) return;
    var phrasing = BEHIND_SCENES.prompts[pickUnusedIdx(usedPrompts, BEHIND_SCENES.id, BEHIND_SCENES.prompts.length)];
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'suggest-chip';
    chip.dataset.general = '';
    chip.innerHTML = '<span class="suggest-plus" aria-hidden="true">' + H.ICONS.plus + '</span>' +
      '<span class="suggest-text"></span>';
    chip.querySelector('.suggest-text').textContent = phrasing;
    chip.addEventListener('click', function () { runChip(chip, BEHIND_SCENES, phrasing, row); });
    var last = chips[chips.length - 1];
    last.parentNode.replaceChild(chip, last);
    discoveryShown = true;
  }

  async function askTopic(topic, promptText, sourceRow) {
    // Ignore a double-click on a chip whose row was already consumed.
    if (!sourceRow || !sourceRow.parentNode) return;
    turnCount++;
    enterConvoMode();
    stickBottom = true; // a visitor-initiated turn re-engages auto-follow
    sourceRow.parentNode.removeChild(sourceRow);
    if (sourceRow === activeSuggestRow) activeSuggestRow = null;
    hideIntroActions();
    runToken++; // abort any in-flight follow-up stream
    var myToken = runToken;
    var variantIdx2 = pickUnusedIdx(usedVariants, topic.id, topic.variants.length);
    var variant = topic.variants[variantIdx2];
    var docs = variant.docs || topic.docs;
    askedTopics[topic.id] = true;
    disableFollowRetry(lastFollowTurn); // spend the previous turn's retry
    var t = createFollowTurn();
    t.topic = topic;
    activeTurnTop = t.wrap;
    t.variantIdx = variantIdx2;
    t.modelIdx = modelIdx;
    t.retried = false;
    lastFollowTurn = t;
    scrollChatToBottom();

    if (reduceMotion) {
      t.prompt.txt.textContent = promptText;
      emitQuery(topic.id, docs);
      t.think.line.classList.remove('chat-pending');
      t.think.txt.textContent = variant.thought;
      t.think.line.classList.add('done');
      simpleFold(t.thinkEls, true);
      t.thinkLabel.textContent = 'Thought for ' + thoughtSecs(variant.thought) + 's';
      t.answer.line.classList.remove('chat-pending');
      t.answer.txt.textContent = variant.answer;
      t.answer.txt.appendChild(cursor);
      showSources(t);
      t.modelTag.textContent = MODELS[t.modelIdx];
      t.meta.classList.remove('chat-actions-hidden');
      showSuggestions(topic.id);
      return;
    }

    await wait(250);
    await stream(t.prompt, promptText, { base: 30, jitter: 26, subword: false });
    if (myToken !== runToken) return;
    scrollChatToBottom();
    await wait(260);
    if (myToken !== runToken) return;

    t.think.line.classList.remove('chat-pending');
    t.think.line.classList.add('line-enter', 'is-thinking');
    emitQuery(topic.id, docs);
    showGenerating(t);
    var t0 = now();
    await stream(t.think, variant.thought, thinkPace(variant.thought));
    if (myToken !== runToken) return;
    var secs = reportedSecs(t0);
    t.think.line.classList.remove('is-thinking');
    t.think.line.classList.add('done');
    t.thinkLabel.textContent = 'Thought for ' + secs + 's';
    scrollChatToBottom();
    await wait(650);
    if (myToken !== runToken) return;
    simpleFold(t.thinkEls, true);
    t.answer.line.classList.remove('chat-pending');
    t.answer.line.classList.add('line-enter');
    await wait(300);
    if (myToken !== runToken) return;
    await stream(t.answer, variant.answer, { base: 20, jitter: 18, lead: 260 });
    if (myToken !== runToken) return;
    showSources(t);
    t.modelTag.textContent = MODELS[t.modelIdx];
    finishGenerating(t);
    scrollChatToBottom();
    await wait(450);
    if (myToken !== runToken) return;
    showSuggestions(topic.id);
  }

  // Regenerate a single follow-up turn in place with the chosen model and a
  // different variant \u2014 one retry per turn (the control is spent on use). The
  // picked model also becomes the current model, so later turns continue with
  // it.
  function retryFollowWithModel(t, i) {
    if (!t || t.retried) return;
    t.modelIdx = i;
    modelIdx = i; // subsequent turns continue with the chosen model
    disableFollowRetry(t);
    t.variantIdx = pickDifferentVariantIdx(t.topic, t.variantIdx);
    var v = t.topic.variants[t.variantIdx];

    if (reduceMotion) {
      emitQuery(t.topic.id, v.docs || t.topic.docs);
      if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
      t.think.txt.textContent = v.thought;
      t.answer.txt.textContent = v.answer;
      t.answer.txt.appendChild(cursor);
      t.modelTag.textContent = MODELS[t.modelIdx];
      return;
    }
    regenFollow(t, v);
  }

  async function regenFollow(t, v) {
    runToken++; // this turn owns the stream now; abort any other in-flight run
    var myToken = runToken;
    activeTurnTop = t.wrap;
    stickBottom = true;
    if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
    // Reset this turn's thinking + answer for a fresh "regeneration".
    t.think.txt.innerHTML = '';
    t.answer.txt.innerHTML = '';
    t.sources.hidden = true;
    t.think.line.classList.remove('done', 'folded', 'line-enter');
    t.think.txt.style.maxHeight = '';
    t.thinkEls.head.setAttribute('aria-expanded', 'true');
    t.thinkLabel.textContent = 'Thinking';
    t.modelTag.textContent = '';
    showGenerating(t);
    t.think.line.classList.add('is-thinking');
    emitQuery(t.topic.id, v.docs || t.topic.docs);

    var t0 = now();
    await stream(t.think, v.thought, thinkPace(v.thought));
    if (myToken !== runToken) return;
    var secs = reportedSecs(t0);
    t.think.line.classList.remove('is-thinking');
    t.think.line.classList.add('done');
    t.thinkLabel.textContent = 'Thought for ' + secs + 's';
    scrollChatToBottom();
    await wait(650);
    if (myToken !== runToken) return;
    simpleFold(t.thinkEls, true);
    await wait(300);
    if (myToken !== runToken) return;
    await stream(t.answer, v.answer, { base: 20, jitter: 18, lead: 260 });
    if (myToken !== runToken) return;
    showSources(t);
    t.modelTag.textContent = MODELS[t.modelIdx];
    finishGenerating(t);
    scrollChatToBottom();
    await wait(450);
    if (myToken !== runToken) return;
    // Re-offer follow-ups: the retry may have aborted the original turn's
    // suggestions before they rendered, so ensure they're present afterward.
    showSuggestions(t.topic.id);
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
      if (convoMode) { updateConvoHeight(); return; }
      if (reduceMotion) return;
      fold.refreshReserve();
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


// THEME / DARK MODE — handled by the shared HeroChat controller (persists the
// choice and animates a circular reveal).
HeroChat.initThemeToggle();

// SCROLL CUE: the hero fills the viewport, so hint that there's more below.
// Fades out once the visitor starts scrolling and reappears at the top. The
// cue is an in-page link, so site.js handles the smooth scroll.
;(function () {
  var cue = document.querySelector('.scroll-cue');
  if (!cue) return;
  var fade = document.querySelector('.hero-scroll-fade');

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var hidden = window.pageYOffset > 40;
      cue.classList.toggle('cue-hidden', hidden);
      if (fade) fade.classList.toggle('cue-hidden', hidden);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
