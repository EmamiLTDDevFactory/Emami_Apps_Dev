*&---------------------------------------------------------------------*
*& Function module Z_AUC_GET_VENDORS
*& Attributes: Remote-Enabled Module
*& Import:  IV_TERM TYPE CHAR40               (optional)
*&          IV_MAX  TYPE I DEFAULT 50         (optional)
*& Tables:  IT_LIFNR   LIKE ZAUC_S_LIFNR      (optional)
*&          ET_VENDORS LIKE ZAUC_S_VENDOR
*& Either exact vendor numbers (IT_LIFNR) or part of a name (IV_TERM).
*& Both empty returns nothing, so the whole vendor master can never be dumped.
*&---------------------------------------------------------------------*
  DATA: lt_lfa1  TYPE STANDARD TABLE OF lfa1,
        ls_lfa1  TYPE lfa1,
        lv_pat   TYPE char42,
        lv_term  TYPE char40,
        lv_lifnr TYPE lfa1-lifnr,
        lr_lifnr TYPE RANGE OF lfa1-lifnr,
        ls_range LIKE LINE OF lr_lifnr.

  REFRESH et_vendors.
  IF it_lifnr[] IS INITIAL AND iv_term IS INITIAL.
    RETURN.
  ENDIF.

  IF it_lifnr[] IS NOT INITIAL.
    LOOP AT it_lifnr.
      CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
        EXPORTING input  = it_lifnr-lifnr
        IMPORTING output = lv_lifnr.
      ls_range-sign = 'I'. ls_range-option = 'EQ'. ls_range-low = lv_lifnr.
      APPEND ls_range TO lr_lifnr.
    ENDLOOP.
    SELECT * FROM lfa1 INTO TABLE lt_lfa1 WHERE lifnr IN lr_lifnr.
  ELSE.
    lv_term = iv_term.
    TRANSLATE lv_term TO UPPER CASE.
    CONCATENATE '%' lv_term '%' INTO lv_pat.
    SELECT * FROM lfa1 INTO TABLE lt_lfa1 UP TO iv_max ROWS
      WHERE mcod1 LIKE lv_pat
        AND loevm = space              " not flagged for deletion
        AND sperr = space.             " no central posting block
  ENDIF.

  LOOP AT lt_lfa1 INTO ls_lfa1.
    CLEAR et_vendors.
    et_vendors-lifnr = ls_lfa1-lifnr.
    et_vendors-name1 = ls_lfa1-name1.
    SELECT SINGLE smtp_addr FROM adr6 INTO et_vendors-email
      WHERE addrnumber = ls_lfa1-adrnr AND persnumber = space.
    APPEND et_vendors.
  ENDLOOP.
