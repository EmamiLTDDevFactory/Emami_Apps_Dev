* Added to ZCL_ZMM_BOM_COST_DPC_EXT (PUBLIC SECTION: METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION).
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA: lt_mis TYPE zcl_mm_dash_mis=>tt_mis,
          lt_sal TYPE zcl_mm_dash_sales=>tt_sales,
          lt_pvm TYPE zcl_sales_pvm_bridge=>tt_pvm,
          lt_mgn TYPE zcl_mm_dash_margin=>tt_margin,
          lt_thr TYPE STANDARD TABLE OF zmis_alert_thr,
          ls_par TYPE zif_mm_wac_types=>ty_par.
    IF iv_entity_set_name <> 'DashMisSet' AND iv_entity_set_name <> 'DashSalesSet' AND iv_entity_set_name <> 'DashPvmSet' AND iv_entity_set_name <> 'DashThreshSet' AND iv_entity_set_name <> 'DashMarginSet'.
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
    IF ls_par-werks IS INITIAL.
      raise_busi( 'Select at least one plant' ).
    ENDIF.
    IF iv_entity_set_name = 'DashMarginSet'.
      TRY.
          lt_mgn = NEW zcl_mm_dash_margin( ls_par )->run( ).
        CATCH cx_root INTO DATA(lx4).
          raise_busi( |Margin analysis failed: { lx4->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_mgn CHANGING cr_data = er_entityset ).
      RETURN.
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
      TRY.
          lt_sal = NEW zcl_mm_dash_sales( ls_par )->run( ).
        CATCH cx_root INTO DATA(lx2).
          raise_busi( |Sales view failed: { lx2->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_sal CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
    TRY.
        lt_mis = NEW zcl_mm_dash_mis( ls_par )->run( ).
      CATCH cx_root INTO DATA(lx).
        raise_busi( |MIS dashboard failed: { lx->get_text( ) }| ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = lt_mis CHANGING cr_data = er_entityset ).
  ENDMETHOD.
