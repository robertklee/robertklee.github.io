'use strict';

const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const approaches = [
  {
    id: 'snapshot', label: 'A / Career snapshot',
    title: 'Context first. Then the work.',
    order: 'Introduction → career snapshot → examples → full experience',
    hypothesis: 'Establish the Microsoft career early, without making the reader pass the whole CV before reaching the interactive work.',
  },
  {
    id: 'career-first', label: 'B / Experience first',
    title: 'The career is the front door.',
    order: 'Experience → examples → about',
    hypothesis: 'Lead with roles and scope. The examples become supporting evidence rather than the first impression.',
  },
  {
    id: 'integrated', label: 'C / Role-linked examples',
    title: 'Experience and evidence, together.',
    order: 'Introduction → current role + examples → previous role + examples → earlier roles',
    hypothesis: 'Make the relationship between each contribution and its role structural, not something the reader has to infer.',
  },
  {
    id: 'integrated-curve', label: 'D / Role-linked + career curve',
    title: 'The trajectory and the evidence.',
    order: 'Introduction → career curve → roles + examples → earlier roles',
    hypothesis: 'Keep C’s role-linked examples, with the career curve first to show the progression in scope and ownership at a glance.',
  },
];

const stories = [
  {
    id: 'diversity', title: 'Vector-search diversity', role: 1,
    contribution: 'I lead five engineers and scientists building a novel vector-search diversity capability, from leadership buy-in and algorithm analysis to distributed architecture and implementation.',
    illustration: 'The idea behind result diversity',
  },
  {
    id: 'agentic', title: 'Agentic retrieval', role: 1,
    contribution: 'I led research-to-production delivery of filter and boost generation, turning open-ended intent into a bounded, verifiable operator set and aligning research and product teams.',
    illustration: 'The idea behind verifiable query operators',
  },
  {
    id: 'quantization', title: 'Vector quantization', role: 2,
    contribution: 'I drove vector quantization from Public Preview to general availability on Azure AI Search, helping make billion-scale vector search practical through compact representations and efficient distance computation.',
    illustration: 'The idea behind reduced precision',
  },
  {
    id: 'simd', title: 'Vector-distance kernels', role: 2,
    contribution: 'I optimized vector-distance kernels with SIMD, loop unrolling, independent vector accumulator registers, and fused multiply-add.',
    illustration: 'Packed dot products and horizontal reduction',
    points: [
      'Used packed operations to process multiple dimensions per instruction.',
      'Unrolled across independent vector accumulator registers to break serial dependencies and expose overlapping work.',
      'The illustration shows packed lanes and a final reduction; multiple-register unrolling is explained, not simulated.',
    ],
  },
  {
    id: 'hnsw', title: 'HNSW & vector-engine reliability', role: 2,
    contribution: 'My work spanned scaling vector search and hardening the engine: resource-aware HNSW enforcement, vector-algorithm review, testing, and cross-team production debugging.',
    illustration: 'HNSW search structure, not the production reliability work',
    points: [
      'Designed HNSW quota enforcement tied to physical resource utilization, cutting reported limit overshoot by 100×.',
      'Across the vector engine, built a test suite that caught a critical bug in a new quantization algorithm before release.',
      'Root-caused cross-team production incidents and reviewed distributed-systems and vector-algorithm changes to drive durable fixes.',
    ],
  },
];

// Extract balanced elements from the controlled, canonical HTML, including nested sections.
function element(html, tag, id) {
  const opening = new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!opening) throw new Error(`Layout spikes require ${tag}#${id}.`);
  const tokens = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'g');
  tokens.lastIndex = opening.index;
  let depth = 0;
  let token;
  while ((token = tokens.exec(html))) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(opening.index, tokens.lastIndex);
  }
  throw new Error(`Unclosed ${tag}#${id} in layout spike source.`);
}

function replaceOnce(html, before, after) {
  const start = html.indexOf(before);
  if (start < 0 || html.indexOf(before, start + before.length) >= 0) {
    throw new Error(`Expected one layout-spike source fragment: ${before.slice(0, 90)}`);
  }
  return html.slice(0, start) + after + html.slice(start + before.length);
}

function replaceMatch(html, pattern, after) {
  const match = html.match(pattern);
  if (!match) throw new Error(`Missing layout-spike source pattern: ${pattern}`);
  return replaceOnce(html, match[0], after);
}

function roleLabel(role) {
  return role === 1 ? 'Senior Software Engineer · 2025–present' : 'Software Engineer II · 2022–2025';
}

function exampleLinks(role) {
  return `<nav class="spike-example-links" aria-label="${role ? roleLabel(role) : 'Selected work'} examples">
    ${stories.filter(story => !role || story.role === role).map(story =>
      `<a href="#work-${story.id}">${story.title} <span aria-hidden="true">↓</span></a>`
    ).join('\n')}
  </nav>`;
}

function chapter(source, story, approach) {
  let html = element(source, 'article', `work-${story.id}`);
  const meta = html.match(/<p class="chapter-meta">[\s\S]*?<\/p>/)[0];
  const number = meta.match(/<span class="chapter-num">[\s\S]*?<\/span>/)[0];
  const context = `<div class="spike-chapter-context">
    <p>${number}<span>Selected contribution</span></p>
    <a href="#profile-work-entry-${story.role}">
      <img src="/assets/microsoft-mark.svg" alt="" width="16" height="16">
      <span><strong>Microsoft Azure AI Search</strong><span>${roleLabel(story.role)}</span></span>
      <span class="spike-role-link">Role details <span aria-hidden="true">↗</span></span>
    </a>
  </div>`;
  html = replaceOnce(html, meta, '');
  html = html.replace(/(<article[^>]*>)/, `$1\n${context}`);
  html = replaceMatch(html, /<p class="chapter-lede">[\s\S]*?<\/p>/,
    `<p class="chapter-lede"><span class="spike-contribution-label">My contribution</span>${story.contribution}</p>`);
  if (story.points) {
    html = replaceMatch(html, /<ul class="chapter-points">[\s\S]*?<\/ul>/,
      `<ul class="chapter-points">${story.points.map(point => `<li>${point}</li>`).join('\n')}</ul>`);
  }
  if (story.id === 'hnsw') {
    html = replaceMatch(html, /<p class="chapter-role">[\s\S]*?<\/p>/,
      '<p class="chapter-role"><span class="role-badge">Engine engineering</span><span>Resource use · testing · incident response</span></p>');
  }
  html = replaceMatch(html, /(<header class="figure-heading[^"]*">)\s*<p class="eyebrow">[\s\S]*?<\/p>/,
    `<header class="figure-heading${story.id === 'quantization' ? ' quantization-heading' : ''}">
      <p class="spike-illustration-label">Interactive concept illustration</p>
      <p class="spike-illustration-scope">${story.illustration}</p>`);
  if (approach !== 'snapshot') {
    html = replaceMatch(html, /<h3 id="work-[^"]+-title">[\s\S]*?<\/h3>/,
      `<h3 id="work-${story.id}-title">${story.title}</h3>`);
  }
  if (approach === 'integrated') html = html.replace(/<(\/?)h3\b/g, '<$1h4');
  return html;
}

function work(source, approach) {
  let html = element(source, 'section', 'work');
  html = replaceMatch(html, /<header class="section-heading">[\s\S]*?<\/header>/,
    `<header class="section-heading">
      <p class="eyebrow">Selected work at Microsoft</p>
      <h2 id="work-title">My work, <em>explained.</em></h2>
      <p class="section-lede">Five selected contributions to Azure AI Search, paired with interactive explanations of the underlying ideas. Simplified illustrations, not production code or benchmarks.</p>
    </header>`);
  for (const story of stories) {
    html = replaceOnce(html, element(source, 'article', `work-${story.id}`), chapter(source, story, approach));
  }
  return html;
}

function shortAbout(source) {
  let html = element(source, 'section', 'profile-about');
  const paragraphs = [...html.matchAll(/<p>[\s\S]*?<\/p>/g)].map(match => match[0]);
  if (paragraphs.length !== 5) throw new Error('Expected five canonical About paragraphs for layout spikes.');
  const brief = `<p>I lead a team of <strong>five engineers and scientists</strong> on vector-search diversity, and led research-to-production delivery for agentic-retrieval filter and boost generation. Previously, I helped build and scale vector search, quantization, and the systems behind them.</p>
    <details class="spike-about-more"><summary>More about me</summary>${paragraphs.slice(1).join('\n')}</details>`;
  return replaceOnce(html, paragraphs.slice(1).join('\n              '), brief);
}

function snapshot() {
  return `<section class="section spike-career-snapshot" id="career-snapshot" aria-labelledby="career-snapshot-title">
    <header class="spike-snapshot-heading">
      <div><p class="eyebrow">Experience at a glance</p><h2 id="career-snapshot-title">Microsoft. <em>Increasing ownership.</em></h2></div>
      <a href="#profile-work">Full experience <span aria-hidden="true">↗</span></a>
    </header>
    <div class="spike-snapshot-roles">
      <article>
        <p class="eyebrow">2025–present · Azure AI Search</p>
        <h3>Senior Software Engineer</h3>
        <p>Technical direction for a team of five. Vector-search diversity, agentic retrieval, benchmarking, and production billing.</p>
        <a href="#profile-work-entry-1">Explore this role <span aria-hidden="true">↗</span></a>
      </article>
      <article>
        <p class="eyebrow">2022–2025 · Azure AI Search</p>
        <h3>Software Engineer II</h3>
        <p>Built and scaled vector search, quantization, distance kernels, hybrid relevance, facet aggregation, and engine reliability.</p>
        <a href="#profile-work-entry-2">Explore this role <span aria-hidden="true">↗</span></a>
      </article>
    </div>
    <p class="spike-snapshot-earlier">Earlier: Azure Search engineering and internships · Microsoft Garage <a href="#profile-work-entry-3">Earlier roles ↗</a></p>
  </section>`;
}

function careerFirst(source) {
  let html = element(source, 'section', 'profile-work');
  html = replaceOnce(html, '<h2 id="profile-work-title">Experience</h2>',
    '<h2 id="profile-work-title">Microsoft, <em>in practice.</em></h2>');
  html = replaceMatch(html, /<p class="cv-section-description">[\s\S]*?<\/p>/,
    '<p class="cv-section-description">From hands-on engineering to technical direction. My roles and contributions first; interactive examples of the underlying ideas follow.</p>');
  const heading = html.match(/<header class="section-heading cv-section-heading">[\s\S]*?<\/header>/)[0];
  return replaceOnce(html, heading, `${heading}\n${exampleLinks()}`);
}

function integrated(source, withCurve = false) {
  const experience = element(source, 'section', 'profile-work');
  const careerMap = withCurve ? experience.match(/<figure class="career-map"[\s\S]*?<\/figure>/)?.[0] : '';
  if (withCurve && !careerMap) throw new Error('Expected the canonical career-map figure for layout spike D.');
  const records = [...experience.matchAll(/<article class="cv-record[^"]*">[\s\S]*?<\/article>/g)].map(match => match[0]);
  if (records.length !== 6) throw new Error('Expected six canonical Microsoft experience records.');
  const group = (role, title, scope) => {
    const date = records[role - 1].match(/<span class="cv-date">[\s\S]*?<\/span>/)[0];
    const record = replaceMatch(records[role - 1], /<summary>[\s\S]*?<\/summary>/,
      `<summary>
        <span class="cv-summary-copy"><span class="spike-role-details-heading">Full role details</span><span class="cv-record-meta">${date}</span></span>
        <span class="cv-plus" aria-hidden="true">+</span>
      </summary>`);
    return `<section class="spike-role-group" aria-labelledby="spike-role-${role}-title">
    <header class="spike-role-heading">
      <p class="eyebrow">Microsoft Azure AI Search · ${role === 1 ? '2025–present' : '2022–2025'}</p>
      <h3 id="spike-role-${role}-title">${title}</h3>
      <p>${scope}</p>
      ${exampleLinks(role)}
    </header>
    <div class="cv-records">${record}</div>
    ${stories.filter(story => story.role === role).map(story => chapter(source, story, 'integrated')).join('\n')}
  </section>`;
  };
  return `<section class="section cv-section spike-integrated" id="profile-work" aria-labelledby="profile-work-title">
    <header class="section-heading">
      <p class="eyebrow">Microsoft · Experience &amp; selected work</p>
      <h2 id="profile-work-title">Experience, <em>made tangible.</em></h2>
      <p class="cv-section-description">Each role, followed by examples of my contributions. The figures explain underlying concepts; they do not reproduce production implementations.</p>
      <button class="text-button" type="button" data-expand-all aria-controls="profile-work-records">Expand all <span aria-hidden="true">+</span></button>
    </header>
    ${careerMap}
    <div id="profile-work-records">
      <div id="work" aria-label="Role-linked work examples">
        ${group(1, 'Senior Software Engineer', 'Technical direction for a team of five, research-to-production delivery, and agentic-retrieval benchmarking and billing.')}
        ${group(2, 'Software Engineer II', 'Built and scaled vector search and quantization, optimized distance kernels, strengthened hybrid relevance, built facet aggregation, and hardened the engine.')}
      </div>
      <section class="spike-earlier" aria-labelledby="spike-earlier-title">
        <p class="eyebrow">2018–2022 · Microsoft</p>
        <h3 id="spike-earlier-title">The earlier chapters.</h3>
        <div class="cv-records">${records.slice(2).join('\n')}</div>
      </section>
    </div>
  </section>`;
}

function switcher(current) {
  return `<details class="spike-switcher">
    <summary>Layout spike · ${current.label.split(' / ')[0]}</summary>
    <nav aria-label="Compare layout spikes">
      <a href="/spikes/">Comparison overview</a>
      <a href="/">Original homepage</a>
      ${approaches.map(approach => `<a href="/spikes/${approach.id}.html"${approach.id === current.id ? ' aria-current="page"' : ''}>${approach.label}</a>`).join('\n')}
    </nav>
  </details>`;
}

function preview(source, approach) {
  const about = element(source, 'section', 'profile-about');
  const selectedWork = element(source, 'section', 'work');
  const experience = element(source, 'section', 'profile-work');
  const layouts = {
    snapshot: () => [shortAbout(source), snapshot(), work(source, 'snapshot'), experience],
    'career-first': () => [careerFirst(source), work(source, 'career-first'), about],
    integrated: () => [shortAbout(source), integrated(source)],
    'integrated-curve': () => [shortAbout(source), integrated(source, true)],
  };
  let html = replaceOnce(source, selectedWork, '');
  html = replaceOnce(html, experience, '');
  html = replaceOnce(html, about, layouts[approach.id]().join('\n\n'));
  // Separate routes retain relative hash links; only runtime asset paths become root-relative.
  html = html.replace(/((?:src|href)=")(assets\/[^"]+|(?:chat-core|chat-content|index)\.js)(")/g, '$1/$2$3');
  html = replaceOnce(html, '<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, follow">');
  html = replaceMatch(html, /<title>[\s\S]*?<\/title>/, `<title>${approach.label} — Robert Lee layout spike</title>`);
  html = replaceOnce(html, '</head>', '<link rel="stylesheet" href="/spikes/spikes.css">\n</head>');
  html = replaceOnce(html, '<body>', `<body class="layout-spike spike-${approach.id}">`);
  html = replaceOnce(html, '<main>', `${switcher(approach)}\n<main>`);
  const entry = approach.id === 'career-first' ? 'profile-work' : 'profile-about';
  html = replaceOnce(html, '<a class="skip-link" href="#profile-about">Skip the introduction</a>',
    `<a class="skip-link" href="#${entry}">Skip the introduction</a>`);
  html = replaceOnce(html, '<a class="scroll-cue" href="#profile-about">', `<a class="scroll-cue" href="#${entry}">`);
  html = replaceOnce(html, '<span class="scroll-cue-label">A little more about Robert</span>',
    `<span class="scroll-cue-label">${approach.id === 'career-first' ? 'Explore my Microsoft experience' : 'The person behind the work'}</span>`);
  html = replaceMatch(html, /<nav class="site-nav"[\s\S]*?<\/nav>/,
    `<nav class="site-nav" aria-label="Main navigation">
      ${approach.id === 'snapshot'
        ? '<a href="#profile-about">About</a><a href="#career-snapshot">Experience</a><a href="#work">Work examples</a>'
        : `<a href="#profile-work">Experience</a><a href="#work">Work examples</a><a href="#profile-about">About</a>`}
      <a href="#profile-projects">Projects</a><a href="#profile-leadership">Community</a>
    </nav>`);
  return html;
}

function overview(source) {
  const head = source.slice(0, source.indexOf('</head>') + '</head>'.length);
  let html = head
    .replace(/<script src="[^"]+" defer><\/script>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>Career layout spikes — Robert Lee</title>')
    .replace('content="index, follow"', 'content="noindex, follow"')
    .replace(/((?:src|href)=")(assets\/[^"]+)(")/g, '$1/$2$3')
    .replace('</head>', '<link rel="stylesheet" href="/spikes/spikes.css"></head>');
  html += `<body class="spike-overview">
    <header class="site-header"><a class="brand" href="/"><span class="brand-mark">rl.</span><span class="brand-name">Robert Lee</span></a><a class="spike-original-link" href="/">Original homepage ↗</a></header>
    <main class="section">
      <header class="spike-overview-heading">
        <p class="eyebrow">Layout studies · Not a replacement homepage</p>
        <h1>Four ways to tell <em>the same career.</em></h1>
        <p>Compare how quickly the Microsoft experience becomes visible, and whether the interactive figures read as explanations of Robert's work rather than product marketing.</p>
      </header>
      <div class="spike-options">${approaches.map(approach => `<article>
        <p class="eyebrow">${approach.label}</p>
        <h2>${approach.title}</h2>
        <p class="spike-option-order">${approach.order}</p>
        <p>${approach.hypothesis}</p>
        <a class="button button-solid" href="/spikes/${approach.id}.html">Open spike <span aria-hidden="true">↗</span></a>
        <a class="spike-direct-link" href="/spikes/${approach.id}.html#${approach.id === 'snapshot' ? 'career-snapshot' : 'profile-work'}">Jump past the hero ↓</a>
      </article>`).join('\n')}</div>
      <p class="spike-overview-note">All four retain the five working demos and the full CV. Contributions are distinguished from concept illustrations; HNSW sits within broader vector-engine engineering and reliability. The original homepage is unchanged.</p>
    </main>
  </body></html>`;
  return html;
}

module.exports = (homepage, output) => {
  const directory = join(output, 'spikes');
  mkdirSync(directory, { recursive: true });
  copyFileSync(join(__dirname, 'spikes.css'), join(directory, 'spikes.css'));
  writeFileSync(join(directory, 'index.html'), overview(homepage));
  for (const approach of approaches) {
    writeFileSync(join(directory, `${approach.id}.html`), preview(homepage, approach));
  }
  console.log('Built four isolated career-layout spikes at /spikes/.');
};

if (require.main === module) {
  module.exports(readFileSync(join(__dirname, 'original.html'), 'utf8'), join(__dirname, '../dist'));
}
