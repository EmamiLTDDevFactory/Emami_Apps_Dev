// No bundler needed (plain HTML/CSS/JS) — this just lays the static files out in the
// folder-based shape scripts/build-embedded-apps.js expects (see its isFolderBased check):
// dist/apps/dev-tracker/, with dashboard.html pre-nested as dashboard/index.html so the
// hub's flat-HTML restructuring pass has nothing left to do for this app.
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');
const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(DIST, 'apps', 'dev-tracker');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'dashboard'), { recursive: true });

fs.copyFileSync(path.join(PUBLIC, 'index.html'), path.join(OUT, 'index.html'));
fs.copyFileSync(path.join(PUBLIC, 'dashboard.html'), path.join(OUT, 'dashboard', 'index.html'));
['style.css', 'home.css', 'app.js', 'home.js'].forEach((f) => {
  fs.copyFileSync(path.join(PUBLIC, f), path.join(OUT, f));
});

console.log('Dev Tracker: static files copied to dist/apps/dev-tracker/');
