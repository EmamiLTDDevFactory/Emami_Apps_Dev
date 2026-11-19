CLASS zcl_mm_dash_mis DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_mis TYPE STANDARD TABLE OF zdash_s_mis WITH DEFAULT KEY.
    "Costing dashboard, MIS tab: COGM budget vs actual by brand, FTM (month to date) and YTM (financial year to date).
    "Actual  = SAP actual cost of the period (ZCL_MM_WAC_ACTUAL: RM + PM + perfume + conversion, INR, totals).
    "Budget  = approved budget cost per piece (ZMM_BUDCOST_SUM-COST_PC, latest approved version of the financial year) x ACTUAL produced quantity (flexed budget).
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par.
    METHODS run RETURNING VALUE(rt_mis) TYPE tt_mis.
    METHODS get_messages RETURNING VALUE(rt_msg) TYPE string_table.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_bud,
             matnr   TYPE matnr,
             werks   TYPE werks_d,
             version TYPE zcostversion,
             cost_pc TYPE zcost_pc,
           END OF ty_bud,
           tt_bud TYPE SORTED TABLE OF ty_bud WITH UNIQUE KEY matnr werks.
    DATA: ms_par TYPE zif_mm_wac_types=>ty_par,
          mt_msg TYPE string_table.
    METHODS actuals
      IMPORTING iv_from TYPE d iv_to TYPE d
      RETURNING VALUE(rt_act) TYPE zif_mm_wac_types=>ty_t_act.
ENDCLASS.


CLASS zcl_mm_dash_mis IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
  ENDMETHOD.

  METHOD get_messages.
    rt_msg = mt_msg.
  ENDMETHOD.

  METHOD actuals.
    DATA ls_par TYPE zif_mm_wac_types=>ty_par.
    DATA lt_m TYPE string_table.
    ls_par = ms_par.
    ls_par-date_from = iv_from.
    ls_par-date_to   = iv_to.
    ls_par-incl_cmp  = abap_false.
    DATA(lo_util) = NEW zcl_mm_bom_cost_util( ).
    NEW zcl_mm_wac_actual( lo_util )->read( EXPORTING is_par = ls_par IMPORTING et_act = rt_act et_msg = lt_m ).
    APPEND LINES OF lt_m TO mt_msg.
    DELETE rt_act WHERE qty <= 0.
  ENDMETHOD.

  METHOD run.
    DATA: lv_to      TYPE d,
          lv_ftm     TYPE d,
          lv_fy      TYPE d,
          lv_periv   TYPE t001-periv,
          lv_gjahr   TYPE gjahr,
          lt_ftm     TYPE zif_mm_wac_types=>ty_t_act,
          lt_ytm     TYPE zif_mm_wac_types=>ty_t_act,
          lt_bud_db  TYPE STANDARD TABLE OF ty_bud,
          lt_bud     TYPE tt_bud,
          ls_bud     TYPE ty_bud,
          ls_row     TYPE zdash_s_mis,
          lv_act     TYPE decfloat34,
          lv_budv    TYPE decfloat34,
          lv_ver     TYPE zcostversion.
    FIELD-SYMBOLS: <a> TYPE zif_mm_wac_types=>ty_act, <r> TYPE zdash_s_mis.

    lv_to  = ms_par-date_to.
    lv_ftm = lv_to.  lv_ftm+6(2) = '01'.
    " financial year start (April): this year's 1 April, or last year's when the date is January to March
    lv_fy = lv_to.  lv_fy+4(4) = '0401'.
    IF lv_to+4(2) < 4. lv_fy(4) = lv_fy(4) - 1. ENDIF.

    SELECT SINGLE t~periv INTO lv_periv
      FROM t001w AS w INNER JOIN t001k AS k ON k~bwkey = w~bwkey
                      INNER JOIN t001  AS t ON t~bukrs = k~bukrs
      WHERE w~werks = 'HO00'.
    CALL FUNCTION 'DATE_TO_PERIOD_CONVERT'
      EXPORTING
        i_date  = lv_to
        i_periv = lv_periv
      IMPORTING
        e_gjahr = lv_gjahr
      EXCEPTIONS
        OTHERS  = 1.

    lt_ytm = actuals( iv_from = lv_fy iv_to = lv_to ).
    lt_ftm = actuals( iv_from = lv_ftm iv_to = lv_to ).
    IF lt_ytm IS INITIAL. RETURN. ENDIF.

    " approved budget cost per piece: latest approved version of the financial year, one row per material and plant
    SELECT matnr, werks, version, cost_pc
      FROM zmm_budcost_sum
      FOR ALL ENTRIES IN @lt_ytm
      WHERE gjahr = @lv_gjahr AND status = 'A' AND matnr = @lt_ytm-matnr AND werks = @lt_ytm-werks
      INTO CORRESPONDING FIELDS OF TABLE @lt_bud_db.
    SORT lt_bud_db BY matnr werks version DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt_bud_db COMPARING matnr werks.
    lt_bud = lt_bud_db.
    IF lt_bud IS INITIAL.
      APPEND |No approved budget for financial year { lv_gjahr } in the budget cost table| TO mt_msg.
    ENDIF.

    " YTM then FTM, per brand
    DO 2 TIMES.
      DATA(lv_ytm) = xsdbool( sy-index = 1 ).
      LOOP AT COND zif_mm_wac_types=>ty_t_act( WHEN lv_ytm = abap_true THEN lt_ytm ELSE lt_ftm ) ASSIGNING <a>.
        READ TABLE rt_mis ASSIGNING <r> WITH KEY zbrand = <a>-zbrand.
        IF sy-subrc <> 0.
          CLEAR ls_row.
          ls_row-zbrand = <a>-zbrand.
          ls_row-gjahr  = lv_gjahr.
          APPEND ls_row TO rt_mis.
          READ TABLE rt_mis ASSIGNING <r> WITH KEY zbrand = <a>-zbrand.
        ENDIF.
        lv_act = <a>-rm + <a>-pm + <a>-perf + <a>-conv.
        READ TABLE lt_bud INTO ls_bud WITH TABLE KEY matnr = <a>-matnr werks = <a>-werks.
        DATA(lv_has) = xsdbool( sy-subrc = 0 ).
        IF lv_has = abap_true.
          lv_budv = ls_bud-cost_pc * <a>-qty.
        ELSE.
          lv_budv = 0.
        ENDIF.
        IF lv_ytm = abap_true.
          <r>-fg_cnt     = <r>-fg_cnt + 1.
          <r>-ytm_qty    = <r>-ytm_qty + <a>-qty.
          <r>-ytm_actual = <r>-ytm_actual + lv_act.
          IF lv_has = abap_true.
            <r>-ytm_budget     = <r>-ytm_budget + lv_budv.
            <r>-ytm_actual_cmp = <r>-ytm_actual_cmp + lv_act.
            IF ls_bud-version > <r>-version. <r>-version = ls_bud-version. ENDIF.
          ELSE.
            <r>-fg_nobud = <r>-fg_nobud + 1.
          ENDIF.
        ELSE.
          <r>-ftm_qty    = <r>-ftm_qty + <a>-qty.
          <r>-ftm_actual = <r>-ftm_actual + lv_act.
          IF lv_has = abap_true.
            <r>-ftm_budget     = <r>-ftm_budget + lv_budv.
            <r>-ftm_actual_cmp = <r>-ftm_actual_cmp + lv_act.
          ENDIF.
        ENDIF.
      ENDLOOP.
    ENDDO.
    SORT rt_mis BY zbrand.
    LOOP AT rt_mis ASSIGNING <r>.
      <r>-date_to = lv_to.
      IF <r>-fg_nobud > 0.
        <r>-msg = |{ <r>-fg_nobud } of { <r>-fg_cnt } finished goods have no approved budget and are left out of the budget comparison|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
