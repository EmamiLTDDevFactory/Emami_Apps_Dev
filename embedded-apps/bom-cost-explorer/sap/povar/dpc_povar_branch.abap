    " ---- Variance check (ZMM_PCOST / ZMM_COST): PoVarSet. Placed before `ls_par = wac_par(` in get_entityset; 'PoVarSet' is in the "other sets" exclusion.
    IF iv_entity_set_name = 'PoVarSet'.
      DATA: lr_vw   TYPE zcl_mm_po_variance=>ty_r_werks,
            lr_vm   TYPE zcl_mm_po_variance=>ty_r_matnr,
            lr_va   TYPE zcl_mm_po_variance=>ty_r_aufnr,
            lr_vp   TYPE zcl_mm_po_variance=>ty_r_ptype,
            lv_vfr  TYPE dats,
            lv_vto  TYPE dats,
            lv_vdt  TYPE char1,
            lv_vgr  TYPE char1,
            lt_pov  TYPE zcl_mm_po_variance=>tt_row.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_pvf).
        CHECK lines( ls_pvf-select_options ) > 0.
        DATA(lv_pvp) = to_upper( CONV string( ls_pvf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_pvp WITH ''.
        CASE lv_pvp.
          WHEN 'WERKS'.    lr_vw = CORRESPONDING #( ls_pvf-select_options ).
          WHEN 'MATNR'.    lr_vm = CORRESPONDING #( ls_pvf-select_options ).
          WHEN 'AUFNR'.    lr_va = CORRESPONDING #( ls_pvf-select_options ).
          WHEN 'POSTTYPE'. lr_vp = CORRESPONDING #( ls_pvf-select_options ).
          WHEN 'DATEFROM'. lv_vfr = ls_pvf-select_options[ 1 ]-low.
          WHEN 'DATETO'.   lv_vto = ls_pvf-select_options[ 1 ]-low.
          WHEN 'DATETYPE'. lv_vdt = ls_pvf-select_options[ 1 ]-low.
          WHEN 'GRAIN'.    lv_vgr = to_upper( CONV string( ls_pvf-select_options[ 1 ]-low ) ).
        ENDCASE.
      ENDLOOP.
      LOOP AT lr_vm ASSIGNING FIELD-SYMBOL(<pvm>).
        <pvm>-low = |{ <pvm>-low ALPHA = IN }|.
        IF <pvm>-high IS NOT INITIAL. <pvm>-high = |{ <pvm>-high ALPHA = IN }|. ENDIF.
      ENDLOOP.
      LOOP AT lr_va ASSIGNING FIELD-SYMBOL(<pva>).
        <pva>-low = |{ <pva>-low ALPHA = IN }|.
        IF <pva>-high IS NOT INITIAL. <pva>-high = |{ <pva>-high ALPHA = IN }|. ENDIF.
      ENDLOOP.
      TRY.
          DATA(lo_pov) = NEW zcl_mm_po_variance( it_werks = lr_vw it_matnr = lr_vm it_aufnr = lr_va it_ptype = lr_vp
                                                 iv_date_from = lv_vfr iv_date_to = lv_vto iv_date_type = lv_vdt ).
          IF lv_vgr = 'C'.
            IF lines( lr_va ) <> 1.
              raise_busi( 'Give one process order (Aufnr) for the component breakup' ).
            ENDIF.
            lt_pov = lo_pov->components( lr_va[ 1 ]-low ).
          ELSE.
            lt_pov = lo_pov->orders( ).
          ENDIF.
        CATCH /iwbep/cx_mgw_busi_exception INTO DATA(lx_povb).
          RAISE EXCEPTION lx_povb.
        CATCH cx_root INTO DATA(lx_pov).
          raise_busi( |Variance check failed: { lx_pov->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_pov CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
