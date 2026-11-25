CLASS zcl_capex_auth DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES tt_werks TYPE STANDARD TABLE OF werks_d WITH DEFAULT KEY.

    CLASS-METHODS get_user
      IMPORTING iv_userid      TYPE xubname OPTIONAL
      RETURNING VALUE(rs_user) TYPE zcapex_user.
    CLASS-METHODS has_role
      IMPORTING iv_userid     TYPE xubname OPTIONAL
                iv_role       TYPE zcapex_de_role
      RETURNING VALUE(rv_has) TYPE abap_bool.
    "! iv_roles is a comma-separated list, e.g. the config value EVAL_ROLES.
    CLASS-METHODS has_any_role
      IMPORTING iv_userid     TYPE xubname OPTIONAL
                iv_roles      TYPE csequence
      RETURNING VALUE(rv_has) TYPE abap_bool.
    CLASS-METHODS is_admin
      IMPORTING iv_userid       TYPE xubname OPTIONAL
      RETURNING VALUE(rv_admin) TYPE abap_bool.
    "! Global users see every plant; others only the plants in ZCAPEX_USRPLT.
    CLASS-METHODS can_see_plant
      IMPORTING iv_userid         TYPE xubname OPTIONAL
                iv_werks          TYPE werks_d
      RETURNING VALUE(rv_allowed) TYPE abap_bool.
    CLASS-METHODS check_plant
      IMPORTING iv_werks TYPE werks_d
      RAISING   zcx_capex_error.
    CLASS-METHODS plants_of
      IMPORTING iv_userid       TYPE xubname OPTIONAL
      RETURNING VALUE(rt_werks) TYPE tt_werks.
    "! Optional PFCG check on Z_CAPEX (config USE_PFCG_CHECK = X).
    "! ACTVT 01 create, 02 change, 03 display, 43 release/approve.
    CLASS-METHODS check_activity
      IMPORTING iv_actvt     TYPE activ_auth
                iv_werks     TYPE werks_d
                iv_capextype TYPE zcapex_de_cpxtype OPTIONAL
      RAISING   zcx_capex_error.
    "! Business user for this request. The gateway signs in as one technical user; when the hub sends a
    "! trusted e-mail (query options zcpxmail + zcpxkey, key checked against config PROXY_SECRET, caller must be
    "! listed in PROXY_USERS, default WDA_AUDIT) the matching active ZCAPEX_USER row is the effective user.
    "! Anything else (Fiori, no e-mail, wrong key, no secret configured) returns sy-uname, exactly as before.
    CLASS-METHODS effective_user
      RETURNING VALUE(rv_user) TYPE xubname.
    "! Called once per OData request by the data provider with the raw query options.
    CLASS-METHODS set_proxy_identity
      IMPORTING iv_email TYPE string OPTIONAL
                iv_key   TYPE string OPTIONAL
                iv_admin TYPE string OPTIONAL.
    "! True only for a verified hub call (same PROXY_SECRET + PROXY_USERS checks as effective_user) on which the hub
    "! vouched that the signed-in person is an Admin of the CAPEX Portal app in Emami Apps (query option zcpxadm = X).
    "! Maintenance (users, DOA rules, settings) is allowed on this; Fiori never sends it, so Fiori is unaffected.
    CLASS-METHODS proxy_admin
      RETURNING VALUE(rv_ok) TYPE abap_bool.
    "! The hub e-mail of the current request (only meaningful together with proxy_admin; used for the audit trail).
    CLASS-METHODS proxy_email
      RETURNING VALUE(rv_email) TYPE string.
  PRIVATE SECTION.
    CLASS-DATA gv_email    TYPE string.
    CLASS-DATA gv_key      TYPE string.
    CLASS-DATA gv_admin    TYPE string.
    CLASS-DATA gv_resolved TYPE abap_bool.
    CLASS-DATA gv_user     TYPE xubname.
    TYPES: BEGIN OF ty_plant,
             userid TYPE xubname,
             werks  TYPE werks_d,
           END OF ty_plant.
    CLASS-DATA gt_users  TYPE HASHED TABLE OF zcapex_user WITH UNIQUE KEY userid.
    CLASS-DATA gt_plants TYPE HASHED TABLE OF ty_plant WITH UNIQUE KEY userid werks.
    CLASS-DATA gt_loaded TYPE HASHED TABLE OF xubname WITH UNIQUE KEY table_line.
    CLASS-METHODS load_plants
      IMPORTING iv_userid TYPE xubname.
ENDCLASS.



CLASS ZCL_CAPEX_AUTH IMPLEMENTATION.


  METHOD can_see_plant.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    IF ls_user-active = abap_false.
      RETURN.
    ENDIF.
    IF ls_user-is_global = abap_true.
      rv_allowed = abap_true.
      RETURN.
    ENDIF.
    load_plants( lv_uid ).
    rv_allowed = xsdbool( line_exists( gt_plants[ userid = lv_uid werks = iv_werks ] ) ).
  ENDMETHOD.


  METHOD check_activity.
    IF zcl_capex_config=>get_flag( 'USE_PFCG_CHECK' ) = abap_false.
      RETURN.
    ENDIF.
    IF iv_capextype IS SUPPLIED AND iv_capextype IS NOT INITIAL.
      AUTHORITY-CHECK OBJECT 'Z_CAPEX'
        ID 'ACTVT'    FIELD iv_actvt
        ID 'WERKS'    FIELD iv_werks
        ID 'ZCPXTYPE' FIELD iv_capextype.
    ELSE.
      AUTHORITY-CHECK OBJECT 'Z_CAPEX'
        ID 'ACTVT'    FIELD iv_actvt
        ID 'WERKS'    FIELD iv_werks
        ID 'ZCPXTYPE' DUMMY.
    ENDIF.
    IF sy-subrc <> 0.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-plant_not_authorised iv_1 = iv_werks ).
    ENDIF.
  ENDMETHOD.


  METHOD check_plant.
    " Administrators work across all plants.
    IF is_admin( ) = abap_true.
      RETURN.
    ENDIF.
    IF can_see_plant( iv_werks = iv_werks ) = abap_false.
      zcx_capex_error=>raise( iv_msgno = zcx_capex_error=>msg-plant_not_authorised iv_1 = iv_werks ).
    ENDIF.
  ENDMETHOD.


  METHOD get_user.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    READ TABLE gt_users INTO rs_user WITH TABLE KEY userid = lv_uid.
    IF sy-subrc <> 0.
      SELECT SINGLE * FROM zcapex_user INTO @rs_user WHERE userid = @lv_uid.
      IF sy-subrc = 0.
        INSERT rs_user INTO TABLE gt_users.
      ELSE.
        CLEAR rs_user.
      ENDIF.
    ENDIF.
  ENDMETHOD.


  METHOD has_any_role.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    SPLIT iv_roles AT ',' INTO TABLE DATA(lt_roles).
    LOOP AT lt_roles INTO DATA(lv_role).
      CONDENSE lv_role.
      IF has_role( iv_userid = lv_uid iv_role = CONV #( lv_role ) ) = abap_true.
        rv_has = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD has_role.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    rv_has = xsdbool( ls_user-active = abap_true AND ls_user-role = iv_role ).
  ENDMETHOD.


  METHOD is_admin.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    DATA(ls_user) = get_user( lv_uid ).
    rv_admin = xsdbool( ls_user-active = abap_true AND ls_user-is_admin = abap_true ).
  ENDMETHOD.


  METHOD load_plants.
    IF line_exists( gt_loaded[ table_line = iv_userid ] ).
      RETURN.
    ENDIF.
    SELECT userid, werks FROM zcapex_usrplt INTO TABLE @DATA(lt_rows)
      WHERE userid = @iv_userid.
    INSERT LINES OF lt_rows INTO TABLE gt_plants.
    INSERT iv_userid INTO TABLE gt_loaded.
  ENDMETHOD.


  METHOD plants_of.
    DATA(lv_uid) = COND xubname( WHEN iv_userid IS SUPPLIED THEN iv_userid ELSE effective_user( ) ).
    load_plants( lv_uid ).
    LOOP AT gt_plants INTO DATA(ls_plant) WHERE userid = lv_uid.
      APPEND ls_plant-werks TO rt_werks.
    ENDLOOP.
  ENDMETHOD.

  METHOD set_proxy_identity.
    gv_email = condense( iv_email ).
    gv_key = iv_key.
    gv_admin = condense( iv_admin ).
    CLEAR: gv_resolved, gv_user.
  ENDMETHOD.


  METHOD proxy_email.
    rv_email = gv_email.
  ENDMETHOD.


  METHOD proxy_admin.
    IF gv_admin <> 'X'.
      RETURN.
    ENDIF.
    DATA(lv_secret) = condense( CONV string( zcl_capex_config=>get( 'PROXY_SECRET' ) ) ).
    IF lv_secret IS INITIAL OR gv_key <> lv_secret.
      RETURN.
    ENDIF.
    DATA(lv_trusted) = condense( CONV string( zcl_capex_config=>get( 'PROXY_USERS' ) ) ).
    IF lv_trusted IS INITIAL.
      lv_trusted = `WDA_AUDIT`.
    ENDIF.
    SPLIT lv_trusted AT ',' INTO TABLE DATA(lt_trusted).
    LOOP AT lt_trusted INTO DATA(lv_t).
      IF to_upper( condense( lv_t ) ) = sy-uname.
        rv_ok = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD effective_user.
    rv_user = sy-uname.
    IF gv_email IS INITIAL.
      RETURN.
    ENDIF.
    IF gv_resolved = abap_true.
      IF gv_user IS NOT INITIAL.
        rv_user = gv_user.
      ENDIF.
      RETURN.
    ENDIF.
    gv_resolved = abap_true.

    " 1. The shared secret must be configured and match; otherwise the e-mail channel is off.
    DATA(lv_secret) = condense( CONV string( zcl_capex_config=>get( 'PROXY_SECRET' ) ) ).
    IF lv_secret IS INITIAL OR gv_key <> lv_secret.
      RETURN.
    ENDIF.

    " 2. Only the listed technical user(s) may speak for someone else.
    DATA(lv_trusted) = condense( CONV string( zcl_capex_config=>get( 'PROXY_USERS' ) ) ).
    IF lv_trusted IS INITIAL.
      lv_trusted = `WDA_AUDIT`.
    ENDIF.
    SPLIT lv_trusted AT ',' INTO TABLE DATA(lt_trusted).
    DATA(lv_ok) = abap_false.
    LOOP AT lt_trusted INTO DATA(lv_t).
      IF to_upper( condense( lv_t ) ) = sy-uname.
        lv_ok = abap_true.
      ENDIF.
    ENDLOOP.
    IF lv_ok = abap_false.
      RETURN.
    ENDIF.

    " 3. Exactly one active user row with this e-mail; anything else gets no privileges (the technical user).
    SELECT userid, email, active FROM zcapex_user INTO TABLE @DATA(lt_users).
    DATA(lv_mail) = to_upper( gv_email ).
    DATA(lv_hits) = 0.
    DATA lv_found TYPE xubname.
    LOOP AT lt_users INTO DATA(ls_u).
      IF ls_u-active = abap_true AND to_upper( condense( CONV string( ls_u-email ) ) ) = lv_mail.
        lv_hits = lv_hits + 1.
        lv_found = ls_u-userid.
      ENDIF.
    ENDLOOP.
    IF lv_hits = 1.
      gv_user = lv_found.
      rv_user = lv_found.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
