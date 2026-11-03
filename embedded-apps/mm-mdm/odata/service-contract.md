# OData service contract: ZMM_MDM_SRV (draft)

Model: `metadata.xml` (OData V2, SEGW import format). Front end constants: `src/lib/server/sap/contract.ts`.

## Entity sets

| Set | Key | Notes |
| --- | --- | --- |
| RequestSet | TransId, AppId | Header (`/INOWITS/M_TRANS`). Derived properties: MaterialType, MaterialDescription, Level, CanEdit, CanValidate, CanSaveDraft, CanSubmit, CanApprove, CanSendBack, CanReject, CanForward, CanDeleteDraft. Filter-only properties: Scope (`mine`, `inbox`, `all`) and Search. Status, routing keys, initiator and work item are read only. |
| RequestHistorySet | TransId, AppId, SerialNo, Lvl, TypeLvl, Role | Read only. `/INOWITS/TRANS_I`. Comment comes from the comment object. |
| ViewSelectionSet | TransId | `/INOWITS/M_VWSEL`, one Boolean per tab. |
| MaterialSet, DescriptionSet, PlantSet, SalesOrgSet, ValuationSet, StorageLocationSet, WarehouseDataSet, StorageTypeDataSet, EanDataSet, ForecastParameterSet | TransId | One row per request (staging tables keyed by TransId). |
| UnitOfMeasureSet, TaxClassificationSet, SalesTaxDataSet, InspectionTypeSet, ClassCharacteristicSet, ProductionVersionSet, ConsumptionDataSet, LongTextSet | TransId plus row key | Several rows per request. |
| AttachmentSet | TransId, AttachId | **New, SAP must implement.** Media resource (`m:HasStream`). Create = POST with the file as body (`Slug` = URL-encoded file name, `Content-Type` = MIME type); read = `GET AttachmentSet(TransId='..',AttachId='..')/$value`; delete allowed, update not. `AttachId`, `Size`, `UploadedBy`, `UploadedAt`, `Lvl` are set by SAP. |
| CommentSet | TransId, CommentId | **New, SAP must implement.** Create (POST `TransId` + `Text`) and read only. `CommentId`, `UserId`, `CreatedAt`, `Lvl` are set by SAP. Not the comment of a workflow step (that stays `RequestHistory-Comment`). |
| MaterialTypeVhSet, MainGroupSet, SubGroupSet, SubSubGroupSet, GenericValueHelpSet | see model | Read only value helps. Generic: `GenericValueHelpSet?$filter=Name eq 'WERKS'`. |

Navigation from RequestSet: History, ViewSelection and one per staging entity. There is no referential constraint (the staging tables only have TransId), so the DPC class implements the navigations.

## Function imports (all POST, primitive parameters)

StartRequest, Validate, SaveDraft, Submit, Approve, SendBack, Reject, Forward, DeleteDraft, CheckDuplicate, BuildDescription, GetRelatedHsn, GetFieldControl, GetSession. Parameters and return types are in `metadata.xml`. Business messages come back as a collection of `Message` (Code, Message, Severity, Target) or as an OData error with `innererror.errordetails`.

## Write pattern (one change set per action)

The front end sends one `$batch` with one change set: entity writes (MERGE for single rows, POST, MERGE or DELETE for multi rows, MERGE for the view selection) followed by the function import (SaveDraft, Submit, Approve ...). The DPC class opens one logical unit in `CHANGESET_BEGIN` and commits or rolls back in `CHANGESET_END`, so a failed save stores nothing.

`Validate` runs in the same way after the writes. The DPC class rolls the unit of work back itself after it has collected the messages, so validation never stores data. (The front end still sends the header `X-MM-Validate-Only: true`; the service ignores it.)

## Rules for every call

- Runs as the real user (workflow, field control by department and level, authorization checks).
- CSRF token fetch before writes (`x-csrf-token: Fetch`), cookies forwarded.
- The client never sends status, routing keys, initiator or work item; the service ignores them.
- Conversion exits are applied in the service (ALPHA, MATN1, CUNIT); dates are Edm.DateTime without time, `00000000` is null.
- All messages of a failed operation come back together, each with a `Target` such as `Plant/Dismm` (entity and ABAP field name in camel case).

## Change and extension flows (app IDs MX and ME): what the contract supports and what is missing

**Supported today, no new SAP object needed.** A request of any `AppId` is opened, edited, validated, saved, submitted, approved, sent back, rejected and forwarded with the same entities and function imports as a create request (`MC`): the editor never looks at the AppId, field control comes from `GetFieldControl` and the buttons from the allowed actions of the request. `RequestSet` already carries `AppId`, so MX and ME requests appear in the lists and open in the same editor as soon as SAP creates them.

**Missing: the front end cannot do any of the following without new function imports.** Nothing below is implemented in the front end, the demo service or the model yet (it would be invented SAP behaviour). The ABAP package says the same: "Change and send back are not part of this package".

| Need | Proposed function import (POST, primitive parameters) | Returns |
| --- | --- | --- |
| Search an existing material (number, description, type, plant) | `SearchMaterial(Text, MaterialType, Plant)` | `Collection(MaterialHit)`: Matnr, Description, MaterialType, Plant, Status (blocked, deleted flag) |
| Start a change or extension request for an existing material: SAP loads the current values into the staging tables of a new request and sets `AppId` (MX change, ME extension), the routing keys and the workflow | `StartChange(Matnr, AppId, Plant, SalesOrg, StorageLocation, Views)` | `StartResult` (TransId), the same type `StartRequest` returns |
| Current SAP values beside the requested values (the side-by-side view of changed fields) | `GetCurrentValues(TransId)` returning the same entities as the request, read from the live material master (MARA, MARC, MVKE, MBEW ...), or read-only entity sets with the same shapes under a `Current` navigation of `RequestSet` | rows per entity, same property names as the staging entities |
| Which fields a change may touch (a change request only unlocks some fields) | none: `GetFieldControl` already returns shown, displayOnly and required per tab and level; for MX/ME it must return the change rules (new parameter `AppId` on `GetFieldControl`) | `Collection(FieldControlItem)` |

Open questions for the SAP team: does a change keep its own staging copy of every tab (like a create), and which fields does the old `/INOWITS` change app allow for each material type and level?

**Front end once SAP provides these** (a small step, the editor is generic): a search page, a "Start change / extension" action, and in the request view the changed fields marked and the current SAP value shown beside the requested one (a comparison of two `RequestData` objects with the same field names, no business rule involved).

## Attachments and comments (new; added to `metadata.xml`, not yet implemented in SAP)

**Entities.** `AttachmentSet` (media resource) and `CommentSet`, reachable from `RequestSet` by the navigations `Attachments` and `Comments`. Properties are in `metadata.xml`; the model only fixes the shape. How SAP stores the files (GOS, DMS, ArchiveLink or a Z table with RAWSTRING) is the SAP team's decision.

**Allowed actions.** Two new derived flags on `RequestSet`, in the style of the other `Can*` flags: `CanAttach` (may add and delete attachments of this request) and `CanComment` (may add comments). SAP decides them for the calling user and the request; the front end never infers them from the status. The front end shows the upload and the delete buttons only with `CanAttach` and the comment form only with `CanComment`. Reading the list and downloading are open to everyone who may open the request. Deleting is bound to `CanAttach`; SAP should refuse it for an attachment of another user if that is the rule.

**What the client sends.** Upload: the bytes, the file name (`Slug`) and the MIME type. Comment: `TransId` and `Text`. It never sends the uploader, the time, the level or the ID; SAP sets them.

**Guards of the hub backend (before SAP is called; SAP checks again).** Size up to 10 MB per file (413), file types by extension: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, png, jpg, jpeg, gif, msg, eml, zip (415); no executables or scripts. Comment up to 1000 characters. File contents are never logged. Downloads are sent as `Content-Disposition: attachment` with `X-Content-Type-Options: nosniff`.

**Routes of the hub backend** (`/api/me/mm-mdm`): `GET|POST /requests/:id/attachments` (POST body = the file, header `Slug`), `GET|DELETE /requests/:id/attachments/:attId`, `GET|POST /requests/:id/comments`.

**Demo mode.** Files are kept in the browser (base64 in the demo store, 1 MB per file) and comments in the demo store; the demo rule for the two flags is: the initiator of an open or sent-back request and the agent of the current level may add; everyone who sees the request may read.
