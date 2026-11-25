    IF iv_entity_set_name = 'RigidSet'.
      DATA: lr_gm   TYPE zcl_mm_rigid_cost=>ty_r_matnr,
            lr_gw   TYPE zcl_mm_rigid_cost=>ty_r_werks,
            lv_gmod TYPE c LENGTH 1,
            lv_ggj  TYPE gjahr,
            lt_rig  TYPE zcl_mm_rigid_cost=>tt_row.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_rgf).
        CHECK lines( ls_rgf-select_options ) > 0.
        DATA(lv_rgp) = to_upper( CONV string( ls_rgf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_rgp WITH ''.
        CASE lv_rgp.
          WHEN 'MATNR'. lr_gm = CORRESPONDING #( ls_rgf-select_options ).
          WHEN 'WERKS'. lr_gw = CORRESPONDING #( ls_rgf-select_options ).
          WHEN 'MODE'.  lv_gmod = ls_rgf-select_options[ 1 ]-low.
          WHEN 'GJAHR'. lv_ggj = ls_rgf-select_options[ 1 ]-low.
        ENDCASE.
      ENDLOOP.
      IF lr_gm IS INITIAL.
        raise_busi( 'Give the packing item (Matnr)' ).
      ENDIF.
      TRY.
          DATA(lo_rig) = NEW zcl_mm_rigid_cost( it_matnr = lr_gm it_werks = lr_gw iv_gjahr = lv_ggj ).
          CASE lv_gmod.
            WHEN 'F'. lt_rig = lo_rig->flags( ).
            WHEN 'B'. lt_rig = lo_rig->budget( ).
            WHEN 'H'. lt_rig = lo_rig->history( ).
            WHEN 'U'. lt_rig = lo_rig->usage( ).
            WHEN 'G'. lt_rig = lo_rig->fgsplit( ).
            WHEN OTHERS. lt_rig = lo_rig->calc( ).
          ENDCASE.
        CATCH cx_root INTO DATA(lx_rig).
          raise_busi( |Rigid cost failed: { lx_rig->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_rig CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
