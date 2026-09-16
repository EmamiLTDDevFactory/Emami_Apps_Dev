// `next build` with output:'export' writes its static site to out/ — the repo root's
// scripts/build-embedded-apps.js expects every embedded app's build output at <app>/dist/ (same
// convention every sibling app's own bundler is configured to produce directly), so this just
// moves it there as the last build step. Verbatim copy of fm-po-deviation's own script.
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(outDir)) {
  console.error('next build did not produce an out/ directory — check output: "export" in next.config.js');
  process.exit(1);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.renameSync(outDir, distDir);
console.log('Moved out/ -> dist/');
