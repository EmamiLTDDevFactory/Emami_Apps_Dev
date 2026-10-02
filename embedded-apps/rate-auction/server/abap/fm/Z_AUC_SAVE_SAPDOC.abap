*&---------------------------------------------------------------------*
*& Function module Z_AUC_SAVE_SAPDOC
*& Attributes: Remote-Enabled Module
*& Import:  IV_AUCID TYPE ZAUC_AUCID
*& Tables:  IT_DOCS LIKE ZAUC_S_DOC
*& Replaces all document rows of the auction (at most one per kind).
*&---------------------------------------------------------------------*
  DATA: ls_doc TYPE zauc_doc,
        lt_doc TYPE STANDARD TABLE OF zauc_doc.

  DELETE FROM zauc_doc WHERE aucid = iv_aucid.
  LOOP AT it_docs.
    MOVE-CORRESPONDING it_docs TO ls_doc.
    ls_doc-mandt = sy-mandt.
    APPEND ls_doc TO lt_doc.
  ENDLOOP.
  IF lt_doc IS NOT INITIAL.
    MODIFY zauc_doc FROM TABLE lt_doc.
  ENDIF.
  COMMIT WORK.
