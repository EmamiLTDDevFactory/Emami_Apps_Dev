// Tiny static server for the production export (out/) under the app's basePath, no dependency:
//   node tests/e2e/serve.mjs [port]      serves http://localhost:<port>/apps/auditee-response/ from ./out
// Mirrors how the hub serves the app: trailing slashes, index.html per folder, 404.html for the rest.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] ?? 3331);
const root = path.resolve(process.cwd(), 'out');
const base = '/apps/auditee-response';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.map': 'application/json' };

function resolve(urlPath) {
  const rel = decodeURIComponent(urlPath.slice(base.length)).replace(/^\/+/, '');
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return null;
  for (const c of [file, `${file}.html`, path.join(file, 'index.html')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === base) { res.writeHead(308, { Location: `${base}/${url.search}` }); return res.end(); }
  if (!url.pathname.startsWith(`${base}/`)) { res.writeHead(404); return res.end('Not found'); }
  const file = resolve(url.pathname);
  const target = file ?? path.join(root, '404.html');
  res.writeHead(file ? 200 : 404, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).on('error', () => res.end()).pipe(res);
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}${base}/`));
