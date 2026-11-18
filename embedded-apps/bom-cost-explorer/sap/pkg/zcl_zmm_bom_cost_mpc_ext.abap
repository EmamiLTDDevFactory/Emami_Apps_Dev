CLASS zcl_zmm_bom_cost_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmm_bom_cost_mpc
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS define REDEFINITION.
  PROTECTED SECTION.
  PRIVATE SECTION.
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

ENDCLASS.
