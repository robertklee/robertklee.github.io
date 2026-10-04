(() => {
  'use strict';

  const descriptions = {
    baseline: {
      title: 'Current entrance: quiet background construction',
      summary: 'The original animation. The chat is already present; nearly all the movement is in the peripheral graph. Use this as the subtle reference point.',
      steps: ['Points fade in across the depth planes.', 'Existing graph connections trace into place and labels resolve.', 'Only the chat border briefly picks up the blue accent. A query ends any remaining entrance.'],
      timing: 'Entrance: 820 ms desktop / 520 ms compact. Select "Fill available space" to also reproduce the original mobile card sizing.',
    },
    depth: {
      title: 'Depth reveal: bring the scene into focus',
      summary: 'A polished spatial reveal, not a light show. Staggering the depth layers makes the field feel like a scene being assembled around the stationary name.',
      steps: ['Soft far points emerge first, followed by the middle layer.', 'Sharp topic regions and their connections resolve last.', 'The card rises 14 px from a slightly smaller scale and settles as the scene comes into focus.'],
      timing: 'Entrance: 1.7 s desktop / 1.1 s compact. Prompt and model output continue without an added pause.',
    },
    signal: {
      title: 'Signal ignition: let the network wake up',
      summary: 'A visible activation wave follows the actual graph connections. The emphasis is on information traveling through a system, rather than objects moving through space.',
      steps: ['Activation spreads outward from the graph entry point by hop distance.', 'Connections brighten and topic hubs briefly flare with expanding rings.', 'A moving highlight traces the card perimeter, then returns to the quiet resting state.'],
      timing: 'Entrance: 1.75 s desktop / 1.2 s compact. The card stays spatially stationary; retrieval can overlap the activation wave.',
    },
    camera: {
      title: 'Camera arrival: pull back into the scene',
      summary: 'The most cinematic direction. Only the graph camera moves; the name and navigation remain stable, so the motion reads as depth rather than a whole-page zoom.',
      steps: ['The graph begins 22% closer, slightly turned and defocused.', 'The view pulls back and turns into its final composition.', 'The card rises 22 px from a smaller scale while the focal plane sharpens.'],
      timing: 'Entrance: 1.9 s desktop / 1.3 s compact. Stronger spatial movement, with no additional wait for the chat.',
    },
    hybrid: {
      title: 'Recommended hybrid: one coordinated arrival',
      summary: 'The balanced recommendation: signal ignition supplies the memorable moment, while a much smaller camera move and card lift make the arrival feel dimensional.',
      steps: ['A restrained 6.5% pullback establishes depth while points emerge.', 'The activation wave lights graph connections and topic hubs.', 'The card rises 14 px and its perimeter lights up, then all effects relax into the ambient scene.'],
      timing: 'Entrance: 1.85 s desktop / 1.25 s compact. The question, graph, and model output overlap; there is no dramatic hold.',
    },
    dramatic: {
      title: 'Retrieval-first hybrid: question, search, then response',
      summary: 'The new dramatic example. Keep the completed question in a small card while the illustrative retrieval visibly does the work; only then let the model output expand the window.',
      steps: ['The recommended hybrid brings in the graph and compact question card.', 'After the question finishes, hold the text and show "Retrieving sources..." while the real illustrated search descends layers and branches to its documents.', 'When the last source marker finishes arriving, the card gives a short accent payoff and thinking/answer streaming begins.'],
      timing: 'Entrance: 1.85 s desktop / 1.25 s compact. Search: 3 s desktop / 2.4 s compact, plus 380 ms for the final source marker. This is deliberate dramatic pacing, not a real backend request.',
    },
  };
  const params = new URLSearchParams(window.location.search);
  const preview = document.getElementById('preview');
  const status = document.getElementById('status');
  const buttons = [...document.querySelectorAll('[data-effect]')];
  const controls = ['viewport', 'theme', 'motion', 'card'].map(id => document.getElementById(id));
  let effect = params.get('effect') || 'dramatic';
  let seed = params.get('seed') || '2401';

  if (!Object.hasOwn(descriptions, effect)) {
    status.textContent = `Unknown entrance direction: ${effect}`;
    status.classList.add('is-error');
    return;
  }
  for (const control of controls) {
    const value = params.get(control.id);
    if (value && [...control.options].some(option => option.value === value)) control.value = value;
  }

  function replay() {
    const settings = new URLSearchParams({ effect, seed });
    for (const control of controls) settings.set(control.id, control.value);
    history.replaceState(null, '', `?${settings}`);
    document.documentElement.dataset.theme = document.getElementById('theme').value;
    document.getElementById('stage').classList.toggle('is-mobile', document.getElementById('viewport').value === 'mobile');
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.effect === effect)));
    const description = descriptions[effect];
    document.getElementById('idea-title').textContent = description.title;
    document.getElementById('idea-summary').textContent = description.summary;
    document.getElementById('idea-steps').replaceChildren(...description.steps.map(step => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));
    document.getElementById('idea-timing').textContent = description.timing;
    document.getElementById('full-preview').href = `preview.html?${settings}`;
    preview.title = `${effect} hero entrance preview`;
    status.classList.remove('is-error');
    status.textContent = 'Loading preview...';
    preview.src = `preview.html?${settings}&replay=${Date.now()}`;
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    effect = button.dataset.effect;
    replay();
  }));
  controls.forEach(control => control.addEventListener('change', replay));
  document.getElementById('replay').addEventListener('click', replay);
  document.getElementById('shuffle').addEventListener('click', () => {
    seed = String(crypto.getRandomValues(new Uint32Array(1))[0]);
    replay();
  });
  preview.addEventListener('error', () => {
    status.textContent = 'The preview failed to load. Serve the repository root over HTTP.';
    status.classList.add('is-error');
  });
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== preview.contentWindow ||
        event.data?.type !== 'hero-entrance-spike') return;
    status.textContent = event.data.message;
    status.classList.toggle('is-error', event.data.error === true);
  });

  replay();
})();
