# Admin: Workflow visibility (rebuild of /INOWITS/UWL)

SAP: `ZCL_MM_MDM_ADM_UWL` (source: `docs/sap-eds/ZCL_MM_MDM_ADM_UWL.abap`), called through AdminCall of ZMM_MDM_SRV_SRV, hub route `POST /api/me/mm-mdm-admin/UWL/<op>`.
Front end: `components/admin/WorklistScreen.tsx`, `components/admin/uwl/uwlTable.tsx`, `lib/admin/uwlApi.ts`, CSS block `/* admin: worklist */`.
All ops are read only (SQL only: SWWWIHEAD, SWWUSERWI, /INOWITS/M_TRANS, /INOWITS/TRANS_I, /INOWITS/WF_SLA, USR21/ADR6/ADRP, DD07T). No SAP_WAPI/container reads.

## Ops
Payload always gets `actor` (e-mail) and `isAdmin` from the hub. Result `{ok:true,data}` or `{ok:false,messages:[...]}`.
- `my`: open (READY dialog) work items of the caller, all app ids. Filters: `app`, `sort`, `dir`, `top` (default 50, max 500), `skip`. The e-mail is mapped to SAP user(s) via USR21 + ADR6 (SMTP_SRCH then full compare, case-insensitive); the technical gateway user is never used. No SAP user for the e-mail -> empty list plus `note`.
- `all`: all users. Filters `initiator` (user id or name part), `agent` (id or name part), `app`, `from`/`to` (YYYY-MM-DD, created date; default last 30 days unless `allDates:true`), `status` (request status 00-05), `level`, `q` (request no., object, text), `breached`, `staleOnly`, `sort` (created, age, app, level, status, agent, initiator, request, text), `dir`, `top`, `skip`. Non admin (`isAdmin` false): `agent` and `initiator` are discarded and only his own items are returned (`scope:"own"` plus a note).
- `meta`: options for the dropdowns: apps, levels, request statuses with counts of open items.

Result data of `my`/`all`: `scope, asOf, staleDays(90), user, sapUsers, note, total, top, skip, sort, dir, counts{open,breached,stale,closedRequests,oldestDays,byApp,byLevel,byStatus,byAgent(top 15)}, items[]`. Counts are over the whole filtered set, items are the requested page. Item: `wiId, topWiId, task, text, appId, appName, transId, objValue, reqStatus, statusText, level, levelNote, agents, agentNames, initiator, initiatorName, created (ISO), ageDays, slaDays, slaBreached, stale, orphan`. Ids keep their leading zeros (strings).

## How things are derived (be aware)
- Rows: READY work items of type W joined to M_TRANS on TOP_WI_ID (about 2,141 on EDS), agents from SWWUSERWI (one row per agent, shown comma separated).
- Level: derived, not read from the container: highest completed level in TRANS_I (STATUS C) plus one; sent back (status 04) = L0; closed requests (00, 03, 05) with an open item have no level and are flagged "stray item". Can differ from SAP's LEVEL container element on unusual routes.
- SLA: WF_SLA by first letter of the app id. SAP does not store on the item whether it is a review or an approval, so the larger value (approver, 6 days) is used: a flagged item is late for sure, an unflagged one may still be late as a reviewer step (4 days). Calendar days, not working days (how CL_WF.SEND_SLA_MAIL counts was not confirmed). The screen says this in the tooltip of the Age column and of the badge.
- Stale: open for more than 90 days.
- Initiated by: M_TRANS.USER_ID (the flow item creator is the system user). Name = ADRP last + first name, otherwise the user id.
- Link: MC, MX, ME rows link to `requestHref(transId)` (this app). Other app ids show the row with the label "opens in the legacy app" (no invented links).

## Differences from the old app
The old UWL was only the caller's own inbox (powl worklist of sy-uname, MDM tasks plus HR noise), columns text/created/initiated by, filter initiator + date. New: level, status, agents, age, SLA and stale flags, KPI tiles, all-users view for admins, by-agent summary, server paging and sorting by real dates, CSV export of the page. Not ported: the dead AND/OR radio, the websocket auto refresh (manual Refresh instead), the embedded legacy components, the "My Request" dashboard button, HR tasks.

## Test evidence (EDS client 900, 2026-11-20, direct AdminCallSet calls)
- `meta`: 36 app ids with counts; 0.7 s. `all` allDates: total 2141, breached 2085, stale 2127, closed-request strays 51, oldest 2566 days; 0.6 s.
- Default window (last 30 days) 9 items; 2026-11-01..20 8 items; 2019 range 89 items.
- `my` for subham.ghosh@emamigroup.com resolved to SAP user MDM_USER1 -> 259 items (56 MC); e-mail of user 90009349 -> 0 items; unknown e-mail -> note.
- Non admin sending `agent=IT_ABAP`: scope own, only MDM_USER1 items returned.
- Admin combined filter (VC, breached, sort age desc, level L1, status 01, initiator abap, skip 1): 169 matches, correct page order.
- Unknown op -> `{"ok":false,...}`. JSON numbers/booleans/strings typed correctly (leading zeros kept).
- `npx tsc --noEmit` clean. The screen was not clicked through in a browser and the hub route was not called end to end (only SAP side tested).

## Open / uncertain
Level and SLA semantics above; names only for users with address data (test users like IT_ABAP show the id); the max 500 page size and in-memory filtering rely on the READY item count staying in the low thousands (SQL takes about 0.5 s now); legacy-app links not offered because the WD URL scheme for the new hub is unknown.
