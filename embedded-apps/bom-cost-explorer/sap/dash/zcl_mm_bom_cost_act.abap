CLASS zcl_mm_bom_cost_act DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: ty_r_matnr TYPE RANGE OF mara-matnr,
           ty_r_werks TYPE RANGE OF werks_d,
           ty_r_poper TYPE RANGE OF poper,
           ty_r_lstar TYPE RANGE OF lstar.
    TYPES: BEGIN OF ty_par,
             matnr TYPE ty_r_matnr,
             werks TYPE ty_r_werks,
             poper TYPE ty_r_poper,
             lstar TYPE ty_r_lstar,
             gjahr TYPE gjahr,
             versn TYPE versn,
             date  TYPE d,
           END OF ty_par.

    METHODS constructor
      IMPORTING io_util TYPE REF TO zcl_mm_bom_cost_util.
    METHODS read
      IMPORTING is_par         TYPE ty_par
      RETURNING VALUE(rt_rows) TYPE zmm_cost_bom_tt_actcost.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_grp,
             kokrs   TYPE kokrs,
             lstar   TYPE lstar,
             grp     TYPE c LENGTH 10,
             grp_seq TYPE n LENGTH 2,
           END OF ty_grp,
           BEGIN OF ty_fx,
             curr TYPE waers,
             fx   TYPE decfloat34,
           END OF ty_fx,
           BEGIN OF ty_est,
             matnr TYPE matnr,
             werks TYPE werks_d,
             gjahr TYPE gjahr,
             poper TYPE poper,
           END OF ty_est,
           BEGIN OF ty_au,
             werks TYPE werks_d,
             ok    TYPE abap_bool,
           END OF ty_au.
    DATA: mo_util TYPE REF TO zcl_mm_bom_cost_util,
          mt_grp  TYPE HASHED TABLE OF ty_grp WITH UNIQUE KEY kokrs lstar,
          mt_fx   TYPE HASHED TABLE OF ty_fx  WITH UNIQUE KEY curr,
          mt_au   TYPE HASHED TABLE OF ty_au  WITH UNIQUE KEY werks.
ENDCLASS.



CLASS ZCL_MM_BOM_COST_ACT IMPLEMENTATION.


  METHOD constructor.
    mo_util = io_util.
    SELECT kokrs, lstar, grp, grp_seq FROM zbom_actgrp
      INTO CORRESPONDING FIELDS OF TABLE @mt_grp.
  ENDMETHOD.


  METHOD read.
    DATA: ls_out TYPE zmm_cost_bom_s_actcost,
          lv_gj  TYPE gjahr,
          lv_vs  TYPE versn,
          lv_dt  TYPE d,
          lv_pc  TYPE decfloat34,
          lv_est TYPE abap_bool,
          lv_cp  TYPE poper,
          lt_est TYPE HASHED TABLE OF ty_est WITH UNIQUE KEY matnr werks,
          lt_yrs TYPE SORTED TABLE OF gjahr WITH UNIQUE KEY table_line.

    lv_gj = is_par-gjahr.
    IF lv_gj IS INITIAL.
      lv_gj = mo_util->cfg( iv_key = 'ACT_GJAHR' iv_default = CONV #( sy-datum(4) ) ).
    ENDIF.
    lv_vs = is_par-versn.
    IF lv_vs IS INITIAL.
      lv_vs = mo_util->cfg( iv_key = 'ACT_VERSN' iv_default = '000' ).
    ENDIF.
    lv_dt = COND #( WHEN is_par-date IS INITIAL THEN sy-datum ELSE is_par-date ).
    INSERT lv_gj INTO TABLE lt_yrs.

    " Poper '999' (poper is NUMC, so a number is the switch): price each material in the period of its LATEST cost estimate (CK13N / KEKO, version 01), so the activity value ties to the costing.
    " Materials without an estimate stay on the current fiscal period. Fiscal year starts in April.
    LOOP AT is_par-poper INTO DATA(ls_pp) WHERE low = '999'.
      lv_est = abap_true.
    ENDLOOP.
    IF lv_est = abap_true.
      lv_cp = ( ( lv_dt+4(2) - 4 + 12 ) MOD 12 ) + 1.
      SELECT matnr, werks, bdatj, poper FROM keko
        WHERE bzobj = '0' AND tvers = '01' AND matnr IN @is_par-matnr AND werks IN @is_par-werks
        ORDER BY kadky DESCENDING
        INTO TABLE @DATA(lt_k)
        UP TO 20000 ROWS.
      LOOP AT lt_k INTO DATA(ls_k).
        INSERT VALUE #( matnr = ls_k-matnr werks = ls_k-werks gjahr = ls_k-bdatj poper = ls_k-poper ) INTO TABLE lt_est.
        INSERT ls_k-bdatj INTO TABLE lt_yrs.
      ENDLOOP.
    ENDIF.

    LOOP AT lt_yrs INTO DATA(lv_y).
    SELECT Material, Plant, BOM, BOMAlt, RecipeGroup, GroupCounter, Operation, ZResource,
           ActivitySeq, PostingPeriod, MaterialText, ResourceText, ControllingArea, CostCenter,
           ActivityType, ActivityName, ActivityDescription, BOMBaseUnit, BOMBaseQty, RecipeBaseQty,
           ActivityQtyForBOMBase, ActivityUnit, Currency, ActivityPrice, ActivityValue
      FROM zc_fg_recipe_act_value( p_date = @lv_dt, p_gjahr = @lv_y, p_versn = @lv_vs )
      WHERE Material IN @is_par-matnr
        AND Plant    IN @is_par-werks
        AND ActivityType IN @is_par-lstar
      INTO TABLE @DATA(lt_raw)
      UP TO 50000 ROWS.

    SORT lt_raw BY Material Plant BOMAlt RecipeGroup GroupCounter Operation ZResource ActivitySeq PostingPeriod.

    LOOP AT lt_raw INTO DATA(ls_raw).
      " period filter: rows without a period (no price) are always kept so the gap stays visible
      IF lv_est = abap_true.
        READ TABLE lt_est ASSIGNING FIELD-SYMBOL(<es>) WITH TABLE KEY matnr = ls_raw-Material werks = ls_raw-Plant.
        IF sy-subrc = 0.
          IF lv_y <> <es>-gjahr. CONTINUE. ENDIF.
          IF ls_raw-PostingPeriod IS NOT INITIAL AND ls_raw-PostingPeriod <> <es>-poper. CONTINUE. ENDIF.
        ELSE.
          IF lv_y <> lv_gj. CONTINUE. ENDIF.
          IF ls_raw-PostingPeriod IS NOT INITIAL AND ls_raw-PostingPeriod <> lv_cp. CONTINUE. ENDIF.
        ENDIF.
      ELSEIF lv_y <> lv_gj OR ( ls_raw-PostingPeriod IS NOT INITIAL AND ls_raw-PostingPeriod NOT IN is_par-poper ).
        CONTINUE.
      ENDIF.

      " plant authorisation (the CDS has none)
      READ TABLE mt_au ASSIGNING FIELD-SYMBOL(<au>) WITH TABLE KEY werks = ls_raw-Plant.
      IF sy-subrc <> 0.
        INSERT VALUE #( werks = ls_raw-Plant
                        ok    = zcl_mm_bom_cost_auth=>check_plant( ls_raw-Plant ) )
               INTO TABLE mt_au ASSIGNING <au>.
      ENDIF.
      CHECK <au>-ok = abap_true.

      CLEAR ls_out.
      ls_out-matnr     = ls_raw-Material.
      ls_out-maktx     = ls_raw-MaterialText.
      ls_out-werks     = ls_raw-Plant.
      ls_out-stlnr     = ls_raw-BOM.
      ls_out-stlal     = ls_raw-BOMAlt.
      ls_out-plnnr     = ls_raw-RecipeGroup.
      ls_out-plnal     = ls_raw-GroupCounter.
      ls_out-vornr     = ls_raw-Operation.
      ls_out-resrc     = ls_raw-ZResource.
      ls_out-resrc_txt = ls_raw-ResourceText.
      ls_out-actseq    = ls_raw-ActivitySeq.
      ls_out-poper     = ls_raw-PostingPeriod.
      ls_out-kokrs     = ls_raw-ControllingArea.
      ls_out-kostl     = ls_raw-CostCenter.
      ls_out-lstar     = ls_raw-ActivityType.
      ls_out-act_name  = ls_raw-ActivityName.
      ls_out-act_desc  = ls_raw-ActivityDescription.
      ls_out-bom_unit  = ls_raw-BOMBaseUnit.
      ls_out-bom_qty   = ls_raw-BOMBaseQty.
      ls_out-rcp_qty   = ls_raw-RecipeBaseQty.
      ls_out-act_qty   = ls_raw-ActivityQtyForBOMBase.
      ls_out-act_unit  = ls_raw-ActivityUnit.
      ls_out-curr      = ls_raw-Currency.
      ls_out-act_price = ls_raw-ActivityPrice.
      ls_out-act_value = ls_raw-ActivityValue.
      ls_out-gjahr     = lv_y.
      ls_out-versn     = lv_vs.

      " cost group: controlling-area specific mapping first, then the general one, else OTHER
      READ TABLE mt_grp INTO DATA(ls_g) WITH TABLE KEY kokrs = ls_raw-ControllingArea lstar = ls_raw-ActivityType.
      IF sy-subrc <> 0.
        READ TABLE mt_grp INTO ls_g WITH TABLE KEY kokrs = space lstar = ls_raw-ActivityType.
      ENDIF.
      IF sy-subrc = 0.
        ls_out-act_grp = ls_g-grp.
        ls_out-grp_seq = ls_g-grp_seq.
      ELSE.
        ls_out-act_grp = 'OTHER'.
        ls_out-grp_seq = '99'.
      ENDIF.

      " cost per BOM base unit, calculated from the unrounded quantity and price
      IF ls_raw-ActivityPrice IS INITIAL OR ls_raw-Currency IS INITIAL.
        ls_out-no_price = 'X'.
      ELSEIF ls_raw-BOMBaseQty > 0.
        lv_pc = ( CONV decfloat34( ls_raw-ActivityQtyForBOMBase ) * ls_raw-ActivityPrice )
                / ls_raw-BOMBaseQty.
        ls_out-value_pc = lv_pc.

        READ TABLE mt_fx ASSIGNING FIELD-SYMBOL(<fx>) WITH TABLE KEY curr = ls_raw-Currency.
        IF sy-subrc <> 0.
          INSERT VALUE #( curr = ls_raw-Currency
                          fx   = mo_util->get_fx_factor( iv_from = ls_raw-Currency
                                                         iv_to   = mo_util->mv_group_curr iv_werks = ls_raw-plant ) )
                 INTO TABLE mt_fx ASSIGNING <fx>.
        ENDIF.
        ls_out-fx_inr       = <fx>-fx.
        ls_out-value_pc_inr = lv_pc * <fx>-fx.
      ENDIF.

      APPEND ls_out TO rt_rows.
    ENDLOOP.
    ENDLOOP.

    SORT rt_rows BY matnr werks stlal plnnr plnal poper grp_seq vornr actseq.
    LOOP AT rt_rows ASSIGNING FIELD-SYMBOL(<r>).
      <r>-rowid = sy-tabix.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
