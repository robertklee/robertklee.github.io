# Robert Lee's website

The homepage is the royal-blue editorial design, with the original chip-driven introduction, an animated mountain backdrop, and a complete static CV.

## Content and presentation

- **`index.html`** is the canonical, directly editable source for the selected stories and complete CV. The experience summaries separate the role from the company and team.
- **`assets/portfolio/`** contains the shared theme, hero presentation, navigation, and profile interactions. The homepage does not fetch its own content; the design studies import its CV sections.
- **`profile-source.html`** preserves the previous homepage as a `noindex` reference and isolated host for the original hero. Its `index.js`, `chat-core.js`, and `styles.css` dependencies remain unchanged.
- **`design-spikes/`** retains all nine internal design studies. They are separate from and not linked by the production homepage.

Update CV content in `index.html`, not in the historical reference. The hero's prewritten responses are authored separately in `index.js`; they do not call a model or backend.

## Local preview

Serve the repository root over HTTP, for example:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` for the homepage or `/design-spikes/` for the retained studies.

Run `npm run build` to create the production `dist/` directory. The production build publishes root `index.html` and its runtime assets; it intentionally excludes `design-spikes/`.

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
