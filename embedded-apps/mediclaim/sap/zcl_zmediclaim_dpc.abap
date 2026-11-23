"! Data provider of OData service ZMEDICLAIM_SRV: maps requests to ZCL_MEDI_BL. Every call carries the hub login Email.
"! Custom query option simulate=X on a write request runs everything and rolls back (dry run).
CLASS zcl_zmediclaim_dpc DEFINITION
  PUBLIC
  INHERITING FROM /iwbep/cl_mgw_abs_data
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_deep_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~update_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~patch_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~delete_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.

  PROTECTED SECTION.
    DATA mo_bl TYPE REF TO zcl_medi_bl.
    DATA mv_hub TYPE abap_bool.

    METHODS bl
      RETURNING VALUE(ro_bl) TYPE REF TO zcl_medi_bl.
    METHODS busi
      IMPORTING iv_text   TYPE string
                iv_status TYPE /iwbep/mgw_http_status_code DEFAULT '400'
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS key_value
      IMPORTING it_key        TYPE /iwbep/t_mgw_name_value_pair
                iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
    METHODS filter_value
      IMPORTING it_filter     TYPE /iwbep/t_mgw_select_option
                iv_name       TYPE string
      RETURNING VALUE(rv_val) TYPE string.
    METHODS is_simulate
      RETURNING VALUE(rv_sim) TYPE abap_bool.
    METHODS parse_date
      IMPORTING iv_text        TYPE string
      RETURNING VALUE(rv_date) TYPE d.
    METHODS email_of
      IMPORTING it_key         TYPE /iwbep/t_mgw_name_value_pair
                it_filter      TYPE /iwbep/t_mgw_select_option OPTIONAL
      RETURNING VALUE(rv_mail) TYPE string
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS maint_admin
      IMPORTING iv_mail TYPE string RETURNING VALUE(rv_mail) TYPE string RAISING /iwbep/cx_mgw_busi_exception.
    METHODS add_success
      IMPORTING iv_text TYPE string.
    METHODS change_policy
      IMPORTING is_policy      TYPE zcl_medi_bl=>ts_policy
                it_members     TYPE zcl_medi_bl=>tt_member
                iv_email       TYPE string
      EXPORTING es_policy      TYPE zcl_medi_bl=>ts_policy
                et_members     TYPE zcl_medi_bl=>tt_member
      RAISING   /iwbep/cx_mgw_busi_exception.
ENDCLASS.



CLASS zcl_zmediclaim_dpc IMPLEMENTATION.

  METHOD bl.
    IF mo_bl IS NOT BOUND.
      mo_bl = NEW #( ).
    ENDIF.
    ro_bl = mo_bl.
  ENDMETHOD.

  METHOD maint_admin.
    " a hub Admin of the app is sent as <email>~HUB: the hub (Manage Access) has already vouched for the role
    rv_mail = iv_mail.
    mv_hub = abap_false.
    IF strlen( rv_mail ) > 4 AND substring( val = rv_mail off = strlen( rv_mail ) - 4 len = 4 ) = '~HUB'.
      rv_mail = substring( val = rv_mail len = strlen( rv_mail ) - 4 ).
      mv_hub = abap_true.
      RETURN.
    ENDIF.
    IF bl( )->resolve_caller( rv_mail )-is_hr = abap_false.
      busi( iv_text = `You are not authorized to maintain the master data.` iv_status = '403' ).
    ENDIF.
  ENDMETHOD.

  METHOD add_success.
    " success text travels in the sap-message header
    TRY.
        mo_context->get_message_container( )->add_message_text_only( iv_msg_type = 'S' iv_msg_text = CONV #( iv_text ) ).
      CATCH cx_root.
    ENDTRY.
  ENDMETHOD.

  METHOD busi.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        textid            = /iwbep/cx_mgw_busi_exception=>business_error_unlimited
        message_unlimited = iv_text
        http_status_code  = iv_status.
  ENDMETHOD.

  METHOD key_value.
    LOOP AT it_key INTO DATA(ls_k).
      IF to_upper( ls_k-name ) = to_upper( iv_name ).
        rv_val = ls_k-value.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD filter_value.
    LOOP AT it_filter INTO DATA(ls_f).
      IF to_upper( ls_f-property ) = to_upper( iv_name ).
        LOOP AT ls_f-select_options INTO DATA(ls_o) WHERE sign = 'I' AND option = 'EQ'.
          rv_val = ls_o-low.
          RETURN.
        ENDLOOP.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD is_simulate.
    " custom query option simulate=X (read from the raw request URI) or header X-Medi-Simulate: X
    rv_sim = abap_false.
    IF mr_request_details IS NOT BOUND.
      RETURN.
    ENDIF.
    LOOP AT mr_request_details->*-technical_request-request_header INTO DATA(ls_h).
      IF to_lower( ls_h-name ) = '~request_uri'.
        FIND REGEX '[?&]simulate=([^&]*)' IN ls_h-value IGNORING CASE SUBMATCHES DATA(lv_val).
        IF sy-subrc = 0 AND lv_val IS NOT INITIAL AND to_upper( lv_val ) <> 'FALSE' AND lv_val <> '0'.
          rv_sim = abap_true.
        ENDIF.
      ELSEIF to_lower( ls_h-name ) = 'x-medi-simulate' AND ls_h-value IS NOT INITIAL AND to_upper( ls_h-value ) <> 'FALSE'.
        rv_sim = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD parse_date.
    " Edm.DateTime as text: 2026-12-31T00:00:00, datetime'2026-12-31T00:00:00' or /Date(1798675200000)/
    DATA: lv_y TYPE string, lv_m TYPE string, lv_d TYPE string, lv_ms TYPE string.
    FIND REGEX '(\d{4})-(\d{2})-(\d{2})' IN iv_text SUBMATCHES lv_y lv_m lv_d.
    IF sy-subrc = 0.
      rv_date = |{ lv_y }{ lv_m }{ lv_d }|.
      RETURN.
    ENDIF.
    FIND REGEX 'Date\((-?\d+)' IN iv_text SUBMATCHES lv_ms.
    IF sy-subrc = 0.
      DATA(lv_days) = CONV i( lv_ms DIV 86400000 ).
      rv_date = '19700101'.
      rv_date = rv_date + lv_days.
      RETURN.
    ENDIF.
    IF strlen( iv_text ) = 8 AND iv_text CO '0123456789'.
      rv_date = iv_text.
    ENDIF.
  ENDMETHOD.

  METHOD email_of.
    rv_mail = key_value( it_key = it_key iv_name = 'Email' ).
    IF rv_mail IS INITIAL.
      rv_mail = filter_value( it_filter = it_filter iv_name = 'Email' ).
    ENDIF.
    IF rv_mail IS INITIAL.
      busi( `Email is mandatory (every request carries the login email).` ).
    ENDIF.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA: lv_mail TYPE string,
          lt_ctx  TYPE zcl_medi_bl=>tt_context,
          lt_si   TYPE zcl_medi_bl=>tt_suminsured,
          lt_tu   TYPE zcl_medi_bl=>tt_topup,
          lt_emp  TYPE zcl_medi_bl=>tt_employee,
          lt_pol  TYPE zcl_medi_bl=>tt_policy,
          lt_mem  TYPE zcl_medi_bl=>tt_member,
          lt_blk  TYPE zcl_medi_bl=>tt_blockedemployee,
          lt_rep  TYPE zcl_medi_bl=>tt_policyreport,
          ls_emp  TYPE zcl_medi_bl=>ts_employee.
    lv_mail = email_of( it_key = it_key_tab it_filter = it_filter_select_options ).

    CASE iv_entity_set_name.
      WHEN 'ContextSet'.
        APPEND bl( )->get_context( lv_mail ) TO lt_ctx.
        copy_data_to_ref( EXPORTING is_data = lt_ctx CHANGING cr_data = er_entityset ).

      WHEN 'SumInsuredSet'.
        DATA(lv_year) = filter_value( it_filter = it_filter_select_options iv_name = 'Year' ).
        lt_si = bl( )->get_sum_insured_options( iv_email = lv_mail iv_year = CONV #( lv_year ) ).
        LOOP AT lt_si ASSIGNING FIELD-SYMBOL(<si>).
          <si>-email = lv_mail.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_si CHANGING cr_data = er_entityset ).

      WHEN 'TopUpSet'.
        lv_year = filter_value( it_filter = it_filter_select_options iv_name = 'Year' ).
        lt_tu = bl( )->get_topup_options( iv_email = lv_mail iv_year = CONV #( lv_year ) ).
        LOOP AT lt_tu ASSIGNING FIELD-SYMBOL(<tu>).
          <tu>-email = lv_mail.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_tu CHANGING cr_data = er_entityset ).

      WHEN 'EmployeeSet'.
        DATA(lv_emp) = key_value( it_key = it_key_tab iv_name = 'EmpId' ).
        IF lv_emp IS INITIAL.
          lv_emp = filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' ).
        ENDIF.
        bl( )->get_employee( EXPORTING iv_email = lv_mail iv_empid = lv_emp IMPORTING es_employee = ls_emp ).
        APPEND ls_emp TO lt_emp.
        copy_data_to_ref( EXPORTING is_data = lt_emp CHANGING cr_data = er_entityset ).

      WHEN 'PolicySet'.
        lt_pol = bl( )->list_policies(
                   iv_email = lv_mail
                   iv_empid = filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' )
                   iv_year  = filter_value( it_filter = it_filter_select_options iv_name = 'Year' )
                   iv_reqno = filter_value( it_filter = it_filter_select_options iv_name = 'ReqNo' ) ).
        copy_data_to_ref( EXPORTING is_data = lt_pol CHANGING cr_data = er_entityset ).

      WHEN 'PolicyMemberSet'.
        TRY.
            IF iv_source_name = 'Employee'.
              lv_emp = key_value( it_key = it_key_tab iv_name = 'EmpId' ).
              bl( )->get_employee( EXPORTING iv_email = lv_mail iv_empid = lv_emp IMPORTING es_employee = ls_emp et_prev_members = lt_mem ).
            ELSE.
              DATA(lv_req) = key_value( it_key = it_key_tab iv_name = 'ReqNo' ).
              IF lv_req IS INITIAL.
                lv_req = filter_value( it_filter = it_filter_select_options iv_name = 'ReqNo' ).
              ENDIF.
              lt_mem = bl( )->get_members( iv_email = lv_mail iv_reqno = lv_req ).
            ENDIF.
          CATCH zcx_medi_error INTO DATA(lx).
            busi( lx->mv_text ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = lt_mem CHANGING cr_data = er_entityset ).

      WHEN 'BlockedEmployeeSet'.
        TRY.
            lt_blk = bl( )->list_blocked( lv_mail ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = lt_blk CHANGING cr_data = er_entityset ).

      WHEN 'PolicyReportSet'.
        TRY.
            lt_rep = bl( )->list_report(
                       iv_email    = lv_mail
                       iv_year     = filter_value( it_filter = it_filter_select_options iv_name = 'Year' )
                       iv_location = filter_value( it_filter = it_filter_select_options iv_name = 'LocText' ) ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = lt_rep CHANGING cr_data = er_entityset ).

      WHEN 'MaintRowSet'.
        lv_mail = maint_admin( lv_mail ).
        TRY.
            DATA(lt_mrow) = zcl_ins_maint=>list( iv_tab  = filter_value( it_filter = it_filter_select_options iv_name = 'Table' )
                                                 iv_year = filter_value( it_filter = it_filter_select_options iv_name = 'Year' ) ).
          CATCH zcx_medi_error INTO DATA(lx_m).
            busi( lx_m->mv_text ).
        ENDTRY.
        LOOP AT lt_mrow ASSIGNING FIELD-SYMBOL(<mr>).
          <mr>-email = lv_mail.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_mrow CHANGING cr_data = er_entityset ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~get_entityset(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                    it_filter_select_options = it_filter_select_options it_order = it_order is_paging = is_paging
                    it_navigation_path = it_navigation_path it_key_tab = it_key_tab iv_filter_string = iv_filter_string
                    iv_search_string = iv_search_string io_tech_request_context = io_tech_request_context
          IMPORTING er_entityset = er_entityset es_response_context = es_response_context ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    DATA: lv_mail TYPE string,
          ls_emp  TYPE zcl_medi_bl=>ts_employee,
          ls_pol  TYPE zcl_medi_bl=>ts_policy,
          lt_mem  TYPE zcl_medi_bl=>tt_member,
          ls_mem  TYPE zcl_medi_bl=>ts_member.
    lv_mail = email_of( it_key = it_key_tab ).

    CASE iv_entity_set_name.
      WHEN 'ContextSet'.
        DATA(ls_ctx) = bl( )->get_context( lv_mail ).
        copy_data_to_ref( EXPORTING is_data = ls_ctx CHANGING cr_data = er_entity ).

      WHEN 'EmployeeSet'.
        bl( )->get_employee( EXPORTING iv_email = lv_mail iv_empid = key_value( it_key = it_key_tab iv_name = 'EmpId' )
                             IMPORTING es_employee = ls_emp ).
        copy_data_to_ref( EXPORTING is_data = ls_emp CHANGING cr_data = er_entity ).

      WHEN 'PolicySet'.
        TRY.
            ls_pol = bl( )->get_policy( iv_email = lv_mail iv_reqno = key_value( it_key = it_key_tab iv_name = 'ReqNo' ) ).
          CATCH zcx_medi_error INTO DATA(lx).
            busi( iv_text = lx->mv_text iv_status = '404' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = ls_pol CHANGING cr_data = er_entity ).

      WHEN 'PolicyMemberSet'.
        TRY.
            lt_mem = bl( )->get_members( iv_email = lv_mail iv_reqno = key_value( it_key = it_key_tab iv_name = 'ReqNo' ) ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '404' ).
        ENDTRY.
        DATA(lv_sl) = key_value( it_key = it_key_tab iv_name = 'SlNo' ).
        READ TABLE lt_mem INTO ls_mem WITH KEY slno = lv_sl.
        IF sy-subrc <> 0.
          busi( iv_text = `Member not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_mem CHANGING cr_data = er_entity ).

      WHEN 'SumInsuredSet'.
        DATA(lt_si) = bl( )->get_sum_insured_options( iv_email = lv_mail iv_year = CONV #( key_value( it_key = it_key_tab iv_name = 'Year' ) ) ).
        DATA(lv_amt) = CONV zamt( key_value( it_key = it_key_tab iv_name = 'SumInsured' ) ).
        READ TABLE lt_si INTO DATA(ls_si) WITH KEY suminsured = lv_amt.
        IF sy-subrc <> 0.
          busi( iv_text = `Sum insured not found.` iv_status = '404' ).
        ENDIF.
        ls_si-email = lv_mail.
        copy_data_to_ref( EXPORTING is_data = ls_si CHANGING cr_data = er_entity ).

      WHEN 'TopUpSet'.
        DATA(lt_tu) = bl( )->get_topup_options( iv_email = lv_mail iv_year = CONV #( key_value( it_key = it_key_tab iv_name = 'Year' ) ) ).
        lv_amt = CONV zamt( key_value( it_key = it_key_tab iv_name = 'TopUpAmount' ) ).
        READ TABLE lt_tu INTO DATA(ls_tu) WITH KEY topupamount = lv_amt.
        IF sy-subrc <> 0.
          busi( iv_text = `Top up amount not found.` iv_status = '404' ).
        ENDIF.
        ls_tu-email = lv_mail.
        copy_data_to_ref( EXPORTING is_data = ls_tu CHANGING cr_data = er_entity ).

      WHEN 'BlockedEmployeeSet'.
        TRY.
            DATA(lt_blk) = bl( )->list_blocked( lv_mail ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        READ TABLE lt_blk INTO DATA(ls_blk) WITH KEY empid = key_value( it_key = it_key_tab iv_name = 'EmpId' ).
        IF sy-subrc <> 0.
          busi( iv_text = `Employee is not on the block list.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_blk CHANGING cr_data = er_entity ).

      WHEN 'PolicyReportSet'.
        TRY.
            DATA(lt_rep) = bl( )->list_report( iv_email = lv_mail ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        READ TABLE lt_rep INTO DATA(ls_rep) WITH KEY reqno = key_value( it_key = it_key_tab iv_name = 'ReqNo' )
                                                    slno = key_value( it_key = it_key_tab iv_name = 'SlNo' ).
        IF sy-subrc <> 0.
          busi( iv_text = `Row not found.` iv_status = '404' ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_rep CHANGING cr_data = er_entity ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~get_entity(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                    it_key_tab = it_key_tab it_navigation_path = it_navigation_path io_tech_request_context = io_tech_request_context
          IMPORTING er_entity = er_entity es_response_context = es_response_context ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    " flat POST: premium quote without members, a policy without members, or a block-list entry
    DATA: ls_quote TYPE zcl_medi_bl=>ts_quote,
          lt_mem   TYPE zcl_medi_bl=>tt_member,
          ls_pol   TYPE zcl_medi_bl=>ts_policy,
          ls_out   TYPE zcl_medi_bl=>ts_policy,
          ls_blk   TYPE zcl_medi_bl=>ts_blockedemployee,
          ls_mem   TYPE zcl_medi_bl=>ts_member,
          lt_mout  TYPE zcl_medi_bl=>tt_member.
    CASE iv_entity_set_name.
      WHEN 'QuoteSet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_quote ).
        IF ls_quote-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        bl( )->calc_quote( EXPORTING iv_email = ls_quote-email CHANGING cs_quote = ls_quote ct_members = lt_mem ).
        copy_data_to_ref( EXPORTING is_data = ls_quote CHANGING cr_data = er_entity ).

      WHEN 'PolicySet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_pol ).
        IF ls_pol-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        TRY.
            IF ls_pol-reqno IS NOT INITIAL.
              bl( )->change( EXPORTING iv_email = ls_pol-email is_policy = ls_pol it_members = lt_mem iv_simulate = is_simulate( )
                             IMPORTING es_policy = ls_out ).
            ELSE.
              bl( )->submit( EXPORTING iv_email = ls_pol-email is_policy = ls_pol it_members = lt_mem iv_simulate = is_simulate( )
                             IMPORTING es_policy = ls_out ).
            ENDIF.
          CATCH zcx_medi_error INTO DATA(lx).
            busi( lx->mv_text ).
        ENDTRY.
        IF is_simulate( ) = abap_false.
          add_success( COND #( WHEN ls_pol-reqno IS NOT INITIAL THEN `Request changed successfully.` ELSE `Request submitted successfully.` ) ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_out CHANGING cr_data = er_entity ).

      WHEN 'PolicyMemberSet'.
        " POST PolicySet(ReqNo,Email)/Members = add one nominee to an existing policy (same rules as the change flow)
        io_data_provider->read_entry_data( IMPORTING es_data = ls_mem ).
        ls_pol-reqno = key_value( it_key = it_key_tab iv_name = 'ReqNo' ).
        IF ls_pol-reqno IS INITIAL.
          ls_pol-reqno = ls_mem-reqno.
        ENDIF.
        ls_pol-email = key_value( it_key = it_key_tab iv_name = 'Email' ).
        IF ls_pol-email IS INITIAL.
          ls_pol-email = ls_mem-email.
        ENDIF.
        IF ls_pol-reqno IS INITIAL OR ls_pol-email IS INITIAL.
          busi( `Policy number and Email are mandatory.` ).
        ENDIF.
        CLEAR ls_mem-slno.
        APPEND ls_mem TO lt_mem.
        change_policy( EXPORTING is_policy = ls_pol it_members = lt_mem iv_email = CONV #( ls_pol-email )
                       IMPORTING es_policy = ls_out et_members = lt_mout ).
        READ TABLE lt_mout INTO ls_mem WITH KEY relation = ls_mem-relation dob = ls_mem-dob.
        copy_data_to_ref( EXPORTING is_data = ls_mem CHANGING cr_data = er_entity ).

      WHEN 'BlockedEmployeeSet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_blk ).
        TRY.
            ls_blk = bl( )->add_blocked( iv_email = ls_blk-email iv_empid = ls_blk-empid iv_name = ls_blk-name iv_simulate = is_simulate( ) ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = ls_blk CHANGING cr_data = er_entity ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~create_entity(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                    io_data_provider = io_data_provider it_key_tab = it_key_tab it_navigation_path = it_navigation_path
                    io_tech_request_context = io_tech_request_context
          IMPORTING er_entity = er_entity ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
    " deep insert with Members: PolicySet = submit (or add nominees when ReqNo is given), QuoteSet = premium calculation
    DATA: ls_pdeep TYPE zcl_medi_bl=>ts_policy_deep,
          ls_qdeep TYPE zcl_medi_bl=>ts_quote_deep,
          ls_pol   TYPE zcl_medi_bl=>ts_policy,
          ls_out   TYPE zcl_medi_bl=>ts_policy,
          lt_mout  TYPE zcl_medi_bl=>tt_member,
          ls_quote TYPE zcl_medi_bl=>ts_quote.
    CASE iv_entity_set_name.
      WHEN 'PolicySet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_pdeep ).
        IF ls_pdeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        MOVE-CORRESPONDING ls_pdeep TO ls_pol.
        change_policy( EXPORTING is_policy = ls_pol it_members = ls_pdeep-members iv_email = CONV #( ls_pdeep-email )
                       IMPORTING es_policy = ls_out et_members = lt_mout ).
        MOVE-CORRESPONDING ls_out TO ls_pdeep.
        ls_pdeep-members = lt_mout.
        copy_data_to_ref( EXPORTING is_data = ls_pdeep CHANGING cr_data = er_deep_entity ).

      WHEN 'QuoteSet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_qdeep ).
        IF ls_qdeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        MOVE-CORRESPONDING ls_qdeep TO ls_quote.
        bl( )->calc_quote( EXPORTING iv_email = ls_qdeep-email CHANGING cs_quote = ls_quote ct_members = ls_qdeep-members ).
        MOVE-CORRESPONDING ls_quote TO ls_qdeep.
        copy_data_to_ref( EXPORTING is_data = ls_qdeep CHANGING cr_data = er_deep_entity ).

      WHEN 'MaintCmdSet'.
        DATA ls_mdeep TYPE zcl_ins_maint=>ts_cmd_deep.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_mdeep ).
        IF ls_mdeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        ls_mdeep-email = maint_admin( CONV #( ls_mdeep-email ) ).
        IF to_upper( condense( ls_mdeep-tab ) ) = 'POLICY'.
          " delete a policy (HR admin, current year): an entity create because the gateway passes no function imports
          TRY.
              READ TABLE ls_mdeep-rows INTO DATA(ls_prow) INDEX 1.
              bl( )->delete_policy( iv_email = CONV #( ls_mdeep-email ) iv_reqno = CONV #( condense( ls_prow-key1 ) ) iv_simulate = is_simulate( ) iv_hub_admin = mv_hub ).
            CATCH zcx_medi_error INTO DATA(lx_pd).
              busi( iv_text = lx_pd->mv_text iv_status = '403' ).
          ENDTRY.
          ls_mdeep-count = 1.
          ls_mdeep-ok = 'X'.
          CLEAR ls_mdeep-rows.
          copy_data_to_ref( EXPORTING is_data = ls_mdeep CHANGING cr_data = er_deep_entity ).
          RETURN.
        ENDIF.
        TRY.
            ls_mdeep-count = zcl_ins_maint=>apply( is_cmd = CORRESPONDING #( ls_mdeep ) it_rows = ls_mdeep-rows ).
          CATCH zcx_medi_error INTO DATA(lx_mc).
            ROLLBACK WORK.
            busi( lx_mc->mv_text ).
        ENDTRY.
        IF is_simulate( ) = abap_true.
          ROLLBACK WORK.
        ELSE.
          COMMIT WORK AND WAIT.
        ENDIF.
        ls_mdeep-ok = 'X'.
        CLEAR ls_mdeep-rows.
        copy_data_to_ref( EXPORTING is_data = ls_mdeep CHANGING cr_data = er_deep_entity ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~create_deep_entity(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                    io_data_provider = io_data_provider it_key_tab = it_key_tab it_navigation_path = it_navigation_path
                    io_expand = io_expand io_tech_request_context = io_tech_request_context
          IMPORTING er_deep_entity = er_deep_entity ).
    ENDCASE.
  ENDMETHOD.

  METHOD change_policy.
    " Policy payload: with ReqNo of an existing policy = add nominees, without ReqNo = new policy
    TRY.
        IF is_policy-reqno IS NOT INITIAL.
          bl( )->change( EXPORTING iv_email = iv_email is_policy = is_policy it_members = it_members iv_simulate = is_simulate( )
                         IMPORTING es_policy = es_policy et_members = et_members ).
        ELSE.
          bl( )->submit( EXPORTING iv_email = iv_email is_policy = is_policy it_members = it_members iv_simulate = is_simulate( )
                         IMPORTING es_policy = es_policy et_members = et_members ).
        ENDIF.
      CATCH zcx_medi_error INTO DATA(lx).
        busi( lx->mv_text ).
    ENDTRY.
    IF is_simulate( ) = abap_false.
      add_success( COND #( WHEN is_policy-reqno IS NOT INITIAL THEN `Request changed successfully.` ELSE `Request submitted successfully.` ) ).
    ENDIF.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~update_entity.
    " PUT / MERGE of PolicySet = add nominees. Members are read from the payload when the framework passes them.
    DATA: ls_pdeep TYPE zcl_medi_bl=>ts_policy_deep,
          ls_pol   TYPE zcl_medi_bl=>ts_policy,
          ls_out   TYPE zcl_medi_bl=>ts_policy,
          lt_mout  TYPE zcl_medi_bl=>tt_member.
    IF iv_entity_set_name <> 'PolicySet'.
      super->/iwbep/if_mgw_appl_srv_runtime~update_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  io_data_provider = io_data_provider it_key_tab = it_key_tab it_navigation_path = it_navigation_path
                  io_tech_request_context = io_tech_request_context
        IMPORTING er_entity = er_entity ).
      RETURN.
    ENDIF.
    TRY.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_pdeep ).
      CATCH cx_root.
        CLEAR ls_pdeep.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_pol ).
        MOVE-CORRESPONDING ls_pol TO ls_pdeep.
    ENDTRY.
    MOVE-CORRESPONDING ls_pdeep TO ls_pol.
    ls_pol-reqno = key_value( it_key = it_key_tab iv_name = 'ReqNo' ).
    DATA(lv_mail) = key_value( it_key = it_key_tab iv_name = 'Email' ).
    IF lv_mail IS INITIAL.
      lv_mail = ls_pol-email.
    ENDIF.
    IF lv_mail IS INITIAL.
      busi( `Email is mandatory (every request carries the login email).` ).
    ENDIF.
    change_policy( EXPORTING is_policy = ls_pol it_members = ls_pdeep-members iv_email = lv_mail
                   IMPORTING es_policy = ls_out et_members = lt_mout ).
    copy_data_to_ref( EXPORTING is_data = ls_out CHANGING cr_data = er_entity ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~patch_entity.
    me->/iwbep/if_mgw_appl_srv_runtime~update_entity(
      EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                io_data_provider = io_data_provider it_key_tab = it_key_tab it_navigation_path = it_navigation_path
      IMPORTING er_entity = er_entity ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    IF iv_entity_set_name <> 'BlockedEmployeeSet'.
      super->/iwbep/if_mgw_appl_srv_runtime~delete_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  it_key_tab = it_key_tab it_navigation_path = it_navigation_path io_tech_request_context = io_tech_request_context ).
      RETURN.
    ENDIF.
    TRY.
        bl( )->delete_blocked( iv_email = email_of( it_key = it_key_tab )
                               iv_empid = key_value( it_key = it_key_tab iv_name = 'EmpId' )
                               iv_simulate = is_simulate( ) ).
      CATCH zcx_medi_error INTO DATA(lx).
        busi( iv_text = lx->mv_text iv_status = '403' ).
    ENDTRY.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    DATA: ls_pol TYPE zcl_medi_bl=>ts_policy,
          ls_ctx TYPE zcl_medi_bl=>ts_context.
    DATA(lv_mail) = key_value( it_key = it_parameter iv_name = 'Email' ).
    IF lv_mail IS INITIAL.
      busi( `Email is mandatory (every request carries the login email).` ).
    ENDIF.
    CASE iv_action_name.
      WHEN 'DeletePolicy'.
        TRY.
            ls_pol = bl( )->delete_policy( iv_email = lv_mail iv_reqno = key_value( it_key = it_parameter iv_name = 'ReqNo' )
                                           iv_simulate = is_simulate( ) ).
          CATCH zcx_medi_error INTO DATA(lx).
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        IF is_simulate( ) = abap_false.
          add_success( `Request deleted.` ).
        ENDIF.
        copy_data_to_ref( EXPORTING is_data = ls_pol CHANGING cr_data = er_data ).

      WHEN 'RemoveBlockedEmployee'.
        TRY.
            DATA(lt_blk) = bl( )->list_blocked( lv_mail ).
            DATA(lv_emp) = key_value( it_key = it_parameter iv_name = 'EmpId' ).
            READ TABLE lt_blk INTO DATA(ls_blk) WITH KEY empid = lv_emp.
            IF sy-subrc <> 0.
              ls_blk-empid = lv_emp.
              ls_blk-email = lv_mail.
            ENDIF.
            bl( )->delete_blocked( iv_email = lv_mail iv_empid = lv_emp iv_simulate = is_simulate( ) ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = ls_blk CHANGING cr_data = er_data ).

      WHEN 'SetCutOff'.
        TRY.
            ls_ctx = bl( )->set_cutoff( iv_email = lv_mail
                                        iv_cutoff = parse_date( key_value( it_key = it_parameter iv_name = 'CutOffDate' ) )
                                        iv_insurer_mail = key_value( it_key = it_parameter iv_name = 'InsurerMail' )
                                        iv_simulate = is_simulate( ) ).
          CATCH zcx_medi_error INTO lx.
            busi( iv_text = lx->mv_text iv_status = '403' ).
        ENDTRY.
        copy_data_to_ref( EXPORTING is_data = ls_ctx CHANGING cr_data = er_data ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~execute_action(
          EXPORTING iv_action_name = iv_action_name it_parameter = it_parameter io_tech_request_context = io_tech_request_context
          IMPORTING er_data = er_data ).
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
