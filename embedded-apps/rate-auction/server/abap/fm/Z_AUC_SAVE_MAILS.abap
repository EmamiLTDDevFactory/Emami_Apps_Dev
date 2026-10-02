*&---------------------------------------------------------------------*
*& Function module Z_AUC_SAVE_MAILS
*& Attributes: Remote-Enabled Module
*& Tables:  IT_MAILS LIKE ZAUC_S_MAIL
*&---------------------------------------------------------------------*
  DATA: ls_mail TYPE zauc_mail,
        lt_mail TYPE STANDARD TABLE OF zauc_mail.

  LOOP AT it_mails.
    MOVE-CORRESPONDING it_mails TO ls_mail.
    ls_mail-mandt = sy-mandt.
    APPEND ls_mail TO lt_mail.
  ENDLOOP.
  IF lt_mail IS NOT INITIAL.
    MODIFY zauc_mail FROM TABLE lt_mail.
    COMMIT WORK.
  ENDIF.
