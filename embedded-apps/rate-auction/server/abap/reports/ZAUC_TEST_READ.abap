*&---------------------------------------------------------------------*
*& Report ZAUC_TEST_READ  (SE38)
*& Calls the read function modules directly, without RFC and without the app.
*&---------------------------------------------------------------------*
REPORT zauc_test_read.

PARAMETERS: p_mtart TYPE mtart DEFAULT 'ROH',
            p_matnr TYPE char40,
            p_term  TYPE char40.

DATA: lv_sysid TYPE sysysid,
      lv_mandt TYPE mandt,
      lt_mat   TYPE STANDARD TABLE OF zauc_s_material,
      ls_mat   TYPE zauc_s_material,
      lt_ven   TYPE STANDARD TABLE OF zauc_s_vendor,
      ls_ven   TYPE zauc_s_vendor,
      lt_lif   TYPE STANDARD TABLE OF zauc_s_lifnr,
      lv_netpr TYPE zauc_rate,
      lv_waers TYPE waers,
      lv_found TYPE zauc_flag,
      lv_lines TYPE i.

START-OF-SELECTION.
  CALL FUNCTION 'Z_AUC_PING'
    IMPORTING ev_sysid = lv_sysid ev_mandt = lv_mandt.
  WRITE: / 'System', lv_sysid, 'client', lv_mandt.

  CALL FUNCTION 'Z_AUC_GET_MATERIALS'
    EXPORTING iv_mtart = p_mtart iv_max = 20
    TABLES    et_materials = lt_mat.
  DESCRIBE TABLE lt_mat LINES lv_lines.
  SKIP.
  WRITE: / 'Materials of type', p_mtart, '(first 20):', lv_lines.
  LOOP AT lt_mat INTO ls_mat.
    WRITE: / ls_mat-matnr, ls_mat-meins, ls_mat-maktx.
  ENDLOOP.

  IF p_matnr IS NOT INITIAL.
    CALL FUNCTION 'Z_AUC_GET_LAST_RATE'
      EXPORTING iv_matnr = p_matnr
      IMPORTING ev_netpr = lv_netpr ev_waers = lv_waers ev_found = lv_found.
    SKIP.
    IF lv_found = 'X'.
      WRITE: / 'Last rate for', p_matnr, ':', lv_netpr, lv_waers.
    ELSE.
      WRITE: / 'No info record price found for', p_matnr.
    ENDIF.
  ENDIF.

  IF p_term IS NOT INITIAL.
    CALL FUNCTION 'Z_AUC_GET_VENDORS'
      EXPORTING iv_term = p_term iv_max = 20
      TABLES    it_lifnr = lt_lif et_vendors = lt_ven.
    SKIP.
    WRITE: / 'Vendors matching', p_term.
    LOOP AT lt_ven INTO ls_ven.
      WRITE: / ls_ven-lifnr, ls_ven-name1, ls_ven-email.
    ENDLOOP.
  ENDIF.
