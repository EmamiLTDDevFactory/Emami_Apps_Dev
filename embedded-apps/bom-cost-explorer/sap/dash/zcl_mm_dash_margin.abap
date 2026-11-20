CLASS zcl_mm_dash_margin DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_margin TYPE STANDARD TABLE OF zdash_s_margin WITH DEFAULT KEY.
    "Costing dashboard, Margin analysis: invoiced FERT sales in INR, conditions of the billing item grouped as the Gross Margin Analysis report needs them.
    "  MRP = ZMRP (ZNMR when there is none)      Selling price = ZP12      GST = JOIG + JOCG + JOSG       Gross sales = selling price + GST (computed by the app)
    "  Channel margin: retailer = ZREM + ZTDP, distributor = ZDIM + ZTDM, super stockist = ZSSM + ZTSM (tax on margin is added to its parent)
    "  Invoice cost: RM ZRMP, PM ZPMP, perfume ZPFP, overhead ZOHP; consumer scheme ZRSP/ZPSP/ZFCP/ZOSP; trade scheme ZRTS/ZPTP/ZFTS/ZOTP
    "  Sold qty in the base unit; invoice (M) and debit memo (P) +, cancellation (N), credit memo (O) -, cancellation of credit memo (S) +
    "  Budget cost per piece: ZMM_FBUDCOST_SUM, latest approved VERSION of the financial year (of the to date), key CRSSKU + business vertical + scheme (MARA), FERT; none = flag NBC
    "  Grain S = SKU, C = customer, B = brand.   "As per current COGM" is not read here: it comes from the data set the business supplies.
    TYPES: ty_r_vkorg  TYPE RANGE OF vkorg,
           ty_r_vtweg  TYPE RANGE OF vtweg,
           ty_r_crssku TYPE RANGE OF zskugrcodecrs,
           ty_r_vbeln  TYPE RANGE OF vbeln_vf.
    "Selection: plants (is_par-werks), sales organisation, distribution channel, CRSSKU and invoice number; an empty range means all. The date range always applies.
    METHODS constructor IMPORTING is_par TYPE zif_mm_wac_types=>ty_par
                                  it_vkorg  TYPE ty_r_vkorg  OPTIONAL
                                  it_vtweg  TYPE ty_r_vtweg  OPTIONAL
                                  it_crssku TYPE ty_r_crssku OPTIONAL
                                  it_vbeln  TYPE ty_r_vbeln  OPTIONAL.
    METHODS run RETURNING VALUE(rt_margin) TYPE tt_margin.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_k,
             matnr TYPE matnr,
             kunag TYPE kunag,
             vbtyp TYPE vbtyp,
             kschl TYPE kschl,
             kwert TYPE p LENGTH 15 DECIMALS 2,
           END OF ty_k,
           BEGIN OF ty_q,
             matnr TYPE matnr,
             kunag TYPE kunag,
             vbtyp TYPE vbtyp,
             umvkz TYPE umvkz,
             umvkn TYPE umvkn,
             qty   TYPE p LENGTH 15 DECIMALS 3,
           END OF ty_q,
           BEGIN OF ty_bud,
             crssku  TYPE zskugrcodecrs,
             bus     TYPE zbusiness,
             scheme  TYPE zscheme,
             version TYPE c LENGTH 2,
             n       TYPE i,
             rm      TYPE decfloat34,
             pm      TYPE decfloat34,
             pf      TYPE decfloat34,
             tot     TYPE decfloat34,   "overhead = MACHINE + LABOUR + POWER + STEAM + LABOUR3P
           END OF ty_bud.
    DATA ms_par TYPE zif_mm_wac_types=>ty_par.
    DATA: mr_vkorg  TYPE ty_r_vkorg,
          mr_vtweg  TYPE ty_r_vtweg,
          mr_crssku TYPE ty_r_crssku,
          mr_vbeln  TYPE ty_r_vbeln.
    METHODS add_cond IMPORTING iv_kschl TYPE kschl iv_val TYPE decfloat34 CHANGING cs TYPE zdash_s_margin.
    METHODS add_row  IMPORTING is_from TYPE zdash_s_margin CHANGING cs_to TYPE zdash_s_margin.
ENDCLASS.


CLASS zcl_mm_dash_margin IMPLEMENTATION.

  METHOD constructor.
    ms_par = is_par.
    mr_vbeln = it_vbeln.
    mr_vkorg = it_vkorg. mr_vtweg = it_vtweg. mr_crssku = it_crssku.
    IF ms_par-date_to IS INITIAL. ms_par-date_to = sy-datum. ENDIF.
    IF ms_par-date_from IS INITIAL.
      ms_par-date_from = ms_par-date_to.
      ms_par-date_from+4(4) = '0401'.
      IF ms_par-date_to+4(2) < 4. ms_par-date_from(4) = ms_par-date_from(4) - 1. ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD add_cond.
    CASE iv_kschl.
      WHEN 'ZP12'. cs-sp = cs-sp + iv_val.
      WHEN 'ZMRP'. cs-mrp = cs-mrp + iv_val.
      WHEN 'ZNMR'. cs-nmr = cs-nmr + iv_val.
      WHEN 'ZREM' OR 'ZTDP'. cs-ch_ret = cs-ch_ret + iv_val.
      WHEN 'ZDIM' OR 'ZTDM'. cs-ch_dis = cs-ch_dis + iv_val.
      WHEN 'ZSSM' OR 'ZTSM'. cs-ch_ss = cs-ch_ss + iv_val.
      WHEN 'JOIG' OR 'JOCG' OR 'JOSG'. cs-gst = cs-gst + iv_val.
      WHEN 'ZRMP'. cs-rm = cs-rm + iv_val.
      WHEN 'ZPMP'. cs-pm = cs-pm + iv_val.
      WHEN 'ZPFP'. cs-pf = cs-pf + iv_val.
      WHEN 'ZOHP'. cs-oh = cs-oh + iv_val.
      WHEN 'ZRSP'. cs-c_rm = cs-c_rm + iv_val.
      WHEN 'ZPSP'. cs-c_pm = cs-c_pm + iv_val.
      WHEN 'ZFCP'. cs-c_pf = cs-c_pf + iv_val.
      WHEN 'ZOSP'. cs-c_oh = cs-c_oh + iv_val.
      WHEN 'ZRTS'. cs-t_rm = cs-t_rm + iv_val.
      WHEN 'ZPTP'. cs-t_pm = cs-t_pm + iv_val.
      WHEN 'ZFTS'. cs-t_pf = cs-t_pf + iv_val.
      WHEN 'ZOTP'. cs-t_oh = cs-t_oh + iv_val.
    ENDCASE.
  ENDMETHOD.

  METHOD add_row.
    cs_to-qty = cs_to-qty + is_from-qty.
    cs_to-mrp = cs_to-mrp + is_from-mrp.
    cs_to-sp = cs_to-sp + is_from-sp.
    cs_to-ch_ret = cs_to-ch_ret + is_from-ch_ret.
    cs_to-ch_dis = cs_to-ch_dis + is_from-ch_dis.
    cs_to-ch_ss = cs_to-ch_ss + is_from-ch_ss.
    cs_to-gst = cs_to-gst + is_from-gst.
    cs_to-rm = cs_to-rm + is_from-rm.
    cs_to-pm = cs_to-pm + is_from-pm.
    cs_to-pf = cs_to-pf + is_from-pf.
    cs_to-oh = cs_to-oh + is_from-oh.
    cs_to-c_rm = cs_to-c_rm + is_from-c_rm.
    cs_to-c_pm = cs_to-c_pm + is_from-c_pm.
    cs_to-c_pf = cs_to-c_pf + is_from-c_pf.
    cs_to-c_oh = cs_to-c_oh + is_from-c_oh.
    cs_to-t_rm = cs_to-t_rm + is_from-t_rm.
    cs_to-t_pm = cs_to-t_pm + is_from-t_pm.
    cs_to-t_pf = cs_to-t_pf + is_from-t_pf.
    cs_to-t_oh = cs_to-t_oh + is_from-t_oh.
  ENDMETHOD.

  METHOD run.
    DATA: lt_k   TYPE STANDARD TABLE OF ty_k,
          lt_q   TYPE STANDARD TABLE OF ty_q,
          lt_d   TYPE SORTED TABLE OF zdash_s_margin WITH UNIQUE KEY matnr kunag,
          ls_d   TYPE zdash_s_margin,
          lt_bud TYPE HASHED TABLE OF ty_bud WITH UNIQUE KEY crssku bus scheme,
          ls_bud TYPE ty_bud,
          lv_sgn TYPE i,
          lv_v   TYPE decfloat34,
          lv_yr  TYPE gjahr.
    FIELD-SYMBOLS <d> TYPE zdash_s_margin.

    " ---- quantities (one aggregated read)
    SELECT p~matnr AS matnr, h~kunag AS kunag, h~vbtyp AS vbtyp, p~umvkz AS umvkz, p~umvkn AS umvkn, SUM( p~fkimg ) AS qty
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
        INNER JOIN mara AS m ON m~matnr = p~matnr
      WHERE h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND h~vbeln IN @mr_vbeln
        AND h~vkorg IN @mr_vkorg
        AND h~vtweg IN @mr_vtweg
        AND m~zskugrcodecrs IN @mr_crssku
        AND p~umvkn > 0
        AND m~mtart = 'FERT'
      GROUP BY p~matnr, h~kunag, h~vbtyp, p~umvkz, p~umvkn
      INTO TABLE @lt_q.
    IF lt_q IS INITIAL. RETURN. ENDIF.

    " ---- conditions of the same items, one row per condition type (the inactive flag is ignored on purpose: the cost conditions carry it)
    " ---- price conditions, signed as stored (the inactive flag is ignored on purpose: the cost conditions carry it)
    SELECT p~matnr AS matnr, h~kunag AS kunag, h~vbtyp AS vbtyp, k~kschl AS kschl, SUM( k~kwert ) AS kwert
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
        INNER JOIN mara AS m ON m~matnr = p~matnr
        INNER JOIN konv AS k ON k~knumv = h~knumv AND k~kposn = p~posnr
      WHERE h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND h~vbeln IN @mr_vbeln
        AND h~vkorg IN @mr_vkorg
        AND h~vtweg IN @mr_vtweg
        AND m~zskugrcodecrs IN @mr_crssku
        AND m~mtart = 'FERT'
        AND k~kschl IN ( 'ZP12', 'ZMRP', 'ZNMR', 'ZREM', 'ZTDP', 'ZDIM', 'ZTDM', 'ZSSM', 'ZTSM', 'JOIG', 'JOCG', 'JOSG' )
      GROUP BY p~matnr, h~kunag, h~vbtyp, k~kschl
      INTO TABLE @lt_k.
    " ---- cost conditions: always a POSITIVE amount per item (ABS), signed only by the billing category below; so COGS never turns negative on a sale
    SELECT p~matnr AS matnr, h~kunag AS kunag, h~vbtyp AS vbtyp, k~kschl AS kschl, SUM( ABS( k~kwert ) ) AS kwert
      FROM vbrk AS h
        INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
        INNER JOIN mara AS m ON m~matnr = p~matnr
        INNER JOIN konv AS k ON k~knumv = h~knumv AND k~kposn = p~posnr
      WHERE h~fkdat BETWEEN @ms_par-date_from AND @ms_par-date_to
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' )
        AND h~waerk = 'INR'
        AND p~werks IN @ms_par-werks
        AND h~vbeln IN @mr_vbeln
        AND h~vkorg IN @mr_vkorg
        AND h~vtweg IN @mr_vtweg
        AND m~zskugrcodecrs IN @mr_crssku
        AND m~mtart = 'FERT'
        AND k~kschl IN ( 'ZRMP', 'ZPMP', 'ZPFP', 'ZOHP', 'ZRSP', 'ZPSP', 'ZFCP', 'ZOSP', 'ZRTS', 'ZPTP', 'ZFTS', 'ZOTP' )
      GROUP BY p~matnr, h~kunag, h~vbtyp, k~kschl
      APPENDING TABLE @lt_k.

    " ---- SKU x customer detail
    LOOP AT lt_q ASSIGNING FIELD-SYMBOL(<q>).
      lv_sgn = COND #( WHEN <q>-vbtyp = 'N' OR <q>-vbtyp = 'O' THEN -1 ELSE 1 ).
      READ TABLE lt_d ASSIGNING <d> WITH TABLE KEY matnr = <q>-matnr kunag = <q>-kunag.
      IF sy-subrc <> 0.
        CLEAR ls_d. ls_d-grain = 'D'. ls_d-matnr = <q>-matnr. ls_d-kunag = <q>-kunag.
        INSERT ls_d INTO TABLE lt_d ASSIGNING <d>.
      ENDIF.
      <d>-qty = <d>-qty + lv_sgn * <q>-qty * <q>-umvkz / <q>-umvkn.
    ENDLOOP.
    LOOP AT lt_k ASSIGNING FIELD-SYMBOL(<k>).
      lv_sgn = COND #( WHEN <k>-vbtyp = 'N' OR <k>-vbtyp = 'O' THEN -1 ELSE 1 ).
      READ TABLE lt_d INTO ls_d WITH TABLE KEY matnr = <k>-matnr kunag = <k>-kunag.
      IF sy-subrc = 0.
        lv_v = lv_sgn * <k>-kwert.
        add_cond( EXPORTING iv_kschl = <k>-kschl iv_val = lv_v CHANGING cs = ls_d ).   "a sorted-table row is write-protected as a whole: work on a copy
        MODIFY TABLE lt_d FROM ls_d.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_d ASSIGNING <d>.
      IF <d>-mrp = 0. <d>-mrp = <d>-nmr. ENDIF.
    ENDLOOP.

    " ---- master data
    SELECT matnr, maktx FROM makt FOR ALL ENTRIES IN @lt_q WHERE matnr = @lt_q-matnr AND spras = @sy-langu INTO TABLE @DATA(lt_t).
    SELECT matnr, zbrand, matkl, zscheme, zskugrcodecrs, zbusiness FROM mara FOR ALL ENTRIES IN @lt_q WHERE matnr = @lt_q-matnr INTO TABLE @DATA(lt_m).
    SELECT kunnr, name1 FROM kna1 FOR ALL ENTRIES IN @lt_q WHERE kunnr = @lt_q-kunag INTO TABLE @DATA(lt_c).
    SORT: lt_t BY matnr, lt_m BY matnr, lt_c BY kunnr.

    " ---- approved budget cost per piece: latest approved version of the financial year of the to date, averaged over the rows of that version
    lv_yr = ms_par-date_to(4).
    IF ms_par-date_to+4(2) < 4. lv_yr = lv_yr - 1. ENDIF.
    SELECT zskugrcodecrs, zbusiness, zscheme, version, rm_cost, pm_cost, perfume_cost, machine, labour, power, steam, labour3p
      FROM zmm_fbudcost_sum
      WHERE gjahr = @lv_yr AND status = 'A' AND mtart = 'FERT'
      INTO TABLE @DATA(lt_bs).
    SORT lt_bs BY zskugrcodecrs zbusiness zscheme version DESCENDING.
    LOOP AT lt_bs ASSIGNING FIELD-SYMBOL(<bs>).
      READ TABLE lt_bud ASSIGNING FIELD-SYMBOL(<b>) WITH TABLE KEY crssku = <bs>-zskugrcodecrs bus = <bs>-zbusiness scheme = <bs>-zscheme.
      IF sy-subrc <> 0.
        CLEAR ls_bud.
        ls_bud-crssku = <bs>-zskugrcodecrs. ls_bud-bus = <bs>-zbusiness. ls_bud-scheme = <bs>-zscheme. ls_bud-version = <bs>-version.
        INSERT ls_bud INTO TABLE lt_bud ASSIGNING <b>.
      ENDIF.
      IF <b>-version = <bs>-version.   "the first (highest) version only
        <b>-n = <b>-n + 1.
        <b>-rm = <b>-rm + <bs>-rm_cost. <b>-pm = <b>-pm + <bs>-pm_cost. <b>-pf = <b>-pf + <bs>-perfume_cost.
        <b>-tot = <b>-tot + <bs>-machine + <bs>-labour + <bs>-power + <bs>-steam + <bs>-labour3p.   "overhead: fixed columns"
      ENDIF.
    ENDLOOP.

    " ---- SKU rows (all customers), customer rows (all SKUs), brand rows
    DATA: lt_s TYPE tt_margin, ls_r TYPE zdash_s_margin.
    LOOP AT lt_d ASSIGNING <d>.
      " SKU
      READ TABLE lt_s ASSIGNING FIELD-SYMBOL(<s>) WITH KEY grain = 'S' matnr = <d>-matnr.
      IF sy-subrc <> 0.
        CLEAR ls_r. ls_r-grain = 'S'. ls_r-matnr = <d>-matnr.
        READ TABLE lt_t INTO DATA(ls_t) WITH KEY matnr = <d>-matnr BINARY SEARCH.
        IF sy-subrc = 0. ls_r-maktx = ls_t-maktx. ENDIF.
        READ TABLE lt_m INTO DATA(ls_m) WITH KEY matnr = <d>-matnr BINARY SEARCH.
        IF sy-subrc = 0.
          ls_r-zbrand = ls_m-zbrand. ls_r-matkl = ls_m-matkl. ls_r-zscheme = ls_m-zscheme. ls_r-crssku = ls_m-zskugrcodecrs. ls_r-zbusiness = ls_m-zbusiness.
        ENDIF.
        ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
        READ TABLE lt_bud INTO ls_bud WITH TABLE KEY crssku = ls_r-crssku bus = ls_r-zbusiness scheme = ls_r-zscheme.
        IF sy-subrc = 0 AND ls_bud-n > 0.
          ls_r-bud_ver = ls_bud-version.
          ls_r-bud_rm = ls_bud-rm / ls_bud-n. ls_r-bud_pm = ls_bud-pm / ls_bud-n. ls_r-bud_pf = ls_bud-pf / ls_bud-n.
          ls_r-bud_oh = ls_bud-tot / ls_bud-n.
          ls_r-bud_flag = 'OK'.
        ELSE.
          ls_r-bud_flag = 'NBC'.
          ls_r-msg = 'No Budgeted Cost (NBC): no approved budget for this CRSSKU, business vertical and scheme'.
        ENDIF.
        APPEND ls_r TO lt_s.
        READ TABLE lt_s ASSIGNING <s> WITH KEY grain = 'S' matnr = <d>-matnr.
      ENDIF.
      add_row( EXPORTING is_from = <d> CHANGING cs_to = <s> ).
      " customer
      READ TABLE lt_s ASSIGNING FIELD-SYMBOL(<c>) WITH KEY grain = 'C' kunag = <d>-kunag.
      IF sy-subrc <> 0.
        CLEAR ls_r. ls_r-grain = 'C'. ls_r-kunag = <d>-kunag.
        READ TABLE lt_c INTO DATA(ls_c) WITH KEY kunnr = <d>-kunag BINARY SEARCH.
        IF sy-subrc = 0. ls_r-kunag_txt = ls_c-name1. ENDIF.
        ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
        APPEND ls_r TO lt_s.
        READ TABLE lt_s ASSIGNING <c> WITH KEY grain = 'C' kunag = <d>-kunag.
      ENDIF.
      add_row( EXPORTING is_from = <d> CHANGING cs_to = <c> ).
    ENDLOOP.
    LOOP AT lt_s ASSIGNING <s> WHERE grain = 'S'.
      READ TABLE lt_s ASSIGNING FIELD-SYMBOL(<br>) WITH KEY grain = 'B' zbrand = <s>-zbrand.
      IF sy-subrc <> 0.
        CLEAR ls_r. ls_r-grain = 'B'. ls_r-zbrand = <s>-zbrand. ls_r-date_from = ms_par-date_from. ls_r-date_to = ms_par-date_to.
        APPEND ls_r TO lt_s.
        READ TABLE lt_s ASSIGNING <br> WITH KEY grain = 'B' zbrand = <s>-zbrand.
      ENDIF.
      add_row( EXPORTING is_from = <s> CHANGING cs_to = <br> ).
    ENDLOOP.
    rt_margin = lt_s.
    SORT rt_margin BY grain zbrand matnr kunag.
  ENDMETHOD.

ENDCLASS.
