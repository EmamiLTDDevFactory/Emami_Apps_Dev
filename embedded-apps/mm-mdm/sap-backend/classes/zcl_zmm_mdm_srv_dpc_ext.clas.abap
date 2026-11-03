"! Data provider extension of the Gateway service ZMM_MDM_SRV (generated base class ZCL_ZMM_MDM_SRV_DPC).
"!
"! Generic implementation: the 19 staging entity sets, the request header, history and value helps are all handled here
"! through ZCL_MM_MDM_NAMING and ZCL_MM_MDM_STAGING, so there is no method per entity set.
"! Business logic is not in this class; it calls the classes of the package:
"!   ZCL_MM_MDM_REQUEST_SVC, ZCL_MM_MDM_WORKFLOW, ZCL_MM_MDM_VALIDATOR, ZCL_MM_MDM_POSTER (via the workflow),
"!   ZCL_MM_MDM_FIELD_CONTROL, ZCL_MM_MDM_FUNCTIONS, ZCL_MM_MDM_VALUEHELP.
"!
"! Assumptions about the generated MPC class (check after the model import in SEGW):
"!   structure types TS_<ENTITYTYPE> (for example TS_REQUEST, TS_MATERIAL) and table types TT_<ENTITYTYPE>,
"!   complex type structures TS_MESSAGE, TS_STARTRESULT, TS_DUPLICATE, TS_DESCRIPTIONRESULT, TS_HSNRESULT,
"!   TS_FIELDCONTROLITEM, TS_SESSIONINFO. Field names are matched ignoring case and underscores, so the ABAP
"!   field names in SEGW may be TRANS_ID or TRANSID.
"!
"! Unit of work: the front end sends one $batch change set per action. Entity writes and the action run in the same
"! logical unit; the framework commits at the end. VALIDATE rolls the unit back itself, so validation never stores data.
"! The workflow class commits on its own, so Submit, Approve and the other workflow actions call it as the last step.
CLASS zcl_zmm_mdm_srv_dpc_ext DEFINITION PUBLIC INHERITING FROM zcl_zmm_mdm_srv_dpc CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset  REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_entity     REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_entity  REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~update_entity  REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~delete_entity  REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_begin REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_end   REDEFINITION.

  PRIVATE SECTION.
    TYPES tt_message TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>ts_message WITH DEFAULT KEY.
    TYPES tt_item    TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>ts_fieldcontrolitem WITH DEFAULT KEY.
    TYPES tt_dup     TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>ts_duplicate WITH DEFAULT KEY.
    TYPES tt_hsn     TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>ts_hsnresult WITH DEFAULT KEY.

    DATA mo_req TYPE REF TO zcl_mm_mdm_request_svc.

    METHODS req RETURNING VALUE(ro_req) TYPE REF TO zcl_mm_mdm_request_svc.

    "Parameters and keys
    METHODS param
      IMPORTING it_parameter    TYPE /iwbep/t_mgw_name_value_pair
                iv_name         TYPE csequence
      RETURNING VALUE(rv_value) TYPE string.
    METHODS is_true IMPORTING iv_value TYPE csequence RETURNING VALUE(rv_yes) TYPE abap_bool.
    METHODS key_value
      IMPORTING it_key_tab      TYPE /iwbep/t_mgw_name_value_pair
                iv_name         TYPE csequence
      RETURNING VALUE(rv_value) TYPE string.
    METHODS filter_value
      IMPORTING it_filter       TYPE /iwbep/t_mgw_select_option
                iv_name         TYPE csequence
      RETURNING VALUE(rv_value) TYPE string.
    METHODS filter_pairs
      IMPORTING it_filter      TYPE /iwbep/t_mgw_select_option
      RETURNING VALUE(rt_pair) TYPE /iwbep/t_mgw_name_value_pair.
    "TransId from the source keys (navigation), the entity keys or the filter
    METHODS transid_from
      IMPORTING it_key_tab        TYPE /iwbep/t_mgw_name_value_pair
                it_filter         TYPE /iwbep/t_mgw_select_option OPTIONAL
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid.

    "Messages
    METHODS raise_messages
      IMPORTING it_msg TYPE zif_mm_mdm_types=>tt_msg
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS to_message_table
      IMPORTING it_msg        TYPE zif_mm_mdm_types=>tt_msg
      RETURNING VALUE(rt_ret) TYPE tt_message.

    "Header to entity
    METHODS fill_request
      IMPORTING is_hdr TYPE /inowits/m_trans
      CHANGING  cs_ent TYPE any.

    "Staging entity sets
    METHODS staging_entityset
      IMPORTING iv_entity_name TYPE string
                iv_set         TYPE string
                iv_transid     TYPE zif_mm_mdm_types=>ty_transid
      EXPORTING er_entityset   TYPE REF TO data.
    METHODS staging_entity
      IMPORTING iv_entity_name TYPE string
                iv_set         TYPE string
                iv_transid     TYPE zif_mm_mdm_types=>ty_transid
                it_key_tab     TYPE /iwbep/t_mgw_name_value_pair
      EXPORTING er_entity      TYPE REF TO data.

    "Only the initiator in draft, requested or sent back, and the user of the open work item, may change staging data
    METHODS assert_edit
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
      RAISING   /iwbep/cx_mgw_busi_exception.

    METHODS run_action
      IMPORTING iv_action_name TYPE string
                it_parameter   TYPE /iwbep/t_mgw_name_value_pair
      EXPORTING er_data        TYPE REF TO data
      RAISING   zcx_mm_mdm.
ENDCLASS.

CLASS zcl_zmm_mdm_srv_dpc_ext IMPLEMENTATION.

  METHOD req.
    IF mo_req IS NOT BOUND. mo_req = NEW #( ). ENDIF.
    ro_req = mo_req.
  ENDMETHOD.

  METHOD param.
    LOOP AT it_parameter INTO DATA(ls) WHERE name IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-name ) = zcl_mm_mdm_naming=>norm( iv_name ).
        rv_value = ls-value. RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD is_true.
    rv_yes = xsdbool( to_lower( CONV string( iv_value ) ) = 'true' OR iv_value = 'X' OR iv_value = '1' ).
  ENDMETHOD.

  METHOD key_value.
    LOOP AT it_key_tab INTO DATA(ls) WHERE name IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-name ) = zcl_mm_mdm_naming=>norm( iv_name ).
        rv_value = ls-value. RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD filter_value.
    LOOP AT it_filter INTO DATA(ls) WHERE property IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-property ) = zcl_mm_mdm_naming=>norm( iv_name ).
        READ TABLE ls-select_options INTO DATA(ls_so) INDEX 1.
        IF sy-subrc = 0. rv_value = ls_so-low. ENDIF.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD filter_pairs.
    LOOP AT it_filter INTO DATA(ls).
      READ TABLE ls-select_options INTO DATA(ls_so) INDEX 1.
      IF sy-subrc = 0. APPEND VALUE #( name = ls-property value = ls_so-low ) TO rt_pair. ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD transid_from.
    DATA(lv) = key_value( it_key_tab = it_key_tab iv_name = 'TransId' ).
    IF lv IS INITIAL. lv = filter_value( it_filter = it_filter iv_name = 'TransId' ). ENDIF.
    IF lv IS NOT INITIAL. rv_transid = zcl_mm_mdm_naming=>pad_transid( lv ). ENDIF.
  ENDMETHOD.

  METHOD raise_messages.
    DATA(lo_msg) = mo_context->get_message_container( ).
    LOOP AT it_msg INTO DATA(ls).
      lo_msg->add_message_text_only(
        EXPORTING iv_msg_type       = COND #( WHEN ls-severity = 'W' THEN 'W' WHEN ls-severity = 'I' THEN 'I' ELSE 'E' )
                  iv_msg_text       = CONV #( ls-message )
                  iv_message_target = CONV #( ls-target ) ).
    ENDLOOP.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception EXPORTING message_container = lo_msg.
  ENDMETHOD.

  METHOD to_message_table.
    LOOP AT it_msg INTO DATA(ls).
      APPEND VALUE #( code = ls-code message = ls-message severity = ls-severity target = ls-target ) TO rt_ret.
    ENDLOOP.
  ENDMETHOD.

  METHOD fill_request.
    zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = is_hdr CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'IsDuplicate' iv_value = is_hdr-duplicate CHANGING cs_target = cs_ent ).
    "ObjValue, Initiator and the dates come from the same-name copy; derived values:
    SELECT SINGLE mtart FROM /inowits/mm_mara WHERE transid = @is_hdr-transid INTO @DATA(lv_mtart).
    SELECT SINGLE maktx FROM /inowits/mm_makt WHERE transid = @is_hdr-transid INTO @DATA(lv_desc).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'MaterialType'        iv_value = lv_mtart CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'MaterialDescription' iv_value = lv_desc  CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Level'
      iv_value = req( )->get_level( iv_transid = is_hdr-transid iv_app_id = is_hdr-app_id ) CHANGING cs_target = cs_ent ).
    DATA(ls_al) = req( )->get_allowed( iv_transid = is_hdr-transid iv_app_id = is_hdr-app_id ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanEdit'        iv_value = ls_al-edit         CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanValidate'    iv_value = ls_al-validate     CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanSaveDraft'   iv_value = ls_al-save_draft   CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanSubmit'      iv_value = ls_al-submit       CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanApprove'     iv_value = ls_al-approve      CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanSendBack'    iv_value = ls_al-send_back    CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanReject'      iv_value = ls_al-reject       CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanForward'     iv_value = ls_al-forward      CHANGING cs_target = cs_ent ).
    zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'CanDeleteDraft' iv_value = ls_al-delete_draft CHANGING cs_target = cs_ent ).
  ENDMETHOD.

  METHOD assert_edit.
    TRY.
        DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid ).
        IF req( )->get_allowed( iv_transid = iv_transid iv_app_id = ls_hdr-app_id )-edit = abap_false.
          raise_messages( VALUE #( ( code = 'E403' severity = 'E' message = 'You cannot change this request in its current status' ) ) ).
        ENDIF.
      CATCH zcx_mm_mdm INTO DATA(lx).
        raise_messages( lx->mt_msg ).
    ENDTRY.
  ENDMETHOD.

  "---------------------------------------------------------------------------------------------
  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_begin.
    "No deferred processing: every operation of the change set runs when it arrives, in one logical unit.
    cv_defer_mode = abap_false.
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_end.
    "Nothing to do: the framework commits when the change set succeeds and rolls back when it fails.
  ENDMETHOD.

  "---------------------------------------------------------------------------------------------
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA lr_tab TYPE REF TO data.
    FIELD-SYMBOLS <tab> TYPE STANDARD TABLE.
    FIELD-SYMBOLS <line> TYPE any.
    DATA(lv_user) = sy-uname.

    CASE iv_entity_set_name.

      WHEN 'RequestSet'.
        DATA(lt_hdr) = req( )->list(
          iv_scope  = COND #( WHEN filter_value( it_filter = it_filter_select_options iv_name = 'Scope' ) IS INITIAL THEN `all`
                              ELSE filter_value( it_filter = it_filter_select_options iv_name = 'Scope' ) )
          iv_status = CONV #( filter_value( it_filter = it_filter_select_options iv_name = 'Status' ) )
          iv_mtart  = CONV #( filter_value( it_filter = it_filter_select_options iv_name = 'MaterialType' ) )
          iv_text   = filter_value( it_filter = it_filter_select_options iv_name = 'Search' )
          iv_user   = lv_user ).
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc=>tt_request.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT lt_hdr INTO DATA(ls_h).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          fill_request( EXPORTING is_hdr = ls_h CHANGING cs_ent = <line> ).
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN 'RequestHistorySet'.
        DATA(lv_tid) = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options ).
        SELECT * FROM /inowits/trans_i WHERE transid = @lv_tid ORDER BY serial_no INTO TABLE @DATA(lt_hist).
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc=>tt_requesthistory.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT lt_hist INTO DATA(ls_i).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_i CHANGING cs_target = <line> ).
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN 'MaterialTypeVhSet' OR 'MainGroupSet' OR 'SubGroupSet' OR 'SubSubGroupSet' OR 'GenericValueHelpSet'.
        DATA(lt_pair) = filter_pairs( it_filter_select_options ).
        DATA(lv_vh) = SWITCH string( iv_entity_set_name
                        WHEN 'MaterialTypeVhSet' THEN 'MTART' WHEN 'MainGroupSet' THEN 'MGRP'
                        WHEN 'SubGroupSet' THEN 'SGRP' WHEN 'SubSubGroupSet' THEN 'SSGR'
                        ELSE filter_value( it_filter = it_filter_select_options iv_name = 'Name' ) ).
        DATA(lt_vh) = zcl_mm_mdm_valuehelp=>get( iv_name = lv_vh it_filter = lt_pair ).
        DATA(lv_tt) = SWITCH string( iv_entity_set_name
                        WHEN 'MaterialTypeVhSet' THEN `TT_MATERIALTYPEVH` WHEN 'MainGroupSet' THEN `TT_MAINGROUP`
                        WHEN 'SubGroupSet' THEN `TT_SUBGROUP` WHEN 'SubSubGroupSet' THEN `TT_SUBSUBGROUP` ELSE `TT_GENERICVALUEHELP` ).
        DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>{ lv_tt }|.
        CREATE DATA lr_tab TYPE (lv_tn).
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT lt_vh INTO DATA(ls_v).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Key'  iv_value = ls_v-key  CHANGING cs_target = <line> ).
          zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Text' iv_value = ls_v-text CHANGING cs_target = <line> ).
          LOOP AT lt_pair INTO DATA(ls_p).      "filter values come back on every line (Mtart, Mgrpid ...)
            zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = ls_p-name iv_value = ls_p-value CHANGING cs_target = <line> ).
          ENDLOOP.
          IF iv_entity_set_name = 'GenericValueHelpSet'.
            zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Name' iv_value = lv_vh CHANGING cs_target = <line> ).
          ENDIF.
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN OTHERS.
        IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_true.
          staging_entityset( EXPORTING iv_entity_name = CONV #( iv_entity_name ) iv_set = CONV #( iv_entity_set_name )
                                       iv_transid = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options )
                             IMPORTING er_entityset = er_entityset ).
        ELSE.
          super->/iwbep/if_mgw_appl_srv_runtime~get_entityset(
            EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                      it_filter_select_options = it_filter_select_options is_paging = is_paging it_key_tab = it_key_tab
                      it_navigation_path = it_navigation_path it_order = it_order iv_filter_string = iv_filter_string
                      iv_search_string = iv_search_string io_tech_request_context = io_tech_request_context
            IMPORTING er_entityset = er_entityset es_response_context = es_response_context ).
        ENDIF.
    ENDCASE.
  ENDMETHOD.

  METHOD staging_entityset.
    DATA lr_tab TYPE REF TO data.
    FIELD-SYMBOLS <tab> TYPE STANDARD TABLE.
    FIELD-SYMBOLS <line> TYPE any.
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TT_{ to_upper( iv_entity_name ) }|.
    CREATE DATA lr_tab TYPE (lv_tn).
    ASSIGN lr_tab->* TO <tab>.
    DATA(lr_rows) = zcl_mm_mdm_staging=>read_rows( iv_set = iv_set iv_transid = iv_transid ).
    IF lr_rows IS BOUND.
      ASSIGN lr_rows->* TO FIELD-SYMBOL(<rows>).
      LOOP AT <rows> ASSIGNING FIELD-SYMBOL(<r>).
        APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
        zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = <r> CHANGING cs_target = <line> ).
      ENDLOOP.
    ENDIF.
    er_entityset = lr_tab.
  ENDMETHOD.

  "---------------------------------------------------------------------------------------------
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entity.
    DATA lr_ent TYPE REF TO data.
    CASE iv_entity_set_name.

      WHEN 'RequestSet'.
        TRY.
            DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header(
              iv_transid = zcl_mm_mdm_naming=>pad_transid( key_value( it_key_tab = it_key_tab iv_name = 'TransId' ) )
              iv_app_id  = CONV #( key_value( it_key_tab = it_key_tab iv_name = 'AppId' ) ) ).
          CATCH zcx_mm_mdm INTO DATA(lx).
            raise_messages( lx->mt_msg ).
        ENDTRY.
        CREATE DATA lr_ent TYPE zcl_zmm_mdm_srv_mpc=>ts_request.
        ASSIGN lr_ent->* TO FIELD-SYMBOL(<req>).
        fill_request( EXPORTING is_hdr = ls_hdr CHANGING cs_ent = <req> ).
        er_entity = lr_ent.

      WHEN OTHERS.
        IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_true.
          staging_entity( EXPORTING iv_entity_name = CONV #( iv_entity_name ) iv_set = CONV #( iv_entity_set_name )
                                    iv_transid = transid_from( it_key_tab = it_key_tab ) it_key_tab = it_key_tab
                          IMPORTING er_entity = er_entity ).
        ELSE.
          super->/iwbep/if_mgw_appl_srv_runtime~get_entity(
            EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                      it_key_tab = it_key_tab io_request_object = io_request_object io_tech_request_context = io_tech_request_context
                      it_navigation_path = it_navigation_path
            IMPORTING er_entity = er_entity es_response_context = es_response_context ).
        ENDIF.
    ENDCASE.
  ENDMETHOD.

  METHOD staging_entity.
    DATA(lr_row) = zcl_mm_mdm_staging=>read_row( iv_set = iv_set iv_transid = iv_transid it_key = it_key_tab ).
    IF lr_row IS NOT BOUND. RETURN. ENDIF.      "no row: empty response (404 for a direct read, empty for a navigation)
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TS_{ to_upper( iv_entity_name ) }|.
    CREATE DATA er_entity TYPE (lv_tn).
    ASSIGN er_entity->* TO FIELD-SYMBOL(<ent>).
    ASSIGN lr_row->* TO FIELD-SYMBOL(<row>).
    zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = <row> CHANGING cs_target = <ent> ).
  ENDMETHOD.

  "---------------------------------------------------------------------------------------------
  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      super->/iwbep/if_mgw_appl_srv_runtime~create_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  it_key_tab = it_key_tab io_tech_request_context = io_tech_request_context
                  it_navigation_path = it_navigation_path io_data_provider = io_data_provider
        IMPORTING er_entity = er_entity ).
      RETURN.
    ENDIF.
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TS_{ to_upper( iv_entity_name ) }|.
    CREATE DATA er_entity TYPE (lv_tn).
    ASSIGN er_entity->* TO FIELD-SYMBOL(<ent>).
    io_data_provider->read_entry_data( IMPORTING es_data = <ent> ).
    DATA(lr_t) = zcl_mm_mdm_staging=>comp_ref( is_data = <ent> iv_name = 'TransId' ).
    IF lr_t IS NOT BOUND.
      raise_messages( VALUE #( ( code = 'E400' severity = 'E' message = 'TransId is missing' ) ) ).
    ENDIF.
    ASSIGN lr_t->* TO FIELD-SYMBOL(<t>).
    DATA(lv_transid) = zcl_mm_mdm_naming=>pad_transid( |{ <t> }| ).
    assert_edit( lv_transid ).
    zcl_mm_mdm_staging=>merge_row( iv_set = iv_entity_set_name iv_transid = lv_transid is_entity = <ent> ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~update_entity.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      super->/iwbep/if_mgw_appl_srv_runtime~update_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  it_key_tab = it_key_tab io_tech_request_context = io_tech_request_context
                  it_navigation_path = it_navigation_path io_data_provider = io_data_provider
        IMPORTING er_entity = er_entity ).
      RETURN.
    ENDIF.
    DATA(lv_transid) = transid_from( it_key_tab ).
    assert_edit( lv_transid ).
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TS_{ to_upper( iv_entity_name ) }|.
    CREATE DATA er_entity TYPE (lv_tn).
    ASSIGN er_entity->* TO FIELD-SYMBOL(<ent>).
    io_data_provider->read_entry_data( IMPORTING es_data = <ent> ).
    "The client sends the whole row, so the entity carries every exposed field; fields not exposed keep their value.
    "Keys of the row come from the URL, not from the body.
    LOOP AT it_key_tab INTO DATA(ls_k) WHERE name IS NOT INITIAL.
      zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = ls_k-name iv_value = ls_k-value CHANGING cs_target = <ent> ).
    ENDLOOP.
    zcl_mm_mdm_staging=>merge_row( iv_set = iv_entity_set_name iv_transid = lv_transid is_entity = <ent> ).
  ENDMETHOD.

  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      super->/iwbep/if_mgw_appl_srv_runtime~delete_entity(
        EXPORTING iv_entity_name = iv_entity_name iv_entity_set_name = iv_entity_set_name iv_source_name = iv_source_name
                  it_key_tab = it_key_tab io_tech_request_context = io_tech_request_context it_navigation_path = it_navigation_path ).
      RETURN.
    ENDIF.
    DATA(lv_transid) = transid_from( it_key_tab ).
    assert_edit( lv_transid ).
    zcl_mm_mdm_staging=>delete_row( iv_set = iv_entity_set_name iv_transid = lv_transid it_key = it_key_tab ).
  ENDMETHOD.

  "---------------------------------------------------------------------------------------------
  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    TRY.
        run_action( EXPORTING iv_action_name = iv_action_name it_parameter = it_parameter IMPORTING er_data = er_data ).
      CATCH zcx_mm_mdm INTO DATA(lx).
        raise_messages( lx->mt_msg ).
    ENDTRY.
  ENDMETHOD.

  METHOD run_action.
    DATA lt_msg TYPE zif_mm_mdm_types=>tt_msg.
    DATA(lv_user) = sy-uname.
    DATA(lv_tid)  = zcl_mm_mdm_naming=>pad_transid( param( it_parameter = it_parameter iv_name = 'TransId' ) ).
    DATA(lv_app)  = CONV zif_mm_mdm_types=>ty_app_id( param( it_parameter = it_parameter iv_name = 'AppId' ) ).
    DATA(lv_cmt)  = param( it_parameter = it_parameter iv_name = 'Comment' ).

    CASE iv_action_name.

      WHEN 'StartRequest'.
        DATA(ls_start) = VALUE zif_mm_mdm_types=>ty_start(
          material_type = param( it_parameter = it_parameter iv_name = 'MaterialType' )
          industry_sector = param( it_parameter = it_parameter iv_name = 'IndustrySector' )
          description = param( it_parameter = it_parameter iv_name = 'Description' )
          main_group = param( it_parameter = it_parameter iv_name = 'MainGroup' )
          sub_group = param( it_parameter = it_parameter iv_name = 'SubGroup' )
          sub_sub_group = param( it_parameter = it_parameter iv_name = 'SubSubGroup' )
          manufacturer_part = param( it_parameter = it_parameter iv_name = 'ManufacturerPart' )
          plant = param( it_parameter = it_parameter iv_name = 'Plant' )
          storage_location = param( it_parameter = it_parameter iv_name = 'StorageLocation' )
          sales_org = param( it_parameter = it_parameter iv_name = 'SalesOrg' )
          distribution_channel = param( it_parameter = it_parameter iv_name = 'DistributionChannel' )
          views = param( it_parameter = it_parameter iv_name = 'Views' )
          draft = is_true( param( it_parameter = it_parameter iv_name = 'Draft' ) ) ).
        DATA(lv_new) = req( )->start_request( is_start = ls_start iv_user = lv_user ).
        DATA ls_res TYPE zcl_zmm_mdm_srv_mpc=>ts_startresult.
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'TransId' iv_value = lv_new CHANGING cs_target = ls_res ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'AppId' iv_value = zif_mm_mdm_types=>gc_app_create CHANGING cs_target = ls_res ).
        copy_data_to_ref( EXPORTING is_data = ls_res CHANGING cr_data = er_data ).

      WHEN 'Validate'.
        DATA(lo_val) = NEW zcl_mm_mdm_validator( iv_transid = lv_tid iv_level = req( )->get_level( iv_transid = lv_tid iv_app_id = lv_app ) iv_user = lv_user ).
        lt_msg = lo_val->validate( ).
        "Validation never stores anything: undo the entity writes of this change set. The messages are already in memory.
        ROLLBACK WORK.
        DATA(lt_ret) = to_message_table( lt_msg ).
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'SaveDraft'.
        assert_edit( lv_tid ).
        DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_tid iv_app_id = lv_app ).
        "The initiator saving a requested (01) request makes it a draft (00), as SAVE_AS_DRAFT does; sent back (04) stays 04.
        IF ls_hdr-status = zif_mm_mdm_types=>gc_status-requested.
          req( )->set_status( iv_transid = lv_tid iv_app_id = lv_app iv_status = CONV #( zif_mm_mdm_types=>gc_status-draft ) ).
        ENDIF.
        lt_ret = to_message_table( lt_msg ).
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'Submit'.
        assert_edit( lv_tid ).
        lt_msg = NEW zcl_mm_mdm_validator( iv_transid = lv_tid iv_user = lv_user )->validate( ).
        IF line_exists( lt_msg[ severity = 'E' ] ).
          zcx_mm_mdm=>raise_msgs( lt_msg ).               "all messages together, nothing started
        ENDIF.
        DATA(lo_wf) = NEW zcl_mm_mdm_workflow( req( ) ).
        lo_wf->submit( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).
        "Mails: port SEND_APPR_MAIL / APPR_MAIL; data is in lo_wf->ms_mail.
        lt_ret = to_message_table( lt_msg ).
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'Approve'.
        assert_edit( lv_tid ).
        lt_msg = NEW zcl_mm_mdm_validator( iv_transid = lv_tid iv_level = req( )->get_level( iv_transid = lv_tid iv_app_id = lv_app ) iv_user = lv_user )->validate( ).
        IF line_exists( lt_msg[ severity = 'E' ] ).
          zcx_mm_mdm=>raise_msgs( lt_msg ).
        ENDIF.
        lo_wf = NEW zcl_mm_mdm_workflow( req( ) ).
        lo_wf->approve( iv_transid = lv_tid iv_app_id = lv_app iv_comment = lv_cmt iv_user = lv_user ).
        lt_ret = to_message_table( lt_msg ).
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'SendBack' OR 'Reject' OR 'Forward'.
        lo_wf = NEW zcl_mm_mdm_workflow( req( ) ).
        CASE iv_action_name.
          WHEN 'SendBack'. lo_wf->send_back( iv_transid = lv_tid iv_app_id = lv_app iv_comment = lv_cmt iv_user = lv_user ).
          WHEN 'Reject'.   lo_wf->reject( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).
          WHEN 'Forward'.  lo_wf->forward( iv_transid = lv_tid iv_app_id = lv_app iv_agent = CONV #( to_upper( param( it_parameter = it_parameter iv_name = 'Agent' ) ) ) iv_user = lv_user ).
        ENDCASE.
        CLEAR lt_ret.
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'DeleteDraft'.
        req( )->delete_draft( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).

      WHEN 'CheckDuplicate'.
        DATA(lt_dup) = zcl_mm_mdm_functions=>check_duplicate( iv_description = param( it_parameter = it_parameter iv_name = 'Description' )
                                                            iv_mtart = CONV #( param( it_parameter = it_parameter iv_name = 'MaterialType' ) ) ).
        DATA lt_dr TYPE tt_dup.
        LOOP AT lt_dup INTO DATA(ls_d).
          APPEND INITIAL LINE TO lt_dr ASSIGNING FIELD-SYMBOL(<d>).
          zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_d CHANGING cs_target = <d> ).
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_dr CHANGING cr_data = er_data ).

      WHEN 'BuildDescription'.
        DATA(ls_dsc) = zcl_mm_mdm_functions=>build_description( VALUE #(
          main_group = param( it_parameter = it_parameter iv_name = 'MainGroup' ) sub_group = param( it_parameter = it_parameter iv_name = 'SubGroup' )
          sub_sub_group = param( it_parameter = it_parameter iv_name = 'SubSubGroup' ) description = param( it_parameter = it_parameter iv_name = 'Description' )
          manufacturer_part = param( it_parameter = it_parameter iv_name = 'ManufacturerPart' ) ) ).
        DATA ls_dres TYPE zcl_zmm_mdm_srv_mpc=>ts_descriptionresult.
        zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_dsc CHANGING cs_target = ls_dres ).
        copy_data_to_ref( EXPORTING is_data = ls_dres CHANGING cr_data = er_data ).

      WHEN 'GetRelatedHsn'.
        DATA(lt_hsn) = zcl_mm_mdm_functions=>related_hsn( param( it_parameter = it_parameter iv_name = 'Text' ) ).
        DATA lt_hr TYPE tt_hsn.
        LOOP AT lt_hsn INTO DATA(ls_hs).
          APPEND INITIAL LINE TO lt_hr ASSIGNING FIELD-SYMBOL(<hs>).
          zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_hs CHANGING cs_target = <hs> ).
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_hr CHANGING cr_data = er_data ).

      WHEN 'GetFieldControl'.
        DATA(lt_fc) = zcl_mm_mdm_field_control=>get( iv_mtart = CONV #( param( it_parameter = it_parameter iv_name = 'MaterialType' ) )
                                                    iv_level = CONV #( param( it_parameter = it_parameter iv_name = 'Level' ) ) iv_user = lv_user ).
        DATA lt_fr TYPE tt_item.
        LOOP AT lt_fc INTO DATA(ls_f).
          APPEND INITIAL LINE TO lt_fr ASSIGNING FIELD-SYMBOL(<f>).
          zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_f CHANGING cs_target = <f> ).
        ENDLOOP.
        copy_data_to_ref( EXPORTING is_data = lt_fr CHANGING cr_data = er_data ).

      WHEN 'GetSession'.
        DATA ls_ses TYPE zcl_zmm_mdm_srv_mpc=>ts_sessioninfo.
        SELECT SINGLE dept FROM /inowits/usr_dep WHERE bname = @lv_user INTO @DATA(lv_dept).
        DATA(lv_roles) = `initiator`.
        "Reviewer and approver roles: from /INOWITS/WF_ROLE (agent of a level of application MC). Field names to check in SE11.
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'User'        iv_value = lv_user  CHANGING cs_target = ls_ses ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'DisplayName' iv_value = lv_user  CHANGING cs_target = ls_ses ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Department'  iv_value = lv_dept  CHANGING cs_target = ls_ses ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Roles'       iv_value = lv_roles CHANGING cs_target = ls_ses ).
        copy_data_to_ref( EXPORTING is_data = ls_ses CHANGING cr_data = er_data ).

      WHEN OTHERS.
        zcx_mm_mdm=>raise_text( |Unknown action { iv_action_name }| ).
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
