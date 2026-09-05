'use strict';

const { copyFileSync, cpSync, mkdirSync, rmSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = __dirname;
const output = join(root, 'dist');
const publicFiles = [
  'index.html',
  'profile-source.html',
  '404.html',
  'styles.css',
  'granim.min.js',
  'chat-core.js',
  'index.js',
  '404.js',
  'robots.txt',
  'sitemap.xml',
  'assets/airplane.jpg',
  'assets/airplane.webp',
  'assets/battlesnake.png',
  'assets/favicon.png',
  'assets/me.jpg',
  'assets/me.webp',
  'assets/microsoft.png',
  'assets/microsoft-mark.svg',
  'assets/monocular-depth.jpg',
  'assets/monocular-depth.webp',
  'assets/road-seg.jpg',
  'assets/road-seg.webp',
  'assets/skateboarder-pred.jpg',
  'assets/skateboarder-pred.webp',
  'assets/snow.jpg',
  'r/docs/doc-5634fc2f46e355462f3f00ea422ab133.pdf',
];
const publicDirectories = ['assets/portfolio'];

rmSync(output, { recursive: true, force: true });

for (const relativePath of publicFiles) {
  const destination = join(output, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, relativePath), destination);
}

for (const relativePath of publicDirectories) {
  cpSync(join(root, relativePath), join(output, relativePath), { recursive: true });
}

console.log(`Built ${publicFiles.length} static files and ${publicDirectories.length} asset directory in dist/.`);
