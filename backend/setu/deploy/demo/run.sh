#!/usr/bin/env bash
# Setu demo data on the dev backend server (172.17.2.21).
#   bash ~/setu-demo/run.sh load     - add clearly marked demo data (Setu only)
#   bash ~/setu-demo/run.sh remove   - remove exactly that demo data
# Runs as a one-off process; the running dev backend (emami-hub-backend-dev) is not restarted or changed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  load)   NOTIFY_EMAIL_ENABLED=false SETU_MAIL_ENABLED=false node "$HERE/load-demo.js" ;;
  remove) node "$HERE/remove-demo.js" ;;
  *) echo "usage: bash ~/setu-demo/run.sh load|remove"; exit 1 ;;
esac
