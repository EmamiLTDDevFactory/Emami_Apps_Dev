"! MDM dashboard (rebuild of Web Dynpro /INOWITS/MDM_DB): READ-ONLY model over /INOWITS/M_TRANS, TRANS_I, the workflow tables (SWWWIHEAD,
"! SWWUSERWI, SWWCNTP0) and the change documents. Ops: meta, overview, list, detail, changes, changeitems. Nothing here writes to the
"! database or calls a workflow function that writes (the old board healed STATUS on page load with /INOWITS/UPDATE and MDS_DB_STATUS; that is not ported).
"! Pending stage: the READY dialog work items of a T-ID (top_wi_id join) give agents and waiting-since (WI_CD/WI_CT) and the task (role type and department);
"! the LEVEL is the container element LEVEL of the top workflow item, decoded from the container XML in SWWCNTP0 (checked equal to the WAPI read).
CLASS zcl_mm_mdm_adm_dash DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run
      IMPORTING iv_op          TYPE clike
                iv_actor       TYPE clike OPTIONAL
                iv_payload     TYPE string OPTIONAL
      RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    CONSTANTS gc_stale_days TYPE i VALUE 90.

    TYPES:
      ty_users TYPE STANDARD TABLE OF xubname WITH DEFAULT KEY,
      BEGIN OF ty_req,
        actor         TYPE string,
        is_admin      TYPE abap_bool,
        trans_id      TYPE string,
        user          TYPE string,
        apps          TYPE string_table,
        status        TYPE string,
        status_group  TYPE string,
        mtype         TYPE string,
        plant         TYPE string,
        gen_field2    TYPE string,
        obj_value     TYPE string,
        text          TYPE string,
        date_from     TYPE string,
        date_to       TYPE string,
        all_dates     TYPE abap_bool,
        duplicate     TYPE string,
        agent         TYPE string,
        level         TYPE string,
        role_type     TYPE string,
        dept          TYPE string,
        age_bucket    TYPE string,
        flag          TYPE string,
        exclude_stale TYPE abap_bool,
        page          TYPE i,
        page_size     TYPE i,
        sort          TYPE string,
        dir           TYPE string,
        change_nr     TYPE string,
      END OF ty_req,
      BEGIN OF ty_hdr,
        transid    TYPE /inowits/m_trans-transid,
        app_id     TYPE /inowits/m_trans-app_id,
        obj_value  TYPE /inowits/m_trans-obj_value,
        status     TYPE /inowits/m_trans-status,
        created_d  TYPE d,
        created_t  TYPE t,
        user_id    TYPE /inowits/m_trans-user_id,
        top_wi_id  TYPE /inowits/m_trans-top_wi_id,
        duplicate  TYPE /inowits/m_trans-duplicate,
        gen_type   TYPE /inowits/m_trans-gen_type,
        gen_field  TYPE /inowits/m_trans-gen_field,
        gen_field2 TYPE /inowits/m_trans-gen_field2,
        gen_field3 TYPE /inowits/m_trans-gen_field3,
        wf_state   TYPE swwwihead-wi_stat,
      END OF ty_hdr,
      tt_hdr TYPE STANDARD TABLE OF ty_hdr WITH DEFAULT KEY,
      BEGIN OF ty_pend,
        transid TYPE /inowits/m_trans-transid,
        wi_id   TYPE swwwihead-wi_id,
        since_d TYPE d,
        since_t TYPE t,
        task    TYPE swwwihead-wi_rh_task,
        rhtext  TYPE swwwihead-wi_rhtext,
        agent   TYPE swwuserwi-user_id,
      END OF ty_pend,
      tt_pend TYPE STANDARD TABLE OF ty_pend WITH DEFAULT KEY,
      "One line per request as the board shows it
      BEGIN OF ty_row,
        trans_id        TYPE string,
        app_id          TYPE string,
        app_text        TYPE string,
        obj_value       TYPE string,
        description     TYPE string,
        material_type   TYPE string,
        plant           TYPE string,
        status          TYPE string,
        status_text     TYPE string,
        wf_state        TYPE string,
        is_open         TYPE abap_bool,
        flags           TYPE string_table,
        initiator       TYPE string,
        initiator_name  TYPE string,
        created         TYPE string,
        last_action     TYPE string,
        tat_seconds     TYPE i,
        pending_level   TYPE string,
        pending_type    TYPE string,
        pending_dept    TYPE string,
        pending_agents  TYPE string,
        pending_names   TYPE string,
        pending_items   TYPE i,
        pending_since   TYPE string,
        age_seconds     TYPE i,
        age_bucket      TYPE string,
        stale           TYPE abap_bool,
        duplicate       TYPE abap_bool,
        top_wi_id       TYPE string,
        route           TYPE string,
      END OF ty_row,
      tt_row TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY,
      "Row plus internals not sent to the client
      BEGIN OF ty_irow,
        r         TYPE ty_row,
        since_d   TYPE d,
        since_t   TYPE t,
        gen_field TYPE /inowits/m_trans-gen_field,
        gen_f2    TYPE /inowits/m_trans-gen_field2,
        gen_f3    TYPE /inowits/m_trans-gen_field3,
        created_d TYPE d,
        created_t TYPE t,
        wi_first  TYPE swwwihead-wi_id,
        agent_tab TYPE string_table,
        dept_tab  TYPE string_table,
      END OF ty_irow,
      tt_irow TYPE STANDARD TABLE OF ty_irow WITH DEFAULT KEY,
      BEGIN OF ty_wfr,
        app_id     TYPE /inowits/wf_role-app_id,
        gen_type   TYPE /inowits/wf_role-gen_type,
        gen_field  TYPE /inowits/wf_role-gen_field,
        gen_field2 TYPE /inowits/wf_role-gen_field2,
        gen_field3 TYPE /inowits/wf_role-gen_field3,
        lvl        TYPE /inowits/wf_role-lvl,
        role       TYPE /inowits/wf_role-role,
        agent      TYPE /inowits/wf_role-agent,
        level_text TYPE /inowits/wf_role-level_text,
      END OF ty_wfr,
      tt_wfr TYPE STANDARD TABLE OF ty_wfr WITH DEFAULT KEY,
      BEGIN OF ty_name,
        bname     TYPE xubname,
        name_text TYPE string,
      END OF ty_name,
      tt_name TYPE HASHED TABLE OF ty_name WITH UNIQUE KEY bname,
      BEGIN OF ty_count, code TYPE string, label TYPE string, count TYPE i, END OF ty_count,
      tt_count TYPE STANDARD TABLE OF ty_count WITH DEFAULT KEY,
      BEGIN OF ty_dept, dept TYPE string, work_items TYPE i, requests TYPE i, END OF ty_dept,
      tt_dept TYPE STANDARD TABLE OF ty_dept WITH DEFAULT KEY,
      BEGIN OF ty_stage,
        app_id        TYPE string,
        level         TYPE string,
        role_type     TYPE string,
        requests      TYPE i,
        fresh         TYPE i,
        stale         TYPE i,
        work_items    TYPE i,
        agents        TYPE i,
        oldest_age    TYPE i,
        avg_age       TYPE i,
        depts         TYPE tt_dept,
      END OF ty_stage,
      tt_stage TYPE STANDARD TABLE OF ty_stage WITH DEFAULT KEY,
      BEGIN OF ty_app_cnt, app_id TYPE string, app_text TYPE string, count TYPE i, END OF ty_app_cnt,
      tt_app_cnt TYPE STANDARD TABLE OF ty_app_cnt WITH DEFAULT KEY,
      BEGIN OF ty_agent,
        agent      TYPE string,
        name       TYPE string,
        requests   TYPE i,
        fresh      TYPE i,
        stale      TYPE i,
        work_items TYPE i,
        oldest_age TYPE i,
        avg_age    TYPE i,
        by_app     TYPE tt_app_cnt,
      END OF ty_agent,
      tt_agent TYPE STANDARD TABLE OF ty_agent WITH DEFAULT KEY,
      BEGIN OF ty_aging, app_id TYPE string, bucket TYPE string, requests TYPE i, END OF ty_aging,
      tt_aging TYPE STANDARD TABLE OF ty_aging WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_step,
        serial       TYPE i,
        level        TYPE string,
        role         TYPE string,
        role_type    TYPE string,
        dept         TYPE string,
        user         TYPE string,
        user_name    TYPE string,
        at           TYPE string,
        step_seconds TYPE i,
        status       TYPE string,
        status_text  TYPE string,
      END OF ty_step,
      tt_step TYPE STANDARD TABLE OF ty_step WITH DEFAULT KEY,
      BEGIN OF ty_pitem,
        wi_id       TYPE string,
        agent       TYPE string,
        agent_name  TYPE string,
        task        TYPE string,
        role_type   TYPE string,
        dept        TYPE string,
        since       TYPE string,
        age_seconds TYPE i,
        stale       TYPE abap_bool,
      END OF ty_pitem,
      tt_pitem TYPE STANDARD TABLE OF ty_pitem WITH DEFAULT KEY,
      BEGIN OF ty_phase, type TYPE string, state TYPE string, END OF ty_phase,
      tt_phase TYPE STANDARD TABLE OF ty_phase WITH DEFAULT KEY,
      BEGIN OF ty_wfd,
        gen_field  TYPE /inowits/wf_def-gen_field,
        gen_field2 TYPE /inowits/wf_def-gen_field2,
        gen_field3 TYPE /inowits/wf_def-gen_field3,
        type_lvl   TYPE /inowits/wf_def-type_lvl,
        lvl        TYPE /inowits/wf_def-lvl,
      END OF ty_wfd.

    CLASS-DATA gt_wfr   TYPE tt_wfr.
    CLASS-DATA gt_lvtxt TYPE STANDARD TABLE OF ty_count WITH DEFAULT KEY.

    CLASS-METHODS parse_req IMPORTING iv_payload TYPE string RETURNING VALUE(rs_req) TYPE ty_req.
    "Users the caller may see: admin all (restricted = false); others the SAP users of the actor e-mail
    CLASS-METHODS visible_users
      IMPORTING is_req TYPE ty_req
      EXPORTING ev_restricted TYPE abap_bool et_users TYPE ty_users.
    CLASS-METHODS users_of_mail IMPORTING iv_mail TYPE string RETURNING VALUE(rt_users) TYPE ty_users.
    CLASS-METHODS load_headers
      IMPORTING is_req TYPE ty_req it_users TYPE ty_users iv_restricted TYPE abap_bool iv_window TYPE abap_bool
      RETURNING VALUE(rt_hdr) TYPE tt_hdr.
    CLASS-METHODS load_pending
      IMPORTING is_req TYPE ty_req it_users TYPE ty_users iv_restricted TYPE abap_bool
      RETURNING VALUE(rt_pend) TYPE tt_pend.
    CLASS-METHODS build_rows IMPORTING it_hdr TYPE tt_hdr it_pend TYPE tt_pend RETURNING VALUE(rt_row) TYPE tt_irow.
    CLASS-METHODS add_levels CHANGING ct_row TYPE tt_irow.
    CLASS-METHODS load_roles.
    CLASS-METHODS dept_text IMPORTING iv_code TYPE clike RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS role_dept
      IMPORTING iv_app TYPE clike iv_gen_type TYPE clike iv_gf TYPE clike iv_gf2 TYPE clike iv_gf3 TYPE clike
                iv_lvl TYPE clike iv_role TYPE clike OPTIONAL iv_agent TYPE clike OPTIONAL
      RETURNING VALUE(rv_dept) TYPE string.
    CLASS-METHODS names_of IMPORTING it_users TYPE ty_users RETURNING VALUE(rt_name) TYPE tt_name.
    CLASS-METHODS name_of IMPORTING it_name TYPE tt_name iv_user TYPE clike RETURNING VALUE(rv_name) TYPE string.
    CLASS-METHODS container_level IMPORTING it_tops TYPE STANDARD TABLE RETURNING VALUE(rt_lv) TYPE string_table.
    CLASS-METHODS select_and_page
      IMPORTING is_req TYPE ty_req it_users TYPE ty_users iv_restricted TYPE abap_bool
      RETURNING VALUE(rv_json) TYPE string.

    CLASS-METHODS op_meta     IMPORTING is_req TYPE ty_req RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_overview IMPORTING is_req TYPE ty_req RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_detail   IMPORTING is_req TYPE ty_req RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS op_changes  IMPORTING is_req TYPE ty_req iv_items TYPE abap_bool RETURNING VALUE(rv_json) TYPE string.

    CLASS-METHODS app_label IMPORTING iv_app TYPE clike RETURNING VALUE(rv_label) TYPE string.
    CLASS-METHODS app_group IMPORTING iv_app TYPE clike RETURNING VALUE(rv_group) TYPE string.
    CLASS-METHODS status_text IMPORTING iv_status TYPE clike RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS flag_label IMPORTING iv_flag TYPE clike RETURNING VALUE(rv_text) TYPE string.
    CLASS-METHODS task_type IMPORTING iv_text TYPE clike RETURNING VALUE(rv_type) TYPE string.
    CLASS-METHODS task_dept IMPORTING iv_text TYPE clike RETURNING VALUE(rv_dept) TYPE string.
    CLASS-METHODS bucket_of IMPORTING iv_age TYPE i RETURNING VALUE(rv_bucket) TYPE string.
    CLASS-METHODS iso IMPORTING iv_d TYPE d iv_t TYPE t OPTIONAL RETURNING VALUE(rv_iso) TYPE string.
    CLASS-METHODS secs_between
      IMPORTING iv_d1 TYPE d iv_t1 TYPE t iv_d2 TYPE d iv_t2 TYPE t RETURNING VALUE(rv_s) TYPE i.
    CLASS-METHODS to_date IMPORTING iv_iso TYPE string RETURNING VALUE(rv_d) TYPE d.
    CLASS-METHODS ok_json IMPORTING ig_data TYPE any RETURNING VALUE(rv_json) TYPE string.
    CLASS-METHODS strip_zeros IMPORTING iv_val TYPE clike RETURNING VALUE(rv_val) TYPE string.
    CLASS-METHODS join_list IMPORTING it_list TYPE string_table RETURNING VALUE(rv_text) TYPE string.
ENDCLASS.



CLASS ZCL_MM_MDM_ADM_DASH IMPLEMENTATION.

  METHOD run.
    TRY.
        DATA(ls_req) = parse_req( iv_payload ).
        IF ls_req-actor IS INITIAL. ls_req-actor = iv_actor. ENDIF.
        CASE to_lower( CONV string( iv_op ) ).
          WHEN 'meta'.        rv_json = op_meta( ls_req ).
          WHEN 'overview'.    rv_json = op_overview( ls_req ).
          WHEN 'list'.
            visible_users( EXPORTING is_req = ls_req IMPORTING ev_restricted = DATA(lv_res) et_users = DATA(lt_users) ).
            rv_json = select_and_page( is_req = ls_req it_users = lt_users iv_restricted = lv_res ).
          WHEN 'detail'.      rv_json = op_detail( ls_req ).
          WHEN 'changes'.     rv_json = op_changes( is_req = ls_req iv_items = abap_false ).
          WHEN 'changeitems'. rv_json = op_changes( is_req = ls_req iv_items = abap_true ).
          WHEN OTHERS.        rv_json = zcl_mm_mdm_admin=>error_json( |Operation { iv_op } is not known| ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx).
        rv_json = zcl_mm_mdm_admin=>error_json( lx->get_text( ) ).
    ENDTRY.
  ENDMETHOD.


  METHOD parse_req.
    IF iv_payload IS INITIAL. RETURN. ENDIF.
    /ui2/cl_json=>deserialize( EXPORTING json = iv_payload pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = rs_req ).
  ENDMETHOD.


  METHOD ok_json.
    DATA(lv_data) = /ui2/cl_json=>serialize( data = ig_data pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
    rv_json = `{"ok":true,"data":` && lv_data && `}`.
  ENDMETHOD.


  METHOD users_of_mail.
    DATA(lv_mail) = condense( to_lower( iv_mail ) ).
    IF lv_mail IS INITIAL. RETURN. ENDIF.
    DATA lr_mail TYPE RANGE OF ad_smtpadr.
    lr_mail = VALUE #( sign = 'I' option = 'EQ' ( low = CONV #( lv_mail ) ) ( low = CONV #( to_upper( lv_mail ) ) ) ).
    SELECT u~bname FROM usr21 AS u
      INNER JOIN adr6 AS a ON a~addrnumber = u~addrnumber AND a~persnumber = u~persnumber
      WHERE a~smtp_addr IN @lr_mail
      INTO TABLE @rt_users.
    SORT rt_users. DELETE ADJACENT DUPLICATES FROM rt_users.
  ENDMETHOD.


  METHOD visible_users.
    CLEAR et_users.
    IF is_req-is_admin = abap_true.
      ev_restricted = abap_false.
      RETURN.
    ENDIF.
    ev_restricted = abap_true.
    et_users = users_of_mail( is_req-actor ).
  ENDMETHOD.


  METHOD to_date.
    IF strlen( iv_iso ) >= 10 AND iv_iso(4) CO '0123456789' AND iv_iso+5(2) CO '0123456789' AND iv_iso+8(2) CO '0123456789'.
      rv_d = iv_iso(4) && iv_iso+5(2) && iv_iso+8(2).
    ENDIF.
  ENDMETHOD.


  METHOD iso.
    IF iv_d IS INITIAL. RETURN. ENDIF.
    rv_iso = |{ iv_d(4) }-{ iv_d+4(2) }-{ iv_d+6(2) }|.
    IF iv_t IS SUPPLIED.
      rv_iso = rv_iso && |T{ iv_t(2) }:{ iv_t+2(2) }:{ iv_t+4(2) }|.
    ENDIF.
  ENDMETHOD.


  METHOD secs_between.
    DATA(lv_s1) = CONV i( iv_t1(2) ) * 3600 + CONV i( iv_t1+2(2) ) * 60 + CONV i( iv_t1+4(2) ).
    DATA(lv_s2) = CONV i( iv_t2(2) ) * 3600 + CONV i( iv_t2+2(2) ) * 60 + CONV i( iv_t2+4(2) ).
    rv_s = ( iv_d2 - iv_d1 ) * 86400 + lv_s2 - lv_s1.
  ENDMETHOD.


  METHOD strip_zeros.
    rv_val = iv_val.
    SHIFT rv_val LEFT DELETING LEADING '0'.
    CONDENSE rv_val.
  ENDMETHOD.


  METHOD join_list.
    LOOP AT it_list INTO DATA(lv).
      rv_text = COND #( WHEN rv_text IS INITIAL THEN lv ELSE rv_text && `, ` && lv ).
    ENDLOOP.
  ENDMETHOD.


  METHOD bucket_of.
    rv_bucket = COND #(
      WHEN iv_age < 86400 THEN 'd0_1'
      WHEN iv_age < 2 * 86400 THEN 'd1_2'
      WHEN iv_age < 7 * 86400 THEN 'd2_7'
      WHEN iv_age < 30 * 86400 THEN 'd7_30'
      WHEN iv_age <= gc_stale_days * 86400 THEN 'd30_90'
      WHEN iv_age <= 365 * 86400 THEN 's90_365'
      ELSE 's365p' ).
  ENDMETHOD.


  METHOD task_type.
    DATA(lv) = to_upper( CONV string( iv_text ) ).
    rv_type = COND #( WHEN lv CS 'INITIATOR' THEN 'Initiator' WHEN lv CS 'APPROVER' THEN 'Approver' ELSE 'Reviewer' ).
  ENDMETHOD.


  METHOD task_dept.
    DATA(lv) = CONV string( iv_text ).
    FIND ' - ' IN lv MATCH OFFSET DATA(lv_off).
    IF sy-subrc = 0.
      rv_dept = condense( substring( val = lv off = lv_off + 3 ) ).
    ENDIF.
  ENDMETHOD.


  METHOD status_text.
    rv_text = SWITCH #( iv_status
      WHEN '00' THEN 'Saved as draft'
      WHEN '01' THEN 'Requested'
      WHEN '02' THEN 'In progress'
      WHEN '03' THEN 'Completed'
      WHEN '04' THEN 'Sent back'
      WHEN '05' THEN 'Rejected'
      ELSE |Status { iv_status }| ).
  ENDMETHOD.


  METHOD flag_label.
    rv_text = SWITCH #( iv_flag
      WHEN 'WF_ERROR'             THEN 'Open request, workflow in error'
      WHEN 'WF_CANCELLED'         THEN 'Open request, workflow cancelled'
      WHEN 'WF_COMPLETED'         THEN 'Open request, but workflow already completed'
      WHEN 'NO_PENDING_ITEM'      THEN 'Open request, workflow running but no work item waiting'
      WHEN 'NO_WORKFLOW'          THEN 'Open request without a workflow'
      WHEN 'DONE_BUT_RUNNING'     THEN 'Completed status, workflow still running'
      WHEN 'DONE_WF_ERROR'        THEN 'Completed status, workflow in error'
      WHEN 'REJECTED_BUT_RUNNING' THEN 'Rejected status, workflow still running'
      WHEN 'DRAFT_BUT_RUNNING'    THEN 'Draft status, workflow running'
      WHEN 'WF_OTHER'             THEN 'Workflow in an unexpected state'
      ELSE iv_flag ).
  ENDMETHOD.


  METHOD app_label.
    rv_label = SWITCH #( iv_app
      WHEN 'MC' THEN 'Material Creation' WHEN 'MX' THEN 'Material Change' WHEN 'ME' THEN 'Material Extension'
      WHEN 'BC' THEN 'BOM Creation' WHEN 'BX' THEN 'BOM Change' WHEN 'BP' THEN 'BOM Plant Copy'
      WHEN 'VC' THEN 'Vendor Creation' WHEN 'VX' THEN 'Vendor Change' WHEN 'CC' THEN 'Customer Creation' WHEN 'CX' THEN 'Customer Change'
      WHEN 'CE' THEN 'Customer Extension' WHEN 'VE' THEN 'Vendor Extension' WHEN 'VB' THEN 'Vendor Block' WHEN 'VU' THEN 'Vendor Unblock'
      WHEN 'CB' THEN 'Customer Block' WHEN 'CU' THEN 'Customer UnBlock' WHEN 'MB' THEN 'Material Block' WHEN 'MU' THEN 'Material Unblock'
      WHEN 'CP' THEN 'Customer Partner Extension' WHEN 'VM' THEN 'Vendor Mass Extension' WHEN 'CM' THEN 'Customer Mass Extension'
      WHEN 'MM' THEN 'Material Mass Extension' WHEN 'HC' THEN 'Employee Creation' WHEN 'HO' THEN 'HR Promotion Process'
      WHEN 'HX' THEN 'HR Confirmation Process' WHEN 'HT' THEN 'HR Transfer Process' WHEN 'PRM' THEN 'Pricing Master'
      WHEN 'PC' THEN 'PIR Creation Process' WHEN 'PX' THEN 'PIR Change Process' WHEN 'PM' THEN 'PIR Mass Creation Process'
      WHEN 'CMC' THEN 'Contract Creation Process' WHEN 'CMX' THEN 'Contract Change Process' WHEN 'CTM' THEN 'Contract Mass Creation Process'
      WHEN 'AC' THEN 'Asset Master Creation Process' WHEN 'AX' THEN 'Asset Master Chnage Process'
      WHEN 'SIR' THEN 'SIR Creation' WHEN 'SIX' THEN 'SIR Change' WHEN 'CPC' THEN 'PCC Creation' WHEN 'CPX' THEN 'PCC Change'
      WHEN 'CCI' THEN 'CCM Creation' WHEN 'CCX' THEN 'CCM Change' WHEN 'EQC' THEN 'Equipment Creation' WHEN 'EQX' THEN 'Equipment Change'
      WHEN 'UC' THEN 'User Maintainance Create' WHEN 'UX' THEN 'User Maintainance Change' WHEN 'HCX' THEN 'HR Change Details'
      WHEN 'AMX' THEN 'Asset Master Mass Change Process' WHEN 'QMX' THEN 'Quality Mass Change' WHEN 'MBX' THEN 'BOM Mass Change'
      WHEN 'GA' THEN 'GL Account Additional Function' WHEN 'SLC' THEN 'SL Creation' WHEN 'SLX' THEN 'SL Change' WHEN 'SLD' THEN 'SL Delete'
      WHEN 'QAC' THEN 'QA Creation' WHEN 'QAX' THEN 'QA Change' WHEN 'QAD' THEN 'QA Delete' WHEN 'SP' THEN 'Separation Process'
      WHEN 'SM' THEN 'Service Creation' WHEN 'SX' THEN 'Service Change' WHEN 'REC' THEN 'Recipe Creation' WHEN 'REX' THEN 'Recipe Change'
      WHEN 'QC' THEN 'QIR Creation' WHEN 'QX' THEN 'QIR Change' WHEN 'RC' THEN 'Routing Creation' WHEN 'RX' THEN 'Routing Change'
      WHEN 'EPC' THEN 'Probation Confirmation Creation' WHEN 'EPX' THEN 'Probation Confirmation Change'
      WHEN 'PVC' THEN 'Production version Creation' WHEN 'PVX' THEN 'Production version Change'
      WHEN 'GC' THEN 'GL Account Creation' WHEN 'GX' THEN 'GL Account Extension' WHEN 'GE' THEN 'GL Account Change'
      WHEN 'RRC' THEN 'Rate Routing Creation' WHEN 'RRX' THEN 'Rate Routing Change'
      WHEN 'QIC' THEN 'Inspection Plan Creation' WHEN 'QIX' THEN 'Inspection Plan Change'
      WHEN 'PCC' THEN 'Profit Center Create' WHEN 'PCX' THEN 'Profit Center Change'
      WHEN 'ICC' THEN 'Inspection characteristics Creation' WHEN 'ICX' THEN 'Inspection characteristics Change'
      WHEN 'MMC' THEN 'Material Mass Creation' WHEN 'MMX' THEN 'Material Mass Change' WHEN 'MVC' THEN 'Vendor Mass Creation'
      WHEN 'MCC' THEN 'Customer Mass Creation' WHEN 'MAC' THEN 'Asset Mass Creation' WHEN 'MSC' THEN 'Service Mass Creation'
      WHEN 'MBC' THEN 'BOM Mass Creation' WHEN 'RXX' THEN 'Routing Mass Change'
      ELSE |app { iv_app }| ).
  ENDMETHOD.


  METHOD app_group.
    rv_group = SWITCH #( iv_app
      WHEN 'MC' OR 'MX' OR 'ME' OR 'MMC' OR 'MMX' OR 'MM' OR 'MB' OR 'MU' THEN 'Material'
      WHEN 'VC' OR 'VX' OR 'VE' OR 'VM' OR 'VB' OR 'VU' OR 'MVC' THEN 'Vendor'
      WHEN 'CC' OR 'CX' OR 'CE' OR 'CP' OR 'CM' OR 'CB' OR 'CU' OR 'MCC' THEN 'Customer'
      WHEN 'BC' OR 'BX' OR 'BP' OR 'MBC' OR 'MBX' THEN 'BOM'
      WHEN 'PC' OR 'PX' OR 'PM' OR 'PXX' THEN 'PIR'
      ELSE 'Other' ).
  ENDMETHOD.


  METHOD load_roles.
    IF gt_wfr IS INITIAL.
      SELECT app_id, gen_type, gen_field, gen_field2, gen_field3, lvl, role, agent, level_text
        FROM /inowits/wf_role WHERE active = 'X' INTO CORRESPONDING FIELDS OF TABLE @gt_wfr.
    ENDIF.
    IF gt_lvtxt IS INITIAL.
      SELECT domvalue_l AS code, ddtext AS label FROM dd07t
        WHERE domname = '/INOWITS/LEVEL_TEXT' AND ddlanguage = 'E' AND as4local = 'A'
        INTO CORRESPONDING FIELDS OF TABLE @gt_lvtxt.
    ENDIF.
  ENDMETHOD.


  METHOD dept_text.
    IF iv_code IS INITIAL. RETURN. ENDIF.
    READ TABLE gt_lvtxt INTO DATA(ls) WITH KEY code = iv_code.
    rv_text = COND #( WHEN sy-subrc = 0 THEN ls-label ELSE CONV string( iv_code ) ).
  ENDMETHOD.


  METHOD role_dept.
    DATA lv_best TYPE i VALUE -1.
    LOOP AT gt_wfr ASSIGNING FIELD-SYMBOL(<r>)
         WHERE app_id = iv_app AND gen_type = iv_gen_type AND lvl = iv_lvl.
      IF iv_role IS NOT INITIAL AND CONV i( <r>-role ) <> CONV i( iv_role ). CONTINUE. ENDIF.
      DATA(lv_score) = 0.
      IF iv_agent IS NOT INITIAL AND <r>-agent = iv_agent. lv_score = lv_score + 4. ENDIF.
      IF <r>-gen_field2 = iv_gf2 AND iv_gf2 IS NOT INITIAL. lv_score = lv_score + 2. ENDIF.
      IF <r>-gen_field3 = iv_gf3 AND iv_gf3 IS NOT INITIAL. lv_score = lv_score + 1. ENDIF.
      IF <r>-gen_field = iv_gf AND iv_gf IS NOT INITIAL. lv_score = lv_score + 1. ENDIF.
      IF lv_score > lv_best.
        lv_best = lv_score.
        rv_dept = dept_text( <r>-level_text ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD names_of.
    DATA lt_u TYPE ty_users.
    lt_u = it_users.
    SORT lt_u. DELETE ADJACENT DUPLICATES FROM lt_u. DELETE lt_u WHERE table_line IS INITIAL.
    IF lt_u IS INITIAL. RETURN. ENDIF.
    SELECT bname, name_text FROM v_usr_name FOR ALL ENTRIES IN @lt_u WHERE bname = @lt_u-table_line
      INTO CORRESPONDING FIELDS OF TABLE @rt_name.
  ENDMETHOD.


  METHOD name_of.
    READ TABLE it_name INTO DATA(ls) WITH TABLE KEY bname = iv_user.
    rv_name = COND #( WHEN sy-subrc = 0 AND ls-name_text IS NOT INITIAL THEN ls-name_text ELSE CONV string( iv_user ) ).
  ENDMETHOD.


  METHOD load_headers.
    DATA: lr_tid TYPE RANGE OF /inowits/m_trans-transid,
          lr_app TYPE RANGE OF /inowits/m_trans-app_id,
          lr_sta TYPE RANGE OF /inowits/m_trans-status,
          lr_usr TYPE RANGE OF /inowits/m_trans-user_id,
          lr_mt  TYPE RANGE OF /inowits/m_trans-gen_type,
          lr_pl  TYPE RANGE OF /inowits/m_trans-gen_field,
          lr_g2  TYPE RANGE OF /inowits/m_trans-gen_field2,
          lr_dup TYPE RANGE OF /inowits/m_trans-duplicate,
          lr_dat TYPE RANGE OF /inowits/m_trans-end_date.

    IF is_req-trans_id IS NOT INITIAL AND is_req-trans_id CO ' 0123456789'.
      lr_tid = VALUE #( ( sign = 'I' option = 'EQ' low = |{ CONV numc10( is_req-trans_id ) }| ) ).
    ELSEIF is_req-trans_id IS NOT INITIAL.
      lr_tid = VALUE #( ( sign = 'I' option = 'EQ' low = '9999999999' ) ).     "invalid id: nothing
    ENDIF.
    LOOP AT is_req-apps INTO DATA(lv_app). APPEND VALUE #( sign = 'I' option = 'EQ' low = to_upper( lv_app ) ) TO lr_app. ENDLOOP.
    IF is_req-status IS NOT INITIAL AND is_req-status <> '06'.
      lr_sta = VALUE #( ( sign = 'I' option = 'EQ' low = is_req-status ) ).
    ENDIF.
    CASE is_req-status_group.
      WHEN 'inprogress'.     "as the old search: status 02 means requested + in progress + sent back
        lr_sta = VALUE #( sign = 'I' option = 'EQ' ( low = '01' ) ( low = '02' ) ( low = '04' ) ).
      WHEN 'open'.
        lr_sta = VALUE #( sign = 'I' option = 'EQ' ( low = '01' ) ( low = '02' ) ( low = '04' ) ).
    ENDCASE.
    IF iv_restricted = abap_true.
      IF it_users IS INITIAL.
        lr_usr = VALUE #( ( sign = 'I' option = 'EQ' low = '#NOBODY#' ) ).
      ELSE.
        LOOP AT it_users INTO DATA(lv_u). APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_u ) TO lr_usr. ENDLOOP.
      ENDIF.
    ELSEIF is_req-user IS NOT INITIAL.
      IF is_req-user CS '@'.
        DATA(lt_mu) = users_of_mail( is_req-user ).
        IF lt_mu IS INITIAL.
          lr_usr = VALUE #( ( sign = 'I' option = 'EQ' low = '#NOBODY#' ) ).
        ELSE.
          LOOP AT lt_mu INTO lv_u. APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_u ) TO lr_usr. ENDLOOP.
        ENDIF.
      ELSE.
        lr_usr = VALUE #( ( sign = 'I' option = 'EQ' low = to_upper( is_req-user ) ) ).
      ENDIF.
    ENDIF.
    IF is_req-mtype IS NOT INITIAL. lr_mt = VALUE #( ( sign = 'I' option = 'EQ' low = to_upper( is_req-mtype ) ) ). ENDIF.
    IF is_req-plant IS NOT INITIAL. lr_pl = VALUE #( ( sign = 'I' option = 'EQ' low = to_upper( is_req-plant ) ) ). ENDIF.
    IF is_req-gen_field2 IS NOT INITIAL. lr_g2 = VALUE #( ( sign = 'I' option = 'EQ' low = to_upper( is_req-gen_field2 ) ) ). ENDIF.
    IF is_req-duplicate = 'Y'. lr_dup = VALUE #( ( sign = 'I' option = 'EQ' low = 'X' ) ). ENDIF.
    IF is_req-duplicate = 'N'. lr_dup = VALUE #( ( sign = 'I' option = 'EQ' low = ' ' ) ). ENDIF.
    IF iv_window = abap_true AND is_req-all_dates = abap_false.
      DATA(lv_from) = to_date( is_req-date_from ).
      DATA(lv_to) = to_date( is_req-date_to ).
      IF lv_to IS INITIAL. lv_to = sy-datum. ENDIF.
      IF lv_from IS INITIAL. lv_from = lv_to - 30. ENDIF.
      lr_dat = VALUE #( ( sign = 'I' option = 'BT' low = lv_from high = lv_to ) ).
    ENDIF.

    SELECT t~transid, t~app_id, t~obj_value, t~status, t~end_date AS created_d, t~end_time AS created_t, t~user_id, t~top_wi_id,
           t~duplicate, t~gen_type, t~gen_field, t~gen_field2, t~gen_field3, h~wi_stat AS wf_state
      FROM /inowits/m_trans AS t
      LEFT OUTER JOIN swwwihead AS h ON h~wi_id = t~top_wi_id
      WHERE t~transid IN @lr_tid AND t~app_id IN @lr_app AND t~status IN @lr_sta AND t~user_id IN @lr_usr
        AND t~gen_type IN @lr_mt AND t~gen_field IN @lr_pl AND t~gen_field2 IN @lr_g2 AND t~duplicate IN @lr_dup
        AND t~end_date IN @lr_dat
      INTO CORRESPONDING FIELDS OF TABLE @rt_hdr.
  ENDMETHOD.


  METHOD load_pending.
    DATA: lr_app TYPE RANGE OF /inowits/m_trans-app_id,
          lr_tid TYPE RANGE OF /inowits/m_trans-transid,
          lr_usr TYPE RANGE OF /inowits/m_trans-user_id.
    LOOP AT is_req-apps INTO DATA(lv_app). APPEND VALUE #( sign = 'I' option = 'EQ' low = to_upper( lv_app ) ) TO lr_app. ENDLOOP.
    IF is_req-trans_id IS NOT INITIAL AND is_req-trans_id CO ' 0123456789'.
      lr_tid = VALUE #( ( sign = 'I' option = 'EQ' low = |{ CONV numc10( is_req-trans_id ) }| ) ).
    ENDIF.
    IF iv_restricted = abap_true.
      IF it_users IS INITIAL.
        lr_usr = VALUE #( ( sign = 'I' option = 'EQ' low = '#NOBODY#' ) ).
      ELSE.
        LOOP AT it_users INTO DATA(lv_u). APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_u ) TO lr_usr. ENDLOOP.
      ENDIF.
    ENDIF.
    SELECT t~transid, w~wi_id, w~wi_cd AS since_d, w~wi_ct AS since_t, w~wi_rh_task AS task, w~wi_rhtext AS rhtext, u~user_id AS agent
      FROM /inowits/m_trans AS t
      INNER JOIN swwwihead AS w ON w~top_wi_id = t~top_wi_id
      LEFT OUTER JOIN swwuserwi AS u ON u~wi_id = w~wi_id
      WHERE t~transid IN @lr_tid AND t~app_id IN @lr_app AND t~user_id IN @lr_usr AND w~wi_stat = 'READY' AND w~wi_type = 'W'
      INTO CORRESPONDING FIELDS OF TABLE @rt_pend.
    SORT rt_pend BY transid since_d since_t wi_id agent.
  ENDMETHOD.


  METHOD build_rows.
    DATA lt_pend TYPE tt_pend.
    lt_pend = it_pend.
    SORT lt_pend BY transid since_d since_t wi_id agent.
    DATA(lv_now_d) = sy-datum.
    DATA(lv_now_t) = sy-uzeit.
    LOOP AT it_hdr ASSIGNING FIELD-SYMBOL(<h>).
      APPEND INITIAL LINE TO rt_row ASSIGNING FIELD-SYMBOL(<i>).
      <i>-r-trans_id = <h>-transid.
      <i>-r-app_id = <h>-app_id.
      <i>-r-app_text = app_label( <h>-app_id ).
      <i>-r-obj_value = strip_zeros( <h>-obj_value ).
      <i>-r-material_type = <h>-gen_type.
      <i>-r-plant = <h>-gen_field.
      <i>-r-status = <h>-status.
      <i>-r-status_text = status_text( <h>-status ).
      <i>-r-wf_state = <h>-wf_state.
      <i>-r-initiator = <h>-user_id.
      <i>-r-created = iso( iv_d = <h>-created_d iv_t = <h>-created_t ).
      <i>-r-duplicate = xsdbool( <h>-duplicate = 'X' ).
      <i>-r-top_wi_id = <h>-top_wi_id.
      IF <h>-app_id = 'MC' OR <h>-app_id = 'MX' OR <h>-app_id = 'ME'.
        <i>-r-route = |/master/material/requests/view?id={ <h>-transid }|.
      ENDIF.
      <i>-gen_field = <h>-gen_field. <i>-gen_f2 = <h>-gen_field2. <i>-gen_f3 = <h>-gen_field3.
      <i>-created_d = <h>-created_d. <i>-created_t = <h>-created_t.

      DATA(lv_n) = 0.
      DATA(lv_first_found) = abap_false.
      DATA lv_prev_wi TYPE swwwihead-wi_id.
      CLEAR lv_prev_wi.
      READ TABLE lt_pend TRANSPORTING NO FIELDS WITH KEY transid = <h>-transid BINARY SEARCH.
      IF sy-subrc = 0.
        DATA(lv_idx) = sy-tabix.
        LOOP AT lt_pend ASSIGNING FIELD-SYMBOL(<p>) FROM lv_idx.
          IF <p>-transid <> <h>-transid. EXIT. ENDIF.
          IF <p>-wi_id <> lv_prev_wi.
            lv_n = lv_n + 1.
            lv_prev_wi = <p>-wi_id.
            IF lv_first_found = abap_false.
              lv_first_found = abap_true.
              <i>-since_d = <p>-since_d. <i>-since_t = <p>-since_t. <i>-wi_first = <p>-wi_id.
              <i>-r-pending_type = task_type( <p>-rhtext ).
            ENDIF.
            IF <p>-since_d < <i>-since_d OR ( <p>-since_d = <i>-since_d AND <p>-since_t < <i>-since_t ).
              <i>-since_d = <p>-since_d. <i>-since_t = <p>-since_t.
            ENDIF.
            DATA(lv_dept) = task_dept( <p>-rhtext ).
            IF lv_dept IS NOT INITIAL AND NOT line_exists( <i>-dept_tab[ table_line = lv_dept ] ).
              APPEND lv_dept TO <i>-dept_tab.
            ENDIF.
          ENDIF.
          IF <p>-agent IS NOT INITIAL AND NOT line_exists( <i>-agent_tab[ table_line = <p>-agent ] ).
            APPEND CONV string( <p>-agent ) TO <i>-agent_tab.
          ENDIF.
        ENDLOOP.
      ENDIF.
      <i>-r-pending_items = lv_n.
      <i>-r-pending_agents = join_list( <i>-agent_tab ).
      <i>-r-pending_dept = join_list( <i>-dept_tab ).
      IF lv_n > 0.
        <i>-r-pending_since = iso( iv_d = <i>-since_d iv_t = <i>-since_t ).
        <i>-r-age_seconds = nmax( val1 = 0 val2 = secs_between( iv_d1 = <i>-since_d iv_t1 = <i>-since_t iv_d2 = lv_now_d iv_t2 = lv_now_t ) ).
        <i>-r-age_bucket = bucket_of( <i>-r-age_seconds ).
        <i>-r-stale = xsdbool( <i>-r-age_seconds > gc_stale_days * 86400 ).
      ENDIF.

      DATA(lv_open_status) = xsdbool( <h>-status = '01' OR <h>-status = '02' OR <h>-status = '04' ).
      <i>-r-is_open = xsdbool( lv_open_status = abap_true AND <h>-wf_state = 'STARTED' AND lv_n > 0 ).
      "Status and workflow disagree: reported, never repaired
      IF lv_open_status = abap_true.
        CASE <h>-wf_state.
          WHEN 'ERROR'.     APPEND 'WF_ERROR' TO <i>-r-flags.
          WHEN 'CANCELLED'. APPEND 'WF_CANCELLED' TO <i>-r-flags.
          WHEN 'COMPLETED'. APPEND 'WF_COMPLETED' TO <i>-r-flags.
          WHEN 'STARTED'.   IF lv_n = 0. APPEND 'NO_PENDING_ITEM' TO <i>-r-flags. ENDIF.
          WHEN ''.          APPEND 'NO_WORKFLOW' TO <i>-r-flags.
          WHEN OTHERS.      APPEND 'WF_OTHER' TO <i>-r-flags.
        ENDCASE.
      ELSEIF <h>-status = '03'.
        IF <h>-wf_state = 'STARTED'. APPEND 'DONE_BUT_RUNNING' TO <i>-r-flags. ENDIF.
        IF <h>-wf_state = 'ERROR'.   APPEND 'DONE_WF_ERROR' TO <i>-r-flags. ENDIF.
      ELSEIF <h>-status = '05' AND <h>-wf_state = 'STARTED'.
        APPEND 'REJECTED_BUT_RUNNING' TO <i>-r-flags.
      ELSEIF <h>-status = '00' AND <h>-wf_state = 'STARTED'.
        APPEND 'DRAFT_BUT_RUNNING' TO <i>-r-flags.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD container_level.
    TYPES: BEGIN OF ty_ch, wi_id TYPE swwcntp0-wi_id, tabix TYPE swwcntp0-tabix, length TYPE swwcntp0-length, data TYPE swwcntp0-data, END OF ty_ch.
    DATA lt_tops TYPE STANDARD TABLE OF swwcntp0-wi_id WITH DEFAULT KEY.
    DATA lt_ch TYPE STANDARD TABLE OF ty_ch WITH DEFAULT KEY.
    FIELD-SYMBOLS <t> TYPE any.
    LOOP AT it_tops ASSIGNING <t>.
      APPEND CONV swwcntp0-wi_id( <t> ) TO lt_tops.
    ENDLOOP.
    SORT lt_tops. DELETE ADJACENT DUPLICATES FROM lt_tops. DELETE lt_tops WHERE table_line IS INITIAL.
    IF lt_tops IS INITIAL. RETURN. ENDIF.
    SELECT wi_id, tabix, length, data FROM swwcntp0 FOR ALL ENTRIES IN @lt_tops WHERE wi_id = @lt_tops-table_line
      INTO CORRESPONDING FIELDS OF TABLE @lt_ch.
    SORT lt_ch BY wi_id tabix.
    DATA lv_x TYPE xstring.
    LOOP AT lt_ch ASSIGNING FIELD-SYMBOL(<c>).
      AT NEW wi_id.
        CLEAR lv_x.
      ENDAT.
      IF <c>-length > 0.
        DATA(lv_len) = nmin( val1 = CONV i( <c>-length ) val2 = 1024 ).
        lv_x = lv_x && <c>-data(lv_len).
      ENDIF.
      AT END OF wi_id.
        DATA(lv_xml) = cl_abap_codepage=>convert_from( source = lv_x codepage = 'UTF-8' ).
        FIND '<NAME>LEVEL</NAME>' IN lv_xml MATCH OFFSET DATA(lv_o1).
        IF sy-subrc = 0.
          DATA(lv_rest) = substring( val = lv_xml off = lv_o1 ).
          FIND '<VALUE href="#' IN lv_rest MATCH OFFSET DATA(lv_o2) MATCH LENGTH DATA(lv_l2).
          IF sy-subrc = 0.
            DATA(lv_rest2) = substring( val = lv_rest off = lv_o2 + lv_l2 ).
            FIND '"' IN lv_rest2 MATCH OFFSET DATA(lv_o3).
            IF sy-subrc = 0.
              DATA(lv_ref) = substring( val = lv_rest2 len = lv_o3 ).
              DATA(lv_key) = |id="{ lv_ref }">|.
              FIND lv_key IN lv_xml MATCH OFFSET DATA(lv_o4) MATCH LENGTH DATA(lv_l4).
              IF sy-subrc = 0.
                DATA(lv_val) = substring( val = lv_xml off = lv_o4 + lv_l4 ).
                FIND '<' IN lv_val MATCH OFFSET DATA(lv_o5).
                IF sy-subrc = 0.
                  APPEND |{ <c>-wi_id }={ substring( val = lv_val len = lv_o5 ) }| TO rt_lv.
                ENDIF.
              ENDIF.
            ENDIF.
          ENDIF.
        ENDIF.
      ENDAT.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_levels.
    DATA lt_tops TYPE STANDARD TABLE OF swwwihead-wi_id WITH DEFAULT KEY.
    LOOP AT ct_row ASSIGNING FIELD-SYMBOL(<i>) WHERE r-pending_items > 0.
      APPEND CONV swwwihead-wi_id( <i>-r-top_wi_id ) TO lt_tops.
    ENDLOOP.
    IF lt_tops IS INITIAL. RETURN. ENDIF.
    DATA(lt_lv) = container_level( lt_tops ).
    load_roles( ).
    LOOP AT ct_row ASSIGNING <i> WHERE r-pending_items > 0.
      DATA(lv_key) = |{ <i>-r-top_wi_id }=|.
      LOOP AT lt_lv INTO DATA(lv_e) WHERE table_line CP |{ lv_key }*|.
        <i>-r-pending_level = substring( val = lv_e off = strlen( lv_key ) ).
        EXIT.
      ENDLOOP.
      IF <i>-r-pending_dept IS INITIAL AND <i>-r-pending_level IS NOT INITIAL AND <i>-r-pending_type <> 'Initiator'.
        DATA(lt_dept) = VALUE string_table( ).
        LOOP AT <i>-agent_tab INTO DATA(lv_ag).
          DATA(lv_dep) = role_dept( iv_app = <i>-r-app_id iv_gen_type = <i>-r-material_type iv_gf = <i>-gen_field iv_gf2 = <i>-gen_f2
                                    iv_gf3 = <i>-gen_f3 iv_lvl = <i>-r-pending_level iv_agent = lv_ag ).
          IF lv_dep IS NOT INITIAL AND NOT line_exists( lt_dept[ table_line = lv_dep ] ). APPEND lv_dep TO lt_dept. ENDIF.
        ENDLOOP.
        <i>-dept_tab = lt_dept.
        <i>-r-pending_dept = join_list( lt_dept ).
      ENDIF.
      IF <i>-r-pending_type = 'Initiator' AND <i>-r-pending_level IS INITIAL. <i>-r-pending_level = 'L0'. ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD op_meta.
    TYPES: BEGIN OF ty_app, app_id TYPE string, label TYPE string, group TYPE string, first_class TYPE abap_bool, known TYPE abap_bool, total TYPE i, END OF ty_app.
    TYPES: BEGIN OF ty_flag, code TYPE string, label TYPE string, END OF ty_flag.
    TYPES: BEGIN OF ty_bkt, code TYPE string, label TYPE string, stale TYPE abap_bool, END OF ty_bkt.
    TYPES: BEGIN OF ty_scope, admin TYPE abap_bool, restricted TYPE abap_bool, users TYPE ty_users, message TYPE string, END OF ty_scope.
    TYPES: BEGIN OF ty_meta,
             apps TYPE STANDARD TABLE OF ty_app WITH DEFAULT KEY,
             statuses TYPE tt_count,
             flags TYPE STANDARD TABLE OF ty_flag WITH DEFAULT KEY,
             buckets TYPE STANDARD TABLE OF ty_bkt WITH DEFAULT KEY,
             stale_days TYPE i,
             scope TYPE ty_scope,
             now TYPE string,
           END OF ty_meta.
    DATA ls_meta TYPE ty_meta.
    visible_users( EXPORTING is_req = is_req IMPORTING ev_restricted = DATA(lv_res) et_users = DATA(lt_users) ).
    DATA: lr_usr TYPE RANGE OF /inowits/m_trans-user_id.
    IF lv_res = abap_true.
      IF lt_users IS INITIAL. lr_usr = VALUE #( ( sign = 'I' option = 'EQ' low = '#NOBODY#' ) ).
      ELSE. LOOP AT lt_users INTO DATA(lv_u). APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_u ) TO lr_usr. ENDLOOP. ENDIF.
    ENDIF.
    SELECT app_id, COUNT( * ) AS n FROM /inowits/m_trans WHERE user_id IN @lr_usr GROUP BY app_id INTO TABLE @DATA(lt_cnt).
    LOOP AT lt_cnt INTO DATA(ls_c).
      APPEND VALUE #( app_id = ls_c-app_id label = app_label( ls_c-app_id ) group = app_group( ls_c-app_id ) total = ls_c-n
                      first_class = xsdbool( ls_c-app_id = 'MC' OR ls_c-app_id = 'MX' OR ls_c-app_id = 'ME' )
                      known = xsdbool( app_label( ls_c-app_id ) <> |app { ls_c-app_id }| ) ) TO ls_meta-apps.
    ENDLOOP.
    SORT ls_meta-apps BY group first_class DESCENDING app_id.
    DO 6 TIMES.
      DATA(lv_code) = |0{ sy-index - 1 }|.
      APPEND VALUE #( code = lv_code label = status_text( lv_code ) ) TO ls_meta-statuses.
    ENDDO.
    LOOP AT VALUE string_table( ( `WF_ERROR` ) ( `WF_CANCELLED` ) ( `WF_COMPLETED` ) ( `NO_PENDING_ITEM` ) ( `NO_WORKFLOW` )
                                ( `DONE_BUT_RUNNING` ) ( `DONE_WF_ERROR` ) ( `REJECTED_BUT_RUNNING` ) ( `DRAFT_BUT_RUNNING` ) ( `WF_OTHER` ) ) INTO DATA(lv_f).
      APPEND VALUE #( code = lv_f label = flag_label( lv_f ) ) TO ls_meta-flags.
    ENDLOOP.
    ls_meta-buckets = VALUE #( ( code = 'd0_1' label = 'Under 1 day' ) ( code = 'd1_2' label = '1 to 2 days' ) ( code = 'd2_7' label = '2 to 7 days' )
                               ( code = 'd7_30' label = '7 to 30 days' ) ( code = 'd30_90' label = '30 to 90 days' )
                               ( code = 's90_365' label = '90 days to 1 year (stale)' stale = abap_true )
                               ( code = 's365p' label = 'Over 1 year (stale)' stale = abap_true ) ).
    ls_meta-stale_days = gc_stale_days.
    ls_meta-scope = VALUE #( admin = is_req-is_admin restricted = lv_res users = lt_users ).
    IF lv_res = abap_true.
      ls_meta-scope-message = COND #( WHEN lt_users IS INITIAL THEN |No SAP user is linked to { is_req-actor }, so no requests can be shown.|
                                      ELSE 'You see the requests you initiated.' ).
    ELSE.
      ls_meta-scope-message = 'You see the requests of all users.'.
    ENDIF.
    ls_meta-now = iso( iv_d = sy-datum iv_t = sy-uzeit ).
    rv_json = ok_json( ls_meta ).
  ENDMETHOD.


  METHOD op_overview.
    TYPES: BEGIN OF ty_win,
             date_from TYPE string, date_to TYPE string,
             total TYPE i, by_status TYPE tt_count, in_progress_old TYPE i, completed TYPE i, duplicates TYPE i,
             avg_tat_seconds TYPE i, median_tat_seconds TYPE i, tat_samples TYPE i, by_app TYPE tt_app_cnt,
           END OF ty_win.
    TYPES: BEGIN OF ty_now,
             open_real TYPE i, open_fresh TYPE i, open_stale TYPE i, broken TYPE i, by_flag TYPE tt_count, by_status_all TYPE tt_count,
           END OF ty_now.
    TYPES: BEGIN OF ty_ov,
             window TYPE ty_win, now TYPE ty_now, stages TYPE tt_stage, agents TYPE tt_agent, agent_count TYPE i, aging TYPE tt_aging,
             scope TYPE string, restricted TYPE abap_bool, generated TYPE string,
           END OF ty_ov.
    DATA ls_ov TYPE ty_ov.
    visible_users( EXPORTING is_req = is_req IMPORTING ev_restricted = DATA(lv_res) et_users = DATA(lt_users) ).
    DATA(lt_hdr) = load_headers( is_req = is_req it_users = lt_users iv_restricted = lv_res iv_window = abap_false ).
    DATA(lt_pend) = load_pending( is_req = is_req it_users = lt_users iv_restricted = lv_res ).
    DATA(lt_row) = build_rows( it_hdr = lt_hdr it_pend = lt_pend ).
    add_levels( CHANGING ct_row = lt_row ).

    "window = creation date of the T-ID (as the old board's start date range), default last 30 days
    DATA(lv_to) = to_date( is_req-date_to ). IF lv_to IS INITIAL. lv_to = sy-datum. ENDIF.
    DATA(lv_from) = to_date( is_req-date_from ). IF lv_from IS INITIAL. lv_from = lv_to - 30. ENDIF.
    IF is_req-all_dates = abap_false.
      ls_ov-window-date_from = iso( lv_from ). ls_ov-window-date_to = iso( lv_to ).
    ENDIF.
    DATA lt_done TYPE STANDARD TABLE OF /inowits/m_trans-transid WITH DEFAULT KEY.
    DATA: lt_st TYPE STANDARD TABLE OF ty_count WITH DEFAULT KEY, lt_sa TYPE STANDARD TABLE OF ty_count WITH DEFAULT KEY.
    DATA lt_ap TYPE tt_app_cnt.
    LOOP AT lt_row ASSIGNING FIELD-SYMBOL(<i>).
      "all-time status picture and flags
      READ TABLE lt_sa ASSIGNING FIELD-SYMBOL(<sa>) WITH KEY code = <i>-r-status.
      IF sy-subrc <> 0. APPEND VALUE #( code = <i>-r-status label = status_text( <i>-r-status ) ) TO lt_sa ASSIGNING <sa>. ENDIF.
      <sa>-count = <sa>-count + 1.
      IF <i>-r-flags IS NOT INITIAL. ls_ov-now-broken = ls_ov-now-broken + 1. ENDIF.
      LOOP AT <i>-r-flags INTO DATA(lv_flag).
        READ TABLE ls_ov-now-by_flag ASSIGNING FIELD-SYMBOL(<f>) WITH KEY code = lv_flag.
        IF sy-subrc <> 0. APPEND VALUE #( code = lv_flag label = flag_label( lv_flag ) ) TO ls_ov-now-by_flag ASSIGNING <f>. ENDIF.
        <f>-count = <f>-count + 1.
      ENDLOOP.
      IF <i>-r-is_open = abap_true.
        ls_ov-now-open_real = ls_ov-now-open_real + 1.
        IF <i>-r-stale = abap_true. ls_ov-now-open_stale = ls_ov-now-open_stale + 1. ELSE. ls_ov-now-open_fresh = ls_ov-now-open_fresh + 1. ENDIF.
      ENDIF.
      "window counts
      DATA(lv_in) = xsdbool( is_req-all_dates = abap_true OR ( <i>-created_d >= lv_from AND <i>-created_d <= lv_to ) ).
      IF lv_in = abap_true.
        ls_ov-window-total = ls_ov-window-total + 1.
        READ TABLE lt_st ASSIGNING FIELD-SYMBOL(<s>) WITH KEY code = <i>-r-status.
        IF sy-subrc <> 0. APPEND VALUE #( code = <i>-r-status label = status_text( <i>-r-status ) ) TO lt_st ASSIGNING <s>. ENDIF.
        <s>-count = <s>-count + 1.
        IF <i>-r-status = '01' OR <i>-r-status = '02' OR <i>-r-status = '04'. ls_ov-window-in_progress_old = ls_ov-window-in_progress_old + 1. ENDIF.
        IF <i>-r-duplicate = abap_true. ls_ov-window-duplicates = ls_ov-window-duplicates + 1. ENDIF.
        IF <i>-r-status = '03'. APPEND <i>-r-trans_id TO lt_done. ls_ov-window-completed = ls_ov-window-completed + 1. ENDIF.
        READ TABLE lt_ap ASSIGNING FIELD-SYMBOL(<a>) WITH KEY app_id = <i>-r-app_id.
        IF sy-subrc <> 0. APPEND VALUE #( app_id = <i>-r-app_id app_text = <i>-r-app_text ) TO lt_ap ASSIGNING <a>. ENDIF.
        <a>-count = <a>-count + 1.
      ENDIF.
    ENDLOOP.
    SORT lt_st BY code. SORT lt_sa BY code. SORT lt_ap BY count DESCENDING app_id.
    ls_ov-window-by_status = lt_st. ls_ov-now-by_status_all = lt_sa. ls_ov-window-by_app = lt_ap.
    SORT ls_ov-now-by_flag BY count DESCENDING.

    "Turn-around of completed requests of the window: first to last step in TRANS_I (not time to now, as the old board)
    IF lt_done IS NOT INITIAL.
      SELECT transid, serial_no, end_date, end_time FROM /inowits/trans_i FOR ALL ENTRIES IN @lt_done
        WHERE transid = @lt_done-table_line INTO TABLE @DATA(lt_ti).
      SORT lt_ti BY transid serial_no.
      DATA lt_tat TYPE STANDARD TABLE OF i WITH DEFAULT KEY.
      LOOP AT lt_ti ASSIGNING FIELD-SYMBOL(<t>).
        AT NEW transid.
          DATA(lv_d1) = <t>-end_date. DATA(lv_t1) = <t>-end_time.
        ENDAT.
        AT END OF transid.
          IF <t>-end_date <> lv_d1 OR <t>-end_time <> lv_t1.
            APPEND secs_between( iv_d1 = lv_d1 iv_t1 = lv_t1 iv_d2 = <t>-end_date iv_t2 = <t>-end_time ) TO lt_tat.
          ENDIF.
        ENDAT.
      ENDLOOP.
      DELETE lt_tat WHERE table_line < 0.
      IF lt_tat IS NOT INITIAL.
        SORT lt_tat.
        DATA(lv_cnt) = lines( lt_tat ).
        DATA lv_sum TYPE p LENGTH 16 DECIMALS 0.
        LOOP AT lt_tat INTO DATA(lv_s). lv_sum = lv_sum + lv_s. ENDLOOP.
        ls_ov-window-tat_samples = lv_cnt.
        ls_ov-window-avg_tat_seconds = lv_sum / lv_cnt.
        ls_ov-window-median_tat_seconds = lt_tat[ ( lv_cnt + 1 ) / 2 ].
      ENDIF.
    ENDIF.

    "Funnel (stage), per-agent ranking and aging of the really open requests (status 01/02/04, workflow running, a work item waiting)
    DATA lt_agent TYPE tt_agent.
    TYPES: BEGIN OF ty_ag_sum, agent TYPE string, age_sum TYPE p LENGTH 16 DECIMALS 0, n TYPE i, END OF ty_ag_sum.
    DATA lt_ags TYPE HASHED TABLE OF ty_ag_sum WITH UNIQUE KEY agent.
    TYPES: BEGIN OF ty_st_sum, app_id TYPE string, level TYPE string, role_type TYPE string, age_sum TYPE p LENGTH 16 DECIMALS 0, agents TYPE string_table, END OF ty_st_sum.
    DATA lt_sts TYPE STANDARD TABLE OF ty_st_sum WITH DEFAULT KEY.
    DATA lt_all_agents TYPE string_table.
    LOOP AT lt_row ASSIGNING <i> WHERE r-is_open = abap_true.
      "aging by app and bucket
      READ TABLE ls_ov-aging ASSIGNING FIELD-SYMBOL(<g>) WITH KEY app_id = <i>-r-app_id bucket = <i>-r-age_bucket.
      IF sy-subrc <> 0. APPEND VALUE #( app_id = <i>-r-app_id bucket = <i>-r-age_bucket ) TO ls_ov-aging ASSIGNING <g>. ENDIF.
      <g>-requests = <g>-requests + 1.
      "stage = app + level + role type
      DATA(lv_lvl) = COND string( WHEN <i>-r-pending_level IS INITIAL THEN '?' ELSE <i>-r-pending_level ).
      READ TABLE ls_ov-stages ASSIGNING FIELD-SYMBOL(<sg>) WITH KEY app_id = <i>-r-app_id level = lv_lvl role_type = <i>-r-pending_type.
      IF sy-subrc <> 0.
        APPEND VALUE #( app_id = <i>-r-app_id level = lv_lvl role_type = <i>-r-pending_type ) TO ls_ov-stages ASSIGNING <sg>.
        APPEND VALUE #( app_id = <i>-r-app_id level = lv_lvl role_type = <i>-r-pending_type ) TO lt_sts.
      ENDIF.
      READ TABLE lt_sts ASSIGNING FIELD-SYMBOL(<ss>) WITH KEY app_id = <i>-r-app_id level = lv_lvl role_type = <i>-r-pending_type.
      <sg>-requests = <sg>-requests + 1.
      IF <i>-r-stale = abap_true. <sg>-stale = <sg>-stale + 1. ELSE. <sg>-fresh = <sg>-fresh + 1. ENDIF.
      <sg>-work_items = <sg>-work_items + <i>-r-pending_items.
      <ss>-age_sum = <ss>-age_sum + <i>-r-age_seconds.
      IF <i>-r-age_seconds > <sg>-oldest_age. <sg>-oldest_age = <i>-r-age_seconds. ENDIF.
      LOOP AT <i>-agent_tab INTO DATA(lv_ag).
        IF NOT line_exists( <ss>-agents[ table_line = lv_ag ] ). APPEND lv_ag TO <ss>-agents. ENDIF.
        IF NOT line_exists( lt_all_agents[ table_line = lv_ag ] ). APPEND lv_ag TO lt_all_agents. ENDIF.
      ENDLOOP.
      IF <i>-r-pending_dept IS INITIAL.
        READ TABLE <sg>-depts ASSIGNING FIELD-SYMBOL(<d>) WITH KEY dept = `(not named by the task)`.
        IF sy-subrc <> 0. APPEND VALUE #( dept = `(not named by the task)` ) TO <sg>-depts ASSIGNING <d>. ENDIF.
        <d>-requests = <d>-requests + 1. <d>-work_items = <d>-work_items + <i>-r-pending_items.
      ELSE.
        LOOP AT <i>-dept_tab INTO DATA(lv_dp).
          READ TABLE <sg>-depts ASSIGNING <d> WITH KEY dept = lv_dp.
          IF sy-subrc <> 0. APPEND VALUE #( dept = lv_dp ) TO <sg>-depts ASSIGNING <d>. ENDIF.
          <d>-requests = <d>-requests + 1. <d>-work_items = <d>-work_items + 1.
        ENDLOOP.
        IF <i>-dept_tab IS INITIAL.
          READ TABLE <sg>-depts ASSIGNING <d> WITH KEY dept = <i>-r-pending_dept.
          IF sy-subrc <> 0. APPEND VALUE #( dept = <i>-r-pending_dept ) TO <sg>-depts ASSIGNING <d>. ENDIF.
          <d>-requests = <d>-requests + 1. <d>-work_items = <d>-work_items + <i>-r-pending_items.
        ENDIF.
      ENDIF.
    ENDLOOP.
    LOOP AT ls_ov-stages ASSIGNING <sg>.
      READ TABLE lt_sts ASSIGNING <ss> WITH KEY app_id = <sg>-app_id level = <sg>-level role_type = <sg>-role_type.
      IF sy-subrc = 0.
        <sg>-avg_age = <ss>-age_sum / nmax( val1 = 1 val2 = <sg>-requests ).
        <sg>-agents = lines( <ss>-agents ).
      ENDIF.
    ENDLOOP.
    SORT ls_ov-stages BY app_id level role_type.

    "Agents: users of the READY items. One request counts once per agent.
    DATA(lt_names) = names_of( VALUE ty_users( FOR a IN lt_all_agents ( CONV #( a ) ) ) ).
    LOOP AT lt_row ASSIGNING <i> WHERE r-is_open = abap_true.
      LOOP AT <i>-agent_tab INTO lv_ag.
        READ TABLE lt_agent ASSIGNING FIELD-SYMBOL(<ag>) WITH KEY agent = lv_ag.
        IF sy-subrc <> 0.
          APPEND VALUE #( agent = lv_ag name = name_of( it_name = lt_names iv_user = lv_ag ) ) TO lt_agent ASSIGNING <ag>.
        ENDIF.
        <ag>-requests = <ag>-requests + 1.
        IF <i>-r-stale = abap_true. <ag>-stale = <ag>-stale + 1. ELSE. <ag>-fresh = <ag>-fresh + 1. ENDIF.
        <ag>-work_items = <ag>-work_items + 1.
        IF <i>-r-age_seconds > <ag>-oldest_age. <ag>-oldest_age = <i>-r-age_seconds. ENDIF.
        READ TABLE lt_ags ASSIGNING FIELD-SYMBOL(<as>) WITH TABLE KEY agent = lv_ag.
        IF sy-subrc <> 0. INSERT VALUE #( agent = lv_ag ) INTO TABLE lt_ags ASSIGNING <as>. ENDIF.
        <as>-age_sum = <as>-age_sum + <i>-r-age_seconds. <as>-n = <as>-n + 1.
        READ TABLE <ag>-by_app ASSIGNING FIELD-SYMBOL(<ba>) WITH KEY app_id = <i>-r-app_id.
        IF sy-subrc <> 0. APPEND VALUE #( app_id = <i>-r-app_id app_text = <i>-r-app_text ) TO <ag>-by_app ASSIGNING <ba>. ENDIF.
        <ba>-count = <ba>-count + 1.
      ENDLOOP.
    ENDLOOP.
    LOOP AT lt_agent ASSIGNING <ag>.
      READ TABLE lt_ags ASSIGNING <as> WITH TABLE KEY agent = <ag>-agent.
      IF sy-subrc = 0 AND <as>-n > 0. <ag>-avg_age = <as>-age_sum / <as>-n. ENDIF.
    ENDLOOP.
    SORT lt_agent BY fresh DESCENDING requests DESCENDING agent.
    ls_ov-agent_count = lines( lt_agent ).
    IF lines( lt_agent ) > 40. DELETE lt_agent FROM 41. ENDIF.
    ls_ov-agents = lt_agent.
    SORT ls_ov-aging BY app_id bucket.
    ls_ov-restricted = lv_res.
    ls_ov-scope = COND #( WHEN lv_res = abap_true THEN 'own' ELSE 'all' ).
    ls_ov-generated = iso( iv_d = sy-datum iv_t = sy-uzeit ).
    rv_json = ok_json( ls_ov ).
  ENDMETHOD.


  METHOD select_and_page.
    TYPES: BEGIN OF ty_page, total TYPE i, page TYPE i, page_size TYPE i, rows TYPE tt_row, date_from TYPE string, date_to TYPE string,
                             restricted TYPE abap_bool, message TYPE string, generated TYPE string, END OF ty_page.
    DATA ls_page TYPE ty_page.
    DATA(ls_req) = is_req.
    "list filters that need the pending/level model are applied after the SQL selection
    DATA(lv_need_pend) = xsdbool( is_req-status_group = 'open' OR is_req-status_group = 'broken' OR is_req-status_group = 'stale'
                                  OR is_req-agent IS NOT INITIAL OR is_req-level IS NOT INITIAL OR is_req-role_type IS NOT INITIAL
                                  OR is_req-dept IS NOT INITIAL OR is_req-age_bucket IS NOT INITIAL OR is_req-flag IS NOT INITIAL
                                  OR is_req-sort = 'age' OR is_req-sort = 'since' OR is_req-exclude_stale = abap_true ).
    IF is_req-status_group = 'broken' OR is_req-status_group = 'stale'. CLEAR ls_req-status_group. ENDIF.
    DATA(lv_by_id) = xsdbool( is_req-trans_id IS NOT INITIAL OR is_req-obj_value IS NOT INITIAL ).
    ls_req-all_dates = xsdbool( is_req-all_dates = abap_true OR lv_by_id = abap_true ).
    DATA(lt_hdr) = load_headers( is_req = ls_req it_users = it_users iv_restricted = iv_restricted iv_window = abap_true ).
    DATA(lv_to) = to_date( is_req-date_to ). IF lv_to IS INITIAL. lv_to = sy-datum. ENDIF.
    DATA(lv_from) = to_date( is_req-date_from ). IF lv_from IS INITIAL. lv_from = lv_to - 30. ENDIF.
    IF ls_req-all_dates = abap_false.
      ls_page-date_from = iso( lv_from ). ls_page-date_to = iso( lv_to ).
    ENDIF.
    ls_page-restricted = iv_restricted.
    IF iv_restricted = abap_true AND it_users IS INITIAL.
      ls_page-message = |No SAP user is linked to { is_req-actor }, so no requests can be shown.|.
    ENDIF.

    "free text on the description (material long text uppercase) and on the object number
    IF is_req-text IS NOT INITIAL AND lt_hdr IS NOT INITIAL.
      DATA(lv_pat) = |%{ to_upper( condense( is_req-text ) ) }%|.
      SELECT DISTINCT transid FROM /inowits/mm_makt WHERE maktg LIKE @lv_pat INTO TABLE @DATA(lt_txt).
      LOOP AT lt_hdr ASSIGNING FIELD-SYMBOL(<h>).
        DATA(lv_ok) = xsdbool( line_exists( lt_txt[ transid = <h>-transid ] ) OR to_upper( <h>-obj_value ) CS to_upper( condense( is_req-text ) ) ).
        IF lv_ok = abap_false. DELETE lt_hdr. ENDIF.
      ENDLOOP.
    ENDIF.
    IF is_req-obj_value IS NOT INITIAL.
      DATA(lv_obj) = strip_zeros( to_upper( condense( is_req-obj_value ) ) ).
      LOOP AT lt_hdr ASSIGNING <h>.
        IF NOT strip_zeros( to_upper( <h>-obj_value ) ) CS lv_obj. DELETE lt_hdr. ENDIF.
      ENDLOOP.
    ENDIF.

    DATA lt_row TYPE tt_irow.
    IF lv_need_pend = abap_true OR lines( lt_hdr ) <= 2000.
      DATA(lt_pend) = load_pending( is_req = ls_req it_users = it_users iv_restricted = iv_restricted ).
    ENDIF.
    lt_row = build_rows( it_hdr = lt_hdr it_pend = lt_pend ).

    IF is_req-status_group = 'open'. DELETE lt_row WHERE r-is_open = abap_false. ENDIF.
    IF is_req-status_group = 'broken'. DELETE lt_row WHERE r-flags IS INITIAL. ENDIF.
    IF is_req-status_group = 'stale'. DELETE lt_row WHERE r-is_open = abap_false OR r-stale = abap_false. ENDIF.
    IF is_req-flag IS NOT INITIAL.
      LOOP AT lt_row ASSIGNING FIELD-SYMBOL(<f>).
        IF NOT line_exists( <f>-r-flags[ table_line = is_req-flag ] ). <f>-r-trans_id = '#'. ENDIF.
      ENDLOOP.
      DELETE lt_row WHERE r-trans_id = '#'.
    ENDIF.
    IF is_req-agent IS NOT INITIAL.
      DATA(lv_agent) = to_upper( condense( is_req-agent ) ).
      LOOP AT lt_row ASSIGNING <f>.
        IF NOT line_exists( <f>-agent_tab[ table_line = lv_agent ] ). <f>-r-trans_id = '#'. ENDIF.
      ENDLOOP.
      DELETE lt_row WHERE r-trans_id = '#'.
    ENDIF.
    IF is_req-age_bucket IS NOT INITIAL. DELETE lt_row WHERE r-age_bucket <> is_req-age_bucket OR r-pending_items = 0. ENDIF.
    IF is_req-exclude_stale = abap_true AND ( is_req-status_group = 'open' OR is_req-age_bucket IS NOT INITIAL OR is_req-level IS NOT INITIAL
                                              OR is_req-role_type IS NOT INITIAL OR is_req-dept IS NOT INITIAL OR is_req-agent IS NOT INITIAL ).
      DELETE lt_row WHERE r-stale = abap_true.
    ENDIF.

    "level, role type and department need the container level of the candidates only
    IF is_req-level IS NOT INITIAL OR is_req-role_type IS NOT INITIAL OR is_req-dept IS NOT INITIAL.
      add_levels( CHANGING ct_row = lt_row ).
      IF is_req-level IS NOT INITIAL. DELETE lt_row WHERE r-pending_level <> is_req-level. ENDIF.
      IF is_req-role_type IS NOT INITIAL. DELETE lt_row WHERE r-pending_type <> is_req-role_type. ENDIF.
      IF is_req-dept IS NOT INITIAL.
        LOOP AT lt_row ASSIGNING <f>.
          IF NOT ( line_exists( <f>-dept_tab[ table_line = is_req-dept ] ) OR <f>-r-pending_dept CS is_req-dept ). <f>-r-trans_id = '#'. ENDIF.
        ENDLOOP.
        DELETE lt_row WHERE r-trans_id = '#'.
      ENDIF.
    ENDIF.

    ls_page-total = lines( lt_row ).
    DATA(lv_desc) = xsdbool( is_req-dir <> 'asc' ).
    CASE is_req-sort.
      WHEN 'age' OR 'since'.
        IF lv_desc = abap_true. SORT lt_row BY r-age_seconds DESCENDING r-trans_id DESCENDING. ELSE. SORT lt_row BY r-age_seconds ASCENDING r-trans_id DESCENDING. ENDIF.
      WHEN 'created'.
        IF lv_desc = abap_true. SORT lt_row BY created_d DESCENDING created_t DESCENDING r-trans_id DESCENDING. ELSE. SORT lt_row BY created_d ASCENDING created_t ASCENDING r-trans_id ASCENDING. ENDIF.
      WHEN 'status'.
        IF lv_desc = abap_true. SORT lt_row BY r-status DESCENDING r-trans_id DESCENDING. ELSE. SORT lt_row BY r-status ASCENDING r-trans_id DESCENDING. ENDIF.
      WHEN 'app'.
        IF lv_desc = abap_true. SORT lt_row BY r-app_id DESCENDING r-trans_id DESCENDING. ELSE. SORT lt_row BY r-app_id ASCENDING r-trans_id DESCENDING. ENDIF.
      WHEN OTHERS.
        IF is_req-dir = 'asc'. SORT lt_row BY r-trans_id ASCENDING. ELSE. SORT lt_row BY r-trans_id DESCENDING. ENDIF.
    ENDCASE.

    ls_page-page_size = COND #( WHEN is_req-page_size <= 0 THEN 50 ELSE nmin( val1 = is_req-page_size val2 = 200 ) ).
    ls_page-page = nmax( val1 = is_req-page val2 = 1 ).
    DATA(lv_first) = ( ls_page-page - 1 ) * ls_page-page_size + 1.
    DATA lt_pg TYPE tt_irow.
    IF lv_first <= ls_page-total.
      DATA(lv_last) = nmin( val1 = ls_page-total val2 = lv_first + ls_page-page_size - 1 ).
      LOOP AT lt_row ASSIGNING FIELD-SYMBOL(<r>) FROM lv_first TO lv_last.
        APPEND <r> TO lt_pg.
      ENDLOOP.
    ENDIF.

    "Page rows: level, names, description, last action and turn-around
    add_levels( CHANGING ct_row = lt_pg ).
    DATA lt_us TYPE ty_users.
    LOOP AT lt_pg ASSIGNING FIELD-SYMBOL(<p>).
      APPEND CONV xubname( <p>-r-initiator ) TO lt_us.
      LOOP AT <p>-agent_tab INTO DATA(lv_ag). APPEND CONV xubname( lv_ag ) TO lt_us. ENDLOOP.
    ENDLOOP.
    DATA(lt_names) = names_of( lt_us ).
    DATA lt_tid TYPE STANDARD TABLE OF /inowits/m_trans-transid WITH DEFAULT KEY.
    LOOP AT lt_pg ASSIGNING <p>. APPEND CONV /inowits/m_trans-transid( <p>-r-trans_id ) TO lt_tid. ENDLOOP.
    IF lt_tid IS NOT INITIAL.
      SELECT transid, maktx FROM /inowits/mm_makt FOR ALL ENTRIES IN @lt_tid WHERE transid = @lt_tid-table_line AND spras = 'E'
        INTO TABLE @DATA(lt_mk).
      SELECT transid, serial_no, end_date, end_time FROM /inowits/trans_i FOR ALL ENTRIES IN @lt_tid WHERE transid = @lt_tid-table_line
        INTO TABLE @DATA(lt_ti).
      SORT lt_ti BY transid serial_no.
    ENDIF.
    LOOP AT lt_pg ASSIGNING <p>.
      <p>-r-initiator_name = name_of( it_name = lt_names iv_user = <p>-r-initiator ).
      LOOP AT <p>-agent_tab INTO lv_ag.
        <p>-r-pending_names = COND #( WHEN <p>-r-pending_names IS INITIAL THEN name_of( it_name = lt_names iv_user = lv_ag )
                                      ELSE <p>-r-pending_names && `, ` && name_of( it_name = lt_names iv_user = lv_ag ) ).
      ENDLOOP.
      READ TABLE lt_mk INTO DATA(ls_mk) WITH KEY transid = <p>-r-trans_id.
      IF sy-subrc = 0. <p>-r-description = ls_mk-maktx. ENDIF.
      DATA(lv_have) = abap_false.
      DATA(lv_d1) = CONV d( '00000000' ). DATA(lv_t1) = CONV t( '000000' ).
      DATA(lv_d2) = lv_d1. DATA(lv_t2) = lv_t1.
      LOOP AT lt_ti ASSIGNING FIELD-SYMBOL(<ti>) WHERE transid = <p>-r-trans_id.
        IF lv_have = abap_false. lv_have = abap_true. lv_d1 = <ti>-end_date. lv_t1 = <ti>-end_time. ENDIF.
        lv_d2 = <ti>-end_date. lv_t2 = <ti>-end_time.
      ENDLOOP.
      IF lv_have = abap_true.
        <p>-r-last_action = iso( iv_d = lv_d2 iv_t = lv_t2 ).
        <p>-r-tat_seconds = secs_between( iv_d1 = lv_d1 iv_t1 = lv_t1 iv_d2 = lv_d2 iv_t2 = lv_t2 ).
      ENDIF.
    ENDLOOP.
    ls_page-rows = VALUE #( FOR x IN lt_pg ( x-r ) ).
    ls_page-generated = iso( iv_d = sy-datum iv_t = sy-uzeit ).
    rv_json = ok_json( ls_page ).
  ENDMETHOD.

  METHOD op_detail.
    TYPES: BEGIN OF ty_detail,
             request TYPE ty_row, steps TYPE tt_step, pending TYPE tt_pitem, phases TYPE tt_phase,
             level_source TYPE string, generated TYPE string,
           END OF ty_detail.
    DATA ls_d TYPE ty_detail.
    IF is_req-trans_id IS INITIAL OR NOT is_req-trans_id CO ' 0123456789'.
      rv_json = zcl_mm_mdm_admin=>error_json( 'Enter a numeric transaction id.' ). RETURN.
    ENDIF.
    visible_users( EXPORTING is_req = is_req IMPORTING ev_restricted = DATA(lv_res) et_users = DATA(lt_users) ).
    DATA(ls_req) = is_req.
    CLEAR: ls_req-apps, ls_req-user, ls_req-status, ls_req-status_group.
    DATA(lt_hdr) = load_headers( is_req = ls_req it_users = lt_users iv_restricted = lv_res iv_window = abap_false ).
    IF lt_hdr IS INITIAL.
      rv_json = zcl_mm_mdm_admin=>error_json( |Request { is_req-trans_id } was not found or is not one of your requests.| ). RETURN.
    ENDIF.
    DELETE lt_hdr FROM 2.
    DATA(lt_pend) = load_pending( is_req = ls_req it_users = lt_users iv_restricted = lv_res ).
    DATA(lt_row) = build_rows( it_hdr = lt_hdr it_pend = lt_pend ).
    add_levels( CHANGING ct_row = lt_row ).
    ASSIGN lt_row[ 1 ] TO FIELD-SYMBOL(<i>).
    DATA(ls_h) = lt_hdr[ 1 ].

    SELECT transid, serial_no, lvl, role, status, end_date, end_time, user_id FROM /inowits/trans_i
      WHERE transid = @ls_h-transid AND app_id = @ls_h-app_id INTO TABLE @DATA(lt_ti).
    SORT lt_ti BY serial_no.
    SELECT gen_field, gen_field2, gen_field3, type_lvl, lvl FROM /inowits/wf_def
      WHERE app_id = @ls_h-app_id AND gen_type = @ls_h-gen_type INTO TABLE @DATA(lt_wfd).
    load_roles( ).

    DATA lt_us TYPE ty_users.
    APPEND CONV xubname( ls_h-user_id ) TO lt_us.
    LOOP AT lt_ti ASSIGNING FIELD-SYMBOL(<t>). APPEND CONV xubname( <t>-user_id ) TO lt_us. ENDLOOP.
    LOOP AT lt_pend ASSIGNING FIELD-SYMBOL(<pp>). APPEND CONV xubname( <pp>-agent ) TO lt_us. ENDLOOP.
    DATA(lt_names) = names_of( lt_us ).

    DATA: lv_prev_d TYPE d, lv_prev_t TYPE t, lv_seen_i TYPE abap_bool, lv_seen_r TYPE abap_bool, lv_seen_a TYPE abap_bool,
          lv_rej_i TYPE abap_bool, lv_rej_r TYPE abap_bool, lv_rej_a TYPE abap_bool.
    LOOP AT lt_ti ASSIGNING <t>.
      APPEND INITIAL LINE TO ls_d-steps ASSIGNING FIELD-SYMBOL(<s>).
      <s>-serial = <t>-serial_no.
      <s>-level = <t>-lvl.
      <s>-role = |{ CONV i( <t>-role ) }|.
      <s>-user = <t>-user_id.
      <s>-user_name = name_of( it_name = lt_names iv_user = <t>-user_id ).
      <s>-at = iso( iv_d = <t>-end_date iv_t = <t>-end_time ).
      IF lv_prev_d IS NOT INITIAL.
        <s>-step_seconds = secs_between( iv_d1 = lv_prev_d iv_t1 = lv_prev_t iv_d2 = <t>-end_date iv_t2 = <t>-end_time ).
      ENDIF.
      lv_prev_d = <t>-end_date. lv_prev_t = <t>-end_time.
      <s>-status = <t>-status.
      <s>-status_text = SWITCH #( <t>-status WHEN 'I' THEN 'Initiated' WHEN 'C' THEN 'Completed' WHEN 'R' THEN 'Rejected' WHEN 'S' THEN 'Sent back'
                                  WHEN 'F' THEN 'Forwarded' WHEN 'D' THEN 'Saved as draft' ELSE |{ <t>-status }| ).
      "role type of the level as configured now (WF_DEF), best match on the routing fields
      IF <t>-lvl = 'L0'.
        <s>-role_type = 'Initiator'.
      ELSE.
        DATA(lv_best) = -1.
        LOOP AT lt_wfd ASSIGNING FIELD-SYMBOL(<w>) WHERE lvl = <t>-lvl.
          DATA(lv_sc) = 0.
          IF <w>-gen_field2 = ls_h-gen_field2 AND ls_h-gen_field2 IS NOT INITIAL. lv_sc = lv_sc + 2. ENDIF.
          IF <w>-gen_field3 = ls_h-gen_field3 AND ls_h-gen_field3 IS NOT INITIAL. lv_sc = lv_sc + 1. ENDIF.
          IF <w>-gen_field = ls_h-gen_field AND ls_h-gen_field IS NOT INITIAL. lv_sc = lv_sc + 1. ENDIF.
          IF lv_sc > lv_best.
            lv_best = lv_sc.
            <s>-role_type = SWITCH #( <w>-type_lvl WHEN 'A' THEN 'Approver' WHEN 'I' THEN 'Initiator' ELSE 'Reviewer' ).
          ENDIF.
        ENDLOOP.
        IF <s>-role_type IS INITIAL. <s>-role_type = 'Reviewer'. ENDIF.
        <s>-dept = role_dept( iv_app = ls_h-app_id iv_gen_type = ls_h-gen_type iv_gf = ls_h-gen_field iv_gf2 = ls_h-gen_field2
                              iv_gf3 = ls_h-gen_field3 iv_lvl = <t>-lvl iv_role = <t>-role iv_agent = <t>-user_id ).
      ENDIF.
      CASE <s>-role_type.
        WHEN 'Initiator'. lv_seen_i = abap_true. IF <t>-status = 'R'. lv_rej_i = abap_true. ENDIF.
        WHEN 'Reviewer'.  lv_seen_r = abap_true. IF <t>-status = 'R'. lv_rej_r = abap_true. ENDIF.
        WHEN 'Approver'.  lv_seen_a = abap_true. IF <t>-status = 'R'. lv_rej_a = abap_true. ENDIF.
      ENDCASE.
    ENDLOOP.

    "Waiting now: one entry per READY work item and agent (exact: the work item task names role type and department)
    DATA(lv_now_d) = sy-datum. DATA(lv_now_t) = sy-uzeit.
    LOOP AT lt_pend ASSIGNING <pp>.
      APPEND INITIAL LINE TO ls_d-pending ASSIGNING FIELD-SYMBOL(<pi>).
      <pi>-wi_id = <pp>-wi_id.
      <pi>-agent = <pp>-agent.
      <pi>-agent_name = COND #( WHEN <pp>-agent IS INITIAL THEN '(no agent in the inbox table)' ELSE name_of( it_name = lt_names iv_user = <pp>-agent ) ).
      <pi>-task = <pp>-rhtext.
      <pi>-role_type = task_type( <pp>-rhtext ).
      <pi>-dept = task_dept( <pp>-rhtext ).
      IF <pi>-dept IS INITIAL AND <i>-r-pending_level IS NOT INITIAL AND <pi>-role_type <> 'Initiator'.
        <pi>-dept = role_dept( iv_app = ls_h-app_id iv_gen_type = ls_h-gen_type iv_gf = ls_h-gen_field iv_gf2 = ls_h-gen_field2
                               iv_gf3 = ls_h-gen_field3 iv_lvl = <i>-r-pending_level iv_agent = <pp>-agent ).
      ENDIF.
      <pi>-since = iso( iv_d = <pp>-since_d iv_t = <pp>-since_t ).
      <pi>-age_seconds = nmax( val1 = 0 val2 = secs_between( iv_d1 = <pp>-since_d iv_t1 = <pp>-since_t iv_d2 = lv_now_d iv_t2 = lv_now_t ) ).
      <pi>-stale = xsdbool( <pi>-age_seconds > gc_stale_days * 86400 ).
    ENDLOOP.

    "Request header
    ls_d-request = <i>-r.
    LOOP AT lt_ti ASSIGNING <t>.
      DATA(lv_idx) = sy-tabix.
      IF lv_idx = 1. DATA(lv_f_d) = <t>-end_date. DATA(lv_f_t) = <t>-end_time. ENDIF.
      DATA(lv_l_d) = <t>-end_date. DATA(lv_l_t) = <t>-end_time.
    ENDLOOP.
    IF lt_ti IS NOT INITIAL.
      ls_d-request-last_action = iso( iv_d = lv_l_d iv_t = lv_l_t ).
      ls_d-request-tat_seconds = secs_between( iv_d1 = lv_f_d iv_t1 = lv_f_t iv_d2 = lv_l_d iv_t2 = lv_l_t ).
    ENDIF.
    ls_d-request-initiator_name = name_of( it_name = lt_names iv_user = ls_h-user_id ).
    ls_d-request-pending_names = join_list( VALUE string_table( FOR p IN ls_d-pending WHERE ( agent IS NOT INITIAL ) ( p-agent_name ) ) ).
    SELECT SINGLE maktx FROM /inowits/mm_makt WHERE transid = @ls_h-transid AND spras = 'E' INTO @ls_d-request-description.

    "Phases as the old PHASE_INDICATOR: done = a step of the type exists; rejected = status 05 and a rejecting step; pending = the work item waiting now
    DATA(lv_pt) = <i>-r-pending_type.
    ls_d-phases = VALUE #(
      ( type = 'Initiator' state = COND #( WHEN lv_pt = 'Initiator' AND <i>-r-pending_items > 0 THEN 'pending' WHEN lv_rej_i = abap_true AND ls_h-status = '05' THEN 'rejected' WHEN lv_seen_i = abap_true THEN 'done' ELSE 'todo' ) )
      ( type = 'Reviewer'  state = COND #( WHEN lv_pt = 'Reviewer' AND <i>-r-pending_items > 0 THEN 'pending' WHEN lv_rej_r = abap_true AND ls_h-status = '05' THEN 'rejected' WHEN lv_seen_r = abap_true THEN 'done' ELSE 'todo' ) )
      ( type = 'Approver'  state = COND #( WHEN lv_pt = 'Approver' AND <i>-r-pending_items > 0 THEN 'pending' WHEN lv_rej_a = abap_true AND ls_h-status = '05' THEN 'rejected' WHEN lv_seen_a = abap_true THEN 'done' ELSE 'todo' ) ) ).
    ls_d-level_source = 'Level = container element LEVEL of the top workflow item (SWWCNTP0); role type and department of the waiting step = task of the READY work item; role type and department of past steps = WF_DEF / WF_ROLE as configured now.'.
    ls_d-generated = iso( iv_d = sy-datum iv_t = sy-uzeit ).
    rv_json = ok_json( ls_d ).
  ENDMETHOD.


  METHOD op_changes.
    TYPES: BEGIN OF ty_chg, change_nr TYPE string, user TYPE string, user_name TYPE string, at TYPE string, tcode TYPE string, plan_change TYPE string, END OF ty_chg.
    TYPES: BEGIN OF ty_ci, tabname TYPE string, tabkey TYPE string, fname TYPE string, field_text TYPE string, change_ind TYPE string, value_old TYPE string, value_new TYPE string, END OF ty_ci.
    TYPES: BEGIN OF ty_res,
             trans_id TYPE string, app_id TYPE string, supported TYPE abap_bool, note TYPE string,
             object_class TYPE string, object_id TYPE string, total TYPE i, truncated TYPE abap_bool,
             headers TYPE STANDARD TABLE OF ty_chg WITH DEFAULT KEY, items TYPE STANDARD TABLE OF ty_ci WITH DEFAULT KEY,
           END OF ty_res.
    DATA ls_r TYPE ty_res.
    IF is_req-trans_id IS INITIAL OR NOT is_req-trans_id CO ' 0123456789'.
      rv_json = zcl_mm_mdm_admin=>error_json( 'Enter a numeric transaction id.' ). RETURN.
    ENDIF.
    visible_users( EXPORTING is_req = is_req IMPORTING ev_restricted = DATA(lv_res) et_users = DATA(lt_users) ).
    DATA(ls_req) = is_req.
    CLEAR: ls_req-apps, ls_req-user, ls_req-status, ls_req-status_group.
    DATA(lt_hdr) = load_headers( is_req = ls_req it_users = lt_users iv_restricted = lv_res iv_window = abap_false ).
    IF lt_hdr IS INITIAL.
      rv_json = zcl_mm_mdm_admin=>error_json( |Request { is_req-trans_id } was not found or is not one of your requests.| ). RETURN.
    ENDIF.
    DATA(ls_h) = lt_hdr[ 1 ].
    ls_r-trans_id = ls_h-transid. ls_r-app_id = ls_h-app_id.
    "Object class per app (old board, CHANGE_LOG): material for MC/MX/ME (the old board only logged MX), customer, vendor, purchasing info record
    ls_r-object_class = SWITCH #( ls_h-app_id WHEN 'MC' OR 'MX' OR 'ME' THEN 'MATERIAL' WHEN 'CX' THEN 'DEBI' WHEN 'VX' THEN 'KRED' WHEN 'PX' THEN 'INFOSATZ' ELSE '' ).
    IF ls_r-object_class IS INITIAL.
      ls_r-supported = abap_false.
      ls_r-note = |Change log is not available for app { ls_h-app_id } in this rebuild.|.
      rv_json = ok_json( ls_r ). RETURN.
    ENDIF.
    ls_r-supported = abap_true.
    IF ls_h-obj_value IS INITIAL.
      ls_r-note = 'The request has no SAP object number yet (not posted), so there is no change log.'.
      rv_json = ok_json( ls_r ). RETURN.
    ENDIF.
    ls_r-object_id = ls_h-obj_value.
    DATA lv_oid TYPE cdobjectv.
    lv_oid = ls_h-obj_value.
    DATA lv_cls TYPE cdobjectcl.
    lv_cls = ls_r-object_class.
    IF iv_items = abap_false.
      SELECT COUNT( * ) FROM cdhdr WHERE objectclas = @lv_cls AND objectid = @lv_oid INTO @ls_r-total.
      SELECT changenr, username, udate, utime, tcode, planchngnr FROM cdhdr
        WHERE objectclas = @lv_cls AND objectid = @lv_oid
        ORDER BY udate DESCENDING, utime DESCENDING
        INTO TABLE @DATA(lt_cd) UP TO 200 ROWS.
      ls_r-truncated = xsdbool( ls_r-total > 200 ).
      DATA lt_us TYPE ty_users.
      LOOP AT lt_cd ASSIGNING FIELD-SYMBOL(<c>). APPEND CONV xubname( <c>-username ) TO lt_us. ENDLOOP.
      DATA(lt_names) = names_of( lt_us ).
      LOOP AT lt_cd ASSIGNING <c>.
        APPEND VALUE #( change_nr = <c>-changenr user = <c>-username user_name = name_of( it_name = lt_names iv_user = <c>-username )
                        at = iso( iv_d = <c>-udate iv_t = <c>-utime ) tcode = <c>-tcode plan_change = <c>-planchngnr ) TO ls_r-headers.
      ENDLOOP.
    ELSE.
      IF is_req-change_nr IS INITIAL OR NOT is_req-change_nr CO ' 0123456789'.
        rv_json = zcl_mm_mdm_admin=>error_json( 'Enter a numeric change number.' ). RETURN.
      ENDIF.
      DATA lv_cnr TYPE cdchangenr.
      lv_cnr = |{ CONV numc10( is_req-change_nr ) }|.
      SELECT COUNT( * ) FROM cdpos WHERE objectclas = @lv_cls AND objectid = @lv_oid AND changenr = @lv_cnr INTO @ls_r-total.
      SELECT tabname, tabkey, fname, chngind, value_old, value_new FROM cdpos
        WHERE objectclas = @lv_cls AND objectid = @lv_oid AND changenr = @lv_cnr
        INTO TABLE @DATA(lt_cp) UP TO 500 ROWS.
      ls_r-truncated = xsdbool( ls_r-total > 500 ).
      TYPES: BEGIN OF ty_tf, tabname TYPE dd03l-tabname, fieldname TYPE dd03l-fieldname, rollname TYPE dd03l-rollname, END OF ty_tf.
      DATA lt_tn TYPE STANDARD TABLE OF dd03l-tabname WITH DEFAULT KEY.
      LOOP AT lt_cp ASSIGNING FIELD-SYMBOL(<p>).
        APPEND CONV dd03l-tabname( <p>-tabname ) TO lt_tn.
        IF <p>-tabname(1) = 'D' AND strlen( <p>-tabname ) > 1. APPEND CONV dd03l-tabname( <p>-tabname+1 ) TO lt_tn. ENDIF.
      ENDLOOP.
      SORT lt_tn. DELETE ADJACENT DUPLICATES FROM lt_tn.
      DATA lt_tf TYPE STANDARD TABLE OF ty_tf WITH DEFAULT KEY.
      DATA lt_rn TYPE STANDARD TABLE OF dd04t-rollname WITH DEFAULT KEY.
      IF lt_tn IS NOT INITIAL.
        "field label = text of the data element of the field (DD03L -> DD04T), English
        SELECT tabname, fieldname, rollname FROM dd03l FOR ALL ENTRIES IN @lt_tn
          WHERE tabname = @lt_tn-table_line AND as4local = 'A' AND rollname <> ''
          INTO CORRESPONDING FIELDS OF TABLE @lt_tf.
        LOOP AT lt_tf ASSIGNING FIELD-SYMBOL(<tf>). APPEND CONV dd04t-rollname( <tf>-rollname ) TO lt_rn. ENDLOOP.
        SORT lt_rn. DELETE ADJACENT DUPLICATES FROM lt_rn.
      ENDIF.
      IF lt_rn IS NOT INITIAL.
        SELECT rollname, ddtext, scrtext_m FROM dd04t FOR ALL ENTRIES IN @lt_rn
          WHERE rollname = @lt_rn-table_line AND ddlanguage = 'E' AND as4local = 'A'
          INTO TABLE @DATA(lt_dt).
        SORT lt_dt BY rollname.
      ENDIF.
      SORT lt_tf BY tabname fieldname.
      LOOP AT lt_cp ASSIGNING <p>.
        DATA(lv_text) = ``.
        IF <p>-fname = 'KEY'.
          lv_text = 'Entry (key)'.
        ELSE.
          READ TABLE lt_tf INTO DATA(ls_tf) WITH KEY tabname = <p>-tabname fieldname = <p>-fname BINARY SEARCH.
          IF sy-subrc <> 0 AND <p>-tabname(1) = 'D'.
            READ TABLE lt_tf INTO ls_tf WITH KEY tabname = <p>-tabname+1 fieldname = <p>-fname BINARY SEARCH.
          ENDIF.
          IF sy-subrc = 0.
            READ TABLE lt_dt INTO DATA(ls_dt) WITH KEY rollname = ls_tf-rollname BINARY SEARCH.
            IF sy-subrc = 0. lv_text = COND #( WHEN ls_dt-ddtext IS NOT INITIAL THEN ls_dt-ddtext ELSE ls_dt-scrtext_m ). ENDIF.
          ENDIF.
        ENDIF.
        APPEND VALUE #( tabname = <p>-tabname tabkey = condense( CONV string( <p>-tabkey ) ) fname = <p>-fname field_text = lv_text
                        change_ind = <p>-chngind value_old = condense( CONV string( <p>-value_old ) ) value_new = condense( CONV string( <p>-value_new ) ) ) TO ls_r-items.
      ENDLOOP.
    ENDIF.
    rv_json = ok_json( ls_r ).
  ENDMETHOD.
ENDCLASS.
