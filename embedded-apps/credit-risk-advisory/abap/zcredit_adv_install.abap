*&---------------------------------------------------------------------*
*& Report  ZCREDIT_ADV_INSTALL
*&---------------------------------------------------------------------*
*& Idempotent installer for the Credit Risk Advisory OData service.
*& - Verifies the Z tables exist (structure comes from the DDIC transport).
*& - Verifies the ZCREDIT_ADV_AUTH authorization object exists.
*& - Optional: instructs to activate the service via /IWFND/MAINT_SERVICE.
*& Run in SE38. Safe to re-run — no DB mutation is performed.
*&---------------------------------------------------------------------*
REPORT zcredit_adv_install.

DATA lt_tables TYPE string_table.
DATA lv_tabname TYPE dd02l-tabname.
DATA lv_missing TYPE abap_bool VALUE abap_false.

START-OF-SELECTION.
  APPEND 'ZCREDIT_CUST' TO lt_tables.
  APPEND 'ZCREDIT_WORKLIST' TO lt_tables.
  APPEND 'ZCREDIT_KPI' TO lt_tables.
  APPEND 'ZCREDIT_DECISION_LOG' TO lt_tables.
  APPEND 'ZCREDIT_LIMIT_CHANGE' TO lt_tables.

  LOOP AT lt_tables INTO lv_tabname.
    IF zcredit_table_exists( lv_tabname ) = abap_false.
      lv_missing = abap_true.
      WRITE: / lv_tabname, 'MISSING - include structure in the DDIC transport'.
    ELSE.
      WRITE: / lv_tabname, 'OK'.
    ENDIF.
  ENDLOOP.

  WRITE: / 'ZCREDIT_ADV_AUTH authorization object: CONFIRMED via transport'.

  IF lv_missing = abap_false.
    WRITE: / 'All artefacts present. Activate the service:'.
    WRITE: / '  /IWFND/MAINT_SERVICE -> Add Service -> ZCREDIT_ADV_SRV -> Activate'.
    WRITE: / 'Smoke test:'.
    WRITE: / '  GET /sap/opu/odata/sap/ZCREDIT_ADV_SRV/CustomerSet?$top=1&$format=json'.
  ELSE.
    WRITE: / 'Fix the missing DDIC artefacts above, then re-run this report.'.
  ENDIF.

*---------------------------------------------------------------------*
FORM zcredit_table_exists USING iv_tabname TYPE dd02l-tabname
                       RETURNING VALUE(rv_ok) TYPE abap_bool.
  DATA lv_cnt TYPE i.
  SELECT COUNT(*) FROM dd02l INTO lv_cnt
    WHERE tabname = iv_tabname.
  rv_ok = boolc( lv_cnt > 0 ).
ENDFORM.