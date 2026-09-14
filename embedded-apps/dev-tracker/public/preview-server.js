// Zero-dependency local preview server for Dev Tracker's static files (public/) — no monorepo
// build, no dist/, no Express hub server needed. Serves the folder this file lives in under the
// same /apps/dev-tracker/ URL prefix the real app uses, on port 8081 — the same port
// backend/server.js already falls back to for FRONTEND_ORIGIN when nothing else is configured, so
// CORS to the real production API (hardcoded in home.js/app.js/resource-utilization.js) should
// already be allowed from here without any extra setup.
//
// Usage: node preview-server.js   (run from inside embedded-apps/dev-tracker/public/)
// Then open: http://localhost:8081/apps/dev-tracker/
//
// This hits the REAL production API for data (it's a hardcoded URL in the app's own JS) — so
// what you see here is live data, not mock data. It does not read/write anything else on this
// machine and does not touch any other app in the monorepo.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = 8081;
const PREFIX = '/apps/dev-tracker/';

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  let p = url.parse(req.url).pathname;

  if (p === '/apps/dev-tracker' || p === PREFIX) p = PREFIX + 'index.html';
  if (p === '/') { res.writeHead(302, { Location: PREFIX }); return res.end(); }

  if (!p.startsWith(PREFIX)) {
    res.writeHead(404); return res.end('Not found — try ' + PREFIX);
  }

  let rel = p.slice(PREFIX.length);
  if (rel === '' || rel === 'dashboard' || rel === 'admin' || rel === 'resource-utilization') {
    // Folder-style routes (matches what scripts/build.js does for the real dist build) resolve to
    // that page's own .html file directly, since this preview has no folder/index.html nesting.
    rel = (rel || 'index') + '.html';
  }

  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found: ' + rel); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dev Tracker preview running at http://localhost:${PORT}${PREFIX}`);
});
