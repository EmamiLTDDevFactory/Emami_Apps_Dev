"! Workflow wrapper. Calls the existing class /INOWITS/CL_WF in the order the Web Dynpro controllers use,
"! always as the logged-in user. CL_WF commits by itself, so every method of this class is the LAST step of an action.
CLASS zcl_mm_mdm_workflow DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_mail,
             initiator_mail TYPE string,
             mail_ids       TYPE /inowits/m_mail_id_tt,
           END OF ty_mail.

    "Mails the caller has to send after the action (the old app sends them from the controller: SEND_APPR_MAIL, APPR_MAIL)
    DATA ms_mail TYPE ty_mail READ-ONLY.

    METHODS constructor IMPORTING io_req TYPE REF TO zcl_mm_mdm_request_svc.

    "First submit (status 00 or 01): simulate, start, complete the initiator step. After send back (04): resubmit.
    METHODS submit
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

    "Not the last level: MAT_COMPLETE. Last level: the poster, then COMPLETE.
    METHODS approve
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_comment TYPE string OPTIONAL
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

    METHODS send_back
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_comment TYPE string OPTIONAL
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

    METHODS reject
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

    METHODS forward
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id  TYPE zif_mm_mdm_types=>ty_app_id
                iv_agent   TYPE syuname
                iv_user    TYPE syuname DEFAULT sy-uname
      RAISING   zcx_mm_mdm.

    "Open (READY) work item of the user for this request, as CL_WF.SEND_SLA_MAIL finds it
    CLASS-METHODS get_open_workitem
      IMPORTING iv_transid          TYPE zif_mm_mdm_types=>ty_transid
                iv_app_id           TYPE zif_mm_mdm_types=>ty_app_id
                iv_user             TYPE syuname DEFAULT sy-uname
      RETURNING VALUE(rv_workitem)  TYPE swr_struct-workitemid.

    "Level of a work item (container element LEVEL, as CL_WF.REJECT reads it)
    CLASS-METHODS get_level
      IMPORTING iv_workitem     TYPE swr_struct-workitemid
      RETURNING VALUE(rv_level) TYPE /inowits/wf_level.

  PRIVATE SECTION.
    DATA mo_req TYPE REF TO zcl_mm_mdm_request_svc.

    "Messages of CL_WF (type /INOWITS/WF_MSG_TT) to the shared message table. Adjust to the real line structure.
    METHODS to_msgs
      IMPORTING it_wf         TYPE ANY TABLE
      RETURNING VALUE(rt_msg) TYPE zif_mm_mdm_types=>tt_msg.

    METHODS check
      IMPORTING it_wf TYPE ANY TABLE
      RAISING   zcx_mm_mdm.

    METHODS text_for
      IMPORTING iv_transid TYPE zif_mm_mdm_types=>ty_transid
      RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.

CLASS zcl_mm_mdm_workflow IMPLEMENTATION.

  METHOD constructor.
    mo_req = io_req.
  ENDMETHOD.

  METHOD submit.
    DATA(ls_hdr) = zcl_mm_mdm_request_svc=>get_header( iv_transid = iv_transid iv_app_id = iv_app_id ).
    DATA(ls_r)   = mo_req->derive_routing( iv_transid ).
    DATA lt_msg  TYPE /inowits/wf_msg_tt.
    DATA lv_wid  TYPE swr_struct-workitemid.
    DATA lv_nxt  TYPE char1.
    DATA lt_agent TYPE /inowits/m_agent_tt.
    DATA lv_text TYPE string.

    IF ls_hdr-status = zif_mm_mdm_types=>gc_status-sent_back.
      "Initiator corrects a request that was sent back
      lv_wid = get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
      IF lv_wid IS INITIAL.
        zcx_mm_mdm=>raise_text( 'No open work item for you on this request' ).
      ENDIF.
      /inowits/cl_wf=>re_submit(
        EXPORTING iv_workitem_id = lv_wid iv_workitem_text = text_for( iv_transid ) iv_uname = iv_user
        IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_mail_id = ms_mail-mail_ids
                  ev_is_next_lvl = lv_nxt et_message = lt_msg et_agent = lt_agent ).
      check( lt_msg ).
      RETURN.
    ENDIF.

    "1. Simulation: finds missing agents or definitions before anything is started
    /inowits/cl_wf=>mat_start(
      EXPORTING iv_app_id = iv_app_id iv_gen_type = ls_r-gen_type iv_gen_field = ls_r-gen_field iv_gen_field2 = ls_r-gen_field2
                iv_gen_field3 = ls_r-gen_field3 iv_gen_field4 = ls_r-gen_field4 iv_simulate = 'X'
      IMPORTING et_message = lt_msg ).
    check( lt_msg ).
    CLEAR lt_msg.

    "2. Start the workflow for this request
    lv_text = text_for( iv_transid ).
    /inowits/cl_wf=>mat_start(
      EXPORTING iv_app_id = iv_app_id iv_gen_type = ls_r-gen_type iv_gen_field = ls_r-gen_field iv_gen_field2 = ls_r-gen_field2
                iv_gen_field3 = ls_r-gen_field3 iv_gen_field4 = ls_r-gen_field4 iv_trans_id = iv_transid iv_workitem_text = lv_text
      IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_mail_id = ms_mail-mail_ids ev_is_next_lvl = lv_nxt
                ev_workitem_id = lv_wid et_message = lt_msg et_agent = lt_agent ).
    check( lt_msg ).
    CLEAR lt_msg.

    "3. Complete the initiator step, which passes the request to the first reviewer
    "   (to confirm in a debug run: the old SUBMIT completes the work item returned by the start)
    /inowits/cl_wf=>complete(
      EXPORTING iv_workitem_id = lv_wid iv_workitem_text = lv_text
      IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_mail_id = ms_mail-mail_ids ev_is_next_lvl = lv_nxt
                et_message = lt_msg et_agent = lt_agent ).
    check( lt_msg ).
  ENDMETHOD.

  METHOD approve.
    DATA lt_msg   TYPE /inowits/wf_msg_tt.
    DATA lv_final TYPE char1.
    DATA lv_nxt   TYPE char1.
    DATA lt_agent TYPE /inowits/m_agent_tt.

    DATA(lv_wid) = get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
    IF lv_wid IS INITIAL.
      zcx_mm_mdm=>raise_text( 'No open work item for you on this request' ).
    ENDIF.

    /inowits/cl_wf=>get_final( EXPORTING iv_workitem_id = lv_wid IMPORTING ev_is_final = lv_final et_message = lt_msg ).
    check( lt_msg ).
    CLEAR lt_msg.

    IF lv_final = 'X'.
      "Last level: post the material (STND_UPDATE), then complete the work item
      NEW zcl_mm_mdm_poster( )->post( iv_transid = iv_transid iv_app_id = iv_app_id ).
      /inowits/cl_wf=>complete(
        EXPORTING iv_workitem_id = lv_wid iv_workitem_text = iv_comment
        IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_mail_id = ms_mail-mail_ids ev_is_next_lvl = lv_nxt
                  et_message = lt_msg et_agent = lt_agent ).
    ELSE.
      /inowits/cl_wf=>mat_complete(
        EXPORTING iv_workitem_id = lv_wid iv_workitem_text = iv_comment
        IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_mail_id = ms_mail-mail_ids ev_is_next_lvl = lv_nxt
                  et_message = lt_msg et_agent = lt_agent ).
    ENDIF.
    check( lt_msg ).
  ENDMETHOD.

  METHOD send_back.
    DATA lt_msg   TYPE /inowits/wf_msg_tt.
    DATA lv_nxt   TYPE char1.
    DATA lt_agent TYPE /inowits/m_agent_tt.
    DATA(lv_wid) = get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
    IF lv_wid IS INITIAL.
      zcx_mm_mdm=>raise_text( 'No open work item for you on this request' ).
    ENDIF.
    /inowits/cl_wf=>sendback(
      EXPORTING iv_workitem_id = lv_wid iv_workitem_text = iv_comment
      IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail ev_is_next_lvl = lv_nxt et_message = lt_msg
                et_agent = lt_agent et_mail_id = ms_mail-mail_ids ).
    check( lt_msg ).
  ENDMETHOD.

  METHOD reject.
    DATA lt_msg TYPE /inowits/wf_msg_tt.
    DATA(lv_wid) = get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
    IF lv_wid IS INITIAL.
      zcx_mm_mdm=>raise_text( 'No open work item for you on this request' ).
    ENDIF.
    /inowits/cl_wf=>reject(
      EXPORTING iv_workitem_id = lv_wid
      IMPORTING ev_initiator_mail_id = ms_mail-initiator_mail et_message = lt_msg et_mail_id = ms_mail-mail_ids ).
    check( lt_msg ).
  ENDMETHOD.

  METHOD forward.
    DATA lt_lines TYPE /inowits/swr_messag_tt.
    DATA(lv_wid) = get_open_workitem( iv_transid = iv_transid iv_app_id = iv_app_id iv_user = iv_user ).
    IF lv_wid IS INITIAL.
      zcx_mm_mdm=>raise_text( 'No open work item for you on this request' ).
    ENDIF.
    DATA(lv_lvl) = get_level( lv_wid ).
    "Type of level: reviewer or approver. FORWARD_SAVE in the old app decides it from the level definition;
    "reviewer is used here until that method is analysed.
    /inowits/cl_wf=>forward_agent(
      EXPORTING lv_wi_id = lv_wid lv_old_agent = iv_user lv_new_agent = iv_agent lv_lvl = lv_lvl type_lvl = 'R'
      IMPORTING lt_lines = lt_lines ).
    check( lt_lines ).
  ENDMETHOD.

  METHOD get_open_workitem.
    SELECT SINGLE top_wi_id FROM /inowits/m_trans
      WHERE transid = @iv_transid AND app_id = @iv_app_id INTO @DATA(lv_top).
    CHECK sy-subrc = 0 AND lv_top IS NOT INITIAL.
    SELECT a~wi_id FROM swwwihead AS a
      INNER JOIN swwuserwi AS b ON a~wi_id = b~wi_id
      WHERE a~top_wi_id = @lv_top AND a~wi_stat = @zif_mm_mdm_types=>gc_wi_ready AND b~user_id = @iv_user
      ORDER BY a~wi_id DESCENDING
      INTO @DATA(lv_wi) UP TO 1 ROWS.
    ENDSELECT.
    IF sy-subrc = 0.
      rv_workitem = lv_wi.
    ENDIF.
  ENDMETHOD.

  METHOD get_level.
    DATA lt_cont TYPE /inowits/wf_container_tt.
    DATA lt_msg  TYPE /inowits/wf_msg_tt.
    /inowits/cl_wf=>read( EXPORTING iv_workitem_id = iv_workitem IMPORTING et_container = lt_cont et_message = lt_msg ).
    LOOP AT lt_cont ASSIGNING FIELD-SYMBOL(<c>).
      ASSIGN COMPONENT 'ELEMENT' OF STRUCTURE <c> TO FIELD-SYMBOL(<e>).
      CHECK sy-subrc = 0 AND <e> = 'LEVEL'.
      ASSIGN COMPONENT 'VALUE' OF STRUCTURE <c> TO FIELD-SYMBOL(<v>).
      IF sy-subrc = 0. rv_level = <v>. ENDIF.
      EXIT.
    ENDLOOP.
  ENDMETHOD.

  METHOD to_msgs.
    LOOP AT it_wf ASSIGNING FIELD-SYMBOL(<l>).
      DATA(ls) = VALUE zif_mm_mdm_types=>ty_msg( code = 'WF' severity = 'E' ).
      "type of the message: first matching component
      LOOP AT VALUE string_table( ( `MSGTY` ) ( `MESSAGE_TYPE` ) ( `TYPE` ) ) INTO DATA(lv_tc).
        ASSIGN COMPONENT lv_tc OF STRUCTURE <l> TO FIELD-SYMBOL(<ty>).
        IF sy-subrc = 0. ls-severity = COND #( WHEN <ty> = 'E' OR <ty> = 'A' THEN 'E' WHEN <ty> = 'W' THEN 'W' ELSE 'I' ). EXIT. ENDIF.
      ENDLOOP.
      "text of the message: first matching component, else all character components joined
      LOOP AT VALUE string_table( ( `MESSAGE` ) ( `TEXT` ) ( `MSGTXT` ) ) INTO DATA(lv_xc).
        ASSIGN COMPONENT lv_xc OF STRUCTURE <l> TO FIELD-SYMBOL(<tx>).
        IF sy-subrc = 0. ls-message = <tx>. EXIT. ENDIF.
      ENDLOOP.
      IF ls-message IS INITIAL.
        DO.
          ASSIGN COMPONENT sy-index OF STRUCTURE <l> TO FIELD-SYMBOL(<any>).
          IF sy-subrc <> 0. EXIT. ENDIF.
          ls-message = |{ ls-message } { <any> }|.
        ENDDO.
        CONDENSE ls-message.
      ENDIF.
      APPEND ls TO rt_msg.
    ENDLOOP.
  ENDMETHOD.

  METHOD check.
    DATA(lt) = to_msgs( it_wf ).
    DELETE lt WHERE severity <> 'E'.
    IF lt IS NOT INITIAL.
      zcx_mm_mdm=>raise_msgs( lt ).
    ENDIF.
  ENDMETHOD.

  METHOD text_for.
    SELECT SINGLE maktx FROM /inowits/mm_makt WHERE transid = @iv_transid INTO @DATA(lv_desc).
    rv_text = |{ iv_transid ALPHA = OUT } { lv_desc }|.
  ENDMETHOD.

ENDCLASS.
