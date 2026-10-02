*&---------------------------------------------------------------------*
*& Function module Z_AUC_CREATE_INFOREC
*& Attributes: Remote-Enabled Module
*& Import:  IS_DATA TYPE ZAUC_S_INFOREC
*& Export:  EV_INFNR TYPE INFNR
*& Tables:  ET_RETURN LIKE BAPIRET2
*& STATUS: checks are complete. The core creation call is a TODO for the ABAP developer + MM consultant.
*&---------------------------------------------------------------------*
  DATA: lv_ok    TYPE c,
        lv_lifnr TYPE lfa1-lifnr,
        lv_matnr TYPE mara-matnr,
        lv_infnr TYPE eina-infnr.

  CLEAR ev_infnr.
  REFRESH et_return.

  PERFORM check_master TABLES et_return
    USING is_data-lifnr is_data-matnr is_data-ekorg is_data-werks
    CHANGING lv_ok.
  IF lv_ok IS INITIAL.
    RETURN.
  ENDIF.

  " duplicate: same vendor, material, purchasing org, plant
  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING input = is_data-lifnr IMPORTING output = lv_lifnr.
  CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
    EXPORTING input = is_data-matnr IMPORTING output = lv_matnr.
  SELECT SINGLE a~infnr INTO lv_infnr
    FROM eina AS a INNER JOIN eine AS e ON e~infnr = a~infnr
    WHERE a~lifnr = lv_lifnr AND a~matnr = lv_matnr AND a~loekz = space
      AND e~ekorg = is_data-ekorg AND e~werks = is_data-werks AND e~loekz = space.
  IF sy-subrc = 0.
    PERFORM add_msg TABLES et_return USING 'E' 'An info record already exists for this vendor, material and plant'.
    RETURN.
  ENDIF.

  " --- TODO (ABAP developer + MM consultant): create the info record ---
  " There is no released create BAPI for info records. Options used in practice:
  "   a) function module ME_INFORECORD_MAINTAIN_MULTI (not released: check your release and SAP's restrictions)
  "   b) IDoc INFREC (message type INFREC) through ALE inbound processing
  "   c) batch input of transaction ME11 (CALL TRANSACTION ... MODE 'N'), collecting the messages
  " The wrapper must create EINA/EINE for info record category IS_DATA-INFO_CAT, with plant data
  " (EKORG, WERKS, EKGRP, PLIFZ, MWSKZ, INCO1, ZTERM, MINBM, BPRME, PEINH) and the net price condition
  " IS_DATA-NETPR valid IS_DATA-VALID_FROM to IS_DATA-VALID_TO. Then COMMIT WORK (or ROLLBACK on error),
  " return the number in EV_INFNR and the messages in ET_RETURN.
  " Keep IS_DATA-AUC_REF as a text on the record so the document can be traced back to the auction.

  IF ev_infnr IS INITIAL.
    PERFORM add_msg TABLES et_return USING 'E' 'Info record creation is not implemented yet (see TODO)'.
  ENDIF.
