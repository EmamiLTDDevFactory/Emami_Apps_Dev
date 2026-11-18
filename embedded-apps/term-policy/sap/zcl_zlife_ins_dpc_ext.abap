CLASS zcl_zlife_ins_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zlife_ins_dpc CREATE PUBLIC.
* DPC_EXT for the SEGW project ZLIFE_INS (service ZLIFE_INS_SRV). NOT yet deployed: SEGW generates the model and the
* base class ZCL_ZLIFE_INS_DPC, which this class cannot compile without. After "Generate" in SEGW, paste this over
* the generated DPC_EXT. All business rules live in ZCL_LIFE_INS_UTILS; this class only maps OData <-> BL.
* Names below assume the entity/property names in README.md (generated ABAP names are the upper-case snake form).
  PUBLIC SECTION.
    METHODS:
      /iwbep/if_mgw_appl_srv_runtime~create_deep_entity   REDEFINITION,
      /iwbep/if_mgw_appl_srv_runtime~execute_action       REDEFINITION.
  PROTECTED SECTION.
    METHODS:
      profileset_get_entity      REDEFINITION,
      employeeset_get_entity     REDEFINITION,
      sumoptionset_get_entityset REDEFINITION,
      policyset_get_entityset    REDEFINITION.
  PRIVATE SECTION.
    METHODS:
      raise_business IMPORTING iv_text TYPE string RAISING /iwbep/cx_mgw_busi_exception,
      filter_value   IMPORTING it_filter TYPE /iwbep/t_mgw_select_option iv_name TYPE string
                     RETURNING VALUE(rv_value) TYPE string,
      user_of        IMPORTING iv_email TYPE string RETURNING VALUE(rv_user) TYPE zuname.
ENDCLASS.

CLASS zcl_zlife_ins_dpc_ext IMPLEMENTATION.

  METHOD raise_business.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING textid = /iwbep/cx_mgw_busi_exception=>business_error message = CONV #( iv_text ).
  ENDMETHOD.

  METHOD filter_value.
    READ TABLE it_filter INTO DATA(ls_f) WITH KEY property = iv_name.
    IF sy-subrc = 0.
      READ TABLE ls_f-select_options INTO DATA(ls_o) INDEX 1.
      IF sy-subrc = 0.
        rv_value = ls_o-low.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD user_of.
    rv_user = zcl_life_ins_utils=>user_from_email( iv_email ).
  ENDMETHOD.

  METHOD profileset_get_entity.
    DATA(lv_email) = CONV string( it_key_tab[ name = 'Email' ]-value ).
    DATA(lv_user) = user_of( lv_email ).
    er_entity-email       = lv_email.
    er_entity-user        = lv_user.
    er_entity-role        = zcl_life_ins_utils=>get_role( lv_user ).
    er_entity-emp_id      = zcl_life_ins_utils=>find_pernr( lv_email ).
    er_entity-active_year = zcl_life_ins_utils=>active_year( ).
  ENDMETHOD.

  METHOD employeeset_get_entity.
    DATA(lv_email) = CONV string( it_key_tab[ name = 'Email' ]-value ).
    DATA(lv_emp)   = CONV zlife_emp-emp_id( it_key_tab[ name = 'EmpId' ]-value ).
    zcl_life_ins_utils=>get_employee( EXPORTING iv_pernr = lv_emp iv_user = user_of( lv_email )
                                      IMPORTING es_emp = DATA(ls_emp) ev_error = DATA(lv_err) ).
    IF lv_err IS NOT INITIAL.
      raise_business( lv_err ).
    ENDIF.
    er_entity = VALUE #( emp_id = ls_emp-emp_id email = lv_email first_name = ls_emp-fname last_name = ls_emp-lname
      dob = ls_emp-dob age = ls_emp-age_in_yrs gender = ls_emp-gen_text company_code = ls_emp-comp_code company_name = ls_emp-code_txt
      department = ls_emp-dept org_unit = ls_emp-ou_text designation = ls_emp-design_txt location = ls_emp-location
      location_text = ls_emp-loc_txt company_mail = ls_emp-email limit_text = ls_emp-limit_txt year = ls_emp-zyear ).
  ENDMETHOD.

  METHOD sumoptionset_get_entityset.
    DATA(lv_emp) = CONV zlife_emp-emp_id( filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' ) ).
    LOOP AT zcl_life_ins_utils=>get_sum_options( lv_emp ) INTO DATA(ls_amt).
      APPEND VALUE #( email = filter_value( it_filter = it_filter_select_options iv_name = 'Email' ) emp_id = lv_emp slno = ls_amt-slno
                      sum_text = ls_amt-zsum_txt sum_amount = ls_amt-zsum premium = ls_amt-premium_amt gst = ls_amt-gst_amt
                      total = ls_amt-total_prem ) TO et_entityset.
    ENDLOOP.
  ENDMETHOD.

  METHOD policyset_get_entityset.
    DATA(lv_email) = filter_value( it_filter = it_filter_select_options iv_name = 'Email' ).
    DATA(lv_emp)   = CONV zlife_emp-emp_id( filter_value( it_filter = it_filter_select_options iv_name = 'EmpId' ) ).
    DATA(lv_all)   = xsdbool( filter_value( it_filter = it_filter_select_options iv_name = 'AllRows' ) = 'X' ).
    zcl_life_ins_utils=>search_policies( EXPORTING iv_user = user_of( lv_email ) iv_pernr = lv_emp iv_all = lv_all
                                         IMPORTING et_emp = DATA(lt_emp) et_family = DATA(lt_fam) ev_error = DATA(lv_err) ).
    IF lv_err IS NOT INITIAL AND lv_emp IS INITIAL.
      raise_business( lv_err ).
    ENDIF.
    DATA(lv_expand) = xsdbool( line_exists( it_navigation_path[ 1 ] ) OR io_tech_request_context->get_expand( ) IS NOT INITIAL ).
    LOOP AT lt_emp INTO DATA(ls_e).
      DATA(ls_out) = VALUE zcl_zlife_ins_mpc=>ts_policy(
        reqno = ls_e-reqno year = ls_e-zyear emp_id = ls_e-emp_id employee_name = |{ ls_e-fname } { ls_e-lname }| designation = ls_e-design_txt
        org_unit = ls_e-ou_text location_text = ls_e-loc_txt company_mail = ls_e-email personal_mail = ls_e-pmail contact = ls_e-contact
        sum_text = ls_e-sum_base premium = ls_e-pre_base gst = ls_e-gst total = ls_e-total_pre created_by = ls_e-created_by
        req_dat = ls_e-req_dat email = lv_email ).
      APPEND ls_out TO et_entityset.
    ENDLOOP.
    " $expand=Nominees is served by the SEGW-generated expand handling from GET_EXPANDED_ENTITYSET; if SEGW is set
    " to "no expand support", implement /iwbep/if_mgw_appl_srv_runtime~get_expanded_entityset with lt_fam here.
    ASSERT lv_expand = lv_expand AND lt_fam = lt_fam.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.
    " POST PolicySet (create or change) and POST LimitUploadSet (bulk limits), both deep inserts.
    CASE iv_entity_set_name.
      WHEN 'PolicySet'.
        DATA: BEGIN OF ls_deep.
                INCLUDE TYPE zcl_zlife_ins_mpc=>ts_policy.
        DATA:   nominees TYPE STANDARD TABLE OF zcl_zlife_ins_mpc=>ts_nominee WITH DEFAULT KEY,
              END OF ls_deep.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_deep ).
        DATA(lt_nom) = VALUE zcl_life_ins_utils=>tt_nominee( FOR n IN ls_deep-nominees ( name = n-name relation = n-relation per_share = n-per_share ) ).
        zcl_life_ins_utils=>save_policy(
          EXPORTING iv_user = user_of( CONV #( ls_deep-email ) ) iv_email = CONV #( ls_deep-email ) iv_reqno = CONV #( ls_deep-reqno )
                    is_input = VALUE #( emp_id = ls_deep-emp_id sum_base = ls_deep-sum_text pmail = ls_deep-personal_mail contact = ls_deep-contact )
                    it_nominee = lt_nom
          IMPORTING ev_reqno = DATA(lv_reqno) ev_error = DATA(lv_err) ).
        IF lv_err IS NOT INITIAL.
          ROLLBACK WORK.
          raise_business( lv_err ).
        ENDIF.
        COMMIT WORK AND WAIT.
        ls_deep-reqno = lv_reqno.
        copy_data_to_ref( EXPORTING is_data = ls_deep CHANGING cr_data = er_deep_entity ).
      WHEN 'LimitUploadSet'.
        DATA: BEGIN OF ls_up,
                email TYPE string,
                count TYPE i,
                rows  TYPE STANDARD TABLE OF zcl_zlife_ins_mpc=>ts_limit_row WITH DEFAULT KEY,
              END OF ls_up.
        io_data_provider->read_entry_data( IMPORTING es_data = ls_up ).
        zcl_life_ins_utils=>save_limits(
          EXPORTING iv_user = user_of( ls_up-email )
                    it_limit = VALUE #( FOR r IN ls_up-rows ( emp_id = r-emp_id limit = r-limit ) )
          IMPORTING ev_count = ls_up-count ev_error = lv_err ).
        IF lv_err IS NOT INITIAL.
          ROLLBACK WORK.
          raise_business( lv_err ).
        ENDIF.
        COMMIT WORK AND WAIT.
        copy_data_to_ref( EXPORTING is_data = ls_up CHANGING cr_data = er_deep_entity ).
      WHEN OTHERS.
        super->/iwbep/if_mgw_appl_srv_runtime~create_deep_entity( EXPORTING iv_entity_name = iv_entity_name
          iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name io_data_provider = io_data_provider
          it_key_tab = it_key_tab it_navigation_path = it_navigation_path io_expand = io_expand
          io_tech_request_context = io_tech_request_context IMPORTING er_deep_entity = er_deep_entity ).
    ENDCASE.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    " Function imports (HTTP POST): DeletePolicy(Reqno, Email), SendSummary(Reqnos, Email)
    DATA(lt_par) = io_tech_request_context->get_parameters( ).
    DATA(lv_email) = CONV string( VALUE #( lt_par[ name = 'Email' ]-value OPTIONAL ) ).
    DATA lv_err TYPE string.
    CASE iv_action_name.
      WHEN 'DeletePolicy'.
        zcl_life_ins_utils=>delete_policy( EXPORTING iv_user = user_of( lv_email )
          iv_reqno = CONV #( VALUE string( lt_par[ name = 'Reqno' ]-value OPTIONAL ) ) IMPORTING ev_error = lv_err ).
      WHEN 'SendSummary'.
        SPLIT VALUE string( lt_par[ name = 'Reqnos' ]-value OPTIONAL ) AT ',' INTO TABLE DATA(lt_split).
        zcl_life_ins_utils=>send_summary( EXPORTING iv_user = user_of( lv_email )
          it_reqno = VALUE #( FOR s IN lt_split ( CONV #( s ) ) ) IMPORTING ev_error = lv_err ).
      WHEN OTHERS.
        RETURN.
    ENDCASE.
    IF lv_err IS NOT INITIAL.
      ROLLBACK WORK.
      raise_business( lv_err ).
    ENDIF.
    COMMIT WORK AND WAIT.
    copy_data_to_ref( EXPORTING is_data = VALUE zcl_zlife_ins_mpc=>ts_result( ok = abap_true ) CHANGING cr_data = er_data ).
  ENDMETHOD.

ENDCLASS.
