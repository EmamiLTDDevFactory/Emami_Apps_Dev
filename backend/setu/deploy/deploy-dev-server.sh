#!/usr/bin/env bash
# Adds Setu to the dev hub backend on 172.17.2.21 (PM2 process emami-hub-backend-dev, port 4001).
#
# Before running: copy the backend/setu folder from your PC to the server first (see backend/setu/deploy/README.md).
# Run on the server:  bash ~/deploy-dev-server.sh
#
# What it does (nothing else on the server is touched):
#   1. Backs up server.js, notifications.js, package.json, package-lock.json as *.bak-preSetu-<timestamp>
#   2. Moves the uploaded ~/setu-upload folder into the backend as setu/
#   3. server.js: adds the isolated Setu mount and Setu's roles (keeps this server's own local edits)
#   4. notifications.js: adds Setu's display name
#   5. Installs @anthropic-ai/sdk 0.128.0 (same version the hub uses)
#   6. Syntax-checks everything, restarts ONLY emami-hub-backend-dev, and checks it answers
#   If a check fails before the restart, nothing is restarted. To undo, run the "undo" lines it prints.
set -euo pipefail

APP=/home/emamiadmin/apps/emami-apps-hub-backend-dev
UPLOAD="$HOME/setu-upload"
cd "$APP"
TS=$(date +%Y%m%d-%H%M%S)

[ -f "$UPLOAD/index.js" ] || { echo "ERROR: $UPLOAD/index.js not found - copy the setu folder to the server first."; exit 1; }

echo "== 1. backups (suffix .bak-preSetu-$TS)"
for f in server.js notifications.js package.json package-lock.json; do cp -p "$f" "$f.bak-preSetu-$TS"; done
if [ -d setu ]; then mv setu "setu.bak-preSetu-$TS"; fi

echo "== 2. add setu/"
cp -r "$UPLOAD" setu
rm -rf "$UPLOAD"   # so the next upload starts clean (scp -r into an existing folder nests it)

echo "== 3. server.js: isolated Setu mount + Setu roles"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
if (!s.includes("require('./setu')")) {
  const anchor = "apiRouter.use('/change-control', require('./changeControl'));";
  if (!s.includes(anchor)) throw new Error('change-control mount line not found - stopping');
  s = s.replace(anchor, anchor + `
// Setu (Emami Secondary Support helpdesk) - own setu schema, own routes under /setu, self-contained in setu/.
// Isolated: if Setu ever failed to load, only /setu answers 503 - every other app on this backend is unaffected.
try {
    apiRouter.use('/setu', require('./setu'));
} catch (err) {
    console.error('[setu] failed to load, Setu is unavailable:', err.message);
    apiRouter.use('/setu', (req, res) => res.status(503).json({ success: false, error: 'Setu is temporarily unavailable.' }));
}`);
}
if (!/VALID_ROLES_BY_APP = \{[^\n]*'setu'/.test(s)) {
  const re = /(const VALID_ROLES_BY_APP = \{[^\n]*?)\s*\};/;
  if (!re.test(s)) throw new Error('VALID_ROLES_BY_APP line not found - stopping');
  s = s.replace(re, "$1, 'setu': ['Agent', 'Supervisor', 'Admin'] };");
}
fs.writeFileSync('server.js', s);
JS

echo "== 4. notifications.js: Setu display name"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('notifications.js', 'utf8');
if (!s.includes("setu: 'Setu Helpdesk'")) {
  const re = /const APP_NAMES = \{([^\n]*?)\s*\};/;
  if (!re.test(s)) throw new Error('APP_NAMES line not found - stopping');
  s = s.replace(re, "const APP_NAMES = {$1, setu: 'Setu Helpdesk' };");
  fs.writeFileSync('notifications.js', s);
}
JS

echo "== 5. install @anthropic-ai/sdk@0.128.0"
npm install --save-exact --no-audit --no-fund @anthropic-ai/sdk@0.128.0 2>&1 | tail -2

echo "== syntax checks"
node --check server.js
node --check notifications.js
find setu -name '*.js' -print0 | xargs -0 -n1 node --check

echo "== changes made"
diff "server.js.bak-preSetu-$TS" server.js || true
diff "notifications.js.bak-preSetu-$TS" notifications.js || true

echo "== 6. restart emami-hub-backend-dev only"
pm2 restart emami-hub-backend-dev --update-env
sleep 6
pm2 logs emami-hub-backend-dev --lines 25 --nostream 2>&1 | grep -iE "setu|error|listening|running|postgres" | tail -15 || true

SETU=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/setu/me || true)
OTHER=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/change-control/requests || true)
echo "Setu /api/setu/me -> $SETU (401 = running, needs sign-in)"
echo "Another app /api/change-control/requests -> $OTHER (401 = running, needs sign-in)"

echo
echo "To UNDO everything:"
echo "  cd $APP && for f in server.js notifications.js package.json package-lock.json; do cp -p \$f.bak-preSetu-$TS \$f; done && rm -rf setu && npm install --no-audit --no-fund && pm2 restart emami-hub-backend-dev"
echo "DONE TS=$TS"
