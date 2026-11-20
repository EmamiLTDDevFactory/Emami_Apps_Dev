CLASS zcl_mm_dash_sales DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_sales TYPE STANDARD TABLE OF zdash_s_sales WITH DEFAULT KEY.
    "Costing dashboard, Sales view: invoiced sales of finished goods (FERT), INR, by brand and by SKU x distribution channel.
    "  GSV        = condition ZSAL (gross sales price) of the billing item; an item without ZSAL counts its net value (no deduction)
    "  NSV        = VBRP-NETWR (net of discounts, before GST)
    "  Deductions = GSV - NSV
    "  Sold qty   = billed quantity in the base unit; invoice (M) and debit memo (P) +, cancellation (N), credit memo (O) -, cancellation of credit memo (S) +
    "  COGM       = SAP actual cost per piece of the same period (ZCL_MM_WAC_ACTUAL: RM + PM + perfume + conversion / produced qty, all selected plants) x SOLD qty
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par.
    METHODS run RETURNING VALUE(rt_sales) TYPE tt_sales.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_b,
             matnr TYPE matnr,
             vtweg TYPE vtweg,
             vbtyp TYPE vbtyp,
             umvkz TYPE umvkz,
             umvkn TYPE umvkn,
             qty   TYPE p LENGTH 15 DECIMALS 3,
             gsv   TYPE p LENGTH 15 DECIMALS 2,
             nsv   TYPE p LENGTH 15 DECIMALS 2,
           END OF ty_b,
           BEGIN OF ty_c,
             matnr TYPE matnr,
             qty   TYPE decfloat34,
             cost  TYPE decfloat34,
           END OF ty_c.
    DATA ms_par TYPE zif_mm_wac_types=>ty_par.
ENDCLASS.


CLASS zcl_mm_dash_sales IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
    IF ms_par-date_from IS INITIAL.
      ms_par-date_from = ms_par-date_to.
      ms_par-date_from+4(4) = '0401'.
      IF ms_par-date_to+4(2) < 4. ms_par-date_from(4) = ms_par-date_from(4) - 1. ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD run.
    DATA: lt_b    TYPE STANDARD TABLE OF ty_b,
          lt_c    TYPE HASHED TABLE OF ty_c WITH UNIQUE KEY matnr,
          ls_c    TYPE ty_c,
          lt_act  TYPE zif_mm_wac_types=>ty_t_act,
          lt_m    TYPE string_table,
          ls_row  TYPE zdash_s_sales,
          lv_sgn  TYPE i,
          lv_cpc  TYPE decfloat34,
          lv_has  TYPE abap_bool.
    FIELD-SYMBOLS: <b> TYPE ty_b, <r> TYPE zdash_s_sales.

    " ---- invoiced sales: one aggregated read, GSV from the ZSAL condition of the same item
    SELECT p~matnr AS matnr, h~vtweg AS vtweg, h~vbtyp AS vbtyp, p~umvkz AS umvkz, p~umvkn AS umvkn,
           SUM( p~fkimg )                    AS qty,
           SUM( CASE WHEN k~kschl IS NULL THEN p~netwr ELSE k~kwert END ) AS gsv,   "no ZSAL condition on the item: gross = net, no deduction
           SUM( p~netwr )                    AS nsv
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
        INNER JOIN mara AS m ON m~matnr = p~matnr
        LEFT OUTER JOIN konv AS k ON k~knumv = h~knumv AND k~kposn = p~posnr AND k~kschl = 'ZSAL' AND k~kinak = @space
      WHERE h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND p~umvkn > 0
        AND m~mtart = 'FERT'
      GROUP BY p~matnr, h~vtweg, h~vbtyp, p~umvkz, p~umvkn
      INTO TABLE @lt_b.
    IF lt_b IS INITIAL. RETURN. ENDIF.

    " ---- actual cost per piece of the period, per material (all selected plants)
    DATA(lo_util) = NEW zcl_mm_bom_cost_util( ).
    NEW zcl_mm_wac_actual( lo_util )->read( EXPORTING is_par = ms_par IMPORTING et_act = lt_act et_msg = lt_m ).
    LOOP AT lt_act ASSIGNING FIELD-SYMBOL(<a>) WHERE qty > 0.
      CLEAR ls_c.
      ls_c-matnr = <a>-matnr. ls_c-qty = <a>-qty. ls_c-cost = <a>-rm + <a>-pm + <a>-perf + <a>-conv.
      COLLECT ls_c INTO lt_c.
    ENDLOOP.

    " ---- descriptions / brand
    SELECT matnr, maktx FROM makt FOR ALL ENTRIES IN @lt_b WHERE matnr = @lt_b-matnr AND spras = @sy-langu INTO TABLE @DATA(lt_t).
    SELECT matnr, zbrand, matkl FROM mara FOR ALL ENTRIES IN @lt_b WHERE matnr = @lt_b-matnr INTO TABLE @DATA(lt_br).
    SELECT vtweg, vtext FROM tvtwt WHERE spras = @sy-langu INTO TABLE @DATA(lt_ch).
    SORT: lt_t BY matnr, lt_br BY matnr, lt_ch BY vtweg.

    " ---- SKU x channel rows
    DATA lt_s TYPE tt_sales.
    LOOP AT lt_b ASSIGNING <b>.
      lv_sgn = COND #( WHEN <b>-vbtyp = 'N' OR <b>-vbtyp = 'O' THEN -1 ELSE 1 ).
      READ TABLE lt_s ASSIGNING <r> WITH KEY matnr = <b>-matnr vtweg = <b>-vtweg.
      IF sy-subrc <> 0.
        CLEAR ls_row.
        ls_row-grain = 'S'. ls_row-matnr = <b>-matnr. ls_row-vtweg = <b>-vtweg.
        READ TABLE lt_t  INTO DATA(ls_t)  WITH KEY matnr = <b>-matnr BINARY SEARCH.
        IF sy-subrc = 0. ls_row-maktx = ls_t-maktx. ENDIF.
        READ TABLE lt_br INTO DATA(ls_br) WITH KEY matnr = <b>-matnr BINARY SEARCH.
        IF sy-subrc = 0. ls_row-zbrand = ls_br-zbrand. ls_row-matkl = ls_br-matkl. ENDIF.
        READ TABLE lt_ch INTO DATA(ls_ch) WITH KEY vtweg = <b>-vtweg BINARY SEARCH.
        IF sy-subrc = 0. ls_row-vtweg_txt = ls_ch-vtext. ENDIF.
        ls_row-date_from = ms_par-date_from. ls_row-date_to = ms_par-date_to.
        APPEND ls_row TO lt_s.
        READ TABLE lt_s ASSIGNING <r> WITH KEY matnr = <b>-matnr vtweg = <b>-vtweg.
      ENDIF.
      <r>-sold_qty = <r>-sold_qty + lv_sgn * <b>-qty * <b>-umvkz / <b>-umvkn.   "base unit
      <r>-gsv      = <r>-gsv      + lv_sgn * <b>-gsv.
      <r>-nsv      = <r>-nsv      + lv_sgn * <b>-nsv.
    ENDLOOP.
    LOOP AT lt_s ASSIGNING <r>.
      <r>-deductions = <r>-gsv - <r>-nsv.
      CLEAR lv_has.
      READ TABLE lt_c INTO ls_c WITH TABLE KEY matnr = <r>-matnr.
      IF sy-subrc = 0 AND ls_c-qty > 0.
        lv_cpc = ls_c-cost / ls_c-qty.
        <r>-cogm_pc  = lv_cpc.
        <r>-cogm_qty = <r>-sold_qty.
        <r>-nsv_cmp  = <r>-nsv.
        <r>-cogm     = lv_cpc * <r>-sold_qty.
      ELSE.
        <r>-sku_nocogm = 1.
      ENDIF.
      <r>-sku_cnt = 1.
      <r>-msg = COND #( WHEN <r>-sku_nocogm = 1 THEN 'No actual cost in the period: left out of the margin' ).
    ENDLOOP.
    rt_sales = lt_s.

    " ---- brand rows (sum of the SKU x channel rows)
    LOOP AT lt_s ASSIGNING <r>.
      READ TABLE rt_sales ASSIGNING FIELD-SYMBOL(<br>) WITH KEY grain = 'B' zbrand = <r>-zbrand.
      IF sy-subrc <> 0.
        CLEAR ls_row.
        ls_row-grain = 'B'. ls_row-zbrand = <r>-zbrand. ls_row-date_from = ms_par-date_from. ls_row-date_to = ms_par-date_to.
        APPEND ls_row TO rt_sales.
        READ TABLE rt_sales ASSIGNING <br> WITH KEY grain = 'B' zbrand = <r>-zbrand.
      ENDIF.
      <br>-sold_qty   = <br>-sold_qty   + <r>-sold_qty.
      <br>-gsv        = <br>-gsv        + <r>-gsv.
      <br>-deductions = <br>-deductions + <r>-deductions.
      <br>-nsv        = <br>-nsv        + <r>-nsv.
      <br>-cogm_qty   = <br>-cogm_qty   + <r>-cogm_qty.
      <br>-nsv_cmp    = <br>-nsv_cmp    + <r>-nsv_cmp.
      <br>-cogm       = <br>-cogm       + <r>-cogm.
      <br>-sku_cnt    = <br>-sku_cnt    + 1.
      <br>-sku_nocogm = <br>-sku_nocogm + <r>-sku_nocogm.
    ENDLOOP.
    LOOP AT rt_sales ASSIGNING <br> WHERE grain = 'B' AND sku_nocogm > 0.
      <br>-msg = |{ <br>-sku_nocogm } of { <br>-sku_cnt } SKU x channel lines have no actual cost in the period and are left out of the margin|.
    ENDLOOP.
    SORT rt_sales BY grain zbrand matnr vtweg.
  ENDMETHOD.

ENDCLASS.
