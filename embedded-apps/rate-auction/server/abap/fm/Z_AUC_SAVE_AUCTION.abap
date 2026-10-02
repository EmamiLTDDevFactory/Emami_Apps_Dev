*&---------------------------------------------------------------------*
*& Function module Z_AUC_SAVE_AUCTION
*& Attributes: Remote-Enabled Module
*& Import:  IS_HEADER TYPE ZAUC_S_HDR
*& Tables:  IT_VENDORS LIKE ZAUC_S_VEND
*& Exceptions: INVALID_INPUT, LOCKED
*&---------------------------------------------------------------------*
  DATA: ls_hdr  TYPE zauc_hdr,
        ls_old  TYPE zauc_hdr,
        ls_vend TYPE zauc_vend,
        lt_vend TYPE STANDARD TABLE OF zauc_vend,
        lv_ts   TYPE timestampl.

  " --- checks: the same rules the platform applies ---
  IF is_header-aucid IS INITIAL.
    RAISE invalid_input.
  ENDIF.
  " threshold = highest bid a vendor may place: above zero and not above the ceiling
  IF is_header-threshold <= 0 OR is_header-threshold > is_header-ceiling.
    RAISE invalid_input.
  ENDIF.

  CALL FUNCTION 'ENQUEUE_EZAUC_AUC'
    EXPORTING aucid = is_header-aucid
    EXCEPTIONS foreign_lock = 1 system_failure = 2 OTHERS = 3.
  IF sy-subrc <> 0.
    RAISE locked.
  ENDIF.

  GET TIME STAMP FIELD lv_ts.
  MOVE-CORRESPONDING is_header TO ls_hdr.
  ls_hdr-mandt = sy-mandt.

  SELECT SINGLE * FROM zauc_hdr INTO ls_old WHERE aucid = is_header-aucid.
  IF sy-subrc = 0.
    ls_hdr-created_by = ls_old-created_by.
    ls_hdr-created_at = ls_old-created_at.
  ELSE.
    ls_hdr-created_by = sy-uname.
    ls_hdr-created_at = lv_ts.
  ENDIF.
  ls_hdr-changed_at = lv_ts.
  MODIFY zauc_hdr FROM ls_hdr.

  DELETE FROM zauc_vend WHERE aucid = is_header-aucid.
  LOOP AT it_vendors.
    MOVE-CORRESPONDING it_vendors TO ls_vend.
    ls_vend-mandt = sy-mandt.
    APPEND ls_vend TO lt_vend.
  ENDLOOP.
  IF lt_vend IS NOT INITIAL.
    MODIFY zauc_vend FROM TABLE lt_vend.
  ENDIF.

  COMMIT WORK.
  CALL FUNCTION 'DEQUEUE_EZAUC_AUC' EXPORTING aucid = is_header-aucid.
