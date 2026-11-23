  METHOD dash_cdrill_define.
    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,
          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_et = model->create_entity_type( iv_entity_type_name = 'DashCdrill' iv_def_entity_set = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Grain' iv_field = 'GRAIN' iv_len = 1 iv_key = abap_true ).
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
    dash_str( io_et = lo_et iv_name = 'Charg' iv_field = 'CHARG' iv_len = 10 iv_key = abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Idnrk' iv_abap_fieldname = 'IDNRK' ).
    lo_p->set_is_key( ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 18 ).
    lo_p->set_conversion_exit( 'MATN1' ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
    dash_str( io_et = lo_et iv_name = 'Maktx' iv_field = 'MAKTX' iv_len = 40 ).
    dash_str( io_et = lo_et iv_name = 'Mtart' iv_field = 'MTART' iv_len = 4 ).
    dash_str( io_et = lo_et iv_name = 'Matkl' iv_field = 'MATKL' iv_len = 9 ).
    dash_str( io_et = lo_et iv_name = 'Cat' iv_field = 'CAT' iv_len = 1 ).
    dash_str( io_et = lo_et iv_name = 'Meins' iv_field = 'MEINS' iv_len = 3 ).
    dash_str( io_et = lo_et iv_name = 'Flag' iv_field = 'FLAG' iv_len = 10 ).
    dash_str( io_et = lo_et iv_name = 'Msg' iv_field = 'MSG' iv_len = 120 ).
    lo_p = lo_et->create_property( iv_property_name = 'Orders' iv_abap_fieldname = 'ORDERS' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Vkorg' iv_abap_fieldname = 'VKORG' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Vtweg' iv_abap_fieldname = 'VTWEG' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 2 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Vbeln' iv_abap_fieldname = 'VBELN' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 10 ).
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
    dash_dec( io_et = lo_et iv_name = 'SoldQty' iv_field = 'SOLD_QTY' iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'ProdQty' iv_field = 'PROD_QTY' iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'Qty' iv_field = 'QTY' iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'Val' iv_field = 'VAL' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'AvgQtyPc' iv_field = 'AVG_QTY_PC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'AvgCostPc' iv_field = 'AVG_COST_PC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'RmPc' iv_field = 'RM_PC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'PmPc' iv_field = 'PM_PC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'PfPc' iv_field = 'PF_PC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'OthPc' iv_field = 'OTH_PC' iv_len = 23 iv_scale = 6 ).
    lo_et->bind_structure( iv_structure_name = 'ZDASH_S_CDRILL' iv_bind_conversions = 'X' ).
    lo_es = lo_et->create_entity_set( 'DashCdrillSet' ).
    lo_es->set_creatable( abap_false ).
    lo_es->set_updatable( abap_false ).
    lo_es->set_deletable( abap_false ).
    lo_es->set_pageable( abap_false ).
    lo_es->set_addressable( abap_true ).
    lo_es->set_has_ftxt_search( abap_false ).
  ENDMETHOD.
