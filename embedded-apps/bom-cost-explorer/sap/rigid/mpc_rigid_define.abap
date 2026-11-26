  METHOD rigid_define.
    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,
          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_et = model->create_entity_type( iv_entity_type_name = 'Rigid' iv_def_entity_set = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Grain' iv_field = 'GRAIN' iv_len = 1 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Rowid' iv_field = 'ROWID' iv_len = 12 iv_key = abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'Matnr' iv_abap_fieldname = 'MATNR' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 18 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Maktx' iv_field = 'MAKTX' iv_len = 40 iv_key = abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Mould' iv_field = 'MOULD' iv_len = 18 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'MouldTxt' iv_field = 'MOULD_TXT' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Mds' iv_field = 'MDS' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Design' iv_field = 'DESIGN' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Mcat' iv_field = 'MCAT' iv_len = 4 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'McatTxt' iv_field = 'MCAT_TXT' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Lifnr' iv_field = 'LIFNR' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Vendor' iv_field = 'VENDOR' iv_len = 35 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Mach' iv_field = 'MACH' iv_len = 4 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'MachTxt' iv_field = 'MACH_TXT' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Flag' iv_field = 'FLAG' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Msg' iv_field = 'MSG' iv_len = 120 iv_key = abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Gjahr' iv_abap_fieldname = 'GJAHR' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Uname' iv_field = 'UNAME' iv_len = 12 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Infnr' iv_field = 'INFNR' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Comp' iv_field = 'COMP' iv_len = 18 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'CompTxt' iv_field = 'COMP_TXT' iv_len = 40 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Gewei' iv_field = 'GEWEI' iv_len = 3 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Origin' iv_field = 'ORIGIN' iv_len = 10 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Meins' iv_field = 'MEINS' iv_len = 3 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Waers' iv_field = 'WAERS' iv_len = 5 iv_key = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Category' iv_field = 'CATEGORY' iv_len = 10 iv_key = abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Mode' iv_abap_fieldname = 'MODE' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 1 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'ValidFrom' iv_abap_fieldname = 'VALID_FROM' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'ValidTo' iv_abap_fieldname = 'VALID_TO' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'CrtDate' iv_abap_fieldname = 'CRT_DATE' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'Nmould' iv_abap_fieldname = 'NMOULD' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
    dash_dec( io_et = lo_et iv_name = 'Ntgew' iv_field = 'NTGEW' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'RunCavity' iv_field = 'RUN_CAVITY' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CycTime' iv_field = 'CYC_TIME' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'HoursDay' iv_field = 'HOURS_DAY' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FacProd' iv_field = 'FAC_PROD' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TotOut' iv_field = 'TOT_OUT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TotOutMon' iv_field = 'TOT_OUT_MON' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Kansw' iv_field = 'KANSW' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Nafag' iv_field = 'NAFAG' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zujhr' iv_field = 'ZUJHR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'OpenPr' iv_field = 'OPEN_PR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmrt' iv_field = 'ZMRT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ConvCost' iv_field = 'CONV_COST' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'MatCost' iv_field = 'MAT_COST' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmbx' iv_field = 'ZMBX' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmpb' iv_field = 'ZMPB' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmtp' iv_field = 'ZMTP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zppb' iv_field = 'ZPPB' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ZppbT' iv_field = 'ZPPB_T' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmac' iv_field = 'ZMAC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmat' iv_field = 'ZMAT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zitc' iv_field = 'ZITC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmar' iv_field = 'ZMAR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zehp' iv_field = 'ZEHP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zwad' iv_field = 'ZWAD' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zdaj' iv_field = 'ZDAJ' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmfg' iv_field = 'ZMFG' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'LandRate' iv_field = 'LAND_RATE' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CompQty' iv_field = 'COMP_QTY' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'BomQty' iv_field = 'BOM_QTY' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'DosPerc' iv_field = 'DOS_PERC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'DosPercS' iv_field = 'DOS_PERC_S' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'ScrapPct' iv_field = 'SCRAP_PCT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zpbr' iv_field = 'ZPBR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmds' iv_field = 'ZMDS' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Zmfr' iv_field = 'ZMFR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'CompCost' iv_field = 'COMP_COST' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Budqty' iv_field = 'BUDQTY' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Basic' iv_field = 'BASIC' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'DiscAmt' iv_field = 'DISC_AMT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'TaxAmt' iv_field = 'TAX_AMT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FrgAmt' iv_field = 'FRG_AMT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Freight' iv_field = 'FREIGHT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Landed' iv_field = 'LANDED' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Total' iv_field = 'TOTAL' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'RSap' iv_field = 'R_SAP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'RUsed' iv_field = 'R_USED' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FUsed' iv_field = 'F_USED' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Cbr' iv_field = 'CBR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Cbud' iv_field = 'CBUD' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'Br' iv_field = 'BR' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'VarPct' iv_field = 'VAR_PCT' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'LandedRate' iv_field = 'LANDED_RATE' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FrtTotal' iv_field = 'FRT_TOTAL' iv_len = 23 iv_scale = 6 ).
    lo_et->bind_structure( iv_structure_name = 'ZRIGID_S_ROW' iv_bind_conversions = 'X' ).
    lo_es = lo_et->create_entity_set( 'RigidSet' ).
    lo_es->set_creatable( abap_false ).
    lo_es->set_updatable( abap_false ).
    lo_es->set_deletable( abap_false ).
    lo_es->set_pageable( abap_false ).
    lo_es->set_addressable( abap_true ).
    lo_es->set_has_ftxt_search( abap_false ).
  ENDMETHOD.
