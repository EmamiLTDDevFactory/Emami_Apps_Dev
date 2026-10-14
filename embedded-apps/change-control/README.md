# IT Change Control Board

Raise IT changes, assess their risk, get CAB approval, and track implementation through to closure. Every action goes into an append-only audit trail.

- **Frontend:** this folder. A Next.js 14 static export served at `/apps/change-control`, merged into the hub's `dist/` by `scripts/build-embedded-apps.js`.
- **Backend:** `backend/changeControl.js`, mounted at `/api/change-control` in `backend/server.js`. It uses its own `change_control` Postgres schema (`changes`, `votes`, `comments`, `history`), and the module creates that schema on first request.
- **Sign-in:** there is no login of its own. The app uses the hub session token from localStorage, sent as a Bearer token, like every sibling app.

## Roles (Manage Access → IT Change Control Board)

| Role | Can |
|---|---|
| User (Requester) | Raise, submit and cancel their own changes; implement them (or the named implementer does) |
| Change Manager | Assess risk, forward to CAB, return to requester or reject, close after post-implementation review |
| CAB Member | Vote while a change is in CAB review |
| CAB Chair | Vote, make the final CAB approve or reject decision, approve emergency changes (ECAB), close |
| Admin | Everything a CAB Chair can do, plus any implementation step |

Nobody can review, vote on, approve or close a change they raised. The backend enforces every rule, and the UI only shows the actions the backend returns.

## Workflow

`Draft → Submitted → CAB Review → Approved → Implementing → Implemented → Closed`. A change can also end as *Rejected* or *Cancelled*.

- **Standard:** pre-approved; it goes straight to Approved on submit. It cannot be high risk.
- **Normal:** the Change Manager assesses risk (impact × likelihood, 3×3) and forwards it, CAB members vote, and the CAB Chair decides.
- **Emergency:** the CAB Chair can approve it directly from Submitted. A comment is required.

## Local development

```bash
npm install
npm run dev        # http://localhost:3250/apps/change-control/
```

The app calls `https://audit-capa-api.emamiapps.in[/dev-api]/api/change-control` by default. To use a local backend, set `NEXT_PUBLIC_ACCESS_API_URL=http://localhost:<port>/api`. A hub session must already be in localStorage (`emami_apps_user_email`, `emami_apps_session_token`).
