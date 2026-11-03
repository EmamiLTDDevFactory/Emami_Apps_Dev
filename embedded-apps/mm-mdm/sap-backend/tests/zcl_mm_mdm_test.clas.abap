"! ABAP Unit tests for the parts that need no database: names, keys, description builder.
"! Run in SE24 or ADT (Ctrl+Shift+F10). More tests belong next to each rule group of the validator and next to
"! the parity tests (same input in the old and the new app).
CLASS zcl_mm_mdm_test DEFINITION PUBLIC FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.

  PRIVATE SECTION.
    METHODS to_prop_camel_case     FOR TESTING.
    METHODS to_name_underscores    FOR TESTING.
    METHODS norm_ignores_case_and_underscores FOR TESTING.
    METHODS transid_is_padded      FOR TESTING.
    METHODS every_set_has_a_table  FOR TESTING.
    METHODS multi_row_sets_have_keys FOR TESTING.
    METHODS delete_tables_cover_web_dynpro_list FOR TESTING.
    METHODS description_is_upper_case_and_cut FOR TESTING.
    METHODS description_joins_parts FOR TESTING.
    METHODS copy_by_name_matches_without_underscores FOR TESTING.
    METHODS entity_of_view_by_prefix FOR TESTING.
ENDCLASS.

CLASS zcl_mm_mdm_test IMPLEMENTATION.

  METHOD to_prop_camel_case.
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_prop( 'MTART' )        exp = 'Mtart' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_prop( 'SR_NO' )        exp = 'SrNo' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_prop( 'ZZBRAND_CODE' ) exp = 'ZzbrandCode' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_prop( 'MTPOS_MARA' )   exp = 'MtposMara' ).
  ENDMETHOD.

  METHOD to_name_underscores.
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_name( 'Mtart' )       exp = 'MTART' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_name( 'SrNo' )        exp = 'SR_NO' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_name( 'MaraBasic1' )  exp = 'MARA_BASIC1' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>to_name( 'ZzbrandCode' ) exp = 'ZZBRAND_CODE' ).
  ENDMETHOD.

  METHOD norm_ignores_case_and_underscores.
    DATA(lv_a) = zcl_mm_mdm_naming=>norm( 'TransId' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>norm( 'TRANS_ID' ) exp = lv_a ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>norm( 'transid' )  exp = lv_a ).
  ENDMETHOD.

  METHOD transid_is_padded.
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>pad_transid( '123' ) exp = '0000000123' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>pad_transid( ` 0000000045 ` ) exp = '0000000045' ).
  ENDMETHOD.

  METHOD every_set_has_a_table.
    LOOP AT zcl_mm_mdm_naming=>entities( ) INTO DATA(ls).
      cl_abap_unit_assert=>assert_not_initial( act = ls-table msg = |{ ls-entity } has no table| ).
      cl_abap_unit_assert=>assert_equals( act = ls-set exp = |{ ls-entity }Set| ).
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lines( zcl_mm_mdm_naming=>entities( ) ) exp = 19 ).
  ENDMETHOD.

  METHOD multi_row_sets_have_keys.
    LOOP AT zcl_mm_mdm_naming=>entities( ) INTO DATA(ls) WHERE multi = abap_true.
      cl_abap_unit_assert=>assert_not_initial( act = ls-keys msg = |{ ls-entity } is multi row without keys| ).
    ENDLOOP.
  ENDMETHOD.

  METHOD delete_tables_cover_web_dynpro_list.
    "the 17 staging tables and the header table that V_DISPLAY.ONACTIONYES_DELETE clears must all be in the list
    DATA(lt) = zcl_mm_mdm_naming=>delete_tables( ).
    LOOP AT VALUE string_table( ( `/INOWITS/MM_MARA` ) ( `/INOWITS/MM_MARC` ) ( `/INOWITS/MM_MARD` ) ( `/INOWITS/MM_MVKE` )
                                ( `/INOWITS/MM_PROP` ) ( `/INOWITS/MM_DRAW` ) ( `/INOWITS/MM_MAKT` ) ( `/INOWITS/MM_MARM` )
                                ( `/INOWITS/MM_MBEW` ) ( `/INOWITS/MM_MKAL` ) ( `/INOWITS/MM_MLAN` ) ( `/INOWITS/MM_MLGN` )
                                ( `/INOWITS/MM_MLGT` ) ( `/INOWITS/MM_PROW` ) ( `/INOWITS/MM_QMAT` ) ( `/INOWITS/MM_RMCL` )
                                ( `/INOWITS/MM_TEXT` ) ) INTO DATA(lv).
      cl_abap_unit_assert=>assert_true( act = xsdbool( line_exists( lt[ table_line = lv ] ) ) msg = |{ lv } missing in the delete list| ).
    ENDLOOP.
  ENDMETHOD.

  METHOD description_is_upper_case_and_cut.
    DATA(ls) = zcl_mm_mdm_functions=>build_description( VALUE #( description = 'abcdefghijklmnopqrstuvwxyz' manufacturer_part = 'abcdefghijklmnopqrstuvwxyz' ) ).
    cl_abap_unit_assert=>assert_equals( act = strlen( ls-text ) exp = 40 ).
    cl_abap_unit_assert=>assert_true( act = ls-truncated ).
    cl_abap_unit_assert=>assert_equals( act = ls-text(5) exp = 'ABCDE' ).
  ENDMETHOD.

  METHOD description_joins_parts.
    DATA(ls) = zcl_mm_mdm_functions=>build_description( VALUE #( main_group = 'Himani' sub_group = 'Balm' description = '25 ml' ) ).
    cl_abap_unit_assert=>assert_equals( act = CONV string( ls-text ) exp = 'HIMANI BALM 25 ML' ).
    cl_abap_unit_assert=>assert_false( act = ls-truncated ).
  ENDMETHOD.

  METHOD copy_by_name_matches_without_underscores.
    TYPES: BEGIN OF ty_src, trans_id TYPE c LENGTH 10, mtart TYPE c LENGTH 4, END OF ty_src,
           BEGIN OF ty_dst, transid TYPE c LENGTH 10, mtart TYPE c LENGTH 4, other TYPE c LENGTH 2, END OF ty_dst.
    DATA(ls_s) = VALUE ty_src( trans_id = '0000000001' mtart = 'FERT' ).
    DATA ls_d TYPE ty_dst.
    zcl_mm_mdm_staging=>copy_by_name( EXPORTING is_source = ls_s CHANGING cs_target = ls_d ).
    cl_abap_unit_assert=>assert_equals( act = ls_d-transid exp = '0000000001' ).
    cl_abap_unit_assert=>assert_equals( act = ls_d-mtart exp = 'FERT' ).
  ENDMETHOD.

  METHOD entity_of_view_by_prefix.
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>entity_of_view( 'MARA_BASIC1' ) exp = 'Material' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>entity_of_view( 'MARC_MRP3' )   exp = 'Plant' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>entity_of_view( 'QMAT_QM' )     exp = 'InspectionType' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mdm_naming=>entity_of_view( 'ST_LOC_STCK' ) exp = 'StorageLocation' ).
  ENDMETHOD.

ENDCLASS.
