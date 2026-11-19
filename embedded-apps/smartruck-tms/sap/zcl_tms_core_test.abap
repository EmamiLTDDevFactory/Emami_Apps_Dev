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
ENDCLASS.
