"! Maintenance of the Mediclaim and Term Life master tables from the apps (shared by ZMEDICLAIM_SRV and ZLIFE_INS_SRV).
"! One generic row shape serves every table, so each service needs only two entity types (MaintRow, MaintCmd).
"! Tables (TAB code):  BASE = ZBASE_PREMIUM (by year)   TOPUP = ZTOP_PREMIUM (by year)   MPERIOD = ZMEDI_PERIOD
"!   LPERIOD = ZLIFE_PERIOD   AUTH = ZMEDI_AUTH_USERS   SLAB = ZLIFE_AMT (by year)   LIMIT = ZLIFE_INS_LIMIT (by year)
"!   DATE = ZMEDI_DATE (cut-off date and mail rows)   EXCL = ZMEDI_EXCL_EMP (blocked employees: key1 = employee number, val1 = name).
"! No authorisation here and no COMMIT: the data provider checks the role first and commits or rolls back afterwards.
CLASS zcl_ins_maint DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES ty_amt TYPE p LENGTH 13 DECIMALS 2.
    TYPES:
      BEGIN OF ts_row,
        email TYPE c LENGTH 241,
        tab   TYPE c LENGTH 10,
        key1  TYPE c LENGTH 40,
        key2  TYPE c LENGTH 40,
        key3  TYPE c LENGTH 40,
        year  TYPE c LENGTH 4,
        val1  TYPE c LENGTH 60,
        val2  TYPE c LENGTH 60,
        val3  TYPE c LENGTH 60,
        val4  TYPE c LENGTH 60,
        val5  TYPE c LENGTH 60,
      END OF ts_row,
      tt_row TYPE STANDARD TABLE OF ts_row WITH DEFAULT KEY,
      BEGIN OF ts_cmd,
        email   TYPE c LENGTH 241,
        tab     TYPE c LENGTH 10,
        year    TYPE c LENGTH 4,
        toyear  TYPE c LENGTH 4,
        action  TYPE c LENGTH 10,
        ok      TYPE c LENGTH 1,
        message TYPE c LENGTH 255,
        count   TYPE i,
      END OF ts_cmd,
      BEGIN OF ts_cmd_deep,
        email   TYPE c LENGTH 241,
        tab     TYPE c LENGTH 10,
        year    TYPE c LENGTH 4,
        toyear  TYPE c LENGTH 4,
        action  TYPE c LENGTH 10,
        ok      TYPE c LENGTH 1,
        message TYPE c LENGTH 255,
        count   TYPE i,
        rows    TYPE tt_row,
      END OF ts_cmd_deep.

    "! Rows of one table (iv_year empty = every year; LIMIT needs a year).
    CLASS-METHODS list
      IMPORTING iv_tab TYPE csequence iv_year TYPE csequence OPTIONAL
      RETURNING VALUE(rt_rows) TYPE tt_row
      RAISING   zcx_medi_error.
    "! Action SAVE (add or change the given rows), REPLACE (the given rows become the whole table / year), DELETE, COPY (year to ToYear).
    CLASS-METHODS apply
      IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row
      RETURNING VALUE(rv_count) TYPE i
      RAISING   zcx_medi_error.

  PRIVATE SECTION.
    CLASS-METHODS err IMPORTING iv_text TYPE string RAISING zcx_medi_error.
    CLASS-METHODS year_of IMPORTING iv_row TYPE csequence iv_cmd TYPE csequence RETURNING VALUE(rv_year) TYPE gjahr RAISING zcx_medi_error.
    CLASS-METHODS whole IMPORTING iv_text TYPE csequence iv_what TYPE string iv_max TYPE i RETURNING VALUE(rv_num) TYPE string RAISING zcx_medi_error.
    CLASS-METHODS money IMPORTING iv_text TYPE csequence iv_what TYPE string RETURNING VALUE(rv_amt) TYPE ty_amt RAISING zcx_medi_error.
    CLASS-METHODS lpad IMPORTING iv_s TYPE string iv_w TYPE i RETURNING VALUE(rv_s) TYPE string.
    CLASS-METHODS amt_txt IMPORTING iv_amt TYPE p RETURNING VALUE(rv_txt) TYPE string.
    CLASS-METHODS ap_base IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_topup IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_period IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row iv_life TYPE abap_bool RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_auth IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_slab IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_limit IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_excl IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS ap_date IMPORTING is_cmd TYPE ts_cmd it_rows TYPE tt_row RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS copy_year IMPORTING is_cmd TYPE ts_cmd RETURNING VALUE(rv_count) TYPE i RAISING zcx_medi_error.
    CLASS-METHODS check_action IMPORTING iv_action TYPE csequence iv_allowed TYPE string RAISING zcx_medi_error.
ENDCLASS.

CLASS zcl_ins_maint IMPLEMENTATION.

  METHOD err.
    RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = iv_text.
  ENDMETHOD.

  METHOD check_action.
    IF NOT ( | { iv_allowed } | CS | { to_upper( condense( iv_action ) ) } | ).
      err( |Action { iv_action } is not allowed for this table.| ).
    ENDIF.
  ENDMETHOD.

  METHOD year_of.
    DATA(lv_y) = condense( COND string( WHEN iv_row IS NOT INITIAL THEN iv_row ELSE iv_cmd ) ).
    IF NOT matches( val = lv_y regex = '\d{4}' ) OR CONV i( lv_y ) < 1990 OR CONV i( lv_y ) > 2100.
      err( |Enter a valid year (four digits).| ).
    ENDIF.
    rv_year = lv_y.
  ENDMETHOD.

  METHOD whole.
    DATA(lv_s) = condense( iv_text ).
    IF NOT matches( val = lv_s regex = '\d+' ) OR strlen( lv_s ) > iv_max.
      err( |Invalid { iv_what } "{ lv_s }".| ).
    ENDIF.
    rv_num = lv_s.
  ENDMETHOD.

  METHOD money.
    DATA(lv_s) = replace( val = condense( iv_text ) sub = ',' with = '' occ = 0 ).
    IF NOT matches( val = lv_s regex = '\d{1,10}(\.\d{1,2})?' ).
      err( |Invalid { iv_what } "{ lv_s }".| ).
    ENDIF.
    rv_amt = lv_s.
  ENDMETHOD.

  METHOD lpad.
    rv_s = iv_s.
    IF strlen( iv_s ) < iv_w.
      rv_s = repeat( val = '0' occ = iv_w - strlen( iv_s ) ) && iv_s.
    ENDIF.
  ENDMETHOD.

  METHOD amt_txt.
    rv_txt = condense( |{ iv_amt DECIMALS = 2 }| ).
    IF rv_txt CP '*.00'.
      rv_txt = substring( val = rv_txt len = strlen( rv_txt ) - 3 ).
    ENDIF.
  ENDMETHOD.

  METHOD list.
    DATA lr_year TYPE RANGE OF gjahr.
    DATA(lv_tab) = to_upper( condense( iv_tab ) ).
    IF iv_year IS NOT INITIAL.
      lr_year = VALUE #( ( sign = 'I' option = 'EQ' low = iv_year ) ).
    ENDIF.
    CASE lv_tab.
      WHEN 'BASE'.
        SELECT * FROM zbase_premium WHERE zyear IN @lr_year ORDER BY zyear, from_age, premium_amt INTO TABLE @DATA(lt_b).
        LOOP AT lt_b INTO DATA(ls_b).
          APPEND VALUE #( tab = lv_tab year = ls_b-zyear key1 = ls_b-from_age key2 = ls_b-to_age key3 = amt_txt( ls_b-premium_amt )
                          val1 = amt_txt( ls_b-pre_age ) ) TO rt_rows.
        ENDLOOP.
      WHEN 'TOPUP'.
        SELECT * FROM ztop_premium WHERE zyear IN @lr_year ORDER BY zyear, top_up_amt INTO TABLE @DATA(lt_t).
        LOOP AT lt_t INTO DATA(ls_t).
          APPEND VALUE #( tab = lv_tab year = ls_t-zyear key1 = amt_txt( ls_t-top_up_amt ) val1 = amt_txt( ls_t-rt_family ) ) TO rt_rows.
        ENDLOOP.
      WHEN 'MPERIOD'.
        SELECT * FROM zmedi_period ORDER BY zyear DESCENDING INTO TABLE @DATA(lt_mp).
        LOOP AT lt_mp INTO DATA(ls_mp).
          APPEND VALUE #( tab = lv_tab key1 = ls_mp-zyear val1 = ls_mp-status ) TO rt_rows.
        ENDLOOP.
      WHEN 'LPERIOD'.
        SELECT * FROM zlife_period ORDER BY zyear DESCENDING INTO TABLE @DATA(lt_lp).
        LOOP AT lt_lp INTO DATA(ls_lp).
          APPEND VALUE #( tab = lv_tab key1 = ls_lp-zyear val1 = ls_lp-status ) TO rt_rows.
        ENDLOOP.
      WHEN 'AUTH'.
        SELECT * FROM zmedi_auth_users ORDER BY sl_no INTO TABLE @DATA(lt_a).
        LOOP AT lt_a INTO DATA(ls_a).
          APPEND VALUE #( tab = lv_tab key1 = ls_a-sl_no val1 = ls_a-userid val2 = ls_a-flag ) TO rt_rows.
        ENDLOOP.
      WHEN 'SLAB'.
        SELECT * FROM zlife_amt WHERE zyear IN @lr_year ORDER BY zyear, slno INTO TABLE @DATA(lt_s).
        LOOP AT lt_s INTO DATA(ls_s).
          APPEND VALUE #( tab = lv_tab year = ls_s-zyear key1 = ls_s-slno val1 = |{ ls_s-zsum ALPHA = OUT }| val2 = ls_s-zsum_txt
                          val3 = |{ ls_s-premium_amt ALPHA = OUT }| val4 = |{ ls_s-gst_amt ALPHA = OUT }| val5 = |{ ls_s-total_prem ALPHA = OUT }| ) TO rt_rows.
        ENDLOOP.
      WHEN 'LIMIT'.
        IF iv_year IS INITIAL.
          err( `Select a year.` ).
        ENDIF.
        SELECT * FROM zlife_ins_limit WHERE zyear IN @lr_year ORDER BY emp_id INTO TABLE @DATA(lt_l).
        LOOP AT lt_l INTO DATA(ls_l).
          APPEND VALUE #( tab = lv_tab year = ls_l-zyear key1 = |{ ls_l-emp_id ALPHA = OUT }| val1 = ls_l-limit ) TO rt_rows.
        ENDLOOP.
      WHEN 'EXCL'.
        SELECT * FROM zmedi_excl_emp ORDER BY emp_id INTO TABLE @DATA(lt_x).
        LOOP AT lt_x INTO DATA(ls_x).
          APPEND VALUE #( tab = lv_tab key1 = |{ ls_x-emp_id ALPHA = OUT }| val1 = ls_x-nmae ) TO rt_rows.
        ENDLOOP.
      WHEN 'DATE'.
        SELECT * FROM zmedi_date ORDER BY slno INTO TABLE @DATA(lt_d).
        LOOP AT lt_d INTO DATA(ls_d).
          APPEND VALUE #( tab = lv_tab key1 = ls_d-slno val1 = |{ ls_d-co_date }| val2 = to_lower( CONV string( ls_d-email_id ) ) ) TO rt_rows.
        ENDLOOP.
      WHEN OTHERS.
        err( |Unknown table { iv_tab }.| ).
    ENDCASE.
  ENDMETHOD.

  METHOD apply.
    DATA(lv_tab) = to_upper( condense( is_cmd-tab ) ).
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    IF lv_act = 'COPY'.
      IF NOT ( lv_tab = 'BASE' OR lv_tab = 'TOPUP' OR lv_tab = 'SLAB' OR lv_tab = 'LIMIT' ).
        err( `Copy is available for the premium, slab and limit tables only.` ).
      ENDIF.
      rv_count = copy_year( is_cmd ).
      RETURN.
    ENDIF.
    CASE lv_tab.
      WHEN 'BASE'.    rv_count = ap_base( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'TOPUP'.   rv_count = ap_topup( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'MPERIOD'. rv_count = ap_period( is_cmd = is_cmd it_rows = it_rows iv_life = abap_false ).
      WHEN 'LPERIOD'. rv_count = ap_period( is_cmd = is_cmd it_rows = it_rows iv_life = abap_true ).
      WHEN 'AUTH'.    rv_count = ap_auth( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'SLAB'.    rv_count = ap_slab( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'LIMIT'.   rv_count = ap_limit( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'EXCL'.    rv_count = ap_excl( is_cmd = is_cmd it_rows = it_rows ).
      WHEN 'DATE'.    rv_count = ap_date( is_cmd = is_cmd it_rows = it_rows ).
      WHEN OTHERS.    err( |Unknown table { is_cmd-tab }.| ).
    ENDCASE.
  ENDMETHOD.

  METHOD ap_base.
    DATA: lt_new TYPE STANDARD TABLE OF zbase_premium WITH DEFAULT KEY,
          ls_new TYPE zbase_premium.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE REPLACE DELETE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-zyear = year_of( iv_row = ls_r-year iv_cmd = is_cmd-year ).
      ls_new-from_age = whole( iv_text = ls_r-key1 iv_what = 'from age' iv_max = 3 ).
      ls_new-to_age = whole( iv_text = ls_r-key2 iv_what = 'to age' iv_max = 3 ).
      ls_new-premium_amt = money( iv_text = ls_r-key3 iv_what = 'sum insured' ).
      IF lv_act <> 'DELETE'.
        IF ls_new-from_age > ls_new-to_age.
          err( |Age band { ls_new-from_age }-{ ls_new-to_age }: from age is above to age.| ).
        ENDIF.
        IF ls_new-premium_amt <= 0.
          err( `Sum insured must be above zero.` ).
        ENDIF.
        ls_new-pre_age = money( iv_text = ls_r-val1 iv_what = 'premium' ).
        IF ls_new-pre_age <= 0.
          err( |Premium of age band { ls_new-from_age }-{ ls_new-to_age } must be above zero.| ).
        ENDIF.
      ENDIF.
      APPEND ls_new TO lt_new.
    ENDLOOP.
    DATA(lt_chk) = lt_new.
    SORT lt_chk BY zyear from_age to_age premium_amt.
    DELETE ADJACENT DUPLICATES FROM lt_chk COMPARING zyear from_age to_age premium_amt.
    IF lines( lt_chk ) <> lines( lt_new ).
      err( `The same age band and sum insured appears twice.` ).
    ENDIF.
    CASE lv_act.
      WHEN 'REPLACE'.
        DATA(lv_y) = year_of( iv_row = '' iv_cmd = is_cmd-year ).
        DELETE FROM zbase_premium WHERE zyear = @lv_y.
        LOOP AT lt_new INTO ls_new WHERE zyear <> lv_y.
          err( `All rows must belong to the selected year.` ).
        ENDLOOP.
        MODIFY zbase_premium FROM TABLE @lt_new.
      WHEN 'DELETE'.
        DELETE zbase_premium FROM TABLE @lt_new.
      WHEN OTHERS.
        MODIFY zbase_premium FROM TABLE @lt_new.
    ENDCASE.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_topup.
    DATA: lt_new TYPE STANDARD TABLE OF ztop_premium WITH DEFAULT KEY,
          ls_new TYPE ztop_premium.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE REPLACE DELETE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-zyear = year_of( iv_row = ls_r-year iv_cmd = is_cmd-year ).
      ls_new-top_up_amt = money( iv_text = ls_r-key1 iv_what = 'top-up amount' ).
      IF lv_act <> 'DELETE'.
        IF ls_new-top_up_amt <= 0.
          err( `Top-up amount must be above zero.` ).
        ENDIF.
        ls_new-rt_family = money( iv_text = ls_r-val1 iv_what = 'top-up premium' ).
        IF ls_new-rt_family <= 0.
          err( |Premium of top-up { amt_txt( ls_new-top_up_amt ) } must be above zero.| ).
        ENDIF.
      ENDIF.
      APPEND ls_new TO lt_new.
    ENDLOOP.
    DATA(lt_chk) = lt_new.
    SORT lt_chk BY zyear top_up_amt.
    DELETE ADJACENT DUPLICATES FROM lt_chk COMPARING zyear top_up_amt.
    IF lines( lt_chk ) <> lines( lt_new ).
      err( `The same top-up amount appears twice.` ).
    ENDIF.
    CASE lv_act.
      WHEN 'REPLACE'.
        DATA(lv_y) = year_of( iv_row = '' iv_cmd = is_cmd-year ).
        DELETE FROM ztop_premium WHERE zyear = @lv_y.
        LOOP AT lt_new INTO ls_new WHERE zyear <> lv_y.
          err( `All rows must belong to the selected year.` ).
        ENDLOOP.
        MODIFY ztop_premium FROM TABLE @lt_new.
      WHEN 'DELETE'.
        DELETE ztop_premium FROM TABLE @lt_new.
      WHEN OTHERS.
        MODIFY ztop_premium FROM TABLE @lt_new.
    ENDCASE.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_period.
    DATA: lt_new TYPE STANDARD TABLE OF zlife_period WITH DEFAULT KEY,
          ls_new TYPE zlife_period,
          lt_m   TYPE STANDARD TABLE OF zmedi_period WITH DEFAULT KEY.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE DELETE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-zyear = year_of( iv_row = ls_r-key1 iv_cmd = '' ).
      ls_new-status = COND #( WHEN to_upper( condense( ls_r-val1 ) ) = 'X' THEN 'X' ELSE '' ).
      APPEND ls_new TO lt_new.
    ENDLOOP.
    DATA(lv_x) = 0.
    LOOP AT lt_new INTO ls_new WHERE status = 'X'.
      lv_x = lv_x + 1.
    ENDLOOP.
    IF lv_act = 'SAVE' AND lv_x > 1.
      err( `Only one period can be active.` ).
    ENDIF.
    lt_m = CORRESPONDING #( lt_new ).
    IF lv_act = 'DELETE'.
      IF iv_life = abap_true.
        DELETE zlife_period FROM TABLE @lt_new.
      ELSE.
        DELETE zmedi_period FROM TABLE @lt_m.
      ENDIF.
    ELSE.
      IF iv_life = abap_true.
        MODIFY zlife_period FROM TABLE @lt_new.
        LOOP AT lt_new INTO ls_new WHERE status = 'X'.
          UPDATE zlife_period SET status = '' WHERE zyear <> @ls_new-zyear.
        ENDLOOP.
      ELSE.
        MODIFY zmedi_period FROM TABLE @lt_m.
        LOOP AT lt_new INTO ls_new WHERE status = 'X'.
          UPDATE zmedi_period SET status = '' WHERE zyear <> @ls_new-zyear.
        ENDLOOP.
      ENDIF.
    ENDIF.
    DATA lv_active TYPE i.
    IF iv_life = abap_true.
      SELECT COUNT(*) FROM zlife_period WHERE status = 'X' INTO @lv_active.
    ELSE.
      SELECT COUNT(*) FROM zmedi_period WHERE status = 'X' INTO @lv_active.
    ENDIF.
    IF lv_active <> 1.
      err( `Exactly one period must be active (the policy year the app works on).` ).
    ENDIF.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_auth.
    DATA: lt_new TYPE STANDARD TABLE OF zmedi_auth_users WITH DEFAULT KEY,
          ls_new TYPE zmedi_auth_users.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE REPLACE DELETE' ).
    SELECT MAX( sl_no ) FROM zmedi_auth_users INTO @DATA(lv_max).
    DATA(lv_next) = CONV i( lv_max ).
    IF lv_act = 'REPLACE'.
      lv_next = 0.
    ENDIF.
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      IF ls_r-key1 IS NOT INITIAL.
        ls_new-sl_no = lpad( iv_s = |{ whole( iv_text = ls_r-key1 iv_what = 'serial number' iv_max = 2 ) }| iv_w = 2 ).
      ENDIF.
      IF lv_act <> 'DELETE'.
        DATA(lv_user) = to_lower( condense( ls_r-val1 ) ).
        IF NOT matches( val = lv_user regex = '[a-z0-9._@\-]{1,30}' ).
          err( |Invalid user id "{ lv_user }" (letters, digits, dot, dash, underscore, up to 30 characters).| ).
        ENDIF.
        DATA(lv_flag) = to_upper( condense( ls_r-val2 ) ).
        IF lv_flag <> 'R' AND lv_flag <> 'E'.
          err( |Flag of { lv_user } must be R (HR admin) or E (editor).| ).
        ENDIF.
        ls_new-userid = lv_user.
        ls_new-flag = lv_flag.
        IF ls_new-sl_no IS INITIAL.
          lv_next = lv_next + 1.
          IF lv_next > 99.
            err( `The authorised user list is full (99 rows).` ).
          ENDIF.
          ls_new-sl_no = |{ lv_next WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        ELSEIF lv_act = 'REPLACE'.
          lv_next = nmax( val1 = lv_next val2 = CONV i( ls_new-sl_no ) ).
        ENDIF.
      ELSEIF ls_new-sl_no IS INITIAL.
        err( `Serial number is required to delete a user.` ).
      ENDIF.
      APPEND ls_new TO lt_new.
    ENDLOOP.
    IF lv_act <> 'DELETE'.
      DATA(lt_chk) = lt_new.
      SORT lt_chk BY userid flag.
      DELETE ADJACENT DUPLICATES FROM lt_chk COMPARING userid flag.
      IF lines( lt_chk ) <> lines( lt_new ).
        err( `The same user and flag appears twice.` ).
      ENDIF.
    ENDIF.
    CASE lv_act.
      WHEN 'REPLACE'.
        DELETE FROM zmedi_auth_users.
        MODIFY zmedi_auth_users FROM TABLE @lt_new.
      WHEN 'DELETE'.
        DELETE zmedi_auth_users FROM TABLE @lt_new.
      WHEN OTHERS.
        MODIFY zmedi_auth_users FROM TABLE @lt_new.
    ENDCASE.
    SELECT COUNT(*) FROM zmedi_auth_users WHERE flag = 'R' INTO @DATA(lv_admins).
    IF lv_admins = 0.
      err( `At least one HR admin (flag R) must remain, otherwise nobody can maintain the apps.` ).
    ENDIF.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_slab.
    DATA: lt_new TYPE STANDARD TABLE OF zlife_amt WITH DEFAULT KEY,
          ls_new TYPE zlife_amt.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE REPLACE DELETE' ).
    DATA(lv_seq) = 0.
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-zyear = year_of( iv_row = ls_r-year iv_cmd = is_cmd-year ).
      lv_seq = lv_seq + 1.
      IF ls_r-key1 IS NOT INITIAL.
        ls_new-slno = lpad( iv_s = |{ whole( iv_text = ls_r-key1 iv_what = 'slab number' iv_max = 2 ) }| iv_w = 2 ).
      ELSEIF lv_act = 'REPLACE'.
        ls_new-slno = |{ lv_seq WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
      ELSE.
        err( `Slab number is required.` ).
      ENDIF.
      IF lv_act <> 'DELETE'.
        DATA(lv_sum) = money( iv_text = ls_r-val1 iv_what = 'sum assured' ).
        IF lv_sum <= 0 OR frac( lv_sum ) <> 0.
          err( |Sum assured of slab { ls_new-slno } must be a whole rupee amount above zero.| ).
        ENDIF.
        ls_new-zsum = lpad( iv_s = |{ CONV i( lv_sum ) }| iv_w = 10 ).
        IF ls_r-val2 IS NOT INITIAL.
          ls_new-zsum_txt = to_upper( condense( ls_r-val2 ) ).
        ELSEIF lv_sum MOD 100000 = 0.
          ls_new-zsum_txt = |{ CONV i( lv_sum DIV 100000 ) } LAKHS|.
        ELSE.
          err( |Enter the text of slab { ls_new-slno } (for example 5 LAKHS).| ).
        ENDIF.
        DATA(lv_pre) = money( iv_text = ls_r-val3 iv_what = 'premium' ).
        DATA(lv_gst) = money( iv_text = ls_r-val4 iv_what = 'GST' ).
        IF frac( lv_pre ) <> 0 OR frac( lv_gst ) <> 0.
          err( |Premium and GST of slab { ls_new-slno } must be whole rupees.| ).
        ENDIF.
        DATA(lv_tot) = lv_pre + lv_gst.
        IF ls_r-val5 IS NOT INITIAL AND money( iv_text = ls_r-val5 iv_what = 'total' ) <> lv_tot.
          err( |Total of slab { ls_new-slno } must be premium + GST ({ CONV i( lv_tot ) }).| ).
        ENDIF.
        ls_new-premium_amt = lpad( iv_s = |{ CONV i( lv_pre ) }| iv_w = 8 ).
        ls_new-gst_amt = lpad( iv_s = |{ CONV i( lv_gst ) }| iv_w = 8 ).
        ls_new-total_prem = lpad( iv_s = |{ CONV i( lv_tot ) }| iv_w = 8 ).
      ENDIF.
      APPEND ls_new TO lt_new.
    ENDLOOP.
    DATA(lt_chk) = lt_new.
    SORT lt_chk BY zyear slno.
    DELETE ADJACENT DUPLICATES FROM lt_chk COMPARING zyear slno.
    IF lines( lt_chk ) <> lines( lt_new ).
      err( `The same slab number appears twice.` ).
    ENDIF.
    CASE lv_act.
      WHEN 'REPLACE'.
        DATA(lv_y) = year_of( iv_row = '' iv_cmd = is_cmd-year ).
        DELETE FROM zlife_amt WHERE zyear = @lv_y.
        LOOP AT lt_new INTO ls_new WHERE zyear <> lv_y.
          err( `All rows must belong to the selected year.` ).
        ENDLOOP.
        MODIFY zlife_amt FROM TABLE @lt_new.
      WHEN 'DELETE'.
        DELETE zlife_amt FROM TABLE @lt_new.
      WHEN OTHERS.
        MODIFY zlife_amt FROM TABLE @lt_new.
    ENDCASE.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_limit.
    DATA: lt_new TYPE STANDARD TABLE OF zlife_ins_limit WITH DEFAULT KEY,
          ls_new TYPE zlife_ins_limit.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE DELETE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-zyear = year_of( iv_row = ls_r-year iv_cmd = is_cmd-year ).
      ls_new-emp_id = lpad( iv_s = |{ whole( iv_text = ls_r-key1 iv_what = 'employee number' iv_max = 8 ) }| iv_w = 8 ).
      IF lv_act = 'SAVE'.
        DATA(lv_lim) = to_upper( condense( ls_r-val1 ) ).
        IF matches( val = lv_lim regex = '\d+' ).
          lv_lim = |{ lv_lim } LAKHS|.
        ENDIF.
        IF NOT matches( val = lv_lim regex = '\d{1,6} LAKHS' ).
          err( |Invalid limit "{ ls_r-val1 }" for employee { ls_r-key1 } (expected for example 50 LAKHS).| ).
        ENDIF.
        ls_new-limit = lv_lim.
      ENDIF.
      APPEND ls_new TO lt_new.
    ENDLOOP.
    IF lv_act = 'DELETE'.
      DELETE zlife_ins_limit FROM TABLE @lt_new.
    ELSE.
      MODIFY zlife_ins_limit FROM TABLE @lt_new.
    ENDIF.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_excl.
    DATA: lt_new TYPE STANDARD TABLE OF zmedi_excl_emp WITH DEFAULT KEY,
          ls_new TYPE zmedi_excl_emp.
    DATA(lv_act) = to_upper( condense( is_cmd-action ) ).
    check_action( iv_action = lv_act iv_allowed = 'SAVE REPLACE DELETE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      CLEAR ls_new.
      ls_new-mandt = sy-mandt.
      ls_new-emp_id = lpad( iv_s = whole( iv_text = ls_r-key1 iv_what = 'employee id' iv_max = 8 ) iv_w = 8 ).
      ls_new-nmae = condense( ls_r-val1 ).
      APPEND ls_new TO lt_new.
    ENDLOOP.
    CASE lv_act.
      WHEN 'REPLACE'.
        DELETE FROM zmedi_excl_emp.
        MODIFY zmedi_excl_emp FROM TABLE @lt_new.
      WHEN 'DELETE'.
        DELETE zmedi_excl_emp FROM TABLE @lt_new.
      WHEN OTHERS.
        MODIFY zmedi_excl_emp FROM TABLE @lt_new.
    ENDCASE.
    rv_count = lines( lt_new ).
  ENDMETHOD.

  METHOD ap_date.
    check_action( iv_action = is_cmd-action iv_allowed = 'SAVE' ).
    LOOP AT it_rows INTO DATA(ls_r).
      DATA(lv_slno) = condense( ls_r-key1 ).
      IF lv_slno <> '1' AND lv_slno <> '2'.
        err( `Row must be 1 (Mediclaim) or 2 (Term Life).` ).
      ENDIF.
      SELECT SINGLE * FROM zmedi_date WHERE slno = @lv_slno INTO @DATA(ls_dat).
      IF sy-subrc <> 0.
        CLEAR ls_dat.
        ls_dat-mandt = sy-mandt.
        ls_dat-slno = lv_slno.
      ENDIF.
      IF ls_r-val1 IS NOT INITIAL.
        DATA(lv_d) = replace( val = condense( ls_r-val1 ) sub = '-' with = '' occ = 0 ).
        IF NOT matches( val = lv_d regex = '\d{8}' ).
          err( |Invalid cut-off date "{ ls_r-val1 }".| ).
        ENDIF.
        DATA lv_date TYPE d.
        lv_date = lv_d.
        IF lv_date IS INITIAL OR lv_date+4(2) > '12' OR lv_date+4(2) = '00' OR lv_date+6(2) > '31' OR lv_date+6(2) = '00'.
          err( |Invalid cut-off date "{ ls_r-val1 }".| ).
        ENDIF.
        ls_dat-co_date = lv_date.
      ENDIF.
      IF ls_r-val2 IS NOT INITIAL.
        DATA(lv_mail) = to_lower( condense( ls_r-val2 ) ).
        IF NOT matches( val = lv_mail regex = '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' ).
          err( `Invalid Mail ID.` ).
        ENDIF.
        ls_dat-email_id = lv_mail.
      ENDIF.
      MODIFY zmedi_date FROM @ls_dat.
      rv_count = rv_count + 1.
    ENDLOOP.
  ENDMETHOD.

  METHOD copy_year.
    DATA(lv_from) = year_of( iv_row = '' iv_cmd = is_cmd-year ).
    DATA(lv_to) = year_of( iv_row = '' iv_cmd = is_cmd-toyear ).
    IF lv_from = lv_to.
      err( `Choose a different target year.` ).
    ENDIF.
    DATA(lv_tab) = to_upper( condense( is_cmd-tab ) ).
    DATA lv_target TYPE i.
    CASE lv_tab.
      WHEN 'BASE'.
        SELECT COUNT(*) FROM zbase_premium WHERE zyear = @lv_to INTO @lv_target.
        IF lv_target > 0.
          err( |{ lv_to } already has base premium rows. Clear them first.| ).
        ENDIF.
        SELECT * FROM zbase_premium WHERE zyear = @lv_from INTO TABLE @DATA(lt_b).
        LOOP AT lt_b ASSIGNING FIELD-SYMBOL(<b>).
          <b>-zyear = lv_to.
        ENDLOOP.
        MODIFY zbase_premium FROM TABLE @lt_b.
        rv_count = lines( lt_b ).
      WHEN 'TOPUP'.
        SELECT COUNT(*) FROM ztop_premium WHERE zyear = @lv_to INTO @lv_target.
        IF lv_target > 0.
          err( |{ lv_to } already has top-up premium rows. Clear them first.| ).
        ENDIF.
        SELECT * FROM ztop_premium WHERE zyear = @lv_from INTO TABLE @DATA(lt_t).
        LOOP AT lt_t ASSIGNING FIELD-SYMBOL(<t>).
          <t>-zyear = lv_to.
        ENDLOOP.
        MODIFY ztop_premium FROM TABLE @lt_t.
        rv_count = lines( lt_t ).
      WHEN 'SLAB'.
        SELECT COUNT(*) FROM zlife_amt WHERE zyear = @lv_to INTO @lv_target.
        IF lv_target > 0.
          err( |{ lv_to } already has slabs. Clear them first.| ).
        ENDIF.
        SELECT * FROM zlife_amt WHERE zyear = @lv_from INTO TABLE @DATA(lt_s).
        LOOP AT lt_s ASSIGNING FIELD-SYMBOL(<s>).
          <s>-zyear = lv_to.
        ENDLOOP.
        MODIFY zlife_amt FROM TABLE @lt_s.
        rv_count = lines( lt_s ).
      WHEN 'LIMIT'.
        SELECT COUNT(*) FROM zlife_ins_limit WHERE zyear = @lv_to INTO @lv_target.
        IF lv_target > 0.
          err( |{ lv_to } already has employee limits. Clear them first.| ).
        ENDIF.
        SELECT * FROM zlife_ins_limit WHERE zyear = @lv_from INTO TABLE @DATA(lt_l).
        LOOP AT lt_l ASSIGNING FIELD-SYMBOL(<l>).
          <l>-zyear = lv_to.
        ENDLOOP.
        MODIFY zlife_ins_limit FROM TABLE @lt_l.
        rv_count = lines( lt_l ).
    ENDCASE.
    IF rv_count = 0.
      err( |Nothing to copy: { lv_from } has no rows.| ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
