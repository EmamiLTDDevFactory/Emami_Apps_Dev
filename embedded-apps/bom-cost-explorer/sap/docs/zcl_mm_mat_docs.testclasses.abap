*"* ABAP Unit tests of ZCL_MM_MAT_DOCS (test classes include)
CLASS ltc_title DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS prd_titles FOR TESTING.
    METHODS separators FOR TESTING.
    METHODS not_docs   FOR TESTING.
ENDCLASS.

CLASS ltc_title IMPLEMENTATION.
  METHOD prd_titles.
    " the two attachments of 151031983 in production (MM03 attachment list, 26.11.2026)
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'SPEC LBL FOR BP ALO NEEM LOTION' ) exp = 'SPEC' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'ARTWORK' ) exp = 'ART' ).
  ENDMETHOD.
  METHOD separators.
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'SPEC_100003652_REV_01' ) exp = 'SPEC' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'spec-v2' ) exp = 'SPEC' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'Specification sheet' ) exp = 'SPEC' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'SPEC' ) exp = 'SPEC' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( 'Artwork_FG' ) exp = 'ART' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_mm_mat_docs=>title_type( '  artwork  new ' ) exp = 'ART' ).
  ENDMETHOD.
  METHOD not_docs.
    cl_abap_unit_assert=>assert_initial( zcl_mm_mat_docs=>title_type( 'SPECIAL ORDER' ) ).
    cl_abap_unit_assert=>assert_initial( zcl_mm_mat_docs=>title_type( 'ARTWORKS LIST' ) ).
    cl_abap_unit_assert=>assert_initial( zcl_mm_mat_docs=>title_type( 'Holiday List - 2026' ) ).
    cl_abap_unit_assert=>assert_initial( zcl_mm_mat_docs=>title_type( '100003652_REV_01_20261125' ) ).
  ENDMETHOD.
ENDCLASS.
