CLASS zcl_zmdm_ph_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmdm_ph_mpc
  CREATE PUBLIC .

  PUBLIC SECTION.

    TYPES:
      BEGIN OF ts_crsvalue,
        level    TYPE c LENGTH 1,
        code     TYPE c LENGTH 10,
        text     TYPE c LENGTH 40,
        crsprod  TYPE c LENGTH 10,
        prdgrp   TYPE c LENGTH 3,
        skusize  TYPE c LENGTH 20,
        unit     TYPE c LENGTH 3,
      END OF ts_crsvalue,
      BEGIN OF ts_crsvertical,
        code TYPE c LENGTH 2,
        text TYPE c LENGTH 60,
      END OF ts_crsvertical,
      BEGIN OF ts_crsworkitem,
        wiid          TYPE c LENGTH 12,
        transactionid TYPE c LENGTH 10,
        mode          TYPE c LENGTH 1,
        text          TYPE c LENGTH 255,
        status        TYPE c LENGTH 10,
        initiator     TYPE c LENGTH 12,
        createdon     TYPE c LENGTH 14,
      END OF ts_crsworkitem,
      BEGIN OF ts_crsrequest,
        transactionid TYPE c LENGTH 10,
        wiid          TYPE c LENGTH 12,
        crsprod       TYPE c LENGTH 10,
        crsproddesc   TYPE c LENGTH 40,
        prdgrp        TYPE c LENGTH 3,
        prdgrpdesc    TYPE c LENGTH 40,
        skugrp        TYPE c LENGTH 3,
        skugrpdesc    TYPE c LENGTH 40,
        busvert       TYPE c LENGTH 2,
        skusize       TYPE c LENGTH 20,
        unit          TYPE c LENGTH 3,
        comments      TYPE c LENGTH 255,
        flname        TYPE c LENGTH 128,
        fltype        TYPE c LENGTH 128,
        fldata        TYPE xstring,
        step          TYPE c LENGTH 1,
        initiator     TYPE c LENGTH 12,
        createdon     TYPE c LENGTH 8,
        createdat     TYPE c LENGTH 6,
        message       TYPE c LENGTH 255,
      END OF ts_crsrequest,
      BEGIN OF ts_crsvalidate,
        mode        TYPE c LENGTH 1,
        crsprod     TYPE c LENGTH 10,
        crsproddesc TYPE c LENGTH 40,
        prdgrp      TYPE c LENGTH 3,
        prdgrpdesc  TYPE c LENGTH 40,
        skugrp      TYPE c LENGTH 3,
        skugrpdesc  TYPE c LENGTH 40,
        busvert     TYPE c LENGTH 2,
        skusize     TYPE c LENGTH 20,
        unit        TYPE c LENGTH 3,
        comments    TYPE c LENGTH 255,
      END OF ts_crsvalidate,
      BEGIN OF ts_crsapprove,
        wiid     TYPE c LENGTH 12,
        skusize  TYPE c LENGTH 20,
        unit     TYPE c LENGTH 3,
        comments TYPE c LENGTH 255,
      END OF ts_crsapprove,
      BEGIN OF ts_crsreject,
        wiid TYPE c LENGTH 12,
      END OF ts_crsreject.

    METHODS define REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS prop
      IMPORTING io_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ
                iv_name TYPE string
                iv_len  TYPE i OPTIONAL
                iv_key  TYPE abap_bool DEFAULT abap_false
                iv_bin  TYPE abap_bool DEFAULT abap_false.
    METHODS param
      IMPORTING io_action TYPE REF TO /iwbep/if_mgw_odata_action
                iv_name   TYPE string
                iv_len    TYPE i.
    METHODS entity
      IMPORTING iv_name    TYPE string
                iv_set     TYPE string
                iv_struct  TYPE string
                iv_create  TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(ro_type) TYPE REF TO /iwbep/if_mgw_odata_entity_typ.
    METHODS action
      IMPORTING iv_name   TYPE string
                iv_struct TYPE string
      RETURNING VALUE(ro_action) TYPE REF TO /iwbep/if_mgw_odata_action.
ENDCLASS.



CLASS ZCL_ZMDM_PH_MPC_EXT IMPLEMENTATION.


  METHOD define.
    super->define( ).

    DATA(lo_t) = entity( iv_name = 'CrsValue' iv_set = 'CrsValueSet' iv_struct = 'TS_CRSVALUE' ).
    prop( io_type = lo_t iv_name = 'Level' iv_len = 1 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Code' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'CrsProd' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'PrdGrp' iv_len = 3 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Text' iv_len = 40 ).
    prop( io_type = lo_t iv_name = 'SkuSize' iv_len = 20 ).
    prop( io_type = lo_t iv_name = 'Unit' iv_len = 3 ).

    lo_t = entity( iv_name = 'CrsVertical' iv_set = 'CrsVerticalSet' iv_struct = 'TS_CRSVERTICAL' ).
    prop( io_type = lo_t iv_name = 'Code' iv_len = 2 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'Text' iv_len = 60 ).

    lo_t = entity( iv_name = 'CrsWorkItem' iv_set = 'CrsWorkItemSet' iv_struct = 'TS_CRSWORKITEM' ).
    prop( io_type = lo_t iv_name = 'WiId' iv_len = 12 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'TransactionId' iv_len = 10 ).
    prop( io_type = lo_t iv_name = 'Mode' iv_len = 1 ).
    prop( io_type = lo_t iv_name = 'Text' iv_len = 255 ).
    prop( io_type = lo_t iv_name = 'Status' iv_len = 10 ).
    prop( io_type = lo_t iv_name = 'Initiator' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'CreatedOn' iv_len = 14 ).

    lo_t = entity( iv_name = 'CrsRequest' iv_set = 'CrsRequestSet' iv_struct = 'TS_CRSREQUEST' iv_create = abap_true ).
    prop( io_type = lo_t iv_name = 'TransactionId' iv_len = 10 iv_key = abap_true ).
    prop( io_type = lo_t iv_name = 'WiId' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'CrsProd' iv_len = 10 ).
    prop( io_type = lo_t iv_name = 'CrsProdDesc' iv_len = 40 ).
    prop( io_type = lo_t iv_name = 'PrdGrp' iv_len = 3 ).
    prop( io_type = lo_t iv_name = 'PrdGrpDesc' iv_len = 40 ).
    prop( io_type = lo_t iv_name = 'SkuGrp' iv_len = 3 ).
    prop( io_type = lo_t iv_name = 'SkuGrpDesc' iv_len = 40 ).
    prop( io_type = lo_t iv_name = 'BusVert' iv_len = 2 ).
    prop( io_type = lo_t iv_name = 'SkuSize' iv_len = 20 ).
    prop( io_type = lo_t iv_name = 'Unit' iv_len = 3 ).
    prop( io_type = lo_t iv_name = 'Comments' iv_len = 255 ).
    prop( io_type = lo_t iv_name = 'FlName' iv_len = 128 ).
    prop( io_type = lo_t iv_name = 'FlType' iv_len = 128 ).
    prop( io_type = lo_t iv_name = 'FlData' iv_bin = abap_true ).
    prop( io_type = lo_t iv_name = 'Step' iv_len = 1 ).
    prop( io_type = lo_t iv_name = 'Initiator' iv_len = 12 ).
    prop( io_type = lo_t iv_name = 'CreatedOn' iv_len = 8 ).
    prop( io_type = lo_t iv_name = 'CreatedAt' iv_len = 6 ).
    prop( io_type = lo_t iv_name = 'Message' iv_len = 255 ).

    DATA(lo_a) = action( iv_name = 'CrsValidate' iv_struct = 'TS_CRSVALIDATE' ).
    param( io_action = lo_a iv_name = 'Mode' iv_len = 1 ).
    param( io_action = lo_a iv_name = 'CrsProd' iv_len = 10 ).
    param( io_action = lo_a iv_name = 'CrsProdDesc' iv_len = 40 ).
    param( io_action = lo_a iv_name = 'PrdGrp' iv_len = 3 ).
    param( io_action = lo_a iv_name = 'PrdGrpDesc' iv_len = 40 ).
    param( io_action = lo_a iv_name = 'SkuGrp' iv_len = 3 ).
    param( io_action = lo_a iv_name = 'SkuGrpDesc' iv_len = 40 ).
    param( io_action = lo_a iv_name = 'BusVert' iv_len = 2 ).
    param( io_action = lo_a iv_name = 'SkuSize' iv_len = 20 ).
    param( io_action = lo_a iv_name = 'Unit' iv_len = 3 ).
    param( io_action = lo_a iv_name = 'Comments' iv_len = 255 ).
    lo_a->bind_input_structure( iv_structure_name = 'ZCL_ZMDM_PH_MPC_EXT=>TS_CRSVALIDATE' ).

    lo_a = action( iv_name = 'CrsApprove' iv_struct = 'TS_CRSAPPROVE' ).
    param( io_action = lo_a iv_name = 'WiId' iv_len = 12 ).
    param( io_action = lo_a iv_name = 'SkuSize' iv_len = 20 ).
    param( io_action = lo_a iv_name = 'Unit' iv_len = 3 ).
    param( io_action = lo_a iv_name = 'Comments' iv_len = 255 ).
    lo_a->bind_input_structure( iv_structure_name = 'ZCL_ZMDM_PH_MPC_EXT=>TS_CRSAPPROVE' ).

    lo_a = action( iv_name = 'CrsReject' iv_struct = 'TS_CRSREJECT' ).
    param( io_action = lo_a iv_name = 'WiId' iv_len = 12 ).
    lo_a->bind_input_structure( iv_structure_name = 'ZCL_ZMDM_PH_MPC_EXT=>TS_CRSREJECT' ).
  ENDMETHOD.


  METHOD entity.
    ro_type = model->create_entity_type( iv_entity_type_name = CONV #( iv_name ) iv_def_entity_set = abap_false ).
    ro_type->bind_structure( iv_structure_name = |ZCL_ZMDM_PH_MPC_EXT=>{ iv_struct }| ).
    DATA(lo_set) = ro_type->create_entity_set( CONV #( iv_set ) ).
    lo_set->set_creatable( iv_create ).
    lo_set->set_updatable( abap_false ).
    lo_set->set_deletable( abap_false ).
    lo_set->set_pageable( abap_true ).
    lo_set->set_addressable( abap_true ).
    lo_set->set_has_ftxt_search( abap_false ).
    lo_set->set_subscribable( abap_false ).
    lo_set->set_filter_required( abap_false ).
  ENDMETHOD.


  METHOD prop.
    DATA(lo_p) = io_type->create_property( iv_property_name = CONV #( iv_name )
                                           iv_abap_fieldname = CONV #( to_upper( iv_name ) ) ).
    " ABAP field names have no underscores: TransactionId -> TRANSACTIONID
    IF iv_key = abap_true.
      lo_p->set_is_key( ).
    ENDIF.
    IF iv_bin = abap_true.
      lo_p->set_type_edm_binary( ).
    ELSE.
      lo_p->set_type_edm_string( ).
      lo_p->set_maxlength( iv_max_length = iv_len ).
    ENDIF.
    lo_p->set_creatable( abap_true ).
    lo_p->set_updatable( abap_true ).
    lo_p->set_sortable( abap_true ).
    lo_p->set_nullable( COND #( WHEN iv_key = abap_true THEN abap_false ELSE abap_true ) ).
    lo_p->set_filterable( abap_true ).
  ENDMETHOD.


  METHOD action.
    ro_action = model->create_action( CONV #( iv_name ) ).
    ro_action->set_return_entity_type( 'CrsRequest' ).
    ro_action->set_http_method( 'POST' ).
    ro_action->set_action_for( 'CrsRequest' ).
    ro_action->set_return_multiplicity( '1' ).
  ENDMETHOD.


  METHOD param.
    DATA(lo_p) = io_action->create_input_parameter( iv_parameter_name = CONV #( iv_name )
                                                    iv_abap_fieldname = CONV #( to_upper( iv_name ) ) ).
    lo_p->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
  ENDMETHOD.
ENDCLASS.
