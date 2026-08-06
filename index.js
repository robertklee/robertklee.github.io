var app = document.getElementById('app');

var typewriter = new Typewriter(app, {
  loop: false,
  delay: 40,
});

typewriter
  .pauseFor(500)
  .typeString('Welcome!')
  .pauseFor(500)
  .typeString(' I\'m a Senior Software Engineer at Microsoft, where I work on everything from search relevance to LLM-driven agents.') 
  .start()


var granimInstance = new Granim({
    element: '#canvas-image-blending',
    direction: 'top-bottom',
    isPausedWhenNotInView: true,
    image : {
        source: 'assets/snow.jpg', //change image for intro section if desired
        blendingMode: 'multiply',
    },
    states : {
        "default-state": {
            gradients: [
                ['#29323c', '#485563'],
                ['#FF6B6B', '#556270'],
                ['#80d3fe', '#7ea0c4'],
                ['#f0ab51', '#eceba3']
            ],
            transitionSpeed: 8000
        }
    }
});

//RESUME
var resume = document.getElementById("resume");
resume.onclick = function() { 
  window.open("/r/docs/Robert_Lee_Website.pdf", "_blank") //TODO add your link
}

// Project 1
var btn_proj_1 = document.getElementById("btn-proj1");
btn_proj_1.onclick = function() { 
  window.open("https://github.com/robertklee/COCO-Human-Pose", "_blank") 
}

// Project 2
var btn_proj_2 = document.getElementById("btn-proj2");
btn_proj_2.onclick = function() { 
  window.open("https://github.com/robertklee/KITTI-RoadSeg", "_blank") 
}

// Project 3
var btn_proj_3 = document.getElementById("btn-proj3");
btn_proj_3.onclick = function() { 
  window.open("https://github.com/DeclanMcIntosh/monodepthV2tf", "_blank") 
}

// THEME / DARK MODE
(function () {
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

