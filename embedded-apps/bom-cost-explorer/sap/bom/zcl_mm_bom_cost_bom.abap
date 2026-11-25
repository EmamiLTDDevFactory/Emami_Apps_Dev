CLASS zcl_mm_bom_cost_bom DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: ty_item       TYPE zif_mm_bom_cost_types=>ty_item,
           ty_t_item     TYPE zif_mm_bom_cost_types=>ty_t_item,
           ty_plant      TYPE zif_mm_bom_cost_types=>ty_plant,
           ty_t_plant    TYPE zif_mm_bom_cost_types=>ty_t_plant,
           ty_t_skip     TYPE zif_mm_bom_cost_types=>ty_t_skip,
           ty_head_tab   TYPE zif_mm_bom_cost_types=>ty_head_tab,
           ty_t_actual_s TYPE SORTED TABLE OF zif_mm_bom_cost_types=>ty_actual
                              WITH UNIQUE KEY matnr werks.

    DATA: mt_item TYPE ty_t_item,
          mt_skip TYPE ty_t_skip,
          mv_seq  TYPE i.

    METHODS constructor
      IMPORTING is_par  TYPE zif_mm_bom_cost_types=>ty_params
                io_util TYPE REF TO zcl_mm_bom_cost_util.

    METHODS explode_all
      IMPORTING it_plant TYPE ty_t_plant.
*      RAISING   zcx_mm_bom_cost.

    METHODS explode_one
      IMPORTING iv_head  TYPE matnr
                is_plant TYPE ty_plant
                iv_emeng TYPE stpox-menge
                iv_qsrc  TYPE csequence.

    METHODS add_direct
      IMPORTING iv_matnr TYPE matnr
                iv_meins TYPE meins
                is_plant TYPE ty_plant.

    METHODS add_skip
      IMPORTING iv_matnr TYPE matnr
                iv_werks TYPE werks_d
                iv_msg   TYPE csequence.

    METHODS get_base_quantities.
    METHODS enrich_and_sort.
    METHODS get_header_attributes.
    METHODS flag_parent_nodes.

    METHODS collect_keys
      RETURNING VALUE(rt_keys) TYPE ty_head_tab.

  PRIVATE SECTION.
    " constants (next to gc_max_level)
    CONSTANTS: gc_pick_latest  TYPE abap_bool VALUE abap_true,   " scenario 2 on/off
               gc_stlst_active TYPE stko-stlst VALUE '01'.       " BOM status = active (check T415S)

    " private section: type
    TYPES: BEGIN OF ty_bompick,
             stlal TYPE stko-stlal,
             datuv TYPE stko-datuv,
             stlnr TYPE stko-stlnr,
             stlst TYPE stko-stlst,
           END OF ty_bompick,
           ty_t_bompick TYPE STANDARD TABLE OF ty_bompick WITH DEFAULT KEY.

    " private section: method
    METHODS pick_bom IMPORTING iv_matnr   TYPE matnr
                               iv_werks   TYPE werks_d
                     EXPORTING es_act     TYPE ty_bompick     " latest active alternative
                               ev_cnt_act TYPE i              " number of active alternatives
                               et_act     TYPE ty_t_bompick   " all active alternatives (latest first)
                               es_any     TYPE ty_bompick.    " latest alternative, any status

    CONSTANTS gc_max_level TYPE i VALUE 99.

    DATA: ms_par  TYPE zif_mm_bom_cost_types=>ty_params,
          mo_util TYPE REF TO zcl_mm_bom_cost_util.

    METHODS get_actual_qty
      RETURNING VALUE(rt_actual) TYPE ty_t_actual_s.
ENDCLASS.



CLASS ZCL_MM_BOM_COST_BOM IMPLEMENTATION.


  METHOD add_direct.
    mv_seq = mv_seq + 1.
    APPEND VALUE ty_item(
      seqnr    = mv_seq
      land1    = is_plant-land1
      hwerks   = is_plant-werks
      werks    = is_plant-werks
      headmat  = iv_matnr
      idnrk    = iv_matnr
      level    = 0
      usedqty  = ms_par-qty
      qtysrc   = 'MANUAL'
      menge    = ms_par-qty
      prod_qty = ms_par-qty
      meins    = iv_meins ) TO mt_item.
  ENDMETHOD.


  METHOD add_skip.
    APPEND VALUE #( matnr = iv_matnr werks = iv_werks msg = iv_msg ) TO mt_skip.
  ENDMETHOD.


  METHOD collect_keys.
    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<i>).
      APPEND VALUE #( matnr = <i>-idnrk werks = <i>-werks ) TO rt_keys.
    ENDLOOP.
    SORT rt_keys BY matnr werks.
    DELETE ADJACENT DUPLICATES FROM rt_keys COMPARING matnr werks.
    DELETE rt_keys WHERE matnr IS INITIAL.
  ENDMETHOD.


  METHOD constructor.
    ms_par  = is_par.
    mo_util = io_util.
  ENDMETHOD.


  METHOD enrich_and_sort.
    TYPES: BEGIN OF ty_mtart,
             matnr TYPE matnr,
             mtart TYPE mara-mtart,
             matkl TYPE matkl,
             hrkft TYPE hrkft,
             bwkey TYPE bwkey,
             sobsl TYPE sobsl,
             werks TYPE werks_d,
           END OF ty_mtart.
    DATA: lt_key   TYPE STANDARD TABLE OF zif_mm_bom_cost_types=>ty_head,
          lt_mtart TYPE STANDARD TABLE OF ty_mtart.

    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<k>).
      APPEND VALUE #( matnr = <k>-idnrk )   TO lt_key.
      APPEND VALUE #( matnr = <k>-headmat ) TO lt_key.
    ENDLOOP.
    SORT lt_key BY matnr.
    DELETE ADJACENT DUPLICATES FROM lt_key COMPARING matnr.
    DELETE lt_key WHERE matnr IS INITIAL.
    CHECK lt_key IS NOT INITIAL.

    SELECT matnr, maktx FROM makt
      FOR ALL ENTRIES IN @lt_key
      WHERE matnr = @lt_key-matnr AND spras = @sy-langu
      INTO TABLE @DATA(lt_makt).
    SORT lt_makt BY matnr.

    SELECT a~matnr, a~mtart, a~matkl, b~hrkft, b~bwkey, c~sobsl, c~werks
      FROM mara AS a
      INNER JOIN marc AS c ON a~matnr = c~matnr
      INNER JOIN mbew AS b ON a~matnr = b~matnr
                          AND c~werks = b~bwkey
                          AND b~bwtar = @space
      FOR ALL ENTRIES IN @lt_key
      WHERE a~matnr = @lt_key-matnr
      INTO CORRESPONDING FIELDS OF TABLE @lt_mtart.
    SORT lt_mtart BY matnr werks.

    SELECT land1, landx FROM t005t
      WHERE spras = @sy-langu
      INTO TABLE @DATA(lt_land).
    SORT lt_land BY land1.

    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<i>).
      READ TABLE lt_makt INTO DATA(ls_makt) WITH KEY matnr = <i>-idnrk BINARY SEARCH.
      IF sy-subrc = 0.
        <i>-maktx = ls_makt-maktx.
      ENDIF.
      READ TABLE lt_makt INTO ls_makt WITH KEY matnr = <i>-headmat BINARY SEARCH.
      IF sy-subrc = 0.
        <i>-headtxt = ls_makt-maktx.
      ENDIF.

      READ TABLE lt_mtart INTO DATA(ls_mt)
           WITH KEY matnr = <i>-idnrk werks = <i>-werks BINARY SEARCH.
      IF sy-subrc = 0.
        <i>-mtart     = ls_mt-mtart.
        <i>-comp_ogrp = ls_mt-hrkft.
        <i>-comp_grp  = ls_mt-matkl.
        <i>-sobsl     = ls_mt-sobsl.
      ENDIF.

      READ TABLE lt_land INTO DATA(ls_land) WITH KEY land1 = <i>-land1 BINARY SEARCH.
      IF sy-subrc = 0.
        <i>-landx = ls_land-landx.
      ENDIF.
    ENDLOOP.

    SORT mt_item BY land1 hwerks headmat seqnr.
  ENDMETHOD.


  METHOD explode_all.
    DATA(lt_actual) = get_actual_qty( ).

    SELECT matnr FROM mara
      WHERE matnr IN @ms_par-matnr AND lvorm = @space
      ORDER BY matnr
      INTO TABLE @DATA(lt_head).
    IF lt_head IS INITIAL.
*      RAISE EXCEPTION TYPE zcx_bom_cost
*        EXPORTING iv_text = 'No materials found for the entered selection'.
    ENDIF.

    LOOP AT it_plant INTO DATA(ls_plant).
      LOOP AT lt_head INTO DATA(ls_head).
        DATA(lv_emeng) = CONV stpox-menge( ms_par-qty ).
        DATA(lv_qsrc)  = 'MANUAL'.
        READ TABLE lt_actual INTO DATA(ls_act)
             WITH TABLE KEY matnr = ls_head-matnr werks = ls_plant-werks.
        IF sy-subrc = 0 AND ls_act-menge > 0.
          lv_emeng = ls_act-menge.
          lv_qsrc  = 'ACTUAL'.
        ENDIF.
        explode_one( iv_head  = ls_head-matnr
                     is_plant = ls_plant
                     iv_emeng = lv_emeng
                     iv_qsrc  = lv_qsrc ).
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.


  METHOD explode_one.
*  METHOD explode_one.
*    DATA: lt_probe  TYPE STANDARD TABLE OF stpox,
*          lt_stb    TYPE STANDARD TABLE OF stpox,
*          lt_stack  TYPE STANDARD TABLE OF matnr,
*          ls_topmat TYPE cstmat,
*          lv_parent TYPE matnr,
*          lv_idx    TYPE i,
*          lv_fmeng  TYPE stko-bmeng,
*          lv_fmein  TYPE stko-bmein,
*          ls_item   TYPE ty_item.
*
*    " pass 1: probe - finds the BOM / alternative and its base quantity
*    CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
*      EXPORTING
*        aumgb                 = 'X'
*        mktls                 = 'X'
*        capid                 = ms_par-capid
*        datuv                 = sy-datum
*        auskz                 = 'X'
*        mehrs                 = 'X'
*        rndkz                 = '1'
*        mmory                 = space
*        mtnrv                 = iv_head
*        stlal                 = space
*        stlan                 = '1'
*        stpst                 = 0
*        svwvo                 = 'X'
*        vrsvo                 = 'X'
*        werks                 = is_plant-werks
*      TABLES
*        stb                   = lt_probe
*      EXCEPTIONS
*        alt_not_found         = 1
*        call_invalid          = 2
*        material_not_found    = 3
*        missing_authorization = 4
*        no_bom_found          = 5
*        no_plant_data         = 6
*        no_suitable_bom_found = 7
*        conversion_error      = 8
*        OTHERS                = 9.
*    DATA(lv_subrc) = sy-subrc.
*
*    IF lv_subrc <> 0 OR lt_probe IS INITIAL.
*      add_skip( iv_matnr = iv_head
*                iv_werks = is_plant-werks
*                iv_msg   = SWITCH string( lv_subrc
*                  WHEN 0 THEN 'BOM exists but has no valid items on this date'
*                  WHEN 1 THEN 'No alternative BOM found for today (auto-selected)'
*                  WHEN 2 THEN 'Invalid call / parameter combination'
*                  WHEN 3 THEN 'Material not found'
*                  WHEN 4 THEN 'Missing authorization'
*                  WHEN 5 THEN 'No BOM exists'
*                  WHEN 6 THEN 'No plant data for this material'
*                  WHEN 7 THEN 'No suitable BOM found for usage / date'
*                  WHEN 8 THEN 'Conversion error'
*                  ELSE 'BOM explosion failed' ) ).
*      RETURN.
*    ENDIF.
*
*    READ TABLE lt_probe INTO DATA(ls_probe) WITH KEY stufe = 1.
*    IF sy-subrc <> 0.
*      add_skip( iv_matnr = iv_head
*                iv_werks = is_plant-werks
*                iv_msg   = 'BOM exists but has no valid items on this date' ).
*      RETURN.
*    ENDIF.
*
*    SELECT SINGLE bmeng, bmein FROM stko
*      WHERE stlty = @ls_probe-stlty
*        AND stlnr = @ls_probe-stlnr
*        AND stlal = @ls_probe-stlal
*      INTO (@lv_fmeng, @lv_fmein).
*
*    " pass 2: real explosion with the BOM base quantity
*    IF lv_fmeng > 0.
*      CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
*        EXPORTING
*          aumgb                 = 'X'
*          mktls                 = 'X'
*          capid                 = ms_par-capid
*          datuv                 = sy-datum
*          emeng                 = lv_fmeng
*          auskz                 = 'X'
*          mehrs                 = 'X'
*          rndkz                 = '1'
*          mmory                 = space
*          mtnrv                 = iv_head
*          stlal                 = ls_probe-stlal
*          stlan                 = '1'
*          stpst                 = 0
*          svwvo                 = 'X'
*          vrsvo                 = 'X'
*          werks                 = is_plant-werks
*        IMPORTING
*          topmat                = ls_topmat
*        TABLES
*          stb                   = lt_stb
*        EXCEPTIONS
*          alt_not_found         = 1
*          call_invalid          = 2
*          material_not_found    = 3
*          missing_authorization = 4
*          no_bom_found          = 5
*          no_plant_data         = 6
*          no_suitable_bom_found = 7
*          conversion_error      = 8
*          OTHERS                = 9.
*      IF sy-subrc <> 0 OR lt_stb IS INITIAL.
*        lt_stb = lt_probe.
*      ENDIF.
*    ELSE.
*      lt_stb = lt_probe.
*    ENDIF.

    DATA: lt_probe  TYPE STANDARD TABLE OF stpox,
          lt_stb    TYPE STANDARD TABLE OF stpox,
          lt_stack  TYPE STANDARD TABLE OF matnr,
          ls_topmat TYPE cstmat,
          lv_parent TYPE matnr,
          lv_idx    TYPE i,
          lv_fmeng  TYPE stko-bmeng,
          lv_fmein  TYPE stko-bmein,
          ls_item   TYPE ty_item,
          lv_subrc  TYPE i,                       " NEW (was inline DATA(lv_subrc))
          lv_datuv  TYPE d,                       " NEW
          lv_stlal  TYPE stko-stlal,              " NEW (initial = same as before: stlal = space)
          lv_capid  TYPE tc04-capid,              " NEW
          lv_cnt    TYPE i,                       " NEW
          lv_sc3    TYPE abap_bool,               " NEW
          lv_sc4    TYPE abap_bool,               " NEW scenario 4
          lv_pv_alt TYPE stko-stlal,              " NEW scenario 4: alternative named by the production version
          lt_actall TYPE ty_t_bompick,            " NEW scenario 4
          ls_act    TYPE ty_bompick,              " NEW
          ls_any    TYPE ty_bompick.              " NEW

    lv_datuv = sy-datum.                          " same as before
    lv_capid = ms_par-capid.                      " same as before (PP01)

    " NEW: scenario 2 - several active BOMs -> latest one; scenario 1 stays untouched
    pick_bom( EXPORTING iv_matnr = iv_head iv_werks = is_plant-werks
              IMPORTING es_act = ls_act ev_cnt_act = lv_cnt es_any = ls_any et_act = lt_actall ).
    IF lv_cnt > 1 AND gc_pick_latest = abap_true.
      lv_stlal = ls_act-stlal.
    ENDIF.

    " NEW: scenario 4 - an active alternative exists, but the production version(s) valid on the date name an alternative that is NOT active (locked / inactive),
    "      or are locked themselves: the automatic alternative selection (which follows the production version) then finds no BOM. Use the latest active alternative.
    IF lv_cnt >= 1 AND lv_stlal IS INITIAL.
      SELECT stlal, mksp FROM mkal
        WHERE matnr = @iv_head AND werks = @is_plant-werks AND stlan = '1'
          AND adatu <= @lv_datuv AND bdatu >= @lv_datuv
        INTO TABLE @DATA(lt_pv).
      IF lt_pv IS NOT INITIAL.
        DATA(lv_pv_ok) = abap_false.
        LOOP AT lt_pv INTO DATA(ls_pv) WHERE mksp = space.
          IF line_exists( lt_actall[ stlal = ls_pv-stlal ] ).
            lv_pv_ok = abap_true.
          ENDIF.
        ENDLOOP.
        IF lv_pv_ok = abap_false.
          lv_stlal = ls_act-stlal.
          lv_sc4   = abap_true.
          lv_pv_alt = lt_pv[ 1 ]-stlal.
        ENDIF.
      ENDIF.
    ENDIF.

    " pass 1: probe - finds the BOM / alternative and its base quantity
    DO 2 TIMES.                                   " NEW: round 2 only for scenario 3
      CLEAR lt_probe.
      CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
        EXPORTING
          aumgb                 = 'X'
          mktls                 = 'X'
          capid                 = lv_capid        " NEW (was ms_par-capid)
          datuv                 = lv_datuv        " NEW (was sy-datum)
          auskz                 = 'X'
          mehrs                 = 'X'
          rndkz                 = '1'
          mmory                 = space
          mtnrv                 = iv_head
          stlal                 = lv_stlal        " NEW (was space)
          stlan                 = '1'
          stpst                 = 0
          svwvo                 = 'X'
          vrsvo                 = 'X'
          werks                 = is_plant-werks
        TABLES
          stb                   = lt_probe
        EXCEPTIONS
          alt_not_found         = 1
          call_invalid          = 2
          material_not_found    = 3
          missing_authorization = 4
          no_bom_found          = 5
          no_plant_data         = 6
          no_suitable_bom_found = 7
          conversion_error      = 8
          OTHERS                = 9.
      lv_subrc = sy-subrc.

      IF ( lv_subrc = 0 AND lt_probe IS NOT INITIAL ) OR sy-index = 2.
        EXIT.                                     " worked (scenario 1 / 2) or round 2 done
      ENDIF.

      " NEW: scenario 3 - no active BOM but an inactive one exists:
      "      latest alternative, capid blank (no BOM status filter)
      IF lv_cnt > 0 OR ls_any IS INITIAL.
        EXIT.                                     " not scenario 3 -> original skip message below
      ENDIF.
      lv_sc3   = abap_true.
      CLEAR lv_capid.
      lv_stlal = ls_any-stlal.
      IF ls_any-datuv > lv_datuv.
        lv_datuv = ls_any-datuv.                  " future-dated BOM: explode as of its valid-from
      ENDIF.
    ENDDO.

    IF lv_subrc <> 0 OR lt_probe IS INITIAL.
      add_skip( iv_matnr = iv_head
                iv_werks = is_plant-werks
                iv_msg   = SWITCH string( lv_subrc
                  WHEN 0 THEN 'BOM exists but has no valid items on this date'
                  WHEN 1 THEN 'No alternative BOM found for today (auto-selected)'
                  WHEN 2 THEN 'Invalid call / parameter combination'
                  WHEN 3 THEN 'Material not found'
                  WHEN 4 THEN 'Missing authorization'
                  WHEN 5 THEN 'No BOM exists'
                  WHEN 6 THEN 'No plant data for this material'
                  WHEN 7 THEN 'No suitable BOM found for usage / date'
                  WHEN 8 THEN 'Conversion error'
                  ELSE 'BOM explosion failed' ) ).
      RETURN.
    ENDIF.

    READ TABLE lt_probe INTO DATA(ls_probe) WITH KEY stufe = 1.
    IF sy-subrc <> 0.
      add_skip( iv_matnr = iv_head
                iv_werks = is_plant-werks
                iv_msg   = 'BOM exists but has no valid items on this date' ).
      RETURN.
    ENDIF.

    IF lv_sc4 = abap_true.                        " NEW: show users that the production version alternative was skipped
      add_skip( iv_matnr = iv_head
                iv_werks = is_plant-werks
                iv_msg   = |Info: the production version names alternative { lv_pv_alt }, which is not active (locked); active alternative { ls_probe-stlal } used| ).
    ENDIF.

    IF lv_sc3 = abap_true.                        " NEW: show users that an inactive BOM was used
      add_skip( iv_matnr = iv_head
                iv_werks = is_plant-werks
                iv_msg   = |Info: no active BOM - latest alternative { ls_probe-stlal } used without BOM status filter (as of { lv_datuv DATE = USER })| ).
    ENDIF.

    SELECT SINGLE bmeng, bmein FROM stko
      WHERE stlty = @ls_probe-stlty
        AND stlnr = @ls_probe-stlnr
        AND stlal = @ls_probe-stlal
      INTO (@lv_fmeng, @lv_fmein).

    " pass 2: real explosion with the BOM base quantity
    IF lv_fmeng > 0.
      CALL FUNCTION 'CS_BOM_EXPL_MAT_V2'
        EXPORTING
          aumgb                 = 'X'
          mktls                 = 'X'
          capid                 = lv_capid        " NEW (was ms_par-capid)
          datuv                 = lv_datuv        " NEW (was sy-datum)
          emeng                 = lv_fmeng
          auskz                 = 'X'
          mehrs                 = 'X'
          rndkz                 = '1'
          mmory                 = space
          mtnrv                 = iv_head
          stlal                 = ls_probe-stlal
          stlan                 = '1'
          stpst                 = 0
          svwvo                 = 'X'
          vrsvo                 = 'X'
          werks                 = is_plant-werks
        IMPORTING
          topmat                = ls_topmat
        TABLES
          stb                   = lt_stb
        EXCEPTIONS
          alt_not_found         = 1
          call_invalid          = 2
          material_not_found    = 3
          missing_authorization = 4
          no_bom_found          = 5
          no_plant_data         = 6
          no_suitable_bom_found = 7
          conversion_error      = 8
          OTHERS                = 9.
      IF sy-subrc <> 0 OR lt_stb IS INITIAL.
        lt_stb = lt_probe.
      ENDIF.
    ELSE.
      lt_stb = lt_probe.
    ENDIF.

    " stack of last-seen component per level -> immediate parent of each row
    " ... your original code from here to ENDMETHOD, unchanged ...

    " stack of last-seen component per level -> immediate parent of each row
    " ... everything from here down is your original code, unchanged ...

    " stack of last-seen component per level -> immediate parent of each row
    DO gc_max_level TIMES.
      APPEND iv_head TO lt_stack.
    ENDDO.

    LOOP AT lt_stb INTO DATA(ls_stb).
      IF ls_stb-stufe < 1 OR ls_stb-stufe > gc_max_level.
        CONTINUE.
      ENDIF.

      IF ls_stb-stufe = 1.
        lv_parent = iv_head.
      ELSE.
        lv_idx = ls_stb-stufe - 1.
        READ TABLE lt_stack INTO lv_parent INDEX lv_idx.
        IF sy-subrc <> 0.
          lv_parent = iv_head.
        ENDIF.
      ENDIF.
      MODIFY lt_stack FROM ls_stb-idnrk INDEX ls_stb-stufe.

      IF ls_stb-stufe > ms_par-max_level.
        CONTINUE.
      ENDIF.

      CLEAR ls_item.
      mv_seq = mv_seq + 1.
      ls_item-seqnr   = mv_seq.
      ls_item-land1   = is_plant-land1.
      ls_item-hwerks  = is_plant-werks.
      ls_item-headmat = iv_head.
      ls_item-usedqty = iv_emeng.
      ls_item-qtysrc  = iv_qsrc.
      ls_item-parent  = lv_parent.
      ls_item-level   = ls_stb-stufe.
      ls_item-idnrk   = ls_stb-idnrk.
      ls_item-menge   = ls_stb-mngko.
      ls_item-meins   = ls_stb-meins.
      ls_item-postp   = ls_stb-postp.
      ls_item-posnr   = ls_stb-posnr.
      ls_item-stlan   = ls_stb-stlan.
      ls_item-stlal   = ls_stb-stlal.
      ls_item-stlty   = ls_stb-stlty.
      ls_item-stlnr   = ls_stb-stlnr.
      ls_item-aennr   = ls_stb-aennr.
      IF ls_stb-werks IS NOT INITIAL.
        ls_item-werks = ls_stb-werks.
      ELSE.
        ls_item-werks = is_plant-werks.
      ENDIF.
      APPEND ls_item TO mt_item.
    ENDLOOP.
  ENDMETHOD.


  METHOD flag_parent_nodes.
    DATA(lv_max) = lines( mt_item ).
    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<i>).
      DATA(lv_next) = sy-tabix + 1.
      CLEAR <i>-haschild.
      CHECK lv_next <= lv_max.
      READ TABLE mt_item INTO DATA(ls_next) INDEX lv_next.
      IF sy-subrc = 0
         AND ls_next-headmat = <i>-headmat
         AND ls_next-hwerks  = <i>-hwerks
         AND ls_next-level   > <i>-level.
        <i>-haschild = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_actual_qty.
    DATA lr_mtart TYPE zif_mm_bom_cost_types=>ty_r_mtart.

    IF ms_par-budat IS INITIAL.
      RETURN.
    ENDIF.

    CLEAR lr_mtart.
    APPEND LINES OF mo_util->cfg_mtart_range( iv_key = 'MTART_FG'   iv_default = 'FERT' ) TO lr_mtart.
    APPEND LINES OF mo_util->cfg_mtart_range( iv_key = 'MTART_FRT2' iv_default = 'FRT2' ) TO lr_mtart.
    APPEND LINES OF mo_util->cfg_mtart_range( iv_key = 'MTART_WIP'  iv_default = 'WIP'  ) TO lr_mtart.

*    lr_mtart = VALUE #( sign = 'I' option = 'EQ'
*      ( low = CONV #( mo_util->cfg( iv_key = 'MTART_FG'   iv_default = 'FERT' ) ) )
*      ( low = CONV #( mo_util->cfg( iv_key = 'MTART_FRT2' iv_default = 'FRT2' ) ) )
*      ( low = CONV #( mo_util->cfg( iv_key = 'MTART_WIP'  iv_default = 'WIP'  ) ) ) ).
    DATA(lv_pstyp) = CONV ekpo-pstyp( mo_util->cfg( iv_key = 'SUBCON_PSTYP' iv_default = '3' ) ).

    SELECT a~matnr, a~werks, SUM( a~menge ) AS menge
      FROM mseg AS a
      INNER JOIN mara AS b ON a~matnr = b~matnr
      LEFT OUTER JOIN ekpo AS c ON c~ebeln = a~ebeln AND c~ebelp = a~ebelp
      WHERE a~matnr      IN @ms_par-matnr
        AND a~werks      IN @ms_par-werks
        AND a~bwart       = '101'
        AND a~budat_mkpf IN @ms_par-budat
        AND b~mtart      IN @lr_mtart
        AND ( a~aufnr <> @space
              OR ( a~ebeln <> @space AND c~pstyp = @lv_pstyp ) )
      GROUP BY a~matnr, a~werks
      INTO TABLE @DATA(lt_raw).

    LOOP AT lt_raw INTO DATA(ls_raw).
      INSERT VALUE #( matnr = ls_raw-matnr werks = ls_raw-werks menge = ls_raw-menge )
             INTO TABLE rt_actual.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_base_quantities.
    TYPES: BEGIN OF ty_bomkey,
             stlty TYPE stko-stlty,
             stlnr TYPE stko-stlnr,
             stlal TYPE stko-stlal,
           END OF ty_bomkey,
           BEGIN OF ty_stko,
             stlty TYPE stko-stlty,
             stlnr TYPE stko-stlnr,
             stlal TYPE stko-stlal,
             stkoz TYPE stko-stkoz,
             datuv TYPE stko-datuv,
             bmeng TYPE stko-bmeng,
             bmein TYPE stko-bmein,
           END OF ty_stko,
           BEGIN OF ty_hb,
             hwerks  TYPE werks_d,
             headmat TYPE matnr,
             hbmeng  TYPE stko-bmeng,
             hbmein  TYPE stko-bmein,
           END OF ty_hb.

    DATA: lt_key  TYPE STANDARD TABLE OF ty_bomkey,
          lt_stko TYPE STANDARD TABLE OF ty_stko,
          lt_hb   TYPE HASHED TABLE OF ty_hb WITH UNIQUE KEY hwerks headmat.

    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<k>) WHERE stlnr IS NOT INITIAL.
      APPEND VALUE #( stlty = <k>-stlty stlnr = <k>-stlnr stlal = <k>-stlal ) TO lt_key.
    ENDLOOP.
    SORT lt_key BY stlty stlnr stlal.
    DELETE ADJACENT DUPLICATES FROM lt_key COMPARING stlty stlnr stlal.

    IF lt_key IS NOT INITIAL.
      SELECT stlty, stlnr, stlal, stkoz, datuv, bmeng, bmein
        FROM stko
        FOR ALL ENTRIES IN @lt_key
        WHERE stlty = @lt_key-stlty
          AND stlnr = @lt_key-stlnr
          AND stlal = @lt_key-stlal
        INTO TABLE @lt_stko.
      DELETE lt_stko WHERE datuv > sy-datum.
      SORT lt_stko BY stlty ASCENDING stlnr ASCENDING stlal ASCENDING
                      datuv DESCENDING stkoz DESCENDING.

      LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<i>).
        READ TABLE lt_stko INTO DATA(ls_stko)
             WITH KEY stlty = <i>-stlty stlnr = <i>-stlnr stlal = <i>-stlal
             BINARY SEARCH.
        IF sy-subrc = 0.
          <i>-bmeng = ls_stko-bmeng.
          <i>-bmein = ls_stko-bmein.
        ENDIF.
      ENDLOOP.
    ENDIF.

    " header base qty = BOM base qty of the header's level-1 rows
    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<l1>) WHERE level = 1.
      INSERT VALUE #( hwerks = <l1>-hwerks headmat = <l1>-headmat
                      hbmeng = <l1>-bmeng  hbmein  = <l1>-bmein )
             INTO TABLE lt_hb.
    ENDLOOP.

    " PROD_QTY = MENGE x USEDQTY / HBMENG
    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<p>).
      READ TABLE lt_hb ASSIGNING FIELD-SYMBOL(<hb>)
           WITH TABLE KEY hwerks = <p>-hwerks headmat = <p>-headmat.
      IF sy-subrc = 0.
        <p>-hbmeng = <hb>-hbmeng.
        <p>-hbmein = <hb>-hbmein.
      ENDIF.
      IF <p>-hbmeng > 0.
        <p>-prod_qty = <p>-menge * <p>-usedqty / <p>-hbmeng.
      ELSEIF <p>-prod_qty = 0.
        <p>-prod_qty = <p>-menge.
      ENDIF.
    ENDLOOP.

    SORT mt_item BY land1 hwerks headmat seqnr.
  ENDMETHOD.


  METHOD get_header_attributes.
    TYPES: BEGIN OF ty_headattr,
             matnr         TYPE matnr,
             zskugrcodecrs TYPE c LENGTH 30,
             zskugroupcrs  TYPE c LENGTH 50,
             prodha        TYPE c LENGTH 18,
             zskusize      TYPE zskusize,
             ntgew         TYPE ntgew,
             matkl         TYPE matkl,
             zscheme       TYPE zscheme,
             zbusiness     TYPE zbusiness,
           END OF ty_headattr.
    DATA: lt_mat  TYPE STANDARD TABLE OF zif_mm_bom_cost_types=>ty_head,
          lt_attr TYPE STANDARD TABLE OF ty_headattr.

    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<k>).
      APPEND VALUE #( matnr = <k>-headmat ) TO lt_mat.
    ENDLOOP.
    SORT lt_mat BY matnr.
    DELETE ADJACENT DUPLICATES FROM lt_mat COMPARING matnr.
    DELETE lt_mat WHERE matnr IS INITIAL.
    CHECK lt_mat IS NOT INITIAL.

    SELECT matnr, zskugrcodecrs, zskugroupcrs, prodha, zskusize,
           ntgew, matkl, zscheme, zbusiness
      FROM mara
      FOR ALL ENTRIES IN @lt_mat
      WHERE matnr = @lt_mat-matnr
      INTO CORRESPONDING FIELDS OF TABLE @lt_attr.
    CHECK sy-subrc = 0.
    SORT lt_attr BY matnr.

    LOOP AT mt_item ASSIGNING FIELD-SYMBOL(<i>).
      READ TABLE lt_attr INTO DATA(ls_a) WITH KEY matnr = <i>-headmat BINARY SEARCH.
      IF sy-subrc = 0.
        <i>-zskugrcodecrs = ls_a-zskugrcodecrs.
        <i>-zskugroupcrs  = ls_a-zskugroupcrs.
        <i>-prodha        = ls_a-prodha.
        <i>-zscheme       = ls_a-zscheme.
        <i>-zskusize      = ls_a-zskusize.
        <i>-ntgew         = ls_a-ntgew.
        <i>-matkl         = ls_a-matkl.
        <i>-zbusiness     = ls_a-zbusiness.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD pick_bom.
    DATA: lt_b   TYPE STANDARD TABLE OF ty_bompick,
          lt_cur TYPE STANDARD TABLE OF ty_bompick.
    CLEAR: es_act, es_any, ev_cnt_act, et_act.

    SELECT s~stlal, s~datuv, s~stlnr, s~stlst
      FROM mast AS m
      INNER JOIN stko AS s ON s~stlnr = m~stlnr AND s~stlal = m~stlal
      WHERE m~matnr = @iv_matnr
        AND m~werks = @iv_werks
        AND m~stlan = '1'
        AND s~stlty = 'M'
        AND s~loekz = @space                               " not deleted
      INTO TABLE @lt_b.
    IF lt_b IS INITIAL.
      RETURN.
    ENDIF.

    " newest record per alternative
    SORT lt_b BY stlal ASCENDING datuv DESCENDING.

    " active = the record valid today carries the active status
    lt_cur = lt_b.
    DELETE lt_cur WHERE datuv > sy-datum.
    DELETE ADJACENT DUPLICATES FROM lt_cur COMPARING stlal.
    DELETE lt_cur WHERE stlst <> gc_stlst_active.
    ev_cnt_act = lines( lt_cur ).
    SORT lt_cur BY datuv DESCENDING stlal DESCENDING.      " latest valid-from, then highest alt
    et_act = lt_cur.
    READ TABLE lt_cur INTO es_act INDEX 1.

    " latest alternative of all, any status or date
    DELETE ADJACENT DUPLICATES FROM lt_b COMPARING stlal.
    SORT lt_b BY datuv DESCENDING stlal DESCENDING.
    READ TABLE lt_b INTO es_any INDEX 1.
  ENDMETHOD.
ENDCLASS.
