(() => {
  'use strict';

  // Share the editorial content without coupling the spikes' disclosure state.
  const editorialVariants = [
    {
      id: 'editorial-chat', label: '08 / Editorial + chips',
      description: 'A chip-driven conversation introduces Robert, followed by the editorial stories and the complete profile. Choose a question, or scroll straight to the work.'
    },
    {
      id: 'hero-editorial', label: '09 / Original hero + editorial',
      description: 'The original hero app, with its prompt, thinking, streamed answer, follow-up chips, and model retry. An editorial visual treatment connects the introduction to the engineering stories and complete CV below.'
    }
  ];
  let previousStudy = document.getElementById('conversation');
  editorialVariants.forEach(variant => {
    const study = document.getElementById('editorial').cloneNode(true);
    study.id = `${variant.id}-content`;
    study.dataset.study = variant.id;
    study.hidden = true;
    study.setAttribute('aria-labelledby', `${variant.id}-work-title`);
    study.querySelector('#editorial-title').id = `${variant.id}-work-title`;
    study.querySelector('.section-meta').id = `${variant.id}-stories`;
    study.querySelector('.study-note b').textContent = variant.label;
    study.querySelector('.study-note p').textContent = variant.description;
    previousStudy.after(study);
    previousStudy = study;
  });
  const editorialStoryIds = new Map(editorialVariants.map(variant => [`${variant.id}-stories`, variant.id]));

  const studies = [...document.querySelectorAll('.study')];
  const studyLinks = [...document.querySelectorAll('.study-nav a')];
  const studyNames = {
    editorial: 'Editorial',
    atlas: 'Systems atlas',
    timeline: 'Career chapters',
    graph: 'Connected work',
    lab: 'Mini lab',
    guided: 'Editorial + chat',
    conversation: 'Conversation',
    'editorial-chat': 'Editorial + chips',
    'hero-editorial': 'Original hero + editorial'
  };
  const chapterIds = new Set(['chapter-agents', 'chapter-vectors', 'chapter-foundations']);
  const profileIds = new Set(['profile', 'profile-work', 'profile-projects', 'profile-leadership', 'profile-education', 'profile-awards', 'profile-about']);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function isProfileAnchor(anchor) {
    return profileIds.has(anchor) || /^profile-(work|projects|leadership|education)-entry-[1-9]\d*$/.test(anchor);
  }

  function selectStudy() {
    const anchor = window.location.hash.slice(1);
    const savedStudy = new URLSearchParams(window.location.search).get('study');
    const profileStudy = Object.hasOwn(studyNames, savedStudy) ? savedStudy : document.body.dataset.study;
    const id = chapterIds.has(anchor) ? 'timeline' : editorialStoryIds.has(anchor) ? editorialStoryIds.get(anchor) : Object.hasOwn(studyNames, anchor) ? anchor : isProfileAnchor(anchor) ? profileStudy : 'editorial';
    document.body.dataset.study = id;
    const url = new URL(window.location.href);
    url.searchParams.set('study', id);
    window.history.replaceState(null, '', url);
    editorialVariants.forEach(variant => { document.getElementById(variant.id).hidden = id !== variant.id; });
    studies.forEach(study => { study.hidden = (study.dataset.study || study.id) !== id; });
    studyLinks.forEach(link => {
      if (link.hash === `#${id}`) {
        link.setAttribute('aria-current', 'page');
        link.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      } else link.removeAttribute('aria-current');
    });
    document.title = `${studyNames[id]} / Robert Lee design studies`;
    document.dispatchEvent(new CustomEvent('study-change', { detail: { id, anchor } }));
    if (chapterIds.has(anchor) || isProfileAnchor(anchor) || editorialStoryIds.has(anchor)) {
      const target = document.getElementById(anchor);
      if (target) {
        if (target.tagName === 'DETAILS') target.open = true;
        target.scrollIntoView({ behavior: prefersReducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  document.querySelectorAll('.study-nav a, .preview-brand').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (window.location.hash !== link.hash) window.history.pushState(null, '', link.href);
      selectStudy();
    });
  });
  window.addEventListener('popstate', selectStudy);
  window.addEventListener('hashchange', selectStudy);
  window.addEventListener('resize', () => {
    document.querySelector('.study-nav [aria-current]').scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  });
  document.addEventListener('profile-ready', () => {
    if (isProfileAnchor(window.location.hash.slice(1))) selectStudy();
  });
  selectStudy();

  const atlasContent = {
    intent: {
      category: '01 / Intent & constraints', symbol: '{ }', title: 'Understand intent',
      description: 'A broad question needs a useful retrieval plan, including constraints that a search system can execute and verify.',
      work: 'Bound the problem. Make it verifiable.',
      contribution: 'Research-to-production delivery for agentic filter and boost generation, with a bounded operator set grounded in production usage analysis.',
      tags: ['Agentic retrieval', 'Filters', 'Research to production']
    },
    keyword: {
      category: '02 / Candidate retrieval', symbol: 'Aa', title: 'Keyword signals',
      description: 'Exact terms still matter. Hybrid retrieval brings keyword and vector signals together rather than asking one method to do everything.',
      work: 'Make blended results understandable.',
      contribution: 'Hybrid-search subscore fusion and score thresholding, giving customers more visibility and control over blended retrieval.',
      tags: ['Hybrid search', 'Subscores', 'Relevance']
    },
    vector: {
      category: '02 / Candidate retrieval', symbol: '\u22ee\u22ee\u22ee', title: 'Vector retrieval',
      description: 'Find related information through embedding similarity, with an engine built to make that retrieval practical at scale.',
      work: 'Smaller vectors. Faster search.',
      contribution: 'Scalar and binary quantization, SIMD-accelerated distance computation, and resource-aware HNSW index quotas.',
      tags: ['C++', 'Quantization', 'HNSW']
    },
    graph: {
      category: '02 / Connected knowledge', symbol: '\u25c7', title: 'Follow relationships',
      description: 'Some questions are about connections, not just similar passages. Knowledge graphs offer another way to navigate information.',
      work: 'Search beyond similarity.',
      contribution: 'Knowledge graphs and graph search are part of my current focus. This conceptual branch leaves room for a public, concrete case study.',
      tags: ['Knowledge graphs', 'Graph search', 'Current focus']
    },
    rank: {
      category: '03 / Evidence selection', symbol: '\u2260', title: 'Evidence, not echoes',
      description: 'Strong individual matches do not necessarily make a strong evidence set. Broad questions benefit from coverage as well as relevance.',
      work: 'Diversify what the model gets to read.',
      contribution: 'Engineering leadership for a diversity-aware vector retrieval capability, adapting research to real production constraints and billion-vector scale.',
      tags: ['Diversity', 'Ranking', 'Answer synthesis']
    }
  };

  function setText(id, text) {
    document.getElementById(id).textContent = text;
  }

  document.querySelectorAll('[data-atlas]').forEach(button => {
    button.addEventListener('click', () => {
      const content = atlasContent[button.dataset.atlas];
      document.querySelectorAll('[data-atlas]').forEach(node => {
        const selected = node === button;
        node.classList.toggle('active', selected);
        node.setAttribute('aria-pressed', String(selected));
      });
      setText('atlas-category', content.category);
      setText('atlas-detail-symbol', content.symbol);
      setText('atlas-detail-title', content.title);
      setText('atlas-detail-description', content.description);
      setText('atlas-work-title', content.work);
      setText('atlas-work-description', content.contribution);
      document.getElementById('atlas-tags').replaceChildren(...content.tags.map(tag => {
        const element = document.createElement('span');
        element.textContent = tag;
        return element;
      }));
    });
  });

  const chapterLinks = [...document.querySelectorAll('.chapter-link')];
  const chapterObserver = new IntersectionObserver(entries => {
    if (document.body.dataset.study !== 'timeline') return;
    const visible = entries.filter(entry => entry.isIntersecting);
    if (!visible.length) return;
    const current = visible[0].target.id;
    chapterLinks.forEach(link => {
      const active = link.hash === `#${current}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
  document.querySelectorAll('.career-chapter').forEach(chapter => chapterObserver.observe(chapter));

  const graphContent = {
    retrieval: {
      category: 'The connecting thread', title: 'Retrieval',
      description: 'Helping people and AI systems find the right information, from vector similarity to diverse, grounded evidence.',
      relations: [['Quantization', 'Making retrieval economical'], ['Agentic systems', 'Choosing evidence for reasoning'], ['Computer vision', 'Learning useful representations']]
    },
    quantization: {
      category: 'Efficiency / Shipped work', title: 'Quantization',
      description: 'Drove scalar and binary vector quantization from preview to GA, making large-scale retrieval more practical.',
      relations: [['Retrieval', 'Compact representations for similarity search'], ['Distributed systems', 'Memory, throughput, and resource constraints']]
    },
    agents: {
      category: 'Grounding / Current work', title: 'Agentic systems',
      description: 'Turning open-ended questions into constrained retrieval operations and useful evidence for AI agents.',
      relations: [['Retrieval', 'Grounding answers in indexed knowledge'], ['Knowledge graphs', 'A complementary way to explore connected information']]
    },
    graphs: {
      category: 'Relationships / Current focus', title: 'Knowledge graphs',
      description: 'Exploring connected knowledge and graph search alongside semantic and vector retrieval. A space for a future public case study.',
      relations: [['Retrieval', 'Finding information through relationships'], ['Agentic systems', 'Navigating related entities and evidence']]
    },
    systems: {
      category: 'Production / Engineering foundation', title: 'Distributed systems',
      description: 'The reliability and performance work beneath search: resource-aware limits, production debugging, and engines that stay correct at scale.',
      relations: [['Retrieval', 'Serving search across a distributed engine'], ['Quantization', 'Reducing the resource footprint'], ['Computer vision', 'Building and operating cloud training pipelines']]
    },
    vision: {
      category: 'Representation learning / Earlier work', title: 'Computer vision',
      description: 'Training models for human pose estimation, road segmentation, and monocular depth, including a pose model trained from random initialization.',
      relations: [['Retrieval', 'A shared interest in useful representations'], ['Distributed systems', 'Cloud training and deployment pipelines']]
    }
  };
  const graphNodes = [...document.querySelectorAll('[data-node]')];
  const graphEdges = [...document.querySelectorAll('[data-edge]')];

  function selectGraphNode(id) {
    const neighbors = new Set();
    graphEdges.forEach(edge => {
      const endpoints = edge.dataset.edge.split(' ');
      const connected = endpoints.includes(id);
      edge.classList.toggle('connected', connected);
      edge.classList.toggle('dimmed', !connected);
      if (connected) endpoints.forEach(endpoint => neighbors.add(endpoint));
    });
    graphNodes.forEach(node => {
      const selected = node.dataset.node === id;
      node.classList.toggle('selected', selected);
      node.classList.toggle('related', !selected && neighbors.has(node.dataset.node));
      node.classList.toggle('dimmed', !neighbors.has(node.dataset.node));
      node.setAttribute('aria-pressed', String(selected));
    });
    const content = graphContent[id];
    setText('graph-category', content.category);
    setText('graph-detail-title', content.title);
    setText('graph-description', content.description);
    const profileLink = document.getElementById('graph-profile-link');
    profileLink.href = id === 'vision' ? '#profile-projects' : '#profile-work';
    profileLink.textContent = id === 'vision' ? 'All projects & training details \u2192' : 'Full experience & contributions \u2192';
    document.getElementById('graph-relations').replaceChildren(...content.relations.map(([title, detail]) => {
      const item = document.createElement('li');
      const heading = document.createElement('span');
      const description = document.createElement('small');
      heading.textContent = title;
      description.textContent = detail;
      item.append(heading, description);
      return item;
    }));
  }
  graphNodes.forEach(node => node.addEventListener('click', () => selectGraphNode(node.dataset.node)));
  selectGraphNode('retrieval');

  // Fixed candidate sets make the diversity tradeoff visible without a backend.
  const labExamples = {
    search: {
      topics: ['Speed', 'Relevance', 'Reliability'],
      candidates: [
        { title: 'Improving vector query latency', source: 'Performance / Candidate A', topic: 0 },
        { title: 'Faster approximate nearest-neighbor search', source: 'Performance / Candidate B', topic: 0 },
        { title: 'Reducing search response time', source: 'Performance / Candidate C', topic: 0 },
        { title: 'Ranking evidence for useful answers', source: 'Result quality / Candidate D', topic: 1 },
        { title: 'Keeping retrieval available during failures', source: 'Resilience / Candidate E', topic: 2 }
      ],
      nearest: 'All three passages cover speed. Useful individually, but the evidence misses relevance and reliability.',
      diverse: 'Now the evidence covers speed, relevance, and reliability: a broader basis for answering the original question.'
    },
    agents: {
      topics: ['Tool use', 'Grounding', 'Constraints'],
      candidates: [
        { title: 'Selecting tools for an agent workflow', source: 'Orchestration / Candidate A', topic: 0 },
        { title: 'Planning a sequence of tool calls', source: 'Orchestration / Candidate B', topic: 0 },
        { title: 'Coordinating tools across multiple agents', source: 'Orchestration / Candidate C', topic: 0 },
        { title: 'Retrieving evidence before generating answers', source: 'Knowledge access / Candidate D', topic: 1 },
        { title: 'Validating generated filters before execution', source: 'Bounded operations / Candidate E', topic: 2 }
      ],
      nearest: 'The results all explain tool use. They leave out grounding and constraints, two other parts of reliability.',
      diverse: 'The selection now covers tool use, grounding, and constraints, rather than three variations of orchestration.'
    }
  };
  let retrievalMode = 'nearest';
  const querySelect = document.getElementById('lab-query');

  function renderLab() {
    const example = labExamples[querySelect.value];
    const selected = retrievalMode === 'nearest' ? example.candidates.slice(0, 3) : [example.candidates[0], example.candidates[3], example.candidates[4]];
    document.getElementById('lab-results').replaceChildren(...selected.map((candidate, index) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.dataset.topic = candidate.topic;
      const rank = document.createElement('span');
      rank.className = 'result-index';
      rank.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = candidate.title;
      const source = document.createElement('small');
      source.textContent = candidate.source;
      copy.append(title, source);
      const topic = document.createElement('span');
      topic.className = 'result-topic';
      topic.textContent = example.topics[candidate.topic];
      row.append(rank, copy, topic);
      return row;
    }));
    setText('coverage-label', `${new Set(selected.map(candidate => candidate.topic)).size} of 3 topics`);
    setText('lab-explanation', example[retrievalMode]);
  }
  document.querySelectorAll('[data-retrieval]').forEach(button => {
    button.addEventListener('click', () => {
      retrievalMode = button.dataset.retrieval;
      document.querySelectorAll('[data-retrieval]').forEach(control => {
        const active = control === button;
        control.classList.toggle('active', active);
        control.setAttribute('aria-pressed', String(active));
      });
      renderLab();
    });
  });
  querySelect.addEventListener('change', renderLab);

  const visionProjects = {
    pose: {
      image: 'skateboarder-pred.webp', title: 'Human pose estimation',
      alt: 'Human pose model output showing predicted skeleton keypoints on a skateboarder',
      description: 'Trained from random initialization on COCO-2017. Heatmap-based joint prediction, with a cloud training pipeline built by our student team.'
    },
    road: {
      image: 'road-seg.webp', title: 'Semantic road segmentation',
      alt: 'Semantic road segmentation model output highlighting the drivable road in a street scene',
      description: 'A U-Net trained on the KITTI Road dataset, with a custom training pipeline, loss functions, and data augmentation.'
    },
    depth: {
      image: 'monocular-depth.webp', title: 'Monocular depth estimation',
      alt: 'A saved monocular depth estimation visualization with a colorized depth map',
      description: 'Self-supervised depth estimation using stereo photometric reconstruction, adapted to the DrivingStereo dataset in TensorFlow.'
    }
  };
  document.querySelectorAll('[data-vision]').forEach(button => {
    button.addEventListener('click', () => {
      const project = visionProjects[button.dataset.vision];
      document.querySelectorAll('[data-vision]').forEach(control => {
        const active = control === button;
        control.classList.toggle('active', active);
        control.setAttribute('aria-pressed', String(active));
      });
      const image = document.getElementById('vision-image');
      image.src = `../assets/${project.image}`;
      image.alt = project.alt;
      setText('vision-title', project.title);
      setText('vision-description', project.description);
    });
  });
})();
