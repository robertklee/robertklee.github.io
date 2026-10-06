'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { extname, join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const email = Buffer.from('aGVsbG9Acm9iZXJ0a2wuY29t', 'base64').toString();

test('build minifies deployed JS/CSS without changing sources or other assets', () => {
  const assets = [
    'chat-core.js', 'chat-content.js', 'index.js', '404.js',
    ...readdirSync(join(root, 'assets/site'), { recursive: true })
      .filter(filename => ['.js', '.css'].includes(extname(filename)))
      .map(filename => join('assets/site', filename)),
  ];
  const sources = new Map(assets.map(filename => [filename, readFileSync(join(root, filename))]));
  execFileSync(process.execPath, ['build.js'], {
    cwd: root,
    env: { ...process.env, SITE_URL: 'https://preview.example.com' },
  });

  for (const [filename, source] of sources) {
    const built = readFileSync(join(root, 'dist', filename));
    if (extname(filename) === '.js') {
      assert.ok(!source.includes(email), `${filename} source should not expose the email address`);
      assert.ok(!built.includes(email), `${filename} deployment should not expose the email address`);
    }
    assert.ok(built.length < source.length, `${filename} should be smaller`);
    assert.deepEqual(readFileSync(join(root, filename)), source, `${filename} source should be untouched`);
    if (extname(filename) === '.js') {
      execFileSync(process.execPath, ['--check', join(root, 'dist', filename)]);
    }
  }

  for (const filename of readdirSync(join(root, 'dist'), { recursive: true, withFileTypes: true })) {
    if (!filename.isFile() || ['.js', '.css'].includes(extname(filename.name))) continue;
    const builtPath = join(filename.parentPath, filename.name);
    const relativePath = builtPath.slice(join(root, 'dist').length + 1);
    if (relativePath === 'index.html') continue;
    assert.deepEqual(
      readFileSync(builtPath),
      readFileSync(join(root, relativePath)),
      `${relativePath} should be copied unchanged`
    );
  }

  const homepage = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.ok(!homepage.includes(email), 'homepage should not expose the email address');
  assert.ok(!homepage.includes('mailto:'), 'homepage should not publish email links before activation');
  assert.match(homepage, /property="og:url" content="https:\/\/preview\.example\.com\/"/);
  assert.match(homepage, /property="og:image" content="https:\/\/preview\.example\.com\/assets\/og\.png"/);
  assert.match(homepage, /name="twitter:image" content="https:\/\/preview\.example\.com\/assets\/og\.png"/);
  assert.ok(!readdirSync(join(root, 'dist')).includes('spikes'));
});
