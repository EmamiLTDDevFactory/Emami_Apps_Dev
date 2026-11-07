#!/usr/bin/env bash
# Samadhan demo data on the dev backend server (172.17.2.21).
#   bash ~/samadhan-demo/run.sh load             - add clearly marked demo data (Samadhan only)
#   bash ~/samadhan-demo/run.sh load-pulsedesk   - add the PulseDesk / Freshdesk extract (needs ~/samadhan-demo/pulsedesk-data.json)
#   bash ~/samadhan-demo/run.sh load-v7          - add the v7 demo: last 14 days of tickets, cockpit examples, views, variants
#   bash ~/samadhan-demo/run.sh load-v7-apps     - add the Phase 3 demo: applications per desk, mail classification examples (after load-v7)
#   bash ~/samadhan-demo/run.sh load-v7-sap      - add the Phase 4 demo: SAP details, SAP cases, a confidential ticket (after load-v7-apps)
#   bash ~/samadhan-demo/run.sh load-v7-it       - add the Phase 5 demo: IT details on the Digital Apps / Infra & IT demo tickets
#   bash ~/samadhan-demo/run.sh remove           - remove exactly that demo data (both kinds)
# Runs as a one-off process; the running dev backend (emami-hub-backend-dev) is not restarted or changed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  load)           NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-demo.js" ;;
  load-pulsedesk) NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-pulsedesk.js" "$HERE/pulsedesk-data.json" ;;
  load-v7)        NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-v7.js" ;;
  load-v7-apps)   NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-v7-apps.js" ;;
  load-v7-sap)    NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-v7-sap.js" ;;
  load-v7-it)     NOTIFY_EMAIL_ENABLED=false SAMADHAN_MAIL_ENABLED=false node "$HERE/load-v7-it.js" ;;
  remove)         node "$HERE/remove-demo.js" ;;
  *) echo "usage: bash ~/samadhan-demo/run.sh load|load-pulsedesk|load-v7|load-v7-apps|load-v7-sap|load-v7-it|remove"; exit 1 ;;
esac
