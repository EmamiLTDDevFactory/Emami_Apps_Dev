# Shelf Life Deviation (embedded app)

Next.js port of the SAPUI5 freestyle app `com.emami.shelflifedeviation`:
the CPD Category Head approval worklist plus the CADE deviation report (Z-Report).
It follows the same conventions as `fm-po-deviation` and `audit-tool`.

## How it fits into Emami Apps

| Concern | How |
|---|---|
| Hosting | Static export (`output: 'export'`, `basePath: /apps/shelf-life-deviation`). `npm run build` writes `dist/`, which `scripts/build-embedded-apps.js` merges into the hub at `dist/apps/shelf-life-deviation/`. No new Amplify env vars or rewrite rules needed. |
| Login | No login screen of its own. `src/lib/hubEmailLogin.ts` is the identical copy every sibling uses. Without a hub session (`emami_apps_session_token` + `emami_apps_user_email` in localStorage) the app redirects to `/`. |
| User | The hub email replaces `sap.ushell...getUser().getId()`: it is the `Email` key of `UserSet(Email='<email>')` and `ApprName` on approve (`src/lib/user.ts`). |
| SAP | Browser calls the shared Azure NGD gateway directly: `.../api/NGD/ZQM_SLED_APPROVAL_SRV` (`src/lib/config.ts`). No CSRF handshake (the gateway does it); `$format=json` on reads, like the siblings. |
| Hub tile | `hub-next/src/data/mockData.ts` (id `shelf-life-deviation`, category CPD). |
| Access | Granted per user in Manage Access with the single `User` role. Whether someone sees the Approval Worklist still comes from SAP (`UserSet` `Flag = 'X'`). |

## SAP calls

| When | Call |
|---|---|
| Start-up | `GET UserSet(Email='<email>')?$expand=NAV_UserToAction` (approval tab visibility and the worklist rows; the UI5 app read it twice) |
| Start-up | `GET ActionSet` (KPI counts) |
| Start-up, and each time Deviation Report is opened | `GET ActionSet` |
| Approve / Reject | `POST ActionSet` (same payload as UI5), then `GET UserSet(Email='<email>')?$expand=NAV_UserToAction` |

## Local development

```bash
npm install
npm run dev   # http://localhost:3000/apps/shelf-life-deviation/
```

There is no hub locally, so set the hub session once in the browser console on that origin, then reload:

```js
localStorage.setItem('emami_apps_user_email', 'your.name@emamigroup.com');
localStorage.setItem('emami_apps_session_token', 'dev');
```

## File mapping

| UI5 | Here |
|---|---|
| `manifest.json` (dataSource) | `src/lib/config.ts` |
| `Component.js`, `App.view.xml`, `App.controller.js` | `src/components/ShelfLifeApp.tsx` (inside the standard Emami Apps shell) |
| `Approvals.view.xml` / `.controller.js` | `src/components/Approvals.tsx` |
| `ApprovalDialog.fragment.xml` | `src/components/ApprovalDialog.tsx` |
| `ZReport.view.xml` / `.controller.js` | `src/components/ZReport.tsx` |
| `model/formatter.js`, `model/models.js` | `src/lib/formatter.ts`, `src/lib/models.ts` |
| `sap.ui.model.odata.v2.ODataModel` | `src/lib/odata.ts` |

## Changed from the UI5 app

1. `UserSet` is keyed by `Email` (the Emami Apps login email) instead of the SAP UserId.
2. The Approval Worklist only appears once SAP has confirmed `Flag = 'X'`. If the `UserSet` read fails, an error is shown and only the Deviation Report is available.
3. `UserSet` is read once at start-up and shared with the worklist.
4. The worklist search text is re-applied after a decision reloads the list.
5. Both tables fill the screen height (at least 5 rows) with a fixed header row, instead of a fixed 5 rows.
6. Z-Report CSV: values follow the header order (UI5 had GRN Date and Manufacturing Date swapped), every filtered row is exported (UI5 stopped at 100), and every field is quoted with embedded quotes escaped.

## Kept exactly as in the UI5 code

These look unintended, but were preserved so behaviour does not change:

1. `Status` is set on the row before the POST, so after a failed save the row shows the new status once the list is filtered again.
2. `formatter.js` defined `statusState` twice; the second definition is the one in effect.
3. Only an approval sends `ApprName` / `ApprDate` / `ApprTime`; a rejection records the reason but not who rejected it.
