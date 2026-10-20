'use strict';

const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'preview.spec.js',
  outputDir: './test-results',
  workers: 1,
  use: { viewport: { width: 1500, height: 1300 }, reducedMotion: 'reduce' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
