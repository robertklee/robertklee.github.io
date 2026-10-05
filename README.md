# Robert Lee's website

A single-page profile that demonstrates retrieval as well as describing it. A scripted chat hero answers over a live embedding field, a career curve introduces the Microsoft experience, and five engineering stories sit within their associated roles. Full role details and the rest of the CV remain available. The site supports light and dark themes. The full profile reads without JavaScript; only the interactive parts need it.

## Page structure

1. **Hero:** a scripted chat over an embedding-field backdrop: an illustrative layered HNSW graph receding in depth of field, with topic regions in focus, each a small organic network of linked documents. Each prompt animates a search that enters deep in the graph, descends the layers, and lands on the documents the answer draws on, branching across regions when the answer spans several; answers cite their sources. Every row of suggested follow-ups includes at least one plain-language question for friends, family, and other non-engineers. On phones and narrow windows the regions recompose into the bands around the copy, and the search shows through the frosted chat card.
2. **About:** a portrait and a short introduction, with the longer biography available under "More about me."
3. **Experience & selected work:** the original spacious career map on desktop, with contribution labels above the exponential-style curve and role, date, team, and area labels below it. When the top of the card enters view, it fades in and slides upward, the SVG stroke draws the curve, its shading fades in, and milestone dots and labels appear staggered from newest to oldest. Stroke dash lengths are measured in screen pixels and updated on resize so the desktop and mobile curves share the same pacing. The animation runs once on desktop and mobile; reduced motion or keyboard focus shows the complete chart immediately. At 860px and below, the original compact labeled curve sits above the role groups and expandable details; the current card is highlighted. Selecting a milestone opens and navigates to its complete experience. Microsoft Garage stays outside the Azure AI Search trajectory: a separate desktop column or a dashed mobile link and card. The curve is qualitative, not a measured performance scale or a time-proportional chart. Keep desktop SVG coordinates, milestone `--column`/`--rise` values, and the CSS plot height in sync; mobile `--x`/`--y` percentages match the mobile path, scaled into the shared SVG viewBox. One milestone list serves both layouts, in newest-first document order; the chart's visual progression runs left to right. The curve geometry, styles, and animation are unchanged.

   The current role introduces Vector diversity and Agentic retrieval; Software Engineer II introduces Quantization, SIMD, and HNSW. Robert is a Senior Software Engineer and the technical lead for a team of five engineers and scientists building a new vector-search diversity capability. Keep the biography, career map, role details, chat variants, citations, and field labels consistent: give team technical leadership appropriate weight, with technical direction, end-to-end delivery ownership, and hands-on implementation, without implying an engineering-manager title. Qualify diversity as vector diversity or search diversity. The highlighted role headers link to full role details rather than embedding those records among the examples. All six expandable records live together, newest first, in **Detailed experience** at `#profile-experience`, with `#profile-work-records` holding only the records and their expand-all control beside that section's heading. The two newest entries use the same role/date/team/teaser structure as the earlier roles and link back to their selected contributions. Existing `#profile-work-entry-*` anchors remain stable: role links, chapter links, career milestones, and chat citations open and navigate to the corresponding entry. Each chapter prominently distinguishes Robert's contribution from its interactive concept illustration and links to its full role details:
   - **Vector diversity:** travel-planning, shopping, grounding, and feed scenarios with a search-diversity slider over a neighbourhood graph.
   - **Agentic retrieval:** a natural-language request becomes OData filters (`eq`, `ne`, `and`, `or` over categorical fields) and Lucene boosts; anything outside that set is left to ranking.
   - **Quantization:** a value ladder and a memory-at-scale meter. On first view, the value sweeps across zero and back, showing FP32 motion, INT8 steps, and the binary sign change; using the value slider cancels autoplay.
   - **SIMD:** a unit-vector dot product compares scalar MAC operations with four- or eight-lane packed operations, followed by an explicit horizontal reduction. While at least half the processor comparison is in view, it repeats after a two-second hold on the completed result. Scrolling away or hiding the tab suspends the loop; returning resumes it. Pause/Resume holds the current animation step, and changing a candidate or lane count while paused shows its completed result without restarting motion. Replay starts a fresh comparison and re-enables looping. Reduced motion shows the final result with no loop. Repeated identical cycles do not re-announce the same screen-reader result. Without IntersectionObserver, comparisons remain manually playable.
   - **HNSW:** four nested graph levels illustrate greedy upper-level navigation and bounded best-first base-level search, with an adjustable `efSearch` pool. A contrasting Q diamond identifies the query vector, with a linked callout below Level 0 so the label never covers stored vectors. The outlined base graph invites clicks or taps to move the query and replay; focusing the graph and pressing arrow keys moves it in ten-unit steps. Preset buttons remain available. The readout shows unique vectors compared and how many of the true nearest three were found, alongside the reference results from comparing all 24 vectors.
4. **Projects, Community & mentoring, Awards & achievements, and Education.**
5. **Contact:** a closing call to action.

The demos use hand-made, illustrative data. They show the idea behind each piece of work, not production algorithms, schemas, or numbers.

## Content and presentation

- **`index.html`** is the canonical, directly editable source for the stories, the figures' markup, and the full CV.
- **`assets/site/`** holds the design system and page behaviour:
  - **`site.css`:** the design system.
  - **`experience-work.css`:** role-linked examples, contribution and illustration labels, consolidated detailed experience, and the expandable biography. Its selectors do not alter the career curve.
  - **`hero.css`:** hero and chat styles.
  - **`entrance.js`** and **`entrance.css`:** the homepage's retrieval-first entrance and content-sized mobile chat.
  - **`site.js`:** navigation, theme sync, scroll reveals, and count-ups. On a fresh page or reload, hash navigation is realigned after browser scroll restoration so changing record heights cannot leave a bookmarked role offscreen. This realignment is skipped for back/forward-cache restores.
  - **`field.js`:** the hero's embedding field, a 3D HNSW-style graph drawn across three blurred depth planes.
  - **`diversity.js`**, **`agentic.js`**, and **`quantization.js`:** the Work figures.
  - **`vector-demos.js`** and **`vector-demos.css`:** the SIMD and HNSW Work figures at `#work-simd` and `#work-hnsw`. SIMD models 16 scalar multiply-accumulate (MAC) operations versus 4 four-lane or 2 eight-lane vector MACs into one packed accumulator, then explicitly reduces its lane sums. Counts exclude loads, loop overhead, and architecture-dependent reduction instructions; animation stages are not CPU cycles or speedup measurements. Independent lanes are not independent vector-register dependency chains: the production optimization of unrolling across multiple accumulator registers is explained, not simulated. Unit L2 normalization makes the dot product equal to cosine similarity. Inputs retain full precision on hover; JavaScript uses double-precision multiply then add, not native FP32 FMA's single rounding. HNSW uses nested levels of 2, 4, 8, and 24 points, greedy upper-level navigation, and base-level nearest-first search. `efSearch` bounds retained neighbours, not the frontier or distance comparisons, and is at least the requested result count of three. “Nearest 3 found” credits interchangeable cutoff-distance ties within floating-point roundoff; the true-neighbour list shows one valid set. “Vectors compared” counts unique points across levels, caching distances and excluding the separate all-vector reference comparison. Neither count is a timing benchmark. A full pool visits all 24 points in this connected toy graph, not a universal exact-recall guarantee. The fixed hierarchy and connections are hand-made, not an implementation of index construction, random node promotions, or a fixed level count in real HNSW. The figure links to the original paper and hnswlib's parameter documentation.
  - The self-hosted fonts, with their OFL licences.
- **`chat-content.js`** holds the hero's scripted copy: the opening questions, thoughts, answers, citations, and the field documents each answer draws on. **`index.js`** runs the homepage chat: it samples that copy, offers follow-up chips, and tells the field what to search. **`chat-core.js`** is the shared streaming engine and theme toggle used by the homepage and **`404.html`**/**`404.js`**. None of them calls a model or a backend.
- **`assets/og.png`** is the 1200×630 social card. If the name or role changes, re-render it to match.

HNSW pointer placement uses double-precision `DOMPoint` coordinates. Its
cutoff-tie tolerance accounts for coordinate and distance magnitudes, so
responsive screen-to-graph roundoff does not turn an illustrative tie into a
miss. The tolerance remains at floating-point-roundoff scale.

Update CV content in `index.html`; the hero's questions and responses live in `chat-content.js`. Motion respects `prefers-reduced-motion`: reveals, count-ups, and figure autoplay are skipped, and everything stays usable.

The homepage leads directly with Robert's name and role. Its ten opening answers emphasize current vector-search diversity, research-to-production ownership for agentic retrieval, workload benchmarking and billing, and quantization's measured customer impact. The technical-achievements topic highlights distributed algorithm design, verifiable agentic filter generation, and quantization; distinguish ongoing work from shipped results and qualify cost and latency gains by workload. Hybrid relevance and HNSW quota stories remain available as specific deeper follow-ups, but `followupOnly` excludes them from the initial suggestions. Awards questions are explicitly about recognition, not a substitute for engineering achievements.

The homepage has a one-time retrieval-first entrance. A restrained camera pullback, an activation wave along graph connections, and a rising chat card establish the scene in 1.85 seconds on desktop or 1.25 seconds in compact layouts. The completed question stays on screen with "Retrieving sources..." while the illustrative search descends layers and branches to its documents. The opening traversal takes 3 seconds on desktop or 2.4 seconds in compact layouts, plus 380 ms for the final source marker to settle; only then does a brief card highlight lead into model output. This is scripted dramatic pacing, not a backend request. The name, navigation, and profile remain available throughout. Resizing and theme changes do not replay the entrance. Reduced motion skips the animation and hold. Leaving the hero or hiding the page releases the hold without a payoff, and unavailable Canvas support logs a warning and allows the chat to continue. The 404 graph keeps its existing behavior.

On phones, narrow windows, and short landscape viewports, the homepage uses a compact heading and a chat card that starts at its content height and grows as text arrives. It caps at the available hero height, leaving the scroll cue clear, then scrolls internally. Suggested questions sit in a separate bottom strip so long answers, expanded traces, and contact cards cannot hide them. The same chip elements move back into the transcript on wider screens, preserving their handlers and the accessible-question guarantee. Model menus expand inline in the compact transcript to avoid clipped popovers; answers and contact links remain fully available by scrolling.

Match each answer's depth to its question: technical topics keep mechanisms and tradeoffs, leadership topics explain decisions and ownership, and general topics introduce unfamiliar terms with brief explanations and concrete examples. Every answer variant must fit both of its topic's question phrasings and cover the field documents in `docs`.

Headline awards link to the [2016 Schulich announcement](https://www.newswire.ca/news-releases/50-students-awarded-largest-canadian-undergraduate-scholarship-for-science-technology-engineering-and-math-stem-591031171.html), [Oak Bay News's 2014 coverage](https://oakbaynews.com/2014/05/27/smartest-kids-in-canada/), [UBC's 2014 contest analysis](https://phas-outreach.sites.olt.ubc.ca/files/2017/01/MSC2014-English-Solutions.pdf), and [YC's 2025 event page](https://events.ycombinator.com/ai-sus). Use statistics from the award year: the 2016 Schulich cohort had 50 recipients, including 25 in engineering, and 1,500+ school nominees. School nominees are not the national graduating population, and selection for the YC conference is not admission to its startup accelerator. The YC 30,000-applicant figure and the science score's record-setting status are confirmed by Robert. The news article corroborates his national win and 58.5/60 score (97.5%), but not an all-time record; use UBC's analysis for the 1,753-participant count and 42.5% national average. Keep the award cards and the `recognition` chat topic in sync.

A rare behind-the-scenes question can appear once per visit after three follow-up turns. Its copy lives in `BEHIND_SCENES` in `chat-content.js`; it explains the scripted chat and Canvas illustration. The graph switches to an overview for this topic rather than simulating a document search. It replaces a general question, preserving the accessible option and any technical questions in the row.

When you add a new top-level asset, also add it to `publicFiles` in `build.js`. Everything under `assets/site/` is copied automatically. When you add a script, add it to the `check` script in `package.json`.

## Local preview

Serve the repository root over HTTP, for example:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` for the homepage or `http://127.0.0.1:4173/404.html` for the not-found page.

Run `npm run check` to syntax-check the scripts, and `npm run build` to create the production `dist/` directory with the pages and their runtime assets.

Run `npm run test:hero` for the homepage entrance browser checks. The tests build
the site, serve that output on an ephemeral local port, and exercise retrieval
ordering, all ten opening answers, flagship technical-achievement answers and
citations, initial suggestion curation, mobile growth, reduced motion,
interruptions, and the 404 page.

Run `npm run test:quantization` for the quantization scroll-animation browser checks,
including mobile viewports, user interruption, and reduced motion.

Run `npm run test:career` for the career curve's scroll-animation browser checks,
including exact curve-geometry preservation, card-triggered reveals, newest-first milestones, mobile stroke scaling, keyboard navigation, and reduced motion.

Run `npm run test:vectors` for the SIMD and HNSW browser checks: unit norms,
dot-product arithmetic, MAC counts and reduction staging, nested levels and search
results, nearest-match counts and distance ties, labeled query placement by
mouse/touch/keyboard, controls, SIMD's repeated cycles and pause interval,
manual pause/resume, visibility and reduced-motion handling, and responsive layouts.
These checks also cover role grouping, consolidated newest-first records,
contribution labels, expand-all, keyboard and no-JavaScript role navigation,
return links, and reload alignment on desktop and mobile, plus consistent
team technical-lead wording and matching chat/field document labels.

Playwright is a development dependency for browser checks and screenshots. After `npm ci`, run `npx playwright install chromium` to install its Chromium browser.

## Cloudflare Workers Builds deployment

The dependency-free build script recreates `dist/` and copies only the site's
public runtime files. Wrangler then deploys that directory as static assets.
The site uses its custom `404.html` for missing paths; it does not use an SPA
fallback or a server-side Worker.

Configure Cloudflare Workers Builds with:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Version command | `npx wrangler versions upload` |
| Root directory | `/` |
| Production branch | `main` |

The version command uploads an unpromoted preview version. The deploy command
publishes the production version.

Set the **`SITE_URL` build environment variable** to the public origin of a
preview deployment. For the current feature-branch Worker, use
`https://website-v3-robertklee-website.robert-k-lee.workers.dev`.
The build writes absolute `og:url`, `og:image`, and `twitter:image` URLs for that
origin, so Messages and other sharing clients fetch the social card from the
same deployment rather than falling back to a project image when the production
asset is missing. Without `SITE_URL`, these tags use `https://www.robertkl.com/`.
The canonical URL, structured identity, and sitemap remain production URLs.
Use an HTTP(S) origin only, with no path, query, fragment, or credentials.

For a local build check:

```sh
SITE_URL=https://website-v3-robertklee-website.robert-k-lee.workers.dev npm run build
```

Configure the variable in the feature Worker's **build variables**, not just its
runtime bindings. Redeploy after changing it. Messages may retain an old link
preview; use a fresh URL query string when checking the redeployed metadata.

For local development, install dependencies with `npm ci`, build with
`npm run build`, and preview the Worker with `npm run preview`.
