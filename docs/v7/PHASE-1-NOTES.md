# Samadhan v7 — Phase 1 notes: rename `setu` → `samadhan` (formerly Setu)

No feature change. Users see exactly what they saw before (the UI already said "Samadhan"); only technical names moved,
each with a compatibility layer.

## What changed

| Area | Change | Compatibility |
| --- | --- | --- |
| Folders | `backend/setu` → `backend/samadhan`, `embedded-apps/setu` → `embedded-apps/samadhan` (`git mv`, history kept, commit `3075d8a`) | `embedded-apps/setu` is now a 2-page redirect stub |
| URL | app at `/apps/samadhan/` | `/apps/setu/...` forwards with query + hash (`?ticket=`, `?csat=`, portal) |
| API | mounted at `/api/samadhan` | `/api/setu` = same router + `Deprecation`/`Sunset`/`Link` headers, callers logged; the frontend falls back to `/api/setu` if a backend has no `/api/samadhan` yet |
| Schema | queries use `samadhan.`; name from `SAMADHAN_DB_SCHEMA` in `db/pool.js` | on a database that still has only `setu`, it is used (warning logged); `db/migrate.js up 7.0-rename` renames it (explicit, transactional, with down) |
| Schema version | `SCHEMA_VERSION` 6 → 7; `samadhan.schema_migrations` records v7 steps | the v1–v6 set-up is unchanged and still idempotent |
| Manage Access | `lib/access.js`: grants under `samadhan` or `setu`; new grants under the id in use | hub tile id stays `setu` until the switch (RENAME-FOLLOWUPS §5) |
| Settings | `SAMADHAN_*` | `SETU_*` read when the new one is empty |
| Code names | `useSamadhan`, `SamadhanContext`, `Samadhan`, `samadhanApiUrl`, events `samadhan:*`, log tag `[samadhan]` | — |
| Scheduler | lock `samadhan.scheduled_jobs` | the old `setu.scheduled_jobs` lock is taken as well |
| Not renamed | hub inbox de-dup key `setu:<id>:<template>` (stored; renaming would re-send notifications); old-text migration strings | — |
| Deploy / demo scripts | `samadhan` names; demo/mock loaders work on either schema; demo remover also removes `@demo.setu.local` | old upload folders still accepted |
| Tests | golden files, `rename.test.js`, API suite parametrised (path / grant id / schema), Playwright E2E, gate runner | old `SETU_TEST_*` names work |
| Tooling | ESLint (`next/core-web-vitals`), Playwright 1.49.1 — frontend devDependencies only, exact versions, lockfile additions only | — |

Shared files (Samadhan lines only): `backend/server.js` (mount block, roles line), `backend/notifications.js` (display
name), `backend/.env.example` (new names, empty), `hub-next/src/data/mockData.ts` (tile URL),
`hub-next/src/components/admin/adminShared.tsx` (role list for either id). Diffs in PROGRESS.md.

## How to test

```
node backend/samadhan/tests/gate.js          # full gate (about 25 min); --quick skips the browser run
```
Needs the throwaway Postgres on localhost:55432 (TEST-PLAN §A). Results: `docs/v7/TEST-REPORT.md`.

By hand after a deploy: `/api/samadhan/me` and `/api/setu/me` → 401; open `/apps/setu/?ticket=<id>` → lands on
`/apps/samadhan/?ticket=<id>`; Admin > Channels shows the `/api/samadhan/whatsapp/webhook` URL.

## How to roll back

- Code: revert the Phase-1 merge commit (nothing in the database depends on it).
- Database renamed already: `node backend/samadhan/db/migrate.js down 7.0-rename --yes` (back to `setu`), then deploy
  the old code. The v7 code also runs on a `setu` database, so code and schema can be rolled back in either order.
- Server: the deploy script prints a one-line undo (restores `server.js`, `notifications.js`, the old `setu/` folder).
