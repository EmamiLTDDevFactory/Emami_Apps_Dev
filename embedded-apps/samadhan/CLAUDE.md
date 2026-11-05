# Samadhan (formerly Setu) — conventions for Claude Code

Scope: this file covers **Samadhan only** (frontend here, backend in `backend/samadhan/`; both were `setu` before v7).
Other apps in this monorepo have their own rules; never change them.

## Current work
Samadhan v7 follows `docs/SAMADHAN_MASTER_PROMPT_FINAL.md`. Resume from `docs/v7/PROGRESS.md`. Stop at every STOP point
and wait for "approved".

## Hard rules
- **Never delete features**: no screen, route, column, table, API field, setting, shortcut, report column or dropdown
  value is removed. Migrations are additive, idempotent, transactional, with a tested down script.
- **Zero impact on other apps**: only Samadhan-owned paths, plus the Samadhan lines in shared files
  (`backend/server.js`, `backend/notifications.js`, `hub-next/src/data/mockData.ts`, `hub-next/src/components/admin/adminShared.tsx`,
  `.env.example`). List every shared-file diff in PROGRESS.md. Never refactor shared code. New npm packages go in the
  Samadhan frontend `package.json` only.
- **Secrets**: never print, copy or commit `.env` values, tokens or passwords; refer to variable names only.
- **Databases**: never production. Automated tests use a local `samadhan_test` DB only. Dev DB migrations need prior approval.
- **Pushes**: only with the full gate green, and only after asking the user every time. Stage by explicit path, never
  `git add -A` at the root, never force-push, never `--no-verify`.
- Users never see the word "Setu".

## Build / test commands
- Frontend: `npm run dev` (port 3250), `npm run typecheck`, `npm run build` (static export → `dist/`).
- Backend unit tests: `node --test backend/samadhan/tests/unit.test.js` (no DB). Shared backend tests: `cd backend && npm test`.
- API suite: see `backend/samadhan/tests/README.md` (local throwaway DB only). Full gate: `npm run test:gate` (see `docs/v7/TEST-PLAN.md`).
- Windows: port 4190 is unusable on this machine; use 4191+ for a local backend.

## Code conventions
- Line endings: CRLF in the working tree (`core.autocrlf=true`), LF in git; `*.sh` always LF. Minimal diffs, no reformatting.
- Moves with `git mv`.
- Time: IST (Asia/Kolkata), en-IN formats; helpers in `src/lib/format.ts` and `backend/samadhan/lib/util.js`.
- UI: only `src/components/ui.tsx` components, Tailwind tokens (`bg-plum`, `accent`, `panel`, `line`, `muted`, `sunken`, …),
  lucide icons. No new UI / CSS / state library. Screens must work at 360 px.
- Backend: parameterised SQL only; quoted camelCase columns; editable fields go through `EDITABLE_FIELDS` (backend
  `constants.js` and frontend `src/lib/types.ts`) with validation, permission check and audit; `safeCell` on exports;
  DOMPurify for HTML in the browser.
- Ticket ids are numeric and stable; the email threading tokens `[#<id>]`, `|| <id>`, `TICKET No - <id>` must keep working.
- Dropdowns are data (`field_choices`); append, de-duplicate case-insensitively, never replace.
