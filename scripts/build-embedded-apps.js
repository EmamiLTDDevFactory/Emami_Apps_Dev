const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const EMBEDDED_APPS_DIR = path.join(__dirname, '..', 'embedded-apps');
const MAIN_DIST = path.join(__dirname, '..', 'dist');

// _expo/ and assets/ are shared static folders using content-hashed
// filenames, so merging them from any embedded app can't collide with the
// hub's own files or another embedded app's.
const SHARED_FOLDERS = ['_expo', 'assets'];

// Bundler-generated asset directory names to ignore when deciding whether an
// app is a pure client-side SPA (see isPureSpa below) — distinct from
// SHARED_FOLDERS, which is only about Expo Router's dist-root merge and just
// happens to overlap with Vite's default 'assets' output name. CRA's
// (react-scripts) equivalent output directory is named 'static', not
// 'assets', so it needs to be recognized here too or a CRA-based embedded app
// (e.g. Audit & CAPA) gets misclassified as NOT a pure SPA.
const BUNDLER_ASSET_DIRS = [...SHARED_FOLDERS, 'static'];

function copyRecursive(src, dest) {
  if (fs.statSync(src).isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * Static hosts (S3/CloudFront/Amplify — no custom server, unlike our
 * server/index.js which only exists for local testing) resolve directory
 * URLs like /apps/expense/login/ to a login/index.html automatically, but
 * never auto-append ".html" to an extensionless URL like /apps/expense/login.
 * Expo Router's static export emits flat files (login.html) instead, so we
 * rewrite them here: every "name.html" becomes "name/index.html". Already-
 * correct index.html files are left alone.
 *
 * This does NOT solve dynamic segments like claim/[id].html — a real claim
 * id such as /apps/expense/claim/12345/ has no matching file on disk no
 * matter how it's restructured. That one still needs an explicit wildcard
 * rewrite rule at the hosting level (see the warning this script prints).
 */
function restructureFlatHtmlToDirectories(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      restructureFlatHtmlToDirectories(full);
    } else if (entry.name.endsWith('.html') && entry.name !== 'index.html') {
      const routeName = entry.name.slice(0, -'.html'.length);
      const routeDir = path.join(dir, routeName);
      fs.mkdirSync(routeDir, { recursive: true });
      fs.renameSync(full, path.join(routeDir, 'index.html'));
    }
  }
}

// Flags any route folder whose name looks like a dynamic segment ("[id]",
// "[slug]", etc.) — these need a wildcard rewrite rule added manually at the
// hosting level; static restructuring can't fix them.
function findDynamicRoutes(dir, routePath, warnings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const childPath = `${routePath}/${entry.name}`;
    if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
      warnings.push(childPath);
    }
    findDynamicRoutes(path.join(dir, entry.name), childPath, warnings);
  }
}

// A true client-side SPA (e.g. RC Portal — Vite + react-router-dom) only
// ever produces one index.html; every other "route" (/consultants/:id, etc.)
// exists purely in client-side JS, never as a file on disk. Detected by:
// the route source dir has no other .html files and no route-shaped
// subfolders besides shared asset dirs. These need a full wildcard fallback
// for the whole app prefix, not just specific dynamic segments.
function isPureSpa(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const htmlFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.html'));
  const nonSharedDirs = entries.filter((e) => e.isDirectory() && !BUNDLER_ASSET_DIRS.includes(e.name));
  return htmlFiles.length === 1 && htmlFiles[0].name === 'index.html' && nonSharedDirs.length === 0;
}

// Runs one shell command to completion, buffering its output instead of
// streaming it live — needed because multiple of these now run concurrently
// (see runWithConcurrency below), and interleaving several npm/bundler
// progress streams line-by-line into one log would be unreadable. Output is
// flushed as one block once the command finishes (and always flushed before
// throwing, so a failing app's install/build log is never lost).
function runCommand(cmd, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, env });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(Object.assign(new Error(`"${cmd}" failed in ${cwd} (exit code ${code})`), { output }));
    });
  });
}

// Runs worker(item) over every item, at most `limit` at a time — plain
// Promise-pool, no new dependency needed for something this small. Order of
// completion isn't relied on anywhere: each app installs/builds into its own
// directory, and the merge step (below, run only after every app is done)
// always walks `apps` in its original order regardless of which finished
// building first, so the final dist/ output is identical to the old
// sequential loop's.
async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

if (!fs.existsSync(EMBEDDED_APPS_DIR)) {
  console.log('No embedded-apps/ directory found, skipping.');
  process.exit(0);
}

const apps = fs
  .readdirSync(EMBEDDED_APPS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

if (apps.length === 0) {
  console.log('No embedded apps to build.');
  process.exit(0);
}

// Each embedded app is its own independent npm project (separate
// node_modules, separate bundler) merged into the hub's dist/ only at the
// very end, so their installs/builds are safe to run in parallel — npm's own
// local cache already tolerates concurrent installs. Defaults to half the
// available CPUs (min 2) to leave headroom for each app's bundler, which can
// spike memory on its own; override with EMBEDDED_APPS_CONCURRENCY if that
// default is wrong for a given build machine.
const defaultConcurrency = Math.max(2, Math.min(apps.length, Math.floor(os.cpus().length / 2) || 1));
const concurrency = Number(process.env.EMBEDDED_APPS_CONCURRENCY) || defaultConcurrency;

async function main() {
  console.log(`\nInstalling and building ${apps.length} embedded app(s), ${concurrency} at a time...`);

  await runWithConcurrency(apps, concurrency, async (app) => {
    const appDir = path.join(EMBEDDED_APPS_DIR, app);
    // Metro's default disk cache (metro-config's FileStore) lives at a single
    // fixed path, `path.join(os.tmpdir(), 'metro-cache')` — the SAME directory
    // for every Metro process on the machine, regardless of which project
    // invoked it. An `expo export --clear` (every embedded app's build script
    // uses it) calls that store's clear(), which rmdir's subdirectories of
    // that shared path — so two embedded apps' Metro processes clearing their
    // (coincidentally same-hash-bucket) cache subdirectory at the same moment
    // can race, one process's rmdir colliding with another's concurrent write
    // into that same subdir ("ENOTEMPTY: directory not empty, rmdir
    // '/tmp/metro-cache/xx'" — seen failing po-followup's build here even
    // though po-followup's own source hadn't changed). Giving each app's
    // child process its own TMPDIR (Node's os.tmpdir() reads this env var)
    // gives it its own private metro-cache root, so concurrent lanes never
    // touch the same cache directory at all.
    const appTmpDir = path.join(os.tmpdir(), 'embedded-build-tmp', app);
    fs.mkdirSync(appTmpDir, { recursive: true });
    const env = { ...process.env, TMPDIR: appTmpDir };

    // Built up as one string and flushed with a single console.log/error call
    // per app — logging the header and the buffered output as two separate
    // calls let another app's lane print in between them (header for one app
    // immediately followed by another app's output), since there's an await
    // in between. One call per app keeps each app's whole block atomic.
    let log = `\n=== [${app}] npm install ===\n`;
    try {
      log += await runCommand('npm install --legacy-peer-deps', appDir, env);
      log += `\n=== [${app}] npm run build ===\n`;
      log += await runCommand('npm run build', appDir, env);
      console.log(log);
    } catch (err) {
      console.error(log + (err.output || ''));
      throw err;
    }
  });

  console.log('\nAll embedded apps installed and built — merging into hub dist/...');

  const dynamicRouteWarnings = [];
  const spaFallbackApps = [];

  for (const app of apps) {
    const appDir = path.join(EMBEDDED_APPS_DIR, app);
    console.log(`\n=== Merging embedded app: ${app} ===`);

    const appDist = path.join(appDir, 'dist');

    // Two possible shapes coming out of an embedded app's own `dist/`:
    //
    // 1. Folder-based (e.g. Non-CTC-Expense): its own routes already live
    //    under `dist/apps/<name>/`, because the app's route folder itself was
    //    renamed to match, but its asset/link references are NOT prefixed
    //    (e.g. "/_expo/static/..."). So `_expo`/`assets` merge at the hub's
    //    dist root, shared across everything, same as the hub's own.
    //
    // 2. baseUrl-based (e.g. DispatchTracker, via Expo Router's
    //    `experiments.baseUrl`): ALL references — routes, JS bundle, assets —
    //    are already prefixed with /apps/<name>/, but the output *files* still
    //    land at the dist root (dist/login.html, dist/_expo/, etc.) — baseUrl
    //    only rewrites references, not where Expo Router writes files. So here
    //    WE nest everything (routes AND _expo/assets) under dist/apps/<name>/
    //    ourselves, to match what the HTML actually expects to find there.
    const appsRoot = path.join(appDist, 'apps');
    const isFolderBased = fs.existsSync(appsRoot);
    const routeSourceDir = isFolderBased ? appsRoot : appDist;
    const mergeTarget = isFolderBased ? path.join(MAIN_DIST, 'apps') : path.join(MAIN_DIST, 'apps', app);

    console.log(`Restructuring ${app}'s flat .html routes into route/index.html...`);
    restructureFlatHtmlToDirectories(routeSourceDir);

    const routePrefix = isFolderBased ? '/apps' : `/apps/${app}`;
    findDynamicRoutes(routeSourceDir, routePrefix, dynamicRouteWarnings);

    if (!isFolderBased && isPureSpa(routeSourceDir)) {
      spaFallbackApps.push(app);
    }

    console.log(`Merging ${app}'s routes into ${path.relative(MAIN_DIST, mergeTarget) || '.'}...`);
    for (const entry of fs.readdirSync(routeSourceDir, { withFileTypes: true })) {
      if (isFolderBased && SHARED_FOLDERS.includes(entry.name)) continue;
      copyRecursive(path.join(routeSourceDir, entry.name), path.join(mergeTarget, entry.name));
    }

    if (isFolderBased) {
      console.log(`Merging ${app}'s shared {${SHARED_FOLDERS.join(',')}} into the hub's dist/ root...`);
      for (const folder of SHARED_FOLDERS) {
        const src = path.join(appDist, folder);
        if (fs.existsSync(src)) {
          copyRecursive(src, path.join(MAIN_DIST, folder));
        }
      }
    }
    // For baseUrl-based apps, _expo/assets were already copied in the loop
    // above (they're just more entries under appDist alongside the routes),
    // landing correctly under dist/apps/<name>/_expo and dist/apps/<name>/assets.
  }

  // Written so server/index.js (local testing only — Amplify needs the actual
  // rewrite rules below configured manually) knows which app prefixes need a
  // full catch-all fallback to their own index.html, without hardcoding names.
  fs.writeFileSync(path.join(MAIN_DIST, '.spa-apps.json'), JSON.stringify(spaFallbackApps));

  console.log('\nEmbedded apps merged successfully.');

  if (dynamicRouteWarnings.length > 0) {
    console.log('\n⚠ Dynamic route(s) need a manual wildcard rewrite rule in Amplify Hosting:');
    for (const route of dynamicRouteWarnings) {
      const wildcard = route.replace(/\/\[[^\]]+\]$/, '/*');
      console.log(`  ${wildcard}  ->  ${route}/index.html  (200, rewrite)`);
    }
  }

  if (spaFallbackApps.length > 0) {
    console.log('\n⚠ Pure client-side SPA(s) need a full wildcard fallback rule in Amplify Hosting:');
    for (const app of spaFallbackApps) {
      console.log(`  /apps/${app}/*  ->  /apps/${app}/index.html  (200, rewrite)`);
    }
  }
}

main().catch((err) => {
  // A failing embedded app's own install/build output was already printed
  // (with its `=== [app] ... ===` header) by the worker in runWithConcurrency
  // above before it rethrew, so this is just the final summary — no need to
  // dump err.output again here.
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
