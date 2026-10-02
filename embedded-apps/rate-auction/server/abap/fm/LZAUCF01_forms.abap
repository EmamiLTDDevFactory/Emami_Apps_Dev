*&---------------------------------------------------------------------*
*& Include LZAUCF01 of function group ZAUC: helper forms used by the create modules
*&---------------------------------------------------------------------*
FORM add_msg TABLES pt_return STRUCTURE bapiret2
             USING  pv_type pv_text.
  CLEAR pt_return.
  pt_return-type    = pv_type.
  pt_return-message = pv_text.
  APPEND pt_return.
ENDFORM.

* Checks shared by info record and contract creation. PV_OK = 'X' when all pass.
FORM check_master TABLES pt_return STRUCTURE bapiret2
                  USING  pv_lifnr pv_matnr pv_ekorg pv_werks
                  CHANGING pv_ok.
  DATA: lv_lifnr TYPE lfa1-lifnr,
        lv_matnr TYPE mara-matnr,
        lv_chk   TYPE mara-matnr,
        ls_lfa1  TYPE lfa1,
        ls_lfm1  TYPE lfm1.

  pv_ok = space.
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING input = pv_lifnr IMPORTING output = lv_lifnr.
  CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
    EXPORTING input = pv_matnr IMPORTING output = lv_matnr.

  SELECT SINGLE * FROM lfa1 INTO ls_lfa1 WHERE lifnr = lv_lifnr.
  IF sy-subrc <> 0.
    PERFORM add_msg TABLES pt_return USING 'E' 'Vendor does not exist in SAP'.
    RETURN.
  ENDIF.
  IF ls_lfa1-sperr = 'X' OR ls_lfa1-loevm = 'X'.
    PERFORM add_msg TABLES pt_return USING 'E' 'Vendor is blocked or flagged for deletion'.
    RETURN.
  ENDIF.
  SELECT SINGLE * FROM lfm1 INTO ls_lfm1 WHERE lifnr = lv_lifnr AND ekorg = pv_ekorg.
  IF sy-subrc <> 0.
    PERFORM add_msg TABLES pt_return USING 'E' 'Vendor is not extended to this purchasing organization'.
    RETURN.
  ENDIF.
  SELECT SINGLE matnr FROM marc INTO lv_chk WHERE matnr = lv_matnr AND werks = pv_werks.
  IF sy-subrc <> 0.
    PERFORM add_msg TABLES pt_return USING 'E' 'Material does not exist in this plant'.
    RETURN.
  ENDIF.
  pv_ok = 'X'.
ENDFORM.
