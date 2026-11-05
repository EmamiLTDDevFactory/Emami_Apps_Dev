# /apps/setu — redirect stub (formerly Setu)

Samadhan was called Setu before v7 and was served at `/apps/setu`. The app now lives in `embedded-apps/samadhan`
at `/apps/samadhan`. This folder only keeps old links working: `/apps/setu/?ticket=<id>`, `/apps/setu/portal/?csat=<token>`,
`/apps/setu/portal/` and bookmarks forward to the same place under `/apps/samadhan/`, query string and hash kept.

Keep it at least until the alias period ends (see `docs/v7/RENAME-FOLLOWUPS.md`). Build: `npm run build` → `dist/`.
