// pdf.js reads PDFs in a web worker. The worker file is copied next to the app (public/, served at
// /apps/order-to-cash/pdf.worker.min.mjs) so the static export needs no bundler magic to find it.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const dest = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');
if (!fs.existsSync(src)) {
  console.error('pdfjs-dist is not installed (run npm install).');
  process.exit(1);
}
fs.copyFileSync(src, dest);
console.log('Copied pdf.worker.min.mjs -> public/');
