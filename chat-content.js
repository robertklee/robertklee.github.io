// Scripted copy for the homepage hero chat (index.js): the visitor's opening
// question, the intro answers, the suggested follow-up topics, and the
// behind-the-scenes discovery. Nothing here calls a model.
window.HeroChatContent = (function () {
  // The visitor's "question" varies per page load. All ten are intro-style
  // paraphrases, so any thought/answer variant is a coherent response. The
  // chosen prompt is fixed for the load (a retry regenerates the answer to the
  // same question, like a real "regenerate").
  var PROMPTS = [
    "Who is Robert?",
    "Tell me about Robert.",
    "Hi! Can you tell me a bit about Robert?",
    "What does Robert do?",
    "What should I know about Robert?",
    "Who's Robert Lee?",
    "Can you give me a quick intro to Robert?",
    "What does Robert work on?",
    "Give me the short version: who's Robert?",
    "I'm curious about Robert. Where should I start?"
  ];

  // Current work follows the canonical CV in index.html; earlier career and
  // project details also draw on the linked resume. These are scripted traces.
  // Real language models are non-deterministic: the same prompt yields a
  // different chain-of-thought and answer each time. To echo that, we keep a
  // set of {thought, answer} pairs and pick one at random on every page load.
  // Ten opening answers pair industry terminology with scope, ownership,
  // and production impact; technical follow-ups explain the mechanisms.
  // Each names work from at least two field regions (`docs`, as in TOPICS), so
  // the intro runs as a diverse retrieval.
  var VARIANTS = [
    {
      thought: "Lead with technical leadership and vector-search diversity's pre-shipping performance gains. Keep those distinct from quantization's workload-dependent customer savings, and connect both to research-to-production delivery of agentic filter and boost generation.",
      answer: "Hi! I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity, with 4.68\u00d7 better latency and 85.6% less memory before shipping. I also led agentic-retrieval filter and boost generation into production and drove vector quantization to general availability, delivering 8\u201332\u00d7 customer cost savings depending on the workload.",
      docs: ['Vector diversity capability', 'Team technical leadership', 'Filter generation', 'Lucene boosts', 'Scalar quantization']
    },
    {
      thought: "Connect vector search and HNSW graph-search engineering to relevance and production performance. Explain current search-diversity work through result coverage, and connect shipped natural-language filters and binary quantization to customer capabilities and cost.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). My work spans vector search and HNSW graph search, with a focus on relevance, performance, and production scale. I lead technical delivery of vector-search diversity to improve result coverage, led natural-language filter generation into production, and helped lower search costs through vector quantization.",
      docs: ['HNSW graph search', 'Redundancy reduction', 'Filter generation', 'Binary quantization']
    },
    {
      thought: "Make technical leadership concrete: team size, leadership buy-in, cross-org alignment, greenfield architecture, and investment decisions. Pair vector-search diversity ownership with research-to-production delivery of agentic filter and boost generation.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity. I own technical vision and end-to-end delivery, from leadership buy-in and cross-org alignment to greenfield distributed architecture and technical investment decisions. I also led agentic-retrieval filter and boost generation from research into production.",
      docs: ['Team technical leadership', 'Distributed execution', 'Filter generation', 'Lucene boosts']
    },
    {
      thought: "Lead with quantization's shipped cost and latency impact, qualified by workload. Keep preview-to-general-availability ownership explicit, then connect that delivery record to technical leadership for the current vector-search diversity effort.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I drove vector quantization from preview to general availability, delivering 8\u201332\u00d7 customer cost savings and up to 20\u00d7 lower latency depending on the workload. Today I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity to improve result coverage and reduce redundancy.",
      docs: ['Scalar quantization', 'Binary quantization', 'Team technical leadership', 'Redundancy reduction']
    },
    {
      thought: "Show systems depth across HNSW graph search, SIMD distance kernels, billions of embeddings, and distributed algorithm design. Preserve team attribution for broad adoption, and name the seven innovations and production constraints without inventing their internals.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). My work spans HNSW graph search and SIMD-optimized vector-distance kernels, helping scale search across billions of embeddings. For vector-search diversity, I rearchitected a state-of-the-art research algorithm for distributed execution and drove seven targeted innovations for hyperscalability, durability, corpus drift, availability, and performance.",
      docs: ['HNSW graph search', 'SIMD distance', 'Vector search at scale', 'Distributed execution']
    },
    {
      thought: "Connect governed enterprise grounding and filter and boost generation to workload benchmarking. Name both agentic retrieval and diversity-aware search in the serverless billing scope, and keep the 80% memory reduction qualified to key paths.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I ground agents in governed enterprise knowledge and led filter and boost generation into production. I also architected benchmarks covering CPU, memory, and throughput to establish the serverless billing formula for agentic retrieval and diversity-aware search, reducing memory by 80% on key paths.",
      docs: ['RAG grounding', 'Filter generation', 'Lucene boosts', 'Workload benchmarks', 'Billing model']
    },
    {
      thought: "Use research to production as the connecting thread. Vector-search diversity preserved algorithmic strengths under distributed execution; agentic filter generation bounded an unbounded problem and used production evidence to align teams.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I turn retrieval research into production systems. For vector-search diversity, I rearchitected a research algorithm for distributed execution while preserving its strengths. For agentic retrieval, I reformulated unbounded filter synthesis as a bounded, verifiable operator set, demonstrated real-workload coverage through production analysis, and brought research and product teams to consensus.",
      docs: ['Vector diversity capability', 'Distributed execution', 'Bounded operator set', 'Filter generation']
    },
    {
      thought: "Show end-to-end ownership through vector-search diversity leadership, a shared core that enabled three engineers to work in parallel, and benchmarking that established serverless billing for two retrieval capabilities.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity. I consolidated infrastructure into a shared core and decoupled mechanisms so three engineers could work in parallel. I also architected workload benchmarks to establish the serverless billing formula for agentic retrieval and diversity-aware search.",
      docs: ['Team technical leadership', 'Vector diversity capability', 'Workload benchmarks', 'Billing model']
    },
    {
      thought: "Lead with current technical leadership, then show applied-ML breadth through the human pose estimation project. Retain training from random initialization and ownership of the model architecture and cloud pipeline as concrete engineering signals.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity. My background also includes machine learning: I led a student team that trained a human pose estimation network from scratch, where I owned the model architecture and cloud training pipeline.",
      docs: ['Vector diversity capability', 'Team technical leadership', 'Pose estimation']
    },
    {
      thought: "Connect retrieval quality, production scale, and cost. Use current vector-search diversity, shipped agentic filter and boost generation, HNSW graph search, and quantization as concrete evidence of that focus, not as an unexplained technology list.",
      answer: "Hi, I'm Robert, a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI). My focus is retrieval quality at production scale. I lead technical delivery of vector-search diversity for broader evidence, led agentic filter and boost generation into production, and helped scale vector search, including HNSW graph search, across billions of embeddings. Quantization delivered 8\u201332\u00d7 cost savings depending on the workload.",
      docs: ['Vector diversity capability', 'Filter generation', 'Lucene boosts', 'Vector search at scale', 'HNSW graph search', 'Binary quantization']
    }
  ];

  // Suggested follow-up topics, ChatGPT-style. Each topic is one narrow story,
  // asked two ways (the chip shows one phrasing) and answered two ways (a
  // click picks one variant, a retry swaps in the other), so the conversation
  // feels freshly sampled. The chip and the answer are drawn independently, so
  // every variant must answer every phrasing in its topic. All content is
  // grounded in Robert's real background, in his first-person voice.
  // `docs` are the hero field's documents (CLUSTERS in assets/site/field.js)
  // that the answer draws on: every variant mentions each of them, and the
  // field's search lands exactly on them. A variant may override `docs`.
  // `sources` are the page sections cited under the answer. `weight` (default
  // 1) sets how often a topic is offered as a chip: recent work and the
  // standout academic, leadership, and project stories lead. `category` is
  // 'technical', 'leadership', or 'general'. `followupOnly` keeps narrower,
  // earlier-career features out of the opening suggestions. Match depth to the question:
  // technical answers retain mechanisms and tradeoffs; leadership answers
  // explain decisions and ownership; general answers explain unfamiliar terms
  // without losing substance. Every suggestion row includes at least one
  // general topic for friends, family, and non-engineers (see pickTopics).
  var TOPICS = [
    {
      id: 'technical-achievements',
      category: 'technical',
      weight: 3,
      docs: ['Vector diversity capability', 'Distributed execution', 'Filter generation', 'Bounded operator set', 'Scalar quantization', 'Binary quantization', 'SIMD distance'],
      sources: [['work-diversity', 'Vector diversity'], ['work-agentic', 'Agentic retrieval'], ['work-quantization', 'Quantization']],
      prompts: [
        "What are Robert's most technically impressive achievements?",
        "Which engineering achievements best show Robert's impact?"
      ],
      variants: [
        {
          thought: "Choose three engineering stories: vector-search diversity's distributed redesign and pre-shipping gains, agentic filter generation's verifiable reformulation, and quantization's workload-dependent customer impact. Keep each result attributed to the right effort.",
          answer: "I'd highlight three. I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity. I rearchitected a research algorithm for distributed execution and drove seven targeted innovations. Profiling-led compute and memory optimizations combined SIMD acceleration with improved allocation efficiency, optimized data movement, and tighter control of intermediate-state lifetimes, improving latency by 4.68\u00d7 and reducing memory by 85.6% before shipping. I also led agentic-retrieval filter and boost generation into production using a bounded, verifiable operator set. Earlier, I drove scalar and binary vector quantization to general availability with SIMD-accelerated distance computation, delivering 8\u201332\u00d7 customer cost savings and up to 20\u00d7 lower latency depending on the workload."
        },
        {
          thought: "Start with quantization's customer impact, then connect agentic retrieval's bounded design to vector-search diversity's production architecture and measured pre-shipping gains. Do not invent availability dates or attribute the full gains to SIMD alone.",
          answer: "Vector quantization stands out: I drove scalar and binary quantization to general availability, including SIMD distance optimization, with 8\u201332\u00d7 cost savings and up to 20\u00d7 lower latency depending on the workload. I also led agentic filter and boost generation using a bounded, verifiable operator set. For vector-search diversity, I'm the technical lead for a team of six engineers and scientists. I rearchitected a research algorithm for distributed execution with seven targeted innovations. Profiling-led optimizations across compute kernels and memory-intensive execution paths improved latency by 4.68\u00d7 and reduced memory by 85.6% before shipping, combining SIMD acceleration with improved allocation efficiency, optimized data movement, and tighter control of intermediate-state lifetimes."
        }
      ]
    },
    {
      id: 'diversity-why',
      category: 'technical',
      weight: 3,
      docs: ['Redundancy reduction', 'Evidence across documents', 'Shopping & recommendations'],
      sources: [['work-diversity', 'Vector diversity'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "Why does vector diversity matter?",
        "What problem does search diversity solve?"
      ],
      variants: [
        {
          thought: "Distinguish query relevance from coverage of the result set. Nearest-neighbour search ranks candidates by their distance to the query embedding, so individually relevant hits can still be redundant. Explain the consequences for evidence across a document collection and e-commerce, without exposing the vector-diversity algorithm.",
          answer: "Nearest-neighbour search ranks candidates by distance to the query embedding, but individually relevant results may still repeat the same evidence. Near-duplicates can dominate the highest-ranked results, limiting coverage for complex, corpus-spanning grounding or crowding out alternatives in e-commerce and recommendations. I'm the technical lead for the team delivering vector-search diversity to reduce redundancy through broader topical coverage while retaining relevance."
        },
        {
          thought: "A good way to put it: relevance is judged one result at a time, but usefulness is judged across the whole set. Ten relevant results that repeat each other are worth less than five that each add something. Make that point, then give the document-collection and shopping examples.",
          answer: "Relevance is judged per result; coverage is judged across the result set. Ten highly similar passages may all match the query while supplying the same evidence. That homogeneity limits corpus-spanning grounding and narrows choices in e-commerce and recommendations. I'm the technical lead for the team delivering vector-search diversity to strengthen nearest-neighbour search through reduced redundancy and broader topical coverage."
        }
      ]
    },
    {
      id: 'diversity-production',
      category: 'technical',
      weight: 3,
      docs: ['Vector diversity capability', 'Distributed execution'],
      sources: [['work-diversity', 'Vector diversity'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How did Robert take vector-diversity research into production?",
        "What makes vector diversity hard to build for production?"
      ],
      variants: [
        {
          thought: "Explain the completed algorithm and architecture redesign without revealing internals. Name the seven targeted innovations and the full production constraints, then connect the pre-shipping gains to profiling-led optimizations of compute kernels and memory-intensive execution paths: SIMD, allocation efficiency, data movement, and intermediate-state lifetimes.",
          answer: "For vector-search diversity, I analyzed a state-of-the-art research algorithm and rethought both its algorithm and architecture for distributed execution while preserving its core strengths. I drove seven targeted innovations for hyperscalability, durability, corpus drift, availability, and performance. I also drove profiling-led optimizations across compute-intensive kernels and memory-intensive execution paths, combining SIMD acceleration with improved allocation efficiency, optimized data movement, and tighter control of intermediate-state lifetimes. This improved latency by 4.68\u00d7 and reduced memory by 85.6% before shipping."
        },
        {
          thought: "Frame the work as preserving research strengths rather than porting code. Tie the seven innovations to production requirements and explain how a shared core and decoupled mechanisms made the architecture maintainable and enabled parallel work.",
          answer: "The challenge was preserving a research algorithm's strengths in a distributed engine. For vector-search diversity, I rearchitected it and drove seven targeted innovations addressing hyperscalability, durability, corpus drift, availability, and performance. I resolved system-wide scalability, recovery, and extensibility tradeoffs, consolidated infrastructure into a shared core, and decoupled shared mechanisms so three engineers could work in parallel. Profiling-led compute and memory optimizations combined SIMD acceleration with improved allocation efficiency, optimized data movement, and tighter control of intermediate-state lifetimes, delivering 4.68\u00d7 better latency and 85.6% less memory before shipping."
        }
      ]
    },
    {
      id: 'tech-lead',
      category: 'leadership',
      weight: 3,
      docs: ['Team technical leadership', 'Vector diversity capability'],
      sources: [['profile-work-entry-1', 'Senior Software Engineer'], ['work-diversity', 'Vector diversity']],
      prompts: [
        "What does Robert do as a technical lead?",
        "How does Robert guide the vector-diversity work?"
      ],
      variants: [
        {
          thought: "Keep Senior Software Engineer as the role title while making technical leadership concrete: vision, leadership buy-in, cross-org alignment, greenfield architecture, investment decisions, and hands-on delivery.",
          answer: "I'm a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI) and the technical lead for a team of six engineers and scientists delivering a novel vector-search diversity capability. I set the technical direction and own delivery end to end, from leadership buy-in and cross-org alignment to greenfield architecture, technical investment decisions, and hands-on implementation."
        },
        {
          thought: "Show how system-wide architecture decisions enabled the team: resolve scalability, recovery, and extensibility tradeoffs, consolidate infrastructure, and decouple shared mechanisms for three engineers' parallel execution. Retain technical direction and hands-on ownership.",
          answer: "As a Senior Software Engineer, I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity. I set technical direction and own delivery through hands-on implementation. I designed a maintainable architecture around scalability, recovery, and extensibility, consolidated infrastructure responsibilities into a shared system core, and decoupled shared mechanisms to unlock parallel execution for three engineers."
        }
      ]
    },
    {
      id: 'filter-generation',
      category: 'technical',
      weight: 3,
      docs: ['Filter generation', 'Lucene boosts', 'Bounded operator set'],
      sources: [['work-agentic', 'Agentic retrieval'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How does agentic retrieval generate filters and boosts?",
        "What does filter and boost generation do?"
      ],
      variants: [
        {
          thought: "Give the actual field types and operator boundaries, then distinguish hard filters from ranking preferences. The bounded set uses eq/ne with and/or over categorical or low-cardinality string, string[], and bool fields. Boosts are Lucene-style, and unsupported constraints must not be presented as enforced filters.",
          answer: "It translates natural-language intent into hard filters and ranking preferences. The supported operator set uses categorical, low-cardinality fields\u2014fields with few distinct values\u2014of type string, string[], or bool. Filters combine equal (eq) and not-equal (ne) with and/or; Lucene-style boosts affect ranking rather than eligibility. Generated filters can be validated against the index schema; unsupported constraints aren't enforced as filters."
        },
        {
          thought: "Explain the research-to-production decision through the actual supported set, not a vague promise of simpler filters. Both variants should retain the field types, operator restrictions, and the distinction between filtering and Lucene boosting.",
          answer: "I led this from research to production using a bounded, verifiable operator set: equal (eq), not-equal (ne), and logical and/or over categorical, low-cardinality string, string[], and bool fields with few distinct values. Filters constrain eligibility; Lucene-style boosts express ranking preferences. The restricted set lets us validate generated filters against the index schema."
        }
      ]
    },
    {
      id: 'operator-consensus',
      category: 'leadership',
      weight: 2,
      docs: ['Production analysis', 'Bounded operator set'],
      sources: [['work-agentic', 'Agentic retrieval'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How did Robert get research and product teams to agree?",
        "How does Robert use data to settle a design debate?"
      ],
      variants: [
        {
          thought: "This is about decision-making. For agentic filter generation, the open question was whether a bounded operator set would cover what customers actually need. Robert answered it with production analysis, which brought research and product to agreement. Keep it about the evidence.",
          answer: "The design question was which filter operations we needed to support. I analyzed production usage to show that a limited set of operations we could validate covered real customer workloads. That gave research and product a shared basis for agreeing on the technical direction."
        },
        {
          thought: "The general lesson is to turn a debate into a question data can answer. A smaller design only convinces people if it still covers real usage, so Robert measured that directly from production. Tell it as a repeatable approach, using the filter-generation work.",
          answer: "I try to turn a design debate into a testable question. For agentic filter generation, we needed to know whether a limited set of supported operations covered real usage. Production analysis demonstrated that coverage, and I brought research and product to consensus around the evidence."
        }
      ]
    },
    {
      id: 'agents-grounding',
      category: 'technical',
      weight: 2,
      docs: ['Agent tool calling', 'RAG grounding'],
      sources: [['work-agentic', 'Agentic retrieval'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How does Robert's search work connect to LLM agents?",
        "How does search help ground LLM agents?"
      ],
      variants: [
        {
          thought: "Describe the retrieval integration through tool calling, multi-agent orchestration, and RAG. Distinguish supplying evidence from orchestrating agents without turning the answer into a disclaimer about what Robert didn't build.",
          answer: "I've integrated Azure AI Search retrieval into agent workflows through tool calling, multi-agent orchestration, and retrieval-augmented generation (RAG). Search supplies governed, indexed enterprise knowledge as context for the model's response. Retrieval provides evidence; orchestration determines when and how agents use it."
        },
        {
          thought: "Explain retrieval as the evidence-supply layer for enterprise questions, alongside the model's other context. Connect that to tool calling and RAG without implying that retrieval is the model's only input or guarantees a correct interpretation.",
          answer: "For questions about enterprise data, retrieval determines which evidence reaches the model. I've connected Azure AI Search to agent tool calling, multi-agent orchestration, and RAG so agents can use governed, indexed knowledge alongside their other context. Grounding gives the model relevant sources; it doesn't by itself guarantee that the model interprets them correctly."
        }
      ]
    },
    {
      id: 'benchmarking-billing',
      category: 'technical',
      weight: 2,
      docs: ['Workload benchmarks', 'Billing model'],
      sources: [['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How did Robert benchmark agentic retrieval?",
        "How did Robert's benchmarks shape the billing model?"
      ],
      variants: [
        {
          thought: "Connect highly variable workloads to the need for CPU, memory, and throughput profiling. State the serverless billing scope as both agentic retrieval and diversity-aware search, and keep the 80% memory reduction limited to key paths.",
          answer: "Agentic-retrieval workloads vary substantially between requests, so I architected a new benchmarking system to profile CPU, memory, and throughput. Those measurements established the serverless billing formula for agentic retrieval and diversity-aware search. The profiling also supported memory optimization, reducing memory by 80% on key paths."
        },
        {
          thought: "Explain the measurement-to-product connection without inventing pricing details. Distinguish the benchmark-related 80% memory reduction on key paths from vector-search diversity's separate 85.6% pre-shipping reduction.",
          answer: "I designed benchmarks around the variability of agentic retrieval rather than treating every request as equivalent. Profiling CPU, memory, and throughput let me establish the serverless billing formula for both agentic retrieval and diversity-aware search. I also optimized memory by 80% on key paths\u2014a separate result from the 85.6% pre-shipping memory reduction in my vector-search diversity work."
        }
      ]
    },
    {
      id: 'quantization',
      category: 'technical',
      weight: 2,
      docs: ['Scalar quantization', 'Binary quantization', 'SIMD distance'],
      sources: [['work-quantization', 'Quantization'], ['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "How did Robert make vector search cheaper?",
        "What did vector quantization do for customers?"
      ],
      variants: [
        {
          thought: "Connect scalar and binary quantization and SIMD distance kernels to the shipped cost and latency improvements. Include the approximation tradeoff as well as the workload-dependent numbers, rather than presenting compression as free.",
          answer: "I drove vector quantization from public preview to general availability on Azure AI Search. Scalar and binary quantization reduce vector storage precision, while SIMD-accelerated distance kernels make comparisons efficient. The work delivered 8\u201332\u00d7 cost savings and up to 20\u00d7 lower latency, depending on the workload. The tradeoff is approximation: savings need to be evaluated alongside retrieval quality."
        },
        {
          thought: "Use the 32-to-8-to-1-bit comparison, but retain the precision tradeoff. Smaller representations save storage and support efficient comparisons; they approximate the original vectors, so retrieval quality and workload matter alongside cost and latency.",
          answer: "For float32 embeddings, scalar quantization reduces each dimension from 32 bits to 8, and binary quantization to 1. Those smaller representations trade precision for lower storage cost and efficient SIMD distance computation. I drove the capability from preview to general availability, delivering 8\u201332\u00d7 cost savings and up to 20\u00d7 lower latency, with results depending on the workload."
        }
      ]
    },
    {
      id: 'simd',
      category: 'technical',
      weight: 1,
      docs: ['SIMD distance'],
      sources: [['work-simd', 'SIMD distance kernels'], ['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "How does Robert make vector distance math fast?",
        "What low-level optimization has Robert done?"
      ],
      variants: [
        {
          thought: "This is about the inner loop. Robert optimized the vector distance kernel with SIMD, loop unrolling, multiple independent accumulators, and fused multiply-add. Explain what each one buys, without crediting the whole quantization speedup to one kernel.",
          answer: "I optimized vector distance kernels with SIMD (single instruction, multiple data), loop unrolling, multiple independent accumulators, and fused multiply-add (FMA). SIMD processes several dimensions per instruction; independent accumulators break up the serial dependency chain so the CPU can overlap work. FMA combines multiplication and accumulation. Because this kernel runs for every candidate distance evaluation, its efficiency matters across the whole search."
        },
        {
          thought: "Frame it as hardware-aware engineering. Vector search spends much of its time computing distances, so the kernel matters. Robert used SIMD, unrolling, multiple accumulators, and FMA, drawing on an embedded-systems background. Connect those.",
          answer: "The distance kernel is a hot path in vector search. I used SIMD to process dimensions in parallel, loop unrolling to expose more work, and independent accumulators to reduce dependency bottlenecks. Fused multiply-add combines multiplication and accumulation in one instruction. That hardware-aware approach builds on my embedded-systems background in ARM assembly and VHDL."
        }
      ]
    },
    {
      id: 'graph-search',
      category: 'technical',
      weight: 2,
      docs: ['HNSW graph search', 'HNSW quotas', 'SIMD distance'],
      sources: [['work-hnsw', 'HNSW graph search'], ['work-simd', 'SIMD distance kernels'], ['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "How does graph search power vector retrieval?",
        "What's Robert's experience with HNSW graph search?"
      ],
      variants: [
        {
          thought: "Explain HNSW as graph-based approximate nearest-neighbour search, then tie it to Robert's documented engine work. Distinguish traversal from distance computation and the recall-versus-effort tradeoff from production quota enforcement. Do not imply authorship of HNSW.",
          answer: "HNSW is a graph search approach to approximate nearest-neighbour retrieval: vectors are nodes, and links guide the search toward nearby candidates. Sparse upper levels provide shortcuts; the base level explores a candidate pool. Keeping more candidates can improve recall\u2014the share of true nearest neighbours found\u2014but usually requires more distance comparisons. My work included resource-aware quota enforcement for HNSW indexes and SIMD-optimized distance kernels that process several values per CPU instruction."
        },
        {
          thought: "Start with Robert's contributions, then explain how HNSW graph traversal and SIMD distance kernels fit together. Keep the resource-quota work distinct from search parameters, and make the approximation tradeoff explicit.",
          answer: "My HNSW graph search work focused on the vector engine: I designed quota enforcement tied to physical resource use and optimized vector-distance kernels with SIMD, processing several values per CPU instruction. HNSW follows links between stored vectors, taking shortcuts through sparse upper levels before exploring candidates at the base. A larger candidate pool can improve recall\u2014the share of true nearest neighbours found\u2014at the cost of more search effort."
        }
      ]
    },
    {
      id: 'hybrid-relevance',
      category: 'technical',
      weight: 1,
      followupOnly: true,
      docs: ['Subscore fusion', 'Score thresholds'],
      sources: [['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "How does Robert improve hybrid search relevance?",
        "What did Robert build for hybrid search?"
      ],
      variants: [
        {
          thought: "Keep the distinction between ranking and eligibility. Hybrid search combines keyword and vector retrieval signals; subscore fusion shapes their contribution to the final ranking, while score thresholds exclude insufficient matches. Don't invent a fusion formula or internal implementation.",
          answer: "Hybrid search combines keyword and vector retrieval signals, which have different scoring semantics. I designed subscore fusion to improve how those signals contribute to the final ranking, and score thresholding to exclude insufficient matches. These address different parts of relevance: how candidates are ranked, and whether they're strong enough to return at all."
        },
        {
          thought: "Connect the features to why they matter now. When results become an LLM's evidence, a weak match can be worse than none. Subscore fusion and score thresholding were Robert's designs for blended vector and keyword search. Tie both to grounding.",
          answer: "I worked on two controls for blended vector and keyword retrieval: subscore fusion for combining ranking signals, and score thresholds for filtering out weak matches. They're especially useful when results become an LLM's grounding context: a high position in the ranking isn't, by itself, evidence that a passage is a sufficiently strong match."
        }
      ]
    },
    {
      id: 'reliability',
      category: 'technical',
      weight: 1,
      followupOnly: true,
      docs: ['HNSW quotas', 'Incident response'],
      sources: [['work-hnsw', 'HNSW graph search'], ['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "How does Robert keep a large search service reliable?",
        "How does Robert approach reliability in production?"
      ],
      variants: [
        {
          thought: "Reliability has two sides: prevention and recovery. For prevention, HNSW indexes are resource-hungry, and Robert built a data-driven quota mechanism tied to physical resource use that cut limit overshoot by 100\u00d7. For recovery, he root-causes hard incidents across teams. Cover both.",
          answer: "I work on both prevention and incident response. For HNSW graph search indexes, I designed quota enforcement tied to physical resource utilization, cutting limit overshoot by 100\u00d7 through cross-team design work. I also root-cause production incidents across teams and review distributed-systems and vector-algorithm changes, with the goal of restoring service quickly and preventing recurrence."
        },
        {
          thought: "Start with incidents, then the structural fix. Robert root-causes cross-team incidents and reviews distributed-systems and vector-algorithm changes, and the HNSW quota work fixed one class of problem at the source. Keep incident details private.",
          answer: "Incident response means tracing failures across team and system boundaries, restoring service, and following through with a durable fix. I also work on structural prevention: the quota enforcement I designed for HNSW graph search indexes ties limits to physical resource use and cut overshoot by 100\u00d7. Reviews of distributed-systems and vector-algorithm changes are another part of preventing the next incident."
        }
      ]
    },
    {
      id: 'facet-engine',
      category: 'technical',
      weight: 1,
      docs: ['Facet engine'],
      sources: [['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "Has Robert ever built a parser?",
        "Has Robert worked on anything like a compiler?"
      ],
      variants: [
        {
          thought: "The facet-aggregation engine is the compiler-style story. Robert owned it end to end from the spec: a custom lexer, parser, and evaluator built on a BNF grammar, the shunting-yard algorithm, and Reverse Polish Notation, backed by extensive A/B tests. Keep it concrete.",
          answer: "Yes. I owned an extensible facet-aggregation engine for Azure AI Search end to end, starting from the spec. It's a custom lexer, parser, and evaluator: a BNF grammar defines the expressions, and the shunting-yard algorithm converts them to Reverse Polish Notation so they can be parsed, simplified, and validated. Extensive A/B testing backed it."
        },
        {
          thought: "Explain why a compiler technique belongs in a search engine. Facet expressions need to be parsed, checked, and evaluated safely, which is a classic language problem. Robert built the lexer, parser, and evaluator from the spec. Describe the pipeline briefly.",
          answer: "Yes: facet expressions in a search engine are really a small language, so I treated them like one. For an extensible facet-aggregation engine I owned end to end, I built a lexer, parser, and evaluator from a BNF grammar, using the shunting-yard algorithm and Reverse Polish Notation to parse, simplify, and validate expressions, with extensive A/B testing behind it."
        }
      ]
    },
    {
      id: 'plain-job',
      category: 'general',
      weight: 3,
      docs: ['Vector search at scale', 'Team technical leadership'],
      sources: [['profile-work-entry-1', 'Senior Software Engineer'], ['profile-work-entry-2', 'Software Engineer II']],
      prompts: [
        "What does Robert do at work, in plain English?",
        "Can you explain Robert's job in simple terms?"
      ],
      variants: [
        {
          thought: "Explain the service and Robert's own scope without replacing them with an analogy. Define vector search briefly, keep the scale and team technical leadership, and avoid claiming that the search engine literally understands a request.",
          answer: "I'm a Senior Software Engineer at Microsoft Azure Foundry IQ (CoreAI), building retrieval systems for business documents and AI apps. I helped scale vector search, which compares numerical representations of text to find related meanings, not just matching words. Today I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity to reduce repetitive search results."
        },
        {
          thought: "Keep a concrete example, but pair it with the engineering work. Vector search can match related meanings rather than exact words; Robert helped scale it across billions of embeddings and is now technical lead for the six-person vector-search diversity team.",
          answer: "I'm a Senior Software Engineer building the search technology behind business apps and AI assistants at Microsoft. With vector search, a query for \u201ccheap flights\u201d can find \u201cbudget airfare\u201d without sharing the same words. I helped scale that capability across billions of embeddings, the numerical representations used for matching. Now I'm the technical lead for a team of six engineers and scientists delivering vector-search diversity to make results less repetitive."
        }
      ]
    },
    {
      id: 'plain-current',
      category: 'general',
      weight: 2,
      docs: ['Vector diversity capability', 'Shopping & recommendations', 'Evidence across documents'],
      sources: [['work-diversity', 'Vector diversity'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "What's Robert working on these days?",
        "What's Robert's current project about?"
      ],
      variants: [
        {
          thought: "Use product choice as a concrete example of result redundancy, then connect it to broader evidence for AI grounding. Keep Robert's research-to-production scope, but don't expose the vector-diversity algorithm.",
          answer: "I'm a Senior Software Engineer and the technical lead for a team of six engineers and scientists delivering a novel vector-search diversity capability for Azure AI Search. It reduces repetitive results: an online store should offer meaningful choices, not ten near-identical products. AI assistants similarly need evidence from different parts of a document collection for broad questions. I own the work from technical vision through delivery, including making it faster and more memory-efficient before shipping."
        },
        {
          thought: "Explain search diversity as reducing redundancy, not guaranteeing a complete or correct answer. Connect the product goal to Robert's technical responsibility, with both recommendations and broad AI grounding as examples.",
          answer: "My current focus is vector-search diversity: reducing repetition without losing sight of relevance. As a Senior Software Engineer, I'm the technical lead for a team of six engineers and scientists delivering this new capability. It can give shoppers and recommendation users more distinct choices, and provide AI assistants with broader evidence for questions spanning a document collection. Before shipping, I improved latency by 4.68\u00d7 and reduced memory by 85.6%."
        }
      ]
    },
    {
      id: 'plain-ai',
      category: 'general',
      weight: 2,
      docs: ['RAG grounding', 'Agent tool calling'],
      sources: [['work-agentic', 'Agentic retrieval'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "How do AI assistants find their answers?",
        "What does Robert's work have to do with AI chatbots?"
      ],
      variants: [
        {
          thought: "Explain retrieval-augmented generation by its sequence: search for relevant sources, then use them as context. Include the actual term with its explanation, connect it to agent tool calling, and keep the limits of grounding clear.",
          answer: "For questions about a company's documents, an assistant can search for relevant passages and use them as context when writing its response. That's retrieval-augmented generation, or RAG. I've integrated Azure AI Search into agent workflows as a tool they can call. It helps ground responses in company information, though the model can still misinterpret a source."
        },
        {
          thought: "Separate retrieval from generation without treating either as infallible. Robert's work supplies indexed enterprise information through a search tool; the model uses those results to compose a response. Define grounding through that connection.",
          answer: "There are two different jobs: finding relevant information and composing an answer from it. I work on the first, integrating Azure AI Search into AI agents through tool calling. The search results give the model sources from a company's indexed documents. That connection is called grounding; it helps, but neither finding the right sources nor interpreting them correctly is automatic."
        }
      ]
    },
    {
      id: 'career-arc',
      category: 'general',
      weight: 2,
      docs: ['Chest X-ray app', 'Vector search at scale', 'Team technical leadership'],
      sources: [['profile-experience', 'Detailed experience']],
      prompts: [
        "How has Robert's career progressed?",
        "How did Robert get where he is today?"
      ],
      variants: [
        {
          thought: "Tell it as growing technical scope: Garage in 2018, search internships in 2019 and 2020, full-time from 2021, scaling vector search, then Senior Software Engineer from 2025. He is currently technical lead for the six-person vector-search diversity team, setting direction and owning delivery.",
          answer: "I've moved from owning parts of an app to owning broader technical efforts. At Microsoft Garage in 2018, I helped build a chest X-ray classification app, followed by search internships in 2019 and 2020. I joined Azure AI Search full-time in 2021 and helped scale vector search for broad adoption. I've been a Senior Software Engineer since 2025; currently I'm the technical lead for a team of six engineers and scientists building vector-search diversity."
        },
        {
          thought: "Use the progression to show breadth as well as ownership: mobile ML at Garage, production search features, vector search at scale, and technical leadership for the vector-search diversity team. Keep the emphasis on direction, end-to-end delivery, and hands-on engineering.",
          answer: "The growth has been in both breadth and technical ownership: mobile ML in a chest X-ray app at Microsoft Garage, production features on the search team, then vector storage, quantization, and relevance at scale. I helped take vector search to broad production adoption. Now, as a Senior Software Engineer and the technical lead for a team of six engineers and scientists building vector-search diversity, I set the technical direction and own delivery through partner alignment and hands-on implementation."
        }
      ]
    },
    {
      id: 'vision-models',
      category: 'technical',
      weight: 2,
      docs: ['Pose estimation', 'Road segmentation', 'Monocular depth'],
      sources: [['profile-projects-entry-1', 'Pose estimation'], ['profile-projects-entry-2', 'Road segmentation'], ['profile-projects-entry-3', 'Monocular depth']],
      prompts: [
        "What neural networks has Robert trained?",
        "What computer-vision models has Robert built?"
      ],
      variants: [
        {
          thought: "Lead with the most ambitious: a human pose estimation network trained from random initialization on COCO-2017, where Robert led the team and owned the architecture, cloud training pipeline, and augmentation. Then road segmentation and self-supervised monocular depth to show range.",
          answer: "The most ambitious was human pose estimation: I led a student team that trained the network from randomly initialized weights on COCO-2017, and I owned the model architecture, cloud training pipeline, and data augmentation. I've also trained a U-Net for road segmentation on KITTI Road, reaching up to 99.1% F1, and a self-supervised monocular depth model based on Monodepth2."
        },
        {
          thought: "Make the second variant technically distinct: pose heatmaps rather than direct joint-coordinate regression, supervised road segmentation, and self-supervised depth from photometric reconstruction. These are public project details; keep all three field documents represented.",
          answer: "Human pose estimation on COCO-2017 used joint heatmaps rather than direct coordinate regression, trained from random weights. Road segmentation used a U-Net on KITTI Road, with F1 up to 99.1% and 91% in the worst case. For monocular depth, I implemented a limited Monodepth2 variant in TensorFlow, using stereo photometric reconstruction and edge-aware smoothness loss without ground-truth depth labels."
        }
      ]
    },
    {
      id: 'early-builds',
      category: 'technical',
      weight: 1,
      docs: ['Chest X-ray app', 'Battlesnake RL'],
      sources: [['profile-work-entry-6', 'Microsoft Garage'], ['profile-projects-entry-4', 'Battlesnake']],
      prompts: [
        "What did Robert build as a student?",
        "What were some of Robert's early projects?"
      ],
      variants: [
        {
          thought: "Two early builds put ML into something real. At Microsoft Garage in 2018, Robert built parts of a cross-platform mobile app that classified chest X-rays offline. In 2019 he trained a reinforcement-learning agent for Battlesnake. Describe both, and keep Garage clearly separate from the search work.",
          answer: "At Microsoft Garage in 2018, I helped build a cross-platform mobile app that classified chest X-rays using offline machine learning. I built its image-processing pipeline, continuous integration, and an iOS share extension. A year later I trained a Battlesnake AI with reinforcement learning, through self-play and games against public snakes, to survive against up to seven opponents."
        },
        {
          thought: "Lead with the reinforcement-learning project for variety, then the Garage app. Battlesnake is a real-time survival game against up to seven opponents, and Robert trained a keras-rl model through self-play. The Garage app classified chest X-rays on the device. Keep both concrete.",
          answer: "Two favourites. One is a Battlesnake AI: I trained a keras-rl reinforcement-learning agent through self-play to survive real-time games against up to seven opponents. The other is from my Microsoft Garage internship, a mobile app that classified chest X-rays offline, right on the device. For that app I built the image-processing pipeline, continuous integration, and an iOS share extension."
        }
      ]
    },
    {
      id: 'community-programs',
      category: 'general',
      weight: 2,
      docs: ['Digital literacy program', 'IEEE workshops', 'Tech & business conference'],
      sources: [['profile-leadership', 'Community leadership & mentoring']],
      prompts: [
        "What has Robert done for his community?",
        "What has Robert started outside of work?"
      ],
      variants: [
        {
          thought: "The numbers tell this one. Robert founded a digital literacy program for seniors and ran it for six years, growing it to 180 volunteers and 650+ seniors across 30 workshops before handing it off. He also built a 14-workshop IEEE series for 350+ students and founded a conference with 200+ attendees.",
          answer: "I founded a digital literacy program for seniors and ran it for six years. It grew to 180 volunteers and 650+ seniors across 30 workshops, and I handed it to successors who kept it going. Through our IEEE student branch I built a 14-workshop technical series that reached 350+ students, and I founded a tech and business strategy conference with 200+ attendees."
        },
        {
          thought: "The common thread is building programs that keep running after Robert steps away, and the seniors' program is the warmest example: past participants emailed years later to ask when the next session would run. Then the IEEE workshop series and the conference. Lead with that thread, then the scale.",
          answer: "I like building programs that outlast me. The seniors' digital literacy program I founded reached 650+ seniors with 180 volunteers and kept running after I handed it off; years later, past participants still emailed to ask when the next session would be. I also built an IEEE workshop series that reached 350+ students, and founded a tech and business strategy conference that drew 200+ attendees."
        }
      ]
    },
    {
      id: 'mentoring',
      category: 'general',
      weight: 2,
      docs: ['SENG 321 mentor', 'Mentoring engineers'],
      sources: [['profile-leadership', 'Community leadership & mentoring'], ['profile-work-entry-1', 'Senior Software Engineer']],
      prompts: [
        "Does Robert mentor other engineers?",
        "How does Robert approach mentoring?"
      ],
      variants: [
        {
          thought: "Keep the current mentoring work distinct from the 2024 chatbot challenge. At Microsoft Robert mentors engineers and leads design reviews; in SENG 321 he coaches requirements and design reasoning using an open-ended challenge drawn from production AI systems.",
          answer: "At Microsoft I mentor and onboard engineers and lead design reviews. At the University of Victoria, I mentor a SENG 321 requirements-engineering team using a challenge drawn from production AI systems. I help students identify stakeholder needs, choose a workable scope, and justify their design as they move from an ambiguous brief to a clickable prototype."
        },
        {
          thought: "Focus on how Robert coaches: he looks at the quality of the reasoning, not just the output. In SENG 321 he holds biweekly reviews on scope and design rationale; in 2024 he was one of 18 mentors for a 120-student cohort. At work he mentors and onboards engineers. Make the coaching style the point.",
          answer: "I focus on the reasoning behind a design: whose needs it serves, what assumptions it makes, and how the team justifies its scope. As a SENG 321 industry mentor at the University of Victoria, I review that reasoning biweekly; in 2024 I was one of 18 mentors for 120 students. At Microsoft I bring the same focus to mentoring engineers, onboarding, and design reviews."
        }
      ]
    },
    {
      id: 'recognition',
      category: 'general',
      weight: 2,
      docs: ['Schulich Leader', 'YC AI Startup School', 'National champion'],
      sources: [['profile-awards', 'Awards']],
      prompts: [
        "What awards has Robert won?",
        "What recognition has Robert received?"
      ],
      variants: [
        {
          thought: "Explain the Schulich distinction: $80,000, one of 25 engineering recipients nationally in 2016, within a 50-person STEM cohort selected from 1,500+ school nominees. Then the YC event selection and national science title. Keep the event distinct from YC's startup accelerator.",
          answer: "The one I'm proudest of is the $80,000 Schulich Leader Scholarship. I was one of 25 engineering recipients across Canada in 2016, in a cohort of 50 selected from 1,500+ school nominees. I was also hand-picked for Y Combinator's first AI Startup School\u2014about 8% of 30,000 applicants\u2014and won the Michael Smith Science Challenge nationally with a record-setting 97.5%."
        },
        {
          thought: "Show range across the years: first nationally among 1,753 science-challenge competitors in 2014, Canada's largest undergraduate STEM scholarship program in 2016, and the inaugural YC AI event in 2025. Give the science score context with the 42.5% national average.",
          answer: "Three stand out: first in Canada among 1,753 Michael Smith Science Challenge competitors in 2014, with a record-setting 97.5% against a 42.5% national average; the $80,000 Schulich Leader Scholarship in 2016, from Canada's largest undergraduate STEM scholarship program; and selection for Y Combinator's inaugural AI Startup School in 2025. I've received 20+ scholarships and awards worth over $100,000."
        }
      ]
    },
    {
      id: 'education',
      category: 'general',
      weight: 1,
      docs: ['B.Eng, Computational Intelligence', '97% average, graduating-class rank', 'Research award'],
      sources: [['profile-education', 'Education'], ['profile-awards', 'Awards']],
      prompts: [
        "What's Robert's academic background?",
        "Where did Robert study?"
      ],
      variants: [
        {
          thought: "State the degree, result, research area, and design competitions directly. Hardware acceleration is a useful technical term here, not jargon that needs to be replaced with a vague description.",
          answer: "I earned a Bachelor of Electrical and Computer Engineering at the University of Victoria in 2021, specializing in Computational Intelligence. I graduated with a 97% cumulative average, the second-highest cumulative GPA across the university's graduating class, and Dean's List recognition. Through the Jamie Cassels Undergraduate Research Award, I researched hardware acceleration for neural networks."
        },
        {
          thought: "Show the degree's breadth with concrete fields, but keep the answer approachable. Retain the research award and hardware acceleration, then the competition robot as a tangible example of hands-on engineering.",
          answer: "I studied Electrical and Computer Engineering at the University of Victoria, graduating in 2021 with a Computational Intelligence specialization and a 97% average—the second-highest cumulative GPA across the university's graduating class. I received Dean's List recognition and researched hardware acceleration for neural networks. Design competitions also gave me hands-on challenges, including a robot built to collect Martian artifacts."
        }
      ]
    },
    {
      id: 'skills',
      category: 'technical',
      weight: 1,
      docs: ['SIMD distance', 'Distributed execution', 'Filter generation', 'Pose estimation'],
      sources: [['profile-about', 'About'], ['profile-work', 'Experience']],
      prompts: [
        "What are Robert's technical strengths?",
        "What technologies does Robert work with?"
      ],
      variants: [
        {
          thought: "Skills are clearest through the work they produced. Robert writes C++, C#, Java, and Python, and his range runs from SIMD distance kernels to distributed execution, agentic filter generation, and training vision models. Name the languages, then one example per area.",
          answer: "I mainly work in C++, C#, Java, and Python, across systems engineering and applied ML: SIMD distance-kernel optimization, distributed execution for retrieval algorithms, bounded filter generation for agents, and computer vision. On the ML side, I led a human pose estimation project trained from random initialization, owning the architecture and cloud training pipeline."
        },
        {
          thought: "Frame Robert as someone who bridges systems engineering and applied ML, with 10+ years of coding behind it. One end is SIMD and distributed execution, the middle is retrieval for agents, and the other end is training models from scratch. One example each.",
          answer: "My strength is connecting algorithmic ideas to production systems, backed by 10+ years of coding in C++, C#, Java, and Python. That ranges from SIMD distance kernels to distributed execution for search, and from a bounded operator set for agentic filter generation to training human pose estimation models from scratch. I work across algorithm design, implementation, and delivery."
        }
      ]
    }
  ];

  // Offered at most once, a few turns into the conversation. The field shows
  // an overview rather than retrieving portfolio documents for this topic.
  var BEHIND_SCENES = {
    id: 'behind-the-scenes',
    category: 'general',
    docs: [],
    prompts: [
      "How does this page work?",
      "How are the chat and graph connected?"
    ],
    variants: [
      {
        thought: "Explain the page directly: prepared answers, browser-side sampling, and a graph coordinated with the answer's source labels. Make clear that the model names are interface labels and the traversal is an illustration, not a live AI service.",
        answer: "The chat samples prepared answers in your browser; it isn't connected to a live AI model. The model names are part of the interface. Portfolio answers tell a Canvas graph which pieces of my work to highlight. The traversal illustrates retrieval rather than searching a live index. The rest is a static HTML, CSS, and JavaScript page."
      },
      {
        thought: "Give a little more implementation detail without a file-by-file tour: the chat selects matching copy, passes source labels to the drawing code, and three Canvas layers create the depth-of-field effect. Explain what changing models actually does.",
        answer: "It's all browser-side HTML, CSS, and JavaScript. The chat picks from prepared questions and answers, then passes their source labels to an illustrative graph animation. Three Canvas layers create the depth-of-field effect. Changing models only changes the scripted sample; it never calls a model API."
      }
    ]
  };

  return { PROMPTS: PROMPTS, VARIANTS: VARIANTS, TOPICS: TOPICS, BEHIND_SCENES: BEHIND_SCENES };
})();
