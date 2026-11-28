"! Distribution Planning feed of Trip Trail (read only, no COMMIT): material master, plant stock, batch lots, open STOs, open sales orders, sales and
"! stock in transit - all aggregated here, never raw lines, in the shape docs/DISTRIBUTION_PLANNING.md expects. Called by ZCL_ZTMS_DPC (OData ZTMS_SRV).
"! Material numbers leave without leading zeros (ALPHA out) and are accepted in either form. Quantities are in the base unit of measure; the planning
"! engine converts to cases with the case pack (MARM, KAR or CS). Nothing here depends on a Z table, so it also runs on NGQ / NWP.
CLASS zcl_tms_dp DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS c_open_order_days TYPE i VALUE 120.   "sales orders created in the last N days are considered for open orders
    CONSTANTS c_transit_days TYPE i VALUE 90.       "STOs created in the last N days are considered for transit
    CLASS-METHODS get_materials
      IMPORTING it_spart TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_mat) TYPE zcl_tms_ty=>tt_dpmaterial.
    CLASS-METHODS get_stock
      IMPORTING it_werks TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_stk) TYPE zcl_tms_ty=>tt_dpstock.
    CLASS-METHODS get_lots
      IMPORTING it_werks TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_lot) TYPE zcl_tms_ty=>tt_dplot.
    CLASS-METHODS get_sto
      IMPORTING it_werks TYPE string_table OPTIONAL it_reswk TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_sto) TYPE zcl_tms_ty=>tt_dpsto.
    CLASS-METHODS get_open_orders
      IMPORTING it_werks TYPE string_table OPTIONAL it_vtweg TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_oo) TYPE zcl_tms_ty=>tt_dpopenorder.
    CLASS-METHODS get_sales
      IMPORTING iv_from TYPE d iv_to TYPE d it_werks TYPE string_table OPTIONAL it_vtweg TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_sale) TYPE zcl_tms_ty=>tt_dpsale.
    CLASS-METHODS get_transit
      IMPORTING it_werks TYPE string_table OPTIONAL it_swerks TYPE string_table OPTIONAL it_matnr TYPE string_table OPTIONAL
      RETURNING VALUE(rt_tr) TYPE zcl_tms_ty=>tt_dptransit.
    CLASS-METHODS mat_out
      IMPORTING iv_matnr TYPE matnr RETURNING VALUE(rv_out) TYPE zcl_tms_ty=>ts_dpmaterial-matnr.
  PRIVATE SECTION.
    TYPES tt_matnr_rng TYPE RANGE OF matnr.
    TYPES tt_werks_rng TYPE RANGE OF werks_d.
    TYPES tt_vtweg_rng TYPE RANGE OF vtweg.
    CLASS-METHODS mat_range
      IMPORTING it_matnr TYPE string_table RETURNING VALUE(rr_matnr) TYPE tt_matnr_rng.
    CLASS-METHODS werks_range
      IMPORTING it_werks TYPE string_table RETURNING VALUE(rr_werks) TYPE tt_werks_rng.
    CLASS-METHODS vtweg_range
      IMPORTING it_vtweg TYPE string_table RETURNING VALUE(rr_vtweg) TYPE tt_vtweg_rng.
ENDCLASS.

CLASS zcl_tms_dp IMPLEMENTATION.

  METHOD mat_out.
    rv_out = |{ iv_matnr ALPHA = OUT }|.
    CONDENSE rv_out.
  ENDMETHOD.

  METHOD mat_range.
    rr_matnr = VALUE #( FOR m IN it_matnr ( sign = 'I' option = 'EQ' low = |{ CONV matnr( m ) ALPHA = IN }| ) ).
  ENDMETHOD.

  METHOD werks_range.
    rr_werks = VALUE #( FOR w IN it_werks ( sign = 'I' option = 'EQ' low = to_upper( w ) ) ).
  ENDMETHOD.

  METHOD vtweg_range.
    rr_vtweg = VALUE #( FOR v IN it_vtweg ( sign = 'I' option = 'EQ' low = v ) ).
  ENDMETHOD.

  METHOD get_materials.
    DATA(lr_matnr) = mat_range( it_matnr ).
    DATA lr_spart TYPE RANGE OF spart.
    lr_spart = VALUE #( FOR s IN it_spart ( sign = 'I' option = 'EQ' low = CONV #( s ) ) ).
    SELECT m~matnr, t~maktx, m~spart, m~meins, m~brgew, m~gewei, m~prdha, m~mtart
      FROM mara AS m
      LEFT OUTER JOIN makt AS t ON t~matnr = m~matnr AND t~spras = 'E'
      WHERE m~matnr IN @lr_matnr AND m~spart IN @lr_spart AND m~lvorm = @space
      ORDER BY m~matnr
      INTO TABLE @DATA(lt_m).
    IF lt_m IS INITIAL.
      RETURN.
    ENDIF.
    " case pack = base units in one KAR (else CS): MARM-UMREZ / UMREN
    SELECT matnr, meinh, umrez, umren FROM marm
      FOR ALL ENTRIES IN @lt_m
      WHERE matnr = @lt_m-matnr AND meinh IN ( 'KAR', 'CS' )
      INTO TABLE @DATA(lt_u).
    SORT lt_u BY matnr meinh.
    LOOP AT lt_m INTO DATA(ls_m).
      DATA(ls_o) = VALUE zcl_tms_ty=>ts_dpmaterial( matnr = mat_out( ls_m-matnr ) maktx = ls_m-maktx spart = ls_m-spart meins = ls_m-meins
                                                    brgew = ls_m-brgew gewei = ls_m-gewei brand = ls_m-prdha mtart = ls_m-mtart ).
      " KAR sorts before CS: the first hit wins
      READ TABLE lt_u INTO DATA(ls_u) WITH KEY matnr = ls_m-matnr BINARY SEARCH.
      IF sy-subrc = 0 AND ls_u-umren > 0.
        ls_o-casepack = ls_u-umrez / ls_u-umren.
      ENDIF.
      APPEND ls_o TO rt_mat.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_stock.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    SELECT matnr, werks, SUM( labst ) AS unr, SUM( insme ) AS qi
      FROM mard
      WHERE werks IN @lr_werks AND matnr IN @lr_matnr
      GROUP BY matnr, werks
      INTO TABLE @DATA(lt_s).
    " in transit / transfer stock lives on the plant segment
    SELECT matnr, werks, trame, umlmc FROM marc
      WHERE werks IN @lr_werks AND matnr IN @lr_matnr AND ( trame > 0 OR umlmc > 0 )
      INTO TABLE @DATA(lt_c).
    DATA lt_idx TYPE SORTED TABLE OF zcl_tms_ty=>ts_dpstock WITH UNIQUE KEY matnr werks.
    LOOP AT lt_s INTO DATA(ls_s).
      INSERT VALUE #( matnr = mat_out( ls_s-matnr ) werks = ls_s-werks unr = ls_s-unr qi = ls_s-qi ) INTO TABLE lt_idx.
    ENDLOOP.
    LOOP AT lt_c INTO DATA(ls_c).
      DATA(lv_m) = mat_out( ls_c-matnr ).
      ASSIGN lt_idx[ matnr = lv_m werks = ls_c-werks ] TO FIELD-SYMBOL(<fs>).
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = lv_m werks = ls_c-werks ) INTO TABLE lt_idx ASSIGNING <fs>.
      ENDIF.
      <fs>-git = <fs>-git + ls_c-trame + ls_c-umlmc.
    ENDLOOP.
    LOOP AT lt_idx INTO DATA(ls_i) WHERE unr <> 0 OR git <> 0 OR qi <> 0.
      APPEND ls_i TO rt_stk.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_lots.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    " unrestricted batch stock with manufacture / expiry dates (MCH1); lots without stock are left out
    SELECT b~matnr, b~werks, b~charg, SUM( b~clabs ) AS unr, c~hsdat, c~vfdat
      FROM mchb AS b
      LEFT OUTER JOIN mch1 AS c ON c~matnr = b~matnr AND c~charg = b~charg
      WHERE b~werks IN @lr_werks AND b~matnr IN @lr_matnr
      GROUP BY b~matnr, b~werks, b~charg, c~hsdat, c~vfdat
      HAVING SUM( b~clabs ) > 0
      ORDER BY b~matnr, b~werks, b~charg
      INTO TABLE @DATA(lt_l).
    LOOP AT lt_l INTO DATA(ls_l).
      DATA(ls_o) = VALUE zcl_tms_ty=>ts_dplot( matnr = mat_out( ls_l-matnr ) werks = ls_l-werks charg = ls_l-charg hsdat = ls_l-hsdat vfdat = ls_l-vfdat unr = ls_l-unr ).
      " LifePct = remaining shelf life as % of total (0 = expired, -1 = no expiry date: treated as fresh by the planner)
      IF ls_l-vfdat IS INITIAL OR ls_l-hsdat IS INITIAL OR ls_l-vfdat <= ls_l-hsdat.
        ls_o-lifepct = COND #( WHEN ls_l-vfdat IS NOT INITIAL AND ls_l-vfdat <= sy-datum THEN 0 ELSE -1 ).
      ELSEIF ls_l-vfdat <= sy-datum.
        ls_o-lifepct = 0.
      ELSE.
        DATA(lv_pct) = CONV decfloat34( ( ls_l-vfdat - sy-datum ) * 100 ) / ( ls_l-vfdat - ls_l-hsdat ).
        ls_o-lifepct = nmin( val1 = lv_pct val2 = 100 ).
      ENDIF.
      APPEND ls_o TO rt_lot.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_sto.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_reswk) = werks_range( it_reswk ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    " stock transport orders (EKKO-BSAKZ = 'T') not yet put on a delivery: scheduled qty minus EKET-GLMNG (quantity of deliveries created, verified on EDS)
    SELECT p~matnr, k~reswk, p~werks, SUM( e~menge ) AS q_ord, SUM( e~glmng ) AS q_iss
      FROM ekko AS k
      INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      INNER JOIN eket AS e ON e~ebeln = p~ebeln AND e~ebelp = p~ebelp
      WHERE k~bsakz = 'T' AND p~loekz = @space AND p~elikz = @space
        AND p~werks IN @lr_werks AND k~reswk IN @lr_reswk AND p~matnr IN @lr_matnr
      GROUP BY p~matnr, k~reswk, p~werks
      ORDER BY p~matnr, k~reswk, p~werks
      INTO TABLE @DATA(lt_o).
    LOOP AT lt_o INTO DATA(ls_o).
      IF ls_o-q_ord <= ls_o-q_iss.
        CONTINUE.
      ENDIF.
      APPEND VALUE #( matnr = mat_out( ls_o-matnr ) reswk = ls_o-reswk werks = ls_o-werks openqty = ls_o-q_ord - ls_o-q_iss ) TO rt_sto.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_open_orders.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_vtweg) = vtweg_range( it_vtweg ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    DATA(lv_from) = CONV d( sy-datum - c_open_order_days ).
    " order items without a rejection reason, in base unit; customer group from the header business data VBKD (posnr 000000)
    SELECT p~vbeln, p~posnr, p~matnr, p~werks, h~vtweg, d~kdgrp, p~kwmeng, p~umvkz, p~umvkn
      FROM vbap AS p
      INNER JOIN vbak AS h ON h~vbeln = p~vbeln
      LEFT OUTER JOIN vbkd AS d ON d~vbeln = p~vbeln AND d~posnr = '000000'
      WHERE h~vbtyp = 'C' AND h~erdat >= @lv_from AND p~abgru = @space
        AND p~werks IN @lr_werks AND h~vtweg IN @lr_vtweg AND p~matnr IN @lr_matnr
      INTO TABLE @DATA(lt_i).
    IF lt_i IS INITIAL.
      RETURN.
    ENDIF.
    " already invoiced (base unit): invoices (M) less cancellations (N) in the document flow
    " vbeln / posnn are selected only to keep identical rows apart: FOR ALL ENTRIES would otherwise drop duplicates (two equal invoices = one)
    SELECT vbelv, posnv, vbeln, posnn, vbtyp_n, rfmng FROM vbfa
      FOR ALL ENTRIES IN @lt_i
      WHERE vbelv = @lt_i-vbeln AND posnv = @lt_i-posnr AND vbtyp_n IN ( 'M', 'N' )
      INTO TABLE @DATA(lt_f).
    SORT lt_f BY vbelv posnv.
    TYPES: BEGIN OF ty_k, matnr TYPE matnr, werks TYPE werks_d, vtweg TYPE vtweg, kdgrp TYPE kdgrp, qty TYPE p LENGTH 15 DECIMALS 3, END OF ty_k.
    DATA lt_k TYPE SORTED TABLE OF ty_k WITH UNIQUE KEY matnr werks vtweg kdgrp.
    LOOP AT lt_i INTO DATA(ls_i).
      DATA(lv_ord) = COND decfloat34( WHEN ls_i-umvkn > 0 THEN ls_i-kwmeng * ls_i-umvkz / ls_i-umvkn ELSE ls_i-kwmeng ).
      DATA(lv_inv) = CONV decfloat34( 0 ).
      READ TABLE lt_f TRANSPORTING NO FIELDS WITH KEY vbelv = ls_i-vbeln posnv = ls_i-posnr BINARY SEARCH.
      IF sy-subrc = 0.
        LOOP AT lt_f INTO DATA(ls_f) FROM sy-tabix.
          IF ls_f-vbelv <> ls_i-vbeln OR ls_f-posnv <> ls_i-posnr.
            EXIT.
          ENDIF.
          lv_inv = lv_inv + COND decfloat34( WHEN ls_f-vbtyp_n = 'N' THEN - ls_f-rfmng ELSE ls_f-rfmng ).
        ENDLOOP.
      ENDIF.
      IF lv_ord <= lv_inv.
        CONTINUE.
      ENDIF.
      ASSIGN lt_k[ matnr = ls_i-matnr werks = ls_i-werks vtweg = ls_i-vtweg kdgrp = ls_i-kdgrp ] TO FIELD-SYMBOL(<k>).
      IF sy-subrc <> 0.
        INSERT VALUE #( matnr = ls_i-matnr werks = ls_i-werks vtweg = ls_i-vtweg kdgrp = ls_i-kdgrp ) INTO TABLE lt_k ASSIGNING <k>.
      ENDIF.
      <k>-qty = <k>-qty + lv_ord - lv_inv.
    ENDLOOP.
    LOOP AT lt_k INTO DATA(ls_k).
      APPEND VALUE #( matnr = mat_out( ls_k-matnr ) werks = ls_k-werks vtweg = ls_k-vtweg kdgrp = ls_k-kdgrp openqty = ls_k-qty ) TO rt_oo.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_sales.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_vtweg) = vtweg_range( it_vtweg ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    " invoiced quantity in the stockkeeping unit (VBRP-FKLMG), invoices only (VBTYP M), cancelled ones excluded, summed by day
    SELECT k~fkdat, p~matnr, p~werks, k~vtweg, SUM( p~fklmg ) AS qty
      FROM vbrp AS p
      INNER JOIN vbrk AS k ON k~vbeln = p~vbeln
      WHERE k~fkdat >= @iv_from AND k~fkdat <= @iv_to AND k~vbtyp = 'M' AND k~fksto = @space
        AND p~werks IN @lr_werks AND k~vtweg IN @lr_vtweg AND p~matnr IN @lr_matnr
      GROUP BY k~fkdat, p~matnr, p~werks, k~vtweg
      ORDER BY k~fkdat, p~matnr, p~werks, k~vtweg
      INTO TABLE @DATA(lt_s).
    LOOP AT lt_s INTO DATA(ls_s).
      APPEND VALUE #( datum = ls_s-fkdat matnr = mat_out( ls_s-matnr ) werks = ls_s-werks vtweg = ls_s-vtweg qty = ls_s-qty ) TO rt_sale.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_transit.
    DATA(lr_werks) = werks_range( it_werks ).
    DATA(lr_swerks) = werks_range( it_swerks ).
    DATA(lr_matnr) = mat_range( it_matnr ).
    DATA(lv_since) = CONV d( sy-datum - c_transit_days ).
    " Stock on the road = quantity of goods-issued STO deliveries (LIKP-WADAT_IST set) not yet received (EKET-WEMNG). EKET-GLMNG is NOT used: it counts
    " every delivery CREATED, issued or not (verified on EDS). Only orders of the last c_transit_days days: older unreceived lines are stale data.
    SELECT p~ebeln, p~ebelp, p~matnr, k~reswk, p~werks, SUM( e~glmng ) AS q_iss, SUM( e~wemng ) AS q_rec
      FROM ekko AS k
      INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      INNER JOIN eket AS e ON e~ebeln = p~ebeln AND e~ebelp = p~ebelp
      WHERE k~bsakz = 'T' AND k~bedat >= @lv_since AND p~loekz = @space
        AND k~reswk IN @lr_swerks AND p~werks IN @lr_werks AND p~matnr IN @lr_matnr
      GROUP BY p~ebeln, p~ebelp, p~matnr, k~reswk, p~werks
      INTO TABLE @DATA(lt_po).
    LOOP AT lt_po INTO DATA(ls_chk).
      IF ls_chk-q_iss <= ls_chk-q_rec.
        DELETE lt_po.
      ENDIF.
    ENDLOOP.
    IF lt_po IS INITIAL.
      RETURN.
    ENDIF.
    TYPES: BEGIN OF ty_key, vgbel TYPE vgbel, vgpos TYPE vgpos, END OF ty_key.
    DATA lt_key TYPE STANDARD TABLE OF ty_key WITH DEFAULT KEY.
    LOOP AT lt_po INTO DATA(ls_k).
      APPEND VALUE #( vgbel = ls_k-ebeln vgpos = |{ ls_k-ebelp ALPHA = IN }| ) TO lt_key.
    ENDLOOP.
    " the deliveries that issued them (goods issue posted), newest first (posnr keeps batch-split items apart under FOR ALL ENTRIES)
    SELECT i~vbeln, i~posnr, i~vgbel, i~vgpos, i~lgmng, l~wadat_ist
      FROM lips AS i
      INNER JOIN likp AS l ON l~vbeln = i~vbeln
      FOR ALL ENTRIES IN @lt_key
      WHERE i~vgbel = @lt_key-vgbel AND i~vgpos = @lt_key-vgpos AND i~vgtyp = 'V' AND l~wadat_ist <> '00000000'
      INTO TABLE @DATA(lt_d).
    SORT lt_d BY wadat_ist DESCENDING vbeln DESCENDING.
    " shipment and transporter of those deliveries
    TYPES: BEGIN OF ty_tr, vbeln TYPE vbeln_vl, tknum TYPE tknum, signi TYPE signi, name1 TYPE name1_gp, END OF ty_tr.
    DATA lt_tr TYPE SORTED TABLE OF ty_tr WITH UNIQUE KEY vbeln.
    IF lt_d IS NOT INITIAL.
      SELECT p~vbeln, k~tknum, k~signi, a~name1
        FROM vttp AS p
        INNER JOIN vttk AS k ON k~tknum = p~tknum
        LEFT OUTER JOIN lfa1 AS a ON a~lifnr = k~tdlnr
        FOR ALL ENTRIES IN @lt_d
        WHERE p~vbeln = @lt_d-vbeln
        INTO TABLE @DATA(lt_t).
      LOOP AT lt_t INTO DATA(ls_t0).
        INSERT VALUE #( vbeln = ls_t0-vbeln tknum = ls_t0-tknum signi = ls_t0-signi name1 = ls_t0-name1 ) INTO TABLE lt_tr.
      ENDLOOP.
    ENDIF.
    " give every PO line's open in-transit qty to its newest deliveries until it is covered; one row per delivery x material
    LOOP AT lt_po INTO DATA(ls_p).
      DATA(lv_vgpos) = CONV vgpos( |{ ls_p-ebelp ALPHA = IN }| ).
      " goods-issued quantity of this order line (deliveries with goods issue posted) less what the receiving plant has booked
      DATA(lv_pgi) = CONV decfloat34( 0 ).
      LOOP AT lt_d INTO DATA(ls_g) WHERE vgbel = ls_p-ebeln AND vgpos = lv_vgpos.
        lv_pgi = lv_pgi + ls_g-lgmng.
      ENDLOOP.
      DATA(lv_left) = lv_pgi - ls_p-q_rec.
      LOOP AT lt_d INTO DATA(ls_d) WHERE vgbel = ls_p-ebeln AND vgpos = lv_vgpos.
        IF lv_left <= 0.
          EXIT.
        ENDIF.
        DATA(lv_q) = nmin( val1 = lv_left val2 = CONV decfloat34( ls_d-lgmng ) ).
        IF lv_q <= 0.
          CONTINUE.
        ENDIF.
        lv_left = lv_left - lv_q.
        DATA(lv_mat) = mat_out( ls_p-matnr ).
        READ TABLE rt_tr ASSIGNING FIELD-SYMBOL(<r>) WITH KEY vbeln = ls_d-vbeln matnr = lv_mat.
        IF sy-subrc = 0.
          <r>-qty = <r>-qty + lv_q.
        ELSE.
          DATA(ls_o) = VALUE zcl_tms_ty=>ts_dptransit( vbeln = ls_d-vbeln matnr = lv_mat swerks = ls_p-reswk werks = ls_p-werks qty = lv_q budat = ls_d-wadat_ist ).
          READ TABLE lt_tr INTO DATA(ls_s) WITH KEY vbeln = ls_d-vbeln.
          IF sy-subrc = 0.
            ls_o-tknum = ls_s-tknum.
            ls_o-transporter = ls_s-name1.
            ls_o-vehicle = ls_s-signi.
          ENDIF.
          APPEND ls_o TO rt_tr.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    SORT rt_tr BY vbeln matnr.
  ENDMETHOD.

ENDCLASS.
