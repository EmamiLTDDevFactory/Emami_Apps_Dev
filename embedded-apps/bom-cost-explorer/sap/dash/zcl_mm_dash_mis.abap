CLASS zcl_mm_dash_mis DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_mis TYPE STANDARD TABLE OF zdash_s_mis WITH DEFAULT KEY.
    "Costing dashboard, MIS tab: COGM budget vs actual by brand, FTM (month to date) and YTM (financial year to date).
    "Actual  = SAP actual cost of the period (ZCL_MM_WAC_ACTUAL: RM + PM + perfume + conversion, INR, totals).
    "Budget  = approved budget cost per piece x ACTUAL produced quantity (flexed budget). Source: ZMM_FBUDCOST_SUM, the same table and key as the Margin tab: status A, financial year of the as-of date,
    "          latest VERSION, WERKS = production plant, CRSSKU / business vertical / scheme / material type from MARA; cost per piece = RM + PM + perfume + machine + labour + power + steam + labour 3P (average of the rows of that version).
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par iv_detail TYPE abap_bool DEFAULT abap_false.
    METHODS run RETURNING VALUE(rt_mis) TYPE tt_mis.
    METHODS get_messages RETURNING VALUE(rt_msg) TYPE string_table.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_bud,
             werks   TYPE werks_d,
             crssku  TYPE zskugrcodecrs,
             bus     TYPE zbusiness,
             scheme  TYPE zscheme,
             mtart   TYPE mtart,
             version TYPE c LENGTH 2,
             n       TYPE i,
             tot     TYPE decfloat34,   "sum over the rows of the latest version
             cost_pc TYPE decfloat34,   "average = tot / n
           END OF ty_bud,
           tt_bud TYPE HASHED TABLE OF ty_bud WITH UNIQUE KEY werks crssku bus scheme mtart.
    DATA: mv_detail TYPE abap_bool,
          ms_par TYPE zif_mm_wac_types=>ty_par,
          mt_msg TYPE string_table.
    METHODS actuals
      IMPORTING iv_from TYPE d iv_to TYPE d
      RETURNING VALUE(rt_act) TYPE zif_mm_wac_types=>ty_t_act.
ENDCLASS.


CLASS zcl_mm_dash_mis IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    mv_detail = iv_detail.
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
          lt_bud     TYPE tt_bud,
          ls_bud     TYPE ty_bud,
          ls_row     TYPE zdash_s_mis,
          lv_act     TYPE decfloat34,
          lv_budv    TYPE decfloat34,
          lv_ver     TYPE zcostversion,
          lt_fg      TYPE tt_mis.
    FIELD-SYMBOLS: <a> TYPE zif_mm_wac_types=>ty_act, <r> TYPE zdash_s_mis, <f> TYPE zdash_s_mis.

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

    " approved budget cost per piece: ZMM_FBUDCOST_SUM, status A, financial year, latest version of each key (the key of the Margin tab)
    SELECT werks, zskugrcodecrs, zbusiness, zscheme, mtart, version, rm_cost, pm_cost, perfume_cost, machine, labour, power, steam, labour3p
      FROM zmm_fbudcost_sum
      WHERE gjahr = @lv_gjahr AND status = 'A'
      INTO TABLE @DATA(lt_bs).
    SORT lt_bs BY werks zskugrcodecrs zbusiness zscheme mtart version DESCENDING.
    LOOP AT lt_bs ASSIGNING FIELD-SYMBOL(<bs>).
      READ TABLE lt_bud ASSIGNING FIELD-SYMBOL(<b>) WITH TABLE KEY werks = <bs>-werks crssku = <bs>-zskugrcodecrs bus = <bs>-zbusiness scheme = <bs>-zscheme mtart = <bs>-mtart.
      IF sy-subrc <> 0.
        CLEAR ls_bud.
        ls_bud-werks = <bs>-werks. ls_bud-crssku = <bs>-zskugrcodecrs. ls_bud-bus = <bs>-zbusiness. ls_bud-scheme = <bs>-zscheme. ls_bud-mtart = <bs>-mtart. ls_bud-version = <bs>-version.
        INSERT ls_bud INTO TABLE lt_bud ASSIGNING <b>.
      ENDIF.
      IF <b>-version = <bs>-version.   "the first (highest) version only
        <b>-n = <b>-n + 1.
        <b>-tot = <b>-tot + <bs>-rm_cost + <bs>-pm_cost + <bs>-perfume_cost + <bs>-machine + <bs>-labour + <bs>-power + <bs>-steam + <bs>-labour3p.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_bud ASSIGNING <b> WHERE n > 0.
      <b>-cost_pc = <b>-tot / <b>-n.
    ENDLOOP.
    " master data of the produced finished goods: CRSSKU, business vertical, scheme, material type
    IF lt_ytm IS NOT INITIAL.
      SELECT matnr, zskugrcodecrs, zbusiness, zscheme, mtart FROM mara FOR ALL ENTRIES IN @lt_ytm WHERE matnr = @lt_ytm-matnr INTO TABLE @DATA(lt_mm).
      SORT lt_mm BY matnr.
    ENDIF.
    IF lt_bud IS INITIAL.
      APPEND |No approved budget for financial year { lv_gjahr } in ZMM_FBUDCOST_SUM| TO mt_msg.
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
        DATA(lv_has) = abap_false.
        CLEAR ls_bud.
        READ TABLE lt_mm INTO DATA(ls_mm) WITH KEY matnr = <a>-matnr BINARY SEARCH.
        DATA(lv_mmok) = xsdbool( sy-subrc = 0 ).
        IF lv_mmok = abap_true.
          READ TABLE lt_bud INTO ls_bud WITH TABLE KEY werks = <a>-werks crssku = ls_mm-zskugrcodecrs bus = ls_mm-zbusiness scheme = ls_mm-zscheme mtart = ls_mm-mtart.
          IF sy-subrc = 0 AND ls_bud-n > 0. lv_has = abap_true. ENDIF.
        ENDIF.
        IF lv_has = abap_true.
          lv_budv = ls_bud-cost_pc * <a>-qty.
        ELSE.
          lv_budv = 0.
        ENDIF.
        " finished-good rows (detail): one per material and plant, with the budget key that was (not) found
        IF mv_detail = abap_true.
          READ TABLE lt_fg ASSIGNING <f> WITH KEY matnr = <a>-matnr werks = <a>-werks.
          IF sy-subrc <> 0.
            APPEND VALUE #( grain = 'F' zbrand = <a>-zbrand matnr = <a>-matnr maktx = <a>-maktx werks = <a>-werks gjahr = lv_gjahr date_to = lv_to fg_cnt = 1 ) TO lt_fg ASSIGNING <f>.
            IF lv_mmok = abap_false.
              <f>-bud_src = 'No material master record found'.
            ELSEIF lv_has = abap_true.
              <f>-bud_pc  = ls_bud-cost_pc.
              <f>-version = ls_bud-version.
              <f>-bud_src = |ZMM_FBUDCOST_SUM FY { lv_gjahr } version { ls_bud-version }, key { <a>-werks } / { ls_mm-zskugrcodecrs } / { ls_mm-zbusiness } / { ls_mm-zscheme } / { ls_mm-mtart } ({ ls_bud-n } row(s) averaged)|.
            ELSE.
              <f>-bud_src = |No approved budget (status A, FY { lv_gjahr }) in ZMM_FBUDCOST_SUM for key { <a>-werks } / { ls_mm-zskugrcodecrs } / { ls_mm-zbusiness } / { ls_mm-zscheme } / { ls_mm-mtart }|.
              <f>-fg_nobud = 1.
            ENDIF.
          ENDIF.
          IF lv_ytm = abap_true.
            <f>-ytm_qty = <f>-ytm_qty + <a>-qty. <f>-ytm_actual = <f>-ytm_actual + lv_act.
            IF lv_has = abap_true. <f>-ytm_budget = <f>-ytm_budget + lv_budv. <f>-ytm_actual_cmp = <f>-ytm_actual_cmp + lv_act. ENDIF.
          ELSE.
            <f>-ftm_qty = <f>-ftm_qty + <a>-qty. <f>-ftm_actual = <f>-ftm_actual + lv_act.
            IF lv_has = abap_true. <f>-ftm_budget = <f>-ftm_budget + lv_budv. <f>-ftm_actual_cmp = <f>-ftm_actual_cmp + lv_act. ENDIF.
          ENDIF.
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
    IF mv_detail = abap_true.
      LOOP AT lt_fg ASSIGNING <f>.
        IF <f>-ytm_qty > 0. <f>-act_pc = <f>-ytm_actual / <f>-ytm_qty. ENDIF.
      ENDLOOP.
      SORT lt_fg BY zbrand matnr.
      rt_mis = lt_fg.
      RETURN.
    ENDIF.
    SORT rt_mis BY zbrand.
    LOOP AT rt_mis ASSIGNING <r>.
      <r>-date_to = lv_to.
      IF <r>-fg_nobud > 0.
        <r>-msg = |{ <r>-fg_nobud } of { <r>-fg_cnt } finished goods have no approved budget and are left out of the budget comparison|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
