"! Request service: header, ID generation, start, routing keys, allowed actions, list, delete draft.
"! Everything that is about the request as a whole and not about one tab.
CLASS zcl_mm_mdm_request_svc DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES tt_header TYPE STANDARD TABLE OF /inowits/m_trans WITH DEFAULT KEY.

    CLASS-METHODS get_header
      IMPORTING iv_transid       TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id        TYPE zif_mm_mdm_types=>ty_app_id OPTIONAL
      RETURNING VALUE(rs_header) TYPE /inowits/m_trans
      RAISING   zcx_mm_mdm.

    "New request: lock, ID from the existing function module, header, staging rows from the key data, view selection.
    METHODS start_request
      IMPORTING is_start          TYPE zif_mm_mdm_types=>ty_start
                iv_user           TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rv_transid) TYPE zif_mm_mdm_types=>ty_transid
      RAISING   zcx_mm_mdm.

    "Routing keys as GET_WF_PARMTERS and SUBMIT build them in the Web Dynpro app:
    "type = material type; group and business only if flagged in /INOWITS/WF_CONS; plant and brand code always (create submit).
    METHODS derive_routing
      IMPORTING iv_transid        TYPE zif_mm_mdm_types=>ty_transid
      RETURNING VALUE(rs_routing) TYPE zif_mm_mdm_types=>ty_routing.

    METHODS get_allowed
      IMPORTING iv_transid        TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id         TYPE zif_mm_mdm_types=>ty_app_id
                iv_user           TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rs_allowed) TYPE zif_mm_mdm_types=>ty_allowed.

    "Level the field control has to use: level of the open work item, L0 for the initiator
    METHODS get_level
      IMPORTING iv_transid      TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id       TYPE zif_mm_mdm_types=>ty_app_id
                iv_user         TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rv_level) TYPE /inowits/wf_level.

    "Requests for the list: scope mine, inbox or all
    METHODS list
      IMPORTING iv_scope         TYPE string DEFAULT 'all'
                iv_status        TYPE /inowits/m_trans-status OPTIONAL
                iv_mtart         TYPE mtart OPTIONAL
                iv_text          TYPE string OPTIONAL
                iv_user          TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rt_header) TYPE tt_header.

    METHODS set_status
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_status  TYPE /inowits/m_trans-status.

    "Draft delete: only status 00 and only the initiator
    METHODS delete_draft
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

ENDCLASS.

CLASS zcl_mm_mdm_request_svc IMPLEMENTATION.

  METHOD get_header.
    IF iv_app_id IS INITIAL.
      SELECT SINGLE * FROM /inowits/m_trans WHERE transid = @iv_transid INTO @rs_header.
    ELSE.
      SELECT SINGLE * FROM /inowits/m_trans WHERE transid = @iv_transid AND app_id = @iv_app_id INTO @rs_header.
    ENDIF.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( |Request { iv_transid ALPHA = OUT } not found| ).
    ENDIF.
  ENDMETHOD.

  METHOD start_request.
    "Key data checks that the old start screen makes (messages 022 and 003)
    IF is_start-material_type IS INITIAL.
      MESSAGE e022(/inowits/cl_mdm_msg) INTO DATA(lv_t).
      zcx_mm_mdm=>raise_text( iv_text = lv_t iv_code = 'E022' iv_target = 'Material/MTART' ).
    ENDIF.
    IF is_start-views IS INITIAL.
      MESSAGE e003(/inowits/cl_mdm_msg) INTO lv_t.
      zcx_mm_mdm=>raise_text( iv_text = lv_t iv_code = 'E003' ).
    ENDIF.
    "Authorization for material type and plant (messages 000 and 004, V_INIT.AUTH_CHECK) goes here once that method is analysed.

    "The existing function module draws highest value plus one without a lock of its own, so call it under a lock
    "and commit before the lock is released, otherwise a second session cannot see the new row.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = '/INOWITS/M_TRANS' varkey = 'TRANSID_GEN' _wait = 'X'
      EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
    IF sy-subrc <> 0.
      zcx_mm_mdm=>raise_text( 'Could not reserve a request number, please try again' ).
    ENDIF.

    CALL FUNCTION '/INOWITS/M_TRANSID_GENERATE'
      EXPORTING iv_app_id = zif_mm_mdm_types=>gc_app_create
                iv_draft  = COND i( WHEN is_start-draft = abap_true THEN 1 ELSE 0 )
                iv_user   = iv_user
                iv_gen_type = is_start-material_type
      IMPORTING ev_trans_id = rv_transid.
    COMMIT WORK AND WAIT.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING mode_rstable = 'E' tabname = '/INOWITS/M_TRANS' varkey = 'TRANSID_GEN'.

    "Staging rows from the key data
    DATA(lv_maktx) = CONV maktx( is_start-description ).
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/MM_MARA' iv_transid = rv_transid
      it_value = VALUE #( ( name = 'MTART' value = is_start-material_type ) ( name = 'MBRSH' value = is_start-industry_sector )
                          ( name = 'MGRPDES' value = is_start-main_group ) ( name = 'SGRPDES' value = is_start-sub_group )
                          ( name = 'SSGRPDES' value = is_start-sub_sub_group ) ( name = 'MAKTX' value = lv_maktx ) ) ).
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/MM_MAKT' iv_transid = rv_transid
      it_value = VALUE #( ( name = 'SPRAS' value = sy-langu ) ( name = 'MAKTX' value = lv_maktx ) ( name = 'MAKTG' value = to_upper( lv_maktx ) ) ) ).
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/MM_MARC' iv_transid = rv_transid
      it_value = VALUE #( ( name = 'WERKS' value = is_start-plant ) ( name = 'MTART' value = is_start-material_type ) ) ).
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/MM_MVKE' iv_transid = rv_transid
      it_value = VALUE #( ( name = 'VKORG' value = is_start-sales_org ) ( name = 'VTWEG' value = is_start-distribution_channel ) ) ).
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/MM_MARD' iv_transid = rv_transid
      it_value = VALUE #( ( name = 'WERKS' value = is_start-plant ) ( name = 'LGORT' value = is_start-storage_location ) ) ).

    "Selected tabs: one flag per view in /INOWITS/M_VWSEL
    DATA lt_flag TYPE /iwbep/t_mgw_name_value_pair.
    SPLIT is_start-views AT ',' INTO TABLE DATA(lt_views).
    LOOP AT lt_views INTO DATA(lv_view).
      CONDENSE lv_view.
      IF lv_view IS NOT INITIAL. APPEND VALUE #( name = to_upper( lv_view ) value = 'X' ) TO lt_flag. ENDIF.
    ENDLOOP.
    zcl_mm_mdm_staging=>put_row( iv_table = '/INOWITS/M_VWSEL' iv_transid = rv_transid it_value = lt_flag ).
    "No commit here: the caller (action) ends the unit of work. The history rows are written by CL_WF when the workflow starts.
  ENDMETHOD.

  METHOD derive_routing.
    SELECT SINGLE mtart, matkl, zbusiness, zzbrand_code FROM /inowits/mm_mara
      WHERE transid = @iv_transid INTO @DATA(ls_mara).
    SELECT SINGLE werks FROM /inowits/mm_marc WHERE transid = @iv_transid INTO @DATA(lv_werks).

    rs_routing-gen_type = ls_mara-mtart.
    SELECT SINGLE * FROM /inowits/wf_cons WHERE mtart = @ls_mara-mtart INTO @DATA(ls_cons).
    IF sy-subrc = 0.
      IF ls_cons-rq_matkl = 'X'.     rs_routing-gen_field  = ls_mara-matkl.     ENDIF.
      IF ls_cons-rq_business = 'X'.  rs_routing-gen_field2 = ls_mara-zbusiness. ENDIF.
    ENDIF.
    "As in the create SUBMIT of the Web Dynpro app (change and send back do not pass these two, copied as agreed)
    rs_routing-gen_field3 = lv_werks.
    rs_routing-gen_field4 = ls_mara-zzbrand_code.
  ENDMETHOD.

  METHOD get_level.
    DATA(lv_wi) = zcl_mm_mdm_workflow=>get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
    IF lv_wi IS NOT INITIAL.
      rv_level = zcl_mm_mdm_workflow=>get_level( lv_wi ).
    ENDIF.
    IF rv_level IS INITIAL.
      rv_level = zif_mm_mdm_types=>gc_level_initiator.
    ENDIF.
  ENDMETHOD.

  METHOD get_allowed.
    TRY.
        DATA(ls_hdr) = get_header( iv_transid = iv_transid iv_app_id = iv_app_id ).
      CATCH zcx_mm_mdm.
        RETURN.
    ENDTRY.
    DATA(lv_st) = CONV string( ls_hdr-status ).
    "Initiator: draft, requested or sent back
    IF ls_hdr-user_id = iv_user AND ( lv_st = zif_mm_mdm_types=>gc_status-draft OR lv_st = zif_mm_mdm_types=>gc_status-requested
                                      OR lv_st = zif_mm_mdm_types=>gc_status-sent_back ).
      rs_allowed = VALUE #( edit = abap_true validate = abap_true save_draft = abap_true submit = abap_true
                            delete_draft = xsdbool( lv_st = zif_mm_mdm_types=>gc_status-draft ) ).
      RETURN.
    ENDIF.
    "Reviewer or approver: request in progress and an open work item of the user
    IF lv_st = zif_mm_mdm_types=>gc_status-in_progress
       AND zcl_mm_mdm_workflow=>get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ) IS NOT INITIAL.
      rs_allowed = VALUE #( edit = abap_true validate = abap_true approve = abap_true send_back = abap_true reject = abap_true forward = abap_true ).
    ENDIF.
  ENDMETHOD.

  METHOD list.
    DATA lt_all TYPE tt_header.
    DATA lt_open TYPE STANDARD TABLE OF /inowits/m_trans WITH DEFAULT KEY.
    SELECT * FROM /inowits/m_trans WHERE app_id = @zif_mm_mdm_types=>gc_app_create INTO TABLE @lt_all.   "this version: create requests
    IF iv_status IS NOT INITIAL. DELETE lt_all WHERE status <> iv_status. ENDIF.

    IF iv_scope = 'inbox'.
      "open work item of the user (found as CL_WF.SEND_SLA_MAIL does)
      SELECT DISTINCT t~transid, t~app_id FROM /inowits/m_trans AS t
        INNER JOIN swwwihead AS w ON w~top_wi_id = t~top_wi_id
        INNER JOIN swwuserwi AS u ON u~wi_id = w~wi_id
        WHERE w~wi_stat = @zif_mm_mdm_types=>gc_wi_ready AND u~user_id = @iv_user
        INTO CORRESPONDING FIELDS OF TABLE @lt_open.
    ENDIF.

    DATA lt_t TYPE STANDARD TABLE OF /inowits/mm_mara WITH DEFAULT KEY.
    IF iv_mtart IS NOT INITIAL.
      SELECT transid FROM /inowits/mm_mara WHERE mtart = @iv_mtart INTO CORRESPONDING FIELDS OF TABLE @lt_t.
    ENDIF.
    DATA lt_hit TYPE STANDARD TABLE OF /inowits/m_trans WITH DEFAULT KEY.
    IF iv_text IS NOT INITIAL.
      DATA(lv_like) = |%{ to_upper( iv_text ) }%|.
      SELECT t~transid FROM /inowits/m_trans AS t
        LEFT OUTER JOIN /inowits/mm_makt AS m ON m~transid = t~transid
        WHERE upper( t~obj_value ) LIKE @lv_like OR upper( m~maktx ) LIKE @lv_like OR t~transid LIKE @lv_like
        INTO CORRESPONDING FIELDS OF TABLE @lt_hit.
    ENDIF.

    LOOP AT lt_all INTO DATA(ls_h).
      CASE iv_scope.
        WHEN 'mine'.
          IF ls_h-user_id <> iv_user. CONTINUE. ENDIF.
        WHEN 'inbox'.
          "also what was sent back to the user
          IF NOT ( ( ls_h-user_id = iv_user AND ls_h-status = zif_mm_mdm_types=>gc_status-sent_back )
                   OR line_exists( lt_open[ transid = ls_h-transid app_id = ls_h-app_id ] ) ).
            CONTINUE.
          ENDIF.
      ENDCASE.
      IF iv_mtart IS NOT INITIAL AND NOT line_exists( lt_t[ transid = ls_h-transid ] ). CONTINUE. ENDIF.
      IF iv_text IS NOT INITIAL AND NOT line_exists( lt_hit[ transid = ls_h-transid ] ). CONTINUE. ENDIF.
      APPEND ls_h TO rt_header.
    ENDLOOP.
    SORT rt_header BY transid DESCENDING.
  ENDMETHOD.

  METHOD set_status.
    UPDATE /inowits/m_trans SET status = iv_status WHERE transid = iv_transid AND app_id = iv_app_id.
  ENDMETHOD.

  METHOD delete_draft.
    DATA(ls_hdr) = get_header( iv_transid = iv_transid iv_app_id = iv_app_id ).
    IF ls_hdr-status <> zif_mm_mdm_types=>gc_status-draft.
      zcx_mm_mdm=>raise_text( 'Only a draft can be deleted' ).
    ENDIF.
    IF ls_hdr-user_id <> iv_user.
      zcx_mm_mdm=>raise_text( 'Only the initiator can delete this draft' ).
    ENDIF.
    "Lock as the Web Dynpro screens do: ENQUEUE_/INOWITS/MDM_MM with the parameters of the existing code.
    LOOP AT zcl_mm_mdm_naming=>delete_tables( ) INTO DATA(lv_tab).
      DELETE FROM (lv_tab) WHERE transid = iv_transid.
    ENDLOOP.
    DELETE FROM /inowits/m_trans WHERE transid = iv_transid AND app_id = iv_app_id.
    "No commit: the Gateway ends the unit of work.
  ENDMETHOD.

ENDCLASS.
