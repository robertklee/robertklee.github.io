function createPortfolioConversation(root, config) {
  'use strict';

  const markup = document.getElementById('conversation-template').content.cloneNode(true);
  markup.querySelectorAll('[id]').forEach(element => {
    const role = element.id.slice('conversation-'.length);
    element.dataset.chat = role;
    element.id = `${config.prefix}-${role}`;
  });
  markup.querySelectorAll('[for], [aria-describedby], [aria-controls], [aria-labelledby]').forEach(element => {
    ['for', 'aria-describedby', 'aria-controls', 'aria-labelledby'].forEach(attribute => {
      if (element.hasAttribute(attribute)) {
        element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map(id => id.replace(/^conversation-/, `${config.prefix}-`)).join(' '));
      }
    });
  });
  if (config.chipsOnly) markup.querySelector('[data-chat="form"]').remove();
  root.querySelector('.conversation-chat-mount').append(markup);
  const part = role => root.querySelector(`[data-chat="${role}"]`);
  const { stories, matchTopic } = window.PortfolioNarrative;
  const transcript = part('transcript');
  const input = part('input');
  const sendButton = part('send');
  const stopButton = part('stop');
  const suggestions = part('suggestions');
  const latestButton = part('latest');
  const message = part('message');
  const announcement = part('announcement');
  if (config.chipsOnly) {
    root.querySelector('.conversation-thread-bar').hidden = true;
    root.querySelector('.conversation-identity p').textContent = 'Interactive introduction';
    root.querySelector('.conversation-disclosure').textContent = 'Prewritten replies. Choose a question to explore.';
    part('reset').textContent = 'Restart \u21bb';
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cursor = window.HeroChat.createCursor();
  const history = [];
  let generation = 0;
  let active = null;
  let topic = config.introduction ? 'overview' : 'early';
  let followLatest = true;
  let restoreChipFocus = false;
  let initialized = false;

  const topicLabels = {
    overview: 'The whole career', search: 'Search & agents', vision: 'Model training',
    leadership: 'People & community', early: 'Earlier career', education: 'Education & awards'
  };
  const deeperAnswers = {
    overview: {
      topic: 'vision',
      paragraphs: ['Take the human pose estimation project: I led the team, designed the architecture and cloud training pipeline, and worked on augmentation, visualization, and deployment. The model learned from randomly initialized weights rather than starting with a pretrained checkpoint.', 'That is a useful example of the through-line: understanding the whole system, not just the API at its edge.'],
      sources: [stories.vision.sources[0]]
    },
    search: {
      topic: 'search',
      paragraphs: ['Vector quantization is a concrete example. I drove it from Public Preview to GA, spanning scalar and binary representations and SIMD-accelerated distance computation.', 'The existing CV reports 8-32x customer cost savings and up to 20x latency reduction. Those are workload-dependent results, not universal guarantees. I also built resource-aware HNSW quotas that cut limit overshoot by 100x.'],
      sources: [stories.search.sources[1]]
    },
    vision: {
      topic: 'vision',
      paragraphs: ['For the pose model, we predicted joint heatmaps rather than directly regressing joint coordinates, and trained from random initialization on COCO-2017. I owned the architecture, augmentation method, and cloud training pipeline.', 'There were deliberate limitations: the person needed to be relatively centered and occupy about 60-95% of the image height. Heavy occlusion and overlapping people were difficult cases.'],
      sources: [stories.vision.sources[0]]
    },
    leadership: {
      topic: 'leadership',
      paragraphs: ["The seniors' digital literacy program ran for six years and grew to 180 volunteers and more than 650 participants across 30 workshops. I secured university sponsorship, funding, lab space, and support.", 'The model included concurrent beginner and advanced sessions, plus volunteers providing individual help. I also built a recurring recruitment pipeline and handed the program to successors who kept it going.'],
      sources: [stories.leadership.sources[0]]
    },
    early: {
      topic: 'early',
      paragraphs: ['At Microsoft Garage, the challenge was an offline mobile app for chest X-ray classification. My work included the image-processing pipeline, continuous integration, an iOS share extension, and integration of TensorFlow on Android.', 'It was a different kind of engineering problem from a distributed search service: getting a model and its surrounding application to work together on a device.'],
      sources: [stories.early.sources[0]]
    },
    education: {
      topic: 'education',
      paragraphs: ['I graduated in Electrical & Computer Engineering from the University of Victoria with a 97% cumulative average. My undergraduate research explored hardware acceleration for neural networks through the Jamie Cassels Undergraduate Research Award.', 'Engineering design competitions were another way to put that foundation into practice, including a first-place finish at the Western Engineering Competition and three first-place UVEC senior-design finishes.'],
      sources: [stories.education.sources[0], stories.education.sources[1]]
    }
  };

  function sourceLink(source, index) {
    const link = document.createElement('a');
    link.href = `#${source.id}`;
    link.textContent = `[${index + 1}] ${source.title} \u2197`;
    return link;
  }

  function updateLatestButton() {
    latestButton.hidden = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60;
  }

  function scrollLatest() {
    transcript.scrollTop = transcript.scrollHeight;
    updateLatestButton();
  }

  function follow() {
    if (followLatest) scrollLatest();
    else updateLatestButton();
  }

  const stream = window.HeroChat.createStreamer({
    cursor, getToken: () => generation, onChunk: follow
  });

  function updateControls() {
    if (sendButton) sendButton.disabled = Boolean(active);
    if (stopButton) stopButton.hidden = !active;
    suggestions.hidden = Boolean(config.chipsOnly && active);
    root.querySelectorAll('[data-conversation-topic], [data-chat="suggestions"] button').forEach(button => { button.disabled = Boolean(active); });
    part('context-label').textContent = topicLabels[topic];
    const count = history.length;
    part('turn-count').textContent = `${count} ${count === 1 ? 'exchange' : 'exchanges'}`;
  }

  function updateSuggestions() {
    const chipQuestions = {
      overview: ['What do you build at Microsoft?', 'What did you train from scratch?', 'What about leadership?'],
      search: ['Show me a concrete example', stories.early.question, stories.leadership.question],
      vision: ['Show me a concrete example', 'How does that connect to search?', stories.education.question],
      leadership: ['Show me a concrete example', stories.vision.question, stories.education.question],
      early: ['Show me a concrete example', stories.vision.question, stories.search.question],
      education: ['Show me a concrete example', stories.leadership.question, stories.search.question]
    };
    const questions = config.chipsOnly ? chipQuestions[topic] : config.introduction && topic === 'overview' ? [
      'What do you build at Microsoft?', 'What did you train from scratch?', 'What about leadership?'
    ] : history.length ? [
      'Show me a concrete example',
      topic === 'vision' ? 'How does that connect to search?' : 'What about model training?',
      topic === 'leadership' ? 'What shaped his education?' : 'What about leadership?'
    ] : ['What do you build at Microsoft?', 'What did you train from scratch?', 'What have you built beyond the code?'];
    suggestions.replaceChildren(...questions.map(question => {
      const button = document.createElement('button');
      button.type = 'button';
      if (config.chipsOnly) {
        const plus = document.createElement('span');
        plus.className = 'conversation-suggestion-plus';
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+';
        const label = document.createElement('span');
        label.textContent = question;
        button.append(plus, label);
      } else button.textContent = question;
      button.addEventListener('click', () => submitQuestion(question));
      return button;
    }));
    updateControls();
  }

  function answerForTopic(nextTopic) {
    if (config.introduction && nextTopic === 'overview') return introduction();
    const story = stories[nextTopic];
    return { topic: nextTopic, notes: story.notes, paragraphs: story.paragraphs.slice(0, 2), sources: story.sources.slice(0, 2) };
  }

  function resolveAnswer(question) {
    if (history.length && /\b(before that|before this|before then|previously|earlier than that)\b/i.test(question)) {
      const earlierTopic = topic === 'early' ? 'education' : 'early';
      const reply = answerForTopic(earlierTopic);
      reply.notes = `Follow-up to ${topicLabels[topic].toLowerCase()}: move to an earlier chapter. These are authored transitions, not model reasoning.`;
      return reply;
    }
    if (history.length && /^(?:and\s+)?(?:can you\s+)?(?:show me\s+)?(?:a\s+)?(?:concrete example|an example|go deeper|tell me more|more detail|what was the impact|what were the limitations|how did that work)[.!?]*$/i.test(question)) {
      const detail = deeperAnswers[topic];
      return { ...detail, notes: `The previous subject was ${topicLabels[topic].toLowerCase()}. Stay on that subject and use a more specific example from the CV.` };
    }
    if (history.length && /\b(connect|relate)\w*\b.*\b(search|retrieval)\b/i.test(question)) {
      return {
        topic: 'search',
        notes: `Connect the previous ${topicLabels[topic].toLowerCase()} discussion to the retrieval work. This is a curated transition.`,
        paragraphs: [
          topic === 'vision'
            ? 'The connection is useful representations. In the vision projects, I built and trained models to extract structure from images. In vector search, I work on the engine that retrieves information through embedding similarity.'
            : 'The connection is taking a system from an idea to something useful. The current search work brings that into retrieval infrastructure: relevance, efficient vector search, and evidence for AI agents.',
          'They are distinct projects, not the same model or pipeline. My current focus is production retrieval, while the earlier model-building work shows experience with architecture, training, and evaluation.'
        ],
        sources: [stories.vision.sources[0], stories.search.sources[0]]
      };
    }
    const nextTopic = matchTopic(question);
    if (nextTopic) return answerForTopic(nextTopic);
    return {
      topic,
      notes: 'No matching curated answer. Keep the previous topic rather than inventing information.',
      paragraphs: ["I don't have a scripted answer for that question. This prototype covers Robert's search work, model training, earlier roles, leadership, and education.", 'You can ask one of those questions, or use "show me a concrete example" to follow up on the current subject.'],
      sources: []
    };
  }

  function appendTurn(question, reply, sample = false) {
    const turn = document.createElement('div');
    turn.className = 'conversation-turn';
    turn.dataset.turn = history.length + 1;
    const user = document.createElement('div');
    user.className = 'conversation-user';
    const userLabel = document.createElement('span');
    userLabel.className = 'conversation-user-label';
    userLabel.textContent = sample ? (config.introduction ? 'Opening question' : 'Example visitor') : 'You';
    const bubble = document.createElement('p');
    bubble.className = 'conversation-user-bubble';
    bubble.textContent = question;
    user.append(userLabel, bubble);
    const assistant = document.createElement('div');
    assistant.className = 'conversation-assistant';
    const avatar = document.createElement('span');
    avatar.className = 'conversation-avatar';
    avatar.textContent = 'r.';
    avatar.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    const heading = document.createElement('div');
    heading.className = 'conversation-assistant-heading';
    heading.textContent = "Robert's portfolio";
    const notes = document.createElement('details');
    notes.className = 'conversation-notes';
    const notesLabel = document.createElement('summary');
    notesLabel.textContent = 'Reading notes';
    const notesText = document.createElement('p');
    notes.append(notesLabel, notesText);
    const answer = document.createElement('div');
    answer.className = 'conversation-answer';
    const sources = document.createElement('div');
    sources.className = 'conversation-sources';
    const state = document.createElement('p');
    state.className = 'conversation-turn-state';
    body.append(heading, notes, answer, sources, state);
    assistant.append(avatar, body);
    turn.append(user, assistant);
    transcript.append(turn);
    const record = { question, reply, turn, body, notes, notesLabel, notesText, answer, sources, state };
    history.push(record);
    return record;
  }

  function fillAnswer(record) {
    record.notesText.textContent = record.reply.notes;
    record.answer.replaceChildren(...record.reply.paragraphs.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    }));
  }

  function finalize(record) {
    record.sources.replaceChildren(...record.reply.sources.map(sourceLink));
    record.notes.open = false;
    record.notes.dataset.streaming = 'false';
    record.notesLabel.textContent = `Reading notes \u00b7 ${record.reply.sources.length} CV ${record.reply.sources.length === 1 ? 'source' : 'sources'}`;
    record.body.setAttribute('aria-busy', 'false');
    cursor.remove();
    if (active === record) active = null;
    updateSuggestions();
    if (restoreChipFocus && document.activeElement === document.body) {
      suggestions.querySelector('button').focus({ preventScroll: true });
    }
    restoreChipFocus = false;
    follow();
  }

  async function streamAnswer(record) {
    const token = ++generation;
    active = record;
    record.body.setAttribute('aria-busy', 'true');
    updateControls();
    if (reducedMotion.matches) {
      fillAnswer(record);
      finalize(record);
      announcement.textContent = record.reply.paragraphs.join(' ');
      return;
    }
    record.notes.open = true;
    record.notes.dataset.streaming = 'true';
    record.notesLabel.textContent = history.length > 1 ? 'Following the conversation...' : 'Reading the CV...';
    await stream({ txt: record.notesText }, record.reply.notes, { base: 10, jitter: 5, punct: 0, subword: false });
    if (token !== generation) return;
    record.notes.open = false;
    record.notes.dataset.streaming = 'false';
    record.notesLabel.textContent = 'Reading notes';
    for (const text of record.reply.paragraphs) {
      const paragraph = document.createElement('p');
      record.answer.append(paragraph);
      await stream({ txt: paragraph }, text, { base: 16, jitter: 9, punct: 25, subword: false });
      if (token !== generation) return;
    }
    finalize(record);
    announcement.textContent = record.reply.paragraphs.join(' ');
  }

  function renderError(record, error) {
    if (active !== record) return;
    generation++;
    active = null;
    cursor.remove();
    record.body.setAttribute('aria-busy', 'false');
    record.notes.dataset.streaming = 'false';
    record.state.textContent = 'This response could not finish. Please try again or read the full CV.';
    message.textContent = 'The response could not be displayed. Your conversation has been kept.';
    console.error('Unable to render portfolio conversation:', error);
    updateSuggestions();
  }

  function submitQuestion(question) {
    if (active) {
      message.textContent = 'A response is still being written. Stop it before sending another message.';
      return;
    }
    question = question.trim();
    if (!question) {
      message.textContent = 'Choose a suggested question to continue.';
      if (input) {
        input.setCustomValidity('Enter a message or choose a suggested question.');
        input.reportValidity();
      }
      return;
    }
    if (input && question.length > input.maxLength) {
      input.setCustomValidity(`Keep your message under ${input.maxLength + 1} characters.`);
      input.reportValidity();
      return;
    }
    message.textContent = '';
    if (input) input.setCustomValidity('');
    restoreChipFocus = Boolean(config.chipsOnly && suggestions.contains(document.activeElement));
    const reply = resolveAnswer(question);
    transcript.querySelector('.conversation-welcome')?.remove();
    topic = reply.topic;
    const record = appendTurn(question, reply);
    part('thread-label').textContent = 'Your conversation \u00b7 earlier messages stay above';
    if (input) {
      input.value = '';
      input.style.height = '';
      input.focus({ preventScroll: true });
    }
    followLatest = true;
    scrollLatest();
    announcement.textContent = 'Writing a response.';
    streamAnswer(record).catch(error => renderError(record, error));
  }

  function stopResponse() {
    if (!active) return;
    const record = active;
    generation++;
    active = null;
    cursor.remove();
    record.body.setAttribute('aria-busy', 'false');
    record.notes.dataset.streaming = 'false';
    record.notesLabel.textContent = 'Reading notes \u00b7 stopped';
    record.state.textContent = 'Response stopped. You can ask another question.';
    updateSuggestions();
    announcement.textContent = 'Response stopped. Earlier messages and the partial response have been kept.';
    input?.focus({ preventScroll: true });
    follow();
  }

  function finishActiveResponse() {
    if (!active) return;
    const record = active;
    generation++;
    fillAnswer(record);
    finalize(record);
  }

  function resetConversation() {
    generation++;
    active = null;
    cursor.remove();
    history.length = 0;
    topic = 'overview';
    followLatest = true;
    transcript.replaceChildren();
    message.textContent = '';
    if (config.chipsOnly) {
      initialize(true);
      announcement.textContent = 'Conversation restarted.';
      return;
    }
    const welcome = document.createElement('div');
    welcome.className = 'conversation-welcome';
    const title = document.createElement('h3');
    title.textContent = 'Where would you like to begin?';
    const copy = document.createElement('p');
    copy.textContent = 'Ask about my search work, model training, earlier roles, or community projects. Then ask a follow-up: the conversation stays here.';
    welcome.append(title, copy);
    transcript.append(welcome);
    input.value = '';
    input.style.height = '';
    input.setCustomValidity('');
    message.textContent = '';
    part('thread-label').textContent = 'New conversation';
    updateSuggestions();
    scrollLatest();
    input.focus({ preventScroll: true });
    announcement.textContent = 'New conversation started.';
  }

  function introduction() {
    return {
      topic: 'overview',
      notes: "Introduce Robert through his current work, then show the model-building and community chapters. Keep it short; the full portfolio follows below.",
      paragraphs: [
        "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure AI Search. I build semantic, vector, and agentic retrieval that helps AI find the right evidence.",
        "I've also trained computer-vision models from scratch and built community programs. Ask a follow-up, or scroll down to explore my work."
      ],
      sources: [stories.search.sources[0], stories.vision.sources[0], stories.leadership.sources[0]]
    };
  }

  function initialize(animateIntro = window.location.hash === '' || window.location.hash === `#${config.study}`) {
    initialized = true;
    transcript.replaceChildren();
    if (config.introduction) {
      const reply = introduction();
      const record = appendTurn('Who is Robert?', reply, true);
      part('thread-label').textContent = 'Start here \u00b7 then ask a follow-up';
      updateSuggestions();
      if (animateIntro) {
        streamAnswer(record).catch(error => renderError(record, error));
      } else {
        fillAnswer(record);
        finalize(record);
      }
      return;
    }
    const first = {
      topic: 'search',
      notes: 'Start with the current role. Use the senior engineering CV entry rather than inventing an answer.',
      paragraphs: ["I build the retrieval behind enterprise AI at Microsoft: vector search, relevance, and agentic retrieval. Recently that includes broadening the evidence returned by vector search and turning research into verifiable filters and boosts for agents."],
      sources: [stories.search.sources[0]]
    };
    const second = {
      topic: 'early',
      notes: 'The visitor asked what came before the current role. Connect that question to earlier engineering work and internships.',
      paragraphs: ['Before the senior role, I worked on vector quantization, hybrid-search relevance, and HNSW quotas. Earlier internships spanned offline ML at Microsoft Garage, TypeScript search tooling, and backend APIs.', "There's a model-building chapter too: pose estimation, road segmentation, and self-supervised depth. You can follow any of those threads."],
      sources: [stories.search.sources[1], stories.early.sources[0]]
    };
    [appendTurn('What do you build at Microsoft?', first, true), appendTurn('And what came before that?', second, true)].forEach(record => {
      fillAnswer(record);
      finalize(record);
    });
    topic = 'early';
    updateSuggestions();
    transcript.scrollTop = 0;
    followLatest = transcript.scrollHeight <= transcript.clientHeight;
    updateLatestButton();
  }

  if (input) {
    part('form').addEventListener('submit', event => {
      event.preventDefault();
      submitQuestion(input.value);
    });
    input.addEventListener('input', () => {
      input.setCustomValidity('');
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        part('form').requestSubmit();
      }
    });
  }
  root.querySelectorAll('[data-conversation-topic]').forEach(button => {
    button.addEventListener('click', () => submitQuestion(stories[button.dataset.conversationTopic].question));
  });
  part('reset').addEventListener('click', resetConversation);
  stopButton?.addEventListener('click', stopResponse);
  transcript.addEventListener('scroll', () => {
    followLatest = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 60;
    updateLatestButton();
  });
  latestButton.addEventListener('click', () => {
    followLatest = true;
    scrollLatest();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) finishActiveResponse();
  });
  document.addEventListener('study-change', event => {
    if (event.detail.id === config.study) {
      if (!initialized) initialize();
      if (event.detail.anchor.startsWith('profile') || event.detail.anchor === config.contentAnchor) finishActiveResponse();
    } else finishActiveResponse();
  });
  if (document.body.dataset.study === config.study) initialize();
}

createPortfolioConversation(document.getElementById('conversation'), { prefix: 'conversation', study: 'conversation', introduction: false });
createPortfolioConversation(document.getElementById('editorial-chat'), { prefix: 'editorial-chat', study: 'editorial-chat', contentAnchor: 'editorial-chat-stories', introduction: true, chipsOnly: true });
