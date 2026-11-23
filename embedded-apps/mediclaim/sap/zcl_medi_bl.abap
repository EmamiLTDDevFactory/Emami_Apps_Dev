"! Mediclaim business logic behind the OData service ZMEDICLAIM_SRV (port of Web Dynpro component ZWD_MEDICAIM).
"! Every WRITE method has IV_SIMULATE: everything is executed, then ROLLBACK WORK; no commit, no mail.
CLASS zcl_medi_bl DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ts_context,
             email            TYPE c LENGTH 241,
             userid           TYPE c LENGTH 30,
             empid            TYPE c LENGTH 8,
             fullname         TYPE c LENGTH 80,
             year             TYPE c LENGTH 4,
             yeartext         TYPE c LENGTH 9,
             cutoffdate       TYPE d,
             insurermail      TYPE c LENGTH 241,
             agecalcdate      TYPE d,
             isauthuser       TYPE c LENGTH 1,
             ishradmin        TYPE c LENGTH 1,
             windowopen       TYPE c LENGTH 1,
             myreqno          TYPE c LENGTH 10,
             mycanchange      TYPE c LENGTH 1,
           END OF ts_context,
           tt_context TYPE STANDARD TABLE OF ts_context WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_suminsured,
             year             TYPE c LENGTH 4,
             suminsured       TYPE zamt,
             email            TYPE c LENGTH 241,
             topupallowed     TYPE c LENGTH 1,
           END OF ts_suminsured,
           tt_suminsured TYPE STANDARD TABLE OF ts_suminsured WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_topup,
             year             TYPE c LENGTH 4,
             topupamount      TYPE zamt,
             email            TYPE c LENGTH 241,
             premium          TYPE zamt,
           END OF ts_topup,
           tt_topup TYPE STANDARD TABLE OF ts_topup WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_employee,
             empid            TYPE c LENGTH 8,
             email            TYPE c LENGTH 241,
             issapemployee    TYPE c LENGTH 1,
             eligible         TYPE c LENGTH 1,
             reason           TYPE string,
             compcode         TYPE c LENGTH 4,
             comptext         TYPE c LENGTH 25,
             dept             TYPE c LENGTH 8,
             outext           TYPE c LENGTH 25,
             design           TYPE c LENGTH 8,
             designtext       TYPE c LENGTH 25,
             location         TYPE c LENGTH 4,
             loctext          TYPE c LENGTH 15,
             firstname        TYPE c LENGTH 25,
             lastname         TYPE c LENGTH 25,
             dob              TYPE d,
             ageinyears       TYPE i,
             gendertext       TYPE c LENGTH 20,
             gender           TYPE c LENGTH 1,
             corpemail        TYPE c LENGTH 241,
             personalemail    TYPE c LENGTH 60,
             contact          TYPE c LENGTH 30,
             ctcabove5l       TYPE c LENGTH 1,
             ctccode          TYPE c LENGTH 2,
             existingreqno    TYPE c LENGTH 10,
             prevyearreqno    TYPE c LENGTH 10,
           END OF ts_employee,
           tt_employee TYPE STANDARD TABLE OF ts_employee WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_policy,
             reqno            TYPE c LENGTH 10,
             email            TYPE c LENGTH 241,
             reqdate          TYPE d,
             createdby        TYPE c LENGTH 30,
             year             TYPE c LENGTH 4,
             empid            TYPE c LENGTH 8,
             compcode         TYPE c LENGTH 4,
             codetxt          TYPE c LENGTH 25,
             dept             TYPE c LENGTH 8,
             outext           TYPE c LENGTH 25,
             design           TYPE c LENGTH 8,
             designtxt        TYPE c LENGTH 25,
             firstname        TYPE c LENGTH 25,
             lastname         TYPE c LENGTH 25,
             fullname         TYPE c LENGTH 60,
             dob              TYPE d,
             ageinyrs         TYPE i,
             gentext          TYPE c LENGTH 20,
             gender           TYPE c LENGTH 1,
             location         TYPE c LENGTH 4,
             loctxt           TYPE c LENGTH 15,
             corpemail        TYPE c LENGTH 241,
             personalemail    TYPE c LENGTH 60,
             contact          TYPE c LENGTH 30,
             sumbase          TYPE zamt,
             prebase          TYPE zamt,
             topupyes         TYPE c LENGTH 1,
             topuppolicy      TYPE zamt,
             topuppre         TYPE zamt,
             totalpre         TYPE zamt,
             empshare         TYPE zamt,
             married          TYPE c LENGTH 1,
             noempidsap       TYPE c LENGTH 1,
             noempidctc       TYPE c LENGTH 2,
             delflag          TYPE c LENGTH 1,
             employershare    TYPE zamt,
             canchange        TYPE c LENGTH 1,
           END OF ts_policy,
           tt_policy TYPE STANDARD TABLE OF ts_policy WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_member,
             reqno            TYPE c LENGTH 10,
             slno             TYPE c LENGTH 2,
             email            TYPE c LENGTH 241,
             name             TYPE c LENGTH 80,
             dob              TYPE d,
             gender           TYPE c LENGTH 1,
             relation         TYPE c LENGTH 2,
             relationtext     TYPE c LENGTH 20,
             ageinyrs         TYPE i,
             preamt           TYPE zamt,
             actpre           TYPE zamt,
             sumbase          TYPE zamt,
             crtdate          TYPE d,
             isnew            TYPE c LENGTH 1,
           END OF ts_member,
           tt_member TYPE STANDARD TABLE OF ts_member WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_quote,
             quoteid          TYPE c LENGTH 32,
             email            TYPE c LENGTH 241,
             empid            TYPE c LENGTH 8,
             suminsured       TYPE zamt,
             topupamount      TYPE zamt,
             ctccode          TYPE c LENGTH 2,
             prebase          TYPE zamt,
             topuppre         TYPE zamt,
             totalpre         TYPE zamt,
             empshare         TYPE zamt,
             employershare    TYPE zamt,
             messages         TYPE string,
             compcode         TYPE c LENGTH 4,
             outext           TYPE c LENGTH 25,
             designtxt        TYPE c LENGTH 25,
             loctxt           TYPE c LENGTH 15,
             gender           TYPE c LENGTH 1,
             ageinyrs         TYPE i,
             noempidsap       TYPE c LENGTH 1,
             noempidctc       TYPE c LENGTH 2,
             firstname        TYPE c LENGTH 25,
             lastname         TYPE c LENGTH 25,
           END OF ts_quote,
           tt_quote TYPE STANDARD TABLE OF ts_quote WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_blockedemployee,
             empid            TYPE c LENGTH 8,
             email            TYPE c LENGTH 241,
             name             TYPE c LENGTH 80,
           END OF ts_blockedemployee,
           tt_blockedemployee TYPE STANDARD TABLE OF ts_blockedemployee WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_policyreport,
             reqno            TYPE c LENGTH 10,
             slno             TYPE c LENGTH 2,
             email            TYPE c LENGTH 241,
             year             TYPE c LENGTH 4,
             comptext         TYPE c LENGTH 25,
             loctext          TYPE c LENGTH 15,
             outext           TYPE c LENGTH 25,
             empid            TYPE c LENGTH 8,
             designtext       TYPE c LENGTH 25,
             ctcabove5l       TYPE c LENGTH 3,
             corpemail        TYPE c LENGTH 241,
             personalemail    TYPE c LENGTH 60,
             contact          TYPE c LENGTH 30,
             familyno         TYPE c LENGTH 2,
             name             TYPE c LENGTH 80,
             dob              TYPE d,
             ageinyrs         TYPE i,
             gender           TYPE c LENGTH 1,
             relation         TYPE c LENGTH 2,
             sumbase          TYPE zamt,
             prebase          TYPE zamt,
             topupyesno       TYPE c LENGTH 3,
             topuppolicy      TYPE zamt,
             topuppre         TYPE zamt,
             totalpre         TYPE zamt,
             preamt           TYPE zamt,
             empshare         TYPE zamt,
             employershare    TYPE zamt,
             crtdate          TYPE d,
             newind           TYPE c LENGTH 3,
           END OF ts_policyreport,
           tt_policyreport TYPE STANDARD TABLE OF ts_policyreport WITH DEFAULT KEY.
    TYPES: BEGIN OF ts_policy_deep.
        INCLUDE TYPE ts_policy.
    TYPES: members TYPE tt_member,
           END OF ts_policy_deep,
           BEGIN OF ts_quote_deep.
        INCLUDE TYPE ts_quote.
    TYPES: members TYPE tt_member,
           END OF ts_quote_deep,
           BEGIN OF ts_employee_deep.
        INCLUDE TYPE ts_employee.
    TYPES: prevmembers TYPE tt_member,
           END OF ts_employee_deep.
    TYPES ty_fam_tab TYPE STANDARD TABLE OF zmedi_family WITH DEFAULT KEY.
    TYPES ty_bp_tab TYPE STANDARD TABLE OF zbase_premium WITH DEFAULT KEY.
    TYPES:
      BEGIN OF ty_caller,
        email   TYPE string,
        pernr   TYPE persno,
        userid  TYPE zuname,
        ids     TYPE string_table,
        is_auth TYPE abap_bool,
        is_hr   TYPE abap_bool,
      END OF ty_caller.

    CONSTANTS:
      c_bukrs     TYPE bukrs VALUE '1000',
      c_butxt     TYPE butxt VALUE 'Emami Limited',
      c_ctc_limit TYPE p LENGTH 8 DECIMALS 2 VALUE '500000',
      c_base_si   TYPE zamt VALUE '200000',
      c_topup_si  TYPE zamt VALUE '500000'.

    "! Email -> PERNR, USERID, role flags (see CONTRACT.md "Roles")
    METHODS resolve_caller
      IMPORTING iv_email         TYPE csequence
      RETURNING VALUE(rs_caller) TYPE ty_caller.
    METHODS get_context
      IMPORTING iv_email          TYPE csequence
      RETURNING VALUE(rs_context) TYPE ts_context.
    METHODS get_sum_insured_options
      IMPORTING iv_email        TYPE csequence
                iv_year         TYPE gjahr OPTIONAL
      RETURNING VALUE(rt_items) TYPE tt_suminsured.
    METHODS get_topup_options
      IMPORTING iv_email        TYPE csequence
                iv_year         TYPE gjahr OPTIONAL
      RETURNING VALUE(rt_items) TYPE tt_topup.
    "! Eligibility fetch (SPEC 2.2). Never raises: a refusal is Eligible = '' and Reason = verbatim legacy text.
    METHODS get_employee
      IMPORTING iv_email        TYPE csequence
                iv_empid        TYPE csequence
                iv_year         TYPE gjahr OPTIONAL
      EXPORTING es_employee     TYPE ts_employee
                et_prev_members TYPE tt_member.
    "! Premium calculation without persistence (SPEC 2.5). Errors go to CS_QUOTE-MESSAGES.
    METHODS calc_quote
      IMPORTING iv_email   TYPE csequence
      CHANGING  cs_quote   TYPE ts_quote
                ct_members TYPE tt_member.
    METHODS list_policies
      IMPORTING iv_email           TYPE csequence
                iv_empid           TYPE csequence OPTIONAL
                iv_year            TYPE csequence OPTIONAL
                iv_reqno           TYPE csequence OPTIONAL
      RETURNING VALUE(rt_policies) TYPE tt_policy.
    METHODS get_policy
      IMPORTING iv_email         TYPE csequence
                iv_reqno         TYPE csequence
      RETURNING VALUE(rs_policy) TYPE ts_policy
      RAISING   zcx_medi_error.
    METHODS get_members
      IMPORTING iv_email          TYPE csequence
                iv_reqno          TYPE csequence
      RETURNING VALUE(rt_members) TYPE tt_member
      RAISING   zcx_medi_error.
    "! New policy (SPEC 2.8)
    METHODS submit
      IMPORTING iv_email    TYPE csequence
                is_policy   TYPE ts_policy
                it_members  TYPE tt_member
                iv_simulate TYPE abap_bool DEFAULT abap_false
      EXPORTING es_policy   TYPE ts_policy
                et_members  TYPE tt_member
      RAISING   zcx_medi_error.
    "! Add nominees: only new members are appended, SI / top up / contact stay as submitted
    METHODS change
      IMPORTING iv_email    TYPE csequence
                is_policy   TYPE ts_policy
                it_members  TYPE tt_member
                iv_simulate TYPE abap_bool DEFAULT abap_false
      EXPORTING es_policy   TYPE ts_policy
                et_members  TYPE tt_member
      RAISING   zcx_medi_error.
    METHODS delete_policy
      IMPORTING iv_email         TYPE csequence
                iv_reqno         TYPE csequence
                iv_simulate      TYPE abap_bool DEFAULT abap_false
                iv_hub_admin     TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rs_policy) TYPE ts_policy
      RAISING   zcx_medi_error.
    METHODS set_cutoff
      IMPORTING iv_email          TYPE csequence
                iv_cutoff         TYPE d OPTIONAL
                iv_insurer_mail   TYPE csequence OPTIONAL
                iv_simulate       TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rs_context) TYPE ts_context
      RAISING   zcx_medi_error.
    METHODS list_blocked
      IMPORTING iv_email          TYPE csequence
      RETURNING VALUE(rt_blocked) TYPE tt_blockedemployee
      RAISING   zcx_medi_error.
    METHODS add_blocked
      IMPORTING iv_email          TYPE csequence
                iv_empid          TYPE csequence
                iv_name           TYPE csequence OPTIONAL
                iv_simulate       TYPE abap_bool DEFAULT abap_false
      RETURNING VALUE(rs_blocked) TYPE ts_blockedemployee
      RAISING   zcx_medi_error.
    METHODS delete_blocked
      IMPORTING iv_email    TYPE csequence
                iv_empid    TYPE csequence
                iv_simulate TYPE abap_bool DEFAULT abap_false
      RAISING   zcx_medi_error.
    "! HR download rows (SPEC 5.4 B)
    METHODS list_report
      IMPORTING iv_email         TYPE csequence
                iv_year          TYPE csequence OPTIONAL
                iv_location      TYPE csequence OPTIONAL
      RETURNING VALUE(rt_report) TYPE tt_policyreport
      RAISING   zcx_medi_error.
    "! HTML mail body (SPEC 4) - separate so it can be tested without sending
    METHODS build_mail_html
      IMPORTING is_emp         TYPE zmedi_emp
                it_members     TYPE tt_member
      RETURNING VALUE(rv_html) TYPE string.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_extra,
        abkrs TYPE abkrs,
        gesch TYPE gesch,
      END OF ty_extra.

    CONSTANTS c_mail_regex TYPE string VALUE '\w+(\.\w+)*@(\w+\.)+(\w{2,4})'.

    METHODS get_period
      RETURNING VALUE(rs_period) TYPE zmedi_period.
    METHODS get_date_row
      RETURNING VALUE(rs_date) TYPE zmedi_date.
    METHODS alpha_empid
      IMPORTING iv_in         TYPE csequence
      RETURNING VALUE(rv_out) TYPE persno.
    METHODS age_date
      IMPORTING iv_year        TYPE gjahr
      RETURNING VALUE(rv_date) TYPE d.
    "! age rule of the legacy: years/months/days to AgeCalcDate, rounding rules per mode ('S' = self SAP, 'F' = family)
    METHODS age_at
      IMPORTING iv_dob        TYPE d
                iv_ref        TYPE d
                iv_mode       TYPE c
      RETURNING VALUE(rv_age) TYPE i.
    METHODS is_valid_relation
      IMPORTING iv_relation     TYPE zrel
      RETURNING VALUE(rv_valid) TYPE abap_bool.
    METHODS rate
      IMPORTING it_amt       TYPE ty_bp_tab
                iv_age       TYPE i
                iv_si        TYPE zamt
      RETURNING VALUE(rv_pre) TYPE zamt.
    METHODS get_ctc
      IMPORTING iv_pernr      TYPE persno
      RETURNING VALUE(rv_ctc) TYPE ansal_15.
    METHODS is_valid_mail
      IMPORTING iv_mail         TYPE csequence
      RETURNING VALUE(rv_valid) TYPE abap_bool.
    METHODS relation_text
      IMPORTING iv_relation    TYPE zrel
      RETURNING VALUE(rv_text) TYPE string.
    METHODS read_employee
      IMPORTING is_caller      TYPE ty_caller
                iv_empid       TYPE csequence
                iv_skip_checks TYPE abap_bool DEFAULT abap_false
                iv_year        TYPE gjahr OPTIONAL
      EXPORTING es_employee    TYPE ts_employee
                et_prev        TYPE tt_member
                es_extra       TYPE ty_extra.
    "! core of calc_policy: members get age, gender, ActPre, PreAmt; totals returned
    METHODS calc_core
      IMPORTING iv_year        TYPE gjahr
                iv_ctc         TYPE ansal_15
                iv_si          TYPE zamt
                iv_topup       TYPE zamt
                iv_self_age    TYPE i
                iv_self_gender TYPE gesch
      EXPORTING ev_self_act    TYPE zamt
                ev_self_pre    TYPE zamt
                ev_pre_base    TYPE zamt
                ev_topup_pre   TYPE zamt
                ev_total_pre   TYPE zamt
                ev_emp_share   TYPE zamt
      CHANGING  ct_members     TYPE tt_member
      RAISING   zcx_medi_error.
    METHODS check_mobile
      IMPORTING iv_contact TYPE csequence
      RAISING   zcx_medi_error.
    METHODS save_policy
      IMPORTING iv_mode     TYPE c
                iv_email    TYPE csequence
                is_policy   TYPE ts_policy
                it_members  TYPE tt_member
                iv_simulate TYPE abap_bool
      EXPORTING es_policy   TYPE ts_policy
                et_members  TYPE tt_member
      RAISING   zcx_medi_error.
    METHODS policy_from_db
      IMPORTING is_emp           TYPE zmedi_emp
                is_caller        TYPE ty_caller
                iv_email         TYPE csequence
      RETURNING VALUE(rs_policy) TYPE ts_policy.
    METHODS members_from_db
      IMPORTING it_fam            TYPE ty_fam_tab
                is_emp            TYPE zmedi_emp
                iv_email          TYPE csequence
      RETURNING VALUE(rt_members) TYPE tt_member.
    METHODS can_access
      IMPORTING is_caller        TYPE ty_caller
                is_emp           TYPE zmedi_emp
      RETURNING VALUE(rv_access) TYPE abap_bool.
    METHODS send_mail
      IMPORTING iv_reqno  TYPE zreqno
                iv_caller TYPE csequence.
ENDCLASS.



CLASS zcl_medi_bl IMPLEMENTATION.

  METHOD get_period.
    SELECT SINGLE * FROM zmedi_period INTO @rs_period WHERE status = 'X'.
  ENDMETHOD.

  METHOD get_date_row.
    SELECT SINGLE * FROM zmedi_date INTO @rs_date WHERE slno = '1'.
  ENDMETHOD.

  METHOD alpha_empid.
    DATA lv_in TYPE string.
    lv_in = condense( iv_in ).
    IF lv_in IS INITIAL OR strlen( lv_in ) > 8 OR lv_in CN '0123456789'.
      RETURN.
    ENDIF.
    rv_out = lv_in.
  ENDMETHOD.

  METHOD age_date.
    rv_date = |{ iv_year }0131|.
  ENDMETHOD.

  METHOD age_at.
    DATA: lv_years  TYPE num2,
          lv_months TYPE num2,
          lv_days   TYPE num2.
    IF iv_dob IS INITIAL.
      RETURN.
    ENDIF.
    CALL FUNCTION 'HRCM_TIME_PERIOD_CALCULATE'
      EXPORTING
        begda         = iv_dob
        endda         = iv_ref
      IMPORTING
        noyrs         = lv_years
        nomns         = lv_months
        nodys         = lv_days
      EXCEPTIONS
        invalid_dates = 1
        overflow      = 2
        OTHERS        = 3.
    IF sy-subrc <> 0.
      CLEAR: lv_years, lv_months, lv_days.
    ENDIF.
    IF iv_mode = 'S'.
      IF lv_months >= 6.
        lv_years = lv_years + 1.
      ENDIF.
    ELSE.
      IF lv_years <> 0 AND lv_months >= 6.
        lv_years = lv_years + 1.
      ENDIF.
      IF lv_years = 0.
        IF lv_months = 0 AND lv_days <> 0.
          lv_years = lv_years + 1.
        ENDIF.
        IF lv_months <> 0.
          lv_years = lv_years + 1.
        ENDIF.
      ENDIF.
    ENDIF.
    rv_age = lv_years.
  ENDMETHOD.

  METHOD get_ctc.
    DATA lv_abkrs TYPE abkrs.
    SELECT SINGLE abkrs FROM pa0001 INTO @lv_abkrs
      WHERE pernr = @iv_pernr AND begda <= @sy-datum AND endda >= @sy-datum.
    CALL FUNCTION 'ZHR_CTC_CALC'
      EXPORTING
        p_pernr = iv_pernr
        p_abkrs = lv_abkrs
        p_date  = sy-datum
      IMPORTING
        r_ctc   = rv_ctc
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      CLEAR rv_ctc.
    ENDIF.
  ENDMETHOD.

  METHOD is_valid_mail.
    DATA lv_mail TYPE string.
    lv_mail = condense( iv_mail ).
    rv_valid = xsdbool( matches( val = lv_mail regex = c_mail_regex case = abap_false ) ).
  ENDMETHOD.

  METHOD is_valid_relation.
    rv_valid = xsdbool( iv_relation = '' OR iv_relation = '3' OR iv_relation = '4' OR iv_relation = '5'
                        OR iv_relation = '6' OR iv_relation = '7' ).
  ENDMETHOD.

  METHOD relation_text.
    CASE iv_relation.
      WHEN '1'. rv_text = 'Self'.
      WHEN ''.  rv_text = 'Father'.
      WHEN '3'. rv_text = 'Mother'.
      WHEN '4'. rv_text = 'Spouse'.
      WHEN '5'. rv_text = 'Son'.
      WHEN '6'. rv_text = 'Daughter'.
      WHEN '7'. rv_text = 'Child 3'.
    ENDCASE.
  ENDMETHOD.

  METHOD resolve_caller.
    DATA: lv_lower TYPE comm_id_long,
          lv_upper TYPE comm_id_long,
          lv_local TYPE string,
          lv_id    TYPE string.
    DATA lt_pernr TYPE STANDARD TABLE OF persno WITH DEFAULT KEY.

    rs_caller-email = to_lower( condense( CONV string( iv_email ) ) ).
    IF rs_caller-email IS INITIAL.
      RETURN.
    ENDIF.
    lv_lower = rs_caller-email.
    lv_upper = to_upper( rs_caller-email ).

    SELECT pernr FROM pa0105 INTO TABLE @lt_pernr
      WHERE subty = '0010' AND begda <= @sy-datum AND endda >= @sy-datum
        AND ( usrid_long = @lv_upper OR usrid_long = @lv_lower ).
    SORT lt_pernr.
    DELETE ADJACENT DUPLICATES FROM lt_pernr.
    LOOP AT lt_pernr INTO DATA(lv_p).
      DATA lv_stat TYPE pa0000-stat2.
      CLEAR lv_stat.
      SELECT SINGLE stat2 FROM pa0000 INTO @lv_stat
        WHERE pernr = @lv_p AND begda <= @sy-datum AND endda >= @sy-datum.
      IF lv_stat = '3' OR rs_caller-pernr IS INITIAL.
        rs_caller-pernr = lv_p.
      ENDIF.
      IF lv_stat = '3'.
        EXIT.
      ENDIF.
    ENDLOOP.

    IF rs_caller-pernr IS NOT INITIAL.
      DATA lv_usrid TYPE pa0105-usrid.
      SELECT SINGLE usrid FROM pa0105 INTO @lv_usrid
        WHERE pernr = @rs_caller-pernr AND subty = '0001' AND begda <= @sy-datum AND endda >= @sy-datum.
      IF sy-subrc = 0 AND lv_usrid IS NOT INITIAL.
        rs_caller-userid = to_lower( CONV string( lv_usrid ) ).
      ENDIF.
    ENDIF.
    IF rs_caller-userid IS INITIAL.
      DATA lv_bname TYPE usr21-bname.
      SELECT SINGLE a~bname FROM usr21 AS a INNER JOIN adr6 AS b
        ON a~persnumber = b~persnumber AND a~addrnumber = b~addrnumber
        INTO @lv_bname
        WHERE b~smtp_addr = @lv_upper OR b~smtp_addr = @lv_lower.
      IF sy-subrc = 0.
        rs_caller-userid = to_lower( CONV string( lv_bname ) ).
      ENDIF.
    ENDIF.

    " candidate ids matched against ZMEDI_AUTH_USERS-USERID (stored lower case; the legacy ids look like the mail prefix)
    SPLIT rs_caller-email AT '@' INTO lv_local DATA(lv_rest).
    IF rs_caller-userid IS NOT INITIAL.
      APPEND CONV string( rs_caller-userid ) TO rs_caller-ids.
    ENDIF.
    IF lv_local IS NOT INITIAL.
      APPEND lv_local TO rs_caller-ids.
    ENDIF.
    APPEND rs_caller-email TO rs_caller-ids.
    SORT rs_caller-ids.
    DELETE ADJACENT DUPLICATES FROM rs_caller-ids.
    IF rs_caller-userid IS INITIAL.
      rs_caller-userid = lv_local.      " what CREATED_BY will hold for callers without an SAP user
    ENDIF.

    SELECT * FROM zmedi_auth_users INTO TABLE @DATA(lt_auth).
    LOOP AT lt_auth INTO DATA(ls_auth).
      lv_id = to_lower( condense( CONV string( ls_auth-userid ) ) ).
      IF line_exists( rs_caller-ids[ table_line = lv_id ] ).
        rs_caller-is_auth = abap_true.
        IF ls_auth-flag = 'R'.
          rs_caller-is_hr = abap_true.
        ENDIF.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_context.
    DATA(ls_c) = resolve_caller( iv_email ).
    DATA(ls_per) = get_period( ).
    DATA(ls_dat) = get_date_row( ).
    rs_context-email = iv_email.
    rs_context-userid = ls_c-userid.
    IF ls_c-pernr IS NOT INITIAL.
      rs_context-empid = ls_c-pernr.
    ENDIF.
    IF ls_c-pernr IS NOT INITIAL.
      SELECT SINGLE vorna, nachn FROM pa0002 INTO @DATA(ls_name)
        WHERE pernr = @ls_c-pernr AND begda <= @sy-datum AND endda >= @sy-datum.
      IF sy-subrc = 0.
        rs_context-fullname = |{ ls_name-vorna } { ls_name-nachn }|.
      ENDIF.
    ENDIF.
    rs_context-year = ls_per-zyear.
    IF ls_per-zyear IS NOT INITIAL.
      rs_context-yeartext = |{ ls_per-zyear }-{ CONV i( ls_per-zyear ) + 1 }|.
      rs_context-agecalcdate = age_date( ls_per-zyear ).
    ENDIF.
    rs_context-cutoffdate = ls_dat-co_date.
    rs_context-insurermail = ls_dat-email_id.
    rs_context-isauthuser = COND #( WHEN ls_c-is_auth = abap_true THEN 'X' ELSE '' ).
    rs_context-ishradmin = COND #( WHEN ls_c-is_hr = abap_true THEN 'X' ELSE '' ).
    rs_context-windowopen = COND #( WHEN ls_dat-co_date IS NOT INITIAL AND sy-datum <= ls_dat-co_date THEN 'X' ELSE '' ).
    IF ls_c-pernr IS NOT INITIAL AND ls_per-zyear IS NOT INITIAL.
      SELECT SINGLE reqno FROM zmedi_emp INTO @DATA(lv_req)
        WHERE emp_id = @ls_c-pernr AND del_flag <> 'X' AND zyear = @ls_per-zyear.
      IF sy-subrc = 0.
        rs_context-myreqno = lv_req.
        rs_context-mycanchange = 'X'.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD get_sum_insured_options.
    DATA lv_year TYPE gjahr.
    lv_year = COND #( WHEN iv_year IS NOT INITIAL THEN iv_year ELSE get_period( )-zyear ).
    SELECT DISTINCT premium_amt FROM zbase_premium INTO TABLE @DATA(lt_amt) WHERE zyear = @lv_year.
    SORT lt_amt BY premium_amt.
    LOOP AT lt_amt INTO DATA(ls_amt).
      APPEND VALUE #( year = lv_year suminsured = ls_amt-premium_amt email = iv_email
                      topupallowed = COND #( WHEN ls_amt-premium_amt = c_topup_si THEN 'X' ELSE '' ) ) TO rt_items.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_topup_options.
    DATA lv_year TYPE gjahr.
    lv_year = COND #( WHEN iv_year IS NOT INITIAL THEN iv_year ELSE get_period( )-zyear ).
    SELECT top_up_amt, rt_family FROM ztop_premium INTO TABLE @DATA(lt_top) WHERE zyear = @lv_year.
    SORT lt_top BY top_up_amt.
    LOOP AT lt_top INTO DATA(ls_top).
      APPEND VALUE #( year = lv_year topupamount = ls_top-top_up_amt email = iv_email premium = ls_top-rt_family ) TO rt_items.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_employee.
    DATA(ls_c) = resolve_caller( iv_email ).
    read_employee( EXPORTING is_caller = ls_c iv_empid = iv_empid iv_year = iv_year
                   IMPORTING es_employee = es_employee et_prev = et_prev_members ).
    es_employee-email = iv_email.
    LOOP AT et_prev_members ASSIGNING FIELD-SYMBOL(<m>).
      <m>-email = iv_email.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_employee.
    " SPEC 2.2 (MAIN:2245-2663). Fills ES_EMPLOYEE; Eligible = 'X' only when every check passed.
    DATA: lv_emp   TYPE persno,
          lv_exist TYPE persno,
          ls_001   TYPE pa0001,
          ls_002   TYPE pa0002,
          lv_year  TYPE gjahr,
          lv_msg   TYPE string.
    CLEAR: es_employee, et_prev, es_extra.

    DATA(ls_per) = get_period( ).
    lv_year = COND #( WHEN iv_year IS NOT INITIAL THEN iv_year ELSE ls_per-zyear ).
    es_employee-empid = condense( CONV string( iv_empid ) ).
    lv_emp = alpha_empid( iv_empid ).
    IF lv_emp IS INITIAL.
      es_employee-reason = 'Enter Employee ID and hit enter.'.
      RETURN.
    ENDIF.
    es_employee-empid = lv_emp.
    es_employee-compcode = c_bukrs.

    SELECT SINGLE pernr FROM pa0001 INTO @lv_exist WHERE pernr = @lv_emp.
    DATA(lv_is_sap) = xsdbool( sy-subrc = 0 ).

    " who may look at this id (CONTRACT: own PERNR, auth user, or - for non-SAP callers - an id that does not exist in SAP)
    IF lv_emp <> is_caller-pernr AND is_caller-is_auth = abap_false.
      IF is_caller-pernr IS NOT INITIAL OR lv_is_sap = abap_true.
        es_employee-reason = 'You are not authorized for this employee id.'.
        RETURN.
      ENDIF.
    ENDIF.

    IF iv_skip_checks = abap_false.
      SELECT SINGLE reqno FROM zmedi_emp INTO @DATA(lv_dup)
        WHERE emp_id = @lv_emp AND del_flag <> 'X' AND zyear = @lv_year.
      IF sy-subrc = 0.
        es_employee-existingreqno = lv_dup.
        es_employee-reason = |Policy for the employee id { lv_emp } already exists|.
        RETURN.
      ENDIF.
      SELECT SINGLE emp_id FROM zmedi_excl_emp INTO @DATA(lv_blk) WHERE emp_id = @lv_emp.
      IF sy-subrc = 0.
        es_employee-reason = 'Employee Id blocked for application. '.
        RETURN.
      ENDIF.
    ENDIF.

    IF lv_is_sap = abap_false.
      " non-SAP employee: manual entry flow (SPEC 2.2 step 4)
      es_employee-issapemployee = ''.
      es_employee-compcode = c_bukrs.
      es_employee-comptext = c_butxt.
      es_employee-eligible = 'X'.
      RETURN.
    ENDIF.

    es_employee-issapemployee = 'X'.

    " separation check (the legacy one was dead code because of the INTO order; this is its intent)
    SELECT SINGLE endda FROM pa0000 INTO @DATA(lv_sep_end)
      WHERE pernr = @lv_emp AND massn = 'EM' AND endda = '99991231'.
    IF sy-subrc = 0.
      es_employee-reason = 'You cannot apply.The employee has either resigned or separated.'.
      RETURN.
    ENDIF.

    " cut-off / new joiner rule (2.2 step 5b)
    DATA(ls_dat) = get_date_row( ).
    IF sy-datum > ls_dat-co_date.
      DATA lv_bdate TYPE begda.
      DATA lv_bdate10 TYPE begda.
      SELECT SINGLE begda FROM pa0000 INTO @lv_bdate
        WHERE pernr = @lv_emp AND massn IN ('EA', 'EB', 'EH', 'EI').
      lv_bdate10 = lv_bdate + 30.
      IF is_caller-is_auth = abap_false AND sy-datum > lv_bdate10.
        es_employee-reason = 'You have exceeded the permissible date limit.Please contact HR department'.
        RETURN.
      ENDIF.
    ENDIF.

    " current infotype 0001 / 0002 (first record that overlaps [today, 31.12.9999] - what HR_READ_INFOTYPE returned)
    SELECT SINGLE * FROM pa0001 INTO @ls_001 WHERE pernr = @lv_emp AND endda >= @sy-datum AND begda <= @sy-datum.
    IF sy-subrc <> 0.
      SELECT * FROM pa0001 INTO @ls_001 UP TO 1 ROWS WHERE pernr = @lv_emp AND endda >= @sy-datum ORDER BY begda.
      ENDSELECT.
    ENDIF.
    SELECT SINGLE * FROM pa0002 INTO @ls_002 WHERE pernr = @lv_emp AND endda >= @sy-datum AND begda <= @sy-datum.
    IF sy-subrc <> 0.
      SELECT * FROM pa0002 INTO @ls_002 UP TO 1 ROWS WHERE pernr = @lv_emp AND endda >= @sy-datum ORDER BY begda.
      ENDSELECT.
    ENDIF.
    IF ls_001-pernr IS INITIAL OR ls_002-pernr IS INITIAL.
      es_employee-reason = 'Employee ID does not exist.'.
      RETURN.
    ENDIF.
    IF ls_001-bukrs <> c_bukrs.
      es_employee-reason = 'You are not an employee under Emami Limited.'.
      RETURN.
    ENDIF.

    es_employee-compcode = ls_001-bukrs.
    es_employee-dept = ls_001-orgeh.
    es_employee-design = ls_001-plans.
    es_employee-location = ls_001-werks.
    SELECT SINGLE plstx FROM t528t INTO @es_employee-designtext
      WHERE plans = @ls_001-plans AND begda <= @sy-datum AND endda >= @sy-datum AND sprsl = 'E'.
    SELECT SINGLE btext FROM t001p INTO @es_employee-loctext WHERE werks = @ls_001-werks.
    es_employee-firstname = ls_002-vorna.
    es_employee-lastname = ls_002-nachn.
    es_employee-dob = ls_002-gbdat.
    es_employee-gendertext = COND #( WHEN ls_002-gesch = '1' THEN 'Male' ELSE 'Female' ).
    es_employee-gender = ls_002-gesch.
    es_employee-ageinyears = age_at( iv_dob = ls_002-gbdat iv_ref = age_date( lv_year ) iv_mode = 'S' ).
    SELECT SINGLE usrid_long FROM pa0105 INTO @es_employee-corpemail
      WHERE pernr = @lv_emp AND subty = '0010' AND begda <= @sy-datum AND endda >= @sy-datum.
    SELECT SINGLE orgtx FROM t527x INTO @es_employee-outext
      WHERE orgeh = @ls_001-orgeh AND begda <= @sy-datum AND endda >= @sy-datum AND sprsl = 'E'.
    SELECT SINGLE butxt FROM t001 INTO @es_employee-comptext WHERE bukrs = @ls_001-bukrs AND spras = 'E'.
    es_extra-abkrs = ls_001-abkrs.
    es_extra-gesch = ls_002-gesch.

    " CTC flag (re-derived at read time exactly as the legacy download did)
    DATA(lv_ctc) = get_ctc( lv_emp ).
    es_employee-ctcabove5l = COND #( WHEN lv_ctc > c_ctc_limit THEN 'X' ELSE '' ).

    " previous year carry-forward (2.2 step 5i)
    DATA(lv_prev) = CONV gjahr( lv_year - 1 ).
    SELECT SINGLE reqno, pmail, contact FROM zmedi_emp INTO @DATA(ls_prev)
      WHERE emp_id = @lv_emp AND del_flag <> 'X' AND zyear = @lv_prev.
    IF sy-subrc = 0.
      es_employee-prevyearreqno = ls_prev-reqno.
      es_employee-personalemail = ls_prev-pmail.
      es_employee-contact = ls_prev-contact.
      SELECT * FROM zmedi_family INTO TABLE @DATA(lt_fam) WHERE reqno = @ls_prev-reqno.
      DELETE lt_fam WHERE relation = '1'.
      SORT lt_fam BY sl_no.
      DATA lv_n TYPE i.
      lv_n = 0.
      LOOP AT lt_fam INTO DATA(ls_fam).
        lv_n = lv_n + 1.
        IF lv_n > 6.
          EXIT.
        ENDIF.
        APPEND VALUE #( reqno = ls_prev-reqno slno = |{ lv_n WIDTH = 2 ALIGN = RIGHT PAD = '0' }|
                        name = ls_fam-name dob = ls_fam-dob relation = ls_fam-relation
                        relationtext = relation_text( ls_fam-relation ) ) TO et_prev.
      ENDLOOP.
    ENDIF.
    es_employee-eligible = 'X'.
  ENDMETHOD.

  METHOD rate.
    LOOP AT it_amt INTO DATA(ls_a) WHERE from_age <= iv_age AND to_age >= iv_age AND premium_amt = iv_si.
      rv_pre = ls_a-pre_age.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD calc_core.
    " SPEC 2.5 / MAIN:609-1121. Members: relation/dob given; age, gender, act_pre, pre_amt computed.
    DATA: lt_amt TYPE ty_bp_tab,
          lv_f   TYPE i,
          lv_m   TYPE i,
          lv_sp  TYPE i,
          lv_ch  TYPE i,
          lv_ref TYPE d,
          lv_age TYPE i,
          lv_a   TYPE zamt,
          lv_b   TYPE zamt.
    CLEAR: ev_self_act, ev_self_pre, ev_pre_base, ev_topup_pre, ev_total_pre, ev_emp_share.

    IF iv_si = 0.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide the sum insured under base policy.'.
    ENDIF.

    LOOP AT ct_members ASSIGNING FIELD-SYMBOL(<c>) WHERE dob IS NOT INITIAL AND relation <> '1'.
      CASE <c>-relation.
        WHEN ''.         lv_f = lv_f + 1.
        WHEN '3'.        lv_m = lv_m + 1.
        WHEN '4'.        lv_sp = lv_sp + 1.
        WHEN '5' OR '6'. lv_ch = lv_ch + 1.
      ENDCASE.
    ENDLOOP.
    IF lv_f > 1 OR lv_m > 1 OR lv_sp > 1.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Relation Father/Mother/Spouse should appear exactly once.'.
    ENDIF.
    IF lv_ch > 3.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Upto 3 children can be added under the policy.'.
    ENDIF.
    IF iv_ctc = 0.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'CTC could not be determined from SAP.Please contact HR for assistance.'.
    ENDIF.

    " server-side guards the Web Dynpro got from its drop-downs
    SELECT * FROM zbase_premium INTO TABLE @lt_amt WHERE zyear = @iv_year.
    IF NOT line_exists( lt_amt[ premium_amt = iv_si ] ).
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid sum insured under base policy.'.
    ENDIF.
    IF iv_topup > 0.
      IF iv_si <> c_topup_si.
        RAISE EXCEPTION TYPE zcx_medi_error
          EXPORTING iv_text = 'Top up policy is allowed only when the base sum insured is Rs.500000.'.
      ENDIF.
      SELECT SINGLE rt_family FROM ztop_premium INTO @ev_topup_pre WHERE top_up_amt = @iv_topup AND zyear = @iv_year.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid sum insured under top up policy.'.
      ENDIF.
    ENDIF.

    lv_ref = age_date( iv_year ).
    DATA(lv_low) = xsdbool( iv_ctc <= c_ctc_limit ).
    DATA(lv_a_branch) = xsdbool( lv_low = abap_true AND iv_si <= c_base_si ).

    " employee (SELF row)
    IF iv_self_age <> 0.
      ev_self_act = rate( it_amt = lt_amt iv_age = iv_self_age iv_si = iv_si ).
      IF lv_a_branch = abap_true.
        ev_self_pre = 0.
      ELSEIF lv_low = abap_true.
        ev_self_pre = ev_self_act - rate( it_amt = lt_amt iv_age = iv_self_age iv_si = c_base_si ).
      ELSE.
        ev_self_pre = ev_self_act / 2.
      ENDIF.
    ENDIF.
    ev_pre_base = ev_self_act.
    ev_emp_share = ev_self_pre.

    " family
    LOOP AT ct_members ASSIGNING <c> WHERE dob IS NOT INITIAL AND relation <> '1'.
      CASE <c>-relation.
        WHEN ''.  <c>-gender = '1'.
        WHEN '3'. <c>-gender = '2'.
        WHEN '4'. <c>-gender = COND #( WHEN iv_self_gender = '1' THEN '2' ELSE '1' ).
        WHEN '5'. <c>-gender = '1'.
        WHEN '6'. <c>-gender = '2'.
        WHEN OTHERS.
      ENDCASE.
      lv_age = age_at( iv_dob = <c>-dob iv_ref = lv_ref iv_mode = 'F' ).
      <c>-ageinyrs = lv_age.
      <c>-actpre = rate( it_amt = lt_amt iv_age = lv_age iv_si = iv_si ).
      IF lv_a_branch = abap_true.
        <c>-preamt = 0.
      ELSEIF lv_low = abap_true.
        IF <c>-relation = '' OR <c>-relation = '3'.
          <c>-preamt = <c>-actpre / 2.                       " parents: half of the full premium, no 2 lakh deduction
        ELSE.
          lv_b = rate( it_amt = lt_amt iv_age = lv_age iv_si = c_base_si ).
          <c>-preamt = <c>-actpre - lv_b.
        ENDIF.
      ELSE.
        <c>-preamt = <c>-actpre / 2.
      ENDIF.
      <c>-sumbase = iv_si.
      ev_pre_base = ev_pre_base + <c>-actpre.
      ev_emp_share = ev_emp_share + <c>-preamt.
    ENDLOOP.

    ev_emp_share = ev_emp_share + ev_topup_pre.
    ev_total_pre = ev_pre_base + ev_topup_pre.
  ENDMETHOD.

  METHOD check_mobile.
    DATA: lv_c     TYPE string,
          lv_alpha TYPE string,
          lv_ch    TYPE c LENGTH 1.
    lv_c = iv_contact.
    IF lv_c IS INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter mobile number.'.
    ENDIF.
    DATA(lv_len) = strlen( lv_c ).
    DO lv_len TIMES.
      DATA(lv_off) = sy-index - 1.
      lv_ch = lv_c+lv_off(1).
      IF lv_ch CA 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.
        lv_alpha = lv_alpha && lv_ch.
      ENDIF.
    ENDDO.
    IF lv_alpha IS NOT INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error
        EXPORTING iv_text = |Invalid characters { lv_alpha } in mobile number { lv_c }|.
    ENDIF.
    IF lv_len <> 10.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter 10 digits for the mobile number'.
    ENDIF.
  ENDMETHOD.

  METHOD can_access.
    rv_access = abap_false.
    IF is_caller-is_auth = abap_true.
      rv_access = abap_true.
    ELSEIF is_caller-pernr IS NOT INITIAL AND is_emp-emp_id = is_caller-pernr.
      rv_access = abap_true.
    ELSEIF is_emp-created_by IS NOT INITIAL
       AND line_exists( is_caller-ids[ table_line = to_lower( condense( CONV string( is_emp-created_by ) ) ) ] ).
      rv_access = abap_true.
    ENDIF.
  ENDMETHOD.

  METHOD policy_from_db.
    DATA(ls_per) = get_period( ).
    rs_policy-reqno = is_emp-reqno.
    rs_policy-email = iv_email.
    rs_policy-reqdate = is_emp-req_dat.
    rs_policy-createdby = is_emp-created_by.
    rs_policy-year = is_emp-zyear.
    rs_policy-empid = is_emp-emp_id.
    rs_policy-compcode = is_emp-comp_code.
    rs_policy-codetxt = is_emp-code_txt.
    rs_policy-dept = is_emp-dept.
    rs_policy-outext = is_emp-ou_text.
    rs_policy-design = is_emp-design.
    rs_policy-designtxt = is_emp-design_txt.
    rs_policy-firstname = is_emp-fname.
    rs_policy-lastname = is_emp-lname.
    rs_policy-fullname = condense( |{ is_emp-fname } { is_emp-lname }| ).
    rs_policy-dob = is_emp-dob.
    rs_policy-ageinyrs = is_emp-age_in_yrs.
    rs_policy-gentext = is_emp-gen_text.
    rs_policy-gender = is_emp-gender.
    rs_policy-location = is_emp-location.
    rs_policy-loctxt = is_emp-loc_txt.
    rs_policy-corpemail = is_emp-email.
    rs_policy-personalemail = is_emp-pmail.
    rs_policy-contact = is_emp-contact.
    rs_policy-sumbase = is_emp-sum_base.
    rs_policy-prebase = is_emp-pre_base.
    rs_policy-topupyes = is_emp-top_up_yes.
    rs_policy-topuppolicy = is_emp-top_up_policy.
    rs_policy-topuppre = is_emp-top_up_pre.
    rs_policy-totalpre = is_emp-total_pre.
    rs_policy-empshare = is_emp-emp_share.
    rs_policy-married = is_emp-married.
    rs_policy-noempidsap = is_emp-no_emp_id_sap.
    rs_policy-noempidctc = is_emp-no_emp_id_ctc.
    rs_policy-delflag = is_emp-del_flag.
    rs_policy-employershare = is_emp-total_pre - is_emp-emp_share.
    IF is_emp-zyear = ls_per-zyear AND is_emp-del_flag = '' AND can_access( is_caller = is_caller is_emp = is_emp ) = abap_true.
      rs_policy-canchange = 'X'.
    ENDIF.
  ENDMETHOD.

  METHOD members_from_db.
    TYPES: BEGIN OF ty_o,
             n TYPE i,
             f TYPE zmedi_family,
           END OF ty_o.
    DATA: lt_o TYPE STANDARD TABLE OF ty_o WITH DEFAULT KEY,
          lv_i TYPE i.
    DATA(ls_dat) = get_date_row( ).
    " legacy keys are '1 ', '2 ' ... : order numerically, show as '01', '02'
    LOOP AT it_fam INTO DATA(ls_f).
      lv_i = condense( CONV string( ls_f-sl_no ) ).
      APPEND VALUE #( n = lv_i f = ls_f ) TO lt_o.
    ENDLOOP.
    SORT lt_o BY n.
    LOOP AT lt_o INTO DATA(ls_o).
      APPEND VALUE #( reqno = ls_o-f-reqno
                      slno = |{ ls_o-n WIDTH = 2 ALIGN = RIGHT PAD = '0' }|
                      email = iv_email
                      name = ls_o-f-name dob = ls_o-f-dob gender = ls_o-f-gender relation = ls_o-f-relation
                      relationtext = relation_text( ls_o-f-relation )
                      ageinyrs = ls_o-f-age_in_yrs preamt = ls_o-f-pre_amt actpre = ls_o-f-act_pre
                      sumbase = ls_o-f-sum_base crtdate = ls_o-f-crt_date
                      isnew = COND #( WHEN ( ls_dat-co_date IS NOT INITIAL AND ls_o-f-crt_date > ls_dat-co_date )
                                        OR ls_o-f-crt_date > is_emp-req_dat THEN 'X' ELSE '' ) ) TO rt_members.
    ENDLOOP.
  ENDMETHOD.

  METHOD calc_quote.
    DATA: lv_emp    TYPE persno,
          lv_ctc    TYPE ansal_15,
          lv_age    TYPE i,
          lv_gender TYPE gesch,
          lt_in     TYPE tt_member,
          lt_out    TYPE tt_member,
          ls_self   TYPE ts_member,
          lv_self_a TYPE zamt,
          lv_self_p TYPE zamt,
          lv_base   TYPE zamt,
          lv_top    TYPE zamt,
          lv_tot    TYPE zamt,
          lv_share  TYPE zamt,
          lv_n      TYPE i.
    cs_quote-email = iv_email.
    CLEAR: cs_quote-messages, cs_quote-prebase, cs_quote-topuppre, cs_quote-totalpre, cs_quote-empshare, cs_quote-employershare.
    TRY.
        DATA(ls_c) = resolve_caller( iv_email ).
        DATA(ls_per) = get_period( ).
        IF ls_per-zyear IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'No active mediclaim period is configured.'.
        ENDIF.
        lv_emp = alpha_empid( cs_quote-empid ).
        IF lv_emp IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter Employee ID and hit enter.'.
        ENDIF.
        cs_quote-empid = lv_emp.
        SELECT SINGLE pernr FROM pa0001 INTO @DATA(lv_x) WHERE pernr = @lv_emp.
        DATA(lv_is_sap) = xsdbool( sy-subrc = 0 ).
        IF lv_emp <> ls_c-pernr AND ls_c-is_auth = abap_false AND ( ls_c-pernr IS NOT INITIAL OR lv_is_sap = abap_true ).
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized for this employee id.'.
        ENDIF.

        LOOP AT ct_members INTO DATA(ls_m).
          IF ls_m-relation = '1'.
            ls_self = ls_m.
          ELSEIF ls_m-dob IS NOT INITIAL.
            IF is_valid_relation( ls_m-relation ) = abap_false.
              RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid relation.'.
            ENDIF.
            APPEND ls_m TO lt_in.
          ENDIF.
        ENDLOOP.

        IF lv_is_sap = abap_true.
          SELECT SINGLE vorna, nachn, gbdat, gesch FROM pa0002 INTO @DATA(ls_p2)
            WHERE pernr = @lv_emp AND begda <= @sy-datum AND endda >= @sy-datum.
          IF sy-subrc <> 0.
            RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Employee ID does not exist.'.
          ENDIF.
          lv_age = age_at( iv_dob = ls_p2-gbdat iv_ref = age_date( ls_per-zyear ) iv_mode = 'S' ).
          lv_gender = ls_p2-gesch.
          ls_self-name = |{ ls_p2-vorna } { ls_p2-nachn }|.
          ls_self-dob = ls_p2-gbdat.
          lv_ctc = get_ctc( lv_emp ).
        ELSE.
          lv_age = COND #( WHEN ls_self-ageinyrs <> 0 THEN ls_self-ageinyrs ELSE cs_quote-ageinyrs ).
          lv_gender = COND #( WHEN ls_self-gender IS NOT INITIAL THEN ls_self-gender ELSE cs_quote-gender ).
          IF ls_self-name IS INITIAL.
            ls_self-name = condense( |{ cs_quote-firstname } { cs_quote-lastname }| ).
          ENDIF.
          IF lv_age = 0.
            RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Age in Years'.
          ENDIF.
          IF lv_gender IS INITIAL.
            RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Select Gender'.
          ENDIF.
          DATA(lv_ctccode) = COND zmedi_ctc( WHEN cs_quote-ctccode IS NOT INITIAL THEN cs_quote-ctccode ELSE cs_quote-noempidctc ).
          CASE lv_ctccode.
            WHEN '01' OR '03'. lv_ctc = 500000.
            WHEN '02'.         lv_ctc = 500001.
            WHEN OTHERS.
              RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Select CTC'.
          ENDCASE.
        ENDIF.

        calc_core( EXPORTING iv_year = ls_per-zyear iv_ctc = lv_ctc iv_si = cs_quote-suminsured iv_topup = cs_quote-topupamount
                             iv_self_age = lv_age iv_self_gender = lv_gender
                   IMPORTING ev_self_act = lv_self_a ev_self_pre = lv_self_p ev_pre_base = lv_base
                             ev_topup_pre = lv_top ev_total_pre = lv_tot ev_emp_share = lv_share
                   CHANGING  ct_members = lt_in ).

        cs_quote-prebase = lv_base.
        cs_quote-topuppre = lv_top.
        cs_quote-totalpre = lv_tot.
        cs_quote-empshare = lv_share.
        cs_quote-employershare = lv_tot - lv_share.
        APPEND VALUE #( reqno = cs_quote-quoteid slno = '01' email = iv_email name = ls_self-name dob = ls_self-dob
                        gender = lv_gender relation = '1' relationtext = 'Self' ageinyrs = lv_age
                        preamt = lv_self_p actpre = lv_self_a sumbase = cs_quote-suminsured ) TO lt_out.
        lv_n = 1.
        LOOP AT lt_in INTO ls_m.
          lv_n = lv_n + 1.
          ls_m-reqno = cs_quote-quoteid.
          ls_m-slno = |{ lv_n WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
          ls_m-email = iv_email.
          ls_m-relationtext = relation_text( ls_m-relation ).
          APPEND ls_m TO lt_out.
        ENDLOOP.
        ct_members = lt_out.
      CATCH zcx_medi_error INTO DATA(lx).
        cs_quote-messages = lx->mv_text.
        CLEAR ct_members.
    ENDTRY.
  ENDMETHOD.

  METHOD list_policies.
    DATA: lr_req  TYPE RANGE OF zmedi_emp-reqno,
          lr_emp  TYPE RANGE OF zmedi_emp-emp_id,
          lr_year TYPE RANGE OF zmedi_emp-zyear,
          lv_emp  TYPE persno,
          lt_emp  TYPE STANDARD TABLE OF zmedi_emp WITH DEFAULT KEY.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF iv_reqno IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = condense( CONV string( iv_reqno ) ) ) TO lr_req.
    ENDIF.
    IF iv_empid IS NOT INITIAL.
      lv_emp = alpha_empid( iv_empid ).
      IF lv_emp IS INITIAL.
        RETURN.
      ENDIF.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_emp ) TO lr_emp.
    ENDIF.
    IF iv_year IS NOT INITIAL AND strlen( condense( CONV string( iv_year ) ) ) = 4 AND iv_year CO '0123456789 '.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = condense( CONV string( iv_year ) ) ) TO lr_year.
    ENDIF.
    SELECT * FROM zmedi_emp INTO TABLE @lt_emp
      WHERE del_flag <> 'X' AND reqno IN @lr_req AND emp_id IN @lr_emp AND zyear IN @lr_year.
    SORT lt_emp BY zyear DESCENDING reqno DESCENDING.
    LOOP AT lt_emp INTO DATA(ls_emp).
      IF can_access( is_caller = ls_c is_emp = ls_emp ) = abap_true.
        APPEND policy_from_db( is_emp = ls_emp is_caller = ls_c iv_email = iv_email ) TO rt_policies.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_policy.
    DATA(ls_c) = resolve_caller( iv_email ).
    SELECT SINGLE * FROM zmedi_emp INTO @DATA(ls_emp) WHERE reqno = @iv_reqno.
    IF sy-subrc <> 0 OR ls_emp-del_flag = 'X'.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'No policy available or the policy for this employee was not created by you.'.
    ENDIF.
    IF can_access( is_caller = ls_c is_emp = ls_emp ) = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'No policy available or the policy for this employee was not created by you.'.
    ENDIF.
    rs_policy = policy_from_db( is_emp = ls_emp is_caller = ls_c iv_email = iv_email ).
  ENDMETHOD.

  METHOD get_members.
    DATA(ls_c) = resolve_caller( iv_email ).
    SELECT SINGLE * FROM zmedi_emp INTO @DATA(ls_emp) WHERE reqno = @iv_reqno.
    IF sy-subrc <> 0 OR ls_emp-del_flag = 'X' OR can_access( is_caller = ls_c is_emp = ls_emp ) = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'No policy available or the policy for this employee was not created by you.'.
    ENDIF.
    DATA lt_fam TYPE ty_fam_tab.
    SELECT * FROM zmedi_family INTO TABLE @lt_fam WHERE reqno = @iv_reqno.
    rt_members = members_from_db( it_fam = lt_fam is_emp = ls_emp iv_email = iv_email ).
  ENDMETHOD.

  METHOD submit.
    save_policy( EXPORTING iv_mode = 'N' iv_email = iv_email is_policy = is_policy it_members = it_members iv_simulate = iv_simulate
                 IMPORTING es_policy = es_policy et_members = et_members ).
  ENDMETHOD.

  METHOD change.
    save_policy( EXPORTING iv_mode = 'C' iv_email = iv_email is_policy = is_policy it_members = it_members iv_simulate = iv_simulate
                 IMPORTING es_policy = es_policy et_members = et_members ).
  ENDMETHOD.

  METHOD save_policy.
    " SPEC 2.8 (MAIN:2854-3321). iv_mode N = new policy, C = change (add nominees).
    DATA: ls_old    TYPE zmedi_emp,
          ls_emp    TYPE zmedi_emp,
          ls_e      TYPE ts_employee,
          ls_x      TYPE ty_extra,
          lt_prev   TYPE tt_member,
          lt_in     TYPE tt_member,
          lt_fold   TYPE ty_fam_tab,
          lt_fam    TYPE ty_fam_tab,
          ls_fam    TYPE zmedi_family,
          lv_emp    TYPE persno,
          lv_ctc    TYPE ansal_15,
          lv_age    TYPE i,
          lv_gender TYPE gesch,
          lv_si     TYPE zamt,
          lv_top    TYPE zamt,
          lv_self_a TYPE zamt,
          lv_self_p TYPE zamt,
          lv_base   TYPE zamt,
          lv_toppre TYPE zamt,
          lv_total  TYPE zamt,
          lv_share  TYPE zamt,
          lv_pmail  TYPE zmail,
          lv_contact TYPE zmob,
          lv_email  TYPE comm_id_long,
          lv_fname  TYPE vorna,
          lv_lname  TYPE nachn,
          lv_reqno  TYPE zreqno,
          lv_locked TYPE abap_bool,
          lv_varkey TYPE rstable-varkey,
          lv_sl     TYPE i.
    DATA lv_nn TYPE i.
    CLEAR: es_policy, et_members.

    DATA(ls_c) = resolve_caller( iv_email ).
    DATA(ls_per) = get_period( ).
    IF ls_per-zyear IS INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'No active mediclaim period is configured.'.
    ENDIF.

    " ---------- who / which policy
    IF iv_mode = 'C'.
      SELECT SINGLE * FROM zmedi_emp INTO @ls_old WHERE reqno = @is_policy-reqno.
      IF sy-subrc <> 0 OR ls_old-del_flag = 'X'.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'The policy is already deleted or has not been applied'.
      ENDIF.
      IF can_access( is_caller = ls_c is_emp = ls_old ) = abap_false.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized for this employee id.'.
      ENDIF.
      IF ls_old-zyear <> ls_per-zyear.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Old entries cannot be changed.'.
      ENDIF.
      lv_emp = ls_old-emp_id.
    ELSE.
      lv_emp = alpha_empid( is_policy-empid ).
      IF lv_emp IS INITIAL.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter Employee ID and hit enter.'.
      ENDIF.
    ENDIF.

    " ---------- eligibility (duplicate, block list, cut-off, company ...) - same code as the fetch
    read_employee( EXPORTING is_caller = ls_c iv_empid = CONV string( lv_emp ) iv_skip_checks = COND #( WHEN iv_mode = 'C' THEN abap_true ELSE abap_false )
                             iv_year = ls_per-zyear
                   IMPORTING es_employee = ls_e et_prev = lt_prev es_extra = ls_x ).
    IF ls_e-eligible IS INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = CONV string( ls_e-reason ).
    ENDIF.
    DATA(lv_sap) = xsdbool( ls_e-issapemployee = 'X' ).

    " ---------- header validations (SPEC 2.8 1-11, 2.3 for non-SAP)
    IF iv_mode = 'N'.
      IF lv_sap = abap_false.
        IF is_policy-outext IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Department'.
        ELSEIF is_policy-designtxt IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Position'.
        ELSEIF is_policy-firstname IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide First Name'.
        ELSEIF is_policy-lastname IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Last Name'.
        ELSEIF is_policy-gender IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Select Gender'.
        ELSEIF is_policy-loctxt IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Location'.
        ELSEIF is_policy-corpemail IS INITIAL AND is_policy-personalemail IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide either corporate mail id or personal email id or both'.
        ELSEIF is_policy-contact IS INITIAL.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Mobile Number'.
        ELSEIF is_policy-ageinyrs = 0.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Provide Age in Years'.
        ELSEIF NOT ( is_policy-noempidctc = '01' OR is_policy-noempidctc = '02' OR is_policy-noempidctc = '03' ).
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Select CTC'.
        ENDIF.
        IF is_policy-corpemail IS NOT INITIAL AND is_valid_mail( is_policy-corpemail ) = abap_false.
          RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid Mail ID.'.
        ENDIF.
        lv_email = is_policy-corpemail.
      ELSE.
        lv_email = ls_e-corpemail.
      ENDIF.
      IF lv_email IS INITIAL AND is_policy-personalemail IS INITIAL.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter personal mail id.'.
      ENDIF.
      IF is_policy-personalemail IS NOT INITIAL AND is_valid_mail( is_policy-personalemail ) = abap_false.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid Mail ID.'.
      ENDIF.
      check_mobile( is_policy-contact ).
      lv_pmail = is_policy-personalemail.
      lv_contact = is_policy-contact.
      lv_si = is_policy-sumbase.
      lv_top = is_policy-topuppolicy.
      IF lv_si = 0.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter amount insured under base policy.'.
      ENDIF.
      IF is_policy-topupyes IS NOT INITIAL AND lv_top = 0.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter amount insured under top up policy.'.
      ENDIF.
    ELSE.
      " change: SI, top up, contact and mails stay as submitted (SPEC 2.8 change flow)
      lv_email = ls_old-email.
      lv_pmail = ls_old-pmail.
      lv_contact = ls_old-contact.
      lv_si = ls_old-sum_base.
      lv_top = ls_old-top_up_policy.
    ENDIF.

    " ---------- CTC, self age, self gender
    IF lv_sap = abap_true.
      lv_ctc = get_ctc( lv_emp ).
      lv_age = ls_e-ageinyears.
      lv_gender = ls_x-gesch.
      lv_fname = ls_e-firstname.
      lv_lname = ls_e-lastname.
    ELSE.
      DATA lv_code TYPE zmedi_ctc.
      lv_code = COND #( WHEN iv_mode = 'C' THEN ls_old-no_emp_id_ctc ELSE is_policy-noempidctc ).
      CASE lv_code.
        WHEN '01' OR '03'. lv_ctc = 500000.
        WHEN '02'.         lv_ctc = 500001.
      ENDCASE.
      lv_age = COND #( WHEN iv_mode = 'C' THEN CONV i( ls_old-age_in_yrs ) ELSE is_policy-ageinyrs ).
      lv_gender = COND #( WHEN iv_mode = 'C' THEN ls_old-gender ELSE is_policy-gender ).
      lv_fname = COND #( WHEN iv_mode = 'C' THEN ls_old-fname ELSE is_policy-firstname ).
      lv_lname = COND #( WHEN iv_mode = 'C' THEN ls_old-lname ELSE is_policy-lastname ).
    ENDIF.

    " ---------- members: only rows with a date of birth count (the Web Dynpro ignored empty rows)
    LOOP AT it_members INTO DATA(ls_in) WHERE dob IS NOT INITIAL AND relation <> '1'.
      IF is_valid_relation( ls_in-relation ) = abap_false.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid relation.'.
      ENDIF.
      APPEND ls_in TO lt_in.
    ENDLOOP.

    IF iv_mode = 'C'.
      " existing members stay untouched (name, dob, relation, creation date); only new ones are appended
      SELECT * FROM zmedi_family INTO TABLE @lt_fold WHERE reqno = @ls_old-reqno.
      DATA lt_all TYPE tt_member.
      DATA lv_ns TYPE string.
      LOOP AT lt_fold INTO DATA(ls_fo) WHERE relation <> '1'.
        lv_nn = condense( CONV string( ls_fo-sl_no ) ).
        APPEND VALUE #( slno = |{ lv_nn WIDTH = 2 ALIGN = RIGHT PAD = '0' }| name = ls_fo-name dob = ls_fo-dob relation = ls_fo-relation
                        gender = ls_fo-gender crtdate = ls_fo-crt_date ) TO lt_all.
      ENDLOOP.
      SORT lt_all BY slno.
      LOOP AT lt_in INTO ls_in.
        DATA(lv_known) = abap_false.
        IF ls_in-slno IS NOT INITIAL AND condense( CONV string( ls_in-slno ) ) CO '0123456789'.
          lv_nn = condense( CONV string( ls_in-slno ) ).
          lv_ns = |{ lv_nn WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
          IF line_exists( lt_all[ slno = lv_ns ] ).
            lv_known = abap_true.                     " existing member (same SlNo): immutable, payload values ignored
          ENDIF.
        ENDIF.
        IF lv_known = abap_false AND line_exists( lt_all[ relation = ls_in-relation dob = ls_in-dob ] ).
          lv_known = abap_true.
        ENDIF.
        IF lv_known = abap_false.
          CLEAR ls_in-slno.                           " new member: next SlNo is assigned below
          ls_in-crtdate = sy-datum.
          APPEND ls_in TO lt_all.
        ENDIF.
      ENDLOOP.
      lt_in = lt_all.
    ELSE.
      LOOP AT lt_in ASSIGNING FIELD-SYMBOL(<n>).
        CLEAR <n>-slno.
        <n>-crtdate = sy-datum.
      ENDLOOP.
    ENDIF.

    " ---------- premium (also raises the SPEC 2.5 messages)
    calc_core( EXPORTING iv_year = ls_per-zyear iv_ctc = lv_ctc iv_si = lv_si iv_topup = lv_top
                         iv_self_age = lv_age iv_self_gender = lv_gender
               IMPORTING ev_self_act = lv_self_a ev_self_pre = lv_self_p ev_pre_base = lv_base
                         ev_topup_pre = lv_toppre ev_total_pre = lv_total ev_emp_share = lv_share
               CHANGING  ct_members = lt_in ).

    LOOP AT lt_in INTO ls_in WHERE ( relation = '5' OR relation = '6' ) AND ageinyrs > 30.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Children above 30 years old cannot be covered under the policy'.
    ENDLOOP.

    " ---------- request number under lock, duplicate check in the same LUW
    lv_varkey = |{ sy-mandt }{ ls_per-zyear }|.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = 'ZMEDI_EMP'
        varkey         = lv_varkey
        _wait          = 'X'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Could not process.Please refresh and retry'.
    ENDIF.
    lv_locked = abap_true.

    IF iv_mode = 'N'.
      SELECT SINGLE reqno FROM zmedi_emp INTO @DATA(lv_dup)
        WHERE emp_id = @lv_emp AND del_flag <> 'X' AND zyear = @ls_per-zyear.
      IF sy-subrc = 0.
        CALL FUNCTION 'DEQUEUE_E_TABLE'
          EXPORTING mode_rstable = 'E' tabname = 'ZMEDI_EMP' varkey = lv_varkey.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = |Policy for the employee id { lv_emp } already exists|.
      ENDIF.
      CALL FUNCTION 'ZMEDI_REQNO'
        IMPORTING
          ex_reqno = lv_reqno.
      ls_emp-reqno = lv_reqno.
      ls_emp-req_dat = sy-datum.
      ls_emp-created_by = ls_c-userid.
    ELSE.
      ls_emp-reqno = ls_old-reqno.
      ls_emp-req_dat = ls_old-req_dat.
      ls_emp-created_by = ls_old-created_by.
    ENDIF.

    " ---------- ZMEDI_EMP row (SPEC 3.2)
    ls_emp-zyear = ls_per-zyear.
    ls_emp-emp_id = lv_emp.
    ls_emp-comp_code = COND #( WHEN lv_sap = abap_true THEN ls_e-compcode ELSE c_bukrs ).
    ls_emp-code_txt = COND #( WHEN lv_sap = abap_true THEN ls_e-comptext ELSE c_butxt ).
    ls_emp-fname = lv_fname.
    ls_emp-lname = lv_lname.
    ls_emp-married = 'X'.
    ls_emp-email = lv_email.
    ls_emp-pmail = lv_pmail.
    ls_emp-contact = lv_contact.
    ls_emp-sum_base = lv_si.
    ls_emp-pre_base = lv_base.
    ls_emp-top_up_yes = COND #( WHEN lv_top > 0 THEN 'X' ELSE '' ).
    ls_emp-top_up_policy = lv_top.
    ls_emp-top_up_pre = lv_toppre.
    ls_emp-total_pre = lv_total.
    ls_emp-emp_share = lv_share.
    IF lv_sap = abap_true.
      ls_emp-dept = ls_e-dept.
      ls_emp-ou_text = ls_e-outext.
      ls_emp-design = ls_e-design.
      ls_emp-design_txt = ls_e-designtext.
      ls_emp-dob = ls_e-dob.
      ls_emp-age_in_yrs = lv_age.
      ls_emp-gen_text = ls_e-gendertext.
      ls_emp-gender = lv_gender.
      ls_emp-location = ls_e-location.
      ls_emp-loc_txt = ls_e-loctext.
    ELSE.
      ls_emp-no_emp_id_sap = 'X'.
      ls_emp-no_emp_id_ctc = lv_code.
      ls_emp-age_in_yrs = lv_age.
      ls_emp-gender = lv_gender.
      ls_emp-gen_text = COND #( WHEN lv_gender = '1' THEN 'Male' ELSE 'Female' ).
      IF iv_mode = 'C'.
        ls_emp-ou_text = ls_old-ou_text.
        ls_emp-design_txt = ls_old-design_txt.
        ls_emp-loc_txt = ls_old-loc_txt.
      ELSE.
        ls_emp-ou_text = is_policy-outext.
        ls_emp-design_txt = is_policy-designtxt.
        ls_emp-loc_txt = is_policy-loctxt.
      ENDIF.
    ENDIF.

    " ---------- ZMEDI_FAMILY rows (SPEC 3.3): SL_NO 1 = self, then the members in order
    lv_sl = 1.
    CLEAR ls_fam.
    ls_fam-reqno = ls_emp-reqno.
    ls_fam-sl_no = lv_sl.
    IF iv_mode = 'C'.
      READ TABLE lt_fold INTO DATA(ls_fself) WITH KEY relation = '1'.
      IF sy-subrc = 0.
        ls_fam-crt_date = ls_fself-crt_date.
      ENDIF.
    ENDIF.
    IF ls_fam-crt_date IS INITIAL.
      ls_fam-crt_date = sy-datum.
    ENDIF.
    ls_fam-name = |{ lv_fname } { lv_lname }|.
    IF lv_sap = abap_true.
      ls_fam-dob = ls_e-dob.
    ENDIF.
    ls_fam-gender = lv_gender.
    ls_fam-relation = '1'.
    ls_fam-age_in_yrs = lv_age.
    ls_fam-pre_amt = lv_self_p.
    ls_fam-act_pre = lv_self_a.
    ls_fam-sum_base = lv_si.
    APPEND ls_fam TO lt_fam.
    LOOP AT lt_in INTO ls_in WHERE slno IS NOT INITIAL.
      lv_nn = ls_in-slno.
      IF lv_nn > lv_sl.
        lv_sl = lv_nn.
      ENDIF.
    ENDLOOP.
    DATA(lv_next) = lv_sl.                           " highest SlNo in use (existing members keep theirs)
    LOOP AT lt_in INTO ls_in.
      CLEAR ls_fam.
      IF ls_in-slno IS NOT INITIAL.
        lv_sl = CONV i( ls_in-slno ).
      ELSE.
        lv_next = lv_next + 1.
        lv_sl = lv_next.
      ENDIF.
      ls_fam-reqno = ls_emp-reqno.
      ls_fam-sl_no = lv_sl.
      ls_fam-crt_date = COND #( WHEN ls_in-crtdate IS NOT INITIAL THEN ls_in-crtdate ELSE sy-datum ).
      ls_fam-name = ls_in-name.
      ls_fam-dob = ls_in-dob.
      ls_fam-gender = ls_in-gender.
      ls_fam-relation = ls_in-relation.
      ls_fam-age_in_yrs = ls_in-ageinyrs.
      ls_fam-pre_amt = ls_in-preamt.
      ls_fam-act_pre = ls_in-actpre.
      ls_fam-sum_base = lv_si.
      APPEND ls_fam TO lt_fam.
    ENDLOOP.

    " ---------- save (what ZMEDI_UPDATE_TABS does) in this LUW
    MODIFY zmedi_emp FROM ls_emp.
    DELETE FROM zmedi_family WHERE reqno = ls_emp-reqno.
    MODIFY zmedi_family FROM TABLE lt_fam.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Could not process.Please refresh and retry'.
    ENDIF.

    es_policy = policy_from_db( is_emp = ls_emp is_caller = ls_c iv_email = iv_email ).
    et_members = members_from_db( it_fam = lt_fam is_emp = ls_emp iv_email = iv_email ).

    IF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
      send_mail( iv_reqno = ls_emp-reqno iv_caller = iv_email ).
    ENDIF.
    IF lv_locked = abap_true.
      CALL FUNCTION 'DEQUEUE_E_TABLE'
        EXPORTING mode_rstable = 'E' tabname = 'ZMEDI_EMP' varkey = lv_varkey.
    ENDIF.
  ENDMETHOD.

  METHOD delete_policy.
    DATA(ls_c) = resolve_caller( iv_email ).
    DATA(ls_per) = get_period( ).
    IF ls_c-is_hr = abap_false AND iv_hub_admin = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized to delete.Contact HR team for help.'.
    ENDIF.
    SELECT SINGLE * FROM zmedi_emp INTO @DATA(ls_emp) WHERE reqno = @iv_reqno.
    IF sy-subrc <> 0 OR ls_emp-del_flag = 'X'.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'The policy is already deleted or has not been applied'.
    ENDIF.
    IF ls_emp-zyear <> ls_per-zyear.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Old entries cannot be deleted'.
    ENDIF.
    ls_emp-del_flag = 'X'.
    MODIFY zmedi_emp FROM ls_emp.
    rs_policy = policy_from_db( is_emp = ls_emp is_caller = ls_c iv_email = iv_email ).
    IF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD set_cutoff.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF ls_c-is_hr = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized to change the cut-off date.'.
    ENDIF.
    DATA(ls_dat) = get_date_row( ).
    ls_dat-slno = '1'.
    IF iv_cutoff IS NOT INITIAL.
      ls_dat-co_date = iv_cutoff.
    ENDIF.
    IF iv_insurer_mail IS NOT INITIAL.
      IF is_valid_mail( iv_insurer_mail ) = abap_false.
        RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Invalid Mail ID.'.
      ENDIF.
      ls_dat-email_id = to_lower( condense( CONV string( iv_insurer_mail ) ) ).
    ENDIF.
    MODIFY zmedi_date FROM ls_dat.
    rs_context = get_context( iv_email ).
    IF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD list_blocked.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF ls_c-is_hr = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized.'.
    ENDIF.
    SELECT emp_id, nmae FROM zmedi_excl_emp INTO TABLE @DATA(lt_b).
    SORT lt_b BY emp_id.
    LOOP AT lt_b INTO DATA(ls_b).
      APPEND VALUE #( empid = ls_b-emp_id email = iv_email name = ls_b-nmae ) TO rt_blocked.
    ENDLOOP.
  ENDMETHOD.

  METHOD add_blocked.
    DATA ls_row TYPE zmedi_excl_emp.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF ls_c-is_hr = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized.'.
    ENDIF.
    DATA(lv_emp) = alpha_empid( iv_empid ).
    IF lv_emp IS INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter a valid employee id and try again.'.
    ENDIF.
    ls_row-emp_id = lv_emp.
    ls_row-nmae = iv_name.
    MODIFY zmedi_excl_emp FROM ls_row.
    rs_blocked = VALUE #( empid = lv_emp email = iv_email name = iv_name ).
    IF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD delete_blocked.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF ls_c-is_hr = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized.'.
    ENDIF.
    DATA(lv_emp) = alpha_empid( iv_empid ).
    IF lv_emp IS INITIAL.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'Enter a valid employee id and try again.'.
    ENDIF.
    DELETE FROM zmedi_excl_emp WHERE emp_id = lv_emp.
    IF iv_simulate = abap_true.
      ROLLBACK WORK.
    ELSE.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDMETHOD.

  METHOD list_report.
    " SPEC 5.4 B (V_DOWNLOAD:439-603)
    TYPES: BEGIN OF ty_ctc, pernr TYPE persno, ctc TYPE ansal_15, END OF ty_ctc.
    DATA: lt_ctc  TYPE HASHED TABLE OF ty_ctc WITH UNIQUE KEY pernr,
          lv_year TYPE gjahr,
          lv_ctc  TYPE ansal_15,
          ls_r    TYPE ts_policyreport,
          lv_loc  TYPE string,
          lv_i    TYPE i.
    DATA(ls_c) = resolve_caller( iv_email ).
    IF ls_c-is_hr = abap_false.
      RAISE EXCEPTION TYPE zcx_medi_error EXPORTING iv_text = 'You are not authorized to download.'.
    ENDIF.
    DATA(ls_dat) = get_date_row( ).
    IF iv_year IS NOT INITIAL AND strlen( condense( CONV string( iv_year ) ) ) = 4.
      lv_year = condense( CONV string( iv_year ) ).
    ELSE.
      lv_year = get_period( )-zyear.
    ENDIF.
    lv_loc = to_upper( condense( CONV string( iv_location ) ) ).

    SELECT * FROM zmedi_emp INTO TABLE @DATA(lt_emp) WHERE del_flag <> 'X' AND zyear = @lv_year.
    SORT lt_emp BY reqno.
    IF lt_emp IS INITIAL.
      RETURN.
    ENDIF.
    SELECT * FROM zmedi_family INTO TABLE @DATA(lt_fam) FOR ALL ENTRIES IN @lt_emp WHERE reqno = @lt_emp-reqno.

    LOOP AT lt_emp INTO DATA(ls_emp).
      IF lv_loc IS NOT INITIAL AND to_upper( condense( CONV string( ls_emp-loc_txt ) ) ) <> lv_loc.
        CONTINUE.
      ENDIF.
      " CTC at download time (SAP employees: live CTC, as the legacy download did; non-SAP: from the code)
      IF ls_emp-no_emp_id_sap IS INITIAL.
        READ TABLE lt_ctc INTO DATA(ls_cc) WITH TABLE KEY pernr = ls_emp-emp_id.
        IF sy-subrc <> 0.
          ls_cc-pernr = ls_emp-emp_id.
          ls_cc-ctc = get_ctc( ls_emp-emp_id ).
          INSERT ls_cc INTO TABLE lt_ctc.
        ENDIF.
        lv_ctc = ls_cc-ctc.
      ELSE.
        lv_ctc = COND #( WHEN ls_emp-no_emp_id_ctc = '01' OR ls_emp-no_emp_id_ctc = '03' THEN 500000 ELSE 500001 ).
      ENDIF.
      DATA(lv_low) = xsdbool( lv_ctc <= c_ctc_limit ).

      DATA lt_o TYPE STANDARD TABLE OF zmedi_family WITH DEFAULT KEY.
      CLEAR lt_o.
      LOOP AT lt_fam INTO DATA(ls_f) WHERE reqno = ls_emp-reqno.
        APPEND ls_f TO lt_o.
      ENDLOOP.
      " self row first, then the others in SL_NO order
      TYPES: BEGIN OF ty_s, n TYPE i, f TYPE zmedi_family, END OF ty_s.
      DATA lt_s TYPE STANDARD TABLE OF ty_s WITH DEFAULT KEY.
      CLEAR lt_s.
      LOOP AT lt_o INTO ls_f.
        lv_i = condense( CONV string( ls_f-sl_no ) ).
        APPEND VALUE #( n = lv_i f = ls_f ) TO lt_s.
      ENDLOOP.
      SORT lt_s BY n.

      DATA(lv_first) = abap_true.
      LOOP AT lt_s INTO DATA(ls_s) WHERE f-relation = '1'.
        CLEAR ls_r.
        ls_r-reqno = ls_emp-reqno.
        ls_r-slno = |{ ls_s-n WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        ls_r-email = iv_email.
        ls_r-year = ls_emp-zyear.
        ls_r-comptext = ls_emp-code_txt.
        ls_r-loctext = ls_emp-loc_txt.
        ls_r-outext = ls_emp-ou_text.
        ls_r-empid = ls_emp-emp_id.
        ls_r-designtext = ls_emp-design_txt.
        ls_r-ctcabove5l = COND #( WHEN lv_ctc > c_ctc_limit THEN 'YES' ELSE 'NO' ).
        ls_r-corpemail = ls_emp-email.
        ls_r-personalemail = ls_emp-pmail.
        ls_r-contact = ls_emp-contact.
        ls_r-familyno = ls_r-slno.
        ls_r-name = ls_s-f-name.
        ls_r-dob = ls_s-f-dob.
        ls_r-ageinyrs = ls_s-f-age_in_yrs.
        ls_r-gender = ls_s-f-gender.
        ls_r-relation = ls_s-f-relation.
        ls_r-sumbase = ls_emp-sum_base.
        ls_r-prebase = ls_emp-pre_base.
        ls_r-topupyesno = COND #( WHEN ls_emp-top_up_yes IS NOT INITIAL THEN 'YES' ELSE 'NO' ).
        ls_r-topuppolicy = ls_emp-top_up_policy.
        ls_r-topuppre = ls_emp-top_up_pre.
        ls_r-totalpre = ls_emp-total_pre.
        ls_r-preamt = ls_s-f-act_pre.
        ls_r-crtdate = ls_s-f-crt_date.
        IF ls_emp-req_dat > ls_dat-co_date OR ls_s-f-crt_date > ls_dat-co_date.
          ls_r-newind = 'New'.
        ENDIF.
        IF lv_low = abap_true AND ls_emp-sum_base <= c_base_si.
          ls_r-empshare = 0.
          ls_r-employershare = ls_r-preamt - ls_r-empshare.
        ELSE.
          ls_r-empshare = ls_s-f-pre_amt + ls_emp-top_up_pre.
          ls_r-employershare = ls_r-preamt - ls_s-f-pre_amt.
        ENDIF.
        APPEND ls_r TO rt_report.
      ENDLOOP.
      LOOP AT lt_s INTO ls_s WHERE f-relation <> '1'.
        CLEAR ls_r.
        ls_r-reqno = ls_emp-reqno.
        ls_r-slno = |{ ls_s-n WIDTH = 2 ALIGN = RIGHT PAD = '0' }|.
        ls_r-email = iv_email.
        ls_r-year = ls_emp-zyear.
        ls_r-comptext = ls_emp-code_txt.
        ls_r-loctext = ls_emp-loc_txt.
        ls_r-outext = ls_emp-ou_text.
        ls_r-empid = ls_emp-emp_id.
        ls_r-designtext = ls_emp-design_txt.
        ls_r-ctcabove5l = COND #( WHEN lv_ctc > c_ctc_limit THEN 'YES' ELSE 'NO' ).
        ls_r-corpemail = ls_emp-email.
        ls_r-personalemail = ls_emp-pmail.
        ls_r-contact = ls_emp-contact.
        ls_r-familyno = ls_r-slno.
        ls_r-name = ls_s-f-name.
        ls_r-dob = ls_s-f-dob.
        ls_r-ageinyrs = ls_s-f-age_in_yrs.
        ls_r-gender = ls_s-f-gender.
        ls_r-relation = ls_s-f-relation.
        ls_r-sumbase = ls_emp-sum_base.
        ls_r-preamt = ls_s-f-act_pre.
        ls_r-crtdate = ls_s-f-crt_date.
        IF ls_emp-req_dat > ls_dat-co_date OR ls_s-f-crt_date > ls_dat-co_date.
          ls_r-newind = 'New'.
        ENDIF.
        IF lv_low = abap_true AND ls_emp-sum_base <= c_base_si AND ( ls_s-f-relation = '4' OR ls_s-f-relation = '5' OR ls_s-f-relation = '6' OR ls_s-f-relation = '7' ).
          ls_r-empshare = 0.
        ELSE.
          ls_r-empshare = ls_s-f-pre_amt.
        ENDIF.
        ls_r-employershare = ls_r-preamt - ls_r-empshare.
        APPEND ls_r TO rt_report.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD build_mail_html.
    DATA: lv_name TYPE string,
          lv_nl   TYPE string.
    lv_nl = cl_abap_char_utilities=>newline.
    lv_name = |{ is_emp-fname } { is_emp-lname }|.
    DATA(lv_year) = |{ is_emp-zyear }-{ CONV i( is_emp-zyear ) + 1 }|.
    rv_html = |<html><body><br>{ lv_nl }|
           && |Dear { lv_name } ( { is_emp-emp_id } ),<br><br>{ lv_nl }|
           && |Your request for medical insurance for the year { lv_year } is registered with No { is_emp-reqno } . |
           && |Please refer with this number in all future correspondences.<br><br>{ lv_nl }|
           && |Your Policy Structure for Base Policy sum of Rs.{ is_emp-sum_base DECIMALS = 2 } and Top Up policy sum of Rs.{ is_emp-top_up_policy DECIMALS = 2 } is as below:-<br><br>{ lv_nl }|.
    LOOP AT it_members INTO DATA(ls_f).
      rv_html = rv_html && |&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; { ls_f-name } = Rs. { ls_f-preamt DECIMALS = 2 }<br>{ lv_nl }|.
    ENDLOOP.
    rv_html = rv_html
           && |&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Total Base premium = Rs. { is_emp-pre_base DECIMALS = 2 }<br>{ lv_nl }|
           && |&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Top Up premium = Rs. { is_emp-top_up_pre DECIMALS = 2 }<br><br>{ lv_nl }|
           && |Employee Share is Rs. { is_emp-emp_share DECIMALS = 2 }<br><br>{ lv_nl }|
           && |Internal Referance No - { is_emp-reqno }<br><br>{ lv_nl }|
           && |Note : This email is shared for your internal reference only.<br>{ lv_nl }|
           && |A detailed communication, along with the escalation matrix, will be shared once the enrollment process is completed. |
           && |You will receive your e-card from ecard@fhpl.net shortly.<br><br>{ lv_nl }|
           && |With Regards<br>{ lv_nl }HR Team.{ lv_nl }</body></html>|.
  ENDMETHOD.

  METHOD send_mail.
    " SPEC 4 - CL_BCS instead of SO_NEW_DOCUMENT_SEND_API1; failures never roll back the policy.
    DATA: lt_rec  TYPE string_table,
          lt_soli TYPE soli_tab.
    SELECT SINGLE * FROM zmedi_emp INTO @DATA(ls_emp) WHERE reqno = @iv_reqno.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    DATA lt_fam TYPE ty_fam_tab.
    SELECT * FROM zmedi_family INTO TABLE @lt_fam WHERE reqno = @iv_reqno.
    DATA(lt_view) = members_from_db( it_fam = lt_fam is_emp = ls_emp iv_email = iv_caller ).
    DATA(lv_html) = build_mail_html( is_emp = ls_emp it_members = lt_view ).
    DATA(ls_dat) = get_date_row( ).

    APPEND CONV string( ls_emp-email ) TO lt_rec.
    APPEND CONV string( ls_emp-pmail ) TO lt_rec.
    APPEND CONV string( iv_caller ) TO lt_rec.
    APPEND CONV string( ls_dat-email_id ) TO lt_rec.
    LOOP AT lt_rec ASSIGNING FIELD-SYMBOL(<r>).
      <r> = condense( <r> ).
    ENDLOOP.
    SORT lt_rec.
    DELETE ADJACENT DUPLICATES FROM lt_rec.
    DELETE lt_rec WHERE table_line IS INITIAL.

    TRY.
        DATA(lo_send) = cl_bcs=>create_persistent( ).
        lt_soli = cl_bcs_convert=>string_to_soli( lv_html ).
        DATA(lo_doc) = cl_document_bcs=>create_document(
          i_type    = 'HTM'
          i_subject = CONV so_obj_des( |Medical Insurance - { ls_emp-fname } { ls_emp-lname }| )
          i_text    = lt_soli ).
        lo_send->set_document( lo_doc ).
        DATA(lv_any) = abap_false.
        LOOP AT lt_rec INTO DATA(lv_r).
          IF is_valid_mail( lv_r ) = abap_true.
            lo_send->add_recipient( i_recipient = cl_cam_address_bcs=>create_internet_address( CONV adr6-smtp_addr( lv_r ) ) ).
            lv_any = abap_true.
          ENDIF.
        ENDLOOP.
        IF lv_any = abap_true.
          lo_send->set_send_immediately( abap_true ).
          lo_send->send( i_with_error_screen = abap_false ).
          COMMIT WORK.
        ENDIF.
      CATCH cx_root.
        " mail problems are visible in SOST / the log, never in the policy
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
