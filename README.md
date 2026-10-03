# Robert Lee's website

The homepage is an editorial, single-page profile: a scripted chat hero, selected engineering stories with interactive figures, and a complete static CV, in light and dark themes.

## Content and presentation

- **`index.html`** is the canonical, directly editable source for the selected stories and complete CV. The page flows from the interactive hero to the personal introduction, selected engineering, and full experience. The experience summaries separate the role from the company and team.
- **`assets/site/`** holds the design system (`site.css`), the hero and chat styles (`hero.css`), page behaviour (`site.js`), the interactive figures, and the self-hosted fonts with their OFL licences.
- **`index.js`** authors the hero's prompts, thoughts, and answers; **`chat-core.js`** is the shared streaming engine and theme toggle used by the homepage and **`404.html`**/**`404.js`**. Neither calls a model or backend.

Update CV content in `index.html`. The hero's responses are authored separately in `index.js`.

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
