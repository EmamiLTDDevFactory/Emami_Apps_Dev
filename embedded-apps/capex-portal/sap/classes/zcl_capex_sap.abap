class ZCL_CAPEX_SAP definition
  public
  final
  create public .

public section.

  types:
    BEGIN OF ty_cwip_input,
             cpeid         TYPE zcapex_de_cpeid,
             anlkl         TYPE anlkl,
             kostl         TYPE kostl,
             pspnr         TYPE ps_posid,
             payment_terms TYPE zcapex_de_ltext,
             timeframe_wks TYPE zcapex_de_weeks,
             exec_process  TYPE zcapex_de_execproc,
             prctr         TYPE prctr,
             remarks       TYPE zcapex_de_ltext,
           END OF ty_cwip_input .

    "! Queues a posting that must run after the current LUW is committed.
  class-methods QUEUE
    importing
      !IV_DOCTYPE type ZCAPEX_DE_DOCTYPE
      !IV_DOCID type CSEQUENCE
      !IV_ACTION type ZCAPEX_DE_SAPACT .
    "! Called by job ZCAPEX_R_SAP_POST: posts queued and failed (retry < 3) entries.
  class-methods PROCESS_QUEUE
    importing
      !IV_MAX_RETRIES type I default 3 .
  class-methods CREATE_INTERNAL_ORDER
    importing
      !IV_BUDGETID type ZCAPEX_DE_BUDGETID
    returning
      value(RV_AUFNR) type AUFNR
    raising
      ZCX_CAPEX_ERROR .
    "! Idempotent: returns the existing CWIP when the CPE already has one.
  class-methods CREATE_CWIP_RECORD
    importing
      !IV_CPEID type ZCAPEX_DE_CPEID
    returning
      value(RV_CWIPID) type ZCAPEX_DE_CWIPID
    raising
      ZCX_CAPEX_ERROR .
  class-methods PUSH_CWIP
    importing
      !IS_INPUT type TY_CWIP_INPUT
    exporting
      !EV_CWIPID type ZCAPEX_DE_CWIPID
      !EV_EBELN type EBELN
      !EV_BANFN type BANFN
    raising
      ZCX_CAPEX_ERROR .
  class-methods CONFIRM_PO
    importing
      !IV_EBELN type EBELN
    raising
      ZCX_CAPEX_ERROR .
  class-methods CAPITALIZE_ASSET
    importing
      !IV_ICID type ZCAPEX_DE_ICID
    returning
      value(RV_ANLN1) type ANLN1
    raising
      ZCX_CAPEX_ERROR .
  class-methods SYNC_PO .
  class-methods SYNC_GRN .
  class-methods SUGGEST_ASSET_CLASS
    importing
      !IV_CAPEXTYPE type ZCAPEX_DE_CPXTYPE
    returning
      value(RV_ANLKL) type ANLKL .
  PRIVATE SECTION.
    CLASS-METHODS has_error
      IMPORTING it_return       TYPE bapiret2_t
      RETURNING VALUE(rv_error) TYPE abap_bool.
    CLASS-METHODS first_error
      IMPORTING it_return     TYPE bapiret2_t
      RETURNING VALUE(rs_msg) TYPE bapiret2.
    CLASS-METHODS ext_date
      IMPORTING iv_date        TYPE datum
      RETURNING VALUE(rv_text) TYPE char10.
ENDCLASS.



CLASS ZCL_CAPEX_SAP IMPLEMENTATION.


  METHOD capitalize_asset.
    DATA: ls_key    TYPE bapi1022_key,
          ls_gen    TYPE bapi1022_feglg001,
          ls_genx   TYPE bapi1022_feglg001x,
          ls_post   TYPE bapi1022_feglg002,
          ls_postx  TYPE bapi1022_feglg002x,
          ls_time   TYPE bapi1022_feglg003,
          ls_timex  TYPE bapi1022_feglg003x,
          ls_return TYPE bapiret2,
          lv_anln2  TYPE anln2.

    SELECT SINGLE * FROM zcapex_ic INTO @DATA(ls_ic) WHERE icid = @iv_icid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'IC' iv_2 = iv_icid ).
    ENDIF.

    " Idempotent
    IF ls_ic-anln1 IS NOT INITIAL.
      zcl_capex_log=>sap( iv_doctype = 'IC' iv_docid = iv_icid iv_action = 'ASSET_CREATE'
                          iv_object = ls_ic-anln1 iv_status = 'W'
                          iv_message = |Asset { ls_ic-anln1 } already created - skipped| ).
      rv_anln1 = ls_ic-anln1.
      RETURN.
    ENDIF.

    zcl_capex_auth=>check_plant( ls_ic-werks ).
    IF ls_ic-status <> 'PENDING'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'IC' iv_2 = iv_icid iv_3 = ls_ic-status ).
    ENDIF.
    DATA(lv_finance) = zcl_capex_config=>get( 'FINANCE_ROLE' ).
    IF zcl_capex_auth=>has_role( iv_role = CONV #( lv_finance ) ) = abap_false
       AND zcl_capex_auth=>is_admin( ) = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-only_role iv_1 = lv_finance ).
    ENDIF.

    " Same rules as ICDetail._validate
    SELECT COUNT(*) FROM zcapex_doc INTO @DATA(lv_photos)
      WHERE doctype = 'IC' AND docid = @iv_icid AND category LIKE 'PHOTO%'.
    IF lv_photos < 3.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-photos_missing iv_1 = lv_photos ).
    ENDIF.
    IF ls_ic-commission_dt IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Commissioning date' ).
    ENDIF.
    IF ls_ic-tech_signoff IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Technical sign-off name' ).
    ENDIF.
    IF ls_ic-equip_cost <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Equipment cost' ).
    ENDIF.
    " Never trust the client's total.
    ls_ic-total_cost = ls_ic-equip_cost + ls_ic-freight_cost + ls_ic-install_cost.

    IF ls_ic-anlkl IS INITIAL OR ls_ic-kostl IS INITIAL.
      SELECT SINGLE anlkl, kostl FROM zcapex_cwip INTO ( @DATA(lv_anlkl), @DATA(lv_kostl) )
        WHERE cwipid = @ls_ic-cwipid.
      IF ls_ic-anlkl IS INITIAL. ls_ic-anlkl = lv_anlkl. ENDIF.
      IF ls_ic-kostl IS INITIAL. ls_ic-kostl = lv_kostl. ENDIF.
    ENDIF.

    ls_key-companycode    = zcl_capex_config=>get( 'COMPANY_CODE' ).
    ls_gen-assetclass     = ls_ic-anlkl.
    ls_gen-descript       = ls_ic-title.
    " Description typed on the CWIP screen (CreateCWIP.AssetDesc), when there is one.
    IF ls_ic-cwipid IS NOT INITIAL.
      DATA(lv_adesc) = zcl_capex_config=>get( |CWIPDESC_{ ls_ic-cwipid }| ).
      IF lv_adesc IS NOT INITIAL.
        ls_gen-descript = lv_adesc.
      ENDIF.
    ENDIF.
    ls_genx-assetclass    = abap_true.
    ls_genx-descript      = abap_true.
    ls_post-cap_date      = ls_ic-commission_dt.
    ls_postx-cap_date     = abap_true.
    ls_time-costcenter    = ls_ic-kostl.
    ls_time-plant         = ls_ic-werks.
    ls_timex-costcenter   = abap_true.
    ls_timex-plant        = abap_true.

    CALL FUNCTION 'BAPI_FIXEDASSET_CREATE1'
      EXPORTING
        key                 = ls_key
        generaldata         = ls_gen
        generaldatax        = ls_genx
        postinginformation  = ls_post
        postinginformationx = ls_postx
        timedependentdata   = ls_time
        timedependentdatax  = ls_timex
      IMPORTING
        asset               = rv_anln1
        subnumber           = lv_anln2
        return              = ls_return.

    IF ls_return-type CA 'EAX' OR rv_anln1 IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      zcl_capex_log=>sap( iv_doctype = 'IC' iv_docid = iv_icid iv_action = 'ASSET_CREATE'
                          iv_status = 'E' iv_message = ls_return-message is_msg = ls_return ).
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-sap_posting_failed
                              iv_1 = 'ASSET_CREATE' iv_2 = iv_icid iv_3 = ls_return-message ).
    ENDIF.

    UPDATE zcapex_ic
      SET anln1 = @rv_anln1, anln2 = @lv_anln2, capitalized_on = @sy-datum,
          status = 'CAPITALIZED', curr_level = 'Completed', total_cost = @ls_ic-total_cost,
          anlkl = @ls_ic-anlkl, kostl = @ls_ic-kostl,
          changed_by = @( zcl_capex_auth=>effective_user( ) ), changed_on = @sy-datum, changed_at = @sy-uzeit
      WHERE icid = @iv_icid.
    UPDATE zcapex_cwip SET status = 'CAPITALIZED' WHERE cwipid = @ls_ic-cwipid.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.

    zcl_capex_log=>sap( iv_doctype = 'IC' iv_docid = iv_icid iv_action = 'ASSET_CREATE'
                        iv_object = rv_anln1 iv_status = 'S'
                        iv_message = |Asset { rv_anln1 }-{ lv_anln2 } created, class { ls_ic-anlkl }| ).
    zcl_capex_log=>audit( iv_doctype = 'IC' iv_docid = iv_icid iv_action = 'Asset capitalized'
                          iv_comment = |Asset { rv_anln1 } created. Depreciation starts { ls_ic-commission_dt DATE = USER }.| ).
    COMMIT WORK.
  ENDMETHOD.


  METHOD confirm_po.
    DATA lt_bret TYPE STANDARD TABLE OF bapireturn WITH DEFAULT KEY.

    SELECT SINGLE * FROM zcapex_po INTO @DATA(ls_po) WHERE ebeln = @iv_ebeln.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'PO' iv_2 = iv_ebeln ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_po-werks ).
    IF ls_po-status = 'APPROVED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'PO' iv_2 = iv_ebeln iv_3 = ls_po-status ).
    ENDIF.

    DATA(lv_rel_code) = zcl_capex_config=>get( 'PO_REL_CODE' ).
    IF lv_rel_code IS NOT INITIAL.
      CALL FUNCTION 'BAPI_PO_RELEASE'
        EXPORTING
          purchaseorder          = iv_ebeln
          po_rel_code            = CONV frgco( lv_rel_code )
          use_exceptions         = abap_true
          no_commit              = abap_true
        TABLES
          return                 = lt_bret
        EXCEPTIONS
          release_already_posted = 1
          OTHERS                 = 2.
      IF sy-subrc = 2 OR line_exists( lt_bret[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        DATA(lv_msg) = COND string( WHEN lt_bret IS NOT INITIAL THEN lt_bret[ 1 ]-message
                                    ELSE |Release failed (sy-subrc { sy-subrc })| ).
        zcl_capex_log=>sap( iv_doctype = 'PO' iv_docid = iv_ebeln iv_action = 'PO_RELEASE'
                            iv_status = 'E' iv_message = lv_msg ).
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-sap_posting_failed
                                iv_1 = 'PO_RELEASE' iv_2 = iv_ebeln iv_3 = lv_msg ).
      ENDIF.
    ENDIF.

    UPDATE zcapex_po SET status = 'APPROVED' WHERE ebeln = @iv_ebeln.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
    zcl_capex_log=>sap( iv_doctype = 'PO' iv_docid = iv_ebeln iv_action = 'PO_RELEASE'
                        iv_object = iv_ebeln iv_status = 'S' iv_message = 'PO confirmed' ).
    zcl_capex_log=>audit( iv_doctype = 'PO' iv_docid = iv_ebeln iv_action = 'PO confirmed'
                          iv_comment = |{ ls_po-vendorname } - { zcl_capex_util=>lakhs( ls_po-amount ) }| ).
    COMMIT WORK.
  ENDMETHOD.


  METHOD create_cwip_record.
    DATA ls_cwip TYPE zcapex_cwip.

    SELECT SINGLE cwipid FROM zcapex_cwip INTO @rv_cwipid WHERE cpeid = @iv_cpeid.
    IF sy-subrc = 0.
      RETURN.
    ENDIF.

    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @iv_cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = iv_cpeid ).
    ENDIF.
    ls_cwip-cwipid        = zcl_capex_number=>get_next_id( iv_range  = zcl_capex_number=>gc_range-cwip
                                                           iv_prefix = 'CW'
                                                           iv_width  = 4
                                                           iv_fiscal = ls_cpe-fiscalyear ).
    ls_cwip-cpeid         = iv_cpeid.
    ls_cwip-budgetid      = ls_cpe-budgetid.
    ls_cwip-title         = ls_cpe-title.
    ls_cwip-werks         = ls_cpe-werks.
    ls_cwip-amount        = ls_cpe-amount.
    ls_cwip-waers         = ls_cpe-waers.
    ls_cwip-status        = 'NOT_STARTED'.
    ls_cwip-anlkl         = suggest_asset_class( ls_cpe-capextype ).
    ls_cwip-payment_terms = ls_cpe-terms.
    ls_cwip-timeframe_wks = ls_cpe-delivery_weeks.
    ls_cwip-exec_process  = 'TURNKEY'.
    ls_cwip-created_by    = zcl_capex_auth=>effective_user( ).
    ls_cwip-created_on    = sy-datum.
    ls_cwip-created_at    = sy-uzeit.
    " The internal order was created when the budget was approved; cost collection lands there.
    SELECT SINGLE aufnr FROM zcapex_budget INTO @ls_cwip-aufnr WHERE budgetid = @ls_cpe-budgetid.

    INSERT zcapex_cwip FROM @ls_cwip.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = iv_cpeid ).
    ENDIF.

    zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'CWIP_CREATE'
                        iv_object = ls_cwip-cwipid iv_status = 'S'
                        iv_message = |CWIP { ls_cwip-cwipid } created on final approval| ).
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid
                          iv_action = 'CWIP created in SAP'
                          iv_comment = |{ ls_cwip-cwipid } - IO { ls_cwip-aufnr }| ).
    rv_cwipid = ls_cwip-cwipid.
  ENDMETHOD.


  METHOD create_internal_order.
    DATA: ls_master TYPE bapi2075_7,
          lt_return TYPE bapiret2_t.

    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_bud) WHERE budgetid = @iv_budgetid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_found iv_1 = iv_budgetid ).
    ENDIF.

    " Idempotent: the retry job may call this again.
    IF ls_bud-aufnr IS NOT INITIAL.
      zcl_capex_log=>sap( iv_doctype = 'BUD' iv_docid = iv_budgetid iv_action = 'IO_CREATE'
                          iv_object = ls_bud-aufnr iv_status = 'W'
                          iv_message = |Internal order { ls_bud-aufnr } already exists - skipped| ).
      rv_aufnr = ls_bud-aufnr.
      RETURN.
    ENDIF.

    ls_master-order_type = zcl_capex_config=>get( 'IO_ORDER_TYPE' ).
    ls_master-co_area    = zcl_capex_config=>get( 'CO_AREA' ).
    ls_master-comp_code  = zcl_capex_config=>get( 'COMPANY_CODE' ).
    ls_master-plant      = ls_bud-werks.
    ls_master-currency   = ls_bud-waers.
*    ls_master-short_text = ls_bud-title.

    CALL FUNCTION 'BAPI_INTERNALORDER_CREATE'
      EXPORTING
        i_master_data = ls_master
      IMPORTING
        orderid       = rv_aufnr
      TABLES
        return        = lt_return.

    IF has_error( lt_return ) = abap_true OR rv_aufnr IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      DATA(lv_msg) = zcl_capex_util=>flatten_return( lt_return ).
      zcl_capex_log=>sap( iv_doctype = 'BUD' iv_docid = iv_budgetid iv_action = 'IO_CREATE'
                          iv_status = 'E' iv_message = lv_msg is_msg = first_error( lt_return ) ).
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-sap_posting_failed
                              iv_1 = 'IO_CREATE' iv_2 = iv_budgetid iv_3 = lv_msg ).
    ENDIF.

    UPDATE zcapex_budget SET aufnr = @rv_aufnr WHERE budgetid = @iv_budgetid.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.

    zcl_capex_log=>sap( iv_doctype = 'BUD' iv_docid = iv_budgetid iv_action = 'IO_CREATE'
                        iv_object = rv_aufnr iv_status = 'S'
                        iv_message = |Internal order { rv_aufnr } created| ).
    zcl_capex_log=>audit( iv_doctype = 'BUD' iv_docid = iv_budgetid
                          iv_action = 'SAP Internal Order created'
                          iv_comment = |IO { rv_aufnr } - budget reserved| ).
    COMMIT WORK.
  ENDMETHOD.


  METHOD ext_date.
    " BAPI_PO_CREATE1 schedule lines take the date in the user's external format.
    rv_text = |{ iv_date DATE = USER }|.
  ENDMETHOD.


  METHOD first_error.
    LOOP AT it_return INTO rs_msg WHERE type CA 'EAX'.
      RETURN.
    ENDLOOP.
    CLEAR rs_msg.
  ENDMETHOD.


  METHOD has_error.
    LOOP AT it_return TRANSPORTING NO FIELDS WHERE type CA 'EAX'.
      rv_error = abap_true.
      RETURN.
    ENDLOOP.
  ENDMETHOD.


  METHOD process_queue.
    SELECT * FROM zcapex_sapq INTO TABLE @DATA(lt_queue)
      WHERE ( status = 'Q' OR status = 'E' ) AND retry_count < @iv_max_retries.

    LOOP AT lt_queue INTO DATA(ls_q).
      ls_q-last_run_on = sy-datum.
      ls_q-last_run_at = sy-uzeit.
      TRY.
          CASE ls_q-sap_action.
            WHEN 'IO_CREATE'.
              ls_q-sap_object = create_internal_order( CONV #( ls_q-docid ) ).
            WHEN OTHERS.
              CONTINUE.
          ENDCASE.
          ls_q-status = 'S'.
          CLEAR ls_q-message.
        CATCH zcx_capex_error INTO DATA(lx_error).
          ls_q-status      = 'E'.
          ls_q-retry_count = ls_q-retry_count + 1.
          ls_q-message     = lx_error->get_text( ).
      ENDTRY.
      MODIFY zcapex_sapq FROM @ls_q.
      COMMIT WORK.
    ENDLOOP.
    " After three failures a row stops retrying and stays E for someone to look at.
  ENDMETHOD.


  METHOD push_cwip.
*&---------------------------------------------------------------------*
*& METHOD push_cwip - CORRECTED to create a Purchase Requisition (PR)
*& first, then create the Purchase Order (PO) WITH REFERENCE TO that PR,
*& instead of creating the PO directly.
*&
*& CHANGES FROM THE ORIGINAL (all marked "NEW" below):
*&   1. Method interface: needs a new EXPORTING parameter EV_BANFN
*&      (type BANFN or EBAN-BANFN) - add it to the method signature,
*&      it is not shown in the pasted code so it could not be edited here.
*&   2. New DATA declarations for the PR BAPI call.
*&   3. New PR-creation block, inserted after the CWIP record is built
*&      and before the PO is created - uses BAPI_REQUISITION_CREATE.
*&      On failure it rolls back and raises the same way the existing
*&      PO-creation failure handling already does.
*&   4. The PO item (lt_item) now carries PREQ_NO/PREQ_ITEM so
*&      BAPI_PO_CREATE1 creates the PO AS A REFERENCE to the PR line,
*&      instead of a PR-less PO.
*&   5. ZCAPEX_CWIP and ZCAPEX_PO both gain a BANFN field (add this
*&      column via SE11 if it does not already exist) so the PR number
*&      is tracked/auditable the same way EBELN already is.
*&   6. New config keys read via zcl_capex_config=>get - add matching
*&      rows to ZCAPEX_CONFIG the same way PO_DOC_TYPE/PO_PUR_GROUP/etc.
*&      already exist:
*&        PR_DOC_TYPE   (e.g. "NB")
*&
*& NOT VERIFIED AGAINST A LIVE SYSTEM: this environment has no SAP
*& connectivity, so this has only been checked for consistency with the
*& existing code's own style/patterns, not tested or activated. Before
*& transporting: confirm BAPIEBANC/BAPIEBKN field names against this
*& system's exact SAP_BASIS release (SE11), and test BAPI_REQUISITION_
*& CREATE/BAPI_PO_CREATE1 together in SE37 or a test report first.
*&---------------------------------------------------------------------*
    DATA: ls_head      TYPE bapimepoheader,
          ls_headx     TYPE bapimepoheaderx,
          lt_item      TYPE STANDARD TABLE OF bapimepoitem WITH DEFAULT KEY,
          lt_itemx     TYPE STANDARD TABLE OF bapimepoitemx WITH DEFAULT KEY,
          lt_sched     TYPE STANDARD TABLE OF bapimeposchedule WITH DEFAULT KEY,
          lt_schedx    TYPE STANDARD TABLE OF bapimeposchedulx WITH DEFAULT KEY,
          lt_acc       TYPE STANDARD TABLE OF bapimepoaccount WITH DEFAULT KEY,
          lt_accx      TYPE STANDARD TABLE OF bapimepoaccountx WITH DEFAULT KEY,
          lt_return    TYPE bapiret2_t,
          ls_po        TYPE zcapex_po,
          " ---- NEW: Purchase Requisition BAPI tables/return -------------
          lt_preq_item TYPE STANDARD TABLE OF bapiebanc WITH DEFAULT KEY,
          lt_preq_acc  TYPE STANDARD TABLE OF bapiebkn WITH DEFAULT KEY,
          lt_preq_ret  TYPE bapiret2_t,
          lv_banfn     TYPE bapiebanc-preq_no.

    CLEAR: ev_cwipid, ev_ebeln, ev_banfn. " NEW: ev_banfn added

    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @is_input-cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = is_input-cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_cpe-werks ).
    IF ls_cpe-status <> 'APPROVED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = is_input-cpeid iv_3 = ls_cpe-status ).
    ENDIF.

    " Same rules as CWIPCreate._validate
    IF is_input-anlkl IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Asset class' ).
    ENDIF.
    IF is_input-kostl IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Cost center' ).
    ENDIF.
    IF is_input-timeframe_wks <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Execution timeframe' ).
    ENDIF.
    IF strlen( condense( is_input-payment_terms ) ) < 15.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-min_length iv_1 = 'Payment terms' iv_2 = 15 ).
    ENDIF.

    SELECT SINGLE * FROM zcapex_cpeven INTO @DATA(ls_ven)
      WHERE cpeid = @is_input-cpeid AND selected = @abap_true.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_vendor_selected ).
    ENDIF.
    IF ls_ven-lifnr IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_lifnr iv_1 = ls_ven-vendorname ).
    ENDIF.

    ev_cwipid = create_cwip_record( is_input-cpeid ).
    SELECT SINGLE * FROM zcapex_cwip INTO @DATA(ls_cwip) WHERE cwipid = @ev_cwipid.
    IF ls_cwip-ebeln IS NOT INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CWIP' iv_2 = ev_cwipid iv_3 = |POSTED (PO { ls_cwip-ebeln })| ).
    ENDIF.

    ls_cwip-anlkl         = is_input-anlkl.
    ls_cwip-kostl         = is_input-kostl.
    ls_cwip-pspnr         = is_input-pspnr.
    ls_cwip-payment_terms = is_input-payment_terms.
    ls_cwip-timeframe_wks = is_input-timeframe_wks.
    ls_cwip-exec_process  = is_input-exec_process.
    ls_cwip-prctr         = is_input-prctr.
    ls_cwip-remarks       = is_input-remarks.

    DATA(lv_deliv)   = CONV datum( sy-datum + is_input-timeframe_wks * 7 ).
    DATA(lv_acc_cat) = COND knttp( WHEN ls_cwip-pspnr IS INITIAL THEN 'F' ELSE 'P' ).

    " The capex internal order must exist before a PR/PO can be account-assigned to it.
    " The budget approval queues its creation; if it has not run yet, create it now (nothing is posted yet,
    " so a failure here simply stops the push with the real SAP message).
    IF lv_acc_cat = 'F' AND ls_cwip-aufnr IS INITIAL.
      SELECT SINGLE aufnr FROM zcapex_budget INTO @ls_cwip-aufnr WHERE budgetid = @ls_cpe-budgetid.
      IF ls_cwip-aufnr IS INITIAL.
        ls_cwip-aufnr = create_internal_order( CONV #( ls_cpe-budgetid ) ).
      ENDIF.
    ENDIF.

    " The PR is committed on its own before the PO is created against it: BAPI_PO_CREATE1 can only
    " reference a requisition that is already on the database. The PR number is stored on the CWIP so a
    " retry after a PO failure re-uses the PR instead of creating a second one.
    IF ls_cwip-banfn IS INITIAL.
    " =================================================================
    " NEW: ---- Purchase Requisition (created first, PO references it) ---
    " =================================================================
    APPEND VALUE #( preq_item = '00010'
                    doc_type   = zcl_capex_config=>get( 'PR_DOC_TYPE' )
                    short_text = ls_cpe-title
                    plant      = ls_cpe-werks
                    mat_grp    = zcl_capex_config=>get( 'PO_MATL_GROUP' )
                    quantity   = 1
                    unit       = zcl_capex_config=>get( 'PO_UNIT' )
                    deliv_date = lv_deliv
                    preq_date  = sy-datum
                    preq_name  = zcl_capex_auth=>effective_user( )
                    acctasscat = lv_acc_cat
                    c_amt_bapi   = ls_cpe-amount     " valuation price (PO_PRICE is only a CHAR1 indicator)
                    price_unit   = 1
                    currency     = ls_cpe-waers
                    des_vendor = ls_ven-lifnr     " desired vendor: FIXED_VEND would demand a purchasing info record

                    purch_org  = zcl_capex_config=>get( 'PO_PURCH_ORG' )
                    pur_group  = zcl_capex_config=>get( 'PO_PUR_GROUP' ) ) TO lt_preq_item.

    APPEND VALUE #( preq_item   = '00010'
                    serial_no   = '01'
                    preq_qty    = 1
                    g_l_acct  = zcl_capex_config=>get( 'PO_GL_ACCOUNT' )
                    co_area     = zcl_capex_config=>get( 'CO_AREA' )
*                    asset_no    = 1302415
                    cost_ctr    = ls_cwip-kostl     " required with the order by BAPI_REQUISITION_CREATE (order alone gives KI248)
                    order_no    = COND #( WHEN lv_acc_cat = 'F' THEN ls_cwip-aufnr )
                    wbs_elem    = COND #( WHEN lv_acc_cat = 'P' THEN ls_cwip-pspnr ) ) TO lt_preq_acc.

    CALL FUNCTION 'BAPI_REQUISITION_CREATE'
      IMPORTING
        number                         = lv_banfn
      TABLES
        requisition_items              = lt_preq_item
        requisition_account_assignment = lt_preq_acc
        return                         = lt_preq_ret.

    IF has_error( lt_preq_ret ) = abap_true OR lv_banfn IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      DATA(lv_preq_msg) = zcl_capex_util=>flatten_return( lt_preq_ret ).
      zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PR_CREATE'
                          iv_status = 'E' iv_message = lv_preq_msg is_msg = first_error( lt_preq_ret ) ).
      " raise_text carries up to 200 characters; the message-text variable of sap_posting_failed holds only 50
      zcx_capex_error=>raise_text( |PR_CREATE failed for { is_input-cpeid }: { lv_preq_msg }| ).
    ENDIF.

      ls_cwip-banfn = lv_banfn.
      MODIFY zcapex_cwip FROM @ls_cwip.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
      zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PR_CREATE'
                          iv_object = lv_banfn iv_status = 'S'
                          iv_message = |PR { lv_banfn } created for CWIP { ev_cwipid }| ).
    ELSE.
      lv_banfn = ls_cwip-banfn.
    ENDIF.

    ev_banfn = lv_banfn. " NEW output - PR number, for the caller/UI to show

    " ---- PO header
    ls_head-comp_code  = zcl_capex_config=>get( 'COMPANY_CODE' ).
    ls_head-doc_type   = zcl_capex_config=>get( 'PO_DOC_TYPE' ).
    ls_head-vendor     = ls_ven-lifnr.
    ls_head-purch_org  = zcl_capex_config=>get( 'PO_PURCH_ORG' ).
    ls_head-pur_group  = zcl_capex_config=>get( 'PO_PUR_GROUP' ).
    ls_head-currency   = ls_cpe-waers.
    ls_head-doc_date   = sy-datum.
    ls_head-incoterms1 = 'EXW'.
    ls_head-incoterms2 = 'EX WORK'.
    ls_headx-comp_code = ls_headx-doc_type = ls_headx-vendor = ls_headx-purch_org =
    ls_headx-pur_group = ls_headx-currency = ls_headx-doc_date = abap_true.
    ls_headx-incoterms1 = 'X'.
    ls_headx-incoterms2 = 'X'.

    " ---- one service/asset item for the full CPE value - NOW with the
    " PR reference (preq_no/preq_item) so this PO is created against the
    " PR created above, instead of standalone.
    APPEND VALUE #( po_item    = '00010'
                    preq_no    = lv_banfn
                    preq_item  = '00010'
                    short_text = ls_cpe-title
                    plant      = ls_cpe-werks
                    matl_group = zcl_capex_config=>get( 'PO_MATL_GROUP' )
                    quantity   = 1
                    po_unit    = zcl_capex_config=>get( 'PO_UNIT' )
                    net_price  = ls_cpe-amount
                    acctasscat = lv_acc_cat
                    info_upd = 'C'
                    tax_code   = zcl_capex_config=>get( 'PO_TAX_CODE' )
                    " goods receipt + GR-based invoice verification: required by the Emami PO check (ZEMAMI357) once the PO takes over the PR
                    gr_ind = 'X' ir_ind = 'X' gr_basediv = 'X' ) TO lt_item.
    APPEND VALUE #( po_item    = '00010' po_itemx   = abap_true
                    short_text = abap_true plant    = abap_true matl_group = abap_true
                    quantity   = abap_true po_unit  = abap_true net_price  = abap_true
                    acctasscat = abap_true tax_code = abap_true info_upd = 'X'
                    " without these flags BAPI_PO_CREATE1 ignores PREQ_NO/PREQ_ITEM and the PO is not linked to the PR
                    preq_no = abap_true preq_item = abap_true gr_ind = abap_true ir_ind = abap_true gr_basediv = abap_true ) TO lt_itemx.

    APPEND VALUE #( po_item = '00010' sched_line = '0001'
                    delivery_date = ext_date( lv_deliv ) quantity = 1 ) TO lt_sched.
    APPEND VALUE #( po_item = '00010' sched_line = '0001' po_itemx = abap_true sched_linex = abap_true
                    delivery_date = abap_true quantity = abap_true ) TO lt_schedx.

    " ---- account assignment: the capex internal order (F) or the WBS element (P)
    APPEND VALUE #( po_item     = '00010'
                    serial_no   = '01'
                    quantity    = 1
                    gl_account  = zcl_capex_config=>get( 'PO_GL_ACCOUNT' )
                    co_area     = zcl_capex_config=>get( 'CO_AREA' )
                    costcenter  = COND #( WHEN lv_acc_cat = 'F' THEN ls_cwip-kostl )  " the order alone gives KI248: a cost center is needed with it
                    orderid     = COND #( WHEN lv_acc_cat = 'F' THEN ls_cwip-aufnr )
                    wbs_element = COND #( WHEN lv_acc_cat = 'P' THEN ls_cwip-pspnr ) ) TO lt_acc.
    APPEND VALUE #( po_item = '00010' serial_no = '01' po_itemx = abap_true serial_nox = abap_true
                    quantity = abap_true gl_account = abap_true co_area = abap_true
                    costcenter = xsdbool( lv_acc_cat = 'F' ) orderid = xsdbool( lv_acc_cat = 'F' ) wbs_element = xsdbool( lv_acc_cat = 'P' ) ) TO lt_accx.

    CALL FUNCTION 'BAPI_PO_CREATE1'
      EXPORTING
        poheader         = ls_head
        poheaderx        = ls_headx
      IMPORTING
        exppurchaseorder = ev_ebeln
      TABLES
        return           = lt_return
        poitem           = lt_item
        poitemx          = lt_itemx
        poschedule       = lt_sched
        poschedulex      = lt_schedx
        poaccount        = lt_acc
        poaccountx       = lt_accx.

    IF has_error( lt_return ) = abap_true OR ev_ebeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'. " the PR is already committed and is re-used on retry
      DATA(lv_msg) = zcl_capex_util=>flatten_return( lt_return ).
      zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PO_CREATE'
                          iv_status = 'E' iv_message = lv_msg is_msg = first_error( lt_return ) ).
      zcx_capex_error=>raise_text( |PO_CREATE failed for { is_input-cpeid }: { lv_msg }| ).
    ENDIF.

    ls_cwip-ebeln      = ev_ebeln.
    ls_cwip-banfn      = lv_banfn. " NEW - requires a BANFN field on ZCAPEX_CWIP
    ls_cwip-status     = 'POSTED'.
    ls_cwip-changed_by = zcl_capex_auth=>effective_user( ).
    ls_cwip-changed_on = sy-datum.
    ls_cwip-changed_at = sy-uzeit.
    MODIFY zcapex_cwip FROM @ls_cwip.

    " PO mirror row, so the PO list shows it at once (sync_po keeps it current)
    ls_po-ebeln         = ev_ebeln.
    ls_po-banfn         = lv_banfn. " NEW - requires a BANFN field on ZCAPEX_PO
    ls_po-cpeid         = is_input-cpeid.
    ls_po-cwipid        = ev_cwipid.
    ls_po-lifnr         = ls_ven-lifnr.
    ls_po-vendorname    = ls_ven-vendorname.
    ls_po-title         = ls_cpe-title.
    ls_po-werks         = ls_cpe-werks.
    ls_po-amount        = ls_cpe-amount.
    ls_po-waers         = ls_cpe-waers.
    ls_po-status        = 'PENDING'.
    ls_po-issued_on     = sy-datum.
    ls_po-exp_delivery  = lv_deliv.
    ls_po-payment_terms = is_input-payment_terms.
    ls_po-synced_on     = sy-datum.
    MODIFY zcapex_po FROM @ls_po.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.

    zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PR_CREATE'
                        iv_object = lv_banfn iv_status = 'S'
                        iv_message = |PR { lv_banfn } created for CWIP { ev_cwipid }| ).
    zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PO_CREATE'
                        iv_object = ev_ebeln iv_status = 'S'
                        iv_message = |PO { ev_ebeln } created for CWIP { ev_cwipid } (ref. PR { lv_banfn })| ).
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = is_input-cpeid
                          iv_action = 'CWIP created in SAP'
                          iv_comment = |{ ev_cwipid } - WBS { ls_cwip-pspnr }| ).
    zcl_capex_log=>audit( iv_doctype = 'PR' iv_docid = lv_banfn
                          iv_action = 'Purchase Requisition created in SAP'
                          iv_comment = |{ ls_ven-vendorname } - { zcl_capex_util=>lakhs( ls_cpe-amount ) }| ).
    zcl_capex_log=>audit( iv_doctype = 'PO' iv_docid = ev_ebeln
                          iv_action = 'Purchase Order created in SAP (with reference to PR)'
                          iv_comment = |PR { lv_banfn } - { ls_ven-vendorname } - { zcl_capex_util=>lakhs( ls_cpe-amount ) }| ).
    COMMIT WORK.





**  METHOD push_cwip.
**    DATA: ls_head   TYPE bapimepoheader,
**          ls_headx  TYPE bapimepoheaderx,
**          lt_item   TYPE STANDARD TABLE OF bapimepoitem WITH DEFAULT KEY,
**          lt_itemx  TYPE STANDARD TABLE OF bapimepoitemx WITH DEFAULT KEY,
**          lt_sched  TYPE STANDARD TABLE OF bapimeposchedule WITH DEFAULT KEY,
**          lt_schedx TYPE STANDARD TABLE OF bapimeposchedulx WITH DEFAULT KEY,
**          lt_acc    TYPE STANDARD TABLE OF bapimepoaccount WITH DEFAULT KEY,
**          lt_accx   TYPE STANDARD TABLE OF bapimepoaccountx WITH DEFAULT KEY,
**          lt_return TYPE bapiret2_t,
**          ls_po     TYPE zcapex_po.
**
**    CLEAR: ev_cwipid, ev_ebeln.
**
**    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @is_input-cpeid.
**    IF sy-subrc <> 0.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = is_input-cpeid ).
**    ENDIF.
**    zcl_capex_auth=>check_plant( ls_cpe-werks ).
**    IF ls_cpe-status <> 'APPROVED'.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
**                              iv_1 = 'CPE' iv_2 = is_input-cpeid iv_3 = ls_cpe-status ).
**    ENDIF.
**
**    " Same rules as CWIPCreate._validate
**    IF is_input-anlkl IS INITIAL.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Asset class' ).
**    ENDIF.
**    IF is_input-kostl IS INITIAL.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Cost center' ).
**    ENDIF.
**    IF is_input-timeframe_wks <= 0.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Execution timeframe' ).
**    ENDIF.
**    IF strlen( condense( is_input-payment_terms ) ) < 15.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-min_length iv_1 = 'Payment terms' iv_2 = 15 ).
**    ENDIF.
**
**    SELECT SINGLE * FROM zcapex_cpeven INTO @DATA(ls_ven)
**      WHERE cpeid = @is_input-cpeid AND selected = @abap_true.
**    IF sy-subrc <> 0.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_vendor_selected ).
**    ENDIF.
**    IF ls_ven-lifnr IS INITIAL.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_lifnr iv_1 = ls_ven-vendorname ).
**    ENDIF.
**
**    ev_cwipid = create_cwip_record( is_input-cpeid ).
**    SELECT SINGLE * FROM zcapex_cwip INTO @DATA(ls_cwip) WHERE cwipid = @ev_cwipid.
**    IF ls_cwip-ebeln IS NOT INITIAL.
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
**                              iv_1 = 'CWIP' iv_2 = ev_cwipid iv_3 = |POSTED (PO { ls_cwip-ebeln })| ).
**    ENDIF.
**
**    ls_cwip-anlkl         = is_input-anlkl.
**    ls_cwip-kostl         = is_input-kostl.
**    ls_cwip-pspnr         = is_input-pspnr.
**    ls_cwip-payment_terms = is_input-payment_terms.
**    ls_cwip-timeframe_wks = is_input-timeframe_wks.
**    ls_cwip-exec_process  = is_input-exec_process.
**    ls_cwip-prctr         = is_input-prctr.
**    ls_cwip-remarks       = is_input-remarks.
**
**    DATA(lv_deliv) = CONV datum( sy-datum + is_input-timeframe_wks * 7 ).
**    DATA(lv_acc_cat) = COND knttp( WHEN ls_cwip-pspnr IS INITIAL THEN 'F' ELSE 'P' ).
**
**    " ---- PO header
**    ls_head-comp_code  = zcl_capex_config=>get( 'COMPANY_CODE' ).
**    ls_head-doc_type   = zcl_capex_config=>get( 'PO_DOC_TYPE' ).
**    ls_head-vendor     = ls_ven-lifnr.
**    ls_head-purch_org  = zcl_capex_config=>get( 'PO_PURCH_ORG' ).
**    ls_head-pur_group  = zcl_capex_config=>get( 'PO_PUR_GROUP' ).
**    ls_head-currency   = ls_cpe-waers.
**    ls_head-doc_date   = sy-datum.
**    ls_head-incoterms1 = 'EXW'.
**    ls_head-incoterms2 = 'EX WORK'.
**    ls_headx-comp_code = ls_headx-doc_type = ls_headx-vendor = ls_headx-purch_org =
**    ls_headx-pur_group = ls_headx-currency = ls_headx-doc_date = abap_true.
**    ls_headx-incoterms1 = 'X'.
**    ls_headx-incoterms2 = 'X'.
**
**    " ---- one service/asset item for the full CPE value
**    APPEND VALUE #( po_item    = '00010'
**                    short_text = ls_cpe-title
**                    plant      = ls_cpe-werks
**                    matl_group = zcl_capex_config=>get( 'PO_MATL_GROUP' )
**                    quantity   = 1
**                    po_unit    = zcl_capex_config=>get( 'PO_UNIT' )
**                    net_price  = ls_cpe-amount
**                    acctasscat = lv_acc_cat
**                    info_upd = 'C'
**                    tax_code   = zcl_capex_config=>get( 'PO_TAX_CODE' ) ) TO lt_item.
**    APPEND VALUE #( po_item    = '00010' po_itemx   = abap_true
**                    short_text = abap_true plant    = abap_true matl_group = abap_true
**                    quantity   = abap_true po_unit  = abap_true net_price  = abap_true
**                    acctasscat = abap_true tax_code = abap_true info_upd = 'X' ) TO lt_itemx.
**
**    APPEND VALUE #( po_item = '00010' sched_line = '0001'
**                    delivery_date = ext_date( lv_deliv ) quantity = 1 ) TO lt_sched.
**    APPEND VALUE #( po_item = '00010' sched_line = '0001' po_itemx = abap_true sched_linex = abap_true
**                    delivery_date = abap_true quantity = abap_true ) TO lt_schedx.
**
**    " ---- account assignment: the capex internal order (F) or the WBS element (P)
**    APPEND VALUE #( po_item     = '00010'
**                    serial_no   = '01'
**                    quantity    = 1
**                    gl_account  = zcl_capex_config=>get( 'PO_GL_ACCOUNT' )
**                    co_area     = zcl_capex_config=>get( 'CO_AREA' )
**                    orderid     = COND #( WHEN lv_acc_cat = 'F' THEN ls_cwip-aufnr )
**                    wbs_element = COND #( WHEN lv_acc_cat = 'P' THEN ls_cwip-pspnr ) ) TO lt_acc.
**    APPEND VALUE #( po_item = '00010' serial_no = '01' po_itemx = abap_true serial_nox = abap_true
**                    quantity = abap_true gl_account = abap_true co_area = abap_true
**                    costcenter = xsdbool( lv_acc_cat = 'F' ) orderid = xsdbool( lv_acc_cat = 'F' ) wbs_element = xsdbool( lv_acc_cat = 'P' ) ) TO lt_accx.
**
**    CALL FUNCTION 'BAPI_PO_CREATE1'
**      EXPORTING
**        poheader         = ls_head
**        poheaderx        = ls_headx
**      IMPORTING
**        exppurchaseorder = ev_ebeln
**      TABLES
**        return           = lt_return
**        poitem           = lt_item
**        poitemx          = lt_itemx
**        poschedule       = lt_sched
**        poschedulex      = lt_schedx
**        poaccount        = lt_acc
**        poaccountx       = lt_accx.
**
**    IF has_error( lt_return ) = abap_true OR ev_ebeln IS INITIAL.
**      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
**      DATA(lv_msg) = zcl_capex_util=>flatten_return( lt_return ).
**      zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PO_CREATE'
**                          iv_status = 'E' iv_message = lv_msg is_msg = first_error( lt_return ) ).
**      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-sap_posting_failed
**                              iv_1 = 'PO_CREATE' iv_2 = is_input-cpeid iv_3 = lv_msg ).
**    ENDIF.
**
**    ls_cwip-ebeln      = ev_ebeln.
**    ls_cwip-status     = 'POSTED'.
**    ls_cwip-changed_by = sy-uname.
**    ls_cwip-changed_on = sy-datum.
**    ls_cwip-changed_at = sy-uzeit.
**    MODIFY zcapex_cwip FROM @ls_cwip.
**
**    " PO mirror row, so the PO list shows it at once (sync_po keeps it current)
**    ls_po-ebeln         = ev_ebeln.
**    ls_po-cpeid         = is_input-cpeid.
**    ls_po-cwipid        = ev_cwipid.
**    ls_po-lifnr         = ls_ven-lifnr.
**    ls_po-vendorname    = ls_ven-vendorname.
**    ls_po-title         = ls_cpe-title.
**    ls_po-werks         = ls_cpe-werks.
**    ls_po-amount        = ls_cpe-amount.
**    ls_po-waers         = ls_cpe-waers.
**    ls_po-status        = 'PENDING'.
**    ls_po-issued_on     = sy-datum.
**    ls_po-exp_delivery  = lv_deliv.
**    ls_po-payment_terms = is_input-payment_terms.
**    ls_po-synced_on     = sy-datum.
**    MODIFY zcapex_po FROM @ls_po.
**
**    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
**
**    zcl_capex_log=>sap( iv_doctype = 'CPE' iv_docid = is_input-cpeid iv_action = 'PO_CREATE'
**                        iv_object = ev_ebeln iv_status = 'S'
**                        iv_message = |PO { ev_ebeln } created for CWIP { ev_cwipid }| ).
**    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = is_input-cpeid
**                          iv_action = 'CWIP created in SAP'
**                          iv_comment = |{ ev_cwipid } - WBS { ls_cwip-pspnr }| ).
**    zcl_capex_log=>audit( iv_doctype = 'PO' iv_docid = ev_ebeln
**                          iv_action = 'Purchase Order created in SAP'
**                          iv_comment = |{ ls_ven-vendorname } - { zcl_capex_util=>lakhs( ls_cpe-amount ) }| ).
**    COMMIT WORK.
**  ENDMETHOD.
  ENDMETHOD.


  METHOD queue.
    DATA ls_q TYPE zcapex_sapq.
    ls_q-doctype     = iv_doctype.
    ls_q-docid       = iv_docid.
    ls_q-sap_action  = iv_action.
    ls_q-status      = 'Q'.
    ls_q-retry_count = 0.
    ls_q-queued_by   = zcl_capex_auth=>effective_user( ).
    ls_q-queued_on   = sy-datum.
    ls_q-queued_at   = sy-uzeit.
    MODIFY zcapex_sapq FROM @ls_q.   " committed together with the approval that queued it
  ENDMETHOD.


  METHOD suggest_asset_class.
    " Same mapping as CWIPCreate._suggestAssetClass in the app.
    rv_anlkl = SWITCH #( iv_capextype
                         WHEN 'MANUFACTURING' THEN '3000'
                         WHEN 'MOULDS'        THEN '3100'
                         WHEN 'IT'            THEN '4000'
                         ELSE                      '3000' ).
  ENDMETHOD.


  METHOD sync_grn.
    DATA: lv_own  TYPE zcapex_de_amount,
          lv_pool TYPE zcapex_de_amount.

    DATA(lv_from) = CONV datum( sy-datum - zcl_capex_config=>get_int( 'MM_SYNC_DAYS' ) ).
    " Goods receipts (101) and their reversals (102) against the mirrored POs
    SELECT s~mblnr, s~mjahr, s~zeile, s~ebeln, s~ebelp, s~werks, s~matnr, s~menge, s~meins,
           s~dmbtr, s~waers, s~shkzg, k~budat
      FROM mseg AS s INNER JOIN mkpf AS k ON k~mblnr = s~mblnr AND k~mjahr = s~mjahr
      INTO TABLE @DATA(lt_src)
      WHERE ( s~bwart = '101' OR s~bwart = '102' )
        AND k~budat >= @lv_from
        AND s~ebeln IN ( SELECT ebeln FROM zcapex_po ).

    LOOP AT lt_src INTO DATA(ls_src).
      SELECT SINGLE * FROM zcapex_grn INTO @DATA(ls_grn)
        WHERE mblnr = @ls_src-mblnr AND mjahr = @ls_src-mjahr AND zeile = @ls_src-zeile.
      IF sy-subrc <> 0.
        CLEAR ls_grn.
      ENDIF.
      ls_grn-mblnr     = ls_src-mblnr.
      ls_grn-mjahr     = ls_src-mjahr.
      ls_grn-zeile     = ls_src-zeile.
      ls_grn-ebeln     = ls_src-ebeln.
      ls_grn-ebelp     = ls_src-ebelp.
      ls_grn-werks     = ls_src-werks.
      ls_grn-matnr     = ls_src-matnr.
      ls_grn-qty       = ls_src-menge.
      ls_grn-meins     = ls_src-meins.
      ls_grn-value     = ls_src-dmbtr.
      ls_grn-waers     = ls_src-waers.
      ls_grn-posted_on = ls_src-budat.
      ls_grn-shkzg     = ls_src-shkzg.
      ls_grn-status    = 'POSTED'.
      " A reversal is a negative receipt, not a second one.
      IF ls_src-shkzg = 'H'.
        ls_grn-qty   = 0 - ls_grn-qty.
        ls_grn-value = 0 - ls_grn-value.
      ENDIF.
      SELECT SINGLE txz01 FROM ekpo INTO @ls_grn-title
        WHERE ebeln = @ls_src-ebeln AND ebelp = @ls_src-ebelp.

      " Commitment -> spend exactly once per GRN line (BUDGET_POSTED makes the job re-runnable).
      IF ls_grn-budget_posted = abap_false.
        DATA lv_cpeid TYPE zcapex_de_cpeid.
        CLEAR lv_cpeid.
        SELECT SINGLE cpeid FROM zcapex_po INTO @lv_cpeid WHERE ebeln = @ls_src-ebeln.
        IF lv_cpeid IS NOT INITIAL.
          SELECT SINGLE budgetid, amount, pool_budgetid, pool_amount
            FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @lv_cpeid.
          IF sy-subrc = 0.
            lv_pool = 0.
            IF ls_cpe-pool_amount > 0 AND ls_cpe-amount > 0.
              lv_pool = ls_grn-value * ls_cpe-pool_amount / ls_cpe-amount.
            ENDIF.
            lv_own = ls_grn-value - lv_pool.
            zcl_capex_budget=>consume( iv_budgetid = ls_cpe-budgetid iv_amount = lv_own iv_docid = ls_grn-mblnr ).
            IF lv_pool <> 0.
              zcl_capex_budget=>consume( iv_budgetid = ls_cpe-pool_budgetid iv_amount = lv_pool iv_docid = ls_grn-mblnr ).
            ENDIF.
          ENDIF.
        ENDIF.
        ls_grn-budget_posted = abap_true.
      ENDIF.

      MODIFY zcapex_grn FROM @ls_grn.
    ENDLOOP.

    " Refresh GRN totals on the PO mirror
    SELECT ebeln, SUM( value ) AS total FROM zcapex_grn INTO TABLE @DATA(lt_sum) GROUP BY ebeln.
    LOOP AT lt_sum INTO DATA(ls_sum).
      DATA(lv_posted) = xsdbool( ls_sum-total > 0 ).
      UPDATE zcapex_po SET grn_value = @ls_sum-total, grn_posted = @lv_posted
        WHERE ebeln = @ls_sum-ebeln.
    ENDLOOP.

    COMMIT WORK.
    zcl_capex_log=>sap( iv_doctype = 'GRN' iv_docid = space iv_action = 'GRN_SYNC' iv_status = 'S'
                        iv_message = |{ lines( lt_src ) } capex GRN lines mirrored| ).
  ENDMETHOD.


  METHOD sync_po.
    TYPES: BEGIN OF ty_src,
             ebeln TYPE ebeln,
             lifnr TYPE lifnr,
             bedat TYPE bedat,
             waers TYPE waers,
             zterm TYPE dzterm,
             inco1 TYPE inco1,
             inco2 TYPE inco2,
             werks TYPE werks_d,
             txz01 TYPE txz01,
             netwr TYPE bwert,
             aufnr TYPE aufnr,
           END OF ty_src.
    DATA: lt_src TYPE STANDARD TABLE OF ty_src WITH DEFAULT KEY,
          lt_po  TYPE SORTED TABLE OF zcapex_po WITH UNIQUE KEY ebeln.

    " 1. POs the portal created
    SELECT k~ebeln, k~lifnr, k~bedat, k~waers, k~zterm, k~inco1, k~inco2,
           p~werks, p~txz01, p~netwr
      FROM ekko AS k INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      INTO CORRESPONDING FIELDS OF TABLE @lt_src
      WHERE k~ebeln IN ( SELECT ebeln FROM zcapex_po )
        AND p~loekz = @space.

    " 2. Any other PO account-assigned (EKKN, not EKPO) to a capex internal order
    SELECT k~ebeln, k~lifnr, k~bedat, k~waers, k~zterm, k~inco1, k~inco2,
           p~werks, p~txz01, p~netwr, n~aufnr
      FROM ekko AS k
        INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
        INNER JOIN ekkn AS n ON n~ebeln = p~ebeln AND n~ebelp = p~ebelp
      APPENDING CORRESPONDING FIELDS OF TABLE @lt_src
      WHERE k~bstyp = 'F' AND k~loekz = @space AND p~loekz = @space
        AND n~aufnr IN ( SELECT aufnr FROM zcapex_budget WHERE aufnr <> @space )
        AND k~ebeln NOT IN ( SELECT ebeln FROM zcapex_po ).

    LOOP AT lt_src INTO DATA(ls_src).
      READ TABLE lt_po ASSIGNING FIELD-SYMBOL(<ls_po>) WITH TABLE KEY ebeln = ls_src-ebeln.
      IF sy-subrc <> 0.
        SELECT SINGLE * FROM zcapex_po INTO @DATA(ls_old) WHERE ebeln = @ls_src-ebeln.
        IF sy-subrc <> 0.
          CLEAR ls_old.
          ls_old-status = 'APPROVED'.   " created directly in MM
        ENDIF.
        ls_old-ebeln     = ls_src-ebeln.
        ls_old-lifnr     = ls_src-lifnr.
        ls_old-issued_on = ls_src-bedat.
        ls_old-waers     = ls_src-waers.
        ls_old-zterm     = ls_src-zterm.
        ls_old-inco1     = ls_src-inco1.
        ls_old-inco2     = ls_src-inco2.
        ls_old-werks     = ls_src-werks.
        ls_old-title     = ls_src-txz01.
        ls_old-amount    = 0.
        INSERT ls_old INTO TABLE lt_po ASSIGNING <ls_po>.
      ENDIF.
      <ls_po>-amount = <ls_po>-amount + ls_src-netwr.
      IF <ls_po>-cwipid IS INITIAL AND ls_src-aufnr IS NOT INITIAL.
        SELECT SINGLE cwipid, cpeid FROM zcapex_cwip
          INTO ( @<ls_po>-cwipid, @<ls_po>-cpeid )
          WHERE aufnr = @ls_src-aufnr.
      ENDIF.
    ENDLOOP.

    LOOP AT lt_po ASSIGNING <ls_po>.
      SELECT SINGLE name1 FROM lfa1 INTO @<ls_po>-vendorname WHERE lifnr = @<ls_po>-lifnr.
      IF <ls_po>-payment_terms IS INITIAL AND <ls_po>-zterm IS NOT INITIAL.
        SELECT SINGLE text1 FROM t052u INTO @<ls_po>-payment_terms
          WHERE spras = @sy-langu AND zterm = @<ls_po>-zterm.
      ENDIF.
      SELECT MIN( eindt ) FROM eket INTO @<ls_po>-exp_delivery WHERE ebeln = @<ls_po>-ebeln.
      SELECT SUM( value ) FROM zcapex_grn INTO @<ls_po>-grn_value WHERE ebeln = @<ls_po>-ebeln.
      <ls_po>-grn_posted = xsdbool( <ls_po>-grn_value > 0 ).
      <ls_po>-synced_on  = sy-datum.
    ENDLOOP.

    MODIFY zcapex_po FROM TABLE @lt_po.
    COMMIT WORK.
    zcl_capex_log=>sap( iv_doctype = 'PO' iv_docid = space iv_action = 'PO_SYNC' iv_status = 'S'
                        iv_message = |{ lines( lt_po ) } capex POs mirrored| ).
  ENDMETHOD.
ENDCLASS.