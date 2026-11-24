* Added to ZCL_ZMM_BOM_COST_DPC_EXT (PUBLIC SECTION: METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION).
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA: lt_mis TYPE zcl_mm_dash_mis=>tt_mis,
          lt_sal TYPE zcl_mm_dash_sales=>tt_sales,
          lt_pvm TYPE zcl_sales_pvm_bridge=>tt_pvm,
          lt_mgn TYPE zcl_mm_dash_margin=>tt_margin,
          lt_cdr TYPE zcl_mm_dash_cdrill=>tt_cdrill,
          lt_thr TYPE STANDARD TABLE OF zmis_alert_thr,
          ls_par TYPE zif_mm_wac_types=>ty_par.
    IF iv_entity_set_name <> 'DashMisSet' AND iv_entity_set_name <> 'DashSalesSet' AND iv_entity_set_name <> 'DashPvmSet' AND iv_entity_set_name <> 'DashThreshSet' AND iv_entity_set_name <> 'DashMarginSet' AND iv_entity_set_name <> 'DashCdrillSet' AND iv_entity_set_name <> 'DashBridgeSet'.
      super->/iwbep/if_mgw_appl_srv_runtime~get_entityset(
        EXPORTING
          iv_entity_name           = iv_entity_name
          iv_entity_set_name       = iv_entity_set_name
          iv_source_name           = iv_source_name
          it_filter_select_options = it_filter_select_options
          it_order                 = it_order
          is_paging                = is_paging
          it_navigation_path       = it_navigation_path
          it_key_tab               = it_key_tab
          iv_filter_string         = iv_filter_string
          iv_search_string         = iv_search_string
          io_tech_request_context  = io_tech_request_context
        IMPORTING
          er_entityset             = er_entityset
          es_response_context      = es_response_context ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'DashThreshSet'.
      SELECT * FROM zmis_alert_thr INTO TABLE lt_thr.
      copy_data_to_ref( EXPORTING is_data = lt_thr CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    ls_par = wac_par( io_tech_request_context->get_filter( )->get_filter_select_options( ) ).
    IF iv_entity_set_name = 'DashBridgeSet'.
      IF ls_par-werks IS INITIAL.
        raise_busi( 'Select at least one plant' ).
      ENDIF.
      TRY.
          DATA(lt_brg) = NEW zcl_mm_cogm_bridge( ls_par )->run( ).
        CATCH cx_root INTO DATA(lx_br).
          raise_busi( |Variance bridge failed: { lx_br->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_brg CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'DashCdrillSet'.
      DATA: lr_dkorg TYPE zcl_mm_dash_cdrill=>ty_r_vkorg,
            lr_dtweg TYPE zcl_mm_dash_cdrill=>ty_r_vtweg,
            lr_dbeln TYPE zcl_mm_dash_cdrill=>ty_r_vbeln.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_cf).
        CHECK lines( ls_cf-select_options ) > 0.
        DATA(lv_cp) = to_upper( CONV string( ls_cf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_cp WITH ''.
        CASE lv_cp.
          WHEN 'VKORG'. lr_dkorg = CORRESPONDING #( ls_cf-select_options ).
          WHEN 'VTWEG'. lr_dtweg = CORRESPONDING #( ls_cf-select_options ).
          WHEN 'VBELN'. lr_dbeln = CORRESPONDING #( ls_cf-select_options ).
        ENDCASE.
      ENDLOOP.
      LOOP AT lr_dbeln ASSIGNING FIELD-SYMBOL(<cv>).
        <cv>-low = |{ <cv>-low ALPHA = IN }|.
        IF <cv>-high IS NOT INITIAL. <cv>-high = |{ <cv>-high ALPHA = IN }|. ENDIF.
      ENDLOOP.
      IF ls_par-matnr IS INITIAL.
        raise_busi( 'Give the finished good (Matnr)' ).
      ENDIF.
      TRY.
          lt_cdr = NEW zcl_mm_dash_cdrill( is_par = ls_par iv_matnr = ls_par-matnr[ 1 ]-low it_vkorg = lr_dkorg it_vtweg = lr_dtweg it_vbeln = lr_dbeln )->run( ).
        CATCH cx_root INTO DATA(lx5).
          raise_busi( |Cost drill-down failed: { lx5->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_cdr CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'DashMarginSet'.
      DATA: lr_vkorg  TYPE zcl_mm_dash_margin=>ty_r_vkorg,
            lr_vtweg  TYPE zcl_mm_dash_margin=>ty_r_vtweg,
            lr_crssku TYPE zcl_mm_dash_margin=>ty_r_crssku,
            lr_vbeln  TYPE zcl_mm_dash_margin=>ty_r_vbeln.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_mf).
        CHECK lines( ls_mf-select_options ) > 0.
        DATA(lv_mp) = to_upper( CONV string( ls_mf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_mp WITH ''.
        CASE lv_mp.
          WHEN 'VKORG'.  lr_vkorg  = CORRESPONDING #( ls_mf-select_options ).
          WHEN 'VTWEG'.  lr_vtweg  = CORRESPONDING #( ls_mf-select_options ).
          WHEN 'CRSSKU'. lr_crssku = CORRESPONDING #( ls_mf-select_options ).
          WHEN 'VBELN'.  lr_vbeln  = CORRESPONDING #( ls_mf-select_options ).
        ENDCASE.
      ENDLOOP.
      LOOP AT lr_vbeln ASSIGNING FIELD-SYMBOL(<mv>).
        <mv>-low = |{ <mv>-low ALPHA = IN }|.
        IF <mv>-high IS NOT INITIAL. <mv>-high = |{ <mv>-high ALPHA = IN }|. ENDIF.
      ENDLOOP.
      IF ls_par-werks IS INITIAL AND ls_par-matnr IS INITIAL AND lr_vkorg IS INITIAL AND lr_crssku IS INITIAL AND lr_vbeln IS INITIAL.
        raise_busi( 'Select materials, a plant, a sales organisation, a CRSSKU or an invoice number' ).
      ENDIF.
      TRY.
          lt_mgn = NEW zcl_mm_dash_margin( is_par = ls_par it_vkorg = lr_vkorg it_vtweg = lr_vtweg it_crssku = lr_crssku it_vbeln = lr_vbeln )->run( ).
        CATCH cx_root INTO DATA(lx4).
          raise_busi( |Margin analysis failed: { lx4->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_mgn CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    " the Sales view may run for all plants (blank); the PVM bridge and the rest need a plant
    IF ls_par-werks IS INITIAL AND iv_entity_set_name <> 'DashSalesSet'.
      raise_busi( 'Select at least one plant' ).
    ENDIF.
    IF iv_entity_set_name = 'DashPvmSet'.
      TRY.
          lt_pvm = NEW zcl_sales_pvm_bridge( ls_par )->run( ).
        CATCH cx_root INTO DATA(lx3).
          raise_busi( |PVM bridge failed: { lx3->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_pvm CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    IF iv_entity_set_name = 'DashSalesSet'.
      DATA: lr_skorg TYPE zcl_mm_dash_sales=>ty_r_vkorg,
            lr_stweg TYPE zcl_mm_dash_sales=>ty_r_vtweg,
            lr_svbeln TYPE zcl_mm_dash_sales=>ty_r_vbeln,
            lv_sgrain TYPE string.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_sf).
        CHECK lines( ls_sf-select_options ) > 0.
        DATA(lv_sp) = to_upper( CONV string( ls_sf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_sp WITH ''.
        CASE lv_sp.
          WHEN 'VKORG'. lr_skorg = CORRESPONDING #( ls_sf-select_options ).
          WHEN 'VTWEG'. lr_stweg = CORRESPONDING #( ls_sf-select_options ).
          WHEN 'VBELN'. lr_svbeln = CORRESPONDING #( ls_sf-select_options ).
          WHEN 'GRAIN'. lv_sgrain = to_upper( CONV string( ls_sf-select_options[ 1 ]-low ) ).
        ENDCASE.
      ENDLOOP.
      LOOP AT lr_svbeln ASSIGNING FIELD-SYMBOL(<sv>).
        <sv>-low = |{ <sv>-low ALPHA = IN }|.
        IF <sv>-high IS NOT INITIAL. <sv>-high = |{ <sv>-high ALPHA = IN }|. ENDIF.
      ENDLOOP.
      TRY.
          lt_sal = NEW zcl_mm_dash_sales( is_par = ls_par it_vkorg = lr_skorg it_vtweg = lr_stweg it_vbeln = lr_svbeln iv_invoices = xsdbool( lv_sgrain = 'I' ) )->run( ).
        CATCH cx_root INTO DATA(lx2).
          raise_busi( |Sales view failed: { lx2->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_sal CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    DATA(lv_grain) = ``.
    LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_gf).
      IF to_upper( CONV string( ls_gf-property ) ) = 'GRAIN' AND lines( ls_gf-select_options ) > 0. lv_grain = to_upper( CONV string( ls_gf-select_options[ 1 ]-low ) ). ENDIF.
    ENDLOOP.
    TRY.
        lt_mis = NEW zcl_mm_dash_mis( is_par = ls_par iv_detail = xsdbool( lv_grain = 'F' ) )->run( ).
      CATCH cx_root INTO DATA(lx).
        raise_busi( |MIS dashboard failed: { lx->get_text( ) }| ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = lt_mis CHANGING cr_data = er_entityset ).
  ENDMETHOD.
