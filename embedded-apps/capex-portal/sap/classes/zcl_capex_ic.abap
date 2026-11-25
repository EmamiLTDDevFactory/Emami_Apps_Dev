CLASS zcl_capex_ic DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS create
      IMPORTING is_ic          TYPE zcapex_s_ic
      RETURNING VALUE(rv_icid) TYPE zcapex_de_icid
      RAISING   zcx_capex_error.
    CLASS-METHODS update
      IMPORTING is_ic TYPE zcapex_s_ic
      RAISING   zcx_capex_error.
    CLASS-METHODS photo_count
      IMPORTING iv_icid         TYPE zcapex_de_icid
      RETURNING VALUE(rv_count) TYPE i.
    CLASS-METHODS capitalize
      IMPORTING iv_icid          TYPE zcapex_de_icid
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
ENDCLASS.



CLASS ZCL_CAPEX_IC IMPLEMENTATION.


  METHOD capitalize.
    DATA(lv_anln1) = zcl_capex_sap=>capitalize_asset( iv_icid ).
    rs_result = VALUE #( success = abap_true doctype = 'IC' docid = iv_icid
                         status = 'CAPITALIZED' curr_level = 'Completed' sap_object = lv_anln1
                         message = |Asset { lv_anln1 } created. Depreciation has started.| ).
  ENDMETHOD.


  METHOD create.
    DATA ls_db TYPE zcapex_ic.

    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @is_ic-cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = is_ic-cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_cpe-werks ).
    IF ls_cpe-status <> 'APPROVED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = is_ic-cpeid iv_3 = ls_cpe-status ).
    ENDIF.
    SELECT SINGLE icid FROM zcapex_ic INTO @DATA(lv_existing) WHERE cpeid = @is_ic-cpeid.
    IF sy-subrc = 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-ic_exists iv_1 = is_ic-cpeid iv_2 = lv_existing ).
    ENDIF.
    " ICList.onCreate: eligible only once a goods receipt is posted.
    SELECT SINGLE * FROM zcapex_po INTO @DATA(ls_po) WHERE cpeid = @is_ic-cpeid.
    IF sy-subrc <> 0 OR ls_po-grn_posted = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-grn_missing iv_1 = is_ic-cpeid ).
    ENDIF.
    SELECT SINGLE * FROM zcapex_cwip INTO @DATA(ls_cwip) WHERE cpeid = @is_ic-cpeid.

    IF is_ic-commission_dt IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Commissioning date' ).
    ENDIF.
    IF is_ic-tech_signoff IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Technical sign-off name' ).
    ENDIF.
    IF is_ic-equip_cost <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Equipment cost' ).
    ENDIF.

    MOVE-CORRESPONDING is_ic TO ls_db.
    ls_db-icid       = zcl_capex_number=>get_next_id( iv_range  = zcl_capex_number=>gc_range-ic
                                                      iv_prefix = 'IC'
                                                      iv_width  = 4
                                                      iv_fiscal = ls_cpe-fiscalyear ).
    ls_db-cwipid     = ls_cwip-cwipid.
    ls_db-ebeln      = COND #( WHEN is_ic-ebeln IS INITIAL THEN ls_po-ebeln ELSE is_ic-ebeln ).
    IF ls_db-mblnr IS INITIAL.
      SELECT SINGLE mblnr FROM zcapex_grn INTO @ls_db-mblnr WHERE ebeln = @ls_db-ebeln.
    ENDIF.
    ls_db-title      = COND #( WHEN is_ic-title IS INITIAL THEN ls_cpe-title ELSE is_ic-title ).
    ls_db-werks      = ls_cpe-werks.
    ls_db-anlkl      = ls_cwip-anlkl.
    ls_db-kostl      = ls_cwip-kostl.
    ls_db-status     = 'PENDING'.
    ls_db-curr_level = zcl_capex_config=>get( 'FINANCE_ROLE' ).
    ls_db-waers      = ls_cpe-waers.
    ls_db-total_cost = ls_db-equip_cost + ls_db-freight_cost + ls_db-install_cost.
    ls_db-tech_sign_dt = COND #( WHEN is_ic-tech_sign_dt IS INITIAL THEN sy-datum ELSE is_ic-tech_sign_dt ).
    CLEAR: ls_db-anln1, ls_db-anln2, ls_db-capitalized_on.
    ls_db-created_by = zcl_capex_auth=>effective_user( ).
    ls_db-created_on = sy-datum.
    ls_db-created_at = sy-uzeit.

    INSERT zcapex_ic FROM @ls_db.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = ls_db-icid ).
    ENDIF.

    zcl_capex_log=>status( iv_doctype = 'IC' iv_docid = ls_db-icid iv_from = space iv_to = 'PENDING'
                           iv_reason = 'Sent to Finance' ).
    zcl_capex_log=>audit( iv_doctype = 'IC' iv_docid = ls_db-icid
                          iv_action = 'Installation certificate submitted'
                          iv_comment = |Capital cost { zcl_capex_util=>lakhs( ls_db-total_cost ) }| ).
    zcl_capex_log=>notify_role( iv_role = ls_db-curr_level iv_werks = ls_db-werks
                                iv_doctype = 'IC' iv_docid = ls_db-icid
                                iv_title = |{ ls_db-icid } ready for capitalisation|
                                iv_icon = 'sap-icon://building'
                                iv_route = 'icDetail' iv_param_name = 'icId' iv_param_value = ls_db-icid ).
    rv_icid = ls_db-icid.
  ENDMETHOD.


  METHOD photo_count.
    SELECT COUNT(*) FROM zcapex_doc INTO @rv_count
      WHERE doctype = 'IC' AND docid = @iv_icid AND category LIKE 'PHOTO%'.
  ENDMETHOD.


  METHOD update.
    SELECT SINGLE * FROM zcapex_ic INTO @DATA(ls_db) WHERE icid = @is_ic-icid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'IC' iv_2 = is_ic-icid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_db-werks ).
    IF ls_db-status <> 'PENDING'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'IC' iv_2 = is_ic-icid iv_3 = ls_db-status ).
    ENDIF.
    ls_db-commission_dt = is_ic-commission_dt.
    ls_db-equip_cost    = is_ic-equip_cost.
    ls_db-freight_cost  = is_ic-freight_cost.
    ls_db-install_cost  = is_ic-install_cost.
    ls_db-total_cost    = ls_db-equip_cost + ls_db-freight_cost + ls_db-install_cost.
    ls_db-tech_signoff  = is_ic-tech_signoff.
    ls_db-remarks       = is_ic-remarks.
    ls_db-changed_by    = zcl_capex_auth=>effective_user( ).
    ls_db-changed_on    = sy-datum.
    ls_db-changed_at    = sy-uzeit.
    UPDATE zcapex_ic FROM @ls_db.
    zcl_capex_log=>audit( iv_doctype = 'IC' iv_docid = ls_db-icid iv_action = 'Installation certificate updated' ).
  ENDMETHOD.
ENDCLASS.