// Static server for the end-to-end tests (no dependencies): the built app at /apps/samadhan/ (dist/) and the pre-v7
// redirect stub at /apps/setu/ (../setu/dist/), like the hub serves them. Usage: node e2e/serve.js [port=3250]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || 3250);
const ROOTS = [
    ['/apps/samadhan', path.join(__dirname, '..', 'dist')],
    ['/apps/setu', path.join(__dirname, '..', '..', 'setu', 'dist')],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = ROOTS.find(([prefix]) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    if (!hit) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    const rel = decodeURIComponent(url.pathname.slice(hit[0].length)) || '/';
    let file = path.normalize(path.join(hit[1], rel));
    if (!file.startsWith(hit[1])) { res.writeHead(400); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`e2e static server on http://localhost:${PORT}`));
