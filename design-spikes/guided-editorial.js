(() => {
  'use strict';

  const stories = {
    overview: {
      question: "What connects Robert's work?",
      category: '01 / The through-line',
      title: 'A builder, across different kinds of systems.',
      notes: 'Connect the model-building projects, production retrieval work, and community leadership. Keep the distinctions visible rather than reducing the whole career to one specialty.',
      paragraphs: [
        "My work runs from training computer-vision models to building the retrieval infrastructure behind enterprise AI. The common thread is understanding a system deeply enough to build it, measure it, and make it useful.",
        'At Microsoft, that means vector search, quantization, relevance, and agentic retrieval. Earlier projects meant architecture choices, data augmentation, cloud training pipelines, and models trained from random initialization.',
        "And building isn't only technical: I founded a digital literacy program, led student engineering initiatives, and now mentor student teams through open-ended problems."
      ],
      takeaway: 'Learn how it works.\nMake it work in the world.',
      sources: [
        { id: 'profile-projects-entry-1', category: 'Model building', title: 'Human pose estimation', detail: 'Architecture, training, and deployment from scratch.' },
        { id: 'profile-work-entry-2', category: 'Production systems', title: 'Vector search & quantization', detail: 'Software Engineer II / 2022 - 2025' },
        { id: 'profile-leadership-entry-3', category: 'Community', title: 'Digital literacy program', detail: 'Six years of building a program and a volunteer community.' }
      ],
      next: 'vision'
    },
    search: {
      question: 'What does he build beneath AI search?',
      category: '02 / Search & agents',
      title: 'Before an AI can answer, something has to find the evidence.',
      notes: 'Start with the current retrieval work, then connect it to the engine-level efficiency work beneath it. Separate individual relevance from the quality of the whole evidence set.',
      paragraphs: [
        "I work on the retrieval layer beneath enterprise AI: the systems that decide which information a model or agent gets to read. My current work includes diversity-aware vector retrieval and translating research into bounded, verifiable filter and boost generation.",
        'Before that, I drove vector quantization from Public Preview to GA, worked on hybrid-search relevance, and built resource-aware quotas for HNSW indexes. That combines algorithmic work with the performance and correctness demands of a production service.',
        'The foundations matter too. Earlier work included index aliases and a zero-downtime telemetry migration: the quieter engineering that helps a search service keep working as it evolves.'
      ],
      takeaway: 'The answer is only as useful\nas the evidence behind it.',
      sources: [
        { id: 'profile-work-entry-1', category: 'Current work', title: 'Senior Software Engineer', detail: 'Diversity-aware retrieval, agentic filters, and research-to-production leadership.' },
        { id: 'profile-work-entry-2', category: 'The vector engine', title: 'Software Engineer II', detail: 'Quantization, hybrid relevance, HNSW quotas, and facet aggregation.' },
        { id: 'profile-work-entry-3', category: 'Foundations', title: 'Software Engineer', detail: 'Index aliases and zero-downtime telemetry migration.' }
      ],
      next: 'early'
    },
    vision: {
      question: 'What did he train from scratch?',
      category: '03 / Models & computer vision',
      title: 'Not just calling a model. Building one.',
      notes: 'Distinguish the pose model trained from random initialization from the segmentation and depth projects. Show the training work and the limitations, not only the prediction images.',
      paragraphs: [
        'I led a student team building a human pose estimation model on COCO-2017, trained from randomly initialized weights. I architected the cloud training pipeline, model architecture, and data augmentation, and led visualization and deployment work. It used heatmaps for joint prediction and had explicit framing and occlusion limitations.',
        'For semantic road segmentation, I trained a U-Net on KITTI Road and built the training pipeline, data generator, custom losses, and augmentation. The work included fixing architectural and training problems rather than only tuning a finished model.',
        'For monocular depth, I adapted a limited version of Monodepth2 to TensorFlow and DrivingStereo, using stereo photometric reconstruction and edge-aware smoothness losses without ground-truth depth data.'
      ],
      takeaway: 'Architecture. Data. Training. Evaluation.\nThe whole model-building loop.',
      sources: [
        { id: 'profile-projects-entry-1', category: 'Trained from scratch', title: 'Human pose estimation', detail: 'COCO-2017 / Team and project lead', image: 'skateboarder-pred.webp', alt: 'Pose estimation output with skeleton keypoints on a skateboarder' },
        { id: 'profile-projects-entry-2', category: 'Segmentation', title: 'Learning where the road is', detail: 'U-Net / KITTI Road / Custom training pipeline' },
        { id: 'profile-projects-entry-3', category: 'Self-supervision', title: 'Learning depth from images', detail: 'TensorFlow / DrivingStereo / Photometric reconstruction' }
      ],
      next: 'search'
    },
    leadership: {
      question: 'What has he built beyond the code?',
      category: '04 / People & community',
      title: 'Some of the most lasting systems are made of people.',
      notes: 'Look beyond the engineering job titles. Connect the long-running digital literacy program, student engineering leadership, and more recent industry mentorship.',
      paragraphs: [
        "I founded and directed a seniors' digital literacy program for six years, growing it to 180 volunteers and more than 650 participants across 30 workshops. The work included curriculum, sponsorship, volunteer recruitment, and handing the program to successors who sustained it.",
        'I also co-led the university IEEE student branch, building a 14-workshop technical skills series reaching more than 350 students. Separately, I founded and chaired a technology and business strategy conference for over 200 attendees.',
        'More recently, I have mentored requirements engineering students as an industry stakeholder: bringing open-ended production AI problems and helping teams reason about scope, assumptions, requirements, and design.'
      ],
      takeaway: 'Build the program.\nHelp other people carry it forward.',
      sources: [
        { id: 'profile-leadership-entry-3', category: '2015 - 2021', title: "Seniors' digital literacy", detail: 'Founder & Program Director / 180 volunteers / 650+ participants' },
        { id: 'profile-leadership', category: 'Student leadership', title: 'IEEE & the strategy conference', detail: 'Technical teaching, community building, and event leadership.' },
        { id: 'profile-leadership-entry-1', category: 'Industry mentorship', title: 'Requirements engineering', detail: 'An open-ended production AI challenge / University of Victoria' }
      ],
      next: 'education'
    },
    early: {
      question: 'What came before the current search work?',
      category: '05 / Earlier chapters',
      title: 'The earlier work belongs in the story, too.',
      notes: 'Go back to the internships instead of retelling the senior role. Highlight the distinct work: offline ML, search developer tooling, and backend APIs.',
      paragraphs: [
        'At Microsoft Garage in 2018, I helped build a cross-platform mobile app for offline chest X-ray classification. I worked on image processing, continuous integration, an iOS share extension, and TensorFlow integration on Android.',
        'In 2019, I worked on Azure Search developer tooling: a dynamic search-website generator in TypeScript, query suggestions and filtering, and improvements to JSON editing and customization in the portal.',
        'In 2020, the focus moved to search APIs and backend services. I designed and shipped a highly requested Azure Cognitive Search feature under a preview API, before joining the team full-time in 2021.'
      ],
      takeaway: 'The current specialty has a history:\nmodels, tooling, APIs, then engines.',
      sources: [
        { id: 'profile-work-entry-6', category: '2018 / Microsoft Garage', title: 'Offline machine learning', detail: 'Cross-platform mobile / C# / TensorFlow' },
        { id: 'profile-work-entry-5', category: '2019 / Azure Search', title: 'Developer experience', detail: 'TypeScript / Website generation / Portal tooling' },
        { id: 'profile-work-entry-4', category: '2020 / Cognitive Search', title: 'Search APIs & services', detail: 'C# / Customer-requested backend functionality' }
      ],
      next: 'vision'
    },
    education: {
      question: 'What shaped his engineering foundation?',
      category: '06 / Education & awards',
      notes: 'Bring together the degree, undergraduate ML hardware research, and selected awards. Distinguish academic recognition from the hands-on engineering projects.',
      title: 'Curiosity, with an engineering foundation.',
      paragraphs: [
        'I graduated in Electrical & Computer Engineering from the University of Victoria with a 97% cumulative average. The degree spanned distributed systems, algorithms, signal processing, embedded design, and machine learning, alongside undergraduate research on hardware acceleration for neural networks.',
        'I earned more than 20 scholarships and awards, including a Schulich Leader Scholarship, the Governor General\'s Academic Medal, and the Jamie Cassels Undergraduate Research Award. Engineering design competitions were another place to turn theory into something that worked.'
      ],
      takeaway: 'Understand the abstraction.\nStay curious about what is beneath it.',
      sources: [
        { id: 'profile-education-entry-1', category: '2016 - 2021', title: 'Electrical & Computer Engineering', detail: 'University of Victoria / Undergraduate ML hardware research' },
        { id: 'profile-awards', category: 'Selected recognition', title: 'Scholarships & engineering awards', detail: 'Academic achievement, research, leadership, and design.' }
      ],
      next: 'leadership'
    }
  };

  const root = document.getElementById('guided');
  const form = document.getElementById('guided-form');
  const input = document.getElementById('guided-question');
  const answer = document.getElementById('guided-answer');
  const response = document.getElementById('guided-response');
  const notes = document.getElementById('guided-reading-notes');
  const notesCopy = document.getElementById('guided-reading-copy');
  const notesLabel = document.getElementById('guided-reading-label');
  const instantButton = document.getElementById('guided-read-now');
  const announcement = document.getElementById('guided-announcement');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cursor = window.HeroChat.createCursor();
  let generation = 0;
  let activeTopic = 'overview';
  let started = false;
  let streaming = false;
  const stream = window.HeroChat.createStreamer({ cursor, getToken: () => generation });

  function citation(source, index) {
    const link = document.createElement('a');
    link.className = 'guided-citation';
    link.href = `#${source.id}`;
    link.textContent = `[${index + 1}]`;
    link.setAttribute('aria-label', `Source ${index + 1}: ${source.title}`);
    return link;
  }

  function renderSources(story) {
    const sources = story.sources.map((source, index) => {
      const link = document.createElement('a');
      link.className = 'guided-source';
      link.href = `#${source.id}`;
      const meta = document.createElement('span');
      meta.className = 'guided-source-meta';
      meta.textContent = `${String(index + 1).padStart(2, '0')} / ${source.category}`;
      const title = document.createElement('strong');
      title.textContent = source.title;
      const description = document.createElement('span');
      description.textContent = source.detail;
      link.append(meta, title, description);
      if (source.image) {
        const image = document.createElement('img');
        image.src = `../assets/${source.image}`;
        image.alt = source.alt;
        image.loading = 'lazy';
        link.append(image);
      }
      return link;
    });
    document.getElementById('guided-sources').replaceChildren(...sources);
    document.getElementById('guided-source-count').textContent = `${sources.length} chapters`;
  }

  function prepareStory(topic) {
    const story = stories[topic];
    activeTopic = topic;
    document.querySelectorAll('[data-guided-topic]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.guidedTopic === topic));
    });
    document.getElementById('guided-story-category').textContent = story.category;
    document.getElementById('guided-story-title').textContent = story.title;
    document.getElementById('guided-takeaway').textContent = story.takeaway;
    document.getElementById('guided-followup').textContent = `${stories[story.next].question} \u2197`;
    renderSources(story);
    return story;
  }

  function finishStory(story) {
    streaming = false;
    response.setAttribute('aria-busy', 'false');
    notes.dataset.reading = 'false';
    notesLabel.textContent = `Reading notes \u00b7 ${story.sources.length} CV chapters`;
    instantButton.hidden = true;
    cursor.remove();
    announcement.textContent = `${story.category.slice(5)} ready. ${story.sources.length} source links open the full CV.`;
  }

  function renderInstant(topic) {
    generation++;
    const story = prepareStory(topic);
    notesCopy.textContent = story.notes;
    notes.open = false;
    answer.replaceChildren(...story.paragraphs.map((text, index) => {
      const paragraph = document.createElement('p');
      paragraph.append(document.createTextNode(`${text} `), citation(story.sources[index], index));
      return paragraph;
    }));
    finishStory(story);
  }

  async function renderStory(topic) {
    started = true;
    if (reducedMotion.matches) {
      renderInstant(topic);
      return;
    }
    const token = ++generation;
    const story = prepareStory(topic);
    streaming = true;
    response.setAttribute('aria-busy', 'true');
    announcement.textContent = 'Reading selected CV chapters.';
    instantButton.hidden = false;
    notes.open = true;
    notes.dataset.reading = 'true';
    notesLabel.textContent = 'Connecting the chapters...';
    notesCopy.replaceChildren();
    answer.replaceChildren();
    await stream({ txt: notesCopy }, story.notes, { base: 13, jitter: 7, punct: 0, subword: false, lead: 100 });
    if (token !== generation) return;
    notes.open = false;
    notes.dataset.reading = 'false';
    notesLabel.textContent = `Reading notes \u00b7 ${story.sources.length} CV chapters`;
    for (const [index, text] of story.paragraphs.entries()) {
      const paragraph = document.createElement('p');
      answer.append(paragraph);
      await stream({ txt: paragraph }, text, { base: 15, jitter: 9, punct: 20, subword: false });
      if (token !== generation) return;
      paragraph.append(document.createTextNode(' '), citation(story.sources[index], index));
    }
    finishStory(story);
  }

  function showRenderError(error) {
    generation++;
    streaming = false;
    response.setAttribute('aria-busy', 'false');
    notes.dataset.reading = 'false';
    instantButton.hidden = true;
    cursor.remove();
    console.error('Unable to render the editorial story:', error);
    document.getElementById('guided-input-message').textContent = 'This story could not be displayed. Try Replay, or read the complete CV below.';
  }

  function chooseTopic(topic, keepQuestion = false) {
    document.getElementById('guided-input-message').textContent = '';
    input.setCustomValidity('');
    if (!keepQuestion) input.value = stories[topic].question;
    renderStory(topic).catch(showRenderError);
  }

  // A disclosed, deterministic topic selector, not a model or semantic search.
  function matchTopic(question) {
    if (/^tell me (?:a bit )?about robert[.!?]*$/i.test(question)) return 'overview';
    if (/\b(connect\w*|through.line|overview|background|who|introduc\w*)\b/i.test(question)) return 'overview';
    if (/\b(earl\w*|before|intern\w*|garage|2018|2019|2020)\b/i.test(question)) return 'early';
    if (/\b(educat\w*|award\w*|scholar\w*|degree|university|academic|foundation|gpa)\b/i.test(question)) return 'education';
    if (/\b(leader\w*|mentor\w*|communit\w*|volunteer\w*|senior.?s|teach\w*|conference|beyond)\b/i.test(question)) return 'leadership';
    if (/\b(llms?|language models?)\b/i.test(question)) return 'search';
    if (/\b(vision|train\w*|scratch|pose|depth|segment\w*|neural|cnn|ml|models?)\b/i.test(question)) return 'vision';
    if (/\b(search|retriev\w*|agent\w*|vector\w*|quantiz\w*|llms?|rag|graph\w*|semantic|microsoft|relevance)\b/i.test(question)) return 'search';
    return null;
  }

  // Both editorial spikes use the same authored stories and source references.
  window.PortfolioNarrative = Object.freeze({ stories, matchTopic });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      input.setCustomValidity('Enter a question or choose one of the topics below.');
      input.reportValidity();
      return;
    }
    const topic = matchTopic(question);
    if (!topic) {
      document.getElementById('guided-input-message').textContent = "This scripted demo doesn't have a story for that question. Try search, model training, leadership, earlier work, or education. The current article is unchanged.";
      return;
    }
    chooseTopic(topic, true);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  document.querySelectorAll('[data-guided-topic]').forEach(button => {
    button.addEventListener('click', () => chooseTopic(button.dataset.guidedTopic));
  });
  document.getElementById('guided-followup').addEventListener('click', () => chooseTopic(stories[activeTopic].next));
  document.getElementById('guided-replay').addEventListener('click', () => chooseTopic(activeTopic, true));
  instantButton.addEventListener('click', () => renderInstant(activeTopic));
  reducedMotion.addEventListener('change', () => {
    if (streaming && reducedMotion.matches) renderInstant(activeTopic);
  });
  document.addEventListener('study-change', event => {
    const readingProfile = event.detail.anchor.startsWith('profile');
    if (event.detail.id === 'guided' && !readingProfile && !started) chooseTopic(activeTopic);
    else if ((event.detail.id !== 'guided' || readingProfile) && streaming) renderInstant(activeTopic);
  });
  if (!root.hidden && !window.location.hash.startsWith('#profile')) chooseTopic(activeTopic);
})();
