# Samadhan changelog

## v7.0 — rename (Phase 1, schema v7)

- Internal name `setu` → `samadhan` everywhere (folders, `/apps/samadhan`, `/api/samadhan`, schema `samadhan`,
  `SAMADHAN_*` settings, code names). Formerly Setu: old links, the `/api/setu` path, the `setu` schema, `SETU_*`
  settings and `setu` grants keep working (see `docs/v7/PHASE-1-NOTES.md`, `docs/v7/RENAME-FOLLOWUPS.md`).
- v7 migrations with up / down (`backend/samadhan/db/migrate.js`); step `7.0-rename` is run by an operator.
- Test gate: golden daily report and export (byte-identical to v6), API suite on both paths and on a legacy-schema
  database, upgrade round trip on a real v6 database, Playwright end-to-end (desktop + 360 px), path guard.
- No feature change.

## v6 and earlier

See the README sections "Freshdesk-style features" (v3–v5) and "Configuration, roles and personal settings (schema v6)".
