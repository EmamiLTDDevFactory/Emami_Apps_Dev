# Shelf Life Deviation (embedded app)

Next.js port of the SAPUI5 freestyle app `com.emami.shelflifedeviation`:
the CPD Category Head approval worklist plus the CADE deviation report (Z-Report).
It follows the same conventions as `fm-po-deviation` and `audit-tool`.

## How it fits into Emami Apps

| Concern | How |
|---|---|
| Hosting | Static export (`output: 'export'`, `basePath: /apps/shelf-life-deviation`). `npm run build` writes `dist/`, which `scripts/build-embedded-apps.js` merges into the hub at `dist/apps/shelf-life-deviation/`. No new Amplify env vars or rewrite rules needed. |
| Login | No login screen of its own. `src/lib/hubEmailLogin.ts` is the identical copy every sibling uses. Without a hub session (`emami_apps_session_token` + `emami_apps_user_email` in localStorage) the app redirects to `/`. |
| User | The hub email replaces `sap.ushell...getUser().getId()`: it is the key of `UserSet('<email>')` and `ApprName` on approve (`src/lib/user.ts`). |
| SAP | Browser calls the shared Azure NGD gateway directly: `.../api/NGD/ZQM_SLED_APPROVAL_SRV` (`src/lib/config.ts`). No CSRF handshake (the gateway does it); `$format=json` on reads, like the siblings. |
| Hub tile | `hub-next/src/data/mockData.ts` (id `shelf-life-deviation`, category CQA). |
| Access | Granted per user in Manage Access with the single `User` role. Whether someone sees the Approval Worklist still comes from SAP (`UserSet` `Flag = 'X'`). |

## SAP calls (unchanged from the UI5 app)

| When | Call |
|---|---|
| Start-up | `GET UserSet('<email>')?$expand=NAV_UserToAction` (approval tab visibility) |
| Start-up | `GET ActionSet` (KPI counts) |
| Start-up | `GET UserSet('<email>')?$expand=NAV_UserToAction` (worklist rows) |
| Start-up, and each time Deviation Report is opened | `GET ActionSet` |
| Approve / Reject | `POST ActionSet` (same payload as UI5), then `GET UserSet('<email>')?$expand=NAV_UserToAction` |

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

## Kept exactly as in the UI5 code

These look unintended, but were preserved so behaviour does not change:

1. In the Z-Report CSV, GRN Date and Manufacturing Date values are written in the opposite order to their headers.
2. The Z-Report CSV exports at most 100 rows (`EXPORT_CONTEXT_LIMIT`, the JSONModel size limit in UI5).
3. `Status` is set on the row before the POST, so after a failed save the row shows the new status once the list is filtered again.
4. `formatter.js` defined `statusState` twice; the second definition is the one in effect.
