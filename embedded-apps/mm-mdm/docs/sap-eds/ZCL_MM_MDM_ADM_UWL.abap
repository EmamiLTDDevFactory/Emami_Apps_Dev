"! Admin area UWL: workflow visibility (rebuild of the Web Dynpro component /INOWITS/UWL, extended).
"! Ops (all read only, SQL only):
"!   my   - open work items of the caller (actor e-mail -> SAP user(s) via USR21/ADR6), all app ids
"!   all  - all open work items, filtered, sorted and paged (admins only; a non admin gets his own items only)
"!   meta - app / status / level options
"! Source: SWWWIHEAD (READY dialog items) joined to /INOWITS/M_TRANS on TOP_WI_ID, agents from SWWUSERWI,
"! levels derived from /INOWITS/TRANS_I (no container reads), SLA days from /INOWITS/WF_SLA.
CLASS zcl_mm_mdm_adm_uwl DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run
      IMPORTING iv_op          TYPE clike
                iv_actor       TYPE clike OPTIONAL
                iv_payload     TYPE string OPTIONAL
      RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    CONSTANTS c_stale_days TYPE i VALUE 90.
    TYPES: BEGIN OF ty_req,
             app          TYPE string,
             initiator    TYPE string,
             agent        TYPE string,
             from         TYPE string,
             to           TYPE string,
             status       TYPE string,
             level        TYPE string,
             q            TYPE string,
             breached     TYPE abap_bool,
             stale_only   TYPE abap_bool,
             all_dates    TYPE abap_bool,
             sort         TYPE string,
             dir          TYPE string,
             top          TYPE i,
             skip         TYPE i,
             actor        TYPE string,
             is_admin     TYPE abap_bool,
           END OF ty_req.
    TYPES: BEGIN OF ty_item,
             wi_id          TYPE c LENGTH 12,
             top_wi_id      TYPE c LENGTH 12,
             task           TYPE c LENGTH 12,
             text           TYPE string,
             app_id         TYPE c LENGTH 10,
             app_name       TYPE string,
             trans_id       TYPE c LENGTH 10,
             obj_value      TYPE string,
             req_status     TYPE c LENGTH 2,
             status_text    TYPE string,
             level          TYPE string,
             level_note     TYPE string,
             agents         TYPE string,
             agent_names    TYPE string,
             initiator      TYPE string,
             initiator_name TYPE string,
             created        TYPE string,
             age_days       TYPE i,
             sla_days       TYPE i,
             sla_breached   TYPE abap_bool,
             stale          TYPE abap_bool,
             orphan         TYPE abap_bool,
             cd             TYPE swwwihead-wi_cd,
           END OF ty_item.
    TYPES tt_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_cnt,
             key      TYPE string,
             label    TYPE string,
             n        TYPE i,
             breached TYPE i,
           END OF ty_cnt.
    TYPES tt_cnt TYPE STANDARD TABLE OF ty_cnt WITH DEFAULT KEY.

    CLASS-METHODS parse_request IMPORTING iv_actor TYPE clike iv_payload TYPE string RETURNING VALUE(rs_req) TYPE ty_req.
    CLASS-METHODS users_of_email IMPORTING iv_email TYPE string RETURNING VALUE(rt_users) TYPE string_table.
    CLASS-METHODS load RETURNING VALUE(rt_item) TYPE tt_item.
    CLASS-METHODS date_iso IMPORTING iv_date TYPE d RETURNING VALUE(rv_iso) TYPE string.
    CLASS-METHODS parse_iso IMPORTING iv_iso TYPE string RETURNING VALUE(rv_date) TYPE d.
    CLASS-METHODS do_my IMPORTING is_req TYPE ty_req RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS do_all IMPORTING is_req TYPE ty_req RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS do_meta RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS page_json
      IMPORTING is_req TYPE ty_req it_item TYPE tt_item it_users TYPE string_table iv_scope TYPE string iv_note TYPE string OPTIONAL
      RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS add_count
      IMPORTING iv_key TYPE string iv_label TYPE string iv_breached TYPE abap_bool CHANGING ct_cnt TYPE tt_cnt.
    CLASS-METHODS ser IMPORTING ig_data TYPE any RETURNING VALUE(rv_json) TYPE string.
ENDCLASS.



CLASS zcl_mm_mdm_adm_uwl IMPLEMENTATION.

  METHOD ser.
    rv_json = /ui2/cl_json=>serialize( data = ig_data compress = abap_false pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
  ENDMETHOD.

  METHOD run.
    TRY.
        DATA(ls_req) = parse_request( iv_actor = iv_actor iv_payload = iv_payload ).
        CASE to_lower( CONV string( iv_op ) ).
          WHEN 'my'.   rv_json = do_my( ls_req ).
          WHEN 'all'.  rv_json = do_all( ls_req ).
          WHEN 'meta'. rv_json = do_meta( ).
          WHEN OTHERS. rv_json = zcl_mm_mdm_admin=>error_json( |Operation { iv_op } is not known| ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx).
        rv_json = zcl_mm_mdm_admin=>error_json( lx->get_text( ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD parse_request.
    IF iv_payload IS NOT INITIAL.
      /ui2/cl_json=>deserialize( EXPORTING json = iv_payload pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = rs_req ).
    ENDIF.
    IF rs_req-actor IS INITIAL. rs_req-actor = iv_actor. ENDIF.
    rs_req-actor = to_lower( condense( rs_req-actor ) ).
    IF rs_req-top <= 0 OR rs_req-top > 500. rs_req-top = 50. ENDIF.
    IF rs_req-skip < 0. rs_req-skip = 0. ENDIF.
    rs_req-app = to_upper( condense( rs_req-app ) ).
    IF rs_req-app = 'ALL'. CLEAR rs_req-app. ENDIF.
  ENDMETHOD.

  METHOD users_of_email.
    "same person as the hub: the gateway user is technical, so e-mail -> SAP user through the address data
    CHECK iv_email IS NOT INITIAL.
    DATA(lv_up) = to_upper( iv_email ).
    DATA(lv_srch) = CONV adr6-smtp_srch( lv_up ).
    SELECT u~bname, a~smtp_addr FROM usr21 AS u
      INNER JOIN adr6 AS a ON a~persnumber = u~persnumber AND a~addrnumber = u~addrnumber
      WHERE a~smtp_srch = @lv_srch
      INTO TABLE @DATA(lt_u).
    LOOP AT lt_u INTO DATA(ls_u).
      IF to_upper( condense( ls_u-smtp_addr ) ) = lv_up.
        APPEND CONV string( ls_u-bname ) TO rt_users.
      ENDIF.
    ENDLOOP.
    SORT rt_users. DELETE ADJACENT DUPLICATES FROM rt_users.
  ENDMETHOD.

  METHOD date_iso.
    IF iv_date IS INITIAL OR iv_date = '00000000'. RETURN. ENDIF.
    rv_iso = |{ iv_date(4) }-{ iv_date+4(2) }-{ iv_date+6(2) }|.
  ENDMETHOD.

  METHOD parse_iso.
    DATA(lv) = replace( val = iv_iso sub = '-' with = '' occ = 0 ).
    IF strlen( lv ) = 8 AND lv CO '0123456789'.
      rv_date = lv.
    ENDIF.
  ENDMETHOD.

  METHOD load.
    SELECT w~wi_id, w~top_wi_id, w~wi_rh_task, w~wi_text, w~wi_cd,
           t~transid, t~app_id, t~status, t~obj_value, t~user_id AS init_user
      FROM swwwihead AS w
      INNER JOIN /inowits/m_trans AS t ON t~top_wi_id = w~top_wi_id
      WHERE w~wi_stat = 'READY' AND w~wi_type = 'W'
      INTO TABLE @DATA(lt_w).
    IF lt_w IS INITIAL. RETURN. ENDIF.

    "agents (one row per potential/actual agent)
    SELECT wi_id, user_id FROM swwuserwi FOR ALL ENTRIES IN @lt_w WHERE wi_id = @lt_w-wi_id INTO TABLE @DATA(lt_ag).
    SORT lt_ag BY wi_id user_id.
    DELETE ADJACENT DUPLICATES FROM lt_ag COMPARING wi_id user_id.

    "level history of the requests
    DATA lt_tr TYPE SORTED TABLE OF /inowits/m_trans WITH NON-UNIQUE KEY transid app_id.
    SELECT transid, app_id, lvl, status FROM /inowits/trans_i FOR ALL ENTRIES IN @lt_w
      WHERE transid = @lt_w-transid AND app_id = @lt_w-app_id INTO TABLE @DATA(lt_lv).
    SORT lt_lv BY transid app_id.

    "texts: app ids, request status, names, SLA
    SELECT domvalue_l, ddtext FROM dd07t WHERE domname = '/INOWITS/MDM_APP_ID' AND ddlanguage = 'E' AND as4local = 'A' INTO TABLE @DATA(lt_app).
    SELECT domvalue_l, ddtext FROM dd07t WHERE domname = '/INOWITS/TRNAS_STATUS' AND ddlanguage = 'E' AND as4local = 'A' INTO TABLE @DATA(lt_st).
    SELECT app_id, reviewer, approver FROM /inowits/wf_sla INTO TABLE @DATA(lt_sla).

    DATA lt_names TYPE SORTED TABLE OF usr21-bname WITH UNIQUE KEY table_line.
    LOOP AT lt_w INTO DATA(ls_w0).
      INSERT CONV usr21-bname( ls_w0-init_user ) INTO TABLE lt_names.
    ENDLOOP.
    LOOP AT lt_ag INTO DATA(ls_a0).
      INSERT CONV usr21-bname( ls_a0-user_id ) INTO TABLE lt_names.
    ENDLOOP.
    DATA lt_nm TYPE SORTED TABLE OF usr21-bname WITH UNIQUE KEY table_line.
    DATA lt_nmv TYPE STANDARD TABLE OF string.
    DATA lt_bn TYPE STANDARD TABLE OF usr21-bname.
    lt_bn = lt_names.
    IF lt_bn IS NOT INITIAL.
      SELECT u~bname, p~name_first, p~name_last FROM usr21 AS u
        INNER JOIN adrp AS p ON p~persnumber = u~persnumber
        FOR ALL ENTRIES IN @lt_bn WHERE u~bname = @lt_bn-table_line
        INTO TABLE @DATA(lt_nam).
    ENDIF.

    LOOP AT lt_w INTO DATA(ls_w).
      DATA ls_i TYPE ty_item.
      CLEAR ls_i.
      ls_i-wi_id = ls_w-wi_id. ls_i-top_wi_id = ls_w-top_wi_id. ls_i-task = ls_w-wi_rh_task.
      ls_i-text = condense( CONV string( ls_w-wi_text ) ).
      ls_i-app_id = ls_w-app_id. ls_i-trans_id = ls_w-transid.
      ls_i-obj_value = condense( CONV string( ls_w-obj_value ) ).
      ls_i-req_status = ls_w-status.
      ls_i-cd = ls_w-wi_cd.
      ls_i-created = date_iso( ls_w-wi_cd ).
      ls_i-age_days = sy-datum - ls_w-wi_cd.
      ls_i-stale = xsdbool( ls_i-age_days > c_stale_days ).
      ls_i-app_name = COND #( WHEN line_exists( lt_app[ domvalue_l = ls_w-app_id ] ) THEN lt_app[ domvalue_l = ls_w-app_id ]-ddtext ELSE ls_w-app_id ).
      ls_i-status_text = COND #( WHEN line_exists( lt_st[ domvalue_l = ls_w-status ] ) THEN lt_st[ domvalue_l = ls_w-status ]-ddtext ELSE ls_w-status ).
      ls_i-orphan = xsdbool( ls_w-status = '00' OR ls_w-status = '03' OR ls_w-status = '05' ).

      "derived level: one above the highest completed level of TRANS_I; sent back = initiator; closed request = none
      IF ls_i-orphan = abap_true.
        ls_i-level_note = 'The request is closed but this work item is still open'.
      ELSEIF ls_w-status = '04'.
        ls_i-level = 'L0'.
      ELSE.
        DATA lv_max TYPE i.
        lv_max = 0.
        LOOP AT lt_lv INTO DATA(ls_lv) WHERE transid = ls_w-transid AND app_id = ls_w-app_id AND status = 'C'.
          DATA(lv_n) = CONV i( 0 ).
          IF strlen( ls_lv-lvl ) > 1 AND ls_lv-lvl+1 CO '0123456789 '. lv_n = ls_lv-lvl+1. ENDIF.
          IF lv_n > lv_max. lv_max = lv_n. ENDIF.
        ENDLOOP.
        ls_i-level = |L{ lv_max + 1 }|.
        ls_i-level_note = 'Derived from the level history (highest completed level + 1)'.
      ENDIF.

      "agents
      LOOP AT lt_ag INTO DATA(ls_ag) WHERE wi_id = ls_w-wi_id.
        ls_i-agents = COND #( WHEN ls_i-agents IS INITIAL THEN ls_ag-user_id ELSE |{ ls_i-agents }, { ls_ag-user_id }| ).
        DATA(lv_an) = ``.
        READ TABLE lt_nam INTO DATA(ls_nam) WITH KEY bname = ls_ag-user_id.
        IF sy-subrc = 0. lv_an = condense( |{ ls_nam-name_last } { ls_nam-name_first }| ). ENDIF.
        IF lv_an IS INITIAL. lv_an = ls_ag-user_id. ENDIF.
        ls_i-agent_names = COND #( WHEN ls_i-agent_names IS INITIAL THEN lv_an ELSE |{ ls_i-agent_names }, { lv_an }| ).
      ENDLOOP.
      ls_i-initiator = ls_w-init_user.
      READ TABLE lt_nam INTO ls_nam WITH KEY bname = ls_w-init_user.
      IF sy-subrc = 0. ls_i-initiator_name = condense( |{ ls_nam-name_last } { ls_nam-name_first }| ). ENDIF.
      IF ls_i-initiator_name IS INITIAL. ls_i-initiator_name = ls_w-init_user. ENDIF.

      "SLA: WF_SLA by first letter of the app id; reviewer/approver is not stored on the item, so the larger value counts
      READ TABLE lt_sla INTO DATA(ls_sla) WITH KEY app_id = ls_w-app_id(1).
      IF sy-subrc = 0.
        ls_i-sla_days = nmax( val1 = CONV i( ls_sla-reviewer ) val2 = CONV i( ls_sla-approver ) ).
        ls_i-sla_breached = xsdbool( ls_i-age_days > ls_i-sla_days AND ls_i-orphan = abap_false ).
      ENDIF.
      APPEND ls_i TO rt_item.
    ENDLOOP.
  ENDMETHOD.

  METHOD add_count.
    READ TABLE ct_cnt ASSIGNING FIELD-SYMBOL(<c>) WITH KEY key = iv_key.
    IF sy-subrc <> 0.
      APPEND VALUE #( key = iv_key label = iv_label ) TO ct_cnt ASSIGNING <c>.
    ENDIF.
    <c>-n = <c>-n + 1.
    IF iv_breached = abap_true. <c>-breached = <c>-breached + 1. ENDIF.
  ENDMETHOD.

  METHOD page_json.
    DATA lt_item TYPE tt_item.
    lt_item = it_item.
    DATA(lv_sort) = COND string( WHEN is_req-sort IS INITIAL THEN 'created' ELSE to_lower( is_req-sort ) ).
    DATA(lv_desc) = xsdbool( to_lower( is_req-dir ) = 'desc' OR ( is_req-dir IS INITIAL AND lv_sort = 'created' ) ).
    DATA(lv_field) = SWITCH string( lv_sort
      WHEN 'created' THEN 'CD' WHEN 'age' THEN 'AGE_DAYS' WHEN 'app' THEN 'APP_ID' WHEN 'level' THEN 'LEVEL'
      WHEN 'status' THEN 'REQ_STATUS' WHEN 'agent' THEN 'AGENTS' WHEN 'initiator' THEN 'INITIATOR_NAME'
      WHEN 'request' THEN 'TRANS_ID' WHEN 'text' THEN 'TEXT' ELSE 'CD' ).
    DATA lt_sort TYPE abap_sortorder_tab.
    APPEND VALUE #( name = lv_field descending = lv_desc ) TO lt_sort.
    APPEND VALUE #( name = 'WI_ID' descending = lv_desc ) TO lt_sort.
    SORT lt_item BY (lt_sort).

    "counts over the whole filtered set
    DATA lt_app TYPE tt_cnt. DATA lt_lvl TYPE tt_cnt. DATA lt_ag TYPE tt_cnt. DATA lt_stt TYPE tt_cnt.
    DATA(lv_breached) = 0. DATA(lv_stale) = 0. DATA(lv_oldest) = 0. DATA(lv_orphan) = 0.
    LOOP AT lt_item INTO DATA(ls_i).
      IF ls_i-sla_breached = abap_true. lv_breached = lv_breached + 1. ENDIF.
      IF ls_i-stale = abap_true. lv_stale = lv_stale + 1. ENDIF.
      IF ls_i-orphan = abap_true. lv_orphan = lv_orphan + 1. ENDIF.
      IF ls_i-age_days > lv_oldest. lv_oldest = ls_i-age_days. ENDIF.
      add_count( EXPORTING iv_key = CONV #( ls_i-app_id ) iv_label = ls_i-app_name iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_app ).
      add_count( EXPORTING iv_key = CONV #( ls_i-level ) iv_label = COND #( WHEN ls_i-level IS INITIAL THEN '(closed request)' ELSE ls_i-level ) iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_lvl ).
      add_count( EXPORTING iv_key = CONV #( ls_i-req_status ) iv_label = ls_i-status_text iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_stt ).
      DATA lt_split TYPE string_table.
      DATA lt_split2 TYPE string_table.
      SPLIT ls_i-agents AT ', ' INTO TABLE lt_split.
      SPLIT ls_i-agent_names AT ', ' INTO TABLE lt_split2.
      LOOP AT lt_split INTO DATA(lv_ag).
        DATA(lv_ix) = sy-tabix.
        add_count( EXPORTING iv_key = lv_ag iv_label = COND #( WHEN lv_ix <= lines( lt_split2 ) THEN lt_split2[ lv_ix ] ELSE lv_ag ) iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_ag ).
      ENDLOOP.
    ENDLOOP.
    SORT lt_app BY n DESCENDING. SORT lt_ag BY n DESCENDING. SORT lt_lvl BY key. SORT lt_stt BY key.
    IF lines( lt_ag ) > 15. DELETE lt_ag FROM 16. ENDIF.

    DATA(lv_total) = lines( lt_item ).
    DATA lt_page TYPE tt_item.
    DATA(lv_from) = is_req-skip + 1.
    DATA(lv_to) = is_req-skip + is_req-top.
    LOOP AT lt_item INTO ls_i FROM lv_from TO lv_to.
      APPEND ls_i TO lt_page.
    ENDLOOP.

    DATA(lv_items) = ser( lt_page ).
    DATA(lv_apps) = ser( lt_app ). DATA(lv_lvls) = ser( lt_lvl ). DATA(lv_ags) = ser( lt_ag ). DATA(lv_stts) = ser( lt_stt ).
    DATA(lv_users) = ser( it_users ).
    DATA(lv_note) = ser( iv_note ).
    rv_json = |\{"ok":true,"data":\{"scope":"{ iv_scope }","asOf":"{ date_iso( sy-datum ) }","staleDays":{ c_stale_days },"user":{ ser( is_req-actor ) },"sapUsers":{ lv_users },"note":{ lv_note },| &&
              |"total":{ lv_total },"top":{ is_req-top },"skip":{ is_req-skip },"sort":"{ lv_sort }","dir":"{ COND string( WHEN lv_desc = abap_true THEN 'desc' ELSE 'asc' ) }",| &&
              |"counts":\{"open":{ lv_total },"breached":{ lv_breached },"stale":{ lv_stale },"closedRequests":{ lv_orphan },"oldestDays":{ lv_oldest },| &&
              |"byApp":{ lv_apps },"byLevel":{ lv_lvls },"byStatus":{ lv_stts },"byAgent":{ lv_ags }\},"items":{ lv_items }\}\}|.
  ENDMETHOD.

  METHOD do_my.
    DATA(lt_users) = users_of_email( is_req-actor ).
    IF lt_users IS INITIAL.
      rv_json = page_json( is_req = is_req it_item = VALUE tt_item( ) it_users = lt_users iv_scope = 'my'
                           iv_note = |No SAP user is registered with the e-mail { is_req-actor }, so no work items can be shown.| ).
      RETURN.
    ENDIF.
    DATA(lt_all) = load( ).
    DATA lt_my TYPE tt_item.
    LOOP AT lt_all INTO DATA(ls_i).
      DATA(lv_hit) = abap_false.
      LOOP AT lt_users INTO DATA(lv_u).
        IF ls_i-agents CS lv_u. lv_hit = abap_true. ENDIF.
      ENDLOOP.
      CHECK lv_hit = abap_true.
      "exact agent check (CS on '90008842' inside a list is fine as ids are whole words, verify)
      DATA lt_ag TYPE string_table.
      SPLIT ls_i-agents AT ', ' INTO TABLE lt_ag.
      lv_hit = abap_false.
      LOOP AT lt_users INTO lv_u.
        IF line_exists( lt_ag[ table_line = lv_u ] ). lv_hit = abap_true. ENDIF.
      ENDLOOP.
      CHECK lv_hit = abap_true.
      IF is_req-app IS NOT INITIAL AND ls_i-app_id <> is_req-app. CONTINUE. ENDIF.
      APPEND ls_i TO lt_my.
    ENDLOOP.
    rv_json = page_json( is_req = is_req it_item = lt_my it_users = lt_users iv_scope = 'my' ).
  ENDMETHOD.

  METHOD do_all.
    DATA(ls_req) = is_req.
    DATA(lt_users) = users_of_email( ls_req-actor ).
    DATA lv_note TYPE string.
    DATA(lv_scope) = `all`.
    IF ls_req-is_admin <> abap_true.
      "not an admin: only his own items, whatever filter is sent
      lv_scope = `own`.
      CLEAR: ls_req-agent, ls_req-initiator.
      lv_note = 'Only your own work items are shown. The all-users view is for administrators.'.
      IF lt_users IS INITIAL.
        rv_json = page_json( is_req = ls_req it_item = VALUE tt_item( ) it_users = lt_users iv_scope = lv_scope iv_note = lv_note ).
        RETURN.
      ENDIF.
    ENDIF.
    DATA(lv_from) = parse_iso( ls_req-from ).
    DATA(lv_to) = parse_iso( ls_req-to ).
    IF ls_req-all_dates <> abap_true AND lv_from IS INITIAL AND lv_to IS INITIAL.
      lv_from = sy-datum - 30. lv_to = sy-datum.    "same default as the old UWL: last 30 days
      ls_req-from = date_iso( lv_from ). ls_req-to = date_iso( lv_to ).
    ENDIF.
    DATA(lv_ini) = to_upper( condense( ls_req-initiator ) ).
    DATA(lv_agt) = to_upper( condense( ls_req-agent ) ).
    DATA(lv_q) = to_upper( condense( ls_req-q ) ).
    DATA lt_out TYPE tt_item.
    LOOP AT load( ) INTO DATA(ls_i).
      IF lv_scope = `own`.
        DATA lt_ag TYPE string_table.
        SPLIT ls_i-agents AT ', ' INTO TABLE lt_ag.
        DATA(lv_hit) = abap_false.
        LOOP AT lt_users INTO DATA(lv_u).
          IF line_exists( lt_ag[ table_line = lv_u ] ). lv_hit = abap_true. ENDIF.
        ENDLOOP.
        CHECK lv_hit = abap_true.
      ENDIF.
      IF lv_from IS NOT INITIAL AND ls_i-cd < lv_from. CONTINUE. ENDIF.
      IF lv_to IS NOT INITIAL AND ls_i-cd > lv_to. CONTINUE. ENDIF.
      IF ls_req-app IS NOT INITIAL AND ls_i-app_id <> ls_req-app. CONTINUE. ENDIF.
      IF ls_req-status IS NOT INITIAL AND ls_i-req_status <> ls_req-status. CONTINUE. ENDIF.
      IF ls_req-level IS NOT INITIAL AND ls_i-level <> to_upper( ls_req-level ). CONTINUE. ENDIF.
      IF ls_req-breached = abap_true AND ls_i-sla_breached <> abap_true. CONTINUE. ENDIF.
      IF ls_req-stale_only = abap_true AND ls_i-stale <> abap_true. CONTINUE. ENDIF.
      IF lv_ini IS NOT INITIAL AND NOT ( to_upper( ls_i-initiator ) = lv_ini OR to_upper( ls_i-initiator_name ) CS lv_ini ). CONTINUE. ENDIF.
      IF lv_agt IS NOT INITIAL AND NOT ( to_upper( ls_i-agents ) CS lv_agt OR to_upper( ls_i-agent_names ) CS lv_agt ). CONTINUE. ENDIF.
      IF lv_q IS NOT INITIAL AND NOT ( to_upper( ls_i-trans_id ) CS lv_q OR to_upper( ls_i-obj_value ) CS lv_q OR to_upper( ls_i-text ) CS lv_q ). CONTINUE. ENDIF.
      APPEND ls_i TO lt_out.
    ENDLOOP.
    rv_json = page_json( is_req = ls_req it_item = lt_out it_users = lt_users iv_scope = lv_scope iv_note = lv_note ).
  ENDMETHOD.

  METHOD do_meta.
    DATA(lt_all) = load( ).
    DATA lt_app TYPE tt_cnt. DATA lt_lvl TYPE tt_cnt. DATA lt_stt TYPE tt_cnt.
    LOOP AT lt_all INTO DATA(ls_i).
      add_count( EXPORTING iv_key = CONV #( ls_i-app_id ) iv_label = ls_i-app_name iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_app ).
      add_count( EXPORTING iv_key = CONV #( ls_i-level ) iv_label = COND #( WHEN ls_i-level IS INITIAL THEN '(closed request)' ELSE ls_i-level ) iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_lvl ).
      add_count( EXPORTING iv_key = CONV #( ls_i-req_status ) iv_label = ls_i-status_text iv_breached = ls_i-sla_breached CHANGING ct_cnt = lt_stt ).
    ENDLOOP.
    SORT lt_app BY key. SORT lt_lvl BY key. SORT lt_stt BY key.
    rv_json = |\{"ok":true,"data":\{"apps":{ ser( lt_app ) },"levels":{ ser( lt_lvl ) },"statuses":{ ser( lt_stt ) },"staleDays":{ c_stale_days },"defaultDays":30\}\}|.
  ENDMETHOD.

ENDCLASS.
