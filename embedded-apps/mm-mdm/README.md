# SAP MDM Portal – Material Master (Create, MC)

Next.js 14 + React 18 + TypeScript front end for the Material Master MDM replacement of
`/INOWITS/MM_CREATE_PROC`, following *Material Master MDM replacement – implementation plan
and approach*, *Material_view_MDM* and the logic coverage matrix. Runs on demo data.

```bash
npm install
npm run dev     # http://localhost:3320/apps/mm-mdm/, t-code ZMDM_M
npm run build   # static export to dist/ (what the hub build merges in at /apps/mm-mdm/)
```

Use the user switch in the top bar to act as the initiator or as the agent of any of the 7 levels.
**Reset demo data** (sidebar) restores the seed requests.

## Flow (per the FS)

| Step | Screen | Replaces | Who |
| --- | --- | --- | --- |
| Start | Material creation key data, as on the SAP initial screen: material type, industry sector, material group, business vertical, scheme, product hierarchy (Banner → Brand → Product → SKU → Variant → Scheme pop-up), division, description (40 characters) and long text; organizational data: plant, storage location, sales org, distribution channel, warehouse number, storage type. Every field has an F4 value help; dependent lists follow their parent. Duplicate check, view selection, copy from reference. *Proceed to material creation* or *Save as draft* (both create status 00) are enabled only when all required fields hold valid values | V_INIT | Initiator |
| Normal view | New material request screen only: key and organizational data, long text, duplicate check; submit straight to level 1 or save as draft. A draft or sent-back request is corrected on the same screen (`/master/material/new/?id=…`). The initiator does not fill any material view. | V_INITIATOR, V_DISPLAY | Initiator |
| Preliminary view | Request page: only the views the backend assigns to the level (View Visibility); views not flagged read-only are editable; save, check, approve, send back, forward, reject | V_REVIEWER | Levels 1–7 |
| Final approval | Same, MDM team may edit every tab; *Approve and post* posts the material and assigns the number | V_APPROVER | Level 7 |
| Forward | Person asked for input returns it (back to the same level) or rejects | V_FORWARD | Any agent |
| Search | Scope, status, material type, text | V_SEARCH | All |

**Workflow levels for FERT, FRT2 and WIP** (one shared definition, `lib/workflowConfig.ts`): L1 Sales Team, L2 Sales Team CRS, L3 Legal
Team, L4 Quality Team, L5 Supply Chain, L6 CQA Team, L7 Approver MDM Team. Each level maintains
its own view; the MDM team can correct all.

**Status codes**: 00 draft, 01 in approval, 02 sent back, 03 rejected, 04 forwarded, 05 approved and posted.

**Rules kept out of the screens.** Field control, allowed actions, validation, routing, duplicate
check, description builder and posting all live in `lib/service.ts`, named after the function
imports of ZMM_MDM_SRV (StartRequest, SaveDraft, Submit, Approve, SendBack, Reject, Forward,
DeleteDraft, CheckDuplicate, GetFieldControl). The service also ignores edits
to fields the user may not change. Swap these functions for OData calls through the Next.js
server layer to go live.

**Delete** is draft-only (status 00), as agreed in the FS. Change (MX) and extension (ME) are
shown as phase 2.

## Structure

```
app/master/hierarchy            Product Hierarchy & CRS set-up (ZMDM_PH): product hierarchy creation or CRS product grouping
app/master/material/            Home (waiting for me, my requests)
app/master/material/new         New material request (V_INIT)
app/master/material/requests    Search (V_SEARCH)
app/master/material/requests/view  Request page, ?id=<TransId> (static export: no dynamic segment) (initiator / reviewer / approver / forward / display)
app/master/material/data        Posted materials, "use as reference"
lib/service.ts                  Demo ZMM_MDM_SRV: all rules
lib/workflowConfig.ts           Levels, users, workflow definition, statuses (WF_DEF, WF_LVL, WF_ROLE, USR_DEP)
lib/fieldConfig.ts              Key data fields (required flags), field lookup and display helpers
lib/materialViews.ts            The 24 SAP material views: blocks, fields, value lists, rule defaults
lib/viewVisibility.ts           MOCK of the backend View Visibility table (which level sees / may change which view)
lib/valueHelps.ts               MOCK value helps (F4 lists) and product hierarchy – replace with SAP calls to go live
components/ValueHelp.tsx        F4 field, value help pop-up, product hierarchy pop-up, long text
lib/mockData.ts                 Posted materials and one request at every stage
lib/setupData.ts                MOCK CRS value helps, created hierarchy nodes and CRS groupings (localStorage)
```

## Assumptions to confirm (open items)

1. **Status code meanings** 00–05 above – confirm against M_TRANS / CM_META.
2. **Resubmit after send back** goes to level 1 (`RESUBMIT_TO` in workflowConfig.ts; can be set to the sending level).
3. **Forward** = ask another agent for input, work item returns to the same level. Confirm against V_FORWARD / FRD_STS.
4. **View visibility comes from the backend.** The portal asks `getViewVisibility(materialType, level)` in lib/service.ts and shows only what it returns. The backend must return one row per material type, level and view: `materialType` (MTART), `level` (0 = initiator, 1–7 = reviewer level), `view` (portal view id, see lib/materialViews.ts) and `readOnly` (true = display only). Until then lib/viewVisibility.ts holds a copy of Material_view_MDM.docx for FERT (FRT2 and WIP use the same rows): L1 Sales edits Basic Data, Plant Data Storage 1, Sales Gen/Plant, MRP 1–2, Sales Org 1–2, Sales Tax; L2 CRS reviews its sales views read-only; L3 Legal edits Foreign Trade Export/Import; L4 Quality edits Basic Data, Costing 1–2, MRP 1–4, Purchasing, Accounting 1–2, Quality Management, Text, Work Scheduling (the standard price check runs here); L5 Supply Chain edits Basic Data; L6 CQA edits Plant Data Storage 1 and MRP 1; L7 MDM sees every view and edits Foreign Trade Export only. Forecasting, Warehouse Mgmt 1/2 and Plant Data Storage 2 are editable by no level in the document – to confirm.
5. **Description** is free text, 40 characters (MAKTX); long text up to 1000 characters.
6. **TransId format** `MC` + 10 digits – confirm against M_TRANSID_GENERATE.
7. **FERT, FRT2 and WIP** share one workflow definition; other material types are listed but blocked.
8. **Product hierarchy** = six 3-digit codes appended in order (Banner + Brand + Product + SKU + Variant + Scheme = 18 characters).
9. **Required key fields** follow the SAP asterisks (material type, industry sector, material group, division, description, plant, storage location, sales org, distribution channel); change them in `KEY_FIELDS`.
10. All value-help contents are **mock** (FRT2/WIP texts, material groups 413–414, verticals, schemes, divisions, plants, hierarchy). Sales extension / mass sales extension is planned for later.
11. **Product Hierarchy & CRS (ZMDM_PH)** runs before material creation. New hierarchy nodes are added under their parent and show up at once in the material request's hierarchy pop-up. The **CRS grouping** key is built as CRS product + product group + SKU group + size and unit (e.g. `CP0001PG1SG2-50G`) – confirm the real format. Attachments keep only the file name and size in the demo.
