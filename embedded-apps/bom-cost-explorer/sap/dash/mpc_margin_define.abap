  METHOD dash_margin_define.
    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,
          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_et = model->create_entity_type( iv_entity_type_name = 'DashMargin' iv_def_entity_set = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Grain' iv_field = 'GRAIN' iv_len = 1 iv_key = abap_true ).
    dash_str( io_et = lo_et iv_name = 'Zbrand' iv_field = 'ZBRAND' iv_len = 10 iv_key = abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Matnr' iv_abap_fieldname = 'MATNR' ).
    lo_p->set_is_key( ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 18 ).
    lo_p->set_conversion_exit( 'MATN1' ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Bwtar' iv_field = 'BWTAR' iv_len = 10 iv_key = abap_true ).
    dash_str( io_et = lo_et iv_name = 'Kunag' iv_field = 'KUNAG' iv_len = 10 iv_key = abap_true ).
    dash_str( io_et = lo_et iv_name = 'Maktx' iv_field = 'MAKTX' iv_len = 40 ).
    dash_str( io_et = lo_et iv_name = 'Matkl' iv_field = 'MATKL' iv_len = 9 ).
    dash_str( io_et = lo_et iv_name = 'KunagTxt' iv_field = 'KUNAG_TXT' iv_len = 35 ).
    dash_str( io_et = lo_et iv_name = 'Zscheme' iv_field = 'ZSCHEME' iv_len = 1 ).
    dash_str( io_et = lo_et iv_name = 'Mtart' iv_field = 'MTART' iv_len = 4 ).
    dash_str( io_et = lo_et iv_name = 'Crssku' iv_field = 'CRSSKU' iv_len = 30 ).
    dash_str( io_et = lo_et iv_name = 'Zbusiness' iv_field = 'ZBUSINESS' iv_len = 6 ).
    dash_str( io_et = lo_et iv_name = 'BudVer' iv_field = 'BUD_VER' iv_len = 2 ).
    dash_str( io_et = lo_et iv_name = 'BudFlag' iv_field = 'BUD_FLAG' iv_len = 10 ).
    dash_str( io_et = lo_et iv_name = 'Msg' iv_field = 'MSG' iv_len = 120 ).
    lo_p = lo_et->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'DateFrom' iv_abap_fieldname = 'DATE_FROM' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'DateTo' iv_abap_fieldname = 'DATE_TO' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_true ).
    dash_dec( io_et = lo_et iv_name = 'Qty' iv_field = 'QTY' iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'Mrp' iv_field = 'MRP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Sp' iv_field = 'SP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ChRet' iv_field = 'CH_RET' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ChDis' iv_field = 'CH_DIS' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ChSs' iv_field = 'CH_SS' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Gst' iv_field = 'GST' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Rm' iv_field = 'RM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Pm' iv_field = 'PM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Pf' iv_field = 'PF' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Oh' iv_field = 'OH' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CRm' iv_field = 'C_RM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CPm' iv_field = 'C_PM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CPf' iv_field = 'C_PF' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'COh' iv_field = 'C_OH' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TRm' iv_field = 'T_RM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TPm' iv_field = 'T_PM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TPf' iv_field = 'T_PF' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TOh' iv_field = 'T_OH' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'BudRm' iv_field = 'BUD_RM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'BudPm' iv_field = 'BUD_PM' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'BudPf' iv_field = 'BUD_PF' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'BudOh' iv_field = 'BUD_OH' iv_len = 23 iv_scale = 6 ).
    lo_et->bind_structure( iv_structure_name = 'ZDASH_S_MARGIN' iv_bind_conversions = 'X' ).
    lo_es = lo_et->create_entity_set( 'DashMarginSet' ).
    lo_es->set_creatable( abap_false ).
    lo_es->set_updatable( abap_false ).
    lo_es->set_deletable( abap_false ).
    lo_es->set_pageable( abap_false ).
    lo_es->set_addressable( abap_true ).
    lo_es->set_has_ftxt_search( abap_false ).
  ENDMETHOD.
