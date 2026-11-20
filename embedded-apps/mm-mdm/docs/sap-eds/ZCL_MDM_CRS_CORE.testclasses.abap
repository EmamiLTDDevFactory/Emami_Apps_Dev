*"* use this source file for your ABAP unit test classes
CLASS ltc_crs DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS next_product_max_plus_one FOR TESTING.
    METHODS next_group_numeric_max FOR TESTING.
    METHODS next_sku_is_free FOR TESTING.
    METHODS new_product_child_refused FOR TESTING.
    METHODS description_must_match FOR TESTING.
    METHODS blank_lists_all_problems FOR TESTING.
    METHODS codes_fill_descriptions FOR TESTING.
ENDCLASS.

CLASS ltc_crs IMPLEMENTATION.
  METHOD next_product_max_plus_one.
    SELECT crsprd, vtext FROM zcrs_prd INTO TABLE @DATA(lt).
    DATA(lv_max) = CONV decfloat34( 0 ).
    LOOP AT lt ASSIGNING FIELD-SYMBOL(<p>) WHERE crsprd CO '0123456789 '.
      IF strlen( condense( CONV string( <p>-crsprd ) ) ) = 9 AND CONV decfloat34( <p>-crsprd ) > lv_max. lv_max = CONV decfloat34( <p>-crsprd ). ENDIF.
    ENDLOOP.
    DATA(lv_next) = zcl_mdm_crs_core=>next_code( 1 ).
    cl_abap_unit_assert=>assert_equals( act = strlen( lv_next ) exp = 9 msg = 'nine digits like the real codes' ).
    cl_abap_unit_assert=>assert_equals( act = CONV decfloat34( lv_next ) exp = lv_max + 1 ).
    SELECT SINGLE crsprd FROM zcrs_prd WHERE crsprd = @lv_next INTO @DATA(lv_clash).
    cl_abap_unit_assert=>assert_subrc( act = sy-subrc exp = 4 msg = 'the next code is free' ).
  ENDMETHOD.

  METHOD next_group_numeric_max.
    " product 100040044 has numeric groups; 99 > 817 as text but 817 is the larger number
    SELECT prd_grp, vtext FROM zcrs_prd_grp WHERE crsprd = '200010014' INTO TABLE @DATA(lt).
    DATA(lv_max) = 0.
    LOOP AT lt ASSIGNING FIELD-SYMBOL(<g>) WHERE prd_grp CO '0123456789 '.
      IF CONV i( <g>-prd_grp ) > lv_max. lv_max = CONV i( <g>-prd_grp ). ENDIF.
    ENDLOOP.
    DATA(lv_next) = zcl_mdm_crs_core=>next_code( iv_level = 2 iv_prod = '200010014' ).
    cl_abap_unit_assert=>assert_equals( act = CONV i( lv_next ) exp = lv_max + 1 ).
    " a brand new product starts at 01
    cl_abap_unit_assert=>assert_equals( act = zcl_mdm_crs_core=>next_code( iv_level = 2 iv_prod = '999999999' ) exp = '01' ).
  ENDMETHOD.

  METHOD next_sku_is_free.
    cl_abap_unit_assert=>assert_equals( act = zcl_mdm_crs_core=>next_code( iv_level = 3 iv_prod = '999999999' iv_group = '01' ) exp = '001' ).
    DATA(lv_next) = zcl_mdm_crs_core=>next_code( iv_level = 3 iv_prod = '100040044' iv_group = '32' ).
    cl_abap_unit_assert=>assert_equals( act = strlen( lv_next ) exp = 3 ).
    SELECT SINGLE sku_grp FROM zcrs_sku_grp WHERE crsprd = '100040044' AND prd_grp = '32' AND sku_grp = @lv_next INTO @DATA(lv_clash).
    cl_abap_unit_assert=>assert_subrc( act = sy-subrc exp = 4 msg = 'the next SKU group is free' ).
  ENDMETHOD.

  METHOD new_product_child_refused.
    DATA(ls) = VALUE zcl_mdm_crs_core=>ty_request( bus_vert = '01' crs_prod_desc = 'ZZ UNIT NEW' prd_grp = '32'
                                                   prd_grp_desc = 'A' sku_grp_desc = 'B' ).
    TRY.
        zcl_mdm_crs_core=>validate( EXPORTING iv_mode = 'A' CHANGING cs_request = ls ).
        cl_abap_unit_assert=>fail( 'must be refused' ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        cl_abap_unit_assert=>assert_true( xsdbool( lx->get_text( ) CS 'blank when the CRS product is new' ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD description_must_match.
    DATA(ls) = VALUE zcl_mdm_crs_core=>ty_request( bus_vert = '01' crs_prod = '100040044' crs_prod_desc = 'WRONG'
                                                   prd_grp = '32' sku_grp = '01' ).
    TRY.
        zcl_mdm_crs_core=>validate( EXPORTING iv_mode = 'A' CHANGING cs_request = ls ).
        cl_abap_unit_assert=>fail( 'must be refused' ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        cl_abap_unit_assert=>assert_true( xsdbool( lx->get_text( ) CS 'mismatch' ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD blank_lists_all_problems.
    DATA ls TYPE zcl_mdm_crs_core=>ty_request.
    TRY.
        zcl_mdm_crs_core=>validate( EXPORTING iv_mode = 'I' CHANGING cs_request = ls ).
        cl_abap_unit_assert=>fail( 'must be refused' ).
      CATCH zcx_mdm_ph INTO DATA(lx).
        " vertical, three levels and the missing document
        cl_abap_unit_assert=>assert_equals( act = lines( lx->mt_return ) exp = 5 ).
    ENDTRY.
  ENDMETHOD.

  METHOD codes_fill_descriptions.
    DATA(ls) = VALUE zcl_mdm_crs_core=>ty_request( bus_vert = '01' crs_prod = '100040044' prd_grp = '32' sku_grp = '01' ).
    zcl_mdm_crs_core=>validate( EXPORTING iv_mode = 'A' CHANGING cs_request = ls ).
    cl_abap_unit_assert=>assert_equals( act = ls-crs_prod_desc exp = 'FACE  SCRUB' ).
    cl_abap_unit_assert=>assert_equals( act = ls-sku_grp_desc exp = 'EPS NATURAL GLOW SCRUB 50GM' ).
  ENDMETHOD.
ENDCLASS.
