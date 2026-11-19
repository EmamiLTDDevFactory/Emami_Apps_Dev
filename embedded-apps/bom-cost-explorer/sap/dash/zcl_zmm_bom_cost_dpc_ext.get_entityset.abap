* Added to ZCL_ZMM_BOM_COST_DPC_EXT (PUBLIC SECTION: METHODS /iwbep/if_mgw_appl_srv_runtime~get_entityset REDEFINITION).
  METHOD /iwbep/if_mgw_appl_srv_runtime~get_entityset.
    DATA: lt_mis TYPE zcl_mm_dash_mis=>tt_mis,
          ls_par TYPE zif_mm_wac_types=>ty_par.
    IF iv_entity_set_name <> 'DashMisSet'.
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
    ls_par = wac_par( io_tech_request_context->get_filter( )->get_filter_select_options( ) ).
    IF ls_par-werks IS INITIAL.
      raise_busi( 'Select at least one plant' ).
    ENDIF.
    TRY.
        lt_mis = NEW zcl_mm_dash_mis( ls_par )->run( ).
      CATCH cx_root INTO DATA(lx).
        raise_busi( |MIS dashboard failed: { lx->get_text( ) }| ).
    ENDTRY.
    copy_data_to_ref( EXPORTING is_data = lt_mis CHANGING cr_data = er_entityset ).
  ENDMETHOD.
