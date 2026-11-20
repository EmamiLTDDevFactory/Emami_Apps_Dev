"! Alert mails of the material request: the same alert function and templates the Web Dynpro component used
"! (/INOWITS/P_ALERT with the /INOWITS/P_MDM_* templates), chosen by the same rules:
"!   family  M (create), MX (change), ME (extension); send back and reject always use the create (M) templates
"!   a mail to the agents of the next level and one to the initiator (_L0) for every event
"! A mail problem never fails the business action.
CLASS zcl_mm_mdm_mail DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS:
      c_submit    TYPE c LENGTH 8 VALUE 'SUBMIT',
      c_resubmit  TYPE c LENGTH 8 VALUE 'RESUBMIT',
      c_review    TYPE c LENGTH 8 VALUE 'REVIEW',
      c_approve   TYPE c LENGTH 8 VALUE 'APPROVE',
      c_final     TYPE c LENGTH 8 VALUE 'FINAL',
      c_sendback  TYPE c LENGTH 8 VALUE 'SENDBACK',
      c_reject    TYPE c LENGTH 8 VALUE 'REJECT'.

    "! iv_actor: I initiator, R reviewer, A approver; iv_next: the CL_WF flag EV_IS_NEXT_LVL
    CLASS-METHODS notify
      IMPORTING iv_event      TYPE clike
                iv_app_id     TYPE clike
                iv_transid    TYPE clike
                iv_actor      TYPE clike DEFAULT 'R'
                iv_next       TYPE clike OPTIONAL
                iv_init_mail  TYPE string
                it_mails      TYPE /inowits/m_mail_id_tt
                iv_comment    TYPE string OPTIONAL.

    "! Level kind of the actor of a work item: I (L0), A (approver level) or R (reviewer)
    CLASS-METHODS actor_kind
      IMPORTING iv_app_id      TYPE clike
                iv_transid     TYPE clike
                iv_level       TYPE clike
      RETURNING VALUE(rv_kind) TYPE char1.

  PRIVATE SECTION.
    TYPES tt_key TYPE STANDARD TABLE OF /inowits/p_key_values WITH EMPTY KEY.
    CLASS-METHODS templates
      IMPORTING iv_event    TYPE clike
                iv_app_id   TYPE clike
                iv_actor    TYPE clike
                iv_next     TYPE clike
      EXPORTING ev_agents   TYPE string
                ev_initiator TYPE string.
    CLASS-METHODS alert
      IMPORTING iv_template  TYPE string
                it_receivers TYPE string_table
                it_keys      TYPE tt_key.
ENDCLASS.



CLASS ZCL_MM_MDM_MAIL IMPLEMENTATION.


  METHOD actor_kind.
    IF iv_level = 'L0' OR iv_level IS INITIAL.
      rv_kind = 'I'.
      RETURN.
    ENDIF.
    DATA(lv_tid) = CONV /inowits/transid( |{ CONV string( iv_transid ) ALPHA = IN }| ).
    SELECT SINGLE mtart FROM /inowits/mm_mara WHERE transid = @lv_tid INTO @DATA(lv_mtart).
    SELECT SINGLE type_lvl FROM /inowits/wf_def
      WHERE app_id = @iv_app_id AND gen_type = @lv_mtart AND lvl = @iv_level INTO @DATA(lv_type).
    rv_kind = COND #( WHEN lv_type = 'A' THEN 'A' ELSE 'R' ).
  ENDMETHOD.


  METHOD templates.
    DATA(lv_fam) = SWITCH string( to_upper( CONV string( iv_app_id ) ) WHEN 'MX' THEN `MX` WHEN 'ME' THEN `ME` ELSE `M` ).
    DATA(lv_pre) = |/INOWITS/P_MDM_|.
    DATA(lv_next) = xsdbool( iv_next IS NOT INITIAL ).
    CLEAR: ev_agents, ev_initiator.
    CASE to_upper( CONV string( iv_event ) ).
      WHEN c_submit.
        IF lv_next = abap_false.
          ev_agents = |{ lv_pre }{ lv_fam }|.             ev_initiator = |{ lv_pre }{ lv_fam }_L0|.
        ELSE.
          ev_agents = |{ lv_pre }{ lv_fam }_NXT|.         ev_initiator = |{ lv_pre }{ lv_fam }_L0_NXT|.
        ENDIF.
      WHEN c_resubmit.
        IF lv_next = abap_false.
          ev_agents = |{ lv_pre }{ lv_fam }_COMPLETE|.    ev_initiator = |{ lv_pre }{ lv_fam }_L0_COMPLETE|.
        ELSE.
          ev_agents = |{ lv_pre }{ lv_fam }_NXT_COMPLETE|.
          ev_initiator = COND #( WHEN lv_fam = 'M' THEN |{ lv_pre }M_L0_NXT_COMPLT| ELSE |/INOWITS/MDM_{ lv_fam }_L0_NXT_COMPLT| ).
        ENDIF.
      WHEN c_review.
        IF lv_fam = 'M'.
          IF lv_next = abap_false.
            ev_agents = |{ lv_pre }M_REV|.                ev_initiator = |{ lv_pre }M_REV_L0|.
          ELSE.
            ev_agents = |{ lv_pre }M_REV_NXT|.            ev_initiator = |{ lv_pre }M_REV_L0_NXT|.
          ENDIF.
        ELSE.
          ev_agents = |{ lv_pre }{ lv_fam }_APP|.         ev_initiator = |{ lv_pre }{ lv_fam }_APP_L0|.
        ENDIF.
      WHEN c_approve.
        ev_agents = |{ lv_pre }{ lv_fam }_APP|.           ev_initiator = |{ lv_pre }{ lv_fam }_APP_L0|.
      WHEN c_final.
        ev_agents = |{ lv_pre }{ lv_fam }_APP_FINAL|.     ev_initiator = |{ lv_pre }{ lv_fam }_APP_FINAL_L0|.
      WHEN c_sendback.
        CASE to_upper( CONV string( iv_actor ) ).
          WHEN 'I'.
            ev_agents = |{ lv_pre }M_RESEND|.             ev_initiator = |{ lv_pre }M_RESEND_L0|.
          WHEN 'A'.
            IF lv_next = abap_true.
              ev_agents = |{ lv_pre }M_RESEND_A2R|.       ev_initiator = |{ lv_pre }M_RESEND_A2R_L0|.
            ELSE.
              ev_agents = |{ lv_pre }M_RESEND_APP|.       ev_initiator = |{ lv_pre }M_RESEND_APP_L0|.
            ENDIF.
          WHEN OTHERS.
            IF lv_next = abap_true.
              ev_agents = |{ lv_pre }M_RESEND_R2I|.       ev_initiator = |{ lv_pre }M_RESEND_R2I_L0|.
            ELSE.
              ev_agents = |{ lv_pre }M_RESEND_REV|.       ev_initiator = |{ lv_pre }M_RESEND_REV_L0|.
            ENDIF.
        ENDCASE.
      WHEN c_reject.
        IF to_upper( CONV string( iv_actor ) ) = 'A'.
          ev_agents = |{ lv_pre }M_REJECT_APP|.           ev_initiator = |{ lv_pre }M_REJECT_APP_L0|.
        ELSE.
          ev_agents = |{ lv_pre }M_REJECT_REV|.           ev_initiator = |{ lv_pre }M_REJECT_REV_L0|.
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD alert.
    CHECK iv_template IS NOT INITIAL AND it_receivers IS NOT INITIAL.
    DATA lt_rec TYPE STANDARD TABLE OF /inowits/p_alert_agent WITH EMPTY KEY.
    DATA lt_key TYPE STANDARD TABLE OF /inowits/p_key_values WITH EMPTY KEY.
    DATA lv_tmpl TYPE /inowits/p_temp_id.
    DATA lv_subj TYPE /inowits/p_subject.
    DATA ls_ret  TYPE bapiret2.
    lv_tmpl = iv_template.  lv_subj = 'Material Creation'.
    LOOP AT it_receivers ASSIGNING FIELD-SYMBOL(<r>) WHERE table_line IS NOT INITIAL.
      APPEND VALUE #( reciever = <r> ) TO lt_rec.
    ENDLOOP.
    lt_key = it_keys.
    CALL FUNCTION '/INOWITS/P_ALERT'
      EXPORTING iv_alert_template = lv_tmpl iv_subject = lv_subj
      IMPORTING es_return = ls_ret
      TABLES it_reciever_detail = lt_rec it_key_value = lt_key
      EXCEPTIONS OTHERS = 1.
  ENDMETHOD.


  METHOD notify.
    TRY.
        templates( EXPORTING iv_event = iv_event iv_app_id = iv_app_id iv_actor = iv_actor iv_next = iv_next
                   IMPORTING ev_agents = DATA(lv_agents) ev_initiator = DATA(lv_init) ).
        DATA(lv_tid) = CONV /inowits/transid( |{ CONV string( iv_transid ) ALPHA = IN }| ).
        SELECT SINGLE mtart, matkl, matnr FROM /inowits/mm_mara WHERE transid = @lv_tid INTO @DATA(ls_m).
        SELECT SINGLE maktx FROM /inowits/mm_makt WHERE transid = @lv_tid INTO @DATA(lv_maktx).
        SELECT SINGLE werks FROM /inowits/mm_marc WHERE transid = @lv_tid INTO @DATA(lv_werks).
        SELECT SINGLE vkorg, vtweg FROM /inowits/mm_mvke WHERE transid = @lv_tid INTO @DATA(ls_v).
        SELECT SINGLE obj_value FROM /inowits/m_trans WHERE transid = @lv_tid AND app_id = @iv_app_id INTO @DATA(lv_obj).
        DATA(lv_matnr) = COND string( WHEN lv_obj IS NOT INITIAL THEN |{ CONV string( lv_obj ) ALPHA = OUT }| ELSE |{ CONV string( ls_m-matnr ) ALPHA = OUT }| ).
        DATA lt_keys TYPE tt_key.
        lt_keys = VALUE #(
          ( object_key = 'TRANS_ID' object_value = |{ CONV string( iv_transid ) ALPHA = OUT }| )
          ( object_key = 'MATNR'    object_value = lv_matnr )
          ( object_key = 'MAKTX'    object_value = lv_maktx )
          ( object_key = 'MTART'    object_value = ls_m-mtart )
          ( object_key = 'WERKS'    object_value = lv_werks )
          ( object_key = 'VKORG'    object_value = ls_v-vkorg )
          ( object_key = 'VTWEG'    object_value = ls_v-vtweg )
          ( object_key = 'LV_COMM'  object_value = iv_comment )
          ( object_key = 'MAT_GRP'  object_value = ls_m-matkl ) ).
        DATA(lt_agents) = VALUE string_table( FOR m IN it_mails ( CONV string( m ) ) ).
        alert( iv_template = lv_agents it_receivers = lt_agents it_keys = lt_keys ).
        alert( iv_template = lv_init it_receivers = VALUE #( ( iv_init_mail ) ) it_keys = lt_keys ).
      CATCH cx_root.
        "no mail problem may undo the business action
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
