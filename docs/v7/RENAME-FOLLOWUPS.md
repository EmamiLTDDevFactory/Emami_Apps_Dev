# Samadhan v7 — manual follow-ups after the rename (formerly Setu)

Things that cannot be changed from the code. Nothing here is urgent: every old name keeps working through aliases until
the alias period ends (`/api/setu` sunset header: **31 May 2027**, `SAMADHAN_LEGACY_SUNSET`). Do them in this order.
Tick each one off here (edit this file) so the next session knows.

## 1. Dev backend server (172.17.2.21) — deploy the renamed backend

- [x] **Done 2026-11-06 15:50** (backups suffix `.bak-preSamadhan-20261106-155036`; `/api/samadhan/me` 401, `/api/setu/me` 401,
      `/portal/config` 200 on both, change-control 401; log: legacy schema `setu` in use). Copy `backend/samadhan` to `~/samadhan-upload` and run `deploy-dev-server.sh` (`backend/samadhan/deploy/README.md`
      steps 1–3). It replaces the server's old `setu/` folder (kept as a backup) and the old mount in its `server.js`.
      Check: `/api/samadhan/me` → 401 and `/api/setu/me` → 401 on `localhost:4001`.
- [ ] nginx: run `add-samadhan-nginx-route.sh` once (sudo). **2026-11-06: not done - `emamiadmin` has no sudo rights
      (not in the sudo group).** The server admin runs: `sudo bash /home/emamiadmin/add-samadhan-nginx-route.sh` (script already there). It adds `/dev-api/api/samadhan/` and keeps
      `/dev-api/api/setu/`. Until then the frontend falls back to `/api/setu` by itself, so the order does not matter.
- [ ] Production backend and its nginx: the same two steps through your normal release process (not done by Claude).

## 2. Database schema rename (once per database, after step 1)

- [x] **Done 2026-11-06 (approved):** `7.0-rename` applied on Devhubfactory; only schema `samadhan` exists, 1333 tickets intact, dev
      backend restarted and serving. Production uses its own database `Prdhubfactory` (no Setu/Samadhan there). Original text:
      **Dev** (`10.17.12.4` / `Devhubfactory`, needs your approval first): on the server
      `node samadhan/db/migrate.js status`, then `node samadhan/db/migrate.js up 7.0-rename --yes && pm2 restart emami-hub-backend-dev`.
      Before that, confirm no other running copy of the **old** code uses this database (for example production on the
      same database): an old copy would stop finding the `setu` schema. Undo: `down 7.0-rename --yes`.
- [ ] **Production**: by the release process, after the production backend runs the v7 code.
- Until this is done the backend logs `schema "samadhan" not found - using the legacy schema "setu"` and works normally.

## 3. Server environment variables (rename when convenient — the old names keep working)

On each backend server (`.env` / PM2 env), add the new name with the same value, then remove the old one later:

| Old | New |
| --- | --- |
| `SETU_MAIL_ENABLED` | `SAMADHAN_MAIL_ENABLED` |
| `SETU_MAILBOX` | `SAMADHAN_MAILBOX` |
| `SETU_AI_ENABLED` | `SAMADHAN_AI_ENABLED` |
| `SETU_WHATSAPP_ENABLED` | `SAMADHAN_WHATSAPP_ENABLED` |
| `SETU_WHATSAPP_TOKEN` | `SAMADHAN_WHATSAPP_TOKEN` |
| `SETU_WHATSAPP_PHONE_NUMBER_ID` | `SAMADHAN_WHATSAPP_PHONE_NUMBER_ID` |
| `SETU_WHATSAPP_APP_SECRET` | `SAMADHAN_WHATSAPP_APP_SECRET` |
| `SETU_WHATSAPP_VERIFY_TOKEN` | `SAMADHAN_WHATSAPP_VERIFY_TOKEN` |
| `SETU_WHATSAPP_API_VERSION` | `SAMADHAN_WHATSAPP_API_VERSION` |
| `SETU_APP_DIR` (demo scripts) | `SAMADHAN_APP_DIR` |
| `NEXT_PUBLIC_SETU_API_URL` (local dev only) | `NEXT_PUBLIC_SAMADHAN_API_URL` |

Rule: an empty new value counts as "not set", so the old value is used. New optional ones: `SAMADHAN_DB_SCHEMA`
(default `samadhan`), `SAMADHAN_LEGACY_SUNSET` (default `2027-05-31`).

## 4. Meta WhatsApp webhook (only if WhatsApp is connected)

- [ ] In the Meta app (WhatsApp > Configuration > Webhook) change the callback URL from
      `https://audit-capa-api.emamiapps.in[/dev-api]/api/setu/whatsapp/webhook` to
      `https://audit-capa-api.emamiapps.in[/dev-api]/api/samadhan/whatsapp/webhook`, same verify token. Admin > Channels
      shows the new URL. The old URL keeps working until the sunset date, so this can wait.

## 5. Manage Access app id switch `setu` → `samadhan` (coordinated, later)

Phase 1 made the backend accept grants under both ids and keep writing to the id in use (today `setu`). The hub tile
id is still `setu` (only its URL changed), so nothing changes for users yet. To finish the switch, together, in a quiet
hour, per environment:

1. Deploy a hub build whose tile id is `samadhan` (`hub-next/src/data/mockData.ts`: tile `id: 'samadhan'`, keep
   `setu: '/apps/samadhan'` as an alias slug) and add `{ id: 'samadhan', name: 'Samadhan', cat: 'IT' }` to
   `embedded-apps/access-tracker/src/lib/apps.ts` (another app's file — one line, needs your OK).
2. Right after, move the grants: `UPDATE emami_apps.authorized_user_apps SET app_id = 'samadhan' WHERE app_id = 'setu';`
   and the same for `emami_apps.app_stages` (history, events and old inbox rows are **not** rewritten). Undo: the
   reverse `UPDATE`. Claude prepares this as a script with up / down when you ask; it needs your approval to run.
3. Between steps 1 and 2 (a few minutes) the hub tile may be hidden for some users; opening `/apps/samadhan/` directly
   works throughout, because the backend accepts both ids.

## 6. Hosting, links and monitoring

- [ ] Optional: an Amplify Console redirect `/apps/setu/<*>` → `/apps/samadhan/<*>` (301, keep query string). The
      `embedded-apps/setu` stub already forwards every old link, so this is only a speed-up.
- [ ] Monitoring / uptime checks pointing at `/api/setu/...` or `/apps/setu/...`: point them at the new paths.
- [ ] Bookmarks and the portal link shared with distributors (`/apps/setu/portal/`): they forward; update printed
      material and email signatures to `/apps/samadhan/portal/` when convenient.
- [ ] A scheduler calling `POST /api/setu/jobs/run` (EventBridge or similar): change to `/api/samadhan/jobs/run`.
- [ ] Later (Phase 9): the SAP Cloud ALM destination uses `/api/samadhan/integrations/...` from the start.

## 7. End of the alias period (not before 31 May 2027, and only when the logs show no more callers)

The backend logs every `/api/setu` caller (`[samadhan] legacy path /api/setu/...`). When the log is quiet for a few weeks
and steps 1–6 are done, the aliases (`/api/setu` mount, `embedded-apps/setu` stub, `SETU_*` fallback, legacy schema
fallback, `setu` grant id) can be retired in a separate, reviewed change.
