'use strict';

const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'preview.spec.js',
  workers: 1,
  use: { viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
