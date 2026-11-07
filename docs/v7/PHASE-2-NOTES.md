# Samadhan v7 — Phase 2 notes: Authorization cockpit, permissions, data scope, attachments

Branch `feature/samadhan-v7`. Decisions: Q-P1 = the PLAN §7 defaults; Q-S1 = **an SFTP server, host-to-host**
(user, 2026-11-06/07; not SAP, not OData). Master prompt §K (cockpit) and §L (attachments).

## 1. What changed

### Permissions (every route) — behaviour for today's three roles is unchanged
- `lib/permissions.js`: the permission catalogue (§K 9.2, plus `company.create` and `insights.refresh`) and the
  three system profiles AGENT / SUPERVISOR / ADMIN, which reproduce the pre-v7 Agent / Supervisor / Admin checks exactly.
- `middleware/permission.js`: one rule per route (method + path → key). It runs after the hub sign-in for the whole
  Samadhan router. A route without a rule is refused (403), so nothing new is ever open by mistake. Effective rights
  are cached for 60 s per person; the last use of each permission is recorded (Access review "unused in 90 days").
- Every scattered `isSupervisor` / `isAdmin` / `requireSupervisor` check was replaced by `req.can(key)` with the key
  held by exactly the same roles (proved by `tests/permissions.test.js`).
- `/me` now also returns `permissions`, `scope` and `attachments` (on/off + limits).
- Frontend: `can()` in the app context, the menu built from permissions, and a **screen guard**: a screen the person
  may not use (menu, deep link or a typed `?screen=`) goes to their first allowed screen with a notice. On an older
  backend (no `permissions` in `/me`) the frontend falls back to the old role rules.

### Data scope (§K 9.3)
- Per person: see **all** tickets (default, and always for Admins), **my groups' + mine**, or **only mine**
  (assigned to me or watched). Applied in SQL to the ticket list, counts, saved-view counts, export, board, both
  dashboards, analytics, daily report, search, contact / company ticket lists and the bell. A ticket outside the scope
  answers 404 on every `/tickets/<id>/...` route, including bulk / merge / link bodies. Queue-wide AI insights are
  hidden for a narrowed scope. With scope "all" every query text is exactly as before.
- Workspace / application scope comes with workspaces (Phase 3).

### Authorization cockpit — Admin > Authorization cockpit (Admin only)
- Six tabs: **Overview** (KPIs, SoD warnings, last 10 changes), **Role profiles** (3 read-only system profiles + 8 seeded
  custom ones; create / copy / deactivate), **Permission matrix** (search, collapsible groups, "difference vs Agent"
  highlight, save with a reason), **User access** (profiles with valid from / to, scope, grant / deny overrides with
  expiry, effective-access preview from the same server function), **Access review** (expiring / expired / unused,
  "Revoke expired", Excel), **Change log** (before / after, who, why; filter; Excel; also in Admin > Audit log).
- Guardrails: a reason on every change; `admin.*` only via the Admin base role (never in a profile or override);
  SoD warnings (ticket.create + approval.decide; transport.manage + approval.decide) need an explicit "accept" with the
  reason; temporary access ends by itself (scheduler) and the person gets a hub-inbox notice; Admins get a quarterly
  access-review reminder in the hub inbox. Base roles stay in Manage Access / Roles & access.
- Profile types: **Adds** (rights added to the base role) and **Restricts** (caps the base role, e.g. *Auditor*).
- Deviation from the prompt: reminders go to the **hub inbox** (the Samadhan bell only carries ticket events).

### Attachments (§L) — stored on an SFTP server
- `lib/storage.js`: adapter `sftp` (production) and `local` (tests only). The SFTP client (`ssh2-sftp-client` 12.1.1)
  is **Samadhan's own dependency** in `backend/samadhan/package.json`; the shared `backend/package.json` is untouched.
  The server's host key is **pinned** (fingerprint setting), files are written under a temporary name and then renamed
  (never half-written), the connection reconnects by itself and closes after 5 idle minutes.
  Keys: `samadhan/attachments/<yyyy>/<mm>/<ticketId>/<uuid>` below the configured base folder.
- `lib/fileCheck.js`: allow-list by extension **and** content (a renamed .exe is refused), blocked: programs, scripts,
  HTML, SVG, macro files; file names cleaned.
- `lib/attachments.js`: limits per channel (Admin > General > Attachments; hard ceilings agent 25 / portal 10 /
  email 25 MB), downloads only through **5-minute signed links** issued after the permission and scope checks
  (`/files/<token>`, `nosniff`, sandbox CSP; inline only for images and PDF).
- Lifecycle: merge moves files to the primary ticket; purge deletes them from the file server; contact anonymisation
  deletes that contact's own uploads; `attachmentCount` kept on every change.
- Inbound email: the mail's files (inline `cid:` images too) are saved on the ticket / reply; files over the limits or of
  a refused type are not stored and a private note lists them and asks for the portal.
- Replies / forwards: chosen files travel with the email up to the outbound limit (20 MB; Graph draft + upload session
  for files over 3 MB); a larger set is sent as a link that needs a Samadhan sign-in.
- Portal: after "Submit ticket" the requester's files go up with a 30-minute token for that one ticket (portal limits).
- UI: Attachments card on the ticket (upload, preview in a modal for images / PDF, download, delete own; Supervisors
  and Admins delete any), paperclip chips on each message, files in reply / note / forward, new ticket and portal with
  **Ctrl+V paste** and drag-and-drop, screenshots over 2 MB / 2000 px compressed in the browser (≈85 %, JPEG / WebP)
  with "Upload original", paperclip + count in the list, "Has attachments" filter, optional "Attachments" export column
  (the default export is unchanged).
- Virus scanning: no scanner exists on the server today; the `scanStatus` column is ready and files marked not clean
  are never served.

### Database (both migrations run by themselves at start-up; additive)
- `7.1-auth`: `auth_profiles` (+8 seeded custom profiles), `auth_user_profiles`, `auth_user_scope`,
  `auth_permission_overrides`, `auth_change_log`, `auth_permission_usage`.
- `7.1-attachments`: `ticket_attachments`; `tickets."attachmentCount"` (int, default 0). The unused v1 table
  `attachments` is untouched.

## 2. Server settings for attachments (the admin team; values never in the repository)

On the dev backend (`emami-apps-hub-backend-dev/.env` or PM2 env), then `pm2 restart emami-hub-backend-dev`:

| Setting | Value |
|---|---|
| `SAMADHAN_STORAGE` | `sftp` (leave empty to keep attachments off) |
| `SAMADHAN_SFTP_HOST` / `SAMADHAN_SFTP_PORT` | SFTP server address / port (22) |
| `SAMADHAN_SFTP_USER` | the account for Samadhan |
| `SAMADHAN_SFTP_PASSWORD` **or** `SAMADHAN_SFTP_PRIVATE_KEY_PATH` (+ `SAMADHAN_SFTP_PASSPHRASE`) | credentials (key preferred for host-to-host) |
| `SAMADHAN_SFTP_BASE_DIR` | absolute folder for Samadhan, e.g. `/samadhan` (created if missing) |
| `SAMADHAN_SFTP_HOST_FINGERPRINT` | required; `ssh-keyscan <host> \| ssh-keygen -lf -` → the `SHA256:...` value(s), comma separated |

Check: Admin > General > Attachments says "Files are stored on the SFTP file server"; upload a file on a test ticket.
Network: the backend server (172.17.2.21) must reach the SFTP server on its port (firewall rule by the admin team).

## 3. How to test
- Gate: `node backend/samadhan/tests/gate.js` (on a machine short of memory run it in parts:
  `--stages=static,unit`, `--stages=api`, `--stages=rollback,attach,compat`, `--stages=golden`, `--stages=e2e`) (unit incl. `permissions.test.js` and `attachments.unit.test.js`; API
  suites incl. `authz.api.test.js` and `attachments.api.test.js` on the local file store; migration round trips for
  `7.1-auth` and `7.1-attachments`; E2E incl. screen guard, cockpit and attachments).
- Result: gate GREEN, 31 of 31 steps (2026-11-07) - `TEST-REPORT.md`, Phase 2.
- The SFTP adapter was checked against a real SFTP server (write, read back, delete, path traversal refused, wrong host
  key refused).
- By hand: as Admin open Admin > Authorization cockpit; give an Agent the *Auditor* profile until tomorrow and check they
  can read but not reply; set an Agent's scope to "Only mine" and check the list.

## 3a. Demo data for Phase 2 (dev only)

`bash ~/samadhan-demo/run.sh load-v7` (`deploy/demo/load-v7.js`): about 90 tickets over the last 14 days in 4 new demo
groups (SAP Functional, SAP Basis & Security, Infrastructure, Digital Apps) and Customer Support, worked like real ones
(replies, notes, requester follow-ups, escalations, RCA, CSAT, time logs, watchers, linked tickets, overdue ones), so the
dashboards, analytics, daily report, AI insights and action points show current numbers; 29 category / function choices
and 4 severity rules for the new groups; a demo Supervisor and 5 specialist agents; cockpit examples (permanent, expiring
and expired profiles, scopes groups / own, grant and deny overrides, an accepted SoD warning, rights unused for 90 days,
change log); 5 shared saved views, 3 shared report variants, to-dos. Real people's access is not changed. Everything is
removed by `bash ~/samadhan-demo/run.sh remove` (recorded in settings `demo.v7.manifest`).

## 4. Roll back
- Code: redeploy the previous backend folder (`samadhan.bak-preSamadhan-<ts>` from the deploy) and the previous site build.
- Database: `node samadhan/db/migrate.js down 7.1-attachments --yes` and/or `down 7.1-auth --yes` (then restart). Down
  of 7.1-auth removes all cockpit data and everyone falls back to their Manage Access role; down of 7.1-attachments
  removes the file list (the files themselves stay on the SFTP server under `SAMADHAN_SFTP_BASE_DIR`).
- Attachments only: empty `SAMADHAN_STORAGE` and restart — the UI hides attachments, nothing else changes.
