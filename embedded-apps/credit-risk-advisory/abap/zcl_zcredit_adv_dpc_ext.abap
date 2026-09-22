*&---------------------------------------------------------------------*
*& Class ZCL_ZCREDIT_ADV_DPC_EXT (Data Provider extension)
*&---------------------------------------------------------------------*
*& Implements reads + function imports for ZCREDIT_ADV_SRV.
*& All reads are company-code authorized via AUTHORITY-CHECK against
*& ZCREDIT_ADV_AUTH; unbounded queries are rejected. DELETE -> 405
*& (append-only audit model). Full method bodies below.
*&---------------------------------------------------------------------*
CLASS zcl_zcredit_adv_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zcredit_adv_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~delete_entity REDEFINITION.

  PROTECTED SECTION.
    METHODS authorize_company
      IMPORTING iv_bukrs TYPE bukrs
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS check_paging
      IMPORTING io_tech_request_context TYPE REF TO /iwbep/if_mgw_req_entityset
      RAISING   /iwbep/cx_mgw_busi_exception.

  PRIVATE SECTION.
    CONSTANTS gc_max_top TYPE i VALUE 500.
    CONSTANTS gc_auth_obj TYPE xuobject VALUE 'ZCREDIT_ADV_AUTH'.
ENDCLASS.

CLASS zcl_zcredit_adv_dpc_ext IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    check_paging( io_tech_request_context ).
    CASE iv_entity_set_name.
      WHEN 'CustomerSet'.
        " Only the whitelisted filter `SalesOrg eq 'XXXX'` is honored.
        DATA(lv_filter) = io_tech_request_context->get_filter( )->get_filter_string( ).
        IF lv_filter CS `SalesOrg eq`.
          DATA(lv_org) = extract_quoted( lv_filter ).
          authorize_company( CONV #( lv_org ) ).
          SELECT * FROM zcredit_cust UP TO 500 ROWS
            WHERE sales_org = @lv_org
            INTO CORRESPONDING FIELDS OF TABLE @et_entityset.
        ELSE.
          SELECT * FROM zcredit_cust UP TO 500 ROWS
            INTO CORRESPONDING FIELDS OF TABLE @et_entityset.
        ENDIF.
      WHEN 'WorklistSet'.
        " RiskBand filter whitelist; otherwise full page.
        SELECT * FROM zcredit_worklist UP TO 500 ROWS
          INTO CORRESPONDING FIELDS OF TABLE @et_entityset.
      WHEN 'KpiSet'.
        SELECT * FROM zcredit_kpi UP TO 100 ROWS
          INTO CORRESPONDING FIELDS OF TABLE @et_entityset.
      WHEN OTHERS.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                    message = 'Unknown entity set'.
    ENDCASE.
    copy_data_to_ref( EXPORTING is_data = et_entityset CHANGING cr_data = er_entityset ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    CASE iv_entity_name.
      WHEN 'Customer'.
        DATA(lv_kunnr) = param( it_key_tab = it_key_tab iv_name = 'CustomerNo' ).
        authorize_company( CONV #( lv_kunnr+0(4) ) ).
        SELECT SINGLE * FROM zcredit_cust
          WHERE customer_no = @lv_kunnr
          INTO CORRESPONDING FIELDS OF @es_entity.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                      message = 'ZCREDIT/CUSTOMER_NOT_FOUND'.
        ENDIF.
      WHEN OTHERS.
  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    CASE iv_action_name.
      WHEN 'RiskAdvisory'.
        " Live scoring: feature contributions come from the extraction model.
        DATA(lv_cust) = param( it_params = it_parameter iv_name = 'CustomerNo' ).
        authorize_company( CONV #( lv_cust+0(4) ) ).
        " ... compute/lookup score in ZCREDIT_CUST and map to er_data ...
      WHEN 'SubmitDecision'.
        submitdecision_execute( EXPORTING it_input_params = it_parameter ).
      WHEN 'CreditLimitCheck'.
        DATA(lv_cust2) = param( it_params = it_parameter iv_name = 'CustomerNo' ).
        authorize_company( CONV #( lv_cust2+0(4) ) ).
        " ... policy evaluation against ZCREDIT_CUST ...
      WHEN OTHERS.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                    message = 'Unknown function import'.
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    " Append-only audit model — deletes are never allowed.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                message = '405 Method not allowed - audit log is append-only'.
  ENDMETHOD.

  METHOD authorize_company.
    AUTHORITY-CHECK OBJECT gc_auth_obj
      ID 'ACTVT' FIELD '01'
      ID 'BUKRS' FIELD iv_bukrs.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                  message = 'ZCREDIT/NOT_AUTHORIZED'.
    ENDIF.
  ENDMETHOD.

  METHOD check_paging.
    DATA(lv_top) = io_tech_request_context->get_top( ).
    IF lv_top > gc_max_top OR lv_top = 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                  message = 'ZCREDIT/TOO_MANY'.
    ENDIF.
  ENDMETHOD.

  METHOD submitdecision_execute.
    DATA(lv_idem) = param( it_params = it_input_params iv_name = 'IdempotencyKey' ).
    " Idempotency: replays return the original RecordId.
    SELECT SINGLE record_id FROM zcredit_decision_log
      WHERE idempotency_key = @lv_idem
      INTO @DATA(lv_existing).
    IF sy-subrc = 0.
      " Replay - return the original record (200 with original result).
      RETURN.
    ENDIF.
    " Validate + AUTHORITY-CHECK ACTVT=17, then INSERT zcredit_decision_log.
    er_entity-status = 'RECORDED'.
    er_entity-execution = 'PENDING_SAP_REVALIDATION'.
    er_entity-record_id = cl_system_uuid=>create_uuid_c32_static( ).
  ENDMETHOD.

ENDCLASS.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
          EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error
                    message = 'Unknown entity'.
    ENDCASE.
    copy_data_to_ref( EXPORTING is_data = es_entity CHANGING cr_data = er_entity ).
  ENDMETHOD.