const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const EMBEDDED_APPS_DIR = path.join(REPO_ROOT, 'embedded-apps');
const MAIN_DIST = path.join(REPO_ROOT, 'dist');
const BUILD_MARKER_FILE = '.build-commit';

// Last commit that touched a given repo-relative path — used to skip an embedded app's
// install+build entirely when nothing under its own directory changed since the cached `dist/`
// (see BUILD_MARKER_FILE below) was produced. `git log -1` on an unchanged path is a few
// milliseconds; re-running npm install + a bundler for an untouched app is 10s-2min wasted on
// every single deploy, for 8 of 9 apps on a typical single-app change. Returns null (never
// matches, so the app always rebuilds) if git isn't available or the path has no history yet —
// fails toward "rebuild", never toward "skip a real change".
function lastCommitTouching(relativePath) {
  try {
    return execSync(`git log -1 --format=%H -- ${JSON.stringify(relativePath)}`, { cwd: REPO_ROOT })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

// Folded into every app's marker so editing THIS script's own build/merge logic invalidates
// every app's cache once, rather than serving stale dist/ output built by whatever this file
// used to do. Computed once up front, not per-app.
const SCRIPT_COMMIT = lastCommitTouching('scripts/build-embedded-apps.js');

// Shared npm package cache (compressed tarballs, content-addressed and deduped across all 9
// apps) that every embedded app's `npm install` below reads/writes via --cache. Caching THIS
// instead of each app's own unpacked node_modules is what keeps Amplify's cache artifact under
// its 5GB hard limit — 9 separate node_modules directories (many sharing the same Expo/RN/React
// versions, each copy fully unpacked with platform-specific native binaries) measured ~3.1GB
// combined even on a Mac; the actual Linux build container's own copies pushed the whole cache
// artifact over 5GB, which fails to upload and silently falls back to a cold reinstall next
// build. One deduped tarball cache holds the same effective packages in a fraction of the size.
const NPM_CACHE_DIR = path.join(__dirname, '..', '.npm-cache');

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

// A directory here isn't necessarily a real, current embedded app: Amplify's own build cache
// (amplify.yml's `cache: paths:` includes `embedded-apps/*/dist/**/*`) restores cached paths onto
// the fresh git checkout BEFORE this script ever runs, regardless of whether that app still
// exists in the commit being built. Deleting an app from the repo (e.g. splitting/renaming one)
// does NOT delete its old cache entry, so its directory reappears on disk holding nothing but a
// stale `dist/` — no package.json, no source — and crashed the entire deploy here once already
// (`npm run build` -> "Missing script: build") when embedded-apps/insurance-policy was replaced
// by embedded-apps/mediclaim + embedded-apps/term-policy but its cached dist/ came back anyway.
// `git ls-files` is the ground truth for "is this actually part of the commit being built" — a
// leftover cache directory has zero tracked files and gets skipped with a warning instead of
// taking down every other embedded app's build with it.
function isTrackedByGit(relativeDir) {
  try {
    return execSync(`git ls-files -- ${JSON.stringify(relativeDir)}`, { cwd: REPO_ROOT }).toString().trim().length > 0;
  } catch {
    // git itself unavailable — fail toward "trust the directory", same posture as
    // lastCommitTouching above, rather than skipping every app.
    return true;
  }
}

const allDirs = fs
  .readdirSync(EMBEDDED_APPS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const apps = allDirs.filter((app) => {
  const tracked = isTrackedByGit(path.relative(REPO_ROOT, path.join(EMBEDDED_APPS_DIR, app)));
  if (!tracked) {
    console.log(`\n⚠ Skipping "${app}" — not tracked in this commit (stale cache leftover from a deleted/renamed app). Removing it.`);
    fs.rmSync(path.join(EMBEDDED_APPS_DIR, app), { recursive: true, force: true });
  }
  return tracked;
});

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
    const appDist = path.join(appDir, 'dist');
    const markerPath = path.join(appDist, BUILD_MARKER_FILE);

    // Skip install+build entirely when nothing under this app's own directory (or this script)
    // has changed since the cached dist/ we'd be restoring was built. embedded-apps/*/dist is
    // cached the same way node_modules/.npm-cache is (see amplify.yml) — the merge step below
    // reads straight from appDist regardless of whether this app just built or was skipped, so
    // a stale-but-current cached dist merges in exactly as if it had just been rebuilt.
    const appCommit = lastCommitTouching(path.relative(REPO_ROOT, appDir));
    const currentMarker = appCommit && SCRIPT_COMMIT ? `${appCommit}:${SCRIPT_COMMIT}` : null;
    const cachedMarker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8').trim() : null;

    if (currentMarker && cachedMarker === currentMarker && fs.readdirSync(appDist).length > 0) {
      console.log(`\n=== [${app}] unchanged since last build — reusing cached dist/, skipping install+build ===`);
      return;
    }

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
      log += await runCommand(`npm install --legacy-peer-deps --cache "${NPM_CACHE_DIR}" --no-audit --no-fund`, appDir, env);
      log += `\n=== [${app}] npm run build ===\n`;
      log += await runCommand('npm run build', appDir, env);
      // Only written on a successful build, and only once dist/ genuinely reflects appCommit —
      // a failed or skipped-above build never reaches here, so the marker can't ever claim a
      // dist/ that doesn't match what it says it does.
      if (currentMarker) fs.writeFileSync(markerPath, currentMarker);
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
