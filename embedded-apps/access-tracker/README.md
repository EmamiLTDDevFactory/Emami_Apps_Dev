# Access Tracker

Read-only dashboard over the hub's Manage Access data: who has access to which Emami App, every
grant and revoke, and who actually signs in and uses their apps. Static Next.js export served at
`/apps/access-tracker`, merged into the hub build by `scripts/build-embedded-apps.js` like every
sibling app. Hub tile under **IT**.

## Screens

| Screen | What it shows |
|---|---|
| Overview | KPI tiles (authorized/active users, signed in last 7 days, never signed in, app opens), users per app, hub access-level split, last-sign-in buckets, access changes per day (30 days), most opened apps, latest changes |
| Who has access | List or user x app matrix of every authorized user, their hub level, status and role per app; search, filter by level/status/app; CSV export |
| Change log | Every Manage Access change grouped by day, with grant/revoke/edit tallies; filter by period, type, app, admin; CSV export |
| Sign-in activity | By user: last-sign-in buckets and a sortable usage table. By app: opens, adoption (opened vs granted), drill-down to the people behind each app; CSV export |

Clicking any person opens a drawer with their level, status, usage, app roles, per-app opens and
their own change history.

## Data and access

No backend of its own and no new endpoints. The browser calls the hub backend's existing
read-only routes (`backend/server.js`):

- `GET /admin/overview`, `/admin/roster`, `/admin/apps`
- `GET /admin/user/:email/apps`, `/admin/app/:appId/users`
- `GET /access/history[?email=]` (latest 200 changes)

Each route is behind `requireAccessManager`: the hub session JWT (same-origin localStorage, written
at sign-in) goes as a Bearer token, and only an active **Super Admin or Admin** gets data back.
Anyone else sees an "Admins only" screen. To show the tile, grant `Access Tracker` to the person in
Manage Access as usual.

Base URL: `https://audit-capa-api.emamiapps.in/api`, or `/dev-api/api` when the page is on a `dev`
hostname (same rule as Payment Tracking and Dev Tracker). `NEXT_PUBLIC_ACCESS_API_URL` overrides it
for local work.

## Develop

```bash
npm install
npm run dev        # http://localhost:3240/apps/access-tracker/
npm run build      # static export -> dist/
```

The app opens only with a hub session in localStorage (`emami_apps_session_token`,
`emami_apps_user_email`). App names come from `src/lib/apps.ts`, a copy of the hub catalog; add new
apps there when they are added to `hub-next/src/data/mockData.ts`.
