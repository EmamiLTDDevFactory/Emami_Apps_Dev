*&---------------------------------------------------------------------*
*& Function module Z_AUC_LOAD_AUCTION
*& Attributes: Remote-Enabled Module
*& Import:  IV_AUCID TYPE ZAUC_AUCID           (optional; blank = the latest auction)
*& Export:  ES_HEADER TYPE ZAUC_S_HDR
*& Tables:  ET_VENDORS LIKE ZAUC_S_VEND
*&          ET_BIDS    LIKE ZAUC_S_BID
*&          ET_LOG     LIKE ZAUC_S_LOG
*&          ET_MAILS   LIKE ZAUC_S_MAIL
*&          ET_DOCS    LIKE ZAUC_S_DOC
*& Called once when the Node.js server starts, to rebuild the live auction.
*&---------------------------------------------------------------------*
  DATA: lv_aucid TYPE zauc_hdr-aucid,
        ls_hdr   TYPE zauc_hdr.

  CLEAR es_header.
  REFRESH: et_vendors, et_bids, et_log, et_mails, et_docs.

  lv_aucid = iv_aucid.
  IF lv_aucid IS INITIAL.
    SELECT aucid FROM zauc_hdr INTO lv_aucid UP TO 1 ROWS
      ORDER BY created_at DESCENDING.
    ENDSELECT.
  ENDIF.
  IF lv_aucid IS INITIAL.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM zauc_hdr INTO ls_hdr WHERE aucid = lv_aucid.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  MOVE-CORRESPONDING ls_hdr TO es_header.

  SELECT * FROM zauc_vend INTO CORRESPONDING FIELDS OF TABLE et_vendors WHERE aucid = lv_aucid.
  SELECT * FROM zauc_bid  INTO CORRESPONDING FIELDS OF TABLE et_bids    WHERE aucid = lv_aucid.
  SELECT * FROM zauc_log  INTO CORRESPONDING FIELDS OF TABLE et_log     WHERE aucid = lv_aucid.
  SELECT * FROM zauc_mail INTO CORRESPONDING FIELDS OF TABLE et_mails   WHERE aucid = lv_aucid.
  SELECT * FROM zauc_doc  INTO CORRESPONDING FIELDS OF TABLE et_docs    WHERE aucid = lv_aucid.
