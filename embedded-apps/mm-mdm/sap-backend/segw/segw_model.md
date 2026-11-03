# SEGW model of ZMM_MDM_SRV

Generated from `metadata.xml`. Import it in SEGW (project ZMM_MDM_SRV, Import > Data Model from File), or create the same by hand. After the import check three things: the ABAP field names (they may be `TRANS_ID` or `TRANSID`: the code matches ignoring underscores), the Edm.Boolean properties (type `ABAP_BOOL`), and the conversion exits (see `classes/zcl_zmm_mdm_srv_mpc_ext.clas.abap`).

## Entity types and entity sets

| Entity type | Entity set | Source table | Key | Properties | Writable |
| --- | --- | --- | --- | --- | --- |
| Request | RequestSet | /INOWITS/M_TRANS | TransId, AppId | 27 | header: via actions only |
| RequestHistory | RequestHistorySet | /INOWITS/TRANS_I | TransId, AppId, SerialNo, Lvl, TypeLvl, Role | 11 | no |
| ViewSelection | ViewSelectionSet | /INOWITS/M_VWSEL | TransId | 30 | yes |
| Material | MaterialSet | /INOWITS/MM_MARA | TransId | 160 | yes |
| Description | DescriptionSet | /INOWITS/MM_MAKT | TransId | 4 | yes |
| Plant | PlantSet | /INOWITS/MM_MARC | TransId | 168 | yes |
| SalesOrg | SalesOrgSet | /INOWITS/MM_MVKE | TransId | 39 | yes |
| Valuation | ValuationSet | /INOWITS/MM_MBEW | TransId | 69 | yes |
| StorageLocation | StorageLocationSet | /INOWITS/MM_MARD | TransId | 11 | yes |
| WarehouseData | WarehouseDataSet | /INOWITS/MM_MLGN | TransId | 25 | yes |
| StorageTypeData | StorageTypeDataSet | /INOWITS/MM_MLGT | TransId | 12 | yes |
| EanData | EanDataSet | /INOWITS/MM_MEAN | TransId | 8 | yes |
| ForecastParameter | ForecastParameterSet | /INOWITS/MM_PROP | TransId | 34 | yes |
| UnitOfMeasure | UnitOfMeasureSet | /INOWITS/MM_MARM | TransId, Meinh | 23 | yes |
| TaxClassification | TaxClassificationSet | /INOWITS/MM_MLAN | TransId, Aland | 12 | yes |
| SalesTaxData | SalesTaxDataSet | /INOWITS/MM_STAX | TransId, SrNo | 9 | yes |
| InspectionType | InspectionTypeSet | /INOWITS/MM_QMAT | TransId, SerialNo | 35 | yes |
| ClassCharacteristic | ClassCharacteristicSet | /INOWITS/MM_RMCL | TransId, SrNo | 13 | yes |
| ProductionVersion | ProductionVersionSet | /INOWITS/MM_MKAL | TransId, Slno | 32 | yes |
| ConsumptionData | ConsumptionDataSet | /INOWITS/MM_CONS | TransId, Priod | 8 | yes |
| LongText | LongTextSet | /INOWITS/MM_TEXT | TransId, Matnr, Fid | 5 | yes |
| MaterialTypeVh | MaterialTypeVhSet | /INOWITS/MDM_MCN + T134T | Key | 2 | no |
| MainGroup | MainGroupSet | /INOWITS/MM_MGRP | Mtart, Mgrpid | 4 | no |
| SubGroup | SubGroupSet | /INOWITS/MM_SGRP | Mtart, Mgrpid, Sgrpid | 5 | no |
| SubSubGroup | SubSubGroupSet | /INOWITS/MM_SSGR | Mtart, Mgrpid, Sgrpid, Ssgrpid | 6 | no |
| GenericValueHelp | GenericValueHelpSet | domains, check tables | Name, Key | 3 | no |

## Navigation properties of Request

| Navigation | To | Multiplicity |
| --- | --- | --- |
| History | RequestHistory | * |
| ViewSelection | ViewSelection | 0..1 |
| Material | Material | 0..1 |
| Description | Description | 0..1 |
| Plant | Plant | 0..1 |
| SalesOrg | SalesOrg | 0..1 |
| Valuation | Valuation | 0..1 |
| StorageLocation | StorageLocation | 0..1 |
| WarehouseData | WarehouseData | 0..1 |
| StorageTypeData | StorageTypeData | 0..1 |
| EanData | EanData | 0..1 |
| ForecastParameter | ForecastParameter | 0..1 |
| UnitOfMeasure | UnitOfMeasure | * |
| TaxClassification | TaxClassification | * |
| SalesTaxData | SalesTaxData | * |
| InspectionType | InspectionType | * |
| ClassCharacteristic | ClassCharacteristic | * |
| ProductionVersion | ProductionVersion | * |
| ConsumptionData | ConsumptionData | * |
| LongText | LongText | * |

There is no referential constraint on these associations: the header key is TransId + AppId, the staging tables only have TransId. The DPC class resolves the navigations from the source key.

## Complex types (return types)

| Type | Properties |
| --- | --- |
| Message | Code, Message, Severity, Target |
| StartResult | TransId, AppId |
| Duplicate | Matnr, Description, MaterialType, Score |
| DescriptionResult | Text, Truncated |
| HsnResult | Code, Text, Count |
| FieldControlItem | ViewName, Entity, Field, Shown, DisplayOnly, Required, Column, Source |
| SessionInfo | User, DisplayName, Department, Roles |

## Function imports (all POST)

| Name | Parameters | Returns | Handled by |
| --- | --- | --- | --- |
| StartRequest | MaterialType, IndustrySector, Description, MainGroup, SubGroup, SubSubGroup, ManufacturerPart, Plant, StorageLocation, SalesOrg, DistributionChannel, Views, Draft | StartResult | zcl_mm_mdm_request_svc->start_request |
| Validate | TransId, AppId | Collection(Message) | zcl_mm_mdm_validator->validate, then rollback |
| SaveDraft | TransId, AppId | Collection(Message) | status 00 (SAVE_AS_DRAFT logic) |
| Submit | TransId, AppId | Collection(Message) | validator, zcl_mm_mdm_workflow->submit |
| Approve | TransId, AppId, Comment | Collection(Message) | validator, zcl_mm_mdm_workflow->approve (poster at last level) |
| SendBack | TransId, AppId, Comment | Collection(Message) | zcl_mm_mdm_workflow->send_back |
| Reject | TransId, AppId, Comment | Collection(Message) | zcl_mm_mdm_workflow->reject |
| Forward | TransId, AppId, Comment, Agent | Collection(Message) | zcl_mm_mdm_workflow->forward |
| DeleteDraft | TransId, AppId | - | zcl_mm_mdm_request_svc->delete_draft |
| CheckDuplicate | Description, MaterialType | Collection(Duplicate) | zcl_mm_mdm_functions=>check_duplicate |
| BuildDescription | MainGroup, SubGroup, SubSubGroup, Description, ManufacturerPart | DescriptionResult | zcl_mm_mdm_functions=>build_description |
| GetRelatedHsn | Text | Collection(HsnResult) | zcl_mm_mdm_functions=>related_hsn |
| GetFieldControl | MaterialType, Level | Collection(FieldControlItem) | zcl_mm_mdm_field_control=>get |
| GetSession |  | SessionInfo | DPC (user, department) |
