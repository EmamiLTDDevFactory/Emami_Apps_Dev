CLASS zcl_capex_log DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS gc_conn TYPE dbcon_name VALUE 'R/3*ZCAPEXLOG'.

    CLASS-METHODS audit
      IMPORTING iv_doctype TYPE zcapex_de_doctype
                iv_docid   TYPE csequence
                iv_action  TYPE csequence
                iv_comment TYPE csequence OPTIONAL.
    CLASS-METHODS status
      IMPORTING iv_doctype TYPE zcapex_de_doctype
                iv_docid   TYPE csequence
                iv_from    TYPE zcapex_de_status
                iv_to      TYPE zcapex_de_status
                iv_reason  TYPE csequence OPTIONAL
                iv_comment TYPE csequence OPTIONAL.
    CLASS-METHODS sap
      IMPORTING iv_doctype TYPE zcapex_de_doctype
                iv_docid   TYPE csequence
                iv_action  TYPE zcapex_de_sapact
                iv_object  TYPE csequence OPTIONAL
                iv_status  TYPE zcapex_de_qstat
                iv_message TYPE csequence OPTIONAL
                is_msg     TYPE bapiret2 OPTIONAL.
    CLASS-METHODS error
      IMPORTING iv_doctype TYPE zcapex_de_doctype OPTIONAL
                iv_docid   TYPE csequence OPTIONAL
                iv_method  TYPE csequence
                iv_text    TYPE csequence
                iv_type    TYPE csequence DEFAULT 'ERROR'.
    CLASS-METHODS notify
      IMPORTING iv_doctype     TYPE zcapex_de_doctype
                iv_docid       TYPE csequence
                iv_recipient   TYPE xubname
                iv_title       TYPE csequence
                iv_message     TYPE csequence OPTIONAL
                iv_type        TYPE csequence OPTIONAL
                iv_icon        TYPE csequence DEFAULT 'sap-icon://approvals'
                iv_route       TYPE csequence OPTIONAL
                iv_param_name  TYPE csequence OPTIONAL
                iv_param_value TYPE csequence OPTIONAL.
    "! Notifies every active user holding iv_role (and, if given, authorised for iv_werks).
    CLASS-METHODS notify_role
      IMPORTING iv_role        TYPE zcapex_de_role
                iv_werks       TYPE werks_d OPTIONAL
                iv_doctype     TYPE zcapex_de_doctype
                iv_docid       TYPE csequence
                iv_title       TYPE csequence
                iv_message     TYPE csequence OPTIONAL
                iv_icon        TYPE csequence DEFAULT 'sap-icon://approvals'
                iv_route       TYPE csequence OPTIONAL
                iv_param_name  TYPE csequence OPTIONAL
                iv_param_value TYPE csequence OPTIONAL.
ENDCLASS.



CLASS ZCL_CAPEX_LOG IMPLEMENTATION.


  METHOD audit.
    DATA ls_log TYPE zcapex_audlog.
    TRY.
        ls_log-auditid = zcl_capex_number=>get_raw( zcl_capex_number=>gc_range-audit ).
      CATCH zcx_capex_error.
        RETURN.  " a missing log number must never block the business action
    ENDTRY.
    ls_log-doctype  = iv_doctype.
    ls_log-docid    = iv_docid.
    ls_log-action   = iv_action.
    ls_log-comments = iv_comment.
    ls_log-log_date = sy-datum.
    ls_log-log_time = sy-uzeit.
    GET TIME STAMP FIELD ls_log-log_ts.

    IF sy-batch = abap_true.
      " Jobs write SYSTEM / '-', which the Audit Trail screen already renders.
      ls_log-userid   = 'SYSTEM'.
      ls_log-username = 'System'.
      ls_log-role     = '-'.
    ELSE.
      ls_log-userid   = zcl_capex_auth=>effective_user( ).
      ls_log-username = zcl_capex_util=>user_name( zcl_capex_auth=>effective_user( ) ).
      ls_log-role     = zcl_capex_auth=>get_user( )-role.
      IF ls_log-role IS INITIAL.
        ls_log-role = '-'.
      ENDIF.
    ENDIF.

    INSERT zcapex_audlog FROM @ls_log.
  ENDMETHOD.


  METHOD error.
    DATA ls_err TYPE zcapex_errlog.
    TRY.
        ls_err-errid = cl_system_uuid=>create_uuid_c22_static( ).
      CATCH cx_uuid_error.
        RETURN.
    ENDTRY.
    ls_err-doctype    = iv_doctype.
    ls_err-docid      = iv_docid.
    ls_err-method     = iv_method.
    ls_err-error_text = iv_text.
    ls_err-error_type = iv_type.
    ls_err-log_date   = sy-datum.
    ls_err-log_time   = sy-uzeit.
    ls_err-userid     = zcl_capex_auth=>effective_user( ).
    INSERT zcapex_errlog CONNECTION (gc_conn) FROM @ls_err.
    COMMIT CONNECTION (gc_conn).
  ENDMETHOD.


  METHOD notify.
    DATA ls_not TYPE zcapex_notlog.
    IF iv_recipient IS INITIAL.
      RETURN.
    ENDIF.
    TRY.
        ls_not-notifid = zcl_capex_number=>get_raw( zcl_capex_number=>gc_range-notif ).
      CATCH zcx_capex_error.
        RETURN.
    ENDTRY.
    ls_not-doctype     = iv_doctype.
    ls_not-docid       = iv_docid.
    ls_not-recipient   = iv_recipient.
    ls_not-title       = iv_title.
    ls_not-message     = COND #( WHEN iv_message IS INITIAL THEN iv_title ELSE iv_message ).
    ls_not-notif_type  = COND #( WHEN iv_type IS INITIAL THEN iv_doctype ELSE iv_type ).
    ls_not-icon        = iv_icon.
    ls_not-route       = iv_route.
    ls_not-param_name  = iv_param_name.
    ls_not-param_value = iv_param_value.
    ls_not-is_read     = abap_false.
    ls_not-sent_on     = sy-datum.
    ls_not-sent_at     = sy-uzeit.
    GET TIME STAMP FIELD ls_not-sent_ts.
    " The in-app bell is the primary channel; e-mail is sent by ZCAPEX_R_NOTIF_MAIL (B14).
    ls_not-email = zcl_capex_auth=>get_user( iv_recipient )-email.
    INSERT zcapex_notlog FROM @ls_not.

    " E-mail goes out immediately (monitor in SOST). If anything fails the row stays unmailed and
    " ZCAPEX_R_NOTIF_MAIL can still pick it up - the in-app notification is never affected.
    IF ls_not-email IS NOT INITIAL.
      DATA lv_url TYPE string.
      TRY.
          lv_url = zcl_capex_config=>get( 'PORTAL_URL' ).
        CATCH cx_root.
          CLEAR lv_url.
      ENDTRY.
      TRY.
          DATA(lo_send) = cl_bcs=>create_persistent( ).
          DATA(lt_body) = VALUE bcsy_text( ( line = ls_not-message ) ( line = space ) ).
          IF lv_url IS NOT INITIAL.
            APPEND |Open the CAPEX portal: { lv_url }| TO lt_body.
          ENDIF.
          DATA(lo_doc) = cl_document_bcs=>create_document( i_type    = 'RAW'
                                                           i_text    = lt_body
                                                           i_subject = CONV so_obj_des( ls_not-title ) ).
          lo_send->set_document( lo_doc ).
          lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( CONV #( ls_not-email ) ) ).
          lo_send->set_send_immediately( abap_true ).
          IF lo_send->send( ) = abap_true.
            UPDATE zcapex_notlog SET mailed = @abap_true WHERE notifid = @ls_not-notifid.
          ENDIF.
        CATCH cx_bcs.
          " stays unmailed - retried by ZCAPEX_R_NOTIF_MAIL
      ENDTRY.
    ENDIF.
  ENDMETHOD.


  METHOD notify_role.
    SELECT userid FROM zcapex_user INTO TABLE @DATA(lt_users)
      WHERE role = @iv_role AND active = @abap_true.
    LOOP AT lt_users INTO DATA(ls_user).
      IF iv_werks IS NOT INITIAL
         AND zcl_capex_auth=>can_see_plant( iv_userid = ls_user-userid iv_werks = iv_werks ) = abap_false.
        CONTINUE.
      ENDIF.
      notify( iv_doctype     = iv_doctype
              iv_docid       = iv_docid
              iv_recipient   = ls_user-userid
              iv_title       = iv_title
              iv_message     = iv_message
              iv_icon        = iv_icon
              iv_route       = iv_route
              iv_param_name  = iv_param_name
              iv_param_value = iv_param_value ).
    ENDLOOP.
  ENDMETHOD.


  METHOD sap.
    DATA ls_log TYPE zcapex_saplog.
    TRY.
        ls_log-logid = cl_system_uuid=>create_uuid_c22_static( ).
      CATCH cx_uuid_error.
        RETURN.
    ENDTRY.
    ls_log-doctype    = iv_doctype.
    ls_log-docid      = iv_docid.
    ls_log-sap_action = iv_action.
    ls_log-sap_object = iv_object.
    ls_log-status     = iv_status.
    ls_log-message    = iv_message.
    IF is_msg IS SUPPLIED.
      ls_log-msgid = is_msg-id.
      ls_log-msgno = is_msg-number.
    ENDIF.
    ls_log-log_date = sy-datum.
    ls_log-log_time = sy-uzeit.
    ls_log-userid   = zcl_capex_auth=>effective_user( ).

    " Own connection: the row explaining a failure must survive the rollback of the posting.
    INSERT zcapex_saplog CONNECTION (gc_conn) FROM @ls_log.
    COMMIT CONNECTION (gc_conn).
  ENDMETHOD.


  METHOD status.
    DATA ls_st TYPE zcapex_stlog.
    ls_st-doctype = iv_doctype.
    ls_st-docid   = iv_docid.
    " SEQNR runs per document: one document's history reads 1, 2, 3 ...
    SELECT MAX( seqnr ) FROM zcapex_stlog INTO @DATA(lv_max)
      WHERE doctype = @ls_st-doctype AND docid = @ls_st-docid.
    ls_st-seqnr       = lv_max + 1.
    ls_st-status_from = iv_from.
    ls_st-status_to   = iv_to.
    ls_st-changed_by  = zcl_capex_auth=>effective_user( ).
    ls_st-changed_on  = sy-datum.
    ls_st-changed_at  = sy-uzeit.
    ls_st-reason      = iv_reason.
    ls_st-comments    = iv_comment.
    INSERT zcapex_stlog FROM @ls_st.
    " No exception: a lost log row must never roll back the approval that produced it.
  ENDMETHOD.
ENDCLASS.