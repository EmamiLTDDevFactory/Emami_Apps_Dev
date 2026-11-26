"! Model provider of OData service ZTMS_SRV (code based, no SEGW project). Entity structures live in ZCL_LIFE_INS_TY. Generated from gen/spec.py.
CLASS zcl_ztms_mpc DEFINITION PUBLIC INHERITING FROM /iwbep/cl_mgw_abs_model CREATE PUBLIC.
  PUBLIC SECTION.
    CONSTANTS gc_schema_namespace TYPE string VALUE 'ZTMS_SRV'.
    METHODS define REDEFINITION.
    METHODS get_last_modified REDEFINITION.
  PROTECTED SECTION.
    METHODS define_entities RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_associations RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_actions RAISING /iwbep/cx_mgw_med_exception.
ENDCLASS.

CLASS zcl_ztms_mpc IMPLEMENTATION.
  METHOD define.
    model->set_schema_namespace( gc_schema_namespace ).
    define_entities( ).
    define_associations( ).
    define_actions( ).
  ENDMETHOD.

  METHOD get_last_modified.
    CONSTANTS lc_gen_date_time TYPE timestamp VALUE '20261126180000'.
    rv_last_modified = super->get_last_modified( ).
    IF rv_last_modified < lc_gen_date_time.
      rv_last_modified = lc_gen_date_time.
    ENDIF.
  ENDMETHOD.

  METHOD define_entities.
    DATA: lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_property    TYPE REF TO /iwbep/if_mgw_odata_property,
          lo_entity_set  TYPE REF TO /iwbep/if_mgw_odata_entity_set.

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Vendor' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Lifnr' iv_abap_fieldname = 'LIFNR' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name1' iv_abap_fieldname = 'NAME1' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Ort01' iv_abap_fieldname = 'ORT01' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Stcd3' iv_abap_fieldname = 'STCD3' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 18 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Zterm' iv_abap_fieldname = 'ZTERM' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Sperr' iv_abap_fieldname = 'SPERR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Loevm' iv_abap_fieldname = 'LOEVM' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Transporter' iv_abap_fieldname = 'TRANSPORTER' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_VENDOR' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'VendorSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Customer' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Kunnr' iv_abap_fieldname = 'KUNNR' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Name1' iv_abap_fieldname = 'NAME1' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Ort01' iv_abap_fieldname = 'ORT01' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Regio' iv_abap_fieldname = 'REGIO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Zone' iv_abap_fieldname = 'ZONE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_CUSTOMER' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'CustomerSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'PoSoCheck' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Po' iv_abap_fieldname = 'PO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'So' iv_abap_fieldname = 'SO' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Valid' iv_abap_fieldname = 'VALID' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Message' iv_abap_fieldname = 'MESSAGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 255 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_POSOCHECK' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PoSoCheckSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'FreightInvoice' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ExtRef' iv_abap_fieldname = 'EXTREF' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 16 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Lifnr' iv_abap_fieldname = 'LIFNR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Amount' iv_abap_fieldname = 'AMOUNT' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Waers' iv_abap_fieldname = 'WAERS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 5 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'InvDate' iv_abap_fieldname = 'INVDATE' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Sin' iv_abap_fieldname = 'SIN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Miro' iv_abap_fieldname = 'MIRO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Simulated' iv_abap_fieldname = 'SIMULATED' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'BelnrFi' iv_abap_fieldname = 'BELNRFI' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gjahr' iv_abap_fieldname = 'GJAHR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Bukrs' iv_abap_fieldname = 'BUKRS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Message' iv_abap_fieldname = 'MESSAGE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 255 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_FREIGHTINVOICE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'FreightInvoiceSet' ).
    lo_entity_set->set_creatable( abap_true ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'PaymentStatus' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Belnr' iv_abap_fieldname = 'BELNR' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Cleared' iv_abap_fieldname = 'CLEARED' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Augbl' iv_abap_fieldname = 'AUGBL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Augdt' iv_abap_fieldname = 'AUGDT' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Gjahr' iv_abap_fieldname = 'GJAHR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_PAYMENTSTATUS' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'PaymentStatusSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'OutDelivery' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Vbeln' iv_abap_fieldname = 'VBELN' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Kunnr' iv_abap_fieldname = 'KUNNR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ShipToName' iv_abap_fieldname = 'SHIPTONAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Cartons' iv_abap_fieldname = 'CARTONS' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'GrossWeightKg' iv_abap_fieldname = 'GROSSWEIGHTKG' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'VolumeM3' iv_abap_fieldname = 'VOLUMEM3' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Pgi' iv_abap_fieldname = 'PGI' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Route' iv_abap_fieldname = 'ROUTE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 6 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Irn' iv_abap_fieldname = 'IRN' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 64 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EwbNo' iv_abap_fieldname = 'EWBNO' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'EwbValid' iv_abap_fieldname = 'EWBVALID' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_OUTDELIVERY' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'OutDeliverySet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'OutShipment' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Tknum' iv_abap_fieldname = 'TKNUM' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Shtyp' iv_abap_fieldname = 'SHTYP' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Tdlnr' iv_abap_fieldname = 'TDLNR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Route' iv_abap_fieldname = 'ROUTE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 6 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Vbelns' iv_abap_fieldname = 'VBELNS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 255 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CostNet' iv_abap_fieldname = 'COSTNET' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CostTax' iv_abap_fieldname = 'COSTTAX' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Waers' iv_abap_fieldname = 'WAERS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 5 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CostStatus' iv_abap_fieldname = 'COSTSTATUS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_OUTSHIPMENT' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'OutShipmentSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

    lo_entity_type = model->create_entity_type( iv_entity_type_name = 'Lane' iv_def_entity_set = abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Knumh' iv_abap_fieldname = 'KNUMH' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CondTable' iv_abap_fieldname = 'CONDTABLE' ).
    lo_property->set_is_key( ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property->set_nullable( abap_false ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Kschl' iv_abap_fieldname = 'KSCHL' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Shtyp' iv_abap_fieldname = 'SHTYP' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Route' iv_abap_fieldname = 'ROUTE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 6 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'RouteText' iv_abap_fieldname = 'ROUTETEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'FromLoc' iv_abap_fieldname = 'FROMLOC' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ToLoc' iv_abap_fieldname = 'TOLOC' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'VehicleType' iv_abap_fieldname = 'VEHICLETYPE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'VehicleText' iv_abap_fieldname = 'VEHICLETEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 40 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'RateBasis' iv_abap_fieldname = 'RATEBASIS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Sdabw' iv_abap_fieldname = 'SDABW' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Vsart' iv_abap_fieldname = 'VSART' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'VsartText' iv_abap_fieldname = 'VSARTTEXT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 20 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ZDays' iv_abap_fieldname = 'ZDAYS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 4 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Lifnr' iv_abap_fieldname = 'LIFNR' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 10 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'VendorName' iv_abap_fieldname = 'VENDORNAME' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 35 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Rate' iv_abap_fieldname = 'RATE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Waers' iv_abap_fieldname = 'WAERS' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 5 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PerQty' iv_abap_fieldname = 'PERQTY' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'PerUnit' iv_abap_fieldname = 'PERUNIT' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 3 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'CalcType' iv_abap_fieldname = 'CALCTYPE' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 1 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ValidFrom' iv_abap_fieldname = 'VALIDFROM' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'ValidTo' iv_abap_fieldname = 'VALIDTO' ).
    lo_property->set_type_edm_datetime( ).
    lo_property->/iwbep/if_mgw_odata_annotatabl~create_annotation( iv_annotation_namespace = /iwbep/if_mgw_med_odata_types=>gc_sap_namespace )->add( iv_key = 'display-format' iv_value = 'Date' ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Distance' iv_abap_fieldname = 'DISTANCE' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'TransitH' iv_abap_fieldname = 'TRANSITH' ).
    lo_property->set_type_edm_decimal( ).
    lo_property->set_precison( iv_precision = 2 ).
    lo_property->set_maxlength( iv_max_length = 13 ).
    lo_property = lo_entity_type->create_property( iv_property_name = 'Priority' iv_abap_fieldname = 'PRIORITY' ).
    lo_property->set_type_edm_string( ).
    lo_property->set_maxlength( iv_max_length = 2 ).
    lo_entity_type->bind_structure( iv_structure_name = 'ZCL_TMS_TY=>TS_LANE' iv_bind_conversions = abap_false ).
    lo_entity_set = lo_entity_type->create_entity_set( 'LaneSet' ).
    lo_entity_set->set_creatable( abap_false ).
    lo_entity_set->set_updatable( abap_false ).
    lo_entity_set->set_deletable( abap_false ).
    lo_entity_set->set_pageable( abap_false ).
    lo_entity_set->set_addressable( abap_true ).
    lo_entity_set->set_has_ftxt_search( abap_false ).
    lo_entity_set->set_subscribable( abap_false ).
    lo_entity_set->set_filter_required( abap_false ).

  ENDMETHOD.

  METHOD define_associations.
    DATA: lo_association TYPE REF TO /iwbep/if_mgw_odata_assoc,
          lo_ref_constraint TYPE REF TO /iwbep/if_mgw_odata_ref_constr,
          lo_assoc_set TYPE REF TO /iwbep/if_mgw_odata_assoc_set,
          lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_nav TYPE REF TO /iwbep/if_mgw_odata_nav_prop.

  ENDMETHOD.

  METHOD define_actions.
    DATA: lo_action TYPE REF TO /iwbep/if_mgw_odata_action,
          lo_parameter TYPE REF TO /iwbep/if_mgw_odata_parameter.

  ENDMETHOD.
ENDCLASS.
