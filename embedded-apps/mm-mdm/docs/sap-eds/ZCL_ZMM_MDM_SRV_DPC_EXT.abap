"! Data provider extension of the Gateway service ZMM_MDM_SRV (generated base class ZCL_ZMM_MDM_SRV_DPC).
"!
"! Generic implementation: the 19 staging entity sets, the request header, history and value helps are all handled here
"! through ZCL_MM_MDM_NAMING and ZCL_MM_MDM_STAGING, so there is no method per entity set.
"! Business logic is not in this class; it calls the classes of the package:
"!   ZCL_MM_MDM_REQUEST_SVC, ZCL_MM_MDM_WORKFLOW, ZCL_MM_MDM_VALIDATOR, ZCL_MM_MDM_POSTER (via the workflow),
"!   ZCL_MM_MDM_FIELD_CONTROL, ZCL_MM_MDM_FUNCTIONS, ZCL_MM_MDM_VALUEHELP.
"!
"! Assumptions about the generated MPC class (check after the model import in SEGW):
"!   structure types TS_ENTITYTYPE (for example TS_REQUEST, TS_MATERIAL) and table types TT_ENTITYTYPE,
"!   complex type structures (no TS_ prefix) SERVICEMESSAGE, STARTRESULT, DUPLICATE, DESCRIPTIONRESULT, HSNRESULT,
"!   FIELDCONTROLITEM, SESSIONINFO. Field names are matched ignoring case and underscores, so the ABAP
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
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_stream  REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~get_stream    REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_begin REDEFINITION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~changeset_end   REDEFINITION.

  PRIVATE SECTION.
    TYPES tt_message TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>servicemessage WITH DEFAULT KEY.
    TYPES tt_item    TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>fieldcontrolitem WITH DEFAULT KEY.
    TYPES tt_dup     TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>duplicate WITH DEFAULT KEY.
    TYPES tt_hsn     TYPE STANDARD TABLE OF zcl_zmm_mdm_srv_mpc=>hsnresult WITH DEFAULT KEY.

    DATA mo_req TYPE REF TO zcl_mm_mdm_request_svc.

    METHODS req RETURNING VALUE(ro_req) TYPE REF TO zcl_mm_mdm_request_svc.

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

    METHODS transid_from
      IMPORTING it_key_tab        TYPE /iwbep/t_mgw_name_value_pair
                it_filter         TYPE /iwbep/t_mgw_select_option OPTIONAL
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid.

    METHODS raise_messages
      IMPORTING it_msg TYPE zif_mm_mdm_types=>tt_msg
      RAISING   /iwbep/cx_mgw_busi_exception.
    METHODS to_message_table
      IMPORTING it_msg        TYPE zif_mm_mdm_types=>tt_msg
      RETURNING VALUE(rt_ret) TYPE tt_message.

    METHODS fill_request
      IMPORTING is_hdr TYPE /inowits/m_trans
      CHANGING  cs_ent TYPE any.

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

    METHODS assert_edit
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
      RAISING   /iwbep/cx_mgw_busi_exception.

    METHODS run_action
      IMPORTING iv_action_name TYPE string
                it_parameter   TYPE /iwbep/t_mgw_name_value_pair
      EXPORTING er_data        TYPE REF TO data
      RAISING   zcx_mm_mdm.
ENDCLASS.



CLASS ZCL_ZMM_MDM_SRV_DPC_EXT IMPLEMENTATION.


  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_begin.
    "No deferred processing: every operation of the change set runs when it arrives, in one logical unit.
    cv_defer_mode = abap_false.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~changeset_end.
    "Nothing to do: the framework commits when the change set succeeds and rolls back when it fails.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_entity.
    IF iv_entity_set_name = 'AttachmentFileSet'.
      DATA ls_af TYPE zcl_zmm_mdm_srv_mpc_ext=>ts_attachmentfile.
      io_data_provider->read_entry_data( IMPORTING es_data = ls_af ).
      DATA(lv_af_tid) = zcl_mm_mdm_naming=>pad_transid( ls_af-transid ).
      DATA lv_af_bin TYPE xstring.
      TRY.
          DATA(ls_af_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_af_tid ).
          assert_edit( lv_af_tid ).
          CALL FUNCTION 'SCMS_BASE64_DECODE_STR'
            EXPORTING input = ls_af-content
            IMPORTING output = lv_af_bin
            EXCEPTIONS failed = 1 OTHERS = 2.
          IF sy-subrc <> 0.
            zcx_mm_mdm=>raise_text( 'The file content is not valid base64' ).
          ENDIF.
          DATA(lv_af_id) = zcl_mm_mdm_attach=>add( iv_transid = lv_af_tid iv_app_id = ls_af_hdr-app_id iv_file_name = CONV string( ls_af-filename )
                             iv_mime_type = COND string( WHEN ls_af-mimetype IS NOT INITIAL THEN CONV string( ls_af-mimetype ) ELSE `application/octet-stream` )
                             iv_content = lv_af_bin iv_user = sy-uname ).
        CATCH zcx_mm_mdm INTO DATA(lx_af).
          raise_messages( lx_af->mt_msg ).
      ENDTRY.
      ls_af-transid = lv_af_tid.  ls_af-attachid = lv_af_id.  CLEAR ls_af-content.
      copy_data_to_ref( EXPORTING is_data = ls_af CHANGING cr_data = er_entity ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'CommentSet'.
      DATA ls_cm TYPE zcl_zmm_mdm_srv_mpc_ext=>ts_comment.
      io_data_provider->read_entry_data( IMPORTING es_data = ls_cm ).
      TRY.
          zcl_mm_mdm_attach=>add_comment( iv_transid = ls_cm-transid iv_text = CONV #( ls_cm-text ) ).
        CATCH zcx_mm_mdm INTO DATA(lx_cm).
          raise_messages( lx_cm->mt_msg ).
      ENDTRY.
      ls_cm-userid = sy-uname.
      ls_cm-createdat = |{ sy-datum(4) }-{ sy-datum+4(2) }-{ sy-datum+6(2) }T{ sy-uzeit(2) }:{ sy-uzeit+2(2) }:{ sy-uzeit+4(2) }|.
      copy_data_to_ref( EXPORTING is_data = ls_cm CHANGING cr_data = er_entity ).
      RETURN.
    ENDIF.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      raise_messages( VALUE #( ( code = 'E404' severity = 'E' message = |Entity set { iv_entity_set_name } is not supported| ) ) ).
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


  METHOD /iwbep/if_mgw_appl_srv_runtime~delete_entity.
    IF iv_entity_set_name = 'AttachmentSet'.
      DATA(lv_dt) = transid_from( it_key_tab ).
      TRY.
          DATA(ls_dh) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_dt ).
          zcl_mm_mdm_attach=>delete( iv_transid = lv_dt iv_app_id = ls_dh-app_id iv_attach_id = key_value( it_key_tab = it_key_tab iv_name = 'AttachId' ) iv_user = sy-uname ).
        CATCH zcx_mm_mdm INTO DATA(lx_dl).
          raise_messages( lx_dl->mt_msg ).
      ENDTRY.
      RETURN.
    ENDIF.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      raise_messages( VALUE #( ( code = 'E404' severity = 'E' message = |Entity set { iv_entity_set_name } is not supported| ) ) ).
      RETURN.
    ENDIF.
    DATA(lv_transid) = transid_from( it_key_tab ).
    assert_edit( lv_transid ).
    zcl_mm_mdm_staging=>delete_row( iv_set = iv_entity_set_name iv_transid = lv_transid it_key = it_key_tab ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.
    TRY.
        run_action( EXPORTING iv_action_name = iv_action_name it_parameter = it_parameter IMPORTING er_data = er_data ).
      CATCH zcx_mm_mdm INTO DATA(lx).
        raise_messages( lx->mt_msg ).
    ENDTRY.
  ENDMETHOD.


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
          staging_entity( EXPORTING iv_entity_name = iv_entity_name iv_set = iv_entity_set_name
                                    iv_transid = transid_from( it_key_tab = it_key_tab ) it_key_tab = it_key_tab
                          IMPORTING er_entity = er_entity ).
        ELSE.
          raise_messages( VALUE #( ( code = 'E404' severity = 'E' message = |Entity set { iv_entity_set_name } is not supported| ) ) ).
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA lr_tab TYPE REF TO data.
    FIELD-SYMBOLS <tab> TYPE STANDARD TABLE.
    FIELD-SYMBOLS <line> TYPE any.
    DATA(lv_user) = sy-uname.

    CASE iv_entity_set_name.

      WHEN 'RequestSet'.
        TRY.
        DATA(lt_hdr) = req( )->list(
          iv_scope  = COND #( WHEN filter_value( it_filter = it_filter_select_options iv_name = 'Scope' ) IS INITIAL THEN `all`
                              ELSE filter_value( it_filter = it_filter_select_options iv_name = 'Scope' ) )
          iv_status = CONV #( filter_value( it_filter = it_filter_select_options iv_name = 'Status' ) )
          iv_mtart  = CONV #( filter_value( it_filter = it_filter_select_options iv_name = 'MaterialType' ) )
          iv_text   = filter_value( it_filter = it_filter_select_options iv_name = 'Search' )
          iv_user   = lv_user ).
        "page before the entities are built: each one needs several lookups, and the list now holds change and extension requests too
        IF is_paging-skip > 0.
          DELETE lt_hdr TO is_paging-skip.
        ENDIF.
        DATA(lv_page) = COND i( WHEN is_paging-top > 0 THEN is_paging-top ELSE 100 ).
        IF lines( lt_hdr ) > lv_page.
          DELETE lt_hdr FROM lv_page + 1.
        ENDIF.
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc=>tt_request.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT lt_hdr INTO DATA(ls_h).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          fill_request( EXPORTING is_hdr = ls_h CHANGING cs_ent = <line> ).
        ENDLOOP.
        er_entityset = lr_tab.
        CATCH cx_root INTO DATA(lx_req).
          raise_messages( VALUE #( ( code = 'E500' severity = 'E' message = |Request list failed: { cl_abap_classdescr=>describe_by_object_ref( lx_req )->get_relative_name( ) } { lx_req->get_text( ) }| ) ) ).
        ENDTRY.

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
          zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Key'  iv_value = ls_v-item_key  CHANGING cs_target = <line> ).
          zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Text' iv_value = ls_v-item_text CHANGING cs_target = <line> ).
          LOOP AT lt_pair INTO DATA(ls_p).      "filter values come back on every line (Mtart, Mgrpid ...)
            zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = ls_p-name iv_value = ls_p-value CHANGING cs_target = <line> ).
          ENDLOOP.
          IF iv_entity_set_name = 'GenericValueHelpSet'.
            zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Name' iv_value = lv_vh CHANGING cs_target = <line> ).
          ENDIF.
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN 'AttachmentSet'.
        DATA(lv_at) = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options ).
        TRY.
            DATA(ls_ah) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_at ).
          CATCH zcx_mm_mdm INTO DATA(lx_ah).
            raise_messages( lx_ah->mt_msg ).
        ENDTRY.
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc_ext=>tt_attachment.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT zcl_mm_mdm_attach=>list( iv_transid = lv_at iv_app_id = ls_ah-app_id ) ASSIGNING FIELD-SYMBOL(<at>).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          <line> = VALUE zcl_zmm_mdm_srv_mpc_ext=>ts_attachment( transid = lv_at attachid = <at>-attach_id filename = <at>-file_name
            mimetype = <at>-mime_type doctype = <at>-doc_type size = |{ <at>-size }| uploadedby = <at>-created_by
            uploadedat = |{ <at>-created_on(4) }-{ <at>-created_on+4(2) }-{ <at>-created_on+6(2) }T00:00:00| ).
        ENDLOOP.
        DATA(lv_aid) = filter_value( it_filter = it_filter_select_options iv_name = 'AttachId' ).
        IF lv_aid IS NOT INITIAL.
          DATA(lv_aid_p) = CONV string( |{ lv_aid ALPHA = IN }| ).
          LOOP AT <tab> ASSIGNING <line>.
            ASSIGN COMPONENT 'ATTACHID' OF STRUCTURE <line> TO FIELD-SYMBOL(<aid>).
            IF <aid> IS ASSIGNED AND <aid> <> lv_aid_p.
              DELETE <tab>.
            ENDIF.
          ENDLOOP.
        ENDIF.
        er_entityset = lr_tab.

      WHEN 'AttachmentFileSet'.
        DATA(lv_df) = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options ).
        DATA(lv_dfa) = filter_value( it_filter = it_filter_select_options iv_name = 'AttachId' ).
        DATA lv_df_bin TYPE xstring.
        DATA lv_df_mime TYPE string.
        DATA lv_df_name TYPE string.
        DATA lv_df_b64 TYPE string.
        TRY.
            DATA(ls_df_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_df ).
            zcl_mm_mdm_attach=>get( EXPORTING iv_transid = lv_df iv_app_id = ls_df_hdr-app_id iv_attach_id = lv_dfa
                                    IMPORTING ev_content = lv_df_bin ev_mime_type = lv_df_mime ev_file_name = lv_df_name ).
          CATCH zcx_mm_mdm INTO DATA(lx_df).
            raise_messages( lx_df->mt_msg ).
        ENDTRY.
        CALL FUNCTION 'SCMS_BASE64_ENCODE_STR'
          EXPORTING input = lv_df_bin
          IMPORTING output = lv_df_b64.
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc_ext=>tt_attachmentfile.
        ASSIGN lr_tab->* TO <tab>.
        APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
        <line> = VALUE zcl_zmm_mdm_srv_mpc_ext=>ts_attachmentfile( transid = lv_df attachid = |{ lv_dfa ALPHA = IN }| filename = lv_df_name
                   mimetype = lv_df_mime content = lv_df_b64 ).
        er_entityset = lr_tab.

      WHEN 'CommentSet'.
        DATA(lv_ct) = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options ).
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc_ext=>tt_comment.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT zcl_mm_mdm_attach=>list_comments( lv_ct ) ASSIGNING FIELD-SYMBOL(<cm>).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          <line> = VALUE zcl_zmm_mdm_srv_mpc_ext=>ts_comment( transid = lv_ct commentid = <cm>-comment_id text = <cm>-text ).
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN 'PostedMaterialSet'.
        DATA(lv_ft) = filter_value( it_filter = it_filter_select_options iv_name = 'Maktx' ).
        IF lv_ft IS INITIAL.
          lv_ft = filter_value( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        ENDIF.
        DATA(lt_found) = zcl_mm_mdm_change=>search(
          iv_text  = lv_ft
          iv_mtart = filter_value( it_filter = it_filter_select_options iv_name = 'Mtart' )
          iv_max   = COND #( WHEN is_paging-top > 0 THEN is_paging-top ELSE 50 ) ).
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc_ext=>tt_postedmaterial.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT lt_found ASSIGNING FIELD-SYMBOL(<pm>).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          <line> = CORRESPONDING zcl_zmm_mdm_srv_mpc_ext=>ts_postedmaterial( <pm> ).
          zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'Busy' iv_value = COND string( WHEN <pm>-busy = abap_true THEN 'X' ELSE '' ) CHANGING cs_target = <line> ).
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN 'ChangeScopeSet'.
        DATA(lv_sm) = filter_value( it_filter = it_filter_select_options iv_name = 'Matnr' ).
        IF lv_sm IS INITIAL.
          raise_messages( VALUE #( ( code = 'E400' severity = 'E' message = 'Filter Matnr is required' ) ) ).
        ENDIF.
        CREATE DATA lr_tab TYPE zcl_zmm_mdm_srv_mpc_ext=>tt_changescope.
        ASSIGN lr_tab->* TO <tab>.
        LOOP AT zcl_mm_mdm_change=>get_scope( lv_sm ) ASSIGNING FIELD-SYMBOL(<sc>).
          APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
          <line> = VALUE zcl_zmm_mdm_srv_mpc_ext=>ts_changescope( matnr = |{ lv_sm ALPHA = IN }| kind = <sc>-kind werks = <sc>-werks
            lgort = <sc>-lgort vkorg = <sc>-vkorg vtweg = <sc>-vtweg werkstxt = <sc>-werks_txt lgorttxt = <sc>-lgort_txt
            vkorgtxt = <sc>-vkorg_txt vtwegtxt = <sc>-vtweg_txt ).
        ENDLOOP.
        er_entityset = lr_tab.

      WHEN OTHERS.
        IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_true.
          staging_entityset( EXPORTING iv_entity_name = iv_entity_name iv_set = iv_entity_set_name
                                       iv_transid = transid_from( it_key_tab = it_key_tab it_filter = it_filter_select_options )
                             IMPORTING er_entityset = er_entityset ).
        ELSE.
          raise_messages( VALUE #( ( code = 'E404' severity = 'E' message = |Entity set { iv_entity_set_name } is not supported| ) ) ).
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~update_entity.
    IF zcl_mm_mdm_naming=>is_staging( iv_entity_set_name ) = abap_false.
      raise_messages( VALUE #( ( code = 'E404' severity = 'E' message = |Entity set { iv_entity_set_name } is not supported| ) ) ).
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


  METHOD filter_pairs.
    LOOP AT it_filter INTO DATA(ls).
      READ TABLE ls-select_options INTO DATA(ls_so) INDEX 1.
      IF sy-subrc = 0. APPEND VALUE #( name = ls-property value = ls_so-low ) TO rt_pair. ENDIF.
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


  METHOD param.
    LOOP AT it_parameter INTO DATA(ls) WHERE name IS NOT INITIAL.
      IF zcl_mm_mdm_naming=>norm( ls-name ) = zcl_mm_mdm_naming=>norm( iv_name ).
        rv_value = ls-value. RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD raise_messages.
    DATA(lo_msg) = mo_context->get_message_container( ).
    LOOP AT it_msg INTO DATA(ls).
      lo_msg->add_message_text_only(
        EXPORTING iv_msg_type       = COND #( WHEN ls-severity = 'W' THEN 'W' WHEN ls-severity = 'I' THEN 'I' ELSE 'E' )
                  iv_msg_text       = CONV #( ls-message )
                  iv_message_target = ls-target ).
    ENDLOOP.
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception EXPORTING message_container = lo_msg.
  ENDMETHOD.


  METHOD req.
    IF mo_req IS NOT BOUND. mo_req = NEW #( ). ENDIF.
    ro_req = mo_req.
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
        DATA ls_res TYPE zcl_zmm_mdm_srv_mpc=>startresult.
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'TransId' iv_value = lv_new CHANGING cs_target = ls_res ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'AppId' iv_value = zif_mm_mdm_types=>gc_app_create CHANGING cs_target = ls_res ).
        copy_data_to_ref( EXPORTING is_data = ls_res CHANGING cr_data = er_data ).

      WHEN 'StartChange'.
        DATA(lv_ch) = zcl_mm_mdm_change=>start_change(
          iv_matnr = param( it_parameter = it_parameter iv_name = 'Matnr' )
          iv_werks = param( it_parameter = it_parameter iv_name = 'Plant' )
          iv_lgort = param( it_parameter = it_parameter iv_name = 'StorageLocation' )
          iv_vkorg = param( it_parameter = it_parameter iv_name = 'SalesOrg' )
          iv_vtweg = param( it_parameter = it_parameter iv_name = 'DistributionChannel' )
          iv_user  = lv_user ).
        DATA ls_res_c TYPE zcl_zmm_mdm_srv_mpc=>startresult.
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'TransId' iv_value = lv_ch CHANGING cs_target = ls_res_c ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'AppId' iv_value = zcl_mm_mdm_change=>c_app_change CHANGING cs_target = ls_res_c ).
        copy_data_to_ref( EXPORTING is_data = ls_res_c CHANGING cr_data = er_data ).

      WHEN 'StartExtension'.
        DATA(lv_ex) = zcl_mm_mdm_change=>start_extension(
          iv_matnr = param( it_parameter = it_parameter iv_name = 'Matnr' )
          iv_type  = param( it_parameter = it_parameter iv_name = 'ExtType' )
          iv_werks = param( it_parameter = it_parameter iv_name = 'Plant' )
          iv_lgort = param( it_parameter = it_parameter iv_name = 'StorageLocation' )
          iv_vkorg = param( it_parameter = it_parameter iv_name = 'SalesOrg' )
          iv_vtweg = param( it_parameter = it_parameter iv_name = 'DistributionChannel' )
          iv_bwtar = param( it_parameter = it_parameter iv_name = 'ValuationType' )
          iv_src_werks = param( it_parameter = it_parameter iv_name = 'SourcePlant' )
          iv_src_vkorg = param( it_parameter = it_parameter iv_name = 'SourceSalesOrg' )
          iv_src_vtweg = param( it_parameter = it_parameter iv_name = 'SourceDistributionChannel' )
          iv_user  = lv_user ).
        DATA ls_res_e TYPE zcl_zmm_mdm_srv_mpc=>startresult.
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'TransId' iv_value = lv_ex CHANGING cs_target = ls_res_e ).
        zcl_mm_mdm_staging=>set_by_prop( EXPORTING iv_prop = 'AppId' iv_value = zcl_mm_mdm_change=>c_app_extend CHANGING cs_target = ls_res_e ).
        copy_data_to_ref( EXPORTING is_data = ls_res_e CHANGING cr_data = er_data ).

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
        DATA(lt_doc) = zcl_mm_mdm_attach=>check_mandatory( iv_transid = lv_tid iv_app_id = lv_app ).
        IF lt_doc IS NOT INITIAL.
          zcx_mm_mdm=>raise_msgs( lt_doc ).               "a mandatory document is missing, nothing started
        ENDIF.
        DATA(ls_hsub) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_tid iv_app_id = lv_app ).
        DATA(lo_wf) = NEW zcl_mm_mdm_workflow( req( ) ).
        lo_wf->submit( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).
        zcl_mm_mdm_mail=>notify( iv_event = COND #( WHEN ls_hsub-status = zif_mm_mdm_types=>gc_status-sent_back THEN zcl_mm_mdm_mail=>c_resubmit
                                                    ELSE zcl_mm_mdm_mail=>c_submit )
                                 iv_app_id = lv_app iv_transid = lv_tid iv_actor = 'I' iv_next = lo_wf->ms_mail-next_level
                                 iv_init_mail = lo_wf->ms_mail-initiator_mail it_mails = lo_wf->ms_mail-mail_ids iv_comment = lv_cmt ).
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
        DATA(lv_kind) = zcl_mm_mdm_mail=>actor_kind( iv_app_id = lv_app iv_transid = lv_tid iv_level = lo_wf->ms_mail-level ).
        zcl_mm_mdm_mail=>notify( iv_event = COND #( WHEN lo_wf->ms_mail-final = 'X' THEN zcl_mm_mdm_mail=>c_final
                                                    WHEN lv_kind = 'A' THEN zcl_mm_mdm_mail=>c_approve ELSE zcl_mm_mdm_mail=>c_review )
                                 iv_app_id = lv_app iv_transid = lv_tid iv_actor = lv_kind iv_next = lo_wf->ms_mail-next_level
                                 iv_init_mail = lo_wf->ms_mail-initiator_mail it_mails = lo_wf->ms_mail-mail_ids iv_comment = lv_cmt ).
        lt_ret = to_message_table( lt_msg ).
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'SendBack' OR 'Reject' OR 'Forward'.
        lo_wf = NEW zcl_mm_mdm_workflow( req( ) ).
        CASE iv_action_name.
          WHEN 'SendBack'. lo_wf->send_back( iv_transid = lv_tid iv_app_id = lv_app iv_comment = lv_cmt iv_user = lv_user ).
          WHEN 'Reject'.   lo_wf->reject( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).
          WHEN 'Forward'.  lo_wf->forward( iv_transid = lv_tid iv_app_id = lv_app iv_agent = CONV #( to_upper( param( it_parameter = it_parameter iv_name = 'Agent' ) ) ) iv_user = lv_user ).
        ENDCASE.
        IF iv_action_name = 'SendBack' OR iv_action_name = 'Reject'.
          DATA(lv_k2) = zcl_mm_mdm_mail=>actor_kind( iv_app_id = lv_app iv_transid = lv_tid iv_level = lo_wf->ms_mail-level ).
          zcl_mm_mdm_mail=>notify( iv_event = COND #( WHEN iv_action_name = 'Reject' THEN zcl_mm_mdm_mail=>c_reject ELSE zcl_mm_mdm_mail=>c_sendback )
                                   iv_app_id = lv_app iv_transid = lv_tid iv_actor = lv_k2 iv_next = lo_wf->ms_mail-next_level
                                   iv_init_mail = lo_wf->ms_mail-initiator_mail it_mails = lo_wf->ms_mail-mail_ids iv_comment = lv_cmt ).
        ENDIF.
        CLEAR lt_ret.
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'DeleteDraft'.
        req( )->delete_draft( iv_transid = lv_tid iv_app_id = lv_app iv_user = lv_user ).
        "The Gateway runtime needs a return type for every function import: an empty message collection
        CLEAR lt_ret.
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

      WHEN 'DeleteAttachment'.
        TRY.
            DATA(ls_da_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_tid ).
            assert_edit( lv_tid ).
            zcl_mm_mdm_attach=>delete( iv_transid = lv_tid iv_app_id = ls_da_hdr-app_id
                                       iv_attach_id = param( it_parameter = it_parameter iv_name = 'AttachId' ) iv_user = lv_user ).
          CATCH zcx_mm_mdm INTO DATA(lx_da).
            raise_messages( lx_da->mt_msg ).
        ENDTRY.
        CLEAR lt_ret.
        copy_data_to_ref( EXPORTING is_data = lt_ret CHANGING cr_data = er_data ).

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
        DATA ls_dres TYPE zcl_zmm_mdm_srv_mpc=>descriptionresult.
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
        DATA ls_ses TYPE zcl_zmm_mdm_srv_mpc=>sessioninfo.
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


  METHOD staging_entity.
    DATA(lr_row) = zcl_mm_mdm_staging=>read_row( iv_set = iv_set iv_transid = iv_transid it_key = it_key_tab ).
    IF lr_row IS NOT BOUND. RETURN. ENDIF.      "no row: empty response (404 for a direct read, empty for a navigation)
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TS_{ to_upper( iv_entity_name ) }|.
    CREATE DATA er_entity TYPE (lv_tn).
    ASSIGN er_entity->* TO FIELD-SYMBOL(<ent>).
    ASSIGN lr_row->* TO FIELD-SYMBOL(<row>).
    zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = <row> CHANGING cs_target = <ent> ).
  ENDMETHOD.


  METHOD staging_entityset.
    DATA lr_tab TYPE REF TO data.
    FIELD-SYMBOLS <tab> TYPE STANDARD TABLE.
    FIELD-SYMBOLS <rows> TYPE STANDARD TABLE.
    FIELD-SYMBOLS <line> TYPE any.
    DATA(lv_tn) = |ZCL_ZMM_MDM_SRV_MPC=>TT_{ to_upper( iv_entity_name ) }|.
    CREATE DATA lr_tab TYPE (lv_tn).
    ASSIGN lr_tab->* TO <tab>.
    DATA(lr_rows) = zcl_mm_mdm_staging=>read_rows( iv_set = iv_set iv_transid = iv_transid ).
    IF lr_rows IS BOUND.
      ASSIGN lr_rows->* TO <rows>.
      LOOP AT <rows> ASSIGNING FIELD-SYMBOL(<r>).
        APPEND INITIAL LINE TO <tab> ASSIGNING <line>.
        zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = <r> CHANGING cs_target = <line> ).
      ENDLOOP.
    ENDIF.
    er_entityset = lr_tab.
  ENDMETHOD.


  METHOD to_message_table.
    LOOP AT it_msg INTO DATA(ls).
      APPEND VALUE #( code = ls-code message = ls-message severity = ls-severity target = ls-target ) TO rt_ret.
    ENDLOOP.
  ENDMETHOD.


  METHOD transid_from.
    DATA(lv) = key_value( it_key_tab = it_key_tab iv_name = 'TransId' ).
    IF lv IS INITIAL. lv = filter_value( it_filter = it_filter iv_name = 'TransId' ). ENDIF.
    IF lv IS NOT INITIAL. rv_transid = zcl_mm_mdm_naming=>pad_transid( lv ). ENDIF.
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~create_stream.
    "Slug = <request number>|<file name>, set by the hub backend; the person, date and level are SAP's.
    "The proxy in front of the Gateway drops the Slug header. The hub then sends the Content-Type
    "application/x-emami-att.<base64url of "<escaped slug>|<real mime type>">, which is unpacked here so that the stored mime type stays clean.
    DATA(lv_mime) = CONV string( is_media_resource-mime_type ).
    DATA(lv_slug_raw) = CONV string( iv_slug ).
    CONSTANTS lc_pack TYPE string VALUE `application/x-emami-att.`.
    IF lv_mime CP |{ lc_pack }*|.
      DATA(lv_b64) = substring_after( val = lv_mime sub = lc_pack ).
      SPLIT lv_b64 AT ';' INTO lv_b64 DATA(lv_ignore).
      TRANSLATE lv_b64 USING '-+_/'.
      DATA(lv_pad) = strlen( lv_b64 ) MOD 4.
      IF lv_pad = 2. lv_b64 = lv_b64 && '=='. ELSEIF lv_pad = 3. lv_b64 = lv_b64 && '='. ENDIF.
      TRY.
          DATA(lv_packed) = cl_http_utility=>decode_base64( lv_b64 ).
          FIND REGEX '^(.*)\|([^|]*)$' IN lv_packed SUBMATCHES DATA(lv_packed_slug) DATA(lv_packed_mime).
          IF sy-subrc = 0.
            IF lv_slug_raw IS INITIAL. lv_slug_raw = lv_packed_slug. ENDIF.
            lv_mime = COND #( WHEN lv_packed_mime IS NOT INITIAL THEN lv_packed_mime ELSE `application/octet-stream` ).
          ENDIF.
        CATCH cx_root.
          CLEAR lv_ignore.
      ENDTRY.
    ENDIF.
    DATA(lv_slug) = cl_http_utility=>unescape_url( lv_slug_raw ).
    DATA lv_tid TYPE string.
    DATA lv_name TYPE string.
    IF lv_slug CS '|'.
      SPLIT lv_slug AT '|' INTO lv_tid lv_name.
    ELSE.
      lv_name = lv_slug.                 "file name only: the request number is in the path
    ENDIF.
    "The hub can also send AttachmentSet?tid=<request>&fname=<file>: the proxy in front of the Gateway keeps that (as an encoded path)
    "although it drops the Slug header.
    IF lv_tid IS INITIAL AND mr_request_details IS BOUND.
      LOOP AT mr_request_details->t_uri_query_parameter INTO DATA(ls_up).
        CASE to_lower( ls_up-name ).
          WHEN 'tid'.   lv_tid = ls_up-value.
          WHEN 'fname'. IF lv_name IS INITIAL. lv_name = ls_up-value. ENDIF.
        ENDCASE.
      ENDLOOP.
    ENDIF.
    "Posted to RequestSet(...)/Attachments the request number is in the path (the proxy keeps the path, not the Slug header)
    IF lv_tid IS INITIAL.
      lv_tid = key_value( it_key_tab = it_key_tab iv_name = 'TransId' ).
    ENDIF.
    IF lv_name IS INITIAL.
      lv_name = |attachment|.
    ENDIF.
    DATA(lv_transid) = zcl_mm_mdm_naming=>pad_transid( lv_tid ).
    TRY.
        DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_transid ).
        assert_edit( lv_transid ).
        DATA(lv_id) = zcl_mm_mdm_attach=>add( iv_transid = lv_transid iv_app_id = ls_hdr-app_id iv_file_name = lv_name
                                              iv_mime_type = lv_mime iv_content = is_media_resource-value iv_user = sy-uname ).
      CATCH zcx_mm_mdm INTO DATA(lx).
        raise_messages( lx->mt_msg ).
    ENDTRY.
    DATA ls_att TYPE zcl_zmm_mdm_srv_mpc_ext=>ts_attachment.
    ls_att = VALUE #( transid = lv_transid attachid = lv_id filename = lv_name mimetype = lv_mime
                      size = |{ xstrlen( is_media_resource-value ) }| uploadedby = sy-uname
                      uploadedat = |{ sy-datum(4) }-{ sy-datum+4(2) }-{ sy-datum+6(2) }T{ sy-uzeit(2) }:{ sy-uzeit+2(2) }:{ sy-uzeit+4(2) }| ).
    copy_data_to_ref( EXPORTING is_data = ls_att CHANGING cr_data = er_entity ).
  ENDMETHOD.


  METHOD /iwbep/if_mgw_appl_srv_runtime~get_stream.
    DATA ls_stream TYPE ty_s_media_resource.
    DATA(lv_transid) = transid_from( it_key_tab ).
    TRY.
        DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = lv_transid ).
        zcl_mm_mdm_attach=>get( EXPORTING iv_transid = lv_transid iv_app_id = ls_hdr-app_id
                                          iv_attach_id = key_value( it_key_tab = it_key_tab iv_name = 'AttachId' )
                                IMPORTING ev_content = ls_stream-value ev_mime_type = ls_stream-mime_type ).
      CATCH zcx_mm_mdm INTO DATA(lx).
        raise_messages( lx->mt_msg ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = ls_stream CHANGING cr_data = er_stream ).
  ENDMETHOD.
ENDCLASS.
