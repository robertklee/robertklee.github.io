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

