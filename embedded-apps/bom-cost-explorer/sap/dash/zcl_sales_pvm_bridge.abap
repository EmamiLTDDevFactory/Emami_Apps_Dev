CLASS zcl_sales_pvm_bridge DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "Costing dashboard, Sales view: budget gross margin to actual gross margin in four effects (+ an 'Unexplained' check row).
    "Budget  = ZSALES_BUD_TGT (latest approved version of the financial year): budget qty, net realisation per pc, COGM per pc, per SKU x channel.
    "Actual  = ZCL_MM_DASH_SALES (billed sales; COGM = actual cost per piece of the period). Only SKU x channel lines that have a budget and an actual cost (or no sales) are bridged.
    "   Price  = SUM( (Pa - Pb) x Qa )
    "   Cost   = SUM( (COGMb - COGMa) x Qa )
    "   Volume = ( Qa_total - Qb_total ) x average budget margin per unit
    "   Mix    = SUM( ( Qa - Qb x Qa_total / Qb_total ) x Mb )            Mb = Pb - COGMb
    "   Volume + Mix = SUM( ( Qa - Qb ) x Mb ), so the four effects add up exactly to the change in gross margin.
    TYPES: BEGIN OF ty_in,
             matnr TYPE matnr,
             vtweg TYPE vtweg,
             qa    TYPE decfloat34,    "actual qty
             nsv   TYPE decfloat34,    "actual net sales value
             ca    TYPE decfloat34,    "actual COGM per piece
             qb    TYPE decfloat34,    "budget qty
             pb    TYPE decfloat34,    "budget net realisation per piece
             cb    TYPE decfloat34,    "budget COGM per piece
           END OF ty_in,
           tt_in  TYPE STANDARD TABLE OF ty_in WITH DEFAULT KEY,
           tt_pvm TYPE STANDARD TABLE OF zdash_s_pvm WITH DEFAULT KEY.
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par.
    METHODS run RETURNING VALUE(rt_pvm) TYPE tt_pvm.
    CLASS-METHODS calc IMPORTING it_in TYPE tt_in RETURNING VALUE(rt_pvm) TYPE tt_pvm.
  PRIVATE SECTION.
    DATA ms_par TYPE zif_mm_wac_types=>ty_par.
ENDCLASS.


CLASS zcl_sales_pvm_bridge IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
  ENDMETHOD.

  METHOD calc.
    DATA: lv_gmb TYPE decfloat34, lv_gma TYPE decfloat34, lv_price TYPE decfloat34, lv_cost TYPE decfloat34,
          lv_vol TYPE decfloat34, lv_mix TYPE decfloat34, lv_qta TYPE decfloat34, lv_qtb TYPE decfloat34,
          lv_mb TYPE decfloat34, lv_pa TYPE decfloat34, lv_ca TYPE decfloat34, lv_unx TYPE decfloat34.
    LOOP AT it_in ASSIGNING FIELD-SYMBOL(<i>).
      lv_qta = lv_qta + <i>-qa.
      lv_qtb = lv_qtb + <i>-qb.
    ENDLOOP.
    LOOP AT it_in ASSIGNING <i>.
      lv_mb = <i>-pb - <i>-cb.
      lv_gmb = lv_gmb + <i>-qb * lv_mb.
      IF <i>-qa > 0.
        lv_pa = <i>-nsv / <i>-qa.
        lv_ca = <i>-ca.
        lv_gma   = lv_gma + <i>-nsv - <i>-qa * lv_ca.
        lv_price = lv_price + ( lv_pa - <i>-pb ) * <i>-qa.
        lv_cost  = lv_cost  + ( <i>-cb - lv_ca ) * <i>-qa.
      ENDIF.
      IF lv_qtb > 0 AND lv_qta > 0.
        lv_mix = lv_mix + ( <i>-qa - <i>-qb * lv_qta / lv_qtb ) * lv_mb.
      ELSE.
        lv_vol = lv_vol + ( <i>-qa - <i>-qb ) * lv_mb.      "no basis for a mix split: all of it is volume
      ENDIF.
    ENDLOOP.
    IF lv_qtb > 0 AND lv_qta > 0.
      lv_vol = ( lv_qta - lv_qtb ) * lv_gmb / lv_qtb.
    ENDIF.
    lv_unx = lv_gma - lv_gmb - ( lv_price + lv_vol + lv_mix + lv_cost ).
    rt_pvm = VALUE #(
      ( sort_no = 1 effect = 'Budget gross margin' value = lv_gmb )
      ( sort_no = 2 effect = 'Price'               value = lv_price )
      ( sort_no = 3 effect = 'Volume'              value = lv_vol )
      ( sort_no = 4 effect = 'Mix'                 value = lv_mix )
      ( sort_no = 5 effect = 'Cost'                value = lv_cost )
      ( sort_no = 6 effect = 'Actual gross margin' value = lv_gma ) ).
    IF abs( lv_unx ) > '0.01'.
      APPEND VALUE #( sort_no = 7 effect = 'Unexplained' value = lv_unx ) TO rt_pvm.
    ENDIF.
  ENDMETHOD.

  METHOD run.
    TYPES: BEGIN OF ty_bud, matnr TYPE matnr, vtweg TYPE vtweg, version TYPE zcostversion, bud_qty TYPE zsales_bud_tgt-bud_qty,
                           bud_nsv_pc TYPE zsales_bud_tgt-bud_nsv_pc, bud_cogm_pc TYPE zsales_bud_tgt-bud_cogm_pc, END OF ty_bud.
    DATA: lt_bud TYPE STANDARD TABLE OF ty_bud, lt_in TYPE tt_in, ls_in TYPE ty_in,
          lv_periv TYPE t001-periv, lv_gjahr TYPE gjahr, lv_nobud TYPE i, lv_nocost TYPE i, lv_ver TYPE zcostversion.
    DATA(lt_sales) = NEW zcl_mm_dash_sales( ms_par )->run( ).
    DELETE lt_sales WHERE grain <> 'S'.
    SELECT SINGLE t~periv INTO lv_periv
      FROM t001w AS w INNER JOIN t001k AS k ON k~bwkey = w~bwkey
                      INNER JOIN t001  AS t ON t~bukrs = k~bukrs
      WHERE w~werks = 'HO00'.
    CALL FUNCTION 'DATE_TO_PERIOD_CONVERT'
      EXPORTING i_date = ms_par-date_to i_periv = lv_periv
      IMPORTING e_gjahr = lv_gjahr
      EXCEPTIONS OTHERS = 1.
    SELECT matnr, vtweg, version, bud_qty, bud_nsv_pc, bud_cogm_pc FROM zsales_bud_tgt
      WHERE gjahr = @lv_gjahr AND status = 'A'
      INTO CORRESPONDING FIELDS OF TABLE @lt_bud.
    SORT lt_bud BY matnr vtweg version DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt_bud COMPARING matnr vtweg.
    LOOP AT lt_bud ASSIGNING FIELD-SYMBOL(<b>).
      CLEAR ls_in.
      ls_in-matnr = <b>-matnr. ls_in-vtweg = <b>-vtweg.
      ls_in-qb = <b>-bud_qty. ls_in-pb = <b>-bud_nsv_pc. ls_in-cb = <b>-bud_cogm_pc.
      IF <b>-version > lv_ver. lv_ver = <b>-version. ENDIF.
      READ TABLE lt_sales ASSIGNING FIELD-SYMBOL(<s>) WITH KEY matnr = <b>-matnr vtweg = <b>-vtweg.
      IF sy-subrc = 0 AND <s>-sold_qty > 0.
        IF <s>-cogm_pc <= 0. lv_nocost = lv_nocost + 1. CONTINUE. ENDIF.      "sold but no actual cost: cannot be bridged
        ls_in-qa = <s>-sold_qty. ls_in-nsv = <s>-nsv. ls_in-ca = <s>-cogm_pc.
      ENDIF.
      APPEND ls_in TO lt_in.
    ENDLOOP.
    " sold lines without a budget are not part of the bridge
    LOOP AT lt_sales ASSIGNING <s> WHERE sold_qty > 0.
      READ TABLE lt_bud TRANSPORTING NO FIELDS WITH KEY matnr = <s>-matnr vtweg = <s>-vtweg.
      IF sy-subrc <> 0. lv_nobud = lv_nobud + 1. ENDIF.
    ENDLOOP.
    IF lt_bud IS INITIAL.
      rt_pvm = VALUE #( ( sort_no = 0 effect = 'No budget' msg = |No approved sales budget for financial year { lv_gjahr } in ZSALES_BUD_TGT| ) ).
      RETURN.
    ENDIF.
    rt_pvm = calc( lt_in ).
    READ TABLE rt_pvm ASSIGNING FIELD-SYMBOL(<r>) INDEX 1.
    IF sy-subrc = 0.
      <r>-msg = |FY { lv_gjahr } budget version { lv_ver }: { lines( lt_in ) } SKU x channel lines bridged, { lv_nobud } sold lines without a budget and { lv_nocost } without an actual cost left out|.
    ENDIF.
    LOOP AT rt_pvm ASSIGNING <r>.
      <r>-werks = ''. <r>-date_from = ms_par-date_from. <r>-date_to = ms_par-date_to.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
