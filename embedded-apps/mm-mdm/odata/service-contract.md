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
