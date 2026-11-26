  METHOD matdoc_define.
    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,
          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_et = model->create_entity_type( iv_entity_type_name = 'MatDoc' iv_def_entity_set = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Rowid' iv_field = 'ROWID' iv_len = 12 iv_key = abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Mode' iv_abap_fieldname = 'MODE' ).
    lo_p->set_type_edm_string( ). lo_p->set_maxlength( iv_max_length = 1 ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Matnr' iv_abap_fieldname = 'MATNR' ).
    lo_p->set_type_edm_string( ). lo_p->set_maxlength( iv_max_length = 18 ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Maktx' iv_field = 'MAKTX' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Mtart' iv_field = 'MTART' iv_len = 4 iv_key = abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'DocType' iv_abap_fieldname = 'DOC_TYPE' ).
    lo_p->set_type_edm_string( ). lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'DocId' iv_abap_fieldname = 'DOC_ID' ).
    lo_p->set_type_edm_string( ). lo_p->set_maxlength( iv_max_length = 46 ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Title' iv_field = 'TITLE' iv_len = 50 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'FileExt' iv_field = 'FILE_EXT' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'CreatedBy' iv_field = 'CREATED_BY' iv_len = 12 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'AttTs' iv_field = 'ATT_TS' iv_len = 14 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Msg' iv_field = 'MSG' iv_len = 120 iv_key = abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Crdat' iv_abap_fieldname = 'CRDAT' ).
    lo_p->set_type_edm_datetime( ). lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_true ). lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'DocSize' iv_abap_fieldname = 'DOC_SIZE' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Versions' iv_abap_fieldname = 'VERSIONS' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Chunk' iv_abap_fieldname = 'CHUNK' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Chunks' iv_abap_fieldname = 'CHUNKS' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Content' iv_abap_fieldname = 'CONTENT' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_creatable( abap_false ). lo_p->set_updatable( abap_false ). lo_p->set_sortable( abap_false ). lo_p->set_nullable( abap_false ). lo_p->set_filterable( abap_false ).
    lo_et->bind_structure( iv_structure_name = 'ZMATDOC_S_ROW' iv_bind_conversions = 'X' ).
    lo_es = lo_et->create_entity_set( 'MatDocSet' ).
    lo_es->set_creatable( abap_false ).
    lo_es->set_updatable( abap_false ).
    lo_es->set_deletable( abap_false ).
    lo_es->set_pageable( abap_false ).
    lo_es->set_addressable( abap_true ).
    lo_es->set_has_ftxt_search( abap_false ).
  ENDMETHOD.


  METHOD get_last_modified.
    " Bump this stamp on every model change: the gateway then rebuilds its cached model on all servers (no manual cache cleanup).
    CONSTANTS lc_model_ts TYPE timestamp VALUE '20261126120000'.
    rv_last_modified = super->get_last_modified( ).
    IF rv_last_modified < lc_model_ts.
      rv_last_modified = lc_model_ts.
    ENDIF.
  ENDMETHOD.
