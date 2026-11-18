CLASS zcl_life_ins_utils DEFINITION PUBLIC FINAL CREATE PUBLIC.
* Business logic for the Term Life policy app (Emami Apps "Term Policy"), extracted from the
* Web Dynpro component ZWD_MEDICAIM_NOMINEE (views MAIN, DISPLAY, V_DOWNLOAD, V_LIMIT_UP,
* MASS_UPLOAD, V_SEND_MAIL). No UI, no COMMIT WORK: the caller (OData DPC_EXT) commits.
* Differences from the Web Dynpro on purpose (see term-policy/sap/README.md):
*  - HR master data, premium, GST and total are re-derived here, never taken from the client.
*  - Age is calculated at 1 August of the current year (was hard-coded 20260801 in the WD).
*  - Change mode reads created_by from ZLIFE_EMP (the WD read ZMEDI_EMP, the mediclaim table).
  PUBLIC SECTION.
    TYPES:
      BEGIN OF ty_emp,
        emp_id     TYPE zlife_emp-emp_id,
        fname      TYPE zlife_emp-fname,
        lname      TYPE zlife_emp-lname,
        dob        TYPE zlife_emp-dob,
        age_in_yrs TYPE zlife_emp-age_in_yrs,
        gen_text   TYPE zlife_emp-gen_text,
        comp_code  TYPE zlife_emp-comp_code,
        code_txt   TYPE zlife_emp-code_txt,
        dept       TYPE zlife_emp-dept,
        ou_text    TYPE zlife_emp-ou_text,
        design     TYPE zlife_emp-design,
        design_txt TYPE zlife_emp-design_txt,
        location   TYPE zlife_emp-location,
        loc_txt    TYPE zlife_emp-loc_txt,
        email      TYPE zlife_emp-email,
        limit_txt  TYPE zlife_ins_limit-limit,
        zyear      TYPE zlife_emp-zyear,
      END OF ty_emp,
      BEGIN OF ty_nominee,
        name      TYPE zlife_family-name,
        relation  TYPE zlife_family-relation,
        per_share TYPE zlife_family-per_share,
      END OF ty_nominee,
      tt_nominee TYPE STANDARD TABLE OF ty_nominee WITH DEFAULT KEY,
      BEGIN OF ty_input,
        emp_id    TYPE zlife_emp-emp_id,
        sum_base  TYPE zlife_emp-sum_base,
        pmail     TYPE zlife_emp-pmail,
        contact   TYPE zlife_emp-contact,
      END OF ty_input,
      tt_amt   TYPE STANDARD TABLE OF zlife_amt WITH DEFAULT KEY,
      tt_emp   TYPE STANDARD TABLE OF zlife_emp WITH DEFAULT KEY,
      tt_fam   TYPE STANDARD TABLE OF zlife_family WITH DEFAULT KEY,
      tt_limit TYPE STANDARD TABLE OF zlife_ins_limit WITH DEFAULT KEY,
      tt_reqno TYPE STANDARD TABLE OF zlife_emp-reqno WITH DEFAULT KEY.

    CONSTANTS:
      c_role_admin  TYPE char10 VALUE 'ADMIN',    " ZMEDI_AUTH_USERS flag R: download / delete / mail / limits
      c_role_editor TYPE char10 VALUE 'EDITOR',   " flag E: apply for anyone, change, past cut-off
      c_role_user   TYPE char10 VALUE 'USER'.

    CLASS-METHODS:
      user_from_email  IMPORTING iv_email TYPE string RETURNING VALUE(rv_user) TYPE zuname,
      get_role         IMPORTING iv_user TYPE zuname RETURNING VALUE(rv_role) TYPE char10,
      is_admin         IMPORTING iv_user TYPE zuname RETURNING VALUE(rv_yes) TYPE abap_bool,
      is_editor        IMPORTING iv_user TYPE zuname RETURNING VALUE(rv_yes) TYPE abap_bool,
      find_pernr       IMPORTING iv_email TYPE string RETURNING VALUE(rv_pernr) TYPE zlife_emp-emp_id,
      active_year      RETURNING VALUE(rv_year) TYPE zlife_period-zyear,
      get_employee     IMPORTING iv_pernr TYPE zlife_emp-emp_id iv_user TYPE zuname
                       EXPORTING es_emp   TYPE ty_emp ev_error TYPE string,
      get_sum_options  IMPORTING iv_pernr TYPE zlife_emp-emp_id RETURNING VALUE(rt_amt) TYPE tt_amt,
      save_policy      IMPORTING iv_user TYPE zuname iv_email TYPE string iv_reqno TYPE zlife_emp-reqno OPTIONAL
                                is_input TYPE ty_input it_nominee TYPE tt_nominee
                       EXPORTING ev_reqno TYPE zlife_emp-reqno ev_error TYPE string,
      delete_policy    IMPORTING iv_user TYPE zuname iv_reqno TYPE zlife_emp-reqno
                       EXPORTING ev_error TYPE string,
      get_policy       IMPORTING iv_user TYPE zuname iv_reqno TYPE zlife_emp-reqno
                       EXPORTING es_emp TYPE zlife_emp et_family TYPE tt_fam ev_error TYPE string,
      search_policies  IMPORTING iv_user TYPE zuname iv_pernr TYPE zlife_emp-emp_id OPTIONAL
                                 iv_all  TYPE abap_bool OPTIONAL
                                 iv_year TYPE zlife_period-zyear OPTIONAL
                       EXPORTING et_emp TYPE tt_emp et_family TYPE tt_fam ev_error TYPE string,
      save_limits      IMPORTING iv_user TYPE zuname it_limit TYPE tt_limit
                       EXPORTING ev_count TYPE i ev_error TYPE string,
      send_summary     IMPORTING iv_user TYPE zuname it_reqno TYPE tt_reqno
                       EXPORTING ev_error TYPE string.

  PRIVATE SECTION.
    CLASS-METHODS:
      read_hr    IMPORTING iv_pernr TYPE zlife_emp-emp_id
                 EXPORTING es_emp TYPE ty_emp ev_error TYPE string,
      limit_in_rupees IMPORTING iv_pernr TYPE zlife_emp-emp_id iv_year TYPE zlife_period-zyear
                      RETURNING VALUE(rv_amt) TYPE zlife_amt-zsum,
      next_reqno RETURNING VALUE(rv_reqno) TYPE zlife_emp-reqno,
      lock_saves RETURNING VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.


CLASS zcl_life_ins_utils IMPLEMENTATION.

  METHOD user_from_email.
    " The SAP user (lower case, as stored in ZMEDI_AUTH_USERS / ZLIFE_EMP-CREATED_BY) that owns this mail address in the
    " user master (USR21 + ADR6). Mail local parts are NOT user names (user sandip.das, mail SANDIPD@...), so the
    " local part is only a last resort when the address is not in the user master.
    DATA(lv_mail) = to_upper( condense( iv_email ) ).
    DATA lv_srch TYPE adr6-smtp_srch.
    lv_srch = lv_mail.
    SELECT u~bname, a~smtp_addr FROM usr21 AS u
      INNER JOIN adr6 AS a ON a~addrnumber = u~addrnumber AND a~persnumber = u~persnumber
      WHERE a~smtp_srch = @lv_srch
      INTO TABLE @DATA(lt_hit).
    LOOP AT lt_hit INTO DATA(ls_hit).
      IF to_upper( condense( ls_hit-smtp_addr ) ) = lv_mail.
        rv_user = to_lower( ls_hit-bname ).
        RETURN.
      ENDIF.
    ENDLOOP.
    rv_user = to_lower( substring_before( val = lv_mail sub = '@' ) ).
  ENDMETHOD.

  METHOD get_role.
    DATA(lv_user) = to_lower( iv_user ).
    SELECT SINGLE flag FROM zmedi_auth_users INTO @DATA(lv_flag) WHERE userid = @lv_user AND flag = 'R'.
    IF sy-subrc = 0.
      rv_role = c_role_admin.
      RETURN.
    ENDIF.
    SELECT SINGLE flag FROM zmedi_auth_users INTO @lv_flag WHERE userid = @lv_user AND flag = 'E'.
    IF sy-subrc = 0.
      rv_role = c_role_editor.
      RETURN.
    ENDIF.
    rv_role = c_role_user.
  ENDMETHOD.

  METHOD is_admin.
    rv_yes = xsdbool( get_role( iv_user ) = c_role_admin ).
  ENDMETHOD.

  METHOD is_editor.
    DATA(lv_role) = get_role( iv_user ).
    rv_yes = xsdbool( lv_role = c_role_editor ).
  ENDMETHOD.

  METHOD find_pernr.
    " PA0105 subtype 0010 holds the company mail in UPPER case, and one address can sit on several employee numbers
    " (re-hires, duplicates). Only an employee who is active today counts; when that is still ambiguous nothing is
    " returned, so the caller asks the person to contact HR instead of guessing whose policy this is.
    DATA lv_usrid TYPE pa0105-usrid_long.
    lv_usrid = to_upper( condense( iv_email ) ).
    SELECT DISTINCT a~pernr FROM pa0105 AS a
      INNER JOIN pa0000 AS h ON h~pernr = a~pernr
      WHERE a~subty = '0010' AND a~usrid_long = @lv_usrid AND a~begda <= @sy-datum AND a~endda >= @sy-datum
        AND h~begda <= @sy-datum AND h~endda >= @sy-datum AND h~stat2 = '3'
      INTO TABLE @DATA(lt_pernr).
    IF lines( lt_pernr ) = 1.
      rv_pernr = lt_pernr[ 1 ]-pernr.
    ENDIF.
  ENDMETHOD.

  METHOD active_year.
    SELECT SINGLE zyear FROM zlife_period INTO rv_year WHERE status = 'X'.
  ENDMETHOD.

  METHOD read_hr.
    DATA: it_z0001 TYPE STANDARD TABLE OF p0001,
          it_z0002 TYPE STANDARD TABLE OF p0002,
          lv_rc1   TYPE sy-subrc,
          lv_rc2   TYPE sy-subrc,
          lv_years TYPE num2,
          lv_mons  TYPE num2,
          lv_days  TYPE num2,
          lv_ref   TYPE sy-datum.
    CLEAR: es_emp, ev_error.
    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING pernr = iv_pernr infty = '0001' begda = sy-datum endda = '99991231'
      IMPORTING subrc = lv_rc1
      TABLES    infty_tab = it_z0001
      EXCEPTIONS OTHERS = 1.
    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING pernr = iv_pernr infty = '0002' begda = sy-datum endda = '99991231'
      IMPORTING subrc = lv_rc2
      TABLES    infty_tab = it_z0002
      EXCEPTIONS infty_not_found = 1 OTHERS = 2.
    IF it_z0001 IS INITIAL OR it_z0002 IS INITIAL.
      ev_error = 'Employee ID does not exist.'.
      RETURN.
    ENDIF.
    READ TABLE it_z0001 INTO DATA(ls_1) INDEX 1.
    READ TABLE it_z0002 INTO DATA(ls_2) INDEX 1.
    IF ls_1-bukrs <> '1000'.
      ev_error = 'You are not an employee under Emami Limited.'.
      RETURN.
    ENDIF.
    es_emp-emp_id    = iv_pernr.
    es_emp-comp_code = ls_1-bukrs.
    es_emp-dept      = ls_1-orgeh.
    es_emp-design    = ls_1-plans.
    es_emp-location  = ls_1-werks.
    es_emp-fname     = ls_2-vorna.
    es_emp-lname     = ls_2-nachn.
    es_emp-dob       = ls_2-gbdat.
    es_emp-gen_text  = COND #( WHEN ls_2-gesch = '1' THEN 'Male' ELSE 'Female' ).
    SELECT SINGLE plstx FROM t528t INTO @es_emp-design_txt
      WHERE plans = @ls_1-plans AND begda <= @sy-datum AND endda >= @sy-datum AND sprsl = 'E'.
    SELECT SINGLE btext FROM t001p INTO @es_emp-loc_txt WHERE werks = @ls_1-werks.
    SELECT SINGLE orgtx FROM t527x INTO @es_emp-ou_text
      WHERE orgeh = @ls_1-orgeh AND begda <= @sy-datum AND endda >= @sy-datum AND sprsl = 'E'.
    SELECT SINGLE butxt FROM t001 INTO @es_emp-code_txt WHERE bukrs = @ls_1-bukrs AND spras = 'E'.
    SELECT SINGLE usrid_long FROM pa0105 INTO @es_emp-email
      WHERE pernr = @iv_pernr AND subty = '0010' AND begda <= @sy-datum AND endda >= @sy-datum.
    " age as at 1 August of the current year; 6+ months rounds up (same rule as the Web Dynpro)
    lv_ref = |{ sy-datum(4) }0801|.
    CALL FUNCTION 'HRCM_TIME_PERIOD_CALCULATE'
      EXPORTING begda = ls_2-gbdat endda = lv_ref
      IMPORTING noyrs = lv_years nomns = lv_mons nodys = lv_days
      EXCEPTIONS invalid_dates = 1 overflow = 2 OTHERS = 3.
    IF lv_mons >= 6.
      lv_years = lv_years + 1.
    ENDIF.
    es_emp-age_in_yrs = lv_years.
  ENDMETHOD.

  METHOD get_employee.
    CLEAR: es_emp, ev_error.
    IF iv_pernr IS INITIAL.
      ev_error = 'Enter Employee ID.'.
      RETURN.
    ENDIF.
    DATA(lv_year) = active_year( ).
    IF lv_year IS INITIAL.
      ev_error = 'No active policy period is configured. Contact HR.'.
      RETURN.
    ENDIF.
    " cut-off date: after ZMEDI_DATE slno 2 only editors, or employees in their first 30 days, may apply
    SELECT SINGLE co_date FROM zmedi_date INTO @DATA(lv_codate) WHERE slno = '2'.
    IF sy-subrc = 0 AND sy-datum > lv_codate AND is_editor( iv_user ) = abap_false AND is_admin( iv_user ) = abap_false.
      SELECT begda FROM pa0000 INTO @DATA(lv_joined) UP TO 1 ROWS
        WHERE pernr = @iv_pernr AND massn IN ('EA', 'EB', 'EH', 'EI') ORDER BY begda DESCENDING.
      ENDSELECT.
      DATA(lv_grace_end) = lv_joined + 30.
      IF sy-subrc <> 0 OR sy-datum > lv_grace_end.
        ev_error = 'You have exceeded the permissible date limit. Please contact HR department'.
        RETURN.
      ENDIF.
    ENDIF.
    read_hr( EXPORTING iv_pernr = iv_pernr IMPORTING es_emp = es_emp ev_error = ev_error ).
    IF ev_error IS NOT INITIAL.
      CLEAR es_emp.
      RETURN.
    ENDIF.
    es_emp-zyear = lv_year.
    SELECT SINGLE limit FROM zlife_ins_limit INTO @es_emp-limit_txt WHERE emp_id = @iv_pernr AND zyear = @lv_year.
  ENDMETHOD.

  METHOD limit_in_rupees.
    " ZLIFE_INS_LIMIT-LIMIT is text like '50 LAKHS'; the number is lakhs
    SELECT SINGLE limit FROM zlife_ins_limit INTO @DATA(lv_limit) WHERE emp_id = @iv_pernr AND zyear = @iv_year.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    SPLIT lv_limit AT space INTO DATA(lv_num) DATA(lv_unit).
    IF lv_num CO '0123456789 ' AND lv_num IS NOT INITIAL.
      rv_amt = CONV i( lv_num ) * 100000.
    ENDIF.
  ENDMETHOD.

  METHOD get_sum_options.
    DATA(lv_year) = active_year( ).
    DATA(lv_max) = limit_in_rupees( iv_pernr = iv_pernr iv_year = lv_year ).
    SELECT * FROM zlife_amt INTO TABLE @rt_amt WHERE zsum <= @lv_max AND zyear = @lv_year ORDER BY slno.
  ENDMETHOD.

  METHOD next_reqno.
    CALL FUNCTION 'ZLIFE_REQNO' IMPORTING ex_reqno = rv_reqno.
  ENDMETHOD.

  METHOD lock_saves.
    " ZLIFE_REQNO hands out MAX( reqno ) + 1 and the duplicate-employee check is a plain SELECT, so two saves running together
    " could get the same request number (the second MODIFY would overwrite the first policy) or both pass the duplicate check.
    " One exclusive lock, taken before either is read and released by the caller's COMMIT / ROLLBACK, serialises the saves.
    " Saving is a rare, short action, so one lock for the whole table costs nothing.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable = 'E'
        tabname      = 'ZLIFE_EMP'
        varkey       = 'SAVE'
        _wait        = abap_true
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    rv_ok = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

  METHOD save_policy.
    DATA: ls_emp  TYPE zlife_emp,
          lt_fam  TYPE tt_fam,
          ls_info TYPE ty_emp,
          lv_err  TYPE string,
          lv_sum  TYPE i,
          lv_idx  TYPE i VALUE 2.
    CLEAR: ev_reqno, ev_error.

    " ---- who and what -------------------------------------------------------------------------
    DATA lv_user TYPE zuname.
    lv_user = to_lower( iv_user ).
    DATA(lv_change) = xsdbool( iv_reqno IS NOT INITIAL ).
    IF lock_saves( ) = abap_false.
      ev_error = 'Another request is being saved right now. Please try again in a moment.'.
      RETURN.
    ENDIF.
    IF lv_change = abap_true.
      SELECT SINGLE * FROM zlife_emp INTO @DATA(ls_old) WHERE reqno = @iv_reqno AND del_flag <> 'X'.
      IF sy-subrc <> 0.
        ev_error = |Request { iv_reqno } not found.|.
        RETURN.
      ENDIF.
      IF is_editor( lv_user ) = abap_false AND to_lower( ls_old-created_by ) <> lv_user.
        ev_error = 'You are not authorized to modify. Contact the person who created the premium structure for this employee.'.
        RETURN.
      ENDIF.
      IF ls_old-emp_id <> is_input-emp_id.
        ev_error = 'Employee cannot be changed on an existing request.'.
        RETURN.
      ENDIF.
    ELSE.
      " an ordinary user may only apply for themselves; editors/admins apply on behalf of anyone
      IF is_editor( lv_user ) = abap_false AND is_admin( lv_user ) = abap_false.
        DATA(lv_self) = find_pernr( iv_email ).
        IF lv_self IS INITIAL OR lv_self <> is_input-emp_id.
          ev_error = 'You can apply only for your own employee ID.'.
          RETURN.
        ENDIF.
      ENDIF.
    ENDIF.

    " ---- employee data from HR (never from the client) ---------------------------------------
    IF lv_change = abap_true.
      read_hr( EXPORTING iv_pernr = is_input-emp_id IMPORTING es_emp = ls_info ev_error = lv_err ).
      ls_info-zyear = ls_old-zyear.
    ELSE.
      get_employee( EXPORTING iv_pernr = is_input-emp_id iv_user = lv_user IMPORTING es_emp = ls_info ev_error = lv_err ).
      IF lv_err IS INITIAL.
        SELECT SINGLE reqno FROM zlife_emp INTO @DATA(lv_dup)
          WHERE emp_id = @is_input-emp_id AND del_flag <> 'X' AND zyear = @ls_info-zyear.
        IF sy-subrc = 0.
          lv_err = |Policy for the employee id { is_input-emp_id ALPHA = OUT } already exists|.
        ENDIF.
      ENDIF.
    ENDIF.
    IF lv_err IS NOT INITIAL.
      ev_error = lv_err.
      RETURN.
    ENDIF.

    " ---- field validation (same rules as the Web Dynpro) ------------------------------------
    IF ls_info-email IS INITIAL.
      IF is_input-pmail IS INITIAL.
        ev_error = 'Enter personal mail id.'.
        RETURN.
      ENDIF.
      FIND REGEX '^\w+([.\-]\w+)*@(\w+[.\-])+\w{2,}$' IN is_input-pmail.
      IF sy-subrc <> 0.
        ev_error = 'Invalid Mail ID.'.
        RETURN.
      ENDIF.
    ENDIF.
    IF is_input-contact IS INITIAL.
      ev_error = 'Enter mobile number.'.
      RETURN.
    ENDIF.
    DATA(lv_contact) = condense( CONV string( is_input-contact ) ).
    IF lv_contact CN '0123456789'.
      ev_error = |Invalid characters in mobile number { lv_contact }|.
      RETURN.
    ENDIF.
    IF strlen( lv_contact ) <> 10.
      ev_error = 'Enter 10 digits for the mobile number'.
      RETURN.
    ENDIF.

    " ---- sum assured: must be one of the slabs the employee's limit allows -------------------
    IF is_input-sum_base IS INITIAL OR is_input-sum_base = '00 LAKHS'.
      ev_error = 'Enter the sum to be insured.'.
      RETURN.
    ENDIF.
    DATA(lt_opt) = get_sum_options( is_input-emp_id ).
    READ TABLE lt_opt INTO DATA(ls_amt) WITH KEY zsum_txt = is_input-sum_base.
    IF sy-subrc <> 0.
      ev_error = 'The selected sum assured is not allowed for this employee.'.
      RETURN.
    ENDIF.

    " ---- nominees -------------------------------------------------------------------------------
    LOOP AT it_nominee INTO DATA(ls_nom) WHERE name IS NOT INITIAL OR per_share IS NOT INITIAL.
      IF ls_nom-name IS INITIAL OR ls_nom-per_share IS INITIAL.
        ev_error = 'Each nominee needs a name and a share.'.
        RETURN.
      ENDIF.
      IF ls_nom-relation NA '3456' OR strlen( condense( ls_nom-relation ) ) <> 1.
        ev_error = |Choose a valid relation for nominee { ls_nom-name }.|.
        RETURN.
      ENDIF.
      IF condense( ls_nom-per_share ) CN '0123456789'.
        ev_error = |Share for { ls_nom-name } must be a whole number.|.
        RETURN.
      ENDIF.
      lv_sum = lv_sum + CONV i( condense( ls_nom-per_share ) ).
      APPEND VALUE #( reqno = space name = ls_nom-name relation = ls_nom-relation per_share = condense( ls_nom-per_share ) ) TO lt_fam.
    ENDLOOP.
    IF lines( lt_fam ) = 0.
      ev_error = 'Add at least one nominee.'.
      RETURN.
    ENDIF.
    IF lines( lt_fam ) > 6.
      ev_error = 'A maximum of 6 nominees is allowed.'.
      RETURN.
    ENDIF.
    IF lv_sum <> 100.
      ev_error = 'Distribution of share is not 100%'.
      RETURN.
    ENDIF.

    " ---- build rows -----------------------------------------------------------------------------
    IF lv_change = abap_true.
      ev_reqno = iv_reqno.
      ls_emp-req_dat    = ls_old-req_dat.
      ls_emp-created_by = ls_old-created_by.
    ELSE.
      ev_reqno = next_reqno( ).
      ls_emp-req_dat    = sy-datum.
      ls_emp-created_by = lv_user.
    ENDIF.
    ls_emp-reqno      = ev_reqno.
    ls_emp-zyear      = ls_info-zyear.
    ls_emp-emp_id     = ls_info-emp_id.
    ls_emp-comp_code  = ls_info-comp_code.
    ls_emp-code_txt   = ls_info-code_txt.
    ls_emp-dept       = ls_info-dept.
    ls_emp-ou_text    = ls_info-ou_text.
    ls_emp-fname      = ls_info-fname.
    ls_emp-lname      = ls_info-lname.
    ls_emp-design     = ls_info-design.
    ls_emp-design_txt = ls_info-design_txt.
    ls_emp-dob        = ls_info-dob.
    ls_emp-age_in_yrs = ls_info-age_in_yrs.
    ls_emp-gen_text   = ls_info-gen_text.
    ls_emp-location   = ls_info-location.
    ls_emp-loc_txt    = ls_info-loc_txt.
    ls_emp-email      = ls_info-email.
    ls_emp-pmail      = is_input-pmail.
    ls_emp-contact    = lv_contact.
    ls_emp-sum_base   = ls_amt-zsum_txt.
    ls_emp-pre_base   = ls_amt-premium_amt.
    ls_emp-gst        = ls_amt-gst_amt.
    ls_emp-total_pre  = ls_amt-total_prem.
    LOOP AT lt_fam ASSIGNING FIELD-SYMBOL(<f>).
      <f>-reqno    = ev_reqno.
      <f>-sl_no    = lv_idx.
      <f>-crt_date = sy-datum.
      lv_idx = lv_idx + 1.
    ENDLOOP.

    " ---- persist: identical to FM ZLIFE_UPDATE_TABS (caller commits) -----------------------
    MODIFY zlife_emp FROM ls_emp.
    DELETE FROM zlife_family WHERE reqno = ev_reqno.
    MODIFY zlife_family FROM TABLE lt_fam.
  ENDMETHOD.

  METHOD delete_policy.
    CLEAR ev_error.
    IF is_admin( iv_user ) = abap_false.
      ev_error = 'You are not authorized to delete. Contact HR team for help.'.
      RETURN.
    ENDIF.
    SELECT SINGLE * FROM zlife_emp INTO @DATA(ls_emp) WHERE reqno = @iv_reqno.
    IF sy-subrc <> 0.
      ev_error = |Request { iv_reqno } not found.|.
      RETURN.
    ENDIF.
    ls_emp-del_flag = 'X'.
    MODIFY zlife_emp FROM ls_emp.
  ENDMETHOD.

  METHOD get_policy.
    CLEAR: es_emp, et_family, ev_error.
    SELECT SINGLE * FROM zlife_emp INTO @es_emp WHERE reqno = @iv_reqno AND del_flag <> 'X'.
    IF sy-subrc <> 0.
      ev_error = |Request { iv_reqno } not found.|.
      RETURN.
    ENDIF.
    IF is_admin( iv_user ) = abap_false AND is_editor( iv_user ) = abap_false AND to_lower( es_emp-created_by ) <> to_lower( iv_user ).
      CLEAR es_emp.
      ev_error = 'No policy available or the policy for this employee was not created by you.'.
      RETURN.
    ENDIF.
    SELECT * FROM zlife_family INTO TABLE @et_family WHERE reqno = @iv_reqno ORDER BY sl_no.
  ENDMETHOD.

  METHOD search_policies.
    CLEAR: et_emp, et_family, ev_error.
    DATA(lv_year) = COND zlife_period-zyear( WHEN iv_year IS NOT INITIAL THEN iv_year ELSE active_year( ) ).
    DATA lv_user TYPE zuname.
    lv_user = to_lower( iv_user ).
    DATA(lv_admin) = is_admin( lv_user ).
    IF iv_all = abap_true AND lv_admin = abap_false.
      ev_error = 'You are not authorized to download.'.
      RETURN.
    ENDIF.
    IF iv_all = abap_true.
      SELECT * FROM zlife_emp INTO TABLE @et_emp WHERE del_flag <> 'X' AND zyear = @lv_year ORDER BY reqno.
    ELSEIF iv_pernr IS NOT INITIAL.
      " editors/admins see any employee; an ordinary user only their own creations
      SELECT * FROM zlife_emp INTO TABLE @et_emp WHERE emp_id = @iv_pernr AND del_flag <> 'X' AND zyear = @lv_year ORDER BY reqno.
      IF lv_admin = abap_false AND is_editor( lv_user ) = abap_false.
        DELETE et_emp WHERE created_by <> lv_user.
      ENDIF.
    ELSE.
      SELECT * FROM zlife_emp INTO TABLE @et_emp WHERE created_by = @lv_user AND del_flag <> 'X' AND zyear = @lv_year ORDER BY reqno.
    ENDIF.
    IF et_emp IS NOT INITIAL.
      SELECT * FROM zlife_family INTO TABLE @et_family FOR ALL ENTRIES IN @et_emp WHERE reqno = @et_emp-reqno.
      SORT et_family BY reqno sl_no.
    ELSEIF iv_pernr IS NOT INITIAL.
      ev_error = 'No policy available or the policy for this employee was not created by you.'.
    ENDIF.
  ENDMETHOD.

  METHOD save_limits.
    CLEAR: ev_count, ev_error.
    IF is_admin( iv_user ) = abap_false.
      ev_error = 'Not Authorised'.
      RETURN.
    ENDIF.
    DATA(lt_lim) = it_limit.
    DATA(lv_year) = active_year( ).
    LOOP AT lt_lim ASSIGNING FIELD-SYMBOL(<l>).
      IF <l>-zyear IS INITIAL.
        <l>-zyear = lv_year.
      ENDIF.
      SPLIT <l>-limit AT space INTO DATA(lv_n) DATA(lv_u).
      IF <l>-emp_id IS INITIAL OR lv_n IS INITIAL OR lv_n CN '0123456789'.
        ev_error = |Invalid limit row for employee { <l>-emp_id ALPHA = OUT }: "{ <l>-limit }" (expected e.g. 50 LAKHS).|.
        RETURN.
      ENDIF.
      <l>-mandt = sy-mandt.
    ENDLOOP.
    MODIFY zlife_ins_limit FROM TABLE lt_lim.
    ev_count = lines( lt_lim ).
  ENDMETHOD.

  METHOD send_summary.
    " Mail the selected requests to the HR mailbox kept in ZMEDI_DATE slno 2 (same target as the WD).
    DATA: lt_body TYPE bcsy_text.
    CLEAR ev_error.
    IF is_admin( iv_user ) = abap_false.
      ev_error = 'Not Authorised'.
      RETURN.
    ENDIF.
    SELECT SINGLE email_id FROM zmedi_date INTO @DATA(lv_to) WHERE slno = '2'.
    IF sy-subrc <> 0 OR lv_to IS INITIAL.
      ev_error = 'HR mail address is not maintained (ZMEDI_DATE).'.
      RETURN.
    ENDIF.
    IF it_reqno IS INITIAL.
      ev_error = 'No requests selected.'.
      RETURN.
    ENDIF.
    SELECT * FROM zlife_emp INTO TABLE @DATA(lt_emp) FOR ALL ENTRIES IN @it_reqno WHERE reqno = @it_reqno-table_line.
    SELECT * FROM zlife_family INTO TABLE @DATA(lt_fam) FOR ALL ENTRIES IN @it_reqno WHERE reqno = @it_reqno-table_line.
    APPEND '<html><body><h3>Term Life policy requests</h3><table border="1" cellpadding="4"><tr><th>Request</th><th>Employee</th><th>Sum assured</th><th>Premium</th><th>GST</th><th>Total</th><th>Nominees</th></tr>' TO lt_body.
    LOOP AT lt_emp INTO DATA(ls_e).
      DATA(lv_nom) = ||.
      LOOP AT lt_fam INTO DATA(ls_f) WHERE reqno = ls_e-reqno.
        lv_nom = |{ lv_nom }{ ls_f-name } ({ ls_f-per_share }%) |.
      ENDLOOP.
      APPEND |<tr><td>{ ls_e-reqno }</td><td>{ ls_e-emp_id ALPHA = OUT } { ls_e-fname } { ls_e-lname }</td><td>{ ls_e-sum_base }</td>| &&
             |<td>{ ls_e-pre_base ALPHA = OUT }</td><td>{ ls_e-gst ALPHA = OUT }</td><td>{ ls_e-total_pre ALPHA = OUT }</td><td>{ lv_nom }</td></tr>| TO lt_body.
    ENDLOOP.
    APPEND '</table></body></html>' TO lt_body.
    TRY.
        DATA(lo_req) = cl_bcs=>create_persistent( ).
        DATA(lo_doc) = cl_document_bcs=>create_document( i_type = 'HTM' i_subject = 'Term Life policy requests' i_text = lt_body ).
        lo_req->set_document( lo_doc ).
        lo_req->add_recipient( cl_cam_address_bcs=>create_internet_address( CONV #( lv_to ) ) ).
        lo_req->set_send_immediately( abap_true ).
        lo_req->send( ).
      CATCH cx_bcs INTO DATA(lx).
        ev_error = lx->get_text( ).
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
