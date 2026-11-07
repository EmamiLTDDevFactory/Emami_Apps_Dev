# Samadhan changelog

## v7.1 — permissions, Authorization cockpit, data scope, attachments (Phase 2, schema v9)

- Every API route has a permission key (a route without one is refused). Agent / Supervisor / Admin keep exactly
  their old rights through three system profiles; custom role profiles (8 seeded, "Adds" or "Restricts"), per-person
  grant / deny overrides with an end date, and segregation-of-duties warnings.
- Data scope per person: all tickets, my groups' + mine, or only mine - applied to lists, counts, dashboards,
  reports, export, search and the bell; a ticket outside the scope answers 404.
- Admin > Authorization cockpit: overview, role profiles, permission matrix, user access, access review, change log.
  Temporary access ends by itself; reminders go to the hub inbox.
- Attachments stored on an SFTP server (host key pinned): ticket card with upload, preview and download, paperclips
  on messages, files on replies / notes / forwards and new tickets, Ctrl+V paste and drag-and-drop, large screenshots
  compressed in the browser, email attachments saved automatically, portal uploads, list icon + "Has attachments"
  filter, limits in Admin > General. Downloads only through 5-minute signed links. Off until the server settings exist.
- Migrations `7.1-auth` and `7.1-attachments` (both with down). Details: `docs/v7/PHASE-2-NOTES.md`.

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
