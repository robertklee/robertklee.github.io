var app = document.getElementById('app');

// Stream the hero line like an LLM emitting tokens: word/subword chunks with
// a variable cadence, small pauses at punctuation, and a blinking block cursor.
(function streamHero() {
  if (!app) return;

  var message = "Welcome! I'm Robert \u2014 I build the vector search, agentic retrieval, and RAG infrastructure behind enterprise AI.";

  var textSpan = document.createElement('span');
  var cursor = document.createElement('span');
  cursor.className = 'stream-cursor is-streaming';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.textContent = '\u258B';
  app.appendChild(textSpan);
  app.appendChild(cursor);

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    textSpan.textContent = message;
    cursor.classList.remove('is-streaming');
    return;
  }

  // Split into whitespace-led words, then halve longer words into two
  // subword chunks so the reveal reads like real token streaming.
  var tokens = [];
  (message.match(/\s*\S+/g) || []).forEach(function (word) {
    var lead = word.match(/^\s*/)[0];
    var core = word.slice(lead.length);
    if (core.length > 7) {
      var cut = Math.ceil(core.length / 2);
      tokens.push(lead + core.slice(0, cut));
      tokens.push(core.slice(cut));
    } else {
      tokens.push(word);
    }
  });

  var i = 0;
  function emit() {
    if (i >= tokens.length) {
      cursor.classList.remove('is-streaming');
      return;
    }
    var chunk = tokens[i++];
    textSpan.textContent += chunk;
    var delay = 45 + Math.random() * 45;
    if (/[.,;!?\u2014]$/.test(chunk)) delay += 180;
    setTimeout(emit, delay);
  }
  setTimeout(emit, 400);
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
var resume = document.getElementById("resume");
resume.onclick = function() {
  window.open("/r/docs/Robert_Lee_Website.pdf", "_blank"); //TODO add your link
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

