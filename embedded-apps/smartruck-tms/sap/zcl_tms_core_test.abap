*&---------------------------------------------------------------------*
*& ZTMS_CORE_TEST - read-only ABAP Unit tests of ZCL_TMS_CORE (nothing is posted: invoices run with Simulated = 'X').
*&---------------------------------------------------------------------*
REPORT ztms_core_test.

CLASS ltc_core DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS vendors_are_transporters FOR TESTING.
    METHODS vendor_filter_single FOR TESTING.
    METHODS customers_read FOR TESTING.
    METHODS poso_unknown_po FOR TESTING.
    METHODS poso_empty_is_valid FOR TESTING.
    METHODS invoice_needs_extref FOR TESTING.
    METHODS invoice_needs_amount FOR TESTING.
    METHODS invoice_unknown_vendor FOR TESTING.
    METHODS invoice_check_only FOR TESTING.
    METHODS payment_unknown_not_cleared FOR TESTING.
    METHODS out_delivery_unknown_empty FOR TESTING.
    METHODS out_delivery_known_sane FOR TESTING.
    METHODS out_shipment_unknown_empty FOR TESTING.
    METHODS out_shipment_has_deliveries FOR TESTING.
    METHODS lanes_valid_today FOR TESTING.
    METHODS lanes_route_filter FOR TESTING.
    METHODS lanes_priority_by_rate FOR TESTING.
ENDCLASS.

CLASS ltc_core IMPLEMENTATION.
  METHOD vendors_are_transporters.
    DATA(lt) = zcl_tms_core=>get_vendors( iv_max = 20 ).
    cl_abap_unit_assert=>assert_not_initial( lt ).
    LOOP AT lt INTO DATA(ls).
      cl_abap_unit_assert=>assert_equals( act = ls-transporter exp = 'X' ).
    ENDLOOP.
  ENDMETHOD.
  METHOD vendor_filter_single.
    DATA(lt) = zcl_tms_core=>get_vendors( iv_max = 1 ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt ) exp = 1 ).
    DATA(lt2) = zcl_tms_core=>get_vendors( iv_lifnr = lt[ 1 ]-lifnr ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt2 ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = lt2[ 1 ]-lifnr exp = lt[ 1 ]-lifnr ).
  ENDMETHOD.
  METHOD customers_read.
    DATA(lt) = zcl_tms_core=>get_customers( iv_max = 10 ).
    cl_abap_unit_assert=>assert_not_initial( lt ).
  ENDMETHOD.
  METHOD poso_unknown_po.
    DATA(ls) = zcl_tms_core=>check_poso( iv_po = '9999999999' iv_so = '' ).
    cl_abap_unit_assert=>assert_equals( act = ls-valid exp = '' ).
    cl_abap_unit_assert=>assert_char_cp( act = ls-message exp = '*does not exist*' ).
  ENDMETHOD.
  METHOD poso_empty_is_valid.
    DATA(ls) = zcl_tms_core=>check_poso( iv_po = '' iv_so = '' ).
    cl_abap_unit_assert=>assert_equals( act = ls-valid exp = 'X' ).
  ENDMETHOD.
  METHOD invoice_needs_extref.
    DATA(ls) = zcl_tms_core=>post_freight_invoice( is_in = VALUE #( lifnr = '1' amount = 10 simulated = 'X' ) ).
    cl_abap_unit_assert=>assert_initial( ls-belnrfi ).
    cl_abap_unit_assert=>assert_char_cp( act = ls-message exp = '*ExtRef*' ).
  ENDMETHOD.
  METHOD invoice_needs_amount.
    DATA(ls) = zcl_tms_core=>post_freight_invoice( is_in = VALUE #( extref = 'T1' lifnr = '1' amount = 0 simulated = 'X' ) ).
    cl_abap_unit_assert=>assert_char_cp( act = ls-message exp = '*greater than zero*' ).
  ENDMETHOD.
  METHOD invoice_unknown_vendor.
    DATA(ls) = zcl_tms_core=>post_freight_invoice( is_in = VALUE #( extref = 'T2' lifnr = '9999999999' amount = 10 simulated = 'X' ) ).
    cl_abap_unit_assert=>assert_initial( ls-belnrfi ).
    cl_abap_unit_assert=>assert_char_cp( act = ls-message exp = '*not a transporter*' ).
  ENDMETHOD.
  METHOD invoice_check_only.
    " a real transporter, simulated: must never produce a document number
    DATA(lt) = zcl_tms_core=>get_vendors( iv_max = 200 ).
    DATA(lv_lifnr) = VALUE lifnr( ).
    LOOP AT lt INTO DATA(ls_v) WHERE sperr = '' AND loevm = ''.
      lv_lifnr = ls_v-lifnr.
      EXIT.
    ENDLOOP.
    cl_abap_unit_assert=>assert_not_initial( lv_lifnr ).
    DATA(ls) = zcl_tms_core=>post_freight_invoice( is_in = VALUE #( extref = 'UT-NOPOST' lifnr = lv_lifnr amount = 100 waers = 'INR' simulated = 'X' ) ).
    cl_abap_unit_assert=>assert_initial( ls-belnrfi ).
    cl_abap_unit_assert=>assert_not_initial( ls-message ).
  ENDMETHOD.
  METHOD payment_unknown_not_cleared.
    DATA(ls) = zcl_tms_core=>payment_status( '0000000001' ).
    cl_abap_unit_assert=>assert_equals( act = ls-belnr exp = '0000000001' ).
  ENDMETHOD.
  METHOD out_delivery_unknown_empty.
    cl_abap_unit_assert=>assert_initial( zcl_tms_core=>get_out_deliveries( VALUE #( ( `9999999990` ) ) ) ).
    cl_abap_unit_assert=>assert_initial( zcl_tms_core=>get_out_deliveries( VALUE #( ) ) ).
  ENDMETHOD.
  METHOD out_delivery_known_sane.
    SELECT SINGLE vbeln FROM likp INTO @DATA(lv_vbeln).
    cl_abap_unit_assert=>assert_subrc( msg = 'no outbound delivery on this system' ).
    DATA(lt) = zcl_tms_core=>get_out_deliveries( VALUE #( ( CONV string( lv_vbeln ) ) ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = lt[ 1 ]-vbeln exp = lv_vbeln ).
    cl_abap_unit_assert=>assert_true( xsdbool( lt[ 1 ]-grossweightkg >= 0 AND lt[ 1 ]-volumem3 >= 0 AND lt[ 1 ]-cartons >= 0 ) ).
  ENDMETHOD.
  METHOD out_shipment_unknown_empty.
    cl_abap_unit_assert=>assert_initial( zcl_tms_core=>get_out_shipment( '9999999990' )-tknum ).
  ENDMETHOD.
  METHOD out_shipment_has_deliveries.
    SELECT SINGLE tknum FROM vttk INTO @DATA(lv_tknum).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    cl_abap_unit_assert=>assert_equals( act = zcl_tms_core=>get_out_shipment( lv_tknum )-tknum exp = lv_tknum ).
  ENDMETHOD.
  METHOD lanes_valid_today.
    DATA(lt) = zcl_tms_core=>get_lanes( ).
    cl_abap_unit_assert=>assert_not_initial( lt ).
    LOOP AT lt INTO DATA(ls).
      cl_abap_unit_assert=>assert_equals( act = ls-kschl exp = 'ZB00' ).
      cl_abap_unit_assert=>assert_true( xsdbool( ls-validfrom <= sy-datum AND ls-validto >= sy-datum ) ).
      cl_abap_unit_assert=>assert_true( xsdbool( ls-condtable = 'A964' OR ls-condtable = 'A973' OR ls-condtable = 'A972' ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD lanes_route_filter.
    DATA(lt_all) = zcl_tms_core=>get_lanes( ).
    CHECK lt_all IS NOT INITIAL.
    DATA(lv_route) = CONV string( lt_all[ 1 ]-route ).
    DATA(lt) = zcl_tms_core=>get_lanes( it_route = VALUE #( ( lv_route ) ) ).
    cl_abap_unit_assert=>assert_not_initial( lt ).
    LOOP AT lt INTO DATA(ls).
      cl_abap_unit_assert=>assert_equals( act = CONV string( ls-route ) exp = lv_route ).
    ENDLOOP.
  ENDMETHOD.

  METHOD lanes_priority_by_rate.
    DATA(lt) = zcl_tms_core=>get_lanes( ).
    DATA lv_prev TYPE string.
    DATA lv_rate TYPE zcl_tms_ty=>ts_lane-rate.
    LOOP AT lt INTO DATA(ls).
      DATA(lv_key) = |{ ls-shtyp }{ ls-route }{ ls-vehicletype }{ ls-ratebasis }{ ls-vsart }{ ls-sdabw }|.
      IF lv_key <> lv_prev.
        cl_abap_unit_assert=>assert_equals( act = condense( CONV string( ls-priority ) ) exp = `1` ).
        lv_prev = lv_key.
      ELSE.
        cl_abap_unit_assert=>assert_true( xsdbool( ls-rate >= lv_rate ) ).
      ENDIF.
      lv_rate = ls-rate.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
