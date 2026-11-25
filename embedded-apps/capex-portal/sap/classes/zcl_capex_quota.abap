CLASS zcl_capex_quota DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "! <= QUOTA_SINGLE_CAP per item; <= QUOTA_YEAR_CAP per plant and FY (APPROVED + PENDING).
    CLASS-METHODS validate
      IMPORTING iv_werks  TYPE werks_d
                iv_fiscal TYPE gjahr
                iv_amount TYPE zcapex_de_amount
      RAISING   zcx_capex_error.
    CLASS-METHODS submit
      IMPORTING iv_werks         TYPE werks_d
                iv_title         TYPE csequence
                iv_amount        TYPE zcapex_de_amount
                iv_justif        TYPE csequence OPTIONAL
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
    CLASS-METHODS decide
      IMPORTING iv_quotaid       TYPE zcapex_de_quotaid
                iv_decision      TYPE zcapex_de_decision
                iv_comment       TYPE csequence OPTIONAL
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
ENDCLASS.



CLASS ZCL_CAPEX_QUOTA IMPLEMENTATION.


  METHOD decide.
    DATA(lv_status) = zcl_capex_wf=>act( iv_doctype  = 'QUOTA'
                                         iv_docid    = iv_quotaid
                                         iv_decision = iv_decision
                                         iv_comments = iv_comment ).
    rs_result = VALUE #( success = abap_true doctype = 'QUOTA' docid = iv_quotaid
                         status = COND #( WHEN lv_status = 'IN_APPROVAL' THEN 'PENDING' ELSE lv_status )
                         message = |{ iv_quotaid } { to_lower( lv_status ) }| ).
  ENDMETHOD.


  METHOD submit.
    DATA ls_q TYPE zcapex_quota.

    IF iv_title IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Description' ).
    ENDIF.
    IF iv_amount <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Amount' ).
    ENDIF.
    zcl_capex_auth=>check_plant( iv_werks ).
    DATA(lv_fy) = zcl_capex_util=>current_fiscal_year( ).
    validate( iv_werks = iv_werks iv_fiscal = lv_fy iv_amount = iv_amount ).

    ls_q-quotaid       = zcl_capex_number=>get_next_id( iv_range  = zcl_capex_number=>gc_range-quota
                                                        iv_prefix = 'Q'
                                                        iv_width  = 4
                                                        iv_fiscal = lv_fy ).
    ls_q-werks         = iv_werks.
    ls_q-fiscalyear    = lv_fy.
    ls_q-title         = iv_title.
    ls_q-amount        = iv_amount.
    ls_q-waers         = 'INR'.
    ls_q-status        = 'PENDING'.
    ls_q-justification = iv_justif.
    ls_q-created_by    = zcl_capex_auth=>effective_user( ).
    ls_q-created_on    = sy-datum.
    ls_q-created_at    = sy-uzeit.
    INSERT zcapex_quota FROM @ls_q.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = ls_q-quotaid ).
    ENDIF.

    zcl_capex_wf=>submit( EXPORTING iv_doctype = 'QUOTA'
                                    iv_docid   = ls_q-quotaid
                                    iv_amount  = iv_amount
                                    it_chain   = VALUE #( ( seqnr    = '01'
                                                            role     = zcl_capex_config=>get( 'QUOTA_APPROVER_ROLE' )
                                                            sla_days = 2 ) )
                          IMPORTING es_first   = DATA(ls_first) ).

    zcl_capex_log=>audit( iv_doctype = 'QUOTA' iv_docid = ls_q-quotaid
                          iv_action = 'Unit quota capex submitted'
                          iv_comment = |{ ls_q-title } - { zcl_capex_util=>rupees( ls_q-amount ) }| ).

    rs_result = VALUE #( success = abap_true doctype = 'QUOTA' docid = ls_q-quotaid
                         status = 'PENDING' curr_level = ls_first-role
                         message = |Quota capex { ls_q-quotaid } submitted for unit approval.| ).
  ENDMETHOD.


  METHOD validate.
    DATA(lv_single) = zcl_capex_config=>get_amount( 'QUOTA_SINGLE_CAP' ).
    DATA(lv_year)   = zcl_capex_config=>get_amount( 'QUOTA_YEAR_CAP' ).
    IF iv_amount > lv_single.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-quota_single
                              iv_1 = zcl_capex_util=>rupees( lv_single )
                              iv_2 = zcl_capex_util=>rupees( iv_amount ) ).
    ENDIF.
    " PENDING reserves the quota too - otherwise several items on one day each pass
    " the check and together breach the annual cap.
    SELECT SUM( amount ) FROM zcapex_quota INTO @DATA(lv_used)
      WHERE werks = @iv_werks AND fiscalyear = @iv_fiscal
        AND ( status = 'APPROVED' OR status = 'PENDING' ).
    IF lv_used + iv_amount > lv_year.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-quota_year
                              iv_1 = zcl_capex_util=>rupees( lv_year )
                              iv_2 = iv_werks
                              iv_3 = zcl_capex_util=>rupees( CONV #( lv_used ) )
                              iv_4 = zcl_capex_util=>rupees( CONV #( lv_year - lv_used ) ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.