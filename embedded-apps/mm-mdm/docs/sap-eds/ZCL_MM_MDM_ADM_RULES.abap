"! Admin area RULES of the MDM apps: maintenance of the default-value rules engine (/INOWITS/RULE_AP, RULE_H, RULE_I), the
"! runtime evaluation of the rules (EvaluateRules), and the field control viewer / version publisher (/INOWITS/MDM_MCN, MM_FELD, USR_DEP).
"! Rebuild of the Web Dynpro component /INOWITS/MDM_CONFIG (view MAINTAIN_RULES). Spec: embedded-apps/mm-mdm/docs/ADMIN_RULES.md
"! Entry: RUN( op, actor, payload-json ) -> {"ok":true,"data":..} | {"ok":false,"messages":[..]}. Every write op needs isAdmin in the payload.
CLASS zcl_mm_mdm_adm_rules DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    CLASS-METHODS run
      IMPORTING iv_op          TYPE clike
                iv_actor       TYPE clike OPTIONAL
                iv_payload     TYPE string OPTIONAL
      RETURNING VALUE(rv_json) TYPE string.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_item,
        rule_id       TYPE string,
        datele        TYPE string,
        value         TYPE string,
        condition     TYPE string,
        ftype         TYPE string,
        datele_desc   TYPE string,
        ptype         TYPE string,
        is_default    TYPE abap_bool,
      END OF ty_item,
      ty_items TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,
      BEGIN OF ty_kv,
        field TYPE string,
        value TYPE string,
      END OF ty_kv,
      BEGIN OF ty_chg,
        cnt          TYPE string,
        visible      TYPE abap_bool,
        required     TYPE abap_bool,
        display_only TYPE abap_bool,
      END OF ty_chg,
      BEGIN OF ty_in,
        actor         TYPE string,
        is_admin      TYPE abap_bool,
        app           TYPE string,
        fgroup        TYPE string,
        screen        TYPE string,
        rule_set_id   TYPE string,
        rule_id       TYPE string,
        description   TYPE string,
        filter_value  TYPE string,
        q             TYPE string,
        mtart         TYPE string,
        vrsn          TYPE string,
        view          TYPE string,
        items         TYPE ty_items,
        values        TYPE STANDARD TABLE OF ty_kv WITH DEFAULT KEY,
        changes       TYPE STANDARD TABLE OF ty_chg WITH DEFAULT KEY,
      END OF ty_in,
      BEGIN OF ty_msg,
        severity TYPE string,
        code     TYPE string,
        message  TYPE string,
        target   TYPE string,
      END OF ty_msg,
      BEGIN OF ty_err,
        ok       TYPE abap_bool,
        messages TYPE STANDARD TABLE OF ty_msg WITH DEFAULT KEY,
      END OF ty_err,
      BEGIN OF ty_db,
        rule_set_id TYPE /inowits/rule_i-rule_set_id,
        rule_id     TYPE /inowits/rule_i-rule_id,
        datele      TYPE /inowits/rule_i-datele,
        value       TYPE /inowits/rule_i-value,
        zcondition  TYPE /inowits/rule_i-zcondition,
        ftype       TYPE /inowits/rule_i-ftype,
        datele_desc TYPE /inowits/rule_i-datele_desc,
        ptype       TYPE /inowits/rule_i-ptype,
        defult      TYPE /inowits/rule_i-defult,
      END OF ty_db,
      ty_dbs TYPE STANDARD TABLE OF ty_db WITH DEFAULT KEY.

    CLASS-DATA gv_err TYPE ty_msg.

    CLASS-METHODS ser IMPORTING ig TYPE data RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS ok  IMPORTING ig TYPE data RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS err IMPORTING iv_text TYPE clike iv_code TYPE clike DEFAULT 'RULES' iv_target TYPE clike OPTIONAL
                      RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS fail IMPORTING iv_text TYPE clike iv_code TYPE clike DEFAULT 'RULES' iv_target TYPE clike OPTIONAL.
    CLASS-METHODS is_admin IMPORTING is_in TYPE ty_in iv_actor TYPE clike RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS lock IMPORTING iv_tab TYPE clike iv_key TYPE clike RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS unlock IMPORTING iv_tab TYPE clike iv_key TYPE clike.
    CLASS-METHODS num3 IMPORTING iv TYPE string RETURNING VALUE(rv) TYPE numc3.
    CLASS-METHODS is_num3 IMPORTING iv TYPE string RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS dd_text IMPORTING iv_rollname TYPE clike RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS valid_app IMPORTING iv_app TYPE clike RETURNING VALUE(rv) TYPE abap_bool.
    CLASS-METHODS read_in IMPORTING iv_payload TYPE string EXPORTING es_in TYPE ty_in ev_ok TYPE abap_bool.

    CLASS-METHODS op_apps       RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_screens    IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_sets       IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_getset     IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_saveset    IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_deleteset  IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_saverules  IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_deleterule IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_validate   IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_fieldhelp  IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_evaluate   IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_fieldtypes RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_fieldviews IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_fieldrows  IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_publish    IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_delversion IMPORTING is_in TYPE ty_in RETURNING VALUE(rv) TYPE string.
    CLASS-METHODS op_overrides  RETURNING VALUE(rv) TYPE string.
ENDCLASS.



CLASS ZCL_MM_MDM_ADM_RULES IMPLEMENTATION.

  METHOD ser.
    rv = /ui2/cl_json=>serialize( data = ig compress = abap_false pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
  ENDMETHOD.

  METHOD ok.
    rv = |\{"ok":true,"data":{ ser( ig ) }\}|.
  ENDMETHOD.

  METHOD err.
    DATA(ls) = VALUE ty_err( ok = abap_false messages = VALUE #( ( severity = 'E' code = iv_code message = iv_text target = iv_target ) ) ).
    rv = ser( ls ).
  ENDMETHOD.

  METHOD fail.
    gv_err = VALUE #( severity = 'E' code = iv_code message = iv_text target = iv_target ).
  ENDMETHOD.

  METHOD is_admin.
    rv = xsdbool( is_in-is_admin = abap_true AND ( is_in-actor IS NOT INITIAL OR iv_actor IS NOT INITIAL ) ).
  ENDMETHOD.

  METHOD lock.
    DATA lv_tab TYPE rstable-tabname.
    DATA lv_vk TYPE rstable-varkey.
    lv_tab = iv_tab. lv_vk = iv_key.
    CALL FUNCTION 'ENQUEUE_E_TABLE'
      EXPORTING
        mode_rstable   = 'E'
        tabname        = lv_tab
        varkey         = lv_vk
        _scope         = '2'
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    rv = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

  METHOD unlock.
    DATA lv_tab TYPE rstable-tabname.
    DATA lv_vk TYPE rstable-varkey.
    lv_tab = iv_tab. lv_vk = iv_key.
    CALL FUNCTION 'DEQUEUE_E_TABLE'
      EXPORTING
        mode_rstable = 'E'
        tabname      = lv_tab
        varkey       = lv_vk.
  ENDMETHOD.

  METHOD is_num3.
    DATA(lv) = condense( iv ).
    rv = xsdbool( lv IS NOT INITIAL AND strlen( lv ) <= 3 AND lv CO '0123456789' ).
  ENDMETHOD.

  METHOD num3.
    DATA(lv) = condense( iv ).
    IF is_num3( lv ) = abap_true.
      rv = CONV numc3( lv ).
    ENDIF.
  ENDMETHOD.

  METHOD dd_text.
    DATA lv_t TYPE c LENGTH 60.
    DATA(lv_r) = CONV rollname( to_upper( condense( CONV string( iv_rollname ) ) ) ).
    CHECK lv_r IS NOT INITIAL.
    SELECT SINGLE scrtext_l FROM dd04t INTO @lv_t
      WHERE rollname = @lv_r AND ddlanguage = @sy-langu AND as4local = 'A' AND as4vers = '0000'.
    IF sy-subrc <> 0.
      SELECT SINGLE scrtext_l FROM dd04t INTO @lv_t
        WHERE rollname = @lv_r AND ddlanguage = 'E' AND as4local = 'A' AND as4vers = '0000'.
    ENDIF.
    rv = condense( CONV string( lv_t ) ).
  ENDMETHOD.

  METHOD valid_app.
    DATA lv_d TYPE dd07l-domvalue_l.
    DATA(lv_a) = CONV dd07l-domvalue_l( to_upper( condense( CONV string( iv_app ) ) ) ).
    CHECK lv_a IS NOT INITIAL.
    SELECT SINGLE domvalue_l FROM dd07l INTO @lv_d WHERE domname = '/INOWITS/RULE_APP' AND as4local = 'A' AND domvalue_l = @lv_a.
    rv = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

  METHOD read_in.
    ev_ok = abap_true.
    CLEAR es_in.
    CHECK iv_payload IS NOT INITIAL.
    TRY.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_payload pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = es_in ).
      CATCH cx_root.
        ev_ok = abap_false.
    ENDTRY.
  ENDMETHOD.

  METHOD run.
    DATA ls_in TYPE ty_in.
    DATA lv_ok TYPE abap_bool.
    CLEAR gv_err.
    read_in( EXPORTING iv_payload = iv_payload IMPORTING es_in = ls_in ev_ok = lv_ok ).
    IF lv_ok = abap_false.
      rv_json = err( iv_text = 'The request could not be read (invalid JSON)' iv_code = 'PAYLOAD' ). RETURN.
    ENDIF.
    DATA(lv_actor) = CONV string( iv_actor ).
    DATA(lv_op) = to_upper( condense( CONV string( iv_op ) ) ).
    TRY.
        CASE lv_op.
          WHEN 'APPS'.        rv_json = op_apps( ).
          WHEN 'SCREENS'.     rv_json = op_screens( ls_in ).
          WHEN 'SETS'.        rv_json = op_sets( ls_in ).
          WHEN 'GETSET'.      rv_json = op_getset( ls_in ).
          WHEN 'FIELDHELP'.   rv_json = op_fieldhelp( ls_in ).
          WHEN 'EVALUATE' OR 'EVALUATERULES'. rv_json = op_evaluate( ls_in ).
          WHEN 'VALIDATE' OR 'VALIDATERULES'. rv_json = op_validate( ls_in ).
          WHEN 'FIELDTYPES' . rv_json = op_fieldtypes( ).
          WHEN 'FIELDVIEWS'.  rv_json = op_fieldviews( ls_in ).
          WHEN 'FIELDROWS'.   rv_json = op_fieldrows( ls_in ).
          WHEN 'OVERRIDES'.   rv_json = op_overrides( ).
          WHEN 'SAVESET' OR 'DELETESET' OR 'SAVERULES' OR 'DELETERULE' OR 'PUBLISHFIELD' OR 'DELETEFIELDVERSION'.
            IF is_admin( is_in = ls_in iv_actor = lv_actor ) = abap_false.
              rv_json = err( iv_text = 'Only an MDM administrator may change the rules' iv_code = 'NOT_ADMIN' ). RETURN.
            ENDIF.
            CASE lv_op.
              WHEN 'SAVESET'.            rv_json = op_saveset( ls_in ).
              WHEN 'DELETESET'.          rv_json = op_deleteset( ls_in ).
              WHEN 'SAVERULES'.          rv_json = op_saverules( ls_in ).
              WHEN 'DELETERULE'.         rv_json = op_deleterule( ls_in ).
              WHEN 'PUBLISHFIELD'.       rv_json = op_publish( ls_in ).
              WHEN 'DELETEFIELDVERSION'. rv_json = op_delversion( ls_in ).
            ENDCASE.
          WHEN OTHERS.
            rv_json = err( iv_text = |Operation { iv_op } is not known| iv_code = 'OP' ).
        ENDCASE.
      CATCH cx_root INTO DATA(lx).
        ROLLBACK WORK.
        rv_json = err( iv_text = lx->get_text( ) iv_code = 'EXCEPTION' ).
    ENDTRY.
  ENDMETHOD.


  METHOD op_apps.
    TYPES: BEGIN OF ty_app, app TYPE string, text TYPE string, screen_count TYPE i, set_count TYPE i, END OF ty_app.
    DATA lt TYPE STANDARD TABLE OF ty_app WITH DEFAULT KEY.
    SELECT domvalue_l, ddtext FROM dd07t WHERE domname = '/INOWITS/RULE_APP' AND ddlanguage = 'E' AND as4local = 'A'
      ORDER BY valpos INTO TABLE @DATA(lt_dom).
    SELECT app, COUNT(*) AS n FROM /inowits/rule_ap GROUP BY app INTO TABLE @DATA(lt_ap).
    SELECT app_id, COUNT(*) AS n FROM /inowits/rule_h GROUP BY app_id INTO TABLE @DATA(lt_h).
    LOOP AT lt_dom INTO DATA(ls_d).
      DATA(ls) = VALUE ty_app( app = condense( ls_d-domvalue_l ) text = condense( ls_d-ddtext ) ).
      READ TABLE lt_ap INTO DATA(ls_a) WITH KEY app = ls_d-domvalue_l.
      IF sy-subrc = 0. ls-screen_count = ls_a-n. ENDIF.
      READ TABLE lt_h INTO DATA(ls_hh) WITH KEY app_id = ls_d-domvalue_l.
      IF sy-subrc = 0. ls-set_count = ls_hh-n. ENDIF.
      APPEND ls TO lt.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"apps":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_screens.
    TYPES: BEGIN OF ty_s, fgroup TYPE string, app TYPE string, screen TYPE string, screen_desc TYPE string, set_count TYPE i, END OF ty_s.
    DATA lt TYPE STANDARD TABLE OF ty_s WITH DEFAULT KEY.
    DATA(lv_app) = CONV /inowits/rule_ap-app( to_upper( condense( is_in-app ) ) ).
    IF lv_app IS INITIAL.
      rv = err( iv_text = 'Please enter an Application' iv_code = 'APP' iv_target = 'app' ). RETURN.
    ENDIF.
    IF valid_app( lv_app ) = abap_false.
      rv = err( iv_text = 'Please enter a valid Application' iv_code = 'APP' iv_target = 'app' ). RETURN.
    ENDIF.
    SELECT fgroup, screen, screen_desc FROM /inowits/rule_ap WHERE app = @lv_app ORDER BY fgroup INTO TABLE @DATA(lt_ap).
    SELECT fgroup, COUNT(*) AS n FROM /inowits/rule_h WHERE app_id = @lv_app GROUP BY fgroup INTO TABLE @DATA(lt_h).
    LOOP AT lt_ap INTO DATA(ls_a).
      DATA(ls) = VALUE ty_s( fgroup = ls_a-fgroup app = condense( lv_app ) screen = condense( ls_a-screen ) screen_desc = condense( ls_a-screen_desc ) ).
      READ TABLE lt_h INTO DATA(ls_hh) WITH KEY fgroup = ls_a-fgroup.
      IF sy-subrc = 0. ls-set_count = ls_hh-n. ENDIF.
      APPEND ls TO lt.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"screens":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_sets.
    TYPES: BEGIN OF ty_s, rule_set_id TYPE string, fgroup TYPE string, app TYPE string, screen TYPE string, screen_desc TYPE string,
             description TYPE string, filter_value TYPE string, rule_count TYPE i, item_count TYPE i, output_field TYPE string, END OF ty_s.
    DATA lt TYPE STANDARD TABLE OF ty_s WITH DEFAULT KEY.
    DATA lt_h TYPE STANDARD TABLE OF /inowits/rule_h WITH DEFAULT KEY.
    DATA(lv_app) = CONV /inowits/rule_h-app_id( to_upper( condense( is_in-app ) ) ).
    IF is_in-fgroup IS NOT INITIAL.
      IF is_num3( is_in-fgroup ) = abap_false.
        rv = err( iv_text = 'Please enter a valid screen' iv_code = 'SCREEN' iv_target = 'fgroup' ). RETURN.
      ENDIF.
      DATA(lv_fg) = num3( is_in-fgroup ).
      SELECT * FROM /inowits/rule_h WHERE fgroup = @lv_fg ORDER BY rule_set_id INTO TABLE @lt_h.
    ELSEIF lv_app IS NOT INITIAL.
      SELECT * FROM /inowits/rule_h WHERE app_id = @lv_app ORDER BY rule_set_id INTO TABLE @lt_h.
    ELSE.
      rv = err( iv_text = 'Please enter an Application' iv_code = 'APP' iv_target = 'app' ). RETURN.
    ENDIF.
    IF lt_h IS INITIAL.
      rv = |\{"ok":true,"data":\{"sets":[]\}\}|. RETURN.
    ENDIF.
    SELECT rule_set_id, rule_id, ftype, datele FROM /inowits/rule_i FOR ALL ENTRIES IN @lt_h
      WHERE rule_set_id = @lt_h-rule_set_id INTO TABLE @DATA(lt_i).
    SORT lt_i BY rule_set_id rule_id.
    LOOP AT lt_h INTO DATA(ls_h).
      DATA(ls) = VALUE ty_s( rule_set_id = ls_h-rule_set_id fgroup = ls_h-fgroup app = condense( ls_h-app_id ) screen = condense( ls_h-screen )
        screen_desc = condense( ls_h-screen_desc ) description = condense( ls_h-rule_desc ) filter_value = condense( ls_h-filter_value ) ).
      DATA lv_prev TYPE /inowits/rule_i-rule_id.
      CLEAR lv_prev.
      LOOP AT lt_i INTO DATA(ls_i) WHERE rule_set_id = ls_h-rule_set_id.
        ls-item_count = ls-item_count + 1.
        IF ls_i-rule_id <> lv_prev. ls-rule_count = ls-rule_count + 1. lv_prev = ls_i-rule_id. ENDIF.
        IF ls-output_field IS INITIAL AND ls_i-ftype = 'R'. ls-output_field = condense( ls_i-datele ). ENDIF.
      ENDLOOP.
      APPEND ls TO lt.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"sets":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_getset.
    DATA lt_o TYPE ty_items.
    IF is_num3( is_in-rule_set_id ) = abap_false.
      rv = err( iv_text = 'Please select a Valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DATA(lv_id) = num3( is_in-rule_set_id ).
    SELECT SINGLE * FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @DATA(ls_h).
    IF sy-subrc <> 0.
      rv = err( iv_text = 'Please select a Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DATA lt_i TYPE ty_dbs.
    SELECT rule_set_id, rule_id, datele, value, zcondition, ftype, datele_desc, ptype, defult
      FROM /inowits/rule_i WHERE rule_set_id = @lv_id ORDER BY rule_id, ftype, datele, value INTO TABLE @lt_i.
    LOOP AT lt_i INTO DATA(ls_i).
      APPEND VALUE #( rule_id = ls_i-rule_id datele = condense( ls_i-datele ) value = ls_i-value condition = condense( ls_i-zcondition )
        ftype = ls_i-ftype datele_desc = condense( ls_i-datele_desc ) ptype = ls_i-ptype is_default = xsdbool( ls_i-defult = 'X' ) ) TO lt_o.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"ruleSetId":"{ ls_h-rule_set_id }","fgroup":"{ ls_h-fgroup }","app":"{ condense( ls_h-app_id ) }",| &&
         |"screen":"{ condense( ls_h-screen ) }","description":{ ser( condense( ls_h-rule_desc ) ) },"filterValue":{ ser( condense( ls_h-filter_value ) ) },| &&
         |"items":{ ser( lt_o ) }\}\}|.
  ENDMETHOD.

  METHOD op_fieldhelp.
    TYPES: BEGIN OF ty_f, datele TYPE string, text TYPE string, source TYPE string, END OF ty_f.
    DATA lt TYPE STANDARD TABLE OF ty_f WITH DEFAULT KEY.
    DATA lt_n TYPE STANDARD TABLE OF /inowits/mdm_mcn-fnm WITH DEFAULT KEY.
    DATA(lv_app) = to_upper( condense( is_in-app ) ).
    DATA(lv_scr) = CONV /inowits/mdm_mcn-vwnm( to_upper( condense( is_in-screen ) ) ).
    DATA(lv_q) = to_upper( condense( is_in-q ) ).
    " fields of the config table of the application (same list the old value help showed): visible fields of that screen
    IF lv_scr IS NOT INITIAL.
      CASE lv_app.
        WHEN 'M'. SELECT DISTINCT fnm FROM /inowits/mdm_mcn WHERE vwnm = @lv_scr AND hd = 'X' INTO TABLE @lt_n.
        WHEN 'C'. SELECT DISTINCT fnm FROM /inowits/mdm_ccn WHERE vwnm = @lv_scr AND hd = 'X' INTO TABLE @lt_n.
        WHEN 'V'. SELECT DISTINCT fnm FROM /inowits/mdm_vcn WHERE vwnm = @lv_scr AND hd = 'X' INTO TABLE @lt_n.
      ENDCASE.
    ENDIF.
    LOOP AT lt_n INTO DATA(lv_n).
      DATA(lv_t) = dd_text( lv_n ).
      IF lv_q IS NOT INITIAL AND NOT ( to_upper( condense( CONV string( lv_n ) ) ) CS lv_q OR to_upper( lv_t ) CS lv_q ).
        CONTINUE.
      ENDIF.
      APPEND VALUE #( datele = condense( lv_n ) text = lv_t source = 'CONFIG' ) TO lt.
    ENDLOOP.
    " dictionary search (key-data screens have no config rows): data elements by name prefix
    IF strlen( lv_q ) >= 2.
      DATA(lv_like) = |{ lv_q }%|.
      DATA lt_d TYPE STANDARD TABLE OF dd04l-rollname WITH DEFAULT KEY.
      SELECT rollname FROM dd04l WHERE rollname LIKE @lv_like AND as4local = 'A' AND as4vers = '0000' ORDER BY rollname INTO TABLE @lt_d UP TO 40 ROWS.
      LOOP AT lt_d INTO DATA(lv_r).
        DATA(lv_rn) = condense( CONV string( lv_r ) ).
        READ TABLE lt TRANSPORTING NO FIELDS WITH KEY datele = lv_rn.
        IF sy-subrc <> 0.
          APPEND VALUE #( datele = lv_rn text = dd_text( lv_r ) source = 'DICT' ) TO lt.
        ENDIF.
      ENDLOOP.
    ENDIF.
    IF lines( lt ) > 60. DELETE lt FROM 61. ENDIF.
    rv = |\{"ok":true,"data":\{"fields":{ ser( lt ) }\}\}|.
  ENDMETHOD.


  METHOD op_saveset.
    DATA ls_h TYPE /inowits/rule_h.
    " header validation, same order and texts as VALIDATE of MAINTAIN_RULES
    IF is_in-app IS NOT INITIAL AND valid_app( is_in-app ) = abap_false.
      rv = err( iv_text = 'Please enter a valid Application' iv_code = 'APP' iv_target = 'app' ). RETURN.
    ENDIF.
    IF is_in-fgroup IS INITIAL.
      rv = err( iv_text = 'Please enter a Screen' iv_code = 'SCREEN' iv_target = 'fgroup' ). RETURN.
    ENDIF.
    IF is_num3( is_in-fgroup ) = abap_false.
      rv = err( iv_text = 'Please enter a valid screen' iv_code = 'SCREEN' iv_target = 'fgroup' ). RETURN.
    ENDIF.
    DATA(lv_fg) = num3( is_in-fgroup ).
    SELECT SINGLE * FROM /inowits/rule_ap WHERE fgroup = @lv_fg INTO @DATA(ls_ap).
    IF sy-subrc <> 0 OR ( is_in-app IS NOT INITIAL AND ls_ap-app <> to_upper( condense( is_in-app ) ) ).
      rv = err( iv_text = 'Please enter a valid screen' iv_code = 'SCREEN' iv_target = 'fgroup' ). RETURN.
    ENDIF.
    DATA(lv_desc) = condense( is_in-description ).
    IF lv_desc IS INITIAL.
      rv = err( iv_text = 'Please enter a Rule Set Description' iv_code = 'RULE_DESC' iv_target = 'description' ). RETURN.
    ENDIF.
    IF strlen( lv_desc ) > 100.
      rv = err( iv_text = 'The Rule Set Description can have at most 100 characters' iv_code = 'RULE_DESC' iv_target = 'description' ). RETURN.
    ENDIF.
    DATA(lv_filter) = to_upper( condense( is_in-filter_value ) ).
    IF strlen( lv_filter ) > 10.
      rv = err( iv_text = 'The data value filter can have at most 10 characters' iv_code = 'FILTER' iv_target = 'filterValue' ). RETURN.
    ENDIF.
    DATA(lv_key) = CONV string( sy-mandt ).
    IF lock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is saving rules - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    DATA(lv_new) = abap_false.
    IF is_in-rule_set_id IS INITIAL.
      " NEW set: next free id, MAX + 1, only for this set, inside the lock
      SELECT MAX( rule_set_id ) FROM /inowits/rule_h INTO @DATA(lv_max).
      IF lv_max >= 999.
        unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
        rv = err( iv_text = 'No free Rule Set id is left (maximum 999)' iv_code = 'RULE_SET_ID' ). RETURN.
      ENDIF.
      ls_h-rule_set_id = lv_max + 1.
      lv_new = abap_true.
    ELSE.
      IF is_num3( is_in-rule_set_id ) = abap_false.
        unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
        rv = err( iv_text = 'Please select a Valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
      ENDIF.
      DATA(lv_id) = num3( is_in-rule_set_id ).
      SELECT SINGLE * FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @ls_h.
      IF sy-subrc <> 0.
        unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
        rv = err( iv_text = 'Please select a Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
      ENDIF.
      IF ls_h-fgroup <> lv_fg.
        unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
        rv = err( iv_text = 'A Rule Set cannot be moved to another screen' iv_code = 'SCREEN' iv_target = 'fgroup' ). RETURN.
      ENDIF.
    ENDIF.
    ls_h-mandt = sy-mandt.
    ls_h-fgroup = lv_fg.
    ls_h-filter_value = lv_filter.
    ls_h-rule_desc = lv_desc.
    ls_h-app_id = ls_ap-app.
    ls_h-screen = ls_ap-screen.
    ls_h-screen_desc = ls_ap-screen_desc.
    IF lv_new = abap_true.
      INSERT /inowits/rule_h FROM @ls_h.
    ELSE.
      UPDATE /inowits/rule_h SET rule_desc = @ls_h-rule_desc, filter_value = @ls_h-filter_value WHERE rule_set_id = @ls_h-rule_set_id.
    ENDIF.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'The Rule Set could not be saved' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
    DATA(lv_msg) = COND string( WHEN lv_new = abap_true THEN `Rule Set created successfully` ELSE `Rule Set saved successfully` ).
    rv = |\{"ok":true,"data":\{"ruleSetId":"{ ls_h-rule_set_id }","created":{ COND string( WHEN lv_new = abap_true THEN `true` ELSE `false` ) },"message":"{ lv_msg }"\}\}|.
  ENDMETHOD.

  METHOD op_deleteset.
    IF is_num3( is_in-rule_set_id ) = abap_false.
      rv = err( iv_text = 'Please select a Valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DATA(lv_id) = num3( is_in-rule_set_id ).
    DATA(lv_key) = CONV string( sy-mandt ).
    IF lock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is saving rules - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    SELECT SINGLE rule_set_id FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @DATA(lv_ex).
    IF sy-subrc <> 0.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'Please select a Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    SELECT COUNT(*) FROM /inowits/rule_i WHERE rule_set_id = @lv_id INTO @DATA(lv_n).
    DELETE FROM /inowits/rule_i WHERE rule_set_id = @lv_id.
    DELETE FROM /inowits/rule_h WHERE rule_set_id = @lv_id.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'The Rule Set could not be deleted' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
    rv = |\{"ok":true,"data":\{"ruleSetId":"{ lv_id }","itemsDeleted":{ lv_n },"message":"Rule Set deleted successfully"\}\}|.
  ENDMETHOD.

  METHOD op_saverules.
    DATA lt_db TYPE ty_dbs.
    DATA lt_ids TYPE STANDARD TABLE OF /inowits/rule_i-rule_id WITH DEFAULT KEY.
    DATA lv_idx TYPE i.
    " 3.7 step 2: a valid rule set must be selected
    IF is_num3( is_in-rule_set_id ) = abap_false.
      rv = err( iv_text = 'Please select a valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DATA(lv_id) = num3( is_in-rule_set_id ).
    SELECT SINGLE * FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @DATA(ls_h).
    IF sy-subrc <> 0.
      rv = err( iv_text = 'Please select a valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    IF is_in-items IS INITIAL.
      rv = err( iv_text = 'Please enter the rule details' iv_code = 'ITEMS' iv_target = 'items' ). RETURN.
    ENDIF.
    " normalise + shape checks (added: the old screen silently truncated / accepted anything)
    LOOP AT is_in-items INTO DATA(ls_in).
      lv_idx = sy-tabix.
      DATA(lv_tg) = |items[{ lv_idx - 1 }]|.
      DATA(lv_dat) = to_upper( condense( ls_in-datele ) ).
      DATA(lv_val) = ls_in-value.
      IF is_num3( ls_in-rule_id ) = abap_false.
        rv = err( iv_text = 'Please enter a valid Rule Id' iv_code = 'RULE_ID' iv_target = |{ lv_tg }.ruleId| ). RETURN.
      ENDIF.
      IF strlen( lv_dat ) > 30.
        rv = err( iv_text = 'The field name can have at most 30 characters' iv_code = 'DATELE' iv_target = |{ lv_tg }.datele| ). RETURN.
      ENDIF.
      IF strlen( lv_val ) > 40.
        rv = err( iv_text = 'The value can have at most 40 characters' iv_code = 'VALUE' iv_target = |{ lv_tg }.value| ). RETURN.
      ENDIF.
      DATA(lv_ft) = to_upper( condense( ls_in-ftype ) ).
      IF lv_ft <> 'I' AND lv_ft <> 'R'.
        rv = err( iv_text = 'Function type must be Input or Output' iv_code = 'FTYPE' iv_target = |{ lv_tg }.ftype| ). RETURN.
      ENDIF.
      DATA(lv_co) = to_upper( condense( ls_in-condition ) ).
      IF lv_co IS NOT INITIAL AND lv_co <> 'AND' AND lv_co <> 'OR'.
        rv = err( iv_text = 'Condition must be AND or OR' iv_code = 'CONDITION' iv_target = |{ lv_tg }.condition| ). RETURN.
      ENDIF.
      DATA(lv_pt) = to_upper( condense( ls_in-ptype ) ).
      IF lv_pt IS NOT INITIAL AND lv_pt <> 'H' AND lv_pt <> 'M' AND lv_pt <> 'L'.
        rv = err( iv_text = 'Priority must be High, Medium or Low' iv_code = 'PTYPE' iv_target = |{ lv_tg }.ptype| ). RETURN.
      ENDIF.
      APPEND VALUE #( rule_set_id = lv_id rule_id = num3( ls_in-rule_id ) datele = lv_dat value = lv_val zcondition = lv_co ftype = lv_ft
                      ptype = lv_pt defult = COND #( WHEN ls_in-is_default = abap_true THEN 'X' ELSE ' ' ) ) TO lt_db.
    ENDLOOP.
    " 3.7 step 4 loop 1: same priority everywhere; every rule needs an output row
    DATA(lv_ref) = lt_db[ 1 ]-ptype.
    LOOP AT lt_db INTO DATA(ls_d).
      lv_idx = sy-tabix.
      IF ls_d-ptype <> lv_ref.
        rv = err( iv_text = 'Priority Type should Be Same for all Rule ID' iv_code = 'PTYPE' iv_target = |items[{ lv_idx - 1 }].ptype| ). RETURN.
      ENDIF.
      READ TABLE lt_ids TRANSPORTING NO FIELDS WITH KEY table_line = ls_d-rule_id.
      IF sy-subrc <> 0. APPEND ls_d-rule_id TO lt_ids. ENDIF.
    ENDLOOP.
    LOOP AT lt_ids INTO DATA(lv_rid).
      READ TABLE lt_db TRANSPORTING NO FIELDS WITH KEY rule_id = lv_rid ftype = 'R'.
      IF sy-subrc <> 0.
        LOOP AT lt_db TRANSPORTING NO FIELDS WHERE rule_id = lv_rid. lv_idx = sy-tabix. EXIT. ENDLOOP.
        rv = err( iv_text = |Please enter atleast one output for Rule - { lv_rid }| iv_code = 'NO_OUTPUT' iv_target = |items[{ lv_idx - 1 }].ftype| ). RETURN.
      ENDIF.
    ENDLOOP.
    " loop 2: duplicate (rule id + field + value), missing field name
    LOOP AT lt_db INTO ls_d.
      lv_idx = sy-tabix.
      DATA(lv_first) = line_index( lt_db[ rule_id = ls_d-rule_id datele = ls_d-datele value = ls_d-value ] ).
      IF lv_first <> lv_idx.
        rv = err( iv_text = 'Duplicate entry found' iv_code = 'DUPLICATE' iv_target = |items[{ lv_idx - 1 }].datele| ). RETURN.
      ENDIF.
      IF ls_d-datele IS INITIAL.
        rv = err( iv_text = 'Please enter the field name' iv_code = 'DATELE' iv_target = |items[{ lv_idx - 1 }].datele| ). RETURN.
      ENDIF.
    ENDLOOP.
    " descriptions refreshed from the data dictionary, as SET_DESC did (blank when unknown)
    LOOP AT lt_db ASSIGNING FIELD-SYMBOL(<d>).
      <d>-datele_desc = dd_text( <d>-datele ).
    ENDLOOP.
    " write: replace the items of the set in ONE logical unit of work, under a table lock
    DATA lt_ins TYPE STANDARD TABLE OF /inowits/rule_i WITH DEFAULT KEY.
    MOVE-CORRESPONDING lt_db TO lt_ins.
    LOOP AT lt_ins ASSIGNING FIELD-SYMBOL(<i>). <i>-mandt = sy-mandt. ENDLOOP.
    DATA(lv_key) = CONV string( sy-mandt ).
    IF lock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is saving rules - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    SELECT SINGLE rule_set_id FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @DATA(lv_ex).
    IF sy-subrc <> 0.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'Please select a valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DELETE FROM /inowits/rule_i WHERE rule_set_id = @lv_id.
    INSERT /inowits/rule_i FROM TABLE @lt_ins.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'The rules could not be saved; nothing was changed' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
    rv = |\{"ok":true,"data":\{"ruleSetId":"{ lv_id }","rules":{ lines( lt_ids ) },"items":{ lines( lt_ins ) },"message":"Rule created successfully"\}\}|.
  ENDMETHOD.

  METHOD op_deleterule.
    IF is_num3( is_in-rule_set_id ) = abap_false.
      rv = err( iv_text = 'Please select a Valid Rule' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    IF is_num3( is_in-rule_id ) = abap_false.
      rv = err( iv_text = 'Please select a Valid Rule' iv_code = 'RULE_ID' iv_target = 'ruleId' ). RETURN.
    ENDIF.
    DATA(lv_id) = num3( is_in-rule_set_id ).
    DATA(lv_rid) = num3( is_in-rule_id ).
    DATA(lv_key) = CONV string( sy-mandt ).
    IF lock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is saving rules - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    SELECT COUNT(*) FROM /inowits/rule_i WHERE rule_set_id = @lv_id AND rule_id = @lv_rid INTO @DATA(lv_n).
    IF lv_n = 0.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'Please select a Rule' iv_code = 'RULE_ID' iv_target = 'ruleId' ). RETURN.
    ENDIF.
    DELETE FROM /inowits/rule_i WHERE rule_set_id = @lv_id AND rule_id = @lv_rid.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
      rv = err( iv_text = 'The rule could not be deleted' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/RULE_H' iv_key = lv_key ).
    rv = |\{"ok":true,"data":\{"ruleSetId":"{ lv_id }","ruleId":"{ lv_rid }","itemsDeleted":{ lv_n },"message":"Rule deleted successfully"\}\}|.
  ENDMETHOD.

  METHOD op_validate.
    " duplicate-rule detector (3.9): other rules of the application with the same input rows and the same output field
    TYPES: BEGIN OF ty_sig, set_id TYPE /inowits/rule_i-rule_set_id, rule_id TYPE /inowits/rule_i-rule_id, sig TYPE string, outf TYPE string, END OF ty_sig.
    TYPES: BEGIN OF ty_dup, rule_id TYPE string, dup_rule_set_id TYPE string, dup_rule_id TYPE string, rule_set_desc TYPE string,
             datele TYPE string, value TYPE string, ftype TYPE string, datele_desc TYPE string, END OF ty_dup.
    DATA lt_all TYPE ty_dbs.
    DATA lt_cand TYPE ty_dbs.
    DATA lt_sig TYPE STANDARD TABLE OF ty_sig WITH DEFAULT KEY.
    DATA lt_dup TYPE STANDARD TABLE OF ty_dup WITH DEFAULT KEY.
    IF is_num3( is_in-rule_set_id ) = abap_false.
      rv = err( iv_text = 'Please select a valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    DATA(lv_id) = num3( is_in-rule_set_id ).
    SELECT SINGLE * FROM /inowits/rule_h WHERE rule_set_id = @lv_id INTO @DATA(ls_h).
    IF sy-subrc <> 0.
      rv = err( iv_text = 'Please select a valid Rule Set' iv_code = 'RULE_SET' iv_target = 'ruleSetId' ). RETURN.
    ENDIF.
    " universe: all items of the application, except the set under test which is replaced by the given items (or kept as stored)
    SELECT i~rule_set_id, i~rule_id, i~datele, i~value, i~zcondition, i~ftype, i~datele_desc, i~ptype, i~defult
      FROM /inowits/rule_i AS i INNER JOIN /inowits/rule_h AS h ON h~rule_set_id = i~rule_set_id
      WHERE h~app_id = @ls_h-app_id INTO TABLE @lt_all.
    IF is_in-items IS NOT INITIAL.
      DELETE lt_all WHERE rule_set_id = lv_id.
      LOOP AT is_in-items INTO DATA(ls_in).
        IF is_num3( ls_in-rule_id ) = abap_false.
          rv = err( iv_text = 'Please enter a valid Rule Id' iv_code = 'RULE_ID' iv_target = 'items' ). RETURN.
        ENDIF.
        APPEND VALUE #( rule_set_id = lv_id rule_id = num3( ls_in-rule_id ) datele = to_upper( condense( ls_in-datele ) ) value = ls_in-value
          ftype = to_upper( condense( ls_in-ftype ) ) datele_desc = ls_in-datele_desc ) TO lt_all.
      ENDLOOP.
    ENDIF.
    SORT lt_all BY rule_set_id rule_id ftype datele value.
    " signature per rule
    DATA(lt_keys) = lt_all.
    DELETE ADJACENT DUPLICATES FROM lt_keys COMPARING rule_set_id rule_id.
    LOOP AT lt_keys INTO DATA(ls_k).
      DATA(ls_s) = VALUE ty_sig( set_id = ls_k-rule_set_id rule_id = ls_k-rule_id ).
      LOOP AT lt_all INTO DATA(ls_a) WHERE rule_set_id = ls_k-rule_set_id AND rule_id = ls_k-rule_id.
        IF ls_a-ftype = 'R'.
          IF ls_s-outf IS INITIAL. ls_s-outf = condense( ls_a-datele ). ENDIF.
        ELSE.
          ls_s-sig = ls_s-sig && |{ condense( ls_a-datele ) }={ ls_a-value }\||.
        ENDIF.
      ENDLOOP.
      APPEND ls_s TO lt_sig.
    ENDLOOP.
    DATA(lv_only) = COND #( WHEN is_in-rule_id IS NOT INITIAL AND is_num3( is_in-rule_id ) = abap_true THEN num3( is_in-rule_id ) ).
    SELECT rule_set_id, rule_desc FROM /inowits/rule_h WHERE app_id = @ls_h-app_id INTO TABLE @DATA(lt_hd).
    LOOP AT lt_sig INTO DATA(ls_c) WHERE set_id = lv_id.
      IF lv_only IS NOT INITIAL AND ls_c-rule_id <> lv_only. CONTINUE. ENDIF.
      LOOP AT lt_sig INTO DATA(ls_o) WHERE sig = ls_c-sig AND outf = ls_c-outf AND NOT ( set_id = ls_c-set_id AND rule_id = ls_c-rule_id ).
        DATA(lv_hdesc) = VALUE string( ).
        READ TABLE lt_hd INTO DATA(ls_hd) WITH KEY rule_set_id = ls_o-set_id.
        IF sy-subrc = 0. lv_hdesc = condense( ls_hd-rule_desc ). ENDIF.
        LOOP AT lt_all INTO ls_a WHERE rule_set_id = ls_o-set_id AND rule_id = ls_o-rule_id.
          APPEND VALUE #( rule_id = ls_c-rule_id dup_rule_set_id = ls_o-set_id dup_rule_id = ls_o-rule_id rule_set_desc = lv_hdesc
            datele = condense( ls_a-datele ) value = ls_a-value ftype = ls_a-ftype datele_desc = condense( ls_a-datele_desc ) ) TO lt_dup.
        ENDLOOP.
      ENDLOOP.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"duplicates":{ ser( lt_dup ) },"message":"{ COND string( WHEN lt_dup IS INITIAL THEN `Rule Validated, No Duplicates` ELSE `Duplicate rules found` ) }"\}\}|.
  ENDMETHOD.


  METHOD op_evaluate.
    TYPES: BEGIN OF ty_ev, rule_set_id TYPE /inowits/rule_h-rule_set_id, rule_desc TYPE /inowits/rule_h-rule_desc, rule_id TYPE /inowits/rule_i-rule_id,
             datele TYPE /inowits/rule_i-datele, value TYPE /inowits/rule_i-value, ftype TYPE /inowits/rule_i-ftype, defult TYPE /inowits/rule_i-defult, END OF ty_ev.
    TYPES: BEGIN OF ty_res, field TYPE string, value TYPE string, rule_set_id TYPE string, rule_id TYPE string, rule_set_desc TYPE string,
             overridable TYPE abap_bool, marker TYPE string, conflict TYPE abap_bool, END OF ty_res.
    DATA lt_ev TYPE STANDARD TABLE OF ty_ev WITH DEFAULT KEY.
    DATA lt_res TYPE STANDARD TABLE OF ty_res WITH DEFAULT KEY.
    DATA lt_sets TYPE STANDARD TABLE OF /inowits/rule_h-rule_set_id WITH DEFAULT KEY.
    DATA lt_rids TYPE STANDARD TABLE OF /inowits/rule_i-rule_id WITH DEFAULT KEY.
    DATA(lv_app) = CONV /inowits/rule_h-app_id( COND #( WHEN is_in-app IS INITIAL THEN 'M' ELSE to_upper( condense( is_in-app ) ) ) ).
    DATA(lv_scr) = CONV /inowits/rule_h-screen( to_upper( condense( is_in-screen ) ) ).
    " screen values of the request (field names upper case, values trimmed)
    DATA lt_val TYPE SORTED TABLE OF ty_kv WITH UNIQUE KEY field.
    LOOP AT is_in-values INTO DATA(ls_v).
      DATA(lv_f) = to_upper( condense( ls_v-field ) ).
      IF lv_f IS INITIAL. CONTINUE. ENDIF.
      INSERT VALUE #( field = lv_f value = condense( ls_v-value ) ) INTO TABLE lt_val.
    ENDLOOP.
    IF lv_scr IS INITIAL.
      SELECT h~rule_set_id, h~rule_desc, i~rule_id, i~datele, i~value, i~ftype, i~defult
        FROM /inowits/rule_h AS h INNER JOIN /inowits/rule_i AS i ON i~rule_set_id = h~rule_set_id
        WHERE h~app_id = @lv_app ORDER BY h~rule_set_id, i~rule_id, i~ftype, i~datele, i~value INTO CORRESPONDING FIELDS OF TABLE @lt_ev.
    ELSE.
      SELECT h~rule_set_id, h~rule_desc, i~rule_id, i~datele, i~value, i~ftype, i~defult
        FROM /inowits/rule_h AS h INNER JOIN /inowits/rule_i AS i ON i~rule_set_id = h~rule_set_id
        WHERE h~app_id = @lv_app AND h~screen = @lv_scr ORDER BY h~rule_set_id, i~rule_id, i~ftype, i~datele, i~value INTO CORRESPONDING FIELDS OF TABLE @lt_ev.
    ENDIF.
    LOOP AT lt_ev INTO DATA(ls_e).
      READ TABLE lt_sets TRANSPORTING NO FIELDS WITH KEY table_line = ls_e-rule_set_id.
      IF sy-subrc <> 0. APPEND ls_e-rule_set_id TO lt_sets. ENDIF.
    ENDLOOP.
    LOOP AT lt_sets INTO DATA(lv_set).
      " output field of the set = first R row; sets without R rows are skipped
      READ TABLE lt_ev INTO DATA(ls_r1) WITH KEY rule_set_id = lv_set ftype = 'R'.
      IF sy-subrc <> 0. CONTINUE. ENDIF.
      DATA(lv_out) = ls_r1-datele.
      DATA(lv_found) = abap_false.
      DATA(lv_value) = VALUE string( ).
      DATA(lv_rule) = VALUE /inowits/rule_i-rule_id( ).
      DATA(lv_has_in) = abap_false.
      LOOP AT lt_ev TRANSPORTING NO FIELDS WHERE rule_set_id = lv_set AND ftype <> 'R'. lv_has_in = abap_true. EXIT. ENDLOOP.
      IF lv_has_in = abap_false.
        " no inputs: unconditional default, the (first) output row
        lv_found = abap_true. lv_value = ls_r1-value. lv_rule = ls_r1-rule_id.
      ELSE.
        CLEAR lt_rids.
        LOOP AT lt_ev INTO ls_e WHERE rule_set_id = lv_set AND ftype <> 'R'.
          READ TABLE lt_rids TRANSPORTING NO FIELDS WITH KEY table_line = ls_e-rule_id.
          IF sy-subrc <> 0. APPEND ls_e-rule_id TO lt_rids. ENDIF.
        ENDLOOP.
        SORT lt_rids.
        LOOP AT lt_rids INTO DATA(lv_rid).
          DATA(lv_match) = abap_true.
          LOOP AT lt_ev INTO ls_e WHERE rule_set_id = lv_set AND rule_id = lv_rid AND ftype <> 'R'.
            DATA(lv_have) = VALUE string( ).
            READ TABLE lt_val INTO ls_v WITH TABLE KEY field = condense( ls_e-datele ).
            IF sy-subrc = 0. lv_have = ls_v-value. ENDIF.
            IF lv_have <> condense( ls_e-value ).
              lv_match = abap_false. EXIT.
            ENDIF.
          ENDLOOP.
          IF lv_match = abap_true.
            " the first matching rule wins; only an output row flagged Default is applied
            lv_rule = lv_rid.
            READ TABLE lt_ev INTO DATA(ls_r) WITH KEY rule_set_id = lv_set rule_id = lv_rid ftype = 'R' defult = 'X'.
            IF sy-subrc = 0. lv_found = abap_true. lv_value = ls_r-value. ENDIF.
            EXIT.
          ENDIF.
        ENDLOOP.
      ENDIF.
      IF lv_found = abap_true.
        APPEND VALUE #( field = condense( lv_out ) value = condense( lv_value ) rule_set_id = lv_set rule_id = lv_rule
          rule_set_desc = condense( ls_r1-rule_desc ) overridable = abap_true marker = 'R' ) TO lt_res.
      ENDIF.
    ENDLOOP.
    " several sets giving different values for one field: flag it, the old engine just let the later one override
    LOOP AT lt_res ASSIGNING FIELD-SYMBOL(<r>).
      LOOP AT lt_res INTO DATA(ls_o) WHERE field = <r>-field AND rule_set_id <> <r>-rule_set_id AND value <> <r>-value.
        <r>-conflict = abap_true. EXIT.
      ENDLOOP.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"app":"{ condense( lv_app ) }","screen":"{ condense( lv_scr ) }","setsEvaluated":{ lines( lt_sets ) },"results":{ ser( lt_res ) }\}\}|.
  ENDMETHOD.


  METHOD op_fieldtypes.
    TYPES: BEGIN OF ty_ver, vrsn TYPE string, rows TYPE i, END OF ty_ver.
    TYPES: BEGIN OF ty_t, mtart TYPE string, text TYPE string, active_version TYPE string, versions TYPE STANDARD TABLE OF ty_ver WITH DEFAULT KEY, END OF ty_t.
    DATA lt TYPE STANDARD TABLE OF ty_t WITH DEFAULT KEY.
    SELECT matrltyp, vrsn, COUNT(*) AS n FROM /inowits/mdm_mcn WHERE matrltyp <> ' ' GROUP BY matrltyp, vrsn ORDER BY matrltyp, vrsn INTO TABLE @DATA(lt_g).
    SELECT mtart, mtbez FROM t134t WHERE spras = 'E' INTO TABLE @DATA(lt_t).
    LOOP AT lt_g INTO DATA(ls_g).
      READ TABLE lt ASSIGNING FIELD-SYMBOL(<t>) WITH KEY mtart = ls_g-matrltyp.
      IF sy-subrc <> 0.
        APPEND VALUE #( mtart = ls_g-matrltyp ) TO lt ASSIGNING <t>.
        READ TABLE lt_t INTO DATA(ls_t) WITH KEY mtart = ls_g-matrltyp.
        IF sy-subrc = 0. <t>-text = condense( ls_t-mtbez ). ENDIF.
      ENDIF.
      APPEND VALUE #( vrsn = ls_g-vrsn rows = ls_g-n ) TO <t>-versions.
      <t>-active_version = ls_g-vrsn.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"types":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_fieldviews.
    TYPES: BEGIN OF ty_v, view TYPE string, label TYPE string, headings TYPE i, fields TYPE i, visible TYPE i, required TYPE i, display_only TYPE i, END OF ty_v.
    DATA lt TYPE STANDARD TABLE OF ty_v WITH DEFAULT KEY.
    DATA(lv_mt) = CONV mtart( to_upper( condense( is_in-mtart ) ) ).
    IF lv_mt IS INITIAL.
      rv = err( iv_text = 'Please select a material type' iv_code = 'MTART' iv_target = 'mtart' ). RETURN.
    ENDIF.
    DATA(lv_ver) = COND /inowits/mdm_mcn-vrsn( WHEN is_num3( is_in-vrsn ) = abap_true THEN num3( is_in-vrsn ) ).
    IF lv_ver IS INITIAL AND is_in-vrsn IS INITIAL.
      SELECT MAX( vrsn ) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt INTO @lv_ver.
    ENDIF.
    SELECT vwnm, hd, dsply, rqr, fnm FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt AND vrsn = @lv_ver ORDER BY vwnm INTO TABLE @DATA(lt_r).
    IF lt_r IS INITIAL.
      rv = err( iv_text = 'No field control exists for this material type and version' iv_code = 'NOT_FOUND' ). RETURN.
    ENDIF.
    LOOP AT lt_r INTO DATA(ls_r).
      READ TABLE lt ASSIGNING FIELD-SYMBOL(<v>) WITH KEY view = condense( ls_r-vwnm ).
      IF sy-subrc <> 0.
        APPEND VALUE #( view = condense( ls_r-vwnm ) label = COND #( WHEN ls_r-vwnm IS INITIAL THEN `(general)` ELSE condense( ls_r-vwnm ) ) ) TO lt ASSIGNING <v>.
      ENDIF.
      IF ls_r-fnm CP 'H_*'. <v>-headings = <v>-headings + 1. CONTINUE. ENDIF.
      <v>-fields = <v>-fields + 1.
      IF ls_r-hd = 'X'. <v>-visible = <v>-visible + 1. ENDIF.
      IF ls_r-rqr = 'X'. <v>-required = <v>-required + 1. ENDIF.
      IF ls_r-dsply = 'X'. <v>-display_only = <v>-display_only + 1. ENDIF.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"mtart":"{ lv_mt }","vrsn":"{ lv_ver }","views":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_fieldrows.
    TYPES: BEGIN OF ty_fr, cnt TYPE string, view TYPE string, field TYPE string, dname TYPE string, text TYPE string, visible TYPE abap_bool,
             required TYPE abap_bool, display_only TYPE abap_bool, col TYPE string, heading TYPE abap_bool, END OF ty_fr.
    DATA lt TYPE STANDARD TABLE OF ty_fr WITH DEFAULT KEY.
    DATA(lv_mt) = CONV mtart( to_upper( condense( is_in-mtart ) ) ).
    IF lv_mt IS INITIAL.
      rv = err( iv_text = 'Please select a material type' iv_code = 'MTART' iv_target = 'mtart' ). RETURN.
    ENDIF.
    DATA(lv_ver) = COND /inowits/mdm_mcn-vrsn( WHEN is_num3( is_in-vrsn ) = abap_true THEN num3( is_in-vrsn ) ).
    IF lv_ver IS INITIAL AND is_in-vrsn IS INITIAL.
      SELECT MAX( vrsn ) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt INTO @lv_ver.
    ENDIF.
    DATA(lv_view) = CONV /inowits/mdm_mcn-vwnm( COND #( WHEN is_in-view = '(general)' THEN '' ELSE to_upper( condense( is_in-view ) ) ) ).
    SELECT cnt, vwnm, fnm, dname, hd, dsply, rqr, col_flag FROM /inowits/mdm_mcn
      WHERE matrltyp = @lv_mt AND vrsn = @lv_ver AND vwnm = @lv_view ORDER BY cnt INTO TABLE @DATA(lt_r).
    LOOP AT lt_r INTO DATA(ls_r).
      APPEND VALUE #( cnt = ls_r-cnt view = condense( ls_r-vwnm ) field = condense( ls_r-fnm ) dname = condense( ls_r-dname )
        text = dd_text( COND string( WHEN ls_r-dname IS NOT INITIAL THEN ls_r-dname ELSE ls_r-fnm ) )
        visible = xsdbool( ls_r-hd = 'X' ) required = xsdbool( ls_r-rqr = 'X' ) display_only = xsdbool( ls_r-dsply = 'X' )
        col = condense( ls_r-col_flag ) heading = xsdbool( ls_r-fnm CP 'H_*' ) ) TO lt.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"mtart":"{ lv_mt }","vrsn":"{ lv_ver }","rows":{ ser( lt ) }\}\}|.
  ENDMETHOD.

  METHOD op_publish.
    " publishing = writing version MAX+1 of one material type: a copy of the active version with the given flag changes
    DATA lt_new TYPE STANDARD TABLE OF /inowits/mdm_mcn WITH DEFAULT KEY.
    DATA(lv_mt) = CONV mtart( to_upper( condense( is_in-mtart ) ) ).
    IF lv_mt IS INITIAL.
      rv = err( iv_text = 'Please select a material type' iv_code = 'MTART' iv_target = 'mtart' ). RETURN.
    ENDIF.
    IF is_in-changes IS INITIAL.
      rv = err( iv_text = 'There are no changes to publish' iv_code = 'NO_CHANGES' ). RETURN.
    ENDIF.
    DATA(lv_key) = |{ sy-mandt }{ lv_mt }|.
    IF lock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is publishing this field control - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    SELECT MAX( vrsn ) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt INTO @DATA(lv_max).
    SELECT * FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt AND vrsn = @lv_max INTO TABLE @DATA(lt_cur).
    IF lt_cur IS INITIAL.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'No field control exists for this material type' iv_code = 'NOT_FOUND' iv_target = 'mtart' ). RETURN.
    ENDIF.
    IF lv_max >= 999.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'No free version number is left (maximum 999)' iv_code = 'VERSION' ). RETURN.
    ENDIF.
    lt_new = lt_cur.
    DATA(lv_changed) = 0.
    LOOP AT is_in-changes INTO DATA(ls_c).
      IF is_num3( ls_c-cnt ) = abap_false.
        unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
        rv = err( iv_text = 'A change refers to an invalid row' iv_code = 'CNT' iv_target = 'changes' ). RETURN.
      ENDIF.
      DATA(lv_cnt) = num3( ls_c-cnt ).
      READ TABLE lt_new ASSIGNING FIELD-SYMBOL(<n>) WITH KEY cnt = lv_cnt.
      IF sy-subrc <> 0.
        unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
        rv = err( iv_text = |Row { lv_cnt } does not exist in the active version - reload and try again| iv_code = 'CNT' iv_target = 'changes' ). RETURN.
      ENDIF.
      IF <n>-fnm CP 'H_*'.
        unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
        rv = err( iv_text = |Heading row { lv_cnt } cannot be changed| iv_code = 'HEADING' iv_target = 'changes' ). RETURN.
      ENDIF.
      DATA(lv_hd) = COND char2( WHEN ls_c-visible = abap_true THEN 'X' ELSE ' ' ).
      DATA(lv_rq) = COND char2( WHEN ls_c-required = abap_true THEN 'X' ELSE ' ' ).
      DATA(lv_ds) = COND char1( WHEN ls_c-display_only = abap_true THEN 'X' ELSE ' ' ).
      IF <n>-hd <> lv_hd OR <n>-rqr <> lv_rq OR <n>-dsply <> lv_ds.
        lv_changed = lv_changed + 1.
        <n>-hd = lv_hd. <n>-rqr = lv_rq. <n>-dsply = lv_ds.
      ENDIF.
    ENDLOOP.
    IF lv_changed = 0.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'There are no changes to publish' iv_code = 'NO_CHANGES' ). RETURN.
    ENDIF.
    DATA(lv_newv) = CONV /inowits/mdm_mcn-vrsn( lv_max + 1 ).
    LOOP AT lt_new ASSIGNING <n>. <n>-vrsn = lv_newv. <n>-mandt = sy-mandt. ENDLOOP.
    INSERT /inowits/mdm_mcn FROM TABLE @lt_new.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'The new version could not be written; nothing was changed' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
    rv = |\{"ok":true,"data":\{"mtart":"{ lv_mt }","previousVersion":"{ lv_max }","newVersion":"{ lv_newv }","rowsCopied":{ lines( lt_new ) },"rowsChanged":{ lv_changed },| &&
         |"message":"Version { lv_newv } published for { lv_mt }"\}\}|.
  ENDMETHOD.

  METHOD op_delversion.
    " roll back a publish: only the HIGHEST version, and only while an older version remains
    DATA(lv_mt) = CONV mtart( to_upper( condense( is_in-mtart ) ) ).
    IF lv_mt IS INITIAL OR is_num3( is_in-vrsn ) = abap_false.
      rv = err( iv_text = 'Please select a material type and version' iv_code = 'MTART' iv_target = 'mtart' ). RETURN.
    ENDIF.
    DATA(lv_ver) = CONV /inowits/mdm_mcn-vrsn( num3( is_in-vrsn ) ).
    DATA(lv_key) = |{ sy-mandt }{ lv_mt }|.
    IF lock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ) = abap_false.
      rv = err( iv_text = 'Another administrator is publishing this field control - try again in a moment' iv_code = 'LOCKED' ). RETURN.
    ENDIF.
    SELECT MAX( vrsn ) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt INTO @DATA(lv_max).
    SELECT COUNT( DISTINCT vrsn ) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt INTO @DATA(lv_nv).
    IF lv_ver <> lv_max.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = |Only the active (highest) version { lv_max } can be removed| iv_code = 'VERSION' iv_target = 'vrsn' ). RETURN.
    ENDIF.
    IF lv_nv < 2.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'The only version of a material type cannot be removed' iv_code = 'VERSION' iv_target = 'vrsn' ). RETURN.
    ENDIF.
    SELECT COUNT(*) FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt AND vrsn = @lv_ver INTO @DATA(lv_n).
    DELETE FROM /inowits/mdm_mcn WHERE matrltyp = @lv_mt AND vrsn = @lv_ver.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
      rv = err( iv_text = 'The version could not be removed' iv_code = 'DB' ). RETURN.
    ENDIF.
    COMMIT WORK AND WAIT.
    unlock( iv_tab = '/INOWITS/MDM_MCN' iv_key = lv_key ).
    rv = |\{"ok":true,"data":\{"mtart":"{ lv_mt }","removedVersion":"{ lv_ver }","rowsDeleted":{ lv_n },"message":"Version { lv_ver } removed, the previous version is active again"\}\}|.
  ENDMETHOD.

  METHOD op_overrides.
    TYPES: BEGIN OF ty_o, app_type TYPE string, level TYPE string, dept TYPE string, mtart TYPE string, field TYPE string, display_only TYPE abap_bool, required TYPE abap_bool, END OF ty_o.
    TYPES: BEGIN OF ty_u, user TYPE string, dept TYPE string, END OF ty_u.
    DATA lt_o TYPE STANDARD TABLE OF ty_o WITH DEFAULT KEY.
    DATA lt_u TYPE STANDARD TABLE OF ty_u WITH DEFAULT KEY.
    SELECT app_type, lvl, dept, mtart, fnm, dsply, rqr FROM /inowits/mm_feld ORDER BY app_type, lvl, dept, mtart, fnm INTO TABLE @DATA(lt_f).
    LOOP AT lt_f INTO DATA(ls_f).
      APPEND VALUE #( app_type = condense( ls_f-app_type ) level = condense( ls_f-lvl ) dept = condense( ls_f-dept ) mtart = condense( ls_f-mtart )
        field = condense( ls_f-fnm ) display_only = xsdbool( ls_f-dsply = 'X' ) required = xsdbool( ls_f-rqr = 'X' ) ) TO lt_o.
    ENDLOOP.
    SELECT bname, dept FROM /inowits/usr_dep ORDER BY bname INTO TABLE @DATA(lt_d).
    LOOP AT lt_d INTO DATA(ls_d).
      APPEND VALUE #( user = condense( ls_d-bname ) dept = condense( ls_d-dept ) ) TO lt_u.
    ENDLOOP.
    rv = |\{"ok":true,"data":\{"overrides":{ ser( lt_o ) },"userDepartments":{ ser( lt_u ) }\}\}|.
  ENDMETHOD.

ENDCLASS.
