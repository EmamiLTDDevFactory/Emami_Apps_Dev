*"* use this source file for your ABAP unit test classes
CLASS ltc_dp DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION MEDIUM.
  PRIVATE SECTION.
    METHODS mat_out_strips_zeros FOR TESTING.
    METHODS materials_by_spart FOR TESTING.
    METHODS materials_filter_either_form FOR TESTING.
    METHODS stock_by_plant FOR TESTING.
    METHODS stock_keys_unique FOR TESTING.
    METHODS lots_life_in_range FOR TESTING.
    METHODS sto_open_positive FOR TESTING.
    METHODS open_orders_positive FOR TESTING.
    METHODS sales_in_window FOR TESTING.
    METHODS transit_rows_have_receiver FOR TESTING.
    METHODS plants_by_land FOR TESTING.
    METHODS plants_by_code FOR TESTING.
    METHODS vendors_email_format FOR TESTING.
    METHODS vendor_email_is_default FOR TESTING.
    METHODS first_plant RETURNING VALUE(rv_werks) TYPE string.
ENDCLASS.

CLASS ltc_dp IMPLEMENTATION.

  METHOD first_plant.
    SELECT SINGLE werks FROM mard WHERE labst > 0 INTO @DATA(lv_w).
    rv_werks = lv_w.
  ENDMETHOD.

  METHOD mat_out_strips_zeros.
    cl_abap_unit_assert=>assert_equals( act = zcl_tms_dp=>mat_out( CONV matnr( |{ '400001152' ALPHA = IN }| ) ) exp = '400001152' ).
  ENDMETHOD.

  METHOD materials_by_spart.
    SELECT SINGLE spart FROM mara WHERE lvorm = @space AND spart <> @space INTO @DATA(lv_sp).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    DATA(lt_m) = zcl_tms_dp=>get_materials( it_spart = VALUE #( ( CONV #( lv_sp ) ) ) ).
    cl_abap_unit_assert=>assert_not_initial( lt_m ).
    LOOP AT lt_m INTO DATA(ls_m) FROM 1 TO 50.
      cl_abap_unit_assert=>assert_equals( act = ls_m-spart exp = lv_sp ).
      cl_abap_unit_assert=>assert_false( xsdbool( ls_m-matnr CO '0123456789 ' AND ls_m-matnr(1) = '0' ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD materials_filter_either_form.
    SELECT SINGLE matnr FROM mara WHERE lvorm = @space INTO @DATA(lv_m).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    DATA(lv_out) = zcl_tms_dp=>mat_out( lv_m ).
    DATA(lt_a) = zcl_tms_dp=>get_materials( it_matnr = VALUE #( ( CONV #( lv_out ) ) ) ).
    DATA(lt_b) = zcl_tms_dp=>get_materials( it_matnr = VALUE #( ( CONV #( lv_m ) ) ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_a ) exp = lines( lt_b ) ).
  ENDMETHOD.

  METHOD stock_by_plant.
    DATA(lv_w) = first_plant( ).
    IF lv_w IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_s) = zcl_tms_dp=>get_stock( it_werks = VALUE #( ( lv_w ) ) ).
    cl_abap_unit_assert=>assert_not_initial( lt_s ).
    LOOP AT lt_s INTO DATA(ls_s).
      cl_abap_unit_assert=>assert_equals( act = ls_s-werks exp = lv_w ).
    ENDLOOP.
  ENDMETHOD.

  METHOD stock_keys_unique.
    DATA(lv_w) = first_plant( ).
    IF lv_w IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_s) = zcl_tms_dp=>get_stock( it_werks = VALUE #( ( lv_w ) ) ).
    DATA(lt_u) = lt_s.
    SORT lt_u BY matnr werks.
    DELETE ADJACENT DUPLICATES FROM lt_u COMPARING matnr werks.
    cl_abap_unit_assert=>assert_equals( act = lines( lt_u ) exp = lines( lt_s ) ).
  ENDMETHOD.

  METHOD lots_life_in_range.
    DATA(lv_w) = first_plant( ).
    IF lv_w IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_l) = zcl_tms_dp=>get_lots( it_werks = VALUE #( ( lv_w ) ) ).
    LOOP AT lt_l INTO DATA(ls_l) FROM 1 TO 500.
      cl_abap_unit_assert=>assert_true( xsdbool( ls_l-lifepct = -1 OR ( ls_l-lifepct >= 0 AND ls_l-lifepct <= 100 ) ) ).
      cl_abap_unit_assert=>assert_true( xsdbool( ls_l-unr > 0 ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD sto_open_positive.
    DATA(lt_o) = zcl_tms_dp=>get_sto( it_werks = VALUE #( ( first_plant( ) ) ) ).
    LOOP AT lt_o INTO DATA(ls_o).
      cl_abap_unit_assert=>assert_true( xsdbool( ls_o-openqty > 0 ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD open_orders_positive.
    DATA(lt_o) = zcl_tms_dp=>get_open_orders( it_werks = VALUE #( ( first_plant( ) ) ) ).
    LOOP AT lt_o INTO DATA(ls_o).
      cl_abap_unit_assert=>assert_true( xsdbool( ls_o-openqty > 0 ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD sales_in_window.
    DATA(lv_from) = CONV d( sy-datum - 14 ).
    DATA(lt_s) = zcl_tms_dp=>get_sales( iv_from = lv_from iv_to = sy-datum it_werks = VALUE #( ( first_plant( ) ) ) ).
    LOOP AT lt_s INTO DATA(ls_s) FROM 1 TO 500.
      cl_abap_unit_assert=>assert_true( xsdbool( ls_s-datum >= lv_from AND ls_s-datum <= sy-datum ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD transit_rows_have_receiver.
    DATA(lt_t) = zcl_tms_dp=>get_transit( it_werks = VALUE #( ( first_plant( ) ) ) ).
    LOOP AT lt_t INTO DATA(ls_t).
      cl_abap_unit_assert=>assert_not_initial( ls_t-werks ).
      cl_abap_unit_assert=>assert_true( xsdbool( ls_t-qty > 0 ) ).
    ENDLOOP.
  ENDMETHOD.


  METHOD plants_by_land.
    DATA(lt_p) = zcl_tms_dp=>get_plants( it_land1 = VALUE #( ( `IN` ) ) ).
    cl_abap_unit_assert=>assert_not_initial( lt_p ).
    LOOP AT lt_p INTO DATA(ls_p).
      cl_abap_unit_assert=>assert_equals( act = ls_p-land1 exp = 'IN' ).
      cl_abap_unit_assert=>assert_not_initial( ls_p-werks ).
    ENDLOOP.
  ENDMETHOD.

  METHOD plants_by_code.
    DATA(lv_w) = first_plant( ).
    IF lv_w IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_p) = zcl_tms_dp=>get_plants( it_werks = VALUE #( ( lv_w ) ) ).
    cl_abap_unit_assert=>assert_equals( act = lines( lt_p ) exp = 1 ).
    cl_abap_unit_assert=>assert_equals( act = lt_p[ 1 ]-werks exp = lv_w ).
  ENDMETHOD.

  METHOD vendors_email_format.
    DATA(lt_v) = zcl_tms_core=>get_vendors( iv_max = 400 ).
    LOOP AT lt_v INTO DATA(ls_v) WHERE email IS NOT INITIAL.
      cl_abap_unit_assert=>assert_true( xsdbool( ls_v-email CS '@' ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD vendor_email_is_default.
    " the e-mail on the entity is one of the vendor's own company-address ADR6 rows, and the standard-sender / default flagged one wins when there are several
    DATA(lt_v) = zcl_tms_core=>get_vendors( iv_max = 5000 ).
    LOOP AT lt_v INTO DATA(ls_v) WHERE email IS NOT INITIAL.
      SELECT SINGLE m~dft_receiv FROM lfa1 AS l INNER JOIN adr6 AS m ON m~addrnumber = l~adrnr
        WHERE l~lifnr = @ls_v-lifnr AND m~persnumber = @space AND m~smtp_addr = @ls_v-email INTO @DATA(lv_own).
      cl_abap_unit_assert=>assert_subrc( exp = 0 ).
      SELECT COUNT(*) FROM lfa1 AS l INNER JOIN adr6 AS m ON m~addrnumber = l~adrnr
        WHERE l~lifnr = @ls_v-lifnr AND m~persnumber = @space AND m~flg_nouse = @space AND m~smtp_addr <> @space
          AND m~smtp_addr <> @ls_v-email AND m~dft_receiv = 'X' INTO @DATA(lv_better).
      cl_abap_unit_assert=>assert_true( xsdbool( lv_better = 0 OR lv_own = 'X' ) ).
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
