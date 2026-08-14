// ---------------------------------------------------------------------------
// ResumeRAG — a real, client-side retrieval engine over Robert's résumé.
//
// Unlike the hero's hand-written "reasoning model", this is genuine retrieval:
// it indexes assets/resume-corpus.json and ranks chunks for a free-text query.
//
//   * Lexical retrieval (BM25) always works, with no key and no network.
//   * Vector retrieval turns on when a visitor supplies their own embeddings
//     API key: the corpus is embedded once (and cached), the query is embedded
//     live, and results are ranked by cosine similarity.
//
// The key is held in memory only for the session -- never persisted, never sent
// anywhere except the embeddings endpoint the visitor configures. Only the
// resulting corpus vectors (not the key, not queries) are cached in
// localStorage so the corpus isn't re-embedded on every question.
// ---------------------------------------------------------------------------
window.ResumeRAG = (function () {
  'use strict';

  var CORPUS_URL = 'assets/resume-corpus.json';

  // OpenAI-compatible embeddings defaults. The endpoint and model are
  // configurable so the same client works against OpenAI, Azure OpenAI, or any
  // compatible gateway/proxy (useful when browser CORS needs a shim).
  var DEFAULT_CONFIG = {
    endpoint: 'https://api.openai.com/v1/embeddings',
    model: 'text-embedding-3-small',
    authHeader: 'bearer' // 'bearer' (OpenAI) or 'api-key' (Azure OpenAI)
  };
  var CONFIG_STORE_KEY = 'rag:config';   // endpoint + model only (never the key)
  var EMB_STORE_PREFIX = 'rag:emb:';     // cached corpus vectors, per model+version

  // --- English stopword list for lexical tokenization ----------------------
  var STOPWORDS = (function () {
    var s = {};
    ('a an and are as at be but by for from has have he her his i in into is it ' +
     'its me my no not of on or our so that the their them they this to was we ' +
     'were what when where which who whom why will with you your about can could ' +
     'do does did done how more most other some such than then there these those ' +
     'over under out up down off just also been being over robert robert\u2019s')
      .split(' ').forEach(function (w) { s[w] = true; });
    return s;
  })();

  function tokenize(text) {
    if (!text) return [];
    var out = [];
    var raw = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i];
      if (t.length < 2) continue;
      if (STOPWORDS[t]) continue;
      out.push(stem(t));
    }
    return out;
  }

  // Light plural folding so "projects"/"project", "awards"/"award", and
  // "embeddings"/"embedding" match under BM25 (which has no stemmer). Applied
  // to corpus and query alike via tokenize(), so the two always agree even
  // when the fold is imperfect -- consistency, not linguistic correctness, is
  // what drives retrieval matches.
  function stem(t) {
    if (t.length > 4 && /ies$/.test(t)) return t.slice(0, -3) + 'y'; // libraries -> library
    if (t.length > 4 && /sses$/.test(t)) return t.slice(0, -2);      // classes -> class
    if (t.length > 3 && /[^s]s$/.test(t)) return t.slice(0, -1);     // vectors -> vector
    return t;
  }

  // --- Module state --------------------------------------------------------
  var corpus = null;          // { version, chunks: [...] }
  var corpusPromise = null;   // in-flight load
  var bm25 = null;            // prebuilt lexical index
  var apiKey = '';            // in-memory only, never persisted
  var config = loadConfig();
  var corpusVectors = null;   // Float64Array[] aligned with corpus.chunks

  function loadConfig() {
    var cfg = {
      endpoint: DEFAULT_CONFIG.endpoint,
      model: DEFAULT_CONFIG.model,
      authHeader: DEFAULT_CONFIG.authHeader
    };
    try {
      var raw = localStorage.getItem(CONFIG_STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.endpoint) cfg.endpoint = String(saved.endpoint);
          if (saved.model) cfg.model = String(saved.model);
          if (saved.authHeader) cfg.authHeader = String(saved.authHeader);
        }
      }
    } catch (e) { /* ignore malformed/blocked storage */ }
    return cfg;
  }

  function persistConfig() {
    try {
      localStorage.setItem(CONFIG_STORE_KEY, JSON.stringify({
        endpoint: config.endpoint,
        model: config.model,
        authHeader: config.authHeader
      }));
    } catch (e) { /* storage may be unavailable; that's fine */ }
  }

  // --- Corpus loading + lexical (BM25) index -------------------------------
  function loadCorpus() {
    if (corpus) return Promise.resolve(corpus);
    if (corpusPromise) return corpusPromise;
    corpusPromise = fetch(CORPUS_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load corpus (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        corpus = data;
        buildBm25();
        return corpus;
      });
    return corpusPromise;
  }

  // Standard BM25 with k1/b defaults, precomputed from the corpus once.
  function buildBm25() {
    var chunks = corpus.chunks;
    var docTokens = [];
    var df = {};              // document frequency per term
    var totalLen = 0;
    for (var i = 0; i < chunks.length; i++) {
      var toks = tokenize(chunks[i].title + ' ' + chunks[i].text);
      docTokens.push(toks);
      totalLen += toks.length;
      var seen = {};
      for (var j = 0; j < toks.length; j++) {
        var t = toks[j];
        if (!seen[t]) { seen[t] = true; df[t] = (df[t] || 0) + 1; }
      }
    }
    var N = chunks.length;
    var idf = {};
    for (var term in df) {
      if (Object.prototype.hasOwnProperty.call(df, term)) {
        // BM25 idf with +1 to keep weights non-negative for common terms.
        idf[term] = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5));
      }
    }
    var tf = [];               // term frequency map per document
    for (var d = 0; d < docTokens.length; d++) {
      var freq = {};
      for (var k = 0; k < docTokens[d].length; k++) {
        var w = docTokens[d][k];
        freq[w] = (freq[w] || 0) + 1;
      }
      tf.push(freq);
    }
    bm25 = {
      k1: 1.5,
      b: 0.75,
      idf: idf,
      tf: tf,
      lengths: docTokens.map(function (t) { return t.length; }),
      avgLen: totalLen / Math.max(1, N)
    };
  }

  function bm25Score(queryTokens, docIndex) {
    var k1 = bm25.k1, b = bm25.b;
    var freq = bm25.tf[docIndex];
    var dl = bm25.lengths[docIndex];
    var score = 0;
    for (var i = 0; i < queryTokens.length; i++) {
      var term = queryTokens[i];
      var f = freq[term];
      if (!f) continue;
      var idf = bm25.idf[term] || 0;
      var denom = f + k1 * (1 - b + b * dl / bm25.avgLen);
      score += idf * (f * (k1 + 1)) / denom;
    }
    return score;
  }

  function lexicalSearch(query, k) {
    var qTokens = tokenize(query);
    var scored = [];
    for (var i = 0; i < corpus.chunks.length; i++) {
      var s = qTokens.length ? bm25Score(qTokens, i) : 0;
      if (s > 0) scored.push({ index: i, score: s });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    var top = scored.slice(0, k);
    // Normalize BM25 scores to a 0..1 confidence for display only.
    var max = top.length ? top[0].score : 1;
    return top.map(function (r) {
      return {
        chunk: corpus.chunks[r.index],
        score: r.score,
        confidence: max > 0 ? r.score / max : 0
      };
    });
  }

  // --- Vector math ---------------------------------------------------------
  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) { return Math.sqrt(dot(a, a)); }

  function cosine(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === 0 || nb === 0) return 0;
    return dot(a, b) / (na * nb);
  }

  // --- Embeddings client (bring-your-own key) ------------------------------
  function embedTexts(texts) {
    if (!apiKey) return Promise.reject(new Error('No embeddings API key set'));
    var headers = { 'Content-Type': 'application/json' };
    if (config.authHeader === 'api-key') headers['api-key'] = apiKey;
    else headers['Authorization'] = 'Bearer ' + apiKey;
    return fetch(config.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ model: config.model, input: texts })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (body) {
          var msg = 'Embeddings request failed (' + r.status + ')';
          try {
            var parsed = JSON.parse(body);
            if (parsed && parsed.error && parsed.error.message) {
              msg += ': ' + parsed.error.message;
            }
          } catch (e) { /* non-JSON error body */ }
          throw new Error(msg);
        });
      }
      return r.json();
    }).then(function (payload) {
      if (!payload || !payload.data || !payload.data.length) {
        throw new Error('Embeddings response was empty');
      }
      // Preserve request order regardless of how the API returns indices.
      var sorted = payload.data.slice().sort(function (a, b) {
        return (a.index || 0) - (b.index || 0);
      });
      return sorted.map(function (d) { return d.embedding; });
    });
  }

  function corpusCacheKey() {
    return EMB_STORE_PREFIX + config.model + ':v' + (corpus.version || 0) +
      ':n' + corpus.chunks.length;
  }

  function readCachedCorpusVectors() {
    try {
      var raw = localStorage.getItem(corpusCacheKey());
      if (!raw) return null;
      var arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === corpus.chunks.length) return arr;
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeCachedCorpusVectors(vectors) {
    try {
      localStorage.setItem(corpusCacheKey(), JSON.stringify(vectors));
    } catch (e) { /* quota or blocked; retrieval still works this session */ }
  }

  // Embed every corpus chunk once (or restore from cache). onProgress(done,
  // total) reports batch progress so the UI can show "embedding corpus...".
  function ensureCorpusEmbeddings(onProgress) {
    if (corpusVectors && corpusVectors.model === config.model) {
      return Promise.resolve(corpusVectors.vectors);
    }
    var cached = readCachedCorpusVectors();
    if (cached) {
      corpusVectors = { model: config.model, vectors: cached };
      if (onProgress) onProgress(cached.length, cached.length);
      return Promise.resolve(cached);
    }
    var chunks = corpus.chunks;
    var BATCH = 16;
    var vectors = [];
    var idx = 0;
    function nextBatch() {
      if (idx >= chunks.length) {
        corpusVectors = { model: config.model, vectors: vectors };
        writeCachedCorpusVectors(vectors);
        return vectors;
      }
      var slice = chunks.slice(idx, idx + BATCH).map(function (c) {
        return c.title + '. ' + c.text;
      });
      return embedTexts(slice).then(function (vecs) {
        for (var i = 0; i < vecs.length; i++) vectors.push(vecs[i]);
        idx += BATCH;
        if (onProgress) onProgress(Math.min(idx, chunks.length), chunks.length);
        return nextBatch();
      });
    }
    return Promise.resolve().then(nextBatch);
  }

  function vectorSearch(query, k, onProgress) {
    return ensureCorpusEmbeddings(onProgress).then(function (vectors) {
      return embedTexts([query]).then(function (qv) {
        var q = qv[0];
        var scored = [];
        for (var i = 0; i < vectors.length; i++) {
          scored.push({ index: i, score: cosine(q, vectors[i]) });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, k).map(function (r) {
          return {
            chunk: corpus.chunks[r.index],
            score: r.score,
            // Cosine is in [-1, 1]; clamp negatives and use it directly as a
            // human-friendly 0..1 similarity for display.
            confidence: Math.max(0, r.score)
          };
        });
      });
    });
  }

  // --- Grounded, extractive answer -----------------------------------------
  // Honest by design: with no LLM in the loop, the "answer" is assembled from
  // the retrieved passages themselves, with citations. This showcases the
  // retrieval + grounding half of RAG without fabricating generation.
  function buildGroundedAnswer(query, results) {
    if (!results || !results.length) {
      return {
        text: "I couldn't find anything in Robert's résumé that matches that. " +
          'Try asking about his work on Azure AI Search, vector quantization, ' +
          'agentic retrieval, his projects, education, or awards.',
        citations: []
      };
    }
    var top = results.slice(0, 3);
    var lead = 'Here\u2019s what Robert\u2019s r\u00e9sum\u00e9 says, grounded in the ' +
      'passages retrieved above:';
    var body = top.map(function (r) {
      return '\u2022 ' + r.chunk.text + ' [' + r.chunk.section + ']';
    }).join('\n\n');
    return {
      text: lead + '\n\n' + body,
      citations: top.map(function (r) {
        return { title: r.chunk.title, section: r.chunk.section, url: r.chunk.url };
      })
    };
  }

  // --- Public search: prefer vectors when a key is set, else lexical -------
  function search(query, opts) {
    opts = opts || {};
    var k = opts.k || 4;
    var q = (query || '').trim();
    return loadCorpus().then(function () {
      if (!q) {
        return { method: 'none', model: null, results: [], answer: null };
      }
      function asLexical(note) {
        var results = lexicalSearch(q, k);
        return {
          method: 'lexical',
          model: 'BM25',
          results: results,
          answer: buildGroundedAnswer(q, results),
          note: note || null
        };
      }
      if (!apiKey) return asLexical(null);
      return vectorSearch(q, k, opts.onProgress).then(function (results) {
        return {
          method: 'vector',
          model: config.model,
          results: results,
          answer: buildGroundedAnswer(q, results),
          note: null
        };
      }).catch(function (err) {
        // Never leave the visitor empty-handed: degrade to lexical and surface
        // why vector search didn't run this time.
        var res = asLexical('Vector search unavailable, used lexical BM25 instead.');
        res.error = err && err.message ? err.message : String(err);
        return res;
      });
    });
  }

  // --- Config / key management (public) ------------------------------------
  function setApiKey(key) { apiKey = key ? String(key).trim() : ''; }
  function hasApiKey() { return !!apiKey; }
  function clearApiKey() { apiKey = ''; }

  function getConfig() {
    return { endpoint: config.endpoint, model: config.model, authHeader: config.authHeader };
  }

  function setConfig(next) {
    next = next || {};
    if (next.endpoint != null) config.endpoint = String(next.endpoint).trim() || DEFAULT_CONFIG.endpoint;
    if (next.model != null) config.model = String(next.model).trim() || DEFAULT_CONFIG.model;
    if (next.authHeader === 'bearer' || next.authHeader === 'api-key') config.authHeader = next.authHeader;
    persistConfig();
    // Changing the model invalidates the in-memory corpus vectors; the cache is
    // keyed by model so a prior model's vectors remain available if reselected.
    corpusVectors = null;
  }

  return {
    loadCorpus: loadCorpus,
    search: search,
    tokenize: tokenize,
    setApiKey: setApiKey,
    hasApiKey: hasApiKey,
    clearApiKey: clearApiKey,
    getConfig: getConfig,
    setConfig: setConfig,
    // Exposed for tests / advanced callers.
    _lexicalSearch: function (q, k) { return lexicalSearch(q, k || 4); },
    _cosine: cosine
  };
})();
