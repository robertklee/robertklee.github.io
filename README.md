# Robert Lee's website

A single-page profile that demonstrates retrieval as well as describing it. A scripted chat hero answers over a live embedding field, three engineering stories each carry an interactive figure, and a complete static CV follows. The site supports light and dark themes. The full profile reads without JavaScript; only the interactive parts need it.

## Page structure

1. **Hero:** a scripted chat over an embedding-field backdrop: an illustrative layered HNSW graph receding in depth of field, with topic regions in focus. Each prompt animates a search that enters deep in the graph, descends the layers, and lands on its nearest neighbours; answers cite their sources. On phones and narrow windows the regions recompose into the bands around the copy, and the search shows through the frosted chat card.
2. **About:** a portrait and a short introduction.
3. **Work:** three chapters, each with a figure:
   - **Diversity:** shopping, grounding, feed, and travel-planning scenarios with a diversity slider over a neighbourhood graph.
   - **Agentic retrieval:** a natural-language request becomes OData filters (`eq`, `ne`, `and`, `or` over categorical fields) and Lucene boosts; anything outside that set is left to ranking.
   - **Quantization:** a value ladder and a memory-at-scale meter.
4. **Experience:** a scope ladder showing how each role widened in scope and breadth (Microsoft Garage set apart from Azure AI Search), then expandable role records.
5. **Projects, Community & mentoring, Education, and Awards.**
6. **Contact:** a closing call to action.

The demos use hand-made, illustrative data. They show the idea behind each piece of work, not production algorithms, schemas, or numbers.

## Content and presentation

- **`index.html`** is the canonical, directly editable source for the stories, the figures' markup, and the full CV.
- **`assets/site/`** holds the design system and page behaviour:
  - **`site.css`:** the design system.
  - **`hero.css`:** hero and chat styles.
  - **`site.js`:** navigation, theme sync, scroll reveals, and count-ups.
  - **`field.js`:** the hero's embedding field, a 3D HNSW-style graph drawn across three blurred depth planes.
  - **`diversity.js`**, **`agentic.js`**, and **`quantization.js`:** the Work figures.
  - The self-hosted fonts, with their OFL licences.
- **`index.js`** authors the hero's prompts, thoughts, answers, and citations. **`chat-core.js`** is the shared streaming engine and theme toggle used by the homepage and **`404.html`**/**`404.js`**. Neither calls a model or a backend.
- **`assets/og.png`** is the 1200×630 social card. If the name or role changes, re-render it to match.

Update CV content in `index.html`; the hero's responses live in `index.js`. Motion respects `prefers-reduced-motion`: reveals, count-ups, and figure autoplay are skipped, and everything stays usable.

When you add a new top-level asset, also add it to `publicFiles` in `build.js`. Everything under `assets/site/` is copied automatically. When you add a script, add it to the `check` script in `package.json`.

## Local preview

Serve the repository root over HTTP, for example:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` for the homepage or `http://127.0.0.1:4173/404.html` for the not-found page.

Run `npm run check` to syntax-check the scripts, and `npm run build` to create the production `dist/` directory with the pages and their runtime assets.

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

For local development, install dependencies with `npm ci`, build with
`npm run build`, and preview the Worker with `npm run preview`.
