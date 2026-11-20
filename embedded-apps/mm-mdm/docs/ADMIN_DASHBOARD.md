# MDM dashboard (rebuild of Web Dynpro `/INOWITS/MDM_DB`)

Screen: `/admin/dashboard` (`components/admin/DashboardScreen.tsx`, `components/admin/dash/*`, client `lib/admin/dashApi.ts`).
SAP side: `ZCL_MM_MDM_ADM_DASH` (archived in `docs/sap-eds/ZCL_MM_MDM_ADM_DASH.abap`), reached through the generic `AdminCall` entity
(`POST /api/me/mm-mdm-admin/DASH/<op>`). Live data only, no mock data, **read only**: no DB write, no workflow call that writes.

## What it shows

1. **Right now (not date bound):** open and waiting requests, stale ones (waiting more than 90 days), requests whose status and workflow disagree.
2. **Created in the window** (creation date of the T-ID, default last 30 days, or all dates): counts per status 00/01/02/03/04/05, the old board's
   "In progress" (01 + 02 + 04 together, the `status 02 expands` semantics of FM `/INOWITS/M_DB`), duplicates, average/median turnaround of completed requests.
   Each card is a click filter for the list.
3. **Stage funnel:** open requests per level and kind of step (Initiator / Reviewer / Approver), departments below each bar.
4. **Agent ranking:** the users holding the most waiting requests (from the READY work items).
5. **Aging:** waiting time buckets; the stale buckets (over 90 days, split 90 days to 1 year and over 1 year) are a separate group and are
   not drawn in the bars unless asked, so the 2019 test backlog does not drown the picture (live: 321 of 328 open material requests are stale).
6. **Broken workflows:** list of disagreements, counted per kind; click filters the list. Reported only, never repaired.
7. **Request list:** old criteria (T-ID, initiator, application, status, material type, plant, second routing field, SAP code, description, date window,
   duplicate flag; all AND), server paging (25/page), sort, CSV export of the visible page.
8. **Drill-down of one T-ID:** header, phase stepper (initiator / reviewer / approver), timeline from `/INOWITS/TRANS_I` with step durations and the waiting step
   (dashed, with the agents and "waiting since"), link to the request page (`/master/material/requests/view?id=<TransId>`, MC/MX/ME only), and the change log.
9. **Change log:** CDHDR headers and CDPOS items of the posted object (read only).

Applications: MC, MX, ME are first-class (chips); every other app id found in `/INOWITS/M_TRANS` is selectable under "Other applications". Labels are the ones
of the old code (`CASE app_id`); ids it does not describe (CMB, CR, MCX, MLB, MLC, PH, PR, PXX, VMX) show as `app <id>`, nothing invented.

## Visibility

The hub passes `actor` (verified e-mail) and `isAdmin`. Admins see all users' requests. Others see only requests they initiated (the old board's rule for non-admin groups,
`M_TRANS.USER_ID = user`): the actor e-mail is resolved to SAP users through `ADR6.SMTP_ADDR -> USR21` (address + person number), exact match on the lower case and the upper case e-mail
(`LOWER()` does not exist on this release and `SMTP_SRCH` is only 20 characters). No SAP user found = empty result and a message. The
`user` filter is ignored for non-admins; `detail` / `changes` / `changeitems` of someone else's T-ID answer "not found or not one of your requests". Pending agents of a request you
initiated are shown to you.

## Ops (all take `payload` JSON, return `{"ok":true,"data":...}`)

Common payload fields (all optional): `apps` (array of app ids; empty = all), `dateFrom`/`dateTo` (ISO date), `allDates` (bool).

| op | extra payload | result `data` |
|---|---|---|
| `meta` | | `apps[{appId,label,group,firstClass,known,total}]`, `statuses`, `flags`, `buckets`, `staleDays`, `scope{admin,restricted,users,message}`, `now` |
| `overview` | | `window{dateFrom,dateTo,total,byStatus[],inProgressOld,completed,duplicates,avgTatSeconds,medianTatSeconds,tatSamples,byApp[]}`, `now{openReal,openFresh,openStale,broken,byFlag[],byStatusAll[]}`, `stages[{appId,level,roleType,requests,fresh,stale,workItems,agents,oldestAge,avgAge,depts[]}]`, `agents[...top 40]`, `agentCount`, `aging[{appId,bucket,requests}]` |
| `list` | `transId,user,status,statusGroup(inprogress|open|broken|stale),mtype,plant,genField2,objValue,text,duplicate(Y|N),agent,level,roleType,dept,ageBucket,flag,excludeStale,page,pageSize(max 200),sort(transId|created|status|app|age),dir` | `total,page,pageSize,rows[ ... ],dateFrom,dateTo,restricted,message` (row fields: see `DashRow` in `dashApi.ts`) |
| `detail` | `transId` | `request` (row), `steps[]`, `pending[]` (one per READY work item and agent), `phases[]`, `levelSource` |
| `changes` | `transId` | `objectClass,objectId,total,headers[{changeNr,user,userName,at,tcode}]` or `supported:false` / `note` |
| `changeitems` | `transId,changeNr` | `items[{tabname,tabkey,fname,fieldText,changeInd,valueOld,valueNew}]` (max 500) |

Date window semantics (as the old board): the window filters `M_TRANS.END_DATE`, which is the **creation** date of the T-ID. A T-ID or SAP-code search, and the click filters coming from
the charts (the waiting state is not tied to a creation date), ignore the window.

## How "pending in stage" is derived (and what is an approximation)

Every query starts from `/INOWITS/M_TRANS` and joins on `top_wi_id` (SWWWIHEAD has about 500k rows; never scanned on its own).

* **Open, really:** status 01/02/04 **and** top work item `STARTED` **and** at least one READY dialog work item (`WI_TYPE W`). Live: 328 for MC+MX+ME, which is exactly the figure the spec found.
* **Waiting since / age:** minimum `WI_CD/WI_CT` of the READY work items of the T-ID (exact; this is when the step reached the agent). Age = server time now minus that.
  Server time is used on both sides; the spec noted a clock difference of about 17 minutes between `M_TRANS` stamps and `TRANS_I` of the same new T-ID, so ages are good to the minute at best.
* **Agents:** `SWWUSERWI.USER_ID` of the READY work items (exact; a READY item with no `SWWUSERWI` row shows as "no agent").
* **Level:** container element `LEVEL` of the top workflow item. The container is not SQL-readable through the WAPI, but it is stored as hex-encoded XML in `SWWCNTP0`
  (1024-byte chunks, `LENGTH` valid bytes). The class concatenates the chunks of the top item, decodes UTF-8 and reads the value behind `<NAME>LEVEL</NAME>` (`<VALUE href="#dNNN"/>` -> `id="dNNN">value`).
  **Checked against `/INOWITS/CL_WF=>READ` (the workflow API) on all 393 open requests of MC/MX/ME/MMC/MMX: 393 of 393 equal** (and 550 of 550 READY items in an earlier Python check).
  This relies on SAP's internal container storage, not a documented interface; if a chunk or the element is missing the level stays empty ("Level unknown") and nothing is guessed.
* **Role type of the waiting step:** from the text of the READY work item's task (`WI_RHTEXT`: "... Initiator/Reviewer/Approver Process", or a department task such as
  "Material Creation - Sales"). Reviewer is the default when the text names neither. **Department:** the part after " - " of that text; when the task names none (generic reviewer/approver tasks),
  `WF_ROLE.LEVEL_TEXT` (domain `/INOWITS/LEVEL_TEXT`) of the agent's role at the exact level, best match on agent and routing fields, **as configured now** (approximation; shown only when found).
  Parallel department tasks of one level count the T-ID once for level/type, once per department in the department breakdown.
* **Past steps** (timeline): `TRANS_I` rows; step duration = difference of consecutive row stamps (not holiday adjusted, unlike `/INOWITS/M_OVRL_TIME`). Role type of a past step from `WF_DEF`
  and its department from `WF_ROLE`, **as configured now**, best match on `GEN_FIELD/2/3`. These two are approximations for history: the tables are keyed by variants and may have changed since.
* **Turnaround:** first to last `TRANS_I` row (the old board's "Overall Time"); it is not time-to-now.

Not exact / not done: no SLA breach flag (the old board had none; `WF_SLA` unit unknown); no holiday-adjusted durations; app ids other than MC/MX/ME work for list, funnel, agents, aging, detail,
but only MC/MX/ME open a request page, and the change log exists for MC/MX/ME (MATERIAL), CX (DEBI), VX (KRED), PX (INFOSATZ) only.

## Broken workflow flags (never repaired)

`WF_ERROR`, `WF_CANCELLED`, `WF_COMPLETED` (open status but workflow completed), `NO_PENDING_ITEM` (open, workflow running, no READY item), `NO_WORKFLOW` (open status, no top work item found),
`DONE_BUT_RUNNING` (status 03 but workflow still running: the rows the old `MDS_DB_STATUS` healed on page load), `DONE_WF_ERROR`, `REJECTED_BUT_RUNNING`, `DRAFT_BUT_RUNNING`, `WF_OTHER`.
Live, MC+MX+ME: 76 requests flagged (32 NO_WORKFLOW, 30 WF_ERROR, 5 DONE_WF_ERROR, 4 DONE_BUT_RUNNING, 4 WF_CANCELLED, 1 REJECTED_BUT_RUNNING).

## Differences from the old app

* **No write on load.** The old `WDDOINIT` called `/INOWITS/UPDATE` (back-fills GEN_TYPE/GEN_FIELD*) and `/INOWITS/MDS_DB_STATUS` (sets status 03 on rows whose workflow has no READY item). Not ported; the disagreement is shown as a flag instead. The statuses stay divergent
  until someone repairs them deliberately (a job is out of scope here).
* Default window is the last 30 days, not 2 days; the old default status "Completed" is gone (the default is all statuses).
* "Waiting for" is time to now since the READY item was created; the old "Overall Time" (first to last step) is shown as turnaround.
* Server paging; the old board returned the whole table and built the stage popins in an ABAP loop for every row.
* Non-admins are scoped by initiator through the e-mail, not through `sy-uname`.
* Not carried over: Excel export with per-level columns and comments (a CSV of the visible page instead), "open in WebGUI", MMC template download, object-description search (was dead for material),
  OR search type (unused), the old authorization objects `ZMDM_DB`/`ZMDM_M` (the hub grant decides).
* New: stale separation, per-agent ranking, aging, broken-workflow report, drill-down timeline with the waiting step, change log for every posted material (the old one only for MX).

## Test evidence (EDS client 900, 2026-11-20, `ZMM_MDM_SRV_SRV/AdminCallSet`, timings are the full OData round trip from the build machine)

| call | result | time |
|---|---|---|
| `meta` | 37 app ids, flags, buckets, scope | 0.29 s |
| `overview` MC+MX+ME | open 328 (7 recent, 321 stale), broken 76, 14 stage rows, 12 agents, window 30 days: 5 requests, TAT sample 1 | 0.73 s first call, 0.48 s later |
| `overview` all apps | open 1611, broken 433, 110 stage rows | 1.57 s |
| `overview` all dates MC+MX+ME | 922 requests, 488 completed with TAT, average 61117 s | 0.49 s |
| `list` all apps, all dates, first page of 5468 | total 5468 | 0.64 s |
| `list` statusGroup inprogress (01+02+04), MC/MX/ME | 394 | 0.41 s |
| `list` open + level L1 + Reviewer + dept Sales, agent filter, age bucket, flag, stale | 97 / 24 / 4 / 30 / 321 rows | 0.3 to 0.55 s |
| `list` text "test", SAP code 400010479, T-ID 26697 (older than the window) | 107 / 1 / 1 | 0.3 to 0.55 s |
| `list` level cross-check vs workflow API | 393 open requests, 0 mismatches | 0.7 to 0.8 s per 200 rows |
| `detail` 26713 | 5 steps with durations, pending approver "MDM Cell" Suman Kumar since 11:33:24, phases done/done/pending, flag DONE_BUT_RUNNING | 0.48 s |
| `changes` 26713 / 24304 | 99 / 828 change documents | 0.4 / 0.34 s |
| `changeitems` | fields with labels (e.g. MBEW STPRS "Standard price" 0.00 -> 1806.00) | 0.25 to 0.36 s |
| non-admin (e-mail of a user with requests) | scope = that user's SAP user, 414 requests, own T-IDs only; another user's T-ID -> "not found or not one of your requests"; unknown e-mail -> empty + message | 0.28 to 0.38 s |

Front end: `npx tsc --noEmit` clean. The page itself was not opened in a browser in this build (no `next build`/dev server run by agreement); the hub route and `getAdminSession` were not exercised from the UI.
