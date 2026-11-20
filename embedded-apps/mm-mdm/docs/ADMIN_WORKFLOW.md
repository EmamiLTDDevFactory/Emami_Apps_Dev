# Workflow maintenance (rebuild of Web Dynpro /INOWITS/MDM_ROLE_MAIN)

Screen: `/admin/workflow` (`components/admin/WorkflowAdminScreen.tsx`, parts in `components/admin/wf/`, client `lib/admin/wfApi.ts`, helpers `lib/admin/wfLogic.ts`).
SAP: `ZCL_MM_MDM_ADM_WF` (archived in `docs/sap-eds/ZCL_MM_MDM_ADM_WF.abap`), called as area `WF` through the generic AdminCall entity of ZMM_MDM_SRV_SRV.
Hub route: `POST /api/me/mm-mdm-admin/WF/<op>` (Admin grant). Every op also refuses in SAP unless the payload has `isAdmin=true`.

## What it does
Per application and generic key (type, group, business vertical, plant, brand - all six key fields are used everywhere) it maintains:
Initiator = L0 views (tabs the requester edits); Reviewer / Approver levels (R/A, sequential 01 / parallel 02, min approvals); agents (who gets a work item = IS_APPR, who only gets mail, dates, active, department); tabs per level (per agent on parallel levels).
UI: flow strip Initiator -> Reviewer -> Approver, level cards, per-agent "Gets a work item / Notification only", tabs per step, live routing preview of the draft, engine check of the saved version, history, key points, "where is a user used", mass agent change, copy (single / whole type), delete. Unsaved-change guard, confirmations, SAP messages shown, phone layout.

## Ops (payload -> result `data`)
| op | payload | result |
|---|---|---|
| meta | - | apps (labels, value-help kinds, wfId, flags), level texts, departments, PIR types, WF_CONS, today |
| search | appId, genType.. genField4 (optional, `*` pattern) | groups[{key, levelCount, reviewerLevels, approverLevels, countedAgents, issues}], cfg |
| getGroup | key | group (levels, agents, views, l0Views), version, issues, openRequests, cfg |
| validateGroup | group, mode | valid, messages, group (counters recomputed) |
| saveGroup | group, mode create/update, version | group, new version, messages, transId, log row counts |
| deleteGroup | key, force | counts, transId; code OPEN_REQUESTS when M_TRANS has running requests |
| copyGroup | source, target, overwrite | target, counts, transId |
| copyGenType | appId, oldType, newType | copied groups |
| massAgentChange | appId, oldAgent, newAgent, gen filters, dryRun, includeInactive | groups with counts / skipped reason |
| whereUsed | user (id, pattern or mail), appId? | assignments with level, validity, gets work item or notification |
| getKeys / saveKeys | appId / appId, keys | WF_KEY rows |
| changeLog | appId, gen filters, agent, lvl, dateFrom, dateTo, limit | merged ROL_LOG + LVL_LOG rows with summary |
| simulate | key | engine messages, resolved levels and agents, notes |
| valueHelp | kind (APP MTART MATKL BUSINESS PLANT BRAND BUKRS KTOKK KTOKD VKORG VTWEG EKORG VIEW LEVELTEXT DEPT PIRTYPE USER), appId, query, limit | items key/text/extra |

## Tables written
WF_DEF, WF_ROLE, WF_LVL (delete the 6-field group key, then MODIFY, one LUW, enqueue ENQUEUE_E_TABLE `/INOWITS/WF_DEF` / `WFADM<app>`), WF_KEY (delete rows of the app not on screen, MODIFY), ROL_LOG, LVL_LOG (diff as the old app; run number from `/INOWITS/ROLE_TRANSID_GENERATE`, which also inserts a row in /INOWITS/R_TRANS as the old app did). Audit fields (created/changed on/by) are filled; CHANGED_BY is the SAP user behind the verified e-mail, else the first 12 letters of the e-mail name.
Log tables have no plant/brand column: the reason text carries `[F3=<plant> F4=<brand> by <actor>; note]`.

## Differences from the old app / bugs not copied
- gen_field3 and gen_field4 are in every key (add level/agent, remove, copy, log, search dedupe).
- Search uses typed ranges, no string-built SQL. Level numbers sort numerically (L10 after L9).
- Counters MAX_ROLE/MIN_APPR recomputed on the server at every save; stale counters shown in the list and the routing check.
- Mass agent change rewrites WF_LVL (AGENT is a key) by group replace, logs every group, previews first, changes only active unexpired rows unless asked, skips groups where the new user is already in the level.
- Delete is logged; copy refuses an existing target; save needs the version loaded (optimistic check, code STALE) plus the enqueue.
- New rules: start <= end date, duplicate ROLE key / duplicate sequence among counted approvers of a sequential level, mail format, level id `L<n>`, one definition per level id, upper case, field lengths (no silent truncation onto another record). Locked or expired users, brand with a type other than PKGN, and WF_CONS mismatches are warnings. Original literal messages kept (with their typos).
- View rows of an agent who is no longer an approver of a parallel level are a warning, not an error (live data has such rows).
- Initiator type 'I' is rejected (dead in live data; the initiator is the L0 view set).

## Not covered
Mass upload, SLA, forwarding, counters, final-mail recipients (F_MAIL), WF_CONS, MDM_SLA, M_USER/USER_F (not in the component or no UI before). Authorization object ZMDM_FE is not checked (the hub Admin grant decides). Running work items are not reassigned.

## Simulation has no side effects
`/INOWITS/CL_WF=>MAT_START( iv_simulate = 'X' )` only selects and filters; the workflow start and the L0 update sit inside `IF error_flag NE 'X' AND iv_simulate NE 'X'`. Verified live: row counts of SWWWIHEAD, M_TRANS, R_TRANS, WF_COUN, M_VWSEL, WF_* unchanged after 5 simulations (ok and failing). The engine quirk is reported: a request without plant fails whenever definitions exist, because the plant rule deletes everything.

## Test evidence (EDS client 900, 2026-11-20, throw-away keys MC / ZZTST*, app ZZT for keys)
- non-admin payload refused; unknown op; over-long values refused; validation negative cases (22 messages) as expected.
- create group with plant ZZ01 / brand ZZB: WF_DEF/ROLE/LVL rows carry the plant and brand; ROL_LOG 7 + LVL_LOG 7 rows.
- update (end date, agent move on a view, removed agent, new level): diff logged as Changed/Deleted/Added; stale version refused; missing version refused.
- foreign enqueue on `WFADMMC` (held by a second session) -> LOCKED for save and delete.
- copyGroup (existing target refused, same/empty target refused), copyGenType (2 groups), massAgentChange dry run then real (4 role + 4 view rows, WF_LVL key rewritten, logged, other type untouched), whereUsed (id, mail, pattern), changeLog (filters), keys (rules, removal), all value help kinds, numeric level order L1,L2,L3,L10.
- delete of all test groups verified by SQL; then the test log rows, R_TRANS rows and WF_KEY test rows were removed with a temporary helper class (since deleted). Final row counts equal the counts before the tests.
- Not exercised live: front end in a browser (tsc clean only), hub route with a real token, PRD/NWP (EDS only).
