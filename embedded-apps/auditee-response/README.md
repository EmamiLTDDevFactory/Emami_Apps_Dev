# Auditee Response (auditee-response)

Replaces the two SAP auditee Web Dynpros: **ZAUDIT_TOOL** (audit observations) and **ZMSD_MIS_OBSERVATION** (MIS observations, the
same screens on the MIS tables). An auditee (person responsible or owner of an observation) reads the audit finding, writes a
response per observation and submits it. Each assignee submits their own responses; the workpaper (sub-process) moves to
**Management Responded** only when the last assignee has submitted, and SAP then mails the reviewer and the performer
(`Management Response:-<process>`).

This is an **embedded app of Emami Apps**: a static Next.js export served by the hub at `/apps/auditee-response/`. Hub tile
"Auditee Response", category Cross-Function, stage WIP, **open to every signed-in hub user** (no Manage Access grant needed:
`OPEN_TO_ALL_APPS` in `backend/server.js`; SAP decides which observations a person sees).

What the Web Dynpros got wrong and this app does not: identity from a URL parameter (anyone could act as anyone), no status gate
(drafts and closed workpapers editable, submit from any status), one auditee's click closing the whole workpaper, performer never
mailed, any visitor deleting auditor annexures (spec: `fix/auditee-app-spec.md`, WD-1..WD-17).

## Screens

- **My observations** (`/?track=audit|mis`): tabs "Audit observations" and "MIS observations"; workpapers grouped by process /
  sub-process with a status badge (Awaiting response, Management responded, Closed), counts, financial-year and status filters, search,
  "Waiting for: <names>" once I have submitted.
- **Workpaper** (`/workpaper/?track=&guid=`): each of my observations with the audit finding read only (title, observation, root cause,
  business implication, financial impact, recommendation, risk, residual risk, timeline, categories) and my response (textarea with a
  character counter, 4000 max). **Save draft**, **Submit to reviewer** (confirmation; enabled only while the workpaper is "Send to
  Auditee" and every one of my observations has text; after my submit it reads "Submit again" - SAP lets me overwrite my own text until
  everyone has submitted). Read only with a banner once Management Responded or Closed. Attachments panel: list and download all files of
  the workpaper (auditors' annexures and every auditee's files), upload, delete only my own uploads. Unsaved-changes warning on leaving.
- Loading skeletons, empty states, error banners with SAP's own text, busy and disabled buttons during writes, data reloaded after
  every write. Hub look and feel (plum palette, Inter / Sora, aurora and glass, side pane; drawer below 1024 px), dark mode from the
  system setting, tablet width. English texts.

## Drafts

As built on SAP there is no per-assignee "submitted" marker (ZMSD_OBSERV_MAIL / _MLM have no free field), so **an assignee side counts
as answered when its comment is non-empty, and SAP stores only submitted responses.** Drafts therefore live in the browser
(`localStorage`, key `aud_draft:<user>:<track>:<guid>:<line>|<ownerLine>`, every access in try/catch; without storage the draft lasts
while the page is open) and are cleared after a successful submit. The backend reports `draftStorage: 'browser'`; if SAP ever gets a
marker, `AUD_DRAFTS=sap` switches "Save draft" to `PUT /responses` without a UI change.

## Run it

Demo mode (default): sample workpapers in the browser (`sessionStorage` of the tab; a new tab starts fresh), no backend, demo user
Ravi Kumar. Includes a workpaper where another assignee is still pending, one where I am the last assignee, responded and closed ones,
and two MIS issues.

    npm install
    npm run dev              # http://localhost:3330/apps/auditee-response/
    npm run build            # static export to dist/ (what the hub's Amplify build does)

Live mode: `AUD_MODE=live npm run build`, or add `?aud=live` (remembered in the browser; `?aud=demo` switches back). No host runs live
by default (`LIVE_HOSTS` in `src/lib/api.ts` is empty) until the SAP side is transported and tested. `AUD_API_BASE` overrides the backend
URL (default `https://audit-capa-api.emamiapps.in/dev-api/api/me/auditee` on dev / localhost, `/api/me/auditee` on www).

## Hub backend (`backend/auditeeResponse.js`, `backend/auditeeResponseSap.js`, mounted at `/api/me/auditee`)

Routes (all take `?track=audit|mis`, default audit): `GET /observations?fy=`, `GET /workpapers/:guid`, `PUT /workpapers/:guid/responses`
(409 while drafts live in the browser), `POST /workpapers/:guid/submit` `{responses:[{lineItem, ownerLineItem, text}]}`,
`GET|POST /workpapers/:guid/attachments` (upload: raw body with `Slug`, or JSON `{fileName, mimeType, contentBase64}`),
`GET /workpapers/:guid/attachments/:name/content`, `DELETE /workpapers/:guid/attachments/:name`, `GET /config`, `GET /health`.
Errors: `{ "error": { "message": "..." } }` - SAP's business text as is, 400 / 403 (not an auditee, not mine) / 404 / 409 (wrong status,
locked) / 413 / 415 / 502 (SAP down or technical error) / 503 (not configured).

Identity: the hub session (Bearer JWT) is verified like every `/api/me` module; the verified e-mail - never one from the browser - goes to
SAP in `X-Emami-User`. Header keys of a submit are taken from the workpaper SAP just returned to this user, and only the user's own
assignee rows are sent. All SAP names are in the MAPPING section of `auditeeResponseSap.js` (one place to adjust).

| Env var (backend `.env`) | |
| --- | --- |
| `AUD_SAP_ODATA_BASE` | service URL, e.g. `https://<azure gateway>/api/EDS/ZIT_MSD_TOOL_INTERNAL_AUDIT_SRV` (required) |
| `AUD_SAP_CLIENT` | sap-client (URL parameter and header), optional |
| `AUD_SAP_AUTH` | `gateway` (default: the gateway signs in) or `basic` (dev only, with `AUD_SAP_USER` / `AUD_SAP_PASSWORD`) |
| `AUD_SAP_USER_HEADER` | header with the verified e-mail, default `X-Emami-User` |
| `AUD_DRAFTS` | `browser` (default, = as built) or `sap` |

Deploying backend changes is manual on the PM2 box (patch the live `server.js`, do not overwrite it: it has uncommitted hardening).

## SAP prerequisites

- The SAP code of `ZCL_ZIT_MSD_TOOL_INTER_DPC_EXT` ("SAP OData - as built" + updates 1 and 2 in `fix/AUDITEE-CONTRACT.md`) must be
  deployed to EDS in a **new modifiable transport** (EDSK9B0EDF was released) and tested per the contract's test plan; then NGD / production.
- **No TVARVC entry is needed** (ZAUDIT_HUB_TECH_USER was dropped).
- **User master:** every auditee's hub e-mail must exist in the audit tool's Users master **ZIT_MSD_USR_MSTR** (not deleted) with the
  user id (UNAME) that the auditors pick as person responsible / owner. Auditees need no SAP logon user. Unknown e-mail -> "Your Emami
  Apps account is not set up as an auditee in the audit tool (no user master entry)."
- The backend also reads `ZUSER_MASTERSet` (cached 10 min) to find the caller's UNAME (to tell my assignee rows from others') and display
  names. TODO(sap-contract): it assumes the fields `Email` and `Uname`; simpler would be a `MyRole` field on each assignee row.
- Risk noted by the SAP side: SAP does not verify `X-Emami-User`; restrict who can reach the service (gateway / ICF) to the hub.

## Open points (TODO(sap-contract) in the code)

Not verified on EDS yet. Assumed: ZUSER_MASTERSet field names, MIS attachments on the same entity set and keys (the contract says shared),
the response field length (4000 in the app and backend), `MailText` empty = nobody pending.

## Tests

| Script | What |
| --- | --- |
| `npm run typecheck` | TypeScript strict |
| `npm test` | Vitest: the demo service rules (tracks, submit rule, all-assignees rule, read only, own files) |
| `npm run test:e2e` | Playwright, demo mode, production export: tabs / filters / search, draft in the browser across a reload, submit with confirmation and "Waiting for", last assignee -> Management responded and read only, closed banner, download, upload / duplicate / delete own, error state, tablet width. Fails on any console error |
| `npm run test:a11y` | axe-core on every screen and state (list, empty result, MIS tab, editable, submitted, dialog, closed) in light and dark mode |

Backend: `cd ../../backend && npm test` (`test/auditeeResponse.test.js`: validation, mapping, payload with only my rows, error mapping,
the service against a stubbed SAP incl. header and sap-client on every call). Playwright and axe-core are dev dependencies only.

## Structure

    src/app/                 page.tsx (My observations), workpaper/page.tsx (detail), layout, globals.css
    src/components/          AppShell (side pane), AttachmentsPanel, ConfirmDialog, StatusBadge, icons
    src/lib/                 types, api (demo and live behind one interface), demo (sample data + rules), drafts (browser drafts)
    tests/                   vitest; tests/e2e Playwright + axe
    ../../backend/auditeeResponse*.js   hub backend routes and the SAP adapter / mapping
