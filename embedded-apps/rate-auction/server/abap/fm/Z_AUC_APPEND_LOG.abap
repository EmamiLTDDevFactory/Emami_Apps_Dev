*&---------------------------------------------------------------------*
*& Function module Z_AUC_APPEND_LOG
*& Attributes: Remote-Enabled Module
*& Tables:  IT_LOG LIKE ZAUC_S_LOG
*&---------------------------------------------------------------------*
  DATA: ls_log TYPE zauc_log,
        lt_log TYPE STANDARD TABLE OF zauc_log.

  LOOP AT it_log.
    MOVE-CORRESPONDING it_log TO ls_log.
    ls_log-mandt = sy-mandt.
    APPEND ls_log TO lt_log.
  ENDLOOP.
  IF lt_log IS NOT INITIAL.
    MODIFY zauc_log FROM TABLE lt_log.
    COMMIT WORK.
  ENDIF.
