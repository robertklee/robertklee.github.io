var app = document.getElementById('app');

// Turn the hero into a mini "reasoning model" moment: a user prompt, a brief
// chain-of-thought that collapses into a "Thought for Ns" pill, then the
// streamed answer - all trailed by a flashing block cursor.
(function heroChat() {
  if (!app) return;

  var PROMPT = 'Hi! Tell me about Robert Lee.';
  var THOUGHT = "The visitor wants a quick intro, so let me pull together what matters. Robert's a senior engineer at Microsoft Azure AI Search, working across information retrieval, search relevance, and ranking \u2014 from classic keyword search to vector search, hybrid retrieval, and agentic retrieval, plus the RAG infrastructure behind enterprise AI. He's shipped work like vector quantization for major cost and latency wins, and cares about surfacing the right results fast at scale. I'll keep the reply to one sharp, welcoming line.";
  var ANSWER = "Welcome! I'm Robert \u2014 I build the vector, hybrid, and agentic retrieval that grounds enterprise AI with the right knowledge at billion-vector scale.";

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
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
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
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    }
  }

  function enableThoughtToggle() {
    thinkHead.addEventListener('click', function () {
      setFolded(!think.line.classList.contains('folded'));
    });
  }

  if (reduceMotion) {
    prompt.txt.textContent = PROMPT;
    think.line.classList.remove('chat-pending');
    answer.line.classList.remove('chat-pending');
    think.txt.textContent = THOUGHT;
    think.line.classList.add('done');
    setFolded(true);
    thinkLabel.textContent = 'Thought for 2s';
    enableThoughtToggle();
    answer.txt.textContent = ANSWER;
    answer.txt.appendChild(cursor);
    return;
  }

  (async function run() {
    await wait(350);
    await stream(prompt, PROMPT, { base: 34, jitter: 30, subword: false });
    await wait(320);

    think.line.classList.remove('chat-pending');
    think.line.classList.add('line-enter');
    think.line.classList.add('is-thinking');
    think.txt.style.maxHeight = cotCap(false) + 'px'; // keep the live trace inside the hero
    var t0 = now();
    await stream(think, THOUGHT, { base: 20, jitter: 22, punct: 60, subword: false });
    var secs = Math.max(1, Math.round((now() - t0) / 1000));
    think.line.classList.remove('is-thinking');
    think.line.classList.add('done');
    thinkLabel.textContent = 'Thought for ' + secs + 's';
    enableThoughtToggle();
    await wait(750);
    setFolded(true);
    answer.line.classList.remove('chat-pending');
    answer.line.classList.add('line-enter');
    await wait(320);

    await stream(answer, ANSWER, { base: 45, jitter: 45 });
    // Cache the answer's true height so an expanded trace always reserves
    // enough room to keep the answer within the hero. If the user expanded the
    // trace while the answer was still streaming, re-clamp it now.
    answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 40;
    if (think.line.classList.contains('done') &&
        !think.line.classList.contains('folded')) {
      think.txt.style.maxHeight =
        Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
    }
  })();

  // Keep the expanded trace clamped to the hero when the viewport changes
  // (e.g. rotating a phone), so it never grows into the next section.
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (reduceMotion) return;
      if (answer.txt.textContent) {
        answerReserve = Math.round(answer.line.getBoundingClientRect().height) + 24;
      }
      var open = think.line.classList.contains('done') &&
        !think.line.classList.contains('folded');
      if (open) {
        think.txt.style.maxHeight =
          Math.min(think.txt.scrollHeight, cotCap(true)) + 'px';
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

