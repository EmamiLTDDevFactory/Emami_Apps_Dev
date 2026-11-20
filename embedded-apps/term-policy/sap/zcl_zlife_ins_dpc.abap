"! Data provider of OData service ZLIFE_INS_SRV (code based, no SEGW project): maps requests to ZCL_LIFE_INS_UTILS.
"! Every call carries the hub login Email (the gateway signs in with a technical user). Custom query option simulate=X on a
"! write request runs everything and rolls back instead of committing (dry run, for tests).
CLASS zcl_zlife_ins_dpc DEFINITION PUBLIC INHERITING FROM /iwbep/cl_mgw_abs_data CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_deep_entity REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_entity REDEFINITION.
  PROTECTED SECTION.
    METHODS busi
      IMPORTING iv_text TYPE string iv_status TYPE /iwbep/mgw_http_status_code DEFAULT '400'
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS key_value
      IMPORTING it_key TYPE /iwbep/t_mgw_name_value_pair iv_name TYPE string RETURNING VALUE(rv_val) TYPE string.
    METHODS filter_value
      IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_name TYPE string RETURNING VALUE(rv_val) TYPE string.
    METHODS email_of
      IMPORTING it_key TYPE /iwbep/t_mgw_name_value_pair it_filter TYPE /iwbep/t_mgw_select_option OPTIONAL
      RETURNING VALUE(rv_mail) TYPE string RAISING /iwbep/cx_mgw_busi_exception.
    METHODS is_simulate RETURNING VALUE(rv_sim) TYPE abap_bool.
    METHODS finish
      IMPORTING iv_error TYPE string iv_simulate TYPE abap_bool RAISING /iwbep/cx_mgw_busi_exception.
    METHODS maint_admin
      IMPORTING iv_mail TYPE string RAISING /iwbep/cx_mgw_busi_exception.
    METHODS only_own
      IMPORTING iv_email TYPE string iv_empid TYPE string RAISING /iwbep/cx_mgw_busi_exception.
    METHODS to_policy
      IMPORTING is_emp TYPE zlife_emp iv_email TYPE string RETURNING VALUE(rs_pol) TYPE zcl_life_ins_ty=>ts_policy.
ENDCLASS.

CLASS zcl_zlife_ins_dpc IMPLEMENTATION.

  METHOD busi.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error_unlimited message_unlimited = iv_text http_status_code = iv_status.
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

  METHOD email_of.
    rv_mail = key_value( it_key = it_key iv_name = 'Email' ).
    IF rv_mail IS INITIAL.
      rv_mail = filter_value( it_filter = it_filter iv_name = 'Email' ).
    ENDIF.
    IF rv_mail IS INITIAL.
      busi( `Email is mandatory (every request carries the login email).` ).
    ENDIF.
  ENDMETHOD.

  METHOD is_simulate.
    " custom query option simulate=X (raw request URI) or header X-Life-Simulate: X
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
      ELSEIF to_lower( ls_h-name ) = 'x-life-simulate' AND ls_h-value IS NOT INITIAL AND to_upper( ls_h-value ) <> 'FALSE'.
        rv_sim = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD finish.
    " end of every write: error or dry run = ROLLBACK (also releases the save lock), else COMMIT
    IF iv_error IS NOT INITIAL.
      ROLLBACK WORK.
      busi( iv_error ).
    ELSEIF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD maint_admin.
    IF zcl_life_ins_utils=>is_admin( zcl_life_ins_utils=>user_from_email( iv_mail ) ) = abap_false.
      busi( iv_text = `Not Authorised` iv_status = '403' ).
    ENDIF.
  ENDMETHOD.

  METHOD only_own.
    " an ordinary user may read HR data and slabs of their own employee number only; editors and admins of any
    IF zcl_life_ins_utils=>get_role( zcl_life_ins_utils=>user_from_email( iv_email ) ) <> zcl_life_ins_utils=>c_role_user.
      RETURN.
    ENDIF.
    DATA lv_empid TYPE zlife_emp-emp_id.
    lv_empid = iv_empid.
    IF lv_empid IS INITIAL OR lv_empid <> zcl_life_ins_utils=>find_pernr( iv_email ).
      busi( iv_text = `You can see only your own employee ID.` iv_status = '403' ).
    ENDIF.
  ENDMETHOD.

  METHOD to_policy.
    rs_pol = VALUE #( reqno = is_emp-reqno email = iv_email year = is_emp-zyear empid = is_emp-emp_id
      employeename = |{ is_emp-fname } { is_emp-lname }| designation = is_emp-design_txt orgunit = is_emp-ou_text
      locationtext = is_emp-loc_txt companymail = is_emp-email personalmail = is_emp-pmail contact = is_emp-contact
      sumtext = is_emp-sum_base premium = is_emp-pre_base gst = is_emp-gst total = is_emp-total_pre
      createdby = is_emp-created_by reqdate = is_emp-req_dat ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    DATA(lv_mail) = email_of( it_key = it_key_tab ).
    DATA(lv_user) = zcl_life_ins_utils=>user_from_email( lv_mail ).
    CASE iv_entity_set_name.
      WHEN 'ProfileSet'.
        DATA(ls_prof) = VALUE zcl_life_ins_ty=>ts_profile( email = lv_mail user = lv_user
          role = zcl_life_ins_utils=>get_role( lv_user ) empid = zcl_life_ins_utils=>find_pernr( lv_mail )
          activeyear = zcl_life_ins_utils=>active_year( ) ).
        copy_data_to_ref( EXPORTING is_data = ls_prof CHANGING cr_data = er_entity ).

      WHEN 'EmployeeSet'.
        DATA(lv_emp) = key_value( it_key = it_key_tab iv_name = 'EmpId' ).
        only_own( iv_email = lv_mail iv_empid = lv_emp ).
        zcl_life_ins_utils=>get_employee( EXPORTING iv_pernr = CONV #( lv_emp ) iv_user = lv_user
                                          IMPORTING es_emp = DATA(ls_e) ev_error = DATA(lv_err) ).
        IF lv_err IS NOT INITIAL.
          busi( lv_err ).
        ENDIF.
        DATA(ls_emp) = VALUE zcl_life_ins_ty=>ts_employee( empid = ls_e-emp_id email = lv_mail firstname = ls_e-fname lastname = ls_e-lname
          dob = ls_e-dob age = ls_e-age_in_yrs gender = ls_e-gen_text companycode = ls_e-comp_code companyname = ls_e-code_txt
          department = ls_e-dept orgunit = ls_e-ou_text designation = ls_e-design_txt location = ls_e-location
          locationtext = ls_e-loc_txt companymail = ls_e-email limittext = ls_e-limit_txt year = ls_e-zyear ).
        copy_data_to_ref( EXPORTING is_data = ls_emp CHANGING cr_data = er_entity ).

      WHEN 'PolicySet'.
        zcl_life_ins_utils=>get_policy( EXPORTING iv_user = lv_user iv_reqno = CONV #( key_value( it_key = it_key_tab iv_name = 'Reqno' ) )
                                        IMPORTING es_emp = DATA(ls_pe) ev_error = lv_err ).
        IF lv_err IS NOT INITIAL.
          busi( iv_text = lv_err iv_status = '404' ).
        ENDIF.
        DATA(ls_pol) = to_policy( is_emp = ls_pe iv_email = lv_mail ).
        copy_data_to_ref( EXPORTING is_data = ls_pol CHANGING cr_data = er_entity ).

      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~get_entity(
          EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                    it_key_tab = it_key_tab it_navigation_path = it_navigation_path io_tech_request_context = io_tech_request_context
          IMPORTING er_entity = er_entity es_response_context = es_response_context ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA lv_err TYPE string.
    DATA(lv_mail) = email_of( it_key = it_key_tab it_filter = it_filter_select_options ).
    DATA(lv_user) = zcl_life_ins_utils=>user_from_email( lv_mail ).
    CASE iv_entity_set_name.
      WHEN 'SumOptionSet'.
        DATA(lv_emp) = filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' ).
        only_own( iv_email = lv_mail iv_empid = lv_emp ).
        DATA lt_sum TYPE zcl_life_ins_ty=>tt_sumoption.
        LOOP AT zcl_life_ins_utils=>get_sum_options( CONV #( lv_emp ) ) INTO DATA(ls_amt).
          APPEND VALUE #( email = lv_mail empid = lv_emp slno = |{ sy-tabix WIDTH = 3 ALIGN = RIGHT PAD = '0' }|
            sumtext = ls_amt-zsum_txt sumamount = ls_amt-zsum premium = ls_amt-premium_amt gst = ls_amt-gst_amt
            total = ls_amt-total_prem ) TO lt_sum.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_sum CHANGING cr_data = er_entityset ).

      WHEN 'PolicySet'.
        lv_emp = filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' ).
        DATA(lv_all) = xsdbool( filter_value( it_filter = it_filter_select_options iv_name = 'AllRows' ) = 'X' ).
        zcl_life_ins_utils=>search_policies( EXPORTING iv_user = lv_user iv_pernr = CONV #( lv_emp ) iv_all = lv_all
                                             IMPORTING et_emp = DATA(lt_emp) ev_error = lv_err ).
        IF lv_err IS NOT INITIAL AND lv_emp IS INITIAL.
          busi( iv_text = lv_err iv_status = '403' ).
        ENDIF.
        DATA lt_pol TYPE zcl_life_ins_ty=>tt_policy.
        LOOP AT lt_emp INTO DATA(ls_e).
          APPEND to_policy( is_emp = ls_e iv_email = lv_mail ) TO lt_pol.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_pol CHANGING cr_data = er_entityset ).

      WHEN 'NomineeSet'.
        " served for $expand=Nominees (and Policy -> Nominees navigation); the parent key carries Reqno and Email
        zcl_life_ins_utils=>get_policy( EXPORTING iv_user = lv_user iv_reqno = CONV #( key_value( it_key = it_key_tab iv_name = 'Reqno' ) )
                                        IMPORTING et_family = DATA(lt_fam) ev_error = lv_err ).
        IF lv_err IS NOT INITIAL.
          busi( iv_text = lv_err iv_status = '404' ).
        ENDIF.
        DATA lt_nom TYPE zcl_life_ins_ty=>tt_nominee.
        LOOP AT lt_fam INTO DATA(ls_f).
          APPEND VALUE #( reqno = ls_f-reqno slno = ls_f-sl_no name = ls_f-name relation = ls_f-relation pershare = ls_f-per_share ) TO lt_nom.
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_nom CHANGING cr_data = er_entityset ).

      WHEN 'MaintRowSet'.
        maint_admin( lv_mail ).
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

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
    " POST PolicySet = submit (Reqno empty) or change (Reqno of an existing request); POST LimitUploadSet = bulk limits
    DATA: ls_pdeep TYPE zcl_life_ins_ty=>ts_policy_deep,
          ls_ldeep TYPE zcl_life_ins_ty=>ts_limitupload_deep,
          lv_reqno TYPE zlife_emp-reqno,
          lv_count TYPE i,
          lv_err   TYPE string.
    CASE iv_entity_set_name.
      WHEN 'PolicySet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_pdeep ).
        IF ls_pdeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        DATA(lt_nom) = VALUE zcl_life_ins_utils=>tt_nominee(
          FOR n IN ls_pdeep-nominees ( name = n-name relation = n-relation per_share = n-pershare ) ).
        zcl_life_ins_utils=>save_policy(
          EXPORTING iv_user = zcl_life_ins_utils=>user_from_email( CONV string( ls_pdeep-email ) ) iv_email = CONV string( ls_pdeep-email ) iv_reqno = CONV #( ls_pdeep-reqno )
                    is_input = VALUE #( emp_id = ls_pdeep-empid sum_base = ls_pdeep-sumtext pmail = ls_pdeep-personalmail contact = ls_pdeep-contact )
                    it_nominee = lt_nom
          IMPORTING ev_reqno = lv_reqno ev_error = lv_err ).
        finish( iv_error = lv_err iv_simulate = is_simulate( ) ).
        ls_pdeep-reqno = lv_reqno.
        copy_data_to_ref( EXPORTING is_data = ls_pdeep CHANGING cr_data = er_deep_entity ).

      WHEN 'LimitUploadSet'.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_ldeep ).
        IF ls_ldeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        DATA lt_lim TYPE zcl_life_ins_utils=>tt_limit.
        LOOP AT ls_ldeep-rows INTO DATA(ls_row).
          APPEND VALUE #( emp_id = ls_row-empid limit = ls_row-limit ) TO lt_lim.
        ENDLOOP.
        zcl_life_ins_utils=>save_limits( EXPORTING iv_user = zcl_life_ins_utils=>user_from_email( CONV string( ls_ldeep-email ) ) it_limit = lt_lim
                                         IMPORTING ev_count = lv_count ev_error = lv_err ).
        finish( iv_error = lv_err iv_simulate = is_simulate( ) ).
        ls_ldeep-count = lv_count.
        copy_data_to_ref( EXPORTING is_data = ls_ldeep CHANGING cr_data = er_deep_entity ).

      WHEN 'MaintCmdSet'.
        DATA ls_mdeep TYPE zcl_ins_maint=>ts_cmd_deep.
        DATA lv_merr TYPE string.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_mdeep ).
        IF ls_mdeep-email IS INITIAL.
          busi( `Email is mandatory (every request carries the login email).` ).
        ENDIF.
        maint_admin( CONV #( ls_mdeep-email ) ).
        TRY.
            ls_mdeep-count = zcl_ins_maint=>apply( is_cmd = CORRESPONDING #( ls_mdeep ) it_rows = ls_mdeep-rows ).
          CATCH zcx_medi_error INTO DATA(lx_mc).
            lv_merr = lx_mc->mv_text.
        ENDTRY.
        finish( iv_error = lv_merr iv_simulate = is_simulate( ) ).
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

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    " POST CommandSet {Email, Action = DELETE | MAIL, Reqnos = 'a,b'}. These are entity creates, not function imports, because the
    " gateway hub answers every function-import POST with an empty 404 while entity-create POSTs pass.
    DATA: ls_cmd TYPE zcl_life_ins_ty=>ts_command,
          lv_err TYPE string.
    IF iv_entity_set_name <> 'CommandSet'.
      super->/iwbep/if_mgw_appl_srv_runtime~create_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  io_data_provider = io_data_provider it_key_tab = it_key_tab it_navigation_path = it_navigation_path
                  io_tech_request_context = io_tech_request_context
        IMPORTING er_entity = er_entity ).
      RETURN.
    ENDIF.
    io_data_provider->read_entry_data( IMPORTING es_data = ls_cmd ).
    IF ls_cmd-email IS INITIAL.
      busi( `Email is mandatory (every request carries the login email).` ).
    ENDIF.
    DATA(lv_user) = zcl_life_ins_utils=>user_from_email( CONV string( ls_cmd-email ) ).
    CASE to_upper( condense( ls_cmd-action ) ).
      WHEN 'DELETE'.
        zcl_life_ins_utils=>delete_policy( EXPORTING iv_user = lv_user iv_reqno = CONV #( condense( ls_cmd-reqnos ) )
                                           IMPORTING ev_error = lv_err ).
      WHEN 'MAIL'.
        SPLIT ls_cmd-reqnos AT ',' INTO TABLE DATA(lt_split).
        DATA lt_req TYPE zcl_life_ins_utils=>tt_reqno.
        LOOP AT lt_split INTO DATA(lv_s).
          APPEND CONV zlife_emp-reqno( condense( lv_s ) ) TO lt_req.
        ENDLOOP.
        zcl_life_ins_utils=>send_summary( EXPORTING iv_user = lv_user it_reqno = lt_req IMPORTING ev_error = lv_err ).
      WHEN OTHERS.
        busi( `Unknown action. Use DELETE or MAIL.` ).
    ENDCASE.
    finish( iv_error = lv_err iv_simulate = is_simulate( ) ).
    ls_cmd-ok = 'X'.
    copy_data_to_ref( EXPORTING is_data = ls_cmd CHANGING cr_data = er_entity ).
  ENDMETHOD.

ENDCLASS.
