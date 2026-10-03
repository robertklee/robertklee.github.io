'use strict';

const { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = __dirname;
const output = join(root, 'dist');
const publicFiles = [
  'index.html',
  '404.html',
  'chat-core.js',
  'chat-content.js',
  'index.js',
  '404.js',
  'robots.txt',
  'sitemap.xml',
  'assets/battlesnake.png',
  'assets/favicon.png',
  'assets/me.jpg',
  'assets/me.webp',
  'assets/microsoft-mark.svg',
  'assets/og.png',
  'assets/monocular-depth.webp',
  'assets/road-seg.webp',
  'assets/skateboarder-pred.webp',
  'r/docs/doc-5634fc2f46e355462f3f00ea422ab133.pdf',
];
const publicDirectories = ['assets/site'];

const siteUrl = new URL(process.env.SITE_URL ?? 'https://www.robertkl.com/');
if (!['http:', 'https:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password ||
    siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash) {
  throw new Error('SITE_URL must be an HTTP(S) origin without credentials, a path, a query, or a fragment.');
}

const socialTags = new Set();
const homepage = readFileSync(join(root, 'index.html'), 'utf8').replace(
  /(<meta (?:property|name)="(og:url|og:image|twitter:image)" content=")([^"]+)(")/g,
  (_, prefix, tag, value, suffix) => {
    if (socialTags.has(tag)) throw new Error(`Duplicate social URL meta tag: ${tag}`);
    socialTags.add(tag);
    const url = new URL(value);
    url.protocol = siteUrl.protocol;
    url.host = siteUrl.host;
    return prefix + url.href + suffix;
  }
);
if (socialTags.size !== 3) {
  throw new Error('Expected og:url, og:image, and twitter:image meta tags in index.html.');
}

rmSync(output, { recursive: true, force: true });

for (const relativePath of publicFiles) {
  const destination = join(output, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  if (relativePath === 'index.html') writeFileSync(destination, homepage);
  else copyFileSync(join(root, relativePath), destination);
}

for (const relativePath of publicDirectories) {
  cpSync(join(root, relativePath), join(output, relativePath), { recursive: true });
}

console.log(`Built ${publicFiles.length} static files and ${publicDirectories.length} asset directory in dist/.`);
