*&---------------------------------------------------------------------*
*& Report ZAUC_TEST_SAVE  (SE38)
*& Saves a test auction through the persistence function modules, loads it back,
*& and shows that a bid above the threshold is saved but flagged. No RFC, no app.
*& Tick P_CLEAN to delete the test rows afterwards.
*&---------------------------------------------------------------------*
REPORT zauc_test_save.

PARAMETERS: p_lifn1 TYPE lifnr OBLIGATORY,
            p_lifn2 TYPE lifnr OBLIGATORY,
            p_clean AS CHECKBOX DEFAULT 'X'.

CONSTANTS: c_aucid TYPE zauc_aucid VALUE 'AUC-TEST01'.

DATA: ls_hdr   TYPE zauc_s_hdr,
      lt_vend  TYPE STANDARD TABLE OF zauc_s_vend,
      ls_vend  TYPE zauc_s_vend,
      lt_bids  TYPE STANDARD TABLE OF zauc_s_bid,
      ls_bid   TYPE zauc_s_bid,
      lt_log   TYPE STANDARD TABLE OF zauc_s_log,
      ls_log   TYPE zauc_s_log,
      ls_back  TYPE zauc_s_hdr,
      lt_v2    TYPE STANDARD TABLE OF zauc_s_vend,
      lt_b2    TYPE STANDARD TABLE OF zauc_s_bid,
      ls_b2    TYPE zauc_s_bid,
      lt_l2    TYPE STANDARD TABLE OF zauc_s_log,
      lt_m2    TYPE STANDARD TABLE OF zauc_s_mail,
      lt_d2    TYPE STANDARD TABLE OF zauc_s_doc,
      lv_ts    TYPE timestampl,
      lv_ends  TYPE timestampl,
      lv_lines TYPE i.

START-OF-SELECTION.
  GET TIME STAMP FIELD lv_ts.
  lv_ends = cl_abap_tstmp=>add( tstmp = lv_ts secs = 300 ).

  " 1. header: ceiling 100, threshold 90 (highest bid allowed), decrement 1
  ls_hdr-aucid = c_aucid.   ls_hdr-title = 'Test auction'.
  ls_hdr-matnr = 'TEST-MATERIAL'. ls_hdr-matdesc = 'Test material'. ls_hdr-mtart = 'ROH'.
  ls_hdr-meins = 'KG'.      ls_hdr-unit_txt = 'Rs per kg'.
  ls_hdr-ceiling = 100.     ls_hdr-threshold = 90.   ls_hdr-decrement = 1.
  ls_hdr-status = 'live'.   ls_hdr-ends_at = lv_ends.
  ls_hdr-max_ext = 5. ls_hdr-window_s = 60. ls_hdr-extend_s = 60.

  ls_vend-aucid = c_aucid. ls_vend-vid = 'v1'. ls_vend-lifnr = p_lifn1. ls_vend-alias = 'Vendor A'. ls_vend-name = 'Test vendor 1'.
  APPEND ls_vend TO lt_vend.
  ls_vend-vid = 'v2'. ls_vend-lifnr = p_lifn2. ls_vend-alias = 'Vendor B'. ls_vend-name = 'Test vendor 2'.
  APPEND ls_vend TO lt_vend.

  CALL FUNCTION 'Z_AUC_SAVE_AUCTION'
    EXPORTING is_header = ls_hdr
    TABLES    it_vendors = lt_vend
    EXCEPTIONS invalid_input = 1 locked = 2 OTHERS = 3.
  WRITE: / 'Save auction, sy-subrc =', sy-subrc.

  " 2. a bad header must be refused: threshold above the ceiling
  ls_hdr-threshold = 150.
  CALL FUNCTION 'Z_AUC_SAVE_AUCTION'
    EXPORTING is_header = ls_hdr
    TABLES    it_vendors = lt_vend
    EXCEPTIONS invalid_input = 1 locked = 2 OTHERS = 3.
  WRITE: / 'Threshold above ceiling refused (expect 1), sy-subrc =', sy-subrc.

  " 3. two normal bids and one above the threshold
  ls_bid-aucid = c_aucid. ls_bid-bid_ts = lv_ts.
  ls_bid-bidno = 1. ls_bid-lifnr = p_lifn1. ls_bid-amount = 89. APPEND ls_bid TO lt_bids.
  ls_bid-bidno = 2. ls_bid-lifnr = p_lifn2. ls_bid-amount = 88. APPEND ls_bid TO lt_bids.
  ls_bid-bidno = 3. ls_bid-lifnr = p_lifn1. ls_bid-amount = 95. APPEND ls_bid TO lt_bids.   " above 90
  CALL FUNCTION 'Z_AUC_SAVE_BIDS'
    TABLES it_bids = lt_bids
    EXCEPTIONS auction_not_found = 1 OTHERS = 2.
  WRITE: / 'Save bids, sy-subrc =', sy-subrc.

  ls_log-aucid = c_aucid. ls_log-logno = 1. ls_log-log_ts = lv_ts. ls_log-text = 'Auction opened (test)'.
  APPEND ls_log TO lt_log.
  CALL FUNCTION 'Z_AUC_APPEND_LOG' TABLES it_log = lt_log.

  " 4. load it back
  CALL FUNCTION 'Z_AUC_LOAD_AUCTION'
    EXPORTING iv_aucid = c_aucid
    IMPORTING es_header = ls_back
    TABLES    et_vendors = lt_v2 et_bids = lt_b2 et_log = lt_l2 et_mails = lt_m2 et_docs = lt_d2.
  SKIP.
  WRITE: / 'Loaded auction', ls_back-aucid, 'threshold', ls_back-threshold, 'status', ls_back-status.
  DESCRIBE TABLE lt_v2 LINES lv_lines. WRITE: / 'Vendors:', lv_lines, '(expect 2)'.
  DESCRIBE TABLE lt_b2 LINES lv_lines. WRITE: / 'Bids:', lv_lines, '(expect 3)'.
  LOOP AT lt_b2 INTO ls_b2.
    WRITE: / '  bid', ls_b2-bidno, ls_b2-amount, 'over cap flag:', ls_b2-over_cap.
  ENDLOOP.
  WRITE: / 'Expect the flag X only on bid 3.'.

  IF p_clean = 'X'.
    DELETE FROM zauc_bid  WHERE aucid = c_aucid.
    DELETE FROM zauc_log  WHERE aucid = c_aucid.
    DELETE FROM zauc_vend WHERE aucid = c_aucid.
    DELETE FROM zauc_hdr  WHERE aucid = c_aucid.
    COMMIT WORK.
    SKIP.
    WRITE: / 'Test rows deleted.'.
  ENDIF.
