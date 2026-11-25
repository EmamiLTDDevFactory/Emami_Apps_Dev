CLASS zcl_mm_cogm_bridge DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_bridge TYPE STANDARD TABLE OF zdash_s_bridge WITH DEFAULT KEY.
    "Costing dashboard, MIS tab: COGM variance bridge (year to date, flexed budget) per brand. Staged version:
    "  Budget (flexed)  = approved budget cost per piece x actual quantity (ZMM_FBUDCOST_SUM, as the MIS tab)
    "  Material rate / usage (RM, PM, perfume) = from the component consumption of the process orders (ZCL_AUFM_UTILITY3) against the budget items (ZMM_FBUDCOST_DET):
    "      usage = (actual qty - budget qty) x budget rate, rate = actual value - actual qty x budget rate. Done for the finished goods with the largest material variance
    "      (BRIDGE_FG_MAX, default 15); the material variance of the others is shown as 'not split'.
    "  Overheads        = actual conversion - budget machine, labour, power, steam, labour 3P (all finished goods)
    "  Mix / Currency   = not available: no planned volumes (ZSALES_BUD_TGT is empty) and no budget exchange rate. Shown with a message, value 0.
    "  Unexplained      = what the effects above do not add up to.
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par.
    METHODS run RETURNING VALUE(rt_rows) TYPE tt_bridge.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_bud,
             werks  TYPE werks_d,
             crssku TYPE zskugrcodecrs,
             bus    TYPE zbusiness,
             scheme TYPE zscheme,
             mtart  TYPE mtart,
             ver    TYPE c LENGTH 2,
             n      TYPE i,
             rm     TYPE decfloat34,
             pm     TYPE decfloat34,
             pf     TYPE decfloat34,
             oh     TYPE decfloat34,
           END OF ty_bud,
           tt_bud TYPE HASHED TABLE OF ty_bud WITH UNIQUE KEY werks crssku bus scheme mtart.
    TYPES: BEGIN OF ty_fg,
             matnr  TYPE matnr,
             werks  TYPE werks_d,
             zbrand TYPE zpbrand,
             qty    TYPE decfloat34,
             a_mat  TYPE decfloat34,   "actual RM + PM + perfume
             a_oh   TYPE decfloat34,   "actual conversion
             b_mat  TYPE decfloat34,   "flexed budget RM + PM + perfume
             b_oh   TYPE decfloat34,
             b_tot  TYPE decfloat34,
             has    TYPE abap_bool,
             split  TYPE abap_bool,
             crssku TYPE zskugrcodecrs,
             bus    TYPE zbusiness,
             scheme TYPE zscheme,
             mtart  TYPE mtart,
             ver    TYPE c LENGTH 2,
           END OF ty_fg.
    TYPES: BEGIN OF ty_br,
             zbrand  TYPE zpbrand,
             fg      TYPE i,
             nobud   TYPE i,
             done    TYPE i,
             budget  TYPE decfloat34,
             actual  TYPE decfloat34,
             rate_r  TYPE decfloat34,
             use_r   TYPE decfloat34,
             rate_p  TYPE decfloat34,
             use_p   TYPE decfloat34,
             rate_f  TYPE decfloat34,
             use_f   TYPE decfloat34,
             nosplit TYPE decfloat34,
             ovh     TYPE decfloat34,
           END OF ty_br.
    DATA ms_par TYPE zif_mm_wac_types=>ty_par.
    METHODS category IMPORTING iv_mtart TYPE mtart iv_matkl TYPE matkl RETURNING VALUE(rv_cat) TYPE char1.
    METHODS add_row IMPORTING iv_brand TYPE zpbrand iv_effect TYPE clike iv_sort TYPE i iv_value TYPE decfloat34 iv_msg TYPE string DEFAULT ``
                    CHANGING  ct_rows TYPE tt_bridge.
ENDCLASS.


CLASS zcl_mm_cogm_bridge IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
  ENDMETHOD.

  METHOD category.
    rv_cat = COND #( WHEN iv_mtart = 'VERP' OR iv_mtart = 'PKGN' THEN 'P'
                     WHEN iv_mtart = 'ROH' AND iv_matkl = '106'   THEN 'F'
                     WHEN iv_mtart = 'ROH'                        THEN 'R'
                     ELSE 'O' ).
  ENDMETHOD.

  METHOD add_row.
    APPEND VALUE #( zbrand = iv_brand effect = iv_effect sort_no = iv_sort werks = ms_par-werks[ 1 ]-low date_to = ms_par-date_to
                    value = iv_value msg = iv_msg ) TO ct_rows.
  ENDMETHOD.

  METHOD run.
    DATA: lv_fy     TYPE d,
          lv_periv  TYPE t001-periv,
          lv_gjahr  TYPE gjahr,
          lt_act    TYPE zif_mm_wac_types=>ty_t_act,
          lt_doc    TYPE zmm_wac_tt_doc,
          lt_m      TYPE string_table,
          lt_bud    TYPE tt_bud,
          ls_bud    TYPE ty_bud,
          lt_fg     TYPE STANDARD TABLE OF ty_fg WITH DEFAULT KEY,
          lt_br     TYPE HASHED TABLE OF ty_br WITH UNIQUE KEY zbrand,
          ls_fg     TYPE ty_fg.
    FIELD-SYMBOLS: <br> TYPE ty_br, <f> TYPE ty_fg.

    " financial year of the as-of date (April start) and its period variant
    lv_fy = ms_par-date_to.  lv_fy+4(4) = '0401'.
    IF ms_par-date_to+4(2) < 4. lv_fy(4) = lv_fy(4) - 1. ENDIF.
    SELECT SINGLE t~periv INTO lv_periv
      FROM t001w AS w INNER JOIN t001k AS k ON k~bwkey = w~bwkey
                      INNER JOIN t001  AS t ON t~bukrs = k~bukrs
      WHERE w~werks = 'HO00'.
    CALL FUNCTION 'DATE_TO_PERIOD_CONVERT'
      EXPORTING i_date = ms_par-date_to i_periv = lv_periv
      IMPORTING e_gjahr = lv_gjahr
      EXCEPTIONS OTHERS = 1.

    " ---- actual of the financial year to date, per finished good (and its documents)
    DATA(ls_par) = ms_par.
    ls_par-date_from = lv_fy.
    ls_par-incl_cmp  = abap_false.
    DATA(lo_util) = NEW zcl_mm_bom_cost_util( ).
    NEW zcl_mm_wac_actual( lo_util )->read( EXPORTING is_par = ls_par IMPORTING et_act = lt_act et_doc = lt_doc et_msg = lt_m ).
    DELETE lt_act WHERE qty <= 0.
    IF lt_act IS INITIAL. RETURN. ENDIF.

    " ---- approved budget per piece by component group: ZMM_FBUDCOST_SUM, status A, FY, latest version
    SELECT werks, zskugrcodecrs, zbusiness, zscheme, mtart, version, rm_cost, pm_cost, perfume_cost, machine, labour, power, steam, labour3p
      FROM zmm_fbudcost_sum WHERE gjahr = @lv_gjahr AND status = 'A'
      INTO TABLE @DATA(lt_bs).
    SORT lt_bs BY werks zskugrcodecrs zbusiness zscheme mtart version DESCENDING.
    LOOP AT lt_bs ASSIGNING FIELD-SYMBOL(<bs>).
      READ TABLE lt_bud ASSIGNING FIELD-SYMBOL(<b>) WITH TABLE KEY werks = <bs>-werks crssku = <bs>-zskugrcodecrs bus = <bs>-zbusiness scheme = <bs>-zscheme mtart = <bs>-mtart.
      IF sy-subrc <> 0.
        CLEAR ls_bud.
        ls_bud-werks = <bs>-werks. ls_bud-crssku = <bs>-zskugrcodecrs. ls_bud-bus = <bs>-zbusiness. ls_bud-scheme = <bs>-zscheme. ls_bud-mtart = <bs>-mtart. ls_bud-ver = <bs>-version.
        INSERT ls_bud INTO TABLE lt_bud ASSIGNING <b>.
      ENDIF.
      IF <b>-ver = <bs>-version.
        <b>-n  = <b>-n + 1.
        <b>-rm = <b>-rm + <bs>-rm_cost. <b>-pm = <b>-pm + <bs>-pm_cost. <b>-pf = <b>-pf + <bs>-perfume_cost.
        <b>-oh = <b>-oh + <bs>-machine + <bs>-labour + <bs>-power + <bs>-steam + <bs>-labour3p.
      ENDIF.
    ENDLOOP.
    SELECT matnr, zskugrcodecrs, zbusiness, zscheme, mtart FROM mara FOR ALL ENTRIES IN @lt_act WHERE matnr = @lt_act-matnr INTO TABLE @DATA(lt_mm).
    SORT lt_mm BY matnr.

    " ---- per finished good: actual, flexed budget, material variance
    LOOP AT lt_act ASSIGNING FIELD-SYMBOL(<a>).
      CLEAR ls_fg.
      ls_fg-matnr = <a>-matnr. ls_fg-werks = <a>-werks. ls_fg-zbrand = <a>-zbrand. ls_fg-qty = <a>-qty.
      ls_fg-a_mat = <a>-rm + <a>-pm + <a>-perf. ls_fg-a_oh = <a>-conv.
      READ TABLE lt_mm INTO DATA(ls_mm) WITH KEY matnr = <a>-matnr BINARY SEARCH.
      IF sy-subrc = 0.
        READ TABLE lt_bud INTO ls_bud WITH TABLE KEY werks = <a>-werks crssku = ls_mm-zskugrcodecrs bus = ls_mm-zbusiness scheme = ls_mm-zscheme mtart = ls_mm-mtart.
        IF sy-subrc = 0 AND ls_bud-n > 0.
          ls_fg-has = abap_true.
          ls_fg-b_mat = ( ls_bud-rm + ls_bud-pm + ls_bud-pf ) / ls_bud-n * <a>-qty.
          ls_fg-b_oh  = ls_bud-oh / ls_bud-n * <a>-qty.
          ls_fg-b_tot = ls_fg-b_mat + ls_fg-b_oh.
          ls_fg-crssku = ls_mm-zskugrcodecrs. ls_fg-bus = ls_mm-zbusiness. ls_fg-scheme = ls_mm-zscheme. ls_fg-mtart = ls_mm-mtart. ls_fg-ver = ls_bud-ver.
        ENDIF.
      ENDIF.
      APPEND ls_fg TO lt_fg.
    ENDLOOP.

    " ---- the finished goods whose material variance is split (largest first)
    DATA(lv_max) = CONV i( lo_util->cfg( iv_key = 'BRIDGE_FG_MAX' iv_default = '15' ) ).
    TYPES: BEGIN OF ty_rank, idx TYPE i, v TYPE decfloat34, END OF ty_rank.
    DATA lt_rank TYPE STANDARD TABLE OF ty_rank WITH DEFAULT KEY.
    LOOP AT lt_fg ASSIGNING <f> WHERE has = abap_true.
      APPEND VALUE #( idx = sy-tabix v = abs( <f>-a_mat - <f>-b_mat ) ) TO lt_rank.
    ENDLOOP.
    SORT lt_rank BY v DESCENDING.
    IF lines( lt_rank ) > lv_max. DELETE lt_rank FROM lv_max + 1. ENDIF.

    " orders of the chosen finished goods (from the production documents)
    TYPES: BEGIN OF ty_o, aufnr TYPE aufnr, idx TYPE i, END OF ty_o.
    DATA: lt_o   TYPE SORTED TABLE OF ty_o WITH UNIQUE KEY aufnr,
          lt_run TYPE zcl_aufm_utility3=>ty_t_orders.
    LOOP AT lt_rank INTO DATA(ls_rk).
      READ TABLE lt_fg INDEX ls_rk-idx ASSIGNING <f>.
      LOOP AT lt_doc ASSIGNING FIELD-SYMBOL(<dc>) WHERE matnr = <f>-matnr AND werks = <f>-werks AND aufnr IS NOT INITIAL AND qty > 0.
        INSERT VALUE #( aufnr = <dc>-aufnr idx = ls_rk-idx ) INTO TABLE lt_o.
      ENDLOOP.
    ENDLOOP.
    DATA(lv_omax) = CONV i( lo_util->cfg( iv_key = 'BRIDGE_ORD_MAX' iv_default = '300' ) ).
    IF lines( lt_o ) > lv_omax. DELETE lt_o FROM lv_omax + 1. ENDIF.
    LOOP AT lt_o ASSIGNING FIELD-SYMBOL(<oo>).
      APPEND VALUE #( aufnr = <oo>-aufnr ) TO lt_run.
    ENDLOOP.

    " component consumption of those orders, in chunks of 25
    DATA: lt_all TYPE zcl_aufm_utility3=>ty_t_order_drill_dn,
          lt_os  TYPE zcl_aufm_utility3=>ty_t_orders,
          lt_a   TYPE zcl_aufm_utility3=>ty_t_aufm,
          lt_d   TYPE zcl_aufm_utility3=>ty_t_order_drill_dn,
          lt_s   TYPE zcl_aufm_utility3=>ty_t_order_sum.
    DATA(lv_i) = 0.
    LOOP AT lt_run INTO DATA(ls_run).
      lv_i = lv_i + 1.
      APPEND ls_run TO lt_os.
      IF lines( lt_os ) >= 25 OR lv_i = lines( lt_run ).
        CLEAR: lt_a, lt_d, lt_s.
        zcl_aufm_utility3=>get_mat_consumption_details(
          EXPORTING iv_mtart = 'FERT' it_orders = lt_os iv_till_date = '99991231' iv_include_abnormal_mvt = ' '
          CHANGING ct_aufm = lt_a ct_ord_drill_dn = lt_d ct_ord_mtart_sum = lt_s ).
        APPEND LINES OF lt_d TO lt_all.
        CLEAR lt_os.
      ENDIF.
    ENDLOOP.

    " per finished good: produced quantity (level 0) and components (not WIP)
    TYPES: BEGIN OF ty_c, idx TYPE i, idnrk TYPE matnr, mtart TYPE mtart, qty TYPE decfloat34, val TYPE decfloat34, END OF ty_c.
    DATA: lt_c TYPE SORTED TABLE OF ty_c WITH UNIQUE KEY idx idnrk,
          lt_q TYPE HASHED TABLE OF ty_rank WITH UNIQUE KEY idx.
    LOOP AT lt_all ASSIGNING FIELD-SYMBOL(<d>).
      READ TABLE lt_o ASSIGNING <oo> WITH TABLE KEY aufnr = <d>-aufnr_main.
      CHECK sy-subrc = 0.
      IF <d>-level = 0.
        READ TABLE lt_q ASSIGNING FIELD-SYMBOL(<q>) WITH TABLE KEY idx = <oo>-idx.
        IF sy-subrc <> 0. INSERT VALUE #( idx = <oo>-idx ) INTO TABLE lt_q ASSIGNING <q>. ENDIF.
        <q>-v = <q>-v + <d>-menge.
      ELSEIF <d>-mtart <> 'WIP' AND <d>-matnr IS NOT INITIAL.
        READ TABLE lt_c ASSIGNING FIELD-SYMBOL(<c>) WITH TABLE KEY idx = <oo>-idx idnrk = <d>-matnr.
        IF sy-subrc <> 0. INSERT VALUE #( idx = <oo>-idx idnrk = <d>-matnr mtart = <d>-mtart ) INTO TABLE lt_c ASSIGNING <c>. ENDIF.
        <c>-qty = <c>-qty + <d>-menge.
        <c>-val = <c>-val + <d>-dmbtr.
      ENDIF.
    ENDLOOP.
    SELECT matnr, matkl FROM mara FOR ALL ENTRIES IN @lt_c WHERE matnr = @lt_c-idnrk INTO TABLE @DATA(lt_mk).
    SORT lt_mk BY matnr.

    " ---- per finished good: split into rate and usage, brand sums
    DATA: lv_rate  TYPE decfloat34, lv_use TYPE decfloat34, lv_split TYPE decfloat34,
          lv_bq    TYPE decfloat34, lv_br TYPE decfloat34,
          lv_cat   TYPE char1.
    LOOP AT lt_fg ASSIGNING <f>.
      DATA(lv_ix) = sy-tabix.
      READ TABLE lt_br ASSIGNING <br> WITH TABLE KEY zbrand = <f>-zbrand.
      IF sy-subrc <> 0. INSERT VALUE #( zbrand = <f>-zbrand ) INTO TABLE lt_br ASSIGNING <br>. ENDIF.
      <br>-fg = <br>-fg + 1.
      IF <f>-has = abap_false.
        <br>-nobud = <br>-nobud + 1.
        CONTINUE.                                                 " not part of the comparison
      ENDIF.
      <br>-actual = <br>-actual + <f>-a_mat + <f>-a_oh.
      <br>-budget = <br>-budget + <f>-b_tot.
      <br>-ovh    = <br>-ovh + <f>-a_oh - <f>-b_oh.
      DATA(lv_mvar) = <f>-a_mat - <f>-b_mat.
      READ TABLE lt_q ASSIGNING <q> WITH TABLE KEY idx = lv_ix.
      IF sy-subrc <> 0 OR <q>-v <= 0.
        <br>-nosplit = <br>-nosplit + lv_mvar.
        CONTINUE.
      ENDIF.
      " budget items of this finished good (level 1 and deeper as in the drill-down)
      SELECT idnrk, mtart, matkl, menge, cost_pc FROM zmm_fbudcost_det
        WHERE werks = @<f>-werks AND zskugrcodecrs = @<f>-crssku AND gjahr = @lv_gjahr AND zbusiness = @<f>-bus
          AND version = @<f>-ver AND zscheme = @<f>-scheme AND mtart_fg = @<f>-mtart
        INTO TABLE @DATA(lt_dt).
      <br>-done = <br>-done + 1.
      lv_split = 0.
      " components consumed
      LOOP AT lt_c ASSIGNING <c> WHERE idx = lv_ix.
        READ TABLE lt_mk INTO DATA(ls_k) WITH KEY matnr = <c>-idnrk BINARY SEARCH.
        lv_cat = category( iv_mtart = <c>-mtart iv_matkl = ls_k-matkl ).
        CHECK lv_cat = 'R' OR lv_cat = 'P' OR lv_cat = 'F'.
        lv_br = 0. lv_bq = 0.
        LOOP AT lt_dt ASSIGNING FIELD-SYMBOL(<dt>) WHERE idnrk = <c>-idnrk.
          lv_bq = lv_bq + <dt>-menge * <q>-v.
          IF <dt>-menge > 0. lv_br = <dt>-cost_pc / <dt>-menge. ENDIF.
        ENDLOOP.
        IF lv_bq > 0 AND lv_br > 0.
          lv_use  = ( <c>-qty - lv_bq ) * lv_br.
          lv_rate = <c>-val - <c>-qty * lv_br.
        ELSE.
          lv_use  = <c>-val.                                      " not in the budget: all of it is usage
          lv_rate = 0.
        ENDIF.
        lv_split = lv_split + lv_use + lv_rate.
        CASE lv_cat.
          WHEN 'R'. <br>-use_r = <br>-use_r + lv_use. <br>-rate_r = <br>-rate_r + lv_rate.
          WHEN 'P'. <br>-use_p = <br>-use_p + lv_use. <br>-rate_p = <br>-rate_p + lv_rate.
          WHEN 'F'. <br>-use_f = <br>-use_f + lv_use. <br>-rate_f = <br>-rate_f + lv_rate.
        ENDCASE.
      ENDLOOP.
      " budget items never consumed: negative usage
      LOOP AT lt_dt ASSIGNING <dt>.
        READ TABLE lt_c TRANSPORTING NO FIELDS WITH TABLE KEY idx = lv_ix idnrk = <dt>-idnrk.
        CHECK sy-subrc <> 0.
        lv_cat = category( iv_mtart = <dt>-mtart iv_matkl = <dt>-matkl ).
        CHECK lv_cat = 'R' OR lv_cat = 'P' OR lv_cat = 'F'.
        lv_use = - <dt>-cost_pc * <q>-v.
        lv_split = lv_split + lv_use.
        CASE lv_cat.
          WHEN 'R'. <br>-use_r = <br>-use_r + lv_use.
          WHEN 'P'. <br>-use_p = <br>-use_p + lv_use.
          WHEN 'F'. <br>-use_f = <br>-use_f + lv_use.
        ENDCASE.
      ENDLOOP.
      " what the split does not explain is the brand's Unexplained row (actual - budget - effects)
    ENDLOOP.

    " ---- the bridge rows per brand
    LOOP AT lt_br ASSIGNING <br>.
      DATA(lv_cmp) = <br>-actual.                                  " actual of the finished goods that have a budget
      DATA(lv_eff) = <br>-rate_r + <br>-use_r + <br>-rate_p + <br>-use_p + <br>-rate_f + <br>-use_f + <br>-nosplit + <br>-ovh.
      DATA(lv_unex) = lv_cmp - <br>-budget - lv_eff.
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'BUDGET'   iv_sort = 10  iv_value = <br>-budget
                         iv_msg = |{ <br>-fg - <br>-nobud } of { <br>-fg } finished goods have an approved budget (flexed to actual quantity); the others are left out| CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'RATE_R'   iv_sort = 20  iv_value = <br>-rate_r CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'USAGE_R'  iv_sort = 30  iv_value = <br>-use_r  CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'RATE_P'   iv_sort = 40  iv_value = <br>-rate_p CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'USAGE_P'  iv_sort = 50  iv_value = <br>-use_p  CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'RATE_F'   iv_sort = 60  iv_value = <br>-rate_f CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'USAGE_F'  iv_sort = 70  iv_value = <br>-use_f  CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'NOSPLIT'  iv_sort = 80  iv_value = <br>-nosplit
                         iv_msg = |Material variance of finished goods not analysed (the { lv_max } largest were split; { <br>-done } in this brand)| CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'OVERHEAD' iv_sort = 90  iv_value = <br>-ovh CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'MIX'      iv_sort = 100 iv_value = 0
                         iv_msg = 'Not available: no planned volume per finished good (ZSALES_BUD_TGT is empty); the budget is flexed to actual quantity' CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'CURRENCY' iv_sort = 110 iv_value = 0
                         iv_msg = 'Not available: the budget holds no exchange rate to compare with' CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'UNEXPL'   iv_sort = 120 iv_value = lv_unex
                         iv_msg = 'Actual minus budget minus the effects above (WIP components, rounding, items outside RM / PM / perfume)' CHANGING ct_rows = rt_rows ).
      add_row( EXPORTING iv_brand = <br>-zbrand iv_effect = 'ACTUAL'   iv_sort = 130 iv_value = lv_cmp CHANGING ct_rows = rt_rows ).
    ENDLOOP.
    SORT rt_rows BY zbrand sort_no.
  ENDMETHOD.

ENDCLASS.
