REPORT zlife_ins_utils_test.
* ABAP Unit tests for ZCL_LIFE_INS_UTILS (read-only). Run: ADT 'Run As > ABAP Unit Test' or SE38 > Program > Execute Unit Tests.

CLASS ltc_life_ins DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
* Read-only ABAP Unit tests for ZCL_LIFE_INS_UTILS. Nothing here writes to the database: every write path is
* exercised only through its authorisation/validation rejections, which return before any MODIFY.
  PRIVATE SECTION.
    METHODS:
      user_from_email        FOR TESTING,
      roles                  FOR TESTING,
      mail_maps_to_known_user FOR TESTING,
      active_year_exists     FOR TESTING,
      employee_needs_id      FOR TESTING,
      hr_read_known_employee FOR TESTING,
      sum_options_follow_limit FOR TESTING,
      user_cannot_apply_for_other FOR TESTING,
      user_cannot_delete     FOR TESTING,
      user_cannot_download   FOR TESTING,
      user_cannot_save_limits FOR TESTING,
      user_cannot_mail       FOR TESTING,
      bad_limit_row_rejected FOR TESTING.
ENDCLASS.

CLASS ltc_life_ins IMPLEMENTATION.

  METHOD user_from_email.
    " the mapping must not depend on how the mail is typed, and the user comes back lower case
    DATA(lv_a) = zcl_life_ins_utils=>user_from_email( 'Sandip.Das@EmamiGroup.com ' ).
    DATA(lv_b) = zcl_life_ins_utils=>user_from_email( 'SANDIP.DAS@EMAMIGROUP.COM' ).
    cl_abap_unit_assert=>assert_equals( act = lv_a exp = lv_b msg = |case changes the result: { lv_a } vs { lv_b }| ).
    cl_abap_unit_assert=>assert_equals( act = lv_a exp = to_lower( lv_a ) ).
    cl_abap_unit_assert=>assert_not_initial( lv_a ).
  ENDMETHOD.

  METHOD mail_maps_to_known_user.
    " sandip.das is an administrator in ZMEDI_AUTH_USERS; his address must resolve to that SAP user (or, failing the user
    " master, to nothing wrong): the result is always lower case and never empty.
    DATA(lv_user) = zcl_life_ins_utils=>user_from_email( 'SOMEONE.UNKNOWN@EMAMIGROUP.COM' ).
    cl_abap_unit_assert=>assert_equals( act = lv_user exp = 'someone.unknown' msg = 'unknown mail falls back to the local part' ).
  ENDMETHOD.

  METHOD roles.
    cl_abap_unit_assert=>assert_equals( act = zcl_life_ins_utils=>get_role( 'sandip.das' ) exp = zcl_life_ins_utils=>c_role_admin
      msg = 'sandip.das has flag R in ZMEDI_AUTH_USERS' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_life_ins_utils=>get_role( 'Sandip.Das' ) exp = zcl_life_ins_utils=>c_role_admin
      msg = 'role lookup is case-insensitive' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_life_ins_utils=>get_role( 'nobody.here' ) exp = zcl_life_ins_utils=>c_role_user ).
    cl_abap_unit_assert=>assert_true( zcl_life_ins_utils=>is_admin( 'administrator' ) ).
    cl_abap_unit_assert=>assert_false( zcl_life_ins_utils=>is_admin( 'nobody.here' ) ).
  ENDMETHOD.

  METHOD active_year_exists.
    cl_abap_unit_assert=>assert_not_initial( act = zcl_life_ins_utils=>active_year( ) msg = 'ZLIFE_PERIOD has no row with STATUS = X' ).
  ENDMETHOD.

  METHOD employee_needs_id.
    zcl_life_ins_utils=>get_employee( EXPORTING iv_pernr = VALUE #( ) iv_user = 'sandip.das' IMPORTING es_emp = DATA(ls) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'Enter Employee ID.' ).
    cl_abap_unit_assert=>assert_initial( ls ).
  ENDMETHOD.

  METHOD hr_read_known_employee.
    " a real, currently active employee of company 1000 who has a company mail; the editor bypasses the cut-off date
    SELECT b~usrid_long FROM pa0105 AS b INNER JOIN pa0000 AS h ON h~pernr = b~pernr
      WHERE b~subty = '0010' AND b~usrid_long LIKE '%@EMAMIGROUP.COM' AND b~begda <= @sy-datum AND b~endda >= @sy-datum
        AND h~begda <= @sy-datum AND h~endda >= @sy-datum AND h~stat2 = '3'
      GROUP BY b~usrid_long HAVING COUNT(*) = 1
      INTO @DATA(lv_mail) UP TO 1 ROWS.
    ENDSELECT.
    IF sy-subrc = 0.
      DATA(lv_emp) = zcl_life_ins_utils=>find_pernr( CONV #( lv_mail ) ).
      IF lv_emp IS INITIAL.
        cl_abap_unit_assert=>fail( |find_pernr found no unique active employee for { lv_mail }| ).
      ENDIF.
      sy-subrc = 0.
    ENDIF.
    IF sy-subrc <> 0.
      cl_abap_unit_assert=>fail( 'No active employee of company 1000 with a company mail found in PA0001/PA0105' ).
    ENDIF.
    zcl_life_ins_utils=>get_employee( EXPORTING iv_pernr = lv_emp iv_user = 'sandip.das' IMPORTING es_emp = DATA(ls) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_initial( act = lv_err msg = |HR read failed for { lv_emp }: { lv_err }| ).
    cl_abap_unit_assert=>assert_not_initial( act = ls-fname msg = |no first name for { lv_emp }| ).
    cl_abap_unit_assert=>assert_equals( act = ls-comp_code exp = '1000' ).
    cl_abap_unit_assert=>assert_true( act = xsdbool( ls-age_in_yrs BETWEEN 15 AND 80 ) msg = |implausible age { ls-age_in_yrs }| ).
    cl_abap_unit_assert=>assert_not_initial( act = ls-email msg = 'company mail expected from PA0105 subty 0010' ).
    cl_abap_unit_assert=>assert_equals( act = zcl_life_ins_utils=>find_pernr( to_lower( CONV string( ls-email ) ) ) exp = lv_emp msg = 'find_pernr must map the mail back to the same employee, whatever the case' ).
  ENDMETHOD.

  METHOD sum_options_follow_limit.
    " every option offered must be <= the employee's limit in rupees, and belong to the active year
    DATA(lv_year) = zcl_life_ins_utils=>active_year( ).
    SELECT emp_id, limit FROM zlife_ins_limit INTO TABLE @DATA(lt_lim) UP TO 20 ROWS WHERE zyear = @lv_year.
    IF lt_lim IS INITIAL.
      RETURN.   " nothing to compare on this system (DEV has no limits for the active year)
    ENDIF.
    LOOP AT lt_lim INTO DATA(ls_lim).
      SPLIT ls_lim-limit AT space INTO DATA(lv_n) DATA(lv_u).
      DATA(lv_max) = COND i( WHEN lv_n CO '0123456789' AND lv_n IS NOT INITIAL THEN CONV i( lv_n ) * 100000 ELSE 0 ).
      LOOP AT zcl_life_ins_utils=>get_sum_options( ls_lim-emp_id ) INTO DATA(ls_amt).
        cl_abap_unit_assert=>assert_true( act = xsdbool( ls_amt-zsum <= lv_max ) msg = |{ ls_amt-zsum_txt } exceeds limit { ls_lim-limit }| ).
        cl_abap_unit_assert=>assert_equals( act = ls_amt-zyear exp = lv_year ).
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD user_cannot_apply_for_other.
    zcl_life_ins_utils=>save_policy( EXPORTING iv_user = 'nobody.here' iv_email = 'nobody.here@emamigroup.com' is_input = VALUE #( emp_id = '90000618' sum_base = '10 LAKHS' contact = '9830012345' )
      it_nominee = VALUE #( ( name = 'A' relation = '5' per_share = '100' ) ) IMPORTING ev_reqno = DATA(lv_reqno) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'You can apply only for your own employee ID.' ).
    cl_abap_unit_assert=>assert_initial( lv_reqno ).
  ENDMETHOD.

  METHOD user_cannot_delete.
    SELECT SINGLE del_flag FROM zlife_emp INTO @DATA(lv_before) WHERE reqno = '2018000001'.
    zcl_life_ins_utils=>delete_policy( EXPORTING iv_user = 'nobody.here' iv_reqno = '2018000001' IMPORTING ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'You are not authorized to delete. Contact HR team for help.' ).
    SELECT SINGLE del_flag FROM zlife_emp INTO @DATA(lv_flag) WHERE reqno = '2018000001'.
    cl_abap_unit_assert=>assert_equals( act = lv_flag exp = lv_before msg = 'a rejected delete must leave the row untouched' ).
  ENDMETHOD.

  METHOD user_cannot_download.
    zcl_life_ins_utils=>search_policies( EXPORTING iv_user = 'nobody.here' iv_all = abap_true IMPORTING et_emp = DATA(lt) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'You are not authorized to download.' ).
    cl_abap_unit_assert=>assert_initial( lt ).
  ENDMETHOD.

  METHOD user_cannot_save_limits.
    zcl_life_ins_utils=>save_limits( EXPORTING iv_user = 'nobody.here' it_limit = VALUE #( ( emp_id = '90000618' limit = '50 LAKHS' ) )
      IMPORTING ev_count = DATA(lv_n) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'Not Authorised' ).
    cl_abap_unit_assert=>assert_equals( act = lv_n exp = 0 ).
  ENDMETHOD.

  METHOD user_cannot_mail.
    zcl_life_ins_utils=>send_summary( EXPORTING iv_user = 'nobody.here' it_reqno = VALUE #( ( '2018000001' ) ) IMPORTING ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_equals( act = lv_err exp = 'Not Authorised' ).
  ENDMETHOD.

  METHOD bad_limit_row_rejected.
    " an admin, but the row is malformed: rejected before MODIFY
    zcl_life_ins_utils=>save_limits( EXPORTING iv_user = 'sandip.das' it_limit = VALUE #( ( emp_id = '90000618' limit = 'FIFTY' ) )
      IMPORTING ev_count = DATA(lv_n) ev_error = DATA(lv_err) ).
    cl_abap_unit_assert=>assert_not_initial( act = lv_err msg = 'malformed limit must be rejected' ).
    cl_abap_unit_assert=>assert_equals( act = lv_n exp = 0 ).
  ENDMETHOD.

ENDCLASS.
