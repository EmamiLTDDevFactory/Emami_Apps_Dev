CLASS zcl_mm_rigid_cost DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "! Read-only version of transaction ZRIGID (program ZMM_MOLD_INFO_RECORD): the bottom-up rate of a rigid packing item per mould and vendor.
    "! Nothing is posted: no info record (ME_INFORECORD_MAINTAIN) and no write to ZMM_RIGID_COST. Formulas are those of the program (per 1000 pieces).
    "! Rows (ZRIGID_S_ROW): F = the item has moulds, M = one per mould x vendor (rate build-up), B = BOM components of an M row,
    "! D = budget (ZCOMPONENT), P = packing budget build-up (ZPKG_BUD_ITEM), H = rates saved by earlier ZRIGID runs (ZMM_RIGID_COST).
    TYPES tt_row TYPE STANDARD TABLE OF zrigid_s_row WITH DEFAULT KEY.
    TYPES: ty_r_matnr TYPE RANGE OF matnr,
           ty_r_werks TYPE RANGE OF werks_d.
    METHODS constructor IMPORTING it_matnr TYPE ty_r_matnr
                                  it_werks TYPE ty_r_werks OPTIONAL
                                  iv_gjahr TYPE gjahr OPTIONAL.
    METHODS flags   RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS calc    RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS budget  RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS history RETURNING VALUE(rt_rows) TYPE tt_row.
    "! U = the rigid items (with a mould) whose BOM uses the given polymer / master batch: for the "what if the polymer rate changes" view
    METHODS usage   RETURNING VALUE(rt_rows) TYPE tt_row.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_g,
             mblnr        TYPE mblnr,
             mjahr        TYPE mjahr,
             zeile        TYPE mblpo,
             charg        TYPE charg_d,
             bwart        TYPE bwart,
             smbln        TYPE mblnr,
             mach_name    TYPE migo_badi_exampl-mach_name,
             fac_prod     TYPE migo_badi_exampl-fac_prod,
             hours_day    TYPE migo_badi_exampl-hours_day,
             matnr        TYPE matnr,
             subcon_lifnr TYPE lifnr,
             cyc_time     TYPE migo_badi_exampl-cyc_time,
             run_cavity   TYPE migo_badi_exampl-run_cavity,
             budat        TYPE budat,
           END OF ty_g,
           tt_g TYPE STANDARD TABLE OF ty_g WITH DEFAULT KEY.
    DATA: mr_matnr TYPE ty_r_matnr,
          mr_werks TYPE ty_r_werks,
          mv_gjahr TYPE gjahr,
          mv_id    TYPE i.
    METHODS net_rev IMPORTING iv_pos TYPE bwart iv_neg TYPE bwart CHANGING ct TYPE tt_g.
    METHODS next_id RETURNING VALUE(rv) TYPE char12.
    METHODS msg_row IMPORTING iv_matnr TYPE matnr iv_mould TYPE matnr OPTIONAL iv_msg TYPE csequence RETURNING VALUE(rs) TYPE zrigid_s_row.
ENDCLASS.


CLASS zcl_mm_rigid_cost IMPLEMENTATION.

  METHOD constructor.
    mr_matnr = it_matnr. mr_werks = it_werks. mv_gjahr = iv_gjahr.
    LOOP AT mr_matnr ASSIGNING FIELD-SYMBOL(<m>).
      <m>-low = |{ <m>-low ALPHA = IN }|.
      IF <m>-high IS NOT INITIAL. <m>-high = |{ <m>-high ALPHA = IN }|. ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD next_id.
    mv_id = mv_id + 1.
    rv = |{ mv_id WIDTH = 12 ALIGN = RIGHT PAD = '0' }|.
  ENDMETHOD.

  METHOD msg_row.
    rs-grain = 'M'. rs-rowid = next_id( ). rs-matnr = iv_matnr. rs-mould = iv_mould. rs-flag = 'ERR'. rs-msg = iv_msg.
  ENDMETHOD.

  METHOD net_rev.
    LOOP AT ct ASSIGNING FIELD-SYMBOL(<n>) WHERE bwart = iv_neg.
      DATA(lv_pos) = <n>-smbln.
      DELETE ct WHERE mblnr = lv_pos AND bwart = iv_pos.
    ENDLOOP.
    DELETE ct WHERE bwart = iv_neg.
  ENDMETHOD.

  METHOD flags.
    DATA ls_r TYPE zrigid_s_row.
    SELECT a~matnr, a~mold_matnr, a~knumh FROM a819 AS a WHERE a~matnr IN @mr_matnr AND a~datbi = '99991231' INTO TABLE @DATA(lt_a).
    IF lt_a IS INITIAL. RETURN. ENDIF.
    SELECT knumh FROM konp FOR ALL ENTRIES IN @lt_a WHERE knumh = @lt_a-knumh AND loevm_ko = 'X' INTO TABLE @DATA(lt_del).
    LOOP AT lt_del INTO DATA(ls_d).
      DELETE lt_a WHERE knumh = ls_d-knumh.
    ENDLOOP.
    SORT lt_a BY matnr mold_matnr.
    LOOP AT lt_a ASSIGNING FIELD-SYMBOL(<a>) GROUP BY <a>-matnr ASSIGNING FIELD-SYMBOL(<g>).
      CLEAR ls_r.
      ls_r-grain = 'F'. ls_r-rowid = next_id( ). ls_r-matnr = <g>.
      ls_r-flag = 'RIGID'.
      LOOP AT GROUP <g> ASSIGNING FIELD-SYMBOL(<x>).
        ls_r-nmould = ls_r-nmould + 1.
      ENDLOOP.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD calc.
    DATA: ls_r    TYPE zrigid_s_row,
          lt_g2   TYPE tt_g,
          lt_g3   TYPE tt_g,
          lv_land TYPE j_1itaxvar-j_1itaxam1.
    DATA(lv_werks) = COND werks_d( WHEN lines( mr_werks ) > 0 THEN mr_werks[ 1 ]-low ).
    IF lv_werks IS INITIAL.
      APPEND msg_row( iv_matnr = COND #( WHEN lines( mr_matnr ) > 0 THEN mr_matnr[ 1 ]-low ) iv_msg = 'Give the costing plant' ) TO rt_rows.
      RETURN.
    ENDIF.
    IF zcl_mm_bom_cost_auth=>check_plant( lv_werks ) = abap_false.
      APPEND msg_row( iv_matnr = COND #( WHEN lines( mr_matnr ) > 0 THEN mr_matnr[ 1 ]-low ) iv_msg = |Plant { lv_werks } is not authorised| ) TO rt_rows.
      RETURN.
    ENDIF.

    " ---- 1. moulds of the packing item (A819, current, not deleted)
    SELECT a~mold_matnr, a~matnr, a~knumh FROM a819 AS a WHERE a~matnr IN @mr_matnr AND a~datbi = '99991231' INTO TABLE @DATA(lt_a).
    IF lt_a IS INITIAL. RETURN. ENDIF.
    SELECT knumh FROM konp FOR ALL ENTRIES IN @lt_a WHERE knumh = @lt_a-knumh AND loevm_ko = 'X' INTO TABLE @DATA(lt_del).
    LOOP AT lt_del INTO DATA(ls_del).
      DELETE lt_a WHERE knumh = ls_del-knumh.
    ENDLOOP.
    IF lt_a IS INITIAL. RETURN. ENDIF.
    SELECT mold_matial, material_no, bom_matnr, vendor, scrap, dosage FROM zmould_mat FOR ALL ENTRIES IN @lt_a
      WHERE mold_matial = @lt_a-mold_matnr AND material_no = @lt_a-matnr AND active_ind = 'X' INTO TABLE @DATA(lt_sc).

    " ---- 2. vendor / machine data of the mould from its goods receipts (latest per mould and vendor, reversals netted)
    DATA lt_g TYPE tt_g.
    SELECT a~mblnr, a~mjahr, a~zeile, a~charg, a~bwart, a~smbln, a~mach_name, a~fac_prod, a~hours_day, a~matnr, a~subcon_lifnr, a~cyc_time, a~run_cavity, b~budat
      FROM migo_badi_exampl AS a INNER JOIN mkpf AS b ON a~mblnr = b~mblnr AND a~mjahr = b~mjahr
      FOR ALL ENTRIES IN @lt_a
      WHERE a~matnr = @lt_a-mold_matnr AND a~subcon_lifnr <> @space AND a~bwart IN ( '101', '102' )
      INTO CORRESPONDING FIELDS OF TABLE @lt_g.
    net_rev( EXPORTING iv_pos = '101' iv_neg = '102' CHANGING ct = lt_g ).
    SELECT a~mblnr, a~mjahr, a~zeile, a~charg, a~bwart, a~smbln, a~mach_name, a~fac_prod, a~hours_day, a~matnr, a~subcon_lifnr, a~cyc_time, a~run_cavity, b~budat
      FROM migo_badi_exampl AS a INNER JOIN mkpf AS b ON a~mblnr = b~mblnr AND a~mjahr = b~mjahr
      FOR ALL ENTRIES IN @lt_a
      WHERE a~matnr = @lt_a-mold_matnr AND a~subcon_lifnr <> @space AND a~bwart IN ( '561', '562' )
      INTO CORRESPONDING FIELDS OF TABLE @lt_g2.
    net_rev( EXPORTING iv_pos = '561' iv_neg = '562' CHANGING ct = lt_g2 ).
    LOOP AT lt_g2 INTO DATA(ls_g2).
      IF NOT line_exists( lt_g[ matnr = ls_g2-matnr charg = ls_g2-charg subcon_lifnr = ls_g2-subcon_lifnr ] ). APPEND ls_g2 TO lt_g. ENDIF.
    ENDLOOP.
    SELECT a~mblnr, a~mjahr, a~zeile, a~charg, a~bwart, a~smbln, a~mach_name, a~fac_prod, a~hours_day, a~matnr, a~lifnr AS subcon_lifnr, a~cyc_time, a~run_cavity, b~budat
      FROM migo_badi_exampl AS a INNER JOIN mkpf AS b ON a~mblnr = b~mblnr AND a~mjahr = b~mjahr
      FOR ALL ENTRIES IN @lt_a
      WHERE a~matnr = @lt_a-mold_matnr AND a~lifnr <> @space AND a~bwart IN ( '541', '542' )
      INTO CORRESPONDING FIELDS OF TABLE @lt_g3.
    net_rev( EXPORTING iv_pos = '541' iv_neg = '542' CHANGING ct = lt_g3 ).
    LOOP AT lt_g3 INTO DATA(ls_g3).
      IF NOT line_exists( lt_g[ matnr = ls_g3-matnr charg = ls_g3-charg subcon_lifnr = ls_g3-subcon_lifnr ] ). APPEND ls_g3 TO lt_g. ENDIF.
    ENDLOOP.
    SORT lt_g BY matnr ASCENDING subcon_lifnr ASCENDING budat DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt_g COMPARING matnr subcon_lifnr.
    IF lt_g IS INITIAL.
      LOOP AT lt_a INTO DATA(ls_a0).
        APPEND msg_row( iv_matnr = ls_a0-matnr iv_mould = ls_a0-mold_matnr iv_msg = 'GRN not done for the mould material' ) TO rt_rows.
      ENDLOOP.
      RETURN.
    ENDIF.

    " quality lot values (cavities, cycle time)
    SELECT prueflos, mblnr, mjahr, zeile FROM qamb FOR ALL ENTRIES IN @lt_g WHERE mblnr = @lt_g-mblnr AND mjahr = @lt_g-mjahr AND zeile = @lt_g-zeile INTO TABLE @DATA(lt_qamb).
    IF lt_qamb IS NOT INITIAL.
      SELECT a~prueflos, a~original_input, b~verwmerkm FROM qamr AS a INNER JOIN qamv AS b ON a~prueflos = b~prueflos AND a~vorglfnr = b~vorglfnr AND a~merknr = b~merknr
        FOR ALL ENTRIES IN @lt_qamb WHERE a~prueflos = @lt_qamb-prueflos AND b~verwmerkm IN ( 'MNQN_013', 'MNQN-022' ) INTO TABLE @DATA(lt_lot).
    ENDIF.
    SELECT lifnr, name1 FROM lfa1 FOR ALL ENTRIES IN @lt_g WHERE lifnr = @lt_g-subcon_lifnr INTO TABLE @DATA(lt_lfa).
    " conversion (machine day) rate: A815 by vendor and machine
    SELECT knumh, lifnr, code FROM a815 FOR ALL ENTRIES IN @lt_g WHERE lifnr = @lt_g-subcon_lifnr AND code = @lt_g-mach_name AND kschl = 'ZMRT' AND datbi = '99991231' INTO TABLE @DATA(lt_815).
    IF lt_815 IS NOT INITIAL.
      SELECT knumh, kschl, kbetr FROM konp FOR ALL ENTRIES IN @lt_815 WHERE knumh = @lt_815-knumh AND loevm_ko = @space INTO TABLE @DATA(lt_k815).
    ENDIF.

    " ---- 3. BOM of the packing item and the master batch / polymer rates
    SELECT matnr, werks, idnrk, menge FROM zbomact FOR ALL ENTRIES IN @lt_a WHERE matnr = @lt_a-matnr AND stlst = '01' AND stlan = '9' AND werks = @lv_werks INTO TABLE @DATA(lt_bom).
    IF lt_bom IS NOT INITIAL.
      SELECT matnr, werks, idnrk, menge FROM zbomact FOR ALL ENTRIES IN @lt_bom WHERE matnr = @lt_bom-idnrk AND werks = @lv_werks AND stlst = '01' AND stlan = '9' INTO TABLE @DATA(lt_bom_d).
      SELECT knumh, matnr, lifnr FROM a816 FOR ALL ENTRIES IN @lt_bom WHERE matnr = @lt_bom-idnrk AND kschl = 'ZPBR' AND datbi = '99991231' INTO TABLE @DATA(lt_816).
      IF lt_bom_d IS NOT INITIAL.
        SELECT knumh, matnr, lifnr FROM a816 FOR ALL ENTRIES IN @lt_bom_d WHERE matnr = @lt_bom_d-idnrk AND kschl = 'ZPBR' AND datbi = '99991231' APPENDING TABLE @lt_816.
      ENDIF.
      IF lt_816 IS NOT INITIAL.
        SELECT knumh, kschl, kbetr FROM konp FOR ALL ENTRIES IN @lt_816 WHERE knumh = @lt_816-knumh AND loevm_ko = @space INTO TABLE @DATA(lt_k816).
      ENDIF.
    ENDIF.
    " freight A818, box / packing / margin A363
    SELECT knumh, matnr, lifnr, werks FROM a818 FOR ALL ENTRIES IN @lt_a WHERE matnr = @lt_a-matnr AND werks = @lv_werks AND kschl = 'ZMFG' AND datbi = '99991231' INTO TABLE @DATA(lt_818).
    IF lt_818 IS NOT INITIAL.
      SELECT knumh, kschl, kbetr FROM konp FOR ALL ENTRIES IN @lt_818 WHERE knumh = @lt_818-knumh AND kschl = 'ZMFG' AND loevm_ko = @space INTO TABLE @DATA(lt_k818).
    ENDIF.
    SELECT knumh, matnr, lifnr FROM a363 FOR ALL ENTRIES IN @lt_a WHERE matnr = @lt_a-matnr AND kschl = 'ZMBX' AND datbi = '99991231' AND werks = @lv_werks INTO TABLE @DATA(lt_363).
    IF lt_363 IS NOT INITIAL.
      SELECT knumh, kschl, kbetr FROM konp FOR ALL ENTRIES IN @lt_363 WHERE knumh = @lt_363-knumh AND loevm_ko = @space INTO TABLE @DATA(lt_k363).
    ENDIF.
    SELECT knumh, matnr, lifnr FROM a363 FOR ALL ENTRIES IN @lt_a WHERE matnr = @lt_a-matnr AND kschl = 'ZPPB' AND datbi = '99991231' AND werks = @lv_werks INTO TABLE @DATA(lt_ppb).
    IF lt_ppb IS NOT INITIAL.
      SELECT knumh, kschl, kbetr FROM konp FOR ALL ENTRIES IN @lt_ppb WHERE knumh = @lt_ppb-knumh AND loevm_ko = @space INTO TABLE @DATA(lt_kppb).
    ENDIF.

    " ---- 4. one M row per mould x vendor, B rows for its BOM components
    LOOP AT lt_a INTO DATA(ls_a).
      LOOP AT lt_g INTO DATA(ls_g) WHERE matnr = ls_a-mold_matnr.
        CLEAR ls_r.
        ls_r-grain = 'M'. ls_r-rowid = next_id( ). ls_r-matnr = ls_a-matnr. ls_r-werks = lv_werks. ls_r-mould = ls_a-mold_matnr. ls_r-lifnr = ls_g-subcon_lifnr.
        ls_r-mach = ls_g-mach_name. ls_r-valid_from = ls_g-budat.
        SELECT SINGLE maktx FROM makt WHERE matnr = @ls_a-matnr AND spras = @sy-langu INTO @ls_r-maktx.
        SELECT SINGLE maktx FROM makt WHERE matnr = @ls_a-mold_matnr AND spras = @sy-langu INTO @ls_r-mould_txt.
        SELECT SINGLE ntgew, gewei FROM mara WHERE matnr = @ls_a-matnr INTO ( @ls_r-ntgew, @ls_r-gewei ).
        SELECT SINGLE zzmds_code, zzanln1, zzmold_cat FROM mara WHERE matnr = @ls_a-mold_matnr INTO @DATA(ls_mm).
        ls_r-mds = ls_mm-zzmds_code.
        IF ls_mm-zzmds_code IS NOT INITIAL.
          SELECT SINGLE description FROM zmm_mold_design WHERE code = @ls_mm-zzmds_code INTO @ls_r-design.
          SELECT COUNT(*) FROM mara WHERE zzmds_code = @ls_mm-zzmds_code INTO @ls_r-nmould.
        ENDIF.
        ls_r-mcat = ls_mm-zzmold_cat.
        SELECT SINGLE description FROM zmm_mold_cat WHERE mold_cat = @ls_mm-zzmold_cat INTO @ls_r-mcat_txt.
        IF ls_mm-zzanln1 IS NOT INITIAL.
          SELECT SINGLE zujhr FROM anla WHERE anln1 = @ls_mm-zzanln1 AND bukrs = '1000' INTO @DATA(lv_zujhr).
          ls_r-zujhr = lv_zujhr.
          SELECT answl, nafag FROM anlc WHERE anln1 = @ls_mm-zzanln1 AND bukrs = '1000' AND afabe = '01' INTO TABLE @DATA(lt_anlc).
          LOOP AT lt_anlc INTO DATA(ls_anlc).
            IF ls_anlc-answl IS NOT INITIAL AND ls_r-kansw IS INITIAL. ls_r-kansw = ls_anlc-answl. ENDIF.
            ls_r-nafag = ls_r-nafag - ls_anlc-nafag.
          ENDLOOP.
        ENDIF.
        IF line_exists( lt_lfa[ lifnr = ls_g-subcon_lifnr ] ). ls_r-vendor = lt_lfa[ lifnr = ls_g-subcon_lifnr ]-name1. ENDIF.
        SELECT SINGLE description FROM zmm_mold_mach_n WHERE code = @ls_g-mach_name INTO @ls_r-mach_txt.

        " cavities and cycle time: quality lot of the receipt first, else the receipt itself
        ls_r-run_cavity = ls_g-run_cavity. ls_r-cyc_time = ls_g-cyc_time.
        LOOP AT lt_qamb INTO DATA(ls_qb) WHERE mblnr = ls_g-mblnr AND mjahr = ls_g-mjahr AND zeile = ls_g-zeile.
          LOOP AT lt_lot INTO DATA(ls_lot) WHERE prueflos = ls_qb-prueflos.
            IF ls_lot-verwmerkm = 'MNQN-022' AND ls_lot-original_input IS NOT INITIAL. ls_r-run_cavity = ls_lot-original_input. ENDIF.
            IF ls_lot-verwmerkm = 'MNQN_013' AND ls_lot-original_input IS NOT INITIAL. ls_r-cyc_time = ls_lot-original_input. ENDIF.
          ENDLOOP.
        ENDLOOP.
        ls_r-hours_day = ls_g-hours_day. ls_r-fac_prod = ls_g-fac_prod.
        IF ls_r-cyc_time > 0.
          ls_r-tot_out = ( ( ls_r-hours_day * 3600 ) * ( ls_r-fac_prod / 100 ) ) / ls_r-cyc_time * ls_r-run_cavity.
        ENDIF.
        ls_r-tot_out_mon = ls_r-tot_out * 24.      " as in the program (24 days)

        " conversion
        IF line_exists( lt_815[ lifnr = ls_g-subcon_lifnr code = ls_g-mach_name ] ).
          DATA(lv_k815) = lt_815[ lifnr = ls_g-subcon_lifnr code = ls_g-mach_name ]-knumh.
          LOOP AT lt_k815 INTO DATA(ls_k1) WHERE knumh = lv_k815 AND kschl = 'ZMRT'.
            ls_r-zmrt = ls_k1-kbetr.
          ENDLOOP.
        ENDIF.
        IF ls_r-tot_out > 0. ls_r-conv_cost = ls_r-zmrt / ls_r-tot_out * 1000. ENDIF.

        " box / packing / margin conditions of the item and vendor
        IF line_exists( lt_363[ lifnr = ls_g-subcon_lifnr matnr = ls_a-matnr ] ).
          DATA(lv_k363) = lt_363[ lifnr = ls_g-subcon_lifnr matnr = ls_a-matnr ]-knumh.
          LOOP AT lt_k363 INTO DATA(ls_k3) WHERE knumh = lv_k363.
            CASE ls_k3-kschl.
              WHEN 'ZMBX'. ls_r-zmbx = ls_k3-kbetr.
              WHEN 'ZMPB'. ls_r-zmpb = ls_k3-kbetr.
              WHEN 'ZMTP'. ls_r-zmtp = ls_k3-kbetr.
              WHEN 'ZMAC'. ls_r-zmac = ls_k3-kbetr.
              WHEN 'ZMAT'. ls_r-zmat = ls_k3-kbetr.
              WHEN 'ZITC'. ls_r-zitc = ls_k3-kbetr / 10.
              WHEN 'ZMAR'. ls_r-zmar = ls_k3-kbetr / 10.
              WHEN 'ZEHP'. ls_r-zehp = ls_k3-kbetr.
              WHEN 'ZWAD'. ls_r-zwad = ls_k3-kbetr.
              WHEN 'ZDAJ'. ls_r-zdaj = ls_k3-kbetr * -1.
            ENDCASE.
          ENDLOOP.
        ENDIF.
        DATA(lv_mpbp) = CONV decfloat34( 0 ). DATA(lv_mtpp) = CONV decfloat34( 0 ).
        IF line_exists( lt_ppb[ lifnr = ls_g-subcon_lifnr matnr = ls_a-matnr ] ).
          DATA(lv_kppb) = lt_ppb[ lifnr = ls_g-subcon_lifnr matnr = ls_a-matnr ]-knumh.
          LOOP AT lt_kppb INTO DATA(ls_k4) WHERE knumh = lv_kppb.
            CASE ls_k4-kschl.
              WHEN 'ZPPB'. ls_r-zppb = ls_k4-kbetr.
              WHEN 'ZMPB'. lv_mpbp = ls_k4-kbetr.
              WHEN 'ZMTP'. lv_mtpp = ls_k4-kbetr.
            ENDCASE.
          ENDLOOP.
          ls_r-zppb_t = ls_r-zppb + lv_mpbp + lv_mtpp.
        ENDIF.

        " material cost: BOM quantity (+ scrap) x polymer rate ZPBR of the vendor
        DATA(lv_tot_menge) = CONV decfloat34( 0 ). DATA(lv_zpbr) = CONV decfloat34( 0 ).
        DATA(lt_bl) = VALUE tt_row( ).
        LOOP AT lt_bom INTO DATA(ls_bom) WHERE matnr = ls_a-matnr.
          lv_tot_menge = lv_tot_menge + ls_bom-menge.
        ENDLOOP.
        LOOP AT lt_bom INTO ls_bom WHERE matnr = ls_a-matnr.
          DATA(ls_b) = VALUE zrigid_s_row( grain = 'B' matnr = ls_a-matnr mould = ls_a-mold_matnr lifnr = ls_g-subcon_lifnr werks = lv_werks comp = ls_bom-idnrk bom_qty = ls_bom-menge ).
          ls_b-rowid = next_id( ).
          SELECT SINGLE maktx FROM makt WHERE matnr = @ls_bom-idnrk AND spras = @sy-langu INTO @ls_b-comp_txt.
          ls_b-comp_qty = ls_bom-menge.
          IF line_exists( lt_sc[ mold_matial = ls_a-mold_matnr material_no = ls_a-matnr bom_matnr = ls_bom-idnrk vendor = ls_g-subcon_lifnr ] ).
            DATA(ls_sc) = lt_sc[ mold_matial = ls_a-mold_matnr material_no = ls_a-matnr bom_matnr = ls_bom-idnrk vendor = ls_g-subcon_lifnr ].
            ls_b-scrap_pct = ls_sc-scrap. ls_b-dos_perc_s = ls_sc-dosage.
            ls_b-comp_qty = ls_bom-menge + ( ls_bom-menge * ( ls_sc-scrap / 100 ) ).
          ENDIF.
          IF lv_tot_menge > 0. ls_b-dos_perc = ls_bom-menge / lv_tot_menge * 100. ENDIF.
          IF line_exists( lt_816[ lifnr = ls_g-subcon_lifnr matnr = ls_bom-idnrk ] ).
            DATA(lv_k816) = lt_816[ lifnr = ls_g-subcon_lifnr matnr = ls_bom-idnrk ]-knumh.
            LOOP AT lt_k816 INTO DATA(ls_k5) WHERE knumh = lv_k816.
              CASE ls_k5-kschl.
                WHEN 'ZPBR'. ls_b-zpbr = ls_k5-kbetr. ls_b-comp_cost = ls_k5-kbetr * ls_b-comp_qty. lv_zpbr = lv_zpbr + ls_b-comp_cost.
                WHEN 'ZMDS'. ls_b-zmds = ls_k5-kbetr.
                WHEN 'ZMFR'. ls_b-zmfr = ls_k5-kbetr.
              ENDCASE.
            ENDLOOP.
          ENDIF.
          APPEND ls_b TO lt_bl.
        ENDLOOP.
        ls_r-mat_cost = lv_zpbr.
        ls_r-zitc = ( ( ls_r-conv_cost + ls_r-mat_cost + ls_r-zmbx + ls_r-zmpb + ls_r-zmtp + ls_r-zppb_t ) * ls_r-zitc / 100 ).
        ls_r-zmar = ( ( ls_r-conv_cost + ls_r-mat_cost + ls_r-zmbx + ls_r-zmac + ls_r-zmpb + ls_r-zmtp + ls_r-zppb_t ) * ls_r-zmar / 100 ).
        IF lv_zpbr = 0.
          ls_r-flag = 'NOBOM'. ls_r-msg = 'BOM not defined or no polymer rate (ZPBR) for the item'.
        ELSE.
          SELECT SUM( menge ) FROM eban WHERE matnr = @ls_a-matnr AND werks = @lv_werks AND loekz = @space AND statu = 'N' AND ebakz = @space INTO @ls_r-open_pr.
          IF line_exists( lt_818[ werks = lv_werks matnr = ls_a-matnr lifnr = ls_g-subcon_lifnr ] ).
            DATA(lv_k818) = lt_818[ werks = lv_werks matnr = ls_a-matnr lifnr = ls_g-subcon_lifnr ]-knumh.
            LOOP AT lt_k818 INTO DATA(ls_k6) WHERE knumh = lv_k818.
              ls_r-zmfg = ls_k6-kbetr.
            ENDLOOP.
          ENDIF.
          lv_land = lv_zpbr + ls_r-zmbx + ls_r-conv_cost + ls_r-zmfg + ls_r-zmac + ls_r-zmat + ls_r-zitc + ls_r-zmar + ls_r-zehp + ls_r-zwad + ls_r-zdaj + ls_r-zppb_t.
          CALL FUNCTION 'J_1I6_ROUND_TO_NEAREST_AMT'
            EXPORTING i_amount = lv_land
            IMPORTING e_amount = lv_land
            EXCEPTIONS OTHERS = 1.
          ls_r-land_rate = lv_land.
          ls_r-flag = 'OK'.
        ENDIF.
        APPEND ls_r TO rt_rows.
        IF ls_r-flag = 'OK'. APPEND LINES OF lt_bl TO rt_rows. ENDIF.
        CLEAR: ls_mm, lv_zujhr.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD budget.
    DATA ls_r TYPE zrigid_s_row.
    " D: the approved budget rate of the item (ZCOMPONENT), latest financial years first
    SELECT matnr, werks, gjahr, valid_from, valid_to, category, maktx, meins, epein, waers, basic, discount_amt, tax_amt, vat_amt, igst_amount, cgst_amount, sgst_utgst_amount,
           frg_amt, freight, landed, total, budqty
      FROM zcomponent WHERE matnr IN @mr_matnr AND werks IN @mr_werks
      ORDER BY gjahr DESCENDING
      INTO TABLE @DATA(lt_c) UP TO 12 ROWS.
    LOOP AT lt_c INTO DATA(ls_c).
      IF mv_gjahr IS NOT INITIAL AND ls_c-gjahr <> mv_gjahr. CONTINUE. ENDIF.
      CLEAR ls_r.
      ls_r-grain = 'D'. ls_r-rowid = next_id( ). ls_r-matnr = ls_c-matnr. ls_r-werks = ls_c-werks. ls_r-gjahr = ls_c-gjahr. ls_r-maktx = ls_c-maktx.
      ls_r-valid_from = ls_c-valid_from. ls_r-valid_to = ls_c-valid_to. ls_r-category = ls_c-category. ls_r-meins = ls_c-meins. ls_r-waers = ls_c-waers.
      ls_r-basic = ls_c-basic. ls_r-disc_amt = ls_c-discount_amt. ls_r-frg_amt = ls_c-frg_amt. ls_r-freight = ls_c-freight. ls_r-landed = ls_c-landed. ls_r-total = ls_c-total.
      ls_r-budqty = ls_c-budqty. ls_r-bom_qty = ls_c-epein.      " price unit of the budget rate
      ls_r-tax_amt = ls_c-tax_amt + ls_c-vat_amt + ls_c-igst_amount + ls_c-cgst_amount + ls_c-sgst_utgst_amount.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
    " P: the packing budget rate build-up of the latest scenario (ZPKG_BUD_ITEM)
    SELECT scen_id, matnr, werks, component_matnr, maktx, origin_grp, r_sap, r_used, f_used, cbr, cbud, br, variance_pct, landed_rate, frt_total, currency, base_uom,
           flag_norate, flag_nobom
      FROM zpkg_bud_item
      WHERE ( matnr IN @mr_matnr OR component_matnr IN @mr_matnr ) AND werks IN @mr_werks
      ORDER BY scen_id DESCENDING
      INTO TABLE @DATA(lt_p) UP TO 300 ROWS.
    IF lt_p IS NOT INITIAL.
      DATA(lv_scen) = lt_p[ 1 ]-scen_id.
      LOOP AT lt_p INTO DATA(ls_p) WHERE scen_id = lv_scen.
        CLEAR ls_r.
        ls_r-grain = 'P'. ls_r-rowid = next_id( ). ls_r-matnr = ls_p-matnr. ls_r-werks = ls_p-werks. ls_r-comp = ls_p-component_matnr. ls_r-comp_txt = ls_p-maktx.
        ls_r-origin = ls_p-origin_grp. ls_r-r_sap = ls_p-r_sap. ls_r-r_used = ls_p-r_used. ls_r-f_used = ls_p-f_used. ls_r-cbr = ls_p-cbr. ls_r-cbud = ls_p-cbud.
        ls_r-br = ls_p-br. ls_r-var_pct = ls_p-variance_pct. ls_r-landed_rate = ls_p-landed_rate. ls_r-frt_total = ls_p-frt_total. ls_r-waers = ls_p-currency.
        ls_r-meins = ls_p-base_uom. ls_r-infnr = |{ lv_scen }|.
        ls_r-flag = COND #( WHEN ls_p-flag_nobom = 'X' THEN 'NOBOM' WHEN ls_p-flag_norate = 'X' THEN 'NORATE' ELSE 'OK' ).
        APPEND ls_r TO rt_rows.
      ENDLOOP.
    ENDIF.
  ENDMETHOD.

  METHOD usage.
    DATA ls_r TYPE zrigid_s_row.
    SELECT b~matnr, b~werks, b~idnrk, b~menge FROM zbomact AS b
      WHERE b~idnrk IN @mr_matnr AND b~stlst = '01' AND b~stlan = '9' AND b~werks IN @mr_werks
      INTO TABLE @DATA(lt_u) UP TO 300 ROWS.
    IF lt_u IS INITIAL. RETURN. ENDIF.
    SELECT matnr FROM a819 FOR ALL ENTRIES IN @lt_u WHERE matnr = @lt_u-matnr AND datbi = '99991231' INTO TABLE @DATA(lt_r).
    SORT lt_r BY matnr. DELETE ADJACENT DUPLICATES FROM lt_r COMPARING matnr.
    SELECT matnr, maktx FROM makt FOR ALL ENTRIES IN @lt_u WHERE matnr = @lt_u-matnr AND spras = @sy-langu INTO TABLE @DATA(lt_t).
    LOOP AT lt_u INTO DATA(ls_u).
      IF NOT line_exists( lt_r[ matnr = ls_u-matnr ] ). CONTINUE. ENDIF.
      CLEAR ls_r.
      ls_r-grain = 'U'. ls_r-rowid = next_id( ). ls_r-matnr = ls_u-matnr. ls_r-werks = ls_u-werks. ls_r-comp = ls_u-idnrk. ls_r-bom_qty = ls_u-menge.
      IF line_exists( lt_t[ matnr = ls_u-matnr ] ). ls_r-maktx = lt_t[ matnr = ls_u-matnr ]-maktx. ENDIF.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
  ENDMETHOD.

  METHOD history.
    DATA ls_r TYPE zrigid_s_row.
    SELECT p_matnr, m_matnr, lifnr, b_matnr, infnr, valid_from, valid_to, werks, ntgew, run_cavity, cyc_time, hours_day, fac_prod, zmrt, conv_cost, mat_cost, zmbx,
           zppb, zmac, zmat, zitc, zmar, zehp, zwad, zdaj, zmfg, land_rate, zpbr, uname, crt_date
      FROM zmm_rigid_cost WHERE p_matnr IN @mr_matnr AND werks IN @mr_werks
      ORDER BY valid_from DESCENDING, crt_date DESCENDING
      INTO TABLE @DATA(lt_h) UP TO 400 ROWS.
    LOOP AT lt_h INTO DATA(ls_h).
      CLEAR ls_r.
      ls_r-grain = 'H'. ls_r-rowid = next_id( ). ls_r-matnr = ls_h-p_matnr. ls_r-mould = ls_h-m_matnr. ls_r-lifnr = ls_h-lifnr. ls_r-comp = ls_h-b_matnr. ls_r-infnr = ls_h-infnr.
      ls_r-valid_from = ls_h-valid_from. ls_r-valid_to = ls_h-valid_to. ls_r-werks = ls_h-werks. ls_r-uname = ls_h-uname. ls_r-crt_date = ls_h-crt_date.
      ls_r-ntgew = ls_h-ntgew. ls_r-run_cavity = ls_h-run_cavity. ls_r-cyc_time = ls_h-cyc_time. ls_r-hours_day = ls_h-hours_day. ls_r-fac_prod = ls_h-fac_prod.
      ls_r-zmrt = ls_h-zmrt. ls_r-conv_cost = ls_h-conv_cost. ls_r-mat_cost = ls_h-mat_cost. ls_r-zmbx = ls_h-zmbx. ls_r-zppb = ls_h-zppb. ls_r-zmac = ls_h-zmac.
      ls_r-zmat = ls_h-zmat. ls_r-zitc = ls_h-zitc. ls_r-zmar = ls_h-zmar. ls_r-zehp = ls_h-zehp. ls_r-zwad = ls_h-zwad. ls_r-zdaj = ls_h-zdaj. ls_r-zmfg = ls_h-zmfg.
      ls_r-land_rate = ls_h-land_rate. ls_r-zpbr = ls_h-zpbr.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
