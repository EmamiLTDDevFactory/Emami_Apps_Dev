CLASS zcl_mm_cogm_service DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING is_par       TYPE zif_mm_cogm_types=>ty_par
                iv_unlimited TYPE abap_bool DEFAULT abap_false.   " the snapshot job may run more than the live limit

    METHODS run_board
      EXPORTING et_rows   TYPE zmm_cogm_tt_row
                et_drv    TYPE zmm_cogm_tt_driver
                et_alerts TYPE zmm_cogm_tt_alert.
    METHODS run_sim     EXPORTING et_rows TYPE zmm_cogm_tt_sim.
    METHODS run_history EXPORTING et_rows TYPE zmm_cogm_tt_hist.
    METHODS run_agg     EXPORTING et_rows TYPE zmm_cogm_tt_board.
    METHODS get_messages RETURNING VALUE(rt_msg) TYPE string_table.

  PRIVATE SECTION.
    DATA: ms_par       TYPE zif_mm_cogm_types=>ty_par,
          mv_unlimited TYPE abap_bool,
          mt_msg       TYPE string_table,
          mt_hist      TYPE zmm_cogm_tt_hist,
          mo_util      TYPE REF TO zcl_mm_bom_cost_util,
          mo_price     TYPE REF TO zcl_mm_cogm_price,
          mo_watch     TYPE REF TO zcl_mm_cogm_watch.

    TYPES: BEGIN OF ty_bv,
             matnr TYPE matnr,
             vbtyp TYPE vbtyp,
             umvkz TYPE umvkz,
             umvkn TYPE umvkn,
             qty   TYPE p LENGTH 15 DECIMALS 3,
           END OF ty_bv.
    METHODS select_fgs
      RETURNING VALUE(rt_fg) TYPE zif_mm_bom_cost_types=>ty_head_tab.
    METHODS rows_live
      EXPORTING et_rows TYPE zmm_cogm_tt_row
                et_drv  TYPE zmm_cogm_tt_driver.
    METHODS rows_snapshot
      EXPORTING et_rows TYPE zmm_cogm_tt_row.
    "! value per material base unit in local currency -> value per selling unit in price currency
    METHODS to_price
      IMPORTING iv_matnr    TYPE matnr
                iv_from_uom TYPE meins
                iv_to_uom   TYPE meins
                iv_fx       TYPE numeric
                iv_val      TYPE numeric
      RETURNING VALUE(rv)   TYPE decfloat34.
ENDCLASS.



CLASS ZCL_MM_COGM_SERVICE IMPLEMENTATION.


  METHOD constructor.
    ms_par       = is_par.
    mv_unlimited = iv_unlimited.
    IF ms_par-price_date IS INITIAL. ms_par-price_date = sy-datum. ENDIF.
    IF ms_par-source     IS INITIAL. ms_par-source     = 'L'.      ENDIF.
    mo_util  = NEW #( ).
    mo_watch = NEW #( mo_util ).
  ENDMETHOD.


  METHOD get_messages.
    rt_msg = mt_msg.
    LOOP AT mo_util->get_fx_issues( ) INTO DATA(lv_i).
      APPEND lv_i TO rt_msg.
    ENDLOOP.
  ENDMETHOD.


  METHOD rows_live.
    DATA: ls_row TYPE zmm_cogm_s_row,
          lt_pr  TYPE zmm_cogm_tt_price,
          ls_s   TYPE zif_mm_cogm_types=>ty_std,
          ls_c   TYPE zif_mm_cogm_types=>ty_cur,
          ls_a   TYPE zif_mm_cogm_types=>ty_act.

    DATA(lv_gc) = CONV waers( mo_util->cfg( iv_key = 'GROUP_CURR' iv_default = 'INR' ) ).       " group currency of the INR fields
    DATA(lt_fg) = select_fgs( ).
    IF lt_fg IS INITIAL.
      APPEND |No finished good found for the selection (type, plant, authorisation)| TO mt_msg.
      RETURN.
    ENDIF.
    DATA(lv_max) = CONV i( mo_util->cfg( iv_key = 'COGM_LIVE_MAX' iv_default = '25' ) ).
    IF mv_unlimited = abap_false AND lines( lt_fg ) > lv_max.
      APPEND |{ lines( lt_fg ) } finished goods selected. A live run is limited to { lv_max }: narrow the selection or use source S (last snapshot).| TO mt_msg.
      RETURN.
    ENDIF.

    " ---- the four cost scenarios
    DATA(lt_std) = NEW zcl_mm_cogm_std( mo_util )->read( lt_fg ).
    NEW zcl_mm_cogm_cur( io_util = mo_util is_par = ms_par )->read(
      EXPORTING it_std = lt_std
      IMPORTING et_cur = DATA(lt_cur) et_drv = et_drv et_msg = DATA(lt_cm) ).
    APPEND LINES OF lt_cm TO mt_msg.
    DATA(lt_act) = NEW zcl_mm_cogm_act( mo_util )->read( lt_fg ).

    " fiscal year / period of the price date (rolling 12 months of volume start here)
    DATA(lv_fsm) = CONV i( mo_util->cfg( iv_key = 'FY_START_MONTH' iv_default = '4' ) ).
    DATA(lv_m)   = CONV i( ms_par-price_date+4(2) ).
    DATA(lv_y)   = CONV i( ms_par-price_date(4) ).
    DATA(lv_fy)  = COND i( WHEN lv_m >= lv_fsm THEN lv_y ELSE lv_y - 1 ).
    DATA(lv_per) = COND i( WHEN lv_m >= lv_fsm THEN lv_m - lv_fsm + 1 ELSE lv_m + 13 - lv_fsm ).
    DATA(lv_idx0) = lv_fy * 12 + lv_per.

    SELECT matnr, werks, cogm, uom, curr FROM zmm_cogm_bud
      FOR ALL ENTRIES IN @lt_fg
      WHERE matnr = @lt_fg-matnr AND werks = @lt_fg-werks AND gjahr = @lv_fy
      INTO TABLE @DATA(lt_bud).
    " approved budget cost per piece from ZMM_FBUDCOST_SUM (same table and key as the dashboard Margin / MIS): status A, financial year of the price date, latest version,
    " WERKS = production plant, CRSSKU / business vertical / scheme / material type from MARA. Used when ZMM_COGM_BUD has no row for the finished good.
    SELECT werks, zskugrcodecrs, zbusiness, zscheme, mtart, version, rm_cost, pm_cost, perfume_cost, machine, labour, power, steam, labour3p
      FROM zmm_fbudcost_sum WHERE gjahr = @( CONV gjahr( lv_fy ) ) AND status = 'A'
      INTO TABLE @DATA(lt_fb).
    SORT lt_fb BY werks zskugrcodecrs zbusiness zscheme mtart version DESCENDING.
    SELECT matnr, zskugrcodecrs, zbusiness, zscheme, mtart, meins FROM mara
      FOR ALL ENTRIES IN @lt_fg WHERE matnr = @lt_fg-matnr
      INTO TABLE @DATA(lt_mk).
    LOOP AT lt_fg INTO DATA(ls_f0).
      READ TABLE lt_bud TRANSPORTING NO FIELDS WITH KEY matnr = ls_f0-matnr werks = ls_f0-werks.
      IF sy-subrc = 0. CONTINUE. ENDIF.
      READ TABLE lt_mk INTO DATA(ls_k0) WITH KEY matnr = ls_f0-matnr.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      DATA(lv_btot) = CONV decfloat34( 0 ).
      DATA(lv_bn)   = 0.
      DATA(lv_bver) = ``.
      LOOP AT lt_fb ASSIGNING FIELD-SYMBOL(<fb>) WHERE werks = ls_f0-werks AND zskugrcodecrs = ls_k0-zskugrcodecrs AND zbusiness = ls_k0-zbusiness
                                                  AND zscheme = ls_k0-zscheme AND mtart = ls_k0-mtart.
        IF lv_bn = 0. lv_bver = <fb>-version. ENDIF.
        IF <fb>-version <> lv_bver. CONTINUE. ENDIF.
        lv_bn = lv_bn + 1.
        lv_btot = lv_btot + <fb>-rm_cost + <fb>-pm_cost + <fb>-perfume_cost + <fb>-machine + <fb>-labour + <fb>-power + <fb>-steam + <fb>-labour3p.
      ENDLOOP.
      IF lv_bn > 0.
        APPEND VALUE #( matnr = ls_f0-matnr werks = ls_f0-werks cogm = lv_btot / lv_bn uom = ls_k0-meins
                        curr = mo_util->get_plant_local_currency( ls_f0-werks ) ) TO lt_bud.
      ENDIF.
    ENDLOOP.
    SELECT m~matnr, m~meins, m~prodha, m~zbrandcode, t~maktx
      FROM mara AS m LEFT OUTER JOIN makt AS t ON t~matnr = m~matnr AND t~spras = @sy-langu
      FOR ALL ENTRIES IN @lt_fg
      WHERE m~matnr = @lt_fg-matnr
      INTO TABLE @DATA(lt_mm).
    SELECT * FROM zmm_cogm_vol
      FOR ALL ENTRIES IN @lt_fg
      WHERE matnr = @lt_fg-matnr
      INTO TABLE @DATA(lt_vol).

    " billed quantity of the last 12 months in the material base unit: used for the volume of a finished good that has no row in ZMM_COGM_VOL
    DATA: lt_bv TYPE STANDARD TABLE OF ty_bv, lv_bf TYPE d.
    lv_bf = ms_par-price_date - 365.
    DATA(lr_bm) = VALUE zif_mm_cogm_types=>ty_r_matnr( FOR f2 IN lt_fg ( sign = 'I' option = 'EQ' low = f2-matnr ) ).
    SELECT p~matnr AS matnr, h~vbtyp AS vbtyp, p~umvkz AS umvkz, p~umvkn AS umvkn, SUM( p~fkimg ) AS qty
      FROM vbrk AS h INNER JOIN vbrp AS p ON p~vbeln = h~vbeln
      WHERE p~matnr IN @lr_bm AND h~fkdat BETWEEN @lv_bf AND @ms_par-price_date
        AND h~vbtyp IN ( 'M', 'N', 'O', 'P', 'S' ) AND h~waerk = 'INR' AND p~umvkn > 0
      GROUP BY p~matnr, h~vbtyp, p~umvkz, p~umvkn
      INTO TABLE @lt_bv.
    DATA(lr_matnr) = VALUE zif_mm_cogm_types=>ty_r_matnr( FOR f IN lt_fg ( sign = 'I' option = 'EQ' low = f-matnr ) ).
    mo_price = NEW #( ms_par-price_date ).
    mo_price->load( ir_matnr = lr_matnr ir_market = ms_par-market ir_channel = ms_par-channel ).

    " ---- prices from the latest sales orders (price_src = O): one price per sales org, channel and document type
    DATA lt_so TYPE zmm_cogm_tt_soprice.
    IF ms_par-price_src = 'O'.
      NEW zcl_mm_cogm_soprice( mo_util )->read(
        EXPORTING is_in = VALUE #( matnr = lr_matnr werks = ms_par-werks vkorg = ms_par-vkorg vtweg = ms_par-vtweg segment = ms_par-segment
                                   auart = ms_par-so_auart pstyv = ms_par-so_pstyv
                                   kdgrp = ms_par-so_kdgrp kunnr = ms_par-so_kunnr
                                   days = ms_par-so_days date_to = ms_par-price_date )
        IMPORTING et_price = lt_so et_msg = DATA(lt_sm) ).
      APPEND LINES OF lt_sm TO mt_msg.
      " plant only selection (no sales organisation): one price per finished good, the newest order that has a price
      IF ms_par-vkorg IS INITIAL AND lt_so IS NOT INITIAL.
        DATA lt_so1 TYPE zmm_cogm_tt_soprice.
        SORT lt_so BY matnr audat DESCENDING.
        LOOP AT lt_so INTO DATA(ls_sx) WHERE sp > 0.
          READ TABLE lt_so1 TRANSPORTING NO FIELDS WITH KEY matnr = ls_sx-matnr.
          IF sy-subrc <> 0. APPEND ls_sx TO lt_so1. ENDIF.
        ENDLOOP.
        LOOP AT lt_so INTO ls_sx WHERE sp <= 0.
          READ TABLE lt_so1 TRANSPORTING NO FIELDS WITH KEY matnr = ls_sx-matnr.
          IF sy-subrc <> 0. APPEND ls_sx TO lt_so1. ENDIF.
        ENDLOOP.
        lt_so = lt_so1.
      ENDIF.
    ENDIF.

    DATA: ls_b LIKE LINE OF lt_bud,
          ls_m LIKE LINE OF lt_mm.

    LOOP AT lt_fg INTO DATA(ls_fg).
      CLEAR: ls_s, ls_c, ls_a, ls_b, ls_m.                " a missing record must not keep the previous values
      READ TABLE lt_std INTO ls_s WITH KEY matnr = ls_fg-matnr werks = ls_fg-werks.
      READ TABLE lt_cur INTO ls_c WITH KEY matnr = ls_fg-matnr werks = ls_fg-werks.
      READ TABLE lt_act INTO ls_a WITH KEY matnr = ls_fg-matnr werks = ls_fg-werks.
      READ TABLE lt_bud INTO ls_b WITH KEY matnr = ls_fg-matnr werks = ls_fg-werks.
      READ TABLE lt_mm  INTO ls_m WITH KEY matnr = ls_fg-matnr.

      IF ms_par-price_src = 'O'.
        CLEAR lt_pr.
        LOOP AT lt_so INTO DATA(ls_so) WHERE matnr = ls_fg-matnr.
          " market = sales organisation, channel = channel / document type; a combination without a usable order has sp = 0
          APPEND VALUE #( matnr = ls_so-matnr market = ls_so-vkorg
                          channel = |{ ls_so-vtweg }/{ ls_so-auart }|
                          curr = ls_so-curr uom = ls_so-uom price_unit = 1
                          mrp = ls_so-mrp sell_price = ls_so-sp
                          valid_from = ls_so-audat src = 'ORDER' ) TO lt_pr.
        ENDLOOP.
      ELSE.
        lt_pr = mo_price->prices_for( ls_fg-matnr ).
      ENDIF.
      IF lt_pr IS INITIAL.                              " the cost rows are still shown, without ratios
        APPEND VALUE #( matnr = ls_fg-matnr market = '*' channel = '*' curr = ls_s-curr uom = ls_m-meins price_unit = 1 ) TO lt_pr.
      ENDIF.

      LOOP AT lt_pr INTO DATA(ls_pr).
        CLEAR ls_row.
        ls_row-matnr = ls_fg-matnr.  ls_row-maktx = ls_m-maktx.  ls_row-werks = ls_fg-werks.
        ls_row-market = ls_pr-market. ls_row-channel = ls_pr-channel. ls_row-prodha = ls_m-prodha. ls_row-brand = ls_m-zbrandcode.
        ls_row-base_uom = ls_m-meins.
        ls_row-sell_uom = COND #( WHEN ls_pr-uom IS NOT INITIAL THEN ls_pr-uom ELSE ls_m-meins ).
        ls_row-curr     = COND #( WHEN ls_pr-curr IS NOT INITIAL THEN ls_pr-curr ELSE ls_s-curr ).
        ls_row-price_from = ls_pr-valid_from.  ls_row-price_src = ls_pr-src.  ls_row-gst_pct = ls_pr-gst_pct.
        ls_row-src = 'L'.
        ls_row-fx_inr = mo_util->get_fx_factor( iv_from = ls_row-curr iv_to = lv_gc iv_werks = ls_fg-werks ).

        " price and MRP per selling unit (the record may be quoted per 100 / per 1000 units)
        DATA(lv_pu) = COND decfloat34( WHEN ls_pr-price_unit > 0 THEN ls_pr-price_unit ELSE 1 ).
        ls_row-sell_price = ls_pr-sell_price / lv_pu.
        ls_row-mrp        = ls_pr-mrp / lv_pu.
        DATA(ls_rule) = mo_price->rule_for( iv_prodha = ls_m-prodha iv_market = ls_row-market iv_channel = ls_row-channel ).
        IF ls_row-sell_price = 0 AND ls_row-mrp > 0 AND ls_rule IS NOT INITIAL.
          ls_row-sell_price = zcl_mm_cogm_price=>mrp_to_sp( is_rule = ls_rule iv_mrp = ls_row-mrp ).
          ls_row-price_src  = 'RULE'.
        ENDIF.

        " standard
        IF ls_s-ok = abap_true.
          DATA(lv_f) = mo_util->get_fx_factor( iv_from = ls_s-curr iv_to = ls_row-curr iv_werks = ls_fg-werks ).
          ls_row-fx_loc   = lv_f.
          ls_row-ok_std   = abap_true.
          ls_row-cogm_std = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-cogm ).
          ls_row-std_rm   = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-rm ).
          ls_row-std_pm   = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-pm ).
          ls_row-std_conv = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-conv ).
          ls_row-std_ovh  = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-ovh ).
          ls_row-std_oth  = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_s-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_s-oth ).
        ENDIF.
        " current estimate (the costing engine works in the same plant currency as the standard)
        IF ls_c-ok = abap_true.
          lv_f = mo_util->get_fx_factor( iv_from = ls_c-curr iv_to = ls_row-curr iv_werks = ls_fg-werks ).
          ls_row-ok_cur   = abap_true.
          ls_row-cogm_cur = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-cogm ).
          ls_row-cur_rm   = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-rm ).
          ls_row-cur_pm   = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-pm ).
          ls_row-cur_conv = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-conv ).
          ls_row-cur_ovh  = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-ovh ).
          ls_row-cur_oth  = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_m-meins iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_c-oth ).
        ENDIF.
        " actual
        IF ls_a-ok = abap_true.
          lv_f = mo_util->get_fx_factor( iv_from = ls_a-curr iv_to = ls_row-curr iv_werks = ls_fg-werks ).
          ls_row-ok_act   = abap_true.
          ls_row-cogm_act = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_a-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_a-cogm ).
        ENDIF.
        " budget
        IF ls_b-cogm > 0.
          lv_f = mo_util->get_fx_factor( iv_from = CONV waers( ls_b-curr ) iv_to = ls_row-curr iv_werks = ls_fg-werks ).
          ls_row-ok_bud   = abap_true.
          ls_row-cogm_bud = to_price( iv_matnr = ls_fg-matnr iv_from_uom = ls_b-uom iv_to_uom = ls_row-sell_uom iv_fx = lv_f iv_val = ls_b-cogm ).
        ENDIF.

        " rolling-12-month volume in selling units
        DATA(lv_vol) = CONV decfloat34( 0 ).
        LOOP AT lt_vol ASSIGNING FIELD-SYMBOL(<v>) WHERE matnr = ls_fg-matnr.
          CHECK ls_row-market = '*' OR <v>-market = ls_row-market.
          DATA(lv_idx) = <v>-gjahr * 12 + <v>-poper.
          CHECK lv_idx >= lv_idx0 AND lv_idx <= lv_idx0 + 11.
          DATA(lv_vq) = CONV decfloat34( <v>-volume ).
          IF <v>-uom <> ls_row-sell_uom AND <v>-uom IS NOT INITIAL.
            DATA(lv_uf) = mo_util->get_uom_factor( iv_matnr = ls_fg-matnr iv_from = <v>-uom iv_to = ls_row-sell_uom ).
            lv_vq = lv_vq * lv_uf.
          ENDIF.
          lv_vol = lv_vol + lv_vq.
        ENDLOOP.
        IF lv_vol = 0 AND lines( lt_pr ) = 1.
          LOOP AT lt_bv ASSIGNING FIELD-SYMBOL(<bv>) WHERE matnr = ls_fg-matnr.
            lv_vol = lv_vol + COND decfloat34( WHEN <bv>-vbtyp = 'N' OR <bv>-vbtyp = 'O' THEN -1 ELSE 1 ) * <bv>-qty * <bv>-umvkz / <bv>-umvkn.
          ENDLOOP.
          IF lv_vol <> 0 AND ls_row-sell_uom <> ls_m-meins AND ls_m-meins IS NOT INITIAL.
            lv_vol = lv_vol * mo_util->get_uom_factor( iv_matnr = ls_fg-matnr iv_from = ls_m-meins iv_to = ls_row-sell_uom ).
          ENDIF.
        ENDIF.
        ls_row-volume_yr = lv_vol.

        " status
        ls_row-status = COND #( WHEN ls_row-sell_price <= 0 THEN 'P'
                                WHEN ls_row-ok_std = abap_false THEN 'S'
                                WHEN ls_row-ok_cur = abap_false THEN 'C' ).
        ls_row-msg = COND #( WHEN ls_row-status = 'P' THEN 'No price record for the date'
                             WHEN ls_row-status = 'S' THEN ls_s-msg
                             WHEN ls_row-status = 'C' THEN ls_c-msg ).

        " targets first (they feed the required-price fields), then every derived field
        DATA(ls_thr) = mo_watch->thr_for( iv_matnr = ls_fg-matnr iv_prodha = ls_m-prodha iv_market = ls_row-market ).
        ls_row-tgt_ratio  = ls_thr-max_ratio.
        ls_row-tgt_remain = ls_thr-min_remain.
        zcl_mm_cogm_calc=>fill_row( EXPORTING is_rule = ls_rule CHANGING cs_row = ls_row ).
        APPEND ls_row TO et_rows.
      ENDLOOP.
    ENDLOOP.

    " ---- drivers: per selling unit, in INR, with the annual volume of the finished good
    LOOP AT et_drv ASSIGNING FIELD-SYMBOL(<d>).
      READ TABLE et_rows INTO DATA(ls_r1) WITH KEY matnr = <d>-matnr werks = <d>-werks.
      CHECK sy-subrc = 0.
      <d>-maktx = ls_r1-maktx.
      DATA(lv_fsell) = to_price( iv_matnr = <d>-matnr iv_from_uom = ls_r1-base_uom iv_to_uom = ls_r1-sell_uom iv_fx = 1 iv_val = 1 ).
      DATA(lv_floc)  = mo_util->get_fx_factor( iv_from = <d>-curr iv_to = lv_gc iv_werks = <d>-werks ).
      <d>-delta_sell_inr = <d>-delta_unit * lv_fsell * lv_floc.
      <d>-volume_yr = REDUCE #( INIT s = CONV decfloat34( 0 ) FOR r IN et_rows WHERE ( matnr = <d>-matnr AND werks = <d>-werks ) NEXT s = s + r-volume_yr ).
      <d>-annual_inr = <d>-delta_sell_inr * <d>-volume_yr.
    ENDLOOP.

    " ---- the snapshot of about a week ago (rule E9)
    DATA(lv_hd)  = CONV d( ms_par-price_date - 7 ).
    DATA(lv_hd2) = CONV d( lv_hd - 4 ).
    SELECT * FROM zmm_cogm_snap
      FOR ALL ENTRIES IN @lt_fg
      WHERE matnr = @lt_fg-matnr AND werks = @lt_fg-werks
        AND snap_date <= @lv_hd AND snap_date >= @lv_hd2
      INTO CORRESPONDING FIELDS OF TABLE @mt_hist.
    SORT mt_hist BY matnr werks market snap_date DESCENDING.
    DELETE ADJACENT DUPLICATES FROM mt_hist COMPARING matnr werks market.
  ENDMETHOD.


  METHOD rows_snapshot.
    DATA ls_row TYPE zmm_cogm_s_row.

    SELECT MAX( snap_date ) FROM zmm_cogm_snap WHERE snap_date <= @ms_par-price_date INTO @DATA(lv_date).
    IF lv_date IS INITIAL.
      APPEND |No snapshot exists up to { ms_par-price_date DATE = USER }| TO mt_msg.
      RETURN.
    ENDIF.
    SELECT s~*, t~maktx
      FROM zmm_cogm_snap AS s
      LEFT OUTER JOIN makt AS t ON t~matnr = s~matnr AND t~spras = @sy-langu
      WHERE s~snap_date = @lv_date AND s~matnr IN @ms_par-matnr AND s~werks IN @ms_par-werks
        AND s~market IN @ms_par-market AND s~channel IN @ms_par-channel AND s~prodha IN @ms_par-prodha
      INTO TABLE @DATA(lt_s).
    LOOP AT lt_s INTO DATA(ls_s).
      IF zcl_mm_bom_cost_auth=>check_plant( ls_s-s-werks ) = abap_false. CONTINUE. ENDIF.
      CLEAR ls_row.
      MOVE-CORRESPONDING ls_s-s TO ls_row.
      ls_row-maktx = ls_s-maktx.
      ls_row-src   = 'S'.
      ls_row-price_from = lv_date.
      DATA(ls_thr) = mo_watch->thr_for( iv_matnr = ls_row-matnr iv_prodha = ls_row-prodha iv_market = ls_row-market ).
      ls_row-tgt_ratio  = ls_thr-max_ratio.
      ls_row-tgt_remain = ls_thr-min_remain.
      zcl_mm_cogm_calc=>fill_row( CHANGING cs_row = ls_row ).
      APPEND ls_row TO et_rows.
    ENDLOOP.
    APPEND |Snapshot of { lv_date DATE = USER } (not live)| TO mt_msg.
  ENDMETHOD.


  METHOD run_agg.
    TYPES: BEGIN OF ty_g,
             gkey   TYPE c LENGTH 30,
             fg     TYPE i,
             hi     TYPE i,
             md     TYPE i,
             nodata TYPE i,
             rev    TYPE decfloat34,
             c_std  TYPE decfloat34,
             c_cur  TYPE decfloat34,
             imp    TYPE decfloat34,
           END OF ty_g.
    DATA lt_g TYPE HASHED TABLE OF ty_g WITH UNIQUE KEY gkey.

    run_board( IMPORTING et_rows = DATA(lt_rows) ).
    DATA(lv_by) = COND char1( WHEN ms_par-group_by IS INITIAL THEN 'P' ELSE ms_par-group_by ).
    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      DATA(lv_key) = SWITCH char30( lv_by WHEN 'W' THEN <r>-werks WHEN 'M' THEN <r>-market
                                          WHEN 'B' THEN <r>-brand ELSE <r>-prodha ).
      READ TABLE lt_g ASSIGNING FIELD-SYMBOL(<g>) WITH TABLE KEY gkey = lv_key.
      IF sy-subrc <> 0.
        INSERT VALUE #( gkey = lv_key ) INTO TABLE lt_g ASSIGNING <g>.
      ENDIF.
      <g>-fg = <g>-fg + 1.
      IF <r>-alert_sev = 'H'. <g>-hi = <g>-hi + 1. ENDIF.
      IF <r>-alert_sev = 'M'. <g>-md = <g>-md + 1. ENDIF.
      IF <r>-status IS NOT INITIAL. <g>-nodata = <g>-nodata + 1. ENDIF.
      " volume-weighted: revenue and cost in INR over the same volume
      IF <r>-volume_yr > 0 AND <r>-sell_price > 0 AND <r>-ok_std = abap_true AND <r>-ok_cur = abap_true.
        <g>-rev   = <g>-rev   + <r>-sell_price * <r>-volume_yr * <r>-fx_inr.
        <g>-c_std = <g>-c_std + <r>-cogm_std   * <r>-volume_yr * <r>-fx_inr.
        <g>-c_cur = <g>-c_cur + <r>-cogm_cur   * <r>-volume_yr * <r>-fx_inr.
      ENDIF.
      <g>-imp = <g>-imp + <r>-annual_impact_inr.
    ENDLOOP.
    LOOP AT lt_g ASSIGNING <g>.
      APPEND VALUE #( rowid = lines( et_rows ) + 1 group_kind = lv_by grp_key = <g>-gkey fg_cnt = <g>-fg
                      alert_high = <g>-hi alert_med = <g>-md no_data_cnt = <g>-nodata
                      wratio_std = zcl_mm_cogm_calc=>ratio( iv_cogm = <g>-c_std iv_sp = <g>-rev )
                      wratio_cur = zcl_mm_cogm_calc=>ratio( iv_cogm = <g>-c_cur iv_sp = <g>-rev )
                      revenue_inr = <g>-rev annual_impact_inr = <g>-imp ) TO et_rows.
    ENDLOOP.
    SORT et_rows BY annual_impact_inr DESCENDING.
  ENDMETHOD.


  METHOD run_board.
    IF ms_par-source = 'S'.
      rows_snapshot( IMPORTING et_rows = et_rows ).
    ELSE.
      rows_live( IMPORTING et_rows = et_rows et_drv = et_drv ).
    ENDIF.

    mo_watch->evaluate( EXPORTING  it_drv    = et_drv
                                   it_hist   = mt_hist
                        IMPORTING  et_alerts = et_alerts
                        CHANGING   ct_rows   = et_rows ).

    " rows of markets the user may not see are removed (the sensitive part of this module)
    DATA(lv_i) = lines( et_rows ).
    WHILE lv_i > 0.
      IF zcl_mm_cogm_auth=>check_view( et_rows[ lv_i ]-market ) = abap_false.
        DELETE et_rows INDEX lv_i.
      ENDIF.
      lv_i = lv_i - 1.
    ENDWHILE.
    LOOP AT et_rows ASSIGNING FIELD-SYMBOL(<r>).
      <r>-rowid = sy-tabix.
    ENDLOOP.
  ENDMETHOD.


  METHOD run_history.
    DATA(lv_back) = COND i( WHEN ms_par-days_back > 0 THEN ms_par-days_back ELSE 90 ).
    DATA(lv_from) = CONV d( ms_par-price_date - lv_back ).
    SELECT * FROM zmm_cogm_snap
      WHERE matnr IN @ms_par-matnr AND werks IN @ms_par-werks AND market IN @ms_par-market
        AND channel IN @ms_par-channel AND snap_date BETWEEN @lv_from AND @ms_par-price_date
      ORDER BY matnr, werks, market, channel, snap_date
      INTO TABLE @DATA(lt_s).
    DATA: lv_key TYPE string, lv_base TYPE decfloat34.
    LOOP AT lt_s INTO DATA(ls_s).
      IF zcl_mm_bom_cost_auth=>check_plant( ls_s-werks ) = abap_false OR zcl_mm_cogm_auth=>check_view( ls_s-market ) = abap_false.
        CONTINUE.
      ENDIF.
      DATA(lv_k) = |{ ls_s-matnr }/{ ls_s-werks }/{ ls_s-market }/{ ls_s-channel }|.
      IF lv_k <> lv_key.
        lv_key  = lv_k.
        lv_base = ls_s-cogm_cur.                   " first snapshot of the range = base of the erosion
      ENDIF.
      APPEND VALUE #( rowid = lines( et_rows ) + 1 snap_date = ls_s-snap_date matnr = ls_s-matnr werks = ls_s-werks
                      market = ls_s-market channel = ls_s-channel curr = ls_s-curr sell_price = ls_s-sell_price
                      cogm_std = ls_s-cogm_std cogm_cur = ls_s-cogm_cur cogm_act = ls_s-cogm_act
                      remain_cur = ls_s-sell_price - ls_s-cogm_cur
                      ratio_cur  = zcl_mm_cogm_calc=>ratio( iv_cogm = ls_s-cogm_cur iv_sp = ls_s-sell_price )
                      erosion_std  = COND #( WHEN ls_s-ok_std = 'X' AND ls_s-ok_cur = 'X' THEN ls_s-cogm_cur - ls_s-cogm_std )
                      erosion_base = ls_s-cogm_cur - lv_base
                      volume_yr = ls_s-volume_yr ) TO et_rows.
    ENDLOOP.
  ENDMETHOD.


  METHOD run_sim.
    run_board( IMPORTING et_rows = DATA(lt_rows) ).
    IF mo_price IS NOT BOUND.
      mo_price = NEW #( ms_par-price_date ).
      mo_price->load( ir_matnr = ms_par-matnr ir_market = ms_par-market ir_channel = ms_par-channel ).
    ENDIF.
    DATA(lv_scn) = COND string( WHEN ms_par-scenario IS INITIAL THEN 'CUR' ELSE ms_par-scenario ).

    LOOP AT lt_rows ASSIGNING FIELD-SYMBOL(<r>).
      DATA(ls_rule) = mo_price->rule_for( iv_prodha = <r>-prodha iv_market = <r>-market iv_channel = <r>-channel ).
      DATA(ls_s) = VALUE zmm_cogm_s_sim( rowid = lines( et_rows ) + 1 matnr = <r>-matnr maktx = <r>-maktx werks = <r>-werks
                                         market = <r>-market channel = <r>-channel curr = <r>-curr sell_uom = <r>-sell_uom
                                         base_scn = lv_scn mrp_before = <r>-mrp sp_before = <r>-sell_price volume_yr = <r>-volume_yr ).
      ls_s-cogm_before = SWITCH #( lv_scn WHEN 'STD' THEN <r>-cogm_std WHEN 'ACT' THEN <r>-cogm_act
                                          WHEN 'BUD' THEN <r>-cogm_bud ELSE <r>-cogm_cur ).
      " the commercial change
      IF ms_par-new_sp > 0.
        ls_s-sp_after  = ms_par-new_sp.
        ls_s-mrp_after = COND #( WHEN ls_rule IS NOT INITIAL THEN zcl_mm_cogm_price=>sp_to_mrp( is_rule = ls_rule iv_sp = ms_par-new_sp ) ELSE <r>-mrp ).
      ELSEIF ms_par-new_mrp > 0.
        ls_s-mrp_after = ms_par-new_mrp.
        ls_s-sp_after  = COND #( WHEN ls_rule IS NOT INITIAL THEN zcl_mm_cogm_price=>mrp_to_sp( is_rule = ls_rule iv_mrp = ms_par-new_mrp ) ELSE <r>-sell_price ).
        IF ls_rule IS INITIAL.
          ls_s-msg = 'No MRP-to-selling-price rule: the selling price was not changed'.
        ENDIF.
      ELSE.
        ls_s-sp_after = <r>-sell_price.  ls_s-mrp_after = <r>-mrp.
      ENDIF.
      " the cost change
      ls_s-cogm_after = ls_s-cogm_before * ( 1 + ms_par-cogm_dpct / 100 ) + ms_par-cogm_dabs.
      " results
      ls_s-remain_before = ls_s-sp_before - ls_s-cogm_before.
      ls_s-remain_after  = ls_s-sp_after  - ls_s-cogm_after.
      ls_s-ratio_before  = zcl_mm_cogm_calc=>ratio( iv_cogm = ls_s-cogm_before iv_sp = ls_s-sp_before ).
      ls_s-ratio_after   = zcl_mm_cogm_calc=>ratio( iv_cogm = ls_s-cogm_after  iv_sp = ls_s-sp_after ).
      ls_s-delta_remain  = ls_s-remain_after - ls_s-remain_before.
      ls_s-annual_delta  = ls_s-delta_remain * ls_s-volume_yr.
      ls_s-annual_delta_inr = ls_s-annual_delta * <r>-fx_inr.
      ls_s-req_sp_ratio   = zcl_mm_cogm_calc=>req_sp_ratio( iv_cogm = ls_s-cogm_after iv_target_ratio = COND decfloat34( WHEN ms_par-tgt_ratio > 0 THEN ms_par-tgt_ratio ELSE <r>-tgt_ratio ) ).
      ls_s-req_sp_remain  = zcl_mm_cogm_calc=>req_sp_remain( iv_cogm = ls_s-cogm_after iv_target_remain = COND decfloat34( WHEN ms_par-tgt_remain > 0 THEN ms_par-tgt_remain ELSE <r>-remain_std ) ).
      ls_s-req_sp_restore = ls_s-req_sp_remain.
      IF ls_rule IS NOT INITIAL.
        ls_s-req_mrp_restore = zcl_mm_cogm_price=>sp_to_mrp( is_rule = ls_rule iv_sp = ls_s-req_sp_restore ).
      ENDIF.
      APPEND ls_s TO et_rows.
    ENDLOOP.
  ENDMETHOD.


  METHOD select_fgs.
    DATA(lr_head) = mo_util->cfg_mtart_range( iv_key = 'HEAD_MTART' iv_default = 'FERT' ).
    SELECT m~matnr, c~werks
      FROM mara AS m
      INNER JOIN marc AS c ON c~matnr = m~matnr
      WHERE m~matnr IN @ms_par-matnr AND c~werks IN @ms_par-werks
        AND m~lvorm = @space AND c~lvorm = @space
        AND m~mtart IN @lr_head
        AND m~prodha IN @ms_par-prodha AND m~zbrandcode IN @ms_par-brand
      ORDER BY m~matnr, c~werks
      INTO CORRESPONDING FIELDS OF TABLE @rt_fg.
    DATA(lv_i) = lines( rt_fg ).
    WHILE lv_i > 0.
      IF zcl_mm_bom_cost_auth=>check_plant( rt_fg[ lv_i ]-werks ) = abap_false.
        DELETE rt_fg INDEX lv_i.
      ENDIF.
      lv_i = lv_i - 1.
    ENDWHILE.
  ENDMETHOD.


  METHOD to_price.
    DATA lv_pc TYPE p LENGTH 15 DECIMALS 6.
    lv_pc = CONV decfloat34( iv_val ) * CONV decfloat34( iv_fx ).
    IF iv_from_uom IS NOT INITIAL AND iv_to_uom IS NOT INITIAL AND iv_from_uom <> iv_to_uom.
      mo_util->convert_rate_to_uom( EXPORTING iv_matnr = iv_matnr iv_from = iv_from_uom
                                              iv_to    = iv_to_uom CHANGING cv_rate = lv_pc ).
    ENDIF.
    rv = lv_pc.
  ENDMETHOD.
ENDCLASS.
