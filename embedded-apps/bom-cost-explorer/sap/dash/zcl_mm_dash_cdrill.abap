CLASS zcl_mm_dash_cdrill DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_cdrill TYPE STANDARD TABLE OF zdash_s_cdrill WITH DEFAULT KEY.
    TYPES: ty_r_vkorg TYPE RANGE OF vkorg,
           ty_r_vtweg TYPE RANGE OF vtweg,
           ty_r_vbeln TYPE RANGE OF vbeln_vf.
    "Costing dashboard, Margin report: item level breakup (components with quantity and value) of the FG batches that were sold.
    "  1. Sold batches of the material: invoice items (same selection as the Margin report), VBRP-CHARG, quantity in the base unit (cancellation / credit memo -)
    "  2. Process orders: ZMB31_POUTILITY (material + batch, POST_TYPE = '01' only; plant is not used)
    "  3. ZCL_AUFM_UTILITY3=>get_mat_consumption_details( FERT, orders, till date 31.12.9999, abnormal movements blank ) = rows per level
    "  4. Components: every consumption row below level 0 except WIP (cost of a WIP / parent material is ignored, its own components at deeper levels are kept)
    "  5. Per batch: component quantity and value / produced quantity of its orders (level 0 quantity); average over batches weighted by SOLD quantity
    "  Category: VERP / PKGN = PM (P), ROH with material group 106 = perfume (F), other ROH = RM (R), anything else = O.
    "  Rows: S = summary of the material (cost per piece by category), B = one per sold batch, C = one per component (average over the batches).
    "  A batch without a process order is flagged NBC (no budget / trading goods); at most mc_max_orders orders are costed, the rest is flagged PARTIAL.
    CONSTANTS mc_max_orders TYPE i VALUE 150.
    CONSTANTS mc_chunk      TYPE i VALUE 25.
    METHODS constructor IMPORTING is_par   TYPE zif_mm_wac_types=>ty_par
                                  iv_matnr TYPE matnr
                                  it_vkorg TYPE ty_r_vkorg OPTIONAL
                                  it_vtweg TYPE ty_r_vtweg OPTIONAL
                                  it_vbeln TYPE ty_r_vbeln OPTIONAL.
    METHODS run RETURNING VALUE(rt_rows) TYPE tt_cdrill.
  PRIVATE SECTION.
    METHODS run_actual RETURNING VALUE(rt_rows) TYPE tt_cdrill.
    "Budget side (grain T): for every valuation type (VBRP-BWTAR) of the sold items: ZMM_FBUDCOST_SUM with WERKS = valuation type, CRSSKU / business / scheme / MTART of MARA, GJAHR = financial year of the to date,
    "latest approved VERSION; then ZMM_FBUDCOST_DET of that key = item level budget (component, quantity, cost per piece). CHARG carries the valuation type, FLAG the budget version.
    METHODS budget_rows RETURNING VALUE(rt_rows) TYPE tt_cdrill.
    TYPES: BEGIN OF ty_q,
             charg TYPE charg_d,
             vbtyp TYPE vbtyp,
             umvkz TYPE umvkz,
             umvkn TYPE umvkn,
             qty   TYPE p LENGTH 15 DECIMALS 3,
           END OF ty_q,
           BEGIN OF ty_b,
             charg  TYPE charg_d,
             sold   TYPE decfloat34,
             prod   TYPE decfloat34,
             orders TYPE i,
             flag   TYPE c LENGTH 10,
           END OF ty_b,
           BEGIN OF ty_ord,
             charg TYPE charg_d,
             aufnr TYPE aufnr,
           END OF ty_ord,
           BEGIN OF ty_oq,
             aufnr TYPE aufnr,
             qty   TYPE decfloat34,
           END OF ty_oq,
           BEGIN OF ty_oc,
             aufnr TYPE aufnr,
             idnrk TYPE matnr,
             mtart TYPE mtart,
             meins TYPE meins,
             qty   TYPE decfloat34,
             val   TYPE decfloat34,
           END OF ty_oc,
           BEGIN OF ty_bc,
             charg TYPE charg_d,
             idnrk TYPE matnr,
             mtart TYPE mtart,
             meins TYPE meins,
             qty   TYPE decfloat34,
             val   TYPE decfloat34,
           END OF ty_bc,
           BEGIN OF ty_ac,
             idnrk TYPE matnr,
             mtart TYPE mtart,
             meins TYPE meins,
             qty   TYPE decfloat34,
             val   TYPE decfloat34,
           END OF ty_ac.
    DATA: ms_par   TYPE zif_mm_wac_types=>ty_par,
          mv_matnr TYPE matnr,
          mr_vkorg TYPE ty_r_vkorg,
          mr_vtweg TYPE ty_r_vtweg,
          mr_vbeln TYPE ty_r_vbeln.
    METHODS category IMPORTING iv_mtart TYPE mtart iv_matkl TYPE matkl RETURNING VALUE(rv_cat) TYPE char1.
ENDCLASS.


CLASS zcl_mm_dash_cdrill IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par. mv_matnr = iv_matnr.
    mr_vkorg = it_vkorg. mr_vtweg = it_vtweg. mr_vbeln = it_vbeln.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
    IF ms_par-date_from IS INITIAL.
      ms_par-date_from = ms_par-date_to.
      ms_par-date_from+4(4) = '0401'.
      IF ms_par-date_to+4(2) < 4. ms_par-date_from(4) = ms_par-date_from(4) - 1. ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD category.
    rv_cat = COND #( WHEN iv_mtart = 'VERP' OR iv_mtart = 'PKGN' THEN 'P'
                     WHEN iv_mtart = 'ROH' AND iv_matkl = '106'   THEN 'F'
                     WHEN iv_mtart = 'ROH'                        THEN 'R'
                     ELSE 'O' ).
  ENDMETHOD.

  METHOD run.
    rt_rows = run_actual( ).
    APPEND LINES OF budget_rows( ) TO rt_rows.
  ENDMETHOD.

  METHOD budget_rows.
    DATA: lv_yr TYPE gjahr, ls_r TYPE zdash_s_cdrill.
    SELECT SINGLE zskugrcodecrs, zbusiness, zscheme, mtart FROM mara WHERE matnr = @mv_matnr INTO @DATA(ls_m).
    IF sy-subrc <> 0. RETURN. ENDIF.
    SELECT DISTINCT p~bwtar AS bwtar
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
      WHERE p~matnr = @mv_matnr
        AND h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND h~vbeln IN @mr_vbeln
        AND h~vkorg IN @mr_vkorg
        AND h~vtweg IN @mr_vtweg
      INTO TABLE @DATA(lt_bw).
    lv_yr = ms_par-date_to(4).
    IF ms_par-date_to+4(2) < 4. lv_yr = lv_yr - 1. ENDIF.
    LOOP AT lt_bw ASSIGNING FIELD-SYMBOL(<w>).
      SELECT version FROM zmm_fbudcost_sum
        WHERE werks = @<w>-bwtar AND zskugrcodecrs = @ls_m-zskugrcodecrs AND gjahr = @lv_yr AND zbusiness = @ls_m-zbusiness
          AND zscheme = @ls_m-zscheme AND mtart = @ls_m-mtart AND status = 'A'
        ORDER BY version DESCENDING
        INTO @DATA(lv_ver) UP TO 1 ROWS.
      ENDSELECT.
      IF sy-subrc <> 0.
        CLEAR ls_r. ls_r-grain = 'T'. ls_r-matnr = mv_matnr. ls_r-charg = <w>-bwtar. ls_r-flag = 'NBC'.
        ls_r-msg = |No approved budget for valuation type '{ <w>-bwtar }', CRSSKU { ls_m-zskugrcodecrs }, scheme { ls_m-zscheme }, FY { lv_yr }|.
        ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
        APPEND ls_r TO rt_rows.
        CONTINUE.
      ENDIF.
      SELECT idnrk, item_desc, mtart, matkl, menge, meins, cost_pc, stufe
        FROM zmm_fbudcost_det
        WHERE werks = @<w>-bwtar AND zskugrcodecrs = @ls_m-zskugrcodecrs AND gjahr = @lv_yr AND zbusiness = @ls_m-zbusiness
          AND version = @lv_ver AND zscheme = @ls_m-zscheme AND mtart_fg = @ls_m-mtart
        INTO TABLE @DATA(lt_dt).
      LOOP AT lt_dt ASSIGNING FIELD-SYMBOL(<dt>).
        CLEAR ls_r.
        ls_r-grain = 'T'. ls_r-matnr = mv_matnr. ls_r-charg = <w>-bwtar. ls_r-idnrk = <dt>-idnrk. ls_r-maktx = <dt>-item_desc.
        ls_r-mtart = <dt>-mtart. ls_r-matkl = <dt>-matkl. ls_r-meins = <dt>-meins. ls_r-flag = lv_ver.
        ls_r-cat = category( iv_mtart = <dt>-mtart iv_matkl = <dt>-matkl ).
        ls_r-avg_qty_pc = <dt>-menge. ls_r-avg_cost_pc = <dt>-cost_pc. ls_r-orders = <dt>-stufe.
        ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
        APPEND ls_r TO rt_rows.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD run_actual.
    DATA: lt_q    TYPE STANDARD TABLE OF ty_q,
          lt_b    TYPE SORTED TABLE OF ty_b WITH UNIQUE KEY charg,
          lt_bs   TYPE STANDARD TABLE OF ty_b,
          lt_ord  TYPE SORTED TABLE OF ty_ord WITH UNIQUE KEY charg aufnr,
          lt_oq   TYPE HASHED TABLE OF ty_oq WITH UNIQUE KEY aufnr,
          lt_oc   TYPE SORTED TABLE OF ty_oc WITH UNIQUE KEY aufnr idnrk,
          lt_bc   TYPE SORTED TABLE OF ty_bc WITH UNIQUE KEY charg idnrk,
          lt_ac   TYPE SORTED TABLE OF ty_ac WITH UNIQUE KEY idnrk,
          lt_all  TYPE zcl_aufm_utility3=>ty_t_order_drill_dn,
          lt_run  TYPE zcl_aufm_utility3=>ty_t_orders,
          lt_os   TYPE zcl_aufm_utility3=>ty_t_orders,
          ls_b    TYPE ty_b,
          ls_oq   TYPE ty_oq,
          ls_oc   TYPE ty_oc,
          ls_bc   TYPE ty_bc,
          ls_ac   TYPE ty_ac,
          lv_sgn  TYPE i,
          lv_tot  TYPE i,
          lv_sold TYPE decfloat34,
          lv_pu   TYPE decfloat34,
          ls_r    TYPE zdash_s_cdrill.
    FIELD-SYMBOLS: <b> TYPE ty_b, <oq> TYPE ty_oq, <oc> TYPE ty_oc, <bc> TYPE ty_bc, <ac> TYPE ty_ac.

    " ---- 1. sold batches of the material (the selection of the Margin report)
    SELECT p~charg AS charg, h~vbtyp AS vbtyp, p~umvkz AS umvkz, p~umvkn AS umvkn, SUM( p~fkimg ) AS qty
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
      WHERE p~matnr = @mv_matnr
        AND h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND h~vbeln IN @mr_vbeln
        AND h~vkorg IN @mr_vkorg
        AND h~vtweg IN @mr_vtweg
        AND p~umvkn > 0
      GROUP BY p~charg, h~vbtyp, p~umvkz, p~umvkn
      INTO TABLE @lt_q.
    IF lt_q IS INITIAL. RETURN. ENDIF.
    LOOP AT lt_q ASSIGNING FIELD-SYMBOL(<q>).
      lv_sgn = COND #( WHEN <q>-vbtyp = 'N' OR <q>-vbtyp = 'O' THEN -1 ELSE 1 ).
      READ TABLE lt_b ASSIGNING <b> WITH TABLE KEY charg = <q>-charg.
      IF sy-subrc <> 0.
        CLEAR ls_b. ls_b-charg = <q>-charg.
        INSERT ls_b INTO TABLE lt_b ASSIGNING <b>.
      ENDIF.
      <b>-sold = <b>-sold + lv_sgn * <q>-qty * <q>-umvkz / <q>-umvkn.
    ENDLOOP.

    " ---- 2. process orders of the batches (POST_TYPE 01 only, no plant)
    DATA lt_ch TYPE RANGE OF charg_d.
    LOOP AT lt_b ASSIGNING <b> WHERE charg IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = <b>-charg ) TO lt_ch.
    ENDLOOP.
    IF lt_ch IS NOT INITIAL.
      SELECT DISTINCT charg, aufnr FROM zmb31_poutility
        WHERE matnr = @mv_matnr AND post_type = '01' AND charg IN @lt_ch
        INTO TABLE @DATA(lt_po).
      LOOP AT lt_po ASSIGNING FIELD-SYMBOL(<po>).
        INSERT VALUE #( charg = <po>-charg aufnr = <po>-aufnr ) INTO TABLE lt_ord.
      ENDLOOP.
    ENDIF.

    " ---- the batches with orders, largest sold quantity first, limited to mc_max_orders orders
    lt_bs = lt_b.
    SORT lt_bs BY sold DESCENDING.
    LOOP AT lt_bs INTO ls_b.
      READ TABLE lt_b ASSIGNING <b> WITH TABLE KEY charg = ls_b-charg.
      DATA(lv_n) = 0.
      LOOP AT lt_ord ASSIGNING FIELD-SYMBOL(<o>) WHERE charg = ls_b-charg.
        lv_n = lv_n + 1.
      ENDLOOP.
      IF lv_n = 0.
        <b>-flag = 'NBC'.
      ELSEIF lv_tot + lv_n > mc_max_orders.
        <b>-flag = 'PARTIAL'.
      ELSE.
        <b>-flag = 'OK'. <b>-orders = lv_n. lv_tot = lv_tot + lv_n.
        LOOP AT lt_ord ASSIGNING <o> WHERE charg = ls_b-charg.
          APPEND VALUE #( aufnr = <o>-aufnr ) TO lt_run.
        ENDLOOP.
      ENDIF.
    ENDLOOP.

    " ---- 3. the existing utility, in chunks
    DATA: lt_a TYPE zcl_aufm_utility3=>ty_t_aufm,
          lt_d TYPE zcl_aufm_utility3=>ty_t_order_drill_dn,
          lt_s TYPE zcl_aufm_utility3=>ty_t_order_sum.
    DATA(lv_i) = 0.
    LOOP AT lt_run INTO DATA(ls_run).
      lv_i = lv_i + 1.
      APPEND ls_run TO lt_os.
      IF lines( lt_os ) >= mc_chunk OR lv_i = lines( lt_run ).
        CLEAR: lt_a, lt_d, lt_s.
        zcl_aufm_utility3=>get_mat_consumption_details(
          EXPORTING iv_mtart = 'FERT' it_orders = lt_os iv_till_date = '99991231' iv_include_abnormal_mvt = ' '
          CHANGING ct_aufm = lt_a ct_ord_drill_dn = lt_d ct_ord_mtart_sum = lt_s ).
        APPEND LINES OF lt_d TO lt_all.
        CLEAR lt_os.
      ENDIF.
    ENDLOOP.

    " ---- 4. per order: produced quantity (level 0) and the components (not WIP, level 1 and deeper)
    LOOP AT lt_all ASSIGNING FIELD-SYMBOL(<d>).
      IF <d>-level = 0.
        READ TABLE lt_oq ASSIGNING <oq> WITH TABLE KEY aufnr = <d>-aufnr_main.
        IF sy-subrc <> 0.
          CLEAR ls_oq. ls_oq-aufnr = <d>-aufnr_main.
          INSERT ls_oq INTO TABLE lt_oq ASSIGNING <oq>.
        ENDIF.
        <oq>-qty = <oq>-qty + <d>-menge.
      ELSEIF <d>-mtart <> 'WIP' AND <d>-matnr IS NOT INITIAL.
        READ TABLE lt_oc ASSIGNING <oc> WITH TABLE KEY aufnr = <d>-aufnr_main idnrk = <d>-matnr.
        IF sy-subrc <> 0.
          CLEAR ls_oc. ls_oc-aufnr = <d>-aufnr_main. ls_oc-idnrk = <d>-matnr. ls_oc-mtart = <d>-mtart. ls_oc-meins = <d>-meins.
          INSERT ls_oc INTO TABLE lt_oc ASSIGNING <oc>.
        ENDIF.
        <oc>-qty = <oc>-qty + <d>-menge.
        <oc>-val = <oc>-val + <d>-dmbtr.
      ENDIF.
    ENDLOOP.

    " ---- 5. per batch: components over the produced quantity of its orders
    LOOP AT lt_ord ASSIGNING <o>.
      READ TABLE lt_b ASSIGNING <b> WITH TABLE KEY charg = <o>-charg.
      CHECK sy-subrc = 0 AND <b>-flag = 'OK'.
      READ TABLE lt_oq ASSIGNING <oq> WITH TABLE KEY aufnr = <o>-aufnr.
      IF sy-subrc = 0. <b>-prod = <b>-prod + <oq>-qty. ENDIF.
      LOOP AT lt_oc ASSIGNING <oc> WHERE aufnr = <o>-aufnr.
        READ TABLE lt_bc ASSIGNING <bc> WITH TABLE KEY charg = <o>-charg idnrk = <oc>-idnrk.
        IF sy-subrc <> 0.
          CLEAR ls_bc. ls_bc-charg = <o>-charg. ls_bc-idnrk = <oc>-idnrk. ls_bc-mtart = <oc>-mtart. ls_bc-meins = <oc>-meins.
          INSERT ls_bc INTO TABLE lt_bc ASSIGNING <bc>.
        ENDIF.
        <bc>-qty = <bc>-qty + <oc>-qty.
        <bc>-val = <bc>-val + <oc>-val.
      ENDLOOP.
    ENDLOOP.

    " ---- master data of the components
    SELECT matnr, matkl FROM mara FOR ALL ENTRIES IN @lt_bc WHERE matnr = @lt_bc-idnrk INTO TABLE @DATA(lt_mk).
    SELECT matnr, maktx FROM makt FOR ALL ENTRIES IN @lt_bc WHERE matnr = @lt_bc-idnrk AND spras = @sy-langu INTO TABLE @DATA(lt_tx).
    SORT: lt_mk BY matnr, lt_tx BY matnr.

    " ---- weights: average of the batches by sold quantity; batch rows
    DATA: lv_w_tot TYPE decfloat34, ls_s TYPE zdash_s_cdrill.
    LOOP AT lt_b ASSIGNING <b>.
      CLEAR ls_r.
      ls_r-grain = 'B'. ls_r-matnr = mv_matnr. ls_r-charg = <b>-charg. ls_r-flag = <b>-flag.
      ls_r-sold_qty = <b>-sold. ls_r-prod_qty = <b>-prod. ls_r-orders = <b>-orders.
      ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
      ls_r-msg = SWITCH #( <b>-flag WHEN 'NBC' THEN 'No process order (post type 01) for this batch: bought-in / trading goods or no batch'
                                    WHEN 'PARTIAL' THEN |More than { mc_max_orders } process orders: this batch was not costed, narrow the selection|
                                    ELSE '' ).
      IF <b>-flag = 'OK' AND <b>-prod > 0.
        LOOP AT lt_bc ASSIGNING <bc> WHERE charg = <b>-charg.
          READ TABLE lt_mk INTO DATA(ls_mk) WITH KEY matnr = <bc>-idnrk BINARY SEARCH.
          lv_pu = <bc>-val / <b>-prod.
          CASE category( iv_mtart = <bc>-mtart iv_matkl = ls_mk-matkl ).
            WHEN 'R'. ls_r-rm_pc  = ls_r-rm_pc  + lv_pu.
            WHEN 'P'. ls_r-pm_pc  = ls_r-pm_pc  + lv_pu.
            WHEN 'F'. ls_r-pf_pc  = ls_r-pf_pc  + lv_pu.
            WHEN OTHERS. ls_r-oth_pc = ls_r-oth_pc + lv_pu.
          ENDCASE.
        ENDLOOP.
        IF <b>-sold > 0. lv_w_tot = lv_w_tot + <b>-sold. ENDIF.
      ENDIF.
      APPEND ls_r TO rt_rows.
    ENDLOOP.

    " ---- component rows: average over the costed batches, weighted by the sold quantity
    LOOP AT lt_bc ASSIGNING <bc>.
      READ TABLE lt_b ASSIGNING <b> WITH TABLE KEY charg = <bc>-charg.
      CHECK sy-subrc = 0 AND <b>-prod > 0 AND <b>-sold > 0.
      READ TABLE lt_ac ASSIGNING <ac> WITH TABLE KEY idnrk = <bc>-idnrk.
      IF sy-subrc <> 0.
        CLEAR ls_ac. ls_ac-idnrk = <bc>-idnrk. ls_ac-mtart = <bc>-mtart. ls_ac-meins = <bc>-meins.
        INSERT ls_ac INTO TABLE lt_ac ASSIGNING <ac>.
      ENDIF.
      <ac>-qty = <ac>-qty + <b>-sold * <bc>-qty / <b>-prod.
      <ac>-val = <ac>-val + <b>-sold * <bc>-val / <b>-prod.
    ENDLOOP.
    CLEAR ls_s.
    ls_s-grain = 'S'. ls_s-matnr = mv_matnr. ls_s-date_from = ms_par-date_from. ls_s-date_to = ms_par-date_to.
    ls_s-flag = 'OK'.
    LOOP AT lt_ac ASSIGNING <ac>.
      CLEAR ls_r.
      ls_r-grain = 'C'. ls_r-matnr = mv_matnr. ls_r-idnrk = <ac>-idnrk. ls_r-mtart = <ac>-mtart. ls_r-meins = <ac>-meins.
      READ TABLE lt_mk INTO ls_mk WITH KEY matnr = <ac>-idnrk BINARY SEARCH.
      IF sy-subrc = 0. ls_r-matkl = ls_mk-matkl. ENDIF.
      READ TABLE lt_tx INTO DATA(ls_tx) WITH KEY matnr = <ac>-idnrk BINARY SEARCH.
      IF sy-subrc = 0. ls_r-maktx = ls_tx-maktx. ENDIF.
      ls_r-cat = category( iv_mtart = <ac>-mtart iv_matkl = ls_r-matkl ).
      ls_r-qty = <ac>-qty. ls_r-val = <ac>-val.
      ls_r-sold_qty = lv_w_tot.
      IF lv_w_tot > 0.
        ls_r-avg_qty_pc = <ac>-qty / lv_w_tot.
        ls_r-avg_cost_pc = <ac>-val / lv_w_tot.
      ENDIF.
      ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
      CASE ls_r-cat.
        WHEN 'R'. ls_s-rm_pc  = ls_s-rm_pc  + ls_r-avg_cost_pc.
        WHEN 'P'. ls_s-pm_pc  = ls_s-pm_pc  + ls_r-avg_cost_pc.
        WHEN 'F'. ls_s-pf_pc  = ls_s-pf_pc  + ls_r-avg_cost_pc.
        WHEN OTHERS. ls_s-oth_pc = ls_s-oth_pc + ls_r-avg_cost_pc.
      ENDCASE.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
    ls_s-sold_qty = lv_w_tot.
    LOOP AT lt_b ASSIGNING <b>.
      ls_s-orders = ls_s-orders + <b>-orders.
      ls_s-prod_qty = ls_s-prod_qty + <b>-prod.
    ENDLOOP.
    DATA(lv_nb) = lines( lt_b ).
    DATA(lv_ok) = 0.
    LOOP AT lt_b ASSIGNING <b> WHERE flag = 'OK'.
      lv_ok = lv_ok + 1.
    ENDLOOP.
    IF lv_ok = 0. ls_s-flag = 'NBC'. ENDIF.
    ls_s-msg = |{ lv_ok } of { lv_nb } sold batches costed from { ls_s-orders } process orders|.
    INSERT ls_s INTO rt_rows INDEX 1.
  ENDMETHOD.

ENDCLASS.
