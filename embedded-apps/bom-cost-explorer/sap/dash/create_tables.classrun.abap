CLASS zcl_pkg_tmp1 DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_f,
             name TYPE fieldname, key TYPE abap_bool, roll TYPE rollname,
             dtyp TYPE datatype_d, len TYPE ddleng, dec TYPE decimals,
           END OF ty_f,
           tt_f TYPE STANDARD TABLE OF ty_f WITH DEFAULT KEY.
    METHODS reg IMPORTING iv_name TYPE tabname.
    METHODS mk IMPORTING iv_name TYPE tabname iv_text TYPE ddtext it_f TYPE tt_f.
    DATA mt_log TYPE string_table.
ENDCLASS.
CLASS zcl_pkg_tmp1 IMPLEMENTATION.
  METHOD reg.
    DATA: lt_e071 TYPE STANDARD TABLE OF e071, ls_e071 TYPE e071, lt_k TYPE STANDARD TABLE OF e071k.
    CALL FUNCTION 'TR_TADIR_INTERFACE'
      EXPORTING
        wi_test_modus       = ' '
        wi_tadir_pgmid      = 'R3TR'
        wi_tadir_object     = 'TABL'
        wi_tadir_obj_name   = CONV sobj_name( iv_name )
        wi_tadir_devclass   = 'ZEMAMI'
        wi_tadir_author     = sy-uname
      EXCEPTIONS
        OTHERS              = 1.
    APPEND |{ iv_name } tadir subrc={ sy-subrc }| TO mt_log.
    ls_e071-pgmid = 'R3TR'. ls_e071-object = 'TABL'. ls_e071-obj_name = iv_name.
    APPEND ls_e071 TO lt_e071.
    CALL FUNCTION 'TR_APPEND_TO_COMM_OBJECTS_KEYS'
      EXPORTING
        wi_simulation         = ' '
        wi_suppress_key_check = 'X'
        wi_trkorr             = 'EDSK9B0EM7'
      TABLES
        wt_e071               = lt_e071
        wt_e071k              = lt_k
      EXCEPTIONS
        OTHERS                = 1.
    APPEND |{ iv_name } transport subrc={ sy-subrc }| TO mt_log.
  ENDMETHOD.

  METHOD mk.
    DATA: ls_h TYPE dd02v, ls_t TYPE dd09v, lt_f TYPE STANDARD TABLE OF dd03p, ls_p TYPE dd03p, lv_rc TYPE sy-subrc, lv_pos TYPE i.
    ls_h-tabname = iv_name. ls_h-ddlanguage = 'E'. ls_h-tabclass = 'TRANSP'. ls_h-ddtext = iv_text.
    ls_h-contflag = 'A'. ls_h-mainflag = 'X'. ls_h-as4user = sy-uname. ls_h-exclass = '1'.
    ls_t-tabname = iv_name. ls_t-tabart = 'APPL1'. ls_t-tabkat = '0'. ls_t-bufallow = 'N'. ls_t-protokoll = ' '.
    LOOP AT it_f INTO DATA(ls_f).
      lv_pos = lv_pos + 1.
      CLEAR ls_p.
      ls_p-tabname = iv_name. ls_p-fieldname = ls_f-name. ls_p-position = lv_pos.
      ls_p-keyflag = ls_f-key. ls_p-notnull = ls_f-key.
      IF ls_f-roll IS NOT INITIAL.
        ls_p-comptype = 'E'. ls_p-rollname = ls_f-roll. ls_p-adminfield = '0'.
      ELSE.
        ls_p-datatype = ls_f-dtyp. ls_p-leng = ls_f-len. ls_p-decimals = ls_f-dec. ls_p-adminfield = '0'.
        IF ls_f-dtyp = 'CHAR'. ls_p-inttype = 'C'. ls_p-intlen = ls_f-len * 2. ls_p-mask = ' '. ENDIF.
        IF ls_f-dtyp = 'DEC'.  ls_p-inttype = 'P'. ls_p-intlen = ( ls_f-len + 1 ) / 2. ENDIF.
      ENDIF.
      APPEND ls_p TO lt_f.
    ENDLOOP.
    CALL FUNCTION 'DDIF_TABL_PUT'
      EXPORTING name = iv_name dd02v_wa = ls_h dd09l_wa = ls_t
      TABLES dd03p_tab = lt_f
      EXCEPTIONS
        tabl_not_found = 1
        name_inconsistent = 2
        tabl_inconsistent = 3
        put_failure = 4
        put_refused = 5
        OTHERS = 6.
    APPEND |{ iv_name } put subrc={ sy-subrc } { sy-msgid } { sy-msgno } { sy-msgv1 } { sy-msgv2 } { sy-msgv3 }| TO mt_log.
    IF sy-subrc <> 0. RETURN. ENDIF.
    CALL FUNCTION 'DDIF_TABL_ACTIVATE'
      EXPORTING name = iv_name auth_chk = ' '
      IMPORTING rc = lv_rc
      EXCEPTIONS OTHERS = 1.
    APPEND |{ iv_name } activate rc={ lv_rc } subrc={ sy-subrc }| TO mt_log.
  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.
    mk( iv_name = 'ZMIS_ALERT_THR' iv_text = 'Dashboard alert bands by SKU category' 
        it_f = VALUE #(
          ( name = 'MANDT'    key = abap_true roll = 'MANDT' )
          ( name = 'METRIC'   key = abap_true dtyp = 'CHAR' len = 6 )
          ( name = 'CATEGORY' key = abap_true roll = 'MATKL' )
          ( name = 'RED_PCT'   dtyp = 'DEC' len = 7 dec = 2 )
          ( name = 'AMBER_PCT' dtyp = 'DEC' len = 7 dec = 2 )
          ( name = 'HIGH_BAD'  dtyp = 'CHAR' len = 1 )
          ( name = 'CHANGED_BY' roll = 'UNAME' )
          ( name = 'CHANGED_ON' roll = 'DATUM' ) ) ).
    reg( 'ZSALES_BUD_TGT' ).
    reg( 'ZMIS_ALERT_THR' ).
    LOOP AT mt_log INTO DATA(lv_l). out->write( lv_l ). ENDLOOP.
  ENDMETHOD.
ENDCLASS.
