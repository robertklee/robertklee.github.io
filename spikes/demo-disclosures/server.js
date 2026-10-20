'use strict';

const { createServer } = require('node:http');
const { readFile } = require('node:fs');
const { resolve, sep, extname } = require('node:path');

const root = resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const publicFiles = new Set(['index.html', '404.html', 'index.js', '404.js', 'chat-core.js', 'chat-content.js', 'robots.txt', 'sitemap.xml']);

function createPreviewServer() {
  return createServer((request, response) => {
    let url;
    let pathname;
    try {
      url = new URL(request.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    }
    catch (error) {
      console.warn('Invalid preview URL:', error.message);
      response.writeHead(400).end('Invalid URL');
      return;
    }
    const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
    const allowed = publicFiles.has(file.slice(root.length + 1)) ||
      ['assets', 'r', 'spikes/demo-disclosures'].some(directory => file.startsWith(resolve(root, directory) + sep));
    if (!allowed) { response.writeHead(403).end('Not a preview asset'); return; }
    readFile(file, (error, content) => {
      if (error) {
        if (error.code !== 'ENOENT') console.error(error);
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code);
        return;
      }
      // Only comparison frames start from the pre-disclosure layout; the homepage is untouched.
      if (file === resolve(root, 'index.html') && url.searchParams.has('demo-spike')) {
        content = content.toString().replace('<body data-demo-previews>', '<body>');
      }
      response.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      }).end(content);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4175);
  const server = createPreviewServer();
  server.on('error', error => { console.error('Preview server failed:', error); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Demo disclosure spike: http://127.0.0.1:${server.address().port}/spikes/demo-disclosures/`);
  });
}

module.exports = { createPreviewServer };
