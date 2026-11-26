CLASS zcl_mm_cogm_soprice DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: ty_r_vkorg TYPE RANGE OF vkorg,
           ty_r_vtweg TYPE RANGE OF vtweg,
           ty_r_auart TYPE RANGE OF auart,
           ty_r_pstyv TYPE RANGE OF pstyv,
           ty_r_kdgrp TYPE RANGE OF kdgrp,
           ty_r_kunnr TYPE RANGE OF kunnr,
           ty_r_seg   TYPE RANGE OF char10.
    TYPES: BEGIN OF ty_in,
             matnr    TYPE zif_mm_cogm_types=>ty_r_matnr,
             werks    TYPE zif_mm_cogm_types=>ty_r_werks,
             vkorg    TYPE ty_r_vkorg,
             vtweg    TYPE ty_r_vtweg,
             segment  TYPE ty_r_seg,
             auart    TYPE ty_r_auart,          " include (I) and exclude (E) entries in one range
             pstyv    TYPE ty_r_pstyv,
             kdgrp    TYPE ty_r_kdgrp,
             kunnr    TYPE ty_r_kunnr,
             days     TYPE i,
             date_to  TYPE d,
             kind     TYPE c LENGTH 6,
             kalsm    TYPE c LENGTH 6,
             only_ord TYPE c LENGTH 1,
           END OF ty_in.

    METHODS constructor IMPORTING io_util TYPE REF TO zcl_mm_bom_cost_util.
    METHODS read
      IMPORTING is_in    TYPE ty_in
      EXPORTING et_price TYPE zmm_cogm_tt_soprice
                et_cond  TYPE zmm_cogm_tt_soprc
                et_msg   TYPE string_table.
    METHODS areas     IMPORTING is_in TYPE ty_in RETURNING VALUE(rt_area) TYPE zmm_cogm_tt_soarea.
    METHODS values    IMPORTING is_in TYPE ty_in RETURNING VALUE(rt_val)  TYPE zmm_cogm_tt_sofvh.
    METHODS rules     RETURNING VALUE(rt_rule) TYPE zmm_cogm_tt_socond.
    METHODS procedure IMPORTING iv_kalsm TYPE csequence RETURNING VALUE(rt_proc) TYPE zmm_cogm_tt_soproc.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_cond,
             knumv TYPE knumv, kposn TYPE kposn, kschl TYPE kschl,
             stunr TYPE n LENGTH 3, zaehk TYPE n LENGTH 2,
             kbetr TYPE p LENGTH 11 DECIMALS 2, kpein TYPE p LENGTH 5 DECIMALS 0, kmein TYPE meins,
             kwert TYPE p LENGTH 13 DECIMALS 2, waers TYPE waers,
             kstat TYPE c LENGTH 1, kinak TYPE c LENGTH 1,
           END OF ty_cond,
           BEGIN OF ty_cand,                                " an order item that may give the price
             matnr    TYPE matnr, vkorg TYPE vkorg, vtweg TYPE vtweg, auart TYPE auart,
             vbeln    TYPE vbeln_va, posnr TYPE posnr_va, werks TYPE werks_d, pstyv TYPE pstyv, kunnr TYPE kunnr,
             audat    TYPE d, waerk TYPE waerk, knumv TYPE knumv, kwmeng TYPE kwmeng, vrkme TYPE vrkme,
             netwr    TYPE netwr_ap, kalsm TYPE c LENGTH 6, n_orders TYPE i,
           END OF ty_cand,
           BEGIN OF ty_v, kind TYPE c LENGTH 6, code TYPE c LENGTH 10, n_lines TYPE i, n_orders TYPE i, last_date TYPE d, END OF ty_v.
    DATA: mo_util TYPE REF TO zcl_mm_bom_cost_util,
          mt_sc   TYPE HASHED TABLE OF zmm_cogm_spcond WITH UNIQUE KEY vkorg vtweg auart kalsm.

    METHODS authorised
      IMPORTING iv_vkorg TYPE vkorg iv_vtweg TYPE vtweg
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    "! the rule of a sales org, channel, document type and pricing procedure: the most exact row, then the configuration keys
    METHODS rule_for
      IMPORTING iv_vkorg TYPE vkorg iv_vtweg TYPE vtweg iv_auart TYPE auart iv_kalsm TYPE csequence
      RETURNING VALUE(rs_rule) TYPE zmm_cogm_spcond.
    METHODS cond_value
      IMPORTING is_cond TYPE ty_cond iv_matnr TYPE matnr iv_meins TYPE meins iv_qb TYPE decfloat34
                iv_doc_cur TYPE waers iv_to_cur TYPE waers iv_werks TYPE werks_d iv_rate TYPE abap_bool
      RETURNING VALUE(rv) TYPE decfloat34.
ENDCLASS.



CLASS ZCL_MM_COGM_SOPRICE IMPLEMENTATION.


  METHOD areas.
    TYPES: BEGIN OF ty_n, vkorg TYPE vkorg, vtweg TYPE vtweg, n TYPE i, last_date TYPE d, END OF ty_n.
    DATA lt_n TYPE STANDARD TABLE OF ty_n WITH DEFAULT KEY.

    SELECT v~vkorg, v~vtweg, o~vtext AS org_txt, c~vtext AS chn_txt, k~waers AS curr
      FROM tvkov AS v
      INNER JOIN tvko AS k ON k~vkorg = v~vkorg
      LEFT OUTER JOIN tvkot AS o ON o~vkorg = v~vkorg AND o~spras = @sy-langu
      LEFT OUTER JOIN tvtwt AS c ON c~vtweg = v~vtweg AND c~spras = @sy-langu
      WHERE v~vkorg IN @is_in-vkorg AND v~vtweg IN @is_in-vtweg
      ORDER BY v~vkorg, v~vtweg
      INTO CORRESPONDING FIELDS OF TABLE @rt_area.
    DATA(lv_i) = lines( rt_area ).
    WHILE lv_i > 0.
      IF authorised( iv_vkorg = rt_area[ lv_i ]-vkorg iv_vtweg = rt_area[ lv_i ]-vtweg ) = abap_false.
        DELETE rt_area INDEX lv_i.
      ENDIF.
      lv_i = lv_i - 1.
    ENDWHILE.

    " number of orders and last order date per sales area in the window: of the selected materials,
    " or (no material selected) of every sales order; needed for the columns and for OnlyOrd
    IF rt_area IS NOT INITIAL AND ( is_in-matnr IS NOT INITIAL OR is_in-only_ord = 'X' ).
      DATA(lv_from) = CONV d( sy-datum - COND i( WHEN is_in-days > 0 THEN is_in-days ELSE CONV i( mo_util->cfg( iv_key = 'SO_DAYS' iv_default = '90' ) ) ) ).
      IF is_in-matnr IS NOT INITIAL.
        SELECT k~vkorg, k~vtweg, COUNT( DISTINCT k~vbeln ) AS n, MAX( k~audat ) AS last_date
          FROM vbak AS k INNER JOIN vbap AS p ON p~vbeln = k~vbeln
          WHERE p~matnr IN @is_in-matnr AND k~audat >= @lv_from AND k~vbtyp = 'C' AND p~abgru = @space
          GROUP BY k~vkorg, k~vtweg
          INTO TABLE @lt_n.
      ELSE.
        SELECT k~vkorg, k~vtweg, COUNT(*) AS n, MAX( k~audat ) AS last_date
          FROM vbak AS k
          WHERE k~audat >= @lv_from AND k~vbtyp = 'C'
          GROUP BY k~vkorg, k~vtweg
          INTO TABLE @lt_n.
      ENDIF.
      LOOP AT rt_area ASSIGNING FIELD-SYMBOL(<a>).
        READ TABLE lt_n INTO DATA(ls_n) WITH KEY vkorg = <a>-vkorg vtweg = <a>-vtweg.
        IF sy-subrc = 0. <a>-n_orders = ls_n-n. <a>-last_date = ls_n-last_date. ENDIF.
      ENDLOOP.
    ENDIF.
    IF is_in-only_ord = 'X'.                          " only the sales areas that have orders in the window
      DELETE rt_area WHERE n_orders = 0.
    ENDIF.
    LOOP AT rt_area ASSIGNING <a>. <a>-rowid = sy-tabix. ENDLOOP.
  ENDMETHOD.


  METHOD authorised.
    AUTHORITY-CHECK OBJECT 'V_VBAK_VKO'
      ID 'VKORG' FIELD iv_vkorg
      ID 'VTWEG' FIELD iv_vtweg
      ID 'SPART' DUMMY
      ID 'ACTVT' FIELD '03'.
    rv_ok = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.


  METHOD cond_value.
    DATA lv_val TYPE decfloat34.
    IF iv_rate = abap_true AND is_cond-kbetr <> 0 AND is_cond-kpein > 0.
      lv_val = CONV decfloat34( is_cond-kbetr ) / is_cond-kpein.                 " rate per condition unit
      IF is_cond-kmein IS NOT INITIAL AND is_cond-kmein <> iv_meins.
        DATA(lv_mf) = mo_util->get_uom_factor( iv_matnr = iv_matnr iv_from = is_cond-kmein iv_to = iv_meins ).
        IF lv_mf > 0. lv_val = lv_val / lv_mf. ENDIF.
      ENDIF.
    ELSEIF iv_qb > 0.
      lv_val = CONV decfloat34( is_cond-kwert ) / iv_qb.                         " value per base unit
    ENDIF.
    rv = lv_val * mo_util->get_fx_factor( iv_from = COND #( WHEN is_cond-waers IS INITIAL THEN iv_doc_cur ELSE is_cond-waers )
                                          iv_to = iv_to_cur iv_werks = iv_werks ).
  ENDMETHOD.


  METHOD constructor.
    mo_util = io_util.
    SELECT * FROM zmm_cogm_spcond INTO TABLE @mt_sc.
  ENDMETHOD.


  METHOD procedure.
    IF iv_kalsm IS INITIAL. RETURN. ENDIF.
    DATA(lv_kalsm) = CONV kalsm_d( iv_kalsm ).
    SELECT * FROM t683s WHERE kvewe = 'A' AND kappl = 'V' AND kalsm = @lv_kalsm INTO TABLE @DATA(lt_s).
    SELECT SINGLE vtext FROM t683t
      WHERE kvewe = 'A' AND kappl = 'V' AND kalsm = @lv_kalsm AND spras = @sy-langu INTO @DATA(lv_ptx).
    SELECT kschl, vtext FROM t685t WHERE kvewe = 'A' AND kappl = 'V' AND spras = @sy-langu INTO TABLE @DATA(lt_k).

    LOOP AT lt_s ASSIGNING FIELD-SYMBOL(<p>).
      DATA(ls_o) = VALUE zmm_cogm_s_soproc( kalsm = lv_kalsm kalsm_txt = lv_ptx ).
      ASSIGN COMPONENT 'STUNR' OF STRUCTURE <p> TO FIELD-SYMBOL(<a1>).
      IF sy-subrc = 0. ls_o-stunr = <a1>. ENDIF.
      ASSIGN COMPONENT 'ZAEHL' OF STRUCTURE <p> TO FIELD-SYMBOL(<a2>).
      IF sy-subrc = 0. ls_o-zaehl = <a2>. ENDIF.
      ASSIGN COMPONENT 'KSCHL' OF STRUCTURE <p> TO FIELD-SYMBOL(<a3>).
      IF sy-subrc = 0. ls_o-kschl = <a3>. ENDIF.
      CHECK ls_o-kschl IS NOT INITIAL.                         " rows without a condition type are subtotals or text lines
      ls_o-txt = VALUE #( lt_k[ kschl = ls_o-kschl ]-vtext OPTIONAL ).
      LOOP AT mt_sc ASSIGNING FIELD-SYMBOL(<s>) WHERE kschl_sp = ls_o-kschl OR kschl_mrp = ls_o-kschl.
        ls_o-role = COND #( WHEN <s>-kschl_mrp = ls_o-kschl THEN 'MRP' ELSE 'SP' ).
        EXIT.
      ENDLOOP.
      APPEND ls_o TO rt_proc.
    ENDLOOP.
    SORT rt_proc BY stunr zaehl.
    LOOP AT rt_proc ASSIGNING FIELD-SYMBOL(<r>). <r>-rowid = sy-tabix. ENDLOOP.
  ENDMETHOD.


  METHOD read.
    DATA: lr_cond TYPE RANGE OF kschl,
          lt_cond TYPE STANDARD TABLE OF ty_cond WITH DEFAULT KEY,
          lt_all  TYPE STANDARD TABLE OF ty_cond WITH DEFAULT KEY,
          lt_cand TYPE STANDARD TABLE OF ty_cand WITH DEFAULT KEY,
          lt_sel  TYPE STANDARD TABLE OF ty_cand WITH DEFAULT KEY,
          lt_kn   TYPE HASHED TABLE OF kschl WITH UNIQUE KEY table_line,
          lt_ord  TYPE HASHED TABLE OF vbeln_va WITH UNIQUE KEY table_line,
          lv_excl TYPE i.

    " ---- input checks
    IF is_in-matnr IS INITIAL.
      APPEND 'Select the finished goods' TO et_msg.  RETURN.
    ENDIF.
    " no sales organisation = every sales organisation the user is authorised for (the Margin screens select by plant only; the caller then keeps the newest price per material)
    SELECT matnr FROM mara WHERE matnr IN @is_in-matnr INTO TABLE @DATA(lt_cnt) UP TO 2000 ROWS.
    DATA(lv_max) = CONV i( mo_util->cfg( iv_key = 'SO_MAT_MAX' iv_default = '50' ) ).
    IF lines( lt_cnt ) > lv_max.
      APPEND |{ lines( lt_cnt ) } materials selected: the sales prices are read for { lv_max } at most per call| TO et_msg.  RETURN.
    ENDIF.
    DATA(lv_days) = COND i( WHEN is_in-days > 0 THEN is_in-days ELSE CONV i( mo_util->cfg( iv_key = 'SO_DAYS' iv_default = '90' ) ) ).
    DATA(lv_to)   = COND d( WHEN is_in-date_to IS INITIAL THEN sy-datum ELSE is_in-date_to ).
    DATA(lv_from) = CONV d( lv_to - lv_days ).

    " ---- order items: the fixed safe rules plus the lists chosen by the user
    DATA(lv_up) = CONV i( mo_util->cfg( iv_key = 'SO_LINE_MAX' iv_default = '200000' ) ) + 1.
    SELECT k~vbeln, p~posnr, p~matnr, p~werks, k~vkorg, k~vtweg, k~auart, p~pstyv, k~audat, k~kunnr,
           k~waerk, k~knumv, p~kwmeng, p~vrkme, p~netwr
      FROM vbak AS k
      INNER JOIN vbap AS p ON p~vbeln = k~vbeln
      INNER JOIN vbkd AS d ON d~vbeln = k~vbeln AND d~posnr = '000000'     " header business data: customer group
      WHERE p~matnr IN @is_in-matnr AND p~werks IN @is_in-werks
        AND k~vkorg IN @is_in-vkorg AND k~vtweg IN @is_in-vtweg
        AND k~audat BETWEEN @lv_from AND @lv_to
        AND k~vbtyp = 'C'
        AND k~auart IN @is_in-auart AND p~pstyv IN @is_in-pstyv
        AND d~kdgrp IN @is_in-kdgrp AND k~kunnr IN @is_in-kunnr
        AND p~abgru = @space AND p~kwmeng > 0 AND p~netwr > 0
      INTO TABLE @DATA(lt_l)
      UP TO @lv_up ROWS.
    IF lines( lt_l ) >= lv_up.
      APPEND |More than { lv_up - 1 } order items: shorten the days or select fewer finished goods| TO et_msg.  RETURN.
    ENDIF.
    IF lt_l IS INITIAL.
      APPEND |No sales order item matches the selection in the last { lv_days } days| TO et_msg.  RETURN.
    ENDIF.

    " ---- sales authorisation per sales org and channel
    DATA(lt_ok) = VALUE string_table( ).
    LOOP AT lt_l ASSIGNING FIELD-SYMBOL(<l>).
      DATA(lv_k) = |{ <l>-vkorg }/{ <l>-vtweg }|.
      READ TABLE lt_ok WITH KEY table_line = lv_k TRANSPORTING NO FIELDS.
      IF sy-subrc <> 0 AND authorised( iv_vkorg = <l>-vkorg iv_vtweg = <l>-vtweg ) = abap_true.
        APPEND lv_k TO lt_ok.
      ENDIF.
    ENDLOOP.
    LOOP AT lt_l ASSIGNING <l>.
      READ TABLE lt_ok WITH KEY table_line = |{ <l>-vkorg }/{ <l>-vtweg }| TRANSPORTING NO FIELDS.
      IF sy-subrc <> 0. <l>-netwr = 0. ENDIF.
    ENDLOOP.
    DELETE lt_l WHERE netwr = 0.
    IF lt_l IS INITIAL.
      APPEND 'No sales organisation or channel of the selection is authorised' TO et_msg.  RETURN.
    ENDIF.

    " ---- the newest items of every combination (material, sales org, channel, document type)
    SORT lt_l BY matnr vkorg vtweg auart audat DESCENDING vbeln DESCENDING posnr DESCENDING.
    DATA(lv_try) = CONV i( mo_util->cfg( iv_key = 'SO_TRY' iv_default = '5' ) ).
    IF lv_try < 1. lv_try = 1. ENDIF.
    LOOP AT lt_l ASSIGNING <l>
         GROUP BY ( matnr = <l>-matnr vkorg = <l>-vkorg vtweg = <l>-vtweg auart = <l>-auart ) ASSIGNING FIELD-SYMBOL(<g>).
      DATA(lv_first) = lines( lt_cand ) + 1.
      DATA(lv_rank)  = 0.
      CLEAR lt_ord.
      LOOP AT GROUP <g> ASSIGNING FIELD-SYMBOL(<m>).
        INSERT <m>-vbeln INTO TABLE lt_ord.
        lv_rank = lv_rank + 1.
        IF lv_rank <= lv_try.
          APPEND CORRESPONDING #( <m> ) TO lt_cand.
        ENDIF.
      ENDLOOP.
      LOOP AT lt_cand ASSIGNING FIELD-SYMBOL(<cd>) FROM lv_first.
        <cd>-n_orders = lines( lt_ord ).
      ENDLOOP.
    ENDLOOP.

    " ---- pricing procedure of every candidate order (field read by name: it may not exist in every release)
    SELECT * FROM vbak FOR ALL ENTRIES IN @lt_cand WHERE vbeln = @lt_cand-vbeln INTO TABLE @DATA(lt_h).
    SORT lt_h BY vbeln.
    LOOP AT lt_cand ASSIGNING <cd>.
      READ TABLE lt_h ASSIGNING FIELD-SYMBOL(<h>) WITH KEY vbeln = <cd>-vbeln BINARY SEARCH.
      IF sy-subrc = 0.
        ASSIGN COMPONENT 'KALSM' OF STRUCTURE <h> TO FIELD-SYMBOL(<ks>).
        IF sy-subrc = 0. <cd>-kalsm = <ks>. ENDIF.
      ENDIF.
    ENDLOOP.

    " ---- the condition types named by the rules that apply to the candidates; read their conditions
    LOOP AT lt_cand ASSIGNING <cd>.
      DATA(ls_r0) = rule_for( iv_vkorg = <cd>-vkorg iv_vtweg = <cd>-vtweg iv_auart = <cd>-auart iv_kalsm = <cd>-kalsm ).
      IF ls_r0-excl = 'X'. CONTINUE. ENDIF.
      IF ls_r0-kschl_mrp IS NOT INITIAL. INSERT ls_r0-kschl_mrp INTO TABLE lt_kn. ENDIF.
      IF ls_r0-kschl_sp  IS NOT INITIAL. INSERT ls_r0-kschl_sp  INTO TABLE lt_kn. ENDIF.
    ENDLOOP.
    lr_cond = VALUE #( FOR k IN lt_kn ( sign = 'I' option = 'EQ' low = k ) ).
    DATA(lv_tab) = CONV tabname( mo_util->cfg( iv_key = 'SO_COND_TABLE' iv_default = 'KONV' ) ).
    IF lr_cond IS NOT INITIAL.                    " an empty range would read every condition
      SELECT * FROM (lv_tab)
        FOR ALL ENTRIES IN @lt_cand
        WHERE knumv = @lt_cand-knumv AND kposn = @lt_cand-posnr AND kschl IN @lr_cond
        INTO CORRESPONDING FIELDS OF TABLE @lt_cond.
      SORT lt_cond BY knumv kposn kschl kinak.            " an active line (blank) sorts before an inactive one
    ENDIF.

    " ---- base units, descriptions, currencies, texts
    SELECT m~matnr, m~meins, t~maktx FROM mara AS m
      LEFT OUTER JOIN makt AS t ON t~matnr = m~matnr AND t~spras = @sy-langu
      FOR ALL ENTRIES IN @lt_cand WHERE m~matnr = @lt_cand-matnr
      INTO TABLE @DATA(lt_mm).
    SELECT vkorg, waers FROM tvko FOR ALL ENTRIES IN @lt_cand WHERE vkorg = @lt_cand-vkorg INTO TABLE @DATA(lt_org).
    SELECT auart, bezei FROM tvakt WHERE spras = @sy-langu INTO TABLE @DATA(lt_at).
    SELECT kalsm, vtext FROM t683t WHERE kvewe = 'A' AND kappl = 'V' AND spras = @sy-langu INTO TABLE @DATA(lt_kt).
    SORT: lt_mm BY matnr, lt_org BY vkorg.

    " ---- one price per combination: the newest candidate that has the selling price condition
    DATA: ls_mm  LIKE LINE OF lt_mm,
          ls_org LIKE LINE OF lt_org.
    LOOP AT lt_cand ASSIGNING <cd>
         GROUP BY ( matnr = <cd>-matnr vkorg = <cd>-vkorg vtweg = <cd>-vtweg auart = <cd>-auart ) ASSIGNING FIELD-SYMBOL(<g2>).
      DATA(lv_skip) = 0.
      DATA(lv_done) = abap_false.
      DATA(ls_pick) = VALUE ty_cand( ).
      LOOP AT GROUP <g2> ASSIGNING FIELD-SYMBOL(<c>).
        ls_pick = <c>.
        DATA(ls_rule) = rule_for( iv_vkorg = <c>-vkorg iv_vtweg = <c>-vtweg iv_auart = <c>-auart iv_kalsm = <c>-kalsm ).
        IF ls_rule-excl = 'X'.                                   " free sample: not counted, no row
          lv_excl = lv_excl + 1.
          lv_done = abap_true.
          EXIT.
        ENDIF.
        IF is_in-segment IS NOT INITIAL AND NOT ls_rule-segment IN is_in-segment.
          lv_done = abap_true.                                   " another segment was asked for
          EXIT.
        ENDIF.

        CLEAR: ls_mm, ls_org.
        READ TABLE lt_mm  INTO ls_mm  WITH KEY matnr = <c>-matnr BINARY SEARCH.
        READ TABLE lt_org INTO ls_org WITH KEY vkorg = <c>-vkorg BINARY SEARCH.
        DATA(lv_uf) = COND decfloat34( WHEN <c>-vrkme = ls_mm-meins THEN 1
                                       ELSE mo_util->get_uom_factor( iv_matnr = <c>-matnr iv_from = <c>-vrkme iv_to = ls_mm-meins ) ).
        DATA(lv_qb) = CONV decfloat34( <c>-kwmeng ) * lv_uf.                     " quantity in base units
        DATA(lv_fx) = mo_util->get_fx_factor( iv_from = <c>-waerk iv_to = ls_org-waers iv_werks = <c>-werks ).
        IF lv_uf <= 0 OR lv_qb <= 0 OR lv_fx <= 0.
          lv_skip = lv_skip + 1.
          CONTINUE.
        ENDIF.

        " selling price: the condition of the rule, else (when allowed) the net price of the item before tax
        DATA(lv_sp)    = CONV decfloat34( 0 ).
        DATA(lv_basis) = CONV char10( 'NETPR' ).
        DATA(lv_have)  = abap_false.
        IF ls_rule-kschl_sp IS NOT INITIAL.
          READ TABLE lt_cond INTO DATA(ls_sp)
               WITH KEY knumv = <c>-knumv kposn = <c>-posnr kschl = ls_rule-kschl_sp BINARY SEARCH.
          IF sy-subrc = 0 AND ls_sp-kinak IS INITIAL.        " the selling price must be an ACTIVE condition
            lv_sp = cond_value( is_cond = ls_sp iv_matnr = <c>-matnr iv_meins = ls_mm-meins iv_qb = lv_qb
                                iv_doc_cur = <c>-waerk iv_to_cur = ls_org-waers iv_werks = <c>-werks
                                iv_rate = xsdbool( ls_rule-sp_basis = 'R' ) ).
            IF ls_rule-sp_abs = 'X'. lv_sp = abs( lv_sp ). ENDIF.
            lv_basis = ls_rule-kschl_sp.
            lv_have  = abap_true.
          ENDIF.
        ENDIF.
        DATA(lv_net) = CONV decfloat34( <c>-netwr ) / lv_qb * lv_fx.             " net price per base unit, for reference
        IF lv_have = abap_false.
          IF ls_rule-kschl_sp IS INITIAL OR ls_rule-fallback = 'X'.
            lv_sp = lv_net.
          ELSE.                                                  " this order lacks the condition: try the next older one
            lv_skip = lv_skip + 1.
            CONTINUE.
          ENDIF.
        ENDIF.
        IF lv_sp <= 0.
          lv_skip = lv_skip + 1.
          CONTINUE.
        ENDIF.

        " MRP from the same item (statistical line, flagged inactive by the pricing procedure: accepted)
        DATA(lv_mrp) = CONV decfloat34( 0 ).
        IF ls_rule-kschl_mrp IS NOT INITIAL.
          READ TABLE lt_cond INTO DATA(ls_m)
               WITH KEY knumv = <c>-knumv kposn = <c>-posnr kschl = ls_rule-kschl_mrp BINARY SEARCH.
          IF sy-subrc = 0.
            lv_mrp = abs( cond_value( is_cond = ls_m iv_matnr = <c>-matnr iv_meins = ls_mm-meins iv_qb = lv_qb
                                      iv_doc_cur = <c>-waerk iv_to_cur = ls_org-waers iv_werks = <c>-werks
                                      iv_rate = abap_true ) ).
          ENDIF.
        ENDIF.

        APPEND VALUE zmm_cogm_s_soprice(
          rowid = lines( et_price ) + 1 matnr = <c>-matnr maktx = ls_mm-maktx vkorg = <c>-vkorg vtweg = <c>-vtweg
          auart = <c>-auart auart_txt = VALUE #( lt_at[ auart = <c>-auart ]-bezei OPTIONAL )
          segment = ls_rule-segment seg_txt = ls_rule-seg_txt
          kalsm = <c>-kalsm kalsm_txt = VALUE #( lt_kt[ kalsm = <c>-kalsm ]-vtext OPTIONAL )
          curr = ls_org-waers uom = ls_mm-meins werks = <c>-werks
          mrp = lv_mrp sp = lv_sp net_price = lv_net sp_cond = lv_basis
          vbeln = <c>-vbeln posnr = <c>-posnr kunnr = <c>-kunnr audat = <c>-audat
          days_old = CONV i( lv_to - <c>-audat ) n_orders = <c>-n_orders n_skip = lv_skip src = 'ORDER'
          msg = COND #( WHEN lv_mrp = 0 AND ls_rule-kschl_mrp IS NOT INITIAL
                          THEN |MRP condition { ls_rule-kschl_mrp } is not on the selected order item|
                        WHEN lv_skip > 0 THEN |{ lv_skip } newer order(s) skipped: no selling price condition| )
          days_back = lv_days date_to = lv_to ) TO et_price.
        APPEND <c> TO lt_sel.
        lv_done = abap_true.
        EXIT.
      ENDLOOP.

      IF lv_done = abap_false AND ls_pick-matnr IS NOT INITIAL.   " no usable order: a row with the reason and no price
        DATA(ls_rl) = rule_for( iv_vkorg = ls_pick-vkorg iv_vtweg = ls_pick-vtweg iv_auart = ls_pick-auart iv_kalsm = ls_pick-kalsm ).
        APPEND VALUE zmm_cogm_s_soprice(
          rowid = lines( et_price ) + 1 matnr = ls_pick-matnr vkorg = ls_pick-vkorg vtweg = ls_pick-vtweg
          auart = ls_pick-auart segment = ls_rl-segment seg_txt = ls_rl-seg_txt kalsm = ls_pick-kalsm
          n_orders = ls_pick-n_orders n_skip = lv_skip src = 'ORDER'
          msg = |None of the latest { lv_skip } order(s) has the selling price condition { ls_rl-kschl_sp } (or the unit / currency conversion failed)|
          days_back = lv_days date_to = lv_to ) TO et_price.
      ENDIF.
    ENDLOOP.
    IF lv_excl > 0.
      APPEND |Orders of document types that are not counted (for example free samples) were left out| TO et_msg.
    ENDIF.
    SORT et_price BY matnr vkorg vtweg auart.
    LOOP AT et_price ASSIGNING FIELD-SYMBOL(<r>). <r>-rowid = sy-tabix. ENDLOOP.

    " ---- RM, PM and perfume cost of the material from the CDS view ZCDS_ZMB31_POUTILITY (material code, batch ignored,
    "      posting type 01): the LATEST production order, per base unit, converted to the currency of the sales organisation
    IF mo_util->cfg( iv_key = 'PCOST_ENABLED' iv_default = 'X' ) = 'X'.
      DATA(lt_pk) = VALUE zcl_mm_cogm_pcost=>ty_t_key( FOR p IN et_price WHERE ( sp > 0 ) ( matnr = p-matnr asof = p-audat ) ).
      IF lt_pk IS NOT INITIAL.
        NEW zcl_mm_cogm_pcost( mo_util )->read( EXPORTING it_key = lt_pk
                                                IMPORTING et_pc = DATA(lt_pc) et_msg = DATA(lt_pcm) ).
        APPEND LINES OF lt_pcm TO et_msg.
        LOOP AT et_price ASSIGNING <r> WHERE sp > 0.
          READ TABLE lt_pc INTO DATA(ls_pc) WITH TABLE KEY matnr = <r>-matnr asof = <r>-audat.
          IF sy-subrc <> 0.
            CONTINUE.
          ENDIF.
          IF ls_pc-msg IS NOT INITIAL.
            <r>-pc_msg = ls_pc-msg.
            CONTINUE.
          ENDIF.
          DATA(lv_pfx) = mo_util->get_fx_factor( iv_from = ls_pc-curr iv_to = <r>-curr iv_werks = <r>-werks ).
          IF lv_pfx <= 0.
            <r>-pc_msg = |No exchange rate { ls_pc-curr } to { <r>-curr }|.
            CONTINUE.
          ENDIF.
          <r>-rm_cost   = ls_pc-rm   * lv_pfx.
          <r>-pm_cost   = ls_pc-pm   * lv_pfx.
          <r>-perf_cost = ls_pc-perf * lv_pfx.
          <r>-cons_rm   = ls_pc-crm   * lv_pfx.         " consumed cost: shown next to the three costs, not added to the total
          <r>-cons_pm   = ls_pc-cpm   * lv_pfx.
          <r>-cons_perf = ls_pc-cperf * lv_pfx.
          <r>-pc_total  = <r>-rm_cost + <r>-pm_cost + <r>-perf_cost.
          <r>-pc_ratio  = zcl_mm_cogm_calc=>ratio( iv_cogm = <r>-pc_total iv_sp = <r>-sp ).
          <r>-pc_date   = ls_pc-pdate.
          <r>-pc_aufnr  = ls_pc-aufnr.
          <r>-pc_werks  = ls_pc-werks.
          <r>-pc_charg  = ls_pc-charg.
        ENDLOOP.
      ENDIF.
    ENDIF.

    " ---- the full pricing of the selected order items (like the VA03 condition screen)
    IF lt_sel IS NOT INITIAL.
      SELECT * FROM (lv_tab)
        FOR ALL ENTRIES IN @lt_sel
        WHERE knumv = @lt_sel-knumv AND kposn = @lt_sel-posnr
        INTO CORRESPONDING FIELDS OF TABLE @lt_all.
      SORT lt_all BY knumv kposn stunr zaehk.
      SELECT kschl, vtext FROM t685t WHERE kvewe = 'A' AND kappl = 'V' AND spras = @sy-langu INTO TABLE @DATA(lt_ct).
      LOOP AT lt_sel ASSIGNING FIELD-SYMBOL(<s>).
        DATA(ls_rs) = rule_for( iv_vkorg = <s>-vkorg iv_vtweg = <s>-vtweg iv_auart = <s>-auart iv_kalsm = <s>-kalsm ).
        READ TABLE et_price ASSIGNING FIELD-SYMBOL(<pr>) WITH KEY vbeln = <s>-vbeln posnr = <s>-posnr.
        DATA(lv_used) = COND char10( WHEN sy-subrc = 0 THEN <pr>-sp_cond ).
        LOOP AT lt_all ASSIGNING FIELD-SYMBOL(<k>) WHERE knumv = <s>-knumv AND kposn = <s>-posnr.
          APPEND VALUE zmm_cogm_s_soprc(
            rowid = lines( et_cond ) + 1 vbeln = <s>-vbeln posnr = <s>-posnr matnr = <s>-matnr
            vkorg = <s>-vkorg vtweg = <s>-vtweg auart = <s>-auart
            stunr = <k>-stunr zaehk = <k>-zaehk kschl = <k>-kschl txt = VALUE #( lt_ct[ kschl = <k>-kschl ]-vtext OPTIONAL )
            kbetr = <k>-kbetr kpein = <k>-kpein kmein = <k>-kmein kwert = <k>-kwert waers = <k>-waers
            kstat = <k>-kstat kinak = <k>-kinak
            role = COND #( WHEN <k>-kschl = ls_rs-kschl_mrp THEN 'MRP'
                           WHEN <k>-kschl = lv_used THEN 'SP' ) ) TO et_cond.
        ENDLOOP.
      ENDLOOP.
    ENDIF.
    IF et_price IS INITIAL.
      APPEND |No price could be determined for the selection| TO et_msg.
    ENDIF.
  ENDMETHOD.


  METHOD rules.
    SELECT vkorg, vtext FROM tvkot WHERE spras = @sy-langu INTO TABLE @DATA(lt_o).
    SELECT vtweg, vtext FROM tvtwt WHERE spras = @sy-langu INTO TABLE @DATA(lt_c).
    SELECT kschl, vtext FROM t685t WHERE kvewe = 'A' AND kappl = 'V' AND spras = @sy-langu INTO TABLE @DATA(lt_k).
    DATA ls_r TYPE zmm_cogm_s_socond.

    LOOP AT mt_sc ASSIGNING FIELD-SYMBOL(<s>).
      CLEAR ls_r.
      ls_r-vkorg = <s>-vkorg.  ls_r-vtweg = <s>-vtweg.  ls_r-auart = <s>-auart.  ls_r-kalsm = <s>-kalsm.
      ls_r-kschl_sp = <s>-kschl_sp.  ls_r-kschl_mrp = <s>-kschl_mrp.
      ls_r-sp_basis = <s>-sp_basis.  ls_r-sp_abs = <s>-sp_abs.  ls_r-fallback = <s>-fallback.
      ls_r-segment = <s>-segment.  ls_r-seg_txt = <s>-seg_txt.  ls_r-excl = <s>-excl.
      ls_r-text = <s>-text.  ls_r-ch_by = <s>-ch_by.
      READ TABLE lt_o INTO DATA(ls_o) WITH KEY vkorg = <s>-vkorg.
      ls_r-org_txt = COND #( WHEN <s>-vkorg = '*' THEN 'All' WHEN sy-subrc = 0 THEN ls_o-vtext ).
      READ TABLE lt_c INTO DATA(ls_c) WITH KEY vtweg = <s>-vtweg.
      ls_r-chn_txt = COND #( WHEN <s>-vtweg = '*' THEN 'All' WHEN sy-subrc = 0 THEN ls_c-vtext ).
      IF <s>-excl = 'X'.
        ls_r-sp_txt = 'Not counted'.
      ELSEIF <s>-kschl_sp IS INITIAL.
        ls_r-sp_txt = 'Net price of the item'.
      ELSE.
        READ TABLE lt_k INTO DATA(ls_k) WITH KEY kschl = <s>-kschl_sp.
        IF sy-subrc = 0. ls_r-sp_txt = ls_k-vtext. ELSE. ls_r-sp_txt = 'Unknown condition type'. ENDIF.
      ENDIF.
      IF <s>-kschl_mrp IS NOT INITIAL.
        READ TABLE lt_k INTO ls_k WITH KEY kschl = <s>-kschl_mrp.
        IF sy-subrc = 0. ls_r-mrp_txt = ls_k-vtext. ELSE. ls_r-mrp_txt = 'Unknown condition type'. ENDIF.
      ENDIF.
      APPEND ls_r TO rt_rule.
    ENDLOOP.
    SORT rt_rule BY vkorg vtweg auart kalsm.
    LOOP AT rt_rule ASSIGNING FIELD-SYMBOL(<u>). <u>-rowid = sy-tabix. ENDLOOP.
  ENDMETHOD.


  METHOD rule_for.
    DATA: lv_best TYPE i VALUE -1,
          lv_sc   TYPE i.
    LOOP AT mt_sc ASSIGNING FIELD-SYMBOL(<s>).
      IF <s>-vkorg <> '*' AND <s>-vkorg <> iv_vkorg. CONTINUE. ENDIF.
      IF <s>-vtweg <> '*' AND <s>-vtweg <> iv_vtweg. CONTINUE. ENDIF.
      IF <s>-auart <> '*' AND <s>-auart <> iv_auart. CONTINUE. ENDIF.
      IF <s>-kalsm <> '*' AND <s>-kalsm <> iv_kalsm. CONTINUE. ENDIF.
      lv_sc = COND i( WHEN <s>-kalsm = '*' THEN 0 ELSE 8 )
            + COND i( WHEN <s>-auart = '*' THEN 0 ELSE 4 )
            + COND i( WHEN <s>-vtweg = '*' THEN 0 ELSE 2 )
            + COND i( WHEN <s>-vkorg = '*' THEN 0 ELSE 1 ).
      IF lv_sc > lv_best.
        lv_best = lv_sc.
        rs_rule = <s>.
      ENDIF.
    ENDLOOP.
    IF lv_best >= 0.
      IF rs_rule-sp_basis IS INITIAL. rs_rule-sp_basis = 'V'. ENDIF.
      RETURN.
    ENDIF.
    " nothing maintained: configuration keys; without a selling price condition the net price is used
    rs_rule = VALUE #( vkorg = '*' vtweg = '*' auart = '*' kalsm = '*'
                       kschl_sp  = mo_util->cfg( iv_key = 'SO_SP_COND' )
                       kschl_mrp = mo_util->cfg( iv_key = 'SO_MRP_COND' iv_default = 'ZMRP' )
                       sp_basis = 'V' fallback = 'X' ).
  ENDMETHOD.


  METHOD values.
    DATA: lt_acc TYPE HASHED TABLE OF ty_v WITH UNIQUE KEY kind code,
          lt_ord TYPE HASHED TABLE OF string WITH UNIQUE KEY table_line.

    IF is_in-matnr IS INITIAL OR is_in-vkorg IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lv_days) = COND i( WHEN is_in-days > 0 THEN is_in-days ELSE CONV i( mo_util->cfg( iv_key = 'SO_DAYS' iv_default = '90' ) ) ).
    DATA(lv_to)   = COND d( WHEN is_in-date_to IS INITIAL THEN sy-datum ELSE is_in-date_to ).
    DATA(lv_from) = CONV d( lv_to - lv_days ).
    DATA(lv_up)   = CONV i( mo_util->cfg( iv_key = 'SO_LINE_MAX' iv_default = '200000' ) ) + 1.

    " all items of the selection WITHOUT the document type / category / customer filters: the user sees every value
    SELECT k~vbeln, p~posnr, k~vkorg, k~vtweg, k~auart, p~pstyv, d~kdgrp, k~audat
      FROM vbak AS k
      INNER JOIN vbap AS p ON p~vbeln = k~vbeln
      INNER JOIN vbkd AS d ON d~vbeln = k~vbeln AND d~posnr = '000000'
      WHERE p~matnr IN @is_in-matnr AND p~werks IN @is_in-werks
        AND k~vkorg IN @is_in-vkorg AND k~vtweg IN @is_in-vtweg
        AND k~audat BETWEEN @lv_from AND @lv_to AND k~vbtyp = 'C' AND p~abgru = @space
      INTO TABLE @DATA(lt_l)
      UP TO @lv_up ROWS.
    DATA(lv_tot) = 0.
    LOOP AT lt_l ASSIGNING FIELD-SYMBOL(<l>).
      IF authorised( iv_vkorg = <l>-vkorg iv_vtweg = <l>-vtweg ) = abap_false. CONTINUE. ENDIF.
      lv_tot = lv_tot + 1.
      DO 6 TIMES.
        DATA(lv_kind) = SWITCH char6( sy-index WHEN 1 THEN 'VKORG' WHEN 2 THEN 'VTWEG' WHEN 3 THEN 'AUART'
                                                WHEN 4 THEN 'PSTYV' WHEN 5 THEN 'KDGRP' ELSE 'SEGMNT' ).
        IF is_in-kind IS NOT INITIAL AND is_in-kind <> lv_kind. CONTINUE. ENDIF.
        DATA(lv_code) = SWITCH char10( sy-index WHEN 1 THEN <l>-vkorg WHEN 2 THEN <l>-vtweg WHEN 3 THEN <l>-auart
                                                 WHEN 4 THEN <l>-pstyv WHEN 5 THEN <l>-kdgrp
                                                 ELSE rule_for( iv_vkorg = <l>-vkorg iv_vtweg = <l>-vtweg iv_auart = <l>-auart iv_kalsm = '' )-segment ).
        IF lv_code IS INITIAL. lv_code = '-'. ENDIF.
        READ TABLE lt_acc ASSIGNING FIELD-SYMBOL(<v>) WITH TABLE KEY kind = lv_kind code = lv_code.
        IF sy-subrc <> 0.
          INSERT VALUE #( kind = lv_kind code = lv_code ) INTO TABLE lt_acc ASSIGNING <v>.
        ENDIF.
        <v>-n_lines = <v>-n_lines + 1.
        INSERT |{ lv_kind }/{ lv_code }/{ <l>-vbeln }| INTO TABLE lt_ord.
        IF sy-subrc = 0. <v>-n_orders = <v>-n_orders + 1. ENDIF.
        IF <l>-audat > <v>-last_date. <v>-last_date = <l>-audat. ENDIF.
      ENDDO.
    ENDLOOP.
    IF lt_acc IS INITIAL. RETURN. ENDIF.

    SELECT auart, bezei FROM tvakt WHERE spras = @sy-langu INTO TABLE @DATA(lt_a).
    SELECT pstyv, vtext FROM tvapt WHERE spras = @sy-langu INTO TABLE @DATA(lt_p).
    SELECT vtweg, vtext FROM tvtwt WHERE spras = @sy-langu INTO TABLE @DATA(lt_w).
    SELECT kdgrp, ktext FROM t151t WHERE spras = @sy-langu INTO TABLE @DATA(lt_g).
    SELECT vkorg, vtext FROM tvkot WHERE spras = @sy-langu INTO TABLE @DATA(lt_o).

    LOOP AT lt_acc INTO DATA(ls_v).
      DATA(lv_txt) = ``.
      CASE ls_v-kind.
        WHEN 'AUART'. lv_txt = VALUE #( lt_a[ auart = ls_v-code ]-bezei OPTIONAL ).
        WHEN 'PSTYV'. lv_txt = VALUE #( lt_p[ pstyv = ls_v-code ]-vtext OPTIONAL ).
        WHEN 'VTWEG'. lv_txt = VALUE #( lt_w[ vtweg = ls_v-code ]-vtext OPTIONAL ).
        WHEN 'KDGRP'. lv_txt = VALUE #( lt_g[ kdgrp = ls_v-code ]-ktext OPTIONAL ).
        WHEN 'VKORG'. lv_txt = VALUE #( lt_o[ vkorg = ls_v-code ]-vtext OPTIONAL ).
        WHEN 'SEGMNT'.
          LOOP AT mt_sc ASSIGNING FIELD-SYMBOL(<sg>) WHERE segment = ls_v-code.
            lv_txt = <sg>-seg_txt.
            EXIT.
          ENDLOOP.
      ENDCASE.
      APPEND VALUE zmm_cogm_s_sofvh( kind = ls_v-kind code = ls_v-code txt = lv_txt
                                     n_lines = ls_v-n_lines n_orders = ls_v-n_orders
                                     share_pct = COND #( WHEN lv_tot > 0 THEN ls_v-n_lines * 100 / lv_tot )
                                     last_date = ls_v-last_date ) TO rt_val.
    ENDLOOP.
    SORT rt_val BY kind n_lines DESCENDING.
    LOOP AT rt_val ASSIGNING FIELD-SYMBOL(<r>). <r>-rowid = sy-tabix. ENDLOOP.
  ENDMETHOD.
ENDCLASS.