CLASS zcl_zmm_bom_cost_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmm_bom_cost_mpc
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS define REDEFINITION.
  PROTECTED SECTION.
  PRIVATE SECTION.
    "Costing dashboard: DashMis entity type / DashMisSet (MIS brand rows, budget vs actual COGM)
    METHODS dash_define
      RAISING
        /iwbep/cx_mgw_med_exception .
    METHODS dash_str
      IMPORTING
        !io_et    TYPE REF TO /iwbep/if_mgw_odata_entity_typ
        !iv_name  TYPE /iwbep/if_mgw_med_odata_types=>ty_e_med_entity_name
        !iv_field TYPE fieldname
        !iv_len   TYPE i
        !iv_key   TYPE abap_bool OPTIONAL
      RAISING
        /iwbep/cx_mgw_med_exception .
    METHODS dash_dec
      IMPORTING
        !io_et    TYPE REF TO /iwbep/if_mgw_odata_entity_typ
        !iv_name  TYPE /iwbep/if_mgw_med_odata_types=>ty_e_med_entity_name
        !iv_field TYPE fieldname
        !iv_len   TYPE i
        !iv_scale TYPE i
      RAISING
        /iwbep/cx_mgw_med_exception .
    "Packing budget rate: freight / landed / group value fields added on top of the generated PkgItem
    METHODS pkg_add_str
      IMPORTING
        !io_et    TYPE REF TO /iwbep/if_mgw_odata_entity_typ
        !iv_name  TYPE /iwbep/if_mgw_med_odata_types=>ty_e_med_entity_name
        !iv_field TYPE fieldname
        !iv_len   TYPE i
        !iv_mat   TYPE abap_bool OPTIONAL
      RAISING
        /iwbep/cx_mgw_med_exception .
    METHODS pkg_add_dec
      IMPORTING
        !io_et    TYPE REF TO /iwbep/if_mgw_odata_entity_typ
        !iv_name  TYPE /iwbep/if_mgw_med_odata_types=>ty_e_med_entity_name
        !iv_field TYPE fieldname
      RAISING
        /iwbep/cx_mgw_med_exception .
ENDCLASS.



CLASS zcl_zmm_bom_cost_mpc_ext IMPLEMENTATION.


  METHOD define.
    DATA lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ.
    super->define( ).
    lo_et = model->get_entity_type( iv_entity_name = 'PkgItem' ).
    pkg_add_str( io_et = lo_et iv_name = 'OriginGrp'   iv_field = 'ORIGIN_GRP'   iv_len = 4 ).
    pkg_add_str( io_et = lo_et iv_name = 'ZbudMatnr'   iv_field = 'ZBUD_MATNR'   iv_len = 18 iv_mat = abap_true ).
    pkg_add_str( io_et = lo_et iv_name = 'AltBomUsed'  iv_field = 'ALT_BOM_USED' iv_len = 2 ).
    pkg_add_str( io_et = lo_et iv_name = 'GroupCurr'   iv_field = 'GROUP_CURR'   iv_len = 5 ).
    pkg_add_dec( io_et = lo_et iv_name = 'GroupValue'  iv_field = 'GROUP_VALUE' ).
    pkg_add_str( io_et = lo_et iv_name = 'FrtCond1'    iv_field = 'FRT_COND1'    iv_len = 4 ).
    pkg_add_str( io_et = lo_et iv_name = 'FrtCond2'    iv_field = 'FRT_COND2'    iv_len = 4 ).
    pkg_add_str( io_et = lo_et iv_name = 'FrtCond3'    iv_field = 'FRT_COND3'    iv_len = 4 ).
    pkg_add_str( io_et = lo_et iv_name = 'FrtCond4'    iv_field = 'FRT_COND4'    iv_len = 4 ).
    pkg_add_dec( io_et = lo_et iv_name = 'FrtRate1'    iv_field = 'FRT_RATE1' ).
    pkg_add_dec( io_et = lo_et iv_name = 'FrtRate2'    iv_field = 'FRT_RATE2' ).
    pkg_add_dec( io_et = lo_et iv_name = 'FrtRate3'    iv_field = 'FRT_RATE3' ).
    pkg_add_dec( io_et = lo_et iv_name = 'FrtRate4'    iv_field = 'FRT_RATE4' ).
    pkg_add_dec( io_et = lo_et iv_name = 'FrtTotal'    iv_field = 'FRT_TOTAL' ).
    pkg_add_str( io_et = lo_et iv_name = 'FrtCurr'     iv_field = 'FRT_CURR'     iv_len = 5 ).
    pkg_add_dec( io_et = lo_et iv_name = 'NetQty'      iv_field = 'NET_QTY' ).
    pkg_add_dec( io_et = lo_et iv_name = 'NetValue'    iv_field = 'NET_VALUE' ).
    pkg_add_dec( io_et = lo_et iv_name = 'LandedRate'  iv_field = 'LANDED_RATE' ).
    pkg_add_str( io_et = lo_et iv_name = 'LandedCurr'  iv_field = 'LANDED_CURR'  iv_len = 5 ).
    dash_define( ).
  ENDMETHOD.


  METHOD pkg_add_str.
    DATA lo_p TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_p = io_et->create_property( iv_property_name = iv_name iv_abap_fieldname = iv_field ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
    IF iv_mat = abap_true.
      lo_p->set_conversion_exit( 'MATN1' ).
    ENDIF.
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
  ENDMETHOD.


  METHOD pkg_add_dec.
    DATA lo_p TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_p = io_et->create_property( iv_property_name = iv_name iv_abap_fieldname = iv_field ).
    lo_p->set_type_edm_decimal( ).
    lo_p->set_precison( iv_precision = 6 ).
    lo_p->set_maxlength( iv_max_length = 15 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
  ENDMETHOD.

  METHOD dash_define.
    DATA: lo_et TYPE REF TO /iwbep/if_mgw_odata_entity_typ,
          lo_es TYPE REF TO /iwbep/if_mgw_odata_entity_set,
          lo_p  TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_et = model->create_entity_type( iv_entity_type_name = 'DashMis' iv_def_entity_set = abap_false ).
    dash_str( io_et = lo_et iv_name = 'Zbrand'    iv_field = 'ZBRAND'    iv_len = 10 iv_key = abap_true ).
    " filter-only properties (the page sends them in $filter)
    lo_p = lo_et->create_property( iv_property_name = 'Werks' iv_abap_fieldname = 'WERKS' ).
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = 4 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_true ).
    lo_p = lo_et->create_property( iv_property_name = 'DateTo' iv_abap_fieldname = 'DATE_TO' ).
    lo_p->set_type_edm_datetime( ).
    lo_p->set_precison( iv_precision = 7 ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_true ).
    lo_p->set_filterable( abap_true ).
    dash_str( io_et = lo_et iv_name = 'Gjahr'   iv_field = 'GJAHR'   iv_len = 4 ).
    dash_str( io_et = lo_et iv_name = 'Version' iv_field = 'VERSION' iv_len = 2 ).
    lo_p = lo_et->create_property( iv_property_name = 'FgCnt' iv_abap_fieldname = 'FG_CNT' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
    lo_p = lo_et->create_property( iv_property_name = 'FgNobud' iv_abap_fieldname = 'FG_NOBUD' ).
    lo_p->set_type_edm_int32( ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
    dash_dec( io_et = lo_et iv_name = 'FtmQty'       iv_field = 'FTM_QTY'        iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'FtmBudget'    iv_field = 'FTM_BUDGET'     iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FtmActual'    iv_field = 'FTM_ACTUAL'     iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'FtmActualCmp' iv_field = 'FTM_ACTUAL_CMP' iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'YtmQty'       iv_field = 'YTM_QTY'        iv_len = 23 iv_scale = 3 ).
    dash_dec( io_et = lo_et iv_name = 'YtmBudget'    iv_field = 'YTM_BUDGET'     iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'YtmActual'    iv_field = 'YTM_ACTUAL'     iv_len = 23 iv_scale = 6 ).
    dash_dec( io_et = lo_et iv_name = 'YtmActualCmp' iv_field = 'YTM_ACTUAL_CMP' iv_len = 23 iv_scale = 6 ).
    dash_str( io_et = lo_et iv_name = 'Msg'      iv_field = 'MSG'      iv_len = 120 ).
    lo_et->bind_structure( iv_structure_name = 'ZDASH_S_MIS' iv_bind_conversions = 'X' ).
    lo_es = lo_et->create_entity_set( 'DashMisSet' ).
    lo_es->set_creatable( abap_false ).
    lo_es->set_updatable( abap_false ).
    lo_es->set_deletable( abap_false ).
    lo_es->set_pageable( abap_false ).
    lo_es->set_addressable( abap_true ).
    lo_es->set_has_ftxt_search( abap_false ).
    lo_es->set_subscribable( abap_false ).
    lo_es->set_filter_required( abap_false ).
  ENDMETHOD.


  METHOD dash_str.
    DATA lo_p TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_p = io_et->create_property( iv_property_name = iv_name iv_abap_fieldname = iv_field ).
    IF iv_key = abap_true. lo_p->set_is_key( ). ENDIF.
    lo_p->set_type_edm_string( ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
  ENDMETHOD.


  METHOD dash_dec.
    DATA lo_p TYPE REF TO /iwbep/if_mgw_odata_property.
    lo_p = io_et->create_property( iv_property_name = iv_name iv_abap_fieldname = iv_field ).
    lo_p->set_type_edm_decimal( ).
    lo_p->set_precison( iv_precision = iv_scale ).
    lo_p->set_maxlength( iv_max_length = iv_len ).
    lo_p->set_creatable( abap_false ).
    lo_p->set_updatable( abap_false ).
    lo_p->set_sortable( abap_false ).
    lo_p->set_nullable( abap_false ).
    lo_p->set_filterable( abap_false ).
  ENDMETHOD.

ENDCLASS.
