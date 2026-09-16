# TimeSheet

Next.js (App Router, static export) embedded app — log work hours, submit monthly timesheets,
and manage team approvals. Served under `/apps/timesheet` once merged into the Emami Apps hub's
build (see repo root `scripts/build-embedded-apps.js`).

## Local development

```
npm install
npm run dev    # next dev — reachable at http://localhost:3000/apps/timesheet (basePath applies in dev too)
npm run build  # next build && move the static export to dist/
```

Sign-in is via the Emami Apps hub's own session (no login screen of its own on the real
deployment) — see `src/context/AppContext.tsx`'s hub-token exchange. Running standalone with no
hub session falls back to a demo "log in as" picker (`src/components/gates/Login.tsx`), gated
server-side by `ALLOW_DEMO_LOGIN` (see `server/.env.example`) and off in production.

The backend (`server/`) is a separate Express + Postgres service, deployed independently — see
its own comments for deploy details. It is not affected by anything in this frontend.
