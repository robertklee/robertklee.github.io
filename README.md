# Robert Lee's website

A single-page profile that demonstrates retrieval as well as describing it. A scripted chat hero answers over a live embedding field, three engineering stories each carry an interactive figure, and a complete static CV follows. The site supports light and dark themes. The full profile reads without JavaScript; only the interactive parts need it.

## Page structure

1. **Hero:** a scripted chat over an embedding-field backdrop: an illustrative layered HNSW graph receding in depth of field, with topic regions in focus, each a small organic network of linked documents. Each prompt animates a search that enters deep in the graph, descends the layers, and lands on the documents the answer draws on, branching across regions when the answer spans several; answers cite their sources. Every row of suggested follow-ups includes at least one plain-language question for friends, family, and other non-engineers. On phones and narrow windows the regions recompose into the bands around the copy, and the search shows through the frosted chat card.
2. **About:** a portrait and a short introduction.
3. **Work:** three chapters, each with a figure:
   - **Diversity:** travel-planning, shopping, grounding, and feed scenarios with a diversity slider over a neighbourhood graph.
   - **Agentic retrieval:** a natural-language request becomes OData filters (`eq`, `ne`, `and`, `or` over categorical fields) and Lucene boosts; anything outside that set is left to ranking.
   - **Quantization:** a value ladder and a memory-at-scale meter.
4. **Experience:** the original spacious career map on desktop, with contribution labels above the exponential-style curve and role, date, team, and area labels below it. At 860px and below, a compact labeled curve sits above newest-first expandable cards; the current card is highlighted, and contribution labels and area tags move into the cards. Selecting a milestone opens and navigates to its complete experience. Microsoft Garage stays outside the Azure AI Search trajectory: a separate desktop column or a dashed mobile link and card. The curve is qualitative, not a measured performance scale or a time-proportional chart. Keep desktop SVG coordinates, milestone `--column`/`--rise` values, and the CSS plot height in sync; mobile `--x`/`--y` percentages match the mobile path, scaled into the shared SVG viewBox. One milestone list serves both layouts, in newest-first document order; the chart's visual progression runs left to right. Full CV content and newest-first card order are unchanged.
5. **Projects, Community & mentoring, Education, and Awards.**
6. **Contact:** a closing call to action.

The demos use hand-made, illustrative data. They show the idea behind each piece of work, not production algorithms, schemas, or numbers.

## Content and presentation

- **`index.html`** is the canonical, directly editable source for the stories, the figures' markup, and the full CV.
- **`assets/site/`** holds the design system and page behaviour:
  - **`site.css`:** the design system.
  - **`hero.css`:** hero and chat styles.
  - **`entrance.js`** and **`entrance.css`:** the homepage's retrieval-first entrance and content-sized mobile chat.
  - **`site.js`:** navigation, theme sync, scroll reveals, and count-ups.
  - **`field.js`:** the hero's embedding field, a 3D HNSW-style graph drawn across three blurred depth planes.
  - **`diversity.js`**, **`agentic.js`**, and **`quantization.js`:** the Work figures.
  - The self-hosted fonts, with their OFL licences.
- **`chat-content.js`** holds the hero's scripted copy: the opening questions, thoughts, answers, citations, and the field documents each answer draws on. **`index.js`** runs the homepage chat: it samples that copy, offers follow-up chips, and tells the field what to search. **`chat-core.js`** is the shared streaming engine and theme toggle used by the homepage and **`404.html`**/**`404.js`**. None of them calls a model or a backend.
- **`assets/og.png`** is the 1200×630 social card. If the name or role changes, re-render it to match.

Update CV content in `index.html`; the hero's questions and responses live in `chat-content.js`. Motion respects `prefers-reduced-motion`: reveals, count-ups, and figure autoplay are skipped, and everything stays usable.

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
ordering, mobile growth, reduced motion, interruptions, and the 404 page.

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
