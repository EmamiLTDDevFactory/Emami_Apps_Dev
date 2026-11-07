#!/usr/bin/env bash
# Gives Samadhan its own nginx route: https://audit-capa-api.emamiapps.in/dev-api/api/samadhan/ -> dev hub backend
# (localhost:4001/api/samadhan/). The older Samadhan block (/dev-api/api/setu/) is turned into this one, so only one
# Samadhan route remains; without it, the block is added after the change-control block (same settings).
# Needs root: the server admin runs it once.   bash ~/add-samadhan-nginx-route.sh   (asks for the sudo password)
#
# Safe by design: backs up the config first, runs `nginx -t`, and only then does a graceful reload (no downtime, open
# connections to other apps finish normally). If the test fails, the backup is restored and nginx is not reloaded.
# The app switches between the two routes by itself, so it keeps working before, during and after.
# Afterwards: TRANSPORT_PATH = null in backend/samadhan/index.js and FALLBACK_ROUTE = null in the frontend api.ts.
set -euo pipefail

CONF=/etc/nginx/sites-available/audit-capa-api.emamiapps.in.conf
TS=$(date +%Y%m%d-%H%M%S)
BAK="$CONF.bak-preSamadhan-$TS"

if sudo grep -q "location /dev-api/api/samadhan/" "$CONF" && ! sudo grep -q "location /dev-api/api/setu/" "$CONF"; then
  echo "Samadhan route already in place - nothing to do."
  exit 0
fi

echo "== backup -> $BAK"
sudo cp -p "$CONF" "$BAK"

if sudo grep -q "location /dev-api/api/setu/" "$CONF"; then
  if sudo grep -q "location /dev-api/api/samadhan/" "$CONF"; then
    echo "== both blocks present: removing the older one"
    sudo awk '
      /location \/dev-api\/api\/setu\/ \{/ { skip = 1 }
      !skip { print }
      skip && /^[[:space:]]*\}[[:space:]]*$/ { skip = 0 }
    ' "$BAK" | sudo tee "$CONF" > /dev/null
  else
    echo "== turning the older Samadhan block into /dev-api/api/samadhan/"
    sudo sed -e 's#location /dev-api/api/setu/ {#location /dev-api/api/samadhan/ {#' \
             -e 's#proxy_pass http://localhost:4001/api/setu/;#proxy_pass http://localhost:4001/api/samadhan/;#' "$BAK" | sudo tee "$CONF" > /dev/null
  fi
else
  echo "== adding /dev-api/api/samadhan/ after the change-control block"
  sudo awk '
    { print }
    /location \/dev-api\/api\/change-control\/ \{/ { inblock = 1 }
    inblock && /^[[:space:]]*\}[[:space:]]*$/ {
      print ""
      print "    location /dev-api/api/samadhan/ {"
      print "        proxy_pass http://localhost:4001/api/samadhan/;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "    }"
      inblock = 0
    }
  ' "$BAK" | sudo tee "$CONF" > /dev/null
fi

if ! sudo grep -q "location /dev-api/api/samadhan/" "$CONF"; then
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
NEW=$(curl -s -o /dev/null -w '%{http_code}' https://audit-capa-api.emamiapps.in/dev-api/api/samadhan/me || true)
OTHER=$(curl -s -o /dev/null -w '%{http_code}' https://audit-capa-api.emamiapps.in/dev-api/api/change-control/requests || true)
echo "Samadhan via public URL -> $NEW (401 = working, needs sign-in)"
echo "Another app via public URL -> $OTHER (401 = working, needs sign-in)"
echo
echo "To UNDO:  sudo cp -p $BAK $CONF && sudo nginx -t && sudo systemctl reload nginx"
echo "DONE"
