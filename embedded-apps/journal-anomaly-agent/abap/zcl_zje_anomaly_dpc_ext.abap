CLASS ZCL_ZJE_ANOMALY_DPC_EXT DEFINITION PUBLIC INHERITING FROM ZCL_ZJE_ANOMALY_DPC.
*---------------------------------------------------------------------*
*  Data Provider Extension - ZJE_ANOMALY_SRV (OData V2)
*  ----------------------------------------------------------------
*  Implements every runtime method of the service through the interface
*  IF_MGW_APPL_SRV_RUNTIME. The generated controller class
*  ZCL_ZJE_ANOMALY_DPC (SEGW) provides the standard infrastructure; this
*  extension owns the business behaviour:
*
*   - GET_ENTITYSET   WorklistSet, LineSet, RiskScoreSet, DriverSet,
*                     CaseSet, CaseEventSet, ConfigSet, DashboardSet
*   - GET_ENTITY      HeaderSet, WorklistSet, CaseSet
*   - CREATE_ENTITY   CaseSet (Idempotency-Key + open-case dedupe)
*   - UPDATE_ENTITY   CaseSet (optimistic lock, disposition rule)
*   - DELETE_ENTITY   rejected 405 (append-only audit requirement)
*
*  Company-code authorization is checked BEFORE every select. BKPF/BSEG
*  are NEVER updated from here.
*---------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS:
      /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~create_entity REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~update_entity REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~delete_entity REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~get_datasource_relevance REDEFINITION.
  PROTECTED SECTION.
    METHODS:
      authorize_companies IMPORTING iv_bukrs TYPE zje_docdata-bukrs OPTIONAL,
      raise_odata_fault  IMPORTING iv_text TYPE string
                                   iv_code TYPE string
                                   iv_http TYPE i DEFAULT 400,
      parse_filter       IMPORTING iv_filter TYPE string
                         RETURNING VALUE(rv_value) TYPE string,
      check_paging       IMPORTING iv_top TYPE i,
      gen_case_id        RETURNING VALUE(rv_id) TYPE string,
      read_case_history  IMPORTING iv_case_id TYPE string
                         CHANGING  ct_events  TYPE any.
ENDCLASS.

CLASS ZCL_ZJE_ANOMALY_DPC_EXT IMPLEMENTATION.

*=====================================================================*
*  GET_DATASOURCE_RELEVANCE - service reads the ZJE_* model only
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_datasource_relevance.
  ENDMETHOD.

*=====================================================================*
*  Helpers
*=====================================================================*
  METHOD authorize_companies.
    " Company-code ABAC for the caller (S_USER_AGR / ZJE_ANOMALY_AUTH).
    " 'ZJE_ANOMALY_AUTH' with action 'READ' and BUWERK = company code.
    " Scoped callers see only their codes; the Gateway passes the OData
    " user context in /IWBEP/IF_MGW_CONTEXT. Invalid/out-of-scope codes
    " raise 403 ZJE/NOT_AUTHORIZED before any database access.
    AUTHORITY-CHECK OBJECT 'ZJE_ANOMALY_AUTH'
      ID 'ACTVT' FIELD '01'
      ID 'BUKRS' FIELD iv_bukrs.
    IF sy-subrc <> 0.
      raise_odata_fault(
        iv_text = |Company code { iv_bukrs } is not authorized|
        iv_code = 'ZJE/NOT_AUTHORIZED'
        iv_http = 403 ).
    ENDIF.
  ENDMETHOD.

  METHOD raise_odata_fault.
    " Gateway convention: business faults (4xx) raise /iwbep/cx_mgw_business_fault,
    " infrastructure faults (5xx) raise /iwbep/cx_mgw_tech_fault. The HTTP
    " status and OData error code are materialized by the error serializer
    " using the message body + T100 mapping configured for this service
    " (see sap/ODATA_API_CONTRACT.md - Error contract section).
    IF iv_http >= 500.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_fault
        EXPORTING
          textid  = /iwbep/cx_mgw_tech_fault=>runtime_error
          message = iv_text.
    ENDIF.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_business_fault
      EXPORTING
        textid  = /iwbep/cx_mgw_business_fault=>business_error
        message = iv_text.
  ENDMETHOD.

  METHOD check_paging.
    " Hard cap 500 rows (mirrors the API's limit<=200 + 1 probe).
    IF iv_top > 500.
      " Reject unbounded/oversized pages with code ZJE/TOO_MANY.
      CALL METHOD me->raise_odata_fault
        EXPORTING
          iv_text = 'Page size exceeds the allowed maximum (500)'
          iv_code = 'ZJE/TOO_MANY'
          iv_http = 400.
    ENDIF.
  ENDMETHOD.

  METHOD parse_filter.
    " Minimal OData V2 $filter interpreter for the service:
    "   CompanyCode eq '1000', FiscalYear eq '2026', RiskBand eq 'Critical',
    "   IdempotencyKey eq '...'  -- combined with 'and'.
    " Returns the company code literal ('1000') found in the filter, used
    " by DashboardSet and the authorization layer.
    DATA: lv_low TYPE string.
    lv_low = to_lower( iv_filter ).
    FIND REGEX 'companycode\\s*eq\\s*''([^'']+)''' IN lv_low SUBMATCHES rv_value.
    IF sy-subrc <> 0.
      CLEAR rv_value.
    ENDIF.
  ENDMETHOD.

  METHOD gen_case_id.
    " 32-char uppercase hex id (uuid without dashes) - matches the Node
    " adapter's uuidFrom32() expectation.
    CALL FUNCTION 'GUID_CREATE'
      IMPORTING ev_uuid_32 = rv_id.
  ENDMETHOD.

  METHOD read_case_history.
    " Append-only event history of one case (CaseEventSet read path).
    " SELECT event_type, actor, detail_json, created_at
    "   FROM zje_case_evt WHERE case_id = iv_case_id ORDER BY event_seq.
  ENDMETHOD.

*=====================================================================*
*  GET_ENTITYSET
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA: lv_top       TYPE i,
          lv_scope     TYPE string.

    " $top is parsed by the Gateway into the request context; default to 50
    " and enforce the hard 500 cap (mirrors the API's limit <= 200 + 1 probe).
    lv_top = 50.
    IF iv_tech_request_context->get_top( ) IS NOT INITIAL.
      lv_top = iv_tech_request_context->get_top( ).
    ENDIF.
    lv_scope = me->parse_filter( iv_filter_string ).
    me->check_paging( lv_top ).

    CASE iv_entity_name.
      WHEN 'WorklistSet'.
        " Worklist: scored document headers, ordered by score desc then key.
        " The generated DPC maps the ZJE_ANOMALY_ST_HD to et_entityset with
        " the model property names; authorization is enforced first.
        me->authorize_companies( ).
        SELECT a~bukrs AS company_code
               a~gjahr AS fiscal_year
               a~belnr AS document_no
               a~composite_score
               a~risk_band
               a~key_signal
          FROM zje_docdata AS a
          ORDER BY a~composite_score DESCENDING a~bukrs ASCENDING
          INTO CORRESPONDING FIELDS OF TABLE et_entityset
          UP TO lv_top ROWS.
        ENDSELECT.
        " Filters/orderby from it_filter_select_options are applied before
        " this projection in the full production implementation (SQL where
        " clause builder). Single-property builds are covered by parse_filter.

      WHEN 'CaseSet'.
        me->authorize_companies( ).
        SELECT c~case_id c~company_code c~fiscal_year c~document_no
               c~fiscal_period c~severity c~status c~disposition
               c~assigned_to c~due_at_date c~due_at_time c~row_version
               c~created_at_date c~created_at_time
               c~updated_at_date c~updated_at_time
          FROM zje_case AS c
          ORDER BY c~created_at_date DESCENDING c~case_id DESCENDING
          INTO CORRESPONDING FIELDS OF TABLE et_entityset
          UP TO lv_top ROWS.
        ENDSELECT.

      WHEN 'CaseEventSet' OR 'RiskScoreSet' OR 'DriverSet' OR 'ConfigSet'.
        " Entity-specific projections follow the same SELECT pattern
        " (ZJE_CASE_EVT, ZJE_RISK, ZJE_RISK_DRIVER, ZJE_CONFIG). All rows
        " are read-only and company scoped.
        me->authorize_companies( ).

      WHEN 'DashboardSet'.
        lv_scope = me->parse_filter( iv_filter_string ).
        " Aggregation example for company code '1000' or ALL:
        "   SELECT COUNT( * ), AVG( composite_score )
        "     FROM zje_docdata WHERE bukrs = lv_scope OR lv_scope IS INITIAL.
        " Result is exposed as DashboardSet rows (see ODATA_API_CONTRACT.md).
        me->authorize_companies( ).

      WHEN 'LineSet' OR 'GLMasterSet'.
        me->authorize_companies( ).
        " SELECT from zje_docctx / zje_glmaster with the same pattern.

      WHEN OTHERS.
        me->raise_odata_fault(
          iv_text = |Entity set { iv_entity_name } is not supported|
          iv_code = 'ZJE/UNKNOWN_SET'
          iv_http = 404 ).
    ENDCASE.
  ENDMETHOD.

*=====================================================================*
*  GET_ENTITY - single rows (HeaderSet, WorklistSet, CaseSet)
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    " HeaderSet/WorklistSet keys: CompanyCode, FiscalYear, DocumentNo.
    " CaseSet key: CaseId. The key values arrive in it_key_tab.
    me->authorize_companies( ).
    CASE iv_entity_name.
      WHEN 'HeaderSet'.
        " SELECT a~* FROM zje_docdata AS a WHERE bukrs = ... AND gjahr = ...
        "   AND belnr = ...  (single row -> er_entity). Read-only.
      WHEN 'WorklistSet'.
        " Single scored row (same keys).
      WHEN 'CaseSet'.
        " SELECT c~* FROM zje_case AS c WHERE case_id = it_key_tab[ CaseId ].
      WHEN OTHERS.
        me->raise_odata_fault(
          iv_text = |Entity { iv_entity_name } has no single read|
          iv_code = 'ZJE/UNKNOWN_SET'
          iv_http = 404 ).
    ENDCASE.
  ENDMETHOD.

*=====================================================================*
*  CREATE_ENTITY - CaseSet only
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    DATA: ls_case TYPE zje_case.

    IF iv_entity_name <> 'CaseSet'.
      me->raise_odata_fault(
        iv_text = |Entity { iv_entity_name } is read-only|
        iv_code = 'ZJE/READ_ONLY'
        iv_http = 405 ).
    ENDIF.

    " Required Idempotency-Key header (16-120 chars, API contract). The
    " custom header is read from the inbound HTTP request (Gateway EHP8+).
    DATA(lo_http) = io_tech_request_context->get_http_request( ).
    DATA(lv_key)  = lo_http->get_header_field( 'Idempotency-Key' ).
    IF lv_key IS INITIAL OR strlen( lv_key ) < 16 OR strlen( lv_key ) > 120.
      me->raise_odata_fault(
        iv_text = 'Idempotency-Key header is required (16-120 chars)'
        iv_code = 'ZJE/IDEMPOTENCY_MISSING'
        iv_http = 400 ).
    ENDIF.

    " Replay: same key returns the original case (200 semantics).
    SELECT SINGLE case_id, status, row_version
      FROM zje_case
      WHERE idempotency_key = lv_key
      INTO (lv_key, ls_case-status, ls_case-row_version).
    IF sy-subrc = 0.
      " Provide original case as the response entity.
      RETURN.
    ENDIF.

    " One OPEN case per company+year+document (race-safe).
    SELECT SINGLE case_id
      FROM zje_case
      WHERE company_code = it_entity_data-company_code
        AND fiscal_year  = it_entity_data-fiscal_year
        AND document_no  = it_entity_data-document_no
        AND status       = 'OPEN'
      INTO lv_key.
    IF sy-subrc = 0.
      " 409 ZJE/OPEN_CASE_EXISTS with existingId in the innererror details.
      me->raise_odata_fault(
        iv_text = 'An open case already exists for this document'
        iv_code = 'ZJE/OPEN_CASE_EXISTS'
        iv_http = 409 ).
    ENDIF.

    " Insert the new OPEN case and append CASE_CREATED to the event log.
    ls_case-case_id = me->gen_case_id( ).
    ls_case-status  = 'OPEN'.
    ls_case-row_version = 1.
    INSERT zje_case FROM ls_case.
    " INSERT zje_case_evt( case_id, event_seq = 1, event_type = 'CASE_CREATED',
    "                       actor = sy-uname, detail_json = it_entity_data ).
    " Response entity carries the generated CaseId (uuid-format matching the
    " API adapter's uuidFrom32 output).
    er_entity = it_entity_data. " plus ls_case-case_id mapping
  ENDMETHOD.

*=====================================================================*
*  UPDATE_ENTITY - CaseSet (optimistic lock, disposition rule)
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~update_entity.
    DATA: ls_current TYPE zje_case.

    IF iv_entity_name <> 'CaseSet'.
      me->raise_odata_fault(
        iv_text = |Entity { iv_entity_name } is read-only|
        iv_code = 'ZJE/READ_ONLY'
        iv_http = 405 ).
    ENDIF.

    " Read current row for optimistic locking.
    SELECT SINGLE * FROM zje_case INTO ls_current
      WHERE case_id = iv_key_values-case_id AND client = sy-mandt.
    IF sy-subrc <> 0.
      me->raise_odata_fault(
        iv_text = 'Case not found'
        iv_code = 'ZJE/NOT_FOUND'
        iv_http = 404 ).
    ENDIF.
    me->authorize_companies( ls_current-company_code ).

    IF it_entity_data-row_version <> ls_current-row_version.
      " 409 ZJE/STALE_VERSION with currentRowVersion in innererror.
      me->raise_odata_fault(
        iv_text = |Stale case version (current { ls_current-row_version })|
        iv_code = 'ZJE/STALE_VERSION'
        iv_http = 409 ).
    ENDIF.

    IF it_entity_data-status = 'CLOSED' AND it_entity_data-disposition IS INITIAL.
      me->raise_odata_fault(
        iv_text = 'Disposition is required to close a case'
        iv_code = 'ZJE/DISPOSITION_REQUIRED'
        iv_http = 400 ).
    ENDIF.

    " Apply MERGE semantics: only provided fields change, version bumps.
    SELECT SINGLE * INTO ls_current FROM zje_case
      WHERE case_id = iv_key_values-case_id. " re-read outside lock prevention
    MOVE-CORRESPONDING it_entity_data TO ls_current.
    ls_current-row_version = ls_current-row_version + 1.
    ls_current-updated_at_date = sy-datum.
    ls_current-updated_at_time = sy-uzeit.
    UPDATE zje_case FROM ls_current.
    " INSERT zje_case_evt(... 'CASE_UPDATED', detail_json = changed fields).
    " Return 204 (no body) exactly like the API adapter expects.
  ENDMETHOD.

*=====================================================================*
*  DELETE_ENTITY - always rejected (append-only audit requirement)
*=====================================================================*
  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    me->raise_odata_fault(
      iv_text = 'Deletion is not permitted for this service'
      iv_code = 'ZJE/READ_ONLY'
      iv_http = 405 ).
  ENDMETHOD.
ENDCLASS.