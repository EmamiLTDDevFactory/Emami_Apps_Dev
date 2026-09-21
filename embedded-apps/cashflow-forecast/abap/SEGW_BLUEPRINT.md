# SEGW Blueprint: ZCASHFLOW_AI_SRV
Create SEGW project `ZCASHFLOW_AI`, OData V2 service `ZCASHFLOW_AI_SRV`.

Define entity types matching `docs/API_CONTRACT.md`. Generate runtime classes, then redefine entity-set methods in `ZCL_ZCASHFLOW_AI_DPC_EXT`. Use `$filter`, `$select`, `$orderby`, `$top`, `$skip` and company-code authorization in every relevant collection method.

## Recommended ABAP layers
- `ZCL_CF_FACADE`: orchestration and public methods
- `ZCL_CF_AUTH`: company-code/role authorization
- `ZCL_CF_REPOSITORY`: optimized data access
- `ZCL_CF_FORECAST`: deterministic aggregation and scenario rules
- `ZCL_CF_RISK`: risk scoring and alerts
- `ZCL_CF_EXPLAIN`: factor contributions and rationale
- `ZCL_CF_ACTION`: controlled recommendation creation and audit
- `ZIF_CF_*`: interfaces for test doubles

## ECC source scope
FDSB/FDSR/FDFIEP/FDES/FDM1/FDM2/FDS1/FDZA; BSID/BSAD/BSIK/BSAK; BKPF/BSEG/BSIS/BSAS; FEBKO/FEBEP; REGUH/REGUP; EKKO/EKPO/EKET/EKBE/RBKP/RSEG; VBAK/VBAP/VBEP/LIKP/LIPS/VBRK/VBRP; selected CO, AA, tax and Treasury sources subject to installed components.

Do not expose raw sensitive bank data. Return only fields needed by the UX. Apply `AUTHORITY-CHECK` for company code and any custom cash-flow role. Log manual overrides and action creation.
