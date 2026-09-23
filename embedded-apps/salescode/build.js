// Salescode has no bundler — it's one hand-written index.html. This just reproduces the
// folder-based dist/ shape scripts/build-embedded-apps.js merges into the hub (the same
// dist/apps/<name>/ layout dev-tracker's vite.config.js produces), so the page lands at
// /apps/salescode/.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');
const outDir = path.join(dist, 'apps', 'salescode');

// Only apps/ is wiped, not all of dist/ — build-embedded-apps.js writes its .build-commit
// marker into dist/ right after this finishes.
fs.rmSync(path.join(dist, 'apps'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(outDir, 'index.html'));
console.log('Built dist/apps/salescode/index.html');
