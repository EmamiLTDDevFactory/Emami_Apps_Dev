CLASS zcl_zcashflow_ai_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zcashflow_ai_dpc FINAL CREATE PUBLIC.
  PUBLIC SECTION.
  PROTECTED SECTION.
    METHODS forecastset_get_entityset REDEFINITION.
    METHODS riskset_get_entityset REDEFINITION.
    METHODS explainabilityse_get_entityset REDEFINITION.
    METHODS actionset_create_entity REDEFINITION.
ENDCLASS.

CLASS zcl_zcashflow_ai_dpc_ext IMPLEMENTATION.
  METHOD forecastset_get_entityset.
    "1. Read filters using io_tech_request_context->get_filter( ).
    "2. Validate company code, horizon and scenario against allowlists.
    "3. AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '03'.
    "4. Call ZCL_CF_FACADE=>GET_FORECAST with paging and requested filters.
    "5. Map business DTOs to ET_ENTITYSET; set inline count when requested.
    "6. Raise /IWBEP/CX_MGW_BUSI_EXCEPTION for governed business errors.
  ENDMETHOD.

  METHOD riskset_get_entityset.
    "Resolve authorized scope and call ZCL_CF_FACADE=>GET_RISKS.
  ENDMETHOD.

  METHOD explainabilityse_get_entityset.
    "Return factor contributions, source category, rank and human-readable rationale.
  ENDMETHOD.

  METHOD actionset_create_entity.
    DATA ls_input TYPE zcl_zcashflow_ai_mpc=>ts_action.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_input ).
    "Validate CSRF at Gateway layer, authorize create, whitelist action types.
    "Create recommendation/work item only. Do not directly post or pay.
    "Call ZCL_CF_ACTION=>CREATE and copy result to ER_ENTITY.
  ENDMETHOD.
ENDCLASS.
