# Temporary hero entrance playground

Serve the repository root and open `/spikes/hero-entrance/` to compare the
original entrance, depth reveal, signal ignition, camera arrival, recommended
hybrid, and retrieval-first hybrid. Each option describes its choreography and
timing. Controls support replay, themes, phone sizing, reduced motion, content
versus fill-height mobile cards, and full-page previews. The same seeded chat
sample plays across directions.

These remain untracked snapshots for comparison, excluded from production
builds. The real homepage now uses direction 05 with its own production assets.
The previews keep their experimental effect implementations and reuse the
shared chat and field engines.

Check their scripts with:

```sh
node --check spikes/hero-entrance/playground.js
node --check spikes/hero-entrance/entrance.js
```
