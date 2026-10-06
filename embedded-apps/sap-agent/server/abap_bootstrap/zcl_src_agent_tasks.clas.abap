CLASS zcl_src_agent_tasks DEFINITION PUBLIC CREATE PRIVATE.
  PUBLIC SECTION.
    " Task runner behind the SAP agent. Everything ADT cannot do on ECC: DDIC objects, lock objects, number ranges,
    " text IDs, STVARV, dynpro inspection, batch input, running Z reports, reading allowed tables.
    "
    " Safety, enforced here as well as in the Python agent:
    "  - system EDS and package ZEMAMI are built in (C_SID, C_PACKAGE); STVARV select-options ZSRC_AGENT_SIDS and
    "    ZSRC_AGENT_PACKAGES can add more. A role is required only if STVARV parameter ZSRC_AGENT_ROLE names one
    "  - NO NAME PREFIX RULES. Objects may have any name. What protects SAP standard objects is ownership: the agent only creates
    "    objects in the allowed packages (ZEMAMI plus STVARV ZSRC_AGENT_PACKAGES), and refuses to change any object that already
    "    exists in another package. Reports, jobs and text pools only for programs that live in those packages.
    "  - batch input only for an allowed transaction list, table reads only from an allowed list or from tables in those packages
    " Function module parameters were written from memory of ECC 6.0: confirm each in SE37 on first use.
    CLASS-METHODS handle IMPORTING iv_json TYPE string RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    CONSTANTS: c_sid TYPE sysysid VALUE 'EDS', c_package TYPE string VALUE `ZEMAMI`.
    TYPES: BEGIN OF ty_req, task TYPE string, args TYPE REF TO data, END OF ty_req.
    TYPES: BEGIN OF ty_field, n TYPE string, t TYPE string, l TYPE i, d TYPE i, k TYPE string, END OF ty_field,
           tt_field TYPE STANDARD TABLE OF ty_field WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_table, name TYPE string, text TYPE string, kind TYPE string, fields TYPE tt_field, END OF ty_table,
           tt_table TYPE STANDARD TABLE OF ty_table WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_ddic_args, package TYPE string, request TYPE string, tables TYPE tt_table, END OF ty_ddic_args.
    TYPES: BEGIN OF ty_lock_args, name TYPE string, table TYPE string, fields TYPE string_table, package TYPE string, request TYPE string, END OF ty_lock_args.
    TYPES: BEGIN OF ty_nr_args, name TYPE string, length TYPE i, package TYPE string, request TYPE string, from_no TYPE string, to_no TYPE string, END OF ty_nr_args.
    TYPES: BEGIN OF ty_tid, object TYPE string, id TYPE string, text TYPE string, END OF ty_tid,
           tt_tid TYPE STANDARD TABLE OF ty_tid WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_tid_args, items TYPE tt_tid, request TYPE string, END OF ty_tid_args.
    TYPES: BEGIN OF ty_kv, n TYPE string, v TYPE string, END OF ty_kv,
           tt_kv TYPE STANDARD TABLE OF ty_kv WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_var, name TYPE string, value TYPE string, END OF ty_var,
           tt_var TYPE STANDARD TABLE OF ty_var WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_var_args, items TYPE tt_var, overwrite TYPE string, END OF ty_var_args.
    TYPES: BEGIN OF ty_step, program TYPE string, dynpro TYPE string, fields TYPE tt_kv, okcode TYPE string, END OF ty_step,
           tt_step TYPE STANDARD TABLE OF ty_step WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_bdc_args, tcode TYPE string, mode TYPE string, steps TYPE tt_step, END OF ty_bdc_args.
    TYPES: BEGIN OF ty_rep_args, report TYPE string, params TYPE tt_kv, END OF ty_rep_args.
    TYPES: BEGIN OF ty_tab_args, table TYPE string, where TYPE string, max TYPE i, END OF ty_tab_args.
    TYPES: BEGIN OF ty_dyn_args, program TYPE string, dynpro TYPE string, END OF ty_dyn_args.
    TYPES: BEGIN OF ty_name_args, name TYPE string, END OF ty_name_args.

    " ---- Tier A and B additions ----
    TYPES: BEGIN OF ty_obj, kind TYPE string, name TYPE string, text TYPE string, datatype TYPE string, len TYPE i, dec TYPE i, domain TYPE string,
             rowtype TYPE string, rowkind TYPE string, table TYPE string, fields TYPE string_table, unique TYPE string, END OF ty_obj,
           tt_obj TYPE STANDARD TABLE OF ty_obj WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_obj_args, package TYPE string, request TYPE string, items TYPE tt_obj, END OF ty_obj_args.
    TYPES: BEGIN OF ty_mtext, nr TYPE string, text TYPE string, END OF ty_mtext, tt_mtext TYPE STANDARD TABLE OF ty_mtext WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_mcls, arbgb TYPE string, text TYPE string, texts TYPE tt_mtext, END OF ty_mcls, tt_mcls TYPE STANDARD TABLE OF ty_mcls WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_msg_args, package TYPE string, request TYPE string, classes TYPE tt_mcls, END OF ty_msg_args.
    TYPES: BEGIN OF ty_tp, id TYPE string, key TYPE string, entry TYPE string, length TYPE i, END OF ty_tp, tt_tp TYPE STANDARD TABLE OF ty_tp WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_tp_args, program TYPE string, texts TYPE tt_tp, END OF ty_tp_args.
    TYPES: BEGIN OF ty_job_args, job TYPE string, report TYPE string, variant TYPE string, period_min TYPE i, END OF ty_job_args.
    TYPES: BEGIN OF ty_user_args, user TYPE string, password TYPE string, user_type TYPE string, first_name TYPE string, last_name TYPE string,
             email TYPE string, roles TYPE string_table, END OF ty_user_args.
    TYPES: BEGIN OF ty_mat_args, material TYPE string, description TYPE string, mtart TYPE string, base_uom TYPE string, plant TYPE string,
             matl_group TYPE string, pur_group TYPE string, END OF ty_mat_args.
    TYPES: BEGIN OF ty_preq_args, material TYPE string, plant TYPE string, quantity TYPE string, unit TYPE string, pur_group TYPE string,
             deliv_days TYPE i, END OF ty_preq_args.
    TYPES: BEGIN OF ty_val_args, steps TYPE tt_step, END OF ty_val_args.

    CLASS-METHODS guard RAISING cx_static_check.
    CLASS-METHODS ok IMPORTING ig_data TYPE any RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS fail IMPORTING iv_text TYPE string RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS args_to IMPORTING ir TYPE REF TO data CHANGING cs TYPE any.
    CLASS-METHODS check_object IMPORTING iv_obj TYPE string iv_name TYPE string iv_pkg TYPE string RETURNING VALUE(rv_err) TYPE string.
    CLASS-METHODS package_allowed IMPORTING iv_pkg TYPE clike RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS program_allowed IMPORTING iv_prog TYPE clike RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS stvarv_value IMPORTING iv_name TYPE string RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS add_to_request IMPORTING iv_request TYPE string iv_object TYPE string iv_name TYPE string.

    CLASS-METHODS t_ping RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_ddic_tables IMPORTING is TYPE ty_ddic_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_ddic_read IMPORTING is TYPE ty_name_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_lock_object IMPORTING is TYPE ty_lock_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_number_range IMPORTING is TYPE ty_nr_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_text_ids IMPORTING is TYPE ty_tid_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_stvarv IMPORTING is TYPE ty_var_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_dynpro_inspect IMPORTING is TYPE ty_dyn_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_bdc_run IMPORTING is TYPE ty_bdc_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_run_report IMPORTING is TYPE ty_rep_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_read_table IMPORTING is TYPE ty_tab_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_ddic_objects IMPORTING is TYPE ty_obj_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_message_class IMPORTING is TYPE ty_msg_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_text_pool IMPORTING is TYPE ty_tp_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_job_schedule IMPORTING is TYPE ty_job_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_user_create IMPORTING is TYPE ty_user_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_testdata_material IMPORTING is TYPE ty_mat_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_testdata_requisition IMPORTING is TYPE ty_preq_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS t_bdc_validate IMPORTING is TYPE ty_val_args RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS dyn_field_names IMPORTING iv_prog TYPE progname iv_dyn TYPE dynnr RETURNING VALUE(rt) TYPE string_table.
ENDCLASS.

CLASS zcl_src_agent_tasks IMPLEMENTATION.
  METHOD handle.
    DATA ls_req TYPE ty_req.
    TRY.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-low_case CHANGING data = ls_req ).
        guard( ).
        CASE ls_req-task.
          WHEN 'ping'.
            rv_json = t_ping( ).
          WHEN 'ddic_tables'.
            DATA ls_d TYPE ty_ddic_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_d ).
            rv_json = t_ddic_tables( ls_d ).
          WHEN 'ddic_read'.
            DATA ls_n TYPE ty_name_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_n ).
            rv_json = t_ddic_read( ls_n ).
          WHEN 'lock_object'.
            DATA ls_l TYPE ty_lock_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_l ).
            rv_json = t_lock_object( ls_l ).
          WHEN 'number_range'.
            DATA ls_r TYPE ty_nr_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_r ).
            rv_json = t_number_range( ls_r ).
          WHEN 'text_ids'.
            DATA ls_t TYPE ty_tid_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_t ).
            rv_json = t_text_ids( ls_t ).
          WHEN 'stvarv'.
            DATA ls_v TYPE ty_var_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_v ).
            rv_json = t_stvarv( ls_v ).
          WHEN 'dynpro_inspect'.
            DATA ls_y TYPE ty_dyn_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_y ).
            rv_json = t_dynpro_inspect( ls_y ).
          WHEN 'bdc_run'.
            DATA ls_b TYPE ty_bdc_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_b ).
            rv_json = t_bdc_run( ls_b ).
          WHEN 'run_report'.
            DATA ls_p TYPE ty_rep_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_p ).
            rv_json = t_run_report( ls_p ).
          WHEN 'read_table'.
            DATA ls_tb TYPE ty_tab_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_tb ).
            rv_json = t_read_table( ls_tb ).
          WHEN 'ddic_objects'.
            DATA ls_o TYPE ty_obj_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_o ).
            rv_json = t_ddic_objects( ls_o ).
          WHEN 'message_class'.
            DATA ls_mc TYPE ty_msg_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_mc ).
            rv_json = t_message_class( ls_mc ).
          WHEN 'text_pool'.
            DATA ls_tp TYPE ty_tp_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_tp ).
            rv_json = t_text_pool( ls_tp ).
          WHEN 'job_schedule'.
            DATA ls_j TYPE ty_job_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_j ).
            rv_json = t_job_schedule( ls_j ).
          WHEN 'user_create'.
            DATA ls_u TYPE ty_user_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_u ).
            rv_json = t_user_create( ls_u ).
          WHEN 'testdata_material'.
            DATA ls_m TYPE ty_mat_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_m ).
            rv_json = t_testdata_material( ls_m ).
          WHEN 'testdata_requisition'.
            DATA ls_q TYPE ty_preq_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_q ).
            rv_json = t_testdata_requisition( ls_q ).
          WHEN 'bdc_validate'.
            DATA ls_bv TYPE ty_val_args.
            args_to( EXPORTING ir = ls_req-args CHANGING cs = ls_bv ).
            rv_json = t_bdc_validate( ls_bv ).
          WHEN OTHERS.
            rv_json = fail( |unknown task { ls_req-task }| ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx).
        rv_json = fail( lx->get_text( ) ).
    ENDTRY.
  ENDMETHOD.

  METHOD guard.
    " The role check applies only when STVARV parameter ZSRC_AGENT_ROLE names a role (none by default).
    DATA(lv_agent_role) = stvarv_value( 'ZSRC_AGENT_ROLE' ).
    IF lv_agent_role IS NOT INITIAL.
      SELECT COUNT(*) FROM agr_users WHERE uname = @sy-uname AND agr_name = @lv_agent_role AND from_dat <= @sy-datum AND to_dat >= @sy-datum INTO @DATA(lv_role).
      IF lv_role = 0.
        RAISE EXCEPTION TYPE cx_sy_no_handler.   " caught by handle( ) and returned as an error text
      ENDIF.
    ENDIF.
    " Built in: EDS. STVARV select-option ZSRC_AGENT_SIDS can add more.
    SELECT low FROM tvarvc WHERE name = 'ZSRC_AGENT_SIDS' AND type = 'S' INTO TABLE @DATA(lt_sid).
    IF sy-sysid <> c_sid AND NOT line_exists( lt_sid[ low = sy-sysid ] ).
      RAISE EXCEPTION TYPE cx_sy_no_handler.
    ENDIF.
  ENDMETHOD.

  METHOD ok.
    DATA(lv) = /ui2/cl_json=>serialize( data = ig_data compress = abap_true pretty_name = /ui2/cl_json=>pretty_mode-low_case ).
    rv = |\{"ok":true,"result":{ lv }\}|.
  ENDMETHOD.

  METHOD fail.
    rv = |\{"ok":false,"error":{ /ui2/cl_json=>serialize( data = iv_text ) }\}|.
  ENDMETHOD.

  METHOD args_to.
    IF ir IS BOUND.
      /ui2/cl_json=>deserialize( EXPORTING json = /ui2/cl_json=>serialize( data = ir ) pretty_name = /ui2/cl_json=>pretty_mode-low_case CHANGING data = cs ).
    ENDIF.
  ENDMETHOD.

  METHOD stvarv_value.
    DATA(lv_name) = CONV rvari_vnam( to_upper( iv_name ) ).
    SELECT SINGLE low FROM tvarvc WHERE name = @lv_name AND type = 'P' AND numb = '0000' INTO @DATA(lv).
    IF sy-subrc = 0.
      rv = lv.
    ENDIF.
  ENDMETHOD.

  METHOD package_allowed.
    " Built in: ZEMAMI. STVARV select-option ZSRC_AGENT_PACKAGES can add more.
    SELECT low FROM tvarvc WHERE name = 'ZSRC_AGENT_PACKAGES' AND type = 'S' INTO TABLE @DATA(lt).
    DATA(lv_p) = to_upper( CONV string( iv_pkg ) ).
    rv = xsdbool( lv_p = c_package OR line_exists( lt[ low = lv_p ] ) ).
  ENDMETHOD.

  METHOD check_object.
    " Ownership instead of name prefixes: an object may be created or changed only if it is new, or already lives in an allowed
    " package. Anything that exists elsewhere (SAP standard objects, other teams' objects) is refused whatever its name.
    IF package_allowed( iv_pkg ) = abap_false.
      rv_err = |package { iv_pkg } is not in the agent's allowed packages|.
      RETURN.
    ENDIF.
    DATA(lv_obj) = CONV trobjtype( to_upper( iv_obj ) ).
    DATA(lv_nam) = CONV sobj_name( to_upper( iv_name ) ).
    SELECT SINGLE devclass FROM tadir WHERE pgmid = 'R3TR' AND object = @lv_obj AND obj_name = @lv_nam INTO @DATA(lv_dev).
    IF sy-subrc = 0 AND package_allowed( lv_dev ) = abap_false.
      rv_err = |{ iv_name } already exists in package { lv_dev }, outside the allowed packages. The agent never changes objects outside them (this protects SAP standard objects)|.
    ENDIF.
  ENDMETHOD.

  METHOD program_allowed.
    DATA(lv_p) = CONV sobj_name( to_upper( CONV string( iv_prog ) ) ).
    SELECT SINGLE devclass FROM tadir WHERE pgmid = 'R3TR' AND object = 'PROG' AND obj_name = @lv_p INTO @DATA(lv_dev).
    rv = xsdbool( sy-subrc = 0 AND package_allowed( lv_dev ) = abap_true ).
  ENDMETHOD.

  METHOD add_to_request.
    IF iv_request IS INITIAL.
      RETURN.
    ENDIF.
    DATA(ls_ko) = VALUE ko200( pgmid = 'R3TR' object = iv_object obj_name = iv_name ).
    CALL FUNCTION 'TR_OBJECT_INSERT'
      EXPORTING wi_ko200 = ls_ko wi_order = CONV trkorr( iv_request )
      EXCEPTIONS OTHERS = 1.
  ENDMETHOD.

  METHOD t_ping.
    SELECT SINGLE release FROM cvers WHERE component = 'SAP_BASIS' INTO @DATA(lv_rel).
    rv = ok( VALUE string_table( ( |sid={ sy-sysid }| ) ) ).
    " flat structure for easy reading by the Python client
    TYPES: BEGIN OF ty_p, sid TYPE sy-sysid, client TYPE sy-mandt, release TYPE c LENGTH 10, user TYPE sy-uname, abap TYPE sy-saprl, END OF ty_p.
    rv = ok( VALUE ty_p( sid = sy-sysid client = sy-mandt release = lv_rel user = sy-uname abap = sy-saprl ) ).
  ENDMETHOD.

  METHOD t_ddic_tables.
    TYPES: BEGIN OF ty_res, name TYPE string, status TYPE string, END OF ty_res.
    DATA lt_res TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY.
    DATA(lv_pack) = to_upper( is-package ).
    LOOP AT is-tables INTO DATA(ls_tab).
      DATA(lv_name) = CONV tabname( to_upper( ls_tab-name ) ).
      DATA(lv_err) = check_object( iv_obj = 'TABL' iv_name = CONV #( lv_name ) iv_pkg = is-package ).
      IF lv_err IS NOT INITIAL.
        APPEND VALUE #( name = ls_tab-name status = |refused: { lv_err }| ) TO lt_res.
        CONTINUE.
      ENDIF.
      SELECT SINGLE tabname FROM dd02l WHERE tabname = @lv_name AND as4local = 'A' INTO @DATA(lv_ex).
      IF sy-subrc = 0.
        APPEND VALUE #( name = ls_tab-name status = 'exists' ) TO lt_res.
        CONTINUE.
      ENDIF.
      DATA(lv_transp) = xsdbool( ls_tab-kind = 'TRANSP' ).
      DATA: ls_dd02v TYPE dd02v, ls_dd09l TYPE dd09l, lt_dd03p TYPE STANDARD TABLE OF dd03p, lt_dd05m TYPE STANDARD TABLE OF dd05m,
            lt_dd08v TYPE STANDARD TABLE OF dd08v, lt_dd35v TYPE STANDARD TABLE OF dd35v, lt_dd36m TYPE STANDARD TABLE OF dd36m,
            lv_rc TYPE sy-subrc, lv_pos TYPE n LENGTH 4.
      CLEAR: ls_dd02v, ls_dd09l, lt_dd03p, lv_pos.
      ls_dd02v = VALUE #( tabname = lv_name ddlanguage = sy-langu ddtext = COND #( WHEN ls_tab-text IS NOT INITIAL THEN ls_tab-text ELSE |{ lv_name }| )
                          tabclass = COND #( WHEN lv_transp = abap_true THEN 'TRANSP' ELSE 'INTTAB' )
                          contflag = COND #( WHEN lv_transp = abap_true THEN 'A' ) mainflag = COND #( WHEN lv_transp = abap_true THEN 'X' )
                          exclass = COND #( WHEN lv_transp = abap_false THEN '1' ) as4user = sy-uname as4date = sy-datum as4time = sy-uzeit ).
      IF lv_transp = abap_true.
        ls_dd09l = VALUE #( tabname = lv_name as4local = 'A' tabkat = '0' tabart = 'APPL1' bufallow = 'N' ).
      ENDIF.
      LOOP AT ls_tab-fields INTO DATA(ls_f).
        lv_pos = lv_pos + 1.
        DATA(ls_c) = VALUE dd03p( tabname = lv_name fieldname = to_upper( ls_f-n ) position = lv_pos keyflag = ls_f-k
                                  notnull = COND #( WHEN ls_f-k = 'X' THEN 'X' ) adminfield = '0' ).
        IF ls_f-t CP 'R:*'.
          ls_c-rollname = to_upper( substring( val = ls_f-t off = 2 ) ).
          ls_c-comptype = 'E'.
        ELSE.
          ls_c-datatype = to_upper( ls_f-t ).
          ls_c-leng = ls_f-l.
          ls_c-decimals = ls_f-d.
        ENDIF.
        APPEND ls_c TO lt_dd03p.
      ENDLOOP.
      CALL FUNCTION 'TR_TADIR_INTERFACE'
        EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'TABL' wi_tadir_obj_name = CONV sobj_name( lv_name )
                  wi_tadir_devclass = CONV devclass( lv_pack ) wi_tadir_author = sy-uname
        EXCEPTIONS OTHERS = 1.
      CALL FUNCTION 'DDIF_TABL_PUT'
        EXPORTING name = lv_name dd02v_wa = ls_dd02v dd09l_wa = ls_dd09l
        TABLES dd03p_tab = lt_dd03p dd05m_tab = lt_dd05m dd08v_tab = lt_dd08v dd35v_tab = lt_dd35v dd36m_tab = lt_dd36m
        EXCEPTIONS OTHERS = 1.
      IF sy-subrc <> 0.
        APPEND VALUE #( name = ls_tab-name status = |DDIF_TABL_PUT failed { sy-subrc }| ) TO lt_res.
        CONTINUE.
      ENDIF.
      CALL FUNCTION 'DDIF_TABL_ACTIVATE' EXPORTING name = lv_name auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
      add_to_request( iv_request = is-request iv_object = 'TABL' iv_name = CONV #( lv_name ) ).
      APPEND VALUE #( name = ls_tab-name status = COND #( WHEN sy-subrc = 0 AND lv_rc = 0 THEN 'created and activated' ELSE 'created, activation failed: open SE11' ) ) TO lt_res.
    ENDLOOP.
    rv = ok( lt_res ).
  ENDMETHOD.

  METHOD t_ddic_read.
    DATA: ls_h TYPE dd02v, lt_f TYPE STANDARD TABLE OF dd03p.
    CALL FUNCTION 'DDIF_TABL_GET' EXPORTING name = CONV tabname( to_upper( is-name ) ) state = 'A' IMPORTING dd02v_wa = ls_h
      TABLES dd03p_tab = lt_f EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rv = fail( |{ is-name } not found| ).
      RETURN.
    ENDIF.
    DATA(lt_out) = VALUE string_table( FOR f IN lt_f ( |{ f-fieldname } { f-datatype } { f-leng } { f-decimals } { f-keyflag } { f-rollname }| ) ).
    rv = ok( lt_out ).
  ENDMETHOD.

  METHOD t_lock_object.
    DATA(lv_lerr) = check_object( iv_obj = 'ENQU' iv_name = is-name iv_pkg = is-package ).
    IF lv_lerr IS NOT INITIAL.
      rv = fail( lv_lerr ).
      RETURN.
    ENDIF.
    DATA: ls_dd25v TYPE dd25v, lt_dd26e TYPE STANDARD TABLE OF dd26e, lt_dd27p TYPE STANDARD TABLE OF dd27p, lv_rc TYPE sy-subrc.
    DATA(lv_name) = CONV ddobjname( to_upper( is-name ) ).
    ls_dd25v = VALUE #( viewname = lv_name aggtype = 'E' roottab = to_upper( is-table ) ddlanguage = sy-langu ddtext = |{ lv_name }| ).
    lt_dd26e = VALUE #( ( viewname = lv_name tabname = to_upper( is-table ) tabpos = '0001' enqmode = 'E' ) ).
    DATA(lv_pos) = 0.
    LOOP AT is-fields INTO DATA(lv_f).
      lv_pos = lv_pos + 1.
      APPEND VALUE dd27p( viewname = lv_name objpos = |{ lv_pos WIDTH = 4 ALIGN = RIGHT PAD = '0' }| viewfield = to_upper( lv_f ) tabname = to_upper( is-table )
                          fieldname = to_upper( lv_f ) keyflag = 'X' enqmode = 'E' ) TO lt_dd27p.
    ENDLOOP.
    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'ENQU' wi_tadir_obj_name = CONV sobj_name( lv_name )
                wi_tadir_devclass = CONV devclass( to_upper( is-package ) ) wi_tadir_author = sy-uname
      EXCEPTIONS OTHERS = 1.
    CALL FUNCTION 'DDIF_ENQU_PUT' EXPORTING name = lv_name dd25v_wa = ls_dd25v TABLES dd26e_tab = lt_dd26e dd27p_tab = lt_dd27p EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rv = fail( |DDIF_ENQU_PUT failed { sy-subrc }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'DDIF_ENQU_ACTIVATE' EXPORTING name = lv_name auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
    add_to_request( iv_request = is-request iv_object = 'ENQU' iv_name = CONV #( lv_name ) ).
    rv = ok( VALUE string_table( ( COND #( WHEN sy-subrc = 0 AND lv_rc = 0 THEN |{ lv_name } created and activated| ELSE |{ lv_name } created, activation failed| ) ) ) ).
  ENDMETHOD.

  METHOD t_number_range.
    DATA(lv_nerr) = check_object( iv_obj = 'NROB' iv_name = is-name iv_pkg = is-package ).
    IF lv_nerr IS NOT INITIAL.
      rv = fail( lv_nerr ).
      RETURN.
    ENDIF.
    " NUMBER_RANGE_OBJECT_UPDATE and NUMBER_RANGE_INTERVAL_UPDATE: check parameter names in SE37 (TNRO / INRIV structures)
    DATA: ls_attr TYPE tnro, ls_text TYPE tnrot, lt_int TYPE STANDARD TABLE OF inriv, lv_err TYPE c LENGTH 1.
    ls_attr = VALUE #( object = to_upper( is-name ) domlen = COND #( WHEN is-length > 0 THEN |{ is-length WIDTH = 6 ALIGN = RIGHT PAD = '0' }| ELSE '000010' ) ).
    ls_text = VALUE #( langu = sy-langu object = to_upper( is-name ) txt = |{ is-name }| ).
    CALL FUNCTION 'NUMBER_RANGE_OBJECT_UPDATE'
      EXPORTING language = sy-langu object_attributes = ls_attr object_text = ls_text devclass = CONV devclass( to_upper( is-package ) )
                corrnumber = CONV trkorr( is-request )
      IMPORTING error = lv_err
      EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0 OR lv_err IS NOT INITIAL.
      rv = fail( |NUMBER_RANGE_OBJECT_UPDATE failed ({ sy-subrc }). Create the object in SNRO and use the agent for the rest.| ).
      RETURN.
    ENDIF.
    lt_int = VALUE #( ( nrrangenr = '01' fromnumber = COND #( WHEN is-from_no IS NOT INITIAL THEN is-from_no ELSE '0000000001' )
                        tonumber = COND #( WHEN is-to_no IS NOT INITIAL THEN is-to_no ELSE '9999999999' ) ) ).
    CALL FUNCTION 'NUMBER_RANGE_INTERVAL_UPDATE'
      EXPORTING object = to_upper( is-name )
      TABLES interval = lt_int
      EXCEPTIONS OTHERS = 1.
    rv = ok( VALUE string_table( ( COND #( WHEN sy-subrc = 0 THEN |{ is-name } created with interval 01| ELSE |{ is-name } created, interval failed| ) ) ) ).
  ENDMETHOD.

  METHOD t_text_ids.
    LOOP AT is-items INTO DATA(ls_i).
      DATA(lv_to) = CONV tdobject( to_upper( ls_i-object ) ).
      DATA(lv_ti) = CONV tdid( to_upper( ls_i-id ) ).
      SELECT SINGLE tdid FROM ttxid WHERE tdobject = @lv_to AND tdid = @lv_ti INTO @DATA(lv_have_id).
      IF sy-subrc = 0.
        CONTINUE.     " exists: never overwritten, whoever owns it
      ENDIF.
      DATA(ls_id) = VALUE ttxid( tdobject = lv_to tdid = lv_ti ).
      INSERT ttxid FROM ls_id.
      DATA(ls_it) = VALUE ttxit( tdspras = sy-langu tdobject = ls_id-tdobject tdid = ls_id-tdid tdtext = ls_i-text ).
      INSERT ttxit FROM ls_it.
    ENDLOOP.
    COMMIT WORK.
    rv = ok( VALUE string_table( ( |{ lines( is-items ) } text id(s) saved. Customizing entries are not in a transport request: add them in SE75 or SE10 if needed.| ) ) ).
  ENDMETHOD.

  METHOD t_stvarv.
    LOOP AT is-items INTO DATA(ls_i).
      " an existing parameter is changed only when the request says overwrite = X (the guard then asks a human)
      IF stvarv_value( ls_i-name ) IS NOT INITIAL AND is-overwrite <> 'X'.
        CONTINUE.
      ENDIF.
      DATA(ls_tvarvc) = VALUE tvarvc( name = to_upper( ls_i-name ) type = 'P' numb = '0000' low = ls_i-value ).
      MODIFY tvarvc FROM ls_tvarvc.
    ENDLOOP.
    COMMIT WORK.
    rv = ok( VALUE string_table( ( |{ lines( is-items ) } parameter(s) saved| ) ) ).
  ENDMETHOD.

  METHOD t_dynpro_inspect.
    DATA: lt_fields TYPE STANDARD TABLE OF rpy_dyfatc, lt_flow TYPE STANDARD TABLE OF rpy_dyflow, lt_par TYPE STANDARD TABLE OF rpy_dypara.
    CALL FUNCTION 'RPY_DYNPRO_READ'
      EXPORTING progname = CONV progname( to_upper( is-program ) ) dynnr = CONV dynnr( is-dynpro )
      TABLES fieldlist = lt_fields flowlogic = lt_flow params = lt_par
      EXCEPTIONS cancelled = 1 not_found = 2 permission_error = 3 OTHERS = 4.
    IF sy-subrc <> 0.
      rv = fail( |dynpro { is-program } { is-dynpro } not readable ({ sy-subrc })| ).
      RETURN.
    ENDIF.
    TYPES: BEGIN OF ty_out, fields LIKE lt_fields, flow LIKE lt_flow, END OF ty_out.
    rv = ok( VALUE ty_out( fields = lt_fields flow = lt_flow ) ).
  ENDMETHOD.

  METHOD t_bdc_run.
    " Any transaction: which ones run without a human's approval is decided (and asked) by the agent's guard.
    " Basis and user administration are never driven by batch input.
    CONSTANTS c_denied TYPE string VALUE ' SU01 SU10 SU02 SCC4 SE06 STMS RZ10 RZ11 SM49 SM69 SE16N SM30 SM31 '.
    IF c_denied CS | { to_upper( is-tcode ) } |.
      rv = fail( |transaction { is-tcode } is never driven by batch input (basis / user administration)| ).
      RETURN.
    ENDIF.
    DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata, lt_msg TYPE STANDARD TABLE OF bdcmsgcoll.
    LOOP AT is-steps INTO DATA(ls_s).
      APPEND VALUE bdcdata( program = to_upper( ls_s-program ) dynpro = ls_s-dynpro dynbegin = 'X' ) TO lt_bdc.
      LOOP AT ls_s-fields INTO DATA(ls_f).
        APPEND VALUE bdcdata( fnam = ls_f-n fval = ls_f-v ) TO lt_bdc.
      ENDLOOP.
      IF ls_s-okcode IS NOT INITIAL.
        APPEND VALUE bdcdata( fnam = 'BDC_OKCODE' fval = ls_s-okcode ) TO lt_bdc.
      ENDIF.
    ENDLOOP.
    DATA(lv_mode) = COND ctu_mode( WHEN is-mode IS INITIAL THEN 'N' ELSE is-mode ).
    DATA(lv_tcode) = CONV sy-tcode( to_upper( is-tcode ) ).
    CALL TRANSACTION lv_tcode USING lt_bdc MODE lv_mode UPDATE 'S' MESSAGES INTO lt_msg.
    DATA lt_text TYPE string_table.
    LOOP AT lt_msg INTO DATA(ls_m).
      DATA lv_t TYPE string.
      MESSAGE ID ls_m-msgid TYPE 'S' NUMBER ls_m-msgnr WITH ls_m-msgv1 ls_m-msgv2 ls_m-msgv3 ls_m-msgv4 INTO lv_t.
      APPEND |{ ls_m-msgtyp } { lv_t }{ COND string( WHEN ls_m-dyname IS NOT INITIAL THEN | [screen { ls_m-dyname }/{ ls_m-dynumb }]| ) }| TO lt_text.
    ENDLOOP.
    rv = ok( lt_text ).
  ENDMETHOD.

  METHOD t_run_report.
    IF program_allowed( is-report ) = abap_false.
      rv = fail( 'only reports that live in the agent''s allowed packages may be run' ).
      RETURN.
    ENDIF.
    DATA: lt_sel TYPE STANDARD TABLE OF rsparams, lt_list TYPE STANDARD TABLE OF abaplist, lt_asci TYPE STANDARD TABLE OF soli.
    LOOP AT is-params INTO DATA(ls_p).
      APPEND VALUE rsparams( selname = to_upper( ls_p-n ) kind = 'P' sign = 'I' option = 'EQ' low = ls_p-v ) TO lt_sel.
    ENDLOOP.
    DATA(lv_rep) = CONV progname( to_upper( is-report ) ).
    SUBMIT (lv_rep) WITH SELECTION-TABLE lt_sel EXPORTING LIST TO MEMORY AND RETURN.
    CALL FUNCTION 'LIST_FROM_MEMORY' TABLES listobject = lt_list EXCEPTIONS OTHERS = 1.
    CALL FUNCTION 'LIST_TO_ASCI' TABLES listasci = lt_asci listobject = lt_list EXCEPTIONS OTHERS = 1.
    DATA(lt_out) = VALUE string_table( FOR l IN lt_asci FROM 1 TO 300 ( CONV string( l-line ) ) ).
    rv = ok( lt_out ).
  ENDMETHOD.

  METHOD t_read_table.
    " Any table except the ones that hold secrets.
    CONSTANTS c_denied TYPE string VALUE ' USR02 USH02 USH04 USRPWDHISTORY RFCDES SECSTORE USR40 '.
    DATA(lv_tab) = to_upper( is-table ).
    IF c_denied CS | { lv_tab } |.
      rv = fail( |table { is-table } holds secrets and is never readable| ).
      RETURN.
    ENDIF.
    IF is-where IS NOT INITIAL AND NOT matches( val = is-where regex = `[A-Za-z0-9_ =<>'.,()\-]+` ).
      rv = fail( 'WHERE clause has characters that are not allowed' ).
      RETURN.
    ENDIF.
    IF is-where CP '*SELECT*' OR is-where CP '*select*'.
      rv = fail( 'sub-selects are not allowed' ).
      RETURN.
    ENDIF.
    DATA lr_tab TYPE REF TO data.
    FIELD-SYMBOLS <lt> TYPE STANDARD TABLE.
    CREATE DATA lr_tab TYPE STANDARD TABLE OF (lv_tab) WITH DEFAULT KEY.
    ASSIGN lr_tab->* TO <lt>.
    DATA(lv_max) = nmin( val1 = COND i( WHEN is-max > 0 THEN is-max ELSE 50 ) val2 = 200 ).
    SELECT * FROM (lv_tab) INTO CORRESPONDING FIELDS OF TABLE <lt> UP TO lv_max ROWS WHERE (is-where).
    rv = ok( <lt> ).
  ENDMETHOD.
  METHOD t_ddic_objects.
    " Domains, data elements, table types and customer indexes (on any table; the agent's guard asks a human for tables outside its list).
    TYPES: BEGIN OF ty_res, name TYPE string, status TYPE string, END OF ty_res.
    DATA: lt_res TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY, lv_rc TYPE sy-subrc.
    LOOP AT is-items INTO DATA(ls).
      DATA(lv_name) = CONV ddobjname( to_upper( ls-name ) ).
      IF ls-kind <> 'INDX'.
        DATA(lv_oerr) = check_object( iv_obj = ls-kind iv_name = CONV #( lv_name ) iv_pkg = is-package ).
        IF lv_oerr IS NOT INITIAL.
          APPEND VALUE #( name = ls-name status = |refused: { lv_oerr }| ) TO lt_res.
          CONTINUE.
        ENDIF.
      ENDIF.
      CASE ls-kind.
        WHEN 'DOMA'.
          DATA: lt_dd07v TYPE STANDARD TABLE OF dd07v.
          CLEAR lt_dd07v.
          CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'DOMA'
            wi_tadir_obj_name = CONV sobj_name( lv_name ) wi_tadir_devclass = CONV devclass( to_upper( is-package ) ) wi_tadir_author = sy-uname EXCEPTIONS OTHERS = 1.
          CALL FUNCTION 'DDIF_DOMA_PUT' EXPORTING name = lv_name
            dd01v_wa = VALUE dd01v( domname = lv_name ddlanguage = sy-langu datatype = to_upper( ls-datatype ) leng = ls-len decimals = ls-dec outputlen = ls-len ddtext = ls-text )
            TABLES dd07v_tab = lt_dd07v EXCEPTIONS OTHERS = 1.
          IF sy-subrc = 0.
            CALL FUNCTION 'DDIF_DOMA_ACTIVATE' EXPORTING name = lv_name auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
          ENDIF.
          add_to_request( iv_request = is-request iv_object = 'DOMA' iv_name = CONV #( lv_name ) ).
        WHEN 'DTEL'.
          CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'DTEL'
            wi_tadir_obj_name = CONV sobj_name( lv_name ) wi_tadir_devclass = CONV devclass( to_upper( is-package ) ) wi_tadir_author = sy-uname EXCEPTIONS OTHERS = 1.
          DATA(ls_e) = VALUE dd04v( rollname = lv_name ddlanguage = sy-langu ddtext = ls-text reptext = ls-text headlen = 10 scrlen1 = 10 scrlen2 = 20 scrlen3 = 40
                                    scrtext_s = substring( val = ls-text len = nmin( val1 = 10 val2 = strlen( ls-text ) ) )
                                    scrtext_m = substring( val = ls-text len = nmin( val1 = 20 val2 = strlen( ls-text ) ) )
                                    scrtext_l = substring( val = ls-text len = nmin( val1 = 40 val2 = strlen( ls-text ) ) ) ).
          IF ls-domain IS NOT INITIAL.
            ls_e-domname = to_upper( ls-domain ).
          ELSE.
            ls_e-datatype = to_upper( ls-datatype ).
            ls_e-leng = ls-len.
            ls_e-decimals = ls-dec.
          ENDIF.
          CALL FUNCTION 'DDIF_DTEL_PUT' EXPORTING name = lv_name dd04v_wa = ls_e EXCEPTIONS OTHERS = 1.
          IF sy-subrc = 0.
            CALL FUNCTION 'DDIF_DTEL_ACTIVATE' EXPORTING name = lv_name auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
          ENDIF.
          add_to_request( iv_request = is-request iv_object = 'DTEL' iv_name = CONV #( lv_name ) ).
        WHEN 'TTYP'.
          DATA lt_dd42v TYPE STANDARD TABLE OF dd42v.
          CLEAR lt_dd42v.
          CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'TTYP'
            wi_tadir_obj_name = CONV sobj_name( lv_name ) wi_tadir_devclass = CONV devclass( to_upper( is-package ) ) wi_tadir_author = sy-uname EXCEPTIONS OTHERS = 1.
          CALL FUNCTION 'DDIF_TTYP_PUT' EXPORTING name = lv_name
            dd40v_wa = VALUE dd40v( typename = lv_name ddlanguage = sy-langu ddtext = ls-text rowtype = to_upper( ls-rowtype )
                                    rowkind = COND #( WHEN ls-rowkind IS INITIAL THEN 'S' ELSE ls-rowkind ) accessmode = 'T' keydef = 'D' keykind = 'N' )
            TABLES dd42v_tab = lt_dd42v EXCEPTIONS OTHERS = 1.
          IF sy-subrc = 0.
            CALL FUNCTION 'DDIF_TTYP_ACTIVATE' EXPORTING name = lv_name auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
          ENDIF.
          add_to_request( iv_request = is-request iv_object = 'TTYP' iv_name = CONV #( lv_name ) ).
        WHEN 'INDX'.
          " ls-table = table, ls-name = index id (Z..), ls-fields = index fields. Customer indexes on standard tables only.
          DATA lt_dd17v TYPE STANDARD TABLE OF dd17v.
          CLEAR lt_dd17v.
          DATA(lv_pos) = 0.
          LOOP AT ls-fields INTO DATA(lv_fld).
            lv_pos = lv_pos + 1.
            APPEND VALUE dd17v( sqltab = to_upper( ls-table ) indexname = lv_name position = lv_pos fieldname = to_upper( lv_fld ) ) TO lt_dd17v.
          ENDLOOP.
          CALL FUNCTION 'DDIF_INDX_PUT' EXPORTING name = to_upper( ls-table ) id = CONV ddobjname( lv_name )
            dd12v_wa = VALUE dd12v( sqltab = to_upper( ls-table ) indexname = lv_name ddlanguage = sy-langu ddtext = ls-text uniqueflag = ls-unique )
            TABLES dd17v_tab = lt_dd17v EXCEPTIONS OTHERS = 1.
          IF sy-subrc = 0.
            CALL FUNCTION 'DDIF_INDX_ACTIVATE' EXPORTING name = to_upper( ls-table ) id = CONV ddobjname( lv_name ) auth_chk = abap_false IMPORTING rc = lv_rc EXCEPTIONS OTHERS = 1.
          ENDIF.
          add_to_request( iv_request = is-request iv_object = 'INDX' iv_name = |{ to_upper( ls-table ) WIDTH = 30 }{ lv_name }| ).
        WHEN OTHERS.
          APPEND VALUE #( name = ls-name status = |kind { ls-kind } not supported (DOMA, DTEL, TTYP, INDX)| ) TO lt_res.
          CONTINUE.
      ENDCASE.
      APPEND VALUE #( name = ls-name status = COND #( WHEN sy-subrc = 0 AND lv_rc = 0 THEN 'created and activated' ELSE 'failed or not activated: check SE11' ) ) TO lt_res.
    ENDLOOP.
    rv = ok( lt_res ).
  ENDMETHOD.

  METHOD t_message_class.
    " Message classes (SE91): T100A header and T100 texts.
    LOOP AT is-classes INTO DATA(ls_c).
      DATA(lv_merr) = check_object( iv_obj = 'MSAG' iv_name = ls_c-arbgb iv_pkg = is-package ).
      IF lv_merr IS NOT INITIAL.
        rv = fail( lv_merr ).
        RETURN.
      ENDIF.
      DATA(lv_ar) = CONV arbgb( to_upper( ls_c-arbgb ) ).
      CALL FUNCTION 'TR_TADIR_INTERFACE' EXPORTING wi_test_modus = space wi_tadir_pgmid = 'R3TR' wi_tadir_object = 'MSAG'
        wi_tadir_obj_name = CONV sobj_name( lv_ar ) wi_tadir_devclass = CONV devclass( to_upper( is-package ) ) wi_tadir_author = sy-uname EXCEPTIONS OTHERS = 1.
      DATA(ls_t100a) = VALUE t100a( arbgb = lv_ar stext = ls_c-text masterlang = sy-langu ).
      MODIFY t100a FROM ls_t100a.
      LOOP AT ls_c-texts INTO DATA(ls_t).
        DATA(ls_t100) = VALUE t100( sprsl = sy-langu arbgb = lv_ar msgnr = |{ ls_t-nr WIDTH = 3 ALIGN = RIGHT PAD = '0' }| text = ls_t-text ).
        MODIFY t100 FROM ls_t100.
      ENDLOOP.
      add_to_request( iv_request = is-request iv_object = 'MSAG' iv_name = CONV #( lv_ar ) ).
    ENDLOOP.
    COMMIT WORK.
    rv = ok( VALUE string_table( ( |{ lines( is-classes ) } message class(es) saved| ) ) ).
  ENDMETHOD.

  METHOD t_text_pool.
    " Text symbols (I), selection texts (S) and the program title (R) of a program in an allowed package.
    IF program_allowed( is-program ) = abap_false.
      rv = fail( 'only programs that live in the agent''s allowed packages may be changed' ).
      RETURN.
    ENDIF.
    DATA lt_tp TYPE STANDARD TABLE OF textpool.
    DATA(lv_prog) = CONV progname( to_upper( is-program ) ).
    READ TEXTPOOL lv_prog INTO lt_tp LANGUAGE sy-langu.
    LOOP AT is-texts INTO DATA(ls).
      DELETE lt_tp WHERE id = ls-id AND key = ls-key.
      APPEND VALUE textpool( id = ls-id key = ls-key entry = ls-entry length = COND #( WHEN ls-length > 0 THEN ls-length ELSE strlen( ls-entry ) ) ) TO lt_tp.
    ENDLOOP.
    INSERT TEXTPOOL lv_prog FROM lt_tp LANGUAGE sy-langu.
    rv = ok( VALUE string_table( ( |{ lines( is-texts ) } text(s) saved for { lv_prog }. Activate the program afterwards.| ) ) ).
  ENDMETHOD.

  METHOD t_job_schedule.
    " Periodic background job (SM36). Skips when the job is already scheduled.
    IF program_allowed( is-report ) = abap_false.
      rv = fail( 'the report must live in the agent''s allowed packages' ).
      RETURN.
    ENDIF.
    DATA(lv_job) = CONV btcjob( to_upper( is-job ) ).
    SELECT SINGLE jobname FROM tbtco WHERE jobname = @lv_job AND status IN ('S', 'R', 'Y', 'P') INTO @DATA(lv_ex).
    IF sy-subrc = 0.
      rv = ok( VALUE string_table( ( |{ lv_job } is already scheduled| ) ) ).
      RETURN.
    ENDIF.
    DATA lv_cnt TYPE btcjobcnt.
    CALL FUNCTION 'JOB_OPEN' EXPORTING jobname = lv_job IMPORTING jobcount = lv_cnt EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rv = fail( |JOB_OPEN failed { sy-subrc }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'JOB_SUBMIT' EXPORTING authcknam = sy-uname jobcount = lv_cnt jobname = lv_job report = CONV progname( to_upper( is-report ) )
      variant = CONV raldb_vari( is-variant ) EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      rv = fail( |JOB_SUBMIT failed { sy-subrc }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'JOB_CLOSE' EXPORTING jobcount = lv_cnt jobname = lv_job strtimmed = abap_true
      prdmins = COND #( WHEN is-period_min > 0 THEN is-period_min ELSE 1 ) EXCEPTIONS OTHERS = 1.
    rv = ok( VALUE string_table( ( COND #( WHEN sy-subrc = 0 THEN |{ lv_job } scheduled every { COND i( WHEN is-period_min > 0 THEN is-period_min ELSE 1 ) } min| ELSE |JOB_CLOSE failed { sy-subrc }| ) ) ) ).
  ENDMETHOD.

  METHOD t_user_create.
    " SAP user with roles. The password is never returned and is masked in the agent's audit log. Prefer SSO for real users.
    " any user name is allowed, but never a protected one, and never an existing one (BAPI_USER_CREATE1 refuses to overwrite)
    CONSTANTS c_protected TYPE string VALUE ' DDIC SAPSYS TMSADM EARLYWATCH SAPCPIC '.
    IF c_protected CS | { to_upper( is-user ) } | OR to_upper( is-user ) CP 'SAP*'.
      rv = fail( |user { is-user } is protected| ).
      RETURN.
    ENDIF.
    LOOP AT is-roles INTO DATA(lv_r).
      IF to_upper( lv_r ) CP 'SAP_*' OR to_upper( lv_r ) CP 'S_A.*'.
        rv = fail( |role { lv_r } is a SAP standard authorization role and is never assigned by the agent| ).
        RETURN.
      ENDIF.
    ENDLOOP.
    DATA: lt_ret TYPE STANDARD TABLE OF bapiret2, lt_agr TYPE STANDARD TABLE OF bapiagr.
    DATA(lv_user) = CONV xubname( to_upper( is-user ) ).
    CALL FUNCTION 'BAPI_USER_CREATE1' EXPORTING username = lv_user
      logondata = VALUE bapilogond( ustyp = COND #( WHEN is-user_type IS INITIAL THEN 'A' ELSE is-user_type ) )
      password = VALUE bapipwd( bapipwd = is-password )
      address = VALUE bapiaddr3( firstname = is-first_name lastname = COND #( WHEN is-last_name IS INITIAL THEN lv_user ELSE is-last_name ) e_mail = is-email )
      TABLES return = lt_ret.
    IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
      rv = fail( |{ lt_ret[ type = 'E' ]-message }| ).
      RETURN.
    ENDIF.
    lt_agr = VALUE #( FOR r IN is-roles ( agr_name = to_upper( r ) from_dat = sy-datum to_dat = '99991231' ) ).
    IF lt_agr IS NOT INITIAL.
      CLEAR lt_ret.
      CALL FUNCTION 'BAPI_USER_ACTGROUPS_ASSIGN' EXPORTING username = lv_user TABLES activitygroups = lt_agr return = lt_ret.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
    rv = ok( VALUE string_table( ( |user { lv_user } created with { lines( lt_agr ) } role(s)| ) ) ).
  ENDMETHOD.

  METHOD t_testdata_material.
    " New test material through BAPI_MATERIAL_SAVEDATA (any name). Refuses when the material already exists, so real master data is never changed.
    DATA(lv_mat) = CONV matnr( to_upper( is-material ) ).
    SELECT SINGLE matnr FROM mara WHERE matnr = @lv_mat INTO @DATA(lv_exist_mat).
    IF sy-subrc = 0.
      rv = fail( |material { is-material } already exists and is not changed by the agent| ).
      RETURN.
    ENDIF.
    DATA: lt_desc TYPE STANDARD TABLE OF bapi_makt, lt_ret TYPE STANDARD TABLE OF bapiret2, ls_ret TYPE bapiret2.
    lt_desc = VALUE #( ( langu = sy-langu matl_desc = is-description ) ).
    CALL FUNCTION 'BAPI_MATERIAL_SAVEDATA'
      EXPORTING headdata = VALUE bapimathead( material = to_upper( is-material ) ind_sector = 'M' matl_type = COND #( WHEN is-mtart IS INITIAL THEN 'VERP' ELSE to_upper( is-mtart ) )
                                              basic_view = abap_true purchase_view = abap_true )
                clientdata = VALUE bapi_mara( base_uom = is-base_uom matl_group = is-matl_group )
                clientdatax = VALUE bapi_marax( base_uom = abap_true matl_group = abap_true )
                plantdata = VALUE bapi_marc( plant = is-plant pur_group = is-pur_group )
                plantdatax = VALUE bapi_marcx( plant = is-plant pur_group = abap_true )
      IMPORTING return = ls_ret
      TABLES materialdescription = lt_desc.
    IF ls_ret-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      rv = fail( |{ ls_ret-message }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
    rv = ok( VALUE string_table( ( |material { is-material } created in plant { is-plant }| ) ) ).
  ENDMETHOD.

  METHOD t_testdata_requisition.
    " Test purchase requisition (test data). Creates a new document, changes no master data.
    DATA: lt_items TYPE STANDARD TABLE OF bapimereqitemimp, lt_ret TYPE STANDARD TABLE OF bapiret2, lv_no TYPE banfn.
    lt_items = VALUE #( ( preq_item = '00010' material = to_upper( is-material ) plant = is-plant quantity = CONV #( is-quantity ) unit = is-unit pur_group = is-pur_group
                          deliv_date = sy-datum + COND i( WHEN is-deliv_days > 0 THEN is-deliv_days ELSE 30 ) ) ).
    DATA lt_old TYPE STANDARD TABLE OF bapiebanc.
    CALL FUNCTION 'BAPI_REQUISITION_CREATE' IMPORTING number = lv_no TABLES requisition_items = lt_old return = lt_ret.
    IF lv_no IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      rv = fail( |{ COND string( WHEN line_exists( lt_ret[ type = 'E' ] ) THEN lt_ret[ type = 'E' ]-message ELSE 'requisition not created' ) }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true.
    rv = ok( VALUE string_table( ( |requisition { lv_no } created| ) ) ).
  ENDMETHOD.

  METHOD dyn_field_names.
    " Names of the input fields of a screen, without table-control indexes.
    DATA: lt_fields TYPE STANDARD TABLE OF rpy_dyfatc, lt_flow TYPE STANDARD TABLE OF rpy_dyflow, lt_par TYPE STANDARD TABLE OF rpy_dypara.
    CALL FUNCTION 'RPY_DYNPRO_READ' EXPORTING progname = iv_prog dynnr = iv_dyn
      TABLES fieldlist = lt_fields flowlogic = lt_flow params = lt_par EXCEPTIONS OTHERS = 1.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.
    LOOP AT lt_fields ASSIGNING FIELD-SYMBOL(<f>).
      DO 4 TIMES.
        DATA(lv_comp) = SWITCH string( sy-index WHEN 1 THEN 'NAME' WHEN 2 THEN 'FNAM' WHEN 3 THEN 'FLDNAME' ELSE 'FIELDNAME' ).
        ASSIGN COMPONENT lv_comp OF STRUCTURE <f> TO FIELD-SYMBOL(<n>).
        IF sy-subrc = 0 AND <n> IS NOT INITIAL.
          APPEND to_upper( condense( CONV string( <n> ) ) ) TO rt.
          EXIT.
        ENDIF.
      ENDDO.
    ENDLOOP.
  ENDMETHOD.

  METHOD t_bdc_validate.
    " Checks every field of every batch input step against the real screen BEFORE running it.
    TYPES: BEGIN OF ty_bad, program TYPE string, dynpro TYPE string, field TYPE string, END OF ty_bad.
    DATA lt_bad TYPE STANDARD TABLE OF ty_bad WITH DEFAULT KEY.
    LOOP AT is-steps INTO DATA(ls_s).
      DATA(lt_names) = dyn_field_names( iv_prog = CONV #( to_upper( ls_s-program ) ) iv_dyn = CONV #( ls_s-dynpro ) ).
      IF lt_names IS INITIAL.
        APPEND VALUE #( program = ls_s-program dynpro = ls_s-dynpro field = '(screen not readable)' ) TO lt_bad.
        CONTINUE.
      ENDIF.
      LOOP AT ls_s-fields INTO DATA(ls_f).
        DATA(lv_f) = to_upper( ls_f-n ).
        IF lv_f CP 'BDC_*'.
          CONTINUE.
        ENDIF.
        REPLACE REGEX '\(\d+\)$' IN lv_f WITH ''.
        REPLACE REGEX '\[\d+\]$' IN lv_f WITH ''.
        IF NOT line_exists( lt_names[ table_line = lv_f ] ).
          APPEND VALUE #( program = ls_s-program dynpro = ls_s-dynpro field = ls_f-n ) TO lt_bad.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    TYPES: BEGIN OF ty_vres, valid TYPE abap_bool, unknown TYPE STANDARD TABLE OF ty_bad WITH DEFAULT KEY, END OF ty_vres.
    rv = ok( VALUE ty_vres( valid = xsdbool( lt_bad IS INITIAL ) unknown = lt_bad ) ).
  ENDMETHOD.
ENDCLASS.
