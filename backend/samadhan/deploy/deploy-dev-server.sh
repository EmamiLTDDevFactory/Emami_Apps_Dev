#!/usr/bin/env bash
# Deploys Samadhan (formerly Setu) to the dev hub backend on 172.17.2.21 (PM2 process emami-hub-backend-dev, port 4001).
#
# Before running: copy the backend/samadhan folder from your PC to ~/samadhan-upload on the server (see deploy/README.md).
# Run on the server:  bash ~/deploy-dev-server.sh
#
# What it does (nothing else on the server is touched):
#   1. Backs up server.js, notifications.js, package.json, package-lock.json as *.bak-preSamadhan-<timestamp>
#   2. Moves the uploaded ~/samadhan-upload folder into the backend as samadhan/ (an old setu/ folder is kept as a backup)
#   3. server.js: mounts Samadhan at /samadhan and, for old clients and the WhatsApp webhook, at /setu (replacing the
#      pre-v7 Setu mount); adds the 'samadhan' Manage Access roles next to the 'setu' ones (keeps this server's own edits)
#   4. notifications.js: display name Samadhan for both app ids
#   5. Installs @anthropic-ai/sdk 0.128.0 (same version the hub uses)
#   6. Syntax-checks everything, restarts ONLY emami-hub-backend-dev, and checks it answers on both paths
#   If a check fails before the restart, nothing is restarted. To undo, run the "undo" lines it prints.
#
# It does NOT rename the database schema. Until that is done (one command, see deploy/README.md) Samadhan keeps
# working on the existing setu schema and logs a warning at start.
set -euo pipefail

APP=/home/emamiadmin/apps/emami-apps-hub-backend-dev
UPLOAD="$HOME/samadhan-upload"
cd "$APP"
TS=$(date +%Y%m%d-%H%M%S)

[ -f "$UPLOAD/index.js" ] || { echo "ERROR: $UPLOAD/index.js not found - copy the samadhan folder to the server first."; exit 1; }

echo "== 1. backups (suffix .bak-preSamadhan-$TS)"
for f in server.js notifications.js package.json package-lock.json; do cp -p "$f" "$f.bak-preSamadhan-$TS"; done
if [ -d samadhan ]; then mv samadhan "samadhan.bak-preSamadhan-$TS"; fi
if [ -d setu ]; then mv setu "setu.bak-preSamadhan-$TS"; fi

echo "== 2. add samadhan/"
cp -r "$UPLOAD" samadhan
rm -rf "$UPLOAD"   # so the next upload starts clean (scp -r into an existing folder nests it)
# v7: Samadhan's own dependencies (samadhan/package.json - the SFTP client for attachments). Installed inside samadhan/
# only; the shared backend package.json is not touched. A node_modules copied from a PC is replaced.
if [ -f samadhan/package.json ]; then
  rm -rf samadhan/node_modules
  (cd samadhan && npm ci --omit=optional --no-audit --no-fund 2>&1 | tail -2)
fi

echo "== 3. server.js: Samadhan mount (/samadhan + /setu alias) and roles"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
const block = `try {
    const samadhan = require('./samadhan');
    apiRouter.use('/samadhan', samadhan);
    apiRouter.use('/setu', samadhan.legacyAlias, samadhan);
} catch (err) {
    console.error('[samadhan] failed to load, Samadhan is unavailable:', err.message);
    apiRouter.use(['/samadhan', '/setu'], (req, res) => res.status(503).json({ success: false, error: 'Samadhan is temporarily unavailable.' }));
}`;
if (!s.includes("require('./samadhan')")) {
  // The pre-v7 Setu mount is replaced; otherwise the block goes after the change-control mount.
  const old = /try \{\s*apiRouter\.use\('\/setu', require\('\.\/setu'\)\);\s*\} catch \(err\) \{[\s\S]*?apiRouter\.use\('\/setu', \(req, res\) => res\.status\(503\)[^\n]*\n\}/;
  if (old.test(s)) s = s.replace(old, block);
  else {
    const anchor = "apiRouter.use('/change-control', require('./changeControl'));";
    if (!s.includes(anchor)) throw new Error('neither the old Setu mount nor the change-control mount line was found - stopping');
    s = s.replace(anchor, `${anchor}\n// Samadhan (formerly Setu) - own schema, routes under /samadhan (and /setu for old clients), self-contained in samadhan/.\n${block}`);
  }
}
if (s.includes("require('./setu')")) throw new Error('an old require(./setu) is still in server.js - stopping');
if (!/VALID_ROLES_BY_APP = \{[^\n]*'samadhan'/.test(s)) {
  const re = /(const VALID_ROLES_BY_APP = \{[^\n]*?)\s*\};/;
  if (!re.test(s)) throw new Error('VALID_ROLES_BY_APP line not found - stopping');
  const hasSetu = /'setu'/.test(s.match(re)[1]);
  s = s.replace(re, hasSetu ? "$1, 'samadhan': ['Agent', 'Supervisor', 'Admin'] };" : "$1, 'setu': ['Agent', 'Supervisor', 'Admin'], 'samadhan': ['Agent', 'Supervisor', 'Admin'] };");
}
fs.writeFileSync('server.js', s);
JS

echo "== 4. notifications.js: display name Samadhan"
node - <<'JS'
const fs = require('fs');
let s = fs.readFileSync('notifications.js', 'utf8');
s = s.replace("setu: 'Setu Helpdesk'", "setu: 'Samadhan'");   // servers set up before the first rename
const re = /const APP_NAMES = \{([^\n]*?)\s*\};/;
if (!re.test(s)) throw new Error('APP_NAMES line not found - stopping');
let inner = s.match(re)[1];
if (!/\bsetu:/.test(inner)) inner += ", setu: 'Samadhan'";
if (!/\bsamadhan:/.test(inner)) inner += ", samadhan: 'Samadhan'";
s = s.replace(re, `const APP_NAMES = {${inner} };`);
fs.writeFileSync('notifications.js', s);
JS

echo "== 5. install @anthropic-ai/sdk@0.128.0"
npm install --save-exact --no-audit --no-fund @anthropic-ai/sdk@0.128.0 2>&1 | tail -2

echo "== syntax checks"
node --check server.js
node --check notifications.js
find samadhan -name '*.js' -print0 | xargs -0 -n1 node --check

echo "== changes made"
diff "server.js.bak-preSamadhan-$TS" server.js || true
diff "notifications.js.bak-preSamadhan-$TS" notifications.js || true

echo "== 6. restart emami-hub-backend-dev only"
pm2 restart emami-hub-backend-dev --update-env
sleep 6
pm2 logs emami-hub-backend-dev --lines 25 --nostream 2>&1 | grep -iE "samadhan|error|listening|running|postgres" | tail -15 || true

NEW=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/samadhan/me || true)
OLD=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/setu/me || true)
OTHER=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/change-control/requests || true)
echo "Samadhan /api/samadhan/me -> $NEW (401 = running, needs sign-in)"
echo "Old path  /api/setu/me     -> $OLD (401 = alias working)"
echo "Another app /api/change-control/requests -> $OTHER (401 = running, needs sign-in)"

echo
echo "To UNDO everything:"
echo "  cd $APP && for f in server.js notifications.js package.json package-lock.json; do cp -p \$f.bak-preSamadhan-$TS \$f; done && rm -rf samadhan && { [ -d setu.bak-preSamadhan-$TS ] && mv setu.bak-preSamadhan-$TS setu || true; } && npm install --no-audit --no-fund && pm2 restart emami-hub-backend-dev"
echo "DONE TS=$TS"
