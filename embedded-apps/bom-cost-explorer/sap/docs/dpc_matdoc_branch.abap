    IF iv_entity_set_name = 'MatDocSet'.
      DATA: lr_dm   TYPE zcl_mm_mat_docs=>ty_r_matnr,
            lv_dmod TYPE c LENGTH 1,
            lv_dtyp TYPE c LENGTH 4,
            lv_did  TYPE string,
            lv_dch  TYPE i,
            lt_mdoc TYPE zcl_mm_mat_docs=>tt_row.
      LOOP AT io_tech_request_context->get_filter( )->get_filter_select_options( ) INTO DATA(ls_dsf).
        CHECK lines( ls_dsf-select_options ) > 0.
        DATA(lv_dsp) = to_upper( CONV string( ls_dsf-property ) ).
        REPLACE ALL OCCURRENCES OF '_' IN lv_dsp WITH ''.
        CASE lv_dsp.
          WHEN 'MATNR'.   lr_dm = CORRESPONDING #( ls_dsf-select_options ).
          WHEN 'MODE'.    lv_dmod = ls_dsf-select_options[ 1 ]-low.
          WHEN 'DOCTYPE'. lv_dtyp = ls_dsf-select_options[ 1 ]-low.
          WHEN 'DOCID'.   lv_did = ls_dsf-select_options[ 1 ]-low.
          WHEN 'CHUNK'.   lv_dch = ls_dsf-select_options[ 1 ]-low.
        ENDCASE.
      ENDLOOP.
      IF lr_dm IS INITIAL.
        raise_busi( 'Give the material (Matnr)' ).
      ENDIF.
      IF lines( lr_dm ) > 200.
        raise_busi( 'At most 200 materials per call' ).
      ENDIF.
      TRY.
          DATA(lo_mdoc) = NEW zcl_mm_mat_docs( it_matnr = lr_dm iv_type = lv_dtyp ).
          CASE lv_dmod.
            WHEN 'V'. lt_mdoc = lo_mdoc->versions( ).
            WHEN 'C'. lt_mdoc = lo_mdoc->chunk( iv_doc_id = lv_did iv_chunk = lv_dch ).
            WHEN OTHERS. lt_mdoc = lo_mdoc->latest( ).
          ENDCASE.
        CATCH cx_root INTO DATA(lx_mdoc).
          raise_busi( |Material documents failed: { lx_mdoc->get_text( ) }| ).
      ENDTRY.
      copy_data_to_ref( EXPORTING is_data = lt_mdoc CHANGING cr_data = er_entityset ).
      RETURN.
    ENDIF.
