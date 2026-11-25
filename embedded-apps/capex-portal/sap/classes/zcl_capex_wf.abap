class ZCL_CAPEX_WF definition
  public
  final
  create public .

public section.

  types:
    BEGIN OF ty_prestep,
             role     TYPE zcapex_de_role,
             approver TYPE xubname,
             acted_on TYPE datum,
             comments TYPE zcapex_de_ltext,
           END OF ty_prestep .
  types:
    tt_prestep TYPE STANDARD TABLE OF ty_prestep WITH DEFAULT KEY .

    "! Opens a new cycle: automatic pre-steps (CPE: initiator + technical), then the DOA chain.
  class-methods SUBMIT
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_CAPEXTYPE type ZCAPEX_DE_CPXTYPE optional
      !IV_AMOUNT type ZCAPEX_DE_AMOUNT
      !IT_PRESTEPS type TT_PRESTEP optional
      !IT_CHAIN type ZCAPEX_TT_DOACHN optional
    exporting
      !ES_FIRST type ZCAPEX_WFLOG
      !EV_DOAID type ZCAPEX_DE_DOAID
    raising
      ZCX_CAPEX_ERROR .
    "! A approve, R reject, B send back, H hold, U resume.
  class-methods ACT
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_DECISION type ZCAPEX_DE_DECISION
      !IV_COMMENTS type CSEQUENCE optional
      !IV_ROLLOUT type ABAP_BOOL default ABAP_FALSE
      !IV_ADMIN_ALL type ABAP_BOOL default ABAP_FALSE
    returning
      value(RV_STATUS) type ZCAPEX_DE_STATUS
    raising
      ZCX_CAPEX_ERROR .
  class-methods DERIVE_STATUS
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_HEADER_STATUS type ZCAPEX_DE_STATUS optional
    exporting
      !EV_STATUS type ZCAPEX_DE_STATUS
      !EV_CURRENT_LEVEL type ZCAPEX_DE_ROLE
      !EV_DAYS_PENDING type ZCAPEX_DE_DAYS
      !EV_DUE_ON type DATUM .
  class-methods GET_STEPS
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
    returning
      value(RT_STEPS) type ZCAPEX_TT_WFLOG .
  class-methods CURRENT_CYCLE
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
    returning
      value(RV_CYCLE) type ZCAPEX_DE_CYCLE .
    "! Named approver, anyone holding the role, or an admin (config ADMIN_CAN_APPROVE).
  class-methods CAN_ACT
    importing
      !IS_STEP type ZCAPEX_WFLOG
    returning
      value(RV_CAN) type ABAP_BOOL .
    "! Daily job ZCAPEX_R_SLA_CHECK.
  class-methods RUN_SLA_CHECK .
private section.

  class-methods FIND_DOA
    importing
      !IV_CAPEXTYPE type ZCAPEX_DE_CPXTYPE
      !IV_AMOUNT type ZCAPEX_DE_AMOUNT
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE optional
    returning
      value(RV_DOAID) type ZCAPEX_DE_DOAID
    raising
      ZCX_CAPEX_ERROR .
  class-methods LOCK_DOC
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type ZCAPEX_DE_DOCID
    raising
      ZCX_CAPEX_ERROR .
  class-methods ROUTE_OF
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_FOR_OWNER type ABAP_BOOL default ABAP_FALSE
    exporting
      !EV_ROUTE type ZCAPEX_DE_ROUTE
      !EV_PARAM type ZCAPEX_DE_RPARAM .
  class-methods NOTIFY_STEP
    importing
      !IS_STEP type ZCAPEX_WFLOG
      !IV_TITLE type CSEQUENCE
      !IV_WERKS type WERKS_D .
  class-methods DOC_LABEL
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
    returning
      value(RV_LABEL) type STRING .
  class-methods ON_FINAL_APPROVAL
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type ZCAPEX_DE_DOCID .
  class-methods ON_CLOSED
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type ZCAPEX_DE_DOCID .
ENDCLASS.



CLASS ZCL_CAPEX_WF IMPLEMENTATION.


  METHOD act.
    DATA: lt_next  TYPE zcapex_tt_wflog,
          ls_next  TYPE zcapex_wflog,
          lv_level TYPE zcapex_de_role,
          lv_docid TYPE zcapex_de_docid.

    lv_docid = iv_docid.
    lock_doc( iv_doctype = iv_doctype iv_docid = lv_docid ).
    DATA(ls_head) = zcl_capex_doc=>read( iv_doctype = iv_doctype iv_docid = lv_docid ).
    " Admins act across all plants.
    IF zcl_capex_auth=>is_admin( ) = abap_false.
      zcl_capex_auth=>check_plant( ls_head-werks ).
    ENDIF.

    DATA(lv_cycle) = current_cycle( iv_doctype = iv_doctype iv_docid = lv_docid ).
    SELECT SINGLE * FROM zcapex_wflog INTO @DATA(ls_cur)
      WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle
        AND is_current = @abap_true.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_pending_step iv_1 = lv_docid ).
    ENDIF.

    " ---- who may act
    IF iv_decision = 'U'.
      IF ls_cur-status <> 'HOLD'.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                                iv_1 = iv_doctype iv_2 = lv_docid iv_3 = ls_cur-status ).
      ENDIF.
      " The initiator answers the clarification; the approver or an admin may also resume.
      IF ls_head-created_by <> zcl_capex_auth=>effective_user( ) AND can_act( ls_cur ) = abap_false.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_authorised iv_1 = lv_docid iv_2 = ls_cur-role ).
      ENDIF.
    ELSE.
      IF ls_cur-status <> 'PENDING' AND ls_cur-status <> 'HOLD'.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                                iv_1 = iv_doctype iv_2 = lv_docid iv_3 = ls_cur-status ).
      ENDIF.
      IF can_act( ls_cur ) = abap_false.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_authorised iv_1 = lv_docid iv_2 = ls_cur-role ).
      ENDIF.
    ENDIF.

    " ---- a reason is mandatory for reject, send back and hold (ApprovalDetail: >= 10 characters)
    DATA(lv_min) = zcl_capex_config=>get_int( 'COMMENT_MIN_CHARS' ).
    IF ( iv_decision = 'R' OR iv_decision = 'B' OR iv_decision = 'H' )
       AND strlen( condense( CONV string( iv_comments ) ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-comment_required iv_1 = lv_min ).
    ENDIF.

    IF iv_decision <> 'U'.
      ls_cur-actual_appr = zcl_capex_auth=>effective_user( ).
      ls_cur-acted_on    = sy-datum.
      ls_cur-acted_at    = sy-uzeit.
      ls_cur-comments    = iv_comments.
    ENDIF.
    CASE iv_decision.
      WHEN 'A'. " ---------------------------------------------------------- approve
        ls_cur-status     = 'APPROVED'.
        ls_cur-is_current = abap_false.
        ls_cur-rollout    = iv_rollout.
        UPDATE zcapex_wflog FROM @ls_cur.

        SELECT * FROM zcapex_wflog INTO TABLE @lt_next
          WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle
            AND levelnr > @ls_cur-levelnr AND status = 'WAITING'
                    ORDER BY levelnr.
        " An admin approval closes every remaining level in one go (each level is logged as approved by the admin).
        IF zcl_capex_auth=>is_admin( ) = abap_true AND iv_decision = 'A'.
          LOOP AT lt_next ASSIGNING FIELD-SYMBOL(<ls_skip>).
            <ls_skip>-status      = 'APPROVED'.
            <ls_skip>-is_current  = abap_false.
            <ls_skip>-actual_appr = zcl_capex_auth=>effective_user( ).
            <ls_skip>-acted_on    = sy-datum.
            <ls_skip>-acted_at    = sy-uzeit.
            <ls_skip>-comments    = |Approved by admin { zcl_capex_auth=>effective_user( ) } on behalf of { <ls_skip>-role }|.
            UPDATE zcapex_wflog FROM @<ls_skip>.
          ENDLOOP.
          CLEAR lt_next.
        ENDIF.
        READ TABLE lt_next INTO ls_next INDEX 1.
        IF sy-subrc = 0.
          ls_next-status     = 'PENDING'.
          ls_next-is_current = abap_true.
          ls_next-reached_on = sy-datum.
          ls_next-reached_at = sy-uzeit.
          ls_next-due_on     = sy-datum + ls_next-sla_days.
          UPDATE zcapex_wflog FROM @ls_next.
          rv_status = 'IN_APPROVAL'.
          lv_level  = ls_next-role.
          notify_step( is_step = ls_next iv_title = |{ lv_docid } awaiting your approval| iv_werks = ls_head-werks ).
        ELSE.
          rv_status = 'APPROVED'.
          lv_level  = 'Completed'.
        ENDIF.
        IF iv_rollout = abap_true AND iv_doctype = 'CPE'.
          UPDATE zcapex_cpe SET rollout_flag = @abap_true WHERE cpeid = @lv_docid.
        ENDIF.

      WHEN 'R'. " ---------------------------------------------------------- reject
        ls_cur-status     = 'REJECTED'.
        ls_cur-is_current = abap_false.
        UPDATE zcapex_wflog FROM @ls_cur.
        UPDATE zcapex_wflog SET status = 'NOT_STARTED'
          WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle AND status = 'WAITING'.
        rv_status = 'REJECTED'.
        lv_level  = 'Returned to initiator'.

      WHEN 'B'. " ---------------------------------------------------------- send back
        " The cycle is closed but kept; resubmission opens cycle + 1 against the DOA as it stands then.
        ls_cur-status     = 'RETURNED'.
        ls_cur-is_current = abap_false.
        UPDATE zcapex_wflog FROM @ls_cur.
        UPDATE zcapex_wflog SET status = 'NOT_STARTED'
          WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle AND status = 'WAITING'.
        rv_status = 'DRAFT'.
        lv_level  = 'Returned to initiator'.

      WHEN 'H'. " ---------------------------------------------------------- hold (SLA paused)
        ls_cur-status = 'HOLD'.
        UPDATE zcapex_wflog FROM @ls_cur.
        rv_status = 'HOLD'.
        lv_level  = |On hold with { ls_cur-role }|.

      WHEN 'U'. " ---------------------------------------------------------- resume
        ls_cur-status     = 'PENDING'.
        ls_cur-reached_on = sy-datum.          " SLA clock restarts
        ls_cur-reached_at = sy-uzeit.
        ls_cur-due_on     = sy-datum + ls_cur-sla_days.
        ls_cur-escalated  = abap_false.
        UPDATE zcapex_wflog FROM @ls_cur.
        rv_status = 'IN_APPROVAL'.
        lv_level  = ls_cur-role.
        notify_step( is_step = ls_cur iv_title = |{ lv_docid } resumed - awaiting your approval| iv_werks = ls_head-werks ).

      WHEN OTHERS.
        zcx_capex_error=>raise_text( |Unknown decision { iv_decision }| ).
    ENDCASE.

    zcl_capex_doc=>update_status( iv_doctype = iv_doctype iv_docid = lv_docid
                                  iv_status = rv_status iv_curr_level = lv_level ).

    DATA(lv_action) = SWITCH string( iv_decision
                        WHEN 'A' THEN COND string( WHEN iv_rollout = abap_true THEN `Approved (rollout) at `
                                                   ELSE `Approved at ` )
                        WHEN 'R' THEN `Rejected at `
                        WHEN 'B' THEN `Sent back at `
                        WHEN 'H' THEN `Placed on hold at `
                        ELSE          `Resumed at ` ) && ls_cur-role.

    zcl_capex_log=>status( iv_doctype = iv_doctype iv_docid = lv_docid
                           iv_from = ls_head-status iv_to = rv_status
                           iv_reason = lv_action iv_comment = iv_comments ).
    zcl_capex_log=>audit( iv_doctype = iv_doctype iv_docid = lv_docid
                          iv_action = lv_action iv_comment = iv_comments ).

    " Tell the initiator whenever the decision comes back to them.
    IF rv_status = 'APPROVED' OR rv_status = 'REJECTED' OR rv_status = 'DRAFT' OR rv_status = 'HOLD'.
      route_of( EXPORTING iv_doctype = iv_doctype iv_for_owner = abap_true
                IMPORTING ev_route = DATA(lv_route) ev_param = DATA(lv_param) ).
      zcl_capex_log=>notify(
        iv_doctype     = iv_doctype
        iv_docid       = lv_docid
        iv_recipient   = ls_head-created_by
        iv_title       = SWITCH string( rv_status
                           WHEN 'APPROVED' THEN |{ lv_docid } fully approved|
                           WHEN 'REJECTED' THEN |{ lv_docid } rejected at { ls_cur-role }|
                           WHEN 'DRAFT'    THEN |{ lv_docid } sent back for changes|
                           ELSE                 |{ lv_docid } on hold - clarification needed| )
        iv_message     = iv_comments
        iv_icon        = SWITCH string( rv_status WHEN 'APPROVED' THEN `sap-icon://accept`
                                                  WHEN 'HOLD'     THEN `sap-icon://pending`
                                                  ELSE                 `sap-icon://decline` )
        iv_route       = lv_route
        iv_param_name  = lv_param
        iv_param_value = lv_docid ).
    ENDIF.

    " Every approval that moves the document on also tells the initiator where it stands now
    " (the next approver is notified by notify_step; both go out as e-mail through zcl_capex_log=>notify).
    IF rv_status = 'IN_APPROVAL' AND iv_decision = 'A'.
      route_of( EXPORTING iv_doctype = iv_doctype iv_for_owner = abap_true
                IMPORTING ev_route = DATA(lv_route_i) ev_param = DATA(lv_param_i) ).
      zcl_capex_log=>notify(
        iv_doctype     = iv_doctype
        iv_docid       = lv_docid
        iv_recipient   = ls_head-created_by
        iv_title       = |{ lv_docid } approved at { ls_cur-role } - now with { lv_level }|
        iv_message     = |{ lv_docid } was approved by { zcl_capex_auth=>effective_user( ) } ({ ls_cur-role }) and is now awaiting { lv_level }.|
                         && COND string( WHEN iv_comments IS NOT INITIAL THEN | Comment: { iv_comments }| )
        iv_icon        = `sap-icon://accept`
        iv_route       = lv_route_i
        iv_param_name  = lv_param_i
        iv_param_value = lv_docid ).
    ENDIF.
    IF rv_status = 'APPROVED'.
      on_final_approval( iv_doctype = iv_doctype iv_docid = lv_docid ).
    ELSEIF rv_status = 'REJECTED' OR iv_decision = 'B'.
      on_closed( iv_doctype = iv_doctype iv_docid = lv_docid ).
    ENDIF.
  ENDMETHOD.


  METHOD can_act.
    IF is_step-approver IS NOT INITIAL AND is_step-approver = zcl_capex_auth=>effective_user( ).
      rv_can = abap_true.
      RETURN.
    ENDIF.
    IF zcl_capex_auth=>has_role( iv_role = is_step-role ) = abap_true.
      rv_can = abap_true.
      RETURN.
    ENDIF.
    IF zcl_capex_config=>get_flag( 'ADMIN_CAN_APPROVE' ) = abap_true
       AND zcl_capex_auth=>is_admin( ) = abap_true.
      rv_can = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD current_cycle.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    SELECT MAX( cyclenr ) FROM zcapex_wflog INTO @rv_cycle
      WHERE doctype = @iv_doctype AND docid = @lv_docid.
  ENDMETHOD.


  METHOD derive_status.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    CLEAR: ev_current_level, ev_days_pending, ev_due_on.
    ev_status = iv_header_status.

    DATA(lv_cycle) = current_cycle( iv_doctype = iv_doctype iv_docid = lv_docid ).
    IF lv_cycle IS INITIAL.
      RETURN.
    ENDIF.
    SELECT * FROM zcapex_wflog INTO TABLE @DATA(lt_log)
      WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle
      ORDER BY levelnr.
    IF lt_log IS INITIAL.
      RETURN.
    ENDIF.

    IF line_exists( lt_log[ status = 'REJECTED' ] ).
      ev_status        = 'REJECTED'.
      ev_current_level = 'Returned to initiator'.
    ELSEIF line_exists( lt_log[ status = 'RETURNED' ] ).
      " Sent back: the header tells where the document went next (DRAFT, UNDER_EVALUATION ...).
      IF ev_status IS INITIAL OR ev_status = 'IN_APPROVAL' OR ev_status = 'HOLD' OR ev_status = 'APPROVED'.
        ev_status = 'DRAFT'.
      ENDIF.
      ev_current_level = 'Returned to initiator'.
    ELSE.
      READ TABLE lt_log INTO DATA(ls_open) WITH KEY status = 'HOLD'.
      IF sy-subrc = 0.
        ev_status        = 'HOLD'.
        ev_current_level = |On hold with { ls_open-role }|.
        ev_days_pending  = sy-datum - ls_open-reached_on.
        ev_due_on        = ls_open-due_on.
      ELSE.
        READ TABLE lt_log INTO ls_open WITH KEY status = 'PENDING'.
        IF sy-subrc = 0.
          ev_status        = 'IN_APPROVAL'.
          ev_current_level = ls_open-role.
          ev_days_pending  = sy-datum - ls_open-reached_on.
          ev_due_on        = ls_open-due_on.
        ELSE.
          ev_status        = 'APPROVED'.
          ev_current_level = 'Completed'.   " the app's own label
        ENDIF.
      ENDIF.
    ENDIF.

    IF iv_doctype = 'QUOTA' AND ev_status = 'IN_APPROVAL'.
      ev_status = 'PENDING'.
    ENDIF.
  ENDMETHOD.


  METHOD doc_label.
    rv_label = SWITCH #( iv_doctype
                         WHEN 'BUD'   THEN `Budget`
                         WHEN 'CPE'   THEN `CPE`
                         WHEN 'QUOTA' THEN `Unit quota capex`
                         ELSE              `Document` ).
  ENDMETHOD.


  METHOD find_doa.
    " AMOUNT_TO = 0 means "no upper bound"; the narrowest (highest AMOUNT_FROM) band wins.
*    SELECT doaid, amount_from FROM zcapex_doa INTO TABLE @DATA(lt_doa)
*      WHERE capextype   =  @iv_capextype
*        AND amount_from <= @iv_amount
*        AND ( amount_to >= @iv_amount OR amount_to = 0 )
*        AND active      =  @abap_true
*        AND valid_from  <= @sy-datum
*        AND ( valid_to >= @sy-datum OR valid_to = '00000000' ).
*    SORT lt_doa BY amount_from DESCENDING.
*    READ TABLE lt_doa INTO DATA(ls_doa) INDEX 1.
*    IF sy-subrc <> 0.
*      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_doa_match
*                              iv_1 = iv_capextype iv_2 = zcl_capex_util=>lakhs( iv_amount ) ).
*    ENDIF.
*    rv_doaid = ls_doa-doaid.

    SELECT doaid, capextype, amount_from FROM zcapex_doa INTO TABLE @DATA(lt_doa)
      WHERE doctype     =  @iv_doctype
        AND ( capextype =  @iv_capextype OR capextype = '*' )
        AND amount_from <= @iv_amount
        AND ( amount_to >= @iv_amount OR amount_to = 0 )
        AND active      =  @abap_true
        AND valid_from  <= @sy-datum
        AND ( valid_to >= @sy-datum OR valid_to = '00000000' ).
    " Exact capex type before '*', then the narrowest band.
    SORT lt_doa BY capextype DESCENDING amount_from DESCENDING.
    READ TABLE lt_doa INTO DATA(ls_doa) INDEX 1.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_doa_match
                              iv_1 = |{ iv_doctype }/{ iv_capextype }| iv_2 = zcl_capex_util=>lakhs( iv_amount ) ).
    ENDIF.
    rv_doaid = ls_doa-doaid.

  ENDMETHOD.


  METHOD get_steps.
    DATA lv_docid TYPE zcapex_de_docid.
    lv_docid = iv_docid.
    DATA(lv_cycle) = current_cycle( iv_doctype = iv_doctype iv_docid = lv_docid ).
    IF lv_cycle IS INITIAL.
      RETURN.
    ENDIF.
    SELECT * FROM zcapex_wflog INTO TABLE @rt_steps
      WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle
      ORDER BY levelnr.
  ENDMETHOD.


  METHOD lock_doc.
    CALL FUNCTION 'ENQUEUE_EZCAPEX_WFDOC'
      EXPORTING
        doctype        = iv_doctype
        docid          = iv_docid
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc = 1.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-locked iv_1 = iv_docid iv_2 = sy-msgv1 ).
    ELSEIF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = iv_docid ).
    ENDIF.
    " Released when the stateless Gateway request (or the job step) ends.
  ENDMETHOD.


  METHOD notify_step.
    route_of( EXPORTING iv_doctype = is_step-doctype
              IMPORTING ev_route = DATA(lv_route) ev_param = DATA(lv_param) ).
    IF is_step-approver IS NOT INITIAL.
      zcl_capex_log=>notify( iv_doctype = is_step-doctype iv_docid = is_step-docid
                             iv_recipient = is_step-approver iv_title = iv_title
                             iv_route = lv_route iv_param_name = lv_param iv_param_value = is_step-docid ).
    ELSE.
      zcl_capex_log=>notify_role( iv_role = is_step-role iv_werks = iv_werks
                                  iv_doctype = is_step-doctype iv_docid = is_step-docid
                                  iv_title = iv_title iv_route = lv_route
                                  iv_param_name = lv_param iv_param_value = is_step-docid ).
    ENDIF.
  ENDMETHOD.


  METHOD on_closed.
    " A rejected or sent-back CPE gives its commitment back to the budget(s).
    IF iv_doctype = 'CPE'.
      zcl_capex_budget=>release_cpe( CONV #( iv_docid ) ).
    ENDIF.
  ENDMETHOD.


  METHOD on_final_approval.
    CASE iv_doctype.
      WHEN 'BUD'.
        DATA(lv_budgetid) = CONV zcapex_de_budgetid( iv_docid ).
        UPDATE zcapex_budget SET approved_on = @sy-datum WHERE budgetid = @lv_budgetid.
        SELECT SINGLE funding_src, src_aufnr FROM zcapex_budget INTO @DATA(ls_bud)
          WHERE budgetid = @lv_budgetid.
        IF ls_bud-funding_src = 'EXIST_IO' AND ls_bud-src_aufnr IS NOT INITIAL.
          UPDATE zcapex_budget SET aufnr = @ls_bud-src_aufnr WHERE budgetid = @lv_budgetid.
          zcl_capex_log=>audit( iv_doctype = 'BUD' iv_docid = iv_docid
                                iv_action = 'Linked to existing internal order'
                                iv_comment = |IO { ls_bud-src_aufnr }| ).
        ELSE.
          " Posted by job ZCAPEX_R_SAP_POST after this LUW commits; an SAP error can never undo the approval.
          zcl_capex_sap=>queue( iv_doctype = 'BUD' iv_docid = iv_docid iv_action = 'IO_CREATE' ).
          zcl_capex_log=>audit( iv_doctype = 'BUD' iv_docid = iv_docid
                                iv_action = 'SAP Internal Order creation queued' ).

          " Start the posting job as soon as this approval has been saved: a one-shot background job 30 s
          " from now (so the queue row is committed and visible) runs ZCAPEX_R_SAP_POST. The IO is therefore
          " created right after the final budget approval, and an SAP error still cannot undo the approval.
          " Failed postings stay in ZCAPEX_SAPQ (status E) and are retried when the job next runs.
          DATA: lv_jobname  TYPE tbtcjob-jobname VALUE 'ZCAPEX_SAP_POST_NOW',
                lv_jobcount TYPE tbtcjob-jobcount,
                lv_jobdate  TYPE sy-datum,
                lv_jobtime  TYPE sy-uzeit.
          lv_jobdate = sy-datum.
          lv_jobtime = sy-uzeit + 30.
          IF lv_jobtime < sy-uzeit.
            lv_jobdate = sy-datum + 1.
          ENDIF.
          CALL FUNCTION 'JOB_OPEN'
            EXPORTING
              jobname          = lv_jobname
            IMPORTING
              jobcount         = lv_jobcount
            EXCEPTIONS
              cant_create_job  = 1
              invalid_job_data = 2
              jobname_missing  = 3
              OTHERS           = 4.
          IF sy-subrc = 0.
            SUBMIT zcapex_r_sap_post VIA JOB lv_jobname NUMBER lv_jobcount AND RETURN.
            IF sy-subrc = 0.
              CALL FUNCTION 'JOB_CLOSE'
                EXPORTING
                  jobcount  = lv_jobcount
                  jobname   = lv_jobname
                  sdlstrtdt = lv_jobdate
                  sdlstrttm = lv_jobtime
                EXCEPTIONS
                  OTHERS    = 1.
            ENDIF.
          ENDIF.        ENDIF.

      WHEN 'CPE'.
        DATA(lv_cpeid) = CONV zcapex_de_cpeid( iv_docid ).
        UPDATE zcapex_cpe SET approved_on = @sy-datum WHERE cpeid = @lv_cpeid.
        TRY.
            zcl_capex_sap=>create_cwip_record( lv_cpeid ).
          CATCH zcx_capex_error INTO DATA(lx_cwip).
            zcl_capex_log=>error( iv_doctype = 'CPE' iv_docid = iv_docid
                                  iv_method = 'ZCL_CAPEX_WF=>ON_FINAL_APPROVAL'
                                  iv_text = lx_cwip->get_text( ) ).
        ENDTRY.

      WHEN 'QUOTA'.
        DATA(lv_quotaid) = CONV zcapex_de_quotaid( iv_docid ).
        UPDATE zcapex_quota SET approved_by = @( zcl_capex_auth=>effective_user( ) ), approved_on = @sy-datum
          WHERE quotaid = @lv_quotaid.
    ENDCASE.
  ENDMETHOD.


  METHOD route_of.
    CLEAR: ev_route, ev_param.
    CASE iv_doctype.
      WHEN 'BUD'.
        ev_route = 'budgetDetail'.   ev_param = 'budgetId'.
      WHEN 'CPE'.
        ev_route = COND #( WHEN iv_for_owner = abap_true THEN 'cpeDetail' ELSE 'approvalDetail' ).
        ev_param = 'cpeId'.
      WHEN 'QUOTA'.
        ev_route = 'unitQuota'.
    ENDCASE.
  ENDMETHOD.


  METHOD run_sla_check.
    DATA: lt_next TYPE zcapex_tt_wflog.

    DATA(lv_breach) = zcl_capex_config=>get_int( 'SLA_BREACH_DAYS' ).
    DATA(lv_escal)  = zcl_capex_config=>get_flag( 'SLA_AUTO_ESCALATE' ).

    " HOLD rows are excluded: the SLA clock is paused while on hold.
    SELECT * FROM zcapex_wflog INTO TABLE @DATA(lt_open)
      WHERE status = 'PENDING' AND is_current = @abap_true AND escalated = @abap_false.

    LOOP AT lt_open INTO DATA(ls_open).
      DATA(lv_pending) = sy-datum - ls_open-reached_on.
      IF lv_pending <= lv_breach.
        CONTINUE.
      ENDIF.
      ls_open-escalated = abap_true.
      UPDATE zcapex_wflog FROM @ls_open.
      zcl_capex_log=>audit( iv_doctype = ls_open-doctype iv_docid = ls_open-docid
                            iv_action = 'SLA breach - escalated'
                            iv_comment = |Pending { lv_pending } days at { ls_open-role }| ).

      IF lv_escal = abap_true.
        " Notify the next level up rather than reassigning: the approval itself must still
        " come from the right role; escalation only adds visibility.
        CLEAR lt_next.
        SELECT * FROM zcapex_wflog INTO TABLE @lt_next
          WHERE doctype = @ls_open-doctype AND docid = @ls_open-docid AND cyclenr = @ls_open-cyclenr
            AND levelnr > @ls_open-levelnr
          ORDER BY levelnr.
        READ TABLE lt_next INTO DATA(ls_up) INDEX 1.
        IF sy-subrc = 0.
          notify_step( is_step  = ls_up
                       iv_title = |SLA breach - { ls_open-docid } pending { lv_pending } days at { ls_open-role }|
                       iv_werks = zcl_capex_doc=>werks_of( iv_doctype = ls_open-doctype iv_docid = ls_open-docid ) ).
        ENDIF.
        " ... and remind the current approver.
        notify_step( is_step  = ls_open
                     iv_title = |Reminder: { ls_open-docid } pending { lv_pending } days (SLA { ls_open-sla_days })|
                     iv_werks = zcl_capex_doc=>werks_of( iv_doctype = ls_open-doctype iv_docid = ls_open-docid ) ).
      ENDIF.
    ENDLOOP.
    COMMIT WORK.
  ENDMETHOD.


  METHOD submit.
    DATA: lt_chain TYPE zcapex_tt_doachn,
          lt_wflog TYPE zcapex_tt_wflog,
          ls_log   TYPE zcapex_wflog,
          lv_level TYPE zcapex_de_level,
          lv_docid TYPE zcapex_de_docid.

    CLEAR: es_first, ev_doaid.
    lv_docid = iv_docid.
    lock_doc( iv_doctype = iv_doctype iv_docid = lv_docid ).
    DATA(ls_head) = zcl_capex_doc=>read( iv_doctype = iv_doctype iv_docid = lv_docid ).

    " An open cycle means the document is already in flight.
    DATA(lv_cycle) = current_cycle( iv_doctype = iv_doctype iv_docid = lv_docid ).
    IF lv_cycle IS NOT INITIAL.
      SELECT COUNT(*) FROM zcapex_wflog INTO @DATA(lv_open)
        WHERE doctype = @iv_doctype AND docid = @lv_docid AND cyclenr = @lv_cycle
          AND ( status = 'PENDING' OR status = 'WAITING' OR status = 'HOLD' ).
      IF lv_open > 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-already_submitted iv_1 = lv_docid ).
      ENDIF.
    ENDIF.
    lv_cycle = lv_cycle + 1.

    " The one place the DOA matrix is read. From here on the document carries its own copy.
    IF it_chain IS NOT INITIAL.
      lt_chain = it_chain.
    ELSE.
*      ev_doaid = find_doa( iv_capextype = iv_capextype iv_amount = iv_amount ).
      ev_doaid = find_doa( iv_doctype = iv_doctype iv_capextype = iv_capextype iv_amount = iv_amount ).
      SELECT * FROM zcapex_doachn INTO TABLE @lt_chain WHERE doaid = @ev_doaid ORDER BY seqnr.
    ENDIF.
    " CPE: the Unit Technical* step is the technical evaluation, already recorded as an automatic level
    " by submit_evaluation - it is not repeated as an approval level.
    IF iv_doctype = 'CPE'.
      DELETE lt_chain WHERE role CP 'Unit Technical*'.
    ENDIF.
    IF lt_chain IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_approval_chain iv_1 = lv_docid ).
    ENDIF.

    " Automatic levels already completed (CPE: Unit Initiator, Technical Team)
    LOOP AT it_presteps INTO DATA(ls_pre).
      lv_level = lv_level + 1.
      CLEAR ls_log.
      ls_log-doctype     = iv_doctype.
      ls_log-docid       = lv_docid.
      ls_log-cyclenr     = lv_cycle.
      ls_log-levelnr     = lv_level.
      ls_log-role        = ls_pre-role.
      ls_log-approver    = ls_pre-approver.
      ls_log-actual_appr = ls_pre-approver.
      ls_log-status      = 'APPROVED'.
      ls_log-reached_on  = ls_pre-acted_on.
      ls_log-acted_on    = ls_pre-acted_on.
      ls_log-acted_at    = sy-uzeit.
      ls_log-comments    = ls_pre-comments.
      ls_log-is_auto     = abap_true.
      APPEND ls_log TO lt_wflog.
    ENDLOOP.

    DATA(lv_first) = abap_true.
    LOOP AT lt_chain INTO DATA(ls_chain).
      lv_level = lv_level + 1.
      CLEAR ls_log.
      ls_log-doctype  = iv_doctype.
      ls_log-docid    = lv_docid.
      ls_log-cyclenr  = lv_cycle.
      ls_log-levelnr  = lv_level.
      ls_log-role     = ls_chain-role.       " frozen: later DOA edits cannot disturb this document
      ls_log-approver = ls_chain-approver.
      ls_log-sla_days = ls_chain-sla_days.
      IF lv_first = abap_true.
        ls_log-status     = 'PENDING'.
        ls_log-is_current = abap_true.
        ls_log-reached_on = sy-datum.
        ls_log-reached_at = sy-uzeit.
        ls_log-due_on     = sy-datum + ls_chain-sla_days.
        es_first = ls_log.
        lv_first = abap_false.
      ELSE.
        ls_log-status = 'WAITING'.
      ENDIF.
      APPEND ls_log TO lt_wflog.
    ENDLOOP.

    INSERT zcapex_wflog FROM TABLE @lt_wflog.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = lv_docid ).
    ENDIF.

    zcl_capex_doc=>update_status( iv_doctype = iv_doctype iv_docid = lv_docid
                                  iv_status = 'IN_APPROVAL' iv_curr_level = es_first-role ).
    zcl_capex_log=>status( iv_doctype = iv_doctype iv_docid = lv_docid
                           iv_from = ls_head-status iv_to = 'IN_APPROVAL'
                           iv_reason = |Submitted for approval (cycle { lv_cycle })| ).
    zcl_capex_log=>audit( iv_doctype = iv_doctype iv_docid = lv_docid
                          iv_action = |{ doc_label( iv_doctype ) } submitted for approval|
                          iv_comment = |Routed to { es_first-role }| ).
    notify_step( is_step = es_first iv_title = |{ lv_docid } awaiting your approval| iv_werks = ls_head-werks ).
  ENDMETHOD.
ENDCLASS.