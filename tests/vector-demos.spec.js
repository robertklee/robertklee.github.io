'use strict';

const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile, readFileSync } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

let server;
let origin;
const errors = new WeakMap();
test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test.beforeAll(async () => {
  const output = resolve(__dirname, '../dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(output, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    if (!file.startsWith(output + sep)) { response.writeHead(403).end(); return; }
    readFile(file, (error, content) => {
      if (error) {
        if (error.code !== 'ENOENT') console.error(error);
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code);
        return;
      }
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(content);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto(origin);
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

const setRange = async (page, selector, value) => {
  await page.locator(selector).evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
};
const setQuery = (page, x, y) => page.locator('[data-hn-plot]').evaluate((plot, query) => {
  plot.scrollIntoView({ block: 'center', behavior: 'instant' });
  const position = new DOMPoint(query.x, 370 + query.y * 0.9).matrixTransform(plot.getScreenCTM());
  // MouseEventInit truncates coordinates; keep fractional pixels for exact geometry cases.
  const event = new MouseEvent('click', { bubbles: true });
  Object.defineProperties(event, { clientX: { value: position.x }, clientY: { value: position.y } });
  plot.dispatchEvent(event);
}, { x, y });

const graphModel = page => page.locator('[data-hn-plot]').evaluate(plot => ({
  query: { x: Number(plot.dataset.queryX), y: Number(plot.dataset.queryY) },
  points: [...plot.querySelectorAll('.hn-node[data-layer="0"]')].map(node => ({
    id: Number(node.dataset.id), label: node.textContent, x: Number(node.dataset.x), y: Number(node.dataset.y)
  })),
  levels: [...plot.querySelectorAll('.hn-level')].reverse().map(group => ({
    ids: [...group.querySelectorAll('.hn-node')].map(node => Number(node.dataset.id)),
    edges: [...group.querySelectorAll('.hn-edge')].map(edge => [Number(edge.dataset.from), Number(edge.dataset.to)])
  }))
}));

function searchReference(model, ef) {
  const distances = model.points.map(point => Math.hypot(point.x - model.query.x, point.y - model.query.y));
  const checked = new Set();
  const compare = (a, b) => distances[a] - distances[b] || a - b;
  const adjacency = model.levels.map(level => {
    const neighbours = new Map(level.ids.map(id => [id, []]));
    level.edges.forEach(([a, b]) => { neighbours.get(a).push(b); neighbours.get(b).push(a); });
    return neighbours;
  });
  let entry = 0;
  checked.add(entry);
  for (let level = adjacency.length - 1; level > 0; level--) {
    while (true) {
      const neighbours = adjacency[level].get(entry);
      neighbours.forEach(id => checked.add(id));
      const next = [entry, ...neighbours].sort(compare)[0];
      if (distances[next] >= distances[entry]) break;
      entry = next;
    }
  }
  const visited = new Set([entry]);
  let frontier = [entry];
  let retained = [entry];
  while (frontier.length) {
    frontier.sort(compare);
    const current = frontier.shift();
    const worst = retained[retained.length - 1];
    if (retained.length === ef && distances[current] > distances[worst]) break;
    for (const id of adjacency[0].get(current)) {
      if (visited.has(id)) continue;
      visited.add(id);
      checked.add(id);
      if (retained.length < ef || distances[id] < distances[retained[retained.length - 1]]) {
        frontier.push(id);
        retained = [...retained, id].sort(compare).slice(0, ef);
      }
    }
  }
  return { results: retained.slice(0, 3).map(id => model.points[id].label), checks: checked.size };
}

function exactReference(model) {
  const ranked = model.points.map(point => ({
    ...point, distance: Math.hypot(point.x - model.query.x, point.y - model.query.y)
  })).sort((a, b) => a.distance - b.distance || a.id - b.id);
  const cutoff = ranked[2].distance;
  const tied = point => Math.abs(point.distance - cutoff) <= 8 * Number.EPSILON *
    Math.max(1, cutoff, point.distance, Math.abs(model.query.x) + Math.abs(point.x), Math.abs(model.query.y) + Math.abs(point.y));
  return {
    exact: ranked.slice(0, 3).map(point => point.label),
    required: ranked.filter(point => point.distance < cutoff && !tied(point)).map(point => point.label),
    boundary: ranked.filter(tied).map(point => point.label)
  };
}

test('SIMD computes dot products of unit vectors for every candidate and lane width', async ({ page }) => {
  for (const sample of ['near', 'far', 'opposite']) {
    await page.locator(`[data-si-sample="${sample}"]`).click();
    for (const lanes of [4, 8]) {
      await page.locator(`[data-si-lanes="${lanes}"]`).click();
      const values = await page.evaluate(() => ({
        query: [...document.querySelectorAll('[data-si-query] span')].map(node => Number(node.title)),
        candidate: [...document.querySelectorAll('[data-si-candidate] span')].map(node => Number(node.title)),
        displayed: [...document.querySelectorAll('.si-inputs span')].map(node => ({ value: Number(node.title), text: node.textContent }))
      }));
      expect(Math.hypot(...values.query)).toBeCloseTo(1, 12);
      expect(Math.hypot(...values.candidate)).toBeCloseTo(1, 12);
      values.displayed.forEach(({ value, text }) => expect(text).toBe(value.toFixed(3)));
      const products = values.query.map((value, i) => value * values.candidate[i]);
      const expected = products.reduce((sum, product) => sum + product, 0);
      expect(Number(await page.locator('[data-si-scalar-total]').textContent())).toBeCloseTo(expected, 5);
      expect(Number(await page.locator('[data-si-vector-total]').textContent())).toBeCloseTo(expected, 5);
      expect(expected).toBeGreaterThanOrEqual(-1 - 1e-12);
      expect(expected).toBeLessThanOrEqual(1 + 1e-12);
      if (sample === 'opposite') {
        expect(expected).toBeCloseTo(-1, 12);
        await expect(page.locator('[data-si-vector-total]')).toHaveText('-1.00000');
      }
      if (sample === 'near') expect(expected).toBeGreaterThan(0.98);
      for (const kind of ['scalar', 'vector']) {
        expect(await page.locator(`[data-si-${kind}-terms] span`).allTextContents()).toEqual(products.map(product => product.toFixed(3)));
      }
      const partials = Array(lanes).fill(0);
      products.forEach((product, i) => { partials[i % lanes] += product; });
      expect(await page.locator('[data-si-accumulators] strong').allTextContents()).toEqual(partials.map(sum => sum.toFixed(3)));
      await expect(page.locator('[data-si-scalar-ops]')).toHaveText('16 / 16 MAC operations');
      await expect(page.locator('[data-si-vector-ops]')).toHaveText(`${16 / lanes} / ${16 / lanes} vector MAC operations`);
      await expect(page.locator('[data-si-accumulators] > span')).toHaveCount(lanes);
      await expect(page.locator('[data-si-reduction]')).toHaveText(`Complete: ${lanes} lanes to one sum`);
      await expect(page.locator('[data-si-scalar-terms] .is-done')).toHaveCount(16);
      await expect(page.locator('[data-si-vector-terms] .is-done')).toHaveCount(16);
      await expect(page.locator('[data-si-live]')).toContainText('equal to cosine similarity');
    }
  }
});

test('SIMD reduces the packed accumulator only after all vector MAC operations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const lanes of [4, 8]) {
    await page.locator(`[data-si-lanes="${lanes}"]`).evaluate(button => button.click());
    await expect(page.locator('[data-si-vector-total]')).toHaveText('--');
    await expect(page.locator('[data-si-reduction]')).toHaveText('Waiting for lane sums');
    await page.clock.runFor(200 * (16 / lanes));
    await expect(page.locator('[data-si-vector-ops]')).toHaveText(`${16 / lanes} / ${16 / lanes} vector MAC operations`);
    await expect(page.locator('[data-si-vector-terms] .is-done')).toHaveCount(16);
    await expect(page.locator('[data-si-vector-total]')).toHaveText('--');
    await expect(page.locator('[data-si-reduction]')).toHaveText(`Ready: combine ${lanes} lanes`);
    await expect(page.locator('[data-si-status]')).toContainText('horizontal reduction is still pending');
    await page.clock.runFor(200);
    await expect(page.locator('[data-si-reduction]')).toHaveText(`Complete: ${lanes} lanes to one sum`);
    await expect(page.locator('[data-si-vector-total]')).not.toHaveText('--');
    await expect(page.locator('[data-si-accumulators] .is-reducing')).toHaveCount(lanes);
    await expect(page.locator('[data-si-scalar-ops]')).toHaveText(`${16 / lanes + 1} / 16 MAC operations`);
    await page.clock.runFor(4000);
    await expect(page.locator('[data-si-accumulators] .is-reducing')).toHaveCount(0);
    await expect(page.locator('[data-si-vector-total]')).toHaveText(await page.locator('[data-si-scalar-total]').textContent());
  }
});

test('HNSW has four nested levels and valid descent points between all adjacent levels', async ({ page }) => {
  const hierarchy = await page.locator('.hn-level').evaluateAll(groups => groups.map(group => ({
    level: Number(group.dataset.level),
    ids: [...group.querySelectorAll('.hn-node')].map(node => Number(node.dataset.id))
  })));
  expect(hierarchy.map(group => group.level)).toEqual([3, 2, 1, 0]);
  expect(hierarchy.map(group => group.ids.length)).toEqual([2, 4, 8, 24]);
  for (let index = 0; index < hierarchy.length - 1; index++) {
    hierarchy[index].ids.forEach(id => expect(hierarchy[index + 1].ids).toContain(id));
  }
  const descents = await page.locator('.hn-descent').evaluateAll(lines => lines.map(line => ({
    from: Number(line.dataset.fromLevel), to: Number(line.dataset.toLevel),
    id: Number(line.dataset.entry), display: line.style.display
  })));
  expect(descents.map(step => [step.from, step.to])).toEqual([[3, 2], [2, 1], [1, 0]]);
  descents.forEach(step => {
    expect(step.display).toBe('');
    expect(hierarchy.find(group => group.level === step.from).ids).toContain(step.id);
    expect(hierarchy.find(group => group.level === step.to).ids).toContain(step.id);
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.evaluate(() => {
    window.hnswLevels = [];
    window.hnswPools = [];
    new MutationObserver(() => {
      const current = document.querySelector('.hn-node.is-current');
      if (!current) return;
      const level = Number(current.dataset.layer);
      if (window.hnswLevels.at(-1) !== level) window.hnswLevels.push(level);
      const pool = document.querySelector('[data-hn-status]').textContent.match(/retained (\d+)\/(\d+), frontier (\d+)/);
      if (pool) window.hnswPools.push(pool.slice(1).map(Number));
    }).observe(document.querySelector('[data-hnsw-demo] .vector-demo-body'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('[data-hn-replay]').evaluate(button => button.click());
  await page.clock.runFor(10000);
  expect(await page.evaluate(() => window.hnswLevels)).toEqual([3, 2, 1, 0]);
  const pools = await page.evaluate(() => window.hnswPools);
  expect(pools.length).toBeGreaterThan(0);
  pools.forEach(([retained, ef, frontier]) => {
    expect(retained).toBeGreaterThanOrEqual(1);
    expect(retained).toBeLessThanOrEqual(ef);
    expect(ef).toBe(3);
    expect(frontier).toBeGreaterThanOrEqual(0);
  });
});

test('HNSW matches a SEARCH-LAYER reference for every supported pool size', async ({ page }) => {
  for (const preset of ['right', 'middle', 'left']) {
    await page.locator(`[data-hn-query="${preset}"]`).click();
    const model = await graphModel(page);
    for (let ef = 3; ef <= 24; ef++) {
      await setRange(page, '#hn-ef', ef);
      const reference = searchReference(model, ef);
      await expect(page.locator('[data-hn-results]')).toHaveText(reference.results.join(', '));
      await expect(page.locator('[data-hn-checks]')).toHaveText(`${reference.checks} of 24`);
    }
  }
});

test('HNSW reports real recall and finds the exact nearest three with a full candidate pool', async ({ page }) => {
  for (const preset of ['right', 'middle', 'left']) {
    await page.locator(`[data-hn-query="${preset}"]`).click();
    for (const ef of [3, 6, 24]) {
      await setRange(page, '#hn-ef', ef);
      const truth = await page.locator('[data-hn-plot]').evaluate(plot => {
        const x = Number(plot.dataset.queryX);
        const y = Number(plot.dataset.queryY);
        return [...plot.querySelectorAll('.hn-node[data-layer="0"]')].map(node => ({
          label: node.textContent, id: Number(node.dataset.id),
          distance: Math.hypot(Number(node.dataset.x) - x, Number(node.dataset.y) - y)
        })).sort((a, b) => a.distance - b.distance || a.id - b.id).slice(0, 3).map(node => node.label);
      });
      const results = (await page.locator('[data-hn-results]').textContent()).split(', ');
      expect(new Set(results).size).toBe(3);
      await expect(page.locator('[data-hn-exact]')).toHaveText(truth.join(', '));
      await expect(page.locator('[data-hn-recall]')).toHaveText(`${results.filter(label => truth.includes(label)).length} of 3`);
      await expect(page.locator('.hn-node[data-layer="0"].is-result')).toHaveCount(3);
      const checks = Number((await page.locator('[data-hn-checks]').textContent()).split(' of ')[0]);
      expect(checks).toBeGreaterThan(ef === 3 ? 3 : 0);
      expect(checks).toBeLessThanOrEqual(24);
      if (preset === 'middle' && ef === 3) {
        await expect(page.locator('[data-hn-recall]')).toHaveText('1 of 3');
        await expect(page.locator('.hn-node.is-missed')).toHaveCount(2);
        expect(checks).toBe(9);
      }
      if (preset === 'middle' && ef === 6) {
        await expect(page.locator('[data-hn-recall]')).toHaveText('3 of 3');
        await expect(page.locator('.hn-node.is-missed')).toHaveCount(0);
        expect(checks).toBe(15);
      }
      if (ef === 24) {
        expect(results).toEqual(truth);
        expect(checks).toBe(24);
      }
    }
  }
  const plot = page.locator('[data-hn-plot]');
  const box = await plot.boundingBox();
  await plot.click({ position: { x: box.width * 0.6, y: box.height * 0.8 } });
  await expect(page.locator('[data-hn-query][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hn-recall]')).toHaveText('3 of 3');
});

test('HNSW handles cutoff ties and queries at every stored point', async ({ page }) => {
  await setQuery(page, 88, 75);
  for (const ef of [3, 6, 24]) {
    await setRange(page, '#hn-ef', ef);
    const model = await graphModel(page);
    const truth = exactReference(model);
    expect(truth.required).toEqual(['B', 'D']);
    expect(new Set(truth.boundary), JSON.stringify(model.query)).toEqual(new Set(['A', 'E']));
    const results = (await page.locator('[data-hn-results]').textContent()).split(', ');
    expect(results.slice(0, 2)).toEqual(['B', 'D']);
    expect(truth.boundary).toContain(results[2]);
    await expect(page.locator('[data-hn-recall]')).toHaveText('3 of 3');
    await expect(page.locator('.hn-node.is-missed')).toHaveCount(0);
    await expect(page.locator('[data-hn-ties]')).toBeVisible();
    await expect(page.locator('[data-hn-ties]')).toContainText('1 remaining place');
  }
  await expect(page.locator('[data-hn-live]')).toContainText('Cutoff tie');
  await page.locator('#hn-ef').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#hn-ef')).toHaveValue('3');
  await page.keyboard.press('End');
  await expect(page.locator('#hn-ef')).toHaveValue('24');
  const model = await graphModel(page);
  for (const point of model.points) {
    await setQuery(page, point.x, point.y);
    const truth = exactReference(await graphModel(page));
    await expect(page.locator('[data-hn-results]')).toHaveText(truth.exact.join(', '));
    expect(truth.exact[0]).toBe(point.label);
    await expect(page.locator('[data-hn-checks]')).toHaveText('24 of 24');
    await expect(page.locator('[data-hn-recall]')).toHaveText('3 of 3');
    await expect(page.locator('.hn-node.is-missed')).toHaveCount(0);
  }
});

test('HNSW credits alternative tied neighbour sets without marking a false miss', async ({ page }) => {
  const model = await graphModel(page);
  const queries = model.points.flatMap((point, index) => model.points.slice(index + 1).map(other => ({
    x: (point.x + other.x) / 2, y: (point.y + other.y) / 2
  }))).filter(query => {
    const truth = exactReference({ ...model, query });
    return truth.boundary.length > 3 - truth.required.length;
  });
  expect(queries.length).toBeGreaterThan(0);
  let alternativeCredited = false;
  for (const query of queries) {
    await setQuery(page, query.x, query.y);
    const truth = exactReference(await graphModel(page));
    const results = (await page.locator('[data-hn-results]').textContent()).split(', ');
    const hits = results.filter(label => truth.required.includes(label)).length +
      Math.min(3 - truth.required.length, results.filter(label => truth.boundary.includes(label)).length);
    await expect(page.locator('[data-hn-recall]')).toHaveText(`${hits} of 3`);
    await expect(page.locator('.hn-node.is-missed')).toHaveCount(3 - hits);
    if (hits === 3 && results.some(label => !truth.exact.includes(label))) {
      alternativeCredited = true;
      await expect(page.locator('[data-hn-ties]')).toBeVisible();
      break;
    }
  }
  expect(alternativeCredited).toBe(true);
});

test('HNSW labels the query, marks its search area, and explains the comparison counts', async ({ page }) => {
  await expect(page.locator('.hn-query-diamond')).toHaveCount(4);
  await expect(page.locator('.hn-query-letter')).toHaveText(Array(4).fill('Q'));
  await expect(page.locator('.hn-query-label')).toHaveText('Query vector');
  await expect(page.locator('#hn-query-help')).toContainText('click or tap inside the outlined Level 0 graph');
  await expect(page.locator('.hn-search-hint')).toContainText('MOVE THE QUERY AND SEARCH');
  await expect(page.locator('.hn-stats dt')).toHaveText(['Vectors compared', 'Nearest 3 found']);
  await expect(page.locator('.hn-results')).toContainText('True nearest 3 · all 24 compared');
  await expect(page.locator('[data-hn-live]')).toContainText('vectors compared');
  await expect(page.locator('[data-hn-live]')).toContainText('Found 3 of 3 true nearest neighbours');
  const plot = page.locator('[data-hn-plot]');
  await expect(page.locator('.hn-level[data-level="0"]')).toHaveCSS('cursor', 'crosshair');
  const original = (await graphModel(page)).query;
  const box = await plot.boundingBox();
  await plot.click({ position: { x: box.width * 0.3, y: box.height * 0.2 } });
  expect((await graphModel(page)).query).toEqual(original);
  await plot.click({ position: { x: box.width * 0.4, y: box.height * 0.8 } });
  const next = (await graphModel(page)).query;
  expect(Math.abs(next.x - 224)).toBeLessThan(2);
  expect(Math.abs(next.y - (512 - 370) / 0.9)).toBeLessThan(2);
  await expect(page.locator('[data-hn-query][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hn-status]')).toContainText('Search complete');
});

test('HNSW keyboard query movement stays inside the base graph and updates the results', async ({ page }) => {
  const plot = page.locator('[data-hn-plot]');
  await plot.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await graphModel(page)).query).toEqual({ x: 460, y: 160 });
  await page.keyboard.press('ArrowUp');
  expect((await graphModel(page)).query).toEqual({ x: 460, y: 150 });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect((await graphModel(page)).query).toEqual({ x: 470, y: 160 });
  await expect(page.locator('[data-hn-query][aria-pressed="true"]')).toHaveCount(0);
  for (const query of [{ x: 25, y: 25 }, { x: 535, y: 215 }]) {
    await setQuery(page, query.x, query.y);
    await plot.focus();
    await page.keyboard.press(query.x === 25 ? 'ArrowLeft' : 'ArrowRight');
    await page.keyboard.press(query.y === 25 ? 'ArrowUp' : 'ArrowDown');
    expect((await graphModel(page)).query).toEqual(query);
    const reference = searchReference(await graphModel(page), 3);
    await expect(page.locator('[data-hn-results]')).toHaveText(reference.results.join(', '));
  }
});

test.describe('touch query placement', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('HNSW moves its query and searches when the base graph is tapped', async ({ page }) => {
    const plot = page.locator('[data-hn-plot]');
    const box = await plot.boundingBox();
    await plot.tap({ position: { x: box.width * 0.3, y: box.height * 0.8 } });
    const model = await graphModel(page);
    expect(Math.abs(model.query.x - 168)).toBeLessThan(3);
    expect(Math.abs(model.query.y - (512 - 370) / 0.9)).toBeLessThan(3);
    await expect(page.locator('[data-hn-results]')).toHaveText(searchReference(model, 3).results.join(', '));
    await expect(page.locator('[data-hn-status]')).toContainText('Search complete');
  });
});

test('current-role copy describes team technical leadership and qualifies search diversity throughout the chat', async ({ page }) => {
  await expect(page.locator('#experience-role-1-title')).toHaveText('Senior Software Engineer');
  for (const selector of ['.cv-about-copy', '#career-map-desc', '.experience-role-heading', '#profile-work-entry-1', '#work-diversity .chapter-copy']) {
    await expect(page.locator(selector).first()).toContainText(/technical lead for a team of five engineers and scientists/i);
  }
  await expect(page.locator('.cm-step-now .cm-areas')).toContainText('Technical lead');
  await expect(page.locator('.cm-step-now .cm-areas')).toContainText('Vector diversity');
  await expect(page.locator('label[for="dv-diversity"]')).toHaveText('Search diversity');
  const content = await page.evaluate(() => window.HeroChatContent);
  const field = readFileSync(resolve(__dirname, '../assets/site/field.js'), 'utf8');
  expect(field).toContain("label: 'Vector diversity'");
  const fieldDocs = new Set([...field.matchAll(/docs: \[([^\]]+)\]/g)].flatMap(match =>
    [...match[1].matchAll(/'([^']+)'/g)].map(label => label[1])));
  for (const topic of [...content.VARIANTS, ...content.TOPICS]) {
    for (const doc of topic.docs) expect(fieldDocs.has(doc), doc).toBe(true);
    const copy = [topic.thought, topic.answer, ...(topic.prompts || []),
      ...(topic.variants || []).flatMap(variant => [variant.thought, variant.answer])].filter(Boolean).join(' ');
    expect(copy).not.toMatch(/(?:lead|leading|tech-lead|tech-leading) (?:a team of five|five engineers)/i);
    expect(copy).not.toMatch(/technical lead on (?:a new vector-diversity effort|vector diversity)/i);
    expect(copy).not.toMatch(/(?<!vector[- ]|search[- ])\bdiversity\b/i);
    for (const [id, label] of topic.sources || []) {
      if (id === 'work-diversity') expect(label).toBe('Vector diversity');
    }
  }
  for (const variant of content.TOPICS.find(topic => topic.id === 'tech-lead').variants) {
    expect(variant.answer).toContain('Senior Software Engineer');
    expect(variant.answer).toContain('technical lead for a team of five engineers and scientists');
    expect(variant.answer).toContain('technical direction');
    expect(variant.answer).toContain('own delivery');
    expect(variant.answer).toContain('hands-on implementation');
  }
  const missingSources = await page.evaluate(() => window.HeroChatContent.TOPICS.flatMap(topic =>
    (topic.sources || []).map(([id]) => id)).filter(id => !document.getElementById(id)));
  expect(missingSources).toEqual([]);
});

test('the chosen demos are permanent Work chapters with valid headings and citations', async ({ page }) => {
  await expect(page.locator('#work .chapter')).toHaveCount(5);
  await expect(page.locator('.experience-role').nth(0).locator('.chapter')).toHaveCount(2);
  await expect(page.locator('.experience-role').nth(1).locator('.chapter')).toHaveCount(3);
  await expect(page.locator('.chapter-contribution-label')).toHaveCount(5);
  await expect(page.locator('.figure-illustration-label')).toHaveText(Array(5).fill('Interactive concept illustration'));
  await expect(page.locator('#work .chapter-num')).toHaveText(['01', '02', '03', '04', '05']);
  await expect(page.locator('#vector-spikes, #spike-hybrid, [data-hybrid-spike]')).toHaveCount(0);
  const references = await page.evaluate(() => ({
    duplicateIds: [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
    missingLabels: [...document.querySelectorAll('[aria-labelledby], [aria-describedby]')].flatMap(node =>
      ['aria-labelledby', 'aria-describedby'].flatMap(attribute =>
        (node.getAttribute(attribute) || '').split(/\s+/).filter(id => id && !document.getElementById(id))))
  }));
  expect(references).toEqual({ duplicateIds: [], missingLabels: [] });
  for (const id of ['work-simd', 'work-hnsw']) {
    await page.goto(`${origin}/#${id}`);
    const card = page.locator(`#${id}`);
    await expect(card).toBeVisible();
    const position = await card.evaluate(node => ({
      top: node.getBoundingClientRect().top,
      headerBottom: document.querySelector('.site-header').getBoundingClientRect().bottom
    }));
    expect(position.top).toBeGreaterThanOrEqual(position.headerBottom - 1);
    expect(position.top).toBeLessThan(200);
  }
  const topics = await page.evaluate(() => window.HeroChatContent.TOPICS.filter(topic => ['simd', 'reliability'].includes(topic.id))
    .map(topic => ({ id: topic.id, sources: topic.sources })));
  expect(topics.find(topic => topic.id === 'simd').sources).toContainEqual(['work-simd', 'SIMD distance kernels']);
  expect(topics.find(topic => topic.id === 'reliability').sources).toContainEqual(['work-hnsw', 'HNSW graph search']);
});

test('experience, examples, full role details, and biography stay connected', async ({ page }) => {
  expect(await page.locator('main > section').evaluateAll(sections => sections.map(section => section.id))).toEqual([
    'top', 'profile-about', 'profile-work', 'profile-projects', 'profile-leadership', 'profile-awards', 'profile-education', 'contact'
  ]);
  expect(await page.locator('#profile-work > .career-map').evaluate(card => card.nextElementSibling.id)).toBe('work');
  await expect(page.locator('#work details.cv-details')).toHaveCount(0);
  await expect(page.locator('#work .experience-details-link')).toHaveCount(2);
  expect(await page.locator('#profile-work-records details.cv-details').evaluateAll(records => records.map(record => record.id))).toEqual([
    'profile-work-entry-1', 'profile-work-entry-2', 'profile-work-entry-3', 'profile-work-entry-4', 'profile-work-entry-5', 'profile-work-entry-6'
  ]);
  await expect(page.locator('#profile-experience #profile-work-records > .cv-record')).toHaveCount(6);
  await expect(page.locator('#profile-work-records .cv-record-title')).toHaveText([
    'Senior Software Engineer, Microsoft Azure AI Search', 'Software Engineer II, Microsoft Azure AI Search',
    'Software Engineer, Microsoft Azure AI Search', 'Software Engineer Intern, Microsoft Azure Cognitive Search',
    'Software Engineer Intern, Microsoft Azure Search (AI Platform)', 'Software Developer Intern, Microsoft Garage'
  ]);
  await expect(page.locator('#profile-experience [data-expand-all]')).toHaveCount(1);
  await expect(page.locator('[class*="spike"], [href*="/spikes/"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await page.locator('.about-more > summary').click();
  await expect(page.locator('.about-more')).toHaveAttribute('open', '');
  await expect(page.locator('.about-more')).toContainText('human pose estimation');
  const expand = page.locator('[data-expand-all][aria-controls="profile-work-records"]');
  await expand.click();
  await expect(page.locator('#profile-work-records details.cv-details[open]')).toHaveCount(6);
  await expand.click();
  await expect(page.locator('#profile-work-records details.cv-details[open]')).toHaveCount(0);
  await page.locator('.site-nav a[href="#work"]').click();
  await expect(page.locator('.site-nav a[href="#work"]')).toHaveAttribute('aria-current', 'location');
  await page.locator('#work-simd .chapter-context a').click();
  await expect(page).toHaveURL(/#profile-work-entry-2$/);
  await expect(page.locator('#profile-work-entry-2')).toHaveAttribute('open', '');
  await expect(page.locator('#profile-work-entry-2')).toBeFocused();
  await page.locator('.site-nav a[href="#profile-work"]').click();
  await expect(page.locator('.site-nav a[href="#profile-work"]')).toHaveAttribute('aria-current', 'location');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`highlight links open consolidated role details and return to examples at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const [index, example] of [[1, 'work-diversity'], [2, 'work-quantization']]) {
      const record = page.locator(`#profile-work-entry-${index}`);
      const link = page.locator(`.experience-role-heading .experience-details-link[href="#profile-work-entry-${index}"]`);
      await expect(link).toContainText('Full role details');
      await link.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`#profile-work-entry-${index}$`));
      await expect(record).toHaveAttribute('open', '');
      await expect(record).toBeFocused();
      await expect(record.locator('.cv-record-body')).toBeVisible();
      expect(await record.evaluate(node => node.closest('section').id)).toBe('profile-experience');
      const position = await record.evaluate(node => ({
        top: node.getBoundingClientRect().top,
        headerBottom: document.querySelector('.site-header').getBoundingClientRect().bottom
      }));
      expect(position.top).toBeGreaterThanOrEqual(position.headerBottom - 1);
      expect(position.top).toBeLessThan(200);
      await record.locator(`a[href="#${example}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${example}$`));
      await expect(page.locator(`#${example}`)).toBeFocused();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#profile-work-entry-${index}$`));
      await expect(record).toHaveAttribute('open', '');
      await page.reload();
      await page.clock.runFor(32);
      await expect(record).toHaveAttribute('open', '');
      await expect(record.locator('.cv-record-body')).toBeVisible();
      const reloadPosition = await record.evaluate(node => ({
        top: node.getBoundingClientRect().top,
        headerBottom: document.querySelector('.site-header').getBoundingClientRect().bottom
      }));
      expect(reloadPosition.top).toBeGreaterThanOrEqual(reloadPosition.headerBottom - 1);
      expect(reloadPosition.top).toBeLessThan(200);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const card of ['.experience-role-heading', '#profile-experience']) {
        const overflow = await page.locator(card).evaluateAll(nodes => nodes.flatMap(node =>
          [node, ...node.querySelectorAll('*')].filter(element => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
          }).map(element => element.className)));
        expect(overflow).toEqual([]);
      }
    }
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`SIMD and HNSW autoplay once, replay, and respect reduced motion at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.reload();
    await page.locator('.si-processors').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.clock.runFor(1400);
    await expect(page.locator('[data-si-vector-ops]')).toHaveText('4 / 4 vector MAC operations');
    await expect(page.locator('[data-si-scalar-ops]')).not.toHaveText('16 / 16 MAC operations');
    await page.clock.runFor(3500);
    await expect(page.locator('[data-si-scalar-ops]')).toHaveText('16 / 16 MAC operations');
    await page.locator('.hn-level[data-level="0"]').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.clock.runFor(400);
    await expect(page.locator('[data-hn-status]')).not.toContainText('Search complete');
    await page.clock.runFor(10000);
    await expect(page.locator('[data-hn-status]')).toContainText('Search complete');
    await page.locator('.si-processors').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.clock.runFor(500);
    await expect(page.locator('[data-si-scalar-ops]')).toHaveText('16 / 16 MAC operations');
    await page.locator('.hn-level[data-level="0"]').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.clock.runFor(300);
    await expect(page.locator('[data-hn-status]')).toContainText('Search complete');
    await page.locator('[data-hn-replay]').click();
    await expect(page.locator('[data-hn-status]')).not.toContainText('Search complete');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('[data-hn-status]')).toContainText('Search complete');
    await page.locator('[data-si-replay]').click();
    await expect(page.locator('[data-si-scalar-ops]')).toHaveText('16 / 16 MAC operations');
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1080, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`vector demos fit in light and dark layouts at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const id of ['work-simd', 'work-hnsw']) {
        await page.locator(`#${id} .chapter-figure`).evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await expect(page.locator(`#${id} .vector-demo-body`)).toBeVisible();
        await page.locator(`#${id} details`).evaluate(node => { node.open = true; });
        const overflow = await page.locator(`#${id}`).evaluate(card => ({
          page: document.documentElement.scrollWidth - innerWidth,
          elements: [...card.querySelectorAll('*')].filter(node => {
            const box = node.getBoundingClientRect();
            return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1);
          }).map(node => node.className.baseVal || node.className)
        }));
        expect(overflow).toEqual({ page: 0, elements: [] });
      }
      for (const query of [{ x: 25, y: 25 }, { x: 535, y: 215 }]) {
        await setQuery(page, query.x, query.y);
        const fits = await page.locator('[data-hn-plot]').evaluate(plot => {
          const label = plot.querySelector('.hn-query-label text');
          const bounds = label.getBBox();
          const position = label.getBoundingClientRect();
          const plotBox = plot.getBoundingClientRect();
          const searchArea = plot.querySelector('.hn-search-area').getBoundingClientRect();
          const background = plot.querySelector('.hn-query-label rect').getBBox();
          return {
            text: bounds.x >= background.x && bounds.x + bounds.width <= background.x + background.width,
            outsideGraph: position.top > searchArea.bottom,
            plot: position.left >= plotBox.left && position.right <= plotBox.right &&
              position.top >= plotBox.top && position.bottom <= plotBox.bottom
          };
        });
        expect(fits).toEqual({ text: true, outsideGraph: true, plot: true });
      }
    }
  });
}

test('the vector explanations and full role links remain usable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/#work`);
    await expect(page.locator('#work [data-vector-fallback]')).toHaveCount(2);
    for (const id of ['work-simd', 'work-hnsw']) {
      await expect(page.locator(`#${id} [data-vector-fallback]`)).toBeVisible();
      await expect(page.locator(`#${id} .vector-demo-body`)).toBeHidden();
      await page.locator(`#${id} details summary`).click();
      await expect(page.locator(`#${id} details p`).first()).toBeVisible();
    }
    for (const index of [1, 2]) {
      await page.locator(`.experience-role-heading .experience-details-link[href="#profile-work-entry-${index}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#profile-work-entry-${index}$`));
      const record = page.locator(`#profile-experience #profile-work-entry-${index}`);
      await expect(record.locator(':scope > summary')).toBeVisible();
      if (await record.getAttribute('open') === null) await record.locator(':scope > summary').click();
      await expect(record.locator('.cv-record-body')).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
