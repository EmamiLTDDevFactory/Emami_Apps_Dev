*&---------------------------------------------------------------------*
*& ZTMS_CORE_TEST - read-only ABAP Unit tests of ZCL_TMS_CORE (nothing is posted: invoices run with Simulated = 'X').
*&---------------------------------------------------------------------*
REPORT ztms_core_test.

CLASS ltc_trip DEFINITION DEFERRED.
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
    METHODS freight_cond_by_route FOR TESTING.
    METHODS freight_cond_paging FOR TESTING.
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

  METHOD freight_cond_by_route.
    DATA(lt) = zcl_tms_core=>get_freight_cond( it_route = VALUE #( ( `ZDECTK` ) ) ).
    cl_abap_unit_assert=>assert_not_initial( lt ).
    LOOP AT lt INTO DATA(ls).
      cl_abap_unit_assert=>assert_equals( act = ls-route exp = 'ZDECTK' ).
      cl_abap_unit_assert=>assert_equals( act = ls-routetext exp = 'Delhi To Cuttack' ).
      cl_abap_unit_assert=>assert_not_initial( act = ls-vendorname ).
      cl_abap_unit_assert=>assert_not_initial( act = ls-knumh ).
    ENDLOOP.
    " the transporter filter takes the leading zeros or not
    DATA(lt_v) = zcl_tms_core=>get_freight_cond( it_tdlnr = VALUE #( ( `240628` ) ) iv_top = 50 ).
    cl_abap_unit_assert=>assert_not_initial( lt_v ).
    LOOP AT lt_v INTO ls.
      cl_abap_unit_assert=>assert_equals( act = ls-tdlnr exp = '0000240628' ).
    ENDLOOP.
  ENDMETHOD.

  METHOD freight_cond_paging.
    DATA(lt_all) = zcl_tms_core=>get_freight_cond( it_kschl = VALUE #( ( `ZB00` ) ) iv_top = 30 ).
    DATA(lt_p1) = zcl_tms_core=>get_freight_cond( it_kschl = VALUE #( ( `ZB00` ) ) iv_skip = 0 iv_top = 10 ).
    DATA(lt_p2) = zcl_tms_core=>get_freight_cond( it_kschl = VALUE #( ( `ZB00` ) ) iv_skip = 10 iv_top = 10 ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_p1 ) exp = 10 ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_p2 ) exp = 10 ).
    cl_abap_unit_assert=>assert_equals( act = lt_p1[ 1 ]-knumh exp = lt_all[ 1 ]-knumh ).
    cl_abap_unit_assert=>assert_equals( act = lt_p2[ 1 ]-knumh exp = lt_all[ 11 ]-knumh ).
  ENDMETHOD.

ENDCLASS.

"! Trip vehicle writes (ZSMART_VEH replacement). Every test rolls back: nothing stays in ZTMS_TRIP_* / ZINSTA_*.
CLASS ltc_trip DEFINITION FINAL FOR TESTING RISK LEVEL CRITICAL DURATION SHORT.
  PRIVATE SECTION.
    DATA mv_bill TYPE vbeln_vf.
    DATA mv_werks TYPE werks_d.
    METHODS setup.
    METHODS teardown.
    METHODS invoice_from_delivery FOR TESTING.
    METHODS invoice_wrong_plant FOR TESTING.
    METHODS write_then_remove FOR TESTING.
    METHODS other_vehicle_refused FOR TESTING.
    METHODS insta_untouched_by_default FOR TESTING.
    METHODS insta_written_on_cutover FOR TESTING.
    METHODS parallel_check_statuses FOR TESTING.
ENDCLASS.

CLASS ltc_trip IMPLEMENTATION.
  METHOD setup.
    " a real, not cancelled billing document that came from a delivery
    SELECT f~vbeln FROM vbfa AS f INNER JOIN vbrk AS k ON k~vbeln = f~vbeln
      WHERE f~vbtyp_n = 'M' AND f~vbtyp_v = 'J' AND k~fksto = ''
      ORDER BY f~vbeln DESCENDING INTO @mv_bill UP TO 1 ROWS.
    ENDSELECT.
    SELECT SINGLE werks FROM vbrp INTO @mv_werks WHERE vbeln = @mv_bill.
  ENDMETHOD.

  METHOD teardown.
    ROLLBACK WORK.
  ENDMETHOD.

  METHOD invoice_from_delivery.
    SELECT SINGLE vbelv FROM vbfa INTO @DATA(lv_dlv) WHERE vbeln = @mv_bill AND vbtyp_n = 'M'.
    DATA(lt) = zcl_tms_core=>get_trip_invoices( it_vbelv = VALUE #( ( CONV string( lv_dlv ) ) ) ).
    cl_abap_unit_assert=>assert_true( xsdbool( line_exists( lt[ vbeln = mv_bill ] ) ) ).
    DATA(ls) = lt[ vbeln = mv_bill ].
    cl_abap_unit_assert=>assert_initial( ls-message ).
    cl_abap_unit_assert=>assert_equals( act = ls-vbelv exp = lv_dlv ).
    cl_abap_unit_assert=>assert_true( xsdbool( ls-value > 0 AND ls-grosskg >= ls-netkg ) ).
  ENDMETHOD.

  METHOD invoice_wrong_plant.
    DATA(lt) = zcl_tms_core=>get_trip_invoices( it_vbeln = VALUE #( ( CONV string( mv_bill ) ) ) iv_werks = 'ZZ99' ).
    cl_abap_unit_assert=>assert_char_cp( act = CONV string( lt[ 1 ]-message ) exp = '*is for plant*' ).
  ENDMETHOD.

  METHOD write_then_remove.
    DATA(ls_in) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-1' shipmentid = 'IND-UT' werks = mv_werks vehicleno = 'WB01AB1234'
                                                  invoices = |{ mv_bill ALPHA = OUT }| ).
    DATA(ls_out) = zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_user = 'unit@test' iv_insta = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_out-ok exp = 'X' msg = CONV #( ls_out-message ) ).
    SELECT SINGLE loekz, nop, material_value FROM ztms_trip_inv INTO @DATA(ls_row) WHERE sin = 'TT-UNITTEST-1' AND vbeln = @mv_bill.
    cl_abap_unit_assert=>assert_subrc( ).
    cl_abap_unit_assert=>assert_initial( ls_row-loekz ).
    " same list again: idempotent
    ls_out = zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_insta = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_out-ok exp = 'X' ).
    " empty list: the invoice is flagged, not deleted
    ls_in-invoices = ''.
    ls_out = zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_insta = abap_false ).
    SELECT SINGLE loekz FROM ztms_trip_inv INTO @DATA(lv_loekz) WHERE sin = 'TT-UNITTEST-1' AND vbeln = @mv_bill.
    cl_abap_unit_assert=>assert_equals( act = lv_loekz exp = 'X' ).
  ENDMETHOD.

  METHOD other_vehicle_refused.
    DATA(ls_a) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-A' werks = mv_werks vehicleno = 'WB01AA0001' invoices = |{ mv_bill ALPHA = OUT }| ).
    cl_abap_unit_assert=>assert_equals( act = zcl_tms_core=>write_trip_vehicle( is_in = ls_a iv_insta = abap_false )-ok exp = 'X' ).
    DATA(ls_b) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-B' werks = mv_werks vehicleno = 'WB01BB0002' invoices = |{ mv_bill ALPHA = OUT }| ).
    DATA(ls_out) = zcl_tms_core=>write_trip_vehicle( is_in = ls_b iv_insta = abap_false ).
    cl_abap_unit_assert=>assert_initial( ls_out-ok ).
    cl_abap_unit_assert=>assert_char_cp( act = CONV string( ls_out-message ) exp = '*already on Trip Trail vehicle*' ).
    DATA(ls_c) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-C' werks = mv_werks vehicleno = 'X' invoices = '12AB' ).
    cl_abap_unit_assert=>assert_initial( zcl_tms_core=>write_trip_vehicle( is_in = ls_c iv_insta = abap_false )-ok ).
  ENDMETHOD.

  METHOD insta_untouched_by_default.
    SELECT COUNT(*) FROM zinsta_vehicle_h INTO @DATA(lv_h0).
    SELECT COUNT(*) FROM zinsta_vehicle_i INTO @DATA(lv_i0).
    DATA(ls_in) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-2' werks = mv_werks vehicleno = 'WB01AB1235' invoices = |{ mv_bill ALPHA = OUT }| ).
    DATA(ls_out) = zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_insta = abap_false ).
    cl_abap_unit_assert=>assert_equals( act = ls_out-target exp = 'TRIPTRAIL' ).
    SELECT COUNT(*) FROM zinsta_vehicle_h INTO @DATA(lv_h1).
    SELECT COUNT(*) FROM zinsta_vehicle_i INTO @DATA(lv_i1).
    cl_abap_unit_assert=>assert_equals( act = lv_h1 exp = lv_h0 ).
    cl_abap_unit_assert=>assert_equals( act = lv_i1 exp = lv_i0 ).
  ENDMETHOD.

  METHOD insta_written_on_cutover.
    DATA(ls_in) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-3' shipmentid = 'IND-UT3' werks = mv_werks vehicleno = 'WB01AB1236' invoices = |{ mv_bill ALPHA = OUT }| ).
    DATA(ls_out) = zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_insta = abap_true ).
    cl_abap_unit_assert=>assert_equals( act = ls_out-target exp = 'TRIPTRAIL+INSTAVANS' ).
    SELECT SINGLE vehicle_no FROM zinsta_vehicle_i INTO @DATA(lv_veh) WHERE sin = 'TT-UNITTEST-3' AND vbeln = @mv_bill.
    cl_abap_unit_assert=>assert_equals( act = lv_veh exp = 'WB01AB1236' ).
  ENDMETHOD.

  METHOD parallel_check_statuses.
    DATA(ls_in) = VALUE zcl_tms_ty=>ts_tripvehicle( sin = 'TT-UNITTEST-4' werks = mv_werks vehicleno = 'WB 01 AB 1237' invoices = |{ mv_bill ALPHA = OUT }| ).
    zcl_tms_core=>write_trip_vehicle( is_in = ls_in iv_insta = abap_false ).
    DATA(lt) = zcl_tms_core=>parallel_check( iv_werks = mv_werks iv_days = 1 ).
    READ TABLE lt INTO DATA(ls) WITH KEY vbeln = mv_bill.
    cl_abap_unit_assert=>assert_subrc( ).
    cl_abap_unit_assert=>assert_true( xsdbool( ls-status = 'TT_ONLY' OR ls-status = 'MATCH' OR ls-status = 'DIFF' ) ).
    cl_abap_unit_assert=>assert_equals( act = ls-ttsin exp = 'TT-UNITTEST-4' ).
  ENDMETHOD.
ENDCLASS.
