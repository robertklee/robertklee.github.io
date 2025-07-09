var app = document.getElementById('app');

var typewriter = new Typewriter(app, {
  loop: false,
  delay: 30,
});


typewriter
    .pauseFor(500)
    .typeString('> Launching agent...<br>')
    .pauseFor(700)
    .typeString('> Embedding query into vector space...<br>')
    .pauseFor(700)
    .typeString('> Running multi-hop retrieval across distributed nodes...<br>')
    .pauseFor(800)
    .typeString('> Nearest neighbor not found.<br><br>')
    .pauseFor(1000)
    .typeString('> Recommendations:<br>')
    .typeString('   - Check the URL<br>')
    .typeString('   - Return to the homepage<br>')
    .pauseFor(600)
    .typeString('<br>> Agent standing by for new instructions...')
    .start();

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