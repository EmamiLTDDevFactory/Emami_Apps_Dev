#!/usr/bin/env bash
# Adds the nginx route https://audit-capa-api.emamiapps.in/dev-api/api/setu/ -> dev hub backend (localhost:4001).
# A copy of the existing /dev-api/api/change-control/ block with only the path changed.
#
# Run on 172.17.2.21:  bash ~/add-setu-nginx-route.sh   (asks for the sudo password)
#
# Safe by design: backs up the config first, runs `nginx -t`, and only then does a graceful reload
# (no downtime, open connections to other apps finish normally). If the test fails, the backup is restored
# and nginx is not reloaded - nothing changes for anyone.
set -euo pipefail

CONF=/etc/nginx/sites-available/audit-capa-api.emamiapps.in.conf
TS=$(date +%Y%m%d-%H%M%S)
BAK="$CONF.bak-preSetu-$TS"

if sudo grep -q "location /dev-api/api/setu/" "$CONF"; then
  echo "Setu route already present - nothing to do."
  exit 0
fi

echo "== backup -> $BAK"
sudo cp -p "$CONF" "$BAK"

echo "== add /dev-api/api/setu/ block (after the change-control block)"
sudo awk '
  { print }
  /location \/dev-api\/api\/change-control\/ \{/ { inblock = 1 }
  inblock && /^[[:space:]]*\}[[:space:]]*$/ {
    print ""
    print "    location /dev-api/api/setu/ {"
    print "        proxy_pass http://localhost:4001/api/setu/;"
    print "        proxy_set_header Host $host;"
    print "        proxy_set_header X-Real-IP $remote_addr;"
    print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Forwarded-Proto $scheme;"
    print "    }"
    inblock = 0
  }
' "$BAK" | sudo tee "$CONF" > /dev/null

if ! sudo grep -q "location /dev-api/api/setu/" "$CONF"; then
  echo "ERROR: could not place the block - restoring backup, nginx not reloaded."
  sudo cp -p "$BAK" "$CONF"
  exit 1
fi

echo "== nginx config test"
if sudo nginx -t; then
  sudo systemctl reload nginx || sudo nginx -s reload
  echo "== reloaded gracefully"
else
  echo "ERROR: config test failed - restoring backup, nginx not reloaded."
  sudo cp -p "$BAK" "$CONF"
  exit 1
fi

sleep 1
SETU=$(curl -s -o /dev/null -w '%{http_code}' https://audit-capa-api.emamiapps.in/dev-api/api/setu/me || true)
OTHER=$(curl -s -o /dev/null -w '%{http_code}' https://audit-capa-api.emamiapps.in/dev-api/api/change-control/requests || true)
echo "Setu via public URL -> $SETU (401 = working, needs sign-in)"
echo "Another app via public URL -> $OTHER (401 = working, needs sign-in)"
echo
echo "To UNDO:  sudo cp -p $BAK $CONF && sudo nginx -t && sudo systemctl reload nginx"
echo "DONE"
