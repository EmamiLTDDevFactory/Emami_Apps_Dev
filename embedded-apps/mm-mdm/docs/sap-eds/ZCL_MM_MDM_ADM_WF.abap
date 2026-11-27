"! Workflow maintenance of the MDM flow engine (rebuild of Web Dynpro /INOWITS/MDM_ROLE_MAIN): approval levels per application and
"! generic key (type, group, business vertical, plant, brand) with Initiator (L0 views), Reviewer and Approver levels, agents and views.
"! Called through ZCL_MM_MDM_ADMIN (area WF). Every operation needs payload isAdmin = true (set by the hub from the Admin grant).
"! Writes: /INOWITS/WF_DEF, WF_ROLE, WF_LVL, WF_KEY, ROL_LOG, LVL_LOG - always the whole 6-field group key (gen_field3/4 included),
"! under an enqueue on the application, delete-then-modify as the Web Dynpro does, with the same change-log diff.
CLASS zcl_mm_mdm_adm_wf DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run
      IMPORTING iv_op          TYPE clike
                iv_actor       TYPE clike OPTIONAL
                iv_payload     TYPE string OPTIONAL
      RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    TYPES ty_strs TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_msg,
             severity TYPE string,
             code     TYPE string,
             message  TYPE string,
             target   TYPE string,
           END OF ty_msg.
    TYPES ty_msgs TYPE STANDARD TABLE OF ty_msg WITH EMPTY KEY.

    "key of one workflow group, as typed DDIC fields (database side)
    TYPES: BEGIN OF ty_dkey,
             app_id     TYPE /inowits/wf_app_id,
             gen_type   TYPE /inowits/wf_gen_type,
             gen_field  TYPE /inowits/wf_gen_field,
             gen_field2 TYPE /inowits/wf_gen_field2,
             gen_field3 TYPE /inowits/wf_gen_field3,
             gen_field4 TYPE /inowits/wf_gen_field4,
           END OF ty_dkey.
    TYPES ty_dkeys TYPE STANDARD TABLE OF ty_dkey WITH DEFAULT KEY.

    "key of one workflow group, JSON side
    TYPES: BEGIN OF ty_gkey,
             app_id     TYPE string,
             gen_type   TYPE string,
             gen_field  TYPE string,
             gen_field2 TYPE string,
             gen_field3 TYPE string,
             gen_field4 TYPE string,
           END OF ty_gkey.

    TYPES: BEGIN OF ty_agent,
             role       TYPE string,
             start_date TYPE string,
             end_date   TYPE string,
             agent      TYPE string,
             name       TYPE string,
             is_appr    TYPE abap_bool,
             level_text TYPE string,
             mail_id    TYPE string,
             active     TYPE abap_bool,
             user_f     TYPE string,
             dept       TYPE string,
             "reviewer levels are maintained by e-mail id: resolved to the SAP user on save, shown from the SAP user on load
             email      TYPE string,
             "output only
             counted    TYPE abap_bool,
             expired    TYPE abap_bool,
             receives   TYPE string,
             locked     TYPE abap_bool,
           END OF ty_agent.
    TYPES ty_agents TYPE STANDARD TABLE OF ty_agent WITH EMPTY KEY.

    TYPES: BEGIN OF ty_view,
             agent       TYPE string,
             view_name   TYPE string,
             active      TYPE abap_bool,
             read_only   TYPE abap_bool,
             description TYPE string,
           END OF ty_view.
    TYPES ty_views TYPE STANDARD TABLE OF ty_view WITH EMPTY KEY.

    TYPES: BEGIN OF ty_level,
             type_lvl   TYPE string,
             lvl        TYPE string,
             level_text TYPE string,
             max_role   TYPE i,
             min_appr   TYPE i,
             type       TYPE string,
             active     TYPE abap_bool,
             pir_type   TYPE string,
             agents     TYPE ty_agents,
             views      TYPE ty_views,
             "output only
             role_label TYPE string,
             counted    TYPE i,
           END OF ty_level.
    TYPES ty_levels TYPE STANDARD TABLE OF ty_level WITH EMPTY KEY.

    TYPES: BEGIN OF ty_group.
             INCLUDE TYPE ty_gkey.
    TYPES:   levels   TYPE ty_levels,
             l0_views TYPE ty_views,
           END OF ty_group.

    TYPES: BEGIN OF ty_keyrow,
             key_name TYPE string,
             value    TYPE string,
             active   TYPE abap_bool,
           END OF ty_keyrow.
    TYPES ty_keyrows TYPE STANDARD TABLE OF ty_keyrow WITH EMPTY KEY.

    TYPES: BEGIN OF ty_req,
             actor           TYPE string,
             is_admin        TYPE abap_bool,
             app_id          TYPE string,
             gen_type        TYPE string,
             gen_field       TYPE string,
             gen_field2      TYPE string,
             gen_field3      TYPE string,
             gen_field4      TYPE string,
             group           TYPE ty_group,
             mode            TYPE string,
             version         TYPE string,
             source          TYPE ty_gkey,
             target          TYPE ty_gkey,
             overwrite       TYPE abap_bool,
             force           TYPE abap_bool,
             old_type        TYPE string,
             new_type        TYPE string,
             old_agent       TYPE string,
             new_agent       TYPE string,
             dry_run         TYPE abap_bool,
             include_inactive TYPE abap_bool,
             user            TYPE string,
             kind            TYPE string,
             query           TYPE string,
             limit           TYPE i,
             keys            TYPE ty_keyrows,
             agent           TYPE string,
             lvl             TYPE string,
             date_from       TYPE string,
             date_to         TYPE string,
           END OF ty_req.

    TYPES: BEGIN OF ty_raw,
             def  TYPE STANDARD TABLE OF /inowits/wf_def WITH DEFAULT KEY,
             role TYPE STANDARD TABLE OF /inowits/wf_role WITH DEFAULT KEY,
             lvl  TYPE STANDARD TABLE OF /inowits/wf_lvl WITH DEFAULT KEY,
           END OF ty_raw.

    TYPES: BEGIN OF ty_user,
             bname    TYPE string,
             name     TYPE string,
             email    TYPE string,
             exists   TYPE abap_bool,
             locked   TYPE abap_bool,
             valid_to TYPE string,
           END OF ty_user.
    TYPES ty_users TYPE STANDARD TABLE OF ty_user WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_cfg,
             app_id         TYPE string,
             text           TYPE string,
             family         TYPE string,
             gt_label       TYPE string,
             gf1_label      TYPE string,
             gf2_label      TYPE string,
             gf3_label      TYPE string,
             gf4_label      TYPE string,
             gf1_visible    TYPE abap_bool,
             gf2_visible    TYPE abap_bool,
             gf3_visible    TYPE abap_bool,
             gf4_visible    TYPE abap_bool,
             gt_vh          TYPE string,
             gf1_vh         TYPE string,
             gf2_vh         TYPE string,
             gf3_vh         TYPE string,
             gf4_vh         TYPE string,
             dept_visible   TYPE abap_bool,
             views_enabled  TYPE abap_bool,
             l0_required    TYPE abap_bool,
             pir_visible    TYPE abap_bool,
             wf_id          TYPE string,
             group_count    TYPE i,
           END OF ty_cfg.
    TYPES ty_cfgs TYPE STANDARD TABLE OF ty_cfg WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_sumrow.
             INCLUDE TYPE ty_gkey.
    TYPES:   level_count     TYPE i,
             reviewer_levels TYPE i,
             approver_levels TYPE i,
             counted_agents  TYPE i,
             issues          TYPE ty_strs,
           END OF ty_sumrow.
    TYPES ty_sumrows TYPE STANDARD TABLE OF ty_sumrow WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_item,
             key   TYPE string,
             text  TYPE string,
             extra TYPE string,
           END OF ty_item.
    TYPES ty_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
    TYPES ty_def_t TYPE STANDARD TABLE OF /inowits/wf_def WITH DEFAULT KEY.
    TYPES ty_role_t TYPE STANDARD TABLE OF /inowits/wf_role WITH DEFAULT KEY.
    TYPES ty_rol_t TYPE STANDARD TABLE OF /inowits/rol_log WITH DEFAULT KEY.
    TYPES ty_lvl_t TYPE STANDARD TABLE OF /inowits/lvl_log WITH DEFAULT KEY.

    CLASS-DATA gs_req    TYPE ty_req.
    CLASS-DATA gv_actor  TYPE string.
    CLASS-DATA gv_user   TYPE syuname.
    CLASS-DATA gv_today  TYPE string.
    CLASS-DATA gv_locks  TYPE ty_strs.
    CLASS-DATA gt_app_dom TYPE ty_items.

    CONSTANTS c_lock_tab TYPE tabname VALUE '/INOWITS/WF_DEF'.
    "applications without view tables / initiator views (Web Dynpro: en_view_table = false and the validate_selected exclusion list)
    CONSTANTS c_no_views TYPE string VALUE ` VB VU CB CU BC BX MBX SAM BP MAC SMC PO AMX MVC MMC MCC MCX MBC MRC MQC PM PXX VMX EMC CTM CRT `.
    CONSTANTS c_no_l0    TYPE string VALUE ` VB VU CB CU BC BX MBX SAM BP MVC MMC MCC MBC MQC PM PXX PVC PVX QMX VMX MCX AMX MRC PR PRM MMX RXX CRT MAC SMC PO CTM `.

    "---- json and messages
    CLASS-METHODS ser IMPORTING ig_data TYPE any RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS ok  IMPORTING ig_data TYPE any RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS fail IMPORTING iv_text TYPE clike iv_code TYPE string DEFAULT 'ERROR' RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS fail_msgs IMPORTING it_msgs TYPE ty_msgs RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS add_msg
      IMPORTING iv_sev TYPE string iv_code TYPE string iv_text TYPE clike iv_target TYPE clike OPTIONAL
      CHANGING  ct_msgs TYPE ty_msgs.
    CLASS-METHODS has_error IMPORTING it_msgs TYPE ty_msgs RETURNING VALUE(rv_err) TYPE abap_bool.

    "---- helpers
    CLASS-METHODS d2s IMPORTING iv_date TYPE d RETURNING VALUE(rv_str) TYPE string.
    CLASS-METHODS s2d IMPORTING iv_str TYPE string RETURNING VALUE(rv_date) TYPE d.
    CLASS-METHODS is_date IMPORTING iv_str TYPE string RETURNING VALUE(rv_ok) TYPE abap_bool.
    CLASS-METHODS lvl_num IMPORTING iv_lvl TYPE clike RETURNING VALUE(rv_num) TYPE i.
    CLASS-METHODS type_lvl_rank IMPORTING iv_type TYPE clike RETURNING VALUE(rv_rank) TYPE i.
    CLASS-METHODS role_label IMPORTING iv_type TYPE clike RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS sap_user IMPORTING iv_actor TYPE string RETURNING VALUE(rv_user) TYPE syuname.
    CLASS-METHODS user_by_mail IMPORTING iv_mail TYPE string RETURNING VALUE(rv_user) TYPE syuname.
    CLASS-METHODS gkey_to_dkey IMPORTING is_key TYPE ty_gkey RETURNING VALUE(rs_key) TYPE ty_dkey.
    CLASS-METHODS dkey_to_gkey IMPORTING is_key TYPE ty_dkey RETURNING VALUE(rs_key) TYPE ty_gkey.
    CLASS-METHODS req_key RETURNING VALUE(rs_key) TYPE ty_gkey.
    CLASS-METHODS norm_key CHANGING cs_key TYPE ty_gkey.
    CLASS-METHODS key_text IMPORTING is_key TYPE ty_gkey RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS pat_range
      IMPORTING iv_val TYPE string
      CHANGING  ct_range TYPE STANDARD TABLE.
    CLASS-METHODS domain_values
      IMPORTING iv_domain TYPE domname
      RETURNING VALUE(rt_items) TYPE ty_items.

    CLASS-METHODS precheck RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS too_long IMPORTING iv_val TYPE string iv_max TYPE i iv_label TYPE string CHANGING cv_text TYPE string.

    "---- locking
    CLASS-METHODS lock_app IMPORTING iv_app TYPE string RETURNING VALUE(rv_ok) TYPE abap_bool.
    CLASS-METHODS unlock_all.
    CLASS-METHODS new_transid IMPORTING iv_app TYPE string RETURNING VALUE(rv_transid) TYPE /inowits/transid.

    "---- application metadata
    CLASS-METHODS app_cfg IMPORTING iv_app TYPE string RETURNING VALUE(rs_cfg) TYPE ty_cfg.
    CLASS-METHODS app_list RETURNING VALUE(rt_cfg) TYPE ty_cfgs.
    CLASS-METHODS wf_id IMPORTING iv_app TYPE string RETURNING VALUE(rv_wf_id) TYPE string.

    "---- users
    CLASS-METHODS load_users IMPORTING it_names TYPE ty_strs RETURNING VALUE(rt_users) TYPE ty_users.
    CLASS-METHODS users_of_group IMPORTING is_group TYPE ty_group RETURNING VALUE(rt_names) TYPE ty_strs.

    "---- group model
    CLASS-METHODS read_raw IMPORTING is_key TYPE ty_dkey RETURNING VALUE(rs_raw) TYPE ty_raw.
    CLASS-METHODS raw_to_group IMPORTING is_key TYPE ty_dkey is_raw TYPE ty_raw RETURNING VALUE(rs_group) TYPE ty_group.
    CLASS-METHODS enrich_group CHANGING cs_group TYPE ty_group.
    CLASS-METHODS group_to_raw
      IMPORTING is_group TYPE ty_group is_old TYPE ty_raw
      RETURNING VALUE(rs_raw) TYPE ty_raw.
    CLASS-METHODS normalize CHANGING cs_group TYPE ty_group.
    CLASS-METHODS recalc CHANGING cs_level TYPE ty_level.
    CLASS-METHODS version_of IMPORTING is_raw TYPE ty_raw RETURNING VALUE(rv_ver) TYPE string.
    CLASS-METHODS group_exists IMPORTING is_key TYPE ty_dkey RETURNING VALUE(rv_exists) TYPE abap_bool.
    CLASS-METHODS open_requests IMPORTING is_key TYPE ty_dkey RETURNING VALUE(rv_count) TYPE i.
    CLASS-METHODS validate
      IMPORTING iv_mode TYPE string
      CHANGING  cs_group TYPE ty_group
                ct_msgs  TYPE ty_msgs.
    CLASS-METHODS group_issues IMPORTING is_group TYPE ty_group RETURNING VALUE(rt_msgs) TYPE ty_msgs.

    "---- change log
    CLASS-METHODS build_logs
      IMPORTING is_old TYPE ty_raw is_new TYPE ty_raw is_key TYPE ty_dkey iv_transid TYPE /inowits/transid iv_note TYPE string OPTIONAL
      EXPORTING et_rol TYPE ty_rol_t et_lvl TYPE ty_lvl_t.
    CLASS-METHODS persist
      IMPORTING is_key TYPE ty_dkey is_raw TYPE ty_raw
                it_rol TYPE ty_rol_t it_lvl TYPE ty_lvl_t
                iv_delete_only TYPE abap_bool OPTIONAL iv_no_commit TYPE abap_bool OPTIONAL
      RETURNING VALUE(rv_err) TYPE string.

    CLASS-METHODS chk_len
      IMPORTING iv_val TYPE string iv_max TYPE i iv_label TYPE string iv_target TYPE string
      CHANGING  ct_msgs TYPE ty_msgs.
    CLASS-METHODS chk_views
      IMPORTING it_views TYPE ty_views it_valid TYPE ty_strs iv_prefix TYPE string iv_target TYPE string
                iv_require TYPE abap_bool iv_by_agent TYPE abap_bool it_agents TYPE ty_agents OPTIONAL
      CHANGING  ct_msgs TYPE ty_msgs.
    CLASS-METHODS log_level
      IMPORTING is_old TYPE /inowits/wf_def is_new TYPE /inowits/wf_def iv_reason TYPE string iv_ctx TYPE string
                is_key TYPE ty_dkey iv_transid TYPE /inowits/transid
      CHANGING  ct_rol TYPE ty_rol_t.
    CLASS-METHODS log_agent
      IMPORTING is_old TYPE /inowits/wf_role is_new TYPE /inowits/wf_role iv_reason TYPE string iv_ctx TYPE string
                is_key TYPE ty_dkey iv_transid TYPE /inowits/transid
      CHANGING  ct_rol TYPE ty_rol_t.
    CLASS-METHODS log_view
      IMPORTING is_old TYPE /inowits/wf_lvl is_new TYPE /inowits/wf_lvl iv_reason TYPE string iv_ctx TYPE string
                is_key TYPE ty_dkey iv_transid TYPE /inowits/transid
      CHANGING  ct_lvl TYPE ty_lvl_t.
    CLASS-METHODS routing_chain
      IMPORTING is_key TYPE ty_dkey
      EXPORTING et_def TYPE ty_def_t et_role TYPE ty_role_t.

    "---- operations
    CLASS-METHODS op_meta RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_search RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_get_group RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_validate RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_save RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_delete RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_copy RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_copy_type RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_mass_agent RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_where_used RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_get_keys RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_save_keys RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_change_log RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_simulate RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_value_help RETURNING VALUE(rv_json) TYPE string.
ENDCLASS.



CLASS zcl_mm_mdm_adm_wf IMPLEMENTATION.

  METHOD run.
    CLEAR: gs_req, gv_actor, gv_locks.
    gv_today = d2s( sy-datum ).
    TRY.
        IF iv_payload IS NOT INITIAL.
          TRY.
              /ui2/cl_json=>deserialize( EXPORTING json = iv_payload pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = gs_req ).
            CATCH cx_root.
              rv_json = fail( iv_text = 'The request payload is not valid JSON' iv_code = 'PAYLOAD' ).
              RETURN.
          ENDTRY.
        ENDIF.
        gv_actor = COND #( WHEN iv_actor IS NOT INITIAL THEN CONV string( iv_actor ) ELSE gs_req-actor ).
        IF gs_req-is_admin <> abap_true.
          rv_json = fail( iv_text = 'This needs the Admin role of Material master in Admin Center.' iv_code = 'NOT_ADMIN' ).
          RETURN.
        ENDIF.
        IF gv_actor IS INITIAL.
          rv_json = fail( iv_text = 'The acting user is missing' iv_code = 'NO_ACTOR' ).
          RETURN.
        ENDIF.
        gv_user = sap_user( gv_actor ).
        DATA(lv_pre) = precheck( ).
        IF lv_pre IS NOT INITIAL.
          rv_json = fail( iv_text = lv_pre iv_code = 'TOO_LONG' ).
          RETURN.
        ENDIF.
        CASE to_lower( CONV string( iv_op ) ).
          WHEN 'meta'.           rv_json = op_meta( ).
          WHEN 'search'.         rv_json = op_search( ).
          WHEN 'getgroup'.       rv_json = op_get_group( ).
          WHEN 'validategroup'.  rv_json = op_validate( ).
          WHEN 'savegroup'.      rv_json = op_save( ).
          WHEN 'deletegroup'.    rv_json = op_delete( ).
          WHEN 'copygroup'.      rv_json = op_copy( ).
          WHEN 'copygentype'.    rv_json = op_copy_type( ).
          WHEN 'massagentchange'. rv_json = op_mass_agent( ).
          WHEN 'whereused'.      rv_json = op_where_used( ).
          WHEN 'getkeys'.        rv_json = op_get_keys( ).
          WHEN 'savekeys'.       rv_json = op_save_keys( ).
          WHEN 'changelog'.      rv_json = op_change_log( ).
          WHEN 'simulate'.       rv_json = op_simulate( ).
          WHEN 'valuehelp'.      rv_json = op_value_help( ).
          WHEN OTHERS.           rv_json = fail( iv_text = |Operation { iv_op } is not known| iv_code = 'UNKNOWN_OP' ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx).
        ROLLBACK WORK.
        rv_json = fail( iv_text = lx->get_text( ) iv_code = 'EXCEPTION' ).
    ENDTRY.
    unlock_all( ).
  ENDMETHOD.

  METHOD ser.
    rv_json = /ui2/cl_json=>serialize( data = ig_data pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
  ENDMETHOD.

  METHOD ok.
    rv_json = |\{"ok":true,"data":{ ser( ig_data ) }\}|.
  ENDMETHOD.

  METHOD fail.
    DATA lt_m TYPE ty_msgs.
    add_msg( EXPORTING iv_sev = 'E' iv_code = iv_code iv_text = iv_text CHANGING ct_msgs = lt_m ).
    rv_json = fail_msgs( lt_m ).
  ENDMETHOD.

  METHOD fail_msgs.
    rv_json = |\{"ok":false,"messages":{ ser( it_msgs ) }\}|.
  ENDMETHOD.

  METHOD add_msg.
    APPEND VALUE #( severity = iv_sev code = iv_code message = CONV string( iv_text ) target = CONV string( iv_target ) ) TO ct_msgs.
  ENDMETHOD.

  METHOD has_error.
    LOOP AT it_msgs TRANSPORTING NO FIELDS WHERE severity = 'E'.
      rv_err = abap_true.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD d2s.
    IF iv_date IS INITIAL.
      RETURN.
    ENDIF.
    rv_str = |{ iv_date(4) }-{ iv_date+4(2) }-{ iv_date+6(2) }|.
  ENDMETHOD.

  METHOD s2d.
    DATA(lv) = iv_str.
    REPLACE ALL OCCURRENCES OF '-' IN lv WITH ''.
    IF strlen( lv ) = 8 AND lv CO '0123456789'.
      rv_date = lv.
    ENDIF.
  ENDMETHOD.

  METHOD is_date.
    DATA(lv_d) = s2d( iv_str ).
    IF lv_d IS INITIAL.
      RETURN.
    ENDIF.
    CALL FUNCTION 'DATE_CHECK_PLAUSIBILITY'
      EXPORTING  date                      = lv_d
      EXCEPTIONS plausibility_check_failed = 1
                 OTHERS                    = 2.
    rv_ok = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

  METHOD lvl_num.
    DATA(lv) = to_upper( CONV string( iv_lvl ) ).
    rv_num = 999999.
    IF strlen( lv ) >= 2 AND lv(1) = 'L'.
      DATA(lv_n) = substring( val = lv off = 1 ).
      IF lv_n CO '0123456789' AND strlen( lv_n ) <= 6.
        rv_num = lv_n.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD type_lvl_rank.
    rv_rank = SWITCH #( iv_type WHEN 'I' THEN 1 WHEN 'R' THEN 2 WHEN 'A' THEN 3 ELSE 9 ).
  ENDMETHOD.

  METHOD role_label.
    rv_text = SWITCH #( iv_type WHEN 'I' THEN 'Initiator' WHEN 'R' THEN 'Reviewer' WHEN 'A' THEN 'Approver' ELSE 'Not defined' ).
  ENDMETHOD.

  METHOD user_by_mail.
    "SAP user of an e-mail address (case-insensitive): an unlocked, valid user is preferred when several users share the address
    DATA lv_up TYPE string.
    DATA lv_srch TYPE adr6-smtp_srch.
    lv_up = to_upper( condense( iv_mail ) ).
    IF lv_up IS INITIAL.
      RETURN.
    ENDIF.
    lv_srch = lv_up.     "SMTP_SRCH holds the first 20 letters in upper case: narrows the read, the exact compare follows
    SELECT u~bname AS bname, a~smtp_addr AS smtp_addr, l~uflag AS uflag, l~gltgb AS gltgb
      FROM usr21 AS u INNER JOIN adr6 AS a ON a~addrnumber = u~addrnumber AND a~persnumber = u~persnumber
      LEFT OUTER JOIN usr02 AS l ON l~bname = u~bname
      WHERE a~smtp_srch = @lv_srch
      INTO TABLE @DATA(lt_u).
    LOOP AT lt_u ASSIGNING FIELD-SYMBOL(<x>).
      IF to_upper( condense( CONV string( <x>-smtp_addr ) ) ) <> lv_up.
        DELETE lt_u.
      ENDIF.
    ENDLOOP.
    SORT lt_u BY bname.
    DELETE ADJACENT DUPLICATES FROM lt_u COMPARING bname.
    LOOP AT lt_u ASSIGNING FIELD-SYMBOL(<u>) WHERE uflag = 0 AND ( gltgb IS INITIAL OR gltgb >= sy-datum ).
      rv_user = <u>-bname.
      RETURN.
    ENDLOOP.
    READ TABLE lt_u INDEX 1 ASSIGNING <u>.
    IF sy-subrc = 0.
      rv_user = <u>-bname.
    ENDIF.
  ENDMETHOD.

  METHOD sap_user.
    "CHANGED_BY is CHAR12: use the SAP user behind the verified e-mail, else the first 12 letters of the e-mail name
    DATA lv_mail TYPE ad_smtpadr.
    lv_mail = iv_actor.
    IF iv_actor CS '@'.
      SELECT SINGLE u~bname FROM usr21 AS u INNER JOIN adr6 AS a ON a~addrnumber = u~addrnumber AND a~persnumber = u~persnumber
        WHERE a~smtp_addr = @lv_mail INTO @rv_user.
      IF sy-subrc <> 0.
        SPLIT iv_actor AT '@' INTO DATA(lv_name) DATA(lv_dom).
        rv_user = to_upper( lv_name ).
      ENDIF.
    ELSE.
      rv_user = to_upper( iv_actor ).
    ENDIF.
  ENDMETHOD.

  METHOD gkey_to_dkey.
    rs_key-app_id     = is_key-app_id.
    rs_key-gen_type   = is_key-gen_type.
    rs_key-gen_field  = is_key-gen_field.
    rs_key-gen_field2 = is_key-gen_field2.
    rs_key-gen_field3 = is_key-gen_field3.
    rs_key-gen_field4 = is_key-gen_field4.
  ENDMETHOD.

  METHOD dkey_to_gkey.
    rs_key-app_id     = is_key-app_id.
    rs_key-gen_type   = is_key-gen_type.
    rs_key-gen_field  = is_key-gen_field.
    rs_key-gen_field2 = is_key-gen_field2.
    rs_key-gen_field3 = is_key-gen_field3.
    rs_key-gen_field4 = is_key-gen_field4.
  ENDMETHOD.

  METHOD req_key.
    rs_key-app_id     = gs_req-app_id.
    rs_key-gen_type   = gs_req-gen_type.
    rs_key-gen_field  = gs_req-gen_field.
    rs_key-gen_field2 = gs_req-gen_field2.
    rs_key-gen_field3 = gs_req-gen_field3.
    rs_key-gen_field4 = gs_req-gen_field4.
    norm_key( CHANGING cs_key = rs_key ).
  ENDMETHOD.

  METHOD norm_key.
    cs_key-app_id     = condense( to_upper( cs_key-app_id ) ).
    cs_key-gen_type   = condense( to_upper( cs_key-gen_type ) ).
    cs_key-gen_field  = condense( to_upper( cs_key-gen_field ) ).
    cs_key-gen_field2 = condense( to_upper( cs_key-gen_field2 ) ).
    cs_key-gen_field3 = condense( to_upper( cs_key-gen_field3 ) ).
    cs_key-gen_field4 = condense( to_upper( cs_key-gen_field4 ) ).
  ENDMETHOD.

  METHOD key_text.
    rv_text = is_key-app_id.
    LOOP AT VALUE ty_strs( ( is_key-gen_type ) ( is_key-gen_field ) ( is_key-gen_field2 ) ( is_key-gen_field3 ) ( is_key-gen_field4 ) ) INTO DATA(lv_p).
      IF lv_p IS NOT INITIAL.
        rv_text = |{ rv_text } / { lv_p }|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD pat_range.
    "blank = no restriction; a value with * or + is a pattern (CP), anything else an exact match
    IF iv_val IS INITIAL.
      RETURN.
    ENDIF.
    DATA lr TYPE REF TO data.
    APPEND INITIAL LINE TO ct_range REFERENCE INTO lr.
    ASSIGN lr->* TO FIELD-SYMBOL(<r>).
    ASSIGN COMPONENT 'SIGN' OF STRUCTURE <r> TO FIELD-SYMBOL(<s>).
    ASSIGN COMPONENT 'OPTION' OF STRUCTURE <r> TO FIELD-SYMBOL(<o>).
    ASSIGN COMPONENT 'LOW' OF STRUCTURE <r> TO FIELD-SYMBOL(<l>).
    <s> = 'I'.
    <o> = COND #( WHEN iv_val CA '*+' THEN 'CP' ELSE 'EQ' ).
    <l> = to_upper( iv_val ).
  ENDMETHOD.

  METHOD domain_values.
    SELECT l~valpos AS pos, l~domvalue_l AS val, t~ddtext AS txt
      FROM dd07l AS l LEFT OUTER JOIN dd07t AS t
        ON t~domname = l~domname AND t~as4local = l~as4local AND t~valpos = l~valpos AND t~as4vers = l~as4vers AND t~ddlanguage = @sy-langu
      WHERE l~domname = @iv_domain AND l~as4local = 'A'
      ORDER BY l~valpos
      INTO TABLE @DATA(lt).
    LOOP AT lt ASSIGNING FIELD-SYMBOL(<x>) WHERE val IS NOT INITIAL.
      APPEND VALUE #( key = condense( CONV string( <x>-val ) ) text = condense( CONV string( <x>-txt ) ) ) TO rt_items.
    ENDLOOP.
  ENDMETHOD.

  METHOD too_long.
    IF cv_text IS INITIAL AND strlen( iv_val ) > iv_max.
      cv_text = |{ iv_label } is too long (maximum { iv_max } characters)|.
    ENDIF.
  ENDMETHOD.

  METHOD precheck.
    "values that end up in SQL conditions or keys must fit their database fields (no silent truncation onto another record)
    too_long( EXPORTING iv_val = gs_req-app_id     iv_max = 6  iv_label = 'Application id' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-gen_type   iv_max = 15 iv_label = 'Generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-gen_field  iv_max = 10 iv_label = 'Generic field 1' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-gen_field2 iv_max = 20 iv_label = 'Generic field 2' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-gen_field3 iv_max = 20 iv_label = 'Generic field 3' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-gen_field4 iv_max = 20 iv_label = 'Generic field 4' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-app_id     iv_max = 6  iv_label = 'Application id' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-gen_type   iv_max = 15 iv_label = 'Generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-gen_field  iv_max = 10 iv_label = 'Generic field 1' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-gen_field2 iv_max = 20 iv_label = 'Generic field 2' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-gen_field3 iv_max = 20 iv_label = 'Generic field 3' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-group-gen_field4 iv_max = 20 iv_label = 'Generic field 4' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-app_id     iv_max = 6  iv_label = 'Source application id' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-gen_type   iv_max = 15 iv_label = 'Source generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-gen_field  iv_max = 10 iv_label = 'Source generic field 1' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-gen_field2 iv_max = 20 iv_label = 'Source generic field 2' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-gen_field3 iv_max = 20 iv_label = 'Source generic field 3' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-source-gen_field4 iv_max = 20 iv_label = 'Source generic field 4' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-app_id     iv_max = 6  iv_label = 'Target application id' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-gen_type   iv_max = 15 iv_label = 'Target generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-gen_field  iv_max = 10 iv_label = 'Target generic field 1' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-gen_field2 iv_max = 20 iv_label = 'Target generic field 2' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-gen_field3 iv_max = 20 iv_label = 'Target generic field 3' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-target-gen_field4 iv_max = 20 iv_label = 'Target generic field 4' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-old_type   iv_max = 15 iv_label = 'Existing generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-new_type   iv_max = 15 iv_label = 'New generic type' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-old_agent  iv_max = 12 iv_label = 'Old agent' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-new_agent  iv_max = 12 iv_label = 'New agent' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-agent      iv_max = 12 iv_label = 'Agent' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-lvl        iv_max = 20 iv_label = 'Level' CHANGING cv_text = rv_text ).
    too_long( EXPORTING iv_val = gs_req-kind       iv_max = 20 iv_label = 'Value help kind' CHANGING cv_text = rv_text ).
    IF gs_req-user NS '@'.
      too_long( EXPORTING iv_val = gs_req-user iv_max = 12 iv_label = 'User' CHANGING cv_text = rv_text ).
    ENDIF.
  ENDMETHOD.

  METHOD chk_len.
    IF strlen( iv_val ) > iv_max.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'TOO_LONG' iv_text = |{ iv_label } is too long (maximum { iv_max } characters)| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
    ENDIF.
  ENDMETHOD.

  METHOD lock_app.
    DATA lv_vk TYPE rstable-varkey.
    lv_vk = |WFADM{ to_upper( iv_app ) }|.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = c_lock_tab
        varkey         = lv_vk
        _scope         = '1'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    rv_ok = xsdbool( sy-subrc = 0 ).
    IF rv_ok = abap_true.
      APPEND |{ c_lock_tab }\|WFADM{ to_upper( iv_app ) }| TO gv_locks.
    ENDIF.
  ENDMETHOD.

  METHOD unlock_all.
    LOOP AT gv_locks INTO DATA(lv_l).
      SPLIT lv_l AT '|' INTO DATA(lv_tab) DATA(lv_key).
      DATA lv_t TYPE tabname.
      DATA lv_k TYPE rstable-varkey.
      lv_t = lv_tab.
      lv_k = lv_key.
      CALL FUNCTION 'DEQUEUE_E_TABLE'
        EXPORTING
          mode_rstable = 'E'
          tabname      = lv_t
          varkey       = lv_k
          _scope       = '1'.
    ENDLOOP.
    CLEAR gv_locks.
  ENDMETHOD.

  METHOD new_transid.
    "same numbering as the Web Dynpro log (function module draws max+1 of /INOWITS/R_TRANS): one session at a time
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = '/INOWITS/R_TRANS'
        varkey         = 'TRANSID_GEN'
        _scope         = '1'
        _wait          = 'X'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    APPEND `/INOWITS/R_TRANS|TRANSID_GEN` TO gv_locks.
    DATA lv_app TYPE /inowits/m_trans-app_id.
    lv_app = iv_app.
    DATA lv_tid TYPE /inowits/m_trans-transid.
    CALL FUNCTION '/INOWITS/ROLE_TRANSID_GENERATE'
      EXPORTING iv_app_id   = lv_app
      IMPORTING ev_trans_id = lv_tid.
    rv_transid = lv_tid.
  ENDMETHOD.


  METHOD app_cfg.
    DATA(lv) = to_upper( iv_app ).
    DATA(lv1) = COND string( WHEN lv IS NOT INITIAL THEN lv(1) ).
    rs_cfg-app_id = lv.
    IF gt_app_dom IS INITIAL.
      gt_app_dom = domain_values( '/INOWITS/WF_APP_ID' ).
    ENDIF.
    rs_cfg-text = COND #( WHEN line_exists( gt_app_dom[ key = lv ] ) THEN gt_app_dom[ key = lv ]-text ELSE |{ lv } (not in the application list of SAP)| ).
    rs_cfg-family = 'GENERIC'.
    rs_cfg-gt_label = 'Generic type'.  rs_cfg-gf1_label = 'Generic field 1'.  rs_cfg-gf2_label = 'Generic field 2'.
    rs_cfg-gf3_label = 'Generic field 3'.  rs_cfg-gf4_label = 'Generic field 4'.
    rs_cfg-gf1_visible = abap_true.  rs_cfg-gf2_visible = abap_true.
    rs_cfg-views_enabled = xsdbool( c_no_views NS | { lv } | ).
    rs_cfg-l0_required   = xsdbool( c_no_l0 NS | { lv } | ).
      IF lv = 'CR'.
        rs_cfg-family = 'CRS'.  rs_cfg-gt_label = 'Business Vertical'.  rs_cfg-gt_vh = 'BUSINESS'.
        rs_cfg-gf1_visible = abap_false.  rs_cfg-gf2_visible = abap_false.
      ELSEIF lv = 'CMC' OR lv = 'CMX' OR lv = 'CTM'.
        rs_cfg-family = 'CONTRACT'.  rs_cfg-gt_label = 'Material Type'.  rs_cfg-gf1_label = 'Origin Group'.  rs_cfg-gf2_label = 'Purch.Organization'.
        rs_cfg-gt_vh = 'MTART'.  rs_cfg-gf2_vh = 'EKORG'.
      ELSEIF lv = 'MVC' OR lv = 'VMX' OR lv1 = 'V'.
        rs_cfg-family = 'VENDOR'.  rs_cfg-gt_label = 'Account Group'.  rs_cfg-gf1_label = 'Company Code'.  rs_cfg-gf2_label = 'Department'.  rs_cfg-gf2_vh = 'DEPT'.
        rs_cfg-gt_vh = 'KTOKK'.  rs_cfg-gf1_vh = 'BUKRS'.
        rs_cfg-dept_visible = xsdbool( lv = 'VC' OR lv = 'VX' OR lv = 'VE' OR lv = 'MVC' ).
      ELSEIF lv = 'MCC' OR lv = 'MCX' OR lv1 = 'C'.
        rs_cfg-family = 'CUSTOMER'.  rs_cfg-gt_label = 'Account Group'.  rs_cfg-gf1_label = 'Sales Organization'.  rs_cfg-gf2_label = 'Distribution Channel'.
        rs_cfg-gt_vh = 'KTOKD'.  rs_cfg-gf1_vh = 'VKORG'.  rs_cfg-gf2_vh = 'VTWEG'.
      ELSEIF lv = 'MBC' OR lv = 'MBX' OR lv = 'MLC' OR lv = 'MLX' OR lv1 = 'B'.
        rs_cfg-family = 'BOM'.  rs_cfg-gt_label = 'Material Type'.  rs_cfg-gf1_label = 'Usage'.  rs_cfg-gf2_label = 'Ext.Matl Group'.
        rs_cfg-gt_vh = 'MTART'.
      ELSEIF lv = 'MMC'.
        rs_cfg-family = 'MATERIAL'.  rs_cfg-gt_label = 'Material Type'.  rs_cfg-gf1_label = 'Material Group'.  rs_cfg-gf2_label = 'Business Vertical'.
        rs_cfg-gt_vh = 'MTART'.  rs_cfg-gf1_vh = 'MATKL'.  rs_cfg-gf2_vh = 'BUSINESS'.
      ELSEIF lv1 = 'M'.
        rs_cfg-family = 'MATERIAL'.  rs_cfg-gt_label = 'Material Type'.  rs_cfg-gf1_label = 'Material Group'.  rs_cfg-gf2_label = 'Business Vertical'.
        rs_cfg-gf3_label = 'Plant'.  rs_cfg-gf4_label = 'Brand'.  rs_cfg-gf3_visible = abap_true.  rs_cfg-gf4_visible = abap_true.
        rs_cfg-gt_vh = 'MTART'.  rs_cfg-gf1_vh = 'MATKL'.  rs_cfg-gf2_vh = 'BUSINESS'.  rs_cfg-gf3_vh = 'PLANT'.  rs_cfg-gf4_vh = 'BRAND'.
      ELSEIF lv = 'PC' OR lv = 'PX' OR lv = 'PM' OR lv = 'PXX'.
        rs_cfg-family = 'PIR'.  rs_cfg-gt_label = 'Material type'.  rs_cfg-gf1_label = 'Origin Group'.  rs_cfg-gf2_label = 'Purchase Org.'.
        rs_cfg-gt_vh = 'MTART'.  rs_cfg-gf2_vh = 'EKORG'.  rs_cfg-pir_visible = abap_true.
      ELSEIF lv1 = 'P'.
        rs_cfg-family = 'PRICING'.  rs_cfg-gt_label = 'Condition Type'.  rs_cfg-gt_vh = 'KSCHL'.  rs_cfg-gf1_label = 'Department'.  rs_cfg-gf1_vh = 'DEPT'.  rs_cfg-gf2_visible = abap_false.
    ENDIF.
    rs_cfg-wf_id = wf_id( lv ).
  ENDMETHOD.

  METHOD wf_id.
    IF strlen( iv_app ) > 6.
      RETURN.
    ENDIF.
    DATA(lv_a) = CONV /inowits/wf_app_id( iv_app ).
    SELECT SINGLE value FROM /inowits/wf_key WHERE app_id = @lv_a AND key_name = 'WF_ID' AND active = 'X' INTO @DATA(lv_v).
    rv_wf_id = condense( CONV string( lv_v ) ).
  ENDMETHOD.

  METHOD app_list.
    DATA(lt_dom) = domain_values( '/INOWITS/WF_APP_ID' ).
    SELECT DISTINCT app_id, gen_type, gen_field, gen_field2, gen_field3, gen_field4 FROM /inowits/wf_def INTO TABLE @DATA(lt_groups).
    SELECT DISTINCT app_id FROM /inowits/wf_key INTO TABLE @DATA(lt_keyapps).
    DATA lt_apps TYPE ty_strs.
    LOOP AT lt_dom INTO DATA(ls_d).
      APPEND ls_d-key TO lt_apps.
    ENDLOOP.
    LOOP AT lt_groups INTO DATA(ls_g).
      APPEND condense( CONV string( ls_g-app_id ) ) TO lt_apps.
    ENDLOOP.
    LOOP AT lt_keyapps INTO DATA(ls_k).
      APPEND condense( CONV string( ls_k-app_id ) ) TO lt_apps.
    ENDLOOP.
    SORT lt_apps.
    DELETE ADJACENT DUPLICATES FROM lt_apps.
    DELETE lt_apps WHERE table_line IS INITIAL.
    LOOP AT lt_apps INTO DATA(lv_app).
      DATA(ls_cfg) = app_cfg( lv_app ).
      ls_cfg-group_count = REDUCE i( INIT n = 0 FOR g IN lt_groups WHERE ( app_id = lv_app ) NEXT n = n + 1 ).
      APPEND ls_cfg TO rt_cfg.
    ENDLOOP.
  ENDMETHOD.

  METHOD load_users.
    DATA lr_b TYPE RANGE OF usr21-bname.
    LOOP AT it_names INTO DATA(lv_n) WHERE table_line IS NOT INITIAL.
      IF strlen( lv_n ) <= 12.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = to_upper( lv_n ) ) TO lr_b.
      ENDIF.
    ENDLOOP.
    IF lr_b IS INITIAL.
      RETURN.
    ENDIF.
    SELECT bname, persnumber, addrnumber FROM usr21 WHERE bname IN @lr_b INTO TABLE @DATA(lt_u).
    SELECT bname, name_text FROM v_usr_name WHERE bname IN @lr_b INTO TABLE @DATA(lt_n).
    SELECT bname, uflag, gltgb FROM usr02 WHERE bname IN @lr_b INTO TABLE @DATA(lt_l).
    LOOP AT lt_u INTO DATA(ls_u).
      DATA(ls_out) = VALUE ty_user( bname = ls_u-bname exists = abap_true ).
      READ TABLE lt_n INTO DATA(ls_n) WITH KEY bname = ls_u-bname.
      IF sy-subrc = 0.
        ls_out-name = condense( CONV string( ls_n-name_text ) ).
      ENDIF.
      READ TABLE lt_l INTO DATA(ls_l) WITH KEY bname = ls_u-bname.
      IF sy-subrc = 0.
        ls_out-locked = xsdbool( ls_l-uflag <> 0 ).
        IF ls_l-gltgb IS NOT INITIAL AND ls_l-gltgb < sy-datum AND ls_l-gltgb <> '99991231'.
          ls_out-locked = abap_true.
        ENDIF.
        ls_out-valid_to = d2s( ls_l-gltgb ).
      ENDIF.
      SELECT SINGLE smtp_addr FROM adr6 WHERE persnumber = @ls_u-persnumber AND addrnumber = @ls_u-addrnumber AND flgdefault = 'X' INTO @DATA(lv_mail).
      IF sy-subrc = 0.
        ls_out-email = condense( CONV string( lv_mail ) ).
      ENDIF.
      APPEND ls_out TO rt_users.
    ENDLOOP.
  ENDMETHOD.

  METHOD users_of_group.
    LOOP AT is_group-levels ASSIGNING FIELD-SYMBOL(<l>).
      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>) WHERE agent IS NOT INITIAL.
        APPEND to_upper( <a>-agent ) TO rt_names.
      ENDLOOP.
    ENDLOOP.
    SORT rt_names.
    DELETE ADJACENT DUPLICATES FROM rt_names.
  ENDMETHOD.

  METHOD read_raw.
    SELECT * FROM /inowits/wf_def
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
        AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4
      ORDER BY PRIMARY KEY INTO TABLE @rs_raw-def.
    SELECT * FROM /inowits/wf_role
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
        AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4
      ORDER BY PRIMARY KEY INTO TABLE @rs_raw-role.
    SELECT * FROM /inowits/wf_lvl
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
        AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4
      ORDER BY PRIMARY KEY INTO TABLE @rs_raw-lvl.
  ENDMETHOD.

  METHOD raw_to_group.
    rs_group = CORRESPONDING #( dkey_to_gkey( is_key ) ).
    DATA(lt_def) = is_raw-def.
    SORT lt_def BY lvl type_lvl.
    LOOP AT lt_def ASSIGNING FIELD-SYMBOL(<d>).
      APPEND VALUE #( type_lvl = <d>-type_lvl lvl = condense( CONV string( <d>-lvl ) ) level_text = condense( CONV string( <d>-level_text ) )
                      max_role = <d>-max_role min_appr = <d>-min_appr type = <d>-type active = xsdbool( <d>-active = 'X' )
                      pir_type = <d>-pir_type ) TO rs_group-levels.
    ENDLOOP.
    "engine order: initiator, reviewers, approvers, then the level number (numeric: text sort puts L10 before L2)
    TYPES: BEGIN OF ty_ord, rank TYPE i, num TYPE i, lvl TYPE string, idx TYPE i, END OF ty_ord.
    DATA lt_ord TYPE STANDARD TABLE OF ty_ord WITH DEFAULT KEY.
    LOOP AT rs_group-levels ASSIGNING FIELD-SYMBOL(<l0>).
      APPEND VALUE #( rank = type_lvl_rank( <l0>-type_lvl ) num = lvl_num( <l0>-lvl ) lvl = <l0>-lvl idx = sy-tabix ) TO lt_ord.
    ENDLOOP.
    SORT lt_ord BY rank num lvl.
    DATA lt_new TYPE ty_levels.
    LOOP AT lt_ord INTO DATA(ls_o).
      APPEND rs_group-levels[ ls_o-idx ] TO lt_new.
    ENDLOOP.
    rs_group-levels = lt_new.

    "agents, in approval order
    DATA(lt_role) = is_raw-role.
    SORT lt_role BY lvl role start_date agent.
    LOOP AT lt_role ASSIGNING FIELD-SYMBOL(<r>).
      DATA(lv_lvl) = condense( CONV string( <r>-lvl ) ).
      READ TABLE rs_group-levels ASSIGNING FIELD-SYMBOL(<lv>) WITH KEY lvl = lv_lvl.
      IF sy-subrc <> 0.
        APPEND VALUE #( lvl = lv_lvl type_lvl = '' active = abap_false ) TO rs_group-levels ASSIGNING <lv>.
      ENDIF.
      APPEND VALUE #( role = <r>-role start_date = d2s( <r>-start_date ) end_date = d2s( <r>-end_date ) agent = condense( CONV string( <r>-agent ) )
                      name = condense( CONV string( <r>-name ) ) is_appr = xsdbool( <r>-is_appr = 'X' ) level_text = condense( CONV string( <r>-level_text ) )
                      mail_id = condense( CONV string( <r>-mail_id ) ) active = xsdbool( <r>-active = 'X' ) user_f = condense( CONV string( <r>-user_f ) )
                      dept = condense( CONV string( <r>-dept ) ) ) TO <lv>-agents.
    ENDLOOP.

    "views
    LOOP AT is_raw-lvl ASSIGNING FIELD-SYMBOL(<w>).
      DATA(ls_v) = VALUE ty_view( agent = condense( CONV string( <w>-agent ) ) view_name = condense( CONV string( <w>-view_name ) )
                                  active = xsdbool( <w>-active = 'X' ) read_only = xsdbool( <w>-read_only = 'X' ) ).
      IF <w>-lvl = 'L0'.
        APPEND ls_v TO rs_group-l0_views.
      ELSE.
        lv_lvl = condense( CONV string( <w>-lvl ) ).
        READ TABLE rs_group-levels ASSIGNING <lv> WITH KEY lvl = lv_lvl.
        IF sy-subrc <> 0.
          APPEND VALUE #( lvl = lv_lvl type_lvl = '' active = abap_false ) TO rs_group-levels ASSIGNING <lv>.
        ENDIF.
        APPEND ls_v TO <lv>-views.
      ENDIF.
    ENDLOOP.
    SORT rs_group-l0_views BY view_name.
    LOOP AT rs_group-levels ASSIGNING <lv>.
      SORT <lv>-views BY agent view_name.
    ENDLOOP.
  ENDMETHOD.

  METHOD enrich_group.
    DATA(lt_users) = load_users( users_of_group( cs_group ) ).
    SELECT view_name, v_des FROM /inowits/mdm_v_n WHERE app_id = @cs_group-app_id INTO TABLE @DATA(lt_vn).
    LOOP AT cs_group-levels ASSIGNING FIELD-SYMBOL(<l>).
      <l>-role_label = role_label( <l>-type_lvl ).
      <l>-counted = 0.
      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
        <a>-expired = xsdbool( <a>-active = abap_true AND <a>-end_date IS NOT INITIAL AND <a>-end_date < gv_today ).
        <a>-counted = xsdbool( <a>-active = abap_true AND <a>-is_appr = abap_true AND <a>-end_date IS NOT INITIAL AND <a>-end_date >= gv_today ).
        IF <a>-counted = abap_true.
          <l>-counted = <l>-counted + 1.
        ENDIF.
        <a>-receives = COND #( WHEN <a>-counted = abap_true THEN 'workitem'
                               WHEN <a>-active = abap_true AND <a>-is_appr = abap_false AND ( <a>-agent IS NOT INITIAL OR <a>-mail_id IS NOT INITIAL )
                                    AND ( <a>-end_date IS INITIAL OR <a>-end_date >= gv_today ) THEN 'notification'
                               ELSE 'none' ).
        IF <a>-email IS INITIAL.
          <a>-email = <a>-mail_id.
        ENDIF.
        IF <a>-agent IS NOT INITIAL.
          READ TABLE lt_users ASSIGNING FIELD-SYMBOL(<u>) WITH KEY bname = to_upper( <a>-agent ).
          IF sy-subrc = 0.
            IF <u>-name IS NOT INITIAL.
              <a>-name = <u>-name.
            ENDIF.
            <a>-locked = <u>-locked.
            IF <u>-email IS NOT INITIAL.
              <a>-email = <u>-email.
            ENDIF.
          ENDIF.
        ENDIF.
      ENDLOOP.
      LOOP AT <l>-views ASSIGNING FIELD-SYMBOL(<v>).
        READ TABLE lt_vn ASSIGNING FIELD-SYMBOL(<n>) WITH KEY view_name = <v>-view_name.
        IF sy-subrc = 0.
          <v>-description = condense( CONV string( <n>-v_des ) ).
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    LOOP AT cs_group-l0_views ASSIGNING <v>.
      READ TABLE lt_vn ASSIGNING <n> WITH KEY view_name = <v>-view_name.
      IF sy-subrc = 0.
        <v>-description = condense( CONV string( <n>-v_des ) ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD recalc.
    "MAX_ROLE = active, unexpired approvers (who get a work item); sequential: MIN_APPR = MAX_ROLE (as validate_def of the Web Dynpro)
    DATA(lv_cnt) = 0.
    LOOP AT cs_level-agents ASSIGNING FIELD-SYMBOL(<a>).
      IF <a>-active = abap_true AND <a>-is_appr = abap_true AND <a>-end_date IS NOT INITIAL AND <a>-end_date >= gv_today.
        lv_cnt = lv_cnt + 1.
      ENDIF.
    ENDLOOP.
    cs_level-max_role = lv_cnt.
    cs_level-counted = lv_cnt.
    IF cs_level-type = '01'.
      cs_level-min_appr = lv_cnt.
    ENDIF.
  ENDMETHOD.


  METHOD normalize.
    DATA(ls_k) = CORRESPONDING ty_gkey( cs_group ).
    norm_key( CHANGING cs_key = ls_k ).
    cs_group-app_id = ls_k-app_id.  cs_group-gen_type = ls_k-gen_type.  cs_group-gen_field = ls_k-gen_field.
    cs_group-gen_field2 = ls_k-gen_field2.  cs_group-gen_field3 = ls_k-gen_field3.  cs_group-gen_field4 = ls_k-gen_field4.
    LOOP AT cs_group-levels ASSIGNING FIELD-SYMBOL(<l>).
      <l>-type_lvl   = condense( to_upper( <l>-type_lvl ) ).
      <l>-lvl        = condense( to_upper( <l>-lvl ) ).
      <l>-level_text = condense( <l>-level_text ).
      <l>-type       = condense( <l>-type ).
      IF <l>-type = '1' OR <l>-type = '2'.
        <l>-type = |0{ <l>-type }|.
      ENDIF.
      <l>-pir_type   = condense( to_upper( <l>-pir_type ) ).
      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
        <a>-agent      = condense( to_upper( <a>-agent ) ).
        <a>-mail_id    = condense( <a>-mail_id ).
        <a>-level_text = condense( to_upper( <a>-level_text ) ).
        <a>-user_f     = condense( to_upper( <a>-user_f ) ).
        <a>-dept       = condense( <a>-dept ).
        <a>-role       = condense( <a>-role ).
        IF strlen( <a>-role ) = 1 AND <a>-role CO '0123456789'.
          <a>-role = |0{ <a>-role }|.
        ENDIF.
        IF <a>-start_date IS INITIAL.
          <a>-start_date = gv_today.
        ENDIF.
        <a>-email = condense( <a>-email ).
        IF <a>-agent IS INITIAL AND <a>-email IS NOT INITIAL.
          "e-mail id entered (reviewer levels): the SAP user behind it is the agent; no SAP user = a notification-only mail id
          DATA(lv_ubm) = user_by_mail( <a>-email ).
          IF lv_ubm IS NOT INITIAL.
            <a>-agent = lv_ubm.
            CLEAR <a>-mail_id.
          ELSE.
            <a>-mail_id = <a>-email.
          ENDIF.
        ENDIF.
        IF <a>-is_appr = abap_true.
          CLEAR <a>-mail_id.     "an approver is a SAP user; a mail id is only for notification recipients
        ENDIF.
      ENDLOOP.
      LOOP AT <l>-views ASSIGNING FIELD-SYMBOL(<v>).
        <v>-view_name = condense( to_upper( <v>-view_name ) ).
        <v>-agent     = condense( to_upper( <v>-agent ) ).
        IF <l>-type <> '02'.
          CLEAR <v>-agent.      "views per agent exist for parallel levels only
        ENDIF.
      ENDLOOP.
      recalc( CHANGING cs_level = <l> ).
    ENDLOOP.
    LOOP AT cs_group-l0_views ASSIGNING <v>.
      <v>-view_name = condense( to_upper( <v>-view_name ) ).
      CLEAR <v>-agent.
    ENDLOOP.
  ENDMETHOD.

  METHOD group_to_raw.
    DATA(ls_k) = gkey_to_dkey( CORRESPONDING #( is_group ) ).
    DATA(lv_today) = sy-datum.
    LOOP AT is_group-levels ASSIGNING FIELD-SYMBOL(<l>).
      IF <l>-type_lvl IS INITIAL AND <l>-active = abap_false.
        CONTINUE.        "level without a definition: its agents and views are not kept
      ENDIF.
      DATA(ls_d) = VALUE /inowits/wf_def( mandt = sy-mandt app_id = ls_k-app_id gen_type = ls_k-gen_type gen_field = ls_k-gen_field
        gen_field2 = ls_k-gen_field2 gen_field3 = ls_k-gen_field3 gen_field4 = ls_k-gen_field4 type_lvl = <l>-type_lvl lvl = <l>-lvl
        level_text = <l>-level_text max_role = <l>-max_role min_appr = <l>-min_appr type = <l>-type
        active = COND #( WHEN <l>-active = abap_true THEN 'X' ELSE ' ' ) pir_type = <l>-pir_type ).
      READ TABLE is_old-def INTO DATA(ls_od) WITH KEY type_lvl = ls_d-type_lvl lvl = ls_d-lvl.
      IF sy-subrc = 0.
        ls_d-created_on = ls_od-created_on.  ls_d-created_by = ls_od-created_by.
        ls_d-changed_on = ls_od-changed_on.  ls_d-changed_by = ls_od-changed_by.
        IF ls_d <> ls_od.
          ls_d-changed_on = lv_today.  ls_d-changed_by = gv_user.
        ENDIF.
      ELSE.
        ls_d-created_on = lv_today.  ls_d-created_by = gv_user.  ls_d-changed_on = lv_today.  ls_d-changed_by = gv_user.
      ENDIF.
      APPEND ls_d TO rs_raw-def.

      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
        DATA(ls_r) = VALUE /inowits/wf_role( mandt = sy-mandt app_id = ls_k-app_id start_date = s2d( <a>-start_date ) gen_type = ls_k-gen_type
          gen_field = ls_k-gen_field gen_field2 = ls_k-gen_field2 gen_field3 = ls_k-gen_field3 gen_field4 = ls_k-gen_field4 lvl = <l>-lvl
          role = <a>-role agent = <a>-agent name = <a>-name is_appr = COND #( WHEN <a>-is_appr = abap_true THEN 'X' ELSE ' ' )
          level_text = <a>-level_text mail_id = <a>-mail_id end_date = s2d( <a>-end_date )
          active = COND #( WHEN <a>-active = abap_true THEN 'X' ELSE ' ' ) user_f = <a>-user_f dept = <a>-dept ).
        IF ls_r-start_date IS INITIAL.
          ls_r-start_date = lv_today.
        ENDIF.
        READ TABLE is_old-role INTO DATA(ls_or) WITH KEY start_date = ls_r-start_date lvl = ls_r-lvl role = ls_r-role.
        IF sy-subrc = 0.
          ls_r-created_on = ls_or-created_on.  ls_r-created_by = ls_or-created_by.
          ls_r-changed_on = ls_or-changed_on.  ls_r-changed_by = ls_or-changed_by.
          IF ls_r <> ls_or.
            ls_r-changed_on = lv_today.  ls_r-changed_by = gv_user.
          ENDIF.
        ELSE.
          ls_r-created_on = lv_today.  ls_r-created_by = gv_user.  ls_r-changed_on = lv_today.  ls_r-changed_by = gv_user.
        ENDIF.
        APPEND ls_r TO rs_raw-role.
      ENDLOOP.

      LOOP AT <l>-views ASSIGNING FIELD-SYMBOL(<v>).
        DATA(ls_w) = VALUE /inowits/wf_lvl( mandt = sy-mandt app_id = ls_k-app_id gen_type = ls_k-gen_type gen_field = ls_k-gen_field
          gen_field2 = ls_k-gen_field2 gen_field3 = ls_k-gen_field3 gen_field4 = ls_k-gen_field4 lvl = <l>-lvl agent = <v>-agent
          view_name = <v>-view_name active = COND #( WHEN <v>-active = abap_true THEN 'X' ELSE ' ' )
          read_only = COND #( WHEN <v>-read_only = abap_true THEN 'X' ELSE ' ' ) ).
        APPEND ls_w TO rs_raw-lvl.
      ENDLOOP.
    ENDLOOP.
    LOOP AT is_group-l0_views ASSIGNING <v>.
      ls_w = VALUE /inowits/wf_lvl( mandt = sy-mandt app_id = ls_k-app_id gen_type = ls_k-gen_type gen_field = ls_k-gen_field
        gen_field2 = ls_k-gen_field2 gen_field3 = ls_k-gen_field3 gen_field4 = ls_k-gen_field4 lvl = 'L0' agent = ''
        view_name = <v>-view_name active = COND #( WHEN <v>-active = abap_true THEN 'X' ELSE ' ' )
        read_only = COND #( WHEN <v>-read_only = abap_true THEN 'X' ELSE ' ' ) ).
      APPEND ls_w TO rs_raw-lvl.
    ENDLOOP.
    "views keep the audit data of the row they replace
    LOOP AT rs_raw-lvl ASSIGNING FIELD-SYMBOL(<nw>).
      READ TABLE is_old-lvl INTO DATA(ls_ow) WITH KEY lvl = <nw>-lvl agent = <nw>-agent view_name = <nw>-view_name.
      IF sy-subrc = 0.
        <nw>-created_on = ls_ow-created_on.  <nw>-created_by = ls_ow-created_by.
        <nw>-changed_on = ls_ow-changed_on.  <nw>-changed_by = ls_ow-changed_by.
        IF <nw> <> ls_ow.
          <nw>-changed_on = lv_today.  <nw>-changed_by = gv_user.
        ENDIF.
      ELSE.
        <nw>-created_on = lv_today.  <nw>-created_by = gv_user.  <nw>-changed_on = lv_today.  <nw>-changed_by = gv_user.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD version_of.
    DATA(lt_def)  = is_raw-def.
    DATA(lt_role) = is_raw-role.
    DATA(lt_lvl)  = is_raw-lvl.
    SORT lt_def BY type_lvl lvl.
    SORT lt_role BY start_date lvl role.
    SORT lt_lvl BY lvl agent view_name.
    DATA(lv_json) = /ui2/cl_json=>serialize( data = VALUE ty_raw( def = lt_def role = lt_role lvl = lt_lvl ) ).
    DATA lv_hash TYPE string.
    TRY.
        cl_abap_message_digest=>calculate_hash_for_char(
          EXPORTING if_algorithm = 'SHA1' if_data = lv_json
          IMPORTING ef_hashstring = lv_hash ).
      CATCH cx_abap_message_digest.
        lv_hash = |{ strlen( lv_json ) }|.
    ENDTRY.
    rv_ver = lv_hash.
  ENDMETHOD.

  METHOD group_exists.
    SELECT SINGLE app_id FROM /inowits/wf_def WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
      AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4 INTO @DATA(lv_a).
    IF sy-subrc = 0.
      rv_exists = abap_true.
      RETURN.
    ENDIF.
    SELECT SINGLE app_id FROM /inowits/wf_role WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
      AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4 INTO @lv_a.
    IF sy-subrc = 0.
      rv_exists = abap_true.
      RETURN.
    ENDIF.
    SELECT SINGLE app_id FROM /inowits/wf_lvl WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
      AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3 AND gen_field4 = @is_key-gen_field4 INTO @lv_a.
    rv_exists = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

  METHOD open_requests.
    "requests of this key that are still running (M_TRANS has no brand column; status 01 / 02 = requested / in approval)
    SELECT COUNT(*) FROM /inowits/m_trans
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field
        AND gen_field2 = @is_key-gen_field2 AND gen_field3 = @is_key-gen_field3
        AND ( status = '01' OR status = '02' )
      INTO @rv_count.
  ENDMETHOD.

  METHOD chk_views.
    DATA lt_seen TYPE ty_strs.
    DATA lt_badag TYPE ty_strs.
    DATA(lv_active) = 0.
    LOOP AT it_views ASSIGNING FIELD-SYMBOL(<v>).
      DATA(lv_line) = sy-tabix.
      DATA(lv_p) = |{ iv_prefix }|.
      IF <v>-active = abap_true.
        lv_active = lv_active + 1.
      ENDIF.
      IF <v>-view_name IS INITIAL.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'VIEW_NAME' iv_text = |{ iv_prefix } Line no { lv_line }: View name is mandatory| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
        CONTINUE.
      ENDIF.
      chk_len( EXPORTING iv_val = <v>-view_name iv_max = 30 iv_label = |{ iv_prefix } View name| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
      IF it_valid IS NOT INITIAL AND NOT line_exists( it_valid[ table_line = <v>-view_name ] ).
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'VIEW_INVALID' iv_text = |{ iv_prefix } Line no { lv_line }->View name :{ <v>-view_name }: is invalid| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      DATA(lv_id) = |{ <v>-agent }\|{ <v>-view_name }|.
      IF line_exists( lt_seen[ table_line = lv_id ] ).
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'VIEW_DUP' iv_text = |{ iv_prefix }-> View name :{ <v>-view_name } already exist| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
      ELSE.
        APPEND lv_id TO lt_seen.
      ENDIF.
      IF iv_by_agent = abap_true.
        IF <v>-agent IS INITIAL OR NOT line_exists( it_agents[ agent = <v>-agent is_appr = abap_true ] ).
          APPEND <v>-agent TO lt_badag.
        ENDIF.
      ENDIF.
    ENDLOOP.
    SORT lt_badag.
    DELETE ADJACENT DUPLICATES FROM lt_badag.
    LOOP AT lt_badag INTO DATA(lv_bad).
      add_msg( EXPORTING iv_sev = 'W' iv_code = 'VIEW_AGENT'
               iv_text = COND #( WHEN lv_bad IS INITIAL THEN |{ iv_prefix }: some views of this parallel level have no approver assigned|
                                 ELSE |{ iv_prefix }: views kept for { lv_bad }, who is not an approver of this level (they are not used)| )
               iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
    ENDLOOP.
    IF iv_require = abap_true AND lv_active = 0.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'VIEW_NONE' iv_text = |{ iv_prefix } Does not found any active record of View Visibility| iv_target = iv_target CHANGING ct_msgs = ct_msgs ).
    ENDIF.
  ENDMETHOD.


  METHOD validate.
    DATA(lv_app) = cs_group-app_id.
    IF lv_app IS INITIAL.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'APP_ID' iv_text = 'Please enter Application Id' iv_target = 'search' CHANGING ct_msgs = ct_msgs ).
      RETURN.
    ENDIF.
    DATA(ls_cfg) = app_cfg( lv_app ).
    chk_len( EXPORTING iv_val = cs_group-app_id     iv_max = 6  iv_label = 'Application id'  iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    chk_len( EXPORTING iv_val = cs_group-gen_type   iv_max = 15 iv_label = ls_cfg-gt_label   iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    chk_len( EXPORTING iv_val = cs_group-gen_field  iv_max = 10 iv_label = ls_cfg-gf1_label  iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    chk_len( EXPORTING iv_val = cs_group-gen_field2 iv_max = 20 iv_label = ls_cfg-gf2_label  iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    chk_len( EXPORTING iv_val = cs_group-gen_field3 iv_max = 20 iv_label = ls_cfg-gf3_label  iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    chk_len( EXPORTING iv_val = cs_group-gen_field4 iv_max = 20 iv_label = ls_cfg-gf4_label  iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    IF ls_cfg-family = 'MATERIAL' AND cs_group-gen_type IS INITIAL AND lv_app <> 'MMC'.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'TYPE_REQ' iv_text = |{ ls_cfg-gt_label } is required: a material request always carries one, so a definition without it is never used| iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    ENDIF.
    IF iv_mode = 'create' AND group_exists( gkey_to_dkey( CORRESPONDING #( cs_group ) ) ) = abap_true.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'EXISTS' iv_text = 'Selected record is already exist.Kindly delete otherhwise change the values' iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
    ENDIF.
    IF cs_group-levels IS INITIAL.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'NO_LEVEL' iv_text = 'Does not contain any Level definition details to process' CHANGING ct_msgs = ct_msgs ).
    ENDIF.

    DATA(lt_users) = load_users( users_of_group( cs_group ) ).
    DATA(lv_appc) = CONV /inowits/wf_app_id( lv_app ).
    SELECT view_name FROM /inowits/mdm_v_n WHERE app_id = @lv_appc INTO TABLE @DATA(lt_vn_db).
    DATA lt_valid TYPE ty_strs.
    LOOP AT lt_vn_db INTO DATA(ls_vn).
      APPEND condense( CONV string( ls_vn-view_name ) ) TO lt_valid.
    ENDLOOP.
    DATA(lt_lt_dom) = domain_values( '/INOWITS/LEVEL_TEXT' ).
    DATA lv_has_a TYPE abap_bool.

    LOOP AT cs_group-levels ASSIGNING FIELD-SYMBOL(<l>).
      DATA(lv_idx) = sy-tabix.
      DATA(lv_l) = <l>-lvl.
      IF <l>-type_lvl IS INITIAL AND <l>-active = abap_false.
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'ORPHAN' iv_text = |Level { lv_l } has agents or views but no definition (Area / Workflow type). Define it or its agents and views are removed on save| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
        CONTINUE.
      ENDIF.
      IF NOT matches( val = lv_l regex = 'L[0-9]{1,6}' ) OR lvl_num( lv_l ) = 0.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'LVL_FMT' iv_text = |Level id { lv_l } is not valid: use L1, L2, ... (L0 is the Initiator and holds the initiator views only)| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      DATA(lv_dups) = REDUCE i( INIT n = 0 FOR l2 IN cs_group-levels WHERE ( lvl = lv_l ) NEXT n = n + 1 ).
      IF lv_dups > 1 AND line_index( cs_group-levels[ lvl = lv_l ] ) = lv_idx.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'LVL_DUP' iv_text = |Level { lv_l } is defined more than once| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      chk_len( EXPORTING iv_val = <l>-lvl iv_max = 20 iv_label = |Level { lv_l } id| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      chk_len( EXPORTING iv_val = <l>-level_text iv_max = 30 iv_label = |Level { lv_l } text| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      IF <l>-active = abap_false.
        CONTINUE.       "as the Web Dynpro: only active level definitions are checked
      ENDIF.
      IF <l>-type_lvl IS INITIAL.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'AREA' iv_text = |Level { lv_l }: Select any Area value| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ELSEIF <l>-type_lvl = 'I'.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'AREA_I' iv_text = |Level { lv_l }: Selected application Initiator vlaues won't applicable.kindly remove the record| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ELSEIF <l>-type_lvl <> 'R' AND <l>-type_lvl <> 'A'.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'AREA' iv_text = |Level { lv_l }: Area { <l>-type_lvl } is not valid (Reviewer or Approver)| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      IF <l>-type IS INITIAL.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'WF_TYPE' iv_text = |Level { lv_l }: Select any Workflow Type value| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ELSEIF <l>-type <> '01' AND <l>-type <> '02'.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'WF_TYPE' iv_text = |Level { lv_l }: Workflow type { <l>-type } is not valid (01 sequential, 02 parallel)| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      IF <l>-type = '02'.
        IF <l>-min_appr <= 0.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'MIN_APPR' iv_text = |Level { lv_l }: Enter Minmum no of Approval| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
        ELSEIF <l>-min_appr > <l>-max_role.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'MIN_GT_MAX' iv_text = |Level { lv_l }: Minmum no of Approval should not greater than to Maximum role| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
        ENDIF.
      ENDIF.
      IF <l>-max_role > 99 OR <l>-min_appr > 99.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'COUNT' iv_text = |Level { lv_l }: more than 99 approvers are not possible| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      IF <l>-type_lvl = 'A'.
        lv_has_a = abap_true.
      ENDIF.
      IF <l>-counted = 0.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'NO_AGENT' iv_text = |Level { lv_l }: Does not found any active record of Agent details| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
      ENDIF.

      "agents
      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
        DATA(lv_line) = sy-tabix.
        DATA(lv_pre) = |Level { lv_l }-> Line no { lv_line }: |.
        DATA(lv_tg) = |{ lv_l }#{ lv_line }|.
        IF NOT matches( val = <a>-role regex = '[0-9]{2}' ) OR <a>-role = '00'.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'ROLE_FMT' iv_text = |{ lv_pre }Role sequence must be 01 to 99| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        DATA(lv_samekey) = REDUCE i( INIT n = 0 FOR a2 IN <l>-agents WHERE ( role = <a>-role AND start_date = <a>-start_date ) NEXT n = n + 1 ).
        IF lv_samekey > 1 AND line_index( <l>-agents[ role = <a>-role start_date = <a>-start_date ] ) = lv_line.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'ROLE_KEY' iv_text = |{ lv_pre }Role sequence { <a>-role } with start date { <a>-start_date } exists more than once in this level| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        IF <a>-start_date IS NOT INITIAL AND is_date( <a>-start_date ) = abap_false.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'DATE_FMT' iv_text = |{ lv_pre }Start date is not a valid date (use YYYY-MM-DD)| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        IF <a>-end_date IS NOT INITIAL AND is_date( <a>-end_date ) = abap_false.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'DATE_FMT' iv_text = |{ lv_pre }End date is not a valid date (use YYYY-MM-DD)| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        chk_len( EXPORTING iv_val = <a>-agent iv_max = 12 iv_label = |{ lv_pre }Agent| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        chk_len( EXPORTING iv_val = <a>-mail_id iv_max = 250 iv_label = |{ lv_pre }Mail id| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        chk_len( EXPORTING iv_val = <a>-dept iv_max = 30 iv_label = |{ lv_pre }Department| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        chk_len( EXPORTING iv_val = <a>-level_text iv_max = 3 iv_label = |{ lv_pre }Level text code| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        IF <a>-level_text IS NOT INITIAL AND lt_lt_dom IS NOT INITIAL AND NOT line_exists( lt_lt_dom[ key = <a>-level_text ] ).
          add_msg( EXPORTING iv_sev = 'W' iv_code = 'DEPT_CODE' iv_text = |{ lv_pre }Department code { <a>-level_text } is not in the list of SAP| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        IF <a>-start_date IS NOT INITIAL AND <a>-end_date IS NOT INITIAL AND <a>-start_date > <a>-end_date.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'DATE_ORDER' iv_text = |{ lv_pre }Start date is after the end date| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        IF <a>-active = abap_false.
          CONTINUE.
        ENDIF.
        IF <a>-end_date IS INITIAL.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'END_DATE' iv_text = |{ lv_pre }Enter End Date| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ELSEIF <a>-end_date < gv_today.
          add_msg( EXPORTING iv_sev = 'W' iv_code = 'EXPIRED'
          iv_text = |{ lv_pre }Agent { <a>-agent } is active but its end date { <a>-end_date } is in the past, so it is not counted and gets no work item| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
        ENDIF.
        IF <a>-is_appr = abap_true.
          IF <a>-agent IS INITIAL.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'AGENT_REQ'
              iv_text = COND #( WHEN <a>-email IS NOT INITIAL
                                THEN |{ lv_pre }No SAP user is registered for e-mail { <a>-email }: a work item needs a SAP user (untick Reviews to inform this e-mail by mail only)|
                                ELSE |{ lv_pre }Enter Email ID| )
              iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ENDIF.
        ELSE.
          IF <a>-agent IS INITIAL AND <a>-mail_id IS INITIAL.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'MAIL_REQ' iv_text = |{ lv_pre }Enter Mail id| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ELSEIF <a>-agent IS NOT INITIAL AND <a>-mail_id IS NOT INITIAL.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'MAIL_BOTH' iv_text = |{ lv_pre }Enter Mail id or Agent| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ENDIF.
          IF <a>-mail_id IS NOT INITIAL AND NOT matches( val = <a>-mail_id regex = '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}' ).
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'MAIL_FMT' iv_text = |{ lv_pre }Mail id { <a>-mail_id } is not a valid e-mail address| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ENDIF.
        ENDIF.
        IF <a>-agent IS NOT INITIAL.
          READ TABLE lt_users ASSIGNING FIELD-SYMBOL(<u>) WITH KEY bname = <a>-agent.
          IF sy-subrc <> 0.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'AGENT_INVALID' iv_text = |{ lv_pre }Enter Valid Agent| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ELSEIF <u>-locked = abap_true.
            add_msg( EXPORTING iv_sev = 'W' iv_code = 'AGENT_LOCKED' iv_text = |{ lv_pre }User { <a>-agent } is locked or expired in SAP: a work item sent to it would not be processed| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ENDIF.
        ENDIF.
        IF lv_app = 'MC'.
          IF <a>-level_text IS INITIAL.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'DEPT' iv_text = |{ lv_pre }Select department| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
          ENDIF.
          IF <a>-agent IS NOT INITIAL.
            DATA(lv_same) = REDUCE i( INIT n = 0 FOR a3 IN <l>-agents WHERE ( active = abap_true AND agent = <a>-agent ) NEXT n = n + 1 ).
            IF lv_same > 1 AND line_index( <l>-agents[ active = abap_true agent = <a>-agent ] ) = lv_line.
              add_msg( EXPORTING iv_sev = 'E' iv_code = 'DUP_AGENT' iv_text = |{ lv_pre }Duplicate agent is not possible in same level| iv_target = lv_tg CHANGING ct_msgs = ct_msgs ).
            ENDIF.
          ENDIF.
        ENDIF.
      ENDLOOP.
      IF <l>-type = '01'.
        LOOP AT <l>-agents ASSIGNING <a> WHERE counted = abap_true.
          DATA(lv_r) = REDUCE i( INIT n = 0 FOR a4 IN <l>-agents WHERE ( counted = abap_true AND role = <a>-role ) NEXT n = n + 1 ).
          IF lv_r > 1 AND line_index( <l>-agents[ counted = abap_true role = <a>-role ] ) = sy-tabix.
            add_msg( EXPORTING iv_sev = 'E' iv_code = 'ROLE_DUP' iv_text = |Level { lv_l }: Role sequence { <a>-role } is used by more than one active approver (the approval order would be undefined)| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
          ENDIF.
        ENDLOOP.
      ENDIF.

      "views of the level
      IF ls_cfg-views_enabled = abap_true.
        chk_views( EXPORTING it_views = <l>-views it_valid = lt_valid iv_prefix = |Level { lv_l } views| iv_target = lv_l
                             iv_require = abap_false iv_by_agent = xsdbool( <l>-type = '02' ) it_agents = <l>-agents CHANGING ct_msgs = ct_msgs ).
        IF NOT line_exists( <l>-views[ active = abap_true ] ).
          add_msg( EXPORTING iv_sev = 'W' iv_code = 'NO_VIEWS' iv_text = |Level { lv_l } has no active view: its agents would see no tab| iv_target = lv_l CHANGING ct_msgs = ct_msgs ).
        ENDIF.
      ENDIF.
    ENDLOOP.

    "initiator (L0) views
    IF ls_cfg-views_enabled = abap_true.
      chk_views( EXPORTING it_views = cs_group-l0_views it_valid = lt_valid iv_prefix = 'In Preliminary view,' iv_target = 'L0'
                           iv_require = ls_cfg-l0_required iv_by_agent = abap_false CHANGING ct_msgs = ct_msgs ).
    ENDIF.

    IF lv_has_a = abap_false AND cs_group-levels IS NOT INITIAL.
      IF ls_cfg-l0_required = abap_true.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'NO_APPROVER' iv_text = 'Does not contain any active details of Approver' CHANGING ct_msgs = ct_msgs ).
      ELSE.
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'NO_APPROVER' iv_text = 'Does not contain any active details of Approver: the engine will stop with "Please maintain Approver role"' CHANGING ct_msgs = ct_msgs ).
      ENDIF.
    ENDIF.

    "routing advice (not blocking): what the request app actually passes for the generic fields
    IF lv_app = 'MC' OR lv_app = 'ME' OR lv_app = 'MX'.
      DATA(lv_mtart) = CONV mtart( cs_group-gen_type ).
      DATA(lv_found) = abap_false.
      DATA ls_cons TYPE /inowits/wf_cons.
      IF strlen( cs_group-gen_type ) <= 4.
        SELECT SINGLE * FROM /inowits/wf_cons WHERE mtart = @lv_mtart INTO @ls_cons.
        lv_found = xsdbool( sy-subrc = 0 ).
      ENDIF.
      IF cs_group-gen_field IS NOT INITIAL AND ( lv_found = abap_false OR ls_cons-rq_matkl <> 'X' ).
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'CONS_MATKL'
          iv_text = |Material type { cs_group-gen_type } does not route by material group (table /INOWITS/WF_CONS): requests pass an empty group, so this definition is never matched|
          iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
      ELSEIF cs_group-gen_field IS INITIAL AND lv_found = abap_true AND ls_cons-rq_matkl = 'X'.
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'CONS_MATKL'
          iv_text = |Material type { cs_group-gen_type } routes by material group (table /INOWITS/WF_CONS): a definition without a group is never matched|
          iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      IF cs_group-gen_field2 IS NOT INITIAL AND ( lv_found = abap_false OR ls_cons-rq_business <> 'X' ).
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'CONS_BUSINESS'
          iv_text = |Material type { cs_group-gen_type } does not route by business vertical (table /INOWITS/WF_CONS): requests pass an empty business vertical, so this definition is never matched|
          iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
      ELSEIF cs_group-gen_field2 IS INITIAL AND lv_found = abap_true AND ls_cons-rq_business = 'X'.
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'CONS_BUSINESS'
          iv_text = |Material type { cs_group-gen_type } routes by business vertical (table /INOWITS/WF_CONS): a definition without a vertical is never matched|
          iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
      ENDIF.
      IF cs_group-gen_field4 IS NOT INITIAL AND cs_group-gen_type <> 'PKGN'.
        add_msg( EXPORTING iv_sev = 'W' iv_code = 'BRAND_PKGN'
          iv_text = 'The engine honours the brand only for material type PKGN: for other types a definition with a brand is still picked up for every brand'
          iv_target = 'key' CHANGING ct_msgs = ct_msgs ).
      ENDIF.
    ENDIF.
    IF wf_id( lv_app ) IS INITIAL.
      add_msg( EXPORTING iv_sev = 'W' iv_code = 'WFID_MISSING' iv_text = |Workflow ID does not exist for application { lv_app }: add the key point WF_ID, otherwise no request of this application can start| CHANGING ct_msgs = ct_msgs ).
    ENDIF.
  ENDMETHOD.

  METHOD group_issues.
    DATA(ls_g) = is_group.
    validate( EXPORTING iv_mode = 'view' CHANGING cs_group = ls_g ct_msgs = rt_msgs ).
  ENDMETHOD.


  METHOD log_level.
    DATA(ls) = VALUE /inowits/rol_log( mandt = sy-mandt transid = iv_transid app_id = is_key-app_id gen_type = is_key-gen_type
      gen_field = is_key-gen_field gen_field2 = is_key-gen_field2 changed_on = sy-datum changed_by = gv_user
      reason = |{ iv_reason } [{ iv_ctx }]| ).
    ls-lvl = COND #( WHEN iv_reason = 'Agent Added' THEN is_new-lvl ELSE is_old-lvl ).
    IF iv_reason <> 'Agent Added'.
      ls-type_lvl = role_label( is_old-type_lvl ).  ls-max_role = is_old-max_role.  ls-min_appr = is_old-min_appr.
      ls-type = is_old-type.  ls-active = is_old-active.
    ENDIF.
    IF iv_reason <> 'Agent Deleted'.
      ls-ch_type_lvl = is_new-type_lvl.  ls-ch_max_role = is_new-max_role.  ls-ch_min_appr = is_new-min_appr.
      ls-ch_type = is_new-type.  ls-ch_active = is_new-active.
    ENDIF.
    APPEND ls TO ct_rol.
  ENDMETHOD.

  METHOD log_agent.
    DATA(ls) = VALUE /inowits/rol_log( mandt = sy-mandt transid = iv_transid app_id = is_key-app_id gen_type = is_key-gen_type
      gen_field = is_key-gen_field gen_field2 = is_key-gen_field2 changed_on = sy-datum changed_by = gv_user
      reason = |{ iv_reason } [{ iv_ctx }]| ).
    IF iv_reason = 'Agent Added'.
      ls-lvl = is_new-lvl.  ls-role = is_new-role.  ls-start_date = is_new-start_date.
    ELSE.
      ls-lvl = is_old-lvl.  ls-role = is_old-role.  ls-start_date = is_old-start_date.
      ls-end_date = is_old-end_date.  ls-is_appr = is_old-is_appr.  ls-mail_id = is_old-mail_id.  ls-user_f = is_old-user_f.
      ls-agent = is_old-agent.  ls-name = is_old-name.  ls-active = is_old-active.
    ENDIF.
    IF iv_reason <> 'Agent Deleted'.
      ls-ch_end_date = is_new-end_date.  ls-ch_is_appr = is_new-is_appr.  ls-ch_mail_id = is_new-mail_id.  ls-ch_user_f = is_new-user_f.
      ls-ch_agent = is_new-agent.  ls-ch_name = is_new-name.  ls-ch_active = is_new-active.
    ENDIF.
    APPEND ls TO ct_rol.
  ENDMETHOD.

  METHOD log_view.
    DATA(ls) = VALUE /inowits/lvl_log( mandt = sy-mandt transid = iv_transid app_id = is_key-app_id gen_type = is_key-gen_type
      gen_field = is_key-gen_field gen_field2 = is_key-gen_field2 changed_on = sy-datum changed_by = gv_user
      reason = |{ iv_reason } [{ iv_ctx }]| ).
    IF iv_reason = 'View is Added'.
      ls-lvl = is_new-lvl.  ls-view_name = is_new-view_name.
    ELSE.
      ls-lvl = is_old-lvl.  ls-view_name = is_old-view_name.  ls-agent = is_old-agent.
      ls-active_lvl = is_old-active.  ls-read_only = is_old-read_only.
    ENDIF.
    IF iv_reason <> 'View is Deleted'.
      ls-ch_agent = is_new-agent.  ls-ch_active_lvl = is_new-active.  ls-ch_read_only = is_new-read_only.
    ENDIF.
    "the log key has no agent column: one row per (level, view)
    IF NOT line_exists( ct_lvl[ lvl = ls-lvl view_name = ls-view_name ] ).
      APPEND ls TO ct_lvl.
    ENDIF.
  ENDMETHOD.

  METHOD build_logs.
    CLEAR: et_rol, et_lvl.
    DATA(lv_ctx) = |F3={ is_key-gen_field3 } F4={ is_key-gen_field4 } by { gv_actor }|.
    IF iv_note IS NOT INITIAL.
      lv_ctx = |{ iv_note }; { lv_ctx }|.
    ENDIF.
    "levels
    LOOP AT is_old-def ASSIGNING FIELD-SYMBOL(<od>).
      READ TABLE is_new-def ASSIGNING FIELD-SYMBOL(<nd>) WITH KEY type_lvl = <od>-type_lvl lvl = <od>-lvl.
      IF sy-subrc <> 0.
        log_level( EXPORTING is_old = <od> is_new = VALUE #( ) iv_reason = 'Agent Deleted' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ELSEIF <od>-type <> <nd>-type OR <od>-active <> <nd>-active OR <od>-max_role <> <nd>-max_role OR <od>-min_appr <> <nd>-min_appr
          OR <od>-level_text <> <nd>-level_text OR <od>-pir_type <> <nd>-pir_type.
        DATA(lv_x) = lv_ctx.
        IF <od>-level_text <> <nd>-level_text.
          lv_x = |{ lv_x }; level text { <od>-level_text }->{ <nd>-level_text }|.
        ENDIF.
        IF <od>-pir_type <> <nd>-pir_type.
          lv_x = |{ lv_x }; PIR type { <od>-pir_type }->{ <nd>-pir_type }|.
        ENDIF.
        log_level( EXPORTING is_old = <od> is_new = <nd> iv_reason = 'Agent Changed' iv_ctx = lv_x is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ENDIF.
    ENDLOOP.
    LOOP AT is_new-def ASSIGNING <nd>.
      IF NOT line_exists( is_old-def[ type_lvl = <nd>-type_lvl lvl = <nd>-lvl ] ).
        log_level( EXPORTING is_old = VALUE #( ) is_new = <nd> iv_reason = 'Agent Added' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ENDIF.
    ENDLOOP.
    "agents
    LOOP AT is_old-role ASSIGNING FIELD-SYMBOL(<or>).
      READ TABLE is_new-role ASSIGNING FIELD-SYMBOL(<nr>) WITH KEY lvl = <or>-lvl role = <or>-role start_date = <or>-start_date.
      IF sy-subrc <> 0.
        log_agent( EXPORTING is_old = <or> is_new = VALUE #( ) iv_reason = 'Agent Deleted' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ELSEIF <or>-agent <> <nr>-agent OR <or>-name <> <nr>-name OR <or>-end_date <> <nr>-end_date OR <or>-is_appr <> <nr>-is_appr
          OR <or>-active <> <nr>-active OR <or>-user_f <> <nr>-user_f OR <or>-mail_id <> <nr>-mail_id
          OR <or>-level_text <> <nr>-level_text OR <or>-dept <> <nr>-dept.
        lv_x = lv_ctx.
        IF <or>-level_text <> <nr>-level_text.
          lv_x = |{ lv_x }; department { <or>-level_text }->{ <nr>-level_text }|.
        ENDIF.
        IF <or>-dept <> <nr>-dept.
          lv_x = |{ lv_x }; dept { <or>-dept }->{ <nr>-dept }|.
        ENDIF.
        log_agent( EXPORTING is_old = <or> is_new = <nr> iv_reason = 'Agent Changed' iv_ctx = lv_x is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ENDIF.
    ENDLOOP.
    LOOP AT is_new-role ASSIGNING <nr>.
      IF NOT line_exists( is_old-role[ lvl = <nr>-lvl role = <nr>-role start_date = <nr>-start_date ] ).
        log_agent( EXPORTING is_old = VALUE #( ) is_new = <nr> iv_reason = 'Agent Added' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_rol = et_rol ).
      ENDIF.
    ENDLOOP.
    "views: same view with another agent = changed (mass agent change); otherwise deleted / added
    DATA lt_olduns TYPE STANDARD TABLE OF /inowits/wf_lvl WITH DEFAULT KEY.
    DATA lt_newuns TYPE STANDARD TABLE OF /inowits/wf_lvl WITH DEFAULT KEY.
    LOOP AT is_old-lvl ASSIGNING FIELD-SYMBOL(<ow>).
      READ TABLE is_new-lvl ASSIGNING FIELD-SYMBOL(<nw>) WITH KEY lvl = <ow>-lvl agent = <ow>-agent view_name = <ow>-view_name.
      IF sy-subrc = 0.
        IF <ow>-active <> <nw>-active OR <ow>-read_only <> <nw>-read_only.
          log_view( EXPORTING is_old = <ow> is_new = <nw> iv_reason = 'View is Changed' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_lvl = et_lvl ).
        ENDIF.
      ELSE.
        APPEND <ow> TO lt_olduns.
      ENDIF.
    ENDLOOP.
    LOOP AT is_new-lvl ASSIGNING <nw>.
      IF NOT line_exists( is_old-lvl[ lvl = <nw>-lvl agent = <nw>-agent view_name = <nw>-view_name ] ).
        APPEND <nw> TO lt_newuns.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_olduns ASSIGNING <ow>.
      READ TABLE lt_newuns ASSIGNING <nw> WITH KEY lvl = <ow>-lvl view_name = <ow>-view_name.
      IF sy-subrc = 0.
        log_view( EXPORTING is_old = <ow> is_new = <nw> iv_reason = 'View is Changed' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_lvl = et_lvl ).
        DELETE lt_newuns INDEX sy-tabix.
      ELSE.
        log_view( EXPORTING is_old = <ow> is_new = VALUE #( ) iv_reason = 'View is Deleted' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_lvl = et_lvl ).
      ENDIF.
    ENDLOOP.
    LOOP AT lt_newuns ASSIGNING <nw>.
      log_view( EXPORTING is_old = VALUE #( ) is_new = <nw> iv_reason = 'View is Added' iv_ctx = lv_ctx is_key = is_key iv_transid = iv_transid CHANGING ct_lvl = et_lvl ).
    ENDLOOP.
  ENDMETHOD.

  METHOD persist.
    DATA(ls_k) = is_key.
    DELETE FROM /inowits/wf_def WHERE app_id = @ls_k-app_id AND gen_type = @ls_k-gen_type AND gen_field = @ls_k-gen_field
      AND gen_field2 = @ls_k-gen_field2 AND gen_field3 = @ls_k-gen_field3 AND gen_field4 = @ls_k-gen_field4.
    DELETE FROM /inowits/wf_role WHERE app_id = @ls_k-app_id AND gen_type = @ls_k-gen_type AND gen_field = @ls_k-gen_field
      AND gen_field2 = @ls_k-gen_field2 AND gen_field3 = @ls_k-gen_field3 AND gen_field4 = @ls_k-gen_field4.
    DELETE FROM /inowits/wf_lvl WHERE app_id = @ls_k-app_id AND gen_type = @ls_k-gen_type AND gen_field = @ls_k-gen_field
      AND gen_field2 = @ls_k-gen_field2 AND gen_field3 = @ls_k-gen_field3 AND gen_field4 = @ls_k-gen_field4.
    IF iv_delete_only = abap_false.
      IF is_raw-def IS NOT INITIAL.
        MODIFY /inowits/wf_def FROM TABLE @is_raw-def.
        IF sy-subrc <> 0.
          rv_err = 'Writing the level definitions failed'.
        ENDIF.
      ENDIF.
      IF is_raw-role IS NOT INITIAL AND rv_err IS INITIAL.
        MODIFY /inowits/wf_role FROM TABLE @is_raw-role.
        IF sy-subrc <> 0.
          rv_err = 'Writing the agent assignment failed'.
        ENDIF.
      ENDIF.
      IF is_raw-lvl IS NOT INITIAL AND rv_err IS INITIAL.
        MODIFY /inowits/wf_lvl FROM TABLE @is_raw-lvl.
        IF sy-subrc <> 0.
          rv_err = 'Writing the view visibility failed'.
        ENDIF.
      ENDIF.
    ENDIF.
    IF it_rol IS NOT INITIAL AND rv_err IS INITIAL.
      MODIFY /inowits/rol_log FROM TABLE @it_rol.
      IF sy-subrc <> 0.
        rv_err = 'Writing the change log failed'.
      ENDIF.
    ENDIF.
    IF it_lvl IS NOT INITIAL AND rv_err IS INITIAL.
      MODIFY /inowits/lvl_log FROM TABLE @it_lvl.
      IF sy-subrc <> 0.
        rv_err = 'Writing the view change log failed'.
      ENDIF.
    ENDIF.
    IF rv_err IS NOT INITIAL.
      ROLLBACK WORK.
    ELSEIF iv_no_commit = abap_false.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.


  METHOD op_meta.
    TYPES: BEGIN OF ty_meta,
             apps         TYPE ty_cfgs,
             level_texts  TYPE ty_items,
             departments  TYPE ty_items,
             pir_types    TYPE ty_items,
             wf_cons      TYPE STANDARD TABLE OF /inowits/wf_cons WITH DEFAULT KEY,
             today        TYPE string,
             actor        TYPE string,
             sap_user     TYPE string,
           END OF ty_meta.
    DATA ls_meta TYPE ty_meta.
    ls_meta-apps        = app_list( ).
    ls_meta-level_texts = domain_values( '/INOWITS/LEVEL_TEXT' ).
    ls_meta-departments = domain_values( '/INOWITS/DEPT_DM' ).
    ls_meta-pir_types   = domain_values( '/INOWITS/PIR_WF_TYPE' ).
    SELECT * FROM /inowits/wf_cons ORDER BY mtart INTO TABLE @ls_meta-wf_cons.
    ls_meta-today = gv_today.
    ls_meta-actor = gv_actor.
    ls_meta-sap_user = gv_user.
    rv_json = ok( ls_meta ).
  ENDMETHOD.

  METHOD op_search.
    DATA(ls_k) = req_key( ).
    IF ls_k-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    DATA lr_gt TYPE RANGE OF /inowits/wf_gen_type.
    DATA lr_g1 TYPE RANGE OF /inowits/wf_gen_field.
    DATA lr_g2 TYPE RANGE OF /inowits/wf_gen_field2.
    DATA lr_g3 TYPE RANGE OF /inowits/wf_gen_field3.
    DATA lr_g4 TYPE RANGE OF /inowits/wf_gen_field4.
    pat_range( EXPORTING iv_val = ls_k-gen_type   CHANGING ct_range = lr_gt ).
    pat_range( EXPORTING iv_val = ls_k-gen_field  CHANGING ct_range = lr_g1 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field2 CHANGING ct_range = lr_g2 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field3 CHANGING ct_range = lr_g3 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field4 CHANGING ct_range = lr_g4 ).
    DATA(lv_app) = CONV /inowits/wf_app_id( ls_k-app_id ).
    SELECT gen_type, gen_field, gen_field2, gen_field3, gen_field4, type_lvl, lvl, max_role, active FROM /inowits/wf_def
      WHERE app_id = @lv_app AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND gen_field3 IN @lr_g3 AND gen_field4 IN @lr_g4
      INTO TABLE @DATA(lt_def).
    SELECT gen_type, gen_field, gen_field2, gen_field3, gen_field4, lvl, is_appr, active, end_date FROM /inowits/wf_role
      WHERE app_id = @lv_app AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND gen_field3 IN @lr_g3 AND gen_field4 IN @lr_g4
      INTO TABLE @DATA(lt_role).
    SELECT DISTINCT gen_type, gen_field, gen_field2, gen_field3, gen_field4 FROM /inowits/wf_lvl
      WHERE app_id = @lv_app AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND gen_field3 IN @lr_g3 AND gen_field4 IN @lr_g4 AND lvl = 'L0'
      INTO TABLE @DATA(lt_l0).
    TYPES: BEGIN OF ty_k5, gen_type TYPE /inowits/wf_gen_type, gen_field TYPE /inowits/wf_gen_field, gen_field2 TYPE /inowits/wf_gen_field2,
             gen_field3 TYPE /inowits/wf_gen_field3, gen_field4 TYPE /inowits/wf_gen_field4, END OF ty_k5.
    DATA lt_keys TYPE STANDARD TABLE OF ty_k5 WITH DEFAULT KEY.
    LOOP AT lt_def  ASSIGNING FIELD-SYMBOL(<d>). APPEND CORRESPONDING #( <d> ) TO lt_keys. ENDLOOP.
    LOOP AT lt_role ASSIGNING FIELD-SYMBOL(<r>). APPEND CORRESPONDING #( <r> ) TO lt_keys. ENDLOOP.
    LOOP AT lt_l0   ASSIGNING FIELD-SYMBOL(<w>). APPEND CORRESPONDING #( <w> ) TO lt_keys. ENDLOOP.
    SORT lt_keys BY gen_type gen_field gen_field2 gen_field3 gen_field4.
    DELETE ADJACENT DUPLICATES FROM lt_keys COMPARING ALL FIELDS.
    DATA(ls_cfg) = app_cfg( ls_k-app_id ).
    DATA lt_out TYPE ty_sumrows.
    DATA(lv_trunc) = abap_false.
    LOOP AT lt_keys ASSIGNING FIELD-SYMBOL(<k>).
      IF lines( lt_out ) >= 3000.
        lv_trunc = abap_true.
        EXIT.
      ENDIF.
      DATA(ls_s) = VALUE ty_sumrow( app_id = ls_k-app_id gen_type = condense( CONV string( <k>-gen_type ) ) gen_field = condense( CONV string( <k>-gen_field ) )
        gen_field2 = condense( CONV string( <k>-gen_field2 ) ) gen_field3 = condense( CONV string( <k>-gen_field3 ) ) gen_field4 = condense( CONV string( <k>-gen_field4 ) ) ).
      DATA(lv_exp) = abap_false.
      DATA(lv_noagent) = ||.
      DATA(lv_stale) = ||.
      LOOP AT lt_def ASSIGNING <d> WHERE gen_type = <k>-gen_type AND gen_field = <k>-gen_field AND gen_field2 = <k>-gen_field2
                                      AND gen_field3 = <k>-gen_field3 AND gen_field4 = <k>-gen_field4.
        ls_s-level_count = ls_s-level_count + 1.
        IF <d>-active = 'X'.
          IF <d>-type_lvl = 'R'. ls_s-reviewer_levels = ls_s-reviewer_levels + 1. ENDIF.
          IF <d>-type_lvl = 'A'. ls_s-approver_levels = ls_s-approver_levels + 1. ENDIF.
          DATA(lv_c) = 0.
          LOOP AT lt_role ASSIGNING <r> WHERE gen_type = <k>-gen_type AND gen_field = <k>-gen_field AND gen_field2 = <k>-gen_field2
                                           AND gen_field3 = <k>-gen_field3 AND gen_field4 = <k>-gen_field4 AND lvl = <d>-lvl
                                           AND is_appr = 'X' AND active = 'X' AND end_date >= sy-datum.
            lv_c = lv_c + 1.
          ENDLOOP.
          ls_s-counted_agents = ls_s-counted_agents + lv_c.
          IF lv_c = 0.
            lv_noagent = |{ lv_noagent } { <d>-lvl }|.
          ENDIF.
          IF lv_c <> <d>-max_role.
            lv_stale = |{ lv_stale } { <d>-lvl }|.
          ENDIF.
        ENDIF.
      ENDLOOP.
      LOOP AT lt_role ASSIGNING <r> WHERE gen_type = <k>-gen_type AND gen_field = <k>-gen_field AND gen_field2 = <k>-gen_field2
                                       AND gen_field3 = <k>-gen_field3 AND gen_field4 = <k>-gen_field4 AND active = 'X' AND end_date < sy-datum.
        lv_exp = abap_true.
        EXIT.
      ENDLOOP.
      IF ls_s-level_count = 0.
        APPEND 'No level definition (only agents or views exist)' TO ls_s-issues.
      ENDIF.
      IF ls_s-level_count > 0 AND ls_s-approver_levels = 0.
        APPEND 'No active Approver level' TO ls_s-issues.
      ENDIF.
      IF lv_noagent IS NOT INITIAL.
        APPEND |No active approver in level{ lv_noagent }| TO ls_s-issues.
      ENDIF.
      IF lv_exp = abap_true.
        APPEND 'Agent with an end date in the past' TO ls_s-issues.
      ENDIF.
      IF lv_stale IS NOT INITIAL.
        APPEND |Approver counter out of date in level{ lv_stale }| TO ls_s-issues.
      ENDIF.
      IF ls_cfg-l0_required = abap_true AND ls_cfg-views_enabled = abap_true.
        READ TABLE lt_l0 TRANSPORTING NO FIELDS WITH KEY gen_type = <k>-gen_type gen_field = <k>-gen_field gen_field2 = <k>-gen_field2
                                                          gen_field3 = <k>-gen_field3 gen_field4 = <k>-gen_field4.
        IF sy-subrc <> 0.
          APPEND 'No initiator views' TO ls_s-issues.
        ENDIF.
      ENDIF.
      APPEND ls_s TO lt_out.
    ENDLOOP.
    TYPES: BEGIN OF ty_res, cfg TYPE ty_cfg, groups TYPE ty_sumrows, total TYPE i, truncated TYPE abap_bool, END OF ty_res.
    rv_json = ok( VALUE ty_res( cfg = ls_cfg groups = lt_out total = lines( lt_out ) truncated = lv_trunc ) ).
  ENDMETHOD.

  METHOD op_get_group.
    DATA(ls_k) = req_key( ).
    IF ls_k-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    DATA(ls_dk) = gkey_to_dkey( ls_k ).
    DATA(ls_raw) = read_raw( ls_dk ).
    IF ls_raw-def IS INITIAL AND ls_raw-role IS INITIAL AND ls_raw-lvl IS INITIAL.
      rv_json = fail( iv_text = |No workflow definition exists for { key_text( ls_k ) }| iv_code = 'NOT_FOUND' ).
      RETURN.
    ENDIF.
    DATA(ls_g) = raw_to_group( is_key = ls_dk is_raw = ls_raw ).
    enrich_group( CHANGING cs_group = ls_g ).
    TYPES: BEGIN OF ty_res, group TYPE ty_group, version TYPE string, issues TYPE ty_msgs, cfg TYPE ty_cfg, open_requests TYPE i, END OF ty_res.
    DATA(ls_res) = VALUE ty_res( group = ls_g version = version_of( ls_raw ) cfg = app_cfg( ls_k-app_id ) open_requests = open_requests( ls_dk ) ).
    ls_res-issues = group_issues( ls_g ).
    rv_json = ok( ls_res ).
  ENDMETHOD.

  METHOD op_validate.
    DATA(ls_g) = gs_req-group.
    normalize( CHANGING cs_group = ls_g ).
    enrich_group( CHANGING cs_group = ls_g ).
    DATA lt_m TYPE ty_msgs.
    validate( EXPORTING iv_mode = COND #( WHEN gs_req-mode IS INITIAL THEN 'update' ELSE gs_req-mode ) CHANGING cs_group = ls_g ct_msgs = lt_m ).
    TYPES: BEGIN OF ty_res, valid TYPE abap_bool, messages TYPE ty_msgs, group TYPE ty_group, END OF ty_res.
    rv_json = ok( VALUE ty_res( valid = xsdbool( has_error( lt_m ) = abap_false ) messages = lt_m group = ls_g ) ).
  ENDMETHOD.


  METHOD op_save.
    DATA(ls_g) = gs_req-group.
    normalize( CHANGING cs_group = ls_g ).
    DATA(lv_mode) = COND string( WHEN gs_req-mode = 'create' THEN 'create' ELSE 'update' ).
    IF ls_g-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    IF lock_app( ls_g-app_id ) = abap_false.
      rv_json = fail( iv_text = |Another administrator is saving the workflow of application { ls_g-app_id } right now. Try again in a moment.| iv_code = 'LOCKED' ).
      RETURN.
    ENDIF.
    DATA(ls_dk) = gkey_to_dkey( CORRESPONDING #( ls_g ) ).
    DATA(ls_old) = read_raw( ls_dk ).
    IF lv_mode = 'update'.
      IF ls_old-def IS INITIAL AND ls_old-role IS INITIAL AND ls_old-lvl IS INITIAL.
        rv_json = fail( iv_text = |{ key_text( CORRESPONDING #( ls_g ) ) } does not exist. Create it first.| iv_code = 'NOT_FOUND' ).
        RETURN.
      ENDIF.
      IF gs_req-version IS INITIAL.
        rv_json = fail( iv_text = 'The version of the loaded data is missing: reload the combination and try again' iv_code = 'NO_VERSION' ).
        RETURN.
      ENDIF.
      IF gs_req-version <> version_of( ls_old ).
        rv_json = fail( iv_text = 'This combination was changed by someone else after you opened it. Reload it to see their change, then apply yours again.' iv_code = 'STALE' ).
        RETURN.
      ENDIF.
    ENDIF.
    enrich_group( CHANGING cs_group = ls_g ).
    DATA lt_m TYPE ty_msgs.
    validate( EXPORTING iv_mode = lv_mode CHANGING cs_group = ls_g ct_msgs = lt_m ).
    IF has_error( lt_m ) = abap_true.
      rv_json = fail_msgs( lt_m ).
      RETURN.
    ENDIF.
    DATA(ls_new) = group_to_raw( is_group = ls_g is_old = ls_old ).
    DATA(lv_tid) = new_transid( ls_g-app_id ).
    IF lv_tid IS INITIAL.
      rv_json = fail( iv_text = 'Could not reserve a log number, please try again' iv_code = 'TRANSID' ).
      RETURN.
    ENDIF.
    DATA lt_rol TYPE ty_rol_t.
    DATA lt_lvl TYPE ty_lvl_t.
    build_logs( EXPORTING is_old = ls_old is_new = ls_new is_key = ls_dk iv_transid = lv_tid
                IMPORTING et_rol = lt_rol et_lvl = lt_lvl ).
    DATA(lv_err) = persist( is_key = ls_dk is_raw = ls_new it_rol = lt_rol it_lvl = lt_lvl ).
    IF lv_err IS NOT INITIAL.
      rv_json = fail( iv_text = lv_err iv_code = 'WRITE_FAILED' ).
      RETURN.
    ENDIF.
    DATA(ls_back) = raw_to_group( is_key = ls_dk is_raw = read_raw( ls_dk ) ).
    enrich_group( CHANGING cs_group = ls_back ).
    TYPES: BEGIN OF ty_res, group TYPE ty_group, version TYPE string, messages TYPE ty_msgs, trans_id TYPE string, log_rows TYPE i, view_log_rows TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( group = ls_back version = version_of( read_raw( ls_dk ) ) messages = lt_m trans_id = |{ lv_tid }|
                                log_rows = lines( lt_rol ) view_log_rows = lines( lt_lvl ) ) ).
  ENDMETHOD.

  METHOD op_delete.
    DATA(ls_k) = req_key( ).
    IF ls_k-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    IF lock_app( ls_k-app_id ) = abap_false.
      rv_json = fail( iv_text = |Another administrator is saving the workflow of application { ls_k-app_id } right now. Try again in a moment.| iv_code = 'LOCKED' ).
      RETURN.
    ENDIF.
    DATA(ls_dk) = gkey_to_dkey( ls_k ).
    DATA(ls_old) = read_raw( ls_dk ).
    IF ls_old-def IS INITIAL AND ls_old-role IS INITIAL AND ls_old-lvl IS INITIAL.
      rv_json = fail( iv_text = |{ key_text( ls_k ) } does not exist| iv_code = 'NOT_FOUND' ).
      RETURN.
    ENDIF.
    DATA(lv_open) = open_requests( ls_dk ).
    IF lv_open > 0 AND gs_req-force <> abap_true.
      rv_json = fail( iv_text = |{ lv_open } request(s) of this combination are still running. Re-submit and send-back re-read this workflow, so deleting it can break them. Delete anyway only after checking them.| iv_code = 'OPEN_REQUESTS' ).
      RETURN.
    ENDIF.
    DATA(lv_tid) = new_transid( ls_k-app_id ).
    IF lv_tid IS INITIAL.
      rv_json = fail( iv_text = 'Could not reserve a log number, please try again' iv_code = 'TRANSID' ).
      RETURN.
    ENDIF.
    DATA lt_rol TYPE ty_rol_t.
    DATA lt_lvl TYPE ty_lvl_t.
    build_logs( EXPORTING is_old = ls_old is_new = VALUE #( ) is_key = ls_dk iv_transid = lv_tid iv_note = 'group deleted'
                IMPORTING et_rol = lt_rol et_lvl = lt_lvl ).
    DATA(lv_err) = persist( is_key = ls_dk is_raw = VALUE #( ) it_rol = lt_rol it_lvl = lt_lvl iv_delete_only = abap_true ).
    IF lv_err IS NOT INITIAL.
      rv_json = fail( iv_text = lv_err iv_code = 'WRITE_FAILED' ).
      RETURN.
    ENDIF.
    TYPES: BEGIN OF ty_res, deleted TYPE ty_gkey, trans_id TYPE string, levels TYPE i, agents TYPE i, views TYPE i, open_requests TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( deleted = ls_k trans_id = |{ lv_tid }| levels = lines( ls_old-def ) agents = lines( ls_old-role ) views = lines( ls_old-lvl ) open_requests = lv_open ) ).
  ENDMETHOD.

  METHOD op_copy.
    DATA(ls_s) = gs_req-source.
    DATA(ls_t) = gs_req-target.
    norm_key( CHANGING cs_key = ls_s ).
    norm_key( CHANGING cs_key = ls_t ).
    IF ls_s-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Select any record in General data table for copy the details' iv_code = 'SOURCE' ).
      RETURN.
    ENDIF.
    ls_t-app_id = ls_s-app_id.
    IF ls_t-gen_type IS INITIAL AND ls_t-gen_field IS INITIAL AND ls_t-gen_field2 IS INITIAL AND ls_t-gen_field3 IS INITIAL AND ls_t-gen_field4 IS INITIAL.
      rv_json = fail( iv_text = 'Enter any value to copy' iv_code = 'TARGET' ).
      RETURN.
    ENDIF.
    IF ls_s = ls_t.
      rv_json = fail( iv_text = 'The target is the same combination as the source' iv_code = 'TARGET' ).
      RETURN.
    ENDIF.
    IF lock_app( ls_s-app_id ) = abap_false.
      rv_json = fail( iv_text = |Another administrator is saving the workflow of application { ls_s-app_id } right now. Try again in a moment.| iv_code = 'LOCKED' ).
      RETURN.
    ENDIF.
    DATA(ls_sk) = gkey_to_dkey( ls_s ).
    DATA(ls_tk) = gkey_to_dkey( ls_t ).
    DATA(ls_src) = read_raw( ls_sk ).
    IF ls_src-def IS INITIAL.
      rv_json = fail( iv_text = |Source { key_text( ls_s ) } has no level definition to copy| iv_code = 'NOT_FOUND' ).
      RETURN.
    ENDIF.
    DATA(ls_tgt_old) = read_raw( ls_tk ).
    IF ( ls_tgt_old-def IS NOT INITIAL OR ls_tgt_old-role IS NOT INITIAL OR ls_tgt_old-lvl IS NOT INITIAL ) AND gs_req-overwrite <> abap_true.
      rv_json = fail( iv_text = 'Entered values are already exist' iv_code = 'EXISTS' ).
      RETURN.
    ENDIF.
    DATA(ls_g) = raw_to_group( is_key = ls_sk is_raw = ls_src ).
    MOVE-CORRESPONDING ls_t TO ls_g.
    "agents start today (the start date is part of the key; the engine only looks at active and end date), end dates stay
    LOOP AT ls_g-levels ASSIGNING FIELD-SYMBOL(<l>).
      LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
        <a>-start_date = gv_today.
      ENDLOOP.
      SORT <l>-agents BY role start_date active DESCENDING end_date DESCENDING.
      DELETE ADJACENT DUPLICATES FROM <l>-agents COMPARING role start_date.
    ENDLOOP.
    normalize( CHANGING cs_group = ls_g ).
    enrich_group( CHANGING cs_group = ls_g ).
    DATA lt_m TYPE ty_msgs.
    validate( EXPORTING iv_mode = 'copy' CHANGING cs_group = ls_g ct_msgs = lt_m ).
    DATA(ls_new) = group_to_raw( is_group = ls_g is_old = ls_tgt_old ).
    DATA(lv_tid) = new_transid( ls_t-app_id ).
    IF lv_tid IS INITIAL.
      rv_json = fail( iv_text = 'Could not reserve a log number, please try again' iv_code = 'TRANSID' ).
      RETURN.
    ENDIF.
    DATA lt_rol TYPE ty_rol_t.
    DATA lt_lvl TYPE ty_lvl_t.
    build_logs( EXPORTING is_old = ls_tgt_old is_new = ls_new is_key = ls_tk iv_transid = lv_tid iv_note = |copied from { key_text( ls_s ) }|
                IMPORTING et_rol = lt_rol et_lvl = lt_lvl ).
    DATA(lv_err) = persist( is_key = ls_tk is_raw = ls_new it_rol = lt_rol it_lvl = lt_lvl ).
    IF lv_err IS NOT INITIAL.
      rv_json = fail( iv_text = lv_err iv_code = 'WRITE_FAILED' ).
      RETURN.
    ENDIF.
    TYPES: BEGIN OF ty_res, target TYPE ty_gkey, trans_id TYPE string, levels TYPE i, agents TYPE i, views TYPE i, messages TYPE ty_msgs, END OF ty_res.
    rv_json = ok( VALUE ty_res( target = ls_t trans_id = |{ lv_tid }| levels = lines( ls_new-def ) agents = lines( ls_new-role ) views = lines( ls_new-lvl ) messages = lt_m ) ).
  ENDMETHOD.

  METHOD op_copy_type.
    DATA(lv_app) = condense( to_upper( gs_req-app_id ) ).
    DATA(lv_old) = condense( to_upper( gs_req-old_type ) ).
    DATA(lv_new) = condense( to_upper( gs_req-new_type ) ).
    IF lv_app IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    IF lv_old IS INITIAL.
      rv_json = fail( iv_text = 'Enter any Existing value' iv_code = 'OLD_TYPE' ).
      RETURN.
    ENDIF.
    IF lv_new IS INITIAL.
      rv_json = fail( iv_text = 'Enter new value for copy' iv_code = 'NEW_TYPE' ).
      RETURN.
    ENDIF.
    IF strlen( lv_new ) > 15.
      rv_json = fail( iv_text = 'The new value is too long (maximum 15 characters)' iv_code = 'NEW_TYPE' ).
      RETURN.
    ENDIF.
    IF lock_app( lv_app ) = abap_false.
      rv_json = fail( iv_text = |Another administrator is saving the workflow of application { lv_app } right now. Try again in a moment.| iv_code = 'LOCKED' ).
      RETURN.
    ENDIF.
    DATA(lv_a) = CONV /inowits/wf_app_id( lv_app ).
    DATA(lv_ot) = CONV /inowits/wf_gen_type( lv_old ).
    DATA(lv_nt) = CONV /inowits/wf_gen_type( lv_new ).
    SELECT DISTINCT app_id, gen_type, gen_field, gen_field2, gen_field3, gen_field4 FROM /inowits/wf_def
      WHERE app_id = @lv_a AND gen_type = @lv_ot ORDER BY gen_field, gen_field2, gen_field3, gen_field4 INTO TABLE @DATA(lt_src).
    IF lt_src IS INITIAL.
      rv_json = fail( iv_text = 'This value is not found' iv_code = 'NOT_FOUND' ).
      RETURN.
    ENDIF.
    SELECT SINGLE app_id FROM /inowits/wf_def WHERE app_id = @lv_a AND gen_type = @lv_nt INTO @DATA(lv_x).
    IF sy-subrc = 0.
      rv_json = fail( iv_text = 'This value already exist' iv_code = 'EXISTS' ).
      RETURN.
    ENDIF.
    SELECT SINGLE app_id FROM /inowits/wf_role WHERE app_id = @lv_a AND gen_type = @lv_nt INTO @lv_x.
    IF sy-subrc = 0.
      rv_json = fail( iv_text = 'This value already exist' iv_code = 'EXISTS' ).
      RETURN.
    ENDIF.
    TYPES: BEGIN OF ty_one, source TYPE ty_gkey, target TYPE ty_gkey, trans_id TYPE string, levels TYPE i, agents TYPE i, views TYPE i, END OF ty_one.
    DATA lt_done TYPE STANDARD TABLE OF ty_one WITH DEFAULT KEY.
    DATA lt_rol TYPE ty_rol_t.
    DATA lt_lvl TYPE ty_lvl_t.
    LOOP AT lt_src ASSIGNING FIELD-SYMBOL(<s>).
      DATA(ls_sk) = VALUE ty_dkey( app_id = <s>-app_id gen_type = <s>-gen_type gen_field = <s>-gen_field gen_field2 = <s>-gen_field2
                                   gen_field3 = <s>-gen_field3 gen_field4 = <s>-gen_field4 ).
      DATA(ls_tk) = ls_sk.
      ls_tk-gen_type = lv_nt.
      DATA(ls_src) = read_raw( ls_sk ).
      DATA(ls_g) = raw_to_group( is_key = ls_sk is_raw = ls_src ).
      ls_g-gen_type = lv_new.
      LOOP AT ls_g-levels ASSIGNING FIELD-SYMBOL(<l>).
        LOOP AT <l>-agents ASSIGNING FIELD-SYMBOL(<a>).
          <a>-start_date = gv_today.
        ENDLOOP.
        SORT <l>-agents BY role start_date active DESCENDING end_date DESCENDING.
        DELETE ADJACENT DUPLICATES FROM <l>-agents COMPARING role start_date.
      ENDLOOP.
      normalize( CHANGING cs_group = ls_g ).
      enrich_group( CHANGING cs_group = ls_g ).
      DATA(ls_new) = group_to_raw( is_group = ls_g is_old = VALUE #( ) ).
      DATA(lv_tid) = new_transid( lv_app ).
      IF lv_tid IS INITIAL.
        ROLLBACK WORK.
        rv_json = fail( iv_text = 'Could not reserve a log number, nothing was copied' iv_code = 'TRANSID' ).
        RETURN.
      ENDIF.
      build_logs( EXPORTING is_old = VALUE #( ) is_new = ls_new is_key = ls_tk iv_transid = lv_tid iv_note = |copied from { lv_old }|
                  IMPORTING et_rol = lt_rol et_lvl = lt_lvl ).
      DATA(lv_err) = persist( is_key = ls_tk is_raw = ls_new it_rol = lt_rol it_lvl = lt_lvl iv_no_commit = abap_true ).
      IF lv_err IS NOT INITIAL.
        rv_json = fail( iv_text = |{ lv_err } (nothing was copied)| iv_code = 'WRITE_FAILED' ).
        RETURN.
      ENDIF.
      APPEND VALUE ty_one( source = dkey_to_gkey( ls_sk ) target = dkey_to_gkey( ls_tk ) trans_id = |{ lv_tid }|
                           levels = lines( ls_new-def ) agents = lines( ls_new-role ) views = lines( ls_new-lvl ) ) TO lt_done.
    ENDLOOP.
    COMMIT WORK AND WAIT.
    TYPES: BEGIN OF ty_res, copied TYPE STANDARD TABLE OF ty_one WITH DEFAULT KEY, count TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( copied = lt_done count = lines( lt_done ) ) ).
  ENDMETHOD.


  METHOD op_mass_agent.
    DATA(lv_app) = condense( to_upper( gs_req-app_id ) ).
    DATA(lv_old) = condense( to_upper( gs_req-old_agent ) ).
    DATA(lv_new) = condense( to_upper( gs_req-new_agent ) ).
    IF lv_app IS INITIAL.
      rv_json = fail( iv_text = 'Select Application ID' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    IF lv_new IS INITIAL.
      rv_json = fail( iv_text = 'Enter new Agent' iv_code = 'NEW_AGENT' ).
      RETURN.
    ENDIF.
    IF lv_old IS INITIAL.
      rv_json = fail( iv_text = 'Enter old agent' iv_code = 'OLD_AGENT' ).
      RETURN.
    ENDIF.
    IF lv_old = lv_new.
      rv_json = fail( iv_text = 'Old and new agent should not be same' iv_code = 'SAME_AGENT' ).
      RETURN.
    ENDIF.
    DATA(lt_users) = load_users( VALUE #( ( lv_new ) ) ).
    IF lt_users IS INITIAL.
      rv_json = fail( iv_text = 'Enter valid agent: the new agent is not a SAP user' iv_code = 'NEW_AGENT' ).
      RETURN.
    ENDIF.
    DATA(ls_nu) = lt_users[ 1 ].
    DATA lt_m TYPE ty_msgs.
    IF ls_nu-locked = abap_true.
      add_msg( EXPORTING iv_sev = 'W' iv_code = 'AGENT_LOCKED' iv_text = |User { lv_new } is locked or expired in SAP| CHANGING ct_msgs = lt_m ).
    ENDIF.
    DATA(ls_k) = req_key( ).
    DATA lr_gt TYPE RANGE OF /inowits/wf_gen_type.
    DATA lr_g1 TYPE RANGE OF /inowits/wf_gen_field.
    DATA lr_g2 TYPE RANGE OF /inowits/wf_gen_field2.
    DATA lr_g3 TYPE RANGE OF /inowits/wf_gen_field3.
    DATA lr_g4 TYPE RANGE OF /inowits/wf_gen_field4.
    pat_range( EXPORTING iv_val = ls_k-gen_type   CHANGING ct_range = lr_gt ).
    pat_range( EXPORTING iv_val = ls_k-gen_field  CHANGING ct_range = lr_g1 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field2 CHANGING ct_range = lr_g2 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field3 CHANGING ct_range = lr_g3 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field4 CHANGING ct_range = lr_g4 ).
    DATA(lv_a) = CONV /inowits/wf_app_id( lv_app ).
    DATA(lv_o) = CONV /inowits/wf_agent( lv_old ).
    SELECT * FROM /inowits/wf_role
      WHERE app_id = @lv_a AND agent = @lv_o AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND gen_field3 IN @lr_g3 AND gen_field4 IN @lr_g4
      INTO TABLE @DATA(lt_hit).
    IF gs_req-include_inactive <> abap_true.
      DELETE lt_hit WHERE active <> 'X' OR end_date < sy-datum.
    ENDIF.
    IF lt_hit IS INITIAL.
      rv_json = fail( iv_text = |Agent update failed: { lv_old } has no { COND string( WHEN gs_req-include_inactive = abap_true THEN `` ELSE `active ` ) }assignment in application { lv_app } for this selection| iv_code = 'NOTHING' ).
      RETURN.
    ENDIF.
    IF gs_req-dry_run <> abap_true.
      IF lock_app( lv_app ) = abap_false.
        rv_json = fail( iv_text = |Another administrator is saving the workflow of application { lv_app } right now. Try again in a moment.| iv_code = 'LOCKED' ).
        RETURN.
      ENDIF.
    ENDIF.
    SORT lt_hit BY gen_type gen_field gen_field2 gen_field3 gen_field4.
    DATA lt_keys TYPE ty_dkeys.
    LOOP AT lt_hit ASSIGNING FIELD-SYMBOL(<h>).
      APPEND VALUE ty_dkey( app_id = <h>-app_id gen_type = <h>-gen_type gen_field = <h>-gen_field gen_field2 = <h>-gen_field2
                            gen_field3 = <h>-gen_field3 gen_field4 = <h>-gen_field4 ) TO lt_keys.
    ENDLOOP.
    DELETE ADJACENT DUPLICATES FROM lt_keys COMPARING ALL FIELDS.
    TYPES: BEGIN OF ty_one, key TYPE ty_gkey, role_rows TYPE i, view_rows TYPE i, skipped TYPE abap_bool, reason TYPE string, trans_id TYPE string, END OF ty_one.
    DATA lt_res TYPE STANDARD TABLE OF ty_one WITH DEFAULT KEY.
    DATA(lv_roles) = 0.
    DATA(lv_views) = 0.
    LOOP AT lt_keys ASSIGNING FIELD-SYMBOL(<k>).
      DATA(ls_old) = read_raw( <k> ).
      DATA(ls_new) = ls_old.
      DATA(ls_one) = VALUE ty_one( key = dkey_to_gkey( <k> ) ).
      DATA lt_lvls TYPE ty_strs.
      CLEAR lt_lvls.
      DATA(lv_skip) = ||.
      LOOP AT ls_new-role ASSIGNING FIELD-SYMBOL(<r>) WHERE agent = lv_o.
        IF gs_req-include_inactive <> abap_true AND ( <r>-active <> 'X' OR <r>-end_date < sy-datum ).
          CONTINUE.
        ENDIF.
        LOOP AT ls_new-role TRANSPORTING NO FIELDS WHERE lvl = <r>-lvl AND agent = lv_new AND active = 'X' AND end_date >= sy-datum.
          lv_skip = |{ lv_new } is already an active agent of level { <r>-lvl }|.
          EXIT.
        ENDLOOP.
        IF lv_skip IS NOT INITIAL.
          EXIT.
        ENDIF.
        <r>-agent = lv_new.
        <r>-name = ls_nu-name.
        <r>-changed_on = sy-datum.
        <r>-changed_by = gv_user.
        ls_one-role_rows = ls_one-role_rows + 1.
        APPEND CONV string( <r>-lvl ) TO lt_lvls.
      ENDLOOP.
      IF lv_skip IS NOT INITIAL.
        ls_one-skipped = abap_true.
        ls_one-reason = lv_skip.
        ls_one-role_rows = 0.
        APPEND ls_one TO lt_res.
        CONTINUE.
      ENDIF.
      "views of a parallel level belong to the agent: AGENT is a key column, so the row is rewritten (the group is replaced as a whole)
      LOOP AT ls_new-lvl ASSIGNING FIELD-SYMBOL(<w>) WHERE agent = lv_o.
        IF NOT line_exists( lt_lvls[ table_line = CONV string( <w>-lvl ) ] ).
          CONTINUE.
        ENDIF.
        <w>-agent = lv_new.
        <w>-changed_on = sy-datum.
        <w>-changed_by = gv_user.
        ls_one-view_rows = ls_one-view_rows + 1.
      ENDLOOP.
      SORT ls_new-lvl BY lvl agent view_name.
      DELETE ADJACENT DUPLICATES FROM ls_new-lvl COMPARING lvl agent view_name.
      lv_roles = lv_roles + ls_one-role_rows.
      lv_views = lv_views + ls_one-view_rows.
      IF gs_req-dry_run <> abap_true.
        DATA(lv_tid) = new_transid( lv_app ).
        IF lv_tid IS INITIAL.
          ROLLBACK WORK.
          rv_json = fail( iv_text = 'Could not reserve a log number, nothing was changed' iv_code = 'TRANSID' ).
          RETURN.
        ENDIF.
        DATA lt_rol TYPE ty_rol_t.
        DATA lt_lvl TYPE ty_lvl_t.
        build_logs( EXPORTING is_old = ls_old is_new = ls_new is_key = <k> iv_transid = lv_tid iv_note = |mass agent change { lv_old }->{ lv_new }|
                    IMPORTING et_rol = lt_rol et_lvl = lt_lvl ).
        DATA(lv_err) = persist( is_key = <k> is_raw = ls_new it_rol = lt_rol it_lvl = lt_lvl iv_no_commit = abap_true ).
        IF lv_err IS NOT INITIAL.
          rv_json = fail( iv_text = |{ lv_err }. Agent update failed, nothing was changed| iv_code = 'WRITE_FAILED' ).
          RETURN.
        ENDIF.
        ls_one-trans_id = |{ lv_tid }|.
      ENDIF.
      APPEND ls_one TO lt_res.
    ENDLOOP.
    IF gs_req-dry_run <> abap_true.
      COMMIT WORK AND WAIT.
    ENDIF.
    TYPES: BEGIN OF ty_out, dry_run TYPE abap_bool, groups TYPE STANDARD TABLE OF ty_one WITH DEFAULT KEY, changed_groups TYPE i, skipped_groups TYPE i,
             role_rows TYPE i, view_rows TYPE i, messages TYPE ty_msgs, note TYPE string, END OF ty_out.
    DATA(ls_out) = VALUE ty_out( dry_run = gs_req-dry_run groups = lt_res role_rows = lv_roles view_rows = lv_views messages = lt_m
      note = 'Only future routing changes: work items that are already running keep their agent.' ).
    LOOP AT lt_res ASSIGNING FIELD-SYMBOL(<x>).
      IF <x>-skipped = abap_true.
        ls_out-skipped_groups = ls_out-skipped_groups + 1.
      ELSE.
        ls_out-changed_groups = ls_out-changed_groups + 1.
      ENDIF.
    ENDLOOP.
    rv_json = ok( ls_out ).
  ENDMETHOD.

  METHOD op_where_used.
    DATA(lv_user) = condense( gs_req-user ).
    IF lv_user IS INITIAL.
      rv_json = fail( iv_text = 'Enter a user id or a mail id' iv_code = 'USER' ).
      RETURN.
    ENDIF.
    DATA lr_a TYPE RANGE OF /inowits/wf_app_id.
    DATA lr_ag TYPE RANGE OF /inowits/wf_agent.
    pat_range( EXPORTING iv_val = condense( to_upper( gs_req-app_id ) ) CHANGING ct_range = lr_a ).
    DATA(lv_mail) = xsdbool( lv_user CS '@' ).
    IF lv_mail = abap_false.
      pat_range( EXPORTING iv_val = lv_user CHANGING ct_range = lr_ag ).
      SELECT * FROM /inowits/wf_role WHERE app_id IN @lr_a AND agent IN @lr_ag INTO TABLE @DATA(lt_role).
    ELSE.
      SELECT * FROM /inowits/wf_role WHERE app_id IN @lr_a AND mail_id <> '' INTO TABLE @lt_role.
      DATA(lv_lm) = to_lower( lv_user ).
      DELETE lt_role WHERE NOT ( mail_id CS lv_lm ).
    ENDIF.
    TYPES: BEGIN OF ty_use.
             INCLUDE TYPE ty_gkey.
    TYPES:   lvl TYPE string, type_lvl TYPE string, role_label TYPE string, type TYPE string, level_active TYPE abap_bool,
             role TYPE string, start_date TYPE string, end_date TYPE string, active TYPE abap_bool, expired TYPE abap_bool,
             is_appr TYPE abap_bool, agent TYPE string, name TYPE string, mail_id TYPE string, level_text TYPE string, receives TYPE string,
           END OF ty_use.
    DATA lt_use TYPE STANDARD TABLE OF ty_use WITH DEFAULT KEY.
    DATA lt_def TYPE ty_def_t.
    IF lt_role IS NOT INITIAL.
      SELECT * FROM /inowits/wf_def FOR ALL ENTRIES IN @lt_role
        WHERE app_id = @lt_role-app_id AND gen_type = @lt_role-gen_type AND gen_field = @lt_role-gen_field AND gen_field2 = @lt_role-gen_field2
          AND gen_field3 = @lt_role-gen_field3 AND gen_field4 = @lt_role-gen_field4 AND lvl = @lt_role-lvl
        INTO TABLE @lt_def.
    ENDIF.
    SORT lt_role BY app_id gen_type gen_field gen_field2 gen_field3 gen_field4 lvl role.
    LOOP AT lt_role ASSIGNING FIELD-SYMBOL(<r>).
      IF lines( lt_use ) >= 2000.
        EXIT.
      ENDIF.
      DATA(ls_u) = VALUE ty_use( app_id = condense( CONV string( <r>-app_id ) ) gen_type = condense( CONV string( <r>-gen_type ) )
        gen_field = condense( CONV string( <r>-gen_field ) ) gen_field2 = condense( CONV string( <r>-gen_field2 ) )
        gen_field3 = condense( CONV string( <r>-gen_field3 ) ) gen_field4 = condense( CONV string( <r>-gen_field4 ) )
        lvl = condense( CONV string( <r>-lvl ) ) role = <r>-role start_date = d2s( <r>-start_date ) end_date = d2s( <r>-end_date )
        active = xsdbool( <r>-active = 'X' ) is_appr = xsdbool( <r>-is_appr = 'X' ) agent = condense( CONV string( <r>-agent ) )
        name = condense( CONV string( <r>-name ) ) mail_id = condense( CONV string( <r>-mail_id ) ) level_text = condense( CONV string( <r>-level_text ) ) ).
      ls_u-expired = xsdbool( ls_u-active = abap_true AND <r>-end_date < sy-datum ).
      READ TABLE lt_def ASSIGNING FIELD-SYMBOL(<d>) WITH KEY app_id = <r>-app_id gen_type = <r>-gen_type gen_field = <r>-gen_field gen_field2 = <r>-gen_field2
                                                           gen_field3 = <r>-gen_field3 gen_field4 = <r>-gen_field4 lvl = <r>-lvl.
      IF sy-subrc = 0.
        ls_u-type_lvl = <d>-type_lvl.  ls_u-role_label = role_label( <d>-type_lvl ).  ls_u-type = <d>-type.
        ls_u-level_active = xsdbool( <d>-active = 'X' ).
      ELSE.
        ls_u-role_label = 'No level definition'.
      ENDIF.
      ls_u-receives = COND #( WHEN ls_u-active = abap_true AND ls_u-expired = abap_false AND ls_u-level_active = abap_true AND ls_u-is_appr = abap_true THEN 'workitem'
                              WHEN ls_u-active = abap_true AND ls_u-expired = abap_false AND ls_u-level_active = abap_true THEN 'notification'
                              ELSE 'none' ).
      APPEND ls_u TO lt_use.
    ENDLOOP.
    TYPES: BEGIN OF ty_res, uses TYPE STANDARD TABLE OF ty_use WITH DEFAULT KEY, total TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( uses = lt_use total = lines( lt_use ) ) ).
  ENDMETHOD.

  METHOD op_get_keys.
    DATA(lv_app) = CONV /inowits/wf_app_id( condense( to_upper( gs_req-app_id ) ) ).
    IF lv_app IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    SELECT key_name, value, active FROM /inowits/wf_key WHERE app_id = @lv_app ORDER BY key_name, value INTO TABLE @DATA(lt_k).
    DATA lt_out TYPE ty_keyrows.
    LOOP AT lt_k ASSIGNING FIELD-SYMBOL(<k>).
      APPEND VALUE #( key_name = condense( CONV string( <k>-key_name ) ) value = condense( CONV string( <k>-value ) ) active = xsdbool( <k>-active = 'X' ) ) TO lt_out.
    ENDLOOP.
    TYPES: BEGIN OF ty_res, app_id TYPE string, keys TYPE ty_keyrows, END OF ty_res.
    rv_json = ok( VALUE ty_res( app_id = lv_app keys = lt_out ) ).
  ENDMETHOD.

  METHOD op_save_keys.
    DATA(lv_app) = condense( to_upper( gs_req-app_id ) ).
    IF lv_app IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    DATA(lt_keys) = gs_req-keys.
    LOOP AT lt_keys ASSIGNING FIELD-SYMBOL(<k>).
      <k>-key_name = condense( to_upper( <k>-key_name ) ).
      <k>-value    = condense( to_upper( <k>-value ) ).
    ENDLOOP.
    DELETE lt_keys WHERE key_name IS INITIAL AND value IS INITIAL.
    DATA lt_m TYPE ty_msgs.
    DATA(lv_wf) = 0.
    LOOP AT lt_keys ASSIGNING <k>.
      DATA(lv_i) = sy-tabix.
      chk_len( EXPORTING iv_val = <k>-key_name iv_max = 20 iv_label = |Key { lv_i }| iv_target = |{ lv_i }| CHANGING ct_msgs = lt_m ).
      chk_len( EXPORTING iv_val = <k>-value iv_max = 20 iv_label = |Key { lv_i } value| iv_target = |{ lv_i }| CHANGING ct_msgs = lt_m ).
      IF <k>-active = abap_true.
        IF <k>-value IS INITIAL.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'KEY_VALUE' iv_text = 'Enter Key Value' iv_target = |{ lv_i }| CHANGING ct_msgs = lt_m ).
        ENDIF.
        IF <k>-key_name IS INITIAL.
          add_msg( EXPORTING iv_sev = 'E' iv_code = 'KEY_NAME' iv_text = 'Enter Key' iv_target = |{ lv_i }| CHANGING ct_msgs = lt_m ).
        ENDIF.
        IF <k>-key_name = 'WF_ID'.
          lv_wf = lv_wf + 1.
        ENDIF.
      ENDIF.
      DATA(lv_same) = REDUCE i( INIT n = 0 FOR k2 IN lt_keys WHERE ( key_name = <k>-key_name AND value = <k>-value ) NEXT n = n + 1 ).
      IF lv_same > 1 AND line_index( lt_keys[ key_name = <k>-key_name value = <k>-value ] ) = lv_i.
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'KEY_DUP' iv_text = |Key { <k>-key_name } with value { <k>-value } exists more than once| iv_target = |{ lv_i }| CHANGING ct_msgs = lt_m ).
      ENDIF.
    ENDLOOP.
    IF lv_wf = 0.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'WF_ID' iv_text = 'Maintain workflow template id in Key Points table(use key = WF_ID)' CHANGING ct_msgs = lt_m ).
    ELSEIF lv_wf > 1.
      add_msg( EXPORTING iv_sev = 'E' iv_code = 'WF_ID' iv_text = 'Kindly maintain only one active workflow id.' CHANGING ct_msgs = lt_m ).
    ENDIF.
    IF has_error( lt_m ) = abap_true.
      rv_json = fail_msgs( lt_m ).
      RETURN.
    ENDIF.
    IF lock_app( lv_app ) = abap_false.
      rv_json = fail( iv_text = |Another administrator is saving the workflow of application { lv_app } right now. Try again in a moment.| iv_code = 'LOCKED' ).
      RETURN.
    ENDIF.
    DATA(lv_a) = CONV /inowits/wf_app_id( lv_app ).
    SELECT * FROM /inowits/wf_key WHERE app_id = @lv_a INTO TABLE @DATA(lt_old).
    DATA lt_new TYPE STANDARD TABLE OF /inowits/wf_key WITH DEFAULT KEY.
    LOOP AT lt_keys ASSIGNING <k>.
      DATA(ls_n) = VALUE /inowits/wf_key( mandt = sy-mandt app_id = lv_a key_name = <k>-key_name value = <k>-value
                                          active = COND #( WHEN <k>-active = abap_true THEN 'X' ELSE ' ' ) ).
      READ TABLE lt_old INTO DATA(ls_o) WITH KEY key_name = ls_n-key_name value = ls_n-value.
      IF sy-subrc = 0.
        ls_n-created_on = ls_o-created_on.  ls_n-created_by = ls_o-created_by.  ls_n-changed_on = ls_o-changed_on.  ls_n-changed_by = ls_o-changed_by.
        IF ls_n <> ls_o.
          ls_n-changed_on = sy-datum.  ls_n-changed_by = gv_user.
        ENDIF.
      ELSE.
        ls_n-created_on = sy-datum.  ls_n-created_by = gv_user.  ls_n-changed_on = sy-datum.  ls_n-changed_by = gv_user.
      ENDIF.
      APPEND ls_n TO lt_new.
    ENDLOOP.
    DELETE FROM /inowits/wf_key WHERE app_id = @lv_a.
    MODIFY /inowits/wf_key FROM TABLE @lt_new.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      rv_json = fail( iv_text = 'Error in while saving the Key Points details' iv_code = 'WRITE_FAILED' ).
      RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    TYPES: BEGIN OF ty_res, app_id TYPE string, saved TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( app_id = lv_app saved = lines( lt_new ) ) ).
  ENDMETHOD.


  METHOD op_change_log.
    DATA(lv_app) = condense( to_upper( gs_req-app_id ) ).
    IF lv_app IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    DATA(ls_k) = req_key( ).
    DATA lr_gt TYPE RANGE OF /inowits/wf_gen_type.
    DATA lr_g1 TYPE RANGE OF /inowits/wf_gen_field.
    DATA lr_g2 TYPE RANGE OF /inowits/wf_gen_field2.
    DATA lr_d  TYPE RANGE OF /inowits/changed_on.
    DATA lr_l  TYPE RANGE OF /inowits/wf_level.
    pat_range( EXPORTING iv_val = ls_k-gen_type   CHANGING ct_range = lr_gt ).
    pat_range( EXPORTING iv_val = ls_k-gen_field  CHANGING ct_range = lr_g1 ).
    pat_range( EXPORTING iv_val = ls_k-gen_field2 CHANGING ct_range = lr_g2 ).
    pat_range( EXPORTING iv_val = condense( to_upper( gs_req-lvl ) ) CHANGING ct_range = lr_l ).
    DATA(lv_from) = s2d( gs_req-date_from ).
    DATA(lv_to)   = s2d( gs_req-date_to ).
    IF lv_from IS NOT INITIAL OR lv_to IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'BT' low = COND #( WHEN lv_from IS INITIAL THEN '00010101' ELSE lv_from )
                      high = COND #( WHEN lv_to IS INITIAL THEN '99991231' ELSE lv_to ) ) TO lr_d.
    ENDIF.
    DATA(lv_limit) = COND i( WHEN gs_req-limit <= 0 THEN 200 WHEN gs_req-limit > 1000 THEN 1000 ELSE gs_req-limit ).
    DATA(lv_agent) = condense( to_upper( gs_req-agent ) ).
    DATA(lv_a) = CONV /inowits/wf_app_id( lv_app ).
    SELECT * FROM /inowits/rol_log
      WHERE app_id = @lv_a AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND changed_on IN @lr_d AND lvl IN @lr_l
      ORDER BY transid DESCENDING INTO TABLE @DATA(lt_rol) UP TO @lv_limit ROWS.
    SELECT * FROM /inowits/lvl_log
      WHERE app_id = @lv_a AND gen_type IN @lr_gt AND gen_field IN @lr_g1 AND gen_field2 IN @lr_g2 AND changed_on IN @lr_d AND lvl IN @lr_l
      ORDER BY transid DESCENDING INTO TABLE @DATA(lt_lvl) UP TO @lv_limit ROWS.

    TYPES: BEGIN OF ty_log.
             INCLUDE TYPE ty_gkey.
    TYPES:   trans_id TYPE string, kind TYPE string, reason TYPE string, context TYPE string, changed_on TYPE string, changed_by TYPE string,
             lvl TYPE string, role TYPE string, start_date TYPE string, view_name TYPE string, agent TYPE string, ch_agent TYPE string,
             summary TYPE string,
           END OF ty_log.
    DATA lt_out TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY.

    LOOP AT lt_rol ASSIGNING FIELD-SYMBOL(<r>).
      DATA(lv_reason) = CONV string( <r>-reason ).
      DATA(lv_ctx) = ||.
      DATA(lv_base) = lv_reason.
      IF lv_reason CS ' ['.
        SPLIT lv_reason AT ' [' INTO lv_base lv_ctx.
        lv_ctx = replace( val = lv_ctx sub = `]` with = `` occ = -1 ).
      ENDIF.
      DATA(ls_o) = VALUE ty_log( app_id = condense( CONV string( <r>-app_id ) ) gen_type = condense( CONV string( <r>-gen_type ) )
        gen_field = condense( CONV string( <r>-gen_field ) ) gen_field2 = condense( CONV string( <r>-gen_field2 ) )
        trans_id = condense( |{ <r>-transid ALPHA = OUT }| ) kind = COND #( WHEN <r>-role IS INITIAL AND <r>-start_date IS INITIAL THEN 'level' ELSE 'agent' )
        reason = lv_base context = lv_ctx changed_on = d2s( <r>-changed_on ) changed_by = condense( CONV string( <r>-changed_by ) )
        lvl = condense( CONV string( <r>-lvl ) ) role = <r>-role start_date = d2s( <r>-start_date )
        agent = condense( CONV string( <r>-agent ) ) ch_agent = condense( CONV string( <r>-ch_agent ) ) ).
      IF lv_ctx CS 'F3='.
        DATA(lv_f3) = substring_after( val = lv_ctx sub = 'F3=' ).
        SPLIT lv_f3 AT ' ' INTO ls_o-gen_field3 DATA(lv_rest).
        DATA(lv_f4) = substring_after( val = lv_ctx sub = 'F4=' ).
        SPLIT lv_f4 AT ' ' INTO ls_o-gen_field4 lv_rest.
      ENDIF.
      DATA(diffs) = ||.
      IF <r>-agent <> <r>-ch_agent.     diffs = |{ diffs } agent { <r>-agent } -> { <r>-ch_agent };|. ENDIF.
      IF <r>-end_date <> <r>-ch_end_date. diffs = |{ diffs } end { d2s( <r>-end_date ) } -> { d2s( <r>-ch_end_date ) };|. ENDIF.
      IF <r>-active <> <r>-ch_active.   diffs = |{ diffs } active '{ <r>-active }' -> '{ <r>-ch_active }';|. ENDIF.
      IF <r>-is_appr <> <r>-ch_is_appr. diffs = |{ diffs } approver '{ <r>-is_appr }' -> '{ <r>-ch_is_appr }';|. ENDIF.
      IF <r>-mail_id <> <r>-ch_mail_id. diffs = |{ diffs } mail { condense( CONV string( <r>-mail_id ) ) } -> { condense( CONV string( <r>-ch_mail_id ) ) };|. ENDIF.
      IF <r>-user_f <> <r>-ch_user_f.   diffs = |{ diffs } user function { <r>-user_f } -> { <r>-ch_user_f };|. ENDIF.
      IF diffs IS INITIAL.              diffs = ' department, name or department code changed (see note)'. ENDIF.
      DATA(ldiffs) = ||.
      IF <r>-max_role <> <r>-ch_max_role. ldiffs = |{ ldiffs } approvers counted { <r>-max_role } -> { <r>-ch_max_role };|. ENDIF.
      IF <r>-min_appr <> <r>-ch_min_appr. ldiffs = |{ ldiffs } minimum approvals { <r>-min_appr } -> { <r>-ch_min_appr };|. ENDIF.
      IF <r>-type <> <r>-ch_type.         ldiffs = |{ ldiffs } workflow type { <r>-type } -> { <r>-ch_type };|. ENDIF.
      IF <r>-active <> <r>-ch_active.     ldiffs = |{ ldiffs } active { <r>-active } -> { <r>-ch_active };|. ENDIF.
      IF ldiffs IS INITIAL.               ldiffs = ' level text or PIR type changed (see note)'. ENDIF.
      IF ls_o-kind = 'level'.
        ls_o-summary = SWITCH #( lv_base
          WHEN 'Agent Added'   THEN |Level { ls_o-lvl } added: { role_label( <r>-ch_type_lvl ) }, { COND string( WHEN <r>-ch_type = '02' THEN 'parallel' ELSE 'sequential' ) }, min { <r>-ch_min_appr } of { <r>-ch_max_role }|
          WHEN 'Agent Deleted' THEN |Level { ls_o-lvl } removed: { <r>-type_lvl }|
          ELSE |Level { ls_o-lvl } changed: { ldiffs }| ).
      ELSE.
        ls_o-summary = SWITCH #( lv_base
          WHEN 'Agent Added'   THEN |Level { ls_o-lvl } role { ls_o-role }: agent { ls_o-ch_agent } added{ COND string( WHEN <r>-ch_is_appr = 'X' THEN ' (approves)' ELSE ' (notification only)' ) }, until { d2s( <r>-ch_end_date ) }|
          WHEN 'Agent Deleted' THEN |Level { ls_o-lvl } role { ls_o-role }: agent { ls_o-agent } removed|
          ELSE |Level { ls_o-lvl } role { ls_o-role }: { diffs }| ).
      ENDIF.
      IF lv_agent IS NOT INITIAL AND ls_o-agent <> lv_agent AND ls_o-ch_agent <> lv_agent.
        CONTINUE.
      ENDIF.
      APPEND ls_o TO lt_out.
    ENDLOOP.
    LOOP AT lt_lvl ASSIGNING FIELD-SYMBOL(<v>).
      lv_reason = <v>-reason.
      CLEAR lv_ctx.
      lv_base = lv_reason.
      IF lv_reason CS ' ['.
        SPLIT lv_reason AT ' [' INTO lv_base lv_ctx.
        lv_ctx = replace( val = lv_ctx sub = `]` with = `` occ = -1 ).
      ENDIF.
      ls_o = VALUE ty_log( app_id = condense( CONV string( <v>-app_id ) ) gen_type = condense( CONV string( <v>-gen_type ) )
        gen_field = condense( CONV string( <v>-gen_field ) ) gen_field2 = condense( CONV string( <v>-gen_field2 ) )
        trans_id = condense( |{ <v>-transid ALPHA = OUT }| ) kind = 'view' reason = lv_base context = lv_ctx changed_on = d2s( <v>-changed_on )
        changed_by = condense( CONV string( <v>-changed_by ) ) lvl = condense( CONV string( <v>-lvl ) ) view_name = condense( CONV string( <v>-view_name ) )
        agent = condense( CONV string( <v>-agent ) ) ch_agent = condense( CONV string( <v>-ch_agent ) ) ).
      IF lv_ctx CS 'F3='.
        lv_f3 = substring_after( val = lv_ctx sub = 'F3=' ).
        SPLIT lv_f3 AT ' ' INTO ls_o-gen_field3 lv_rest.
        lv_f4 = substring_after( val = lv_ctx sub = 'F4=' ).
        SPLIT lv_f4 AT ' ' INTO ls_o-gen_field4 lv_rest.
      ENDIF.
      DATA(lv_where) = COND string( WHEN ls_o-lvl = 'L0' THEN 'Initiator (L0)' ELSE |Level { ls_o-lvl }| ).
      DATA(lv_vag) = ||.
      IF <v>-agent <> <v>-ch_agent.
        lv_vag = | agent { <v>-agent } -> { <v>-ch_agent };|.
      ENDIF.
      ls_o-summary = SWITCH #( lv_base
        WHEN 'View is Added'   THEN |{ lv_where }: view { ls_o-view_name } added{ COND string( WHEN <v>-ch_read_only = 'X' THEN ' (read only)' ) }|
        WHEN 'View is Deleted' THEN |{ lv_where }: view { ls_o-view_name } removed|
        ELSE |{ lv_where }: view { ls_o-view_name } changed{ lv_vag } active '{ <v>-active_lvl }'->'{ <v>-ch_active_lvl }', read only '{ <v>-read_only }'->'{ <v>-ch_read_only }'| ).
      IF lv_agent IS NOT INITIAL AND ls_o-agent <> lv_agent AND ls_o-ch_agent <> lv_agent.
        CONTINUE.
      ENDIF.
      APPEND ls_o TO lt_out.
    ENDLOOP.
    "plant / brand are only kept in the note of a log row (the log tables have no such column): rows of the old app carry none
    IF ls_k-gen_field3 IS NOT INITIAL.
      DELETE lt_out WHERE gen_field3 <> ls_k-gen_field3.
    ENDIF.
    IF ls_k-gen_field4 IS NOT INITIAL.
      DELETE lt_out WHERE gen_field4 <> ls_k-gen_field4.
    ENDIF.
    SORT lt_out BY trans_id DESCENDING lvl kind.
    IF lines( lt_out ) > lv_limit.
      DELETE lt_out FROM lv_limit + 1.
    ENDIF.
    TYPES: BEGIN OF ty_res, rows TYPE STANDARD TABLE OF ty_log WITH DEFAULT KEY, total TYPE i, END OF ty_res.
    rv_json = ok( VALUE ty_res( rows = lt_out total = lines( lt_out ) ) ).
  ENDMETHOD.

  METHOD routing_chain.
    "mirror of the selection in /INOWITS/CL_WF=>MAT_START (exact match on type / field / field 2, plant rule, brand rule only for PKGN)
    CLEAR: et_def, et_role.
    SELECT * FROM /inowits/wf_def
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field AND gen_field2 = @is_key-gen_field2 AND active = 'X'
      INTO TABLE @et_def.
    IF et_def IS NOT INITIAL.
      IF line_exists( et_def[ gen_field3 = is_key-gen_field3 ] ).
        DELETE et_def WHERE gen_field3 = ''.
        DELETE et_def WHERE gen_field3 <> is_key-gen_field3.
      ELSE.
        DELETE et_def WHERE gen_field3 <> ''.
      ENDIF.
    ENDIF.
    IF et_def IS NOT INITIAL AND is_key-gen_type = 'PKGN'.
      IF line_exists( et_def[ gen_field4 = is_key-gen_field4 ] ).
        DELETE et_def WHERE gen_field4 = ''.
        DELETE et_def WHERE gen_field4 <> is_key-gen_field4.
      ELSE.
        DELETE et_def WHERE gen_field4 <> ''.
      ENDIF.
    ENDIF.
    SELECT * FROM /inowits/wf_role
      WHERE app_id = @is_key-app_id AND gen_type = @is_key-gen_type AND gen_field = @is_key-gen_field AND gen_field2 = @is_key-gen_field2
        AND active = 'X' AND end_date >= @sy-datum
      INTO TABLE @et_role.
    IF et_role IS NOT INITIAL.
      IF line_exists( et_role[ gen_field3 = is_key-gen_field3 ] ).
        DELETE et_role WHERE gen_field3 = ''.
        DELETE et_role WHERE gen_field3 <> is_key-gen_field3.
      ELSE.
        DELETE et_role WHERE gen_field3 <> ''.
      ENDIF.
    ENDIF.
    IF et_role IS NOT INITIAL AND is_key-gen_type = 'PKGN'.
      IF line_exists( et_role[ gen_field4 = is_key-gen_field4 ] ).
        DELETE et_role WHERE gen_field4 = ''.
        DELETE et_role WHERE gen_field4 <> is_key-gen_field4.
      ELSE.
        DELETE et_role WHERE gen_field4 <> ''.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD op_simulate.
    DATA(ls_k) = req_key( ).
    IF ls_k-app_id IS INITIAL.
      rv_json = fail( iv_text = 'Please enter Application Id' iv_code = 'APP_ID' ).
      RETURN.
    ENDIF.
    DATA(ls_dk) = gkey_to_dkey( ls_k ).
    "1. the engine itself, simulation only: iv_simulate = 'X' skips the workflow start and the L0 update (see docs)
    DATA lt_eng TYPE /inowits/wf_msg_tt.
    DATA lt_msg TYPE ty_msgs.
    DATA(lv_called) = abap_false.
    DATA lv_a  TYPE /inowits/wf_app_id.
    DATA lv_t  TYPE /inowits/wf_gen_type.
    DATA lv_g1 TYPE /inowits/wf_gen_field.
    DATA lv_g2 TYPE /inowits/wf_gen_field2.
    DATA lv_g3 TYPE /inowits/wf_gen_field3.
    DATA lv_g4 TYPE /inowits/wf_gen_field4.
    lv_a = ls_k-app_id.  lv_t = ls_k-gen_type.  lv_g1 = ls_k-gen_field.  lv_g2 = ls_k-gen_field2.  lv_g3 = ls_k-gen_field3.  lv_g4 = ls_k-gen_field4.
    TRY.
        /inowits/cl_wf=>mat_start(
          EXPORTING iv_app_id = lv_a iv_gen_type = lv_t iv_gen_field = lv_g1 iv_gen_field2 = lv_g2 iv_simulate = 'X'
                    iv_gen_field3 = lv_g3 iv_gen_field4 = lv_g4
          IMPORTING et_message = lt_eng ).
        lv_called = abap_true.
      CATCH cx_root INTO DATA(lx).
        add_msg( EXPORTING iv_sev = 'E' iv_code = 'ENGINE_ERROR' iv_text = |The engine raised an error: { lx->get_text( ) }| CHANGING ct_msgs = lt_msg ).
    ENDTRY.
    LOOP AT lt_eng ASSIGNING FIELD-SYMBOL(<e>).
      add_msg( EXPORTING iv_sev = CONV string( <e>-msg_type ) iv_code = 'ENGINE' iv_text = condense( CONV string( <e>-line ) ) CHANGING ct_msgs = lt_msg ).
    ENDLOOP.

    "2. what the engine would work with: levels in flow order, who gets a work item, who only a notification
    routing_chain( EXPORTING is_key = ls_dk IMPORTING et_def = DATA(lt_def) et_role = DATA(lt_role) ).
    TYPES: BEGIN OF ty_sagent, role TYPE string, agent TYPE string, name TYPE string, receives TYPE string, mail_id TYPE string,
             level_text TYPE string, dept TYPE string, end_date TYPE string, key TYPE ty_gkey, END OF ty_sagent.
    TYPES: BEGIN OF ty_slevel, lvl TYPE string, type_lvl TYPE string, role_label TYPE string, type TYPE string, type_text TYPE string,
             min_appr TYPE i, max_role TYPE i, counted TYPE i, level_text TYPE string, stale TYPE abap_bool,
             agents TYPE STANDARD TABLE OF ty_sagent WITH DEFAULT KEY, END OF ty_slevel.
    DATA lt_chain TYPE STANDARD TABLE OF ty_slevel WITH DEFAULT KEY.
    DATA lt_matched TYPE STANDARD TABLE OF ty_gkey WITH DEFAULT KEY.
    DATA(lt_d) = lt_def.
    SORT lt_d BY lvl.
    DATA(lt_users) = load_users( VALUE #( FOR r IN lt_role ( condense( CONV string( r-agent ) ) ) ) ).
    DO 3 TIMES.
      DATA(lv_tl) = SWITCH string( sy-index WHEN 1 THEN 'I' WHEN 2 THEN 'R' ELSE 'A' ).
      DATA lt_ord TYPE STANDARD TABLE OF ty_slevel WITH DEFAULT KEY.
      CLEAR lt_ord.
      LOOP AT lt_d ASSIGNING FIELD-SYMBOL(<d>) WHERE type_lvl = lv_tl.
        APPEND VALUE ty_slevel( lvl = condense( CONV string( <d>-lvl ) ) type_lvl = <d>-type_lvl role_label = role_label( <d>-type_lvl ) type = <d>-type
          type_text = COND #( WHEN <d>-type = '02' THEN 'Parallel' WHEN <d>-type = '01' THEN 'Sequential' ELSE '' ) min_appr = <d>-min_appr max_role = <d>-max_role
          level_text = condense( CONV string( <d>-level_text ) ) ) TO lt_ord.
        APPEND dkey_to_gkey( CORRESPONDING #( <d> ) ) TO lt_matched.
      ENDLOOP.
      DATA lt_num TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
      LOOP AT lt_ord ASSIGNING FIELD-SYMBOL(<o>).
        <o>-counted = 0.
        LOOP AT lt_role ASSIGNING FIELD-SYMBOL(<r>) WHERE lvl = <o>-lvl.
          IF <r>-is_appr = 'X'.
            <o>-counted = <o>-counted + 1.
          ENDIF.
        ENDLOOP.
        <o>-stale = xsdbool( <o>-counted <> <o>-max_role ).
      ENDLOOP.
      "numeric order of the level number
      DATA(lt_sorted) = lt_ord.
      CLEAR lt_sorted.
      DATA(lv_mx) = 0.
      LOOP AT lt_ord ASSIGNING <o>.
        IF lvl_num( <o>-lvl ) < 999999 AND lvl_num( <o>-lvl ) > lv_mx.
          lv_mx = lvl_num( <o>-lvl ).
        ENDIF.
      ENDLOOP.
      DO lv_mx + 1 TIMES.
        DATA(lv_n) = sy-index - 1.
        LOOP AT lt_ord ASSIGNING <o> WHERE lvl IS NOT INITIAL.
          IF lvl_num( <o>-lvl ) = lv_n.
            APPEND <o> TO lt_sorted.
          ENDIF.
        ENDLOOP.
      ENDDO.
      LOOP AT lt_ord ASSIGNING <o>.
        IF lvl_num( <o>-lvl ) = 999999.
          APPEND <o> TO lt_sorted.
        ENDIF.
      ENDLOOP.
      APPEND LINES OF lt_sorted TO lt_chain.
    ENDDO.
    LOOP AT lt_chain ASSIGNING FIELD-SYMBOL(<c>).
      DATA(lt_r) = lt_role.
      SORT lt_r BY role start_date agent.
      LOOP AT lt_r ASSIGNING <r> WHERE lvl = <c>-lvl.
        DATA(lv_ag) = condense( CONV string( <r>-agent ) ).
        APPEND VALUE ty_sagent( role = <r>-role agent = lv_ag
          name = COND #( WHEN line_exists( lt_users[ bname = lv_ag ] ) THEN lt_users[ bname = lv_ag ]-name ELSE condense( CONV string( <r>-name ) ) )
          receives = COND #( WHEN <r>-is_appr = 'X' THEN 'workitem' ELSE 'notification' ) mail_id = condense( CONV string( <r>-mail_id ) )
          level_text = condense( CONV string( <r>-level_text ) ) dept = condense( CONV string( <r>-dept ) ) end_date = d2s( <r>-end_date )
          key = dkey_to_gkey( CORRESPONDING #( <r> ) ) ) TO <c>-agents.
      ENDLOOP.
    ENDLOOP.
    SORT lt_matched BY app_id gen_type gen_field gen_field2 gen_field3 gen_field4.
    DELETE ADJACENT DUPLICATES FROM lt_matched COMPARING ALL FIELDS.
    DATA(lt_l0) = VALUE ty_views( ).
    LOOP AT lt_matched ASSIGNING FIELD-SYMBOL(<m>).
      DATA(ls_mk) = gkey_to_dkey( <m> ).
      SELECT view_name, active, read_only FROM /inowits/wf_lvl
        WHERE app_id = @ls_mk-app_id AND gen_type = @ls_mk-gen_type AND gen_field = @ls_mk-gen_field AND gen_field2 = @ls_mk-gen_field2
          AND gen_field3 = @ls_mk-gen_field3 AND gen_field4 = @ls_mk-gen_field4 AND lvl = 'L0'
        INTO TABLE @DATA(lt_v).
      LOOP AT lt_v ASSIGNING FIELD-SYMBOL(<v>).
        APPEND VALUE #( view_name = condense( CONV string( <v>-view_name ) ) active = xsdbool( <v>-active = 'X' ) read_only = xsdbool( <v>-read_only = 'X' ) ) TO lt_l0.
      ENDLOOP.
    ENDLOOP.
    DATA lt_notes TYPE ty_strs.
    IF lt_def IS INITIAL.
      SELECT DISTINCT gen_field3 FROM /inowits/wf_def
        WHERE app_id = @ls_dk-app_id AND gen_type = @ls_dk-gen_type AND gen_field = @ls_dk-gen_field AND gen_field2 = @ls_dk-gen_field2 AND active = 'X'
        INTO TABLE @DATA(lt_pl).
      IF lt_pl IS NOT INITIAL.
        DATA(lv_pls) = ||.
        LOOP AT lt_pl ASSIGNING FIELD-SYMBOL(<pl>).
          lv_pls = |{ lv_pls } { COND string( WHEN <pl>-gen_field3 IS INITIAL THEN '(no plant)' ELSE condense( CONV string( <pl>-gen_field3 ) ) ) }|.
        ENDLOOP.
        APPEND |Definitions exist for this type and fields, but not for this plant. They exist for:{ lv_pls }.| TO lt_notes.
        IF ls_k-gen_field3 IS INITIAL.
          APPEND 'The request has no plant: the engine drops every definition when the plant is empty, so such a request always fails here.' TO lt_notes.
        ENDIF.
      ENDIF.
    ENDIF.
    IF NOT line_exists( lt_chain[ type_lvl = 'R' ] ) AND lt_chain IS NOT INITIAL.
      APPEND 'No Reviewer level: the engine skips the review and starts at the first Approver level.' TO lt_notes.
    ENDIF.
    LOOP AT lt_chain ASSIGNING <c> WHERE stale = abap_true.
      APPEND |Level { <c>-lvl }: the stored approver count ({ <c>-max_role }) differs from the active agents ({ <c>-counted }) - save the combination to refresh it.| TO lt_notes.
    ENDLOOP.
    TYPES: BEGIN OF ty_res, would_start TYPE abap_bool, engine_called TYPE abap_bool, messages TYPE ty_msgs, workflow_id TYPE string, reviewer_skipped TYPE abap_bool,
             levels TYPE STANDARD TABLE OF ty_slevel WITH DEFAULT KEY, matched TYPE STANDARD TABLE OF ty_gkey WITH DEFAULT KEY,
             initiator_views TYPE ty_views, notes TYPE ty_strs, key TYPE ty_gkey, END OF ty_res.
    rv_json = ok( VALUE ty_res( would_start = xsdbool( lv_called = abap_true AND has_error( lt_msg ) = abap_false ) engine_called = lv_called messages = lt_msg
      workflow_id = wf_id( ls_k-app_id ) reviewer_skipped = xsdbool( lt_chain IS NOT INITIAL AND NOT line_exists( lt_chain[ type_lvl = 'R' ] ) )
      levels = lt_chain matched = lt_matched initiator_views = lt_l0 notes = lt_notes key = ls_k ) ).
  ENDMETHOD.


  METHOD op_value_help.
    DATA(lv_kind) = to_upper( condense( gs_req-kind ) ).
    DATA(lv_q) = to_upper( condense( gs_req-query ) ).
    DATA(lv_limit) = COND i( WHEN gs_req-limit <= 0 THEN 50 WHEN gs_req-limit > 300 THEN 300 ELSE gs_req-limit ).
    DATA lt_items TYPE ty_items.
    DATA(lv_app) = CONV /inowits/wf_app_id( condense( to_upper( gs_req-app_id ) ) ).

    CASE lv_kind.
      WHEN 'APP'.
        LOOP AT app_list( ) ASSIGNING FIELD-SYMBOL(<c>).
          APPEND VALUE #( key = <c>-app_id text = <c>-text extra = |{ <c>-group_count } combinations| ) TO lt_items.
        ENDLOOP.
      WHEN 'MTART'.
        SELECT mtart AS key, mtbez AS text FROM t134t WHERE spras = @sy-langu ORDER BY mtart INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'MATKL'.
        SELECT matkl AS key, wgbez AS text FROM t023t WHERE spras = @sy-langu ORDER BY matkl INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'BUSINESS'.
        SELECT zbusiness AS key, zdesc AS text FROM zbus_grp ORDER BY zbusiness INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'PLANT'.
        SELECT werks AS key, name1 AS text FROM t001w ORDER BY werks INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'BRAND'.
        "no check table in SAP: brands that requests carry (material master of the app) plus those already used in workflow definitions
        SELECT DISTINCT zzbrand_code AS key FROM /inowits/mm_mara WHERE zzbrand_code <> '' INTO CORRESPONDING FIELDS OF TABLE @lt_items.
        SELECT DISTINCT gen_field4 AS key FROM /inowits/wf_def WHERE gen_field4 <> '' APPENDING CORRESPONDING FIELDS OF TABLE @lt_items.
        SORT lt_items BY key.
        DELETE ADJACENT DUPLICATES FROM lt_items COMPARING key.
      WHEN 'BUKRS'.
        SELECT bukrs AS key, butxt AS text FROM t001 ORDER BY bukrs INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'KTOKK'.
        SELECT ktokk AS key, txt30 AS text FROM t077y WHERE spras = @sy-langu ORDER BY ktokk INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'KTOKD'.
        SELECT ktokd AS key, txt30 AS text FROM t077x WHERE spras = @sy-langu ORDER BY ktokd INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'VKORG'.
        SELECT vkorg AS key, vtext AS text FROM tvkot WHERE spras = @sy-langu ORDER BY vkorg INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'VTWEG'.
        SELECT vtweg AS key, vtext AS text FROM tvtwt WHERE spras = @sy-langu ORDER BY vtweg INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'EKORG'.
        SELECT ekorg AS key, ekotx AS text FROM t024e ORDER BY ekorg INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'KSCHL'.
        "condition types: those already used as key of this application's definitions first, then the pricing condition types of purchasing (M) and sales (V)
        SELECT DISTINCT gen_type AS key FROM /inowits/wf_def WHERE app_id = @lv_app AND gen_type <> '' INTO CORRESPONDING FIELDS OF TABLE @lt_items.
        SELECT DISTINCT kschl AS key, vtext AS text FROM t685t WHERE spras = @sy-langu AND kvewe = 'A' AND kappl IN ('M','V') APPENDING CORRESPONDING FIELDS OF TABLE @lt_items.
        SORT lt_items BY key text DESCENDING.
        DELETE ADJACENT DUPLICATES FROM lt_items COMPARING key.
      WHEN 'VIEW'.
        IF lv_app IS INITIAL.
          rv_json = fail( iv_text = 'Choose an application first' iv_code = 'APP_ID' ).
          RETURN.
        ENDIF.
        SELECT view_name AS key, v_des AS text FROM /inowits/mdm_v_n WHERE app_id = @lv_app ORDER BY indx, view_name INTO CORRESPONDING FIELDS OF TABLE @lt_items.
      WHEN 'LEVELTEXT'.
        lt_items = domain_values( '/INOWITS/LEVEL_TEXT' ).
      WHEN 'DEPT'.
        lt_items = domain_values( '/INOWITS/DEPT_DM' ).
      WHEN 'PIRTYPE'.
        lt_items = domain_values( '/INOWITS/PIR_WF_TYPE' ).
      WHEN 'USER'.
        "SAP users with full name and e-mail; matched on user id or name (case-insensitive), locked users are marked
        SELECT DISTINCT u~bname AS bname, a~name_text AS name_text
          FROM usr21 AS u INNER JOIN adrp AS a ON a~persnumber = u~persnumber
          INTO TABLE @DATA(lt_u).
        SORT lt_u BY bname.
        DELETE ADJACENT DUPLICATES FROM lt_u COMPARING bname.
        DATA lt_names TYPE ty_strs.
        LOOP AT lt_u ASSIGNING FIELD-SYMBOL(<u>).
          IF lv_q IS INITIAL OR to_upper( CONV string( <u>-bname ) ) CS lv_q OR to_upper( CONV string( <u>-name_text ) ) CS lv_q.
            APPEND VALUE #( key = condense( CONV string( <u>-bname ) ) text = condense( CONV string( <u>-name_text ) ) ) TO lt_items.
            IF lines( lt_items ) >= lv_limit.
              EXIT.
            ENDIF.
          ENDIF.
        ENDLOOP.
        LOOP AT lt_items ASSIGNING FIELD-SYMBOL(<i>).
          APPEND <i>-key TO lt_names.
        ENDLOOP.
        DATA(lt_det) = load_users( lt_names ).
        LOOP AT lt_items ASSIGNING <i>.
          READ TABLE lt_det ASSIGNING FIELD-SYMBOL(<dt>) WITH KEY bname = <i>-key.
          IF sy-subrc = 0.
            <i>-extra = |{ <dt>-email }{ COND string( WHEN <dt>-locked = abap_true THEN ' [locked or expired]' ) }|.
          ENDIF.
        ENDLOOP.
      WHEN 'EMAIL'.
        "e-mail addresses of SAP users (default address), matched on e-mail, name or user id; the SAP user is shown as extra
        SELECT DISTINCT u~bname AS bname, a~smtp_addr AS smtp_addr, p~name_text AS name_text
          FROM usr21 AS u INNER JOIN adr6 AS a ON a~persnumber = u~persnumber AND a~addrnumber = u~addrnumber
          LEFT OUTER JOIN adrp AS p ON p~persnumber = u~persnumber
          WHERE a~smtp_addr <> ''
          INTO TABLE @DATA(lt_em).
        SORT lt_em BY smtp_addr bname.
        DELETE ADJACENT DUPLICATES FROM lt_em COMPARING smtp_addr.
        DATA lt_enames TYPE ty_strs.
        LOOP AT lt_em ASSIGNING FIELD-SYMBOL(<em>).
          IF lv_q IS INITIAL OR to_upper( CONV string( <em>-smtp_addr ) ) CS lv_q OR to_upper( CONV string( <em>-name_text ) ) CS lv_q OR to_upper( CONV string( <em>-bname ) ) CS lv_q.
            APPEND VALUE #( key = condense( CONV string( <em>-smtp_addr ) ) text = condense( CONV string( <em>-name_text ) ) extra = |SAP user { condense( CONV string( <em>-bname ) ) }| ) TO lt_items.
            APPEND condense( CONV string( <em>-bname ) ) TO lt_enames.
            IF lines( lt_items ) >= lv_limit.
              EXIT.
            ENDIF.
          ENDIF.
        ENDLOOP.
        DATA(lt_edet) = load_users( lt_enames ).
        LOOP AT lt_items ASSIGNING <i>.
          DATA(lv_eu) = condense( replace( val = <i>-extra sub = 'SAP user ' with = '' ) ).
          READ TABLE lt_edet ASSIGNING <dt> WITH KEY bname = lv_eu.
          IF sy-subrc = 0 AND <dt>-locked = abap_true.
            <i>-extra = |{ <i>-extra } [locked or expired]|.
          ENDIF.
        ENDLOOP.
      WHEN OTHERS.
        rv_json = fail( iv_text = |Value help { gs_req-kind } is not known| iv_code = 'UNKNOWN_KIND' ).
        RETURN.
    ENDCASE.

    IF lv_kind <> 'USER' AND lv_kind <> 'EMAIL'.
      LOOP AT lt_items ASSIGNING <i>.
        <i>-key  = condense( <i>-key ).
        <i>-text = condense( <i>-text ).
      ENDLOOP.
      IF lv_q IS NOT INITIAL.
        DATA lt_f TYPE ty_items.
        LOOP AT lt_items ASSIGNING <i>.
          IF to_upper( <i>-key ) CS lv_q OR to_upper( <i>-text ) CS lv_q.
            APPEND <i> TO lt_f.
          ENDIF.
        ENDLOOP.
        lt_items = lt_f.
      ENDIF.
      IF lines( lt_items ) > lv_limit.
        DELETE lt_items FROM lv_limit + 1.
      ENDIF.
    ENDIF.
    TYPES: BEGIN OF ty_res, kind TYPE string, items TYPE ty_items, END OF ty_res.
    rv_json = ok( VALUE ty_res( kind = lv_kind items = lt_items ) ).
  ENDMETHOD.

ENDCLASS.
