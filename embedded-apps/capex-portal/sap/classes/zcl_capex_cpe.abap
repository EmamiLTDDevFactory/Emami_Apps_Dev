CLASS zcl_capex_cpe DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_ven TYPE STANDARD TABLE OF zcapex_cpeven WITH DEFAULT KEY.

    CLASS-METHODS create
      IMPORTING is_cpe          TYPE zcapex_s_cpe
                it_vendors      TYPE zcapex_tt_vendor OPTIONAL
                it_cashflows    TYPE zcapex_tt_cpecf OPTIONAL
      RETURNING VALUE(rv_cpeid) TYPE zcapex_de_cpeid
      RAISING   zcx_capex_error.
    CLASS-METHODS update
      IMPORTING is_cpe TYPE zcapex_s_cpe
      RAISING   zcx_capex_error.
    CLASS-METHODS submit
      IMPORTING iv_cpeid         TYPE zcapex_de_cpeid
                iv_pool_budgetid TYPE zcapex_de_budgetid OPTIONAL
                iv_pool_amount   TYPE zcapex_de_amount OPTIONAL
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
    "! Empty parameters mean "keep what is stored".
    CLASS-METHODS save_evaluation
      IMPORTING iv_cpeid     TYPE zcapex_de_cpeid
                iv_compliant TYPE csequence OPTIONAL
                iv_remark    TYPE csequence OPTIONAL
                iv_vendorseq TYPE csequence OPTIONAL
                iv_justif    TYPE csequence OPTIONAL
      RAISING   zcx_capex_error.
    CLASS-METHODS submit_evaluation
      IMPORTING iv_cpeid         TYPE zcapex_de_cpeid
                iv_compliant     TYPE csequence OPTIONAL
                iv_remark        TYPE csequence OPTIONAL
                iv_vendorseq     TYPE csequence OPTIONAL
                iv_justif        TYPE csequence OPTIONAL
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
    CLASS-METHODS return_cpe
      IMPORTING iv_cpeid         TYPE zcapex_de_cpeid
                iv_comment       TYPE csequence
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
    "! Net TCO saving of the selected vendor against L1 (negative = premium).
    CLASS-METHODS saving_vs_l1
      IMPORTING iv_cpeid         TYPE zcapex_de_cpeid
                iv_sel_vendor    TYPE zcapex_de_venseq
      RETURNING VALUE(rv_saving) TYPE zcapex_de_amount.
private section.

  class-methods RANK_VENDORS
    changing
      !CT_VENDORS type TT_VEN .
  class-methods VALIDATE_VENDORS
    importing
      !IV_AMOUNT type ZCAPEX_DE_AMOUNT
      !IT_VENDORS type TT_VEN
      !IV_JUSTIF type CSEQUENCE
    raising
      ZCX_CAPEX_ERROR .
  class-methods CHECK_EVALUATOR
    raising
      ZCX_CAPEX_ERROR .
  class-methods APPLY_METRICS
    changing
      !CS_CPE type ZCAPEX_CPE .
  class-methods CHECK_ATTACHMENTS
    importing
      value(IV_CPEID) type ZCAPEX_DE_CPEID optional
      value(IV_VENDORS) type ZCAPEX_DE_VENSEQ optional .
ENDCLASS.



CLASS ZCL_CAPEX_CPE IMPLEMENTATION.


  METHOD apply_metrics.
    DATA lt_rows TYPE zcapex_tt_cpecf.
    IF cs_cpe-metrics_on = abap_false.
      CLEAR: cs_cpe-irr, cs_cpe-npv, cs_cpe-payback.
      RETURN.
    ENDIF.
    SELECT cpeid, yearnr, amount, waers FROM zcapex_cpecf
      INTO CORRESPONDING FIELDS OF TABLE @lt_rows WHERE cpeid = @cs_cpe-cpeid.
    DATA(lt_cf) = zcl_capex_metrics=>from_cpecf( lt_rows ).
    IF lt_cf IS INITIAL.
      CLEAR: cs_cpe-irr, cs_cpe-npv, cs_cpe-payback.
      RETURN.
    ENDIF.
    DATA(ls_m) = zcl_capex_metrics=>calculate( iv_investment = cs_cpe-investment
                                               it_cashflows  = lt_cf
                                               iv_hurdle     = cs_cpe-hurdle_rate ).
    cs_cpe-irr     = ls_m-irr.
    cs_cpe-npv     = ls_m-npv.
    cs_cpe-payback = ls_m-payback_years.
  ENDMETHOD.


  METHOD check_attachments.
    " iv_vendors = number of vendor rows on the CPE
    SELECT category FROM zcapex_doc INTO TABLE @DATA(lt_cat)
      WHERE doctype = 'CPE' AND docid = @iv_cpeid.

    DATA(lv_slots) = nmin( val1 = nmax( val1 = iv_vendors val2 = 1 ) val2 = 3 ).
    DATA lt_req TYPE STANDARD TABLE OF zcapex_de_doccat WITH EMPTY KEY.
    DO lv_slots TIMES.
      APPEND |RFQ{ sy-index }|   TO lt_req.
      APPEND |QUOTE{ sy-index }| TO lt_req.
    ENDDO.
    APPEND 'TCC'           TO lt_req.
    APPEND 'NEGOTIATION'   TO lt_req.
    APPEND 'JUSTIFICATION' TO lt_req.

    LOOP AT lt_req INTO DATA(lv_req).
      IF NOT line_exists( lt_cat[ category = lv_req ] ).
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-attach_missing iv_1 = lv_req ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD check_evaluator.
    DATA(lv_roles) = zcl_capex_config=>get( 'EVAL_ROLES' ).
    IF zcl_capex_auth=>has_any_role( iv_roles = lv_roles ) = abap_false
       AND zcl_capex_auth=>is_admin( ) = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-only_role iv_1 = lv_roles ).
    ENDIF.
  ENDMETHOD.


  METHOD create.
    DATA: ls_db   TYPE zcapex_cpe,
          lt_ven  TYPE tt_ven,
          lt_cf   TYPE STANDARD TABLE OF zcapex_cpecf WITH DEFAULT KEY,
          lv_year TYPE zcapex_de_yearnr.

    IF is_cpe-budgetid IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Approved budget' ).
    ENDIF.
    IF is_cpe-title IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'CPE title' ).
    ENDIF.
    IF is_cpe-amount <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'CPE amount' ).
    ENDIF.

    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_bud) WHERE budgetid = @is_cpe-budgetid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_found iv_1 = is_cpe-budgetid ).
    ENDIF.
    IF ls_bud-status <> 'APPROVED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_approved
                              iv_1 = is_cpe-budgetid iv_2 = ls_bud-status ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_bud-werks ).
    zcl_capex_auth=>check_activity( iv_actvt = '01' iv_werks = ls_bud-werks iv_capextype = ls_bud-capextype ).

    MOVE-CORRESPONDING is_cpe TO ls_db.
    " Auto-filled from the budget (CPECreate._applyBudget) - never trusted from the client.
    ls_db-werks      = ls_bud-werks.
    ls_db-capextype  = ls_bud-capextype.
    ls_db-category   = ls_bud-category.
    ls_db-fiscalyear = ls_bud-fiscalyear.
    ls_db-waers      = ls_bud-waers.
    ls_db-cpeid      = zcl_capex_number=>get_next_id( iv_range  = zcl_capex_number=>gc_range-cpe
                                                      iv_prefix = 'CPE'
                                                      iv_width  = 4
                                                      iv_fiscal = ls_bud-fiscalyear ).
    ls_db-status     = 'DRAFT'.
    ls_db-curr_level = '-'.
    CLEAR: ls_db-tech_compliant, ls_db-tech_remark, ls_db-tech_by, ls_db-tech_on,
           ls_db-block_reason, ls_db-rollout_flag, ls_db-doaid, ls_db-pool_budgetid, ls_db-pool_amount,
           ls_db-submitted_by, ls_db-submitted_on, ls_db-approved_on.
    IF ls_db-investment IS INITIAL.  ls_db-investment = ls_db-amount. ENDIF.
    IF ls_db-hurdle_rate IS INITIAL. ls_db-hurdle_rate = zcl_capex_config=>get_amount( 'DEFAULT_HURDLE_RATE' ). ENDIF.
    ls_db-created_by = zcl_capex_auth=>effective_user( ).
    ls_db-created_on = sy-datum.
    ls_db-created_at = sy-uzeit.

    " ---- vendors
    LOOP AT it_vendors INTO DATA(ls_vin).
      IF ls_vin-vendorname IS INITIAL AND ls_vin-quote_amt <= 0.
        CONTINUE.
      ENDIF.
      DATA(ls_ven) = CORRESPONDING zcapex_cpeven( ls_vin ).
      ls_ven-cpeid = ls_db-cpeid.
      ls_ven-waers = ls_db-waers.
      IF ls_ven-vendorseq IS INITIAL.
        ls_ven-vendorseq = |V{ lines( lt_ven ) + 1 }|.
      ENDIF.
      IF ls_ven-lifnr IS NOT INITIAL.
        ls_ven-lifnr = |{ ls_ven-lifnr ALPHA = IN }|.
      ENDIF.
      APPEND ls_ven TO lt_ven.
    ENDLOOP.
    rank_vendors( CHANGING ct_vendors = lt_ven ).
    IF ls_db-sel_vendor IS INITIAL.
      READ TABLE lt_ven INTO DATA(ls_selected) WITH KEY selected = abap_true.
      IF sy-subrc = 0.
        ls_db-sel_vendor = ls_selected-vendorseq.
      ENDIF.
    ENDIF.
    LOOP AT lt_ven ASSIGNING FIELD-SYMBOL(<ls_ven>).
      <ls_ven>-selected = xsdbool( <ls_ven>-vendorseq = ls_db-sel_vendor ).
    ENDLOOP.

    " ---- cash flows (CPECreate cf1..cf5)
    LOOP AT it_cashflows INTO DATA(ls_cfin).
      lv_year = COND #( WHEN ls_cfin-yearnr IS INITIAL THEN lv_year + 1 ELSE ls_cfin-yearnr ).
      APPEND VALUE #( cpeid = ls_db-cpeid yearnr = lv_year amount = ls_cfin-amount waers = ls_db-waers ) TO lt_cf.
    ENDLOOP.
    SORT lt_cf BY yearnr.
    DELETE ADJACENT DUPLICATES FROM lt_cf COMPARING yearnr.

    INSERT zcapex_cpe FROM @ls_db.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = ls_db-cpeid ).
    ENDIF.
    IF lt_ven IS NOT INITIAL.
      INSERT zcapex_cpeven FROM TABLE @lt_ven.
    ENDIF.
    IF lt_cf IS NOT INITIAL.
      INSERT zcapex_cpecf FROM TABLE @lt_cf.
    ENDIF.
    apply_metrics( CHANGING cs_cpe = ls_db ).
    UPDATE zcapex_cpe FROM @ls_db.

    zcl_capex_log=>status( iv_doctype = 'CPE' iv_docid = ls_db-cpeid iv_from = space iv_to = 'DRAFT'
                           iv_reason = 'Created' ).
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = ls_db-cpeid iv_action = 'CPE saved as draft'
                          iv_comment = |{ ls_db-title } - raised against budget { ls_db-budgetid }| ).
    rv_cpeid = ls_db-cpeid.
  ENDMETHOD.


  METHOD rank_vendors.
    " L1..Ln by quote, lowest first (CPECreate._rankVendors).
    DATA(lt_sorted) = ct_vendors.
    DELETE lt_sorted WHERE quote_amt <= 0.
    SORT lt_sorted BY quote_amt ASCENDING.
    LOOP AT ct_vendors ASSIGNING FIELD-SYMBOL(<ls_ven>).
      CLEAR <ls_ven>-ranking.
    ENDLOOP.
    LOOP AT lt_sorted INTO DATA(ls_sorted).
      DATA(lv_rank) = sy-tabix.
      READ TABLE ct_vendors ASSIGNING <ls_ven> WITH KEY vendorseq = ls_sorted-vendorseq.
      IF sy-subrc = 0.
        <ls_ven>-ranking = |L{ lv_rank }|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD return_cpe.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @iv_cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = iv_cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_cpe-werks ).
    IF ls_cpe-status <> 'UNDER_EVALUATION'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = iv_cpeid iv_3 = ls_cpe-status ).
    ENDIF.
    " Technical evaluation belongs to the Unit Technical* step of this CPE's DOA chain (admins may act too).
    IF zcl_capex_auth=>is_admin( ) = abap_false.
      DATA(lv_role_me) = zcl_capex_auth=>get_user( )-role.
      SELECT COUNT(*) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
        WHERE d~doctype = 'CPE'
          AND ( d~capextype = @ls_cpe-capextype OR d~capextype = '*' )
          AND d~amount_from <= @ls_cpe-amount
          AND ( d~amount_to >= @ls_cpe-amount OR d~amount_to = 0 )
          AND d~active = @abap_true
          AND d~valid_from <= @sy-datum
          AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
          AND c~role LIKE 'Unit Technical%'
          AND ( c~approver = @( zcl_capex_auth=>effective_user( ) ) OR c~role = @lv_role_me )
          INTO @DATA(lv_n_eval).
      IF lv_n_eval = 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-only_role iv_1 = 'Unit Technical' ).
      ENDIF.
    ENDIF.
    DATA(lv_min) = zcl_capex_config=>get_int( 'COMMENT_MIN_CHARS' ).
    IF strlen( condense( CONV string( iv_comment ) ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-comment_required iv_1 = lv_min ).
    ENDIF.

    zcl_capex_budget=>release_cpe( iv_cpeid ).
    UPDATE zcapex_cpe SET status = 'DRAFT', curr_level = 'Returned to initiator',
                          pool_budgetid = @space, pool_amount = 0,
                          changed_by = @( zcl_capex_auth=>effective_user( ) ), changed_on = @sy-datum
      WHERE cpeid = @iv_cpeid.
    zcl_capex_log=>status( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_from = 'UNDER_EVALUATION' iv_to = 'DRAFT'
                           iv_reason = 'Returned from evaluation' iv_comment = iv_comment ).
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid
                          iv_action = 'Returned - technical non-compliance' iv_comment = iv_comment ).
    zcl_capex_log=>notify( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_recipient = ls_cpe-created_by
                           iv_title = |{ iv_cpeid } returned from technical evaluation|
                           iv_message = iv_comment iv_icon = 'sap-icon://decline'
                           iv_route = 'cpeDetail' iv_param_name = 'cpeId' iv_param_value = iv_cpeid ).

    rs_result = VALUE #( success = abap_true doctype = 'CPE' docid = iv_cpeid
                         status = 'DRAFT' curr_level = 'Returned to initiator'
                         message = |{ iv_cpeid } returned to { zcl_capex_util=>user_name( ls_cpe-created_by ) }.| ).
  ENDMETHOD.


  METHOD save_evaluation.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @iv_cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = iv_cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_cpe-werks ).
    IF ls_cpe-status <> 'UNDER_EVALUATION'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = iv_cpeid iv_3 = ls_cpe-status ).
    ENDIF.
    " Technical evaluation belongs to the Unit Technical* step of this CPE's DOA chain (admins may act too).
    IF zcl_capex_auth=>is_admin( ) = abap_false.
      DATA(lv_role_me) = zcl_capex_auth=>get_user( )-role.
      SELECT COUNT(*) FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
        WHERE d~doctype = 'CPE'
          AND ( d~capextype = @ls_cpe-capextype OR d~capextype = '*' )
          AND d~amount_from <= @ls_cpe-amount
          AND ( d~amount_to >= @ls_cpe-amount OR d~amount_to = 0 )
          AND d~active = @abap_true
          AND d~valid_from <= @sy-datum
          AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
          AND c~role LIKE 'Unit Technical%'
          AND ( c~approver = @( zcl_capex_auth=>effective_user( ) ) OR c~role = @lv_role_me )
          INTO @DATA(lv_n_eval).
      IF lv_n_eval = 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-only_role iv_1 = 'Unit Technical' ).
      ENDIF.
    ENDIF.

    IF iv_compliant IS NOT INITIAL.
      ls_cpe-tech_compliant = zcl_capex_util=>to_flag( iv_compliant ).
    ENDIF.
    IF iv_remark IS NOT INITIAL.
      ls_cpe-tech_remark = iv_remark.
    ENDIF.
    IF iv_justif IS NOT INITIAL.
      ls_cpe-nonl1_justif = iv_justif.
    ENDIF.
    IF iv_vendorseq IS NOT INITIAL.
      DATA(lv_seq) = CONV zcapex_de_venseq( iv_vendorseq ).
      SELECT SINGLE vendorseq FROM zcapex_cpeven INTO @DATA(lv_found)
        WHERE cpeid = @iv_cpeid AND vendorseq = @lv_seq.
      IF sy-subrc <> 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'Vendor' iv_2 = lv_seq ).
      ENDIF.
      UPDATE zcapex_cpeven SET selected = @abap_false WHERE cpeid = @iv_cpeid.
      UPDATE zcapex_cpeven SET selected = @abap_true WHERE cpeid = @iv_cpeid AND vendorseq = @lv_seq.
      ls_cpe-sel_vendor = lv_seq.
    ENDIF.
    ls_cpe-tech_by    = zcl_capex_auth=>effective_user( ).
    ls_cpe-tech_on    = sy-datum.
    ls_cpe-changed_by = zcl_capex_auth=>effective_user( ).
    ls_cpe-changed_on = sy-datum.
    ls_cpe-changed_at = sy-uzeit.
    UPDATE zcapex_cpe FROM @ls_cpe.
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'Evaluation saved'
                          iv_comment = ls_cpe-tech_remark ).
  ENDMETHOD.


  METHOD saving_vs_l1.
    SELECT vendorseq, ranking, quote_amt, totalcost FROM zcapex_cpeven INTO TABLE @DATA(lt_ven)
      WHERE cpeid = @iv_cpeid.
    READ TABLE lt_ven INTO DATA(ls_l1) WITH KEY ranking = 'L1'.
    IF sy-subrc <> 0 OR iv_sel_vendor IS INITIAL OR iv_sel_vendor = ls_l1-vendorseq.
      RETURN.
    ENDIF.
    READ TABLE lt_ven INTO DATA(ls_sel) WITH KEY vendorseq = iv_sel_vendor.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    rv_saving = COND zcapex_de_amount( WHEN ls_l1-totalcost IS NOT INITIAL THEN ls_l1-totalcost ELSE ls_l1-quote_amt )
              - COND zcapex_de_amount( WHEN ls_sel-totalcost IS NOT INITIAL THEN ls_sel-totalcost ELSE ls_sel-quote_amt ).
  ENDMETHOD.


  METHOD submit.
    DATA: lv_pool_id  TYPE zcapex_de_budgetid,
          lv_pool_amt TYPE zcapex_de_amount,
          lt_ven      TYPE tt_ven,
          ls_pool     TYPE zcl_capex_budget=>ty_position.

    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @iv_cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = iv_cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_cpe-werks ).
    IF ls_cpe-status <> 'DRAFT' AND ls_cpe-status <> 'BLOCKED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = iv_cpeid iv_3 = ls_cpe-status ).
    ENDIF.
    IF ls_cpe-created_by <> zcl_capex_auth=>effective_user( ) AND zcl_capex_auth=>is_admin( ) = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_authorised iv_1 = iv_cpeid iv_2 = 'Initiator' ).
    ENDIF.

    " ---- the same rules as CPECreate._validate
    DATA(lv_min) = zcl_capex_config=>get_int( 'SPECS_MIN_CHARS' ).
    IF strlen( condense( ls_cpe-specs ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-min_length iv_1 = 'Technical specifications' iv_2 = lv_min ).
    ENDIF.
    SELECT * FROM zcapex_cpeven INTO TABLE @lt_ven WHERE cpeid = @iv_cpeid.
    validate_vendors( iv_amount = ls_cpe-amount it_vendors = lt_ven iv_justif = ls_cpe-nonl1_justif ).

    " ---- mandatory documents (RFQ + quote per vendor, TCC, negotiation, justification) - the same set the
    "      portal's Submit enforces. Checked here too, so a draft resubmitted from CPE Detail cannot skip it.
    "      Same rule as the private check_attachments( ), written inline: that method does not declare
    "      ZCX_CAPEX_ERROR, so calling it turned the message into a generic HTTP 500.
    "      Skipped where document storage is not configured (DOC_ROOT empty).
    IF zcl_capex_config=>get( 'DOC_ROOT' ) IS NOT INITIAL.
      DATA(lv_nven) = 0.
      LOOP AT lt_ven INTO DATA(ls_vchk) WHERE vendorname IS NOT INITIAL AND quote_amt > 0.
        lv_nven = lv_nven + 1.
      ENDLOOP.
      SELECT category FROM zcapex_doc INTO TABLE @DATA(lt_dcat)
        WHERE doctype = 'CPE' AND docid = @iv_cpeid.
      DATA(lv_slots) = nmin( val1 = nmax( val1 = lv_nven val2 = 1 ) val2 = 3 ).
      DATA lt_req TYPE STANDARD TABLE OF zcapex_de_doccat WITH EMPTY KEY.
      DO lv_slots TIMES.
        APPEND |RFQ{ sy-index }|   TO lt_req.
        APPEND |QUOTE{ sy-index }| TO lt_req.
      ENDDO.
      APPEND 'TCC'           TO lt_req.
      APPEND 'NEGOTIATION'   TO lt_req.
      APPEND 'JUSTIFICATION' TO lt_req.
      LOOP AT lt_req INTO DATA(lv_req).
        IF NOT line_exists( lt_dcat[ category = lv_req ] ).
          zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-attach_missing iv_1 = lv_req ).
        ENDIF.
      ENDLOOP.
    ENDIF.

    " ---- common-pool draw (CPECreate.onBudgetRemedy -> fundingTopUp)
    IF iv_pool_budgetid IS NOT INITIAL AND iv_pool_amount > 0.
      lv_pool_id  = iv_pool_budgetid.
      lv_pool_amt = nmin( val1 = iv_pool_amount val2 = ls_cpe-amount ).
      ls_pool = zcl_capex_budget=>position( lv_pool_id ).
      IF ls_pool-is_commonpool = abap_false OR ls_pool-status <> 'APPROVED'.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-pool_invalid iv_1 = lv_pool_id ).
      ENDIF.
      zcl_capex_budget=>lock( lv_pool_id ).
    ENDIF.
    DATA(lv_own) = CONV zcapex_de_amount( ls_cpe-amount - lv_pool_amt ).

    zcl_capex_budget=>lock( ls_cpe-budgetid ).
    DATA(ls_pos) = zcl_capex_budget=>position( ls_cpe-budgetid ).
    IF ls_pos-status <> 'APPROVED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_approved
                              iv_1 = ls_cpe-budgetid iv_2 = ls_pos-status ).
    ENDIF.
    IF lv_pool_id IS NOT INITIAL.
      ls_pool = zcl_capex_budget=>position( lv_pool_id ).   " re-read under lock
    ENDIF.

    " ---- budget control: BLOCKED is stored and answered with Success = false (HTTP 200),
    "      so that the status and the reason survive - an HTTP error would roll them back.
    DATA lv_reason TYPE string.
    IF lv_own > ls_pos-available.
      lv_reason = |Requested { zcl_capex_util=>lakhs( lv_own ) } exceeds available | &&
                  |{ zcl_capex_util=>lakhs( ls_pos-available ) } on budget { ls_cpe-budgetid }. | &&
                  |Shortfall { zcl_capex_util=>lakhs( CONV #( lv_own - ls_pos-available ) ) }.|.
    ELSEIF lv_pool_id IS NOT INITIAL AND lv_pool_amt > ls_pool-available.
      lv_reason = |The common pool { lv_pool_id } has only { zcl_capex_util=>lakhs( ls_pool-available ) } | &&
                  |available against a draw of { zcl_capex_util=>lakhs( lv_pool_amt ) }.|.
    ENDIF.

    IF lv_reason IS NOT INITIAL.
      UPDATE zcapex_cpe SET status = 'BLOCKED', curr_level = 'Budget Check', block_reason = @lv_reason,
                            changed_by = @( zcl_capex_auth=>effective_user( ) ), changed_on = @sy-datum
        WHERE cpeid = @iv_cpeid.
      zcl_capex_log=>status( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_from = ls_cpe-status iv_to = 'BLOCKED'
                             iv_reason = 'Budget check failed' iv_comment = lv_reason ).
      zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid
                            iv_action = 'Budget check failed - BLOCKED' iv_comment = lv_reason ).
      rs_result = VALUE #( success = abap_false doctype = 'CPE' docid = iv_cpeid
                           status = 'BLOCKED' curr_level = 'Budget Check' message = lv_reason ).
      RETURN.
    ENDIF.
    " ---- reserve the commitment in real time
    zcl_capex_budget=>commit( iv_budgetid = ls_cpe-budgetid iv_amount = lv_own iv_docid = iv_cpeid ).
    IF lv_pool_id IS NOT INITIAL.
      zcl_capex_budget=>commit( iv_budgetid = lv_pool_id iv_amount = lv_pool_amt iv_docid = iv_cpeid ).
      zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'Common pool draw'
                            iv_comment = |{ zcl_capex_util=>lakhs( lv_pool_amt ) } from { lv_pool_id }| ).
    ENDIF.

    UPDATE zcapex_cpe SET status = 'UNDER_EVALUATION', curr_level = 'Technical Evaluation',
                          block_reason = @space, pool_budgetid = @lv_pool_id, pool_amount = @lv_pool_amt,
                          submitted_by = @( zcl_capex_auth=>effective_user( ) ), submitted_on = @sy-datum,
                          changed_by = @( zcl_capex_auth=>effective_user( ) ), changed_on = @sy-datum
      WHERE cpeid = @iv_cpeid.
    zcl_capex_log=>status( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_from = ls_cpe-status
                           iv_to = 'UNDER_EVALUATION' iv_reason = 'Submitted for evaluation' ).
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'CPE submitted for evaluation'
                          iv_comment = ls_cpe-title ).
    " Only the Unit Technical* holder(s) of this CPE's DOA chain are asked to evaluate.
    SELECT c~role, c~approver FROM zcapex_doachn AS c INNER JOIN zcapex_doa AS d ON d~doaid = c~doaid
      INTO TABLE @DATA(lt_evaluators)
      WHERE d~doctype = 'CPE'
        AND ( d~capextype = @ls_cpe-capextype OR d~capextype = '*' )
        AND d~amount_from <= @ls_cpe-amount
        AND ( d~amount_to >= @ls_cpe-amount OR d~amount_to = 0 )
        AND d~active = @abap_true
        AND d~valid_from <= @sy-datum
        AND ( d~valid_to >= @sy-datum OR d~valid_to = '00000000' )
        AND c~role LIKE 'Unit Technical%'.
    IF lt_evaluators IS INITIAL.
      zcx_capex_error=>raise_text( |No Unit Technical step in the DOA chain for { iv_cpeid } - add one in ZCAPEX_DOACHN| ).
    ENDIF.
    LOOP AT lt_evaluators INTO DATA(ls_evaluator).
      IF ls_evaluator-approver IS NOT INITIAL.
        zcl_capex_log=>notify( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_recipient = ls_evaluator-approver
                               iv_title = |{ iv_cpeid } awaiting technical evaluation|
                               iv_route = 'evaluation' iv_param_name = 'cpeId' iv_param_value = iv_cpeid ).
      ELSE.
        zcl_capex_log=>notify_role( iv_role = CONV #( ls_evaluator-role )
                                    iv_werks = ls_cpe-werks iv_doctype = 'CPE' iv_docid = iv_cpeid
                                    iv_title = |{ iv_cpeid } awaiting technical evaluation|
                                    iv_route = 'evaluation' iv_param_name = 'cpeId' iv_param_value = iv_cpeid ).
      ENDIF.
    ENDLOOP.

    rs_result = VALUE #( success = abap_true doctype = 'CPE' docid = iv_cpeid
                         status = 'UNDER_EVALUATION' curr_level = 'Technical Evaluation'
                         message = |{ iv_cpeid } submitted. Routed to Unit Technical for evaluation.| ).
  ENDMETHOD.


  METHOD submit_evaluation.
    DATA : lt_pre TYPE zcl_capex_wf=>tt_prestep,
           lt_ven TYPE tt_ven.

    save_evaluation( iv_cpeid = iv_cpeid iv_compliant = iv_compliant iv_remark = iv_remark
                     iv_vendorseq = iv_vendorseq iv_justif = iv_justif ).
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_cpe) WHERE cpeid = @iv_cpeid.
    SELECT * FROM zcapex_cpeven INTO TABLE @lt_ven WHERE cpeid = @iv_cpeid.

    " ---- the same rules as Evaluation._validate
    DATA(lv_min) = zcl_capex_config=>get_int( 'SPECS_MIN_CHARS' ).
    IF strlen( condense( ls_cpe-tech_remark ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-min_length iv_1 = 'Technical remarks' iv_2 = lv_min ).
    ENDIF.
    validate_vendors( iv_amount = ls_cpe-amount it_vendors = lt_ven iv_justif = ls_cpe-nonl1_justif ).

    " Not compliant: returned to the initiator with the remarks (Evaluation.onSubmitEvaluation).
    IF ls_cpe-tech_compliant = abap_false.
      rs_result = return_cpe( iv_cpeid = iv_cpeid iv_comment = ls_cpe-tech_remark ).
      RETURN.
    ENDIF.

    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'Technical compliance certified'
                          iv_comment = ls_cpe-tech_remark ).
    READ TABLE lt_ven INTO DATA(ls_sel) WITH KEY selected = abap_true.
    IF sy-subrc = 0 AND ls_sel-ranking <> 'L1'.
      zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = iv_cpeid iv_action = 'Vendor selected (non-L1)'
                            iv_comment = ls_cpe-nonl1_justif ).
    ENDIF.

    " Levels 1 and 2 of the timeline are completed automatically (Evaluation._seedApprovalChain).
    lt_pre = VALUE #( ( role     = zcl_capex_config=>get( 'INITIATOR_ROLE' )
                        approver = ls_cpe-created_by
                        acted_on = COND #( WHEN ls_cpe-submitted_on IS INITIAL THEN ls_cpe-created_on
                                           ELSE ls_cpe-submitted_on )
                        comments = |CPE raised against budget { ls_cpe-budgetid }.| )
                      ( role     = zcl_capex_auth=>get_user( )-role
                        approver = zcl_capex_auth=>effective_user( )
                        acted_on = sy-datum
                        comments = ls_cpe-tech_remark ) ).

    zcl_capex_wf=>submit( EXPORTING iv_doctype   = 'CPE'
                                    iv_docid     = iv_cpeid
                                    iv_capextype = ls_cpe-capextype
                                    iv_amount    = ls_cpe-amount
                                    it_presteps  = lt_pre
                          IMPORTING es_first     = DATA(ls_first)
                                    ev_doaid     = DATA(lv_doaid) ).
    UPDATE zcapex_cpe SET doaid = @lv_doaid WHERE cpeid = @iv_cpeid.

    rs_result = VALUE #( success = abap_true doctype = 'CPE' docid = iv_cpeid
                         status = 'IN_APPROVAL' curr_level = ls_first-role
                         message = |Evaluation submitted. { iv_cpeid } routed to { ls_first-role }.| ).
  ENDMETHOD.


  METHOD update.
    SELECT SINGLE * FROM zcapex_cpe INTO @DATA(ls_db) WHERE cpeid = @is_cpe-cpeid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-not_found iv_1 = 'CPE' iv_2 = is_cpe-cpeid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_db-werks ).
    IF ls_db-status <> 'DRAFT' AND ls_db-status <> 'BLOCKED'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'CPE' iv_2 = ls_db-cpeid iv_3 = ls_db-status ).
    ENDIF.
    ls_db-title          = is_cpe-title.
    ls_db-amount         = is_cpe-amount.
    ls_db-specs          = is_cpe-specs.
    ls_db-terms          = is_cpe-terms.
    ls_db-delivery_weeks = is_cpe-delivery_weeks.
    ls_db-metrics_on     = is_cpe-metrics_on.
    ls_db-hurdle_rate    = is_cpe-hurdle_rate.
    ls_db-investment     = COND #( WHEN is_cpe-investment IS INITIAL THEN is_cpe-amount ELSE is_cpe-investment ).
    ls_db-nonl1_justif   = is_cpe-nonl1_justif.
    ls_db-changed_by     = zcl_capex_auth=>effective_user( ).
    ls_db-changed_on     = sy-datum.
    ls_db-changed_at     = sy-uzeit.
    apply_metrics( CHANGING cs_cpe = ls_db ).
    UPDATE zcapex_cpe FROM @ls_db.
    zcl_capex_log=>audit( iv_doctype = 'CPE' iv_docid = ls_db-cpeid iv_action = 'CPE updated' ).
  ENDMETHOD.


  METHOD validate_vendors.
    DATA(lt_valid) = it_vendors.
    DELETE lt_valid WHERE vendorname IS INITIAL OR quote_amt <= 0.
    IF lt_valid IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'At least one vendor quote' ).
    ENDIF.
    DATA(lv_limit) = zcl_capex_config=>get_amount( 'THREE_QUOTE_LIMIT' ).
    IF iv_amount > lv_limit AND lines( lt_valid ) < 3.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-three_quotes iv_1 = zcl_capex_util=>lakhs( lv_limit ) ).
    ENDIF.
    READ TABLE lt_valid INTO DATA(ls_sel) WITH KEY selected = abap_true.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-no_vendor_selected ).
    ENDIF.
    DATA(lv_min) = zcl_capex_config=>get_int( 'NONL1_MIN_CHARS' ).
    IF ls_sel-ranking <> 'L1' AND strlen( condense( CONV string( iv_justif ) ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-nonl1_justif iv_1 = lv_min ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.