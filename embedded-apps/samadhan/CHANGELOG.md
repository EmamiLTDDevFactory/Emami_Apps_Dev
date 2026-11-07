# Samadhan changelog

## v7.2 — service desks, applications, references, mail classification (Phase 3, schema v10)

- Every ticket has an application (29 seeded, incl. RMSFA, CDMS and SCB2B per the approved mapping) and a readable
  reference such as MSFA-100123, shown wherever a ticket number appears and accepted by every search and the portal.
- Five service desks (Secondary Sales, SAP, S/4HANA Programme, Digital Apps, Infra & IT); only Secondary Sales is on until
  an Admin switches the desks on. Desk switcher, desk-aware fields / statuses / groups / severity / SLA, Impact × Urgency.
- New ticket starts with "Which app or area?"; properties gain Application, Record class, Impact, Urgency; moving a ticket
  to another desk needs the new permission and is audited; bulk "Set application".
- One mailbox: subject tag → sender rule → keywords → AI (optional) → default; "Auto-classified" hint with Confirm /
  Change, "Needs classification" view, keyword suggestions for Admins.
- Data scope by desk / application in the Authorization cockpit. Analytics "By application", Helpdesk "Application wise",
  optional report / export columns (defaults unchanged). Admin: Service desks, Applications, Mail classification.
- Migration `7.2-workspaces` with down; existing tickets backfilled. Details: `docs/v7/PHASE-3-NOTES.md`.

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

## v7.0 — Samadhan (Phase 1, schema v7)

- The app is Samadhan everywhere (folders, `/apps/samadhan`, `/api/samadhan`, schema `samadhan`, `SAMADHAN_*` settings).
- v7 migrations with up / down (`backend/samadhan/db/migrate.js`).
- Test gate: golden daily report and export (byte-identical), API suites, Playwright end-to-end (desktop + 360 px),
  path guard.
- No feature change.

## v6 and earlier

See the README sections "Freshdesk-style features" (v3–v5) and "Configuration, roles and personal settings (schema v6)".
