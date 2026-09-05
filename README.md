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

Open `http://127.0.0.1:4173/` for the homepage or `/design-spikes/` for the retained studies. There is no build step.
