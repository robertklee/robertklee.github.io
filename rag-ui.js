// ---------------------------------------------------------------------------
// rag-ui.js — the "Ask my résumé" widget.
//
// This mounts a real retrieval demo into #resume-rag. A visitor types a free-
// text question; the widget runs genuine retrieval (ResumeRAG) and *shows the
// retrieval*: the ranked passages, their similarity scores, and their source
// sections, before streaming a grounded, cited answer assembled from them.
//
// By default retrieval is lexical (BM25) and runs entirely offline. A visitor
// can paste their own embeddings API key to upgrade to semantic vector search;
// the key lives only in this tab's memory (see rag-core.js).
//
// Streaming/cursor visuals are borrowed from the shared HeroChat engine so the
// demo feels consistent with the hero, but every result here is real.
// ---------------------------------------------------------------------------
(function resumeRagUi() {
  'use strict';

  var mount = document.getElementById('resume-rag');
  var RAG = window.ResumeRAG;
  var H = window.HeroChat;
  if (!mount || !RAG) return;

  var reduceMotion = H ? H.reduceMotion : false;
  var runToken = 0; // bumped per question so a stale run's stream aborts

  var SAMPLE_QUESTIONS = [
    'How did Robert cut vector search cost and latency?',
    'What has he shipped in agentic retrieval and RAG?',
    'Tell me about his computer vision projects.',
    'What are his most notable awards?',
    'What does he do day to day as a senior engineer?'
  ];

  // --- Small DOM helpers ----------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function pct(x) { return Math.round(Math.max(0, Math.min(1, x)) * 100); }

  // --- Build the static shell ----------------------------------------------
  var widget = el('div', 'rag-widget');

  var sub = el('p', 'rag-sub');
  sub.innerHTML = 'A genuinely working retrieval demo over my r\u00e9sum\u00e9 &mdash; ' +
    'no backend, no mock. Ask anything; you\u2019ll see the exact passages it ' +
    'retrieves (with similarity scores and sources) before a grounded, cited answer.';
  widget.appendChild(sub);

  // Question form
  var form = el('form', 'rag-form');
  var input = el('input', 'rag-input');
  input.type = 'text';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-label', 'Ask a question about Robert\u2019s r\u00e9sum\u00e9');
  input.placeholder = 'Ask about my work, projects, skills\u2026';
  var ask = el('button', 'btn btn-outline-success rag-ask', 'Ask');
  ask.type = 'submit';
  form.appendChild(input);
  form.appendChild(ask);
  widget.appendChild(form);

  // Sample question chips
  var samples = el('div', 'rag-samples');
  SAMPLE_QUESTIONS.forEach(function (q) {
    var chip = el('button', 'rag-sample', q);
    chip.type = 'button';
    chip.addEventListener('click', function () { input.value = q; runQuery(q); });
    samples.appendChild(chip);
  });
  widget.appendChild(samples);

  // Method line + settings toggle
  var methodBar = el('div', 'rag-methodbar');
  var methodInfo = el('span', 'rag-method');
  var settingsToggle = el('button', 'rag-settings-toggle');
  settingsToggle.type = 'button';
  methodBar.appendChild(methodInfo);
  methodBar.appendChild(settingsToggle);
  widget.appendChild(methodBar);

  // Settings (bring-your-own embeddings key)
  var settings = buildSettings();
  widget.appendChild(settings.wrap);

  // Output: retrieval panel + grounded answer
  var output = el('div', 'rag-output');
  var retrievalPanel = el('div', 'rag-retrieval');
  var answerPanel = el('div', 'rag-answer');
  output.appendChild(retrievalPanel);
  output.appendChild(answerPanel);
  widget.appendChild(output);

  mount.appendChild(widget);

  updateMethodLine();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (q) runQuery(q);
  });

  // --- Method line / settings state ----------------------------------------
  function updateMethodLine() {
    var cfg = RAG.getConfig();
    if (RAG.hasApiKey()) {
      methodInfo.innerHTML = 'Retrieval: <strong>semantic vector search</strong> ' +
        '<span class="rag-model">' + escapeText(cfg.model) + '</span>';
      settingsToggle.textContent = 'Embeddings settings';
    } else {
      methodInfo.innerHTML = 'Retrieval: <strong>keyword (BM25)</strong> ' +
        '<span class="rag-model">offline</span>';
      settingsToggle.textContent = 'Use semantic vector search \u2192';
    }
  }

  function buildSettings() {
    var wrap = el('div', 'rag-settings');
    wrap.hidden = true;

    var intro = el('p', 'rag-settings-intro');
    intro.innerHTML = 'Bring your own <strong>embeddings</strong> key to switch ' +
      'from keyword matching to real semantic vector search. Your key stays in ' +
      'this browser tab\u2019s memory only &mdash; it is never stored and never sent ' +
      'anywhere except the endpoint below. Only the resulting r\u00e9sum\u00e9 ' +
      'vectors (not your key) are cached locally.';
    wrap.appendChild(intro);

    var cfg = RAG.getConfig();

    var keyRow = field('API key', 'rag-key');
    keyRow.input.type = 'password';
    keyRow.input.placeholder = 'sk-\u2026 (kept in memory only)';
    keyRow.input.setAttribute('autocomplete', 'off');
    wrap.appendChild(keyRow.row);

    var endpointRow = field('Endpoint', 'rag-endpoint');
    endpointRow.input.type = 'text';
    endpointRow.input.value = cfg.endpoint;
    wrap.appendChild(endpointRow.row);

    var modelRow = field('Model', 'rag-model-input');
    modelRow.input.type = 'text';
    modelRow.input.value = cfg.model;
    wrap.appendChild(modelRow.row);

    var authRow = el('div', 'rag-field');
    var authLabel = el('label', 'rag-field-label', 'Auth header');
    var authSelect = el('select', 'rag-field-input');
    [['bearer', 'Authorization: ******'], ['api-key', 'api-key (Azure OpenAI)']]
      .forEach(function (o) {
        var opt = el('option', null, o[1]);
        opt.value = o[0];
        if (o[0] === cfg.authHeader) opt.selected = true;
        authSelect.appendChild(opt);
      });
    authRow.appendChild(authLabel);
    authRow.appendChild(authSelect);
    wrap.appendChild(authRow);

    var actions = el('div', 'rag-settings-actions');
    var enable = el('button', 'btn btn-outline-success rag-enable', 'Enable vector search');
    enable.type = 'button';
    var clearBtn = el('button', 'rag-clear', 'Clear key');
    clearBtn.type = 'button';
    var status = el('span', 'rag-settings-status');
    actions.appendChild(enable);
    actions.appendChild(clearBtn);
    actions.appendChild(status);
    wrap.appendChild(actions);

    enable.addEventListener('click', function () {
      var key = keyRow.input.value.trim();
      RAG.setConfig({
        endpoint: endpointRow.input.value,
        model: modelRow.input.value,
        authHeader: authSelect.value
      });
      if (!key) {
        status.textContent = 'Enter a key to enable vector search.';
        status.className = 'rag-settings-status warn';
        return;
      }
      RAG.setApiKey(key);
      status.textContent = 'Vector search enabled. Your key stays in memory only.';
      status.className = 'rag-settings-status ok';
      updateMethodLine();
    });

    clearBtn.addEventListener('click', function () {
      RAG.clearApiKey();
      keyRow.input.value = '';
      status.textContent = 'Key cleared. Back to offline keyword search.';
      status.className = 'rag-settings-status';
      updateMethodLine();
    });

    settingsToggle.addEventListener('click', function () {
      wrap.hidden = !wrap.hidden;
      if (!wrap.hidden) keyRow.input.focus();
    });

    return { wrap: wrap, status: status };

    function field(labelText, id) {
      var row = el('div', 'rag-field');
      var label = el('label', 'rag-field-label', labelText);
      label.setAttribute('for', id);
      var inp = el('input', 'rag-field-input');
      inp.id = id;
      row.appendChild(label);
      row.appendChild(inp);
      return { row: row, input: inp };
    }
  }

  // --- Running a query ------------------------------------------------------
  function runQuery(query) {
    runToken++;
    var myToken = runToken;

    ask.disabled = true;
    clear(retrievalPanel);
    clear(answerPanel);
    output.classList.add('rag-active');

    var status = el('div', 'rag-status');
    var spinner = el('span', 'rag-spinner');
    spinner.setAttribute('aria-hidden', 'true');
    status.appendChild(spinner);
    status.appendChild(el('span', 'rag-status-text',
      RAG.hasApiKey() ? 'Embedding your question and searching\u2026'
        : 'Searching the r\u00e9sum\u00e9\u2026'));
    retrievalPanel.appendChild(status);

    function onProgress(done, total) {
      if (myToken !== runToken) return;
      var t = status.querySelector('.rag-status-text');
      if (t) t.textContent = 'Embedding r\u00e9sum\u00e9 (' + done + '/' + total + ')\u2026';
    }

    RAG.search(query, { k: 4, onProgress: onProgress }).then(function (res) {
      if (myToken !== runToken) return;
      renderResults(query, res, myToken);
    }).catch(function (err) {
      if (myToken !== runToken) return;
      clear(retrievalPanel);
      var e = el('div', 'rag-error',
        'Something went wrong while retrieving: ' + (err && err.message ? err.message : err));
      retrievalPanel.appendChild(e);
      ask.disabled = false;
    });
  }

  function renderResults(query, res, myToken) {
    clear(retrievalPanel);

    // Method summary (real vs fallback), plus any error note.
    var head = el('div', 'rag-retrieval-head');
    var label = res.method === 'vector'
      ? 'Vector search \u00b7 ' + escapeText(res.model)
      : 'Keyword search \u00b7 BM25';
    head.appendChild(el('span', 'rag-retrieval-title',
      'Retrieved ' + res.results.length + ' passage' +
      (res.results.length === 1 ? '' : 's')));
    head.appendChild(el('span', 'rag-retrieval-method', label));
    retrievalPanel.appendChild(head);

    if (res.note) {
      var note = el('div', 'rag-note', res.note +
        (res.error ? ' (' + res.error + ')' : ''));
      retrievalPanel.appendChild(note);
    }

    if (!res.results.length) {
      retrievalPanel.appendChild(el('div', 'rag-empty',
        'No passages matched. Try rephrasing, or enable vector search for ' +
        'semantic matching.'));
    }

    var cards = [];
    res.results.forEach(function (r, i) {
      var card = el('div', 'rag-card');
      var top = el('div', 'rag-card-top');
      top.appendChild(el('span', 'rag-rank', '#' + (i + 1)));
      var badge = el('a', 'rag-source', r.chunk.section);
      badge.href = r.chunk.url || '#';
      top.appendChild(badge);

      var scoreWrap = el('div', 'rag-score');
      var bar = el('div', 'rag-score-bar');
      var fill = el('span', 'rag-score-fill');
      fill.style.width = pct(r.confidence) + '%';
      bar.appendChild(fill);
      scoreWrap.appendChild(bar);
      scoreWrap.appendChild(el('span', 'rag-score-val', pct(r.confidence) + '%'));
      top.appendChild(scoreWrap);
      card.appendChild(top);

      card.appendChild(el('div', 'rag-card-title', r.chunk.title));
      card.appendChild(el('div', 'rag-card-text', r.chunk.text));
      retrievalPanel.appendChild(card);
      cards.push(card);
    });

    // Stagger the reveal so the retrieval reads as it lands.
    if (!reduceMotion) {
      cards.forEach(function (c, i) {
        c.style.animationDelay = (i * 70) + 'ms';
        c.classList.add('rag-card-enter');
      });
    }

    streamAnswer(res, myToken);
  }

  function streamAnswer(res, myToken) {
    clear(answerPanel);
    if (!res.answer || !res.results.length) { ask.disabled = false; return; }

    var head = el('div', 'rag-answer-head');
    head.appendChild(el('span', 'rag-answer-label', 'Grounded answer'));
    head.appendChild(el('span', 'rag-answer-tag',
      RAG.hasApiKey() ? 'extractive \u00b7 cited' : 'extractive \u00b7 cited'));
    answerPanel.appendChild(head);

    var body = el('div', 'rag-answer-body');
    var txt = el('span', 'txt');
    body.appendChild(txt);
    answerPanel.appendChild(body);

    var citations = buildCitations(res.answer.citations);

    if (reduceMotion || !H) {
      txt.textContent = res.answer.text;
      answerPanel.appendChild(citations);
      ask.disabled = false;
      return;
    }

    var cursor = H.createCursor();
    var stream = H.createStreamer({
      cursor: cursor,
      getToken: function () { return runToken; }
    });
    stream({ txt: txt }, res.answer.text, { base: 16, jitter: 14, lead: 180 })
      .then(function () {
        if (myToken !== runToken) return;
        if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
        answerPanel.appendChild(citations);
        ask.disabled = false;
      });
  }

  function buildCitations(list) {
    var wrap = el('div', 'rag-citations');
    if (!list || !list.length) return wrap;
    wrap.appendChild(el('span', 'rag-citations-label', 'Sources:'));
    list.forEach(function (c) {
      var a = el('a', 'rag-citation', c.section);
      a.href = c.url || '#';
      a.title = c.title;
      wrap.appendChild(a);
    });
    return wrap;
  }

  // Corpus text and section labels come from our own JSON, but always assign
  // via textContent (above) so nothing is ever interpreted as HTML. This helper
  // is used only where we build innerHTML strings from config values.
  function escapeText(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // Warm the corpus + lexical index so the first question is instant.
  RAG.loadCorpus().catch(function () { /* surfaced on first query */ });
})();
