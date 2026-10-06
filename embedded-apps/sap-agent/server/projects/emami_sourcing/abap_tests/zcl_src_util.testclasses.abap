CLASS ltc_util DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS pascal_case        FOR TESTING.
    METHODS add_secs_moves     FOR TESTING.
    METHODS diff_ms_is_signed  FOR TESTING.
    METHODS date_roundtrip     FOR TESTING.
ENDCLASS.

CLASS ltc_util IMPLEMENTATION.
  METHOD pascal_case.
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>pascal( `OPT_TWO_ENV` ) exp = `OptTwoEnv` ).
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>pascal( `AUC_ID` ) exp = `AucId` ).
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>pascal( `SUBMI` ) exp = `Submi` ).
  ENDMETHOD.

  METHOD add_secs_moves.
    DATA(lv_t0) = CONV timestampl( '20260105120000.0000000' ).
    DATA(lv_t1) = zcl_src_util=>add_secs( iv_ts = lv_t0 iv_secs = 90 ).
    cl_abap_unit_assert=>assert_equals( act = lv_t1 exp = CONV timestampl( '20260105120130.0000000' ) ).
  ENDMETHOD.

  METHOD diff_ms_is_signed.
    DATA(lv_t0) = CONV timestampl( '20260105120000.0000000' ).
    DATA(lv_t1) = CONV timestampl( '20260105120002.5000000' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>diff_ms( iv_to = lv_t1 iv_from = lv_t0 ) exp = 2500 ).
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>diff_ms( iv_to = lv_t0 iv_from = lv_t1 ) exp = -2500 ).
  ENDMETHOD.

  METHOD date_roundtrip.
    DATA(lv_ts) = zcl_src_util=>to_ts( iv_date = '20260105' iv_time = '083000' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_src_util=>to_date( lv_ts ) exp = CONV d( '20260105' ) ).
  ENDMETHOD.
ENDCLASS.
