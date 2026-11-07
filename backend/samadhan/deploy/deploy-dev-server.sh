#!/usr/bin/env bash
# Deploys Samadhan to the dev hub backend on 172.17.2.21 (PM2 process emami-hub-backend-dev, port 4001).
#
# Before running: copy the backend/samadhan folder from your PC to ~/samadhan-upload on the server (see deploy/README.md).
# Run on the server:  bash ~/deploy-dev-server.sh
#
# What it does (nothing else on the server is touched):
#   1. Backs up server.js, notifications.js, package.json, package-lock.json as *.bak-preSamadhan-<timestamp>, and the
#      current samadhan/ folder.
#   2. Puts the uploaded ~/samadhan-upload folder in place as samadhan/ and installs its own dependencies inside it.
#   3. server.js: the Samadhan mount (the API on /samadhan, plus the transport route the web server forwards today -
#      samadhan.TRANSPORT_PATH) and the Samadhan Manage Access roles - only Samadhan's lines are written.
#   4. notifications.js: the app name "Samadhan" for the hub inbox.
#   5. Installs @anthropic-ai/sdk 0.128.0 (same version the hub uses).
#   6. Syntax-checks everything, restarts ONLY emami-hub-backend-dev, and checks it answers.
#   If a check fails before the restart, nothing is restarted. To undo, run the "undo" lines it prints.
# Database changes run by themselves when the backend starts (db/migrate.js); each has a down step.
set -euo pipefail

APP=/home/emamiadmin/apps/emami-apps-hub-backend-dev
UPLOAD="$HOME/samadhan-upload"
cd "$APP"
TS=$(date +%Y%m%d-%H%M%S)

[ -f "$UPLOAD/index.js" ] || { echo "ERROR: $UPLOAD/index.js not found - copy the samadhan folder to the server first."; exit 1; }

echo "== 1. backups (suffix .bak-preSamadhan-$TS)"
for f in server.js notifications.js package.json package-lock.json; do cp -p "$f" "$f.bak-preSamadhan-$TS"; done
if [ -d samadhan ]; then mv samadhan "samadhan.bak-preSamadhan-$TS"; fi

echo "== 2. add samadhan/"
cp -r "$UPLOAD" samadhan
rm -rf "$UPLOAD"   # so the next upload starts clean (scp -r into an existing folder nests it)
# Samadhan's own dependencies (samadhan/package.json - the SFTP client for attachments), installed inside samadhan/
# only; the shared backend package.json is not touched. A node_modules copied from a PC is replaced.
if [ -f samadhan/package.json ]; then
  rm -rf samadhan/node_modules
  (cd samadhan && npm ci --omit=optional --no-audit --no-fund 2>&1 | tail -2)
fi

echo "== 3. server.js: Samadhan mount and roles"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
const block = `// Samadhan - Emami service desk (SAP / primary sales, secondary sales apps, digital apps, IT): own samadhan schema,
// self-contained in samadhan/. The API is /samadhan; samadhan.TRANSPORT_PATH is the route the web server forwards
// today (same router). If Samadhan ever failed to load, only its routes answer 503 - every other app is unaffected.
try {
    const samadhan = require('./samadhan');
    apiRouter.use('/samadhan', samadhan);
    if (samadhan.TRANSPORT_PATH) apiRouter.use(samadhan.TRANSPORT_PATH, samadhan);
} catch (err) {
    console.error('[samadhan] failed to load, Samadhan is unavailable:', err.message);
    apiRouter.use('/samadhan', (req, res) => res.status(503).json({ success: false, error: 'Samadhan is temporarily unavailable.' }));
}`;
// Replace the existing Samadhan mount (with its comment lines), else add it after the change-control mount.
const start = s.search(/(?:\/\/[^\n]*\n)*try \{\s*const samadhan = require\('\.\/samadhan'\);/);
if (start >= 0) {
  const tail = s.slice(start);
  const end = tail.search(/\n\}\n/);
  if (end < 0) throw new Error('end of the Samadhan mount not found - stopping');
  s = s.slice(0, start) + block + tail.slice(end + 2);
} else {
  const anchor = "apiRouter.use('/change-control', require('./changeControl'));";
  if (!s.includes(anchor)) throw new Error('neither a Samadhan mount nor the change-control mount line was found - stopping');
  s = s.replace(anchor, () => `${anchor}\n${block}`);
}
// Manage Access roles: one entry for the app id 'samadhan'; an entry under an older id of this app is removed.
const re = /(const VALID_ROLES_BY_APP = \{)([^\n]*?)(\s*\};)/;
if (!re.test(s)) throw new Error('VALID_ROLES_BY_APP line not found - stopping');
s = s.replace(re, (all, a, inner, b) => {
  inner = inner.replace(/,\s*'setu':\s*\[[^\]]*\]/, '');
  if (!/'samadhan':/.test(inner)) inner += ", 'samadhan': ['Agent', 'Supervisor', 'Admin']";
  return `${a}${inner}${b}`;
});
fs.writeFileSync('server.js', s);
JS

echo "== 4. notifications.js: app name"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('notifications.js', 'utf8');
const re = /const APP_NAMES = \{([^\n]*?)\s*\};/;
if (!re.test(s)) throw new Error('APP_NAMES line not found - stopping');
let inner = s.match(re)[1].replace(/,\s*setu:\s*'[^']*'/, '');
if (!/\bsamadhan:/.test(inner)) inner += ", samadhan: 'Samadhan'";
s = s.replace(re, () => `const APP_NAMES = {${inner} };`);
fs.writeFileSync('notifications.js', s);
JS

echo "== 5. install @anthropic-ai/sdk@0.128.0"
npm install --save-exact --no-audit --no-fund @anthropic-ai/sdk@0.128.0 2>&1 | tail -2

echo "== syntax checks"
node --check server.js
node --check notifications.js
find samadhan -name '*.js' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 node --check

echo "== changes made"
diff "server.js.bak-preSamadhan-$TS" server.js || true
diff "notifications.js.bak-preSamadhan-$TS" notifications.js || true

echo "== 6. restart emami-hub-backend-dev only"
pm2 restart emami-hub-backend-dev --update-env
sleep 6
pm2 logs emami-hub-backend-dev --lines 25 --nostream 2>&1 | grep -iE "samadhan|error|listening|running" | tail -15 || true

API=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/samadhan/me || true)
OTHER=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/change-control/requests || true)
echo "Samadhan /api/samadhan/me -> $API (401 = running, needs sign-in)"
echo "Another app /api/change-control/requests -> $OTHER (401 = running, needs sign-in)"

echo
echo "To UNDO everything:"
echo "  cd $APP && for f in server.js notifications.js package.json package-lock.json; do cp -p \$f.bak-preSamadhan-$TS \$f; done && rm -rf samadhan && { [ -d samadhan.bak-preSamadhan-$TS ] && mv samadhan.bak-preSamadhan-$TS samadhan || true; } && npm install --no-audit --no-fund && pm2 restart emami-hub-backend-dev"
echo "DONE TS=$TS"
