CLASS zcl_mm_po_variance DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    " Costing Cockpit > Variance check (PoVarSet of ZMM_BOM_COST_SRV). Read-only.
    " ORDERS ( grain O ) = tcode ZMM_PCOST (ZMM_MB31_MATERIAL_COST_PERPC): one row per ZMB31_POUTILITY receipt; cost per piece = all cost columns
    "   (consumption / trading columns as absolute values) / quantity; standard = MBEW of the batch's valuation type (MCHA), STPRS when price control S,
    "   VERPR when V; Diff % = ( standard - actual ) / standard x 100, the report's own formula and sign (negative = costlier than standard).
    "   Difference to the report: the price is divided by the price unit (PEINH), and a material without a batch record is valued with BWTAR blank.
    " COMPONENTS ( grain H / W / C ) = tcode ZMM_COST (ZAUFM_UTILITY_DETAILS2VNEW): ZCL_AUFM_UTILITY3=>get_mat_consumption_details( FERT, order, 31.12.9999,
    "   abnormal movements 'X', as ZMM_PCOST passes when it drills down ). H = the finished-good receipt (level 0), W = WIP / bulk line (opened at the next
    "   level), C = consumed component: actual rate = value / quantity against the component's MBEW price (own batch valuation type, same price-control rule).
    TYPES tt_row TYPE STANDARD TABLE OF zpovar_s_row WITH DEFAULT KEY.
    TYPES ty_r_werks TYPE RANGE OF werks_d.
    TYPES ty_r_matnr TYPE RANGE OF matnr.
    TYPES ty_r_aufnr TYPE RANGE OF aufnr.
    TYPES ty_r_ptype TYPE RANGE OF char2.
    CONSTANTS mc_max_rows TYPE i VALUE 5000.
    METHODS constructor
      IMPORTING it_werks     TYPE ty_r_werks OPTIONAL
                it_matnr     TYPE ty_r_matnr OPTIONAL
                it_aufnr     TYPE ty_r_aufnr OPTIONAL
                it_ptype     TYPE ty_r_ptype OPTIONAL
                iv_date_from TYPE dats OPTIONAL
                iv_date_to   TYPE dats OPTIONAL
                iv_date_type TYPE char1 OPTIONAL
                iv_var_pct   TYPE kbetr OPTIONAL.
    METHODS orders RETURNING VALUE(rt_rows) TYPE tt_row.
    METHODS components IMPORTING iv_aufnr TYPE aufnr RETURNING VALUE(rt_rows) TYPE tt_row.
    CLASS-METHODS category IMPORTING iv_mtart TYPE mtart iv_matkl TYPE matkl RETURNING VALUE(rv_cat) TYPE char1.
  PROTECTED SECTION.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_key, matnr TYPE matnr, werks TYPE werks_d, charg TYPE charg_d, END OF ty_key,
           tt_key TYPE STANDARD TABLE OF ty_key WITH DEFAULT KEY,
           BEGIN OF ty_price, matnr TYPE matnr, bwkey TYPE bwkey, bwtar TYPE bwtar_d, vprsv TYPE vprsv, stprs TYPE stprs, verpr TYPE verpr, peinh TYPE peinh, END OF ty_price,
           tt_price TYPE SORTED TABLE OF ty_price WITH UNIQUE KEY matnr bwkey bwtar,
           BEGIN OF ty_batch, matnr TYPE matnr, werks TYPE werks_d, charg TYPE charg_d, bwtar TYPE bwtar_d, END OF ty_batch,
           tt_batch TYPE SORTED TABLE OF ty_batch WITH UNIQUE KEY matnr werks charg,
           BEGIN OF ty_ck, matnr TYPE matnr, werks TYPE werks_d, unit TYPE decfloat34, kadky TYPE dats, status TYPE char2, klvar TYPE char4, END OF ty_ck.
    DATA: mr_werks TYPE ty_r_werks,
          mr_matnr TYPE ty_r_matnr,
          mr_aufnr TYPE ty_r_aufnr,
          mr_ptype TYPE ty_r_ptype,
          mv_from  TYPE dats,
          mv_to    TYPE dats,
          mv_dtype TYPE char1,
          mv_pct   TYPE kbetr,
          mo_ck    TYPE REF TO zcl_mm_ck_reader,
          mt_ck    TYPE HASHED TABLE OF ty_ck WITH UNIQUE KEY matnr werks.
    METHODS prices IMPORTING it_keys TYPE tt_key EXPORTING et_batch TYPE tt_batch et_price TYPE tt_price.
    METHODS value_std IMPORTING is_key TYPE ty_key it_batch TYPE tt_batch it_price TYPE tt_price CHANGING cs_row TYPE zpovar_s_row.
    " CK13N: the current standard estimate of a material and plant (ZCL_MM_CK_READER->pick, the Standard cost screen's default), per base unit
    METHODS value_ck CHANGING cs_row TYPE zpovar_s_row.
    METHODS msg_row IMPORTING iv_msg TYPE csequence iv_flag TYPE csequence DEFAULT 'MSG' RETURNING VALUE(rs_row) TYPE zpovar_s_row.
ENDCLASS.



CLASS zcl_mm_po_variance IMPLEMENTATION.

  METHOD constructor.
    mr_werks = it_werks. mr_matnr = it_matnr. mr_aufnr = it_aufnr. mr_ptype = it_ptype.
    mv_from = iv_date_from. mv_to = iv_date_to. mv_pct = iv_var_pct.
    mv_dtype = COND #( WHEN iv_date_type = 'P' THEN 'P' ELSE 'C' ).
    IF mr_ptype IS INITIAL.
      mr_ptype = VALUE #( ( sign = 'I' option = 'EQ' low = '01' ) ).
    ENDIF.
  ENDMETHOD.


  METHOD category.
    rv_cat = COND #( WHEN iv_mtart = 'VERP' OR iv_mtart = 'PKGN' THEN 'P'
                     WHEN iv_mtart = 'ROH' AND iv_matkl = '106'   THEN 'F'
                     WHEN iv_mtart = 'ROH'                        THEN 'R'
                     WHEN iv_mtart = 'WIP'                        THEN 'W'
                     ELSE 'O' ).
  ENDMETHOD.


  METHOD value_ck.
    DATA ls_c TYPE ty_ck.
    DATA lv_pct TYPE decfloat34.
    READ TABLE mt_ck INTO ls_c WITH TABLE KEY matnr = cs_row-matnr werks = cs_row-werks.
    IF sy-subrc <> 0.
      ls_c-matnr = cs_row-matnr. ls_c-werks = cs_row-werks.
      TRY.
          IF mo_ck IS INITIAL. mo_ck = NEW zcl_mm_ck_reader( NEW zcl_mm_bom_cost_util( ) ). ENDIF.
          DATA(ls_e) = mo_ck->pick( VALUE zif_mm_ck_types=>ty_par( matnr = VALUE #( ( sign = 'I' option = 'EQ' low = cs_row-matnr ) )
                                                                   werks = VALUE #( ( sign = 'I' option = 'EQ' low = cs_row-werks ) ) ) ).
          IF ls_e-k-kalnr IS NOT INITIAL.
            ls_c-unit = ls_e-unit. ls_c-kadky = ls_e-k-kadky. ls_c-status = ls_e-status. ls_c-klvar = ls_e-k-klvar.
          ENDIF.
        CATCH cx_root.
          CLEAR ls_c-unit.
      ENDTRY.
      INSERT ls_c INTO TABLE mt_ck.
    ENDIF.
    CHECK ls_c-unit IS NOT INITIAL.
    cs_row-ck_pc = ls_c-unit. cs_row-ck_kadky = ls_c-kadky. cs_row-ck_status = ls_c-status. cs_row-ck_klvar = ls_c-klvar.
    IF cs_row-act_pc IS NOT INITIAL.
      lv_pct = ( ls_c-unit - cs_row-act_pc ) / ls_c-unit * 100.
      IF abs( lv_pct ) > 99999999. lv_pct = sign( lv_pct ) * 99999999. ENDIF.
      cs_row-ck_diff_pct = lv_pct.
      cs_row-ck_var_val = ( cs_row-act_pc - ls_c-unit ) * cs_row-menge.
    ENDIF.
  ENDMETHOD.


  METHOD msg_row.
    rs_row-grain = 'M'. rs_row-flag = iv_flag. rs_row-msg = iv_msg.
  ENDMETHOD.


  METHOD prices.
    CLEAR: et_batch, et_price.
    CHECK it_keys IS NOT INITIAL.
    DATA lt_k TYPE tt_key.
    lt_k = it_keys.
    SORT lt_k BY matnr werks charg.
    DELETE ADJACENT DUPLICATES FROM lt_k COMPARING matnr werks charg.
    DATA(lt_kb) = lt_k.
    DELETE lt_kb WHERE charg IS INITIAL.
    IF lt_kb IS NOT INITIAL.
      SELECT matnr, werks, charg, bwtar FROM mcha FOR ALL ENTRIES IN @lt_kb
        WHERE matnr = @lt_kb-matnr AND werks = @lt_kb-werks AND charg = @lt_kb-charg
        INTO CORRESPONDING FIELDS OF TABLE @et_batch.
    ENDIF.
    " every valuation type of the materials and plants: the batch's own one, and blank (no batch record / not split-valuated)
    SELECT matnr, bwkey, bwtar, vprsv, stprs, verpr, peinh FROM mbew FOR ALL ENTRIES IN @lt_k
      WHERE matnr = @lt_k-matnr AND bwkey = @lt_k-werks
      INTO CORRESPONDING FIELDS OF TABLE @et_price.
  ENDMETHOD.


  METHOD value_std.
    DATA: lv_bwtar TYPE bwtar_d,
          lv_peinh TYPE decfloat34.
    READ TABLE it_batch INTO DATA(ls_b) WITH TABLE KEY matnr = is_key-matnr werks = is_key-werks charg = is_key-charg.
    IF sy-subrc = 0. lv_bwtar = ls_b-bwtar. ENDIF.
    READ TABLE it_price INTO DATA(ls_p) WITH TABLE KEY matnr = is_key-matnr bwkey = is_key-werks bwtar = lv_bwtar.
    IF sy-subrc <> 0 AND lv_bwtar IS NOT INITIAL.
      READ TABLE it_price INTO ls_p WITH TABLE KEY matnr = is_key-matnr bwkey = is_key-werks bwtar = ''.
    ENDIF.
    IF sy-subrc <> 0.
      cs_row-flag = 'NOSTD'. cs_row-msg = |No MBEW price for { is_key-matnr ALPHA = OUT } in plant { is_key-werks }|.
      RETURN.
    ENDIF.
    cs_row-bwtar = ls_p-bwtar. cs_row-vprsv = ls_p-vprsv.
    lv_peinh = COND #( WHEN ls_p-peinh > 0 THEN ls_p-peinh ELSE 1 ).
    cs_row-peinh = lv_peinh.
    cs_row-stprs = ls_p-stprs / lv_peinh.
    cs_row-verpr = ls_p-verpr / lv_peinh.
    cs_row-std_pc = COND #( WHEN ls_p-vprsv = 'S' THEN cs_row-stprs ELSE cs_row-verpr ).
    IF cs_row-std_pc IS INITIAL.
      cs_row-flag = 'NOSTD'. cs_row-msg = |MBEW price is zero for { is_key-matnr ALPHA = OUT } in plant { is_key-werks }|.
    ENDIF.
  ENDMETHOD.


  METHOD orders.
    DATA: lr_cdate TYPE RANGE OF dats,
          lr_pdate TYPE RANGE OF dats,
          lt_keys  TYPE tt_key,
          lt_denied TYPE SORTED TABLE OF werks_d WITH UNIQUE KEY table_line,
          lv_total TYPE decfloat34,
          lv_pct   TYPE decfloat34,
          lv_id    TYPE i.
    IF mr_werks IS INITIAL AND mr_matnr IS INITIAL AND mr_aufnr IS INITIAL.
      APPEND msg_row( 'Select at least one plant, material or process order' ) TO rt_rows.
      RETURN.
    ENDIF.
    IF mv_from IS NOT INITIAL OR mv_to IS NOT INITIAL.
      IF mv_dtype = 'P'.
        lr_pdate = VALUE #( ( sign = 'I' option = 'BT' low = mv_from high = COND dats( WHEN mv_to IS INITIAL THEN '99991231' ELSE mv_to ) ) ).
      ELSE.
        lr_cdate = VALUE #( ( sign = 'I' option = 'BT' low = mv_from high = COND dats( WHEN mv_to IS INITIAL THEN '99991231' ELSE mv_to ) ) ).
      ENDIF.
    ENDIF.
    " ---- the receipts, exactly the ZMM_PCOST selection (date = created OR changed on, or the posting date)
    SELECT a~aufnr, a~charg, a~matnr, a~werks, a~post_type, a~mtart, a~maktx, a~menge, a~meins,
           a~machine_cost, a~labour_cost, a~power_cost, a~steam_cost, a~pm_cost, a~rm_cost, a~perfume_cost, a~oth_cost, a~conv_cost,
           a~cons_rm_cost, a~cons_pm_cost, a~cons_perfume_cost, a~cons_oth_cost, a~trd_rm_cost, a~trd_pm_cost, a~trd_perfume_cost, a~trd_oth_cost,
           a~mblnr, a~mjahr, a~budat_mkpf, a~erdat, a~zbusiness, b~zskugrcodecrs, b~matkl
      FROM zmb31_poutility AS a INNER JOIN mara AS b ON a~matnr = b~matnr
      WHERE a~aufnr IN @mr_aufnr
        AND a~matnr IN @mr_matnr
        AND a~werks IN @mr_werks
        AND a~post_type IN @mr_ptype
        AND ( a~erdat IN @lr_cdate OR a~chgdate IN @lr_cdate )
        AND a~budat_mkpf IN @lr_pdate
      ORDER BY a~werks, a~aufnr, a~charg, a~mblnr
      INTO TABLE @DATA(lt_u)
      UP TO @mc_max_rows ROWS.
    IF lt_u IS INITIAL.
      APPEND msg_row( iv_msg = 'No process order receipts in ZMB31_POUTILITY for this selection' iv_flag = 'EMPTY' ) TO rt_rows.
      RETURN.
    ENDIF.
    " ---- plant authorisation (same check as the other Costing Cockpit sets)
    LOOP AT lt_u INTO DATA(ls_w).
      CHECK NOT line_exists( lt_denied[ table_line = ls_w-werks ] ).
      IF zcl_mm_bom_cost_auth=>check_plant( ls_w-werks ) = abap_false. INSERT ls_w-werks INTO TABLE lt_denied. ENDIF.
    ENDLOOP.
    LOOP AT lt_denied INTO DATA(lv_dw).
      DELETE lt_u WHERE werks = lv_dw.
      APPEND msg_row( iv_msg = |Plant { lv_dw } is not authorised| iv_flag = 'AUTH' ) TO rt_rows.
    ENDLOOP.
    lt_keys = VALUE #( FOR u IN lt_u ( matnr = u-matnr werks = u-werks charg = u-charg ) ).
    prices( EXPORTING it_keys = lt_keys IMPORTING et_batch = DATA(lt_batch) et_price = DATA(lt_price) ).

    LOOP AT lt_u ASSIGNING FIELD-SYMBOL(<u>).
      DATA(ls_r) = VALUE zpovar_s_row( grain = 'O' aufnr = <u>-aufnr matnr = <u>-matnr maktx = <u>-maktx mtart = <u>-mtart matkl = <u>-matkl werks = <u>-werks
                                       charg = <u>-charg post_type = <u>-post_type mblnr = <u>-mblnr mjahr = <u>-mjahr budat = <u>-budat_mkpf erdat = <u>-erdat
                                       zbusiness = <u>-zbusiness crssku = <u>-zskugrcodecrs menge = <u>-menge meins = <u>-meins
                                       date_from = mv_from date_to = mv_to date_type = mv_dtype ).
      ls_r-rm   = <u>-rm_cost.
      ls_r-pm   = <u>-pm_cost.
      ls_r-perf = <u>-perfume_cost.
      ls_r-oth  = <u>-oth_cost.
      ls_r-conv = <u>-machine_cost + <u>-labour_cost + <u>-power_cost + <u>-steam_cost + <u>-conv_cost.
      ls_r-cons = abs( <u>-cons_rm_cost ) + abs( <u>-cons_pm_cost ) + abs( <u>-cons_perfume_cost ) + abs( <u>-cons_oth_cost ).
      ls_r-trd  = abs( <u>-trd_rm_cost ) + abs( <u>-trd_pm_cost ) + abs( <u>-trd_perfume_cost ) + abs( <u>-trd_oth_cost ).
      lv_total = ls_r-rm + ls_r-pm + ls_r-perf + ls_r-oth + ls_r-conv + ls_r-cons + ls_r-trd.
      ls_r-total = lv_total.
      IF <u>-menge <> 0.
        ls_r-act_pc = lv_total / <u>-menge.
      ENDIF.
      value_std( EXPORTING is_key = VALUE #( matnr = <u>-matnr werks = <u>-werks charg = <u>-charg ) it_batch = lt_batch it_price = lt_price CHANGING cs_row = ls_r ).
      IF ls_r-std_pc IS NOT INITIAL AND ls_r-act_pc IS NOT INITIAL.
        lv_pct = ( ls_r-std_pc - ls_r-act_pc ) / ls_r-std_pc * 100.
        IF abs( lv_pct ) > 99999999. lv_pct = sign( lv_pct ) * 99999999. ENDIF.
        ls_r-diff_pct = lv_pct.
        ls_r-std_val = ls_r-std_pc * ls_r-menge.
        ls_r-var_val = ( ls_r-act_pc - ls_r-std_pc ) * ls_r-menge.
      ELSEIF ls_r-act_pc IS INITIAL AND ls_r-flag IS INITIAL.
        ls_r-flag = 'NOCOST'. ls_r-msg = 'No cost in ZMB31_POUTILITY for this receipt'.
      ENDIF.
      value_ck( CHANGING cs_row = ls_r ).
      IF mv_pct > 0 AND abs( ls_r-diff_pct ) < mv_pct AND abs( ls_r-ck_diff_pct ) < mv_pct.
        CONTINUE.
      ENDIF.
      lv_id = lv_id + 1. ls_r-rowid = lv_id.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
    IF lines( lt_u ) >= mc_max_rows.
      APPEND msg_row( iv_msg = |Only the first { mc_max_rows } receipts were read: narrow the selection| iv_flag = 'PARTIAL' ) TO rt_rows.
    ENDIF.
  ENDMETHOD.


  METHOD components.
    DATA: lt_os   TYPE zcl_aufm_utility3=>ty_t_orders,
          lt_a    TYPE zcl_aufm_utility3=>ty_t_aufm,
          lt_d    TYPE zcl_aufm_utility3=>ty_t_order_drill_dn,
          lt_s    TYPE zcl_aufm_utility3=>ty_t_order_sum,
          lt_keys TYPE tt_key,
          lv_fgq  TYPE decfloat34,
          lv_qty  TYPE decfloat34,
          lv_val  TYPE decfloat34,
          lv_pct  TYPE decfloat34,
          lv_id   TYPE i.
    DATA(lv_aufnr) = CONV aufnr( |{ iv_aufnr ALPHA = IN }| ).
    lt_os = VALUE #( ( aufnr = lv_aufnr ) ).
    TRY.
        zcl_aufm_utility3=>get_mat_consumption_details(
          EXPORTING iv_mtart = 'FERT' it_orders = lt_os iv_till_date = '99991231' iv_include_abnormal_mvt = 'X'
          CHANGING ct_aufm = lt_a ct_ord_drill_dn = lt_d ct_ord_mtart_sum = lt_s ).
      CATCH cx_root INTO DATA(lx).
        APPEND msg_row( iv_msg = |ZMM_COST logic failed: { lx->get_text( ) }| iv_flag = 'ERROR' ) TO rt_rows.
        RETURN.
    ENDTRY.
    IF lt_d IS INITIAL.
      APPEND msg_row( iv_msg = |No consumption found for process order { lv_aufnr ALPHA = OUT }| iv_flag = 'EMPTY' ) TO rt_rows.
      RETURN.
    ENDIF.
    READ TABLE lt_d INTO DATA(ls_h0) WITH KEY level = 0.
    IF sy-subrc <> 0. ls_h0 = lt_d[ 1 ]. ENDIF.
    IF zcl_mm_bom_cost_auth=>check_plant( ls_h0-werks ) = abap_false.
      APPEND msg_row( iv_msg = |Plant { ls_h0-werks } is not authorised| iv_flag = 'AUTH' ) TO rt_rows.
      RETURN.
    ENDIF.
    LOOP AT lt_d INTO DATA(ls_q) WHERE level = 0.
      lv_fgq = lv_fgq + ls_q-menge.
    ENDLOOP.
    lt_keys = VALUE #( FOR d IN lt_d WHERE ( matnr IS NOT INITIAL ) ( matnr = d-matnr werks = d-werks charg = d-charg ) ).
    prices( EXPORTING it_keys = lt_keys IMPORTING et_batch = DATA(lt_batch) et_price = DATA(lt_price) ).
    SELECT matnr, matkl, meins FROM mara FOR ALL ENTRIES IN @lt_keys WHERE matnr = @lt_keys-matnr INTO TABLE @DATA(lt_mara).
    SORT lt_mara BY matnr.

    LOOP AT lt_d ASSIGNING FIELD-SYMBOL(<d>).
      READ TABLE lt_mara INTO DATA(ls_m) WITH KEY matnr = <d>-matnr BINARY SEARCH.
      IF sy-subrc <> 0. CLEAR ls_m. ENDIF.
      DATA(ls_r) = VALUE zpovar_s_row( aufnr = <d>-aufnr matnr = <d>-matnr maktx = <d>-maktx mtart = <d>-mtart matkl = ls_m-matkl werks = <d>-werks
                                       charg = <d>-charg level = <d>-level parent = <d>-matnr_par meins = <d>-meins base_uom = ls_m-meins fg_qty = lv_fgq ).
      ls_r-cat  = category( iv_mtart = <d>-mtart iv_matkl = ls_m-matkl ).
      ls_r-conv = <d>-machine_cost + <d>-labour_cost + <d>-power_cost + <d>-steam_cost + <d>-conv_cost.
      lv_qty = <d>-menge. lv_val = <d>-dmbtr.
      " consumption may come signed (issue 261 negative): compare like with like
      IF lv_qty < 0 AND lv_val <= 0. lv_qty = - lv_qty. lv_val = - lv_val. ENDIF.
      ls_r-menge = lv_qty. ls_r-total = lv_val.
      IF lv_qty <> 0. ls_r-act_pc = lv_val / lv_qty. ENDIF.
      IF <d>-level = 0.
        ls_r-grain = 'H'.
        ls_r-aufnr = lv_aufnr.
        value_ck( CHANGING cs_row = ls_r ).
      ELSEIF <d>-mtart = 'WIP'.
        ls_r-grain = 'W'. ls_r-is_wip = 'X'.
      ELSE.
        ls_r-grain = 'C'.
      ENDIF.
      IF ls_r-grain <> 'W' AND <d>-matnr IS NOT INITIAL.
        value_std( EXPORTING is_key = VALUE #( matnr = <d>-matnr werks = <d>-werks charg = <d>-charg ) it_batch = lt_batch it_price = lt_price CHANGING cs_row = ls_r ).
        IF ls_r-grain = 'C' AND ls_m-meins IS NOT INITIAL AND <d>-meins IS NOT INITIAL AND ls_m-meins <> <d>-meins AND ls_r-flag IS INITIAL.
          ls_r-flag = 'UOM'. ls_r-msg = |Consumed in { <d>-meins }, MBEW price is per { ls_m-meins }|.
        ENDIF.
        IF ls_r-std_pc IS NOT INITIAL AND ls_r-grain = 'C'.
          ls_r-std_val = ls_r-std_pc * lv_qty.
          ls_r-var_val = lv_val - ls_r-std_val.
          IF lv_fgq <> 0. ls_r-var_fg_pc = ls_r-var_val / lv_fgq. ENDIF.
          IF ls_r-act_pc IS NOT INITIAL.
            lv_pct = ( ls_r-std_pc - ls_r-act_pc ) / ls_r-std_pc * 100.
            IF abs( lv_pct ) > 99999999. lv_pct = sign( lv_pct ) * 99999999. ENDIF.
            ls_r-diff_pct = lv_pct.
          ENDIF.
        ENDIF.
      ENDIF.
      lv_id = lv_id + 1. ls_r-rowid = lv_id.
      APPEND ls_r TO rt_rows.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
