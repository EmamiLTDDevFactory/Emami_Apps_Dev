CLASS zcl_capex_buddoc DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "! Budget line items (sub-budgets), table ZCAPEX_BUDITM
    TYPES tt_items TYPE STANDARD TABLE OF zcapex_s_buditm WITH DEFAULT KEY.

    "! POST /BudgetSet (flat or deep with BudgetToCashFlows / BudgetToItems). Always creates a DRAFT.
    CLASS-METHODS create
      IMPORTING is_budget          TYPE zcapex_s_budget
                it_cashflows       TYPE zcapex_tt_budcf OPTIONAL
                it_items           TYPE tt_items OPTIONAL
      RETURNING VALUE(rv_budgetid) TYPE zcapex_de_budgetid
      RAISING   zcx_capex_error.
    "! PUT/MERGE /BudgetSet('...'): only while DRAFT, only editable fields.
    "! iv_replace_children = X (deep re-save of a draft): cash flows and items are replaced by
    "! exactly what is passed - rows not passed are deleted.
    CLASS-METHODS update
      IMPORTING is_budget           TYPE zcapex_s_budget
                it_cashflows        TYPE zcapex_tt_budcf OPTIONAL
                it_items            TYPE tt_items OPTIONAL
                iv_replace_children TYPE abap_bool DEFAULT abap_false
      RAISING   zcx_capex_error.
    "! SubmitDocument(DocType='BUD')
    CLASS-METHODS submit
      IMPORTING iv_budgetid      TYPE zcapex_de_budgetid
      RETURNING VALUE(rs_result) TYPE zcapex_s_actres
      RAISING   zcx_capex_error.
    "! Items of one budget, ordered by item number
    CLASS-METHODS read_items
      IMPORTING iv_budgetid     TYPE zcapex_de_budgetid
      RETURNING VALUE(rt_items) TYPE tt_items.
  PRIVATE SECTION.
    TYPES tt_budcf_db TYPE STANDARD TABLE OF zcapex_budcf WITH DEFAULT KEY.
    CLASS-METHODS apply_metrics
      CHANGING cs_budget TYPE zcapex_budget.
    CLASS-METHODS build_cashflows
      IMPORTING iv_budgetid  TYPE zcapex_de_budgetid
                iv_waers     TYPE waers
                it_cashflows TYPE zcapex_tt_budcf
      RETURNING VALUE(rt_cf) TYPE tt_budcf_db.
    "! Item title and amount are mandatory; the header amount must equal the sum of the items.
    CLASS-METHODS check_items
      IMPORTING it_items TYPE tt_items
                iv_total TYPE zcapex_de_amount
      RAISING   zcx_capex_error.
    "! Replaces all items of the budget with it_items, numbered 0001, 0002, ...
    CLASS-METHODS save_items
      IMPORTING iv_budgetid TYPE zcapex_de_budgetid
                iv_waers    TYPE waers
                it_items    TYPE tt_items
      RAISING   zcx_capex_error.
ENDCLASS.



CLASS ZCL_CAPEX_BUDDOC IMPLEMENTATION.


  METHOD apply_metrics.
    DATA lt_rows TYPE zcapex_tt_budcf.
    IF cs_budget-metrics_on = abap_false.
      CLEAR: cs_budget-irr, cs_budget-npv, cs_budget-payback.
      RETURN.
    ENDIF.
    SELECT budgetid, yearnr, amount, waers FROM zcapex_budcf
      INTO CORRESPONDING FIELDS OF TABLE @lt_rows
      WHERE budgetid = @cs_budget-budgetid.
    DATA(lt_cf) = zcl_capex_metrics=>from_budcf( lt_rows ).
    IF lt_cf IS INITIAL.
      CLEAR: cs_budget-irr, cs_budget-npv, cs_budget-payback.
      RETURN.
    ENDIF.
    DATA(ls_m) = zcl_capex_metrics=>calculate( iv_investment = cs_budget-investment
                                               it_cashflows  = lt_cf
                                               iv_hurdle     = cs_budget-hurdle_rate ).
    cs_budget-irr     = ls_m-irr.
    cs_budget-npv     = ls_m-npv.
    cs_budget-payback = ls_m-payback_years.
  ENDMETHOD.


  METHOD build_cashflows.
    " Cash flows year 1..10 (BudgetCreate cf1..cf10)
    DATA lv_year TYPE zcapex_de_yearnr.
    LOOP AT it_cashflows INTO DATA(ls_in).
      lv_year = COND #( WHEN ls_in-yearnr IS INITIAL THEN lv_year + 1 ELSE ls_in-yearnr ).
      APPEND VALUE #( budgetid = iv_budgetid yearnr = lv_year
                      amount = ls_in-amount waers = iv_waers ) TO rt_cf.
    ENDLOOP.
    SORT rt_cf BY yearnr.
    DELETE ADJACENT DUPLICATES FROM rt_cf COMPARING yearnr.
    DELETE rt_cf WHERE yearnr > 10.
  ENDMETHOD.


  METHOD check_items.
    DATA lv_sum TYPE zcapex_de_amount.
    LOOP AT it_items INTO DATA(ls_item).
      IF strlen( condense( ls_item-item_title ) ) = 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = |Item { sy-tabix } description| ).
      ENDIF.
      IF ls_item-amount <= 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = |Item { sy-tabix } amount| ).
      ENDIF.
      lv_sum = lv_sum + ls_item-amount.
    ENDLOOP.
    " The screen totals the items into the header; the service refuses a header that disagrees.
    IF lv_sum <> iv_total.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_items_sum
                              iv_1 = |{ iv_total NUMBER = USER }| iv_2 = |{ lv_sum NUMBER = USER }| ).
    ENDIF.
  ENDMETHOD.


  METHOD create.
    DATA: ls_db TYPE zcapex_budget,
          lt_cf TYPE tt_budcf_db.

    IF is_budget-title IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Budget title' ).
    ENDIF.
    zcl_capex_auth=>check_plant( is_budget-werks ).
    zcl_capex_auth=>check_activity( iv_actvt = '01' iv_werks = is_budget-werks iv_capextype = is_budget-capextype ).
    " Before a number is drawn: a rejected save must not consume a budget id.
    IF it_items IS NOT INITIAL.
      check_items( it_items = it_items iv_total = is_budget-amt_approved ).
    ENDIF.

    MOVE-CORRESPONDING is_budget TO ls_db.
    IF ls_db-fiscalyear IS INITIAL.
      ls_db-fiscalyear = zcl_capex_util=>current_fiscal_year( ).
    ENDIF.
    ls_db-budgetid = zcl_capex_number=>get_next_id( iv_range  = zcl_capex_number=>gc_range-budget
                                                    iv_prefix = 'B'
                                                    iv_width  = 3
                                                    iv_fiscal = ls_db-fiscalyear ).

    " The client does not choose any of these, whatever it sent.
    ls_db-status = 'DRAFT'.
    ls_db-curr_level = '-'.
    CLEAR: ls_db-amt_committed, ls_db-amt_spent, ls_db-aufnr, ls_db-doaid,
           ls_db-submitted_by, ls_db-submitted_on, ls_db-approved_on.
    IF ls_db-waers IS INITIAL.        ls_db-waers = 'INR'. ENDIF.
    IF ls_db-funding_src IS INITIAL.  ls_db-funding_src = 'NEW'. ENDIF.
    IF ls_db-investment IS INITIAL.   ls_db-investment = ls_db-amt_approved. ENDIF.
    IF ls_db-hurdle_rate IS INITIAL.  ls_db-hurdle_rate = zcl_capex_config=>get_amount( 'DEFAULT_HURDLE_RATE' ). ENDIF.
    ls_db-is_commonpool = xsdbool( ls_db-funding_src = 'POOL' ).
    IF ls_db-funding_src <> 'EXIST_IO'.
      CLEAR ls_db-src_aufnr.
    ENDIF.
    ls_db-created_by = zcl_capex_auth=>effective_user( ).
    ls_db-created_on = sy-datum.
    ls_db-created_at = sy-uzeit.

    lt_cf = build_cashflows( iv_budgetid = ls_db-budgetid iv_waers = ls_db-waers it_cashflows = it_cashflows ).

    INSERT zcapex_budget FROM @ls_db.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = ls_db-budgetid ).
    ENDIF.
    IF lt_cf IS NOT INITIAL.
      INSERT zcapex_budcf FROM TABLE @lt_cf.
    ENDIF.
    IF it_items IS NOT INITIAL.
      save_items( iv_budgetid = ls_db-budgetid iv_waers = ls_db-waers it_items = it_items ).
    ENDIF.

    " IRR/NPV/payback are recomputed server-side from the stored cash flows.
    apply_metrics( CHANGING cs_budget = ls_db ).
    UPDATE zcapex_budget FROM @ls_db.

    zcl_capex_log=>status( iv_doctype = 'BUD' iv_docid = ls_db-budgetid iv_from = space iv_to = 'DRAFT'
                           iv_reason = 'Created' ).
    zcl_capex_log=>audit( iv_doctype = 'BUD' iv_docid = ls_db-budgetid
                          iv_action = 'Budget saved as draft'
                          iv_comment = COND #( WHEN it_items IS INITIAL THEN ls_db-title
                                               ELSE |{ ls_db-title } ({ lines( it_items ) } items)| ) ).
    rv_budgetid = ls_db-budgetid.
  ENDMETHOD.


  METHOD read_items.
    SELECT * FROM zcapex_buditm INTO CORRESPONDING FIELDS OF TABLE @rt_items
      WHERE budgetid = @iv_budgetid ORDER BY itemno.
  ENDMETHOD.


  METHOD save_items.
    DATA: lt_db  TYPE STANDARD TABLE OF zcapex_buditm WITH DEFAULT KEY,
          lv_no  TYPE zcapex_de_itemno.

    " Keep the original creation stamp of an item number that already existed.
    SELECT itemno, created_by, created_on, created_at FROM zcapex_buditm
      INTO TABLE @DATA(lt_old) WHERE budgetid = @iv_budgetid.

    LOOP AT it_items INTO DATA(ls_in).
      lv_no = lv_no + 1.
      DATA(ls_db) = CORRESPONDING zcapex_buditm( ls_in ).
      ls_db-budgetid   = iv_budgetid.
      ls_db-itemno     = lv_no.
      ls_db-item_title = condense( ls_in-item_title ).
      ls_db-waers      = iv_waers.
      READ TABLE lt_old INTO DATA(ls_old) WITH KEY itemno = lv_no.
      IF sy-subrc = 0.
        ls_db-created_by = ls_old-created_by.
        ls_db-created_on = ls_old-created_on.
        ls_db-created_at = ls_old-created_at.
        ls_db-changed_by = zcl_capex_auth=>effective_user( ).
        ls_db-changed_on = sy-datum.
        ls_db-changed_at = sy-uzeit.
      ELSE.
        ls_db-created_by = zcl_capex_auth=>effective_user( ).
        ls_db-created_on = sy-datum.
        ls_db-created_at = sy-uzeit.
        CLEAR: ls_db-changed_by, ls_db-changed_on, ls_db-changed_at.
      ENDIF.
      APPEND ls_db TO lt_db.
    ENDLOOP.

    DELETE FROM zcapex_buditm WHERE budgetid = @iv_budgetid.
    IF lt_db IS NOT INITIAL.
      INSERT zcapex_buditm FROM TABLE @lt_db.
      IF sy-subrc <> 0.
        zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-db_error iv_1 = iv_budgetid ).
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD submit.
    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @iv_budgetid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_found iv_1 = iv_budgetid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_db-werks ).
    IF ls_db-status <> 'DRAFT'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'Budget' iv_2 = iv_budgetid iv_3 = ls_db-status ).
    ENDIF.

    " The same rules as BudgetCreate._validate - the service cannot rely on the screen.
    IF ls_db-title IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Budget title' ).
    ENDIF.
    IF ls_db-capextype IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Capex type' ).
    ENDIF.
    IF ls_db-category IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Category' ).
    ENDIF.
    IF ls_db-amt_approved <= 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Budget amount' ).
    ENDIF.
    DATA(lv_min) = zcl_capex_config=>get_int( 'JUSTIF_MIN_CHARS' ).
    IF strlen( condense( ls_db-justification ) ) < lv_min.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-min_length
                              iv_1 = 'Business justification' iv_2 = lv_min ).
    ENDIF.
    IF ls_db-funding_src = 'EXIST_IO' AND ls_db-src_aufnr IS INITIAL.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-field_required iv_1 = 'Source internal order' ).
    ENDIF.
    " Budgets with items: what goes to the approvers must still add up.
    DATA(lt_items) = read_items( iv_budgetid ).
    IF lt_items IS NOT INITIAL.
      check_items( it_items = lt_items iv_total = ls_db-amt_approved ).
    ENDIF.

    zcl_capex_wf=>submit( EXPORTING iv_doctype   = 'BUD'
                                    iv_docid     = iv_budgetid
                                    iv_capextype = ls_db-capextype
                                    iv_amount    = ls_db-amt_approved
                          IMPORTING es_first     = DATA(ls_first)
                                    ev_doaid     = DATA(lv_doaid) ).

    UPDATE zcapex_budget SET submitted_by = @( zcl_capex_auth=>effective_user( ) ), submitted_on = @sy-datum, doaid = @lv_doaid
      WHERE budgetid = @iv_budgetid.

    rs_result = VALUE #( success    = abap_true
                         doctype    = 'BUD'
                         docid      = iv_budgetid
                         status     = 'IN_APPROVAL'
                         curr_level = ls_first-role
                         message    = |Budget { iv_budgetid } submitted. Routed to { ls_first-role }.| ).
  ENDMETHOD.


  METHOD update.
    SELECT SINGLE * FROM zcapex_budget INTO @DATA(ls_db) WHERE budgetid = @is_budget-budgetid.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-budget_not_found iv_1 = is_budget-budgetid ).
    ENDIF.
    zcl_capex_auth=>check_plant( ls_db-werks ).
    " Once in flight the approvers are looking at fixed numbers.
    IF ls_db-status <> 'DRAFT'.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-wrong_status
                              iv_1 = 'Budget' iv_2 = ls_db-budgetid iv_3 = ls_db-status ).
    ENDIF.
    IF is_budget-werks <> ls_db-werks.
      zcl_capex_auth=>check_plant( is_budget-werks ).
    ENDIF.
    IF iv_replace_children = abap_true AND it_items IS NOT INITIAL.
      check_items( it_items = it_items iv_total = is_budget-amt_approved ).
    ENDIF.

    " Editable fields only - status, committed/spent and the order number stay server-owned.
    ls_db-title            = is_budget-title.
    ls_db-werks            = is_budget-werks.
    ls_db-capextype        = is_budget-capextype.
    ls_db-category         = is_budget-category.
    ls_db-amt_approved     = is_budget-amt_approved.
    ls_db-justification    = is_budget-justification.
    ls_db-expected_benefit = is_budget-expected_benefit.
    ls_db-investment       = COND #( WHEN is_budget-investment IS INITIAL THEN is_budget-amt_approved
                                     ELSE is_budget-investment ).
    ls_db-hurdle_rate      = is_budget-hurdle_rate.
    ls_db-metrics_on       = is_budget-metrics_on.
    ls_db-funding_src      = is_budget-funding_src.
    ls_db-src_aufnr        = is_budget-src_aufnr.
    ls_db-is_commonpool    = xsdbool( ls_db-funding_src = 'POOL' ).
    ls_db-changed_by       = zcl_capex_auth=>effective_user( ).
    ls_db-changed_on       = sy-datum.
    ls_db-changed_at       = sy-uzeit.

    IF iv_replace_children = abap_true.
      " Deep re-save of a draft: the screen sends the complete lists.
      DATA(lt_cf) = build_cashflows( iv_budgetid = ls_db-budgetid iv_waers = ls_db-waers it_cashflows = it_cashflows ).
      DELETE FROM zcapex_budcf WHERE budgetid = @ls_db-budgetid.
      IF lt_cf IS NOT INITIAL.
        INSERT zcapex_budcf FROM TABLE @lt_cf.
      ENDIF.
      save_items( iv_budgetid = ls_db-budgetid iv_waers = ls_db-waers it_items = it_items ).
    ENDIF.

    apply_metrics( CHANGING cs_budget = ls_db ).
    UPDATE zcapex_budget FROM @ls_db.

    zcl_capex_log=>audit( iv_doctype = 'BUD' iv_docid = ls_db-budgetid iv_action = 'Budget updated'
                          iv_comment = COND #( WHEN iv_replace_children = abap_true
                                               THEN |{ lines( it_items ) } items| ) ).
  ENDMETHOD.
ENDCLASS.
