#!/usr/bin/env bash
# Samadhan demo data on the dev backend server (172.17.2.21).
#   bash ~/samadhan-demo/run.sh load             - add clearly marked demo data (Samadhan only)
#   bash ~/samadhan-demo/run.sh load-pulsedesk   - add the PulseDesk / Freshdesk extract (needs ~/samadhan-demo/pulsedesk-data.json)
#   bash ~/samadhan-demo/run.sh remove           - remove exactly that demo data (both kinds)
# Runs as a one-off process; the running dev backend (emami-hub-backend-dev) is not restarted or changed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  load)           NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-demo.js" ;;
  load-pulsedesk) NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-pulsedesk.js" "$HERE/pulsedesk-data.json" ;;
  remove)         node "$HERE/remove-demo.js" ;;
  *) echo "usage: bash ~/samadhan-demo/run.sh load|load-pulsedesk|remove"; exit 1 ;;
esac
