#!/usr/bin/env bash
# Samadhan sample data (Emami configuration + 30 anonymised tickets) on the dev backend server (172.17.2.21).
#   bash ~/samadhan-mock/run.sh load             - load samadhan-mock-data.json (Samadhan tables only, one transaction)
#   bash ~/samadhan-mock/run.sh remove           - remove the 30 sample tickets (tag "mock") and their sample contacts
#   bash ~/samadhan-mock/run.sh restore-config   - put back the configuration saved just before loading
# Runs as a one-off process; the running dev backend (emami-hub-backend-dev) is not restarted or changed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  load)           node "$HERE/load-mock.js" load "$HERE/samadhan-mock-data.json" ;;
  remove)         node "$HERE/load-mock.js" remove ;;
  restore-config) node "$HERE/load-mock.js" restore-config ;;
  *) echo "usage: bash ~/samadhan-mock/run.sh load|remove|restore-config"; exit 1 ;;
esac
